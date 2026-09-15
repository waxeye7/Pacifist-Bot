import { expect } from "chai";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = readFileSync(resolve(__dirname, "../../src/Roles/Squad/SquadCreepA.ts"), "utf8");

// The quad's main travel search runs maxRooms: 5 — a path that spans rooms
// puts its head step in the NEXT room, and getDirectionTo ignores roomName,
// so it returns the exact opposite of the crossing move at every border.
// stepCachedPath, ram, the squad prep branch and the power creep movers all
// route through directionToStep for this; the quad's main direction was the
// one multi-room path head still on the raw call.
describe("SquadCreepA: quad travel step maps foreign path heads", () => {
  it("the maxRooms: 5 travel search steps via directionToStep", () => {
    // anchor past the prep branch (already fixed): the main search is the
    // one followed by the swampy-path split counter
    const anchor = SRC.indexOf("swampyPathCount = 0;");
    expect(anchor).to.be.greaterThan(-1);
    const window = SRC.slice(anchor, anchor + 400);
    expect(window).to.include("let pos = path.path[0];");
    expect(window).to.include("directionToStep(creep.pos, pos)");
    expect(window).to.not.include("creep.pos.getDirectionTo(pos)");
  });
});
