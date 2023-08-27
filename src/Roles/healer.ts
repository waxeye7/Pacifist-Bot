/**
 * A little description of this function
 * @param {Creep} creep
 **/

 const run = function (creep) {

    if(creep.hits < creep.hitsMax) {
        creep.heal(creep);
    }

    if(creep.memory.fleeing) {
        // find hostiles with attack or ranged attack
        let hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
        let meleeHostiles = hostiles.filter(c => c.getActiveBodyparts(ATTACK) > 0 );
        let rangedHostiles = hostiles.filter(c => c.getActiveBodyparts(RANGED_ATTACK) > 0 );
        if(rangedHostiles.length) {
            let closestRangedHostile = creep.pos.findClosestByRange(rangedHostiles);
            if(creep.pos.getRangeTo(closestRangedHostile) <= 5) {
                return;
            }
        }
        else if(meleeHostiles.length) {
            let closestMeleeHostile = creep.pos.findClosestByRange(meleeHostiles);
            if(creep.pos.getRangeTo(closestMeleeHostile) <= 3) {
                return;
            }
        }
    }
    else if(!creep.memory.danger) {
        creep.memory.fleeing = false;
    }

    let damagedCreepsInRoom = _.filter(Game.creeps, (damagedCreep) => damagedCreep.hits < damagedCreep.hitsMax && damagedCreep.room.name == creep.room.name);

    if(damagedCreepsInRoom.length > 0) {
        if (creep.heal(damagedCreepsInRoom[0]) == 0) {
            creep.moveTo(damagedCreepsInRoom[0]);
        }
        if(creep.heal(damagedCreepsInRoom[0]) == ERR_NOT_IN_RANGE) {
            creep.moveTo(damagedCreepsInRoom[0]);
            creep.rangedHeal(damagedCreepsInRoom[0]);
        }
    }

}


const roleHealer = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleHealer;
