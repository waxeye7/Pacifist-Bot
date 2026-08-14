import {roomCallbackSquadA, roomCallbackSquadASwampCostSame, roomCallbackSquadGetReady} from "./SquadHelperFunctions";
import {splitQuadToDuos} from "./SquadDuo";

// tiles (relative to the leader) the 2x2 quad additionally needs clear to step one square in each direction
const QUAD_CLEARANCE:any = {
    1: [[0,-1],[1,-1]],
    2: [[1,-1],[2,-1],[2,0]],
    3: [[2,0],[2,1]],
    4: [[2,1],[1,2],[2,2]],
    5: [[0,2],[1,2]],
    6: [[-1,1],[-1,2],[0,2]],
    7: [[-1,0],[-1,1]],
    8: [[0,-1],[-1,-1],[-1,0]],
};

// at the room edge these directions are waved through without tile checks (crossing an exit)
const QUAD_EDGE_SHORTCUT:any = {
    1: (pos:any) => pos.y <= 1,
    2: (pos:any) => pos.y <= 1 || pos.x >= 48,
    3: (pos:any) => pos.x >= 48,
    4: (pos:any) => pos.x >= 48 || pos.y >= 48,
    5: (pos:any) => pos.y >= 48,
    6: (pos:any) => pos.y >= 48 || pos.x <= 1,
    7: (pos:any) => pos.x <= 1,
    8: (pos:any) => pos.x <= 1 || pos.y <= 1,
};

// a tile is quad-passable if it holds no creep and nothing but roads, containers and own ramparts
const tileFreeForQuad = function (x:number, y:number, roomName:string) {
    if(x < 0 || x > 49 || y < 0 || y > 49) {
        return true;
    }
    const pos = new RoomPosition(x, y, roomName);
    if(pos.lookFor(LOOK_CREEPS).length > 0) {
        return false;
    }
    return pos.lookFor(LOOK_STRUCTURES).every(function(structure:any) {
        return structure.structureType == STRUCTURE_ROAD ||
               structure.structureType == STRUCTURE_CONTAINER ||
               (structure.structureType == STRUCTURE_RAMPART && structure.my);
    });
};

const quadClearanceFree = function (creep:any, direction:any) {
    const tiles = QUAD_CLEARANCE[direction];
    if(!tiles) {
        return false;
    }
    return tiles.every(function(offset:any) {
        return tileFreeForQuad(creep.pos.x + offset[0], creep.pos.y + offset[1], creep.room.name);
    });
};

// swap the given slot pairs: every member's squad id-map is updated, then the paired
// creeps exchange whole memory objects (identity, incl. role, stays with the slot,
// only the bodies trade places), then the paired creeps physically swap positions
const rotateSquad = function (a:any, b:any, y:any, z:any, pairs:any, moves:any) {
    const members:any = {a: a, b: b, y: y, z: z};
    const memories:any = {a: a.memory, b: b.memory, y: y.memory, z: z.memory};

    for(const slot of ["a", "b", "y", "z"]) {
        for(const pair of pairs) {
            memories[slot].squad[pair[0]] = members[pair[1]].id;
            memories[slot].squad[pair[1]] = members[pair[0]].id;
        }
    }
    for(const pair of pairs) {
        members[pair[0]].memory = memories[pair[1]];
        members[pair[1]].memory = memories[pair[0]];
    }
    for(const slot in moves) {
        members[slot].move(moves[slot]);
    }
};

// bring a damage body (or shield a heal body) to the side an adjacent enemy is on
const performSquadRotation = function (a:any, b:any, y:any, z:any, dir:any, creepBodyType:any) {
    const atk = function (bodyType:any) { return bodyType == "ranged_attack" || bodyType == "work" || bodyType == "attack"; };
    const btA = creepBodyType;
    const btB = b.memory.bodyType;
    const btY = y.memory.bodyType;
    const btZ = z.memory.bodyType;

    const VERTICAL_FLIP:any = [["a","y"],["b","z"]];
    const HORIZONTAL_FLIP:any = [["a","b"],["y","z"]];
    const FLIP_V_MOVES:any = {a: BOTTOM, y: TOP, b: BOTTOM, z: TOP};
    const FLIP_H_MOVES:any = {a: RIGHT, y: RIGHT, b: LEFT, z: LEFT};
    const SWAP_YB:any = [["y","b"]];
    const SWAP_YB_MOVES:any = {y: TOP_RIGHT, b: BOTTOM_LEFT};
    const SWAP_AZ:any = [["a","z"]];
    const SWAP_AZ_MOVES:any = {a: BOTTOM_RIGHT, z: TOP_LEFT};

    if((dir == 1 || dir == 2 || dir == 8) && btA == "heal" && btB == "heal") {
        rotateSquad(a, b, y, z, VERTICAL_FLIP, FLIP_V_MOVES);
    }
    else if(dir == 1 && atk(btY)) {
        rotateSquad(a, b, y, z, SWAP_YB, SWAP_YB_MOVES);
    }
    else if(dir == 1 && atk(btZ)) {
        rotateSquad(a, b, y, z, SWAP_AZ, SWAP_AZ_MOVES);
    }
    else if((dir == 4 || dir == 5 || dir == 6) && atk(btA) && atk(btB)) {
        rotateSquad(a, b, y, z, VERTICAL_FLIP, FLIP_V_MOVES);
    }
    else if(dir == 5 && atk(btA)) {
        rotateSquad(a, b, y, z, SWAP_AZ, SWAP_AZ_MOVES);
    }
    else if(dir == 5 && atk(btB)) {
        rotateSquad(a, b, y, z, SWAP_YB, SWAP_YB_MOVES);
    }
    else if(dir == 3 && atk(btA) && atk(btY)) {
        rotateSquad(a, b, y, z, HORIZONTAL_FLIP, FLIP_H_MOVES);
    }
    else if(dir == 3 && atk(btY)) {
        rotateSquad(a, b, y, z, SWAP_YB, SWAP_YB_MOVES);
    }
    else if(dir == 3 && atk(btA)) {
        rotateSquad(a, b, y, z, SWAP_AZ, SWAP_AZ_MOVES);
    }
    else if(dir == 7 && atk(btB) && atk(btZ)) {
        rotateSquad(a, b, y, z, HORIZONTAL_FLIP, FLIP_H_MOVES);
    }
    else if(dir == 7 && atk(btB)) {
        rotateSquad(a, b, y, z, SWAP_YB, SWAP_YB_MOVES);
    }
    else if(dir == 7 && atk(btZ)) {
        rotateSquad(a, b, y, z, SWAP_AZ, SWAP_AZ_MOVES);
    }
};

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

    let creepBodyType = creepBody.length > 0 ? getMostFrequent(creepBody) : "move";
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

                    return 4;
            }});
        }


        if(creep.memory.route && creep.memory.route !== -2 && creep.memory.route.length > 1) {
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

        if(!creep.memory.go && creep.memory.route && creep.memory.route !== -2 && creep.memory.route.length > 0) {

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
                    if(pos) {
                        let direction = creep.pos.getDirectionTo(pos);

                        creep.move(direction);
                    }
            }

            // else if((Game.time % 30 == 0 || Game.time % 30 == 1) && (creep.pos.x == 1 || creep.pos.x == 47 || creep.pos.y == 1 || creep.pos.y == 47)) {
            //     creep.moveTo(new RoomPosition(25,25,creep.room.name), {range:14});
            // }
        }
    }


    let structures = creep.room.find(FIND_STRUCTURES, {filter: building => !building.my && building.structureType !== STRUCTURE_CONTAINER && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTROLLER && building.structureType !== STRUCTURE_KEEPER_LAIR && building.structureType !== STRUCTURE_EXTRACTOR&& building.structureType !== STRUCTURE_TERMINAL});
    let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
    let enemyCreepInRangeThree = creep.pos.findInRange(enemyCreeps, 3);
    let targetCreep;
    if(enemyCreepInRangeThree.length > 0) {
        for(let e_creep of enemyCreepInRangeThree) {

            let enemyCombatBody = e_creep.body.filter(function(part) {return part.type !== "move";});
            let enemyBodyType = enemyCombatBody.length > 0 ? getMostFrequent(enemyCombatBody) : "move";

            if (enemyBodyType !== "heal" || creepBodyType !== "ranged_attack") {
                let underRampart = false;
                for (let structure of e_creep.pos.lookFor(LOOK_STRUCTURES)) {
                    if (structure.structureType == STRUCTURE_RAMPART) {
                        underRampart = true;
                    }
                }
                if (!underRampart && (!targetCreep || creep.pos.getRangeTo(e_creep) < creep.pos.getRangeTo(targetCreep))) {
                    targetCreep = e_creep;
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

        // split travel: morph into two duos when flagged (QSPLIT) or when the quad
        // path came back incomplete twice in a row (terrain the 2x2 cannot cross).
        // The duos regroup one room short of the target and rejoin into the quad.
        if(a && b && y && z && creep.memory.targetPosition && creep.room.name != creep.memory.targetPosition.roomName &&
           (creep.memory.splitTravel || (creep.memory.pathIncompleteCount || 0) >= 2) &&
           a.room.name == b.room.name && a.room.name == y.room.name && a.room.name == z.room.name) {
            let staging = creep.room.name;
            if(creep.memory.route && creep.memory.route.length >= 2) {
                staging = creep.memory.route[creep.memory.route.length - 2].room;
            }
            splitQuadToDuos(a, b, y, z, staging);
            return;
        }


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
            let lowest = Infinity;
            for(let squadmember of aliveCreeps) {
                healPartsTotal += squadmember.getActiveBodyparts(HEAL);
                if(squadmember.hits < squadmember.hitsMax && squadmember.hits < lowest) {
                    lowest = squadmember.hits;
                    target = squadmember;
                }
            }

            // pre-heal: nobody damaged yet, but we are in the hot room with a
            // threat present, so a heal lands the same tick the first damage does
            if(!target && creep.memory.targetPosition && creep.room.name == creep.memory.targetPosition.roomName) {
                let hostileTowers = creep.room.find(FIND_HOSTILE_STRUCTURES, {
                    filter: (s:any) => s.structureType == STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] >= 10
                });
                if(hostileTowers.length > 0 || enemyCreepInRangeThree.length > 0) {
                    let threat = hostileTowers.length > 0
                        ? creep.pos.findClosestByRange(hostileTowers)
                        : creep.pos.findClosestByRange(enemyCreepInRangeThree);
                    if(threat) {
                        let closest = Infinity;
                        for(let squadmember of aliveCreeps) {
                            closest = Math.min(closest, squadmember.pos.getRangeTo(threat));
                        }
                        let mostExposed = aliveCreeps.filter(member => member.pos.getRangeTo(threat) == closest);
                        target = mostExposed[0];
                    }
                }
            }

            if(target) {
                if(creep.pos.isNearTo(target)) {
                    creep.heal(target);
                }
                else {
                    creep.rangedHeal(target);
                }
                if(creep.memory.targetPosition.roomName == creep.room.name) {
                    creep.memory.lastHeal = target.id;
                }
            }
            else if(creep.hits < creep.hitsMax) {
                creep.heal(creep);
            }
            else {
                if(a) {
                    let lastHealCreep = Game.getObjectById(a.memory.lastHeal)
                    if(lastHealCreep && creep.pos.isNearTo(lastHealCreep)) {
                        creep.heal(lastHealCreep)
                    }
                }
            }



            if(creep.room.name == creep.memory.targetPosition.roomName) {
                if(structures.length > 0) {

                    let nowall = structures.filter(function(building) {return building.structureType!=STRUCTURE_WALL && building.structureType!=STRUCTURE_CONTAINER && building.structureType!=STRUCTURE_ROAD && building.structureType!=STRUCTURE_RAMPART;});
                    if(nowall.length > 0) {
                        let closestBuilding = creep.pos.findClosestByRange(nowall);
                        creep.memory.targetPosition = closestBuilding.pos;
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

                        if(Memory.verbose) {
                            console.log("heal power is", HealPower, "tower power is", totalTowerDamage);
                        }

                        if(totalTowerDamage > HealPower && target && target.hits < target.hitsMax || target && target.hits <= target.hitsMax/2.1 || enemyCreepInRangeThree.length && enemyCreepInRangeThree.filter(ecreep => ecreep.getActiveBodyparts(ATTACK) > 24 && ecreep.pos.findPathTo(creep, { ignoreCreeps: false, ignoreRoads: true, swampCost: 1 }).length < 3).length) {

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
                        else if(enemyCreepInRangeThree.length && enemyCreepInRangeThree.filter(ecreep => ecreep.getActiveBodyparts(ATTACK) > 24 && ecreep.pos.findPathTo(creep, { ignoreCreeps: false, ignoreRoads: true, swampCost: 1 }).length === 3).length) {
                            let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreepInRangeThree);
                            let directionToEnemyCreep = creep.pos.getDirectionTo(closestEnemyCreep);

                            if(aliveCreeps.length == 4) {
                                performSquadRotation(a, b, y, z, directionToEnemyCreep, creepBodyType);
                            }

                            move_location = creep.pos;
                        }
                    }
                }
            }
            // somehow could do find closest building and make it the target but seems to hard (when have vision. hmm)
            else if(z && z.room.name == creep.memory.targetPosition.roomName) {
                if(structures.length > 0) {

                    let nowall = structures.filter(function(building) {return building.structureType!=STRUCTURE_WALL && building.structureType!=STRUCTURE_ROAD && building.structureType!=STRUCTURE_CONTAINER && building.structureType!=STRUCTURE_RAMPART;});
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

        if(move_location.roomName == creep.memory.targetPosition?.roomName) {
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
            if(Memory.verbose) {
                console.log(path.incomplete)
            }
            if(path.incomplete && creep.room.name != creep.memory.targetPosition.roomName) {
                creep.memory.pathIncompleteCount = (creep.memory.pathIncompleteCount || 0) + 1;
            }
            else {
                creep.memory.pathIncompleteCount = 0;
            }
            let pos = path.path[0];
            let direction = pos ? creep.pos.getDirectionTo(pos) : undefined;
            // && a.room.name == y.room.name && a.room.name == z.room.name) || (a.room.name == b.room.name && a.pos.isNearTo(b) && !a.pos.isNearTo(y)) || (a.room.name == y.room.name && a.pos.isNearTo(b) && !a.pos.isNearTo(b))
            if(
                pos &&

                ((a.room.name == b.room.name && a.room.name == y.room.name && a.room.name == z.room.name) ||

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
                ))
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
                            allow = quadClearanceFree(creep, direction);
                        }
                        else if(creep.pos.x >= 48 || creep.pos.x <= 1 || creep.pos.y >= 48 || creep.pos.y <= 1) {
                            allow = (QUAD_EDGE_SHORTCUT[direction] && QUAD_EDGE_SHORTCUT[direction](creep.pos)) || quadClearanceFree(creep, direction);
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
                                performSquadRotation(a, b, y, z, direction, creepBodyType);
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
        return 600 - (distance - 5) * 30;
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
