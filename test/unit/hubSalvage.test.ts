/**
 * Dying creeps drop their carry on the hub floor and nothing collected it.
 * Live shard3 2026-09-10, six of seven rooms, sampled twice 27 ticks apart —
 * every pile fell by exactly 27, i.e. pure decay and zero collection, on tiles
 * adjacent to the room's own spawn.
 */
import { assert } from "chai";
import * as fs from "fs";
import { fillerBody } from "../../src/Rooms/spawnSafety";

const SRC = (p: string) => fs.readFileSync(__dirname + "/../../src/" + p, "utf8").replace(/\r\n/g, "\n");
const carryOf = (b: any[]) => b.filter((p) => p === CARRY).length * 50;

describe("hub salvage", () => {
  it("the loot floor is an absolute amount, not the creep's whole capacity", () => {
    const f = SRC("Roles/filler.ts");
    assert.include(f, "const LOOT_MIN = 100;");
    const i = f.indexOf("const freeLoot =");
    const block = f.slice(i, i + 700);
    assert.strictEqual((block.match(/LOOT_MIN/g) || []).length, 3, "drops, tombstones and ruins");
    assert.notInclude(block, "MaxStorage", "capacity is not a salvage threshold");
  });

  it("the real live piles clear the floor at every RCL", () => {
    // The observed death drops were 179-265. Under the old rule the bar was
    // the filler's full load, which this fix raised to 600/1000 — so the
    // filler ladder change made the old threshold strictly worse.
    const observed = [179, 199, 226, 231, 233, 260, 265];
    for (const amount of observed) assert.isAtLeast(amount, 100, "collectable now");
    for (const [lvl, cap] of [[6, 2300], [7, 5300]] as [number, number][]) {
      const load = carryOf(fillerBody({ controller: { level: lvl }, energyCapacityAvailable: cap }));
      assert.isBelow(100, load, "RCL" + lvl + ": the old bar was the whole load");
      for (const amount of observed) {
        assert.isBelow(amount, load, "RCL" + lvl + ": every live pile was under the old bar");
      }
    }
  });

  it("the floor is above dust — a pickup costs that tick's withdraw", () => {
    // One intent per tick, so hoovering scraps would trade fill throughput.
    // 100 is two CARRY parts' worth.
    const f = SRC("Roles/filler.ts");
    const m = f.match(/const LOOT_MIN = (\d+);/);
    assert.isNotNull(m);
    const v = Number(m![1]);
    assert.isAtLeast(v, 50);
    assert.isAtMost(v, 300);
  });

  it("the hub radius reaches the spawn side, where creeps actually die", () => {
    // Range 1 is measured from the CREEP, and the collect leg only runs when
    // the filler is EMPTY — i.e. standing at the storage. The piles are the
    // dying carry of creeps that work at the spawn and the extension ring.
    // Live: storage->spawn is 2-3 in all seven rooms, and every observed pile
    // was 1-3 from storage. Lowering LOOT_MIN alone changed nothing.
    const f = SRC("Roles/filler.ts");
    assert.include(f, "const HUB_LOOT_RANGE = 3;");
    assert.include(f, "const lootRange = hubSupplies ? HUB_LOOT_RANGE : 10;");
    const m = f.match(/const HUB_LOOT_RANGE = (\d+);/);
    assert.isNotNull(m);
    const v = Number(m![1]);
    assert.isAtLeast(v, 3, "must reach the spawn side of the hub");
    // ...and must NOT reach a source pile: the range-10 leash locked a filler
    // onto a miner drop 8 tiles out and it walked the base for it every trip.
    assert.isBelow(v, 8, "a hub radius, not a room radius");
  });

  it("still never loots while the room is under attack", () => {
    const f = SRC("Roles/filler.ts");
    const i = f.indexOf("const freeLoot =");
    assert.include(f.slice(i, i + 120), "!creep.room.memory.danger");
  });
});
