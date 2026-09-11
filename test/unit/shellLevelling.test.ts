import { assert } from "chai";
import { repairCeiling, wantsRepair, levelledCeiling } from "../../src/Roles/repair";

/**
 * A WALL IS ONLY AS HIGH AS ITS LOWEST TILE, AND THE REPAIRER BUILT TOWERS.
 *
 * findLocked picks the lowest-hits damaged structure and run() holds that lock
 * until wantsRepair goes false, which for a rampart means the peacetime
 * ceiling. So a room whose shell has collapsed takes ONE tile from 2,000 to
 * 100,000 while the other fifty-seven stay at 2,000 - 98,000 hits of work for
 * no defensive value at all, because an attacker walks through any other tile.
 *
 * Live shard3 2026-09-11, E38N56, minutes after the work-side rescue shipped:
 * the sum across its 58 ramparts climbed 11,300 in 48 ticks against a
 * decay-only baseline of -8,352, so the repairer was demonstrably working, and
 * the room minimum did not move off 2,041 for the whole window.
 */
const g: any = global;
g.Game = g.Game || {};
g.Game.time = g.Game.time || 1000;
g.FIND_MY_STRUCTURES = g.FIND_MY_STRUCTURES || 108;
g.STRUCTURE_RAMPART = "rampart";
g.RESOURCE_ENERGY = "energy";

let seq = 0;
/** An RCL6 room with a real storage and a shell whose weakest tile is `min`. */
function shellRoom(min: number, bank = 13846, others: number[] = []): any {
  const hits = [min].concat(others);
  return {
    name: "E38N56-" + (seq++),
    memory: {},
    controller: { level: 6 },
    storage: { my: true, store: { energy: bank } },
    find: () => hits.map(h => ({ structureType: "rampart", hits, hitsMax: 30000000, pos: { x: 1, y: 1 } })).map((s, i) => ({ ...s, hits: hits[i] })),
  };
}
const rampart = (hits: number) => ({ structureType: "rampart", hits, hitsMax: 30000000 });

describe("a collapsed shell is levelled, not spired", () => {
  it("caps a collapsed room far below the peacetime ceiling", () => {
    // 2,041 was the live number. Without the band the answer is 100,000.
    assert.strictEqual(repairCeiling(shellRoom(2041)), 10000);
  });

  it("never lets a freshly sited 1-hit rampart set the band", () => {
    // A rampart is built at 1 hit. min * 4 would be 4.
    assert.strictEqual(repairCeiling(shellRoom(1)), 10000);
  });

  it("raises the band as the floor comes up, and only then", () => {
    assert.strictEqual(repairCeiling(shellRoom(10000)), 40000);
    assert.strictEqual(repairCeiling(shellRoom(25000)), 100000);
  });

  it("leaves a healthy shell completely alone", () => {
    // Every other owned room on the live tick: minimums 78,901 to 99,541.
    assert.strictEqual(repairCeiling(shellRoom(78901)), 100000);
    assert.strictEqual(repairCeiling(shellRoom(99541)), 100000);
  });

  it("never exceeds the ceiling it is given", () => {
    assert.strictEqual(levelledCeiling(shellRoom(99541), 100000), 100000);
    assert.strictEqual(levelledCeiling(shellRoom(99541), 50000), 50000);
  });

  it("is monotone, so it cannot flap as a pass completes", () => {
    // The band moves only when the LAST tile of a pass crosses it, and the
    // new band is strictly above the old one.
    let min = 2041;
    let last = 0;
    for (let i = 0; i < 5; i++) {
      const band = repairCeiling(shellRoom(min));
      if (band === 100000) { assert.isAtLeast(band, last); break; }
      assert.isAbove(band, last);
      last = band;
      min = band;
    }
  });

  it("still stops the whole shell at the peacetime ceiling", () => {
    assert.isFalse(wantsRepair(shellRoom(99541), rampart(100000)));
    assert.isFalse(wantsRepair(shellRoom(2041), rampart(29999999)));
  });

  it("fails open for a room object with no find()", () => {
    // Every repairer in the empire runs wantsRepair inside a find filter every
    // tick; a room we have lost vision of must not throw there.
    const fake: any = { name: "X", memory: {}, controller: { level: 6 },
      storage: { my: true, store: { energy: 13846 } } };
    assert.strictEqual(repairCeiling(fake), 100000);
  });

  it("a room under attack still repairs without limit", () => {
    const r = shellRoom(2041);
    r.memory.danger = true;
    assert.strictEqual(repairCeiling(r), Infinity);
  });
});
