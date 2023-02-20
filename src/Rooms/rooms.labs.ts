function labs(room) {
    if(!room.memory.labs || Game.time % 120 == 0) {

        if(!room.memory.labs) {
            room.memory.labs = {};
        }

        let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
        let LabsInRoom = room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_LAB});

        if(room.controller.level >= 6 && LabsInRoom.length >= 3) {


            let inputLab1Position = new RoomPosition(storage.pos.x - 4, storage.pos.y + 1, room.name);
            let lookForInputLab1Position = inputLab1Position.lookFor(LOOK_STRUCTURES);
            if(lookForInputLab1Position.length > 0) {
                for(let building of lookForInputLab1Position) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.inputLab1 = building.id;
                        break;
                    }
                }
            }
            if(room.memory.labs.inputLab1 == undefined) {
                let inputLab1Position = new RoomPosition(storage.pos.x + 4, storage.pos.y + 4, room.name);
                let lookForInputLab1Position = inputLab1Position.lookFor(LOOK_STRUCTURES);
                if(lookForInputLab1Position.length > 0) {
                    for(let building of lookForInputLab1Position) {
                        if(building.structureType == STRUCTURE_LAB) {
                            room.memory.labs.inputLab1 = building.id;
                            break;
                        }
                    }
                }
            }


            let inputLab2Position = new RoomPosition(storage.pos.x - 4, storage.pos.y + 2, room.name);
            let lookForInputLab2Position = inputLab2Position.lookFor(LOOK_STRUCTURES);
            if(lookForInputLab2Position.length) {
                for(let building of lookForInputLab2Position) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.inputLab2 = building.id;
                        break;
                    }
                }
            }
            if(room.memory.labs.inputLab2 == undefined) {
                let inputLab2Position = new RoomPosition(storage.pos.x + 4, storage.pos.y + 5, room.name);
                let lookForInputLab2Position = inputLab2Position.lookFor(LOOK_STRUCTURES);
                if(lookForInputLab2Position.length > 0) {
                    for(let building of lookForInputLab2Position) {
                        if(building.structureType == STRUCTURE_LAB) {
                            room.memory.labs.inputLab2 = building.id;
                            break;
                        }
                    }
                }
            }


            let outputLab1Position = new RoomPosition(storage.pos.x - 3, storage.pos.y, room.name);
            let lookForOutputLab1Position = outputLab1Position.lookFor(LOOK_STRUCTURES);
            if(lookForOutputLab1Position.length) {
                for(let building of lookForOutputLab1Position) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.outputLab1 = building.id;
                        break;
                    }
                }
            }
            if(room.memory.labs.outputLab1 == undefined) {
                let outputLab1Position = new RoomPosition(storage.pos.x + 3, storage.pos.y + 3, room.name);
                let lookForOutputLab1Position = outputLab1Position.lookFor(LOOK_STRUCTURES);
                if(lookForOutputLab1Position.length) {
                    for(let building of lookForOutputLab1Position) {
                        if(building.structureType == STRUCTURE_LAB) {
                            room.memory.labs.outputLab1 = building.id;
                            break;
                        }
                    }
                }
            }



        }

        if(room.controller.level >= 7 && LabsInRoom.length >= 6) {

            let outputLab2Position = new RoomPosition(storage.pos.x - 3, storage.pos.y + 1, room.name);
            let lookForOutputLab2Position = outputLab2Position.lookFor(LOOK_STRUCTURES);
            if(lookForOutputLab2Position.length) {
                for(let building of lookForOutputLab2Position) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.outputLab2 = building.id;
                        break;
                    }
                }
            }
            if(room.memory.labs.outputLab2 == undefined) {
                let outputLab2Position = new RoomPosition(storage.pos.x + 3, storage.pos.y + 4, room.name);
                let lookForOutputLab2Position = outputLab2Position.lookFor(LOOK_STRUCTURES);
                if(lookForOutputLab2Position.length) {
                    for(let building of lookForOutputLab2Position) {
                        if(building.structureType == STRUCTURE_LAB) {
                            room.memory.labs.outputLab2 = building.id;
                            break;
                        }
                    }
                }
            }



            let outputLab3Position = new RoomPosition(storage.pos.x - 3, storage.pos.y + 2, room.name);
            let lookForOutputLab3Position = outputLab3Position.lookFor(LOOK_STRUCTURES);
            if(lookForOutputLab3Position.length) {
                for(let building of lookForOutputLab3Position) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.outputLab3 = building.id;
                        break;
                    }
                }
            }
            if(room.memory.labs.outputLab3 == undefined) {
                let outputLab3Position = new RoomPosition(storage.pos.x + 3, storage.pos.y + 5, room.name);
                let lookForOutputLab3Position = outputLab3Position.lookFor(LOOK_STRUCTURES);
                if(lookForOutputLab3Position.length) {
                    for(let building of lookForOutputLab3Position) {
                        if(building.structureType == STRUCTURE_LAB) {
                            room.memory.labs.outputLab3 = building.id;
                            break;
                        }
                    }
                }
            }



            let outputLab4Position = new RoomPosition(storage.pos.x - 3, storage.pos.y + 3, room.name);
            let lookForOutputLab4Position = outputLab4Position.lookFor(LOOK_STRUCTURES);
            if(lookForOutputLab4Position.length) {
                for(let building of lookForOutputLab4Position) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.outputLab4 = building.id;
                        break;
                    }
                }
            }
            if(room.memory.labs.outputLab4 == undefined) {
                let outputLab4Position = new RoomPosition(storage.pos.x + 3, storage.pos.y + 6, room.name);
                let lookForOutputLab4Position = outputLab4Position.lookFor(LOOK_STRUCTURES);
                if(lookForOutputLab4Position.length) {
                    for(let building of lookForOutputLab4Position) {
                        if(building.structureType == STRUCTURE_LAB) {
                            room.memory.labs.outputLab4 = building.id;
                            break;
                        }
                    }
                }
            }


        }

        if(room.controller.level == 8 && LabsInRoom.length == 10) {

            let outputLab5Position = new RoomPosition(storage.pos.x - 5, storage.pos.y + 3, room.name);
            let lookForOutputLab5Position = outputLab5Position.lookFor(LOOK_STRUCTURES);
            if(lookForOutputLab5Position.length) {
                for(let building of lookForOutputLab5Position) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.outputLab5 = building.id;
                        break;
                    }
                }
            }
            if(room.memory.labs.outputLab5 == undefined) {
                let outputLab5Position = new RoomPosition(storage.pos.x + 5, storage.pos.y + 3, room.name);
                let lookForOutputLab5Position = outputLab5Position.lookFor(LOOK_STRUCTURES);
                if(lookForOutputLab5Position.length) {
                    for(let building of lookForOutputLab5Position) {
                        if(building.structureType == STRUCTURE_LAB) {
                            room.memory.labs.outputLab5 = building.id;
                            break;
                        }
                    }
                }
            }


            let outputLab6Position = new RoomPosition(storage.pos.x - 5, storage.pos.y + 2, room.name);
            let lookForOutputLab6Position = outputLab6Position.lookFor(LOOK_STRUCTURES);
            if(lookForOutputLab6Position.length) {
                for(let building of lookForOutputLab6Position) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.outputLab6 = building.id;
                        break;
                    }
                }
            }
            if(room.memory.labs.outputLab6 == undefined) {
                let outputLab6Position = new RoomPosition(storage.pos.x + 5, storage.pos.y + 4, room.name);
                let lookForOutputLab6Position = outputLab6Position.lookFor(LOOK_STRUCTURES);
                if(lookForOutputLab6Position.length) {
                    for(let building of lookForOutputLab6Position) {
                        if(building.structureType == STRUCTURE_LAB) {
                            room.memory.labs.outputLab6 = building.id;
                            break;
                        }
                    }
                }
            }



            let outputLab7Position = new RoomPosition(storage.pos.x - 5, storage.pos.y + 1, room.name);
            let lookForOutputLab7Position = outputLab7Position.lookFor(LOOK_STRUCTURES);
            if(lookForOutputLab7Position.length) {
                for(let building of lookForOutputLab7Position) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.outputLab7 = building.id;
                        break;
                    }
                }
            }
            if(room.memory.labs.outputLab7 == undefined) {
                let outputLab7Position = new RoomPosition(storage.pos.x + 5, storage.pos.y + 5, room.name);
                let lookForOutputLab7Position = outputLab7Position.lookFor(LOOK_STRUCTURES);
                if(lookForOutputLab7Position.length) {
                    for(let building of lookForOutputLab7Position) {
                        if(building.structureType == STRUCTURE_LAB) {
                            room.memory.labs.outputLab7 = building.id;
                            break;
                        }
                    }
                }
            }


            let outputLab8Position = new RoomPosition(storage.pos.x - 5, storage.pos.y, room.name);
            let lookForOutputLab8Position = outputLab8Position.lookFor(LOOK_STRUCTURES);
            if(lookForOutputLab8Position.length) {
                for(let building of lookForOutputLab8Position) {
                    if(building.structureType == STRUCTURE_LAB) {
                        room.memory.labs.outputLab8 = building.id;
                        break;
                    }
                }
            }
            if(room.memory.labs.outputLab8 == undefined) {
                let outputLab8Position = new RoomPosition(storage.pos.x + 5, storage.pos.y + 6, room.name);
                let lookForOutputLab8Position = outputLab8Position.lookFor(LOOK_STRUCTURES);
                if(lookForOutputLab8Position.length) {
                    for(let building of lookForOutputLab8Position) {
                        if(building.structureType == STRUCTURE_LAB) {
                            room.memory.labs.outputLab8 = building.id;
                            break;
                        }
                    }
                }
            }
        }
    }


    let inputLab1;
    let inputLab2;
    let outputLab1;
    let outputLab2;
    let outputLab3;
    let outputLab4;
    let outputLab5;
    let outputLab6;
    let outputLab7;
    let outputLab8;

    if(room.memory.labs.inputLab1) {
        inputLab1 = Game.getObjectById(room.memory.labs.inputLab1)
    }
    if(room.memory.labs.inputLab2) {
        inputLab2 = Game.getObjectById(room.memory.labs.inputLab2)
    }
    if(room.memory.labs.outputLab1) {
        outputLab1 = Game.getObjectById(room.memory.labs.outputLab1)
    }
    if(room.memory.labs.outputLab2) {
        outputLab2 = Game.getObjectById(room.memory.labs.outputLab2)
    }
    if(room.memory.labs.outputLab3) {
        outputLab3 = Game.getObjectById(room.memory.labs.outputLab3)
    }
    if(room.memory.labs.outputLab4) {
        outputLab4 = Game.getObjectById(room.memory.labs.outputLab4)
    }
    if(room.memory.labs.outputLab5) {
        outputLab5 = Game.getObjectById(room.memory.labs.outputLab5)
    }
    if(room.memory.labs.outputLab6) {
        outputLab6 = Game.getObjectById(room.memory.labs.outputLab6)
    }
    if(room.memory.labs.outputLab7) {
        outputLab7 = Game.getObjectById(room.memory.labs.outputLab7)
    }
    if(room.memory.labs.outputLab8) {
        outputLab8 = Game.getObjectById(room.memory.labs.outputLab8)
    }

    if(Game.time % 97 == 0) {
        let spawns = room.find(FIND_MY_SPAWNS);
        let found = false;
        for(let spawn of spawns) {
            if(spawn.spawning) {
                found = true;
                break;
            }
        }
        if(!found) {
            if(room.memory.spawn_list.length == 0) {
                room.memory.labs.boost = {};
            }
        }
    }

    let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();

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

    if((!room.memory.labs.status.lab1Input || !room.memory.labs.status.lab2Input || !room.memory.labs.status.currentOutput || Game.time % 500 == 0) && room.terminal) {
        let lab1Input:MineralConstant | MineralCompoundConstant | any;
        let lab2Input:MineralConstant | MineralCompoundConstant | any;
        let currentOutput;
        if(outputLab1 && outputLab1.mineralType) {
            currentOutput = outputLab1.mineralType;
        }
        else {
            currentOutput = false;
        }

        let terminal = room.terminal;

        if((storage && storage.store[RESOURCE_HYDROXIDE] < 1000 && currentOutput != RESOURCE_HYDROXIDE ||
            storage && storage.store[RESOURCE_HYDROXIDE] < 10000 && currentOutput == RESOURCE_HYDROXIDE) &&
            terminal.store[RESOURCE_OXYGEN] + storage.store[RESOURCE_OXYGEN] >= 1000 && terminal.store[RESOURCE_HYDROGEN] + storage.store[RESOURCE_HYDROGEN] >= 1000) {
                lab1Input = RESOURCE_OXYGEN
                lab2Input = RESOURCE_HYDROGEN;
                currentOutput = RESOURCE_HYDROXIDE;
            }

        // chain to get catalyzed lemergium acid

        else if((storage && storage.store[RESOURCE_LEMERGIUM_HYDRIDE] < 1000 && currentOutput != RESOURCE_LEMERGIUM_HYDRIDE ||
            storage && storage.store[RESOURCE_LEMERGIUM_HYDRIDE] < 3000 && currentOutput == RESOURCE_LEMERGIUM_HYDRIDE) &&
            terminal.store[RESOURCE_LEMERGIUM] + storage.store[RESOURCE_LEMERGIUM] >= 1000 && terminal.store[RESOURCE_HYDROGEN] + storage.store[RESOURCE_HYDROGEN] >= 1000) {
                lab1Input = RESOURCE_LEMERGIUM
                lab2Input = RESOURCE_HYDROGEN;
                currentOutput = RESOURCE_LEMERGIUM_HYDRIDE;
            }

        else if((storage && storage.store[RESOURCE_LEMERGIUM_ACID] < 1000 && currentOutput != RESOURCE_LEMERGIUM_ACID ||
            storage && storage.store[RESOURCE_LEMERGIUM_ACID] < 3000 && currentOutput == RESOURCE_LEMERGIUM_ACID) &&
            terminal.store[RESOURCE_HYDROXIDE] + storage.store[RESOURCE_HYDROXIDE] >= 1000 && terminal.store[RESOURCE_LEMERGIUM_HYDRIDE] + storage.store[RESOURCE_LEMERGIUM_HYDRIDE] >= 1000) {
                lab1Input = RESOURCE_HYDROXIDE
                lab2Input = RESOURCE_LEMERGIUM_HYDRIDE;
                currentOutput = RESOURCE_LEMERGIUM_ACID;
            }

        else if(storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] < 10000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_LEMERGIUM_ACID] + storage.store[RESOURCE_LEMERGIUM_ACID] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_LEMERGIUM_ACID;
                currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ACID;
            }

        // chain to get catalyzed utrium acid

        else if((storage && storage.store[RESOURCE_UTRIUM_HYDRIDE] < 1000 && currentOutput != RESOURCE_UTRIUM_HYDRIDE ||
            storage && storage.store[RESOURCE_UTRIUM_HYDRIDE] < 3000 && currentOutput == RESOURCE_UTRIUM_HYDRIDE) &&
            terminal.store[RESOURCE_UTRIUM] + storage.store[RESOURCE_UTRIUM] >= 1000 && terminal.store[RESOURCE_HYDROGEN] + storage.store[RESOURCE_HYDROGEN] >= 1000) {
                lab1Input = RESOURCE_UTRIUM;
                lab2Input = RESOURCE_HYDROGEN;
                currentOutput = RESOURCE_UTRIUM_HYDRIDE;
            }

        else if((storage && storage.store[RESOURCE_UTRIUM_ACID] < 1000 && currentOutput != RESOURCE_UTRIUM_ACID ||
            storage && storage.store[RESOURCE_UTRIUM_ACID] < 3000 && currentOutput == RESOURCE_UTRIUM_ACID) &&
            terminal.store[RESOURCE_HYDROXIDE] + storage.store[RESOURCE_HYDROXIDE] >= 1000 && terminal.store[RESOURCE_UTRIUM_HYDRIDE] + storage.store[RESOURCE_UTRIUM_HYDRIDE] >= 1000) {
                lab1Input = RESOURCE_HYDROXIDE
                lab2Input = RESOURCE_UTRIUM_HYDRIDE;
                currentOutput = RESOURCE_UTRIUM_ACID;
            }

        else if(storage && storage.store[RESOURCE_CATALYZED_UTRIUM_ACID] < 10000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_UTRIUM_ACID] + storage.store[RESOURCE_UTRIUM_ACID] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_UTRIUM_ACID;
                currentOutput = RESOURCE_CATALYZED_UTRIUM_ACID;
            }

        // chain to get catalyzed zyn alk

        else if((storage && storage.store[RESOURCE_ZYNTHIUM_OXIDE] < 1000 && currentOutput != RESOURCE_ZYNTHIUM_OXIDE ||
            storage && storage.store[RESOURCE_ZYNTHIUM_OXIDE] < 3000 && currentOutput == RESOURCE_ZYNTHIUM_OXIDE) &&
            terminal.store[RESOURCE_OXYGEN] + storage.store[RESOURCE_OXYGEN] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM] + storage.store[RESOURCE_ZYNTHIUM] >= 1000) {
                lab1Input = RESOURCE_OXYGEN;
                lab2Input = RESOURCE_ZYNTHIUM;
                currentOutput = RESOURCE_ZYNTHIUM_OXIDE;
            }

        else if((storage && storage.store[RESOURCE_ZYNTHIUM_ALKALIDE] < 1000 && currentOutput != RESOURCE_ZYNTHIUM_ALKALIDE ||
            storage && storage.store[RESOURCE_ZYNTHIUM_ALKALIDE] < 3000 && currentOutput == RESOURCE_ZYNTHIUM_ALKALIDE) &&
            terminal.store[RESOURCE_HYDROXIDE] + storage.store[RESOURCE_HYDROXIDE] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM_OXIDE] + storage.store[RESOURCE_ZYNTHIUM_OXIDE] >= 1000) {
                lab1Input = RESOURCE_HYDROXIDE
                lab2Input = RESOURCE_ZYNTHIUM_OXIDE;
                currentOutput = RESOURCE_ZYNTHIUM_ALKALIDE;
            }

        else if(storage && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] < 10000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM_ALKALIDE] + storage.store[RESOURCE_ZYNTHIUM_ALKALIDE] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_ZYNTHIUM_ALKALIDE;
                currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE;
            }

        // chain to get catalyzed lemergium alkalide

        else if((storage && storage.store[RESOURCE_LEMERGIUM_OXIDE] < 1000 && currentOutput != RESOURCE_LEMERGIUM_OXIDE ||
            storage && storage.store[RESOURCE_LEMERGIUM_OXIDE] < 3000 && currentOutput == RESOURCE_LEMERGIUM_OXIDE) &&
            terminal.store[RESOURCE_LEMERGIUM] + storage.store[RESOURCE_LEMERGIUM] >= 1000 && terminal.store[RESOURCE_OXYGEN] + storage.store[RESOURCE_OXYGEN] >= 1000) {
                lab1Input = RESOURCE_LEMERGIUM
                lab2Input = RESOURCE_OXYGEN;
                currentOutput = RESOURCE_LEMERGIUM_OXIDE;
            }

        else if((storage && storage.store[RESOURCE_LEMERGIUM_ALKALIDE] < 1000 && currentOutput != RESOURCE_LEMERGIUM_ALKALIDE ||
            storage && storage.store[RESOURCE_LEMERGIUM_ALKALIDE] < 3000 && currentOutput == RESOURCE_LEMERGIUM_ALKALIDE) &&
            terminal.store[RESOURCE_HYDROXIDE] + storage.store[RESOURCE_HYDROXIDE] >= 1000 && terminal.store[RESOURCE_LEMERGIUM_OXIDE] + storage.store[RESOURCE_LEMERGIUM_OXIDE] >= 1000) {
                lab1Input = RESOURCE_HYDROXIDE
                lab2Input = RESOURCE_LEMERGIUM_OXIDE;
                currentOutput = RESOURCE_LEMERGIUM_ALKALIDE;
            }

        else if(storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] < 10000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_LEMERGIUM_ALKALIDE] + storage.store[RESOURCE_LEMERGIUM_ALKALIDE] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_LEMERGIUM_ALKALIDE;
                currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE;
            }



            // chain to get catalyzed ghodium alkalide
        else if((storage && storage.store[RESOURCE_ZYNTHIUM_KEANITE] < 1000 && currentOutput != RESOURCE_ZYNTHIUM_KEANITE ||
            storage && storage.store[RESOURCE_ZYNTHIUM_KEANITE] < 3000 && currentOutput == RESOURCE_ZYNTHIUM_KEANITE) &&
            terminal.store[RESOURCE_ZYNTHIUM] + storage.store[RESOURCE_ZYNTHIUM] >= 1000 && terminal.store[RESOURCE_KEANIUM] + storage.store[RESOURCE_KEANIUM] >= 1000) {
                lab1Input = RESOURCE_ZYNTHIUM
                lab2Input = RESOURCE_KEANIUM;
                currentOutput = RESOURCE_ZYNTHIUM_KEANITE;
            }

        else if((storage && storage.store[RESOURCE_UTRIUM_LEMERGITE] < 1000 && currentOutput != RESOURCE_UTRIUM_LEMERGITE ||
            storage && storage.store[RESOURCE_UTRIUM_LEMERGITE] < 3000 && currentOutput == RESOURCE_UTRIUM_LEMERGITE) &&
            terminal.store[RESOURCE_UTRIUM] + storage.store[RESOURCE_UTRIUM] >= 1000 && terminal.store[RESOURCE_LEMERGIUM] + storage.store[RESOURCE_LEMERGIUM] >= 1000) {
                lab1Input = RESOURCE_UTRIUM
                lab2Input = RESOURCE_LEMERGIUM;
                currentOutput = RESOURCE_UTRIUM_LEMERGITE;
            }

        else if((storage && storage.store[RESOURCE_GHODIUM] < 10000 && currentOutput != RESOURCE_GHODIUM ||
            storage && storage.store[RESOURCE_GHODIUM] < 20000 && currentOutput == RESOURCE_GHODIUM) &&
            terminal.store[RESOURCE_ZYNTHIUM_KEANITE] + storage.store[RESOURCE_ZYNTHIUM_KEANITE] >= 1000 && terminal.store[RESOURCE_UTRIUM_LEMERGITE] + storage.store[RESOURCE_UTRIUM_LEMERGITE] >= 1000) {
                lab1Input = RESOURCE_ZYNTHIUM_KEANITE
                lab2Input = RESOURCE_UTRIUM_LEMERGITE;
                currentOutput = RESOURCE_GHODIUM;
            }

        else if((storage && storage.store[RESOURCE_GHODIUM_OXIDE] < 1000 && currentOutput != RESOURCE_GHODIUM_OXIDE ||
            storage && storage.store[RESOURCE_GHODIUM_OXIDE] < 3000 && currentOutput == RESOURCE_GHODIUM_OXIDE) &&
            terminal.store[RESOURCE_GHODIUM] + storage.store[RESOURCE_GHODIUM] >= 1000 && terminal.store[RESOURCE_OXYGEN] + storage.store[RESOURCE_OXYGEN] >= 1000) {
                lab1Input = RESOURCE_GHODIUM
                lab2Input = RESOURCE_OXYGEN;
                currentOutput = RESOURCE_GHODIUM_OXIDE;
            }

        else if((storage && storage.store[RESOURCE_GHODIUM_ALKALIDE] < 1000 && currentOutput != RESOURCE_GHODIUM_ALKALIDE ||
            storage && storage.store[RESOURCE_GHODIUM_ALKALIDE] < 3000 && currentOutput == RESOURCE_GHODIUM_ALKALIDE) &&
            terminal.store[RESOURCE_GHODIUM_OXIDE] + storage.store[RESOURCE_GHODIUM_OXIDE] >= 1000 && terminal.store[RESOURCE_HYDROXIDE] + storage.store[RESOURCE_HYDROXIDE] >= 1000) {
                lab1Input = RESOURCE_GHODIUM_OXIDE;
                lab2Input = RESOURCE_HYDROXIDE;
                currentOutput = RESOURCE_GHODIUM_ALKALIDE;
            }

        else if(storage && storage.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] < 3000 &&
            terminal.store[RESOURCE_GHODIUM_ALKALIDE] + storage.store[RESOURCE_GHODIUM_ALKALIDE] >= 1000 && terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000) {
                lab1Input = RESOURCE_GHODIUM_ALKALIDE;
                lab2Input = RESOURCE_CATALYST;
                currentOutput = RESOURCE_CATALYZED_GHODIUM_ALKALIDE;
            }

        // chain to get catalyzed keanium alkalide

        else if((storage && storage.store[RESOURCE_KEANIUM_OXIDE] < 1000 && currentOutput != RESOURCE_KEANIUM_OXIDE ||
            storage && storage.store[RESOURCE_KEANIUM_OXIDE] < 3000 && currentOutput == RESOURCE_KEANIUM_OXIDE) &&
            terminal.store[RESOURCE_KEANIUM] + storage.store[RESOURCE_KEANIUM] >= 1000 && terminal.store[RESOURCE_OXYGEN] + storage.store[RESOURCE_OXYGEN] >= 1000) {
                lab1Input = RESOURCE_KEANIUM
                lab2Input = RESOURCE_OXYGEN;
                currentOutput = RESOURCE_KEANIUM_OXIDE;
            }

        else if((storage && storage.store[RESOURCE_KEANIUM_ALKALIDE] < 1000 && currentOutput != RESOURCE_KEANIUM_ALKALIDE ||
            storage && storage.store[RESOURCE_KEANIUM_ALKALIDE] < 3000 && currentOutput == RESOURCE_KEANIUM_ALKALIDE) &&
            terminal.store[RESOURCE_HYDROXIDE] + storage.store[RESOURCE_HYDROXIDE] >= 1000 && terminal.store[RESOURCE_KEANIUM_OXIDE] + storage.store[RESOURCE_KEANIUM_OXIDE] >= 1000) {
                lab1Input = RESOURCE_HYDROXIDE
                lab2Input = RESOURCE_KEANIUM_OXIDE;
                currentOutput = RESOURCE_KEANIUM_ALKALIDE;
            }

        else if(storage && storage.store[RESOURCE_CATALYZED_KEANIUM_ALKALIDE] < 10000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_KEANIUM_ALKALIDE] + storage.store[RESOURCE_KEANIUM_ALKALIDE] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_KEANIUM_ALKALIDE;
                currentOutput = RESOURCE_CATALYZED_KEANIUM_ALKALIDE;
            }






        // chain to get catalyzed zyn acid

        else if((storage && storage.store[RESOURCE_ZYNTHIUM_HYDRIDE] < 1000 && currentOutput != RESOURCE_ZYNTHIUM_HYDRIDE ||
            storage && storage.store[RESOURCE_ZYNTHIUM_HYDRIDE] < 3000 && currentOutput == RESOURCE_ZYNTHIUM_HYDRIDE) &&
            terminal.store[RESOURCE_HYDROGEN] + storage.store[RESOURCE_HYDROGEN] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM] + storage.store[RESOURCE_ZYNTHIUM] >= 1000) {
                lab1Input = RESOURCE_HYDROGEN;
                lab2Input = RESOURCE_ZYNTHIUM;
                currentOutput = RESOURCE_ZYNTHIUM_HYDRIDE;
            }

        else if((storage && storage.store[RESOURCE_ZYNTHIUM_ACID] < 1000 && currentOutput != RESOURCE_ZYNTHIUM_ACID ||
            storage && storage.store[RESOURCE_ZYNTHIUM_ACID] < 3000 && currentOutput == RESOURCE_ZYNTHIUM_ACID) &&
            terminal.store[RESOURCE_HYDROXIDE] + storage.store[RESOURCE_HYDROXIDE] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM_HYDRIDE] + storage.store[RESOURCE_ZYNTHIUM_HYDRIDE] >= 1000) {
                lab1Input = RESOURCE_HYDROXIDE
                lab2Input = RESOURCE_ZYNTHIUM_HYDRIDE;
                currentOutput = RESOURCE_ZYNTHIUM_ACID;
            }

        else if(storage && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ACID] < 10000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM_ACID] + storage.store[RESOURCE_ZYNTHIUM_ACID] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_ZYNTHIUM_ACID;
                currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ACID;
            }







        // 40K
        else if(storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] < 40000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_LEMERGIUM_ACID] + storage.store[RESOURCE_LEMERGIUM_ACID] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_LEMERGIUM_ACID;
                currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ACID;
            }
        else if(storage && storage.store[RESOURCE_CATALYZED_UTRIUM_ACID] < 40000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_UTRIUM_ACID] + storage.store[RESOURCE_UTRIUM_ACID] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_UTRIUM_ACID;
            currentOutput = RESOURCE_CATALYZED_UTRIUM_ACID;
        }
        else if(storage && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] < 40000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM_ALKALIDE] + storage.store[RESOURCE_ZYNTHIUM_ALKALIDE] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_ZYNTHIUM_ALKALIDE;
            currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE;
        }
        else if(storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] < 40000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_LEMERGIUM_ALKALIDE] + storage.store[RESOURCE_LEMERGIUM_ALKALIDE] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_LEMERGIUM_ALKALIDE;
            currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE;
        }
        else if(storage && storage.store[RESOURCE_CATALYZED_KEANIUM_ALKALIDE] < 40000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_KEANIUM_ALKALIDE] + storage.store[RESOURCE_KEANIUM_ALKALIDE] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_KEANIUM_ALKALIDE;
            currentOutput = RESOURCE_CATALYZED_KEANIUM_ALKALIDE;
        }
        else if(storage && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ACID] < 40000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM_ACID] + storage.store[RESOURCE_ZYNTHIUM_ACID] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_ZYNTHIUM_ACID;
            currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ACID;
        }

        else if(storage && storage.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] < 40000 &&
            terminal.store[RESOURCE_GHODIUM_ALKALIDE] + storage.store[RESOURCE_GHODIUM_ALKALIDE] >= 1000 && terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000) {
            lab1Input = RESOURCE_GHODIUM_ALKALIDE;
            lab2Input = RESOURCE_CATALYST;
            currentOutput = RESOURCE_CATALYZED_GHODIUM_ALKALIDE;
        }

        // miner efficiency
        else if((storage && storage.store[RESOURCE_UTRIUM_OXIDE] < 1000 && currentOutput != RESOURCE_UTRIUM_OXIDE ||
        storage && storage.store[RESOURCE_UTRIUM_OXIDE] < 40000 && currentOutput == RESOURCE_UTRIUM_OXIDE) &&
        terminal.store[RESOURCE_OXYGEN] + storage.store[RESOURCE_OXYGEN] >= 1000 && terminal.store[RESOURCE_UTRIUM] + storage.store[RESOURCE_UTRIUM] >= 1000) {
            lab1Input = RESOURCE_OXYGEN;
            lab2Input = RESOURCE_UTRIUM;
            currentOutput = RESOURCE_UTRIUM_OXIDE;
        }


        // 50K
        else if(storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] < 50000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_LEMERGIUM_ACID] + storage.store[RESOURCE_LEMERGIUM_ACID] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_LEMERGIUM_ACID;
                currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ACID;
            }
        else if(storage && storage.store[RESOURCE_CATALYZED_UTRIUM_ACID] < 50000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_UTRIUM_ACID] + storage.store[RESOURCE_UTRIUM_ACID] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_UTRIUM_ACID;
            currentOutput = RESOURCE_CATALYZED_UTRIUM_ACID;
        }
        else if(storage && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] < 50000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM_ALKALIDE] + storage.store[RESOURCE_ZYNTHIUM_ALKALIDE] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_ZYNTHIUM_ALKALIDE;
            currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE;
        }
        else if(storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] < 50000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_LEMERGIUM_ALKALIDE] + storage.store[RESOURCE_LEMERGIUM_ALKALIDE] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_LEMERGIUM_ALKALIDE;
            currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE;
        }
        else if(storage && storage.store[RESOURCE_CATALYZED_KEANIUM_ALKALIDE] < 50000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_KEANIUM_ALKALIDE] + storage.store[RESOURCE_KEANIUM_ALKALIDE] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_KEANIUM_ALKALIDE;
            currentOutput = RESOURCE_CATALYZED_KEANIUM_ALKALIDE;
        }
        else if(storage && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ACID] < 50000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM_ACID] + storage.store[RESOURCE_ZYNTHIUM_ACID] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_ZYNTHIUM_ACID;
            currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ACID;
        }

        else if(storage && storage.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] < 50000 &&
            terminal.store[RESOURCE_GHODIUM_ALKALIDE] + storage.store[RESOURCE_GHODIUM_ALKALIDE] >= 1000 && terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000) {
            lab1Input = RESOURCE_GHODIUM_ALKALIDE;
            lab2Input = RESOURCE_CATALYST;
            currentOutput = RESOURCE_CATALYZED_GHODIUM_ALKALIDE;
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
    }

    let currentOutput = room.memory.labs.status.currentOutput;
    let lab1Input = room.memory.labs.status.lab1Input;
    let lab2Input = room.memory.labs.status.lab2Input;



    // if(lab1Input === RESOURCE_HYDROGEN && lab2Input === RESOURCE_OXYGEN || lab2Input === RESOURCE_HYDROGEN && lab1Input === RESOURCE_OXYGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_HYDROXIDE;
    // }
    // else if(lab1Input === RESOURCE_ZYNTHIUM && lab2Input === RESOURCE_KEANIUM || lab2Input === RESOURCE_ZYNTHIUM && lab1Input === RESOURCE_KEANIUM) {
    //     room.memory.labs.status.currentOutput = RESOURCE_ZYNTHIUM_KEANITE;
    // }
    // else if(lab1Input === RESOURCE_UTRIUM && lab2Input === RESOURCE_LEMERGIUM || lab2Input === RESOURCE_UTRIUM && lab1Input === RESOURCE_LEMERGIUM) {
    //     room.memory.labs.status.currentOutput = RESOURCE_UTRIUM_LEMERGITE;
    // }
    // else if(lab1Input === RESOURCE_ZYNTHIUM_KEANITE && lab2Input === RESOURCE_UTRIUM_LEMERGITE || lab2Input === RESOURCE_ZYNTHIUM_KEANITE && lab1Input === RESOURCE_UTRIUM_LEMERGITE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_GHODIUM;
    // }
    // else if(lab1Input === RESOURCE_UTRIUM && lab2Input === RESOURCE_HYDROGEN || lab2Input === RESOURCE_UTRIUM && lab1Input === RESOURCE_HYDROGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_UTRIUM_HYDRIDE;
    // }
    // else if(lab1Input === RESOURCE_UTRIUM && lab2Input === RESOURCE_OXYGEN || lab2Input === RESOURCE_UTRIUM && lab1Input === RESOURCE_OXYGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_UTRIUM_OXIDE;
    // }
    // else if(lab1Input === RESOURCE_KEANIUM && lab2Input === RESOURCE_HYDROGEN || lab2Input === RESOURCE_KEANIUM && lab1Input === RESOURCE_HYDROGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_KEANIUM_HYDRIDE;
    // }
    // else if(lab1Input === RESOURCE_KEANIUM && lab2Input === RESOURCE_OXYGEN || lab2Input === RESOURCE_KEANIUM && lab1Input === RESOURCE_OXYGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_KEANIUM_OXIDE;
    // }
    // else if(lab1Input === RESOURCE_LEMERGIUM && lab2Input === RESOURCE_HYDROGEN || lab2Input === RESOURCE_LEMERGIUM && lab1Input === RESOURCE_HYDROGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_LEMERGIUM_HYDRIDE;
    // }
    // else if(lab1Input === RESOURCE_LEMERGIUM && lab2Input === RESOURCE_OXYGEN || lab2Input === RESOURCE_LEMERGIUM && lab1Input === RESOURCE_OXYGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_LEMERGIUM_OXIDE;
    // }
    // else if(lab1Input === RESOURCE_ZYNTHIUM && lab2Input === RESOURCE_HYDROGEN || lab2Input === RESOURCE_ZYNTHIUM && lab1Input === RESOURCE_HYDROGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_ZYNTHIUM_HYDRIDE;
    // }
    // else if(lab1Input === RESOURCE_ZYNTHIUM && lab2Input === RESOURCE_OXYGEN || lab2Input === RESOURCE_ZYNTHIUM && lab1Input === RESOURCE_OXYGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_ZYNTHIUM_OXIDE;
    // }
    // else if(lab1Input === RESOURCE_GHODIUM && lab2Input === RESOURCE_HYDROGEN || lab2Input === RESOURCE_GHODIUM && lab1Input === RESOURCE_HYDROGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_GHODIUM_HYDRIDE;
    // }
    // else if(lab1Input === RESOURCE_GHODIUM && lab2Input === RESOURCE_OXYGEN || lab2Input === RESOURCE_GHODIUM && lab1Input === RESOURCE_OXYGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_GHODIUM_OXIDE;
    // }
    // else if(lab1Input === RESOURCE_UTRIUM_HYDRIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_UTRIUM_HYDRIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_UTRIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_UTRIUM_OXIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_UTRIUM_OXIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_UTRIUM_ALKALIDE;
    // }
    // else if(lab1Input === RESOURCE_KEANIUM_HYDRIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_KEANIUM_HYDRIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_KEANIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_KEANIUM_OXIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_KEANIUM_OXIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_KEANIUM_ALKALIDE;
    // }
    // else if(lab1Input === RESOURCE_LEMERGIUM_HYDRIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_LEMERGIUM_HYDRIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_LEMERGIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_LEMERGIUM_OXIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_LEMERGIUM_OXIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_LEMERGIUM_ALKALIDE;
    // }
    // else if(lab1Input === RESOURCE_ZYNTHIUM_HYDRIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_ZYNTHIUM_HYDRIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_ZYNTHIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_ZYNTHIUM_OXIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_ZYNTHIUM_OXIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_ZYNTHIUM_ALKALIDE;
    // }
    // else if(lab1Input === RESOURCE_GHODIUM_HYDRIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_GHODIUM_HYDRIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_GHODIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_GHODIUM_OXIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_GHODIUM_OXIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_GHODIUM_ALKALIDE;
    // }
    // else if(lab1Input === RESOURCE_UTRIUM_ACID && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_UTRIUM_ACID && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_UTRIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_UTRIUM_ALKALIDE && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_UTRIUM_ALKALIDE && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_UTRIUM_ALKALIDE;
    // }
    // else if(lab1Input === RESOURCE_KEANIUM_ACID && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_KEANIUM_ACID && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_KEANIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_KEANIUM_ALKALIDE && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_KEANIUM_ALKALIDE && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_KEANIUM_ALKALIDE;
    // }
    // else if(lab1Input === RESOURCE_LEMERGIUM_ACID && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_LEMERGIUM_ACID && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_LEMERGIUM_ALKALIDE && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_LEMERGIUM_ALKALIDE && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE;
    // }
    // else if(lab1Input === RESOURCE_ZYNTHIUM_ACID && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_ZYNTHIUM_ACID && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_ZYNTHIUM_ALKALIDE && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_ZYNTHIUM_ALKALIDE && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE;
    // }
    // else if(lab1Input === RESOURCE_GHODIUM_ACID && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_GHODIUM_ACID && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_GHODIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_GHODIUM_ALKALIDE && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_GHODIUM_ALKALIDE && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_GHODIUM_ALKALIDE;
    // }


    if(Game.cpu.bucket > 40) {
        if(outputLab1 && outputLab1.cooldown == 0 && outputLab1.store.getFreeCapacity() != 0) {
            if(inputLab1 && inputLab1.store[lab1Input] >= 5 && inputLab2 && inputLab2.store[lab2Input] >= 5) {
                if(room.memory.labs.status.boost && room.memory.labs.status.boost.lab1 && room.memory.labs.status.boost.lab1.use == 0 && (!room.memory.labs.status.boost.lab1.amount || room.memory.labs.status.boost.lab1.amount == 0)) {
                    outputLab1.runReaction(inputLab1, inputLab2);
                }
                else if(!room.memory.labs.status.boost|| !room.memory.labs.status.boost.lab1) {
                    outputLab1.runReaction(inputLab1, inputLab2);
                }
            }
        }
        if(outputLab2 && outputLab2.cooldown == 0 && outputLab2.store.getFreeCapacity() != 0) {
            if(inputLab1 && inputLab1.store[lab1Input] >= 5 && inputLab2 && inputLab2.store[lab2Input] >= 5) {
                if(room.memory.labs.status.boost && room.memory.labs.status.boost.lab2 && room.memory.labs.status.boost.lab2.use == 0 && (!room.memory.labs.status.boost.lab2.amount || room.memory.labs.status.boost.lab2.amount == 0)) {
                    outputLab2.runReaction(inputLab1, inputLab2);
                }
                else if(!room.memory.labs.status.boost || !room.memory.labs.status.boost.lab2) {
                    outputLab2.runReaction(inputLab1, inputLab2);
                }
            }
        }
        if(outputLab3 && outputLab3.cooldown == 0 && outputLab3.store.getFreeCapacity() != 0) {
            if(inputLab1 && inputLab1.store[lab1Input] >= 5 && inputLab2 && inputLab2.store[lab2Input] >= 5) {
                if(room.memory.labs.status.boost && room.memory.labs.status.boost.lab3 && room.memory.labs.status.boost.lab3.use == 0 && (!room.memory.labs.status.boost.lab3.amount || room.memory.labs.status.boost.lab3.amount == 0)) {
                    outputLab3.runReaction(inputLab1, inputLab2);
                }
                else if(!room.memory.labs.status.boost || !room.memory.labs.status.boost.lab3) {
                    outputLab3.runReaction(inputLab1, inputLab2);
                }
            }
        }
        if(outputLab4 && outputLab4.cooldown == 0 && outputLab4.store.getFreeCapacity() != 0) {
            if(inputLab1 && inputLab1.store[lab1Input] >= 5 && inputLab2 && inputLab2.store[lab2Input] >= 5) {
                if(room.memory.labs.status.boost && room.memory.labs.status.boost.lab4 && room.memory.labs.status.boost.lab4.use == 0 && (!room.memory.labs.status.boost.lab4.amount || room.memory.labs.status.boost.lab4.amount == 0)) {
                    outputLab4.runReaction(inputLab1, inputLab2);
                }
                else if(!room.memory.labs.status.boost || !room.memory.labs.status.boost.lab4) {
                    outputLab4.runReaction(inputLab1, inputLab2);
                }
            }
        }
        if(outputLab5 && outputLab5.cooldown == 0 && outputLab5.store.getFreeCapacity() != 0) {
            if(inputLab1 && inputLab1.store[lab1Input] >= 5 && inputLab2 && inputLab2.store[lab2Input] >= 5) {
                if(room.memory.labs.status.boost && room.memory.labs.status.boost.lab5 && !room.memory.labs.status.boost.lab5.use && (!room.memory.labs.status.boost.lab5.amount || room.memory.labs.status.boost.lab5.amount == 0)) {
                    outputLab5.runReaction(inputLab1, inputLab2);
                }
                else if(!room.memory.labs.status.boost || !room.memory.labs.status.boost.lab5) {
                    outputLab5.runReaction(inputLab1, inputLab2);
                }
            }
        }
        if(outputLab6 && outputLab6.cooldown == 0 && outputLab6.store.getFreeCapacity() != 0) {
            if(inputLab1 && inputLab1.store[lab1Input] >= 5 && inputLab2 && inputLab2.store[lab2Input] >= 5) {
                if(room.memory.labs.status.boost && room.memory.labs.status.boost.lab6 && room.memory.labs.status.boost.lab6.use == 0 && (!room.memory.labs.status.boost.lab6.amount || room.memory.labs.status.boost.lab6.amount == 0)) {
                    outputLab6.runReaction(inputLab1, inputLab2);
                }
                else if(!room.memory.labs.status.boost || !room.memory.labs.status.boost.lab6) {
                    outputLab6.runReaction(inputLab1, inputLab2);
                }
            }
        }
        if(outputLab7 && outputLab7.cooldown == 0 && outputLab7.store.getFreeCapacity() != 0) {
            if(inputLab1 && inputLab1.store[lab1Input] >= 5 && inputLab2 && inputLab2.store[lab2Input] >= 5) {
                if(room.memory.labs.status.boost && room.memory.labs.status.boost.lab7 && room.memory.labs.status.boost.lab7.use == 0 && (!room.memory.labs.status.boost.lab7.amount || room.memory.labs.status.boost.lab7.amount == 0)) {
                    outputLab7.runReaction(inputLab1, inputLab2);
                }
                else if(!room.memory.labs.status.boost || !room.memory.labs.status.boost.lab7) {
                    outputLab7.runReaction(inputLab1, inputLab2);
                }
            }
        }
        if(outputLab8 && outputLab8.cooldown == 0 && outputLab8.store.getFreeCapacity() != 0) {
            if(inputLab1 && inputLab1.store[lab1Input] >= 5 && inputLab2 && inputLab2.store[lab2Input] >= 5) {
                if(room.memory.labs.status.boost && room.memory.labs.status.boost.lab8 && room.memory.labs.status.boost.lab8.use == 0 && (!room.memory.labs.status.boost.lab8.amount || room.memory.labs.status.boost.lab8.amount == 0)) {
                    outputLab8.runReaction(inputLab1, inputLab2);
                }
                else if(!room.memory.labs.status.boost || !room.memory.labs.status.boost.lab8) {
                    outputLab8.runReaction(inputLab1, inputLab2);
                }
            }
        }
    }



    // if(resultLab.store[RESOURCE_UTRIUM_HYDRIDE] <= 2995 && firstLab.store[RESOURCE_UTRIUM] >= 5 && secondLab.store[RESOURCE_HYDROGEN] >= 5) {
    //     resultLab.runReaction(firstLab, secondLab);
    // }


}

export default labs;
// module.exports = market;
