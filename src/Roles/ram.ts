/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.Speak();

    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        let result = creep.Boost();
        if(!result) {
            return;
        }
    }

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


    if(!creep.memory.myhealer) {
        let creepsInRoom = creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == "signifer");}});
        if(creepsInRoom.length > 0) {
            creepsInRoom.sort((a,b) => b.ticksToLive - a.ticksToLive);
            creep.memory.myhealer = creepsInRoom[0].id;
        }
    }

    if(creep.memory.myhealer) {
        let myhealer:any = Game.getObjectById(creep.memory.myhealer);
        if(!myhealer || myhealer && !creep.pos.isNearTo(myhealer) && creep.pos.x > 0 && creep.pos.x < 49 && creep.pos.y > 0 && creep.pos.y < 49) {
            return;
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
            else if(creep.pos.getRangeTo(closestEnemyCreep) == 2 && myhealer.pos.isNearTo(closestEnemyCreep)) {
                creep.moveTo(myhealer);
            }
        }

        // if(stepOn) {
            // if(creep.pos.isNearTo(creep.pos.findClosestByRange(enemyCreeps))) {
            //     creep.attack(creep.pos.findClosestByRange(enemyCreeps));
            // }
        //     creep.moveTo(stepOn.pos.x, stepOn.pos.y);
        //     return;
        // }
//  || building.structureType == STRUCTURE_RAMPART|| building.structureType == STRUCTURE_WALL
        let Structures = creep.room.find(FIND_STRUCTURES);
        if(Structures.length > 0 && !target) {
            let enemySpawns = Structures.filter(function(building) {return !building.my && (building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_TOWER ||
                building.structureType == STRUCTURE_EXTENSION || building.structureType == STRUCTURE_STORAGE || building.structureType == STRUCTURE_TERMINAL ||
                building.structureType == STRUCTURE_LINK)});
            if(enemySpawns.length > 0) {
                let closestEnemySpawn = creep.pos.findClosestByRange(enemySpawns);
                target = closestEnemySpawn;
                // if(creep.pos.findPathTo(target.pos).length > 51) {
                //     let enemyRampartsAndWalls = Structures.filter(function(building) {return building.structureType == STRUCTURE_RAMPART || building.structureType == STRUCTURE_WALL})
                //     target = creep.pos.findClosestByRange(enemyRampartsAndWalls);
                // }

            }
            let walls_and_ramparts = Structures.filter(function(building) {return !building.my && (building.structureType == STRUCTURE_WALL || building.structureType == STRUCTURE_RAMPART)});
            let closestwallorrampart = creep.pos.findClosestByPath(walls_and_ramparts);
            if(creep.pos.isNearTo(closestwallorrampart)) {
                creep.attack(closestwallorrampart);
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
                    creep.moveTo(target, {swampCost:4, ignoreCreeps:true});
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
                        creep.moveTo(target, {swampCost:4, ignoreCreeps:true});

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
