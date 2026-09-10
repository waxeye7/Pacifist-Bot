/**
 * findLocked() set the lock and returned nothing.
 *
 * Its one caller reads it as
 * `Game.getObjectById(creep.memory.locked) || findLocked(creep)`, so on the
 * tick the room first read energyAvailable == energyCapacityAvailable the
 * "everything is full, dump in the bank" branch wrote memory.locked and then
 * fell off the end returning undefined. `lock` came out falsy and run() went
 * to the else branch, which does nothing at all unless the STORAGE is also
 * full: a loaded creep standing in the hub issuing no intent, for one tick,
 * every time the network topped up.
 *
 * It self-healed on the next tick only because the memory write had landed,
 * which is exactly why it never surfaced as a wedge in any stuck detector.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const FF = fs
    .readFileSync(path.join(__dirname, "../../src/Roles/FakeFiller.ts"), "utf8")
    .replace(/\r\n/g, "\n");

describe("FakeFiller: findLocked hands back what it locked", () => {
    const at = FF.indexOf("function findLocked(creep) {");
    const body = FF.slice(at, FF.indexOf("\n}", at));

    it("the room-is-full branch returns the bank, not undefined", () => {
        assert.isAbove(at, -1);
        assert.include(body, "creep.memory.locked = bank ? bank.id : false;");
        assert.include(body, "return bank;");
        assert.notInclude(
            body,
            "creep.memory.locked = creep.room.memory.Structures.storage;",
            "storing the raw id and returning nothing is the defect"
        );
    });

    it("...and resolves it, so a stale Structures.storage cannot lock to nothing", () => {
        assert.include(body, "Game.getObjectById(creep.room.memory.Structures.storage) || creep.findStorage()");
    });

    it("the caller still treats a returned lock as this tick's target", () => {
        assert.include(FF, "let lock:any = Game.getObjectById(creep.memory.locked) || findLocked(creep);");
        assert.include(FF, "creep.MoveCostMatrixRoadPrio(lock, 1);");
    });
});
