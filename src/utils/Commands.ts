import randomWords from "random-words";


global.SD = function(roomName, targetRoomName, boost=false):any {
    let bodyRam6 = [ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE]
    let bodyRam7 = [ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
        MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE];
    let bodyRam8 = [ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
        MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
        MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE];

    let bodySignifer6 = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL];
    let bodySignifer7 = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
        HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL];
    let bodySignifer8 = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
        HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL];

    let bodyRam8Boosted=[TOUGH,ATTACK,TOUGH,ATTACK,TOUGH,
                        ATTACK,TOUGH,ATTACK,TOUGH,ATTACK,
                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                        MOVE,MOVE,MOVE,MOVE,MOVE,
                        MOVE,MOVE,MOVE,MOVE,MOVE];

    let bodySignifer8Boosted=[TOUGH,HEAL,TOUGH,HEAL,TOUGH,
                            HEAL,TOUGH,HEAL,TOUGH,HEAL,
                            HEAL,HEAL,HEAL,HEAL,HEAL,
                            HEAL,HEAL,HEAL,HEAL,HEAL,
                            HEAL,HEAL,HEAL,HEAL,HEAL,
                            HEAL,HEAL,HEAL,HEAL,HEAL,
                            HEAL,HEAL,HEAL,HEAL,HEAL,
                            HEAL,HEAL,HEAL,HEAL,HEAL,
                            MOVE,MOVE,MOVE,MOVE,MOVE,
                            MOVE,MOVE,MOVE,MOVE,MOVE];

    if(Game.rooms[roomName] && Game.rooms[roomName].controller && Game.rooms[roomName].controller.my) {

        if(Game.rooms[roomName].controller.level == 6) {
            let newNameSignifer = 'Signifer-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
            Game.rooms[roomName].memory.spawn_list.push(bodySignifer6,
                newNameSignifer, {memory: {role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName}});
            console.log('Adding Signifer to Spawn List: ' + newNameSignifer);

            let newNameRam = 'Ram-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
            Game.rooms[roomName].memory.spawn_list.push(bodyRam6,
                newNameRam, {memory: {role: 'ram', targetRoom: targetRoomName, homeRoom: roomName}});
            console.log('Adding Ram to Spawn List: ' + newNameRam);



            return "Success";
        }

        else if(Game.rooms[roomName].controller.level == 7) {
            let newNameSignifer = 'Signifer-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
            Game.rooms[roomName].memory.spawn_list.push(bodySignifer7,
                newNameSignifer, {memory: {role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName}});
            console.log('Adding Signifer to Spawn List: ' + newNameSignifer);

            let newNameRam = 'Ram-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
            Game.rooms[roomName].memory.spawn_list.push(bodyRam7,
                newNameRam, {memory: {role: 'ram', targetRoom: targetRoomName, homeRoom: roomName}});
            console.log('Adding Ram to Spawn List: ' + newNameRam);



            return "Success";
        }

        else if(Game.rooms[roomName].controller.level == 8) {
            let room = Game.rooms[roomName];
            let storage:any = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
            if(boost && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] >= 600 && storage.store[RESOURCE_CATALYZED_UTRIUM_ACID] >= 1050 &&
                 storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] >= 1050 && storage.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] >= 300 &&
                 room.memory.labs && room.memory.labs.outputLab3 && room.memory.labs.outputLab4 && room.memory.labs.outputLab6 && room.memory.labs.outputLab7) {
                    if(room.memory.labs.status && !room.memory.labs.status.boost) {
                        room.memory.labs.status.boost = {};
                    }

                    if(room.memory.labs.status.boost) {
                        // utrium acid
                        if(room.memory.labs.status.boost.lab3) {
                            room.memory.labs.status.boost.lab3.amount = room.memory.labs.status.boost.lab3.amount + 1050;
                            room.memory.labs.status.boost.lab3.use = true;
                        }
                        else {
                            room.memory.labs.status.boost.lab3 = {};
                            room.memory.labs.status.boost.lab3.amount = 1050;
                            room.memory.labs.status.boost.lab3.use = true;
                        }
                        // lemer alk
                        if(room.memory.labs.status.boost.lab4) {
                            room.memory.labs.status.boost.lab4.amount = room.memory.labs.status.boost.lab4.amount + 1050;
                            room.memory.labs.status.boost.lab4.use = true;
                        }
                        else {
                            room.memory.labs.status.boost.lab4 = {};
                            room.memory.labs.status.boost.lab4.amount = 1050;
                            room.memory.labs.status.boost.lab4.use = true;
                        }
                        // zyn alk
                        if(room.memory.labs.status.boost.lab6) {
                            room.memory.labs.status.boost.lab6.amount = room.memory.labs.status.boost.lab6.amount + 600;
                            room.memory.labs.status.boost.lab6.use = true;
                        }
                        else {
                            room.memory.labs.status.boost.lab6 = {};
                            room.memory.labs.status.boost.lab6.amount = 600;
                            room.memory.labs.status.boost.lab6.use = true;
                        }
                        // gho alk
                        if(room.memory.labs.status.boost.lab7) {
                            room.memory.labs.status.boost.lab7.amount = room.memory.labs.status.boost.lab7.amount + 300;
                            room.memory.labs.status.boost.lab7.use = true;
                        }
                        else {
                            room.memory.labs.status.boost.lab7 = {};
                            room.memory.labs.status.boost.lab7.amount = 300;
                            room.memory.labs.status.boost.lab7.use = true;
                        }
                    }

                    let newNameSignifer = 'Signifer-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
                    room.memory.spawn_list.push(bodySignifer8Boosted,
                        newNameSignifer, {memory: {role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName, boostlabs:[room.memory.labs.outputLab4,room.memory.labs.outputLab6,room.memory.labs.outputLab7]}});
                    console.log('Adding Signifer to Spawn List: ' + newNameSignifer);


                    let newNameRam = 'Ram-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
                    room.memory.spawn_list.push(bodyRam8Boosted,
                        newNameRam, {memory: {role: 'ram', targetRoom: targetRoomName, homeRoom: roomName, boostlabs:[room.memory.labs.outputLab3,room.memory.labs.outputLab6,room.memory.labs.outputLab7]}});
                    console.log('Adding Ram to Spawn List: ' + newNameRam);

                    return "Success with boost";
            }
            else {
                let newNameSignifer = 'Signifer-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
                room.memory.spawn_list.push(bodySignifer8,
                    newNameSignifer, {memory: {role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName}});
                console.log('Adding Signifer to Spawn List: ' + newNameSignifer);


                let newNameRam = 'Ram-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
                room.memory.spawn_list.push(bodyRam8,
                    newNameRam, {memory: {role: 'ram', targetRoom: targetRoomName, homeRoom: roomName}});
                console.log('Adding Ram to Spawn List: ' + newNameRam);

                return "Success without boost";
            }


        }

    }

}


global.SQ = function(roomName, targetRoomName, boosted=false) {

    let room = Game.rooms[roomName];
    let creepsInRoom = room.find(FIND_MY_CREEPS);
    let fillers = creepsInRoom.filter(function(creep) {return creep.memory.role == "filler";}).length;
    let CreepA = creepsInRoom.filter(function(creep) {return creep.memory.role == "SquadCreepA";}).length;
    let CreepB = creepsInRoom.filter(function(creep) {return creep.memory.role == "SquadCreepB";}).length;
    let CreepY = creepsInRoom.filter(function(creep) {return creep.memory.role == "SquadCreepY";}).length;
    let CreepZ = creepsInRoom.filter(function(creep) {return creep.memory.role == "SquadCreepZ";}).length;
    if(room.controller.level >= 6 && CreepA == 0 && CreepB == 0 && CreepY == 0 && CreepZ == 0) {

        if(fillers < 3) {
            let newName = 'Filler-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, {memory: {role: 'filler'}});
            console.log('Adding filler to Spawn List: ' + newName);
        }

        if(fillers < 4) {
            let newName2 = 'Filler-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName2, {memory: {role: 'filler'}});
            console.log('Adding filler to Spawn List: ' + newName2);
        }


        if(Memory.CanClaimRemote) {
            let newName = 'WallClearer-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
            room.memory.spawn_list.push([CLAIM,MOVE], newName, {memory: {role: 'WallClearer', homeRoom: room.name, targetRoom:targetRoomName}});
            console.log('Adding wall-clearer to Spawn List: ' + newName);
        }


        let bodyLevel6 = [RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                          MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,HEAL,HEAL,HEAL,MOVE,HEAL
        ];

        let bodyLevel7 = [RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                          MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                          HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,MOVE,HEAL
        ];

        let bodyLevel8 = [RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                          MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                          HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,MOVE,HEAL
        ];


        let currentBody;

        if(room.controller.level == 6) {
            currentBody = bodyLevel6;
        }
        else if(room.controller.level == 7) {
            currentBody = bodyLevel7;
        }
        else if(room.controller.level == 8) {
            currentBody = bodyLevel8;
        }
        let RandomWords = randomWords({exactly:3,wordsPerString:1,join: '-'})

        let newNameA = 'SquadCreepA-'+ RandomWords + "-" + room.name;
        room.memory.spawn_list.push(currentBody, newNameA, {memory: {role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25,25,targetRoomName)}});
        console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

        let newNameB = 'SquadCreepB-'+ RandomWords + "-" + room.name;
        room.memory.spawn_list.push(currentBody, newNameB, {memory: {role: 'SquadCreepB', homeRoom: room.name}});
        console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

        let newNameY = 'SquadCreepY-'+ RandomWords + "-" + room.name;
        room.memory.spawn_list.push(currentBody, newNameY, {memory: {role: 'SquadCreepY', homeRoom: room.name}});
        console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

        let newNameZ = 'SquadCreepZ-'+ RandomWords + "-" + room.name;
        room.memory.spawn_list.push(currentBody, newNameZ, {memory: {role: 'SquadCreepZ', homeRoom: room.name}});
        console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);
    }

    // Game.rooms[roomName].memory.spawning_squad.status = true;
    // Game.rooms[roomName].memory.spawning_squad.targetRoom = targetRoomName;
    // Game.rooms[roomName].memory.spawning_squad.boosted = boosted;

    return "Success!"
}

global.SRD = function(roomName, targetRoomName) {
    let newName = 'RemoteDismantler-BIGBOY' + roomName + Math.floor(Math.random() * 100);
    Game.rooms[roomName].memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK], newName, {memory: {role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName}});
    console.log('Adding RemoteDismantler to Spawn List: ' + newName);
    return "Success!"
}
global.SC = function(targetRoomName, x, y) {
    Memory.target_colonise.room = targetRoomName;
    Memory.target_colonise.spawn_pos = new RoomPosition(x,y,targetRoomName);
    Memory.target_colonise.lastSpawnRanger = 1501;
    return "Success!"
}
