/**
 * MoveToSourceSafely SEARCHED THE ROAD MATRIX, NOT THE SAFE-TO-SOURCE ONE.
 *
 * The function is called while room.memory.danger is set — its reason to
 * exist is the +-7 hostile cost band that keeps miners off a hostile's
 * doorstep. That band only exists in buildSafeToSource; the call was wired
 * to roomCallbackRoadPrio and roomCallbackSafeToSource sat as dead code one
 * screen below, so "move safely to the source" produced an ordinary road
 * path with no avoidance aura. Silent: paths were found, just wrong ones.
 *
 * Inside buildSafeToSource the hostile 255-stamp also ran BEFORE the
 * structures pass wrote roads at 2, so a hostile standing on a road ended
 * pathable — the ordering bug roomCallbackRoadPrio already documents.
 */
import { assert } from "chai";
import fs from "fs";

const SRC = fs.readFileSync("src/Functions/creepFunctions.ts", "utf8");
const CODE = SRC.replace(/[/][*][^]*?[*][/]/g, "").replace(/[/][/].*/g, "");

/** The MoveToSourceSafely function body. */
const SAFE_FN = CODE.slice(
  CODE.indexOf("MoveToSourceSafely = function"),
  CODE.indexOf("const buildSafeToSource"),
);
/** The buildSafeToSource function body. */
const SAFE_BUILD = CODE.slice(
  CODE.indexOf("const buildSafeToSource"),
  CODE.indexOf("const roomCallbackSafeToSource"),
);

describe("MoveToSourceSafely uses the safe-to-source matrix", () => {
  it("the search is wired to roomCallbackSafeToSource, not roomCallbackRoadPrio", () => {
    assert.include(SAFE_FN, "roomCallbackSafeToSource");
    assert.notInclude(SAFE_FN, "roomCallbackRoadPrio");
  });

  it("the safe callback actually exists", () => {
    assert.include(CODE, 'memoMatrix("safeToSource", buildSafeToSource)');
  });

  it("the +-7 hostile band is inside the matrix being searched", () => {
    assert.include(SAFE_BUILD, "for(let i=-7; i<=7; i++)");
    assert.include(SAFE_BUILD, "for(let o=-7; o<=7; o++)");
  });

  it("hostiles are stamped AFTER structures, so a hostile on a road stays 255", () => {
    const roads = SAFE_BUILD.indexOf("STRUCTURE_ROAD");
    const hostiles = SAFE_BUILD.indexOf("hostiles.forEach");
    assert.isAbove(roads, -1);
    assert.isAbove(hostiles, roads, "hostile stamp must follow the road write");
  });
});
