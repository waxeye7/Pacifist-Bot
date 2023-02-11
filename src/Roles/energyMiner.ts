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
            let source:any = Game.getObjectById(creep.memory.source);
            if(!creep.memory.allGood) {
                let lookForStructures = creep.pos.lookFor(LOOK_STRUCTURES);
                if(lookForStructures.length > 0) {
                    for(let building of lookForStructures) {
                        if(building.structureType == STRUCTURE_CONTAINER) {
                            creep.memory.allGood = true;
                        }
                    }
                }
            }

            if(!creep.memory.allGood && containerNearby.length > 0 && !containerNearby[0].pos.isEqualTo(creep) && containerNearby[0].pos.lookFor(LOOK_CREEPS).length == 0 && source && creep.pos.getRangeTo(source) <= 2) {
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
            else if (result) {
                creep.memory.boosted = true;
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


        if(!creep.memory.boosted && creep.store.getFreeCapacity() <= (8 * 4) || creep.memory.boosted && creep.store.getFreeCapacity() <= (12 * 12) || creep.store.getFreeCapacity() <= 40) {
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
                    if(extension && extension.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                        creep.transfer(extension, RESOURCE_ENERGY);
                        return;
                    }
                }
            }

            if(creep.room.controller.level >= 7 && !creep.memory.myRampart && !creep.memory.checkedForRampartToRepair) {
                let myRamparts = creep.room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART});
                let rampartsInRangeOne = creep.pos.findInRange(myRamparts, 1);
                if(rampartsInRangeOne.length > 0) {
                    rampartsInRangeOne.sort((a,b) => a.amount - b.amount);
                }
                for(let building of rampartsInRangeOne) {
                    if(building.structureType == STRUCTURE_RAMPART && building.hits < 20050000) {
                        creep.memory.myRampart = building.id;
                    }
                }
                creep.memory.checkedForRampartToRepair = true;
            }


            if(creep.ticksToLive > 275 && creep.memory.myRampart && source && source.ticksToRegeneration * 10.5 > source.energy) {
                let storage:any = Game.getObjectById(creep.room.memory.Structures.storage);
                let rampart:any = Game.getObjectById(creep.memory.myRampart);
                if(storage && storage.store[RESOURCE_ENERGY] >= 300000) {

                    if(rampart && rampart.hits < 20050000) {
                        creep.repair(rampart);
                        return;
                    }
                    else {
                        creep.memory.myRampart = false;
                    }
                }
                else if(storage && storage.store[RESOURCE_ENERGY] > 50000 && rampart && rampart.hits < 5050000) {
                    creep.repair(rampart);
                    return;
                }
                else if(storage && storage.store[RESOURCE_ENERGY] > 90000 && rampart && rampart.hits < 15050000) {
                    creep.repair(rampart);
                    return;
                }
            }


            if(!creep.memory.checkedForSites) {
                let siteIDs = []
                let constructionSitesNearCreep = creep.pos.findInRange(creep.room.find(FIND_MY_CONSTRUCTION_SITES), 1);
                if(constructionSitesNearCreep.length > 0) {
                    for(let site of constructionSitesNearCreep) {
                        siteIDs.push(site.id);
                    }
                }
                if(siteIDs.length > 0) {
                    creep.memory.constructionSites = siteIDs;
                }
                creep.memory.checkedForSites = true;
            }
            if(creep.memory.constructionSites && creep.memory.constructionSites.length > 0) {
                let site:any = Game.getObjectById(creep.memory.constructionSites[creep.memory.constructionSites.length - 1]);
                if(site) {
                    creep.build(site);
                }
                else {
                    creep.memory.constructionSites.pop()
                }
            }


            let closestLink = Game.getObjectById(creep.memory.sourceLink) || source.pos.findClosestByRange(creep.room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_LINK && creep.pos.getRangeTo(s) < 5}));
            if(closestLink && closestLink.store[RESOURCE_ENERGY] < 800) {
                if(creep.pos.isNearTo(closestLink)) {
                    creep.transfer(closestLink, RESOURCE_ENERGY);
                }
                else {
                    creep.MoveCostMatrixRoadPrio(closestLink, 1);
                }
            }
        }

        if(!creep.memory.boosted && creep.store.getFreeCapacity() >= (8 * 4) || creep.memory.boosted && creep.store.getFreeCapacity() >= (12 * 12)) {
            let result = creep.harvestEnergy();
        }



        if(creep.store[RESOURCE_ENERGY] > 0 && creep.memory.homeRoom == creep.memory.targetRoom) {

            let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();

            if(closestLink && closestLink.pos.isNearTo(creep) && !creep.memory.checkedForRampart) {
                let lookForBuildingsHere = closestLink.pos.lookFor(LOOK_STRUCTURES);
                let found = false;
                for(let building of lookForBuildingsHere) {
                    if(building.structureType == STRUCTURE_RAMPART) {
                        found = true;
                    }
                }
                let storage:any = Game.getObjectById(creep.room.memory.Structures.storage);
                if(!found && storage && closestLink.pos.getRangeTo(storage) > 7) {
                    closestLink.pos.createConstructionSite(STRUCTURE_RAMPART);
                }
                creep.memory.checkedForRampart = true;
            }

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
