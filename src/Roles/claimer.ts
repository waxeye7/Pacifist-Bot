/**
 * A little description of this function
 * @param {Creep} creep
 **/

import { getBody } from "Rooms/rooms.spawning";

 const run = function (creep) {
    creep.memory.moving = false;

    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    if(creep.ticksToLive == 1 && creep.room.name == creep.memory.targetRoom && !creep.room.controller.upgradeBlocked) {
        let newName = 'DismantleControllerWalls-' + creep.memory.homeRoom + "-" + creep.memory.targetRoom;
        Game.rooms[creep.memory.homeRoom].memory.spawn_list.push(getBody([MOVE,WORK], Game.rooms[creep.memory.homeRoom], 50), newName, {memory: {role: 'DismantleControllerWalls', homeRoom: creep.memory.homeRoom, targetRoom:creep.memory.targetRoom}});
        console.log('Adding DismantleControllerWalls to Spawn List: ' + newName);
    }

    let controller = creep.room.controller;

    if(controller && controller.level == 0 && !controller.reservation) {

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

    else if(controller && controller.level == 0 && controller.reservation && controller.reservation.ticksToEnd > 0) {
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
