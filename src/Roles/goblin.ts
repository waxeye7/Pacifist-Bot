import { drop } from "lodash";
import roomDefence from "Rooms/rooms.defence";

/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.Speak();

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
            return creep.moveToRoom(creep.memory.dropRoom);
        }

        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        if(storage && creep.store.getFreeCapacity() < MaxStorage) {
            if(creep.pos.isNearTo(storage)) {
                for(let resourceType in creep.store) {
                    creep.transfer(storage, resourceType);
                }
            }
            else {
                creep.moveTo(storage, {reusePath: 15, ignoreCreeps:true , visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    }
    if(!creep.memory.full) {
        if(creep.room.name != creep.memory.targetRoom) {
            return creep.moveToRoom(creep.memory.targetRoom);
        }


        let droppedTarget = creep.room.find(FIND_DROPPED_RESOURCES);

        droppedTarget = droppedTarget.filter(function(resource) {return resource.pos.getRangeTo(creep.pos) < 4 && resource.amount > 250;});
        if(droppedTarget.length > 0) {
            droppedTarget.sort((a,b) => b.amount - a.amount);
            if(creep.pos.isNearTo(droppedTarget[0])) {
                creep.pickup(droppedTarget[0]);
            }
            else {
                creep.moveTo(droppedTarget[0], {reusePath:5, ignoreRoads:true, swampCost:1});
            }

            return;
        }


        let targets:any = creep.room.find(FIND_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_CONTAINER || building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_STORAGE || building.structureType == STRUCTURE_TERMINAL || building.structureType == STRUCTURE_TOWER || building.structureType == STRUCTURE_LAB || building.structureType == STRUCTURE_FACTORY || building.structureType == STRUCTURE_POWER_SPAWN) && _.keys(building.store).length > 0});
        let specialTargets;

        if(targets.length > 0) {
            targets = targets.filter(target => _.keys(target.store).length > 0);
            specialTargets = targets.filter(function(building) {return building.structureType == STRUCTURE_LAB || building.structureType == STRUCTURE_FACTORY || building.structureType == STRUCTURE_TERMINAL;});
        }

        let specialTarget = creep.pos.findClosestByRange(specialTargets);
        let target = creep.pos.findClosestByRange(targets);

        if(specialTarget) {
            if(creep.pos.isNearTo(specialTarget)) {
                for(let resource in specialTarget.store) {
                    creep.withdraw(specialTarget, resource)
                }
            }
            else {
                creep.moveTo(specialTarget);
            }
        }

        else if(target) {
            if(creep.pos.isNearTo(target)) {
                for(let resource in target.store) {
                    creep.withdraw(target, resource)
                }
            }
            else {
                creep.moveTo(target);
            }
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
