import { assert } from "chai";
import fs from "fs";

/**
 * Solomon has two PathFinder cost-matrix builders. Only one was memoized:
 * pathAroundStructuresAndTerrain keeps a per-room per-tick cache, while
 * GoToTheClosestSpawn rebuilt a 2500-tile matrix plus three room finds for
 * EVERY creep's search — a Solomon pack chasing one spawn paid for N
 * identical matrices a tick. GoToTheClosestSpawn now uses the same
 * tick-keyed heap memo shape.
 */
const SRC = fs.readFileSync("src/Roles/Solomon.ts", "utf8")
    .replace(/[/][*][^]*?[*][/]/g, "").replace(/[/][/].*/g, "");

describe("GoToTheClosestSpawn matrix is memoized per room per tick", () => {
    it("checks and fills a tick-keyed cache", () => {
        const i = SRC.indexOf("const GoToTheClosestSpawn");
        const j = SRC.indexOf("const matrixCache");
        assert.isAbove(i, -1);
        assert.isAbove(j, i);
        const body = SRC.slice(i, j);
        assert.include(body, "spawnMatrixCache[roomName]");
        assert.include(body, "hit.tick === Game.time");
        assert.include(body, "tick: Game.time, costs: false");
        assert.include(body, "tick: Game.time, costs: costs");
    });
});
