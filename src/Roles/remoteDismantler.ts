/**
 * A little description of this function
 * @param {Creep} creep
 **/
 function findLocked(creep) {

    let HostileStructures = creep.room.find(FIND_HOSTILE_STRUCTURES, {
            filter: object => object.structureType != STRUCTURE_CONTROLLER});

    let specialStructures = HostileStructures.filter(object => object.structureType == STRUCTURE_SPAWN || object.structureType == STRUCTURE_TOWER || object.structureType == STRUCTURE_POWER_SPAWN || object.structureType == STRUCTURE_LAB || object.structureType == STRUCTURE_STORAGE ||  object.structureType == STRUCTURE_TERMINAL || object.structureType == STRUCTURE_NUKER || object.structureType == STRUCTURE_OBSERVER || object.structureType == STRUCTURE_POWER_SPAWN ||  object.structureType == STRUCTURE_FACTORY);
    if(specialStructures.length > 0) {
        let closestspecialStructure = creep.pos.findClosestByRange(specialStructures);
        // HostileStructures.sort((a,b) => a.hits - b.hits);
        creep.say("🎯", true);
        return closestspecialStructure.id;
    }
    if(HostileStructures.length > 0) {
        let closestHostileStructure = creep.pos.findClosestByRange(HostileStructures);
        // HostileStructures.sort((a,b) => a.hits - b.hits);
        creep.say("🎯", true);
        return closestHostileStructure.id;
    }

    let Structures = creep.room.find(FIND_STRUCTURES, {
        filter: object => object.structureType != STRUCTURE_CONTROLLER && object.structureType != STRUCTURE_ROAD && object.structureType != STRUCTURE_CONTAINER});

    if(Structures.length > 0) {
        let closestStructure = creep.pos.findClosestByRange(Structures);
        // Structures.sort((a,b) => a.hits - b.hits);
        creep.say("🎯", true);
        return closestStructure.id;
    }
}

 const run = function (creep) {
    creep.memory.moving = false;

    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }
    else {
        let dismantleTarget;
        if(creep.memory.locked && creep.memory.locked != false) {
            dismantleTarget = Game.getObjectById(creep.memory.locked);
            if(!dismantleTarget) {
                creep.memory.locked = false;
            }
        }

        if(!creep.memory.locked || Game.time % 240 == 0) {
            dismantleTarget = findLocked(creep);
            creep.memory.locked = dismantleTarget;
        }


        if(creep.memory.locked && creep.memory.locked != false) {
            dismantleTarget = Game.getObjectById(creep.memory.locked);
            if(creep.dismantle(dismantleTarget) == ERR_NOT_IN_RANGE) {
                creep.moveTo(dismantleTarget, {reusePath:8});
                let structuresInRange1 = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 1);
                if(structuresInRange1.length > 0) {
                    creep.dismantle(structuresInRange1[0])
                }
            }
        }
    }

    if(creep.ticksToLive === 1 && creep.memory.persistent && creep.memory.locked && creep.room.controller && !creep.room.controller.safeMode) {
        global.SRDP(creep.memory.homeRoom, creep.memory.targetRoom)
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
