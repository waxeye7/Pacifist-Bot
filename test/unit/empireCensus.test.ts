/**
 * The shared per-tick creep census (src/Empire/census.ts). The ladder and the
 * empire pass read these numbers; the attribution rules are the contract.
 */
import { assert } from "chai";
import { getCensus, homeCount, presentCount, resetCensusForTest } from "../../src/Empire/census";

const g: any = global;

function creep(role: string, opts: { home?: string; here?: string; target?: string; sourceId?: string; body?: string[] }) {
    return {
        memory: { role, homeRoom: opts.home, targetRoom: opts.target, sourceId: opts.sourceId },
        room: opts.here ? { name: opts.here } : undefined,
        body: (opts.body || []).map(t => ({ type: t })),
    };
}

describe("empire census", () => {
    beforeEach(() => { resetCensusForTest(); g.Game = { time: 100, creeps: {}, rooms: {} }; });
    afterEach(() => { resetCensusForTest(); });

    it("home = homeRoom (else the room stood in) AND targetRoom is home/unset; present = where it stands; target = targetRoom", () => {
        g.Game.creeps = {
            a: creep("carry", { home: "A", here: "B", target: "C" }),   // remote crew of A, standing in B, aimed at C
            b: creep("carry", { home: "A", here: "A" }),                // A's own hauler
            c: creep("filler", { here: "B" }),                          // no homeRoom: home is where it stands
            d: creep("EnergyMiner", { home: "A", here: "A", target: "A", sourceId: "s1", body: [WORK, WORK, MOVE] }),
        };
        const c = getCensus();
        assert.equal(c.total, 4);
        assert.equal(homeCount(c, "A", "carry"), 1, "the remote crew member is not A's home crew");
        assert.equal(presentCount(c, "B", "carry"), 1);
        assert.deepEqual(c.target["C"], { carry: 1 });
        assert.equal(homeCount(c, "B", "filler"), 1, "a filler with no homeRoom belongs to the room it stands in");
        assert.equal(presentCount(c, "B", "filler"), 1);
        assert.equal(homeCount(c, "A", "EnergyMiner"), 1, "targetRoom === home still counts as home crew");
        assert.deepEqual(c.minersBySource["s1"], { count: 1, work: 2, real: 1, stopgaps: [], reals: ["d"] });
        assert.equal(homeCount(c, "Z", "carry"), 0);
        assert.equal(presentCount(c, "Z", "carry"), 0);
    });

    it("minersBySource keys by sourceId across rooms and sums WORK", () => {
        g.Game.creeps = {
            m1: creep("EnergyMiner", { home: "A", here: "A", sourceId: "s1", body: [WORK, WORK, WORK, WORK, WORK, MOVE] }),
            m2: creep("EnergyMiner", { home: "A", here: "A", sourceId: "s1", body: [WORK, MOVE] }),
            m3: creep("EnergyMiner", { home: "A", here: "R", target: "R", sourceId: "s9", body: [WORK, WORK, MOVE] }),
            x: creep("upgrader", { home: "A", here: "A", sourceId: "s1", body: [WORK] }),
        };
        const c = getCensus();
        assert.deepEqual(c.minersBySource["s1"], { count: 2, work: 6, real: 2, stopgaps: [], reals: ["m1", "m2"] });
        assert.deepEqual(c.minersBySource["s9"], { count: 1, work: 2, real: 1, stopgaps: [], reals: ["m3"] });
        assert.isUndefined(c.minersBySource["nope"]);
    });

    it("is cached per tick and recomputed on a new tick or an explicit reset", () => {
        g.Game.creeps = { a: creep("carry", { home: "A", here: "A" }) };
        const first = getCensus();
        g.Game.creeps["b"] = creep("carry", { home: "A", here: "A" });
        assert.strictEqual(getCensus(), first, "same tick: same object");
        assert.equal(homeCount(getCensus(), "A", "carry"), 1);
        g.Game.time = 101;
        assert.equal(homeCount(getCensus(), "A", "carry"), 2, "new tick: recomputed");
        g.Game.creeps["c"] = creep("carry", { home: "A", here: "A" });
        resetCensusForTest();
        assert.equal(homeCount(getCensus(), "A", "carry"), 3, "explicit reset: recomputed");
    });

    it("tolerates creeps with no memory, no room and no body", () => {
        g.Game.creeps = { ghost: {} as any, half: { memory: { role: "EnergyMiner", sourceId: "s" } } as any };
        const c = getCensus();
        assert.equal(c.total, 2);
        assert.deepEqual(c.minersBySource["s"], { count: 1, work: 0, real: 1, stopgaps: [], reals: ["half"] });
    });
});
