import { assert } from "chai";
import fs from "fs";

/**
 * A PER-ROOM OVERRIDE WITH NO EMPIRE-WIDE BUDGET FIRES IN EVERY ROOM AT ONCE.
 *
 * The container rung lifts a maintainer over optionalRosterOpen(). It is a
 * per-room decision, so when every room's containers are worn at the same
 * time, every room buys at the same time. Same defect as the per-room cadences
 * that all fired on one tick — except the spike is creeps, and creeps do not
 * go away at the end of the tick.
 *
 * Live shard3 2026-09-11. Worst container per room as a fraction of 250,000:
 * E37N59 14%, E37N58 30%, E35N59 56%, E35N58 10%, E36N57 12%, E38N56 58%,
 * E39N58 14%. Five rooms held a maintainer and four held a repairer at the
 * same moment, billed CPU read 20.64 against a 20 limit, and the bucket was
 * draining through 2,711.
 *
 * That closes a loop: the override costs CPU, the CPU drains the bucket, the
 * drained bucket keeps optionalRosterOpen() shut, and a shut roster is why the
 * containers wore down in the first place.
 */
const SP = fs.readFileSync("src/Rooms/rooms.spawning.ts", "utf8");
const MAINT = fs.readFileSync("src/Roles/maintainer.ts", "utf8");
const CODE = SP.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("the container maintainer override is capped empire-wide", () => {
  it("caps how many rooms may start one", () => {
    assert.include(CODE, "const MAINTAINER_OVERRIDE_MAX = 2;");
    assert.match(CODE, /return n < MAINTAINER_OVERRIDE_MAX;/);
  });

  it("counts rooms once per tick and shares the answer", () => {
    // Seven rooms each walking Game.creeps to answer the same question is the
    // kind of thing this whole exercise exists to stop.
    assert.include(CODE, "if (_maintRoomsTick !== Game.time) {");
    assert.match(CODE, /_maintRooms\[m\.homeRoom\] = true;/);
  });

  it("never abandons a room that already has one", () => {
    // The cap limits how many rooms may START, not how many may finish, or a
    // creep gets stranded mid-repair and the body was bought for nothing.
    assert.match(CODE, /if \(running\[room\.name\]\) return true;/);
  });

  it("lets a genuinely dying container ignore the cap", () => {
    assert.include(CODE, "const CONTAINER_DYING = 0.06;");
    assert.match(CODE, /if \(worstFraction < CONTAINER_DYING\) return true;/);
  });

  it("keeps CONTAINER_DYING well below CONTAINER_CRITICAL", () => {
    // CRITICAL is the duty-cycle bar, DYING is the emergency bar. If they ever
    // crossed, every worn container would bypass the cap and the cap would do
    // nothing at all.
    const crit = Number((CODE.match(/const CONTAINER_CRITICAL = ([\d.]+);/) || [])[1]);
    const dying = Number((CODE.match(/const CONTAINER_DYING = ([\d.]+);/) || [])[1]);
    assert.isNumber(crit);
    assert.isNumber(dying);
    assert.isBelow(dying, crit);
  });

  it("routes the override through the cap rather than setting the flag directly", () => {
    // OR'd with the rampart demand set above — the cap may raise the flag,
    // never cancel a critical rampart's demand with a container answer.
    assert.match(CODE, /spawnMaintainer = spawnMaintainer \|\| containerOverrideAllowed\(room, worstFraction\);/);
    // The old unconditional assignment must be gone from the container rung.
    const rung = CODE.slice(CODE.indexOf("const worstBox ="), CODE.indexOf("const worstBox =") + 700);
    assert.notMatch(rung, /if\(worstBox\.length\) \{\s*spawnMaintainer = true;/);
    assert.notMatch(rung, /[^|]spawnMaintainer = containerOverrideAllowed/);
  });

  it("depends on the maintainer recycling when its work is done", () => {
    /*
     * A slot is held by a LIVE maintainer and a maintainer lives 1,500 ticks.
     * If one sat idle for its full life after finishing, two slots would serve
     * two rooms per 1,500 ticks, the other five would decay past
     * CONTAINER_DYING and bypass the cap, and the cap would do nothing but
     * delay the same simultaneous buy.
     *
     * Roles/maintainer sets suicide once there is nothing left inside the wall
     * to repair, so service takes a few hundred ticks rather than a lifetime.
     * Delete that and this cap silently becomes a lockout.
     */
    assert.match(MAINT, /creep\.memory\.suicide = true;/);
    assert.match(MAINT, /creep\.memory\.suicide\) \{[\s\S]{0,60}creep\.recycle\(\);/);
  });

  it("counts every maintainer, parked or not", () => {
    /*
     * An earlier cut skipped parked creeps here, reasoning that a parked one
     * does no repair and should not block another room. It made things worse:
     * each parked creep freed a slot, the next room bought one, that one
     * parked too. Live shard3 went to five maintainers with THREE parked
     * against a cap of two. Excluding them turned a cap into a ratchet.
     */
    assert.notMatch(CODE, /if \(m\.bankParked\) continue;/);
    assert.match(CODE, /_maintRooms\[m\.homeRoom\] = true;/);
  });

  it("only buys a maintainer the role will actually run", () => {
    /*
     * THE REAL DEFECT, one level up. This file's spawn gate said affordable at
     * UPGRADE_FLOOR (10,000) or merely on a rising bank. Roles/maintainer
     * parks whenever the bank is under MAINT_BANK_FLOOR (10,000) and will not
     * resume until MAINT_BANK_RESUME (12,000). So a room bought a 1,000-2,000
     * energy body, the purchase took the bank under the floor, and the creep
     * parked on arrival — and a room merely "rising" at 6,000 bought one that
     * could never work at all.
     *
     * Live: five maintainers, three parked — E35N59 at 10,635 banked, E38N56
     * at 7,919, E39N58 at 6,422. Each bought by one gate and refused by the
     * other.
     */
    assert.match(CODE, /if\(spawnMaintainer && storageEnergy\(room\) < MAINT_BANK_RESUME\) \{/);
    assert.notMatch(CODE, /storageEnergy\(room\) >= UPGRADE_FLOOR \|\| bankIsRising\(room\)/);
  });

  it("takes the threshold from the role that owns it", () => {
    // Two copies of a number two files must agree on is two numbers, and they
    // drift. This bot has been bitten by that shape repeatedly today.
    // The import list grew a second name (shellIsBreached, for the roster-path
    // gate in maintainerParkAtBirth.test); match the name, not the whole line.
    assert.match(SP, /import \{[^}]*MAINT_BANK_RESUME[^}]*\} from "Roles\/maintainer";/);
    assert.match(MAINT, /export const MAINT_BANK_RESUME = 12000;/);
    assert.match(MAINT, /export const MAINT_BANK_FLOOR = 10000;/);
  });

  it("still keeps a bank test at all", () => {
    // A room whose income is already spoken for cannot fix its walls by going
    // broke; the cap must not have displaced that check, only corrected the
    // number it uses.
    assert.match(CODE, /if\(spawnMaintainer && storageEnergy\(room\) < MAINT_BANK_RESUME\)/);
  });
});
