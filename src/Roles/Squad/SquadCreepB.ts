/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.Speak();

    if(creep.ticksToLive > 1450) {
        creep.moveTo(39,40);
        return;
    }
    // if(creep.ticksToLive < 1400) {
    //     creep.moveTo(39,40);
    //     return;
    // }

    if(!creep.memory.squad) {
        creep.memory.squad = {};
    }
    let squad = [];
    if(!creep.memory.squad.a) {
        let squadcreepa = creep.room.find(FIND_MY_CREEPS, {filter: (myCreep) => {return (myCreep.memory.role == "SquadCreepA");}});
        if(squadcreepa.length > 0) {
            creep.memory.squad.a = squadcreepa[0].id;
        }
    }
    if(!creep.memory.squad.b) {
        let squadcreepb = creep.room.find(FIND_MY_CREEPS, {filter: (myCreep) => {return (myCreep.memory.role == "SquadCreepB");}});
        if(squadcreepb.length > 0) {
            creep.memory.squad.b = squadcreepb[0].id;
        }
    }
    if(!creep.memory.squad.y) {
        let squadcreepy = creep.room.find(FIND_MY_CREEPS, {filter: (myCreep) => {return (myCreep.memory.role == "SquadCreepY");}});
        if(squadcreepy.length > 0) {
            creep.memory.squad.y = squadcreepy[0].id;
        }
    }
    if(!creep.memory.squad.z) {
        let squadcreepz = creep.room.find(FIND_MY_CREEPS, {filter: (myCreep) => {return (myCreep.memory.role == "SquadCreepZ");}});
        if(squadcreepz.length > 0) {
            creep.memory.squad.z = squadcreepz[0].id;
        }
    }

    if(creep.memory.squad.a) {
        squad.push(Game.getObjectById(creep.memory.squad.a));
    }
    if(creep.memory.squad.b) {
        squad.push(Game.getObjectById(creep.memory.squad.b));
    }
    if(creep.memory.squad.y) {
        squad.push(Game.getObjectById(creep.memory.squad.y));
    }
    if(creep.memory.squad.z) {
        squad.push(Game.getObjectById(creep.memory.squad.z));
    }

    let a;
    let b;
    let y;
    let z;

    if(squad.length == 4) {
        a = squad[0];
        b = squad[1];
        y = squad[2];
        z = squad[3];


        let move_location = new RoomPosition(30,40,creep.room.name);

        if(creep.pos.isNearTo(a) && creep.pos.isNearTo(b) && creep.pos.isNearTo(y) && creep.pos.isNearTo(z) &&
        a.fatigue == 0 && b.fatigue == 0 && y.fatigue == 0 && z.fatigue == 0) {

            if(y.pos.x < creep.pos.x && creep.pos.x > move_location.x ||
                y.pos.x > creep.pos.x && creep.pos.x < move_location.x) {
                creep.moveTo(y);
            }
            else {
                if(creep.pos.x > move_location.x) {
                    move_location.y -= 1;
                    move_location.x -= 1;
                }
                if(creep.pos.x > move_location.x && creep.pos.y > move_location.y) {
                    creep.move(TOP_LEFT);
                }
                else if(creep.pos.x < move_location.x && creep.pos.y < move_location.y) {
                    creep.move(BOTTOM_RIGHT);
                }
                else if(creep.pos.x < move_location.x && creep.pos.y > move_location.y) {
                    creep.move(TOP_RIGHT);
                }
                else if(creep.pos.x > move_location.x && creep.pos.y < move_location.y) {
                    creep.move(BOTTOM_LEFT);
                }
                else if(creep.pos.x == move_location.x && creep.pos.y < move_location.y) {
                    creep.move(BOTTOM);
                }
                else if(creep.pos.x == move_location.x && creep.pos.y > move_location.y) {
                    creep.move(TOP);
                }
                else if(creep.pos.x > move_location.x && creep.pos.y == move_location.y) {
                    creep.move(LEFT);
                }
                else if(creep.pos.x < move_location.x && creep.pos.y == move_location.y) {
                    creep.move(RIGHT);
                }            }
        }
    }
}


const roleSquadCreepB = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleSquadCreepB;
