/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {

    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    let controller = creep.room.controller
    if(!controller) {
        creep.recycle();
        return;
    }

    if(!creep.pos.isNearTo(controller)) {
        // RoomPosition has no .id, so MoveTargetId never stuck and we
        // repathed every tick. Pass the structure.
        GoToController(creep, controller, 1);
    }
    else {
        creep.suicide();
    }

    // No !s.my: the same find ran every tick while walking to the controller,
    // so if the target room became ours (claimed after dispatch) the creep
    // ate our own structures on the way in. Every sibling catch-all filter
    // carries the ownership check.
    let buildings = creep.room.find(FIND_STRUCTURES, {filter: s => !s.my && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTROLLER});
    let buildingsInRange = creep.pos.findInRange(buildings, 1);
    if(buildingsInRange.length > 0) {
        buildingsInRange.sort(function (a, b):any {


            if (a.pos.getRangeTo(controller) > b.pos.getRangeTo(controller)) return 1;
            if (a.pos.getRangeTo(controller) < b.pos.getRangeTo(controller)) return -1;


            if (a.hits > b.hits) return 1;
            if (a.hits < b.hits) return -1;

        });
        creep.dismantle(buildingsInRange[0]);
    }
}



function GoToController(creep, target, range) {
    if(target && creep.fatigue == 0 && creep.pos.getRangeTo(target) > range) {
        if(creep.memory.path && creep.memory.path.length > 0 && (Math.abs(creep.pos.x - creep.memory.path[0].x) > 1 || Math.abs(creep.pos.y - creep.memory.path[0].y) > 1)) {
            creep.memory.path = false;
        }
        let dest = target.pos || target;
        if(!creep.memory.path || creep.memory.path.length == 0 || !creep.memory.MoveTargetId || creep.memory.MoveTargetId != target.id || dest.roomName !== creep.room.name) {
            let costMatrix = GoToTheController;

            let path = PathFinder.search(
                creep.pos, {pos:dest, range:range},
                {
                    maxOps: 1000,
                    maxRooms: 1,
                    roomCallback: (roomName) => costMatrix(roomName)
                }
            );
            creep.memory.path = path.path;
            creep.memory.MoveTargetId = target.id;
        }


        // a failed search leaves memory.path = [] — path[0] is undefined and
        // getDirectionTo(undefined) throws, every tick, until the wall drops
        let pos = creep.memory.path && creep.memory.path[0];
        if(!pos) return;
        let direction = creep.pos.getDirectionTo(pos);
        creep.move(direction);
        creep.memory.moving = true;
        creep.memory.path.shift();
    }
}



/** Heap memo: one matrix per room per tick — same scoping as Guard/Solomon. */
const dcwMatrixCache: { [roomName: string]: { tick: number, costs: boolean | CostMatrix } } = {};

const GoToTheController = (roomName: string): boolean | CostMatrix => {
    const hit = dcwMatrixCache[roomName];
    if (hit && hit.tick === Game.time) {
        return hit.costs;
    }
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        dcwMatrixCache[roomName] = { tick: Game.time, costs: false };
        return false;
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 0; y <= 49; y++) {
        for(let x = 0; x <= 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 10;
            }
            else if(tile == 0){
                weight = 2;
            }
            costs.set(x, y, weight);
        }
    }

    let EnemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    for(let eCreep of EnemyCreeps) {
        costs.set(eCreep.pos.x, eCreep.pos.y, 255);
    }

    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
        if(site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    });

    let myCreeps = room.find(FIND_MY_CREEPS);
    for(let myCreep of myCreeps) {
        if(myCreep.memory.role == "DismantleControllerWalls") {
            costs.set(myCreep.pos.x, myCreep.pos.y, 140);
        }
    }

    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            costs.set(struct.pos.x, struct.pos.y, 1);
        }
        else if(struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else if(struct.structureType == STRUCTURE_RAMPART && struct.my) {
            return;
        }
        else {
            if(struct.hits >= 5000000) {
                costs.set(struct.pos.x, struct.pos.y, 175);
            }
            else if(struct.hits >= 2500000) {
                costs.set(struct.pos.x, struct.pos.y, 150);
            }
            else if(struct.hits >= 1000000) {
                costs.set(struct.pos.x, struct.pos.y, 100);
            }
            else if(struct.hits >= 500000) {
                costs.set(struct.pos.x, struct.pos.y, 75);
            }
            else {
                costs.set(struct.pos.x, struct.pos.y, 50);
            }

        }
    });
    dcwMatrixCache[roomName] = { tick: Game.time, costs };
    return costs;
}


const roleDismantleControllerWalls = {
    run,
    //run: run,
    //function2,
    //function3
};

export default roleDismantleControllerWalls;
// module.exports = roleRemoteDismantler;
