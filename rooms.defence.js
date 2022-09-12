function roomDefence(room) {
    // cache the towers.
    let towers = room.find(FIND_MY_STRUCTURES, { filter: {structureType: STRUCTURE_TOWER}});
    if(towers.length) {
        _.forEach(towers, function(tower) {
            let damagedCreeps = _.filter(Game.creeps, (damagedCreep) => damagedCreep.hits < damagedCreep.hitsMax && damagedCreep.room.name == room.name);
            if(damagedCreeps.length > 0) {
                tower.heal(damagedCreeps[0]);
                return;
            }


            let closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
            if(closestHostile) {
                tower.attack(closestHostile);
                return;
            }


            if(Game.time % 5 == 1) {
                let closestDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
                    filter: structure => structure.hits < structure.hitsMax && structure.hits < (structure.hitsMax-2000) && structure.hits < 150000});
    
                if(closestDamagedStructure) {
                    tower.repair(closestDamagedStructure)
                    return;
                }
            }
       });
    }

    if(Game.time % 16 == 1) {
        let HostileCreeps = room.find(FIND_HOSTILE_CREEPS);
        if(HostileCreeps.length > 0) {
            room.memory.danger = true;
            let MyRamparts = room.find(FIND_MY_STRUCTURES, {filter: structure => structure.structureType == STRUCTURE_RAMPART});
    
            let currentLowestRange = 100;
            let currentRampart;
    
            _.forEach(MyRamparts, function(rampart) {
                let closestHostileToRampart = rampart.pos.findClosestByRange(HostileCreeps);
                let rangeToEnemy = rampart.pos.getRangeTo(closestHostileToRampart)
                if(currentLowestRange > rangeToEnemy) {
                    currentLowestRange = rangeToEnemy;
                    currentRampart = rampart;
                    room.memory.rampartToMan = currentRampart.id;        
                }
            });
    
        }
        else {
            room.memory.danger = false;
            room.memory.rampartToMan = false
        }
    }
}

module.exports = roomDefence