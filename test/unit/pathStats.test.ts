/**
 * Instrumentation, not behaviour — but it has to be correct instrumentation or
 * the next round of CPU work is guesswork again.
 */
import { assert } from "chai";
import * as fs from "fs";

describe("utils/PathStats", () => {
  it("wraps PathFinder.search exactly once and survives a missing engine", () => {
    const g: any = global;
    const prevPF = g.PathFinder;
    const prevGame = g.Game;
    const prevMemory = g.Memory;
    // no engine at all: must not throw
    delete g.PathFinder;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("../../src/utils/PathStats");
    mod.installPathStats();

    let calls = 0;
    let used = 0;
    g.PathFinder = { search: (..._a: any[]) => { calls++; return { path: [], ops: 1 }; } };
    g.Game = { time: 100, cpu: { getUsed: () => (used += 0.1) } };
    g.Memory = { CPU: {} };
    try {
      mod.installPathStats();
      const first = g.PathFinder.search;
      mod.installPathStats(); // idempotent
      assert.strictEqual(g.PathFinder.search, first, "installed twice");

      mod.setPathRole("filler");
      g.PathFinder.search({}, {}, {});
      g.PathFinder.search({}, {}, {});
      assert.strictEqual(calls, 2, "the inner search still runs");

      // flushed on a tick boundary that is a multiple of 20
      g.Game.time = 120;
      mod.setPathRole("upgrader");
      g.PathFinder.search({}, {}, {});
      const out: any = (g.Memory.CPU as any).path;
      assert.isObject(out, "Memory.CPU.path written");
      assert.isObject(out.filler, "attributed to the role that was running");
      assert.isAbove(out.filler.n, 0);
      assert.isObject(out._all, "a total row for the whole fleet");
    } finally {
      g.PathFinder = prevPF;
      g.Game = prevGame;
      g.Memory = prevMemory;
    }
  });

  it("the creep loop names the role before running it", () => {
    const src = fs.readFileSync(__dirname + "/../../src/Managers/RunCreepManager.ts", "utf8");
    const i = src.indexOf("setPathRole(creep.memory.role)");
    const j = src.indexOf("global.ROLES[creep.memory.role].run(creep)");
    assert.isAbove(i, 0, "role is named");
    assert.isAbove(j, i, "...before run()");
  });
});

describe("main loop hygiene", () => {
  it("no console.log runs unconditionally every tick", () => {
    const src = fs.readFileSync(__dirname + "/../../src/main.ts", "utf8");
    const code = src.split("\n").filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join("\n");
    assert.notInclude(code, 'console.log(tickTotal');
    assert.include(code, "logVerbose(tickTotal");
  });
});

describe("cpuSkip is windowed", () => {
  it("keeps a clock on itself instead of a lifetime total", () => {
    const src = fs.readFileSync(__dirname + "/../../src/Managers/RunAllCreepsManager.ts", "utf8");
    assert.include(src, "CPU_SKIP_WINDOW");
    assert.include(src, "rec.since");
    // the old carry-forward of the previous total is gone
    assert.notInclude(src, "n: prev && prev.n ? prev.n : 0");
    assert.notInclude(src, "roles: prev && prev.roles ? prev.roles : {}");
  });
});
