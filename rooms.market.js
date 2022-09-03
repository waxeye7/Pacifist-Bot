function market(room) {
    if(room.terminal && Game.time % 10 == 6) {
        let resourceToSell;
        if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_HYDROGEN] >= 400) {
            resourceToSell = RESOURCE_HYDROGEN;
        }
        else if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_OXYGEN] >= 400) {
            resourceToSell = RESOURCE_OXYGEN;
        }
        else if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_UTRIUM] >= 400) {
            resourceToSell = RESOURCE_UTRIUM;
        }
        else if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_KEANIUM] >= 400) {
            resourceToSell = RESOURCE_KEANIUM;
        }
        else if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_LEMERGIUM] >= 400) {
            resourceToSell = RESOURCE_LEMERGIUM;
        }
        else if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_ZYNTHIUM] >= 400) {
            resourceToSell = RESOURCE_ZYNTHIUM;
        }
        else if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_CATALYST] >= 400) {
            resourceToSell = RESOURCE_CATALYST;
        }

        let orders = Game.market.getAllOrders(order => order.resourceType == resourceToSell && 
                                                        order.type == ORDER_BUY &&
                                                        Game.market.calcTransactionCost(200, room.name, order.roomName) < 500);

        console.log(resourceToSell, "buy orders found:", orders.length);
        orders.sort(function(a,b){return b.price - a.price;});
        if(orders[0].price > 1) {
            let result = Game.market.deal(orders[0].id, 200, room.name);
            if(result == 0) {
                console.log("Successful sell!");
            }
        }
    }
}

module.exports = market;