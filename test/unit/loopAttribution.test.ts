import { assert } from "chai";
import fs from "fs";

/**
 * NOTHING IN THE LOOP BILLS WITHOUT A NAME.
 *
 * The phase table summed to 16.74 on a tick whose end-of-loop getUsed() read
 * 18.85. That is 2.11 CPU — more than the whole rooms phase — attributed to
 * nothing at all, on a bot the bucket says is billed 19.4 against a 20 limit.
 *
 * Two pieces of it were structural rather than mysterious. The four install
 * calls ran BEFORE startTotal was sampled, so they sat outside every number
 * the bot reported while still being billed; three return immediately on a
 * re-entry guard but installRemoteStatsCommand has none and rebuilds its
 * closure every tick. And PowerCreepManager was the one manager in the loop
 * that never had a phase of its own.
 *
 * Cheap or not, unmeasured work is how a bot ends up believing it has 1.8 CPU
 * of headroom when it has 0.4.
 */
const MAIN = fs.readFileSync("src/main.ts", "utf8");
const CODE = MAIN.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("every part of the loop is attributed", () => {
  it("measures the four install calls as one boot phase", () => {
    assert.include(MAIN, 'mark("boot.installs", () => {');
    for (const fn of [
      "installLogger();",
      "installRemoteStatsCommand();",
      "installWarCommands();",
      "installSegmentCommands();",
    ]) {
      assert.include(MAIN, fn);
    }
  });

  it("takes startTotal after the installs, not before them", () => {
    // This is the whole point: startTotal used to sit below these four, which
    // put them outside the measured window while the server still charged for
    // them.
    assert.isAbove(
      MAIN.indexOf("const startTotal = Game.cpu.getUsed();"),
      MAIN.indexOf('mark("boot.installs"')
    );
  });

  it("gives the power creep manager its own phase", () => {
    assert.include(MAIN, 'phase("powerCreeps", () => PowerCreepManager());');
    assert.notMatch(CODE, /\n\s*PowerCreepManager\(\);/);
  });

  it("measures the heartbeat, which walks every owned room when it fires", () => {
    assert.include(MAIN, 'mark("heartbeat", () => heartbeat(billed));');
  });

  it("leaves no bare install call outside the boot phase", () => {
    for (const fn of ["installLogger", "installWarCommands", "installSegmentCommands"]) {
      assert.strictEqual(
        (CODE.match(new RegExp(`${fn}\\(\\)`, "g")) || []).length,
        1,
        `${fn} should be called exactly once`
      );
    }
  });
});
