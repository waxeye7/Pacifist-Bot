import {roomCallbackDuo} from "./SquadHelperFunctions";

/**
 * 2-creep strike team for RCL 6/7: DuoCreepA (damage, leads) + DuoCreepB (healer,
 * chases). Unlike the quad there is no formation protocol — a duo is 1 tile wide
 * and fits anywhere, so the follower simply steps into the leader's wake and the
 * leader waits whenever the healer falls behind.
 *
 * Spawn via global.DUO(homeRoom, targetRoom, boostLabIds?) — see Commands.ts.
 */

const ATTACKER_TYPES = ["ranged_attack", "attack", "work"];

const bodyTypeOf = function (creep: any) {
    const combat = creep.body.filter(function (part: any) { return part.type !== "move"; });
    if (combat.length === 0) {
        return "move";
    }
    const counts: any = {};
    combat.forEach(function (part: any) { counts[part.type] = (counts[part.type] || 0) + 1; });
    return Object.keys(counts).reduce(function (a, b) { return counts[a] > counts[b] ? a : b; });
};

const findDuoPartner = function (creep: any, partnerRole: string) {
    if (!creep.memory.duo) {
        creep.memory.duo = {};
    }
    let partner: any = creep.memory.duo.partner ? Game.getObjectById(creep.memory.duo.partner) : null;
    if (!partner) {
        const candidates = creep.room.find(FIND_MY_CREEPS, {
            filter: function (c: any) { return c.memory.role === partnerRole && (!c.memory.duo || !c.memory.duo.partner || c.memory.duo.partner === creep.id); }
        });
        if (candidates.length > 0) {
            candidates.sort(function (a: any, b: any) { return b.ticksToLive - a.ticksToLive; });
            partner = candidates[0];
            creep.memory.duo.partner = partner.id;
            if (!partner.memory.duo) {
                partner.memory.duo = {};
            }
            partner.memory.duo.partner = creep.id;
        }
    }
    return partner;
};

const pickEnemyTarget = function (creep: any, enemiesInRange: any[], creepBodyType: string) {
    let targetCreep: any;
    for (const e_creep of enemiesInRange) {
        const enemyType = bodyTypeOf(e_creep);
        if (enemyType === "heal" && creepBodyType === "ranged_attack") {
            continue;
        }
        let underRampart = false;
        for (const structure of e_creep.pos.lookFor(LOOK_STRUCTURES)) {
            if (structure.structureType === STRUCTURE_RAMPART) {
                underRampart = true;
            }
        }
        if (!underRampart && (!targetCreep || creep.pos.getRangeTo(e_creep) < creep.pos.getRangeTo(targetCreep))) {
            targetCreep = e_creep;
        }
    }
    return targetCreep;
};

const hostileStructures = function (creep: any) {
    return creep.room.find(FIND_STRUCTURES, {
        filter: function (building: any) {
            return !building.my &&
                building.structureType !== STRUCTURE_CONTAINER &&
                building.structureType !== STRUCTURE_ROAD &&
                building.structureType !== STRUCTURE_CONTROLLER &&
                building.structureType !== STRUCTURE_KEEPER_LAIR &&
                building.structureType !== STRUCTURE_EXTRACTOR &&
                building.structureType !== STRUCTURE_TERMINAL;
        }
    });
};

// shared travel: findRoute toward the target room, one hop at a time (a duo fits
// through any exit, so none of the quad's midpoint funneling is needed)
const travelToRoom = function (creep: any, targetRoomName: string) {
    if (creep.memory.route && creep.memory.route.length > 0 && creep.memory.route[0].room === creep.room.name) {
        creep.memory.route.shift();
    }
    if (!creep.memory.route || creep.memory.route === -2 || creep.memory.route.length === 0 ||
        creep.memory.route[creep.memory.route.length - 1].room !== targetRoomName) {
        creep.memory.route = Game.map.findRoute(creep.room.name, targetRoomName, {
            routeCallback: function (roomName: string) {
                if (Game.map.getRoomStatus(roomName).status !== "normal") {
                    return Infinity;
                }
                if (_.includes(Memory.AvoidRooms, roomName, 0)) {
                    return 25;
                }
                return 1;
            }
        });
    }
    if (creep.memory.route && creep.memory.route !== -2 && creep.memory.route.length > 0) {
        creep.moveTo(new RoomPosition(25, 25, creep.memory.route[0].room), {range: 20, reusePath: 20});
        return true;
    }
    return false;
};

const healLogic = function (creep: any, self: any, partner: any, enemiesNearby: any[], inTargetRoom: boolean) {
    const pair = [self, partner].filter(Boolean);
    let target: any;
    let lowest = Infinity;
    for (const member of pair) {
        if (member.hits < member.hitsMax && member.hits < lowest) {
            lowest = member.hits;
            target = member;
        }
    }

    // pre-heal: threat present in the hot room, land the heal the tick damage arrives
    if (!target && inTargetRoom) {
        const towers = creep.room.find(FIND_HOSTILE_STRUCTURES, {
            filter: function (s: any) { return s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] >= 10; }
        });
        if (towers.length > 0 || enemiesNearby.length > 0) {
            const threat = towers.length > 0 ? creep.pos.findClosestByRange(towers) : creep.pos.findClosestByRange(enemiesNearby);
            if (threat) {
                target = pair.reduce(function (best: any, m: any) {
                    return m.pos.getRangeTo(threat) < best.pos.getRangeTo(threat) ? m : best;
                }, pair[0]);
            }
        }
    }

    if (target) {
        if (creep.pos.isNearTo(target)) {
            creep.heal(target);
        }
        else {
            creep.rangedHeal(target);
        }
        return true;
    }
    return false;
};


const runLeader = function (creep: any) {
    creep.memory.moving = false;

    if (creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        if (!creep.Boost()) {
            return;
        }
    }

    const creepBodyType = bodyTypeOf(creep);
    creep.memory.bodyType = creepBodyType;

    const partner = findDuoPartner(creep, "DuoCreepB");
    const targetPos = creep.memory.targetPosition;
    if (!targetPos) {
        return;
    }
    const inTargetRoom = creep.room.name === targetPos.roomName;

    // bail out of safe-moded rooms — nothing can be attacked there
    if (inTargetRoom && creep.room.controller && !creep.room.controller.my && creep.room.controller.safeMode > 0) {
        creep.memory.targetPosition = new RoomPosition(25, 25, creep.memory.homeRoom);
        return;
    }

    const enemies = creep.room.find(FIND_HOSTILE_CREEPS);
    const enemiesInThree = creep.pos.findInRange(enemies, 3);
    const targetCreep = pickEnemyTarget(creep, enemiesInThree, creepBodyType);

    // fire every tick we can
    if (targetCreep) {
        creep.rangedAttack(targetCreep);
        creep.attack(targetCreep);
        if (creep.pos.isNearTo(targetCreep)) {
            creep.rangedMassAttack();
        }
    }

    const structures = hostileStructures(creep);
    let structureTarget: any;
    if (structures.length > 0) {
        structureTarget = creep.pos.findClosestByRange(structures);
        if (!targetCreep && structureTarget && creep.pos.getRangeTo(structureTarget) <= 3) {
            if (creepBodyType === "ranged_attack") {
                if (creep.pos.isNearTo(structureTarget) && structureTarget.structureType !== STRUCTURE_WALL) {
                    creep.rangedMassAttack();
                }
                else {
                    creep.rangedAttack(structureTarget);
                }
            }
            else if (creepBodyType === "attack") {
                creep.attack(structureTarget);
            }
            else if (creepBodyType === "work") {
                creep.dismantle(structureTarget);
            }
        }
        if (structureTarget) {
            creep.memory.target = structureTarget.id;
        }
    }

    // leader waits for its healer (except on exit tiles, where waiting bounces)
    const onExit = creep.pos.x === 0 || creep.pos.x === 49 || creep.pos.y === 0 || creep.pos.y === 49;
    if (partner && !onExit && (partner.room.name !== creep.room.name || creep.pos.getRangeTo(partner) > 1)) {
        return;
    }
    if (partner && partner.fatigue > 0 && !onExit) {
        return;
    }

    if (!inTargetRoom) {
        travelToRoom(creep, targetPos.roomName);
        return;
    }

    // in the target room: walk at the nearest hostile structure (or the flag position)
    let moveGoal = structureTarget ? structureTarget.pos : new RoomPosition(targetPos.x, targetPos.y, targetPos.roomName);
    if (targetCreep) {
        moveGoal = targetCreep.pos;
    }
    const path = PathFinder.search(
        creep.pos, {pos: moveGoal, range: creepBodyType === "ranged_attack" ? 2 : 1},
        {plainCost: 1, swampCost: 5, maxOps: 2000, maxRooms: 1, roomCallback: roomCallbackDuo}
    );
    if (path.path.length > 0) {
        creep.move(creep.pos.getDirectionTo(path.path[0]));
    }
};


const runFollower = function (creep: any) {
    creep.memory.moving = false;

    if (creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        if (!creep.Boost()) {
            return;
        }
    }

    creep.memory.bodyType = bodyTypeOf(creep);

    const leader: any = findDuoPartner(creep, "DuoCreepA");
    const enemies = creep.room.find(FIND_HOSTILE_CREEPS);
    const enemiesInThree = creep.pos.findInRange(enemies, 3);
    const inTargetRoom = !!(leader && leader.memory.targetPosition && creep.room.name === leader.memory.targetPosition.roomName);

    healLogic(creep, creep, leader, enemiesInThree, inTargetRoom);

    // a healer with attack parts is unusual, but fire if we can
    const targetCreep = pickEnemyTarget(creep, enemiesInThree, creep.memory.bodyType);
    if (targetCreep && ATTACKER_TYPES.indexOf(creep.memory.bodyType) !== -1) {
        creep.rangedAttack(targetCreep);
        creep.attack(targetCreep);
    }

    if (!leader) {
        // partner dead: retreat home and recycle via the normal spawn flow
        if (creep.memory.homeRoom && creep.room.name !== creep.memory.homeRoom) {
            travelToRoom(creep, creep.memory.homeRoom);
        }
        return;
    }

    // chase the leader's wake; moveTo handles the "step into vacated tile" case
    if (leader.room.name !== creep.room.name || !creep.pos.isNearTo(leader)) {
        creep.moveTo(leader, {reusePath: 5});
    }
    else if (creep.pos.getRangeTo(leader) === 1) {
        // adjacent: mirror toward the leader so we stay glued when it moves
        creep.moveTo(leader);
    }
};


const roleDuoCreepA = {run: runLeader};
const roleDuoCreepB = {run: runFollower};

export {roleDuoCreepA, roleDuoCreepB};
