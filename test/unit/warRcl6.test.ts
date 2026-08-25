/**
 * War at RCL6 is "lowkey": cheap Guards wherever possible, heavy kits from
 * RCL7, caps from CPU headroom, and a memory of who hit us.
 */
import { assert } from "chai";
import * as fs from "fs";
import { guardCapFor, cooldownFor } from "../../src/War/dispatch";
import { WAR_HEAVY_MIN_RCL } from "../../src/War/kit";
import { noteAggressor, isAggressor, REMEMBER_TICKS } from "../../src/War/aggressors";

function withWorld(time: number, fn: () => void): void {
  const g: any = global;
  const prevGame = g.Game;
  const prevMemory = g.Memory;
  g.Game = { time, cpu: { limit: 20, bucket: 5000 } };
  g.Memory = {};
  try {
    fn();
  } finally {
    g.Game = prevGame;
    g.Memory = prevMemory;
  }
}

describe("War at RCL6", () => {
  it("duos and quads need an RCL7 home; Guards do not", () => {
    assert.strictEqual(WAR_HEAVY_MIN_RCL, 7);
    const src = fs.readFileSync(__dirname + "/../../src/War/kit.ts", "utf8").replace(/\r\n/g, "\n");
    assert.include(src, "pickHome(target, WAR_HEAVY_MIN_RCL, KIT_COST.quad)");
    assert.strictEqual((src.match(/pickHome\(target, WAR_HEAVY_MIN_RCL, KIT_COST\.duo\)/g) || []).length, 2);
    assert.notInclude(src, "pickHome(target, 6,");
    assert.include(src, "pickHome(target, 1, KIT_COST.guardPrey)");
  });

  it("the Guard cap follows CPU headroom on a 20-CPU shard and is 6 elsewhere", () => {
    assert.strictEqual(guardCapFor(100, 90, false), 6);
    assert.strictEqual(guardCapFor(20, 0, true), 4, "no average yet: full headroom");
    assert.strictEqual(guardCapFor(20, 16.5, true), 4);
    assert.strictEqual(guardCapFor(20, 17.5, true), 2);
    assert.strictEqual(guardCapFor(20, 18.5, true), 1);
    assert.strictEqual(guardCapFor(20, 19.5, true), 0);
  });

  it("re-issuing the same kit at the same room backs off exponentially, capped", () => {
    assert.strictEqual(cooldownFor("guard-prey", 1), 80);
    assert.strictEqual(cooldownFor("guard-prey", 2), 160);
    assert.strictEqual(cooldownFor("guard-prey", 4), 640);
    assert.strictEqual(cooldownFor("guard-prey", 9), 2000);
    assert.strictEqual(cooldownFor("mystery", 1), 50);
  });

  it("the issue ledger lives in Memory, not on the heap", () => {
    const src = fs.readFileSync(__dirname + "/../../src/War/dispatch.ts", "utf8").replace(/\r\n/g, "\n");
    assert.include(src, "if (!mem.issued) mem.issued = {};");
    assert.notInclude(src, "const issuedAt: { [key: string]: number } = {};");
  });
});

describe("War/aggressors", () => {
  it("remembers a player for REMEMBER_TICKS, never NPCs", () => {
    withWorld(1000, () => {
      noteAggressor("Invader", "E1N1");
      noteAggressor("Source Keeper", "E1N1");
      noteAggressor("bob", "E1N1");
      assert.isFalse(isAggressor("Invader"));
      assert.isTrue(isAggressor("bob"));
      assert.isFalse(isAggressor("alice"));
      (global as any).Game.time = 1000 + REMEMBER_TICKS + 1;
      assert.isFalse(isAggressor("bob"), "forgotten after REMEMBER_TICKS");
    });
  });

  it("scoring multiplies an aggressor's rooms and says so", () => {
    const src = fs.readFileSync(__dirname + "/../../src/War/score.ts", "utf8").replace(/\r\n/g, "\n");
    assert.include(src, "const retaliate = !!(rec.o && isAggressor(rec.o));");
    assert.include(src, "if (retaliate) score *= AGGRESSOR_MUL;");
    assert.include(src, 'if (retaliate) why.push("AGGRESSOR");');
    const def = fs.readFileSync(__dirname + "/../../src/Rooms/rooms.defence.ts", "utf8").replace(/\r\n/g, "\n");
    assert.include(def, "if(h.owner && hostileIsThreat(h)) noteAggressor(h.owner.username, room.name);");
  });
});
