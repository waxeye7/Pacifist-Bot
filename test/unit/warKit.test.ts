/**
 * War homes are judged on the bank, not energyAvailable. reinforce and
 * spawn_mosquito used to re-open the E37N59 "pick the broke RCL6" trap.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import { canFund, KIT_COST } from "../../src/War/kit";

function room(opts: {
    energy?: number;
    cap?: number;
    storage?: number | null;
    terminal?: number;
    stall?: number;
    towers?: number[];
}): any {
    const towers = (opts.towers || []).map((e) => ({
        structureType: STRUCTURE_TOWER,
        store: { energy: e },
    }));
    return {
        storage: opts.storage === undefined || opts.storage === null
            ? null
            : { my: true, store: { energy: opts.storage } },
        terminal: opts.terminal === undefined
            ? null
            : { my: true, store: { energy: opts.terminal } },
        energyAvailable: opts.energy === undefined ? 0 : opts.energy,
        energyCapacityAvailable: opts.cap === undefined ? 300 : opts.cap,
        memory: { spawnStall: opts.stall || 0 },
        find: () => towers,
    };
}

describe("War/kit canFund", () => {
    it("refuses a 7000 quad when the bank is empty even if extensions are full", () => {
        // The live latch: E37N59 RCL6, storage 0, 1950/1950 fill, picked
        // as home for every offensive.
        assert.isFalse(canFund(room({ energy: 1950, cap: 1950, storage: 0 }), KIT_COST.quad));
    });

    it("funds a 650 guard from a pre-storage room that can actually hold one", () => {
        assert.isTrue(canFund(room({ energy: 500, cap: 800, storage: null }), KIT_COST.guardPrey));
    });

    it("refuses that same guard when the extension net is on fumes", () => {
        assert.isFalse(canFund(room({ energy: 80, cap: 800, storage: null }), KIT_COST.guardPrey));
    });

    it("requires a real bank for a mosquito, not 9000 in extensions", () => {
        assert.isFalse(canFund(room({ energy: 9000, cap: 12900, storage: 10000 }), KIT_COST.mosquito));
        assert.isTrue(canFund(room({ energy: 2000, cap: 12900, storage: 40000 }), KIT_COST.mosquito));
    });
});

describe("reinforce and mosquito use canFund, not energyAvailable", () => {
    const REINFORCE = fs.readFileSync(
        path.join(__dirname, "../../src/War/reinforce.ts"), "utf8");
    const COMMANDS = fs.readFileSync(
        path.join(__dirname, "../../src/utils/Commands.ts"), "utf8");
    const SPAWNING = fs.readFileSync(
        path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");

    it("pickHelper calls canFund with the prey-guard kit", () => {
        assert.include(REINFORCE, "canFund(room, KIT_COST.guardPrey)");
        assert.notInclude(REINFORCE, "energyAvailable < GUARD_COST");
    });

    it("spawn_mosquito funds from the bank", () => {
        assert.include(COMMANDS, "canFund(room, KIT_COST.mosquito)");
        assert.notInclude(COMMANDS, "energyAvailable >= 9000");
    });

    it("elected colony mother is not re-gated on 10k storage and range 7", () => {
        assert.notInclude(
            SPAWNING,
            "storage.store[RESOURCE_ENERGY] > 10000 && distance_to_target_room <= 7",
        );
        assert.include(SPAWNING, "energyCapacityAvailable >= 650");
    });
});
