/**
 * A little description of this function
 * @param {Creep} creep
 **/
// const run = function (creep) {
//     creep.harvestEnergy();
// }

const run = function (creep) {
    creep.Speak();

    let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
    let Structures;

    if(creep.hits != creep.hitsMax || (enemyCreeps.length > 0 && creep.pos.getRangeTo(creep.pos.findClosestByRange(enemyCreeps)) <= 4)) {
        creep.heal(creep);
    }

    if(creep.notifyWhenAttacked == true) {
        creep.notifyWhenAttacked(false);
    }

    if(creep.memory.targetRoom && creep.memory.targetRoom !== creep.room.name) {
        if(enemyCreeps.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);

            let isMelee = false;
            for(let part of closestEnemyCreep.body) {
                if(part.type == ATTACK) {
                    isMelee = true;
                }
            }

            if(creep.rangedAttack(closestEnemyCreep) == ERR_NOT_IN_RANGE) {
                creep.moveTo(closestEnemyCreep);
                return;
            }
            if(creep.rangedAttack(closestEnemyCreep) == 0 && isMelee) {
                creep.RangedAttackFleeFromMelee(closestEnemyCreep);
            }
            else {
                creep.moveTo(closestEnemyCreep);
            }
        }

        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }
    else {


        if(enemyCreeps.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);

            let isMelee = false;
            for(let part of closestEnemyCreep.body) {
                if(part.type == ATTACK) {
                    isMelee = true;
                }
            }

            if(creep.pos.isNearTo(closestEnemyCreep)) {
                creep.rangedMassAttack();
                if(isMelee) {
                    creep.RangedAttackFleeFromMelee(closestEnemyCreep);
                }
                else {
                    creep.moveTo(closestEnemyCreep);
                    return;
                }
            }
            else {
                creep.moveTo(closestEnemyCreep);
            }

            if(creep.rangedAttack(closestEnemyCreep) == 0 && isMelee && creep.pos.getRangeTo(closestEnemyCreep) <= 2) {
                creep.RangedAttackFleeFromMelee(closestEnemyCreep);
            }
            else if(creep.rangedAttack(closestEnemyCreep) == 0 && creep.pos.getRangeTo(closestEnemyCreep) == 3) {
                creep.moveTo(creep)
            }
            else if(creep.rangedAttack(closestEnemyCreep) == 0) {
                creep.moveTo(closestEnemyCreep);
            }
            else {
                creep.moveTo(closestEnemyCreep);
            }
            return;
        }

        if(creep.room.controller && creep.room.controller.my) {
            Structures = creep.room.find(FIND_HOSTILE_STRUCTURES, {
                filter: object => object.structureType != STRUCTURE_CONTROLLER && object.structureType != STRUCTURE_ROAD && object.structureType != STRUCTURE_WALL && object.structureType != STRUCTURE_CONTAINER &&  !object.my
            });
        }
        else {
            Structures = creep.room.find(FIND_HOSTILE_STRUCTURES, {
                filter: object => object.structureType != STRUCTURE_CONTROLLER});
        }


        if(Structures.length > 0) {
            let closestStructure = creep.pos.findClosestByRange(Structures);
            if(creep.pos.isNearTo(closestStructure)) {
                creep.rangedAttack(closestStructure);

            }
            else{
                creep.moveTo(closestStructure);
            }
        }

        if(enemyCreeps.length == 0 && Structures.length == 0 && creep.ticksToLive % 50 == 0 && creep.memory.sticky == false) {
            creep.memory.targetRoom = false;
        }
    }




    if(Game.time % 17 == 0 && creep.roadCheck()) {
        let roadlessLocation = creep.roadlessLocation(creep.pos);
        creep.moveTo(roadlessLocation);
    }


    // if you are afraid of death, look away.
    if(Game.time % 35 == 0 && !creep.memory.targetRoom) {
        creep.memory.suicide = true;
    }

	if(creep.memory.suicide == true) {
		creep.recycle();
	}
    // suicide section








}

const roleRangedAttacker = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleRangedAttacker;
