import { assert } from "chai";
import fs from "fs";

/**
 * A ROOM WE CLAIMED STAYED ON EVERY NEIGHBOUR'S REMOTE-CANDIDATE LIST FOREVER.
 *
 * rooms.remotes.remotes() seeds room.memory.resources from describeExits and
 * already refuses to add a room whose controller is ours. Nothing removed one
 * that BECAME ours. On this account every commune is one or two hops from
 * another commune, so the candidate lists filled with our own territory and
 * the scout rung kept buying scouts to survey rooms we have permanent vision
 * of.
 *
 * Live shard3 2026-09-11, Memory.rooms.<home>.resources:
 *   E35N58 -> E35N59  retryAt 82918584   (both ours, RCL6)
 *   E35N59 -> E35N58  retryAt 82918583
 *   E37N59 -> E35N59, E36N58, E38N58 ... all seeded, all stale
 * Each pair burns one scout per retry window, forever, and every entry is
 * parsed and re-serialised on every tick this bot pays for Memory twice.
 */
const REM = fs.readFileSync("src/Rooms/rooms.remotes.ts", "utf8");
const CODE = REM.replace(/[/][*][^]*?[*][/]/g, "").replace(/[/][/].*/g, "");
const FN = CODE.slice(CODE.indexOf("function remotes(room)"),
                      CODE.indexOf("let newRooms = []"));

describe("owned rooms leave the remote candidate lists", () => {
  it("has a prune pass at all", () => {
    assert.include(FN, "Object.keys(room.memory.resources)");
    assert.include(FN, "delete room.memory.resources[known]");
  });

  it("prunes only rooms whose controller is ours", () => {
    assert.include(FN.replace(/\s+/g, " "), "!r.controller.my) continue;");
    assert.include(FN, "const r = Game.rooms[known];");
  });

  it("never prunes the room's own entry, which holds its local sources", () => {
    // resources[room.name] is where identifySources writes the home sources.
    // Deleting it would drop every local source id the spawn rungs read.
    assert.include(FN.replace(/\s+/g, " "), "if (known === room.name) continue;");
    const guard = FN.indexOf("known === room.name");
    const del = FN.indexOf("delete room.memory.resources[known]");
    assert.isAbove(del, guard, "the self guard must come first");
  });

  it("closes an active entry instead of deleting it out from under creeps", () => {
    // Miners and carriers already carry targetRoom for an active remote.
    // Dropping the memory in a seeding pass is not the place to handle that;
    // the next pass, 10 ticks later, deletes a quiet entry.
    assert.include(FN, "ent.active = false;");
    const close = FN.indexOf("ent.active = false;");
    const del = FN.indexOf("delete room.memory.resources[known]");
    assert.isAbove(del, close, "close first, delete on a later pass");
    assert.include(FN.replace(/\s+/g, " "), "if (ent && ent.active) {");
  });

  it("runs before the seed loops, so a pruned room can be re-seeded the same pass", () => {
    // It cannot be: the seed loop refuses an owned room. But if we ever lose
    // the room, the prune must not sit downstream of the seeding and delete
    // the entry seeding just created.
    const prune = CODE.indexOf("delete room.memory.resources[known]");
    const seed = CODE.indexOf("Game.map.describeExits(room.name)");
    assert.isBelow(prune, seed);
  });

  it("leaves the seed guard in place", () => {
    // The prune is the missing half, not a replacement.
    assert.include(CODE, "!Game.rooms[roomName] || (Game.rooms[roomName].controller && !Game.rooms[roomName].controller.my)");
  });
});
