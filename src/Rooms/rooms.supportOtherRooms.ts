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
        room.memory.data.DOB % 575 == 0 &&
        Memory.target_colonise &&
        Game.rooms[Memory.target_colonise.room] &&
        Game.rooms[Memory.target_colonise.room].controller &&
        Game.rooms[Memory.target_colonise.room].controller.my &&

        storage && storage.store[RESOURCE_ENERGY] >= 320000

        &&
        (
            Game.rooms[Memory.target_colonise.room].memory.Structures.spawn && Game.getObjectById(Game.rooms[Memory.target_colonise.room].memory.Structures.spawn) && (Game.rooms[Memory.target_colonise.room].controller.level >= 3 ||
            Game.rooms[Memory.target_colonise.room].controller.level == 2 &&
            Game.rooms[Memory.target_colonise.room].memory.Structures &&
            Game.rooms[Memory.target_colonise.room].memory.Structures.bin &&
            Game.getObjectById(Game.rooms[Memory.target_colonise.room].memory.Structures.bin))
        )
        &&


        Game.rooms[Memory.target_colonise.room].controller.level <= 5 &&
        room.controller.level == 8 &&
        Game.map.getRoomLinearDistance(room.name, Memory.target_colonise.room) <= 6) {
            if(Game.rooms[Memory.target_colonise.room].controller.level < 4) {
                global.spawnConvoy(room.name, Memory.target_colonise.room);
            }
            else if(Game.rooms[Memory.target_colonise.room].controller.level >= 4) {
                global.spawnConvoy(room.name, Memory.target_colonise.room);
            }
        }
}



export default supportOtherRooms;
