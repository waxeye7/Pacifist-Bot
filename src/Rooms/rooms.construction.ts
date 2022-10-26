function getNeighbours(tile) {
    // const deltas = [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]]; not checkerboard
    const checkerboard =
    [[-2,-2], [2,-2], [-2,0], [2,0], [-2,2], [2,2],
    [-3,-3], [-1,-3], [1,-3], [3,-3], [-3,-1], [3,-1], [-3,1], [3,1], [-3,3], [-1,3], [1,3], [3,3],
    [-4,-4],[-2,-4],[0,-4],[2,-4],[4,-4],[-4,-2],[4,-2],[-4,0],[4,0],[-4,2],[4,2],[-4,4],[-2,4],[0,4],[2,4],[4,4],
    [-5,-5],[-3,-5],[-1,-5],[1,-5],[3,-5],[5,-5],[-5,-3],[5,-3],[-5,-1],[5,-1],[-5,1],[5,1],[-5,3],[5,3],[-5,5],[-3,5],[-1,5],[1,5],[3,5],[5,5],
    [-6,-6],[-4,-6],[-2,-6],[0,-6],[2,-6],[4,-6],[6,-6],[-6,-4],[6,-4],[-6,-2],[6,-2],[-6,0],[6,0],[-6,2],[6,2],[-6,4],[6,4],[-6,6],[-4,6],[-2,6],[0,6],[2,6],[4,6],[6,6]];

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

function pathBuilder(neighbors, structure, room) {
    let buldingAlreadyHereCount = 0;
    let constructionSitesPlaced = 0;

    let keepTheseRoads = [];

    _.forEach(neighbors.path, function(block) {
        let lookForExistingConstructionSites = block.lookFor(LOOK_CONSTRUCTION_SITES);
        let lookForExistingStructures = block.lookFor(LOOK_STRUCTURES);
        let lookForTerrain = block.lookFor(LOOK_TERRAIN);

        if(structure == STRUCTURE_ROAD) {
            new RoomVisual(block.roomName).circle(block.x, block.y, {fill: 'transparent', radius: 0.25, stroke: 'orange'});
        }


        if(structure == STRUCTURE_EXTENSION && block.getRangeTo(room.controller) <= 4) {
            buldingAlreadyHereCount ++;
            return;
        }

        _.forEach(lookForExistingStructures, function(building) {
            if(building.structureType == STRUCTURE_ROAD) {
                keepTheseRoads.push(building.id);
            }
        });

        _.forEach(keepTheseRoads, function(road) {
            if(!_.includes(Game.rooms[block.roomName].memory.keepTheseRoads, road, 0)) {
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

        let existingStructures = room.find(FIND_STRUCTURES);

        let binLocation;
        if(room.controller.level >= 5 && storage) {
            binLocation = new RoomPosition(storage.pos.x, storage.pos.y + 1, room.name);
        }
        else {
            binLocation = new RoomPosition(spawn.pos.x, spawn.pos.y - 1, room.name);
        }
        let lookForExistingStructuresOnBinLocation = binLocation.lookFor(LOOK_STRUCTURES);
        if(lookForExistingStructuresOnBinLocation.length != 0) {
            if(lookForExistingStructuresOnBinLocation[0].structureType != STRUCTURE_CONTAINER) {
                lookForExistingStructuresOnBinLocation[0].destroy();
            }
        }
        else {
            binLocation.createConstructionSite(STRUCTURE_CONTAINER);
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

        if(room.controller.level >= 4 && !storage || room.controller.level == 4 && storage.structureType == STRUCTURE_CONTAINER) {
            let storageLocation = new RoomPosition(spawn.pos.x, spawn.pos.y -2, room.name);
            let lookForExistingStructures = storageLocation.lookFor(LOOK_STRUCTURES);
            if(lookForExistingStructures.length != 0) {
                lookForExistingStructures[0].destroy();
            }
            else {
                room.createConstructionSite(spawn.pos.x, spawn.pos.y -2, STRUCTURE_STORAGE);
            }
        }


        if(room.controller.level >= 2) {
            if(!storage) {
                let spawnNeighbours = getNeighbours(spawn.pos);

                if(existingStructures.length != 0) {
                    pathBuilder(spawnNeighbours, STRUCTURE_EXTENSION, room);
                }
            }
            else {
                let storageNeighbours = getNeighbours(storage.pos);

                if(existingStructures.length != 0) {
                    pathBuilder(storageNeighbours, STRUCTURE_EXTENSION, room);
                }
            }
        }

        if(room.controller.level >= 1) {
            let sources = room.find(FIND_SOURCES);
            if(storage) {
                let pathFromStorageToSource1 = PathFinder.search(storage.pos, {pos:sources[0].pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: () => makeStructuresCostMatrix(room.name)});
                // let pathFromStorageToSource1 = PathFinder.search(storage.pos, {pos:sources[0].pos, range:1}, {plainCost: 1, swampCost: 2});

                let container1 = pathFromStorageToSource1.path.pop();

                let pathFromStorageToSource2 = PathFinder.search(storage.pos, {pos:sources[1].pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: () => makeStructuresCostMatrix(room.name)});

                let container2 = pathFromStorageToSource2.path.pop();

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
                }


                pathBuilder(pathFromStorageToSource1, STRUCTURE_ROAD, room);
                if(room.controller.level < 6) {
                    Game.rooms[container1.roomName].createConstructionSite(container1.x, container1.y, STRUCTURE_CONTAINER);
                }

                pathBuilder(pathFromStorageToSource2, STRUCTURE_ROAD, room);
                if(room.controller.level < 6) {
                    Game.rooms[container2.roomName].createConstructionSite(container2.x, container2.y, STRUCTURE_CONTAINER);
                }

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



// IMPORTNAT DO NOT DELETE
        let links = room.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_LINK);}});

        if(room.controller.level >= 6) {
            if(storage) {
                let storageLink = storage.pos.findInRange(links, 3)[0];
                if(storageLink == undefined) {
                    let storageLinkPosition = new RoomPosition(storage.pos.x-2, storage.pos.y, room.name);
                    new RoomVisual(room.name).circle(storageLinkPosition.x, storageLinkPosition.y, {fill: 'transparent', radius: .75, stroke: 'red'});
                    let existingStructuresHere = storageLinkPosition.lookFor(LOOK_STRUCTURES);
                    if(existingStructuresHere.length != 0) {
                        if(existingStructuresHere[0].structureType != STRUCTURE_LINK) {
                            existingStructuresHere[0].destroy();
                        }
                    }
                    else {
                        storageLinkPosition.createConstructionSite(STRUCTURE_LINK);
                    }
                }
            }

            let sources = room.find(FIND_SOURCES);

            sources.forEach(source => {
                let sourceLink = source.pos.findInRange(links, 4)[0];
                if(sourceLink == undefined) {
                    let open = source.pos.getOpenPositionsIgnoreCreeps();
                    findTwoOpenSpotsForLink(open)
                }
            });
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
                open[1].createConstructionSite(STRUCTURE_LINK);
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

const makeStructuresCostMatrix = (roomName: string): boolean | CostMatrix => {
    let currentRoom = Game.rooms[roomName];
    let existingStructures = currentRoom.find(FIND_STRUCTURES);
    if(!currentRoom) return false;
    let costs = new PathFinder.CostMatrix;

    existingStructures.forEach(building => {
        if(building.structureType == STRUCTURE_ROAD) {
            costs.set(building.pos.x, building.pos.y, 1);
        }
        else if(building.structureType != STRUCTURE_RAMPART && building.structureType != STRUCTURE_CONTAINER) {
            costs.set(building.pos.x, building.pos.y, 255);
        }
    });

    return costs;
}



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
                    let pathFromStorageToRemoteSource = PathFinder.search(storage.pos, {pos:source.pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: () => makeStructuresCostMatrix(room.name)});
                    let containerSpot = pathFromStorageToRemoteSource.path.pop();
                    values.pathLength = pathFromStorageToRemoteSource.path.length;
                    Game.rooms[containerSpot.roomName].createConstructionSite(containerSpot.x, containerSpot.y, STRUCTURE_CONTAINER);
                    pathBuilder(pathFromStorageToRemoteSource, STRUCTURE_ROAD, room);
                }
            }
        });
    });

}

export { Build_Remote_Roads };

export default construction;

// module.exports = construction;
