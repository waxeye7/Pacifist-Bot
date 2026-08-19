/**
 * Spawn rescue as an EMPIRE job (src/Empire/rescue.ts + rescueLib.ts): one
 * decision per tick — who needs builders, who is the mother, who gets retasked.
 * These drive the real functions against a small fake empire.
 */
import { assert } from "chai";
import { computeRescueJob } from "../../src/Empire/rescue";
import { runEmpire, empire, rescueJob, postureOf, resetEmpireForTest } from "../../src/Empire/empire";
import {
    finishableSpawnSiteRooms,
    spawnCapableRooms,
    distToNearestSpawnRoom,
    pickRescueMother,
    roomLooksSpawnlessOwned,
} from "../../src/Empire/rescueLib";
import { resetCensusForTest } from "../../src/Empire/census";

const g: any = global;

function coords(name: string): [number, number] {
    const m = /^([WE])(\d+)([NS])(\d+)$/.exec(name)!;
    const x = (m[1] === "W" ? -1 : 1) * Number(m[2]);
    const y = (m[3] === "N" ? -1 : 1) * Number(m[4]);
    return [x, y];
}
function dist(a: string, b: string): number {
    const [ax, ay] = coords(a); const [bx, by] = coords(b);
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

interface RoomSpec {
    my?: boolean; level?: number; spawns?: number; energy?: number; cap?: number; storage?: number | null;
    danger?: boolean; site?: { progress: number; x: number; y: number } | null; foreignSpawn?: boolean; ticksToDowngrade?: number;
}

function room(name: string, s: RoomSpec): any {
    const spawnObjs: any[] = [];
    for (let i = 0; i < (s.spawns === undefined ? 1 : s.spawns); i++) spawnObjs.push({ name: name + "-sp" + i, my: true, structureType: STRUCTURE_SPAWN });
    const site = s.site ? { structureType: STRUCTURE_SPAWN, progress: s.site.progress, progressTotal: 15000, pos: { x: s.site.x, y: s.site.y } } : null;
    return {
        name,
        controller: { my: s.my !== false, level: s.level === undefined ? 5 : s.level, ticksToDowngrade: s.ticksToDowngrade === undefined ? 50000 : s.ticksToDowngrade },
        energyAvailable: s.energy === undefined ? 300 : s.energy,
        energyCapacityAvailable: s.cap === undefined ? 1800 : s.cap,
        storage: s.storage === undefined || s.storage === null ? undefined : { my: true, store: { energy: s.storage } },
        memory: { danger: !!s.danger, Structures: {} },
        find(kind: number, opts?: any) {
            let out: any[] = [];
            if (kind === FIND_MY_SPAWNS) out = spawnObjs;
            else if (kind === FIND_MY_CONSTRUCTION_SITES) out = site ? [site] : [];
            else if (kind === FIND_STRUCTURES) out = s.foreignSpawn ? [{ structureType: STRUCTURE_SPAWN, my: false }] : spawnObjs.slice();
            else if (kind === FIND_MY_STRUCTURES) out = spawnObjs.slice();
            if (opts && opts.filter) out = out.filter(opts.filter);
            return out;
        },
    };
}

function creep(name: string, o: { role: string; home?: string; here: string; target?: string; parts?: string[]; energy?: number }) {
    const parts = o.parts || [WORK, CARRY, MOVE];
    return {
        name,
        memory: { role: o.role, homeRoom: o.home || o.here, targetRoom: o.target },
        room: { name: o.here },
        store: { energy: o.energy || 0, getFreeCapacity: () => 50 },
        getActiveBodyparts: (p: string) => parts.filter(x => x === p).length,
        body: parts.map(t => ({ type: t })),
    };
}

function world(rooms: { [n: string]: any }, creeps: { [n: string]: any } = {}, memRooms: any = {}) {
    g.Game = {
        time: 777,
        rooms,
        creeps,
        cpu: { bucket: 9000, limit: 20 },
        map: { getRoomLinearDistance: dist },
        getObjectById: () => undefined,
    };
    g.Memory = { rooms: memRooms, creeps: {} };
    for (const n in rooms) g.Memory.rooms[n] = rooms[n].memory;
    resetCensusForTest();
    resetEmpireForTest();
}

describe("empire rescue job", () => {
    // world() replaces g.Game and g.Memory; later test FILES (spawnSafety's
    // homeEconomyStarved reads Memory.spawnRescue / _spawnEmergency) must not
    // inherit a pinned rescue from these cases — restore both.
    let prevGame: any;
    let prevMemory: any;
    beforeEach(() => { prevGame = g.Game; prevMemory = g.Memory; });
    afterEach(() => { g.Game = prevGame; g.Memory = prevMemory; resetCensusForTest(); resetEmpireForTest(); });

    it("no spawnless room -> no job, no emergency flags left behind", () => {
        world({ W1N1: room("W1N1", {}), W3N3: room("W3N3", {}) });
        assert.isNull(computeRescueJob());
        assert.isUndefined(g.Memory.spawnRescue);
        assert.isUndefined(g.Memory._spawnEmergency);
    });

    it("a visible owned room with a planned spawn tile and no spawn is pinned; nearest qualifying room is the mother", () => {
        const need = room("W2N2", { spawns: 0, level: 4, cap: 500, energy: 100, site: { progress: 6000, x: 25, y: 25 } });
        const near = room("W1N1", { level: 5, storage: 20000 });
        const far = room("W5N5", { level: 6, storage: 100000 });
        world({ W2N2: need, W1N1: near, W5N5: far }, {}, { W2N2: { planV2: { t: { spawn: [25 + 25 * 50] } } } });
        // planV2 lives in Memory.rooms; the world() helper overwrote it with room.memory — put it back
        g.Memory.rooms.W2N2 = { ...need.memory, planV2: { t: { spawn: [25 + 25 * 50] } } };
        need.memory = g.Memory.rooms.W2N2;

        assert.isTrue(roomLooksSpawnlessOwned("W2N2"));
        const job = computeRescueJob()!;
        assert.isNotNull(job);
        assert.equal(job.need, "W2N2");
        assert.isTrue(job.rescue, "visible and spawnless = a real rescue");
        assert.equal(job.mother, "W1N1", "nearest qualifying room, not the richest");
        assert.equal(job.cap, 8, "emergency cap");
        assert.equal(g.Memory.spawnRescue, "W2N2");
        assert.isTrue(g.Memory._spawnEmergency);
        assert.equal(g.Memory.target_colonise.room, "W2N2");
        assert.deepEqual(g.Memory.target_colonise.spawn_pos, { x: 25, y: 25, roomName: "W2N2" });
    });

    it("mother selection: RCL<3, danger, spawnless and poor rooms never qualify; bank <= 10k needs a near-full purse", () => {
        const need = room("W2N2", { spawns: 0, level: 3, site: { progress: 100, x: 10, y: 10 } });
        const tooLow = room("W2N1", { level: 2, storage: 50000 });
        const inDanger = room("W1N2", { level: 6, storage: 50000, danger: true });
        const noSpawn = room("W3N2", { level: 6, storage: 50000, spawns: 0, site: null });
        const poor = room("W1N1", { level: 5, storage: 500, energy: 100, cap: 1800 });          // 100 < min(800, 1440)
        const fullPurse = room("W3N3", { level: 5, storage: 500, energy: 800, cap: 1800 });    // 800 >= 800
        const rich = room("W5N5", { level: 7, storage: 90000 });
        world({ W2N2: need, W2N1: tooLow, W1N2: inDanger, W3N2: noSpawn, W1N1: poor, W3N3: fullPurse, W5N5: rich });
        g.Memory.rooms.W2N2.planV2 = { t: { spawn: [10 + 10 * 50] } };
        assert.equal(pickRescueMother("W2N2", true), "W3N3");
        assert.equal(pickRescueMother("W2N2", false), "W5N5", "a colony (non-rescue) needs a bank over 10k");
        fullPurse.energyAvailable = 799;
        assert.equal(pickRescueMother("W2N2", true), "W5N5", "under the floor the rich room 3 away is next");
        rich.controller.my = false;
        assert.isNull(pickRescueMother("W2N2", true));
    });

    it("re-aims a stranded builder, retasks the spawnless room's own worker, keeps every hatchery role home", () => {
        const need = room("W2N2", { spawns: 0, level: 4, site: { progress: 3000, x: 20, y: 20 } });
        const home = room("W1N1", { level: 5, storage: 30000 });
        const done = room("W3N3", { level: 4 });
        const creeps = {
            stranded: creep("stranded", { role: "buildcontainer", home: "W1N1", here: "W3N3", target: "W3N3" }),
            // Grok overnight contract (retaskKeepsHatcheryRole): a spawn-owning
            // room KEEPS its builder/upgrader/fillers/haulers/EnergyManager —
            // the last-hatchery freeze and the 35-builder pile both came from
            // stripping working rooms. Only spawnless homes give up workers.
            worker: creep("worker", { role: "builder", home: "W1N1", here: "W1N1", energy: 0 }),
            orphan: creep("orphan", { role: "builder", home: "W2N2", here: "W2N2", energy: 0 }),
            miner: creep("miner", { role: "EnergyMiner", home: "W1N1", here: "W1N1", parts: [WORK, WORK, MOVE] }),
            filler: creep("filler", { role: "filler", home: "W1N1", here: "W1N1", parts: [CARRY, MOVE] }),
            guard: creep("guard", { role: "Guard", home: "W1N1", here: "W1N1", parts: [ATTACK, MOVE] }),
        };
        world({ W2N2: need, W1N1: home, W3N3: done }, creeps);
        g.Memory.rooms.W2N2.planV2 = { t: { spawn: [20 + 20 * 50] } };
        const job = computeRescueJob()!;
        assert.equal(job.need, "W2N2");
        assert.equal(creeps.stranded.memory.targetRoom, "W2N2", "re-aimed off a room that has a spawn now");
        assert.equal(creeps.worker.memory.role, "builder", "a spawn room keeps its builder (hatchery role)");
        assert.equal(creeps.orphan.memory.role, "buildcontainer", "the spawnless room's own worker joins the rescue");
        assert.equal(creeps.orphan.memory.targetRoom, "W2N2");
        assert.isTrue((creeps.orphan.memory as any).fill, "empty worker goes to fill first");
        assert.equal(creeps.miner.memory.role, "EnergyMiner", "miners are never retasked");
        assert.equal(creeps.filler.memory.role, "filler", "a spawn room keeps its fillers");
        assert.equal(creeps.guard.memory.role, "Guard", "armed creeps are never retasked");
    });

    it("finishableSpawnSiteRooms() with no origin sorts by distance to the nearest spawn-capable room", () => {
        const a = room("W9N9", { spawns: 0, level: 3, site: { progress: 10, x: 5, y: 5 } });
        const b = room("W2N1", { spawns: 0, level: 3, site: { progress: 10, x: 5, y: 5 } });
        const base = room("W1N1", { level: 5, storage: 20000 });
        world({ W9N9: a, W2N1: b, W1N1: base });
        g.Memory.rooms.W9N9.planV2 = { t: { spawn: [5 + 5 * 50] } };
        g.Memory.rooms.W2N1.planV2 = { t: { spawn: [5 + 5 * 50] } };
        assert.deepEqual(spawnCapableRooms(), ["W1N1"]);
        assert.equal(distToNearestSpawnRoom("W9N9"), 8);
        assert.equal(distToNearestSpawnRoom("W2N1"), 1);
        assert.deepEqual(finishableSpawnSiteRooms(), ["W2N1", "W9N9"]);
        assert.deepEqual(finishableSpawnSiteRooms("W9N9"), ["W9N9", "W2N1"], "an explicit origin still sorts from there");
    });

    it("a finished rescue clears the pin and the emergency, and converts leftover builders back", () => {
        const wasNeed = room("W2N2", { level: 4 }); // has a spawn again
        const home = room("W1N1", { level: 5, storage: 30000 });
        const creeps = { cb: creep("cb", { role: "buildcontainer", home: "W1N1", here: "W2N2", target: "W2N2" }) };
        world({ W2N2: wasNeed, W1N1: home }, creeps);
        g.Memory.spawnRescue = "W2N2";
        g.Memory._spawnEmergency = true;
        g.Memory.target_colonise = { room: "W2N2" };
        assert.isNull(computeRescueJob());
        assert.isUndefined(g.Memory.spawnRescue);
        assert.isUndefined(g.Memory._spawnEmergency);
        assert.deepEqual(g.Memory.target_colonise, {});
        assert.equal(creeps.cb.memory.role, "builder");
    });

    it("runEmpire publishes the job and postures for this tick only", () => {
        const need = room("W2N2", { spawns: 0, level: 4, site: { progress: 3000, x: 20, y: 20 } });
        const home = room("W1N1", { level: 5, storage: 30000 });
        const scared = room("W3N3", { level: 5, storage: 30000, danger: true });
        world({ W2N2: need, W1N1: home, W3N3: scared });
        g.Memory.rooms.W2N2.planV2 = { t: { spawn: [20 + 20 * 50] } };
        assert.isNull(empire(), "nothing published before the pass");
        runEmpire();
        const e = empire()!;
        assert.isNotNull(e);
        assert.equal(e.tick, 777);
        assert.equal(rescueJob()!.need, "W2N2");
        assert.equal(rescueJob()!.mother, "W1N1");
        assert.equal(postureOf("W2N2"), "rescue-target");
        assert.equal(postureOf("W1N1"), "rescue-donor");
        assert.equal(postureOf("W3N3"), "danger");
        assert.equal(postureOf("W7N7"), "normal");
        assert.strictEqual(g._empire, e);
        g.Game.time = 778;
        assert.isNull(empire(), "stale state is not served on the next tick");
        assert.isNull(rescueJob());
        assert.equal(postureOf("W2N2"), "normal");
    });
});
