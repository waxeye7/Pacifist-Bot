/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    creep.Speak();
    creep.memory.moving = false;

    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    if(!creep.memory.ticksToGetHere && creep.room.name == creep.memory.targetRoom) {
        creep.memory.ticksToGetHere = 1500 - creep.ticksToLive;
    }
    if(creep.memory.ticksToGetHere && creep.ticksToLive == creep.memory.ticksToGetHere + (creep.body.length * 3) && creep.room.controller && creep.room.controller.level > 0) {
        global.SCK(creep.memory.homeRoom, creep.memory.targetRoom);
    }

    if(creep.room.name == creep.memory.targetRoom) {
        let hostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
        if(hostileCreeps.length > 0) {
            let closestHostile = creep.pos.findClosestByRange(hostileCreeps);
            if(creep.pos.isNearTo(closestHostile)) {
                creep.attack(closestHostile);
            }
            else {
                creep.MoveCostMatrixRoadPrio(closestHostile, 1);
            }
        }
        else {
            return;
        }
    }
}


const roleCreepKiller = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleCreepKiller;
