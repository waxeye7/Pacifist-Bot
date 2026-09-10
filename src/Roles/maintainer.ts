/**
 * A little description of this function
 * @param {Creep} creep
 **/
import { interiorMove, filterOutposts, dangerNow, interiorReady, rampartIsBuried } from "utils/Interior";
import { isSanctionedRampart, isPlannedContainer } from "utils/PlanV2";
import { cachedDerived, cachedStructures } from "utils/RoomCache";

/**
 * Stable 0..mod-1 offset from a creep name. Copied from Roles/energyMiner —
 * a bare `Game.time % N` fires for the whole roster on the same tick, which
 * turns a saving into a periodic spike; hashing the name spreads the re-scans
 * evenly across the N ticks instead.
 */
function nameOffset(name: string, mod: number): number {
    let h = 0;
    for(let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
    return h % mod;
}

/**
 * How often ONE maintainer re-walks the whole keepTheseRoads id list.
 *
 * The walk is a Game.getObjectById per id, and the list is 58-120 ids in a
 * developed room — so a maintainer paid 58-120 lookups EVERY tick to answer
 * "which road is worth walking to", against a road that decays at 100 hits per
 * 1000 ticks and a repair threshold of 500 hits below max. Nothing in that list
 * can become worth repairing inside ten ticks that was not already close to it,
 * and the creep spends most of those ten ticks walking to whatever it picked.
 * Measured shard3 (limit 20, avg 20.6): repair + maintainer 2.81 CPU over 9
 * creeps.
 */
const ROAD_WALK_EVERY = 10;

/**
 * Bank at which a maintainer stops working, and the (higher) bank at which it
 * starts again. Same floor every other subsystem in the bot calls "not poor"
 * (rooms.spawning UPGRADE_FLOOR, Empire/funnel PARK_FLOOR_MIN), with a
 * deadband so a room hovering on it does not flap the creep on and off.
 */
export const MAINT_BANK_FLOOR = 10000;
export const MAINT_BANK_RESUME = 12000;
/**
 * ...and how long a maintainer may stay parked before it gives the body back.
 *
 * Parking is right for a bank that dips: the creep costs one cheap tick and
 * comes straight back. It is wrong for a bank that is not coming back inside
 * this creep's lifetime, and the two look identical for the first few ticks.
 *
 * Live shard3 2026-09-11: E39N58 held 1,031 energy in storage � a two-source
 * room whose income is ~20/tick � and bought a 20-WORK/20-CARRY/10-MOVE
 * maintainer for 3,500 energy. The creep wrote bankParked while still inside
 * the spawn. At 20 energy a tick the room needs about 550 ticks of ENTIRE
 * income just to reach MAINT_BANK_RESUME, so that body was going to park for
 * most of its 1,500 ticks and then die of old age having taken no action.
 *
 * recycleCreep returns half the body cost, so giving up recovers ~1,750
 * energy of the 3,500. 300 ticks is a fifth of a lifetime: long enough that a
 * genuine dip (a spawn burst, one big repair) never trips it, short enough
 * that the refund is still worth having. The spawn gate now demands
 * MAINT_BANK_RESUME before buying another (rooms.spawning maintainerDemand),
 * so this cannot become a buy/recycle loop.
 */
const MAINT_PARK_GIVEUP = 300;
/**
 * ...and the hits at which the shell stops being "worn" and starts being a
 * hole.
 *
 * Deliberately WELL UNDER the towers' own peacetime target. rooms.defence
 * repairs the weakest rampart up to TOWER_SHELL_FLOOR == 3,000, so a shell the
 * towers are holding normally oscillates in a band either side of that number —
 * live E38N56 read 2,935, then 3,006, then 3,061 within a few hundred ticks.
 * A threshold sitting ON that band would toggle this creep between parked and
 * working every few ticks and never finish a repair.
 *
 * Half the tower floor is unambiguous: a rampart there means the towers are NOT
 * holding it (out of energy, or something is shooting faster than they mend),
 * and at that point the room's problem is no longer its bank.
 */
const MAINT_EMERGENCY_HITS = 1500;

/**
 * Exported so the SPAWN side can ask the same question the PARK side asks.
 * Two gates that must agree are two gates that drift; see
 * test/unit/maintainerParkAtBirth.
 */
export function shellIsBreached(room: any): boolean {
    return cachedDerived(room, "maintShellBreach", () => {
        for(const s of cachedStructures(room) as any[]) {
            if(s.structureType === STRUCTURE_RAMPART && s.my && (s.hits || 0) < MAINT_EMERGENCY_HITS) {
                return true;
            }
        }
        return false;
    });
}

const run = function (creep) {
    ;
    creep.memory.moving = false;

    if(creep.holdForFlee()) {
        return;
    }

    if(creep.memory.suicide) {
        creep.recycle();
        return;
    }
    if(creep.evacuate()) {
		return;
	}
    if(creep.memory.targetRoom && creep.room.name !== creep.memory.targetRoom) {
        creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    /*
     * ── A MAINTAINER MUST NOT DRINK A POOR ROOM DRY ───────────────────────
     *
     * This role had no bank discipline of any kind. It did not need one while
     * every maintainer rung sat behind optionalRosterOpen(), because a 5,000
     * bucket was standing in as an affordability test — and when the survival
     * escape was added to those rungs (a rampart at the tower floor, a
     * container near death) that stand-in went with it.
     *
     * Live shard3 2026-09-11: E38N56 was already running at about -35 energy a
     * tick with a 12-WORK upgrader and a 10-WORK repairer against two sources,
     * and the escape handed it a 13-WORK maintainer on top — a 1,950 energy
     * body that then burns 13 a tick. Storage went 9,998 -> 1,758 and the shell
     * minimum it was bought to fix moved 2,935 -> 3,061, which is the TOWERS'
     * decay floor, not the maintainer.
     *
     * PARK, DO NOT RECYCLE. The bank crossing a floor is a passing condition in
     * a healthy room, and the CLF next door already answers it this way (see
     * Roles/ControllerLinkFiller bankParked). A parked maintainer costs one
     * cheap tick and comes straight back the moment the room can pay; a
     * recycled one has to be bought again at full price.
     *
     * The downgrade-style escape is the shell being genuinely breached rather
     * than merely worn: under MAINT_EMERGENCY_HITS a rampart is one tower
     * outage from gone and the room's problem is no longer its bank.
     */
    const bank = creep.room.storage && creep.room.storage.my
        ? creep.room.storage.store[RESOURCE_ENERGY] : null;
    if(bank !== null && bank < (creep.memory.bankParked ? MAINT_BANK_RESUME : MAINT_BANK_FLOOR)
        && !shellIsBreached(creep.room)) {
        if(!creep.memory._parkedT) creep.memory._parkedT = Game.time;
        // GIVE THE BODY BACK rather than park out a whole lifetime. See
        // MAINT_PARK_GIVEUP.
        if(Game.time - creep.memory._parkedT > MAINT_PARK_GIVEUP) {
            creep.memory.suicide = true;
            creep.recycle();
            return;
        }
        creep.memory.bankParked = true;
        creep.idlePark();
        return;
    }
    if(creep.memory.bankParked) delete creep.memory.bankParked;
    if(creep.memory._parkedT) delete creep.memory._parkedT;

    if(creep.memory.repairing && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.repairing = false;
    }
    if(!creep.memory.repairing && creep.store.getFreeCapacity() == 0) {
        creep.memory.repairing = true;
    }

    let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
    if(!storage) {
        const S = creep.room.memory.Structures || {};
        storage = Game.getObjectById(S.bin) || Game.getObjectById(S.storage);
    }
    if(!storage) {
        const boxes = creep.room.find(FIND_STRUCTURES, {filter: (s:any) =>
            s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0});
        if(boxes.length) storage = creep.pos.findClosestByRange(boxes);
    }


    if(creep.memory.repairing) {
        let buildingsToRepair = [];
        let roadIds = creep.room.memory.keepTheseRoads || [];
        // Resolved ONCE and reused by the walk gate, the hub clip and the
        // outpost defer below; it used to be asked twice per tick per creep.
        const danger = dangerNow(creep.room);

        // THE FULL LIST IS WALKED EVERY ROAD_WALK_EVERY TICKS, NOT EVERY TICK.
        //
        // Between walks the creep carries ONE id — the road it was closest to
        // when it last looked — and validates it with a single getObjectById.
        // While that road is alive and still damaged it is the whole road half
        // of the target list, which is what the creep was walking to anyway.
        // The moment it dies (decayed away, replanned) or reaches full hp (we
        // just finished repairing it) the walk is forced immediately, so the
        // throttle can never leave a maintainer idle in front of a broken road.
        //
        // ...and NEVER under danger. The clip below drops everything further
        // than 10 from the hub, so a single cached target that happens to sit
        // outside that ring would empty the list — and an empty list in a room
        // this module has no interior geometry for sets suicide. Raids are rare
        // and are not where the 17.55 CPU is; walk the whole list then.
        //
        // The offset is hashed off the creep NAME so a room's maintainers do
        // not all re-walk on the same tick — see nameOffset above.
        let walkRoads = danger || (Game.time + nameOffset(creep.name, ROAD_WALK_EVERY)) % ROAD_WALK_EVERY == 0;
        if(!walkRoads) {
            let held:any = creep.memory._roadTarget ? Game.getObjectById(creep.memory._roadTarget) : null;
            if(held && held.hits <= held.hitsMax - 500) {
                buildingsToRepair.push(held);
            }
            else {
                delete creep.memory._roadTarget;
                walkRoads = true;
            }
        }
        if(walkRoads) {
            // keepTheseRoads never drops dead ids; prune as we walk or
            // maintainers keep scanning ghosts forever
            let liveRoadIds = [];
            let closestRoad:any = null;
            let closestRange = Infinity;
            for(let i = 0; i < roadIds.length; i++) {
                let road:any = Game.getObjectById(roadIds[i]);
                if(!road) continue;
                liveRoadIds.push(roadIds[i]);
                if(road.hits <= road.hitsMax - 500) {
                    buildingsToRepair.push(road);
                    let range = creep.pos.getRangeTo(road);
                    if(range < closestRange) {
                        closestRange = range;
                        closestRoad = road;
                    }
                }
            }
            if(liveRoadIds.length !== roadIds.length) {
                creep.room.memory.keepTheseRoads = liveRoadIds;
            }
            // what the mover below would have picked out of the road half, kept
            // so the next nine ticks need one lookup instead of a hundred
            if(closestRoad) {
                creep.memory._roadTarget = closestRoad.id;
            }
            else {
                delete creep.memory._roadTarget;
            }
        }

        /*
         * EVERY CONTAINER THE PLAN WANTS, AT EVERY LEVEL.
         *
         * This used to narrow to the hub BIN ALONE from RCL7 — and no other
         * role covers the difference: Roles/repair excludes containers outright
         * from RCL6 (see its three RCL6+ filters), builders only build sites,
         * and the miner merely stands on its box. So from the tick a room hit
         * RCL7 its SOURCE containers had nothing repairing them.
         *
         * A container in an owned room decays 5,000 hits per 500 ticks — 10 a
         * tick against a 250,000 max — so it dies in 25,000 ticks, and a dead
         * source container means the miner drop-mines onto the floor where the
         * pile decays at 1/1000 per tick. Live shard3 E37N59 is RCL7 with a
         * four-container plan and ZERO containers standing.
         *
         * The upkeep is negligible and always was: 10 hits/tick at REPAIR_COST
         * 0.01 is 0.1 energy/tick per container, 0.4 for a whole plan.
         *
         * Plan membership, not a range test, so a box left over from an old
         * layout still decays away — that is the thing the RCL7 narrowing was
         * actually reaching for. A room with no adopted plan keeps the old
         * take-everything behaviour, which is correct for a room whose layout
         * nothing has an opinion about yet.
         */
        // Memoised per room per tick, like Roles/filler fillCandidates and
        // Roles/carry carryCandidates. The first cut of this fix used a bare
        // `creep.room.find(FIND_STRUCTURES, ...)` — the widest find in the game
        // — on every maintainer on every tick, and measured live it took the
        // role from 0.43 CPU per creep to 1.24. The whole point of the fix is
        // 0.1 energy/tick of container upkeep; paying 0.8 CPU for it is not a
        // trade worth making on a 20-CPU shard.
        //
        // The bin id and the plan are both room-level, so the filtered answer
        // is a room/tick constant — nothing here varies per creep.
        const containers = cachedDerived(creep.room, "maintainerContainers", () => {
            const all = cachedStructures(creep.room)
                .filter((s:any) => s.structureType == STRUCTURE_CONTAINER);
            if (!creep.room.memory.planV2) return all;
            const bin = creep.room.memory.Structures && creep.room.memory.Structures.bin;
            return all.filter((s:any) => s.id === bin || isPlannedContainer(creep.room, s.pos));
        });

        if(containers.length > 0) {
            for(let container of containers) {
                if(container.hits <= container.hitsMax - 500) {
                    buildingsToRepair.push(container);
                }
            }
        }

        // Only ramparts the room's plan / perimeter actually sanctions. Without
        // this the list is "every rampart under 500k", which in a plan-v2 room
        // means the abandoned off-plan ramparts of the old square stamp get
        // nursed forever and can never decay away. See PlanV2
        // sanctionedRampartKeys.
        //
        // Sanctioned is not sufficient: a sanctioned rampart the enclosure
        // trades left BURIED (depth >= 4 behind the final wall, out of ranged
        // reach from every standable exterior tile) is upkeep on a tile nothing
        // can shoot. See utils/Interior rampartIsBuried.
        if(!creep.memory.rampartsToRepair) {
            let rampartsInRoom = creep.room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART && s.hits < 500000 && (!creep.room.storage || creep.room.storage.pos.getRangeTo(s) >= 9) && isSanctionedRampart(creep.room, s.pos) && !rampartIsBuried(creep.room, s.pos)});
            let idsOfRamparts = [];
            for(let rampart of rampartsInRoom) {
                idsOfRamparts.push(rampart.id);
            }
            creep.memory.rampartsToRepair = idsOfRamparts;
        }

        let rampartsIDS = creep.memory.rampartsToRepair;
        if(rampartsIDS.length > 0) {
            for(let rampart of rampartsIDS) {
                let rampObj:any = Game.getObjectById(rampart);
                // re-checked at use, not just at build: the list is cached in
                // creep memory for the creep's whole life, so a creep that
                // locked its list before the room adopted a plan must not keep
                // feeding off-plan ramparts for another 1500 ticks
                if(rampObj && rampObj.hits <= 50000 && isSanctionedRampart(creep.room, rampObj.pos) && !rampartIsBuried(creep.room, rampObj.pos)) {
                    buildingsToRepair.push(rampObj);
                }
            }
        }

        // Clip to the hub only while hostiles are actually here. danger_timer
        // decays for many ticks after the raid; sit-tight is keyed off
        // dangerNow, so a trailing clip emptied the list and they suicided
        // instead of going back to outpost roads.
        if(danger && storage) {
            buildingsToRepair = buildingsToRepair.filter(function(b) {return storage.pos.getRangeTo(b) <= 10;});
        }

        // Outpost work is DEFERRED, not abandoned: the maintainer's whole
        // target list is roads and containers, most of which are the source /
        // controller / mineral lines OUTSIDE the min-cut shell. While the room
        // is under attack those are dropped, and — critically — an empty list
        // for that reason must NOT set suicide, or every siege would recycle
        // the room's maintainers and leave the roads to decay afterwards.
        const outposted = interiorReady(creep.room) && danger;
        if (outposted) buildingsToRepair = filterOutposts(creep.room, buildingsToRepair);

        if(buildingsToRepair.length > 0) {
            let closeByBuildings = creep.pos.findInRange(buildingsToRepair, 3);
            if(closeByBuildings.length > 0) {
                creep.repair(closeByBuildings[closeByBuildings.length - 1])
                if(closeByBuildings[closeByBuildings.length - 1].hits !== closeByBuildings[closeByBuildings.length - 1].hitsMax) {
                    const t = closeByBuildings[closeByBuildings.length - 1];
                    if (!interiorMove(creep, t, 1)) creep.MoveCostMatrixRoadPrio(t, 1)
                }
                else {
                    if (!interiorMove(creep, closeByBuildings[0], 0)) creep.MoveCostMatrixRoadPrio(closeByBuildings[0], 0)
                }
            }
            else {
                const t = creep.pos.findClosestByRange(buildingsToRepair);
                if (!interiorMove(creep, t, 3)) creep.MoveCostMatrixRoadPrio(t, 3)
            }
        }
        else if (outposted) {
            // nothing left inside the wall to fix — sit tight behind it
            if (storage && !creep.pos.isNearTo(storage)) {
                if (!interiorMove(creep, storage, 1)) creep.MoveCostMatrixRoadPrio(storage, 1)
            }
        }
        else {
            creep.memory.suicide = true;
        }

    }
    else if(storage) {
        if(creep.pos.isNearTo(storage)) {
            // withdrawStorage owns the floor/cap. A bare withdraw emptied
            // the bank reserved for fillers.
            creep.withdrawStorage(storage);
        }
        else {
            if (!interiorMove(creep, storage, 1)) creep.MoveCostMatrixRoadPrio(storage, 1)
        }
    }


}

const roleMaintainer = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleMaintainer;
