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


    if(!creep.memory.targets || Game.time % 20 == 0) {
        creep.memory.targets = [];
        let powerMelees = creep.room.find(FIND_MY_CREEPS, {filter: c => c.memory.role == "PowerMelee"});
        if(powerMelees.length > 0) {
            for(let pm of powerMelees) {
                creep.memory.targets.push(pm.id);
            }
        }

        else {
            creep.memory.suicide = true;
        }
    }

    if(creep.memory.targets && creep.memory.targets.length > 0) {
        let targets = [];
        for(let target of creep.memory.targets) {
            let targetObj = Game.getObjectById(target)
            if(targetObj) {
                targets.push(targetObj);
            }
        }
        if(targets.length > 0) {
            let range1Targets = creep.pos.findInRange(targets, 1);
            if(range1Targets.length > 0) {
                range1Targets.sort((a,b) => a.hits - b.hits);
                if(range1Targets[0].hits < range1Targets[0].hitsMax) {
                    creep.heal(range1Targets[0]);
                    return;
                }
                else {
                    creep.heal(range1Targets[0]);
                }
            }

            targets.sort((a,b) => a.hits - b.hits);

            if(creep.pos.isNearTo(targets[0])) {
                creep.heal(targets[0])
            }
            else {
                creep.MoveCostMatrixRoadPrio(targets[0], 1);
            }


        }
        else {
            creep.memory.target = false;
        }
    }

}


const rolePowerHeal = {
    run,
    //run: run,
    //function2,
    //function3
};
export default rolePowerHeal;
