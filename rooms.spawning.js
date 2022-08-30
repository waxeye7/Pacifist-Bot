function getBody(segment, room, divisor=1) {
    let body = [];
    let segmentCost = _.sum(segment, s => BODYPART_COST[s]);
    let energyAvailable = room.energyAvailable;
    let maxSegments = Math.floor(energyAvailable / segmentCost / divisor);
    _.times(maxSegments, function() {_.forEach(segment, s => body.push(s));});

    return body;
}


function spawning(room) {

    // info section below

    let workers = _.filter(Game.creeps, (creep) => creep.memory.role == 'worker' && creep.room.name == room.name);
    let builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder' && creep.room.name == room.name);
    let upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader' && creep.room.name == room.name);
    let fillers = _.filter(Game.creeps, (creep) => creep.memory.role == 'filler' && creep.room.name == room.name);
    let repairers = _.filter(Game.creeps, (creep) => creep.memory.role == 'repair' && creep.room.name == room.name);

    let defenders = _.filter(Game.creeps, (creep) => creep.memory.role == 'defender' && creep.room.name == room.name);

    let EnergyMiners = _.filter(Game.creeps, (creep) => creep.memory.role == 'EnergyMiner');



    console.log("Room-" + room.name + " has " + workers.length + " Workers and " + builders.length + " Builders and " + upgraders.length +
    " Upgraders and " + repairers.length + " Repairers and " + fillers.length
    + " Fillers and [" + EnergyMiners.length + " Energy-Miners in all rooms]");


// info section above

    let spawns = room.find(FIND_MY_STRUCTURES, {
        filter: { structureType : STRUCTURE_SPAWN}});

    spawns = _. filter(spawns, structure => structure.spawning == null);

    if(!spawns.length) {
        return;
    }

    
    let worker_people = [];
    for(let creep in Game.creeps) {
        if(Game.creeps[creep].memory.role == 'worker' && Game.creeps[creep].memory.homeRoom == room.name) {
            worker_people.push(Game.creeps[creep]);
       }
    }

    let totalWorkPartsOnWorkers = 0;
    for(let worker in worker_people) {
        for (let part in worker_people[worker].body)
        if((worker_people[worker].body[part].type) == "work") {
            totalWorkPartsOnWorkers = totalWorkPartsOnWorkers + 1;
        }
    }

    console.log(totalWorkPartsOnWorkers + " in room " + room.name)



    let workerTargetAmount = _.get(room.memory, ['census', 'worker'], 0);
    let upgraderTargetAmount = _.get(room.memory, ['census', 'upgrader'], 1);
    let builderTargetAmount = _.get(room.memory, ['census', 'builder'], 1);
    let fillerTargetAmount = _.get(room.memory, ['census', 'filler'], 1);
    let repairerTargetAmount = _.get(room.memory, ['census', 'repair'], 1);

    let sites = room.find(FIND_CONSTRUCTION_SITES);

    let storage = Game.getObjectById(room.memory.storage) || room.findStorage();

    if ((fillers.length < fillerTargetAmount) || (room.find(FIND_HOSTILE_CREEPS) == true && fillers.length < 3) && storage) {
        let newName = 'Filler' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        console.log('Spawning new filler: ' + newName);
        let result = spawns[0].spawnCreep([CARRY,CARRY,MOVE], newName, 
            {memory: {role: 'filler'}});
        if(result == OK) {
            return;
        }
    }

    if (workers.length < workerTargetAmount && totalWorkPartsOnWorkers < 10) {
        let newName = 'Worker' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        console.log('Spawning new worker: ' + newName);
        let result = spawns[0].spawnCreep(getBody([WORK,CARRY,MOVE], room, 2), newName, 
            {memory: {role: 'worker', homeRoom: room.name}});
        if(result == OK) {
            return;
        }  
    }


    if(repairers.length < repairerTargetAmount) {
        let newName = 'Repair' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        console.log('Spawning new repairer: ' + newName + "-" + room.name);
        let result = spawns[0].spawnCreep(getBody([WORK,CARRY,MOVE], room), newName, 
            {memory: {role: 'repair'}});
        if(result == OK) {
            return;
        }
    }


    if(room.find(FIND_HOSTILE_CREEPS) != undefined && room.find(FIND_HOSTILE_CREEPS).length != 0 && defenders.length < 2) {
        let newName = 'Defender' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        console.log('Spawning new defender: ' + newName);
        let result = spawns[0].spawnCreep(getBody([ATTACK,ATTACK,ATTACK,MOVE], room), newName, 
            {memory: {role: 'defender'}});  
        if(result == OK) {
            return;
        }
    }



    if (upgraders.length < upgraderTargetAmount) {
        let newName = 'Upgrader' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        console.log('Spawning new upgrader: ' + newName);
        let result = spawns[0].spawnCreep(getBody([WORK,CARRY,MOVE], room), newName, 
            {memory: {role: 'upgrader'}});  
        if(result == OK) {
            return;
        }
    }

    let resourceData = _.get(room.memory, ['resources']);


    _.forEach(resourceData, function(data, targetRoomName){
        _.forEach(data.energy, function(values, sourceId) {
            if (Game.time - (values.lastSpawnMiner || 0) > CREEP_LIFE_TIME) {
                let newName = 'EnergyMiner' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
                console.log('Spawning new EnergyMiner: ' + newName);
                let result = spawns[0].spawnCreep([WORK,WORK,WORK,MOVE], newName, 
                    {memory: {role: 'EnergyMiner', sourceId, targetRoom: targetRoomName, homeRoom: room.name}});

                if(result == OK) {
                    values.lastSpawnMiner = Game.time;
                    return;
                }
            
            }
        });
    });

    _.forEach(resourceData, function(data, targetRoomName){
        _.forEach(data.energy, function(values, sourceId) {
            if (Game.time - (values.lastSpawnCarrier || 0) > CREEP_LIFE_TIME) {
                let newName = 'Carrier' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
                console.log('Spawning new Carrier: ' + newName);
                if(targetRoomName == room.name) {
                    let result = spawns[0].spawnCreep([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, 
                        {memory: {role: 'carry', targetRoom: targetRoomName, homeRoom: room.name}});
                    if(result == OK) {
                        values.lastSpawnCarrier = Game.time;
                        return;
                    }
                }
                else {
                    let result = spawns[0].spawnCreep([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,WORK,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], newName, 
                        {memory: {role: 'carry', targetRoom: targetRoomName, homeRoom: room.name}});
                    if(result == OK) {
                        values.lastSpawnCarrier = Game.time;
                        return;
                    }
                }
            }
        });
    });

    


    if(sites.length > 0 && builders.length < builderTargetAmount) {
        let newName = 'Builder' + Math.floor((Game.time/11) - 3739341) + "-" + room.name;
        console.log('Spawning new builder: ' + newName);
        let result = spawns[0].spawnCreep(getBody([WORK,CARRY,MOVE], room), newName, 
            {memory: {role: 'builder'}});
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
    
        // else if(containerbuilders.length < 0) {
        //     let newName = 'ContainerBuilder' + Game.time;
        //     console.log('Spawning new containerbuilder: ' + newName);
        //     Game.spawns['Spawn1'].spawnCreep([MOVE,WORK,CARRY], newName, 
        //         {memory: {role: 'buildcontainer'}});        
        // }
    
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
    

module.exports = spawning;