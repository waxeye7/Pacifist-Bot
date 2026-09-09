/**
 * The RCL6 dead equilibrium, 2026-09-09 live audit (shard3, tick 82,860,768).
 *
 * Seven owned rooms, every bank between 6,942 and 21,737, and FIVE separate
 * subsystems all using 30,000 as their "this room is solvent" bar. The empire
 * was permanently on the wrong side of every gate, so the bot ran in its own
 * emergency mode 100% of the time: no site budget, parked upgraders, no
 * expensive furniture — while the things that SPEND (repairers, towers,
 * remotes) stayed on.
 *
 * These are the four pieces that were provably wrong rather than merely
 * mis-tuned, plus the two-ladders-one-job bugs found alongside them.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import { repairCeiling, wantsRepair } from "../../src/Roles/repair";
import { fillerBody, fillerPartCap, fillerName } from "../../src/Rooms/spawnSafety";
import { upgradeParkBand, donorReserve, donorSurplus, PARK_FLOOR_MIN } from "../../src/Empire/funnel";
import { rampartHitsTargetForRcl } from "../../src/Rooms/rooms.defence";

const g: any = global;
const SPAWNING = fs.readFileSync(path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
const PLANV2 = fs.readFileSync(path.join(__dirname, "../../src/utils/PlanV2.ts"), "utf8");
const FILLER = fs.readFileSync(path.join(__dirname, "../../src/Roles/filler.ts"), "utf8");

/** An RCL `lvl` room holding `bank` in a real storage. */
function room(lvl: number, bank: number, danger = false): any {
    return {
        name: "E35N58",
        memory: { danger },
        controller: { level: lvl },
        storage: { my: true, store: { energy: bank } },
        energyCapacityAvailable: lvl >= 8 ? 12900 : lvl >= 7 ? 5600 : lvl === 6 ? 2300 : 1800,
    };
}
const rampart = (hits: number, max = 30000000) => ({
    structureType: "rampart",
    hits,
    hitsMax: max,
});

describe("the repair ceiling (walls were unbounded)", () => {
    it("a thin RCL6 room maintains the shell at the UPKEEP bar, not hitsMax", () => {
        // The role's filter was `hits < hitsMax`. An RCL6 rampart caps at
        // 30,000,000, so a live repairer had no stop condition at all.
        assert.strictEqual(repairCeiling(room(6, 13846)), 100000);
        assert.isTrue(wantsRepair(room(6, 13846), rampart(3021)));
        assert.isFalse(wantsRepair(room(6, 13846), rampart(150000)));
        // ...and it certainly does not chase 30M.
        assert.isFalse(wantsRepair(room(6, 13846), rampart(29999999)));
    });

    it("a rich room gets the full owner ladder", () => {
        assert.strictEqual(repairCeiling(room(6, 150000)), rampartHitsTargetForRcl(6));
        assert.strictEqual(repairCeiling(room(7, 200000)), rampartHitsTargetForRcl(7));
        assert.isTrue(wantsRepair(room(6, 150000), rampart(150000)));
    });

    it("the ceiling never EXCEEDS the owner ladder — upkeep is a floor, not a raise", () => {
        // RCL4's target is 50k, below the 100k upkeep bar: the room must not
        // be pushed past what the ladder says its RCL is worth insuring.
        assert.strictEqual(repairCeiling(room(4, 10000)), rampartHitsTargetForRcl(4));
        assert.strictEqual(repairCeiling(room(3, 10000)), rampartHitsTargetForRcl(3));
    });

    it("danger lifts the cap — under siege the shell IS the room", () => {
        assert.strictEqual(repairCeiling(room(6, 1000, true)), Infinity);
        assert.isTrue(wantsRepair(room(6, 1000, true), rampart(29999999)));
        assert.isFalse(wantsRepair(room(6, 1000, true), rampart(30000000)));
    });

    it("non-wall structures are unaffected — a decaying road/tower repairs to full", () => {
        const tower = { structureType: "tower", hits: 2000, hitsMax: 3000 };
        assert.isTrue(wantsRepair(room(6, 1000), tower));
        assert.isFalse(wantsRepair(room(6, 1000), { ...tower, hits: 3000 }));
    });

    it("a lock is dropped at the ceiling, not only at hitsMax", () => {
        // Without this a lock taken on a 3k rampart was held for the creep's
        // whole life: findLocked's ceiling only applied to targets it PICKED.
        const i = SPAWNING.length; // keep lint quiet about unused width
        assert.isAbove(i, 0);
        const SRC = fs.readFileSync(path.join(__dirname, "../../src/Roles/repair.ts"), "utf8");
        const relock = SRC.indexOf("else if(!wantsRepair(creep.room, repairTarget))");
        assert.isAbove(relock, -1, "the ceiling must also drop a held lock");
    });

    it("no target under the ceiling parks instead of draining a tower to stand still", () => {
        const SRC = fs.readFileSync(path.join(__dirname, "../../src/Roles/repair.ts"), "utf8");
        // Newline-agnostic: git normalises this repo's LF to CRLF on checkout,
        // so a literal "\n" in the needle fails on a fresh clone.
        const park = SRC.search(/if\(!creep\.memory\.locked\)\s*\{\s*creep\.idlePark\(\);/);
        const towerTopUp = SRC.indexOf("!creep.memory.repairing && (!creep.room.memory.danger");
        assert.isAbove(park, -1, "an idle repairer must park");
        assert.isAbove(towerTopUp, -1, "the tower top-up block should still exist");
        assert.isBelow(park, towerTopUp, "...before it can reach the tower top-up");
    });
});

describe("the filler ladder (there were two, and they disagreed)", () => {
    before(() => {
        g.Game = g.Game || {};
        g.Game.time = 82860768;
        g.CARRY = "carry";
        g.MOVE = "move";
    });

    it("scales with the room instead of being a hardcoded 200 carry", () => {
        // RCL5 and RCL6 both shipped [4C,2M] — 200 carry — while RCL7 hand-wrote
        // 400 and RCL8 hand-wrote 800. The ladder stepped everywhere except
        // across the level where extensions go 30 -> 40.
        const carry = (b: any[]) => b.filter((p) => p === "carry").length * 50;
        assert.isAbove(carry(fillerBody(room(6, 20000))), 200);
        assert.isAbove(carry(fillerBody(room(7, 20000))), carry(fillerBody(room(6, 20000))));
        assert.isAbove(carry(fillerBody(room(8, 20000))), carry(fillerBody(room(7, 20000))));
    });

    it("keeps 2:1 CARRY:MOVE from RCL5 — road speed loaded", () => {
        for (const lvl of [5, 6, 7, 8]) {
            const b = fillerBody(room(lvl, 20000));
            const c = b.filter((p) => p === "carry").length;
            const m = b.filter((p) => p === "move").length;
            assert.strictEqual(c, m * 2, "RCL" + lvl + " must be 2:1");
        }
    });

    it("...but RCL4 stays 1:1, because its extension ring is not paved", () => {
        const b = fillerBody(room(4, 20000));
        assert.strictEqual(b.filter((p) => p === "carry").length, b.filter((p) => p === "move").length);
    });

    it("never exceeds the part cap (spawn time is 3 ticks/part)", () => {
        for (const lvl of [5, 6, 7, 8]) {
            assert.isAtMost(fillerBody(room(lvl, 20000)).length, fillerPartCap(lvl));
        }
    });

    it("never emits a body the room cannot afford, and never emits nothing", () => {
        const cost = (b: any[]) => b.length * 50;
        for (const lvl of [1, 2, 3, 4, 5, 6, 7, 8]) {
            const r = room(lvl, 0);
            const b = fillerBody(r);
            assert.isAbove(b.length, 0, "RCL" + lvl + " must always get a body");
            if (lvl >= 5) assert.isAtMost(cost(b), r.energyCapacityAvailable);
        }
    });

    it("a room whose capacity collapsed still gets a minimum shuttle", () => {
        const wrecked = { controller: { level: 6 }, energyCapacityAvailable: 300 };
        assert.deepEqual(fillerBody(wrecked), ["carry", "carry", "move"]);
    });

    it("ONE spelling: the handoff no longer names its replacement `filler-`", () => {
        // Every head-of-line safety net in rooms.spawning is
        // startsWith("Filler") and is case-sensitive, so the lowercase name
        // meant the path that replaces a room's LAST filler was the only
        // filler the stalled-head shredder could eat.
        assert.notInclude(FILLER, "'filler-'");
        assert.include(fillerName({ name: "E35N58" }), "Filler-");
    });

    it("the handoff and the producer rung read the SAME ladder", () => {
        assert.include(FILLER, "fillerBody(creep.room)");
        assert.notInclude(FILLER, "unshift([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE]");
        // ...and NO rung hardcodes a filler body any more, at any RCL. Eight
        // rungs, one ladder — that is the whole point of the change.
        const rungs = SPAWNING.split("filler_creep: {").slice(1);
        assert.strictEqual(rungs.length, 8, "one rung per RCL");
        for (const r of rungs) {
            const body = r.slice(0, r.indexOf("},"));
            assert.include(body, "fillerBody(room)", "every rung must use the shared ladder");
        }
    });
});

describe("the upgrader and the CLF must not park each other into a deadlock", () => {
    before(() => {
        g.Memory = g.Memory || {};
        (g.Memory as any).funnel = { mother: "E37N59" };
    });

    it("a thin donor keeps upgrading — the park floor is not the SHIPPING floor", () => {
        // Live E38N56, E36N57, E35N59 and E37N58 each had BOTH their upgrader
        // and their ControllerLinkFiller flagged bankParked at once. The CLF is
        // the only thing that stocks the depot the upgrader waits at, so the
        // "parked creeps still live on link income" premise was false and
        // E38N56's controller progress did not move at all.
        assert.deepEqual(upgradeParkBand({ name: "E38N56", controller: { level: 6 } }), {
            floor: PARK_FLOOR_MIN,
            resume: PARK_FLOOR_MIN + 2000,
        });
    });

    it("every room shares one floor — mother and donor, RCL6 and RCL7 alike", () => {
        const bands = [
            upgradeParkBand({ name: "E37N59", controller: { level: 7 } }),
            upgradeParkBand({ name: "E38N56", controller: { level: 6 } }),
            upgradeParkBand({ name: "E35N58", controller: { level: 8 } }),
        ];
        for (const b of bands) assert.deepEqual(b, bands[0]);
    });

    it("the park floor is BELOW the shipping floor, or a thin room stops upgrading", () => {
        // This is the whole bug in one assertion: reusing donorReserve as the
        // park floor made a room stop converting energy to GCL before it
        // stopped exporting it.
        for (const lvl of [6, 7, 8]) {
            assert.isBelow(upgradeParkBand({ name: "E38N56", controller: { level: lvl } }).floor, donorReserve(lvl));
        }
    });

    it("the funnel is unharmed: donorSurplus still refuses to ship below the reserve", () => {
        // Lowering the PARK floor cannot cause over-shipping, because the
        // shipping decision never read the park band.
        assert.strictEqual(donorSurplus(donorReserve(6) - 1, 6), 0);
        assert.strictEqual(donorSurplus(PARK_FLOOR_MIN, 6), 0);
        assert.strictEqual(donorSurplus(donorReserve(6) + 5000, 6), 5000);
    });

    it("the hysteresis band still has width, so the floor cannot flap", () => {
        const b = upgradeParkBand({ name: "E38N56", controller: { level: 6 } });
        assert.isAbove(b.resume, b.floor);
    });
});

describe("the broke site clamp must not lock out a link", () => {
    it("a missing link earns the same typed exception terminal and extractor do", () => {
        const fn = PLANV2.slice(PLANV2.indexOf("function maxSitesFor"));
        const body = fn.slice(0, fn.indexOf("\n}"));
        assert.include(body, 'return grant("terminal")');
        assert.include(body, 'return grant("extractor")');
        assert.include(body, 'return grant("link")', "a core-complete broke room could never site its controller link");
    });

    it("the link grant is ordered AFTER terminal and extractor", () => {
        const fn = PLANV2.slice(PLANV2.indexOf("function maxSitesFor"));
        assert.isAbove(fn.indexOf('grant("link")'), fn.indexOf('grant("terminal")'));
        assert.isAbove(fn.indexOf('grant("link")'), fn.indexOf('grant("extractor")'));
    });

    it("it is gated on the link's own build cost, not on the 30k floor", () => {
        const fn = PLANV2.slice(PLANV2.indexOf("function maxSitesFor"));
        const line = fn.slice(fn.indexOf("linkCap > 0"));
        assert.include(line.slice(0, 120), "e >= 5000");
    });

    it("the broke keep-set already protects a link site, so this cannot churn", () => {
        const keep = PLANV2.slice(PLANV2.indexOf("export function brokeKeepsSite"));
        assert.include(keep.slice(0, 900), "STRUCTURE_LINK");
    });
});

describe("the RCL6 repairer must be a body the room can buy", () => {
    it("no longer 2,150 energy against a 2,300 capacity", () => {
        const rcl6 = SPAWNING.slice(SPAWNING.indexOf("        6: () => ({"));
        const rung = rcl6.slice(rcl6.indexOf("repair_creep: {"));
        const block = rung.slice(0, rung.indexOf("},"));
        // Read the CODE lines, not the comment that quotes the old values.
        const code = block
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => /^(amount|body):/.test(l));
        assert.deepEqual(code, ["amount: 1,", "body:   getBody([WORK,WORK,CARRY,MOVE], room, 20),"]);
    });

    it("Repair- stays OFF the head-of-line exemption list — it is optional", () => {
        // The fix is affordability, not exemption: a repairer must never block
        // the hatchery. Only the affordable-body change stops the coin flip.
        const shred = SPAWNING.slice(SPAWNING.indexOf("SHRED_STALLED_HEAD_AFTER"));
        const guard = shred.slice(0, shred.indexOf("|| _.sum(segment"));
        assert.notInclude(guard, 'startsWith("Repair-")');
    });
});

describe("one name, one meaning", () => {
    it("rooms.spawning's storage-only helper is not called bankEnergy", () => {
        // Rooms/spawnSafety and War/kit both define bankEnergy as storage PLUS
        // terminal. This file's version was storage alone, and the two were
        // compared against the same 30,000: live E35N58 held 21,737 + 9,225 =
        // 30,962, so the funnel called it solvent while every rung here called
        // it too poor to upgrade, build furniture or hold a site.
        assert.notInclude(SPAWNING, "function bankEnergy");
        assert.include(SPAWNING, "function storageEnergy");
    });

    it("the two surviving bankEnergy definitions still mean storage PLUS terminal", () => {
        const SAFETY = fs.readFileSync(path.join(__dirname, "../../src/Rooms/spawnSafety.ts"), "utf8");
        const KIT = fs.readFileSync(path.join(__dirname, "../../src/War/kit.ts"), "utf8");

        const safety = SAFETY.slice(SAFETY.indexOf("export function bankEnergy"));
        assert.include(safety.slice(0, safety.indexOf("\n}")), "room.terminal");

        // War/kit delegates to storeOf, so the terminal must be in THERE.
        const kitFn = KIT.slice(KIT.indexOf("function bankEnergy"));
        assert.include(kitFn.slice(0, kitFn.indexOf("\n}")), "storeOf(room, RESOURCE_ENERGY)");
        const storeOf = KIT.slice(KIT.indexOf("function storeOf"));
        assert.include(storeOf.slice(0, storeOf.indexOf("\n}")), "room.terminal");
    });
});

describe("bucket gates the bot can actually reach", () => {
    it("bounded infrastructure work shares ONE floor, above the crisis bar", () => {
        const POLICY = fs.readFileSync(path.join(__dirname, "../../src/utils/CpuPolicy.ts"), "utf8");
        const m = /REMOTE_INFRA_BUCKET = (\d+)/.exec(POLICY);
        assert.isNotNull(m);
        const floor = Number(m && m[1]);
        // Live shard3 holds a stable 3,357-3,595 bucket on a 20 CPU limit, so
        // the old 3,500 (construction) and 5,000 (remote roads) were a coin
        // flip and a never. Must still sit clear of the 1,500 crisis bar.
        assert.isBelow(floor, 3357, "must be under the bucket the bot actually runs at");
        assert.isAbove(floor, 1500, "must stay clear of CPU_CRISIS_BUCKET");
    });

    it("the room loop reads the shared floor, not its own numbers", () => {
        const ROOMS = fs.readFileSync(path.join(__dirname, "../../src/Rooms/rooms.ts"), "utf8");
        assert.include(ROOMS, "bucket > REMOTE_INFRA_BUCKET && room.controller.level >= 4");
        assert.include(ROOMS, "Game.time % constructionInterval == 0 && bucket > REMOTE_INFRA_BUCKET");
        assert.notInclude(ROOMS, "bucket > 5000 && room.controller.level >= 4");
    });

    it("Remote_Roads_Tick is still bounded to one pass per room per tick", () => {
        // The low floor is only defensible while this holds.
        const CONSTRUCTION = fs.readFileSync(path.join(__dirname, "../../src/Rooms/rooms.construction.ts"), "utf8");
        const fn = CONSTRUCTION.slice(CONSTRUCTION.indexOf("function Remote_Roads_Tick"));
        const body = fn.slice(0, fn.indexOf("\n}"));
        assert.include(body, "return; // one remote per room per tick");
        assert.include(body, "REMOTE_ROAD_PASS_EVERY");
        assert.match(CONSTRUCTION, /REMOTE_ROAD_PASS_EVERY = (\d{3,})/);
    });
});
