import randomWords from "random-words";

function getNeighbours(tile) {
    // const deltas = [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]]; not checkerboard
    const checkerboard =
    [[-2,-2], [2,-2], [2,0], [2,2],
    [-3,-3], [-1,-3], [1,-3], [3,-3], [-3,-1], [-3,3], [1,3], [3,3],
    [-4,-4],[-2,-4],[0,-4],[2,-4],[4,-4],[-4,-2],[4,0],[-4,4],[-2,4],[0,4],[2,4],[4,4],
    [-5,-5],[-3,-5],[-1,-5],[1,-5],[3,-5],[5,-5],[-5,-3],[5,-3],[5,3],[-5,5],[-3,5],[-1,5],[1,5],[3,5],[5,5],
    [-6,-6],[-4,-6],[-2,-6],[0,-6],[2,-6],[4,-6],[6,-6],[-6,-4],[6,-4],[-6,-2],[6,-2],[6,0],[6,2],[-6,4],[6,4],[-6,6],[-4,6],[-2,6],[0,6],[2,6],[4,6],[6,6],
    [-7,-7],[-5,-7],[-3,-7],[-1,-7],[1,-7],[3,-7],[5,-7],[7,-7],[-7,-5],[-7,-3],[-7,-1],[-7,3],[-7,5],[-7,7],[-5,7],[-3,7],[-1,7],[1,7],[3,7],[5,7],[7,7],[7,5],[7,3],[7,1],[7,-1],[7,-3],[7,-5]];

    const negative_checkerboard =
    [[0,-1],[-1,0],[1,0],[0,1],
    [-1,-2],[1,-2],[-2,-1],[2,-1],[-2,1],[2,1],[-1,2],[1,2],
    [-2,-3],[0,-3],[2,-3],[-3,-2],[3,-2],[-3,0],[3,0],[-3,2],[3,2],[-2,3],[0,3],[2,3],
    [-3,-4],[-1,-4],[1,-4],[3,-4],[-4,-3],[4,-3],[-4,-1],[4,-1],[-4,1],[4,1],[-4,3],[4,3],[-3,4],[-1,4],[1,4],[3,4],
    [-4,-5],[-2,-5],[0,-5],[2,-5],[2,-5],[4,-5],[-5,-4],[5,-4],[-5,-2],[5,-2],[-5,0],[5,0],[-5,2],[5,2],[-5,4],[5,4],[-4,5],[-2,5],[0,5],[2,5],[4,5]];

    let neighbours = [];
    checkerboard.forEach(function(delta) {
        neighbours.push({x: tile.x + delta[0], y: tile.y + delta[1]});
    });
    return neighbours;
}

function pathBuilder(neighbors, structure, room, usingPathfinder=true) {
    let buldingAlreadyHereCount = 0;
    let constructionSitesPlaced = 0;

    let keepTheseRoads = [];
    // structure != STRUCTURE_ROAD

    if (structure == STRUCTURE_EXTENSION) {
        _.forEach(neighbors, function(block) {
            let blockSpot = new RoomPosition(block.x, block.y, room.name);
            let lookForExistingConstructionSites = blockSpot.lookFor(LOOK_CONSTRUCTION_SITES);
            let lookForExistingStructures = blockSpot.lookFor(LOOK_STRUCTURES);
            let lookForTerrain = blockSpot.lookFor(LOOK_TERRAIN);

            let Mineral:any = Game.getObjectById(room.memory.mineral) || room.findMineral();

            if(blockSpot.getRangeTo(room.controller) <= 3 || blockSpot.getRangeTo(Mineral) <= 2) {
                buldingAlreadyHereCount ++;
                return;
            }
            new RoomVisual(blockSpot.roomName).circle(blockSpot.x, blockSpot.y, {fill: 'transparent', radius: 0.25, stroke: '#FABFAB'});

            if(lookForExistingStructures.length == 1 && lookForExistingStructures[0].structureType == STRUCTURE_ROAD) {
                if (lookForTerrain[0] == "swamp" || lookForTerrain[0] == "plain") {
                    constructionSitesPlaced ++;
                    let result = Game.rooms[blockSpot.roomName].createConstructionSite(blockSpot.x, blockSpot.y, structure)
                    if(result !== -8 && result !== -14) {
                        lookForExistingStructures[0].destroy();
                    }
                    return;
                }
            }

            if(lookForExistingStructures.length != 0 || lookForExistingConstructionSites.length != 0) {
                buldingAlreadyHereCount ++;
                return;
            }
            if (lookForTerrain[0] == "swamp" || lookForTerrain[0] == "plain") {
                constructionSitesPlaced ++;
                Game.rooms[blockSpot.roomName].createConstructionSite(blockSpot.x, blockSpot.y, structure);
                return;
            }
        });
    }
    else if(!usingPathfinder && structure == STRUCTURE_ROAD) {
        _.forEach(neighbors, function(block) {
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

            if (lookForTerrain[0] == "swamp" || lookForTerrain[0] == "plain") {
                constructionSitesPlaced ++;
                Game.rooms[block.roomName].createConstructionSite(block.x, block.y, structure);
                return;
            }
        });
    }
    else {
        _.forEach(neighbors.path, function(block) {
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

            if (lookForTerrain[0] == "swamp" || lookForTerrain[0] == "plain") {
                constructionSitesPlaced ++;
                Game.rooms[block.roomName].createConstructionSite(block.x, block.y, structure);
                return;
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
    if(room.memory.danger) {
        return;
    }



    if(room.controller.level >= 1 && room.memory.spawn) {
        let storage = Game.getObjectById(room.memory.storage) || room.findStorage();
        let spawn = Game.getObjectById(room.memory.spawn) || room.findSpawn();

        let binLocation;
        if(room.controller.level >= 5 && storage) {
            binLocation = new RoomPosition(storage.pos.x, storage.pos.y + 1, room.name);
        }
        else {
            binLocation = new RoomPosition(spawn.pos.x, spawn.pos.y - 1, room.name);
        }
        if(spawn || storage) {
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
            if(lookForExistingStructures.length != 0) {
                lookForExistingStructures[0].destroy();
            }
            else {
                room.createConstructionSite(spawn.pos.x, spawn.pos.y -2, STRUCTURE_STORAGE);
            }
        }


        if(room.controller.level >= 2) {
            if(spawn && !storage) {
                let spawnNeighbours = getNeighbours(spawn.pos);

                if(lookForExistingStructures.length != 0) {
                    pathBuilder(spawnNeighbours, STRUCTURE_EXTENSION, room);
                }
            }
            else if(storage) {
                let storageNeighbours = getNeighbours(storage.pos);

                if(lookForExistingStructures.length != 0) {
                    pathBuilder(storageNeighbours, STRUCTURE_EXTENSION, room);
                }
            }
        }

        if(room.controller.level >= 1) {
            let sources = room.find(FIND_SOURCES);
            if(storage) {
                let pathFromStorageToSource1 = PathFinder.search(storage.pos, {pos:sources[0].pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: () => makeStructuresCostMatrix(room.name)});
                // let pathFromStorageToSource1 = PathFinder.search(storage.pos, {pos:sources[0].pos, range:1}, {plainCost: 1, swampCost: 2});

                let container1 = pathFromStorageToSource1.path[pathFromStorageToSource1.path.length - 1];

                let pathFromStorageToSource2 = PathFinder.search(storage.pos, {pos:sources[1].pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: () => makeStructuresCostMatrix(room.name)});

                let container2 = pathFromStorageToSource2.path[pathFromStorageToSource2.path.length - 1];

                let pathFromStorageToController = PathFinder.search(storage.pos, {pos:room.controller.pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: () => makeStructuresCostMatrix(room.name)});

                pathFromStorageToController.path.pop();

                let linkLocation = pathFromStorageToController.path.pop();

                if(room.controller.level >= 7) {
                    let lookStructs = linkLocation.lookFor(LOOK_STRUCTURES);
                    if(lookStructs.length == 1 && lookStructs[0].structureType != STRUCTURE_LINK) {
                        lookStructs[0].destroy();
                    }
                    if(lookStructs.length == 0) {
                        room.createConstructionSite(linkLocation.x, linkLocation.y, STRUCTURE_LINK);
                    }


                    let spawns = room.find(FIND_MY_SPAWNS);
                    if(spawns.length < 2 && storage) {
                        let secondSpawnPosition = new RoomPosition(storage.pos.x, storage.pos.y - 2, room.name);
                        new RoomVisual(room.name).circle(secondSpawnPosition.x, secondSpawnPosition.y, {fill: 'transparent', radius: .75, stroke: '#BABABA'});
                        let listOfSpawnPositions = [];
                        listOfSpawnPositions.push(secondSpawnPosition);


                        DestroyAndBuild(room, listOfSpawnPositions, STRUCTURE_SPAWN);
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
                    let extractor = Game.getObjectById(room.memory.extractor) || room.findExtractor();
                    let mineral = Game.getObjectById(room.memory.mineral) || room.findMineral();
                    if(!extractor) {
                        room.createConstructionSite(mineral.pos.x, mineral.pos.y, STRUCTURE_EXTRACTOR);
                    }

                    let pathFromStorageToMineral = PathFinder.search(storage.pos, {pos:mineral.pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: () => makeStructuresCostMatrix(room.name)});
                    pathFromStorageToMineral.path.pop();

                    pathBuilder(pathFromStorageToMineral, STRUCTURE_ROAD, room);

                    if(room.terminal) {
                        let pathFromStorageToTerminal = PathFinder.search(storage.pos, {pos:room.terminal.pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: () => makeStructuresCostMatrix(room.name)});
                        pathBuilder(pathFromStorageToTerminal, STRUCTURE_ROAD, room);
                    }

                }
            }

        }

        if(room.controller.level >= 3) {
            if(storage) {
                let TowerLocations = [];
                TowerLocations.push(new RoomPosition(storage.pos.x + 5, storage.pos.y - 1, room.name));
                if(room.controller.level >= 5) {
                    TowerLocations.push(new RoomPosition(storage.pos.x + 3, storage.pos.y - 1, room.name));
                }
                if(room.controller.level >= 7) {
                    TowerLocations.push(new RoomPosition(storage.pos.x + 3, storage.pos.y + 1, room.name));
                }
                if(room.controller.level == 8) {
                    TowerLocations.push(new RoomPosition(storage.pos.x + 4, storage.pos.y + 2, room.name));
                    TowerLocations.push(new RoomPosition(storage.pos.x + 4, storage.pos.y - 2, room.name));
                    TowerLocations.push(new RoomPosition(storage.pos.x + 5, storage.pos.y + 1, room.name));
                }

                DestroyAndBuild(room, TowerLocations, STRUCTURE_TOWER);
            }
        }





// IMPORTNAT DO NOT DELETE
        let links = room.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_LINK);}});

        if(room.controller.level >= 5 && links.length < 2) {
            let sources = room.find(FIND_SOURCES);

            sources.forEach(source => {
                let sourceLink = source.pos.findInRange(links, 3)[0];
                if(sourceLink == undefined) {
                    let open = source.pos.getOpenPositionsIgnoreCreeps();
                    findTwoOpenSpotsForLink(open)
                }
            });
        }

        if(room.controller.level >= 6) {
            if(storage) {
                let storageLink = storage.pos.findInRange(links, 3)[0];
                if(storageLink == undefined) {
                    let storageLinkPosition = new RoomPosition(storage.pos.x-2, storage.pos.y, room.name);
                    new RoomVisual(room.name).circle(storageLinkPosition.x, storageLinkPosition.y, {fill: 'transparent', radius: .75, stroke: 'red'});
                    let positionsList = [];
                    positionsList.push(storageLinkPosition);

                    DestroyAndBuild(room, positionsList, STRUCTURE_LINK);
                }

                if(!room.terminal) {
                    let terminalPosition = new RoomPosition(storage.pos.x - 2, storage.pos.y + 2, room.name);
                    let positionsList = [];
                    positionsList.push(terminalPosition);
                    new RoomVisual(room.name).circle(terminalPosition.x, terminalPosition.y, {fill: 'transparent', radius: .75, stroke: 'green'});

                    DestroyAndBuild(room, positionsList, STRUCTURE_TERMINAL);
                }

                if(room.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_LAB);}}).length < 3) {

                    let LabLocations = [];
                    LabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y + 1, room.name));
                    LabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y + 1, room.name));
                    LabLocations.push(new RoomPosition(storage.pos.x - 4, storage.pos.y, room.name));

                    if(room.controller.level >= 7) {
                        LabLocations.push(new RoomPosition(storage.pos.x - 4, storage.pos.y + 2, room.name));
                        LabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y + 3, room.name));
                        LabLocations.push(new RoomPosition(storage.pos.x - 1, storage.pos.y + 3, room.name));
                    }
                    if(room.controller.level == 8) {
                        LabLocations.push(new RoomPosition(storage.pos.x - 6, storage.pos.y + 2, room.name));
                        LabLocations.push(new RoomPosition(storage.pos.x - 7, storage.pos.y + 1, room.name));
                        LabLocations.push(new RoomPosition(storage.pos.x - 6, storage.pos.y, room.name));
                        LabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y - 1, room.name));
                    }
                    DestroyAndBuild(room, LabLocations, STRUCTURE_LAB);
                }


            }
        }


        if(room.controller.level >= 5) {
            let rampartLocations = [];
            let rampartsInRoom = room.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_RAMPART);}});
            if(rampartsInRoom.length > 0) {



                rampartsInRoom.forEach(rampart => {
                    let rampartsnexttorampart = rampart.pos.findInRange(rampartsInRoom, 1);

                    for(let RP of rampartsnexttorampart) {
                        if(rampart.pos == RP.pos) {
                            return;
                        }
                        else if(rampart.pos.x == RP.pos.x || rampart.pos.y == RP.pos.y) {
                            rampartLocations.push(RP.pos);
                            return;
                        }
                    }
                });
                pathBuilder(rampartLocations, STRUCTURE_ROAD, room, false)
            }

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

        function findTwoOpenSpotsForLink(open:Array<RoomPosition>) {
            if(open.length > 1) {
                open.sort((a,b) => a.findPathTo(storage.pos).length - b.findPathTo(storage.pos).length)
                // let closestOpen = storage.pos.findClosestByRange(open);
                new RoomVisual(room.name).circle(open[1].x, open[1].y, {fill: 'transparent', radius: 0.75, stroke: 'red'});
                for (let i = 1; i < open.length; i++) {
                    let result = open[i].createConstructionSite(STRUCTURE_LINK);
                    console.log(result)
                    if(result == 0) {
                        return;
                    }
                }

                open[0].createConstructionSite(STRUCTURE_LINK);
            }
            else {
                let NewOpen = open[0].getOpenPositionsIgnoreCreeps();
                findTwoOpenSpotsForLink(NewOpen)
            }
        }


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
            if(StructureType == STRUCTURE_SPAWN) {
                room.createConstructionSite(location, StructureType, randomWords({exactly:3,wordsPerString:1,join: '-'}));
            }
            else {
                room.createConstructionSite(location, StructureType);
            }
        }
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
            else {
                costs.set(building.pos.x, building.pos.y, 0);
            }
        });
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
    let storage = Game.getObjectById(room.memory.storage) || room.findStorage();

    let resourceData = _.get(room.memory, ['resources']);
    _.forEach(resourceData, function(data, targetRoomName){
        _.forEach(data.energy, function(values, sourceId:any) {
            if(room.name != targetRoomName) {
                let source:any = Game.getObjectById(sourceId);
                if(source != null && storage) {
                    let pathFromStorageToRemoteSource = PathFinder.search(storage.pos, {pos:source.pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: (roomName) => makeStructuresCostMatrix(roomName)});
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

export { Build_Remote_Roads };

export default construction;

// module.exports = construction;
