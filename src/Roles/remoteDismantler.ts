/**
 * A little description of this function
 * @param {Creep} creep
 **/

 function findLocked(creep) {

    let HostileStructures = creep.room.find(FIND_HOSTILE_STRUCTURES, {
            filter: object => object.structureType != STRUCTURE_CONTROLLER});

    if(HostileStructures.length > 0) {
        let closestHostileStructure = creep.pos.findClosestByRange(HostileStructures);
        // HostileStructures.sort((a,b) => a.hits - b.hits);
        creep.say("🎯", true);
        return closestHostileStructure.id;
    }

    let Structures = creep.room.find(FIND_STRUCTURES, {
        filter: object => object.structureType != STRUCTURE_CONTROLLER && object.structureType != STRUCTURE_ROAD});

    if(Structures.length > 0) {
        let closestStructure = creep.pos.findClosestByRange(Structures);
        // Structures.sort((a,b) => a.hits - b.hits);
        creep.say("🎯", true);
        return closestStructure.id;
    }
}

 const run = function (creep) {
    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveToRoom(creep.memory.targetRoom);
    }
    else {
        let dismantleTarget;
        if(creep.memory.locked && creep.memory.locked != false) {
            dismantleTarget = Game.getObjectById(creep.memory.locked);
            if(!dismantleTarget) {
                creep.memory.locked = false;
            }
        }

        if(!creep.memory.locked || Game.time % 60 == 0) {
            dismantleTarget = findLocked(creep);
            creep.memory.locked = dismantleTarget;
        }


        if(creep.memory.locked && creep.memory.locked != false) {
            dismantleTarget = Game.getObjectById(creep.memory.locked);
            if(creep.dismantle(dismantleTarget) == ERR_NOT_IN_RANGE) {
                creep.moveTo(dismantleTarget, {reusePath:5});
            }
        }
    }
}


const roleRemoteDismantler = {
    run,
    //run: run,
    //function2,
    //function3
};

export default roleRemoteDismantler;
// module.exports = roleRemoteDismantler;
