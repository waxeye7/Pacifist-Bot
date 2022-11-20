function market(room):any {
    if(room.terminal && room.terminal.cooldown == 0 && Game.time % 10 == 0) {
        let resourceToSell;
        if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_HYDROGEN] >= 7000) {
            resourceToSell = RESOURCE_HYDROGEN;
        }
        else if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_OXYGEN] >= 7000) {
            resourceToSell = RESOURCE_OXYGEN;
        }
        else if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_UTRIUM] >= 7000) {
            resourceToSell = RESOURCE_UTRIUM;
        }
        else if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_KEANIUM] >= 7000) {
            resourceToSell = RESOURCE_KEANIUM;
        }
        else if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_LEMERGIUM] >= 7000) {
            resourceToSell = RESOURCE_LEMERGIUM;
        }
        else if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_ZYNTHIUM] >= 7000) {
            resourceToSell = RESOURCE_ZYNTHIUM;
        }
        else if(room.terminal.store[RESOURCE_ENERGY] >= 2000 && room.terminal.store[RESOURCE_CATALYST] >= 7000) {
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
                if(orders[0].price > 1) {
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

        let BaseResources = [RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_UTRIUM, RESOURCE_KEANIUM, RESOURCE_LEMERGIUM, RESOURCE_ZYNTHIUM, RESOURCE_CATALYST];
        let Mineral:any = Game.getObjectById(room.memory.mineral) || room.findMineral();
        if(room.terminal.store[RESOURCE_ENERGY] >= 2000) {
            // for(let resource of BaseResources) {
            //     if(room.terminal.store[resource] < 5000 && resource != Mineral.mineralType || room.terminal.store[resource] < 1000 && resource == Mineral.mineralType) {
            //         let result = buy_resource(resource, 5);
            //         if(result == 0) {
            //             return;
            //         }
            //     }
            // }
            for(let resource of BaseResources) {
                if(room.terminal.store[resource] < 5000 && resource != Mineral.mineralType || room.terminal.store[resource] < 1000 && resource == Mineral.mineralType) {
                    let result = buy_resource(resource, 10);
                    if(result == 0) {
                        return;
                    }
                }
            }

            // for(let resource of BaseResources) {
            //     if(room.terminal.store[resource] < 5000 && resource != Mineral.mineralType || room.terminal.store[resource] < 1000 && resource == Mineral.mineralType) {
            //         let result = buy_resource(resource, 15);
            //         if(result == 0) {
            //             return;
            //         }
            //     }
            // }

            // if(Game.time % 41 == 0) {
            //     for(let resource of BaseResources) {
            //         if(room.terminal.store[resource] < 5000 && resource != Mineral.mineralType || room.terminal.store[resource] < 1000 && resource == Mineral.mineralType) {
            //             let result = buy_resource(resource, 20);
            //             if(result == 0) {
            //                 return;
            //             }
            //         }
            //     }
            // }
        }

        function buy_resource(resource:ResourceConstant, OrderPrice:number=5):any | void {
            let OrderAmount = 100;
            let OrderMaxEnergy = OrderAmount * 4;
            let orders = Game.market.getAllOrders({type: ORDER_SELL, resourceType: resource});
            orders = _.filter(orders, (order) => order.amount >= OrderAmount && Game.market.calcTransactionCost(OrderAmount, room.name, order.roomName) <= OrderMaxEnergy && order.price <= OrderPrice);
            if(orders.length > 0) {
                orders.sort((a,b) => a.price - b.price);
                let orderID = orders[0].id;

                console.log(JSON.stringify(orders[0]))
                console.log(Game.market.calcTransactionCost(OrderAmount, room.name, orders[0].roomName))

                let result = Game.market.deal(orderID, OrderAmount, room.name);
                if(result == 0) {
                    console.log(OrderAmount, resource, "Bought at Price:", orders[0].price, "=", OrderAmount * orders[0].price);
                    return result;
                }
                else {
                    console.log(result);
                }
            }
            else {
                console.log("no order found below price of", OrderPrice, "for", resource, room.name)
            }
        }

        function sell_resource(resource:ResourceConstant, OrderPrice:number=5):any | void {
            let OrderAmount = 100;
            let OrderMaxEnergy = OrderAmount * 4;
            let orders = Game.market.getAllOrders({type: ORDER_BUY, resourceType: resource});
            orders = _.filter(orders, (order) => order.amount >= OrderAmount && Game.market.calcTransactionCost(OrderAmount, room.name, order.roomName) <= OrderMaxEnergy && order.price >= OrderPrice);
            if(orders.length > 0) {
                orders.sort((a,b) => b.price - a.price);
                let orderID = orders[0].id;

                console.log(JSON.stringify(orders[0]))
                console.log(Game.market.calcTransactionCost(OrderAmount, room.name, orders[0].roomName))

                let result = Game.market.deal(orderID, OrderAmount, room.name);
                if(result == 0) {
                    console.log(OrderAmount, resource, "Sold at Price:", orders[0].price, "=", OrderAmount * orders[0].price);
                    return result;
                }
                else {
                    console.log(result);
                }
            }
            else {
                console.log("no order found above price of", OrderPrice, "for", resource, room.name)
            }
        }


        let storage = Game.getObjectById(room.memory.storage) || room.findStorage();
        if(room.terminal.store[RESOURCE_ENERGY] > 500 && room.terminal.store[RESOURCE_ENERGY] < 35000 && storage && storage.store[RESOURCE_ENERGY] < 100000) {

            let OrderPrice = 20;
            let OrderAmount = 5000;
            let OrderMaxEnergy = OrderAmount / 2;
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


        // if(room.factory && room.terminal) {
        //     if(room.terminal.store[RESOURCE_ALLOY] >= 100) {
        //         let result = sell_resource(RESOURCE_ALLOY, 500);
        //         if(result == 0) {
        //             return;
        //         }
        //     }
        //     else if(room.terminal.store[RESOURCE_CELL] >= 100) {
        //         let result = sell_resource(RESOURCE_CELL, 500);
        //         if(result == 0) {
        //             return;
        //         }
        //     }
        //     else if(room.terminal.store[RESOURCE_WIRE] >= 100) {
        //         let result = sell_resource(RESOURCE_WIRE, 500);
        //         if(result == 0) {
        //             return;
        //         }
        //     }
        //     else if(room.terminal.store[RESOURCE_CONDENSATE] >= 100) {
        //         let result = sell_resource(RESOURCE_CONDENSATE, 500);
        //         if(result == 0) {
        //             return;
        //         }
        //     }
        // }


        if(Game.resources.pixel > 0 && room.terminal && Game.time % 100 == 0) {
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
    let storage = Game.getObjectById(room.memory.storage) || room.findStorage();
    if(storage && storage.store[RESOURCE_ENERGY] > 300000 && Game.time % 110 == 0 && Game.cpu.bucket > 6000 && room.terminal.cooldown == 0 && room.terminal.store.getFreeCapacity() > 50000) {
        let crawler_list = [
            RESOURCE_ENERGY,RESOURCE_POWER,RESOURCE_HYDROGEN,RESOURCE_LEMERGIUM,RESOURCE_ZYNTHIUM,RESOURCE_GHODIUM,
            RESOURCE_SILICON,RESOURCE_METAL,RESOURCE_BIOMASS,RESOURCE_MIST,RESOURCE_HYDROXIDE,RESOURCE_ZYNTHIUM_KEANITE,RESOURCE_UTRIUM_LEMERGITE,RESOURCE_UTRIUM_HYDRIDE,
            RESOURCE_UTRIUM_OXIDE,RESOURCE_KEANIUM_HYDRIDE,RESOURCE_KEANIUM_OXIDE,RESOURCE_LEMERGIUM_HYDRIDE,RESOURCE_LEMERGIUM_OXIDE,RESOURCE_ZYNTHIUM_HYDRIDE,
            RESOURCE_ZYNTHIUM_OXIDE,RESOURCE_GHODIUM_HYDRIDE,RESOURCE_GHODIUM_OXIDE,RESOURCE_UTRIUM_ACID,RESOURCE_UTRIUM_ALKALIDE,RESOURCE_KEANIUM_ACID,
            RESOURCE_KEANIUM_ALKALIDE,RESOURCE_LEMERGIUM_ACID,RESOURCE_LEMERGIUM_ALKALIDE,RESOURCE_ZYNTHIUM_ACID,RESOURCE_ZYNTHIUM_ALKALIDE,RESOURCE_GHODIUM_ACID,
            RESOURCE_GHODIUM_ALKALIDE,RESOURCE_CATALYZED_UTRIUM_ACID,RESOURCE_CATALYZED_UTRIUM_ALKALIDE,RESOURCE_CATALYZED_KEANIUM_ACID,RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
            RESOURCE_CATALYZED_LEMERGIUM_ACID,RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,RESOURCE_CATALYZED_ZYNTHIUM_ACID,RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
            RESOURCE_CATALYZED_GHODIUM_ACID,RESOURCE_CATALYZED_GHODIUM_ALKALIDE,RESOURCE_OPS,RESOURCE_UTRIUM_BAR,RESOURCE_LEMERGIUM_BAR,RESOURCE_ZYNTHIUM_BAR,
            RESOURCE_KEANIUM_BAR,RESOURCE_GHODIUM_MELT,RESOURCE_OXIDANT,RESOURCE_REDUCTANT,RESOURCE_PURIFIER,RESOURCE_BATTERY,RESOURCE_COMPOSITE,RESOURCE_CRYSTAL,
            RESOURCE_LIQUID,RESOURCE_WIRE,RESOURCE_SWITCH,RESOURCE_TRANSISTOR,RESOURCE_MICROCHIP,RESOURCE_CIRCUIT,RESOURCE_DEVICE,RESOURCE_CELL,RESOURCE_PHLEGM,
            RESOURCE_TISSUE,RESOURCE_MUSCLE,RESOURCE_ORGANOID,RESOURCE_ORGANISM,RESOURCE_ALLOY,RESOURCE_TUBE,RESOURCE_FIXTURES,RESOURCE_FRAME,RESOURCE_HYDRAULICS,
            RESOURCE_MACHINE,RESOURCE_CONDENSATE,RESOURCE_CONCENTRATE,RESOURCE_EXTRACT,RESOURCE_SPIRIT,RESOURCE_EMANATION,RESOURCE_ESSENCE
        ]

        let shuffled_crawler_list = crawler_list
            .map(value => ({ value, sort: Math.random() }))
            .sort((a, b) => a.sort - b.sort)
            .map(({ value }) => value);

        if(room.terminal.store[RESOURCE_ENERGY] >= 2000) {
            let count = 0;
            let price = 3;
            for(let resource of shuffled_crawler_list) {
                let result = buy_resource_crawler(resource, price);
                if(result == 0) {
                    return;
                }
                else if(!result) {
                    count += 1
                }
            }
            console.log(count, "items not found by the market crawler below price of", price, room.name);
        }

        function buy_resource_crawler(resource:ResourceConstant, OrderPrice:number=5):any | void {
            let OrderAmount = 50;
            let OrderMaxEnergy = OrderAmount * 8;
            let orders = Game.market.getAllOrders({type: ORDER_SELL, resourceType: resource});
            orders = _.filter(orders, (order) => order.amount >= OrderAmount && Game.market.calcTransactionCost(OrderAmount, room.name, order.roomName) <= OrderMaxEnergy && order.price <= OrderPrice);
            if(orders.length > 0) {
                orders.sort((a,b) => a.price - b.price);
                let orderID = orders[0].id;

                console.log(JSON.stringify(orders[0]))
                console.log(Game.market.calcTransactionCost(OrderAmount, room.name, orders[0].roomName))

                let result = Game.market.deal(orderID, OrderAmount, room.name);
                if(result == 0) {
                    console.log(OrderAmount, resource, "Bought at Price:", orders[0].price, "=", OrderAmount * orders[0].price);
                    return result;
                }
                else {
                    console.log(result);
                }
            }
            else {
                return false;
            }
        }
    }

    let targetRampRoom = "E33N59"
    if(Game.time % 100 == 0 && room.name != targetRampRoom && Game.rooms[targetRampRoom] && Game.rooms[targetRampRoom].controller && Game.rooms[targetRampRoom].controller.my && Game.rooms[targetRampRoom].controller.level >= 6 &&
        Game.rooms[targetRampRoom].terminal && Game.rooms[targetRampRoom].terminal.store[RESOURCE_ENERGY] < 25000) {
            let theirRoom:any = Game.rooms[targetRampRoom];
            let theirStorage = Game.getObjectById(theirRoom.memory.storage) || theirRoom.findStorage();
            if(theirStorage && theirStorage.store[RESOURCE_ENERGY] < 600000 && room.terminal.store[RESOURCE_ENERGY] > 20000 && storage && storage.store[RESOURCE_ENERGY] > 400000) {
                room.terminal.send(RESOURCE_ENERGY, 5500, targetRampRoom, "enjoy this energy, other room!");
            }
    }


}

export default market;
// module.exports = market;
