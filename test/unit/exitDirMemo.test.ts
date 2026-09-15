import { expect } from "chai";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = readFileSync(resolve(__dirname, "../../src/Functions/creepFunctions.ts"), "utf8");

// goTo() forces the avoidHostiles style on every creep in a room under
// attack (fleeing || room.memory.danger). For a cross-room destination the
// exit-direction lookup used to call Game.map.findRoute on every call —
// one findRoute per fleeing creep per tick for the same ordered room-pair.
describe("goTo: cross-room exit direction memoised per tick", () => {
  it("caches findRoute results per ordered room-pair per tick", () => {
    expect(SRC).to.include("let _exitDirTick = -1;");
    expect(SRC).to.include("_exitDirTick !== Game.time");
    const fn = SRC.indexOf("function exitDirToward");
    expect(fn).to.be.greaterThan(-1);
    const body = SRC.slice(fn, fn + 900);
    expect(body).to.include("Game.map.findRoute");
    expect(body).to.include("route !== -2");
  });

  it("the avoidHostiles cross-room branch uses the memo, not a raw findRoute", () => {
    const marker = SRC.indexOf('style === "avoidHostiles"');
    expect(marker).to.be.greaterThan(-1);
    const window = SRC.slice(marker, marker + 1200);
    expect(window).to.include("exitDirToward(this.pos.roomName, dest.roomName)");
    expect(window).to.not.include("Game.map.findRoute(this.pos.roomName");
  });
});
