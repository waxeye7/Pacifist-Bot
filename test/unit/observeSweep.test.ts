/**
 * THE OBSERVER SWEEP LISTS WERE BUILT BY PARSING ROOM NAMES BY CHARACTER
 * POSITION — and any coordinate wider than two digits broke the parse.
 *
 * rooms.observe kept two copies of the same hand-rolled generator, one per
 * sweep (intel and power). Each read `room.name[1] + room.name[2]` as the X
 * coordinate. For a name like "E127N58" — a real room near the map's edge —
 * that reads "12", leaves "7" to stand in for the N/S character, and ends
 * with homeRoomNameY = parseInt("N") = NaN. `NaN - 4 <= NaN + 4` is false,
 * so the inner loop never ran and the sweep list came out EMPTY: that room's
 * observer then did nothing every cycle, forever, with no error and no log.
 *
 * The generators now go through War/geo's regex parser, which handles any
 * coordinate size, and its W-side -1 offset — the meridian wraparound the
 * second loop used to do by hand is just arithmetic on world coords.
 */
import { assert } from "chai";
import { intelSweepRooms, powerSweepRooms } from "../../src/Rooms/rooms.observe";
import { roomNameToCoord, roomKind, ROOM_HIGHWAY, ROOM_NORMAL } from "../../src/War/geo";

const VALID = /^[WE]\d+[NS]\d+$/;

const g: any = global as any;

// powerSweepRooms consults geo.isEnterable -> Game.map.getRoomStatus. Other
// test files replace global.Game outright, so pin the one method we need
// rather than rely on whatever the previous file left behind.
describe("rooms.observe sweep generation", () => {
  let prevMap: any;
  before(() => {
    prevMap = g.Game && g.Game.map;
    g.Game = g.Game || {};
    g.Game.map = Object.assign({}, prevMap, {
      getRoomStatus: () => ({ status: "normal" }),
    });
  });
  after(() => {
    if (g.Game) g.Game.map = prevMap;
  });

  describe("intelSweepRooms", () => {
    it("produces only valid, normal, non-self room names", () => {
      const list = intelSweepRooms("E37N58");
      assert.isAbove(list.length, 0);
      for (const n of list) {
        assert.match(n, VALID, `${n} is not a room name`);
        assert.notStrictEqual(n, "E37N58");
        assert.strictEqual(roomKind(n), ROOM_NORMAL, `${n} is not a normal room`);
      }
    });

    it("sweeps ±5 for a two-digit interior room, skipping highways and keepers", () => {
      const list = intelSweepRooms("E37N58");
      // 11x11 box = 121 cells; minus self, minus the E40 column and N60 row
      // highways (21 cells), minus the 3x3 keeper block at 34-36/54-56 (9).
      assert.strictEqual(list.length, 90);
      assert.include(list, "E36N57");
      assert.notInclude(list, "E40N58"); // highway column
      assert.notInclude(list, "E37N60"); // highway row
      assert.notInclude(list, "E35N55"); // sector centre
      assert.notInclude(list, "E34N54"); // keeper room
    });

    it("handles a 3-digit coordinate — the old parser returned []", () => {
      const list = intelSweepRooms("E127N58");
      assert.isAbove(list.length, 0, "3-digit room must not produce an empty sweep");
      for (const n of list) assert.match(n, VALID, `${n} is not a room name`);
      assert.include(list, "E126N57");
    });

    it("crosses the E/W meridian without emitting garbage names", () => {
      const list = intelSweepRooms("E2N8");
      assert.isAbove(list.length, 0);
      for (const n of list) assert.match(n, VALID, `${n} is not a room name`);
      // W0/E0 are highways and drop out; W1 is inside the ±4 box.
      assert.include(list, "W1N8");
      assert.include(list, "E6N8");
      assert.notInclude(list, "W0N8");
      assert.notInclude(list, "E0N8");
    });

    it("returns [] — not a throw — for an unparseable name", () => {
      assert.deepStrictEqual(intelSweepRooms("sim"), []);
      assert.deepStrictEqual(intelSweepRooms(""), []);
    });
  });

  describe("powerSweepRooms", () => {
    it("produces only valid highway rooms within 4", () => {
      const list = powerSweepRooms("E37N58");
      assert.isAbove(list.length, 0);
      for (const n of list) {
        assert.match(n, VALID, `${n} is not a room name`);
        assert.strictEqual(roomKind(n), ROOM_HIGHWAY, `${n} is not a highway`);
        const c = roomNameToCoord(n)!;
        const h = roomNameToCoord("E37N58")!;
        assert.isAtMost(Math.max(Math.abs(c.wx - h.wx), Math.abs(c.wy - h.wy)), 4);
      }
      assert.include(list, "E40N58");
      assert.include(list, "E37N60");
    });

    it("handles a 3-digit coordinate — the old parser returned []", () => {
      const list = powerSweepRooms("E127N58");
      assert.isAbove(list.length, 0);
      assert.include(list, "E130N58");
      assert.include(list, "E127N60");
    });
  });
});
