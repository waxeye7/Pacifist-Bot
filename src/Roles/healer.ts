/**
 * A little description of this function
 * @param {Creep} creep
 **/

 const run = function (creep) {

    let selfHeal = creep.hits < creep.hitsMax;
    if(selfHeal) {
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
        damagedCreepsInRoom.sort((a,b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax) || creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b));
        let healTarget = damagedCreepsInRoom[0];
        if(selfHeal) {
            // later heal/rangedHeal would overwrite self-heal
            if(healTarget.id !== creep.id) creep.moveTo(healTarget);
        }
        else if (creep.heal(healTarget) == 0) {
            creep.moveTo(healTarget);
        }
        else if(creep.heal(healTarget) == ERR_NOT_IN_RANGE) {
            creep.moveTo(healTarget);
            creep.rangedHeal(healTarget);
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
