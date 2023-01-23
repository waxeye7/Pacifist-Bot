/**
 * A little description of this function
 * @param {Creep} creep
 **/

 const run = function (creep) {
    creep.Speak();
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
    if(sources.length <= 2) {
        for(let source of sources) {
            Memory.rooms[creep.memory.homeRoom].resources[creep.room.name].energy[source.id] = {};
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
