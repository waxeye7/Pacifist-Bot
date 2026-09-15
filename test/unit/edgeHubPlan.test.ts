import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import { computeBasePlan } from "../../src/utils/BasePlan";

/**
 * RoomPosition(x, y) throws RangeError for x or y outside 0..49. The audit of
 * every non-constant construction in src/ found the survivors were all
 * storage-offset "luxury" placements in rooms.construction.ts plus one
 * planner seed in BasePlan.computeBasePlan:
 *
 *  - A real structure can sit on tile 1 or 48 (createConstructionSite only
 *    forbids 0 and 49), so storage.pos.x + 4 is 52 when the hub sits on x=48.
 *    The author's own safePos() already guards six sibling sites - these six
 *    were missed.
 *  - computeBasePlan seeds localBest at {x: spawn.x, y: spawn.y - 2} with
 *    score -Infinity. When every tile in the spawn +-4 window scores
 *    -Infinity (a spawn on tile 1 whose in-margin strip is all wall), that
 *    seed is adopted unchanged and memory.basePlan.hub.y = -1 - a RangeError
 *    every tick in RampartDefender and any other hub reader.
 */

const SRC = (p: string) =>
    fs.readFileSync(path.join(__dirname, "../../src/", p), "utf8").replace(/\r\n/g, "\n");

describe("construction(): storage-offset placements are edge-safe", () => {
    // Strip full-line comments so commented-out legacy sites cannot trip the scan.
    const live = SRC("Rooms/rooms.construction.ts")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");

    it("the six missed offsets no longer reach a raw RoomPosition", () => {
        // The lab-bank sites at ~1015-1059 stay raw on purpose: they sit
        // behind the storage.pos.x >= 5 && storage.pos.y <= 46 gate. These
        // six had no gate - assert the raw expressions are gone.
        for (const re of [
            /new RoomPosition\(storage\.pos\.x, storage\.pos\.y - 2/,
            /new RoomPosition\(storage\.pos\.x \+ 2, storage\.pos\.y, room\.name\)/,
            /new RoomPosition\(storage\.pos\.x - 2, storage\.pos\.y \+ 1/,
            /new RoomPosition\(storage\.pos\.x \+ 4, storage\.pos\.y, room\.name\)/,
            /new RoomPosition\(storage\.pos\.x \+ 3, storage\.pos\.y \+ 2/,
            /new RoomPosition\(storage\.pos\.x - 1, storage\.pos\.y \+ 2/,
        ]) {
            assert.notMatch(live, re, "unguarded storage-offset site survives: " + re);
        }
    });

    it("each of the six missed sites now goes through safePos + a null check", () => {
        for (const [expr, guard] of [
            ["safePos(storage.pos.x, storage.pos.y - 2", "if(secondSpawnPosition)"],
            ["safePos(storage.pos.x + 2, storage.pos.y", "if(thirdSpawnPosition)"],
            ["safePos(storage.pos.x - 2, storage.pos.y + 1", "if(observerPosition)"],
            ["safePos(storage.pos.x + 4, storage.pos.y", "if(nukerPosition)"],
            ["safePos(storage.pos.x + 3, storage.pos.y + 2", "if(powerSpawnPosition)"],
            ["safePos(storage.pos.x - 1, storage.pos.y + 2", "if(terminalPosition)"],
        ] as [string, string][]) {
            const idx = live.indexOf(expr);
            assert.isAbove(idx, -1, "missing guarded site: " + expr);
            assert.include(live.slice(idx, idx + 300), guard, "no null check after " + expr);
        }
    });

    it("the mineral-path rampart seat tolerates an empty path", () => {
        // storage within range 1 of the mineral leaves path[] empty; the old
        // code passed undefined into getRangeTo. Matches the controller fix.
        const idx = live.indexOf("pathFromStorageToMineral");
        assert.isAbove(idx, -1);
        const block = live.slice(idx, idx + 700);
        assert.include(block, "pathFromStorageToMineral.path.length > 0 ?");
        assert.include(block, "if(RampartLocationMineral && storage.pos.getRangeTo(RampartLocationMineral)");
    });
});

describe("computeBasePlan: spawn-bias window can be all-unusable", () => {
    function mockRoom(spawnPos: { x: number; y: number }): any {
        return {
            name: "E1S1",
            memory: {},
            storage: null,
            controller: { my: true, pos: { x: 25, y: 30 }, level: 1 },
            find(what: number) {
                if (what === FIND_SOURCES) return [{ pos: { x: 25, y: 25 }, id: "s1" }];
                if (what === FIND_MY_SPAWNS) return [{ pos: spawnPos, id: "sp1" }];
                return [];
            },
        };
    }

    it("edge spawn + walled margin keeps hub inside 0..49", () => {
        // All plain terrain except (5,5) - the only in-margin tile in the
        // spawn +-4 window around a spawn at (1,1). Every candidate scores
        // -Infinity, so the old code adopted the {x:1, y:-1} seed.
        const terrain = { get: (x: number, y: number) => (x === 5 && y === 5 ? TERRAIN_MASK_WALL : 0) };
        const map = (Game as any).map;
        const prev = map.getRoomTerrain;
        map.getRoomTerrain = () => terrain;
        try {
            const plan: any = computeBasePlan(mockRoom({ x: 1, y: 1 }));
            assert.isOk(plan, "planner returned null");
            assert.isAtLeast(plan.hub.x, 0);
            assert.isAtMost(plan.hub.x, 49);
            assert.isAtLeast(plan.hub.y, 0, "hub.y fell to the -1 seed (spawn.y - 2)");
            assert.isAtMost(plan.hub.y, 49);
        } finally {
            map.getRoomTerrain = prev;
        }
    });

    it("normal edge spawn still adopts the spawn-bias pick", () => {
        // All plain terrain: the +-4 window around (1,1) contains open tiles,
        // so the spawn bias must still engage - hub stays within 4 of spawn.
        const map = (Game as any).map;
        const prev = map.getRoomTerrain;
        map.getRoomTerrain = () => ({ get: () => 0 });
        try {
            const plan: any = computeBasePlan(mockRoom({ x: 1, y: 10 }));
            assert.isOk(plan, "planner returned null");
            assert.isAtMost(Math.abs(plan.hub.x - 1), 4, "spawn bias lost the hub");
            assert.isAtMost(Math.abs(plan.hub.y - 10), 4, "spawn bias lost the hub");
        } finally {
            map.getRoomTerrain = prev;
        }
    });
});
