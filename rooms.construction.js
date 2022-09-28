function getNeighbours(tile) {
    // const deltas = [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]]; not checkerboard
    const checkerboard = 
    [[-2,-2], [2,-2], [-2,0], [2,0], [-2,2], [0,2], [2,2], 
    [-3,-3], [-1,-3], [1,-3], [3,-3], [-3,-1], [3,-1], [-3,1], [3,1], [-3,3], [-1,3], [1,3], [3,3],
    [-4,-4],[-2,-4],[0,-4],[2,-4],[4,-4],[-4,-2],[4,-2],[-4,0],[4,0],[-4,2],[4,2],[-4,4],[-2,4],[0,4],[2,4],[4,4],
    [-5,-5],[-3,-5],[-1,-5],[1,-5],[3,-5],[5,-5],[-5,-3],[5,-3],[-5,-1],[5,-1],[-5,1],[5,1],[-5,3],[5,3],[-5,5],[-3,5],[-1,5],[1,5],[3,5],[5,5],
    [-6,-6],[-4,-6],[-2,-6],[0,-6],[2,-6],[4,-6],[6,-6],[-6,-4],[6,-4],[-6,-2],[6,-2],[-6,0],[6,0],[-6,2],[6,2],[-6,4],[6,4],[-6,6],[-4,6],[-2,6],[0,6],[2,6],[4,6],[6,6]];

    const negative_checkerboard =
    [[0,-1],[-1,0],[1,0],[0,1],
    [-1,-2],[1,-2],[-2,-1],[2,-1],[-2,1],[2,1],[-1,2],[1,2],
    [-2,-3],[0,-3],[2,-3],[-3,-2],[3,-2],[-3,0],[3,0],[-3,2],[3,2],[-2,3],[0,3],[2,3],
    [-3,-4],[-1,-4],[1,-4],[3,-4],[-4,-3],[4,-3],[-4,-1],[4,-1],[-4,1],[4,1],[-4,3],[4,3],[-3,4],[-1,4],[1,4],[3,4]
    [-4,-5],[-2,-5],[0,-5],[2,-5],[2,-5],[4,-5],[-5,-4],[5,-4],[-5,-2],[5,-2],[-5,0],[5,0],[-5,2],[5,2],[-5,4],[5,4],[-4,5],[-2,5],[0,5],[2,5],[4,5]];

    let neighbours = [];
    checkerboard.forEach(function(delta) {
        neighbours.push({x: tile.x + delta[0], y: tile.y + delta[1]});
    });
    return neighbours;
}

function pathBuilder(neighbors, structure, targetRoom, room) {
    let buldingAlreadyHereCount = 0;
    let constructionSitesPlaced = 0;
    
    if(!room.memory.keepTheseRoads) {
        room.memory.keepTheseRoads = [];
    }

    let keepTheseRoads = [];

    _.forEach(neighbors, function(block) {
        let blockSpot = new RoomPosition(block.x, block.y, room.name);
        let lookForExistingConstructionSites = blockSpot.lookFor(LOOK_CONSTRUCTION_SITES);       
        let lookForExistingStructures = blockSpot.lookFor(LOOK_STRUCTURES);
        let lookForTerrain = blockSpot.lookFor(LOOK_TERRAIN);


        _.forEach(lookForExistingStructures, function(building) {
            if(building.structureType == STRUCTURE_ROAD) {
                keepTheseRoads.push(building.id);
            }
        });


        if(structure == STRUCTURE_ROAD && lookForExistingStructures.length == 1 && lookForExistingStructures[0].structureType == STRUCTURE_RAMPART && lookForExistingConstructionSites.length == 0) {
            constructionSitesPlaced ++;
            room.createConstructionSite(block.x, block.y, structure);
            return;
        }

        if(lookForExistingStructures.length != 0 || lookForExistingConstructionSites.length != 0) {
            buldingAlreadyHereCount ++;
            return;
        }
        if (lookForTerrain == "swamp" || lookForTerrain == "plain") {
            constructionSitesPlaced ++;
            room.createConstructionSite(block.x, block.y, structure);
            return;
        }
    });
    console.log(room.name , structure, "[", buldingAlreadyHereCount, "buildings here already ]", "[", constructionSitesPlaced, "construction sites placed ]");

    _.forEach(keepTheseRoads, function(road) {
        if(!_.includes(room.memory.keepTheseRoads, road, 0)) {
            room.memory.keepTheseRoads.push(road);
        }
    });
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
    
    room.memory.keepTheseRoads = [];

    if(room.controller.level >= 1 && room.memory.spawn) {
        let storage = Game.getObjectById(room.memory.storage) || room.findStorage();
        let spawn = Game.getObjectById(room.memory.spawn) || room.findSpawn();
        let existingStructures = room.find(FIND_STRUCTURES);

        if(room.controller.level == 4 && storage == undefined) {
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
            if(storage == undefined) {
                let spawnNeighbours = getNeighbours(spawn.pos);

                if(existingStructures.length != 0) {
                    pathBuilder(spawnNeighbours, STRUCTURE_EXTENSION, room, room);
                }
            }
            else {
                let storageNeighbours = getNeighbours(storage.pos);

                if(existingStructures.length != 0) {
                    pathBuilder(storageNeighbours, STRUCTURE_EXTENSION, room, room);
                }
            }
        }

        if(room.controller.level >= 1) {
            let sources = room.find(FIND_SOURCES);
            let pathFromSpawnToSource1 = spawn.pos.findPathTo(sources[0], {ignoreCreeps: true, ignoreRoads: true, swampCost: 1});
            pathFromSpawnToSource1.pop();
            pathFromSpawnToSource1.pop();


            let pathFromSpawnToSource2 = spawn.pos.findPathTo(sources[1], {ignoreCreeps: true, ignoreRoads: true, swampCost: 1});
            pathFromSpawnToSource2.pop();
            pathFromSpawnToSource2.pop();

            let pathFromSpawnToController = spawn.pos.findPathTo(room.controller, {ignoreCreeps: true, ignoreRoads: true, swampCost: 1});
            pathFromSpawnToController.pop();
            pathFromSpawnToController.pop();
            pathFromSpawnToController.pop();


            pathBuilder(pathFromSpawnToSource1, STRUCTURE_ROAD, room, room);

            pathBuilder(pathFromSpawnToSource2, STRUCTURE_ROAD, room, room);

            pathBuilder(pathFromSpawnToController, STRUCTURE_ROAD, room, room);


            let resourceData = _.get(room.memory, ['resources']);
            _.forEach(resourceData, function(data, targetRoomName){
                _.forEach(data.energy, function(values, sourceId) {
                    if(room.name != targetRoomName) {
                        let source = Game.getObjectById(sourceId);

                        if(source != null) {
                            let pathFromSpawnToRemoteSource = spawn.pos.findPathTo(source, {ignoreCreeps: true, ignoreRoads: true, swampCost: 1});
                            pathBuilder(pathFromSpawnToRemoteSource, STRUCTURE_ROAD, Game.rooms[targetRoomName], room);

                            let pathFromRemoteSourceToRemoteSpawn = source.pos.findPathTo(spawn, {ignoreCreeps: true, ignoreRoads: true, swampCost: 1});
                            pathBuilder(pathFromRemoteSourceToRemoteSpawn, STRUCTURE_ROAD, room, Game.rooms[targetRoomName]);
                        }
                    }
                });
            });
        }
        
        if(room.controller.level >= 6) {
            let extractor = Game.getObjectById(room.memory.extractor) || room.findExtractor();
            let mineral = Game.getObjectById(room.memory.mineral) || room.findMineral();
            if(!extractor) { 
                room.createConstructionSite(mineral.pos.x, mineral.pos.y, STRUCTURE_EXTRACTOR);
            }
    
            pathFromStorageToMineral = storage.pos.findPathTo(mineral, {ignoreCreeps: true, ignoreRoads: true, swampCost: 1});
            pathFromStorageToMineral.pop();
            pathFromStorageToMineral.pop();

            pathBuilder(pathFromStorageToMineral, STRUCTURE_ROAD, room, room);
        }



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



module.exports = construction;