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
import { warEconomyBlocked } from "../../src/War/dispatch";
import { canFund, warMinBank, KIT_COST, WAR_MIN_BANK_HOME } from "../../src/War/kit";

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
        assert.match(SRC, /const ROAD_DRIP = [234]/);
        // drip placement runs before the budget gate
        const drip = SRC.indexOf("THE ROAD DRIP");
        const gate = SRC.indexOf("if (budget <= 0) return;");
        assert.isAbove(drip, -1);
        assert.isBelow(drip, gate, "the drip must run even when the budget is 0");
        // the strip preserves drip-many road sites so place-and-strip cannot churn
        assert.match(SRC, /nakedShell \|\| dripKept < ROAD_DRIP/);
    });

    it("core trails start at RCL2 and read the RCL3 stage set", () => {
        assert.match(SRC, /if \(lvl < 2\) return \[\];/);
        assert.match(SRC, /const stageLvl = lvl < 3 \? 3 : lvl;/,
            "plan.rs floors at 3 — comparing against 2 selects nothing");
        assert.match(SRC, /if \(lvl >= 2 && !spawnless && !nakedShell\) \{/, "the drip gate");
        assert.match(SRC, /if \(type === "road"\) return lvl >= 3;/,
            "placement/migration gate stays at 3 — RCL2 roads come from the drip only");
    });
});

describe("broke-clamp income exceptions", () => {
    it("a missing terminal opens its typed slot at a 3k bank, not half the RCL floor", () => {
        // E37N59 deadlock: a 2-source no-remote RCL6 netting <10/t can never
        // save the 15k half-floor, and the terminal is exactly the structure
        // that would fix that (market + neighbor energy arrive through it).
        const term = SRC.indexOf('termCap > 0 && terms < termCap && e >= 3000) return grant("terminal");');
        const extr = SRC.indexOf('extrCap > 0 && extrs < extrCap && e >= 5000) return grant("extractor");');
        assert.isAbove(term, -1, "terminal slot at the 3k bank floor");
        assert.isAbove(extr, term, "extractor slot at 5k, after terminal");
        assert.equal(SRC.indexOf('e >= floor / 2 && labCap > 0 && labs < labCap) return grant("lab");'), -1,
            "labs wait for LAB_PLACE_BANK, not the half-floor broke grant");
    });
});

describe("planV2 extractor key (minerals dead fleet-wide)", () => {
    it("construction sets Structures.extractor for planV2 rooms before the early return", () => {
        const CONSTR = fs.readFileSync(path.join(__dirname, "../../src/Rooms/rooms.construction.ts"), "utf8");
        const early = CONSTR.indexOf("placeFromPlanV2(room);");
        const key = CONSTR.indexOf("room.findExtractor();");
        assert.isAbove(early, -1);
        assert.isAbove(key, -1, "findExtractor is reachable for planV2 rooms");
        assert.isBelow(key, early, "…and it runs before the planV2 early return");
    });
});

describe("war economy gate", () => {
    let prevGame: any;
    let prevMemory: any;
    beforeEach(() => { prevGame = g.Game; prevMemory = g.Memory; });
    afterEach(() => { g.Game = prevGame; g.Memory = prevMemory; });

    function world(rooms: any, mem: any = {}, bucket = 10000, avg = 15) {
        g.Game = { time: 1000, rooms, creeps: {}, cpu: { bucket, limit: 20 } };
        g.Memory = { rooms: {}, creeps: {}, CPU: { hundredTickAvg: { avg } }, ...mem };
    }
    function room(level: number, bank: number | null) {
        return {
            controller: { my: true, level },
            storage: bank === null ? undefined : { my: true, store: { energy: bank } },
        };
    }

    it("a broke room no longer switches the EMPIRE off — the bank test is per home", () => {
        // 2026-08-26: "E37N59 bank 12191 < 20000" held every other room's
        // offence for days. A broke room is simply not picked as a home.
        world({ A: room(6, 5000), B: room(7, null) });
        assert.equal(warEconomyBlocked(), "");
    });

    it("blocks on a rescue, a low bucket, or an average already at the limit", () => {
        world({ A: room(6, 50000) }, { spawnRescue: "X" });
        assert.match(warEconomyBlocked(), /rescue/);
        world({ A: room(6, 50000) }, {}, 2500);
        assert.match(warEconomyBlocked(), /bucket 2500 < 3000/);
        world({ A: room(6, 50000) }, {}, 9000, 19.2);
        assert.match(warEconomyBlocked(), /cpu avg 19.2 >= 19/);
        world({ A: room(6, 50000) }, {}, 3000, 17);
        assert.equal(warEconomyBlocked(), "", "3000 is the shard3 bar, avg 17 has headroom");
    });

    it("per home: canFund refuses a storage room under warMinBank whatever the kit costs", () => {
        world({});
        const home = (bank: number) => ({
            storage: { my: true, store: { energy: bank } },
            terminal: null,
            energyAvailable: 1000, energyCapacityAvailable: 1800,
            memory: { spawnStall: 0 },
            find: () => [],
        }) as any;
        assert.strictEqual(warMinBank(), WAR_MIN_BANK_HOME);
        assert.isFalse(canFund(home(9000), KIT_COST.guardPrey), "3*650+2000 = 3950 clears, 10k floor does not");
        assert.isTrue(canFund(home(10000), KIT_COST.guardPrey));
        (g.Memory as any).war = { minBank: 20000 };
        assert.isFalse(canFund(home(15000), KIT_COST.guardPrey), "Memory.war.minBank raises the floor");
    });

    it("runDispatch consults the gate before issuing offence (source pin)", () => {
        const DISPATCH = fs.readFileSync(path.join(__dirname, "../../src/War/dispatch.ts"), "utf8");
        const gate = DISPATCH.indexOf("warEconomyBlocked();");
        const issue = DISPATCH.indexOf("pickKit(");
        assert.isAbove(gate, -1);
        assert.isBelow(gate, issue, "the economy gate must run before any kit is picked");
    });
});
