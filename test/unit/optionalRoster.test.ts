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

  it("a full bucket keeps the roster open however high the average runs", () => {
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
    withCpu(20, 5000, 19.5, {}, () => assert.isTrue(optionalRosterOpen()));
    withCpu(20, 3354, 18.3, { _optRosterOpen: false }, () => assert.isTrue(optionalRosterOpen()));
  });

  it("deadbands between 2000 and 3000 so a 1500-tick roster cannot flap", () => {
    withCpu(20, 2500, 5, { _optRosterOpen: true }, () => assert.isTrue(optionalRosterOpen()));
    withCpu(20, 2500, 5, { _optRosterOpen: false }, () => assert.isFalse(optionalRosterOpen()));
    // ...and the ends of the band are decisive whatever the previous answer was
    withCpu(20, 3000, 19.9, { _optRosterOpen: false }, () => assert.isTrue(optionalRosterOpen()));
    withCpu(20, 1999, 1, { _optRosterOpen: true }, () => assert.isFalse(optionalRosterOpen()));
  });

  it("the spawn rungs for repair, maintainer and sweeper read the gate", () => {
    const fs = require("fs");
    const src: string = fs.readFileSync(__dirname + "/../../src/Rooms/rooms.spawning.ts", "utf8").replace(/\r\n/g, "\n");
    assert.strictEqual((src.match(/optionalRosterOpen\(\) && maintainers </g) || []).length, 5);
    assert.include(src, "repairRosterOpen(repairers, rampartsInRoom) && repairers < spawnrules[5]");
    assert.include(src, "repairRosterOpen(repairers, rampartsInRoom) && repairers < spawnrules[6]");
    assert.include(src, "optionalRosterOpen() &&\n        wantSweepers > 0");
  });
});
