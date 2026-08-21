/**
 * Site place/strip churn (2026-08-22, VPS film: "something is clearing
 * construction sites all the time"). Two mechanisms, one boundary:
 *  - W1N1 (RCL8) storage oscillated a few hundred energy around the 150k
 *    broke floor: rich ticks placed labs + a nuker, broke ticks stripped
 *    them ~150t later at 1-2k progress — builder energy destroyed per
 *    cycle, forever. The clamp and the strip read the SAME latched broke
 *    state now (enter at floor, exit at floor + margin).
 *  - The strip's keep-first-4-roads rule ate the remote system's exterior
 *    connector road sites at 0 progress (W3N1 13,14 / 12,14), undoing the
 *    shell->exit connector fix a few hundred ticks after it landed.
 * Source-shape pins, same convention as siteBudget.test.ts.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(path.join(__dirname, "../../src/utils/PlanV2.ts"), "utf8");

describe("broke-boundary site churn", () => {
    it("broke is LATCHED: enter at the floor, exit only at floor + margin", () => {
        assert.match(SRC, /const BROKE_EXIT_MARGIN = 15000;/);
        assert.match(SRC, /const broke = e < floor \|\| \(latched && e < floor \+ BROKE_EXIT_MARGIN\);/);
    });

    it("the clamp and the strip read the same latched answer", () => {
        assert.match(SRC, /if \(bankIsBroke\(room, e, floor\)\) \{/,
            "maxSitesFor's clamp entry");
        assert.match(SRC, /bankIsBroke\(room, bankE, brokeFloor\);/,
            "the strip's brokeBank");
        assert.notMatch(SRC, /\(room\.storage\.store\[RESOURCE_ENERGY\] \|\| 0\) < brokeFloor;/,
            "no raw unlatched comparison may survive at the strip");
    });

    it("what the typed lab grant places, the strip keeps — with a margin below the grant bar", () => {
        assert.match(SRC, /if \(e >= floor \/ 2 && labCap > 0 && labs < labCap\) return grant\("lab"\);/);
        assert.match(SRC, /if \(s\.structureType === STRUCTURE_LAB && bankE >= brokeFloor \/ 2 - 5000\) continue;/,
            "W5N3's 17k bank grazing the 15k bar stripped a 2000-progress lab — the half-floor line flaps like the floor did");
    });

    it("exterior connector road sites are the remote system's, not the strip's", () => {
        assert.match(SRC, /if \(s\.structureType === STRUCTURE_ROAD && isExteriorTile\(room, s\.pos\.x, s\.pos\.y\)\) continue;/);
    });
});
