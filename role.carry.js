var roleCarry = {
    
    /** @param {Creep} creep **/
    run: function(creep) {
        if(creep.room.name == "E12S39" && creep.store[RESOURCE_ENERGY] == 0) {
            creep.moveTo(47,0);
        }
        else if(creep.room.name == "E12S39" && creep.store[RESOURCE_ENERGY] > 0) {
            var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN || structure.structureType == STRUCTURE_TOWER  || structure.structureType == STRUCTURE_CONTAINER) &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                }
            });
            var storage = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_STORAGE) &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                }
            });
            if(targets.length > 0) {
                let target = creep.pos.findClosestByRange(targets);
                if(creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
                }
                else if (creep.transfer(target, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                    if (sources[1].energy != 0) {
                        creep.moveTo(sources[1], {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                    else {
                        creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}}); 
                    }
                }
            }
            else if (targets.length == 0 && storage.length > 0) {
                let target = creep.pos.findClosestByRange(storage);
                if(creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
                }
                else if (creep.transfer(target, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                    if (sources[1].energy != 0) {
                        creep.moveTo(sources[1], {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                    else {
                        creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}}); 
                    }
                }
            }
        }
        else if(creep.room.name == "E12S38" && creep.store.getFreeCapacity() > 0) {
            const Containers = creep.room.find(FIND_STRUCTURES, {
                filter: object => object.structureType == STRUCTURE_CONTAINER
            });

            let closestContainer = creep.pos.findClosestByRange(Containers);

            let dropped_resources = creep.room.find(FIND_DROPPED_RESOURCES);
            if(dropped_resources.length > 0) {
                if(creep.store.getFreeCapacity() > 0 && !creep.pos.inRangeTo(closestContainer, 1)) {
                    let closestDroppedEnergy = creep.pos.findClosestByRange(dropped_resources);
                    if(creep.pickup(closestDroppedEnergy) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(closestDroppedEnergy, {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                    return;
                }
            }


            if(creep.withdraw(closestContainer, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                creep.moveTo(closestContainer);
            }
            else {
                creep.moveTo(46,49)
            }
        }
        else if(creep.room.name == "E12S38" && creep.store.getFreeCapacity() == 0) {
            creep.moveTo(46,49);
        }
    }
};

module.exports = roleCarry;