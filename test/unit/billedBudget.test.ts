import { assert } from "chai";
import fs from "fs";
import { billedAvg, getCpuPolicy } from "../../src/utils/CpuPolicy";

/**
 * THREE SUBSYSTEMS SPEND CPU HEADROOM AND ONE OF THEM STILL MEASURED IT WRONG.
 *
 * Memory is serialised AFTER main() returns and the server bills us for it, so
 * hundredTickAvg — end-of-loop getUsed() — understates the real cost by the
 * post-loop write. Measured on this bot at 1.32-1.42 CPU a tick against a 20
 * limit: 7% of the entire budget, invisible to every in-game profiler.
 *
 * AutoExpand was fixed when the gap armed a claim on an eighth room.
 * empireRemoteBudget was written against the billed figure from the start.
 * War/dispatch was not: guardCap turned `limit - avg100` into a Guard count,
 * and warEconomyBlocked refused offence only at `avg >= limit - 1`.
 *
 * Live shard3 2026-09-11: avg100 read 18.4-19.0 while the billed figure was
 * 20.2-20.5 against a 20 limit. The honest answer was "already over the
 * limit"; both war gates read 1-1.6 CPU spare and let a Guard out. A Guard
 * alone in a foreign room is 0.3-0.8 CPU — no shared matrix, no shared finds —
 * which is the most expensive creep the bot runs.
 *
 * Three copies of one fallback expression are three chances to write the wrong
 * one. There is now exactly one.
 */
const CP = fs.readFileSync("src/utils/CpuPolicy.ts", "utf8");
const AE = fs.readFileSync("src/Managers/AutoExpand.ts", "utf8");
const WD = fs.readFileSync("src/War/dispatch.ts", "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("billedAvg is the one CPU meter the spenders read", () => {
  const g: any = global;

  function withMem(mem: any, fn: () => void): void {
    const prev = g.Memory;
    g.Memory = mem;
    try { fn(); } finally { g.Memory = prev; }
  }

  it("prefers the billed sample", () => {
    withMem({ CPU: { trueAvg: 20.4, hundredTickAvg: { avg: 18.4 } } }, () => {
      assert.strictEqual(billedAvg(), 20.4);
    });
  });

  it("falls back to avg100 before the first billed sample exists", () => {
    // sampleBilledFromBucket takes no sample on the first two ticks of a
    // global, so there is a real window with no billed figure at all.
    withMem({ CPU: { hundredTickAvg: { avg: 18.4 } } }, () => {
      assert.strictEqual(billedAvg(), 18.4);
    });
  });

  it("returns 0 rather than NaN when there is nothing at all", () => {
    // Every caller tests `> 0` before trusting it; NaN would pass none of
    // those tests and silently open every gate.
    withMem({}, () => assert.strictEqual(billedAvg(), 0));
    withMem({ CPU: {} }, () => assert.strictEqual(billedAvg(), 0));
  });

  it("ignores a zero or negative trueAvg", () => {
    withMem({ CPU: { trueAvg: 0, hundredTickAvg: { avg: 18.4 } } }, () => {
      assert.strictEqual(billedAvg(), 18.4);
    });
  });

  it("AutoExpand reads it instead of its own copy", () => {
    const code = strip(AE);
    assert.include(code, "const billed = billedAvg();");
    assert.include(code, 'import { billedAvg } from "utils/CpuPolicy";');
    assert.notMatch(code, /M2\.CPU\.trueAvg/, "the inlined copy must be gone");
  });

  it("empireRemoteBudget reads it instead of its own copy", () => {
    const fn = strip(CP).slice(
      strip(CP).indexOf("export function empireRemoteBudget"),
      strip(CP).indexOf("export function getCpuPolicy"),
    );
    assert.include(fn, "const billed = billedAvg();");
    assert.notMatch(fn, /hundredTickAvg/, "the inlined fallback must be gone");
  });

  it("the remote headroom rung reads it too", () => {
    /*
     * getCpuPolicy's headroom rung prices "what the average can actually
     * pay for" — the same class of decision — but computed headroom from
     * avg100. Live shard3: avg100 16.3 read 3.7 of headroom (rung 2) while
     * billed 19.3 had 0.7 (rung 1). Remote HOLDS are cap-gated, so the
     * overgranted cap sustained over-budget remotes until the bucket
     * drained through the stay bar — the documented oscillation.
     */
    const code = strip(CP);
    assert.include(code, "const headroom = billed > 0 ? limit - billed : limit;");
    assert.notInclude(code, "const headroom = avg > 0 ? limit - avg : limit;");
  });

  it("maxRemotes prices a saturated shard by the billed number", () => {
    const prevGame = g.Game;
    const prevMemory = g.Memory;
    g.Game = { cpu: { limit: 20, bucket: 9000 } };
    try {
      // avg100 says 3.7 headroom (rung 2); billed says 0.7 (rung 1).
      g.Memory = { CPU: { trueAvg: 19.3, hundredTickAvg: { avg: 16.3 } } };
      assert.strictEqual(getCpuPolicy().maxRemotes, 1, "billed headroom 0.7 buys one remote, not two");
      // Billed headroom 2.6 clears the 2.5 rung — avg100 alone cannot tell these apart.
      g.Memory = { CPU: { trueAvg: 17.4, hundredTickAvg: { avg: 16.3 } } };
      assert.strictEqual(getCpuPolicy().maxRemotes, 2, "billed headroom 2.6 buys two remotes");
    } finally {
      g.Game = prevGame;
      g.Memory = prevMemory;
    }
  });

  it("the war gates read it, and no longer read avg100 directly", () => {
    const code = strip(WD);
    assert.include(code, "return billedAvg();");
    assert.notMatch(
      code,
      /Memory\.CPU\.hundredTickAvg/,
      "War/dispatch must not reach past the shared helper",
    );
    // Both spenders, by name, so neither can quietly regress.
    assert.match(code, /guardCapFor\(Game\.cpu\.limit \|\| 20, warCpuAvg\(\), lowCpuShard\(\)\)/);
    assert.match(code, /const avg = warCpuAvg\(\);/);
  });

  it("the guard ladder still refuses everything at zero headroom", () => {
    // This is the rung that matters on a 20-CPU account: billed 20.2 against
    // a limit of 20 is NEGATIVE headroom and must buy nothing.
    const { guardCapFor } = require("../../src/War/dispatch");
    assert.strictEqual(guardCapFor(20, 20.4, true), 0);
    assert.strictEqual(guardCapFor(20, 19.5, true), 0);
    assert.strictEqual(guardCapFor(20, 19, true), 1);
    assert.strictEqual(guardCapFor(20, 17, true), 4);
    // A shard with a real limit is untouched by any of this.
    assert.strictEqual(guardCapFor(500, 300, false), 6);
  });
});

describe("a war scout is not a remote", () => {
  const RS = fs.readFileSync("src/utils/RemoteStats.ts", "utf8");

  it("remoteKeyFor rejects warScout creeps", () => {
    /*
     * War/dispatch sends standing lookouts with role "scout" and the same
     * home/target pair a remote probe has, so they were being charged to the
     * remote ledger. sampleRemoteStats marks every key it sees as targeted, so
     * the entry never went stale and pruneRemoteStats could never drop it.
     *
     * Live shard3, an 840,356-tick window: E35N58|E34N57 read del 0 against
     * spE 27,650 over 553 "spawns" — every one of them a 50-energy [MOVE]
     * lookout doing its job in a room the empire has never mined.
     */
    assert.match(strip(RS), /if \(m\.warScout\) return null;/);
    const fn = strip(RS).slice(
      strip(RS).indexOf("function remoteKeyFor"),
      strip(RS).indexOf("function remoteKeyFor") + 900,
    );
    const roleTest = fn.indexOf('role !== "scout"');
    const warTest = fn.indexOf("m.warScout");
    assert.isAbove(roleTest, 0);
    assert.isAbove(warTest, roleTest, "cheapest test first");
  });

  it("still counts an ordinary remote scout", () => {
    // Roles/scout probing a candidate remote IS a remote cost and the
    // rescoutDelay ladder is built on those entries.
    assert.include(strip(RS), 'role !== "scout"');
  });
});

describe("the bench ring buffer is not a Memory leak", () => {
  const B = fs.readFileSync("src/utils/Bench.ts", "utf8");

  it("keeps only a little more than it displays", () => {
    /*
     * It kept 60 entries and reportCpu has only ever shown slice(-5). Each
     * entry is ~48 serialised bytes, so ~2.6 KB of a 129 KB Memory was written
     * every tick and read by nothing. Memory costs ~0.011 CPU per KB after the
     * loop returns on this bot.
     */
    const keep = Number((B.match(/const RECENT_KEEP = (\d+);/) || [])[1]);
    const show = Number((B.match(/const RECENT_SHOW = (\d+);/) || [])[1]);
    assert.isNumber(keep);
    assert.isAtLeast(keep, show, "it must still be able to fill the display");
    assert.isAtMost(keep, 16, "the unread tail is the whole defect");
    assert.include(B, "b.recent.slice(-RECENT_SHOW)");
  });

  it("trims by length rather than one shift per tick", () => {
    assert.include(B, "b.recent.splice(0, b.recent.length - RECENT_KEEP);");
  });
});
