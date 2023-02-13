import { identity } from "lodash";
import randomWords from "random-words";

let checkerboard =
[[-2,-2], [2,-2], [2,0],
[-3,-3], [-1,-3],[-1,3], [1,-3], [3,-3], [-3,-1],[-3,1], [-3,3], [1,3], [3,3],
[-4,-4],[-2,-4],[0,-4],[2,-4],[4,-4],[-4,-2],[-4,2],[-4,0],[4,0],[-4,4],[-2,4],[0,4],[2,4],[4,4],
[-5,-5],[-5,3],[-3,-5],[-1,-5],[1,-5],[3,-5],[5,-5],[-5,-3],[5,-3],[-5,1],[-5,-1],[5,3],[-5,5],[-3,5],[-1,5],[1,5],[3,5],[5,5],
[-6,-6],[-4,-6],[-2,-6],[0,-6],[2,-6],[4,-6],[6,-6],[-6,-4],[6,-4],[-6,-2],[-6,0],[-6,2],[6,-2],[6,0],[6,2],[-6,4],[6,4],[-6,6],[-4,6],[-2,6],[0,6],[2,6],[4,6],[6,6],
[-5,-7],[-3,-7],[-1,-7],[1,-7],[3,-7],[5,-7],[-7,-5],[-7,-3],[-7,-1],[-7,1],[-7,3],[-7,5],[-5,7],[-3,7],[-1,7],[1,7],[3,7],[5,7],[7,5],[7,3],[7,1],[7,-1],[7,-3],[7,-5],
[0,7],[7,0],[0,-7],[-7,0],[4,7],[-4,7],[7,4],[7,-4],[4,-7],[-4,-7],[-7,4],[-7,-4]];


// let rampartLocations = [
//     [9,0],[9,1],[9,2],[9,3],[9,4],[9,5],[9,6],[9,7],[9,8],[9,9],
//     [8,9],[7,9],[6,9],[5,9],[4,9],[3,9],[2,9],[1,9],[0,9],[-1,9],[-2,9],[-3,9],[-4,9],[-5,9],[-6,9],[-7,9],[-8,9],[-9,9],
//     [-9,8],[-9,7],[-9,6],[-9,5],[-9,4],[-9,3],[-9,2],[-9,1],[-9,0],[-9,-1],[-9,-2],[-9,-3],[-9,-4],[-9,-5],[-9,-6],[-9,-7],[-9,-8],[-9,-9],
//     [-8,-9],[-7,-9],[-6,-9],[-5,-9],[-4,-9],[-3,-9],[-2,-9],[-1,-9],[0,-9],[1,-9],[2,-9],[3,-9],[4,-9],[5,-9],[6,-9],[7,-9],[8,-9],[9,-9],
//     [9,-8],[9,-7],[9,-6],[9,-5],[9,-4],[9,-3],[9,-2],[9,-1]
// ];

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

function pathBuilder(neighbors, structure, room, usingPathfinder=true) {
    let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
    let buldingAlreadyHereCount = 0;
    let constructionSitesPlaced = 0;

    let keepTheseRoads = [];


    if(structure == STRUCTURE_RAMPART && !usingPathfinder) {

        let listOfRampartPositions = []

        let positionArray = [];
        _.forEach(neighbors, function(block) {
            positionArray.push(new RoomPosition(block.x, block.y, room.name))
        });
        positionArray.sort((a,b) => a.findPathTo(storage, {ignoreCreeps:true}).length - b.findPathTo(storage, {ignoreCreeps:true}).length);
        _.forEach(positionArray, function(blockSpot) {
            new RoomVisual(blockSpot.roomName).circle(blockSpot.x, blockSpot.y, {fill: 'transparent', radius: 0.25, stroke: '#000000'});
            let lookForExistingConstructionSites = blockSpot.lookFor(LOOK_CONSTRUCTION_SITES);
            let lookForExistingStructures = blockSpot.lookFor(LOOK_STRUCTURES);
            let lookForTerrain = blockSpot.lookFor(LOOK_TERRAIN);

            for(let building of lookForExistingStructures) {
                if(building.structureType == STRUCTURE_RAMPART && building.hits > 5000000) {
                    return;
                }
            }

            if(lookForExistingConstructionSites.length > 0) {
                return;
            }

            if(lookForTerrain[0] != "swamp" && lookForTerrain[0] != "plain") {
                return;
            }


            let pathFromRampartToStorage = PathFinder.search(blockSpot, {pos:storage.pos, range:1}, {plainCost: 1, swampCost: 2, maxCost:50, roomCallback: () => RampartBorderCallbackFunction(room.name)});


            if(pathFromRampartToStorage.incomplete) {
                return;
            }



            let exits = Game.map.describeExits(room.name);
            let incomplete = true;
            if(exits[1] && incomplete) {

                let positionInRoom = new RoomPosition(25, 25, exits[1]);
                let pathFromRampartToOtherRoom = PathFinder.search(blockSpot, {pos:positionInRoom, range:22}, {plainCost: 1, swampCost: 1, maxCost:100, roomCallback: () => RampartBorderCallbackFunction(room.name)});


                if(!pathFromRampartToOtherRoom.incomplete) {
                    incomplete = false;
                }
            }


            if(exits[3] && incomplete) {

                let positionInRoom = new RoomPosition(25, 25, exits[3]);
                let pathFromRampartToOtherRoom = PathFinder.search(blockSpot, {pos:positionInRoom, range:22}, {plainCost: 1, swampCost: 1, maxCost:100, roomCallback: () => RampartBorderCallbackFunction(room.name)});


                if(!pathFromRampartToOtherRoom.incomplete) {
                    incomplete = false;
                }
            }

            if(exits[5] && incomplete) {

                let positionInRoom = new RoomPosition(25, 25, exits[5]);
                let pathFromRampartToOtherRoom = PathFinder.search(blockSpot, {pos:positionInRoom, range:22}, {plainCost: 1, swampCost: 1, maxCost:100, roomCallback: () => RampartBorderCallbackFunction(room.name)});


                if(!pathFromRampartToOtherRoom.incomplete) {
                    incomplete = false;
                }
            }
            if(exits[7] && incomplete) {

                let positionInRoom = new RoomPosition(25, 25, exits[7]);
                let pathFromRampartToOtherRoom = PathFinder.search(blockSpot, {pos:positionInRoom, range:22}, {plainCost: 1, swampCost: 1, maxCost:100, roomCallback: () => RampartBorderCallbackFunction(room.name)});


                if(!pathFromRampartToOtherRoom.incomplete) {
                    incomplete = false;
                }
            }


            if(incomplete) {
                if(lookForExistingStructures.length > 0) {
                    for(let i=0; i<lookForExistingStructures.length; i++) {
                        if(lookForExistingStructures[i].structureType == STRUCTURE_RAMPART) {
                            lookForExistingStructures[i].destroy();
                        }
                    }
                }
                return;
            }



            if(lookForExistingStructures.length == 1 && lookForExistingStructures[0].structureType == STRUCTURE_RAMPART) {
                return;
            }




            if(lookForExistingStructures.length == 0) {
                listOfRampartPositions.push([blockSpot.x, blockSpot.y])
                // blockSpot.createConstructionSite(structure);
                return;
            }
            if(lookForExistingStructures.length == 1 && lookForExistingStructures[0].structureType != STRUCTURE_RAMPART && blockSpot.findPathTo(storage, {ignoreCreeps:true}).length <= 14) {
                // blockSpot.createConstructionSite(structure);
                listOfRampartPositions.push([blockSpot.x, blockSpot.y])
                return;
            }
            if(lookForExistingStructures.length == 2 && lookForExistingStructures[0].structureType != STRUCTURE_RAMPART && lookForExistingStructures[1].structureType != STRUCTURE_RAMPART) {
                // blockSpot.createConstructionSite(structure);
                listOfRampartPositions.push([blockSpot.x, blockSpot.y])
                return;
            }
        });
        room.memory.construction.rampartLocations = listOfRampartPositions;
    }


    if (structure == STRUCTURE_EXTENSION) {
        let rampartsInRoomRange10FromStorage = room.find(FIND_MY_STRUCTURES).filter(function(s) {return s.structureType == STRUCTURE_RAMPART && s.pos.getRangeTo(storage) >= 8 && s.pos.getRangeTo(storage) <= 10;});
        _.forEach(neighbors, function(block) {
            if(block.x < 1 || block.x > 48 || block.y < 1 || block.y > 48) {
                return;
            }
            let blockSpot = new RoomPosition(block.x, block.y, room.name);
            let lookForExistingConstructionSites = blockSpot.lookFor(LOOK_CONSTRUCTION_SITES);
            let lookForExistingStructures = blockSpot.lookFor(LOOK_STRUCTURES);
            let lookForTerrain = blockSpot.lookFor(LOOK_TERRAIN);

            let sources = room.find(FIND_SOURCES);



            if(blockSpot.x <= 4 || blockSpot.x >= 45 || blockSpot.y <= 4 || blockSpot.y >= 45) {
                let closestRampart = blockSpot.findClosestByRange(rampartsInRoomRange10FromStorage)
                if(blockSpot.getRangeTo(closestRampart) < 3) {
                    return;
                }
            }

            for(let source of sources) {
                if(blockSpot.getRangeTo(source) <= 2) {
                    return;
                }
            }

            if(blockSpot.getRangeTo(storage) > 10) {
                return;
            }

            let Mineral:any = Game.getObjectById(room.memory.mineral) || room.findMineral();

            if(blockSpot.getRangeTo(room.controller) <= 3 || blockSpot.getRangeTo(Mineral) <= 1) {
                buldingAlreadyHereCount ++;
                return;
            }

            if(blockSpot.getRangeTo(storage) > 10) {
                return;
            }

            if(storage && PathFinder.search(blockSpot, storage.pos).path.length > 11) {
                return;
            }

            if(storage && storage.pos.getRangeTo(blockSpot) == 7) {
                if(blockSpot.x >= storage.pos.x) {
                    let lookForTerrainToLeft = new RoomPosition(blockSpot.x - 1,blockSpot.y, room.name).lookFor(LOOK_TERRAIN);
                    if(lookForTerrainToLeft[0] == "wall") {
                        return;
                    }
                }
                if(blockSpot.x <= storage.pos.x) {
                    let lookForTerrainToRight = new RoomPosition(blockSpot.x + 1,blockSpot.y, room.name).lookFor(LOOK_TERRAIN);
                    if(lookForTerrainToRight[0] == "wall") {
                        return;
                    }
                }
                if(blockSpot.y >= storage.pos.y) {
                    let lookForTerrainToTop = new RoomPosition(blockSpot.x,blockSpot.y - 1, room.name).lookFor(LOOK_TERRAIN);
                    if(lookForTerrainToTop[0] == "wall") {
                        return;
                    }
                }
                if(blockSpot.y <= storage.pos.y) {
                    let lookForTerrainToBottom = new RoomPosition(blockSpot.x,blockSpot.y + 1, room.name).lookFor(LOOK_TERRAIN);
                    if(lookForTerrainToBottom[0] == "wall") {
                        return;
                    }
                }
            }


            new RoomVisual(blockSpot.roomName).circle(blockSpot.x, blockSpot.y, {fill: '#000000', radius: 0.25, stroke: '#FABFAB'});

            if(lookForExistingStructures.length == 1 && lookForExistingStructures[0].structureType == STRUCTURE_ROAD) {
                if (lookForTerrain[0] == "swamp" || lookForTerrain[0] == "plain") {
                    constructionSitesPlaced ++;
                    let result = blockSpot.createConstructionSite(structure);
                    // if(result == 0) {
                    // if(result !== -8 && result !== -14) {
                        // lookForExistingStructures[0].destroy();
                    // }
                }
            }



            if(lookForExistingStructures.length != 0 || lookForExistingConstructionSites.length != 0) {
                buldingAlreadyHereCount ++;
                return;
            }


            if (lookForTerrain[0] == "swamp" || lookForTerrain[0] == "plain") {
                constructionSitesPlaced ++;
                blockSpot.createConstructionSite(structure);
                return;
            }
        });
    }
    else if(!usingPathfinder && structure == STRUCTURE_ROAD) {
        _.forEach(neighbors, function(block) {
            if(block.x < 1 || block.x > 48 || block.y < 1 || block.y > 48) {
                return;
            }
            let lookForExistingConstructionSites = block.lookFor(LOOK_CONSTRUCTION_SITES);
            let lookForExistingStructures = block.lookFor(LOOK_STRUCTURES);
            let lookForTerrain = block.lookFor(LOOK_TERRAIN);

            if(structure == STRUCTURE_ROAD) {
                new RoomVisual(block.roomName).circle(block.x, block.y, {fill: 'transparent', radius: 0.25, stroke: 'orange'});
            }

            _.forEach(lookForExistingStructures, function(building) {
                if(building.structureType == STRUCTURE_ROAD || building.structureType == STRUCTURE_CONTAINER) {
                    keepTheseRoads.push(building.id);
                }
            });

            _.forEach(keepTheseRoads, function(road) {
                if(Game.rooms[block.roomName] && Game.rooms[block.roomName].memory && Game.rooms[block.roomName].memory.keepTheseRoads && !_.includes(Game.rooms[block.roomName].memory.keepTheseRoads, road, 0)) {
                    Game.rooms[block.roomName].memory.keepTheseRoads.push(road);
                }
            });




            if(structure == STRUCTURE_ROAD && lookForExistingStructures.length == 1 && lookForExistingStructures[0].structureType == STRUCTURE_RAMPART && lookForExistingConstructionSites.length == 0) {
                constructionSitesPlaced ++;
                Game.rooms[block.roomName].createConstructionSite(block.x, block.y, structure);
                return;
            }

            if(structure == STRUCTURE_ROAD && lookForExistingStructures.length == 1 && lookForExistingStructures[0].structureType == STRUCTURE_CONTAINER && lookForExistingConstructionSites.length == 0) {
                constructionSitesPlaced ++;
                Game.rooms[block.roomName].createConstructionSite(block.x, block.y, structure);
                return;
            }



            if(lookForExistingStructures.length != 0 || lookForExistingConstructionSites.length != 0) {
                buldingAlreadyHereCount ++;
                return;
            }


            if(lookForTerrain[0] == "swamp" || lookForTerrain[0] == "plain") {
                constructionSitesPlaced ++;
                Game.rooms[block.roomName].createConstructionSite(block.x, block.y, structure);
                return;
            }
        });
    }
    else {
        _.forEach(neighbors.path, function(block) {
            if(block.x < 1 || block.x > 48 || block.y < 1 || block.y > 48) {
                return;
            }

            let lookForExistingConstructionSites = block.lookFor(LOOK_CONSTRUCTION_SITES);
            let lookForExistingStructures = block.lookFor(LOOK_STRUCTURES);
            let lookForTerrain = block.lookFor(LOOK_TERRAIN);

            if(structure == STRUCTURE_ROAD) {
                new RoomVisual(block.roomName).circle(block.x, block.y, {fill: 'transparent', radius: 0.45, stroke: 'orange'});
            }

            _.forEach(lookForExistingStructures, function(building) {
                if(building.structureType == STRUCTURE_ROAD || building.structureType == STRUCTURE_CONTAINER) {
                    keepTheseRoads.push(building.id);
                }
            });

            _.forEach(keepTheseRoads, function(road) {
                if(Game.rooms[block.roomName] && Game.rooms[block.roomName].memory && Game.rooms[block.roomName].memory.keepTheseRoads && !_.includes(Game.rooms[block.roomName].memory.keepTheseRoads, road, 0)) {
                    Game.rooms[block.roomName].memory.keepTheseRoads.push(road);
                }
            });




            if(structure == STRUCTURE_ROAD && lookForExistingStructures.length == 1 && lookForExistingStructures[0].structureType == STRUCTURE_RAMPART && lookForExistingConstructionSites.length == 0) {
                constructionSitesPlaced ++;
                Game.rooms[block.roomName].createConstructionSite(block.x, block.y, structure);
                return;
            }

            if(structure == STRUCTURE_ROAD && lookForExistingStructures.length == 1 && lookForExistingStructures[0].structureType == STRUCTURE_CONTAINER && lookForExistingConstructionSites.length == 0) {
                constructionSitesPlaced ++;
                Game.rooms[block.roomName].createConstructionSite(block.x, block.y, structure);
                return;
            }

            if(lookForExistingStructures.length != 0 || lookForExistingConstructionSites.length != 0) {
                buldingAlreadyHereCount ++;
                return;
            }

            if (lookForTerrain[0] == "swamp" || lookForTerrain[0] == "plain") {
                if(structure == STRUCTURE_ROAD && Game.rooms[block.roomName].find(FIND_MY_CONSTRUCTION_SITES).length >= 12) {
                    buldingAlreadyHereCount ++;
                    return;
                }
                else {
                    constructionSitesPlaced ++;
                    Game.rooms[block.roomName].createConstructionSite(block.x, block.y, structure);
                    return;
                }
            }
        });
    }

    console.log(room.name , structure, "[", buldingAlreadyHereCount, "buildings here already ]", "[", constructionSitesPlaced, "construction sites placed ]");
    return (buldingAlreadyHereCount + constructionSitesPlaced);
}



function rampartPerimeter(tile) {
    const perimeter =
    [[0,-12],[1,-12],[2,-12],[3,-12],[4,-12],[5,-12],[6,-12],[7,-12],[8,-12],[9,-12],[10,-12],[11,-12],[12,-12],
    [12,-11],[12,-10],[12,-9],[12,-8],[12,-7],[12,-6],[12,-5],[12,-4],[12,-3],[12,-2],[12,-1],[12,0],[12,1],[12,2],[12,3],[12,4],[12,5],[12,6],[12,7],[12,8],[12,9],[12,10],[12,11],[12,12],
    [11,12],[10,12],[9,12],[8,12],[7,12],[6,12],[5,12],[4,12],[3,12],[2,12],[1,12],[0,12],[-1,12],[-2,12],[-3,12],[-4,12],[-5,12],[-6,12],[-7,12],[-8,12],[-9,12],[-10,12],[-11,12],[-12,12],
    [-12,11],[-12,10],[-12,9],[-12,8],[-12,7],[-12,6],[-12,5],[-12,4],[-12,3],[-12,2],[-12,1],[-12,0],[-12,-1],[-12,-2],[-12,-3],[-12,-4],[-12,-5],[-12,-6],[-12,-7],[-12,-8],[-12,-9],[-12,-10],[-12,-11],[-12,-12],
    [-11,-12],[-10,-12],[-9,-12],[-8,-12],[-7,-12],[-6,-12],[-5,-12],[-4,-12],[-3,-12],[-2,-12],[-1,-12]];


    let neighbours = [];
    perimeter.forEach(function(delta) {
        neighbours.push({x: tile.x + delta[0], y: tile.y + delta[1]});
    });
    return neighbours;
}



function construction(room) {
    if(!room.memory.construction) {
        room.memory.construction = {};
    }


    if(room.controller.level == 1 && room.find(FIND_MY_SPAWNS).length == 0 && room.find(FIND_MY_CONSTRUCTION_SITES).length == 0 && Memory.target_colonise.room == room.name) {
        let position = Memory.target_colonise.spawn_pos
        Game.rooms[Memory.target_colonise.room].createConstructionSite(position.x, position.y, STRUCTURE_SPAWN, randomWords({exactly:2,wordsPerString:1,join: '-'}));
        return;
    }


    if(room.memory.danger) {
        return;
    }

    let myConstructionSites = room.find(FIND_MY_CONSTRUCTION_SITES).length



    let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();

    if(room.controller.level >= 5) {
        let nukes = room.find(FIND_NUKES);
        if(nukes.length > 0) {
            for(let nuke of nukes) {
                if(nuke.pos.getRangeTo(storage) > 7 && nuke.pos.getRangeTo(storage) < 13) {
                    let perimeter = [
                        new RoomPosition(nuke.pos.x + 3, nuke.pos.y, room.name),
                        new RoomPosition(nuke.pos.x + 3, nuke.pos.y - 1, room.name),
                        new RoomPosition(nuke.pos.x + 3, nuke.pos.y + 1, room.name),
                        new RoomPosition(nuke.pos.x + 3, nuke.pos.y - 2, room.name),
                        new RoomPosition(nuke.pos.x + 3, nuke.pos.y + 2, room.name),
                        new RoomPosition(nuke.pos.x + 3, nuke.pos.y - 3, room.name),
                        new RoomPosition(nuke.pos.x + 3, nuke.pos.y + 3, room.name),
                        new RoomPosition(nuke.pos.x + 2, nuke.pos.y - 3, room.name),
                        new RoomPosition(nuke.pos.x + 2, nuke.pos.y + 3, room.name),
                        new RoomPosition(nuke.pos.x + 1, nuke.pos.y - 3, room.name),
                        new RoomPosition(nuke.pos.x + 1, nuke.pos.y + 3, room.name),
                        new RoomPosition(nuke.pos.x, nuke.pos.y - 3, room.name),
                        new RoomPosition(nuke.pos.x, nuke.pos.y + 3, room.name),
                        new RoomPosition(nuke.pos.x - 3, nuke.pos.y, room.name),
                        new RoomPosition(nuke.pos.x - 3, nuke.pos.y - 1, room.name),
                        new RoomPosition(nuke.pos.x - 3, nuke.pos.y + 1, room.name),
                        new RoomPosition(nuke.pos.x - 3, nuke.pos.y - 2, room.name),
                        new RoomPosition(nuke.pos.x - 3, nuke.pos.y + 2, room.name),
                        new RoomPosition(nuke.pos.x - 3, nuke.pos.y - 3, room.name),
                        new RoomPosition(nuke.pos.x - 3, nuke.pos.y + 3, room.name),
                        new RoomPosition(nuke.pos.x - 2, nuke.pos.y - 3, room.name),
                        new RoomPosition(nuke.pos.x - 2, nuke.pos.y + 3, room.name),
                        new RoomPosition(nuke.pos.x - 1, nuke.pos.y - 3, room.name),
                        new RoomPosition(nuke.pos.x - 1, nuke.pos.y + 3, room.name)
                    ];
                    for(let position of perimeter) {
                        if(position.getRangeTo(storage) > 10) {
                            position.createConstructionSite(STRUCTURE_RAMPART);
                        }
                    }
                }
            }
        }
    }


    if(room.controller.level >= 3 && storage && myConstructionSites == 0) {

        let rampartLocations = [];
        for(let i = -10; i<11; i++) {
            for(let o = -10; o <11; o++) {
                if((i==10 || i==-10)) {
                    let combinedX = storage.pos.x + i;
                    if(combinedX >= 2 && combinedX <= 47) {
                        rampartLocations.push([i,o]);
                    }
                    else {
                        if(combinedX == 48) {
                            rampartLocations.push([i-1,o]);
                        }
                        else if(combinedX == 49) {
                            rampartLocations.push([i-2,o]);
                        }
                        else if(combinedX == 1) {
                            rampartLocations.push([i+1,o]);
                        }
                        else if(combinedX == 0) {
                            rampartLocations.push([i+2,o]);
                        }
                    }

                }
                else if((o==10 || o==-10)) {
                    let combinedY = storage.pos.y + o;
                    if(combinedY >= 2 && combinedY <= 47) {
                        rampartLocations.push([i,o]);
                    }
                    else {
                        if(combinedY == 48) {
                            rampartLocations.push([i,o-1]);
                        }
                        else if(combinedY == 49) {
                            rampartLocations.push([i,o-2]);
                        }
                        else if(combinedY == 1) {
                            rampartLocations.push([i,o+1]);
                        }
                        else if(combinedY == 0) {
                            rampartLocations.push([i,o+2]);
                        }
                    }
                }
            }
        }

        let storageRampartNeighbors = getNeighbours(storage.pos, rampartLocations);
        let filteredStorageRampartNeighbors = storageRampartNeighbors.filter(position => position.x > 0 && position.x < 49 && position.y > 0 && position.y < 49);
        pathBuilder(filteredStorageRampartNeighbors, STRUCTURE_RAMPART, room, false);
    }


    if(room.controller.level >= 1 && room.memory.Structures.spawn) {
        let spawn = Game.getObjectById(room.memory.Structures.spawn) || room.findSpawn();

        if(room.controller.level >= 3) {
            if(spawn) {
                let spawnlocationlook = spawn.pos.lookFor(LOOK_STRUCTURES);
                if(spawnlocationlook.length == 1) {
                    spawn.pos.createConstructionSite(STRUCTURE_RAMPART);
                }
            }
            if(storage) {
                let storagelocationlook = storage.pos.lookFor(LOOK_STRUCTURES);
                if(storagelocationlook.length == 1) {
                    storage.pos.createConstructionSite(STRUCTURE_RAMPART);
                }
            }
        }

            // var index = array.indexOf(item);
            // if (index !== -1) {
            //   array.splice(index, 1);
            // }


            if(storage ) {
                let LabLocations = [];

                let first_location_good = true;
                let testLabLocations = [];
                testLabLocations.push(new RoomPosition(storage.pos.x - 4, storage.pos.y + 1, room.name));
                testLabLocations.push(new RoomPosition(storage.pos.x - 4, storage.pos.y + 2, room.name));
                testLabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y, room.name));
                testLabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y + 1, room.name));
                testLabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y + 2, room.name));
                testLabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y + 3, room.name));
                testLabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y + 3, room.name));
                testLabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y + 2, room.name));
                testLabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y + 1, room.name));
                testLabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y, room.name));
                for(let location of testLabLocations) {
                    let lookForWall = location.lookFor(LOOK_TERRAIN);
                    if(lookForWall.length > 0) {
                        if(lookForWall[0] == "wall") {
                            first_location_good = false;
                        }
                    }
                }


                if(first_location_good) {
                    LabLocations.push(new RoomPosition(storage.pos.x - 4, storage.pos.y + 1, room.name));

                    LabLocations.push(new RoomPosition(storage.pos.x - 4, storage.pos.y + 2, room.name));

                    LabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y, room.name));

                    if(room.controller.level >= 7) {
                        LabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y + 1, room.name));

                        LabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y + 2, room.name));

                        LabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y + 3, room.name));
                    }
                    if(room.controller.level == 8) {
                        LabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y + 3, room.name));

                        LabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y + 2, room.name));

                        LabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y + 1, room.name));

                        LabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y, room.name));
                    }

                }
                else if(!first_location_good) {
                    LabLocations = [];

                    LabLocations.push(new RoomPosition(storage.pos.x + 4, storage.pos.y + 4, room.name));

                    LabLocations.push(new RoomPosition(storage.pos.x + 4, storage.pos.y + 5, room.name));

                    LabLocations.push(new RoomPosition(storage.pos.x + 3, storage.pos.y + 3, room.name));

                    if(room.controller.level >= 7) {
                        LabLocations.push(new RoomPosition(storage.pos.x + 3, storage.pos.y + 4, room.name));

                        LabLocations.push(new RoomPosition(storage.pos.x + 3, storage.pos.y + 5, room.name));

                        LabLocations.push(new RoomPosition(storage.pos.x + 3, storage.pos.y + 6, room.name));
                    }
                    if(room.controller.level == 8) {
                        LabLocations.push(new RoomPosition(storage.pos.x + 5, storage.pos.y + 3, room.name));

                        LabLocations.push(new RoomPosition(storage.pos.x + 5, storage.pos.y + 4, room.name));

                        LabLocations.push(new RoomPosition(storage.pos.x + 5, storage.pos.y + 5, room.name));

                        LabLocations.push(new RoomPosition(storage.pos.x + 5, storage.pos.y + 6, room.name));
                    }
                }


                if(!first_location_good) {

                    checkerboard = [
                        [-2,-2], [2,-2], [2,0],
                        [-3,-3], [-1,-3],[-1,3], [1,-3], [3,-3], [-3,-1],[-3,1], [-3,3], [1,3],[-3,-2],[-3,2],[3,-2],[3,1],[3,-1],
                        [-4,-4],[-2,-4],[0,-4],[2,-4],[4,-4],[-4,-2],[-4,2],[-4,0],[-4,4],[-2,4],[0,4],[4,2],[4,-2],
                        [-5,-5],[-5,3],[-3,-5],[-1,-5],[1,-5],[3,-5],[5,-5],[-5,-3],[5,-3],[-5,1],[-5,-1],[-5,5],[-3,5],[-1,5],[1,5],[0,5],[0,-5],[-5,0],[5,1],[5,-1],
                        [-6,-6],[-4,-6],[-2,-6],[0,-6],[2,-6],[4,-6],[6,-6],[-6,-4],[6,-4],[-6,-2],[-6,0],[-6,2],[6,-2],[6,0],[6,2],[-6,4],[-6,6],[-4,6],[-2,6],[0,6],[2,6],[4,6],[6,6],
                        [-5,-7],[-3,-7],[-1,-7],[1,-7],[3,-7],[5,-7],[-7,-5],[-7,-3],[-7,-1],[-7,1],[-7,3],[-7,5],[-5,7],[-3,7],[-1,7],[1,7],[3,7],[5,7],[7,5],[7,3],[7,1],[7,-1],[7,-3],[7,-5],
                        [0,7],[7,0],[0,-7],[-7,0],[4,7],[-4,7],[7,4],[7,-4],[4,-7],[-4,-7],[-7,4],[-7,-4]
                    ];

                }
                else {
                    checkerboard = [
                        [-2,-2], [2,-2], [2,0],
                        [-3,-3], [-1,-3],[-1,3], [1,-3], [3,-3], [1,3], [3,3],[-3,-2],[3,-2],[3,-1],[3,1],
                        [-4,-4],[-2,-4],[0,-4],[2,-4],[4,-4],[-4,-2],[-4,4],[-2,4],[0,4],[2,4],[4,4],[4,-2],[4,2],
                        [-5,-5],[-3,-5],[-1,-5],[1,-5],[3,-5],[5,-5],[-5,-3],[5,-3],[-5,-1],[5,3],[-5,5],[-3,5],[-1,5],[1,5],[3,5],[5,5],[0,5],[0,-5],[5,1],[5,-1],
                        [-6,-6],[-4,-6],[-2,-6],[0,-6],[2,-6],[4,-6],[6,-6],[-6,-4],[6,-4],[-6,-2],[6,-2],[6,0],[6,2],[-6,4],[6,4],[-6,6],[-4,6],[-2,6],[0,6],[2,6],[4,6],[6,6],
                        [-5,-7],[-3,-7],[-1,-7],[1,-7],[3,-7],[5,-7],[-7,-5],[-7,-3],[-7,-1],[-7,5],[-5,7],[-3,7],[-1,7],[1,7],[3,7],[5,7],[7,5],[7,3],[7,1],[7,-1],[7,-3],[7,-5],
                        [0,7],[7,0],[0,-7],[4,7],[-4,7],[7,4],[7,-4],[4,-7],[-4,-7],[-7,4],[-7,-4]
                    ];

                }

                if(room.controller.level >= 6 && room.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_LAB);}}).length <= 10) {

                    DestroyAndBuild(room, LabLocations, STRUCTURE_LAB);

                }
                let labsInRoom = room.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_LAB);}})
                if(labsInRoom.length > 0) {
                    for(let lab of labsInRoom) {
                        if(lab.pos.lookFor(LOOK_STRUCTURES).length == 1) {
                            lab.pos.createConstructionSite(STRUCTURE_RAMPART);
                        }
                    }
                }
            }





        if(storage) {
            let binLocation = new RoomPosition(storage.pos.x, storage.pos.y + 1, room.name);
            let lookForExistingStructuresOnBinLocation = binLocation.lookFor(LOOK_STRUCTURES);
            if(lookForExistingStructuresOnBinLocation.length > 0) {
                for(let existingStructure of lookForExistingStructuresOnBinLocation) {
                    if(existingStructure.structureType == STRUCTURE_ROAD) {
                        room.memory.keepTheseRoads.push(existingStructure.id);
                    }
                    if(existingStructure.structureType != STRUCTURE_CONTAINER && existingStructure.structureType != STRUCTURE_ROAD && existingStructure.structureType != STRUCTURE_SPAWN && existingStructure.structureType != STRUCTURE_STORAGE) {
                        existingStructure.destroy();
                    }
                }
            }
            else {
                binLocation.createConstructionSite(STRUCTURE_CONTAINER);
            }
            if(lookForExistingStructuresOnBinLocation.length == 1 && lookForExistingStructuresOnBinLocation[0].structureType == STRUCTURE_ROAD) {
                binLocation.createConstructionSite(STRUCTURE_CONTAINER);
            }

            if(room.controller.level > 4 && lookForExistingStructuresOnBinLocation.length == 1 && lookForExistingStructuresOnBinLocation[0].structureType == STRUCTURE_CONTAINER) {
                binLocation.createConstructionSite(STRUCTURE_ROAD);
            }
        }


        if(room.controller.level == 1 || room.controller.level == 2 || room.controller.level == 3) {
            let storageLocation = new RoomPosition(spawn.pos.x, spawn.pos.y -2, room.name);
            let lookForExistingStructures = storageLocation.lookFor(LOOK_STRUCTURES);
            if(lookForExistingStructures.length != 0 && lookForExistingStructures[0].structureType != STRUCTURE_CONTAINER) {
                lookForExistingStructures[0].destroy();
            }
            else {
                room.createConstructionSite(spawn.pos.x, spawn.pos.y -2, STRUCTURE_CONTAINER);
            }
        }
        let storageLocation = new RoomPosition(spawn.pos.x, spawn.pos.y -2, room.name);
        let lookForExistingStructures = storageLocation.lookFor(LOOK_STRUCTURES);
        if(room.controller.level >= 4 && !storage || room.controller.level == 4 && storage.structureType == STRUCTURE_CONTAINER) {
            if(lookForExistingStructures.length > 0) {
                if(lookForExistingStructures.length == 1 && lookForExistingStructures[0].structureType == STRUCTURE_RAMPART) {
                    room.createConstructionSite(spawn.pos.x, spawn.pos.y -2, STRUCTURE_STORAGE);
                }
                else {
                    for(let building of lookForExistingStructures) {
                        if(building.structureType == STRUCTURE_CONTAINER) {
                            building.destroy();
                        }
                    }
                    // for(let building of lookForExistingStructures) {
                    //     if(building.)
                    // }
                    lookForExistingStructures[0].destroy();
                }

            }
            else {
                room.createConstructionSite(spawn.pos.x, spawn.pos.y -2, STRUCTURE_STORAGE);
            }
        }

        if(room.controller.level >= 3) {
            if(storage) {
                let storageX = storage.pos.x;
                let storageY = storage.pos.y;
                let tower_raw_locations = [
                    [storageX + -5,storageY + -7],
                    [storageX + -3,storageY + -7],
                    [storageX + -1,storageY + -7],
                    [storageX + 1,storageY + -7],
                    [storageX + 3,storageY + -7],
                    [storageX + 5,storageY + -7],
                    [storageX + -7,storageY + -5],
                    [storageX + -7,storageY + -3],
                    [storageX + -7,storageY + -1],
                    [storageX + -7,storageY + 5],
                    [storageX + -5,storageY + 7],
                    [storageX + -3,storageY + 7],
                    [storageX + -1,storageY + 7],
                    [storageX + 1,storageY + 7],
                    [storageX + 3,storageY + 7],
                    [storageX + 5,storageY + 7],
                    [storageX + 7,storageY + 5],
                    [storageX + 7,storageY + 3],
                    [storageX + 7,storageY + 1],
                    [storageX + 7,storageY + -1],
                    [storageX + 7,storageY + -3],
                    [storageX + 7,storageY + -5],
                    [storageX + 0,storageY + 7],
                    [storageX + 7,storageY + 0],
                    [storageX + 0,storageY + -7],
                    [storageX + 4,storageY + 7],
                    [storageX + -4,storageY + 7],
                    [storageX + 7,storageY + 4],
                    [storageX + 7,storageY + -4],
                    [storageX + 4,storageY + -7],
                    [storageX + -4,storageY + -7],
                    [storageX + -7,storageY + 4],
                    [storageX + -7,storageY + -4]
                ];
                let tower_locations_to_filter = [];
                for(let raw_location of tower_raw_locations) {
                    if(raw_location[0] >= 2 && raw_location[1] >= 2 && raw_location[0] <= 47 && raw_location[1] <= 47) {
                        tower_locations_to_filter.push(new RoomPosition(raw_location[0], raw_location[1], room.name));
                    }
                }
                let tower_locations_to_shuffle = [];
                if(storage) {
                    let myRampartsRangeGreaterThanSixAndLessThanTwelve = room.find(FIND_MY_STRUCTURES).filter(function(s) {return s.structureType == STRUCTURE_RAMPART && s.pos.getRangeTo(storage) < 12 && s.pos.getRangeTo(storage) > 6;});
                    if(myRampartsRangeGreaterThanSixAndLessThanTwelve.length > 0) {
                        for(let location of tower_locations_to_filter) {
                            let closestRampartToLocation = location.getRangeTo(location.findClosestByRange(myRampartsRangeGreaterThanSixAndLessThanTwelve));
                            if(closestRampartToLocation == 3) {
                                tower_locations_to_shuffle.push(location);
                            }
                        }

                        const shuffle = arr => {
                            for (let i = arr.length - 1; i > 0; i--) {
                              const j = Math.floor(Math.random() * (i + 1));
                              const temp = arr[i];
                              arr[i] = arr[j];
                              arr[j] = temp;
                            }
                            return arr;
                        }
                        let shuffled_tower_locations = shuffle(tower_locations_to_shuffle)
                        console.log(shuffled_tower_locations);

                        BuildIfICan(shuffled_tower_locations, STRUCTURE_TOWER);
                    }

                }

            }
        }
        if(room.controller.level >= 1) {
            let sources = room.find(FIND_SOURCES);
            if(storage) {
                let pathFromStorageToSource1 = PathFinder.search(storage.pos, {pos:sources[0].pos, range:1}, {plainCost: 1, swampCost: 3, maxRooms:1, roomCallback: (roomName) => makeStructuresCostMatrix(roomName)});
                let container1 = pathFromStorageToSource1.path[pathFromStorageToSource1.path.length - 1];
                // if(room.controller.level >= 6) {
                //     pathFromStorageToSource1.path.pop();
                // }
                if(storage.pos.getRangeTo(pathFromStorageToSource1.path[pathFromStorageToSource1.path.length - 1]) > 7) {
                    container1.createConstructionSite(STRUCTURE_RAMPART);
                }

                let pathFromStorageToSource2 = PathFinder.search(storage.pos, {pos:sources[1].pos, range:1}, {plainCost: 1, swampCost: 3, maxRooms:1, roomCallback: (roomName) => makeStructuresCostMatrix(roomName)});
                let container2 = pathFromStorageToSource2.path[pathFromStorageToSource2.path.length - 1];
                // if(room.controller.level >= 6) {
                //     pathFromStorageToSource2.path.pop();
                // }
                if(storage.pos.getRangeTo(pathFromStorageToSource2.path[pathFromStorageToSource2.path.length - 1]) > 7) {
                    container2.createConstructionSite(STRUCTURE_RAMPART);
                }

                let pathFromStorageToController = PathFinder.search(storage.pos, {pos:room.controller.pos, range:1}, {plainCost: 1, swampCost: 3, maxRooms:1, roomCallback: (roomName) => makeStructuresCostMatrix(roomName)});

                pathFromStorageToController.path.pop();

                let linkLocation = pathFromStorageToController.path[pathFromStorageToController.path.length - 1];

                pathFromStorageToController.path.pop();
                let mySpawns = room.find(FIND_MY_SPAWNS);

                if(room.controller.level <= 6 && room.controller.level >= 2) {
                    let lookStructs = linkLocation.lookFor(LOOK_STRUCTURES);
                    let foundContainer = false;

                    for(let building of lookStructs) {
                        if(building.structureType == STRUCTURE_TOWER || building.structureType == STRUCTURE_EXTENSION) {
                            building.destroy();
                        }
                        else if(building.structureType == STRUCTURE_CONTAINER) {
                            foundContainer = true;
                        }
                    }
                    if(!foundContainer) {
                        linkLocation.createConstructionSite(STRUCTURE_CONTAINER);
                    }
                }
                if(room.controller.level >= 7) {
                    let lookStructs = linkLocation.lookFor(LOOK_STRUCTURES);
                    for(let building of lookStructs) {
                        if(building.structureType !== STRUCTURE_LINK && building.structureType !== STRUCTURE_RAMPART && building.structureType !== STRUCTURE_ROAD) {
                            building.destroy();
                        }
                    }

                    let links = room.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_LINK);}});
                    // room.controller.getRangeTo(room.controller.pos.findClosestByRange(links)) > 3room.controller.getRangeTo(room.controller.pos.findClosestByRange(links)) > 3
                    if(links.length == 3) {
                        let currentControllerLink:any = Game.getObjectById(room.memory.Structures.controllerLink);
                        if(currentControllerLink && currentControllerLink == STRUCTURE_CONTAINER || !currentControllerLink) {
                            room.createConstructionSite(linkLocation.x, linkLocation.y, STRUCTURE_LINK);
                        }

                    }


                    if(mySpawns.length < 2 && storage) {
                        let secondSpawnPosition = new RoomPosition(storage.pos.x, storage.pos.y - 2, room.name);
                        new RoomVisual(room.name).circle(secondSpawnPosition.x, secondSpawnPosition.y, {fill: 'transparent', radius: .75, stroke: '#BABABA'});
                        let listOfSpawnPositions = [];
                        listOfSpawnPositions.push(secondSpawnPosition);


                        DestroyAndBuild(room, listOfSpawnPositions, STRUCTURE_SPAWN);
                    }


                    if(storage) {
                        let FactoryPosition = new RoomPosition(storage.pos.x + 2, storage.pos.y + 2, room.name);
                        new RoomVisual(room.name).circle(FactoryPosition.x, FactoryPosition.y, {fill: 'transparent', radius: .75, stroke: 'blue'});
                        let listOfFactoryPositions = [];
                        listOfFactoryPositions.push(FactoryPosition);


                        DestroyAndBuild(room, listOfFactoryPositions, STRUCTURE_FACTORY);

                        let lookforfactorypositionstructures = FactoryPosition.lookFor(LOOK_STRUCTURES)
                        if(lookforfactorypositionstructures.length == 1 && lookforfactorypositionstructures[0].structureType == STRUCTURE_FACTORY) {
                            FactoryPosition.createConstructionSite(STRUCTURE_RAMPART);
                        }
                    }

                }

                if(room.controller.level == 8 && mySpawns.length == 2) {
                    let thirdSpawnPosition = new RoomPosition(storage.pos.x + 2, storage.pos.y, room.name);
                    new RoomVisual(room.name).circle(thirdSpawnPosition.x, thirdSpawnPosition.y, {fill: 'transparent', radius: .75, stroke: '#BABABA'});
                    let listOfSpawnPositions = [];
                    listOfSpawnPositions.push(thirdSpawnPosition);


                    DestroyAndBuild(room, listOfSpawnPositions, STRUCTURE_SPAWN);
                }

                if(room.controller.level == 8 && myConstructionSites == 0) {
                    let observers = room.find(FIND_MY_STRUCTURES, {filter:s => s.structureType == STRUCTURE_OBSERVER});
                    if(observers.length == 0) {
                        let listOfObserverPosition = [new RoomPosition(storage.pos.x - 2, storage.pos.y + 1, room.name)]
                        DestroyAndBuild(room, listOfObserverPosition, STRUCTURE_OBSERVER);
                    }

                    let nukers = room.find(FIND_MY_STRUCTURES, {filter:s => s.structureType == STRUCTURE_NUKER});
                    if(nukers.length == 0) {
                        let listOfNukerPositions = [new RoomPosition(storage.pos.x + 4, storage.pos.y, room.name)]
                        DestroyAndBuild(room, listOfNukerPositions, STRUCTURE_NUKER);
                    }
                    else if(nukers.length == 1) {
                        let NukerPosition = new RoomPosition(storage.pos.x + 4, storage.pos.y, room.name);
                        let lookForS = NukerPosition.lookFor(LOOK_STRUCTURES);
                        if(lookForS.length == 1) {
                            NukerPosition.createConstructionSite(STRUCTURE_RAMPART);
                        }
                    }
                    let powerSpawns = room.find(FIND_MY_STRUCTURES, {filter:s => s.structureType == STRUCTURE_POWER_SPAWN});
                    if(powerSpawns.length == 0) {
                        let listOfPowerSpawnPositions = [new RoomPosition(storage.pos.x + 3, storage.pos.y + 2, room.name)]
                        DestroyAndBuild(room, listOfPowerSpawnPositions, STRUCTURE_POWER_SPAWN);
                    }
                    else if(powerSpawns.length == 1) {
                        let PowerSpawnPosition = new RoomPosition(storage.pos.x + 3, storage.pos.y + 2, room.name);
                        let lookForS = PowerSpawnPosition.lookFor(LOOK_STRUCTURES);
                        if(lookForS.length == 1) {
                            PowerSpawnPosition.createConstructionSite(STRUCTURE_RAMPART);
                        }
                    }
                }



                if(room.controller.level < 6) {
                    Game.rooms[container1.roomName].createConstructionSite(container1.x, container1.y, STRUCTURE_CONTAINER);
                }
                pathBuilder(pathFromStorageToSource1, STRUCTURE_ROAD, room);

                if(room.controller.level < 6) {
                    Game.rooms[container2.roomName].createConstructionSite(container2.x, container2.y, STRUCTURE_CONTAINER);
                }
                pathBuilder(pathFromStorageToSource2, STRUCTURE_ROAD, room);

                pathBuilder(pathFromStorageToController, STRUCTURE_ROAD, room);

                if(room.controller.level >= 6) {

                    if(storage) {

                        let extraRoadPositions = [
                            new RoomPosition(storage.pos.x-4, storage.pos.y, room.name),
                            new RoomPosition(storage.pos.x-3, storage.pos.y-1, room.name),
                            new RoomPosition(storage.pos.x-2, storage.pos.y-1, room.name),
                            new RoomPosition(storage.pos.x-2, storage.pos.y+2, room.name),
                            new RoomPosition(storage.pos.x-2, storage.pos.y+3, room.name),
                            new RoomPosition(storage.pos.x-3, storage.pos.y+4, room.name),
                            new RoomPosition(storage.pos.x-4, storage.pos.y+3, room.name)
                        ];

                        for(let position of extraRoadPositions) {
                            position.createConstructionSite(STRUCTURE_ROAD);

                            let lookForRoad = position.lookFor(LOOK_STRUCTURES);
                            if(lookForRoad.length > 0) {
                                for(let building of lookForRoad) {
                                    if(building.structureType == STRUCTURE_ROAD) {
                                        let road = building.id;
                                        if(room.memory.keepTheseRoads && !_.includes(room.memory.keepTheseRoads, road, 0)) {
                                            room.memory.keepTheseRoads.push(road);
                                        }
                                    }
                                }
                            }
                        }

                        let MyRamparts = room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART && s.pos.getRangeTo(storage) <= 10});
                        for(let rampart of MyRamparts) {
                            let lookForStructsHere = rampart.pos.lookFor(LOOK_STRUCTURES);
                            if(lookForStructsHere.length == 1) {
                                rampart.pos.createConstructionSite(STRUCTURE_ROAD);
                            }
                            else {
                                for(let building of lookForExistingStructures) {
                                    if(building.structureType == STRUCTURE_ROAD) {
                                        if(room.memory.keepTheseRoads && !_.includes(room.memory.keepTheseRoads, building.id, 0)) {
                                            room.memory.keepTheseRoads.push(building.id);
                                        }
                                    }
                                }
                            }
                        }

                    }


                    let extractor = Game.getObjectById(room.memory.Structures.extractor) || room.findExtractor();
                    let mineral = Game.getObjectById(room.memory.mineral) || room.findMineral();
                    if(!extractor) {
                        room.createConstructionSite(mineral.pos.x, mineral.pos.y, STRUCTURE_EXTRACTOR);
                    }
                    else {
                        room.memory.extractor = extractor.id;
                    }

                    let pathFromStorageToMineral = PathFinder.search(storage.pos, {pos:mineral.pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: (roomName) => makeStructuresCostMatrix(roomName)});
                    let RampartLocationMineral = pathFromStorageToMineral.path[pathFromStorageToMineral.path.length - 1]
                    if(storage.pos.getRangeTo(RampartLocationMineral) >= 8) {
                        RampartLocationMineral.createConstructionSite(STRUCTURE_RAMPART);
                    }

                    pathBuilder(pathFromStorageToMineral, STRUCTURE_ROAD, room);

                    if(room.terminal) {
                        let pathFromStorageToTerminal = PathFinder.search(storage.pos, {pos:room.terminal.pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: (roomName) => makeStructuresCostMatrix(roomName)});
                        pathBuilder(pathFromStorageToTerminal, STRUCTURE_ROAD, room);
                    }

                }
            }

        }

        // if(spawn && !storage && room.controller.level < 4) {
        //     let spawnNeighbours = getNeighbours(spawn.pos, checkerboard);
        //     spawnNeighbours.sort((a,b) => new RoomPosition (a.x, a.y, room.name).getRangeTo(spawn) - new RoomPosition (b.x, b.y, room.name).getRangeTo(spawn));
        //     pathBuilder(spawnNeighbours, STRUCTURE_EXTENSION, room, false);
        // }
        if(storage) {
            let storageNeighbours = getNeighbours(storage.pos, checkerboard);
            storageNeighbours = storageNeighbours.filter(function(location) {return location.x > 0 && location.x < 49 && location.y > 0 && location.y < 49;})
            storageNeighbours.sort((a,b) => new RoomPosition (a.x, a.y, room.name).getRangeTo(storage) - new RoomPosition (b.x, b.y, room.name).getRangeTo(storage));

            if(room.controller.level < 4) {
                pathBuilder(storageNeighbours, STRUCTURE_EXTENSION, room, false);
            }


            if(room.controller.level >= 4) {
                pathBuilder(storageNeighbours, STRUCTURE_EXTENSION, room, false);

                let aroundStorageList = [
                    new RoomPosition(storage.pos.x + 1, storage.pos.y + 1, room.name),
                    new RoomPosition(storage.pos.x + 1, storage.pos.y - 1, room.name),
                    new RoomPosition(storage.pos.x -1, storage.pos.y + 1, room.name),
                    new RoomPosition(storage.pos.x -1, storage.pos.y - 1, room.name),
                    new RoomPosition(storage.pos.x + 1, storage.pos.y, room.name),
                    new RoomPosition(storage.pos.x - 1, storage.pos.y, room.name),
                    new RoomPosition(storage.pos.x, storage.pos.y + 1, room.name),
                    new RoomPosition(storage.pos.x, storage.pos.y - 1, room.name),
                ]

                pathBuilder(aroundStorageList, STRUCTURE_ROAD, room, false);
            }

            if(room.terminal && room.controller.level >= 6) {
                let aroundTerminalList = [
                    new RoomPosition(room.terminal.pos.x + 1, room.terminal.pos.y, room.name),
                    // new RoomPosition(room.terminal.pos.x - 1, room.terminal.pos.y, room.name),
                    new RoomPosition(room.terminal.pos.x, room.terminal.pos.y + 1, room.name),
                    new RoomPosition(room.terminal.pos.x, room.terminal.pos.y - 1, room.name),
                ]
                pathBuilder(aroundTerminalList, STRUCTURE_ROAD, room, false);

                let lookterminallocation = room.terminal.pos.lookFor(LOOK_STRUCTURES);
                if(lookterminallocation.length == 1) {
                    room.terminal.pos.createConstructionSite(STRUCTURE_RAMPART);
                }
            }
        }


        if(room.controller.level >= 5 && storage && myConstructionSites == 0) {
            let ramparts = room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART && s.pos.getRangeTo(storage) == 10});
            if(ramparts.length > 0) {
                let topLeftRamparts = ramparts.filter(function(rampart) {return rampart.pos.x < storage.pos.x-1 && rampart.pos.y < storage.pos.y-1;});
                if(topLeftRamparts.length > 0) {
                    // topLeftRamparts.sort((a,b) => b.pos.getRangeTo(storage) - a.pos.getRangeTo(storage));
                    let closestTopLeftRampart = storage.pos.findClosestByRange(topLeftRamparts);
                    let pathFromStorageToFurthestTopLeftRampart = PathFinder.search(storage.pos, {pos:closestTopLeftRampart.pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: (roomName) => makeStructuresCostMatrixModifiedTest(roomName)});
                    pathBuilder(pathFromStorageToFurthestTopLeftRampart, STRUCTURE_ROAD, room);
                }
                let topRightRamparts = ramparts.filter(function(rampart) {return rampart.pos.x > storage.pos.x+1 && rampart.pos.y < storage.pos.y-1;});
                if(topRightRamparts.length > 0) {
                    // topRightRamparts.sort((a,b) => b.pos.getRangeTo(storage) - a.pos.getRangeTo(storage));
                    let closestTopRightRampart = storage.pos.findClosestByRange(topRightRamparts);
                    let pathFromStorageToFurthestTopRightRampart = PathFinder.search(storage.pos, {pos:closestTopRightRampart.pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: (roomName) => makeStructuresCostMatrixModifiedTest(roomName)});
                    pathBuilder(pathFromStorageToFurthestTopRightRampart, STRUCTURE_ROAD, room);
                }
                let bottomRightRamparts = ramparts.filter(function(rampart) {return rampart.pos.x > storage.pos.x+1 && rampart.pos.y > storage.pos.y+1;});
                if(bottomRightRamparts.length > 0) {
                    // bottomRightRamparts.sort((a,b) => b.pos.getRangeTo(storage) - a.pos.getRangeTo(storage));
                    let closestBottomRightRampart = storage.pos.findClosestByRange(bottomRightRamparts);
                    let pathFromStorageToFurthestBottomRightRampart = PathFinder.search(storage.pos, {pos:closestBottomRightRampart.pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: (roomName) => makeStructuresCostMatrixModifiedTest(roomName)});
                    pathBuilder(pathFromStorageToFurthestBottomRightRampart, STRUCTURE_ROAD, room);
                }

                let bottomLeftRamparts = ramparts.filter(function(rampart) {return rampart.pos.x < storage.pos.x-1 && rampart.pos.y > storage.pos.y+1;});
                if(bottomLeftRamparts.length > 0) {
                    // bottomLeftRamparts.sort((a,b) => b.pos.getRangeTo(storage) - a.pos.getRangeTo(storage));
                    let closestBottomLeftRampart = storage.pos.findClosestByRange(bottomLeftRamparts);
                    let pathFromStorageToFurthestBottomLeftRampart = PathFinder.search(storage.pos, {pos:closestBottomLeftRampart.pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: (roomName) => makeStructuresCostMatrixModifiedTest(roomName)});
                    pathBuilder(pathFromStorageToFurthestBottomLeftRampart, STRUCTURE_ROAD, room);
                }
            }
        }


        if(room.controller.level >= 6 && storage) {
            let sources = room.find(FIND_SOURCES);

            sources.forEach(source => {
                let open = source.pos.getOpenPositionsIgnoreCreeps();
                findOpenSpotsForExtensions(open, storage, room, source.pos, source);
            });
        }








// IMPORTNAT DO NOT DELETE
        let links = room.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_LINK);}});

        if(room.controller.level >= 5) {
            let sources = room.find(FIND_SOURCES);

            sources.forEach(source => {
                let sourceLinks = source.pos.findInRange(links, 2);
                if(sourceLinks.length == 0) {
                    let open = source.pos.getOpenPositionsIgnoreCreeps();
                    findTwoOpenSpotsForLink(open, storage, room);
                }
                for(let link of sourceLinks) {
                    if(storage.pos.getRangeTo(link) > 7) {
                        link.pos.createConstructionSite(STRUCTURE_RAMPART);
                    }
                }
            });
        }

        if(room.controller.level >= 6) {
            if(storage) {
                let storageLinkPosition = new RoomPosition(storage.pos.x-2, storage.pos.y, room.name);
                let buildingsHere = storageLinkPosition.lookFor(LOOK_STRUCTURES);
                let found = false;
                for(let building of buildingsHere) {
                    if(building.structureType == STRUCTURE_LINK) {
                        found = true;
                    }
                }
                if(!found) {
                    new RoomVisual(room.name).circle(storageLinkPosition.x, storageLinkPosition.y, {fill: 'transparent', radius: .75, stroke: 'red'});
                    let positionsList = [];
                    positionsList.push(storageLinkPosition);

                    DestroyAndBuild(room, positionsList, STRUCTURE_LINK);
                }

                if(!room.terminal) {
                    let terminalPosition = new RoomPosition(storage.pos.x - 1, storage.pos.y + 2, room.name);
                    let positionsList = [];
                    positionsList.push(terminalPosition);
                    new RoomVisual(room.name).circle(terminalPosition.x, terminalPosition.y, {fill: 'transparent', radius: .75, stroke: 'green'});

                    DestroyAndBuild(room, positionsList, STRUCTURE_TERMINAL);
                }

                // let labsInRoom = room.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_LAB);}})
                // if(labsInRoom.length < 10) {

                //     // var index = array.indexOf(item);
                //     // if (index !== -1) {
                //     //   array.splice(index, 1);
                //     // }

                //     let LabLocations = [];
                //     LabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y + 1, room.name));
                //     checkerboard = checkerboard.filter(item => item[0] !== -5 && item[1] !== 1);

                //     LabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y + 2, room.name));
                //     checkerboard = checkerboard.filter(item => item[0] !== -5 && item[1] !== 2);

                //     LabLocations.push(new RoomPosition(storage.pos.x - 4, storage.pos.y, room.name));
                //     checkerboard = checkerboard.filter(item => item[0] !== -4 && item[1] !== 0);

                //     if(room.controller.level >= 7) {
                //         LabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y + 2, room.name));
                //         checkerboard = checkerboard.filter(item => item[0] !== -3 && item[1] !== 2);

                //         LabLocations.push(new RoomPosition(storage.pos.x - 4, storage.pos.y + 3, room.name));
                //         checkerboard = checkerboard.filter(item => item[0] !== -4 && item[1] !== 3);

                //         LabLocations.push(new RoomPosition(storage.pos.x - 6, storage.pos.y + 3, room.name));
                //         checkerboard = checkerboard.filter(item => item[0] !== -6 && item[1] !== 3);
                //     }
                //     if(room.controller.level == 8) {
                //         LabLocations.push(new RoomPosition(storage.pos.x - 6, storage.pos.y, room.name));
                //         checkerboard = checkerboard.filter(item => item[0] !== -6 && item[1] !== 0);

                //         LabLocations.push(new RoomPosition(storage.pos.x - 7, storage.pos.y + 1, room.name));
                //         checkerboard = checkerboard.filter(item => item[0] !== -7 && item[1] !== 1);

                //         LabLocations.push(new RoomPosition(storage.pos.x - 7, storage.pos.y + 2, room.name));
                //         checkerboard = checkerboard.filter(item => item[0] !== -7 && item[1] !== 2);

                //         LabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y + 1, room.name));
                //         checkerboard = checkerboard.filter(item => item[0] !== -3 && item[1] !== 1);
                //     }



                //     DestroyAndBuild(room, LabLocations, STRUCTURE_LAB);

                //     for(let lab of labsInRoom) {
                //         if(lab.pos.lookFor(LOOK_STRUCTURES).length == 1) {
                //             lab.pos.createConstructionSite(STRUCTURE_RAMPART);
                //         }
                //     }

                // }


            }
        }


        if(room.controller.level >= 5) {
            // let rampartLocations = [];
            // let rampartsInRoom = room.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_RAMPART);}});
            // if(rampartsInRoom.length > 0) {



            //     rampartsInRoom.forEach(rampart => {
            //         let rampartsnexttorampart = rampart.pos.findInRange(rampartsInRoom, 1);

            //         for(let RP of rampartsnexttorampart) {
            //             if(rampart.pos == RP.pos) {
            //                 return;
            //             }
            //             else if(rampart.pos.x == RP.pos.x || rampart.pos.y == RP.pos.y) {
            //                 rampartLocations.push(RP.pos);
            //                 return;
            //             }
            //         }
            //     });
            //     pathBuilder(rampartLocations, STRUCTURE_ROAD, room, false)
            // }

            // let closestJoinedToStorage = 100;
            // let currentClosest;
            // // rampartLocations.sort((a,b) => b.x - a.x);
            // rampartLocations.sort((a,b) => b.y - a.y);

            // rampartLocations.forEach(location => {
            //     console.log(location);

            //     rampartLocations.shift();
            //     if(location.findClosestByRange(rampartLocations) == 1 && storage) {
            //         if(location.getRangeTo(storage) < closestJoinedToStorage) {
            //             closestJoinedToStorage = location.getRangeTo(storage);
            //             currentClosest = location;
            //         }
            //     }
            // });

            // let pathFromClosestRampartInBunchToStorage = PathFinder.search(storage.pos, {pos:currentClosest, range:1}, {plainCost: 1, swampCost: 3, roomCallback: () => makeStructuresCostMatrix(room.name)});
            // pathBuilder(pathFromClosestRampartInBunchToStorage, STRUCTURE_ROAD, room);

        }

                // do not delete
                // this approach to creating a link for controller might be more robust but harder
                // do not delete below

        // if(room.controller.level >= 7) {
        //     let Controller = room.controller;
        //     let controllerLink = Controller.pos.findInRange(links, 3)[0];
        //     if(controllerLink == undefined) {
        //         let controllerLinkPosition = new RoomPosition(storage.pos.x-2, storage.pos.y, room.name);
        //         new RoomVisual(room.name).circle(storageLinkPosition.x, storageLinkPosition.y, {fill: 'transparent', radius: .75, stroke: 'red'});
        //         let existingStructuresHere = storageLinkPosition.lookFor(LOOK_STRUCTURES);
        //         if(existingStructuresHere.length != 0) {
        //             if(existingStructuresHere[0].structureType != STRUCTURE_LINK) {
        //                 existingStructuresHere[0].destroy();
        //             }
        //         }
        //         else {
        //             storageLinkPosition.createConstructionSite(STRUCTURE_LINK);
        //         }
        //     }
        // }



                //     let sources = room.find(FIND_SOURCES);

                //     let sourceLinkOne = sources[0].pos.findInRange(links, 4)[0];

                //     let sourceLinkTwo = sources[1].pos.findInRange(links, 4)[0];

                //     if(sourceLinkOne == undefined) {
                //         let path = sources[0].pos.findPathTo(spawn, {ignoreCreeps: true, ignoreRoads: false});
                //         path[1].x path[1.y] find empty space to place link then place the linK!
                //         room.createConstructionSite(sources[0].pos.x, storage.pos.y -2, STRUCTURE_LINK);

                //     }

                //     if(sourceLinkTwo == undefined) {
                //         room.createConstructionSite(storage.pos.x + 1, storage.pos.y -2, STRUCTURE_LINK);
                //     }
                // }






    }




    // if(room.controller.level > 2 && room.controller.level < 6) {
    //     let spawnPerimeter = rampartPerimeter(spawn.pos);

    //     _.forEach(spawnPerimeter, function(block) {
    //         const blockSpot = new RoomPosition(block.x, block.y, room.name);
    //         let lookForExistingConstructionSites = blockSpot.lookFor(LOOK_CONSTRUCTION_SITES);
    //         let lookForExistingStructures = blockSpot.lookFor(LOOK_STRUCTURES);
    //         let lookForTerrain = blockSpot.lookFor(LOOK_TERRAIN);
    //         if(lookForExistingStructures.length != 0 || lookForExistingConstructionSites.length != 0) {
    //             console.log('building here already')
    //             return;
    //         }
    //         else if (lookForTerrain == "swamp" || lookForTerrain == "plain") {
    //             room.createConstructionSite(block.x, block.y, STRUCTURE_RAMPART);
    //             return;
    //         }
    //     });
    // }
}


function DestroyAndBuild(room, LocationsList, StructureType:string) {
    for(let location of LocationsList) {
        let lookForExistingStructures = location.lookFor(LOOK_STRUCTURES);
        if(lookForExistingStructures.length > 0) {
            for(let existingstructure of lookForExistingStructures) {
                if(existingstructure.structureType !== StructureType && existingstructure.structureType !== STRUCTURE_RAMPART) {
                    existingstructure.destroy();
                }
            }
        }
        else {
            room.createConstructionSite(location, StructureType);
        }
    }
}

function BuildIfICan(LocationsList, StructureType:string) {
    for(let location of LocationsList) {
        let lookForExistingStructures = location.lookFor(LOOK_STRUCTURES);
        if(lookForExistingStructures.length > 0) {
            let canIBuild = true;
            for(let existingstructure of lookForExistingStructures) {
                if(existingstructure.structureType === STRUCTURE_ROAD || existingstructure.structureType === STRUCTURE_RAMPART || existingstructure.structureType === STRUCTURE_CONTAINER) {
                    continue;
                }
                else {
                    canIBuild = false;
                    break;
                }
            }

            if(canIBuild) {
                new RoomVisual(location.roomName).circle(location.x, location.y, {fill: 'full', radius: 0.25, stroke: 'black'});
                location.createConstructionSite(StructureType);
            }
        }
    }
}


function findTwoOpenSpotsForLink(open:Array<RoomPosition>, storage, room) {
    if(open.length > 1) {
        open.sort((a,b) => a.findPathTo(storage, {ignoreCreeps:true}).length - b.findPathTo(storage, {ignoreCreeps:true}).length)
        open = open.filter(position => position.findPathTo(storage.pos, {ignoreCreeps:true}).length < open[0].findPathTo(storage.pos, {ignoreCreeps:true}).length + 3);
        if(open.length > 1) {
            if(open.length == 2 && open[0].getRangeTo(open[1]) > 1) {
                let NewOpen = open[0].getOpenPositionsIgnoreCreeps();
                findTwoOpenSpotsForLink(NewOpen, storage, room)
            }
            else {
            // let closestOpen = storage.pos.findClosestByRange(open);
            new RoomVisual(room.name).circle(open[1].x, open[1].y, {fill: 'transparent', radius: 0.75, stroke: 'red'});
            for (let i = 1; i < open.length; i++) {
                let result = open[i].createConstructionSite(STRUCTURE_LINK);
                if(result == 0) {
                    return;
                }
            }
            }
        }
        else {
            let NewOpen = open[0].getOpenPositionsIgnoreCreeps();
            findTwoOpenSpotsForLink(NewOpen, storage, room)
        }
    }
    else {
        let NewOpen = open[0].getOpenPositionsIgnoreCreeps();
        findTwoOpenSpotsForLink(NewOpen, storage, room)
    }
}

function findOpenSpotsForExtensions(open:Array<RoomPosition>, storage, room, origin, source) {
    if(open.length > 1) {
        open.sort((a,b) => a.findPathTo(storage, {ignoreCreeps:true}).length - b.findPathTo(storage, {ignoreCreeps:true}).length)
        open = open.filter(position => position.findPathTo(storage.pos, {ignoreCreeps:true}).length < open[0].findPathTo(storage.pos, {ignoreCreeps:true}).length + 3);
        if(open.length > 1) {

            let pathFromSourceToStorage = source.pos.findPathTo(storage.pos, {ignoreCreeps:true});

            if(pathFromSourceToStorage.length > 0) {
                let firstLocation = pathFromSourceToStorage[0];

                let firstSpotOnPath = new RoomPosition(firstLocation.x, firstLocation.y, room.name);

                if(firstSpotOnPath.getRangeTo(storage) >= 8) {
                    let lookForBuildingsOnFirstSpotOnPath = firstSpotOnPath.lookFor(LOOK_STRUCTURES);
                    if(lookForBuildingsOnFirstSpotOnPath.length == 0 || lookForBuildingsOnFirstSpotOnPath.length == 1 && lookForBuildingsOnFirstSpotOnPath[0].structureType == STRUCTURE_ROAD) {
                        firstSpotOnPath.createConstructionSite(STRUCTURE_RAMPART);
                    }
                }


                let buildhere = firstSpotOnPath.getOpenPositionsIgnoreCreeps();

                let myLinks = room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_LINK});
                if(myLinks.length >= 4) {
                    for (let i = 0; i < buildhere.length; i++) {
                        new RoomVisual(room.name).circle(buildhere[i].x, buildhere[i].y, {fill: 'transparent', radius: 0.75, stroke: 'white'});

                        let buildings = buildhere[i].lookFor(LOOK_STRUCTURES);
                        if(buildings.length == 0) {
                            let count = 0;
                            if(new RoomPosition(buildhere[i].x + 1, buildhere[i].y, room.name).lookFor(LOOK_TERRAIN)[0] == "wall") {
                                count ++;
                            }
                            if(new RoomPosition(buildhere[i].x - 1, buildhere[i].y, room.name).lookFor(LOOK_TERRAIN)[0] == "wall") {
                                count ++;
                            }
                            if(new RoomPosition(buildhere[i].x, buildhere[i].y + 1, room.name).lookFor(LOOK_TERRAIN)[0] == "wall") {
                                count ++;
                            }
                            if(new RoomPosition(buildhere[i].x, buildhere[i].y - 1, room.name).lookFor(LOOK_TERRAIN)[0] == "wall") {
                                count ++;
                            }
                            if(count < 2) {
                                buildhere[i].createConstructionSite(STRUCTURE_EXTENSION);
                            }
                        }
                    }
                }

                return;
            }
            else {
                console.log(room.name, 'this room sucks')
            }

        }
        else {
            let NewOpen = open[0].getOpenPositionsIgnoreCreeps();
            findOpenSpotsForExtensions(NewOpen, storage, room, open[0], source)
        }
    }
    else {
        let NewOpen = open[0].getOpenPositionsIgnoreCreeps();
        findOpenSpotsForExtensions(NewOpen, storage, room, open[0], source)
    }
}

    // let roomPositionArray = [];
    // for(let x = 1; x < 48; x++) {
    //     for(let y = 1; y < 48; y++) {
    //         roomPositionArray.push(new RoomPosition(x, y, roomName));
    //     }
    // }
    // let terrain = Game.map.getRoomTerrain(roomName);
    // let unWalkablePositions = _.filter(roomPositionArray, function(pos:any) {
    //     return terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL;});

    // for(let position of unWalkablePositions) {
    //     costs.set(position.x, position.y, 255);
    // }

    // let allowedRooms = { [ roomName ]: true };

    // if (allowedRooms[roomName] === undefined) {
    //     return false;
    // }




const makeStructuresCostMatrix = (roomName: string): boolean | CostMatrix => {
    let currentRoom = Game.rooms[roomName];
    if(currentRoom == undefined || currentRoom === undefined || !currentRoom || currentRoom === null || currentRoom == null) {
        return false;
    }
    let costs = new PathFinder.CostMatrix;

    let existingStructures = currentRoom.find(FIND_STRUCTURES);
    if(existingStructures.length > 0) {
        existingStructures.forEach(building => {
            if(building.structureType != STRUCTURE_RAMPART && building.structureType != STRUCTURE_CONTAINER && building.structureType != STRUCTURE_ROAD) {
                costs.set(building.pos.x, building.pos.y, 255);
            }
            // else {
            //     costs.set(building.pos.x, building.pos.y, 0);
            // }
        });
    }

    let storages = currentRoom.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_STORAGE});
    let storage;
    if(storages.length > 0) {
        storage = storages[0];
    }
    if(storage) {
        let storageX = storage.pos.x;
        let storageY = storage.pos.y;

        let listOfPositionsInFutureToBeBuilt = [
            [storageX + -2,storageY + -2],
            [storageX + 2,storageY + -2],
            [storageX + 2,storageY],
            [storageX + -3,storageY + -3],
            [storageX + -1,storageY + -3],
            [storageX + -1,storageY + 3],
            [storageX + 1,storageY + -3],
            [storageX + 3,storageY + -3],
            [storageX + 1,storageY + 3],
            [storageX + 3,storageY + 3],
            [storageX + -3,storageY + -2],
            [storageX + 3,storageY + -2],
            [storageX + -4,storageY + -4],
            [storageX + -2,storageY + -4],
            [storageX,storageY + -4],
            [storageX + 2,storageY + -4],
            [storageX + 4,storageY + -4],
            [storageX + -4,storageY + -2],
            [storageX + -4,storageY + 4],
            [storageX + -2,storageY + 4],
            [storageX + 0,storageY + 4],
            [storageX + 2,storageY + 4],
            [storageX + 4,storageY + 4],
            [storageX + -5,storageY + -5],
            [storageX + -3,storageY + -5],
            [storageX + -1,storageY + -5],
            [storageX + 1,storageY + -5],
            [storageX + 3,storageY + -5],
            [storageX + 5,storageY + -5],
            [storageX + -5,storageY + -3],
            [storageX + 5,storageY + -3],
            [storageX + -5,storageY + -1],
            [storageX + 5,storageY + 3],
            [storageX + -5,storageY + 5],
            [storageX + -3,storageY + 5],
            [storageX + -1,storageY + 5],
            [storageX + 1,storageY + 5],
            [storageX + 3,storageY + 5],
            [storageX + 0,storageY + 5],
            [storageX + 0,storageY - 5],
            [storageX + -6,storageY + -6],
            [storageX + -4,storageY + -6],
            [storageX + -2,storageY + -6],
            [storageX + 0,storageY + -6],
            [storageX + 2,storageY + -6],
            [storageX + 4,storageY + -6],
            [storageX + 6,storageY + -6],
            [storageX + -6,storageY + -4],
            [storageX + 6,storageY + -4],
            [storageX + -6,storageY + -2],
            [storageX + 6,storageY + -2],
            [storageX + 6,storageY + 0],
            [storageX + 6,storageY + 2],
            [storageX + -6,storageY + 4],
            [storageX + 6,storageY + 4],
            [storageX + -6,storageY + 6],
            [storageX + -4,storageY + 6],
            [storageX + -2,storageY + 6],
            [storageX + 0,storageY + 6],
            [storageX + 2,storageY + 6],
            [storageX + 4,storageY + 6],
            [storageX + 6,storageY + 6],
            // [storageX + -5,storageY + -7],
            // [storageX + -3,storageY + -7],
            // [storageX + -1,storageY + -7],
            // [storageX + 1,storageY + -7],
            // [storageX + 3,storageY + -7],
            // [storageX + 5,storageY + -7],
            // [storageX + -7,storageY + -5],
            // [storageX + -7,storageY + -3],
            // [storageX + -7,storageY + -1],
            // [storageX + -7,storageY + 5],
            // [storageX + -5,storageY + 7],
            // [storageX + -3,storageY + 7],
            // [storageX + -1,storageY + 7],
            // [storageX + 1,storageY + 7],
            // [storageX + 3,storageY + 7],
            // [storageX + 5,storageY + 7],
            // [storageX + 7,storageY + 5],
            // [storageX + 7,storageY + 3],
            // [storageX + 7,storageY + 1],
            // [storageX + 7,storageY + -1],
            // [storageX + 7,storageY + -3],
            // [storageX + 7,storageY + -5],
            // [storageX + 0,storageY + 7],
            // [storageX + 7,storageY + 0],
            // [storageX + 0,storageY + -7],
            // [storageX + 4,storageY + 7],
            // [storageX + -4,storageY + 7],
            // [storageX + 7,storageY + 4],
            // [storageX + 7,storageY + -4],
            // [storageX + 4,storageY + -7],
            // [storageX + -4,storageY + -7],
            // [storageX + -7,storageY + 4],
            // [storageX + -7,storageY + -4],

            // non extension buildings
            [storageX + -1,storageY + 2],
            [storageX + 0,storageY + -2],
            [storageX + 2,storageY + 0],
            [storageX + 4,storageY + 0],
            [storageX + 2,storageY + 2],
            [storageX + 3,storageY + 2],
            [storageX + -2,storageY + 0],
            // towers
            // [storageX + 4,storageY + -2],
            // [storageX + 3,storageY + -1],
            // [storageX + 5,storageY + -1],
            // [storageX + 3,storageY + 1],
            // [storageX + 5,storageY + 1],
            // [storageX + 4,storageY + 2],
            // labs
            [storageX + -3,storageY + 0],
            [storageX + -3,storageY + 1],
            [storageX + -3,storageY + 2],
            [storageX + -3,storageY + 3],
            [storageX + -4,storageY + 1],
            [storageX + -4,storageY + 2],
            [storageX + -5,storageY + 0],
            [storageX + -5,storageY + 1],
            [storageX + -5,storageY + 2],
            [storageX + -5,storageY + 3],
        ]

        for(let position of listOfPositionsInFutureToBeBuilt) {
            if(position[0] <= 47 && position[0] >= 2 && position[1] <= 47 && position[1] >= 2) {
                costs.set(position[0], position[1], 10);
            }
        }
    }


    return costs;
}


const makeStructuresCostMatrixModifiedTest = (roomName: string): boolean | CostMatrix => {
    let currentRoom = Game.rooms[roomName];
    if(currentRoom == undefined || currentRoom === undefined || !currentRoom || currentRoom === null || currentRoom == null) {
        return false;
    }
    if(currentRoom.controller.level == 0) {
        return makeStructuresCostMatrix(roomName);
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 0; y <= 49; y++) {
        for(let x = 0; x <= 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 15;
            }
            else if(tile == 0){
                weight = 3;
            }
            costs.set(x, y, weight);
        }
    }


    let existingStructures = currentRoom.find(FIND_STRUCTURES);
    if(existingStructures.length > 0) {
        existingStructures.forEach(building => {
            if(building.structureType != STRUCTURE_RAMPART && building.structureType != STRUCTURE_CONTAINER && building.structureType != STRUCTURE_ROAD) {
                costs.set(building.pos.x, building.pos.y, 255);
            }
            else if(building.structureType == STRUCTURE_ROAD) {
                costs.set(building.pos.x, building.pos.y, 2)
            }

            // else {
            //     costs.set(building.pos.x, building.pos.y, 0);
            // }
        });
    }

    let storages = currentRoom.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_STORAGE});
    let storage;
    if(storages.length > 0) {
        storage = storages[0];
    }
    if(storage) {
        let storageX = storage.pos.x;
        let storageY = storage.pos.y;

        let listOfPositionsInFutureToBeBuilt = [
            [storageX + -2,storageY + -2],
            [storageX + 2,storageY + -2],
            [storageX + 2,storageY],
            [storageX + -3,storageY + -3],
            [storageX + -1,storageY + -3],
            [storageX + -1,storageY + 3],
            [storageX + 1,storageY + -3],
            [storageX + 3,storageY + -3],
            [storageX + 1,storageY + 3],
            [storageX + 3,storageY + 3],
            [storageX + -3,storageY + -2],
            [storageX + 3,storageY + -2],
            [storageX + -4,storageY + -4],
            [storageX + -2,storageY + -4],
            [storageX,storageY + -4],
            [storageX + 2,storageY + -4],
            [storageX + 4,storageY + -4],
            [storageX + -4,storageY + -2],
            [storageX + -4,storageY + 4],
            [storageX + -2,storageY + 4],
            [storageX + 0,storageY + 4],
            [storageX + 2,storageY + 4],
            [storageX + 4,storageY + 4],
            [storageX + -5,storageY + -5],
            [storageX + -3,storageY + -5],
            [storageX + -1,storageY + -5],
            [storageX + 1,storageY + -5],
            [storageX + 3,storageY + -5],
            [storageX + 5,storageY + -5],
            [storageX + -5,storageY + -3],
            [storageX + 5,storageY + -3],
            [storageX + -5,storageY + -1],
            [storageX + 5,storageY + 3],
            [storageX + -5,storageY + 5],
            [storageX + -3,storageY + 5],
            [storageX + -1,storageY + 5],
            [storageX + 1,storageY + 5],
            [storageX + 3,storageY + 5],
            [storageX + 0,storageY + 5],
            [storageX + 0,storageY - 5],
            [storageX + -6,storageY + -6],
            [storageX + -4,storageY + -6],
            [storageX + -2,storageY + -6],
            [storageX + 0,storageY + -6],
            [storageX + 2,storageY + -6],
            [storageX + 4,storageY + -6],
            [storageX + 6,storageY + -6],
            [storageX + -6,storageY + -4],
            [storageX + 6,storageY + -4],
            [storageX + -6,storageY + -2],
            [storageX + 6,storageY + -2],
            [storageX + 6,storageY + 0],
            [storageX + 6,storageY + 2],
            [storageX + -6,storageY + 4],
            [storageX + 6,storageY + 4],
            [storageX + -6,storageY + 6],
            [storageX + -4,storageY + 6],
            [storageX + -2,storageY + 6],
            [storageX + 0,storageY + 6],
            [storageX + 2,storageY + 6],
            [storageX + 4,storageY + 6],
            [storageX + 6,storageY + 6],
            // [storageX + -5,storageY + -7],
            // [storageX + -3,storageY + -7],
            // [storageX + -1,storageY + -7],
            // [storageX + 1,storageY + -7],
            // [storageX + 3,storageY + -7],
            // [storageX + 5,storageY + -7],
            // [storageX + -7,storageY + -5],
            // [storageX + -7,storageY + -3],
            // [storageX + -7,storageY + -1],
            // [storageX + -7,storageY + 5],
            // [storageX + -5,storageY + 7],
            // [storageX + -3,storageY + 7],
            // [storageX + -1,storageY + 7],
            // [storageX + 1,storageY + 7],
            // [storageX + 3,storageY + 7],
            // [storageX + 5,storageY + 7],
            // [storageX + 7,storageY + 5],
            // [storageX + 7,storageY + 3],
            // [storageX + 7,storageY + 1],
            // [storageX + 7,storageY + -1],
            // [storageX + 7,storageY + -3],
            // [storageX + 7,storageY + -5],
            // [storageX + 0,storageY + 7],
            // [storageX + 7,storageY + 0],
            // [storageX + 0,storageY + -7],
            // [storageX + 4,storageY + 7],
            // [storageX + -4,storageY + 7],
            // [storageX + 7,storageY + 4],
            // [storageX + 7,storageY + -4],
            // [storageX + 4,storageY + -7],
            // [storageX + -4,storageY + -7],
            // [storageX + -7,storageY + 4],
            // [storageX + -7,storageY + -4],

            // non extension buildings
            [storageX + -1,storageY + 2],
            [storageX + 0,storageY + -2],
            [storageX + 2,storageY + 0],
            [storageX + 4,storageY + 0],
            [storageX + 2,storageY + 2],
            [storageX + 3,storageY + 2],
            [storageX + -2,storageY + 0],
            // towers
            // [storageX + 4,storageY + -2],
            // [storageX + 3,storageY + -1],
            // [storageX + 5,storageY + -1],
            // [storageX + 3,storageY + 1],
            // [storageX + 5,storageY + 1],
            // [storageX + 4,storageY + 2],
            // labs
            [storageX + -3,storageY + 0],
            [storageX + -3,storageY + 1],
            [storageX + -3,storageY + 2],
            [storageX + -3,storageY + 3],
            [storageX + -4,storageY + 1],
            [storageX + -4,storageY + 2],
            [storageX + -5,storageY + 0],
            [storageX + -5,storageY + 1],
            [storageX + -5,storageY + 2],
            [storageX + -5,storageY + 3],
        ]

        for(let position of listOfPositionsInFutureToBeBuilt) {
            if(position[0] <= 47 && position[0] >= 2 && position[1] <= 47 && position[1] >= 2) {
                costs.set(position[0], position[1], 10);
            }
        }
    }



    return costs;
}
// const makeStructuresCostMatrix = (roomName: string): boolean | CostMatrix => {
//     let currentRoom = Game.rooms[roomName];
//     if(currentRoom == undefined || currentRoom === undefined || !currentRoom || currentRoom === null || currentRoom == null) {
//         return false;
//     }
//     let costs = new PathFinder.CostMatrix;

//     let storage:any = Game.getObjectById(currentRoom.memory.Structures.storage) || currentRoom.findStorage();


//     let illegal_locations_for_roads = [
//         []
//     ]

//     let positions_to_loop_through = getNeighbours(storage.pos, illegal_locations_for_roads);

//     for(let almost_position of checkerboard) {
//         costs.set(almost_position[0],almost_position[1],255);
//     }


//     let existingStructures = currentRoom.find(FIND_STRUCTURES);
//     if(existingStructures.length > 0) {
//         existingStructures.forEach(building => {
//             if(building.structureType != STRUCTURE_RAMPART && building.structureType != STRUCTURE_CONTAINER && building.structureType != STRUCTURE_ROAD) {
//                 costs.set(building.pos.x, building.pos.y, 255);
//             }
//             // else {
//             //     costs.set(building.pos.x, building.pos.y, 0);
//             // }
//         });
//     }



//     return costs;
// }




const RampartBorderCallbackFunction = (roomName: string): boolean | CostMatrix => {
    let currentRoom:any = Game.rooms[roomName];

    let costs = new PathFinder.CostMatrix;

    let storage = Game.getObjectById(currentRoom.memory.Structures.storage) || currentRoom.findStorage();


    let rampartLocations = [];
    for(let i = -10; i<11; i++) {
        for(let o = -10; o <11; o++) {
            if((i==10 || i==-10)) {
                let combinedX = storage.pos.x + i;
                if(combinedX >= 2 && combinedX <= 47) {
                    rampartLocations.push([i,o]);
                }
                else {
                    if(combinedX == 48) {
                        rampartLocations.push([i-1,o]);
                    }
                    else if(combinedX == 49) {
                        rampartLocations.push([i-2,o]);
                    }
                    else if(combinedX == 1) {
                        rampartLocations.push([i+1,o]);
                    }
                    else if(combinedX == 0) {
                        rampartLocations.push([i+2,o]);
                    }
                }
            }
            else if((o==10 || o==-10)) {
                let combinedY = storage.pos.y + o;
                if(combinedY >= 2 && combinedY <= 47) {
                    rampartLocations.push([i,o]);
                }
                else {
                    if(combinedY == 48) {
                        rampartLocations.push([i,o-1]);
                    }
                    else if(combinedY == 49) {
                        rampartLocations.push([i,o-2]);
                    }
                    else if(combinedY == 1) {
                        rampartLocations.push([i,o+1]);
                    }
                    else if(combinedY == 0) {
                        rampartLocations.push([i,o+2]);
                    }
                }
            }
        }
    }
    let storageRampartNeighbors = getNeighbours(storage.pos, rampartLocations);
    for(let location of storageRampartNeighbors) {
        costs.set(location.x, location.y, 255);
    }

    return costs;
}












// let route = Game.map.findRoute(room.name, targetRoomName)
// let roomNames = [];
// _.forEach(route, function(point){
//     roomNames.push(point.room);
// });



function Build_Remote_Roads(room) {
    if(room.memory.danger) {
        return;
    }
    let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();

    let resourceData = _.get(room.memory, ['resources']);
    _.forEach(resourceData, function(data, targetRoomName){
        _.forEach(data.energy, function(values, sourceId:any) {
            if(room.name != targetRoomName) {
                let source:any = Game.getObjectById(sourceId);
                if(source != null && storage) {
                    let pathFromStorageToRemoteSource = PathFinder.search(storage.pos, {pos:source.pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: (roomName) => makeStructuresCostMatrixModifiedTest(roomName)});
                    let containerSpot = pathFromStorageToRemoteSource.path[pathFromStorageToRemoteSource.path.length - 1];
                    values.pathLength = pathFromStorageToRemoteSource.path.length;
                    if(containerSpot && containerSpot.roomName) {
                        Game.rooms[containerSpot.roomName].createConstructionSite(containerSpot.x, containerSpot.y, STRUCTURE_CONTAINER);
                        pathBuilder(pathFromStorageToRemoteSource, STRUCTURE_ROAD, room);
                    }
                }
            }
        });
    });

}

function Situational_Building(room) {
    if(room.controller.level == 4 && room.memory.data && room.memory.data.DOBug && (room.memory.data.DOGug == 3 || room.memory.data.DOBug == 4)) {
        if(room.memory.data.DOBug == 3) {
            let spawns = room.find(FIND_MY_SPAWNS);
            let spawn;
            if(spawns.length > 0) {
                spawn = spawns[0];
            }
            let storagePosition = new RoomPosition(spawn.pos.x, spawn.pos.y - 2, room.name);
            let lookForStoragePositionBuildings = storagePosition.lookFor(LOOK_STRUCTURES);
            for(let building of lookForStoragePositionBuildings) {
                if(building.structureType == STRUCTURE_CONTAINER) {
                    building.destroy();
                }
            }
        }
        if(room.memory.data.DOBug == 4) {
            let spawns = room.find(FIND_MY_SPAWNS);
            let spawn;
            if(spawns.length > 0) {
                spawn = spawns[0];
            }
            let storagePosition = new RoomPosition(spawn.pos.x, spawn.pos.y - 2, room.name);
            storagePosition.createConstructionSite(STRUCTURE_STORAGE);
        }
    }


}


export { Build_Remote_Roads, Situational_Building };

export default construction;

// module.exports = construction;
