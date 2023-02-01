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

    for(let power in creep.powers) {
        // if(creep.powers[power].cooldown == 0) {
            // if(creep.powers[power] == PWR_GENERATE_OPS) {

            // }
            creep.usePower(power)
        // }
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
