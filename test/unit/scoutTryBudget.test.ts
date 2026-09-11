import { assert } from "chai";
import fs from "fs";

/**
 * A SCOUT THAT IS KILLED EN ROUTE CANNOT GIVE UP, BECAUSE NOTHING IS LEFT.
 *
 * Roles/scout writes a verdict when it cannot route and when it is about to
 * expire. That closes the two failures the creep can observe. It cannot close
 * the third. Game.map.findRoute prices a Memory.AvoidRooms hop at 24 rather
 * than Infinity -- deliberately, because a hostile room is sometimes the only
 * way through -- so a route straight through a tower room is a legal route.
 * The scout walks it and dies: no suicide, no verdict, and the entry is still
 * "active with no energy key", so the spawn rung buys another one. Forever.
 *
 * Live shard3 2026-09-11, Memory.rstats over an 845,937-tick window:
 * E35N58|E34N57 spawned 554 scouts for 27,700 energy and delivered nothing.
 * Watched live the same day, E35N58's scout for E34N57 held the route
 * E36N57 > E35N57 > E34N57, and E35N57 is in Memory.AvoidRooms -- a list a
 * room only joins by killing something of ours.
 *
 * The budget therefore has to live on the SPAWN side, where the death is
 * visible as "we paid again".
 */
const SPAWNING = fs.readFileSync("src/Rooms/rooms.spawning.ts", "utf8");
const SCOUT = fs.readFileSync("src/Roles/scout.ts", "utf8");
const at = SPAWNING.indexOf("A SCOUT THAT IS KILLED EN ROUTE");
const RUNG = SPAWNING.slice(at, at + 6000);

describe("scouting one room has a budget", () => {
  it("has an attempt cap at all", () => {
    assert.isAbove(at, -1, "the rung doc must survive");
    assert.include(SPAWNING, "const SCOUT_TRY_MAX = 3;");
  });

  it("three is enough to tell an unlucky trip from an impossible one", () => {
    const n = Number((SPAWNING.match(/const SCOUT_TRY_MAX = (\d+);/) || [])[1]);
    assert.isAtLeast(n, 2, "one bad trip must not retire a room");
    assert.isAtMost(n, 5, "the measured alternative was 554");
  });

  it("writes the same verdict the scout writes, and an expiring one", () => {
    assert.include(RUNG, "ent.energy = {};");
    assert.include(RUNG, "ent.active = false;");
    assert.include(RUNG, "ent.retryAt = Game.time + rescoutDelay(room.name, remoteRoom);");
    assert.notInclude(RUNG, "ent.retryAt = 0");
  });

  it("continues to the next candidate instead of breaking", () => {
    // The unreachable room at the head of this list was starving every other
    // candidate of the room's one scout. Giving up has to hand the slot over.
    const giveUp = RUNG.indexOf("delete ent._scoutTry;");
    const cont = RUNG.indexOf("continue;");
    assert.isAbove(cont, giveUp, "the give-up arm ends in continue");
    assert.isBelow(cont, RUNG.indexOf("Adding Scout to Spawn List"));
  });

  it("counts one attempt per trip, not per tick", () => {
    // `scouts` counts LIVE creeps, so a queued scout does not suppress the
    // rung; without a debounce the budget is spent in three ticks.
    assert.include(SPAWNING, "const SCOUT_TRY_DEBOUNCE = 100;");
    assert.include(RUNG, "Game.time - (ent._scoutAt || 0) >= SCOUT_TRY_DEBOUNCE");
    assert.include(RUNG, "ent._scoutAt = Game.time;");
  });

  it("the debounce is shorter than a scout's life and longer than a spawn", () => {
    const d = Number((SPAWNING.match(/const SCOUT_TRY_DEBOUNCE = (\d+);/) || [])[1]);
    assert.isAtLeast(d, 10, "a 1-part creep still has to clear the queue");
    assert.isBelow(d, 1500, "longer than a scout's life would stall scouting");
  });

  it("arriving refunds the budget", () => {
    // The budget counts trips that never arrived, not rejections.
    assert.include(SCOUT, "delete homeMem.resources[creep.room.name]._scoutTry;");
    const reset = SCOUT.indexOf("delete homeMem.resources[creep.room.name]._scoutTry;");
    const verdict = SCOUT.indexOf("const reservation = creep.room.controller");
    assert.isBelow(reset, verdict, "reset on arrival, before any verdict is chosen");
  });
});

describe("a war scout does not write in the remote layer's books", () => {
  /*
   * War/dispatch spawns Scout-war-<home>-<target> with warScout set, and
   * utils/RemoteStats already refuses to bill one to a remote. The give-up
   * path added for remote scouts must respect the same boundary: both live
   * scouts on shard3 at the time of writing were war scouts.
   */
  it("suicides instead of writing a verdict", () => {
    assert.include(SCOUT, "if(creep.memory.warScout) {");
    const war = SCOUT.indexOf("if(creep.memory.warScout) {");
    const give = SCOUT.indexOf('return giveUpOnTarget(creep, noRoute ?');
    assert.isBelow(war, give, "the war-scout exit must come first");
  });

  it("never CREATES a resources entry", () => {
    // A missing entry means nobody in the remote layer asked about the room.
    // Writing one would only grow Memory, which this bot pays for twice.
    assert.include(SCOUT, "const ent: any = homeMem && homeMem.resources && target && homeMem.resources[target];");
    assert.notInclude(SCOUT, "homeMem.resources[target] = {};");
  });

  it("still bails on ERR_NO_PATH, which is its own recompute trigger", () => {
    assert.include(SCOUT, "const noRoute = creep.memory.route === ERR_NO_PATH;");
    assert.include(SCOUT, "const dying = creep.ticksToLive != null && creep.ticksToLive <= SCOUT_GIVE_UP_TTL;");
  });
});
