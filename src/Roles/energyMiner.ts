/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    creep.memory.moving = false;

    if(creep.fleeHomeIfInDanger() == "timeOut") {
        return;
    }
    // if(creep.fleeHomeIfInDanger() == true) {
    //     return;
    // }

    // if(creep.pos.x > 0 && creep.pos.y > 0 && creep.pos.y < 49 && creep.pos.x < 49) {
    //     return;
    // }
    // else {
    //     creep.moveTo(25,25)
    // }

    if(creep.room.controller && creep.room.controller.level < 6 || creep.memory.targetRoom != creep.memory.homeRoom || creep.room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_LINK}).length < 3) {
        // if(creep.roadCheck()) {
        //     creep.moveAwayIfNeedTo();
        // }
        let result = creep.harvestEnergy();
        if(result == 0) {
            creep.memory.harvested = true;
        }
        if(creep.memory.harvested) {
            let containerNearby = creep.room.find(FIND_STRUCTURES, {filter: building => building.structureType == STRUCTURE_CONTAINER && creep.pos.getRangeTo(building) <= 2});
            if(containerNearby.length > 0 && !containerNearby[0].pos.isEqualTo(creep) && containerNearby[0].pos.lookFor(LOOK_CREEPS).length == 0) {
                creep.MoveCostMatrixRoadPrio(containerNearby[0], 0)
            }
        }

        // if(result == 0) {
        //     let containerNearby = creep.room.find(FIND_STRUCTURES, {filter: building => building.structureType == STRUCTURE_CONTAINER && creep.pos.getRangeTo(building) <= 1 });
        //     if(containerNearby.length > 0 && !creep.pos.isEqualTo(containerNearby[0])) {
        //         creep.MoveCostMatrixRoadPrio(containerNearby[0], 0);
        //     }
        // }

        // if(creep.roadCheck()) {
        //     creep.moveAwayIfNeedTo();
        // }
        // could add if not on container, move to container nearby but cbf rn

    }
    else {
        if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
            let result = creep.Boost();
            if(!result) {
                return;
            }
        }



        if(creep.ticksToLive <= 2) {
            let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();
            if(creep.pos.isNearTo(closestLink)) {
                creep.transfer(closestLink, RESOURCE_ENERGY);
            }
            else {
                creep.MoveCostMatrixRoadPrio(closestLink, 1);
            }
        }


        if(!creep.memory.boostlabs && creep.store.getFreeCapacity() <= creep.getActiveBodyparts(WORK) * 4 || creep.memory.boostlabs && creep.store.getFreeCapacity() <= creep.getActiveBodyparts(WORK) * 12) {
            let source:any = Game.getObjectById(creep.memory.sourceId);
            if(creep.pos.isNearTo(source)) {
                if(!creep.memory.NearbyExtensions) {
                    creep.memory.NearbyExtensions = [];
                    let mystructures = creep.room.find(FIND_MY_STRUCTURES);
                    let buildings = creep.pos.findInRange(mystructures, 1)
                    for(let building of buildings) {
                        if(building.structureType == STRUCTURE_EXTENSION) {
                            creep.memory.NearbyExtensions.push(building.id);
                        }
                    }
                }
            }

            if(creep.memory.NearbyExtensions && creep.memory.NearbyExtensions.length > 0) {
                for(let extensionID of creep.memory.NearbyExtensions) {
                    let extension:any = Game.getObjectById(extensionID);
                    if(extension.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                        creep.transfer(extension, RESOURCE_ENERGY);
                        return;
                    }
                }
            }

            if(creep.room.controller.level >= 7 && !creep.memory.myRampart && creep.ticksToLive > 1300 && Game.time % 10 == 0) {
                let lookStructs = creep.pos.lookFor(LOOK_STRUCTURES);
                for(let building of lookStructs) {
                    if(building.structureType == STRUCTURE_RAMPART && building.hits < 11000000) {
                        creep.memory.myRampart = building.id;
                    }
                }
            }


            if(creep.ticksToLive > 275 && creep.memory.myRampart && source && source.ticksToRegeneration * 10.5 > source.energy) {
                let storage:any = Game.getObjectById(creep.room.memory.Structures.storage);
                if(storage && storage.store[RESOURCE_ENERGY] >= 300000) {
                    let rampart:any = Game.getObjectById(creep.memory.myRampart);
                    if(rampart && rampart.hits < 11000000) {
                        creep.repair(rampart);
                        return;
                    }
                    else {
                        creep.memory.myRampart = false;
                    }
                }
            }

            let closestLink = Game.getObjectById(creep.memory.sourceLink) || source.pos.findClosestByRange(creep.room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_LINK}));
            if(closestLink && closestLink.store[RESOURCE_ENERGY] < 800) {
                if(creep.pos.isNearTo(closestLink)) {
                    creep.transfer(closestLink, RESOURCE_ENERGY);
                }
                else {
                    creep.MoveCostMatrixRoadPrio(closestLink, 1);
                }
            }
        }

        if(!creep.memory.boostlabs && creep.store.getFreeCapacity() >= creep.getActiveBodyparts(WORK) * 2 || creep.memory.boostlabs && creep.store.getFreeCapacity() >= creep.getActiveBodyparts(WORK) * 6) {
            let result = creep.harvestEnergy();
        }

        // if(result == 0) {
        // if(creep.roadCheck()) {
        //     creep.moveAwayIfNeedTo();
        // }
        // }
        // if(creep.harvestEnergy() == -1) {
        //     let containers = creep

        // }



        if(creep.store[RESOURCE_ENERGY] > 0 && creep.memory.homeRoom == creep.memory.targetRoom) {
            let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();
            let targetLink:any = Game.getObjectById(creep.room.memory.Structures.StorageLink) || creep.room.findStorageLink();
            let closestLinkToController;
            if(creep.room.controller && creep.room.controller.level >= 7 && !creep.memory.controllerLink) {
                creep.memory.controllerLink = creep.room.controller.pos.findClosestByRange(creep.room.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_LINK);}})).id;
            }
            if(targetLink == null || closestLink == null) {
                console.log("ALERT: stupid bug idk why. Link store is null.", creep.memory.targetRoom);
                return;
            }

            if(creep.memory.controllerLink) {
                closestLinkToController = Game.getObjectById(creep.memory.controllerLink);
            }
            if(closestLink && closestLink.store[RESOURCE_ENERGY] >= 400 && closestLinkToController && closestLinkToController.store[RESOURCE_ENERGY] <= 400) {
                closestLink.transferEnergy(closestLinkToController);
            }

            else if(closestLink && closestLink.store[RESOURCE_ENERGY] == 800 && targetLink && targetLink.store[RESOURCE_ENERGY] == 0) {
                closestLink.transferEnergy(targetLink);
            }
        }
    }
}
const roleEnergyMiner = {
    run,

    //function2,
    //function3
};

export default roleEnergyMiner;
