/**
 * Bodies and gates that were sized against the wrong quantity.
 *
 * Owner report, live shard3 2026-09-10: "it's like spawning a builder when I
 * have barely any energy in my storage, and there's three energy miners in my
 * room ... there should only be two".
 */
import { assert } from "chai";
import * as fs from "fs";
import {
  homeMinerBody,
  MINER_WORK_SATURATES,
  HOME_SOURCE_ENERGY_PER_TICK,
  builderPartCap,
} from "../../src/Rooms/spawnSafety";
import { OPT_ROSTER_CLOSE_BUCKET, OPT_ROSTER_OPEN_BUCKET, optionalRosterOpen } from "../../src/utils/CpuPolicy";

const cost = (b: any[]): number => b.reduce((s, p) => s + (BODYPART_COST as any)[p], 0);
const parts = (b: any[], p: any): number => b.filter((x) => x === p).length;

describe("home miner sizing", () => {
  it("five WORK takes everything a home source produces", () => {
    // SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME = 3000/300, HARVEST_POWER = 2.
    assert.strictEqual(HOME_SOURCE_ENERGY_PER_TICK, 10);
    assert.strictEqual(MINER_WORK_SATURATES, 5);
    assert.strictEqual(MINER_WORK_SATURATES * 2, HOME_SOURCE_ENERGY_PER_TICK);
  });

  it("never buys a WORK part the source cannot feed, at any capacity", () => {
    for (const cap of [300, 550, 800, 1300, 1800, 2300, 3300, 4700, 12900]) {
      const b = homeMinerBody(cap);
      assert.isAtMost(parts(b, WORK), MINER_WORK_SATURATES, "peace body at cap " + cap);
      assert.isAtMost(parts(homeMinerBody(cap, true), WORK), MINER_WORK_SATURATES, "danger body at cap " + cap);
      assert.isAtMost(cost(b), cap, "affordable at cap " + cap);
      assert.isAtLeast(parts(b, MOVE), 1, "can walk at cap " + cap);
    }
  });

  it("the RCL6/7 body is the one the source can actually feed", () => {
    // E37N58 live: energyCapacityAvailable 4700, storage 388, and it had just
    // paid 2500 for [18W,5C,9M] on a source a 5W stopgap was already draining.
    const b = homeMinerBody(4700);
    assert.strictEqual(parts(b, WORK), 5);
    assert.strictEqual(cost(b), 950);
    assert.isBelow(cost(b), 1500, "cheaper than the old 10W body");
    assert.isBelow(b.length * 3, 60, "hatches in under 60 ticks");
  });

  it("a miner is never worth more than a fifth of the source it sits on", () => {
    // A body is an annuity against one 10 e/t tap over CREEP_LIFE_TIME.
    const perTick = cost(homeMinerBody(12900)) / 1500;
    assert.isBelow(perTick / HOME_SOURCE_ENERGY_PER_TICK, 0.2);
  });

  it("danger buys MOVE, never more WORK", () => {
    const d = homeMinerBody(2300, true);
    const p = homeMinerBody(2300, false);
    assert.strictEqual(parts(d, WORK), parts(p, WORK));
    assert.isAbove(parts(d, MOVE), parts(p, MOVE));
  });

  it("the oversized hardcoded bodies are gone from the producer", () => {
    const src = fs.readFileSync(__dirname + "/../../src/Rooms/rooms.spawning.ts", "utf8");
    // the 18W body: nine WORK in a row appeared only there
    assert.notInclude(src, "WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,MOVE");
    assert.include(src, "homeMinerBody(room.energyCapacityAvailable, danger)");
  });
});

describe("builder sizing follows the bank", () => {
  it("a rich room keeps the full body, a broke one does not", () => {
    assert.strictEqual(builderPartCap(true, 0), 50);
    assert.strictEqual(builderPartCap(false, 388), 10, "E37N58: 388 in storage");
    assert.strictEqual(builderPartCap(false, 16808), 20, "E36N57: 16.8k in storage");
  });

  it("the thin-bank cap is monotone in the bank", () => {
    let prev = 0;
    for (const bank of [0, 388, 9999, 10000, 100000]) {
      const cap = builderPartCap(false, bank);
      assert.isAtLeast(cap, prev);
      prev = cap;
    }
    assert.isAtMost(builderPartCap(false, 1e9), builderPartCap(true, 1e9));
  });

  it("queueBuilder sizes the body, not just the count", () => {
    const src = fs.readFileSync(__dirname + "/../../src/Rooms/rooms.spawning.ts", "utf8");
    const i = src.indexOf("function queueBuilder");
    assert.isAbove(i, 0);
    const block = src.slice(i, i + 3500);
    assert.include(block, "builderPartCap(rich,");
    assert.notInclude(block, "spawn_list.push(rules.build_creep.body");
  });
});

describe("the optional roster latch can reopen", () => {
  function withCpu(bucket: number, avg: number, prevOpen: boolean | undefined, fn: () => void): void {
    const g: any = global;
    const pg = g.Game, pm = g.Memory;
    g.Game = { cpu: { limit: 20, bucket } };
    g.Memory = { CPU: { hundredTickAvg: { avg } } };
    if (prevOpen !== undefined) (g.Memory as any)._optRosterOpen = prevOpen;
    try { fn(); } finally { g.Game = pg; g.Memory = pm; }
  }

  it("reopens at the bot's real running average — the bug", () => {
    // Live: bucket 3354, avg100 18.3, _optRosterOpen false. The old rule
    // demanded avg < 17.0 to reopen and the bot's measured floor is 18.1, so
    // repair/maintainer/sweeper were unbuyable for good.
    withCpu(3354, 18.3, false, () => {
      assert.isTrue(optionalRosterOpen(), "a healthy bucket reopens the roster");
    });
  });

  it("still closes when the bucket is genuinely draining", () => {
    withCpu(OPT_ROSTER_CLOSE_BUCKET - 1, 12, true, () => assert.isFalse(optionalRosterOpen()));
  });

  it("holds the previous answer inside the deadband", () => {
    const mid = Math.floor((OPT_ROSTER_CLOSE_BUCKET + OPT_ROSTER_OPEN_BUCKET) / 2);
    withCpu(mid, 19.9, true, () => assert.isTrue(optionalRosterOpen()));
    withCpu(mid, 10, false, () => assert.isFalse(optionalRosterOpen()));
  });

  it("no longer reads the 100-tick average at all", () => {
    const src = fs.readFileSync(__dirname + "/../../src/utils/CpuPolicy.ts", "utf8");
    const i = src.indexOf("export function optionalRosterOpen");
    const block = src.slice(i, src.indexOf("export function creepRoleIsOptional"));
    const code = block.split("\n").filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join("\n");
    assert.notInclude(code, "hundredTickAvg");
  });
});

describe("stopgaps retire while the spawn is busy", () => {
  it("retirement is driven per room, not from behind the spawn-idle gate", () => {
    const ladder = fs.readFileSync(__dirname + "/../../src/Rooms/spawnLadder.ts", "utf8");
    assert.include(ladder, "export function retireStopgapsFor");
    const rooms = fs.readFileSync(__dirname + "/../../src/Rooms/rooms.ts", "utf8");
    assert.include(rooms, "retireStopgapsFor(room)");
    // It runs in the room pass, ahead of spawning() — so a busy spawn (which
    // makes runSpawnLadder bail on line 1) cannot skip it.
    const call = rooms.indexOf("retireStopgapsFor(room)");
    const spawnPass = rooms.indexOf("spawning(room)");
    assert.isAbove(call, 0);
    assert.isAbove(spawnPass, call, "retirement runs before the spawn pass");
    // ...and the entry point's CODE must not look at a spawn at all (its
    // doc comment explains why, so strip comments before asserting).
    const start = ladder.indexOf("export function retireStopgapsFor");
    const body = ladder
      .slice(start, ladder.indexOf("\n/**", start))
      .split("\n")
      .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))
      .join("\n");
    assert.include(body, "yieldStopgaps");
    assert.notInclude(body, "spawn.spawning");
    assert.notInclude(body, "spawning");
  });
});
