import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

// During a raid every civilian creep in the room flees every tick, and each
// flee call built a fresh 2500-tile matrix plus a structure scan. Both flee
// functions now share one builder on the existing caching layer: the
// forever-cached terrain base plus getCachedCostMatrix per room per tick.
describe("flee cost-matrix caching", function () {
    const src = readFileSync(join(__dirname, "../../src/Functions/creepFunctions.ts"), "utf8");

    it("builds flee matrices through getCachedCostMatrix", function () {
        const start = src.indexOf("const fleeCostMatrix");
        const slice = src.slice(start, start + 1800);
        expect(slice).to.include("getCachedCostMatrix(");
        expect(slice).to.include("terrainBaseMatrix(");
    });

    it("keys the per-tick cache on the role cost variant", function () {
        const start = src.indexOf("const fleeCostMatrix");
        const slice = src.slice(start, start + 1800);
        // carry/filler flee on (swamp 1, plain 2), everyone else on (5, 1) —
        // the variant has to be in the key or one role inherits the other's costs
        expect(slice).to.include('"flee:" + swampCost + ":" + plainsCost');
    });

    it("drops the inline 50x50 loops from both flee functions", function () {
        for (const fn of ["fleeFromMelee", "fleeFromRanged"]) {
            const start = src.indexOf("Creep.prototype." + fn);
            const slice = src.slice(start, start + 1200);
            expect(slice, fn).to.not.include("for (let x = 0; x < 50; x++)");
            expect(slice, fn).to.include("fleeCostMatrix(room.name");
        }
    });
});
