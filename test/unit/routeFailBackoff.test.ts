import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

/**
 * Game.map.findRoute answers -2 for an unreachable target — and -2 satisfies
 * the route-recompute condition in moveToRoomAvoidEnemyRooms, so every creep
 * aimed at an unreachable room paid a fresh findRoute EVERY tick and still
 * never moved. A backoff now waits 50 ticks between retries and stamps
 * _routeFailT on each failure.
 */
const SRC = fs.readFileSync(
    path.join(__dirname, "../../src/Functions/creepFunctions.ts"), "utf8"
).replace(/\r\n/g, "\n");

describe("unreachable-route backoff", () => {
    it("a stored -2 route short-circuits before the next findRoute", () => {
        const i = SRC.indexOf("this.memory.route = Game.map.findRoute");
        assert.isAbove(i, -1, "findRoute call site missing");
        const before = SRC.slice(Math.max(0, i - 1200), i);
        assert.include(before, "this.memory.route === -2 && Game.time - (this.memory._routeFailT || 0) < 50",
            "no -2 backoff before the recompute");
    });

    it("the -2 result stamps _routeFailT", () => {
        const i = SRC.indexOf("this.memory.route = Game.map.findRoute");
        assert.isAbove(i, -1);
        const after = SRC.slice(i, i + 4000);
        assert.include(after, "this.memory._routeFailT = Game.time",
            "failure timestamp never written");
    });
});
