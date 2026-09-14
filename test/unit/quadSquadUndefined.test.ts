import { assert } from "chai";
import QuadSquadRunManager from "../../src/Managers/QuadSquadRunManager";

/**
 * The squad runner used to suicide() any creep whose memory.role was
 * undefined — the exact policy RunCreepManager abandoned after hatchlings
 * died in a spawn->suicide loop on the VPS. A squad member with wiped memory
 * died mid-formation and stranded its three partners at the rally point.
 * It now restores the role from the name prefix like the main loop, and
 * skips the tick when it cannot.
 */

const g: any = global;

function makeCreep(name: string): any {
    return {
        name,
        memory: {},
        spawning: false,
        ticksToLive: 1400,
        room: { name: "E1N1" },
        suicided: false,
        suicide() { this.suicided = true; return 0; },
    };
}

function run(names: string[], creeps: any): { ran: string[] } {
    const ran: string[] = [];
    const prevGame = g.Game;
    const prevMemory = g.Memory;
    const prevRoles = g.ROLES;
    g.Game = Object.assign({}, prevGame, { time: 100000, creeps });
    g.Memory = { creeps: {} };
    for (const n of names) g.Memory.creeps[n] = creeps[n] ? creeps[n].memory : {};
    g.ROLES = {};
    for (const n of names) {
        const role = n.split("-")[0];
        if (role === "Mystery") continue; // a name with no role on the table
        g.ROLES[role] = { run: (c: any) => ran.push(c.name) };
    }
    try {
        QuadSquadRunManager(names);
    } finally {
        g.Game = prevGame;
        g.Memory = prevMemory;
        g.ROLES = prevRoles;
    }
    return { ran };
}

describe("QuadSquadRunManager role-undefined handling", () => {
    it("restores the role from the name prefix instead of suiciding", () => {
        const c = makeCreep("SquadCreepA-1-E1N1");
        const { ran } = run(["SquadCreepA-1-E1N1"], { "SquadCreepA-1-E1N1": c });
        assert.isFalse(c.suicided, "must not suicide a recoverable creep");
        assert.strictEqual(c.memory.role, "SquadCreepA");
        // leader inferred during pass 1 — runs from next tick
    });

    it("skips rather than suicides when the name maps to no role", () => {
        const c = makeCreep("Mystery-1-E1N1");
        run(["Mystery-1-E1N1"], { "Mystery-1-E1N1": c });
        assert.isFalse(c.suicided);
    });

    it("runs the leader before its followers", () => {
        const a = makeCreep("SquadCreepA-1-E1N1");
        const b = makeCreep("SquadCreepB-1-E1N1");
        a.memory.role = "SquadCreepA";
        b.memory.role = "SquadCreepB";
        const { ran } = run(
            ["SquadCreepB-1-E1N1", "SquadCreepA-1-E1N1"],
            { "SquadCreepA-1-E1N1": a, "SquadCreepB-1-E1N1": b },
        );
        assert.deepEqual(ran, ["SquadCreepA-1-E1N1", "SquadCreepB-1-E1N1"]);
    });
});
