/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    creep.memory.moving = false;

    if(creep.memory.suicide) {
        creep.recycle();
        return;
    }

    if(!creep.memory.RoomToPreach || creep.memory.RoomToPreach == creep.room.name) {

        let rooms = Object.values(Game.map.describeExits(creep.room.name))

        let filtered_rooms = rooms.filter(function(roomname) {return !creep.memory.roomsVisited.includes(roomname) && Game.map.getRoomStatus(roomname).status == "normal";});

        if(filtered_rooms.length > 0 ) {
            creep.memory.RoomToPreach = filtered_rooms[Math.floor(Math.random()*filtered_rooms.length)];
        }
        else if(rooms.length > 0) {
            creep.memory.RoomToPreach = rooms[Math.floor(Math.random()*rooms.length)];
        }
        else {
            creep.memory.suicide = true;
        }

    }

    if(creep.room.controller && (!creep.room.controller.sign || creep.room.controller.sign.text !== "check out my YT channel - marlyman123") &&
    creep.room.controller.pos.getOpenPositionsIgnoreCreepsCheckStructs().length > 0) {
        if(creep.pos.isNearTo(creep.room.controller)) {
            creep.signController(creep.room.controller, "check out my YT channel - marlyman123")
        }
        else {
            creep.MoveCostMatrixSwampPrio(creep.room.controller, 1);
        }
    }
    else {
        if(!creep.memory.roomsVisited.includes(creep.room.name)) {
            creep.memory.roomsVisited.push(creep.room.name);
        }
        creep.moveTo(new RoomPosition(25,25,creep.memory.RoomToPreach), {range:23, reusePath:100, swampCost:1})
    }
}


const rolePriest = {
    run,
    //run: run,
    //function2,
    //function3
};
export default rolePriest;
