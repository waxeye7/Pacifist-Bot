/**
 * E37N59 traffic jam (2026-08-22 film, 30 snapshots over 181 ticks): the jam
 * was not pathing — it was four idle-branch freezes parking creeps ON the
 * hub's only lanes, invisible to every stuck-detector (which only watch
 * MOVING creeps):
 *  - a full filler against a full tower kept its stale target and issued no
 *    intent (88 ticks on a lane tile), and the empty filler camped the plan
 *    sitter — a road tile that is the terminus of the single-file artery;
 *  - the EnergyManager's park fallback was commented out (181 ticks frozen);
 *  - the ControllerLinkFiller's "stay out of the hub" guard moved it INTO
 *    the hub and then froze (two 24-part squatters on storage's ring);
 *  - cached-path walkers never shove idle blockers (the swap only fired at
 *    path-computation time), burning 2-4 dropped move intents per trip.
 * Source-shape pins for each fix.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const CF = fs.readFileSync(path.join(__dirname, "../../src/Functions/creepFunctions.ts"), "utf8");
const FILLER = fs.readFileSync(path.join(__dirname, "../../src/Roles/filler.ts"), "utf8");
const EM = fs.readFileSync(path.join(__dirname, "../../src/Roles/energyManager.ts"), "utf8");
const CLF = fs.readFileSync(path.join(__dirname, "../../src/Roles/ControllerLinkFiller.ts"), "utf8");
const UP = fs.readFileSync(path.join(__dirname, "../../src/Roles/upgrader.ts"), "utf8");

describe("idlePark — the lane discipline", () => {
    it("exists on the prototype and treats roads and the storage ring as lanes", () => {
        assert.match(CF, /Creep\.prototype\.idlePark = function \(\) \{/);
        assert.match(CF, /Math\.abs\(x - stor\.pos\.x\) <= 1 && Math\.abs\(y - stor\.pos\.y\) <= 1/);
        assert.match(CF, /s\.structureType === STRUCTURE_ROAD\) return true;/);
    });

    it("is cheap when already parked well and holds when boxed in", () => {
        assert.match(CF, /if \(!isLane\(pos\.x, pos\.y\)\) return false;/);
        assert.match(CF, /return false; \/\/ boxed in/);
    });

    it("cached-path walkers shove an idle blocker on the blocked step itself", () => {
        const at = CF.indexOf("const stepCachedPath = (creep:any):void =>");
        assert.isAbove(at, -1);
        const body = CF.slice(at, at + 1600);
        assert.match(body, /blockers\[0\]\.my && !blockers\[0\]\.memory\.moving/);
        assert.match(body, /creep\.SwapPositionWithCreep\(direction\);/);
    });
});

describe("the four squatter branches issue intents now", () => {
    it("filler: a stale FULL target with nothing else hungry clears and parks", () => {
        assert.match(FILLER, /else if\(result !== 0\) \{[\s\S]{0,700}?creep\.memory\.t = false;\s*\n\s*creep\.idlePark\(\);/);
    });

    it("filler: the sitter (a road tile) is only camped while the room has fill work", () => {
        assert.match(FILLER, /creep\.room\.energyAvailable < creep\.room\.energyCapacityAvailable\s*\n?\s*\? planSitter\(creep\.room\) : null;/);
    });

    it("filler: full with no target parks instead of freezing", () => {
        assert.match(FILLER, /\/\/ Full store, nothing hungry anywhere[\s\S]{0,300}?creep\.idlePark\(\);/);
    });

    it("EnergyManager: no errand => idlePark (the fallback was commented out)", () => {
        assert.match(EM, /if\(!creep\.memory\.target\) \{\s*\n\s*creep\.idlePark\(\);/);
    });

    it("ControllerLinkFiller: bankParked parks OFF the lanes, not toward storage", () => {
        const at = CLF.indexOf("creep.memory.bankParked = true;");
        assert.isAbove(at, -1);
        const block = CLF.slice(at, at + 900);
        assert.match(block, /creep\.idlePark\(\);/);
        assert.notMatch(block, /MoveCostMatrixSwampPrio\(storage, 3\)/,
            "the old guard moved the creep INTO the hub and froze there");
    });

    it("upgrader: bankParked in range parks off-road", () => {
        const at = UP.indexOf("creep.memory.bankParked = true;");
        assert.isAbove(at, -1);
        assert.match(UP.slice(at, at + 700), /creep\.idlePark\(\);/);
    });
});
