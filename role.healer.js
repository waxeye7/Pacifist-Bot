/**
 * A little description of this function 
 * @param {Creep} creep
 **/

 const run = function (creep) {

    if(creep.hits < creep.hitsMax) {
        creep.heal(creep);
    }

    if(creep.memory.targetRoom && creep.memory.targetRoom !== creep.room.name) {
        return creep.moveTo(new RoomPosition(25, 25, creep.memory.targetRoom));
    }

    let damagedCreepsInRoom = _.filter(Game.creeps, (creep) => creep.hits < creep.hitsMax);

    if(damagedCreepsInRoom.length > 0) {
        if(creep.heal(damagedCreepsInRoom[0]) == ERR_NOT_IN_RANGE) {
            creep.moveTo(damagedCreepsInRoom[0]);
            creep.rangedHeal(damagedCreepsInRoom[0]);
        }
    }
    else {
        creep.moveTo(45,45);
    }
}


const roleHealer = {
    run,
    //run: run,
    //function2,
    //function3
};

module.exports = roleHealer;