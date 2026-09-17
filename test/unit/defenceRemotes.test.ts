/**
 * Defence/remotes audit pass (2026-09-17) — ten LOW findings, all pinned:
 *
 * rooms.remotes:
 *  1. remoteIsHot's vision recheck tested part TYPES without hits>0, so a
 *     creep whose combat parts were all destroyed still counted as combat and
 *     held the remote closed forever; and it ignored WORK, while the marking
 *     side (scanRemoteThreats) counts WORK — a lone WORK scout produced an
 *     open/close churn every HOT_COOLDOWN.
 *  2. The `cored` and `towered` reject branches only stamped retryAt when
 *     e.energy already existed — a tower/core seen before any survey sealed
 *     the entry permanently (no retryAt consumer ever ran on it).
 *  3. An adjacent room WE own got res[name] = {} re-created every manage pass
 *     (remotes() deletes it again) plus a scout retryAt into our own base.
 *  4. `Math.max(1, ...)` forced a remote even when CpuPolicy.maxRemotes was 0.
 *  5. e.retryAt on a remote held by another commune was a dead write — the
 *     consumer only reads it on empty-energy rejects.
 *
 * rooms.defence:
 *  6. ownedStuffIsBeingHurt counted scheduled decay drops (300/5000 per decay
 *     tick) as "hurt" — a parked drainer next to decaying ramparts re-opened
 *     the tower drain the check exists to deny.
 *  7. shellPeakHits was a max-watermark that never reset across raids: after
 *     decay back to floor, the next raid's breach bar read a healthy shell as
 *     damaged → the safemode arm could spend a charge on nothing.
 *  8. blown_fuse latched on ANY hostile (incl. MOVE-only scouts) while the
 *     spawning reader treats it as "wrecked" — now matches danger's bar.
 *  9. DistressSignals.reinforce_me never stamped `sent`, which
 *     reinforceStatus() reads — lastSent reported "never" forever.
 * 10. pathAroundMyRampartsAndStructuresAndTerrain rebuilt a 2500-tile
 *     CostMatrix + full FIND_STRUCTURES once per threatened civilian per
 *     tick; memoized per room per tick (structures can't change intra-tick).
 */
import { assert } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

function src(rel: string): string {
    return readFileSync(join(__dirname, "..", "..", "src", rel), "utf8");
}
function stripComments(code: string): string {
    return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const REM = stripComments(src(join("Rooms", "rooms.remotes.ts")));
const DEF = stripComments(src(join("Rooms", "rooms.defence.ts")));

describe("remoteIsHot recheck matches the marking side", () => {
    it("requires live combat parts and counts WORK like scanRemoteThreats", () => {
        const at = REM.indexOf("const combat = rr.find(FIND_HOSTILE_CREEPS");
        assert.isAbove(at, -1);
        const body = REM.slice(at, at + 400);
        assert.include(body, "p.hits > 0");
        assert.include(body, "ATTACK");
        assert.include(body, "RANGED_ATTACK");
        assert.include(body, "HEAL");
        assert.include(body, "WORK");
    });
});

describe("unsurveyed cored/towered remotes get a re-look deadline", () => {
    it("both reject branches seed energy and stamp retryAt unconditionally", () => {
        const cored = REM.indexOf('markRemoteHot(room.name, name, "invader core")');
        const towered = REM.indexOf("Memory.AvoidRooms.indexOf(name) < 0");
        assert.isAbove(cored, -1);
        assert.isAbove(towered, -1);
        for (const at of [cored, towered]) {
            const body = REM.slice(at, at + 700);
            assert.include(body, "if (!e.energy) e.energy = {};");
            assert.include(body, "e.retryAt = Game.time + rescoutDelay(room.name, name);");
        }
    });
});

describe("own communes are never remote candidates", () => {
    it("skips controller.my before seeding the entry", () => {
        const loop = REM.indexOf("for (const name of adjacent)");
        const seed = REM.indexOf("if (!res[name]) res[name] = {};", loop);
        const skip = REM.indexOf("look.controller.my", loop);
        assert.isAbove(loop, -1);
        assert.isAbove(skip, loop);
        assert.isAbove(seed, skip, "the own-room skip must precede res[name] seeding");
    });
});

describe("the remote cap honours a zero policy budget", () => {
    it("no forced floor of one", () => {
        const at = REM.indexOf("const cap =");
        assert.isAbove(at, -1);
        const line = REM.slice(at, at + 120);
        assert.include(line, "Math.min(hardCap");
        assert.notInclude(line, "Math.max(1,");
    });
});

describe("decay is not an attack (ownedStuffIsBeingHurt)", () => {
    it("ignores drops at or below the decay quantum", () => {
        const at = DEF.indexOf("function ownedStuffIsBeingHurt");
        assert.isAbove(at, -1);
        const body = DEF.slice(at, at + 1400);
        assert.include(body, "RAMPART_DECAY_AMOUNT");
        assert.include(body, "CONTAINER_DECAY");
        assert.include(body, "drop > decay");
    });
});

describe("shellPeakHits is per-raid", () => {
    it("cleared on the danger transition alongside shellMinAtDanger", () => {
        const at = DEF.indexOf("room.memory.shellMinAtDanger = perimeterMinHits(room)");
        assert.isAbove(at, -1);
        const body = DEF.slice(at, at + 500);
        assert.include(body, "delete room.memory.shellPeakHits");
    });
});

describe("blown_fuse matches the danger bar", () => {
    it("a MOVE-only scout cannot pin the fuse", () => {
        const at = DEF.indexOf("room.memory.blown_fuse = true");
        assert.isAbove(at, -1);
        const head = DEF.slice(at - 200, at);
        assert.include(head, "hostileThreatCount(HostileCreeps) > 0");
    });
});

describe("reinforce_me stamps when it was raised", () => {
    it("writes DistressSignals.sent next to reinforce_me", () => {
        const at = DEF.indexOf("Memory.DistressSignals.reinforce_me = room.name");
        assert.isAbove(at, -1);
        const body = DEF.slice(at, at + 200);
        assert.include(body, "sent = Game.time");
    });
});

describe("the civilian-flee cost matrix is built once per room per tick", () => {
    it("memoizes on Game.time", () => {
        assert.include(DEF, "const fleeCostCache");
        const at = DEF.indexOf("pathAroundMyRampartsAndStructuresAndTerrain = (roomName");
        assert.isAbove(at, -1);
        const body = DEF.slice(at, at + 400);
        assert.include(body, "hit.t === Game.time");
        assert.include(body, "buildFleeCostMatrix(roomName)");
    });
});
