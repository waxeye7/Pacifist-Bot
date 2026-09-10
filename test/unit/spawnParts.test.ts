import { assert } from "chai";
import fs from "fs";

/**
 * THE SPAWNING CALL IS HALF THE ROOMS PASS.
 *
 * Settled room parts, live shard3 2026-09-11: spawning 1.96, market 0.62,
 * defence 0.52, planV2Place 0.49, refreshUnreachable 0.30, everything else
 * under 0.04. The bot bills 19.7 against a 20 limit, the bucket needs 4,000
 * before remotes may open, and that gate also wants the in-loop average under
 * 18. Creep intents cost 0.2 apiece and cannot be argued down; this can.
 *
 * Every `spawn.*` key is a SLICE of `spawning`, not a sibling, so a reader
 * must not add them to the room-part total a second time.
 */
const SP = fs.readFileSync("src/Rooms/rooms.spawning.ts", "utf8");
const CODE = SP.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("the spawning call is broken down", () => {
  it("measures each every-tick stage", () => {
    for (const key of [
      "spawn.stats",
      "spawn.rescueOnce",
      "spawn.queueHygiene",
      "spawn.ladder",
      "spawn.dropNonRecovery",
      "spawn.firstInLine",
      "spawn.producer",
    ]) {
      assert.include(CODE, `roomPart("${key}"`, key);
    }
  });

  it("keeps the ladder's early return", () => {
    // runSpawnLadder returning true means it took the spawn this tick, and
    // everything below must be skipped. Wrapping it must not swallow that.
    assert.match(
      CODE,
      /if\(spawnLadderEnabled\(\) && roomPart\("spawn\.ladder", \(\) => runSpawnLadder\(room, spawn\)\)\) return;/
    );
  });

  it("keeps spawnFirstInLine's status, which gates the producer", () => {
    assert.match(
      CODE,
      /let status = roomPart\("spawn\.firstInLine", \(\) => spawnFirstInLine\(room, spawn\)\);/
    );
    assert.include(CODE, 'if(status == "spawning")');
  });

  it("keeps the producer and the clamp together", () => {
    // clampSpawnListToCapacity exists to catch bodies the producer just queued
    // that the room cannot afford; separating them would let one run without
    // the other on an early return.
    assert.match(CODE, /add_creeps_to_spawn_list\(room, spawn\);\s*\n\s*clampSpawnListToCapacity\(room\);/);
  });

  it("leaves no bare call that a spawn part now owns", () => {
    for (const call of [
      "rememberOwnedRoomStats(room);",
      "dropNonRecoverySpend(room);",
    ]) {
      const escaped = call.replace(/[()]/g, "\\$&");
      const bare = new RegExp(`^\\s{0,8}${escaped}`, "m");
      assert.notMatch(CODE, bare, call);
    }
  });
});
