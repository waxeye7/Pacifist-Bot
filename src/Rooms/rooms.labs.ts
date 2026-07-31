// returns the lab standing on the given tile, if any
function labAt(room, x, y) {
    if(x < 0 || x > 49 || y < 0 || y > 49) {
        return undefined;
    }
    let structuresHere = new RoomPosition(x, y, room.name).lookFor(LOOK_STRUCTURES);
    for(let building of structuresHere) {
        if(building.structureType == STRUCTURE_LAB) {
            return building;
        }
    }
    return undefined;
}

// legacy strip layout: 3 columns x 4 rows beside storage, the 2 input labs sit in the middle column.
// returns the matching offset table, or undefined when the room is not built in that shape.
function legacyLabLayout(room, storage) {
    let layouts = [
        {
            inputLab1: {x: storage.pos.x - 4, y: storage.pos.y + 1},
            inputLab2: {x: storage.pos.x - 4, y: storage.pos.y + 2},
            outputLab1: {x: storage.pos.x - 3, y: storage.pos.y},
            outputLab2: {x: storage.pos.x - 3, y: storage.pos.y + 1},
            outputLab3: {x: storage.pos.x - 3, y: storage.pos.y + 2},
            outputLab4: {x: storage.pos.x - 3, y: storage.pos.y + 3},
            outputLab5: {x: storage.pos.x - 5, y: storage.pos.y + 3},
            outputLab6: {x: storage.pos.x - 5, y: storage.pos.y + 2},
            outputLab7: {x: storage.pos.x - 5, y: storage.pos.y + 1},
            outputLab8: {x: storage.pos.x - 5, y: storage.pos.y}
        },
        {
            inputLab1: {x: storage.pos.x + 4, y: storage.pos.y + 4},
            inputLab2: {x: storage.pos.x + 4, y: storage.pos.y + 5},
            outputLab1: {x: storage.pos.x + 3, y: storage.pos.y + 3},
            outputLab2: {x: storage.pos.x + 3, y: storage.pos.y + 4},
            outputLab3: {x: storage.pos.x + 3, y: storage.pos.y + 5},
            outputLab4: {x: storage.pos.x + 3, y: storage.pos.y + 6},
            outputLab5: {x: storage.pos.x + 5, y: storage.pos.y + 3},
            outputLab6: {x: storage.pos.x + 5, y: storage.pos.y + 4},
            outputLab7: {x: storage.pos.x + 5, y: storage.pos.y + 5},
            outputLab8: {x: storage.pos.x + 5, y: storage.pos.y + 6}
        }
    ];
    for(let layout of layouts) {
        if(!labAt(room, layout.inputLab1.x, layout.inputLab1.y) || !labAt(room, layout.inputLab2.x, layout.inputLab2.y)) {
            continue;
        }
        // Two labs on the input offsets is not proof the room was BUILT to the
        // strip — a dynamic layout can hit those two tiles by coincidence and
        // then get its whole reaction chain hijacked. Demand that the strip
        // holds (essentially) every lab the room has.
        let onLayout = 0;
        for(let slot of Object.keys(layout)) {
            if(labAt(room, layout[slot].x, layout[slot].y)) {
                onLayout++;
            }
        }
        let labCount = room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_LAB}).length;
        if(onLayout >= Math.min(6, labCount)) {
            return layout;
        }
    }
    return undefined;
}

// v2-planned rooms: the two reaction inputs are FIXED by the plan (the lab
// diamond's centre pair), so neither the legacy storage offsets nor the
// adjacency heuristic may be consulted. Returns false while fewer than two
// input labs are actually built — early RCL7 has a partial diamond and the
// caller falls back to adjacency for the interim.
function assignPlanV2Labs(room, storage, LabsInRoom) {
    let packed = room.memory.planV2 && room.memory.planV2.t && room.memory.planV2.t.labInput;
    if(!packed || packed.length < 2) {
        return false;
    }
    let inputs = [];
    for(let p of packed) {
        let lab = labAt(room, p % 50, Math.floor(p / 50));
        if(lab) {
            inputs.push(lab);
        }
    }
    if(inputs.length < 2) {
        return false;
    }
    room.memory.labs.inputLab1 = inputs[0].id;
    room.memory.labs.inputLab2 = inputs[1].id;

    let outputs = LabsInRoom.filter(function(lab) {return lab.id != inputs[0].id && lab.id != inputs[1].id;});
    // stable order so boost slots (lab1..lab8) do not shuffle on re-detection
    outputs.sort(function(a, b) {
        let da = storage ? a.pos.getRangeTo(storage) : 0;
        let db = storage ? b.pos.getRangeTo(storage) : 0;
        if(da != db) {
            return da - db;
        }
        if(a.pos.x != b.pos.x) {
            return a.pos.x - b.pos.x;
        }
        if(a.pos.y != b.pos.y) {
            return a.pos.y - b.pos.y;
        }
        return a.id < b.id ? -1 : 1;
    });
    let slot = 1;
    for(let lab of outputs) {
        if(slot > 8) {
            break;
        }
        room.memory.labs["outputLab" + slot] = lab.id;
        slot++;
    }
    for(let empty = slot; empty <= 8; empty++) {
        delete room.memory.labs["outputLab" + empty];
    }
    return true;
}

// keeps the historic assignment on rooms that were built with the storage relative strip
function assignLegacyLabs(room, storage, LabsInRoom) {
    let layout = legacyLabLayout(room, storage);
    if(!layout) {
        return false;
    }
    let slots = ["inputLab1", "inputLab2", "outputLab1"];
    if(room.controller.level >= 7 && LabsInRoom.length >= 6) {
        slots.push("outputLab2", "outputLab3", "outputLab4");
    }
    if(room.controller.level == 8 && LabsInRoom.length == 10) {
        slots.push("outputLab5", "outputLab6", "outputLab7", "outputLab8");
    }
    for(let slot of slots) {
        let lab = labAt(room, layout[slot].x, layout[slot].y);
        if(lab) {
            room.memory.labs[slot] = lab.id;
        }
    }
    return room.memory.labs.inputLab1 != undefined && room.memory.labs.inputLab2 != undefined;
}

function labsInRangeCount(lab, LabsInRoom, range) {
    let count = 0;
    for(let other of LabsInRoom) {
        if(other.id == lab.id) {
            continue;
        }
        if(lab.pos.getRangeTo(other) <= range) {
            count++;
        }
    }
    return count;
}

// geometry agnostic detection: the input labs are the ones that reach every other lab (range <= 2),
// everything else becomes an output lab. works for any stamp the planner produces.
function assignDynamicLabs(room, storage, LabsInRoom) {
    let scored = [];
    for(let lab of LabsInRoom) {
        scored.push({
            lab: lab,
            reach: labsInRangeCount(lab, LabsInRoom, 2),
            adjacent: labsInRangeCount(lab, LabsInRoom, 1),
            distance: storage ? lab.pos.getRangeTo(storage) : 0
        });
    }

    let candidates = scored.filter(function(entry) {return entry.reach == LabsInRoom.length - 1;});
    if(candidates.length < 2) {
        // degenerate geometry, take whatever reaches the most labs
        candidates = scored;
    }
    // more than 2 qualify -> the pair glued to the rest of the cluster wins, then the pair nearest storage
    let byInputFitness = function(a, b) {
        if(a.reach != b.reach) {
            return b.reach - a.reach;
        }
        if(a.adjacent != b.adjacent) {
            return b.adjacent - a.adjacent;
        }
        if(a.distance != b.distance) {
            return a.distance - b.distance;
        }
        return a.lab.id < b.lab.id ? -1 : 1;
    };
    candidates.sort(byInputFitness);

    let inputLab1 = candidates[0];
    let inputLab2 = candidates[1];
    if(!inputLab1 || !inputLab2) {
        return false;
    }

    let outputs = scored.filter(function(entry) {return entry.lab.id != inputLab1.lab.id && entry.lab.id != inputLab2.lab.id;});
    // stable order so the boost slots (lab1..lab8) do not shuffle on every re-detection
    outputs.sort(function(a, b) {
        if(a.distance != b.distance) {
            return a.distance - b.distance;
        }
        if(a.lab.pos.x != b.lab.pos.x) {
            return a.lab.pos.x - b.lab.pos.x;
        }
        if(a.lab.pos.y != b.lab.pos.y) {
            return a.lab.pos.y - b.lab.pos.y;
        }
        return a.lab.id < b.lab.id ? -1 : 1;
    });

    room.memory.labs.inputLab1 = inputLab1.lab.id;
    room.memory.labs.inputLab2 = inputLab2.lab.id;

    let slot = 1;
    for(let entry of outputs) {
        if(slot > 8) {
            break;
        }
        room.memory.labs["outputLab" + slot] = entry.lab.id;
        slot++;
    }
    for(let empty = slot; empty <= 8; empty++) {
        delete room.memory.labs["outputLab" + empty];
    }
    return true;
}

function labs(room) {
    if(!room.memory.labs || Game.time % 120 == 0) {

        if(!room.memory.labs) {
            room.memory.labs = {};
        }

        let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
        let LabsInRoom = room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_LAB});

        if(room.controller.level >= 6 && LabsInRoom.length >= 3) {

            let assigned = false;
            if(room.memory.planV2) {
                // plan wins outright; adjacency only covers the partial-diamond
                // interim. The legacy offsets are never consulted here.
                assigned = assignPlanV2Labs(room, storage, LabsInRoom);
            }
            else if(storage) {
                assigned = assignLegacyLabs(room, storage, LabsInRoom);
            }
            if(!assigned) {
                assignDynamicLabs(room, storage, LabsInRoom);
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

    if(Game.time % 21000 == 0) {
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
                if(room.memory.labs.status.boost && (!room.memory.labs.status.boost.lab1 || room.memory.labs.status.boost.lab1.amount == 0) &&
                    (!room.memory.labs.status.boost.lab2 || room.memory.labs.status.boost.lab2.amount == 0) &&
                    (!room.memory.labs.status.boost.lab3 || room.memory.labs.status.boost.lab3.amount == 0) &&
                    (!room.memory.labs.status.boost.lab4 || room.memory.labs.status.boost.lab4.amount == 0) &&
                    (!room.memory.labs.status.boost.lab5 || room.memory.labs.status.boost.lab5.amount == 0) &&
                    (!room.memory.labs.status.boost.lab6 || room.memory.labs.status.boost.lab6.amount == 0) &&
                    (!room.memory.labs.status.boost.lab7 || room.memory.labs.status.boost.lab7.amount == 0) &&
                    (!room.memory.labs.status.boost.lab8 || room.memory.labs.status.boost.lab8.amount == 0)) {

                        let creepsInRoom = room.find(FIND_MY_CREEPS);
                        let rams = creepsInRoom.filter(function(c) {return c.memory.role == "ram";});
                        let quadSquadChars = creepsInRoom.filter(function(c) {return c.name.startsWith("SquadCreep");});
                        let solomons = creepsInRoom.filter(function(c) {return c.memory.role == "Solomon";});
                        if(rams.length == 0 && quadSquadChars.length == 0 && solomons.length == 0) {

                            room.memory.labs.status.boost = {};

                        }


                    }
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







        // chain to get catalyzed KEAN acid

        else if((storage && storage.store[RESOURCE_KEANIUM_HYDRIDE] < 1000 && currentOutput != RESOURCE_KEANIUM_HYDRIDE ||
            storage && storage.store[RESOURCE_KEANIUM_HYDRIDE] < 3000 && currentOutput == RESOURCE_KEANIUM_HYDRIDE) &&
            terminal.store[RESOURCE_HYDROGEN] + storage.store[RESOURCE_HYDROGEN] >= 1000 && terminal.store[RESOURCE_KEANIUM] + storage.store[RESOURCE_KEANIUM] >= 1000) {
                lab1Input = RESOURCE_HYDROGEN;
                lab2Input = RESOURCE_KEANIUM;
                currentOutput = RESOURCE_KEANIUM_ACID;
            }

        else if((storage && storage.store[RESOURCE_KEANIUM_ACID] < 1000 && currentOutput != RESOURCE_KEANIUM_ACID ||
            storage && storage.store[RESOURCE_KEANIUM_ACID] < 3000 && currentOutput == RESOURCE_KEANIUM_ACID) &&
            terminal.store[RESOURCE_HYDROXIDE] + storage.store[RESOURCE_HYDROXIDE] >= 1000 && terminal.store[RESOURCE_KEANIUM_ACID] + storage.store[RESOURCE_KEANIUM_ACID] >= 1000) {
                lab1Input = RESOURCE_HYDROXIDE
                lab2Input = RESOURCE_KEANIUM_HYDRIDE;
                currentOutput = RESOURCE_KEANIUM_ACID;
            }

        else if(storage && storage.store[RESOURCE_CATALYZED_KEANIUM_ACID] < 10000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_KEANIUM_ACID] + storage.store[RESOURCE_KEANIUM_ACID] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_KEANIUM_ACID;
                currentOutput = RESOURCE_CATALYZED_KEANIUM_ACID;
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
        else if(storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] < 75000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_LEMERGIUM_ACID] + storage.store[RESOURCE_LEMERGIUM_ACID] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_LEMERGIUM_ACID;
                currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ACID;
            }
        else if(storage && storage.store[RESOURCE_CATALYZED_UTRIUM_ACID] < 55000 &&
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
        else if(storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] < 55000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_LEMERGIUM_ALKALIDE] + storage.store[RESOURCE_LEMERGIUM_ALKALIDE] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_LEMERGIUM_ALKALIDE;
            currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE;
        }
        else if(storage && storage.store[RESOURCE_CATALYZED_KEANIUM_ALKALIDE] < 55000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_KEANIUM_ALKALIDE] + storage.store[RESOURCE_KEANIUM_ALKALIDE] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_KEANIUM_ALKALIDE;
            currentOutput = RESOURCE_CATALYZED_KEANIUM_ALKALIDE;
        }
        else if(storage && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ACID] < 35000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM_ACID] + storage.store[RESOURCE_ZYNTHIUM_ACID] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_ZYNTHIUM_ACID;
            currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ACID;
        }

        else if(storage && storage.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] < 35000 &&
            terminal.store[RESOURCE_GHODIUM_ALKALIDE] + storage.store[RESOURCE_GHODIUM_ALKALIDE] >= 1000 && terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000) {
            lab1Input = RESOURCE_GHODIUM_ALKALIDE;
            lab2Input = RESOURCE_CATALYST;
            currentOutput = RESOURCE_CATALYZED_GHODIUM_ALKALIDE;
        }


        else if(storage && storage.store[RESOURCE_CATALYZED_KEANIUM_ACID] < 25000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_KEANIUM_ACID] + storage.store[RESOURCE_KEANIUM_ACID] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_KEANIUM_ACID;
                currentOutput = RESOURCE_CATALYZED_KEANIUM_ACID;
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


    if(Game.cpu.bucket > 4500) {
        if(outputLab1 && outputLab1.cooldown == 0 && outputLab1.store.getFreeCapacity() != 0) {
            if(inputLab1 && inputLab1.store[lab1Input] >= 5 && inputLab2 && inputLab2.store[lab2Input] >= 5) {
                if(room.memory.labs.status.boost && room.memory.labs.status.boost.lab1 && room.memory.labs.status.boost.lab1.use == 0 && (!room.memory.labs.status.boost.lab1.amount || room.memory.labs.status.boost.lab1.amount == 0)) {
                    const pausedLab1 = room.memory.labs.paused?.find((lab) => lab.id === outputLab1.id && lab.timer > 0);
                    (pausedLab1 && pausedLab1.timer--) ? undefined : outputLab1.runReaction(inputLab1, inputLab2);
                }
                else if(!room.memory.labs.status.boost|| !room.memory.labs.status.boost.lab1) {
                    const pausedLab1 = room.memory.labs.paused?.find((lab) => lab.id === outputLab1.id && lab.timer > 0);
                    (pausedLab1 && pausedLab1.timer--) ? undefined : outputLab1.runReaction(inputLab1, inputLab2);
                }
            }
        }
        if(outputLab2 && outputLab2.cooldown == 0 && outputLab2.store.getFreeCapacity() != 0) {
            if(inputLab1 && inputLab1.store[lab1Input] >= 5 && inputLab2 && inputLab2.store[lab2Input] >= 5) {
                if(room.memory.labs.status.boost && room.memory.labs.status.boost.lab2 && room.memory.labs.status.boost.lab2.use == 0 && (!room.memory.labs.status.boost.lab2.amount || room.memory.labs.status.boost.lab2.amount == 0)) {
                    const pausedLab2 = room.memory.labs.paused?.find((lab) => lab.id === outputLab2.id && lab.timer > 0);
                    (pausedLab2 && pausedLab2.timer--) ? undefined : outputLab2.runReaction(inputLab1, inputLab2);
                }
                else if(!room.memory.labs.status.boost || !room.memory.labs.status.boost.lab2) {
                    const pausedLab2 = room.memory.labs.paused?.find((lab) => lab.id === outputLab2.id && lab.timer > 0);
                    (pausedLab2 && pausedLab2.timer--) ? undefined : outputLab2.runReaction(inputLab1, inputLab2);
                }
            }
        }
        if(outputLab3 && outputLab3.cooldown == 0 && outputLab3.store.getFreeCapacity() != 0) {
            if(inputLab1 && inputLab1.store[lab1Input] >= 5 && inputLab2 && inputLab2.store[lab2Input] >= 5) {
                if(room.memory.labs.status.boost && room.memory.labs.status.boost.lab3 && room.memory.labs.status.boost.lab3.use == 0 && (!room.memory.labs.status.boost.lab3.amount || room.memory.labs.status.boost.lab3.amount == 0)) {
                    const pausedLab3 = room.memory.labs.paused?.find((lab) => lab.id === outputLab3.id && lab.timer > 0);
                    (pausedLab3 && pausedLab3.timer--) ? undefined : outputLab3.runReaction(inputLab1, inputLab2);
                }
                else if(!room.memory.labs.status.boost || !room.memory.labs.status.boost.lab3) {
                    const pausedLab3 = room.memory.labs.paused?.find((lab) => lab.id === outputLab3.id && lab.timer > 0);
                    (pausedLab3 && pausedLab3.timer--) ? undefined : outputLab3.runReaction(inputLab1, inputLab2);
                }
            }
        }
        if(outputLab4 && outputLab4.cooldown == 0 && outputLab4.store.getFreeCapacity() != 0) {
            if(inputLab1 && inputLab1.store[lab1Input] >= 5 && inputLab2 && inputLab2.store[lab2Input] >= 5) {
                if(room.memory.labs.status.boost && room.memory.labs.status.boost.lab4 && room.memory.labs.status.boost.lab4.use == 0 && (!room.memory.labs.status.boost.lab4.amount || room.memory.labs.status.boost.lab4.amount == 0)) {
                    const pausedLab4 = room.memory.labs.paused?.find((lab) => lab.id === outputLab4.id && lab.timer > 0);
                    (pausedLab4 && pausedLab4.timer--) ? undefined : outputLab4.runReaction(inputLab1, inputLab2);
                }
                else if(!room.memory.labs.status.boost || !room.memory.labs.status.boost.lab4) {
                    const pausedLab4 = room.memory.labs.paused?.find((lab) => lab.id === outputLab4.id && lab.timer > 0);
                    (pausedLab4 && pausedLab4.timer--) ? undefined : outputLab4.runReaction(inputLab1, inputLab2);
                }
            }
        }
        if(outputLab5 && outputLab5.cooldown == 0 && outputLab5.store.getFreeCapacity() != 0) {
            if(inputLab1 && inputLab1.store[lab1Input] >= 5 && inputLab2 && inputLab2.store[lab2Input] >= 5) {
                if(room.memory.labs.status.boost && room.memory.labs.status.boost.lab5 && !room.memory.labs.status.boost.lab5.use && (!room.memory.labs.status.boost.lab5.amount || room.memory.labs.status.boost.lab5.amount == 0)) {
                    const pausedLab5 = room.memory.labs.paused?.find((lab) => lab.id === outputLab5.id && lab.timer > 0);
                    (pausedLab5 && pausedLab5.timer--) ? undefined : outputLab5.runReaction(inputLab1, inputLab2);
                }
                else if(!room.memory.labs.status.boost || !room.memory.labs.status.boost.lab5) {
                    const pausedLab5 = room.memory.labs.paused?.find((lab) => lab.id === outputLab5.id && lab.timer > 0);
                    (pausedLab5 && pausedLab5.timer--) ? undefined : outputLab5.runReaction(inputLab1, inputLab2);
                }
            }
        }
        if(outputLab6 && outputLab6.cooldown == 0 && outputLab6.store.getFreeCapacity() != 0) {
            if(inputLab1 && inputLab1.store[lab1Input] >= 5 && inputLab2 && inputLab2.store[lab2Input] >= 5) {
                if(room.memory.labs.status.boost && room.memory.labs.status.boost.lab6 && room.memory.labs.status.boost.lab6.use == 0 && (!room.memory.labs.status.boost.lab6.amount || room.memory.labs.status.boost.lab6.amount == 0)) {
                    const pausedLab6 = room.memory.labs.paused?.find((lab) => lab.id === outputLab6.id && lab.timer > 0);
                    (pausedLab6 && pausedLab6.timer--) ? undefined : outputLab6.runReaction(inputLab1, inputLab2);
                }
                else if(!room.memory.labs.status.boost || !room.memory.labs.status.boost.lab6) {
                    const pausedLab6 = room.memory.labs.paused?.find((lab) => lab.id === outputLab6.id && lab.timer > 0);
                    (pausedLab6 && pausedLab6.timer--) ? undefined : outputLab6.runReaction(inputLab1, inputLab2);
                }
            }
        }
        if(outputLab7 && outputLab7.cooldown == 0 && outputLab7.store.getFreeCapacity() != 0) {
            if(inputLab1 && inputLab1.store[lab1Input] >= 5 && inputLab2 && inputLab2.store[lab2Input] >= 5) {
                if(room.memory.labs.status.boost && room.memory.labs.status.boost.lab7 && room.memory.labs.status.boost.lab7.use == 0 && (!room.memory.labs.status.boost.lab7.amount || room.memory.labs.status.boost.lab7.amount == 0)) {
                    const pausedLab7 = room.memory.labs.paused?.find((lab) => lab.id === outputLab7.id && lab.timer > 0);
                    (pausedLab7 && pausedLab7.timer--) ? undefined : outputLab7.runReaction(inputLab1, inputLab2);

                }
                else if(!room.memory.labs.status.boost || !room.memory.labs.status.boost.lab7) {
                    const pausedLab7 = room.memory.labs.paused?.find((lab) => lab.id === outputLab7.id && lab.timer > 0);
                    (pausedLab7 && pausedLab7.timer--) ? undefined : outputLab7.runReaction(inputLab1, inputLab2);

                }
            }
        }
        if(outputLab8 && outputLab8.cooldown == 0 && outputLab8.store.getFreeCapacity() != 0) {
            if(inputLab1 && inputLab1.store[lab1Input] >= 5 && inputLab2 && inputLab2.store[lab2Input] >= 5) {
                if(room.memory.labs.status.boost && room.memory.labs.status.boost.lab8 && room.memory.labs.status.boost.lab8.use == 0 && (!room.memory.labs.status.boost.lab8.amount || room.memory.labs.status.boost.lab8.amount == 0)) {
                    const pausedLab8 = room.memory.labs.paused?.find((lab) => lab.id === outputLab8.id && lab.timer > 0);
                    (pausedLab8 && pausedLab8.timer--) ? undefined : outputLab8.runReaction(inputLab1, inputLab2);
                }
                else if(!room.memory.labs.status.boost || !room.memory.labs.status.boost.lab8) {
                    const pausedLab8 = room.memory.labs.paused?.find((lab) => lab.id === outputLab8.id && lab.timer > 0);
                    (pausedLab8 && pausedLab8.timer--) ? undefined : outputLab8.runReaction(inputLab1, inputLab2);
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
