import roomDefence from "Rooms/rooms.defence";

/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.Speak();

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
        let listOfPossibleRooms = [];

        let EastOrWest = creep.memory.homeRoom[0];
        let NorthOrSouth = creep.memory.homeRoom[3];

        if(creep.memory.homeRoom.length == 6) {
            let homeRoomNameX = parseInt(creep.memory.homeRoom[1] + creep.memory.homeRoom[2]);
            let homeRoomNameY = parseInt(creep.memory.homeRoom[4] + creep.memory.homeRoom[5]);
            for(let i = homeRoomNameX-3; i<homeRoomNameX+4; i++) {
                for(let o = homeRoomNameY-3; o<homeRoomNameY+4; o++) {
                    if(i % 10 == 0 || o % 10 == 0) {
                        let firstString = i.toString();
                        let secondString = o.toString();
                        listOfPossibleRooms.push(EastOrWest + firstString + NorthOrSouth + secondString);
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
                creep.moveTo(terminal, {reusePath: 15, visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
        else if(storage && creep.store.getFreeCapacity() < MaxStorage) {
            if(creep.pos.isNearTo(storage)) {
                for(let resourceType in creep.carry) {
                    creep.transfer(storage, resourceType);
                }
            }
            else {
                creep.moveTo(storage, {reusePath: 15, visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    }

    if(!creep.memory.full) {
        if(!creep.memory.deposit) {
            let deposits:any = creep.room.find(FIND_DEPOSITS);
            if(deposits.length > 0) {
                creep.memory.deposit = deposits[0].id;
                creep.memory.targetRoom = deposits[0].room.name;
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
                if(creep.room.name != creep.memory.targetRoom) {
                    creep.memory.targetRoom = creep.room.name;
                }
                if(creep.pos.isNearTo(deposit)) {
                    creep.harvest(deposit)
                }
                else {
                    creep.moveTo(deposit);
                }
                creep.moveTo(deposit);
            }
        }
        if(creep.room.name != creep.memory.targetRoom) {
            creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
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
