/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    creep.memory.moving = false;

    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        let result = creep.Boost();
        if(!result) {
            return;
        }
    }

    if(creep.hits !== creep.hitsMax || creep.room.name === creep.memory.targetRoom) creep.heal();

    if (creep.room.name !== creep.memory.targetRoom) {
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    if (!creep.memory.ticksToGetHere && creep.room.name == creep.memory.targetRoom) {
        creep.memory.ticksToGetHere = 600 - creep.ticksToLive;
    }

    if(creep.room.controller) {
        let controller = creep.room.controller;
        if(!creep.pos.isNearTo(controller)) {
            creep.MoveCostMatrixRoadPrio(controller, 1);
            let structuresInRangeOne = creep.pos.findInRange(FIND_STRUCTURES, 1);
            if(structuresInRangeOne.length > 0) {
                structuresInRangeOne.sort((a,b) => a.hits - b.hits);
                creep.attack(structuresInRangeOne[0]);
            }

        }
        else {
            if(!controller.upgradeBlocked && !controller.my && controller.level > 0) {
                let myControllerKillers = _.filter(Game.creeps, (c) => c.memory.role == "CCK" && c.memory.targetRoom == creep.room.name && Math.abs(c.ticksToLive - creep.ticksToLive) < 200);
                if(myControllerKillers.length > 1 && creep.ticksToLive > 1 && !creep.room.find(FIND_HOSTILE_CREEPS, {
                    filter: c => (c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0) && c.pos.getRangeTo(c) <= 3
                }).length) {
                    // wait
                }
                else {
                    if(creep.attackController(controller) === 0) {
                        creep.signController(controller, "too close to pacifist bot room, claim elsewhere.");

                        Memory.commandsToExecute.push({ delay: 1000-(creep.memory.ticksToGetHere+creep.body.length*3 + 50), bucketNeeded: 3000, formation: "CCK", homeRoom: creep.memory.homeRoom, targetRoom: creep.memory.targetRoom })


                        creep.suicide();
                        return;
                    }
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
