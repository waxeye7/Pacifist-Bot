import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import QuadSquadRunManager from "../../src/Managers/QuadSquadRunManager";

/**
 * room.controller is undefined in SK rooms (one coord %10===0) and highway
 * rooms (both). Roles with no room gate run wherever the creep stands — flee
 * paths end on exit tiles and the engine drops the creep next door. A bare
 * `creep.room.controller.level` then throws every tick; RunCreepManager's
 * per-creep catch contains it, but the creep issues no move intent and
 * cannot self-extract.
 *
 * Same trigger, different blast radius: QuadSquadRunManager ran every squad
 * creep bare — one throw aborted the whole two-pass squad loop for the tick.
 */
const SRC = (p: string) =>
    fs.readFileSync(path.join(__dirname, "../../src/", p), "utf8").replace(/\r\n/g, "\n");

describe("controller.X reads reachable in controller-less rooms", () => {
    it("builder gates the RCL2 spawn-slam branch on an existing controller", () => {
        const b = SRC("Roles/builder.ts");
        assert.include(b, "creep.room.controller && creep.room.controller.level == 2 && mySpawns.length > 0");
    });

    it("repair reads a hoisted level, not controller.level", () => {
        const r = SRC("Roles/repair.ts");
        const start = r.indexOf("function findLocked");
        const body = r.slice(start, start + 8000);
        assert.include(body, "const rcl = creep.room.controller ? creep.room.controller.level : 0;");
        // only the ternary declaration and &&-gated reads may survive
        const reads = body.match(/creep\.room\.controller\.level/g) || [];
        const gated = body.match(/controller && creep\.room\.controller\.level/g) || [];
        assert.strictEqual(reads.length - gated.length, 1, "unguarded controller.level survives in findLocked");
    });

    it("console commands refuse controller-less rooms", () => {
        const c = SRC("utils/Commands.ts");
        assert.include(c, "room && room.controller && room.controller.level <= 7");
        const squad = c.match(/room\.controller && room\.controller\.level >= 6 && CreepA/g) || [];
        assert.strictEqual(squad.length, 3, "SQR/SQM/SQD must all gate on controller");
    });

    it("Situational_Building refuses non-owned rooms", () => {
        const rc = SRC("Rooms/rooms.construction.ts");
        const start = rc.indexOf("function Situational_Building");
        assert.include(rc.slice(start, start + 500), "if(!room.controller || !room.controller.my) return;");
    });
});

describe("QuadSquadRunManager containment", () => {
    it("catches per creep — a thrower does not skip the next creep in either pass", () => {
        const ran: string[] = [];
        const oldRoles = (global as any).ROLES;
        const oldCreeps = (Game as any).creeps;
        const oldMem = (Memory as any).creeps;
        (global as any).ROLES = {
            SquadCreepA: { run() { throw new Error("controller is undefined"); } },
            DuoCreepA: { run(c: any) { ran.push(c.name); } },
            FollowerThrow: { run() { throw new Error("controller is undefined"); } },
            FollowerWalk: { run(c: any) { ran.push(c.name); } },
        };
        (Game as any).creeps = {
            "Bad-Lead": { name: "Bad-Lead", memory: { role: "SquadCreepA" }, ticksToLive: 100, room: { name: "W1N1" } },
            "Good-Lead": { name: "Good-Lead", memory: { role: "DuoCreepA" }, ticksToLive: 100, room: { name: "W1N1" } },
            "Bad-Fol": { name: "Bad-Fol", memory: { role: "FollowerThrow" }, ticksToLive: 100, room: { name: "W1N1" } },
            "Good-Fol": { name: "Good-Fol", memory: { role: "FollowerWalk" }, ticksToLive: 100, room: { name: "W1N1" } },
        };
        (Memory as any).creeps = (Game as any).creeps;
        try {
            QuadSquadRunManager(["Bad-Lead", "Good-Lead", "Bad-Fol", "Good-Fol"]);
        } finally {
            (global as any).ROLES = oldRoles;
            (Game as any).creeps = oldCreeps;
            (Memory as any).creeps = oldMem;
        }
        // leaders run in pass 0, followers in pass 1 — each throw must be
        // contained to its own creep
        assert.deepEqual(ran, ["Good-Lead", "Good-Fol"], "a throw froze the rest of its pass");
    });
});
