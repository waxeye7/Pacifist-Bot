function market(room):any {
    if(room.terminal && room.terminal.cooldown == 0 && Game.time % 10 == 0) {
        let BaseResources = [RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_UTRIUM, RESOURCE_KEANIUM, RESOURCE_LEMERGIUM, RESOURCE_ZYNTHIUM, RESOURCE_CATALYST];
        let Mineral:any = Game.getObjectById(room.memory.mineral) || room.findMineral();


        let resourceToSell = Mineral.mineralType;
        // if(room.terminal.store[RESOURCE_ENERGY] >= 1500 && room.terminal.store[RESOURCE_HYDROGEN] >= 20000) {
        //     resourceToSell = RESOURCE_HYDROGEN;
        // }
        // else if(room.terminal.store[RESOURCE_ENERGY] >= 1500 && room.terminal.store[RESOURCE_OXYGEN] >= 20000) {
        //     resourceToSell = RESOURCE_OXYGEN;
        // }
        // else if(room.terminal.store[RESOURCE_ENERGY] >= 1500 && room.terminal.store[RESOURCE_UTRIUM] >= 20000) {
        //     resourceToSell = RESOURCE_UTRIUM;
        // }
        // else if(room.terminal.store[RESOURCE_ENERGY] >= 1500 && room.terminal.store[RESOURCE_KEANIUM] >= 20000) {
        //     resourceToSell = RESOURCE_KEANIUM;
        // }
        // else if(room.terminal.store[RESOURCE_ENERGY] >= 1500 && room.terminal.store[RESOURCE_LEMERGIUM] >= 20000) {
        //     resourceToSell = RESOURCE_LEMERGIUM;
        // }
        // else if(room.terminal.store[RESOURCE_ENERGY] >= 1500 && room.terminal.store[RESOURCE_ZYNTHIUM] >= 20000) {
        //     resourceToSell = RESOURCE_ZYNTHIUM;
        // }
        // else if(room.terminal.store[RESOURCE_ENERGY] >= 1500 && room.terminal.store[RESOURCE_CATALYST] >= 20000) {
        //     resourceToSell = RESOURCE_CATALYST;
        // }
        // else {
        //     resourceToSell = false;
        // }

        if(room.terminal.store.getUsedCapacity() > 280000 && room.terminal.store[resourceToSell] > 100000) {
            let orders = Game.market.getAllOrders(order => order.resourceType == resourceToSell &&
                order.type == ORDER_BUY &&
                Game.market.calcTransactionCost(500, room.name, order.roomName) < 500);

            console.log(resourceToSell, "buy orders found:", orders.length);
            orders.sort(function(a,b){return b.price - a.price;});
            if(orders[0] != undefined) {
                let orderQuantity = 500;
                let result = Game.market.deal(orders[0].id, orderQuantity, room.name);
                if(result == 0) {
                    console.log("Successful sell on", resourceToSell, "at the price of", orders[0].price, "and quantity of", orderQuantity);
                    return;

                }
            }
        }

        if(!room.memory.market) {
            room.memory.market = {};
        }
        if(!room.memory.market.sellOrders) {
            room.memory.market.sellOrders = {};
        }
        if(!room.memory.market.sellOrders.roomMineral) {
            room.memory.market.sellOrders.roomMineral = {};
        }

        if(room.terminal.store[resourceToSell] >= 30000) {
            if(room.memory.market.sellOrders.roomMineral.ID && Game.market.orders[room.memory.market.sellOrders.roomMineral.ID]) {
                let order = Game.market.orders[room.memory.market.sellOrders.roomMineral.ID];
                if(order.remainingAmount <= 1000)  {
                    Game.market.extendOrder(room.memory.market.sellOrders.roomMineral.ID, 4000)
                }
                else if(Game.time % 400 == 0) {
                    let recPrice = CalcPriceForOrder(resourceToSell, room.terminal.store[resourceToSell])
                    function inRange(x, min, max) {
                        return ((x-min)*(x-max) <= 0);
                    }
                    if(!inRange(order.price, recPrice-2, recPrice+2)) {
                        Game.market.changeOrderPrice(order.id, recPrice);
                    }
                }
            }
            else {
                let foundOrder = false;

                let Orders = Game.market.orders;

                // for(let orderID in Orders) {
                //     let myOrder = Game.market.orders[orderID];
                //     if(myOrder.price == 99) {
                //         Game.market.cancelOrder(orderID)
                //     }
                // }

                for(let orderID in Orders) {
                    let myOrder = Game.market.orders[orderID];
                    if(myOrder.resourceType == resourceToSell && myOrder.type == ORDER_SELL && myOrder.roomName == room.name) {
                        foundOrder = true;
                        room.memory.market.sellOrders.roomMineral.ID = orderID;
                        break;
                    }
                }


                if(!foundOrder) {

                    let recPrice = CalcPriceForOrder(resourceToSell, room.terminal.store[resourceToSell])

                    Game.market.createOrder({
                        type: ORDER_SELL,
                        resourceType: resourceToSell,
                        price: recPrice,
                        totalAmount: 5000,
                        roomName: room.name
                    });
                }

            }
        }

        function CalcPriceForOrder(resourceToSell, resourceStored) {
            let resourceData = Game.market.getHistory(resourceToSell);
            let myTotalAverage = 0;
            let myTotalStDevAverage = 0;
            let weightNumber = 1;
            if(resourceData && resourceData.length > 0) {
                for(let day of resourceData) {

                    myTotalAverage += day.avgPrice * weightNumber;
                    myTotalStDevAverage += day.stddevPrice * weightNumber;
                    weightNumber ++;
                }
                let Average = myTotalAverage / 105;
                let AverageStDev = myTotalStDevAverage / 105;
                console.log(Average, "averageprice", AverageStDev, "average St Dev")

                if(resourceStored >= 100000) {
                    if(Average > 6) {
                        return Average - 6
                    }
                    return Average
                }
                else if(resourceStored >= 80000) {
                    if(Average > 4) {
                        return Average - 4
                    }
                    return Average
                }
                else if(resourceStored >= 60000) {
                    if(Average > 2) {
                        return Average - 2
                    }
                    return Average
                }
                else {
                    return Average + AverageStDev;
                }
            }
            else {
                return 0.009;
            }



        }

//------------------------------------------------------------------------------------------------------------------------------------------------

        // buy section
        if(!Memory.my_goods) {
            Memory.my_goods = {
                "H":[],
                "O":[],
                "U":[],
                "K":[],
                "L":[],
                "Z":[],
                "X":[]
            }
        }
        if(Memory.my_goods[Mineral.mineralType].length == 0 || !Memory.my_goods[Mineral.mineralType].includes(room.name, 0)) {
            Memory.my_goods[Mineral.mineralType].push(room.name);
        }

        if(room.terminal.store[RESOURCE_ENERGY] >= 2000) {

            for(let resource of BaseResources) {
                if(room.terminal.store[resource] < 8000 && resource != Mineral.mineralType) {
                    if(Memory.my_goods[resource].length > 0) {
                        for(let room_with_mineral of Memory.my_goods[resource]) {
                            if(!Game.rooms[room_with_mineral]) {
                                Memory.my_goods[resource].filter(function(r) {return r !== room_with_mineral;});
                                break;
                            }
                            if(Game.rooms[room_with_mineral].terminal && Game.rooms[room_with_mineral].terminal.store[resource] >= 1000) {
                                Game.rooms[room_with_mineral].terminal.send(resource, 1000, room.name, "enjoy this " + resource + " other room!");
                                console.log("sending", room.name, "1000", resource)
                                break;
                            }
                        }
                    }
                }
            }





            // for(let resource of BaseResources) {
            //     if(room.terminal.store[resource] < 5000 && resource != Mineral.mineralType || room.terminal.store[resource] < 1000 && resource == Mineral.mineralType) {
            //         let result = buy_resource(resource, 5);
            //         if(result == 0) {
            //             return;
            //         }
            //     }
            // }


            if(room.terminal.store.getFreeCapacity() > 1000) {
                for(let resource of BaseResources) {
                    if(room.terminal.store[resource] < 5000 && resource != Mineral.mineralType || room.terminal.store[resource] < 1000 && resource == Mineral.mineralType) {
                        let result = buy_resource(resource, 12.5);
                        if(result == 0) {
                            return;
                        }
                    }
                }


                for(let resource of BaseResources) {
                    if(room.terminal.store[resource] < 4000 && resource != Mineral.mineralType || room.terminal.store[resource] < 1000 && resource == Mineral.mineralType) {
                        let result = buy_resource(resource, 20);
                        if(result == 0) {
                            return;
                        }
                    }
                }
            }


            // for(let resource of BaseResources) {
            //     if(room.terminal.store[resource] < 1000 && resource != Mineral.mineralType || room.terminal.store[resource] < 800 && resource == Mineral.mineralType) {
            //         let result = buy_resource(resource, 60);
            //         if(result == 0) {
            //             return;
            //         }
            //     }
            // }


            let SellResources = [RESOURCE_OPS, RESOURCE_GHODIUM_MELT, RESOURCE_COMPOSITE, RESOURCE_CRYSTAL, RESOURCE_LIQUID,
            RESOURCE_OXIDANT, RESOURCE_REDUCTANT, RESOURCE_ZYNTHIUM_BAR, RESOURCE_LEMERGIUM_BAR, RESOURCE_UTRIUM_BAR, RESOURCE_KEANIUM_BAR, RESOURCE_PURIFIER,
            RESOURCE_METAL, RESOURCE_BIOMASS, RESOURCE_SILICON, RESOURCE_MIST];

            for(let resource of SellResources) {
                if(room.terminal.store[resource] >= 1000) {
                    let result = sell_resource(resource, 1, 1000);
                    if(result == 0) {
                        return;
                    }
                }
                if(room.terminal.store[resource] >= 100) {
                    let result = sell_resource(resource, 1, 100);
                    if(result == 0) {
                        return;
                    }
                }
                if(room.terminal.store[resource] >= 10) {
                    let result = sell_resource(resource, 1, 10);
                    if(result == 0) {
                        return;
                    }
                }
                if(room.terminal.store[resource] >= 1) {
                    let result = sell_resource(resource, 1, 1);
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
            let OrderAmount = 1000;
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
                // console.log("no order found below price of", OrderPrice, "for", resource, room.name)
            }
        }

        function sell_resource(resource:ResourceConstant | RESOURCE_BATTERY | RESOURCE_OPS, OrderPrice:number=5, OrderAmount=100):any | void {
            let OrderMaxEnergy = OrderAmount * 8;
            let orders = Game.market.getAllOrders({type: ORDER_BUY, resourceType: resource});
            orders = _.filter(orders, (order) => order.amount >= OrderAmount && Game.market.calcTransactionCost(OrderAmount, room.name, order.roomName) <= OrderMaxEnergy && order.price >= OrderPrice);
            if(orders.length > 0) {
                orders.sort((a,b) => b.price - a.price);

                // if(!price_checker(orders[0].price, resource)) {
                //     return false;
                // }

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


        let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
        if(room.terminal.store[RESOURCE_ENERGY] > 500 && room.terminal.store[RESOURCE_ENERGY] < 10000 && storage && storage.store[RESOURCE_ENERGY] < 40000) {

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



        if(!Memory.resource_requests) {
            Memory.resource_requests = {
                "XLHO2":[],
                "XKHO2":[],
                "XUH2O":[],
                "XLH2O":[],
                "XGHO2":[],
                "XZHO2":[],
                "XZH2O":[]
            };
        }
        let boostsToNeed = [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
                            RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
                            RESOURCE_CATALYZED_UTRIUM_ACID,
                            RESOURCE_CATALYZED_LEMERGIUM_ACID,
                            RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
                            RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
                            RESOURCE_CATALYZED_ZYNTHIUM_ACID];

        for(let boost of boostsToNeed) {
            if(storage && storage.store[boost] < 10000 && room.terminal.store[boost] < 3000) {
                if(!Memory.resource_requests[boost].includes(room.name)) {
                    Memory.resource_requests[boost].push(room.name);
                }
            }
            else if(Memory.resource_requests[boost].length > 0) {
                Memory.resource_requests[boost] = Memory.resource_requests[boost].filter(function (roomName) {return roomName !== room.name;});
            }
        }


        for(let boost of boostsToNeed) {
            if(room.terminal && room.terminal.store[boost] > 500 && storage && storage.store[boost] > 20000) {
                if(Memory.resource_requests[boost].length > 0) {
                    for(let roomName of Memory.resource_requests[boost]) {
                        if(roomName !== room.name) {
                            let roomObj = Game.rooms[roomName];
                            if(roomObj && roomObj.controller && roomObj.controller.level >= 6) {
                                let theirTerminal = roomObj.terminal;
                                let theirStorage:any = Game.getObjectById(roomObj.memory.Structures.storage);
                                if(theirTerminal && theirStorage && theirTerminal.store.getFreeCapacity() > 10000 && theirStorage.store.getFreeCapacity() > 10000) {
                                    room.terminal.send(boost, 500, roomName, "enjoy this " + boost + " other room!");
                                    console.log("sending", roomName, "500", boost)
                                    return;
                                }
                            }
                            else {
                                Memory.resource_requests[boost] = Memory.resource_requests[boost].filter(function (name) {return name !== roomName;});
                            }
                        }
                    }
                }
            }
        }




        if(room.terminal.store[RESOURCE_CONDENSATE] >= 10) {
            let result = sell_resource(RESOURCE_CONDENSATE, 999, 10);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_CONCENTRATE] >= 10) {
            let result = sell_resource(RESOURCE_CONCENTRATE, 9999, 10);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_CONCENTRATE] >= 2) {
            let result = sell_resource(RESOURCE_CONCENTRATE, 9999, 2);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_EXTRACT] >= 5) {
            let result = sell_resource(RESOURCE_EXTRACT, 80000, 5);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_EXTRACT] >= 1) {
            let result = sell_resource(RESOURCE_EXTRACT, 80000, 1);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_SPIRIT] >= 1) {
            let result = sell_resource(RESOURCE_SPIRIT, 199999, 1);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_EMANATION] >= 1) {
            let result = sell_resource(RESOURCE_EMANATION, 800000, 1);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_ESSENCE] >= 1) {
            let result = sell_resource(RESOURCE_ESSENCE, 2000000, 1);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_CONDENSATE] > 0) {
            let result = sell_resource(RESOURCE_CONDENSATE, 999, room.terminal.store[RESOURCE_CONDENSATE]);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_CONCENTRATE] > 0) {
            let result = sell_resource(RESOURCE_CONCENTRATE, 9999, room.terminal.store[RESOURCE_CONCENTRATE]);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_WIRE] >= 10) {
            let result = sell_resource(RESOURCE_WIRE, 999, 10);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_SWITCH] >= 10) {
            let result = sell_resource(RESOURCE_SWITCH, 9999, 10);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_SWITCH] >= 2) {
            let result = sell_resource(RESOURCE_SWITCH, 9999, 2);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_TRANSISTOR] >= 5) {
            let result = sell_resource(RESOURCE_TRANSISTOR, 80000, 5);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_TRANSISTOR] >= 1) {
            let result = sell_resource(RESOURCE_TRANSISTOR, 80000, 1);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_MICROCHIP] >= 1) {
            let result = sell_resource(RESOURCE_MICROCHIP, 199999, 1);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_CIRCUIT] >= 1) {
            let result = sell_resource(RESOURCE_CIRCUIT, 800000, 1);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_DEVICE] >= 1) {
            let result = sell_resource(RESOURCE_DEVICE, 2000000, 1);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_WIRE] > 0) {
            let result = sell_resource(RESOURCE_WIRE, 999, room.terminal.store[RESOURCE_WIRE]);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_SWITCH] > 0) {
            let result = sell_resource(RESOURCE_SWITCH, 9999, room.terminal.store[RESOURCE_SWITCH]);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_CELL] >= 10) {
            let result = sell_resource(RESOURCE_CELL, 999, 10);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_PHLEGM] >= 10) {
            let result = sell_resource(RESOURCE_PHLEGM, 9999, 10);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_PHLEGM] >= 2) {
            let result = sell_resource(RESOURCE_PHLEGM, 9999, 2);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_TISSUE] >= 5) {
            let result = sell_resource(RESOURCE_TISSUE, 80000, 5);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_TISSUE] >= 1) {
            let result = sell_resource(RESOURCE_TISSUE, 80000, 1);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_MUSCLE] >= 1) {
            let result = sell_resource(RESOURCE_MUSCLE, 199999, 1);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_ORGANOID] >= 1) {
            let result = sell_resource(RESOURCE_ORGANOID, 800000, 1);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_ORGANISM] >= 1) {
            let result = sell_resource(RESOURCE_ORGANISM, 2000000, 1);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_CELL] > 0) {
            let result = sell_resource(RESOURCE_CELL, 999, room.terminal.store[RESOURCE_CELL]);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_PHLEGM] > 0) {
            let result = sell_resource(RESOURCE_PHLEGM, 9999, room.terminal.store[RESOURCE_PHLEGM]);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_ALLOY] >= 10) {
            let result = sell_resource(RESOURCE_ALLOY, 999, 10);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_TUBE] >= 10) {
            let result = sell_resource(RESOURCE_TUBE, 9999, 10);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_TUBE] >= 2) {
            let result = sell_resource(RESOURCE_TUBE, 9999, 2);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_FIXTURES] >= 5) {
            let result = sell_resource(RESOURCE_FIXTURES, 80000, 5);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_FIXTURES] >= 1) {
            let result = sell_resource(RESOURCE_FIXTURES, 80000, 1);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_FRAME] >= 1) {
            let result = sell_resource(RESOURCE_FRAME, 199999, 1);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_HYDRAULICS] >= 1) {
            let result = sell_resource(RESOURCE_HYDRAULICS, 800000, 1);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_MACHINE] >= 1) {
            let result = sell_resource(RESOURCE_MACHINE, 2000000, 1);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_ALLOY] > 0) {
            let result = sell_resource(RESOURCE_ALLOY, 999, room.terminal.store[RESOURCE_ALLOY]);
            if(result == 0) {
                return;
            }
        }
        if(room.terminal.store[RESOURCE_TUBE] > 0) {
            let result = sell_resource(RESOURCE_TUBE, 9999, room.terminal.store[RESOURCE_TUBE]);
            if(result == 0) {
                return;
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
            let OrderPrice = 50000;

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
    let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
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

    let targetRampRoom = Memory.targetRampRoom;
    if(targetRampRoom && Game.time % 20 == 0 && room.name != targetRampRoom && Game.rooms[targetRampRoom] && Game.rooms[targetRampRoom].controller && Game.rooms[targetRampRoom].controller.my && Game.rooms[targetRampRoom].controller.level >= 6 &&
        Game.rooms[targetRampRoom].terminal && Game.rooms[targetRampRoom].terminal.store[RESOURCE_ENERGY] < 80000 && Game.rooms[targetRampRoom].terminal.store.getFreeCapacity() > 50000) {
            let theirRoom:any = Game.rooms[targetRampRoom];
            let theirStorage = Game.getObjectById(theirRoom.memory.Structures.storage) || theirRoom.findStorage();
            if(theirStorage && theirStorage.store[RESOURCE_ENERGY] < 455000 && room.terminal.store[RESOURCE_ENERGY] >= 40000 && storage && storage.store[RESOURCE_ENERGY] > 275000) {
                room.terminal.send(RESOURCE_ENERGY, 10000, targetRampRoom, "enjoy this energy, other room!");
                console.log("sending room", targetRampRoom, "10000 energy")
            }
    }
    // Game.time % 10 == 0 && targetRampRoom && targetRampRoom == room.name && room.terminal.store[RESOURCE_ENERGY] < 150000 && Game.market.credits > 100000000 ||
    if(Game.time % 50 == 0 && storage && storage.store[RESOURCE_ENERGY] < 10000 && room.terminal.store[RESOURCE_ENERGY] < 50000 && Game.market.credits > 1000000) {
        let foundInRoomEnergyOrder = false;

        let Orders = Game.market.orders;
        for(let orderID in Orders) {
            let order = Game.market.orders[orderID];


            if(order.resourceType == RESOURCE_ENERGY && order.type == ORDER_BUY && order.roomName == room.name) {
                foundInRoomEnergyOrder = true;
            }

            if(order.roomName == room.name && order.resourceType == RESOURCE_ENERGY && order.type == ORDER_BUY && order.amount <= 1000 && storage && storage.store[RESOURCE_ENERGY] < 10000) {
                Game.market.extendOrder(orderID, 20000);
            }
        }

        if(!foundInRoomEnergyOrder) {
            Game.market.createOrder({
                type: ORDER_BUY,
                resourceType: RESOURCE_ENERGY,
                price: 5.889,
                totalAmount: 20000,
                roomName: room.name
            });
        }
    }
}
export default market;


function price_checker(price, resource) {
    if(resource == RESOURCE_CONDENSATE && price < 999) {
        return false;
    }
    else if(resource == RESOURCE_CONCENTRATE && price < 9999) {
        return false;
    }
    else if(resource == RESOURCE_EXTRACT && price < 80000) {
        return false;
    }
    else if(resource == RESOURCE_SPIRIT && price < 199999) {
        return false;
    }
    else if(resource == RESOURCE_EMANATION && price < 800000) {
        return false;
    }
    else if(resource == RESOURCE_ESSENCE && price < 2000000) {
        return false;
    }


    return true;
}
