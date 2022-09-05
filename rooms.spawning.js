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
                    if(room.energyCapacityAvailable > 550) {
                        let result = spawn.spawnCreep([WORK,WORK,WORK,WORK,WORK,MOVE], newName, 
                            {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
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
                            values.lastSpawn = Game.time - 748;
                            foundCreepToSpawn = true;
                            return;
                        }   
                    }
                }

                else {
                    let result = spawn.spawnCreep([WORK,WORK,WORK,MOVE], newName, 
                        {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});
                    if(result == OK) {
                        console.log('Spawning new EnergyMiner: ' + newName);
                        values.lastSpawn = Game.time;
                        foundCreepToSpawn = true;
                        return;
                    }
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
                    values.lastSpawnCarrier = Game.time;
                    foundCreepToSpawn = true;
                    return;
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

function spawn_remote_repairer(resourceData, room, spawn) {
    let foundCreepToSpawn = false;
    _.forEach(resourceData, function(data, targetRoomName){
        _.forEach(data.energy, function(values, sourceId) {
            if (Game.time - (values.lastSpawnRemoteRepairer || 0) > CREEP_LIFE_TIME) {
                let newName = 'RemoteRepairer' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
                if(targetRoomName != room.name) {
                    let result = spawn.spawnCreep([WORK,CARRY,MOVE], newName, 
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



function spawning(room) {
    // info section below
    // console.log(room.extractor)
    let workers = _.filter(Game.creeps, (creep) => creep.memory.role == 'worker' && creep.room.name == room.name);

    let MineralMiners = _.filter(Game.creeps, (creep) => creep.memory.role == 'MineralMiner' && creep.room.name == room.name);

    let builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder' && creep.room.name == room.name);
    let upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader' && creep.room.name == room.name);
    let fillers = _.filter(Game.creeps, (creep) => creep.memory.role == 'filler' && creep.room.name == room.name);
    let repairers = _.filter(Game.creeps, (creep) => creep.memory.role == 'repair' && creep.room.name == room.name);

    let defenders = _.filter(Game.creeps, (creep) => creep.memory.role == 'defender' && creep.room.name == room.name);

    let EnergyMiners = _.filter(Game.creeps, (creep) => creep.memory.role == 'EnergyMiner');
    let EnergyMinersInRoom =  _.filter(Game.creeps, (creep) => creep.memory.role == 'EnergyMiner' && creep.room.name == room.name);
    let carriers = _.filter(Game.creeps, (creep) => creep.memory.role == 'carry');
    let carriersInRoom = _.filter(Game.creeps, (creep) => creep.memory.role == 'carry' && creep.room.name == room.name);
    let RemoteRepairers = _.filter(Game.creeps, (creep) => creep.memory.role == 'RemoteRepair');

    let claimers = _.filter(Game.creeps, (creep) => creep.memory.role == 'claimer');
    let RemoteDismantlers = _.filter(Game.creeps, (creep) => creep.memory.role == 'RemoteDismantler');

    let attackers = _.filter(Game.creeps, (creep) => creep.memory.role == 'attacker');

    let containerbuilders = _.filter(Game.creeps, (creep) => creep.memory.role == 'buildcontainer');


    console.log("Room-" + room.name + " has " + builders.length + " Builders " + upgraders.length +
    " Upgraders " + repairers.length + " Repairers " + fillers.length
    + " Fillers [" + EnergyMiners.length + " Energy-Miners in all rooms] [" + carriers.length +
     " Carriers in all rooms] [" +  RemoteRepairers.length, "RemoteRepairers in all rooms] [" + attackers.length + " Attackers in all rooms]");


// info section above

    let spawns = room.find(FIND_MY_STRUCTURES, {
        filter: { structureType : STRUCTURE_SPAWN}});

    spawns = _. filter(spawns, structure => structure.spawning == null);

    if(!spawns.length) {
        return;
    }

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

    let workerTargetAmount = _.get(room.memory, ['census', 'worker'], 0);


    let upgraderTargetAmount = _.get(room.memory, ['census', 'upgrader'], 1);

    let preRCL6UpgraderTarget = _.get(room.memory, ['census', 'upgrader'], 4);

    let builderTargetAmount = _.get(room.memory, ['census', 'builder'], 2);
    let fillerTargetAmount = _.get(room.memory, ['census', 'filler'], 1);
    let repairerTargetAmount = _.get(room.memory, ['census', 'repair'], 1);

    let sites = room.find(FIND_CONSTRUCTION_SITES);

    let storage = Game.getObjectById(room.memory.storage) || room.findStorage();

    if (((fillers.length < fillerTargetAmount) || (room.find(FIND_HOSTILE_CREEPS) != undefined && room.find(FIND_HOSTILE_CREEPS).length > 1 && fillers.length < 4)) && storage != undefined) {
        let newName = 'Filler' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        console.log('Spawning new filler: ' + newName);
        let result = spawns[0].spawnCreep([CARRY,CARRY,MOVE], newName, 
            {memory: {role: 'filler'}});
        if(result == OK) {
            return;
        }
    }

    // if (workers.length < workerTargetAmount && totalWorkPartsOnWorkers < 10) {
    //     let newName = 'Worker' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
    //     console.log('Spawning new worker: ' + newName);
    //     let result = spawns[0].spawnCreep(getBody([WORK,CARRY,MOVE], room, 2), newName, 
    //         {memory: {role: 'worker', homeRoom: room.name}});
    //     if(result == OK) {
    //         return;
    //     }  
    // }

    let resourceData = _.get(room.memory, ['resources']);

    if(spawn_energy_miner(resourceData, room, spawns[0], storage) == true) {
        return;
    }

    if(spawn_carrier(resourceData, room, spawns[0], storage) == true) {
        return;
    }

    if(spawn_remote_repairer(resourceData, room, spawns[0]) == true) {
        return;
    }


    let deposit = room.find(FIND_MINERALS);
    if (MineralMiners.length < 1 && room.controller.level >= 6 && deposit[0].mineralAmount > 0) {
        let newName = 'MineralMiner' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        console.log('Spawning new MineralMiner: ' + newName);
        let result = spawns[0].spawnCreep([WORK,CARRY,MOVE], newName, 
            {memory: {role: 'MineralMiner'}});
        if(result == OK) {
            return;
        }
    }

    if(repairers.length < repairerTargetAmount && carriersInRoom.length > 0 && EnergyMinersInRoom.length > 0 && room.controller.level > 1 || (storage && storage.store[RESOURCE_ENERGY] > 500000 && repairers.length < repairerTargetAmount + 2)) {
        let newName = 'Repair' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        console.log('Spawning new repairer: ' + newName + "-" + room.name);
        let result = spawns[0].spawnCreep(getBody([WORK,CARRY,MOVE], room), newName, 
            {memory: {role: 'repair'}});
        if(result == OK) {
            return;
        }
    }

    if(room.find(FIND_HOSTILE_CREEPS) != undefined && room.find(FIND_HOSTILE_CREEPS).length > 1 && defenders.length < 3) {
        let newName = 'Defender' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        console.log('Spawning new defender: ' + newName);
        let result = spawns[0].spawnCreep(getBody([ATTACK,ATTACK,ATTACK,MOVE], room), newName, 
            {memory: {role: 'defender'}});  
        if(result == OK) {
            return;
        }
    }

    if (upgraders.length < upgraderTargetAmount && carriersInRoom.length > 0 && EnergyMinersInRoom.length > 0 || (storage && storage.store[RESOURCE_ENERGY] > 500000 && upgraders.length < upgraderTargetAmount + 1) || (room.controller.level <= 5 && upgraders.length < preRCL6UpgraderTarget)) {
        let newName = 'Upgrader' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        console.log('Spawning new upgrader: ' + newName);
        let result = spawns[0].spawnCreep(getBody([WORK,CARRY,MOVE], room), newName, 
            {memory: {role: 'upgrader'}});  
        if(result == OK) {
            return;
        }
    }
   
    if(sites.length > 0 && builders.length < builderTargetAmount) {
        let newName = 'Builder' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        console.log('Spawning new builder: ' + newName);
        let result = spawns[0].spawnCreep(getBody([WORK,CARRY,MOVE], room), newName, 
            {memory: {role: 'builder'}});
        if(result == OK) {
            return;
        }
    }

    if(attackers.length < 1) {
        let newName = 'Attacker' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        console.log('Spawning new attacker: ' + newName);
        let result = spawns[0].spawnCreep(getBody([ATTACK,MOVE], room), newName, 
            {memory: {role: 'attacker', targetRoom: "E12S36", targetRoom2: "E12S39"}});  
        if(result == OK) {
            return;
        }
    }

    if(containerbuilders.length < 0) {
        let newName = 'ContainerBuilder' + Game.time + " " + room.name;
        console.log('Spawning new ContainerBuilder: ' + newName);
        let result = spawns[0].spawnCreep([MOVE,WORK,CARRY], newName, 
            {memory: {role: 'buildcontainer', targetRoom: "E12S35"}});  
        if(result == OK) {
            return;
        }
    }

    if(claimers.length < 0) {
        let newName = 'Claimer' + Game.time + " " + room.name;
        console.log('Spawning new Claimer: ' + newName);
        let result = spawns[0].spawnCreep([MOVE,CLAIM], newName, 
            {memory: {role: 'claimer', targetRoom: "E12S35"}});  
        if(result == OK) {
            return;
        }
    }


    if(RemoteDismantlers.length < 0) {
        let newName = 'RemoteDismantler' + Game.time + " " + room.name;
        console.log('Spawning new RemoteDismantler: ' + newName);
        let result = spawns[0].spawnCreep([MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK], newName, 
            {memory: {role: 'RemoteDismantler', targetRoom: "E12S35"}});  
        if(result == OK) {
            return;
        }
    }


    if(spawns[0].spawning) { 
        let spawningCreep = Game.creeps[spawns[0].spawning.name];
        spawns[0].room.visual.text(
            '🛠️' + spawningCreep.memory.role,
            spawns[0].pos.x + 1, 
            spawns[0].pos.y, 
            {align: 'left', opacity: 0.8});
    }

    // if(room.name == "E12S39") {
    //     let workers = _.filter(Game.creeps, (creep) => creep.memory.role == 'worker' && creep.room.name == room.name);
    //     let builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder' && creep.room.name == room.name);
    //     let upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader' && creep.room.name == room.name);
    //     let remoteWorkers = _.filter(Game.creeps, (creep) => creep.memory.role == 'remoteworker');
    //     let attackers = _.filter(Game.creeps, (creep) => creep.memory.role == 'attacker' && creep.room.name == room.name);
    //     let claimers = _.filter(Game.creeps, (creep) => creep.memory.role == 'claimer' && creep.room.name == room.name);
    //     let containerbuilders = _.filter(Game.creeps, (creep) => creep.memory.role == 'buildcontainer');
    //     let carriers = _.filter(Game.creeps, (creep) => creep.memory.role == 'carry');
    //     let fillers = _.filter(Game.creeps, (creep) => creep.memory.role == 'filler' && creep.room.name == room.name);
    //     let repairers = _.filter(Game.creeps, (creep) => creep.memory.role == 'repair' && creep.room.name == room.name);
    //     let colobuilders = _.filter(Game.creeps, (creep) => creep.memory.role == 'colobuild');

    
//         if(Game.rooms["E12S39"].find(FIND_HOSTILE_CREEPS) != undefined && Game.rooms["E12S39"].find(FIND_HOSTILE_CREEPS).length != 0 && defenders.length < 1) {
//             let newName = 'Defender' + Game.time;
//             console.log('Spawning new defender: ' + newName);
//             Game.spawns['Spawn1'].spawnCreep([ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,MOVE,MOVE], newName, 
//                 {memory: {role: 'defender'}});  
//         }
//     }
// }
        // else if (Game.rooms["E12S38"].find(FIND_HOSTILE_CREEPS) != undefined && Game.rooms["E12S38"].find(FIND_HOSTILE_CREEPS).length != 0 && attackers.length < 1) {
        // else if(attackers.length < 0) {
        //     let newName = 'Attacker' + Game.time;
        //     console.log('Spawning new attacker: ' + newName);
        //     // Game.spawns['Spawn1'].spawnCreep([TOUGH,TOUGH,TOUGH,TOUGH,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], newName, 
        //     Game.spawns['Spawn1'].spawnCreep([ATTACK,MOVE], newName, 
        //         {memory: {role: 'attacker'}});        
        //     }
            
        //     let newName = 'Attacker' + Game.time;
        //     console.log('Spawning new attacker: ' + newName);
        //     Game.spawns['Spawn1'].spawnCreep([TOUGH,TOUGH,TOUGH,TOUGH,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], newName, 
        //         {memory: {role: 'attacker'}});        
        // }
    

        // else if(remoteWorkers.length < 1 || Game.time % 1470 == 0) {
        //     let newName = 'RemoteWorker' + Game.time;
        //     console.log('Spawning new remote-worker: ' + newName);
        //     Game.spawns['Spawn1'].spawnCreep([WORK, WORK,WORK,WORK,MOVE,MOVE], newName, 
        //         {memory: {role: 'remoteworker'}});        
        // }
    
        // else if(carriers.length < 1) {
        //     let newName = 'Carrier' + Game.time;
        //     console.log('Spawning new carrier: ' + newName);
        //     Game.spawns['Spawn1'].spawnCreep([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], newName, 
        //         {memory: {role: 'carry'}});        
        // }
    
        // && (Game.rooms["E12S37"].find(FIND_STRUCTURES, {filter: object => object.structureType == STRUCTURE_WALL}))
    
    
        // else if(claimers.length < 0) {
        //     let newName = 'Claimer' + Game.time;
        //     console.log('Spawning new claimer: ' + newName);
        //     Game.spawns['Spawn1'].spawnCreep([MOVE,CLAIM], newName, 
        //         {memory: {role: 'claimer'}});        
        // // }
    
    
        // else if(repairers.length < 1) {
        //     let newName = 'Repair' + Game.time;
        //     console.log('Spawning new repairer: ' + newName);
        //     Game.spawns['Spawn1'].spawnCreep([WORK,WORK,WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE], newName, 
        //         {memory: {role: 'repair'}});        
        // }

        // else if(colobuilders.length < 0) {
        //     let newName = 'ColoBuild' + Game.time;
        //     console.log('Spawning new colobuilder: ' + newName);
        //     Game.spawns['Spawn1'].spawnCreep([WORK,WORK,WORK,WORK,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY], newName, 
        //         {memory: {role: 'colobuild'}});        
        // }
}

module.exports = spawning;