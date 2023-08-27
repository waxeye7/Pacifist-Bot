const run = function (creep) {
  creep.memory.moving = false;

  if(!creep.memory.targetRoom) {
    let controller = creep.room.controller;
    if(controller && controller.safeModeAvailable <= 1) {
      let storage = creep.room.storage;
      if(storage) {
        if(creep.store.getUsedCapacity(RESOURCE_GHODIUM) < 1000 ) {
          if(storage.store[RESOURCE_GHODIUM] < 1000) {
            creep.recycle();
            return;
          }
          // withdraw from storage
          if(creep.pos.isNearTo(storage)) {
            creep.withdraw(storage, RESOURCE_GHODIUM);
          }
          else {
            creep.MoveCostMatrixRoadPrio(storage, 1);
          }
        }
        else if(creep.store.getFreeCapacity() === 0) {
          if(creep.pos.isNearTo(controller)) {
            creep.generateSafeMode(controller);
          }
          else {
            creep.MoveCostMatrixRoadPrio(controller, 1);
          }
        }
      }
      return;
    }

    creep.recycle();
  }
  else {

    if(creep.store.getUsedCapacity(RESOURCE_GHODIUM) < 1000 && creep.room.name !== creep.memory.targetRoom) {
      let storage = creep.room.storage;
      if(storage && storage.store[RESOURCE_GHODIUM] >= 1000) {
        if(creep.pos.isNearTo(storage)) {
          creep.withdraw(storage, RESOURCE_GHODIUM);
        }
        else {
          creep.MoveCostMatrixRoadPrio(storage, 1);
        }
      }
      else {
        creep.recycle();
      }
    }
    else if(creep.store.getUsedCapacity(RESOURCE_GHODIUM) < 1000 && creep.room.name === creep.memory.targetRoom) {
      creep.recycle();
    }
    else if(creep.store.getFreeCapacity() === 0) {
      if(creep.room.name !== creep.memory.targetRoom) {
        creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
        return;
      }

      let controller = creep.room.controller;
      if(controller) {
        if(creep.pos.isNearTo(controller)) {
          creep.generateSafeMode(controller);
        }
        else {
          creep.MoveCostMatrixRoadPrio(controller, 1);
        }
      }
    }
  }
}


const roleSafeModer = {
    run,
};
export default roleSafeModer;
