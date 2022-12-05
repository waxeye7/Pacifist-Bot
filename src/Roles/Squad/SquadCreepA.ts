import {roomCallbackSquadA} from "./SquadHelperFunctions";

// Game.rooms["E45N59"].memory.spawning_squad.status = true;


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



        if(creep.room.name != creep.memory.homeRoom) {
            if(creep.room.controller && !creep.room.controller.my && creep.room.controller.level > 4 && !_.includes(Memory.AvoidRooms, creep.room.name, 0)) {
                Memory.AvoidRooms.push(creep.room.name);
            }
        }
        route = Game.map.findRoute(creep.room.name, creep.memory.targetPosition.roomName, {
            routeCallback(roomName, fromRoomName) {
                if(_.includes(Memory.AvoidRooms, roomName, 0) && roomName !== creep.memory.targetPosition.roomName) {
                    return 2;
                }
                return 1;
        }});


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


    if(creep.room.name == creep.memory.targetPosition.roomName) {
        if(structures.length > 0) {

            let spawns = structures.filter(function(building) {return building.structureType == STRUCTURE_SPAWN;});
            if(spawns.length > 0) {
                 let closestSpawn = creep.pos.findClosestByRange(spawns);
                 creep.memory.targetPosition = closestSpawn.pos;
                 move_location = creep.memory.targetPosition
            }

            let towers = structures.filter(function(building) {return building.structureType == STRUCTURE_TOWER;});
            if(towers.length > 0) {

                let closestTower = creep.pos.findClosestByRange(towers);

                let totalTowerDamage = TowerDamageCalculator(creep.pos, closestTower.pos) * towers.length;

                let HealParts = creep.getActiveBodyparts(HEAL);
                let HealPower = HealParts * 12
                if(creep.body[creep.body.length - 1].boost) {
                    HealPower *= 4;
                }

                HealPower *= 4;
                console.log("heal power is", HealPower, "tower power is", totalTowerDamage);

                if(totalTowerDamage > HealPower) {

                    let distance = creep.pos.getRangeTo(closestTower);

                    let fleeTowerPath = PathFinder.search(
                        creep.pos, {pos:closestTower.pos, range:distance + 2},
                        {
                          plainCost: 1,
                          swampCost: 5,
                          flee: true,
                        }
                    );
                    move_location = fleeTowerPath.path[fleeTowerPath.path.length - 1];
                }
            }
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




        let range;

        if(move_location.roomName == creep.memory.targetPosition.roomName || route && route.length == 1) {
            range = 1
        }
        else {
            range = 23;
        }


        if(a&&b&&y&&z && a.fatigue == 0 && b.fatigue == 0 && y.fatigue == 0 && z.fatigue == 0 && a.getActiveBodyparts(MOVE) > 0 && b.getActiveBodyparts(MOVE) > 0 && y.getActiveBodyparts(MOVE) > 0 && z.getActiveBodyparts(MOVE) > 0) {


            // if(a.pos.findInRange(enemyCreeps, 2).length > 0 || b.pos.findInRange(enemyCreeps, 2).length > 0 || y.pos.findInRange(enemyCreeps, 2).length > 0 || z.pos.findInRange(enemyCreeps, 2).length > 0) {
            //     if(creep.room.controller && !creep.room.controller.my && creep.room.controller.safeMode > 0) {
            //         console.log("room is safe mode so i wont care about the creeps in range because I can't kill them")
            //     }
            //     else {
            //         creep.memory.direction = false;
            //         return;
            //     }

            // }





            let path = PathFinder.search(
                creep.pos, {pos:move_location, range:range},
                {
                    plainCost: 1,
                    swampCost: 5,
                    maxOps: 4000,
                    maxRooms: 40,
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

                    let lookCreepsRight:any = true;
                    let lookCreepsBottomRight:any = true;
                    let lookCreepsBottom:any = true;

                    if(a.pos.x <= 46 && a.pos.x >= 3 && a.pos.y <= 46 && a.pos.y >= 3) {
                        lookCreepsRight = new RoomPosition(a.pos.x + 1, a.pos.y, a.pos.roomName).lookFor(LOOK_CREEPS)[0];
                        lookCreepsBottomRight = new RoomPosition(a.pos.x + 1, a.pos.y + 1, a.pos.roomName).lookFor(LOOK_CREEPS)[0];
                        lookCreepsBottom = new RoomPosition(a.pos.x, a.pos.y + 1, a.pos.roomName).lookFor(LOOK_CREEPS)[0];
                    }



                    if(a.pos.x <= 46 && a.pos.x >= 3 && a.pos.y <= 46 && a.pos.y >= 3 &&
                        (b.pos.x !== a.pos.x + 1 || b.pos.y !== a.pos.y || y.pos.x !== a.pos.x || y.pos.y !== a.pos.y + 1 || z.pos.x !== a.pos.x + 1 || z.pos.y !== a.pos.y + 1) &&
                        new RoomPosition(a.pos.x + 1, a.pos.y, a.pos.roomName).lookFor(LOOK_TERRAIN)[0] !== "wall" &&
                        new RoomPosition(a.pos.x + 1, a.pos.y + 1, a.pos.roomName).lookFor(LOOK_TERRAIN)[0] !== "wall" &&
                        new RoomPosition(a.pos.x, a.pos.y + 1, a.pos.roomName).lookFor(LOOK_TERRAIN)[0] !== "wall" &&
                        (!lookCreepsRight || (lookCreepsRight.my && (lookCreepsRight == y || lookCreepsRight == z)) ||
                        !lookCreepsBottomRight || (lookCreepsBottomRight.my && (lookCreepsBottomRight == b || lookCreepsBottomRight == y)) ||
                        !lookCreepsBottom || (lookCreepsBottom.my && (lookCreepsBottom == b || lookCreepsBottom == z)))) {

                        creep.memory.direction = "join";

                    }
                    else {
                        creep.memory.direction = direction
                        creep.move(direction);
                    }

                }

            }
            else {
                creep.memory.direction = false;
            }



        }

    }

}


function TowerDamageCalculator(creepPosition, closestTowerPosition) {
    let distance = creepPosition.getRangeTo(closestTowerPosition) - 1;
    if(distance >= 20) {
        return 150;
    }
    else if(distance > 5 && distance < 20) {
        return 450/distance*6.7 // might be wrong but it'll do for now.
    }
    else {
        return 600;
    }


}

const roleSquadCreepA = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleSquadCreepA;
