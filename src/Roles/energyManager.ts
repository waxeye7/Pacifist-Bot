import randomWords from "random-words";

/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {
    ;
    creep.memory.moving = false;
    if(creep.ticksToLive == 60 && creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == "EnergyManager")}}).length == 1) {
        let newName = 'EnergyManager-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + creep.room.name;
        if(creep.room.memory.danger && creep.room.memory.danger_timer > 100) {
            creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'EnergyManager'}});
        }
        else {
            if(creep.room.controller.level == 6) {
                creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, {memory: {role: 'EnergyManager'}});
            }
            else if(creep.room.controller.level == 7) {
                creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE], newName, {memory: {role: 'EnergyManager'}});
            }
            else if(creep.room.controller.level == 8) {
                creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'EnergyManager'}});
            }
        }

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

	if(creep.ticksToLive <= 10 && _.keys(creep.store).length == 0) {
		creep.memory.suicide = true;
	}
	if(creep.memory.suicide == true) {
		creep.recycle();
        return;
	}



    if(creep.store.getFreeCapacity() == MaxStorage) {
        creep.memory.target = false
    }

    if(creep.memory.target) {
        let target = Game.getObjectById(creep.memory.target);
        if(creep.pos.isNearTo(target)) {
            for(let resource in creep.store) {
                if(creep.transfer(target, resource) !== 0) {
                    creep.memory.target = false;
                }
            }
        }
        else {
            creep.MoveCostMatrixRoadPrio(target, 1)
        }
    }
    if(!creep.memory.target) {
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        let terminal = creep.room.terminal;
        let factory; if(creep.room.controller.level >= 7 && creep.room.memory.Structures.factory) {factory = Game.getObjectById(creep.room.memory.Structures.factory);}
        let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLinkToStorage();
        let bin = Game.getObjectById(creep.room.memory.Structures.bin) || creep.room.findBin(storage);

        if(creep.store.getFreeCapacity() == 0) {
            creep.memory.target = storage.id;
            return;
        }



        if(creep.room.memory.labs) {
            let inputLab1; let inputLab2;
            let outputLab1; let outputLab2; let outputLab3; let outputLab4;
            let outputLab5; let outputLab6; let outputLab7; let outputLab8;

            let outputLabs = [];

            if(creep.room.memory.labs.inputLab1) {inputLab1 = Game.getObjectById(creep.room.memory.labs.inputLab1)}
            if(creep.room.memory.labs.inputLab2) {inputLab2 = Game.getObjectById(creep.room.memory.labs.inputLab2)}
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

            if(inputLab1 && inputLab1.mineralType != undefined && inputLab1.mineralType != lab1Input) {
                if(creep.pos.isNearTo(inputLab1)) {
                    creep.withdraw(inputLab1, inputLab1.mineralType);
                    creep.memory.target = storage.id;
                }
                else {
                    creep.MoveCostMatrixRoadPrio(inputLab1, 1);
                }
                return;
            }

            if(inputLab2 && inputLab2.mineralType != undefined && inputLab2.mineralType != lab2Input) {
                if(creep.pos.isNearTo(inputLab2)) {
                    creep.withdraw(inputLab2, inputLab2.mineralType);
                    creep.memory.target = storage.id;
                }
                else {
                    creep.MoveCostMatrixRoadPrio(inputLab2, 1);
                }
                return;
            }
            let number = 0;
            for(let outputLab of outputLabs) {
                number += 1;

                if(number == 1 && creep.room.memory.labs.outputLab1 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab1 && creep.room.memory.labs.status.boost.lab1.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab1.amount == 0) {
                        // do nothing
                    }
                    else {
                        if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != RESOURCE_UTRIUM_OXIDE)) {
                            if(creep.pos.isNearTo(outputLab)) {
                                creep.withdraw(outputLab, outputLab.mineralType);
                                creep.memory.target = storage.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(outputLab, 1);
                            }
                            return;
                        }
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_UTRIUM_OXIDE) && storage && storage.store[RESOURCE_UTRIUM_OXIDE] >= creep.room.memory.labs.status.boost.lab1.amount) {
                            if(creep.pos.isNearTo(storage)) {
                                if(creep.room.memory.labs.status.boost.lab1.amount >= MaxStorage) {
                                    creep.room.memory.labs.status.boost.lab1.amount -= MaxStorage;
                                    creep.withdraw(storage, RESOURCE_UTRIUM_OXIDE);
                                }
                                else {
                                    creep.withdraw(storage, RESOURCE_UTRIUM_OXIDE, creep.room.memory.labs.status.boost.lab1.amount);
                                    creep.room.memory.labs.status.boost.lab1.amount = 0;
                                }
                                creep.memory.target = outputLab.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(storage, 1);
                            }
                            return;
                        }

                    }
                }


                else if(number == 2 && creep.room.memory.labs.outputLab2 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab2 && creep.room.memory.labs.status.boost.lab2.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab2.amount == 0) {
                        // do nothing
                    }
                    else {
                        if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != RESOURCE_CATALYZED_LEMERGIUM_ACID)) {
                            if(creep.pos.isNearTo(outputLab)) {
                                creep.withdraw(outputLab, outputLab.mineralType);
                                creep.memory.target = storage.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(outputLab, 1);
                            }
                            return;
                        }
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_LEMERGIUM_ACID) && storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] >= creep.room.memory.labs.status.boost.lab2.amount) {
                            if(creep.pos.isNearTo(storage)) {
                                if(creep.room.memory.labs.status.boost.lab2.amount >= MaxStorage) {
                                    creep.room.memory.labs.status.boost.lab2.amount -= MaxStorage;

                                    creep.withdraw(storage, RESOURCE_CATALYZED_LEMERGIUM_ACID);
                                }
                                else {
                                    creep.withdraw(storage, RESOURCE_CATALYZED_LEMERGIUM_ACID, creep.room.memory.labs.status.boost.lab2.amount);
                                    creep.room.memory.labs.status.boost.lab2.amount = 0;

                                }
                                creep.memory.target = outputLab.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(storage, 1);
                            }
                            return;
                        }
                    }
                }

                else if(number == 3 && creep.room.memory.labs.outputLab3 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab3 && creep.room.memory.labs.status.boost.lab3.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab3.amount == 0) {
                        // do nothing
                    }
                    else {
                        if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != RESOURCE_CATALYZED_UTRIUM_ACID)) {
                            if(creep.pos.isNearTo(outputLab)) {
                                creep.withdraw(outputLab, outputLab.mineralType);
                                creep.memory.target = storage.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(outputLab, 1);
                            }
                            return;
                        }
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_UTRIUM_ACID) && storage && storage.store[RESOURCE_CATALYZED_UTRIUM_ACID] >= creep.room.memory.labs.status.boost.lab3.amount) {
                            if(creep.pos.isNearTo(storage)) {
                                if(creep.room.memory.labs.status.boost.lab3.amount >= MaxStorage) {
                                    creep.room.memory.labs.status.boost.lab3.amount -= MaxStorage;

                                    creep.withdraw(storage, RESOURCE_CATALYZED_UTRIUM_ACID);
                                }
                                else {
                                    creep.withdraw(storage, RESOURCE_CATALYZED_UTRIUM_ACID, creep.room.memory.labs.status.boost.lab3.amount);
                                    creep.room.memory.labs.status.boost.lab3.amount = 0;

                                }
                                creep.memory.target = outputLab.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(storage, 1);
                            }
                            return;
                        }
                    }
                }


                else if(number == 4 && creep.room.memory.labs.outputLab4 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab4 && creep.room.memory.labs.status.boost.lab4.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab4.amount == 0) {
                        // do nothing
                    }
                    else {
                        if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE)) {
                            if(creep.pos.isNearTo(outputLab)) {
                                creep.withdraw(outputLab, outputLab.mineralType);
                                creep.memory.target = storage.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(outputLab, 1);
                            }
                            return;
                        }
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) && storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] >= creep.room.memory.labs.status.boost.lab4.amount) {
                            if(creep.pos.isNearTo(storage)) {
                                if(creep.room.memory.labs.status.boost.lab4.amount >= MaxStorage) {
                                    creep.room.memory.labs.status.boost.lab4.amount -= MaxStorage;

                                    creep.withdraw(storage, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE);
                                }
                                else {
                                    creep.withdraw(storage, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, creep.room.memory.labs.status.boost.lab4.amount);
                                    creep.room.memory.labs.status.boost.lab4.amount = 0;

                                }
                                creep.memory.target = outputLab.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(storage, 1);
                            }
                            return;
                        }
                    }
                }


                else if(number == 5 && creep.room.memory.labs.outputLab5 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab5 && creep.room.memory.labs.status.boost.lab5.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab5.amount == 0) {
                        // do nothing
                    }
                    else {
                        if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != RESOURCE_CATALYZED_KEANIUM_ALKALIDE)) {
                            if(creep.pos.isNearTo(outputLab)) {
                                creep.withdraw(outputLab, outputLab.mineralType);
                                creep.memory.target = storage.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(outputLab, 1);
                            }
                            return;
                        }
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_KEANIUM_ALKALIDE) && storage && storage.store[RESOURCE_CATALYZED_KEANIUM_ALKALIDE] >= creep.room.memory.labs.status.boost.lab5.amount) {
                            if(creep.pos.isNearTo(storage)) {
                                if(creep.room.memory.labs.status.boost.lab5.amount >= MaxStorage) {
                                    creep.room.memory.labs.status.boost.lab5.amount -= MaxStorage;

                                    creep.withdraw(storage, RESOURCE_CATALYZED_KEANIUM_ALKALIDE);
                                }
                                else {
                                    creep.withdraw(storage, RESOURCE_CATALYZED_KEANIUM_ALKALIDE, creep.room.memory.labs.status.boost.lab5.amount);
                                    creep.room.memory.labs.status.boost.lab5.amount = 0;

                                }
                                creep.memory.target = outputLab.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(storage, 1);
                            }
                            return;
                        }
                    }
                }

                else if(number == 6 && creep.room.memory.labs.outputLab6 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab6 && creep.room.memory.labs.status.boost.lab6.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab6.amount == 0) {
                        // do nothing
                    }
                    else {
                        if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE)) {
                            if(creep.pos.isNearTo(outputLab)) {
                                creep.withdraw(outputLab, outputLab.mineralType);
                                creep.memory.target = storage.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(outputLab, 1);
                            }
                            return;
                        }
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) && storage && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] >= creep.room.memory.labs.status.boost.lab6.amount) {
                            if(creep.pos.isNearTo(storage)) {
                                if(creep.room.memory.labs.status.boost.lab6.amount >= MaxStorage) {
                                    creep.room.memory.labs.status.boost.lab6.amount -= MaxStorage;

                                    creep.withdraw(storage, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE);
                                }
                                else {
                                    creep.withdraw(storage, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, creep.room.memory.labs.status.boost.lab6.amount);
                                    creep.room.memory.labs.status.boost.lab6.amount = 0;

                                }
                                creep.memory.target = outputLab.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(storage, 1);
                            }
                            return;
                        }
                    }
                }

                else if(number == 7 && creep.room.memory.labs.outputLab7 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab7 && creep.room.memory.labs.status.boost.lab7.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab7.amount == 0) {
                        // do nothing
                    }
                    else {
                        if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != RESOURCE_CATALYZED_GHODIUM_ALKALIDE)) {
                            if(creep.pos.isNearTo(outputLab)) {
                                creep.withdraw(outputLab, outputLab.mineralType);
                                creep.memory.target = storage.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(outputLab, 1);
                            }
                            return;
                        }
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_GHODIUM_ALKALIDE) && storage && storage.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] >= creep.room.memory.labs.status.boost.lab7.amount) {
                            if(creep.pos.isNearTo(storage)) {
                                if(creep.room.memory.labs.status.boost.lab7.amount >= MaxStorage) {
                                    creep.room.memory.labs.status.boost.lab7.amount -= MaxStorage;

                                    creep.withdraw(storage, RESOURCE_CATALYZED_GHODIUM_ALKALIDE);
                                }
                                else {
                                    creep.withdraw(storage, RESOURCE_CATALYZED_GHODIUM_ALKALIDE, creep.room.memory.labs.status.boost.lab7.amount);
                                    creep.room.memory.labs.status.boost.lab7.amount = 0;

                                }
                                creep.memory.target = outputLab.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(storage, 1);
                            }
                            return;
                        }
                    }
                }

                else if(number == 8 && creep.room.memory.labs.outputLab8 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab8 && creep.room.memory.labs.status.boost.lab8.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab8.amount == 0) {
                        // do nothing
                    }
                    else {
                        if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != RESOURCE_CATALYZED_ZYNTHIUM_ACID)) {
                            if(creep.pos.isNearTo(outputLab)) {
                                creep.withdraw(outputLab, outputLab.mineralType);
                                creep.memory.target = storage.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(outputLab, 1);
                            }
                            return;
                        }
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_ZYNTHIUM_ACID) && storage && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ACID] >= creep.room.memory.labs.status.boost.lab8.amount) {
                            if(creep.pos.isNearTo(storage)) {
                                if(creep.room.memory.labs.status.boost.lab8.amount >= MaxStorage) {
                                    creep.room.memory.labs.status.boost.lab8.amount -= MaxStorage;

                                    creep.withdraw(storage, RESOURCE_CATALYZED_ZYNTHIUM_ACID);
                                }
                                else {
                                    creep.withdraw(storage, RESOURCE_CATALYZED_ZYNTHIUM_ACID, creep.room.memory.labs.status.boost.lab8.amount);
                                    creep.room.memory.labs.status.boost.lab8.amount = 0;

                                }
                                creep.memory.target = outputLab.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(storage, 1);
                            }
                            return;
                        }
                    }
                }



                else if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != currentOutput || outputLab.mineralType == currentOutput && outputLab.store[outputLab.mineralType] > MaxStorage)) {
                    if(creep.pos.isNearTo(outputLab)) {
                        creep.withdraw(outputLab, outputLab.mineralType);
                        creep.memory.target = storage.id;
                    }
                    else {
                        creep.MoveCostMatrixRoadPrio(outputLab, 1);
                    }
                    return;
                }

            }

            if((inputLab1 && inputLab1.mineralType == undefined || inputLab1 && inputLab1.mineralType == lab1Input && inputLab1.store[inputLab1.mineralType] < MaxStorage-20) &&
            storage && storage.store[lab1Input] >= MaxStorage) {
                if(creep.pos.isNearTo(storage)) {
                    creep.withdraw(storage, lab1Input);
                    creep.memory.target = inputLab1.id;
                }
                else {
                    creep.MoveCostMatrixRoadPrio(storage, 1);
                }
                return;
            }

            if((inputLab1 && inputLab1.mineralType == undefined || inputLab1 && inputLab1.mineralType == lab1Input && inputLab1.store[inputLab1.mineralType] < MaxStorage-20) &&
            terminal && terminal.store[lab1Input] >= MaxStorage) {
                if(creep.pos.isNearTo(terminal)) {
                    creep.withdraw(terminal, lab1Input);
                    creep.memory.target = inputLab1.id;
                }
                else {
                    creep.MoveCostMatrixRoadPrio(terminal, 1);
                }
                return;
            }

            if((inputLab2 && inputLab2.mineralType == undefined || inputLab2 && inputLab2.mineralType == lab2Input && inputLab2.store[inputLab2.mineralType] < MaxStorage-20) &&
            storage && storage.store[lab2Input] >= MaxStorage) {
                if(creep.pos.isNearTo(storage)) {
                    creep.withdraw(storage, lab2Input);
                    creep.memory.target = inputLab2.id;
                }
                else {
                    creep.MoveCostMatrixRoadPrio(storage, 1);
                }
                return;
            }

            if((inputLab2 && inputLab2.mineralType == undefined || inputLab2 && inputLab2.mineralType == lab2Input && inputLab2.store[inputLab2.mineralType] < MaxStorage-20) &&
            terminal && terminal.store[lab2Input] >= MaxStorage) {
                if(creep.pos.isNearTo(terminal)) {
                    creep.withdraw(terminal, lab2Input);
                    creep.memory.target = inputLab2.id;
                }
                else {
                    creep.MoveCostMatrixRoadPrio(terminal, 1);
                }
                return;
            }
        }
        if(closestLink && closestLink.store[RESOURCE_ENERGY] > 0 && creep.store.getFreeCapacity() == MaxStorage) {
            if(creep.pos.isNearTo(closestLink)) {
                creep.withdraw(closestLink, RESOURCE_ENERGY);
                creep.memory.target = storage.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(closestLink, 1);
            }
            return;
        }

        if(bin && bin.store.getFreeCapacity() < 2000 && creep.store.getFreeCapacity() == MaxStorage) {
            if(creep.pos.isNearTo(bin)) {
                for(let resourceType in bin.store) {
                    creep.withdraw(bin, resourceType);
                }
                creep.memory.target = storage.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(bin, 1);
            }
            return;
        }
		// if(!creep.memory.controllerLink && creep.room.controller && creep.room.controller.level >= 7) {
		// 	let links = creep.room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_LINK});
		// 	if(links.length > 3) {
		// 		let controllerLink = creep.room.controller.pos.findClosestByRange(links);
		// 		creep.memory.controllerLink = controllerLink.id;
		// 	}
		// }
        // if(creep.room.controller && creep.room.controller.level >= 7 && creep.memory.controllerLink) {
        //     let controllerLink:any = Game.getObjectById(creep.memory.controllerLink);
        //     if(controllerLink && controllerLink.store[RESOURCE_ENERGY] == 0) {
        //         if(creep.pos.isNearTo(storage)) {
        //             creep.withdraw(storage, RESOURCE_ENERGY);
        //             creep.memory.target = controllerLink.id;
        //         }
        //         else {
        //             creep.MoveCostMatrixRoadPrio(storage, 1);
        //         }
        //         return;
        //     }
        // }




        if(terminal && terminal.store[RESOURCE_ENERGY] > 105000 && creep.store.getFreeCapacity() == MaxStorage || storage && storage.store[RESOURCE_ENERGY] < 10000 && terminal && terminal.store[RESOURCE_ENERGY] > 1000) {
            if(creep.pos.isNearTo(terminal)) {
                creep.withdraw(terminal, RESOURCE_ENERGY);
                creep.memory.target = storage.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(terminal, 1);
            }
            return;
        }


        if(terminal && terminal.store[RESOURCE_ENERGY] < 100000 && storage && storage.store[RESOURCE_ENERGY] > 75000) {
            if(creep.pos.isNearTo(storage)) {
                creep.withdraw(storage, RESOURCE_ENERGY);
                creep.memory.target = terminal.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
            return;
        }

        let Mineral:any = Game.getObjectById(creep.room.memory.mineral) || creep.room.findMineral();
        let MineralType = Mineral.mineralType;
        if(storage && storage.store[MineralType] > 20000 && terminal && terminal.store.getFreeCapacity() > 10000) {
            if(creep.pos.isNearTo(storage)) {
                creep.withdraw(storage, MineralType);
                creep.memory.target = terminal.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
            return;
        }

        if(creep.ticksToLive % 50 == 0) {
            let listOfResourcesToStorage:any = [RESOURCE_KEANIUM_OXIDE,RESOURCE_ZYNTHIUM_ALKALIDE,RESOURCE_ZYNTHIUM_HYDRIDE,RESOURCE_KEANIUM_ACID,RESOURCE_POWER];
                if(storage && terminal && storage.store.getFreeCapacity() > MaxStorage * 10) {
                    for(let resource in terminal.store) {
                        if(listOfResourcesToStorage.includes(resource)) {
                            if(creep.pos.isNearTo(terminal)) {
                                creep.withdraw(terminal, resource);
                                creep.memory.target = storage.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(terminal, 1);
                            }
                            return;
                        }
                    }
                }
            }

        if(creep.ticksToLive % 50 == 10 || creep.ticksToLive % 50 == 11 || creep.ticksToLive % 50 == 11 || creep.ticksToLive % 50 == 12 || creep.ticksToLive % 50 == 13 || creep.ticksToLive % 50 == 14 || creep.ticksToLive % 50 == 15 || creep.ticksToLive % 50 == 16 || creep.ticksToLive % 50 == 17 || creep.ticksToLive % 50 == 18 || creep.ticksToLive % 50 == 19) {
            let listOfResourcesToTerminal:any = [
                RESOURCE_ALLOY, RESOURCE_TUBE, RESOURCE_FIXTURES, RESOURCE_FRAME, RESOURCE_HYDRAULICS, RESOURCE_MACHINE,
                RESOURCE_CELL, RESOURCE_PHLEGM, RESOURCE_TISSUE, RESOURCE_MUSCLE, RESOURCE_ORGANOID, RESOURCE_ORGANISM,
                RESOURCE_WIRE, RESOURCE_SWITCH, RESOURCE_TRANSISTOR, RESOURCE_MICROCHIP, RESOURCE_CIRCUIT, RESOURCE_DEVICE,
                RESOURCE_CONDENSATE, RESOURCE_CONCENTRATE, RESOURCE_EXTRACT, RESOURCE_SPIRIT, RESOURCE_EMANATION, RESOURCE_ESSENCE,
                RESOURCE_GHODIUM_MELT, RESOURCE_COMPOSITE, RESOURCE_CRYSTAL, RESOURCE_LIQUID,
                RESOURCE_OXIDANT, RESOURCE_REDUCTANT, RESOURCE_ZYNTHIUM_BAR, RESOURCE_LEMERGIUM_BAR, RESOURCE_UTRIUM_BAR, RESOURCE_KEANIUM_BAR, RESOURCE_PURIFIER,
                RESOURCE_METAL, RESOURCE_BIOMASS, RESOURCE_SILICON, RESOURCE_MIST];
                if(storage && terminal && terminal.store.getFreeCapacity() > MaxStorage * 10) {
                    for(let resource in storage.store) {
                        if(listOfResourcesToTerminal.includes(resource)) {
                            if(creep.pos.isNearTo(storage)) {
                                creep.withdraw(storage, resource);
                                creep.memory.target = terminal.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(storage, 1);
                            }
                            return;
                        }
                    }
                }
            }

            if(creep.ticksToLive % 50 == 20 || creep.ticksToLive % 50 == 21 || creep.ticksToLive % 50 == 22 || creep.ticksToLive % 50 == 23 || creep.ticksToLive % 50 == 24 || creep.ticksToLive % 50 == 25 || creep.ticksToLive % 50 == 26 || creep.ticksToLive % 50 == 27 || creep.ticksToLive % 50 == 28 || creep.ticksToLive % 50 == 29) {
                if(storage && factory && factory.store[RESOURCE_ENERGY] < 10000 && storage.store[RESOURCE_ENERGY] > 360000) {
                    if(creep.pos.isNearTo(storage)) {
                        creep.withdraw(storage, RESOURCE_ENERGY);
                        creep.memory.target = factory.id;
                    }
                    else {
                        creep.MoveCostMatrixRoadPrio(storage, 1);
                    }
                    return;
                }
            }


            // if(creep.ticksToLive % 50 == 30) {
            //     let listOfResourcesToFactoryFromTerminal:any = [RESOURCE_MIST, RESOURCE_BIOMASS, RESOURCE_METAL, RESOURCE_SILICON];
            //     if(terminal && factory && factory.store.getFreeCapacity() > MaxStorage * 2 && (terminal.store[RESOURCE_MIST] >= MaxStorage || terminal.store[RESOURCE_BIOMASS] >= MaxStorage || terminal.store[RESOURCE_METAL] >= MaxStorage || terminal.store[RESOURCE_SILICON] >= MaxStorage)) {
            //         for(let resource in terminal.store) {
            //             if(listOfResourcesToFactoryFromTerminal.includes(resource)) {
            //                 if(creep.pos.isNearTo(terminal)) {
            //                     creep.withdraw(terminal, resource);
            //                     creep.memory.target = factory.id;
            //                 }
            //                 else {
            //                     creep.MoveCostMatrixRoadPrio(terminal, 1);
            //                 }
            //                 return;
            //             }
            //         }
            //     }
            // }

            if(creep.ticksToLive % 50 == 40 || creep.ticksToLive % 50 == 41 || creep.ticksToLive % 50 == 42 || creep.ticksToLive % 50 == 43 || creep.ticksToLive % 50 == 44 || creep.ticksToLive % 50 == 45 || creep.ticksToLive % 50 == 46 || creep.ticksToLive % 50 == 47 || creep.ticksToLive % 50 == 48 || creep.ticksToLive % 50 == 49) {
                let listOfResourcesToTerminalFromFactory:any = [RESOURCE_KEANIUM, RESOURCE_MIST, RESOURCE_CONDENSATE, RESOURCE_KEANIUM_BAR];
                if(terminal && factory && terminal.store.getUsedCapacity() < 295000) {
                    for(let resource in factory.store) {
                        if(listOfResourcesToTerminalFromFactory.includes(resource)) {
                            if(creep.pos.isNearTo(factory)) {
                                creep.withdraw(factory, resource);
                                creep.memory.target = terminal.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(factory, 1);
                            }
                            return;
                        }
                    }
                }
            }


        let nuker = Game.getObjectById(creep.room.memory.Structures.nuker) || creep.room.findNuker();
        if(storage && nuker && storage.store[RESOURCE_GHODIUM] >= 3000 && nuker.store[RESOURCE_GHODIUM] < 5000) {
            if(creep.pos.isNearTo(storage)) {
                creep.withdraw(storage, RESOURCE_GHODIUM);
                creep.memory.target = nuker.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
            return;
        }


        if(storage && nuker && storage.store[RESOURCE_ENERGY] >= 300000 && nuker.store[RESOURCE_ENERGY] < 300000) {
            if(creep.pos.isNearTo(storage)) {
                creep.withdraw(storage, RESOURCE_ENERGY);
                creep.memory.target = nuker.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
            return;
        }


        let powerSpawn:any = Game.getObjectById(creep.room.memory.Structures.powerSpawn);
        if(storage && powerSpawn && storage.store[RESOURCE_POWER] >= 1 && powerSpawn.store[RESOURCE_POWER] == 0) {
            if(creep.pos.isNearTo(storage)) {
                if(storage.store[RESOURCE_POWER] >= 100) {
                    creep.withdraw(storage, RESOURCE_POWER, 100);
                }
                else {
                    creep.withdraw(storage, RESOURCE_POWER);
                }
                creep.memory.target = powerSpawn.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
            return;
        }

        if(storage && terminal && storage.store[RESOURCE_OPS] > 10000 && terminal.store.getUsedCapacity() < 290000) {
            if(creep.pos.isNearTo(storage)) {
                creep.withdraw(storage, RESOURCE_OPS);
                creep.memory.target = terminal.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
            return;
        }

        // if(!creep.memory.target) {
        //     creep.MoveCostMatrixRoadPrio(storage, 5);
        // }

    }








}


const roleEnergyManager = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleEnergyManager;
