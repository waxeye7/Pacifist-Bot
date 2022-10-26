import roomDefence from "Rooms/rooms.defence";

/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:Creep):CreepMoveReturnCode | -2 | -5 | -7 | void {

    if(creep.memory.targetRoom == creep.memory.homeRoom) {
        let rampart:any = Game.getObjectById(creep.room.memory.rampartToMan);
        creep.moveTo(rampart);
        let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
        if(enemyCreeps.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);
            if(creep.pos.isNearTo(closestEnemyCreep)) {
                creep.attack(closestEnemyCreep);
            }
        }
        return;
    }

    let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
    let Structures = creep.room.find(FIND_HOSTILE_STRUCTURES, {
        filter: object => object.structureType != STRUCTURE_CONTROLLER && object.structureType != STRUCTURE_KEEPER_LAIR});
    if(enemyCreeps.length > 0) {
        let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);
            if(creep.pos.isNearTo(closestEnemyCreep)) {
                creep.attack(closestEnemyCreep);
            }
            else {
                creep.moveTo(closestEnemyCreep);
            }

            if(creep.attack(closestEnemyCreep) == 0) {
                creep.moveTo(closestEnemyCreep);
                return;
            }
            return;
        }

    else if(Structures.length > 0) {
        let closestStructure = creep.pos.findClosestByRange(Structures)
        if(creep.pos.isNearTo(closestStructure)) {
            creep.attack(closestStructure)
        }
        else {
            creep.moveTo(closestStructure);
        }
    }

    else {
        creep.moveTo(13,46);
    }

    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveToRoom(creep.memory.targetRoom);
    }
}


const roleAnnoy = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleAnnoy;
