import { assert } from "chai";
import fs from "fs";
import { reserveBucketLatch } from "../../src/Rooms/rooms.spawning";

/**
 * ONE THRESHOLD CANNOT SWITCH AN ECONOMY ON AND OFF.
 *
 * The CPU arm of reserverGate read `Game.cpu.bucket < 9500` directly. That is a
 * bare edge on the one number reserving itself moves: a reservation doubles a
 * remote source from 5 to 10 e/tick, and everything downstream sizes off the
 * actual reservation state - remote miner WORK count, carrier fleet size, the
 * empire remote budget. So the tick the bucket touched 9,500 the empire arms
 * reservers, roughly doubles its remote creep count and its intent CPU, pushes
 * the bucket back under 9,500 and disarms, with the miner bodies and the
 * carrier demand flapping with it a spawn cycle at a time.
 *
 * seatContainerUpkeep.test already states the rule this breaks: "the rescue bar
 * and the stop-repairing bar have to be far apart, or a box hovering on one
 * number switches cadence every hundred ticks."
 *
 * Live shard3 2026-09-11: bucket 4,104 -> 4,325 -> 4,285 -> 4,304 against a
 * billed 19.8 of a 20 limit. The flap has never been observed only because the
 * bucket has not reached the bar yet; at that drift it is on course to.
 */
const SPAWN = fs.readFileSync("src/Rooms/rooms.spawning.ts", "utf8");
const g: any = global;

function withBucket(bucket: number): boolean {
  const prevGame = g.Game;
  g.Game = { cpu: { bucket, limit: 20 } };
  try {
    return reserveBucketLatch();
  } finally {
    g.Game = prevGame;
  }
}

describe("the reserver bucket gate is latched, not a bare edge", () => {
  beforeEach(() => {
    g.Memory = {};
  });

  it("stays off until the arm bar", () => {
    assert.isFalse(withBucket(0));
    assert.isFalse(withBucket(9499));
  });

  it("arms at the bar and stays armed through the band", () => {
    assert.isTrue(withBucket(9500));
    assert.isTrue(withBucket(9000));
    assert.isTrue(withBucket(7000));
    assert.isTrue(withBucket(6000));
  });

  it("only disarms well below the bar", () => {
    assert.isTrue(withBucket(9500));
    assert.isFalse(withBucket(5999));
  });

  it("does not re-arm on the way back up until the bar again", () => {
    assert.isTrue(withBucket(9500));
    assert.isFalse(withBucket(5999));
    assert.isFalse(withBucket(9499));
    assert.isTrue(withBucket(9500));
  });

  it("keeps the two bars far apart", () => {
    const arm = Number((SPAWN.match(/const RESERVE_BUCKET_ARM = (\d+);/) || [])[1]);
    const dis = Number((SPAWN.match(/const RESERVE_BUCKET_DISARM = (\d+);/) || [])[1]);
    assert.strictEqual(arm, 9500, "the owner's arm bar is unchanged");
    assert.isAtLeast(arm - dis, 3000, "a narrow band is the same flap in disguise");
  });

  it("survives a global reset, so the latch lives in Memory", () => {
    assert.include(SPAWN, "m._rsvLatch");
    assert.include(SPAWN, "const m: any = Memory as any;");
  });

  it("the gate calls the latch instead of reading the bucket", () => {
    assert.include(SPAWN, "if (Game.cpu.limit < 30 && !reserveBucketLatch())");
    assert.notMatch(SPAWN, /Game\.cpu\.limit < 30 && Game\.cpu\.bucket < 9500/);
  });
});
