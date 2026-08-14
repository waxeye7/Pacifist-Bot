/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    creep.memory.moving = false;

    if(creep.memory.full && creep.store[RESOURCE_ENERGY] <= 1) {
        creep.memory.source = false;
        creep.memory.full = false;
    }
    if(!creep.memory.full && creep.store.getFreeCapacity() <= 1) {
        creep.memory.full = true;
    }

    console.log(creep.room.name);
    let targetRoom = creep.memory.targetRoom;
    if(creep.room.name !== targetRoom) {
        if(creep.memory.locked_away == 0) {
            if(!creep.memory.full && creep.room.name === creep.memory.homeRoom) {
                let storage = creep.room.storage;
                if(storage) {
                    let result = creep.withdraw(storage, RESOURCE_ENERGY);
                    if(result == ERR_NOT_IN_RANGE) {
                        creep.MoveCostMatrixRoadPrio(storage,1);
                        return;
                    }
                    else if(result === 0) {
                        creep.memory.full = true;
                    }
                }
            }
            creep.memory.in_danger = false;
            creep.memory.exit = false;
            return creep.moveToRoomAvoidEnemyRooms(targetRoom);
        }
        else if(creep.memory.locked_away > 0) {
            creep.memory.locked_away -= 1;
            // sitting in a towered/Avoid hide room for 100t is a death timer
            if(hideRoomIsUnsafe(creep.room)) {
                creep.memory.locked_away = 0;
                creep.memory.in_danger = false;
            }
            stepOffExitWalkable(creep);
            return;
        }
    }
    if(creep.room.name == targetRoom) {
        if(!creep.memory.in_danger || Game.time % 10 == 0) {
            let HostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
            HostileCreeps = HostileCreeps.filter(function(c) {return  creep.pos.getRangeTo(c) <= 15 && (c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0);});
            if(HostileCreeps.length > 0) {

                    let badGuy = HostileCreeps[0];
                    let preferred;
                    if(badGuy.pos.x <= 25 && badGuy.pos.y <= 25) {
                        preferred = ["5", "3", "1", "7"];
                    }
                    else if(badGuy.pos.x > 25 && badGuy.pos.y > 25) {
                        preferred = ["7", "1", "3", "5"];
                    }
                    else if(badGuy.pos.x <= 25 && badGuy.pos.y > 25) {
                        preferred = ["1", "3", "5", "7"];
                    }
                    else {
                        preferred = ["7", "5", "1", "3"];
                    }
                    let exit = pickSafeExit(creep.room.name, preferred);
                    if(exit) {
                        creep.memory.exit = exit;
                        creep.memory.in_danger = true;
                        creep.memory.locked_away = 100;
                        creep.drop(RESOURCE_ENERGY);
                    }

            }
            else {
                creep.memory.locked_away = 0;
                creep.memory.in_danger = false;
            }
        }
        if(creep.memory.in_danger) {
            creep.moveToRoomAvoidEnemyRooms(creep.memory.exit);
            return;
        }




        let controller = creep.room.controller;
        if(controller) {

            if(!creep.memory.source) {
                let sources = creep.room.find(FIND_SOURCES);
                if(sources.length > 0) {
                    let closestSourceToController = controller.pos.findClosestByRange(sources);
                    creep.memory.source = closestSourceToController.id;
                }
            }

            if(!creep.memory.full) {
                let droppedEnergy = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
                    filter: (resource) => {
                        return resource.resourceType == RESOURCE_ENERGY;
                    }
                });
                if(droppedEnergy) {
                    if(creep.pickup(droppedEnergy) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(droppedEnergy);
                        return;
                    }
                }
                else {
                    creep.harvestEnergy();
                }
                if(creep.pos.getRangeTo(controller) <= 3) {
                    creep.upgradeController(controller);
                    return;
                }
            }

            if(creep.memory.full) {
                if(creep.pos.getRangeTo(controller) <= 3) {
                    creep.upgradeController(controller);
                }
                creep.MoveCostMatrixRoadPrio(controller, 1);
            }

        }
    }
}


const STEP_DX = [0, 0, 1, 1, 1, 0, -1, -1, -1];
const STEP_DY = [0, -1, -1, 0, 1, 1, 1, 0, -1];

// move() returns OK even into a wall, so the old !==0 fallbacks never ran
function stepOffExitWalkable(creep) {
    let dirs;
    if(creep.pos.x == 49) dirs = [LEFT, TOP_LEFT, BOTTOM_LEFT, TOP, BOTTOM];
    else if(creep.pos.x == 0) dirs = [RIGHT, TOP_RIGHT, BOTTOM_RIGHT, TOP, BOTTOM];
    else if(creep.pos.y == 49) dirs = [TOP, TOP_LEFT, TOP_RIGHT, LEFT, RIGHT];
    else if(creep.pos.y == 0) dirs = [BOTTOM, BOTTOM_LEFT, BOTTOM_RIGHT, LEFT, RIGHT];
    else return;
    const terrain = creep.room.getTerrain();
    for(let i = 0; i < dirs.length; i++) {
        const dir = dirs[i];
        const x = creep.pos.x + STEP_DX[dir];
        const y = creep.pos.y + STEP_DY[dir];
        if(x < 0 || x > 49 || y < 0 || y > 49) continue;
        if(terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        let blocked = false;
        const structs = creep.room.lookForAt(LOOK_STRUCTURES, x, y);
        for(let j = 0; j < structs.length; j++) {
            if(OBSTACLE_OBJECT_TYPES.indexOf(structs[j].structureType) !== -1) {
                blocked = true;
                break;
            }
        }
        if(blocked) continue;
        creep.move(dir);
        return;
    }
}

function hideRoomIsUnsafe(room) {
    if(Memory.AvoidRooms && Memory.AvoidRooms.includes(room.name)) return true;
    if(room.find(FIND_HOSTILE_STRUCTURES, {filter: s => s.structureType === STRUCTURE_TOWER}).length > 0) return true;
    return room.find(FIND_HOSTILE_CREEPS, {filter: c => c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0}).length > 0;
}

function pickSafeExit(fromRoom, preferredDirs) {
    let exits = Game.map.describeExits(fromRoom);
    if(!exits) return null;
    for(let i = 0; i < preferredDirs.length; i++) {
        let name = exits[preferredDirs[i]];
        if(!name) continue;
        if(Memory.AvoidRooms && Memory.AvoidRooms.includes(name)) continue;
        let vis = Game.rooms[name];
        if(vis && vis.find(FIND_HOSTILE_STRUCTURES, {filter: s => s.structureType === STRUCTURE_TOWER}).length) continue;
        return name;
    }
    return null;
}

const roleSneakyControllerUpgrader = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleSneakyControllerUpgrader;
