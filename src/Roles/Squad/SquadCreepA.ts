import {roomCallbackSquadA, roomCallbackSquadGetReady} from "./SquadHelperFunctions";

// Game.rooms["E45N59"].memory.spawning_squad.status = true;


/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.Speak();

    // if(!creep.memory.go && (creep.pos.x !== 38 || creep.pos.y !== 39) && creep.pos.roomName === creep.memory.homeRoom) {
    //     creep.moveTo(new RoomPosition(38,39,"E45N59"));
    //     return;
    // }

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
                    return 5;
                }
                return 1;
        }});



        if(route && route !== 2 && route.length > 2) {
            move_location = new RoomPosition(25, 25, route[0].room);
        }

        if(!creep.memory.go && route && route !== 2 && route.length > 0) {

            if(creep.pos.x >= 3 && creep.pos.x <= 45 && creep.pos.y >= 3 && creep.pos.y <= 45) {
                creep.moveTo(new RoomPosition(25, 25, route[0].room),{range:23});
            }

            else if(creep.pos.x > 1 && creep.pos.x < 47 && creep.pos.y > 1 && creep.pos.y < 47) {

                let nearExit = route[0].room;

                let path = PathFinder.search(
                    creep.pos, {pos:new RoomPosition(25,25,nearExit), range:23},
                    {
                        plainCost: 1,
                        swampCost: 5,
                        maxOps: 4000,
                        maxRooms: 40,
                        roomCallback: (roomName) => roomCallbackSquadGetReady(roomName)
                    }
                    );
                    let pos = path.path[0];
                    let direction = creep.pos.getDirectionTo(pos);

                    creep.move(direction);
            }

            else if((Game.time % 30 == 0 || Game.time % 30 == 1) && (creep.pos.x == 1 || creep.pos.x == 47 || creep.pos.y == 1 || creep.pos.y == 47)) {
                creep.moveTo(new RoomPosition(25,25,creep.room.name), {range:14});
            }
        }
    }


    let structures = creep.room.find(FIND_STRUCTURES, {filter: building => !building.my && building.structureType !== STRUCTURE_CONTAINER && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTROLLER && building.structureType !== STRUCTURE_KEEPER_LAIR});
    let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
    let enemyCreepInRangeThree = creep.pos.findInRange(enemyCreeps, 3);
    let targetCreep;
    if(enemyCreepInRangeThree.length > 0) {
        let attack_able:any = 0;
        for(let e_creep of enemyCreepInRangeThree) {



            if(e_creep.pos.x == 0 || e_creep.pos.x == 49 || e_creep.pos.y == 0 || e_creep.pos.y == 49) {
                attack_able = true;
                targetCreep = e_creep;
            }
            else {
                let lookStructuresOnEnemyCreep = e_creep.pos.lookFor(LOOK_STRUCTURES);
                if(lookStructuresOnEnemyCreep.length > 0) {
                    for(let structure of lookStructuresOnEnemyCreep) {
                        if(structure.structureType == STRUCTURE_RAMPART && !attack_able) {
                            attack_able = false;
                        }
                    }
                }
                if(lookStructuresOnEnemyCreep.length == 0 || attack_able == 0) {
                    attack_able = true;
                    targetCreep = e_creep;
                }
            }
        }

        if(targetCreep) {
            creep.rangedAttack(targetCreep)

            if(creep.pos.isNearTo(targetCreep)) {
                creep.rangedMassAttack();
            }

            if(creep.memory.targetPosition.roomName == creep.room.name) {
                move_location = targetCreep.pos;
            }
        }


    }
    if(structures.length > 0) {
        let closestStructure = creep.pos.findClosestByPath(structures);
        if(creep.pos.getRangeTo(closestStructure) <= 3 && !targetCreep) {
            creep.rangedAttack(closestStructure);
        }
        if(creep.pos.isNearTo(closestStructure) && closestStructure.structureType !== STRUCTURE_WALL && !targetCreep) {
            creep.rangedMassAttack();
        }
        if(creep.memory.targetPosition.roomName == creep.room.name && !targetCreep) {
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
            squadcreepa.sort((a,b) => b.ticksToLive - a.ticksToLive);
            creep.memory.squad.a = squadcreepa[0].id;
        }
    }
    if(!creep.memory.squad.b) {
        let squadcreepb = creep.room.find(FIND_MY_CREEPS, {filter: (myCreep) => {return (myCreep.memory.role == "SquadCreepB");}});
        if(squadcreepb.length > 0) {
            squadcreepb.sort((a,b) => b.ticksToLive - a.ticksToLive);
            creep.memory.squad.b = squadcreepb[0].id;
        }
    }
    if(!creep.memory.squad.y) {
        let squadcreepy = creep.room.find(FIND_MY_CREEPS, {filter: (myCreep) => {return (myCreep.memory.role == "SquadCreepY");}});
        if(squadcreepy.length > 0) {
            squadcreepy.sort((a,b) => b.ticksToLive - a.ticksToLive);
            creep.memory.squad.y = squadcreepy[0].id;
        }
    }
    if(!creep.memory.squad.z) {
        let squadcreepz = creep.room.find(FIND_MY_CREEPS, {filter: (myCreep) => {return (myCreep.memory.role == "SquadCreepZ");}});
        if(squadcreepz.length > 0) {
            squadcreepz.sort((a,b) => b.ticksToLive - a.ticksToLive);
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


    if(squad[0] && squad[1] && squad[2] && squad[3] && squad[1].pos.x == squad[0].pos.x + 1 && squad[1].pos.y == squad[0].pos.y &&
    squad[2].pos.x == squad[0].pos.x && squad[2].pos.y == squad[0].pos.y + 1 &&
    squad[3].pos.x == squad[0].pos.x + 1 && squad[3].pos.y == squad[0].pos.y + 1)
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


        let aliveCreeps = [];

        if(a) {
            aliveCreeps.push(a);
        }
        if(b) {
            aliveCreeps.push(b);
        }
        if(y) {
            aliveCreeps.push(y);
        }
        if(z) {
            aliveCreeps.push(z);
        }



        if(aliveCreeps.length > 0) {
            let healPartsTotal = 0;
            let target;
            let lowest = creep.hitsMax;
            for(let squadmember of aliveCreeps) {
                healPartsTotal += squadmember.getActiveBodyparts(HEAL);
                if(squadmember.hits < lowest) {
                    lowest = squadmember.hits;
                    target = squadmember;
                }
            }
            if(target) {
                creep.heal(target);
            }
            else if(creep.hits < creep.hitsMax || enemyCreeps.length > 0 && enemyCreepInRangeThree.length > 0) {
                creep.heal(creep);
            }



            if(creep.room.name == creep.memory.targetPosition.roomName) {
                if(structures.length > 0) {

                    let spawns = structures.filter(function(building) {return building.structureType == STRUCTURE_SPAWN;});
                    if(spawns.length > 0) {
                        // let closestSpawn = creep.pos.findClosestByRange(spawns);
                        // creep.memory.targetPosition = closestSpawn.pos;
                        // move_location = creep.memory.targetPosition
                    }

                    let towers = structures.filter(function(building) {return building.structureType == STRUCTURE_TOWER && building.store[RESOURCE_ENERGY] > 9;});
                    if(towers.length > 0) {

                        let closestTower = creep.pos.findClosestByRange(towers);

                        let totalTowerDamage = TowerDamageCalculator(creep.pos, closestTower.pos) * towers.length;

                        let HealPower = healPartsTotal * 12;
                        if(creep.body[creep.body.length - 1].boost) {
                            HealPower *= 4;
                        }

                        console.log("heal power is", HealPower, "tower power is", totalTowerDamage);

                        if(totalTowerDamage > HealPower || target && target.hits + 350 < target.hitsMax) {

                            let distance = creep.pos.getRangeTo(closestTower);

                            let fleeTowerPath = PathFinder.search(
                                creep.pos, {pos:closestTower.pos, range:distance + 4},
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
                    if(a.pos.x <= 48 && a.pos.x >= 0 && a.pos.y <= 48 && a.pos.y >= 0) {
                        lookCreepsRight = new RoomPosition(a.pos.x + 1, a.pos.y, a.pos.roomName).lookFor(LOOK_CREEPS)[0];
                        lookCreepsBottomRight = new RoomPosition(a.pos.x + 1, a.pos.y + 1, a.pos.roomName).lookFor(LOOK_CREEPS)[0];
                        lookCreepsBottom = new RoomPosition(a.pos.x, a.pos.y + 1, a.pos.roomName).lookFor(LOOK_CREEPS)[0];
                    }


                    if(a.pos.x <= 47 && a.pos.x >= 1 && a.pos.y <= 47 && a.pos.y >= 1 &&
                        (b.pos.x !== a.pos.x + 1 || b.pos.y !== a.pos.y || y.pos.x !== a.pos.x || y.pos.y !== a.pos.y + 1 || z.pos.x !== a.pos.x + 1 || z.pos.y !== a.pos.y + 1) &&
                        new RoomPosition(a.pos.x + 1, a.pos.y, a.pos.roomName).lookFor(LOOK_TERRAIN)[0] !== "wall" &&
                        new RoomPosition(a.pos.x + 1, a.pos.y + 1, a.pos.roomName).lookFor(LOOK_TERRAIN)[0] !== "wall" &&
                        new RoomPosition(a.pos.x, a.pos.y + 1, a.pos.roomName).lookFor(LOOK_TERRAIN)[0] !== "wall" &&
                        (!lookCreepsRight || (lookCreepsRight.my && (lookCreepsRight == y || lookCreepsRight == z)) ||
                        !lookCreepsBottomRight || (lookCreepsBottomRight.my && (lookCreepsBottomRight == b || lookCreepsBottomRight == y)) ||
                        !lookCreepsBottom || (lookCreepsBottom.my && (lookCreepsBottom == b || lookCreepsBottom == z)))) {

                        creep.memory.direction = "join";

                    }

                    else if(creep.pos.x == 48 && a.room.name == b.room.name && a.room.name == y.room.name && a.room.name == z.room.name &&
                        (b.pos.x !== a.pos.x + 1 || b.pos.y !== a.pos.y || y.pos.x !== a.pos.x || y.pos.y !== a.pos.y + 1 || z.pos.x !== a.pos.x + 1 || z.pos.y !== a.pos.y + 1) &&
                        new RoomPosition(a.pos.x, a.pos.y + 1, a.pos.roomName).lookFor(LOOK_TERRAIN)[0] !== "wall" &&
                        (!lookCreepsRight || (lookCreepsRight.my && (lookCreepsRight == y || lookCreepsRight == z)) ||
                        !lookCreepsBottomRight || (lookCreepsBottomRight.my && (lookCreepsBottomRight == b || lookCreepsBottomRight == y)) ||
                        !lookCreepsBottom || (lookCreepsBottom.my && (lookCreepsBottom == b || lookCreepsBottom == z)))) {

                        creep.memory.direction = "join";

                    }

                    else if(creep.pos.y == 48 && a.room.name == b.room.name && a.room.name == y.room.name && a.room.name == z.room.name &&
                        (b.pos.x !== a.pos.x + 1 || b.pos.y !== a.pos.y || y.pos.x !== a.pos.x || y.pos.y !== a.pos.y + 1 || z.pos.x !== a.pos.x + 1 || z.pos.y !== a.pos.y + 1) &&
                        new RoomPosition(a.pos.x + 1, a.pos.y, a.pos.roomName).lookFor(LOOK_TERRAIN)[0] !== "wall" &&
                        (!lookCreepsRight || (lookCreepsRight.my && (lookCreepsRight == y || lookCreepsRight == z)) ||
                        !lookCreepsBottomRight || (lookCreepsBottomRight.my && (lookCreepsBottomRight == b || lookCreepsBottomRight == y)) ||
                        !lookCreepsBottom || (lookCreepsBottom.my && (lookCreepsBottom == b || lookCreepsBottom == z)))) {

                        creep.memory.direction = "join";

                    }

                    else if(creep.pos.x == 0 && a.room.name == b.room.name && a.room.name == y.room.name && a.room.name == z.room.name &&
                        (b.pos.x !== a.pos.x + 1 || b.pos.y !== a.pos.y || y.pos.x !== a.pos.x || y.pos.y !== a.pos.y + 1 || z.pos.x !== a.pos.x + 1 || z.pos.y !== a.pos.y + 1) &&
                        new RoomPosition(a.pos.x + 1, a.pos.y, a.pos.roomName).lookFor(LOOK_TERRAIN)[0] !== "wall" &&
                        new RoomPosition(a.pos.x + 1, a.pos.y + 1, a.pos.roomName).lookFor(LOOK_TERRAIN)[0] !== "wall" &&
                        (!lookCreepsRight || (lookCreepsRight.my && (lookCreepsRight == y || lookCreepsRight == z)) ||
                        !lookCreepsBottomRight || (lookCreepsBottomRight.my && (lookCreepsBottomRight == b || lookCreepsBottomRight == y)) ||
                        !lookCreepsBottom || (lookCreepsBottom.my && (lookCreepsBottom == b || lookCreepsBottom == z)))) {

                        creep.memory.direction = "join";

                    }

                    else if(creep.pos.y == 0 && a.room.name == b.room.name && a.room.name == y.room.name && a.room.name == z.room.name &&
                        (b.pos.x !== a.pos.x + 1 || b.pos.y !== a.pos.y || y.pos.x !== a.pos.x || y.pos.y !== a.pos.y + 1 || z.pos.x !== a.pos.x + 1 || z.pos.y !== a.pos.y + 1) &&
                        new RoomPosition(a.pos.x + 1, a.pos.y + 1, a.pos.roomName).lookFor(LOOK_TERRAIN)[0] !== "wall" &&
                        new RoomPosition(a.pos.x, a.pos.y + 1, a.pos.roomName).lookFor(LOOK_TERRAIN)[0] !== "wall" &&
                        (!lookCreepsRight || (lookCreepsRight.my && (lookCreepsRight == y || lookCreepsRight == z)) ||
                        !lookCreepsBottomRight || (lookCreepsBottomRight.my && (lookCreepsBottomRight == b || lookCreepsBottomRight == y)) ||
                        !lookCreepsBottom || (lookCreepsBottom.my && (lookCreepsBottom == b || lookCreepsBottom == z)))) {

                        creep.memory.direction = "join";

                    }

                    else {
                        console.log(direction, creep.ticksToLive)
                        let allow = false;
                        if(creep.pos.x <= 47 && creep.pos.x >= 2 && creep.pos.y <= 47 && creep.pos.y >= 2) {
                            if(direction == 1) {

                                let LookStructuresTop:any = new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                let LookStructuresTopRight:any = new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                if(new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                (LookStructuresTop.length == 0 || LookStructuresTop.length == 1 && LookStructuresTop[0].structureType == STRUCTURE_ROAD ||
                                    LookStructuresTop.length == 1 && LookStructuresTop[0].structureType == STRUCTURE_RAMPART && LookStructuresTop[0].my ||
                                    LookStructuresTop.length == 2 && LookStructuresTop[0].structureType == STRUCTURE_RAMPART && LookStructuresTop[0].my && LookStructuresTop[1].structureType == STRUCTURE_ROAD ||
                                    LookStructuresTop.length == 2 && LookStructuresTop[1].structureType == STRUCTURE_RAMPART && LookStructuresTop[1].my && LookStructuresTop[0].structureType == STRUCTURE_ROAD) &&

                                (LookStructuresTopRight.length == 0 || LookStructuresTopRight.length == 1 && LookStructuresTopRight[0].structureType == STRUCTURE_ROAD ||
                                    LookStructuresTopRight.length == 1 && LookStructuresTopRight[0].structureType == STRUCTURE_RAMPART && LookStructuresTopRight[0].my ||
                                    LookStructuresTopRight.length == 2 && LookStructuresTopRight[0].structureType == STRUCTURE_RAMPART && LookStructuresTopRight[0].my && LookStructuresTopRight[1].structureType == STRUCTURE_ROAD ||
                                    LookStructuresTopRight.length == 2 && LookStructuresTopRight[1].structureType == STRUCTURE_RAMPART && LookStructuresTopRight[1].my && LookStructuresTopRight[0].structureType == STRUCTURE_ROAD)) {
                                        allow = true;
                                }

                            }

                            else if(direction == 2) {
                                let LookStructuresRightRight:any = new RoomPosition(creep.pos.x + 2, creep.pos.y, creep.room.name).lookFor(LOOK_STRUCTURES);
                                let LookStructuresTopRight:any = new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                let LookStructuresTopRightRight:any = new RoomPosition(creep.pos.x + 2, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                if(new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                new RoomPosition(creep.pos.x + 2, creep.pos.y - 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                new RoomPosition(creep.pos.x + 2, creep.pos.y, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                (LookStructuresTopRightRight.length == 0 || LookStructuresTopRightRight.length == 1 && LookStructuresTopRightRight[0].structureType == STRUCTURE_ROAD ||
                                    LookStructuresTopRightRight.length == 1 && LookStructuresTopRightRight[0].structureType == STRUCTURE_RAMPART && LookStructuresTopRightRight[0].my ||
                                    LookStructuresTopRightRight.length == 2 && LookStructuresTopRightRight[0].structureType == STRUCTURE_RAMPART && LookStructuresTopRightRight[0].my && LookStructuresTopRightRight[1].structureType == STRUCTURE_ROAD ||
                                    LookStructuresTopRightRight.length == 2 && LookStructuresTopRightRight[1].structureType == STRUCTURE_RAMPART && LookStructuresTopRightRight[1].my && LookStructuresTopRightRight[0].structureType == STRUCTURE_ROAD) &&

                                    (LookStructuresRightRight.length == 0 || LookStructuresRightRight.length == 1 && LookStructuresRightRight[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresRightRight.length == 1 && LookStructuresRightRight[0].structureType == STRUCTURE_RAMPART && LookStructuresRightRight[0].my ||
                                        LookStructuresRightRight.length == 2 && LookStructuresRightRight[0].structureType == STRUCTURE_RAMPART && LookStructuresRightRight[0].my && LookStructuresRightRight[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresRightRight.length == 2 && LookStructuresRightRight[1].structureType == STRUCTURE_RAMPART && LookStructuresRightRight[1].my && LookStructuresRightRight[0].structureType == STRUCTURE_ROAD) &&


                                (LookStructuresTopRight.length == 0 || LookStructuresTopRight.length == 1 && LookStructuresTopRight[0].structureType == STRUCTURE_ROAD ||
                                    LookStructuresTopRight.length == 1 && LookStructuresTopRight[0].structureType == STRUCTURE_RAMPART && LookStructuresTopRight[0].my ||
                                    LookStructuresTopRight.length == 2 && LookStructuresTopRight[0].structureType == STRUCTURE_RAMPART && LookStructuresTopRight[0].my && LookStructuresTopRight[1].structureType == STRUCTURE_ROAD ||
                                    LookStructuresTopRight.length == 2 && LookStructuresTopRight[1].structureType == STRUCTURE_RAMPART && LookStructuresTopRight[1].my && LookStructuresTopRight[0].structureType == STRUCTURE_ROAD)) {
                                        allow = true;
                                }

                            }
                            else if(direction == 3) {

                                let LookStructuresRightRight:any = new RoomPosition(creep.pos.x + 2, creep.pos.y, creep.room.name).lookFor(LOOK_STRUCTURES);
                                let LookStructuresRightRightBottom:any = new RoomPosition(creep.pos.x + 2, creep.pos.y + 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                if(new RoomPosition(creep.pos.x + 2, creep.pos.y, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                new RoomPosition(creep.pos.x + 2, creep.pos.y + 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                (LookStructuresRightRight.length == 0 || LookStructuresRightRight.length == 1 && LookStructuresRightRight[0].structureType == STRUCTURE_ROAD ||
                                    LookStructuresRightRight.length == 1 && LookStructuresRightRight[0].structureType == STRUCTURE_RAMPART && LookStructuresRightRight[0].my ||
                                    LookStructuresRightRight.length == 2 && LookStructuresRightRight[0].structureType == STRUCTURE_RAMPART && LookStructuresRightRight[0].my && LookStructuresRightRight[1].structureType == STRUCTURE_ROAD ||
                                    LookStructuresRightRight.length == 2 && LookStructuresRightRight[1].structureType == STRUCTURE_RAMPART && LookStructuresRightRight[1].my && LookStructuresRightRight[0].structureType == STRUCTURE_ROAD) &&

                                (LookStructuresRightRightBottom.length == 0 || LookStructuresRightRightBottom.length == 1 && LookStructuresRightRightBottom[0].structureType == STRUCTURE_ROAD ||
                                    LookStructuresRightRightBottom.length == 1 && LookStructuresRightRightBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresRightRightBottom[0].my ||
                                    LookStructuresRightRightBottom.length == 2 && LookStructuresRightRightBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresRightRightBottom[0].my && LookStructuresRightRightBottom[1].structureType == STRUCTURE_ROAD ||
                                    LookStructuresRightRightBottom.length == 2 && LookStructuresRightRightBottom[1].structureType == STRUCTURE_RAMPART && LookStructuresRightRightBottom[1].my && LookStructuresRightRightBottom[0].structureType == STRUCTURE_ROAD)) {
                                        allow = true;
                                }

                            }
                            else if(direction == 4) {
                                let LookStructuresRightRightBottom:any = new RoomPosition(creep.pos.x + 2, creep.pos.y + 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                let LookStructuresRightBottomBottom:any = new RoomPosition(creep.pos.x + 1, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                let LookStructuresDoubleRightBottom:any = new RoomPosition(creep.pos.x + 2, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                if(new RoomPosition(creep.pos.x + 1, creep.pos.y + 2, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                new RoomPosition(creep.pos.x + 2, creep.pos.y + 2, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                new RoomPosition(creep.pos.x + 2, creep.pos.y + 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                (LookStructuresRightBottomBottom.length == 0 || LookStructuresRightBottomBottom.length == 1 && LookStructuresRightBottomBottom[0].structureType == STRUCTURE_ROAD ||
                                    LookStructuresRightBottomBottom.length == 1 && LookStructuresRightBottomBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresRightBottomBottom[0].my ||
                                    LookStructuresRightBottomBottom.length == 2 && LookStructuresRightBottomBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresRightBottomBottom[0].my && LookStructuresRightBottomBottom[1].structureType == STRUCTURE_ROAD ||
                                    LookStructuresRightBottomBottom.length == 2 && LookStructuresRightBottomBottom[1].structureType == STRUCTURE_RAMPART && LookStructuresRightBottomBottom[1].my && LookStructuresRightBottomBottom[0].structureType == STRUCTURE_ROAD) &&

                                    (LookStructuresRightRightBottom.length == 0 || LookStructuresRightRightBottom.length == 1 && LookStructuresRightRightBottom[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresRightRightBottom.length == 1 && LookStructuresRightRightBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresRightRightBottom[0].my ||
                                        LookStructuresRightRightBottom.length == 2 && LookStructuresRightRightBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresRightRightBottom[0].my && LookStructuresRightRightBottom[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresRightRightBottom.length == 2 && LookStructuresRightRightBottom[1].structureType == STRUCTURE_RAMPART && LookStructuresRightRightBottom[1].my && LookStructuresRightRightBottom[0].structureType == STRUCTURE_ROAD) &&

                                (LookStructuresDoubleRightBottom.length == 0 || LookStructuresDoubleRightBottom.length == 1 && LookStructuresDoubleRightBottom[0].structureType == STRUCTURE_ROAD ||
                                    LookStructuresDoubleRightBottom.length == 1 && LookStructuresDoubleRightBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresDoubleRightBottom[0].my ||
                                    LookStructuresDoubleRightBottom.length == 2 && LookStructuresDoubleRightBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresDoubleRightBottom[0].my && LookStructuresDoubleRightBottom[1].structureType == STRUCTURE_ROAD ||
                                    LookStructuresDoubleRightBottom.length == 2 && LookStructuresDoubleRightBottom[1].structureType == STRUCTURE_RAMPART && LookStructuresDoubleRightBottom[1].my && LookStructuresDoubleRightBottom[0].structureType == STRUCTURE_ROAD)) {
                                        allow = true;
                                }

                            }
                            else if(direction == 5) {

                                let LookStructuresBottom:any = new RoomPosition(creep.pos.x, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                let LookStructuresBottomRight:any = new RoomPosition(creep.pos.x + 1, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                if(new RoomPosition(creep.pos.x, creep.pos.y + 2, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                new RoomPosition(creep.pos.x + 1, creep.pos.y + 2, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                (LookStructuresBottom.length == 0 || LookStructuresBottom.length == 1 && LookStructuresBottom[0].structureType == STRUCTURE_ROAD ||
                                    LookStructuresBottom.length == 1 && LookStructuresBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresBottom[0].my ||
                                    LookStructuresBottom.length == 2 && LookStructuresBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresBottom[0].my && LookStructuresBottom[1].structureType == STRUCTURE_ROAD ||
                                    LookStructuresBottom.length == 2 && LookStructuresBottom[1].structureType == STRUCTURE_RAMPART && LookStructuresBottom[1].my && LookStructuresBottom[0].structureType == STRUCTURE_ROAD) &&

                                (LookStructuresBottomRight.length == 0 || LookStructuresBottomRight.length == 1 && LookStructuresBottomRight[0].structureType == STRUCTURE_ROAD ||
                                    LookStructuresBottomRight.length == 1 && LookStructuresBottomRight[0].structureType == STRUCTURE_RAMPART && LookStructuresBottomRight[0].my ||
                                    LookStructuresBottomRight.length == 2 && LookStructuresBottomRight[0].structureType == STRUCTURE_RAMPART && LookStructuresBottomRight[0].my && LookStructuresBottomRight[1].structureType == STRUCTURE_ROAD ||
                                    LookStructuresBottomRight.length == 2 && LookStructuresBottomRight[1].structureType == STRUCTURE_RAMPART && LookStructuresBottomRight[1].my && LookStructuresBottomRight[0].structureType == STRUCTURE_ROAD)) {
                                        allow = true;
                                }

                            }
                            else if(direction == 6) {
                                let LookStructuresLeftBottom:any = new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                let LookStructuresBottomLeft:any = new RoomPosition(creep.pos.x - 1, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                let LookStructuresBottom:any = new RoomPosition(creep.pos.x, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                if(new RoomPosition(creep.pos.x - 1, creep.pos.y + 2, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                new RoomPosition(creep.pos.x, creep.pos.y + 2, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                (LookStructuresBottomLeft.length == 0 || LookStructuresBottomLeft.length == 1 && LookStructuresBottomLeft[0].structureType == STRUCTURE_ROAD ||
                                    LookStructuresBottomLeft.length == 1 && LookStructuresBottomLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresBottomLeft[0].my ||
                                    LookStructuresBottomLeft.length == 2 && LookStructuresBottomLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresBottomLeft[0].my && LookStructuresBottomLeft[1].structureType == STRUCTURE_ROAD ||
                                    LookStructuresBottomLeft.length == 2 && LookStructuresBottomLeft[1].structureType == STRUCTURE_RAMPART && LookStructuresBottomLeft[1].my && LookStructuresBottomLeft[0].structureType == STRUCTURE_ROAD) &&

                                    (LookStructuresLeftBottom.length == 0 || LookStructuresLeftBottom.length == 1 && LookStructuresLeftBottom[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresLeftBottom.length == 1 && LookStructuresLeftBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresLeftBottom[0].my ||
                                        LookStructuresLeftBottom.length == 2 && LookStructuresLeftBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresLeftBottom[0].my && LookStructuresLeftBottom[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresLeftBottom.length == 2 && LookStructuresLeftBottom[1].structureType == STRUCTURE_RAMPART && LookStructuresLeftBottom[1].my && LookStructuresLeftBottom[0].structureType == STRUCTURE_ROAD) &&

                                (LookStructuresBottom.length == 0 || LookStructuresBottom.length == 1 && LookStructuresBottom[0].structureType == STRUCTURE_ROAD ||
                                    LookStructuresBottom.length == 1 && LookStructuresBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresBottom[0].my ||
                                    LookStructuresBottom.length == 2 && LookStructuresBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresBottom[0].my && LookStructuresBottom[1].structureType == STRUCTURE_ROAD ||
                                    LookStructuresBottom.length == 2 && LookStructuresBottom[1].structureType == STRUCTURE_RAMPART && LookStructuresBottom[1].my && LookStructuresBottom[0].structureType == STRUCTURE_ROAD)) {
                                        allow = true;
                                }
                            }
                            else if(direction == 7) {
                                let LookStructuresLeft:any = new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name).lookFor(LOOK_STRUCTURES);
                                let LookStructuresBottomLeft:any = new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                if(new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                (LookStructuresLeft.length == 0 || LookStructuresLeft.length == 1 && LookStructuresLeft[0].structureType == STRUCTURE_ROAD ||
                                    LookStructuresLeft.length == 1 && LookStructuresLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresLeft[0].my ||
                                    LookStructuresLeft.length == 2 && LookStructuresLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresLeft[0].my && LookStructuresLeft[1].structureType == STRUCTURE_ROAD ||
                                    LookStructuresLeft.length == 2 && LookStructuresLeft[1].structureType == STRUCTURE_RAMPART && LookStructuresLeft[1].my && LookStructuresLeft[0].structureType == STRUCTURE_ROAD) &&

                                (LookStructuresBottomLeft.length == 0 || LookStructuresBottomLeft.length == 1 && LookStructuresBottomLeft[0].structureType == STRUCTURE_ROAD ||
                                    LookStructuresBottomLeft.length == 1 && LookStructuresBottomLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresBottomLeft[0].my ||
                                    LookStructuresBottomLeft.length == 2 && LookStructuresBottomLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresBottomLeft[0].my && LookStructuresBottomLeft[1].structureType == STRUCTURE_ROAD ||
                                    LookStructuresBottomLeft.length == 2 && LookStructuresBottomLeft[1].structureType == STRUCTURE_RAMPART && LookStructuresBottomLeft[1].my && LookStructuresBottomLeft[0].structureType == STRUCTURE_ROAD)) {
                                        allow = true;
                                }
                            }
                            else if(direction == 8) {
                                let LookStructuresTop:any = new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                let LookStructuresTopLeft:any = new RoomPosition(creep.pos.x - 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                let LookStructuresLeft:any = new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name).lookFor(LOOK_STRUCTURES);
                                if(new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                new RoomPosition(creep.pos.x - 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                (LookStructuresTop.length == 0 || LookStructuresTop.length == 1 && LookStructuresTop[0].structureType == STRUCTURE_ROAD ||
                                    LookStructuresTop.length == 1 && LookStructuresTop[0].structureType == STRUCTURE_RAMPART && LookStructuresTop[0].my ||
                                    LookStructuresTop.length == 2 && LookStructuresTop[0].structureType == STRUCTURE_RAMPART && LookStructuresTop[0].my && LookStructuresTop[1].structureType == STRUCTURE_ROAD ||
                                    LookStructuresTop.length == 2 && LookStructuresTop[1].structureType == STRUCTURE_RAMPART && LookStructuresTop[1].my && LookStructuresTop[0].structureType == STRUCTURE_ROAD) &&

                                (LookStructuresLeft.length == 0 || LookStructuresLeft.length == 1 && LookStructuresLeft[0].structureType == STRUCTURE_ROAD ||
                                    LookStructuresLeft.length == 1 && LookStructuresLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresLeft[0].my ||
                                    LookStructuresLeft.length == 2 && LookStructuresLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresLeft[0].my && LookStructuresLeft[1].structureType == STRUCTURE_ROAD ||
                                    LookStructuresLeft.length == 2 && LookStructuresLeft[1].structureType == STRUCTURE_RAMPART && LookStructuresLeft[1].my && LookStructuresLeft[0].structureType == STRUCTURE_ROAD) &&

                                (LookStructuresTopLeft.length == 0 || LookStructuresTopLeft.length == 1 && LookStructuresTopLeft[0].structureType == STRUCTURE_ROAD ||
                                    LookStructuresTopLeft.length == 1 && LookStructuresTopLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresTopLeft[0].my ||
                                    LookStructuresTopLeft.length == 2 && LookStructuresTopLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresTopLeft[0].my && LookStructuresTopLeft[1].structureType == STRUCTURE_ROAD ||
                                    LookStructuresTopLeft.length == 2 && LookStructuresTopLeft[1].structureType == STRUCTURE_RAMPART && LookStructuresTopLeft[1].my && LookStructuresTopLeft[0].structureType == STRUCTURE_ROAD)) {
                                        allow = true;
                                }
                            }
                        }

                        else if(creep.pos.x >= 48 || creep.pos.x <= 1 || creep.pos.y >= 48 || creep.pos.y <= 1) {
                            if(direction == 1) {
                                if(creep.pos.y <= 1) {
                                    allow = true;
                                }
                                else {
                                    let LookStructuresTop:any = new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    let LookStructuresTopRight:any = new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    if(new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    (LookStructuresTop.length == 0 || LookStructuresTop.length == 1 && LookStructuresTop[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresTop.length == 1 && LookStructuresTop[0].structureType == STRUCTURE_RAMPART && LookStructuresTop[0].my ||
                                        LookStructuresTop.length == 2 && LookStructuresTop[0].structureType == STRUCTURE_RAMPART && LookStructuresTop[0].my && LookStructuresTop[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresTop.length == 2 && LookStructuresTop[1].structureType == STRUCTURE_RAMPART && LookStructuresTop[1].my && LookStructuresTop[0].structureType == STRUCTURE_ROAD) &&

                                    (LookStructuresTopRight.length == 0 || LookStructuresTopRight.length == 1 && LookStructuresTopRight[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresTopRight.length == 1 && LookStructuresTopRight[0].structureType == STRUCTURE_RAMPART && LookStructuresTopRight[0].my ||
                                        LookStructuresTopRight.length == 2 && LookStructuresTopRight[0].structureType == STRUCTURE_RAMPART && LookStructuresTopRight[0].my && LookStructuresTopRight[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresTopRight.length == 2 && LookStructuresTopRight[1].structureType == STRUCTURE_RAMPART && LookStructuresTopRight[1].my && LookStructuresTopRight[0].structureType == STRUCTURE_ROAD)) {
                                            allow = true;
                                    }
                                }
                            }

                            else if(direction == 2) {
                                if(creep.pos.y <= 1 || creep.pos.x >= 48) {
                                    allow = true;
                                }
                                else {
                                    let LookStructuresRightRight:any = new RoomPosition(creep.pos.x + 2, creep.pos.y, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    let LookStructuresTopRight:any = new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    let LookStructuresTopRightRight:any = new RoomPosition(creep.pos.x + 2, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    if(new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    new RoomPosition(creep.pos.x + 2, creep.pos.y - 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    new RoomPosition(creep.pos.x + 2, creep.pos.y, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    (LookStructuresTopRightRight.length == 0 || LookStructuresTopRightRight.length == 1 && LookStructuresTopRightRight[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresTopRightRight.length == 1 && LookStructuresTopRightRight[0].structureType == STRUCTURE_RAMPART && LookStructuresTopRightRight[0].my ||
                                        LookStructuresTopRightRight.length == 2 && LookStructuresTopRightRight[0].structureType == STRUCTURE_RAMPART && LookStructuresTopRightRight[0].my && LookStructuresTopRightRight[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresTopRightRight.length == 2 && LookStructuresTopRightRight[1].structureType == STRUCTURE_RAMPART && LookStructuresTopRightRight[1].my && LookStructuresTopRightRight[0].structureType == STRUCTURE_ROAD) &&

                                        (LookStructuresRightRight.length == 0 || LookStructuresRightRight.length == 1 && LookStructuresRightRight[0].structureType == STRUCTURE_ROAD ||
                                            LookStructuresRightRight.length == 1 && LookStructuresRightRight[0].structureType == STRUCTURE_RAMPART && LookStructuresRightRight[0].my ||
                                            LookStructuresRightRight.length == 2 && LookStructuresRightRight[0].structureType == STRUCTURE_RAMPART && LookStructuresRightRight[0].my && LookStructuresRightRight[1].structureType == STRUCTURE_ROAD ||
                                            LookStructuresRightRight.length == 2 && LookStructuresRightRight[1].structureType == STRUCTURE_RAMPART && LookStructuresRightRight[1].my && LookStructuresRightRight[0].structureType == STRUCTURE_ROAD) &&


                                    (LookStructuresTopRight.length == 0 || LookStructuresTopRight.length == 1 && LookStructuresTopRight[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresTopRight.length == 1 && LookStructuresTopRight[0].structureType == STRUCTURE_RAMPART && LookStructuresTopRight[0].my ||
                                        LookStructuresTopRight.length == 2 && LookStructuresTopRight[0].structureType == STRUCTURE_RAMPART && LookStructuresTopRight[0].my && LookStructuresTopRight[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresTopRight.length == 2 && LookStructuresTopRight[1].structureType == STRUCTURE_RAMPART && LookStructuresTopRight[1].my && LookStructuresTopRight[0].structureType == STRUCTURE_ROAD)) {
                                            allow = true;
                                    }
                                }

                            }
                            else if(direction == 3) {
                                if(creep.pos.x >= 48) {
                                    allow = true;
                                }
                                else {
                                    let LookStructuresRightRight:any = new RoomPosition(creep.pos.x + 2, creep.pos.y, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    let LookStructuresRightRightBottom:any = new RoomPosition(creep.pos.x + 2, creep.pos.y + 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    if(new RoomPosition(creep.pos.x + 2, creep.pos.y, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    new RoomPosition(creep.pos.x + 2, creep.pos.y + 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    (LookStructuresRightRight.length == 0 || LookStructuresRightRight.length == 1 && LookStructuresRightRight[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresRightRight.length == 1 && LookStructuresRightRight[0].structureType == STRUCTURE_RAMPART && LookStructuresRightRight[0].my ||
                                        LookStructuresRightRight.length == 2 && LookStructuresRightRight[0].structureType == STRUCTURE_RAMPART && LookStructuresRightRight[0].my && LookStructuresRightRight[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresRightRight.length == 2 && LookStructuresRightRight[1].structureType == STRUCTURE_RAMPART && LookStructuresRightRight[1].my && LookStructuresRightRight[0].structureType == STRUCTURE_ROAD) &&

                                    (LookStructuresRightRightBottom.length == 0 || LookStructuresRightRightBottom.length == 1 && LookStructuresRightRightBottom[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresRightRightBottom.length == 1 && LookStructuresRightRightBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresRightRightBottom[0].my ||
                                        LookStructuresRightRightBottom.length == 2 && LookStructuresRightRightBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresRightRightBottom[0].my && LookStructuresRightRightBottom[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresRightRightBottom.length == 2 && LookStructuresRightRightBottom[1].structureType == STRUCTURE_RAMPART && LookStructuresRightRightBottom[1].my && LookStructuresRightRightBottom[0].structureType == STRUCTURE_ROAD)) {
                                            allow = true;
                                    }
                                }
                            }
                            else if(direction == 4) {
                                if(creep.pos.x >= 48 || creep.pos.y >= 48) {
                                    allow = true;
                                }
                                else {
                                    let LookStructuresRightRightBottom:any = new RoomPosition(creep.pos.x + 2, creep.pos.y + 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    let LookStructuresRightBottomBottom:any = new RoomPosition(creep.pos.x + 1, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    let LookStructuresDoubleRightBottom:any = new RoomPosition(creep.pos.x + 2, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    if(new RoomPosition(creep.pos.x + 1, creep.pos.y + 2, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    new RoomPosition(creep.pos.x + 2, creep.pos.y + 2, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    new RoomPosition(creep.pos.x + 2, creep.pos.y + 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    (LookStructuresRightBottomBottom.length == 0 || LookStructuresRightBottomBottom.length == 1 && LookStructuresRightBottomBottom[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresRightBottomBottom.length == 1 && LookStructuresRightBottomBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresRightBottomBottom[0].my ||
                                        LookStructuresRightBottomBottom.length == 2 && LookStructuresRightBottomBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresRightBottomBottom[0].my && LookStructuresRightBottomBottom[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresRightBottomBottom.length == 2 && LookStructuresRightBottomBottom[1].structureType == STRUCTURE_RAMPART && LookStructuresRightBottomBottom[1].my && LookStructuresRightBottomBottom[0].structureType == STRUCTURE_ROAD) &&

                                        (LookStructuresRightRightBottom.length == 0 || LookStructuresRightRightBottom.length == 1 && LookStructuresRightRightBottom[0].structureType == STRUCTURE_ROAD ||
                                            LookStructuresRightRightBottom.length == 1 && LookStructuresRightRightBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresRightRightBottom[0].my ||
                                            LookStructuresRightRightBottom.length == 2 && LookStructuresRightRightBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresRightRightBottom[0].my && LookStructuresRightRightBottom[1].structureType == STRUCTURE_ROAD ||
                                            LookStructuresRightRightBottom.length == 2 && LookStructuresRightRightBottom[1].structureType == STRUCTURE_RAMPART && LookStructuresRightRightBottom[1].my && LookStructuresRightRightBottom[0].structureType == STRUCTURE_ROAD) &&

                                    (LookStructuresDoubleRightBottom.length == 0 || LookStructuresDoubleRightBottom.length == 1 && LookStructuresDoubleRightBottom[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresDoubleRightBottom.length == 1 && LookStructuresDoubleRightBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresDoubleRightBottom[0].my ||
                                        LookStructuresDoubleRightBottom.length == 2 && LookStructuresDoubleRightBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresDoubleRightBottom[0].my && LookStructuresDoubleRightBottom[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresDoubleRightBottom.length == 2 && LookStructuresDoubleRightBottom[1].structureType == STRUCTURE_RAMPART && LookStructuresDoubleRightBottom[1].my && LookStructuresDoubleRightBottom[0].structureType == STRUCTURE_ROAD)) {
                                            allow = true;
                                    }
                                }

                            }
                            else if(direction == 5) {
                                if(creep.pos.y >= 48) {
                                    allow = true;
                                }
                                else {
                                    let LookStructuresBottom:any = new RoomPosition(creep.pos.x, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    let LookStructuresBottomRight:any = new RoomPosition(creep.pos.x + 1, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    if(new RoomPosition(creep.pos.x, creep.pos.y + 2, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    new RoomPosition(creep.pos.x + 1, creep.pos.y + 2, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    (LookStructuresBottom.length == 0 || LookStructuresBottom.length == 1 && LookStructuresBottom[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresBottom.length == 1 && LookStructuresBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresBottom[0].my ||
                                        LookStructuresBottom.length == 2 && LookStructuresBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresBottom[0].my && LookStructuresBottom[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresBottom.length == 2 && LookStructuresBottom[1].structureType == STRUCTURE_RAMPART && LookStructuresBottom[1].my && LookStructuresBottom[0].structureType == STRUCTURE_ROAD) &&

                                    (LookStructuresBottomRight.length == 0 || LookStructuresBottomRight.length == 1 && LookStructuresBottomRight[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresBottomRight.length == 1 && LookStructuresBottomRight[0].structureType == STRUCTURE_RAMPART && LookStructuresBottomRight[0].my ||
                                        LookStructuresBottomRight.length == 2 && LookStructuresBottomRight[0].structureType == STRUCTURE_RAMPART && LookStructuresBottomRight[0].my && LookStructuresBottomRight[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresBottomRight.length == 2 && LookStructuresBottomRight[1].structureType == STRUCTURE_RAMPART && LookStructuresBottomRight[1].my && LookStructuresBottomRight[0].structureType == STRUCTURE_ROAD)) {
                                            allow = true;
                                    }
                                }

                            }
                            else if(direction == 6) {
                                if(creep.pos.y >= 48 || creep.pos.x <= 1) {
                                    allow = true;
                                }
                                else {
                                    let LookStructuresLeftBottom:any = new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    let LookStructuresBottomLeft:any = new RoomPosition(creep.pos.x - 1, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    let LookStructuresBottom:any = new RoomPosition(creep.pos.x, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    if(new RoomPosition(creep.pos.x - 1, creep.pos.y + 2, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    new RoomPosition(creep.pos.x, creep.pos.y + 2, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    (LookStructuresBottomLeft.length == 0 || LookStructuresBottomLeft.length == 1 && LookStructuresBottomLeft[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresBottomLeft.length == 1 && LookStructuresBottomLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresBottomLeft[0].my ||
                                        LookStructuresBottomLeft.length == 2 && LookStructuresBottomLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresBottomLeft[0].my && LookStructuresBottomLeft[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresBottomLeft.length == 2 && LookStructuresBottomLeft[1].structureType == STRUCTURE_RAMPART && LookStructuresBottomLeft[1].my && LookStructuresBottomLeft[0].structureType == STRUCTURE_ROAD) &&

                                        (LookStructuresLeftBottom.length == 0 || LookStructuresLeftBottom.length == 1 && LookStructuresLeftBottom[0].structureType == STRUCTURE_ROAD ||
                                            LookStructuresLeftBottom.length == 1 && LookStructuresLeftBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresLeftBottom[0].my ||
                                            LookStructuresLeftBottom.length == 2 && LookStructuresLeftBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresLeftBottom[0].my && LookStructuresLeftBottom[1].structureType == STRUCTURE_ROAD ||
                                            LookStructuresLeftBottom.length == 2 && LookStructuresLeftBottom[1].structureType == STRUCTURE_RAMPART && LookStructuresLeftBottom[1].my && LookStructuresLeftBottom[0].structureType == STRUCTURE_ROAD) &&

                                    (LookStructuresBottom.length == 0 || LookStructuresBottom.length == 1 && LookStructuresBottom[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresBottom.length == 1 && LookStructuresBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresBottom[0].my ||
                                        LookStructuresBottom.length == 2 && LookStructuresBottom[0].structureType == STRUCTURE_RAMPART && LookStructuresBottom[0].my && LookStructuresBottom[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresBottom.length == 2 && LookStructuresBottom[1].structureType == STRUCTURE_RAMPART && LookStructuresBottom[1].my && LookStructuresBottom[0].structureType == STRUCTURE_ROAD)) {
                                            allow = true;
                                    }
                                }

                            }
                            else if(direction == 7) {
                                if(creep.pos.x <= 1) {
                                    allow = true;
                                }
                                else {
                                    let LookStructuresLeft:any = new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    let LookStructuresBottomLeft:any = new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    if(new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    (LookStructuresLeft.length == 0 || LookStructuresLeft.length == 1 && LookStructuresLeft[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresLeft.length == 1 && LookStructuresLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresLeft[0].my ||
                                        LookStructuresLeft.length == 2 && LookStructuresLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresLeft[0].my && LookStructuresLeft[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresLeft.length == 2 && LookStructuresLeft[1].structureType == STRUCTURE_RAMPART && LookStructuresLeft[1].my && LookStructuresLeft[0].structureType == STRUCTURE_ROAD) &&

                                    (LookStructuresBottomLeft.length == 0 || LookStructuresBottomLeft.length == 1 && LookStructuresBottomLeft[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresBottomLeft.length == 1 && LookStructuresBottomLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresBottomLeft[0].my ||
                                        LookStructuresBottomLeft.length == 2 && LookStructuresBottomLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresBottomLeft[0].my && LookStructuresBottomLeft[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresBottomLeft.length == 2 && LookStructuresBottomLeft[1].structureType == STRUCTURE_RAMPART && LookStructuresBottomLeft[1].my && LookStructuresBottomLeft[0].structureType == STRUCTURE_ROAD)) {
                                            allow = true;
                                    }
                                }

                            }
                            else if(direction == 8) {
                                if(creep.pos.x <= 1 || creep.pos.y <= 1) {
                                    allow = true;
                                }
                                else {
                                    let LookStructuresTop:any = new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    let LookStructuresTopLeft:any = new RoomPosition(creep.pos.x - 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    let LookStructuresLeft:any = new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    if(new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    new RoomPosition(creep.pos.x - 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name).lookFor(LOOK_CREEPS).length == 0 &&
                                    (LookStructuresTop.length == 0 || LookStructuresTop.length == 1 && LookStructuresTop[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresTop.length == 1 && LookStructuresTop[0].structureType == STRUCTURE_RAMPART && LookStructuresTop[0].my ||
                                        LookStructuresTop.length == 2 && LookStructuresTop[0].structureType == STRUCTURE_RAMPART && LookStructuresTop[0].my && LookStructuresTop[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresTop.length == 2 && LookStructuresTop[1].structureType == STRUCTURE_RAMPART && LookStructuresTop[1].my && LookStructuresTop[0].structureType == STRUCTURE_ROAD) &&

                                    (LookStructuresLeft.length == 0 || LookStructuresLeft.length == 1 && LookStructuresLeft[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresLeft.length == 1 && LookStructuresLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresLeft[0].my ||
                                        LookStructuresLeft.length == 2 && LookStructuresLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresLeft[0].my && LookStructuresLeft[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresLeft.length == 2 && LookStructuresLeft[1].structureType == STRUCTURE_RAMPART && LookStructuresLeft[1].my && LookStructuresLeft[0].structureType == STRUCTURE_ROAD) &&

                                    (LookStructuresTopLeft.length == 0 || LookStructuresTopLeft.length == 1 && LookStructuresTopLeft[0].structureType == STRUCTURE_ROAD ||
                                        LookStructuresTopLeft.length == 1 && LookStructuresTopLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresTopLeft[0].my ||
                                        LookStructuresTopLeft.length == 2 && LookStructuresTopLeft[0].structureType == STRUCTURE_RAMPART && LookStructuresTopLeft[0].my && LookStructuresTopLeft[1].structureType == STRUCTURE_ROAD ||
                                        LookStructuresTopLeft.length == 2 && LookStructuresTopLeft[1].structureType == STRUCTURE_RAMPART && LookStructuresTopLeft[1].my && LookStructuresTopLeft[0].structureType == STRUCTURE_ROAD)) {
                                            allow = true;
                                    }
                                }

                            }
                        }

                        else {
                            allow = true;
                        }

                        if(allow) {
                            creep.memory.direction = direction
                            creep.move(direction);
                        }
                        else {
                            creep.memory.direction = false;
                        }

                        console.log('teeest')
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
        return 450/distance*7.5 // might be wrong but it'll do for now.
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
