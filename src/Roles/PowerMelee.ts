/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    creep.memory.moving = false;

    if(creep.memory.suicide) {
        creep.recycle();
        return;
    }

    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }


    if(!creep.memory.target) {
        let powerBanks = creep.room.find(FIND_STRUCTURES, {filter: s => s.structureType == STRUCTURE_POWER_BANK});
        if(powerBanks.length > 0) {
            creep.memory.target = powerBanks[0].id;
        }

        else {
            creep.memory.suicide = true;
        }
    }

    if(creep.memory.target) {
        let target:any = Game.getObjectById(creep.memory.target);
        if(target) {

            if(target.hits <= 180000 && !creep.memory.spawnedGoblin) {
                global.SGB(creep.memory.homeRoom, creep.memory.targetRoom);
                creep.memory.spawnedGoblin = true;
            }

            if(creep.pos.isNearTo(target)) {
                creep.attack(target)

            }
            else {
                creep.MoveCostMatrixRoadPrio(target, 1);
            }

        }
        else {
            creep.memory.target = false;
        }
    }

}


const rolePowerMelee = {
    run,
    //run: run,
    //function2,
    //function3
};
export default rolePowerMelee;
