import { open } from "fs";

/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    creep.Speak();

    let controller = creep.room.controller;

    let openControllerPositions = controller.pos.getOpenPositionsIgnoreCreeps();
    let walls = creep.room.find(FIND_STRUCTURES, {filter: s => s.structureType == STRUCTURE_WALL});

    if(controller && controller.my && controller.level == 1 && controller.ticksToDowngrade > 19997) {
        if(walls.length > 0) {
            for(let wall of walls) {
                wall.destroy();
            }
        }
        else if(walls.length == 0) {
            controller.unclaim();
        }

    }


    if(creep.room.name !== creep.memory.homeRoom && controller && controller.level == 0 && !controller.reservation && walls.length > 0 && openControllerPositions.length > 0) {
        if(creep.pos.isNearTo(controller)) {
            creep.claimController(controller);
        }
        else {
            creep.moveTo(controller, {reusePath:25})
        }
        return;
    }




    let route:any = Game.map.findRoute(creep.room.name, creep.memory.targetRoom, {
        routeCallback(roomName, fromRoomName) {
            if(_.includes(Memory.AvoidRooms, roomName, 0) && roomName !== creep.memory.targetRoom) {
                return 5;
            }
            return 1;
    }});

    if(route != 2 && route.length > 0) {
        const exit = creep.pos.findClosestByRange(route[0].exit);
        creep.moveTo(exit, {reusePath:25});
        return;
    }
}


const roleWallClearer = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleWallClearer;
