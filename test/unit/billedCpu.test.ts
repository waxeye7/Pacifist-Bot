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

  it("surfaces the honest number in cpuStatus", () => {
    assert.include(CPUPOLICY, "`billed=${trueAvg}`");
  });
});
