/**
 * labs.paused timers only ever decremented inside the per-output-lab loop,
 * behind the reactable checks — a paused INPUT lab's timer never moved, a
 * paused output lab on cooldown stretched its pause, and rows that hit
 * timer <= 0 sat in memory forever.
 *
 * The fix ticks every paused entry once per pass, before the loop, and
 * prunes the dead rows. The in-loop check then only asks "is this output
 * lab still paused" — decrement must NOT live there any more or entries
 * would tick twice for output labs and never for inputs.
 */
import { assert } from "chai";
import fs from "fs";

const SRC = fs.readFileSync("src/Rooms/rooms.labs.ts", "utf8");
const CODE = SRC.replace(/[/][*][^]*?[*][/]/g, "").replace(/[/][/].*/g, "");

const BLOCK = CODE.slice(CODE.indexOf("Game.cpu.bucket > 4500"), CODE.indexOf("export default labs"));

describe("labs.paused lifecycle", () => {
  it("ticks and prunes every entry once per pass, before the lab loop", () => {
    const loopIdx = BLOCK.indexOf("for(let i = 1; i <= 8; i++)");
    const tickIdx = BLOCK.indexOf("p.timer--");
    const pruneIdx = BLOCK.indexOf("p && p.timer > 0");
    assert.isAbove(tickIdx, -1, "per-pass decrement missing");
    assert.isAbove(pruneIdx, -1, "dead-row prune missing");
    assert.isBelow(tickIdx, loopIdx, "decrement must run before the per-lab loop");
    assert.isBelow(pruneIdx, loopIdx, "prune must run before the per-lab loop");
  });

  it("the in-loop check no longer decrements", () => {
    const loop = BLOCK.slice(BLOCK.indexOf("for(let i = 1; i <= 8; i++)"));
    assert.notMatch(loop, /\.timer--/, "per-lab decrement would double-tick output labs");
    assert.include(loop, ".some((lab) => lab.id === outputLab.id)");
  });
});
