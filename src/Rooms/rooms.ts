import roomDefence from "./rooms.defence";
import spawning from "./rooms.spawning";
import construction, { Build_Remote_Roads, Situational_Building } from "./rooms.construction";
import market from "./rooms.market";
import labs from "./rooms.labs";
import factory from "./rooms.factory";
import observe from "./rooms.observe";
import data from "./rooms.data";
import remotes from "./rooms.remotes";
import powerSpawning from "./rooms.powerSpawning";
import supportOtherRooms from "./rooms.supportOtherRooms";


function rooms() {

      /* */


    const start = Game.cpu.getUsed()
    // _.forEach(Memory.rooms, function(RoomMemory) {

    // });


    let myRooms = [];


    let roomsIController = 0;
    _.forEach(Game.rooms, function(room:any) {
        // if(!room.controller) {
        //     delete room.memory;
        // }
        // if(room.controller.level == 0) {
        //     delete room.memory;
        // }


        if (room && room.controller && room.controller.my) {

            if(Game.time % 100 == 0) {
                let spawnAmount = room.find(FIND_MY_SPAWNS).length
                if(room.controller.level >= 6 && spawnAmount == 0) {
                    if(!Memory.keepAfloat.includes(room.name)) {
                        Memory.keepAfloat.push(room.name)
                    }
                }
                else if(room.controller.level >= 6 && spawnAmount > 0) {
                    if(Memory.keepAfloat.includes(room.name)) {
                        Memory.keepAfloat = Memory.keepAfloat.filter(r => r !== room.name);
                    }
                }
            }


            if(room.controller.safeMode && room.controller.safeMode > 100 && Game.time % 100 === 0 && !room.find(FIND_HOSTILE_CREEPS).length) {
                room.memory.danger = false;
                room.memory.danger_timer = 0;
            }

            if(room.memory.danger) {
                console.log(room.name, room.memory.danger_timer)
                room.memory.danger_timer ++;
                if(room.memory.danger_timer > 10000) {
                    room.memory.danger_timer = 0;
                }
            }
            else if(!room.memory.danger && room.memory.danger_timer !== 0) {
                console.log(room.name, room.memory.danger_timer)
                if(room.memory.danger_timer > 25) {
                    room.memory.danger_timer -= 25;
                }
                else {
                    room.memory.danger_timer = 0;
                }


            }

            roomsIController += 1;
            myRooms.push(room.name);
        }

        if(Game.time % 400 == 0) {
            let progress = 0;
            let level = 1;
            let current = false;
            if(Game.time % 25000 === 0) {
                _.forEach(Game.rooms, function (anyroom: any) {
                    if (anyroom && anyroom.controller && anyroom.controller.my && anyroom.controller.level < 8 && anyroom.controller.level >= 6) {
                        if (anyroom.controller.level > level) {
                            current = anyroom.name;
                            level = anyroom.controller.level;
                            progress = anyroom.controller.progress;
                        }
                        else if (anyroom.controller.level == level) {
                            if (anyroom.controller.progress > progress) {
                                current = anyroom.name;
                                level = anyroom.controller.level;
                                progress = anyroom.controller.progress;
                            }
                        }
                    }
                });
            }

            if(current)
                Memory.targetRampRoom.room = current;


            if(room.controller && room.controller.level == 6 && room.controller.progress < 10000) {
                Memory.targetRampRoom.room = room.name
            }
            if(room.memory.Structures) {
                let storage:any = Game.getObjectById(room.memory.Structures.storage);
                if(room.controller.level >= 6 && room.terminal && storage && storage.store[RESOURCE_ENERGY] < 75000) {
                    Memory.targetRampRoom.room = room.name;
                }
            }

        }



        if(room && room.controller && room.controller.my) {

            supportOtherRooms(room);

            if(!room.memory.Structures) {
                room.memory.Structures = {};
            }

            if(!room.memory.reserveFill) {
                room.memory.reserveFill = [];
            }

            if(room.controller.level >= 5 && room.memory.Structures.container) {
                delete room.memory.Structures.container;
            }


            if(room.memory.danger && room.memory.danger_timer > 125 && Game.time % 25 == 0) {
                let remoteRooms = Object.keys(room.memory.resources);
                if(remoteRooms.length > 1) {
                    remoteRooms = remoteRooms.filter(function(remoteRoom) {return remoteRoom !== room.name;});
                    if(remoteRooms.length > 1) {
                        for(let remoteRoom of remoteRooms) {
                            room.memory.resources[remoteRoom].active = false;
                        }
                    }
                }
            }



            if(Game.time % 1000) {
                if(Memory.AvoidRooms) {
                    if(Memory.AvoidRooms.includes(room.name)) {
                        Memory.AvoidRooms = Memory.AvoidRooms.filter(function(roomname) {return roomname !== room.name;});
                    }
                }
                else {
                    Memory.AvoidRooms = [];
                }

            }


            if(Game.time % 84 == 0 && room.controller.level > 1 && room.controller.level !== 8) {
                console.log(room.name, "has", Math.floor((room.controller.progress/room.controller.progressTotal) * 100) + "%", "and is level", room.controller.level);
            }

            if(room.controller.level == 1 && Game.time % 1000 == 0) {
                let walls = room.find(FIND_STRUCTURES, {filter: (building) => building.structureType == STRUCTURE_WALL || !building.my && building.structureType != STRUCTURE_ROAD && building.structureType != STRUCTURE_CONTAINER});
                for(let wall of walls) {
                    wall.destroy();
                }
            }


            if(room.memory.danger && room.memory.danger_timer > 100) {
                if(room.memory.danger_timer > 350) {
                    Memory.CPU.reduce = true;
                }
                let storage:any = Game.getObjectById(room.memory.Structures.storage);
                if(storage && storage.store[RESOURCE_ENERGY] < 175000) {
                    Memory.targetRampRoom.room = room.name;
                    if(storage.store[RESOURCE_ENERGY] < 80000) {
                        Memory.targetRampRoom.urgent = true;
                    }
                    else if(Game.time % 400 == 0) {
                        Memory.targetRampRoom.urgent = false;
                    }
                }
            }
            else if(Game.time % 1000 == 0) {
                Memory.CPU.reduce = false;
            }

            if(room.memory.danger && (room.controller.level == 2 || room.controller.level == 3) && (!room.memory.Structures.towers || room.memory.Structures.towers.length == 0)) {
                room.controller.activateSafeMode();
            }

            if(!Memory.AvoidRooms) {
                Memory.AvoidRooms = [];
            }

            if(!Memory.billtong_rooms) {
                Memory.billtong_rooms = [];
            }


            powerSpawning(room);
            spawning(room);


            // const defenceTime = Game.cpu.getUsed()
            roomDefence(room);
            // console.log('Room Defence Ran in', Game.cpu.getUsed() - defenceTime, 'ms')

            // if(room.controller.level == 8 && (!Memory.CPU.reduce || Game.cpu.bucket >= 9900)) {
            //     observe(room);
            // }
            data(room);


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

            factory(room);


            // if(room.factory && room.controller.level >= 7) {

            // }

            if(Game.time % 10 == 0 || Game.time < 10) {
                // const start = Game.cpu.getUsed()
                identifySources(room);
                // console.log('Identify Sources Ran in', Game.cpu.getUsed() - start, 'ms')
            }


            if(Game.time % 3012 == 0 && Game.cpu.bucket > 1000 && !room.memory.danger) {
                _.forEach(Game.rooms, function(everyRoom) {
                    if(everyRoom && everyRoom.memory && !everyRoom.memory.danger && everyRoom.find(FIND_MY_CONSTRUCTION_SITES).length == 0) {
                        everyRoom.memory.keepTheseRoads = [];
                    }
                });
            }
            if(Game.time % 1506 == 0 && Game.cpu.bucket > 1000 || room.memory.data.DOB == 2 || room.memory.data.DOGug == 2) {
                const start = Game.cpu.getUsed()
                construction(room);
                console.log('BASE Construction Ran in', Game.cpu.getUsed() - start, 'ms')
            }

            if(Game.time % 3012 == 0 &&
                 Game.cpu.bucket > 1000) {
                const start = Game.cpu.getUsed()
                Build_Remote_Roads(room);
                console.log('REMOTE Construction Ran in', Game.cpu.getUsed() - start, 'ms')
            }
            Situational_Building(room)


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


    if(Game.time % 300 == 0) {
        if(Game.gcl.level > roomsIController) {
            Memory.CanClaimRemote = Game.gcl.level - roomsIController;
        }
        else {
            Memory.CanClaimRemote = 0;
        }
    }


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


    if(Game.time % 500 == 0) {
        if(Game.shard.name !== "shard3" && Memory.CPU.fiveHundredTickAvg.avg < Game.cpu.limit - 7 && Game.cpu.bucket > 9500) {
            let room = Game.rooms[myRooms[Math.floor(Math.random()*myRooms.length)]];

            if(room.controller.level >= 2) {
                for(let remoteRoom of Object.keys(room.memory.resources)) {
                    if(remoteRoom !== room.name) {
                        if(Object.keys(room.memory.resources[remoteRoom]).length == 0) {
                            let newName = 'Scout-'+ "-" + room.name;
                            room.memory.spawn_list.push([MOVE], newName, {memory: {role: 'scout', homeRoom: room.name, targetRoom: remoteRoom}});
                            console.log('Adding Scout to Spawn List: ' + newName);
                            break;
                        }
                        else if(!room.memory.resources[remoteRoom].active) {
                            room.memory.resources[remoteRoom].active = true;
                        }
                    }
                }
            }

        }
        else if(Memory.CPU.fiveHundredTickAvg.avg > Game.cpu.limit - 4) {
            for(let roomName of myRooms) {
                let room = Game.rooms[roomName];
                let remoteRooms = Object.keys(room.memory.resources);
                if(remoteRooms.length > 1) {
                    remoteRooms = remoteRooms.filter(function(remoteRoom) {return remoteRoom !== roomName;});
                    if(remoteRooms.length > 1) {
                        let found = false;
                        for(let remoteRoom of remoteRooms) {
                            room.memory.resources[remoteRoom].active = false;
                            found = true;
                            break;
                        }
                        if(found) {
                            break;
                        }
                    }
                }
            }
        }
    }


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


        if(room.controller && !room.controller.my || !room.controller) {
            if(!room.memory.roomData) {
                room.memory.roomData = {};
            }

            if (HostileStructures.length > 0) {
                if(!Memory.tasks.wipeRooms.destroyStructures.includes(room.name)) {
                    Memory.tasks.wipeRooms.destroyStructures.push(room.name)
                }
                room.memory.roomData.has_hostile_structures = true;
            }
            else {
                Memory.tasks.wipeRooms.destroyStructures = Memory.tasks.wipeRooms.destroyStructures.filter(element => element != room.name)
                room.memory.roomData.has_hostile_structures = false;
            }

            if(HostileCreeps.length > 0 && isArmed) {
                if(!Memory.tasks.wipeRooms.killCreeps.includes(room.name)) {
                    Memory.tasks.wipeRooms.killCreeps.push(room.name)
                }
                room.memory.roomData.has_hostile_creeps = true;
            }
            else if(HostileCreeps.length > 0) {
                room.memory.roomData.has_safe_creeps = true;
            }
            else {
                Memory.tasks.wipeRooms.killCreeps = Memory.tasks.wipeRooms.killCreeps.filter(element => element != room.name)
                room.memory.roomData.has_hostile_creeps = false;
                room.memory.roomData.has_safe_creeps = false;
            }




            let attackersInRoom:number = 0;
            _.forEach(Game.creeps, function(creep) {
                if(creep.memory.role == 'attacker' && creep.room.name == room.name) {
                    attackersInRoom += 1;
                }
            });
            if(attackersInRoom == 0) {
                room.memory.roomData.has_attacker = false;
            }
            else {
                room.memory.roomData.has_attacker = true;
            }
        }


        if(Game.rooms[room.name] == undefined) {
            Memory.tasks.wipeRooms.killCreeps = Memory.tasks.wipeRooms.killCreeps.filter(element => element != room.name)
            room.memory.roomData.has_hostile_creeps = false;

            Memory.tasks.wipeRooms.destroyStructures = Memory.tasks.wipeRooms.destroyStructures.filter(element => element != room.name)
            room.memory.has_hostile_structures = false;
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
    remotes(room);
}



export default rooms;
// module.exports = rooms;
