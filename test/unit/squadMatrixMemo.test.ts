import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

// SquadDuo runs PathFinder.search every tick in the target room and the quad
// pathers do the same — each search invoked a roomCallback that rebuilt a
// 2,401-tile terrain pass plus full structure/creep scans. All four exported
// callbacks now go through a per-(variant, room)-per-tick memo.
describe("squad roomCallback matrix memo", function () {
    const src = readFileSync(join(__dirname, "../../src/Roles/Squad/SquadHelperFunctions.ts"), "utf8");

    it("routes every exported callback through the memo", function () {
        for (const name of ["roomCallbackSquadA", "roomCallbackSquadASwampCostSame", "roomCallbackSquadGetReady", "roomCallbackDuo"]) {
            const decl = src.slice(src.indexOf("const " + name), src.indexOf("const " + name) + 400);
            expect(decl, name).to.include("memoizedMatrix(");
            expect(decl, name).to.not.match(/=>\s*buildQuadCostMatrix/);
        }
    });

    it("keys the memo on variant and room with a tick check", function () {
        const start = src.indexOf("const memoizedMatrix");
        const slice = src.slice(start, start + 800);
        expect(slice).to.include('variant + ":" + roomName');
        expect(slice).to.include("hit.tick === Game.time");
    });

    it("caches the no-vision undefined answer too", function () {
        // the memo entry stores costs unconditionally — including undefined,
        // which is a deliberate answer (terrain fallback), not a cache miss
        const start = src.indexOf("const memoizedMatrix");
        const slice = src.slice(start, start + 800);
        expect(slice).to.include("_matrixMemo[key] = {tick: Game.time, costs}");
    });
});
