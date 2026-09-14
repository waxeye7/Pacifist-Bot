import { expect } from "chai";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = readFileSync(resolve(__dirname, "../../src/Roles/Squad/SquadCreepA.ts"), "utf8");

// Every step of a squad travel path used to get a RoomVisual circle on every
// tick of every journey — ~1 serialised visual op per step per squad member
// per tick, on a 2-4 creep squad that paths every tick. Debug paint belongs
// behind Memory.verbose like the console.log next to it.
describe("SquadCreepA: path paint gated behind Memory.verbose", () => {
  it("only draws path circles inside the verbose gate", () => {
    const paint = SRC.indexOf("new RoomVisual(spot.roomName)");
    expect(paint).to.be.greaterThan(-1);
    // nearest preceding Memory.verbose must be closer than any other gate
    const before = SRC.slice(0, paint);
    const lastVerbose = before.lastIndexOf("if(Memory.verbose)");
    const lastSearch = before.lastIndexOf("PathFinder.search");
    expect(lastVerbose).to.be.greaterThan(-1);
    expect(lastVerbose).to.be.greaterThan(lastSearch);
  });
});
