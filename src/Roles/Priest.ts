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

    if(!creep.memory.RoomToPreach || creep.memory.RoomToPreach == creep.room.name) {

        let rooms = Object.values(Game.map.describeExits(creep.room.name))

        let filtered_rooms = rooms.filter(function(roomname) {return !creep.memory.roomsVisited.includes(roomname);});

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

    if(creep.room.controller && (!creep.room.controller.sign || creep.room.controller.sign.text !== "We did not inherit the earth from our ancestors; we borrowed it from our children") &&
    creep.room.controller.pos.getOpenPositionsIgnoreCreepsCheckStructs().length > 0) {
        if(creep.pos.isNearTo(creep.room.controller)) {
            creep.signController(creep.room.controller, "We did not inherit the earth from our ancestors; we borrowed it from our children")
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
