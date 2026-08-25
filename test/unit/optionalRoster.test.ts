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

  it("closes when the average sits at the limit (the live 20-CPU state)", () => {
    withCpu(20, 5000, 19.5, {}, () => assert.isFalse(optionalRosterOpen()));
  });

  it("reopens only below 85% once closed, stays open up to 92% (hysteresis)", () => {
    withCpu(20, 5000, 17.5, { _optRosterOpen: false }, () => assert.isFalse(optionalRosterOpen()));
    withCpu(20, 5000, 16.9, { _optRosterOpen: false }, () => assert.isTrue(optionalRosterOpen()));
    withCpu(20, 5000, 18.2, { _optRosterOpen: true }, () => assert.isTrue(optionalRosterOpen()));
    withCpu(20, 5000, 18.5, { _optRosterOpen: true }, () => assert.isFalse(optionalRosterOpen()));
  });

  it("the spawn rungs for repair, maintainer and sweeper read the gate", () => {
    const fs = require("fs");
    const src: string = fs.readFileSync(__dirname + "/../../src/Rooms/rooms.spawning.ts", "utf8").replace(/\r\n/g, "\n");
    assert.strictEqual((src.match(/optionalRosterOpen\(\) && maintainers </g) || []).length, 5);
    assert.include(src, "repairRosterOpen(repairers) && repairers < spawnrules[5]");
    assert.include(src, "repairRosterOpen(repairers) && repairers < spawnrules[6]");
    assert.include(src, "optionalRosterOpen() &&\n        wantSweepers > 0");
  });
});
