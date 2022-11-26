import roomDefence from "./rooms.defence";
import spawning from "./rooms.spawning";
import construction, { Build_Remote_Roads } from "./rooms.construction";
import market from "./rooms.market";
import labs from "./rooms.labs";
import factory from "./room.factory";

function rooms() {
    const start = Game.cpu.getUsed()

    // _.forEach(Memory.rooms, function(RoomMemory) {

    // });
    let roomsIController = 0;
    _.forEach(Game.rooms, function(room:any) {
        // if(!room.controller) {
        //     delete room.memory;
        // }
        // if(room.controller.level == 0) {
        //     delete room.memory;
        // }

        if (room && room.controller && room.controller.my) {
            if(room.memory.danger) {
                room.memory.danger_timer ++;
            }
            else if(!room.memory.danger && room.memory.danger_timer > 0) {
                room.memory.danger_timer --;
            }

            roomsIController += 1;
        }



        if(Game.time % 300 == 0) {
            if(Game.gcl.level > roomsIController) {
                Memory.CanClaimRemote = true;
            }
            else {
                Memory.CanClaimRemote = false;
            }
        }



        if (room && room.controller && room.controller.my) {
            if(Game.time % 84 == 0 && room.controller.level > 1) {
                console.log(room.name, "has", Math.floor((room.controller.progress/room.controller.progressTotal) * 100) + "%", "and is level", room.controller.level);
            }

            if(room.controller.level == 1 && Game.time % 1000 == 0) {
                let walls = room.find(FIND_STRUCTURES, {filter: (building) => building.structureType == STRUCTURE_WALL});
                for(let wall of walls) {
                    wall.destroy();
                }
            }

            if(room.controller.level >= 6) {
                if(!room.memory.spawning_squad) {
                    room.memory.spawning_squad = {};
                }
            }

            if(!Memory.AvoidRooms) {
                Memory.AvoidRooms = [];
            }

            if(!Memory.billtong_rooms) {
                Memory.billtong_rooms = [];
            }

            spawning(room);


            // const defenceTime = Game.cpu.getUsed()
            roomDefence(room);
            // console.log('Room Defence Ran in', Game.cpu.getUsed() - defenceTime, 'ms')

            if(Game.time % 1 == 0 && room.terminal && room.controller.level >= 6) {
                const start = Game.cpu.getUsed()
                market(room);
                if(Game.time % 10 == 0) {
                    console.log('Market Ran in', Game.cpu.getUsed() - start, 'ms')
                }
                if(room.controller.level >= 6) {
                    labs(room);
                }
            }

            // factory(room);


            // if(room.factory && room.controller.level >= 7) {

            // }

            if(Game.time % 10 == 1 || Game.time < 10) {
                // const start = Game.cpu.getUsed()
                identifySources(room);
                // console.log('Identify Sources Ran in', Game.cpu.getUsed() - start, 'ms')
            }


            if(Game.time % 1004 == 1003 && Game.cpu.bucket > 1000) {
                _.forEach(Game.rooms, function(everyRoom) {
                    if(everyRoom && everyRoom.memory && !everyRoom.memory.danger && everyRoom.find(FIND_MY_CONSTRUCTION_SITES).length == 0) {
                        everyRoom.memory.keepTheseRoads = [];
                    }
                });
            }

            if(Game.time % 1004 == 0 && Game.cpu.bucket > 300) {
                const start = Game.cpu.getUsed()
                construction(room);
                Build_Remote_Roads(room);
                console.log('Construction Ran in', Game.cpu.getUsed() - start, 'ms')
            }
        }



        // const establishMemoryTime = Game.cpu.getUsed()
        establishMemory(room);
        // console.log('Establish Memory Ran in', Game.cpu.getUsed() - establishMemoryTime, 'ms');


        // let list = Memory.tasks.wipeRooms.destroyStructures
        // console.log(JSON.stringify(list.length))


        if(Game.time % 25000 == 0) {
            _.forEach(Game.constructionSites, function(site) {
                if(site.room == undefined || site.room.find(FIND_MY_CREEPS).length == 0) {
                    site.remove();
                    console.log('site removed for being unbuilt for ages')
                }
            });
        }
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


    if(Game.time % 10000 == 0) {
        _.forEach(Memory.rooms, function(memoryRoom, roomName) {
            if(!Game.rooms[roomName] || (Game.rooms[roomName].controller && Game.rooms[roomName].controller.level == 0))  {
                delete Memory.rooms[roomName];
            }
        });

    }
        // let uselessMemory = false;
        // if(!visibleRoom.controller || (visibleRoom.controller && visibleRoom.controller.level == 0)) {
        //     delete Memory.rooms[visibleRoom.name];
        // }

    console.log('Rooms Ran in', Game.cpu.getUsed() - start, 'ms');
}


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


        if (HostileStructures.length > 0 && room.controller && (room.controller.level == 0 || room.controller.level == 1 && room.controller.my)) {
            if(!Memory.tasks.wipeRooms.destroyStructures.includes(room.name)) {
                Memory.tasks.wipeRooms.destroyStructures.push(room.name)
            }
            room.memory.has_hostile_structures = true;
        }
        else {
            Memory.tasks.wipeRooms.destroyStructures = Memory.tasks.wipeRooms.destroyStructures.filter(element => element != room.name)
            room.memory.has_hostile_structures = false;
        }

        if(HostileCreeps.length > 0 && isArmed && room.controller && (room.controller.level == 0 || room.controller.level == 1 && room.controller.my)) {
            if(!Memory.tasks.wipeRooms.killCreeps.includes(room.name)) {
                Memory.tasks.wipeRooms.killCreeps.push(room.name)
            }
            room.memory.has_hostile_creeps = true;
            room.memory.first_offence = Game.time;
        }
        else if(HostileCreeps.length > 0 && room.controller && (room.controller.level == 0 || room.controller.level == 1 && room.controller.my)) {
            room.memory.has_safe_creeps = true;
        }
        else {
            Memory.tasks.wipeRooms.killCreeps = Memory.tasks.wipeRooms.killCreeps.filter(element => element != room.name)
            room.memory.has_hostile_creeps = false;
            room.memory.has_safe_creeps = false;
        }


        if(Game.rooms[room.name] == undefined) {
            Memory.tasks.wipeRooms.killCreeps = Memory.tasks.wipeRooms.killCreeps.filter(element => element != room.name)
            room.memory.has_hostile_creeps = false;

            Memory.tasks.wipeRooms.destroyStructures = Memory.tasks.wipeRooms.destroyStructures.filter(element => element != room.name)
            room.memory.has_hostile_structures = false;
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



export default rooms;
// module.exports = rooms;
