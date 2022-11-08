/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.Speak();

    if(creep.hits != creep.hitsMax) {
        creep.heal(creep);
    }

    if(creep.pos.x <= 48 && creep.pos.x >= 1 && creep.pos.y <= 48 && creep.pos.y >= 1) {
        let AroundCreepPositions = creep.pos.getNearbyPositions();
        let found = false;

        for(let position of AroundCreepPositions) {
            let lookForCreep = position.lookFor(LOOK_CREEPS);
            if(lookForCreep.length >= 1) {
                if(lookForCreep[0].my && lookForCreep[0].memory.role == "signifer") {
                    found = true;
                }
            }
        }

        if(!found) {
            if(creep.room.name == creep.memory.homeRoom) {
                if(creep.roadCheck()) {
                    creep.moveAwayIfNeedTo();
                }
            }
            return;
        }

    }


    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveToRoom(creep.memory.targetRoom)
    }

    let target;
    let Structures = creep.room.find(FIND_STRUCTURES);
    if(Structures.length > 0) {
        let enemySpawns = Structures.filter(function(building) {return building.structureType == STRUCTURE_SPAWN;});
        if(enemySpawns.length > 0) {
            let closestEnemySpawn = creep.pos.findClosestByRange(enemySpawns);
            target = closestEnemySpawn;
        }
    }

    if(target) {
        if(creep.pos.isNearTo(target)) {
            creep.attack(target);
        }
        else {
            creep.moveTo(target);
        }
    }
}


const roleRam = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleRam;
