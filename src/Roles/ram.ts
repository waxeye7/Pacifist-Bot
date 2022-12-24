/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.Speak();

    // if((creep.pos.x == 49 || creep.pos.x == 0 || creep.pos.y == 49 || creep.pos.y == 0) && creep.room.name == creep.memory.targetRoom) {
    //     creep.moveTo(25,25, {range:22});
    // }
    if(Game.rooms[creep.memory.targetRoom] && Game.rooms[creep.memory.targetRoom].controller.safeMode && Game.rooms[creep.memory.targetRoom].controller.safeMode > 0) {
        creep.memory.suicide = true;
    }
    if(creep.memory.suicide) {
        creep.recycle();
        return;
    }

    if(creep.pos.x < 48 && creep.pos.x > 1 && creep.pos.y < 48 && creep.pos.y > 1) {
        let AroundCreepPositions = creep.pos.getNearbyPositions();
        let found = false;

        for(let position of AroundCreepPositions) {
            let lookForCreep = position.lookFor(LOOK_CREEPS);
            if(lookForCreep.length >= 1) {
                if(lookForCreep[0].my && lookForCreep[0].memory.role == "signifer" && lookForCreep[0].fatigue == 0) {
                    found = true;
                }
            }
        }

        if(!found) {
            if(creep.room.name == creep.memory.homeRoom) {
                if(creep.roadCheck()) {
                    creep.moveAwayIfNeedTo();
                }
            }
            return;
        }

    }



    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveToRoom(creep.memory.targetRoom)
    }


    let stepOn;
    let target;

    let ConstructionSites = creep.room.find(FIND_HOSTILE_CONSTRUCTION_SITES);
    let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

    if(ConstructionSites.length > 0) {
        let Sites = ConstructionSites.filter(function(site) {return site.structureType == STRUCTURE_SPAWN;});
        if(Sites.length > 0) {
            let closestSite = creep.pos.findClosestByRange(ConstructionSites);
            stepOn = closestSite;
        }
    }

    if(enemyCreeps.length > 0) {
        let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps)
        if(creep.pos.isNearTo(closestEnemyCreep)) {
            let lookStructuresEnemyCreep = closestEnemyCreep.pos.lookFor(LOOK_STRUCTURES);
            for(let building of lookStructuresEnemyCreep) {
                if(building.structureType == STRUCTURE_RAMPART) {
                    break;
                }
            }
            creep.attack(closestEnemyCreep);
        }
    }

    // if(stepOn) {
        // if(creep.pos.isNearTo(creep.pos.findClosestByRange(enemyCreeps))) {
        //     creep.attack(creep.pos.findClosestByRange(enemyCreeps));
        // }
    //     creep.moveTo(stepOn.pos.x, stepOn.pos.y);
    //     return;
    // }

    let Structures = creep.room.find(FIND_STRUCTURES);
    if(Structures.length > 0 && !target) {
        let enemySpawns = Structures.filter(function(building) {return building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_TOWER || building.structureType == STRUCTURE_EXTENSION});
        if(enemySpawns.length > 0) {
            let closestEnemySpawn = creep.pos.findClosestByRange(enemySpawns);
            target = closestEnemySpawn;
            // if(creep.pos.findPathTo(target.pos).length > 51) {
            //     let enemyRampartsAndWalls = Structures.filter(function(building) {return building.structureType == STRUCTURE_RAMPART || building.structureType == STRUCTURE_WALL})
            //     target = creep.pos.findClosestByRange(enemyRampartsAndWalls);
            // }

        }
    }

    console.log(target)

    if(target) {
        let FleePath = PathFinder.search(creep.pos, {pos:target.pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: () => makeStructuresCostMatrix(creep.room.name)});

        if(!FleePath.incomplete) {
            if(creep.pos.isNearTo(target)) {
                creep.attack(target);
            }
            else {
                creep.moveTo(target, {swampCost:4});
            }
        }
        else {
            let targetStructures = Structures.filter(function(building) {return building.structureType == STRUCTURE_WALL || building.structureType == STRUCTURE_RAMPART});
            target = creep.pos.findClosestByRange(targetStructures);
            if(target) {
                if(creep.pos.isNearTo(target)) {
                    creep.attack(target);

                }
                else {
                    creep.moveTo(target, {swampCost:4});

                }

            }
        }

        creep.attack(creep.pos.findClosestByRange(enemyCreeps))
    }

    if(!target) {
        if(enemyCreeps.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);

            if(creep.attack(closestEnemyCreep) == ERR_NOT_IN_RANGE) {
                creep.moveTo(closestEnemyCreep);
                return;
            }
            if(creep.attack(closestEnemyCreep) == 0) {
                creep.moveTo(closestEnemyCreep);
                return;
            }
        }
    }

    if(enemyCreeps.length == 0 && Structures.length == 0) {
        creep.memory.suicide = true;
    }




}

const makeStructuresCostMatrix = (roomName: string): boolean | CostMatrix => {
    let currentRoom = Game.rooms[roomName];
    if(currentRoom == undefined || currentRoom === undefined || !currentRoom || currentRoom === null || currentRoom == null) {
        return false;
    }
    let costs = new PathFinder.CostMatrix;

    let existingStructures = currentRoom.find(FIND_STRUCTURES);
    if(existingStructures.length > 0) {
        existingStructures.forEach(building => {
            if(building.structureType != STRUCTURE_RAMPART && building.structureType != STRUCTURE_CONTAINER && building.structureType != STRUCTURE_ROAD) {
                costs.set(building.pos.x, building.pos.y, 255);
            }
            // else {
            //     costs.set(building.pos.x, building.pos.y, 0);
            // }
        });
    }
    return costs;
}


const roleRam = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleRam;
