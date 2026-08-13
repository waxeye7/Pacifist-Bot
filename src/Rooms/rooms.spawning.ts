import construction from "./rooms.construction";
import { remoteIsHot, markRemoteHot } from "./rooms.remotes";
import { remotesDisabled } from "utils/Speedrun";
function spawning(room: any) {
    if(Game.cpu.bucket < 1000) return;

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

    // Remotes-off A/B: drop already-queued remote miners/carriers/reservists
    // so the flag stops spawn this tick, not after leftover queue hatches.
    if(remotesDisabled() && room.memory.spawn_list.length) {
        const q = room.memory.spawn_list;
        const next = [];
        for(let i = 0; i + 2 < q.length; i += 3) {
            const mem = q[i + 2] && q[i + 2].memory;
            const role = mem && mem.role;
            const tgt = mem && mem.targetRoom;
            if(tgt && tgt !== room.name && (role === "EnergyMiner" || role === "carry" || role === "reserve")) {
                continue;
            }
            next.push(q[i], q[i + 1], q[i + 2]);
        }
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
                        let myRooms = _.filter(Game.rooms, (r) => r.controller && r.controller.my && r.controller.level === 8);
                        // find closest room
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

    let status = spawnFirstInLine(room, spawn);
    if(status == "spawning") {
        return;
    }

    if(room.memory.spawn_list.length == 0 && Game.time - room.memory.lastTimeSpawnUsed == 2 ||
        !room.memory.danger && room.memory.spawn_list.length == 0 && (Game.time - room.memory.lastTimeSpawnUsed) % 35 == 0 && room.controller.level >= 6 ||
        !room.memory.danger && room.memory.spawn_list.length == 0 && (Game.time - room.memory.lastTimeSpawnUsed) % 20 == 0 && room.controller.level <= 5 ||
        !room.memory.danger && room.memory.spawn_list.length >= 1 && (Game.time - room.memory.lastTimeSpawnUsed) % 500 == 0 ||
        room.memory.danger && (Game.time - room.memory.lastTimeSpawnUsed) % 7 == 0 && room.memory.spawn_list.length == 0) {

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
            if(sourceId && !_.some(Game.creeps, (creep:any) => creep.memory.sourceId == sourceId
                && (creep.memory.role == wantedRole
                    || (wantedRole == 'carry' && creep.memory.role == 'FakeFiller')))) {
                budget = Math.min(budget, Math.max(payable, SPAWN_ENERGY_CAPACITY));
            }
        }
        let cost = bodyCost(body);
        if(cost <= budget) continue;

        let originalLength = body.length;
        let originalCost = cost;
        let shrunk = body.slice();
        while(cost > budget && shrinkQueuedBody(shrunk, name)) {
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
function shrinkQueuedBody(body:string[], name:string):boolean {
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
        if(body.length <= 3) return false;
        if((counts[CARRY] || 0) > 1) counts[CARRY] --;
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


function add_creeps_to_spawn_list(room, spawn) {
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

    let Dismantlers = 0;
    let scouts = 0;

    let claimers = 0;
    let RemoteDismantlers = 0;

    let attackers = 0;
    let RangedAttackers = 0;

    let containerbuilders = 0;

    let DrainTowers = 0;
    let healers = 0;

    let sweepers = 0;

    let annoyers = 0;

    let clearers = 0;

    let billtongs = 0;

    let rams = 0;
    let signifers = 0;

    let RampartDefenders = 0;
    let RangedRampartDefenders = 0;

    let goblins = 0;

    let Signers = 0;
    let Priests = 0;

    let SpecialRepairers = 0;
    let SpecialCarriers = 0;

    let CreepA = 0;
    let CreepB = 0;
    let CreepY = 0;
    let CreepZ = 0;

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

            case "EnergyManager":
                if(isInRoom(creep, room)) {
                    EnergyManagers ++;
                    break;
                }

            case "MineralMiner":
                if(isInRoom(creep, room)) {
                    MineralMiners ++;
                    break;
                }

            case "builder":
                if(isInRoom(creep, room)) {
                    builders ++;
                    break;
                }

            case "upgrader":
                if(isInRoom(creep, room)) {
                    upgraders ++;
                    break;
                }

            case "filler":
                if(isInRoom(creep, room)) {
                    fillers ++;
                    break;
                }

            case "repair":
                if(isInRoom(creep, room)) {
                    repairers ++;
                    break;
                }

            case "maintainer":
                if(isInRoom(creep, room)) {
                    maintainers ++;
                    break;
                }

            case "defender":
                if(isInRoom(creep, room)) {
                    defenders ++;
                    break;
                }

            case "RampartDefender":
                if(isInRoom(creep, room)) {
                    RampartDefenders ++;
                    break;
                }

            case "RRD":
                if(isInRoom(creep, room)) {
                    RangedRampartDefenders ++;
                    break;
                }


            case "Dismantler":
                if(isInRoom(creep, room)) {
                    Dismantlers ++;
                    break;
                }

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

            case "RampartErector":
                if(isInRoom(creep, room)) {
                    RampartErectors ++;
                }

            case "SneakyControllerUpgrader":
                SneakyControllerUpgraders ++;
                break;

            case "DrainTower":
                DrainTowers ++;
                break;

            case "healer":
                healers ++;
                break;

            case "RemoteDismantler":
                RemoteDismantlers ++;
                break;

            case "annoy":
                annoyers ++;
                break;

            case "clearer":
                clearers ++;
                break;

            case "ram":
                if(creep.memory.homeRoom == room.name) {
                    rams ++;
                }
                break;

            case "signifer":
                if(creep.memory.homeRoom == room.name) {
                    signifers ++;
                }
                break;

            case "sweeper":
                if(isInRoom(creep, room)) {
                    sweepers ++;
                    break;
                }

            case "goblin":
                if(creep.memory.homeRoom == room.name) {
                    goblins ++;
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
                    break;
                }

            case "SpecialCarry":
                if(isInRoom(creep, room)) {
                    SpecialCarriers ++;
                    break;
                }

            case "SquadCreepA":
                if(isInRoom(creep, room)) {
                    CreepA ++;
                    break;
                }
            case "SquadCreepB":
                if(isInRoom(creep, room)) {
                    CreepB ++;
                    break;
                }
                break;
            case "SquadCreepY":
                if(isInRoom(creep, room)) {
                    CreepY ++;
                    break;
                }
            case "SquadCreepZ":
                if(isInRoom(creep, room)) {
                    CreepZ ++;
                    break;
                }
            case "SafeModer":
                if(isInRoom(creep, room)) {
                    SafeModers ++;
                    break;
                }
        }

    });


    console.log("Room-" + room.name + " has " + builders + " Builders " + upgraders +
    " Upgraders " + repairers + " Repairers " + fillers
    + " Filler", EnergyManagers, "EnergyManager", sweepers, "Sweeper");
    console.log("[" + EnergyMiners + " Energy-Miners]" + " [" + carriers +
    " Carriers] [" +  RemoteRepairers, "RemoteRepairers] [" + reservers + " Reservers] " + "[" + attackers + " Attackers]" + " [" + RangedAttackers +  " RangedAttackers]" + " [" + containerbuilders +  " Container Builders]" + " [" + claimers +  " Claimers]");
    // console.log(DrainTowers, "tower drainers ;)")


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




    const spawnrules = {

        1: {

            upgrade_creep: {

                amount: 1,
                body:   getBody([WORK,CARRY,CARRY,MOVE], room),

            },

            build_creep: {

                amount: 6,
                body:   [WORK,CARRY,CARRY,CARRY,MOVE],

            },

            filler_creep: {

                amount: 1,
                body:   [CARRY,MOVE],

            },

        },

        2: {

            upgrade_creep: {

                amount: 4,
                // No controller depot until RCL3. [4W,C,M] is 3 ticks/tile
                // (5 non-MOVE / 1 MOVE) and a 50-energy tank — ~0.5 e/t
                // delivered on a 15-tile shuttle, not 4. [2W,2C,2M] walks
                // and holds 100, ~1 e/t each.
                body:   shuttleUpgraderBody(room),

            },

            build_creep: {

                amount: 4,
                body:   getBody([WORK,CARRY,CARRY,CARRY,MOVE], room, 50),

            },

            repair_creep: {

                amount: 1,
                body:   [WORK,CARRY,MOVE],

            },

            filler_creep: {

                amount: 1,
                body:   [CARRY,MOVE],

            },



        },

        3: {
            build_creep: {

                amount: 6,
                body:   getBody([WORK,CARRY,CARRY,CARRY,MOVE], room, 50),

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
                body:   getBody([WORK,CARRY,MOVE], room, 50),

            },
            maintain_creep: {

                amount: 1,
                body:[WORK,WORK,WORK,WORK,
                    MOVE,MOVE,
                    CARRY,CARRY,CARRY,CARRY],

            },

        },

        4: {
            build_creep: {

                amount: 3,
                body:   getBody([WORK,CARRY,CARRY,CARRY,MOVE], room, 50),

            },
            upgrade_creep: {

                amount: 5,
                body:   getBody([WORK,WORK,WORK,WORK,CARRY,MOVE], room, 50),

            },

            filler_creep: {

                amount: 2,
                body:   [CARRY,CARRY,CARRY,CARRY,MOVE,MOVE],

            },
            repair_creep: {

                amount: 1,
                body:   getBody([WORK,CARRY,MOVE], room, 50),

            },
            maintain_creep: {

                amount: 1,
                body:[WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY],

            },
        },

        5: {
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

        },

        6: {
            build_creep: {

                amount: 3,
                body:   getBody([WORK,WORK,CARRY,CARRY,MOVE], room, 50),

            },
            upgrade_creep: {

                amount: 1,
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
        },

        7: {
            build_creep: {

                amount: 2,
                body:   getBody([WORK,WORK,CARRY,CARRY,MOVE], room, 50),

            },
            upgrade_creep: {

                amount: 1,
                body:   [WORK,WORK,WORK,WORK,CARRY,CARRY,MOVE],

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
        },

        8: {
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
        }

    };

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
    // Home room always counts. Remotes open at RCL4 (storage + the 135k climb
    // is done). Reservers are RCL5+; an RCL3 remote is unreserved 5 e/t.
    // Memory.speedrun.disableRemotes is the explicit campaign off-switch.
    const remotesAllowed =
        room.controller &&
        room.controller.level >= 4 &&
        !remotesDisabled();
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
    let constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES)
    let constructionSitesAmount = constructionSites.length;
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
            queueEarlyFiller(room, storage, fillers, spawnrules[1].filler_creep.amount, spawnrules[1].filler_creep.body, activeRemotes.length);
            spawn_energy_miner(resourceData, room, activeRemotes);
            spawn_carrier(resourceData, room, spawn, storage, activeRemotes);
            if(EnergyMiners < 1) {
                break;
            }
            if(sites.length > 0 && EnergyMinersInRoom >= 1 && builders < earlyBuildSlots(sites, spawnrules[1].build_creep.amount)) {
                let name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[1].build_creep.body, name, {memory: {role: 'builder'}});
                console.log('Adding Builder to Spawn List: ' + name);
            }
            if(upgraders < spawnrules[1].upgrade_creep.amount && !room.memory.danger) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[1].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }
            else if(upgraders < spawnrules[1].upgrade_creep.amount + 6 && storage && storage.store.getFreeCapacity() < 200 && !room.memory.danger) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[1].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }
            break;

        case 2:
            queueEarlyFiller(room, storage, fillers, spawnrules[2].filler_creep.amount, spawnrules[2].filler_creep.body, activeRemotes.length);
            spawn_energy_miner(resourceData, room, activeRemotes);
            spawn_carrier(resourceData, room, spawn, storage, activeRemotes);
            if(repairers < spawnrules[2].repair_creep.amount && EnergyMinersInRoom >= 1 && !room.memory.danger && room.controller.progress > 4500) {
                let name = 'Repair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[2].repair_creep.body, name, {memory: {role: 'repair', homeRoom: room.name}});
                console.log('Adding Repair to Spawn List: ' + name);
            }
            if(sites.length > 0 && EnergyMinersInRoom >= 1 && builders < earlyBuildSlots(sites, spawnrules[2].build_creep.amount)) {
                let name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[2].build_creep.body, name, {memory: {role: 'builder'}});
                console.log('Adding Builder to Spawn List: ' + name);
            }
            if(upgraders < spawnrules[2].upgrade_creep.amount + pressure.burn && !room.memory.danger && (sitesMayNotVetoUpgraders || room.controller.ticksToDowngrade < 1500)) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[2].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }
            else if(upgraders < spawnrules[2].upgrade_creep.amount + 6 && storage && storage.store.getFreeCapacity() < 200 && !room.memory.danger) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[2].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }
            break;

        case 3:
            queueEarlyFiller(room, storage, fillers, spawnrules[3].filler_creep.amount, spawnrules[3].filler_creep.body, activeRemotes.length);
            spawn_energy_miner(resourceData, room, activeRemotes);
            spawn_carrier(resourceData, room, spawn, storage, activeRemotes);
            if(repairers < spawnrules[3].repair_creep.amount && EnergyMinersInRoom >= 1 && !room.memory.danger) {
                let name = 'Repair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[3].repair_creep.body, name, {memory: {role: 'repair', homeRoom: room.name}});
                console.log('Adding Repair to Spawn List: ' + name);
            }
            // Pavement after the 135k sink: ext/tower/container still beat
            // upgraders, but a road-only queue must not HOL-block them.
            const rcl3BuildWant = earlyBuildSlots(sites, spawnrules[3].build_creep.amount);
            const rcl3RoadsOnly = onlyRoadSites(sites);
            if(!rcl3RoadsOnly && sites.length > 0 && EnergyMinersInRoom >= 1 && builders < rcl3BuildWant) {
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
            else if(upgraders < spawnrules[3].upgrade_creep.amount + 6 && storage && storage.store.getFreeCapacity() < 200 && !room.memory.danger) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[3].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }
            if(rcl3RoadsOnly && EnergyMinersInRoom >= 1 && builders < rcl3BuildWant) {
                let name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[3].build_creep.body, name, {memory: {role: 'builder'}});
                console.log('Adding Builder to Spawn List: ' + name);
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
            if((repairers < spawnrules[4].repair_creep.amount + 6 && room.energyAvailable > room.energyCapacityAvailable / 1.3 || room.memory.danger && repairers < spawnrules[4].repair_creep.amount + 10) && storage && (storage.store[RESOURCE_ENERGY] > 50000 && repairers < spawnrules[4].repair_creep.amount + 1 || Game.time % 2000 < 400 && storage.store[RESOURCE_ENERGY] > 20000 && repairers < spawnrules[4].repair_creep.amount ||  (storage.store[RESOURCE_ENERGY] > 15000 || room.memory.danger && storage.store[RESOURCE_ENERGY] > 5000) && (rampartsInRoom.filter(function(s) {return s.hits < 60000}).length || room.memory.danger_timer > 50))) {
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
            if(builders < spawnrules[4].build_creep.amount && sites.length > 0 && (EnergyMinersInRoom > 0 || bankCanBuild) && (!storage || storage.structureType !== STRUCTURE_STORAGE || storage.store[RESOURCE_ENERGY] > 15000)) {
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
            if(maintainers < spawnrules[4].maintain_creep.amount && !room.memory.danger && (room.memory.keepTheseRoads && room.memory.keepTheseRoads.length > 0 || spawnMaintainer)) {
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
            if(repairers < spawnrules[5].repair_creep.amount + 2 && storage && (storage.store[RESOURCE_ENERGY] > 50000 && repairers < spawnrules[5].repair_creep.amount + 1 || Game.time % 2000 < 400 && storage.store[RESOURCE_ENERGY] > 50000 && repairers < spawnrules[5].repair_creep.amount ||  storage.store[RESOURCE_ENERGY] > 10000 && (rampartsInRoom.filter(function(s) {return s.hits < 75000}).length || room.memory.danger_timer > 50))) {
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
            if(upgraders < upgraderTarget(room, spawnrules[5].upgrade_creep.amount, surplusUpgraders, pressure.burn, EnergyMinersInRoom) && !room.memory.danger
                || room.controller.ticksToDowngrade < 6000 && upgraders < spawnrules[5].upgrade_creep.amount && !room.memory.danger
                || upgraders < 1 && room.controller.ticksToDowngrade < CONTROLLER_DOWNGRADE[room.controller.level] / 2 && !room.memory.danger) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[5].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name + ' (bank ' + bankEnergy(room) + ', floor ' + pressure.onFloor + ')');
            }
            if(maintainers < spawnrules[5].maintain_creep.amount && (room.memory.keepTheseRoads && room.memory.keepTheseRoads.length > 0 || spawnMaintainer)) {
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
            let rampartsInRoomBelow3Mil = rampartsInRoom?.filter(function(s) {return s.hits < 3050000;});
            if(repairers < spawnrules[6].repair_creep.amount && storage && (storage.store[RESOURCE_ENERGY] > 150000 && rampartsInRoomBelow3Mil.length > 0 || Game.time % 3000 < 100 && storage.store[RESOURCE_ENERGY] > 50000 || room.memory.danger && storage.store[RESOURCE_ENERGY] > 50000)) {
                let name = 'Repair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[6].repair_creep.body, name, {memory: {role: 'repair', homeRoom: room.name}});
                console.log('Adding Repair to Spawn List: ' + name);
            }
            // Was 120k, then 8k — both floors soft-bricked a poor RCL6 room. See queueBuilder().
            queueBuilder(room, spawnrules[6], sites, builders, EnergyMinersInRoom, bankCanBuild, storage, 8000);
            if(upgraders < spawnrules[6].upgrade_creep.amount + 3 && !room.memory.danger && storage && storage.store[RESOURCE_ENERGY] > 400000 || room.controller.ticksToDowngrade < 80000 && upgraders < spawnrules[6].upgrade_creep.amount) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[6].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }
            // Surplus tier: >120k banked at RCL6. The gate above waits for
            // 400k, so everything between the two just piled up.
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


            if(maintainers < spawnrules[6].maintain_creep.amount && (room.memory.keepTheseRoads && room.memory.keepTheseRoads.length > 0 || spawnMaintainer)) {
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
                room.memory.spawn_list.unshift(spawnrules[7].energy_manager_creep.body, name, {memory: {role: 'EnergyManager'}});
                console.log('Adding Energy Manager to Spawn List: ' + name);
            }
            if((fillers < spawnrules[7].filler_creep.amount || fillers < spawnrules[7].filler_creep.amount + 1 && activeRemotes.length > 2 || fillers < spawnrules[7].filler_creep.amount + 2 && activeRemotes.length > 3) && storage) {
                let name = 'Filler-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.unshift(spawnrules[7].filler_creep.body, name, {memory: {role: 'filler'}});
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
            if(repairers < spawnrules[7].repair_creep.amount && storage && (storage.store[RESOURCE_ENERGY] > 500000 || Game.time % 3000 < 100 && storage.store[RESOURCE_ENERGY] > 50000 || room.memory.danger && storage.store[RESOURCE_ENERGY] > 50000)) {
                let rampartsInRoomBelow5Mil = rampartsInRoom?.filter(function(s) {return s.hits < 4050000;});
                if(rampartsInRoomBelow5Mil.length > 0) {
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
            else if(upgraders < spawnrules[7].upgrade_creep.amount && room.controller.ticksToDowngrade < 110000 && storage && storage.store[RESOURCE_ENERGY] > 10000 && (!room.memory.danger || room.controller.ticksToDowngrade < 80000)) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[7].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
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


            if(maintainers < spawnrules[7].maintain_creep.amount && (room.memory.keepTheseRoads && room.memory.keepTheseRoads.length > 0 || spawnMaintainer)) {
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
                if(room.energyAvailable < room.energyCapacityAvailable * 0.5 && room.energyAvailable <= 300) {
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
                room.memory.spawn_list.unshift(spawnrules[8].filler_creep.body, name, {memory: {role: 'filler'}});
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
            if(Game.cpu.bucket >= 5000 && (repairers < spawnrules[8].repair_creep.amount || room.controller.safeMode > 0 && repairers < spawnrules[8].repair_creep.amount + 2) && storage && (storage.store[RESOURCE_ENERGY] > 280000 || Game.time % 3000 < 100 && storage.store[RESOURCE_ENERGY] > 150000)) {
                let rampartsInRoomBelow10Mil = rampartsInRoom.filter(function(s) {return s.hits < 15255000 && (room.name !== "E41N58" || s.pos.getRangeTo(storage) > 15 || s.pos.getRangeTo(storage) < 10);});
                if(rampartsInRoomBelow10Mil.length > 0) {
                    if(storage && !room.memory.labs.lab8reserved && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] > 3150 && storage.store[RESOURCE_CATALYZED_KEANIUM_ACID] > 1000 && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] >= 1500 &&  room.memory.labs && room.memory.labs.outputLab1 && room.memory.labs.outputLab2 && room.memory.labs.outputLab8) {
                        spawnrules[8].repair_creep.body = [
                            WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE
                        ]
                        if(room.memory.labs && room.memory.labs.status && !room.memory.labs.status.boost) {
                            room.memory.labs.status.boost = {};
                        }
                        if(room.memory.labs.status.boost) {
                            if(room.memory.labs.status.boost.lab1) {
                                room.memory.labs.status.boost.lab1.amount += 1050;
                                room.memory.labs.status.boost.lab1.use += 1;
                            }
                            else {
                                room.memory.labs.status.boost.lab1 = {};
                                room.memory.labs.status.boost.lab1.amount = 1050;
                                room.memory.labs.status.boost.lab1.use = 1;
                            }
                            if(room.memory.labs.status.boost.lab2) {
                                room.memory.labs.status.boost.lab2.amount += 300;
                                room.memory.labs.status.boost.lab2.use += 1;
                            }
                            else {
                                room.memory.labs.status.boost.lab2 = {};
                                room.memory.labs.status.boost.lab2.amount = 300;
                                room.memory.labs.status.boost.lab2.use = 1;
                            }
                            if(room.memory.labs.status.boost.lab8) {
                                room.memory.labs.status.boost.lab8.amount += 150;
                                room.memory.labs.status.boost.lab8.use += 1;
                            }
                            else {
                                room.memory.labs.status.boost.lab8 = {};
                                room.memory.labs.status.boost.lab8.amount = 150;
                                room.memory.labs.status.boost.lab8.use = 1;
                            }
                        }
                        let name = 'Repair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                        room.memory.spawn_list.push(spawnrules[8].repair_creep.body, name, {memory: {role: 'repair', homeRoom: room.name, boosted:true, boostlabs:[room.memory.labs.outputLab1,room.memory.labs.outputLab2,room.memory.labs.outputLab8]}});
                        console.log('Adding Repair to Spawn List: ' + name);
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
            if(room.energyCapacityAvailable < 2000) {
                spawnrules[8].build_creep.amount += 5;
            }
            else if(room.energyCapacityAvailable < 3000) {
                spawnrules[8].build_creep.amount += 3;
            }
            else if(room.energyCapacityAvailable < 5000) {
                spawnrules[8].build_creep.amount += 1;
            }
            if(builders < spawnrules[8].build_creep.amount  && sites.length > 0 && (EnergyMinersInRoom > 1 || room.memory.danger) && (storage && storage.store[RESOURCE_ENERGY] > 50000 || !storage)) {
                let allowSpawn = true;
                let spawnSmall = false;
                for(let site of sites) {
                    if(site.structureType == STRUCTURE_RAMPART) {
                        allowSpawn = false;
                        spawnSmall = true;
                    }
                    else {
                        allowSpawn = true;
                        spawnSmall = false;
                        break;
                    }
                }

                if(allowSpawn) {
                    let name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push(spawnrules[8].build_creep.body, name, {memory: {role: 'builder'}});
                    console.log('Adding Builder to Spawn List: ' + name);
                }
                else if(!allowSpawn && spawnSmall && builders < 1) {
                    let name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push([WORK,CARRY,MOVE], name, {memory: {role: 'builder'}});
                    console.log('Adding Builder to Spawn List: ' + name);
                }
            }
            if(upgraders < spawnrules[8].upgrade_creep.amount && room.controller.ticksToDowngrade < 125000 && storage && storage.store[RESOURCE_ENERGY] > 10000 && (!room.memory.danger || room.controller.ticksToDowngrade < 110000)) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[8].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }

            if(maintainers < spawnrules[8].maintain_creep.amount && (room.memory.keepTheseRoads && room.memory.keepTheseRoads.length > 0 || spawnMaintainer)) {
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

    spawn_reserver(resourceData, room, storage, activeRemotes, reservers);



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
    if(room.controller.level !== 8 && ControllerLinkFillers < 1) {
        // The RCL5+ case: an actual LINK. The RCL3/4 case: the controller-side
        // CONTAINER, which upgrader.ts drinks from (it reads the same
        // Structures.controllerLink key) — killing this outright would cut the
        // controller's supply line in exactly the rooms that need it most. Live
        // E1S4 has its controller at 20,30 and both sources at 44,10 / 41,16, so
        // its 1-CARRY RCL3 upgraders spend ~25 tiles each way per 50 energy; the
        // near container is what makes them productive at all.
        //
        // The waste finding #9 measured was FIVE of these at once for a
        // structure that did not exist, in a room with zero upgraders. Requiring
        // a real target, an upgrader to serve, and a roster of one keeps the
        // supply line and removes the pile-up.
        let ctrlTarget: any = null;
        if(room.controller.level >= 5) {
            const ctrlLinks = room.find(FIND_MY_STRUCTURES, {filter: (s:any) =>
                s.structureType == STRUCTURE_LINK && s.pos.getRangeTo(room.controller) <= 3});
            if(ctrlLinks.length) ctrlTarget = room.controller.pos.findClosestByRange(ctrlLinks);
        }
        if(!ctrlTarget && room.controller.level >= 3 && upgraders > 0) {
            const ctrlConts = room.find(FIND_STRUCTURES, {filter: (s:any) =>
                s.structureType == STRUCTURE_CONTAINER &&
                s.id !== room.memory.Structures?.bin &&
                s.id !== room.memory.Structures?.storage &&
                s.pos.getRangeTo(room.controller) <= 3 &&
                s.pos.findInRange(FIND_SOURCES, 1).length === 0});
            if(ctrlConts.length) ctrlTarget = room.controller.pos.findClosestByRange(ctrlConts);
        }
        const feedable = ctrlTarget && (storage && storage.store[RESOURCE_ENERGY] > 1000 ||
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
        if(feedable && ctrlTarget.store.getFreeCapacity(RESOURCE_ENERGY) > 200) {
            room.memory.Structures.controllerLink = ctrlTarget.id;
            let name = 'ControllerLinkFiller-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
            // Below RCL5 this is a 550-energy room: 8 CARRY is plenty and the
            // 20-part cap would otherwise buy a 1,200-energy creep.
            const cap = room.controller.level >= 5 ? 20 : 10;
            room.memory.spawn_list.unshift(getBody([CARRY,CARRY,CARRY,CARRY,MOVE], room, cap), name, {memory: {role: 'ControllerLinkFiller'}});
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
    if(RampartErectors < 1 && room.controller.level >= 3 && (!storage || storage.store[RESOURCE_ENERGY] > 2000) && room.memory.construction && room.memory.construction.rampartLocations && room.memory.construction.rampartLocations.length > 0) {
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


    if(Signers < 1 && room.controller.level >= 5 && !room.memory.danger && room.memory.danger_timer == 0 && room.controller.sign && room.controller.sign.text !== "check out my YT channel - marlyman123") {
        let newName = 'Signer' + "-" + room.name;
        room.memory.spawn_list.push([MOVE], newName, {memory: {role: 'Sign', homeRoom: room.name}});
        console.log('Adding Signer to Spawn List: ' + newName);
    }

    if(Priests < 1 && room.controller.level >= 6 && !room.memory.danger && room.memory.danger_timer == 0 && room.memory.data.DOB % 125000 < 400 && Game.cpu.bucket > 7000) {
        let newName = 'Priest' + "-" + room.name;
        room.memory.spawn_list.push([MOVE], newName, {memory: {role: 'Priest', homeRoom: room.name, roomsVisited: []}});
        console.log('Adding Priest to Spawn List: ' + newName);
    }

    if (room.controller.level === 8 && clearers < 1 && room.memory.danger && room.memory.danger_timer > 300 && RampartDefenders === 0) {
        let hostileCreeps = room.find(FIND_HOSTILE_CREEPS);
        hostileCreeps = _.filter(hostileCreeps, (c:any) => c.owner.username !== "Invader");
        if(hostileCreeps.length) {
            let attackCreeps = _.filter(hostileCreeps, (c:any) => c.getActiveBodyparts(ATTACK) > 0);
            let rangedAttackCreeps = _.filter(hostileCreeps, (c:any) => c.getActiveBodyparts(RANGED_ATTACK) > 0);
            if(attackCreeps.length > 0 || rangedAttackCreeps.length > 0) {
                if(attackCreeps.length) {
                    let newName = 'Clearer-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push(
                      [TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK ,ATTACK],
                      newName,
                      { memory: { role: 'clearer', boostlabs:[room.memory.labs.outputLab2,room.memory.labs.outputLab3,room.memory.labs.outputLab7], boosted:true }}
                    );
                    console.log('Adding Clearer to Spawn List: ' + newName);

                    if(storage && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] >= 300 && storage.store[RESOURCE_CATALYZED_UTRIUM_ACID] >= 900 &&
                        storage.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] >= 300 &&
                        room.memory.labs && room.memory.labs.outputLab2 && room.memory.labs.outputLab3 && room.memory.labs.outputLab7) {
                           if(room.memory.labs.status && !room.memory.labs.status.boost) {
                               room.memory.labs.status.boost = {};
                           }

                           if(room.memory.labs.status.boost) {
                               // utrium acid
                               if(room.memory.labs.status.boost.lab3) {
                                   room.memory.labs.status.boost.lab3.amount = room.memory.labs.status.boost.lab3.amount + 900;
                                   room.memory.labs.status.boost.lab3.use += 1;
                               }
                               else {
                                   room.memory.labs.status.boost.lab3 = {};
                                   room.memory.labs.status.boost.lab3.amount = 900;
                                   room.memory.labs.status.boost.lab3.use = 1;
                               }
                               // zyn alk
                               if(room.memory.labs.status.boost.lab2) {
                                   room.memory.labs.status.boost.lab2.amount = room.memory.labs.status.boost.lab2.amount + 300;
                                   room.memory.labs.status.boost.lab2.use += 1;
                               }
                               else {
                                   room.memory.labs.status.boost.lab2 = {};
                                   room.memory.labs.status.boost.lab2.amount = 300;
                                   room.memory.labs.status.boost.lab2.use = 1;
                               }
                               // gho alk
                               if(room.memory.labs.status.boost.lab7) {
                                   room.memory.labs.status.boost.lab7.amount = room.memory.labs.status.boost.lab7.amount + 300;
                                   room.memory.labs.status.boost.lab7.use += 1;
                               }
                               else {
                                   room.memory.labs.status.boost.lab7 = {};
                                   room.memory.labs.status.boost.lab7.amount = 300;
                                   room.memory.labs.status.boost.lab7.use = 1;
                               }
                           }
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


        if(room.memory.danger_timer > 200 && SpecialRepairers < 1 || rampartsInDangerOfDying && SpecialRepairers < 1 || rampartsInDangerOfDying4Mil && SpecialRepairers < 4 && room.energyCapacityAvailable >= 4000) {

            let newName = 'SpecialRepair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
            console.log('Adding SpecialRepair to Spawn List: ' + newName);

            // if room memory danger
            if(room.controller.level >= 7) {
                if(storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] >= 1080 && room.memory.labs && room.memory.labs.outputLab1 && room.memory.danger && room.memory.danger_timer >= 50) {
                    if(room.memory.labs && room.memory.labs.status && !room.memory.labs.status.boost) {
                        room.memory.labs.status.boost = {};
                    }
                    if(room.memory.labs.status.boost) {
                        if(room.memory.labs.status.boost.lab1) {
                            room.memory.labs.status.boost.lab1.amount += 1080;
                            room.memory.labs.status.boost.lab1.use += 1;
                        }
                        else {
                            room.memory.labs.status.boost.lab1 = {};
                            room.memory.labs.status.boost.lab1.amount = 1080;
                            room.memory.labs.status.boost.lab1.use = 1;
                        }
                    }

                    room.memory.spawn_list.push([WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'SpecialRepair', boostlabs:[room.memory.labs.outputLab1]}});
                }
                else {
                    room.memory.spawn_list.push([WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'SpecialRepair'}});
                }

                let newName2 = 'SpecialCarry-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY], newName2, {memory: {role: 'SpecialCarry'}});
                console.log('Adding SpecialCarry to Spawn List: ' + newName);
            }
            else if(room.controller.level == 6) {
                if(storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] >= 540 && room.memory.labs && room.memory.labs.outputLab1 && room.memory.danger && room.memory.danger_timer >= 50) {
                    if(room.memory.labs && room.memory.labs.status && !room.memory.labs.status.boost) {
                        room.memory.labs.status.boost = {};
                    }
                    if(room.memory.labs.status.boost) {
                        if(room.memory.labs.status.boost.lab1) {
                            room.memory.labs.status.boost.lab1.amount += 540;
                            room.memory.labs.status.boost.lab1.use += 1;
                        }
                        else {
                            room.memory.labs.status.boost.lab1 = {};
                            room.memory.labs.status.boost.lab1.amount = 540;
                            room.memory.labs.status.boost.lab1.use = 1;
                        }
                    }

                    room.memory.spawn_list.push([WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE], newName, {memory: {role: 'SpecialRepair', boostlabs:[room.memory.labs.outputLab1]}});
                }
                else {
                    room.memory.spawn_list.push([WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE], newName, {memory: {role: 'SpecialRepair'}});
                }

                let newName2 = 'SpecialCarry-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY], newName2, {memory: {role: 'SpecialCarry'}});
                console.log('Adding SpecialCarry to Spawn List: ' + newName);
            }


        }
    }
    if((room.memory.NukeRepair && repairers < 4 && !room.memory.danger || room.memory.defence && room.memory.defence.nuke && repairers < 1) && Game.cpu.bucket > 150 && storage && storage.store[RESOURCE_ENERGY] > 75000) {
        let name = 'Repair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
            if(room.controller.level >= 7 && room.find(FIND_NUKES).length > 2 && storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] >= 1980 && room.memory.labs && room.memory.labs.outputLab1) {
                if(room.memory.labs && room.memory.labs.status && !room.memory.labs.status.boost) {
                    room.memory.labs.status.boost = {};
                }
                if(room.memory.labs.status.boost) {
                    if(room.memory.labs.status.boost.lab1) {
                        room.memory.labs.status.boost.lab1.amount += 660;
                        room.memory.labs.status.boost.lab1.use += 1;
                    }
                    else {
                        room.memory.labs.status.boost.lab1 = {};
                        room.memory.labs.status.boost.lab1.amount = 660;
                        room.memory.labs.status.boost.lab1.use = 1;
                    }
                }
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


    if (MineralMiners < 1 && room.controller.level >= 6 && room.memory.Structures && room.memory.Structures.extractor && Game.getObjectById(room.memory.Structures.extractor) && !room.memory.danger && room.memory.danger_timer == 0 && storage && storage.store[RESOURCE_ENERGY] > 250000 && storage.store.getUsedCapacity() < 975000 && Game.cpu.bucket > 8000) {
        let mineral = Game.getObjectById(room.memory.mineral) || room.findMineral();
        if(mineral.mineralAmount > 0 && storage.store[mineral.mineralType] < 100000) {
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


                if(HostileCreeps.length > 4 && RampartDefenders <= 1 && storage &&
                    storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] >= 300 &&
                    storage.store[RESOURCE_CATALYZED_KEANIUM_ALKALIDE] >= 1200 &&
                    (RangedRampartDefenders < 3 && room.controller.level == 7 || RangedRampartDefenders  < 2 && room.controller.level == 8))  {
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
                        room.memory.spawn_list.push(body, newName, { memory: { role: 'RRD', homeRoom: room.name, boostlabs: [room.memory.labs.outputLab4, room.memory.labs.outputLab2] } } );
                        console.log('Adding RangedRampartDefender to Spawn List: ' + newName);

                        if(room.memory.labs && room.memory.labs.status && !room.memory.labs.status.boost) {
                            room.memory.labs.status.boost = {};
                        }
                        if(room.memory.labs.status.boost) {
                            if(room.memory.labs.status.boost.lab2) {
                                room.memory.labs.status.boost.lab2.amount += 300;
                                room.memory.labs.status.boost.lab2.use += 1;
                            }
                            else {
                                room.memory.labs.status.boost.lab2 = {amount:300, use:1};
                            }

                            if(room.memory.labs.status.boost.lab4) {
                                room.memory.labs.status.boost.lab4.amount += 1200;
                                room.memory.labs.status.boost.lab4.use += 1;
                            }
                            else {
                                room.memory.labs.status.boost.lab4 = {amount:1200, use:1};
                            }
                        }

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
                        room.memory.spawn_list.push(body, newName, { memory: { role: 'RRD', homeRoom: room.name, boostlabs: [room.memory.labs.outputLab4, room.memory.labs.outputLab2] } } );
                        console.log('Adding RangedRampartDefender to Spawn List: ' + newName);


                        if(room.memory.labs && room.memory.labs.status && !room.memory.labs.status.boost) {
                            room.memory.labs.status.boost = {};
                        }
                        if(room.memory.labs.status.boost) {
                            if(room.memory.labs.status.boost.lab2) {
                                room.memory.labs.status.boost.lab2.amount += 240;
                                room.memory.labs.status.boost.lab2.use += 1;
                            }
                            else {
                                room.memory.labs.status.boost.lab2 = {amount:240, use:1};
                            }

                            if(room.memory.labs.status.boost.lab4) {
                                room.memory.labs.status.boost.lab4.amount += 960;
                                room.memory.labs.status.boost.lab4.use += 1;
                            }
                            else {
                                room.memory.labs.status.boost.lab4 = {amount:960, use:1};
                            }
                        }

                    }

                }


                inRangeFourteen = true;
            }
        }

        if(inRangeFourteen && RampartDefenders < 1) {
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
                    if(storage && storage.store[RESOURCE_CATALYZED_UTRIUM_ACID] >= 990 && room.controller.level >= 7 && room.memory.labs && room.memory.labs.outputLab3 && (HostileCreeps.length > 1 || HostileCreeps.length == 1 && room.controller.level == 7 && HostileCreeps[0].getActiveBodyparts(HEAL) >= 16)) {
                        if(HostileCreeps.length > 2) {



                            if(room.memory.labs && room.memory.labs.status && !room.memory.labs.status.boost) {
                                room.memory.labs.status.boost = {};
                            }
                            if(room.memory.labs.status.boost) {
                                if(room.memory.labs.status.boost.lab3) {
                                    room.memory.labs.status.boost.lab3.amount += 990;
                                    room.memory.labs.status.boost.lab3.use += 1;
                                }
                                else {
                                    room.memory.labs.status.boost.lab3 = {};
                                    room.memory.labs.status.boost.lab3.amount = 990;
                                    room.memory.labs.status.boost.lab3.use = 1;
                                }
                            }
                            room.memory.spawn_list.push(body, newName, {memory: {role: 'RampartDefender', homeRoom: room.name, boostlabs:[room.memory.labs.outputLab3]}});
                        }
                        else if(HostileCreeps.length == 1) {
                            if(room.memory.labs && room.memory.labs.status && !room.memory.labs.status.boost) {
                                room.memory.labs.status.boost = {};
                            }
                            if(room.memory.labs.status.boost) {
                                if(room.memory.labs.status.boost.lab3) {
                                    room.memory.labs.status.boost.lab3.amount += 630;
                                    room.memory.labs.status.boost.lab3.use += 1;
                                }
                                else {
                                    room.memory.labs.status.boost.lab3 = {};
                                    room.memory.labs.status.boost.lab3.amount = 630;
                                    room.memory.labs.status.boost.lab3.use = 1;
                                }
                            }
                            room.memory.spawn_list.push(body, newName, {memory: {role: 'RampartDefender', homeRoom: room.name, boostlabs:[room.memory.labs.outputLab3]}});
                        }
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

            if (
                target_colonise &&
                containerbuilders < 2 &&
                !room.memory.danger &&
                room.controller.level >= 3 &&
                storage &&
                storage.store[RESOURCE_ENERGY] > 10000 &&
                Game.cpu.bucket > 7750 &&
                distance_to_target_room <= 7 &&
                Game.rooms[target_colonise] &&
                (Game.rooms[target_colonise].find(FIND_MY_SPAWNS).length == 0 ||
                Game.rooms[target_colonise].controller.level <= 1 ||
                (Game.rooms[target_colonise].controller.level >= 4 &&
                    (!Game.rooms[target_colonise].storage && containerbuilders < 1 ||
                    Game.rooms[target_colonise].energyCapacityAvailable <= 500)) ||
                (Game.rooms[target_colonise].find(FIND_MY_SPAWNS).length == 0 && containerbuilders < 1)) &&
                Game.rooms[target_colonise].controller.level >= 1 &&
                Game.rooms[target_colonise].controller.my
            ) {
                let newName = 'ContainerBuilder-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
                // Off-road 1:1, capped at 8 [W,C,M]. Mother RCL8 getBody on
                // [W,C,C,C,M] used to emit a 50-part 3000e creep that walked
                // 2–4 ticks/tile to the colony. Spawn is 15k; 8 WORK is 375
                // ticks of build once they arrive, and they arrive walking.
                room.memory.spawn_list.push(getBody([WORK, CARRY, MOVE], room, 24), newName,
                    {memory: {role: 'buildcontainer', targetRoom: target_colonise, homeRoom: room.name, fill: true}});
                console.log('Adding ContainerBuilder to Spawn List: ' + newName);
            }

            if(target_colonise && RangedAttackers < 2 && room.controller.level >= 7 && storage && storage.store[RESOURCE_ENERGY] > 180000 && distance_to_target_room <= 7 && Game.rooms[target_colonise] && (Game.rooms[target_colonise].find(FIND_MY_SPAWNS).length == 0 || Game.rooms[target_colonise].controller.level <= 3) && Game.rooms[target_colonise].controller.level >= 1 && (Game.rooms[target_colonise].controller.my || !Game.rooms[target_colonise].controller.my && !Game.rooms[target_colonise].find(FIND_MY_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_TOWER}).length)  && Game.time - Memory.target_colonise.lastSpawnRanger > 1500 && !Game.rooms[target_colonise].controller.safeMode) {
                if(storage && storage.store[RESOURCE_CATALYZED_KEANIUM_ALKALIDE] >= 45000 && Game.rooms[target_colonise].controller.level < 3) {
                    let newName = 'RangedAttacker-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,HEAL,HEAL,HEAL,HEAL,HEAL], newName, {memory: {role: 'RangedAttacker', targetRoom: target_colonise, homeRoom: room.name, sticky:true, boostlabs: [room.memory.labs.outputLab4],ignore:true }});

                    console.log('Adding Defending-Ranged-Attacker to Spawn List: ' + newName);

                    Memory.target_colonise.lastSpawnRanger = Game.time - (distance_to_target_room * 100) ;


                    if(room.memory.labs && room.memory.labs.status && !room.memory.labs.status.boost) {
                        room.memory.labs.status.boost = {};
                    }
                    if(room.memory.labs.status.boost) {
                        if(room.memory.labs.status.boost.lab4) {
                            room.memory.labs.status.boost.lab4.amount += 600;
                            room.memory.labs.status.boost.lab4.use += 1;
                        }
                        else {
                            room.memory.labs.status.boost.lab4 = {amount:600, use:1};
                        }
                    }
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




    // if(billtongs < 1 && Game.cpu.bucket > 9500 && room.controller.level >= 4 && room.controller.level !== 8 && storage && storage.store[RESOURCE_ENERGY] > 320000 && !room.memory.danger && Memory.CPU.fiveHundredTickAvg.avg < Game.cpu.limit - 4) {
    //     let newName = 'Billtong-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
    //     room.memory.spawn_list.push(getBody([WORK,CARRY,MOVE,MOVE], room, 8), newName, {memory: {role: 'billtong', homeRoom:room.name}});
    //     console.log('Adding Billtong to Spawn List: ' + newName);
    // }


    if(DrainTowers < 0 && room.energyCapacityAvailable > 5200 && Game.map.getRoomLinearDistance(room.name, "E15S37") <= 5) {
        let newName = 'rewotreniard-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
        room.memory.spawn_list.push([TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                                MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                                MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,RANGED_ATTACK,
                                HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,
                                HEAL,HEAL,HEAL,HEAL,HEAL], newName,
            {memory: {role: 'DrainTower', targetRoom: "E15S38", homeRoom: room.name}});
        console.log('Adding Tower Drainer to Spawn List: ' + newName);
    }


    if(RemoteDismantlers < 0 && room.controller.level >= 4 && storage && storage.store[RESOURCE_ENERGY] > 300000 && Game.map.getRoomLinearDistance(room.name, "E45N58") <= 2) {
        let newName = 'RemoteDismantler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
        room.memory.spawn_list.push([MOVE,MOVE,WORK,WORK], newName, {memory: {role: 'RemoteDismantler', targetRoom: "E45N58", homeRoom: room.name}});
        console.log('Adding RemoteDismantler to Spawn List: ' + newName);
    }

    if(room.controller.level <= 4 && Dismantlers < 0) {
        let newName = 'Dismantler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
        room.memory.spawn_list.push(getBody([WORK,WORK,WORK,WORK,MOVE], room), newName, {memory: {role: 'Dismantler'}});
        console.log('Adding Dismantler to Spawn List: ' + newName);
    }


    let annoyRoom:any = false;
    if(annoyRoom && annoyers < 1 && Game.map.getRoomLinearDistance(room.name, annoyRoom) <= 5 && annoyRoom !== room.name) {
        if(Game.rooms[annoyRoom] && Game.rooms[annoyRoom].controller && Game.rooms[annoyRoom].controller.my && Game.rooms[annoyRoom].controller.level >= 3) {

        }
        else {
            let newName = 'Annoy-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.push([MOVE,ATTACK,MOVE,ATTACK,ATTACK,MOVE], newName, {memory: {role: 'annoy', targetRoom: annoyRoom}});
            console.log('Adding Annoyer to Spawn List: ' + newName);
        }

    }


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

    _.forEach(Game.rooms, function(thisRoom) {
        _.forEach(resourceData, function(data, targetRoomName) {
            if(thisRoom.name == targetRoomName && !room.memory.danger && activeRemotes.includes(targetRoomName) && room.storage && room.storage.store[RESOURCE_ENERGY] > 10000) {
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
    });
}




function spawnFirstInLine(room, spawn) {
    // Emergency energy check - run this BEFORE checking spawn list.
    // The cure for a starved spawn is a FILLER (storage -> spawn/extensions).
    // An EnergyManager only shuttles storage <-> terminal/labs/links/factory and
    // has no spawn-filling branch at all, so the old version of this block sat a
    // fresh EnergyManager next to a full storage doing literally nothing while
    // the spawn stayed empty (E17S4, RCL5, 26k banked, spawn on 64).
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
                    return "spawning";
                } else {
                    console.log(`FAILED to spawn emergency filler in ${room.name}, error: ${spawnAttempt}`);
                }
            }
        }
    }

    // Normal spawn queue processing
    if(room.memory.spawn_list.length >= 1) {
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

                && !room.memory.spawn_list[1].startsWith("Ram")
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
                || room.memory.spawn_list[1].startsWith("Defender")
                || room.memory.spawn_list[1].startsWith("WallClearer")) {

                    if(room.memory.spawn_list[1].startsWith("SpecialRe") && room.memory.labs && room.memory.labs.status && room.memory.labs.status.boost && room.memory.labs.status.boost.lab1 && room.memory.labs.status.boost.lab1.amount && room.memory.labs.status.boost.lab1.use > 0) {
                        room.memory.labs.status.boost.lab1.use = 0;
                        room.memory.labs.status.boost.lab1.amount = 0;
                    }

                    room.memory.spawn_list.shift();
                    room.memory.spawn_list.shift();
                    room.memory.spawn_list.shift();

                    console.log("clearing spawn queue because too high energy cost or is defender/wallclearer")

                }
                else if(mayShrinkHead && (
                room.memory.spawn_list[1].startsWith("Carrier") && room.energyAvailable < room.memory.spawn_list[0].length * 50 && room.memory.spawn_list[0].length > 3 ||
                room.memory.spawn_list[1].startsWith("EnergyMiner") && room.energyAvailable < room.memory.spawn_list[0].length * 100  && room.memory.spawn_list[0].length > 3 ||
                room.memory.spawn_list[1].startsWith("Reserver") && room.memory.spawn_list[0].length > 2)) {
                    // NOT .shift(): that stripped parts off the FRONT of the
                    // body and produced miners with no WORK and reservers with
                    // no CLAIM (see shrinkQueuedBody).
                    if(shrinkQueuedBody(room.memory.spawn_list[0], room.memory.spawn_list[1])) {
                        room.memory.lastShrink = Game.time;
                        console.log("shrinking stalled head", room.memory.spawn_list[1], "to", bodyCost(room.memory.spawn_list[0]), "energy in", room.name);
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
            if(spawnAttempt == -3 || spawnAttempt == -14 || spawnAttempt == -10) {
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
 * one once only roads remain. Six 300e bodies on pavement steal the
 * 135k climb from the upgraders.
 */
function earlyBuildSlots(sites, cap: number): number {
    let useful = 0;
    for(let i = 0; i < sites.length; i++) {
        if(sites[i].structureType !== STRUCTURE_ROAD) useful++;
    }
    if(useful > 0) return Math.min(cap, useful, 2);
    return sites.length > 0 ? 1 : 0;
}

function onlyRoadSites(sites): boolean {
    if(!sites.length) return false;
    for(let i = 0; i < sites.length; i++) {
        if(sites[i].structureType !== STRUCTURE_ROAD) return false;
    }
    return true;
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

    let hasUsefulSite = false;
    for(const site of sites) {
        if(site.structureType !== STRUCTURE_RAMPART) { hasUsefulSite = true; break; }
    }

    if(!hasUsefulSite) {
        // rampart-only: one token builder, and only off a bank
        if(rich && builders < 1) {
            const name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.push([WORK,CARRY,MOVE], name, {memory: {role: 'builder'}});
            console.log('Adding Builder to Spawn List: ' + name + ' (ramparts only)');
        }
        return;
    }

    const want = rich ? rules.build_creep.amount : 1;
    if(builders >= want) return;
    const name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
    room.memory.spawn_list.push(rules.build_creep.body, name, {memory: {role: 'builder'}});
    console.log('Adding Builder to Spawn List: ' + name +
        ' (' + (builders+1) + '/' + want + ', bank ' + bankEnergy(room) +
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
    for(const name in Game.creeps) {
        const c: any = Game.creeps[name];
        if(c.memory.role !== "carry" && c.memory.role !== "FakeFiller") continue;
        if(c.memory.homeRoom !== room.name && c.room.name !== room.name) continue;
        total++;
        if(c.store.getFreeCapacity() === 0 && Game.time - (c.memory._phT || 0) >= 5) parked++;
    }
    const prev = typeof room.memory._floorE === "number" ? room.memory._floorE : onFloor;
    room.memory._floorE = onFloor;

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
        burn: onFloor < FLOOR_PILE_SMALL ? 0 : Math.min(4, Math.max(1, Math.floor(onFloor / FLOOR_PILE_PER_UPGRADER))),
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
        return body;
    }

    _.times(maxSegments, function() {if(segment.length + body.length <= bodyMaxLength){_.forEach(segment, s => body.push(s));}});

    return body;
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
    for(const name in Game.creeps) {
        const c: any = Game.creeps[name];
        if(c.memory.role != 'EnergyMiner' || c.memory.sourceId != sourceId) continue;
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
    let carriersInRoom = _.filter(Game.creeps, (creep) => (creep.memory.role == 'carry' || creep.memory.role == 'FakeFiller') && creep.room.name == room.name);

    if(storage != undefined && !values.pathLength) {
        pathFromHomeToSource = storage.pos.findPathTo(targetSource, {ignoreCreeps: true, ignoreRoads: false});
        values.pathLength = pathFromHomeToSource.length - 1;
    }
    else if (spawn != undefined && !values.pathLength) {
        pathFromHomeToSource = spawn.pos.findPathTo(targetSource, {ignoreCreeps: true, ignoreRoads: false});
        values.pathLength = pathFromHomeToSource.length - 1;
    }

    if(carriersInRoom.length == 0 && !storage) {
        // RCL1 leftover after the [W,C,M] miner is 100, not 150.
        return isRcl1Bootstrap(room) ? [CARRY,MOVE] : [CARRY,CARRY,MOVE];
    }


    if(targetSource == null || !values.pathLength) {
        return [];
    }

    if(targetSource.room.name == room.name) {
        // Same ratio rule as remotes: 1:1 on dirt, 2:1 once the hub is roaded.
        // The old loop added MOVE every other CARRY (road speed) at every RCL.
        // RCL2 has no roads; RCL3 only sites hub↔source arterials and we
        // deprioritized paving them. A loaded 2:1 body is 2 ticks/tile on
        // plain, so the trip was sized for a walk it could not make.
        const roaded = !!(room.controller && room.controller.level >= 4 &&
            room.storage && room.storage.my);
        const movePerCarry = roaded ? 0.5 : 1;
        const budget = room.energyCapacityAvailable;
        const unitCost = 50 + 50 * movePerCarry;
        const maxCarryByBudget = Math.max(1, Math.floor(budget / unitCost));
        const maxCarryByParts = Math.floor(50 / (1 + movePerCarry));
        const L = values.pathLength;
        const loadedTicks = movePerCarry >= 1 ? 1 : 2;
        const headroom = roaded ? 1.15 : 1.35;
        const need = homeSourceHarvest(room, sourceId).energyPerTick * (L + L * loadedTicks + 6) * headroom;
        const carry = Math.max(2, Math.min(maxCarryByBudget, maxCarryByParts, Math.ceil(need / 50)));
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
        const demand = remoteCarrierDemand(room, targetSource.room.name, values);
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
function getRemoteCarrierBody(room, targetRoomName, values) {
    if(!values || !values.pathLength) return [];
    const demand = remoteCarrierDemand(room, targetRoomName, values);
    const want = carriersWantedForSource(room, values, demand);

    const movePerCarry = demand.roaded ? 0.5 : 1;
    const unitCost = 50 + 50 * movePerCarry;
    const maxCarryByBudget = Math.floor(room.energyCapacityAvailable / unitCost);
    const maxCarryByParts = Math.floor(50 / (1 + movePerCarry));

    const wantCarryTotal = Math.ceil(demand.capacityNeeded / 50);
    const carry = Math.max(2, Math.min(maxCarryByBudget, maxCarryByParts, Math.ceil(wantCarryTotal / want)));
    if(carry < 2) return [];
    const move = Math.max(1, Math.ceil(carry * movePerCarry));

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
    // One 50-carry hauler is the RCL1 bootstrap. A [C,M] body would otherwise
    // demand 3-4 copies and steal the spawn from the 2W replacement miner.
    if(isRcl1Bootstrap(room)) return 1;
    const L = values && values.pathLength ? values.pathLength : 15;
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
    const loadedTicksPerTile = move > 0 ? Math.max(1, Math.ceil(carry / move)) : 3;
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
    const minerFloor = Math.max(1, harvest.miners);
    if(want < minerFloor) want = minerFloor;
    if(want > MAX_HOME_CARRIERS_PER_SOURCE) want = MAX_HOME_CARRIERS_PER_SOURCE;
    const pressure = drainPressure(room);
    if(pressure.haul > 0) want = Math.min(MAX_HOME_CARRIERS_PER_SOURCE + 1, want + pressure.haul);
    return want;
}

/**
 * Is a creep whose name starts with `prefix` already QUEUED for this source?
 *
 * spawn_list is a flat [body, name, opts] x N array (same walk as
 * spawn_reserver's coverage scan).
 */
function queuedForSource(room, prefix:string, sourceId):boolean {
    const queue = room.memory.spawn_list || [];
    for(let i = 1; i + 1 < queue.length; i += 3) {
        if(typeof queue[i] !== 'string' || queue[i].indexOf(prefix) !== 0) continue;
        const opts = queue[i + 1];
        if(opts && opts.memory && opts.memory.sourceId == sourceId) return true;
    }
    return false;
}

/**
 * Is anything actually working, hatching or waiting for this source?
 *
 * Creeps under construction are already in Game.creeps (creep.spawning), so a
 * miner mid-hatch counts and cannot be double-queued.
 */
function minerOnTheWay(room, sourceId):boolean {
    return _.some(Game.creeps, (creep:any) =>
            creep.memory.role == 'EnergyMiner' && creep.memory.sourceId == sourceId)
        || queuedForSource(room, 'EnergyMiner', sourceId);
}

/** live carriers (incl. mid-dropoff FakeFillers and hatching ones) bound to a source */
function liveCarriersForSource(room, sourceId):number {
    let n = 0;
    for(const name in Game.creeps) {
        const c:any = Game.creeps[name];
        const r = c.memory.role;
        if((r == 'carry' || r == 'FakeFiller') && c.memory.sourceId == sourceId && c.memory.homeRoom == room.name) n++;
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
function remotePathIsRoaded(room, targetRoomName):boolean {
    // Verdict is cached by manageRemotes() (rooms.remotes.ts) once per remote per
    // 25 ticks — do NOT re-find() it here, this runs once per source per pass.
    const res = room.memory.resources;
    return !!(res && res[targetRoomName] && res[targetRoomName].roaded);
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
function remoteCarrierDemand(room, targetRoomName, values) {
    const L = values && values.pathLength ? values.pathLength : 40;
    const rr = Game.rooms[targetRoomName];
    // Prefer live vision, fall back to the verdict manageRemotes cached. A long
    // remote spends most of its time unobserved, and sizing must not depend on
    // whether we happen to have a creep standing there this tick.
    const resMem = room.memory.resources;
    const cached = resMem && resMem[targetRoomName];
    const reserved = rr && rr.controller
        ? !!rr.controller.reservation
        : !!(cached && cached.reserved);
    const yieldPerTick = reserved ? 10 : 5;
    const roaded = remotePathIsRoaded(room, targetRoomName);
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
    const conts = (res && res[targetRoomName] && res[targetRoomName].containers) || 0;
    const headroom = conts > 0 ? 1.25 : 1.5;
    const capacityNeeded = Math.ceil(yieldPerTick * roundTrip * headroom);
    return { capacityNeeded, roaded, roundTrip, reserved, headroom };
}

/**
 * First-100-ticks window: RCL1, spawn still 300 energy, no extensions.
 *
 * The opening 300 must buy both a miner and a hauler or the spawn sits on
 * regen (1 e/t) until it can afford a 150-energy [C,C,M]. A 200-energy
 * [W,C,M] leaves 100 — enough for [C,M] the tick the miner starts.
 */
function isRcl1Bootstrap(room): boolean {
    return !!(room.controller && room.controller.level <= 1 && room.energyCapacityAvailable <= 300);
}

/** A home EnergyMiner already live, hatching, or queued. */
function homeHasMiner(room): boolean {
    if(_.some(Game.creeps, (c:any) =>
        c.memory.role == 'EnergyMiner' &&
        (c.memory.targetRoom == room.name ||
            (!c.memory.targetRoom && c.memory.homeRoom == room.name)))) {
        return true;
    }
    const q = room.memory.spawn_list || [];
    for(let i = 1; i + 1 < q.length; i += 3) {
        if(typeof q[i] !== 'string' || q[i].indexOf('EnergyMiner') !== 0) continue;
        const mem = q[i + 1] && q[i + 1].memory;
        if(mem && (!mem.targetRoom || mem.targetRoom == room.name)) return true;
    }
    return false;
}

/** Any home hauler live or queued — stops the RCL1 sweeper from stacking. */
function roomHasHauler(room): boolean {
    if(_.some(Game.creeps, (c:any) =>
        (c.memory.role == 'carry' || c.memory.role == 'FakeFiller' || c.memory.role == 'sweeper') &&
        (c.memory.homeRoom == room.name || c.room.name == room.name))) {
        return true;
    }
    const q = room.memory.spawn_list || [];
    for(let i = 1; i + 1 < q.length; i += 3) {
        if(typeof q[i] !== 'string') continue;
        if(q[i].indexOf('Carrier') === 0 || q[i].indexOf('Sweeper') === 0) return true;
    }
    return false;
}

function spawn_energy_miner(resourceData:any, room, activeRemotes) {
    let storage = Game.getObjectById(room.memory.Structures?.storage) || room.findStorage();

    _.forEach(resourceData, function(data, targetRoomName){
        if(activeRemotes.includes(targetRoomName)) {
            let index = 0;

            let containerBuilders = [];
            if(room.controller.level <= 5) {
                containerBuilders = _.filter(Game.creeps, (creep) => creep.memory.role == 'containerBuilder' && creep.memory.targetRoom == room.name);
            }
            _.forEach(data.energy, function(values, sourceId:any) {


                if(room.controller.level <= 4 && containerBuilders.length) {
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
                                if(Memory.CPU.reduce && storage && storage.store[RESOURCE_UTRIUM_OXIDE] >= 720 && room.memory.labs && room.memory.labs.outputLab8) {
                                    room.memory.labs.lab8reserved = true;
                                    if(room.memory.labs.status.boost) {
                                        if(room.memory.labs.status.boost.lab8) {
                                            room.memory.labs.status.boost.lab8.amount = room.memory.labs.status.boost.lab8.amount + 360;
                                            room.memory.labs.status.boost.lab8.use += 1;
                                        }
                                        else {
                                            room.memory.labs.status.boost.lab8 = {};
                                            room.memory.labs.status.boost.lab8.amount = 360;
                                            room.memory.labs.status.boost.lab8.use = 1;
                                        }
                                    }
                                    let body;
                                    if(danger) {
                                        body = [WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,CARRY,MOVE]
                                    }
                                    else {
                                        body = [WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,CARRY,MOVE]
                                    }
                                    room.memory.spawn_list.unshift(body, newName,
                                        {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name, danger:danger, boostlabs:[room.memory.labs.outputLab8]}});

                                }
                                else {
                                    if(room.memory.labs && room.memory.labs.status && room.memory.labs.status.boost && room.memory.labs.status.boost.lab8) room.memory.labs.status.boost.lab8 = undefined;
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
                            else if(isRcl1Bootstrap(room) && !homeHasMiner(room)) {
                                // 200e leaves 100 in the spawn for the [C,M] hauler.
                                body = [WORK,CARRY,MOVE];
                            }
                            else {
                                body = [WORK,WORK,MOVE];
                            }


                            room.memory.spawn_list.unshift(body, newName, {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding Energy Miner to Spawn List: ' + newName);

                            let sourceObj:any = Game.getObjectById(sourceId);
                            if(body.length === 3 && body.indexOf(CARRY) !== -1) {
                                // Re-arm so a 2W replacement queues ~100 ticks later
                                // instead of waiting the usual ~1050.
                                values.lastSpawn = Game.time - (CREEP_LIFE_TIME - 100);
                            }
                            else if(sourceObj && sourceObj.pos.getOpenPositions().length > 0) {
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
                        // know nothing (no pathLength surveyed yet).
                        if((!Game.rooms[targetRoomName] || Game.rooms[targetRoomName] == undefined) && !values.pathLength) {
                            room.memory.spawn_list.unshift([WORK,WORK,MOVE], newName,
                                {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding Energy Miner (probe, unsurveyed) to Spawn List: ' + newName);
                            values.lastSpawn = Game.time-120;
                        }

                        else if(room.controller.level >= 5 && storage && storage.store[RESOURCE_ENERGY] > 25000) {
                            room.memory.spawn_list.unshift([WORK,WORK,MOVE,WORK,WORK,MOVE,WORK,WORK,MOVE,WORK,WORK,MOVE], newName,
                                {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding Energy Miner to Spawn List: ' + newName);
                            values.lastSpawn = Game.time-20;
                        }
                        else if(room.energyCapacityAvailable >= 500) {
                            room.memory.spawn_list.unshift([WORK,WORK,MOVE,WORK,WORK,MOVE], newName,
                                {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding Energy Miner to Spawn List: ' + newName);
                            values.lastSpawn = Game.time-20;
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
                    const demand = remoteCarrierDemand(room, targetRoomName, values);
                    const want = carriersWantedForSource(room, values, demand);
                    const have = liveCarriersForSource(room, sourceId);
                    if(have >= want || queuedForSource(room, 'Carrier', sourceId)) return;
                    if(Game.time - (values.lastSpawnCarrier || 0) < 60) return;
                    const body = getRemoteCarrierBody(room, targetRoomName, values);
                    if(!body || body.length === 0) return;
                    const nm = 'Carrier-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push(body, nm,
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
                if(homeVis.memory.roomData && homeVis.memory.roomData.has_hostile_creeps) return;

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
                if(remoteIsHot(room, targetRoomName)) return;
                const rr = Game.rooms[targetRoomName];
                if(!rr) return;
                const hasWork =
                    rr.find(FIND_MY_CONSTRUCTION_SITES).length > 0 ||
                    rr.find(FIND_STRUCTURES, {filter: (s:any) =>
                        (s.structureType == STRUCTURE_ROAD || s.structureType == STRUCTURE_CONTAINER) &&
                        s.hits < s.hitsMax * 0.75}).length > 0;
                if(!hasWork) return;
                if(_.some(Game.creeps, (c:any) =>
                    c.memory.role == 'RemoteRepair' && c.memory.homeRoom == room.name &&
                    c.memory.targetRoom == targetRoomName)) return;
            }
            _.forEach(data.energy, function(values, sourceId) {
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
                                values.lastSpawnRemoteRepairer = Game.time - 100;
                            }
                            else {
                                values.lastSpawnRemoteRepairer = Game.time + 50;
                            }
                        }

                        else if(room.energyCapacityAvailable >= 600) {
                            room.memory.spawn_list.push([WORK,CARRY,MOVE,WORK,CARRY,MOVE,WORK,CARRY,MOVE], newName,
                                {memory: {role: 'RemoteRepair', targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding RemoteRepairer to Spawn List: ' + newName);
                            if(Game.rooms[targetRoomName].find(FIND_MY_CONSTRUCTION_SITES).length > 0) {
                                values.lastSpawnRemoteRepairer = Game.time - 300;
                            }
                            else {
                                values.lastSpawnRemoteRepairer = Game.time + 200;
                            }
                        }

                        else if(room.energyCapacityAvailable >= 400) {
                            room.memory.spawn_list.push([WORK,CARRY,MOVE,WORK,CARRY,MOVE], newName,
                                {memory: {role: 'RemoteRepair', targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding RemoteRepairer to Spawn List: ' + newName);
                            if(Game.rooms[targetRoomName].find(FIND_MY_CONSTRUCTION_SITES).length > 0) {
                                values.lastSpawnRemoteRepairer = Game.time - 400;
                            }
                            else {
                                values.lastSpawnRemoteRepairer = Game.time + 100;
                            }
                        }
                        else {
                            room.memory.spawn_list.push([WORK,CARRY,MOVE], newName,
                                {memory: {role: 'RemoteRepair', targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding RemoteRepairer to Spawn List: ' + newName);
                            values.lastSpawnRemoteRepairer = Game.time-600;
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
        if (gcl > owned) {
            return { ok: false, reason: "RCL4 but GCL" + gcl + ">owned" + owned + " — free claim slot, claiming beats reserving" };
        }
        return { ok: true, reason: "RCL4 and GCL" + gcl + "<=owned" + owned + " — no claim slot, reserve instead" };
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
    return _.some(Game.creeps, (c:any) =>
        c.memory.role === 'reserve' &&
        c.memory.homeRoom === room.name &&
        c.memory.targetRoom === targetRoomName);
}

function spawn_reserver(resourceData, room, storage, activeRemotes, reservers) {
    // OWNER RULE: no remote reservation at low RCL. See reserverGate() above.
    const gate = reserverGate(room);
    logReserverGate(room, gate);
    // The claim rung below (Memory.CanClaimRemote) is a real room CLAIM, not a
    // reservation — 1 CLAIM part is correct there and it is not what the gate is
    // about, so it stays reachable.
    if (!gate.ok && !(Memory.CanClaimRemote >= 3)) return;

    // `reservers` is a GLOBAL count — rooms.spawning tallies Game.creeps
    // without filtering by homeRoom — so `reservers > 0` meant exactly ONE
    // reservation could exist across the whole empire. Scope it to this
    // commune, and to one reserver per target room (the loop below runs once
    // per SOURCE, so without this it queues one reserver per source).
    const myReservers: any[] = _.filter(Game.creeps, (c: any) =>
        c.memory.role === 'reserve' && c.memory.homeRoom === room.name) as any[];
    const covered: { [roomName: string]: boolean } = {};
    for(const c of myReservers) {
        if(c.memory.targetRoom) covered[c.memory.targetRoom] = true;
    }
    // reservers already queued but not yet spawned (spawn_list is a flat
    // [body, name, opts] x N array)
    const queue = room.memory.spawn_list || [];
    for(let i = 1; i < queue.length; i += 3) {
        if(typeof queue[i] === 'string' && queue[i].indexOf('Reserver-') === 0) {
            const opts = queue[i + 1];
            if(opts && opts.memory && opts.memory.targetRoom) covered[opts.memory.targetRoom] = true;
        }
    }
    if(myReservers.length >= 2) {
        return;
    }
    if(Memory.debugReserver) {
        console.log("[resvdbg]", room.name, "active=" + JSON.stringify(activeRemotes),
            "covered=" + JSON.stringify(Object.keys(covered)), "mine=" + myReservers.length);
    }
    _.forEach(resourceData, function(data, targetRoomName){
        if(activeRemotes.includes(targetRoomName)) {
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

                if(Memory.CanClaimRemote >= 3 && Game.rooms[targetRoomName] && Game.rooms[targetRoomName].controller && !Game.rooms[targetRoomName].controller.my && (Game.rooms[targetRoomName].controller.reservation && Game.rooms[targetRoomName].controller.reservation.ticksToEnd <= 750 || !Game.rooms[targetRoomName].controller.reservation)) {
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
                if(targetRoomName != room.name && Game.rooms[targetRoomName] != undefined && Game.rooms[targetRoomName].memory.roomData && !Game.rooms[targetRoomName].memory.roomData.has_hostile_creeps && !Game.rooms[targetRoomName].controller.my) {
                    // TIMING. Spawn shortly BEFORE the reservation lapses, not
                    // after. The old rungs keyed off `lastSpawnReserver` with
                    // CREEP_LIFE_TIME/2 == 750, but a CLAIM creep lives
                    // CREEP_CLAIM_LIFE_TIME == 600 — the re-spawn interval was
                    // LONGER than the creep's life, guaranteeing a coverage gap
                    // every single cycle on top of the walk out.
                    //
                    // Lead time = walk + spawn + slack. The replacement should
                    // arrive while the old reservation still has ticks on it.
                    const rsv = Game.rooms[targetRoomName].controller.reservation;
                    const walk = Math.max(20, Math.min(120, (values.pathLength || 50)));
                    const lead = walk + 40;
                    // `covered` already prevents a duplicate per room, so the
                    // stamp is only an anti-thrash guard for the spawn-failed case.
                    const notThrashing = Game.time - (values.lastSpawnReserver || 0) > 150;
                    const needNow = !rsv || rsv.ticksToEnd <= lead ||
                        (rsv.ticksToEnd < CONTROLLER_RESERVE_MAX - 600 && !anyReserverAlive(room, targetRoomName));

                    if(needNow && notThrashing) {

                        /*
                         * AFFORDABILITY, NOT AFFLUENCE.
                         *
                         * This used to be a flat `storage < 25000`. The reserver
                         * it guards costs 650 per CLAIM/MOVE pair — 1,950 at
                         * RCL6 — so the gate demanded a ~13x margin over the
                         * thing it was protecting, and it did so in the one
                         * situation where reserving pays best.
                         *
                         * That is a deadlock, not a safety margin. Live W2N1
                         * (RCL6, one in-room source, storage 0): remote W3N1 sat
                         * `reserved:false` and therefore at HALF source yield,
                         * which is precisely why storage could never climb to
                         * 25 000 — and the unreserved remote was the cause.
                         * reserverGate() itself passed the room (RCL6>=5,
                         * capacity 2300>=1300); this line was the whole blocker.
                         *
                         * So scale the floor to the body: enough banked to pay
                         * for the creep several times over and still have a
                         * cushion, but reachable by a room that is recovering.
                         * A room at 0 still cannot spawn one — nothing is
                         * force-spawned here — and the head-of-line relief
                         * (see spawnStall, ~line 3024) means a queued Reserver
                         * cannot hold the spawn hostage while it waits.
                         */
                        const reserverPairs = room.controller.level <= 4 ? 2
                            : room.controller.level == 5 ? 2
                            : room.controller.level == 6 ? 3
                            : room.controller.level == 7 ? 7 : 8;
                        const reserverCost = reserverPairs * (BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]);
                        const reserverFloor = Math.max(2000, reserverCost * 3);
                        if(room.memory.danger || (storage && storage.store[RESOURCE_ENERGY] < reserverFloor)) {
                            return;
                        }

                        // >=2 CLAIM or nothing: 1 CLAIM is net-zero against the
                        // 1/tick reservation decay (see reserverGate).
                        if(room.controller.level <= 4) {
                            if(room.energyCapacityAvailable < 1300) {
                                return;
                            }
                            room.memory.spawn_list.push([CLAIM,MOVE,CLAIM,MOVE], newName,
                                {memory: {role: 'reserve', targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding Reserver to Spawn List: ' + newName);
                            markSpawned();
                        }
                        else if(room.controller.level == 5) {
                            room.memory.spawn_list.push([CLAIM,MOVE,CLAIM,MOVE], newName,
                                {memory: {role: 'reserve', targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding Reserver to Spawn List: ' + newName);
                            markSpawned();
                        }
                        else if(room.controller.level == 6) {
                            room.memory.spawn_list.push([CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE], newName,
                                {memory: {role: 'reserve', targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding Reserver to Spawn List: ' + newName);
                            markSpawned();
                        }
                        else if(room.controller.level == 7) {
                            room.memory.spawn_list.push([CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE], newName,
                                {memory: {role: 'reserve', targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding Reserver to Spawn List: ' + newName);
                            markSpawned();
                        }
                        else if(room.controller.level == 8) {
                            room.memory.spawn_list.push([CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE], newName,
                                {memory: {role: 'reserve', targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding Reserver to Spawn List: ' + newName);
                            markSpawned();
                        }
                    }
                }
            });
        }
    });
}
export {getBody};
export default spawning;
