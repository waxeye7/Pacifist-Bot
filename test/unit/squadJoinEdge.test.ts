/**
 * SQUAD JOIN PROBED a.pos + 1 WITH THE LEADER ON TILE 49.
 *
 * The 2x2 join check cancels on the border only for two states: leader one
 * tile in (48) while the partner member shares its room, or leader on the
 * edge (49) after the partner already crossed. The third state — leader on
 * 49 while the partner is still in the same room — fell through to the else,
 * where every join branch builds `new RoomPosition(a.pos + 1, ...)`. Tile 50
 * does not exist, so a squad filing south or east across a room edge threw a
 * RangeError every tick until the formation resolved.
 *
 * A join can never complete while the leader sits on 49 — the target tile is
 * in the next room — so holding position is the only safe outcome, matching
 * the other border cancels.
 */
import { assert } from "chai";
import fs from "fs";

const SRC = fs.readFileSync("src/Roles/Squad/SquadCreepA.ts", "utf8");

describe("squad join probes stay in bounds", () => {
  it("cancels the join whenever the leader sits on tile 49", () => {
    const guard = /else if\(a\.pos\.x == 49 \|\| a\.pos\.y == 49\) \{\s*\n\s*creep\.memory\.direction = false;/;
    assert.match(SRC, guard);
  });

  it("places the cancel before every a.pos + 1 probe", () => {
    const guardAt = SRC.indexOf("else if(a.pos.x == 49 || a.pos.y == 49)");
    assert.isAbove(guardAt, -1);
    for (const probe of [
      "new RoomPosition(a.pos.x, a.pos.y + 1",
      "new RoomPosition(a.pos.x + 1, a.pos.y,",
      "new RoomPosition(a.pos.x + 1, a.pos.y + 1",
    ]) {
      const probeAt = SRC.indexOf(probe, guardAt);
      assert.isAbove(probeAt, guardAt, probe + " must sit inside the guarded else block");
    }
  });
});
