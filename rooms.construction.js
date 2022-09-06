function getNeighbours(tile) {
    // const deltas = [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]]; not checkerboard
    const checkerboard = [[-2,-2], [0,-2], [2,-2], [-2,0], [2,0], [-2,2], [0,2], [2,2], [-3,-3], [-1,-3], [1,-3], [3,-3], [-3,-1], [3,-1], [-3,1], [3,1], [-3,3], [-1,3], [1,3], [3,3]];
    const negative_checkerboard = [];

    let neighbours = [];
    checkerboard.forEach(function(delta) {
        neighbours.push({x: tile.x + delta[0], y: tile.y + delta[1]});
    });
    return neighbours;
}



function construction(room) {
    if(room.controller.level >= 2) {

        let spawns = room.find(FIND_MY_STRUCTURES, {filter: { structureType : STRUCTURE_SPAWN}});
        let existingStructures = room.find(FIND_STRUCTURES);


        let spawnNeighbours = getNeighbours(spawns[0].pos);
        // console.log(JSON.stringify(spawnNeighbours))


        if(existingStructures.length != 0) {
            _.forEach(spawnNeighbours, function(block) {
                const blockSpot = new RoomPosition(block.x, block.y, room.name);
                let lookForExistingConstructionSites = blockSpot.lookFor(LOOK_CONSTRUCTION_SITES);
                let lookForExistingStructures = blockSpot.lookFor(LOOK_STRUCTURES);
                let lookForTerrain = blockSpot.lookFor(LOOK_TERRAIN);
                if(lookForExistingStructures || lookForExistingConstructionSites) {
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



module.exports = construction;