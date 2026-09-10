/**
 * The empire's containers were dying and nothing could be bought to stop it.
 *
 * test/unit/containerUpkeep pins Roles/maintainer as the ONLY cover for a
 * container: Roles/repair excludes them from RCL6 up, and the towers hold a
 * decay floor on ramparts and roads and nothing at all on these. Every
 * maintainer rung in rooms.spawning sat behind optionalRosterOpen(), which
 * needs a 5,000 bucket to reopen — and live shard3 has been running a stable
 * 3,000-3,500 with the roster shut and zero maintainers alive in seven rooms.
 *
 * Worst container per owned room as a fraction of its 250,000 maximum, live
 * 2026-09-11: E35N59 22%, E35N58 24%, E37N59 26%, E36N57 26%, E39N58 26%,
 * E37N58 42%, E38N56 72%. An owned-room container decays 10 hits a tick, so
 * 22% is ~5,500 ticks from gone, and gone means the source seat or the hub bin
 * stops existing and costs 5,000 energy plus a builder to replace.
 *
 * Road decay in the same read: E36N57 45 of 120 roads under half hits, E35N58
 * 32 of 87, E39N58 22 of 98, three rooms with roads sitting at exactly the 10%
 * tower floor. And E38N56's shell minimum was 2,935 hits -- the room's own
 * spawnMaintainer flag was already TRUE and the CPU gate in front of it was
 * refusing the question.
 *
 * repairRosterOpen() in the same file already carries this exact escape ("Shell
 * at the peacetime tower floor: one repairer even when CPU skip is on"). The
 * maintainer never got it.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const SP = fs
    .readFileSync(path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8")
    .replace(/\r\n/g, "\n");

describe("survival upkeep is not discretionary", () => {
    it("every maintainer rung lets spawnMaintainer past the CPU gate", () => {
        // RCL4, 5, 6, 7, 8.
        const open = SP.split("(optionalRosterOpen() && room.memory.keepTheseRoads && room.memory.keepTheseRoads.length > 0 || spawnMaintainer)").length - 1;
        assert.equal(open, 5, "all five maintainer rungs");
        // the old shape, where the whole condition was ANDed behind the bucket
        assert.notInclude(SP, "optionalRosterOpen() && maintainers <");
    });

    it("the discretionary half stays behind the bucket", () => {
        // keepTheseRoads is ordinary wear. Only the room's own critical flag
        // jumps the queue, exactly as repairRosterOpen already does for the
        // shell.
        assert.include(SP, "optionalRosterOpen() && room.memory.keepTheseRoads");
        assert.include(SP, "// Shell at the peacetime tower floor: one repairer even when CPU skip is on.");
    });

    it("a dying container raises the flag, not just a dying rampart", () => {
        assert.include(SP, "st.structureType == STRUCTURE_CONTAINER && st.hits < st.hitsMax * CONTAINER_CRITICAL");
        assert.include(SP, "if(worstBox.length) {");
        // the rampart arm is untouched
        assert.include(SP, "if(rampart.hits <= 10000) {");
    });

    it("the container scan uses the per-tick cache, not a fresh room-wide find", () => {
        // FIND_STRUCTURES is the widest find in the game and this block runs on
        // the roster cadence for every owned room.
        assert.include(SP, "cachedStructures(room).filter((st:any) =>");
        assert.include(SP, 'import { cachedStructures } from "utils/RoomCache";');
    });

    it("the bar is low enough to be a duty cycle, not a standing roster", () => {
        const m = SP.match(/const CONTAINER_CRITICAL = ([\d.]+);/);
        assert.isNotNull(m);
        const f = Number(m![1]);
        // 250,000 max, 10 hits/tick decay. Below 0.05 there is under 1,250
        // ticks left, which is less than the time to build and walk a body.
        assert.isAtLeast(f, 0.05);
        // above ~0.35 every container in the empire qualifies permanently
        assert.isAtMost(f, 0.3);
    });
});
