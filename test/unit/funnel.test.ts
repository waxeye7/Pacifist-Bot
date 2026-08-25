/**
 * Empire/funnel: terminal energy to the room closest to RCL8. Live shard3 held
 * 31-46k idle in four RCL5 rooms while the only RCL6 sat on its 10k floor.
 */
import { assert } from "chai";
import * as fs from "fs";
import { pickMother, donorSurplus, sendAmount, donorReserve, FUNNEL_MIN_SEND, FUNNEL_MAX_SEND } from "../../src/Empire/funnel";
import { getCpuPolicy } from "../../src/utils/CpuPolicy";

function c(name: string, level: number, progress: number, hasStorage = true, hasSpawn = true) {
  return { name, level, progress, hasStorage, hasSpawn };
}

describe("Empire/funnel", () => {
  it("picks the highest RCL, ties broken by progress; RCL8 rooms never receive", () => {
    assert.strictEqual(pickMother([c("A", 6, 1000), c("B", 5, 900000), c("C", 6, 2000)]), "C");
    assert.strictEqual(pickMother([c("A", 8, 0), c("B", 6, 10)]), "B");
    assert.strictEqual(pickMother([c("A", 8, 0), c("B", 8, 10)]), "B", "all RCL8: still funnel (GCL)");
  });

  it("needs a storage and a spawn, and RCL5 or better", () => {
    assert.isNull(pickMother([c("A", 6, 0, false), c("B", 4, 0)]));
    assert.strictEqual(pickMother([c("A", 6, 0, true, false), c("B", 5, 0)]), "B");
  });

  it("a donor keeps its reserve and ships only what is above it", () => {
    assert.strictEqual(donorSurplus(46000, 6), 46000 - donorReserve(6));
    assert.strictEqual(donorSurplus(20000, 6), 0);
    assert.strictEqual(donorSurplus(120000, 8), 20000);
  });

  it("one send is bounded by the surplus, the cap, the mother's room and the fee", () => {
    assert.strictEqual(sendAmount(50000, 50000, 0.05, 100000), FUNNEL_MAX_SEND);
    assert.strictEqual(sendAmount(3000, 50000, 0.05, 100000), 3000);
    assert.strictEqual(sendAmount(3000, 2000, 0.05, 100000), 0, "terminal cannot pay amount + fee");
    assert.strictEqual(sendAmount(FUNNEL_MIN_SEND - 1, 50000, 0.05, 100000), 0, "fee-dominated noise");
    assert.strictEqual(sendAmount(50000, 50000, 0.05, 2500), 2500, "mother terminal nearly full");
  });

  it("spawning exempts the mother from the CPU clamp and reads the funnel", () => {
    const src = fs.readFileSync(__dirname + "/../../src/Rooms/rooms.spawning.ts", "utf8").replace(/\r\n/g, "\n");
    assert.include(src, "function upgraderCpuCap(room, want: number)");
    assert.include(src, "room.name === funnelMother() && bank >= UPGRADE_MID) return Math.min(want, 3)");
    assert.notInclude(src, "upgraderCpuCap(upgraderTarget(", "every call site passes the room");
    assert.notInclude(src, "upgraderCpuCap(spawnrules");
    assert.include(src, "budget = Math.max(budget, Math.floor(hardCap * BIG_UPGRADER_BUDGET))", "the queue clamp agrees with the 95% upgrader");
  });
});

describe("utils/CpuPolicy headroom rung", () => {
  function withCpu(limit: number, bucket: number, avg100: number, fn: () => void): void {
    const g: any = global;
    const prevGame = g.Game;
    const prevMemory = g.Memory;
    g.Game = { cpu: { limit, bucket } };
    g.Memory = { CPU: { hundredTickAvg: { avg: avg100 } } };
    try {
      fn();
    } finally {
      g.Game = prevGame;
      g.Memory = prevMemory;
    }
  }

  it("a full bucket does not buy 3 remotes when the average already sits at the limit", () => {
    withCpu(20, 9500, 18.6, () => {
      const p = getCpuPolicy();
      assert.isTrue(p.allowRemotes, "pinned bucket proves reserve");
      assert.strictEqual(p.maxRemotes, 1);
    });
  });

  it("real headroom buys the full rung", () => {
    withCpu(20, 9500, 15, () => assert.strictEqual(getCpuPolicy().maxRemotes, 3));
    withCpu(20, 9500, 17, () => assert.strictEqual(getCpuPolicy().maxRemotes, 2));
  });

  it("private servers are not headroom-capped", () => {
    withCpu(100, 9500, 99, () => assert.strictEqual(getCpuPolicy().maxRemotes, 8));
  });
});
