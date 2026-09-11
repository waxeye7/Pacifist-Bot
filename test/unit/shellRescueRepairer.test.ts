import { assert } from "chai";
import fs from "fs";

/**
 * THE SHELL-COLLAPSE ESCAPE HATCH EXISTED ON THE CPU GATE AND NOT ON THE
 * ENERGY GATE, SO IT COULD NEVER FIRE.
 *
 * repairRosterOpen() deliberately overrides a shut optional roster when any
 * rampart is under 10,000 hits -- "one repairer even when CPU skip is on".
 * The RCL5 and RCL6 energy gates it guards then demanded at least 10,000
 * banked on EVERY arm, with no equivalent exemption. So a room poor enough to
 * let its shell collapse was exactly the room that could not buy the repairer
 * the CPU gate had just gone out of its way to allow.
 *
 * The RCL6 rung's fourth arm is the previous iteration of the same bug. Its
 * comment reads "the first three were all dead on live (banks 12-46k), so an
 * RCL6 shell sat at the 3k tower floor", and it added `bank > 10000 && any
 * rampart < 100000` -- which is dead in turn for any room under 10,000.
 *
 * Live shard3 2026-09-11, median rampart hits per owned room:
 *   E37N58 144,081   E37N59 104,181   E36N57 98,981   E39N58 95,341
 *   E35N58  93,101   E35N59  62,681   E38N56 ..... 3,621  (min 2,017)
 * E38N56 held 58 ramparts at the tower floor, a bank of 6,367, zero repairers
 * and zero maintainers -- the only room in the empire with neither. Six of
 * seven rooms recovered when the optional roster reopened. This one could not,
 * because its blocker was never CPU.
 */
const SP = fs.readFileSync("src/Rooms/rooms.spawning.ts", "utf8");

describe("a collapsed shell can buy a repairer out of a poor bank", () => {
  it("has the rescue at all", () => {
    assert.include(SP, "function shellRescueRepairer(");
  });

  it("both gates read ONE definition of a collapsed shell", () => {
    // The whole defect was two gates disagreeing about what an emergency is.
    assert.include(SP, "const SHELL_COLLAPSED_HITS = 10000;");
    assert.include(SP, "function shellCollapsed(");
    // repairRosterOpen no longer carries its own copy of the loop or the number.
    const at = SP.indexOf("function repairRosterOpen(");
    const fn = SP.slice(at, at + 400);
    assert.include(fn, "return shellCollapsed(ramparts);");
    assert.notInclude(fn, "< 10000");
  });

  it("keeps the bar low enough for the room that needs it", () => {
    // E38N56 banked 6,367. Anything at or above 10,000 is the bar that was
    // already dead.
    assert.include(SP, "const SHELL_RESCUE_BANK = 5000;");
    const bank = Number((SP.match(/const SHELL_RESCUE_BANK = (\d+);/) || [])[1]);
    assert.isBelow(bank, 6367, "must clear the bank E38N56 actually had");
    assert.isAbove(bank, 0, "not a blank cheque against an empty room");
  });

  it("buys exactly one, and only while the shell is collapsed", () => {
    const at = SP.indexOf("function shellRescueRepairer(");
    const fn = SP.slice(at, at + 500);
    assert.include(fn, "if(repairers >= 1) return false;");
    assert.include(fn, "return shellCollapsed(ramparts);");
  });

  it("is wired into the RCL6 rung that was dead on live", () => {
    const i = SP.indexOf("spawnrules[6].repair_creep.amount");
    const rung = SP.slice(i, i + 700);
    assert.include(rung, "shellRescueRepairer(storage, rampartsInRoom, repairers)");
  });

  it("is wired into RCL5 too, which had the same 10,000 floor", () => {
    const i = SP.indexOf("spawnrules[5].repair_creep.amount");
    const rung = SP.slice(i, i + 700);
    assert.include(rung, "shellRescueRepairer(storage, rampartsInRoom, repairers)");
  });

  it("leaves the richer arms alone", () => {
    // The rescue is an extra arm, not a replacement: a room with a real bank
    // should still buy on the wear thresholds, which repair far more than the
    // tower floor.
    assert.include(SP, "storage.store[RESOURCE_ENERGY] > 150000 && rampartsBelowTarget.length > 0");
    assert.include(SP, "storage.store[RESOURCE_ENERGY] > 10000 && shellThin");
  });
});
