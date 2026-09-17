/**
 * Two live shard3 faults in Roles/Guard.ts, both found on 2026-09-11.
 *
 * 1. THE ERRAND NOBODY COSTED. Guard-19391524-E36N57-E38N55 was holding a
 *    fourteen-hop route to a room two rooms from the empire — E36N58, E36N59,
 *    E36N60, E37N60, E38N60, E39N60, E40N60, E40N59, E40N58, E40N57, E40N56,
 *    E40N55, E39N55, E38N55 — because moveToRoomAvoidEnemyRooms routes around
 *    the hostile block south of the empire. Read in E36N58 at tick 82,882,060
 *    it was 5 MOVE / 5 ATTACK with 1,353 ticks to live and 13 hops ahead: one
 *    tick per plain tile, 650-plus tiles, over half its life spent walking to
 *    an invader core. A slower body or one swamp crossing does not arrive at
 *    all, and the ladder then buys another.
 *
 * 2. THE SELF-DEMOLITION. With no hostile creeps and no hostile structures in
 *    a room we do not own, the role fell through to room.find(FIND_STRUCTURES)
 *    and attacked the closest thing standing. Remote roads and containers are
 *    UNOWNED, so that filter cannot tell ours from anyone's: a Guard reaching
 *    a quiet remote chewed our own haul route, ~34 ticks per 5,000-hit road.
 *    Live E38N58 — 32 of our roads and a container, reserved out from under us
 *    the same day — is exactly that room.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const GUARD = fs
    .readFileSync(path.join(__dirname, "../../src/Roles/Guard.ts"), "utf8")
    .replace(/\r\n/g, "\n");

describe("a Guard does not start a trip it cannot finish", () => {
    const body = GUARD.slice(
        GUARD.indexOf("function routeIsHopeless(creep): boolean {"),
        GUARD.indexOf("function killCreepsInroom")
    );

    it("the check is wired on the travel leg only, above the move", () => {
        const check = GUARD.indexOf("if(routeIsHopeless(creep)) {");
        const move = GUARD.indexOf("return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);");
        assert.isAbove(check, -1, "routeIsHopeless is not called");
        assert.isBelow(check, move, "must decide before spending the move");
        // ...and inside the `room.name !== targetRoom` arm, so an ARRIVED
        // Guard always fights instead of auditing its own itinerary
        const arm = GUARD.indexOf("if(creep.room.name !== creep.memory.targetRoom) {");
        assert.isAbove(check, arm);
    });

    it("giving up sends the body home rather than throwing it away", () => {
        // targetRoom = homeRoom is sticky: the owned-target arm at the top of
        // run() sees it next tick and recycle() walks it back on the same
        // avoid-route, so half the build cost comes back.
        assert.include(GUARD, "creep.memory.targetRoom = creep.memory.homeRoom;");
        assert.include(GUARD, "creep.memory.route = [];");
        assert.include(GUARD, "delete creep.memory.MoveTargetId;");
    });

    it("costs the trip in fatigue, not in hops", () => {
        // max(1, ceil(heavy/move)) ticks per plain tile is the real fatigue
        // rule; a 1:1 Guard is two. Counting hops alone would clear a
        // fourteen-hop route for a body that cannot walk it.
        assert.include(body, "if(part.type === MOVE) move += 1;");
        assert.include(body, "else if(part.type !== CARRY) heavy += 1;");
        assert.include(body, "Math.max(1, Math.ceil(heavy / move))");
        assert.include(body, "route.length * ROOM_CROSSING * perTile");
    });

    it("never fires before a route exists, or on a creep with no TTL", () => {
        // moveToRoomAvoidEnemyRooms picks the route; judging one it has not
        // computed yet would recycle every Guard on its first tick.
        assert.include(body, "if(!route || !route.length) return false;");
        assert.include(body, 'if(typeof ttl !== "number") return false;');
    });

    it("is generous enough to only catch hopeless trips", () => {
        const c = GUARD.match(/const ROOM_CROSSING = (\d+);/);
        const m = GUARD.match(/const ARRIVAL_MARGIN = (\d+);/);
        assert.isNotNull(c);
        assert.isNotNull(m);
        // a room is 50 tiles across and a crossing is rarely the full width
        assert.isAtLeast(Number(c![1]), 25);
        assert.isAtMost(Number(c![1]), 50);
        // arriving with nothing left to fight with is the same as not arriving
        assert.isAtLeast(Number(m![1]), 50);
    });
});

describe("a Guard never attacks unowned infrastructure", () => {
    it("the FIND_STRUCTURES fallback is gone", () => {
        // FIND_HOSTILE_STRUCTURES above it already covers everything that is
        // genuinely someone else's. The fallback only ever reached neutral
        // walls and our own remote roads and containers.
        assert.notInclude(GUARD, "creep.room.find(FIND_STRUCTURES)");
        assert.include(GUARD, "let HostileStructures = creep.room.find(FIND_HOSTILE_STRUCTURES");
    });

    it("an idle Guard parks instead of pathing to a hardcoded tile", () => {
        // `creep.moveTo(12, 25)` was a magic tile in somebody's old base and a
        // full PathFinder call every tick. Guard was the most expensive role on
        // the shard by a factor of three: 0.69 CPU per creep against a 0.23
        // fleet average (Memory.CPU.roles, tick 82,881,885).
        assert.notInclude(GUARD, "creep.moveTo(12, 25)");
        assert.include(GUARD, "creep.idlePark();");
    });
});

/**
 * The same errand, closed one level up: dispatch should never have bought that
 * Guard. War/reach.getReach() is Chebyshev room-coordinate distance (geo.reachMap
 * is three nested dx/dy loops), which is the right measure for doctrine and the
 * wrong one for "can a creep walk there". E38N55 sat two rooms from an owned
 * room and fourteen hops from the room that paid for the body. reach is the
 * value gate (refuse the errand); Guard.routeIsHopeless is the death backstop
 * (recover a body that provably cannot finish the one it was given).
 */
const REACH = fs
    .readFileSync(path.join(__dirname, "../../src/War/reach.ts"), "utf8")
    .replace(/\r\n/g, "\n");
const DISPATCH = fs
    .readFileSync(path.join(__dirname, "../../src/War/dispatch.ts"), "utf8")
    .replace(/\r\n/g, "\n");

describe("war measures the walk, not the map", () => {
    it("issue() refuses a target outside the travel budget", () => {
        const at = DISPATCH.indexOf("function issue(k: Kit): boolean {");
        assert.isAbove(at, -1);
        const head = DISPATCH.slice(at, at + 900);
        assert.include(head, "!withinTravelBudget(k.home, k.target)");
        // ...before any SGD/SD/SQR fires
        const gate = DISPATCH.indexOf("!withinTravelBudget(k.home, k.target)");
        const switchAt = DISPATCH.indexOf("switch (k.kind) {", at);
        assert.isBelow(gate, switchAt);
    });

    it("a mosquito is NOT exempt — the row is memory-side but its creeps walk", () => {
        // The exemption was the bug: spawn_mosquito bodies still travel
        // moveToRoomAvoidEnemyRooms, so an unreachable pick burned most of
        // the wave's 1,500-tick TTL in transit.
        const at = DISPATCH.indexOf("function issue(k: Kit): boolean {");
        const head = DISPATCH.slice(at, DISPATCH.indexOf("switch (k.kind) {", at));
        assert.notInclude(head, 'k.kind !== "mosquito"');
    });

    it("the budget is measured with the creep router's own weights", () => {
        // moveToRoomAvoidEnemyRooms prices SK/centre/avoided/hostile rooms at
        // 24, highway at 2, normal at 4. A gate that disagreed would clear
        // routes the fleet will never be given, which is the whole failure it
        // exists to stop. hopCost mirrors it term for term:
        assert.include(REACH, "function hopCost(roomName: string, targetRoom: string): number {");
        assert.include(REACH, "if (!isEnterable(roomName)) return Infinity;");
        // the router's [4,6]x[4,6] band prices sector CENTRES at 24 too —
        // roomKind() cannot express that (it names 5,5 CENTER, not KEEPER)
        assert.include(REACH, "if (wx >= 4 && wx <= 6 && ny >= 4 && ny <= 6) return 24;");
        assert.include(REACH, "if (wx === 0 || ny === 0) return 2;");
        assert.include(REACH, "return 4;");
        // hostile-structure intel costs a hop like an avoided room
        assert.include(REACH, "intel.roomData.has_hostile_structures");
        // AvoidRoomsTemp exempts the target; the permanent AvoidRooms does
        // not (in the router the `&&` binds only to the temp clause)
        assert.include(REACH, "M.AvoidRoomsTemp[roomName] && roomName !== targetRoom");
        const at = REACH.indexOf("function hopCost");
        const body = REACH.slice(at, REACH.indexOf("const parsed"));
        assert.notInclude(body, "M.AvoidRooms.indexOf(roomName) >= 0 && roomName !== targetRoom");
    });

    it("no route at all is out of budget, not in it", () => {
        const at = REACH.indexOf("export function withinTravelBudget");
        const body = REACH.slice(at, REACH.indexOf("\n}", at));
        assert.include(body, "if (n < 0) return false;");
    });

    it("findRoute is memoised, so the gate is not a per-pass map query", () => {
        assert.include(REACH, "const routeCache: { [key: string]: { n: number; t: number } }");
        assert.include(REACH, "if (hit && Game.time - hit.t < ROUTE_TTL) return hit.n;");
        const t = REACH.match(/const ROUTE_TTL = (\d+);/);
        assert.isNotNull(t);
        assert.isAtLeast(Number(t![1]), 500);
    });

    it("the budget is a creep lifetime, not the doctrine radius", () => {
        const m = REACH.match(/export const MAX_TRAVEL_HOPS = (\d+);/);
        assert.isNotNull(m);
        // ENGAGE_RANGE is 5 map rooms; the walk is allowed to be a little
        // longer than the crow flies, but not three times longer.
        assert.isAtLeast(Number(m![1]), 5);
        assert.isAtMost(Number(m![1]), 10);
    });
});
