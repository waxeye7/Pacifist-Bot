const run = function (creep) {
  creep.memory.moving = false;

  if(!creep.memory.targetRoom) {
    let controller = creep.room.controller;
    if(controller && controller.safeModeAvailable <= 1) {
      // generateSafeMode needs 1000 ghodium — gate on that, not on a full
      // store: a wider-capacity creep used to qualify with <1000 carried,
      // and a loaded creep used to idle when the room's storage was gone.
      if(creep.store.getUsedCapacity(RESOURCE_GHODIUM) >= 1000) {
        if(creep.pos.isNearTo(controller)) {
          creep.generateSafeMode(controller);
        }
        else {
          creep.MoveCostMatrixRoadPrio(controller, 1);
        }
        return;
      }
      let storage = creep.room.storage;
      // A FULL store that is short of ghodium can never top up — withdraw
      // returned ERR_FULL every tick and the creep parked at storage
      // forever. Full-of-the-wrong-stuff, empty storage and no storage all
      // recycle instead.
      if(storage && creep.store.getFreeCapacity() !== 0 && storage.store[RESOURCE_GHODIUM] >= 1000) {
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
      return;
    }

    creep.recycle();
  }
  else {

    if(creep.store.getUsedCapacity(RESOURCE_GHODIUM) < 1000 && creep.room.name !== creep.memory.targetRoom) {
      let storage = creep.room.storage;
      // Full of foreign cargo: withdraw would return ERR_FULL every tick and
      // the creep parked at this storage forever instead of making way.
      if(creep.store.getFreeCapacity() === 0) {
        creep.recycle();
      }
      else if(storage && storage.store[RESOURCE_GHODIUM] >= 1000) {
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
    else if(creep.store.getUsedCapacity(RESOURCE_GHODIUM) >= 1000) {
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
