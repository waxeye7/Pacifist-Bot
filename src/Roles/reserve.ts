/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {
    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveToRoom(creep.memory.targetRoom);
    }

    if(creep.room.controller) {
        if(creep.pos.isNearTo(creep.room.controller)) {
            creep.reserveController(creep.room.controller);
        }
        else {
            creep.moveTo(creep.room.controller);
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
