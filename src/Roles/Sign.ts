/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {

    if(creep.memory.suicide) {
        creep.recycle();
        return;
    }

    if(creep.room.controller && creep.room.controller.my && (!creep.room.controller.sign || creep.room.controller.sign.text !== "We did not inherit the earth from our ancestors; we borrowed it from our children")) {
        if(creep.pos.isNearTo(creep.room.controller)) {
            creep.signController(creep.room.controller, "We did not inherit the earth from our ancestors; we borrowed it from our children")
        }
        else {
            creep.MoveCostMatrixIgnoreRoads(creep.room.controller, 1);
        }
    }
    else {
        creep.memory.suicide = true;
    }
}


const roleSign = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleSign;
