/**
 * A little description of this function
 * @param {Creep} creep
 **/

 function findLocked(creep) {

    creep.memory.locked = [];

    if(creep.room.memory.labs && Object.keys(creep.room.memory.labs).length >= 4) {
        let outputLab1;
        let outputLab2;
        let outputLab3;
        let outputLab4;
        let outputLab5;
        let outputLab6;
        let outputLab7;
        let outputLab8;

        let Labs = [];

        if(creep.room.memory.labs.outputLab1) {
            outputLab1 = Game.getObjectById(creep.room.memory.labs.outputLab1)
            Labs.push(outputLab1)
        }
        if(creep.room.memory.labs.outputLab2) {
            outputLab2 = Game.getObjectById(creep.room.memory.labs.outputLab2)
            Labs.push(outputLab2)
        }
        if(creep.room.memory.labs.outputLab3) {
            outputLab3 = Game.getObjectById(creep.room.memory.labs.outputLab3)
            Labs.push(outputLab3)
        }
        if(creep.room.memory.labs.outputLab4) {
            outputLab4 = Game.getObjectById(creep.room.memory.labs.outputLab4)
            Labs.push(outputLab4)
        }
        if(creep.room.memory.labs.outputLab5) {
            outputLab5 = Game.getObjectById(creep.room.memory.labs.outputLab5)
            Labs.push(outputLab5)
        }
        if(creep.room.memory.labs.outputLab6) {
            outputLab6 = Game.getObjectById(creep.room.memory.labs.outputLab6)
            Labs.push(outputLab6)
        }
        if(creep.room.memory.labs.outputLab7) {
            outputLab7 = Game.getObjectById(creep.room.memory.labs.outputLab7)
            Labs.push(outputLab7)
        }
        if(creep.room.memory.labs.outputLab8) {
            outputLab8 = Game.getObjectById(creep.room.memory.labs.outputLab8)
            Labs.push(outputLab8)
        }

        for(let lab of Labs) {
            if(lab && lab.store[RESOURCE_ENERGY] <= 2000 - creep.memory.MaxStorage && creep.memory.locked.length < 2) {
                creep.memory.locked.push(lab.id);
            }
        }
    }


    let spawnAndExtensions = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_EXTENSION) && building.store.getFreeCapacity(RESOURCE_ENERGY) > 0});
    if(spawnAndExtensions.length > 0) {

        if(creep.memory.locked.length == 0) {
            creep.memory.locked.push(creep.pos.findClosestByRange(spawnAndExtensions).id);
            spawnAndExtensions.filter(function(building) {return building.id !== creep.memory.locked[0]});
        }
        else if(creep.memory.locked.length == 1 && spawnAndExtensions.length > 0) {
            let currentInLocked:any = Game.getObjectById(creep.memory.locked[0]);
            creep.memory.locked.push(currentInLocked.pos.findClosestByRange(spawnAndExtensions).id);
        }

    }

    let towers2 = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_TOWER && building.store.getFreeCapacity(RESOURCE_ENERGY) >= 100)});
    if(towers2.length > 0) {
        towers2.sort((a,b) => a.pos.getRangeTo(creep) - b.pos.getRangeTo(creep));
        for(let tower of towers2) {
            if(creep.memory.locked.length < 2) {
                creep.memory.locked.push(tower.id);
            }
        }
    }

    if(creep.room.energyCapacityAvailable /1.5 < creep.room.energyAvailable) {
        let towers = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_TOWER && building.store[RESOURCE_ENERGY] < 200)});
        if(towers.length > 0) {
            towers.sort((a,b) => a.pos.getRangeTo(creep) - b.pos.getRangeTo(creep));
            for(let tower of towers) {
                if(creep.memory.locked.length < 2) {
                    creep.memory.locked.push(tower.id);
                }
            }
        }
    }



    if((!creep.room.memory.Structures.controllerLink || Game.time % 10000 == 0) && creep.room.controller.level >= 2) {
        if(creep.room.controller.level < 7) {
            let containers = creep.room.find(FIND_STRUCTURES, {filter: building => building.structureType == STRUCTURE_CONTAINER && building.id !== creep.room.memory.Structures.bin && building.id !== creep.room.memory.Structures.storage && building.pos.getRangeTo(creep.room.controller) == 2});
            if(containers.length > 0) {
                let controllerLink = creep.room.controller.pos.findClosestByRange(containers);
                if(containers.length > 1) {
                    let sources = creep.room.find(FIND_SOURCES);
                    if(controllerLink.pos.findInRange(sources, 1).length > 0) {
                        containers = containers.filter(function(con) {return con.id !== controllerLink.id;});
                        let newControllerLink = creep.room.controller.pos.findClosestByRange(containers);
                        creep.room.memory.Structures.controllerLink = newControllerLink.id;
                    }
                }
                else {
                    creep.room.memory.Structures.controllerLink = controllerLink.id;
                }

            }
        }
        else {
            let links = creep.room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_LINK && building.pos.getRangeTo(creep.room.controller) <= 3});
            if(links.length > 0) {
                let controllerLink = creep.room.controller.pos.findClosestByRange(links);
                if(controllerLink.pos.getRangeTo(creep.room.controller) <= 4)  {
                    creep.room.memory.Structures.controllerLink = controllerLink.id;
                }
            }
        }
    }

    if(creep.room.controller && creep.room.memory.Structures.controllerLink) {
        let controllerLink:any = Game.getObjectById(creep.room.memory.Structures.controllerLink);
        if(controllerLink) {
            if(controllerLink.structureType == STRUCTURE_CONTAINER && controllerLink.store.getFreeCapacity() >= 200 && creep.memory.locked.length == 0) {
                if(creep.room.controller.level >= 7) {
                    creep.room.memory.Structures.controllerLink = false;
                }
                else {
                    creep.memory.locked.push(controllerLink.id);
                }
            }
            else if(controllerLink.structureType == STRUCTURE_LINK && controllerLink.store[RESOURCE_ENERGY] <= 600 && creep.memory.locked.length == 0) {
                creep.memory.locked.push(controllerLink.id);
            }
        }
        else {
            creep.room.memory.Structures.controllerLink = false;
        }
    }
    let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
    if(creep.room.memory.Structures.factory) {
        let factory:any = Game.getObjectById(creep.room.memory.Structures.factory);
        if(factory && factory.store[RESOURCE_ENERGY] < 20000 && storage && storage.store[RESOURCE_ENERGY] > 460000) {
            if(creep.memory.locked.length < 2) {
                creep.memory.locked.push(factory.id);
            }
        }
    }


    if(creep.room.memory.Structures.powerSpawn) {
        let powerSpawn:any = Game.getObjectById(creep.room.memory.Structures.powerSpawn);
        if(powerSpawn && powerSpawn.store[RESOURCE_ENERGY] < 5000 && storage && storage.store[RESOURCE_ENERGY] > 200000) {
            if(creep.memory.locked.length < 2) {
                creep.memory.locked.push(powerSpawn.id);
            }
        }
    }

    // if(creep.room.memory.Structures.nuker) {
    //     let nuker:any = Game.getObjectById(creep.room.memory.Structures.nuker);
    //     if(nuker && nuker.store[RESOURCE_ENERGY] < 300000) {
    //         creep.memory.locked.push(nuker.id);
    //     }
    // }

}


const run = function (creep) {
    creep.memory.moving = false;

    if(creep.ticksToLive == 22 && creep.memory.storage && creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == "filler")}}).length == 1) {
        let newName = 'filler-'+ Math.floor(Math.random() * Game.time) + "-" + creep.room.name;
        if(creep.room.controller.level <= 3 && creep.room.memory.spawn_list) {
            creep.room.memory.spawn_list.unshift([CARRY,MOVE], newName, {memory: {role: 'filler'}});
        }
        else if(creep.room.controller.level >= 4 && creep.room.controller.level <= 6 && creep.room.memory.spawn_list) {
            creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, {memory: {role: 'filler'}});
        }
        else if(creep.room.controller.level == 7 && creep.room.memory.spawn_list) {
            creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE], newName, {memory: {role: 'filler'}});
        }
        else if(creep.room.controller.level == 8 && creep.room.memory.spawn_list) {
            creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'filler'}});
        }
        console.log("added filler to spawn queue", creep.room.name)
    }


	if(creep.ticksToLive <= 14 && !creep.memory.full) {
		creep.memory.suicide = true;
	}
	if(creep.memory.suicide == true) {
		creep.recycle();
        return;
	}


    if(!creep.memory.MaxStorage) {
        let carryPartsAmount = 0
        for(let part of creep.body) {
            if(part.type == CARRY) {
                carryPartsAmount += 1;
            }
        }
        creep.memory.MaxStorage = carryPartsAmount * 50;
    }
    let MaxStorage = creep.memory.MaxStorage;

    let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();


    if(creep.store[RESOURCE_ENERGY] !== MaxStorage && creep.pos.isNearTo(storage)) {
        creep.withdraw(storage, RESOURCE_ENERGY);
    }



    // const start = Game.cpu.getUsed()
    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
        creep.memory.locked = false;
    }
    if(creep.memory.full && creep.store[RESOURCE_ENERGY] < 50) {
        creep.memory.full = false;
    }


    if(creep.memory.full) {
        if(Game.time % 4 == 0 && (!creep.memory.locked || creep.memory.locked.length == 0)) {
            findLocked(creep);
        }
        if(creep.memory.locked && creep.memory.locked.length > 0) {

            let target:any = Game.getObjectById(creep.memory.locked[0]);
            if(target && target.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
                creep.memory.locked.shift();

                if(creep.memory.locked.length > 0) {
                    target = Game.getObjectById(creep.memory.locked[0]);
                    if(target && target.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
                        creep.memory.locked.shift();

                        if(creep.memory.locked.length > 0) {
                            target = Game.getObjectById(creep.memory.locked[0]);
                            if(target && target.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
                                creep.memory.locked.shift();
                            }
                        }
                    }
                }
            }
            target = Game.getObjectById(creep.memory.locked[0]);
            if(target) {
                if(creep.pos.isNearTo(target)) {
                    let transferResult = creep.transfer(target, RESOURCE_ENERGY);
                    if(_.keys(creep.store).length == 0) {
                        creep.memory.full = false;
                    }
                    if(creep.memory.locked.length == 2 && transferResult == 0) {
                        let nextTarget:any = Game.getObjectById(creep.memory.locked[1]);
                        if(nextTarget && creep.pos.getRangeTo(nextTarget) > 1) {
                            creep.MoveCostMatrixRoadPrio(nextTarget, 1);
                        }
                    }
                }
                else {
                    creep.MoveCostMatrixRoadPrio(target, 1);
                }
            }
        }
    }

    if(!creep.memory.full || creep.store[RESOURCE_ENERGY] == 0) {
        let bin;
        if(creep.room.memory.Structures) {
            bin = Game.getObjectById(creep.room.memory.Structures.bin) || creep.room.findBin(storage);
        }
        if(bin && bin.store[RESOURCE_ENERGY] > MaxStorage) {
            if(creep.pos.isNearTo(bin)) {
                creep.withdraw(bin, RESOURCE_ENERGY);
            }
            else {
                creep.MoveCostMatrixSwampPrio(bin, 1);
            }
        }
        else if(storage && storage.store[RESOURCE_ENERGY] > 0) {
            creep.withdrawStorage(storage);
        }
        else if(!creep.room.memory.danger) {
            creep.acquireEnergyWithContainersAndOrDroppedEnergy();
        }
    }
    if(!creep.memory.locked && storage) {
        creep.MoveCostMatrixSwampPrio(storage,5);
    }
}

const roleFiller = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleFiller;
