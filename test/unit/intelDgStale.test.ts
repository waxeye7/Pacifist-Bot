import { assert } from "chai";
import fs from "fs";

/**
 * recordRoom() cleared every sibling controller field on falsy (rv, sa, sm,
 * sc, ub) but never dg — a controller that recovered kept its stale
 * ticksToDowngrade in the intel record forever. dg now deletes like the rest.
 */
const SRC = fs.readFileSync("src/War/intel.ts", "utf8")
    .replace(/[/][*][^]*?[*][/]/g, "").replace(/[/][/].*/g, "");

describe("intel dg clears when the controller recovers", () => {
    it("deletes rec.dg on falsy ticksToDowngrade", () => {
        const i = SRC.indexOf("rec.dg = ctrl.ticksToDowngrade");
        assert.isAbove(i, -1);
        assert.include(SRC.slice(i, i + 120), "delete rec.dg");
    });
});

describe("intel sc stores the cooldown end tick, not a doubled timestamp", () => {
    it("rec.sc = ctrl.safeModeCooldown (absolute), not Game.time + it", () => {
        // safeModeCooldown is already an absolute end tick — Game.time +
        // safeModeCooldown wrote ~2*now into the record. upgradeBlocked is
        // the sibling that IS a duration and keeps its conversion.
        assert.include(SRC, "rec.sc = ctrl.safeModeCooldown");
        assert.notInclude(SRC, "rec.sc = Game.time + ctrl.safeModeCooldown");
        assert.include(SRC, "rec.ub = Game.time + ctrl.upgradeBlocked");
    });
});
