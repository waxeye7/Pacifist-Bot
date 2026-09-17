/**
 * Three small audit pins (2026-09-17, labs/observe/market pass):
 *
 * 1. rooms.observe: the power/deposit sweep fired on residue 2 of a 128-tick
 *    period, guarded by `Game.time % interval !== 0` so it never doubled an
 *    observeRoom intent with the main sweep. With the documented config
 *    Memory.observeEvery = 2, EVERY fire tick (128k+2, always even) was a
 *    main-sweep tick — the guard was never true and the sweep was permanently
 *    dead: lastRoomObservedForPower never written, the next-tick follow-up
 *    no-opped forever, and global.SDM deposit dispatch silently stopped.
 *    The fire residue now shifts to 3 (odd — can never be a multiple of 2)
 *    when interval === 2.
 *
 * 2. rooms.market: Memory.resource_requests was initialized as a whole object
 *    only, then indexed by 8 T3 boost keys. A stale or hand-edited partial
 *    shape threw TypeError on the first missing key every pass — caught by
 *    guarded(), but that room's entire market run died each tick.
 *
 * 3. rooms.spawning stripNonRescueQueue(): dropped queue entries were rebuilt
 *    without refundBoostOwner, so a stripped boosted entry (clearer, war trio,
 *    boosted miner — all charged at push time) leaked its lab reservation
 *    until janitorBoostLedger swept it.
 */
import { assert } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

function src(rel: string): string {
    return readFileSync(join(__dirname, "..", "..", "src", rel), "utf8");
}

function stripComments(code: string): string {
    return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("observe power sweep / market requests / rescue strip", () => {
    it("power sweep shifts off residue 2 when observeEvery === 2", () => {
        const code = stripComments(src(join("Rooms", "rooms.observe.ts")));
        assert.include(code, "interval === 2 ? 3 : 2");
        assert.include(code, "Game.time % twoTimesInterval == powerResidue");
        assert.include(code, "Game.time % twoTimesInterval == powerResidue + 1");
    });

    it("market heals each resource_requests key before indexing it", () => {
        const code = stripComments(src(join("Rooms", "rooms.market.ts")));
        const init = code.indexOf("if(!Memory.resource_requests)");
        const heal = code.indexOf("Array.isArray(Memory.resource_requests[boost])");
        const firstUse = code.indexOf("Memory.resource_requests[boost].includes(room.name)");
        assert.isAbove(init, -1);
        assert.isAbove(heal, init, "per-key heal must run before first index use");
        assert.isAbove(firstUse, heal);
    });

    it("stripNonRescueQueue refunds boost ownership for dropped entries", () => {
        const code = stripComments(src(join("Rooms", "rooms.spawning.ts")));
        const fnStart = code.indexOf("function stripNonRescueQueue");
        assert.isAbove(fnStart, -1);
        const fnBody = code.slice(fnStart, code.indexOf("let lastSpawnRescueTick"));
        assert.include(fnBody, "refundBoostOwner(room, name)");
    });
});
