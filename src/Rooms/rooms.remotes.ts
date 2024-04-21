function remotes(room) {
    if (!room.memory.resources) {
        room.memory.resources = {};
    }
    if (!room.memory.resources[room.name]) {
        room.memory.resources[room.name] = {};
    }

    let neighbors = Object.values(Game.map.describeExits(room.name));
    let newRooms = [];

    // Filter out existing rooms and current room
    neighbors = neighbors.filter(roomName => roomName !== room.name && !room.memory.resources[roomName]);

    for (let roomName of neighbors) {
        if (!Game.rooms[roomName] || (Game.rooms[roomName].controller && !Game.rooms[roomName].controller.my) || Game.map.getRoomStatus(roomName).status !== "normal") {
            room.memory.resources[roomName] = {};
            newRooms.push(roomName);
        }
    }

    // Check each new room's neighbors
    for (let roomName of newRooms) {
        let secondaryNeighbors = Object.values(Game.map.describeExits(roomName));

        // Filter out existing rooms and current room
        secondaryNeighbors = secondaryNeighbors.filter(secondaryRoomName => secondaryRoomName !== room.name && !room.memory.resources[secondaryRoomName]);

        for (let secondaryRoomName of secondaryNeighbors) {
            if (!Game.rooms[secondaryRoomName] || (Game.rooms[secondaryRoomName].controller && !Game.rooms[secondaryRoomName].controller.my) || Game.map.getRoomStatus(secondaryRoomName).status !== "normal") {
                room.memory.resources[secondaryRoomName] = {};
            }
        }
    }
}

export default remotes;
