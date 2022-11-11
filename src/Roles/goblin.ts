/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.Speak();

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
    }
    if(creep.memory.full && creep.store.getFreeCapacity() > MaxStorage) {
        creep.memory.full = false;
    }

    if(creep.memory.full) {
        if(creep.room.name != creep.memory.homeRoom) {
            return creep.moveToRoom(creep.memory.homeRoom);
        }

        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        if(storage && creep.store.getFreeCapacity() < MaxStorage) {
            if(creep.pos.isNearTo(storage)) {
                for(let resourceType in creep.store) {
                    creep.transfer(storage, resourceType);
                }
            }
            else {
                creep.moveTo(storage, {reusePath: 15, visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    }
    if(!creep.memory.full) {
        if(creep.room.name != creep.memory.targetRoom) {
            return creep.moveToRoom(creep.memory.targetRoom);
        }



        let target = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_EXTENSION || building.structureType == STRUCTURE_CONTAINER || building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_STORAGE || building.structureType == STRUCTURE_TERMINAL || building.structureType == STRUCTURE_TOWER || building.structureType == STRUCTURE_LAB || building.structureType == STRUCTURE_LINK) && _.keys(building.store).length > 0});
        if(target) {
            if(creep.pos.isNearTo(target)) {
                for(let resource in target.store) {
                    creep.withdraw(target, resource)
                }
            }
            else {
                creep.moveTo(target);
            }
            return;
        }
        let droppedTarget = creep.room.find(FIND_DROPPED_RESOURCES);

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

    }
}


const roleGoblin = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleGoblin;
