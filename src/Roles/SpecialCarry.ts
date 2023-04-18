/**
 * A little description of this function
 * @param {Creep} creep
 **/

const run = function (creep) {
    creep.memory.moving = false;


    if(creep.evacuate()) {
      return;
    }

    if(creep.memory.suicide) {
		creep.recycle();
        return;
	}

    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(creep.memory.full && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.full = false;
    }


    if(creep.ticksToLive <= 22 && !creep.memory.full || creep.memory.full && creep.ticksToLive <= 12) {
		creep.memory.suicide = true;
	}


    let storage:any = Game.getObjectById(creep.room.memory.Structures.storage);



    if(!creep.memory.full) {
        if(storage) {

            if(creep.pos.isNearTo(storage)) {
                if(creep.withdraw(storage, RESOURCE_ENERGY) === 0)
                    creep.memory.full = true;
            }
            else {
                creep.moveToSafePositionToRepairRampart(storage, 1);
            }

        }
    }

        if (creep.memory.full) {
          if (!creep.memory.creep_target) {
            let SpecialRepairers = creep.room.find(FIND_MY_CREEPS, {
              filter: c => {
                return c.memory.role == "SpecialRepair";
              }
            });
            if (SpecialRepairers.length > 0) {
              SpecialRepairers.sort((a, b) => b.ticksToLive - a.ticksToLive);
              creep.memory.creep_target = SpecialRepairers[0].id;
            }
          }

          if (creep.memory.creep_target) {
            let target: any = Game.getObjectById(creep.memory.creep_target);
            if (!target) {
              creep.memory.creep_target = false;
              return;
            }

            if (!creep.pos.isNearTo(target)) {
              creep.moveToSafePositionToRepairRampart(target, 1);
            }

            // let container:any = Game.getObjectById(creep.memory.container_target);

            if (target && creep.pos.isNearTo(target) && target.store.getFreeCapacity() >= 175) {
              if (
                creep.transfer(target, RESOURCE_ENERGY) == 0 &&
                storage &&
                creep.store[RESOURCE_ENERGY] <= (creep.pos.getRangeTo(storage) + 2) * 35 * 2
              ) {
                creep.drop(RESOURCE_ENERGY, creep.store[RESOURCE_ENERGY] - target.store.getFreeCapacity());
              }
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
