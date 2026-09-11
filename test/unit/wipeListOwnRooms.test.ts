import { assert } from "chai";
import fs from "fs";

/**
 * THE DEMOLITION LIST NAMED TWO OF THE EMPIRE'S OWN ROOMS.
 *
 * Memory.tasks.wipeRooms is written in rooms.establishMemory. Every push AND
 * every filter lives inside the `(controller && !controller.my) || !controller`
 * branch, so the sequence is: a foreign room gets added, we claim it, and from
 * the next tick the entire block is skipped for that room. There is no path
 * that takes the name back off.
 *
 * Live shard3 2026-09-11, read straight out of Memory.tasks:
 *   destroyStructures included "E39N58" — RCL7, ours, two spawns, 46 ramparts
 *   killCreeps         included "E36N57" — RCL6, ours
 *
 * Nothing reads these lists today: the consumer in Roles/attacker and both
 * rooms.spawning rungs are commented out. That is the only reason it has been
 * harmless, and it is not a property anyone maintains on purpose. Uncommenting
 * one line sends an attacker at an RCL7 room of our own.
 *
 * The trailing `if (Game.rooms[room.name] == undefined)` cleanup in the same
 * function cannot help: the pass iterates Game.rooms, so the room is defined
 * by construction.
 */
const RM = fs.readFileSync("src/Rooms/rooms.ts", "utf8");
const CODE = RM.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("owning a room takes it off the wipe list", () => {
  it("has an owned-room cleanup at all", () => {
    assert.match(CODE, /if \(room\.controller && room\.controller\.my\) \{/);
    assert.match(CODE, /W\.destroyStructures = W\.destroyStructures\.filter\(e => e != room\.name\);/);
    assert.match(CODE, /W\.killCreeps = W\.killCreeps\.filter\(e => e != room\.name\);/);
  });

  it("runs OUTSIDE the not-ours branch that can never see an owned room", () => {
    const clean = CODE.indexOf("if (room.controller && room.controller.my) {");
    const notOurs = CODE.indexOf("if ((room.controller && !room.controller.my) || !room.controller) {");
    assert.isAbove(clean, 0);
    assert.isAbove(notOurs, clean, "the cleanup must precede, not nest inside");
  });

  it("runs after the lists are guaranteed to exist", () => {
    // Both are lazily created a few lines above; filtering undefined throws
    // inside the room pass, which is the most expensive place in the bot to
    // throw.
    const init = CODE.indexOf("Memory.tasks.wipeRooms.killCreeps = [];");
    const clean = CODE.indexOf("if (room.controller && room.controller.my) {");
    assert.isAbove(init, 0);
    assert.isAbove(clean, init);
  });

  it("still adds foreign rooms, so the lists keep working", () => {
    assert.match(CODE, /Memory\.tasks\.wipeRooms\.destroyStructures\.push\(room\.name\);/);
    assert.match(CODE, /Memory\.tasks\.wipeRooms\.killCreeps\.push\(room\.name\);/);
  });

  it("costs nothing on the common path", () => {
    // includes() on a list of a dozen names, on the existing %3 cadence, and
    // only assigns when it actually has to.
    assert.match(CODE, /if \(W\.destroyStructures\.includes\(room\.name\)\) \{/);
    assert.match(CODE, /if \(W\.killCreeps\.includes\(room\.name\)\) \{/);
  });
});
