import {roomCallbackSquadA} from "./SquadHelperFunctions";

/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.Speak();

    if(creep.ticksToLive > 1470) {
        creep.moveTo(38,39);
        return;
    }
    // if(creep.ticksToLive < 1400) {
    //     creep.moveTo(39,39);
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

    if(squad.length == 4 && creep.ticksToLive <= 1440) {
        a = squad[0];
        b = squad[1];
        y = squad[2];
        z = squad[3];

        let move_location = new RoomPosition(47,34,creep.room.name);

        if(creep.pos.isNearTo(a) && creep.pos.isNearTo(b) && creep.pos.isNearTo(y) && creep.pos.isNearTo(z) &&
        a.fatigue == 0 && b.fatigue == 0 && y.fatigue == 0 && z.fatigue == 0) {

            let path = PathFinder.search(
                creep.pos, {pos:move_location, range:0},
                {
                    // We need to set the defaults costs higher so that we
                    // can set the road cost lower in `roomCallback`
                    plainCost: 3,
                    swampCost: 15,
                    roomCallback: () => roomCallbackSquadA(creep.room.name)
                }
                );

            let pos = path.path[0];
            let direction = creep.pos.getDirectionTo(pos);
            if(pos) {
                a.memory.direction = direction
                creep.move(direction);
            }
            else {
                a.memory.direction = false;
            }



        }
    }

}


const roleSquadCreepA = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleSquadCreepA;
