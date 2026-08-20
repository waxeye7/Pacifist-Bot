/**
 * Remote-haul fix set (2026-08-21 VPS report: "carriers all lock onto the
 * closest pile, come home with nothing, the far source gets no service").
 * Root causes and the shapes pinned here:
 *  - sourceId never reached the pickup selector (spec: _next-sticky-pickup.md,
 *    whose "APPLIED IN SRC" header was stale — it was never applied).
 *  - carry treated the lock-time claim `amt` as the amount collected and rode
 *    home on crumbs (37dffc94's `took >= 50`).
 *  - a stale blind-room hostile flag bounced arriving carriers home empty.
 *  - the HOT branch deleted sourceId, so one hot event doubled the fleet.
 *  - a MOVE-only scout re-armed `hot` forever (unfiltered hostile find).
 *  - blind far sources were priced at L=40 like everything else.
 * These are module-private paths, so the assertions are source-shape, same
 * convention as siteBudget.test.ts / labSlot.test.ts.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const CF = fs.readFileSync(path.join(__dirname, "../../src/Functions/creepFunctions.ts"), "utf8");
const CARRY = fs.readFileSync(path.join(__dirname, "../../src/Roles/carry.ts"), "utf8");
const REMOTES = fs.readFileSync(path.join(__dirname, "../../src/Rooms/rooms.remotes.ts"), "utf8");
const SPAWNING = fs.readFileSync(path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
const ROOMS = fs.readFileSync(path.join(__dirname, "../../src/Rooms/rooms.ts"), "utf8");

describe("source-sticky pickup (the closest-pile swarm)", () => {
    it("STICKY_SOURCE_RANGE exists and atMine gates all three selection sites", () => {
        assert.match(CF, /const STICKY_SOURCE_RANGE = 2;/);
        // hasRoom: every pick(true)/pick(false) rung inherits the source gate
        assert.match(CF, /const hasRoom = \(o: any, strict: boolean\) =>\s*\n?\s*atMine\(o\) &&/);
        // locked fast path: a leftover lock on the other source dies this tick
        assert.match(CF, /atMine\(locked\) &&\s*\n\s*worthIt;/);
        // adjacent salvage: a far-tagged carrier walking past the near pile
        // must not fill there and turn around
        assert.match(CF, /&& atMine\(list\[i\]\)\) return list\[i\];/);
    });

    it("degrades to closest-select when sourceId is missing or invisible", () => {
        const at = CF.indexOf("const atMine = (o: any) =>");
        assert.isAbove(at, -1);
        const body = CF.slice(at, at + 300);
        assert.match(body, /!stickySrc \|\|/, "null stickySrc means atMine is always true");
    });

    it("the idle path returns a sentinel so carry can take a partial home", () => {
        assert.match(CF, /_pickupBumpStat\("pickupIdle", 1\);[\s\S]{0,400}?return "idle";/);
    });
});

describe("carry return decision (home with 3 energy)", () => {
    it("reconciles the lock-time claim against what actually stands on the target", () => {
        assert.match(CARRY, /const took = Math\.min\(\(p && p\.amt\) \|\| 0, standing\);/);
        assert.match(CARRY, /if \(startedFree <= took\) creep\.memory\.full = true;/);
        assert.notMatch(CARRY, /if \(startedFree <= took \|\| took >= 50\)/,
            "the crumb trigger is gone (the comment may still name it)");
    });

    it("only a full body walks home; a dry room takes the partial after a wait", () => {
        assert.match(CARRY, /if \(creep\.memory\.full\) walkToDropoff\(creep\);/);
        assert.match(CARRY, /result === "idle" && startedFree > 0 && startedEnergy > 0/);
        assert.match(CARRY, /creep\.memory\.dry = \(creep\.memory\.dry \|\| 0\) \+ 1;/);
    });

    it("HOT no longer strips sourceId — the body keeps counting in liveCarriersForSource", () => {
        const hot = CARRY.indexOf("remoteIsHot(creep.memory.homeRoom, creep.memory.targetRoom)");
        const recall = CARRY.indexOf("remoteRecalled(creep)");
        assert.isAbove(hot, -1);
        assert.isAbove(recall, hot);
        const hotBlock = CARRY.slice(hot, recall);
        assert.notMatch(hotBlock, /delete creep\.memory\.sourceId/,
            "one hot event must not permanently double the haul fleet");
        assert.match(hotBlock, /recalledHome = true;/);
    });
});

describe("remote availability flags", () => {
    it("hot re-arm counts COMBAT hostiles only — a MOVE-only scout cannot hold a remote closed", () => {
        const at = REMOTES.indexOf("// still hot; scanRemoteThreats will push the timer out");
        assert.isAbove(at, -1);
        const before = REMOTES.slice(Math.max(0, at - 600), at);
        assert.match(before, /p\.type === ATTACK \|\| p\.type === RANGED_ATTACK \|\| p\.type === HEAL/);
        assert.notMatch(before, /find\(FIND_HOSTILE_CREEPS\)\.length/);
    });

    it("the blind hostile flag is stamped when written and honored only while fresh", () => {
        assert.match(ROOMS, /has_hostile_creeps = true;[\s\S]{0,500}?hostile_t = Game\.time;/);
        assert.match(CF, /Game\.rooms\[this\.memory\.targetRoom\] \|\| Game\.time - \(rdFlee\.hostile_t \|\| 0\) <= 100/);
    });
});

describe("remote roads (the disconnected-at-the-border lines)", () => {
    const CONSTR = fs.readFileSync(path.join(__dirname, "../../src/Rooms/rooms.construction.ts"), "utf8");
    const ROOMSF = fs.readFileSync(path.join(__dirname, "../../src/Rooms/rooms.ts"), "utf8");

    it("home tiles pave when on-plan OR exterior — the shell->exit connector exists now", () => {
        assert.match(CONSTR, /if \(!onPlan && !isExteriorPos\(homeRoom, pos\)\) continue;/);
        // and the connector bypasses the homeSites ceiling ROAD_DRIP kept full
        assert.match(CONSTR, /if \(onPlan && budget\.homeSites >= HOME_SITE_CEILING\) continue;/);
    });

    it("the remote line is sticky: existing roads and road sites cost 1 vs plain 2", () => {
        const at = CONSTR.indexOf("STICKY LINE");
        assert.isAbove(at, -1);
        const block = CONSTR.slice(at, at + 1600);
        assert.match(block, /STRUCTURE_ROAD\) \{ stickyCosts\.set\(s\.pos\.x, s\.pos\.y, 1\); continue; \}/);
        assert.match(block, /cs\.structureType === STRUCTURE_ROAD\) stickyCosts\.set/);
    });

    it("the keepTheseRoads wipe spares remotes — it is RemoteRepair's whole enrollment", () => {
        const at = ROOMSF.indexOf("everyRoom.memory.keepTheseRoads = [];");
        assert.isAbove(at, -1);
        const before = ROOMSF.slice(Math.max(0, at - 800), at);
        assert.match(before, /everyRoom\.controller && everyRoom\.controller\.my &&/);
    });

    it("remotePathIsRoaded judges the WHOLE path at 85%, not the remote room at 40%", () => {
        const at = SPAWNING.indexOf("function remotePathIsRoaded");
        assert.isAbove(at, -1);
        const body = SPAWNING.slice(at, at + 3500);
        assert.match(body, /roadTiles >= seenTiles \* 0\.85/);
        assert.notMatch(body, /p\.roomName !== targetRoomName\) continue;/,
            "the home leg must count — 2:1 bodies crawl unpaved home stretches");
    });
});

describe("RemoteRepair border bouncer", () => {
    const RR = fs.readFileSync(path.join(__dirname, "../../src/Roles/remoteRepair.ts"), "utf8");

    it("the repair list rebuilds per room instead of freezing for life", () => {
        assert.match(RR, /!creep\.memory\.allowed_repairs \|\| creep\.memory\._repRoom !== creep\.room\.name/);
    });

    it("un-suicide re-arm resets serviced + list, requires MY sites and real ttl", () => {
        const at = RR.indexOf("creep.memory.suicide = false;");
        assert.isAbove(at, -1);
        const block = RR.slice(Math.max(0, at - 400), at + 400);
        assert.match(block, /FIND_MY_CONSTRUCTION_SITES/);
        assert.match(block, /myTargetRoomServiced = false;/);
        assert.match(block, /delete creep\.memory\.allowed_repairs;/);
    });

    it("a serviced repairer goes home and recycles even with a stale list", () => {
        const at = RR.indexOf("Serviced -> go home and recycle");
        assert.isAbove(at, -1);
        const block = RR.slice(at, at + 700);
        assert.match(block, /creep\.memory\.suicide = true;/);
        assert.notMatch(block, /allowed_repairs\.length == 0/,
            "the exit must not be gated on a list that cannot empty");
    });
});

describe("far-source pricing", () => {
    it("blind sources path to the scout's persisted coordinates and promote to pathLength", () => {
        assert.match(SPAWNING, /values\.x != null && values\.y != null/);
        assert.match(SPAWNING, /\(\(src && src\.pos\) \|\| blindPos\)/);
    });

    it("remoteCarrierDemand derives the length instead of defaulting to 40", () => {
        const at = SPAWNING.indexOf("function remoteCarrierDemand");
        assert.isAbove(at, -1);
        const head = SPAWNING.slice(at, at + 800);
        assert.match(head, /ensureRemotePathLength\(room, targetRoomName, values, sourceId\)/);
    });
});
