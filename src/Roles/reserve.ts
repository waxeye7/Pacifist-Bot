/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:Creep) {
    creep.Speak();
    creep.memory.moving = false;


    // if(creep.room.name == creep.memory.homeRoom) {
    //     if(creep.room.controller && creep.room.controller.my && creep.room.controller.sign.text !== "we come in peace") {
    //         if(creep.pos.isNearTo(creep.room.controller)) {
    //             creep.signController(creep.room.controller, "we come in peace")
    //         }
    //         else {
    //             creep.moveTo(creep.room.controller);
    //         }
    //         return;
    //     }
    // }

    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveToRoom(creep.memory.targetRoom);
    }

    if(creep.room.controller) {
        if(creep.memory.claim) {
            if(creep.room.controller.level == 0) {
                if(creep.claimController(creep.room.controller) == 0) {
                    // creep.signController(creep.room.controller, "we come in peace")
                    creep.suicide();
                    return;
                }
                if(creep.claimController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                    creep.MoveCostMatrixIgnoreRoads(creep.room.controller, 1)
                    return;
                }
            }
        }
        if(creep.pos.isNearTo(creep.room.controller)) {
            // creep.signController(creep.room.controller, "we come in peace")
            creep.reserveController(creep.room.controller);
        }
        else {
            creep.MoveCostMatrixIgnoreRoads(creep.room.controller, 1)
        }

        if(creep.room.controller.reservation && creep.room.controller.reservation.ticksToEnd >= 4999) {
            creep.suicide();
        }
    }
}

const roleReserve = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleReserve;
