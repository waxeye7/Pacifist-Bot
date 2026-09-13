import { assert } from "chai";
import fs from "fs";

/**
 * Memory.AvoidRooms is seeded per owned room inside eachVisibleRoom. A war
 * creep that outlives every owned room — or runs before the rooms pass has
 * ever produced one — reaches `Memory.AvoidRooms.push` with the array still
 * undefined and throws. Every push site must seed first.
 */
const strip = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SQUAD = strip(fs.readFileSync("src/Roles/Squad/SquadCreepA.ts", "utf8"));
const CF = strip(fs.readFileSync("src/Functions/creepFunctions.ts", "utf8"));

function pushesSeeded(src: string, label: string) {
  const pushIdx = src.indexOf("Memory.AvoidRooms.push");
  assert.isAbove(pushIdx, -1, `${label}: push site exists`);
  const seedIdx = src.lastIndexOf("Memory.AvoidRooms = []", pushIdx);
  assert.isAbove(seedIdx, -1, `${label}: a seed precedes the push`);
  // The seed must be inside the same guarded block — within a few lines.
  assert.isBelow(pushIdx - seedIdx, 400, `${label}: seed is near the push`);
}

describe("Memory.AvoidRooms push sites seed first", () => {
  it("SquadCreepA seeds before pushing", () => {
    pushesSeeded(SQUAD, "SquadCreepA");
  });
  it("creepFunctions seeds before pushing", () => {
    pushesSeeded(CF, "creepFunctions");
  });
});
