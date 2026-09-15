import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

// Guard's GoToController keyed its cached path on fields a bare RoomPosition
// does not have: MoveTargetId != target.id with target.id undefined and
// target.roomName !== room.name both forced a fresh PathFinder.search plus a
// fresh 2500-tile cost matrix on EVERY tick of a chase. The fix passes the
// creep object (has .id and .pos.roomName) and memoizes the matrix per tick.
describe("Guard chase path caching", function () {
    const src = readFileSync(join(__dirname, "../../src/Roles/Guard.ts"), "utf8");

    it("passes the target object, not its position", function () {
        const start = src.indexOf("function killCreepsInroom");
        const slice = src.slice(start, start + 900);
        expect(slice).to.include("GoToController(creep, closestEnemyCreep, 1)");
        expect(slice).to.not.include("closestEnemyCreep.pos,");
    });

    it("checks the room through the target position", function () {
        const start = src.indexOf("function GoToController");
        const slice = src.slice(start, start + 2500);
        expect(slice).to.include("dest.roomName !== creep.room.name");
        expect(slice).to.not.include("target.roomName");
    });

    it("memoizes the controller cost matrix per room per tick", function () {
        const start = src.indexOf("const GoToTheController");
        const slice = src.slice(start, start + 1200);
        expect(slice).to.include("guardMatrixCache[roomName]");
        expect(slice).to.include("hit.tick === Game.time");
        // and the built matrix lands back in the cache before return
        const tail = src.slice(src.indexOf("guardMatrixCache[roomName] = { tick: Game.time, costs };") - 600);
        expect(tail).to.include("return costs;");
    });
});
