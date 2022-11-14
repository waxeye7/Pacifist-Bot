/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {
    creep.Speak();

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

    if(creep.roadCheck()) {
        creep.moveAwayIfNeedTo();
    }

	if(creep.ticksToLive <= 10 && _.keys(creep.store).length == 0) {
		creep.memory.suicide = true;
	}
	if(creep.memory.suicide == true) {
		creep.recycle();
	}


    // if(Game.time % 750 == 0 && creep.room.energyAvailable <= 1000 && creep.room.energyAvailable > 300 && creep.room.find(FIND_MY_CREEPS).length > 6) {
    //     for(let resourceType in creep.carry) {
    //         if(resourceType != RESOURCE_ENERGY) {
    //             creep.drop(resourceType);
    //         }
    //     }
    //     creep.memory.role = "filler";
    // }


    let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

    if(storage && creep.store.getFreeCapacity() != 0 && creep.store.getFreeCapacity() != MaxStorage) {
        if(creep.pos.isNearTo(storage)) {
            for(let resourceType in creep.carry) {
                creep.transfer(storage, resourceType);
            }
        }
        else {
            creep.moveTo(storage);
        }
    }


    let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();

    if(closestLink && closestLink.store[RESOURCE_ENERGY] > 0 && creep.store.getFreeCapacity() == MaxStorage) {
        if(creep.pos.isNearTo(closestLink)) {
            creep.withdraw(closestLink, RESOURCE_ENERGY);
            return;
        }
        else {
            creep.moveTo(closestLink);
            return;
        }
    }

    if(creep.store[RESOURCE_ENERGY] > 0) {
        if(creep.pos.isNearTo(storage)) {
            for(let resourceType in creep.carry) {
                creep.transfer(storage, resourceType);
            }
            return;
        }
        else {
            creep.moveTo(storage, {ignoreRoads:true});
            return;
        }
    }

    let bin = Game.getObjectById(creep.room.memory.bin) || creep.room.findBin(storage);

    if(bin && bin.store.getFreeCapacity() < 2000 && creep.store.getFreeCapacity() == MaxStorage) {
        if(creep.pos.isNearTo(bin)) {
            for(let resourceType in bin.store) {
                creep.withdraw(bin, resourceType);
            }
            return;
        }
        else {
            creep.moveTo(bin);
            return;
        }
    }

    let terminal = creep.room.terminal;

    if(terminal && terminal.store[RESOURCE_ENERGY] > 27000 && creep.store.getFreeCapacity() == MaxStorage) {
        if(creep.pos.isNearTo(terminal)) {
            if(creep.withdraw(terminal, RESOURCE_ENERGY) == 0) {
                if(!creep.pos.isNearTo(storage)) {
                    creep.moveTo(storage);
                }
            }
        }
        else {
            creep.moveTo(terminal);
        }
        return;
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

        let outputLabs = [];

        if(creep.room.memory.labs.inputLab1) {
            inputLab1 = Game.getObjectById(creep.room.memory.labs.inputLab1)
        }
        if(creep.room.memory.labs.inputLab2) {
            inputLab2 = Game.getObjectById(creep.room.memory.labs.inputLab2)
        }
        if(creep.room.memory.labs.outputLab1) {
            outputLab1 = Game.getObjectById(creep.room.memory.labs.outputLab1)
            outputLabs.push(outputLab1)
        }
        if(creep.room.memory.labs.outputLab2) {
            outputLab2 = Game.getObjectById(creep.room.memory.labs.outputLab2)
            outputLabs.push(outputLab2)
        }
        if(creep.room.memory.labs.outputLab3) {
            outputLab3 = Game.getObjectById(creep.room.memory.labs.outputLab3)
            outputLabs.push(outputLab3)
        }
        if(creep.room.memory.labs.outputLab4) {
            outputLab4 = Game.getObjectById(creep.room.memory.labs.outputLab4)
            outputLabs.push(outputLab4)
        }
        if(creep.room.memory.labs.outputLab5) {
            outputLab5 = Game.getObjectById(creep.room.memory.labs.outputLab5)
            outputLabs.push(outputLab5)
        }
        if(creep.room.memory.labs.outputLab6) {
            outputLab6 = Game.getObjectById(creep.room.memory.labs.outputLab6)
            outputLabs.push(outputLab6)
        }
        if(creep.room.memory.labs.outputLab7) {
            outputLab7 = Game.getObjectById(creep.room.memory.labs.outputLab7)
            outputLabs.push(outputLab7)
        }
        if(creep.room.memory.labs.outputLab8) {
            outputLab8 = Game.getObjectById(creep.room.memory.labs.outputLab8)
            outputLabs.push(outputLab8)
        }

        let currentOutput = creep.room.memory.labs.status.currentOutput;
        let lab1Input = creep.room.memory.labs.status.lab1Input;
        let lab2Input = creep.room.memory.labs.status.lab2Input;

        for(let outputLab of outputLabs) {
            if(outputLab && outputLab.store[outputLab.mineralType] > 0 && outputLab.mineralType != currentOutput) {
                console.log('test1')

                if(creep.store[outputLab.mineralType] > 0) {
                    if(creep.pos.isNearTo(storage)) {
                        creep.transfer(storage, outputLab.mineralType);
                    }
                    else {
                        creep.moveTo(storage);
                    }
                }
                else {
                    if(creep.pos.isNearTo(outputLab)) {
                        creep.withdraw(outputLab, outputLab.mineralType);
                    }
                    else {
                        creep.moveTo(outputLab);
                    }
                }
                return;
            }
        }


        if(inputLab1 && inputLab1.store[inputLab1.mineralType] > 0 && inputLab1.mineralType != lab1Input) {
            console.log('test2')

            if(creep.store[inputLab1.mineralType] > 0) {
                if(creep.pos.isNearTo(storage)) {
                    creep.transfer(storage, inputLab1.mineralType);
                }
                else {
                    creep.moveTo(storage);
                }
            }
            else {
                if(creep.pos.isNearTo(inputLab1)) {
                    creep.withdraw(inputLab1, inputLab1.mineralType);
                }
                else {
                    creep.moveTo(inputLab1);
                }
            }
            return;
        }

        if(inputLab2 && inputLab2.store[inputLab2.mineralType] > 0 && inputLab2.mineralType != lab2Input) {
            console.log('test3')

            if(creep.store[inputLab2.mineralType] > 0) {
                if(creep.pos.isNearTo(storage)) {
                    creep.transfer(storage, inputLab2.mineralType);
                }
                else {
                    creep.moveTo(storage);
                }
            }
            else {
                if(creep.pos.isNearTo(inputLab2)) {
                    creep.withdraw(inputLab2, inputLab2.mineralType);
                }
                else {
                    creep.moveTo(inputLab2);
                }
            }
            return;
        }

// remove stuff because input changed above ^^^^
// add stuff to current input below or remove overflowing output lab below >>>>

        for(let outputLab of outputLabs) {

            if(outputLab && outputLab.mineralType == currentOutput && (outputLab.store[currentOutput] >= 1600 - MaxStorage || outputLab.store[currentOutput] >= 1600 - MaxStorage*2 && creep.store[currentOutput] > 0)) {
                console.log('test4')

                if(creep.store[currentOutput] > 0) {
                    if(creep.pos.isNearTo(storage)) {
                        creep.transfer(storage, currentOutput);
                    }
                    else {
                        creep.moveTo(storage);
                    }
                    return;
                }
                else {
                    if(creep.pos.isNearTo(outputLab)) {
                        creep.withdraw(outputLab, currentOutput);
                    }
                    else {
                        creep.moveTo(outputLab);
                    }
                }
                return;
            }
        }


        // if(outputLab && outputLab.store.getFreeCapacity() != 0) {
        //     for(let labPair of labPairs) {
        //         if(inputLab1 && inputLab1.store[lab1Input] >= 5 && inputLab2 && inputLab2.store[lab2Input] >= 5) {
        //             outputLab.runReaction(inputLab1, inputLab2);
        //         }
        //     }
        // }

            // storage withdraw

        if(inputLab1 && inputLab1.store[lab1Input] < MaxStorage*3 && inputLab1.store[lab1Input] < 1000 && storage && storage.store[lab1Input] >= MaxStorage) {
            console.log('test7')

            if(creep.store[lab1Input] > 0) {
                if(creep.pos.isNearTo(inputLab1)) {
                    creep.transfer(inputLab1, lab1Input);
                }
                else {
                    creep.moveTo(inputLab1);
                }
                return;
            }
            else {
                if(creep.pos.isNearTo(storage)) {
                    let result = creep.withdraw(storage, lab1Input);
                    if(result == 0) {
                        creep.moveTo(inputLab2);
                    }
                }
                else {
                    creep.moveTo(storage);
                }
            }
        }

        if(inputLab2 && inputLab2.store[lab2Input] < MaxStorage*3 && inputLab2.store[lab2Input] < 1000 && storage && storage.store[lab2Input] >= MaxStorage) {
            console.log('test8')

            if(creep.store[lab2Input] > 0) {

                if(creep.pos.isNearTo(inputLab2)) {
                    creep.transfer(inputLab2, lab2Input);
                }
                else {
                    creep.moveTo(inputLab2);
                }
                return;
            }
            else {
                if(creep.pos.isNearTo(storage)) {
                    let result = creep.withdraw(storage, lab2Input);
                    if(result == 0) {
                        creep.moveTo(inputLab2);
                    }
                }
                else {
                    creep.moveTo(storage);
                }
            }
        }



        if(inputLab1 && inputLab1.store[lab1Input] < MaxStorage*3 && inputLab1.store[lab1Input] < MaxStorage*3 && terminal && terminal.store[lab1Input] >= MaxStorage) {
            console.log('test5')

            if(creep.store[lab1Input] > 0) {
                if(creep.pos.isNearTo(inputLab1)) {
                    creep.transfer(inputLab1, lab1Input);
                }
                else {
                    creep.moveTo(inputLab1);
                }
                return;
            }
            else {
                if(creep.pos.isNearTo(terminal)) {
                    creep.withdraw(terminal, lab1Input);
                }
                else {
                    creep.moveTo(terminal);
                }
            }
        }

        if(inputLab2 && inputLab2.store[lab2Input] < MaxStorage*3 && inputLab2.store[lab2Input] < MaxStorage*3 && terminal && terminal.store[lab2Input] >= MaxStorage) {
            console.log('test6')

            if(creep.store[lab2Input] > 0) {

                if(creep.pos.isNearTo(inputLab2)) {
                    creep.transfer(inputLab2, lab2Input);
                }
                else {
                    creep.moveTo(inputLab2);
                }
                return;
            }
            else {
                if(creep.pos.isNearTo(terminal)) {
                    creep.withdraw(terminal, lab2Input);
                }
                else {
                    creep.moveTo(terminal);
                }
            }
        }

    }

    let Mineral:any = Game.getObjectById(creep.room.memory.mineral) || creep.room.findMineral();
    let MineralType = Mineral.mineralType;
    //  && creep.store[RESOURCE_ENERGY] == 0 && creep.store[MineralType] == 0
    if(storage && storage.store[MineralType] > 5000 && terminal && terminal.store.getFreeCapacity() > MaxStorage && _.keys(creep.store).length == 0) {
        console.log('test11')

        if(creep.pos.isNearTo(storage)) {
            creep.withdraw(storage, MineralType);
            if(!creep.pos.isNearTo(terminal)) {
                creep.moveTo(terminal);
            }
        }
        else {
            creep.moveTo(storage, {ignoreRoads:true});
        }
        return;
    }
    else if(terminal && terminal.store.getFreeCapacity() > MaxStorage && creep.store.getFreeCapacity() == 0 && creep.store[MineralType] > 0) {
        console.log('test10')

        if(creep.pos.isNearTo(terminal)) {
            creep.transfer(terminal, MineralType);
            if(!creep.pos.isNearTo(storage)) {
                creep.moveTo(storage, {ignoreRoads:true});
            }
        }
        else {
            creep.moveTo(terminal);
        }
        return;
    }

    if(terminal) {
        for(let resource in creep.store) {
            if(resource == RESOURCE_MIST || resource == RESOURCE_METAL || resource == RESOURCE_SILICON || resource == RESOURCE_BIOMASS || resource == RESOURCE_OPS || resource == RESOURCE_POWER)
            {
                if(creep.pos.isNearTo(terminal)) {
                    creep.transfer(terminal, resource);
                }
                else {
                    creep.moveTo(terminal);
                }
                return;
            }
        }
    }


    if(storage && creep.store.getFreeCapacity() <= 50 && creep.store[RESOURCE_MIST] == 0 && creep.store[RESOURCE_METAL] == 0  && creep.store[RESOURCE_SILICON] == 0  && creep.store[RESOURCE_BIOMASS] == 0  && creep.store[RESOURCE_BIOMASS] == 0  && creep.store[RESOURCE_OPS] == 0  && creep.store[RESOURCE_POWER] == 0) {
        if(creep.pos.isNearTo(storage)) {
            for(let resource in creep.store) {
                creep.transfer(storage, resource);
            }
        }
        else {
            creep.moveTo(storage);
        }
    }


    if(terminal && storage && _.keys(terminal.store).length > 0) {
        for(let resource in terminal.store) {
            if(resource != RESOURCE_ENERGY && resource != RESOURCE_HYDROGEN && resource != RESOURCE_OXYGEN && resource != RESOURCE_UTRIUM && resource != RESOURCE_KEANIUM
                && resource != RESOURCE_LEMERGIUM && resource != RESOURCE_ZYNTHIUM && resource != RESOURCE_CATALYST && resource != RESOURCE_MIST && resource != RESOURCE_SILICON
                && resource != RESOURCE_BIOMASS && resource != RESOURCE_METAL && resource != RESOURCE_POWER && resource != RESOURCE_OPS)
            {
                if(creep.store[resource] > 0) {
                    if(creep.pos.isNearTo(storage)) {
                        creep.transfer(storage, resource);
                    }
                    else {
                        creep.moveTo(storage);
                    }
                    return;
                }
                else {
                    if(creep.pos.isNearTo(terminal)) {
                        creep.withdraw(terminal, resource);
                    }
                    else {
                        creep.moveTo(terminal);
                    }
                }
            }
        }
    }

    if(storage && terminal &&  _.keys(storage.store).length > 0) {
        for(let resource in storage.store) {
            if(resource == RESOURCE_MIST || resource == RESOURCE_METAL || resource == RESOURCE_SILICON || resource == RESOURCE_BIOMASS || resource == RESOURCE_OPS || resource == RESOURCE_POWER)
            {
                if(creep.store[resource] > 0) {
                    if(creep.pos.isNearTo(terminal)) {
                        creep.transfer(terminal, resource);
                    }
                    else {
                        creep.moveTo(terminal);
                    }
                    return;
                }
                else {
                    if(creep.pos.isNearTo(storage)) {
                        creep.withdraw(storage, resource);
                    }
                    else {
                        creep.moveTo(storage);
                    }
                }
            }
        }
    }


    // if(storage && creep.store.getFreeCapacity() != MaxStorage &&
    // creep.store[RESOURCE_LEMERGIUM] == 0 && creep.store[RESOURCE_CATALYST] == 0 &&
    // creep.store[RESOURCE_HYDROGEN] == 0 && creep.store[RESOURCE_KEANIUM] == 0 &&
    // creep.store[RESOURCE_UTRIUM] == 0 && creep.store[RESOURCE_ZYNTHIUM] == 0 &&
    // creep.store[RESOURCE_OXYGEN] == 0) {
    //     if(creep.pos.isNearTo(storage)) {
    //         for(let resourceType in creep.carry) {
    //             creep.transfer(storage, resourceType);
    //         }
    //     }
    //     else {
    //         creep.moveTo(storage);
    //     }
    //     return;
    // }
}


const roleEnergyManager = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleEnergyManager;
