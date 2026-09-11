import { assert } from "chai";
import fs from "fs";

/**
 * THE RESCUE REPAIRER SPAWNED, THEN PARKED, BECAUSE THE TWO GATES SAT ONE
 * ENERGY UNIT APART AND POINTED OPPOSITE WAYS.
 *
 * rooms.spawning.shellRescueRepairer buys one repairer for a room whose
 * perimeter has fallen under SHELL_COLLAPSED_HITS, and requires a bank ABOVE
 * SHELL_RESCUE_BANK = 5000. Roles/repair's work-side bank floor parks a
 * repairer with an empty store whenever the bank is BELOW 5000. A room that
 * needs the rescue is, by construction, a poor room hovering on that line.
 *
 * Live shard3 2026-09-11, E38N56 RCL6, hours after the spawn-side rescue
 * shipped: roles included "repair":1, the creep was 10 WORK, and it was
 * standing on a road at 37,27 with store {"energy":0} and a MoveTargetId of
 * "road|..." - the idlePark destination. Bank 4,672. Ramparts n=58,
 * min 2,001, median 3,601. Every other owned room that tick:
 *
 *   E37N58 med 143,481   E37N59 med 103,581   E36N57 med  99,901
 *   E39N58 med  94,741   E35N58 med  93,671   E35N59 med  66,841
 *   E38N56 med   3,601  <- the tower floor, TOWER_SHELL_FLOOR = 3000
 *
 * 3,601 hits is about three ticks of one 25-WORK dismantler. The mechanism
 * that is supposed to raise a shell is the repair rung; in this room it could
 * produce the creep and never a single repair intent.
 */
const REPAIR = fs.readFileSync("src/Roles/repair.ts", "utf8");
const SPAWNING = fs.readFileSync("src/Rooms/rooms.spawning.ts", "utf8");
const CODE = REPAIR.replace(/[/][*][^]*?[*][/]/g, "").replace(/[/][/].*/g, "");

const num = (src: string, name: string) =>
  Number((src.match(new RegExp("const " + name + " = ([0-9.]+);")) || [])[1]);

describe("a collapsed shell outranks the work-side bank floor", () => {
  it("has a rescue-work predicate at all", () => {
    assert.include(CODE, "function shellCollapsed(room: any): boolean");
    assert.include(CODE, "const shellRescueWork =");
  });

  it("uses the same collapse bar as the spawn side", () => {
    const here = num(REPAIR, "SHELL_COLLAPSED_HITS");
    const there = num(SPAWNING, "SHELL_COLLAPSED_HITS");
    assert.isAbove(here, 0, "repair.ts must define the bar");
    assert.strictEqual(here, there, "the two files must agree on what collapsed means");
  });

  it("keeps a floor of its own rather than removing the floor", () => {
    // The 5k floor was written against a real failure: a repairer ground a
    // thin-bank room to ~0 and starved the fillers. An exemption with no
    // bottom reintroduces exactly that.
    const floor = num(REPAIR, "SHELL_WORK_FLOOR");
    assert.isAbove(floor, 0);
    assert.isBelow(floor, 5000, "a floor at or above 5000 changes nothing");
    assert.match(CODE, /store\[RESOURCE_ENERGY\] >= SHELL_WORK_FLOOR/);
  });

  it("still parks in a room that is merely poor", () => {
    // The escape hatch is the collapse, not the poverty. A room with a 90k
    // shell and a 4k bank must keep parking.
    const decl = CODE.slice(CODE.indexOf("const shellRescueWork ="),
                            CODE.indexOf("if(!creep.room.memory.danger && !shellRescueWork"));
    assert.include(decl.replace(/\s+/g, " "), "shellCollapsed(creep.room)");
  });

  it("does not fire while the room is under attack", () => {
    // danger already exempts the floor outright; a second path would just be
    // dead code claiming to matter.
    const decl = CODE.slice(CODE.indexOf("const shellRescueWork ="),
                            CODE.indexOf("if(!creep.room.memory.danger && !shellRescueWork"));
    assert.include(decl.replace(/\s+/g, " "), "!creep.room.memory.danger");
  });

  it("leaves the original floor arm intact", () => {
    assert.match(CODE, /store\[RESOURCE_ENERGY\] < 5000 &&/);
    assert.include(CODE.replace(/\s+/g, " "), "creep.store[RESOURCE_ENERGY] === 0) { creep.idlePark();");
  });

  it("ignores a buried rampart", () => {
    // A hole in a tile nothing can reach without first breaching the real wall
    // is not a collapse; rooms.defence makes the same exclusion for its tower
    // hole-prevention save.
    assert.match(CODE, /!rampartIsBuried\(room, s\.pos\)/);
  });

  it("measures only tiles the repairer is allowed to touch", () => {
    // findLocked refuses an off-plan rampart from RCL6 up, and the tower
    // hole-prevention save pins an abandoned one at ~1,200 hits forever.
    // Measuring the shell against a tile the repairer cannot repair would
    // hold the levelling band at its floor for the life of the room.
    assert.include(CODE, "isSanctionedRampart(room, s.pos)");
  });

  it("caches the scan instead of scanning every tick", () => {
    // This runs for every repairer in the empire, every tick, before any of
    // them has done anything. A FIND_MY_STRUCTURES sweep per pass is the kind
    // of cost this bot pays for at 20 CPU.
    assert.include(CODE, "room.memory._shellColT");
    assert.match(CODE, /Game\.time - \(room\.memory\._shellColT \|\| 0\) < 50/);
  });
});
