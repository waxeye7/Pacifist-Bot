import randomWords from "random-words";
import { runInThisContext } from "vm";

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

    if(Game.time % 11 == 0) {
        delete values.pathLength;
    }

    let targetSource:any = Game.getObjectById(sourceId);
    let pathFromHomeToSource;
    let distanceToSource;
    let carriersInRoom = _.filter(Game.creeps, (creep) => creep.memory.role == 'carry' && creep.room.name == room.name);

    if(storage != undefined && !values.pathLength) {
        pathFromHomeToSource = storage.pos.findPathTo(targetSource, {ignoreCreeps: true, ignoreRoads: false});
        values.pathLength = pathFromHomeToSource.length;
    }
    else if (spawn != undefined && !values.pathLength) {
        pathFromHomeToSource = spawn.pos.findPathTo(targetSource, {ignoreCreeps: true, ignoreRoads: false});
        distanceToSource = pathFromHomeToSource.length;
    }

    if(values.pathLength) {
        distanceToSource = values.pathLength;
    }

    let threeWorkParts = 6;
    let fiveWorkParts = 10;


    if(carriersInRoom.length == 0 && storage == undefined) {
        return [CARRY,CARRY,MOVE];
    }

    if(targetSource == null) {
        let body = getBody([CARRY,CARRY,MOVE], room);
        return body;
    }

    if(targetSource.room.name == room.name) {
        let ticksPerRoundTrip = (distanceToSource * 2) + 2;
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
        let ticksPerRoundTrip = (distanceToSource * 2) + 2;
        let energyProducedPerRoundTrip = threeWorkParts * ticksPerRoundTrip
        let body = [];
        let alternate = 1;
        while (energyProducedPerRoundTrip > -50 && (body.length * 50) <= (room.energyCapacityAvailable-100)) {
            body.push(CARRY);
            if(alternate % 2 == 1) {
                body.push(MOVE);
            }
            energyProducedPerRoundTrip = energyProducedPerRoundTrip - 50;
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
                        if(room.controller.level == 6) {
                            room.memory.spawn_list.unshift([WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE], newName,
                                {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                        }
                        else if(room.controller.level > 6) {
                            room.memory.spawn_list.unshift([WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName,
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
                        room.memory.spawn_list.unshift([WORK,WORK,WORK,WORK,WORK,MOVE], newName,
                            {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                        console.log('Adding Energy Miner to Spawn List: ' + newName);
                        values.lastSpawn = Game.time;
                    }

                    else {
                        room.memory.spawn_list.unshift([WORK,WORK,MOVE], newName,
                            {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                        console.log('Adding Energy Miner to Spawn List: ' + newName);
                        values.lastSpawn = Game.time;
                        // fix bug here when respawning in new room, it runs through both sources and adds the value last spawn to both sources even though only one spawns.
                    }
                }

                else {
                    if(room.energyCapacityAvailable >= 500) {
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

            if(Game.time - (values.lastSpawn || 0) > CREEP_LIFE_TIME*2) {
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
            if (Game.time - (values.lastSpawnCarrier || 0) > CREEP_LIFE_TIME) {
                let newName = 'Carrier-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
                room.memory.spawn_list.push(getCarrierBody(sourceId, values, storage, spawn, room), newName,
                    {memory: {role: 'carry', targetRoom: targetRoomName, homeRoom: room.name}});
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
                    {memory: {role: 'carry', targetRoom: targetRoomName, homeRoom: room.name}});
                console.log('Adding Carrier to Spawn List: ' + newName);
                values.lastSpawnCarrier = Game.time-600;
            }

            if(!values.lastSpawnCarrier && Game.time < CREEP_LIFE_TIME) {
                let newName = 'Carrier-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
                room.memory.spawn_list.push([MOVE,CARRY,CARRY], newName,
                    {memory: {role: 'carry', targetRoom: targetRoomName, homeRoom: room.name}});
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
                if(targetRoomName != room.name) {
                    if(room.energyCapacityAvailable >= 600) {
                        room.memory.spawn_list.push([WORK,CARRY,MOVE,WORK,CARRY,MOVE,WORK,CARRY,MOVE], newName,
                            {memory: {role: 'RemoteRepair', targetRoom: targetRoomName, homeRoom: room.name}});
                        console.log('Adding RemoteRepairer to Spawn List: ' + newName);
                        values.lastSpawnRemoteRepairer = Game.time+1000;
                    }

                    else if(room.energyCapacityAvailable >= 400) {
                        room.memory.spawn_list.push([WORK,CARRY,MOVE,WORK,CARRY,MOVE], newName,
                            {memory: {role: 'RemoteRepair', targetRoom: targetRoomName, homeRoom: room.name}});
                        console.log('Adding RemoteRepairer to Spawn List: ' + newName);
                        values.lastSpawnRemoteRepairer = Game.time;
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

function add_creeps_to_spawn_list(room, spawn) {
    let EnergyMiners = 0;
    let EnergyMinersInRoom = 0;

    let carriers = 0;
    let carriersInRoom = 0;

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
        }

    });


    console.log("Room-" + room.name + " has " + builders + " Builders " + upgraders +
    " Upgraders " + repairers + " Repairers " + fillers
    + " Fillers");
    console.log("[" + EnergyMiners + " Energy-Miners]" + " [" + carriers +
    " Carriers] [" +  RemoteRepairers, "RemoteRepairers] [" + attackers + " Attackers]" + " [" + RangedAttackers +  " RangedAttackers]" + " [" + containerbuilders +  " Container Builders]");
    console.log(DrainTowers, "tower drainers ;)")

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


    if(DrainTowers < 0 && room.energyCapacityAvailable > 5200) {
        let newName = 'rewotreniard-' + randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push([TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH, MOVE,MOVE,MOVE,MOVE,MOVE,
                                MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                                MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                                HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,
                                HEAL,HEAL,HEAL,HEAL,HEAL], newName,
            {memory: {role: 'DrainTower', targetRoom: "E9S34", homeRoom: room.name}});
        console.log('Adding Tower Drainer to Spawn List: ' + newName);
    }

    if (scouts < 0) {
        let newName = 'Scout-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push([MOVE], newName, {memory: {role: 'scout'}});
        console.log('Adding Scout to Spawn List: ' + newName);
    }

    if (MineralMiners < 1 && room.controller.level >= 6 && room.memory.extractor) {
        let mineral = Game.getObjectById(room.memory.mineral) || room.findMineral();
        if(mineral.mineralAmount > 0) {
            let newName = 'MineralMiner-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
            room.memory.spawn_list.push([WORK,WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE], newName, {memory: {role: 'MineralMiner'}});
            console.log('Adding Mineral Miner to Spawn List: ' + newName);
        }
    }

    if(sites.length > 0 && builders < builderTargetAmount && carriers > 1 && EnergyMinersInRoom > 1 ||
        room.controller.level < 4 && sites.length > 0 && builders < builderPreRCL4TargetAmount && carriers > 1 && EnergyMinersInRoom > 1) {
        let newName = 'Builder-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push(getBody([WORK,CARRY,MOVE], room, 30), newName, {memory: {role: 'builder'}});
        console.log('Adding Builder to Spawn List: ' + newName);
    }

    // TODO make builder double carry parts at higher RCl and low RCL make sure he can still spawn.


    if(room.controller.level == 8) {
        if(upgraders < 1) {
            let newName = 'Upgrader-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
            room.memory.spawn_list.push([WORK,CARRY,MOVE], newName, {memory: {role: 'upgrader'}});
            console.log('Adding Upgrader to Spawn List: ' + newName);
        }
    }
    else if(carriers > 1 && EnergyMinersInRoom > 1 && upgraders < upgraderTargetAmount || (storage && storage.store[RESOURCE_ENERGY] > 500000 && upgraders < upgraderTargetAmount + 4) && EnergyMinersInRoom > 1 || (room.controller.level <= 4 && upgraders < preRCL5UpgraderTarget && carriers > 1 && EnergyMinersInRoom > 1)) {
        let newName = 'Upgrader-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push(getBody([WORK,CARRY,MOVE], room, 20), newName, {memory: {role: 'upgrader'}});
        console.log('Adding Upgrader to Spawn List: ' + newName);
    }
    else if(carriers > 1 && EnergyMinersInRoom > 1 && storage && storage.store.getFreeCapacity() < 200) {
        let newName = 'Upgrader-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push(getBody([WORK,CARRY,MOVE], room, 20), newName, {memory: {role: 'upgrader'}});
        console.log('Adding Upgrader to Spawn List: ' + newName, "because storage is full");
    }

    if((repairers < repairerTargetAmount && room.controller.level > 1) ||
    (storage && storage.store[RESOURCE_ENERGY] > 600000 && repairers < repairerTargetAmount + 1) ||
    (room.memory.danger == true && repairers < 6 && room.controller.level > 4 && storage && storage.store[RESOURCE_ENERGY] > 100000)) {
        if(EnergyMinersInRoom > 1 && carriers > 1) {
            let newName = 'Repair-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
            room.memory.spawn_list.push(getBody([WORK,CARRY,MOVE], room, 30), newName, {memory: {role: 'repair', homeRoom: room.name}});
            console.log('Adding Repairer to Spawn List: ' + newName + "-" + room.name);
        }
    }

    if(room.memory.danger == true && defenders < 2) {
        let newName = 'Defender-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push(getBody([RANGED_ATTACK,RANGED_ATTACK,MOVE], room, 35), newName, {memory: {role: 'defender', homeRoom: room.name}});
        console.log('Adding Defender to Spawn List: ' + newName);
    }

    if(attackers < 0) {
        let newName = 'Attacker-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK
                                        ,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK], newName, {memory: {role: 'attacker', targetRoom: "E14S36", targetRoom2: "E14S37"}});
        console.log('Adding Attacker to Spawn List: ' + newName);
    }
    // TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK

    if(claimers < 0) {
        let newName = 'Claimer-' + randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push([MOVE,CLAIM], newName, {memory: {role: 'claimer', targetRoom: "E14S37"}});
        console.log('Adding Claimer to Spawn List: ' + newName);
    }

    if(containerbuilders < 0) {
        let newName = 'ContainerBuilder-' + randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push(getBody([WORK,CARRY,MOVE], room), newName, {memory: {role: 'buildcontainer', targetRoom: "E14S37"}});
        console.log('Adding ContainerBuilder to Spawn List: ' + newName);
    }

    if(RemoteDismantlers < 0) {
        let newName = 'RemoteDismantler-' + randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK], newName, {memory: {role: 'RemoteDismantler', targetRoom: "E9S36"}});
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


    // TODO loop through spawn queue and find if any are already in and add it to the attackers or ranged attackers count

    _.forEach(Game.rooms, function(thisRoom) {
        if(thisRoom.memory.has_hostile_structures && !thisRoom.memory.has_attacker && thisRoom.controller && !thisRoom.controller.my && attackers < 2) {
            let newName = 'Attacker-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
            room.memory.spawn_list.push([ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'attacker', targetRoom: thisRoom.name}});
            console.log('Adding Defending-Attacker to Spawn List: ' + newName);
            thisRoom.memory.has_hostile_structures = false;
        }
        if(thisRoom.memory.has_hostile_creeps && !thisRoom.memory.has_attacker && thisRoom.controller && !thisRoom.controller.my && RangedAttackers < 2) {
            let newName = 'RangedAttacker-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
            room.memory.spawn_list.push(getBody([MOVE,RANGED_ATTACK], room, 30), newName, {memory: {role: 'RangedAttacker', targetRoom: thisRoom.name, homeRoom: room.name}});
            console.log('Adding Defending-Ranged-Attacker to Spawn List: ' + newName);
            thisRoom.memory.has_hostile_creeps = false;
        }
    });


    if(EnergyManagers < 1 && room.controller.level >= 6) {
        let newName = 'EnergyManager-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE], newName, {memory: {role: 'EnergyManager'}});
        console.log('Adding Energy Manager to Spawn List: ' + newName);
    }


    if(room.memory.storage && fillers < fillerTargetAmount && room.energyAvailable < room.energyCapacityAvailable && room.controller.level < 4) {
        let newName = 'Filler-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
        room.memory.spawn_list.unshift([CARRY,MOVE], newName, {memory: {role: 'filler'}});
        console.log('Adding filler to Spawn List: ' + newName);
    }
    else if ((((fillers < fillerTargetAmount) && room.energyAvailable < room.energyCapacityAvailable ||
    (room.find(FIND_HOSTILE_CREEPS) != undefined && room.find(FIND_HOSTILE_CREEPS).length > 1 && fillers < 5))) && storage != undefined && room.energyAvailable < room.energyCapacityAvailable ||
    room.controller.level == 6 && fillers < fillerRCL6TargetAmount && storage != undefined && room.energyAvailable < room.energyCapacityAvailable) {
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
            if(spawnAttempt == -6) {
                if(room.memory.spawn_list[0].length >= 5
                && !room.memory.spawn_list[1].startsWith("Carrier")
                && !room.memory.spawn_list[1].startsWith("EnergyMiner")
                && !room.memory.spawn_list[1].startsWith("RemoteRepairer")
                || _.sum(segment, s => BODYPART_COST[s]) > room.energyCapacityAvailable) {

                    room.memory.spawn_list.shift();
                    room.memory.spawn_list.shift();
                    room.memory.spawn_list.shift();

                }
                else if(room.memory.lastTimeSpawnUsed > 305 && room.memory.spawn_list[1].startsWith("Carrier") && room.energyAvailable < room.memory.spawn_list[0].length * 50 && room.memory.spawn_list[0].length > 3 ||
                room.memory.lastTimeSpawnUsed > 305 && room.memory.spawn_list[1].startsWith("EnergyMiner") && room.energyAvailable < room.memory.spawn_list[0].length * 100  && room.memory.spawn_list[0].length > 3 ||
                room.memory.lastTimeSpawnUsed > 305 && room.memory.spawn_list[1].startsWith("RemoteRepairer") && room.energyAvailable < room.memory.spawn_list[0].length * 100  && room.memory.spawn_list[0].length > 3) {
                    room.memory.spawn_list[0].shift();
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


    console.log(room.memory.spawn_list.length/3, "creeps in spawn queue in room", room.name);

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

    console.log(Game.time - room.memory.lastTimeSpawnUsed, "ticks since last time spawn was active ⛄", room.name)


    if(room.memory.spawn_list.length == 0 && Game.time - room.memory.lastTimeSpawnUsed == 3 ||
        room.memory.spawn_list.length == 0 && (Game.time - room.memory.lastTimeSpawnUsed) % 47 == 0) {
        add_creeps_to_spawn_list(room, spawn);
    }
}
export default spawning;
// module.exports = spawning;



    // let EnergyMiners = _.sum(Game.creeps, (creep) => creep.memory.role == 'EnergyMiner');
    // let EnergyMinersInRoom =  _.sum(Game.creeps, (creep) => creep.memory.role == 'EnergyMiner' && isInRoom(creep, room));

    // let carriers = _.sum(Game.creeps, (creep) => creep.memory.role == 'carry');
    // let carriersInRoom = _.sum(Game.creeps, (creep) => creep.memory.role == 'carry' && isInRoom(creep, room));

    // let EnergyManagers = _.sum(Game.creeps, (creep) => creep.memory.role == 'EnergyManager' && isInRoom(creep, room));

    // let MineralMiners = _.sum(Game.creeps, (creep) => creep.memory.role == 'MineralMiner' && isInRoom(creep, room));

    // let builders = _.sum(Game.creeps, (creep) => creep.memory.role == 'builder' && isInRoom(creep, room));
    // let upgraders = _.sum(Game.creeps, (creep) => creep.memory.role == 'upgrader' && isInRoom(creep, room));
    // let fillers = _.sum(Game.creeps, (creep) => creep.memory.role == 'filler' && isInRoom(creep, room));
    // let repairers = _.sum(Game.creeps, (creep) => creep.memory.role == 'repair' && isInRoom(creep, room));

    // let defenders = _.sum(Game.creeps, (creep) => creep.memory.role == 'defender' && isInRoom(creep, room));

    // let RemoteRepairers = _.sum(Game.creeps, (creep) => creep.memory.role == 'RemoteRepair');

    // let Dismantlers = _.sum(Game.creeps, (creep) => creep.memory.role == 'Dismantler' && isInRoom(creep, room));

    // let scouts = _.sum(Game.creeps, (creep) => creep.memory.role == 'scout');

    // let claimers = _.sum(Game.creeps, (creep) => creep.memory.role == 'claimer');
    // let RemoteDismantlers = _.sum(Game.creeps, (creep) => creep.memory.role == 'RemoteDismantler');

    // let attackers = _.sum(Game.creeps, (creep) => creep.memory.role == 'attacker');
    // let RangedAttackers = _.sum(Game.creeps, (creep) => creep.memory.role == 'RangedAttacker');

    // let containerbuilders = _.sum(Game.creeps, (creep) => creep.memory.role == 'buildcontainer');

    // let DrainTowers = _.sum(Game.creeps, (creep) => creep.memory.role == 'DrainTower');
    // let healers = _.sum(Game.creeps, (creep) => creep.memory.role == 'healer');




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
