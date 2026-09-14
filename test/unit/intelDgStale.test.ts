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
