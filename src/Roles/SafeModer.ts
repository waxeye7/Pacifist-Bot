const run = function (creep) {
  creep.memory.moving = false;

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
      else if(creep.store.getUsedCapacity(RESOURCE_GHODIUM) >= 1000) {
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


const roleSafeModer = {
    run,
};
export default roleSafeModer;
