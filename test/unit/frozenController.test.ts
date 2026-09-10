/**
 * A room that put ZERO energy into its controller while six siblings each put
 * in twelve a tick.
 *
 * Live shard3 2026-09-11, controller.progress sampled across 44 ticks
 * (82,882,046 -> 82,882,090):
 *
 *   E37N59  3,360,098 -> 3,360,626    12 e/t
 *   E37N58    406,767 ->   407,295    12 e/t
 *   E35N59  1,894,549 -> 1,895,077    12 e/t
 *   E35N58    915,924 ->   916,452    12 e/t
 *   E36N57  3,461,018 -> 3,461,546    12 e/t
 *   E38N56  2,315,778 -> 2,316,294    12 e/t
 *   E39N58     20,727 ->    20,727     0
 *
 * E39N58 was RCL7 with a real storage holding 4,694 and rising, two miners, two
 * construction sites and ticksToDowngrade 149,879 of 150,000 — and no upgrader
 * at all. Every upgrader rung in the file, INCLUDING keepOneUpgrader's floor,
 * carries `sitesMayNotVetoUpgraders || ticksToDowngrade < 21000`, and
 * sitesMayNotVetoUpgraders is "bank over 10k, or no sites". The v2 planner tops
 * the site budget back to ~4 every 15 ticks, so a planned room has sites
 * permanently; below 10k the veto had no expiry.
 *
 * The veto itself is not the bug — it was added for live VPS W2N1/W3N1, where a
 * 15-WORK floor upgrader ate the whole 10-20 e/tick income of a room banking
 * ZERO with nine open sites. What was missing is a bound on how long it may
 * hold.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const SP = fs
    .readFileSync(path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8")
    .replace(/\r\n/g, "\n");

describe("open sites cannot freeze a controller forever", () => {
    const body = SP.slice(
        SP.indexOf("function controllerStalled(room): boolean {"),
        SP.indexOf("function upgraderTarget(")
    );

    it("every rung that carries the site veto also carries the escape", () => {
        // RCL4, RCL5, RCL6 (banded + floor), RCL7 (banded + floor).
        const guarded = SP.split("sitesMayNotVetoUpgraders || controllerStalled(room) || room.controller.ticksToDowngrade < 21000").length - 1;
        assert.equal(guarded, 6, "all six 21k-escape rungs");
        assert.notInclude(
            SP,
            "(sitesMayNotVetoUpgraders || room.controller.ticksToDowngrade < 21000)",
            "a rung was left without the expiry"
        );
    });

    it("stall is measured on controller progress, not on the roster", () => {
        // "no upgrader alive" would spawn a second one behind a parked upgrader.
        // Frozen progress is the harm itself and cannot be faked by a full bank.
        assert.include(body, "const p = c.progress || 0;");
        assert.include(body, "if(!M._ctrlP || M._ctrlP.p !== p) {");
        assert.include(body, "M._ctrlP = { p: p, t: Game.time };");
        assert.include(body, "return Game.time - M._ctrlP.t >= FLOOR_UPGRADER_PATIENCE;");
    });

    it("an empty real bank never clears it — that is the room the veto is for", () => {
        // live VPS W2N1/W3N1 banked literally zero; no amount of patience makes
        // such a room able to pay for a 15-WORK body.
        assert.include(body, "if(room.storage && room.storage.my && storageEnergy(room) <= 0) return false;");
    });

    it("RCL8 is excluded, same as keepOneUpgrader", () => {
        // the controller only takes 15 e/t there and the RCL8 rung is a
        // downgrade rung whose want is one anyway
        assert.include(body, "if(!c || !c.my || c.level >= 8) return false;");
    });

    it("builders keep an uncontested claim for far longer than one site", () => {
        const m = SP.match(/const FLOOR_UPGRADER_PATIENCE = (\d+);/);
        assert.isNotNull(m);
        assert.isAtLeast(Number(m![1]), 1500, "at least a creep lifetime of building");
        assert.isAtMost(Number(m![1]), 10000, "shorter than a downgrade, by a lot");
    });
});
