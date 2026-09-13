/**
 * MoveCostMatrixSwampPrio SEARCHED THE ROAD MATRIX, NOT THE SWAMP ONE.
 *
 * The function's whole job is a cheap-swamp path (swamp 2, plains 1, road 2)
 * for remote haulers and hub errands. Its PathFinder call was wired to
 * roomCallbackRoadPrio (swamp 25, plains 5, road 3), while the purpose-built
 * roomCallbackSwampPrio sat as dead code one screen below — every "swamp"
 * move got a swamp-avoiding path, fleet-wide, with no error.
 *
 * And inside buildSwampPrio the hostile 255-stamp ran BEFORE the structures
 * pass that writes roads at cost 2, so a hostile standing on a road ended at
 * 2 — pathable. roomCallbackRoadPrio already carries the fix for exactly
 * that ordering.
 */
import { assert } from "chai";
import fs from "fs";

const SRC = fs.readFileSync("src/Functions/creepFunctions.ts", "utf8");
const CODE = SRC.replace(/[/][*][^]*?[*][/]/g, "").replace(/[/][/].*/g, "");

/** The MoveCostMatrixSwampPrio function body. */
const SWAMP_FN = CODE.slice(
  CODE.indexOf("MoveCostMatrixSwampPrio = function"),
  CODE.indexOf("Creep.prototype.MoveCostMatrixIgnoreRoads"),
);
/** The buildSwampPrio function body. */
const SWAMP_BUILD = CODE.slice(
  CODE.indexOf("const buildSwampPrio"),
  CODE.indexOf("const roomCallbackSwampPrio"),
);

describe("MoveCostMatrixSwampPrio uses the swamp matrix", () => {
  it("the search is wired to roomCallbackSwampPrio, not roomCallbackRoadPrio", () => {
    assert.include(SWAMP_FN, "roomCallbackSwampPrio(roomName)");
    assert.notInclude(SWAMP_FN, "roomCallbackRoadPrio(roomName)");
  });

  it("the swamp callback actually exists", () => {
    assert.include(CODE, 'memoMatrix("swampPrio", buildSwampPrio)');
  });

  it("swamp terrain is cheap in the swamp matrix", () => {
    // terrainBaseMatrix(name, wall, swamp, plains, ring) — swamp 2, plains 1.
    assert.include(SWAMP_BUILD, 'terrainBaseMatrix(roomName, 255, 2, 1, "inner")');
  });

  it("hostiles are stamped AFTER structures, so a hostile on a road stays 255", () => {
    const roads = SWAMP_BUILD.indexOf("STRUCTURE_ROAD");
    const hostiles = SWAMP_BUILD.indexOf("FIND_HOSTILE_CREEPS");
    assert.isAbove(roads, -1);
    assert.isAbove(hostiles, roads, "hostile stamp must follow the road write");
  });
});
