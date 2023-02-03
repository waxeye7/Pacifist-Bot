/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    ;
    creep.memory.moving = false;

    if(creep.memory.suicide) {
        creep.recycle();
        return;
    }

    if((creep.memory.full && creep.store.getFreeCapacity() !== 0 || creep.ticksToLive <= 250) && (creep.room.name == creep.memory.homeRoom || creep.room.name == creep.memory.dropRoom)) {
        creep.memory.suicide = true;
    }



    if(creep.memory.homeRoom && !creep.memory.dropRoom) {
        creep.memory.dropRoom = creep.memory.homeRoom;
    }

    if(!creep.memory.MaxStorage) {
        let carryPartsAmount = 0
        for(let part of creep.body) {
            if(part.type == CARRY) {
                carryPartsAmount += 1;
            }
        }
        creep.memory.MaxStorage = carryPartsAmount * 50;
    }
    let MaxStorage = creep.memory.MaxStorage;


    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
        creep.memory.storage = false;

        if(creep.memory.dropRoom == creep.memory.homeRoom) {
            let closestRoom = [creep.memory.dropRoom, Game.map.getRoomLinearDistance(creep.room.name, creep.memory.dropRoom)];

            _.forEach(Game.rooms, function(AllRooms) {
                if (AllRooms && AllRooms.controller && AllRooms.controller.my && AllRooms.controller.level >= 4) {
                    if(Game.map.getRoomLinearDistance(creep.room.name, AllRooms.name) < closestRoom[1]) {
                        creep.memory.dropRoom = AllRooms.name
                        closestRoom = [creep.memory.dropRoom, Game.map.getRoomLinearDistance(creep.room.name, creep.memory.dropRoom)]
                    }
                }
            });

        }

    }
    if(creep.memory.full && creep.store.getFreeCapacity() >= MaxStorage) {
        creep.memory.full = false;
    }

    if(creep.memory.full) {
        if(creep.room.name != creep.memory.dropRoom) {
            return creep.moveToRoomAvoidEnemyRooms(creep.memory.dropRoom);
        }

        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        if(storage && creep.store.getFreeCapacity() < MaxStorage) {
            if(creep.pos.isNearTo(storage)) {
                for(let resourceType in creep.store) {
                    creep.transfer(storage, resourceType);
                }
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
        }
    }
    if(!creep.memory.full) {
        if(creep.room.name != creep.memory.targetRoom) {
            return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
        }


        let ruins = creep.room.find(FIND_RUINS);
        if(ruins.length > 0) {
            let refinedRuins = ruins.filter(ruin => _.keys(ruin.store).length > 0);
            let refinedRuinsList = [];

            for(let ruin of refinedRuins) {
                if(_.keys(ruin.store).length == 1 && _.keys(ruin.store)[0] == RESOURCE_ENERGY)  {
                    // do nothing
                }
                else {
                    refinedRuinsList.push(ruin);
                }
            }


            for(let ruin of refinedRuinsList) {
                for(let resource in ruin.store) {
                    if(resource !== RESOURCE_ENERGY) {
                        if(creep.pos.isNearTo(ruin)) {
                            creep.withdraw(ruin, resource)
                        }
                        else {
                            creep.MoveCostMatrixRoadPrio(ruin, 1);
                        }
                        return;
                    }
                }
            }

        }



        let droppedTarget = creep.room.find(FIND_DROPPED_RESOURCES);

        droppedTarget = droppedTarget.filter(function(resource) {return resource.resourceType !== RESOURCE_ENERGY;});
        if(droppedTarget.length > 0) {
            droppedTarget.sort((a,b) => b.amount - a.amount);
            if(creep.pos.isNearTo(droppedTarget[0])) {
                creep.pickup(droppedTarget[0]);
            }
            else {
                creep.MoveCostMatrixRoadPrio(droppedTarget[0], 1)
            }

            return;
        }


        let targets:any = creep.room.find(FIND_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_CONTAINER || building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_STORAGE || building.structureType == STRUCTURE_TERMINAL || building.structureType == STRUCTURE_TOWER || building.structureType == STRUCTURE_LAB || building.structureType == STRUCTURE_FACTORY || building.structureType == STRUCTURE_POWER_SPAWN) && _.keys(building.store).length > 0});
        let targetsList = [];
        let specialTargets;
        let specialTargetsList = [];

        if(targets.length > 0) {
            targets = targets.filter(target => _.keys(target.store).length > 0);
            for(let target of targets) {
                if(_.keys(target.store).length == 1 && _.keys(target.store)[0] == RESOURCE_ENERGY)  {
                    // do nothing
                }
                else {
                    targetsList.push(target);
                }
            }
            specialTargets = targets.filter(function(building) {return building.structureType == STRUCTURE_LAB || building.structureType == STRUCTURE_FACTORY || building.structureType == STRUCTURE_TERMINAL || building.structureType == STRUCTURE_POWER_BANK;});
            for(let target of specialTargets) {
                if(_.keys(target.store).length == 1 && _.keys(target.store)[0] == RESOURCE_ENERGY)  {
                    // do nothing
                }
                else {
                    specialTargetsList.push(target);
                }
            }
        }
        let specialTarget;
        let target;
        if(specialTargetsList.length > 0) {
            specialTarget = creep.pos.findClosestByRange(specialTargetsList);
        }
        if(targetsList.length > 0) {
            creep.pos.findClosestByRange(targetsList);
        }

        if(specialTarget) {
            if(creep.pos.isNearTo(specialTarget)) {
                for(let resource in specialTarget.store) {
                    if(resource !== RESOURCE_ENERGY) {
                        creep.withdraw(specialTarget, resource)
                    }
                }
            }
            else {
                creep.MoveCostMatrixRoadPrio(specialTarget, 1);
            }
        }

        else if(target) {
            if(creep.pos.isNearTo(target)) {
                for(let resource in target.store) {
                    if(resource !== RESOURCE_ENERGY) {
                        creep.withdraw(target, resource)
                    }
                }
            }
            else {
                creep.MoveCostMatrixRoadPrio(target, 1);
            }
        }
        else {
            creep.memory.full = true;
        }

        if(targets && targets.length == 0 && !creep.memory.full) {
            creep.memory.suicide = true;
        }
        else if(!targets && !creep.memory.full) {
            creep.memory.suicide = true;
        }
    }
}


const roleGoblin = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleGoblin;
