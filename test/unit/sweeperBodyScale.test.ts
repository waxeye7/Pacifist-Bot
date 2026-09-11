import { assert } from "chai";
import fs from "fs";

/**
 * THE SWEEPER BODY WAS A FIXED 200 CAPACITY AT EVERY RCL FROM 4 TO 8.
 *
 * The spawn rung hard-coded [CARRY,CARRY,CARRY,CARRY,MOVE,MOVE] for every
 * owned room at RCL4 and above. Live shard3 2026-09-11: E38N56 is RCL6 with
 * 2,300 energy capacity and had 981 energy on the floor in three piles at
 * 22,14 / 26,10 / 37,17. It hatched the 300-energy sweeper, which needs five
 * round trips across the room; a dropped pile decays at amount/1000 per tick
 * the whole time. Sampled ~30 ticks apart the piles read 322/572/75 and then
 * 297/347/50.
 *
 * The fix sizes the body off the loot actually lying there, clamped between
 * the old body and 16 CARRY, and runs it through getBody so the room's own
 * energy capacity is still the hard ceiling.
 */
const SPAWNING = fs.readFileSync("src/Rooms/rooms.spawning.ts", "utf8");
const at = SPAWNING.indexOf("Sweep floor loot");
const RUNG = SPAWNING.slice(at, at + 6000);

describe("the sweeper body scales with the pile", () => {
  it("has the rung at all", () => {
    assert.isAbove(at, 0, "the sweeper spawn rung moved");
  });

  it("no longer hard-codes a 200-capacity body at RCL4+", () => {
    assert.notMatch(RUNG,
      /\[CARRY, CARRY, CARRY, CARRY, MOVE, MOVE\]/,
      "the fixed four-CARRY sweeper body is back");
  });

  it("sizes off the loot amount, not just the pile count", () => {
    assert.include(RUNG, "const SWEEP_TRIPS = 2;");
    assert.match(RUNG, /Math\.ceil\(sweepLootAmount \/ SWEEP_TRIPS \/ 50\)/);
  });

  it("clamps between the old body and a ceiling", () => {
    // Math.max(4, ...) is the floor: a small pile still gets what it used to
    // get. Math.min(16, ...) stops a rich room spending 1,200 energy on one
    // tombstone.
    assert.match(RUNG, /Math\.min\(16, Math\.max\(4,/);
  });

  it("still runs through getBody so room capacity is the hard cap", () => {
    // getBody budgets at 85% of energyCapacityAvailable, so a want the room
    // cannot buy degrades instead of stalling the queue.
    assert.match(RUNG,
      /getBody\(\[CARRY, CARRY, MOVE\], room, Math\.ceil\(wantCarry \/ 2\) \* 3\)/);
  });

  it("leaves the RCL1-3 body alone", () => {
    // Below RCL4 a sweeper is a tax on the upgraders; that rung was measured
    // and is deliberately tiny.
    const small = RUNG.lastIndexOf("room.controller.level < 4");
    assert.isAbove(small, 0);
    assert.include(RUNG.slice(small, small + 120), "? [CARRY, CARRY, MOVE]");
  });

  it("accumulates the amount from tombs, ruins and piles alike", () => {
    assert.include(RUNG, "let sweepLootAmount = _.sum(tombsAndRuins, sweepAmountOf);");
    assert.match(RUNG, /sweepLootAmount \+= _\.sum\(piles, \(r: any\) => r\.amount\);/);
    assert.match(RUNG, /sweepLootAmount \+= _\.sum\(strays, \(r: any\) => r\.amount\);/);
  });

  it("counts the same things it used to count", () => {
    // The pile COUNT still drives how many sweepers hatch; only the body
    // changed. A regression here would silently change the roster size.
    assert.include(RUNG, "const tombRuinLoot = tombsAndRuins.length;");
    assert.match(RUNG, /Math\.max\(1, Math\.floor\(\(looseLootCount \+ 1\) \/ 3\)\)/);
  });
});
