/**
 * BILLTONG'S DEPOSIT FALLBACK PARSED ROOM NAMES BY CHARACTER POSITION.
 *
 * "E12N34"-shaped names only: a home room with a 3-digit coordinate
 * ("E127N58") sliced the axis letter off the wrong index, produced NaN
 * bounds, and the candidate list came out empty — the creep then parked at
 * home forever with nothing in the log. The fix routes through War/geo,
 * which parses every name shape.
 */
import { assert } from "chai";
import fs from "fs";
import { depositFallbackRooms } from "../../src/Roles/billtong";

const SRC = fs.readFileSync("src/Roles/billtong.ts", "utf8");

describe("billtong deposit fallback", () => {
  it("no longer slices the room name at fixed positions", () => {
    const body = SRC.slice(SRC.indexOf("let listOfPossibleRooms"));
    assert.notMatch(body, /homeRoom\[\d\]/);
    assert.notMatch(body, /parseInt\(creep\.memory\.homeRoom/);
  });

  it("returns highway rooms for a 6-char home", () => {
    const rooms = depositFallbackRooms("E37N59");
    assert.include(rooms, "E40N59");   // x=40 is a highway column
    assert.include(rooms, "E37N60");   // y=60 is a highway row
    assert.notInclude(rooms, "E37N59");
    for (const r of rooms) {
      // every result is a highway room: either written digit is a multiple of 10
      const m = /^[WE](\d+)[NS](\d+)$/.exec(r) as RegExpExecArray;
      assert.isTrue(parseInt(m[1], 10) % 10 === 0 || parseInt(m[2], 10) % 10 === 0, r);
    }
  });

  it("returns highway rooms for a 3-digit-coordinate home", () => {
    const rooms = depositFallbackRooms("E127N58");
    assert.isNotEmpty(rooms); // was [] before: NaN bounds
    assert.include(rooms, "E130N58");
  });

  it("crosses the W/E meridian for a low-coordinate home", () => {
    const rooms = depositFallbackRooms("E2N8");
    assert.include(rooms, "W0N8"); // x=-1 world -> W0
    assert.include(rooms, "E0N8");
  });
});
