import randomWords from "random-words";

global.SD = function(roomName, targetRoomName, boost=false):any {
    let bodyRam6 = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK]
    let bodyRam7 = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK];
    let bodyRam8 = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
        MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK];

    let bodySignifer6 = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL];
    let bodySignifer7 = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
        HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL];
    let bodySignifer8 = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
        HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL];

    let bodyRam8Boosted=[TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,
                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                        MOVE,MOVE,MOVE,MOVE,MOVE,
                        MOVE,MOVE,MOVE,MOVE,MOVE];

    let bodySignifer8Boosted=[TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,
                            HEAL,HEAL,HEAL,HEAL,HEAL,
                            HEAL,HEAL,HEAL,HEAL,HEAL,
                            HEAL,HEAL,HEAL,HEAL,HEAL,
                            HEAL,HEAL,HEAL,HEAL,HEAL,
                            HEAL,HEAL,HEAL,HEAL,HEAL,
                            HEAL,HEAL,HEAL,HEAL,HEAL,
                            HEAL,HEAL,HEAL,HEAL,HEAL,
                            MOVE,MOVE,MOVE,MOVE,MOVE,
                            MOVE,MOVE,MOVE,MOVE,MOVE];

    let room = Game.rooms[roomName];

    if(room && room.controller && room.controller.my) {
        let creepsInRoom = room.find(FIND_MY_CREEPS);
        let fillers = creepsInRoom.filter(function(creep) {return creep.memory.role == "filler";}).length;
        if(fillers < 2) {
            let newName = 'Filler-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, {memory: {role: 'filler'}});
            console.log('Adding filler to Spawn List: ' + newName);
        }
        if(fillers < 3) {
            let newName = 'Filler-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, {memory: {role: 'filler'}});
            console.log('Adding filler to Spawn List: ' + newName);
        }


        if(room.controller.level == 6) {
            let newNameSignifer = 'Signifer-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
            room.memory.spawn_list.push(bodySignifer6,
                newNameSignifer, {memory: {role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName}});
            console.log('Adding Signifer to Spawn List: ' + newNameSignifer);

            let newNameRam = 'Ram-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
            room.memory.spawn_list.push(bodyRam6,
                newNameRam, {memory: {role: 'ram', targetRoom: targetRoomName, homeRoom: roomName}});
            console.log('Adding Ram to Spawn List: ' + newNameRam);



            return "Success";
        }

        else if(room.controller.level == 7) {
            let newNameSignifer = 'Signifer-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
            room.memory.spawn_list.push(bodySignifer7,
                newNameSignifer, {memory: {role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName}});
            console.log('Adding Signifer to Spawn List: ' + newNameSignifer);

            let newNameRam = 'Ram-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
            room.memory.spawn_list.push(bodyRam7,
                newNameRam, {memory: {role: 'ram', targetRoom: targetRoomName, homeRoom: roomName}});
            console.log('Adding Ram to Spawn List: ' + newNameRam);



            return "Success";
        }

        else if(room.controller.level == 8) {
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
                            room.memory.labs.status.boost.lab3.use += 1;
                        }
                        else {
                            room.memory.labs.status.boost.lab3 = {};
                            room.memory.labs.status.boost.lab3.amount = 1050;
                            room.memory.labs.status.boost.lab3.use = 1;
                        }
                        // lemer alk
                        if(room.memory.labs.status.boost.lab4) {
                            room.memory.labs.status.boost.lab4.amount = room.memory.labs.status.boost.lab4.amount + 1050;
                            room.memory.labs.status.boost.lab4.use += 1;
                        }
                        else {
                            room.memory.labs.status.boost.lab4 = {};
                            room.memory.labs.status.boost.lab4.amount = 1050;
                            room.memory.labs.status.boost.lab4.use = 1;
                        }
                        // zyn alk
                        if(room.memory.labs.status.boost.lab6) {
                            room.memory.labs.status.boost.lab6.amount = room.memory.labs.status.boost.lab6.amount + 600;
                            room.memory.labs.status.boost.lab6.use += 2;
                        }
                        else {
                            room.memory.labs.status.boost.lab6 = {};
                            room.memory.labs.status.boost.lab6.amount = 600;
                            room.memory.labs.status.boost.lab6.use = 2;
                        }
                        // gho alk
                        if(room.memory.labs.status.boost.lab7) {
                            room.memory.labs.status.boost.lab7.amount = room.memory.labs.status.boost.lab7.amount + 300;
                            room.memory.labs.status.boost.lab7.use += 2;
                        }
                        else {
                            room.memory.labs.status.boost.lab7 = {};
                            room.memory.labs.status.boost.lab7.amount = 300;
                            room.memory.labs.status.boost.lab7.use = 2;
                        }
                    }


                    let newNameRam = 'Ram-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
                    room.memory.spawn_list.push(bodyRam8Boosted,
                        newNameRam, {memory: {role: 'ram', targetRoom: targetRoomName, homeRoom: roomName, boostlabs:[room.memory.labs.outputLab3,room.memory.labs.outputLab6,room.memory.labs.outputLab7]}});
                    console.log('Adding Ram to Spawn List: ' + newNameRam);

                    let newNameSignifer = 'Signifer-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
                    room.memory.spawn_list.push(bodySignifer8Boosted,
                        newNameSignifer, {memory: {role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName, boostlabs:[room.memory.labs.outputLab4,room.memory.labs.outputLab6,room.memory.labs.outputLab7]}});
                    console.log('Adding Signifer to Spawn List: ' + newNameSignifer);




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

global.SDB = function(roomName, targetRoomName, boost=false):any {
    let bodyRam6 = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK]
    let bodyRam7 = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK];
    let bodyRam8 = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
        MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK];

    let bodySignifer6 = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL];
    let bodySignifer7 = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
        HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL];
    let bodySignifer8 = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
        HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL];

    let bodyRam8Boosted=[TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,
                        TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,
                        TOUGH,ATTACK,ATTACK,ATTACK,ATTACK,
                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                        MOVE,MOVE,MOVE,MOVE,MOVE,
                        MOVE,MOVE,MOVE,MOVE,MOVE];

    let bodySignifer8Boosted=[TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,
                            TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,
                            TOUGH,HEAL,HEAL,HEAL,HEAL,
                            HEAL,HEAL,HEAL,HEAL,HEAL,
                            HEAL,HEAL,HEAL,HEAL,HEAL,
                            HEAL,HEAL,HEAL,HEAL,HEAL,
                            HEAL,HEAL,HEAL,HEAL,HEAL,
                            HEAL,HEAL,HEAL,HEAL,HEAL,
                            MOVE,MOVE,MOVE,MOVE,MOVE,
                            MOVE,MOVE,MOVE,MOVE,MOVE];

    let room = Game.rooms[roomName];

    if(room && room.controller && room.controller.my) {
        let creepsInRoom = room.find(FIND_MY_CREEPS);
        let fillers = creepsInRoom.filter(function(creep) {return creep.memory.role == "filler";}).length;
        if(fillers < 2) {
            let newName = 'Filler-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, {memory: {role: 'filler'}});
            console.log('Adding filler to Spawn List: ' + newName);
        }
        if(fillers < 3) {
            let newName = 'Filler-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, {memory: {role: 'filler'}});
            console.log('Adding filler to Spawn List: ' + newName);
        }


        if(room.controller.level == 6) {
            let newNameSignifer = 'Signifer-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
            room.memory.spawn_list.push(bodySignifer6,
                newNameSignifer, {memory: {role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName}});
            console.log('Adding Signifer to Spawn List: ' + newNameSignifer);

            let newNameRam = 'Ram-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
            room.memory.spawn_list.push(bodyRam6,
                newNameRam, {memory: {role: 'ram', targetRoom: targetRoomName, homeRoom: roomName}});
            console.log('Adding Ram to Spawn List: ' + newNameRam);



            return "Success";
        }

        else if(room.controller.level == 7) {
            let newNameSignifer = 'Signifer-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
            room.memory.spawn_list.push(bodySignifer7,
                newNameSignifer, {memory: {role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName}});
            console.log('Adding Signifer to Spawn List: ' + newNameSignifer);

            let newNameRam = 'Ram-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
            room.memory.spawn_list.push(bodyRam7,
                newNameRam, {memory: {role: 'ram', targetRoom: targetRoomName, homeRoom: roomName}});
            console.log('Adding Ram to Spawn List: ' + newNameRam);



            return "Success";
        }

        else if(room.controller.level == 8) {
            let storage:any = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
            if(boost && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] >= 600 && storage.store[RESOURCE_CATALYZED_UTRIUM_ACID] >= 870 &&
                 storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] >= 870 && storage.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] >= 660 &&
                 room.memory.labs && room.memory.labs.outputLab3 && room.memory.labs.outputLab4 && room.memory.labs.outputLab6 && room.memory.labs.outputLab7) {
                    if(room.memory.labs.status && !room.memory.labs.status.boost) {
                        room.memory.labs.status.boost = {};
                    }

                    if(room.memory.labs.status.boost) {
                        // utrium acid
                        if(room.memory.labs.status.boost.lab3) {
                            room.memory.labs.status.boost.lab3.amount = room.memory.labs.status.boost.lab3.amount + 870;
                            room.memory.labs.status.boost.lab3.use += 1;
                        }
                        else {
                            room.memory.labs.status.boost.lab3 = {};
                            room.memory.labs.status.boost.lab3.amount = 870;
                            room.memory.labs.status.boost.lab3.use = 1;
                        }
                        // lemer alk
                        if(room.memory.labs.status.boost.lab4) {
                            room.memory.labs.status.boost.lab4.amount = room.memory.labs.status.boost.lab4.amount + 870;
                            room.memory.labs.status.boost.lab4.use += 1;
                        }
                        else {
                            room.memory.labs.status.boost.lab4 = {};
                            room.memory.labs.status.boost.lab4.amount = 870;
                            room.memory.labs.status.boost.lab4.use = 1;
                        }
                        // zyn alk
                        if(room.memory.labs.status.boost.lab6) {
                            room.memory.labs.status.boost.lab6.amount = room.memory.labs.status.boost.lab6.amount + 600;
                            room.memory.labs.status.boost.lab6.use += 2;
                        }
                        else {
                            room.memory.labs.status.boost.lab6 = {};
                            room.memory.labs.status.boost.lab6.amount = 600;
                            room.memory.labs.status.boost.lab6.use = 2;
                        }
                        // gho alk
                        if(room.memory.labs.status.boost.lab7) {
                            room.memory.labs.status.boost.lab7.amount = room.memory.labs.status.boost.lab7.amount + 660;
                            room.memory.labs.status.boost.lab7.use += 2;
                        }
                        else {
                            room.memory.labs.status.boost.lab7 = {};
                            room.memory.labs.status.boost.lab7.amount = 660;
                            room.memory.labs.status.boost.lab7.use = 2;
                        }
                    }


                    let newNameRam = 'Ram-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
                    room.memory.spawn_list.push(bodyRam8Boosted,
                        newNameRam, {memory: {role: 'ram', targetRoom: targetRoomName, homeRoom: roomName, boostlabs:[room.memory.labs.outputLab3,room.memory.labs.outputLab6,room.memory.labs.outputLab7]}});
                    console.log('Adding Ram to Spawn List: ' + newNameRam);

                    let newNameSignifer = 'Signifer-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
                    room.memory.spawn_list.push(bodySignifer8Boosted,
                        newNameSignifer, {memory: {role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName, boostlabs:[room.memory.labs.outputLab4,room.memory.labs.outputLab6,room.memory.labs.outputLab7]}});
                    console.log('Adding Signifer to Spawn List: ' + newNameSignifer);




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

global.SQR = function(roomName, targetRoomName, boost=false):any {

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
            room.memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,CLAIM,MOVE], newName, {memory: {role: 'WallClearer', homeRoom: room.name, targetRoom:targetRoomName}});
            console.log('Adding wall-clearer to Spawn List: ' + newName);
        }

        let bodyLevel6Back = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,MOVE];
        let bodyLevel6Front = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
            RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
            MOVE];

        let bodyLevel7Back = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                          HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,MOVE];

        let bodyLevel7Front = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
        RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
        RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,MOVE];



        let bodyLevel8Back = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
            HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,
            MOVE];

        let bodyLevel8Front = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
            RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
            RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
            RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
            MOVE]

        let bodyLevel8BoostedBack = [HEAL,HEAL,HEAL,HEAL,HEAL,
            MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
            HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,
            HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,
            HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,
            MOVE];

        let bodyLevel8BoostedFront = [RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                      RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                      MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                                      RANGED_ATTACK,RANGED_ATTACK,
                                      RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                      RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                      RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                      RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                      RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
                                      MOVE];


        let RandomWords = randomWords({exactly:3,wordsPerString:1,join: '-'});

        if(room.controller.level == 6) {
            let newNameA = 'SquadCreepA-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Back, newNameA, {memory: {role: 'SquadCreepA', targetPosition: new RoomPosition(25,25,targetRoomName)}});
            console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

            let newNameB = 'SquadCreepB-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Back, newNameB, {memory: {role: 'SquadCreepB'}});
            console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

            let newNameY = 'SquadCreepY-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Front, newNameY, {memory: {role: 'SquadCreepY'}});
            console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

            let newNameZ = 'SquadCreepZ-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Front, newNameZ, {memory: {role: 'SquadCreepZ', homeRoom: room.name}});
            console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

            return "Success!"
        }
        else if(room.controller.level == 7) {
            let newNameA = 'SquadCreepA-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Back, newNameA, {memory: {role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25,25,targetRoomName)}});
            console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

            let newNameB = 'SquadCreepB-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Back, newNameB, {memory: {role: 'SquadCreepB', homeRoom: room.name}});
            console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

            let newNameY = 'SquadCreepY-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Front, newNameY, {memory: {role: 'SquadCreepY', homeRoom: room.name}});
            console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

            let newNameZ = 'SquadCreepZ-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Front, newNameZ, {memory: {role: 'SquadCreepZ', homeRoom: room.name}});
            console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

            return "Success!"
        }

        else if(room.controller.level == 8) {



            let storage:any = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
            if(boost && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] >= 1200 && storage.store[RESOURCE_CATALYZED_KEANIUM_ALKALIDE] >= 2400 &&
                 storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] >= 2400 &&
                 room.memory.labs && room.memory.labs.outputLab4 && room.memory.labs.outputLab5 && room.memory.labs.outputLab6 && room.memory.labs.outputLab7) {

                    if(room.memory.labs.status && !room.memory.labs.status.boost) {
                        room.memory.labs.status.boost = {};
                    }

                    if(room.memory.labs.status.boost) {
                        // lemer alk
                        if(room.memory.labs.status.boost.lab4) {
                            room.memory.labs.status.boost.lab4.amount = room.memory.labs.status.boost.lab4.amount + 2400;
                            room.memory.labs.status.boost.lab4.use += 2;
                        }
                        else {
                            room.memory.labs.status.boost.lab4 = {};
                            room.memory.labs.status.boost.lab4.amount = 2400;
                            room.memory.labs.status.boost.lab4.use = 2;
                        }
                        // keanium alk
                        if(room.memory.labs.status.boost.lab5) {
                            room.memory.labs.status.boost.lab5.amount = room.memory.labs.status.boost.lab5.amount + 2400;
                            room.memory.labs.status.boost.lab5.use += 2;
                        }
                        else {
                            room.memory.labs.status.boost.lab5 = {};
                            room.memory.labs.status.boost.lab5.amount = 2400;
                            room.memory.labs.status.boost.lab5.use = 2;
                        }
                        // zyn alk
                        if(room.memory.labs.status.boost.lab6) {
                            room.memory.labs.status.boost.lab6.amount = room.memory.labs.status.boost.lab6.amount + 1200;
                            room.memory.labs.status.boost.lab6.use += 4;
                        }
                        else {
                            room.memory.labs.status.boost.lab6 = {};
                            room.memory.labs.status.boost.lab6.amount = 1200;
                            room.memory.labs.status.boost.lab6.use = 4;
                        }
                        // // gho alk
                        // if(room.memory.labs.status.boost.lab7) {
                        //     room.memory.labs.status.boost.lab7.amount = room.memory.labs.status.boost.lab7.amount + 240;
                        //     room.memory.labs.status.boost.lab7.use += 4;
                        // }
                        // else {
                        //     room.memory.labs.status.boost.lab7 = {};
                        //     room.memory.labs.status.boost.lab7.amount = 240;
                        //     room.memory.labs.status.boost.lab7.use = 4;
                        // }
                    }

                    let newNameA = 'SquadCreepA-'+ RandomWords + "-" + room.name;
                    room.memory.spawn_list.push(bodyLevel8BoostedBack, newNameA, {memory: {role: 'SquadCreepA', homeRoom: room.name, boostlabs:[room.memory.labs.outputLab4,room.memory.labs.outputLab6], targetPosition: new RoomPosition(25,25,targetRoomName)}});
                    console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

                    let newNameB = 'SquadCreepB-'+ RandomWords + "-" + room.name;
                    room.memory.spawn_list.push(bodyLevel8BoostedBack, newNameB, {memory: {role: 'SquadCreepB', homeRoom: room.name, boostlabs:[room.memory.labs.outputLab4,room.memory.labs.outputLab6]}});
                    console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

                    let newNameY = 'SquadCreepY-'+ RandomWords + "-" + room.name;
                    room.memory.spawn_list.push(bodyLevel8BoostedFront, newNameY, {memory: {role: 'SquadCreepY', homeRoom: room.name, boostlabs:[room.memory.labs.outputLab5,room.memory.labs.outputLab6]}});
                    console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

                    let newNameZ = 'SquadCreepZ-'+ RandomWords + "-" + room.name;
                    room.memory.spawn_list.push(bodyLevel8BoostedFront, newNameZ, {memory: {role: 'SquadCreepZ', homeRoom: room.name, boostlabs:[room.memory.labs.outputLab5,room.memory.labs.outputLab6]}});
                    console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

                    return "Success with boost";


                 }

            else {
                let newNameA = 'SquadCreepA-'+ RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Back, newNameA, {memory: {role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25,25,targetRoomName)}});
                console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

                let newNameB = 'SquadCreepB-'+ RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Back, newNameB, {memory: {role: 'SquadCreepB', homeRoom: room.name}});
                console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

                let newNameY = 'SquadCreepY-'+ RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Front, newNameY, {memory: {role: 'SquadCreepY', homeRoom: room.name}});
                console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

                let newNameZ = 'SquadCreepZ-'+ RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Front, newNameZ, {memory: {role: 'SquadCreepZ', homeRoom: room.name}});
                console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

                return "Success!"
            }


        }
    }



}

global.SQM = function(roomName, targetRoomName, boost=false):any {

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
            room.memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,CLAIM,MOVE], newName, {memory: {role: 'WallClearer', homeRoom: room.name, targetRoom:targetRoomName}});
            console.log('Adding wall-clearer to Spawn List: ' + newName);
        }

        let bodyLevel6Back = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,MOVE];
        let bodyLevel6Front = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
            ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
            MOVE];

        let bodyLevel7Back = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                          HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,MOVE];

        let bodyLevel7Front = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,MOVE];



        let bodyLevel8Back = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
            HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,
            MOVE];

        let bodyLevel8Front = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
            ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
            MOVE]

        let bodyLevel8BoostedBack = [HEAL,HEAL,HEAL,HEAL,HEAL,
            MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
            HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,
            HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,
            HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,
            MOVE];

        let bodyLevel8BoostedFront = [ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                      ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                      MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                                      ATTACK,ATTACK,
                                      ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                      ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                      ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                      ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                      ATTACK,ATTACK,ATTACK,ATTACK,
                                      MOVE];


        let RandomWords = randomWords({exactly:3,wordsPerString:1,join: '-'});

        if(room.controller.level == 6) {
            let newNameA = 'SquadCreepA-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Back, newNameA, {memory: {role: 'SquadCreepA', targetPosition: new RoomPosition(25,25,targetRoomName)}});
            console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

            let newNameB = 'SquadCreepB-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Back, newNameB, {memory: {role: 'SquadCreepB'}});
            console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

            let newNameY = 'SquadCreepY-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Front, newNameY, {memory: {role: 'SquadCreepY'}});
            console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

            let newNameZ = 'SquadCreepZ-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Front, newNameZ, {memory: {role: 'SquadCreepZ', homeRoom: room.name}});
            console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

            return "Success!"
        }
        else if(room.controller.level == 7) {
            let newNameA = 'SquadCreepA-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Back, newNameA, {memory: {role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25,25,targetRoomName)}});
            console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

            let newNameB = 'SquadCreepB-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Back, newNameB, {memory: {role: 'SquadCreepB', homeRoom: room.name}});
            console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

            let newNameY = 'SquadCreepY-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Front, newNameY, {memory: {role: 'SquadCreepY', homeRoom: room.name}});
            console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

            let newNameZ = 'SquadCreepZ-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Front, newNameZ, {memory: {role: 'SquadCreepZ', homeRoom: room.name}});
            console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

            return "Success!"
        }

        else if(room.controller.level == 8) {



            let storage:any = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
            if(boost && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] >= 1200 && storage.store[RESOURCE_CATALYZED_UTRIUM_ACID] >= 2400 &&
                 storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] >= 2400 &&
                 room.memory.labs && room.memory.labs.outputLab3 && room.memory.labs.outputLab4 && room.memory.labs.outputLab6 && room.memory.labs.outputLab7) {

                    if(room.memory.labs.status && !room.memory.labs.status.boost) {
                        room.memory.labs.status.boost = {};
                    }

                    if(room.memory.labs.status.boost) {
                        // lemer alk
                        if(room.memory.labs.status.boost.lab4) {
                            room.memory.labs.status.boost.lab4.amount = room.memory.labs.status.boost.lab4.amount + 2400;
                            room.memory.labs.status.boost.lab4.use += 2;
                        }
                        else {
                            room.memory.labs.status.boost.lab4 = {};
                            room.memory.labs.status.boost.lab4.amount = 2400;
                            room.memory.labs.status.boost.lab4.use = 2;
                        }
                        // UTRIUM ACID
                        if(room.memory.labs.status.boost.lab3) {
                            room.memory.labs.status.boost.lab3.amount = room.memory.labs.status.boost.lab3.amount + 2400;
                            room.memory.labs.status.boost.lab3.use += 2;
                        }
                        else {
                            room.memory.labs.status.boost.lab3 = {};
                            room.memory.labs.status.boost.lab3.amount = 2400;
                            room.memory.labs.status.boost.lab3.use = 2;
                        }
                        // zyn alk
                        if(room.memory.labs.status.boost.lab6) {
                            room.memory.labs.status.boost.lab6.amount = room.memory.labs.status.boost.lab6.amount + 1200;
                            room.memory.labs.status.boost.lab6.use += 4;
                        }
                        else {
                            room.memory.labs.status.boost.lab6 = {};
                            room.memory.labs.status.boost.lab6.amount = 1200;
                            room.memory.labs.status.boost.lab6.use = 4;
                        }
                        // // gho alk
                        // if(room.memory.labs.status.boost.lab7) {
                        //     room.memory.labs.status.boost.lab7.amount = room.memory.labs.status.boost.lab7.amount + 240;
                        //     room.memory.labs.status.boost.lab7.use += 4;
                        // }
                        // else {
                        //     room.memory.labs.status.boost.lab7 = {};
                        //     room.memory.labs.status.boost.lab7.amount = 240;
                        //     room.memory.labs.status.boost.lab7.use = 4;
                        // }
                    }

                    let newNameA = 'SquadCreepA-'+ RandomWords + "-" + room.name;
                    room.memory.spawn_list.push(bodyLevel8BoostedBack, newNameA, {memory: {role: 'SquadCreepA', homeRoom: room.name, boostlabs:[room.memory.labs.outputLab4,room.memory.labs.outputLab6], targetPosition: new RoomPosition(25,25,targetRoomName)}});
                    console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

                    let newNameB = 'SquadCreepB-'+ RandomWords + "-" + room.name;
                    room.memory.spawn_list.push(bodyLevel8BoostedBack, newNameB, {memory: {role: 'SquadCreepB', homeRoom: room.name, boostlabs:[room.memory.labs.outputLab4,room.memory.labs.outputLab6]}});
                    console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

                    let newNameY = 'SquadCreepY-'+ RandomWords + "-" + room.name;
                    room.memory.spawn_list.push(bodyLevel8BoostedFront, newNameY, {memory: {role: 'SquadCreepY', homeRoom: room.name, boostlabs:[room.memory.labs.outputLab3,room.memory.labs.outputLab6]}});
                    console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

                    let newNameZ = 'SquadCreepZ-'+ RandomWords + "-" + room.name;
                    room.memory.spawn_list.push(bodyLevel8BoostedFront, newNameZ, {memory: {role: 'SquadCreepZ', homeRoom: room.name, boostlabs:[room.memory.labs.outputLab3,room.memory.labs.outputLab6]}});
                    console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

                    return "Success with boost";


                 }

            else {
                let newNameA = 'SquadCreepA-'+ RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Back, newNameA, {memory: {role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25,25,targetRoomName)}});
                console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

                let newNameB = 'SquadCreepB-'+ RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Back, newNameB, {memory: {role: 'SquadCreepB', homeRoom: room.name}});
                console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

                let newNameY = 'SquadCreepY-'+ RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Front, newNameY, {memory: {role: 'SquadCreepY', homeRoom: room.name}});
                console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

                let newNameZ = 'SquadCreepZ-'+ RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Front, newNameZ, {memory: {role: 'SquadCreepZ', homeRoom: room.name}});
                console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

                return "Success!"
            }


        }
    }



}

global.SQD = function(roomName, targetRoomName, boost=false):any {

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
            room.memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,CLAIM,MOVE], newName, {memory: {role: 'WallClearer', homeRoom: room.name, targetRoom:targetRoomName}});
            console.log('Adding wall-clearer to Spawn List: ' + newName);
        }

        let bodyLevel6Back = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,MOVE];
        let bodyLevel6Front = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
            WORK,WORK,WORK,WORK,WORK,WORK,WORK,
            MOVE];

        let bodyLevel7Back = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                          HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,MOVE];

        let bodyLevel7Front = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
            WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,
            WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,MOVE];



        let bodyLevel8Back = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
            HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,
            MOVE];

        let bodyLevel8Front = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
            WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,
            WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,
            WORK,WORK,WORK,
            MOVE]

        let bodyLevel8BoostedBack = [HEAL,HEAL,HEAL,HEAL,HEAL,
            MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
            HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,
            HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,
            HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,
            MOVE];

        let bodyLevel8BoostedFront = [WORK,WORK,WORK,WORK,WORK,
            WORK,WORK,WORK,WORK,WORK,
                                      MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
                                      WORK,WORK,
                                      WORK,WORK,WORK,WORK,WORK,WORK,
                                      WORK,WORK,WORK,WORK,WORK,WORK,
                                      WORK,WORK,WORK,WORK,WORK,WORK,
                                      WORK,WORK,WORK,WORK,WORK,WORK,
                                      WORK,WORK,WORK,WORK,
                                      MOVE];


        let RandomWords = randomWords({exactly:3,wordsPerString:1,join: '-'});

        if(room.controller.level == 6) {
            let newNameA = 'SquadCreepA-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Back, newNameA, {memory: {role: 'SquadCreepA', targetPosition: new RoomPosition(25,25,targetRoomName)}});
            console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

            let newNameB = 'SquadCreepB-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Back, newNameB, {memory: {role: 'SquadCreepB'}});
            console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

            let newNameY = 'SquadCreepY-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Front, newNameY, {memory: {role: 'SquadCreepY'}});
            console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

            let newNameZ = 'SquadCreepZ-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Front, newNameZ, {memory: {role: 'SquadCreepZ', homeRoom: room.name}});
            console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

            return "Success!"
        }
        else if(room.controller.level == 7) {
            let newNameA = 'SquadCreepA-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Back, newNameA, {memory: {role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25,25,targetRoomName)}});
            console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

            let newNameB = 'SquadCreepB-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Back, newNameB, {memory: {role: 'SquadCreepB', homeRoom: room.name}});
            console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

            let newNameY = 'SquadCreepY-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Front, newNameY, {memory: {role: 'SquadCreepY', homeRoom: room.name}});
            console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

            let newNameZ = 'SquadCreepZ-'+ RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Front, newNameZ, {memory: {role: 'SquadCreepZ', homeRoom: room.name}});
            console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

            return "Success!"
        }

        else if(room.controller.level == 8) {



            let storage:any = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
            if(boost && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] >= 1200 && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ACID] >= 2400 &&
                 storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] >= 2400 &&
                 room.memory.labs && room.memory.labs.outputLab4 && room.memory.labs.outputLab8 && room.memory.labs.outputLab6 && room.memory.labs.outputLab7) {

                    if(room.memory.labs.status && !room.memory.labs.status.boost) {
                        room.memory.labs.status.boost = {};
                    }

                    if(room.memory.labs.status.boost) {
                        // lemer alk
                        if(room.memory.labs.status.boost.lab4) {
                            room.memory.labs.status.boost.lab4.amount = room.memory.labs.status.boost.lab4.amount + 2400;
                            room.memory.labs.status.boost.lab4.use += 2;
                        }
                        else {
                            room.memory.labs.status.boost.lab4 = {};
                            room.memory.labs.status.boost.lab4.amount = 2400;
                            room.memory.labs.status.boost.lab4.use = 2;
                        }
                        // ZYN ACID
                        if(room.memory.labs.status.boost.lab8) {
                            room.memory.labs.status.boost.lab8.amount = room.memory.labs.status.boost.lab8.amount + 2400;
                            room.memory.labs.status.boost.lab8.use += 2;
                        }
                        else {
                            room.memory.labs.status.boost.lab8 = {};
                            room.memory.labs.status.boost.lab8.amount = 2400;
                            room.memory.labs.status.boost.lab8.use = 2;
                        }
                        // zyn alk
                        if(room.memory.labs.status.boost.lab6) {
                            room.memory.labs.status.boost.lab6.amount = room.memory.labs.status.boost.lab6.amount + 1200;
                            room.memory.labs.status.boost.lab6.use += 4;
                        }
                        else {
                            room.memory.labs.status.boost.lab6 = {};
                            room.memory.labs.status.boost.lab6.amount = 1200;
                            room.memory.labs.status.boost.lab6.use = 4;
                        }
                        // // gho alk
                        // if(room.memory.labs.status.boost.lab7) {
                        //     room.memory.labs.status.boost.lab7.amount = room.memory.labs.status.boost.lab7.amount + 240;
                        //     room.memory.labs.status.boost.lab7.use += 4;
                        // }
                        // else {
                        //     room.memory.labs.status.boost.lab7 = {};
                        //     room.memory.labs.status.boost.lab7.amount = 240;
                        //     room.memory.labs.status.boost.lab7.use = 4;
                        // }
                    }

                    let newNameA = 'SquadCreepA-'+ RandomWords + "-" + room.name;
                    room.memory.spawn_list.push(bodyLevel8BoostedBack, newNameA, {memory: {role: 'SquadCreepA', homeRoom: room.name, boostlabs:[room.memory.labs.outputLab4,room.memory.labs.outputLab6], targetPosition: new RoomPosition(25,25,targetRoomName)}});
                    console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

                    let newNameB = 'SquadCreepB-'+ RandomWords + "-" + room.name;
                    room.memory.spawn_list.push(bodyLevel8BoostedBack, newNameB, {memory: {role: 'SquadCreepB', homeRoom: room.name, boostlabs:[room.memory.labs.outputLab4,room.memory.labs.outputLab6]}});
                    console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

                    let newNameY = 'SquadCreepY-'+ RandomWords + "-" + room.name;
                    room.memory.spawn_list.push(bodyLevel8BoostedFront, newNameY, {memory: {role: 'SquadCreepY', homeRoom: room.name, boostlabs:[room.memory.labs.outputLab8,room.memory.labs.outputLab6]}});
                    console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

                    let newNameZ = 'SquadCreepZ-'+ RandomWords + "-" + room.name;
                    room.memory.spawn_list.push(bodyLevel8BoostedFront, newNameZ, {memory: {role: 'SquadCreepZ', homeRoom: room.name, boostlabs:[room.memory.labs.outputLab8,room.memory.labs.outputLab6]}});
                    console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

                    return "Success with boost";


                 }

            else {
                let newNameA = 'SquadCreepA-'+ RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Back, newNameA, {memory: {role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25,25,targetRoomName)}});
                console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

                let newNameB = 'SquadCreepB-'+ RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Back, newNameB, {memory: {role: 'SquadCreepB', homeRoom: room.name}});
                console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

                let newNameY = 'SquadCreepY-'+ RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Front, newNameY, {memory: {role: 'SquadCreepY', homeRoom: room.name}});
                console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

                let newNameZ = 'SquadCreepZ-'+ RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Front, newNameZ, {memory: {role: 'SquadCreepZ', homeRoom: room.name}});
                console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

                return "Success!"
            }


        }
    }



}

global.SRD = function(roomName, targetRoomName) {
    if(Game.rooms[roomName]) {
        if(Game.rooms[roomName].controller && Game.rooms[roomName].controller.my && Game.rooms[roomName].controller.level > 4) {


            let newName = 'RemoteDismantler-' + roomName + "-" + targetRoomName + Math.floor(Math.random() * 100000);
            console.log('Adding RemoteDismantler to Spawn List: ' + newName);


            if(Game.rooms[roomName].controller.level == 5) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK], newName, {memory: {role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName}});
                return "Success!";
            }

            else if(Game.rooms[roomName].controller.level == 6) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK], newName, {memory: {role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName}});
                return "Success!";
            }

            else if(Game.rooms[roomName].controller.level == 7) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK], newName, {memory: {role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName}});
                return "Success!";
            }

            else if(Game.rooms[roomName].controller.level == 8) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK], newName, {memory: {role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName}});
                return "Success!";
            }

            else {
                console.log("Controller Level too low to spawn Remote Dismantler")
            }
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 5). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the Remote Dismantler from...")
    }
    return "Failed to spawn";
}

global.SC = function(targetRoomName, x, y) {
    Memory.target_colonise.room = targetRoomName;
    Memory.target_colonise.spawn_pos = new RoomPosition(x,y,targetRoomName);
    Memory.target_colonise.lastSpawnRanger = 1501;
    return "Success!"
}

global.SG = function(homeRoom, targetRoomName) {
    if(Game.rooms[homeRoom]) {
        if(Game.rooms[homeRoom].controller && Game.rooms[homeRoom].controller.my && Game.rooms[homeRoom].controller.level > 4) {

            let creepsInRoom = Game.rooms[homeRoom].find(FIND_MY_CREEPS);
            let fillers = creepsInRoom.filter(function(creep) {return creep.memory.role == "filler";}).length;
            if(fillers < 3) {
                let newName = 'Filler-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + Game.rooms[homeRoom].name;
                Game.rooms[homeRoom].memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, {memory: {role: 'filler'}});
                console.log('Adding filler to Spawn List: ' + newName);
            }


            let newName = 'Goblin-' + randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + homeRoom + "-" + targetRoomName;
            console.log('Adding Goblin to Spawn List: ' + newName);


            if(Game.rooms[homeRoom].controller.level == 5) {
                Game.rooms[homeRoom].memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'goblin', targetRoom: targetRoomName, homeRoom: homeRoom}});
                return "Success!";
            }

            else if(Game.rooms[homeRoom].controller.level == 6) {
                Game.rooms[homeRoom].memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'goblin', targetRoom: targetRoomName, homeRoom: homeRoom}});
                return "Success!";
            }

            else if(Game.rooms[homeRoom].controller.level == 7 || Game.rooms[homeRoom].controller.level == 8) {
                Game.rooms[homeRoom].memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'goblin', targetRoom: targetRoomName, homeRoom: homeRoom}});
                return "Success!";
            }

            else {
                console.log("Controller Level too low to spawn Goblin")
            }
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 5). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the Goblin from...")
    }
    return "Failed to spawn";

}

global.SCK = function (homeRoom, targetRoomName) {
    if(Game.rooms[homeRoom]) {
        if(Game.rooms[homeRoom].controller && Game.rooms[homeRoom].controller.my && Game.rooms[homeRoom].controller.level > 4) {

            let newName = 'CreepKiller-' + randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + homeRoom + "-" + targetRoomName;
            console.log('Adding CreepKiller to Spawn List: ' + newName);

            Game.rooms[homeRoom].memory.spawn_list.push([MOVE,MOVE,MOVE,ATTACK,ATTACK,ATTACK,ATTACK,MOVE], newName, {memory: {role: 'CreepKiller', targetRoom: targetRoomName, homeRoom: homeRoom}});
            return "Success!";
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 5). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the CreepKiller from...")
    }
    return "Failed to spawn";
}
