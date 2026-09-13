import { assert } from "chai";
import fs from "fs";

/**
 * danger_timer used to WRAP to 0 at 10,000 while danger was still true.
 * Every consumer reads `danger_timer > N` as "sustained danger": >30 gates
 * spawn-effect handling, >50 the combat boosts, >200/300 the SpecialRepair
 * and Clearer rungs, >500 the PWR_DISRUPT_SPAWN recovery. A reset to 0 in
 * the middle of a siege reads as a fresh danger — every one of those rungs
 * flicked off together and re-armed over the next several hundred ticks,
 * repeatedly, for as long as the siege ran. Invader assaults last ~50k.
 * The timer now saturates at the cap instead of wrapping.
 */
const SRC = fs.readFileSync("src/Rooms/rooms.ts", "utf8")
    .replace(/[/][*][^]*?[*][/]/g, "").replace(/[/][/].*/g, "");

describe("danger_timer saturates instead of wrapping", () => {
    it("increments only below the cap", () => {
        const i = SRC.indexOf("if (room.memory.danger) {");
        const j = SRC.indexOf("else if (!room.memory.danger", i);
        const seg = SRC.slice(i, j > i ? j : i + 900);
        assert.include(seg, "danger_timer < 10000");
        assert.include(seg, "danger_timer++");
        assert.notInclude(seg, "danger_timer = 0");
    });
});
