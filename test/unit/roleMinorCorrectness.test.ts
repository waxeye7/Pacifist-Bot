/**
 * ROLE MINOR CORRECTNESS — small behavioral bugs from the role audit.
 *
 *   mineralMiner — `store[deposit.mineralType] < N` is `undefined < N` = false
 *     whenever the structure holds zero of the mineral, so both cap checks
 *     were dead code and the delivery ladder never steered to the terminal.
 *   ram — hostile sort compared ranged parts but SUBTRACTED attack parts,
 *     preferring the less armed of two same-range hostiles.
 *   ram — `memory.powerCreep` latched "not found" (truthy) forever and never
 *     released a dead/departed id, so a power creep that entered after the
 *     first scan was invisible for the creep's whole life.
 *   ram — `portals.length > 1` ignored the single-portal room, the common
 *     case, and fell through to a hardcoded RoomPosition(12, 25).
 *   SneakyControllerUpgrader — `locked_away == 0` / `> 0` both fail on
 *     undefined (hand-rolled or role-changed creeps): the creep stood
 *     outside targetRoom doing nothing forever.
 *   ContinuousControllerKiller — the approach-attack lacked the `!s.my`
 *     filter every sibling carries: wasted intent on own structures, real
 *     damage to neutral ones.
 *   Convoy — an empty convoy in a room that is neither homeRoom nor
 *     targetRoom but DID have a seeded Structures.storage fell through
 *     every branch and idled forever.
 *   SpecialCarry — `drop(ENERGY, store - freeCapacity)` passes a negative
 *     amount when the target could hold the whole load: ERR_INVALID_ARGS.
 *
 * Module-private paths => source-shape assertions, same convention as
 * roleStateWedges.test.ts.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string) =>
    fs.readFileSync(path.join(__dirname, "../../src/", rel), "utf8").replace(/\r\n/g, "\n");

const MINERAL_MINER = read("Roles/mineralMiner.ts");
const RAM = read("Roles/ram.ts");
const SCU = read("Roles/SneakyControllerUpgrader.ts");
const CCK = read("Roles/ContinuousControllerKiller.ts");
const CONVOY = read("Roles/Convoy.ts");
const SPECIAL_CARRY = read("Roles/SpecialCarry.ts");

describe("mineralMiner: the delivery caps were dead code", () => {
    it("zero-of-mineral stores coerce before comparing", () => {
        assert.include(MINERAL_MINER, "(storage.store[deposit.mineralType] || 0) < 19500");
        assert.include(MINERAL_MINER, "(terminal.store[deposit.mineralType] || 0) < 5000");
    });
});

describe("ram: target selection", () => {
    it("attack parts sort descending on a ranged tie, not ascending", () => {
        assert.include(RAM, "(activeRangedAttackPartsB - activeRangedAttackPartsA) || (activeAttackPartsB - activeAttackPartsA)");
        assert.notInclude(RAM, "activeAttackPartsB - activeAttackPartsA; //");
    });

    it("a latched 'not found' or dead id does not shut the rescan forever", () => {
        assert.include(RAM, 'creep.memory.powerCreep === "not found" && Game.time % 25 == 0');
        assert.include(RAM, "delete creep.memory.powerCreep;");
    });

    it("a single portal is a valid move target", () => {
        assert.include(RAM, "portals.length > 0");
        assert.notInclude(RAM, "portals.length > 1");
    });
});

describe("SneakyControllerUpgrader: undefined locked_away", () => {
    it("treats missing locked_away as 0 instead of matching neither branch", () => {
        assert.include(SCU, "(creep.memory.locked_away || 0) == 0");
    });
});

describe("ContinuousControllerKiller: approach-attack filter", () => {
    it("only attacks structures that are not ours", () => {
        assert.include(CCK, "findInRange(FIND_STRUCTURES, 1).filter(s => !s.my)");
    });
});

describe("Convoy: an empty convoy never falls through", () => {
    it("the leftover-room branch is unconditional", () => {
        assert.notInclude(CONVOY, "else if(!creep.room.memory.Structures || !creep.room.memory.Structures.storage)");
    });
});

describe("SpecialCarry: drop amount is never negative", () => {
    it("guards the drop on a positive excess", () => {
        assert.include(SPECIAL_CARRY, "const excess = creep.store[RESOURCE_ENERGY] - target.store.getFreeCapacity();");
        assert.include(SPECIAL_CARRY, "if (excess > 0)");
    });
});
