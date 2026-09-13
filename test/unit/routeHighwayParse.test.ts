/**
 * ROUTE CALLBACKS PRICED HIGHWAYS BY SLICING THE NAME AT FIXED POSITIONS.
 *
 * `roomName[1] + roomName[2]` is only the x-coordinate for names with 1-2
 * digit axes. For "E120N5" the slice reads "12" (12 % 10 != 0), so a real
 * highway room was priced as an ordinary room and findRoute steered squads
 * and wall-clearers off the free lane. `isHighway` from War/geo parses any
 * coordinate width.
 */
import { assert } from "chai";
import fs from "fs";
import { isHighway } from "../../src/War/geo";

const FILES = ["src/Roles/Squad/SquadCreepA.ts", "src/Roles/WallClearer.ts"];

describe("route callbacks detect highways by parsing, not slicing", () => {
  for (const f of FILES) {
    it(f + " uses isHighway, not position slices", () => {
      const src = fs.readFileSync(f, "utf8");
      assert.include(src, 'from "War/geo"');
      assert.include(src, "isHighway(roomName)");
      assert.notMatch(src, /roomName\[\d\] \+ roomName\[\d\]/);
    });
  }

  it("isHighway flags a highway room with a 3-digit coordinate", () => {
    // E120N5: x=120 -> 120%10==0. The old slice read "12" and missed it.
    assert.isTrue(isHighway("E120N5"));
    assert.isTrue(isHighway("E5N120"));
    assert.isFalse(isHighway("E121N5"));
    assert.isFalse(isHighway("E5N121"));
  });
});
