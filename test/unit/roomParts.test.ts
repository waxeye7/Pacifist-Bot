import { assert } from "chai";
import fs from "fs";

/**
 * THE ROOMS PASS IS THE ONLY BIG COST IN THIS BOT THAT CAN BE ARGUED WITH.
 *
 * Live shard3 2026-09-11, settled and with no deploy in the window:
 *
 *   creeps  11.91   rooms  5.23   everything else  0.48
 *   100-tick average 17.91, billed 19.24, limit 20
 *
 * The creeps line is almost entirely intents — 47 creeps at 0.2 CPU each — so
 * it cannot be optimised, only spent differently. The rooms line is 0.75 per
 * owned room of ordinary JavaScript and nobody had ever seen inside it.
 *
 * It matters because both gates are within about a CPU of where the bot sits:
 * remotes need a 4,000 bucket AND an in-loop average under 18, and the bot
 * averages 17.9. Knowing which call inside rooms() costs what is the
 * difference between guessing and fixing.
 */
const PROF = fs.readFileSync("src/utils/Profile.ts", "utf8");
const ROOMS = fs.readFileSync("src/Rooms/rooms.ts", "utf8");
const CODE = ROOMS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("the rooms pass is broken down per call", () => {
  it("records a slow EMA per key, like empireParts already does", () => {
    assert.include(PROF, "const PART_ALPHA = 0.05;");
    assert.include(PROF, "M.CPU.roomParts || (M.CPU.roomParts = {})");
  });

  it("averages one sample per TICK, not one per room", () => {
    /*
     * Every key is called once per owned room. The first cut folded each
     * measurement straight into the EMA, so with seven rooms the average saw
     * seven samples a tick and converged on the cost of a SINGLE room's call.
     * It read 0.531 for defence next to a rooms phase of 5.23 — a per-call
     * mean sitting beside a per-tick total, two numbers that cannot be
     * subtracted from each other, which is the only thing the table is for.
     */
    assert.include(PROF, "if (Game.time !== accTick) {");
    assert.match(PROF, /acc\[key\] = \(acc\[key\] \|\| 0\) \+ \(Game\.cpu\.getUsed\(\) - before\);/);
  });

  it("throws away the first two ticks of a global", () => {
    /*
     * The SECOND time this bit. CpuPolicy.sampleBilledFromBucket seeded on a
     * reset tick and read trueAvg 74.51 while trueLast had settled at 20; here
     * spawn.producer seeded at its first sample and read 4.381 against a whole
     * spawning call of 1.951 — a slice larger than the thing it slices, which
     * is impossible, and it read that way for hundreds of ticks.
     */
    assert.include(PROF, "let globalAge = 0;");
    assert.include(PROF, "if (globalAge > 2) flush();");
  });

  it("starts a new key at zero, not at whatever it first cost", () => {
    // An EMA climbing from zero reaches the truth in about sixty ticks and
    // never overshoots. One seeded from a spike takes hundreds to come back.
    assert.match(PROF, /if \(p\[key\] === undefined\) p\[key\] = 0;/);
  });

  it("decays a key on the ticks it does not run", () => {
    // A call on a %100 cadence must fall toward its true time-average rather
    // than hold the value of the one tick in a hundred where it fires.
    assert.include(PROF, "for (const key in p) {");
    assert.include(PROF, "const used = acc[key] || 0;");
  });

  it("does not catch, because guarded() is the error boundary", () => {
    // A second boundary here would swallow exceptions guarded() exists to see.
    // Comments are stripped first: the doc block says the word "catch" while
    // explaining why the code must not use it.
    const code = PROF.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.include(code, "try {");
    assert.include(code, "} finally {");
    assert.notInclude(code, "catch");
  });

  it("wraps every per-room call in the visible-room body", () => {
    for (const key of [
      "powerSpawn", "speedrunHints", "spawning", "wipeForeignSites", "defence",
      "observe", "data", "market", "labs", "identifySources", "planV2Place",
      "refreshUnreachable", "pruneBadFill", "construction", "scanRemoteThreats",
      "remoteRoads", "situationalBuild", "establishMemory",
    ]) {
      assert.include(CODE, `roomPart("${key}"`, key);
    }
  });

  it("leaves no bare call that a roomPart key now owns", () => {
    for (const call of [
      "spawning(room);", "roomDefence(room);", "construction(room);",
      "market(room);", "data(room);", "establishMemory(room);",
    ]) {
      const bare = new RegExp(`(^|[^>] )${call.replace(/[()]/g, "\\$&")}`, "m");
      assert.notMatch(CODE, bare, call);
    }
  });

  it("replaces the two ad-hoc timers rather than adding a third", () => {
    // market() and construction() each carried their own getUsed() pair and a
    // console.log that built its string on every pass whether or not
    // Memory.verbose let it print.
    assert.notInclude(CODE, "Market Ran in");
    assert.notInclude(CODE, "BASE Construction Ran in");
  });
});
