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

    let lab1Input = RESOURCE_LEMERGIUM;
    let lab2Input = RESOURCE_HYDROGEN;

    if(outputLab && outputLab.store.getFreeCapacity() != 0) {
        if(pair1Lab1 && pair1Lab1.store[lab1Input] >= 5 && pair1Lab2 && pair1Lab2.store[lab2Input] >= 5) {
            outputLab.runReaction(pair1Lab1, pair1Lab2);
        }
    }

    // if(resultLab.store[RESOURCE_UTRIUM_HYDRIDE] <= 2995 && firstLab.store[RESOURCE_UTRIUM] >= 5 && secondLab.store[RESOURCE_HYDROGEN] >= 5) {
    //     resultLab.runReaction(firstLab, secondLab);
    // }


}

export default labs;
// module.exports = market;
