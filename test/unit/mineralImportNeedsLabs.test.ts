import { assert } from "chai";
import fs from "fs";

/**
 * A ROOM WITH NO LABS WAS IMPORTING EVERY BASE MINERAL.
 *
 * rooms.market tops every base mineral the room does NOT mine up to 8,000 by
 * begging 1,000-unit parcels off whichever room mines it. That is only worth
 * anything to a room that can put them in a lab, and a reaction needs two
 * input labs plus an output lab. Under three labs the import is pure cost: a
 * 1,000-unit send is ~350 energy of transaction fee, and the rung keeps going
 * until the terminal holds 8,000 of EVERY base mineral - roughly 25,000 units
 * and ~8,750 energy, out of the storage of a room that cannot use a gram of it.
 *
 * Live shard3 2026-09-11: E37N59 was the only room in the empire with three
 * labs (running Z+O -> ZO). E37N58 and E35N58 had one each; E39N58, E36N57,
 * E38N56 and E35N59 had none. Every one of those terminals nevertheless held
 * U 8000, K 5000, Z 5000.
 *
 * It was dormant only because terminalFloat left those rooms under the 2,000
 * terminal-energy bar the rung sits behind. Raising the float so the market
 * could work again (terminalFloatCliff.test) would have armed it, which is the
 * only reason this was caught.
 */
const MKT = fs.readFileSync("src/Rooms/rooms.market.ts", "utf8");
const CODE = MKT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("importing minerals you cannot react with", () => {
  it("counts the room's labs", () => {
    assert.include(CODE, 'cachedDerived(room, "labCount"');
    assert.match(CODE, /s\.structureType === STRUCTURE_LAB/);
  });

  it("needs a full reaction set, not just one lab", () => {
    // Two inputs and an output is the minimum that can run anything.
    assert.match(CODE, /if\(labCount >= 3 &&/);
  });

  it("gates the import loop itself, not something downstream of it", () => {
    const gate = CODE.indexOf("if(labCount >= 3 &&");
    const loop = CODE.indexOf("for(let resource of BaseResources)");
    assert.isAbove(gate, 0);
    assert.isAbove(loop, gate, "the base-resource loop must sit inside the gate");
  });

  it("still never imports the mineral the room mines itself", () => {
    assert.match(CODE, /resource != Mineral\.mineralType/);
  });

  it("keeps the terminal-energy bar in front of it", () => {
    // The send fee is paid from terminal energy; this bar is what stopped the
    // rung firing before, and it stays.
    assert.match(CODE, /room\.terminal\.store\[RESOURCE_ENERGY\] >= 2000/);
  });

  it("caches the count per tick rather than re-scanning", () => {
    // The rung runs once per room per 10 ticks; the find behind it should not
    // be paid per base resource.
    assert.include(MKT, 'import { cachedDerived, cachedMyStructures } from "utils/RoomCache";');
  });
});
