/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    if(creep.memory.suicide) {
        creep.recycle();
        return;
    }


    let enemySpotted;
    // if(!enemyCreeps || enemyCreeps.length == 0) {
        enemySpotted = false;
    // }
    let friendlyChatter = false
    GuardSay(creep, enemySpotted, friendlyChatter);

    let enemyCreeps;

    if(creep.room.name !== creep.memory.targetRoom) {
        if(creep.ticksToLive % 5 == 0 && creep.memory.coma || !creep.memory.coma) {
            enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS, {filter: c => c.owner.username !== "Source Keeper"});
            if(enemyCreeps.length > 0) {
                creep.memory.coma = false;
                killCreepsInroom(creep, enemyCreeps);
            }
            else {
                creep.memory.coma = true;
            }
        }

        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    if(!enemyCreeps) {
        enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
    }

    if(enemyCreeps.length > 0) {
        killCreepsInroom(creep, enemyCreeps);
    }
    else {
        let HostileStructures = creep.room.find(FIND_HOSTILE_STRUCTURES);
        if(HostileStructures.length > 0) {
            let closestHostileStructure = creep.pos.findClosestByRange(HostileStructures);
            if(creep.pos.isNearTo(closestHostileStructure)) {
                creep.attack(closestHostileStructure);
            }
            else {
                creep.MoveCostMatrixRoadPrio(closestHostileStructure, 1);
            }
        }
        else {
            let Structures = creep.room.find(FIND_STRUCTURES);
            if(Structures.length > 0) {
                let closestStructure = creep.pos.findClosestByRange(Structures);
                if(creep.pos.isNearTo(closestStructure)) {
                    creep.attack(closestStructure);
                }
                else {
                    creep.MoveCostMatrixRoadPrio(closestStructure, 1);
                }
            }
        }
    }



}


function killCreepsInroom(creep, enemyCreeps) {
    let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);
    creep.MoveCostMatrixRoadPrio(closestEnemyCreep, 0);
    creep.attack(closestEnemyCreep)
}


function GuardSay(creep, enemySpotted, friendlyChatter) {


    if(!enemySpotted && !friendlyChatter) {
        if(creep.ticksToLive % 12 == 6) {
            creep.say("for", true);
        }
        else if(creep.ticksToLive % 12 == 5 && creep.saying == "for") {
            creep.say("the", true);
        }
        else if(creep.ticksToLive % 12 == 4 && creep.saying == "the") {
            creep.say("peace", true);
        }
        else if(creep.ticksToLive % 12 == 3 && creep.saying == "peace") {
            creep.say("of", true);
        }
        else if(creep.ticksToLive % 12 == 2 && creep.saying == "of") {
            creep.say("the", true);
        }
        else if(creep.ticksToLive % 12 == 1 && creep.saying == "the") {
            creep.say("kingdom", true);
        }


        else if(creep.ticksToLive % 12 == 11) {
            creep.say("for", true);
        }
        else if(creep.ticksToLive % 12 == 10 && creep.saying == "for") {
            creep.say("king", true);
        }
        else if(creep.ticksToLive % 12 == 9 && creep.saying == "king") {
            creep.say("and", true);
        }
        else if(creep.ticksToLive % 12 == 8 && creep.saying == "and") {
            creep.say("country", true);
        }
    }

}

const roleGuard = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleGuard;
