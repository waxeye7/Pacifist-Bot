let roomDefence = require('./rooms.defence');
let spawning = require('./rooms.spawning');

function identifySources(room) {
    if(!room.memory.resources) {
        room.memory.resources = {};
    }

    if(!room.memory.resources[room.name]) {
        let sources = room.find(FIND_SOURCES);        

        _.forEach(sources, function(source) {
            let data = _.get(room.memory, ['resources', room.name, 'energy', source.id]);
            if(data === undefined) {
                _.set(room.memory, ['resources', room.name, 'energy', source.id], {})
            }});
    }
}


function rooms() {
    _.forEach(Game.rooms, function(room) {
        if (room && room.controller && room.controller.my) {

            spawning(room);
            
            roomDefence(room);
            if(Game.time % 500 == 1) {
                identifySources(room);
            }
        }
    });

}

module.exports = rooms;