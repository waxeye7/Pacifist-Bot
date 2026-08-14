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

const pairDuo = function (creep: any, partner: any) {
    if (!creep.memory.duo) {
        creep.memory.duo = {};
    }
    if (!partner.memory.duo) {
        partner.memory.duo = {};
    }
    creep.memory.duo.partner = partner.id;
    creep.memory.duo.partnerName = partner.name;
    partner.memory.duo.partner = creep.id;
    partner.memory.duo.partnerName = creep.name;
};

const findDuoPartner = function (creep: any, partnerRole: string) {
    if (!creep.memory.duo) {
        creep.memory.duo = {};
    }
    // Game.creeps[name] works with no vision; getObjectById does not. Only
    // treat the partner as dead when they are absent from Game.creeps.
    let partner: any = null;
    if (creep.memory.duo.partnerName) {
        partner = Game.creeps[creep.memory.duo.partnerName] || null;
        if (!partner) {
            delete creep.memory.duo.partnerName;
            delete creep.memory.duo.partner;
        }
    }
    if (!partner && creep.memory.duo.partner) {
        partner = Game.getObjectById(creep.memory.duo.partner);
        if (!partner) {
            for (const name in Game.creeps) {
                if (Game.creeps[name].id === creep.memory.duo.partner) {
                    partner = Game.creeps[name];
                    break;
                }
            }
        }
        if (partner) {
            creep.memory.duo.partnerName = partner.name;
        }
        else {
            delete creep.memory.duo.partner;
        }
    }
    if (!partner) {
        const candidates = creep.room.find(FIND_MY_CREEPS, {
            filter: function (c: any) { return c.memory.role === partnerRole && (!c.memory.duo || !c.memory.duo.partner || c.memory.duo.partner === creep.id || c.memory.duo.partnerName === creep.name); }
        });
        if (candidates.length > 0) {
            candidates.sort(function (a: any, b: any) { return b.ticksToLive - a.ticksToLive; });
            partner = candidates[0];
            pairDuo(creep, partner);
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


// morph a traveling quad into two duos (A+B and Y+Z). The four creeps keep their
// names and squad ids; only memory.role changes, so the per-tick ROLES dispatch
// swaps their behavior instantly. They regroup in stagingRoom and rejoin.
const splitQuadToDuos = function (a: any, b: any, y: any, z: any, stagingRoom: string) {
    const finalTarget = a.memory.targetPosition;
    // same-room staging would rejoin next tick; lock rejoin so the duos can leave
    const splitHere = stagingRoom === a.room.name;
    for (const member of [a, b, y, z]) {
        member.memory.quadRole = member.memory.role;
        member.memory.rejoinAt = stagingRoom;
        member.memory.go = false;
        member.memory.route = undefined;
        member.memory.direction = false;
        member.memory.pathIncompleteCount = 0;
        member.memory.swampyPathCount = 0;
        delete member.memory.splitTravel;
        if (splitHere) {
            member.memory.rejoinLockUntil = Game.time + 30;
        }
        else {
            delete member.memory.rejoinLockUntil;
        }
    }
    a.memory.finalTarget = finalTarget;
    a.memory.role = "DuoCreepA";
    a.memory.targetPosition = new RoomPosition(23, 25, stagingRoom);
    a.memory.duo = {partner: b.id, partnerName: b.name};
    b.memory.role = "DuoCreepB";
    b.memory.duo = {partner: a.id, partnerName: a.name};
    y.memory.role = "DuoCreepA";
    y.memory.targetPosition = new RoomPosition(27, 25, stagingRoom);
    y.memory.duo = {partner: z.id, partnerName: z.name};
    z.memory.role = "DuoCreepB";
    z.memory.duo = {partner: y.id, partnerName: y.name};
};

// two survivors of a quad: keep traveling as a duo instead of freezing
const degradeQuadToDuo = function (first: any, second: any) {
    const atk = function (c: any) {
        const t = c.memory.bodyType || bodyTypeOf(c);
        return t === "ranged_attack" || t === "attack" || t === "work";
    };
    let leader = first;
    let follower = second;
    if (first.memory.role !== "SquadCreepA" && (second.memory.role === "SquadCreepA" || (!atk(first) && atk(second)))) {
        leader = second;
        follower = first;
    }
    const target = leader.memory.targetPosition || follower.memory.targetPosition ||
        (leader.memory.homeRoom ? new RoomPosition(25, 25, leader.memory.homeRoom) : new RoomPosition(25, 25, leader.room.name));
    leader.memory.role = "DuoCreepA";
    follower.memory.role = "DuoCreepB";
    leader.memory.duo = {partner: follower.id, partnerName: follower.name};
    follower.memory.duo = {partner: leader.id, partnerName: leader.name};
    leader.memory.targetPosition = target;
    leader.memory.go = false;
    follower.memory.go = false;
    leader.memory.direction = false;
    follower.memory.direction = false;
    delete leader.memory.squad;
    delete follower.memory.squad;
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

    // rejoin: this duo came from a split quad — once all four ex-members stand in
    // the staging room, hand them back to their quad roles. The quad's normal
    // gathering logic (go=false -> move to slots -> go) reassembles the 2x2.
    // rejoinLockUntil blocks the same-tick/same-room split->rejoin loop.
    if (creep.memory.rejoinAt && creep.room.name === creep.memory.rejoinAt &&
        (!creep.memory.rejoinLockUntil || Game.time >= creep.memory.rejoinLockUntil)) {
        const exQuad = creep.room.find(FIND_MY_CREEPS, {
            filter: function (c: any) { return c.memory.quadRole && c.memory.rejoinAt === creep.memory.rejoinAt; }
        });
        if (exQuad.length >= 4) {
            for (const member of exQuad) {
                member.memory.role = member.memory.quadRole;
                delete member.memory.quadRole;
                delete member.memory.duo;
                delete member.memory.rejoinAt;
                delete member.memory.rejoinLockUntil;
                member.memory.go = false;
                member.memory.route = undefined;
                member.memory.direction = false;
                if (member.memory.finalTarget) {
                    member.memory.targetPosition = member.memory.finalTarget;
                    delete member.memory.finalTarget;
                }
            }
            return;
        }
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

    // wait for the healer (incl. across rooms). On an exit tile, step inward
    // first — staying there bounces rooms — then wait until they catch up.
    const onExit = creep.pos.x === 0 || creep.pos.x === 49 || creep.pos.y === 0 || creep.pos.y === 49;
    if (partner) {
        const partnerHere = partner.room.name === creep.room.name;
        const adjacent = partnerHere && creep.pos.getRangeTo(partner) <= 1;
        if (!adjacent) {
            if (onExit) {
                const inwardX = creep.pos.x === 0 ? 1 : creep.pos.x === 49 ? 48 : creep.pos.x;
                const inwardY = creep.pos.y === 0 ? 1 : creep.pos.y === 49 ? 48 : creep.pos.y;
                creep.move(creep.pos.getDirectionTo(new RoomPosition(inwardX, inwardY, creep.room.name)));
            }
            return;
        }
        if (partner.fatigue > 0) {
            return;
        }
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
        // partner gone from Game.creeps (actually dead, not just unseen)
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

export {roleDuoCreepA, roleDuoCreepB, splitQuadToDuos, degradeQuadToDuo};
