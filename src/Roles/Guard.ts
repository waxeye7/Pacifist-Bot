/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    creep.memory.moving = false;

    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        let result = creep.Boost();
        if(!result) {
            return;
        }
    }


    let enemySpotted;
    // if(!enemyCreeps || enemyCreeps.length == 0) {
        enemySpotted = false;
    // }
    let friendlyChatter = false
    GuardSay(creep, enemySpotted, friendlyChatter);

    let enemyCreeps;

    if(creep.room.name !== creep.memory.targetRoom) {
        if(creep.ticksToLive % 5 == 0 && creep.memory.coma || !creep.memory.coma) {
            enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS, {filter: c => c.owner.username !== "Source Keeper"});
            if(enemyCreeps.length > 0) {
                creep.memory.coma = false;
                killCreepsInroom(creep, enemyCreeps);
            }
            else {
                creep.memory.coma = true;
            }
        }

        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    if(creep.room.controller && creep.room.controller.my && creep.room.controller.level >= 4 && creep.room.storage && creep.room.memory.construction && creep.room.memory.construction.rampartLocations && !creep.room.memory.construction.rampartLocations.length) {
        creep.memory.role = "RampartDefender";
        return;
    }

    if(creep.memory.again && !creep.memory.ttgh) {
        creep.memory.ttgh = 1500 - creep.ticksToLive;
    }
    if(creep.memory.again && (creep.memory.ttgh && creep.ticksToLive === creep.memory.ttgh + 150 || creep.hits < creep.hitsMax / 2 && enemyCreeps && enemyCreeps.length && creep.pos.findInRange(enemyCreeps, 3).length)) {
        global.SMDP(creep.memory.homeRoom, creep.memory.targetRoom);
    }

    if(!enemyCreeps) {
        enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
    }

    if(enemyCreeps.length > 0) {
        killCreepsInroom(creep, enemyCreeps);
        // structs filter away controller
        let structs = creep.room.find(FIND_STRUCTURES, {filter: s => s.structureType !== STRUCTURE_CONTROLLER});
        let closestStruct = creep.pos.findClosestByRange(structs);
        if(creep.pos.isNearTo(closestStruct)) {
            creep.attack(closestStruct);
        }
    }
    else {
        let HostileStructures = creep.room.find(FIND_HOSTILE_STRUCTURES, {filter: s => s.structureType !== STRUCTURE_CONTROLLER});
        if(HostileStructures.length > 0) {
            let closestHostileStructure = creep.pos.findClosestByRange(HostileStructures);
            if(creep.pos.isNearTo(closestHostileStructure)) {
                creep.attack(closestHostileStructure);
            }
            else {
                creep.MoveCostMatrixRoadPrio(closestHostileStructure, 1);
            }
        }
        else if(creep.room.controller && !creep.room.controller.my) {
            let Structures = creep.room.find(FIND_STRUCTURES);
            if(Structures.length > 0) {
                let closestStructure = creep.pos.findClosestByRange(Structures);
                if(creep.pos.isNearTo(closestStructure)) {
                    creep.attack(closestStructure);
                }
                else {
                    creep.MoveCostMatrixRoadPrio(closestStructure, 1);
                }
            }
        }
        else {
            creep.moveTo(12, 25);
        }
    }



}


function killCreepsInroom(creep, enemyCreeps) {
    let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);
    GoToController(creep, closestEnemyCreep.pos, 1)
    creep.attack(closestEnemyCreep)
}


function GuardSay(creep, enemySpotted, friendlyChatter) {


    if(!enemySpotted && !friendlyChatter) {
        if(creep.ticksToLive % 12 == 6) {
            creep.say("for", true);
        }
        else if(creep.ticksToLive % 12 == 5 && creep.saying == "for") {
            creep.say("the", true);
        }
        else if(creep.ticksToLive % 12 == 4 && creep.saying == "the") {
            creep.say("peace", true);
        }
        else if(creep.ticksToLive % 12 == 3 && creep.saying == "peace") {
            creep.say("of", true);
        }
        else if(creep.ticksToLive % 12 == 2 && creep.saying == "of") {
            creep.say("the", true);
        }
        else if(creep.ticksToLive % 12 == 1 && creep.saying == "the") {
            creep.say("kingdom", true);
        }


        else if(creep.ticksToLive % 12 == 11) {
            creep.say("for", true);
        }
        else if(creep.ticksToLive % 12 == 10 && creep.saying == "for") {
            creep.say("king", true);
        }
        else if(creep.ticksToLive % 12 == 9 && creep.saying == "king") {
            creep.say("and", true);
        }
        else if(creep.ticksToLive % 12 == 8 && creep.saying == "and") {
            creep.say("country", true);
        }
    }

}

function GoToController(creep, target, range) {
    if(target && creep.fatigue == 0 && creep.pos.getRangeTo(target) > range) {
        if(creep.memory.path && creep.memory.path.length > 0 && (Math.abs(creep.pos.x - creep.memory.path[0].x) > 1 || Math.abs(creep.pos.y - creep.memory.path[0].y) > 1)) {
            creep.memory.path = false;
        }
        if(!creep.memory.path || creep.memory.path.length == 0 || !creep.memory.MoveTargetId || creep.memory.MoveTargetId != target.id || target.roomName !== creep.room.name) {
            let costMatrix = GoToTheController;

            let path = PathFinder.search(
                creep.pos, {pos:target, range:range},
                {
                    maxOps: 1000,
                    maxRooms: 1,
                    roomCallback: (roomName) => costMatrix(roomName)
                }
            );
            creep.memory.path = path.path;
            creep.memory.MoveTargetId = target.id;
        }


        let pos = creep.memory.path[0];
        let direction = creep.pos.getDirectionTo(pos);
        creep.move(direction);
        creep.memory.moving = true;
        creep.memory.path.shift();
    }
}

const GoToTheController = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
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
        costs.set(myCreep.pos.x, myCreep.pos.y, 140);
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
    return costs;
}

const roleGuard = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleGuard;
