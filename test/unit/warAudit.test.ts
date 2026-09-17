import { assert } from "chai";
import fs from "fs";
import path from "path";
import { KIT_COST } from "../../src/War/kit";

/**
 * War-layer audit round (2026-09-17). Source pins for fixes that are pure
 * wiring and cannot be driven without a live Game:
 *
 *  - squad creeps carry `targetPosition` (leader only), never `targetRoom`,
 *    so every per-target in-flight check read a marching quad as absent for
 *    its whole walk. flight's aimsAt() reads both fields.
 *  - pickHome picked by straight-line distance only and issue() rejected the
 *    single answer on real hops, so a target whose nearest funder routed
 *    around an SK wall was re-picked and refused forever. The walk is now
 *    part of the pick.
 *  - pickKit's remote branch counted OUR OWN reservation as harassable.
 *  - hasHistory() pinned every record that ever showed upgradeBlocked —
 *    rec.ub is observed enemy state, not our operational history.
 *  - dispatch's mosquito ledger read Memory.e.mosquito.length unguarded.
 *  - the guard cap counted live creeps only; a 1500-tick queue wait meant
 *    consecutive passes oversubscribed it.
 *  - NON_RECOVERY_ROLES listed 'Signifer' but SD assigns 'signifer'.
 */
const FLIGHT = fs.readFileSync(path.join(__dirname, "../../src/War/flight.ts"), "utf8");
const KIT = fs.readFileSync(path.join(__dirname, "../../src/War/kit.ts"), "utf8");
const DISPATCH = fs.readFileSync(path.join(__dirname, "../../src/War/dispatch.ts"), "utf8");
const INTEL = fs.readFileSync(path.join(__dirname, "../../src/War/intel.ts"), "utf8")
    .replace(/[/][*][^]*?[*][/]/g, "").replace(/[/][/].*/g, "");
const SPAWNING = fs.readFileSync(path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");

describe("war audit fixes", () => {
    it("in-flight checks see a quad via its leader's targetPosition", () => {
        assert.include(FLIGHT, "function aimsAt(memory: any, target: string): boolean {");
        assert.include(FLIGHT, "memory.targetRoom === target");
        assert.include(FLIGHT, "tp.roomName === target");
        assert.include(FLIGHT, "aimsAt(c.memory, target)");
        assert.include(FLIGHT, "aimsAt(mem, target)");
    });

    it("pickHome walks candidates nearest-first and refuses the unreachable", () => {
        const at = KIT.indexOf("function pickHome(");
        const body = KIT.slice(at, KIT.indexOf("\n}\n", at));
        assert.include(body, "withinTravelBudget(c.name, target)");
        assert.include(body, "candidates.sort");
        // mosquito keeps its memory-side exemption
        assert.include(KIT, 'pickHome(target, 8, KIT_COST.mosquito, false)');
    });

    it("a remote WE reserved is never a harassment target", () => {
        assert.include(KIT, "rec.rv !== myUsername()");
    });

    it("observed upgradeBlocked no longer makes a record un-evictable", () => {
        const at = INTEL.indexOf("function hasHistory(rec: RoomIntel)");
        const body = INTEL.slice(at, at + 400);
        assert.notInclude(body, "rec.ub");
        assert.include(body, "rec.atk");
    });

    it("the mosquito ledger tolerates Memory.e without .mosquito", () => {
        assert.include(DISPATCH, "me.mosquito || (me.mosquito = [])");
    });

    it("the guard cap counts the spawn queue, not just live creeps", () => {
        const n = DISPATCH.match(/countLive\(ROLES\.GUARD\) \+ countQueued\(ROLES\.GUARD\)/g) || [];
        assert.strictEqual(n.length, 2, "guard-prey and guard-raid both gate on live+queued");
        assert.include(FLIGHT, "export function countQueued(roles: string[]): number {");
    });

    it("broke-room triage recognises the lowercase signifer role", () => {
        const at = SPAWNING.indexOf("NON_RECOVERY_ROLES");
        const body = SPAWNING.slice(at, at + 1600);
        assert.include(body, "signifer: true");
    });

    it("KIT_COST reflects the real bodies", () => {
        // Measured: GUARD_RAID = 25 ATTACK + 25 MOVE = 3250; RCL8 duo ~10750;
        // RCL8 quad ~25000 (the old 7000 was the unreachable RCL6 sum and let a
        // 23k-bank home queue a 25k body it could never hatch).
        assert.isAtLeast(KIT_COST.guardRaid, 3250);
        assert.isAtLeast(KIT_COST.duo, 10750);
        assert.isAtLeast(KIT_COST.quad, 25000);
        assert.isAtLeast(KIT_COST.quadBoost, KIT_COST.quad);
    });
});
