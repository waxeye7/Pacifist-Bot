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

/**
 * ...and the escape immediately overshot, because lifting the maintainer over
 * the CPU gate also lifted it over the only affordability brake it had.
 *
 * Live shard3 2026-09-11. E38N56 was ALREADY running at about -35 energy a tick
 * before any of this -- a 12-WORK upgrader and a 10-WORK repairer against two
 * sources -- and the new escape handed it a 13-WORK maintainer on top: a 1,950
 * energy body that then burns 13 a tick. Storage fell 9,998 -> 1,758 and the
 * shell minimum it was bought to fix moved 2,935 -> 3,061, which is the towers'
 * own peacetime decay floor, not the maintainer's work.
 *
 * The maintainer role had no bank discipline of any kind, because for as long
 * as optionalRosterOpen() sat in front of every rung a 5,000 bucket was standing
 * in as the affordability test.
 */
const MT = fs
    .readFileSync(path.join(__dirname, "../../src/Roles/maintainer.ts"), "utf8")
    .replace(/\r\n/g, "\n");

describe("upkeep still has to be paid for", () => {
    it("the spawn escape needs a bank over the floor, or one that is rising", () => {
        assert.include(SP, "if(spawnMaintainer && !(storageEnergy(room) >= UPGRADE_FLOOR || bankIsRising(room))) {");
        assert.include(SP, "spawnMaintainer = false;");
        // ...and it is applied AFTER both arms that raise the flag, or one of
        // them slips past
        const ramp = SP.indexOf("if(rampart.hits <= 10000) {");
        const box = SP.indexOf("if(worstBox.length) {");
        const pay = SP.indexOf("if(spawnMaintainer && !(storageEnergy(room) >= UPGRADE_FLOOR");
        assert.isAbove(pay, ramp);
        assert.isAbove(pay, box);
    });

    it("a maintainer already alive parks instead of draining the room", () => {
        assert.include(MT, "creep.memory.bankParked = true;");
        assert.include(MT, "creep.idlePark();");
        assert.include(MT, "if(creep.memory.bankParked) delete creep.memory.bankParked;");
        // parked, NOT recycled: the bank crossing a floor is a passing
        // condition and a recycled body has to be bought again at full price.
        // Roles/ControllerLinkFiller answers the same question the same way.
        const at = MT.indexOf("creep.memory.bankParked = true;");
        assert.notInclude(MT.slice(at - 400, at + 200), "suicide");
    });

    it("...with a deadband, so a room sitting on the floor does not flap it", () => {
        assert.include(MT, "creep.memory.bankParked ? MAINT_BANK_RESUME : MAINT_BANK_FLOOR");
        const f = Number(MT.match(/const MAINT_BANK_FLOOR = (\d+);/)![1]);
        const r = Number(MT.match(/const MAINT_BANK_RESUME = (\d+);/)![1]);
        assert.isAbove(r, f, "resume must be the higher of the two");
        // same number every other subsystem calls "not poor"
        assert.equal(f, 10000);
    });

    it("a breached shell overrides the bank, a merely worn one does not", () => {
        assert.include(MT, "&& !shellIsBreached(creep.room)");
        const fn = MT.slice(MT.indexOf("function shellIsBreached"), MT.indexOf("const run = function"));
        assert.include(fn, "s.structureType === STRUCTURE_RAMPART && s.my");
        assert.include(fn, "< MAINT_EMERGENCY_HITS");
        // memoised per room per tick, and off the shared structure list
        assert.include(fn, 'cachedDerived(room, "maintShellBreach"');
        assert.include(fn, "cachedStructures(room)");
        const h = Number(MT.match(/const MAINT_EMERGENCY_HITS = (\d+);/)![1]);
        // rooms.defence repairs the weakest rampart up to TOWER_SHELL_FLOOR ==
        // 3,000, so a held shell OSCILLATES either side of that number: live
        // E38N56 read 2,935, 3,006 and 3,061 within a few hundred ticks. A
        // threshold on that band toggles the creep every few ticks and finishes
        // nothing. It has to be clear of it.
        assert.isBelow(h, 3000 * 0.75, "must be clear of the towers' own band");
        assert.isAtLeast(h, 500);
    });

    it("a room with no real storage is not judged on a bank it does not have", () => {
        assert.include(MT, "const bank = creep.room.storage && creep.room.storage.my");
        assert.include(MT, "if(bank !== null && bank <");
    });
});
