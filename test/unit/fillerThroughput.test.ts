/**
 * "rooms arent refilling the extensions fast enough" — owner, live shard3
 * 2026-09-10, with every room holding 9k-20k in storage and its extensions
 * between 33% and 68% full.
 */
import { assert } from "chai";
import * as fs from "fs";
import { fillerBody, fillerPartCap } from "../../src/Rooms/spawnSafety";

const room = (lvl: number, cap: number) => ({ controller: { level: lvl }, energyCapacityAvailable: cap });
const carryOf = (b: any[]) => b.filter((p) => p === CARRY).length * 50;
const cost = (b: any[]) => b.reduce((s, p) => s + (BODYPART_COST as any)[p], 0);

/** Extension network + spawn a room of this level actually has to fill. */
const NETWORK: { [lvl: number]: number } = { 5: 1800, 6: 2300, 7: 5300 };

describe("filler throughput", () => {
  it("one filler refills its own network in a handful of loads", () => {
    // The rungs ask for amount: 1 at RCL6, 7 and 8, and fillersWanted returns
    // max(1, base) — so with no remotes open this IS the room's whole fill
    // layer. At the old 12-part cap that was 400 carry against 2,000-5,000.
    for (const lvl of [5, 6, 7]) {
      const b = fillerBody(room(lvl, NETWORK[lvl]));
      const loads = NETWORK[lvl] / carryOf(b);
      assert.isAtMost(loads, 6, `RCL${lvl} needs ${loads.toFixed(1)} loads`);
    }
  });

  it("RCL6 and RCL7 both got strictly bigger than the old ladder", () => {
    assert.isAbove(carryOf(fillerBody(room(6, 2300))), 400, "was 8 CARRY");
    assert.isAbove(carryOf(fillerBody(room(7, 5300))), 600, "was 12 CARRY");
  });

  it("...without buying a second creep, which is what CPU cannot afford", () => {
    const src = fs.readFileSync(__dirname + "/../../src/Rooms/rooms.spawning.ts", "utf8").replace(/\r\n/g, "\n");
    // the roster stays at one per room; throughput came from the body
    for (const lvl of [6, 7, 8]) {
      const i = src.indexOf("\n        " + lvl + ": () => ({");
      assert.isAbove(i, 0, "RCL" + lvl + " rung");
      const rung = src.slice(i, src.indexOf("energy_manager_creep", i));
      const fi = rung.indexOf("filler_creep");
      // code lines only — the rung carries a long note above `amount`
      const decl = rung
        .slice(fi)
        .split("\n")
        .filter((l) => /^\s*(amount|body):/.test(l))
        .slice(0, 2);
      assert.deepEqual(decl.map((l) => l.trim()), ["amount: 1,", "body:   fillerBody(room),"], "RCL" + lvl);
    }
  });

  it("the body still fits the room's own spawn budget", () => {
    for (const [lvl, cap] of [[5, 1800], [6, 2300], [7, 5300], [8, 12900]] as [number, number][]) {
      const b = fillerBody(room(lvl, cap));
      assert.isAtMost(cost(b), Math.floor(cap * 0.85), "RCL" + lvl + " affordable");
      assert.isAtMost(b.length, fillerPartCap(lvl));
      assert.isAtMost(b.length, 50, "engine body limit");
    }
  });

  it("a thin room still gets a filler it can pay for today", () => {
    // capacity collapses when extensions are destroyed; the body must follow
    const b = fillerBody(room(6, 300));
    assert.isAtMost(cost(b), 300);
    assert.isAtLeast(b.filter((p) => p === CARRY).length, 1);
    assert.isAtLeast(b.filter((p) => p === MOVE).length, 1);
  });

  it("the ladder is monotone in RCL", () => {
    let prev = 0;
    for (const lvl of [5, 6, 7, 8]) {
      const cap = fillerPartCap(lvl);
      assert.isAtLeast(cap, prev, "RCL" + lvl);
      prev = cap;
    }
  });

  it("hatch time stays inside a creep lifetime by a wide margin", () => {
    // 3 ticks per part; the last-filler handoff re-queues before it dies.
    for (const [lvl, cap] of [[6, 2300], [7, 5300], [8, 12900]] as [number, number][]) {
      assert.isBelow(fillerBody(room(lvl, cap)).length * 3, 150, "RCL" + lvl + " hatch");
    }
  });
});
