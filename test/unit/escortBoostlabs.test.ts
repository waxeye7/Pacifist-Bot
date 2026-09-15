import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

/**
 * The Escort party filter admits members with `memory.boostlabs` undefined
 * (a claimer/RoomLocker spawned without the field, or one whose labs already
 * drained), but the movement branches then dereferenced
 * `partyMember.memory.boostlabs.length` — a TypeError every tick that
 * wedged the whole convoy.
 */
const SRC = fs.readFileSync(
    path.join(__dirname, "../../src/Roles/Escort.ts"), "utf8"
).replace(/\r\n/g, "\n");

describe("Escort party boostlabs guard", () => {
    it("no branch dereferences boostlabs.length unguarded", () => {
        const re = /!\s*partyMember\.memory\.boostlabs\.length/;
        assert.notMatch(SRC, re, "unguarded boostlabs.length read remains");
    });

    it("line-1 and line-2 members both check the guarded form", () => {
        const guarded =
            /!\(partyMember\.memory\.boostlabs && partyMember\.memory\.boostlabs\.length\)/g;
        const hits = SRC.match(guarded) || [];
        assert.isAtLeast(hits.length, 2, "both member branches guarded");
    });
});
