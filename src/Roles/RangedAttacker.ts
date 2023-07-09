/**
 * A little description of this function
 * @param {Creep} creep
 **/
// const run = function (creep) {
//     creep.harvestEnergy();
// }

const run = function (creep) {
    ;

    creep.memory.moving = false;
    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        let result = creep.Boost();
        if(!result) {
            return;
        }
    }
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

            if(creep.pos.getRangeTo(closestEnemyCreep) > 3) {
                creep.moveTo(closestEnemyCreep);
                return;
            }
            else if(creep.pos.isNearTo(closestEnemyCreep)) {
                creep.rangedMassAttack();
            }
            else {
                creep.rangedAttack(closestEnemyCreep);
                creep.moveTo(closestEnemyCreep);
            }
            if(isMelee && creep.rangedAttack(closestEnemyCreep) == 0) {
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


            if(creep.pos.getRangeTo(closestEnemyCreep) == 1) {
                creep.rangedMassAttack()
            }
            else if(creep.pos.getRangeTo(closestEnemyCreep) == 2 || creep.pos.getRangeTo(closestEnemyCreep) == 3) {
                creep.rangedAttack(closestEnemyCreep)
            }

            if(isMelee && creep.pos.getRangeTo(closestEnemyCreep) <= 2) {
                if(closestEnemyCreep.fatigue == 0) {
                    creep.RangedAttackFleeFromMelee(closestEnemyCreep);
                }
                else {
                    creep.moveTo(creep);
                }
            }
            else if(isMelee && creep.pos.getRangeTo(closestEnemyCreep) == 3) {

            }
            else if(!isMelee) {
                creep.moveTo(closestEnemyCreep);
            }
            else {
                creep.moveTo(closestEnemyCreep);
            }

            if((creep.pos.x == 1 || creep.pos.x == 48 || creep.pos.y == 1 || creep.pos.y == 48) && !isMelee) {
                creep.moveTo(creep);
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
                creep.MoveCostMatrixRoadPrio(closestStructure, 1);
            }
            return;
        }

        let myConstructionSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
        if(myConstructionSites.length > 0) {
            if(myConstructionSites[0].structureType == STRUCTURE_CONTAINER || myConstructionSites[0].structureType == STRUCTURE_ROAD) {
                creep.MoveCostMatrixRoadPrio(myConstructionSites[0], 0);
            }
            else {
                creep.MoveCostMatrixRoadPrio(myConstructionSites[0], 1);
            }
        }


        if(enemyCreeps.length == 0 && Structures.length == 0 && creep.ticksToLive % 50 == 0 && creep.memory.sticky == false) {
            creep.memory.targetRoom = false;
        }
    }


    // if you are afraid of death, look away.
    if(Game.time % 35 == 0 && !creep.memory.targetRoom) {
        creep.memory.suicide = true;
    }

	if(creep.memory.suicide == true) {
		creep.recycle();
        return;
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
