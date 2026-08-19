/**
 * Three fixes from the 2026-08-20 live audit, all of them one-liners that a
 * refactor deletes without noticing:
 *
 *  1. CPU CRISIS SHED. Bucket 19 against a 20 limit, 15 upgraders burning 3.0
 *     CPU on intents alone. Creep HEADCOUNT is where the CPU goes, and nothing
 *     else in the bot sheds count — every other governor sheds work per creep.
 *  2. RCL2 SPRAWL EXCEPTION. E35N58 sat 11,700+ ticks at RCL2 because the
 *     controller box was staged behind an RCL it could not reach without it.
 *  3. THE DROP LOOP. Full carriers with no sink dropped at the spawn and the
 *     same fleet's collect pass picked it straight back up, forever.
 *
 * These are SOURCE PINS: none of the three can be reached from a unit test
 * without standing up a whole Game world, and all three are about WHERE a
 * check sits relative to its neighbours — which is exactly what a pin can see.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const SPAWNING = fs.readFileSync(path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
const PLAN = fs.readFileSync(path.join(__dirname, "../../src/utils/PlanV2.ts"), "utf8");
const CARRY = fs.readFileSync(path.join(__dirname, "../../src/Roles/carry.ts"), "utf8");

/** body of a top-level `function name(...)`, up to the next top-level function */
function fnBody(src: string, name: string): string {
    const start = src.indexOf("function " + name + "(");
    assert.isAbove(start, -1, "function " + name + " not found");
    const next = src.indexOf("\nfunction ", start + 1);
    return src.slice(start, next === -1 ? src.length : next);
}

/** the ONE line matching re — fails loudly if a copy of it appears elsewhere */
function oneLine(src: string, re: RegExp): string {
    const hits = src.split("\n").filter(l => re.test(l));
    assert.lengthOf(hits, 1, "expected exactly one line matching " + re);
    return hits[0];
}

describe("CPU crisis shed (rooms.spawning)", () => {
    it("the threshold is one named const, not six copies of 1500", () => {
        assert.match(SPAWNING, /const CPU_CRISIS_BUCKET = 1500;/);
        const reads = SPAWNING.match(/Game\.cpu\.bucket [<>]=? CPU_CRISIS_BUCKET/g) || [];
        assert.isAtLeast(reads.length, 6,
            "every shed point must read the const: upgraderTarget, burn, haul, carriers, RCL2, RCL3");
    });

    it("upgraderTarget drops to the downgrade floor BEFORE the latch/bank ladder", () => {
        const body = fnBody(SPAWNING, "upgraderTarget");
        const floor = body.indexOf("const floor =");
        const shed = body.indexOf("if(Game.cpu.bucket < CPU_CRISIS_BUCKET) return floor;");
        const latch = body.indexOf("upgradeLatch(room)");
        assert.isAbove(floor, -1, "the hard floor is still computed");
        assert.isAbove(shed, -1, "the bucket shed is gone from upgraderTarget");
        assert.isAbove(latch, -1);
        assert.isBelow(floor, shed, "the shed returns `floor`, so the floor must be computed first");
        assert.isBelow(shed, latch,
            "shedding must short-circuit the whole ladder — a latched surge room is the worst offender");
    });

    it("a storage-less room runs at most 3 upgraders, not the full base roster", () => {
        const body = fnBody(SPAWNING, "upgraderTarget");
        assert.match(body,
            /!room\.storage \|\| !room\.storage\.my\) return Math\.max\(Math\.min\(base, 3\) \+ burn, floor\)/,
            "an RCL4+ room with no storage should be BUILDING one, not drinking the site's energy");
        assert.notMatch(body, /!room\.storage \|\| !room\.storage\.my\) return Math\.max\(base \+ burn/,
            "the old uncapped storage-less branch is back");
    });

    it("drainPressure buys no extra bodies on a dead bucket (decay is the cheaper loss)", () => {
        assert.include(oneLine(SPAWNING, /^\s*burn:/), "Game.cpu.bucket < CPU_CRISIS_BUCKET",
            "burn pressure must read zero in a crisis");
        assert.include(oneLine(SPAWNING, /^\s*haul:/), "Game.cpu.bucket >= CPU_CRISIS_BUCKET",
            "the extra hauler per source must be gated the other way round");
    });

    it("homeCarriersWanted clamps sinkless and CPU-starved rooms to two, and clamps LAST", () => {
        const body = fnBody(SPAWNING, "homeCarriersWanted");
        const bump = body.indexOf("want + pressure.haul");
        const sink = body.search(/!room\.storage \|\| !room\.storage\.my\) && want > 2/);
        const cpu = body.search(/Game\.cpu\.bucket < CPU_CRISIS_BUCKET && want > 2/);
        const ret = body.indexOf("return want;");
        assert.isAbove(sink, -1, "the sink-cap clamp is gone");
        assert.isAbove(cpu, -1, "the bucket clamp is gone");
        assert.isAbove(ret, -1);
        assert.isBelow(bump, sink, "drain pressure must not be able to re-inflate want past the clamps");
        assert.isBelow(sink, ret, "the clamps are dead unless they run before the return");
        assert.isBelow(cpu, ret);
    });

    it("both the RCL2 and RCL3 upgrade rosters shed to 2", () => {
        const defs = SPAWNING.indexOf("const spawnrulesDefs");
        assert.isAbove(defs, -1);
        const at = (lvl: number) => SPAWNING.indexOf(lvl + ": () => ({", defs);
        const blocks: [string, string][] = [
            ["RCL2", SPAWNING.slice(at(2), at(3))],
            ["RCL3", SPAWNING.slice(at(3), at(4))],
        ];
        for (const pair of blocks) {
            const name = pair[0];
            const block = pair[1];
            const up = block.indexOf("upgrade_creep");
            assert.isAbove(up, -1, name + " has no upgrade_creep roster");
            const amount = block.slice(up, block.indexOf("body:", up));
            assert.include(amount, "Game.cpu.bucket < CPU_CRISIS_BUCKET ? 2",
                name + " upgrade_creep.amount must shed to 2 on a dead bucket");
        }
    });
});

describe("RCL2 container staging: the sprawl exception (PlanV2)", () => {
    const body = fnBody(PLAN, "plannedTilesFor");

    it("compact rooms still take exactly one box at RCL2", () => {
        assert.match(body, /let rcl2Early = Math\.min\(1, staged\.early\);/,
            "the one-box default is the whole point of the staging");
    });

    it("the whole early set unlocks ONLY behind the hub-to-controller range guard", () => {
        assert.match(body, /lvl === 2 && room && room\.controller/,
            "the exception is RCL2-only and needs the live room object");
        const guard = oneLine(body, /getRangeTo\(room\.controller\) > 10/);
        assert.include(guard, "rcl2Early = staged.early",
            "the widening must live on the SAME statement as the range guard — a bare " +
            "`rcl2Early = staged.early` gives every bench room two boxes at RCL2");
    });

    it("the prefix stays nested: RCL<3 takes rcl2Early, RCL3+ takes the early set", () => {
        assert.match(body, /const beforeExtractor = lvl < 3 \? rcl2Early : staged\.early;/,
            "1 SUBSET early SUBSET all — migration order is FREE_REPLACE and must never reorder");
    });
});

describe("full carriers park instead of dropping (Roles/carry)", () => {
    it("NOTHING in carry.ts drops energy any more", () => {
        assert.notInclude(CARRY, "drop(RESOURCE_ENERGY)",
            "a drop at the spawn is re-collected by the same fleet: 0.6 CPU/creep/cycle " +
            "plus decay for zero delivered energy");
    });

    it("parkFull settles once and then spends zero intents and zero finds", () => {
        assert.match(CARRY, /function parkFull\(/);
        const body = fnBody(CARRY, "parkFull");
        assert.match(body, /_pk === packed\) return;/,
            "a settled carrier must bail before any look/move — the park is memoised on _pk");
        assert.notInclude(body, ".drop(");
    });

    it("deliverIfNear returns false rather than dumping the load", () => {
        const body = fnBody(CARRY, "deliverIfNear");
        assert.notInclude(body, ".drop(");
        assert.include(body, "return false;");
    });

    it("the storage-less branch skips findLocked's room scans when the base is fed", () => {
        assert.match(CARRY, /baseIsFed\(creep\.room\) \? null : findLocked\(creep\)/,
            "findLocked runs three room.finds; a fed base can never satisfy any of them");
        const parks = CARRY.match(/parkFull\(creep\)/g) || [];
        assert.isAtLeast(parks.length, 3,
            "every no-sink exit in the young-room branch must park, not fall through");
    });
});
