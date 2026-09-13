import { assert } from "chai";
import fs from "fs";

/**
 * Raw console.log on a live shard serialises every call — a per-tick log in a
 * hot loop is real CPU and buries real logs. The codebase's convention is
 * `if(Memory.verbose)` (SquadCreepA) or logVerbose; these were debug crumbs
 * left behind that bypassed the gate entirely:
 *
 *   - SneakyControllerUpgrader logged its room name every tick of its life.
 *   - ram logged its move target and path state every tick it was active, and
 *     drew a RoomVisual circle on every path tile — the same path-visual spam
 *     the moveTo wrapper deliberately strips.
 *   - mosquito_attack logged per-creep per-tick through a whole raid.
 *   - RunAllCreepsManager logged "Creeps Ran in" EVERY TICK — its own comment
 *     said it was verbose-gated. It was not.
 *   - CPUmanager's bucket line said "only when verbose" and was not.
 */
const strip = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SCU = strip(fs.readFileSync("src/Roles/SneakyControllerUpgrader.ts", "utf8"));
const RAM = strip(fs.readFileSync("src/Roles/ram.ts", "utf8"));
const MOSQ = strip(fs.readFileSync("src/Misc/mosquito_attack.ts", "utf8"));
const RAC = strip(fs.readFileSync("src/Managers/RunAllCreepsManager.ts", "utf8"));
const CPUM = strip(fs.readFileSync("src/Managers/CPUmanager.ts", "utf8"));
const PCP = strip(fs.readFileSync("src/Functions/powerCreepFunctions.ts", "utf8"));
const GOB = strip(fs.readFileSync("src/Roles/goblin.ts", "utf8"));

describe("no per-tick console.log bypasses the verbose gate", () => {
  it("SCU does not log its room name every tick", () => {
    assert.notMatch(SCU, /console\.log\(creep\.room\.name\)/);
  });

  it("ram does not log move state or draw path visuals per search", () => {
    assert.notMatch(RAM, /console\.log\(move_location\)/);
    assert.notMatch(RAM, /console\.log\(path\.incomplete\)/);
    assert.notMatch(RAM, /RoomVisual/);
  });

  it("mosquito raid logs sit behind Memory.verbose", () => {
    const logs = MOSQ.match(/console\.log/g) || [];
    const gated = MOSQ.match(/Memory\.verbose\) console\.log/g) || [];
    assert.equal(logs.length, gated.length, "every console.log in mosquito_attack must be verbose-gated");
    assert.isAbove(logs.length, 0, "sanity: the file should still have gated logs");
  });

  it("the empire creep-loop summary is not printed every tick", () => {
    assert.include(RAC, "if (Memory.verbose) console.log('Creeps Ran in'");
  });

  it("the CPUmanager bucket line honours its own comment", () => {
    assert.include(CPUM, "if(Memory.verbose && Game.time % 50 == 0)");
  });

  it("power creep fortify and goblin withdraw do not log per call", () => {
    assert.notMatch(PCP, /console\.log\(chosenRampart\)/);
    assert.notMatch(GOB, /Withdraw From Special Target/);
  });
});
