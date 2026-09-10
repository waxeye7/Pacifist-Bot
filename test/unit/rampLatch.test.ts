/**
 * The rampart-emergency latch could not be released, and it burned a room-wide
 * find every 25 ticks proving it.
 *
 * `Memory.targetRampRoom.urgent` is raised while a room is under attack with a
 * bank below 80,000. The release demanded that EVERY rampart in the room be
 * above 3,000,000 hits (10,000,000 at RCL8) — a finished-wall bar, not an
 * emergency-is-over bar.
 *
 * Live shard3 2026-09-10: `{room:"E39N58", urgent:true}` with the room at
 * peace (danger false, danger_timer 0), its 46 ramparts between 85,561 and
 * 386,201 hits, and the bot's whole-empire rampart minimum only just past
 * 100,000. The flag was permanently true, and the check re-ran
 * find(FIND_MY_STRUCTURES) over the room every 25 ticks forever to reconfirm
 * that it could not fire — on an empire holding a 2,350 CPU bucket.
 *
 * The release now mirrors the raise (the bank came back, one getObjectById, no
 * find) and carries a deadline, so the latch cannot outlive its meaning.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const ROOMS = fs
    .readFileSync(path.join(__dirname, "../../src/Rooms/rooms.ts"), "utf8")
    .replace(/\r\n/g, "\n");

describe("the rampart-emergency latch can actually fall", () => {
    const at = ROOMS.indexOf("RELEASE THE RAMPART-EMERGENCY LATCH");
    assert.isAbove(at, -1);
    const block = ROOMS.slice(at, at + 3000);

    it("no longer runs a room-wide find to decide", () => {
        assert.notInclude(block, "RAMPART_PEACETIME_FLOOR");
        assert.notInclude(block, "room.find(");
        assert.include(block, "Game.getObjectById(room.memory.Structures.storage)");
    });

    it("releases on the same bank number that raises it", () => {
        assert.include(block, "banked >= RAMP_URGENT_CLEAR_BANK");
        const m = ROOMS.match(/const RAMP_URGENT_CLEAR_BANK = (\d+);/);
        assert.isNotNull(m);
        assert.strictEqual(
            Number(m![1]),
            80000,
            "the raise tests storage < 80000; an asymmetric release is a latch"
        );
        assert.include(ROOMS, "if (storage.store[RESOURCE_ENERGY] < 80000) {");
    });

    it("...and falls on a deadline even if the bank never comes back", () => {
        assert.include(block, "Game.time - raised > RAMP_URGENT_MAX_TICKS");
        assert.include(block, "banked >= RAMP_URGENT_CLEAR_BANK || expired");
        const m = ROOMS.match(/const RAMP_URGENT_MAX_TICKS = (\d+);/);
        assert.isNotNull(m);
        assert.isAtLeast(Number(m![1]), 5000, "shorter than a raid is not a deadline");
        assert.isAtMost(Number(m![1]), 60000);
    });

    it("a latch with no timestamp is stale by definition", () => {
        // Every flag already live on the server predates the stamp below, and
        // an undefined start time can never be compared against a deadline.
        assert.include(block, "raised === undefined ||");
    });

    it("the raise stamps the start, once, on the rising edge", () => {
        // Re-stamping every tick of the raid would push the deadline forward
        // for as long as the flag is being re-raised, which is the whole raid.
        assert.include(ROOMS, "if (!Memory.targetRampRoom.urgent) Memory.targetRampRoom.t = Game.time;");
        const raise = ROOMS.indexOf("if (!Memory.targetRampRoom.urgent) Memory.targetRampRoom.t = Game.time;");
        const set = ROOMS.indexOf("Memory.targetRampRoom.urgent = true;");
        assert.isAbove(set, raise, "stamp before the flag, or the edge is already gone");
    });

    it("only the room that raised it, and only at peace, can release it", () => {
        assert.include(block, "Memory.targetRampRoom.room == room.name");
        assert.include(block, "!room.memory.danger");
    });

    it("clears the stamp with the flag, so the next raise starts a new clock", () => {
        assert.include(block, "delete Memory.targetRampRoom.t;");
    });
});
