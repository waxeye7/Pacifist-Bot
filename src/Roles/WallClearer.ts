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

    let controller = creep.room.controller;
    let openControllerPositions;
    if(controller) {
        openControllerPositions = controller.pos.getOpenPositionsIgnoreCreepsCheckStructs();
    }

    let buildings = creep.room.find(FIND_STRUCTURES, {filter: s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_CONTROLLER && s.pos.x >= 1 && s.pos.x <= 48 && s.pos.y >= 1 && s.pos.y <= 48});

    if(controller && controller.my && controller.level == 1 && controller.ticksToDowngrade > 19900) {
        if(buildings.length > 0) {
            for(let building of buildings) {
                building.destroy();
            }
        }
        else if(buildings.length == 0) {
            controller.unclaim();
            if(creep.room.name == creep.memory.targetRoom) {
                if(creep.ticksToLive <= 100) {
                    creep.suicide();
                }
                else {
                    creep.memory.suicide = true;
                }
            }
        }

    }


    if(creep.room.name !== creep.memory.homeRoom && controller && controller.level == 0 && !controller.reservation && buildings.length > 0 && openControllerPositions.length > 0) {
        if(creep.pos.isNearTo(controller)) {
            creep.claimController(controller);
            creep.signController(creep.room.controller, "We did not inherit the earth from our ancestors; we borrowed it from our children")
        }
        else {
            creep.MoveCostMatrixRoadPrio(controller, 1)
        }
        return;
    }




    let route:any = Game.map.findRoute(creep.room.name, creep.memory.targetRoom, {
        routeCallback(roomName, fromRoomName) {
            if(Game.map.getRoomStatus(roomName).status !== "normal") {
                return Infinity;
            }
            if(_.includes(Memory.AvoidRooms, roomName, 0) && roomName !== creep.memory.targetRoom) {
                return 25;
            }



            if(roomName.length == 6) {
                if(parseInt(roomName[1] + roomName[2]) % 10 == 0) {
                    return 4;
                }
                if(parseInt(roomName[4] + roomName[5]) % 10 == 0) {
                    return 4;
                }
            }

            return 5;
    }});

    if(route == 2) {
        creep.suicide();
    }
    if(route != 2 && route.length > 0) {
        const exit = creep.pos.findClosestByRange(route[0].exit);
        creep.MoveCostMatrixRoadPrioAvoidEnemyCreepsMuch(exit, 0);
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
