/**
 * A little description of this function
 * @param {Creep} creep
 **/

const run = function (creep) {
    creep.memory.moving = false;

    if(creep.memory.suicide == true) {
		creep.recycle();
        return;
	}

    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(creep.memory.full && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.full = false;
    }


    if(creep.ticksToLive <= 20 && !creep.memory.full) {
		creep.memory.suicide = true;
	}


    let storage:any = Game.getObjectById(creep.room.memory.Structures.storage);

    if(creep.memory.full) {


        if(!creep.memory.creep_target) {
            let SpecialRepairers = creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == "SpecialRepair");}});
            if(SpecialRepairers.length > 0) {
                SpecialRepairers.sort((a,b) => b.ticksToLive - a.ticksToLive);
                creep.memory.creep_target = SpecialRepairers[0].id;
            }
        }

        if(creep.memory.creep_target) {
            let target:any = Game.getObjectById(creep.memory.creep_target);
            if(!target) {
                creep.memory.creep_target = false;
                return;
            }


            if(!creep.pos.isNearTo(target)) {
                creep.moveToSafePositionToRepairRampart(target, 1)
            }


            if(!creep.memory.container_target) {
                if(storage && target.pos.getRangeTo(storage) > 4) {
                    let structuresHere = target.pos.lookFor(LOOK_STRUCTURES)
                    if(structuresHere.length > 0) {
                        for(let structure of structuresHere) {
                            if(structure.structureType == STRUCTURE_CONTAINER) {
                                creep.memory.container_target = structure.id;
                            }
                        }
                    }
                }
            }

            let container:any = Game.getObjectById(creep.memory.container_target);

            if(target && container && creep.pos.isNearTo(container) && container.store.getFreeCapacity() !== 0) {

                if(creep.transfer(container, RESOURCE_ENERGY) == 0) {
                    // creep.memory.full = false;
                }
            }
            else if(target && creep.pos.isNearTo(target) && target.store.getFreeCapacity() >= 50) {
                creep.transfer(target, RESOURCE_ENERGY);
            }
        }

    }

    if(!creep.memory.full) {
        if(storage) {

            if(creep.pos.isNearTo(storage)) {
                creep.withdraw(storage, RESOURCE_ENERGY);
            }
            else {
                creep.moveToSafePositionToRepairRampart(storage, 1);
            }

        }
    }
}

const roleSpecialCarry = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleSpecialCarry;
