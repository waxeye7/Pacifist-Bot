/**
 * CPU relief, from a MEASURED live profile (shard3, Game.cpu.limit 20, mean
 * usage 20.6 — i.e. the bucket drains every tick):
 *
 *   creep phase        17.55 CPU of the 20.6
 *   filler              2.26 CPU over 8 creeps
 *   repair + maintainer 2.81 CPU over 9 creeps
 *   upgraders          10.9 creeps fleet-wide across 6 owned rooms
 *
 * Six fixes, all of them "stop asking the engine the same question twice":
 *
 *  1. filler.fillNeed ran up to FOUR room-wide FIND_MY_STRUCTURES passes and is
 *     called twice per loaded filler per tick. Its sibling findFillerTarget has
 *     memoised the identical candidate lists through cachedDerived since the
 *     RoomCache landed; fillNeed now does the same, with the per-creep half
 *     (excludeId, the mid-tick undeliverable blacklist) still outside the memo.
 *  2. utils/Interior recomputed the shell signature — and rebuilt the whole
 *     shell tile array to do it — on EVERY getCache() call, which the repair and
 *     maintainer roles make per structure inside a find filter.
 *  3. maintainer walked the entire keepTheseRoads id list (58-120
 *     Game.getObjectById calls) every tick, per creep.
 *  4. emergencyFillerRescue ran two more full _.filter(Game.creeps) fleet scans
 *     per owned room per tick, immediately after the spawn ladder had built the
 *     shared census that already knew both numbers.
 *  5. the upgrader mover pathed with the RAW matrix builder; the memoised
 *     wrapper next to it (roomCallbackRoadPrioUpgraderInPosition) was
 *     referenced nowhere, so every upgrader repath rebuilt a whole matrix.
 *  6. and the roster itself: on a 20 CPU allowance with a draining bucket the
 *     per-room upgrader want is clamped to one, through a single helper, with
 *     the downgrade rungs left alone.
 *
 * Source-shape pins for each, in the style of trafficJam.test.ts.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const src = (p: string) => fs.readFileSync(path.join(__dirname, "../../src/", p), "utf8");

const FILLER = src("Roles/filler.ts");
const INTERIOR = src("utils/Interior.ts");
const MAINTAINER = src("Roles/maintainer.ts");
const SPAWNING = src("Rooms/rooms.spawning.ts");
const CENSUS = src("Empire/census.ts");
const CF = src("Functions/creepFunctions.ts");

/** the body of `name`'s declaration, up to `len` chars — for scoped assertions */
function bodyOf(text: string, marker: string, len: number): string {
    const at = text.indexOf(marker);
    assert.isAbove(at, -1, `expected to find ${marker}`);
    return text.slice(at, at + len);
}

/** everything from `start` up to the next `end` — for whole-function scoping */
function between(text: string, start: string, end: string): string {
    const a = text.indexOf(start);
    assert.isAbove(a, -1, `expected to find ${start}`);
    const b = text.indexOf(end, a + start.length);
    assert.isAbove(b, -1, `expected to find ${end} after ${start}`);
    return text.slice(a, b);
}

const FILL_NEED = between(FILLER,
    "function fillNeed(creep, excludeId?, spawnOnly?)",
    "* Move one step towards a fill target");

describe("1. filler.fillNeed shares its candidate lists (2.26 CPU / 8 fillers)", () => {
    it("no longer runs room-wide FIND_MY_STRUCTURES per creep per call", () => {
        assert.notMatch(FILL_NEED, /room\.find\(FIND_MY_STRUCTURES/,
            "fillNeed must not scan the room itself; the four lists are memoised per room per tick");
    });

    it("memoises all four candidate lists through cachedDerived, one key each", () => {
        assert.match(FILLER, /import \{ cachedDerived, cachedMyStructures \} from "utils\/RoomCache";/);
        assert.match(FILLER, /return cachedDerived\(room, key, \(\) => cachedMyStructures\(room\)\.filter\(want\)\);/);
        for (const key of ["fillNeedDryTowers", "fillNeedSpawnExt", "fillNeedHalfTowers", "fillNeedAnyFillable"]) {
            assert.include(FILLER, `fillCandidates(room, "${key}"`, `missing memo for ${key}`);
        }
    });

    it("keeps excludeId and the mid-tick blacklists OUTSIDE the memo", () => {
        // three lists filter on the heuristic blacklist, the last-resort list on
        // the physical one — all four AFTER the memoised candidate list
        const undeliverable = FILL_NEED.match(/\.filter\(\(s: any\) => s\.id !== excludeId && !isUndeliverable\(room, s\.id\)\)/g);
        assert.lengthOf(undeliverable || [], 3);
        assert.match(FILL_NEED, /\.filter\(\(s: any\) => s\.id !== excludeId && !isUnreachableId\(room, s\.id\)\)/);
        // ...and never inside the memoised predicate: advanceTo() writes to the
        // blacklist DURING the tick, so it can never be cached past a creep
        const memo = between(FILLER, "function fillCandidates(room, key: string", "function fillNeed(");
        assert.notMatch(memo, /isUndeliverable|isUnreachableId|excludeId/);
    });

    it("still resolves ties with findClosestByRange over the engine's FIND order", () => {
        assert.match(FILL_NEED, /return creep\.pos\.findClosestByRange\(dryTowers\);/);
        assert.match(FILL_NEED, /return creep\.pos\.findClosestByRange\(targets\);/);
        // the spawnOnly early-out and the four-rung order are unchanged
        assert.match(FILL_NEED, /if\(targets\.length == 0 && spawnOnly\) \{\s*\n\s*return null;/);
    });
});

describe("2. utils/Interior resolves its cache once per room per tick", () => {
    it("getCache is a per-tick memo in front of the sig comparison", () => {
        assert.match(INTERIOR, /let lookupTick = -1;/);
        assert.match(INTERIOR, /let lookupCache: \{ \[roomName: string\]: InteriorCache \| null \} = \{\};/);
        const g = bodyOf(INTERIOR, "function getCache(room: Room): InteriorCache | null {", 500);
        assert.match(g, /if \(lookupTick !== Game\.time\) \{\s*\n\s*lookupTick = Game\.time;\s*\n\s*lookupCache = \{\};/,
            "the memo must reset when Game.time changes, like matrixCache above it");
        assert.match(g, /if \(memo !== undefined\) return memo;/,
            "a null (no usable interior) must be memoised too — it is the expensive answer");
        assert.match(g, /const resolved = resolveCache\(room\);/);
    });

    it("does NOT change cache semantics: the sig still invalidates the heap fill", () => {
        const r = bodyOf(INTERIOR, "function resolveCache(room: Room): InteriorCache | null {", 700);
        assert.match(r, /const sig = shellSig\(room\);/);
        assert.match(r, /const ttl = cur && cur\.ok \? CACHE_TTL : 15;/);
        assert.match(r, /if \(cur && cur\.sig === sig && Game\.time - cur\.t < ttl\)/);
        assert.match(r, /built\.sig = sig;/);
    });
});

describe("3. maintainer throttles the keepTheseRoads walk (repair+maintainer 2.81 / 9)", () => {
    it("walks the full id list every 10 ticks, offset by a name hash", () => {
        assert.match(MAINTAINER, /const ROAD_WALK_EVERY = 10;/);
        assert.match(MAINTAINER, /function nameOffset\(name: string, mod: number\): number \{/);
        assert.match(MAINTAINER,
            /let walkRoads = danger \|\| \(Game\.time \+ nameOffset\(creep\.name, ROAD_WALK_EVERY\)\) % ROAD_WALK_EVERY == 0;/);
    });

    it("never throttles under danger — the hub clip would empty a 1-target list", () => {
        // the range-10 clip drops anything far from the hub, and an empty list
        // in a room with no interior geometry sets suicide
        assert.match(MAINTAINER, /const danger = dangerNow\(creep\.room\);/);
        assert.match(MAINTAINER, /if\(danger && storage\) \{\s*\n\s*buildingsToRepair = buildingsToRepair\.filter/);
        assert.match(MAINTAINER, /const outposted = interiorReady\(creep\.room\) && danger;/);
    });

    it("between walks it validates ONE cached target with one getObjectById", () => {
        const block = bodyOf(MAINTAINER, "if(!walkRoads) {", 600);
        assert.match(block, /creep\.memory\._roadTarget \? Game\.getObjectById\(creep\.memory\._roadTarget\) : null/);
        assert.match(block, /if\(held && held\.hits <= held\.hitsMax - 500\)/);
    });

    it("re-walks immediately when the cached road dies or reaches full hp", () => {
        const block = bodyOf(MAINTAINER, "if(!walkRoads) {", 600);
        assert.match(block, /else \{\s*\n\s*delete creep\.memory\._roadTarget;\s*\n\s*walkRoads = true;/);
    });

    it("still prunes dead ids out of keepTheseRoads on the walk ticks", () => {
        const block = bodyOf(MAINTAINER, "if(walkRoads) {", 1400);
        assert.match(block, /if\(liveRoadIds\.length !== roadIds\.length\) \{\s*\n\s*creep\.room\.memory\.keepTheseRoads = liveRoadIds;/);
        assert.match(block, /creep\.memory\._roadTarget = closestRoad\.id;/);
    });
});

describe("4. emergencyFillerRescue reads the shared census, not Game.creeps", () => {
    it("both fleet scans are gone", () => {
        const fn = bodyOf(SPAWNING, "function emergencyFillerRescue(room, spawn): boolean {", 2400);
        // `= _.filter(Game.creeps, ...)` — the assignment, not the comment that
        // records why it is no longer there
        assert.notMatch(fn, /=\s*_\.filter\(Game\.creeps/,
            "the census the spawn ladder built two lines above the caller already counted both of these");
        assert.match(fn, /const census = getCensus\(\);/);
    });

    it("fillers come from presentReal (stopgaps still excluded) and haulers from present", () => {
        const fn = bodyOf(SPAWNING, "function emergencyFillerRescue(room, spawn): boolean {", 2400);
        assert.match(fn, /let fillersInRoom = presentRealCount\(census, room\.name, 'filler'\);/);
        assert.match(fn,
            /let haulersInRoom = presentCount\(census, room\.name, 'carry'\) \+ presentCount\(census, room\.name, 'FakeFiller'\);/);
        assert.match(SPAWNING, /import \{ getCensus, presentCount, presentRealCount \} from "Empire\/census";/);
    });

    it("the census publishes presentReal — present minus ladder stopgaps", () => {
        assert.match(CENSUS, /presentReal: \{ \[room: string\]: RoleCounts \};/);
        assert.match(CENSUS, /bump\(c\.present, here, role\);\s*\n\s*if \(!stopgap\) bump\(c\.presentReal, here, role\);/);
        assert.match(CENSUS, /export function presentRealCount\(census: EmpireCensus, room: string, role: string\): number \{/);
        // the literal must carry the new field or getCensus() would hand out undefined
        assert.match(CENSUS, /present: \{\}, presentReal: \{\}, target: \{\}/);
    });
});

describe("5. the upgrader mover uses the memoised matrix that was wired to nothing", () => {
    it("roomCallbackRoadPrioUpgraderInPosition is the memoMatrix wrapper", () => {
        assert.match(CF,
            /const roomCallbackRoadPrioUpgraderInPosition = memoMatrix\("upgraderInPos", buildRoadPrioUpgraderInPosition\);/);
    });

    it("...and the mover now points at it instead of the raw builder", () => {
        const mover = bodyOf(CF, "Creep.prototype.roomCallbackRoadPrioUpgraderInPosition = function moveRoadPrioUpgraderInPosition", 1600);
        assert.match(mover, /let costMatrix:any = roomCallbackRoadPrioUpgraderInPosition;/);
        assert.notMatch(mover, /let costMatrix:any = buildRoadPrioUpgraderInPosition;/);
        // the raw builder is still there — the memo calls it
        assert.match(CF, /const buildRoadPrioUpgraderInPosition = \(roomName: string\): boolean \| CostMatrix => \{/);
    });
});

describe("6. the upgrader CPU clamp (10.9 upgraders across 6 rooms at limit 20)", () => {
    it("is one helper: limit <= 20 and bucket < 6000 => want is at most 1", () => {
        assert.match(SPAWNING, /const UPGRADER_CLAMP_LIMIT = 20;/);
        assert.match(SPAWNING, /const UPGRADER_CLAMP_BUCKET = 6000;/);
        const fn = bodyOf(SPAWNING, "function upgraderCpuCap(want: number): number {", 300);
        assert.match(fn, /if\(Game\.cpu\.limit <= UPGRADER_CLAMP_LIMIT && Game\.cpu\.bucket < UPGRADER_CLAMP_BUCKET\) \{\s*\n\s*return Math\.min\(want, 1\);\s*\n\s*\}\s*\n\s*return want;/);
    });

    it("self-releases: it reads Game.cpu.bucket live and latches nothing", () => {
        const fn = bodyOf(SPAWNING, "function upgraderCpuCap(want: number): number {", 300);
        assert.notMatch(fn, /Memory|room\.memory|upLatch/,
            "a latched clamp could not release itself as the bucket recovers");
    });

    it("every non-downgrade rung goes through it (RCL1-7, all thirteen wants)", () => {
        const wants = [
            "upgraderCpuCap(spawnrules[1].upgrade_creep.amount)",
            "upgraderCpuCap(spawnrules[1].upgrade_creep.amount + 6)",
            "upgraderCpuCap(spawnrules[2].upgrade_creep.amount + pressure.burn)",
            "upgraderCpuCap(spawnrules[2].upgrade_creep.amount + 6)",
            "upgraderCpuCap(spawnrules[3].upgrade_creep.amount + pressure.burn)",
            "upgraderCpuCap(spawnrules[3].upgrade_creep.amount + 6)",
            "upgraderCpuCap(upgraderTarget(room, spawnrules[4].upgrade_creep.amount",
            "upgraderCpuCap(upgraderTarget(room, spawnrules[5].upgrade_creep.amount",
            "upgraderCpuCap(upgraderTarget(room, spawnrules[6].upgrade_creep.amount",
            "upgraderCpuCap(spawnrules[6].upgrade_creep.amount + surplusUpgraders)",
            "upgraderCpuCap(spawnrules[7].upgrade_creep_spend.amount)",
            "upgraderCpuCap(upgraderTarget(room, spawnrules[7].upgrade_creep.amount",
            "upgraderCpuCap(spawnrules[7].upgrade_creep.amount + surplusUpgraders)",
        ];
        for (const w of wants) assert.include(SPAWNING, w, `unclamped upgrader rung: ${w}`);
        // both keepOneUpgrader floors (RCL6 and RCL7)
        assert.lengthOf(SPAWNING.match(/upgraderCpuCap\(keepOneUpgrader\(room, EnergyMinersInRoom\)\)/g) || [], 2);
    });

    it("leaves every downgrade-emergency arm able to spawn its own", () => {
        // RCL5's two hard floors, RCL6's and RCL7's downgrade arms, and RCL8's
        // rung (which IS a downgrade rung, want 1) stay uncapped.
        assert.match(SPAWNING, /\|\| room\.controller\.ticksToDowngrade < 6000 && upgraders < spawnrules\[5\]\.upgrade_creep\.amount && !room\.memory\.danger/);
        assert.match(SPAWNING, /\|\| upgraders < 1 && room\.controller\.ticksToDowngrade < CONTROLLER_DOWNGRADE\[room\.controller\.level\] \/ 2/);
        assert.match(SPAWNING, /\|\| room\.controller\.ticksToDowngrade < 80000 && upgraders < spawnrules\[6\]\.upgrade_creep\.amount\)/);
        assert.match(SPAWNING, /\|\| upgraders < spawnrules\[7\]\.upgrade_creep\.amount && room\.controller\.ticksToDowngrade < 110000/);
        assert.match(SPAWNING, /if\(upgraders < spawnrules\[8\]\.upgrade_creep\.amount && room\.controller\.ticksToDowngrade < 125000/);
    });

    it("no upgrader rung was left comparing against a bare want", () => {
        // every LINE containing `upgraders < X` is either capped or one of the
        // five downgrade arms pinned above — this is the drift guard
        const rungs = SPAWNING.match(/^.*upgraders < .*$/gm) || [];
        assert.isAbove(rungs.length, 15);
        const uncapped = rungs.filter((r) => r.indexOf("upgraderCpuCap(") === -1);
        assert.lengthOf(uncapped, 5, "unexpected uncapped rung(s):\n" + uncapped.join("\n"));
        for (const r of uncapped) {
            assert.match(r, /ticksToDowngrade|CONTROLLER_DOWNGRADE/,
                "an uncapped rung must be a downgrade rung: " + r.trim());
        }
    });
});
