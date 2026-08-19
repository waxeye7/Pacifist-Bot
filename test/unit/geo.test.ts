/**
 * War/geo is the room-name arithmetic every targeting decision is built on:
 * the 5-room engagement radius, the 10-room nuke radius, "closest first", and
 * the SK/highway classification that keeps creeps out of rooms that would kill
 * them. It is pure and imports nothing, so it is testable exactly as written.
 *
 * These cases exist because a wrong answer here is silent — a bad distance
 * does not throw, it just sends a wave to the wrong room.
 */
import { assert } from "chai";
import {
  roomNameToCoord,
  coordToRoomName,
  roomDistance,
  roomKind,
  isHighway,
  isKeeperRoom,
  isClaimable,
  roomsInRange,
  reachMap,
  ROOM_NORMAL,
  ROOM_HIGHWAY,
  ROOM_KEEPER,
  ROOM_CENTER,
} from "../../src/War/geo";

describe("War/geo", () => {
  describe("roomNameToCoord / coordToRoomName", () => {
    it("round-trips every quadrant", () => {
      for (const name of ["E0S0", "W0N0", "E12S3", "W5N7", "E37N59", "W10N0", "E0N0", "W0S0"]) {
        const c = roomNameToCoord(name);
        assert.isNotNull(c, `failed to parse ${name}`);
        assert.strictEqual(coordToRoomName(c!.wx, c!.wy), name, `round-trip failed for ${name}`);
      }
    });

    it("returns null for things that are not room names", () => {
      // These are not hypothetical: Memory accumulates junk keys, and 'sim'
      // is a real room on the official server.
      for (const junk of ["sim", "", "E12", "N12E3", "toString", "constructor", "__proto__", "E1S", "12S3"]) {
        assert.isNull(roomNameToCoord(junk), `${junk} should not parse`);
      }
    });

    it("does not confuse W0/E0 or N0/S0, which are adjacent, not equal", () => {
      // The W0-E0 boundary is the classic off-by-one in room-name maths:
      // W0N0 and E0N0 are DIFFERENT rooms that share an edge.
      assert.notStrictEqual(
        JSON.stringify(roomNameToCoord("W0N0")),
        JSON.stringify(roomNameToCoord("E0N0")),
      );
      assert.strictEqual(roomDistance("W0N0", "E0N0"), 1);
      assert.strictEqual(roomDistance("E0N0", "E0S0"), 1);
    });
  });

  describe("roomDistance", () => {
    it("is 0 for a room against itself", () => {
      assert.strictEqual(roomDistance("E37N59", "E37N59"), 0);
    });

    it("is Chebyshev distance, so diagonals cost 1", () => {
      assert.strictEqual(roomDistance("E10S10", "E11S11"), 1);
      assert.strictEqual(roomDistance("E10S10", "E12S10"), 2);
      assert.strictEqual(roomDistance("E10S10", "E12S14"), 4);
    });

    it("is symmetric", () => {
      assert.strictEqual(roomDistance("E37N59", "E35N57"), roomDistance("E35N57", "E37N59"));
    });

    it("returns Infinity — never NaN — for unparseable names", () => {
      // A NaN here makes Array.sort produce an arbitrary permutation, which
      // would silently scramble the whole target list rather than fail.
      for (const junk of ["toString", "sim", "nonsense"]) {
        const d = roomDistance("E37N59", junk);
        assert.isFalse(Number.isNaN(d), `${junk} produced NaN`);
        assert.strictEqual(d, Infinity);
      }
    });
  });

  describe("roomKind", () => {
    it("classifies highways (either coordinate ending in 0)", () => {
      assert.strictEqual(roomKind("E10S5"), ROOM_HIGHWAY);
      assert.strictEqual(roomKind("E5S10"), ROOM_HIGHWAY);
      assert.isTrue(isHighway("E20S30"));
      assert.isFalse(isHighway("E12S3"));
    });

    it("classifies the 3x3 keeper block around a centre room", () => {
      // Coordinates 4..6 mod 10 are the keeper ring; 5,5 is the centre.
      assert.strictEqual(roomKind("E5S5"), ROOM_CENTER);
      for (const n of ["E4S4", "E4S5", "E4S6", "E5S4", "E5S6", "E6S4", "E6S5", "E6S6"]) {
        assert.strictEqual(roomKind(n), ROOM_KEEPER, `${n} should be a keeper room`);
      }
    });

    it("classifies ordinary rooms as normal", () => {
      for (const n of ["E12S3", "E37N59", "E1S1", "E13S7"]) {
        assert.strictEqual(roomKind(n), ROOM_NORMAL, `${n} should be normal`);
      }
      assert.isFalse(isKeeperRoom("E12S3"));
      assert.isTrue(isClaimable("E12S3"));
    });

    it("refuses to call a highway or keeper room claimable", () => {
      assert.isFalse(isClaimable("E10S5"));
      assert.isFalse(isClaimable("E4S4"));
      assert.isFalse(isClaimable("E5S5"));
    });
  });

  describe("roomsInRange", () => {
    it("returns the full square INCLUDING the centre, per its contract", () => {
      assert.strictEqual(roomsInRange("E12S3", 1).length, 3 * 3);
      // range 5 is the doctrine's engagement radius
      assert.strictEqual(roomsInRange("E12S3", 5).length, 11 * 11);
      assert.include(roomsInRange("E12S3", 3), "E12S3");
    });

    it("returns an empty list — not a throw — for an unparseable centre", () => {
      assert.deepStrictEqual(roomsInRange("toString", 3), []);
    });

    it("every member is actually within range", () => {
      for (const n of roomsInRange("E12S3", 3)) {
        assert.isAtMost(roomDistance("E12S3", n), 3, `${n} is out of range`);
      }
    });

    it("has no duplicates", () => {
      const list = roomsInRange("E12S3", 4);
      assert.strictEqual(new Set(list).size, list.length);
    });
  });

  describe("reachMap", () => {
    it("keeps the SHORTEST distance when two origins both reach a room", () => {
      // This is what makes "closest first" mean anything with several homes.
      const map = reachMap(["E10S10", "E14S10"], 5);
      assert.strictEqual(map["E12S10"], 2, "E12S10 is 2 from both");
      assert.strictEqual(map["E11S10"], 1, "E11S10 is 1 from E10S10, 3 from E14S10");
      assert.strictEqual(map["E13S10"], 1, "E13S10 is 1 from E14S10, 3 from E10S10");
    });

    it("marks the origins themselves at distance 0", () => {
      const map = reachMap(["E10S10"], 2);
      assert.strictEqual(map["E10S10"], 0);
    });

    it("ignores unparseable origins rather than poisoning the map", () => {
      const map = reachMap(["E10S10", "toString"], 1);
      for (const k in map) {
        assert.isFalse(Number.isNaN(map[k]), `${k} has a NaN distance`);
      }
    });
  });
});
