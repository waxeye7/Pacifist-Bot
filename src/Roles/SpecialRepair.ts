/**
 * A little description of this function
 * @param {Creep} creep
 **/

const run = function (creep) {
    creep.Speak();

    if(creep.memory.boostlabs) {
        let result = creep.Boost();
        if(result) {
            creep.room.memory.labs.status.boost.lab2 = [creep.room.memory.labs.status.boost.lab2[0],false];
        }
        if(!result) {
            creep.room.memory.labs.status.boost.lab2 = [creep.room.memory.labs.status.boost.lab2[0],true];
            return;
        }
    }


    if(!creep.memory.rampart_to_repair) {
        let rampartLocations = [];
        for(let i = -10; i<11; i++) {
            for(let o = -10; o <11; o++) {
                if((i==10 || i==-10)) {
                    rampartLocations.push([i,o]);
                }
                else if((o==10 || o==-10)) {
                    rampartLocations.push([i,o]);
                }
            }
        }

        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        let RampartPositions = getNeighbours(storage.pos, rampartLocations);

        let Ramparts = [];

        for(let rampartposition of RampartPositions) {
            let position = new RoomPosition(rampartposition.x, rampartposition.y, creep.room.name);
            let lookForStructuresHere = position.lookFor(LOOK_STRUCTURES);

            if(lookForStructuresHere.length > 0) {
                for(let building of lookForStructuresHere) {
                    if(building.structureType == STRUCTURE_RAMPART) {
                        Ramparts.push(building);
                    }
                    else if(building.structureType == STRUCTURE_CONTAINER) {
                        let buildingsHere = building.pos.lookFor(LOOK_STRUCTURES)
                        for(let house of buildingsHere) {
                            if(house.structureType == STRUCTURE_RAMPART) {
                                creep.memory.rampart_to_repair = house.id;
                            }
                        }
                        if(creep.memory.rampart_to_repair) {
                            break;
                        }
                    }
                }
            }
        }

        if(Ramparts.length > 0) {
            if(!creep.memory.rampart_to_repair) {
                Ramparts.sort((a,b) => a.hits - b.hits);
                creep.memory.rampart_to_repair = Ramparts[0].id;
            }

        }
    }

    if(creep.memory.rampart_to_repair) {
        let target:any = Game.getObjectById(creep.memory.rampart_to_repair);


        if(target) {


            if(target.pos.x !== creep.pos.x || target.pos.y !== creep.pos.y) {
                let path = PathFinder.search(
                    creep.pos, {pos:target.pos, range:0},
                    {
                        plainCost: 1,
                        swampCost: 5,
                        maxOps: 2000,
                        maxRooms: 5,
                        roomCallback: (roomName) => roomCallbackSpecialRepair(roomName)
                    }
                    );


                path.path.forEach(spot => {
                    new RoomVisual(spot.roomName).circle(spot.x, spot.y, {fill: 'transparent', radius: .25, stroke: '#000000'});
                });
                let pos = path.path[0];
                let direction = creep.pos.getDirectionTo(pos);

                if(direction == 1) {
                    let targetRoomPosition = new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name)
                    let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                    if(lookCreep.length > 0) {
                        lookCreep[0].move(5);
                    }
                }
                else if(direction == 2) {
                    let targetRoomPosition = new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name)
                    let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                    if(lookCreep.length > 0) {
                        lookCreep[0].move(6);
                    }
                }
                else if(direction == 3) {
                    let targetRoomPosition = new RoomPosition(creep.pos.x + 1, creep.pos.y, creep.room.name)
                    let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                    if(lookCreep.length > 0) {
                        lookCreep[0].move(7);
                    }
                }
                else if(direction == 4) {
                    let targetRoomPosition = new RoomPosition(creep.pos.x + 1, creep.pos.y + 1, creep.room.name)
                    let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                    if(lookCreep.length > 0) {
                        lookCreep[0].move(8);
                    }
                }
                else if(direction == 5) {
                    let targetRoomPosition = new RoomPosition(creep.pos.x, creep.pos.y + 1, creep.room.name)
                    let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                    if(lookCreep.length > 0) {
                        lookCreep[0].move(1);
                    }
                }
                else if(direction == 6) {
                    let targetRoomPosition = new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name)
                    let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                    if(lookCreep.length > 0) {
                        lookCreep[0].move(2);
                    }
                }
                else if(direction == 7) {
                    let targetRoomPosition = new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name)
                    let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                    if(lookCreep.length > 0) {
                        lookCreep[0].move(3);
                    }
                }
                else if(direction == 8) {
                    let targetRoomPosition = new RoomPosition(creep.pos.x - 1, creep.pos.y - 1, creep.room.name)
                    let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
                    if(lookCreep.length > 0) {
                        lookCreep[0].move(4);
                    }
                }

                creep.move(direction);
            }


            // creep.moveTo(target);

            if(!creep.memory.MyContainer) {
                let structuresHere = target.pos.lookFor(LOOK_STRUCTURES);
                if(structuresHere.length > 0) {
                    for(let structure of structuresHere) {
                        if(structure.structureType == STRUCTURE_CONTAINER) {
                            creep.memory.MyContainer = structure.id;
                        }
                    }
                }
            }

            if(creep.memory.MyContainer) {

                let MyContainer:any = Game.getObjectById(creep.memory.MyContainer);


                if(!creep.memory.targets && MyContainer) {
                    let rampartIDS = [];
                    let rampartsInRange = MyContainer.pos.findInRange(creep.room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART}), 3);
                    for(let rampart of rampartsInRange) {
                        rampartIDS.push(rampart.id);
                    }
                    creep.memory.targets = rampartIDS;
                }

                if(creep.memory.targets && MyContainer) {
                    let targets = [];
                    for(let rampartid of creep.memory.targets) {
                        targets.push(Game.getObjectById(rampartid));
                    }

                    if(targets.length > 0) {
                        targets.sort((a,b) => a.hits - b.hits);
                        creep.repair(targets[0]);
                    }
                }
                else if(!MyContainer) {
                    creep.memory.MyContainer = false;
                    creep.memory.rampart_to_repair = false;
                    creep.memory.targets = false;
                }

                if(MyContainer && creep.store[RESOURCE_ENERGY] <= creep.getActiveBodyparts(WORK) && creep.pos.isNearTo(MyContainer) && MyContainer.store[RESOURCE_ENERGY] > 0) {
                    creep.withdraw(MyContainer, RESOURCE_ENERGY);
                }
            }
            else {
                let lookConstructionSitesHere = target.pos.lookFor(LOOK_CONSTRUCTION_SITES);
                if(lookConstructionSitesHere.length > 0) {
                    creep.build(lookConstructionSitesHere[0]);
                }
                else {
                    target.pos.createConstructionSite(STRUCTURE_CONTAINER);
                }
            }
        }


        else {
            creep.memory.rampart_to_repair = false;
        }
    }
    else {
        creep.memory.rampart_to_repair = false;
    }
}


function getNeighbours(tile, listOfLocations) {
    // const deltas = [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]]; not checkerboard

    // const negative_checkerboard =
    // [[0,-1],[-1,0],[1,0],[0,1],
    // [-1,-2],[1,-2],[-2,-1],[2,-1],[-2,1],[2,1],[-1,2],[1,2],
    // [-2,-3],[0,-3],[2,-3],[-3,-2],[3,-2],[-3,0],[3,0],[-3,2],[3,2],[-2,3],[0,3],[2,3],
    // [-3,-4],[-1,-4],[1,-4],[3,-4],[-4,-3],[4,-3],[-4,-1],[4,-1],[-4,1],[4,1],[-4,3],[4,3],[-3,4],[-1,4],[1,4],[3,4],
    // [-4,-5],[-2,-5],[0,-5],[2,-5],[2,-5],[4,-5],[-5,-4],[5,-4],[-5,-2],[5,-2],[-5,0],[5,0],[-5,2],[5,2],[-5,4],[5,4],[-4,5],[-2,5],[0,5],[2,5],[4,5]];

    let neighbours = [];
    listOfLocations.forEach(function(delta) {
        neighbours.push({x: tile.x + delta[0], y: tile.y + delta[1]});
    });
    return neighbours;
}


const roomCallbackSpecialRepair = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 1; y < 49; y++) {
        for(let x = 1; x < 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 5;
            }
            else if(tile == 0){
                weight = 0;
            }
            costs.set(x, y, weight);
        }
    }

    room.find(FIND_HOSTILE_CREEPS).forEach(function(creep) {
        if(creep.getActiveBodyparts(RANGED_ATTACK) > 0) {
            for(let i = -3; i <= 3; i++) {
                for(let o = -3; o <= 3; o++) {
                    costs.set(creep.pos.x + i, creep.pos.y + o, 255);
                }
            }
        }
        else if(creep.getActiveBodyparts(ATTACK)) {
            for(let i = -1; i <= 1; i++) {
                for(let o = -1; o <= 1; o++) {
                    costs.set(creep.pos.x + i, creep.pos.y + o, 255);
                }
            }
        }
        else {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
    });

    _.forEach(room.find(FIND_MY_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_RAMPART) {
            costs.set(struct.pos.x, struct.pos.y, 1);
        }
    });

    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD || struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else {
            if(struct.structureType !== STRUCTURE_RAMPART) {
                costs.set(struct.pos.x, struct.pos.y, 255);
            }
        }
    });



    for(let y = 0; y < 50; y++) {
        for(let x = 0; x < 50; x++) {
            const tile = terrain.get(x, y);
            let cost = costs.get(x,y);
            if(cost !== 255) {
                new RoomVisual(room.name).text(cost.toString(), x, y, {color: 'red', font: 0.6});
            }
        }
    }

    return costs;
}

const roleSpecialRepair = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleSpecialRepair;
