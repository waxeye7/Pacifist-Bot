/**
 * The rampart repair ceiling is a real number: 12.5M at RCL8.
 *
 * rooms.defence's rampartHitsTargetForRcl ladder had already capped the
 * generic repair role (wantsRepair -> repairCeiling) and the spawn rungs —
 * but four independent paths still pumped ramparts far past the policy:
 *
 *   - rampartUpgrader locked the weakest rampart and repaired it until
 *     hitsMax (300,000,000 at RCL8) — no ceiling at all
 *   - energyMiner adopted and pumped its seat rampart to 50M/100M
 *   - SpecialRepair's siege pick had no hits bound
 *   - buildcontainer's generic fallback repaired ramparts to hitsMax
 *   - power creep FORTIFY accepted ramparts up to 65M
 *
 * Every one now routes through the same ladder, so "the max hits a rampart
 * gets repaired to" is one number in one place.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import { rampartHitsTarget, rampartHitsTargetForRcl } from "../../src/Rooms/rooms.defence";
import { wantsRepair } from "../../src/Roles/repair";

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, "../../src", rel), "utf8");
const RAMPART_UPGRADER = SRC("Roles/rampartUpgrader.ts");
const ENERGY_MINER = SRC("Roles/energyMiner.ts");
const SPECIAL_REPAIR = SRC("Roles/SpecialRepair.ts");
const BUILDCONTAINER = SRC("Roles/buildcontainer.ts");
const POWER_CREEPS = SRC("Functions/powerCreepFunctions.ts");

function room(lvl: number, bank: number, danger = false): any {
    return {
        name: "E35N58",
        memory: { danger },
        controller: { level: lvl },
        storage: { my: true, store: { energy: bank } },
    };
}
const rampart = (hits: number) => ({ structureType: "rampart", hits, hitsMax: 300000000 });

describe("rampart repair cap — 12.5M is the ceiling", () => {
    it("the owner ladder tops out at 12,500,000", () => {
        assert.strictEqual(rampartHitsTargetForRcl(8), 12500000);
        assert.strictEqual(rampartHitsTarget(room(8, 0)), 12500000);
    });

    it("a rich RCL8 room stops repairing a rampart at the cap", () => {
        // bank >= SHELL_INVEST_BANK lifts the upkeep floor to the full target;
        // a fake room with no find() makes shellMin fail open to the ceiling.
        assert.isTrue(wantsRepair(room(8, 200000), rampart(12499999)));
        assert.isFalse(wantsRepair(room(8, 200000), rampart(12500000)));
        assert.isFalse(wantsRepair(room(8, 200000), rampart(100000000)));
    });

    it("rampartUpgrader gates both the pick and the held lock on the policy", () => {
        assert.include(RAMPART_UPGRADER, "s.hits < rampartHitsTarget(creep.room)");
        // the lock is re-checked at use, or a tile crossed mid-pump runs to hitsMax
        assert.include(RAMPART_UPGRADER, "target.hits < rampartHitsTarget(creep.room)");
    });

    it("energyMiner dropped the 50M/100M tiers for the shared ladder", () => {
        assert.notInclude(ENERGY_MINER, "100050000");
        assert.notInclude(ENERGY_MINER, "50050000");
        assert.include(ENERGY_MINER, "rampart.hits < rampartHitsTarget(rampart.room)");
        assert.include(ENERGY_MINER, "building.hits < rampartHitsTarget(creep.room)");
    });

    it("SpecialRepair's pick, in-range list and held lock all honour the cap", () => {
        assert.strictEqual(SPECIAL_REPAIR.split("s.hits < rampartHitsTarget(creep.room)").length - 1, 2);
        assert.include(SPECIAL_REPAIR, "target.hits >= rampartHitsTarget(creep.room)");
        assert.include(SPECIAL_REPAIR, "rampart.hits < rampartHitsTarget(creep.room)");
    });

    it("buildcontainer's generic repair fallback skips capped ramparts", () => {
        assert.include(BUILDCONTAINER, "object.hits < rampartHitsTarget(creep.room)");
    });

    it("power creep FORTIFY caps at the policy, not 65M", () => {
        assert.notInclude(POWER_CREEPS, "65000000");
        assert.include(POWER_CREEPS, "structure.hits <= rampartHitsTarget(this.room)");
    });
});
