/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {
    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveTo(new RoomPosition(25, 25, creep.memory.targetRoom));
    }
    else {
        let controller = creep.room.controller;
        if(controller.level == 0) {
            if(creep.claimController(controller) == 0) {
                creep.suicide();
                return;
            }
            if(creep.claimController(controller) == ERR_NOT_IN_RANGE) {
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
