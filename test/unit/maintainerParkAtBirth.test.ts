import { assert } from "chai";
import fs from "fs";

/**
 * A ROOM WITH 1,031 ENERGY BOUGHT A 3,500 ENERGY CREEP THAT PARKED IN THE SPAWN.
 *
 * Every maintainer rung reads `optionalRosterOpen() && keepTheseRoads.length
 * || spawnMaintainer`. maintainerOverrideCap.test pins a bank gate on the
 * SECOND disjunct. The first never had one: optionalRosterOpen() is a global
 * BUCKET test and says nothing at all about the room's energy, so the moment
 * the empire bucket climbs past the roster bar every room holding a road list
 * buys a maintainer, however broke it is.
 *
 * Live shard3 2026-09-11, tick 82891700, roster open at bucket ~4,300:
 * E39N58 storage held 1,031 energy and Spawn4 was building
 * Maintainer-30262154-E39N58, body 20 WORK / 20 CARRY / 10 MOVE = 3,500
 * energy. That is 175 ticks of the room's entire two-source income. The creep's
 * memory already read `bankParked: true` while it was still in the spawn,
 * because Roles/maintainer read the same bank, found it under
 * MAINT_BANK_FLOOR, and parked it. The room's controller progress had not
 * moved in 30 ticks and its storage was flat at 1,231.
 *
 * Same shape as the gate above it, one disjunct to the left: two gates that
 * must agree, and only one of them was ever told the rule.
 */
const SP = fs.readFileSync("src/Rooms/rooms.spawning.ts", "utf8");
const MAINT = fs.readFileSync("src/Roles/maintainer.ts", "utf8");
const CODE = SP.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("the optional-roster maintainer path can pay for what it buys", () => {
  it("has one demand predicate instead of five copies of the condition", () => {
    assert.match(CODE, /function maintainerDemand\(room: any, spawnMaintainer: boolean\): boolean \{/);
    // Every rung must go through it; none may keep the raw disjunction.
    assert.notInclude(
      CODE,
      "optionalRosterOpen() && room.memory.keepTheseRoads && room.memory.keepTheseRoads.length > 0 || spawnMaintainer",
    );
    const uses = CODE.match(/maintainerDemand\(room, spawnMaintainer\)/g) || [];
    assert.strictEqual(uses.length, 5, "RCL4-8 rungs all route through it");
  });

  it("applies the bank test to the roster path", () => {
    const fn = CODE.slice(
      CODE.indexOf("function maintainerDemand"),
      CODE.indexOf("function containerOverrideAllowed"),
    );
    assert.include(fn, "return maintainerAffordable(room);");
    // ...and only AFTER the demand tests, so a room with no road list still
    // costs nothing to answer.
    const roster = fn.indexOf("optionalRosterOpen()");
    const afford = fn.indexOf("maintainerAffordable(room)");
    assert.isAbove(afford, roster);
  });

  it("lets an already-gated spawnMaintainer through untouched", () => {
    // It has been past its own MAINT_BANK_RESUME gate by this point; testing
    // it twice would make the container and rampart escapes unreachable.
    assert.match(CODE, /function maintainerDemand[\s\S]{0,120}if\(spawnMaintainer\) return true;/);
  });

  it("measures affordability at the role's own resume number", () => {
    const fn = CODE.slice(
      CODE.indexOf("function maintainerAffordable"),
      CODE.indexOf("function maintainerDemand"),
    );
    assert.include(fn, "storageEnergy(room) >= MAINT_BANK_RESUME");
    assert.include(SP, 'MAINT_BANK_RESUME, shellIsBreached } from "Roles/maintainer"');
  });

  it("keeps the role's breach escape, imported rather than copied", () => {
    // A breached shell is the one case where the role works regardless of
    // bank, so the body is not wasted. Copying the predicate is how the two
    // sides drift apart again.
    const fn = CODE.slice(
      CODE.indexOf("function maintainerAffordable"),
      CODE.indexOf("function maintainerDemand"),
    );
    assert.include(fn, "return shellIsBreached(room);");
    assert.match(MAINT, /export function shellIsBreached\(room: any\): boolean \{/);
    assert.notMatch(CODE, /function shellIsBreached\(room: any\): boolean \{[\s\S]*?STRUCTURE_RAMPART/);
  });

  it("exempts a room with no storage, as the role does", () => {
    // Roles/maintainer computes bank === null there and never parks; a spawn
    // gate that refused would starve exactly the rooms building a storage.
    const fn = CODE.slice(
      CODE.indexOf("function maintainerAffordable"),
      CODE.indexOf("function maintainerDemand"),
    );
    assert.include(fn, "if(!room.storage || !room.storage.my) return true;");
    assert.match(MAINT, /creep\.room\.storage && creep\.room\.storage\.my\s*\n?\s*\? creep\.room\.storage\.store\[RESOURCE_ENERGY\] : null;/);
  });
});

describe("a maintainer that parks forever gives the body back", () => {
  it("stamps when the park started", () => {
    assert.match(MAINT, /if\(!creep\.memory\._parkedT\) creep\.memory\._parkedT = Game\.time;/);
  });

  it("recycles after MAINT_PARK_GIVEUP, it does not suicide on the spot", () => {
    /*
     * recycleCreep() returns half the body cost; suicide() returns nothing.
     * E39N58's body was 3,500 energy against a ~20/tick room income, so the
     * refund is 87 ticks of the room's entire production.
     */
    assert.match(MAINT, /const MAINT_PARK_GIVEUP = 300;/);
    assert.match(MAINT, /Game\.time - creep\.memory\._parkedT > MAINT_PARK_GIVEUP\) \{[\s\S]{0,120}creep\.recycle\(\);/);
  });

  it("clears the stamp when the bank recovers", () => {
    // Otherwise a creep that parked once, worked for 400 ticks and dipped
    // again would recycle on the first tick of the second dip.
    assert.match(MAINT, /if\(creep\.memory\._parkedT\) delete creep\.memory\._parkedT;/);
  });

  it("cannot become a buy-and-recycle loop", () => {
    // The refund goes to the bank the spawn gate reads, and that gate demands
    // MAINT_BANK_RESUME (12,000) before it buys another. Half a body is never
    // enough to cross it from the levels that trigger this.
    const fn = CODE.slice(
      CODE.indexOf("function maintainerAffordable"),
      CODE.indexOf("function maintainerDemand"),
    );
    assert.include(fn, "storageEnergy(room) >= MAINT_BANK_RESUME");
  });

  it("gives up well inside a creep lifetime but well outside a dip", () => {
    const n = Number((MAINT.match(/const MAINT_PARK_GIVEUP = (\d+);/) || [])[1]);
    assert.isAtLeast(n, 100, "a spawn burst or one big repair must not trip it");
    assert.isAtMost(n, 750, "half a life parked is the thing being fixed");
  });
});
