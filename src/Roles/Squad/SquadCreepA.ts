import {roomCallbackSquadA} from "./SquadHelperFunctions";

/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.Speak();

    if(!creep.memory.go && (creep.pos.x !== 38 || creep.pos.y !== 39) && creep.pos.roomName === creep.memory.homeRoom) {
        creep.moveTo(new RoomPosition(38,39,"E45N59"));
        return;
    }

    let move_location = creep.memory.targetPosition;

    let route:any;

    if(creep.room.name != creep.memory.targetPosition.roomName) {
        route = Game.map.findRoute(creep.room.name, creep.memory.targetPosition.roomName);
        if(route && route !== 2 && route.length > 2) {
            move_location = new RoomPosition(25, 25, route[0].room);
        }
    }




    let structures = creep.room.find(FIND_STRUCTURES, {filter: building => !building.my && building.structureType !== STRUCTURE_CONTAINER && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTROLLER && building.structureType !== STRUCTURE_KEEPER_LAIR});
    let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
    let closestEnemyCreep
    if(enemyCreeps.length > 0) {
        closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);
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
        if(creep.pos.getRangeTo(closestStructure) <= 3) {
            creep.rangedAttack(closestStructure);
        }
        if(creep.pos.isNearTo(closestStructure) && closestStructure.structureType !== STRUCTURE_WALL) {
            creep.rangedMassAttack();
        }
        if(creep.memory.targetPosition.roomName == creep.room.name && !closestEnemyCreep || creep.memory.targetPosition.roomName == creep.room.name && closestEnemyCreep && creep.pos.getRangeTo(closestEnemyCreep) > 3) {
            move_location = closestStructure.pos;
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


    if(squad[0] && squad[0].pos.x == 38 && squad[0].pos.y == 39 && squad[0].pos.roomName == "E45N59" &&
    squad[1] && squad[1].pos.x == 39 && squad[1].pos.y == 39 && squad[1].pos.roomName == "E45N59" &&
    squad[2] && squad[2].pos.x == 38 && squad[2].pos.y == 40 && squad[2].pos.roomName == "E45N59" &&
    squad[3] && squad[3].pos.x == 39 && squad[3].pos.y == 40 && squad[3].pos.roomName == "E45N59")
    {
    squad[0].memory.go = true;
    squad[1].memory.go = true;
    squad[2].memory.go = true;
    squad[3].memory.go = true;
    }



    let a;
    let b;
    let y;
    let z;



    if(squad.length == 4 && creep.memory.go) {
        a = squad[0];
        b = squad[1];
        y = squad[2];
        z = squad[3];





        let range;

        if(move_location.roomName == creep.memory.targetPosition.roomName || route && route.length == 1) {
            range = 1
        }
        else {
            range = 18;
        }


        if(a&&b&&y&&z && a.fatigue == 0 && b.fatigue == 0 && y.fatigue == 0 && z.fatigue == 0) {

            let path = PathFinder.search(
                creep.pos, {pos:move_location, range:range},
                {
                    plainCost: 1,
                    swampCost: 5,
                    maxOps: 8000,
                    maxRooms: 64,
                    roomCallback: (roomName) => roomCallbackSquadA(roomName)
                }
                );

            path.path.forEach(spot => {
                new RoomVisual(spot.roomName).circle(spot.x, spot.y, {fill: 'transparent', radius: .25, stroke: '#ffffff'});
            });
            console.log(path.incomplete)
            let pos = path.path[0];
            let direction = creep.pos.getDirectionTo(pos);
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
                    creep.memory.direction = false;
                }

                else if(((direction == 2 || direction == 3 || direction == 4) && a.room.name != b.room.name && a.pos.x == 49) ||
                        ((direction == 4 || direction == 5 || direction == 6) && a.room.name != y.room.name && a.pos.y == 49) ||
                        ((direction == 6 || direction == 7 || direction == 8) && a.room.name != b.room.name && a.pos.x == 48) ||
                        ((direction == 8 || direction == 1 || direction == 2) && a.room.name != y.room.name && a.pos.y == 48)) {
                        creep.memory.direction = false;
                }

                else {
                    // if(creep.pos.x == 48 && (direction == 2 || direction == 4)) {
                    //     direction = 3;
                    // }
                    // else if(creep.pos.x == 1 && (direction == 6 || direction == 8)) {
                    //     direction = 7;
                    // }
                    // else if(creep.pos.y == 48 && (direction == 4 || direction == 6)) {
                    //     direction = 5;
                    // }
                    // else if(creep.pos.y == 1 && (direction == 8 || direction == 2)) {
                    //     direction = 1;
                    // }

                    creep.memory.direction = direction
                    creep.move(direction);


                }

            }
            else {
                creep.memory.direction = false;
            }



        }

        if(a && b && y && z) {
            let target;
            let lowest = creep.hitsMax;
            for(let squadmember of squad) {
                if(squadmember.hits < lowest) {
                    lowest = squadmember.hits;
                    target = squadmember;
                }
            }
            if(target) {
                creep.heal(target);
            }
            else if(creep.hits < creep.hitsMax || enemyCreeps.length > 0 && creep.pos.getRangeTo(closestEnemyCreep) <= 4) {
                creep.heal(creep);
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
