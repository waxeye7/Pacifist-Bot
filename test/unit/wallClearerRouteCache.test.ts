import { expect } from "chai";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = readFileSync(resolve(__dirname, "../../src/Roles/WallClearer.ts"), "utf8");

// WallClearer re-ran Game.map.findRoute every tick of its journey — one
// findRoute per travelling clearer per tick, the same spam class
// route-fail-backoff and the squad/dudu movers got cached routes for.
// The route now lives in creep.memory.route, consumed hop-by-hop and only
// recomputed when missing, dead, empty, or aimed at the wrong room.
describe("WallClearer: cross-room route is cached", () => {
  it("shifts the consumed hop and gates findRoute on staleness", () => {
    expect(SRC).to.include("creep.memory.route.shift()");
    const call = SRC.indexOf("Game.map.findRoute");
    expect(call).to.be.greaterThan(-1);
    const before = SRC.slice(Math.max(0, call - 900), call);
    expect(before).to.include("!creep.memory.route || creep.memory.route === ERR_NO_PATH");
    expect(before).to.include("!== creep.memory.targetRoom");
  });

  it("keeps the same move and suicide semantics", () => {
    expect(SRC).to.include("route[0].exit");
    const np = SRC.indexOf("route == ERR_NO_PATH");
    expect(np).to.be.greaterThan(-1);
    expect(SRC.slice(np, np + 120)).to.include("creep.suicide()");
  });
});
