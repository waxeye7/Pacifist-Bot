/**
 * A little description of this function
 * @param {Creep} creep
 **/
import { canSafeModeNow, emergencyShellActive, rampartSitesAllowed } from "Rooms/spawnSafety";

const run = function (creep) {
    creep.memory.moving = false;

    // SGD/SMDP leftovers aimed at a room we own: recycle. Towers (and
    // RampartDefender on the shell) are home defence; this body is not.
    if (creep.memory.targetRoom) {
        const dest = Game.rooms[creep.memory.targetRoom];
        if (dest && dest.controller && dest.controller.my) {
            creep.recycle();
            return;
        }
    }

    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        let result = creep.Boost();
        if(!result) {
            return;
        }
    }


    let enemySpotted;
    // if(!enemyCreeps || enemyCreeps.length == 0) {
        enemySpotted = false;
    // }
    let friendlyChatter = false
    GuardSay(creep, enemySpotted, friendlyChatter);

    let enemyCreeps;

    if(creep.room.name !== creep.memory.targetRoom) {
        if(creep.ticksToLive % 5 == 0 && creep.memory.coma || !creep.memory.coma) {
            enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS, {filter: c => c.owner.username !== "Source Keeper"});
            if(enemyCreeps.length > 0) {
                creep.memory.coma = false;
                killCreepsInroom(creep, enemyCreeps);
                // chase move then travel: last intent wins and we never
                // actually close. Stay on the chase this tick.
                return;
            }
            else {
                creep.memory.coma = true;
            }
        }

        if(routeIsHopeless(creep)) {
            // Give up on the trip, not on the body. targetRoom = homeRoom is
            // sticky: the owned-target check at the top of run() picks it up
            // next tick and recycle() walks it home on the same avoid-route.
            creep.memory.targetRoom = creep.memory.homeRoom;
            creep.memory.route = [];
            creep.memory.path = [];
            delete creep.memory.MoveTargetId;
            return;
        }

        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    // rampartLocations empty used to mean only "shell built". The shell
    // policy (Rooms/spawnSafety) now also publishes it empty while ramparts
    // are DEFERRED below RCL8 — and a RampartDefender with no rampart to man
    // cannot attack at all (its strike needs a rampart under it). So convert
    // only when the program ran (policy allows sites) or the shell physically
    // stands; otherwise this body stays a free-attack Guard.
    if(creep.room.controller && creep.room.controller.my && creep.room.controller.level >= 4 && creep.room.storage && creep.room.memory.construction && creep.room.memory.construction.rampartLocations && !creep.room.memory.construction.rampartLocations.length) {
        const lvl = creep.room.controller.level;
        const shellStands = creep.room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType === STRUCTURE_RAMPART}).length > 0;
        if(shellStands || rampartSitesAllowed(lvl, emergencyShellActive(lvl, canSafeModeNow(creep.room.controller, Game.time)))) {
            creep.memory.role = "RampartDefender";
            return;
        }
    }

    if(creep.memory.again && !creep.memory.ttgh) {
        creep.memory.ttgh = 1500 - creep.ticksToLive;
    }
    if(!enemyCreeps) {
        enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
    }
    // HP arm used enemyCreeps before the target-room find (always undefined).
    // Latch: otherwise the now-live HP check restacks SMDP every tick.
    if(creep.memory.again && !creep.memory.smdpCalled && (creep.memory.ttgh && creep.ticksToLive <= creep.memory.ttgh + 150 || creep.hits < creep.hitsMax / 2 && enemyCreeps.length && creep.pos.findInRange(enemyCreeps, 3).length)) {
        global.SMDP(creep.memory.homeRoom, creep.memory.targetRoom);
        creep.memory.smdpCalled = true;
    }

    if(enemyCreeps.length > 0) {
        let creepAttack = killCreepsInroom(creep, enemyCreeps);
        // structs filter away controller
        // FIND_STRUCTURES here also returned our own walls and ramparts, so a
        // Guard defending a room spent the fight chewing through its own base.
        let structs = creep.room.find(FIND_HOSTILE_STRUCTURES, {filter: s => s.structureType !== STRUCTURE_CONTROLLER});
        let closestStruct = creep.pos.findClosestByRange(structs);
        // attack() last-write: do not clobber a successful creep shot
        if(creepAttack !== 0 && closestStruct && creep.pos.isNearTo(closestStruct)) {
            creep.attack(closestStruct);
        }
    }
    else {
        let HostileStructures = creep.room.find(FIND_HOSTILE_STRUCTURES, {filter: s => s.structureType !== STRUCTURE_CONTROLLER});
        if(HostileStructures.length > 0) {
            let closestHostileStructure = creep.pos.findClosestByRange(HostileStructures);
            if(creep.pos.isNearTo(closestHostileStructure)) {
                creep.attack(closestHostileStructure);
            }
            else {
                creep.MoveCostMatrixRoadPrio(closestHostileStructure, 1);
            }
        }
        /*
         * THE FALLBACK THAT ATE OUR OWN REMOTES.
         *
         * This used to be `else if(controller && !controller.my)` ->
         * `room.find(FIND_STRUCTURES)` -> `attack(closest)`. FIND_STRUCTURES in
         * a room we do not OWN still returns everything standing in it, and the
         * roads and containers we build in our own remotes are UNOWNED — they
         * have no owner field at all, so nothing in that filter could tell one
         * of ours from anybody else's. A Guard that reached a quiet remote with
         * no hostile creeps and no hostile structures therefore walked to the
         * nearest road and hit it, 30 damage per ATTACK part per tick, until it
         * fell over. A 5-ATTACK Guard destroys a 5,000-hit remote road in ~34
         * ticks and then starts on the next one. Live E38N58 (our haul route,
         * reserved out from under us on 2026-09-11) is exactly the shape of
         * room this fires in.
         *
         * FIND_HOSTILE_STRUCTURES above already covers every structure that is
         * genuinely someone else's — invader cores, enemy spawns, towers — so
         * the fallback added no reachable target that mattered and one very
         * expensive way to lose our own infrastructure. A guard with nothing to
         * kill guards. It does not demolish.
         */
        else {
            creep.idlePark();
        }
    }



}


/**
 * ROOMS PER LIFETIME. A trip nobody can finish is a body nobody gets back.
 *
 * Live shard3 2026-09-11: Guard-19391524-E36N57-E38N55 held a FOURTEEN hop
 * route — E36N58, E36N59, E36N60, E37N60, E38N60, E39N60, E40N60, E40N59,
 * E40N58, E40N57, E40N56, E40N55, E39N55, E38N55 — to reach a room two rooms
 * from the empire, because moveToRoomAvoidEnemyRooms routes around the hostile
 * block to the south. Read in E36N58 at tick 82,882,060 it was 5 MOVE / 5
 * ATTACK with 1,353 ticks to live and 13 hops still ahead: one tick per plain
 * tile, so 650-plus tiles, over half its life spent walking. That one arrives.
 * A slower body, a later start or one swamp crossing does not, and the ladder
 * then buys another.
 *
 * So this is the death backstop, not the value judgement — War/reach's hop
 * budget is where an errand is refused for being merely wasteful. It fires only
 * on trips that cannot finish: ROOM_CROSSING tiles per hop, and the real
 * fatigue rule of max(1, ceil(heavy / move)) ticks per plain tile.
 *
 * Nothing here fires in the room the creep is already standing in, so a Guard
 * that has ARRIVED always fights; this is a travel check only.
 */
const ROOM_CROSSING = 40;
const ARRIVAL_MARGIN = 100;

function routeIsHopeless(creep): boolean {
    const route = creep.memory.route;
    // No route yet means moveToRoomAvoidEnemyRooms has not picked one; let it.
    if(!route || !route.length) return false;
    const ttl = creep.ticksToLive;
    if(typeof ttl !== "number") return false;
    let heavy = 0;
    let move = 0;
    for(const part of creep.body) {
        if(part.type === MOVE) move += 1;
        else if(part.type !== CARRY) heavy += 1;
    }
    const perTile = move > 0 ? Math.max(1, Math.ceil(heavy / move)) : 50;
    const need = route.length * ROOM_CROSSING * perTile;
    return need + ARRIVAL_MARGIN > ttl;
}

function killCreepsInroom(creep, enemyCreeps) {
    let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);
    // Pass the creep, not .pos: GoToController keys its cached path on
    // target.id and target.pos.roomName, and a RoomPosition has neither —
    // with .pos the guard re-searched PathFinder EVERY tick of the chase.
    GoToController(creep, closestEnemyCreep, 1)
    return creep.attack(closestEnemyCreep)
}


function GuardSay(creep, enemySpotted, friendlyChatter) {


    if(!enemySpotted && !friendlyChatter) {
        if(creep.ticksToLive % 12 == 6) {
            creep.say("for", true);
        }
        else if(creep.ticksToLive % 12 == 5 && creep.saying == "for") {
            creep.say("the", true);
        }
        else if(creep.ticksToLive % 12 == 4 && creep.saying == "the") {
            creep.say("peace", true);
        }
        else if(creep.ticksToLive % 12 == 3 && creep.saying == "peace") {
            creep.say("of", true);
        }
        else if(creep.ticksToLive % 12 == 2 && creep.saying == "of") {
            creep.say("the", true);
        }
        else if(creep.ticksToLive % 12 == 1 && creep.saying == "the") {
            creep.say("kingdom", true);
        }


        else if(creep.ticksToLive % 12 == 11) {
            creep.say("for", true);
        }
        else if(creep.ticksToLive % 12 == 10 && creep.saying == "for") {
            creep.say("king", true);
        }
        else if(creep.ticksToLive % 12 == 9 && creep.saying == "king") {
            creep.say("and", true);
        }
        else if(creep.ticksToLive % 12 == 8 && creep.saying == "and") {
            creep.say("country", true);
        }
    }

}

function GoToController(creep, target, range) {
    const dest = target && target.pos;
    if(dest && creep.fatigue == 0 && creep.pos.getRangeTo(dest) > range) {
        if(creep.memory.path && creep.memory.path.length > 0 && (Math.abs(creep.pos.x - creep.memory.path[0].x) > 1 || Math.abs(creep.pos.y - creep.memory.path[0].y) > 1)) {
            creep.memory.path = false;
        }
        // target is a live object: .id keys the cache, .pos.roomName is the
        // room check. Both were read off a bare RoomPosition before — the id
        // was always undefined and roomName never matched, so the chase
        // re-searched PathFinder (plus a fresh 2500-tile matrix) EVERY tick.
        if(!creep.memory.path || creep.memory.path.length == 0 || !creep.memory.MoveTargetId || creep.memory.MoveTargetId != target.id || dest.roomName !== creep.room.name) {
            let costMatrix = GoToTheController;

            let path = PathFinder.search(
                creep.pos, {pos:dest, range:range},
                {
                    maxOps: 1000,
                    maxRooms: 1,
                    roomCallback: (roomName) => costMatrix(roomName)
                }
            );
            creep.memory.path = path.path;
            creep.memory.MoveTargetId = target.id;
        }


        let pos = creep.memory.path && creep.memory.path[0];
        if(!pos) return;
        let direction = creep.pos.getDirectionTo(pos);
        creep.move(direction);
        creep.memory.moving = true;
        creep.memory.path.shift();
    }
}

/** Heap memo: one matrix per room per tick — same scoping as Solomon. */
const guardMatrixCache: { [roomName: string]: { tick: number, costs: boolean | CostMatrix } } = {};

const GoToTheController = (roomName: string): boolean | CostMatrix => {
    const hit = guardMatrixCache[roomName];
    if (hit && hit.tick === Game.time) {
        return hit.costs;
    }
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        guardMatrixCache[roomName] = { tick: Game.time, costs: false };
        return false;
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 0; y <= 49; y++) {
        for(let x = 0; x <= 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 10;
            }
            else if(tile == 0){
                weight = 2;
            }
            costs.set(x, y, weight);
        }
    }

    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
        if(site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    });

    let myCreeps = room.find(FIND_MY_CREEPS);
    for(let myCreep of myCreeps) {
        costs.set(myCreep.pos.x, myCreep.pos.y, 140);
    }

    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            costs.set(struct.pos.x, struct.pos.y, 1);
        }
        else if(struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else if(struct.structureType == STRUCTURE_RAMPART && struct.my) {
            return;
        }
        else if(struct.structureType == STRUCTURE_WALL || (struct.structureType == STRUCTURE_RAMPART && !struct.my)) {
            costs.set(struct.pos.x, struct.pos.y, 255);
        }
        else {
            if(struct.hits >= 5000000) {
                costs.set(struct.pos.x, struct.pos.y, 175);
            }
            else if(struct.hits >= 2500000) {
                costs.set(struct.pos.x, struct.pos.y, 150);
            }
            else if(struct.hits >= 1000000) {
                costs.set(struct.pos.x, struct.pos.y, 100);
            }
            else if(struct.hits >= 500000) {
                costs.set(struct.pos.x, struct.pos.y, 75);
            }
            else {
                costs.set(struct.pos.x, struct.pos.y, 50);
            }

        }
    });

    // hostiles after roads so a road tile does not un-block a 255 occupant
    let EnemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    for(let eCreep of EnemyCreeps) {
        costs.set(eCreep.pos.x, eCreep.pos.y, 255);
    }
    guardMatrixCache[roomName] = { tick: Game.time, costs };
    return costs;
}

const roleGuard = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleGuard;
