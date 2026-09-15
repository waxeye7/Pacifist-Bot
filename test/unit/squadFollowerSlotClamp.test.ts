import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

// The follower built its formation slot as
// new RoomPosition(a.pos.x + dx, a.pos.y + dy) — a leader standing on the
// right or bottom border put the slot at coordinate 50, and the RoomPosition
// constructor throws, crashing the follower every tick the leader idled on
// an exit row (gather phase) or called a join on the border.
describe("squad follower slot clamp", function () {
    const src = readFileSync(join(__dirname, "../../src/Roles/Squad/SquadFollower.ts"), "utf8");

    it("routes both slot targets through a clamped helper", function () {
        expect(src).to.include("const slotPos = function");
        expect(src).to.include("creep.moveTo(slotPos(gatherA, dx, dy))");
        expect(src).to.include("creep.moveTo(slotPos(a, dx, dy))");
        expect(src).to.not.match(/new RoomPosition\(a\.pos\.x \+ dx/);
        expect(src).to.not.match(/new RoomPosition\(gatherA\.pos\.x \+ dx/);
    });

    it("clamps both axes to 0..49", function () {
        const start = src.indexOf("const slotPos");
        const slice = src.slice(start, start + 400);
        expect(slice).to.include("Math.min(49, a.pos.x + dx)");
        expect(slice).to.include("Math.min(49, a.pos.y + dy)");
        expect(slice).to.include("Math.max(0,");
    });
});
