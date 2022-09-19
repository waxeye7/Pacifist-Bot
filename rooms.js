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

            if(Game.time % 7 == 0) {
                spawning(room);
            }
            
            roomDefence(room);


            if(Game.time % 313 == 1) {
                market(room);
            }
            
            if(Game.time % 40 == 1) {
                identifySources(room);
            }

            if(Game.time % 2100 == 1) {
                construction(room);
            }

        }
        // let list = Memory.tasks.wipeRooms.destroyStructures
        // console.log(JSON.stringify(list.length))

        if(Game.time % 13 == 0) {
            if(!Memory.tasks.wipeRooms.destroyStructures) {
                Memory.tasks.wipeRooms.destroyStructures = [];
            }

            if(!Memory.tasks.wipeRooms.killCreeps) {
                Memory.tasks.wipeRooms.killCreeps = [];
            }

            // console.log(JSON.stringify(Memory.tasks))

            let attackersInRoom = _.sum(Game.creeps, (creep) => creep.memory.role == 'attacker' && creep.room.name == room.name);
            let HostileStructures = room.find(FIND_HOSTILE_STRUCTURES);
            let HostileCreeps = room.find(FIND_HOSTILE_CREEPS);
            if (HostileStructures.length > 0) {
                if(!Memory.tasks.wipeRooms.destroyStructures.includes(room.name)) {
                    Memory.tasks.wipeRooms.destroyStructures.push(room.name)
                }
                room.memory.has_hostile_structures = true;
            }
            else {
                Memory.tasks.wipeRooms.destroyStructures = Memory.tasks.wipeRooms.destroyStructures.filter(element => element != room.name)
                room.memory.has_hostile_structures = false;
            }

            if(HostileCreeps.length > 0) {
                if(!Memory.tasks.wipeRooms.killCreeps.includes(room.name)) {
                    Memory.tasks.wipeRooms.killCreeps.push(room.name)
                }
                room.memory.has_hostile_creeps = true;
            }
            else {
                Memory.tasks.wipeRooms.killCreeps = Memory.tasks.wipeRooms.killCreeps.filter(element => element != room.name)
                room.memory.has_hostile_creeps = false;
            }

            if(attackersInRoom == 0) {
                room.memory.has_attacker = false;
            }
            else {
                room.memory.has_attacker = true;
            }


        }


    });

}

module.exports = rooms;