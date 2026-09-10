import { assert } from "chai";
import fs from "fs";

/**
 * THE BROKE-ROOM EXCEPTION SLOT COULD NEVER BE TAKEN.
 *
 * maxSitesFor grants a broke room exactly ONE typed slot for the structure
 * that can un-break it — terminal, extractor, link, container. The budget is
 * then `grant(1) - liveSites`, and the road drip stands up to ROAD_DRIP (4)
 * sites BEFORE that subtraction and independently of it. A room holding four
 * drip roads computes 1 - 4 = -3, returns at `if (budget <= 0)` above the
 * placement loop, and never takes the exception.
 *
 * Both mechanisms are individually reasonable and they cancel out.
 *
 * Live shard3 2026-09-11, in the very room the container grant was written
 * for. E35N59's plan wants containers at 19,6 / 38,19 / 16,17 / 30,14. Three
 * stood; 38,19 did not. Its miner sat on that tile drop-mining onto the floor,
 * 557 energy and climbing, decaying at 1/1000 a tick, while the room held four
 * road sites and a 6,234 bank that qualified for the grant.
 *
 * The grant's own comment calls a container "the cheapest structure in the
 * plan that changes a room's income". The roads in front of it are a
 * convenience.
 */
const PV = fs.readFileSync("src/utils/PlanV2.ts", "utf8");
const CODE = PV.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("the exception slot survives the road drip", () => {
  it("places the exception before the budget gate", () => {
    const ex = CODE.indexOf("if (_exceptionSlotFor && _exceptionSlotFor !== \"road\"");
    const gate = CODE.indexOf("if (budget <= 0) return;");
    assert.isAbove(ex, 0, "exception placement must exist");
    assert.isAbove(gate, ex, "it must run above the budget gate");
  });

  it("places it ahead of the road drip, which outranks it in nothing", () => {
    const ex = CODE.indexOf("if (_exceptionSlotFor && _exceptionSlotFor !== \"road\"");
    const drip = CODE.indexOf("let drip = ROAD_DRIP - roadSitesNow;");
    assert.isAbove(drip, ex);
  });

  it("is bounded to a single site", () => {
    // The grant is one slot. This must not become a second, untyped budget.
    const block = CODE.slice(
      CODE.indexOf("if (_exceptionSlotFor && _exceptionSlotFor !== \"road\""),
      CODE.indexOf("let drip = ROAD_DRIP - roadSitesNow;")
    );
    assert.match(block, /break;/);
    assert.notMatch(block, /exBudget|for \(let i = 0/);
  });

  it("marks the tile immediately so it cannot churn", () => {
    const block = CODE.slice(
      CODE.indexOf("if (_exceptionSlotFor && _exceptionSlotFor !== \"road\""),
      CODE.indexOf("let drip = ROAD_DRIP - roadSitesNow;")
    );
    assert.match(block, /exPlaced\[p\] = true;/);
  });

  it("stands down for a spawnless or naked-shell room", () => {
    // Those two states have their own reserved slots and this must not spend
    // them; the placer's existing guards say so for the drip too.
    assert.match(CODE, /_exceptionSlotFor !== "road" && !spawnless && !nakedShell/);
  });

  it("still leaves the typed filter in the main placement loop", () => {
    // The exception is TYPED there as well; both paths must agree on that.
    assert.match(CODE, /if \(_exceptionSlotFor && type !== _exceptionSlotFor\) continue;/);
  });

  it("keeps the container grant it exists to serve", () => {
    assert.match(CODE, /if \(planContainers > 0 && containers < planContainers && e >= 5000\)/);
    assert.match(CODE, /return grant\("container"\);/);
  });
});
