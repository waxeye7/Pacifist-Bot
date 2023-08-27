/**
 * A little description of this function
 * @param {Creep} creep
 **/

 const run = function (creep) {
    if(creep.room.name !== creep.memory.targetRoom) {
        if(creep.memory.route = -2) creep.suicide()
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    if(!Memory.rooms[creep.memory.homeRoom].resources[creep.room.name].energy) {
        Memory.rooms[creep.memory.homeRoom].resources[creep.room.name].energy = {};
    }
    let sources = creep.room.find(FIND_SOURCES);
    if(sources.length <= 2 && creep.room.controller && creep.room.controller.level == 0 && !creep.room.controller.reservation) {
        for(let source of sources) {
            Memory.rooms[creep.memory.homeRoom].resources[creep.room.name].energy[source.id] = {};
            Memory.rooms[creep.memory.homeRoom].resources[creep.room.name].active = true;
        }
    }
    else {
        Memory.rooms[creep.memory.homeRoom].resources[creep.room.name].energy = {};
    }

    creep.suicide();

}

const roleScout = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleScout;
