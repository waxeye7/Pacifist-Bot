var roleBuildContainer = {
    
    /** @param {Creep} creep **/
    run: function(creep) {
        if(creep.room.name == "E12S39") {
            creep.moveTo(47,0);
        }
        else if(creep.room.name == "E12S38") {
            let container = Game.getObjectById('63000967cd87f84374a2a9cb');
            let targets = creep.room.find(FIND_CONSTRUCTION_SITES);
            let closestTarget = creep.pos.findClosestByRange(targets);


            if(creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
                creep.memory.building = false;
                creep.say('🔄 harvest');
                creep.moveTo(container, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
            if(!creep.memory.building && creep.store.getFreeCapacity() == 0) {
                creep.memory.building = true;
                creep.say('🚧 build');
                creep.moveTo(closestTarget);
            }
            if(creep.memory.building) {
                if(targets.length > 0) {
                    if(creep.build(closestTarget) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(closestTarget, {visualizePathStyle: {stroke: '#000'}});
                    }
                }
                else {
                    const buildingsToRepair = creep.room.find(FIND_STRUCTURES, {
                        filter: object => object.hits < object.hitsMax && object.structureType != STRUCTURE_WALL
                    });
                    
                    buildingsToRepair.sort((a,b) => a.hits - b.hits);
                    if(buildingsToRepair.length > 0) {
                        let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair);
                        if(creep.repair(closestBuildingToRepair) == ERR_NOT_IN_RANGE) {
                            creep.moveTo(closestBuildingToRepair);
                        }
                    }
                }
            }
            else {
                if(creep.withdraw(container, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(container, {visualizePathStyle: {stroke: '#ffaa00'}});
                }
            }
        }
    }
};

module.exports = roleBuildContainer;