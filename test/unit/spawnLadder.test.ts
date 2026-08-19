/**
 * The critical-needs spawn ladder (src/Rooms/spawnLadder.ts) — the floor under
 * spawning. These run the real functions: the pure decision over hand-built
 * views, and the game-side runner against a stub spawn. docs/EMPIRE-LAYER.md.
 */
import { assert } from "chai";
import {
    bestMinerBody,
    bestHaulerBody,
    bodyCost,
    parseQueue,
    decideLadder,
    buildLadderView,
    runSpawnLadder,
    resetLadderForTest,
    yieldStopgaps,
    LadderView,
    LADDER_MAX_WAIT,
    TINY_CARRIER_RECYCLE_CAP,
} from "../../src/Rooms/spawnLadder";
import { resetCensusForTest, getCensus } from "../../src/Empire/census";

const g: any = global;

function view(over: Partial<LadderView> & { sources?: any[] }): LadderView {
    const sources = over.sources || [{ id: "A", range: 5, hostile: false }, { id: "B", range: 9, hostile: false }];
    const miners: any = {};
    for (const s of sources) miners[s.id] = { count: 0, work: 0 };
    return {
        name: "W1N1",
        rcl: 1,
        energy: 300,
        cap: 300,
        sources,
        miners,
        haulers: 0,
        fillers: 0,
        hasStorage: false,
        storageEnergy: 0,
        danger: false,
        queue: [],
        waited: 0,
        waitKey: null,
        ...over,
        // callers pass miners as a partial map; fill the rest with zeros
        ...(over.miners ? { miners: { ...miners, ...over.miners } } : {}),
    } as LadderView;
}

function queued(idx: number, role: string, cost: number, extra: any = {}) {
    return { idx, role, cost, name: role + "-" + idx, ...extra };
}

describe("spawnLadder: body tables", () => {
    it("bestMinerBody climbs the tiers and never overspends", () => {
        assert.isNull(bestMinerBody(149));
        assert.deepEqual(bestMinerBody(150), [WORK, MOVE]);
        assert.deepEqual(bestMinerBody(249), [WORK, MOVE]);
        assert.deepEqual(bestMinerBody(250), [WORK, WORK, MOVE]);
        assert.deepEqual(bestMinerBody(350), [WORK, WORK, WORK, MOVE]);
        assert.deepEqual(bestMinerBody(450), [WORK, WORK, WORK, WORK, MOVE]);
        assert.deepEqual(bestMinerBody(550), [WORK, WORK, WORK, WORK, WORK, MOVE]);
        assert.deepEqual(bestMinerBody(600), [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE]);
        assert.deepEqual(bestMinerBody(5000), [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE]);
        for (let e = 0; e <= 700; e += 10) {
            const b = bestMinerBody(e);
            if (b) assert.isAtMost(bodyCost(b), e, "over budget at " + e);
        }
    });

    it("bestHaulerBody builds 1:1 pairs plus one odd CARRY, capped, never over budget", () => {
        assert.isNull(bestHaulerBody(99, 1));
        assert.deepEqual(bestHaulerBody(100, 1), [CARRY, MOVE]);
        assert.deepEqual(bestHaulerBody(150, 1), [CARRY, CARRY, MOVE]);
        assert.deepEqual(bestHaulerBody(200, 1), [CARRY, CARRY, MOVE, MOVE]);
        assert.deepEqual(bestHaulerBody(250, 1), [CARRY, CARRY, CARRY, MOVE, MOVE]);
        assert.deepEqual(bestHaulerBody(300, 1), [CARRY, CARRY, CARRY, MOVE, MOVE, MOVE]);
        assert.lengthOf(bestHaulerBody(5000, 1) as string[], 12, "maxParts default 12");
        assert.lengthOf(bestHaulerBody(5000, 1, 6) as string[], 6);
        for (let e = 0; e <= 900; e += 10) {
            const b = bestHaulerBody(e, 1);
            if (b) assert.isAtMost(bodyCost(b), e, "over budget at " + e);
        }
    });

    it("bestHaulerBody enforces minCarry with the slow [C x min, M] fallback, or refuses", () => {
        assert.isNull(bestHaulerBody(150, 3), "150 cannot buy 3 CARRY + MOVE");
        assert.isNull(bestHaulerBody(199, 3));
        assert.deepEqual(bestHaulerBody(200, 3), [CARRY, CARRY, CARRY, MOVE]);
        assert.deepEqual(bestHaulerBody(250, 3), [CARRY, CARRY, CARRY, MOVE, MOVE]);
        assert.deepEqual(bestHaulerBody(300, 3), [CARRY, CARRY, CARRY, MOVE, MOVE, MOVE]);
        for (let e = 0; e <= 900; e += 10) {
            const b = bestHaulerBody(e, 3);
            if (b) {
                assert.isAtMost(bodyCost(b), e);
                assert.isAtLeast(b.filter(p => p === CARRY).length, 3, "min CARRY at " + e);
            }
        }
    });
});

describe("spawnLadder: parseQueue", () => {
    it("reads flat [body, name, opts] triples with the triple offset as idx", () => {
        const q: any[] = [
            [WORK, MOVE], "EnergyMiner-1", { memory: { role: "EnergyMiner", sourceId: "A", targetRoom: "W1N1" } },
            [CARRY, MOVE], "Carrier-2", { memory: { role: "carry", targetRoom: "W2N1" } },
            "junk", "x", {},
            [MOVE], "Scout-3", undefined,
        ];
        const p = parseQueue(q);
        assert.lengthOf(p, 3, "the string-bodied entry is skipped");
        assert.deepEqual(p[0], { idx: 0, role: "EnergyMiner", sourceId: "A", targetRoom: "W1N1", cost: 150, name: "EnergyMiner-1" });
        assert.equal(p[1].idx, 3);
        assert.equal(p[1].targetRoom, "W2N1");
        assert.equal(p[2].role, "?");
        assert.equal(p[2].cost, 50);
        assert.deepEqual(parseQueue([]), []);
        assert.deepEqual(parseQueue(undefined as any), []);
    });
});

describe("spawnLadder: decideLadder — miner floor (R1)", () => {
    it("with ZERO income spawns the first miner the moment 150 is affordable, on the nearest source", () => {
        assert.equal((decideLadder(view({ energy: 0 })) as any).kind, "wait");
        assert.equal((decideLadder(view({ energy: 149 })) as any).kind, "wait");
        const a: any = decideLadder(view({ energy: 150, cap: 300 }));
        assert.equal(a.kind, "spawn");
        assert.equal(a.rung, "miner");
        assert.deepEqual(a.body, [WORK, MOVE]);
        assert.deepEqual(a.memory, { role: "EnergyMiner", sourceId: "A", targetRoom: "W1N1", homeRoom: "W1N1" });
        assert.isTrue(a.stopgap, "smaller than the 250 the cap allows");
        assert.isUndefined(a.dropIdx);
    });

    it("spends what it has: 300 buys [W,W,M], 550 buys the 5W miner", () => {
        assert.deepEqual((decideLadder(view({ energy: 300, cap: 300 })) as any).body, [WORK, WORK, MOVE]);
        const a: any = decideLadder(view({ energy: 550, cap: 1800 }));
        assert.deepEqual(a.body, [WORK, WORK, WORK, WORK, WORK, MOVE]);
        assert.isFalse(a.stopgap, "5 WORK saturates the source: that IS the real miner, whatever the cap");
        assert.isFalse((decideLadder(view({ energy: 600, cap: 1800 })) as any).stopgap);
        assert.isTrue((decideLadder(view({ energy: 450, cap: 1800 })) as any).stopgap, "4 WORK where 5 fit is a stopgap");
    });

    it("pulls a queued affordable miner for that source forward, even from deep in the queue", () => {
        const q = [
            queued(0, "upgrader", 1300),
            queued(3, "builder", 400),
            queued(6, "EnergyMiner", 250, { sourceId: "A" }),
        ];
        const a: any = decideLadder(view({ energy: 260, cap: 1800, queue: q }));
        assert.equal(a.kind, "pull");
        assert.equal(a.idx, 6);
        assert.equal(a.rung, "miner");
    });

    it("does not pull a queued miner for a DIFFERENT source or a REMOTE", () => {
        const q = [queued(0, "EnergyMiner", 250, { sourceId: "Z", targetRoom: "W9N9" })];
        const a: any = decideLadder(view({ energy: 260, cap: 1800, queue: q }));
        assert.equal(a.kind, "spawn");
        assert.isUndefined(a.dropIdx);
    });

    it("with a queued UNAFFORDABLE miner: a STOPGAP keeps the queued one (it is the upgrade path)", () => {
        const q = [queued(0, "EnergyMiner", 750, { sourceId: "A" })];
        const a: any = decideLadder(view({ energy: 260, cap: 1800, queue: q }));
        assert.equal(a.kind, "spawn");
        assert.deepEqual(a.body, [WORK, WORK, MOVE]);
        assert.isTrue(a.stopgap);
        assert.isUndefined(a.dropIdx, "the 750 miner stays queued and hatches when affordable");
    });

    it("a queued entry BIGGER than the ladder body makes the ladder body a stopgap, even a 5W one", () => {
        const q = [queued(0, "EnergyMiner", 750, { sourceId: "A" })];
        const a: any = decideLadder(view({ energy: 600, cap: 1800, queue: q }));
        assert.equal(a.kind, "spawn");
        assert.deepEqual(a.body, [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE]);
        assert.isTrue(a.stopgap, "the producer queued something bigger — that is the real one");
        assert.isUndefined((a as any).dropIdx, "the ladder never removes a bigger queued entry");
    });

    it("link-era source: CARRY-bearing body, always a stopgap, real link miner left queued (review C1/C5/C8)", () => {
        const linkedSources = [{ id: "A", range: 5, hostile: false, linked: true }, { id: "B", range: 9, hostile: false, linked: true }];
        const q = [queued(0, "EnergyMiner", 1500, { sourceId: "A" })];
        const a: any = decideLadder(view({ rcl: 6, energy: 900, cap: 2300, sources: linkedSources, queue: q, hasStorage: true, storageEnergy: 0 }));
        assert.equal(a.kind, "spawn");
        assert.include(a.body, CARRY, "a CARRY-less miner would drop-mine a link source for a creep-life");
        assert.deepEqual(a.body, [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE]);
        assert.isTrue(a.stopgap);
        assert.isUndefined((a as any).dropIdx);
        const b: any = decideLadder(view({ rcl: 6, energy: 250, cap: 2300, sources: linkedSources, hasStorage: true }));
        assert.deepEqual(b.body, [WORK, CARRY, MOVE], "cheapest link body at 250 is [W,C,M]");
        assert.isTrue(b.stopgap);
        assert.equal((decideLadder(view({ rcl: 6, energy: 199, cap: 2300, sources: linkedSources, hasStorage: true })) as any).kind, "wait");
    });

    it("bestMinerBody(linked) climbs the CARRY table", () => {
        assert.isNull(bestMinerBody(199, true));
        assert.deepEqual(bestMinerBody(200, true), [WORK, CARRY, MOVE]);
        assert.deepEqual(bestMinerBody(300, true), [WORK, WORK, CARRY, MOVE]);
        assert.deepEqual(bestMinerBody(400, true), [WORK, WORK, WORK, CARRY, MOVE]);
        assert.deepEqual(bestMinerBody(500, true), [WORK, WORK, WORK, WORK, CARRY, MOVE]);
        assert.deepEqual(bestMinerBody(600, true), [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE]);
        assert.deepEqual(bestMinerBody(650, true), [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE]);
        for (let e = 0; e <= 900; e += 10) { const b = bestMinerBody(e, true); if (b) { assert.isAtMost(bodyCost(b), e); assert.include(b, CARRY); } }
    });

    it("a banked room with live fillers is not dead: it waits (bounded) for a fuller miner instead of buying [W,M] (review, refuted-but-right)", () => {
        const banked = { rcl: 5, energy: 150, cap: 1800, hasStorage: true, storageEnergy: 50000, fillers: 1, haulers: 1 };
        const a: any = decideLadder(view(banked));
        assert.equal(a.kind, "wait");
        const b: any = decideLadder(view({ ...banked, waitKey: a.key, waited: LADDER_MAX_WAIT }));
        assert.equal(b.kind, "spawn", "…but only for LADDER_MAX_WAIT ticks");
        const dead: any = decideLadder(view({ ...banked, fillers: 0 }));
        assert.equal(dead.kind, "spawn", "no fillers: the bank cannot reach the spawn, the room is dead, spend now");
    });

    it("skips a source with a ranged hostile on it and staffs the other", () => {
        const a: any = decideLadder(view({
            energy: 300, cap: 300,
            sources: [{ id: "A", range: 5, hostile: true }, { id: "B", range: 9, hostile: false }],
        }));
        assert.equal(a.kind, "spawn");
        assert.equal(a.memory.sourceId, "B");
    });

    it("with income and a poor purse it starts a BOUNDED wait for a fuller body, then spends", () => {
        const base = { energy: 250, cap: 1800, miners: { A: { count: 1, work: 5 } }, haulers: 1 };
        const first: any = decideLadder(view(base));
        assert.equal(first.kind, "wait");
        assert.equal(first.key, "miner:B");
        const during: any = decideLadder(view({ ...base, waitKey: "miner:B", waited: LADDER_MAX_WAIT - 1 }));
        assert.equal(during.kind, "wait");
        const after: any = decideLadder(view({ ...base, waitKey: "miner:B", waited: LADDER_MAX_WAIT }));
        assert.equal(after.kind, "spawn");
        assert.equal(after.memory.sourceId, "B");
        assert.deepEqual(after.body, [WORK, WORK, MOVE]);
        assert.isTrue(after.stopgap);
    });

    it("with income does NOT wait when the affordable body is already the best the cap allows", () => {
        const a: any = decideLadder(view({ energy: 300, cap: 300, miners: { A: { count: 1, work: 2 } }, haulers: 1 }));
        assert.equal(a.kind, "spawn");
        assert.equal(a.memory.sourceId, "B");
    });

    it("an R1 wait does not block the hauler floor: 120 energy, one staffed source, no haulers -> [C,M]", () => {
        const a: any = decideLadder(view({ energy: 120, cap: 300, miners: { A: { count: 1, work: 2 } } }));
        assert.equal(a.kind, "spawn");
        assert.equal(a.rung, "hauler");
        assert.deepEqual(a.body, [CARRY, MOVE]);
        assert.deepEqual(a.memory, { role: "carry", sourceId: "A", targetRoom: "W1N1", homeRoom: "W1N1" });
    });

    it("with zero income and nothing affordable, does not spend the 100 on a hauler nobody feeds", () => {
        const a: any = decideLadder(view({ energy: 120, cap: 300 }));
        assert.equal(a.kind, "wait");
        assert.equal(a.rung, "miner");
    });
});

describe("spawnLadder: decideLadder — hauler and filler floors (R2/R2b)", () => {
    const staffed = { A: { count: 1, work: 5 }, B: { count: 1, work: 5 } };

    it("floor met (miner per source, a hauler) -> null; the ladder gets out of the way", () => {
        assert.isNull(decideLadder(view({ miners: staffed, haulers: 1 })));
        assert.isNull(decideLadder(view({ rcl: 6, cap: 1950, energy: 102, hasStorage: true, storageEnergy: 0, miners: staffed, haulers: 2, fillers: 1 })));
    });

    it("no hauler at all -> a carry aimed at a staffed source, best body affordable", () => {
        const a: any = decideLadder(view({ energy: 300, cap: 300, miners: staffed }));
        assert.equal(a.rung, "hauler");
        assert.deepEqual(a.body, [CARRY, CARRY, CARRY, MOVE, MOVE, MOVE]);
        assert.equal(a.memory.role, "carry");
        assert.equal(a.memory.sourceId, "A");
        assert.isTrue(a.stopgap, "always a stopgap");
    });

    it("cap >= " + TINY_CARRIER_RECYCLE_CAP + " never builds a carrier the recycler would kill on sight", () => {
        assert.equal((decideLadder(view({ energy: 150, cap: 1800, miners: staffed })) as any).kind, "wait");
        const a: any = decideLadder(view({ energy: 200, cap: 1800, miners: staffed }));
        assert.equal(a.rung, "hauler");
        assert.deepEqual(a.body, [CARRY, CARRY, CARRY, MOVE]);
        for (let e = 100; e <= 1800; e += 50) {
            const x: any = decideLadder(view({ energy: e, cap: 1800, miners: staffed }));
            if (x && x.kind === "spawn") assert.isAtLeast(x.body.filter((p: string) => p === CARRY).length, 3, "at " + e);
        }
    });

    it("pulls a queued affordable home carry forward; ignores remote carries", () => {
        const q = [queued(0, "carry", 300, { targetRoom: "W9N9" }), queued(3, "carry", 200)];
        const a: any = decideLadder(view({ energy: 250, cap: 300, miners: staffed, queue: q }));
        assert.equal(a.kind, "pull");
        assert.equal(a.idx, 3);
    });

    it("a link-hauled source is not a floor for a carry", () => {
        const both = [{ id: "A", range: 5, hostile: false, linked: true }, { id: "B", range: 9, hostile: false, linked: true }];
        const one = [{ id: "A", range: 5, hostile: false, linked: true }, { id: "B", range: 9, hostile: false }];
        assert.isNull(decideLadder(view({ energy: 300, cap: 1800, miners: staffed, sources: both })));
        const a: any = decideLadder(view({ energy: 300, cap: 1800, miners: staffed, sources: one }));
        assert.equal(a.rung, "hauler");
        assert.equal(a.memory.sourceId, "B", "the carry is aimed at the un-linked source");
        assert.isTrue(a.stopgap, "ladder carriers are always stopgaps: the producer sizes the real one");
    });

    it("RCL4+ with a storage and no filler -> filler, ordered before the carry when the storage holds energy", () => {
        const a: any = decideLadder(view({ rcl: 5, energy: 300, cap: 1800, miners: staffed, hasStorage: true, storageEnergy: 5000 }));
        assert.equal(a.rung, "filler");
        assert.deepEqual(a.memory, { role: "filler" });
        assert.isTrue(a.stopgap);
        assert.deepEqual(a.body, [CARRY, CARRY, CARRY, MOVE, MOVE, MOVE]);
        const b: any = decideLadder(view({ rcl: 5, energy: 300, cap: 1800, miners: staffed, hasStorage: true, storageEnergy: 0 }));
        assert.equal(b.rung, "hauler", "empty storage: something must fill it first");
        const c: any = decideLadder(view({ rcl: 5, energy: 300, cap: 1800, miners: staffed, hasStorage: true, storageEnergy: 0, haulers: 1 }));
        assert.equal(c.rung, "filler", "haulers exist, storage empty: the filler is what is missing");
    });

    it("no filler floor below RCL4 or without a storage", () => {
        assert.isNull(decideLadder(view({ rcl: 3, energy: 300, cap: 800, miners: staffed, haulers: 1 })));
        assert.isNull(decideLadder(view({ rcl: 5, energy: 300, cap: 1800, miners: staffed, haulers: 1, hasStorage: false })));
    });

    it("filler: pull when one is queued and affordable; a queued unaffordable one is left for later (review C2)", () => {
        const pull: any = decideLadder(view({ rcl: 5, energy: 300, cap: 1800, miners: staffed, haulers: 1, hasStorage: true, storageEnergy: 9000, queue: [queued(0, "filler", 300)] }));
        assert.equal(pull.kind, "pull");
        const keep: any = decideLadder(view({ rcl: 5, energy: 300, cap: 1800, miners: staffed, haulers: 1, hasStorage: true, storageEnergy: 9000, queue: [queued(0, "filler", 900)] }));
        assert.equal(keep.kind, "spawn");
        assert.isTrue(keep.stopgap, "ladder fillers are always stopgaps");
        assert.isUndefined((keep as any).dropIdx, "the queued real filler still hatches when affordable");
    });
});

describe("spawnLadder: decideLadder — danger", () => {
    it("yields to an AFFORDABLE defensive head, even with zero miners", () => {
        const q = [queued(0, "RampartDefender", 250)];
        assert.isNull(decideLadder(view({ energy: 300, cap: 300, danger: true, queue: q })));
    });

    it("does not yield to an UNAFFORDABLE defensive head — a mute spawn is how a raid becomes a wipe", () => {
        const q = [queued(0, "RampartDefender", 900)];
        const a: any = decideLadder(view({ energy: 300, cap: 1800, danger: true, queue: q }));
        assert.equal(a.kind, "spawn");
        assert.equal(a.rung, "miner");
    });

    it("does not yield to a non-defensive head just because danger is set", () => {
        const q = [queued(0, "upgrader", 200)];
        const a: any = decideLadder(view({ energy: 300, cap: 300, danger: true, queue: q }));
        assert.equal(a.kind, "spawn");
    });
});

describe("spawnLadder: decideLadder — invariants over a grid", () => {
    it("never returns a body costing more than energy, and never acts on a met floor", () => {
        for (let energy = 0; energy <= 2000; energy += 37) {
            for (const cap of [300, 550, 800, 1300, 1800, 2300, 5600]) {
                if (energy > cap) continue;
                for (const miners of [{}, { A: { count: 1, work: 5 } }, { A: { count: 1, work: 5 }, B: { count: 1, work: 5 } }]) {
                    for (const haulers of [0, 1]) {
                        const v = view({ energy, cap, miners, haulers, rcl: cap >= 1300 ? 5 : 2, hasStorage: cap >= 1300, storageEnergy: 500, fillers: 1 });
                        const a: any = decideLadder(v);
                        if (a && a.kind === "spawn") assert.isAtMost(bodyCost(a.body), energy, `energy ${energy} cap ${cap}`);
                        const met = Object.keys(miners).length === 2 && haulers === 1;
                        if (met) assert.isNull(a, `floor met at energy ${energy} cap ${cap} but got ${a && a.kind}`);
                    }
                }
            }
        }
    });
});

/* ------------------------------------------------------------------------ */

function fakeSpawn(rc: number | ((body: string[], name: string, opts: any) => number)) {
    const calls: any[] = [];
    return {
        spawning: null as any,
        pos: { getRangeTo: (o: any) => (o && o.range) || 0 },
        calls,
        spawnCreep(body: string[], name: string, opts: any) {
            calls.push({ body: body.slice(), name, opts: JSON.parse(JSON.stringify(opts || {})) });
            return typeof rc === "function" ? rc(body, name, opts) : rc;
        },
    };
}

function fakeRoom(o: { name?: string; rcl?: number; energy: number; cap: number; sources?: number; storage?: number | null; danger?: boolean; queue?: any[]; my?: boolean; hostiles?: any[] }) {
    const name = o.name || "W1N1";
    const src: any[] = [];
    for (let i = 0; i < (o.sources === undefined ? 2 : o.sources); i++) src.push({ id: name + ":s" + i, range: 5 + i, pos: { getRangeTo: (h: any) => (h && h.dist) || 50 } });
    const room: any = {
        name,
        controller: { my: o.my !== false, level: o.rcl || 1 },
        energyAvailable: o.energy,
        energyCapacityAvailable: o.cap,
        storage: o.storage === undefined || o.storage === null ? undefined : { my: true, store: { energy: o.storage } },
        memory: { danger: !!o.danger, spawn_list: o.queue || [], data: { c_spawned: 0 } },
        find(kind: number) {
            if (kind === FIND_SOURCES) return src;
            if (kind === FIND_HOSTILE_CREEPS) return o.hostiles || [];
            return [];
        },
    };
    return room;
}

function withGame(creeps: any, fn: () => void, time = 1000) {
    const prev = g.Game;
    g.Game = { time, creeps, rooms: {}, cpu: { bucket: 500, limit: 20 } };
    resetCensusForTest();
    resetLadderForTest();
    try { fn(); } finally { g.Game = prev; resetCensusForTest(); }
}

describe("spawnLadder: runSpawnLadder against a stub spawn", () => {
    it("spawns a miner with the ladder name/memory, bumps c_spawned, clears the wait state, returns true", () => {
        withGame({}, () => {
            const room = fakeRoom({ energy: 300, cap: 300 });
            room.memory._ladder = { k: "miner:W1N1:s0", s: 990 };
            const spawn = fakeSpawn(OK);
            assert.isTrue(runSpawnLadder(room, spawn));
            assert.lengthOf(spawn.calls, 1);
            const c = spawn.calls[0];
            assert.match(c.name, /^EnergyMiner-L1000-W1N1$/);
            assert.deepEqual(c.body, [WORK, WORK, MOVE]);
            assert.equal(c.opts.memory.role, "EnergyMiner");
            assert.equal(c.opts.memory.sourceId, "W1N1:s0");
            assert.equal(c.opts.memory.viaLadder, 1000);
            assert.isUndefined(c.opts.memory.stopgap, "300 is the best a 300-cap room can do");
            assert.equal(room.memory.data.c_spawned, 1);
            assert.isUndefined(room.memory._ladder);
        });
    });

    it("marks stopgaps, and a hauler is named Carrier-, a filler Filler-", () => {
        withGame({
            m1: { memory: { role: "EnergyMiner", homeRoom: "W1N1", sourceId: "W1N1:s0" }, room: { name: "W1N1" }, body: [{ type: WORK }] },
            m2: { memory: { role: "EnergyMiner", homeRoom: "W1N1", sourceId: "W1N1:s1" }, room: { name: "W1N1" }, body: [{ type: WORK }] },
        }, () => {
            const room = fakeRoom({ energy: 200, cap: 1800, rcl: 5, storage: 0 });
            const spawn = fakeSpawn(OK);
            assert.isTrue(runSpawnLadder(room, spawn));
            assert.match(spawn.calls[0].name, /^Carrier-L/);
            assert.isTrue(spawn.calls[0].opts.memory.stopgap);
            assert.deepEqual(spawn.calls[0].body, [CARRY, CARRY, CARRY, MOVE]);
        });
        withGame({
            m1: { memory: { role: "EnergyMiner", homeRoom: "W1N1", sourceId: "W1N1:s0" }, room: { name: "W1N1" }, body: [{ type: WORK }] },
            m2: { memory: { role: "EnergyMiner", homeRoom: "W1N1", sourceId: "W1N1:s1" }, room: { name: "W1N1" }, body: [{ type: WORK }] },
            h1: { memory: { role: "carry", homeRoom: "W1N1", targetRoom: "W1N1" }, room: { name: "W1N1" }, body: [{ type: CARRY }] },
        }, () => {
            const room = fakeRoom({ energy: 300, cap: 1800, rcl: 5, storage: 4000 });
            const spawn = fakeSpawn(OK);
            assert.isTrue(runSpawnLadder(room, spawn));
            assert.match(spawn.calls[0].name, /^Filler-L/);
            assert.deepEqual(spawn.calls[0].opts.memory, { role: "filler", viaLadder: 1000, stopgap: true }, "ladder fillers are always stopgaps");
        });
    });

    it("pull: spawns the queued entry verbatim and splices exactly that triple", () => {
        withGame({}, () => {
            const opts = { memory: { role: "EnergyMiner", sourceId: "W1N1:s0", targetRoom: "W1N1", homeRoom: "W1N1" } };
            const room = fakeRoom({ energy: 260, cap: 1800, queue: [
                [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, MOVE], "Upgrader-big", { memory: { role: "upgrader" } },
                [WORK, WORK, MOVE], "EnergyMiner-queued", opts,
                [CARRY, MOVE], "Carrier-x", { memory: { role: "carry", targetRoom: "W1N1" } },
            ] });
            const spawn = fakeSpawn(OK);
            assert.isTrue(runSpawnLadder(room, spawn));
            assert.equal(spawn.calls[0].name, "EnergyMiner-queued");
            assert.deepEqual(spawn.calls[0].opts, opts);
            assert.lengthOf(room.memory.spawn_list, 6);
            assert.equal(room.memory.spawn_list[1], "Upgrader-big");
            assert.equal(room.memory.spawn_list[4], "Carrier-x");
        });
    });

    it("an unaffordable queued miner is never removed — it is the upgrade path behind the ladder body", () => {
        withGame({}, () => {
            const keep = fakeRoom({ energy: 260, cap: 1800, queue: [
                [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE], "EnergyMiner-big", { memory: { role: "EnergyMiner", sourceId: "W1N1:s0", targetRoom: "W1N1" } },
            ] });
            assert.isTrue(runSpawnLadder(keep, fakeSpawn(OK)));
            assert.lengthOf(keep.memory.spawn_list, 3, "stopgap hatched: the queued real miner stays");
            const room = fakeRoom({ energy: 700, cap: 1800, queue: [
                [WORK, WORK, WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE], "EnergyMiner-big", { memory: { role: "EnergyMiner", sourceId: "W1N1:s0", targetRoom: "W1N1" } },
                [CARRY, MOVE], "Carrier-x", { memory: { role: "carry", targetRoom: "W1N1" } },
            ] });
            const spawn = fakeSpawn(OK);
            assert.isTrue(runSpawnLadder(room, spawn));
            assert.match(spawn.calls[0].name, /^EnergyMiner-L/);
            assert.deepEqual(spawn.calls[0].body, [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE]);
            assert.isTrue(spawn.calls[0].opts.memory.stopgap, "a bigger miner is queued, so this 5W body is still a stopgap");
            assert.lengthOf(room.memory.spawn_list, 6, "nothing removed: the 850 miner hatches when affordable");
            assert.equal(room.memory.spawn_list[1], "EnergyMiner-big");
        });
    });

    it("wait: records the wait key once and keeps the start tick", () => {
        withGame({
            m1: { memory: { role: "EnergyMiner", homeRoom: "W1N1", sourceId: "W1N1:s0" }, room: { name: "W1N1" }, body: [{ type: WORK }] },
            h1: { memory: { role: "carry", homeRoom: "W1N1" }, room: { name: "W1N1" }, body: [{ type: CARRY }] },
        }, () => {
            const room = fakeRoom({ energy: 250, cap: 1800 });
            const spawn = fakeSpawn(OK);
            assert.isFalse(runSpawnLadder(room, spawn));
            assert.deepEqual(room.memory._ladder, { k: "miner:W1N1:s1", s: 1000 });
            g.Game.time = 1010;
            assert.isFalse(runSpawnLadder(room, spawn));
            assert.equal(room.memory._ladder.s, 1000, "start tick is kept while the need is the same");
            assert.lengthOf(spawn.calls, 0);
        });
    });

    it("does nothing while the spawn is busy, when the room is not ours, or on a foreign controller", () => {
        withGame({}, () => {
            const busy = fakeSpawn(OK); busy.spawning = { name: "x" };
            assert.isFalse(runSpawnLadder(fakeRoom({ energy: 300, cap: 300 }), busy));
            assert.lengthOf(busy.calls, 0);
            const s2 = fakeSpawn(OK);
            assert.isFalse(runSpawnLadder(fakeRoom({ energy: 300, cap: 300, my: false }), s2));
            assert.lengthOf(s2.calls, 0);
            const s3 = fakeSpawn(OK);
            const noCtrl = fakeRoom({ energy: 300, cap: 300 }); noCtrl.controller = undefined;
            assert.isFalse(runSpawnLadder(noCtrl, s3));
        });
    });

    it("returns false when spawnCreep fails, retries once on ERR_NAME_EXISTS, and never splices on failure", () => {
        withGame({}, () => {
            const room = fakeRoom({ energy: 260, cap: 1800, queue: [
                [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE], "EnergyMiner-big", { memory: { role: "EnergyMiner", sourceId: "W1N1:s0", targetRoom: "W1N1" } },
            ] });
            const busy = fakeSpawn(ERR_BUSY);
            assert.isFalse(runSpawnLadder(room, busy));
            assert.lengthOf(room.memory.spawn_list, 3, "queue untouched on failure");
            let n = 0;
            const clash = fakeSpawn(() => (n++ === 0 ? ERR_NAME_EXISTS : OK));
            assert.isTrue(runSpawnLadder(room, clash));
            assert.lengthOf(clash.calls, 2);
            assert.notEqual(clash.calls[0].name, clash.calls[1].name);
        });
    });

    it("buildLadderView: sources sorted nearest first, hostiles only consulted in danger, link cache respected", () => {
        withGame({
            m1: { memory: { role: "EnergyMiner", homeRoom: "W1N1", sourceId: "W1N1:s1" }, room: { name: "W1N1" }, body: [{ type: WORK }, { type: WORK }] },
            pass: { memory: { role: "carry", homeRoom: "W9N9", targetRoom: "W8N8" }, room: { name: "W1N1" }, body: [{ type: CARRY }] },
        }, () => {
            const ranged = { dist: 2, pos: {}, getActiveBodyparts: (p: string) => (p === RANGED_ATTACK ? 1 : 0) };
            const room = fakeRoom({ energy: 100, cap: 800, danger: true, hostiles: [ranged] });
            room.memory.linkHaulBySource = { "W1N1:s1": { v: true, t: 990 }, "W1N1:s0": { v: true, t: 1 } };
            const v = buildLadderView(room, fakeSpawn(OK));
            assert.deepEqual(v.sources.map(s => s.id), ["W1N1:s0", "W1N1:s1"]);
            assert.isTrue(v.sources[0].hostile, "ranged hostile within 4 of every source (stub dist 2)");
            assert.deepEqual(v.miners["W1N1:s1"], { count: 1, work: 2 });
            assert.equal(v.haulers, 0, "a remote carrier merely passing through is NOT this room's hauler (review C1)");
            assert.isTrue(v.sources[1].linked, "fresh link record");
            assert.isFalse(v.sources[0].linked, "stale link record (>200t) is not trusted, and RCL1 is not the link era");
            assert.equal(v.rcl, 1);
            assert.isTrue(v.danger);
            const calm = fakeRoom({ energy: 100, cap: 800, danger: false, hostiles: [ranged] });
            assert.isFalse(buildLadderView(calm, fakeSpawn(OK)).sources[0].hostile, "no danger flag: hostiles are not scanned");
        });
    });
});

/* ------------------------------------------------------------------------ */
/* Review-driven: stopgaps yield, pull failures do not loop, lastSpawn stamp  */
/* ------------------------------------------------------------------------ */

function liveCreep(name: string, memory: any, opts: { spawning?: boolean; range?: number; room?: string } = {}) {
    const c: any = {
        name,
        memory,
        spawning: !!opts.spawning,
        room: { name: opts.room || "W1N1" },
        body: [{ type: WORK }],
        pos: { getRangeTo: () => (opts.range === undefined ? 1 : opts.range) },
        killed: false,
        suicide() { this.killed = true; return OK; },
    };
    return c;
}

function freshCensus() {
    resetCensusForTest();
    return getCensus();
}

describe("spawnLadder: stopgaps yield to the real creep (review C2/C3/C7/C9)", () => {
    it("a stopgap miner suicides once a REAL miner for its source is hatched and within 2 of the source", () => {
        const stop = liveCreep("EnergyMiner-L1-W1N1", { role: "EnergyMiner", homeRoom: "W1N1", sourceId: "W1N1:s0", stopgap: true });
        const realFar = liveCreep("EnergyMiner-real", { role: "EnergyMiner", homeRoom: "W1N1", sourceId: "W1N1:s0" }, { range: 9 });
        withGame({ [stop.name]: stop, [realFar.name]: realFar }, () => {
            const room = fakeRoom({ energy: 300, cap: 1800 });
            const sources = room.find(FIND_SOURCES);
            assert.equal(yieldStopgaps(room, freshCensus(), sources), 0, "real miner still walking (range 9): no yield yet");
            assert.isFalse(stop.killed);
            realFar.pos.getRangeTo = () => 2;
            assert.equal(yieldStopgaps(room, freshCensus(), sources), 1);
            assert.isTrue(stop.killed);
        });
    });

    it("a hatching real miner does not trigger the yield; a stopgap never yields to another stopgap", () => {
        const stop = liveCreep("EnergyMiner-L1-W1N1", { role: "EnergyMiner", homeRoom: "W1N1", sourceId: "W1N1:s0", stopgap: true });
        const hatching = liveCreep("EnergyMiner-real", { role: "EnergyMiner", homeRoom: "W1N1", sourceId: "W1N1:s0" }, { spawning: true, range: 1 });
        const stop2 = liveCreep("EnergyMiner-L2-W1N1", { role: "EnergyMiner", homeRoom: "W1N1", sourceId: "W1N1:s1", stopgap: true });
        withGame({ [stop.name]: stop, [hatching.name]: hatching, [stop2.name]: stop2 }, () => {
            const room = fakeRoom({ energy: 300, cap: 1800 });
            assert.equal(yieldStopgaps(room, freshCensus(), room.find(FIND_SOURCES)), 0);
            assert.isFalse(stop.killed);
            assert.isFalse(stop2.killed);
        });
    });

    it("stopgap fillers and carries yield once a real one of their role is alive (hatched) in the room", () => {
        const sf = liveCreep("Filler-L1-W1N1", { role: "filler", stopgap: true });
        const sc = liveCreep("Carrier-L1-W1N1", { role: "carry", homeRoom: "W1N1", targetRoom: "W1N1", sourceId: "W1N1:s0", stopgap: true });
        const rf = liveCreep("Filler-real", { role: "filler" }, { spawning: true });
        withGame({ [sf.name]: sf, [sc.name]: sc, [rf.name]: rf }, () => {
            const room = fakeRoom({ energy: 300, cap: 1800, rcl: 5, storage: 5000 });
            assert.equal(yieldStopgaps(room, freshCensus(), room.find(FIND_SOURCES)), 0, "real filler still hatching");
            rf.spawning = false;
            assert.equal(yieldStopgaps(room, freshCensus(), room.find(FIND_SOURCES)), 1);
            assert.isTrue(sf.killed);
            assert.isFalse(sc.killed, "no real carry exists yet");
            delete g.Game.creeps[sf.name]; // a suicided creep is gone from Game.creeps next tick
            g.Game.creeps["Carrier-real"] = liveCreep("Carrier-real", { role: "carry", homeRoom: "W1N1", sourceId: "W1N1:s0" });
            assert.equal(yieldStopgaps(room, freshCensus(), room.find(FIND_SOURCES)), 1);
            assert.isTrue(sc.killed);
        });
    });

    it("runSpawnLadder runs the yield first: a room whose stopgap just yielded and whose real miner sits on the source spawns nothing", () => {
        const stop = liveCreep("EnergyMiner-L1-W1N1", { role: "EnergyMiner", homeRoom: "W1N1", sourceId: "W1N1:s0", stopgap: true });
        const real = liveCreep("EnergyMiner-real", { role: "EnergyMiner", homeRoom: "W1N1", sourceId: "W1N1:s0" }, { range: 1 });
        const real2 = liveCreep("EnergyMiner-real2", { role: "EnergyMiner", homeRoom: "W1N1", sourceId: "W1N1:s1" }, { range: 1 });
        const h = liveCreep("Carrier-real", { role: "carry", homeRoom: "W1N1" });
        withGame({ [stop.name]: stop, [real.name]: real, [real2.name]: real2, [h.name]: h }, () => {
            const room = fakeRoom({ energy: 1800, cap: 1800 });
            const spawn = fakeSpawn(OK);
            assert.isFalse(runSpawnLadder(room, spawn));
            assert.isTrue(stop.killed);
            assert.lengthOf(spawn.calls, 0);
        });
    });
});

describe("spawnLadder: pull failures do not loop, non-stopgap miners stamp the producer clock (review C4/C6)", () => {
    it("ERR_NAME_EXISTS on a pull renames the queued entry in place and retries with the new name", () => {
        withGame({}, () => {
            const room = fakeRoom({ energy: 300, cap: 300, queue: [
                [WORK, WORK, MOVE], "EnergyMiner-taken", { memory: { role: "EnergyMiner", sourceId: "W1N1:s0", targetRoom: "W1N1" } },
            ] });
            const spawn = fakeSpawn((body, name) => (name === "EnergyMiner-taken" ? ERR_NAME_EXISTS : OK));
            assert.isTrue(runSpawnLadder(room, spawn));
            assert.lengthOf(spawn.calls, 2);
            assert.notEqual(spawn.calls[1].name, "EnergyMiner-taken");
            assert.match(spawn.calls[1].name, /^EnergyMiner-/);
            assert.lengthOf(room.memory.spawn_list, 0, "the pulled (renamed) entry is spliced");
        });
    });

    it("ERR_INVALID_ARGS on a pull drops the unspawnable queued entry so the ladder builds its own body next tick", () => {
        withGame({}, () => {
            const room = fakeRoom({ energy: 300, cap: 300, queue: [
                [WORK, WORK, MOVE], "EnergyMiner-bad", { memory: { role: "EnergyMiner", sourceId: "W1N1:s0", targetRoom: "W1N1" } },
                [CARRY, MOVE], "Carrier-x", { memory: { role: "carry", targetRoom: "W1N1" } },
            ] });
            const bad = fakeSpawn((body, name) => (name === "EnergyMiner-bad" ? ERR_INVALID_ARGS : OK));
            assert.isFalse(runSpawnLadder(room, bad), "this tick: nothing hatched");
            assert.lengthOf(room.memory.spawn_list, 3, "the bad entry is gone, the carrier stays");
            assert.equal(room.memory.spawn_list[1], "Carrier-x");
            g.Game.time++;
            const ok = fakeSpawn(OK);
            assert.isTrue(runSpawnLadder(room, ok), "next tick: the ladder builds its own miner");
            assert.match(ok.calls[0].name, /^EnergyMiner-L/);
        });
    });

    it("a NON-stopgap ladder miner stamps resources[home].energy[src].lastSpawn; a stopgap does not", () => {
        withGame({}, () => {
            const room = fakeRoom({ energy: 600, cap: 600 });
            room.memory.resources = { W1N1: { energy: { "W1N1:s0": { lastSpawn: 5 }, "W1N1:s1": { lastSpawn: 5 } } } };
            assert.isTrue(runSpawnLadder(room, fakeSpawn(OK)));
            assert.equal(room.memory.resources.W1N1.energy["W1N1:s0"].lastSpawn, 1000, "a 5W miner is the real one: the producer clock is stamped");
            const poor = fakeRoom({ energy: 150, cap: 600 });
            poor.memory.resources = { W1N1: { energy: { "W1N1:s0": { lastSpawn: 5 } } } };
            assert.isTrue(runSpawnLadder(poor, fakeSpawn(OK)));
            assert.equal(poor.memory.resources.W1N1.energy["W1N1:s0"].lastSpawn, 5, "a stopgap leaves the clock alone so the producer queues the real miner");
        });
    });

    it("pulling a queued miner stamps the clock too (idempotent with the producer's own stamp)", () => {
        withGame({}, () => {
            const room = fakeRoom({ energy: 300, cap: 300, queue: [
                [WORK, WORK, MOVE], "EnergyMiner-q", { memory: { role: "EnergyMiner", sourceId: "W1N1:s0", targetRoom: "W1N1" } },
            ] });
            room.memory.resources = { W1N1: { energy: { "W1N1:s0": { lastSpawn: 5 } } } };
            assert.isTrue(runSpawnLadder(room, fakeSpawn(OK)));
            assert.equal(room.memory.resources.W1N1.energy["W1N1:s0"].lastSpawn, 1000);
        });
    });
});
