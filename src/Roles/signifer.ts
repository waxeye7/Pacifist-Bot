/**
 * A little description of this function
 * @param {Creep} creep
 **/
function exitStepPos(x, y, roomName) {
    if(x < 0 || x > 49 || y < 0 || y > 49) return null;
    return new RoomPosition(x, y, roomName);
}

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


    // 1:1 pair via mutual back-pointers. Longest-TTL pick with no
    // taken-filter stacked every healer onto the same ram.
    if(creep.memory.healtarget) {
        let bound:any = Game.getObjectById(creep.memory.healtarget);
        if(bound && bound.memory.myhealer && bound.memory.myhealer !== creep.id && Game.getObjectById(bound.memory.myhealer)) {
            delete creep.memory.healtarget;
        }
        else if(bound && !bound.memory.myhealer) {
            bound.memory.myhealer = creep.id;
        }
        else if(!bound) {
            delete creep.memory.healtarget;
        }
    }
    if(!creep.memory.healtarget) {
        let creepsInRoom = creep.room.find(FIND_MY_CREEPS, {filter: (c) => {
            if(c.memory.role != "ram") return false;
            if(!c.memory.myhealer || c.memory.myhealer === creep.id) return true;
            return !Game.getObjectById(c.memory.myhealer);
        }});
        if(creepsInRoom.length > 0) {
            creepsInRoom.sort((a,b) => b.ticksToLive - a.ticksToLive);
            creep.memory.healtarget = creepsInRoom[0].id;
            creepsInRoom[0].memory.myhealer = creep.id;
        }
        else if(creep.room.name !== creep.memory.homeRoom) {
            creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom);
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
                // corner tiles make y-1 / y+1 (or x) out of 0..49; RoomPosition throws
                if(creep.pos.x == 0) {
                    let p0 = exitStepPos(creep.pos.x + 1, creep.pos.y, creep.room.name);
                    let p1 = exitStepPos(creep.pos.x + 1, creep.pos.y - 1, creep.room.name);
                    let p2 = exitStepPos(creep.pos.x + 1, creep.pos.y + 1, creep.room.name);
                    if(Game.time % 3 == 0 && p0 && p0.isNearTo(target)) {
                        creep.move(RIGHT);
                    }
                    else if (Game.time % 3 == 1 && p1 && p1.isNearTo(target)) {
                        creep.move(TOP_RIGHT);
                    }
                    else if (Game.time % 3 == 2 && p2 && p2.isNearTo(target)) {
                        creep.move(BOTTOM_RIGHT);
                    }
                }
                else if(creep.pos.x == 49) {
                    let p0 = exitStepPos(creep.pos.x - 1, creep.pos.y, creep.room.name);
                    let p1 = exitStepPos(creep.pos.x - 1, creep.pos.y - 1, creep.room.name);
                    let p2 = exitStepPos(creep.pos.x - 1, creep.pos.y + 1, creep.room.name);
                    if(Game.time % 3 == 0 && p0 && p0.isNearTo(target)) {
                        creep.move(LEFT);
                    }
                    else if (Game.time % 3 == 1 && p1 && p1.isNearTo(target)) {
                        creep.move(TOP_LEFT);
                    }
                    else if (Game.time % 3 == 2 && p2 && p2.isNearTo(target)) {
                        creep.move(BOTTOM_LEFT);
                    }
                }
                else if(creep.pos.y == 0) {
                    let p0 = exitStepPos(creep.pos.x, creep.pos.y + 1, creep.room.name);
                    let p1 = exitStepPos(creep.pos.x - 1, creep.pos.y + 1, creep.room.name);
                    let p2 = exitStepPos(creep.pos.x + 1, creep.pos.y + 1, creep.room.name);
                    if(Game.time % 3 == 0 && p0 && p0.isNearTo(target)) {
                        creep.move(BOTTOM);
                    }
                    else if (Game.time % 3 == 1 && p1 && p1.isNearTo(target)) {
                        creep.move(BOTTOM_LEFT);
                    }
                    else if (Game.time % 3 == 2 && p2 && p2.isNearTo(target)) {
                        creep.move(BOTTOM_RIGHT);
                    }
                }
                else if(creep.pos.y == 49) {
                    let p0 = exitStepPos(creep.pos.x, creep.pos.y - 1, creep.room.name);
                    let p1 = exitStepPos(creep.pos.x - 1, creep.pos.y - 1, creep.room.name);
                    let p2 = exitStepPos(creep.pos.x + 1, creep.pos.y - 1, creep.room.name);
                    if(Game.time % 3 == 0 && p0 && p0.isNearTo(target)) {
                        creep.move(TOP);
                    }
                    else if (Game.time % 3 == 1 && p1 && p1.isNearTo(target)) {
                        creep.move(TOP_LEFT);
                    }
                    else if (Game.time % 3 == 2 && p2 && p2.isNearTo(target)) {
                        creep.move(TOP_RIGHT);
                    }
                }
            }

            // signifer hitsMax is always >= ram; creep.hits < target.hits can never be true while we are full
            // heal() is melee-only — without rangedHeal the ram is unhealed the whole approach
            if(creep.hits == creep.hitsMax && (creep.room.name === creep.memory.targetRoom || target.hits < target.hitsMax || hostilesInRangeFour.length)) {
                if(creep.pos.isNearTo(target)) {
                    creep.heal(target);
                }
                else if(creep.pos.getRangeTo(target) <= 3) {
                    creep.rangedHeal(target);
                }
            }
            else if(creep.room.name === creep.memory.targetRoom || creep.hits !== creep.hitsMax || hostilesInRangeThree.length) {
                creep.heal(creep);
            }
        }
        else {
            delete creep.memory.healtarget;
            creep.heal(creep);
            if(creep.room.name !== creep.memory.homeRoom) {
                creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom);
            }
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
