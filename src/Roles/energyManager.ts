/**
 * A little description of this function
 * @param {Creep} creep
 **/

// Decrement the boost ledger only after a successful withdraw, and only as
// much as the lab can hold. Decrement-before-withdraw left amount at 0 while
// the compound bounced storage <-> creep and the lab stayed under-filled.
const REACTION_STOCK_MIN = 1000;

function storeAmt(s, res) {
    return (s && s.store && s.store[res]) || 0;
}

/** Feed an input lab from whichever store actually holds the reagent. */
function refillInputLab(creep, lab, resource, storage, terminal, MaxStorage) {
    if(!lab || !resource) return false;
    const needs = lab.mineralType == undefined ||
        (lab.mineralType == resource && lab.store[resource] < MaxStorage - 20);
    if(!needs) return false;
    const combined = storeAmt(storage, resource) + storeAmt(terminal, resource);
    // labs.ts starts the reaction at combined >= 1000. Demanding MaxStorage
    // (800 at RCL8) in ONE store leaves a 500+500 pile unfed forever.
    if(combined < REACTION_STOCK_MIN && lab.mineralType != resource) return false;
    const from = storeAmt(storage, resource) > 0 ? storage
        : (storeAmt(terminal, resource) > 0 ? terminal : null);
    if(!from) return false;
    if(creep.pos.isNearTo(from)) {
        const want = Math.min(MaxStorage, creep.store.getFreeCapacity(), storeAmt(from, resource));
        if(want > 0) {
            creep.withdraw(from, resource, want);
            creep.memory.target = lab.id;
        }
        return true;
    }
    creep.MoveCostMatrixRoadPrio(from, 1);
    return true;
}

/**
 * Fill a boost lab from whichever store actually holds the compound.
 *
 * This used to be storage-only. Market purchases land in the TERMINAL, so a
 * boost we had just bought was invisible to the hauler and the lab stayed
 * empty until some unrelated terminal->storage rung happened to move it.
 * Mirrors storeOf() in rooms.labs.ts: storage first, terminal second.
 */
function takeBoostFromStore(creep, storage, terminal, outputLab, boost, resource) {
    if(!outputLab || !boost) return false;
    let labFree = outputLab.store.getFreeCapacity(resource);
    if(!(labFree > 0)) return false;
    const from = storeAmt(storage, resource) > 0 ? storage
        : (storeAmt(terminal, resource) > 0 ? terminal : null);
    if(!from) return false;
    if(creep.pos.isNearTo(from)) {
        let want = Math.min(boost.amount, creep.store.getFreeCapacity(), labFree, storeAmt(from, resource));
        if(want > 0) {
            if(creep.withdraw(from, resource, want) == 0) {
                boost.amount -= want;
                if(boost.amount < 0) boost.amount = 0;
                creep.memory.target = outputLab.id;
            }
        }
        else if(creep.store[resource] > 0) {
            creep.memory.target = outputLab.id;
        }
        return true;
    }
    creep.MoveCostMatrixRoadPrio(from, 1);
    return true;
}

 const run = function (creep) {
    creep.memory.moving = false;
    if(creep.evacuate()) {
		return;
	}
    if(creep.ticksToLive == creep.body.length  * 3 && creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == "EnergyManager")}}).length == 1) {
        let newName = 'EnergyManager-'+ Math.floor(Math.random() * Game.time) + "-" + creep.room.name;
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
            else if(creep.room.controller.level == 8 && !creep.room.memory.danger && Game.cpu.bucket < 9000 && creep.room.terminal && creep.room.terminal.store[RESOURCE_BATTERY] > 1000) {
                creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'EnergyManager'}});
            }
            else if(creep.room.controller.level == 8 && !creep.room.memory.danger && Game.cpu.bucket >= 5000) {
                creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'EnergyManager'}});
            }
            else if(creep.room.controller.level == 8 && (creep.room.memory.danger || Game.cpu.bucket < 5000)) {
                creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'EnergyManager'}});
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
        if(!target) {
            creep.memory.target = false;
        }
        else if(creep.pos.isNearTo(target)) {
            // One resource per tick. Clearing on any non-OK (ERR_FULL, or
            // ERR_BUSY from a second type) dropped leftover cargo into the
            // next withdraw — leftover G sat until death; leftover energy
            // walked into input labs.
            const resource = Object.keys(creep.store)[0];
            if(resource) {
                const r = creep.transfer(target, resource);
                if(r == ERR_FULL || r == ERR_INVALID_TARGET || r == ERR_NOT_OWNER || r == ERR_INVALID_ARGS) {
                    creep.memory.target = false;
                }
            }
            if(creep.store.getUsedCapacity() == 0) {
                creep.memory.target = false;
            }
        }
        else {
            creep.MoveCostMatrixRoadPrio(target, 1)
        }
    }
    if(!creep.memory.target) {
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        let terminal = creep.room.terminal;
        let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLinkToStorage();
        let bin = Game.getObjectById(creep.room.memory.Structures.bin) || creep.room.findBin(storage);

        // Partial cargo dumps to storage before any new withdraw. Full-only
        // used to skip this and pick a lab/factory/nuker with leftover G.
        if(creep.store.getUsedCapacity() > 0) {
            if(storage) {
                creep.memory.target = storage.id;
                if(creep.pos.isNearTo(storage)) {
                    const resource = Object.keys(creep.store)[0];
                    if(resource) creep.transfer(storage, resource);
                }
                else {
                    creep.MoveCostMatrixRoadPrio(storage, 1);
                }
            }
            return;
        }



        if(creep.room.memory.labs) {
            let inputLab1; let inputLab2;
            let outputLab1; let outputLab2; let outputLab3; let outputLab4;
            let outputLab5; let outputLab6; let outputLab7; let outputLab8;

            // {n, lab} so boost.labN always fills outputLabN. A dense push
            // plus number++ poured lab2's mineral into lab3 when outputLab2
            // was missing (legacy strip deletes holes independently).
            let outputLabs = [];

            if(creep.room.memory.labs.inputLab1) {inputLab1 = Game.getObjectById(creep.room.memory.labs.inputLab1)}
            if(creep.room.memory.labs.inputLab2) {inputLab2 = Game.getObjectById(creep.room.memory.labs.inputLab2)}
            if(creep.room.memory.labs.outputLab1) {
                outputLab1 = Game.getObjectById(creep.room.memory.labs.outputLab1)
                outputLabs.push({n: 1, lab: outputLab1})
            }
            if(creep.room.memory.labs.outputLab2) {
                outputLab2 = Game.getObjectById(creep.room.memory.labs.outputLab2)
                outputLabs.push({n: 2, lab: outputLab2})
            }
            if(creep.room.memory.labs.outputLab3) {
                outputLab3 = Game.getObjectById(creep.room.memory.labs.outputLab3)
                outputLabs.push({n: 3, lab: outputLab3})
            }
            if(creep.room.memory.labs.outputLab4) {
                outputLab4 = Game.getObjectById(creep.room.memory.labs.outputLab4)
                outputLabs.push({n: 4, lab: outputLab4})
            }
            if(creep.room.memory.labs.outputLab5) {
                outputLab5 = Game.getObjectById(creep.room.memory.labs.outputLab5)
                outputLabs.push({n: 5, lab: outputLab5})
            }
            if(creep.room.memory.labs.outputLab6) {
                outputLab6 = Game.getObjectById(creep.room.memory.labs.outputLab6)
                outputLabs.push({n: 6, lab: outputLab6})
            }
            if(creep.room.memory.labs.outputLab7) {
                outputLab7 = Game.getObjectById(creep.room.memory.labs.outputLab7)
                outputLabs.push({n: 7, lab: outputLab7})
            }
            if(creep.room.memory.labs.outputLab8) {
                outputLab8 = Game.getObjectById(creep.room.memory.labs.outputLab8)
                outputLabs.push({n: 8, lab: outputLab8})
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
            for(let entry of outputLabs) {
                let number = entry.n;
                let outputLab = entry.lab;

                if(number == 1 && creep.room.memory.labs.outputLab1 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab1 && creep.room.memory.labs.status.boost.lab1.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab1.amount == 0) {
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
                        // takeBoostFromStore already min(amount, carry, labFree);
                        // requiring storage >= amount skipped every partial fill.
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_LEMERGIUM_ACID) && (storeAmt(storage, RESOURCE_CATALYZED_LEMERGIUM_ACID) + storeAmt(terminal, RESOURCE_CATALYZED_LEMERGIUM_ACID)) > 0) {
                            if(takeBoostFromStore(creep, storage, terminal, outputLab, creep.room.memory.labs.status.boost.lab1, RESOURCE_CATALYZED_LEMERGIUM_ACID)) {
                                return;
                            }
                        }

                    }
                }


                else if(number == 2 && creep.room.memory.labs.outputLab2 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab2 && creep.room.memory.labs.status.boost.lab2.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab2.amount == 0) {
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
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) && (storeAmt(storage, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) + storeAmt(terminal, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE)) > 0) {
                            if(takeBoostFromStore(creep, storage, terminal, outputLab, creep.room.memory.labs.status.boost.lab2, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE)) {
                                return;
                            }
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
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_UTRIUM_ACID) && (storeAmt(storage, RESOURCE_CATALYZED_UTRIUM_ACID) + storeAmt(terminal, RESOURCE_CATALYZED_UTRIUM_ACID)) > 0) {
                            if(takeBoostFromStore(creep, storage, terminal, outputLab, creep.room.memory.labs.status.boost.lab3, RESOURCE_CATALYZED_UTRIUM_ACID)) {
                                return;
                            }
                        }
                    }
                }


                else if(number == 4 && creep.room.memory.labs.outputLab4 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab4 && creep.room.memory.labs.status.boost.lab4.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab4.amount == 0) {
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
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_KEANIUM_ALKALIDE) && (storeAmt(storage, RESOURCE_CATALYZED_KEANIUM_ALKALIDE) + storeAmt(terminal, RESOURCE_CATALYZED_KEANIUM_ALKALIDE)) > 0) {
                            if(takeBoostFromStore(creep, storage, terminal, outputLab, creep.room.memory.labs.status.boost.lab4, RESOURCE_CATALYZED_KEANIUM_ALKALIDE)) {
                                return;
                            }
                        }
                    }
                }


                else if(number == 5 && creep.room.memory.labs.outputLab5 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab5 && creep.room.memory.labs.status.boost.lab5.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab5.amount == 0) {
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
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) && (storeAmt(storage, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) + storeAmt(terminal, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE)) > 0) {
                            if(takeBoostFromStore(creep, storage, terminal, outputLab, creep.room.memory.labs.status.boost.lab5, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE)) {
                                return;
                            }
                        }
                    }
                }

                else if(number == 6 && creep.room.memory.labs.outputLab6 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab6 && creep.room.memory.labs.status.boost.lab6.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab6.amount == 0) {
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
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_ZYNTHIUM_ACID) && (storeAmt(storage, RESOURCE_CATALYZED_ZYNTHIUM_ACID) + storeAmt(terminal, RESOURCE_CATALYZED_ZYNTHIUM_ACID)) > 0) {
                            if(takeBoostFromStore(creep, storage, terminal, outputLab, creep.room.memory.labs.status.boost.lab6, RESOURCE_CATALYZED_ZYNTHIUM_ACID)) {
                                return;
                            }
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
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_GHODIUM_ALKALIDE) && (storeAmt(storage, RESOURCE_CATALYZED_GHODIUM_ALKALIDE) + storeAmt(terminal, RESOURCE_CATALYZED_GHODIUM_ALKALIDE)) > 0) {
                            if(takeBoostFromStore(creep, storage, terminal, outputLab, creep.room.memory.labs.status.boost.lab7, RESOURCE_CATALYZED_GHODIUM_ALKALIDE)) {
                                return;
                            }
                        }
                    }
                }

                else if(number == 8 && creep.room.memory.labs.outputLab8 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab8 && creep.room.memory.labs.status.boost.lab8.use > 0) {
                    let resource:ResourceConstant = RESOURCE_CATALYZED_KEANIUM_ACID;
                    if(creep.room.memory.labs.lab8reserved) {
                        resource = RESOURCE_UTRIUM_OXIDE;
                    }
                    if(creep.room.memory.labs.status.boost.lab8.amount == 0) {
                        // do nothing
                    }
                    else {
                        if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != resource)) {
                            if(creep.pos.isNearTo(outputLab)) {
                                creep.withdraw(outputLab, outputLab.mineralType);
                                creep.memory.target = storage.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(outputLab, 1);
                            }
                            return;
                        }
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == resource) && (storeAmt(storage, resource) + storeAmt(terminal, resource)) > 0) {
                            if(takeBoostFromStore(creep, storage, terminal, outputLab, creep.room.memory.labs.status.boost.lab8, resource)) {
                                return;
                            }
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

            if(refillInputLab(creep, inputLab1, lab1Input, storage, terminal, MaxStorage)) {
                return;
            }
            if(refillInputLab(creep, inputLab2, lab2Input, storage, terminal, MaxStorage)) {
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

        // Terminal energy float, scaled by the bank. Every market path is
        // priced in terminal energy (transaction fees are paid from it), and
        // the old rule only filled the terminal once storage passed 100k - so
        // a 42k-storage room sat on a 200-energy terminal and no buy, sell,
        // send or gift could fire at all.
        //
        // The ladder reads the COMBINED storage+terminal energy on purpose:
        // moving energy between the two must not change the target, or the
        // fill and drain rungs below chase each other.
        const energyBank = storeAmt(storage, RESOURCE_ENERGY) + storeAmt(terminal, RESOURCE_ENERGY);
        let terminalEnergyTarget = 0;
        if(energyBank >= 200000) terminalEnergyTarget = 40000;      // unchanged high-bank behaviour
        else if(energyBank >= 100000) terminalEnergyTarget = 20000;
        else if(energyBank >= 20000) terminalEnergyTarget = 5000;

        // Drain back to storage. 5000 of hysteresis above the target keeps this
        // from fighting the fill rung.
        if(terminal && terminal.store[RESOURCE_ENERGY] > terminalEnergyTarget + 5000 && creep.store.getFreeCapacity() == MaxStorage || storage && storage.store[RESOURCE_ENERGY] < 20000 && terminal && terminal.store[RESOURCE_ENERGY] > MaxStorage) {
            if(creep.pos.isNearTo(terminal)) {
                creep.withdraw(terminal, RESOURCE_ENERGY);
                creep.memory.target = storage.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(terminal, 1);
            }
            return;
        }



        if(terminal && terminalEnergyTarget > 0 && terminal.store[RESOURCE_ENERGY] < terminalEnergyTarget && storage && storage.store[RESOURCE_ENERGY] > MaxStorage && terminal.store.getFreeCapacity() > 5000) {
            if(creep.pos.isNearTo(storage)) {
                creep.withdraw(storage, RESOURCE_ENERGY);
                creep.memory.target = terminal.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
            return;
        }


        // Room mineral -> terminal. 20000 meant a room mining 70k of H still
        // had nothing in the terminal to sell with; 3000 gets the sell paths
        // stocked, and the 30k stop is the spike-sell reserve (Market/budget
        // sellCaps) - past that the mineral is better off in storage.
        let Mineral:any = Game.getObjectById(creep.room.memory.mineral) || creep.room.findMineral();
        let MineralType = Mineral.mineralType;
        if(storage && storage.store[MineralType] > 3000 && terminal && terminal.store[MineralType] < 30000 && terminal.store.getFreeCapacity() > 10000) {
            if(creep.pos.isNearTo(storage)) {
                creep.withdraw(storage, MineralType);
                creep.memory.target = terminal.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
            return;
        }


        // REGRESSION REPAIR: the old `% 50 <= 50` was always true, so the LIVE
        // behavior was every tick - and this block is not just compound moves,
        // it also contains the factory / nuker / power-spawn / ops delivery
        // state machine further down. Throttling to 1-in-50 left the manager
        // frozen mid-errand for 49 ticks and stalled factory and power
        // processing. The gate was decorative; keep the always-run behavior.
        {


        let listOfResourcesToTerminal1:any = [
            RESOURCE_ALLOY, RESOURCE_TUBE, RESOURCE_FIXTURES, RESOURCE_FRAME, RESOURCE_HYDRAULICS, RESOURCE_MACHINE,
            RESOURCE_CELL, RESOURCE_PHLEGM, RESOURCE_TISSUE, RESOURCE_MUSCLE, RESOURCE_ORGANOID, RESOURCE_ORGANISM,
            RESOURCE_WIRE, RESOURCE_SWITCH, RESOURCE_TRANSISTOR, RESOURCE_MICROCHIP, RESOURCE_CIRCUIT, RESOURCE_DEVICE,
            RESOURCE_CONDENSATE, RESOURCE_CONCENTRATE, RESOURCE_EXTRACT, RESOURCE_SPIRIT, RESOURCE_EMANATION, RESOURCE_ESSENCE,
            RESOURCE_GHODIUM_MELT, RESOURCE_COMPOSITE, RESOURCE_CRYSTAL, RESOURCE_LIQUID,
            RESOURCE_OXIDANT, RESOURCE_REDUCTANT, RESOURCE_ZYNTHIUM_BAR, RESOURCE_LEMERGIUM_BAR, RESOURCE_UTRIUM_BAR, RESOURCE_KEANIUM_BAR, RESOURCE_PURIFIER,
            RESOURCE_METAL, RESOURCE_BIOMASS, RESOURCE_SILICON, RESOURCE_MIST,
            RESOURCE_GHODIUM_HYDRIDE, RESOURCE_GHODIUM_ACID, RESOURCE_CATALYZED_GHODIUM_ACID, RESOURCE_KEANIUM_ACID];
            if(storage && terminal && terminal.store.getFreeCapacity() > MaxStorage * 5) {
                for(let resource in storage.store) {
                    if(listOfResourcesToTerminal1.includes(resource)) {
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


            let listOfResourcesToTerminal2:any = [
                RESOURCE_CATALYZED_LEMERGIUM_ACID,
                RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
                RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
                RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
                RESOURCE_CATALYZED_UTRIUM_ACID,
                RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
                RESOURCE_CATALYZED_ZYNTHIUM_ACID,
                RESOURCE_CATALYZED_KEANIUM_ACID
            ];

            if(storage && terminal && terminal.store.getFreeCapacity() > MaxStorage * 5) {
                for(let resource in storage.store) {
                    if(listOfResourcesToTerminal2.includes(resource) && storage.store[resource] > 20000 && terminal.store[resource] < 3000) {
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


            let listOfResourcesToStorage2:any = [
                RESOURCE_CATALYZED_LEMERGIUM_ACID,
                RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
                RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
                RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
                RESOURCE_CATALYZED_UTRIUM_ACID,
                RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
                RESOURCE_CATALYZED_ZYNTHIUM_ACID,
                RESOURCE_CATALYZED_KEANIUM_ACID
            ];

            if(storage && terminal && storage.store.getFreeCapacity() > MaxStorage * 5) {
                for(let resource in terminal.store) {
                    if(listOfResourcesToStorage2.includes(resource) && (storage.store[resource] < 18000 && terminal.store[resource] > 0 || terminal.store[resource] > 4000)) {
                        if(creep.pos.isNearTo(terminal)) {
                            if(storage.store[resource] > 25000 && terminal.store[resource] > 3000) {
                                let amount = terminal.store[resource] - 3000;
                                if(amount > creep.store.getFreeCapacity()) {
                                    amount = creep.store.getFreeCapacity();
                                }
                                creep.withdraw(terminal,resource, amount);
                            }
                            else {
                                creep.withdraw(terminal, resource);
                            }
                            creep.memory.target = storage.id;
                        }
                        else {
                            creep.MoveCostMatrixRoadPrio(terminal, 1);
                        }
                        return;
                    }
                }
            }


            let listOfResourcesToStorage1:any = [RESOURCE_KEANIUM_OXIDE,RESOURCE_ZYNTHIUM_ALKALIDE,RESOURCE_ZYNTHIUM_HYDRIDE,RESOURCE_POWER,RESOURCE_BATTERY];
            if(storage && terminal && storage.store.getFreeCapacity() > MaxStorage * 5) {
                for(let resource in terminal.store) {
                    if(listOfResourcesToStorage1.includes(resource) && (storage.store.getFreeCapacity() <= 100000 && storage.store[resource] <= 15000 || storage.store.getFreeCapacity() > 175000 && storage.store[resource] <= 50000)) {
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


            // if(creep.ticksToLive % 50 == 40 || creep.ticksToLive % 50 == 41 || creep.ticksToLive % 50 == 42 || creep.ticksToLive % 50 == 43 || creep.ticksToLive % 50 == 44 || creep.ticksToLive % 50 == 45 || creep.ticksToLive % 50 == 46 || creep.ticksToLive % 50 == 47 || creep.ticksToLive % 50 == 48 || creep.ticksToLive % 50 == 49) {
            //     let listOfResourcesToTerminalFromFactory:any = [RESOURCE_KEANIUM, RESOURCE_MIST, RESOURCE_CONDENSATE, RESOURCE_KEANIUM_BAR];
            //     if(terminal && factory && terminal.store.getUsedCapacity() < 295000) {
            //         for(let resource in factory.store) {
            //             if(listOfResourcesToTerminalFromFactory.includes(resource)) {
            //                 if(creep.pos.isNearTo(factory)) {
            //                     creep.withdraw(factory, resource);
            //                     creep.memory.target = terminal.id;
            //                 }
            //                 else {
            //                     creep.MoveCostMatrixRoadPrio(factory, 1);
            //                 }
            //                 return;
            //             }
            //         }
            //     }
            // }


        let nuker = Game.getObjectById(creep.room.memory.Structures.nuker) || creep.room.findNuker();
        if(storage && nuker) {
            if(storage.store[RESOURCE_GHODIUM] >= 3000 && nuker.store[RESOURCE_GHODIUM] < 5000) {
                if(creep.pos.isNearTo(storage)) {
                    creep.withdraw(storage, RESOURCE_GHODIUM);
                    creep.memory.target = nuker.id;
                }
                else {
                    creep.MoveCostMatrixRoadPrio(storage, 1);
                }
                return;
            }
        }


        if(storage && nuker) {
            if(storage.store[RESOURCE_ENERGY] >= 275000 && nuker.store[RESOURCE_ENERGY] < 300000) {
                if(creep.pos.isNearTo(storage)) {
                    creep.withdraw(storage, RESOURCE_ENERGY);
                    creep.memory.target = nuker.id;
                }
                else {
                    creep.MoveCostMatrixRoadPrio(storage, 1);
                }
                return;
            }
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

        if(storage && terminal && storage.store[RESOURCE_OPS] > 30000 && terminal.store.getUsedCapacity() < 290000) {
            if(creep.pos.isNearTo(storage)) {
                creep.withdraw(storage, RESOURCE_OPS);
                creep.memory.target = terminal.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
            return;
        }

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
