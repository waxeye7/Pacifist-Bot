/**
 * SneakyControllerUpgrader's FLEE BROKE AFTER ONE TICK ON A SHARED MEMORY KEY.
 *
 * The role stored its flee destination — a room-NAME STRING — in
 * `creep.memory.exit`. moveToRoomAvoidEnemyRooms owns that key as a
 * RoomPosition tile cache: it reads `memory.exit.roomName`, and on a string
 * that is undefined, so it re-picks and OVERWRITES the key with a position.
 * The next tick the role fed that position object back as `targetRoom` —
 * `findRoute(name, {x,y,roomName})` returns -2, `route.length > 0` is false,
 * and the creep stood still in the hostile room it was fleeing, for the
 * whole 100-tick locked_away window.
 */
import { assert } from "chai";
import fs from "fs";

const SRC = fs.readFileSync("src/Roles/SneakyControllerUpgrader.ts", "utf8");
const CODE = SRC.replace(/[/][*][^]*?[*][/]/g, "").replace(/[/][/].*/g, "");

describe("SneakyControllerUpgrader keeps its flee room off the router's exit cache", () => {
  it("stores the destination in memory.fleeRoom, never memory.exit", () => {
    assert.include(CODE, "creep.memory.fleeRoom = exit;");
    assert.notMatch(CODE, /creep\.memory\.exit\s*=/);
  });

  it("flees toward fleeRoom", () => {
    assert.include(CODE, "creep.moveToRoomAvoidEnemyRooms(creep.memory.fleeRoom)");
    assert.notMatch(CODE, /moveToRoomAvoidEnemyRooms\(creep\.memory\.exit\)/);
  });

  it("clears fleeRoom on the normal-travel path", () => {
    assert.include(CODE, "creep.memory.fleeRoom = false;");
  });
});
