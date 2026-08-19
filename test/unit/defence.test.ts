/**
 * Safe-mode breach bar is 75% of what the shell was built to, not the
 * new RCL's repair target. A complete previous-RCL shell is an undamaged camp.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import {
    rampartHitsTargetForRcl,
    rampartHitsTarget,
    safeModeBreachHits,
} from "../../src/Rooms/rooms.defence";

describe("rampartHitsTarget", () => {
    it("matches the per-RCL repair rungs", () => {
        assert.strictEqual(rampartHitsTargetForRcl(3), 5000);
        assert.strictEqual(rampartHitsTargetForRcl(6), 100000);
        assert.strictEqual(rampartHitsTargetForRcl(7), 300000);
        assert.strictEqual(rampartHitsTargetForRcl(8), 15255000);
        assert.strictEqual(rampartHitsTarget({ controller: { level: 7 } }), 300000);
    });
});

describe("safeModeBreachHits", () => {
    it("uses the previous-RCL shell after RCL6→7, not 75% of 300k", () => {
        // Complete 100k RCL6 shell vs old 225k (new-RCL) bar.
        assert.strictEqual(safeModeBreachHits(7, 100000), 75000);
        assert.isBelow(safeModeBreachHits(7, 100000), 100000);
        assert.notEqual(safeModeBreachHits(7, 100000), Math.floor(300000 * 0.75));
    });

    it("uses the previous-RCL shell after RCL7→8, not the 750k absolute", () => {
        // Complete 300k RCL7 shell vs old 750k bar.
        assert.strictEqual(safeModeBreachHits(8, 300000), 225000);
        assert.isBelow(safeModeBreachHits(8, 300000), 300000);
        assert.notEqual(safeModeBreachHits(8, 300000), 750000);
    });

    it("does not treat a young unfinished shell as breached", () => {
        assert.strictEqual(safeModeBreachHits(6, 30000), 22500);
        assert.isBelow(safeModeBreachHits(6, 30000), 30000);
    });

    it("keeps the 750k cap on an established RCL8 shell", () => {
        assert.strictEqual(safeModeBreachHits(8, 15255000), 750000);
    });

    it("falls back to the previous RCL target when no hits are known", () => {
        assert.strictEqual(safeModeBreachHits(7, 0), 75000);
        assert.strictEqual(safeModeBreachHits(8, 0), 225000);
    });

    it("hasDamagedRamparts uses safeModeBreachHits, not 75% of the new target", () => {
        const DEFENCE = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.defence.ts"), "utf8");
        assert.include(DEFENCE, "safeModeBreachHits(");
        assert.notInclude(DEFENCE, "Math.floor(rampartHitsTarget(room) * 0.75)");
    });
});
