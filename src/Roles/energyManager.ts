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

    if(creep.roadCheck()) {
        creep.moveAwayIfNeedTo();
    }

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
        return;
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
        let outputLab;
        let boostLab;
        let pair1Lab1;
        let pair1Lab2;
        let pair2Lab1;
        let pair2Lab2;
        let pair3Lab1;
        let pair3Lab2;
        let pair4Lab1;
        let pair4Lab2;

        let labPairs = [];

        if(creep.room.memory.labs.outputLab) {
            outputLab = Game.getObjectById(creep.room.memory.labs.outputLab)
        }
        if(creep.room.memory.labs.pair1Lab1) {
            pair1Lab1 = Game.getObjectById(creep.room.memory.labs.pair1Lab1)
        }
        if(creep.room.memory.labs.pair1Lab2) {
            pair1Lab2 = Game.getObjectById(creep.room.memory.labs.pair1Lab2)
        }
        if(creep.room.memory.labs.boostLab) {
            boostLab = Game.getObjectById(creep.room.memory.labs.boostLab)
        }
        if(creep.room.memory.labs.pair2Lab1) {
            pair2Lab1 = Game.getObjectById(creep.room.memory.labs.pair2Lab1)
        }
        if(creep.room.memory.labs.pair2Lab2) {
            pair2Lab2 = Game.getObjectById(creep.room.memory.labs.pair2Lab2)
        }
        if(creep.room.memory.labs.pair3Lab1) {
            pair3Lab1 = Game.getObjectById(creep.room.memory.labs.pair3Lab1)
        }
        if(creep.room.memory.labs.pair3Lab2) {
            pair3Lab2 = Game.getObjectById(creep.room.memory.labs.pair3Lab2)
        }
        if(creep.room.memory.labs.pair4Lab1) {
            pair4Lab1 = Game.getObjectById(creep.room.memory.labs.pair4Lab1)
        }
        if(creep.room.memory.labs.pair4Lab2) {
            pair4Lab2 = Game.getObjectById(creep.room.memory.labs.pair4Lab2)
        }


        if(pair1Lab1 && pair1Lab2) {
            labPairs.push([pair1Lab1, pair1Lab2])
        }
        if(pair2Lab1 && pair2Lab2) {
            labPairs.push([pair2Lab1, pair2Lab2])
        }
        if(pair3Lab1 && pair3Lab2) {
            labPairs.push([pair3Lab1, pair3Lab2])
        }
        if(pair4Lab1 && pair4Lab2) {
            labPairs.push([pair4Lab1, pair4Lab2])
        }

        let currentOutput = creep.room.memory.labs.status.currentOutput;
        let lab1Input = creep.room.memory.labs.status.lab1Input;
        let lab2Input = creep.room.memory.labs.status.lab2Input;

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

        for(let labPair of labPairs) {

            if(labPair[0] && labPair[0].store[labPair[0].mineralType] > 0 && labPair[0].mineralType != lab1Input) {
                console.log('test2')

                if(creep.store[labPair[0].mineralType] > 0) {
                    if(creep.pos.isNearTo(storage)) {
                        creep.transfer(storage, labPair[0].mineralType);
                    }
                    else {
                        creep.moveTo(storage);
                    }
                }
                else {
                    if(creep.pos.isNearTo(labPair[0])) {
                        creep.withdraw(labPair[0], labPair[0].mineralType);
                    }
                    else {
                        creep.moveTo(labPair[0]);
                    }
                }
                return;
            }

            if(labPair[1] && labPair[1].store[labPair[1].mineralType] > 0 && labPair[1].mineralType != lab2Input) {
                console.log('test3')

                if(creep.store[labPair[1].mineralType] > 0) {
                    if(creep.pos.isNearTo(storage)) {
                        creep.transfer(storage, labPair[1].mineralType);
                    }
                    else {
                        creep.moveTo(storage);
                    }
                }
                else {
                    if(creep.pos.isNearTo(labPair[1])) {
                        creep.withdraw(labPair[1], labPair[1].mineralType);
                    }
                    else {
                        creep.moveTo(labPair[1]);
                    }
                }
                return;
            }
        }

// remove stuff because input changed above ^^^^
// add stuff to current input below or remove overflowing output lab below >>>>

        if(outputLab && outputLab.mineralType == currentOutput && (outputLab.store[currentOutput] >= 3000 - MaxStorage || outputLab.store[currentOutput] >= 3000 - MaxStorage*2 && creep.store[currentOutput] > 0)) {
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


        // if(outputLab && outputLab.store.getFreeCapacity() != 0) {
        //     for(let labPair of labPairs) {
        //         if(labPair[0] && labPair[0].store[lab1Input] >= 5 && labPair[1] && labPair[1].store[lab2Input] >= 5) {
        //             outputLab.runReaction(labPair[0], labPair[1]);
        //         }
        //     }
        // }




        for(let labPair of labPairs) {

            // storage withdraw

            if(labPair[0] && labPair[0].store[lab1Input] < MaxStorage*3 && labPair[0].store[lab1Input] < 1000 && storage && storage.store[lab1Input] >= MaxStorage) {
                console.log('test7')

                if(creep.store[lab1Input] > 0) {
                    if(creep.pos.isNearTo(labPair[0])) {
                        creep.transfer(labPair[0], lab1Input);
                    }
                    else {
                        creep.moveTo(labPair[0]);
                    }
                    return;
                }
                else {
                    if(creep.pos.isNearTo(storage)) {
                        let result = creep.withdraw(storage, lab1Input);
                        if(result == 0) {
                            creep.moveTo(labPair[1]);
                        }
                    }
                    else {
                        creep.moveTo(storage);
                    }
                }
            }

            if(labPair[1] && labPair[1].store[lab2Input] < MaxStorage*3 && labPair[1].store[lab2Input] < 1000 && storage && storage.store[lab2Input] >= MaxStorage) {
                console.log('test8')

                if(creep.store[lab2Input] > 0) {

                    if(creep.pos.isNearTo(labPair[1])) {
                        creep.transfer(labPair[1], lab2Input);
                    }
                    else {
                        creep.moveTo(labPair[1]);
                    }
                    return;
                }
                else {
                    if(creep.pos.isNearTo(storage)) {
                        let result = creep.withdraw(storage, lab2Input);
                        if(result == 0) {
                            creep.moveTo(labPair[1]);
                        }
                    }
                    else {
                        creep.moveTo(storage);
                    }
                }
            }



            if(labPair[0] && labPair[0].store[lab1Input] < MaxStorage*3 && labPair[0].store[labPair[0].mineralType] < MaxStorage*3 && terminal && terminal.store[lab1Input] >= MaxStorage) {
                console.log('test5')

                if(creep.store[lab1Input] > 0) {
                    if(creep.pos.isNearTo(labPair[0])) {
                        creep.transfer(labPair[0], lab1Input);
                    }
                    else {
                        creep.moveTo(labPair[0]);
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

            if(labPair[1] && labPair[1].store[lab2Input] < MaxStorage*3 && labPair[1].store[labPair[1].mineralType] < MaxStorage*3 && terminal && terminal.store[lab2Input] >= MaxStorage) {
                console.log('test6')

                if(creep.store[lab2Input] > 0) {

                    if(creep.pos.isNearTo(labPair[1])) {
                        creep.transfer(labPair[1], lab2Input);
                    }
                    else {
                        creep.moveTo(labPair[1]);
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

    }

    let Mineral:any = Game.getObjectById(creep.room.memory.mineral) || creep.room.findMineral();
    let MineralType = Mineral.mineralType;
    //  && creep.store[RESOURCE_ENERGY] == 0 && creep.store[MineralType] == 0
    if(storage && storage.store[MineralType] > 1200 && terminal && terminal.store.getFreeCapacity() > MaxStorage && _.keys(creep.store).length == 0) {
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
    else if(terminal && terminal.store.getFreeCapacity() > MaxStorage && creep.store.getFreeCapacity() == 0) {
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


    // if(storage && creep.store.getFreeCapacity() == 0) {
    //     if(creep.pos.isNearTo(storage)) {
    //         for(let resourceType in creep.carry) {
    //             creep.transfer(storage, resourceType);
    //         }
    //     }
    //     else {
    //         creep.moveTo(storage);
    //     }
    // }

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
