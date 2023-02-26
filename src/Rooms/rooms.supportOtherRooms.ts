function supportOtherRooms(room) {

    if(Game.cpu.bucket > 8000 &&
        Game.time % 100 == 0 &&
        Memory.target_colonise &&
        Game.rooms[Memory.target_colonise.room] &&
        Game.rooms[Memory.target_colonise.room].controller &&
        Game.rooms[Memory.target_colonise.room].controller.level >= 3 &&
        Game.rooms[Memory.target_colonise.room].controller.level <= 5 &&
        room.controller.level == 8 &&
        Game.map.getRoomLinearDistance(room.name, Memory.target_colonise.room) <= 7) {

            global.spawnConvoy(room.name, Memory.target_colonise.room);

        }

}



export default supportOtherRooms;
