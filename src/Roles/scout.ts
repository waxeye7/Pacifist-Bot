/**
 * A little description of this function
 * @param {Creep} creep
 **/

 const run = function (creep) {
    ;
    if(creep.memory.suicide) {
        creep.recycle();
        return;
    }
    if(creep.room.name !== creep.memory.targetRoom) {
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    if(!Memory.rooms[creep.memory.homeRoom].resources[creep.room.name].energy) {
        Memory.rooms[creep.memory.homeRoom].resources[creep.room.name].energy = {};
    }
    let sources = creep.room.find(FIND_SOURCES);
    if(sources.length <= 2 && creep.room.controller && creep.room.controller.level == 0) {
        for(let source of sources) {
            Memory.rooms[creep.memory.homeRoom].resources[creep.room.name].energy[source.id] = {};
            Memory.rooms[creep.memory.homeRoom].resources[creep.room.name].active = true;
        }
    }

    creep.memory.suicide = true;

}

const roleScout = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleScout;
