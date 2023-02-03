/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    creep.memory.moving = false;

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


    if(!creep.memory.locked_dropped && Game.time % 20 == 0) {
        let droppedResources = creep.room.find(FIND_DROPPED_RESOURCES);
        if(droppedResources.length > 0) {
            let closestDroppedResource = creep.pos.findClosestByRange(droppedResources);
            creep.memory.locked_dropped = closestDroppedResource.id;
        }
    }
    if(creep.memory.locked_dropped) {
        let droppedResource:any = Game.getObjectById(creep.memory.locked_dropped);
        if(droppedResource) {
            if(creep.pos.isNearTo(droppedResource)) {
                creep.pickup(droppedResource);
            }
            else {
                creep.MoveCostMatrixRoadPrio(droppedResource, 1);
            }
        }
        else {
            creep.memory.locked_dropped = false;
        }
    }

    for(let power in creep.powers) {
        if(parseInt(power) == PWR_GENERATE_OPS) {
            if(creep.powers[power].cooldown == 0) {
                creep.usePower(power)
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
                    usePowerInRange(creep, power, 3, storage)
                }
            }
        }


    }

}

function usePowerInRange(creep, power, range, target=false) {
    if(creep.pos.getRangeTo(target) <= range) {
        creep.usePower(power, target);
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
