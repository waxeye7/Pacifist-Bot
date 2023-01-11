/**
 * A little description of this function
 * @param {Creep} creep
 **/

const run = function (creep) {
    creep.Speak();
    creep.memory.moving = false;


    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(creep.memory.full && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.full = false;
    }
    let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

    if(creep.memory.full) {


        if(!creep.memory.creep_target) {
            let SpecialRepairers = creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == "SpecialRepair");}});
            if(SpecialRepairers.length > 0) {
                SpecialRepairers.sort((a,b) => b.ticksToLive - a.ticksToLive);
                creep.memory.creep_target = SpecialRepairers[0].id;
            }
        }

        if(creep.memory.creep_target) {
            let target:any = Game.getObjectById(creep.memory.creep_target);
            if(!target) {
                creep.memory.creep_target = false;
                return;
            }


            if(!creep.pos.isNearTo(target)) {
                let path = PathFinder.search(
                    creep.pos, {pos:target.pos, range:0},
                    {
                        plainCost: 1,
                        swampCost: 5,
                        maxOps: 2000,
                        maxRooms: 5,
                        roomCallback: (roomName) => roomCallbackSpecialRepair(roomName)
                    }
                    );

                let pos = path.path[0];
                let direction = creep.pos.getDirectionTo(pos);

                if(direction == 1) {
                    let targetRoomPosition = new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name)
                    let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                    if(lookCreep.length > 0) {
                        lookCreep[0].move(5);
                    }
                }
                else if(direction == 2) {
                    let targetRoomPosition = new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name)
                    let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                    if(lookCreep.length > 0) {
                        lookCreep[0].move(6);
                    }
                }
                else if(direction == 3) {
                    let targetRoomPosition = new RoomPosition(creep.pos.x + 1, creep.pos.y, creep.room.name)
                    let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                    if(lookCreep.length > 0) {
                        lookCreep[0].move(7);
                    }
                }
                else if(direction == 4) {
                    let targetRoomPosition = new RoomPosition(creep.pos.x + 1, creep.pos.y + 1, creep.room.name)
                    let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                    if(lookCreep.length > 0) {
                        lookCreep[0].move(8);
                    }
                }
                else if(direction == 5) {
                    let targetRoomPosition = new RoomPosition(creep.pos.x, creep.pos.y + 1, creep.room.name)
                    let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                    if(lookCreep.length > 0) {
                        lookCreep[0].move(1);
                    }
                }
                else if(direction == 6) {
                    let targetRoomPosition = new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name)
                    let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                    if(lookCreep.length > 0) {
                        lookCreep[0].move(2);
                    }
                }
                else if(direction == 7) {
                    let targetRoomPosition = new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name)
                    let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                    if(lookCreep.length > 0) {
                        lookCreep[0].move(3);
                    }
                }
                else if(direction == 8) {
                    let targetRoomPosition = new RoomPosition(creep.pos.x - 1, creep.pos.y - 1, creep.room.name)
                    let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                    if(lookCreep.length > 0) {
                        lookCreep[0].move(4);
                    }
                }

                creep.move(direction);
            }



            if(!creep.memory.container_target) {
                if(storage && target.pos.getRangeTo(storage) > 4) {
                    let structuresHere = target.pos.lookFor(LOOK_STRUCTURES)
                    if(structuresHere.length > 0) {
                        for(let structure of structuresHere) {
                            if(structure.structureType == STRUCTURE_CONTAINER) {
                                creep.memory.container_target = structure.id;
                            }
                        }
                    }
                }
            }

            let container:any = Game.getObjectById(creep.memory.container_target);

            if(target && container && creep.pos.isNearTo(container) && container.store.getFreeCapacity() !== 0) {

                if(creep.transfer(container, RESOURCE_ENERGY) == 0) {
                    creep.memory.full = false;
                }
            }
            else if(target && creep.pos.isNearTo(target) && target.store.getFreeCapacity() >= 50) {
                creep.transfer(target, RESOURCE_ENERGY);
            }

        }

    }
    else {
        if(storage && !creep.pos.isNearTo(storage)) {
            let path = PathFinder.search(
                creep.pos, {pos:storage.pos, range:0},
                {
                    plainCost: 1,
                    swampCost: 5,
                    maxOps: 2000,
                    maxRooms: 5,
                    roomCallback: (roomName) => roomCallbackSpecialRepair(roomName)
                }
                );

            let pos = path.path[0];
            let direction = creep.pos.getDirectionTo(pos);

            if(direction == 1) {
                let targetRoomPosition = new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name)
                let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                if(lookCreep.length > 0) {
                    lookCreep[0].move(5);
                }
            }
            else if(direction == 2) {
                let targetRoomPosition = new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name)
                let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                if(lookCreep.length > 0) {
                    lookCreep[0].move(6);
                }
            }
            else if(direction == 3) {
                let targetRoomPosition = new RoomPosition(creep.pos.x + 1, creep.pos.y, creep.room.name)
                let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                if(lookCreep.length > 0) {
                    lookCreep[0].move(7);
                }
            }
            else if(direction == 4) {
                let targetRoomPosition = new RoomPosition(creep.pos.x + 1, creep.pos.y + 1, creep.room.name)
                let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                if(lookCreep.length > 0) {
                    lookCreep[0].move(8);
                }
            }
            else if(direction == 5) {
                let targetRoomPosition = new RoomPosition(creep.pos.x, creep.pos.y + 1, creep.room.name)
                let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                if(lookCreep.length > 0) {
                    lookCreep[0].move(1);
                }
            }
            else if(direction == 6) {
                let targetRoomPosition = new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name)
                let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                if(lookCreep.length > 0) {
                    lookCreep[0].move(2);
                }
            }
            else if(direction == 7) {
                let targetRoomPosition = new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name)
                let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                if(lookCreep.length > 0) {
                    lookCreep[0].move(3);
                }
            }
            else if(direction == 8) {
                let targetRoomPosition = new RoomPosition(creep.pos.x - 1, creep.pos.y - 1, creep.room.name)
                let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                if(lookCreep.length > 0) {
                    lookCreep[0].move(4);
                }
            }

            creep.move(direction);
        }

        if(storage && creep.pos.isNearTo(storage)) {
            creep.withdraw(storage, RESOURCE_ENERGY);
        }
    }

    if(creep.ticksToLive <= 20 && !creep.memory.full) {
		creep.memory.suicide = true;
	}
	if(creep.memory.suicide == true) {
		creep.recycle();
        return;
	}
}


const roomCallbackSpecialRepair = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 1; y < 49; y++) {
        for(let x = 1; x < 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 5;
            }
            else if(tile == 0){
                weight = 0;
            }
            costs.set(x, y, weight);
        }
    }

    room.find(FIND_HOSTILE_CREEPS).forEach(function(creep) {
        if(creep.getActiveBodyparts(RANGED_ATTACK) > 0) {
            for(let i = -3; i <= 3; i++) {
                for(let o = -3; o <= 3; o++) {
                    costs.set(creep.pos.x + i, creep.pos.y + o, 255);
                }
            }
        }
        else if(creep.getActiveBodyparts(ATTACK)) {
            for(let i = -1; i <= 1; i++) {
                for(let o = -1; o <= 1; o++) {
                    costs.set(creep.pos.x + i, creep.pos.y + o, 255);
                }
            }
        }
        else {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
    });

    _.forEach(room.find(FIND_MY_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_RAMPART) {
            costs.set(struct.pos.x, struct.pos.y, 1);
        }
    });

    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD || struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else {
            if(struct.structureType !== STRUCTURE_RAMPART) {
                costs.set(struct.pos.x, struct.pos.y, 255);
            }
        }
    });


    return costs;
}

const roleSpecialCarry = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleSpecialCarry;
