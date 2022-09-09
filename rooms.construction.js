function getNeighbours(tile) {
    // const deltas = [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]]; not checkerboard
    const checkerboard = 
    [[-2,-2], [0,-2], [2,-2], [-2,0], [2,0], [-2,2], [0,2], [2,2], 
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



function construction(room) {
    if(room.controller.level >= 2) {
        let storage = Game.getObjectById(room.memory.storage) || room.findStorage();
        let spawns = room.find(FIND_MY_STRUCTURES, {filter: { structureType : STRUCTURE_SPAWN}});
        let existingStructures = room.find(FIND_STRUCTURES);


        if(storage == undefined) {
            let spawnNeighbours = getNeighbours(spawns[0].pos);

            if(existingStructures.length != 0) {
                _.forEach(spawnNeighbours, function(block) {
                    const blockSpot = new RoomPosition(block.x, block.y, room.name);
                    let lookForExistingConstructionSites = blockSpot.lookFor(LOOK_CONSTRUCTION_SITES);
                    let lookForExistingStructures = blockSpot.lookFor(LOOK_STRUCTURES);
                    let lookForTerrain = blockSpot.lookFor(LOOK_TERRAIN);
                    if(lookForExistingStructures.length != 0 || lookForExistingConstructionSites.length != 0) {
                        console.log('building here already')
                        return;
                    }
                    else if (lookForTerrain == "swamp" || lookForTerrain == "plain") {
                        room.createConstructionSite(block.x, block.y, STRUCTURE_EXTENSION);
                        return;
                    }
                });
            }
        }
        else {
            let storageNeighbours = getNeighbours(storage.pos);

            if(existingStructures.length != 0) {
                _.forEach(storageNeighbours, function(block) {
                    const blockSpot = new RoomPosition(block.x, block.y, room.name);
                    let lookForExistingConstructionSites = blockSpot.lookFor(LOOK_CONSTRUCTION_SITES);
                    let lookForExistingStructures = blockSpot.lookFor(LOOK_STRUCTURES);
                    let lookForTerrain = blockSpot.lookFor(LOOK_TERRAIN);
                    if(lookForExistingStructures.length != 0 || lookForExistingConstructionSites.length != 0) {
                        console.log('building here already')
                        return;
                    }
                    else if (lookForTerrain == "swamp" || lookForTerrain == "plain") {
                        room.createConstructionSite(block.x, block.y, STRUCTURE_EXTENSION);
                        return;
                    }
                });
            }
        }
    }
}



module.exports = construction;