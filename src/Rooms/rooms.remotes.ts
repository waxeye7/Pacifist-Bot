function remotes(room) {
    if(!room.memory.resources) {
        room.memory.resources = {};
    }
    if(!room.memory.resources[room.name]) {
        room.memory.resources[room.name] = {};
    }

    let neighbors = Object.values(Game.map.describeExits(room.name))
    for(let roomName of neighbors) {
        if(!room.memory.resources[roomName] && (!Game.rooms[roomName] || Game.rooms[roomName].controller && !Game.rooms[roomName].controller.my) || Game.map.getRoomStatus(roomName).status !== "normal") {
            room.memory.resources[roomName] = {};
        }
    }

}

export default remotes;
