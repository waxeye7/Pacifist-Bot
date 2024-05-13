/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {

    if(creep.memory.suicide) {
        creep.recycle();
        return;
    }

    if(creep.room.controller && creep.room.controller.my && (!creep.room.controller.sign || creep.room.controller.sign.text !== "check out my YT channel - marlyman123")) {
        if(creep.pos.isNearTo(creep.room.controller)) {
            creep.signController(creep.room.controller, "check out my YT channel - marlyman123")
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
