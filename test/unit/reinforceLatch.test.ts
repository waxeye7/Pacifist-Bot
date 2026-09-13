import { assert } from "chai";
import fs from "fs";
import { runReinforce } from "../../src/War/reinforce";

/**
 * THE DISTRESS LATCH OUTLIVES THE ROOM THAT RAISED IT.
 *
 * DistressSignals.reinforce_me is raised inside a room's defence pass
 * (HostileCreeps > 1 && danger) and was only released by that SAME room's
 * no-hostiles branch. Two holes:
 *
 *  1. Room lost while latched — no defence pass ever runs for an unowned
 *     room again, so the latch could never clear. warAtPeace reads
 *     DistressSignals non-empty and holds the war-scout fleet on the
 *     wartime cadence (1000-tick age bar, cap 2) for the rest of the global.
 *
 *  2. A harmless leftover creep — the middle branch (threat count 0,
 *     hostiles > 0) cleared `danger` but not the latch, and the zero-hostiles
 *     branch never ran while one MOVE-only scout kept standing in the room.
 *
 * runReinforce now drops a latch that names a room we do not own, and the
 * harmless-creeps unwind releases it too.
 */

const g: any = global;

function withGame(rooms: any, fn: () => void): void {
    const prevGame = g.Game;
    const prevMemory = g.Memory;
    g.Game = Object.assign({}, prevGame, { time: 100000, rooms });
    g.Memory = { DistressSignals: { reinforce_me: "E1N1" } };
    try {
        fn();
    } finally {
        g.Game = prevGame;
        g.Memory = prevMemory;
    }
}

describe("reinforce latch release", () => {
    it("drops the latch when the named room is gone", () => {
        withGame({}, () => {
            runReinforce();
            assert.isUndefined((g.Memory as any).DistressSignals.reinforce_me);
        });
    });

    it("drops the latch when the named room is not ours", () => {
        withGame({ E1N1: { controller: { my: false } } }, () => {
            runReinforce();
            assert.isUndefined((g.Memory as any).DistressSignals.reinforce_me);
        });
    });

    it("keeps the latch while the room is still ours", () => {
        withGame({ E1N1: { controller: { my: true } } }, () => {
            runReinforce();
            assert.strictEqual((g.Memory as any).DistressSignals.reinforce_me, "E1N1");
        });
    });

    it("defence unwinds the latch on the harmless-creeps branch too", () => {
        const src = fs.readFileSync("src/Rooms/rooms.defence.ts", "utf8");
        const branch = src.slice(src.indexOf("else if(room.memory.danger)"));
        const nextBlock = branch.indexOf("// Man-able shell");
        const segment = branch.slice(0, nextBlock);
        assert.include(segment, "Memory.DistressSignals.reinforce_me");
    });
});
