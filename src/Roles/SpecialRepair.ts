/**
 * A little description of this function
 * @param {Creep} creep
 **/
import { interiorMove, filterOutposts, outpostDeferred } from "utils/Interior";
import { sanctionedRampartKeys, isSanctionedRampart } from "utils/PlanV2";

const run = function (creep) {
    creep.memory.moving = false;


    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        let result = creep.Boost();
        if(!result) {
            return;
        }
    }


    if(creep.evacuate()) {
		return;
	}


    if(!creep.memory.rampart_to_repair) {
        // ONLY the ramparts the room sanctions: the adopted plan's rampart /
        // shell-cut tiles, else the legacy perimeter. The old code read the
        // perimeter directly and — when there was none — fell back to "every
        // rampart I own", which in a plan-v2 room is how the abandoned
        // off-plan stamp ramparts got nursed back to full instead of decaying
        // away. sanctionedRampartKeys returns null ONLY for a room with no
        // plan and no perimeter at all, where repairing everything is still
        // the right answer.
        const sanctioned = sanctionedRampartKeys(creep.room);
        let Ramparts: StructureRampart[] = creep.room.find(FIND_MY_STRUCTURES, {
            filter: (s) =>
                s.structureType === STRUCTURE_RAMPART &&
                (!sanctioned || sanctioned.has(`${s.pos.x},${s.pos.y}`)),
        }) as StructureRampart[];

        // Outposts (anything the min-cut shell does not enclose) are dropped
        // entirely while the room is under attack — a wall repairer stepping
        // outside to top up a remote rampart is a free kill.
        Ramparts = filterOutposts(creep.room, Ramparts);

        if(Ramparts.length > 0) {
            if(!creep.memory.rampart_to_repair) {
                Ramparts.sort((a,b) => a.hits - b.hits);
                creep.memory.rampart_to_repair = Ramparts[0].id;
            }

        }
    }

    if(creep.memory.rampart_to_repair) {
        let target:any = Game.getObjectById(creep.memory.rampart_to_repair);
        let storage:any = Game.getObjectById(creep.room.memory.Structures.storage);
        let lookForCreepsAtTarget;
        if(target && creep.pos.getRangeTo(target) !== 0) {
            lookForCreepsAtTarget = target.pos.lookFor(LOOK_CREEPS);
        }

        // a target locked before the attack started may now be an outpost
        if(target && outpostDeferred(creep.room, target)) {
            creep.memory.rampart_to_repair = false;
            creep.memory.targets = false;
            return;
        }

        // a target locked before the room adopted its plan may now be off-plan
        if(target && target.pos.roomName === creep.room.name && !isSanctionedRampart(creep.room, target.pos)) {
            creep.memory.rampart_to_repair = false;
            creep.memory.targets = false;
            return;
        }

        if(target) {

            if(creep.pos.getRangeTo(target) > 3) {
                if (!interiorMove(creep, target, 3)) {
                    creep.moveToSafePositionToRepairRampart(target, 3);
                }
            }
            else if(creep.pos.getRangeTo(target) == 1 && storage && creep.pos.getRangeTo(storage) == 10 && lookForCreepsAtTarget.length == 1 && lookForCreepsAtTarget[0].my && lookForCreepsAtTarget[0].memory.role == "RampartDefender") {
                let lookForBuildingsOnCreep = creep.pos.lookFor(LOOK_STRUCTURES);
                if(lookForBuildingsOnCreep.length > 0) {
                    for(let building of lookForBuildingsOnCreep) {
                        if(building.structureType == STRUCTURE_RAMPART) {
                            creep.memory.rampart_to_repair = building.id;
                            creep.memory.targets = false;
                            return;
                        }
                    }
                }
            }
            else if(creep.pos.getRangeTo(target) <= 3 && creep.pos.getRangeTo(target) >= 1 && storage && creep.pos.getRangeTo(storage) !== 7 && target.pos.lookFor(LOOK_CREEPS).length == 0) {

                if (!interiorMove(creep, target, 0)) {
                    creep.moveToSafePositionToRepairRampart(target, 0);
                }

            }
            else {

                if(!creep.memory.targets || creep.ticksToLive % 44 == 0) {
                    let rampartIDS = [];
                    // same sanction rule as the target pick above: standing next
                    // to an off-plan rampart must not turn into topping it up
                    let rampartsInRange = creep.pos.findInRange(creep.room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART && isSanctionedRampart(creep.room, s.pos)}), 3);
                    if(storage) {
                        rampartsInRange = rampartsInRange.filter(function(building) {return building.pos.getRangeTo(storage) > 4;});
                    }

                    for(let rampart of rampartsInRange) {
                        rampartIDS.push(rampart.id);
                    }
                    creep.memory.targets = rampartIDS;
                }

                if(creep.memory.targets) {
                    let targets = [];
                    for(let rampartid of creep.memory.targets) {
                        targets.push(Game.getObjectById(rampartid));
                    }

                    if(targets?.length > 0) {
                        targets?.sort((a,b) => a.hits - b.hits);
                        if(targets[0]) creep.repair(targets[0]);

                    }

                }
                if(creep.store[RESOURCE_ENERGY] < 72) {
                    let droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {filter: r => r.resourceType == RESOURCE_ENERGY && creep.pos.getRangeTo(r) <= 1});
                    if(droppedResources.length > 0) {
                        droppedResources.sort((a,b) => b.amount - a.amount);
                        creep.pickup(droppedResources[0]);
                    }
                }
            }







        }
        else {
            creep.memory.rampart_to_repair = false;
        }
    }
    else {
        creep.memory.rampart_to_repair = false;
    }
}


function getNeighbours(tile, listOfLocations) {
    // const deltas = [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]]; not checkerboard

    // const negative_checkerboard =
    // [[0,-1],[-1,0],[1,0],[0,1],
    // [-1,-2],[1,-2],[-2,-1],[2,-1],[-2,1],[2,1],[-1,2],[1,2],
    // [-2,-3],[0,-3],[2,-3],[-3,-2],[3,-2],[-3,0],[3,0],[-3,2],[3,2],[-2,3],[0,3],[2,3],
    // [-3,-4],[-1,-4],[1,-4],[3,-4],[-4,-3],[4,-3],[-4,-1],[4,-1],[-4,1],[4,1],[-4,3],[4,3],[-3,4],[-1,4],[1,4],[3,4],
    // [-4,-5],[-2,-5],[0,-5],[2,-5],[2,-5],[4,-5],[-5,-4],[5,-4],[-5,-2],[5,-2],[-5,0],[5,0],[-5,2],[5,2],[-5,4],[5,4],[-4,5],[-2,5],[0,5],[2,5],[4,5]];

    let neighbours = [];
    listOfLocations.forEach(function(delta) {
        neighbours.push({x: tile.x + delta[0], y: tile.y + delta[1]});
    });
    return neighbours;
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
                    const x = creep.pos.x + i;
                    const y = creep.pos.y + o;
                    if(x < 0 || x > 49 || y < 0 || y > 49) continue;
                    costs.set(x, y, 255);
                }
            }
        }
        else if(creep.getActiveBodyparts(ATTACK)) {
            for(let i = -1; i <= 1; i++) {
                for(let o = -1; o <= 1; o++) {
                    const x = creep.pos.x + i;
                    const y = creep.pos.y + o;
                    if(x < 0 || x > 49 || y < 0 || y > 49) continue;
                    costs.set(x, y, 255);
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

const roleSpecialRepair = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleSpecialRepair;
