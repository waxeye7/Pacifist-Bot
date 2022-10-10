// let roomDefence = require('./rooms.defence');
// let spawning = require('./rooms.spawning');
// let construction = require('./rooms.construction');
// let market = require('./rooms.market');
import roomDefence from "./rooms.defence";
import spawning from "./rooms.spawning";
import construction from "./rooms.construction";
import market from "./rooms.market";

function establishMemory(room) {
    if(Game.time % 15 == 0 || Game.time < 10) {
        if(!Memory.tasks) {
            Memory.tasks = {};
        }

        if(!Memory.tasks.wipeRooms) {
            Memory.tasks.wipeRooms = {};
        }

        if(!Memory.tasks.wipeRooms.destroyStructures) {
            Memory.tasks.wipeRooms.destroyStructures = [];
        }

        if(!Memory.tasks.wipeRooms.killCreeps) {
            Memory.tasks.wipeRooms.killCreeps = [];
        }

        // console.log(JSON.stringify(Memory.tasks))



        let HostileStructures = room.find(FIND_HOSTILE_STRUCTURES);
        let HostileCreeps = room.find(FIND_HOSTILE_CREEPS);
        let isArmed = false;

        // check if has attacking parts.
        if(HostileCreeps.length > 0) {

            HostileCreeps.forEach(Hostile => {
                for(let part of Hostile.body)
                if(part.type == ATTACK || part.type == RANGED_ATTACK) {
                    isArmed = true;
                }
            });

        }


        if (HostileStructures.length > 0 && room.controller && room.controller.level == 0) {
            if(!Memory.tasks.wipeRooms.destroyStructures.includes(room.name)) {
                Memory.tasks.wipeRooms.destroyStructures.push(room.name)
            }
            room.memory.has_hostile_structures = true;
        }
        else {
            Memory.tasks.wipeRooms.destroyStructures = Memory.tasks.wipeRooms.destroyStructures.filter(element => element != room.name)
            room.memory.has_hostile_structures = false;
        }

        if(HostileCreeps.length > 0 && room.controller && room.controller.level == 0 && isArmed) {
            if(!Memory.tasks.wipeRooms.killCreeps.includes(room.name)) {
                Memory.tasks.wipeRooms.killCreeps.push(room.name)
            }
            room.memory.has_hostile_creeps = true;
        }
        else {
            Memory.tasks.wipeRooms.killCreeps = Memory.tasks.wipeRooms.killCreeps.filter(element => element != room.name)
            room.memory.has_hostile_creeps = false;
        }

        let attackersInRoom:number = 0;
        _.forEach(Game.creeps, function(creep) {
            if(creep.memory.role == 'attacker' && creep.room.name == room.name) {
                attackersInRoom += 1;
            }
        });
        if(attackersInRoom == 0) {
            room.memory.has_attacker = false;
        }
        else {
            room.memory.has_attacker = true;
        }


    }
}

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
    const start = Game.cpu.getUsed()
    _.forEach(Game.rooms, function(room) {

        // if(!room.controller) {
        //     delete room.memory;
        // }
        // if(room.controller.level == 0) {
        //     delete room.memory;
        // }

        if (room && room.controller && room.controller.my) {

            spawning(room);


            // const defenceTime = Game.cpu.getUsed()
            roomDefence(room);
            // console.log('Room Defence Ran in', Game.cpu.getUsed() - defenceTime, 'ms')

            if(Game.time % 123 == 0) {
                const start = Game.cpu.getUsed()
                market(room);
                console.log('Market Ran in', Game.cpu.getUsed() - start, 'ms')
            }

            if(Game.time % 40 == 1 || Game.time < 10) {
                // const start = Game.cpu.getUsed()
                identifySources(room);
                // console.log('Identify Sources Ran in', Game.cpu.getUsed() - start, 'ms')
            }


            if(Game.time % 818 == 0) {
                const start = Game.cpu.getUsed()
                construction(room);
                console.log('Construction Ran in', Game.cpu.getUsed() - start, 'ms')
            }

        }

        // const establishMemoryTime = Game.cpu.getUsed()
        establishMemory(room);
        // console.log('Establish Memory Ran in', Game.cpu.getUsed() - establishMemoryTime, 'ms');


        // let list = Memory.tasks.wipeRooms.destroyStructures
        // console.log(JSON.stringify(list.length))



        // let constructionSites = room.find(FIND_CONSTRUCTION_SITES);
        // console.log(constructionSites.length)
        // for (var site of constructionSites) {
        //     if (site.structureType == STRUCTURE_ROAD) {
        //         if(site.remove() == 0) {
        //             console.log("it's working")
        //         }
        //     }
        // }



    });
    console.log('Rooms Ran in', Game.cpu.getUsed() - start, 'ms');


}
export default rooms;
// module.exports = rooms;
