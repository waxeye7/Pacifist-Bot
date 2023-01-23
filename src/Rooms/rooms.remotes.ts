function remotes(room) {
    if(Game.shard.name !== "shard3") {
        if(!room.memory.resources) {
            room.memory.resources = {};
        }
        if(!room.memory.resources[room.name]) {
            room.memory.resources[room.name] = {};
        }

        let neighbors = Object.values(Game.map.describeExits(room.name))
        for(let roomName of neighbors) {
            if(!room.memory.resources[roomName]) {
                room.memory.resources[roomName] = {};
            }
        }
    }

}

export default remotes;
// module.exports = market;
