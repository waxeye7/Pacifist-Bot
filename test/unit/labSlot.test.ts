/**
 * 2026-08-20 live/VPS follow-ups:
 *  - VPS W1N1 (RCL8) held 7/10 labs forever: the broke-bank clamp granted 0
 *    site slots below the 150k floor while the bank oscillated 130-165k. The
 *    clamp now grants ONE slot for a missing lab at >= half the floor.
 *  - Live E36N57/E37N59: rampart sites (progressTotal 1 — a single build()
 *    finishes them) sat at 0/1 for hours because no builder rung ever named
 *    ramparts. There is now an instant rung ahead of the eco order.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const PLAN = fs.readFileSync(path.join(__dirname, "../../src/utils/PlanV2.ts"), "utf8");
const BUILDER = fs.readFileSync(path.join(__dirname, "../../src/Roles/builder.ts"), "utf8");

describe("broke-clamp lab slot (W1N1 7/10 labs)", () => {
    it("grants one slot for a missing lab at half the floor, inside the broke branch", () => {
        const start = PLAN.indexOf("function maxSitesFor");
        assert.isAbove(start, -1);
        const body = PLAN.slice(start, PLAN.indexOf("\nconst SYNC_EVERY", start));
        const core = body.indexOf("coreBuildoutIncomplete(lvl, structs)) return 2;");
        const half = body.indexOf("e >= floor / 2");
        const grant = body.indexOf("(labCap > 0 && labs < labCap) || (termCap > 0 && terms < termCap)) return 1;");
        assert.isAbove(core, -1, "core drip still present");
        assert.isAbove(half, core, "lab/terminal exception sits after the core drip");
        assert.isAbove(grant, half, "the grant is inside the half-floor guard");
        // still fully clamped when genuinely broke: the final return 0 survives
        assert.isAbove(body.indexOf("return 0;", grant), -1);
    });
});

describe("builder rampart rung (0/1 sites lingering)", () => {
    it("exists, and sits after the link/storage rung and before the extension rung", () => {
        const rung = BUILDER.indexOf("RAMPART SITES ARE ONE INTENT");
        assert.isAbove(rung, -1);
        const absolute = BUILDER.indexOf("STRUCTURE_LINK\n\t\t\t\t\t|| building.structureType == STRUCTURE_STORAGE");
        const anyAbsolute = absolute > -1 ? absolute : BUILDER.indexOf("STRUCTURE_STORAGE");
        assert.isAbove(rung, anyAbsolute, "rampart rung after the absolute link/storage rung");
        const ext = BUILDER.indexOf("return building.structureType == STRUCTURE_EXTENSION;");
        assert.isAbove(ext, rung, "rampart rung before the extension rung");
        // the rung actually filters for rampart sites and picks the closest
        const slice = BUILDER.slice(rung, rung + 900);
        assert.match(slice, /structureType == STRUCTURE_RAMPART/);
        assert.match(slice, /findClosestByRange\(rampSites\)/);
    });
});
