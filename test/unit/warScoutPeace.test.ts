import { assert } from "chai";
import fs from "fs";

/**
 * TWO LOOKOUTS ON A PERMANENT TREADMILL, FOR A WAR LAYER SCORING ZERO TARGETS.
 *
 * sendWarScout asked scoutQueue(1000) for rooms whose intel is older than a
 * thousand ticks, against a reach set of ~189 rooms. Holding all of them under
 * 1,000 ticks old needs one scout ARRIVING every five ticks; one scout takes
 * hundreds of ticks to cross the map. The queue is therefore never empty,
 * there is no state in which the fleet is caught up, and the cap IS the
 * behaviour: two scouts alive, always.
 *
 * Live shard3 2026-09-11, Memory.war.stats:
 *   n 3081  scout 2339  ranged-quad 604  guard-prey 138  started 82293998
 * That is one scout every 258 ticks for 604,700 ticks, about 117,000 energy,
 * while warTargets scored 0, footing was off, throttle was off and no owned
 * room was in danger. Memory.war.diary shows the near rooms recycling:
 * E34N57 issued at t=82,898,223 and again at t=82,898,523.
 */
const D = fs.readFileSync("src/War/dispatch.ts", "utf8");
const CODE = D.replace(/[/][*][^]*?[*][/]/g, "").replace(/[/][/].*/g, "");

describe("war scouting backs off when there is no war", () => {
  it("has a peace test at all", () => {
    assert.include(CODE, "export function warAtPeace(targetCount: number): boolean");
  });

  it("peace means no scored target, no distress, and no room in danger", () => {
    const fn = CODE.slice(CODE.indexOf("export function warAtPeace"),
                          CODE.indexOf("function warScoutCount"));
    assert.include(fn, "if (targetCount > 0) return false;");
    assert.include(fn, "M.DistressSignals");
    assert.include(fn.replace(/\s+/g, " "), "r.memory as any).danger) return false;");
  });

  it("is fed the live target count, not a cached one", () => {
    // runDispatch already computes `targets()` into `list` on the same pass.
    assert.include(CODE, "sendWarScout(warAtPeace(list.length))");
    const list = CODE.indexOf("const list = targets();");
    const call = CODE.indexOf("sendWarScout(warAtPeace(list.length))");
    assert.isBelow(list, call);
  });

  it("halves the cap only at peace and only on a CPU-capped shard", () => {
    // Creeps are billed per intent here; headcount is the bill. On a shard
    // with CPU to spare there is no reason to give up the second lookout.
    assert.include(CODE, "const cap = peace && lowCpuShard() ? 1 : MAX_WAR_SCOUTS;");
    assert.include(CODE, "if (live >= cap) return false;");
    assert.include(CODE, "const MAX_WAR_SCOUTS = 2;");
  });

  it("relaxes the staleness bar at peace, and snaps back at war", () => {
    assert.include(CODE, "const WAR_SCOUT_AGE_WAR = 1000;");
    assert.include(CODE, "scoutQueue(peace ? WAR_SCOUT_AGE_PEACE : WAR_SCOUT_AGE_WAR)");
    const war = Number((CODE.match(/WAR_SCOUT_AGE_WAR = (\d+);/) || [])[1]);
    const peace = Number((CODE.match(/WAR_SCOUT_AGE_PEACE = (\d+);/) || [])[1]);
    assert.isAbove(peace, war);
  });

  it("never goes to zero scouts", () => {
    // Without observers these 50-energy lookouts are the only thing writing
    // intel for rooms that are not ours; at zero the war layer goes blind and
    // dispatch stays at 0 forever, which is the failure this file warns about.
    assert.notInclude(CODE, "? 0 : MAX_WAR_SCOUTS");
    const cap = CODE.slice(CODE.indexOf("const cap = peace"), CODE.indexOf("const cap = peace") + 80);
    assert.match(cap, /\? 1 :/);
  });

  it("is not a bucket gate", () => {
    const fn = CODE.slice(CODE.indexOf("function sendWarScout("),
                          CODE.indexOf("const DISPATCH_EVERY"));
    assert.notInclude(fn, "Game.cpu.bucket");
  });
});
