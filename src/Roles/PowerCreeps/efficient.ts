/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    creep.memory.moving = false;
    if(creep.evacuate()) {
		return;
	}

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

    let storage:any = Game.getObjectById(creep.room.memory.Structures.storage);
    let danger = creep.room.memory.danger;

    if(creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(creep.store.getUsedCapacity() == 0) {
        creep.memory.full = false;
    }

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


    if(danger) {
        if(storage && creep.pos.getRangeTo(storage) > 7) {
            creep.MoveCostMatrixRoadPrio(storage, 5);
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
            if(creep.powers[power].cooldown == 0 && storage && storage.store[RESOURCE_ENERGY] > 15000 && creep.store[RESOURCE_OPS] >= 2) {
                let energyAvailable = creep.room.energyAvailable;
                let totalEnergyStorage = creep.room.energyCapacityAvailable;
                if(creep.powers[power].level == 1 && totalEnergyStorage*0.75 > energyAvailable ||
                   creep.powers[power].level == 2 && totalEnergyStorage*0.55 > energyAvailable ||
                   creep.powers[power].level >= 3 && totalEnergyStorage*0.5 > energyAvailable)
                {
                    usePowerInRange(creep, power, 3, storage);
                    return;
                }
            }
        }
        else if(parseInt(power) == PWR_OPERATE_LAB) {
            if(creep.powers[power].cooldown == 0 && creep.store[RESOURCE_OPS] >= 10) {
                if(!creep.memory.labs) {
                    let labsMemory = creep.room.memory.labs;
                    creep.memory.labs = [
                        {id:labsMemory.outputLab1, lastBuff:0},
                        {id:labsMemory.outputLab3, lastBuff:0},
                        {id:labsMemory.outputLab4, lastBuff:0},
                        {id:labsMemory.outputLab5, lastBuff:0},
                        {id:labsMemory.outputLab6, lastBuff:0},
                        {id:labsMemory.outputLab7, lastBuff:0},
                        {id:labsMemory.outputLab8, lastBuff:0}
                    ];
                }
                if(creep.memory.labs) {
                    let index = 0;
                    for(let lab of creep.memory.labs) {
                        if(Game.time - 1000 > lab.lastBuff) {
                            let labObj:any = Game.getObjectById(lab.id);
                            if(labObj) {
                                let result = usePowerInRange(creep, power, 3, labObj);
                                if(result && result == "success") {
                                    creep.memory.labs[index].lastBuff = Game.time;
                                }
                                return;
                            }
                        }
                        index ++;
                    }
                }
            }
        }
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



}

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
