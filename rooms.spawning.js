function isInRoom(creep, room) {
    return creep.room.name == room.name;
  }


function getBody(segment, room, divisor=1) {
    let body = [];
    let segmentCost = _.sum(segment, s => BODYPART_COST[s]);
    let energyAvailable = room.energyAvailable;
    
    let maxSegments = Math.floor(energyAvailable / segmentCost / divisor);
    _.times(maxSegments, function() {_.forEach(segment, s => body.push(s));});

    return body;
}


function getCarrierBody(sourceId, storage, spawn, room) {
    let targetSource = Game.getObjectById(sourceId);
    let pathFromStorageToSource;
    let distanceFromStorageToSource;
    let carriersInRoom = _.filter(Game.creeps, (creep) => creep.memory.role == 'carry' && creep.room.name == room.name);

    if(storage != undefined) {
        pathFromStorageToSource = storage.pos.findPathTo(targetSource);
        distanceFromStorageToSource = pathFromStorageToSource.length;
    }
    else if (spawn != undefined) {
        pathFromStorageToSource = spawn.pos.findPathTo(targetSource);
        distanceFromStorageToSource = pathFromStorageToSource.length;
    }

    let threeWorkParts = 6;
    let fiveWorkParts = 10;


    if(carriersInRoom.length == 0 && storage == undefined) {
        return [CARRY,CARRY,MOVE];
    }

    if(targetSource == null) {
        let body = getBody([CARRY,CARRY,MOVE], room, 1.6);
        return body;
    }

    if(targetSource.room.name == room.name) {
        let ticksPerRoundTrip = (distanceFromStorageToSource * 2) + 2;
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
        let ticksPerRoundTrip = (distanceFromStorageToSource * 2) + 2;
        let energyProducedPerRoundTrip = threeWorkParts * ticksPerRoundTrip
        let body = [];
        let alternate = 1;
        while (energyProducedPerRoundTrip > -50) {
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


function spawn_energy_miner(resourceData, room, spawn, storage) {
    let foundCreepToSpawn = false;
    _.forEach(resourceData, function(data, targetRoomName){
        _.forEach(data.energy, function(values, sourceId) {
            // console.log(Game.time - (values.lastSpawn || 0) , Game.time - (values.lastSpawnCarrier || 0))
            if (Game.time - (values.lastSpawn || 0) > CREEP_LIFE_TIME) {
                let newName = 'EnergyMiner' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
                // console.log('Spawning new EnergyMiner: ' + newName);
                if(targetRoomName == room.name) {
                    if(room.energyCapacityAvailable >= 550) {
                        let result;
                        if(room.controller.level >= 6) {
                            result = spawn.spawnCreep([WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE], newName, 
                                {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                        }
                        else {
                            result = spawn.spawnCreep([WORK,WORK,WORK,WORK,WORK,WORK,MOVE], newName, 
                                {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                        }
                        if(result == OK) {
                            console.log('Spawning new EnergyMiner: ' + newName);
                            values.lastSpawn = Game.time;
                            foundCreepToSpawn = true;
                            return;
                        }
                    }
                    else {
                        let result = spawn.spawnCreep([WORK,WORK,MOVE], newName, 
                            {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                        if(result == OK) {
                            console.log('Spawning new EnergyMiner: ' + newName);
                            values.lastSpawn = Game.time;
                            foundCreepToSpawn = true;
                            return;
                        }
                    }
                }

                else {
                    let result = spawn.spawnCreep([WORK,WORK,WORK,WORK,MOVE], newName, 
                        {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                    if(result == OK) {
                        console.log('Spawning new EnergyMiner: ' + newName);
                        values.lastSpawn = Game.time;
                        foundCreepToSpawn = true;
                        return;
                    }
                }
            }

            if(Game.time - (values.lastSpawn || 0) > CREEP_LIFE_TIME*2) {
                let newName = 'EnergyMiner' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
                let result = spawn.spawnCreep([WORK,WORK,MOVE], newName, 
                    {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                if(result == OK) {
                    console.log('Spawning new EnergyMiner: ' + newName);
                    values.lastSpawn = Game.time;
                    foundCreepToSpawn = true;
                    return;
                }
            }

            if(foundCreepToSpawn != false) {return;}});if(foundCreepToSpawn != false) {return;}});if(foundCreepToSpawn != false) {return true;}
}


function spawn_carrier(resourceData, room, spawn, storage) {
    let foundCreepToSpawn = false;
    _.forEach(resourceData, function(data, targetRoomName){
        _.forEach(data.energy, function(values, sourceId) {
            // console.log(Game.time - (values.lastSpawn || 0) , Game.time - (values.lastSpawnCarrier || 0))
            if (Game.time - (values.lastSpawnCarrier || 0) > CREEP_LIFE_TIME) {
                let newName = 'Carrier' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
                // console.log('Spawning new Carrier: ' + newName);

                let result = spawn.spawnCreep(getCarrierBody(sourceId, storage, spawn, room), newName, 
                    {memory: {role: 'carry', targetRoom: targetRoomName, homeRoom: room.name}});
                if(result == OK) {
                    console.log('Spawning new Carrier: ' + newName);
                    if(Game.rooms[targetRoomName].controller && Game.rooms[targetRoomName].controller.level >= 6) {
                        values.lastSpawnCarrier = 5000000000;
                    }
                    else {
                        values.lastSpawnCarrier = Game.time;
                    }
                    
                    foundCreepToSpawn = true;
                    return;
                }
            }

            if(Game.time - (values.lastSpawnCarrier || 0) > CREEP_LIFE_TIME*2) {
                let newName = 'Carrier' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
                // console.log('Spawning new Carrier: ' + newName);

                let result = spawn.spawnCreep([MOVE,CARRY,CARRY], newName, 
                    {memory: {role: 'carry', targetRoom: targetRoomName, homeRoom: room.name}});
                if(result == OK) {
                    console.log('Spawning new Carrier: ' + newName);
                    values.lastSpawnCarrier = Game.time-600;
                    foundCreepToSpawn = true;
                    return;
                }
            }
            if(foundCreepToSpawn != false) {return;}});if(foundCreepToSpawn != false) {return;}});if(foundCreepToSpawn != false) {return true;}
}

function spawn_remote_repairer(resourceData, room, spawn) {
    let foundCreepToSpawn = false;
    _.forEach(resourceData, function(data, targetRoomName){
        _.forEach(data.energy, function(values, sourceId) {
            if (Game.time - (values.lastSpawnRemoteRepairer || 0) > CREEP_LIFE_TIME * 2) {
                let newName = 'RemoteRepairer' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
                if(targetRoomName != room.name) {
                    let result = spawn.spawnCreep([WORK,WORK,CARRY,CARRY,MOVE,MOVE], newName, 
                        {memory: {role: 'RemoteRepair', targetRoom: targetRoomName, homeRoom: room.name}});
                    if(result == OK) {
                        console.log('Spawning new RemoteRepairer: ' + newName);
                        values.lastSpawnRemoteRepairer = Game.time;
                        foundCreepToSpawn = true;
                        return;
                    }
                }
            }
            if(foundCreepToSpawn != false) {
                return;
            }
        });
        if(foundCreepToSpawn != false) {
            return;
        }
    });
    if(foundCreepToSpawn != false) {
        return true;
    }
}

function spawn_repair(room, spawn, storage,  repairers, repairerTargetAmount, EnergyMinersInRoom, carriersInRoom) {
    let foundCreepToSpawn = false;
    if((repairers < repairerTargetAmount && room.controller.level > 1) || (storage && storage.store[RESOURCE_ENERGY] > 500000 && repairers < repairerTargetAmount + 0)) {
        if(EnergyMinersInRoom > 1 && carriersInRoom > 1) {
            let newName = 'Repair' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
            let result = spawn.spawnCreep(getBody([WORK,CARRY,MOVE], room), newName, 
                {memory: {role: 'repair'}});
            if(result == OK) {
                console.log('Spawning new repairer: ' + newName + "-" + room.name);
                foundCreepToSpawn = true;
                return foundCreepToSpawn;
            }
        }
    }
}



function spawning(room) {
    let spawn = Game.getObjectById(room.memory.spawn) || room.findSpawn();
    if(spawn == undefined) {
        return;
    }

    if(spawn.spawning) {
        spawn = room.findSpawn();
        if(spawn == undefined || spawn.spawning) {
            return;
        }
    }

    // console.log(JSON.stringify(Game.creeps))
    // info section below
    // console.log(room.extractor)

    // let test = _.sum(Game.creeps, (c) => c.memory.role == 'carry');
    // console.log(test)

    let EnergyMiners = _.sum(Game.creeps, (creep) => creep.memory.role == 'EnergyMiner');
    let EnergyMinersInRoom =  _.sum(Game.creeps, (creep) => creep.memory.role == 'EnergyMiner' && isInRoom(creep, room));

    let carriers = _.sum(Game.creeps, (creep) => creep.memory.role == 'carry');
    let carriersInRoom = _.sum(Game.creeps, (creep) => creep.memory.role == 'carry' && isInRoom(creep, room));

    let EnergyManager = _.sum(Game.creeps, (creep) => creep.memory.role == 'EnergyManager' && isInRoom(creep, room));

    let MineralMiners = _.sum(Game.creeps, (creep) => creep.memory.role == 'MineralMiner' && isInRoom(creep, room));

    let builders = _.sum(Game.creeps, (creep) => creep.memory.role == 'builder' && isInRoom(creep, room));
    let upgraders = _.sum(Game.creeps, (creep) => creep.memory.role == 'upgrader' && isInRoom(creep, room));
    let fillers = _.sum(Game.creeps, (creep) => creep.memory.role == 'filler' && isInRoom(creep, room));
    let repairers = _.sum(Game.creeps, (creep) => creep.memory.role == 'repair' && isInRoom(creep, room));

    let defenders = _.sum(Game.creeps, (creep) => creep.memory.role == 'defender' && isInRoom(creep, room));

    let RemoteRepairers = _.sum(Game.creeps, (creep) => creep.memory.role == 'RemoteRepair');

    let Dismantlers = _.sum(Game.creeps, (creep) => creep.memory.role == 'Dismantler' && isInRoom(creep, room));

    let scouts = _.sum(Game.creeps, (creep) => creep.memory.role == 'scout');

    let claimers = _.sum(Game.creeps, (creep) => creep.memory.role == 'claimer');
    let RemoteDismantlers = _.sum(Game.creeps, (creep) => creep.memory.role == 'RemoteDismantler');

    let attackers = _.sum(Game.creeps, (creep) => creep.memory.role == 'attacker');

    let containerbuilders = _.sum(Game.creeps, (creep) => creep.memory.role == 'buildcontainer');

    let DrainTowers = _.sum(Game.creeps, (creep) => creep.memory.role == 'DrainTower');
    let healers = _.sum(Game.creeps, (creep) => creep.memory.role == 'healer');

    console.log("Room-" + room.name + " has " + builders + " Builders " + upgraders +
    " Upgraders " + repairers + " Repairers " + fillers
    + " Fillers [" + EnergyMiners + " Energy-Miners in all rooms] [" + carriers +
     " Carriers in all rooms] [" +  RemoteRepairers, "RemoteRepairers in all rooms] [" + attackers + " Attackers in all rooms]");


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

    let upgraderTargetAmount = _.get(room.memory, ['census', 'upgrader'], 1);

    let preRCL5UpgraderTarget = _.get(room.memory, ['census', 'upgrader'], 4);

    let builderTargetAmount = _.get(room.memory, ['census', 'builder'], 2);


    let fillerTargetAmount = _.get(room.memory, ['census', 'filler'], 1);
    let fillerRCL6TargetAmount = _.get(room.memory, ['census', 'filler'], 2);

    let repairerTargetAmount = _.get(room.memory, ['census', 'repair'], 1);

    let sites = room.find(FIND_CONSTRUCTION_SITES);

    let storage = Game.getObjectById(room.memory.storage) || room.findStorage();


    
    if ((((fillers < fillerTargetAmount) && room.energyAvailable < room.energyCapacityAvailable || 
    (room.find(FIND_HOSTILE_CREEPS) != undefined && room.find(FIND_HOSTILE_CREEPS).length > 1 && fillers < 4))) && storage != undefined && room.energyAvailable < room.energyCapacityAvailable || 
    room.controller.level >= 6 && fillers < fillerRCL6TargetAmount && storage != undefined && room.energyAvailable < room.energyCapacityAvailable) {
        
        let newName = 'Filler' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        let result = spawn.spawnCreep([CARRY,CARRY,MOVE], newName, 
            {memory: {role: 'filler'}});
        if(result == OK) {
            console.log('Spawning new filler: ' + newName);
            return;
        }
    }

    if(EnergyManager < 1 && room.controller.level >= 6) {
        let newName = 'EnergyManager' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        let result = spawn.spawnCreep([CARRY,CARRY,CARRY,CARRY,MOVE], newName, 
            {memory: {role: 'EnergyManager'}});
        if(result == OK) {
            console.log('Spawning new EnergyManager: ' + newName);
            return;
        }
    }


    let resourceData = _.get(room.memory, ['resources']);

    if(spawn_energy_miner(resourceData, room, spawn, storage) == true) {
        return;
    }

    if(spawn_carrier(resourceData, room, spawn, storage) == true) {
        return;
    }

    if(spawn_remote_repairer(resourceData, room, spawn) == true) {
        return;
    }

    if (scouts < 0) {
        let newName = 'Scout' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        let result = spawn.spawnCreep([MOVE], newName, 
            {memory: {role: 'scout'}});
        if(result == OK) {
            console.log('Spawning new Scout: ' + newName);
            return;
        }
    }

    if (MineralMiners < 1 && room.controller.level >= 6) {
        let mineral = Game.getObjectById(room.memory.mineral) || room.findMineral();
        if(mineral.mineralAmount > 0) {
            let newName = 'MineralMiner' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
            let result = spawn.spawnCreep([WORK,WORK,WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE], newName, 
                {memory: {role: 'MineralMiner'}});
            if(result == OK) {
                console.log('Spawning new MineralMiner: ' + newName);
                return;
            }
        }
    }
    if(room.memory.danger == true && defenders < 5) {
        let newName = 'Defender' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        let result = spawn.spawnCreep(getBody([RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,MOVE], room), newName, 
            {memory: {role: 'defender'}});  
        if(result == OK) {
            console.log('Spawning new defender: ' + newName);
            return;
        }
    }
   
    if(sites.length > 0 && builders < builderTargetAmount && carriers > 1 && EnergyMinersInRoom > 1) {
        let newName = 'Builder' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        let result = spawn.spawnCreep(getBody([WORK,CARRY,MOVE], room), newName, 
            {memory: {role: 'builder'}});
        if(result == OK) {
            console.log('Spawning new builder: ' + newName);
            return;
        }
    }


    if(room.controller.level == 8) {
        if(upgraders < 1) {
            let newName = 'Upgrader' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
            let result = spawn.spawnCreep([WORK,CARRY,MOVE], newName, 
                {memory: {role: 'upgrader'}});  
            if(result == OK) {
                console.log('Spawning new upgrader: ' + newName);
                return;
            }
        }
    }
    else if (carriers > 1 && EnergyMinersInRoom > 1 && upgraders < upgraderTargetAmount && carriersInRoom > 0 && EnergyMinersInRoom  > 0 || (storage && storage.store[RESOURCE_ENERGY] > 500000 && upgraders < upgraderTargetAmount + 4) && carriersInRoom > 0 && EnergyMinersInRoom > 0  || (room.controller.level <= 4 && upgraders < preRCL5UpgraderTarget && carriersInRoom > 0 && EnergyMinersInRoom > 0 )) {
        let newName = 'Upgrader' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        let result = spawn.spawnCreep(getBody([WORK,CARRY,MOVE], room), newName, 
            {memory: {role: 'upgrader'}});  
        if(result == OK) {
            console.log('Spawning new upgrader: ' + newName);
            return;
        }
    }

    if(spawn_repair(room, spawn, storage, repairers, repairerTargetAmount, EnergyMinersInRoom, carriersInRoom) == true) {
        return;
    }

    if(attackers < 0) {
        let newName = 'Attacker' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        let result = spawn.spawnCreep([ATTACK,MOVE], newName, 
            {memory: {role: 'attacker', targetRoom: "E9S36", targetRoom2: "E9S35"}});  
        if(result == OK) {
            console.log('Spawning new attacker: ' + newName);
            return;
        }
    }
    // TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK
    if(containerbuilders < 0) {
        let newName = 'ContainerBuilder' + Game.time + " " + room.name;
        let result = spawn.spawnCreep(getBody([WORK,CARRY,MOVE], room), newName, 
            {memory: {role: 'buildcontainer', targetRoom: "E12S35"}});  
        if(result == OK) {
            console.log('Spawning new ContainerBuilder: ' + newName);
            return;
        }
    }

    if(claimers < 0) {
        let newName = 'Claimer' + Game.time + " " + room.name;
        let result = spawn.spawnCreep([MOVE,CLAIM], newName, 
            {memory: {role: 'claimer', targetRoom: "E11S37"}});  
        if(result == OK) {
            console.log('Spawning new Claimer: ' + newName);
            return;
        }
    }


    if(RemoteDismantlers < 0) {
        let newName = 'RemoteDismantler' + Game.time + " " + room.name;
        let result = spawn.spawnCreep([MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK], newName, 
            {memory: {role: 'RemoteDismantler', targetRoom: "E9S36"}});  
        if(result == OK) {
            console.log('Spawning new RemoteDismantler: ' + newName);
            return;
        }
    }

    
    

    let spawned;
    let remoteRooms = ["E12S36", "E11S38", "E12S38", "E13S37", "E13S36", "E13S35"]


    _.forEach(Game.rooms, function(thisRoom) {
        if(thisRoom.memory.has_hostile_structures && !thisRoom.memory.has_attacker && thisRoom.controller && !thisRoom.controller.my && remoteRooms.includes(thisRoom.name)) {
            // let creeps = _.sum(Game.creeps, (creep) => creep.my && thisRoom.name == creep.room.name);
            // if(creeps > 0) {
            let newName = 'Attacker' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
            let result = spawn.spawnCreep([ATTACK,MOVE,ATTACK,MOVE,ATTACK,ATTACK], newName, 
                {memory: {role: 'attacker', targetRoom: thisRoom.name}});  
            if(result == OK) {
                console.log('Spawning new room defending attacker: ' + newName);
                spawned = true;
                thisRoom.memory.has_hostile_structures = false;
                return;
                // }
            }
        }
        if(thisRoom.memory.has_hostile_creeps && !thisRoom.memory.has_attacker && thisRoom.controller && !thisRoom.controller.my && remoteRooms.includes(thisRoom.name)) {
            let newName = 'RangedAttacker' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
            let result = spawn.spawnCreep([RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], newName, 
                {memory: {role: 'RangedAttacker', targetRoom: thisRoom.name}});  
            if(result == OK) {
                console.log('Spawning new room defending ranged attacker: ' + newName);
                spawned = true;
                thisRoom.memory.has_hostile_creeps = false;
                return;
                // }
            }
        }

    });
    if(spawned) {
        return;
    }

    if(room.controller.level <= 4 && Dismantlers < 0) {
        let newName = 'Dismantler' + Game.time + " " + room.name;
        let result = spawn.spawnCreep(getBody([WORK,WORK,WORK,WORK,MOVE], room), newName, 
            {memory: {role: 'Dismantler'}});  
        if(result == OK) {
            console.log('Spawning new Dismantler: ' + newName);
            return;
        }
    }

    if(DrainTowers  < 0) {
        let newName = 'DrainTower' + Game.time + " " + room.name;
        let result = spawn.spawnCreep([TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], newName, 
            {memory: {role: 'DrainTower', targetRoom: "E12S39", healRoom: "E12S38"}});  
        if(result == OK) {
            console.log('Spawning new DrainTower: ' + newName);
            return;
        }
    }

    if(healers < 0) {
        let newName = 'healer' + Game.time + " " + room.name;
        let result = spawn.spawnCreep([HEAL,HEAL,HEAL,HEAL,HEAL,MOVE,MOVE,MOVE,MOVE,MOVE], newName, 
            {memory: {role: 'healer', targetRoom: "E12S38"}});  
        if(result == OK) {
            console.log('Spawning new healer: ' + newName);
            return;
        }
    }
}

module.exports = spawning;