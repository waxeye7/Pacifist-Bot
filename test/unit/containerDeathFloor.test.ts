import { assert } from "chai";
import fs from "fs";

/**
 * A CONTAINER THAT DIES COSTS 5,000 ENERGY AND A BUILDER.
 *
 * Nothing in an RCL6+ room repairs a container. Roles/repair excludes them
 * from RCL6 up, the tower shell rung is rampart-only, builders never touch
 * them, and the miner seat-box rung (Roles/energyMiner keepSeatBoxAlive) only
 * covers the box a miner is physically SITTING on. A controller container, a
 * mineral container, or a source box whose miner died has no cover at all.
 *
 * A container at 0 hits is DELETED, and PlanV2 re-places it as a 5,000-energy
 * construction site that a builder the room also has to buy must walk to and
 * build.
 *
 * Live shard3 2026-09-11: E39N58 was down to three containers and rebuilding
 * the fourth at 6,15, measured at 1,200 -> 1,400 over 24 ticks — about 8
 * progress a tick, ~430 ticks to finish, using one of the empire's two
 * builders. E38N56 held two more at 70,000/250,000 (28%) with nothing
 * touching them.
 *
 * The roads had this exact problem and got a tower death floor
 * (ROAD_DEATH_FLOOR). This is the same guard for the structure that costs 60x
 * more to replace.
 */
const DEF = fs.readFileSync("src/Rooms/rooms.defence.ts", "utf8");
const CODE = DEF.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("towers hold a container decay floor", () => {
  it("has a container death guard at all", () => {
    assert.include(CODE, "const BOX_DEATH_FLOOR = 0.1;");
    assert.match(CODE, /st\.structureType !== STRUCTURE_CONTAINER\) continue;/);
    assert.include(CODE, "tower.repair(worstBox)");
  });

  it("is a floor, not an upkeep engine", () => {
    // It must stop at the floor exactly like the road guard. Anything that
    // repairs up to hitsMax turns two towers into a 250,000-hit grinder paid
    // for out of the room's bank, which is the mistake TOWER_SHELL_FLOOR
    // documents at length.
    assert.match(CODE, /st\.hits >= st\.hitsMax \* BOX_DEATH_FLOOR\) continue;/);
    const floor = Number((CODE.match(/const BOX_DEATH_FLOOR = ([\d.]+);/) || [])[1]);
    assert.isAbove(floor, 0);
    assert.isBelow(floor, 0.5, "above this it is upkeep, not a death guard");
  });

  it("shares the roads' cadence but not their tick", () => {
    // A tower fires once a tick. Landing both guards on the same residue would
    // mean the road shot silently starves the container shot every time.
    assert.match(CODE, /% 15 == 1/, "the road guard's residue");
    assert.match(CODE, /% 15 == 8/, "the container guard's residue");
  });

  it("stands down in danger and needs a tower with reserve energy", () => {
    const block = CODE.slice(
      CODE.indexOf("const BOX_DEATH_FLOOR"),
      CODE.indexOf("const BOX_DEATH_FLOOR") + 900,
    );
    const head = CODE.slice(CODE.indexOf("% 15 == 8") - 200, CODE.indexOf("% 15 == 8"));
    assert.include(head, "!room.memory.danger");
    assert.include(block, "tower.store[RESOURCE_ENERGY] >= 200");
    assert.include(block, "break;");
  });

  it("reads the per-tick structure cache, not a fresh find", () => {
    // This runs in every owned room every tick the residue matches; a raw
    // room.find here is the shape that has cost this bot CPU before.
    assert.match(CODE, /for \(const st of cachedStructures\(room\)\)/);
    assert.match(DEF, /import \{[^}]*cachedStructures[^}]*\} from "utils\/RoomCache";/);
  });

  it("leaves the road guard intact", () => {
    assert.include(CODE, "const ROAD_DEATH_FLOOR = 0.1;");
    assert.include(CODE, "tower.repair(worstRoad)");
  });
});
