import { assert } from "chai";
import fs from "fs";

/**
 * `0 % 35 == 0` IS TRUE, AND THAT RAN THE MOST EXPENSIVE CALL IN THE ROOMS
 * PASS EVERY SINGLE TICK.
 *
 * `lastTimeSpawnUsed` is stamped with Game.time on every tick where the
 * primary spawn is busy and a second spawn is free. In a multi-spawn room that
 * makes `Game.time - lastTimeSpawnUsed` zero every tick, so the two periodic
 * producer arms fired every tick instead of every 35 or 20 — in exactly the
 * busy rooms least able to afford it.
 *
 * The %500 arm immediately below them was already fixed this way and carries a
 * comment saying why; these two were left behind.
 *
 * Live shard3 2026-09-11: Memory.CPU.roomParts put spawn.producer at 1.24 CPU
 * a tick against a whole rooms phase of 4.23, on a bot billing 18.7 against a
 * 20 limit with three RCL7 rooms holding two or three spawns each.
 */
const SP = fs.readFileSync("src/Rooms/rooms.spawning.ts", "utf8");
const CODE = SP.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("the spawn producer runs on a real cadence", () => {
  it("uses an absolute clock for both periodic arms", () => {
    assert.include(CODE, "const producerTick = Game.time + roomTickOffset(room.name);");
    assert.include(CODE, "producerTick % 35 == 0");
    assert.include(CODE, "producerTick % 20 == 0");
  });

  it("no longer measures the cadence from a clock a busy spawn resets", () => {
    assert.notMatch(CODE, /\(Game\.time - room\.memory\.lastTimeSpawnUsed\) % 35 == 0/);
    assert.notMatch(CODE, /\(Game\.time - room\.memory\.lastTimeSpawnUsed\) % 20 == 0/);
  });

  it("keeps the prompt re-derive two ticks after a spawn finishes", () => {
    // That arm is what the relative clock is genuinely for, and it is correct:
    // it fires once, on a specific difference, not on a modulus.
    assert.include(CODE, "Game.time - room.memory.lastTimeSpawnUsed == 2");
  });

  it("phases the sweep per room", () => {
    // Seven rooms on a bare residue deliver the same total work as one spike.
    // This bot has been bitten by that five separate times; see
    // roomCadencePhase.test.ts and maintainerOverrideCap.test.ts.
    // Pinned by name, not by position in the import list: the list grows.
    const imp = SP.slice(SP.indexOf('from "./rooms.remotes"') - 200,
                         SP.indexOf('from "./rooms.remotes"'));
    assert.include(imp, "roomTickOffset");
  });

  it("leaves the %500 arm on plain Game.time, as its own comment requires", () => {
    // It is deliberately empire-synchronised: it is the "queue is not empty"
    // sweep, and its comment explains the absolute clock is the fix, not a bug.
    assert.include(CODE, "room.memory.spawn_list.length >= 1 && Game.time % 500 == 0");
  });

  it("moved the danger arm to the absolute clock too", () => {
    // `danger` is exactly when `lastTimeSpawnUsed` is stamped every tick —
    // (Game.time - lastTimeSpawnUsed) % 7 was 0 every tick and the producer
    // ran every tick through the siege. This was the last relative-clock arm.
    assert.notMatch(CODE, /\(Game\.time - room\.memory\.lastTimeSpawnUsed\) % \d+ == 0/);
    assert.include(CODE, "room.memory.danger && producerTick % 7 == 0 && room.memory.spawn_list.length == 0");
  });
});
