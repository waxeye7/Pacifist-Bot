import {roomCallbackSquadA, roomCallbackSquadASwampCostSame, roomCallbackSquadGetReady} from "./SquadHelperFunctions";

// Game.rooms["E45N59"].memory.spawning_squad.status = true;


/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.memory.moving = false;

    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        let result = creep.Boost();
        if(!result) {
            return;
        }
    }

    const creepBody = creep.body.filter(function(part) {return part.type !== "move";});
    function getMostFrequent(arr) {
        const hashmap = arr.reduce( (acc, val) => {
         acc[val.type] = (acc[val.type] || 0 ) + 1
         return acc
      },{})
     return Object.keys(hashmap).reduce((a, b) => hashmap[a] > hashmap[b] ? a : b)
     }

    let creepBodyType = getMostFrequent(creepBody);
     creep.memory.bodyType = creepBodyType;


    let move_location = creep.memory.targetPosition;

    let route:any;

    if(creep.room.name != creep.memory.targetPosition.roomName) {

        if(creep.room.name != creep.memory.homeRoom) {
            if(creep.room.controller && !creep.room.controller.my && creep.room.controller.level > 4 && !_.includes(Memory.AvoidRooms, creep.room.name, 0)) {
                Memory.AvoidRooms.push(creep.room.name);
            }
        }

        if(creep.memory.route && creep.memory.route.length > 0 && creep.memory.route[0].room == creep.room.name) {
            creep.memory.route.shift();
        }
        if(!creep.memory.route || creep.memory.route == -2 || creep.memory.route.length == 0 || creep.memory.route.length == 1 && creep.memory.route[0].room == creep.room.name || creep.memory.route.length > 0 && creep.memory.route[creep.memory.route.length - 1].room !== creep.memory.targetPosition.roomName) {
            creep.memory.route = Game.map.findRoute(creep.room.name, creep.memory.targetPosition.roomName, {
                routeCallback(roomName:any, fromRoomName) {
                    if(Game.map.getRoomStatus(roomName).status !== "normal") {
                        return Infinity;
                    }
                    if(_.includes(Memory.AvoidRooms, roomName, 0) || Game.rooms[roomName] && Game.rooms[roomName].controller && Game.rooms[roomName].controller.my && (roomName !== creep.memory.targetPosition.roomName)) {
                        return 25;
                    }

                    if(roomName.length == 6) {
                        if(parseInt(roomName[1] + roomName[2]) % 10 == 0) {
                            return 2;
                        }
                        if(parseInt(roomName[4] + roomName[5]) % 10 == 0) {
                            return 2;
                        }
                    }
                    else if(roomName.length !== 6) {
                        let homeRoomNameX;
                        let homeRoomNameY;
                        if(!isNaN(roomName[2])) {
                            homeRoomNameX = parseInt(roomName[1] + roomName[2]);
                            homeRoomNameY = parseInt(roomName[4]);
                        }
                        else {
                            homeRoomNameX = parseInt(roomName[1]);
                            if(roomName.length == 4) {
                                homeRoomNameY = parseInt(roomName[3]);
                            }
                            else if(roomName.length == 5) {
                                homeRoomNameY = parseInt(roomName[3] + roomName[4]);
                            }
                        }

                        if(parseInt(homeRoomNameX) % 10 == 0) {
                            return 2;
                        }
                        if(parseInt(homeRoomNameY) % 10 == 0) {
                            return 2;
                        }
                    }

                    return 3;
            }});
        }


        if(creep.memory.route && creep.memory.route !== 2 && creep.memory.route.length > 1) {
            if(creep.memory.route.length == 2) {
                move_location = new RoomPosition(25, 25, creep.memory.route[0].room);
            }
            else if(creep.memory.route.length > 2) {
                if(creep.memory.route[0].exit == FIND_EXIT_LEFT && creep.memory.route[1].exit == FIND_EXIT_BOTTOM) {
                    move_location = new RoomPosition(25, 39, creep.memory.route[0].room);
                }
                else if(creep.memory.route[0].exit == FIND_EXIT_LEFT && creep.memory.route[1].exit == FIND_EXIT_TOP) {
                    move_location = new RoomPosition(25, 10, creep.memory.route[0].room);
                }
                else if(creep.memory.route[0].exit == FIND_EXIT_RIGHT && creep.memory.route[1].exit == FIND_EXIT_BOTTOM) {
                    move_location = new RoomPosition(25, 39, creep.memory.route[0].room);
                }
                else if(creep.memory.route[0].exit == FIND_EXIT_RIGHT && creep.memory.route[1].exit == FIND_EXIT_TOP) {
                    move_location = new RoomPosition(25, 10, creep.memory.route[0].room);
                }
                else if(creep.memory.route[0].exit == FIND_EXIT_TOP && creep.memory.route[1].exit == FIND_EXIT_LEFT) {
                    move_location = new RoomPosition(10, 25, creep.memory.route[0].room);
                }
                else if(creep.memory.route[0].exit == FIND_EXIT_TOP && creep.memory.route[1].exit == FIND_EXIT_RIGHT) {
                    move_location = new RoomPosition(39, 25, creep.memory.route[0].room);
                }
                else if(creep.memory.route[0].exit == FIND_EXIT_BOTTOM && creep.memory.route[1].exit == FIND_EXIT_LEFT) {
                    move_location = new RoomPosition(10, 25, creep.memory.route[0].room);
                }
                else if(creep.memory.route[0].exit == FIND_EXIT_BOTTOM && creep.memory.route[1].exit == FIND_EXIT_RIGHT) {
                    move_location = new RoomPosition(39, 25, creep.memory.route[0].room);
                }
                else {
                    move_location = new RoomPosition(25, 25, creep.memory.route[0].room);
                }

            }

        }

        if(!creep.memory.go && creep.memory.route && creep.memory.route !== 2 && creep.memory.route.length > 0) {

            if(creep.pos.x >= 3 && creep.pos.x <= 45 && creep.pos.y >= 3 && creep.pos.y <= 45) {
                creep.moveTo(new RoomPosition(25, 25, creep.memory.route[0].room),{range:23});
            }

            else if(creep.pos.x > 1 && creep.pos.x < 47 && creep.pos.y > 1 && creep.pos.y < 47) {

                let nearExit = creep.memory.route[0].room;

                let path = PathFinder.search(
                    creep.pos, {pos:new RoomPosition(25,25,nearExit), range:23},
                    {
                        plainCost: 1,
                        swampCost: 5,
                        maxOps: 1000,
                        maxRooms: 5,
                        roomCallback: (roomName) => roomCallbackSquadGetReady(roomName)
                    }
                    );
                    let pos = path.path[0];
                    let direction = creep.pos.getDirectionTo(pos);

                    creep.move(direction);
            }

            // else if((Game.time % 30 == 0 || Game.time % 30 == 1) && (creep.pos.x == 1 || creep.pos.x == 47 || creep.pos.y == 1 || creep.pos.y == 47)) {
            //     creep.moveTo(new RoomPosition(25,25,creep.room.name), {range:14});
            // }
        }
    }


    let structures = creep.room.find(FIND_STRUCTURES, {filter: building => !building.my && building.structureType !== STRUCTURE_CONTAINER && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTROLLER && building.structureType !== STRUCTURE_KEEPER_LAIR && building.structureType !== STRUCTURE_EXTRACTOR});
    let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
    let enemyCreepInRangeThree = creep.pos.findInRange(enemyCreeps, 3);
    let targetCreep;
    if(enemyCreepInRangeThree.length > 0) {
        let attack_able = false;
        for(let e_creep of enemyCreepInRangeThree) {


            if (getMostFrequent(e_creep.body) !== "heal" || creepBodyType !== "ranged_attack") {
                if (e_creep.pos.x == 0 || e_creep.pos.x == 49 || e_creep.pos.y == 0 || e_creep.pos.y == 49) {
                    attack_able = true;
                    targetCreep = e_creep;
                }
                else {

                    let lookStructuresOnEnemyCreep = e_creep.pos.lookFor(LOOK_STRUCTURES);
                    if (lookStructuresOnEnemyCreep.length > 0) {
                        if (lookStructuresOnEnemyCreep.length == 1 && lookStructuresOnEnemyCreep[0].structureType == STRUCTURE_ROAD ||
                            lookStructuresOnEnemyCreep.length == 1 && lookStructuresOnEnemyCreep[0].structureType == STRUCTURE_CONTAINER ||
                            lookStructuresOnEnemyCreep.length == 2 && lookStructuresOnEnemyCreep[0].structureType == STRUCTURE_ROAD && lookStructuresOnEnemyCreep[1].structureType == STRUCTURE_CONTAINER ||
                            lookStructuresOnEnemyCreep.length == 2 && lookStructuresOnEnemyCreep[0].structureType == STRUCTURE_CONTAINER && lookStructuresOnEnemyCreep[1].structureType == STRUCTURE_ROAD) {
                            attack_able = true;
                            targetCreep = e_creep;
                        }
                        for (let structure of lookStructuresOnEnemyCreep) {
                            if (structure.structureType == STRUCTURE_RAMPART) {
                                attack_able = false;
                            }
                        }
                    }
                    else {
                        attack_able = false;
                        targetCreep = e_creep;
                    }

                }
            }

        }

        if(targetCreep && (creepBodyType == "ranged_attack" || creepBodyType == "attack")) {
            creep.rangedAttack(targetCreep)
            creep.attack(targetCreep);

            if(creep.pos.isNearTo(targetCreep)) {
                creep.rangedMassAttack();
                creep.attack(targetCreep);
            }

            if(creep.memory.targetPosition.roomName == creep.room.name) {
                move_location = targetCreep.pos;
            }
        }


    }
    if(structures.length > 0) {
        let closestStructure = creep.pos.findClosestByRange(structures);
        if(creep.pos.getRangeTo(closestStructure) <= 3) {
            if(creepBodyType == "ranged_attack" && !targetCreep) {
                creep.rangedAttack(closestStructure);
            }
            else if(creepBodyType == "attack" && !targetCreep) {
                creep.attack(closestStructure);
            }
            else if(creepBodyType == "work") {
                creep.dismantle(closestStructure);
            }

        }
        if(creep.pos.isNearTo(closestStructure) && closestStructure.structureType !== STRUCTURE_WALL) {
            if(creepBodyType == "ranged_attack" && !targetCreep) {
                creep.rangedMassAttack();
            }
            else if(creepBodyType == "attack" && !targetCreep) {
                creep.attack(closestStructure);
            }
            else if(creepBodyType == "work") {
                creep.dismantle(closestStructure);
            }
        }
        if(creep.memory.targetPosition.roomName == creep.room.name && !targetCreep && closestStructure) {
            // if(closestStructure.structureType !== STRUCTURE_WALL) {
            move_location = closestStructure.pos;
            // }
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

    if(creep.room.name == creep.memory.targetPosition.roomName && creep.room.controller && !creep.room.controller.my && creep.room.controller.safeMode > 0) {
        creep.memory.targetPosition = new RoomPosition(25,25,creep.memory.homeRoom);
    }

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
                if(creep.memory.targetPosition.roomName == creep.room.name) {
                    creep.memory.lastHeal = target.id;
                }
            }
            else if(creep.hits < creep.hitsMax) {
                creep.heal(creep);
            }
            else {
                let lastHealCreep = Game.getObjectById(a.memory.lastHeal)
                if(lastHealCreep && creep.pos.isNearTo(lastHealCreep)) {
                    creep.heal(lastHealCreep)
                }
            }



            if(creep.room.name == creep.memory.targetPosition.roomName) {
                if(structures.length > 0) {

                    let nowall = structures.filter(function(building) {return building.structureType!=STRUCTURE_WALL && building.structureType!=STRUCTURE_CONTAINER && building.structureType!=STRUCTURE_ROAD && building.structureType!=STRUCTURE_RAMPART;});
                    if(nowall.length > 0) {
                        let closestBuilding = creep.pos.findClosestByRange(nowall);
                        // creep.memory.targetPosition = closestBuilding.pos;
                        move_location = creep.memory.targetPosition
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

                        if(totalTowerDamage > HealPower && lowest < creep.hitsMax && target && target.hits < target.hitsMax || target && target.hits <= target.hitsMax/2.1) {

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
            // somehow could do find closest building and make it the target but seems to hard (when have vision. hmm)
            else if(z && z.room.name == creep.memory.targetPosition.roomName) {
                if(structures.length > 0) {

                    let nowall = structures.filter(function(building) {return building.structureType!=STRUCTURE_WALL && building.structureType!=STRUCTURE_ROAD && building.structureType!=STRUCTURE_CONTAINER;});
                    if(nowall.length > 0) {
                        let closestBuilding = z.pos.findClosestByRange(nowall);
                        if(closestBuilding) {
                            creep.memory.targetPosition = closestBuilding.pos;
                            move_location = creep.memory.targetPosition
                        }

                    }
                }
            }
        }




        let range;

        if(move_location.roomName == creep.memory.targetPosition.roomName) {
            // range = 1
            // if(creep.pos.getRangeTo(creep.memory.targetPosition) <= 2) {
                range = 0
            // }
            // else {
            //     range = 1;
            // }
        }
        else if(creep.memory.route && creep.memory.route.length == 1) {
            range = 20;
        }
        else {
            range = 23;
        }


        if(a&&b&&y&&z && a.fatigue == 0 && b.fatigue == 0 && y.fatigue == 0 && z.fatigue == 0) {


            // if(a.pos.findInRange(enemyCreeps, 2).length > 0 || b.pos.findInRange(enemyCreeps, 2).length > 0 || y.pos.findInRange(enemyCreeps, 2).length > 0 || z.pos.findInRange(enemyCreeps, 2).length > 0) {
            //     if(creep.room.controller && !creep.room.controller.my && creep.room.controller.safeMode > 0) {
            //         console.log("room is safe mode so i wont care about the creeps in range because I can't kill them")
            //     }
            //     else {
            //         creep.memory.direction = false;
            //         return;
            //     }

            // }

            let path;
            if(creep.pos.x == 49 || creep.pos.y == 49) {
                path = PathFinder.search(
                    creep.pos, {pos:move_location, range:range},
                    {
                        plainCost: 1,
                        swampCost: 5,
                        maxOps: 3600,
                        maxRooms: 5,
                        roomCallback: (roomName) => roomCallbackSquadASwampCostSame(roomName)
                    }
                );
            }
            else {
                if(creep.memory.move_here_for_now && creep.memory.move_here_for_now.timer > 0) {
                    move_location = creep.memory.move_here_for_now.pos
                    creep.memory.move_here_for_now.timer -= 1
                }
                path = PathFinder.search(
                    creep.pos, {pos:move_location, range:range},
                    {
                        plainCost: 1,
                        swampCost: 5,
                        maxOps: 3600,
                        maxRooms: 5,
                        roomCallback: (roomName) => roomCallbackSquadA(roomName)
                    }
                );
            }



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
                        // if(Game.time%5 == 0) {
                        //     creep.move(LEFT)

                        // }
                }

                else {

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
                        let allow = false;
                        if(creep.pos.x <= 47 && creep.pos.x >= 2 && creep.pos.y <= 47 && creep.pos.y >= 2) {
                            if(direction == 1) {

                                let LookStructuresTop:any = new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                LookStructuresTop = LookStructuresTop.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

                                let LookStructuresTopRight:any = new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                LookStructuresTopRight = LookStructuresTopRight.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

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
                                LookStructuresRightRight = LookStructuresRightRight.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

                                let LookStructuresTopRight:any = new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                LookStructuresTopRight = LookStructuresTopRight.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

                                let LookStructuresTopRightRight:any = new RoomPosition(creep.pos.x + 2, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                LookStructuresTopRightRight = LookStructuresTopRightRight.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

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
                                LookStructuresRightRight = LookStructuresRightRight.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

                                let LookStructuresRightRightBottom:any = new RoomPosition(creep.pos.x + 2, creep.pos.y + 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                LookStructuresRightRightBottom = LookStructuresRightRightBottom.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

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
                                LookStructuresRightRightBottom = LookStructuresRightRightBottom.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

                                let LookStructuresRightBottomBottom:any = new RoomPosition(creep.pos.x + 1, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                LookStructuresRightBottomBottom = LookStructuresRightBottomBottom.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

                                let LookStructuresDoubleRightBottom:any = new RoomPosition(creep.pos.x + 2, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                LookStructuresDoubleRightBottom = LookStructuresDoubleRightBottom.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

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
                                LookStructuresBottom = LookStructuresBottom.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

                                let LookStructuresBottomRight:any = new RoomPosition(creep.pos.x + 1, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                LookStructuresBottomRight = LookStructuresBottomRight.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

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
                                LookStructuresLeftBottom = LookStructuresLeftBottom.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

                                let LookStructuresBottomLeft:any = new RoomPosition(creep.pos.x - 1, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                LookStructuresBottomLeft = LookStructuresBottomLeft.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

                                let LookStructuresBottom:any = new RoomPosition(creep.pos.x, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                LookStructuresBottom = LookStructuresBottom.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

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
                                LookStructuresLeft = LookStructuresLeft.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

                                let LookStructuresBottomLeft:any = new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                LookStructuresBottomLeft = LookStructuresBottomLeft.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

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
                                LookStructuresTop = LookStructuresTop.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

                                let LookStructuresTopLeft:any = new RoomPosition(creep.pos.x - 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                LookStructuresTopLeft = LookStructuresTopLeft.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

                                let LookStructuresLeft:any = new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name).lookFor(LOOK_STRUCTURES);
                                LookStructuresLeft = LookStructuresLeft.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});

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
                                    LookStructuresTop = LookStructuresTop.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
                                    let LookStructuresTopRight:any = new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    LookStructuresTopRight = LookStructuresTopRight.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
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
                                    LookStructuresRightRight = LookStructuresRightRight.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
                                    let LookStructuresTopRight:any = new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    LookStructuresTopRight = LookStructuresTopRight.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
                                    let LookStructuresTopRightRight:any = new RoomPosition(creep.pos.x + 2, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    LookStructuresTopRightRight = LookStructuresTopRightRight.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
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
                                    LookStructuresRightRight = LookStructuresRightRight.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
                                    let LookStructuresRightRightBottom:any = new RoomPosition(creep.pos.x + 2, creep.pos.y + 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    LookStructuresRightRightBottom = LookStructuresRightRightBottom.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
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
                                    LookStructuresRightRightBottom = LookStructuresRightRightBottom.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
                                    let LookStructuresRightBottomBottom:any = new RoomPosition(creep.pos.x + 1, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    LookStructuresRightBottomBottom = LookStructuresRightBottomBottom.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
                                    let LookStructuresDoubleRightBottom:any = new RoomPosition(creep.pos.x + 2, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    LookStructuresDoubleRightBottom = LookStructuresDoubleRightBottom.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
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
                                    LookStructuresBottom = LookStructuresBottom.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
                                    let LookStructuresBottomRight:any = new RoomPosition(creep.pos.x + 1, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    LookStructuresBottomRight = LookStructuresBottomRight.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
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
                                    LookStructuresLeftBottom = LookStructuresLeftBottom.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
                                    let LookStructuresBottomLeft:any = new RoomPosition(creep.pos.x - 1, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    LookStructuresBottomLeft = LookStructuresBottomLeft.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
                                    let LookStructuresBottom:any = new RoomPosition(creep.pos.x, creep.pos.y + 2, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    LookStructuresBottom = LookStructuresBottom.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
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
                                    LookStructuresLeft = LookStructuresLeft.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
                                    let LookStructuresBottomLeft:any = new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    LookStructuresBottomLeft = LookStructuresBottomLeft.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
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
                                    LookStructuresTop = LookStructuresTop.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
                                    let LookStructuresTopLeft:any = new RoomPosition(creep.pos.x - 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    LookStructuresTopLeft = LookStructuresTopLeft.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
                                    let LookStructuresLeft:any = new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name).lookFor(LOOK_STRUCTURES);
                                    LookStructuresLeft = LookStructuresLeft.filter(function(building) {return building.structureType !== STRUCTURE_CONTAINER});
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
                        if(!allow && creep.pos.x <= 46 && creep.pos.x >= 2 && creep.pos.y <= 46 && creep.pos.y >= 2) {
                            if(direction == 1) {

                                let Position = new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }

                            }

                            else if(direction == 2) {

                                let Position = new RoomPosition(creep.pos.x + 2, creep.pos.y - 1, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                let Position3 = new RoomPosition(creep.pos.x + 2, creep.pos.y, creep.room.name);
                                let lookForStructuresHere3 = Position3.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }
                                else if(lookForStructuresHere3.length > 0 && lookForStructuresHere3[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere3[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere3[0].id;
                                }

                            }

                            else if(direction == 3) {

                                let Position = new RoomPosition(creep.pos.x + 2, creep.pos.y, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x + 2, creep.pos.y + 1, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }

                            }

                            else if(direction == 4) {

                                let Position = new RoomPosition(creep.pos.x + 2, creep.pos.y + 1, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x + 2, creep.pos.y + 2, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                let Position3 = new RoomPosition(creep.pos.x + 1, creep.pos.y + 2, creep.room.name);
                                let lookForStructuresHere3 = Position3.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }
                                else if(lookForStructuresHere3.length > 0 && lookForStructuresHere3[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere3[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere3[0].id;
                                }

                            }

                            else if(direction == 5) {

                                let Position = new RoomPosition(creep.pos.x + 1, creep.pos.y + 2, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x, creep.pos.y + 2, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }

                            }

                            else if(direction == 6) {

                                let Position = new RoomPosition(creep.pos.x, creep.pos.y + 2, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x - 1, creep.pos.y + 2, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                let Position3 = new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name);
                                let lookForStructuresHere3 = Position3.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }
                                else if(lookForStructuresHere3.length > 0 && lookForStructuresHere3[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere3[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere3[0].id;
                                }

                            }

                            else if(direction == 7) {

                                let Position = new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x- 1, creep.pos.y + 1, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }

                            }

                            else if(direction == 8) {

                                let Position = new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x - 1, creep.pos.y - 1, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                let Position3 = new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name);
                                let lookForStructuresHere3 = Position3.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }
                                else if(lookForStructuresHere3.length > 0 && lookForStructuresHere3[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere3[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere3[0].id;
                                }

                            }

                        }
                        else if(!allow && (creep.pos.x == 48 || creep.pos.x == 47) && creep.pos.y >= 2 && creep.pos.y <= 46) {
                            if(direction == 6) {
                                let Position = new RoomPosition(creep.pos.x, creep.pos.y + 2, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x - 1, creep.pos.y + 2, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                let Position3 = new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name);
                                let lookForStructuresHere3 = Position3.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }
                                else if(lookForStructuresHere3.length > 0 && lookForStructuresHere3[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere3[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere3[0].id;
                                }
                            }
                            else if(direction == 7) {

                                let Position = new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x- 1, creep.pos.y + 1, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }
                            }
                            else if(direction == 8) {
                                let Position = new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x - 1, creep.pos.y - 1, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                let Position3 = new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name);
                                let lookForStructuresHere3 = Position3.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }
                                else if(lookForStructuresHere3.length > 0 && lookForStructuresHere3[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere3[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere3[0].id;
                                }
                            }
                        }
                        else if(!allow && (creep.pos.x == 0 || creep.pos.x == 1) && creep.pos.y >= 2 && creep.pos.y <= 46) {
                            if(direction == 2) {

                                let Position = new RoomPosition(creep.pos.x + 2, creep.pos.y - 1, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                let Position3 = new RoomPosition(creep.pos.x + 2, creep.pos.y, creep.room.name);
                                let lookForStructuresHere3 = Position3.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }
                                else if(lookForStructuresHere3.length > 0 && lookForStructuresHere3[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere3[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere3[0].id;
                                }

                            }

                            else if(direction == 3) {

                                let Position = new RoomPosition(creep.pos.x + 2, creep.pos.y, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x + 2, creep.pos.y + 1, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }

                            }

                            else if(direction == 4) {

                                let Position = new RoomPosition(creep.pos.x + 2, creep.pos.y + 1, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x + 2, creep.pos.y + 2, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                let Position3 = new RoomPosition(creep.pos.x + 1, creep.pos.y + 2, creep.room.name);
                                let lookForStructuresHere3 = Position3.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }
                                else if(lookForStructuresHere3.length > 0 && lookForStructuresHere3[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere3[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere3[0].id;
                                }

                            }
                        }
                        else if(!allow && (creep.pos.y == 47 || creep.pos.y == 48) && creep.pos.x >= 2 && creep.pos.x <= 46) {
                            if(direction == 8) {

                                let Position = new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x - 1, creep.pos.y - 1, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                let Position3 = new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name);
                                let lookForStructuresHere3 = Position3.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }
                                else if(lookForStructuresHere3.length > 0 && lookForStructuresHere3[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere3[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere3[0].id;
                                }

                            }
                            else if(direction == 1) {

                                let Position = new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }

                            }

                            else if(direction == 2) {

                                let Position = new RoomPosition(creep.pos.x + 2, creep.pos.y - 1, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                let Position3 = new RoomPosition(creep.pos.x + 2, creep.pos.y, creep.room.name);
                                let lookForStructuresHere3 = Position3.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }
                                else if(lookForStructuresHere3.length > 0 && lookForStructuresHere3[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere3[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere3[0].id;
                                }

                            }
                        }
                        else if(!allow && (creep.pos.y == 0 || creep.pos.y == 1) && creep.pos.x >= 2 && creep.pos.x <= 46) {
                            if(direction == 4) {

                                let Position = new RoomPosition(creep.pos.x + 2, creep.pos.y + 1, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x + 2, creep.pos.y + 2, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                let Position3 = new RoomPosition(creep.pos.x + 1, creep.pos.y + 2, creep.room.name);
                                let lookForStructuresHere3 = Position3.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }
                                else if(lookForStructuresHere3.length > 0 && lookForStructuresHere3[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere3[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere3[0].id;
                                }

                            }

                            else if(direction == 5) {

                                let Position = new RoomPosition(creep.pos.x + 1, creep.pos.y + 2, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x, creep.pos.y + 2, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }

                            }

                            else if(direction == 6) {

                                let Position = new RoomPosition(creep.pos.x, creep.pos.y + 2, creep.room.name);
                                let lookForStructuresHere = Position.lookFor(LOOK_STRUCTURES);

                                let Position2 = new RoomPosition(creep.pos.x - 1, creep.pos.y + 2, creep.room.name);
                                let lookForStructuresHere2 = Position2.lookFor(LOOK_STRUCTURES);

                                let Position3 = new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name);
                                let lookForStructuresHere3 = Position3.lookFor(LOOK_STRUCTURES);

                                if(lookForStructuresHere.length > 0 && lookForStructuresHere[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere[0].id;
                                }
                                else if(lookForStructuresHere2.length > 0 && lookForStructuresHere2[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere2[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere2[0].id;
                                }
                                else if(lookForStructuresHere3.length > 0 && lookForStructuresHere3[0].structureType !== STRUCTURE_CONTAINER && lookForStructuresHere3[0].structureType !== STRUCTURE_ROAD) {
                                    creep.memory.target = lookForStructuresHere3[0].id;
                                }

                            }
                        }
                        else {
                            creep.memory.target = false;
                        }

                        if(creep.memory.target) {
                            let targetStructure:any = Game.getObjectById(creep.memory.target);
                            if(targetStructure && (targetStructure.structureType == STRUCTURE_WALL || targetStructure.structureType == STRUCTURE_CONTAINER ||
                                targetStructure.structureType == STRUCTURE_ROAD || creep.pos.getRangeTo(targetStructure) > 1)) {
                                if(creepBodyType == "ranged_attack" && !targetCreep) {
                                    creep.rangedAttack(targetStructure);
                                }
                                else if(creepBodyType == "attack" && !targetCreep) {
                                    creep.attack(targetStructure);
                                }
                                else if(creepBodyType == "work") {
                                    creep.dismantle(targetStructure);
                                }
                            }
                            else {
                                if(creepBodyType == "ranged_attack" && !targetCreep) {
                                    creep.rangedMassAttack();
                                }
                                else if(creepBodyType == "attack" && !targetCreep) {
                                    creep.attack(targetStructure);
                                }
                                else if(creepBodyType == "work") {
                                    creep.dismantle(targetStructure);
                                }
                            }
                        }



                        if(allow) {
                            creep.memory.direction = direction
                            creep.move(direction);
                        }
                        else {
                            creep.memory.direction = false;


                            if(aliveCreeps.length == 4) {

                                let leaderMemory = a.memory;
                                let nonLeaderMemoryB = b.memory;
                                let nonLeaderMemoryY = y.memory;
                                let nonLeaderMemoryZ = z.memory;

                                if((direction == 1 || direction == 2 || direction == 8) && creepBodyType == "heal" && b.memory.bodyType == "heal") {
                                    leaderMemory.squad.a = y.id;
                                    leaderMemory.squad.y = a.id;
                                    leaderMemory.squad.b = z.id;
                                    leaderMemory.squad.z = b.id;

                                    nonLeaderMemoryB.squad.a = y.id;
                                    nonLeaderMemoryB.squad.y = a.id;
                                    nonLeaderMemoryB.squad.b = z.id;
                                    nonLeaderMemoryB.squad.z = b.id;

                                    nonLeaderMemoryY.squad.a = y.id;
                                    nonLeaderMemoryY.squad.y = a.id;
                                    nonLeaderMemoryY.squad.b = z.id;
                                    nonLeaderMemoryY.squad.z = b.id;

                                    nonLeaderMemoryZ.squad.a = y.id;
                                    nonLeaderMemoryZ.squad.y = a.id;
                                    nonLeaderMemoryZ.squad.b = z.id;
                                    nonLeaderMemoryZ.squad.z = b.id;


                                    a.memory = nonLeaderMemoryY;
                                    b.memory = nonLeaderMemoryZ;
                                    y.memory = leaderMemory;
                                    z.memory = nonLeaderMemoryB;

                                    a.move(BOTTOM);
                                    y.move(TOP);
                                    b.move(BOTTOM);
                                    z.move(TOP);
                                }
                                else if(direction == 1 && (y.memory.bodyType == "ranged_attack" || y.memory.bodyType == "work" || y.memory.bodyType == "attack")) {
                                    leaderMemory.squad.y = b.id;
                                    leaderMemory.squad.b = y.id;

                                    nonLeaderMemoryB.squad.b = y.id;
                                    nonLeaderMemoryB.squad.y = b.id;

                                    nonLeaderMemoryY.squad.b = y.id;
                                    nonLeaderMemoryY.squad.y = b.id;

                                    nonLeaderMemoryZ.squad.b = y.id;
                                    nonLeaderMemoryZ.squad.y = b.id;


                                    a.memory = leaderMemory;
                                    b.memory = nonLeaderMemoryY;
                                    y.memory = nonLeaderMemoryB;
                                    z.memory = nonLeaderMemoryZ;

                                    y.move(TOP_RIGHT);
                                    b.move(BOTTOM_LEFT);
                                }
                                else if(direction == 1 && (z.memory.bodyType == "ranged_attack" || z.memory.bodyType == "work" || z.memory.bodyType == "attack")) {
                                    leaderMemory.squad.z = a.id;
                                    leaderMemory.squad.a = z.id;

                                    nonLeaderMemoryB.squad.z = a.id;
                                    nonLeaderMemoryB.squad.a = z.id;

                                    nonLeaderMemoryY.squad.z = a.id;
                                    nonLeaderMemoryY.squad.a = z.id;

                                    nonLeaderMemoryZ.squad.z = a.id;
                                    nonLeaderMemoryZ.squad.a = z.id;


                                    a.memory = nonLeaderMemoryZ;
                                    b.memory = nonLeaderMemoryB;
                                    y.memory = nonLeaderMemoryY;
                                    z.memory = leaderMemory;

                                    a.move(BOTTOM_RIGHT);
                                    z.move(TOP_LEFT);
                                }

                                else if((direction == 4 || direction == 5 || direction == 6) && (creepBodyType == "ranged_attack" || creepBodyType == "work" || creepBodyType == "attack") && (b.memory.bodyType == "ranged_attack" || b.memory.bodyType == "work" || b.memory.bodyType == "attack")) {
                                    leaderMemory.squad.a = y.id;
                                    leaderMemory.squad.y = a.id;
                                    leaderMemory.squad.b = z.id;
                                    leaderMemory.squad.z = b.id;

                                    nonLeaderMemoryB.squad.a = y.id;
                                    nonLeaderMemoryB.squad.y = a.id;
                                    nonLeaderMemoryB.squad.b = z.id;
                                    nonLeaderMemoryB.squad.z = b.id;

                                    nonLeaderMemoryY.squad.a = y.id;
                                    nonLeaderMemoryY.squad.y = a.id;
                                    nonLeaderMemoryY.squad.b = z.id;
                                    nonLeaderMemoryY.squad.z = b.id;

                                    nonLeaderMemoryZ.squad.a = y.id;
                                    nonLeaderMemoryZ.squad.y = a.id;
                                    nonLeaderMemoryZ.squad.b = z.id;
                                    nonLeaderMemoryZ.squad.z = b.id;

                                    a.memory = nonLeaderMemoryY;
                                    b.memory = nonLeaderMemoryZ;
                                    y.memory = leaderMemory;
                                    z.memory = nonLeaderMemoryB;

                                    a.move(BOTTOM);
                                    y.move(TOP);
                                    b.move(BOTTOM);
                                    z.move(TOP);
                                }
                                else if(direction == 5 && (creepBodyType == "ranged_attack" || creepBodyType == "work" || creepBodyType == "attack")) {
                                    leaderMemory.squad.a = z.id;
                                    leaderMemory.squad.z = a.id;

                                    nonLeaderMemoryB.squad.a = z.id;
                                    nonLeaderMemoryB.squad.z = a.id;

                                    nonLeaderMemoryY.squad.a = z.id;
                                    nonLeaderMemoryY.squad.z = a.id;

                                    nonLeaderMemoryZ.squad.a = z.id;
                                    nonLeaderMemoryZ.squad.z = a.id;


                                    a.memory = nonLeaderMemoryZ;
                                    b.memory = nonLeaderMemoryB;
                                    y.memory = nonLeaderMemoryY;
                                    z.memory = leaderMemory;

                                    a.move(BOTTOM_RIGHT);
                                    z.move(TOP_LEFT);
                                }
                                else if(direction == 5 && (b.memory.bodyType == "ranged_attack" || b.memory.bodyType == "work" || b.memory.bodyType == "attack")) {
                                    leaderMemory.squad.b = y.id;
                                    leaderMemory.squad.y = b.id;

                                    nonLeaderMemoryB.squad.b = y.id;
                                    nonLeaderMemoryB.squad.y = b.id;

                                    nonLeaderMemoryY.squad.b = y.id;
                                    nonLeaderMemoryY.squad.y = b.id;

                                    nonLeaderMemoryZ.squad.b = y.id;
                                    nonLeaderMemoryZ.squad.y = b.id;


                                    a.memory = leaderMemory;
                                    b.memory = nonLeaderMemoryY;
                                    y.memory = nonLeaderMemoryB;
                                    z.memory = nonLeaderMemoryZ;

                                    b.move(BOTTOM_LEFT);
                                    y.move(TOP_RIGHT);
                                }


                                else if(direction == 3 && (creepBodyType == "ranged_attack" || creepBodyType == "work" || creepBodyType == "attack") && (y.memory.bodyType == "ranged_attack" || y.memory.bodyType == "work" || y.memory.bodyType == "attack")) {
                                    leaderMemory.squad.a = b.id;
                                    leaderMemory.squad.b = a.id;
                                    leaderMemory.squad.y = z.id;
                                    leaderMemory.squad.z = y.id;

                                    nonLeaderMemoryB.squad.a = b.id;
                                    nonLeaderMemoryB.squad.b = a.id;
                                    nonLeaderMemoryB.squad.y = z.id;
                                    nonLeaderMemoryB.squad.z = y.id;

                                    nonLeaderMemoryY.squad.a = b.id;
                                    nonLeaderMemoryY.squad.b = a.id;
                                    nonLeaderMemoryY.squad.y = z.id;
                                    nonLeaderMemoryY.squad.z = y.id;

                                    nonLeaderMemoryZ.squad.a = b.id;
                                    nonLeaderMemoryZ.squad.b = a.id;
                                    nonLeaderMemoryZ.squad.y = z.id;
                                    nonLeaderMemoryZ.squad.z = y.id;

                                    a.memory = nonLeaderMemoryB;
                                    b.memory = leaderMemory;
                                    y.memory = nonLeaderMemoryZ;
                                    z.memory = nonLeaderMemoryY;

                                    a.move(RIGHT);
                                    y.move(RIGHT);
                                    b.move(LEFT);
                                    z.move(LEFT);
                                }

                                else if(direction == 3 && (y.memory.bodyType == "ranged_attack" || y.memory.bodyType == "work" || y.memory.bodyType == "attack")) {
                                    leaderMemory.squad.y = b.id;
                                    leaderMemory.squad.b = y.id;

                                    nonLeaderMemoryB.squad.y = b.id;
                                    nonLeaderMemoryB.squad.b = y.id;

                                    nonLeaderMemoryY.squad.y = b.id;
                                    nonLeaderMemoryY.squad.b = y.id;

                                    nonLeaderMemoryZ.squad.y = b.id;
                                    nonLeaderMemoryZ.squad.b = y.id;

                                    a.memory = leaderMemory;
                                    b.memory = nonLeaderMemoryY;
                                    y.memory = nonLeaderMemoryB;
                                    z.memory = nonLeaderMemoryZ;

                                    y.move(TOP_RIGHT);
                                    b.move(BOTTOM_LEFT);
                                }

                                else if(direction == 3 && (creepBodyType == "ranged_attack" || creepBodyType == "work" || creepBodyType == "attack")) {
                                    leaderMemory.squad.a = z.id;
                                    leaderMemory.squad.z = a.id;

                                    nonLeaderMemoryB.squad.a = z.id;
                                    nonLeaderMemoryB.squad.z = a.id;

                                    nonLeaderMemoryY.squad.a = z.id;
                                    nonLeaderMemoryY.squad.z = a.id;

                                    nonLeaderMemoryZ.squad.a = z.id;
                                    nonLeaderMemoryZ.squad.z = a.id;

                                    a.memory = nonLeaderMemoryZ;
                                    b.memory = nonLeaderMemoryB;
                                    y.memory = nonLeaderMemoryY;
                                    z.memory = leaderMemory;

                                    a.move(BOTTOM_RIGHT);
                                    z.move(TOP_LEFT);
                                }

                                else if(direction == 7 && (b.memory.bodyType == "ranged_attack" || b.memory.bodyType == "work" || b.memory.bodyType == "attack") && (z.memory.bodyType == "ranged_attack" || z.memory.bodyType == "work" || z.memory.bodyType == "attack")) {
                                    leaderMemory.squad.a = b.id;
                                    leaderMemory.squad.b = a.id;
                                    leaderMemory.squad.y = z.id;
                                    leaderMemory.squad.z = y.id;

                                    nonLeaderMemoryB.squad.a = b.id;
                                    nonLeaderMemoryB.squad.b = a.id;
                                    nonLeaderMemoryB.squad.y = z.id;
                                    nonLeaderMemoryB.squad.z = y.id;

                                    nonLeaderMemoryY.squad.a = b.id;
                                    nonLeaderMemoryY.squad.b = a.id;
                                    nonLeaderMemoryY.squad.y = z.id;
                                    nonLeaderMemoryY.squad.z = y.id;

                                    nonLeaderMemoryZ.squad.a = b.id;
                                    nonLeaderMemoryZ.squad.b = a.id;
                                    nonLeaderMemoryZ.squad.y = z.id;
                                    nonLeaderMemoryZ.squad.z = y.id;

                                    a.memory = nonLeaderMemoryB;
                                    b.memory = leaderMemory;
                                    y.memory = nonLeaderMemoryZ;
                                    z.memory = nonLeaderMemoryY;

                                    a.move(RIGHT);
                                    y.move(RIGHT);
                                    b.move(LEFT);
                                    z.move(LEFT);
                                }

                                else if(direction == 7 && (b.memory.bodyType == "ranged_attack" || b.memory.bodyType == "work" || b.memory.bodyType == "attack")) {
                                    leaderMemory.squad.y = b.id;
                                    leaderMemory.squad.b = y.id;

                                    nonLeaderMemoryB.squad.y = b.id;
                                    nonLeaderMemoryB.squad.b = y.id;

                                    nonLeaderMemoryY.squad.y = b.id;
                                    nonLeaderMemoryY.squad.b = y.id;

                                    nonLeaderMemoryZ.squad.y = b.id;
                                    nonLeaderMemoryZ.squad.b = y.id;

                                    a.memory = leaderMemory;
                                    b.memory = nonLeaderMemoryY;
                                    y.memory = nonLeaderMemoryB;
                                    z.memory = nonLeaderMemoryZ;

                                    y.move(TOP_RIGHT);
                                    b.move(BOTTOM_LEFT);
                                }

                                else if(direction == 7 && (z.memory.bodyType == "ranged_attack" || z.memory.bodyType == "work" || z.memory.bodyType == "attack")) {
                                    leaderMemory.squad.a = z.id;
                                    leaderMemory.squad.z = a.id;

                                    nonLeaderMemoryB.squad.a = z.id;
                                    nonLeaderMemoryB.squad.z = a.id;

                                    nonLeaderMemoryY.squad.a = z.id;
                                    nonLeaderMemoryY.squad.z = a.id;

                                    nonLeaderMemoryZ.squad.a = z.id;
                                    nonLeaderMemoryZ.squad.z = a.id;

                                    a.memory = nonLeaderMemoryZ;
                                    b.memory = nonLeaderMemoryB;
                                    y.memory = nonLeaderMemoryY;
                                    z.memory = leaderMemory;

                                    a.move(BOTTOM_RIGHT);
                                    z.move(TOP_LEFT);
                                }

                                // else if(direction == 3 && ) {
                                //     leaderMemory.squad.a = b.id;
                                //     leaderMemory.squad.b = a.id;
                                //     leaderMemory.squad.y = z.id;
                                //     leaderMemory.squad.z = y.id;

                                //     nonLeaderMemory.squad.a = b.id;
                                //     nonLeaderMemory.squad.b = a.id;
                                //     nonLeaderMemory.squad.y = z.id;
                                //     nonLeaderMemory.squad.z = y.id;

                                //     a.memory = nonLeaderMemory;
                                //     a.memory.role = "SquadCreepB"
                                //     b.memory = leaderMemory;
                                //     b.memory.role = "SquadCreepA"
                                //     y.memory = nonLeaderMemory;
                                //     y.memory.role = "SquadCreepZ"
                                //     z.memory = nonLeaderMemory;
                                //     z.memory.role = "SquadCreepY"
                                // }
                            }


                        }
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
        return 450/distance*8.4 // might be wrong but it'll do for now.
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
