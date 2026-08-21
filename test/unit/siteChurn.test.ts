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
        assert.match(SRC, /if \(type === STRUCTURE_LAB\) return bankE >= brokeFloor \/ 2 - 5000;/,
            "W5N3's 17k bank grazing the 15k bar stripped a 2000-progress lab — the half-floor line flaps like the floor did");
    });

    it("exterior connector road sites are the remote system's, not the strip's", () => {
        const strip = SRC.indexOf("if (brokeBank && brokeBankStripFires(budget, nakedShell, coreIncomplete))");
        assert.isAbove(strip, -1);
        const body = SRC.slice(strip, strip + 1800);
        assert.match(body, /if \(isExteriorTile\(room, s\.pos\.x, s\.pos\.y\)\) continue;/);
        assert.match(body, /crossSet\.has\(s\.pos\.x \+ s\.pos\.y \* 50\)\) continue;/,
            "a road site on the wall line is the haul crossing — roads and my ramparts stack");
    });
});

describe("a broke room may only place what the strip keeps", () => {
    it("one keep-set, read by BOTH the placer and the strip", () => {
        assert.match(SRC, /export function brokeKeepsSite\(/);
        assert.match(SRC, /if \(brokeBank && !brokeKeepsSite\(type, bankE, brokeFloor, nakedShell\)\) continue;/,
            "the placement loop must refuse any type the strip would remove");
        assert.match(SRC, /if \(brokeKeepsSite\(s\.structureType, bankE, brokeFloor, nakedShell\)\) \{/,
            "the strip must decide from the same predicate");
    });

    it("default-deny: nuker/observer cannot become churn while broke", () => {
        const at = SRC.indexOf("export function brokeKeepsSite(");
        const body = SRC.slice(at, at + 1300);
        assert.include(body, "if (type === STRUCTURE_RAMPART) return !!nakedShell;");
        assert.match(body, /return false;\s*\n\}/,
            "a new PLACE_ORDER type must not silently become churn");
    });

    it("core-incomplete's UNTYPED 2 slots can no longer reach lab (the W5N3 hole)", () => {
        // coreBuildoutIncomplete returned 2 with _exceptionSlotFor null, so
        // PLACE_ORDER walked past the capped spawn/ext/tower down to lab, and
        // brokeBankStripFires fires on coreIncomplete regardless of budget —
        // place, 15 ticks of builder, strip, repeat.
        assert.match(SRC, /if \(coreBuildoutIncomplete\(lvl, structs\)\) return 2;/,
            "the 2-slot core grant still exists and is still untyped...");
        const grant = SRC.indexOf("if (coreBuildoutIncomplete(lvl, structs)) return 2;");
        const guard = SRC.indexOf("if (brokeBank && !brokeKeepsSite(type, bankE, brokeFloor, nakedShell)) continue;");
        assert.isAbove(guard, grant, "...so the keep-set guard is what fences it");
    });

    it("every strip removal is attributable — room, type, pos, progress, reason", () => {
        assert.match(SRC, /planV2 \$\{room\.name\}: STRIP \$\{s\.structureType\}@\$\{s\.pos\.x\},\$\{s\.pos\.y\}/);
        assert.match(SRC, /progress \$\{s\.progress\}\/\$\{s\.progressTotal\} lost/,
            "the log must carry the energy that was destroyed");
    });

    it("the drip counts what the strip counts — connectors and crossings are neither's", () => {
        const drip = SRC.indexOf("THE ROAD DRIP");
        const block = SRC.slice(drip, drip + 1300);
        assert.include(block, "if (isExteriorTile(room, s.pos.x, s.pos.y)) continue;",
            "standing connectors used to suppress the interior drip forever");
        assert.include(block, "dripCross.has(s.pos.x + s.pos.y * 50)");
    });
});
