/**
 * carry.ts ran three room-wide FIND_MY_STRUCTURES per findLocked() call, the
 * same shape Roles/filler.ts had already memoised. Live shard3 2026-09-10: the
 * carry role cost 2.97 CPU over 3.3 creeps (0.9 each, the most expensive role
 * in the fleet) and only 7% of it was PathFinder.
 */
import { assert } from "chai";
import * as fs from "fs";

const SRC = (p: string) => fs.readFileSync(__dirname + "/../../src/" + p, "utf8").replace(/\r\n/g, "\n");

describe("carry findLocked is memoised per room per tick", () => {
  it("no room-wide find survives in findLocked", () => {
    const src = SRC("Roles/carry.ts");
    const i = src.indexOf("function findLocked(creep)");
    const block = src.slice(i, src.indexOf("function walkToDropoff", i));
    assert.isAbove(i, 0);
    assert.notInclude(block, "creep.room.find(FIND_MY_STRUCTURES");
    assert.strictEqual((block.match(/carryCandidates\(/g) || []).length, 3);
  });

  it("uses the shared per-tick room cache, like filler.ts does", () => {
    const src = SRC("Roles/carry.ts");
    assert.include(src, 'import { cachedDerived, cachedMyStructures } from "utils/RoomCache";');
    const i = src.indexOf("function carryCandidates");
    const body = src.slice(i, i + 250);
    assert.include(body, "cachedDerived(room, key");
    assert.include(body, "cachedMyStructures(room).filter(want)");
  });

  it("the three memo keys are distinct — one list per predicate", () => {
    const src = SRC("Roles/carry.ts");
    const keys = (src.match(/carryCandidates\(creep\.room, "([^"]+)"/g) || [])
      .map((m) => m.split('"')[1]);
    assert.strictEqual(keys.length, 3);
    assert.strictEqual(new Set(keys).size, 3, "a shared key would return the wrong list");
  });

  it("isUndeliverable stays OUT of the memo — other creeps write it mid-tick", () => {
    const src = SRC("Roles/carry.ts");
    const i = src.indexOf('carryCandidates(creep.room, "carrySpawnExtTower"');
    const block = src.slice(i, i + 420);
    // applied as a post-filter on the memoised list, never inside the builder
    const memoEnd = block.indexOf(".filter(");
    assert.isAbove(memoEnd, 0, "post-filtered");
    assert.notInclude(block.slice(0, memoEnd), "isUndeliverable");
    assert.include(block.slice(memoEnd), "isUndeliverable");
  });

  it("filler.ts keeps the same carve-out, so the two cannot drift", () => {
    const f = SRC("Roles/filler.ts");
    assert.include(f, "function fillCandidates(room, key: string");
    const i = f.indexOf('fillCandidates(room, "fillNeedSpawnExt"');
    const block = f.slice(i, i + 420);
    assert.include(block.slice(block.indexOf(".filter(")), "isUndeliverable");
  });
});
