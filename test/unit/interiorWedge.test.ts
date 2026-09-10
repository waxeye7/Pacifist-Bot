/**
 * interiorMove could freeze a creep for its entire life, and nothing
 * downstream was allowed to notice.
 *
 * `creep.move()` answers for an INTENT, not for a move: the tile can be taken,
 * the shove can be refused, two creeps can pick the same square. interiorMove
 * shifted the step off its plan unconditionally, so a dropped move left the
 * plan one tile ahead of the creep — and its own drift check then threw the
 * plan away and rebuilt the IDENTICAL path, into the IDENTICAL blocker, every
 * tick.
 *
 * creepFunctions' stepCachedPath survives that (it only advances on OK, and
 * _blockedBy prices the tile out of the next search). interiorMove cannot,
 * because it RETURNS TRUE: it owns the creep's movement, so the caller's mover
 * never runs and no escape ever arms.
 *
 * Live 2026-09-10, two rooms at once. Repair-52069239-E37N58 held 250 energy
 * at (24,22) aimed at a 96,541-hit rampart at (20,28), re-deriving
 * (25,23) -> (24,24) -> (23,25) every tick; (25,23) is the source container an
 * EnergyMiner is SEATED on, and canShove() refuses a creep on its own seat by
 * design. Repair-31637815-E37N59 was doing the same thing at the same moment.
 * Both rooms' shells sat at the tower decay floor while it happened.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const INT = fs
    .readFileSync(path.join(__dirname, "../../src/utils/Interior.ts"), "utf8")
    .replace(/\r\n/g, "\n");

const fn = (sig: string): string => {
    const i = INT.indexOf(sig);
    assert.isAbove(i, -1, "missing: " + sig);
    return INT.slice(i, INT.indexOf("\n}", i));
};

describe("the interior matrix knows which creeps will never move", () => {
    const body = fn("function buildMatrix(room: Room, masked: boolean, c: InteriorCache): CostMatrix {");

    it("a creep on its own mining seat is impassable, not merely expensive", () => {
        assert.include(body, "sp === f.pos.x + f.pos.y * 50");
        assert.include(body, "costs.set(f.pos.x, f.pos.y, 255);");
    });

    it("it is the SAME test canShove refuses on", () => {
        // creepFunctions' onOwnSeat. If the two ever disagree, the matrix
        // routes through a tile the shove will not clear — which is the bug.
        const CF = fs
            .readFileSync(path.join(__dirname, "../../src/Functions/creepFunctions.ts"), "utf8")
            .replace(/\r\n/g, "\n");
        assert.include(CF, "other.memory.seatP === other.pos.x + other.pos.y * 50");
        assert.include(body, "(f.memory as any).seatP");
    });

    it("only seated creeps — a moving creep is not a wall", () => {
        // Pricing every friendly creep in makes every path a guess; they move.
        assert.include(body, 'typeof sp === "number" && sp === f.pos.x + f.pos.y * 50');
    });

    it("walks the per-tick creep cache, not a fresh find per call", () => {
        assert.include(body, "(room as any).cache.myCreeps");
    });
});

describe("a dropped interior step cannot be permanent", () => {
    const body = fn("export function interiorMove(creep: Creep, target: any, range: number): boolean {");

    it("the tile we aimed at is remembered, because move() does not report it", () => {
        assert.include(body, "mem._is = next.x + next.y * 50;");
        assert.include(body, "mem._ist = Game.time;");
    });

    it("...and checked against where the creep actually stands next tick", () => {
        assert.include(body, "if (creep.pos.x + creep.pos.y * 50 === aim) {");
        assert.include(body, "mem._ib = (mem._ib || 0) + 1;");
        assert.include(body, "delete mem._ib;");
    });

    it("a streak hands the creep back to its caller's mover", () => {
        assert.include(body, "return false;");
        assert.include(body, "mem._ioff = Game.time;");
        const m = INT.match(/const INTERIOR_BLOCKED_MAX = (\d+);/);
        assert.isNotNull(m);
        assert.isAtLeast(Number(m![1]), 2, "one dropped step is ordinary traffic");
        assert.isAtMost(Number(m![1]), 10);
    });

    it("and names the tile, which is the escape this module cannot perform", () => {
        assert.include(body, "mem._blockedBy = { x: aim % 50, y: Math.floor(aim / 50), t: Game.time };");
        // resyncCachedPath drops pathRetry AND _blockedBy when it finds a
        // pathStep older than last tick — i.e. it would delete the hint before
        // the search it was written for.
        assert.include(body, "delete mem.pathStep;");
        assert.include(body, "delete mem.pathRetry;");
        assert.include(body, "mem.path = false;");
    });

    it("ONLY in peacetime — rules 1 and 2 are not a preference", () => {
        assert.include(body, 'mem._ib >= INTERIOR_BLOCKED_MAX && mode === "p"');
    });

    it("the stand-down is bounded, and danger cancels it on the spot", () => {
        const m = INT.match(/const INTERIOR_STANDOFF = (\d+);/);
        assert.isNotNull(m);
        assert.isAtLeast(Number(m![1]), 5, "long enough for the other mover to finish the trip");
        assert.isAtMost(Number(m![1]), 200, "never a life sentence");
        assert.include(body, "if (danger || Game.time - mem._ioff >= INTERIOR_STANDOFF) delete mem._ioff;");
        // ...and it is read before any path work
        const off = body.indexOf("mem._ioff !== undefined");
        const key = body.indexOf("const key = mode + packOf");
        assert.isAbove(off, -1);
        assert.isBelow(off, key);
    });

    it("a missed step drops the stale plan rather than trusting the drift test", () => {
        const at = body.indexOf("mem._ib = (mem._ib || 0) + 1;");
        assert.isAbove(at, -1);
        assert.include(body.slice(at, at + 400), "delete mem._ip;");
    });
});
