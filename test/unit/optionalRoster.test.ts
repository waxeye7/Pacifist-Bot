/**
 * Spawn-side twin of skipOptionalCreep. Live shard3 paid for 7W7C7M repairers
 * the CPU latch then idled every tick: the body was bought, the wall was not.
 */
import { assert } from "chai";
import { optionalRosterOpen, lowCpuShard } from "../../src/utils/CpuPolicy";

function withCpu(limit: number, bucket: number, avg100: number, mem: any, fn: () => void): void {
  const g: any = global;
  const prevGame = g.Game;
  const prevMemory = g.Memory;
  g.Game = { cpu: { limit, bucket } };
  g.Memory = Object.assign({ CPU: { hundredTickAvg: { avg: avg100 } } }, mem);
  try {
    fn();
  } finally {
    g.Game = prevGame;
    g.Memory = prevMemory;
  }
}

describe("utils/CpuPolicy optionalRosterOpen", () => {
  it("a 100-CPU private server never closes the roster", () => {
    withCpu(100, 500, 99, {}, () => {
      assert.isFalse(lowCpuShard());
      assert.isTrue(optionalRosterOpen());
    });
  });

  it("closes on a sick bucket regardless of the average", () => {
    withCpu(20, 1999, 10, {}, () => assert.isFalse(optionalRosterOpen()));
  });

  it("a real SURPLUS keeps the roster open however high the average runs", () => {
    // WAS "closes when the average sits at the limit". That rule closed at
    // avg >= 18.4 and reopened at avg < 17.0 — and the bot's MEASURED floor,
    // with this roster already shut and every remote already closed, is 18.1
    // (live shard3 2026-09-10, 40 consecutive ticks 17.85-18.80). The reopen
    // bar was below the cheapest the bot can be, so the latch was one-way and
    // live memory read `_optRosterOpen: false` on a stable 3,354 bucket.
    //
    // An average at the limit with a bucket that is NOT falling is a bot
    // paying its way. The bucket is the only signal here that moves in both
    // directions, so it is the one the gate reads. skipOptionalCreep still
    // idles these roles per tick, so the per-tick brake is unchanged.
    withCpu(20, 6000, 19.5, {}, () => assert.isTrue(optionalRosterOpen()));
    withCpu(20, 5000, 21.2, { _optRosterOpen: false }, () => assert.isTrue(optionalRosterOpen()));
  });

  it("closes once the surplus is spent, so the walls are a duty cycle not a drain", () => {
    // Opened permanently (the first cut of the fix: open 3000 / close 2000) it
    // took avg100 to 21.2 against a limit of 20 and drained the live bucket
    // 4687 -> 2535. A rampart decays 3 hits/tick; it needs a SHARE of the
    // time, not all of it.
    withCpu(20, 2999, 12, { _optRosterOpen: true }, () => assert.isFalse(optionalRosterOpen()));
    // mid-band holds whatever it was, in both directions
    withCpu(20, 4000, 5, { _optRosterOpen: true }, () => assert.isTrue(optionalRosterOpen()));
    withCpu(20, 4000, 5, { _optRosterOpen: false }, () => assert.isFalse(optionalRosterOpen()));
  });

  it("the spawn rungs for repair, maintainer and sweeper read the gate", () => {
    const fs = require("fs");
    const src: string = fs.readFileSync(__dirname + "/../../src/Rooms/rooms.spawning.ts", "utf8").replace(/\r\n/g, "\n");
    // The maintainer rungs read it for ORDINARY wear only. The room's own
    // critical flag (a rampart at the tower floor, a container near death)
    // jumps the gate — see test/unit/upkeepFloor and repairRosterOpen below,
    // which has carried the same escape for the shell all along. Without it
    // live shard3 held zero maintainers across seven rooms for as long as the
    // bucket stayed under 5,000, while its containers decayed toward 22%.
    //
    // UPDATED 2026-09-11: the five copies of that disjunction are now one
    // function, maintainerDemand, because the roster half of it had no bank
    // test and a room holding 1,031 energy bought a 3,500 energy body that
    // parked in the spawn. See test/unit/maintainerParkAtBirth. The gate still
    // has to be READ by all five rungs, which is what this counts.
    assert.strictEqual(
      (src.match(/maintainerDemand\(room, spawnMaintainer\) && maintainers </g) || []).length,
      5
    );
    assert.match(src, /function maintainerDemand[\s\S]{0,200}optionalRosterOpen\(\)/);
    assert.include(src, "repairRosterOpen(room, repairers, rampartsInRoom) && repairers < spawnrules[5]");
    assert.include(src, "repairRosterOpen(room, repairers, rampartsInRoom) && repairers < spawnrules[6]");
    assert.include(src, "optionalRosterOpen() &&\n        wantSweepers > 0");
  });
});
