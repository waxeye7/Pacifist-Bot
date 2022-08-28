function roomDefence(room) {
    let towers = room.find(FIND_MY_STRUCTURES, { filter: {structureType: STRUCTURE_TOWER}});
    if(towers.length) {
        _.forEach(towers, function(tower) {

            let closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
            
            if(closestHostile) {
                tower.attack(closestHostile);
                return;
            }


            let closestDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: structure => structure.hits < structure.hitsMax && structure.hits < (structure.hitsMax-900) && structure.hits < 100000});

            if(closestDamagedStructure) {
                tower.repair(closestDamagedStructure)
            }

       })
    }
}

module.exports = roomDefence