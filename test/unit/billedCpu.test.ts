import { assert } from "chai";
import fs from "fs";

/**
 * THE BOT'S CPU METER WAS READING 1.3 LOW, AND THAT IS WHY THE BUCKET NEVER
 * CLIMBED.
 *
 * Live shard3 2026-09-11, remotes closed and optional roster closed, three
 * consecutive windows of 40 / 24 / 22 ticks:
 *
 *   reported avg100   18.23    18.23    18.23
 *   bucket delta       +32      +11       +3
 *   billed per tick   19.20    19.54    19.86
 *
 * Memory is serialised after main() returns, so no getUsed() call inside the
 * loop can see it. The bucket can: it moves by exactly `limit - billed`.
 *
 * These pins exist so a future editor cannot quietly turn the honest meter
 * back into a blind one.
 */
const CPUPOLICY = fs.readFileSync("src/utils/CpuPolicy.ts", "utf8");
const MAIN = fs.readFileSync("src/main.ts", "utf8");

describe("billed CPU, measured from the bucket", () => {
  it("recovers the billed cost as limit minus the bucket delta", () => {
    assert.include(CPUPOLICY, "export function sampleBilledFromBucket");
    assert.match(CPUPOLICY, /const billed = limit - \(bucket - prevBucket\);/);
  });

  it("only samples on consecutive ticks", () => {
    assert.match(CPUPOLICY, /if \(prevTick !== Game\.time - 1\) return;/);
  });

  it("takes no sample while the bucket is clamped at either end", () => {
    // A saturated meter reads nothing. At 10000 the surplus is discarded
    // rather than banked, so the delta understates the headroom; at 0 the
    // deficit is absorbed by the server skipping our ticks.
    assert.match(CPUPOLICY, /if \(prevBucket >= 10000 \|\| bucket >= 10000\) return;/);
    assert.match(CPUPOLICY, /if \(bucket <= 0 \|\| prevBucket <= 0\) return;/);
  });

  it("rejects a nonsense delta rather than averaging it in", () => {
    assert.match(CPUPOLICY, /billed < 0 \|\| billed > limit \* 10/);
  });

  it("keeps the average as one EMA number, not a window array", () => {
    // The finding this diagnostic proves is that Memory bytes cost CPU after
    // the loop. A hundred-element sample array would charge for the privilege
    // of measuring the charge.
    assert.include(CPUPOLICY, "const TRUE_CPU_ALPHA = 0.02;");
    assert.notMatch(CPUPOLICY, /trueAvg100\s*=\s*\[/);
    assert.notMatch(CPUPOLICY, /M\.CPU\.trueTick/);
  });

  it("runs in the prologue, before anything else moves the bucket", () => {
    assert.include(MAIN, 'mark("boot.trueCpu", () => sampleBilledFromBucket());');
    const trueIdx = MAIN.indexOf('mark("boot.trueCpu"');
    const policyIdx = MAIN.indexOf('mark("boot.policy"');
    assert.isAbove(trueIdx, 0);
    assert.isAbove(policyIdx, trueIdx, "the policy must read a fresh sample");
  });

  it("still assigns the policy it computes", () => {
    // Regression: the first cut of this change inserted the new mark() over
    // the top of `const policy = ...`, leaving policy typed void.
    assert.match(MAIN, /const policy = mark\("boot\.policy", \(\) => getCpuPolicy\(\)\)/);
  });

  it("throws away the global-reset tick", () => {
    // A reset costs 50-90 CPU on the tick that compiles the code, and that
    // charge lands in the bucket delta the FOLLOWING tick. Seeding a 0.02 EMA
    // with a 90-CPU sample poisons it for hundreds of ticks: the first live
    // reading after this shipped was trueAvg 74.51 while trueLast had already
    // settled at 20. A reset is a real cost but it is not the cost of a tick,
    // and every gate reading this average is asking what a tick normally costs.
    assert.include(CPUPOLICY, "let globalAge = 0;");
    assert.include(CPUPOLICY, "globalAge++;");
    assert.include(CPUPOLICY, "if (globalAge <= 2) {");
  });

  it("still records a baseline on the ticks it skips", () => {
    // Otherwise the first real sample would span a gap and be discarded too.
    const fn = CPUPOLICY.slice(CPUPOLICY.indexOf("export function sampleBilledFromBucket"));
    const skip = fn.slice(fn.indexOf("if (globalAge <= 2) {"), fn.indexOf("const limit ="));
    assert.include(skip, "M.CPU._btT = Game.time;");
    assert.include(skip, "M.CPU._btB = Game.cpu.bucket;");
  });

  it("re-seeds rather than trusting an impossible stored average", () => {
    // The first build of this meter seeded on a global-reset tick and read
    // trueAvg 42.38 against a trueLast of 20 while the bucket drifted in
    // single digits. At alpha 0.02 that washes out over hundreds of ticks,
    // and every gate reading it is wrong for all of them.
    assert.include(CPUPOLICY, "const stored = M.CPU.trueAvg;");
    assert.include(CPUPOLICY, "stored <= limit * 2 ? stored : undefined");
  });

  it("surfaces the honest number in cpuStatus", () => {
    assert.include(CPUPOLICY, "`billed=${trueAvg}`");
  });
});
