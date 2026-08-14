/**
 * A little description of this function
 * @param {Creep} creep
 **/

 const run = function (creep) {

    let selfHeal = creep.hits < creep.hitsMax;
    if(selfHeal) {
        creep.heal(creep);
    }

    if(creep.holdForFlee()) {
        return;
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
