import { assert } from "chai";
import fs from "fs";

/**
 * A SCOUT THAT COULD NOT REACH ITS TARGET WAS RESPAWNED FOREVER.
 *
 * Roles/scout writes its verdict — accept, reject, permanent, retry — only
 * after `creep.room.name === creep.memory.targetRoom`. A scout that never
 * arrives writes nothing, dies of old age, and the spawn rung in
 * rooms.spawning sees the same "no `energy` key" entry it saw before and
 * queues another one. That rung also `break`s on the first unscouted
 * candidate, so an unreachable room at the head of the list starves every
 * other candidate the room might have scouted instead.
 *
 * Live shard3 2026-09-11, Memory.rstats over an 845,937-tick window:
 *   E35N58|E34N57  spawned 554  spent 27,700e  delivered 0  trips 0
 *   E35N58|E34N59  spawned 106  spent  5,300e  delivered 0  trips 0
 *   E38N56|E37N55  spawned 103  spent  5,150e  delivered 0  trips 0
 * 554 spawns at 50 energy each is one scout per ~1,527 ticks, which is a
 * [MOVE] creep's entire lifetime: each one was replaced the instant it
 * expired, 554 times, for zero information.
 *
 * The CPU bill is the larger one. Game.map.findRoute returns ERR_NO_PATH when
 * the target is unreachable, and the recompute gate in
 * moveToRoomAvoidEnemyRooms keys on exactly `route === -2` — so an unroutable
 * scout pays a findRoute every tick for 1,500 ticks and its replacement picks
 * the bill straight back up.
 */
const SCOUT = fs.readFileSync("src/Roles/scout.ts", "utf8");
const CODE = SCOUT.replace(/[/][*][^]*?[*][/]/g, "").replace(/[/][/].*/g, "");
/** just the helper: the arrival path below it legitimately uses creep.room.name */
const FN = CODE.slice(CODE.indexOf("function giveUpOnTarget"), CODE.indexOf("const SCOUT_GIVE_UP_TTL"));

describe("a scout that cannot arrive gives up out loud", () => {
  it("has a give-up path at all", () => {
    assert.include(CODE, "function giveUpOnTarget");
  });

  it("bails the tick findRoute reports no route", () => {
    // Not a cosmetic early exit: holding route === -2 costs a findRoute per
    // tick, because that value IS the recompute trigger.
    assert.include(CODE, "creep.memory.route === ERR_NO_PATH");
    const gate = CODE.indexOf("creep.memory.route === ERR_NO_PATH");
    const move = CODE.indexOf("return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);");
    assert.isAbove(move, gate, "the no-route check must precede the move");
  });

  it("also bails before dying of old age en route", () => {
    assert.include(CODE, "const SCOUT_GIVE_UP_TTL = 5;");
    assert.include(CODE, "creep.ticksToLive <= SCOUT_GIVE_UP_TTL");
  });

  it("gives up with margin, not on the final tick", () => {
    // The 20-CPU latch idles whole roles on a bad tick, so the last tick of a
    // creep's life is not a reliable place to run anything.
    const ttl = Number((CODE.match(/const SCOUT_GIVE_UP_TTL = (\d+);/) || [])[1]);
    assert.isAtLeast(ttl, 2);
    assert.isBelow(ttl, 100, "giving up this early would abandon live scouts");
  });

  it("writes the SAME rejection signal the arrival path writes", () => {
    // manageRemotes and the spawn rung both read an empty `energy` as
    // "scouted and rejected". Anything else leaves the entry unscouted.
    assert.include(FN, "ent.energy = {};");
    assert.include(FN, "ent.active = false;");
  });

  it("writes against the TARGET room, not the room it is standing in", () => {
    // The arrival path uses creep.room.name and is right to; a scout that
    // never arrived is standing somewhere irrelevant.
    assert.include(FN, "const target = creep.memory.targetRoom;");
    assert.notInclude(FN, "creep.room.name");
  });

  it("sets an expiry rather than a permanent no", () => {
    // Unreachable is a fact about today's AvoidRooms list and today's
    // neighbours. retryAt 0 means never again and would be wrong here.
    assert.include(FN, "ent.retryAt = Game.time + rescoutDelay(creep.memory.homeRoom, target);");
    assert.notInclude(FN, "retryAt = 0;");
  });

  it("reuses rescoutDelay so a remote that paid us keeps the short leash", () => {
    assert.include(CODE, 'from "../Rooms/rooms.remotes"');
    assert.include(CODE, "rescoutDelay");
  });

  it("still suicides so the slot is not held", () => {
    assert.include(FN, "creep.suicide();");
  });

  it("leaves the arrival verdict path untouched", () => {
    // The accept/reject machinery below the gate is correct and is the reason
    // this fix is small; it must not have been rewritten.
    assert.include(CODE, "homeMem.resources[creep.room.name].active = true;");
    assert.include(CODE, "homeMem.resources[creep.room.name].energy = {};");
    assert.include(CODE, "const permanent = !creep.room.controller || sources.length === 0 || sources.length > 2;");
  });
});
