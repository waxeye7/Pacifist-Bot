/**
 * A little description of this function
 * @param {Creep} creep
 **/


 function findLocked(creep) {

    let buildingsToDismantle = creep.room.find(FIND_STRUCTURES, {filter: building => building.structureType == STRUCTURE_WALL});

    if(buildingsToDismantle.length > 0) {
        return buildingsToDismantle[0].id;
    }
}



 const run = function (creep) {
    creep.Speak();

    if(creep.memory.locked && creep.memory.locked != false) {
        let dismantleTarget = Game.getObjectById(creep.memory.locked);
        if(dismantleTarget == undefined) {
            creep.memory.locked = false;
        }
    }

    if(!creep.memory.locked) {
        creep.memory.locked = findLocked(creep);
    }


    if(creep.memory.locked && creep.memory.locked != false) {
        let dismantleTarget = Game.getObjectById(creep.memory.locked);
        if(creep.dismantle(dismantleTarget) == ERR_NOT_IN_RANGE) {
            creep.moveTo(dismantleTarget, {reusePath:20});
        }
    }
}


const roleDismantler = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleDismantler;
