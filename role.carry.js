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
            let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

            if(targets.length > 0) {
                let target = creep.pos.findClosestByRange(targets);
                if(creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
            else if (targets.length == 0 && storage) {
                if(creep.transfer(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(storage, {visualizePathStyle: {stroke: '#ffffff'}});
                }
                else if (creep.transfer(storage, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
                    creep.moveTo(47,0);
                }
            }
        }
        else if(creep.room.name == "E12S38" && creep.store.getFreeCapacity() > 0) {
            // const Containers = creep.room.find(FIND_STRUCTURES, {
            //     filter: object => object.structureType == STRUCTURE_CONTAINER
            // });
            // let closestContainer = creep.pos.findClosestByRange(Containers);

            let dropped_resources = creep.room.find(FIND_DROPPED_RESOURCES);
            if(dropped_resources.length > 0 && creep.store.getFreeCapacity() > 0) {
                let closestDroppedEnergy = creep.pos.findClosestByRange(dropped_resources);
                if(creep.pickup(closestDroppedEnergy) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(closestDroppedEnergy, {visualizePathStyle: {stroke: '#ffaa00'}});
                }
                return;
            }
            else if (creep.store.getFreeCapacity() > 0) {
                creep.moveTo(6,15);
            }
            else {
                creep.moveTo(46,49);
            }
        }
        else if(creep.room.name == "E12S38" && creep.store.getFreeCapacity() == 0) {
            creep.moveTo(46,49);
        }
    }
};

module.exports = roleCarry;