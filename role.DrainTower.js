/**
 * A little description of this function 
 * @param {Creep} creep
 **/

 const run = function (creep) {
    if(creep.hits == creep.hitsMax) {
        creep.memory.draining = true;
    }
    if((creep.hitsMax / 4) + creep.hits <= creep.hitsMax) {
        creep.memory.draining = false;
    }

    if(creep.memory.draining) {
        if(creep.memory.targetRoom && creep.memory.targetRoom !== creep.room.name) {
            return creep.moveTo(new RoomPosition(25, 25, creep.memory.targetRoom));
        }
        creep.moveTo(45,2);
    }

    else {
        if(creep.memory.healRoom && creep.memory.healRoom !== creep.room.name) {
            return creep.moveTo(new RoomPosition(25, 25, creep.memory.healRoom));
        }
        let healersInRoom = creep.room.find(FIND_MY_CREEPS, {filter: creep => creep.memory.role == "healer"});
        if(healersInRoom.length > 0) {
            let closestHealerInRoom = creep.pos.findClosestByRange(healersInRoom);
            if(creep.pos.isNearTo(closestHealerInRoom)) {
                return;
            }
            else {
                creep.moveTo(closestHealerInRoom);
            }
        }
        else {
            creep.moveTo(45,47);
        }
    }
}


const roleDrainTower = {
    run,
    //run: run,
    //function2,
    //function3
};

module.exports = roleDrainTower;