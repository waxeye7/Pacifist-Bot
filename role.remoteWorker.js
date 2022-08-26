var roleRemoteWorker = {

    /** @param {Creep} creep **/
    run: function(creep) {
        if(creep.room.name == "E12S39") {
            creep.moveTo(46,0);
        }
        else if(creep.room.name == "E12S38") {
            // let containers = creep.room.find(FIND_STRUCTURES, {
            //     filter: object => object.structureType != STRUCTURE_CONTAINER
            // });

            let source = Game.getObjectById(creep.memory.source) || creep.findSource();
            if(creep.pos.inRangeTo(source, 1)) {
                if(source.energy != 0) {
                creep.harvest(source);    
                }
            }
            else if(creep.pos != 6, 14) {
                creep.moveTo(6, 14);
            }
        }
	}
};

module.exports = roleRemoteWorker;




        //     if ((creep.store.getFreeCapacity() > 0 && creep.pos.inRangeTo(sources[0], 1)) || creep.store.getFreeCapacity() > 0) {
        //         if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
        //             creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});
        //         }
        //     }
        //     else {
        //         creep.moveTo(46,49, {visualizePathStyle: {stroke: '#000000', lineStyle: "undefined"}});
        //     }
        // }
        // else if (creep.room.name == "E12S39" && creep.store[RESOURCE_ENERGY] == 0) {
        //     creep.moveTo(46,0, {visualizePathStyle: {stroke: '#ffffff', lineStyle: "undefined"}});
        // }

        // else if (creep.room.name == "E12S39" && creep.store[RESOURCE_ENERGY] > 0) {
        //     var targets = creep.room.find(FIND_STRUCTURES, {
        //         filter: (structure) => {
        //             return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN || structure.structureType == STRUCTURE_TOWER  || structure.structureType == STRUCTURE_CONTAINER) &&
        //                 structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
        //         }
        //     });
        //     var storage = creep.room.find(FIND_STRUCTURES, {
        //         filter: (structure) => {
        //             return (structure.structureType == STRUCTURE_STORAGE) &&
        //                 structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
        //         }
        //     });
        //     if(targets.length > 0) {
        //         let target = creep.pos.findClosestByRange(targets);
        //         if(creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        //             creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
        //         }
        //         else if (creep.transfer(target, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
        //             if (sources[1].energy != 0) {
        //                 creep.moveTo(sources[1], {visualizePathStyle: {stroke: '#ffaa00'}});
        //             }
        //             else {
        //                 creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}}); 
        //             }
        //         }
        //     }

        //     else if (targets.length == 0 && storage.length > 0) {
        //         let target = creep.pos.findClosestByRange(storage);
        //         if(creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        //             creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}});
        //         }
        //         else if (creep.transfer(target, RESOURCE_ENERGY) == 0 && creep.store[RESOURCE_ENERGY] == 0) {
        //             if (sources[1].energy != 0) {
        //                 creep.moveTo(sources[1], {visualizePathStyle: {stroke: '#ffaa00'}});
        //             }
        //             else {
        //                 creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}}); 
        //             }
        //         }
        //     }

        //     else if (targets.length == 0 && creep.store.getFreeCapacity() <= carryParts - 1) {
        //         const buildingsToRepair = creep.room.find(FIND_STRUCTURES, {
        //             filter: object => object.hits < object.hitsMax && object.structureType != STRUCTURE_WALL
        //         });
        //         if(buildingsToRepair.length > 0) {
        //             let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair);
        //             if(creep.repair(closestBuildingToRepair) == ERR_NOT_IN_RANGE) {
        //                 creep.moveTo(closestBuildingToRepair);
        //             }
        //         }
        //     }
        // }