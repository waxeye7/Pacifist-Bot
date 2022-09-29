/**
 * A little description of this function 
 * @param {Creep} creep
 **/

 const run = function (creep) {
    if(creep.hits == creep.hitsMax) {
        creep.memory.draining = true;
    }
    if(creep.hits+750 < creep.hitsMax) {
        creep.memory.draining = false;
    }
    if(creep.memory.targetRoom && creep.memory.targetRoom !== creep.room.name) {
        if(creep.hits + 200 > creep.hitsMax) {
            creep.memory.draining = true;
        }
    }

    creep.heal(creep);

    if(creep.memory.draining) {
        if(creep.memory.targetRoom && creep.memory.targetRoom !== creep.room.name) {
            return creep.moveTo(new RoomPosition(25, 25, creep.memory.targetRoom));
        }
        else {  
            if(Game.time % 2 == 0) {
                creep.say("vennskap?⛄", true);
            } 
            if(creep.pos.x > 0 && creep.pos.y > 0 && creep.pos.y < 49 && creep.pos.x < 49) {
                return;
            }
            else {
                return creep.moveTo(new RoomPosition(25, 25, creep.memory.targetRoom));
            }  
        }
    }

    else {
        if(creep.memory.targetRoom && creep.memory.targetRoom == creep.room.name) {
            return creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom));
        }
        else {
            if(creep.pos.x > 0 && creep.pos.y > 0 && creep.pos.y < 49 && creep.pos.x < 49) {
                return;
            }
            else {
                return creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom));
            }
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