import randomWords from "random-words";

function isInRoom(creep, room) {
    return creep.room.name == room.name;
  }


// function randomName(length) {
//     let result = '';
//     let characters;
//     if(Game.time % 2 == 0) {
//         characters = 'pacifistbotPACIFISTBOT';
//     }
//     else if(Game.time % 2 == 1) {
//         characters = 'waxeye7WAXEYE7';
//     }
//     let charactersLength = characters.length;
//     for (let i = 0; i < length; i++) {
//       result += characters.charAt(Math.floor(Math.random() * charactersLength));
//     }
//    return result;
// }



function getBody(segment:string[], room, bodyMaxLength=50) {
    let body = [];
    let segmentCost = _.sum(segment, s => BODYPART_COST[s]);
    let energyAvailable = room.energyAvailable;

    let maxSegments = Math.floor(energyAvailable / segmentCost);
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
    let carriersInRoom = _.filter(Game.creeps, (creep) => creep.memory.role == 'carry' && creep.room.name == room.name);

    if(storage != undefined && !values.pathLength) {
        pathFromHomeToSource = storage.pos.findPathTo(targetSource, {ignoreCreeps: true, ignoreRoads: false});
        values.pathLength = pathFromHomeToSource.length - 1;
    }
    else if (spawn != undefined && !values.pathLength) {
        pathFromHomeToSource = spawn.pos.findPathTo(targetSource, {ignoreCreeps: true, ignoreRoads: false});
        values.pathLength = pathFromHomeToSource.length - 1;
    }

    let threeWorkParts = 6;
    let fiveWorkParts = 10;


    if(carriersInRoom.length == 0 && storage == undefined) {
        return [CARRY,CARRY,MOVE];
    }


    if(targetSource == null || !values.pathLength) {
        return [];
    }

    if(targetSource.room.name == room.name) {
        let ticksPerRoundTrip = (values.pathLength * 2) + 2;
        let energyProducedPerRoundTrip = fiveWorkParts * ticksPerRoundTrip
        let body = [];
        let alternate = 1;
        while (energyProducedPerRoundTrip > 0) {
            body.push(CARRY);
            if((body.length * 50) == room.energyCapacityAvailable && alternate % 2 == 0) {
                return body;
            }
            else if((body.length * 50) == room.energyCapacityAvailable && alternate % 2 == 1) {
                body.pop();
                return body;
            }

            if(alternate % 2 == 1) {
                body.push(MOVE);
                if((body.length * 50) == room.energyCapacityAvailable) {
                    body.pop();
                    body.pop();
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
            threeWorkParts = fiveWorkParts;
        }
        let ticksPerRoundTrip = (values.pathLength * 2) + 2;
        let energyProducedPerRoundTrip = threeWorkParts * ticksPerRoundTrip
        let body = [];
        let alternate = 1;
        while (energyProducedPerRoundTrip > -50 && (body.length * 50) <= (room.energyCapacityAvailable-100)) {
            body.push(CARRY);
            if(alternate % 2 == 1) {
                body.push(MOVE);
            }
            energyProducedPerRoundTrip -= 50;
            alternate = alternate + 1;
            // if(body.length * 50 + 200 >= energyAvailable) {
            //     console.log("room not enough energy", body);
            //     return body;
            // }
        }
        // console.log(body,room.name)
        return body;
    }
}


function spawn_energy_miner(resourceData, room) {
    _.forEach(resourceData, function(data, targetRoomName){
        _.forEach(data.energy, function(values, sourceId) {
            if (Game.time - (values.lastSpawn || 0) > CREEP_LIFE_TIME) {
                let newName = 'EnergyMiner-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
                if(targetRoomName == room.name) {
                    if(room.energyCapacityAvailable >= 650) {
                        if(room.controller.level > 6 && !room.memory.danger) {
                            // [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,WORK,CARRY,MOVE]
                            room.memory.spawn_list.unshift([WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,WORK,CARRY,MOVE], newName,
                                {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                        }
                        else if(room.controller.level == 6 || (room.controller.level > 6 && room.memory.danger)) {
                            room.memory.spawn_list.unshift([WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,WORK,CARRY,MOVE], newName,
                                {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                        }
                        else {
                            room.memory.spawn_list.unshift([WORK,WORK,WORK,WORK,WORK,WORK,MOVE], newName,
                                {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                        }
                        console.log('Adding Energy Miner to Spawn List: ' + newName);
                        values.lastSpawn = Game.time;
                    }

                    else if(room.energyCapacityAvailable >= 550) {
                        if(room.controller.level >= 6) {
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

                    else {
                        room.memory.spawn_list.unshift(getBody([WORK,WORK,MOVE], room, 9), newName, {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                        console.log('Adding Energy Miner to Spawn List: ' + newName);
                        values.lastSpawn = Game.time;
                        return;
                        // fix bug here when respawning in new room, it runs through both sources and adds the value last spawn to both sources even though only one spawns.
                    }
                }

                else {
                    if(targetRoomName != room.name && room.memory.danger) {
                        return;
                    }
                    let storage = Game.getObjectById(room.memory.storage) || room.findStorage();

                    if(!Game.rooms[targetRoomName] || Game.rooms[targetRoomName] == undefined || Game.rooms[targetRoomName].memory.has_hostile_creeps == true) {
                        room.memory.spawn_list.push([WORK,WORK,MOVE], newName,
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
                        values.lastSpawn = Game.time-50;
                    }
                }
            }

            if(Game.time - (values.lastSpawn || 0) > CREEP_LIFE_TIME*3) {
                let newName = 'EnergyMiner-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
                room.memory.spawn_list.unshift([WORK,WORK,MOVE], newName,
                    {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                console.log('Adding Energy Miner to Spawn List: ' + newName);
                values.lastSpawn = Game.time;
            }


            if(!values.lastSpawn && Game.time < CREEP_LIFE_TIME) {
                let newName = 'EnergyMiner-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
                room.memory.spawn_list.unshift([WORK,WORK,MOVE], newName,
                    {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                console.log('Adding Energy Miner to Spawn List: ' + newName);
                values.lastSpawn = Game.time;
            }
        });
    });
}


function spawn_carrier(resourceData, room, spawn, storage) {
    _.forEach(resourceData, function(data, targetRoomName){
        _.forEach(data.energy, function(values, sourceId) {
            if(!Game.rooms[targetRoomName] || room.name != targetRoomName && room.memory.danger || Game.rooms[targetRoomName] && Game.rooms[targetRoomName].memory.has_hostile_creeps) {
                return;
            }
            if (Game.time - (values.lastSpawnCarrier || 0) > CREEP_LIFE_TIME) {
                let newName = 'Carrier-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
                room.memory.spawn_list.push(getCarrierBody(sourceId, values, storage, spawn, room), newName,
                    {memory: {role: 'carry', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                console.log('Adding Carrier to Spawn List: ' + newName);
                if(Game.rooms[targetRoomName] && Game.rooms[targetRoomName].controller != undefined && Game.rooms[targetRoomName].controller.level >= 6) {
                    values.lastSpawnCarrier = 5000000000;
                }
                else {
                    values.lastSpawnCarrier = Game.time;
                }
            }

            if(Game.time - (values.lastSpawnCarrier || 0) > CREEP_LIFE_TIME*2) {
                let newName = 'Carrier-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
                room.memory.spawn_list.push([MOVE,CARRY,CARRY], newName,
                    {memory: {role: 'carry', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                console.log('Adding Carrier to Spawn List: ' + newName);
                values.lastSpawnCarrier = Game.time-600;
            }

            if(!values.lastSpawnCarrier && Game.time < CREEP_LIFE_TIME) {
                let newName = 'Carrier-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
                room.memory.spawn_list.push([MOVE,CARRY,CARRY], newName,
                    {memory: {role: 'carry', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                console.log('Adding Carrier to Spawn List: ' + newName);
                values.lastSpawnCarrier = Game.time-600;
            }
        });
    });
}

function spawn_remote_repairer(resourceData, room) {
    _.forEach(resourceData, function(data, targetRoomName){
        _.forEach(data.energy, function(values, sourceId) {
            if(Game.time - (values.lastSpawnRemoteRepairer || 0) > CREEP_LIFE_TIME * 2) {
                let newName = 'RemoteRepairer-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
                if(targetRoomName != room.name && Game.rooms[targetRoomName] && !Game.rooms[targetRoomName].memory.has_hostile_creeps) {

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
                            values.lastSpawnRemoteRepairer = Game.time + 700;
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
                            values.lastSpawnRemoteRepairer = Game.time + 600;
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
                            values.lastSpawnRemoteRepairer = Game.time + 400;
                        }
                    }
                    else {
                        room.memory.spawn_list.push([WORK,CARRY,MOVE], newName,
                            {memory: {role: 'RemoteRepair', targetRoom: targetRoomName, homeRoom: room.name}});
                        console.log('Adding RemoteRepairer to Spawn List: ' + newName);
                        values.lastSpawnRemoteRepairer = Game.time-500;
                    }
                }
            }
        });
    });
}

function spawn_reserver(resourceData, room, storage) {
    _.forEach(resourceData, function(data, targetRoomName){
        _.forEach(data.energy, function(values, sourceId) {
            let newName = 'Reserver-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;

            if(Memory.CanClaimRemote && Game.rooms[targetRoomName] && Game.rooms[targetRoomName].controller && !Game.rooms[targetRoomName].controller.my && Game.rooms[targetRoomName].controller.reservation && Game.rooms[targetRoomName].controller.reservation.ticksToEnd <= 750) {
                if(room.memory.danger) {
                    return;
                }
                room.memory.spawn_list.push([CLAIM,MOVE], newName,
                    {memory: {role: 'reserve', targetRoom: targetRoomName, homeRoom: room.name, claim: true}});
                console.log('Adding Reserver to Spawn List: ' + newName);
                values.lastSpawnReserver = Game.time;
                Memory.CanClaimRemote = false;
                return;
            }

            else if(targetRoomName != room.name && Game.rooms[targetRoomName] != undefined && !Game.rooms[targetRoomName].memory.has_hostile_creeps && !Game.rooms[targetRoomName].controller.my) {
                if(Game.rooms[targetRoomName] != undefined && Game.rooms[targetRoomName].controller.reservation && Game.rooms[targetRoomName].controller.reservation.ticksToEnd <= 1000 && Game.time - (values.lastSpawnReserver || 0) > CREEP_LIFE_TIME/2 ||
                Game.rooms[targetRoomName] != undefined && !Game.rooms[targetRoomName].controller.reservation && Game.time - (values.lastSpawnReserver || 0) > CREEP_LIFE_TIME/4) {

                    if(room.memory.danger || (storage && storage.store[RESOURCE_ENERGY] < 25000)) {
                        return;
                    }

                    if(room.controller.level == 5) {
                        room.memory.spawn_list.push([CLAIM,MOVE,CLAIM,MOVE], newName,
                            {memory: {role: 'reserve', targetRoom: targetRoomName, homeRoom: room.name}});
                        console.log('Adding Reserver to Spawn List: ' + newName);
                        values.lastSpawnReserver = Game.time;
                    }
                    else if(room.controller.level == 6) {
                        room.memory.spawn_list.push([CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE], newName,
                            {memory: {role: 'reserve', targetRoom: targetRoomName, homeRoom: room.name}});
                        console.log('Adding Reserver to Spawn List: ' + newName);
                        values.lastSpawnReserver = Game.time;
                    }
                    else if(room.controller.level == 7) {
                        room.memory.spawn_list.push([CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE], newName,
                            {memory: {role: 'reserve', targetRoom: targetRoomName, homeRoom: room.name}});
                        console.log('Adding Reserver to Spawn List: ' + newName);
                        values.lastSpawnReserver = Game.time;
                    }
                    else if(room.controller.level == 8) {
                        room.memory.spawn_list.push([CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE,CLAIM,MOVE], newName,
                            {memory: {role: 'reserve', targetRoom: targetRoomName, homeRoom: room.name}});
                        console.log('Adding Reserver to Spawn List: ' + newName);
                        values.lastSpawnReserver = Game.time;
                    }
                }
            }
        });
    });
}



function add_creeps_to_spawn_list(room, spawn) {
    let EnergyMiners = 0;
    let EnergyMinersInRoom = 0;

    let carriers = 0;
    let carriersInRoom = 0;

    let reservers = 0;

    let EnergyManagers = 0;

    let MineralMiners = 0;

    let builders = 0;
    let upgraders = 0;
    let fillers = 0;
    let repairers = 0;

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

    let RampartDefenders = 0;

    _.forEach(Game.creeps, function(creep) {
        // console.log(creep.memory.role)
        switch(creep.memory.role) {

            case "EnergyMiner":
                if(isInRoom(creep, room)) {
                    EnergyMinersInRoom ++;
                    EnergyMiners ++;
                    break;
                }

            case "EnergyMiner":
                EnergyMiners ++;
                break;

            case "carry":
                if(isInRoom(creep, room)) {
                    carriersInRoom ++;
                    carriers ++;
                    break;
                }

            case "carry":
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

            case "Dismantler":
                if(isInRoom(creep, room)) {
                    Dismantlers ++;
                    break;
                }

            case "scout":
                scouts ++;
                break;

            case "claimer":
                claimers ++;
                break;

            case "attacker":
                attackers ++;
                break;

            case "RangedAttacker":
                RangedAttackers ++;
                break;

            case "buildcontainer":
                containerbuilders ++;
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

            case "sweeper":
                if(isInRoom(creep, room)) {
                    sweepers ++;
                    break;
                }
        }

    });


    console.log("Room-" + room.name + " has " + builders + " Builders " + upgraders +
    " Upgraders " + repairers + " Repairers " + fillers
    + " Filler", EnergyManagers, "EnergyManager", sweepers, "Sweeper");
    console.log("[" + EnergyMiners + " Energy-Miners]" + " [" + carriers +
    " Carriers] [" +  RemoteRepairers, "RemoteRepairers] [" + reservers + " Reservers] " + "[" + attackers + " Attackers]" + " [" + RangedAttackers +  " RangedAttackers]" + " [" + containerbuilders +  " Container Builders]");
    // console.log(DrainTowers, "tower drainers ;)")

    let upgraderTargetAmount = _.get(room.memory, ['census', 'upgrader'], 1);

    let preRCL5UpgraderTarget = _.get(room.memory, ['census', 'upgrader'], 3);

    let builderTargetAmount = _.get(room.memory, ['census', 'builder'], 2);
    let builderPreRCL4TargetAmount = _.get(room.memory, ['census', 'builder'], 5);

    let fillerTargetAmount = _.get(room.memory, ['census', 'filler'], 1);
    let fillerRCL6TargetAmount = _.get(room.memory, ['census', 'filler'], 2);

    let repairerTargetAmount = _.get(room.memory, ['census', 'repair'], 1);

    let sites = room.find(FIND_CONSTRUCTION_SITES);

    let storage = Game.getObjectById(room.memory.storage) || room.findStorage();

    let resourceData = _.get(room.memory, ['resources']);

    spawn_energy_miner(resourceData, room);

    spawn_carrier(resourceData, room, spawn, storage);

    spawn_remote_repairer(resourceData, room);

    spawn_reserver(resourceData, room, storage);


    if(DrainTowers < 0 && room.energyCapacityAvailable > 5200 && Game.map.getRoomLinearDistance(room.name, "E15S37") <= 5) {
        let newName = 'rewotreniard-' + randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push([TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                                MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                                MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,RANGED_ATTACK,
                                HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,
                                HEAL,HEAL,HEAL,HEAL,HEAL], newName,
            {memory: {role: 'DrainTower', targetRoom: "E15S38", homeRoom: room.name}});
        console.log('Adding Tower Drainer to Spawn List: ' + newName);
    }

    if (scouts < 0) {
        let newName = 'Scout-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push([MOVE], newName, {memory: {role: 'scout'}});
        console.log('Adding Scout to Spawn List: ' + newName);
    }

    if (MineralMiners < 1 && room.controller.level >= 6 && room.memory.extractor && !room.memory.danger && storage && storage.store[RESOURCE_ENERGY] > 100000) {
        let mineral = Game.getObjectById(room.memory.mineral) || room.findMineral();
        if(mineral.mineralAmount > 0) {
            let newName = 'MineralMiner-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
            room.memory.spawn_list.push(getBody([WORK,CARRY,MOVE], room, 40), newName, {memory: {role: 'MineralMiner'}});
            console.log('Adding Mineral Miner to Spawn List: ' + newName);
        }
    }

    if(room.controller.level <= 3 && sites.length > 0 && builders < builderPreRCL4TargetAmount && carriers > 1 && EnergyMinersInRoom > 1) {
        let newName = 'Builder-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push(getBody([WORK,CARRY,MOVE], room), newName, {memory: {role: 'builder'}});
        console.log('Adding Builder to Spawn List: ' + newName);
    }

    if(sites.length > 0 && builders < builderTargetAmount && EnergyMinersInRoom > 1 && storage && storage.store[RESOURCE_ENERGY] > 15000 && room.controller.level >= 4) {
        let newName = 'Builder-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push(getBody([WORK,CARRY,CARRY,CARRY,MOVE], room, 50), newName, {memory: {role: 'builder'}});
        console.log('Adding Builder to Spawn List: ' + newName);
    }


    // if(room.controller.level == 8) {
    //     if(upgraders < 1) {
    //         let newName = 'Upgrader-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
    //         room.memory.spawn_list.push([WORK,CARRY,MOVE], newName, {memory: {role: 'upgrader'}});
    //         console.log('Adding Upgrader to Spawn List: ' + newName);
    //     }
    // }

    if(EnergyMinersInRoom > 1 && upgraders < upgraderTargetAmount && room.controller.level >= 7 && !room.memory.danger) {
        let newName = 'Upgrader-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        if(storage && storage.store[RESOURCE_ENERGY] > 450000) {
            room.memory.spawn_list.push(getBody([WORK,WORK,WORK,WORK,CARRY,MOVE], room, 6), newName, {memory: {role: 'upgrader'}});
        }
        else {
            room.memory.spawn_list.push(getBody([WORK,WORK,CARRY,MOVE], room, 4), newName, {memory: {role: 'upgrader'}});
        }
        console.log('Adding Upgrader to Spawn List: ' + newName);
    }

    else if(storage && storage.store[RESOURCE_ENERGY] > 800000 && upgraders < upgraderTargetAmount + 1 && EnergyMinersInRoom > 1 && room.controller.level >= 7 && !room.memory.danger) {
        let newName = 'Upgrader-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push(getBody([WORK,WORK,WORK,CARRY,MOVE], room, 30), newName, {memory: {role: 'upgrader'}});
        console.log('Adding Upgrader to Spawn List: ' + newName);
    }

    else if(carriers > 1 && EnergyMinersInRoom > 1 && upgraders < upgraderTargetAmount ||
        storage && storage.store[RESOURCE_ENERGY] > 800000 && upgraders < upgraderTargetAmount + 4 && EnergyMinersInRoom > 1 && !room.memory.danger ||
        room.controller.level <= 4 && upgraders < preRCL5UpgraderTarget && carriers > 1 && EnergyMinersInRoom > 1 && storage && storage.store[RESOURCE_ENERGY] > 50000 && !room.memory.danger ||
        room.controller.level <= 4 && upgraders < preRCL5UpgraderTarget && carriers > 1 && EnergyMinersInRoom > 1 && storage == undefined && !room.memory.danger ||
        room.controller.level <= 4 && upgraders < preRCL5UpgraderTarget && carriers > 1 && EnergyMinersInRoom > 1 && storage && storage.store.getFreeCapacity() <= 2000 && !room.memory.danger) {
        let newName = 'Upgrader-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push(getBody([WORK,CARRY,MOVE], room, 40), newName, {memory: {role: 'upgrader'}});
        console.log('Adding Upgrader to Spawn List: ' + newName);
    }
    else if(carriers > 1 && EnergyMinersInRoom > 1 && storage && storage.store.getFreeCapacity() < 200 && !room.memory.danger && upgraders < 10) {
        let newName = 'Upgrader-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push(getBody([WORK,CARRY,MOVE], room, 25), newName, {memory: {role: 'upgrader'}});
        console.log('Adding Upgrader to Spawn List: ' + newName, "because storage is full");
    }

    if((repairers < repairerTargetAmount && room.controller.level > 1) ||
    (storage && storage.store[RESOURCE_ENERGY] > 750000 && repairers < repairerTargetAmount + 1) ||
    (room.memory.danger == true && repairers < 6 && room.controller.level > 4 && storage && storage.store[RESOURCE_ENERGY] > 50000)) {
        if(EnergyMinersInRoom > 1) {
            let newName = 'Repair-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
            if(storage && storage.store[RESOURCE_ENERGY] > 750000 || room.memory.danger) {
                room.memory.spawn_list.push(getBody([WORK,CARRY,MOVE], room, 50), newName, {memory: {role: 'repair', homeRoom: room.name}});
            }
            else {
                room.memory.spawn_list.push(getBody([WORK,CARRY,MOVE], room, 20), newName, {memory: {role: 'repair', homeRoom: room.name}});
            }
            console.log('Adding Repairer to Spawn List: ' + newName + "-" + room.name);
        }
    }

    if(room.memory.danger == true && RampartDefenders < 6 && fillers >= 2 && repairers > 2 && room.find(FIND_HOSTILE_CREEPS).length > 1 || room.memory.danger == true && RampartDefenders < 1 && fillers >= 2 && repairers > 2) {
        let addtolist = true;
        let HostileCreeps = room.find(FIND_HOSTILE_CREEPS);
        let found = false;
        for(let enemyCreep of HostileCreeps) {
            for(let part of enemyCreep.body) {
                if(part.type == ATTACK) {
                    found = true;
                }
            }
        }
        if(found == false && RampartDefenders == 1) {
            addtolist = false;
        }
        if(addtolist) {
            let newName = 'RampartDefender-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
            if(room.controller.level >= 7) {
                let body;
                if(found == false) {
                    body = [ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE]
                }
                if(found == true) {
                    body = [ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE];
                }
                room.memory.spawn_list.push(body, newName, {memory: {role: 'RampartDefender', homeRoom: room.name}});
            }
            else {
                let body = getBody([ATTACK,ATTACK,ATTACK,ATTACK,MOVE], room, 50)
                room.memory.spawn_list.push(body, newName, {memory: {role: 'RampartDefender', homeRoom: room.name}});
            }
            console.log('Adding RampartDefender to Spawn List: ' + newName);
        }
    }

    if(room.memory.danger == true && defenders < 4 && RampartDefenders >= 4 || RampartDefenders == 1 && room.memory.danger == true && defenders < 6) {
        let HostileCreeps = room.find(FIND_HOSTILE_CREEPS);
        let found = false;
        for(let enemyCreep of HostileCreeps) {
            for(let part of enemyCreep.body) {
                if(part.type == ATTACK) {
                    found = true;
                }
            }
        }
        if(found == false && defenders < 6) {
            let newName = 'Defender-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
            room.memory.spawn_list.push(getBody([RANGED_ATTACK,RANGED_ATTACK,MOVE], room, 50), newName, {memory: {role: 'defender', homeRoom: room.name}});
            console.log('Adding Defender to Spawn List: ' + newName);
        }
        else if (found == true && RampartDefenders >= 4) {
            let newName = 'Defender-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
            room.memory.spawn_list.push(getBody([RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,MOVE], room, 50), newName, {memory: {role: 'defender', homeRoom: room.name}});
            console.log('Adding Defender to Spawn List: ' + newName);
        }
    }

    // || Memory.DistressSignals && Memory.DistressSignals.reinforce_me && attackers < 5 && storage.store[RESOURCE_ENERGY] > 500000
    // if(attackers < 1 && !room.memory.danger && repairers > 1 && fillers > 3) {
    //     let newName = 'Attacker-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
    //     room.memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
    //                                     ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK
    //                                     ,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK], newName, {memory: {role: 'attacker', targetRoom: Memory.DistressSignals.reinforce_me || room.name, homeRoom:room.name}});
    //     console.log('Adding Attacker to Spawn List: ' + newName);
    // }
    // TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK

    if(claimers < 0) {
        let newName = 'Claimer-' + randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push([MOVE,CLAIM], newName, {memory: {role: 'claimer', targetRoom: "E44N58"}});
        console.log('Adding Claimer to Spawn List: ' + newName);
    }



// reformat this part into loop through my rooms and then see if it has a spawn and if not if it has a spawn construction site then spawn builders
    // _.forEach(Game.rooms, function(NonSpawnRoom) {
    //     if(everyRoom && everyRoom.memory && !everyRoom.memory.danger && everyRoom.find(FIND_MY_CONSTRUCTION_SITES).length == 0) {
    //         everyRoom.memory.keepTheseRoads = [];
    //     }
    // });
    if(containerbuilders < 0 && room.controller.level > 6 && Game.map.getRoomLinearDistance(room.name, "E41N58") <= 10) {
        let newName = 'ContainerBuilder-' + randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push(getBody([WORK,CARRY,MOVE], room), newName, {memory: {role: 'buildcontainer', targetRoom: "E41N58", homeRoom: room.name}});
        console.log('Adding ContainerBuilder to Spawn List: ' + newName);
    }




    if(RemoteDismantlers < 0 && Game.map.getRoomLinearDistance(room.name, "E15S37") <= 2) {
        let newName = 'RemoteDismantler-' + randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push([MOVE,WORK,WORK,WORK,WORK], newName, {memory: {role: 'RemoteDismantler', targetRoom: "E15S37"}});
        console.log('Adding RemoteDismantler to Spawn List: ' + newName);
    }

    if(room.controller.level <= 4 && Dismantlers < 0) {
        let newName = 'Dismantler-' + randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push(getBody([WORK,WORK,WORK,WORK,MOVE], room), newName, {memory: {role: 'Dismantler'}});
        console.log('Adding Dismantler to Spawn List: ' + newName);
    }

    if(healers < 0) {
        let newName = 'Healer-' + randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push([HEAL,HEAL,HEAL,HEAL,HEAL,MOVE,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'healer', targetRoom: "E14S36"}});
        console.log('Adding Healer to Spawn List: ' + newName);
    }


    if(annoyers < 0 && Game.map.getRoomLinearDistance(room.name, "E47N59") <= 2) {
        let newName = 'Annoy-' + randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push([ATTACK,MOVE], newName, {memory: {role: 'annoy', targetRoom: "E47N59"}});
        console.log('Adding Annoyer to Spawn List: ' + newName);
    }

    // if(annoyers < 1 && room.memory.danger && room.find(FIND_MY_CREEPS).length <= 2) {
    //     let newName = 'Annoy-' + randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
    //     room.memory.spawn_list.unshift([ATTACK,ATTACK,MOVE,MOVE], newName, {memory: {role: 'annoy', targetRoom: room.name, homeRoom: room.name}});
    //     console.log('Adding Annoyer to Spawn List: ' + newName);
    //     return;
    // }


    // if(room.controller.level > 5 && sweepers < 3 && room.memory.danger == false && (room.find(FIND_DROPPED_RESOURCES).length + room.find(FIND_TOMBSTONES, {filter: tombstone => tombstone.store[RESOURCE_ENERGY] > 0}).length) > 4) {
    //     let newName = 'Sweeper-' + randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
    //     room.memory.spawn_list.push([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, {memory: {role: 'sweeper'}});
    //     console.log('Adding Sweeper to Spawn List: ' + newName);
    // }
    let droppedPLUStombs = (room.find(FIND_DROPPED_RESOURCES).length + room.find(FIND_TOMBSTONES, {filter: tombstone => tombstone.store[RESOURCE_ENERGY] > 0}).length + 1);
    if(room.controller.level >= 6 && room.memory.danger == false && sweepers < Math.floor(droppedPLUStombs/3)) {
        let newName = 'Sweeper-' + randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, {memory: {role: 'sweeper'}});
        console.log('Adding Sweeper to Spawn List: ' + newName);
    }

    // if(RangedAttackers < 1) {
    //     let newName = 'RangedAttacker-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
    //     room.memory.spawn_list.push([TOUGH,TOUGH,TOUGH,TOUGH,
    //                                 MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
    //                                 RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
    //                                 RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
    //                                 HEAL,HEAL], newName, {memory: {role: 'RangedAttacker', targetRoom: "E12S38", homeRoom: room.name}});
    //     console.log('Adding Defending-Ranged-Attacker to Spawn List: ' + newName);
    // }


    _.forEach(resourceData, function(data, targetRoomName) {
        if(!room.memory.danger && !Game.rooms[targetRoomName] && Memory.tasks.wipeRooms.killCreeps.includes(targetRoomName) && attackers < 1) {
            let newName = 'Attacker-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
            room.memory.spawn_list.push(getBody([MOVE,ATTACK,ATTACK], room, 12), newName, {memory: {role: 'attacker', targetRoom: targetRoomName, homeRoom:room.name}});
            console.log('Adding Defending-Attacker to Spawn List: ' + newName);
        }
    });

    _.forEach(Game.rooms, function(thisRoom) {
        _.forEach(resourceData, function(data, targetRoomName) {
            if(thisRoom.name == targetRoomName && !room.memory.danger) {
                if(thisRoom.memory.has_hostile_structures && !thisRoom.memory.has_hostile_creeps && !thisRoom.memory.has_attacker && thisRoom.controller && !thisRoom.controller.my && attackers < 2) {
                    let newName = 'Attacker-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
                    room.memory.spawn_list.push(getBody([ATTACK,ATTACK,MOVE], room, 15), newName, {memory: {role: 'attacker', targetRoom: thisRoom.name, homeRoom:room.name}});
                    console.log('Adding Defending-Attacker to Spawn List: ' + newName);
                    thisRoom.memory.has_hostile_structures = false;
                }


                if(room.controller.level <= 4 && thisRoom.memory.has_safe_creeps && !thisRoom.memory.has_attacker && thisRoom.controller && !thisRoom.controller.my && RangedAttackers < 1 && thisRoom.find(FIND_HOSTILE_CREEPS).length == 1) {
                    let newName = 'RangedAttacker-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
                    room.memory.spawn_list.push([MOVE,RANGED_ATTACK], newName, {memory: {role: 'RangedAttacker', targetRoom: thisRoom.name, homeRoom: room.name}});
                    console.log('Adding Annoying-Ranged-Attacker to Spawn List: ' + newName);
                    thisRoom.memory.has_safe_creeps = false;
                }
                else if(room.controller.level <= 4 && thisRoom.memory.has_safe_creeps && !thisRoom.memory.has_attacker && thisRoom.controller && !thisRoom.controller.my && attackers < 1 && thisRoom.find(FIND_HOSTILE_CREEPS).length > 1) {
                    let newName = 'Attacker-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
                    room.memory.spawn_list.push([MOVE,ATTACK], newName, {memory: {role: 'attacker', targetRoom: thisRoom.name, homeRoom: room.name}});
                    console.log('Adding Annoying-Attacker to Spawn List: ' + newName);
                    thisRoom.memory.has_safe_creeps = false;
                }


                // if(thisRoom.memory.has_hostile_creeps && !thisRoom.memory.has_attacker && thisRoom.controller && !thisRoom.controller.my && RangedAttackers < 1) {
                //     let newName = 'RangedAttacker-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
                //     room.memory.spawn_list.push(getBody([MOVE,RANGED_ATTACK,RANGED_ATTACK], room, 20), newName, {memory: {role: 'RangedAttacker', targetRoom: thisRoom.name, homeRoom: room.name}});
                //     console.log('Adding Defending-Ranged-Attacker to Spawn List: ' + newName);
                //     thisRoom.memory.has_hostile_creeps = false;
                // }

                // if(room.controller.level >= 7 && thisRoom.memory.has_hostile_creeps && !thisRoom.memory.has_attacker && thisRoom.controller && !thisRoom.controller.my && RangedAttackers < 1) {
                //     let newName = 'RangedAttacker-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
                //     room.memory.spawn_list.push([TOUGH,TOUGH,TOUGH,TOUGH,
                //                                 MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                //                                 RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                //                                 RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                //                                 HEAL,HEAL,HEAL], newName, {memory: {role: 'RangedAttacker', targetRoom: thisRoom.name, homeRoom: room.name}});
                //     console.log('Adding Defending-Ranged-Attacker to Spawn List: ' + newName);
                //     thisRoom.memory.has_hostile_creeps = false;
                // }
            }
        });
    });
                // if(thisRoom.memory.has_hostile_creeps && !thisRoom.memory.has_attacker && thisRoom.controller && !thisRoom.controller.my && RangedAttackers < 1) {
                //     let newName = 'RangedAttacker-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
                //     room.memory.spawn_list.push(getBody([MOVE,RANGED_ATTACK], room, 20), newName, {memory: {role: 'RangedAttacker', targetRoom: thisRoom.name, homeRoom: room.name}});
                //     console.log('Adding Defending-Ranged-Attacker to Spawn List: ' + newName);
                //     thisRoom.memory.has_hostile_creeps = false;
                // }
                // else if(thisRoom.memory.has_hostile_creeps && !thisRoom.memory.has_attacker && thisRoom.controller && !thisRoom.controller.my && RangedAttackers < 3 && Game.time - thisRoom.memory.first_offence > 200) {
                // if(Game.map.getRoomLinearDistance(room.name, thisRoom.name) <= 2) {
                //     let newName = 'RangedAttacker-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
                //     room.memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,HEAL,HEAL,HEAL,HEAL,HEAL], newName, {memory: {role: 'RangedAttacker', targetRoom: thisRoom.name, homeRoom: room.name}});
                //     console.log('Adding Defending-Ranged-Attacker to Spawn List: ' + newName);
                //     thisRoom.memory.has_hostile_creeps = false;
                //     }
                // }

    // let labIDS = room.memory.labs;

    // let ThreeLabs = []

    // labIDS.forEach(lab => {
    //     ThreeLabs.push(Game.getObjectById(lab));
    // });

    // let resultLab = ThreeLabs[0];
    let resultLab = undefined
    // || EnergyManagers < 4 && room.controller.level >= 6 && room.memory.labs.length == 3 && firstLab && firstLab.store[RESOURCE_UTRIUM] <= 500
    if(storage && EnergyManagers < 1 && room.controller.level >= 6 || storage && storage.store[RESOURCE_ENERGY] < 100000 && EnergyManagers < 2 && room.controller.level >= 6 || storage && EnergyManagers < 2 && room.memory.danger && resultLab && resultLab.store[RESOURCE_UTRIUM_HYDRIDE] < 1200) {
        let newName = 'EnergyManager-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        if(room.memory.danger) {
            room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'EnergyManager'}});
        }
        else if(storage && storage.store[RESOURCE_ENERGY] < 150000) {
            room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, {memory: {role: 'EnergyManager'}});
        }
        else {
            room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE], newName, {memory: {role: 'EnergyManager'}});
        }
        console.log('Adding Energy Manager to Spawn List: ' + newName);
    }


    if(room.controller.level < 4 && fillers < fillerTargetAmount && storage && storage.store[RESOURCE_ENERGY] != 0) {
        let newName = 'Filler-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.unshift([CARRY,MOVE], newName, {memory: {role: 'filler'}});
        console.log('Adding filler to Spawn List: ' + newName);
    }

    else if(room.controller.level == 5 && fillers < 1 && storage && storage.store[RESOURCE_ENERGY] != 0) {
        let newName = 'Filler-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.unshift([CARRY,MOVE], newName, {memory: {role: 'filler'}});
        console.log('Adding filler to Spawn List: ' + newName);
    }
    else if(room.controller.level == 5 && fillers < 2 && storage && storage.store[RESOURCE_ENERGY] != 0) {
        let newName = 'Filler-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.unshift([CARRY,CARRY,MOVE], newName, {memory: {role: 'filler'}});
        console.log('Adding filler to Spawn List: ' + newName);
    }

    else if((room.controller.level >= 4 && room.controller.level <= 5 && fillers < 1 && storage && storage.store[RESOURCE_ENERGY] != 0) ||
        (room.controller.level >= 4 && room.controller.level <= 5 && fillers < 2 && storage && storage.store[RESOURCE_ENERGY] != 0 && room.energyAvailable < room.energyCapacityAvailable)) {
        let newName = 'Filler-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.unshift([CARRY,MOVE], newName, {memory: {role: 'filler'}});
        console.log('Adding filler to Spawn List: ' + newName);
    }
    else if(room.memory.danger && fillers < 4 && room.energyAvailable < room.energyCapacityAvailable && storage && storage.store[RESOURCE_ENERGY] != 0) {
        let newName = 'Filler-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, {memory: {role: 'filler'}});
        console.log('Adding filler to Spawn List: ' + newName);
    }

    else if (fillers < fillerTargetAmount && storage && storage.store[RESOURCE_ENERGY] != 0 ||
    room.controller.level >= 6 && fillers < fillerRCL6TargetAmount && room.energyAvailable < room.energyCapacityAvailable && storage && storage.store[RESOURCE_ENERGY] != 0) {
        let newName = 'Filler-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.unshift([CARRY,CARRY,MOVE], newName, {memory: {role: 'filler'}});
        console.log('Adding filler to Spawn List: ' + newName);
    }
}




function spawnFirstInLine(room, spawn) {
    if(room.memory.spawn_list.length >= 1) {
        let spawnAttempt = spawn.spawnCreep(room.memory.spawn_list[0],room.memory.spawn_list[1], room.memory.spawn_list[2]);
        if(spawnAttempt == 0) {
            console.log("spawning", room.memory.spawn_list[1], "creep", room.name);
            room.memory.spawn_list.shift();
            room.memory.spawn_list.shift();
            room.memory.spawn_list.shift();
            return "spawning";
        }
        else {
            console.log("spawning", room.memory.spawn_list[1], "creep error", spawnAttempt, room.name);
            let segment:string[] = room.memory.spawn_list[0]
            if(spawnAttempt == -6 && Game.time % 2 == 0) {
                if(room.memory.spawn_list[0].length >= 4
                && !room.memory.spawn_list[1].startsWith("Carrier")
                && !room.memory.spawn_list[1].startsWith("EnergyMiner")
                // && !room.memory.spawn_list[1].startsWith("RemoteRepairer")
                // && !room.memory.spawn_list[1].startsWith("Reserver")
                || _.sum(segment, s => BODYPART_COST[s]) > room.energyCapacityAvailable
                || room.memory.spawn_list[1].startsWith("Defender")) {

                    room.memory.spawn_list.shift();
                    room.memory.spawn_list.shift();
                    room.memory.spawn_list.shift();

                }
                else if(room.memory.lastTimeSpawnUsed > 205 && room.memory.spawn_list[1].startsWith("Carrier") && room.energyAvailable < room.memory.spawn_list[0].length * 50 && room.memory.spawn_list[0].length > 3 ||
                room.memory.lastTimeSpawnUsed > 205 && room.memory.spawn_list[1].startsWith("EnergyMiner") && room.energyAvailable < room.memory.spawn_list[0].length * 100  && room.memory.spawn_list[0].length > 3) {
                room.memory.lastTimeSpawnUsed > 105 && room.memory.spawn_list[1].startsWith("Reserver") && room.memory.spawn_list[0].length > 1 ||
                // room.memory.lastTimeSpawnUsed > 205 && room.memory.spawn_list[1].startsWith("RemoteRepairer") && room.energyAvailable < room.memory.spawn_list[0].length * 100  && room.memory.spawn_list[0].length > 3) {
                    room.memory.spawn_list[0].shift();
                    // change to delete last one
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
        return "list empty";
    }

}



function spawning(room: any) {

    if(!room.memory.spawn_list) {
        room.memory.spawn_list = [];
    }

    if(!room.memory.lastTimeSpawnUsed) {
        room.memory.lastTimeSpawnUsed = 0;
    }


    // console.log(room.memory.spawn_list.length/3, "creeps in spawn queue in room", room.name);

    let spawn: any = Game.getObjectById(room.memory.spawn)
    if(spawn && spawn.spawning && spawn.spawning.remainingTime == 1 && room.memory.spawn_list.length == 0) {
        room.memory.lastTimeSpawnUsed = Game.time;
    }


    spawn = Game.getObjectById(room.memory.spawn) || room.findSpawn();

    if(spawn == undefined) {
        delete room.memory.spawn;
        return;
    }

    if(spawn.spawning) {
        spawn = room.findSpawn();
        if(spawn == undefined) {
            return;
        }
    }

    let status = spawnFirstInLine(room, spawn);
    if(status == "spawning") {
        return;
    }

    // console.log(Game.time - room.memory.lastTimeSpawnUsed, "ticks since last time spawn was active ⛄", room.name)

    if(room.memory.spawn_list.length == 0 && Game.time - room.memory.lastTimeSpawnUsed == 3 ||
        !room.memory.danger && room.memory.spawn_list.length == 0 && (Game.time - room.memory.lastTimeSpawnUsed) % 47 == 0 && room.controller.level >= 6 ||
        !room.memory.danger && room.memory.spawn_list.length == 0 && (Game.time - room.memory.lastTimeSpawnUsed) % 25 == 0 && room.controller.level <= 5 ||
        !room.memory.danger && room.memory.spawn_list.length >= 1 && (Game.time - room.memory.lastTimeSpawnUsed) % 2600 == 0 ||
        room.memory.danger && (Game.time - room.memory.lastTimeSpawnUsed) % 7 == 0 && room.memory.spawn_list.length == 0) {

    // if(room.memory.spawn_list.length == 0 && Game.time - room.memory.lastTimeSpawnUsed == 3 ||
    //     room.memory.spawn_list.length == 0 && (Game.time - room.memory.lastTimeSpawnUsed) % 47 == 0 ||
    //     room.memory.spawn_list.length >= 1 && (Game.time - room.memory.lastTimeSpawnUsed) % 2600 == 0 ) {
            add_creeps_to_spawn_list(room, spawn);
    }
}
export default spawning;


        // console.log('Carry Ran in', Game.cpu.getUsed() - start, 'ms')

        // let worker_people = [];
        // for(let creep in Game.creeps) {
        //     if(Game.creeps[creep].memory.role == 'worker' && Game.creeps[creep].memory.homeRoom == room.name) {
        //         worker_people.push(Game.creeps[creep]);
        //    }
        // }

        // let totalWorkPartsOnWorkers = 0;
        // for(let worker in worker_people) {
        //     for (let part in worker_people[worker].body)
        //     if((worker_people[worker].body[part].type) == "work") {
        //         totalWorkPartsOnWorkers = totalWorkPartsOnWorkers + 1;
        //     }
        // }

        // console.log(totalWorkPartsOnWorkers + " in room " + room.name)
