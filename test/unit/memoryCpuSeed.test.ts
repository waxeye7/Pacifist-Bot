import { assert } from "chai";
import fs from "fs";

/**
 * Memory.CPU WAS SEEDED AT THE END OF THE TICK, NOT THE START.
 *
 * CPUmanager ran at main.ts:493 and was the only place `Memory.CPU = {}`
 * existed. Every reader before it — rooms()' danger rung writing
 * `Memory.CPU.reduce`, the spawn producer reading it, a console command
 * reading `Memory.CPU.fiveHundredTickAvg.avg` — TypeErrored on the first
 * tick of a fresh deploy or after a partial memory wipe. The phase wrappers
 * caught it, so it never stayed broken — but the danger rung aborting means
 * the reduce flag was not written that tick either.
 *
 * MemoryManager is the existing seed site for top-level fields and runs at
 * boot.memoryManager, before any of those readers. Seeding the CPU shape
 * there kills the class; CPUmanager keeps its guards as no-ops.
 */
const MM = fs.readFileSync("src/Managers/MemoryManager.ts", "utf8");
const MAIN = fs.readFileSync("src/main.ts", "utf8");

describe("Memory.CPU is seeded before anything reads it", () => {
  it("seeds Memory.CPU in MemoryManager", () => {
    assert.match(MM, /if\(!Memory\.CPU\) \{\s*Memory\.CPU = \{\};/);
  });

  it("seeds the avg sub-objects a reader can reach into", () => {
    // Commands reads Memory.CPU.fiveHundredTickAvg.avg — seeding {} alone
    // moves the crash one level down.
    assert.include(MM, "Memory.CPU.hundredTickAvg = {data: [], avg: 0}");
    assert.include(MM, "Memory.CPU.fiveHundredTickAvg = {data: [], avg: 0}");
  });

  it("runs before the rooms and creeps phases", () => {
    const bootIdx = MAIN.indexOf('mark("boot.memoryManager"');
    const roomsIdx = MAIN.indexOf('phase("rooms"');
    const creepsIdx = MAIN.indexOf('phase("creeps"');
    assert.isAbove(bootIdx, -1, "boot.memoryManager missing from main.ts");
    assert.isBelow(bootIdx, roomsIdx, "MemoryManager must run before rooms()");
    assert.isBelow(bootIdx, creepsIdx, "MemoryManager must run before creeps");
  });
});
