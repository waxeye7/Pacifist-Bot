/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    creep.Speak();
    creep.memory.moving = false;

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
        if(creep.roadCheck()) {
            creep.moveAwayIfNeedTo();
        }
        let result = creep.harvestEnergy();
        if(result == 0) {
            let containerNearby = creep.room.find(FIND_STRUCTURES, {filter: building => building.structureType == STRUCTURE_CONTAINER && creep.pos.getRangeTo(building) <= 1 });
            if(containerNearby.length && containerNearby[0].pos != creep.pos) {
                creep.moveTo(containerNearby[0])
            }
        }

        // if(creep.roadCheck()) {
        //     creep.moveAwayIfNeedTo();
        // }
        // could add if not on container, move to container nearby but cbf rn
        return;
    }
    else {
        // if(creep.memory.boostlabs) {
        //     let result = creep.Boost();
        //     if(result) {
        //         creep.room.memory.labs.status.boost.lab1 = [creep.room.memory.labs.status.boost.lab1[0],false];
        //     }
        //     if(!result) {
        //         creep.room.memory.labs.status.boost.lab1 = [creep.room.memory.labs.status.boost.lab1[0],true];
        //         return;
        //     }
        // }



        if(creep.ticksToLive <= 2) {
            let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();
            if(creep.pos.isNearTo(closestLink)) {
                creep.transfer(closestLink, RESOURCE_ENERGY);
            }
            else {
                creep.moveTo(closestLink);
            }
        }


        if(!creep.memory.boostlabs && creep.store.getFreeCapacity() <= creep.getActiveBodyparts(WORK) * 2 || creep.memory.boostlabs && creep.store.getFreeCapacity() <= creep.getActiveBodyparts(WORK) * 6) {
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


            let closestLink = Game.getObjectById(creep.memory.sourceLink) || source.pos.findClosestByRange(creep.room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_LINK}));
            if(closestLink && closestLink.store[RESOURCE_ENERGY] < 800) {
                if(creep.pos.isNearTo(closestLink)) {
                    creep.transfer(closestLink, RESOURCE_ENERGY);
                }
                else {
                    creep.moveTo(closestLink);
                }
            }
        }

        if(!creep.memory.boostlabs && creep.store.getFreeCapacity() >= creep.getActiveBodyparts(WORK) * 2 || creep.memory.boostlabs && creep.store.getFreeCapacity() >= creep.getActiveBodyparts(WORK) * 6) {
            let result = creep.harvestEnergy();
        }

        // if(result == 0) {
        if(creep.roadCheck()) {
            creep.moveAwayIfNeedTo();
        }
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
