/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.Speak();

    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        let result = creep.Boost();
        if(!result) {
            return;
        }
    }

    if(Game.rooms[creep.memory.targetRoom] && Game.rooms[creep.memory.targetRoom].controller.safeMode && Game.rooms[creep.memory.targetRoom].controller.safeMode > 0) {
        creep.memory.suicide = true;
    }
    if(creep.memory.suicide) {
        creep.recycle();
        return;
    }


    let creepsInRoom = creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == "ram");}});
    let closestCreepInRoom;

    // if(creepsInRoom.length == 0 && (creep.pos.x == 0 || creep.pos.y == 49 || creep.pos.y == 0 || creep.pos.x == 49)) {
    //     creep.moveToRoom(creep.memory.targetRoom);
    // }

    if(creepsInRoom.length == 0) {
        creep.heal(creep);
        if(creep.pos.x < 2 || creep.pos.y < 2 || creep.pos.x > 47 || creep.pos.y > 47) {
            creep.moveToRoom(creep.memory.targetRoom);
        }
        else {
            return;
        }
    }

    // let target:any = false;

    // if(creep.pos.x <= 47 && creep.pos.x >= 2 && creep.pos.y >= 2 && creep.pos.y <= 47) {
    //     let AroundCreepPositions = creep.pos.getNearbyPositions();
    //     let found = false;
    //     for(let position of AroundCreepPositions) {
    //         let lookForCreep = position.lookFor(LOOK_CREEPS);
    //         if(lookForCreep.length >= 1) {
    //             if(lookForCreep[0].my && lookForCreep[0].memory.role == "ram") {
    //                 found = true;
    //                 target = lookForCreep[0];
    //             }
    //         }
    //     }
    // }

    if(creepsInRoom.length > 0) {
        closestCreepInRoom = creep.pos.findClosestByRange(creepsInRoom);
        creep.moveTo(closestCreepInRoom);
    }



    // if(!target) {
    //     if(creepsInRoom.length > 0) {
    //         target = creep.pos.findClosestByRange(creepsInRoom);
    //     }
    // }

    // if(!target && (creep.pos.x == 1 || creep.pos.y == 48 || creep.pos.y == 1 || creep.pos.x == 48)) {
    //     creep.moveToRoom(creep.memory.targetRoom);
    // }

    // else if()

    // if(target) {
    //     creep.moveTo(target);
    // }


    // if((creep.pos.x <= 1 || creep.pos.y >= 48 || creep.pos.y <= 1 || creep.pos.x >= 48) && creep.room.name != creep.memory.targetRoom && target && (target.pos.x == 0 || target.pos.x == 49 || target.pos.y == 0 || target.pos.y == 49)) {
    //     if(creepsInRoom.length > 0) {
    //         creep.heal(creep.pos.findClosestByRange(creepsInRoom));
    //     }
    //     else {
    //         creep.heal(creep);
    //     }
    //     return creep.moveTo(creep.pos.findClosestByRange(creepsInRoom))
    // }

    // else if(!target && (creep.pos.x <= 1 || creep.pos.y >= 48 || creep.pos.y <= 1 || creep.pos.x >= 48)) {
    //     if(creepsInRoom.length > 0) {
    //         return creep.moveTo(creep.pos.findClosestByRange(creepsInRoom))
    //     }
    //     else {
    //         return creep.moveToRoom(creep.memory.targetRoom);
    //     }
    // }

    // else if(creep.pos.x == 0 || creep.pos.y == 49 || creep.pos.y == 0 || creep.pos.x == 49) {
    //     return creep.moveToRoom(creep.memory.targetRoom);
    // }

    // else if((creep.pos.x == 0 || creep.pos.y == 49 || creep.pos.y == 0 || creep.pos.x == 49) && creep.room.name == creep.memory.targetRoom) {
    //     let creepsInRoom = creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == "ram");}});
    //     if(creepsInRoom.length > 0) {
    //         creep.heal(creep.pos.findClosestByRange(creepsInRoom));
    //         return creep.moveTo(creep.pos.findClosestByRange(creepsInRoom));
    //     }
    //     else {
    //         creep.heal(creep);
    //     }
    // }




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

    if(creep.hits == creep.hitsMax) {
        creep.heal(closestCreepInRoom);
    }
    else {
        creep.heal(creep);
    }


    // if(target && target.hitsMax - target.hits >= creep.hitsMax - creep.hits) {
    //     creep.heal(target);
    // }
    // else if(target && creep.hitsMax - creep.hits > target.hitsMax - target.hits) {
    //     creep.heal(creep);
    // }
    // else {
    //     creep.heal(creep);
    // }
    if(closestCreepInRoom && closestCreepInRoom.memory.suicide) {
        creep.memory.suicide = true;
    }
}


const roleSignifer = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleSignifer;
