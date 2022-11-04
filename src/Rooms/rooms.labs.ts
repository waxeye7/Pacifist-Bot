function labs(room) {
    if(!room.memory.labs || Game.time % 120 == 0) {

        if(!room.memory.labs) {
            room.memory.labs = {};
        }

        let storage = Game.getObjectById(room.memory.storage) || room.findStorage();
        let LabsInRoom = room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_LAB});

        if(room.controller.level >= 6 && LabsInRoom.length >= 3) {

            let outputLabPosition = new RoomPosition(storage.pos.x - 5, storage.pos.y + 1, room.name);
            let lookForOutputLabPosition = outputLabPosition.lookFor(LOOK_STRUCTURES);
            if(lookForOutputLabPosition.length) {
                for(let building of lookForOutputLabPosition) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.outputLab = building.id;
                        // outputLab = building;
                    }
                }
            }

            let pair1Lab1Position = new RoomPosition(storage.pos.x - 3, storage.pos.y + 1, room.name);
            let lookForPair1Lab1Position = pair1Lab1Position.lookFor(LOOK_STRUCTURES);
            if(lookForPair1Lab1Position.length) {
                for(let building of lookForPair1Lab1Position) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.pair1Lab1 = building.id;
                    }
                }
            }

            let pair1Lab2Position = new RoomPosition(storage.pos.x - 4, storage.pos.y, room.name);
            let lookForPair1Lab2Position = pair1Lab2Position.lookFor(LOOK_STRUCTURES);
            if(lookForPair1Lab2Position.length) {
                for(let building of lookForPair1Lab2Position) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.pair1Lab2 = building.id;
                    }
                }
            }

        }

        if(room.controller.level >= 7 && LabsInRoom.length >= 6) {

            let pair2Lab1Position = new RoomPosition(storage.pos.x - 4, storage.pos.y + 2, room.name);
            let lookForPair2Lab1Position = pair2Lab1Position.lookFor(LOOK_STRUCTURES);
            if(lookForPair2Lab1Position.length) {
                for(let building of lookForPair2Lab1Position) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.pair2Lab1 = building.id;
                    }
                }
            }

            let pair2Lab2Position = new RoomPosition(storage.pos.x - 5, storage.pos.y + 3, room.name);
            let lookForPair2Lab2Position = pair2Lab2Position.lookFor(LOOK_STRUCTURES);
            if(lookForPair2Lab2Position.length) {
                for(let building of lookForPair2Lab2Position) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.pair2Lab2 = building.id;
                    }
                }
            }

            let boostLabPosition = new RoomPosition(storage.pos.x - 1, storage.pos.y + 3, room.name);
            let lookForBoostLab = boostLabPosition.lookFor(LOOK_STRUCTURES);
            if(lookForBoostLab.length) {
                for(let building of lookForBoostLab) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.boostLab = building.id;
                    }
                }
            }

        }

        if(room.controller.level == 8 && LabsInRoom.length == 10) {

            let pair3Lab1Position = new RoomPosition(storage.pos.x - 6, storage.pos.y + 2, room.name);
            let lookForPair3Lab1Position = pair3Lab1Position.lookFor(LOOK_STRUCTURES);
            if(lookForPair3Lab1Position.length) {
                for(let building of lookForPair3Lab1Position) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.pair3Lab1 = building.id;
                    }
                }
            }

            let pair3Lab2Position = new RoomPosition(storage.pos.x - 7, storage.pos.y + 1, room.name);
            let lookForPair3Lab2Position = pair3Lab2Position.lookFor(LOOK_STRUCTURES);
            if(lookForPair3Lab2Position.length) {
                for(let building of lookForPair3Lab2Position) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.pair3Lab2 = building.id;
                    }
                }
            }

            let pair4Lab1Position = new RoomPosition(storage.pos.x - 6, storage.pos.y, room.name);
            let lookForPair4Lab1Position = pair4Lab1Position.lookFor(LOOK_STRUCTURES);
            if(lookForPair4Lab1Position.length) {
                for(let building of lookForPair4Lab1Position) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.pair4Lab1 = building.id;
                    }
                }
            }

            let pair4Lab2Position = new RoomPosition(storage.pos.x - 5, storage.pos.y - 1, room.name);
            let lookForPair4Lab2Position = pair4Lab2Position.lookFor(LOOK_STRUCTURES);
            if(lookForPair4Lab2Position.length) {
                for(let building of lookForPair4Lab2Position) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.pair4Lab2 = building.id;
                    }
                }
            }

        }
    }

    let outputLab;
    let boostLab;
    let pair1Lab1;
    let pair1Lab2;
    let pair2Lab1;
    let pair2Lab2;
    let pair3Lab1;
    let pair3Lab2;
    let pair4Lab1;
    let pair4Lab2;

    let labPairs = [];

    if(room.memory.labs.outputLab) {
        outputLab = Game.getObjectById(room.memory.labs.outputLab)
    }
    if(room.memory.labs.pair1Lab1) {
        pair1Lab1 = Game.getObjectById(room.memory.labs.pair1Lab1)
    }
    if(room.memory.labs.pair1Lab2) {
        pair1Lab2 = Game.getObjectById(room.memory.labs.pair1Lab2)
    }
    if(room.memory.labs.boostLab) {
        boostLab = Game.getObjectById(room.memory.labs.boostLab)
    }
    if(room.memory.labs.pair2Lab1) {
        pair2Lab1 = Game.getObjectById(room.memory.labs.pair2Lab1)
    }
    if(room.memory.labs.pair2Lab2) {
        pair2Lab2 = Game.getObjectById(room.memory.labs.pair2Lab2)
    }
    if(room.memory.labs.pair3Lab1) {
        pair3Lab1 = Game.getObjectById(room.memory.labs.pair3Lab1)
    }
    if(room.memory.labs.pair3Lab2) {
        pair3Lab2 = Game.getObjectById(room.memory.labs.pair3Lab2)
    }
    if(room.memory.labs.pair4Lab1) {
        pair4Lab1 = Game.getObjectById(room.memory.labs.pair4Lab1)
    }
    if(room.memory.labs.pair4Lab2) {
        pair4Lab2 = Game.getObjectById(room.memory.labs.pair4Lab2)
    }


    if(pair1Lab1 && pair1Lab2) {
        labPairs.push([pair1Lab1, pair1Lab2])
    }
    if(pair2Lab1 && pair2Lab2) {
        labPairs.push([pair2Lab1, pair2Lab2])
    }
    if(pair3Lab1 && pair3Lab2) {
        labPairs.push([pair3Lab1, pair3Lab2])
    }
    if(pair4Lab1 && pair4Lab2) {
        labPairs.push([pair4Lab1, pair4Lab2])
    }

    let storage = Game.getObjectById(room.memory.storage) || room.findStorage();

    if(!room.memory.labs.status) {
        room.memory.labs.status = {};
    }
    if(!room.memory.labs.status.currentOutput) {
        room.memory.labs.status.currentOutput = false;
    }
    if(!room.memory.labs.status.lab1Input) {
        room.memory.labs.status.lab1Input = false;
    }
    if(!room.memory.labs.status.lab2Input) {
        room.memory.labs.status.lab2Input = false;
    }


    let lab1Input:MineralConstant | MineralCompoundConstant | any = RESOURCE_LEMERGIUM;
    let lab2Input:MineralConstant | MineralCompoundConstant | any = RESOURCE_HYDROGEN;
    let currentOutput:MineralConstant | MineralCompoundConstant | any = RESOURCE_LEMERGIUM_HYDRIDE;

    if(storage && storage.store[RESOURCE_LEMERGIUM_HYDRIDE] > 5000) {
        lab1Input = RESOURCE_UTRIUM;
        lab2Input = RESOURCE_HYDROGEN;
        currentOutput = RESOURCE_UTRIUM_HYDRIDE;
    }
    else if(storage && storage.store[RESOURCE_LEMERGIUM_HYDRIDE] > 5000 && storage.store[RESOURCE_UTRIUM_HYDRIDE] > 5000) {
        lab1Input = RESOURCE_OXYGEN;
        lab2Input = RESOURCE_HYDROGEN;
        currentOutput = RESOURCE_HYDROXIDE;
    }
    else if(storage && storage.store[RESOURCE_LEMERGIUM_HYDRIDE] > 1000 && storage.store[RESOURCE_HYDROXIDE] > 1000) {
        lab1Input = RESOURCE_LEMERGIUM_HYDRIDE;
        lab2Input = RESOURCE_HYDROXIDE;
        currentOutput = RESOURCE_LEMERGIUM_ACID;
    }


    if(room.memory.labs.status.lab1Input != lab1Input) {
        room.memory.labs.status.lab1Input = lab1Input;
    }
    if(room.memory.labs.status.lab2Input != lab2Input) {
        room.memory.labs.status.lab2Input = lab2Input;
    }
    if(room.memory.labs.status.currentOutput != currentOutput) {
        room.memory.labs.status.currentOutput = currentOutput;
    }



    if(lab1Input === RESOURCE_HYDROGEN && lab2Input === RESOURCE_OXYGEN || lab2Input === RESOURCE_HYDROGEN && lab1Input === RESOURCE_OXYGEN) {
        room.memory.labs.status.currentOutput = RESOURCE_HYDROXIDE;
    }
    else if(lab1Input === RESOURCE_ZYNTHIUM && lab2Input === RESOURCE_KEANIUM || lab2Input === RESOURCE_ZYNTHIUM && lab1Input === RESOURCE_KEANIUM) {
        room.memory.labs.status.currentOutput = RESOURCE_ZYNTHIUM_KEANITE;
    }
    else if(lab1Input === RESOURCE_UTRIUM && lab2Input === RESOURCE_LEMERGIUM || lab2Input === RESOURCE_UTRIUM && lab1Input === RESOURCE_LEMERGIUM) {
        room.memory.labs.status.currentOutput = RESOURCE_UTRIUM_LEMERGITE;
    }
    else if(lab1Input === RESOURCE_ZYNTHIUM_KEANITE && lab2Input === RESOURCE_UTRIUM_LEMERGITE || lab2Input === RESOURCE_ZYNTHIUM_KEANITE && lab1Input === RESOURCE_UTRIUM_LEMERGITE) {
        room.memory.labs.status.currentOutput = RESOURCE_GHODIUM;
    }
    else if(lab1Input === RESOURCE_UTRIUM && lab2Input === RESOURCE_HYDROGEN || lab2Input === RESOURCE_UTRIUM && lab1Input === RESOURCE_HYDROGEN) {
        room.memory.labs.status.currentOutput = RESOURCE_UTRIUM_HYDRIDE;
    }
    else if(lab1Input === RESOURCE_UTRIUM && lab2Input === RESOURCE_OXYGEN || lab2Input === RESOURCE_UTRIUM && lab1Input === RESOURCE_OXYGEN) {
        room.memory.labs.status.currentOutput = RESOURCE_UTRIUM_OXIDE;
    }
    else if(lab1Input === RESOURCE_KEANIUM && lab2Input === RESOURCE_HYDROGEN || lab2Input === RESOURCE_KEANIUM && lab1Input === RESOURCE_HYDROGEN) {
        room.memory.labs.status.currentOutput = RESOURCE_KEANIUM_HYDRIDE;
    }
    else if(lab1Input === RESOURCE_KEANIUM && lab2Input === RESOURCE_OXYGEN || lab2Input === RESOURCE_KEANIUM && lab1Input === RESOURCE_OXYGEN) {
        room.memory.labs.status.currentOutput = RESOURCE_KEANIUM_OXIDE;
    }
    else if(lab1Input === RESOURCE_LEMERGIUM && lab2Input === RESOURCE_HYDROGEN || lab2Input === RESOURCE_LEMERGIUM && lab1Input === RESOURCE_HYDROGEN) {
        room.memory.labs.status.currentOutput = RESOURCE_LEMERGIUM_HYDRIDE;
    }
    else if(lab1Input === RESOURCE_LEMERGIUM && lab2Input === RESOURCE_OXYGEN || lab2Input === RESOURCE_LEMERGIUM && lab1Input === RESOURCE_OXYGEN) {
        room.memory.labs.status.currentOutput = RESOURCE_LEMERGIUM_OXIDE;
    }
    else if(lab1Input === RESOURCE_ZYNTHIUM && lab2Input === RESOURCE_HYDROGEN || lab2Input === RESOURCE_ZYNTHIUM && lab1Input === RESOURCE_HYDROGEN) {
        room.memory.labs.status.currentOutput = RESOURCE_ZYNTHIUM_HYDRIDE;
    }
    else if(lab1Input === RESOURCE_ZYNTHIUM && lab2Input === RESOURCE_OXYGEN || lab2Input === RESOURCE_ZYNTHIUM && lab1Input === RESOURCE_OXYGEN) {
        room.memory.labs.status.currentOutput = RESOURCE_ZYNTHIUM_OXIDE;
    }
    else if(lab1Input === RESOURCE_GHODIUM && lab2Input === RESOURCE_HYDROGEN || lab2Input === RESOURCE_GHODIUM && lab1Input === RESOURCE_HYDROGEN) {
        room.memory.labs.status.currentOutput = RESOURCE_GHODIUM_HYDRIDE;
    }
    else if(lab1Input === RESOURCE_GHODIUM && lab2Input === RESOURCE_OXYGEN || lab2Input === RESOURCE_GHODIUM && lab1Input === RESOURCE_OXYGEN) {
        room.memory.labs.status.currentOutput = RESOURCE_GHODIUM_OXIDE;
    }
    else if(lab1Input === RESOURCE_UTRIUM_HYDRIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_UTRIUM_HYDRIDE && lab1Input === RESOURCE_HYDROXIDE) {
        room.memory.labs.status.currentOutput = RESOURCE_UTRIUM_ACID;
    }
    else if(lab1Input === RESOURCE_UTRIUM_OXIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_UTRIUM_OXIDE && lab1Input === RESOURCE_HYDROXIDE) {
        room.memory.labs.status.currentOutput = RESOURCE_UTRIUM_ALKALIDE;
    }
    else if(lab1Input === RESOURCE_KEANIUM_HYDRIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_KEANIUM_HYDRIDE && lab1Input === RESOURCE_HYDROXIDE) {
        room.memory.labs.status.currentOutput = RESOURCE_KEANIUM_ACID;
    }
    else if(lab1Input === RESOURCE_KEANIUM_OXIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_KEANIUM_OXIDE && lab1Input === RESOURCE_HYDROXIDE) {
        room.memory.labs.status.currentOutput = RESOURCE_KEANIUM_ALKALIDE;
    }
    else if(lab1Input === RESOURCE_LEMERGIUM_HYDRIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_LEMERGIUM_HYDRIDE && lab1Input === RESOURCE_HYDROXIDE) {
        room.memory.labs.status.currentOutput = RESOURCE_LEMERGIUM_ACID;
    }
    else if(lab1Input === RESOURCE_LEMERGIUM_OXIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_LEMERGIUM_OXIDE && lab1Input === RESOURCE_HYDROXIDE) {
        room.memory.labs.status.currentOutput = RESOURCE_LEMERGIUM_ALKALIDE;
    }
    else if(lab1Input === RESOURCE_ZYNTHIUM_HYDRIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_ZYNTHIUM_HYDRIDE && lab1Input === RESOURCE_HYDROXIDE) {
        room.memory.labs.status.currentOutput = RESOURCE_ZYNTHIUM_ACID;
    }
    else if(lab1Input === RESOURCE_ZYNTHIUM_OXIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_ZYNTHIUM_OXIDE && lab1Input === RESOURCE_HYDROXIDE) {
        room.memory.labs.status.currentOutput = RESOURCE_ZYNTHIUM_ALKALIDE;
    }
    else if(lab1Input === RESOURCE_GHODIUM_HYDRIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_GHODIUM_HYDRIDE && lab1Input === RESOURCE_HYDROXIDE) {
        room.memory.labs.status.currentOutput = RESOURCE_GHODIUM_ACID;
    }
    else if(lab1Input === RESOURCE_GHODIUM_OXIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_GHODIUM_OXIDE && lab1Input === RESOURCE_HYDROXIDE) {
        room.memory.labs.status.currentOutput = RESOURCE_GHODIUM_ALKALIDE;
    }
    else if(lab1Input === RESOURCE_UTRIUM_ACID && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_UTRIUM_ACID && lab1Input === RESOURCE_CATALYST) {
        room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_UTRIUM_ACID;
    }
    else if(lab1Input === RESOURCE_UTRIUM_ALKALIDE && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_UTRIUM_ALKALIDE && lab1Input === RESOURCE_CATALYST) {
        room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_UTRIUM_ALKALIDE;
    }
    else if(lab1Input === RESOURCE_KEANIUM_ACID && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_KEANIUM_ACID && lab1Input === RESOURCE_CATALYST) {
        room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_KEANIUM_ACID;
    }
    else if(lab1Input === RESOURCE_KEANIUM_ALKALIDE && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_KEANIUM_ALKALIDE && lab1Input === RESOURCE_CATALYST) {
        room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_KEANIUM_ALKALIDE;
    }
    else if(lab1Input === RESOURCE_LEMERGIUM_ACID && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_LEMERGIUM_ACID && lab1Input === RESOURCE_CATALYST) {
        room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ACID;
    }
    else if(lab1Input === RESOURCE_LEMERGIUM_ALKALIDE && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_LEMERGIUM_ALKALIDE && lab1Input === RESOURCE_CATALYST) {
        room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE;
    }
    else if(lab1Input === RESOURCE_ZYNTHIUM_ACID && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_ZYNTHIUM_ACID && lab1Input === RESOURCE_CATALYST) {
        room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ACID;
    }
    else if(lab1Input === RESOURCE_ZYNTHIUM_ALKALIDE && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_ZYNTHIUM_ALKALIDE && lab1Input === RESOURCE_CATALYST) {
        room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE;
    }
    else if(lab1Input === RESOURCE_GHODIUM_ACID && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_GHODIUM_ACID && lab1Input === RESOURCE_CATALYST) {
        room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_GHODIUM_ACID;
    }
    else if(lab1Input === RESOURCE_GHODIUM_ALKALIDE && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_GHODIUM_ALKALIDE && lab1Input === RESOURCE_CATALYST) {
        room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_GHODIUM_ALKALIDE;
    }




    if(outputLab && outputLab.store.getFreeCapacity() != 0) {
        for(let labPair of labPairs) {
            if(labPair[0] && labPair[0].store[lab1Input] >= 5 && labPair[1] && labPair[1].store[lab2Input] >= 5) {
                outputLab.runReaction(labPair[0], labPair[1]);
            }
        }
    }

    // if(resultLab.store[RESOURCE_UTRIUM_HYDRIDE] <= 2995 && firstLab.store[RESOURCE_UTRIUM] >= 5 && secondLab.store[RESOURCE_HYDROGEN] >= 5) {
    //     resultLab.runReaction(firstLab, secondLab);
    // }


}

export default labs;
// module.exports = market;
