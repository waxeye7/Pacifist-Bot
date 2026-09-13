/**
 * defender's wind-down else was dead code: `rampartDefenders.length >= 0` is
 * true for every array, so a lone defender never stood down — it kept manning
 * an empty rampart line forever. `> 0` restores the intent: while a
 * RampartDefender exists the defender fights from the wall; with none it
 * winds down and recycles.
 */
import { assert } from "chai";
import role from "../../src/Roles/defender";

const g: any = global;

function run(rampartDefenders: any[]): any {
    const out = { recycled: 0, rangedAttack: 0, massAttack: 0, moved: 0 };
    const enemy: any = { id: "e1" };
    const rampart: any = { id: "r1", pos: { lookFor: () => [] } };
    const creep: any = {
        memory: {},
        body: [{ type: "ranged_attack" }, { type: "move" }, { type: "heal" }],
        room: {
            memory: { danger: true, rampartToMan: "r1" },
            find: (what: number, opts?: any) => {
                if (what === (g as any).FIND_HOSTILE_CREEPS) return [enemy];
                if (what === (g as any).FIND_MY_CREEPS) return rampartDefenders.filter(opts.filter);
                return [];
            },
            terminal: { id: "t1" },
        },
        pos: {
            findClosestByRange: () => enemy,
            findInRange: () => [],
            isNearTo: () => false,
            lookFor: () => [{ structureType: "road" }],
            getRangeTo: () => 5,
        },
        rangedAttack: () => { out.rangedAttack++; return 0; },
        rangedMassAttack: () => { out.massAttack++; return 0; },
        moveTo: () => { out.moved++; return 0; },
        recycle: () => { out.recycled++; return 0; },
    };

    const prevGame = g.Game;
    g.Game = Object.assign({}, prevGame, {
        time: 100000, // % 100 == 0 — the wind-down check fires this tick
        getObjectById: (id: string) => (id === "r1" ? rampart : null),
        creeps: {},
        rooms: {},
    });
    try {
        role.run(creep);
    } finally {
        g.Game = prevGame;
    }
    return { out, suicide: creep.memory.suicide };
}

describe("defender stands down when the rampart line is empty", () => {
    it("sets suicide and recycles when no RampartDefender exists", () => {
        const { out, suicide } = run([]);
        assert.isTrue(suicide, "wind-down must latch suicide");
        assert.strictEqual(out.recycled, 1);
    });

    it("fights when a RampartDefender is present", () => {
        const rd: any = { memory: { role: "RampartDefender" } };
        const { out, suicide } = run([rd]);
        assert.isUndefined(suicide);
        assert.strictEqual(out.recycled, 0);
    });
});
