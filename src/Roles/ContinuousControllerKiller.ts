/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    creep.memory.moving = false;

    if (creep.room.name !== creep.memory.targetRoom) {
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    if (!creep.memory.ticksToGetHere && creep.room.name == creep.memory.targetRoom) {
        creep.memory.ticksToGetHere = 600 - creep.ticksToLive;
    }

    if(creep.room.controller) {
        let controller = creep.room.controller;
        if(!creep.pos.isNearTo(controller)) {creep.MoveCostMatrixRoadPrio(controller, 1)}
        else {
            if(!controller.upgradeBlocked) {
                if(creep.attackController(controller) === 0) {
                    creep.signController(controller, "too close to pacifist bot room, claim elsewhere.");

                    Memory.commandsToExecute.push({ delay: 1000-(creep.memory.ticksToGetHere+creep.body.length*3 + 50), bucketNeeded: 3000, formation: "CCK", homeRoom: creep.memory.homeRoom, targetRoom: creep.memory.targetRoom })


                    creep.suicide();
                    return;
                }
            }
        }

        if(creep.ticksToLive === 1 && creep.room.controller && !creep.room.controller.safeMode) {
            const index = Game.rooms[creep.memory.homeRoom].memory.observe.RoomsToSee.indexOf(creep.memory.targetRoom);
            if (index === 0) {
                Game.rooms[creep.memory.homeRoom].memory.observe.lastObserved = Game.rooms[creep.memory.homeRoom].memory.observe.RoomsToSee.length - 1
            }
            else {
                Game.rooms[creep.memory.homeRoom].memory.observe.lastObserved = index - 1;
            }
        }
    }


}


const roleContinuousControllerKiller = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleContinuousControllerKiller;
