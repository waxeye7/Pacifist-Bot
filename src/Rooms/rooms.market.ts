function market(room) {
    if(room.terminal && room.terminal.cooldown == 0) {
        let resourceToSell;
        if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_HYDROGEN] >= 11000) {
            resourceToSell = RESOURCE_HYDROGEN;
        }
        else if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_OXYGEN] >= 11000) {
            resourceToSell = RESOURCE_OXYGEN;
        }
        else if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_UTRIUM] >= 11000) {
            resourceToSell = RESOURCE_UTRIUM;
        }
        else if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_KEANIUM] >= 11000) {
            resourceToSell = RESOURCE_KEANIUM;
        }
        else if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_LEMERGIUM] >= 11000) {
            resourceToSell = RESOURCE_LEMERGIUM;
        }
        else if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_ZYNTHIUM] >= 11000) {
            resourceToSell = RESOURCE_ZYNTHIUM;
        }
        else if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_CATALYST] >= 11000) {
            resourceToSell = RESOURCE_CATALYST;
        }
        else {
            resourceToSell = false;
        }

        if(resourceToSell) {
            let orders = Game.market.getAllOrders(order => order.resourceType == resourceToSell &&
                order.type == ORDER_BUY &&
                Game.market.calcTransactionCost(200, room.name, order.roomName) < 400);

            console.log(resourceToSell, "buy orders found:", orders.length);
            orders.sort(function(a,b){return b.price - a.price;});
            if(orders[0] != undefined) {
                if(orders[0].price > 0.05) {
                    let orderQuantity = 200;
                    let result = Game.market.deal(orders[0].id, orderQuantity, room.name);
                    if(result == 0) {
                        console.log("Successful sell on", resourceToSell, "at the price of", orders[0].price, "and quantity of", orderQuantity);
                    }
                }
            }
        }
//------------------------------------------------------------------------------------------------------------------------------------------------

        // buy section

        if(room.terminal.store[RESOURCE_ENERGY] >= 1600 && room.terminal.store[RESOURCE_UTRIUM_HYDRIDE] < 5000) {
            let OrderPrice;

            if(room.memory.danger) {
                OrderPrice = 50;
            }
            else{
                OrderPrice = 10;
            }
            let OrderAmount = 100;
            let OrderMaxEnergy = OrderAmount * 5;
            let orders = Game.market.getAllOrders({type: ORDER_SELL, resourceType: RESOURCE_UTRIUM_HYDRIDE});
            orders = _.filter(orders, (order) => order.amount >= OrderAmount && Game.market.calcTransactionCost(OrderAmount, room.name, order.roomName) <= OrderMaxEnergy && order.price <= OrderPrice);
            if(orders.length > 0) {
                orders.sort((a,b) => a.price - b.price);
                let orderID = orders[0].id;

                console.log(JSON.stringify(orders[0]))
                console.log(Game.market.calcTransactionCost(OrderAmount, room.name, orders[0].roomName))

                let result = Game.market.deal(orderID, OrderAmount, room.name);
                if(result == 0) {
                    console.log(OrderAmount, RESOURCE_UTRIUM_HYDRIDE, "Bought at Price:", orders[0].price, "=", OrderAmount * orders[0].price);
                    return;
                }
                else {
                    console.log(result);
                }
            }
            else {
                console.log("no order found below price of", OrderPrice, "for", RESOURCE_UTRIUM_HYDRIDE)
            }
        }




        if(room.terminal.store[RESOURCE_ENERGY] >= 1600 && room.terminal.store[RESOURCE_HYDROGEN] < 10000) {
            let OrderPrice = 10;
            let OrderAmount = 100;
            let OrderMaxEnergy = OrderAmount * 3;
            let orders = Game.market.getAllOrders({type: ORDER_SELL, resourceType: RESOURCE_HYDROGEN});
            orders = _.filter(orders, (order) => order.amount >= OrderAmount && Game.market.calcTransactionCost(OrderAmount, room.name, order.roomName) <= OrderMaxEnergy && order.price <= OrderPrice);
            if(orders.length > 0) {
                orders.sort((a,b) => a.price - b.price);
                let orderID = orders[0].id;

                console.log(JSON.stringify(orders[0]))
                console.log(Game.market.calcTransactionCost(OrderAmount, room.name, orders[0].roomName))

                let result = Game.market.deal(orderID, OrderAmount, room.name);
                if(result == 0) {
                    console.log(OrderAmount, RESOURCE_HYDROGEN, "Bought at Price:", orders[0].price, "=", OrderAmount * orders[0].price);
                    return;
                }
                else {
                    console.log(result);
                }
            }
            else {
                console.log("no order found below price of", OrderPrice, "for", RESOURCE_HYDROGEN)
            }
        }


        if(room.terminal.store[RESOURCE_ENERGY] >= 1600 && room.terminal.store[RESOURCE_UTRIUM] < 10000) {
            let OrderPrice = 10;
            let OrderAmount = 100;
            let OrderMaxEnergy = OrderAmount * 3;
            let orders = Game.market.getAllOrders({type: ORDER_SELL, resourceType: RESOURCE_UTRIUM});
            orders = _.filter(orders, (order) => order.amount >= OrderAmount && Game.market.calcTransactionCost(OrderAmount, room.name, order.roomName) <= OrderMaxEnergy && order.price <= OrderPrice);
            if(orders.length > 0) {
                orders.sort((a,b) => a.price - b.price);
                let orderID = orders[0].id;

                console.log(JSON.stringify(orders[0]))
                console.log(Game.market.calcTransactionCost(OrderAmount, room.name, orders[0].roomName))

                let result = Game.market.deal(orderID, OrderAmount, room.name);
                if(result == 0) {
                    console.log(OrderAmount, RESOURCE_UTRIUM, "Bought at Price:", orders[0].price, "=", OrderAmount * orders[0].price);
                    return;
                }
                else {
                    console.log(result);
                }
            }
            else {
                console.log("no order found below price of", OrderPrice, "for", RESOURCE_UTRIUM)
            }
        }


        if(room.terminal.store[RESOURCE_ENERGY] >= 1600 && room.terminal.store[RESOURCE_OXYGEN] < 10000) {
            let OrderPrice = 3;
            let OrderAmount = 100;
            let OrderMaxEnergy = OrderAmount * 3;
            let orders = Game.market.getAllOrders({type: ORDER_SELL, resourceType: RESOURCE_OXYGEN});
            orders = _.filter(orders, (order) => order.amount >= OrderAmount && Game.market.calcTransactionCost(OrderAmount, room.name, order.roomName) <= OrderMaxEnergy && order.price <= OrderPrice);
            if(orders.length > 0) {
                orders.sort((a,b) => a.price - b.price);
                let orderID = orders[0].id;

                console.log(JSON.stringify(orders[0]))
                console.log(Game.market.calcTransactionCost(OrderAmount, room.name, orders[0].roomName))

                let result = Game.market.deal(orderID, OrderAmount, room.name);
                if(result == 0) {
                    console.log(OrderAmount, RESOURCE_OXYGEN, "Bought at Price:", orders[0].price, "=", OrderAmount * orders[0].price);
                    return;
                }
                else {
                    console.log(result);
                }
            }
            else {
                console.log("no order found below price of", OrderPrice, "for", RESOURCE_OXYGEN)
            }
        }


        if(room.terminal.store[RESOURCE_ENERGY] >= 1600 && room.terminal.store[RESOURCE_CATALYST] < 10000) {
            let OrderPrice = 3;
            let OrderAmount = 100;
            let OrderMaxEnergy = OrderAmount * 3;
            let orders = Game.market.getAllOrders({type: ORDER_SELL, resourceType: RESOURCE_CATALYST});
            orders = _.filter(orders, (order) => order.amount >= OrderAmount && Game.market.calcTransactionCost(OrderAmount, room.name, order.roomName) <= OrderMaxEnergy && order.price <= OrderPrice);
            if(orders.length > 0) {
                orders.sort((a,b) => a.price - b.price);
                let orderID = orders[0].id;

                console.log(JSON.stringify(orders[0]))
                console.log(Game.market.calcTransactionCost(OrderAmount, room.name, orders[0].roomName))

                let result = Game.market.deal(orderID, OrderAmount, room.name);
                if(result == 0) {
                    console.log(OrderAmount, RESOURCE_CATALYST, "Bought at Price:", orders[0].price, "=", OrderAmount * orders[0].price);
                    return;
                }
                else {
                    console.log(result);
                }
            }
            else {
                console.log("no order found below price of", OrderPrice, "for", RESOURCE_CATALYST)
            }
        }


        let storage = Game.getObjectById(room.memory.storage) || room.findStorage();
        if(room.terminal.store[RESOURCE_ENERGY] > 500 && room.terminal.store[RESOURCE_ENERGY] < 65000 && storage && storage.store[RESOURCE_ENERGY] < 200000) {

            let OrderPrice = 10;
            let OrderAmount = 5000;
            let OrderMaxEnergy = OrderAmount / 2.5;
            let orders = Game.market.getAllOrders({type: ORDER_SELL, resourceType: RESOURCE_ENERGY});
            orders = _.filter(orders, (order) => order.amount >= OrderAmount && Game.market.calcTransactionCost(OrderAmount, room.name, order.roomName) <= OrderMaxEnergy && order.price <= OrderPrice);
            if(orders.length > 0) {
                orders.sort((a,b) => a.price - b.price);
                let orderID = orders[0].id;

                console.log(JSON.stringify(orders[0]))
                console.log(Game.market.calcTransactionCost(OrderAmount, room.name, orders[0].roomName))

                let result = Game.market.deal(orderID, OrderAmount, room.name);
                if(result == 0) {
                    console.log(OrderAmount, RESOURCE_ENERGY, "Bought at Price:", orders[0].price, "=", OrderAmount * orders[0].price);
                    return;
                }
                else {
                    console.log(result);
                }
            }
            else {
                console.log("no order found below price of", OrderPrice, "for", RESOURCE_ENERGY)
            }

        }


        if(Game.resources.pixel > 100 && room.terminal && Game.time % 500 == 0) {
            let OrderPrice = 20000;

            let orders = Game.market.getAllOrders({type: ORDER_BUY, resourceType: PIXEL});
            orders = _.filter(orders, (order) => order.amount >= 1 && order.price >= OrderPrice);
            if(orders.length > 0) {
                orders.sort((a,b) => b.price - a.price);
                let orderID = orders[0].id;
                let result = Game.market.deal(orderID, 1, room.name);
                if(result == 0) {
                    console.log(1, PIXEL, "Sold at Price:", orders[0].price, "=", 1 * orders[0].price);
                    return;
                }
                else {
                    console.log(result);
                }
            }
            else {
                console.log("no order found below price of", OrderPrice, "for", PIXEL);
            }

        }






    }
}

export default market;
// module.exports = market;
