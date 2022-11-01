/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    if(creep.notifyWhenAttacked(true)) {
        creep.notifyWhenAttacked(false);
    }
    if(creep.memory.targetRoom && creep.memory.targetRoom !== creep.room.name) {
        let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

        if(enemyCreeps.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);

            if(creep.attack(closestEnemyCreep) == ERR_NOT_IN_RANGE) {
                creep.moveTo(closestEnemyCreep);
                return;
            }
            if(creep.attack(closestEnemyCreep) == 0) {
                creep.moveTo(closestEnemyCreep);
                return;
            }
        }

        return creep.moveToRoom(creep.memory.targetRoom);
    }
    else {
        let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
        let Structures;

        if(creep.room.controller && creep.room.controller.my) {
            Structures = creep.room.find(FIND_HOSTILE_STRUCTURES, {
                filter: object => object.structureType != STRUCTURE_CONTROLLER});}
        else {
            Structures = creep.room.find(FIND_HOSTILE_STRUCTURES, {
                filter: object => object.structureType != STRUCTURE_CONTROLLER && object.structureType != STRUCTURE_KEEPER_LAIR});

        }

        if(enemyCreeps.length > 0) {
            let closestEnemyCreepToTower = null;
            if(creep.room.controller.my && creep.room.controller.level >= 4) {
                let towerTest:any = Game.getObjectById(creep.room.memory.towers[0]);
                closestEnemyCreepToTower = towerTest.pos.findClosestByRange(enemyCreeps);
            }

            if(closestEnemyCreepToTower != null && creep.pos.isNearTo(closestEnemyCreepToTower)) {
                creep.attack(closestEnemyCreepToTower);
                return;
            }

            let closestEnemyCreep = creep.pos.findClosestByPath(enemyCreeps);
            if((creep.pos.findPathTo(closestEnemyCreep)).length <= 51) {
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
        }

        if(Structures.length > 0) {
            let closestStructure = creep.pos.findClosestByRange(Structures);
            if(creep.pos.isNearTo(closestStructure)) {
                creep.attack(closestStructure);
            }
            else{
                creep.moveTo(closestStructure);
            }
            return;
        }

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


        else {
            if(Memory.tasks.wipeRooms.destroyStructures.length > 0) {
                creep.memory.targetRoom = Memory.tasks.wipeRooms.destroyStructures[0];
            }
            else {
                if(Game.time % 20 == 0) {
                    let found_room = false;
                    _.forEach(Game.rooms, function(room) {
                        if(room.memory.danger == true) {
                            creep.memory.targetRoom = room.name;
                            found_room = true;
                            return;
                        }
                    });
                    if(found_room == false) {
                        delete creep.memory.targetRoom;
                    }
                }
            }
        }
    }

    if(Game.time % 17 == 0 && creep.roadCheck()) {
        let roadlessLocation = creep.roadlessLocation(creep.pos);
        creep.moveTo(roadlessLocation);
    }


    // if you are afraid of death, look away.
    if(Game.time % 55 == 0 && !creep.memory.targetRoom) {
        creep.memory.suicide = true;
    }

	if(creep.memory.suicide == true) {
		creep.recycle();
	}
    // suicide section


}


const roleAttacker = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleAttacker;
