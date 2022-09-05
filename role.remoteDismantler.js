/**
 * A little description of this function 
 * @param {Creep} creep
 **/
 const run = function (creep) {
    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveTo(new RoomPosition(25, 25, creep.memory.targetRoom));
    }
    else {
        let thisWall = Game.getObjectById('62d07b925afcebfbab5b3b85');
        if(thisWall) {
            if(creep.dismantle(thisWall) == ERR_NOT_IN_RANGE) {
                creep.moveTo(thisWall);
            }
        }
    }
}


const roleRemoteDismantler = {
    run,
    //run: run,
    //function2,
    //function3
};

module.exports = roleRemoteDismantler;