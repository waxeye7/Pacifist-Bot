/**
 * Recycling threw the cargo on the floor, and nothing could pick it up.
 *
 * StructureSpawn.recycleCreep() and Creep.suicide() both DROP the creep's store
 * where it stands. Creep.prototype.recycle reaches one or the other down five
 * separate paths (bin-adjacent spawn, stale bin, no spawns, derivable storage,
 * planV2 no-bin) and none of them emptied the creep first.
 *
 * Live shard3 2026-09-11, tick 82,882,379 — three piles on the ground in three
 * different rooms at the same instant:
 *
 *   E37N59  (30,8)   405
 *   E35N59  (27,21)  434   <- one tile from Spawn2
 *   E39N58  (8,42)   429
 *
 * (27,21) is adjacent to the spawn recycle() walks a creep to and kills it at.
 * Nothing sweeps any of them: Roles/sweeper is in OPTIONAL_CREEP_ROLES and
 * optionalRosterOpen() has been shut for as long as the bucket has been under
 * 5,000, so 1,280 energy sat rotting at one hit a tick with no role able to
 * reach it.
 *
 * The callers make this routine rather than rare: ControllerLinkFiller suicides
 * on `_noSink > 150` while holding up to 800, and the remote recall path brings
 * loaded haulers home to be recycled.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const CF = fs
    .readFileSync(path.join(__dirname, "../../src/Functions/creepFunctions.ts"), "utf8")
    .replace(/\r\n/g, "\n");

const recycleBody = CF.slice(
    CF.indexOf("Creep.prototype.recycle = function recycle() {"),
    CF.indexOf("let StructuresObject = this.room.memory.Structures;")
);

describe("a creep hands its load back before it is recycled", () => {
    it("the dump runs before every kill path", () => {
        // there are five of them below this point; guarding each one
        // separately is how one of them gets missed.
        assert.include(recycleBody, "const held = this.store ? this.store.getUsedCapacity() : 0;");
        assert.include(recycleBody, "if(held >= RECYCLE_DUMP_MIN) {");
        const dump = CF.indexOf("if(held >= RECYCLE_DUMP_MIN) {");
        for (const kill of ["recycleCreep(this)", "this.suicide();"]) {
            assert.isBelow(dump, CF.indexOf(kill, dump), "dump must precede " + kill);
        }
    });

    it("...but after the walk home, so the load lands in its own hub", () => {
        const home = CF.indexOf("return this.moveToRoomAvoidEnemyRooms(this.memory.homeRoom);");
        const dump = CF.indexOf("if(held >= RECYCLE_DUMP_MIN) {");
        assert.isAbove(dump, home);
    });

    it("takes any sink the room actually has", () => {
        assert.include(recycleBody, "const sink: any = this.room.storage");
        assert.include(recycleBody, "|| Game.getObjectById(S.storage)");
        assert.include(recycleBody, "|| this.room.terminal");
        assert.include(recycleBody, "|| Game.getObjectById(S.bin);");
        assert.include(recycleBody, "sink.store.getFreeCapacity() > 0");
    });

    it("moves every resource, not just energy", () => {
        // a recalled mineral hauler or an unboosted creep carries other things
        assert.include(recycleBody, "for(const res in this.store) {");
        assert.include(recycleBody, "this.transfer(sink, res as ResourceConstant);");
    });

    it("is bounded — an unreachable hub is not immortality", () => {
        assert.include(recycleBody, "this.memory._recDump = (this.memory._recDump || 0) + 1;");
        assert.include(recycleBody, "if(this.memory._recDump <= RECYCLE_DUMP_TICKS) {");
        const t = CF.match(/const RECYCLE_DUMP_TICKS = (\d+);/);
        assert.isNotNull(t);
        assert.isAtLeast(Number(t![1]), 20, "long enough to cross a base");
        assert.isAtMost(Number(t![1]), 200, "short enough that it still dies");
    });

    it("does not walk a creep across the room for scraps", () => {
        const m = CF.match(/const RECYCLE_DUMP_MIN = (\d+);/);
        assert.isNotNull(m);
        assert.isAtLeast(Number(m![1]), 1);
        assert.isAtMost(Number(m![1]), 200);
    });
});
