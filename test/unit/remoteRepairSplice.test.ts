/**
 * REMOTE REPAIR USED splice(indexOf(...)) WITHOUT CHECKING FOR -1.
 *
 * `allowed_repairs.indexOf(target.id)` returns -1 whenever the locked
 * repair target is not on this room's list — the lock can predate the
 * per-room rebuild, or the dead-object prune in findLockedRepair already
 * removed it. splice(-1, 1) removes the LAST element instead, so a healthy
 * still-broken structure silently left the repair list and the creep's
 * "room serviced" latch could fire with work outstanding.
 */
import { assert } from "chai";
import fs from "fs";

const SRC = fs.readFileSync("src/Roles/remoteRepair.ts", "utf8");
const CODE = SRC.replace(/[/][*][^]*?[*][/]/g, "").replace(/[/][/].*/g, "");

describe("remoteRepair prune-by-id", () => {
  it("never splices on an unchecked indexOf", () => {
    assert.notMatch(CODE, /\n[ \t]*creep\.memory\.allowed_repairs\.splice\(index/);
  });

  it("guards both splice sites with index >= 0", () => {
    const hits = CODE.match(/index >= 0\) creep\.memory\.allowed_repairs\.splice\(index,\s*1\)/g);
    assert.isNotNull(hits);
    assert.strictEqual((hits as RegExpMatchArray).length, 2);
  });
});
