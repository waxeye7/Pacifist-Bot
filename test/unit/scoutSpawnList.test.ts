import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

const code = readFileSync(
    join(__dirname, "..", "..", "src", "Roles", "scout.ts"), "utf8");

// The Annoyer spawn push uses homeMem (Memory.rooms[homeRoom]) which is
// guaranteed non-null by the early return — but spawn_list itself seeds in
// the home room's own spawn pass. claimer.ts documented the same crash live.
describe("scout Annoyer push seeds spawn_list", function () {
    it("seeds before pushing", function () {
        const idx = code.indexOf("Annoyer-");
        const window = code.slice(idx, idx + 700);
        expect(window).to.include("if(!homeMem.spawn_list) homeMem.spawn_list = [];");
        expect(window.indexOf("homeMem.spawn_list = []"))
            .to.be.below(window.indexOf("homeMem.spawn_list.push"));
    });
});
