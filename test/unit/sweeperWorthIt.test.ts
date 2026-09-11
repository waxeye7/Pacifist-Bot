import { assert } from "chai";
import fs from "fs";

/**
 * A TOMBSTONE HOLDING 5 ENERGY HATCHED A 300-ENERGY CREEP.
 *
 * The sweeper rung accepts a tombstone or ruin whose store is ONE. Dropped
 * piles have carried a `>= 50` floor forever; tombs and ruins never got one,
 * which is the tell that the value question was never asked on that path. The
 * roster rung then reads pile COUNT rather than amount, so a single scrap is
 * enough to buy a creep.
 *
 * Live shard3 2026-09-11, sampled across all seven owned rooms: six sweepers
 * alive, five of them standing in rooms with zero tombstones, zero ruins and
 * zero dropped piles, holding 2, 5, 22, 39 and 0 energy. They had been hatched
 * for scraps and had already eaten them. Memory.cpuSkip over the same window
 * read 186 creep-runs dropped by the CPU latch in 42 ticks, of which 107 were
 * sweepers: the largest discretionary load in the empire and the first thing
 * the latch throws overboard.
 *
 * CPU, not energy, is the binding constraint on this account -- the remote cap
 * sits at 1 because the headroom rung measures 1.95 CPU of slack against a 20
 * limit, and six sweepers at ~0.25 each are ~1.3 of that.
 */
const SPAWNING = fs.readFileSync("src/Rooms/rooms.spawning.ts", "utf8");
const at = SPAWNING.indexOf("Sweep floor loot");
const RUNG = SPAWNING.slice(at, at + 8000);

describe("a sweeper has to be worth more than the loot it fetches", () => {
  it("has a value bar at all", () => {
    assert.include(RUNG, "const SWEEP_WORTH_IT = 300;");
  });

  it("the bar is the cost of the smallest body it would buy", () => {
    // 4 CARRY + 2 MOVE at 50 each. Break-even on energy before the recycle
    // refund and before any CPU, which is the least defensible bar that a
    // single scrap can still never clear.
    const bar = Number((RUNG.match(/const SWEEP_WORTH_IT = (\d+);/) || [])[1]);
    assert.equal(bar, 300);
  });

  it("gates the roster, not just the body", () => {
    assert.include(RUNG, "(sweepHasGoods || sweepLootAmount >= SWEEP_WORTH_IT)");
    const gate = RUNG.indexOf("sweepLootAmount >= SWEEP_WORTH_IT");
    const want = RUNG.indexOf("const wantSweepers =");
    assert.isAbove(gate, want, "the bar belongs inside wantSweepers");
  });

  it("measures the amount, which the old rung never looked at", () => {
    // wantSweepers read pile COUNT. Amount is what decides whether a trip pays.
    assert.include(RUNG, "Math.floor((looseLootCount + 1) / 3)");
    assert.include(RUNG, "sweepLootAmount");
  });

  it("lets minerals and power through at any amount", () => {
    // A tombstone with 40 units of a compound is worth far more than 40
    // energy, and the bar is an energy bar.
    assert.include(RUNG, "let sweepHasGoods = sweepBulkSink");
    assert.include(RUNG, "_.sum(s.store) - (s.store[RESOURCE_ENERGY] || 0) > 0");
    assert.include(RUNG, "if(piles.some((r: any) => r.resourceType != RESOURCE_ENERGY)) sweepHasGoods = true;");
  });

  it("leaves the bootstrap rung below RCL4 alone", () => {
    // That rung buys a 150-energy creep, already excludes the drop-mine piles
    // on the source tile, and a bootstrapping room has no slack to lose.
    const i = RUNG.indexOf("const wantSweepers =");
    const decl = RUNG.slice(i, i + 400);
    assert.include(decl.replace(/\s+/g, " "), "room.controller.level < 4 ? 1");
  });

  it("cannot flap, because nothing culls a live sweeper", () => {
    // A sweeper that picks loot up drives sweepLootAmount back under the bar.
    // That is only safe while the rung is add-only: it compares
    // `sweepers < wantSweepers` and never kills one mid-load.
    assert.include(RUNG, "sweepers < wantSweepers");
    assert.notInclude(RUNG, "sweepers > wantSweepers");
  });

  it("keeps the body scaling that shipped with it", () => {
    // Same measurement feeds both: how much is out there sizes the creep, and
    // now also decides whether to buy one.
    assert.include(RUNG, "const SWEEP_TRIPS = 2;");
    assert.include(RUNG, "Math.ceil(sweepLootAmount / SWEEP_TRIPS / 50)");
  });
});
