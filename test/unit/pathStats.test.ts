/**
 * Instrumentation, not behaviour — but it has to be correct instrumentation or
 * the next round of CPU work is guesswork again.
 *
 * The first version of this reassigned PathFinder.search at the top of loop().
 * On the live server that property is READ-ONLY, so the assignment threw ahead
 * of every phase and the whole tick did nothing. These tests exist mostly to
 * keep the replacement from drifting back toward a monkey patch.
 */
import { assert } from "chai";
import * as fs from "fs";

const SRC = (p: string) => fs.readFileSync(__dirname + "/../../src/" + p, "utf8").replace(/\r\n/g, "\n");

describe("utils/PathStats", () => {
  it("times a search, returns its result untouched, and attributes it to the role", () => {
    const g: any = global;
    const prevPF = g.PathFinder;
    const prevGame = g.Game;
    const prevMemory = g.Memory;
    let calls = 0;
    let used = 0;
    const answer = { path: [1, 2, 3], ops: 7, cost: 3, incomplete: false };
    g.PathFinder = {
      search: (..._a: any[]) => {
        calls++;
        return answer;
      },
    };
    g.Game = { time: 100, cpu: { getUsed: () => (used += 0.1) } };
    g.Memory = { CPU: {} };
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require("../../src/utils/PathStats");

      mod.setPathRole("filler");
      const out = mod.timedSearch({} as any, {} as any, {} as any);
      assert.strictEqual(out, answer, "the caller gets the engine's own answer");
      assert.strictEqual(calls, 1);
      mod.timedSearch({} as any, {} as any, {} as any);
      assert.strictEqual(calls, 2);

      // flushed on a tick boundary that is a multiple of 20
      g.Game.time = 120;
      mod.setPathRole("upgrader");
      mod.timedSearch({} as any, {} as any, {} as any);
      const stats: any = (g.Memory.CPU as any).path;
      assert.isObject(stats, "Memory.CPU.path written");
      assert.isObject(stats.filler, "attributed to the role that was running");
      assert.isAbove(stats.filler.n, 0);
      assert.isObject(stats._all, "a total row for the whole fleet");
    } finally {
      g.PathFinder = prevPF;
      g.Game = prevGame;
      g.Memory = prevMemory;
    }
  });

  it("never writes to the engine's globals", () => {
    // The outage this file is named after. `PathFinder.search = ...` throws
    // TypeError: Cannot assign to read only property 'search'.
    const src = SRC("utils/PathStats.ts");
    const code = src.split("\n").filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join("\n");
    assert.notInclude(code, "pf.search =");
    assert.notInclude(code, "PathFinder.search =");
    assert.notInclude(code, "defineProperty");
    assert.notInclude(SRC("main.ts"), "installPathStats()");
  });

  it("every PathFinder call in the movement layer is timed", () => {
    const cf = SRC("Functions/creepFunctions.ts");
    assert.notInclude(cf, "PathFinder.search(", "bare searches bypass the profiler");
    assert.isAtLeast((cf.match(/timedSearch\(/g) || []).length, 10);
    assert.include(cf, 'import { timedSearch } from "utils/PathStats";');
  });

  it("the creep loop names the role before running it", () => {
    const src = SRC("Managers/RunCreepManager.ts");
    const i = src.indexOf("setPathRole(creep.memory.role)");
    const j = src.indexOf("global.ROLES[creep.memory.role].run(creep)");
    assert.isAbove(i, 0, "role is named");
    assert.isAbove(j, i, "...before run()");
  });
});

describe("main loop hygiene", () => {
  it("no console.log runs unconditionally every tick", () => {
    const code = SRC("main.ts").split("\n").filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join("\n");
    assert.notInclude(code, "console.log(tickTotal");
    assert.include(code, "logVerbose(tickTotal");
  });
});

describe("cpuSkip is windowed", () => {
  it("keeps a clock on itself instead of a lifetime total", () => {
    const src = SRC("Managers/RunAllCreepsManager.ts");
    assert.include(src, "CPU_SKIP_WINDOW");
    assert.include(src, "rec.since");
    assert.notInclude(src, "n: prev && prev.n ? prev.n : 0");
    assert.notInclude(src, "roles: prev && prev.roles ? prev.roles : {}");
  });
});
