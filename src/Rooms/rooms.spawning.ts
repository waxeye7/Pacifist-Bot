import construction from "./rooms.construction";
function spawning(room: any) {
    if(Game.cpu.bucket < 1000) return;
    if(!room.memory.spawn_list) {
        room.memory.spawn_list = [];
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
    let hardCap = room.energyCapacityAvailable;
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
        // [CLAIM,MOVE] x N. Drop a whole pair off the end; a reserver with no
        // CLAIM is a 50 energy creep that walks to a remote and does nothing,
        // so [CLAIM,MOVE] is the floor and below it the entry just waits for
        // energy (it is deliberately exempt from the clear rungs).
        if((counts[CLAIM] || 0) <= 1) return false;
        counts[CLAIM] --;
        if(moves > 1) counts[MOVE] --;
    }
    else if(name && name.startsWith("EnergyMiner")) {
        // A miner is WORK-heavy on purpose; the WORK parts past the first two
        // are the expendable ones. 3 parts is the floor - 2 WORK + 1 MOVE still
        // mines 4 energy/tick, anything less is not worth the walk.
        if(body.length <= 3) return false;
        if((counts[CARRY] || 0) > 0) counts[CARRY] --;
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
    let storage = room.storage || Game.getObjectById(room.memory.Structures.storage) || room.findStorage();

    let resourceData = _.get(room.memory, ['resources']);




    const spawnrules = {

        1: {

            upgrade_creep: {

                amount: 6,
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
                body:   getBody([WORK,WORK,CARRY,MOVE], room),

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

                amount: 2,
                body:   getBody([WORK,WORK,WORK,WORK,CARRY,MOVE], room, 50),

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
    // Home room always counts. Remotes open at RCL3 (reserver bodies and the
    // remote-road budget both exist from there).
    //
    // This used to also require `!Memory.features.speedrun` — and speedrun
    // defaults to TRUE, so this branch silently reset every remote's `active`
    // flag every tick on every room, which is why no remote ever started
    // regardless of how much CPU was free. Speedrun now only suppresses
    // remotes below RCL3 (see utils/Speedrun.applySpeedrunSpawnHints).
    const remotesAllowed =
        room.controller &&
        room.controller.level >= 3;
    for(let remoteRoom of roomsToRemote) {
        if(remoteRoom == room.name) {
            activeRemotes.push(remoteRoom);
        } else if(roomResources[remoteRoom]?.active) {
            if (remotesAllowed) {
                activeRemotes.push(remoteRoom);
            } else {
                // force off until RCL3+
                roomResources[remoteRoom].active = false;
            }
        }
    }
    let constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES)
    let constructionSitesAmount = constructionSites.length;
    // extra upgraders bought by a storage surplus — 0 below the tier
    // thresholds, so every gate below keeps its old behaviour there
    let surplusUpgraders = surplusUpgraderTier(room);

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
    let upgraderEnergyFloor = storage && storage.store[RESOURCE_ENERGY] > 10000;

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
            if((fillers < spawnrules[1].filler_creep.amount || fillers < spawnrules[1].filler_creep.amount + 1 && activeRemotes.length > 1 || fillers < spawnrules[1].filler_creep.amount + 2 && activeRemotes.length > 2) && storage) {
                let name = 'Filler-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.unshift(spawnrules[1].filler_creep.body, name, {memory: {role: 'filler'}});
                console.log('Adding filler to Spawn List: ' + name);
            }
            spawn_energy_miner(resourceData, room, activeRemotes);
            spawn_carrier(resourceData, room, spawn, storage, activeRemotes);
            if(EnergyMiners < 1) {
                break;
            }
            if(builders < spawnrules[1].build_creep.amount && sites.length > 0 && carriers > 1 && EnergyMinersInRoom > 1) {
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
            if((fillers < spawnrules[2].filler_creep.amount || fillers < spawnrules[2].filler_creep.amount + 1 && activeRemotes.length > 1 || fillers < spawnrules[2].filler_creep.amount + 2 && activeRemotes.length > 2) && storage) {
                let name = 'Filler-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.unshift(spawnrules[2].filler_creep.body, name, {memory: {role: 'filler'}});
                console.log('Adding filler to Spawn List: ' + name);
            }
            spawn_energy_miner(resourceData, room, activeRemotes);
            spawn_carrier(resourceData, room, spawn, storage, activeRemotes);
            if(repairers < spawnrules[2].repair_creep.amount && carriers > 1 && EnergyMinersInRoom > 1 && !room.memory.danger && room.controller.progress > 4500) {
                let name = 'Repair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[2].repair_creep.body, name, {memory: {role: 'repair', homeRoom: room.name}});
                console.log('Adding Repair to Spawn List: ' + name);
            }
            if(builders < spawnrules[2].build_creep.amount && sites.length > 0 && carriers > 1 && EnergyMinersInRoom > 1) {
                let name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[2].build_creep.body, name, {memory: {role: 'builder'}});
                console.log('Adding Builder to Spawn List: ' + name);
            }
            if(upgraders < spawnrules[2].upgrade_creep.amount && !room.memory.danger && (sitesMayNotVetoUpgraders || room.controller.ticksToDowngrade < 1500)) {
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
            if((fillers < spawnrules[3].filler_creep.amount || fillers < spawnrules[3].filler_creep.amount + 1 && activeRemotes.length > 1 || fillers < spawnrules[3].filler_creep.amount + 2 && activeRemotes.length > 2) && storage) {
                let name = 'Filler-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.unshift(spawnrules[3].filler_creep.body, name, {memory: {role: 'filler'}});
                console.log('Adding filler to Spawn List: ' + name);
            }
            spawn_energy_miner(resourceData, room, activeRemotes);
            spawn_carrier(resourceData, room, spawn, storage, activeRemotes);
            if(repairers < spawnrules[3].repair_creep.amount && carriers > 1 && EnergyMinersInRoom > 1 && !room.memory.danger) {
                let name = 'Repair-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[3].repair_creep.body, name, {memory: {role: 'repair', homeRoom: room.name}});
                console.log('Adding Repair to Spawn List: ' + name);
            }
            if(builders < spawnrules[3].build_creep.amount && sites.length > 0 && carriers > 1 && EnergyMinersInRoom > 1) {
                let name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[3].build_creep.body, name, {memory: {role: 'builder'}});
                console.log('Adding Builder to Spawn List: ' + name);
            }
            if(upgraders < spawnrules[3].upgrade_creep.amount && !room.memory.danger && (sitesMayNotVetoUpgraders || room.controller.ticksToDowngrade < 1500)) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[3].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }
            else if(upgraders < spawnrules[3].upgrade_creep.amount + 6 && storage && storage.store.getFreeCapacity() < 200 && !room.memory.danger) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[3].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }
            if(maintainers < spawnrules[3].maintain_creep.amount && !room.memory.danger && (room.memory.keepTheseRoads && room.memory.keepTheseRoads.length > 0 || spawnMaintainer)) {
                if(spawnMaintainer) {
                    let name = 'Maintainer-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push(spawnrules[3].maintain_creep.body, name, {memory: {role: 'maintainer', homeRoom: room.name}});
                    console.log('Adding Maintainer to Spawn List: ' + name);
                }
                else {
                    if(room.memory.keepTheseRoads.length > 0) {
                        for(let roadID of room.memory.keepTheseRoads) {
                            let road:any = Game.getObjectById(roadID);
                            if(road && road.hits <= 2000) {
                                let name = 'Maintainer-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                                room.memory.spawn_list.push(spawnrules[3].maintain_creep.body, name, {memory: {role: 'maintainer', homeRoom: room.name}});
                                console.log('Adding Maintainer to Spawn List: ' + name);
                                break;
                            }
                        }
                    }
                }


            }
            break;

        case 4:
            if((fillers < spawnrules[4].filler_creep.amount || fillers < spawnrules[4].filler_creep.amount + 1 && (activeRemotes.length > 1 || room.memory.danger && room.energyAvailable < room.energyCapacityAvailable/1.5) || fillers < spawnrules[4].filler_creep.amount + 2 && activeRemotes.length > 2) && storage) {
                let name = 'Filler-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.unshift(spawnrules[4].filler_creep.body, name, {memory: {role: 'filler'}});
                console.log('Adding filler to Spawn List: ' + name);
            }
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
            // Storage floor is 10k, not 20k: a room that hovers in the 10-20k band
            // spawns no upgrader at all and controller progress freezes outright.
            // 10k feeds one upgrader comfortably; the surplus tier below is what
            // scales with real surplus.
            if(upgraders < spawnrules[4].upgrade_creep.amount && (!storage || storage.store[RESOURCE_ENERGY] > 100000 || storage.store[RESOURCE_ENERGY] > 10000 && !rampartsInRoom.filter(function(s) {return s.hits < 900000}).length || upgraders < 1 && room.controller.ticksToDowngrade < CONTROLLER_DOWNGRADE[room.controller.level] / 2) && !room.memory.danger && (sitesMayNotVetoUpgraders || room.controller.ticksToDowngrade < 21000)) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[4].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }
            // Surplus tier: >60k banked at RCL4. Deliberately NOT gated on
            // constructionSitesAmount — that gate is what froze E11S5 at 778k.
            else if(surplusUpgraders > 0 && upgraders < spawnrules[4].upgrade_creep.amount + surplusUpgraders && !room.memory.danger) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[4].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Surplus Upgrader to Spawn List: ' + name);
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
            let bin:any = Game.getObjectById(room.memory.Structures.bin);
            if(EnergyManagers < 1 && storage && bin && bin.store.getFreeCapacity() == 0) {
                let name = 'EnergyManager-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.unshift([CARRY,MOVE], name, {memory: {role: 'EnergyManager'}});
                console.log('Adding Energy Manager to Spawn List: ' + name);
            }


            if((fillers < spawnrules[5].filler_creep.amount || fillers < spawnrules[5].filler_creep.amount + 1 && activeRemotes.length > 1 || fillers < spawnrules[5].filler_creep.amount + 2 && activeRemotes.length > 2) && storage) {
                let name = 'Filler-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.unshift(spawnrules[5].filler_creep.body, name, {memory: {role: 'filler'}});
                console.log('Adding filler to Spawn List: ' + name);
            }
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
            // Storage floor is 10k, not 30k: live E17S4 sat at 20-29k banked for
            // 20+ minutes with ZERO upgraders because nothing satisfied the 30k
            // gate, so controller progress stopped completely. The last clause is
            // a hard floor — one upgrader regardless of storage once the
            // controller is below half its downgrade timer for this level.
            if(upgraders < spawnrules[5].upgrade_creep.amount && !room.memory.danger && storage && storage.store[RESOURCE_ENERGY] > 10000
                || room.controller.ticksToDowngrade < 6000 && upgraders < spawnrules[5].upgrade_creep.amount && !room.memory.danger
                || upgraders < 1 && room.controller.ticksToDowngrade < CONTROLLER_DOWNGRADE[room.controller.level] / 2 && !room.memory.danger) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[5].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Upgrader to Spawn List: ' + name);
            }
            // Surplus tier: >60k banked at RCL5 buys one upgrader on top
            else if(surplusUpgraders > 0 && upgraders < spawnrules[5].upgrade_creep.amount + surplusUpgraders && !room.memory.danger) {
                let name = 'Upgrader-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                room.memory.spawn_list.push(spawnrules[5].upgrade_creep.body, name, {memory: {role: 'upgrader'}});
                console.log('Adding Surplus Upgrader to Spawn List: ' + name);
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
            // Was 120k — effectively blocked all building at early RCL6 (roads/labs never finished)
            if(builders < spawnrules[6].build_creep.amount && sites.length > 0 && (EnergyMinersInRoom > 1 || bankCanBuild) && (storage && storage.store[RESOURCE_ENERGY] > 8000 || !storage)) {
                let allowSpawn = true;
                let spawnSmall = false;
                // Prefer building real structures (roads/ext/labs) over rampart-only spam
                let hasUsefulSite = false;
                for(let site of sites) {
                    if(site.structureType !== STRUCTURE_RAMPART) {
                        hasUsefulSite = true;
                        allowSpawn = true;
                        spawnSmall = false;
                        break;
                    }
                    else {
                        allowSpawn = false;
                        spawnSmall = true;
                    }
                }
                if(allowSpawn || hasUsefulSite) {
                    let name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push(spawnrules[6].build_creep.body, name, {memory: {role: 'builder'}});
                    console.log('Adding Builder to Spawn List: ' + name);
                }
                else if(!allowSpawn && spawnSmall && builders < 1) {
                    let name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push([WORK,CARRY,MOVE], name, {memory: {role: 'builder'}});
                    console.log('Adding Builder to Spawn List: ' + name);
                }
            }
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
            if(builders < spawnrules[7].build_creep.amount && !room.memory.danger && room.memory.danger_timer == 0 && sites.length > 0 && (EnergyMinersInRoom > 1 || bankCanBuild) && (storage && storage.store[RESOURCE_ENERGY] > 15000 || !storage)) {
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
                    room.memory.spawn_list.push(spawnrules[7].build_creep.body, name, {memory: {role: 'builder'}});
                    console.log('Adding Builder to Spawn List: ' + name);
                }
                else if(!allowSpawn && spawnSmall && builders < 1) {
                    let name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push([WORK,CARRY,MOVE], name, {memory: {role: 'builder'}});
                    console.log('Adding Builder to Spawn List: ' + name);
                }
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

    if(healers < 1 && room.memory.Structures.towers.length === 0) {
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



    if(room.memory.Structures.controllerLink && room.controller.level !== 8 && room.controller.level >= 3) {
        let controllerLink:any = Game.getObjectById(room.memory.Structures.controllerLink);
        if(Game.time % 70 < 12 && controllerLink && controllerLink.store[RESOURCE_ENERGY] <= 100 && storage && storage.store[RESOURCE_ENERGY] > 1000) {
            let name = 'ControllerLinkFiller-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift(getBody([CARRY,CARRY,CARRY,CARRY,MOVE], room, 20), name, {memory: {role: 'ControllerLinkFiller'}});
            console.log('Adding ControllerLinkFiller to Spawn List: ' + name);
        }
    }


    if(room.controller.level >= 5 && !storage && builders < 5) {
        let name = 'Builder-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
        room.memory.spawn_list.push(getBody([WORK,CARRY,MOVE], room, 50), name, {memory: {role: 'builder'}});
        console.log('Adding Builder to Spawn List: ' + name);
    }




    if(RampartErectors < 1 && storage && room.controller.level >= 6 && storage.store[RESOURCE_ENERGY] > 12000 && room.memory.construction && room.memory.construction.rampartLocations && room.memory.construction.rampartLocations.length > 0) {
        let newName = 'RampartErector-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
        room.memory.spawn_list.push(getBody([WORK,CARRY,MOVE], room, 50), newName, {memory: {role: 'RampartErector', rampartLocations:room.memory.construction.rampartLocations}});
        console.log('Adding RampartErector to Spawn List: ' + newName);
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
                if((Object.keys(room.memory.resources[remoteRoom]).length == 0 ||
                Object.keys(room.memory.resources[remoteRoom]).length == 1) &&
                room.memory.resources[remoteRoom].active &&
                !room.memory.resources[remoteRoom].energy
                ) {
                    if(scouts < 1 && EnergyMinersInRoom > 1) {
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
                room.memory.spawn_list.push(getBody([WORK, CARRY, CARRY, CARRY, MOVE], room, 50), newName, {memory: {role: 'buildcontainer', targetRoom: target_colonise, homeRoom: room.name}});
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
    const looseLootCount =
        room.find(FIND_DROPPED_RESOURCES, { filter: (r) => r.amount >= 50 }).length +
        room.find(FIND_TOMBSTONES, { filter: (t) => _.sum(t.store) > 0 }).length +
        room.find(FIND_RUINS, { filter: (r) => _.sum(r.store) > 0 }).length;
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
    let storage = Game.getObjectById(room.memory.Structures.storage);
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
            // How long the spawn has sat IDLE. room.memory.lastTimeSpawnUsed is
            // a Game.time STAMP (see the top of spawning()), so the shrink rungs
            // below used to compare ~2.09 MILLION against 305 and were therefore
            // permanently true: every carrier/miner/reserver that answered -6
            // once got shrunk on the spot, whatever the room's real situation.
            let spawnIdleFor = Game.time - (room.memory.lastTimeSpawnUsed || Game.time);

            // ...but that stamp is COARSE: it only advances when the spawn
            // finishes a creep with an EMPTY queue, so any room whose queue
            // stays busy reads "idle" forever and every unaffordable
            // carrier/miner head would collapse to its floor in six consecutive
            // ticks. Two more conditions make the rung mean what it says. The
            // head must actually be the thing that is stuck - 40 consecutive
            // -6 answers, the same bar the interleave rung uses, though this
            // deliberately does NOT touch spawnStall itself - and a body walks
            // DOWN one step per 40 ticks, so the room gets a fair chance to
            // afford each smaller version before the next step is taken.
            let mayShrinkHead = room.memory.spawnStall > 40
                && Game.time - (room.memory.lastShrink || 0) > 40;
            if(spawnAttempt == -6) {

                let storage = Game.getObjectById(room.memory.Structures.storage);
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

                if((room.memory.spawn_list[0].length >= 4
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
                spawnIdleFor > 305 && room.memory.spawn_list[1].startsWith("Carrier") && room.energyAvailable < room.memory.spawn_list[0].length * 50 && room.memory.spawn_list[0].length > 3 ||
                spawnIdleFor > 305 && room.memory.spawn_list[1].startsWith("EnergyMiner") && room.energyAvailable < room.memory.spawn_list[0].length * 100  && room.memory.spawn_list[0].length > 3 ||
                spawnIdleFor > 205 && room.memory.spawn_list[1].startsWith("Reserver") && room.memory.spawn_list[0].length > 2)) {
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
                // So after the head has answered -6 for 40 ticks straight, walk
                // a few entries down and spawn the first one the room can
                // actually pay for. Memory is NOT reordered - the head keeps
                // its first claim on the spawn every following tick, it just
                // stops holding the whole room hostage while it waits. The scan
                // is capped at 5 entries so a long war queue cannot make this
                // expensive.
                if(room.memory.spawnStall > 40
                && room.memory.spawn_list.length >= 6
                && room.memory.spawn_list[1] === headName) {
                    let scanned = 0;
                    for(let i = 3; i + 2 < room.memory.spawn_list.length && scanned < 5; i += 3) {
                        scanned++;
                        let candidate:string[] = room.memory.spawn_list[i];
                        if(!candidate || !candidate.length) continue;
                        let cost = _.sum(candidate, (part:any) => BODYPART_COST[part]);
                        if(cost > room.energyAvailable || cost > room.energyCapacityAvailable) continue;
                        if(spawn.spawnCreep(candidate, room.memory.spawn_list[i+1], room.memory.spawn_list[i+2]) == 0) {
                            console.log("spawn head", headName, "unaffordable for", room.memory.spawnStall, "ticks - interleaving", room.memory.spawn_list[i+1], room.name);
                            room.memory.spawn_list.splice(i, 3);
                            room.memory.data.c_spawned++;
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
    if(!storage || !storage.my) return 0;
    if(room.memory.danger) return 0;
    let energy = storage.store[RESOURCE_ENERGY] || 0;
    let level = room.controller.level;
    if(level >= 8) return 0;
    if(level >= 6) {
        if(level == 7 && energy > 250000) return 2;
        return energy > 120000 ? 1 : 0;
    }
    if(level >= 4) return energy > 60000 ? 1 : 0;
    return 0;
}

function getBody(segment:string[], room, bodyMaxLength=50) {
    let body = [];
    let segmentCost = _.sum(segment, s => BODYPART_COST[s]);
    let energyAvailable = room.energyAvailable;

    // never 0 segments: an energy dip at queue time would emit an EMPTY body,
    // and spawnCreep([]) fails -10 forever (the queue re-adds it each pass).
    // With one segment minimum the spawner just waits -6 until affordable.
    let maxSegments = Math.max(1, Math.floor(energyAvailable / segmentCost));
    _.times(maxSegments, function() {if(segment.length + body.length <= bodyMaxLength){_.forEach(segment, s => body.push(s));}});

    return body;
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

    let threeWorkParts = 6;
    let sixWorkParts = 12;


    if(carriersInRoom.length == 0 && !storage) {
        return [CARRY,CARRY,MOVE];
    }


    if(targetSource == null || !values.pathLength) {
        return [];
    }

    if(targetSource.room.name == room.name) {
        let ticksPerRoundTrip = (values.pathLength * 2) + 2;
        let energyProducedPerRoundTrip = sixWorkParts * ticksPerRoundTrip
        let body = [];
        let alternate = 1;
        while (energyProducedPerRoundTrip > 0) {
            body.push(CARRY);
            if((body.length * 50) == room.energyCapacityAvailable && alternate % 2 == 0) {
                while(body.length > 50) {
                    body.pop();
                }
                return body;
            }
            else if((body.length * 50) == room.energyCapacityAvailable && alternate % 2 == 1) {
                body.pop();
                while(body.length > 50) {
                    body.pop();
                }
                return body;
            }

            if(alternate % 2 == 1) {
                body.push(MOVE);
                if((body.length * 50) == room.energyCapacityAvailable) {
                    body.pop();
                    body.pop();
                    while(body.length > 50) {
                        body.pop();
                    }
                    return body;
                }
            }
            energyProducedPerRoundTrip = energyProducedPerRoundTrip - 50;
            alternate = alternate + 1;
        }
        // console.log(body,room.name)

        return body;
    }
    else {
        if(room.controller.level >= 5) {
            threeWorkParts = sixWorkParts;
        }
        let ticksPerRoundTrip = (values.pathLength * 2) + 2;
        let energyProducedPerRoundTrip = threeWorkParts * ticksPerRoundTrip
        let body = [];
        let alternate = 1;
        while (energyProducedPerRoundTrip > 0 && (body.length * 50) <= (room.energyCapacityAvailable-100)) {
            body.push(CARRY);
            if((body.length * 50) == room.energyCapacityAvailable && alternate % 2 == 0) {
                while(body.length > 50) {
                    body.pop();
                }
                return body;
            }
            else if((body.length * 50) == room.energyCapacityAvailable && alternate % 2 == 1) {
                body.pop();
                while(body.length > 50) {
                    body.pop();
                }
                return body;
            }

            if(alternate % 2 == 1) {
                body.push(MOVE);
                if((body.length * 50) == room.energyCapacityAvailable) {
                    body.pop();
                    body.pop();
                    while(body.length > 50) {
                        body.pop();
                    }
                    return body;
                }
            }
            energyProducedPerRoundTrip = energyProducedPerRoundTrip - 50;
            alternate = alternate + 1;
        }
        // console.log(body,room.name)
        while(body.length > 50) {
            body.pop();
        }
        return body;
    }
}



function spawn_energy_miner(resourceData:any, room, activeRemotes) {
    let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();

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

                if(index == 1 && room.controller.progress == 0 && room.controller.level == 1 && room.memory.data.DOB <= 60) {
                    let newName = 'Sweeper-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push([CARRY,MOVE], newName, {memory: {role: 'sweeper'}});
                    console.log('Adding Sweeper to Spawn List: ' + newName);
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
                        if(!Game.rooms[targetRoomName] || Game.rooms[targetRoomName] == undefined || Game.rooms[targetRoomName].memory.roomData && Game.rooms[targetRoomName].memory.roomData.has_hostile_creeps == true) {
                            room.memory.spawn_list.unshift([WORK,WORK,MOVE], newName,
                                {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                            console.log('Adding Energy Miner to Spawn List: ' + newName);
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
                if(!Game.rooms[targetRoomName] || room.name != targetRoomName && room.memory.danger || Game.rooms[targetRoomName] && Game.rooms[targetRoomName].memory.roomData && Game.rooms[targetRoomName].memory.roomData.has_hostile_creeps) {
                    return;
                }
                // self-heal rooms already parked on the forever-cutoff while
                // their links do not actually haul (set before this guard existed)
                if((values.lastSpawnCarrier || 0) > Game.time && targetRoomName == room.name && !sourceLinkHaulWorks(room, sourceId)) {
                    values.lastSpawnCarrier = 0;
                }
                if (Game.time - (values.lastSpawnCarrier || 0) > CREEP_LIFE_TIME) {
                    let newName = 'Carrier-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    let bodyForCarrier = getCarrierBody(sourceId, values, storage, spawn, room);
                    room.memory.spawn_list.push(bodyForCarrier, newName,
                        {memory: {role: 'carry', sourceId, targetRoom: targetRoomName, homeRoom: room.name, pathLength:values.pathLength}});
                    console.log('Adding Carrier to Spawn List: ' + newName);
                    if(Game.rooms[targetRoomName] && Game.rooms[targetRoomName].controller != undefined && Game.rooms[targetRoomName].controller.level >= 6 && targetRoomName == room.name
                    && sourceLinkHaulWorks(room, sourceId)) {
                        values.lastSpawnCarrier = 5000000000;
                    }
                    else if(bodyForCarrier && bodyForCarrier.length > 0) {
                        if(bodyForCarrier.length <= 5) {
                            values.lastSpawnCarrier = Game.time-750;
                        }
                        else {
                            values.lastSpawnCarrier = Game.time;
                        }

                    }
                }

                if(Game.time - (values.lastSpawnCarrier || 0) > CREEP_LIFE_TIME*2) {
                    let newName = 'Carrier-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push([MOVE,CARRY,CARRY], newName,
                        {memory: {role: 'carry', sourceId, targetRoom: targetRoomName, homeRoom: room.name, pathLength:values.pathLength}});
                    console.log('Adding Carrier to Spawn List: ' + newName);
                    values.lastSpawnCarrier = Game.time-700;
                }

                if(!values.lastSpawnCarrier && Game.time < CREEP_LIFE_TIME) {
                    let newName = 'Carrier-'+ Math.floor(Math.random() * Game.time) + "-" + room.name;
                    room.memory.spawn_list.push([MOVE,CARRY,CARRY], newName,
                        {memory: {role: 'carry', sourceId, targetRoom: targetRoomName, homeRoom: room.name, pathLength:values.pathLength}});
                    console.log('Adding Carrier to Spawn List: ' + newName);
                    values.lastSpawnCarrier = Game.time-600;
                }
                if(room.controller.level <= 5 && room.memory.Structures && room.memory.Structures.container) {
                    let container:any = Game.getObjectById(room.memory.Structures.container);
                    if(container && container.store.getFreeCapacity() == 0) {
                        values.lastSpawnCarrier -= 200;
                    }
                }
            });
        }

    });
}

function spawn_remote_repairer(resourceData, room, activeRemotes) {
    _.forEach(resourceData, function(data, targetRoomName){
        if(activeRemotes.includes(targetRoomName)) {
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

function spawn_reserver(resourceData, room, storage, activeRemotes, reservers) {
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

                if(targetRoomName != room.name && Game.rooms[targetRoomName] != undefined && Game.rooms[targetRoomName].memory.roomData && !Game.rooms[targetRoomName].memory.roomData.has_hostile_creeps && !Game.rooms[targetRoomName].controller.my) {
                    if(Game.rooms[targetRoomName] != undefined && Game.rooms[targetRoomName].controller.reservation && Game.rooms[targetRoomName].controller.reservation.ticksToEnd <= 1000 && Game.time - (values.lastSpawnReserver || 0) > CREEP_LIFE_TIME/2 ||
                    Game.rooms[targetRoomName] != undefined && !Game.rooms[targetRoomName].controller.reservation && Game.time - (values.lastSpawnReserver || 0) > CREEP_LIFE_TIME/4) {

                        if(room.memory.danger || (storage && storage.store[RESOURCE_ENERGY] < 25000)) {
                            return;
                        }

                        // RCL3/4 had NO branch at all here, so an RCL3-4 commune
                        // could never reserve a remote no matter what else was
                        // true. One CLAIM/MOVE pair is 650e — affordable from
                        // RCL3 (800 cap) and enough to hold a reservation.
                        if(room.controller.level <= 4) {
                            if(room.energyCapacityAvailable < 650) {
                                return;
                            }
                            room.memory.spawn_list.push([CLAIM,MOVE], newName,
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
