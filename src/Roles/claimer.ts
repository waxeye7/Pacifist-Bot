/**
 * A little description of this function
 * @param {Creep} creep
 **/

import { getBody } from "Rooms/rooms.spawning";

 const run = function (creep) {
    creep.memory.moving = false;
    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        let result = creep.Boost();
        if(!result) {
            return;
        }
    }
    creep.heal(creep);

    if(creep.room.name != creep.memory.targetRoom && !creep.memory.line) {
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }
    else if(creep.room.name != creep.memory.targetRoom && creep.memory.line) {
        return;
    }

    if(creep.ticksToLive == 1 && creep.room.name == creep.memory.targetRoom && !creep.room.controller.upgradeBlocked && !creep.room.controller.reservation) {
        let newName = 'DismantleControllerWalls-' + creep.memory.homeRoom + "-" + creep.memory.targetRoom;
        Game.rooms[creep.memory.homeRoom].memory.spawn_list.push(getBody([MOVE,WORK], Game.rooms[creep.memory.homeRoom], 50), newName, {memory: {role: 'DismantleControllerWalls', homeRoom: creep.memory.homeRoom, targetRoom:creep.memory.targetRoom}});
        console.log('Adding DismantleControllerWalls to Spawn List: ' + newName);
    }

    let controller = creep.room.controller;

    // claimController works on an unreserved controller and on OUR reservation.
    // attackController is invalid against our own reservation and parked the
    // claimer for 600 ticks with the room never claimed.
    const reservedByOther = controller && controller.reservation &&
        controller.reservation.username !== creep.owner.username;

    if(controller && controller.level == 0 && !reservedByOther) {

        if(creep.claimController(controller) == 0) {
            creep.suicide();
            return;
        }
        if(creep.claimController(controller) == ERR_NOT_IN_RANGE) {
            creep.moveTo(controller);
        }

    }

    else if(controller && !controller.my && controller.level > 0 && !controller.reservation) {
        if(creep.pos.isNearTo(controller)) {
            let result = creep.attackController(controller);
            if(result == 0) {
                creep.suicide();
            }
        }
        else {
            creep.moveTo(controller);
        }
    }

    else if(controller && controller.level == 0 && reservedByOther) {
        if(creep.pos.isNearTo(controller)) {
            creep.attackController(controller);
        }
        else {
            creep.moveTo(controller);
        }
    }

}


const roleClaimer = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleClaimer;
