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

    let controller = creep.room.controller;
    let openControllerPositions;
    if(controller) {
        openControllerPositions = controller.pos.getOpenPositionsIgnoreCreepsCheckStructs();
    }

    // INVADER_CORE cannot be destroyed; counting it as leftover never unclaims
    let buildings = creep.room.find(FIND_STRUCTURES, {filter: s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_INVADER_CORE && s.pos.x >= 1 && s.pos.x <= 48 && s.pos.y >= 1 && s.pos.y <= 48});

    // ticksToDowngrade > 19900 is unreachable on a fresh claim (timer
    // starts at 1000), so the claim was never unwound. Destroy then
    // unclaim once this target is ours. Stay on RCL1 + targetRoom so a
    // transit through home/other owned rooms does not wipe them.
    if(controller && controller.my && controller.level == 1 && creep.room.name == creep.memory.targetRoom) {
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


    if(creep.room.name == creep.memory.targetRoom && controller && controller.level == 0 && !controller.reservation && buildings.length > 0 && openControllerPositions.length > 0) {
        if(creep.pos.isNearTo(controller)) {
            creep.claimController(controller);
            creep.signController(creep.room.controller, "check out my YT channel - marlyman123")
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

    if(route == ERR_NO_PATH) {
        creep.suicide();
    }
    if(route != ERR_NO_PATH && route.length > 0) {
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
