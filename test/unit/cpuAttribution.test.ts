/**
 * 1.7 of the bot's 18 CPU was unattributed, and the bucket stalled short of
 * every gate that would have re-opened the economy.
 *
 * Memory.CPU.phases summed to about 16.3 (rooms 3.13, creeps 12.34, empire
 * 0.26, war 0.12, remoteStats 0.12, the rest rounding) against a 100-tick
 * average of 18.0. The gap is everything between `startTotal` and the first
 * phase() call in main.loop: getOpts, memHack.run, runDropRooms,
 * MemoryManager, publishAllyNeed, RoomCache.tick, getCpuPolicy, refreshModes.
 * None of it was measured, so every CPU hunt so far has been searching the
 * lit half of the loop.
 *
 * It matters because of where the bucket stopped. Phasing the per-room
 * cadences (roomCadencePhase.test.ts) moved it from 2,974 to 3,660 over 40
 * minutes of live sampling on 2026-09-11, then it flattened there for the next
 * 15. CpuPolicy opens remotes at 4,000 and the optional roster at 5,000, so
 * flat at 3,650 means both stay shut and the empire keeps running with no
 * remotes and no repair/maintainer/sweeper rungs.
 *
 * mark() is timing only. It must NOT catch, unlike phase(): this is
 * boot-critical work and an exception in MemoryManager has to keep reaching
 * ErrorMapper exactly as it did before. The `finally` is what records the
 * sample on the way out either way.
 *
 * The same commit hoists the `% 3012` keepTheseRoads sweep out of the
 * per-visible-room body. It iterated Game.rooms itself while being called once
 * per room, so seven communes ran the whole-empire pass seven times on one
 * tick, doing a FIND_MY_CONSTRUCTION_SITES in every visible room seven times
 * for a result that is identical after the first pass.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const MAIN = fs
    .readFileSync(path.join(__dirname, "../../src/main.ts"), "utf8")
    .replace(/\r\n/g, "\n");
const ROOMS = fs
    .readFileSync(path.join(__dirname, "../../src/Rooms/rooms.ts"), "utf8")
    .replace(/\r\n/g, "\n");

describe("every CPU in the main loop is attributed to something", () => {
    it("mark() times without swallowing the error", () => {
        const fn = MAIN.slice(MAIN.indexOf("function mark<T>"));
        const body = fn.slice(0, fn.indexOf("\n}\n"));
        assert.include(body, "try {", "must still run the work");
        assert.include(body, "} finally {", "the sample is taken on both paths");
        assert.notInclude(body, "catch", "mark must not swallow — boot errors go to ErrorMapper");
        assert.include(body, "notePhaseCpu(name, Game.cpu.getUsed() - before);");
    });

    it("the whole prologue is measured", () => {
        for (const m of [
            'mark("boot.opts", () => getOpts())',
            'mark("boot.memHack", () => memHack.run())',
            'mark("boot.dropRooms", () => runDropRooms())',
            'mark("boot.memoryManager", () => MemoryManager())',
            'mark("boot.allyNeed", () => publishAllyNeed())',
            'mark("boot.roomCache", () => RoomCache.tick())',
            'mark("boot.policy", () => getCpuPolicy())',
            'mark("boot.modes", () => refreshModes())',
            'mark("modes.post", () => refreshModes())',
        ]) {
            assert.include(MAIN, m, "unmeasured again: " + m);
        }
    });

    it("nothing in the prologue calls straight through any more", () => {
        for (const bare of [
            "\n  memHack.run();",
            "\n  MemoryManager();",
            "\n  publishAllyNeed();",
            "\n  refreshModes();",
            "\n    RoomCache.tick();",
        ]) {
            assert.notInclude(MAIN, bare, "a prologue call lost its mark(): " + bare.trim());
        }
    });

    it("the keepTheseRoads sweep runs once, not once per room", () => {
        assert.equal(
            MAIN.length > 0 && ROOMS.split("Game.time % 3012 == 0").length - 1,
            1,
            "exactly one copy of the sweep gate"
        );
        // The current room's own danger flag must not decide whether the OTHER
        // rooms get swept; each room is already filtered inside the loop.
        assert.notInclude(ROOMS, "Game.time % 3012 == 0 && Game.cpu.bucket > 3500 && !room.memory.danger");
        assert.include(ROOMS, "if (Game.time % 3012 == 0 && Game.cpu.bucket > 3500) {");
        // and it must sit at empire scope, after the per-room pass closes
        const sweep = ROOMS.indexOf("Game.time % 3012 == 0");
        const eachRoom = ROOMS.indexOf("const eachVisibleRoom = function");
        const gclBlock = ROOMS.indexOf("if (Game.gcl.level > roomsIController)");
        assert.isAbove(sweep, eachRoom);
        assert.isBelow(sweep, gclBlock, "must be hoisted next to the other empire sweeps");
    });

    it("the inner guards survived the hoist unchanged", () => {
        assert.include(ROOMS, "everyRoom.controller && everyRoom.controller.my &&");
        assert.include(ROOMS, "everyRoom.find(FIND_MY_CONSTRUCTION_SITES).length == 0");
        assert.include(ROOMS, "everyRoom.memory.keepTheseRoads = [];");
        assert.include(ROOMS, "!everyRoom.memory.danger &&");
    });
});
