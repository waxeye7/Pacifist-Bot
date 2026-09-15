import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

/**
 * room.memory.Structures is seeded only for OWNED rooms (rooms.ts). A role
 * that reads `creep.room.memory.Structures.X` while standing in a remote or
 * foreign room hits `undefined.X` — a TypeError every tick.
 *
 * Two sites were reachable outside owned rooms:
 *  - energyMiner: a remote miner can carry `myRampart` out of a loaded home
 *    transit into the remote room, where the unload branch then ran the
 *    unguarded Structures.storage read.
 *  - SpecialRepair: a stale rampart lock can hold while the creep crosses a
 *    room boundary.
 */
const SRC = (p: string) =>
    fs.readFileSync(path.join(__dirname, "../../src/", p), "utf8").replace(/\r\n/g, "\n");

describe("Structures.X reads outside owned rooms", () => {
    it("energyMiner guards its storage lookup", () => {
        const em = SRC("Roles/energyMiner.ts");
        // the myRampart site must prefer vision and gate the memory fallback
        assert.include(em, "creep.room.memory.Structures && creep.room.memory.Structures.storage",
            "guarded Structures.storage fallback missing");
        // exactly one bare read survives — inside the homeRoom == targetRoom
        // gate, where Structures is always seeded
        const bare = /let storage:any = Game\.getObjectById\(creep\.room\.memory\.Structures\.storage\)/g;
        const hits = em.match(bare) || [];
        assert.strictEqual(hits.length, 1,
            "a new unguarded Structures.storage read appeared outside the home gate");
    });

    it("SpecialRepair guards its storage lookup", () => {
        const sr = SRC("Roles/SpecialRepair.ts");
        assert.notMatch(sr, /let storage:any = Game\.getObjectById\(creep\.room\.memory\.Structures\.storage\)/,
            "unguarded Structures.storage read remains in SpecialRepair");
        assert.include(sr, "creep.room.memory.Structures && creep.room.memory.Structures.storage",
            "guarded Structures.storage fallback missing");
        assert.include(sr, "creep.room.storage", "vision-based storage preferred");
    });
});
