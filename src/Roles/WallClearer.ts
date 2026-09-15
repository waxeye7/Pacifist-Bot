/**
 * A little description of this function
 * @param {Creep} creep
 **/

import { isHighway } from "War/geo";
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
    // destroy() only works on OUR structures — neutral walls left over
    // from a dead owner kept buildings.length > 0 forever, so unclaim
    // never fired and the creep spammed ERR_NOT_OWNER destroys per tick.
    if(controller && controller.my && controller.level == 1 && creep.room.name == creep.memory.targetRoom) {
        let ownBuildings = buildings.filter(b => b.my);
        if(ownBuildings.length > 0) {
            for(let building of ownBuildings) {
                building.destroy();
            }
        }
        else {
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




    // This ran a fresh findRoute EVERY tick of the journey — one per
    // WallClearer in transit. Cache it like the other cross-room movers:
    // shift the consumed hop on room change, recompute only when the stored
    // route is missing, dead, empty, or no longer ends at the target.
    if(creep.memory.route && creep.memory.route !== ERR_NO_PATH && creep.memory.route.length > 0 && creep.memory.route[0].room === creep.room.name) {
        creep.memory.route.shift();
    }
    if(!creep.memory.route || creep.memory.route === ERR_NO_PATH || creep.memory.route.length === 0 || creep.memory.route[creep.memory.route.length - 1].room !== creep.memory.targetRoom) {
        creep.memory.route = Game.map.findRoute(creep.room.name, creep.memory.targetRoom, {
            routeCallback(roomName, fromRoomName) {
                if(Game.map.getRoomStatus(roomName).status !== "normal") {
                    return Infinity;
                }
                if(_.includes(Memory.AvoidRooms, roomName, 0) && roomName !== creep.memory.targetRoom) {
                    return 25;
                }



                // Highway discount: parse the name, do not slice it - a 3-digit
                // coordinate (E120N5) sliced to the wrong digits and priced a
                // free highway as an ordinary room.
                if(isHighway(roomName)) {
                    return 4;
                }

                return 5;
        }});
    }
    const route:any = creep.memory.route;

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
