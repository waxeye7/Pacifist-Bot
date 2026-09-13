import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

// GoToController is the same copy-pasted pather in FreedomFighter and
// DismantleControllerWalls (Guard got the fix first). FF passed
// controller.pos — no .id on a RoomPosition, so MoveTargetId never set and
// the path re-searched every tick with a fresh 2500-tile matrix. DCW had an
// unguarded path[0] — an empty search result crashed getDirectionTo every
// tick while the controller stayed unreachable. Both get the memoized
// matrix and the !pos early return.
describe("GoToController family fixes", function () {
    const ff = readFileSync(join(__dirname, "../../src/Roles/Party/FreedomFighter.ts"), "utf8");
    const dcw = readFileSync(join(__dirname, "../../src/Roles/DismantleControllerWalls.ts"), "utf8");

    it("FreedomFighter passes the controller object, not .pos", function () {
        expect(ff).to.include("GoToController(creep, controller, 3)");
        expect(ff).to.not.include("controller.pos, 3");
    });

    it("both pathers key the room check off the destination position", function () {
        for (const [name, src] of [["ff", ff], ["dcw", dcw]] as const) {
            const start = src.indexOf("function GoToController");
            const slice = src.slice(start, start + 1500);
            expect(slice, name).to.not.include("target.roomName !== creep.room.name");
        }
    });

    it("both bail out on an empty path instead of crashing", function () {
        for (const [name, src] of [["ff", ff], ["dcw", dcw]] as const) {
            const start = src.indexOf("function GoToController");
            const slice = src.slice(start, start + 2000);
            expect(slice, name).to.include("if(!pos) return;");
            expect(slice, name).to.not.match(/let pos = creep\.memory\.path\[0\];/);
        }
    });

    it("both memoize the matrix per room per tick", function () {
        expect(ff).to.include("ffMatrixCache[roomName] = { tick: Game.time, costs };");
        expect(dcw).to.include("dcwMatrixCache[roomName] = { tick: Game.time, costs };");
        for (const [name, src] of [["ff", ff], ["dcw", dcw]] as const) {
            const start = src.indexOf("const GoToTheController");
            const slice = src.slice(start, start + 700);
            expect(slice, name).to.include("hit.tick === Game.time");
        }
    });
});
