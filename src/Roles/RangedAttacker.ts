/**
 * A little description of this function
 * @param {Creep} creep
 **/
// const run = function (creep) {
//     creep.harvestEnergy();
// }

const run = function (creep) {
    creep.heal(creep);
    if(creep.notifyWhenAttacked == true) {
        creep.notifyWhenAttacked(false);
    }

    if(creep.memory.targetRoom && creep.memory.targetRoom !== creep.room.name) {
        let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

        if(enemyCreeps.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);

            if(creep.rangedAttack(closestEnemyCreep) == ERR_NOT_IN_RANGE) {
                creep.moveTo(closestEnemyCreep);
                return;
            }
            if(creep.rangedAttack(closestEnemyCreep) == 0) {
                if(creep.room.name != creep.memory.targetRoom && creep.pos.y != 1 && creep.pos.x != 48 && creep.pos.y != 48 && creep.pos.x != 1) {
                    creep.moveTo(closestEnemyCreep);
                }
                return;
            }
        }

        return creep.moveToRoom(creep.memory.targetRoom);
    }
    else {

        let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

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
                    if(creep.memory.homeRoom) {
                        return creep.moveToRoom(creep.memory.homeRoom);
                    }
                }
                else {
                    creep.moveTo(closestEnemyCreep);
                    return;
                }
            }
            else {
                creep.moveTo(closestEnemyCreep);
            }

            if(creep.rangedAttack(closestEnemyCreep) == 0 && isMelee) {
                console.log('ranged attacker melee thing log')
                if(creep.memory.homeRoom) {
                    return creep.moveToRoom(creep.memory.homeRoom);
                }
                else {
                    creep.moveTo(closestEnemyCreep);
                    return;
                }
            }
            else {
                creep.moveTo(closestEnemyCreep);
            }
            return;
        }

        let Structures;
        let Structures2;

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


        else {
            let found = false;
            if(Memory.tasks.wipeRooms.killCreeps.length > 0) {
                let resourceData = _.get(Game.rooms[creep.memory.homeRoom].memory, ['resources']);
                _.forEach(resourceData, function(data, targetRoomName) {
                    _.forEach(Memory.tasks.wipeRooms.killCreeps, function(thisRoom) {
                        if(targetRoomName == thisRoom) {
                            creep.memory.targetRoom = thisRoom;
                            found = true;
                        }
                    });
                });
            }
            if(found == false) {
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

const roleRangedAttacker = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleRangedAttacker;
