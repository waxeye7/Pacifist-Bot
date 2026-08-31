/**
 * 2026-09-01: labs wait for 100k spendable bank; Guards never enter owned rooms.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import { brokeKeepsSite, labBank, LAB_PLACE_BANK, NUKER_PLACE_BANK, furnitureBankNeeded } from "../../src/utils/PlanV2";

describe("labBank", () => {
    it("is my storage energy only — terminal is not build() fuel", () => {
        assert.equal(labBank({ storage: { my: true, store: { energy: 20000 } } }), 20000);
        assert.equal(
            labBank({
                storage: { my: true, store: { energy: 35000 } },
                terminal: { my: true, store: { energy: 70000 } },
            }),
            35000,
            "35k storage + 70k terminal used to pass LAB_PLACE_BANK",
        );
        assert.equal(labBank({ storage: { my: false, store: { energy: 99999 } } }), 0);
        assert.isAtLeast(LAB_PLACE_BANK, 100000);
        assert.isAtLeast(NUKER_PLACE_BANK, 200000);
    });
});

describe("furnitureBankNeeded", () => {
    it("labs wait for 100k at RCL6 and the unlatch bar at RCL8", () => {
        assert.equal(furnitureBankNeeded(STRUCTURE_LAB, 30000), LAB_PLACE_BANK);
        assert.equal(furnitureBankNeeded("lab", 30000), LAB_PLACE_BANK);
        assert.equal(furnitureBankNeeded(STRUCTURE_LAB, 150000), 165000);
    });
    it("nuker waits for 2x cost; observer only needs the unlatch bar", () => {
        assert.equal(furnitureBankNeeded(STRUCTURE_NUKER, 150000), NUKER_PLACE_BANK);
        assert.equal(furnitureBankNeeded(STRUCTURE_OBSERVER, 150000), 165000);
        assert.equal(furnitureBankNeeded(STRUCTURE_EXTENSION, 30000), 0);
    });
});

describe("brokeKeepsSite: labs are furniture", () => {
    it("never keeps a lab while broke, whatever the storage number", () => {
        assert.isFalse(brokeKeepsSite(STRUCTURE_LAB, 20000, 30000, false));
        assert.isFalse(brokeKeepsSite(STRUCTURE_LAB, 200000, 150000, false));
        assert.isTrue(brokeKeepsSite(STRUCTURE_TERMINAL, 0, 30000, false));
    });
});

describe("Guards stay out of owned rooms", () => {
    const SGD = fs.readFileSync(path.join(__dirname, "../../src/utils/Commands.ts"), "utf8");
    const GUARD = fs.readFileSync(path.join(__dirname, "../../src/Roles/Guard.ts"), "utf8");
    const REINFORCE = fs.readFileSync(path.join(__dirname, "../../src/War/reinforce.ts"), "utf8");
    const KIT = fs.readFileSync(path.join(__dirname, "../../src/War/kit.ts"), "utf8");

    it("SGD refuses a destination we own", () => {
        assert.include(SGD, "if (dest && dest.controller && dest.controller.my) return \"Failed to spawn\";");
    });

    it("SMDP is a no-op (it only ever spawned Guards into our RCL3-5 rooms)", () => {
        const at = SGD.indexOf("global.SMDP = function");
        const body = SGD.slice(at, SGD.indexOf("global.SCCK", at));
        assert.include(body, "return \"Fail\";");
        assert.notInclude(body, "spawn_list.push");
    });

    it("a Guard whose target is ours recycles", () => {
        assert.include(GUARD, "if (dest && dest.controller && dest.controller.my)");
        assert.include(GUARD, "creep.recycle()");
    });

    it("reinforce does not SGD", () => {
        assert.notInclude(REINFORCE, "global.SGD(");
    });

    it("pickKit drops our own rooms before any kit", () => {
        assert.include(KIT, "if (rec.o && rec.o === myUsername()) return kit(\"none\", \"\", target, \"self\");");
    });
});
