/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {
    creep.Speak();

    if(creep.room.name != creep.memory.targetRoom) {
        creep.moveToRoom(creep.memory.targetRoom);
    }
    else {
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
}


const roleClaimer = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleClaimer;
