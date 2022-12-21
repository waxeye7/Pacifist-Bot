/**
 * A little description of this function
 * @param {Creep} creep
 **/

 function findLocked(creep) {
    // if(creep.room.energyAvailable == creep.room.energyCapacityAvailable) {
    //     return false;
    // }

    let towers1 = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_TOWER && building.store[RESOURCE_ENERGY] <= 250)});
    if(towers1.length > 0) {
        let closestTower = creep.pos.findClosestByRange(towers1);
        creep.memory.locked = closestTower.id;
        return closestTower;
    }


    let spawnAndExtensions = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_EXTENSION) && building.store.getFreeCapacity(RESOURCE_ENERGY) > 0});
    if(spawnAndExtensions.length > 0) {
        let closestDropOffLocation = creep.pos.findClosestByRange(spawnAndExtensions);
        creep.memory.locked = closestDropOffLocation.id;
        return closestDropOffLocation;
    }

    let towers2 = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_TOWER && building.store.getFreeCapacity(RESOURCE_ENERGY) >= 100)});
    if(towers2.length > 0) {
        let closestTower = creep.pos.findClosestByRange(towers2);
        creep.memory.locked = closestTower.id;
        return closestTower;
    }

    if(creep.room.energyCapacityAvailable /1.5 < creep.room.energyAvailable) {
        let towers = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_TOWER && building.store[RESOURCE_ENERGY] < 200)});
        if(towers.length > 0) {
            let closestTower = creep.pos.findClosestByRange(towers);
            creep.memory.locked = closestTower.id;
            return closestTower;
        }
    }

    let terminal = creep.room.terminal;
    let storage = Game.getObjectById(creep.memory.storage) || creep.room.findStorage();
    if (terminal && terminal.store[RESOURCE_ENERGY] < 100000 && storage && storage.store[RESOURCE_ENERGY] > 75000) {
        creep.memory.locked = terminal.id;
        return terminal;
    }

    if(creep.room.memory.labs && Object.keys(creep.room.memory.labs).length >= 4) {
        let inputLab1;
        let inputLab2;
        let outputLab1;
        let outputLab2;
        let outputLab3;
        let outputLab4;
        let outputLab5;
        let outputLab6;
        let outputLab7;
        let outputLab8;

        let Labs = [];

        if(creep.room.memory.labs.inputLab1) {
            inputLab1 = Game.getObjectById(creep.room.memory.labs.inputLab1)
            Labs.push(inputLab1)
        }
        if(creep.room.memory.labs.inputLab2) {
            inputLab2 = Game.getObjectById(creep.room.memory.labs.inputLab2)
            Labs.push(inputLab2)
        }
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
            if(lab && lab.store[RESOURCE_ENERGY] <= 2000 - creep.memory.MaxStorage) {
                creep.memory.locked = lab.id;
                return lab;
            }
        }
    }


    if(!creep.memory.controllerLink && creep.room.controller && creep.room.controller.level >= 7) {
        let links = creep.room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_LINK});
        if(links.length > 3) {
            let controllerLink = creep.room.controller.pos.findClosestByRange(links);
            creep.memory.controllerLink = controllerLink.id;
        }
    }
    if(creep.room.controller && creep.room.controller.level >= 7 && creep.memory.controllerLink) {
        let controllerLink:any = Game.getObjectById(creep.memory.controllerLink);
        if(controllerLink && controllerLink.store[RESOURCE_ENERGY] <= 400) {
            creep.memory.locked = controllerLink.id;
            return controllerLink;
        }
    }

    if(creep.room.memory.Structures.factory) {
        let factory:any = Game.getObjectById(creep.room.memory.Structures.factory);
        if(factory && factory.store[RESOURCE_ENERGY] < 2500) {
            creep.memory.locked = factory.id;
            return factory;
        }
    }

}


 const run = function (creep) {
    creep.Speak();
    creep.memory.moving = false;

	if(creep.ticksToLive <= 14 && !creep.memory.full) {
		creep.memory.suicide = true;
	}
	if(creep.memory.suicide == true) {
		creep.recycle();
	}

    if(creep.roadCheck()) {
        creep.moveAwayIfNeedTo();
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


    if(creep.memory.locked) {

        let target:any = Game.getObjectById(creep.memory.locked);
        if(target && target.structureType == STRUCTURE_LINK && target.store.getFreeCapacity() > MaxStorage) {
            creep.memory.locked = false;
        }

    }


    // const start = Game.cpu.getUsed()
    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(creep.memory.full && creep.store[RESOURCE_ENERGY] < 50) {
        creep.memory.full = false;
        creep.memory.locked = false;
    }

    if(!creep.memory.full && Game.time % 2 == 0 && creep.roadCheck()) {
        creep.moveAwayIfNeedTo();
    }

    if(creep.memory.full) {
        let target;
        target = Game.getObjectById(creep.memory.locked);
        if(target && target.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
            creep.memory.locked = false;
        }

        if(!creep.memory.locked) {
            target = findLocked(creep);
        }

        if(creep.memory.locked) {
            target = Game.getObjectById(creep.memory.locked) || findLocked(creep);

            if(target && target.store.getFreeCapacity() == 0) {
                target = findLocked(creep);
            }

            if(creep.pos.isNearTo(target)) {
                creep.transfer(target, RESOURCE_ENERGY);
                if(_.keys(creep.store).length == 0) {
                    creep.memory.full = false;
                }
                else {
                    target = findLocked(creep);
                    if(!creep.pos.isNearTo(target)) {
                        creep.moveTo(target, {reusePath:25});
                    }
                }
            }
            else {
                creep.MoveCostMatrixRoadPrio(target, 1);
            }
        }
        else {
            creep.moveAwayIfNeedTo()
        }
    }


    if(!creep.memory.full || creep.store[RESOURCE_ENERGY] == 0) {
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        let bin;
        if(creep.room.memory.Structures) {
            bin = Game.getObjectById(creep.room.memory.Structures.bin) || creep.room.findBin(storage);
        }
        if(bin && bin.store[RESOURCE_ENERGY] > MaxStorage) {
            if(creep.pos.isNearTo(bin)) {
                creep.withdraw(bin, RESOURCE_ENERGY);
                findLocked(creep);
            }
            else {
                creep.MoveCostMatrixRoadPrio(bin, 1);
            }
        }
        else if(storage && storage.store[RESOURCE_ENERGY] > 0) {
            let result = creep.withdrawStorage(storage);
            if(result == 0) {
                let target = findLocked(creep);
                creep.MoveCostMatrixRoadPrio(target, 1);
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
        }
        else if(!creep.room.memory.danger) {
            creep.acquireEnergyWithContainersAndOrDroppedEnergy();
        }
        else {
            if(creep.roadCheck()) {
                creep.moveAwayIfNeedTo();
            }
        }
    }

}

const roleFiller = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleFiller;











    // if(creep.store[RESOURCE_ENERGY] == 0) {
    //     creep.memory.full = false;
    // }

    // if(target.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
    //     creep.memory.locked = false;
    // }


    // let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
    // let result = creep.withdrawStorage(storage);
    // if(result == 0) {
    //     let spawnAndExtensionsAndTowers = creep.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_EXTENSION || building.structureType == STRUCTURE_TOWER) && building.store.getFreeCapacity(RESOURCE_ENERGY) > 0});
    //     if(spawnAndExtensionsAndTowers.length > 0) {
    //         let closestDropOffLocation = creep.pos.findClosestByRange(spawnAndExtensionsAndTowers);
    //         creep.memory.locked = closestDropOffLocation.id;
    //     }
    //     if(creep.memory.locked) {
    //         let target = Game.getObjectById(creep.memory.locked);

    //         if(creep.pos.isNearTo(target)) {
    //             creep.transfer(target, RESOURCE_ENERGY);

    //             if(creep.store[RESOURCE_ENERGY] == 0) {
    //                 creep.memory.full = false;
    //             }

    //             if(target.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
    //                 creep.memory.locked = false;
    //             }

    //         }
    //         else {
    //             creep.moveTo(target, {reusePath:20});
    //         }
    //     }
    // }

    // let lowEnergyTowers = creep.room.find(FIND_STRUCTURES, {
    //     filter: (structure) => {
    //         return (structure.structureType == STRUCTURE_TOWER) &&
    //             structure.store.getFreeCapacity(RESOURCE_ENERGY) >= 200 &&
    //             structure.store.getFreeCapacity(RESOURCE_ENERGY < 900);
    //     }
    // });


    // let targets = creep.room.find(FIND_STRUCTURES, {
    //     filter: (structure) => {
    //         return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN) && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;}});

    // if(creep.store[RESOURCE_ENERGY] == 0) {
    //     let result = creep.withdrawStorage(storage);
    //     if(targets.length > 0 && result == 0) {
    //         creep.moveTo(targets[0]);
    //     }
    //     return;
    // }

    // if(lowEnergyTowers.length > 0) {
    //     let closestTarget = creep.pos.findClosestByRange(lowEnergyTowers);
    //     if(creep.transfer(closestTarget, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
    //         creep.moveTo(closestTarget, {reusePath:10, visualizePathStyle: {stroke: '#ffffff'}});
    //     }
    //     else if (creep.transfer(closestTarget, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] > 0) {
    //         creep.moveTo(closestTarget, {reusePath:10, visualizePathStyle: {stroke: '#ffffff'}});
    //     }
    //     else if (creep.transfer(closestTarget, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
    //         creep.moveTo(storage, {reusePath:10, visualizePathStyle: {stroke: '#ffaa00'}});
    //     }
    //     return;
    // }

    // let terminal = creep.room.terminal;

    // if (terminal && terminal.store[RESOURCE_ENERGY] < 10000) {
    //     if(creep.pos.isNearTo(terminal)) {
    //         creep.transfer(terminal, RESOURCE_ENERGY);
    //     }
    //     else {
    //         creep.moveTo(terminal, {reusePath:10});
    //     }
    //     return;
    // }


    // if(targets.length > 0) {
    //     let closestTarget = creep.pos.findClosestByRange(targets);
    //     if(creep.transfer(closestTarget, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
    //         creep.moveTo(closestTarget, {reusePath:10, visualizePathStyle: {stroke: '#ffffff'}});
    //     }
    //     else if (creep.transfer(closestTarget, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] > 0) {
    //         creep.moveTo(closestTarget, {reusePath:10, visualizePathStyle: {stroke: '#ffffff'}});
    //     }
    //     else if (creep.transfer(closestTarget, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
    //         creep.moveTo(storage, {reusePath:10, visualizePathStyle: {stroke: '#ffaa00'}});
    //     }
    //     return;
    // }

    // let towers = creep.room.find(FIND_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_TOWER && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0) }});
    // if(towers.length > 0) {
    //     if(creep.pos.isNearTo(towers[0])) {
    //         creep.transfer(towers[0], RESOURCE_ENERGY);
    //     }
    //     else {
    //         creep.moveTo(towers[0], {reusePath:10});
    //     }
    //     return;
    // }

    // if (targets.length == 0 && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    //     if(creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
    //         creep.moveTo(storage, {reusePath:10, visualizePathStyle: {stroke: '#ffaa00'}});
    //     }
    //     return;
    // }
    // console.log('Filler Ran in', Game.cpu.getUsed() - start, 'ms')
