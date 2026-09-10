/**
 * Nothing repaired a source container in an RCL7 room. Roles/repair excludes
 * containers from RCL6; Roles/maintainer narrowed to the hub bin from RCL7.
 * Between them the gap was total, and a container dies of decay in 25,000
 * ticks. Live shard3 E37N59: RCL7, four-container plan, zero standing.
 */
import { assert } from "chai";
import * as fs from "fs";

const SRC = (p: string) => fs.readFileSync(__dirname + "/../../src/" + p, "utf8").replace(/\r\n/g, "\n");

describe("container upkeep", () => {
  it("the maintainer no longer narrows to the bin at RCL7", () => {
    const m = SRC("Roles/maintainer.ts");
    assert.notInclude(m, "s.id == creep.room.memory.Structures.bin});");
    assert.include(m, "isPlannedContainer(creep.room, s.pos)");
  });

  it("...and keeps every container in a room the plan has no opinion about", () => {
    const m = SRC("Roles/maintainer.ts");
    const i = m.indexOf('cachedDerived(creep.room, "maintainerContainers"');
    assert.isAbove(i, 0);
    const block = m.slice(i, i + 600);
    assert.include(block, "if (!creep.room.memory.planV2) return all;", "no plan -> take them all");
  });

  it("the container list is memoised per room per tick, not re-found per creep", () => {
    // FIND_STRUCTURES is the widest find in the game. The first cut of this
    // fix ran one per maintainer per tick and took the role from 0.43 CPU per
    // creep to 1.24 on live shard3.
    const m = SRC("Roles/maintainer.ts");
    const i = m.indexOf('cachedDerived(creep.room, "maintainerContainers"');
    const block = m.slice(i, i + 600);
    assert.include(block, "cachedStructures(creep.room)");
    assert.notInclude(block, "creep.room.find(");
    assert.include(m, 'import { cachedDerived, cachedStructures } from "utils/RoomCache";');
  });

  it("the repair role still leaves containers alone, so the maintainer is the only cover", () => {
    // If this ever stops being true the maintainer fix is belt-and-braces
    // rather than the sole path — worth knowing either way.
    const r = SRC("Roles/repair.ts");
    const rcl6 = r.indexOf("creep.room.controller.level >= 6");
    assert.isAbove(rcl6, 0);
    assert.include(r.slice(rcl6, rcl6 + 3000), "building.structureType !== STRUCTURE_CONTAINER");
  });

  it("isPlannedContainer reads the packed plan and fails closed", () => {
    const p = SRC("utils/PlanV2.ts");
    assert.include(p, "export function isPlannedContainer");
    const i = p.indexOf("export function isPlannedContainer");
    const body = p.slice(i, i + 700);
    assert.include(body, "pos.x + pos.y * 50", "packed coords, same as the rest of the plan");
    assert.include(body, "if (!tiles || !tiles.length) return false;");
  });
});
