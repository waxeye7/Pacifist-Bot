import { assert } from "chai";
import fs from "fs";

/**
 * Global Memory lists seeded per owned room (billtong_rooms) or in the
 * commands phase (commandsToExecute) can still be undefined when a creep
 * touches them: creeps run before the commands phase every tick, and a
 * role that outlives every owned room never gets the per-room seed. Every
 * push/read site must seed or guard first.
 */
const strip = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const BILL = strip(fs.readFileSync("src/Roles/billtong.ts", "utf8"));
const CCK = strip(fs.readFileSync("src/Roles/ContinuousControllerKiller.ts", "utf8"));
const FF = strip(fs.readFileSync("src/Roles/Party/FreedomFighter.ts", "utf8"));

describe("Memory list writes are preceded by a seed", () => {
  it("billtong seeds billtong_rooms before includes/push", () => {
    assert.match(BILL, /!Memory\.billtong_rooms\) Memory\.billtong_rooms = \[\]/);
    assert.match(BILL, /Memory\.billtong_rooms && Memory\.billtong_rooms\.includes/);
  });
  it("CCK seeds commandsToExecute before pushing its replacement", () => {
    assert.match(CCK, /!Memory\.commandsToExecute\) Memory\.commandsToExecute = \[\]/);
  });
  it("FreedomFighter seeds commandsToExecute before pushing CCKparty", () => {
    assert.match(FF, /!Memory\.commandsToExecute\) Memory\.commandsToExecute = \[\]/);
  });
});
