/**
 * SWEEPER RESOURCE HYGIENE — how 298 power ended up in E39N58's controller
 * container.
 *
 * A foreign power hauler died in the room; the spawn census counted the loot
 * (no resourceType test), hatched a Sweeper; Creep.Sweep() picked the power up
 * (no filter); the delivery picker's rung 5 is Structures.controllerLink —
 * which below RCL7 is the CONTROLLER CONTAINER — and the transfer sent
 * store-key [0]. Nothing in the bot withdraws anything but energy from a
 * working container, so the power sat there forever, eating depot capacity.
 *
 * The invariant: non-energy loot is only collected in rooms that have a bulk
 * sink (my storage / a terminal) to unload it into. Everywhere else the
 * sweeper is energy-only, and energy always transfers FIRST so key order can
 * never route a mineral into a working container.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string) => fs.readFileSync(path.join(__dirname, "../../src/", rel), "utf8");

const CF = read("Functions/creepFunctions.ts");
const SWEEPER = read("Roles/sweeper.ts");
const SPAWNING = read("Rooms/rooms.spawning.ts");

const sweepAt = CF.indexOf("Creep.prototype.Sweep = function Sweep()");
const SWEEP = CF.slice(sweepAt, sweepAt + 4200);

describe("Creep.Sweep() is energy-only without a bulk sink", () => {
    it("the gate exists and reads my-storage/terminal", () => {
        assert.isAbove(sweepAt, -1);
        assert.match(SWEEP, /const bulkSink = !!\(this\.room\.storage && this\.room\.storage\.my\) \|\| !!this\.room\.terminal;/);
    });

    it("dropped-resource scan is type-gated", () => {
        assert.match(SWEEP, /bulkSink \|\| r\.resourceType === RESOURCE_ENERGY/);
    });

    it("tombstone/ruin scan is type-gated", () => {
        assert.match(SWEEP, /bulkSink \? _\.sum\(s\.store\) > 0 : \(s\.store\[RESOURCE_ENERGY\] \|\| 0\) > 0/);
    });

    it("the unconditional any-resource withdraw is gone", () => {
        assert.notMatch(SWEEP, /: \(Object\.keys\(target\.store\)\[0\] as ResourceConstant\);/);
        assert.match(SWEEP, /bulkSink \? \(Object\.keys\(target\.store\)\[0\] as ResourceConstant\) : undefined/);
    });
});

describe("sweeper delivery can never poison a working container", () => {
    it("energy transfers FIRST — key order is not a routing decision", () => {
        assert.match(SWEEPER, /const resource = \(creep\.store\[RESOURCE_ENERGY\] \|\| 0\) > 0/);
    });

    it("HAZARD PIN: findLocked rung 5 hands back the controller depot", () => {
        // Structures.controllerLink IS the controller container below RCL7
        // (carry.ts range<=4 candidate write). Any relaxation of the gates
        // above reopens the E39N58 bug through this exact line.
        assert.match(SWEEPER, /for \(const key of \["bin", "storage", "container", "controllerLink"\]\)/);
    });
});

describe("the spawn census agrees with Sweep()", () => {
    it("no sweeper hatches for loot the room cannot unload", () => {
        assert.match(SPAWNING, /const sweepBulkSink = !!\(room\.storage && room\.storage\.my\) \|\| !!room\.terminal;/);
        assert.match(SPAWNING, /sweepBulkSink \? _\.sum\(s\.store\) > 0 : \(s\.store\[RESOURCE_ENERGY\] \|\| 0\) > 0/);
        const drops = SPAWNING.match(/sweepBulkSink \|\| r\.resourceType == RESOURCE_ENERGY/g) || [];
        assert.equal(drops.length, 2, "both dropped-resource census arms (RCL<4 and RCL4+) are gated");
    });
});
