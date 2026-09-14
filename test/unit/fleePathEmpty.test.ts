import { expect } from "chai";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = readFileSync(resolve(__dirname, "../../src/Roles/Squad/SquadCreepA.ts"), "utf8");

// The tower-flee search hands its last step to move_location. An
// empty/incomplete PathFinder result (squad cornered against a wall or an
// exit it cannot use) makes path[path.length - 1] === undefined, and the
// move_location.roomName read a few lines later throws — crashing the whole
// squad tick in the middle of a siege.
describe("SquadCreepA: empty flee path cannot produce an undefined move_location", () => {
  it("falls back to the creep position when the flee path is empty", () => {
    const flee = SRC.indexOf("fleeTowerPath");
    expect(flee).to.be.greaterThan(-1);
    const window = SRC.slice(flee, flee + 1200);
    expect(window).to.include("fleeTowerPath.path.length ? fleeTowerPath.path[fleeTowerPath.path.length - 1] : creep.pos");
  });
});
