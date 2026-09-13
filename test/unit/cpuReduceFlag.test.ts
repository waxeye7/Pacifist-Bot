import { assert } from "chai";
import fs from "fs";

/**
 * Memory.CPU.reduce is an empire-wide flag: any room in deep danger
 * (danger_timer > 350) sets it, and the market/boost gates read it. The
 * release used to be a per-room `Game.time % 1000` clear — the first safe
 * room processed on that tick unset it while a sister room was still under
 * a >350-tick siege, flickering the flag off for the remainder of the tick.
 * The clear must consult every owned room, not just the one being iterated.
 */
const SRC = fs.readFileSync("src/Rooms/rooms.ts", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

describe("Memory.CPU.reduce release", () => {
  it("is cleared only after an empire-wide danger scan", () => {
    const clearIdx = SRC.indexOf("Memory.CPU.reduce = false");
    assert.isAbove(clearIdx, -1, "clear site exists");
    const before = SRC.slice(0, clearIdx);
    assert.include(before, "stillInDanger", "an empire scan must precede the clear");
    assert.include(before, "danger_timer > 350", "the scan must use the set threshold");
  });

  it("still sets reduce on deep danger", () => {
    assert.match(SRC, /danger_timer > 350/);
    assert.match(SRC, /Memory\.CPU\.reduce = true/);
  });
});
