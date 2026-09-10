import { assert } from "chai";
import fs from "fs";

/**
 * maxRemotes IS PER COMMUNE, SO SEVEN COMMUNES IS SEVEN REMOTES.
 *
 * CpuPolicy documents maxRemotes as "max active remote rooms per commune (soft
 * target)" and manageRemotes applies it per commune. On a seven-room empire
 * that makes the smallest non-zero step SEVEN remotes, because every room
 * independently decides it may have one on the same tick the bucket crosses
 * the entry bar.
 *
 * A remote is about 1 CPU — the headroom rung in CpuPolicy says so in as many
 * words: miner 0.25, carriers 0.5, pathing. Live shard3 2026-09-11 with
 * remotes shut read billed 18.7 against a 20 limit, so 1.3 CPU of real
 * headroom. Seven remotes is 7.
 *
 * The bucket was climbing through 3,034 toward the 4,000 entry bar at the time
 * this shipped. Without a budget every room would have opened, the average
 * would have gone to ~25, the bucket would have drained back through the 3,000
 * stay bar within a few hundred ticks, and the whole remote fleet would have
 * been recalled at once — the collapse CpuPolicy's own hysteresis note already
 * describes from the last time it happened, reached from the other direction.
 *
 * One or two permanently-staffed remotes are worth strictly more than seven
 * that cycle, because a recalled remote still cost the energy to build its
 * creeps and buys nothing with them.
 */
const POLICY = fs.readFileSync("src/utils/CpuPolicy.ts", "utf8");
const REMOTES = fs.readFileSync("src/Rooms/rooms.remotes.ts", "utf8");
const RCODE = REMOTES.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("remotes have an empire-wide budget, not just a per-room cap", () => {
  it("prices the budget in CPU the empire actually has", () => {
    assert.include(POLICY, "export function empireRemoteBudget");
    assert.include(POLICY, "const REMOTE_CPU_EST = 1.0;");
    assert.match(POLICY, /const headroom = limit - billed;/);
    assert.match(POLICY, /return Math\.floor\(headroom \/ REMOTE_CPU_EST\);/);
  });

  it("budgets from the BILLED average, not the in-loop one", () => {
    // avg100 understates the true cost by the post-loop Memory write, measured
    // at 1.32 on this bot. Budgeting from it buys a remote the empire cannot
    // pay for.
    assert.match(POLICY, /typeof M\.CPU\.trueAvg === "number" && M\.CPU\.trueAvg > 0/);
  });

  it("returns zero when there is no headroom at all", () => {
    assert.match(POLICY, /if \(headroom <= 0\) return 0;/);
  });

  it("leaves high-limit servers alone", () => {
    // A private server with a big limit has room for the per-room caps as
    // written; this exists for the 20-CPU shape.
    assert.match(POLICY, /if \(limit > 30\) return 99;/);
  });

  it("gates only NEW opens, never an existing crew", () => {
    // Same rule as the container maintainer cap: limit who may START. Closing
    // a remote already being mined throws away the bodies it paid for.
    assert.match(RCODE, /const already = !!res\[s\.name\]\.active;/);
    assert.match(RCODE, /if \(want && !already && res\[s\.name\]\.energy && empireActiveRemotes\(\) >= budget\)/);
  });

  it("counts an open immediately so the same tick cannot overshoot", () => {
    // manageRemotes runs per room inside one tick. Without this, all seven
    // rooms read the same pre-open count and every one of them opens.
    assert.include(RCODE, "_activeRemoteCount++;");
  });

  it("does not count or block scout probes", () => {
    // An active entry with no `energy` is a scout target: one scout, no mining
    // crew. Blocking those would stop the empire learning what it borders.
    assert.match(RCODE, /if \(e && e\.active && e\.energy\) n\+\+;/);
  });

  it("counts the empire once per tick", () => {
    assert.include(RCODE, "if (_activeRemoteTick === Game.time) return _activeRemoteCount;");
  });
});
