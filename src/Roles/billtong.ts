/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.memory.moving = false;

    if(creep.memory.suicide) {
        creep.recycle();
        return;
    }

    if(!creep.memory.MaxStorage) {
        let carryPartsAmount = 0
        for(let part of creep.body) {
            if(part.type == CARRY) {
                carryPartsAmount += 1;
            }
        }
        creep.memory.MaxStorage = carryPartsAmount * 50;
    }
    let MaxStorage = creep.memory.MaxStorage;

    // {filter: deposit => deposit.}));
    if(creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(creep.store.getFreeCapacity() == MaxStorage) {
        creep.memory.full = false;
    }

    if(!creep.memory.targetRoom) {

        if(Memory.billtong_rooms && Memory.billtong_rooms.length > 0) {
            let copy_of_list = Memory.billtong_rooms;
            copy_of_list.sort((a,b) => Game.map.getRoomLinearDistance(creep.room.name, a) - Game.map.getRoomLinearDistance(creep.room.name, b));
            for(let billtong_room of copy_of_list) {
                 Game.map.getRoomLinearDistance(creep.room.name, billtong_room)
                if(creep.memory.searchedRooms && !creep.memory.searchedRooms.includes(billtong_room) && Game.map.getRoomLinearDistance(creep.room.name, billtong_room) <= 4) {
                    creep.memory.targetRoom = billtong_room;
                    return;
                }
            }
        }

        let listOfPossibleRooms = [];


        if(creep.memory.homeRoom.length == 6) {
            let EastOrWest = creep.memory.homeRoom[0];
            let NorthOrSouth = creep.memory.homeRoom[3];
            let homeRoomNameX = parseInt(creep.memory.homeRoom[1] + creep.memory.homeRoom[2]);
            let homeRoomNameY = parseInt(creep.memory.homeRoom[4] + creep.memory.homeRoom[5]);
            for(let i = homeRoomNameX-3; i<homeRoomNameX+4; i++) {
                for(let o = homeRoomNameY-3; o<homeRoomNameY+4; o++) {
                    if(i % 10 == 0 || o % 10 == 0) {
                        let firstString = i.toString();
                        let secondString = o.toString();
                        let roomName = EastOrWest + firstString + NorthOrSouth + secondString
                        if(Game.map.getRoomStatus(roomName).status == "normal" && creep.memory.homeRoom !== roomName) {
                            listOfPossibleRooms.push(roomName);
                        }
                    }
                }
            }
        }
        else if(creep.memory.homeRoom.length !== 6) {
            let EastOrWest = creep.memory.homeRoom[0];
            let NorthOrSouth;
            let homeRoomNameX;
            let homeRoomNameY;
            if(!isNaN(creep.memory.homeRoom[2])) {
                NorthOrSouth = creep.memory.homeRoom[3];
                homeRoomNameX = parseInt(creep.memory.homeRoom[1] + creep.memory.homeRoom[2]);
                homeRoomNameY = parseInt(creep.memory.homeRoom[4]);
            }
            else {
                NorthOrSouth = creep.memory.homeRoom[2];
                homeRoomNameX = parseInt(creep.memory.homeRoom[1]);
                if(creep.memory.homeRoom.length == 4) {
                    homeRoomNameY = parseInt(creep.memory.homeRoom[3]);
                }
                else if(creep.memory.homeRoom.length == 5) {
                    homeRoomNameY = parseInt(creep.memory.homeRoom[3] + creep.memory.homeRoom[4]);
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
                        if(Game.map.getRoomStatus(roomName).status == "normal" && creep.memory.homeRoom !== roomName) {
                            listOfPossibleRooms.push(roomName);
                        }
                    }
                }
            }
        }


        let lowest = [100, 100];
        for(let i=0; i<listOfPossibleRooms.length; i++) {
            if(creep.memory.searchedRooms && _.includes(creep.memory.searchedRooms, listOfPossibleRooms[i], 0)) {
                continue;
            }

            let current = Game.map.getRoomLinearDistance(creep.memory.homeRoom, listOfPossibleRooms[i])
            if(current < lowest[1]) {
                lowest = [i, current];
            }
        }
        creep.memory.targetRoom = listOfPossibleRooms[lowest[0]];
    }


    if(creep.memory.full) {
        if(creep.room.name != creep.memory.homeRoom) {
            return creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom);
        }

        let terminal = creep.room.terminal;
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        if(terminal && creep.store.getFreeCapacity() < MaxStorage) {
            if(creep.pos.isNearTo(terminal)) {
                for(let resourceType in creep.carry) {
                    creep.transfer(terminal, resourceType);
                }
            }
            else {
                creep.MoveCostMatrixRoadPrio(terminal, 1);
            }
        }
        else if(storage && creep.store.getFreeCapacity() < MaxStorage) {
            if(creep.pos.isNearTo(storage)) {
                for(let resourceType in creep.carry) {
                    creep.transfer(storage, resourceType);
                }
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
        }
    }

    if(!creep.memory.full) {
        if(creep.memory.targetRoom && creep.room.name !== creep.memory.targetRoom) {
            return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
        }

        if(!creep.memory.deposit) {
            let deposits:any = creep.room.find(FIND_DEPOSITS);
            if(deposits.length > 0) {
                creep.memory.deposit = deposits[0].id;
                creep.memory.targetRoom = deposits[0].room.name;
                if(!Memory.billtong_rooms.includes(creep.room.name)) {
                    Memory.billtong_rooms.push(creep.room.name);
                }
            }
            else {
                if(Memory.billtong_rooms.includes(creep.room.name)) {
                    let indexOfUselessRoom = Memory.billtong_rooms.indexOf(creep.room.name);
                    Memory.billtong_rooms.splice(indexOfUselessRoom, 1);
                }
            }

            if(creep.room.name == creep.memory.targetRoom) {
                if(!creep.memory.searchedRooms) {
                    creep.memory.searchedRooms = [];
                }
                if(!_.includes(creep.memory.searchedRooms, creep.room.name, 0)) {
                    creep.memory.searchedRooms.push(creep.room.name);
                }
                delete creep.memory.targetRoom;
            }
        }

        if(creep.memory.deposit) {
            let deposit:any = Game.getObjectById(creep.memory.deposit);
            if(!deposit && Game.time % 3 == 0) {
                creep.memory.deposit = null;
                return;
            }


            if(deposit && deposit.room.name == creep.room.name) {
                if(creep.room.name !== creep.memory.targetRoom) {
                    creep.memory.targetRoom = creep.room.name;
                }
                if(creep.pos.isNearTo(deposit)) {
                    if(!creep.memory.timeToGetHome) {
                        creep.memory.timeToGetHome = 1500 - creep.ticksToLive + 10;
                    }
                    if(deposit.cooldown == 0) {
                        creep.harvest(deposit);
                    }

                    if(creep.room.memory.roomData && creep.room.memory.roomData.has_hostile_creeps) {
                        creep.memory.full = true;
                    }


                    if(Game.time % 10 == 0) {
                        let droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {filter: r => r.pos.getRangeTo(creep) <= 3 && (r.resourceType == RESOURCE_METAL || r.resourceType == RESOURCE_BIOMASS || r.resourceType == RESOURCE_SILICON || r.resourceType == RESOURCE_MIST)});
                        if(droppedResources.length > 0) {
                            let closestDroppedResource = creep.pos.findClosestByRange(droppedResources);
                            if(creep.pos.isNearTo(closestDroppedResource)) {
                                creep.pickup(closestDroppedResource);
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(closestDroppedResource, 1);
                            }
                            return;
                        }
                    }
                }
                else {
                    creep.MoveCostMatrixRoadPrio(deposit, 1);
                }
                creep.MoveCostMatrixRoadPrio(deposit, 1);
            }

            if(creep.ticksToLive == creep.memory.timeToGetHome || creep.ticksToLive == creep.memory.timeToGetHome - 1) {
                creep.memory.suicide = true;
            }
        }

    }
}


const roleBilltong = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleBilltong;
