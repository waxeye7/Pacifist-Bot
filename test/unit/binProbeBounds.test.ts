import { assert } from "chai";
import fs from "fs";

/**
 * The recycle bin probe built `new RoomPosition(storage.x, storage.y + 1)`
 * with no bounds check. A storage at y=49 — legal in a claimed or manual
 * layout — makes RoomPosition throw and the whole recycle call dies. The
 * probe now requires y < 49 before constructing.
 */
const SRC = fs.readFileSync("src/Functions/creepFunctions.ts", "utf8")
    .replace(/[/][*][^]*?[*][/]/g, "").replace(/[/][/].*/g, "");

describe("recycle bin probe is bounds-checked", () => {
    it("requires storage.pos.y < 49 before y+1 construction", () => {
        const i = SRC.indexOf("storage.pos.y+1");
        assert.isAbove(i, -1);
        const before = SRC.slice(Math.max(0, i - 400), i);
        assert.include(before, "storage.pos.y < 49");
    });
});
