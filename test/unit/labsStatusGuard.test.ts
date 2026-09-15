import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

const code = readFileSync(
    join(__dirname, "..", "..", "src", "Roles", "energyManager.ts"), "utf8");

// rooms.labs.ts creates memory.labs = {} at the top of its pass and seeds
// labs.status much later — an aborted pass leaves labs present with no
// status, and the bare .status.currentOutput read threw every tick after.
describe("energyManager labs.status guard", function () {
    it("does not deref status unguarded", function () {
        const idx = code.indexOf("currentOutput");
        const window = code.slice(idx, idx + 500);
        expect(window).to.include("labs.status || {}");
    });
});
