const run = function (creep):CreepMoveReturnCode | -2 | -5 | -7 | void {

  creep.memory.moving = false;

  if(creep.store.getUsedCapacity() === 0 && creep.memory.full) {
    creep.memory.full = false;
  }
  if(creep.store.getFreeCapacity() === 0 && !creep.memory.full) {
    creep.memory.full = true;
  }

  if(!creep.memory.full && creep.room.name === creep.memory.homeRoom) {
    let storage = creep.room.storage;
    if(storage) {
      let result = creep.withdraw(storage, RESOURCE_ENERGY);
      if(result === ERR_NOT_IN_RANGE) {
        creep.MoveCostMatrixIgnoreRoads(storage, 1);
      }
      else if(result === OK) {
        creep.memory.full = true;
      }
    }
  }

  if(creep.room.name != creep.memory.targetRoom && creep.memory.full && !creep.memory.line) {
      return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
  }
  else if(creep.room.name != creep.memory.targetRoom && creep.memory.full && creep.memory.line) {
    return;
  }

  if(creep.room.name === creep.memory.targetRoom && !creep.memory.full) {
    creep.harvestEnergy();
  }

  if(creep.room.name === creep.memory.targetRoom && creep.memory.full) {
    let controller = creep.room.controller;
    if(controller && controller.level === 0) {
      creep.MoveCostMatrixRoadPrio(controller, 1);
    }
    if(controller && (controller.level === 1 || controller.level === 2 && controller.ticksToDowngrade < 9990)) {
      creep.upgradeController(controller);
      if(controller.level === 1 || controller.ticksToDowngrade <= 9500) {
        creep.MoveCostMatrixRoadPrio(controller, 1)
      }
    }
    if(controller && controller.level === 2 && controller.ticksToDowngrade >= 9500) {
      if(!creep.memory.walled || Game.time % 100 === 0) {
        wallExits(creep.room);
        creep.memory.walled = true;
      }
      let constructionSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
      if(constructionSites.length > 0) {
        let closestConstructionSite = creep.pos.findClosestByRange(constructionSites);
        if(creep.pos.getRangeTo(closestConstructionSite) <= 3) {
          creep.build(closestConstructionSite);
        }
        else {
          creep.moveTo(closestConstructionSite, {reusePath:50, ignoreCreeps:true});
        }
      }
    }
  }

}

function wallExits(room: Room) {
  const exits = room.find(FIND_EXIT);

  const offsetX = [-2, -2, -2, 0, 0, 2, 2, 2];
  const offsetY = [-2, 0, 2, -2, 2, -2, 0, 2];

  for (let i = 0; i < exits.length; i++) {
    const exitPos = exits[i];

    for (let j = 0; j < 8; j++) {
      const wallX = exitPos.x + offsetX[j];
      const wallY = exitPos.y + offsetY[j];

      // Make sure the wall position is within the bounds of the room
      if (wallX >= 0 && wallX <= 49 && wallY >= 0 && wallY <= 49) {
        // Check if there's already a wall at this position
        const structuresAtPos = room.lookForAt(LOOK_STRUCTURES, wallX, wallY);
        const wallsAtPos = structuresAtPos.filter((structure) => structure.structureType === STRUCTURE_WALL);
        if (wallsAtPos.length === 0) {
          room.createConstructionSite(wallX, wallY, STRUCTURE_WALL);
        }
      }
    }
  }
}

const roleRoomLocker = {
  run,
  //run: run,
  //function2,
  //function3
};
export default roleRoomLocker;
