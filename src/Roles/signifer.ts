/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.Speak();

    if((creep.pos.x <= 1 || creep.pos.y >= 48 || creep.pos.y <= 1 || creep.pos.x >= 48) && creep.room.name != creep.memory.targetRoom) {
        let creepsInRoom = creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == "ram");}});
        if(creepsInRoom.length > 0) {
            creep.heal(creep.pos.findClosestByRange(creepsInRoom));
        }
        else {
            creep.heal(creep);
        }
        return creep.moveToRoom(creep.memory.targetRoom);
    }
    else if((creep.pos.x == 0 || creep.pos.y == 49 || creep.pos.y == 0 || creep.pos.x == 49) && creep.room.name == creep.memory.targetRoom) {
        let creepsInRoom = creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == "ram");}});
        if(creepsInRoom.length > 0) {
            creep.heal(creep.pos.findClosestByRange(creepsInRoom));
        }
        else {
            creep.heal(creep);
        }
        return creep.moveToRoom(creep.memory.targetRoom);
    }

    let target;

    let AroundCreepPositions = creep.pos.getNearbyPositions();
    let found = false;
    for(let position of AroundCreepPositions) {
        let lookForCreep = position.lookFor(LOOK_CREEPS);
        if(lookForCreep.length >= 1) {
            if(lookForCreep[0].my && lookForCreep[0].memory.role == "ram") {
                found = true;
                target = lookForCreep[0];
            }
        }
    }

    if(!target) {
        let creepsInRoom = creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == "ram");}});
        if(creepsInRoom.length > 0) {
            target = creepsInRoom[0];
        }
    }

    if(target) {
        creep.moveTo(target);
    }
    // if(!target) {
    //     if(creep.pos.x == 48) {
    //         creep.move(RIGHT);
    //     }
    //     else if(creep.pos.x == 1) {
    //         creep.move(LEFT);
    //     }
    //     else if(creep.pos.y == 1) {
    //         creep.move(TOP);
    //     }
    //     else if(creep.pos.y == 48) {
    //         creep.move(BOTTOM);
    //     }
    // }


    if(target && target.hitsMax - target.hits >= creep.hitsMax - creep.hits) {
        creep.heal(target);
    }
    else if(target && creep.hitsMax - creep.hits > target.hitsMax - target.hits) {
        creep.heal(creep);
    }

}


const roleSignifer = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleSignifer;
