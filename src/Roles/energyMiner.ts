/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    creep.Speak();
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
        if(creep.ticksToLive == 1499) {
            let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();
            creep.memory.targetLink = closestLink.id;
            creep.memory.closestLink = null;
        }


        if(creep.body.length <= 12 && creep.body[creep.body.length - 3].boost == undefined && creep.ticksToLive > 1465 && creep.room.memory.labs && creep.room.memory.labs.status.currentOutput == RESOURCE_UTRIUM_OXIDE) {

            let outputLabs = [];
            let outputLab1;
            let outputLab2;
            let outputLab3;
            let outputLab4;
            let outputLab5;
            let outputLab6;
            let outputLab7;
            let outputLab8;

            if(creep.room.memory.labs.outputLab1) {
                outputLab1 = Game.getObjectById(creep.room.memory.labs.outputLab1)
                outputLabs.push(outputLab1)
            }
            if(creep.room.memory.labs.outputLab2) {
                outputLab2 = Game.getObjectById(creep.room.memory.labs.outputLab2)
                outputLabs.push(outputLab2)
            }
            if(creep.room.memory.labs.outputLab3) {
                outputLab3 = Game.getObjectById(creep.room.memory.labs.outputLab3)
                outputLabs.push(outputLab3)
            }
            if(creep.room.memory.labs.outputLab4) {
                outputLab4 = Game.getObjectById(creep.room.memory.labs.outputLab4)
                outputLabs.push(outputLab4)
            }
            if(creep.room.memory.labs.outputLab5) {
                outputLab5 = Game.getObjectById(creep.room.memory.labs.outputLab5)
                outputLabs.push(outputLab5)
            }
            if(creep.room.memory.labs.outputLab6) {
                outputLab6 = Game.getObjectById(creep.room.memory.labs.outputLab6)
                outputLabs.push(outputLab6)
            }
            if(creep.room.memory.labs.outputLab7) {
                outputLab7 = Game.getObjectById(creep.room.memory.labs.outputLab7)
                outputLabs.push(outputLab7)
            }
            if(creep.room.memory.labs.outputLab8) {
                outputLab8 = Game.getObjectById(creep.room.memory.labs.outputLab8)
                outputLabs.push(outputLab8)
            }

            if(outputLabs.length > 1) {
                outputLabs.sort((a,b) => b.store[creep.room.memory.labs.status.currentOutput] - a.store[creep.room.memory.labs.status.currentOutput]);
            }

            if(outputLabs[0] && outputLabs[0].store[creep.room.memory.labs.status.currentOutput] >= 30) {
                if(creep.pos.isNearTo(outputLabs[0])) {
                    outputLabs[0].boostCreep(creep);
                }
                else {
                    creep.moveTo(outputLabs[0]);
                }
                return;
            }
        }


        if(creep.ticksToLive <= 3) {
            let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();
            if(creep.pos.isNearTo(closestLink)) {
                creep.transfer(closestLink, RESOURCE_ENERGY);
            }
            else {
                creep.moveTo(closestLink);
            }
        }


        if(creep.store.getFreeCapacity() <= 50) {
            let source = Game.getObjectById(creep.memory.sourceId);
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


            let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();
            if(closestLink && closestLink.store[RESOURCE_ENERGY] < 800) {
                if(creep.pos.isNearTo(closestLink)) {
                    creep.transfer(closestLink, RESOURCE_ENERGY);
                }
                else {
                    creep.moveTo(closestLink);
                }
            }
        }

        if(creep.store.getFreeCapacity() > 20) {
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
            let targetLink:any = Game.getObjectById(creep.memory.targetLink);
            if(targetLink == null || closestLink == null) {
                console.log("ALERT: stupid bug idk why. Link store is null.", creep.memory.targetRoom, creep.memory.homeRoom);
                return;
            }
            if(closestLink.store[RESOURCE_ENERGY] == 800 && targetLink.store[RESOURCE_ENERGY] == 0) {
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
