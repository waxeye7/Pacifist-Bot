/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {
    creep.Speak();

    if(creep.room.name != creep.memory.targetRoom) {
        let route:any = Game.map.findRoute(creep.room.name, creep.memory.targetRoom, {
            routeCallback(roomName, fromRoomName) {
                if(Game.rooms[roomName] && Game.rooms[roomName].controller && Game.rooms[roomName].controller.level > 0 && !Game.rooms[roomName].controller.my) {
                    return Infinity;
                }
                return 1;
        }});

        if(route.length > 0) {
            console.log('Now heading to room '+route[0].room);
            const exit = creep.pos.findClosestByRange(route[0].exit);
            creep.moveTo(exit, {reusePath:7});
            return;
        }
    }
    else {
        let controller = creep.room.controller;
        if(controller.level == 0) {
            if(creep.claimController(controller) == 0) {
                creep.suicide();
                return;
            }
            if(creep.claimController(controller) == ERR_NOT_IN_RANGE) {
                creep.moveTo(controller);
            }
        }
    }
}


const roleClaimer = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleClaimer;
