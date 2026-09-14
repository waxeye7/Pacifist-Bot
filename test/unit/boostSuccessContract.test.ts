import { assert } from "chai";
import fs from "fs";

/**
 * Boost() contract: true means "boostlabs is empty", false means "keep
 * waiting". The successful-boost path used to return `true` unconditionally
 * while the drop paths returned `boostlabs.length == 0 ? true : false`.
 * A creep with two labs boosted the first, reported done, ran its work pass,
 * then re-entered Boost() next tick and walked back — once per extra lab.
 * The success path now uses the same empty-list contract.
 */
const SRC = fs.readFileSync("src/Functions/creepFunctions.ts", "utf8")
    .replace(/[/][*][^]*?[*][/]/g, "").replace(/[/][/].*/g, "");

describe("Boost() success path keeps the empty-list contract", () => {
    it("returns length == 0 check after a successful boostCreep", () => {
        const i = SRC.indexOf("boostCreep(this)");
        assert.isAbove(i, -1);
        const seg = SRC.slice(i, i + 400);
        const ok = seg.indexOf("result == 0");
        const drop = seg.indexOf("dropThisLab()", ok);
        const ret = seg.indexOf("return", drop);
        assert.isAbove(ret, drop);
        assert.include(seg.slice(drop, ret + 80), "boostlabs.length == 0");
    });
});
