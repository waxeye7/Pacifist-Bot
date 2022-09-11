let roomDefence = require('./rooms.defence');
let spawning = require('./rooms.spawning');
let construction = require('./rooms.construction');
let market = require('./rooms.market');

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

            market(room);
            
            if(Game.time % 110 == 1) {
                identifySources(room);
            }

            if(Game.time % 1800 == 1) {
                construction(room);
            }
        }

        if(Game.time % 200 == 1) {
            let attackersInRoom = _.filter(Game.creeps, (creep) => creep.memory.role == 'attacker' && creep.room.name == room.name);
            let HostileStructures = room.find(FIND_HOSTILE_STRUCTURES);
            if (HostileStructures.length > 0 && attackersInRoom.length == 0) {
                room.memory.has_hostile_structures = true;
                room.memory.has_attacker = false;
            }
            else {
                room.memory.has_hostile_structures = false;
            }
        }


    });

}

module.exports = rooms;