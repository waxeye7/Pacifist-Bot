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

/**
 * THE DRIFTED-CREEP SWEEP. Displacement (border shove, swap, flee across an
 * exit) drops a home-role creep in a foreign room, where Structures was never
 * seeded. Every Structures-keyed read below used to throw undefined.X on the
 * next tick — per-creep in RunCreepManager, or the whole creep phase in
 * RunPowerCreepManager which had no try/catch.
 */
describe("Structures sweep — drifted-creep sites", () => {
    const CF = SRC("Functions/creepFunctions.ts");

    it("findFillerTarget gates every Structures rung on an owned room", () => {
        const start = CF.indexOf("Creep.prototype.findFillerTarget");
        const body = CF.slice(start, start + 9000);
        assert.include(body, "const myRoom = !!(this.room.controller && this.room.controller.my)");
        assert.include(body, "const S:any = this.room.memory.Structures || {}");
        // no Structures deref may survive outside the S alias
        assert.notMatch(body, /room\.memory\.Structures\./, "bare room.memory.Structures read survives in findFillerTarget");
        for (const rung of ["myRoom && (!S.controllerLink", "myRoom && S.controllerLink", "myRoom && S.extraLinks", "myRoom && S.powerSpawn"]) {
            assert.include(body, rung, "ungated rung: " + rung);
        }
    });

    it("_discoverControllerDepot refuses a foreign room and seeds before reading", () => {
        const start = CF.indexOf("function _discoverControllerDepot");
        const head = CF.slice(start, start + 700);
        assert.include(head, "if (!room.controller || !room.controller.my) return;");
        assert.include(head, "if (!room.memory.Structures) room.memory.Structures = {};");
        // the seed must precede the first keyed read
        assert.isBelow(head.indexOf("room.memory.Structures = {}"), head.indexOf("Structures.controllerLink"));
    });

    it("findBin seeds Structures before writing the bin id", () => {
        const rf = SRC("Functions/roomFunctions.ts");
        const start = rf.indexOf("Room.prototype.findBin");
        const body = rf.slice(start, start + 2200);
        const write = body.indexOf("Structures.bin = building.id");
        const seed = body.indexOf("if(!this.memory.Structures) this.memory.Structures = {};");
        assert.isAbove(write, -1);
        assert.isAbove(seed, -1, "no seed before the bin write");
        assert.isBelow(seed, write);
    });

    it("managerErrand reads Structures through an || {} alias", () => {
        const em = SRC("Roles/energyManager.ts");
        const start = em.indexOf("export function managerErrand");
        const body = em.slice(start, start + 22000);
        assert.include(body, "const S: any = creep.room.memory.Structures || {};");
        assert.notMatch(body, /creep\.room\.memory\.Structures\./, "bare Structures deref survives in managerErrand");
    });

    it("efficient guards its powerSpawn renew lookup", () => {
        const pc = SRC("Roles/PowerCreeps/efficient.ts");
        assert.include(pc, "creep.room.memory.Structures && creep.room.memory.Structures.powerSpawn");
    });

    it("Build_Remote_Roads refuses non-owned rooms", () => {
        const rc = SRC("Rooms/rooms.construction.ts");
        const start = rc.indexOf("function Build_Remote_Roads");
        const head = rc.slice(start, start + 700);
        assert.include(head, "!room.controller.my", "hostile/console room not filtered before the Structures read");
    });

    it("energyMiner gates the home link network on a seeded room", () => {
        // homeRoom == targetRoom is not proof of ownership — a drifted home
        // miner keeps both keys in a foreign room where Structures is
        // unseeded, and the link/storage reads below the gate all threw.
        const em = SRC("Roles/energyMiner.ts");
        assert.include(em, "creep.memory.homeRoom == creep.memory.targetRoom && creep.room.memory.Structures");
    });

    it("upgrader reads Structures.controllerLink through an existence check", () => {
        const up = SRC("Roles/upgrader.ts");
        assert.include(up, "creep.room.memory.Structures && creep.room.memory.Structures.controllerLink");
    });

    it("findStorageLink seeds Structures before writing the hub link id", () => {
        // creep.findClosestLinkToStorage() routes here on wherever the creep
        // stands — a foreign room with a link on the planned tile wrote
        // Structures.StorageLink off undefined.
        const rf = SRC("Functions/roomFunctions.ts");
        const start = rf.indexOf("Room.prototype.findStorageLink");
        const body = rf.slice(start, start + 1200);
        const seed = body.indexOf("if (!this.memory.Structures) this.memory.Structures = {};");
        const write = body.indexOf("this.memory.Structures.StorageLink = plannedHub.id");
        assert.isAbove(seed, -1, "no seed in findStorageLink");
        assert.isAbove(write, -1);
        assert.isBelow(seed, write, "seed must precede the StorageLink write");
    });

    it("findStorageContainer seeds Structures before pinning the hub container", () => {
        const rf = SRC("Functions/roomFunctions.ts");
        const start = rf.indexOf("Room.prototype.findStorageContainer");
        const body = rf.slice(start, start + 1800);
        const write = body.indexOf("this.memory.Structures.storage = building.id");
        assert.isAbove(write, -1);
        const seed = body.indexOf("if(!this.memory.Structures) this.memory.Structures = {};");
        assert.isAbove(seed, -1, "no seed in findStorageContainer");
        assert.isBelow(seed, write);
    });
});

/**
 * Same drift trigger, different key: `room.controller` is undefined in
 * highway/SK/controller-less rooms. These reads sat on the same displaced-
 * creep paths.
 */
describe("adjacent controller derefs on drift paths", () => {
    it("upgrader gates the RCL2 bootstrap check on an existing controller", () => {
        const up = SRC("Roles/upgrader.ts");
        assert.include(up, "const rcl2Bootstrap = creep.room.controller && creep.room.controller.level == 2");
    });

    it("energyMiner guards controller.my on the TTL-700 storage scan", () => {
        const em = SRC("Roles/energyMiner.ts");
        assert.include(em, "!storages.length && creep.room.controller && creep.room.controller.my");
    });

    it("energyMiner gates the rampart adoption rung on an existing controller", () => {
        // a remote miner drifted into a highway/SK room reaches this block —
        // controller is undefined there and .level threw every tick.
        const em = SRC("Roles/energyMiner.ts");
        assert.include(em, "creep.room.controller && creep.room.controller.level >= 7 && !creep.memory.myRampart");
    });

    it("energyManager respawn chain reads a hoisted level, not controller.level", () => {
        const em = SRC("Roles/energyManager.ts");
        const idx = em.indexOf("creep.ticksToLive == creep.body.length");
        const block = em.slice(idx, idx + 2200);
        assert.include(block, "const rcl = creep.room.controller ? creep.room.controller.level : 0;");
        // the ternary line is the only permitted controller.level read
        const reads = block.match(/creep\.room\.controller\.level/g) || [];
        assert.strictEqual(reads.length, 1, "unguarded controller.level survives in the respawn chain");
    });
});

/**
 * Blast radius: the power-creep manager had no per-creep catch, so one bad PC
 * skipped every creep after it for the tick. The command queue spliced AFTER
 * dispatch, so a throwing formation re-fired every tick forever and starved
 * every command behind it.
 */
describe("containment", () => {
    it("RunPowerCreepManager catches per power creep", () => {
        const m = SRC("Managers/RunPowerCreepManager.ts");
        assert.include(m, "try {");
        assert.include(m, "catch (error: any)");
        assert.include(m, "Error running power creep");
    });

    it("ExecuteCommandsInNTicks splices before dispatch", () => {
        const m = SRC("Managers/ExecuteCommandsInNTicks.ts");
        const gate = m.indexOf("command.bucketNeeded <= Game.cpu.bucket");
        const splice = m.indexOf("commands.splice(index, 1);", gate);
        const firstDispatch = m.indexOf("global.SS(", gate);
        assert.isAbove(gate, -1);
        assert.isBelow(splice, firstDispatch, "splice still happens after dispatch");
        assert.include(m.slice(firstDispatch, firstDispatch + 2200), "catch (error: any)");
    });
});
