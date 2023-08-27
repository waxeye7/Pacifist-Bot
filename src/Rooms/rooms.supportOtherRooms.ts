function supportOtherRooms(room) {
    if(!Memory.delayConvoy) Memory.delayConvoy = {};
    if(Memory.delayConvoy && Memory.delayConvoy[room.name] && Memory.delayConvoy[room.name] > 0) {
        Memory.delayConvoy[room.name] --;
        if(Memory.delayConvoy[room.name] > 5000) return;
    }

    let storage:any;
    if(room.memory.Structures) {
        if(room.memory.Structures.storage) {
            storage = Game.getObjectById(room.memory.Structures.storage);
        }
    }
    if(
        room.memory.data &&
        room.memory.data.DOB &&
        room.memory.data.DOB % 715 == 0 &&
        Memory.target_colonise &&
        Game.rooms[Memory.target_colonise.room] &&
        Game.rooms[Memory.target_colonise.room].controller &&
        Game.rooms[Memory.target_colonise.room].controller.my &&

        storage && storage.store[RESOURCE_ENERGY] >= 310000

        &&
        (
            Game.rooms[Memory.target_colonise.room].memory.Structures.spawn && Game.getObjectById(Game.rooms[Memory.target_colonise.room].memory.Structures.spawn) && (Game.rooms[Memory.target_colonise.room].controller.level <= 6 && !Game.rooms[Memory.target_colonise.room].terminal && Game.rooms[Memory.target_colonise.room].controller.level >= 3 && (Game.cpu.bucket > 8000 || Game.cpu.bucket > 4000 && Game.rooms[Memory.target_colonise.room].storage && Game.rooms[Memory.target_colonise.room].storage.store[RESOURCE_ENERGY] <= 100000) ||
            Game.rooms[Memory.target_colonise.room].controller.level == 2 &&
            Game.rooms[Memory.target_colonise.room].memory.Structures &&
            Game.rooms[Memory.target_colonise.room].memory.Structures.bin &&
            Game.getObjectById(Game.rooms[Memory.target_colonise.room].memory.Structures.bin) && Game.cpu.bucket > 9000)
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
            if(Game.rooms[Memory.target_colonise.room].controller.level <= 7 && Game.rooms[Memory.target_colonise.room].controller.safeModeAvailable === 0 && storage && storage.store[RESOURCE_GHODIUM] >= 1000) {
                global.spawnSafeModer(room.name, Memory.target_colonise.room);
            }
        }
}



export default supportOtherRooms;
