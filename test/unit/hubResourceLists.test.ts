import { assert } from "chai";
import fs from "fs";

/**
 * THE HUB LADDER REBUILT FOUR CONSTANT ARRAYS ON EVERY TICK IT RAN.
 *
 * One of them is 43 elements long, and each was then asked `.includes()` once
 * per resource in the store — a linear scan of an array allocated moments
 * earlier. Live shard3 2026-09-11 billed the hub role at 0.44 CPU per creep
 * per tick against a 0.20 floor that is pure intent cost, while an energy
 * miner doing real work billed 0.247.
 *
 * Membership is an object lookup now, built once per global reset. Same
 * members, same order-independent test, so every rung behaves exactly as it
 * did.
 */
const EM = fs.readFileSync("src/Roles/energyManager.ts", "utf8");
const CODE = EM.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("hub resource lists are hoisted out of the per-tick path", () => {
  it("declares no list inside a function body", () => {
    assert.notInclude(CODE, "let listOfResourcesTo");
  });

  it("builds the sets lazily and caches them", () => {
    // NOT at module load: RESOURCE_ALLOY and its siblings are runtime globals
    // that do not exist while the unit suite requires this file, and
    // evaluating them at module scope took the whole test run down with a
    // ReferenceError. Once per global reset is just as good.
    assert.match(CODE, /let _hubSets: HubSets \| null = null;/);
    assert.match(CODE, /if \(_hubSets\) return _hubSets;/);
    assert.notMatch(CODE, /^const TO_\w+ = resourceSet/m);
  });

  it("resolves the sets once per rung block, not once per resource", () => {
    assert.include(CODE, "const SETS = hubSets();");
    assert.strictEqual((CODE.match(/const SETS = hubSets\(\);/g) || []).length, 1);
  });

  it("tests membership by lookup, not by scanning an array", () => {
    assert.notMatch(CODE, /listOfResources\w*\.includes\(/);
    assert.include(CODE, "SETS.toTerminalCommodities[resource]");
    assert.include(CODE, "SETS.toTerminalBoosts[resource]");
    assert.include(CODE, "SETS.toStorageBoosts[resource]");
    assert.include(CODE, "SETS.toStorageMisc[resource]");
  });

  it("keeps the two boost lists as separate entries", () => {
    // They have identical members today, but one pushes boosts out to the
    // terminal to sell and the other pulls them back to storage. Collapsing
    // them into one would make an edit to either silently move both.
    assert.include(CODE, "toTerminalBoosts: resourceSet([");
    assert.include(CODE, "toStorageBoosts: resourceSet([");
  });

  it("keeps every member of the commodity list", () => {
    const block = CODE.slice(
      CODE.indexOf("toTerminalCommodities: resourceSet(["),
      CODE.indexOf("toTerminalBoosts: resourceSet([")
    );
    for (const r of [
      "RESOURCE_ALLOY",
      "RESOURCE_KEANIUM_ACID",
      "RESOURCE_MIST",
      "RESOURCE_PURIFIER",
      "RESOURCE_CATALYZED_GHODIUM_ACID",
    ]) {
      assert.include(block, r);
    }
    assert.strictEqual((block.match(/RESOURCE_/g) || []).length, 43);
  });

  it("keeps every member of the storage-misc list", () => {
    const block = CODE.slice(CODE.indexOf("toStorageMisc: resourceSet(["));
    const head = block.slice(0, block.indexOf("]),") + 3);
    for (const r of [
      "RESOURCE_KEANIUM_OXIDE",
      "RESOURCE_ZYNTHIUM_ALKALIDE",
      "RESOURCE_ZYNTHIUM_HYDRIDE",
      "RESOURCE_POWER",
      "RESOURCE_BATTERY",
    ]) {
      assert.include(head, r);
    }
    assert.strictEqual((head.match(/RESOURCE_/g) || []).length, 5);
  });
});
