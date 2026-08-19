/**
 * The bucket floor is a safety net, and the dangerous way to get it wrong is
 * not "shed too little" — it is to shed something the empire cannot survive
 * without. A CPU crisis must never become a defence outage.
 *
 * These assertions are deliberately made against the SOURCE of main.ts rather
 * than by running the loop: the loop cannot run outside the game VM (it needs
 * engine constants at module load), and what actually matters here is a
 * structural property of the code — which phase names sit inside the
 * `if (!starved)` blocks — not a runtime value. A grep-shaped test is the
 * honest tool for a grep-shaped invariant.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const MAIN = fs.readFileSync(path.join(__dirname, "../../src/main.ts"), "utf8");

/** The phase() calls that appear inside an `if (!starved) { ... }` block. */
function shedPhases(src: string): string[] {
  const out: string[] = [];
  const re = /if\s*\(!starved\)\s*\{([\s\S]*?)\n\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const inner = m[1];
    const pre = /phase\("([^"]+)"/g;
    let p: RegExpExecArray | null;
    while ((p = pre.exec(inner))) out.push(p[1]);
  }
  return out;
}

const SHED = shedPhases(MAIN);

describe("main: economyOnly load shedding", () => {
  it("actually reads policy.economyOnly — it was dead code for a long time", () => {
    // docs/AGGRESSION-HANDOFF.md listed economyOnly as computed-and-never-read,
    // which meant the bot had no brake at all between the remote gate (5000)
    // and an empty bucket.
    assert.include(MAIN, "policy.economyOnly", "main.ts must consume policy.economyOnly");
    assert.isAbove(SHED.length, 0, "no phases are gated on the bucket floor");
  });

  it("sheds the subsystems the empire can be blind to", () => {
    for (const p of ["war", "autoExpand", "mapViz", "remoteStats", "planAnimator", "planV2Adoption"]) {
      assert.include(SHED, p, `${p} should be shed when the bucket is critical`);
    }
  });

  it("NEVER sheds defence, the room loop, the creep loop or spawn commands", () => {
    // reinforce is how a room under attack gets help; rooms/creeps/commands are
    // the empire running at all. Shedding any of these turns a CPU dip into a
    // lost room.
    for (const p of ["reinforce", "rooms", "creeps", "commands", "CPUmanager", "tempBadRooms"]) {
      assert.notInclude(SHED, p, `${p} must keep running at any bucket level`);
    }
  });

  it("remote panic valve follows allowRemotes, not a second avg cliff", () => {
    const ROOMS = fs.readFileSync(path.join(__dirname, "../../src/Rooms/rooms.ts"), "utf8");
    assert.include(ROOMS, "if (!policy.allowRemotes)");
    assert.notInclude(
      ROOMS,
      "avg > Game.cpu.limit - (policy.limit <= 30 ? 2 : 3)",
      "the fiveHundredTickAvg cliff re-opened the starvation latch",
    );
  });

  it("keeps the creep loop outside every conditional gate", () => {
    // Stronger than the list above: assert the creeps phase is at top level of
    // the loop body, so a future edit cannot quietly wrap it in a new gate.
    const creepPhase = MAIN.indexOf('phase("creeps"');
    assert.isAbove(creepPhase, -1, "creeps phase not found");
    const line = MAIN.slice(MAIN.lastIndexOf("\n", creepPhase) + 1, creepPhase);
    assert.strictEqual(line.trim(), "", "phase(\"creeps\") should sit at the start of its line, ungated");
  });
});
