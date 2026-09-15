import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

// Two issues lived in ram.ts. First, the 24+ ATTACK threat ring fed
// CostMatrix.get/set coordinates as low as center-3 — out-of-range coords
// throw, so a big attacker parked within 3 of the border crashed the ram's
// run every tick. Second, both matrix builders ran unmemoized while a ram
// fires up to four PathFinder.search calls per tick.
describe("ram threat ring and matrix caching", function () {
    const src = readFileSync(join(__dirname, "../../src/Roles/ram.ts"), "utf8");

    it("clamps the threat ring to room bounds", function () {
        const start = src.indexOf("getActiveBodyparts(ATTACK) >= 24");
        const slice = src.slice(start, start + 900);
        expect(slice).to.include("Math.max(0, centerX - range)");
        expect(slice).to.include("Math.min(49, centerX + range)");
        expect(slice).to.not.match(/for \(let x = centerX - range/);
    });

    it("memoizes both matrix builders per room per tick", function () {
        expect(src).to.include('memoRamMatrix("ram", buildRoomCallbackRam)');
        expect(src).to.include('memoRamMatrix("psat", buildPathAroundStructuresAndTerrain)');
        const memo = src.slice(src.indexOf("const memoRamMatrix"), src.indexOf("const memoRamMatrix") + 600);
        expect(memo).to.include("hit.tick === Game.time");
    });

    it("search call sites keep using the memoized names", function () {
        expect(src).to.include("roomCallback: (roomName) => roomCallbackRam(roomName)");
        expect(src).to.include("roomCallback: (roomName) => pathAroundStructuresAndTerrain(roomName)");
    });
});
