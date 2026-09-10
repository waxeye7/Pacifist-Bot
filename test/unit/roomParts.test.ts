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
