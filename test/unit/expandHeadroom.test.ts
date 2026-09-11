import { assert } from "chai";
import fs from "fs";

/**
 * A 1.33 CPU MEASUREMENT ERROR DECIDED AN EIGHTH ROOM.
 *
 * AutoExpand requires CPU_HEADROOM (3) spare before claiming, and it read
 * hundredTickAvg to decide. That is end-of-loop getUsed(); Memory is
 * serialised AFTER main() returns and the server bills us for it, so avg100
 * understates the real cost by the post-loop write — measured on this bot at
 * 1.33 CPU every tick, invisibly.
 *
 * Live shard3 2026-09-11: the bucket crossed MIN_BUCKET, avg100 read about
 * 17.0 in a quiet window, 17.0 + 3 = 20.0 did not exceed the 20 limit, and the
 * bot armed a claim on E39N56 and sent a claimer twelve rooms around the map.
 * The BILLED average at that moment was 18.6-19.3, so the honest test is
 * 19.3 + 3 = 22.3 against 20 and the gate refuses — which is what it was
 * written to do, on an account permanently capped at 20 CPU already running
 * seven rooms at 19+ billed.
 *
 * The same mistake, budgeting from avg100 instead of the billed number, is
 * what empireRemoteBudget avoids by construction; see remoteEmpireBudget.test.
 */
const AE = fs.readFileSync("src/Managers/AutoExpand.ts", "utf8");
const CODE = AE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("expansion measures headroom with the billed number", () => {
  /*
   * UPDATED 2026-09-11: this file's fallback expression was inlined here, and
   * a third spender (War/dispatch guardCap) turned out to have its own copy
   * that still read avg100. All three now call CpuPolicy.billedAvg; the
   * preference order and the avg100 fallback are tested against the live
   * function in test/unit/billedBudget.
   */
  it("reads the shared billed meter, not a local copy", () => {
    assert.include(CODE, "const billed = billedAvg();");
    assert.include(CODE, 'import { billedAvg } from "utils/CpuPolicy";');
    assert.notMatch(CODE, /M2\.CPU\.trueAvg/);
    assert.notMatch(CODE, /hundredTickAvg/);
  });

  it("tests the billed figure against the limit, not the in-loop one", () => {
    assert.match(CODE, /if \(billed > 0 && billed \+ CPU_HEADROOM > limit\)/);
    assert.notMatch(CODE, /if \(avg > 0 && avg \+ CPU_HEADROOM > limit\)/);
  });

  it("keeps the headroom it demands", () => {
    // One more room measured at 2-4 CPU on this bot; 3 with the bucket test as
    // the safety net. Lowering this is how a capped account claims a room it
    // cannot run.
    assert.include(CODE, "const CPU_HEADROOM = 3;");
  });

  it("says billed in the refusal, so the log is not misleading", () => {
    assert.match(AE, /billed — no headroom for another room/);
  });
});
