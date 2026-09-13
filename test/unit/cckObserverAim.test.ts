/**
 * A dying ContinuousControllerKiller aims the home observer's round-robin at
 * the room it just attacked, so the sweep sees the damage next cycle. The
 * write it makes is `observe.lastObserved = index - 1` over
 * `RoomsToSee.indexOf(targetRoom)`.
 *
 * Two silent failures lived inside that one line:
 *
 * 1. `Game.rooms[homeRoom].memory.observe` only exists once the home room has
 *    run an observe pass — i.e. it owns an observer structure AND
 *    Game.cpu.bucket cleared 8000 at least once. A CCK dying while its home
 *    room had neither threw `TypeError: Cannot read property 'RoomsToSee' of
 *    undefined` on its final tick, every time.
 *
 * 2. A CCK target is an enemy room, usually OUTSIDE the observer's sweep box,
 *    so `indexOf` returns -1 and the role wrote `lastObserved = -2`. The
 *    observer's recovery check is `!lastObserved || lastObserved >= length`
 *    — `-2` is truthy and fails both halves — so `RoomsToSee[-2]` evaluated
 *    to `undefined`, `observeRoom(undefined)` failed, and the same thing
 *    happened again at `-1` before the cursor healed at 0. Every CCK death
 *    burned two observe slots on garbage.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const SRC = (p: string) =>
    fs.readFileSync(path.join(__dirname, "../../src/", p), "utf8").replace(/\r\n/g, "\n");
const CCK = SRC("Roles/ContinuousControllerKiller.ts");

describe("CCK death-time observer aim", () => {
    it("does not dereference observe memory that may not exist", () => {
        // The home room may be unowned this tick or may never have run an
        // observe pass. The chain must be walked with guards, not assumed.
        assert.notMatch(
            CCK,
            /Game\.rooms\[creep\.memory\.homeRoom\]\.memory\.observe\.RoomsToSee/,
            "bare memory.observe.RoomsToSee dereference throws when observe is unseeded",
        );
    });

    it("never writes lastObserved from a -1 index", () => {
        // indexOf(targetRoom) === -1 means the target is outside the sweep;
        // the correct action is to leave the cursor alone, not to write -2.
        assert.match(
            CCK,
            /index\s*===?\s*0[\s\S]*?else if\s*\(\s*index\s*>\s*0\s*\)\s*\{[\s\S]*?lastObserved\s*=\s*index\s*-\s*1/,
            "the `index - 1` write must live inside an `index > 0` guard",
        );
        assert.notMatch(
            CCK,
            /else\s*\{\s*\n?\s*[^\n]*lastObserved\s*=\s*index\s*-\s*1/,
            "an unconditional else-branch write stores -2 on a miss",
        );
    });
});
