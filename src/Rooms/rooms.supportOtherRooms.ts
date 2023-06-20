function supportOtherRooms(room) {
    let storage:any;
    if(room.memory.Structures) {
        if(room.memory.Structures.storage) {
            storage = Game.getObjectById(room.memory.Structures.storage);
        }

    }
    if(Game.cpu.bucket > 7000 &&
        room.memory.data &&
        room.memory.data.DOB &&
        room.memory.data.DOB % 175 == 0 &&
        Memory.target_colonise &&
        Game.rooms[Memory.target_colonise.room] &&
        Game.rooms[Memory.target_colonise.room].controller &&

        storage && storage.store[RESOURCE_ENERGY] >= 200000

        &&
        (
            room.memory.Structures.spawn && Game.getObjectById(room.memory.Structures.spawn) && (Game.rooms[Memory.target_colonise.room].controller.level >= 3 ||
            Game.rooms[Memory.target_colonise.room].controller.level == 2 &&
            Game.rooms[Memory.target_colonise.room].memory.Structures &&
            Game.rooms[Memory.target_colonise.room].memory.Structures.bin &&
            Game.getObjectById(Game.rooms[Memory.target_colonise.room].memory.Structures.bin))
        )
        &&


        Game.rooms[Memory.target_colonise.room].controller.level <= 5 &&
        room.controller.level == 8 &&
        Game.map.getRoomLinearDistance(room.name, Memory.target_colonise.room) <= 7) {
            if(Game.rooms[Memory.target_colonise.room].controller.level < 4 && room.memory.data.DOB % 350 == 0) {
                global.spawnConvoy(room.name, Memory.target_colonise.room);
            }
            else if(Game.rooms[Memory.target_colonise.room].controller.level >= 4) {
                global.spawnConvoy(room.name, Memory.target_colonise.room);
            }


        }

}



export default supportOtherRooms;
