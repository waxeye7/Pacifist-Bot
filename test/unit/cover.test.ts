/**
 * The upgrader stood in the open next to a rampart it could have worked from.
 *
 * A rampart defends creeps on the same tile, and a hostile cannot enter one.
 * Live shard3 2026-09-10, controller-to-rampart geometry in the owned rooms:
 *
 *   E39N58  ctrl(19,38)  rampart (18,37)  RANGE 1
 *   E38N56  ctrl(43,10)  ramparts (43,11) (42,11) (42,10) (42,9) (41,12)
 *           Upgrader-35399288 parked at (42,13), on bare ground
 *   E36N57 / E35N59 / E35N58   a standable rampart within 3 in every one
 *
 * upgradeController reaches 3, so cover and work are the same tile in five of
 * seven rooms. depotPark() never knew that: it scores range-to-controller and
 * range-to-depot only. The reported symptom was an invader killing an upgrader
 * that had an untouchable tile one step away.
 *
 * Peacetime is deliberately untouched — a shell rampart is a gate as often as
 * not, and parking a creep on a gate for its whole life is a chokepoint every
 * other creep pays for.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const SRC = (p: string) =>
    fs.readFileSync(path.join(__dirname, "../../src/", p), "utf8").replace(/\r\n/g, "\n");
const COVER = SRC("utils/Cover.ts");
const UP = SRC("Roles/upgrader.ts");

const fn = (src: string, sig: string): string => {
    const i = src.indexOf(sig);
    assert.isAbove(i, -1, "missing: " + sig);
    return src.slice(i, src.indexOf("\n}", i));
};

describe("takeCover — a creep under fire stands on a rampart", () => {
    const body = fn(COVER, "export function takeCover(creep: any, anchor: any, range: number): boolean {");

    it("does nothing at all in peacetime", () => {
        // The gate-blocking cost is only worth paying while something is
        // shooting, and this must return BEFORE any find or derived build.
        assert.include(body, "if (!room || !dangerNow(room)) return false;");
        const guard = body.indexOf("dangerNow(room)");
        const tiles = body.indexOf("coverTiles(room)");
        assert.isAbove(tiles, guard, "no scan before the peacetime bail");
    });

    it("a creep already in cover is not moved, and holds its tile", () => {
        const HERE = "if (tiles.indexOf(here) >= 0 && !defenceSeats(room)[here]) {";
        assert.include(body, HERE);
        const at = body.indexOf(HERE);
        const block = body.slice(at, at + 400);
        assert.include(block, "claim(room, here, creep.name);");
        assert.include(block, "return true;");
        assert.notInclude(block, "MoveCostMatrixRoadPrio");
    });

    it("prefers a rampart it can still work from", () => {
        // in-post cover is scored on walk distance alone; anything outside the
        // anchor range is pushed behind every in-post tile at any distance
        assert.include(body, "cheb(x, y, aim.x, aim.y) > range");
        assert.include(body, "score = OUT_OF_POST_PENALTY + walk;");
        const m = COVER.match(/const OUT_OF_POST_PENALTY = (\d+);/);
        assert.isNotNull(m);
        assert.isAtLeast(Number(m![1]), 100, "a room is 50 tiles across; this must dominate walk");
    });

    it("only abandons the post when an ARMED hostile is actually close", () => {
        // room.memory.danger latches and lags both ways. Without this a stale
        // flag walks every upgrader across the base to hide behind nothing.
        assert.include(body, "panic = underThreat(creep);");
        assert.include(body, "if (!panic) continue;");
        const t = fn(COVER, "function underThreat(creep: any): boolean {");
        assert.include(t, "h.getActiveBodyparts(ATTACK) === 0 && h.getActiveBodyparts(RANGED_ATTACK) === 0");
        assert.include(t, "cachedHostileCreeps(creep.room)");
        const m = COVER.match(/const COVER_PANIC_RANGE = (\d+);/);
        assert.isNotNull(m);
        assert.isAtLeast(Number(m![1]), 4, "RANGED_ATTACK reaches 3");
        assert.isAtMost(Number(m![1]), 15);
    });

    it("...and asks that question lazily, so peace-with-a-latched-flag is free", () => {
        assert.include(body, "let panic: boolean | null = null;");
        assert.include(body, "if (panic === null) panic = underThreat(creep);");
    });

    it("never sends two creeps at the same tile", () => {
        // Creeps run sequentially within a tick, so a module-local per-tick
        // claim written by the creep that ran first is visible to the rest.
        assert.include(body, "if (taken(room, p, creep)) continue;");
        assert.include(body, "claim(room, best, creep.name);");
        const t = fn(COVER, "function taken(room: any, p: number, creep: any): boolean {");
        assert.include(t, "claimTick === Game.time");
        assert.include(t, "return !!s && s !== creep.name;");
        assert.include(COVER, "if (claimTick !== Game.time) {");
    });

    it("only offers tiles a creep can actually stand on", () => {
        const t = fn(COVER, "function coverTiles(room: any): number[] {");
        assert.include(t, "s.structureType !== STRUCTURE_RAMPART");
        assert.include(t, "cachedMyStructures(room)", "MY ramparts — a hostile one is not cover");
        assert.include(t, "OBSTACLE_OBJECT_TYPES");
        assert.include(t, "TERRAIN_MASK_WALL");
        // one pass over the structure list, not a lookFor per rampart: a
        // finished shell is 60+ ramparts and this runs on contended ticks
        assert.notInclude(t, "lookFor");
        assert.include(t, 'cachedDerived(room, "coverTiles"');
    });

    it("never contests a rampart a defender has been ordered onto", () => {
        // rooms.defence.assignDefenderTiles gives each RampartDefender one
        // unique shell tile and only skips ramparts a HOSTILE occupies, so a
        // creep in cover is a tile it will still be sent to. The room pass runs
        // before the creep pass, so the seats for this tick are already written.
        const seats = fn(COVER, "function defenceSeats(room: any): { [p: number]: boolean } {");
        assert.include(seats, "myRampartToMan");
        assert.include(seats, "cachedMyCreeps(room)");
        assert.include(COVER, "if (defenceSeats(room)[p]) return true;");
        // ...and a creep ALREADY standing on one gives it up rather than
        // reporting itself as safely parked
        assert.include(COVER, "if (tiles.indexOf(here) >= 0 && !defenceSeats(room)[here]) {");
    });

    it("fails open — no cover means the caller moves as it always did", () => {
        assert.include(body, "if (!tiles.length) return false;");
        assert.include(body, "if (best < 0) return false;");
    });
});

describe("the upgrader takes cover", () => {
    it("is wired in, and before any of the park geometry runs", () => {
        assert.include(UP, 'import { takeCover } from "utils/Cover";');
        assert.include(UP, "if(takeCover(creep, creep.room.controller, 3)) {");
        const cover = UP.indexOf("if(takeCover(creep, creep.room.controller, 3)) {");
        const park = UP.indexOf("const park:any = depotStocked ? depotPark(creep, controllerLink) : null;");
        assert.isAbove(park, cover, "cover wins the movement, park must not re-issue one");
    });

    it("anchors on the controller at range 3, so cover is still a working tile", () => {
        // upgradeController's own range. Anchoring tighter would refuse the
        // live E38N56 ramparts at range 2-3 and leave the creep in the open.
        assert.include(UP, "takeCover(creep, creep.room.controller, 3)");
    });

    it("keeps upgrading and keeps topping up from cover", () => {
        const at = UP.indexOf("if(takeCover(creep, creep.room.controller, 3)) {");
        const block = UP.slice(at, at + 700);
        assert.include(block, "creep.upgradeController(creep.room.controller);");
        assert.include(block, "creep.grabAdjacentPile()");
        assert.include(block, "creep.withdraw(controllerLink, RESOURCE_ENERGY);");
        assert.include(block, "creep.pos.isNearTo(controllerLink)");
        assert.include(block, "return;");
    });

    it("keeps the upgrading flag honest while parked in cover", () => {
        // The fetch/work flip lives below the early return, so this branch has
        // to maintain it itself or a creep that empties in cover comes out of
        // the raid believing it is still full.
        const at = UP.indexOf("if(takeCover(creep, creep.room.controller, 3)) {");
        const block = UP.slice(at, at + 700);
        assert.include(block, "creep.memory.upgrading = true;");
        assert.include(block, "creep.memory.upgrading = false;");
    });
});

describe("the exposed haulers take cover too", () => {
    const CLF = SRC("Roles/ControllerLinkFiller.ts");
    const BLD = SRC("Roles/builder.ts");

    it("RCL6+ has no other civilian reaction at all", () => {
        // rooms.defence's whole civilian flee loop lives inside
        // `room.controller.level <= 5`, so holdForFlee() — which is what every
        // one of these roles calls at the top of run() — can never fire in an
        // owned mid-game room. That is the hole this fills.
        const DEF = SRC("Rooms/rooms.defence.ts");
        assert.include(DEF, "if(room.controller.level <= 5) {");
        const CF = SRC("Functions/creepFunctions.ts");
        assert.include(CF, "if(!this.memory.fleeing) return false;");
    });

    it("the controller link filler and the builder are wired, with no anchor", () => {
        for (const [name, src] of [["ControllerLinkFiller", CLF], ["builder", BLD]] as [string, string][]) {
            assert.include(src, 'import { takeCover } from "utils/Cover";', name);
            assert.include(src, "if(takeCover(creep, null, 0)) {", name);
            // no anchor means every candidate needs the panic test, so a
            // latched danger flag on its own moves nobody
            const at = src.indexOf("if(takeCover(creep, null, 0)) {");
            const flee = src.indexOf("creep.holdForFlee()");
            assert.isAbove(at, flee, name + ": cover sits with the other threat checks");
        }
    });

    it("the fill crew and the wall repairers are deliberately NOT wired", () => {
        // A filler that hides lets the towers run dry, and repair / maintainer
        // / RampartErector are what keep the shell standing during the raid.
        // Hiding is only correct for a creep the room can spare.
        for (const f of ["filler", "repair", "maintainer", "RampartErector"]) {
            assert.notInclude(SRC("Roles/" + f + ".ts"), "takeCover(", f + " must keep working under fire");
        }
    });
});
