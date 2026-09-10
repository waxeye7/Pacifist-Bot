/**
 * `memory.moving` is the traffic system's only record of "this creep asked to
 * move", and a role that clears it AFTER calling a mover makes itself
 * invisible to every escape the bot has.
 *
 * RunCreepManager.preRun reads LAST tick's value to keep `_still`, the
 * consecutive-ticks-without-changing-tile counter. `_still` arms both rescues:
 * canShove() lets a NEIGHBOUR displace a creep blocked for
 * STILL_SHOVABLE_AFTER ticks, and the sidestep at STUCK_STILL_TICKS routes the
 * creep around whatever is in the way.
 *
 * Roles/repair cleared it one line after asking two different movers to move.
 * Live E37N58 2026-09-10: Repair-52069239 read `moving: false, _still: 0` for
 * its whole life while re-issuing a move at a seated miner every tick — both
 * unrescuable and unshovable, and reported by nothing.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const SRC = (p: string) =>
    fs.readFileSync(path.join(__dirname, "../../src/", p), "utf8").replace(/\r\n/g, "\n");

const ROLES = fs
    .readdirSync(path.join(__dirname, "../../src/Roles"))
    .filter((f) => f.endsWith(".ts"));

describe("memory.moving is cleared at the top of run(), and nowhere else", () => {
    it("no role clears it in the wake of a mover call", () => {
        // The defect shape, precisely: a `moving = false` that follows a mover
        // in the same breath. A role's own prologue reset is the contract and
        // is never preceded by one.
        const MOVER = /(MoveCostMatrix\w*|interiorMove|advanceTo|moveToRoom\w*|moveTo)\s*\(/;
        const offenders: string[] = [];
        for (const f of ROLES) {
            const lines = SRC("Roles/" + f).split(String.fromCharCode(10));
            let sinceMover = 99;
            lines.forEach((raw, i) => {
                const l = raw.trim();
                if (l.startsWith("//") || l.startsWith("*") || l.startsWith("/*")) return;
                if (/memory\.moving\s*=\s*false/.test(l) && sinceMover <= 12) {
                    offenders.push(f + ":" + (i + 1) + "  " + l);
                }
                // A brace in column 0 closes a top-level function: whatever
                // moved in there did not move on behalf of the next one.
                if (raw === "}" || raw === "};") sinceMover = 99;
                else sinceMover = MOVER.test(l) ? 0 : sinceMover + 1;
            });
        }
        assert.deepEqual(offenders, [], "moving must not be cleared after a mover has been called");
    });

    it("repair still asks a mover when its target is out of range", () => {
        const R = SRC("Roles/repair.ts");
        assert.include(R, "if (!interiorMove(creep, repairTarget, 3)) {");
        assert.include(R, "creep.MoveCostMatrixRoadPrio(repairTarget, 3)");
    });

    it("...and _still is still what gates both escapes", () => {
        const RCM = SRC("Managers/RunCreepManager.ts");
        const CF = SRC("Functions/creepFunctions.ts");
        assert.include(RCM, "if (stillHere && m.moving && creep.fatigue === 0) {");
        assert.include(RCM, "m._still = (m._still || 0) + 1;");
        assert.include(RCM, "if ((m._still || 0) >= STUCK_STILL_TICKS) {");
        assert.include(CF, "return (other.memory._still || 0) >= STILL_SHOVABLE_AFTER;");
    });
});
