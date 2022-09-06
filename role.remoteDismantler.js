/**
 * A little description of this function 
 * @param {Creep} creep
 **/
 const run = function (creep) {
    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveTo(new RoomPosition(25, 25, creep.memory.targetRoom));
    }
    else {
        let HostileStructures = creep.room.find(FIND_HOSTILE_STRUCTURES);
        if (HostileStructures.length > 0) {
            if(creep.pos.isNearTo(HostileStructures[0])) {
                creep.dismantle(HostileStructures[0]);
            }
            else {
                creep.moveTo(HostileStructures[0]);
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