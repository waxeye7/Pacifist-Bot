import { assert } from "chai";
import fs from "fs";

/**
 * AN OWNED ROOM'S SOURCE CONTAINERS HAD NO REPAIRER AT ALL.
 *
 * Roles/repair excludes containers from RCL6 up. The towers hold a decay floor
 * on ramparts and roads and nothing on these. The maintainer — documented as
 * their sole cover — sits behind optionalRosterOpen() and a bank gate, and on
 * this bot the roster has been shut for as long as the bucket has been under
 * 5,000. So a container in a room that is not rich decays 10 hits a tick until
 * it is gone.
 *
 * Live shard3 2026-09-11, source containers as a fraction of 250,000:
 * E39N58 4% and 6%, E37N59 8%, and E35N59 had already LOST the one at 38,19 —
 * its miner stood there drop-mining onto the floor, 557 energy and climbing.
 *
 * The miner was already repairing boxes for REMOTES and not for home. It sits
 * on the box with 5 WORK, and repair is 100 hits per WORK, so one repair tick
 * in 50 covers 10-a-tick decay for 5 energy. The price is one harvest tick in
 * 50 — about 2% of one source — to stop losing the seat entirely.
 */
const EM = fs.readFileSync("src/Roles/energyMiner.ts", "utf8");
const CODE = EM.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("miners keep their own seat container alive", () => {
  it("has a home-room seat repair at all", () => {
    assert.include(CODE, "function keepSeatBoxAlive");
    assert.match(CODE, /return creep\.repair\(box\) === OK;/);
  });

  it("runs before any other work action", () => {
    // repair() and harvest() are both work actions and only one lands per
    // tick, so this must take the tick when it fires.
    assert.match(CODE, /if\(keepSeatBoxAlive\(creep\)\) \{\s*\n\s*return;/);
    const guard = CODE.indexOf("keepSeatBoxAlive(creep)");
    const harvest = CODE.indexOf("creep.harvestEnergy()");
    assert.isAbove(harvest, guard, "the seat repair must precede harvesting");
  });

  it("fires rarely and off a per-creep phase", () => {
    // Every miner in the empire on the same residue trades a saving for a
    // spike; this bot has been bitten by that repeatedly.
    assert.include(CODE, "const SEAT_BOX_EVERY = 25;");
    assert.match(CODE, /nameOffset\(creep\.name, every\)\) % every !== 0/);
  });

  it("needs energy of its own to spend", () => {
    // repair() is paid from the creep's store, not the container's.
    assert.match(CODE, /if\(creep\.store\[RESOURCE_ENERGY\] < 50\) return false;/);
  });

  it("only repairs a box that is actually worn", () => {
    assert.include(CODE, "const SEAT_BOX_REPAIR_BELOW = 0.75;");
    assert.match(CODE, /box\.hits >= box\.hitsMax \* SEAT_BOX_REPAIR_BELOW\) return false;/);
  });

  it("caches the box id instead of scanning every pass", () => {
    assert.match(CODE, /Game\.time - creep\.memory\._seatBoxT > 100/);
  });

  it("leaves the existing remote box-repair rung alone", () => {
    // Remotes decay at 50 hits a tick and already had cover; that rung is the
    // reason this one is obviously correct, not something to replace.
    assert.match(CODE, /creep\.memory\.targetRoom != creep\.memory\.homeRoom/);
    assert.match(CODE, /if\(box && box\.hits < box\.hitsMax\) \{\s*\n\s*creep\.repair\(box\);/);
  });
});

describe("a dying seat box gets a rescue cadence, not maintenance", () => {
  /*
   * One fire in 25 is 20 hits a tick for a 5-WORK miner against 10 a tick of
   * decay � net +10, which takes a box from 12% of 250,000 to the 75% the rung
   * stops at in 15,750 ticks, about fifteen real-time hours. A box at 12% has
   * 3,000 ticks of life left.
   *
   * Live shard3 2026-09-11, hours after the slow rung shipped: E39N58 read SRC
   * 12% and 12%, and had already lost a third container and was rebuilding it
   * at 5,000 energy with a builder it also had to buy. E37N59 read 17% / 37%.
   */
  it("has a second, faster cadence", () => {
    assert.include(CODE, "const SEAT_BOX_CRITICAL = 0.25;");
    assert.include(CODE, "const SEAT_BOX_EVERY_CRITICAL = 10;");
    assert.match(CODE, /creep\.memory\._seatBoxF < SEAT_BOX_CRITICAL[\s\S]{0,60}SEAT_BOX_EVERY_CRITICAL : SEAT_BOX_EVERY/);
  });

  it("cannot flap between the two cadences", () => {
    // The rescue bar and the stop-repairing bar have to be far apart, or a box
    // hovering on one number switches cadence every hundred ticks.
    const crit = Number((CODE.match(/const SEAT_BOX_CRITICAL = ([\d.]+);/) || [])[1]);
    const stop = Number((CODE.match(/const SEAT_BOX_REPAIR_BELOW = ([\d.]+);/) || [])[1]);
    assert.isBelow(crit, stop - 0.3);
  });

  it("still costs a bounded slice of one source", () => {
    // Repair and harvest are both work actions, so the cadence IS the price:
    // one fire in 10 is a tenth of this miner's harvest. Anything faster is
    // spending the seat to save the box.
    const fast = Number((CODE.match(/const SEAT_BOX_EVERY_CRITICAL = (\d+);/) || [])[1]);
    assert.isAtLeast(fast, 5);
    const slow = Number((CODE.match(/const SEAT_BOX_EVERY = (\d+);/) || [])[1]);
    assert.isBelow(fast, slow, "the rescue must actually be faster");
  });

  it("reads the wear from the same cache as the id, not a fresh lookup", () => {
    // The point of the cadence is that the other 9 or 24 ticks cost nothing.
    // Resolving the box every tick to decide whether to skip would undo it.
    assert.match(CODE, /creep\.memory\._seatBoxF = found \? found\.hits \/ found\.hitsMax : 1;/);
    const refresh = CODE.indexOf("creep.memory._seatBoxF = found");
    const gate = CODE.indexOf("% every !== 0");
    assert.isAbove(gate, refresh, "the cadence gate reads the cached fraction");
    const lookup = CODE.indexOf("Game.getObjectById(creep.memory._seatBox)");
    assert.isAbove(lookup, gate, "and the lookup happens only on a firing tick");
  });
});
