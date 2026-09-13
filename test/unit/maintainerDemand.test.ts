/**
 * A CRITICAL RAMPART LOST ITS MAINTAINER TO THE CONTAINER CAP.
 *
 * The rampart loop sets `spawnMaintainer = true` for any rampart at <=10k
 * hits. A few lines later the container block then ran
 * `spawnMaintainer = containerOverrideAllowed(room, worstFraction)` — an
 * unconditional overwrite. With two other rooms already running maintainers
 * and the worst container still above CONTAINER_DYING, the cap answers
 * false and the rampart's demand was wiped: a rampart a few ticks from
 * crumbling got no maintainer because an unrelated container was merely
 * worn. Container demand is additive — it must never cancel rampart demand.
 */
import { assert } from "chai";
import fs from "fs";

const SRC = fs.readFileSync("src/Rooms/rooms.spawning.ts", "utf8");
const CODE = SRC.replace(/[/][*][^]*?[*][/]/g, "").replace(/[/][/].*/g, "");

/** The block that turns container wear into maintainer demand. */
const BLOCK = CODE.slice(
  CODE.indexOf("const worstBox"),
  CODE.indexOf("const worstBox") + 1500,
);

describe("container wear adds to maintainer demand, never replaces it", () => {
  it("containerOverrideAllowed can only RAISE the flag", () => {
    assert.include(BLOCK, "spawnMaintainer = spawnMaintainer || containerOverrideAllowed(room, worstFraction)");
    assert.notInclude(BLOCK, "spawnMaintainer = containerOverrideAllowed(room, worstFraction);");
  });

  it("the rampart demand source is still there", () => {
    assert.include(CODE, "if(rampart.hits <= 10000)");
  });
});
