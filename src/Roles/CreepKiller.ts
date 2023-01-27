/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    ;
    creep.memory.moving = false;

    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    if(!creep.memory.ticksToGetHere && creep.room.name == creep.memory.targetRoom) {
        creep.memory.ticksToGetHere = 1500 - creep.ticksToLive;
    }
    if(creep.memory.ticksToGetHere && creep.ticksToLive == creep.memory.ticksToGetHere + (creep.body.length * 3) && creep.room.controller && creep.room.controller.level > 0) {
        global.SCK(creep.memory.homeRoom, creep.memory.targetRoom);
    }

    let hostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
    if(hostileCreeps.length > 0) {
        let closestHostile = creep.pos.findClosestByRange(hostileCreeps);
        if(creep.pos.isNearTo(closestHostile)) {
            creep.attack(closestHostile);
            creep.moveTo(closestHostile, {reusePath:120});
        }
        else {
            creep.moveTo(closestHostile, {reusePath:120});
        }
        return;
    }

    if((!creep.memory.exposed_hostile_structs || creep.ticksToLive % 512 == 0)) {
        let listOfTargets = [];
        let hostileStructures = creep.room.find(FIND_HOSTILE_STRUCTURES, {filter: s => s.structureType !== STRUCTURE_CONTROLLER});

        for(let s of hostileStructures) {
            let buildingsOnTheS = s.pos.lookFor(LOOK_STRUCTURES);
            buildingsOnTheS = buildingsOnTheS.filter(function(s) {return s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER;});
            if(buildingsOnTheS.length == 1) {
                listOfTargets.push(s);
            }
        }

        let spawns = creep.room.find(FIND_HOSTILE_STRUCTURES, {filter: s => s.structureType == STRUCTURE_SPAWN});
        if(spawns.length > 0) {
            listOfTargets.sort((a,b) => a.pos.getRangeTo(spawns[0]) - b.pos.getRangeTo(spawns[0]));
        }

        let listOfTargetsIds = [];
        for(let target of listOfTargets) {
            listOfTargetsIds.push(target.id);
        }


        creep.memory.exposed_hostile_structs = listOfTargetsIds;

    }

    if(creep.memory.exposed_hostile_structs && creep.memory.exposed_hostile_structs.length > 0) {
        let target = Game.getObjectById(creep.memory.exposed_hostile_structs[0]);
        if(target) {
            if(creep.pos.isNearTo(target)) {
                creep.attack(target);
            }
            else {
                creep.MoveCostMatrixRoadPrio(target, 1);
            }
        }
        else {
            creep.memory.exposed_hostile_structs.shift();
        }
    }
    else {
        let spawns = creep.room.find(FIND_HOSTILE_STRUCTURES, {filter: s => s.structureType == STRUCTURE_SPAWN});
        if(spawns.length > 0) {
            let closestSpawn = creep.pos.findClosestByRange(spawns);
            if(!creep.pos.isNearTo(closestSpawn))  {
                creep.MoveCostMatrixRoadPrio(closestSpawn, 1);
            }
        }

    }


}


const roleCreepKiller = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleCreepKiller;
