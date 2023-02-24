function observe(room) {

    let interval = 64;
    let observer:any = Game.getObjectById(room.memory.Structures.observer) || room.findObserver();
    if(observer && Game.time % interval*2 <= 1) {
        if(!room.memory.observe) {
            room.memory.observe = {};
        }

        if(!room.memory.observe.RoomsToSee) {
            let RoomsToSee = [];


            if(room.name.length == 6) {
                let EastOrWest = room.name[0];
                let NorthOrSouth = room.name[3];

                let homeRoomNameX = parseInt(room.name[1] + room.name[2]);
                let homeRoomNameY = parseInt(room.name[4] + room.name[5]);
                for(let i = homeRoomNameX-3; i<=homeRoomNameX+3; i++) {
                    for(let o = homeRoomNameY-3; o<=homeRoomNameY+3; o++) {
                        if(i % 10 !== 0 && o % 10 !== 0) {
                            if(i % 10 >= 4 && i % 10 <= 6 && o % 10 >= 4 && o % 10 <= 6) {
                                // do nothing
                            }
                            else {
                                let firstString = i.toString();
                                let secondString = o.toString();
                                let roomName = EastOrWest + firstString + NorthOrSouth + secondString;
                                if(Game.map.getRoomStatus(roomName).status == "normal" && room.name !== roomName) {
                                    RoomsToSee.push(roomName);
                                }
                            }
                        }
                    }
                }
            }
            else if(room.name.length !== 6) {
                let EastOrWest = room.name[0];
                let NorthOrSouth;
                let homeRoomNameX;
                let homeRoomNameY;
                if(!isNaN(room.name[2])) {
                    NorthOrSouth = room.name[3];
                    homeRoomNameX = parseInt(room.name[1] + room.name[2]);
                    homeRoomNameY = parseInt(room.name[4]);
                }
                else {
                    NorthOrSouth = room.name[2];
                    homeRoomNameX = parseInt(room.name[1]);
                    if(room.name.length == 4) {
                        homeRoomNameY = parseInt(room.name[3]);
                    }
                    else if(room.name.length == 5) {
                        homeRoomNameY = parseInt(room.name[3] + room.name[4]);
                    }
                }
                for(let i = homeRoomNameX-3; i<=homeRoomNameX+3; i++) {
                    let EorW;
                    let x;
                    let switchX = false;
                    if(i < 0) {
                        switchX = true;
                    }

                    if(switchX) {
                        x = Math.abs(i);
                        x -= 1;
                        if(EastOrWest == "E") {
                            EorW = "W"
                        }
                        else {
                            EorW = "E";
                        }
                    }
                    else {
                        x = i;
                        EorW = EastOrWest;
                    }
                    for(let o = homeRoomNameY-3; o<=homeRoomNameY+3; o++) {
                        let NorS;
                        let y;
                        let switchY = false;
                        if(o < 0) {
                            switchY = true;
                        }

                        if(switchY) {
                            y = Math.abs(o);
                            y -= 1;
                            if(NorthOrSouth == "N") {
                                NorS = "S"
                            }
                            else {
                                NorS = "N";
                            }
                        }
                        else {
                            y = o;
                            NorS = NorthOrSouth;
                        }
                        if(x % 10 !== 0 && y % 10 !== 0) {
                            if(x % 10 >= 4 && x % 10 <= 6 && y % 10 >= 4 && y % 10 <= 6) {
                                // do nothing
                            }
                            else {

                                let firstString = x.toString();
                                let secondString = y.toString();
                                let roomName = EorW + firstString + NorS + secondString;
                                if(Game.map.getRoomStatus(roomName).status == "normal" && room.name !== roomName) {
                                    RoomsToSee.push(roomName);
                                }
                            }
                        }
                    }
                }
            }

            room.memory.observe.RoomsToSee = RoomsToSee;
        }

        let RoomsToSee = room.memory.observe.RoomsToSee

        if(RoomsToSee.length > 0 && Game.time % interval*2 == 0) {
            if(!room.memory.observe.lastObserved || room.memory.observe.lastObserved >= RoomsToSee.length) {
                room.memory.observe.lastObserved = 0
            }


            let chosenRoom = RoomsToSee[room.memory.observe.lastObserved]
            observer.observeRoom(chosenRoom);


            console.log("seeing", chosenRoom)


            room.memory.observe.lastObserved += 1;
            room.memory.observe.lastRoomObserved = chosenRoom;

        }

        if(Game.time % interval*2 == 1) {
            let adj = room.memory.observe.lastRoomObserved;

            if(areRoomsNormalToThisRoom(room.name, adj)) {
                if(Game.rooms[adj] && room.name !== adj && Game.rooms[adj].controller && !Game.rooms[adj].controller.my && Game.map.getRoomStatus(adj).status == "normal") {
                    let buildings = Game.rooms[adj].find(FIND_STRUCTURES, {filter: s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_INVADER_CORE && s.pos.x >= 1 && s.pos.x <= 48 && s.pos.y >= 1 && s.pos.y <= 48});
                    let openControllerPositions;

                    if(Game.rooms[adj].controller.level == 0) {
                        openControllerPositions = Game.rooms[adj].controller.pos.getOpenPositionsIgnoreCreepsCheckStructs();

                        if(openControllerPositions && openControllerPositions.length > 0 && buildings.length > 0 && !Game.rooms[adj].controller.reservation) {


                            if(Memory.CanClaimRemote >= 1) {
                                let found = false;

                                for(let creepName in Game.creeps) {
                                    if(creepName.startsWith("WallClearer")) {
                                        if(Game.creeps[creepName].memory.role == "WallClearer" && Game.creeps[creepName].memory.homeRoom == room.name) {
                                            found = true;
                                            break;
                                        }
                                    }
                                }

                                if(!found) {
                                    let newName = 'WallClearer-' + room.name + "-" + adj;
                                    room.memory.spawn_list.push([CLAIM,MOVE], newName, {memory: {role: 'WallClearer', homeRoom: room.name, targetRoom:adj}});
                                    console.log('Adding wall-clearer to Spawn List: ' + newName);
                                }
                            }
                        }
                        else if(openControllerPositions && openControllerPositions.length == 0) {

                            let found = false;

                            for(let creepName in Game.creeps) {
                                if(creepName.startsWith("DismantleControllerWalls")) {
                                    if(Game.creeps[creepName].memory.role == "DismantleControllerWalls" && Game.creeps[creepName].memory.homeRoom == room.name) {
                                        found = true;
                                        break;
                                    }
                                }
                            }

                            if(!found) {
                                let newName = 'DismantleControllerWalls-' + room.name + "-" + adj;
                                room.memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK], newName, {memory: {role: 'DismantleControllerWalls', homeRoom: room.name, targetRoom:adj}});
                                console.log('Adding DismantleControllerWalls to Spawn List: ' + newName);
                            }

                        }
                    }
                    else if((Game.rooms[adj].controller.level == 1 || Game.rooms[adj].controller.level == 2) && !Game.rooms[adj].controller.safeMode) {
                        let hostileSpawns = Game.rooms[adj].find(FIND_HOSTILE_SPAWNS);
                        let hostileCreeps = Game.rooms[adj].find(FIND_HOSTILE_CREEPS);
                        if(hostileSpawns.length > 0 && hostileCreeps.length > 0) {

                            global.SGD(room.name, adj,
                            [
                                MOVE,MOVE,MOVE,MOVE,MOVE,
                                MOVE,MOVE,MOVE,MOVE,MOVE,
                                MOVE,MOVE,
                                ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                MOVE,MOVE,MOVE,MOVE,MOVE,
                                MOVE,MOVE,MOVE,MOVE,MOVE,
                                MOVE,MOVE,MOVE
                            ]
                            );

                        }
                        else if(hostileSpawns.length > 0 && hostileCreeps.length == 0) {

                            global.SGD(room.name, adj,
                                [
                                    MOVE,MOVE,
                                    ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                    MOVE,MOVE,MOVE
                                ]
                                );

                        }
                    }

                    else if((Game.rooms[adj].controller.level == 3 || Game.rooms[adj].controller.level == 4) && !Game.rooms[adj].controller.safeMode) {
                        let hostileSpawns = Game.rooms[adj].find(FIND_HOSTILE_SPAWNS);
                        let hostileCreeps = Game.rooms[adj].find(FIND_HOSTILE_CREEPS);
                        let hostileTowers = Game.rooms[adj].find(FIND_HOSTILE_STRUCTURES, {filter: s => s.structureType == STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] > 9});
                        if(hostileSpawns.length > 0 && hostileTowers.length > 0) {

                            global.SQR(room.name, adj)

                        }
                        else if(hostileSpawns.length > 0 && hostileCreeps.length > 0 && hostileTowers.length == 0) {

                            global.SGD(room.name, adj,
                                [
                                    MOVE,MOVE,MOVE,MOVE,MOVE,
                                    MOVE,MOVE,MOVE,MOVE,MOVE,
                                    MOVE,MOVE,
                                    ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                    ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                    ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                    ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                    ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                    MOVE,MOVE,MOVE,MOVE,MOVE,
                                    MOVE,MOVE,MOVE,MOVE,MOVE,
                                    MOVE,MOVE,MOVE
                                ]
                                );

                        }
                        else if(hostileSpawns.length > 0 && hostileCreeps.length == 0 && hostileTowers.length == 0) {

                            global.SGD(room.name, adj,
                                [
                                    MOVE,MOVE,
                                    ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                    MOVE,MOVE,MOVE
                                ]
                                );

                        }

                    }
                    else if((Game.rooms[adj].controller.level == 5 || Game.rooms[adj].controller.level == 6) && !Game.rooms[adj].controller.safeMode) {
                        let hostileSpawns = Game.rooms[adj].find(FIND_HOSTILE_SPAWNS);
                        let hostileCreeps = Game.rooms[adj].find(FIND_HOSTILE_CREEPS);
                        let hostileTowers = Game.rooms[adj].find(FIND_HOSTILE_STRUCTURES, {filter: s => s.structureType == STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] > 9});
                        if(hostileSpawns.length > 0 && hostileTowers.length > 0) {

                            global.SD(room.name, adj, true)

                        }
                        else if(hostileSpawns.length > 0 && hostileCreeps.length > 0 && hostileTowers.length == 0) {

                            global.SGD(room.name, adj,
                                [
                                    MOVE,MOVE,MOVE,MOVE,MOVE,
                                    MOVE,MOVE,MOVE,MOVE,MOVE,
                                    MOVE,MOVE,
                                    ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                    ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                    ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                    ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                    ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                    MOVE,MOVE,MOVE,MOVE,MOVE,
                                    MOVE,MOVE,MOVE,MOVE,MOVE,
                                    MOVE,MOVE,MOVE
                                ]
                                );

                        }
                        else if(hostileSpawns.length > 0 && hostileCreeps.length == 0) {

                            global.SGD(room.name, adj,
                                [
                                    MOVE,MOVE,
                                    ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
                                    MOVE,MOVE,MOVE
                                ]
                                );

                        }

                    }
                }
            }


        }

    }

    // find power banks
    if(observer && (Game.time % interval == 2 || Game.time % interval == 3)) {

        if(!room.memory.observe.listOfRoomsForPower) {

            if(!room.memory.observe.lastRoomObservedForPowerIndex) {
                room.memory.observe.lastRoomObservedForPowerIndex = 0;
            }

            let highWayRoomsToObserve = [];

            if(room.name.length == 6) {
                let EastOrWest = room.name[0];
                let NorthOrSouth = room.name[3];
                let homeRoomNameX = parseInt(room.name[1] + room.name[2]);
                let homeRoomNameY = parseInt(room.name[4] + room.name[5]);
                for(let i = homeRoomNameX-3; i<=homeRoomNameX+3; i++) {
                    for(let o = homeRoomNameY-3; o<=homeRoomNameY+3; o++) {
                        if(i % 10 == 0 || o % 10 == 0) {
                            let firstString = i.toString();
                            let secondString = o.toString();
                            highWayRoomsToObserve.push(EastOrWest + firstString + NorthOrSouth + secondString);
                        }
                    }
                }
                room.memory.observe.listOfRoomsForPower = highWayRoomsToObserve;
            }
            else if(room.name.length !== 6) {
                let EastOrWest = room.name[0];
                let NorthOrSouth;
                let homeRoomNameX;
                let homeRoomNameY;
                if(!isNaN(room.name[2])) {
                    NorthOrSouth = room.name[3];
                    homeRoomNameX = parseInt(room.name[1] + room.name[2]);
                    homeRoomNameY = parseInt(room.name[4]);
                }
                else {
                    NorthOrSouth = room.name[2];
                    homeRoomNameX = parseInt(room.name[1]);
                    if(room.name.length == 4) {
                        homeRoomNameY = parseInt(room.name[3]);
                    }
                    else if(room.name.length == 5) {
                        homeRoomNameY = parseInt(room.name[3] + room.name[4]);
                    }
                }
                for(let i = homeRoomNameX-3; i<=homeRoomNameX+3; i++) {
                    let EorW;
                    let x;
                    let switchX = false;
                    if(i < 0) {
                        switchX = true;
                    }
                    if(switchX) {
                        x = Math.abs(i);
                        x -= 1;
                        if(EastOrWest == "E") {
                            EorW = "W"
                        }
                        else {
                            EorW = "E";
                        }
                    }
                    else {
                        x = i;
                        EorW = EastOrWest;
                    }
                    for(let o = homeRoomNameY-3; o<=homeRoomNameY+3; o++) {
                        let NorS;
                        let y;
                        let switchY = false;
                        if(o < 0) {
                            switchY = true;
                        }

                        if(switchY) {
                            y = Math.abs(o);
                            y -= 1;
                            if(NorthOrSouth == "N") {
                                NorS = "S"
                            }
                            else {
                                NorS = "N";
                            }
                        }
                        else {
                            y = o;
                            NorS = NorthOrSouth;
                        }
                        if(x % 10 == 0 || y % 10 == 0) {

                            let firstString = x.toString();
                            let secondString = y.toString();
                            let roomName = EorW + firstString + NorS + secondString;
                            if(Game.map.getRoomStatus(roomName).status == "normal" && room.name !== roomName) {
                                highWayRoomsToObserve.push(roomName);
                            }
                        }
                    }
                }
                room.memory.observe.listOfRoomsForPower = highWayRoomsToObserve;
            }
        }

        if(room.memory.observe.listOfRoomsForPower) {

            let RoomsToSee = room.memory.observe.listOfRoomsForPower

            if(RoomsToSee.length > 0 && Game.time % interval == 2) {
                if(!room.memory.observe.lastRoomObservedForPowerIndex || room.memory.observe.lastRoomObservedForPowerIndex >= RoomsToSee.length) {
                    room.memory.observe.lastRoomObservedForPowerIndex = 0
                }


                let chosenRoom = RoomsToSee[room.memory.observe.lastRoomObservedForPowerIndex]
                observer.observeRoom(chosenRoom);


                console.log("seeing FOR POWER", chosenRoom)


                room.memory.observe.lastRoomObservedForPowerIndex += 1;
                room.memory.observe.lastRoomObservedForPower = chosenRoom;

            }

            if(Game.time % interval == 3) {
                let adj = room.memory.observe.lastRoomObservedForPower;

                if(areRoomsNormalToThisRoom(room.name, adj)) {
                    let seenRoom = Game.rooms[adj];

                    let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();

                    if(seenRoom && storage && storage.store[RESOURCE_ENERGY] > 225000) {

                        let walls = seenRoom.find(FIND_STRUCTURES, {filter: s => s.structureType == STRUCTURE_WALL});
                        if(walls.length == 0) {

                            let powerBanks = seenRoom.find(FIND_STRUCTURES, {filter: s => s.structureType == STRUCTURE_POWER_BANK && (s.ticksToDecay > 1700 || s.ticksToDecay > 1000 && s.hits < 700000)});

                            let deposits = seenRoom.find(FIND_DEPOSITS);

                            if(powerBanks.length > 0 && storage.store[RESOURCE_ENERGY] > 330000 && (powerBanks[0].hits < 2000000 && Game.cpu.bucket > 5000 || Game.cpu.bucket > 9000) &&
                             powerBanks[0].pos.getOpenPositionsIgnoreCreeps().length > 1 &&
                             storage.store[RESOURCE_ENERGY] > 350000) {

                                global.SPK(room.name, adj);

                            }

                            if(deposits.length > 0 && deposits[0].lastCooldown < 20 && storage.store[RESOURCE_ENERGY] > 225000 && Game.cpu.bucket >= 9500) {

                                global.SDM(room.name, adj);

                            }

                        }





                    }
                }





            }


        }

    }

}


function areRoomsNormalToThisRoom(homeRoom, targetRoom) {
    let route = Game.map.findRoute(homeRoom, targetRoom)
    if(route && route !== -2 && route.length > 0) {
        for(let partOfRoute of route) {
            if(Game.map.getRoomStatus(partOfRoute.room).status !== "normal") {
                return false;
            }
        }
    }
    else {
        return false;
    }

    return true;
}

export default observe;
