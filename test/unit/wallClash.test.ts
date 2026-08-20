/**
 * Live VPS W5N3 (2026-08-20): the planner put the source link ON a shellCut
 * tile. A blocker structure in the wall line breaks the defender lane — the
 * defender ordered onto it bounces off and leaves the wall mid-fight.
 * Containment is bot-side and two-fold: placement refuses to site blockers on
 * the cut, and defender seat assignment skips ramparts with a blocker beneath.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const PLAN = fs.readFileSync(path.join(__dirname, "../../src/utils/PlanV2.ts"), "utf8");
const DEFENCE = fs.readFileSync(path.join(__dirname, "../../src/Rooms/rooms.defence.ts"), "utf8");

describe("wall-clash guard (W5N3 link on the shell cut)", () => {
    it("WALL_BLOCKERS names every unwalkable plan type and no walkable one", () => {
        const at = PLAN.indexOf("const WALL_BLOCKERS");
        assert.isAbove(at, -1);
        const block = PLAN.slice(at, PLAN.indexOf("};", at));
        for (const k of ["spawn", "extension", "storage", "tower", "link", "terminal", "lab", "nuker", "observer"]) {
            assert.include(block, `${k}: true`, `${k} must be a wall blocker`);
        }
        for (const k of ["road:", "container:", "rampart:", "extractor:"]) {
            assert.notInclude(block, k, `${k} is walkable/tile-sharing — must not be refused`);
        }
    });

    it("placement refuses a blocker on a cut tile BEFORE createConstructionSite", () => {
        const guard = PLAN.indexOf("WALL_BLOCKERS[type] && cutSet.has(packed)");
        assert.isAbove(guard, -1);
        const site = PLAN.indexOf("room.createConstructionSite(x, y, type as BuildableStructureConstant)");
        assert.isAbove(site, guard, "guard must run before the site intent");
        // the guard lives inside placeFromPlanV2, after the cut set is built
        const cutSet = PLAN.indexOf("const cutSet = new Set<number>(plan.t.shellCut || []);");
        assert.isAbove(cutSet, PLAN.indexOf("export function placeFromPlanV2"));
        assert.isAbove(guard, cutSet);
    });

    it("defender seats skip ramparts with a blocking structure beneath", () => {
        const at = DEFENCE.indexOf("function assignDefenderTiles");
        assert.isAbove(at, -1);
        const body = DEFENCE.slice(at, at + 2200);
        assert.match(body, /structureType !== STRUCTURE_RAMPART/);
        assert.match(body, /structureType !== STRUCTURE_ROAD/);
        assert.match(body, /structureType !== STRUCTURE_CONTAINER/);
        assert.include(body, "if (blocked) continue;");
    });
});
