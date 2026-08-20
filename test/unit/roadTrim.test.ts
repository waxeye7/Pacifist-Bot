/**
 * Controller roads stop at the depot (owner rule, 2026-08-20): road tiles
 * within chebyshev 4 of the controller are walked once per creep lifetime but
 * repaired forever. trimControllerRoads removes them from an adopted plan,
 * keeping only the depot container's own approach, with plan.rs index-locked.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import { trimControllerRoads } from "../../src/utils/roadTrim";

const P = (x: number, y: number) => x + y * 50;

describe("trimControllerRoads", () => {
    const ctrl = { x: 25, y: 25 };

    it("drops tiles within 4 of the controller, keeps everything at 4+", () => {
        const road = [P(25, 24), P(23, 23), P(28, 25), P(25, 29), P(25, 21), P(10, 10)];
        //            d=1        d=2        d=3        d=4        d=4        far
        const t = trimControllerRoads(road, undefined, ctrl, []);
        assert.deepEqual(t.road, [P(25, 29), P(25, 21), P(10, 10)]);
        assert.equal(t.dropped, 3);
    });

    it("keeps the depot approach: tiles adjacent to a container within 4 of the controller", () => {
        const depot = P(23, 24); // container at d=2 from ctrl
        const road = [
            P(22, 23), // adjacent to depot, d=3 from ctrl  -> KEPT
            P(24, 24), // adjacent to depot, d=1 from ctrl  -> KEPT (approach)
            P(26, 26), // d=1, NOT near depot               -> dropped
        ];
        const t = trimControllerRoads(road, undefined, ctrl, [depot]);
        assert.deepEqual(t.road, [P(22, 23), P(24, 24)]);
        assert.equal(t.dropped, 1);
    });

    it("ignores containers farther than 4 from the controller (source boxes)", () => {
        const srcBox = P(10, 10);
        const road = [P(26, 26)]; // d=1, adjacent to nothing relevant
        const t = trimControllerRoads(road, undefined, ctrl, [srcBox]);
        assert.equal(t.road.length, 0);
        assert.equal(t.dropped, 1);
    });

    it("filters rs under the same keep-mask when index-locked", () => {
        const road = [P(25, 24), P(25, 29), P(24, 23), P(40, 40)];
        const rs = [3, 3, 4, 4];
        const t = trimControllerRoads(road, rs, ctrl, []);
        assert.deepEqual(t.road, [P(25, 29), P(40, 40)]);
        assert.deepEqual(t.rs, [3, 4]);
        assert.equal(t.dropped, 2);
    });

    it("passes a length-mismatched rs through untouched (legacy pack)", () => {
        const road = [P(25, 24), P(40, 40)];
        const rs = [3, 3, 3]; // wrong length — roadsForRcl already ignores it
        const t = trimControllerRoads(road, rs, ctrl, []);
        assert.deepEqual(t.road, [P(40, 40)]);
        assert.strictEqual(t.rs, rs);
    });

    it("no-ops cleanly on empty input", () => {
        const t = trimControllerRoads([], [1], ctrl, []);
        assert.equal(t.road.length, 0);
        assert.equal(t.dropped, 0);
    });
});

describe("sync integration (source pins)", () => {
    const PLAN = fs.readFileSync(path.join(__dirname, "../../src/utils/PlanV2.ts"), "utf8");

    it("syncPlanV2Memory trims one-shot per plan and keeps rs locked", () => {
        assert.match(PLAN, /import \{ trimControllerRoads \} from "utils\/roadTrim";/);
        const sync = PLAN.indexOf("function syncPlanV2Memory");
        const guard = PLAN.indexOf("if (!(plan as any).ct)", sync);
        const call = PLAN.indexOf("trimControllerRoads(", sync);
        const rsAssign = PLAN.indexOf("(plan as any).rs = trimmed.rs;", sync);
        assert.isAbove(guard, sync, "one-shot ct guard inside the sync");
        assert.isAbove(call, guard, "the trim call is behind the guard");
        assert.isAbove(rsAssign, call, "rs is reassigned in lockstep");
    });
});
