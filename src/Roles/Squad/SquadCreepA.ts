import {roomCallbackSquadA} from "./SquadHelperFunctions";

/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.Speak();

    if(creep.ticksToLive > 1450) {
        creep.moveTo(38,39);
        return;
    }
    // if(creep.ticksToLive < 1400) {
    //     creep.moveTo(39,39);
    //     return;
    // }

    let move_location = creep.memory.targetPosition;


    let structures = creep.room.find(FIND_STRUCTURES, {filter: building => !building.my});
    let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
    if(enemyCreeps.length > 0) {
        let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);
        if(creep.pos.getRangeTo(closestEnemyCreep) <= 3) {
            creep.rangedAttack(closestEnemyCreep)
        }
        if(creep.pos.isNearTo(closestEnemyCreep)) {
            creep.rangedMassAttack();
        }

        if(creep.memory.targetPosition.roomName == creep.room.name) {
            move_location = closestEnemyCreep.pos;
        }
    }
    if(structures.length > 0) {
        let closestStructure = creep.pos.findClosestByRange(structures);
        if(creep.pos.getRangeTo(closestStructure) <= 3 && closestStructure.structureType !== STRUCTURE_ROAD) {
            creep.rangedAttack(closestStructure);
        }
        if(creep.pos.isNearTo(closestStructure) && closestStructure.structureType !== STRUCTURE_ROAD && closestStructure.structureType !== STRUCTURE_WALL) {
            creep.rangedMassAttack();
        }
    }









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

    if(squad.length == 4 && creep.ticksToLive <= 1300) {
        a = squad[0];
        b = squad[1];
        y = squad[2];
        z = squad[3];


        if(a && b && y && z) {
            squad.sort((a,b) => a.hits - b.hits);
            if(squad[0].hits == creep.hits) {
                if(enemyCreeps.length > 0 || creep.hits < creep.hitsMax) {
                    creep.heal(creep);
                }
            }
            else {
                creep.heal[squad[0]];
            }
        }
        else {
            if(creep.hits !== creep.hitsMax) {
                creep.heal(creep)
            }
        }


        // let move_location = new RoomPosition(20,29,creep.room.name);


        if(a&&b&&y&&z && a.fatigue == 0 && b.fatigue == 0 && y.fatigue == 0 && z.fatigue == 0) {

            let path = PathFinder.search(
                creep.pos, {pos:move_location, range:1},
                {
                    // We need to set the defaults costs higher so that we
                    // can set the road cost lower in `roomCallback`
                    plainCost: 1,
                    swampCost: 5,
                    roomCallback: () => roomCallbackSquadA(creep.room.name)
                }
                );

            path.path.forEach(spot => {
                new RoomVisual(spot.roomName).circle(spot.x, spot.y, {fill: 'transparent', radius: .25, stroke: '#ffffff'});
            });

            let pos = path.path[0];
            let direction = creep.pos.getDirectionTo(pos);
            console.log(JSON.stringify(pos))
            // && a.room.name == y.room.name && a.room.name == z.room.name) || (a.room.name == b.room.name && a.pos.isNearTo(b) && !a.pos.isNearTo(y)) || (a.room.name == y.room.name && a.pos.isNearTo(b) && !a.pos.isNearTo(b))
            if(
                pos &&

                (a.room.name == b.room.name && a.room.name == y.room.name && a.room.name == z.room.name) ||

                (
                ((a.room.name == b.room.name && a.pos.isNearTo(b) && !a.pos.isNearTo(y)) ||
                (a.room.name == y.room.name && a.pos.isNearTo(y) && !a.pos.isNearTo(b)))
                &&
                (b.room.name == a.room.name && b.pos.isNearTo(a) && !b.pos.isNearTo(z) ||
                b.room.name == z.room.name && b.pos.isNearTo(z) && !b.pos.isNearTo(a))
                &&
                (z.room.name == y.room.name && z.pos.isNearTo(y) && !z.pos.isNearTo(b) ||
                z.room.name == b.room.name && z.pos.isNearTo(b) && !z.pos.isNearTo(y))
                &&
                (y.room.name == a.room.name && y.pos.isNearTo(a) && !y.pos.isNearTo(z) ||
                y.room.name == z.room.name && y.pos.isNearTo(z) && !y.pos.isNearTo(a))
                )
            )
            {

                if(((direction == 2 || direction == 3 || direction == 4) && a.room.name == b.room.name && a.pos.x == 48) ||
                   ((direction == 4 || direction == 5 || direction == 6) && a.room.name == y.room.name && a.pos.y == 48) ||
                   ((direction == 6 || direction == 7 || direction == 8) && a.room.name == b.room.name && a.pos.x == 0) ||
                   ((direction == 8 || direction == 1 || direction == 2) && a.room.name == y.room.name && a.pos.y == 0)) {
                    a.memory.direction = false;
                }

                else {
                    a.memory.direction = direction
                    creep.move(direction);
                }

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
