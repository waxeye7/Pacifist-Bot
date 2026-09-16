/**
 * ROLE STATE-MACHINE WEDGES — creeps that parked forever issuing no intent.
 *
 * Audit 2026-10: six spots where a role's own state latches made a creep
 * unreachable by any recovery path for the rest of its life:
 *
 *   RampartErector — dropped the repair lock at refill time once the rampart
 *     passed 30k hits, but the tile was already popped off rampartLocations
 *     and nothing requeued it: every rampart needing more than ~one carry
 *     load stranded between 30k and the 500k done-cap.
 *   billtong — the nearest-candidate scan kept its [100,100] sentinel when
 *     every fallback room was already in searchedRooms, writing
 *     targetRoom = undefined and re-scanning the same dead list every tick.
 *   billtong — `if(terminal) ... else if(storage)` made the storage fallback
 *     unreachable whenever a terminal existed; a full terminal meant
 *     ERR_FULL every tick and `full` never cleared.
 *   defender — non-÷3 bodies with no manned rampart fell through the whole
 *     danger branch and issued no intent while hostiles were in the room;
 *     moveTo(terminal) also fired in rooms with no terminal.
 *   maintainer — `!rampartsToRepair` let a truthy [] cache live forever, so
 *     ramparts raised mid-life were never repaired; and the `danger` hub-clip
 *     could empty the target list into a suicide branch guarded only by
 *     interiorReady — recycling maintainers mid-siege in rooms without
 *     interior geometry.
 *   FakeFiller — a 100%-full bank was locked and returned unconditionally,
 *     transfer -> ERR_FULL every tick (see fakeFillerLock.test.ts).
 *   goblin — dropRoom candidates never required a resolvable storage, so a
 *     full goblin delivered to a room it could not unload in.
 *
 * Module-private paths => source-shape assertions, same convention as
 * rampartWaste.test.ts / fakeFillerLock.test.ts.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string) =>
    fs.readFileSync(path.join(__dirname, "../../src/", rel), "utf8").replace(/\r\n/g, "\n");

const ERECTOR = read("Roles/RampartErector.ts");
const BILLTONG = read("Roles/billtong.ts");
const DEFENDER = read("Roles/defender.ts");
const MAINTAINER = read("Roles/maintainer.ts");
const GOBLIN = read("Roles/goblin.ts");

describe("RampartErector: keeps the lock until the done-cap", () => {
    it("refill keeps locks on any rampart under 500k, not just under 30k", () => {
        const at = ERECTOR.indexOf("creep.memory.locked_repair ? Game.getObjectById");
        assert.isAbove(at, -1);
        const block = ERECTOR.slice(at, ERECTOR.indexOf("if(!creep.memory.full && creep.store.getFreeCapacity", at));
        assert.include(block, "fresh.hits < 500000",
            "dropping the lock on a live 30k-500k rampart orphaned the popped coord forever");
        assert.notInclude(block, "fresh.hits < 30000");
    });

    it("still releases at the same cap the work loop uses", () => {
        assert.include(ERECTOR, "target.hits < 500000",
            "the repair-loop cap is the single source of 'done'");
    });

    it("still requeues the coord when the newborn died during refill", () => {
        assert.include(ERECTOR, "list.push([pos.x, pos.y]);");
    });
});

describe("billtong: exhausted candidate list retires the creep", () => {
    it("suicides instead of indexing listOfPossibleRooms out of bounds", () => {
        const at = BILLTONG.indexOf("let lowest = [100, 100];");
        assert.isAbove(at, -1);
        const block = BILLTONG.slice(at, BILLTONG.indexOf("creep.memory.targetRoom = listOfPossibleRooms[lowest[0]];", at));
        assert.include(block, "lowest[0] >= listOfPossibleRooms.length");
        assert.include(block, "creep.memory.suicide = true;");
    });

    it("a full terminal no longer shadows the storage fallback", () => {
        assert.include(BILLTONG, "if(terminal && terminal.store.getFreeCapacity() > 0 && creep.store.getFreeCapacity() < MaxStorage)");
        assert.include(BILLTONG, "else if(storage && creep.store.getFreeCapacity() < MaxStorage)");
    });
});

describe("defender: no rampart still fights", () => {
    it("the non-÷3 branch has a no-rampart fallback that engages the closest hostile", () => {
        const at = DEFENDER.indexOf("if(creep.pos.isNearTo(closestEnemyCreep))");
        assert.isAbove(at, -1);
        const block = DEFENDER.slice(at, DEFENDER.indexOf("if(creep.room.memory.danger)", at) === -1 ? undefined : undefined);
        assert.include(DEFENDER, "creep.MoveCostMatrixRoadPrio(closestEnemyCreep, 3);",
            "with no manned rampart the creep used to issue no intent at all");
    });

    it("moveTo(terminal) is gone — a terminal-less room got a wasted intent", () => {
        assert.notInclude(DEFENDER, "creep.moveTo(creep.room.terminal)");
        assert.include(DEFENDER, "creep.room.terminal || creep.room.storage");
    });
});

describe("maintainer: rampart list and siege survival", () => {
    it("rebuilds rampartsToRepair on a cadence — a truthy [] used to freeze forever", () => {
        assert.include(MAINTAINER, "if(!creep.memory.rampartsToRepair || Game.time % 100 == 0)");
    });

    it("danger alone holds the sit-tight branch — no mid-siege suicide without interiorReady", () => {
        assert.include(MAINTAINER, "else if (outposted || danger) {");
    });
});

describe("goblin: dropRoom must have somewhere to unload", () => {
    it("candidates require a standing storage", () => {
        assert.include(GOBLIN, "AllRooms.controller.level >= 4 && AllRooms.storage");
    });

    it("no usable sink with cargo -> suicide, so recycle() dumps the load", () => {
        assert.include(GOBLIN, "storage.store.getFreeCapacity() > 0");
        const at = GOBLIN.indexOf("else if(creep.store.getUsedCapacity() > 0)");
        assert.isAbove(at, -1);
        assert.include(GOBLIN.slice(at, at + 400), "creep.memory.suicide = true;");
    });
});
