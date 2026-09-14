import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

const src = (f: string) =>
    readFileSync(join(__dirname, "..", "..", "src", f), "utf8");

// Game.map.describeExits returns undefined for a room with no exits.
// Object.values(undefined) throws, so every direct call on a room a creep
// can stand inside must guard before Object.values.
describe("describeExits guards", function () {
    it("evacuate guards before Object.values", function () {
        const code = src("Functions/creepFunctions.ts");
        const idx = code.indexOf("noHomeNukes");
        const window = code.slice(idx, idx + 1400);
        expect(window).to.include("describeExits(this.room.name) || {}");
    });
    it("powerCreep evacuate guards before Object.values", function () {
        const code = src("Functions/powerCreepFunctions.ts");
        const idx = code.indexOf("noHomeNukes");
        const window = code.slice(idx, idx + 1400);
        expect(window).to.include("describeExits(this.room.name) || {}");
    });
    it("Priest guards before Object.values", function () {
        const code = src("Roles/Priest.ts");
        expect(code).to.include("describeExits(creep.room.name) || {}");
    });
});
