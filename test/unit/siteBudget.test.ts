/**
 * Site-budget starvation fixes (2026-08-19 live audit): labs were dead last
 * behind the ENTIRE road array, and roads themselves got zero slots in any
 * room whose budget was eaten by containers/extensions (all four live rooms).
 * Plus the war economy gate: no NEW offence while any owned RCL4+ room is
 * broke, a rescue is running, or the bucket is low.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import { warEconomyBlocked, WAR_MIN_BANK } from "../../src/War/dispatch";

const g: any = global;
const SRC = fs.readFileSync(path.join(__dirname, "../../src/utils/PlanV2.ts"), "utf8");

describe("placement order and the road drip", () => {
    it("lab is sited BEFORE the road array (W1N1: labs never finished behind 80+ roads)", () => {
        const order = SRC.indexOf("const PLACE_ORDER");
        const block = SRC.slice(order, order + 400);
        const lab = block.indexOf('"lab"');
        const road = block.indexOf('"road"');
        const rampart = block.indexOf('"rampart"');
        assert.isAbove(lab, -1);
        assert.isAbove(road, -1);
        assert.isBelow(lab, road, "lab must come before road in PLACE_ORDER");
        assert.isBelow(rampart, lab, "shell still outranks labs");
    });

    it("roads trickle outside the shared budget, and the broke strip keeps the same number", () => {
        assert.match(SRC, /const ROAD_DRIP = [23]/);
        // drip placement runs before the budget gate
        const drip = SRC.indexOf("THE ROAD DRIP");
        const gate = SRC.indexOf("if (budget <= 0) return;");
        assert.isAbove(drip, -1);
        assert.isBelow(drip, gate, "the drip must run even when the budget is 0");
        // the strip preserves drip-many road sites so place-and-strip cannot churn
        assert.match(SRC, /STRUCTURE_ROAD && dripKept < ROAD_DRIP/);
    });
});

describe("war economy gate", () => {
    let prevGame: any;
    let prevMemory: any;
    beforeEach(() => { prevGame = g.Game; prevMemory = g.Memory; });
    afterEach(() => { g.Game = prevGame; g.Memory = prevMemory; });

    function world(rooms: any, mem: any = {}, bucket = 10000) {
        g.Game = { time: 1000, rooms, creeps: {}, cpu: { bucket, limit: 20 } };
        g.Memory = { rooms: {}, creeps: {}, ...mem };
    }
    function room(level: number, bank: number | null) {
        return {
            controller: { my: true, level },
            storage: bank === null ? undefined : { my: true, store: { energy: bank } },
        };
    }

    it("clear when every owned RCL4+ room holds the bank floor", () => {
        world({ A: room(6, 50000), B: room(4, WAR_MIN_BANK), C: room(3, null) });
        assert.equal(warEconomyBlocked(), "");
    });

    it("blocks on a broke room, a storageless RCL4+ room, a rescue, or a low bucket", () => {
        world({ A: room(6, 5000) });
        assert.match(warEconomyBlocked(), /A bank 5000/);
        world({ A: room(7, null) });
        assert.match(warEconomyBlocked(), /A bank 0/, "no storage at RCL4+ counts as bank 0 — the W1N2 shape");
        world({ A: room(6, 50000) }, { spawnRescue: "X" });
        assert.match(warEconomyBlocked(), /rescue/);
        world({ A: room(6, 50000) }, {}, 3000);
        assert.match(warEconomyBlocked(), /bucket 3000/);
    });

    it("ignores RCL<4 rooms and foreign rooms; Memory.war.minBank tunes the floor", () => {
        world({ A: room(3, null), B: { controller: { my: false, level: 8 } }, C: room(6, 9000) },
            { war: { minBank: 8000 } });
        assert.equal(warEconomyBlocked(), "");
        (g.Memory as any).war.minBank = 10000;
        assert.match(warEconomyBlocked(), /C bank 9000 < 10000/);
    });

    it("runDispatch consults the gate before issuing offence (source pin)", () => {
        const DISPATCH = fs.readFileSync(path.join(__dirname, "../../src/War/dispatch.ts"), "utf8");
        const gate = DISPATCH.indexOf("warEconomyBlocked();");
        const issue = DISPATCH.indexOf("pickKit(");
        assert.isAbove(gate, -1);
        assert.isBelow(gate, issue, "the economy gate must run before any kit is picked");
    });
});
