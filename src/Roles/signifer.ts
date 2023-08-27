/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.memory.moving = false;
    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        let result = creep.Boost();
        if(!result) {
            return;
        }
    }

    if(Game.rooms[creep.memory.targetRoom] && Game.rooms[creep.memory.targetRoom].controller && Game.rooms[creep.memory.targetRoom].controller.safeMode && Game.rooms[creep.memory.targetRoom].controller.safeMode > 0) {
        creep.memory.suicide = true;
    }
    if(creep.memory.suicide) {
        creep.recycle();
        return;
    }


    if(!creep.memory.healtarget) {
        let creepsInRoom = creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == "ram");}});
        if(creepsInRoom.length > 0) {
            creepsInRoom.sort((a,b) => b.ticksToLive - a.ticksToLive);
            creep.memory.healtarget = creepsInRoom[0].id;
            if(!creep.memory.healtarget)return;
        }
    }

    let hostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

    // Assuming "creep" is your reference point
    let hostilesInRangeFour = hostileCreeps.filter(hostileCreep => {
      // Calculate the distance between the hostileCreep and your "creep"
      let distance = creep.pos.getRangeTo(hostileCreep);

      // Keep the hostileCreep in the resulting array if it is within range 4
      return distance <= 4;
    });

    let hostilesInRangeThree = hostilesInRangeFour.filter(hostileCreep => {
        // Calculate the distance between the hostileCreep and your "creep"
        let distance = creep.pos.getRangeTo(hostileCreep);

        // Keep the hostileCreep in the resulting array if it is within range 4
        return distance <= 3;
      });

    if(creep.memory.healtarget) {


        let target:any = Game.getObjectById(creep.memory.healtarget);
        if(target) {
            creep.moveTo(target.pos);
            if(creep.pos.isNearTo(target) && creep.room.name == creep.memory.targetRoom) {
                if(creep.pos.x == 0) {
                    if(Game.time % 3 == 0 && new RoomPosition(creep.pos.x + 1, creep.pos.y, creep.room.name).isNearTo(target)) {
                        creep.move(RIGHT);
                    }
                    else if (Game.time % 3 == 1 && new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name).isNearTo(target)) {
                        creep.move(TOP_RIGHT);
                    }
                    else if (Game.time % 3 == 2 && new RoomPosition(creep.pos.x + 1, creep.pos.y + 1, creep.room.name).isNearTo(target)) {
                        creep.move(BOTTOM_RIGHT);
                    }
                }
                else if(creep.pos.x == 49) {
                    if(Game.time % 3 == 0 && new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name).isNearTo(target)) {
                        creep.move(LEFT);
                    }
                    else if (Game.time % 3 == 1 && new RoomPosition(creep.pos.x - 1, creep.pos.y - 1, creep.room.name).isNearTo(target)) {
                        creep.move(TOP_LEFT);
                    }
                    else if (Game.time % 3 == 2 && new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name).isNearTo(target)) {
                        creep.move(BOTTOM_LEFT);
                    }
                }
                else if(creep.pos.y == 0) {
                    if(Game.time % 3 == 0 && new RoomPosition(creep.pos.x, creep.pos.y + 1, creep.room.name).isNearTo(target)) {
                        creep.move(BOTTOM);
                    }
                    else if (Game.time % 3 == 1 && new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name).isNearTo(target)) {
                        creep.move(BOTTOM_LEFT);
                    }
                    else if (Game.time % 3 == 2 && new RoomPosition(creep.pos.x + 1, creep.pos.y + 1, creep.room.name).isNearTo(target)) {
                        creep.move(BOTTOM_RIGHT);
                    }
                }
                else if(creep.pos.y == 49) {
                    if(Game.time % 3 == 0 && new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name).isNearTo(target)) {
                        creep.move(TOP);
                    }
                    else if (Game.time % 3 == 1 && new RoomPosition(creep.pos.x - 1, creep.pos.y - 1, creep.room.name).isNearTo(target)) {
                        creep.move(TOP_LEFT);
                    }
                    else if (Game.time % 3 == 2 && new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name).isNearTo(target)) {
                        creep.move(TOP_RIGHT);
                    }
                }
            }

            if(creep.hits == creep.hitsMax && (creep.room.name === creep.memory.targetRoom || target.hits !== target.hitsMax && creep.hits < target.hits || hostilesInRangeFour.length)) {
                creep.heal(target);
            }
            else if(creep.room.name === creep.memory.targetRoom || creep.hits !== creep.hitsMax || hostilesInRangeThree.length) {
                creep.heal(creep);
            }
        }
        else {
            creep.heal(creep);
        }
    }
    else if(creep.hits !== creep.hitsMax || hostilesInRangeThree.length) {
        creep.heal(creep);
    }
}


const roleSignifer = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleSignifer;
