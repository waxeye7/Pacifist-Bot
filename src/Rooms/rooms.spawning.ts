import construction from "./rooms.construction";
import { remoteIsHot, markRemoteHot } from "./rooms.remotes";
import { remotesDisabled } from "utils/Speedrun";
import { chargeBoostSlot, refundBoostOwner, renameBoostOwner } from "./rooms.labs";
import { rampartHitsTarget } from "./rooms.defence";
import { logAlways } from "utils/Logger";

/**
 * Boostable stock is storage + TERMINAL.
 *
 * Every boost gate below read `storage.store[X]` only, and rooms.market buys
 * into the TERMINAL — so a room that had just paid market rate for 3,000 XLH2O
 * still queued its creep unboosted, and kept buying. Same rule rooms.labs uses
 * for its reaction chain (its local `storeOf`, which is not exported).
 */
function boostStock(room, res): number {
    const s = room.storage;
    const t = room.terminal;
    return ((s && s.store[res]) || 0) + ((t && t.store[res]) || 0);
}

/**
 * Home sources/spawn come first. Remotes wait until the bank and miners exist.
 *
 * "Miners exist" has to mean ONE PER LOCAL SOURCE, not a flat two. A room with
 * a single source can never reach two home miners, so a flat `< 2` marked it
 * starved forever — and `remotesAllowed` does not merely skip remotes when this
 * is true, it walks room.memory.resources and sets every remote's `active` to
 * false. VPS W2N1 and W1N2 are both one-source RCL7 rooms: every remote off,
 * storage pinned at 0, therefore never reaching the 5000 that would have let
 * them out. The room that most needs remote income was the one guaranteed
 * never to get it.
 */
function homeEconomyStarved(room: any): boolean {
    const storageE = room.storage && room.storage.my ? room.storage.store[RESOURCE_ENERGY] || 0 : 0;
    if (storageE >= 5000) return false;
    let homeMiners = 0;
    for (const cn in Game.creeps) {
        const c = Game.creeps[cn];
        if (!c.memory || c.memory.role !== "EnergyMiner") continue;
        if (c.memory.homeRoom === room.name && (!c.memory.targetRoom || c.memory.targetRoom === room.name)) {
            homeMiners++;
        }
    }
    const localSources = room.find(FIND_SOURCES).length;
    // Home sources unstaffed is the real "not ready for remotes" signal.
    if (homeMiners < Math.min(2, localSources)) return true;

    /*
     * The `energyAvailable < 300` clause below is a BOOTSTRAP test — "this room
     * cannot even buy a basic creep yet" — and it only means that in a room
     * whose capacity is close to 300, i.e. one that has not built a storage.
     *
     * Applied to an established room it is actively harmful. energyAvailable is
     * the instantaneous extension fill, so any room that is spending dips under
     * 300 routinely; and this predicate does not merely skip remote work when
     * it is true, it makes `remotesAllowed` false, which walks
     * room.memory.resources and sets EVERY remote's `active` to false. Closing
     * a remote recalls its whole crew (see rooms.remotes/remoteRecalled) and
     * reopening it costs a re-scout — so one unlucky tick tears down the remote
     * fleet of a room that was working perfectly.
     *
     * Live VPS W2N1: RCL7, capacity 4300, ONE local source, storage 0, caught
     * at 56 energy mid-spawn. Every one of its seven candidate remotes was
     * force-closed — and a single-source RCL7 has no route out of poverty that
     * does not go through remotes.
     */
    if (room.storage && room.storage.my) return false;
    return room.energyAvailable < 300;
}

/**
 * Neighbor haul when a room's towers/spawn are dry after an invader.
 * Live E37N59: 50-part Invader sat on the spawn, towers at 0/4 energy,
 * storage 0, no civilians — spawn could not even hatch a 100e filler.
 */
function offerEmergencyFeed(fromRoom: any): void {
    if (!fromRoom.controller || !fromRoom.controller.my) return;
    if (fromRoom.memory.danger) return;
    if (!fromRoom.storage || (fromRoom.storage.store[RESOURCE_ENERGY] || 0) < 2000) return;
    if (fromRoom.energyAvailable < 300) return;
    if (queuedWithPrefix(fromRoom, "Feed-")) return;
    const exits = Game.map.describeExits(fromRoom.name);
    if (!exits) return;
    for (const dir in exits) {
        const n = exits[dir];
        const dest = Game.rooms[n];
        if (!dest || !dest.controller || !dest.controller.my) continue;
        if (!dest.find(FIND_MY_SPAWNS).length) continue;
        const noCivilians =
            dest.find(FIND_MY_CREEPS, {
                filter: (c: any) => c.memory.role === "filler" || c.memory.role === "carry",
            }).length === 0;
        const wrecked =
            dest.memory.danger ||
            (dest.memory as any).blown_fuse ||
            dest.energyAvailable < 200 ||
            noCivilians;
        if (!wrecked) continue;
        const towers: any[] = dest.find(FIND_MY_STRUCTURES, {
            filter: (s: any) => s.structureType === STRUCTURE_TOWER,
        });
        let towerE = 0;
        for (const t of towers) towerE += t.store[RESOURCE_ENERGY] || 0;
        if (towers.length && towerE >= 400 && dest.energyAvailable >= 300) continue;
        let sending = 0;
        for (const cn in Game.creeps) {
            const c = Game.creeps[cn];
            if (c.memory && c.memory.emergencyFeed === n) sending++;
        }
        if (sending >= 2) continue;
        const name = "Feed-" + n + "-" + Game.time;
        fromRoom.memory.spawn_list.unshift(
            [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE],
            name,
            { memory: { role: "carry", homeRoom: n, targetRoom: n, emergencyFeed: n } },
        );
        logAlways(`emergency feed ${n} from ${fromRoom.name}`);
        return;
    }
}

/**
 * ---------------------------------------------------------------------------
 * A BROKE ROOM MAY ONLY BUY ITS OWN RECOVERY.
 *
 * The queue is FIFO with no priority — `unshift` to jump, `push` to append —
 * so whatever reaches the head blocks everything behind it until it hatches or
 * is shredded, which is SHRED_STALLED_HEAD_AFTER (60) ticks per entry at best.
 *
 * That is survivable while the entries are economy creeps, because hatching one
 * is what ends the shortage. It is not survivable when they are not. Live
 * shard3 E37N59 (RCL6, storage at 0, both towers dry, 24 of 37 extensions
 * empty, refilling at ~7 energy/tick) held an 1800-energy Maintainer, two
 * 1400-energy RemoteRepairers and a 7000-energy ranged quad AHEAD of the
 * fillers and miners that were the only things able to refill it: 11,600
 * energy of queue in front of a room earning seven.
 *
 * The interleave rung below spawns AROUND a stuck head, but only one creep per
 * 40 ticks and only once the head has stalled 40 — far too slow to dig out from
 * under seven military bodies. So when a room is demonstrably broke, offence
 * and other non-recovery spend is dropped outright rather than timed out one
 * entry at a time.
 *
 * Nothing is lost by dropping: every producer re-derives its demand from the
 * live creep census on its next pass, so anything still wanted is re-queued as
 * soon as the room can pay for it. A room under attack is exempt entirely —
 * there, defenders ARE the essential spend.
 * ---------------------------------------------------------------------------
 */

/**
 * Roles a broke room stops buying. Deliberately a DENY list, not an allow list:
 * an unrecognised role keeps its place in the queue, so adding a role elsewhere
 * in the bot can never silently make it undroppable-but-starving here.
 *
 * Everything on it is offence, expansion or remote upkeep — all worth doing
 * from a solvent room, none of it worth doing instead of eating.
 */
const NON_RECOVERY_ROLES: { [role: string]: boolean } = {
    SquadCreepA: true, SquadCreepB: true, SquadCreepY: true, SquadCreepZ: true,
    DuoCreepA: true, DuoCreepB: true, CCKparty: true, FreedomFighter: true,
    CCK: true, WallClearer: true, Guard: true, attacker: true,
    RangedAttacker: true, healer: true, Dismantler: true, RemoteDismantler: true,
    DismantleControllerWalls: true, ram: true, DrainTower: true, annoy: true,
    CreepKiller: true, Solomon: true, Priest: true, goblin: true, mosquito: true,
    Signifer: true, Sign: true, RoomLocker: true, Escort: true, claimer: true,
    SneakyControllerUpgrader: true, Convoy: true, clearer: true, billtong: true,
    SpecialRepair: true, SpecialCarry: true, RemoteRepair: true,
    // Rampart crews are defence, but this whole pass is skipped while
    // room.memory.danger is set, so reaching here means nothing is attacking.
    RampartDefender: true, RRD: true, RampartErector: true, rampartUpgrader: true,
};

/**
 * Broke = no bank to fall back on AND the extension network is running on
 * fumes. Both halves matter: a room mid-spawn-cycle dips low on
 * `energyAvailable` every time it buys something, and a room with a full bank
 * is never broke however empty its extensions happen to read this tick.
 */
/** Ticks between spawn-triage log lines for one room. */
const TRIAGE_LOG_EVERY = 100;

function roomIsBroke(room: any): boolean {
    if (room.memory.danger) return false;
    const storage = room.storage && room.storage.my ? room.storage : null;
    if (storage && (storage.store[RESOURCE_ENERGY] || 0) >= 5000) return false;
    const terminal = room.terminal && room.terminal.my ? room.terminal : null;
    if (terminal && (terminal.store[RESOURCE_ENERGY] || 0) >= 5000) return false;
    return room.energyAvailable < room.energyCapacityAvailable * 0.5;
}

function dropNonRecoverySpend(room: any): void {
    const list = room.memory.spawn_list;
    if (!list || list.length < 3) return;
    if (!roomIsBroke(room)) return;

    const dropped: string[] = [];
    for (let i = 0; i + 2 < list.length; i += 3) {
        const opts = list[i + 2];
        const role = opts && opts.memory ? opts.memory.role : undefined;
        if (!role || !NON_RECOVERY_ROLES[role]) continue;
        refundBoostOwner(room, list[i + 1]);
        dropped.push(role);
        list.splice(i, 3);
        i -= 3;
    }
    // One summary line, not one per entry — and at most one per TRIAGE_LOG_EVERY
    // ticks per room. A room that stays broke has its producer re-queue the same
    // roles every cadence window and this pass drops them again each time, so an
    // unthrottled logAlways here becomes its own console flood on exactly the
    // room someone is trying to read the console about. The heartbeat in main.ts
    // reports persistently broke rooms anyway; this line only needs to say that
    // triage is happening and what it is throwing away.
    if (dropped.length) {
        const last = (room.memory as any)._triageLog || 0;
        if (Game.time - last >= TRIAGE_LOG_EVERY) {
            (room.memory as any)._triageLog = Game.time;
            logAlways(`spawn triage ${room.name}: dropped ${dropped.length} non-recovery `
                + `(${dropped.join(",")}) - broke at ${room.energyAvailable}/${room.energyCapacityAvailable}`);
        }
    }
    // The head may have changed underneath the stall bookkeeping. spawnFirstInLine
    // re-keys on the name anyway, but clearing here means the shrink/interleave
    // rungs judge the NEW head from zero rather than inheriting the old count.
    if (dropped.length) {
        room.memory.spawnStall = 0;
        delete room.memory.spawnStallName;
    }
}

function spawning(room: any) {
    // NO `if(Game.cpu.bucket < 1000) return;` HERE. It used to sit above
    // everything, including the emergency-filler rescue in spawnFirstInLine —
    // the only thing that un-starves a room with zero fillers — and a bucket
    // crash and a starved spawn are correlated, so the guard switched the cure
    // off in exactly the situation that needs it. The guard now sits just above
    // the queue/producer work (see below), with the rescue in front of it.

    // Cold start / freshly claimed room: the structure cache has not been built
    // yet (rooms.ts + roomFunctions.ts are what normally seed it), so
    // room.memory.Structures is undefined and every `room.memory.Structures.X`
    // read below - plus the WRITES done by room.findSpawn()/findStorage() and
    // the `delete room.memory.Structures.spawn` a few lines down - throw a
    // TypeError and take the whole spawn loop out for that room. Every function
    // in this file is reached through here, so seeding the object once at the
    // entry point makes the single-level reads downstream safe. Nested reads
    // (e.g. `.towers.length`) still need their own guard.
    if(!room.memory.Structures) {
        room.memory.Structures = {};
    }

    if(!room.memory.spawn_list) {
        room.memory.spawn_list = [];
    }

    offerEmergencyFeed(room);

    // Same cold-start problem, different object: rooms.ts calls spawning(room)
    // BEFORE data(room), and data() is the only initialiser of room.memory.data
    // — so on the first tick of a freshly claimed room `room.memory.data.DOB`
    // (the Priest rung, the RCL1 sweeper rung) and `room.memory.data.c_spawned++`
    // (spawnFirstInLine, three sites) threw. Fields and initial values copied
    // from rooms.data.ts, which still owns the per-tick increments.
    if(!room.memory.data) {
        room.memory.data = {DOB: 0, DOBug: 0, c_spawned: 0};
    }

    // Remotes-off A/B: drop already-queued remote miners/carriers/reservists
    // so the flag stops spawn this tick, not after leftover queue hatches.
    // Same strip when the home room is broke — otherwise the producer
    // re-queues remotes every 15t and they hatch before the home crew.
    if((remotesDisabled() || homeEconomyStarved(room)) && room.memory.spawn_list.length) {
        const q = room.memory.spawn_list;
        const next = [];
        forEachQueued(room, function(body, name, opts) {
            const mem = opts && opts.memory;
            const role = mem && mem.role;
            const tgt = mem && mem.targetRoom;
            if(tgt && tgt !== room.name && (role === "EnergyMiner" || role === "carry" || role === "reserve")) {
                return;
            }
            next.push(body, name, opts);
        });
        if(next.length !== q.length) room.memory.spawn_list = next;
    }

    if(!room.memory.lastTimeSpawnUsed || room.memory.lastTimeSpawnUsed == 0) {
        room.memory.lastTimeSpawnUsed = Game.time;
    }

    if(Game.time % 100 == 0 && Game.time - room.memory.lastTimeSpawnUsed > 1200) {
        room.memory.spawn_list = [];
    }

    let spawn: any = Game.getObjectById(room.memory.Structures.spawn)
    if(spawn && spawn.spawning && spawn.spawning.remainingTime == 1 && room.memory.spawn_list.length == 0) {
        room.memory.lastTimeSpawnUsed = Game.time;
    }


    spawn = Game.getObjectById(room.memory.Structures.spawn) || room.findSpawn();

    if(spawn == undefined) {
        delete room.memory.Structures.spawn;
        return;
    }

    if(room.controller.level >= 7 && spawn && spawn.effects && spawn.effects.length > 0 && room.memory.danger && room.memory.danger_timer > 30) {
        if(!room.memory.ram_coming) {
            for(let effect of spawn.effects) {
                if(effect.effect === PWR_DISRUPT_SPAWN) {
                    let spawns = room.find(FIND_MY_SPAWNS);
                    let allSpawnsDisrupted = true;
                    for(let spawn of spawns) {
                        allSpawnsDisrupted = false;
                        if(spawn.effects && spawn.effects.length > 0) {
                            for(let effect of spawn.effects) {
                                if(effect.effect === PWR_DISRUPT_SPAWN) {
                                    allSpawnsDisrupted = true;
                                }
                            }
                        }
                        if(!allSpawnsDisrupted) {
                            break;
                        }
                    }
                    if(allSpawnsDisrupted) {
                        // Exclude self: an RCL8 under disrupt is in myRooms at
                        // distance 0 and would SDB itself. No other RCL8 → leave
                        // ram_coming unset so we retry when one exists.
                        let myRooms = _.filter(Game.rooms, (r) => r.controller && r.controller.my && r.controller.level === 8 && r.name !== room.name);
                        if(myRooms.length) {
                            let closestRoom = myRooms[0];
                            let closestRoomDistance = Game.map.getRoomLinearDistance(room.name, closestRoom.name);
                            for(let myRoom of myRooms) {
                                let distance = Game.map.getRoomLinearDistance(room.name, myRoom.name);
                                if(distance < closestRoomDistance) {
                                    closestRoom = myRoom;
                                    closestRoomDistance = distance;
                                }
                            }
                            global.SDB(closestRoom.name, room.name, true);
                            room.memory.ram_coming = true;
                            return;
                        }
                    }
                }
            }
        }

    }
    else {
        if(room.memory.ram_coming) {
            delete room.memory.ram_coming;
        }
    }


    if(spawn.spawning) {
        spawn = room.findSpawn();
        if(spawn == undefined) {
            return;
        }
        else {
            room.memory.lastTimeSpawnUsed = Game.time;
        }
    }

    // CPU guard. It used to be the very first line of this function, which also
    // switched off the emergency-filler rescue below — and that rescue is the
    // only path that puts a hauler back into a room with zero fillers. It costs
    // a handful of ops (two role counts and at most one spawnCreep), so it runs
    // whatever the bucket says; the queue walk and the producer, which are the
    // expensive halves, stay skipped exactly as before.
    if(Game.cpu.bucket < 1000) {
        emergencyFillerRescue(room, spawn);
        return;
    }

    // Before the head gets its claim on the spawn: if the room cannot feed
    // itself, take offence and remote upkeep out of the queue entirely.
    dropNonRecoverySpend(room);

    let status = spawnFirstInLine(room, spawn);
    if(status == "spawning") {
        return;
    }

    if(room.memory.spawn_list.length == 0 && Game.time - room.memory.lastTimeSpawnUsed == 2 ||
        !room.memory.danger && room.memory.spawn_list.length == 0 && (Game.time - room.memory.lastTimeSpawnUsed) % 35 == 0 && room.controller.level >= 6 ||
        !room.memory.danger && room.memory.spawn_list.length == 0 && (Game.time - room.memory.lastTimeSpawnUsed) % 20 == 0 && room.controller.level <= 5 ||
        // Absolute clock for the same reason as the danger arm below: a busy
        // primary stamps lastTimeSpawnUsed every tick, and the relative %500
        // fired every tick in multi-spawn rooms, flooding the queue with
        // census-only rungs (Builder) while a pricey head starved.
        !room.memory.danger && room.memory.spawn_list.length >= 1 && Game.time % 500 == 0 ||
        room.memory.danger && (Game.time - room.memory.lastTimeSpawnUsed) % 7 == 0 && room.memory.spawn_list.length == 0 ||
        // Danger used to require an empty queue, so a stuck head blocked every
        // RampartDefender/RRD for the siege. Re-run every 15 ticks. Gate on
        // absolute Game.time: a busy primary spawn writes lastTimeSpawnUsed =
        // Game.time every tick, so (Game.time - lastTimeSpawnUsed) % 15 == 0
        // was true every tick and flooded the 24-cap queue. Rungs with a
        // named prefix skip if that prefix is already queued.
        room.memory.danger && room.memory.spawn_list.length >= 1 && Game.time % 15 == 0) {

            add_creeps_to_spawn_list(room, spawn);
            clampSpawnListToCapacity(room);
    }


}

/**
 * Nothing may sit in the queue that the room could never build.
 *
 * Most producers size their bodies off room.energyCapacityAvailable, so a body
 * that is over capacity means the room shrank (extensions destroyed, downgrade)
 * or a producer guessed wrong. The -6 handling in spawnFirstInLine already
 * throws such a body away, but only once it has reached the HEAD - until then
 * it is dead weight everything behind it has to wait for. Catching it at queue
 * time keeps the queue to things the room can at least eventually pay for.
 *
 * Clamping trims from the tail rather than dropping outright, because a smaller
 * creep of the right role now beats the right creep never; the last MOVE is
 * never trimmed, and a body that cannot be trimmed into budget while staying a
 * useful creep is dropped. Both paths log.
 */
function clampSpawnListToCapacity(room) {
    // ---- length cap ------------------------------------------------------
    //
    // The queue is a short list of what to build next, not a ledger. Nothing
    // ever bounded it, and the producers push unconditionally — they never ask
    // whether the same creep is already queued — so a room whose head is stuck
    // grows the list forever. Live pacifist2 E18S3: 836 entries, built out of
    // 291 Sweepers, 264 Builders, 113 Scouts, 73 Maintainers and 54
    // RampartErectors, while the head (a 1500-energy EnergyMiner) answered
    // ERR_NOT_ENOUGH_ENERGY against 1204 available for 220 ticks straight.
    //
    // Nothing is lost by throwing the tail away: every producer re-derives its
    // demand from the live creep census on the next pass, so a genuinely
    // needed creep is re-queued within one cadence window, while an entry from
    // tens of thousands of ticks ago is describing a room that no longer
    // exists. The bloat is not free either — this function walks the whole
    // list and sums every body on every producer pass.
    //
    // Trim from the TAIL: the front of the queue is where urgency lives
    // (defenders and emergency fillers `unshift`).
    if(room.memory.spawn_list.length > MAX_SPAWN_QUEUE * 3) {
        let dropped = room.memory.spawn_list.length / 3 - MAX_SPAWN_QUEUE;
        room.memory.spawn_list.length = MAX_SPAWN_QUEUE * 3;
        console.log("spawn queue in", room.name, "capped at", MAX_SPAWN_QUEUE,
            "- dropped", Math.floor(dropped), "stale entries from the tail");
    }

    let hardCap = room.energyCapacityAvailable;
    // What the room can actually PAY right now: the bank plus whatever is
    // already sitting in the spawn and extensions. energyCapacityAvailable is
    // only what it could pay ONCE THE EXTENSIONS ARE FULL, and filling them
    // takes income.
    let clampStorage:any = Game.getObjectById(room.memory.Structures && room.memory.Structures.storage);
    let payable = room.energyAvailable
        + (clampStorage && clampStorage.store ? (clampStorage.store[RESOURCE_ENERGY] || 0) : 0);
    for(let i = 0; i + 2 < room.memory.spawn_list.length; i += 3) {
        let body:string[] = room.memory.spawn_list[i];
        if(!body || !body.length) continue;
        let name:string = room.memory.spawn_list[i+1];

        // 85% of 550 is 467 and strips a WORK off the home 550 [5W,M].
        // Cycle-14 hatched 4W so WORK>=5 never counted. Wait for full cap.
        if(name && name.startsWith("EnergyMiner") && hardCap >= 550 && body.length === 6) {
            let homeMem:any = room.memory.spawn_list[i+2];
            homeMem = homeMem && homeMem.memory;
            if((!homeMem || !homeMem.targetRoom || homeMem.targetRoom === room.name)
                && bodyCost(body) === 550
                && _.filter(body, (p:any) => p === WORK).length === 5
                && _.filter(body, (p:any) => p === MOVE).length === 1) {
                continue;
            }
        }

        // ROUTINE creeps are budgeted at 85% of capacity, not 100%. A body
        // priced at exactly energyCapacityAvailable is only ever buyable in a
        // room whose extension network is 100% topped up - and a room that is
        // spending on creeps basically never is, so such a body answers -6
        // forever and (before the interleave rung) held the whole queue behind
        // it. Live E17S4: RCL5, capacity 1800, spawnrules[5].maintain_creep is
        // 12 WORK + 8 MOVE + 4 CARRY = exactly 1800. Military bodies keep the
        // full capacity budget: they are sized deliberately for a fight and a
        // shrunk war creep is worse than a late one.
        let budget = isRoutineSpawn(name) ? Math.floor(hardCap * 0.85) : hardCap;
        // 4W+C+M is 500; 85% of RCL2's 550 is 467 and would strip a WORK.
        // Early rooms wait for one empty extension. The 100%-of-cap HOL this
        // 85% exists for is an RCL5+ maintainer, not a 500-energy upgrader.
        if(name && name.startsWith("Upgrader") && hardCap <= 550) {
            budget = hardCap;
        }
        // BOOTSTRAP budget. Everything above assumes the room can eventually
        // fill its extensions - but filling them is exactly what a miner pays
        // for, so an UNWORKED source plus an empty bank is a body the room can
        // never buy. It then queues an RCL6-sized 1500 energy miner, sits at
        // ~200 energy forever, and the generic relief rungs cannot save it: the
        // shrink rung in spawnFirstInLine walks the body down one part per 40
        // ticks but only while the spawn reads idle, and every CREEP_LIFE_TIME
        // the producer unshifts a fresh full-size miner in front of the one it
        // had nearly finished shrinking. Live E11S2: RCL6, storage 0, container
        // empty, 2 fillers + 1 EnergyManager and nothing else, controller
        // frozen, for hours.
        //
        // So a miner/carrier for a source that has NOBODY on it, in a room whose
        // bank cannot cover the ideal body, is priced at what the room can
        // actually pay - a 250 energy miner mining now beats a 1500 energy miner
        // that never hatches, and the next one is sized normally the moment the
        // bank recovers. Sources that are already staffed keep their full body
        // (they are a throughput upgrade, not a rescue), and so does everything
        // else in the queue: a bootstrap-sized war creep or upgrader is a
        // donation, not a creep.
        if(name && (name.startsWith("EnergyMiner") || name.startsWith("Carrier")) && payable < bodyCost(body)) {
            let opts:any = room.memory.spawn_list[i+2];
            let sourceId = opts && opts.memory ? opts.memory.sourceId : undefined;
            let wantedRole = name.startsWith("EnergyMiner") ? 'EnergyMiner' : 'carry';
            // "FakeFiller" is a carrier mid-dropoff at home (see carry.ts)
            if(sourceId && !_.some(creepsForSource(sourceId), (creep:any) =>
                creep.memory.role == wantedRole
                    || (wantedRole == 'carry' && creep.memory.role == 'FakeFiller'))) {
                budget = Math.min(budget, Math.max(payable, SPAWN_ENERGY_CAPACITY));
            }
        }

        // The same argument, generalised past miners and carriers.
        //
        // The clause above rescues the specific case of an unworked source, but
        // a broke room's problem is rarely one empty source — it is that EVERY
        // routine body is priced off a capacity it cannot fill. Live E37N59
        // (RCL6, capacity 2150, holding 872, storage 0, 2000 energy sitting in a
        // FULL source container it had no hauler big enough to move) would queue
        // a 1827-energy filler, answer ERR_NOT_ENOUGH_ENERGY for 40 ticks, then
        // let the shrink rung walk it down one part per 40 ticks — roughly 360
        // ticks to reach something buyable, with the room getting poorer
        // throughout.
        //
        // While the room is broke, price routine bodies at what it can actually
        // pay. A 600-energy filler moving that container NOW is worth more than
        // the ideal filler six hundred ticks from now, and the moment
        // roomIsBroke() clears — bank over 5k, or extensions past half — sizing
        // goes straight back to the 85% budget. Non-routine bodies are excluded
        // for the reason the clause above gives: half a war creep is a donation.
        //
        // Deliberately limited to rooms that HAVE a storage, i.e. established
        // rooms that have collapsed. A pre-storage room reads "broke" as a
        // matter of course — that is just what RCL1-3 looks like — and its body
        // sizing is the thing docs/EARLY-GAME-SPEEDRUN-CAMPAIGN.md measures
        // against a frozen control. This fix has no business moving that number.
        if(isRoutineSpawn(name) && room.storage && room.storage.my && roomIsBroke(room)) {
            budget = Math.min(budget, Math.max(payable, SPAWN_ENERGY_CAPACITY));
        }

        let cost = bodyCost(body);
        if(cost <= budget) continue;

        let originalLength = body.length;
        let originalCost = cost;
        let shrunk = body.slice();
        let clampOpts:any = room.memory.spawn_list[i+2];
        while(cost > budget && shrinkQueuedBody(shrunk, name, clampOpts)) {
            cost = bodyCost(shrunk);
        }

        // Over the SOFT cap is never fatal - an 88% body still spawns, it just
        // takes a fuller room - so only a body still over the HARD cap gets
        // thrown away. A body that only just missed (a miner sized for a
        // capacity the room lost) is worth shrinking; one that needs a third of
        // itself cut off is a boosted war creep queued by a Command against the
        // wrong room - half of one of those is not a creep, it is a donation,
        // so it gets dropped exactly like the head rung in spawnFirstInLine
        // drops it.
        if(cost > hardCap || shrunk.length < 2 || !_.some(shrunk, (part:any) => part != MOVE)
            || (originalCost > hardCap && shrunk.length < originalLength * 0.7)) {
            console.log("dropping", name, "from spawn list:", originalCost, "energy body does not fit capacity", hardCap, "in", room.name);
            refundBoostOwner(room, name);
            room.memory.spawn_list.splice(i, 3);
            i -= 3;
            continue;
        }
        if(shrunk.length !== originalLength) {
            room.memory.spawn_list[i] = shrunk;
            console.log("clamped", name, "from", originalCost, "to", cost, "energy to fit budget", budget, "of capacity", hardCap, "in", room.name);
        }
    }
}

function bodyCost(body:string[]):number {
    return _.sum(body, (part:any) => BODYPART_COST[part]);
}

/**
 * Names of the economy roles this room re-queues on its own every cycle. These
 * are the ones that must always stay buyable; everything else (war creeps,
 * squads, boosted specialists) is deliberately sized and gets the full budget.
 */
const ROUTINE_SPAWN_PREFIXES = ["Filler", "filler", "EmergencyFiller", "emergencyFILLER",
    "Builder", "Upgrader", "Repair", "Maintainer", "EnergyManager", "Carrier",
    "EnergyMiner", "MineralMiner", "Sweeper", "Reserver", "RemoteRepair", "Scout",
    "ContainerBuilder", "SneakyControllerUpgrader"];

/**
 * How many consecutive ERR_NOT_ENOUGH_ENERGY ticks a queue head has to answer
 * before it is thrown away. Must sit ABOVE the shrink and interleave rungs
 * (both keyed on spawnStall > 40) so those get to try first — dropping the
 * head earlier than they fire makes them unreachable.
 */
const SHRED_STALLED_HEAD_AFTER = 60;

/**
 * Most entries the queue may hold. A healthy commune sits at 0-2; the biggest
 * legitimate burst is a full roster refresh (miners per source, carriers per
 * remote, a reserver or two), which is well under this.
 */
const MAX_SPAWN_QUEUE = 24;

/**
 * Minimum ticks between two head-of-line interleaves in one room. Interleaving
 * spends the energy the stalled head is waiting for, so it has to be rare
 * enough that the head still gets there. RCL1-3 uses INTERLEAVE_EVERY_RCL1_3
 * for both the consecutive -6 bar and this cooldown (a 500e head used to idle
 * a full cheap creep at 40).
 */
const INTERLEAVE_EVERY = 40;
const INTERLEAVE_EVERY_RCL1_3 = 10;

function isRoutineSpawn(name:string):boolean {
    if(!name) return false;
    return _.some(ROUTINE_SPAWN_PREFIXES, (prefix:any) => name.startsWith(prefix));
}

/**
 * Take ONE part off a queued body while keeping it a creep that can still do
 * its job, and return whether anything was removed.
 *
 * This replaces `spawn_list[0].shift()`, which stripped parts off the FRONT of
 * the array: a miner queued as [WORK,WORK,WORK,WORK,WORK,MOVE,MOVE] shrank into
 * [WORK,MOVE,MOVE] and then into [MOVE,MOVE] - a 100 energy creep with no WORK
 * that walks to a source and stares at it. A reserver ([CLAIM,MOVE] x N) lost
 * its CLAIM the same way.
 *
 * The body is rebuilt from part COUNTS rather than spliced, so the result keeps
 * a sane part order (WORK first so it survives damage longest, MOVE last) no
 * matter what order the producer emitted.
 */
function shrinkQueuedBody(body:string[], name:string, opts?:any):boolean {
    if(!body || body.length <= 2) return false;

    let counts = {};
    for(let part of body) {
        counts[part] = (counts[part] || 0) + 1;
    }
    let moves = counts[MOVE] || 0;
    let others = body.length - moves;

    if(name && name.startsWith("Reserver")) {
        // [CLAIM,MOVE] x N. Drop a whole pair off the end.
        //
        // The floor is TWO CLAIM, not one. reserveController() adds +1 tick per
        // CLAIM part while the reservation decays 1 tick/tick, so a ONE-CLAIM
        // reserver is exactly net zero: it can hold a reservation still while it
        // stands there and can never grow one, and it loses ground for every
        // tick of the walk out. Measured live before this floor was raised:
        // average reservation ticksToEnd was 1.0 across every remote in the
        // empire, with ~25% of ticks having no reservation at all — 650 energy
        // and a spawn slot per creep for nothing.
        //
        // Below two CLAIM the entry just waits for energy (reservers are
        // deliberately exempt from the clear rungs), which is strictly better
        // than spawning a creep that provably cannot do its job.
        if((counts[CLAIM] || 0) <= 2) return false;
        counts[CLAIM] --;
        if(moves > 1) counts[MOVE] --;
    }
    else if(name && name.startsWith("EnergyMiner")) {
        // A miner is WORK-heavy on purpose; the WORK parts past the first two
        // are the expendable ones. 3 parts is the floor - 2 WORK + 1 MOVE still
        // mines 4 energy/tick, anything less is not worth the walk.
        //
        // The LAST CARRY is kept though: in an RCL6+ room with 3+ links the
        // miner delivers into a link, and that whole path is written in terms of
        // store.getFreeCapacity(), which a CARRY-less body reports as 0 (see the
        // comment at the top of Roles/energyMiner.ts). Such a miner still works
        // now - it falls back to drop-mining - but a miner that can fill a
        // container or a link is worth much more than one that drops on the
        // floor for a hauler to chase, and one CARRY only costs 50.
        //
        // Boosted miners (UO harvest) dump 6e/WORK/tick. 1 CARRY is 50, so
        // capacity < WORK*6 forever and harvest never fires (R6.54). Keep 2.
        if(body.length <= 3) return false;
        const boostedMiner = !!(opts && opts.memory && opts.memory.boostlabs);
        const minCarry = boostedMiner ? 2 : 1;
        if((counts[CARRY] || 0) > minCarry) counts[CARRY] --;
        else if(moves > 1 && moves > Math.ceil(others / 2)) counts[MOVE] --;
        else if((counts[WORK] || 0) > 2) counts[WORK] --;
        else if(moves > 1) counts[MOVE] --;
        else return false;
    }
    else {
        // Generic: shed whatever is most over-provisioned, so the body shrinks
        // in PROPORTION instead of losing one part type entirely. MOVE beyond
        // one per two other parts is road-speed padding and goes first; CARRY
        // only while there is still more than one CARRY per three WORK (a 12
        // WORK maintainer with a single CARRY empties itself in half a tick),
        // otherwise WORK.
        if(moves > 1 && moves > Math.ceil(others / 2)) counts[MOVE] --;
        else if((counts[CARRY] || 0) > 1 && (counts[CARRY] || 0) * 3 > (counts[WORK] || 0)) counts[CARRY] --;
        else if((counts[WORK] || 0) > 1) counts[WORK] --;
        else if((counts[CARRY] || 0) > 1) counts[CARRY] --;
        else {
            let shed = null;
            for(let part of [TOUGH, RANGED_ATTACK, ATTACK, HEAL, CARRY, WORK]) {
                if((counts[part] || 0) > 0) { shed = part; break; }
            }
            if(shed && body.length - moves > 1) counts[shed] --;
            else if(moves > 1) counts[MOVE] --;
            else return false;
        }
    }

    let rebuilt:string[] = [];
    for(let part of [TOUGH, WORK, CARRY, CLAIM, ATTACK, RANGED_ATTACK, HEAL, MOVE]) {
        for(let n = 0; n < (counts[part] || 0); n++) {
            rebuilt.push(part);
        }
    }
    // never hand back something that cannot move or has nothing but MOVE
    if(rebuilt.length < 2
        || !_.some(rebuilt, (part:any) => part == MOVE)
        || !_.some(rebuilt, (part:any) => part != MOVE)) {
        return false;
    }

    body.length = 0;
    for(let part of rebuilt) {
        body.push(part);
    }
    return true;
}


/**
 * Bootstrap [C,C,M]/[C,M] haulers are never replaced by the roster: once one
 * is live, homeCarriersWanted is sized off the PROPOSED full body and a single
 * 150e shuttle can satisfy want==1 forever (R6.21). Recycle them the moment
 * a real body is affordable.
 *
 * "Tiny" is measured against WHAT THE ROOM WOULD BUILD RIGHT NOW, not against a
 * fixed 2-CARRY / 200-energy bar. getCarrierBody floors CARRY at 2
 * (`Math.max(2, ...)`), so on a short, roaded home source it legitimately
 * returns [2C,1M] (150e) or [2C,2M] (200e) — and the flat bar then suicided
 * every one of those the tick it hatched, so the room spawned and killed the
 * same carrier forever. Only a body strictly smaller than the current sizing
 * (or one with fewer than 2 CARRY, which nothing sizes any more) is a leftover.
 */
function recycleTinyCarriers(room): void {
    if(!room.controller || room.energyCapacityAvailable < 550) return;
    const storage = room.storage || Game.getObjectById(room.memory.Structures?.storage) || room.findStorage();
    const spawn = Game.getObjectById(room.memory.Structures?.spawn);
    const homeEnergy = _.get(room.memory, ['resources', room.name, 'energy']) || {};
    const haulers = creepsWithRole("carry").concat(creepsWithRole("FakeFiller"));
    for(const c of haulers) {
        // (the old first test here was subsumed by this one except when
        // homeRoom is undefined, where it let the creep through by accident)
        if(c.room.name !== room.name && c.memory.homeRoom !== room.name) continue;
        const carry = c.getActiveBodyparts(CARRY) || 0;
        if(carry > 2) continue;
        let cost = 0;
        for(let i = 0; i < c.body.length; i++) cost += BODYPART_COST[c.body[i].type] || 0;
        if(cost > 200) continue;
        if(carry >= 2) {
            const values = c.memory.sourceId ? homeEnergy[c.memory.sourceId] : undefined;
            // Unknown source, or a body we cannot price right now: leave it be.
            if(!values) continue;
            const want = getCarrierBody(c.memory.sourceId, values, storage, spawn, room);
            let wantCarry = 0;
            for(let i = 0; i < want.length; i++) if(want[i] === CARRY) wantCarry++;
            if(carry >= wantCarry) continue;
        }
        c.memory.suicide = true;
    }
}

function add_creeps_to_spawn_list(room, spawn) {
    // One grouped pass over Game.creeps for this whole producer pass; every
    // per-source / per-role lookup below reads it instead of rescanning.
    refreshCreepIndex();
    recycleTinyCarriers(room);

    let EnergyMiners = 0;
    let EnergyMinersInRoom = 0;

    let carriers = 0;
    let carriersInRoom = 0;

    let RampartErectors = 0;

    let reservers = 0;

    let EnergyManagers = 0;

    let MineralMiners = 0;

    let builders = 0;
    let upgraders = 0;
    let fillers = 0;

    let repairers = 0;
    let maintainers = 0;

    let defenders = 0;

    let RemoteRepairers = 0;

    let scouts = 0;

    // EMPIRE-WIDE ON PURPOSE. Memory.target_colonise is a single global target
    // and only the closest funded room queues the claimer, so two claimers is
    // two GCL-slot races for one room. Every other counter here is per-room.
    let claimers = 0;

    let attackers = 0;
    let RangedAttackers = 0;

    let containerbuilders = 0;

    let healers = 0;

    let sweepers = 0;

    let clearers = 0;

    let billtongs = 0;

    let RampartDefenders = 0;
    let RangedRampartDefenders = 0;

    let Signers = 0;
    let Priests = 0;

    let SpecialRepairers = 0;
    let SpecialCarriers = 0;

    let SneakyControllerUpgraders = 0;

    let SafeModers = 0;

    let ControllerLinkFillers = 0;

    _.forEach(Game.creeps, function(creep) {
        // console.log(creep.memory.role)
        switch(creep.memory.role) {

            case "EnergyMiner":
                if(isInRoom(creep, room)) {
                    EnergyMinersInRoom ++;
                    EnergyMiners ++;
                    break;
                }
                // not in room: fall through to the plain count
                EnergyMiners ++;
                break;

            // carry.ts flips a carrier to "FakeFiller" while it drops its load at
            // home and flips it back on empty. It is still a carrier for every
            // roster purpose, so it must be counted as one — otherwise the room
            // reads carriers=0 every time its haulers are home and re-queues them.
            case "FakeFiller":
            case "carry":
                if(isInRoom(creep, room)) {
                    carriersInRoom ++;
                    carriers ++;
                    break;
                }
                // not in room: fall through to the plain count
                carriers ++;
                break;

            case "reserve":
                reservers ++;
                break;

            // Was never counted at all, which is why the gate below could stack
            // 4-5 of them (16 CARRY / 4 MOVE, ~1,200 energy each) in one room.
            case "ControllerLinkFiller":
                if(isInRoom(creep, room)) {
                    ControllerLinkFillers ++;
                }
                break;

            case "RemoteRepair":
                RemoteRepairers ++;
                break;

            // The cases below count a creep only while it stands in this room.
            // They used to put the break INSIDE the isInRoom branch and nothing
            // after it, so a creep that was NOT in the room fell through every
            // following case BODY (fall-through ignores the case labels) until
            // something broke - for this chain that was the scout counter, so
            // an out-of-room repairer/maintainer/defender with homeRoom set
            // read as a scout. The break belongs after the if, unconditionally:
            // out-of-room creeps count as nothing, same as ControllerLinkFiller
            // above. (EnergyMiner/carry up top keep their internal breaks on
            // purpose - their fall-through is within the same case, to a plain
            // count for out-of-room creeps.)
            case "EnergyManager":
                if(isInRoom(creep, room)) {
                    EnergyManagers ++;
                }
                break;

            case "MineralMiner":
                if(isInRoom(creep, room)) {
                    MineralMiners ++;
                }
                break;

            case "builder":
                if(isInRoom(creep, room)) {
                    builders ++;
                }
                break;

            case "upgrader":
                if(isInRoom(creep, room) && !creep.memory.suicide) {
                    upgraders ++;
                }
                break;

            case "filler":
                if(isInRoom(creep, room)) {
                    fillers ++;
                }
                break;

            case "repair":
                if(isInRoom(creep, room)) {
                    repairers ++;
                }
                break;

            case "maintainer":
                if(isInRoom(creep, room)) {
                    maintainers ++;
                }
                break;

            case "defender":
                if(isInRoom(creep, room)) {
                    defenders ++;
                }
                break;

            case "RampartDefender":
                if(isInRoom(creep, room)) {
                    RampartDefenders ++;
                }
                break;

            case "RRD":
                if(isInRoom(creep, room)) {
                    RangedRampartDefenders ++;
                }
                break;


            case "scout":
                if(creep.memory.homeRoom == room.name) {
                    scouts ++;
                }
                break;

            case "claimer":
                claimers ++;
                break;

            case "attacker":
                if(creep.memory.homeRoom == room.name) {
                    attackers ++;
                }
                break;

            case "billtong":
                if(creep.memory.homeRoom == room.name) {
                    billtongs ++;
                }
                break;

            case "RangedAttacker":
                if(creep.memory.homeRoom == room.name) {
                    RangedAttackers ++;
                }
                break;

            case "buildcontainer":
                if(creep.memory.homeRoom == room.name) {
                    containerbuilders ++;
                }
                break;

            // Had no break at all, so EVERY RampartErector - in the room or
            // not - also ran the next case body and counted as a
            // SneakyControllerUpgrader, and the sneaky gate below spawned that
            // many fewer real ones.
            case "RampartErector":
                if(isInRoom(creep, room)) {
                    RampartErectors ++;
                }
                break;

            // These three were tallied across the WHOLE EMPIRE and then read as
            // per-room caps ("healers < 1", "clearers < 1", "SCU < 1"), so one
            // healer anywhere meant no room could ever build a second, and one
            // SCU blocked every other commune's keepAfloat rescue. Same fix the
            // reservers count already got: scope them to this commune.
            case "SneakyControllerUpgrader":
                if(creep.memory.homeRoom == room.name) {
                    SneakyControllerUpgraders ++;
                }
                break;

            case "healer":
                if(creep.memory.homeRoom == room.name || isInRoom(creep, room)) {
                    healers ++;
                }
                break;

            case "clearer":
                if(creep.memory.homeRoom == room.name || isInRoom(creep, room)) {
                    clearers ++;
                }
                break;

            case "sweeper":
                if(isInRoom(creep, room)) {
                    sweepers ++;
                }
                break;

            case "Sign":
                if(creep.memory.homeRoom == room.name) {
                    Signers ++;
                }
                break;

            case "Priest":
                if(creep.memory.homeRoom == room.name) {
                    Priests ++;
                }
                break;


            case "SpecialRepair":
                if(isInRoom(creep, room)) {
                    SpecialRepairers ++;
                }
                break;

            case "SpecialCarry":
                if(isInRoom(creep, room)) {
                    SpecialCarriers ++;
                }
                break;

            case "SafeModer":
                if(isInRoom(creep, room)) {
                    SafeModers ++;
                }
                break;
        }

    });

    /*
     * QUEUED ENTRIES COUNT TOWARD THE CENSUS.
     *
     * Every producer rung below compares `live < want` and pushes, and this
     * whole pass re-fires every 500 ticks while the head is still busy (see
     * the cadence conditions in spawning()). Without this second walk a room
     * whose head is slow double-books every role it wants: live E37N59 held
     * MineralMiner x2 and Sweeper x2 on the list, and spawnFirstInLine never
     * re-checks demand at the head, so both would hatch.
     *
     * ONLY the roles whose rungs do NOT already dedup are listed here. Roles
     * guarded by queuedWithPrefix() (maintainer, RampartDefender, RRD, clearer,
     * Sign, Priest, SpecialRepair, SpecialCarry, RampartErector), by
     * queuedForSource() (EnergyMiner, carry), or by their own forEachQueued
     * scan (reserve, RemoteRepair, buildcontainer) are deliberately absent —
     * counting them twice would under-spawn.
     *
     * `repair` IS listed even though the RCL4-8 rungs call
     * queuedWithPrefix('Repair-'): the RCL2/RCL3 rungs and the nuke-repair rung
     * do not, and the prefix test is strictly the stronger of the two wherever
     * both apply.
     *
     * Home-room roles only: a triple with `targetRoom` pointing somewhere else
     * is a remote/colonise body governed by its own per-source / per-remote
     * bookkeeping, so it is skipped.
     */
    forEachQueued(room, function(body, name, opts) {
        const mem = opts && opts.memory;
        if(!mem || !mem.role) return;
        if(mem.targetRoom && mem.targetRoom !== room.name) return;
        switch(mem.role) {
            case "MineralMiner":        MineralMiners ++;        break;
            case "sweeper":             sweepers ++;             break;
            case "upgrader":            upgraders ++;            break;
            case "builder":             builders ++;             break;
            case "filler":              fillers ++;              break;
            case "repair":              repairers ++;            break;
            case "EnergyManager":       EnergyManagers ++;       break;
            case "ControllerLinkFiller":ControllerLinkFillers ++;break;
            case "SafeModer":           SafeModers ++;           break;
            case "healer":              healers ++;              break;
            // Only the RCL<3 safe-mode DirtClearer sets targetRoom == room.name
            // and it has no queue check of its own; the remote raid attackers
            // are filtered out by the targetRoom guard above.
            case "attacker":            attackers ++;            break;
        }
    });


    console.log("Room-" + room.name + " has " + builders + " Builders " + upgraders +
    " Upgraders " + repairers + " Repairers " + fillers
    + " Filler", EnergyManagers, "EnergyManager", sweepers, "Sweeper");
    console.log("[" + EnergyMiners + " Energy-Miners]" + " [" + carriers +
    " Carriers] [" +  RemoteRepairers, "RemoteRepairers] [" + reservers + " Reservers] " + "[" + attackers + " Attackers]" + " [" + RangedAttackers +  " RangedAttackers]" + " [" + containerbuilders +  " Container Builders]" + " [" + claimers +  " Claimers]");


    // The ONE construction-site find for this pass. `constructionSitesAmount`
    // below used to re-run the identical find into a second variable.
    let sites = room.find(FIND_MY_CONSTRUCTION_SITES);

    // Prefer the room's REAL storage. room.memory.Structures.storage is a
    // cache that is never re-pointed, so a room that built its storage AFTER
    // the hub container still had the CONTAINER's id in there — and a
    // container caps at 2000, so every `storage.store[RESOURCE_ENERGY] > N`
    // gate below (builders, repairers, upgraders, the colonise claimer) read
    // 2000 while the room actually sat on 937k (live E11S5, RCL4, zero
    // upgraders). findStorage() stays as the pre-storage fallback.
    let storage = room.storage || Game.getObjectById(room.memory.Structures?.storage) || room.findStorage();

    let resourceData = _.get(room.memory, ['resources']);




    /*
     * LAZY PER RCL. This literal was rebuilt in full on every producer pass,
     * for all eight levels, in every room — so an RCL8 commune ran
     * hasControllerDepot() three times (each one a full
     * room.find(FIND_STRUCTURES) plus a pos.findInRange(sources,1) per
     * container) and six getBody() calls for rungs it can never read.
     *
     * The rule CONTENTS are unchanged; each level is now a thunk, built on
     * first touch and memoised, and reached through the same `spawnrules[N]`
     * expression as before — so the cross-level reads (RCL7/8 borrow
     * spawnrules[6].filler_creep) and the in-place mutations
     * (`spawnrules[8].repair_creep.amount = 4`) behave exactly as they did.
     */
    const spawnrulesDefs: any = {

        1: () => ({

            upgrade_creep: {

                amount: 1,
                body:   getBody([WORK,CARRY,CARRY,MOVE], room),

            },

            build_creep: {

                amount: 6,
                body:   earlyBuilderBody(room),

            },

            filler_creep: {

                amount: 1,
                body:   [CARRY,MOVE],

            },

        }),

        2: () => ({

            upgrade_creep: {

                // cycle-4 KEEP: RCL4 29181 vs 30851 (−1670, 8/8). Stay 4
                // during slam so the five ext still finish.
                amount: room.energyCapacityAvailable >= 550 ? 6 : 4,
                // No controller depot until RCL3. [4W,C,M] is 3 ticks/tile
                // (5 non-MOVE / 1 MOVE) and a 50-energy tank — ~0.5 e/t
                // delivered on a 15-tile shuttle, not 4. [2W,2C,2M] walks
                // and holds 100, ~1 e/t each.
                body:   shuttleUpgraderBody(room),

            },

            build_creep: {

                amount: 4,
                body:   earlyBuilderBody(room),

            },

            repair_creep: {

                amount: 1,
                body:   [WORK,CARRY,MOVE],

            },

            filler_creep: {

                amount: 1,
                body:   [CARRY,MOVE],

            },



        }),

        3: () => ({
            build_creep: {

                amount: 6,
                body:   earlyBuilderBody(room),

            },
            upgrade_creep: {

                amount: 4,
                // Parked 4W only pays once the controller container exists.
                // Until then this is the same shuttle as RCL2 — builders
                // finish that depot before leftover extensions.
                body:   hasControllerDepot(room)
                    ? parkedUpgraderBody(room)
                    : shuttleUpgraderBody(room),

            },

            filler_creep: {

                amount: 1,
                body:   [CARRY,MOVE],

            },
            repair_creep: {

                amount: 1,
                // 1W covers container decay (50 hits/t). getBody stacked this
                // to [2W,2C,2M] at 550 and [3W,3C,3M] at 800 — 400–600e HOL
                // in front of the parked 4W. Roads are not paved first.
                body:   [WORK, CARRY, MOVE],

            },
            maintain_creep: {

                amount: 1,
                body:[WORK,WORK,WORK,WORK,
                    MOVE,MOVE,
                    CARRY,CARRY,CARRY,CARRY],

            },

        }),

        4: () => ({
            build_creep: {

                amount: 3,
                // [W,3C,M] is 4 ticks/tile on dirt and getBody stacks it to
                // 600–1050e, HOL-blocking the 550e parked upgrader (R6.18).
                // earlyBuilderBody until the depot exists and the bank is real.
                body:   (hasControllerDepot(room) && room.storage)
                    ? getBody([WORK,CARRY,CARRY,CARRY,MOVE], room, 50)
                    : earlyBuilderBody(room),

            },
            upgrade_creep: {

                amount: 5,
                // Parked 8W2C2M only pays once the controller container exists.
                // Until then this is the same shuttle as RCL3 — otherwise the
                // body is 4 ticks/tile with a 100-energy tank.
                body:   hasControllerDepot(room)
                    ? getBody([WORK,WORK,WORK,WORK,CARRY,MOVE], room, 50)
                    : shuttleUpgraderBody(room),

            },

            filler_creep: {

                amount: 2,
                /*
                 * 1:1, not 2:1. [4C,2M] is road speed, and an RCL4 room has not
                 * paved its extension ring yet — E36N57 has ONE road — so a
                 * loaded shuttle moved at 2 ticks/tile and the ten extensions
                 * stayed at zero while 11.8k rotted on the floor. 400e for 200
                 * carry at full speed is the cheapest fix; fillersWanted now
                 * actually lets the roster reach `amount` in a storage-less room.
                 */
                body:   [CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE],

            },
            repair_creep: {

                amount: 1,
                body:   getBody([WORK,CARRY,MOVE], room, 50),

            },
            maintain_creep: {

                amount: 1,
                body:[WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY],

            },
        }),

        5: () => ({
            build_creep: {

                amount: 4,
                body:   getBody([WORK,CARRY,CARRY,CARRY,MOVE], room, 50),

            },
            upgrade_creep: {

                amount: 5,
                body:   getBody([WORK,WORK,WORK,WORK,CARRY,MOVE], room, 50),

            },
            filler_creep: {

                amount: 1,
                body:   [CARRY,CARRY,CARRY,CARRY,MOVE,MOVE],

            },
            repair_creep: {

                amount: 1,
                body:   getBody([WORK,CARRY,MOVE], room, 50),

            },
            maintain_creep: {

                amount: 1,
                body:[WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,
                    MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                    CARRY,CARRY,CARRY,CARRY],

            },

        }),

        6: () => ({
            build_creep: {

                amount: 3,
                body:   getBody([WORK,WORK,CARRY,CARRY,MOVE], room, 50),

            },
            upgrade_creep: {

                // BASE of the banded ladder (upgraderTarget), not a fixed
                // roster: >=30k banked buys 3, >=120k buys 4, below 30k the
                // ladder itself cuts back to 1-2. It was 1, with the only rung
                // that could raise it gated on `storage > 400000` — a number an
                // RCL6 room never reaches. 3x12W is 36 energy/tick, which is
                // what a 2-source RCL6 commune can actually feed.
                amount: 3,
                // [12W,3C,3M] at 2200 capacity (getBody's 85% budget, 3
                // segments). 1500e amortised over 1500 ticks is 1 e/tick of
                // overhead for 12 e/tick of upgrade.
                body:   getBody([WORK,WORK,WORK,WORK,CARRY,MOVE], room, 50),

            },

            filler_creep: {

                amount: 1,
                body:   [CARRY,CARRY,CARRY,CARRY,MOVE,MOVE],

            },

            energy_manager_creep: {

                amount: 1,
                body:   [CARRY,CARRY,CARRY,CARRY,MOVE,MOVE],

            },

            repair_creep: {

                amount: 4,
                body:   [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,
                        CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,
                        MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE],

            },

            maintain_creep: {

                amount: 1,
                body:   [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,
                    MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                    CARRY,CARRY,CARRY,CARRY,CARRY,CARRY],

            },
        }),

        7: () => ({
            build_creep: {

                amount: 2,
                body:   getBody([WORK,WORK,CARRY,CARRY,MOVE], room, 50),

            },
            upgrade_creep: {

                // BASE of the banded ladder, same as RCL6 — see the note there.
                amount: 3,
                // 12W3C3M (1500e), same floor body RCL6 runs - the hardcoded
                // [4W,2C,M] cut upgrade rate to 1/3 the moment a room crossed
                // 6->7 with a sub-surplus bank. maxLength 18 pins it at three
                // segments; an uncapped getBody at RCL7 capacity would stack
                // to 32W and HOL-block this very rung.
                body:   getBody([WORK,WORK,WORK,WORK,CARRY,MOVE], room, 18),

            },

            upgrade_creep_spend: {

                amount: 3,
                body:   [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE],

            },

            filler_creep: {

                amount: 1,
                body:   [CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE],

            },


            energy_manager_creep: {

                amount: 1,
                body:   [CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE],

            },

            repair_creep: {

                amount: 1,
                body:   [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,
                         WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,
                         WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,
                         MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                         CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY],

            },

            maintain_creep: {

                amount: 1,
                body:   [WORK,WORK,WORK,WORK,WORK,
                         WORK,WORK,WORK,WORK,WORK,
                         WORK,WORK,WORK,WORK,WORK,
                         WORK,WORK,WORK,WORK,WORK,
                         MOVE,MOVE,MOVE,MOVE,MOVE,
                         MOVE,MOVE,MOVE,MOVE,MOVE,
                         CARRY,CARRY,CARRY,CARRY,CARRY,
                         CARRY,CARRY,CARRY,CARRY,CARRY,
                         CARRY,CARRY,CARRY,CARRY,CARRY,
                         CARRY,CARRY,CARRY,CARRY,CARRY],

            },
        }),

        8: () => ({
            build_creep: {

                amount: 2,
                body:   getBody([WORK,WORK,CARRY,CARRY,MOVE], room, 50),

            },

            upgrade_creep: {

                amount: 1,
                body:   [WORK,CARRY,CARRY,CARRY,MOVE],

            },

            filler_creep: {

                amount: 1,
                body:   [CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE],

            },

            energy_manager_creep: {

                amount: 1,
                body:   [CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE],

            },

            repair_creep: {

                amount: 2,
                body:   [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,
                         WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,
                         CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,
                         MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                         CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY],

            },

            maintain_creep: {

                amount: 1,
                body:   [WORK,WORK,WORK,WORK,WORK,
                         WORK,WORK,WORK,WORK,WORK,
                         WORK,WORK,WORK,WORK,WORK,
                         WORK,WORK,WORK,WORK,WORK,
                         MOVE,MOVE,MOVE,MOVE,MOVE,
                         MOVE,MOVE,MOVE,MOVE,MOVE,
                         CARRY,CARRY,CARRY,CARRY,CARRY,
                         CARRY,CARRY,CARRY,CARRY,CARRY,
                         CARRY,CARRY,CARRY,CARRY,CARRY,
                         CARRY,CARRY,CARRY,CARRY,CARRY],

            },
        })

    };

    // One memoised object per level, reached through the same `spawnrules[N]`
    // expression the whole producer already uses — so the in-place mutations
    // below (repair_creep.amount, build_creep.amount, repair_creep.body) still
    // land on the object every later read sees.
    const spawnrulesBuilt: any = {};
    const spawnrules: any = {};
    for(const lvl in spawnrulesDefs) {
        Object.defineProperty(spawnrules, lvl, {
            configurable: true,
            enumerable: true,
            get: (function(l) {
                return function() {
                    if(!spawnrulesBuilt[l]) spawnrulesBuilt[l] = spawnrulesDefs[l]();
                    return spawnrulesBuilt[l];
                };
            })(lvl),
        });
    }

    if(room.controller.level < 3 && room.controller.safeMode && attackers < 1) {
        let enemyCreepsInRoom = room.find(FIND_HOSTILE_CREEPS);
        if(enemyCreepsInRoom.length > 0) {
            let name = 'DirtClearer-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([ATTACK,MOVE], name, {memory: {role: 'attacker', targetRoom: room.name, homeRoom: room.name}});
            console.log('Adding DirtClearer to Spawn List: ' + name);
        }
    }

    if(!room.memory.defence) {
        room.memory.defence = {nuke: false, evacuate: false};
    }

    if(room.memory.defence.nuke) {
        let nukes = room.find(FIND_NUKES);
        if(nukes.length > 0) {
            nukes.sort((a,b) => a.timeToLand - b.timeToLand);
                if(nukes[0].timeToLand <= 200) {
                    room.memory.defence.evacuate = true;
                }
                else {
                    room.memory.defence.evacuate = false;
                }
                if(nukes[0].timeToLand <= 400) {
                    return;
                }

        }
        else if(room.memory.defence.nuke && nukes.length == 0) {
            room.memory.defence.nuke = false;
            construction(room);
        }
        else {
            room.memory.defence.nuke = false;
            room.memory.defence.evacuate = false;
        }
    }




    let spawnMaintainer = false;
    let rampartsInRoom;
    let rampartsInRoomBelowFiftyK;
    let rampartsInRoomBelowTwelveMil;
    if(room.controller.level >= 3) {
        if(storage) {
            rampartsInRoom = room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART});
            rampartsInRoomBelowFiftyK = rampartsInRoom.filter(function(s) {return s.hits < 50000;})
            rampartsInRoomBelowTwelveMil = rampartsInRoom.filter(function(s) {return s.hits < 12000000;})
            for(let rampart of rampartsInRoom) {
                if(rampart.hits <= 10000) {
                    spawnMaintainer = true;
                }
            }
        }

    }



    const roomResources = room.memory.resources || {};
    let roomsToRemote = Object.keys(roomResources);
    let activeRemotes = [];
    // Home always counts. Remotes: RCL3 after slam-5 if CPU allows (one
    // close unreserved source). Reservers stay RCL5+. disableRemotes off-switch.
    const remotesAllowed =
        room.controller &&
        room.controller.level >= 3 &&
        (room.controller.level >= 4 || room.energyCapacityAvailable >= 550) &&
        !remotesDisabled() &&
        !homeEconomyStarved(room);
    for(let remoteRoom of roomsToRemote) {
        if(remoteRoom == room.name) {
            activeRemotes.push(remoteRoom);
        } else if(roomResources[remoteRoom]?.active) {
            if (remotesAllowed) {
                activeRemotes.push(remoteRoom);
            } else {
                // force off until RCL4+
                roomResources[remoteRoom].active = false;
            }
        }
    }
    // `sites` above is the same find; this used to run it a second time.
    let constructionSitesAmount = sites.length;
    // extra upgraders bought by a storage surplus — 0 below the tier
    // thresholds, so every gate below keeps its old behaviour there
    let surplusUpgraders = surplusUpgraderTier(room);
    // Energy already on this room's floor is energy we have already paid to
    // mine; burning it into the controller costs nothing extra. See
    // drainPressure() for the measurement this is based on.
    let pressure = drainPressure(room);

    // Open construction sites must NEVER veto the baseline upgraders.
    //
    // The `constructionSitesAmount == 0` clause in the RCL2/3/4 upgrader gates
    // was written when sites were transient: finish the site, then upgrade. The
    // v2 base planner tops the site budget back up to ~4 every 15 ticks, so a
    // planned room has open sites PERMANENTLY and those gates never opened
    // again. Live E14S9 sat at RCL4, 34k banked, ticksToDowngrade 39k, 4 sites,
    // ZERO upgraders, controller progress pinned at 8034 for over an hour.
    //
    // Builders still get first claim on the spawn - every builder rung below is
    // pushed onto the queue BEFORE its upgrader rung - this only stops the
    // sites from zeroing the upgrader roster while the room is rich enough to
    // pay for both. 10k is the same storage floor the RCL4/5 gates already use;
    // a room with no storage yet (or only a hub container) is judged on the
    // sites as before below the floor - EXCEPT at RCL2/3, where there is no
    // storage to read at all and the same permanent sites would otherwise pin a
    // young room at its current level forever. Those rosters are 2-4 upgraders
    // off a 300-550 energy spawn, which is exactly how a room is meant to climb
    // to RCL4 in the first place.
    //
    // ...and the floor has to be read off the REAL bank. `storage` here can be
    // the hub CONTAINER (findStorage falls back to it when the room has no real
    // storage yet) and a container caps at 2,000, so `storage > 10000` was
    // unsatisfiable BY CONSTRUCTION - exactly the trap the RCL4 builder gate had
    // and that the comment at :1292 already fixed. An RCL4 room without a
    // storage therefore had sitesMayNotVetoUpgraders pinned false for as long
    // as the planner kept sites open, i.e. permanently: live E2S7 sat at ZERO
    // upgraders for ~2,500 ticks with four sites and a full hub container.
    //
    // Real storage  -> bankEnergy(), which reads room.storage ONLY (same number
    //                  upgraderTarget()/upgradeLatch() budget from, so the floor
    //                  and the target can no longer disagree about what "the
    //                  bank" is).
    // No real bank  -> there is nothing to protect and the income has nowhere
    //                  else to go, so judge the room on what it actually has:
    //                  a hub container at least half full, a standing floor pile
    //                  (already-paid-for energy, see drainPressure), or a spawn
    //                  pool that is topped up. upgraderTarget() takes the same
    //                  view for these rooms (`!room.storage` -> base + burn) and
    //                  lets the energy supply throttle the roster.
    const hasRealBank = !!(room.storage && room.storage.my);
    const hubFallback = !hasRealBank && storage && storage.store ? storage : null;
    let upgraderEnergyFloor = hasRealBank
        ? bankEnergy(room) > UPGRADE_FLOOR
        : !!hubFallback && hubFallback.store[RESOURCE_ENERGY] * 2 >= hubFallback.store.getCapacity(RESOURCE_ENERGY)
            || pressure.onFloor >= FLOOR_PILE_SMALL
            || room.energyCapacityAvailable > 0 && room.energyAvailable * 10 >= room.energyCapacityAvailable * 9;

    // A REMOTE miner stands in the REMOTE room, so EnergyMinersInRoom reads 0
    // while mining is fully staffed - and every builder rung from RCL4 up
    // requires it to be non-zero, so a room whose sources are worked by remote
    // miners (or whose in-room miners happen to be walking home) silently
    // stopped building with a full storage and open sites. A room sitting on a
    // real bank can pay for construction wherever its miners are standing.
    let bankCanBuild = storage && storage.structureType === STRUCTURE_STORAGE && storage.store[RESOURCE_ENERGY] > 15000;
    let sitesMayNotVetoUpgraders =
        constructionSitesAmount == 0
        || upgraderEnergyFloor
        || room.controller.level <= 3;
    switch(room.controller.level) {
        case 1:
            // Miner first. E37N57 hatched CA+UG off an empty spawn while
            // 0 miners lived — spawn e=20, room never mined.
            spawn_energy_miner(resourceData, room, activeRemotes);
            if(EnergyMinersInRoom < 1) {
                break;
            }
            queueEarlyFiller(room, storage, fillers, spawnrules[1].filler_creep.amount, spawnrules[1].filler_creep.body, activeRemotes.length);
            spawn_carrier(resourceData, room, spawn, storage, activeRemotes);
            if(sites.length > 0 && EnergyMinersInRoom >= 1 && builders < earlyBuildSlots(sites, spawnrules[1].build_creep.amount, room)) {
                let name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[1].build_creep.body, name, {memory: {role: 'builder'}});
                console.log('Adding Builder to Spawn List: ' + name);
            }
            if(upgraders < spawnrules[1].upgrade_creep.amount && !room.memory.danger) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[1].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }
            else if(upgraders < spawnrules[1].upgrade_creep.amount + 6 && storage && storage.structureType === STRUCTURE_STORAGE && storage.store.getFreeCapacity() < 200 && !room.memory.danger) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[1].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }
            break;

        case 2:
            // Dest-23: starve roster only on true 0-miner blackout.
            // Dest-21 film: dest-cheap left 1W+1W, bestWORK<2 then blocked
            // CA/builders — L3 pave sites sat (E5S3/E16S9 c=2). Leftover
            // 1W is income. Dest-22 dest-cheap is already === 0.
            spawn_energy_miner(resourceData, room, activeRemotes);
            if(homeMinerBestWork(room) === 0) {
                break;
            }
            queueEarlyFiller(room, storage, fillers, spawnrules[2].filler_creep.amount, spawnrules[2].filler_creep.body, activeRemotes.length);
            spawn_carrier(resourceData, room, spawn, storage, activeRemotes);
            if(repairers < spawnrules[2].repair_creep.amount && EnergyMinersInRoom >= 1 && !room.memory.danger && room.controller.progress > 4500 && earlyRepairNeeded(room)) {
                let name = 'Repair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[2].repair_creep.body, name, {memory: {role: 'repair', homeRoom: room.name}});
                console.log('Adding Repair to Spawn List: ' + name);
            }
            if(sites.length > 0 && EnergyMinersInRoom >= 1 && builders < earlyBuildSlots(sites, spawnrules[2].build_creep.amount, room)) {
                let name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[2].build_creep.body, name, {memory: {role: 'builder'}});
                console.log('Adding Builder to Spawn List: ' + name);
            }
            if(upgraders < spawnrules[2].upgrade_creep.amount + pressure.burn && !room.memory.danger && (sitesMayNotVetoUpgraders || room.controller.ticksToDowngrade < 1500)) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[2].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }
            else if(upgraders < spawnrules[2].upgrade_creep.amount + 6 && storage && storage.structureType === STRUCTURE_STORAGE && storage.store.getFreeCapacity() < 200 && !room.memory.danger) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[2].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }
            break;

        case 3:
            spawn_energy_miner(resourceData, room, activeRemotes);
            // Dest-23: same 0-miner gate as dest-cheap. 1W leftover +
            // HOL 5W must still hatch builders (cycle-21 E16S9 8 road
            // sites, 0 standing, c=2).
            if(homeMinerBestWork(room) === 0) {
                break;
            }
            queueEarlyFiller(room, storage, fillers, spawnrules[3].filler_creep.amount, spawnrules[3].filler_creep.body, activeRemotes.length);
            spawn_carrier(resourceData, room, spawn, storage, activeRemotes);
            // Loaded [2W,2C,2M] is 2 t/tile on plains, 1 on roads. Two
            // builders slam the haul line after slam-5; 1 builder left
            // the 135k climb on dirt.
            const rcl3BuildWant = earlyBuildSlots(sites, spawnrules[3].build_creep.amount, room);
            const rcl3RoadsOnly = onlyRoadSites(sites);
            const paveArterials = room.energyCapacityAvailable >= 550 && hasRoadSite(sites);
            if((!rcl3RoadsOnly || paveArterials) && sites.length > 0 && EnergyMinersInRoom >= 1 && builders < (paveArterials ? 2 : rcl3BuildWant)) {
                let name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[3].build_creep.body, name, {memory: {role: 'builder'}});
                console.log('Adding Builder to Spawn List: ' + name);
            }
            // + pressure.burn: E2S7 (RCL3) sat on a 14,470-energy floor pile
            // in steady state, destroying 18.7 energy/tick to decay while its
            // controller took 2.19/tick. Upgraders are the only sink that
            // scales, so the roster grows with the pile.
            if(upgraders < spawnrules[3].upgrade_creep.amount + pressure.burn && !room.memory.danger && (sitesMayNotVetoUpgraders || room.controller.ticksToDowngrade < 1500)) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[3].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }
            else if(upgraders < spawnrules[3].upgrade_creep.amount + 6 && storage && storage.structureType === STRUCTURE_STORAGE && storage.store.getFreeCapacity() < 200 && !room.memory.danger) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[3].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }
            // After eco. Container decay is 50 hits/t (5000-tick life);
            // a 200e body must not HOL the depot builder or the parked 4W.
            if(repairers < spawnrules[3].repair_creep.amount && EnergyMinersInRoom >= 1 && !room.memory.danger && earlyRepairNeeded(room)) {
                let name = 'Repair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[3].repair_creep.body, name, {memory: {role: 'repair', homeRoom: room.name}});
                console.log('Adding Repair to Spawn List: ' + name);
            }
            // No RCL3 maintainer. The 800e [4W,2M,4C] used to queue the moment
            // an arterial hit 2000 (≈3000 ticks of decay) and HOL-block the
            // 135k climb. Ramparts are RCL4+; the cheap repairer covers roads.
            break;

        case 4:
            queueEarlyFiller(room, storage, fillers, spawnrules[4].filler_creep.amount, spawnrules[4].filler_creep.body, activeRemotes.length,
                !!(room.memory.danger && room.energyAvailable < room.energyCapacityAvailable/1.5));
            spawn_energy_miner(resourceData, room, activeRemotes);
            spawn_carrier(resourceData, room, spawn, storage, activeRemotes);
            if((repairers < spawnrules[4].repair_creep.amount + 6 && room.energyAvailable > room.energyCapacityAvailable / 1.3 || room.memory.danger && repairers < spawnrules[4].repair_creep.amount + 10) && !queuedWithPrefix(room, 'Repair-') && storage && (storage.store[RESOURCE_ENERGY] > 50000 && repairers < spawnrules[4].repair_creep.amount + 1 || Game.time % 2000 < 400 && storage.store[RESOURCE_ENERGY] > 20000 && repairers < spawnrules[4].repair_creep.amount ||  (storage.store[RESOURCE_ENERGY] > 15000 || room.memory.danger && storage.store[RESOURCE_ENERGY] > 5000) && repairers < spawnrules[4].repair_creep.amount + 1 && (rampartsInRoom.filter(function(s) {return s.hits < 60000}).length || room.memory.danger_timer > 50))) {
                let name = 'Repair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[4].repair_creep.body, name, {memory: {role: 'repair', homeRoom: room.name}});
                console.log('Adding Repair to Spawn List: ' + name);
            }
            // `storage` here can be a CONTAINER (findStorage falls back to the
            // hub container when the room has no real storage yet) and a
            // container caps out at 2000 — so the 15000 gate was unsatisfiable
            // and an RCL4 room without a storage got ZERO builders, forever.
            // That is the soft-brick: no builders means the storage site never
            // gets built, which means no storage, which means no builders.
            // FLAG: RCL4 builder floor was 15k vs RCL5's 5k — a fresh storage
            // sat idle while sites waited. Aligned to 5k (R6.19).
            if(builders < spawnrules[4].build_creep.amount && sites.length > 0 && (EnergyMinersInRoom > 0 || bankCanBuild) && (!storage || storage.structureType !== STRUCTURE_STORAGE || storage.store[RESOURCE_ENERGY] > 5000)) {
                let name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[4].build_creep.body, name, {memory: {role: 'builder'}});
                console.log('Adding Builder to Spawn List: ' + name);
            }
            // One gate, one number. The old pair of gates were
            //   storage > 100000 || storage > 10000 && no rampart under 900k
            // and an RCL4 rampart caps at 300,000 hits, so the second arm could
            // never pass and the effective floor was 100k — E18S3 froze its
            // controller for 3,392 ticks at 60k banked with zero upgraders.
            // upgraderTarget() owns the floor, the middle band, the surge and
            // the hysteresis that stops the 0-upgrader cycle; the surplus tier
            // is folded into it. Deliberately NOT gated on
            // constructionSitesAmount — that gate is what froze E11S5 at 778k.
            if(upgraders < upgraderTarget(room, spawnrules[4].upgrade_creep.amount, surplusUpgraders, pressure.burn, EnergyMinersInRoom) && !room.memory.danger && (sitesMayNotVetoUpgraders || room.controller.ticksToDowngrade < 21000)) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[4].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name + ' (bank ' + bankEnergy(room) + ', floor ' + pressure.onFloor + ')');
            }
            if(maintainers < spawnrules[4].maintain_creep.amount && !room.memory.danger && (room.memory.keepTheseRoads && room.memory.keepTheseRoads.length > 0 || spawnMaintainer) && !queuedWithPrefix(room, 'Maintainer')) {
                if(spawnMaintainer) {
                    let name = 'Maintainer-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push(spawnrules[4].maintain_creep.body, name, {memory: {role: 'maintainer', homeRoom: room.name}});
                    console.log('Adding Maintainer to Spawn List: ' + name);
                }
                else {
                    for(let roadID of room.memory.keepTheseRoads) {
                        let road:any = Game.getObjectById(roadID);
                        if(road && road.hits <= 2000) {
                            let name = 'Maintainer-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                            room.memory.spawn_list.push(spawnrules[4].maintain_creep.body, name, {memory: {role: 'maintainer', homeRoom: room.name}});
                            console.log('Adding Maintainer to Spawn List: ' + name);
                            break;
                        }
                    }
                }
            }
            break;

        case 5:
            let bin:any = Game.getObjectById(room.memory.Structures?.bin);
            if(EnergyManagers < 1 && storage && bin && bin.store.getFreeCapacity() == 0) {
                let name = 'EnergyManager-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.unshift([CARRY,MOVE], name, {memory: {role: 'EnergyManager'}});
                console.log('Adding Energy Manager to Spawn List: ' + name);
            }


            queueEarlyFiller(room, storage, fillers, spawnrules[5].filler_creep.amount, spawnrules[5].filler_creep.body, activeRemotes.length);
            spawn_energy_miner(resourceData, room, activeRemotes);
            spawn_carrier(resourceData, room, spawn, storage, activeRemotes);
            // (the dropped middle arm was `Game.time % 2000 < 400 && > 50000 &&
            // repairers < amount`, strictly narrower than the first arm)
            if(repairers < spawnrules[5].repair_creep.amount + 2 && !queuedWithPrefix(room, 'Repair-') && storage && (storage.store[RESOURCE_ENERGY] > 50000 && repairers < spawnrules[5].repair_creep.amount + 1 ||  storage.store[RESOURCE_ENERGY] > 10000 && (rampartsInRoom.filter(function(s) {return s.hits < 75000}).length || room.memory.danger_timer > 50))) {
                let name = 'Repair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[5].repair_creep.body, name, {memory: {role: 'repair', homeRoom: room.name}});
                console.log('Adding Repair to Spawn List: ' + name);
            }
            // Was 15k — left sites unfinished while eco was still climbing
            // same container-vs-storage trap as RCL4 above
            if(builders < spawnrules[5].build_creep.amount && sites.length > 0 && (EnergyMinersInRoom > 0 || bankCanBuild) && (!storage || storage.structureType !== STRUCTURE_STORAGE || storage.store[RESOURCE_ENERGY] > 5000)) {
                let name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[5].build_creep.body, name, {memory: {role: 'builder'}});
                console.log('Adding Builder to Spawn List: ' + name);
            }
            // Same single hysteretic gate as RCL4 (see upgraderTarget). The old
            // `storage.store > 10000` read the hub CONTAINER in rooms whose
            // Structures.storage cache was never re-pointed, and a container
            // caps at 2,000 — unsatisfiable. The downgrade clause is kept as a
            // hard floor: one upgrader regardless of the bank once the
            // controller is below half its downgrade timer.
            // sitesMayNotVetoUpgraders was wired into RCL4/6 and skipped here,
            // so a planned RCL5 with permanent sites burned its bank on
            // upgraders while the economy was still climbing (R6.33).
            if(upgraders < upgraderTarget(room, spawnrules[5].upgrade_creep.amount, surplusUpgraders, pressure.burn, EnergyMinersInRoom) && !room.memory.danger && (sitesMayNotVetoUpgraders || room.controller.ticksToDowngrade < 21000)
                || room.controller.ticksToDowngrade < 6000 && upgraders < spawnrules[5].upgrade_creep.amount && !room.memory.danger
                || upgraders < 1 && room.controller.ticksToDowngrade < CONTROLLER_DOWNGRADE[room.controller.level] / 2 && !room.memory.danger) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[5].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name + ' (bank ' + bankEnergy(room) + ', floor ' + pressure.onFloor + ')');
            }
            if(maintainers < spawnrules[5].maintain_creep.amount && (room.memory.keepTheseRoads && room.memory.keepTheseRoads.length > 0 || spawnMaintainer) && !queuedWithPrefix(room, 'Maintainer')) {
                if(spawnMaintainer) {
                    let name = 'Maintainer-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push(spawnrules[5].maintain_creep.body, name, {memory: {role: 'maintainer', homeRoom: room.name}});
                    console.log('Adding Maintainer to Spawn List: ' + name);
                }
                else {
                    for(let roadID of room.memory.keepTheseRoads) {
                        let road:any = Game.getObjectById(roadID);
                        if(road && road.hits <= 2000 && (!room.memory.danger || room.memory.danger && storage && storage.pos.getRangeTo(road) <= 10)) {
                            let name = 'Maintainer-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                            room.memory.spawn_list.push(spawnrules[5].maintain_creep.body, name, {memory: {role: 'maintainer', homeRoom: room.name}});
                            console.log('Adding Maintainer to Spawn List: ' + name);
                            break;
                        }
                    }
                }

            }
            break;

        case 6:
            if(EnergyManagers < spawnrules[6].energy_manager_creep.amount && storage) {
                let name = 'EnergyManager-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.unshift(spawnrules[6].energy_manager_creep.body, name, {memory: {role: 'EnergyManager'}});
                console.log('Adding Energy Manager to Spawn List: ' + name);
            }

            if((fillers < spawnrules[6].filler_creep.amount || fillers < spawnrules[6].filler_creep.amount + 1 && activeRemotes.length > 1 || fillers < spawnrules[6].filler_creep.amount + 2 && activeRemotes.length > 2) && storage) {
                let name = 'Filler-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.unshift(spawnrules[6].filler_creep.body, name, {memory: {role: 'filler'}});
                console.log('Adding filler to Spawn List: ' + name);
            }
            else if(fillers < spawnrules[6].filler_creep.amount + 1 && storage && Memory.targetRampRoom.room == room.name) {
                let name = 'Filler-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.unshift(spawnrules[6].filler_creep.body, name, {memory: {role: 'filler'}});
                console.log('Adding filler to Spawn List: ' + name);
            }
            else if(fillers < spawnrules[6].filler_creep.amount + 1 && storage && room.energyCapacityAvailable < 500) {
                let name = 'Filler-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.unshift(spawnrules[6].filler_creep.body, name, {memory: {role: 'filler'}});
                console.log('Adding filler to Spawn List: ' + name);
            }
            spawn_energy_miner(resourceData, room, activeRemotes);
            spawn_carrier(resourceData, room, spawn, storage, activeRemotes);
            /*
             * WAS `hits < 3050000`, on an RCL6 shell whose ramparts cap at
             * 20,000,000 apiece. Live E37N59 has 77 planned ramparts: that
             * threshold is ~235,000,000 energy of latent demand behind a
             * 150,000-energy trigger, i.e. the instant the bank crossed the
             * floor the whole income of the room went into walls and the
             * controller stopped. rampartHitsTarget() is the per-RCL number
             * (rooms.defence) — 100k below RCL7 — and the peacetime tower
             * top-up now aims at exactly the same figure.
             */
            let rampartsBelowTarget = rampartsInRoom?.filter(function(s) {return s.hits < rampartHitsTarget(room);});
            if(repairers < spawnrules[6].repair_creep.amount && storage && (storage.store[RESOURCE_ENERGY] > 150000 && rampartsBelowTarget.length > 0 || Game.time % 3000 < 100 && storage.store[RESOURCE_ENERGY] > 50000 || room.memory.danger && storage.store[RESOURCE_ENERGY] > 50000) && !queuedWithPrefix(room, 'Repair-')) {
                let name = 'Repair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[6].repair_creep.body, name, {memory: {role: 'repair', homeRoom: room.name}});
                console.log('Adding Repair to Spawn List: ' + name);
            }
            // Was 120k, then 8k — both floors soft-bricked a poor RCL6 room. See queueBuilder().
            queueBuilder(room, spawnrules[6], sites, builders, EnergyMinersInRoom, bankCanBuild, storage, 8000);
            /*
             * BANDED BANK LADDER — the same one RCL4/5 have run since
             * upgraderTarget() landed, finally wired into RCL6.
             *
             * The gate this replaces was `storage > 400000` for a roster of
             * amount+3, against a room whose entire storage is 43,485. There is
             * no 400k in an RCL6 room's future — an RCL6 storage is 1,000,000
             * capacity but the room earns ~20 e/tick — so the arm was dead, the
             * >120k surplus tier below it was dead too, and the only rung that
             * ever fired was keepOneUpgrader's floor of ONE. Measured on live
             * E37N59: one 12-WORK upgrader, 1.7 energy/tick into the controller,
             * with two sources and 43k banked.
             *
             * base is now 3 (spawnrules[6].upgrade_creep.amount), so the ladder
             * reads: >=30k banked -> 3 upgraders, >=120k -> 4 (the surplus tier),
             * <30k -> 1-2, and the 60k-on/15k-off latch (upgradeLatch) is what
             * stops it bang-banging as the bank drains. Bodies are getBody()d
             * against energyCapacityAvailable, so they can never outgrow the
             * spawn. The downgrade arm is unchanged.
             */
            if(upgraders < upgraderTarget(room, spawnrules[6].upgrade_creep.amount, surplusUpgraders, pressure.burn, EnergyMinersInRoom)
                    && !room.memory.danger
                    && (sitesMayNotVetoUpgraders || room.controller.ticksToDowngrade < 21000)
                || room.controller.ticksToDowngrade < 80000 && upgraders < spawnrules[6].upgrade_creep.amount) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[6].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name + ' (bank ' + bankEnergy(room) + ')');
            }
            // Surplus tier: >120k banked at RCL6. upgraderTarget only pays the
            // surplus out while the surge latch is on; this is the unlatched arm.
            else if(surplusUpgraders > 0 && upgraders < spawnrules[6].upgrade_creep.amount + surplusUpgraders && !room.memory.danger) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[6].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Surplus Upgrader to Spawn List: ' + name);
            }
            // FLOOR — same dead band as RCL7 below (400k spend / 120k surplus /
            // 80k downgrade against a 150k maximum). See keepOneUpgrader().
            // ...but the floor is not a licence to outbid the room's own economy.
            // sitesMayNotVetoUpgraders is the existing "rich enough to pay for
            // both" test (bank > 10k, or no sites at all); it was wired into
            // RCL2/3/4 and never into RCL6/7, so on live VPS W2N1/W3N1 a 15-WORK
            // floor upgrader took the whole 10-20 e/tick income of a room that
            // was banking ZERO and had nine open sites, with ticksToDowngrade at
            // 119,948 of 120,000. That is not downgrade insurance, it is the
            // reason the builder gate's bank floor was never reached. The
            // downgrade rungs above (and the < 21000 escape here) still fire the
            // moment the controller is actually at risk.
            else if(upgraders < keepOneUpgrader(room, EnergyMinersInRoom)
                    && (sitesMayNotVetoUpgraders || room.controller.ticksToDowngrade < 21000)) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[6].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Floor Upgrader to Spawn List: ' + name + ' (bank ' + bankEnergy(room) + ')');
            }


            if(maintainers < spawnrules[6].maintain_creep.amount && (room.memory.keepTheseRoads && room.memory.keepTheseRoads.length > 0 || spawnMaintainer) && !queuedWithPrefix(room, 'Maintainer')) {
                if(spawnMaintainer) {
                    let name = 'Maintainer-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push(spawnrules[6].maintain_creep.body, name, {memory: {role: 'maintainer', homeRoom: room.name}});
                    console.log('Adding Maintainer to Spawn List: ' + name);
                }
                else {
                    for(let roadID of room.memory.keepTheseRoads) {
                        let road:any = Game.getObjectById(roadID);
                        if(road && road.hits <= 2000 && (!room.memory.danger || room.memory.danger && storage && storage.pos.getRangeTo(road) <= 10)) {
                            let name = 'Maintainer-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                            room.memory.spawn_list.push(spawnrules[6].maintain_creep.body, name, {memory: {role: 'maintainer', homeRoom: room.name}});
                            console.log('Adding Maintainer to Spawn List: ' + name);
                            break;
                        }
                    }
                }

            }
            break;

        case 7:
            if(EnergyManagers < spawnrules[7].energy_manager_creep.amount && storage) {
                let name = 'EnergyManager-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                // First arm used to always unshift the full body, so the
                // emergency never ran when extensions were gone (R6.30).
                if(room.energyCapacityAvailable < 500 || room.energyAvailable < room.energyCapacityAvailable * 0.5 && room.energyAvailable <= 300) {
                    room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], name, {memory: {role: 'EnergyManager'}});
                    console.log('Adding Emergency Energy Manager to Spawn List: ' + name);
                }
                else {
                    room.memory.spawn_list.unshift(spawnrules[7].energy_manager_creep.body, name, {memory: {role: 'EnergyManager'}});
                    console.log('Adding Energy Manager to Spawn List: ' + name);
                }
            }
            if((fillers < spawnrules[7].filler_creep.amount || fillers < spawnrules[7].filler_creep.amount + 1 && activeRemotes.length > 2 || fillers < spawnrules[7].filler_creep.amount + 2 && activeRemotes.length > 3) && storage) {
                let name = 'Filler-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                let fillerBody = (room.energyCapacityAvailable < 500 || room.energyAvailable <= 300 && room.energyAvailable < room.energyCapacityAvailable * 0.5)
                    ? spawnrules[6].filler_creep.body : spawnrules[7].filler_creep.body;
                room.memory.spawn_list.unshift(fillerBody, name, {memory: {role: 'filler'}});
                console.log('Adding filler to Spawn List: ' + name);
            }
            else if(fillers < spawnrules[7].filler_creep.amount + 1 && storage && Memory.targetRampRoom.room == room.name) {
                let name = 'Filler-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.unshift(spawnrules[7].filler_creep.body, name, {memory: {role: 'filler'}});
                console.log('Adding filler to Spawn List: ' + name);
            }
            else if(fillers < spawnrules[6].filler_creep.amount + 1 && storage && room.energyCapacityAvailable < 500) {
                let name = 'Filler-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.unshift(spawnrules[6].filler_creep.body, name, {memory: {role: 'filler'}});
                console.log('Adding filler to Spawn List: ' + name);
            }
            spawn_energy_miner(resourceData, room, activeRemotes);
            spawn_carrier(resourceData, room, spawn, storage, activeRemotes);
            // Same 150k floor as RCL6. 500k meant a fresh RCL7 sat on decaying
            // ramparts until the bank was huge; the 1x30W body is unchanged.
            if(repairers < spawnrules[7].repair_creep.amount && storage && (storage.store[RESOURCE_ENERGY] > 150000 || Game.time % 3000 < 100 && storage.store[RESOURCE_ENERGY] > 50000 || room.memory.danger && storage.store[RESOURCE_ENERGY] > 50000) && !queuedWithPrefix(room, 'Repair-')) {
                // Was a hardcoded 4,050,000; rampartHitsTarget() gives 300,000
                // at RCL7. Same reason as the RCL6 rung above — see there.
                let rampartsBelowTarget7 = rampartsInRoom?.filter(function(s) {return s.hits < rampartHitsTarget(room);});
                if(rampartsBelowTarget7.length > 0) {
                    let name = 'Repair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push(spawnrules[7].repair_creep.body, name, {memory: {role: 'repair', homeRoom: room.name}});
                    console.log('Adding Repair to Spawn List: ' + name);
                }
            }
            if(!room.memory.danger && room.memory.danger_timer == 0) {
                queueBuilder(room, spawnrules[7], sites, builders, EnergyMinersInRoom, bankCanBuild, storage, 15000);
            }
            if((upgraders < spawnrules[7].upgrade_creep_spend.amount && room.name !== Memory.targetRampRoom.room || upgraders < spawnrules[7].upgrade_creep_spend.amount + 3 && room.name == Memory.targetRampRoom.room) && storage && storage.store[RESOURCE_ENERGY] > 400000 && !room.memory.danger) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[7].upgrade_creep_spend.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }
            // Same banded ladder as RCL4/5/6 (upgraderTarget + upgradeLatch),
            // replacing a rung that only ever fired inside the last 110k ticks
            // of the downgrade timer. RCL7 has exactly the shape RCL6 had: the
            // spend rung above wants 400k, the surplus tier below wants 120k,
            // and everything under that ran on keepOneUpgrader's floor of one
            // 12-WORK body. base 3 => >=30k banked buys 3, >=120k buys 4,
            // >=250k buys 5. The downgrade clause is kept as a hard floor.
            else if(upgraders < upgraderTarget(room, spawnrules[7].upgrade_creep.amount, surplusUpgraders, pressure.burn, EnergyMinersInRoom)
                    && !room.memory.danger
                    && (sitesMayNotVetoUpgraders || room.controller.ticksToDowngrade < 21000)
                || upgraders < spawnrules[7].upgrade_creep.amount && room.controller.ticksToDowngrade < 110000 && storage && storage.store[RESOURCE_ENERGY] > 10000 && (!room.memory.danger || room.controller.ticksToDowngrade < 80000)) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[7].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name + ' (bank ' + bankEnergy(room) + ')');
            }
            // Surplus tier: >120k (+1) / >250k (+2) banked at RCL7. Below 400k
            // the spend branch above never fires and the small upgrade_creep
            // only comes out near a downgrade — so a room like live E2S7 sits
            // on 384k with no upgrader at all. Use the SPEND body: at this RCL
            // the point is to burn the bank, not to tick the controller over.
            else if(surplusUpgraders > 0 && upgraders < spawnrules[7].upgrade_creep.amount + surplusUpgraders && !room.memory.danger) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[7].upgrade_creep_spend.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Surplus Upgrader to Spawn List: ' + name);
            }
            // FLOOR. The three rungs above leave a dead band that a healthy room
            // lives in: the spend rung wants 400k, the surplus tier wants 120k,
            // and the downgrade rung wants ticksToDowngrade < 110k against an
            // RCL7 maximum of 150k. Live W1N1 sat at 118,821 banked with 148,114
            // ticksToDowngrade — under every one of them — and ran ZERO upgraders
            // with a rising storage and an empty spawn queue. keepOneUpgrader()
            // is the guarantee that an owned room below RCL8 never does that; it
            // was only ever wired into the RCL4/5 gates, so RCL6/7 never had it.
            // Same veto as RCL6 above — see the note there.
            else if(upgraders < keepOneUpgrader(room, EnergyMinersInRoom)
                    && (sitesMayNotVetoUpgraders || room.controller.ticksToDowngrade < 21000)) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[7].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Floor Upgrader to Spawn List: ' + name + ' (bank ' + bankEnergy(room) + ')');
            }


            if(maintainers < spawnrules[7].maintain_creep.amount && (room.memory.keepTheseRoads && room.memory.keepTheseRoads.length > 0 || spawnMaintainer) && !queuedWithPrefix(room, 'Maintainer')) {
                if(spawnMaintainer) {
                    let name = 'Maintainer-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push(spawnrules[7].maintain_creep.body, name, {memory: {role: 'maintainer', homeRoom: room.name}});
                    console.log('Adding Maintainer to Spawn List: ' + name);
                }
                else {
                    for(let roadID of room.memory.keepTheseRoads) {
                        let road:any = Game.getObjectById(roadID);
                        if(road && road.hits <= 2000 && (!room.memory.danger || room.memory.danger && storage && storage.pos.roomName == road.pos.roomName && storage.pos.getRangeTo(road) <= 10)) {
                            let name = 'Maintainer-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                            room.memory.spawn_list.push(spawnrules[7].maintain_creep.body, name, {memory: {role: 'maintainer', homeRoom: room.name}});
                            console.log('Adding Maintainer to Spawn List: ' + name);
                            break;
                        }
                    }
                }

            }
            break;

        case 8:
            if(EnergyManagers < spawnrules[8].energy_manager_creep.amount && storage) {
                let name = 'EnergyManager-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                // If room is energy starved, spawn small emergency energy manager
                if(room.energyCapacityAvailable < 500 || room.energyAvailable < room.energyCapacityAvailable * 0.5 && room.energyAvailable <= 300) {
                    room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], name, {memory: {role: 'EnergyManager'}});
                    console.log('Adding Emergency Energy Manager to Spawn List: ' + name);
                }
                else {
                    room.memory.spawn_list.unshift(spawnrules[8].energy_manager_creep.body, name, {memory: {role: 'EnergyManager'}});
                    console.log('Adding Energy Manager to Spawn List: ' + name);
                }
            }
            if((fillers < spawnrules[8].filler_creep.amount || fillers < spawnrules[8].filler_creep.amount + 1 && repairers > 1 ||fillers < spawnrules[8].filler_creep.amount + 2 && repairers > 3 || fillers < spawnrules[8].filler_creep.amount + 1 && repairers > 2 ||  fillers < spawnrules[8].filler_creep.amount + 1 && activeRemotes.length > 2 || fillers < spawnrules[8].filler_creep.amount + 2 && activeRemotes.length > 3) && storage) {
                let name = 'Filler-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                let fillerBody = (room.energyCapacityAvailable < 500 || room.energyAvailable <= 300 && room.energyAvailable < room.energyCapacityAvailable * 0.5)
                    ? spawnrules[6].filler_creep.body : spawnrules[8].filler_creep.body;
                room.memory.spawn_list.unshift(fillerBody, name, {memory: {role: 'filler'}});
                console.log('Adding filler to Spawn List: ' + name);
            }
            else if(fillers < spawnrules[8].filler_creep.amount + 1 && storage && Memory.targetRampRoom.room == room.name) {
                let name = 'Filler-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.unshift(spawnrules[8].filler_creep.body, name, {memory: {role: 'filler'}});
                console.log('Adding filler to Spawn List: ' + name);
            }
            else if(fillers < spawnrules[6].filler_creep.amount + 1 && storage && room.energyCapacityAvailable < 500) {
                let name = 'Filler-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.unshift(spawnrules[6].filler_creep.body, name, {memory: {role: 'filler'}});
                console.log('Adding filler to Spawn List: ' + name);
            }
            else if(fillers<1 && room.energyAvailable === 300 && storage) {
                let name = 'Filler-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.unshift(spawnrules[6].filler_creep.body, name, {memory: {role: 'filler'}});
                console.log('Adding filler to Spawn List: ' + name);
            }
            if(Game.cpu.bucket > 3000 || Game.cpu.bucket > 2000 && storage && storage.store[RESOURCE_ENERGY] < 100000) {
                spawn_energy_miner(resourceData, room, activeRemotes);
                spawn_carrier(resourceData, room, spawn, storage, activeRemotes);
            }
            if(storage?.store[RESOURCE_ENERGY] > 350000 && Game.cpu.bucket > 7000) {
                spawnrules[8].repair_creep.amount = 4;
            }
            else if(Game.cpu.bucket < 6000) {
                spawnrules[8].repair_creep.amount = 1;
            }
            // FLAG: RCL8 repair floor was 280k vs RCL7 150k (R6.31).
            // (the dropped second arm was `Game.time % 3000 < 100 && > 150000`,
            // i.e. the first arm on 1 tick in 30)
            if(Game.cpu.bucket >= 5000 && (repairers < spawnrules[8].repair_creep.amount || room.controller.safeMode > 0 && repairers < spawnrules[8].repair_creep.amount + 2) && storage && storage.store[RESOURCE_ENERGY] > 150000 && !queuedWithPrefix(room, 'Repair-')) {
                // The ring-shaped E41N58 exclusion that used to be ANDed in here
                // was a per-room hack in the shared brain for a room we no
                // longer own.
                // Unchanged number (rampartHitsTarget returns 15,255,000 at
                // RCL8) — routed through the shared helper so the RCL6/7/8
                // shell targets live in one place. See rooms.defence.
                let rampartsBelowTarget8 = rampartsInRoom.filter(function(s) {return s.hits < rampartHitsTarget(room);});
                if(rampartsBelowTarget8.length > 0) {
                    // Guard labs before lab8reserved (R6.29). EM loads lab1=XLH2O
                    // (repair), lab2=XZHO2 (move), lab8=XKH2O (carry) unless a
                    // miner reserved lab8 for UO. 35W/5C/10M → 1050/150/300.
                    if(storage && room.memory.labs && !room.memory.labs.lab8reserved && boostStock(room, RESOURCE_CATALYZED_LEMERGIUM_ACID) > 3150 && boostStock(room, RESOURCE_CATALYZED_KEANIUM_ACID) > 1000 && boostStock(room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) >= 1500 && room.memory.labs.outputLab1 && room.memory.labs.outputLab2 && room.memory.labs.outputLab8) {
                        spawnrules[8].repair_creep.body = [
                            WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE
                        ]
                        let name = 'Repair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                        // HONOUR THE REFUSAL. chargeBoostSlot returns false when
                        // the slot already holds somebody else's mineral; queuing
                        // boostlabs anyway sends the creep to a lab loaded with
                        // the wrong compound, where it parks. Same rule the
                        // EnergyMiner lab8 site already follows.
                        const okL1 = chargeBoostSlot(room, "lab1", 1050, name);
                        const okL2 = chargeBoostSlot(room, "lab2", 300, name);
                        const okL8 = chargeBoostSlot(room, "lab8", 150, name);
                        const labs8: string[] = [];
                        if(okL1) labs8.push(room.memory.labs.outputLab1);
                        if(okL2) labs8.push(room.memory.labs.outputLab2);
                        if(okL8) labs8.push(room.memory.labs.outputLab8);
                        const mem8: any = {role: 'repair', homeRoom: room.name};
                        if(labs8.length) { mem8.boosted = true; mem8.boostlabs = labs8; }
                        room.memory.spawn_list.push(spawnrules[8].repair_creep.body, name, {memory: mem8});
                        console.log('Adding Repair to Spawn List: ' + name + (labs8.length ? '' : ' (boost refused)'));
                    }
                    else {
                        let name = 'Repair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                        room.memory.spawn_list.push(spawnrules[8].repair_creep.body, name, {memory: {role: 'repair', homeRoom: room.name}});
                        console.log('Adding Repair to Spawn List: ' + name);
                    }
                }
                else if(storage.store[RESOURCE_ENERGY] >= 405000) {
                    let name = 'Repair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push(spawnrules[8].repair_creep.body, name, {memory: {role: 'repair', homeRoom: room.name}});
                    console.log('Adding Repair to Spawn List: ' + name);
                }

            }
            if(storage && storage.store[RESOURCE_ENERGY] >= 50000) {
                if(room.energyCapacityAvailable < 2000) {
                    spawnrules[8].build_creep.amount += 5;
                }
                else if(room.energyCapacityAvailable < 3000) {
                    spawnrules[8].build_creep.amount += 3;
                }
                else if(room.energyCapacityAvailable < 5000) {
                    spawnrules[8].build_creep.amount += 1;
                }
            }
            // Same gate as RCL6/7: EnergyMinersInRoom > 1 is impossible in a
            // 1-source room, so this rung never fired there. queueBuilder uses
            // miners > 0 || bankCanBuild and the thin-bank / rampart split.
            queueBuilder(room, spawnrules[8], sites, builders, EnergyMinersInRoom, bankCanBuild, storage, 50000);
            if(upgraders < spawnrules[8].upgrade_creep.amount && room.controller.ticksToDowngrade < 125000 && storage && storage.store[RESOURCE_ENERGY] > 10000 && (!room.memory.danger || room.controller.ticksToDowngrade < 110000)) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[8].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }

            if(maintainers < spawnrules[8].maintain_creep.amount && (room.memory.keepTheseRoads && room.memory.keepTheseRoads.length > 0 || spawnMaintainer) && !queuedWithPrefix(room, 'Maintainer')) {
                if(spawnMaintainer) {
                    let name = 'Maintainer-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push(spawnrules[8].maintain_creep.body, name, {memory: {role: 'maintainer', homeRoom: room.name}});
                    console.log('Adding Maintainer to Spawn List: ' + name);
                }
                else {
                    for(let roadID of room.memory.keepTheseRoads) {
                        let road:any = Game.getObjectById(roadID);
                        if(road && road.hits <= 2000 && (!room.memory.danger || room.memory.danger && storage && storage.pos.getRangeTo(road) <= 10)) {
                            let name = 'Maintainer-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                            room.memory.spawn_list.push(spawnrules[8].maintain_creep.body, name, {memory: {role: 'maintainer', homeRoom: room.name}});
                            console.log('Adding Maintainer to Spawn List: ' + name);
                            break;
                        }
                    }
                }

            }
            break;

    }

    // `.towers` is a separate array that only rooms.defence.ts fills in, so it can
    // still be undefined even once Structures itself exists (cold start, or a room
    // whose defence pass has not run yet) - `.towers.length` then throws.
    // "cache says nothing" == "no towers known" == length 0, which is the correct
    // fallback here: a room with no towers has no automated healing, so the
    // wounded-creep healer below is exactly what we want. Matches the
    // `!towers || towers.length == 0` test already used in rooms.ts.
    if(healers < 1 && (room.memory.Structures?.towers?.length ?? 0) === 0) {
        let myCreeps = room.find(FIND_MY_CREEPS);
        let woundedCreeps = _.filter(myCreeps, (c:any) => c.hits < c.hitsMax);
        if(woundedCreeps.length > 0) {
            let newName = 'Healer-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.push(getBody([HEAL,MOVE], room, 4), newName, {memory: {role: 'healer'}});
            console.log('Adding Healer to Spawn List: ' + newName);
        }
    }


    if(room.memory.danger && room.memory.danger_timer > 35 && fillers < 2) {
        let name = 'Filler-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
        room.memory.spawn_list.unshift(getBody([CARRY,CARRY,MOVE], room, 12), name, {memory: {role: 'filler'}});
        console.log('Adding filler to Spawn List: ' + name);
    }


    if(room.controller.level > 2) {
        spawn_remote_repairer(resourceData, room, activeRemotes);
    }

    spawn_reserver(resourceData, room, activeRemotes);



    /*
     * ControllerLinkFiller: only for an actual LINK, only from RCL5, only one.
     *
     * The old gate was `room.memory.Structures.controllerLink && level >= 3`.
     * That memory key is written by creepFunctions.findFillerTarget, whose
     * `level < 7` branch deliberately stores a CONTAINER under it — so the name
     * was a lie and the gate never checked for a link. Links unlock at RCL5, so
     * every ControllerLinkFiller in an RCL3/4 room was a 1,200-energy hauler
     * built for a structure that could not exist. Measured: E11S8 (RCL4, zero
     * links in every snapshot) ran 4-5 of them simultaneously, each parked full
     * with 800 energy, during the exact 2,725 ticks the room made zero
     * controller progress; E3S3 ran 1-2 continuously.
     *
     * Resolve the link from the room instead of the memory key (the key can
     * only be refreshed by a filler that already exists, which is a deadlock),
     * and cap the roster.
     */
    /*
     * ROSTER: one for a link, up to two for a CONTAINER depot at RCL6+.
     *
     * A link is a teleport — one filler keeps 800 in it with a walk of a few
     * tiles. A CONTAINER is not: on live E37N59 the depot is ~23 tiles from
     * storage, so the round trip is ~46 ticks and three 12-WORK upgraders eat
     * 36 energy/tick, i.e. ~1,650 energy has to be IN FLIGHT at all times. One
     * 800-capacity body cannot do that; two can.
     */
    // Upper bound only; the real cap is applied below once the target type is
    // known (a link never wants more than one).
    const clfRosterMax = room.controller.level == 6 ? 2 : 1;
    if(room.controller.level >= 5 && room.controller.level !== 8 && ControllerLinkFillers < clfRosterMax) {
        // A LINK if there is one, otherwise (below RCL7) the controller
        // CONTAINER.
        //
        // This rung used to be links-only. The reason was real — the RCL3/4
        // container branch unshifted a 250-500e [4C,M] the tick the depot
        // existed, head-of-line in front of the parked 4W that depot is for —
        // but it is an RCL3/4 reason, and it was applied at every level. The
        // cost at RCL6 is the opposite: E37N59's v2 plan spends all three RCL6
        // links on two sources and the storage, so `controllerLink` resolves to
        // a CONTAINER that nothing was allowed to fill. It read 0, and the room
        // put 1.7 energy/tick into its controller while upgraders shuttled 23
        // tiles each way to the storage. Roles/ControllerLinkFiller and
        // creepFunctions.findFillerTarget have BOTH always handled a container
        // target below RCL7 (findFillerTarget:251) — only this gate refused.
        //
        // Same identity as upgrader controllerDepot / construction L2b:
        // a hub or source-adjacent link inside range 3 is not a controller
        // depot. Treating it as one spawned a CLF that filled the hub
        // while EM emptied it, and wrote Structures.controllerLink onto
        // that hub so drain-back never healed. The container filter below is
        // that same definition (range 4, not the bin, not the storage, not a
        // source container).
        const sourcesNearCtrl = room.find(FIND_SOURCES);
        const storageLinkId = room.memory.Structures && room.memory.Structures.StorageLink;
        const ctrlLinks = room.find(FIND_MY_STRUCTURES, {filter: (s:any) =>
            s.structureType == STRUCTURE_LINK &&
            s.pos.getRangeTo(room.controller) <= 3 &&
            s.id !== storageLinkId &&
            s.pos.findInRange(sourcesNearCtrl, 1).length == 0});
        let ctrlTarget: any = ctrlLinks.length
            ? room.controller.pos.findClosestByRange(ctrlLinks)
            : null;
        if(!ctrlTarget && room.controller.level < 7) {
            const S = room.memory.Structures || {};
            const ctrlConts = room.find(FIND_STRUCTURES, {filter: (s:any) =>
                s.structureType == STRUCTURE_CONTAINER &&
                s.id !== S.bin &&
                s.id !== S.storage &&
                s.pos.getRangeTo(room.controller) <= 4 &&
                s.pos.findInRange(sourcesNearCtrl, 1).length == 0});
            if(ctrlConts.length) ctrlTarget = room.controller.pos.findClosestByRange(ctrlConts);
        }
        /*
         * BANK FLOOR — MIRROR OF THE ROLE'S OWN GATE.
         *
         * Roles/ControllerLinkFiller parks (does not withdraw, does not haul)
         * whenever the REAL storage is under CLF_BANK_FLOOR == 10,000 and the
         * controller is not actually downgrading. This rung only asked for
         * >1,000, so an RCL6 room sitting at 3k banked hatched two 1,200-energy
         * CLFs that walked to the storage and stood there for 1,500 ticks —
         * 2,400 energy spent to produce nothing, out of a bank that was already
         * below the floor. Gate the SPAWN on the same number the role gates its
         * work on, or the two disagree and the disagreement is paid in bodies.
         *
         * `storage` here can be the hub CONTAINER (findStorage fallback, caps at
         * 2000), which is why this tests structureType — a container room is not
         * "below the floor", it has no floor to be below, exactly as the role
         * reads it. The ticksToDowngrade escape is kept verbatim: a room whose
         * controller is genuinely lapsing must still get a filler at any bank.
         */
        const bankOk = !(storage && storage.structureType === STRUCTURE_STORAGE
            && storage.store[RESOURCE_ENERGY] < 10000
            && room.controller.ticksToDowngrade > 10000);
        const feedable = ctrlTarget && bankOk && (storage && storage.store[RESOURCE_ENERGY] > 1000 ||
            room.find(FIND_DROPPED_RESOURCES, {filter: (r:any) => r.resourceType == RESOURCE_ENERGY && r.amount > 500}).length > 0);
        // NO `Game.time % 70 < 12` WINDOW. This whole function only runs on the
        // roster cadence in spawning() — `(Game.time - lastTimeSpawnUsed) % 35
        // == 0` from RCL6 up — and 35 divides 70, so the evaluation ticks land
        // on exactly TWO residues mod 70 for the whole time lastTimeSpawnUsed
        // holds still. If neither of them is under 12 the gate is unreachable,
        // permanently, and nothing ever feeds the controller. Live W1N1 (RCL7)
        // evaluated only at Game.time % 70 == 21 and 56: its controller link sat
        // at 0 energy with 120k in storage, and its upgraders — which have no
        // fallback at RCL7+, see Roles/upgrader.ts — stood next to it empty.
        // `ControllerLinkFillers < 1` above is the roster cap, and the 35-tick
        // cadence is the throttle; the window was neither, only a phase lottery.
        // Two bodies only for a CONTAINER depot at RCL6 (see the roster note
        // above); a link is a teleport and wants exactly one.
        const clfCap = (ctrlTarget && ctrlTarget.structureType == STRUCTURE_CONTAINER && room.controller.level == 6) ? 2 : 1;
        if(feedable && ControllerLinkFillers < clfCap && ctrlTarget.store.getFreeCapacity(RESOURCE_ENERGY) > 200) {
            room.memory.Structures.controllerLink = ctrlTarget.id;
            let name = 'ControllerLinkFiller-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
            /*
             * BODY RATIO IS THE WHOLE POINT FOR A CONTAINER.
             *
             * [4C,MOVE] stacked to 20 parts is [16C,4M]: loaded, that generates
             * 16 fatigue a tile against 8 of relief, i.e. ONE TILE PER THREE
             * TICKS. Over a 23-tile haul that is a 140-tick round trip for 800
             * energy — 5.7 e/t, nowhere near the 36 e/t three upgraders burn.
             * A link sits next to the hub so the ratio never mattered there;
             * a container does not. 2:1 ([16C,8M], 1200e) is 1 tile/tick on the
             * planner's roads and roughly triples delivered throughput.
             */
            const clfBody = ctrlTarget.structureType == STRUCTURE_CONTAINER
                ? getBody([CARRY,CARRY,MOVE], room, 24)
                : getBody([CARRY,CARRY,CARRY,CARRY,MOVE], room, 20);
            room.memory.spawn_list.unshift(clfBody, name, {memory: {role: 'ControllerLinkFiller'}});
            console.log('Adding ControllerLinkFiller to Spawn List: ' + name + ' -> ' + ctrlTarget.structureType);
        }
    }


    if(room.controller.level >= 5 && !storage && builders < 5) {
        let name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
        room.memory.spawn_list.push(getBody([WORK,CARRY,MOVE], room, 50), name, {memory: {role: 'builder'}});
        console.log('Adding Builder to Spawn List: ' + name);
    }




    // -------------------------------------------------------------------------
    // RampartErector gate.
    //
    // WAS: storage && RCL >= 6 && storage energy > 12000. Between them those
    // three conditions meant the shell could not begin before RCL6, and the
    // OTHER path to a shell — the planV2 placement loop — sat behind every
    // planned road (roads median 81, max 129, one shared 4-site budget). So an
    // RCL4-5 room had no wall at all, from either direction, in a bot whose
    // stated premise is "it's all about defence". The placement loop now sites
    // ramparts ahead of the road mass (see PLACE_ORDER in utils/PlanV2.ts);
    // this is the other half of the same fix.
    //
    // NOW: RCL >= 3 and a modest energy check.
    //   - RCL3 because that is when towers arrive and the room becomes worth
    //     raiding, and it is comfortably below RCL4 where the shell ramparts
    //     themselves unlock — the erector should already be alive and walking
    //     the list the moment the first shell site appears.
    //   - A room at RCL3 may have NO STORAGE AT ALL, which the old `storage &&`
    //     silently excluded — the exact rooms that needed this most were the
    //     ones the gate refused. So no-storage passes: getBody() sizes the body
    //     off energyCapacityAvailable (clamped to 85%), never off storage.
    //   - 2000 when storage DOES exist: deliberately modest, not a build budget.
    //     Ramparts cost 1 energy per construction site to complete (the hits
    //     come later, from towers and repairers), so the shell is nearly free
    //     to erect and the only real spend is this one creep's body. 2000 is
    //     about one full extension fill at RCL4 — low enough that any room with
    //     a working economy clears it immediately, high enough that a room
    //     genuinely starving mid-rebuild does not add another mouth.
    //
    // URGENCY SCALES WITH SAFE MODE, not with RCL. Safe mode is the thing that
    // actually substitutes for a wall: with one banked and off cooldown, a
    // breach is survivable and the erector is ordinary infrastructure, so it
    // goes on the back of the queue. With none available or one still cooling
    // down, the shell IS the defence and the room is one raid from losing the
    // controller, so it jumps the queue via unshift() (same convention as the
    // ControllerLinkFiller block above — the body/name/opts triple is unshifted
    // together so the flat spawn_list stays aligned).
    // -------------------------------------------------------------------------
    if(RampartErectors < 1 && !queuedWithPrefix(room, 'RampartErector') && room.controller.level >= 3 && (!storage || storage.store[RESOURCE_ENERGY] > 2000) && room.memory.construction && room.memory.construction.rampartLocations && room.memory.construction.rampartLocations.length > 0) {
        let safeModeReady = room.controller.safeModeAvailable > 0 && !room.controller.safeModeCooldown;
        let newName = 'RampartErector-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
        let erectorBody = getBody([WORK,CARRY,MOVE], room, 50);
        let erectorOpts = {memory: {role: 'RampartErector', rampartLocations:room.memory.construction.rampartLocations}};
        if(safeModeReady) {
            room.memory.spawn_list.push(erectorBody, newName, erectorOpts);
        }
        else {
            room.memory.spawn_list.unshift(erectorBody, newName, erectorOpts);
        }
        console.log('Adding RampartErector to Spawn List: ' + newName + (safeModeReady ? '' : ' (URGENT - no safe mode available)'));
    }


    if(Signers < 1 && !queuedWithPrefix(room, 'Signer') && room.controller.level >= 5 && !room.memory.danger && room.memory.danger_timer == 0 && (!room.controller.sign || room.controller.sign.text !== "check out my YT channel - marlyman123")) {
        let newName = 'Signer' + "-" + room.name;
        room.memory.spawn_list.push([MOVE], newName, {memory: {role: 'Sign', homeRoom: room.name}});
        console.log('Adding Signer to Spawn List: ' + newName);
    }

    if(Priests < 1 && !queuedWithPrefix(room, 'Priest') && room.controller.level >= 6 && !room.memory.danger && room.memory.danger_timer == 0 && room.memory.data.DOB % 125000 < 400 && Game.cpu.bucket > 7000) {
        let newName = 'Priest' + "-" + room.name;
        room.memory.spawn_list.push([MOVE], newName, {memory: {role: 'Priest', homeRoom: room.name, roomsVisited: []}});
        console.log('Adding Priest to Spawn List: ' + newName);
    }

    // Name prefix is 'Clearer-', not WallClearer (that role is command-queued).
    if (room.controller.level === 8 && clearers < 1 && room.memory.danger && room.memory.danger_timer > 300 && RampartDefenders === 0 && !queuedWithPrefix(room, 'Clearer-')) {
        let hostileCreeps = room.find(FIND_HOSTILE_CREEPS);
        hostileCreeps = _.filter(hostileCreeps, (c:any) => c.owner.username !== "Invader");
        if(hostileCreeps.length) {
            let attackCreeps = _.filter(hostileCreeps, (c:any) => c.getActiveBodyparts(ATTACK) > 0);
            let rangedAttackCreeps = _.filter(hostileCreeps, (c:any) => c.getActiveBodyparts(RANGED_ATTACK) > 0);
            if(attackCreeps.length > 0 || rangedAttackCreeps.length > 0) {
                if(attackCreeps.length) {
                    let newName = 'Clearer-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
                    // Boosted body used to be queued before this check: missing
                    // labs threw, and empty labs parked the creep for ~400 ticks
                    // during the attack it was meant for.
                    // storage+terminal: market buys land in the terminal (boostStock).
                    let canBoost = boostStock(room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) >= 300 && boostStock(room, RESOURCE_CATALYZED_UTRIUM_ACID) >= 900 &&
                        boostStock(room, RESOURCE_CATALYZED_GHODIUM_ALKALIDE) >= 300 &&
                        room.memory.labs && room.memory.labs.outputLab2 && room.memory.labs.outputLab3 && room.memory.labs.outputLab7;
                    // Charge FIRST, then decide the body: a refused slot (someone
                    // else's mineral is already in it) must not be advertised in
                    // boostlabs, or the creep walks to the wrong compound and parks.
                    const clOk3 = canBoost && chargeBoostSlot(room, "lab3", 900, newName);
                    const clOk2 = canBoost && chargeBoostSlot(room, "lab2", 300, newName);
                    const clOk7 = canBoost && chargeBoostSlot(room, "lab7", 300, newName);
                    if(clOk3 && clOk2 && clOk7) {
                        room.memory.spawn_list.push(
                          [TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK],
                          newName,
                          { memory: { role: 'clearer', boostlabs:[room.memory.labs.outputLab2,room.memory.labs.outputLab3,room.memory.labs.outputLab7], boosted:true }}
                        );
                        console.log('Adding Clearer to Spawn List: ' + newName);
                    }
                    else {
                        // Give back any slot that DID take the charge — a
                        // half-charged owner is minerals hauled for a creep that
                        // will never arrive to use them.
                        if(clOk3 || clOk2 || clOk7) refundBoostOwner(room, newName);
                        room.memory.spawn_list.push(
                          [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK],
                          newName,
                          { memory: { role: 'clearer' }}
                        );
                        console.log('Adding Clearer to Spawn List: ' + newName);
                    }
                }
            }
            else {
                let newName = 'Clearer-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(
                  [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK],
                  newName,
                  { memory: { role: 'clearer' }}
                );
                console.log('Adding Clearer to Spawn List: ' + newName);
            }
        }

    }



    if(SpecialRepairers < 4 && storage && storage.store[RESOURCE_ENERGY] > 25000 && room.memory.danger && room.controller.level >= 7 && (room.memory.danger || room.memory.danger_timer > 0)) {
        let rampartsInDangerOfDying = false;
        let rampartsInDangerOfDying4Mil = false;
        if(rampartsInRoomBelowTwelveMil && rampartsInRoomBelowTwelveMil.length > 0 && storage) {
            rampartsInRoomBelowTwelveMil = rampartsInRoomBelowTwelveMil.filter(function(r) {return storage.pos.getRangeTo(r) >= 8 && storage.pos.getRangeTo(r) <= 10;})
            let rampartsInRoomBelow6Mil = rampartsInRoomBelowTwelveMil.filter(function(r) {return r.hits <= 8050000;})
            let rampartsInRoomBelow4Mil = rampartsInRoomBelow6Mil.filter(function(r) {return r.hits <= 7050000;})
            if(rampartsInRoomBelow4Mil.length > 0) {
                rampartsInDangerOfDying4Mil = true;
            }
            else {
                if(room.controller.level == 8 && rampartsInRoomBelowTwelveMil.length > 0) {
                    rampartsInDangerOfDying = true;
                }
                else if(room.controller.level == 7 && rampartsInRoomBelow6Mil.length > 0) {
                    rampartsInDangerOfDying = true;
                }
            }

        }


        if((room.memory.danger_timer > 200 && SpecialRepairers < 1 || rampartsInDangerOfDying && SpecialRepairers < 1 || rampartsInDangerOfDying4Mil && SpecialRepairers < 4 && room.energyCapacityAvailable >= 4000) && !queuedWithPrefix(room, 'SpecialRepair')) {

            let newName = 'SpecialRepair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
            console.log('Adding SpecialRepair to Spawn List: ' + newName);

            // if room memory danger
            if(room.controller.level >= 7) {
                // boostStock = storage + terminal; and a refused slot means no
                // boostlabs (the creep would otherwise park at a lab holding
                // somebody else's compound).
                if(boostStock(room, RESOURCE_CATALYZED_LEMERGIUM_ACID) >= 1080 && room.memory.labs && room.memory.labs.outputLab1 && room.memory.danger && room.memory.danger_timer >= 50
                        && chargeBoostSlot(room, "lab1", 1080, newName)) {
                    room.memory.spawn_list.push([WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'SpecialRepair', boostlabs:[room.memory.labs.outputLab1]}});
                }
                else {
                    room.memory.spawn_list.push([WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'SpecialRepair'}});
                }

                if(!queuedWithPrefix(room, 'SpecialCarry')) {
                    let newName2 = 'SpecialCarry-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY], newName2, {memory: {role: 'SpecialCarry'}});
                    console.log('Adding SpecialCarry to Spawn List: ' + newName);
                }
            }
            else if(room.controller.level == 6) {
                if(boostStock(room, RESOURCE_CATALYZED_LEMERGIUM_ACID) >= 540 && room.memory.labs && room.memory.labs.outputLab1 && room.memory.danger && room.memory.danger_timer >= 50
                        && chargeBoostSlot(room, "lab1", 540, newName)) {
                    room.memory.spawn_list.push([WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE], newName, {memory: {role: 'SpecialRepair', boostlabs:[room.memory.labs.outputLab1]}});
                }
                else {
                    room.memory.spawn_list.push([WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE], newName, {memory: {role: 'SpecialRepair'}});
                }

                if(!queuedWithPrefix(room, 'SpecialCarry')) {
                    let newName2 = 'SpecialCarry-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY], newName2, {memory: {role: 'SpecialCarry'}});
                    console.log('Adding SpecialCarry to Spawn List: ' + newName);
                }
            }


        }
    }
    if((room.memory.NukeRepair && repairers < 4 && !room.memory.danger || room.memory.defence && room.memory.defence.nuke && repairers < 1) && Game.cpu.bucket > 150 && storage && storage.store[RESOURCE_ENERGY] > 75000) {
        let name = 'Repair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
            if(room.controller.level >= 7 && room.find(FIND_NUKES).length > 2 && boostStock(room, RESOURCE_CATALYZED_LEMERGIUM_ACID) >= 1980 && room.memory.labs && room.memory.labs.outputLab1
                    && chargeBoostSlot(room, "lab1", 660, name)) {
                room.memory.spawn_list.push([WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,
                    CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,
                    MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], name, {memory: {role: 'repair', homeRoom: room.name, boostlabs:[room.memory.labs.outputLab1]}});
            }
            else {
                room.memory.spawn_list.push([WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,
                    CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,
                    MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], name, {memory: {role: 'repair', homeRoom: room.name}});
            }

        console.log('Adding Repair to Spawn List: ' + name);
    }


    if(room.controller.level >= 2 ) {
        for(let remoteRoom of roomsToRemote) {
            if(remoteRoom !== room.name && Game.map.getRoomStatus(remoteRoom).status == "normal") {
                // "No `energy` key" IS the definition of an unscouted entry —
                // manageRemotes uses exactly that test to build its `unscouted`
                // list. The old gate also demanded the entry have at most ONE
                // key, which made any extra bookkeeping field a permanent
                // scouting block: scanRemoteThreats writes `hot` on any entry
                // that is `active`, including a scout-queued one, and nothing
                // ever clears `hot` on an entry with no miner or carrier to
                // trigger the cooldown. That entry then had two keys forever
                // and could never be scouted or reconsidered.
                if(room.memory.resources[remoteRoom].active &&
                !room.memory.resources[remoteRoom].energy
                ) {
                    // "Staff your own sources before you go looking for more"
                    // was written as a flat `> 1`, which a ONE-SOURCE commune
                    // can never satisfy — its miner census tops out at 1, so
                    // the room could not spawn a 50-energy [MOVE] scout ever,
                    // and therefore could never acquire a first remote. Live
                    // VPS W2N1 is exactly that: one source, RCL6, zero remotes,
                    // one miner standing in the room. Ask for a miner per local
                    // source instead, still capped at the original bar of two.
                    const localSources = room.find(FIND_SOURCES).length;
                    if(scouts < 1 && EnergyMinersInRoom >= Math.min(2, localSources)) {
                        let newName = 'Scout-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                        room.memory.spawn_list.push([MOVE], newName, {memory: {role: 'scout', homeRoom: room.name, targetRoom: remoteRoom}});
                        console.log('Adding Scout to Spawn List: ' + newName);
                    }
                    break;
                }
            }
        }
    }


    /*
     * WAS `storage.store[RESOURCE_ENERGY] > 250000`, which is a bank an RCL6
     * room never sees — so live E37N59 sat on 70,000 un-mined H with an
     * extractor built and H at a 4x price spike, and had mined exactly zero.
     *
     * The gate is mispriced by two orders of magnitude. One MineralMiner is a
     * ~1000-energy [WORK*n,CARRY*n,MOVE] body that lives 1500 ticks and clears
     * a good fraction of a 50,000-mineral deposit per lifetime; against a 250k
     * bank requirement that is a 250:1 margin on the thing it guards. What it
     * actually needs is (a) somewhere to sell/react — a terminal — and (b)
     * enough energy that the body is not competing with the fill loop.
     */
    if (MineralMiners < 1 && room.controller.level >= 6 && room.terminal && room.memory.Structures && room.memory.Structures.extractor && Game.getObjectById(room.memory.Structures.extractor) && !room.memory.danger && room.memory.danger_timer == 0 && storage && storage.store[RESOURCE_ENERGY] > 20000 && storage.store.getUsedCapacity() < 975000 && Game.cpu.bucket > 8000) {
        // findMineral() returns undefined in a room with no mineral / no cache.
        let mineral: any = Game.getObjectById(room.memory.mineral) || room.findMineral();
        if(mineral && mineral.mineralAmount > 0 && storage.store[mineral.mineralType] < 100000) {
            let newName = 'MineralMiner-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.push(getBody([WORK,WORK,CARRY,CARRY,MOVE], room, 50), newName, {memory: {role: 'MineralMiner'}});
            console.log('Adding Mineral Miner to Spawn List: ' + newName);
        }
    }


    if(room.memory.danger == true && room.memory.danger_timer >= 35 && fillers >= 2 && storage && storage.store[RESOURCE_ENERGY] > 10000) {
        let addtolist = true;
        let HostileCreeps = room.find(FIND_HOSTILE_CREEPS);
        HostileCreeps = HostileCreeps.filter(function(c) {return c.owner.username !== "Invader" && c.ticksToLive > 350;});
        let inRangeFourteen = false;
        if(HostileCreeps.length > 0) {
            if(storage && storage.pos.getRangeTo(storage.pos.findClosestByRange(HostileCreeps)) <= 14) {


                // `room.memory.labs &&`: both bodies below read
                // room.memory.labs.outputLab4/outputLab2 unconditionally, same
                // as the sibling boost gates elsewhere in this file.
                if(HostileCreeps.length > 4 && RampartDefenders <= 1 &&
                    boostStock(room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) >= 300 &&
                    boostStock(room, RESOURCE_CATALYZED_KEANIUM_ALKALIDE) >= 1200 &&
                    room.memory.labs && room.memory.labs.outputLab2 && room.memory.labs.outputLab4 &&
                    (RangedRampartDefenders < 3 && room.controller.level == 7 || RangedRampartDefenders  < 2 && room.controller.level == 8) &&
                    !queuedWithPrefix(room, 'RRD'))  {
                    if(room.controller.level == 8) {

                        let body = [RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                    RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                    RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                    RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                    RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                    RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                    RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                    RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                    MOVE,MOVE,MOVE,MOVE,MOVE,
                                    MOVE,MOVE,MOVE,MOVE,MOVE];
                        let newName = 'RRD-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                        // Charge first, advertise only the slots that took it.
                        const rrdL2 = chargeBoostSlot(room, "lab2", 300, newName);
                        const rrdL4 = chargeBoostSlot(room, "lab4", 1200, newName);
                        const rrdLabs: string[] = [];
                        if(rrdL4) rrdLabs.push(room.memory.labs.outputLab4);
                        if(rrdL2) rrdLabs.push(room.memory.labs.outputLab2);
                        const rrdMem: any = { role: 'RRD', homeRoom: room.name };
                        if(rrdLabs.length) rrdMem.boostlabs = rrdLabs;
                        room.memory.spawn_list.push(body, newName, { memory: rrdMem } );
                        console.log('Adding RangedRampartDefender to Spawn List: ' + newName + (rrdLabs.length ? '' : ' (boost refused)'));

                    }
                    else if(room.controller.level == 7) {

                        let body = [TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,
                                    RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                    RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                    RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                    RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                    RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                    RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                    RANGED_ATTACK,RANGED_ATTACK,MOVE,MOVE,MOVE,
                                    MOVE,MOVE,MOVE,MOVE,MOVE,
                                    MOVE,MOVE,MOVE,MOVE,MOVE];
                        let newName = 'RRD-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                        // Charge first, advertise only the slots that took it.
                        const rrd7L2 = chargeBoostSlot(room, "lab2", 240, newName);
                        const rrd7L4 = chargeBoostSlot(room, "lab4", 960, newName);
                        const rrd7Labs: string[] = [];
                        if(rrd7L4) rrd7Labs.push(room.memory.labs.outputLab4);
                        if(rrd7L2) rrd7Labs.push(room.memory.labs.outputLab2);
                        const rrd7Mem: any = { role: 'RRD', homeRoom: room.name };
                        if(rrd7Labs.length) rrd7Mem.boostlabs = rrd7Labs;
                        room.memory.spawn_list.push(body, newName, { memory: rrd7Mem } );
                        console.log('Adding RangedRampartDefender to Spawn List: ' + newName + (rrd7Labs.length ? '' : ' (boost refused)'));

                    }

                }


                inRangeFourteen = true;
            }
        }

        if(inRangeFourteen && RampartDefenders < 1 && !queuedWithPrefix(room, 'RampartDefender')) {
            let found = false;
            for(let enemyCreep of HostileCreeps) {
                for(let part of enemyCreep.body) {
                    if(part.type == ATTACK || part.type == WORK) {
                        found = true;
                    }
                }
            }
            if(found == false && RampartDefenders == 1) {
                addtolist = false;
            }
            if(addtolist) {
                let newName = 'RampartDefender-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                if(room.controller.level >= 7) {
                    let body;
                    if(found == false) {
                        if(room.controller.level=== 7) {
                            body = [ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE];

                        }
                        else {
                        body = [ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE];

                        }
                    }
                    if(found == true) {
                        if(room.controller.level=== 7) {
                            body = [ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE];

                        }
                        else {
                        body = [ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE];

                        }
                        // body = [ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE];
                    }
                    // && HostileCreeps.length > 1
                    // boostStock: XUH2O bought on the market lands in the TERMINAL,
                    // and this gate only ever looked at storage.
                    // A refused lab3 (someone else's mineral in the slot) now falls
                    // through to the unboosted body instead of advertising it.
                    const rdWant = boostStock(room, RESOURCE_CATALYZED_UTRIUM_ACID) >= 990 && room.controller.level >= 7 && room.memory.labs && room.memory.labs.outputLab3 && (HostileCreeps.length > 1 || HostileCreeps.length == 1 && room.controller.level == 7 && HostileCreeps[0].getActiveBodyparts(HEAL) >= 16);
                    // >= 2, not > 2: the outer gate admits length 2, but
                    // the arms here were `> 2` / `== 1`, so EXACTLY two
                    // hostiles - the canonical attacker+healer duo - fell
                    // between them and queued no defender at all (the
                    // unboosted else below binds to the OUTER if, which
                    // was taken). Two hostiles get the full 990 boost.
                    const rdCharged = rdWant && HostileCreeps.length >= 1 &&
                        chargeBoostSlot(room, "lab3", HostileCreeps.length >= 2 ? 990 : 630, newName);
                    if(rdCharged) {
                        room.memory.spawn_list.push(body, newName, {memory: {role: 'RampartDefender', homeRoom: room.name, boostlabs:[room.memory.labs.outputLab3]}});
                    }

                    else {
                        room.memory.spawn_list.push(body, newName, {memory: {role: 'RampartDefender', homeRoom: room.name}});
                    }
                }
                else {
                    let body = getBody([ATTACK,ATTACK,ATTACK,ATTACK,MOVE], room, 50)
                    room.memory.spawn_list.push(body, newName, {memory: {role: 'RampartDefender', homeRoom: room.name}});
                }
                console.log('Adding RampartDefender to Spawn List: ' + newName);
            }
        }
    }


    if(SneakyControllerUpgraders < 1 && room.controller.level >= 5 && !room.memory.danger && storage && storage.store[RESOURCE_ENERGY] > 180000 && Game.cpu.bucket > 7000) {
        for(let roomName of Memory.keepAfloat) {
            if(Game.map.getRoomLinearDistance(room.name, roomName) <= 4 && Game.rooms[roomName] && Game.rooms[roomName].controller && Game.rooms[roomName].controller.my) {
                if(Game.rooms[roomName].controller.level == 2 && Game.rooms[roomName].controller.ticksToDowngrade < 4000 ||
                    Game.rooms[roomName].controller.level == 3 && Game.rooms[roomName].controller.ticksToDowngrade < 10000 ||
                    Game.rooms[roomName].controller.level == 4 && Game.rooms[roomName].controller.ticksToDowngrade < 20000 ||
                    Game.rooms[roomName].controller.level == 5 && Game.rooms[roomName].controller.ticksToDowngrade < 50000 ||
                    Game.rooms[roomName].controller.level == 6 && Game.rooms[roomName].controller.ticksToDowngrade < 80000 ||
                    Game.rooms[roomName].controller.level == 7 && Game.rooms[roomName].controller.ticksToDowngrade < 95000 ||
                    Game.rooms[roomName].controller.level == 8 && Game.rooms[roomName].controller.ticksToDowngrade < 135000) {

                        let hostileCreeps = Game.rooms[roomName].find(FIND_HOSTILE_CREEPS);
                        hostileCreeps = hostileCreeps.filter(function(c) {return c.owner.username !== "Invader" && c.ticksToLive > 250 && (c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0);});

                        if(hostileCreeps.length) {
                            global.SDB(room.name, roomName, true, true);
                        }

                        let body = []

                        if(hostileCreeps.length) {
                            body = [CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,MOVE,WORK,CARRY,MOVE]
                        }
                        else {
                            body = [CARRY,MOVE,MOVE,WORK,CARRY,MOVE]
                        }
                        if(hostileCreeps.length) {
                            let newName = 'SneakyControllerUpgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                            room.memory.spawn_list.push(body, newName, {memory: {role: 'SneakyControllerUpgrader',homeRoom:room.name, targetRoom: roomName , locked_away: 0}});
                            console.log('Adding Sneaky Controller Upgrader to Spawn List: ' + newName);
                        }
                        else {
                            let newName1 = 'SneakyControllerUpgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                            room.memory.spawn_list.push(body, newName1, {memory: {role: 'SneakyControllerUpgrader',homeRoom:room.name, targetRoom: roomName , locked_away: 0}});
                            console.log('Adding Sneaky Controller Upgrader to Spawn List: ' + newName1);

                            let newName2 = 'SneakyControllerUpgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                            room.memory.spawn_list.push(body, newName2, {memory: {role: 'SneakyControllerUpgrader',homeRoom:room.name, targetRoom: roomName , locked_away: 0}});
                            console.log('Adding Sneaky Controller Upgrader to Spawn List: ' + newName2);

                            let newName3 = 'SneakyControllerUpgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                            room.memory.spawn_list.push(body, newName3, {memory: {role: 'SneakyControllerUpgrader',homeRoom:room.name, targetRoom: roomName , locked_away: 0}});
                            console.log('Adding Sneaky Controller Upgrader to Spawn List: ' + newName3);

                            let newName4 = 'SneakyControllerUpgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                            room.memory.spawn_list.push(body, newName4, {memory: {role: 'SneakyControllerUpgrader',homeRoom:room.name, targetRoom: roomName , locked_away: 0}});
                            console.log('Adding Sneaky Controller Upgrader to Spawn List: ' + newName4);
                        }
                        break;

                }

            }
            else if(!Game.rooms[roomName] || Game.rooms[roomName] && Game.rooms[roomName].controller && !Game.rooms[roomName].controller.my) {
                Memory.keepAfloat = Memory.keepAfloat.filter(function(roomname) {return roomname !== roomName;});
            }
        }

    }



    // if(room.memory.danger == true && defenders < 4 && RampartDefenders >= 4 || RampartDefenders == 1 && room.memory.danger == true && defenders < 6) {
    //     let HostileCreeps = room.find(FIND_HOSTILE_CREEPS);
    //     let found = false;
    //     for(let enemyCreep of HostileCreeps) {
    //         for(let part of enemyCreep.body) {
    //             if(part.type == ATTACK) {
    //                 found = true;
    //             }
    //         }
    //     }
    //     if(found == false && defenders < 6) {
    //         let newName = 'Defender-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
    //         room.memory.spawn_list.push(getBody([RANGED_ATTACK,RANGED_ATTACK,MOVE], room, 50), newName, {memory: {role: 'defender', homeRoom: room.name}});
    //         console.log('Adding Defender to Spawn List: ' + newName);
    //     }
    //     else if (found == true && RampartDefenders >= 4) {
    //         let newName = 'Defender-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
    //         room.memory.spawn_list.push(getBody([RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,MOVE], room, 50), newName, {memory: {role: 'defender', homeRoom: room.name}});
    //         console.log('Adding Defender to Spawn List: ' + newName);
    //     }
    // }




    // Game.rooms["E41N58"].memory.spawn_list.push([MOVE,CLAIM], 'Claimer-' + "yogi" + "-" + "E41N58", {memory: {role: 'claimer', targetRoom: "E41N59", homeRoom:"E41N58"}});

    if(!Memory.target_colonise) {
        Memory.target_colonise = {};
    }
    let target_colonise;
    if(Memory.target_colonise) {
        target_colonise = Memory.target_colonise.room;
    }
    if(target_colonise) {
        let distance_to_target_room = Game.map.getRoomLinearDistance(room.name, target_colonise);
        // need to check if this room is the closest room level 7 or higher or not

        // Assuming you have access to your game state and rooms
        let closestRoom = null;
        let closestDistance = Infinity;
        let maxEnergy = 0;
        // A colony is only as good as the room paying for it: BOTH gates below
        // (claimer, ContainerBuilder) need >10k in storage, so a broke room
        // winning the "closest" contest parks the whole colonisation with no
        // log and no retry. Live: E9S2 was claimed, then its spawn site sat at
        // 6240/15000 forever because supporter E11S2 was drained to 1.1k while
        // E11S5 (one room further out) held 937k. Prefer rooms that can pay;
        // fall back to the plain closest when nobody can.
        const COLONY_FUND = 10000;
        let fallbackRoom = null;
        let fallbackDistance = Infinity;
        const targetRoomName = target_colonise; // Assuming target_colonise contains the target room name

        // Loop through all your rooms
        for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];

        // Check if the room has a controller, and the controller is yours, and it is at least level 7
        if (room.controller && room.controller.my && room.controller.level >= 3) {
            // Calculate the distance between the current room and the target room
            const distance = Game.map.getRoomLinearDistance(room.name, targetRoomName);

            // Get the amount of energy in the storage of the current room
            const energyInStorage = room.storage ? room.storage.store[RESOURCE_ENERGY] || 0 : 0;

            if (distance < fallbackDistance) {
                fallbackRoom = room;
                fallbackDistance = distance;
            }
            if (energyInStorage <= COLONY_FUND) {
                continue;
            }

            // Update the closest room if this room is closer to the target room or has more energy
            if (distance < closestDistance || (distance === closestDistance && energyInStorage > maxEnergy)) {
            closestRoom = room;
            closestDistance = distance;
            maxEnergy = energyInStorage;
            }
        }
        }
        if (!closestRoom) {
            closestRoom = fallbackRoom;
        }

        if(closestRoom && closestRoom.name == room.name) {

            if(target_colonise && Memory.CanClaimRemote >= 1 && claimers < 1 && room.controller.level >= 3 && Game.time % 800 <= 100 && storage && storage.store[RESOURCE_ENERGY] > 10000 && distance_to_target_room <= 7 && ((Game.rooms[target_colonise] && !Game.rooms[target_colonise].controller.my) || Game.rooms[target_colonise] == undefined)) {
                let newName = 'Claimer-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push([MOVE,CLAIM], newName, {memory: {role: 'claimer', targetRoom: target_colonise, homeRoom:room.name}});
                console.log('Adding Claimer to Spawn List: ' + newName);
            }


        // reformat this part into loop through my rooms and then see if it has a spawn and if not if it has a spawn construction site then spawn builders
            // _.forEach(Game.rooms, function(NonSpawnRoom) {
            //     if(everyRoom && everyRoom.memory && !everyRoom.memory.danger && everyRoom.find(FIND_MY_CONSTRUCTION_SITES).length == 0) {
            //         everyRoom.memory.keepTheseRoads = [];
            //     }
            // });

            if(target_colonise && RangedAttackers < 2 && room.controller.level >= 7 && storage && storage.store[RESOURCE_ENERGY] > 180000 && distance_to_target_room <= 7 && Game.rooms[target_colonise] && (Game.rooms[target_colonise].find(FIND_MY_SPAWNS).length == 0 || Game.rooms[target_colonise].controller.level <= 3) && Game.rooms[target_colonise].controller.level >= 1 && (Game.rooms[target_colonise].controller.my || !Game.rooms[target_colonise].controller.my && !Game.rooms[target_colonise].find(FIND_MY_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_TOWER}).length)  && Game.time - Memory.target_colonise.lastSpawnRanger > 1500 && !Game.rooms[target_colonise].controller.safeMode) {
                // `room.memory.labs &&`: the boosted arm reads
                // room.memory.labs.outputLab4; the unboosted else covers the rest.
                // boostStock (storage+terminal), and charge BEFORE committing to
                // the boosted memory so a refused lab4 falls through to the
                // unboosted body below instead of parking the creep at a lab.
                let raName = 'RangedAttacker-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                if(boostStock(room, RESOURCE_CATALYZED_KEANIUM_ALKALIDE) >= 45000 && room.memory.labs && room.memory.labs.outputLab4 && Game.rooms[target_colonise].controller.level < 3
                        && chargeBoostSlot(room, "lab4", 600, raName)) {
                    room.memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,HEAL,HEAL,HEAL,HEAL,HEAL], raName, {memory: {role: 'RangedAttacker', targetRoom: target_colonise, homeRoom: room.name, sticky:true, boostlabs: [room.memory.labs.outputLab4],ignore:true }});

                    console.log('Adding Defending-Ranged-Attacker to Spawn List: ' + raName);

                    Memory.target_colonise.lastSpawnRanger = Game.time - (distance_to_target_room * 100) ;
                }
                else {
                    let newName = 'RangedAttacker-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,HEAL,HEAL,HEAL,HEAL,HEAL], newName, {memory: {role: 'RangedAttacker', targetRoom: target_colonise, homeRoom: room.name, sticky:true,ignore:true}});

                    console.log('Adding Defending-Ranged-Attacker to Spawn List: ' + newName);

                    Memory.target_colonise.lastSpawnRanger = Game.time - (distance_to_target_room * 100) ;
                }

            }
        }



    }

    // Spawnless owned rooms (W3N3) are not always Memory.target_colonise.
    // Must run even when colonise is {}.
    maybeSpawnColonyBuilder(room);




    // if(billtongs < 1 && Game.cpu.bucket > 9500 && room.controller.level >= 4 && room.controller.level !== 8 && storage && storage.store[RESOURCE_ENERGY] > 320000 && !room.memory.danger && Memory.CPU.fiveHundredTickAvg.avg < Game.cpu.limit - 4) {
    //     let newName = 'Billtong-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
    //     room.memory.spawn_list.push(getBody([WORK,CARRY,MOVE,MOVE], room, 8), newName, {memory: {role: 'billtong', homeRoom:room.name}});
    //     console.log('Adding Billtong to Spawn List: ' + newName);
    // }


    // Four hand-armed raid rungs used to sit here — DrainTower, RemoteDismantler,
    // Dismantler and Annoy — each switched off by a condition that can never be
    // true (`count < 0`, `let annoyRoom = false`) and each aimed at a hardcoded
    // room (E15S37/E15S38, E45N58) from a campaign that is long over. Deleted
    // with their census counters; re-add from a Command if a raid needs them.


    // Sweep floor loot (drops / tombs / ruins from dead creeps & destroyed structures)
    const tombRuinLoot =
        room.find(FIND_TOMBSTONES, { filter: (t) => _.sum(t.store) > 0 }).length +
        room.find(FIND_RUINS, { filter: (r) => _.sum(r.store) > 0 }).length;
    // RCL1–3 drop-mine piles sit on the source tile and hit 50e in ~13 ticks
    // of a 2W miner. Carriers already haul those; a sweeper here is a 150e
    // HOL tax on the upgraders. Only tombs/ruins or stray (off-source) piles.
    let looseLootCount = tombRuinLoot;
    if(room.controller.level < 4) {
        if(looseLootCount === 0) {
            const sources = room.find(FIND_SOURCES);
            looseLootCount = room.find(FIND_DROPPED_RESOURCES, {filter: (r) =>
                r.amount >= 50 && !sources.some((s) => s.pos.getRangeTo(r) <= 1)}).length;
        }
    }
    else {
        looseLootCount += room.find(FIND_DROPPED_RESOURCES, { filter: (r) => r.amount >= 50 }).length;
    }
    // RCL1–3: one small sweeper if there's real loot; RCL4+: scale with storage
    const wantSweepers =
        looseLootCount === 0
            ? 0
            : room.controller.level < 4
              ? 1
              : Math.max(1, Math.floor((looseLootCount + 1) / 3));
    if (
        wantSweepers > 0 &&
        sweepers < wantSweepers &&
        !room.memory.danger &&
        (room.memory.danger_timer == null || room.memory.danger_timer === 0)
    ) {
        const body =
            room.controller.level < 4
                ? [CARRY, CARRY, MOVE]
                : [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE];
        const newName = "Sweeper-" + Math.floor(Math.random() * Game.time) + "-" + room.name;
        room.memory.spawn_list.push(body, newName, { memory: { role: "sweeper" } });
        console.log("Adding Sweeper to Spawn List: " + newName);
    }

    if(room.controller.level >= 4 && room.energyAvailable >= 1050 && (!room.memory.danger || room.controller.safeMode && room.controller.safeMode > 0) && room.controller.safeModeAvailable <= 1 && SafeModers < 1 && storage && storage.store[RESOURCE_GHODIUM] >= 1000) {
        let newName = 'SafeModer-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
        room.memory.spawn_list.push([MOVE,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY], newName, {memory: {role: 'SafeModer'}});
        console.log('Adding SafeModer to Spawn List: ' + newName);
    }


    // _.forEach(resourceData, function(data, targetRoomName) {
    //     if(room.controller.level >= 5) {
    //         if(!room.memory.danger && Memory.tasks.wipeRooms.killCreeps.includes(targetRoomName) && RangedAttackers < 1) {
    //             let newName = 'RangedAttacker-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
    //             let body = getBody([RANGED_ATTACK,MOVE], room, 20);
    //             room.memory.spawn_list.push(body, newName, {memory: {role: 'RangedAttacker', targetRoom: targetRoomName, homeRoom: room.name}});
    //             console.log('Adding Defending Ranged-Attacker to Spawn List: ' + newName);
    //         }
    //     }
    //     else {
    //         if(!room.memory.danger && Memory.tasks.wipeRooms.killCreeps.includes(targetRoomName) && attackers < 1) {
    //             let newName = 'Attacker-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
    //             let body = getBody([MOVE,ATTACK,ATTACK], room, 18);
    //             room.memory.spawn_list.push(body, newName, {memory: {role: 'attacker', targetRoom: targetRoomName, homeRoom:room.name}});
    //             console.log('Adding Defending-Attacker to Spawn List: ' + newName);
    //         }
    //     }
    // });

    // Was `_.forEach(Game.rooms)` wrapped around `_.forEach(resourceData)` with
    // a `thisRoom.name == targetRoomName` test inside — i.e. |rooms| x |remotes|
    // iterations to find the one visible room per remote that a direct lookup
    // gives for free. Same pairs, same body.
    {
        _.forEach(resourceData, function(data, targetRoomName) {
            const thisRoom = Game.rooms[targetRoomName as string];
            if(thisRoom && !room.memory.danger && activeRemotes.includes(targetRoomName) && room.storage && room.storage.store[RESOURCE_ENERGY] > 10000) {
                if(thisRoom.memory.roomData && (thisRoom.memory.roomData.has_hostile_structures || thisRoom.memory.roomData.has_hostile_creeps) && !thisRoom.memory.roomData.has_attacker&& attackers < 1) {
                    if(thisRoom.memory.roomData.has_hostile_structures && attackers < 1|| thisRoom.memory.roomData.has_hostile_creeps && !thisRoom.memory.roomData.has_attacker && attackers < 1 && thisRoom.memory.roomData.has_only_invader) {
                        let body = [];

                        if(thisRoom.memory.roomData.has_hostile_structures) {
                            thisRoom.memory.roomData.has_hostile_structures = false;
                            thisRoom.memory.roomData.has_attacker = true;
                            if(room.controller.level >= 7) body = [MOVE,ATTACK,ATTACK,MOVE,ATTACK,ATTACK,MOVE,ATTACK,ATTACK,MOVE,ATTACK,ATTACK,MOVE,ATTACK,ATTACK,MOVE,ATTACK,ATTACK,MOVE,ATTACK,ATTACK];
                            else if (room.controller.level >= 5) body = [MOVE,ATTACK,ATTACK,MOVE,ATTACK,ATTACK,MOVE,ATTACK,ATTACK,MOVE,ATTACK,ATTACK];
                            else if(room.controller.level === 4) body = [MOVE,ATTACK,ATTACK,MOVE,ATTACK,ATTACK, MOVE,ATTACK,ATTACK];
                            else body = [MOVE,ATTACK,ATTACK,MOVE,ATTACK,ATTACK];
                        }
                        else if(thisRoom.memory.roomData.has_hostile_creeps && thisRoom.memory.roomData.hostile_body_type) {
                            thisRoom.memory.roomData.has_attacker = true;
                            thisRoom.memory.roomData.has_hostile_creeps = false;
                            let data = thisRoom.memory.roomData.hostile_body_type;
                            let bodyPartsCount = data.heal + data.attack + data.ranged_attack;
                            while(body.length < bodyPartsCount) {
                                body.push(ATTACK,MOVE,ATTACK);
                            }
                            delete thisRoom.memory.roomData.hostile_body_type;
                        }

                        let newName = 'Attacker-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                        room.memory.spawn_list.push(body, newName, {memory: {role: 'attacker', targetRoom: thisRoom.name, homeRoom:room.name}});
                        console.log('Adding Defending-Attacker to Spawn List: ' + newName);
                    }
                    else if(thisRoom.memory.roomData.has_hostile_creeps && !thisRoom.memory.roomData.has_only_invader && thisRoom.memory.roomData.hostile_body_type && !thisRoom.memory.roomData.has_attacker && RangedAttackers < 1) {
                        let data = thisRoom.memory.roomData.hostile_body_type;
                        let healAmount = data.heal * 12;
                        let attackAmount = data.attack * 30;
                        let rangedAttackAmount = data.ranged_attack * 10;

                        let myNeededHeal = Math.floor((attackAmount + rangedAttackAmount) / 12) - 2;
                        let myNeededRangedAttack = Math.floor(healAmount / 10) + 5;

                        // Cap at a legal 50-part body (h + r + equal MOVE =>
                        // h + r <= 25), keeping the heal:ranged ratio. The old
                        // `if(body.length <= 50)` guard below just skipped the
                        // spawn when boosted-TOUGH inflated the counts - and
                        // the state clears live INSIDE that guard, so the
                        // branch re-fired (and logged the whole body array)
                        // every tick forever.
                        if(myNeededHeal < 0) myNeededHeal = 0;
                        const totalNeeded = myNeededHeal + myNeededRangedAttack;
                        if(totalNeeded > 25) {
                            myNeededHeal = Math.floor(myNeededHeal * 25 / totalNeeded);
                            myNeededRangedAttack = 25 - myNeededHeal;
                        }

                        let healArray = [];
                        let rangedAttackArray = [];
                        let moveArray = [];

                        if(myNeededHeal > 0)
                        healArray = Array(myNeededHeal).fill(HEAL);

                        if(myNeededRangedAttack > 0)
                        rangedAttackArray = Array(myNeededRangedAttack).fill(RANGED_ATTACK);

                        if(myNeededHeal + myNeededRangedAttack > 0)
                        moveArray= Array(myNeededRangedAttack + myNeededHeal).fill(MOVE);


                        let body: BodyPartConstant[] = [...healArray, ...rangedAttackArray, ...moveArray];

                        console.log(body, room.name)

                        if(body.length <= 50) {
                            let newName = 'RangedAttacker-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                            room.memory.spawn_list.push(body, newName, {memory: {role: 'RangedAttacker', targetRoom: thisRoom.name, homeRoom:room.name}});
                            console.log('Adding Defending-RangedAttacker to Spawn List: ' + newName);
                            thisRoom.memory.roomData.has_hostile_creeps = false;
                            delete thisRoom.memory.roomData.hostile_body_type;
                            thisRoom.memory.roomData.has_attacker = true;
                        }
                    }
                }


                // if(room.controller.level <= 4 && thisRoom.memory.roomData && thisRoom.memory.roomData.has_safe_creeps && !thisRoom.memory.roomData.has_attacker && thisRoom.controller && !thisRoom.controller.my && RangedAttackers < 1 && thisRoom.find(FIND_HOSTILE_CREEPS).length == 1) {
                //     let newName = 'RangedAttacker-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                //     room.memory.spawn_list.push([MOVE,RANGED_ATTACK], newName, {memory: {role: 'RangedAttacker', targetRoom: thisRoom.name, homeRoom: room.name}});
                //     console.log('Adding Annoying-Ranged-Attacker to Spawn List: ' + newName);
                //     thisRoom.memory.roomData.has_safe_creeps = false;
                // }
                if(room.controller.level <= 4 && thisRoom.memory.roomData && thisRoom.memory.roomData.has_safe_creeps && !thisRoom.memory.roomData.has_attacker && thisRoom.controller && !thisRoom.controller.my && thisRoom.controller.level === 0 && attackers < 1 && thisRoom.find(FIND_HOSTILE_CREEPS).length >= 1) {
                    let newName = 'Attacker-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push([MOVE,ATTACK], newName, {memory: {role: 'attacker', targetRoom: thisRoom.name, homeRoom: room.name}});
                    console.log('Adding Annoying-Attacker to Spawn List: ' + newName);
                    thisRoom.memory.roomData.has_safe_creeps = false;
                }
            }
        });
    }
}




/**
 * Emergency energy check - runs BEFORE the spawn list is looked at, and (since
 * the bucket guard moved) even when the bucket is on the floor: this is the only
 * path that puts a hauler back into a room with zero fillers, and a CPU crash
 * and a starved spawn tend to arrive together.
 *
 * The cure for a starved spawn is a FILLER (storage -> spawn/extensions).
 * An EnergyManager only shuttles storage <-> terminal/labs/links/factory and
 * has no spawn-filling branch at all, so the old version of this block sat a
 * fresh EnergyManager next to a full storage doing literally nothing while
 * the spawn stayed empty (E17S4, RCL5, 26k banked, spawn on 64).
 *
 * Returns true when it took the spawn this tick.
 */
function emergencyFillerRescue(room, spawn): boolean {
    let storage = Game.getObjectById(room.memory.Structures?.storage);
    let fillersInRoom = _.filter(Game.creeps, (creep:any) => creep.memory.role == 'filler' && creep.room.name == room.name).length;
    // a carrier can drop into storage/spawn too, so it counts as "something can
    // still move energy" for the last-resort rung below ("FakeFiller" is a
    // carrier mid-dropoff, see carry.ts)
    let haulersInRoom = _.filter(Game.creeps, (creep:any) => (creep.memory.role == 'carry' || creep.memory.role == 'FakeFiller') && creep.room.name == room.name).length;

    // Check if room is energy starved and has nobody to fill the spawn
    if(room.controller.level >= 4 && storage && fillersInRoom === 0) {
        console.log(`Room ${room.name} energy: ${room.energyAvailable}/${room.energyCapacityAvailable}, checking for emergency spawn`);

        if(room.energyAvailable < room.energyCapacityAvailable * 0.5) {
            // NOTE: the queue is deliberately NOT wiped here. This block runs
            // before queue processing, so it already wins the spawn every tick
            // it can afford a body; clearing the list only threw away the
            // miners/carriers the room needs to refill in the first place.
            let name = 'EmergencyFiller-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
            let body = null;

            // Body ladder keyed at what the room can actually afford RIGHT NOW.
            // The bottom rung is the constraint: with no filler AND no carrier
            // alive nothing can ever put energy back into spawn/extensions, and a
            // lone spawn only regenerates to 300 — so the room must be able to buy
            // the cheapest possible hauler ([CARRY,MOVE] = 100) the moment
            // energyAvailable reaches 100. Keying the bottom rung at 150 stranded
            // rooms sitting between 100 and 149 forever.
            if(room.energyAvailable >= 300) {
                body = [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE]; // 300 energy
            } else if(room.energyAvailable >= 150) {
                body = [CARRY, CARRY, MOVE]; // 150 energy
                console.log(`Using ultra small emergency body in ${room.name}, energy: ${room.energyAvailable}`);
            } else if(room.energyAvailable >= 100 && haulersInRoom === 0) {
                body = [CARRY, MOVE]; // 100 energy - cheapest hauler that exists
                console.log(`Using last-resort hauler body in ${room.name}, energy: ${room.energyAvailable}`);
            }

            // below 100 nothing haul-shaped is buyable; fall through to the queue
            // rather than returning, so its own -6 handling still runs this tick
            if(body) {
                let spawnAttempt = spawn.spawnCreep(body, name, {memory: {role: 'filler'}});

                if(spawnAttempt === 0) {
                    console.log(`SUCCESS: Spawning emergency filler in ${room.name}`);
                    room.memory.data.c_spawned++;
                    return true;
                } else {
                    console.log(`FAILED to spawn emergency filler in ${room.name}, error: ${spawnAttempt}`);
                }
            }
        }
    }
    return false;
}

function spawnFirstInLine(room, spawn) {
    if(emergencyFillerRescue(room, spawn)) {
        return "spawning";
    }

    // Normal spawn queue processing
    if(room.memory.spawn_list.length >= 1) {
        // spawning() runs before scanRemoteThreats, so a miner/carrier
        // queued this tick can hatch next tick into a remote that is
        // now hot. Drop those triples; the producer re-queues when safe.
        // Attackers/scouts targeting the same room are left alone.
        //
        // CLOSED counts too, not just HOT. manageRemotes retires a remote by
        // flipping resources[target].active to false — for depletion, for a
        // reservation we lost, for an owner turning up — and the queue can
        // easily be holding a triple that was produced while it was still open.
        // Hatching it spends the body and then the creep immediately recycles
        // or re-homes, which is the same waste the hot test exists to stop.
        // Strict `=== false`: an absent resources entry is no opinion at all
        // (scouts/one-off targets), and must not drop anything.
        while(room.memory.spawn_list.length >= 3) {
            const headMem = room.memory.spawn_list[2] && room.memory.spawn_list[2].memory;
            if(!headMem || !headMem.targetRoom || headMem.targetRoom === room.name) break;
            const role = headMem.role;
            if(role !== "EnergyMiner" && role !== "carry" &&
               role !== "RemoteRepair" && role !== "reserve") break;
            const t = headMem.targetRoom;
            if(!remoteIsHot(room, t) &&
               !(room.memory.resources && room.memory.resources[t] &&
                 room.memory.resources[t].active === false)) break;
            refundBoostOwner(room, room.memory.spawn_list[1]);
            console.log("dropping queued", room.memory.spawn_list[1],
                "-", headMem.targetRoom, "is hot/closed");
            room.memory.spawn_list.shift();
            room.memory.spawn_list.shift();
            room.memory.spawn_list.shift();
        }
        if(room.memory.spawn_list.length < 3) {
            room.memory.spawnStall = 0;
            delete room.memory.spawnStallName;
            return "list empty";
        }
        let spawnAttempt = spawn.spawnCreep(room.memory.spawn_list[0],room.memory.spawn_list[1], room.memory.spawn_list[2]);
        if(spawnAttempt == 0) {
            console.log("spawning", room.memory.spawn_list[1], "creep", room.name);
            room.memory.spawn_list.shift();
            room.memory.spawn_list.shift();
            room.memory.spawn_list.shift();
            room.memory.data.c_spawned++;
            room.memory.spawnStall = 0;
            delete room.memory.spawnStallName;
            return "spawning";
        }
        else {
            let headName:string = room.memory.spawn_list[1];

            // How many ticks IN A ROW this exact head has answered -6. Keyed on
            // the name so a clear/shrink rung swapping the head starts the count
            // over; queued names are stable for as long as the entry is queued.
            if(spawnAttempt == -6) {
                if(room.memory.spawnStallName !== headName) {
                    room.memory.spawnStallName = headName;
                    room.memory.spawnStall = 0;
                }
                room.memory.spawnStall = (room.memory.spawnStall || 0) + 1;
            }

            // A head the room cannot buy answers -6 EVERY tick, and logging that
            // every tick buried the console (59 identical lines in a 12s sample
            // of E14S9). The first one and then one every 50 ticks is enough to
            // see a room is stuck; every other error code still logs as before.
            if(spawnAttempt != -6 || room.memory.spawnStall <= 1 || room.memory.spawnStall % 50 == 0) {
                console.log("spawning", headName, "creep error", spawnAttempt, room.name);
            }
            let segment:string[] = room.memory.spawn_list[0]
            // The shrink rungs below used to also require
            // `Game.time - room.memory.lastTimeSpawnUsed > 305`, read as "the
            // spawn has sat idle this long". It never measured that.
            // `lastTimeSpawnUsed` is a Game.time STAMP, and one of the places
            // it is stamped is the "primary spawn is busy, use another one"
            // branch at the top of spawning() — so in a MULTI-SPAWN room it is
            // refreshed constantly and the difference never grows, while in a
            // single-spawn room with a busy queue it only ever grows. The rung
            // therefore fired or not according to how many spawns a room owns,
            // which has nothing to do with whether its head is stuck. Live
            // pacifist2 E18S3: spawnStall 220 on an unaffordable head, and the
            // shrink rung blocked because its "idle" reading was 159.
            //
            // What the rung actually wants is below, and it says it exactly:
            // the head must be the thing that is stuck (40 consecutive -6
            // answers, the same bar the interleave rung uses — and this
            // deliberately does NOT touch spawnStall itself), and a body walks
            // DOWN one step per 40 ticks so the room gets a fair chance to
            // afford each smaller version before the next step is taken.
            let mayShrinkHead = room.memory.spawnStall > 40
                && Game.time - (room.memory.lastShrink || 0) > 40;
            if(spawnAttempt == -6) {

                let storage = Game.getObjectById(room.memory.Structures?.storage);
                if(room.controller.level >= 4 && storage && room.energyAvailable >= 100 && room.energyAvailable <= 1000 && room.energyCapacityAvailable > 400 && room.find(FIND_MY_CREEPS, {filter: c => c.memory.role == "filler"}).length == 0) {
                    let body = [MOVE,CARRY];
                    if(room.controller.level === 7)
                        body.push(CARRY,CARRY)
                    if(room.controller.level === 8)
                        body.push(CARRY,CARRY,CARRY)

                    let newName = 'emergencyFILLER-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    spawn.spawnCreep(body, newName, {memory: {role: 'filler'}});
                    return "spawning";
                }

                // ---- the shredder ----------------------------------------
                //
                // This clause used to fire on the FIRST ERR_NOT_ENOUGH_ENERGY,
                // which is not a verdict about the creep — it is a statement
                // that the extensions happen to be empty this tick, which is
                // the fillers' job to fix and normally takes a few ticks.
                // Dropping the head there does three bad things:
                //
                //  * it churns. Live E4S7 (RCL8, 380k in the bank, extensions
                //    at 800/12900) shredded FOUR different Repair-* entries in
                //    240 ticks — the producers simply re-queue the same body
                //    under a new random name and it is shredded again.
                //  * it shreds the cure. E1S4 dropped Filler-916212 on its
                //    first -6; a filler is precisely the creep that ends an
                //    ERR_NOT_ENOUGH_ENERGY.
                //  * it kills the two relief rungs below it. `spawnStall`
                //    counts consecutive -6s on the SAME head, and both the
                //    shrink rung and the interleave rung need it above 40 —
                //    but a non-exempt head was thrown away at spawnStall == 1,
                //    so neither could ever fire for any role not on the
                //    exemption list. Measured over 4 minutes across 8 RCL8
                //    communes: 5 shreds, and ZERO "shrinking stalled head" and
                //    ZERO "interleaving" lines, with spawnStall pinned at 0.
                //
                // So make it what it reads like: a last resort. Wait out the
                // shrink and interleave thresholds first, then give up.
                // The capacity clause below is unaffected — a body the room can
                // never afford is still thrown out on sight.
                if((room.memory.spawnStall > SHRED_STALLED_HEAD_AFTER
                && room.memory.spawn_list[0].length >= 4
                && !room.memory.spawn_list[1].startsWith("Carrier")
                && !room.memory.spawn_list[1].startsWith("EnergyMiner")
                && !room.memory.spawn_list[1].startsWith("WallClearer")

                && !room.memory.spawn_list[1].startsWith("SquadCreepA")
                && !room.memory.spawn_list[1].startsWith("SquadCreepB")
                && !room.memory.spawn_list[1].startsWith("SquadCreepY")
                && !room.memory.spawn_list[1].startsWith("SquadCreepZ")

                && !room.memory.spawn_list[1].startsWith("Ram-")
                // Ram- does not cover RampartDefender-/RampartErector-; RRD is listed below.
                && !room.memory.spawn_list[1].startsWith("RampartDefender")
                && !room.memory.spawn_list[1].startsWith("RampartErector")
                && !room.memory.spawn_list[1].startsWith("Signifer")

                // A reserver is [CLAIM,MOVE] x N, so from RCL5 up its body is
                // >= 4 parts and this clause DISCARDED it on the first
                // ERR_NOT_ENOUGH_ENERGY — a remote could never hold a
                // reservation unless the room happened to be full at the exact
                // tick it was queued. It waits for energy now, like a carrier
                // or a miner; the energyCapacity clause below still throws out
                // bodies the room can never afford.
                && !room.memory.spawn_list[1].startsWith("Reserver")

                && !room.memory.spawn_list[1].startsWith("PowerHeal")
                && !room.memory.spawn_list[1].startsWith("Goblin")

                && !room.memory.spawn_list[1].startsWith("SpecialRepair")
                && !room.memory.spawn_list[1].startsWith("SpecialCarry")

                && !room.memory.spawn_list[1].startsWith("RRD")
                && !room.memory.spawn_list[1].startsWith("Solomon")

                && !room.memory.spawn_list[1].startsWith("FreedomFighter")
                && !room.memory.spawn_list[1].startsWith("ContinuousControllerKiller")
                && !room.memory.spawn_list[1].startsWith("RoomLocker")
                && !room.memory.spawn_list[1].startsWith("Escort")


                && !room.memory.spawn_list[1].startsWith("PowerMelee"))

                || _.sum(segment, s => BODYPART_COST[s]) > room.energyCapacityAvailable
                || room.memory.spawn_list[1].startsWith("Defender")) {
                    // The WallClearer arm that used to sit here contradicted its
                    // own exemption a few lines up: the exemption list says a
                    // command-queued WallClearer waits for energy like a carrier
                    // or a reserver, and then this OR shredded it on the FIRST
                    // ERR_NOT_ENOUGH_ENERGY, before the shrink or interleave
                    // rungs could ever fire for it. The exemption wins; a
                    // WallClearer the room can genuinely never afford is still
                    // thrown out by the energyCapacityAvailable clause above.

                    refundBoostOwner(room, room.memory.spawn_list[1]);

                    room.memory.spawn_list.shift();
                    room.memory.spawn_list.shift();
                    room.memory.spawn_list.shift();

                    console.log("clearing spawn queue because too high energy cost or is defender")

                }
                else if(mayShrinkHead && (
                room.memory.spawn_list[1].startsWith("Carrier") && room.energyAvailable < room.memory.spawn_list[0].length * 50 && room.memory.spawn_list[0].length > 3 ||
                room.memory.spawn_list[1].startsWith("EnergyMiner") && room.energyAvailable < room.memory.spawn_list[0].length * 100  && room.memory.spawn_list[0].length > 3
                    // [5W,M] is 550e / 6 parts. HOL bar is length*100 = 600, so
                    // leftover-5 rooms (cap 550) always shrink to 4W. Cost is 550.
                    && !(room.energyCapacityAvailable >= 550
                        && room.memory.spawn_list[0].length === 6
                        && bodyCost(room.memory.spawn_list[0]) === 550
                        && _.filter(room.memory.spawn_list[0], (p:any) => p === WORK).length === 5) ||
                room.memory.spawn_list[1].startsWith("Reserver") && room.memory.spawn_list[0].length > 2)) {
                    // NOT .shift(): that stripped parts off the FRONT of the
                    // body and produced miners with no WORK and reservers with
                    // no CLAIM (see shrinkQueuedBody).
                    if(shrinkQueuedBody(room.memory.spawn_list[0], room.memory.spawn_list[1], room.memory.spawn_list[2])) {
                        room.memory.lastShrink = Game.time;
                        console.log("shrinking stalled head", room.memory.spawn_list[1], "to", bodyCost(room.memory.spawn_list[0]), "energy in", room.name);
                    }
                }
                // leftover-5 blackout (cycle-16 E18S5): HOL-exempt [5W,M]
                // sits at 550 forever, interleave needs a second entry, and
                // 0 miners means energyAvailable never climbs. Replace the
                // head with a cheap miner the spawn can actually buy.
                else if(room.memory.spawn_list[1].startsWith("EnergyMiner")
                    && room.energyCapacityAvailable >= 550
                    && room.energyAvailable < 550
                    && bodyCost(room.memory.spawn_list[0]) >= 550) {
                    // Dest-22: true 0-miner blackout only. Leftover 1W/2W
                    // still fill (2–4 e/t) — rewriting HOL [5W,M] is the
                    // cycle-20 E18S9 stall (then lastSpawn+1500). Best
                    // WORK, not sum: two 1W is still income.
                    if(homeMinerBestWork(room) === 0) {
                        room.memory.spawn_list[0] = room.energyAvailable >= 250
                            ? [WORK, WORK, MOVE] : [WORK, MOVE];
                        console.log("cheap miner head — leftover-5 blackout", room.name);
                    }
                }

                // ---- head-of-line relief ---------------------------------
                // Some heads can neither be bought nor thrown away: a Reserver
                // is [CLAIM,MOVE] = 650, it is deliberately exempt from every
                // clear rung above (a remote must be able to wait for energy),
                // its cost is under energyCapacityAvailable so the capacity
                // clause does not catch it, and the shrink rung below it needs
                // length > 2 so a two part body can never shrink either. The
                // result on live E14S9: RCL4, 47k in storage, 4 open sites,
                // ZERO builders and ZERO upgraders for ~40 minutes while the
                // room trickled back up towards 650 at ~1 energy/tick. The
                // 300 energy Builder sitting second in line was affordable that
                // entire time and never once got a spawnCreep() call.
                //
                // So after the head has answered -6 for INTERLEAVE_EVERY ticks
                // (10 at RCL<=3), walk down the queue and spawn the first
                // entry the room can actually pay for. Memory is NOT reordered
                // - the head keeps its first claim on the spawn every following
                // tick, it just stops holding the whole room hostage while it
                // waits.
                //
                // The scan used to stop after 5 entries, to keep a long war
                // queue from making this expensive. That bound is what made it
                // miss: live pacifist2 E18S3 had a 4300-energy SpecialRepair
                // head against 1092 available, positions 2-6 were four 3500
                // Maintainers and a 3150 Builder — all equally unaffordable —
                // and the first thing the room COULD buy was a 300-energy
                // Sweeper at position 7, one slot past the window. The queue is
                // capped at MAX_SPAWN_QUEUE now, so the whole list is a bounded
                // scan and the window is redundant.
                //
                // What the window was doing by accident, a cooldown now does on
                // purpose. Interleaving drains the very energy the head is
                // waiting for, and this rung had no rate limit at all — an
                // affordable second entry was spawned every single tick. One
                // per 40 ticks (the cadence the shrink rung already uses) keeps
                // the spawn busy while still letting the head accumulate.
                const interleaveAfter = room.controller.level <= 3
                    ? INTERLEAVE_EVERY_RCL1_3 : INTERLEAVE_EVERY;
                if(room.memory.spawnStall > interleaveAfter
                && room.memory.spawn_list.length >= 6
                && room.memory.spawn_list[1] === headName
                && Game.time - (room.memory.lastInterleave || 0) > interleaveAfter) {
                    for(let i = 3; i + 2 < room.memory.spawn_list.length; i += 3) {
                        let candidate:string[] = room.memory.spawn_list[i];
                        if(!candidate || !candidate.length) continue;
                        let cost = _.sum(candidate, (part:any) => BODYPART_COST[part]);
                        if(cost > room.energyAvailable || cost > room.energyCapacityAvailable) continue;
                        if(spawn.spawnCreep(candidate, room.memory.spawn_list[i+1], room.memory.spawn_list[i+2]) == 0) {
                            console.log("spawn head", headName, "unaffordable for", room.memory.spawnStall, "ticks - interleaving", room.memory.spawn_list[i+1], room.name);
                            room.memory.spawn_list.splice(i, 3);
                            room.memory.data.c_spawned++;
                            room.memory.lastInterleave = Game.time;
                            return "spawning";
                        }
                    }
                }
            }
            if(spawnAttempt == -3) {
                // ERR_NAME_EXISTS. Private servers start Game.time low, so
                // `Math.random() * Game.time` collides and the old code dropped
                // the whole triple (R6.150). Rename and keep the entry.
                const oldName = room.memory.spawn_list[1];
                const prefixMatch = String(oldName || "Creep").match(/^([A-Za-z]+)/);
                const prefix = prefixMatch ? prefixMatch[1] : "Creep";
                const newName = prefix + "-" + Math.floor(Math.random() * 1e9) + "-" + room.name;
                renameBoostOwner(room, oldName, newName);
                room.memory.spawn_list[1] = newName;
            }
            else if(spawnAttempt == -14 || spawnAttempt == -10) {
                refundBoostOwner(room, room.memory.spawn_list[1]);
                room.memory.spawn_list.shift();
                room.memory.spawn_list.shift();
                room.memory.spawn_list.shift();
            }


            return "not spawning";
        }
    }
    else {
        room.memory.spawnStall = 0;
        delete room.memory.spawnStallName;
        return "list empty";
    }

}

function isInRoom(creep, room) {
    return creep.room.name == room.name;
}

/**
 * How many EXTRA upgraders a storage surplus pays for.
 *
 * A room that banks energy is a room that is not growing: live E11S5 sat on
 * 778k at RCL4 with ZERO upgraders, because the normal RCL4 gate is blocked
 * while ANY construction site is open — and a planV2 room always keeps 4
 * sites open, so it never upgraded again. Same shape at RCL6/7, where the
 * gate wants 400k before it spawns the big spend body.
 *
 * Reads room.storage, NOT the `storage` local every other gate here uses:
 * that one is `Game.getObjectById(room.memory.Structures.storage) ||
 * room.findStorage()`, and on live E11S5 the cached id still pointed at the
 * hub CONTAINER built before the storage existed. A container caps at 2000,
 * so every `> 100000` gate in the RCL4 block was reading 2000 while the real
 * storage held 860k. Anything below the tier threshold returns 0, i.e.
 * exactly the old behaviour.
 *
 * RCL8 is deliberately excluded: the controller only takes 15 energy/tick
 * there, so more upgraders buy nothing — an RCL8 surplus wants ramparts /
 * nuker / terminal, not creeps.
 */
function surplusUpgraderTier(room) {
    let storage = room.storage;
    if(!storage || !storage.my) {
        room.memory.upLatch = false;
        return 0;
    }
    if(room.memory.danger) return 0;
    let energy = storage.store[RESOURCE_ENERGY] || 0;
    let level = room.controller.level;
    // Always evaluated so the latch tracks the bank even at levels that do not
    // read it — a stale latch is worse than no latch.
    const latched = upgradeLatch(room);
    if(level >= 8) return 0;
    if(level >= 6) {
        if(level == 7 && energy > 250000) return 2;
        return energy > 120000 ? 1 : 0;
    }
    // WAS a bare `energy > 60000`, i.e. a one-sided threshold that the RCL4/5
    // baseline gate did not share. See upgraderTarget() below.
    if(level >= 4) return latched ? 1 : 0;
    return 0;
}

/* -------------------------------------------------------------------------
 * Upgrade budget: a real floor, and hysteresis instead of bang-bang.
 *
 * Measured (5,448-tick window, three RCL4 rooms simultaneously):
 *   E18S3  controller progress frozen at 24682 for 3,392 consecutive ticks,
 *          ZERO upgraders alive, while storage climbed 37,628 -> 60,129. At 60k
 *          it spawned exactly ONE upgrader, drained to 39,104, and went back to
 *          zero. 34 of 49 snapshots had no upgrader at all.
 *   E11S8  frozen at 35742 for 2,725 ticks, storage 46,276 -> 59,502.
 *   E3S3   6 -> 4 -> 2 -> 1 -> 0 upgraders as storage fell 60,700 -> 37,768,
 *          then stalled 1,425 ticks while it rebuilt to 52,647.
 *
 * Cause: the RCL4 gate was
 *   storage > 100000 || storage > 10000 && !ramparts.filter(hits < 900000).length
 * and an RCL4 rampart caps at 300,000 hits, so the second arm can NEVER be
 * satisfied in a room that has ramparts — the effective floor was 100k, not the
 * 10k the comment claimed. The only other source of upgraders,
 * surplusUpgraderTier, fired on a bare `> 60000` with no shared hysteresis, so
 * the room oscillated between "one upgrader" and "none" forever.
 *
 * Now:
 *   >= 10k banked  -> at least ONE upgrader, always (the real floor)
 *   >= 30k banked  -> up to three
 *   >= 60k banked  -> the full roster + the surplus tier, and it STAYS there
 *                     until the bank falls below 15k (the latch)
 * The latch is what stops the bang-bang: draining 60k -> 39k no longer switches
 * the room back off, so a room whose storage is growing never sits at zero
 * upgraders.
 * ------------------------------------------------------------------------- */
/** one upgrader from here up — a room with this much banked is not poor */
const UPGRADE_FLOOR = 10000;
/** full roster + surplus from here up */
const UPGRADE_SURGE_ON = 60000;
/** ...and keep it until the bank falls below this (hysteresis) */
const UPGRADE_SUSTAIN_OFF = 15000;
/** middle band: enough to keep a real roster, not enough for the surge */
const UPGRADE_MID = 30000;

/**
 * Energy in the room's REAL storage. Deliberately not the `storage` local the
 * gates use — that one falls back to the hub CONTAINER, which caps at 2,000, so
 * every `> 10000` test against it is unsatisfiable by construction.
 */
function bankEnergy(room): number {
    const s = room.storage;
    if(!s || !s.my) return 0;
    return s.store[RESOURCE_ENERGY] || 0;
}

/** Sticky surge flag: on at UPGRADE_SURGE_ON, off only below UPGRADE_SUSTAIN_OFF. */
function upgradeLatch(room): boolean {
    const e = bankEnergy(room);
    if(e >= UPGRADE_SURGE_ON) room.memory.upLatch = true;
    else if(e < UPGRADE_SUSTAIN_OFF) room.memory.upLatch = false;
    return !!room.memory.upLatch;
}

/**
 * KEEP ONE — the rung below the floor.
 *
 * The bank rungs above all bottom out at `Math.max(burn, emergency)`, and both
 * of those can be zero for thousands of ticks in a room that has just paid for
 * a level. A room that reaches RCL5 has spent its storage on getting there:
 * bank < UPGRADE_FLOOR, no standing floor pile (so burn == 0) and a
 * ticksToDowngrade that the level-up itself has just reset to full (so
 * emergency == 0). upgraderTarget() therefore returns 0 and the room runs with
 * NO upgrader at all while its builders eat every drop of income — the
 * controller does not move until the bank climbs back over 10k, which in a room
 * with open sites can take the whole of RCL5.
 *
 * The rung is deliberately the smallest thing that fixes that: ONE upgrader,
 * ALWAYS, in any owned room below RCL8 that can pay for it. It used to also
 * require the downgrade timer to have slipped below 80% of the level maximum,
 * which made it a duty cycle rather than a floor — and a duty cycle is exactly
 * what it was written to remove. Live W1N1 sat at RCL7 with 118,821 banked and
 * 148,114 ticksToDowngrade: nothing had slipped, so the rung never engaged and
 * the controller took zero energy for hours while the bank climbed.
 *
 * GATED ON ENERGY AVAILABLE, not on the timer. A room with a miner on a source
 * is earning energy whether or not any of it has reached the storage yet, and a
 * room with a real bank can pay for an upgrader wherever its miners are
 * standing; a room with neither cannot feed one and must spend what it has on
 * getting a miner out first. `miners` is EnergyMinersInRoom, already counted by
 * the census for the builder gates.
 *
 * RCL8 is excluded for the same reason surplusUpgraderTier excludes it: the
 * controller only takes 15 energy/tick there, so a forced upgrader buys nothing.
 *
 * DOES NOT TOUCH THE HYSTERESIS. It only ever raises the result (it is folded
 * in through the same Math.max as `emergency`, replacing it as the hard floor),
 * it reads nothing the latch reads, and it writes nothing. The surge latch is
 * still driven purely by bankEnergy through upgradeLatch().
 */
function keepOneUpgrader(room, miners:number): number {
    if(!room.controller || !room.controller.my) return 0;
    if(room.controller.level >= 8) return 0;
    if(room.memory.danger) return 0;
    // "can pay for it": live income, or a bank worth spending.
    if(miners <= 0 && bankEnergy(room) < UPGRADE_FLOOR) return 0;
    return 1;
}

/* -------------------------------------------------------------------------
 * THE RCL6/7 BUILDER GATE — one function, because it was wrong in both places.
 *
 * LIVE PROOF (VPS shard0, tick ~1,573,400). Three of the bot's four owned rooms
 * were at RCL6 with open construction sites, an EMPTY spawn queue, spawnStall 0,
 * blown_fuse false, danger false — and ZERO builders. Controller progress was
 * frozen in all three across a 53-tick sample:
 *
 *   W1N2  1 source  bank  1,818   sites: 2 container, 2 extension
 *   W2N1  1 source  bank      0   sites: lab, 3 rampart, 5 road
 *   W3N1  2 sources bank    150   sites: terminal, link, lab, container
 *
 * W1N2 had been sitting at 25/40 extensions with ZERO containers, ZERO links and
 * ZERO roads — every one of them a site the room had correctly placed off its v2
 * plan and could not build. The old gate was
 *
 *   builders < amount && sites.length > 0
 *     && (EnergyMinersInRoom > 1 || bankCanBuild)     // bankCanBuild = bank > 15000
 *     && (storage && storage.store[RESOURCE_ENERGY] > FLOOR || !storage)
 *
 * and it carried two independently unsatisfiable clauses:
 *
 *  1. `EnergyMinersInRoom > 1`. That counter cannot exceed the number of SOURCES
 *     standing in the room, so in a ONE-SOURCE room it is false by construction,
 *     forever, and the gate collapses to "bank > 15000". The RCL4/5 rungs
 *     directly above use `> 0` and are right; `> 1` is a typo with a five-RCL
 *     blast radius. W1N2 and W2N1 are one-source rooms.
 *
 *  2. the bank floor itself. It reads as prudence — do not drain the bank into
 *     construction — but the rooms it actually binds are the ones whose bank is
 *     empty BECAUSE they are still missing the extensions, containers, links and
 *     roads that would fill it. "Wait until you are rich to build the things that
 *     make you rich" is a deadlock, and a room that is at break-even sits in it
 *     permanently: no bank -> no builder -> no economy -> no bank.
 *
 * The rule that replaces it separates the two kinds of site, which is what the
 * bank floor was groping at:
 *
 *   REAL structures (anything not a rampart) are the economy. A room with live
 *   income builds them whatever the bank says — but on a thin bank it runs ONE
 *   builder instead of the full roster, so construction is a trickle rather than
 *   a competing sink. The body needs no clamp of its own: getBody() sizes off
 *   energyCapacityAvailable (85% soft cap), so it never exceeds what the room
 *   can eventually pay.
 *
 *   RAMPARTS are discretionary hit-points and keep the old behaviour exactly —
 *   they come off a bank, and off a thin bank a rampart-only room gets nothing.
 * ------------------------------------------------------------------------- */
/**
 * RCL1–3 builder roster. Two on real structures (ext/container/tower);
 * two on haul roads after slam-5. Six 300e bodies on pavement steal the
 * 135k climb from the upgraders.
 */
function earlyBuildSlots(sites, cap: number, room?): number {
    let useful = 0;
    let roads = 0;
    for(let i = 0; i < sites.length; i++) {
        if(sites[i].structureType !== STRUCTURE_ROAD) useful++;
        else roads++;
    }
    if(useful > 0) return Math.min(cap, useful, 2);
    if(roads > 0 && room && room.energyCapacityAvailable >= 550) return Math.min(2, roads);
    return sites.length > 0 ? 1 : 0;
}

function onlyRoadSites(sites): boolean {
    if(!sites.length) return false;
    for(let i = 0; i < sites.length; i++) {
        if(sites[i].structureType !== STRUCTURE_ROAD) return false;
    }
    return true;
}

function hasRoadSite(sites): boolean {
    for(let i = 0; i < sites.length; i++) {
        if(sites[i].structureType === STRUCTURE_ROAD) return true;
    }
    return false;
}

/** Container/road actually below the repairer's 1000-hit slack. */
function earlyRepairNeeded(room): boolean {
    return room.find(FIND_STRUCTURES, {filter: (s: any) =>
        (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_ROAD) &&
        s.hits + 1000 < s.hitsMax
    }).length > 0;
}

/**
 * RCL1–3 builder. After slam-5, two builders pave the haul line.
 * [W,3C,M] is 4 ticks/tile loaded; getBody stacks that to
 * [2W,6C,2M] once cap hits 800 and HOL-blocks the 500e 4W. [W,2C,2M] is
 * the same 300e, 2 ticks/tile loaded, 100e tank.
 */
function earlyBuilderBody(room) {
    return room.energyCapacityAvailable >= 300
        ? [WORK, CARRY, CARRY, MOVE, MOVE]
        : [WORK, CARRY, MOVE];
}

/** Source↔controller shuttle. Used at RCL2 and at RCL3 before the depot exists. */
function shuttleUpgraderBody(room) {
    return room.energyCapacityAvailable >= 550
        ? [WORK, WORK, CARRY, CARRY, MOVE, MOVE]
        : getBody([WORK, CARRY, MOVE], room);
}

/** Parked on the controller container. 4W at 550, 4W2C2M once cap hits 800. */
function parkedUpgraderBody(room) {
    return room.energyCapacityAvailable >= 800
        ? getBody([WORK, WORK, CARRY, MOVE], room)
        : room.energyCapacityAvailable >= 550
            ? [WORK, WORK, WORK, WORK, CARRY, MOVE]
            : getBody([WORK, WORK, CARRY, MOVE], room);
}

/**
 * Controller-side container, same definition as upgrader.ts / carry.ts:
 * range 4, not a source container, not the bin or the storage.
 */
function hasControllerDepot(room): boolean {
    const ctrl = room.controller;
    if (!ctrl) return false;
    const S = room.memory.Structures || {};
    const known: any = Game.getObjectById(S.controllerLink);
    if (known && known.structureType == STRUCTURE_CONTAINER &&
        known.pos.getRangeTo(ctrl) <= 4 &&
        known.pos.findInRange(FIND_SOURCES, 1).length == 0) {
        return true;
    }
    const sources = room.find(FIND_SOURCES);
    return room.find(FIND_STRUCTURES, {filter: (s: any) =>
        s.structureType == STRUCTURE_CONTAINER &&
        s.id !== S.bin &&
        s.id !== S.storage &&
        s.pos.getRangeTo(ctrl) <= 4 &&
        s.pos.findInRange(sources, 1).length == 0
    }).length > 0;
}

/** Body WORK, not getActiveBodyparts — a hatchling's active count is 0. */
function workFromBody(creep): number {
    let n = 0;
    const body = creep.body || [];
    for(let i = 0; i < body.length; i++) if(body[i].type == WORK) n++;
    return n;
}

/** Best single home EnergyMiner WORK. Two leftover 1W must not look like a 2W. */
function homeMinerBestWork(room): number {
    let best = 0;
    for (const c of creepsWithRole("EnergyMiner")) {
        if ((c.memory.targetRoom || c.room.name) !== room.name) continue;
        const w = workFromBody(c);
        if (w > best) best = w;
    }
    return best;
}

/**
 * When a dedicated filler pays for itself.
 *
 * Fillers withdraw from `storage` (real bank, or the hub-container fallback)
 * and stuff spawn/extensions. An empty bank means they unshift a 300e body,
 * sit on a 0 withdraw, and HOL-block the miners/upgraders. One load (200e
 * for the RCL4 4-carry body) is the floor; a second filler waits until the
 * bank is a real buffer.
 */
function fillersWanted(room, storage, base: number): number {
    if(!storage || !storage.store) return 0;
    const energy = storage.store[RESOURCE_ENERGY] || 0;
    const hungry = room.energyAvailable < room.energyCapacityAvailable;
    if(storage.structureType === STRUCTURE_STORAGE) {
        if(energy < 200) return 0;
        if(!hungry && energy < 1000) return 0;
        if(energy < 2000) return 1;
        return Math.max(1, base);
    }
    if(energy < 100 || !hungry) return 0;
    /*
     * HUB-CONTAINER ROOM. The flat `return 1` here is a cap of ONE filler no
     * matter what the rule table asks for, and that is a fill-loop bug from
     * RCL4 up: 10 extensions plus a spawn is 800 energy of demand behind a
     * single [4C,2M] shuttle carrying 200 at 2 ticks/tile.
     *
     * Live E36N57 (RCL4, no storage yet, 800 capacity): 19 creeps, 11,800
     * energy lying on the floor, ALL TEN extensions at 0, and the spawn stalled
     * on a 500-energy upgrader it could not pay for. The room was not poor, it
     * simply had one hauler-of-last-resort for the whole extension bank.
     *
     * A room with extensions to fill and a hungry spawn gets the rule table's
     * roster (RCL4 asks for 2). Below RCL4 there are no extensions worth a
     * second body and the 300-energy climb matters more, so nothing changes.
     */
    if(room.controller && room.controller.level >= 4 && room.energyCapacityAvailable > 300) {
        return Math.max(1, Math.min(base, 2));
    }
    return 1;
}

function queueEarlyFiller(room, storage, fillers: number, base: number, body, remotes: number, extraDanger?: boolean): void {
    let want = fillersWanted(room, storage, base);
    if(want === 0) return;
    if(want >= base) {
        if(remotes > 1 || extraDanger) want = base + 1;
        if(remotes > 2) want = base + 2;
    }
    if(fillers >= want) return;
    let name = 'Filler-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
    room.memory.spawn_list.unshift(body, name, {memory: {role: 'filler'}});
    console.log('Adding filler to Spawn List: ' + name);
}

function queueBuilder(room, rules, sites, builders:number, miners:number,
                      bankCanBuild:boolean, storage, bankFloor:number): void {
    if(!sites.length) return;
    // income OR a bank worth spending — same test as the RCL4/5 rungs
    if(miners <= 0 && !bankCanBuild) return;
    const realBank = storage && storage.structureType === STRUCTURE_STORAGE;
    // no real storage yet -> nothing to protect, judge the room on its sites
    const rich = !realBank || storage.store[RESOURCE_ENERGY] > bankFloor;

    let usefulSites = 0;
    const mature = room.controller && room.controller.level >= 6;
    for(const site of sites) {
        if(site.structureType === STRUCTURE_RAMPART) continue;
        if(mature && site.structureType === STRUCTURE_ROAD) continue;
        usefulSites++;
    }
    const hasUsefulSite = usefulSites > 0;

    if(!hasUsefulSite) {
        // rampart/road-only (naked shell). One token builder even on a 0
        // bank — PlanV2 opens those slots precisely when storage is empty.
        if(builders < 1) {
            const name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.push([WORK,CARRY,MOVE], name, {memory: {role: 'builder'}});
            console.log('Adding Builder to Spawn List: ' + name + ' (ramparts only)');
        }
        return;
    }

    /*
     * ONE BUILDER PER OPEN SITE, then the roster.
     *
     * The roster alone (3 at RCL6) is a fixed number set for a room that has
     * just been planned and has a dozen slots open. E37N59 has TWO sites and
     * an RCL6 build body of [10W,10C,5M] — 1,750 energy each — and every
     * builder rung is pushed onto the queue BEFORE its upgrader rung, so three
     * of them is 5,250 energy of head-of-line in front of the thing the room is
     * actually trying to do. Two builders cannot both work one site faster than
     * one can; the extra bodies are pure queue pressure.
     */
    const want = Math.min(rich ? rules.build_creep.amount : 1, usefulSites);
    if(builders >= want) return;
    const name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
    room.memory.spawn_list.push(rules.build_creep.body, name, {memory: {role: 'builder'}});
    console.log('Adding Builder to Spawn List: ' + name +
        ' (' + (builders+1) + '/' + want + ', ' + usefulSites + ' sites, bank ' + bankEnergy(room) +
        ', miners ' + miners + (rich ? '' : ', THIN BANK') + ')');
}

/**
 * How many upgraders this room should be running right now.
 *
 * `burn` is drain-side pressure (see drainPressure): energy already rotting on
 * this room's floor is energy the room has ALREADY paid to mine, so burning it
 * into the controller is free progress no matter what the bank says.
 *
 * `miners` is EnergyMinersInRoom — see keepOneUpgrader.
 */
function upgraderTarget(room, base:number, surplus:number, burn:number, miners:number = 0): number {
    const emergency =
        room.controller.ticksToDowngrade < CONTROLLER_DOWNGRADE[room.controller.level] / 2 ? 1 : 0;
    // the hard floor every rung below is Math.max'd against
    const floor = Math.max(emergency, keepOneUpgrader(room, miners));
    const latched = upgradeLatch(room);
    // No real storage: there is no bank to protect and the income has nowhere
    // else to go, so run the roster and let the energy supply throttle it.
    if(!room.storage || !room.storage.my) return Math.max(base + burn, floor);
    const bank = bankEnergy(room);
    // Full roster while the surge is latched AND there is still a real bank to
    // spend. Below the middle band the latch only guarantees that the roster
    // never reaches zero — draining a room to 15k at 48 energy/tick would starve
    // the other things that read a storage floor (reservers want 25k).
    if(latched && bank >= UPGRADE_MID) return Math.max(base + surplus + burn, floor);
    if(bank >= UPGRADE_MID) return Math.max(Math.min(base, 3) + burn, floor);
    if(bank >= UPGRADE_FLOOR) return Math.max((latched ? 2 : 1) + burn, floor);
    return Math.max(burn, floor);
}

/* -------------------------------------------------------------------------
 * Drain-side pressure.
 *
 * Measured: 319,440 energy destroyed by decay in 5,133 ticks across six rooms.
 * E2S7 held an average of 14,470 energy on the ground (18.7/tick of decay) and
 * put 11,241 into its controller in the same window — it burned 8.5x more on
 * the floor than it delivered. The piles are in STEADY STATE on top of FULL
 * source containers, which means the room's problem is not mining, it is that
 * nothing downstream consumes what it mines.
 *
 * Two different bottlenecks look identical from the pile alone, so separate
 * them by looking at the haulers:
 *   - haulers mostly FULL and parked  -> the SINKS are the bottleneck (E2S7:
 *     ~30% of all carrier-samples were full and stationary). More carriers make
 *     it strictly worse; more upgraders fix it.
 *   - haulers mostly empty/moving     -> haul capacity is the bottleneck; one
 *     more carrier per source is warranted.
 * ------------------------------------------------------------------------- */
/** a floor pile this big is a standing loss, not transient spillage */
const FLOOR_PILE_SMALL = 3000;
/** one extra upgrader per this much standing floor energy, capped at 4 */
const FLOOR_PILE_PER_UPGRADER = 3500;

let _pressureTick = -1;
let _pressureCache: { [roomName: string]: any } = {};

function drainPressure(room): any {
    if(_pressureTick !== Game.time) {
        _pressureTick = Game.time;
        _pressureCache = {};
    }
    if(_pressureCache[room.name]) return _pressureCache[room.name];

    let onFloor = 0;
    for(const d of room.find(FIND_DROPPED_RESOURCES)) {
        if((d as any).resourceType === RESOURCE_ENERGY) onFloor += (d as any).amount;
    }
    // "Full" alone is NOT evidence of a jam — a healthy hauler is loaded for
    // half of every round trip. The measurable symptom is full AND NOT MOVING
    // (E2S7: 18.2% of all carrier-samples, against 5.7-6.2% in the two rooms
    // that had a storage). `_phT` is the tick RunCreepManager.preRun last saw
    // this creep change tile, so it is a free stationarity test.
    let parked = 0;
    let total = 0;
    for(const c of creepsWithRole("carry").concat(creepsWithRole("FakeFiller"))) {
        if(c.memory.homeRoom !== room.name && c.room.name !== room.name) continue;
        total++;
        if(c.store.getFreeCapacity() === 0 && Game.time - (c.memory._phT || 0) >= 5) parked++;
    }
    const prev = typeof room.memory._floorE === "number" ? room.memory._floorE : onFloor;
    room.memory._floorE = onFloor;

    /*
     * BURN IS NOT A CURE FOR A BROKEN FILL LOOP.
     *
     * `burn` buys extra upgraders because energy on the floor is already paid
     * for. That reasoning holds only while the room can still SPAWN — and an
     * upgrader is spawned out of the extension bank, not off the floor. Live
     * E36N57: 11,800 energy on the ground (burn would ask for 3 more
     * upgraders), all ten extensions at zero, and the spawn already stalled on
     * a 500-energy upgrader it could not pay for. Queuing more of them there is
     * strictly negative: it deepens the head-of-line block that is stopping the
     * fillers who would clear the floor in the first place.
     *
     * So: no burn-driven upgraders while the extension bank is under half full,
     * in a room that HAS an extension bank (capacity > 300) and is past the
     * bootstrap levels. RCL1-3 rooms live under 50% by construction — that is
     * what a 300-energy spawn with two creeps queued looks like — and their
     * whole climb depends on upgraders, so they are untouched.
     */
    const fillLoopBroken = !!(room.controller && room.controller.level >= 4 &&
        room.energyCapacityAvailable > 300 &&
        room.energyAvailable * 2 < room.energyCapacityAvailable);

    const sinkLimited = total > 0 && parked * 3 >= total;
    const out = {
        onFloor,
        growing: onFloor > prev,
        sinkLimited,
        /*
         * Extra upgraders bought purely by energy that is already rotting.
         *
         * Scales with the pile, because the pile is what has to be consumed:
         * an RCL3 upgrader is body-capped at 4 WORK (4 energy/tick) off a 550
         * energy spawn, so clearing E2S7's measured 18.7/tick of decay needs
         * FOUR of them, not one. Measured after the first cut of this (which
         * capped burn at 2): E2S7 and E1S4 still held ~18,000 on the floor with
         * their containers full and every extension topped up — the roster was
         * simply too small to be the sink.
         *
         * The bodies are cheap against the loss: 550 energy amortised over a
         * 1,500-tick life is 0.37/tick each.
         */
        burn: (onFloor < FLOOR_PILE_SMALL || fillLoopBroken) ? 0 : Math.min(4, Math.max(1, Math.floor(onFloor / FLOOR_PILE_PER_UPGRADER))),
        /** one more hauler per source, but never while the haulers sit full */
        haul: onFloor >= FLOOR_PILE_SMALL && !sinkLimited ? 1 : 0,
    };
    _pressureCache[room.name] = out;
    return out;
}

function getBody(segment:string[], room, bodyMaxLength=50) {
    let body = [];
    if(!segment || !segment.length) return body;
    let segmentCost = _.sum(segment, s => BODYPART_COST[s]);
    if(segmentCost <= 0) return body;

    // Size off energyCapacityAvailable, not this tick's leftovers. An energy
    // dip used to pin every RCL2 upgrader at one 300-energy segment (2 WORK)
    // for the whole level. Soft-cap the stack at 85% of capacity — same budget
    // as clampSpawnListToCapacity — so we never emit a 100% body the queue
    // cannot buy. A single segment that overshoots 85% still ships if it fits
    // capacity; otherwise the largest prefix that fits, or empty.
    let capacity = room.energyCapacityAvailable;
    let budget = Math.min(capacity, Math.floor(capacity * 0.85));
    let maxSegments = Math.floor(capacity / segmentCost);
    if(budget > 0) {
        maxSegments = Math.min(maxSegments, Math.floor(budget / segmentCost));
    } else {
        maxSegments = 0;
    }

    if(maxSegments < 1) {
        if(segmentCost <= capacity && segment.length <= bodyMaxLength) {
            return segment.slice();
        }
        let cost = 0;
        for(let i = 0; i < segment.length && body.length < bodyMaxLength; i++) {
            let partCost = BODYPART_COST[segment[i]];
            if(cost + partCost > capacity) break;
            body.push(segment[i]);
            cost += partCost;
        }
        // Prefix of [4W,C,M] at cap 300 used to be [W,W,W] — immobile (R6.32).
        return bodyCanWork(body, segment) ? body : [];
    }

    _.times(maxSegments, function() {if(segment.length + body.length <= bodyMaxLength){_.forEach(segment, s => body.push(s));}});

    return bodyCanWork(body, segment) ? body : [];
}

/** getBody must never emit a creep that cannot walk, or cannot carry if asked. */
function bodyCanWork(body:string[], segment:string[]):boolean {
    if(!body || !body.length) return false;
    if(body.indexOf(MOVE) < 0) return false;
    if(segment.indexOf(CARRY) >= 0 && body.indexOf(CARRY) < 0) return false;
    return true;
}

/**
 * Live harvest e/t for one HOME source.
 *
 * spawn_energy_miner tags miners with memory.sourceId. Each WORK harvests 2e/t;
 * a source caps at 10. Count body WORK (not getActiveBodyparts) so a hatching
 * miner is already sized for. No live miner yet → 4 (one 2W about to exist),
 * never a phantom 6W / 12 e/t.
 */
function homeSourceHarvest(room, sourceId): {energyPerTick: number, miners: number} {
    let work = 0;
    let miners = 0;
    for(const c of creepsForSource(sourceId)) {
        if(c.memory.role != 'EnergyMiner') continue;
        miners++;
        const body = c.body;
        if(!body) continue;
        for(let i = 0; i < body.length; i++) {
            if(body[i].type == WORK) work++;
        }
    }
    return {energyPerTick: work > 0 ? Math.min(10, 2 * work) : 4, miners};
}


function getCarrierBody(sourceId, values, storage, spawn, room) {

    let targetSource:any = Game.getObjectById(sourceId);
    if(targetSource && targetSource.room.name == room.name) {
        if(Game.time % 11 == 0) {
            delete values.pathLength;
        }
    }
    let pathFromHomeToSource;
    // "FakeFiller" is a carrier mid-dropoff at home (see carry.ts), not a filler
    let carriersInRoom = _.filter(creepsWithRole('carry').concat(creepsWithRole('FakeFiller')),
        (creep:any) => creep.room.name == room.name);

    if(storage != undefined && values.pathLength == null) {
        pathFromHomeToSource = storage.pos.findPathTo(targetSource, {ignoreCreeps: true, ignoreRoads: false});
        values.pathLength = pathFromHomeToSource.length - 1;
    }
    else if (spawn != undefined && values.pathLength == null) {
        pathFromHomeToSource = spawn.pos.findPathTo(targetSource, {ignoreCreeps: true, ignoreRoads: false});
        values.pathLength = pathFromHomeToSource.length - 1;
    }

    if(carriersInRoom.length == 0 && !storage) {
        // RCL1 leftover after the [W,C,M] miner is 100, not 150.
        return [CARRY,CARRY,MOVE];
    }


    if(targetSource == null || values.pathLength == null) {
        return [];
    }

    if(targetSource.room.name == room.name) {
        // Same ratio rule as remotes: 1:1 on dirt, 2:1 once THIS path is roaded.
        // RCL4 + storage.my used to stand in for that, but RCL3 does not pave
        // and storage completes first — a loaded 2:1 body is then 2 ticks/tile
        // on plain, so the trip was sized for a walk it could not make.
        const roaded = homePathIsRoaded(room, targetSource, storage, spawn);
        const movePerCarry = roaded ? 0.5 : 1;
        const budget = room.energyCapacityAvailable;
        const unitCost = 50 + 50 * movePerCarry;
        const maxCarryByBudget = Math.max(1, Math.floor(budget / unitCost));
        const maxCarryByParts = Math.floor(50 / (1 + movePerCarry));
        const L = values.pathLength;
        const loadedTicks = movePerCarry >= 1 ? 1 : 2;
        const headroom = roaded ? 1.15 : 1.35;
        const need = homeSourceHarvest(room, sourceId).energyPerTick * (L + L * loadedTicks + 6) * headroom;
        // RCL1–3: cap 4C/4M (400e). Budget otherwise buys [5C,5M] at 550
        // and [8C,8M] at 800 — 500–800e HOL in front of the parked 4W.
        // homeCarriersWanted splits the rest across more bodies (max 3).
        const maxCarryEarly = (!roaded && room.controller && room.controller.level <= 3)
            ? 4 : maxCarryByParts;
        const carry = Math.max(2, Math.min(maxCarryByBudget, maxCarryEarly, Math.ceil(need / 50)));
        const move = Math.max(1, Math.ceil(carry * movePerCarry));
        const body = [];
        for(let i = 0; i < carry; i++) body.push(CARRY);
        for(let i = 0; i < move; i++) body.push(MOVE);
        while(body.length > 50) body.pop();
        return body;
    }
    else {
        /*
         * REMOTE carrier body.
         *
         * Old formula: capacity = (6 or 12) * (2L + 2), 2:1 CARRY:MOVE, hard cap
         * at energyCapacityAvailable-100, exactly one carrier per source.
         * Three separate errors:
         *   1. 12 e/tick (RCL>=5) overshoots even a reserved source (10/tick);
         *      6 e/tick sits between the reserved (10) and unreserved (5) cases
         *      and matches neither.
         *   2. 2:1 CARRY:MOVE is road speed, but the remotes have no roads
         *      (measured: road=0 on every active remote), so a loaded carrier
         *      moved at half the speed the body was sized for.
         *   3. When demand exceeded one body it just truncated — no second
         *      carrier ever covered the shortfall.
         *
         * Now: size to measured demand, pick the ratio the terrain actually
         * supports, and let spawn_carrier decide how many bodies to split it
         * across.
         */
        const demand = remoteCarrierDemand(room, targetSource.room.name, values, sourceId);
        const budget = room.energyCapacityAvailable;

        // 1:1 off-road (full speed loaded on plain), 2:1 once the path is roaded.
        const movePerCarry = demand.roaded ? 0.5 : 1;
        const unitCost = 50 + 50 * movePerCarry;          // energy per CARRY incl. its MOVE share
        const maxCarryByBudget = Math.floor(budget / unitCost);
        const maxCarryByParts = Math.floor(50 / (1 + movePerCarry));

        // Split the demand across at most MAX_CARRIERS_PER_SOURCE bodies.
        const wantCarryTotal = Math.ceil(demand.capacityNeeded / 50);
        const perBody = Math.max(
            2,
            Math.min(maxCarryByBudget, maxCarryByParts, Math.ceil(wantCarryTotal / carriersWantedForSource(room, values, demand)))
        );

        const carry = perBody;
        const move = Math.max(1, Math.ceil(carry * movePerCarry));

        const body = [];
        for(let i = 0; i < carry; i++) body.push(CARRY);
        for(let i = 0; i < move; i++) body.push(MOVE);
        while(body.length > 50) body.pop();
        return body;
    }
}

/** MAX bodies we will ever put on one remote source */
const MAX_CARRIERS_PER_SOURCE = 3;

/**
 * Remote carrier body that needs NO vision on the remote.
 *
 * getCarrierBody() starts with `Game.getObjectById(sourceId)` and returns []
 * when that is null, which it always is without vision. Combined with the
 * vision guard at the top of spawn_carrier, a remote that lost vision could
 * never be given a carrier — and it needs a carrier precisely because the last
 * creep there died. Observed live on E3S3->E3S4: both sources sat at 3000/3000,
 * fully reserved and completely untouched, with zero carriers ever spawned,
 * while the no-vision fallback kept sending 2-WORK probe miners 82 tiles.
 *
 * Everything the sizing actually needs (pathLength, roaded, containers,
 * reserved) is cached in room.memory.resources, so none of it needs the source
 * object.
 */
function getRemoteCarrierBody(room, targetRoomName, values, sourceId?) {
    const derived = ensureRemotePathLength(room, targetRoomName, values, sourceId);
    if(derived == null) return [];
    // Size against the derived length this pass. Do not persist a 25,25
    // guess onto values.pathLength — remotes scoring would treat it as surveyed.
    const had = values && values.pathLength != null;
    if(values && !had) values.pathLength = derived;
    const demand = remoteCarrierDemand(room, targetRoomName, values, sourceId);
    if(values && !had && !(sourceId && Game.getObjectById(sourceId))) {
        delete values.pathLength;
    }
    const want = carriersWantedForSource(room, values, demand);

    const movePerCarry = demand.roaded ? 0.5 : 1;
    const unitCost = 50 + 50 * movePerCarry;
    const maxCarryByBudget = Math.floor(room.energyCapacityAvailable / unitCost);
    const maxCarryByParts = Math.floor(50 / (1 + movePerCarry));

    const wantCarryTotal = Math.ceil(demand.capacityNeeded / 50);
    let carry = Math.max(2, Math.min(maxCarryByBudget, maxCarryByParts, Math.ceil(wantCarryTotal / want)));
    if(carry < 2) return [];
    let move = Math.max(1, Math.ceil(carry * movePerCarry));

    /*
     * NEVER over capacity. This body used to sit at the TAIL of the queue where
     * an unaffordable price was merely wasteful; queueRemoteHaul now puts it at
     * the head, where it would answer ERR_NOT_ENOUGH_ENERGY forever and hold the
     * whole room. Two ways it can overshoot: the `Math.max(2, ...)` floor
     * outrunning a tiny capacity, and the roaded odd-CARRY rounding (move =
     * ceil(carry/2)), which prices a budget-bound body at exactly capacity —
     * buyable only with the extension network 100% full, which a room that is
     * spending on creeps never is. clampSpawnListToCapacity's 85% routine budget
     * would shrink that one anyway, but the producer should not emit it.
     */
    while(carry > 2 && carry * 50 + move * 50 > room.energyCapacityAvailable) {
        carry--;
        move = Math.max(1, Math.ceil(carry * movePerCarry));
    }
    if(carry * 50 + move * 50 > room.energyCapacityAvailable) return [];

    const body = [];
    for(let i = 0; i < carry; i++) body.push(CARRY);
    for(let i = 0; i < move; i++) body.push(MOVE);
    while(body.length > 50) body.pop();
    return body;
}

/**
 * How many carriers to split this source's haul demand across, given what one
 * body can actually be at this RCL.
 */
function carriersWantedForSource(room, values, demand):number {
    const budget = room.energyCapacityAvailable;
    const roaded = demand.roaded;
    const movePerCarry = roaded ? 0.5 : 1;
    const unitCost = 50 + 50 * movePerCarry;
    const maxCarryByBudget = Math.max(1, Math.floor(budget / unitCost));
    const maxCarryByParts = Math.floor(50 / (1 + movePerCarry));
    const bestSingle = Math.min(maxCarryByBudget, maxCarryByParts) * 50;
    if(bestSingle <= 0) return 1;
    return Math.max(1, Math.min(MAX_CARRIERS_PER_SOURCE, Math.ceil(demand.capacityNeeded / bestSingle)));
}



/** MAX bodies we will ever put on one HOME source (the remote cap is 3 too) */
const MAX_HOME_CARRIERS_PER_SOURCE = 3;

/**
 * How many carriers one OWNED source needs.
 *
 * Sized to the same live e/t getCarrierBody uses (`2 *` WORK on miners tagged
 * with this sourceId, floor 4, cap 10), times `roundTrip * headroom`. A source
 * with a miner always wants at least one hauler. Drain pressure adds at most
 * one more, and only when the haulers are NOT already sitting full — a room
 * whose carriers are parked loaded is sink-limited, and more carriers there
 * make the jam worse (see drainPressure).
 */
function homeCarriersWanted(room, values, body, sourceId): number {
    const L = values && values.pathLength != null ? values.pathLength : 15;
    let carry = 0;
    let move = 0;
    for(const p of body) {
        if(p === CARRY) carry++;
        else if(p === MOVE) move++;
    }
    /*
     * The loaded leg is NOT one tick per tile.
     *
     * getCarrierBody is 1:1 on dirt (RCL1–3) and 2:1 once storage exists.
     * A loaded CARRY generates 2 fatigue per plain tile against 2 removed per
     * MOVE, so ticks/tile is ceil(CARRY/MOVE). An EMPTY carrier generates no
     * fatigue, so the outbound leg is always full speed. Modelling the round
     * trip as a flat 2L under-counts a 2:1 body by ~50%.
     */
    // 2:1 bodies are road speed (1 tick/tile loaded). Using ceil(C/M)=2
    // here counted plains time on a roaded path → 3L+6 vs remotes' 2L+6 (R6.20).
    const src:any = Game.getObjectById(sourceId);
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    const roaded = src ? homePathIsRoaded(room, src, room.storage, spawn) : (move > 0 && carry >= move * 2);
    const loadedTicksPerTile = roaded ? 1 : (move > 0 ? Math.max(1, Math.ceil(carry / move)) : 3);
    const roundTrip = L + L * loadedTicksPerTile + 6;
    /*
     * HEADROOM, same idea as remoteCarrierDemand's. A home carrier does not do
     * a clean source -> storage shuttle: without a storage it delivers to a
     * dozen extensions and a spawn scattered around the hub, and it fills from
     * whatever pile is nearest rather than one container. The clean figure is a
     * floor, and a room sized exactly to its floor can never clear a backlog.
     */
    const headroom = room.storage && room.storage.my ? 1.15 : 1.35;
    const harvest = homeSourceHarvest(room, sourceId);
    const capacityNeeded = harvest.energyPerTick * roundTrip * headroom;
    const per = Math.max(50, carry * 50);
    let want = Math.ceil(capacityNeeded / per);
    // At least one hauler when any miner is live — not one hauler PER miner.
    // Overlap (dying + hatching) used to force a 2nd carrier (R6.26).
    if(harvest.miners > 0 && want < 1) want = 1;
    if(want > MAX_HOME_CARRIERS_PER_SOURCE) want = MAX_HOME_CARRIERS_PER_SOURCE;
    const pressure = drainPressure(room);
    if(pressure.haul > 0) want = Math.min(MAX_HOME_CARRIERS_PER_SOURCE + 1, want + pressure.haul);
    return want;
}

/* -------------------------------------------------------------------------
 * ONE pass over Game.creeps per producer pass.
 *
 * The producer answered the same questions — "who is on this source", "who has
 * this role" — by walking the whole creep list from about twenty places, and
 * several of those sit INSIDE a per-source loop (homeSourceHarvest runs twice
 * per home source, liveCarriersForSource and minerOnTheWay once each), so a
 * four-source commune walked Game.creeps a dozen-plus times per pass. Every one
 * of those predicates keys on memory.sourceId or memory.role, so one grouped
 * index answers all of them.
 *
 * Rebuilt at the top of add_creeps_to_spawn_list rather than memoised on
 * Game.time alone: a creep spawned from an EARLIER room's queue in the same
 * tick is already in Game.creeps (creeps under construction are), and these
 * lookups must see it. Nothing spawns DURING a producer pass — spawnFirstInLine
 * runs before it and returns "spawning" if it did — so one build per pass is
 * exactly enough, and the Game.time check only stops a stale index leaking into
 * the next tick.
 * ------------------------------------------------------------------------- */
let _creepIdxTick = -1;
let _creepIdx: any = null;

function refreshCreepIndex(): void {
    _creepIdx = null;
    _creepIdxTick = Game.time;
}

function creepIndex(): any {
    if(_creepIdx && _creepIdxTick === Game.time) return _creepIdx;
    const bySource: any = {};
    const byRole: any = {};
    for(const name in Game.creeps) {
        const c: any = Game.creeps[name];
        if(!c || !c.memory) continue;
        const role = c.memory.role;
        if(role) (byRole[role] || (byRole[role] = [])).push(c);
        const sid = c.memory.sourceId;
        if(sid) (bySource[sid] || (bySource[sid] = [])).push(c);
    }
    _creepIdxTick = Game.time;
    _creepIdx = {bySource, byRole};
    return _creepIdx;
}

/** every live creep (hatching included) tagged with this memory.sourceId */
function creepsForSource(sourceId): any[] {
    return creepIndex().bySource[sourceId] || [];
}

/** every live creep (hatching included) with this memory.role */
function creepsWithRole(role:string): any[] {
    return creepIndex().byRole[role] || [];
}

/**
 * ONE walk over the flat spawn queue.
 *
 * `room.memory.spawn_list` is [body, name, opts] x N, and it was walked by hand
 * in about eleven places under THREE different bounds conventions —
 * `i=0; i+2<len`, `i=1; i+1<len`, and `i=1; i<len` reading `[i+1]` one cell past
 * the end. This is the single convention: whole triples only, nothing read past
 * the end, body/name/opts named. The read-only walks go through here; the
 * MUTATING sites (splice / shift / length=) keep their own loops and each of
 * them only ever moves three cells at a time, so the multiple-of-3 invariant
 * holds there too.
 *
 * Return false from `cb` to stop early; return true to carry on.
 */
function forEachQueued(room, cb:(body:any, name:any, opts:any, idx:number) => any): void {
    const q = room.memory.spawn_list || [];
    for(let i = 0; i + 2 < q.length; i += 3) {
        if(cb(q[i], q[i + 1], q[i + 2], i) === false) return;
    }
}

/** The names currently on the queue, head first. */
function queuedNames(room): string[] {
    const names: string[] = [];
    forEachQueued(room, function(body, name) {
        if(typeof name === 'string') names.push(name);
    });
    return names;
}

/**
 * Is a creep whose name starts with `prefix` already QUEUED for this source?
 */
function queuedForSource(room, prefix:string, sourceId):boolean {
    let found = false;
    forEachQueued(room, function(body, name, opts) {
        if(typeof name !== 'string' || name.indexOf(prefix) !== 0) return true;
        if(opts && opts.memory && opts.memory.sourceId == sourceId) {
            found = true;
            return false;
        }
        return true;
    });
    return found;
}

/**
 * Is a creep whose name starts with `prefix` already on the spawn queue?
 *
 * Same walk as queuedForSource, but role-wide (no sourceId). The danger
 * re-producer would otherwise stack named rungs (RampartDefender/RRD,
 * SpecialRepair/Carry, Clearer, Repair, Maintainer) while a stuck head
 * keeps the queue non-empty.
 */
function queuedWithPrefix(room, prefix:string):boolean {
    let found = false;
    forEachQueued(room, function(body, name) {
        if(typeof name === 'string' && name.indexOf(prefix) === 0) {
            found = true;
            return false;
        }
        return true;
    });
    return found;
}

/**
 * Queue a REMOTE hauler/reserver near the HEAD of the spawn list.
 *
 * The queue is strict FIFO — spawnFirstInLine only ever calls spawnCreep on
 * index 0 — and the remote crew was being queued at BOTH ends of it: the miner
 * `unshift`ed to the head, its carriers and the reserver `push`ed to the tail,
 * behind every Builder/Upgrader/Maintainer the same producer pass had just
 * added. Three separate mechanisms then finished the job:
 *
 *   * clampSpawnListToCapacity trims from the TAIL at MAX_SPAWN_QUEUE,
 *   * the whole list is wiped after 1200 idle ticks,
 *   * and queuedForSource() sees the doomed tail entry and suppresses the
 *     re-request while it is still there.
 *
 * So the miner hatched, walked out, and drop-mined into decay while its haul
 * never arrived. Live Memory.rstats across every remote in the empire: energy
 * delivered tracked carrier creep-ticks ~1:1 — the miners were never the
 * bottleneck, the hauling was, and remote mining came out net-negative.
 *
 * A hauler is worth exactly as much as the miner it serves, so it gets the same
 * priority — with one ordering rule. spawn_energy_miner runs BEFORE spawn_carrier
 * in every RCL rung and unshifts, so a remote miner queued in this very pass is
 * sitting at index 0; the carrier goes BEHIND it (and behind any sibling miner
 * for the same remote), because a hauler that arrives before there is anything
 * on the ground burns half its 1500 ticks walking to an empty room.
 *
 * Position is not load-bearing for any dedup: queuedForSource() and the
 * reserver's own forEachQueued scan both match on the name prefix, and the
 * queued-census pass skips any triple whose memory.targetRoom is not this room.
 *
 * THE HOME FILL CREW OUTRANKS ALL OF THIS. Filler and EnergyManager are also
 * `unshift`ed by the same producer pass, and they are what moves energy into
 * the extensions this queue spawns FROM — jumping the line in front of them
 * stalls the whole room, not just the remote. Worse, it is self-sealing: the
 * queued census counts a queued filler as live, so while a remote carrier sits
 * on top of it the room never re-queues a second one and the stuck entry never
 * gets company. So the scan below steps over head triples belonging to the fill
 * crew exactly as it steps over same-remote miners, and the remote body lands
 * behind them.
 */
function queueRemoteHaul(room, body, name, opts): void {
    const q = room.memory.spawn_list;
    const tgt = opts && opts.memory && opts.memory.targetRoom;
    let at = 0;
    if(tgt && tgt !== room.name) {
        // Walk past the whole PRIORITY BLOCK at the head — fill crew, every
        // remote miner (any remote), and haul/reserve triples queued before
        // this one — and land right behind it. Breaking on the first miner
        // of a DIFFERENT remote (the previous rule) put E37N59's queue at
        // [Carrier36, Carrier38, Miner36, Miner38, Filler, Reserver]: two
        // 1750e carriers hatching 200 ticks before the miners they haul for,
        // and a filler four bodies deep. Miners still unshift to index 0, so
        // they always precede the haul that follows them; carriers keep FIFO
        // among themselves; a later emergency unshift still beats all of it.
        while(at + 2 < q.length) {
            const mem = q[at + 2] && q[at + 2].memory;
            if(!mem) break;
            const remote = !!mem.targetRoom && mem.targetRoom !== room.name;
            const priority =
                mem.role === 'filler' || mem.role === 'EnergyManager' ||
                (remote && (mem.role === 'EnergyMiner' || mem.role === 'carry' || mem.role === 'reserve'));
            if(!priority) break;
            at += 3;
        }
    }
    // splice(0, 0, ...) is unshift; anything else lands right behind the
    // priority block already at the front.
    q.splice(at, 0, body, name, opts);
}

/**
 * Is anything actually working, hatching or waiting for this source?
 *
 * Creeps under construction are already in Game.creeps (creep.spawning), so a
 * miner mid-hatch counts and cannot be double-queued.
 */
function minerOnTheWay(room, sourceId):boolean {
    return _.some(creepsForSource(sourceId), (creep:any) => creep.memory.role == 'EnergyMiner')
        || queuedForSource(room, 'EnergyMiner', sourceId);
}

/** Live or queued EnergyMiner already walking this remote (any source). */
function minerGoingToRemote(room, targetRoomName): boolean {
    if(_.some(creepsWithRole("EnergyMiner"), (c: any) => c.memory.targetRoom == targetRoomName)) {
        return true;
    }
    let found = false;
    forEachQueued(room, function(body, name, opts) {
        if(typeof name !== "string" || name.indexOf("EnergyMiner") !== 0) return true;
        if(opts && opts.memory && opts.memory.targetRoom == targetRoomName) {
            found = true;
            return false;
        }
        return true;
    });
    return found;
}

/** Hostiles or an invader core — same bar remoteIsHot uses on a visible room. */
function remoteLooksThreatened(vis): boolean {
    if(!vis) return false;
    if(vis.find(FIND_HOSTILE_CREEPS).length > 0) return true;
    return vis.find(FIND_HOSTILE_STRUCTURES, {
        filter: (s: any) => s.structureType === STRUCTURE_INVADER_CORE,
    }).length > 0;
}

/** live carriers (incl. mid-dropoff FakeFillers and hatching ones) bound to a source */
function liveCarriersForSource(room, sourceId):number {
    let n = 0;
    for(const c of creepsForSource(sourceId)) {
        const r = c.memory.role;
        if((r == 'carry' || r == 'FakeFiller') && c.memory.homeRoom == room.name) n++;
    }
    return n;
}

/**
 * Does the haul path for this remote actually have roads on it?
 *
 * getCarrierBody has always emitted a 2:1 CARRY:MOVE body. That ratio is exactly
 * road speed — on plain terrain a loaded 2:1 carrier moves at HALF speed, so the
 * real round trip is ~1.5-2x the distance the body was sized for. Measured on the
 * live server: every active remote had `road: 0`. Zero. So every remote carrier
 * in the fleet was sized for a trip it physically could not make in that time,
 * and the shortfall was being papered over by spawning more carriers.
 *
 * Until roads exist, build 1:1 (full speed loaded on plain).
 */
function remotePathIsRoaded(room, targetRoomName, values?, sourceId?):boolean {
    // Cached room-wide `roaded` compared ALL remote-room roads to the FULL
    // path length (home+highway+remote), so a paved remote often read false
    // and a cluttered one read true (R6.23). Walk the path when we can.
    if(values && values._roadChk != null && Game.time - values._roadChk < 80) {
        return !!values._roadedWalk;
    }
    const origin = room.storage || room.find(FIND_MY_SPAWNS)[0];
    const src:any = sourceId ? Game.getObjectById(sourceId) : null;
    if(origin && src && src.pos) {
        const ret = PathFinder.search(origin.pos, {pos: src.pos, range: 1}, {
            plainCost: 2, swampCost: 10, maxRooms: 16, maxOps: 4000
        });
        if(!ret.incomplete && ret.path && ret.path.length) {
            let remoteTiles = 0;
            let remoteRoads = 0;
            for(let i = 0; i < ret.path.length; i++) {
                const p = ret.path[i];
                if(p.roomName !== targetRoomName) continue;
                remoteTiles++;
                const rm = Game.rooms[p.roomName];
                if(!rm) continue;
                const structs = rm.lookForAt(LOOK_STRUCTURES, p.x, p.y);
                for(let j = 0; j < structs.length; j++) {
                    if(structs[j].structureType === STRUCTURE_ROAD) {
                        remoteRoads++;
                        break;
                    }
                }
            }
            const roaded = remoteTiles > 0 && remoteRoads >= remoteTiles * 0.4;
            if(values) {
                values._roadChk = Game.time;
                values._roadedWalk = roaded;
            }
            return roaded;
        }
    }
    const res = room.memory.resources;
    return !!(res && res[targetRoomName] && res[targetRoomName].roaded);
}

/**
 * How long a no-vision 25,25 path guess is trusted before it is re-derived.
 * Nothing about a remote's distance moves on a shorter horizon than this.
 */
const REMOTE_PATH_GUESS_TTL = 500;

/**
 * pathLength is only written by Build_Remote_Roads (500-tick cadence, many
 * bails). Derive it on demand so a missing cache does not refuse the body
 * (R6.24). Real paths are cached on values.pathLength; 25,25 guesses are NOT
 * (they would poison remotes scoring, which treats a pathLength as a survey) —
 * getRemoteCarrierBody deliberately deletes the guess again after using it.
 *
 * That delete meant the 6000-op search below re-ran on EVERY producer pass,
 * forever, for every unobserved remote source. The guess now lives under its
 * own key with a tick stamp, so it is recomputed at most once per
 * REMOTE_PATH_GUESS_TTL ticks while vision is missing, and it still never looks
 * like a survey to anything that reads pathLength.
 */
function ensureRemotePathLength(room, targetRoomName, values, sourceId?): number | null {
    if(!values) return null;
    if(values.pathLength != null) return values.pathLength;
    if(values._pathGuess != null && Game.time - (values._pathGuessT || 0) < REMOTE_PATH_GUESS_TTL) {
        return values._pathGuess;
    }
    const origin = room.storage || room.find(FIND_MY_SPAWNS)[0];
    if(!origin) return null;
    const src:any = sourceId ? Game.getObjectById(sourceId) : null;
    const goal = src && src.pos
        ? {pos: src.pos, range: 1}
        : {pos: new RoomPosition(25, 25, targetRoomName), range: 15};
    const ret = PathFinder.search(origin.pos, goal, {
        plainCost: 2, swampCost: 10, maxRooms: 16, maxOps: 6000
    });
    if(ret.incomplete || !ret.path || !ret.path.length) return null;
    if(src && src.pos) {
        values.pathLength = ret.path.length;
        delete values._pathGuess;
        delete values._pathGuessT;
        return values.pathLength;
    }
    values._pathGuess = ret.path.length;
    values._pathGuessT = Game.time;
    return ret.path.length;
}

/*
 * homePathIsRoaded memo. The walk below is a findPathTo plus one lookForAt per
 * tile, and it is asked twice for every home source on every producer pass —
 * once by getCarrierBody for the CARRY:MOVE ratio and once by
 * homeCarriersWanted for the loaded-leg speed. Keyed on origin as well as
 * source because the two callers can pass DIFFERENT origins in a room with no
 * real storage (hub container vs spawn), and conflating them would change the
 * answer. Per-tick only: roads do change, and a stale ratio is a wrong body.
 */
let _homeRoadTick = -1;
let _homeRoadCache: { [key: string]: boolean } = {};

/**
 * Is the haul path from the hub to this HOME source actually paved?
 *
 * remotePathIsRoaded reads a cached room-wide count (no vision). We have the
 * room, so walk the real path and apply the same 40% threshold. A couple of
 * lab/controller roads must not flip a still-dirt source arterial to 2:1.
 */
function homePathIsRoaded(room, targetSource, storage, spawn): boolean {
    const origin = storage || spawn;
    if(!origin || !targetSource || !targetSource.pos) return false;
    if(_homeRoadTick !== Game.time) {
        _homeRoadTick = Game.time;
        _homeRoadCache = {};
    }
    const key = room.name + "|" + (origin.id || origin.pos.x + "," + origin.pos.y) +
        "|" + (targetSource.id || targetSource.pos.x + "," + targetSource.pos.y);
    if(_homeRoadCache[key] !== undefined) return _homeRoadCache[key];
    const path = origin.pos.findPathTo(targetSource, {ignoreCreeps: true, ignoreRoads: false});
    if(!path || path.length === 0) {
        _homeRoadCache[key] = false;
        return false;
    }
    let roads = 0;
    for(let i = 0; i < path.length; i++) {
        const structs = room.lookForAt(LOOK_STRUCTURES, path[i].x, path[i].y);
        for(let j = 0; j < structs.length; j++) {
            if(structs[j].structureType === STRUCTURE_ROAD) {
                roads++;
                break;
            }
        }
    }
    const roaded = roads >= path.length * 0.4;
    _homeRoadCache[key] = roaded;
    return roaded;
}

/**
 * How much CARRY capacity does this remote source need in flight, and how many
 * carriers should provide it?
 *
 * capacity needed = yield/tick * round-trip ticks
 *   yield/tick   : 10 for a reserved remote source (3000/300), else 5 (1500/300)
 *   round trip   : 2*pathLength + ~6 ticks of load/unload slack
 *
 * The old code computed a single body from `6 * (2L+2)` and then capped it at
 * `energyCapacityAvailable - 100`, silently under-delivering whenever the demand
 * exceeded one body — with no second carrier to make up the difference. Splitting
 * across N carriers is what actually closes the gap.
 */
function remoteCarrierDemand(room, targetRoomName, values, sourceId?) {
    const L = values && values.pathLength != null ? values.pathLength : 40;
    const rr = Game.rooms[targetRoomName];
    // Prefer live vision, fall back to the verdict manageRemotes cached. A long
    // remote spends most of its time unobserved, and sizing must not depend on
    // whether we happen to have a creep standing there this tick.
    const resMem = room.memory.resources;
    const cached = resMem && resMem[targetRoomName];
    /*
     * A source regenerates 1500/300 = 5 e/tick unreserved and 3000/300 = 10
     * reserved — and only OUR reservation does that for us. Two corrections:
     *
     *  - `!!rr.controller.reservation` counted a RIVAL's reservation as ours
     *    and sized the fleet for 10 e/tick against a source still producing 5,
     *    i.e. double the carrier bodies for the same delivery.
     *  - the reverse gap is worse and is the one E37N59 lives in: while a
     *    reserver is walking out (600-tick creep, up to 120 tiles) there is no
     *    reservation yet, so the carriers spawned in that window are sized for
     *    5 and stay undersized for their whole 1500-tick life once the source
     *    goes to 10. Measured on both of E37N59's remotes: cFull = 0 out of
     *    234/296 carrier samples — the carriers were NEVER full — with 135,609
     *    energy dropped on E36N59's floor. Count a committed reserver.
     */
    const myName = room.controller && room.controller.owner && room.controller.owner.username;
    const liveRsv = rr && rr.controller ? rr.controller.reservation : null;
    /*
     * Blind, `cached.reserved` is not enough on its own. It is only ever written
     * with vision (rooms.remotes.ts), so it goes stale in exactly the direction
     * that hurts: it says false for a remote we reserved while nobody was
     * looking. `rsvEnd`, stamped by the reserver rung from the same vision, is
     * the one that carries a DEADLINE rather than a bare flag, so a stamp still
     * in the future outranks a stale `reserved:false`. Plus anything already on
     * its way to fix it — a reserver alive or merely queued means the source is
     * 10 e/t well before this carrier's 1500 ticks are up.
     */
    const reserved = liveRsv
        ? (!myName || liveRsv.username === myName)
        : !!((cached && cached.reserved)
            || (cached && (cached.rsvEnd || 0) > Game.time)
            || reserverPending(room, targetRoomName));
    const yieldPerTick = reserved ? 10 : 5;
    const roaded = remotePathIsRoaded(room, targetRoomName, values, sourceId);
    // The body ratio picked in getCarrierBody is always matched to the terrain
    // (1:1 off-road, 2:1 on roads), so the loaded leg is 1 tick/tile either way
    // and the round trip is just out + back plus load/unload slack. This is the
    // assumption the OLD code got wrong: it always built 2:1 and then assumed
    // road speed on unroaded ground.
    const roundTrip = L * 2 + 6;

    /*
     * HEADROOM. The clean `yield * roundTrip` figure is a floor, not a target:
     * it assumes the carrier fills instantly and walks an unobstructed straight
     * line. Reality costs more — room-transition ticks, queueing at the exit
     * tile, and (worst) filling from scattered ground piles when the remote has
     * no source container.
     *
     * Measured after the first round of sizing fixes: E2S8's remotes sat at
     * exactly the modelled carrier count yet still left 2.4-3.2k energy rotting
     * on the floor while delivery fell, i.e. the model was systematically short.
     * These remotes have zero containers, which is the expensive case.
     */
    const res = room.memory.resources;
    // Per-source when the source is visible; else room-wide cache (flag: R6.27).
    let conts = (res && res[targetRoomName] && res[targetRoomName].containers) || 0;
    const src:any = sourceId ? Game.getObjectById(sourceId) : null;
    if(src && src.pos && src.room) {
        conts = src.pos.findInRange(FIND_STRUCTURES, 1, {filter: (s:any) => s.structureType == STRUCTURE_CONTAINER}).length;
    }
    const headroom = conts > 0 ? 1.25 : 1.5;
    const capacityNeeded = Math.ceil(yieldPerTick * roundTrip * headroom);
    return { capacityNeeded, roaded, roundTrip, reserved, headroom };
}

/** Any home hauler live or queued — stops the RCL1 sweeper from stacking. */
function roomHasHauler(room): boolean {
    const live = creepsWithRole('carry')
        .concat(creepsWithRole('FakeFiller'))
        .concat(creepsWithRole('sweeper'));
    if(_.some(live, (c:any) => c.memory.homeRoom == room.name || c.room.name == room.name)) {
        return true;
    }
    return _.some(queuedNames(room), (n:string) =>
        n.indexOf('Carrier') === 0 || n.indexOf('Sweeper') === 0);
}

function spawn_energy_miner(resourceData:any, room, activeRemotes) {
    let storage = Game.getObjectById(room.memory.Structures?.storage) || room.findStorage();

    _.forEach(resourceData, function(data, targetRoomName){
        if(activeRemotes.includes(targetRoomName)) {
            let index = 0;

            let containerBuilders = [];
            if(room.controller.level <= 5) {
                containerBuilders = _.filter(creepsWithRole('buildcontainer'), (creep:any) => creep.memory.targetRoom == room.name);
            }
            // BEHAVIOR CHANGE: any live CB targeting this room used to abort
            // miner spawning for EVERY source at RCL<=4, so a colony with a CB
            // up never queued miners. Hold only HOME miners, and only while the
            // room still has no container (spawn already exists if we got here).
            let holdHomeMinersForContainer = false;
            if(room.controller.level <= 4 && containerBuilders.length && targetRoomName == room.name) {
                holdHomeMinersForContainer = room.find(FIND_STRUCTURES, {filter: (s:any) => s.structureType == STRUCTURE_CONTAINER}).length == 0;
            }

            // F3 sets probeFirst when hot expires with no vision. First body
            // in must be a [WORK,WORK,MOVE] probe — a scouted remote would
            // otherwise get the 8W crew and walk it into a still-cored room
            // (cores outlive HOT_COOLDOWN). Leave the flag set until a quiet
            // visible pass so the next producer cadence cannot send a full
            // miner for the other source while the probe is still walking.
            // "Once" is minerGoingToRemote. remoteIsHot first so expiry this
            // tick actually sets the flag before we look at it.
            if(targetRoomName != room.name) {
                if(remoteIsHot(room, targetRoomName)) {
                    return;
                }
                if(data.probeFirst) {
                    const vis = Game.rooms[targetRoomName];
                    if(vis && !remoteLooksThreatened(vis)) {
                        delete data.probeFirst;
                    }
                    else {
                        if(!vis && !minerGoingToRemote(room, targetRoomName) && data.energy) {
                            let probeSourceId = null;
                            let probeValues = null;
                            for(const sid in data.energy) {
                                probeSourceId = sid;
                                probeValues = data.energy[sid];
                                break;
                            }
                            if(probeSourceId) {
                                const newName = 'EnergyMiner-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                                room.memory.spawn_list.unshift([WORK,WORK,MOVE], newName,
                                    {memory: {role: 'EnergyMiner', sourceId: probeSourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                                console.log('Adding Energy Miner (probe, reopen) to Spawn List: ' + newName);
                                if(probeValues) probeValues.lastSpawn = Game.time-120;
                                // Consumed: one probe is queued. Flag stays
                                // until the quiet scouted pass above so we
                                // do not send the rest of the crew behind it.
                            }
                        }
                        return;
                    }
                }
            }
            _.forEach(data.energy, function(values, sourceId:any) {


                if(holdHomeMinersForContainer) {
                    return;
                }

                if(index == 1 && room.controller.progress == 0 && room.controller.level == 1 && room.memory.data.DOB <= 60 && !roomHasHauler(room)) {
                    let newName = 'Sweeper-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push([CARRY,MOVE], newName, {memory: {role: 'sweeper'}});
                    console.log('Adding Sweeper to Spawn List: ' + newName);
                }


                // ---- poisoned lastSpawn self-heal ------------------------
                // `values.lastSpawn` is stamped when a miner is QUEUED, not when
                // it hatches, and it silences this producer for a full
                // CREEP_LIFE_TIME. That is only sound while the queued entry
                // survives, and it does not always: the idle-queue wipe at the
                // top of spawning(), the capacity drop in
                // clampSpawnListToCapacity and the -3/-14/-10 clear in
                // spawnFirstInLine all throw entries away. The stamp then keeps
                // insisting a miner is on the way while the source sits unmined
                // for 1500 ticks - and for a room whose income IS that source
                // that is a total blackout, followed by another one, forever.
                // Live E11S2: RCL6, storage 0, container empty, spawn queue
                // EMPTY, lastSpawn 1496 ticks old, zero miners, zero carriers.
                //
                // Same shape as the lastSpawnCarrier heal in spawn_carrier: if
                // nothing is working, hatching or waiting for this source then
                // the stamp is a lie, so drop it and let the rungs below re-queue
                // this tick instead of ~1500 ticks from now.
                let onTheWay = minerOnTheWay(room, sourceId);
                if(!onTheWay && (values.lastSpawn || 0) > Game.time - CREEP_LIFE_TIME) {
                    console.log("clearing stale lastSpawn for source", sourceId, "in", room.name,
                        "- no miner alive or queued");
                    values.lastSpawn = 0;
                }
                // Never stack a second miner on a source that already has one
                // waiting. The duplicate is unshifted, so it JUMPS the queue,
                // resets spawnStall/spawnStallName and throws away the
                // head-of-line shrink progress in spawnFirstInLine - which is
                // exactly how E11S2 kept losing a body it had almost walked down
                // to something it could afford.
                else if(onTheWay && queuedForSource(room, 'EnergyMiner', sourceId)) {
                    index++;
                    return;
                }

                if (Game.time - (values.lastSpawn || 0) > CREEP_LIFE_TIME) {
                    let newName = 'EnergyMiner-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    if(targetRoomName == room.name) {
                        let danger = false;
                        if(values.pathLength && room.memory.danger && values.pathLength >= 13) {
                            danger = true;
                            let mySource:any = Game.getObjectById(sourceId)
                            if(mySource) {
                                let HostileCreeps = room.find(FIND_HOSTILE_CREEPS);
                                if(HostileCreeps.length > 0) {
                                    let closestHostileToSource = mySource.pos.findClosestByRange(HostileCreeps);
                                    if(mySource.pos.getRangeTo(closestHostileToSource) <= 4 && closestHostileToSource.getActiveBodyparts(RANGED_ATTACK) > 0) {
                                        return;
                                    }
                                }
                            }
                        }
                        if(room.energyCapacityAvailable >= 750) {
                            if(room.controller.level >= 6) {
                                if(room.memory.labs && room.memory.labs.status && !room.memory.labs.status.boost) {
                                    room.memory.labs.status.boost = {};
                                }
                                if(Memory.CPU.reduce && boostStock(room, RESOURCE_UTRIUM_OXIDE) >= 720 && room.memory.labs && room.memory.labs.outputLab8) {
                                    room.memory.labs.lab8reserved = true;
                                    // chargeBoostSlot REFUSES (returns false) when
                                    // lab8 already holds somebody else's mineral —
                                    // typically the boosted RCL8 Repair rung's
                                    // XKH2O — and rolls lab8reserved back itself.
                                    // The miner used to be queued with
                                    // boostlabs:[lab8] regardless, so it walked to
                                    // a lab loaded with the wrong compound and sat
                                    // there. Honour the refusal: same body, no
                                    // boost memory. (Mirror of the !lab8reserved
                                    // guard the repair rung uses in the other
                                    // direction.)
                                    const uoBoosted = chargeBoostSlot(room, "lab8", 360, newName);
                                    let body;
                                    if(danger) {
                                        body = [WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,CARRY,MOVE]
                                    }
                                    else {
                                        body = [WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,CARRY,MOVE]
                                    }
                                    const minerMem: any = {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name, danger:danger};
                                    if(uoBoosted) {
                                        minerMem.boostlabs = [room.memory.labs.outputLab8];
                                    }
                                    room.memory.spawn_list.unshift(body, newName, {memory: minerMem});

                                }
                                else {
                                    // Do not wipe lab8 — that stomped any other
                                    // live reservation on the same slot.
                                    let body;
                                    if(danger) {
                                        body = [WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,CARRY,MOVE]
                                    }
                                    else if(room.energyAvailable > 3000 && Game.cpu.bucket < 9000) {
                                        body = [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,WORK,WORK,CARRY,MOVE]
                                    }
                                    else {
                                        body = [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,WORK,WORK,CARRY,MOVE]
                                    }
                                    room.memory.spawn_list.unshift(body, newName,
                                        {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name, danger: danger}});
                                }
                                // [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,WORK,CARRY,MOVE]
                            }
                            else {
                                room.memory.spawn_list.unshift([MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,MOVE], newName,
                                    {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                            }
                            console.log('Adding Energy Miner to Spawn List: ' + newName);
                            values.lastSpawn = Game.time;
                        }

                        else if(room.energyCapacityAvailable >= 550) {
                            if(room.controller.level >= 7) {
                                room.memory.spawn_list.unshift([WORK,WORK,WORK,WORK,CARRY,MOVE], newName,
                                    {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                            }
                            else if(room.controller.level == 6) {
                                room.memory.spawn_list.unshift([WORK,WORK,WORK,WORK,WORK,MOVE], newName,
                                    {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                            }
                            else {
                                room.memory.spawn_list.unshift([WORK,WORK,WORK,WORK,WORK,MOVE], newName,
                                    {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                            }
                            console.log('Adding Energy Miner to Spawn List: ' + newName);
                            values.lastSpawn = Game.time;
                            values.fiveWQueued = true;
                        }

                        else if(room.energyCapacityAvailable > 300) {
                            room.memory.spawn_list.unshift(getBody([WORK,WORK,MOVE], room, 6), newName, {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding Energy Miner to Spawn List: ' + newName);
                            values.lastSpawn = Game.time + Math.floor(Math.random() * (20 - -20) -20) + -450;
                            return;
                        }
                        else {
                            let body;
                            if(room.controller.level >= 5) {
                                body = [WORK,WORK,CARRY,MOVE];
                            }
                            else {
                                body = [WORK,WORK,MOVE];
                            }


                            room.memory.spawn_list.unshift(body, newName, {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding Energy Miner to Spawn List: ' + newName);

                            let sourceObj:any = Game.getObjectById(sourceId);
                            if(sourceObj && sourceObj.pos.getOpenPositions().length > 0) {
                                values.lastSpawn = Game.time + Math.floor(Math.random() * (20 - -20) -20) + -450;
                            }
                            else {
                                values.lastSpawn = Game.time-20;
                            }
                            return;
                        }
                    }

                    else {
                        if(targetRoomName != room.name && room.memory.danger) {
                            return;
                        }
                        // NEVER spawn into a remote we have abandoned for threat
                        // reasons. The old code below treated "no vision" and
                        // "hostiles present" as the SAME case and spawned a
                        // [WORK,WORK,MOVE] miner in both — i.e. it deliberately
                        // walked a 250e creep into the room that had just killed
                        // the last one, forever.
                        if(remoteIsHot(room, targetRoomName)) {
                            return;
                        }
                        // Skip this pass if the cached hostile flag is set, but do
                        // NOT mark the remote hot from it. `roomData` is a stale
                        // cache that survives loss of vision, and a sticky
                        // 600-tick flag set from stale data can never be cleared
                        // (clearing needs vision, vision needs a creep, the flag
                        // blocks the creep). Only scanRemoteThreats(), which
                        // requires real vision, is allowed to mark a remote hot.
                        if(Game.rooms[targetRoomName] && Game.rooms[targetRoomName].memory.roomData &&
                           Game.rooms[targetRoomName].memory.roomData.has_hostile_creeps == true) {
                            return;
                        }
                        // "No vision" used to mean "send a 2-WORK probe". But an
                        // ACTIVE, non-hot remote whose pathLength we already know
                        // is a remote we have already surveyed — the only thing
                        // missing is a creep standing in it. Sending a 2-WORK
                        // body on an 82-tile walk to a reserved 10/tick source
                        // throws away more than half the yield for the whole
                        // creep life. Observed on E3S3->E3S4: both sources parked
                        // at 3000/3000 while 2-WORK probes trickled out.
                        //
                        // Only fall back to the cheap probe when we genuinely
                        // know nothing (no pathLength surveyed yet AND no source
                        // position from the scout). The scout now records x/y
                        // per source and Remote_Roads_Tick paths to it blind
                        // within 500 ticks, so "no vision" alone no longer means
                        // "unsurveyed" — and every retryAt reopen wipes
                        // e.energy, so without this the probe fired on EVERY
                        // reopen and the room then sized 10 e/t carriers around
                        // a 4 e/t miner for 1500 ticks (live E37N59|E38N59:
                        // 2W probe + 3 carriers of 13-34 parts).
                        if((!Game.rooms[targetRoomName] || Game.rooms[targetRoomName] == undefined) && values.pathLength == null
                           && !(typeof values.x === "number" && typeof values.y === "number")) {
                            room.memory.spawn_list.unshift([WORK,WORK,MOVE], newName,
                                {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding Energy Miner (probe, unsurveyed) to Spawn List: ' + newName);
                            values.lastSpawn = Game.time-120;
                        }

                        /*
                         * MATCH THE BODY TO THE SOURCE, NOT TO THE BANK.
                         *
                         * A remote source regenerates 3000/300 = 10 e/t while WE
                         * hold the reservation and 1500/300 = 5 e/t while nobody
                         * does. A WORK part harvests 2 e/t. So the whole ladder
                         * has exactly one interesting number on it: 5 WORK.
                         *
                         * What was here instead: 8 WORK (16 e/t) whenever RCL>=5
                         * and storage > 25k, else 4 WORK (8 e/t). 8 WORK is an
                         * SK-room body — it over-harvests every normal remote by
                         * 60% and we mine no SK rooms — while 4 WORK throws away
                         * a fifth of a reserved source for the creep's whole
                         * life, which is what live rstats showed (miners avg 4
                         * WORK against reserved 10 e/t sources).
                         *
                         * The top rung keeps ONE part of margin over 10 e/t (6
                         * WORK, 12 e/t) on purpose and not as a rounding error: a
                         * source that sat unmined through a replacement gap is
                         * holding up to 3000 energy, and only a body above the
                         * regen rate can ever draw that backlog down. The gate is
                         * energyCapacityAvailable rather than RCL because the
                         * body costs 750 and RCL is a bad proxy for extensions
                         * actually being built.
                         */
                        else if(room.energyCapacityAvailable >= 750 && storage && storage.store[RESOURCE_ENERGY] > 25000) {
                            const remoteMinerBody = [WORK,WORK,MOVE,WORK,WORK,MOVE,WORK,WORK,MOVE];
                            room.memory.spawn_list.unshift(remoteMinerBody, newName,
                                {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding Energy Miner to Spawn List: ' + newName);
                            // Queue lead so the replacement arrives on death:
                            // lastSpawn-20 left a pathLength-20 unmined gap (R6.157).
                            const walk = values.pathLength != null ? values.pathLength : 20;
                            values.lastSpawn = Game.time - (walk + remoteMinerBody.length * 3);
                        }
                        else if(room.energyCapacityAvailable >= 650) {
                            // 5 WORK / 3 MOVE, 650e — exactly the 10 e/t a
                            // reserved source produces, no waste either way.
                            const remoteMinerBody = [WORK,WORK,MOVE,WORK,WORK,MOVE,WORK,MOVE];
                            room.memory.spawn_list.unshift(remoteMinerBody, newName,
                                {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding Energy Miner to Spawn List: ' + newName);
                            const walk = values.pathLength != null ? values.pathLength : 20;
                            values.lastSpawn = Game.time - (walk + remoteMinerBody.length * 3);
                        }
                        else if(room.energyCapacityAvailable >= 500) {
                            const remoteMinerBody = [WORK,WORK,MOVE,WORK,WORK,MOVE];
                            room.memory.spawn_list.unshift(remoteMinerBody, newName,
                                {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding Energy Miner to Spawn List: ' + newName);
                            const walk = values.pathLength != null ? values.pathLength : 20;
                            values.lastSpawn = Game.time - (walk + remoteMinerBody.length * 3);
                        }
                        else {
                            room.memory.spawn_list.unshift([WORK,WORK,MOVE], newName,
                                {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding Energy Miner to Spawn List: ' + newName);
                            values.lastSpawn = Game.time-650;
                        }
                    }
                }

                if(Game.time - (values.lastSpawn || 0) > CREEP_LIFE_TIME*3) {
                    let newName = 'EnergyMiner-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.unshift([WORK,WORK,MOVE], newName,
                        {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                    console.log('Adding Energy Miner to Spawn List: ' + newName);
                    values.lastSpawn = Game.time;
                }


                if(!values.lastSpawn && Game.time < CREEP_LIFE_TIME) {
                    let newName = 'EnergyMiner-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.unshift([WORK,WORK,MOVE], newName,
                        {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                    console.log('Adding Energy Miner to Spawn List: ' + newName);
                    values.lastSpawn = Game.time;
                }
                index++;
            });
        }

    });
}


/**
 * The RCL6 carrier cutoff assumes links replaced hauling for this source.
 * Only true when BOTH ends exist: a link within 2 of the source and a link
 * within 2 of storage (hub-link discovery range). Hybrid rooms where legacy
 * links squat the cap in useless spots must keep their carriers or the
 * whole energy flow collapses (E11S2: storage 0, containers full, RCL frozen).
 */
function sourceLinkHaulWorks(room, sourceId) {
    const source: any = Game.getObjectById(sourceId);
    if (!source || !room.storage) return false;
    const links = room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType == STRUCTURE_LINK });
    return links.some((l: any) => l.pos.inRangeTo(source.pos, 2))
        && links.some((l: any) => l.pos.inRangeTo(room.storage.pos, 2));
}

function spawn_carrier(resourceData, room, spawn, storage, activeRemotes) {
    _.forEach(resourceData, function(data, targetRoomName){
        if(activeRemotes.includes(targetRoomName)) {
            _.forEach(data.energy, function(values, sourceId) {
                // REMOTE carriers are handled first and WITHOUT requiring vision
                // on the remote — see getRemoteCarrierBody(). The vision guard
                // below is kept for the home room only.
                if(targetRoomName != room.name) {
                    if(room.memory.danger) return;
                    if(remoteIsHot(room, targetRoomName)) return;
                    const demand = remoteCarrierDemand(room, targetRoomName, values, sourceId);
                    const want = carriersWantedForSource(room, values, demand);
                    const have = liveCarriersForSource(room, sourceId);
                    if(have >= want || queuedForSource(room, 'Carrier', sourceId)) return;
                    if(Game.time - (values.lastSpawnCarrier || 0) < 60) return;
                    const body = getRemoteCarrierBody(room, targetRoomName, values, sourceId);
                    if(!body || body.length === 0) return;
                    const nm = 'Carrier-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    // HEAD, not tail — behind this remote's miner. See queueRemoteHaul.
                    queueRemoteHaul(room, body, nm,
                        {memory: {role: 'carry', sourceId, targetRoom: targetRoomName, homeRoom: room.name, pathLength:values.pathLength}});
                    values.lastSpawnCarrier = Game.time;
                    console.log('Adding remote Carrier ' + nm + ' -> ' + targetRoomName +
                        ' (' + (have+1) + '/' + want + ', need ' + demand.capacityNeeded + 'e, roaded=' + demand.roaded + ', resv=' + demand.reserved + ')');
                    return;
                }
                /* ---------------- HOME sources ----------------------------
                 * Count-driven, exactly like the remote branch above.
                 *
                 * What this replaces had NO live-count check at all: it was
                 * purely stamp-driven, one rung re-armed the stamp at
                 * `Game.time - 750` for small bodies (double rate), another
                 * added a rung at -700, and the hub-container rung at the bottom
                 * pulled the stamp back a further 200 on every producer pass
                 * while the container was full — so a permanently-full container
                 * ACCELERATED carrier spawning, which is exactly backwards.
                 *
                 * Measured on pacifist1 (the bot's own census): 20 miners against
                 * 55 carriers; E1S4 held 16 carriers for a whole 12,396-tick
                 * window, E15S6 22, E19S7 17, E2S8 16, E2S7 15. In E2S7 ~30% of
                 * all carrier-samples were full AND stationary, and the room
                 * spent 18,500 energy on new bodies in 2,482 ticks (7.45/tick)
                 * to deliver 2.19/tick to its controller.
                 * ---------------------------------------------------------- */
                if(!Game.rooms[targetRoomName]) return;
                const homeVis:any = Game.rooms[targetRoomName];
                // establishMemory only writes roomData for unowned rooms, so
                // after claim the last has_hostile_creeps sticks forever and
                // a colony that fought through invaders never queued home
                // carriers. This branch is the owned home room — live find.
                if(homeVis.find(FIND_HOSTILE_CREEPS, {filter: (c:any) =>
                    c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0
                }).length > 0) return;

                // A stamp in the FUTURE is the old RCL6 link cutoff
                // (5000000000). Under a count-driven scheme it would silence
                // this source forever, so heal it here.
                if((values.lastSpawnCarrier || 0) > Game.time) values.lastSpawnCarrier = 0;

                // RCL6+ with a link at BOTH ends: the link hauls this source and
                // the existing carriers are allowed to die off.
                if(room.controller.level >= 6 && sourceLinkHaulWorks(room, sourceId)) return;

                if(queuedForSource(room, 'Carrier', sourceId)) return;
                const haveHome = liveCarriersForSource(room, sourceId);
                const homeBody = getCarrierBody(sourceId, values, storage, spawn, room);
                if(!homeBody || homeBody.length === 0) return;
                const wantHome = homeCarriersWanted(room, values, homeBody, sourceId);
                if(haveHome >= wantHome) return;
                // One per source per 25 ticks. A hatching creep is already in
                // Game.creeps so it is counted above; this only stops a burst of
                // producer passes in the same handful of ticks from stacking.
                if(Game.time - (values.lastSpawnCarrier || 0) < 25) return;
                const homeName = 'Carrier-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(homeBody, homeName,
                    {memory: {role: 'carry', sourceId, targetRoom: targetRoomName, homeRoom: room.name, pathLength:values.pathLength}});
                values.lastSpawnCarrier = Game.time;
                console.log('Adding Carrier to Spawn List: ' + homeName + ' (' + (haveHome+1) + '/' + wantHome + ')');
            });
        }

    });
}

function spawn_remote_repairer(resourceData, room, activeRemotes) {
    // One per REMOTE, not per source. Live-creep check alone still queued one
    // per source in the same pass (stamp is per-source, queue was not scanned).
    const covered: { [roomName: string]: boolean } = {};
    _.forEach(creepsWithRole('RemoteRepair'), function(c: any) {
        if(c.memory.homeRoom == room.name && c.memory.targetRoom) {
            covered[c.memory.targetRoom] = true;
        }
    });
    forEachQueued(room, function(body, name, opts) {
        if(typeof name !== 'string' || name.indexOf('RemoteRepairer-') !== 0) return;
        if(opts && opts.memory && opts.memory.targetRoom) covered[opts.memory.targetRoom] = true;
    });
    _.forEach(resourceData, function(data, targetRoomName){
        if(activeRemotes.includes(targetRoomName)) {
            /*
             * One RemoteRepairer per SOURCE meant a 2-source remote always got 2,
             * regardless of whether the remote contained a single road. Measured:
             * 6 live RemoteRepairers across pacifist1's remotes, every one of which
             * had road=0 and container=0 to work on — pure spawn waste.
             *
             * Gate on there being actual work, and allow one per REMOTE.
             */
            if(targetRoomName != room.name) {
                if(covered[targetRoomName]) return;
                if(remoteIsHot(room, targetRoomName)) return;
                const rr = Game.rooms[targetRoomName];
                if(!rr) return;
                const hasWork =
                    rr.find(FIND_MY_CONSTRUCTION_SITES).length > 0 ||
                    rr.find(FIND_STRUCTURES, {filter: (s:any) =>
                        (s.structureType == STRUCTURE_ROAD || s.structureType == STRUCTURE_CONTAINER) &&
                        s.hits < s.hitsMax * 0.75}).length > 0;
                if(!hasWork) return;
            }
            const markSpawned = function(stamp) {
                covered[targetRoomName] = true;
                _.forEach(data.energy, function(v: any) { v.lastSpawnRemoteRepairer = stamp; });
            };
            _.forEach(data.energy, function(values, sourceId) {
                if(covered[targetRoomName]) {
                    return;
                }
                if(Game.time - (values.lastSpawnRemoteRepairer || 0) > CREEP_LIFE_TIME * 1.5) {
                    let newName = 'RemoteRepairer-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    if(targetRoomName != room.name && Game.rooms[targetRoomName] && Game.rooms[targetRoomName].memory.roomData && !Game.rooms[targetRoomName].memory.roomData.has_hostile_creeps) {

                        if(room.memory.danger) {
                            return;
                        }

                        if(room.controller.level >= 6) {
                            room.memory.spawn_list.push(getBody([WORK,CARRY,MOVE], room, 23), newName,
                                {memory: {role: 'RemoteRepair', targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding RemoteRepairer to Spawn List: ' + newName);
                            if(Game.rooms[targetRoomName].find(FIND_MY_CONSTRUCTION_SITES).length > 0) {
                                markSpawned(Game.time - 100);
                            }
                            else {
                                markSpawned(Game.time + 50);
                            }
                        }

                        else if(room.energyCapacityAvailable >= 600) {
                            room.memory.spawn_list.push([WORK,CARRY,MOVE,WORK,CARRY,MOVE,WORK,CARRY,MOVE], newName,
                                {memory: {role: 'RemoteRepair', targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding RemoteRepairer to Spawn List: ' + newName);
                            if(Game.rooms[targetRoomName].find(FIND_MY_CONSTRUCTION_SITES).length > 0) {
                                markSpawned(Game.time - 300);
                            }
                            else {
                                markSpawned(Game.time + 200);
                            }
                        }

                        else if(room.energyCapacityAvailable >= 400) {
                            room.memory.spawn_list.push([WORK,CARRY,MOVE,WORK,CARRY,MOVE], newName,
                                {memory: {role: 'RemoteRepair', targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding RemoteRepairer to Spawn List: ' + newName);
                            if(Game.rooms[targetRoomName].find(FIND_MY_CONSTRUCTION_SITES).length > 0) {
                                markSpawned(Game.time - 400);
                            }
                            else {
                                markSpawned(Game.time + 100);
                            }
                        }
                        else {
                            room.memory.spawn_list.push([WORK,CARRY,MOVE], newName,
                                {memory: {role: 'RemoteRepair', targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding RemoteRepairer to Spawn List: ' + newName);
                            markSpawned(Game.time-600);
                        }
                    }
                }
            });
        }

    });
}

/**
 * Should this commune be allowed to run remote reservers at all?
 *
 * Owner rule: reserving is a HIGH-RCL move. Two independent reasons, both
 * measured on the live server before this gate existed:
 *
 * 1. ECONOMICS. A reserver is 600e per CLAIM part and lives only
 *    CREEP_CLAIM_LIFE_TIME (600) ticks, not 1500. At RCL3-4 the commune cannot
 *    afford a body big enough to matter, and the spawn-time it burns is spawn
 *    time not spent on miners/carriers/upgraders. Measured on E2S8 (RCL3):
 *    the remote spent 16.3 energy/tick on creeps to deliver 8.4 energy/tick.
 *
 * 2. MECHANICS. reserveController() adds +1 tick per CLAIM part while the
 *    reservation decays 1 tick/tick. A ONE-CLAIM reserver is therefore exactly
 *    net zero — it can never grow a reservation, it can only stop an existing
 *    one shrinking while it stands there, and it loses ground for every tick it
 *    spends walking. Measured: average reservation ticksToEnd across E2S9/E3S8
 *    was 1.0 with 29% of ticks having no reservation at all. The old RCL<=4
 *    [CLAIM,MOVE] rung was 650e for literally nothing.
 *
 * So: >=2 CLAIM parts or don't bother, which needs 1300 energyCapacity (RCL4+),
 * and gate the whole thing on RCL>=5. RCL4 is allowed ONLY when GCL says we
 * have no free claim slots — if GCL is ahead of our owned-room count there is a
 * free room glut and claiming a room outright beats reserving someone's.
 */
function reserverGate(room): { ok: boolean; reason: string } {
    const lvl = room.controller ? room.controller.level : 0;
    const owned = _.filter(Game.rooms, (r: any) => r.controller && r.controller.my).length;
    const gcl = Game.gcl ? Game.gcl.level : 1;

    if (room.energyCapacityAvailable < 1300) {
        return { ok: false, reason: "cap " + room.energyCapacityAvailable + "<1300 (needs 2xCLAIM; 1 CLAIM is net-zero)" };
    }
    if (lvl >= 5) {
        return { ok: true, reason: "RCL" + lvl + ">=5" };
    }
    if (lvl === 4) {
        /*
         * The RCL4 arm used to refuse whenever GCL was ahead of our owned-room
         * count, on the theory that a free claim slot means claiming beats
         * reserving. Those are not alternatives: claiming a room is an
         * AutoExpand decision on a 20,000-tick timescale, reserving THIS
         * remote doubles its source yield from 5 to 10 e/tick starting the
         * moment the creep arrives, and the room has already opened the remote
         * and is paying for a miner and carriers on it either way. With
         * Memory.features.expandMinRcl holding expansion back until an owned
         * room reaches RCL7, "there is a free claim slot" is now permanently
         * true and the arm was permanently closed.
         *
         * 2 CLAIM (1300 capacity, checked above) is +2/tick against 1/tick of
         * decay, i.e. genuinely net-positive — which is the only thing the
         * economics note below this function actually argues.
         */
        return { ok: true, reason: "RCL4 with cap " + room.energyCapacityAvailable + ">=1300 (2xCLAIM is net-positive; GCL" + gcl + "/owned" + owned + ")" };
    }
    return { ok: false, reason: "RCL" + lvl + "<5" };
}

/** log the gate verdict at most once per 500 ticks per room, so it is visible but not spam */
function logReserverGate(room, g: { ok: boolean; reason: string }) {
    if (!room.memory._rgLog || Game.time - room.memory._rgLog > 500) {
        room.memory._rgLog = Game.time;
        console.log("[reserver-gate] " + room.name + " " + (g.ok ? "ALLOW" : "BLOCK") + " — " + g.reason);
    }
}

/** is a reserver of ours already alive (or hatching) for this remote? */
function anyReserverAlive(room, targetRoomName):boolean {
    return _.some(creepsWithRole('reserve'), (c:any) =>
        c.memory.homeRoom === room.name &&
        c.memory.targetRoom === targetRoomName);
}

/**
 * Alive, hatching, OR still sitting on the spawn queue. Same two populations
 * spawn_reserver's `covered` map is built from, so the dedup there and the
 * "is this source about to become a 10 e/t source" question in
 * remoteCarrierDemand cannot answer differently.
 */
function reserverPending(room, targetRoomName):boolean {
    if(anyReserverAlive(room, targetRoomName)) return true;
    let found = false;
    forEachQueued(room, function(body, name, opts) {
        if(typeof name !== 'string' || name.indexOf('Reserver-') !== 0) return true;
        if(opts && opts.memory && opts.memory.targetRoom === targetRoomName) {
            found = true;
            return false;
        }
        return true;
    });
    return found;
}

/**
 * `storage` and `reservers` used to be parameters here and neither was ever
 * read: the bank test below goes through room.storage deliberately (the
 * Structures cache can hold a hub CONTAINER, which caps at 2000 — see the
 * affordability gate) and the empire-wide `reservers` tally was replaced by
 * the per-commune myReservers list. Dropped from the signature and the call.
 */
function spawn_reserver(resourceData, room, activeRemotes) {
    // OWNER RULE: no remote reservation at low RCL. See reserverGate() above.
    const gate = reserverGate(room);
    logReserverGate(room, gate);
    // The claim rung below (Memory.CanClaimRemote) is a real room CLAIM, not a
    // reservation — 1 CLAIM part is correct there and it is not what the gate is
    // about, so it stays reachable.
    if (!gate.ok && !(Memory.CanClaimRemote >= 3)) return;

    // The census used to tally reservers GLOBALLY, so `reservers > 0` meant
    // exactly ONE reservation could exist across the whole empire. Scope it to
    // this commune, and to one reserver per target room (the loop below runs
    // once per SOURCE, so without this it queues one reserver per source).
    const myReservers: any[] = _.filter(creepsWithRole('reserve'),
        (c: any) => c.memory.homeRoom === room.name) as any[];
    const covered: { [roomName: string]: boolean } = {};
    for(const c of myReservers) {
        if(c.memory.targetRoom) covered[c.memory.targetRoom] = true;
    }
    // reservers already queued but not yet spawned
    forEachQueued(room, function(body, name, opts) {
        if(typeof name !== 'string' || name.indexOf('Reserver-') !== 0) return;
        if(opts && opts.memory && opts.memory.targetRoom) covered[opts.memory.targetRoom] = true;
    });
    const myName = room.controller && room.controller.owner && room.controller.owner.username;

    /*
     * REMEMBER THE RESERVATION — BEFORE ANY EARLY RETURN.
     *
     * This stamp used to live inside the per-room loop below, which is AFTER
     * the `myReservers.length >= 2` bail. Vision of a remote is a creep of ours
     * standing in it, so the ticks when the stamp is available are exactly the
     * ticks two reservers are out walking — i.e. exactly the ticks the bail
     * fires. rsvEnd therefore froze at whatever it was before the reservers
     * landed, the blind branch read a freshly-renewed ~5000-tick reservation as
     * lapsed, and bought another reserver every CREEP_CLAIM_LIFE_TIME.
     *
     * A pre-pass costs one cheap Game.rooms lookup per active remote and is
     * pure bookkeeping — it decides nothing.
     *
     *   rsvEnd  — tick OUR reservation runs out (== now when there is no
     *             reservation or it is somebody else's: "we hold nothing").
     *   rsvUser — whoever holds it, which is what keeps us from blind-spawning
     *             into a room a rival is sitting on.
     */
    _.forEach(resourceData, function(d: any, t: string) {
        if(!activeRemotes.includes(t) || t === room.name) return;
        const r = Game.rooms[t];
        if(!r || !r.controller) return;
        const s = r.controller.reservation;
        d.rsvUser = s ? (s.username || null) : null;
        d.rsvEnd = Game.time + (s && (!myName || s.username === myName) ? s.ticksToEnd : 0);
    });

    if(myReservers.length >= 2) {
        return;
    }
    if(Memory.debugReserver) {
        console.log("[resvdbg]", room.name, "active=" + JSON.stringify(activeRemotes),
            "covered=" + JSON.stringify(Object.keys(covered)), "mine=" + myReservers.length);
    }
    /*
     * ONE HEAD SLOT PER PASS, AND ONE BANK.
     *
     * `covered` is per-remote, and the 2-reserver ceiling above counts only
     * LIVE reservers, so a single pass over an RCL6+ room with three open
     * remotes could splice three reservers in at the front — each one skipping
     * the queue in front of the last, each one priced against the same
     * untouched storage figure. Two counters fix both halves: the first
     * reserver of a pass takes the head slot (it is the one whose reservation
     * is closest to lapsing, since it was reached first), the rest go to the
     * tail; and every request already made this pass is subtracted from the
     * bank before the next one is judged affordable.
     */
    let headUsed = false;
    let reservedThisPass = 0;

    _.forEach(resourceData, function(data, targetRoomName){
        if(activeRemotes.includes(targetRoomName)) {
            // rsvEnd / rsvUser were stamped by the pre-pass at the top of this
            // function, ahead of `covered`, the gate and the hot test — all of
            // which would skip a room whose reservation we still need to see.
            if(covered[targetRoomName]) {
                return;
            }
            const markSpawned = function() {
                covered[targetRoomName] = true;
                // stamp EVERY source of this remote so the next source in the
                // loop doesn't queue a second reserver for the same room
                _.forEach(data.energy, function(v: any) { v.lastSpawnReserver = Game.time; });
            };
            _.forEach(data.energy, function(values, sourceId) {
                if(covered[targetRoomName]) {
                    return;
                }
                let newName = 'Reserver-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;

                // Opportunistic "claim this remote as an owned room" stole GCL
                // slots from AutoExpand (live E36N57-shaped misses). Off unless
                // Memory.features.claimRemotes is explicitly true.
                if(Memory.features && Memory.features.claimRemotes && Memory.CanClaimRemote >= 3 && Game.rooms[targetRoomName] && Game.rooms[targetRoomName].controller && !Game.rooms[targetRoomName].controller.my && (Game.rooms[targetRoomName].controller.reservation && Game.rooms[targetRoomName].controller.reservation.ticksToEnd <= 750 || !Game.rooms[targetRoomName].controller.reservation)) {
                    if(room.memory.danger) {
                        return;
                    }
                    room.memory.spawn_list.push([CLAIM,MOVE], newName,
                        {memory: {role: 'reserve', targetRoom: targetRoomName, homeRoom: room.name, claim: true}});
                    console.log('Adding Reserver to Spawn List: ' + newName);
                    markSpawned();
                    Memory.CanClaimRemote -= 1;
                    return;
                }

                if(!gate.ok) {
                    return;
                }
                if(remoteIsHot(room, targetRoomName)) {
                    return;
                }
                if(targetRoomName == room.name) {
                    return;
                }

                // rsvEnd / rsvUser were stamped by the pre-pass at the top of
                // spawn_reserver, before `covered` or the >=2 bail could skip us.
                const vis = Game.rooms[targetRoomName];

                {   // sizing + the two decision paths (seen / blind) share these
                    // TIMING. Spawn shortly BEFORE the reservation lapses, not
                    // after. The old rungs keyed off `lastSpawnReserver` with
                    // CREEP_LIFE_TIME/2 == 750, but a CLAIM creep lives
                    // CREEP_CLAIM_LIFE_TIME == 600 — the re-spawn interval was
                    // LONGER than the creep's life, guaranteeing a coverage gap
                    // every single cycle on top of the walk out.
                    //
                    // Lead time = walk + spawn + slack. The replacement should
                    // arrive while the old reservation still has ticks on it.
                    //
                    // SPAWN TIME WAS MISSING. `lead` was walk + 40 flat, but a
                    // reserver is 3 ticks per part and it is a BIG body at high
                    // RCL — 14 parts / 42 ticks at RCL7, 16 / 48 at RCL8 — so the
                    // request went in later than the creep takes to build and the
                    // reservation lapsed while it was still in the spawn. Price
                    // the real thing: walk + reserverPairs*2*CREEP_SPAWN_TIME + 50.
                    // The 120-tick cap on `walk` truncated long remotes for the
                    // same reason; 200 still keeps a bogus pathLength from making
                    // `ticksToEnd <= lead` permanently true.
                    //
                    // PRICE IT AT THE SAME BUDGET THE CLAMP USES.
                    //
                    // The per-RCL rung below is a wish, not a price. At RCL4 it
                    // asks for 2 pairs == 1,300 energy against a capacity of
                    // exactly 1,300, and a body priced at 100% of capacity is
                    // buyable only in a room whose extensions are completely
                    // full — which a room that is spending on creeps never is.
                    // Queued at the HEAD (see queueRemoteHaul) that is a
                    // permanent head-of-line stall, and every relief mechanism
                    // declines it: the shredder exempts Reserver, shrinkQueuedBody
                    // refuses to go under 2 CLAIM (1 CLAIM is net-zero against
                    // reservation decay), and clampSpawnListToCapacity's 85%
                    // routine budget can neither shrink nor drop it. At RCL6 the
                    // 3-pair 1,950 body was silently clamped back to 2 anyway, so
                    // the rung was already lying about that level.
                    //
                    // So derive the pairs from the SAME 85% budget the clamp
                    // applies, and the body the room queues is the body the clamp
                    // would have left it with.
                    const rungPairs = room.controller.level <= 4 ? 2
                        : room.controller.level == 5 ? 2
                        : room.controller.level == 6 ? 3
                        : room.controller.level == 7 ? 7 : 8;
                    const budgetPairs = Math.floor(room.energyCapacityAvailable * 0.85 /
                        (BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]));
                    // RCL4-shaped rooms: floor(1105/650) == 1, and one CLAIM part
                    // is worth nothing (see reserverGate). Rather than refuse to
                    // reserve at all — RCL4 is where remotes are worth the most —
                    // keep the 2-pair body but give up the head slot for it: it
                    // goes to the TAIL, which is the pre-change behaviour, so it
                    // spawns on the ticks the room happens to be topped up and
                    // wedges nothing on the ticks it is not.
                    const pairsFitBudget = Math.min(rungPairs, budgetPairs) >= 2;
                    const reserverPairs = pairsFitBudget ? Math.min(rungPairs, budgetPairs) : 2;
                    const reserverCost = reserverPairs * (BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]);
                    const walk = Math.max(20, Math.min(200, (values.pathLength || 50)));
                    const lead = walk + reserverPairs * 2 * CREEP_SPAWN_TIME + 50;

                    // Both decision paths below end here. Split out of the old
                    // single `if` so the blind path cannot drift away from the
                    // affordability/danger gates the seen path is held to.
                    const requestReserver = function(why: string) {

                        /*
                         * AFFORDABILITY, NOT A BANK MULTIPLE.
                         *
                         * This started life as a flat `storage < 25000` and was
                         * then "fixed" into `max(2000, reserverCost * 3)` — still
                         * a multiple, and still a deadlock. At RCL6 that is 5,850
                         * banked energy demanded before a 1,950 creep may be
                         * built, and the loop is self-sealing: an unreserved
                         * remote yields 5 e/t instead of 10, remoteCarrierDemand
                         * sizes its carriers for 5 for their whole 1500-tick life,
                         * so the bank never climbs to the floor and the reserver
                         * that would double the yield never comes. Live E37N59
                         * (RCL6, storage 27k) only just clears it; every room
                         * below that never does, which is most of the empire.
                         *
                         * The honest question is "can this room buy the creep",
                         * and it has exactly two parts: the extension network is
                         * big enough for the body at all, and — if there is a real
                         * storage — the bank covers ONE body's worth. No cushion:
                         * a reserved remote pays its 1,950 back in ~390 ticks of
                         * the extra 5 e/t, against a 600-tick creep. A room at 0
                         * still cannot spawn one (nothing here is force-spawned),
                         * and the head-of-line relief in spawnFirstInLine means a
                         * queued Reserver cannot hold the spawn hostage while it
                         * waits for the energy.
                         *
                         * `room.storage` and not the Structures cache on purpose:
                         * the cache can point at a hub CONTAINER, which caps at
                         * 2000 and would re-introduce the deadlock at RCL7/8.
                         */
                        if(room.memory.danger) {
                            return;
                        }
                        if(room.energyCapacityAvailable < reserverCost) {
                            return;
                        }
                        // ...and the bank is ONE bank, spent once. `reservedThisPass`
                        // is what earlier remotes in this same pass have already
                        // committed it to; without it three remotes each read the
                        // same untouched storage figure and all three pass a test
                        // only one of them can actually be paid for.
                        if(room.storage &&
                           (room.storage.store[RESOURCE_ENERGY] - reservedThisPass) < reserverCost) {
                            return;
                        }

                        // >=2 CLAIM or nothing: 1 CLAIM is net-zero against the
                        // 1/tick reservation decay (see reserverGate). The five
                        // hand-written per-RCL bodies this replaces were exactly
                        // [CLAIM,MOVE] x reserverPairs — and reserverCost, which
                        // the gate above prices off, was already derived from
                        // reserverPairs, so keeping both was a standing invitation
                        // for the gate and the body to drift apart.
                        const reserverBody = [];
                        for(let p = 0; p < reserverPairs; p++) reserverBody.push(CLAIM, MOVE);
                        const reserverOpts = {memory: {role: 'reserve',
                            targetRoom: targetRoomName, homeRoom: room.name}};
                        // HEAD, not tail — ONCE. A reserver queued behind a pass
                        // worth of Builders/Upgraders reaches the spawn after the
                        // reservation it was sized to renew has already lapsed —
                        // and gets trimmed off the tail at MAX_SPAWN_QUEUE first.
                        // But the head is a single slot: only the first reserver
                        // of this pass takes it, and a body the 85% budget cannot
                        // cover (the 2-pair RCL4 fallback) never takes it at all,
                        // because it is exactly the body that would sit there
                        // unbuyable.
                        const atHead = pairsFitBudget && !headUsed;
                        if(atHead) {
                            queueRemoteHaul(room, reserverBody, newName, reserverOpts);
                            headUsed = true;
                        }
                        else {
                            room.memory.spawn_list.push(reserverBody, newName, reserverOpts);
                        }
                        reservedThisPass += reserverCost;
                        console.log('Adding Reserver to Spawn List: ' + newName +
                            ' -> ' + targetRoomName + ' (' + reserverPairs + ' CLAIM, ' +
                            reserverCost + 'e, lead ' + lead + ', ' +
                            (atHead ? 'head' : 'tail') + ', ' + why + ')');
                        markSpawned();
                    };

                    if(vis != undefined && vis.memory.roomData && !vis.memory.roomData.has_hostile_creeps
                       && vis.controller && !vis.controller.my) {
                        // SEEN. Unchanged behaviour: a fat reservation — ours or a
                        // rival's — makes needNow false and we leave it alone.
                        const rsv = vis.controller.reservation;
                        // `covered` already prevents a duplicate per room, so the
                        // stamp is only an anti-thrash guard for the spawn-failed case.
                        const notThrashing = Game.time - (values.lastSpawnReserver || 0) > 150;
                        const needNow = !rsv || rsv.ticksToEnd <= lead ||
                            (rsv.ticksToEnd < CONTROLLER_RESERVE_MAX - 600 && !anyReserverAlive(room, targetRoomName));
                        if(needNow && notThrashing) {
                            requestReserver('seen ' + (rsv ? rsv.ticksToEnd : 0));
                        }
                    }
                    else if(vis == undefined) {
                        /*
                         * BLIND. No Room object, so none of the tests above can
                         * run — and this is the common case, not the exotic one:
                         * a remote is only visible while a creep of ours stands
                         * in it. Renew off the last stamp instead, with every
                         * guard the seen path has plus replacements for the two
                         * that needed vision:
                         *
                         *   controller.my        -> `active`. manageRemotes closes
                         *                           a remote the moment it turns
                         *                           out to be owned, so an active
                         *                           entry is a not-ours entry.
                         *   has_hostile_creeps   -> remoteIsHot(), checked above,
                         *                           which is the flag scanRemoteThreats
                         *                           sets from real vision.
                         *   rival reservation    -> rsvUser from the last look.
                         *
                         * Duplicate suppression is NOT weakened here and this
                         * path deliberately does not fake rsvEnd forward: the
                         * `covered` map is built from live reservers AND from the
                         * queued-Reserver scan before the loop starts, and both
                         * are re-tested per room and per source, so a reserver
                         * that is alive or merely queued already makes this
                         * unreachable. Only a real, seen reservation ever writes
                         * rsvEnd.
                         *
                         * The anti-thrash window is a whole CLAIM lifetime rather
                         * than the seen path's 150: blind, we cannot tell whether
                         * the last one landed, so one gamble per creep-life is
                         * the most this is allowed to cost.
                         */
                        const stillActive = data.active === true;
                        const foreignHeld = !!data.rsvUser && (!myName || data.rsvUser !== myName);
                        const lapsing = !data.rsvEnd || (data.rsvEnd - Game.time) <= lead;
                        const notThrashing = Game.time - (values.lastSpawnReserver || 0) > CREEP_CLAIM_LIFE_TIME;
                        if(stillActive && !foreignHeld && lapsing && notThrashing
                           && !anyReserverAlive(room, targetRoomName)) {
                            requestReserver('blind, rsvEnd ' +
                                (data.rsvEnd ? (data.rsvEnd - Game.time) : 'never'));
                        }
                    }
                }
            });
        }
    });
}
function roomHasPlanSpawn(name: string): boolean {
    const mem: any = Memory.rooms && Memory.rooms[name];
    const t = mem && mem.planV2 && mem.planV2.t && mem.planV2.t.spawn;
    return !!(t && t.length);
}

function roomLooksSpawnlessOwned(name: string): boolean {
    const r = Game.rooms[name];
    if (r) {
        if (!r.controller || !r.controller.my) return false;
        if (r.find(FIND_MY_SPAWNS).length) return false;
        const foreign = r.find(FIND_STRUCTURES, {filter: (s: Structure) =>
            s.structureType === STRUCTURE_SPAWN && !(s as StructureSpawn).my}).length > 0;
        // Remember the verdict. Vision here is a creep standing in the room, and
        // the moment it dies we fall through to the memory branch below — which
        // had no foreign-spawn test at all, so a room that was just rejected on
        // sight became eligible again as soon as we stopped looking at it. Live
        // E39N58 (RCL1, our controller, a leftover foreign spawn) was exactly
        // that: it kept a 1,600-energy ContainerBuilder at the HEAD of E37N59's
        // spawn queue for a room that can never finish a spawn while that
        // structure stands.
        const mem0: any = Memory.rooms && Memory.rooms[name];
        if (mem0) {
            if (foreign) mem0.foreignSpawn = Game.time;
            else if (mem0.foreignSpawn) delete mem0.foreignSpawn;
        }
        if (foreign) return false;
        // FORCE-migrate can delete the only spawn before the plan site exists
        // (same tick). Still send CBs — they (and placeFromPlanV2) site it.
        if (roomHasPlanSpawn(name)) return true;
        return r.find(FIND_MY_CONSTRUCTION_SITES, {filter: (s: ConstructionSite) =>
            s.structureType === STRUCTURE_SPAWN}).length > 0;
    }
    // No vision: Memory from the last visit. W3N3 sat 0-creep / 0-vision
    // with a spawn site and an empty target_colonise.
    // Never trust target_colonise here — live parks that on leftover
    // foreign spawns (E35N59 Enrique). Plan tile ≠ our site.
    if (Memory.target_colonise && Memory.target_colonise.room === name) return false;
    const mem: any = Memory.rooms && Memory.rooms[name];
    if (!mem) return false;
    if (mem.Structures && mem.Structures.spawns && mem.Structures.spawns.length) return false;
    // Last thing we saw was somebody else's spawn standing in it. Only vision
    // clears this (above), so it cannot become a permanent trap.
    if (mem.foreignSpawn) return false;
    const spawnPlan = (mem.basePlan && mem.basePlan.spawn && mem.basePlan.spawn[0])
        || (mem.basePlan && mem.basePlan.structures && mem.basePlan.structures.spawn && mem.basePlan.structures.spawn[0])
        || (mem.planV2 && mem.planV2.t && mem.planV2.t.spawn && mem.planV2.t.spawn[0]);
    const mine = !!(mem.speedrun || mem.planV2 || mem.planPackMiss || mem.basePlan);
    return !!(mine && spawnPlan);
}

function spawnSiteProgress(name: string): number {
    const r = Game.rooms[name];
    if (!r) return 15000;
    const site = r.find(FIND_MY_CONSTRUCTION_SITES, {filter: (s: ConstructionSite) =>
        s.structureType === STRUCTURE_SPAWN})[0];
    return site ? site.progress : 15000;
}

function colonyBuilderCap(need: string): number {
    const r = Game.rooms[need];
    // Last 5k used to hit cap-1 first and skip this. E37N57 10k/15k DG 1207.
    if (r && r.controller && r.controller.my && r.controller.level === 1
        && r.controller.ticksToDowngrade < 3000) return 3;
    if (spawnSiteProgress(need) >= 10000) return 1;
    return 2;
}

function colonyBuildersOn(need: string): number {
    return _.filter(creepsWithRole('buildcontainer'), (c: any) => c.memory.targetRoom == need).length;
}

function spawnSiteUnfinishable(name: string): boolean {
    const r = Game.rooms[name];
    if (!r || !r.controller || !r.controller.my) return false;
    const site = r.find(FIND_MY_CONSTRUCTION_SITES, {filter: (s: ConstructionSite) =>
        s.structureType === STRUCTURE_SPAWN})[0];
    if (!site) return false;
    const left = (site.progressTotal || 15000) - (site.progress || 0);
    // 8W on-site ~40 e/t; commute ~20. Skip if DG cannot pay the site.
    return r.controller.ticksToDowngrade < left / 20;
}

function finishableSpawnSiteRooms(from: string): string[] {
    const hits: string[] = [];
    const seen: { [name: string]: boolean } = {};
    const consider = (name: string) => {
        if (seen[name] || !roomLooksSpawnlessOwned(name)) return;
        if (spawnSiteUnfinishable(name)) return;
        seen[name] = true;
        hits.push(name);
    };
    for (const name in Game.rooms) consider(name);
    if (Memory.rooms) for (const name in Memory.rooms) consider(name);
    hits.sort((a, b) =>
        Game.map.getRoomLinearDistance(from, a) - Game.map.getRoomLinearDistance(from, b));
    return hits;
}

function pickSpawnRescue(): string | null {
    const pinned = (Memory as any).spawnRescue;
    if (typeof pinned === "string" && roomLooksSpawnlessOwned(pinned)) return pinned;
    let best: string | null = null;
    let bestP = -1;
    const hits = finishableSpawnSiteRooms("E37N58");
    for (let i = 0; i < hits.length; i++) {
        const p = spawnSiteProgress(hits[i]);
        const score = p >= 15000 ? 0 : p;
        if (score > bestP) {
            bestP = score;
            best = hits[i];
        }
    }
    if (best) {
        (Memory as any).spawnRescue = best;
        (Memory as any)._spawnEmergency = true;
    }
    return best;
}

function empireMySpawnCount(): number {
    let n = 0;
    for (const rn in Game.rooms) {
        const rr = Game.rooms[rn];
        if (rr.controller && rr.controller.my) n += rr.find(FIND_MY_SPAWNS).length;
    }
    return n;
}

function revertSpawnEmergency(): void {
    if (finishableSpawnSiteRooms("E37N58").length) return;
    if (!(Memory as any).spawnRescue && !(Memory as any)._spawnEmergency) return;
    delete (Memory as any).spawnRescue;
    delete (Memory as any)._spawnEmergency;
    const tc: any = (Memory as any).target_colonise;
    if (tc && tc.room && !roomLooksSpawnlessOwned(tc.room)) (Memory as any).target_colonise = {};
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.memory || c.memory.role !== "buildcontainer") continue;
        const tgt = c.memory.targetRoom && Game.rooms[c.memory.targetRoom];
        if (tgt && tgt.find(FIND_MY_SPAWNS).length) {
            c.memory.role = "builder";
            delete (c.memory as any).fill;
        }
    }
    for (const rn in Game.rooms) {
        const r = Game.rooms[rn];
        if (!r.controller || !r.controller.my) continue;
        if ((r.memory as any).planMigratePaused) delete (r.memory as any).planMigratePaused;
        if ((r.memory as any).planMigration) (r.memory as any).planMigration.force = false;
    }
    logAlways("spawn rescue complete — all rooms have a spawn, emergency off");
}

function finishableSpawnSiteRoom(from: string): string | null {
    // One spawnless room at a time. Never split the last builders.
    const rescue = pickSpawnRescue();
    if (rescue) return rescue;
    const hits = finishableSpawnSiteRooms(from);
    if (!hits.length) return null;
    for (let i = 0; i < hits.length; i++) {
        if (colonyBuildersOn(hits[i]) === 0) return hits[i];
    }
    for (let i = 0; i < hits.length; i++) {
        if (colonyBuildersOn(hits[i]) < colonyBuilderCap(hits[i])) return hits[i];
    }
    return null;
}

/**
 * Drop any QUEUED ContainerBuilder whose target has stopped being finishable.
 *
 * The gate below is only consulted when a new one is queued. A ContainerBuilder
 * already sitting on the list is never re-examined, and it is `push`ed with a
 * 1,600-energy body — so once the target went bad (a rival dropped a spawn in
 * it, we lost the controller, the downgrade timer ran out of room to pay for
 * the site) it just sat there being the most expensive thing in the queue. Live
 * E37N59 had exactly one: a ContainerBuilder for E39N58, a spawnless RCL1 slot
 * holding somebody else's leftover spawn.
 */
function purgeDeadColonyBuilders(room: any): void {
    const q = room.memory.spawn_list;
    if (!q || !q.length) return;
    const drop: number[] = [];
    forEachQueued(room, function(body, name, opts, idx) {
        if (!opts || !opts.memory || opts.memory.role != 'buildcontainer') return true;
        const t = opts.memory.targetRoom;
        if (!t) return true;
        if (roomLooksSpawnlessOwned(t) && !spawnSiteUnfinishable(t)) return true;
        drop.push(idx);
        console.log('[colony] ' + room.name + ' dropping queued ' + name + ' — ' + t + ' is not finishable');
        return true;
    });
    // back to front so the earlier indices stay valid
    for (let i = drop.length - 1; i >= 0; i--) q.splice(drop[i], 3);
}

function retaskBuildersToSpawnless(need: string): void {
    let empireSpawns = 0;
    for (const rn in Game.rooms) {
        const rr = Game.rooms[rn];
        if (rr.controller && rr.controller.my) empireSpawns += rr.find(FIND_MY_SPAWNS).length;
    }
    const cap = empireSpawns === 0 ? 99 : 2;
    let onIt = colonyBuildersOn(need);
    if (onIt >= cap) return;
    for (const name in Game.creeps) {
        if (onIt >= cap) return;
        const c = Game.creeps[name];
        if (!c.memory) continue;
        if (c.memory.role === "buildcontainer" && c.memory.targetRoom === need) continue;
        const role = c.memory.role;
        if (role !== "builder" && role !== "repair" && role !== "maintainer" && role !== "RampartErector") continue;
        if (empireSpawns > 0) {
            const homeName = c.memory.homeRoom || c.room.name;
            if (homeName === need) continue;
            const home = Game.rooms[homeName];
            if (!home || !home.find(FIND_MY_SPAWNS).length) continue;
        }
        c.memory.role = "buildcontainer";
        c.memory.targetRoom = need;
        (c.memory as any).fill = c.store.getFreeCapacity() > 0;
        onIt++;
        console.log("[colony] retask " + c.name + " -> " + need);
    }
}

function maybeSpawnColonyBuilder(room: Room): void {
    const pinned = (Memory as any).spawnRescue;
    if (typeof pinned === "string") {
        const pr = Game.rooms[pinned];
        if (pr && pr.find(FIND_MY_SPAWNS).length) {
            delete (Memory as any).spawnRescue;
            logAlways("spawn rescue " + pinned + " complete — picking next");
        }
    }
    revertSpawnEmergency();
    if (!room.controller || !room.controller.my || room.controller.level < 3) return;
    purgeDeadColonyBuilders(room);
    if (room.memory.danger) return;
    const storage: any = Game.getObjectById(room.memory.Structures && room.memory.Structures.storage);
    const bank = storage && storage.store ? (storage.store[RESOURCE_ENERGY] || 0) : 0;
    const need = finishableSpawnSiteRoom(room.name);
    if (need) retaskBuildersToSpawnless(need);
    // Spawn-rebuild is an emergency (FORCE-migrate just deleted the only
    // spawn). The 10k / bucket-7750 gates are for optional new colonies.
    const rescue = !!(need && Game.rooms[need] && Game.rooms[need].find(FIND_MY_SPAWNS).length === 0);
    if (!rescue) {
        if (!storage || bank <= 10000) return;
        if (Game.cpu.bucket <= 7750) return;
    } else if (bank < 2000 && room.energyAvailable < 550) {
        return;
    }
    if (!need) return;
    const dist = Game.map.getRoomLinearDistance(room.name, need);
    if (dist > 7) return;
    // Only the closest funded mother queues.
    let best: string = room.name;
    let bestDist = dist;
    let bestE = storage.store[RESOURCE_ENERGY] || 0;
    for (const name in Game.rooms) {
        const r = Game.rooms[name];
        if (!r.controller || !r.controller.my || r.controller.level < 3) continue;
        if (r.memory.danger) continue;
        const st: any = Game.getObjectById(r.memory.Structures && r.memory.Structures.storage);
        const e = st && st.store ? (st.store[RESOURCE_ENERGY] || 0) : 0;
        if (e <= 10000) continue;
        const d = Game.map.getRoomLinearDistance(name, need);
        if (d > 7) continue;
        if (d < bestDist || (d === bestDist && e > bestE)) {
            best = name;
            bestDist = d;
            bestE = e;
        }
    }
    if (best !== room.name) return;
    if (colonyBuildersOn(need) >= colonyBuilderCap(need)) return;
    let alreadyQueued = false;
    forEachQueued(room, function(body, name, opts) {
        if(opts && opts.memory && opts.memory.role == 'buildcontainer' && opts.memory.targetRoom == need) {
            alreadyQueued = true;
            return false;
        }
        return true;
    });
    if (alreadyQueued) return;
    /*
     * AFFORDABLE NOW, not affordable in principle.
     *
     * getBody() sizes off energyCapacityAvailable, so at RCL6 this is an
     * [8W,8C,8M] costing 1,600 — and it is pushed onto a queue whose head blocks
     * everything behind it until it can be paid for. A room whose extensions are
     * being drained by its own fill loop then has the single most expensive
     * creep in the empire parked at the front of the line for a room three
     * jumps away. Require the room to be able to pay for it more or less now
     * (one filler load of slack); the producer re-runs on its own cadence.
     */
    const parts = rescue ? 12 : 24;
    const cbBody = getBody([WORK, CARRY, MOVE], room, parts);
    if (!cbBody.length) return;
    const cbCost = _.sum(cbBody, (p: any) => BODYPART_COST[p]);
    if (room.energyAvailable + (rescue ? 0 : 300) < cbCost) return;
    const newName = 'ContainerBuilder-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
    const opts = {memory: {role: 'buildcontainer', targetRoom: need, homeRoom: room.name, fill: true}};
    if (rescue) room.memory.spawn_list.unshift(cbBody, newName, opts);
    else room.memory.spawn_list.push(cbBody, newName, opts);
    console.log('Adding ContainerBuilder to Spawn List: ' + newName + (rescue ? ' (SPAWN RESCUE)' : ''));
}

export {getBody};
export default spawning;
