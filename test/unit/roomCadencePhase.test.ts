/**
 * Seven communes did their periodic room work on the same tick, so the bot's
 * CPU came in bursts and the bursts were paid out of the bucket.
 *
 * Every `Game.time % N == 0` gate in the per-visible-room pass in Rooms/rooms.ts
 * read the residue off absolute Game.time with no room term in it. The pass is
 * called once per owned room, so the gate opened for ALL of them together:
 * construction() in all seven rooms on one tick every 1,000, pruneBadFill() in
 * all seven every 100, placeFromPlanV2() every 15, identifySources() every 10,
 * scanRemoteThreats() every 5, wipeForeignSites() every 20. The same total work
 * as phasing it, delivered as a spike instead of a level line.
 *
 * Live shard3 evidence, 2026-09-11: 100-tick average 18.0 against a limit of
 * 20. That banks +2/tick, which should float the bucket to its 10,000 ceiling
 * in roughly 3,500 ticks. The bucket instead sat between 2,679 and 3,075 for
 * the entire 24-hour watch on an unchanged roster, because the synchronised
 * ticks overshoot the limit and every tick over 20 is drawn straight from the
 * bucket. The measured last-30 window held a 21.0 maximum against a 14.1
 * minimum. Phase readings from Memory.CPU: rooms 3.12, creeps 12.67.
 *
 * The bucket is the whole point. CpuPolicy gates the optional roster at 5,000
 * and remotes at 4,000, so a bucket pinned near 3,000 kept repair, maintainer,
 * sweeper and every single remote switched off for the entire watch. Both
 * gates read false in every watchdog sample.
 *
 * The fix reuses roomTickOffset (Rooms/rooms.remotes.ts:403), the hash already
 * used to stagger market() and manageRemotes(). Nothing runs less often; each
 * room's pass just starts on its own residue.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const RT = fs
    .readFileSync(path.join(__dirname, "../../src/Rooms/rooms.ts"), "utf8")
    .replace(/\r\n/g, "\n");

describe("per-room cadences are phased so seven rooms do not spike together", () => {
    it("every phased pass carries the room offset", () => {
        const phased = [
            ["wipeForeignSites", "(Game.time + roomTickOffset(room.name)) % 20 === 0"],
            ["identifySources", "(Game.time + roomTickOffset(room.name)) % 10 == 0 || Game.time < 10"],
            ["placeFromPlanV2", "(Game.time + roomTickOffset(room.name)) % 15 === 0"],
            ["pruneBadFill", "(Game.time + roomTickOffset(room.name)) % 100 === 0"],
            ["construction", "(Game.time + roomTickOffset(room.name)) % constructionInterval == 0"],
            ["scanRemoteThreats", "(Game.time + roomTickOffset(room.name)) % 5 === 0"],
        ];
        for (const [what, gate] of phased) {
            assert.include(RT, gate, what + " lost its per-room phase offset");
        }
    });

    it("none of them regressed to the bare absolute-tick residue", () => {
        const bare = [
            "Game.time % 20 === 0) wipeForeignSites",
            "if (Game.time % 15 === 0 && !isSkeleton",
            "if (Game.time % 5 === 0) {\n        scanRemoteThreats",
            "Game.time % constructionInterval == 0 && bucket >",
        ];
        for (const b of bare) {
            assert.notInclude(RT, b, "a pass went back to firing in all rooms at once");
        }
    });

    it("whole-empire passes stay synchronised on purpose", () => {
        // These iterate Game.rooms from INSIDE the per-room body. Phasing them
        // would run an empire-wide sweep once per room per period instead of
        // once per period, which is seven times the work, not one seventh.
        assert.include(RT, "if (Game.time % 400 == 0) {");
        assert.include(RT, "if (Game.time % 25000 === 0) {");
        // The keepTheseRoads sweep kept its synchronised residue but was
        // hoisted out of the per-room body in the same push, so the current
        // room's danger flag no longer gates the empire-wide pass. See
        // cpuAttribution.test.ts for that half.
        assert.include(RT, "if (Game.time % 3012 == 0 && Game.cpu.bucket > 3500) {");
        // labs() documents its own reason for staying on the plain residue:
        // its internal %120/%500/%21000 cadences sit on absolute Game.time.
        assert.include(RT, "if (Game.time % 10 === 0) {\n          labs(room);");
    });

    it("the offset hash is the one already in use, not a new one", () => {
        assert.include(RT, 'import remotes, { manageRemotes, scanRemoteThreats, roomTickOffset } from "./rooms.remotes";');
        const RM = fs
            .readFileSync(path.join(__dirname, "../../src/Rooms/rooms.remotes.ts"), "utf8")
            .replace(/\r\n/g, "\n");
        assert.include(RM, "export function roomTickOffset(name: string): number {");
    });
});
