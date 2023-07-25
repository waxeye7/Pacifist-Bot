import urgent_buy from "Random_Stuff/urgent_buy";
const run = function (creep) {
    creep.memory.moving = false;
    // if(creep.evacuate()) {
	// 	return;
	// }
    if(creep.room.memory.danger && creep.powers[PWR_GENERATE_OPS] && creep.powers[PWR_GENERATE_OPS].cooldown == 0 && creep.store.getFreeCapacity() > 0) creep.usePower(PWR_GENERATE_OPS);
    if(creep.room.controller && !creep.room.controller.isPowerEnabled) {
        if(creep.pos.isNearTo(creep.room.controller)) {
            creep.enableRoom(creep.room.controller);
        }
        else {
            creep.MoveCostMatrixRoadPrio(creep.room.controller, 1);
        }
        return;
    }
    if(creep.ticksToLive < 120) {
        let powerSpawn:any = Game.getObjectById(creep.room.memory.Structures.powerSpawn);
        if(powerSpawn) {
            if(creep.pos.isNearTo(powerSpawn)) {
                creep.renew(powerSpawn);
            }
            else {
                creep.MoveCostMatrixRoadPrio(powerSpawn, 1);
            }
            return;
        }
    }

    let storage:any = creep.room.storage;
    let terminal = creep.room.terminal;

    let danger = creep.room.memory.danger;

    if(danger && terminal.store[RESOURCE_OPS] < 10000) {
        urgent_buy(terminal, RESOURCE_OPS, 1000)
    }

    let opsSource = null;
    if(storage.store[RESOURCE_OPS] > terminal.store[RESOURCE_OPS]) {
        opsSource = storage;
    }
    else {
        opsSource = terminal;
    }

    if(creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(creep.store.getUsedCapacity() < 50) {
        creep.memory.full = false;
    }

    if(danger && creep.store[RESOURCE_ENERGY] > 0) {
        if(creep.room.storage) {
            if(creep.pos.isNearTo(creep.room.storage)) {
                creep.transfer(creep.room.storage, RESOURCE_ENERGY);
            }
            else {
                creep.MoveCostMatrixRoadPrio(creep.room.storage, 1);
            }
            return;
        }
    }

    if(opsSource && danger && creep.room.storage && !creep.memory.full) {
        if(creep.pos.isNearTo(creep.room.storage)) {
            creep.withdraw(creep.room.storage, RESOURCE_OPS);
        }
        else {
            creep.MoveCostMatrixRoadPrio(creep.room.storage, 1);
        }
        return;
    }

    // if(danger && !creep.memory.full) {
        // let terminal = creep.room.terminal;
        // let storage = creep.room.storage;
        // let energySource = null;
        // if(terminal && storage && terminal.store[RESOURCE_ENERGY] > storage.store[RESOURCE_ENERGY]) {
        //     energySource = terminal;
        // }
        // else {
        //     energySource = storage;
        // }

        // if(energySource) {
        //     if(creep.pos.isNearTo(energySource)) {
        //         let freeSpace = creep.store.getFreeCapacity();
        //         if(freeSpace > 400) freeSpace = 400
        //         if(creep.withdraw(energySource, RESOURCE_ENERGY, freeSpace) === 0) {
        //             creep.memory.full = true;
        //         }
        //     }
        //     else {
        //         creep.MoveCostMatrixRoadPrio(energySource, 1);
        //     }
        // }
    // }


    if(danger && creep.memory.full) {
        // let towerIDS = creep.room.memory.Structures.towers;
        // let towers = [];
        // for(let towerID of towerIDS) {
        //     let tower = <StructureTower> Game.getObjectById(towerID);
        //     if(tower && tower.store.getFreeCapacity(RESOURCE_ENERGY) >= 600) {
        //         towers.push(tower);
        //     }
        // }

        // if(towers.length) {
        //     let closestTower = creep.pos.findClosestByRange(towers);

        //     if(closestTower) {
        //         if(creep.pos.isNearTo(closestTower)) {
        //             if(creep.transfer(closestTower, RESOURCE_ENERGY) === 0 && creep.store.getUsedCapacity(RESOURCE_ENERGY) <= closestTower.store.getFreeCapacity(RESOURCE_ENERGY)) {
        //                 creep.memory.full = false;
        //                 if(creep.room.storage) {
        //                     creep.MoveCostMatrixRoadPrio(creep.room.storage, 1)
        //                 }
        //             }
        //         }
        //         else {
        //             creep.MoveCostMatrixRoadPrio(closestTower, 1);
        //         }
        //         return;
        //     }
        //     else {
        //         creep.fortifyRampartWithEnemyNextToIt();
        //     }
        // }

        // else {
        //     creep.fortifyRampartWithEnemyNextToIt();
        // }
        creep.fortifyRampartWithEnemyNextToIt();

        if(storage && creep.pos.getRangeTo(storage) > 7) {
            creep.MoveCostMatrixRoadPrio(storage, 5);
        }
    }

    if(!danger) {

        if(creep.memory.full ) {
            if(storage) {
                if(creep.pos.isNearTo(storage)) {
                    for(let resource in creep.store) {
                        creep.transfer(storage, resource);
                    }
                }
                else {
                    creep.MoveCostMatrixRoadPrio(storage, 1);
                }
                return;
            }
        }

        for(let power in creep.powers) {

            if(parseInt(power) == PWR_GENERATE_OPS) {

                if(creep.powers[power].cooldown == 0) {
                    creep.usePower(power)
                    return;
                }
            }
            else if(parseInt(power) == PWR_OPERATE_EXTENSION) {

                if(creep.powers[power].cooldown == 0 && storage && storage.store[RESOURCE_ENERGY] > 15000 && creep.store[RESOURCE_OPS] >= 3 && creep.room.energyAvailable !== creep.room.energyCapacityAvailable) {
                    usePowerInRange(creep, power, 3, storage);
                    return;
                }
            }
            // else if(parseInt(power) == PWR_OPERATE_LAB) {
            //     if(creep.powers[power].cooldown == 0 && creep.store[RESOURCE_OPS] >= 10) {
            //         if(!creep.memory.labs) {
            //             let labsMemory = creep.room.memory.labs;
            //             creep.memory.labs = [
            //                 {id:labsMemory.outputLab1, lastBuff:0},
            //                 {id:labsMemory.outputLab3, lastBuff:0},
            //                 {id:labsMemory.outputLab4, lastBuff:0},
            //                 {id:labsMemory.outputLab5, lastBuff:0},
            //                 {id:labsMemory.outputLab6, lastBuff:0},
            //                 {id:labsMemory.outputLab7, lastBuff:0},
            //                 {id:labsMemory.outputLab8, lastBuff:0}
            //             ];
            //         }
            //         if(creep.memory.labs) {
            //             let index = 0;
            //             for(let lab of creep.memory.labs) {
            //                 if(Game.time - 1000 > lab.lastBuff) {
            //                     let labObj:any = Game.getObjectById(lab.id);
            //                     if(labObj) {
            //                         let result = usePowerInRange(creep, power, 3, labObj);
            //                         if(result && result == "success") {
            //                             creep.memory.labs[index].lastBuff = Game.time;
            //                         }
            //                         return;
            //                     }
            //                 }
            //                 index ++;
            //             }
            //         }
            //     }
            // }
            else if(parseInt(power) == PWR_REGEN_SOURCE) {
                if(creep.powers[power].cooldown == 0 && !danger) {
                    if(!creep.memory.sources) {
                        creep.memory.sources = [];
                        let sources = creep.room.find(FIND_SOURCES);
                        if(sources.length > 0) {
                            for(let source of sources) {
                                creep.memory.sources.push({id:source.id, lastBuff:0})
                            }
                        }
                    }
                    if(creep.memory.sources) {
                        let index = 0;
                        for(let source of creep.memory.sources) {
                            if(Game.time - 300 > source.lastBuff) {
                                let sourceObj:any = Game.getObjectById(source.id);
                                if(sourceObj) {
                                    let result = usePowerInRange(creep, power, 3, sourceObj);
                                    if(result && result == "success") {
                                        creep.memory.sources[index].lastBuff = Game.time;
                                    }
                                    return;
                                }
                            }
                            index ++;
                        }
                    }
                }
            }
            else if(parseInt(power) == PWR_OPERATE_OBSERVER) {
                if(creep.powers[power].cooldown == 0) {
                    if(!creep.memory.observer) {
                        let observer = creep.room.find(FIND_MY_STRUCTURES, {filter: { structureType : STRUCTURE_OBSERVER}});
                        if(observer.length > 0) {
                            creep.memory.observer = {id:observer[0].id, lastBuff:0};
                        }
                    }
                    if(creep.memory.observer) {
                        let lastBuffTimer = creep.powers[power].level * 200;
                        if(Game.time - lastBuffTimer > creep.memory.observer.lastBuff) {
                            let observer:any = Game.getObjectById(creep.memory.observer.id);
                            if(observer) {
                                let result = usePowerInRange(creep, power, 3, observer);
                                if(result && result == "success") {
                                    creep.memory.observer.lastBuff = Game.time;
                                }
                                return;
                            }
                        }
                    }
                }
            }
        }
    }
}




    // if(!creep.memory.locked_dropped && Game.time % 20 == 0 && !danger) {
    //     let droppedResources = creep.room.find(FIND_DROPPED_RESOURCES);
    //     if(droppedResources.length > 0) {
    //         let closestDroppedResource = creep.pos.findClosestByRange(droppedResources);
    //         creep.memory.locked_dropped = closestDroppedResource.id;
    //     }
    // }
    // if(creep.memory.locked_dropped && !danger) {
    //     let droppedResource:any = Game.getObjectById(creep.memory.locked_dropped);
    //     if(droppedResource) {
    //         if(creep.pos.isNearTo(droppedResource)) {
    //             creep.pickup(droppedResource);
    //         }
    //         else {
    //             creep.MoveCostMatrixRoadPrio(droppedResource, 1);
    //         }
    //     }
    //     else {
    //         creep.memory.locked_dropped = false;
    //     }
    // }




function usePowerInRange(creep, power, range, target=false):any {
    if(creep.pos.getRangeTo(target) <= range) {
        if(creep.usePower(power, target) == 0) {
            return "success";
        }

    }
    else {
        creep.MoveCostMatrixRoadPrio(target, range);
    }
}



const roleEfficient = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleEfficient;



// let thisroom = Game.rooms["E33N59"];
// let resource = RESOURCE_POWER;
// let OrderPrice = 200;
// let OrderAmount = 1000;
// let OrderMaxEnergy = OrderAmount * 4;
// let orders = Game.market.getAllOrders({type: ORDER_SELL, resourceType: resource});
// orders = _.filter(orders, (order) => order.amount >= OrderAmount && Game.market.calcTransactionCost(OrderAmount, thisroom.name, order.roomName) <= OrderMaxEnergy && order.price <= OrderPrice);
// if(orders.length > 0) {
//     orders.sort((a,b) => a.price - b.price);
//     let orderID = orders[0].id;

//     console.log(JSON.stringify(orders[0]));
//     console.log(Game.market.calcTransactionCost(OrderAmount, thisroom.name, orders[0].roomName));

//     let result = Game.market.deal(orderID, OrderAmount, thisroom.name);
//     if(result == 0) {
//         console.log(OrderAmount, resource, "Bought at Price:", orders[0].price, "=", OrderAmount * orders[0].price);
//     }
//     else {
//         console.log(result);
//     }
// }
