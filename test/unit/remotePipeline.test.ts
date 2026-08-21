/**
 * Remote pipeline redesign (2026-08-22 morning report: "carriers still
 * balancing on the walls, remote sites never finish, nothing reserves").
 * Root causes pinned here:
 *  - THREE cost models disagreed about the haul line (placement 10/25 home
 *    weighting, roaded-check road-blind, pathLength road-blind): finished
 *    legs read 8-26% roaded, two remotes priced 75/100 tiles vs 43/52 real.
 *  - buildRemote aborted the WHOLE pass (home connectors included) when the
 *    container room lacked vision at the pass tick.
 *  - remote miner bodies had no CARRY, so the miner-builds-the-box branch
 *    was dead code and only a rare RemoteRepairer ever built remote sites.
 *  - RemoteRepairer's spawn gate demanded live vision at the producer tick
 *    and stamped the FUTURE, stretching its cadence past 2250 ticks.
 *  - live: all remotes closed in one tick (policy flap), recalled creeps
 *    livelocked in 2-cycles no stuck-detector can see, CPU pinned at 19.4/20
 *    which kept remotes closed — a self-sustaining collapse.
 * Module-private paths => source-shape assertions, same convention as
 * remoteHaul.test.ts / siteBudget.test.ts.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const CONSTR = fs.readFileSync(path.join(__dirname, "../../src/Rooms/rooms.construction.ts"), "utf8");
const SPAWNING = fs.readFileSync(path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
const MINER = fs.readFileSync(path.join(__dirname, "../../src/Roles/energyMiner.ts"), "utf8");
const CF = fs.readFileSync(path.join(__dirname, "../../src/Functions/creepFunctions.ts"), "utf8");
const CARRY = fs.readFileSync(path.join(__dirname, "../../src/Roles/carry.ts"), "utf8");
const FF = fs.readFileSync(path.join(__dirname, "../../src/Roles/FakeFiller.ts"), "utf8");
const POLICY = fs.readFileSync(path.join(__dirname, "../../src/utils/CpuPolicy.ts"), "utf8");
const ROOMS = fs.readFileSync(path.join(__dirname, "../../src/Rooms/rooms.ts"), "utf8");

describe("one haul geometry (placement == roaded check == pathLength)", () => {
    it("searchRemoteHaulPath is exported and wraps the shared matrix", () => {
        assert.match(CONSTR, /export function searchRemoteHaulPath\(homeRoom: any, originPos: any, goal: any, maxOps: number\)/);
        assert.match(CONSTR, /roomCallback: \(roomName: string\) => remoteRoadCostMatrix\(roomName, homeRoom, planRoads\)/);
    });

    it("the home-room matrix prices 2/6/1 like the remote rooms, not 10/25", () => {
        const at = CONSTR.indexOf("export function remoteRoadCostMatrix");
        assert.isAbove(at, -1);
        const body = CONSTR.slice(at, at + 4200);
        assert.notMatch(body, /TERRAIN_MASK_SWAMP \? 25 : 10/,
            "the plan-hugging weights are the reason roads were built where nobody drives");
        // home branch: terrain 2/6, road sites sticky at 1
        const homeBranch = body.slice(body.indexOf("const costs = new PathFinder.CostMatrix()"));
        assert.match(homeBranch, /TERRAIN_MASK_SWAMP \? 6 : 2/);
        assert.match(homeBranch, /FIND_MY_CONSTRUCTION_SITES/);
    });

    it("buildRemote, remotePathIsRoaded and ensureRemotePathLength all walk it", () => {
        assert.match(CONSTR, /const pathFromStorageToRemoteSource = searchRemoteHaulPath\(/);
        assert.match(SPAWNING, /const ret = searchRemoteHaulPath\(room, origin\.pos, \{pos: src\.pos, range: 1\}, 4000\);/);
        assert.match(SPAWNING, /const ret = searchRemoteHaulPath\(room, origin\.pos, goal, 6000\);/);
        assert.notMatch(SPAWNING, /plainCost: 2, swampCost: 10/,
            "no road-blind terrain search may survive in the spawning module");
    });

    it("buildRemote stamps pathLengthT so the survey does not overwrite the authoritative length", () => {
        const at = CONSTR.indexOf("values.pathLength = pathFromStorageToRemoteSource.path.length;");
        assert.isAbove(at, -1);
        assert.match(CONSTR.slice(at, at + 600), /values\.pathLengthT = Game\.time;/);
    });
});

describe("buildRemote no longer full-aborts blind", () => {
    it("a blind container room paves the visible leg instead of returning", () => {
        const at = CONSTR.indexOf("if(!containerSpot || !Game.rooms[containerSpot.roomName])");
        assert.isAbove(at, -1);
        const block = CONSTR.slice(at, at + 900);
        assert.notMatch(block, /return;/,
            "the old return skipped the home connectors on every visionless pass tick");
        assert.match(block, /paving visible leg only/);
    });

    it("the remote container site counts against the remote ceiling", () => {
        assert.match(CONSTR, /if\(containerSiteResult === OK && containerSpot\.roomName !== room\.name\)/);
        assert.match(CONSTR, /b\[containerSpot\.roomName\]\+\+;/);
    });
});

describe("stranded-site purge", () => {
    it("exists, is scoped to TRACKED remotes, and honors the close grace", () => {
        assert.match(CONSTR, /const STRANDED_SITE_GRACE = 3000;/);
        assert.match(CONSTR, /function purgeStrandedRemoteSites\(\): void \{/);
        assert.match(CONSTR, /if \(!tracked\[rn\] \|\| keep\[rn\]\) continue;/);
        assert.match(CONSTR, /Game\.time - e\.closedAt < STRANDED_SITE_GRACE/);
        assert.match(CONSTR, /s\.remove\(\);/);
    });

    it("runs from Remote_Roads_Tick on its own 500-tick throttle", () => {
        const at = CONSTR.indexOf("function Remote_Roads_Tick");
        assert.isAbove(at, -1);
        assert.match(CONSTR.slice(at, at + 400), /purgeStrandedRemoteSites\(\);/);
        assert.match(CONSTR, /Game\.time - _strandedSweepAt < 500/);
    });
});

describe("remote miner = the remote's construction crew", () => {
    it("every real remote miner rung carries a CARRY part", () => {
        const at = SPAWNING.indexOf("const reservedSrc = remoteSourceReserved(room, targetRoomName);");
        assert.isAbove(at, -1);
        const block = SPAWNING.slice(at, at + 1200);
        assert.match(block, /\[WORK,WORK,MOVE,WORK,WORK,MOVE,WORK,WORK,MOVE,CARRY\]/);
        assert.match(block, /\[WORK,WORK,MOVE,WORK,WORK,MOVE,WORK,MOVE,CARRY\]/);
        assert.match(block, /\[WORK,WORK,MOVE,WORK,MOVE,CARRY\]/, "the unreserved 3-WORK body");
        assert.match(block, /\[WORK,WORK,MOVE,WORK,WORK,MOVE,CARRY\]/, "the unreserved backlog body");
    });

    it("WORK count keys off the actual reservation state (5 e/t vs 10 e/t)", () => {
        assert.match(SPAWNING, /function remoteSourceReserved\(room, targetRoomName\): boolean \{/);
        // both consumers share the one predicate
        assert.match(SPAWNING, /const reserved = remoteSourceReserved\(room, targetRoomName\);/);
        assert.match(SPAWNING, /const reservedSrc = remoteSourceReserved\(room, targetRoomName\);/);
    });

    it("a full CARRY miner in a remote builds ANY of my sites in range 3, box first", () => {
        assert.match(MINER, /creep\.pos\.findInRange\(cachedSites\(creep\.room\), 3\);/);
        assert.match(MINER, /a\.structureType === STRUCTURE_CONTAINER \? 0 : 1/);
        assert.match(MINER, /creep\.memory\.targetRoom != creep\.memory\.homeRoom/);
    });

    it("then keeps its box alive (50 hits/tick unowned decay)", () => {
        assert.match(MINER, /b\.hits < b\.hitsMax \* 0\.8/);
        assert.match(MINER, /if\(box && box\.hits < box\.hitsMax\) \{\s*\n\s*creep\.repair\(box\);/);
    });
});

describe("RemoteRepairer spawn gate works blind", () => {
    it("site work is read from Game.constructionSites, not live vision", () => {
        const at = SPAWNING.indexOf("function spawn_remote_repairer");
        assert.isAbove(at, -1);
        const body = SPAWNING.slice(at, at + 3000);
        assert.match(body, /const siteCount: \{ \[roomName: string\]: number \} = \{\};/);
        assert.match(body, /for \(const id in Game\.constructionSites\)/);
        assert.notMatch(body, /if\(!rr\) return;/,
            "no bare vision veto — a remote with standing sites deserves its builder");
    });

    it("never stamps the future (the +50/+100/+200 cadence stretch is gone)", () => {
        const at = SPAWNING.indexOf("function spawn_remote_repairer");
        const end = SPAWNING.indexOf("function reserverGate");
        const body = SPAWNING.slice(at, end);
        assert.notMatch(body, /markSpawned\(Game\.time \+ \d+\)/);
        assert.match(body, /markSpawned\(building \? Game\.time - 300 : Game\.time\);/);
    });

    it("the stale hostile flag blocks only while fresh", () => {
        const at = SPAWNING.indexOf("function spawn_remote_repairer");
        const end = SPAWNING.indexOf("function reserverGate");
        const body = SPAWNING.slice(at, end);
        assert.match(body, /Game\.time - \(rdMem\.hostile_t \|\| 0\) <= 100/);
    });
});

describe("reserving is a policy", () => {
    it("a cpu-tight shard runs remotes unreserved unless the bucket is pegged", () => {
        const at = SPAWNING.indexOf("function reserverGate");
        assert.isAbove(at, -1);
        assert.match(SPAWNING.slice(at, at + 2200),
            /Game\.cpu\.limit < 30 && Game\.cpu\.bucket < 9500/);
    });

    it("reserver bodies cap at 3 CLAIM pairs (the 8xCLAIM monster is gone)", () => {
        assert.match(SPAWNING, /const rungPairs = room\.controller\.level <= 5 \? 2 : 3;/);
        assert.notMatch(SPAWNING, /room\.controller\.level == 7 \? 7 : 8/);
    });

    it("a queued reserver survives a transient close (100-tick debounce)", () => {
        assert.match(SPAWNING, /const closedLongEnough = !!\(ent && ent\.active === false &&/);
        assert.match(SPAWNING, /Game\.time - ent\.closedAt >= 100/);
    });
});

describe("CPU governor hysteresis", () => {
    it("remotes: proven headroom to enter, bucket-paid cost to exit", () => {
        assert.match(POLICY, /const wasOn = !!\(Memory as any\)\._remotesOnHyst;/);
        assert.match(POLICY, /const stayBar = entryBar - 1000;/);
        assert.match(POLICY, /wasOn\s*\n?\s*\? bucket >= stayBar/);
    });

    it("maxRemotes rungs carry a 700-bucket deadband against grazing", () => {
        assert.match(POLICY, /rungs\(bucket - 700\) > prev \? raw : prev/);
        assert.match(POLICY, /rungs\(bucket \+ 700\) < prev \? raw : prev/);
    });

    it("the %500 panic valve stamps closedAt on the transition", () => {
        const at = ROOMS.indexOf("if (e.active !== false) e.closedAt = Game.time;");
        assert.isAbove(at, -1);
    });
});

describe("recalled creeps stop drifting back", () => {
    it("a flee event marks the remote hot — one threat system, every consumer", () => {
        const at = CF.indexOf("Creep.prototype.fleeHomeIfInDanger");
        assert.isAbove(at, -1);
        assert.match(CF.slice(at, at + 1600), /markRemoteHot\(this\.memory\.homeRoom, this\.memory\.targetRoom, "flee:" \+ this\.name\);/);
    });

    it("walkToSource refuses to re-enter a hot/closed remote", () => {
        const at = CARRY.indexOf("function walkToSource");
        assert.isAbove(at, -1);
        const body = CARRY.slice(at, at + 900);
        assert.match(body, /remoteIsHot\(creep\.memory\.homeRoom, creep\.memory\.targetRoom\) \|\| remoteRecalled\(creep\)/);
        assert.match(body, /creep\.stepOffExit\(\);/);
    });

    it("every FakeFiller walk-out goes through the recall-aware helper", () => {
        assert.match(FF, /function resumeCollectTrip\(creep\) \{/);
        const uses = FF.match(/resumeCollectTrip\(creep\);/g) || [];
        assert.isAtLeast(uses.length, 3, "all three exit sites (empty flip, transfer, drop)");
        assert.notMatch(FF, /creep\.moveToRoomAvoidEnemyRooms\(creep\.memory\.targetRoom\);/,
            "no bare walk-out may bypass the recall check");
    });

    it("recycle() is never a no-op in a binless (planV2) room", () => {
        const at = CF.indexOf("Creep.prototype.recycle = function");
        assert.isAbove(at, -1);
        const body = CF.slice(at, CF.indexOf("Creep.prototype.RangedAttackFleeFromMelee"));
        // the derive-a-bin else branch must end in a spawn walk, not fall out
        assert.match(body, /if\(!StructuresObject\.bin\) \{\s*\n\s*let spawns = this\.room\.find\(FIND_MY_SPAWNS\);/,
            "an intentless recycle on the border entry tile is the live 3-tick teleport loop");
        // and the Structures-bootstrap tick moves too
        assert.match(body, /this\.room\.memory\.Structures = \{\};[\s\S]{0,400}?MoveCostMatrixRoadPrio\(spawns\[0\], 1\);/);
    });

    it("a creep on the border it is crossing HOLDS and lets the engine carry it", () => {
        const at = CF.indexOf("const onCorrectEdge = hop && (");
        assert.isAbove(at, -1);
        const block = CF.slice(at, at + 500);
        assert.match(block, /hop\.exit === FIND_EXIT_TOP && this\.pos\.y === 0/);
        assert.match(block, /if \(onCorrectEdge\) return;/);
    });
});
