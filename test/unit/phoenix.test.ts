/**
 * THE PHOENIX INVARIANT (docs/EMPIRE-LAYER.md):
 *
 *   A room with one of our spawns and one source climbs back from zero creeps,
 *   on its own, whatever the queue, producer cadence, bucket, danger flag or
 *   migration state say.
 *
 * This drives the real ladder (runSpawnLadder) tick by tick against a tiny
 * model of a room: the spawn regenerates 1 energy/tick up to 300 (extensions do
 * not refill by themselves), a hatched creep shows up in Game.creeps the next
 * tick, the spawn is busy 3 ticks per body part, and once a miner AND a hauler
 * exist the room earns +5/tick up to its capacity. Nothing else runs — no
 * producer, no queue processing — because the point is that the floor does not
 * depend on any of that.
 */
import { assert } from "chai";
import { runSpawnLadder, resetLadderForTest, bodyCost } from "../../src/Rooms/spawnLadder";
import { resetCensusForTest } from "../../src/Empire/census";

const g: any = global;

interface SimOpts {
    rcl: number;
    cap: number;
    sources?: number;
    storage?: number | null;
    danger?: boolean;
    queue?: any[];
    bucket?: number;
    startEnergy?: number;
    income?: number;
}

class Sim {
    room: any;
    spawn: any;
    creeps: { [n: string]: any } = {};
    spawned: { tick: number; name: string; body: string[]; memory: any }[] = [];
    busyUntil = 0;
    energy: number;
    cap: number;
    income: number;
    time = 5000;
    hatchQueue: any[] = [];

    constructor(o: SimOpts) {
        this.cap = o.cap;
        this.energy = o.startEnergy === undefined ? 0 : o.startEnergy;
        this.income = o.income === undefined ? 5 : o.income;
        const name = "W5N5";
        const src: any[] = [];
        for (let i = 0; i < (o.sources === undefined ? 2 : o.sources); i++) {
            src.push({ id: name + ":src" + i, pos: { getRangeTo: () => 50 }, range: 4 + i * 3 });
        }
        const self = this;
        this.room = {
            name,
            controller: { my: true, level: o.rcl },
            get energyAvailable() { return self.energy; },
            energyCapacityAvailable: o.cap,
            storage: o.storage === undefined || o.storage === null ? undefined : { my: true, store: { energy: o.storage } },
            memory: { danger: !!o.danger, spawn_list: o.queue || [], data: { c_spawned: 0 } },
            find(kind: number) { return kind === FIND_SOURCES ? src : []; },
        };
        this.spawn = {
            get spawning() { return self.time < self.busyUntil ? { remainingTime: self.busyUntil - self.time } : null; },
            pos: { getRangeTo: (s: any) => s.range || 0 },
            spawnCreep(body: string[], cname: string, opts: any) {
                if (self.time < self.busyUntil) return ERR_BUSY;
                const cost = bodyCost(body);
                if (cost > self.energy) return ERR_NOT_ENOUGH_ENERGY;
                if (self.creeps[cname]) return ERR_NAME_EXISTS;
                self.energy -= cost;
                self.busyUntil = self.time + body.length * 3;
                const memory = JSON.parse(JSON.stringify((opts && opts.memory) || {}));
                self.hatchQueue.push({ name: cname, body, memory });
                self.spawned.push({ tick: self.time, name: cname, body: body.slice(), memory });
                return OK;
            },
        };
        g.Game = { time: this.time, creeps: this.creeps, rooms: {}, cpu: { bucket: o.bucket === undefined ? 10000 : o.bucket, limit: 20 } };
    }

    hasMiner(): boolean { return Object.keys(this.creeps).some(n => this.creeps[n].memory.role === "EnergyMiner"); }
    hasHauler(): boolean { return Object.keys(this.creeps).some(n => ["carry", "sweeper", "FakeFiller"].indexOf(this.creeps[n].memory.role) >= 0); }

    step(): boolean {
        // last tick's hatchlings are visible now
        for (const h of this.hatchQueue) {
            this.creeps[h.name] = { name: h.name, memory: h.memory, room: this.room, body: h.body.map((t: string) => ({ type: t })) };
        }
        this.hatchQueue = [];
        // spawn regen + income
        const floor = Math.min(300, this.cap);
        if (this.energy < floor) this.energy += 1;
        if (this.hasMiner() && this.hasHauler()) this.energy = Math.min(this.cap, this.energy + this.income);
        g.Game.time = this.time;
        resetCensusForTest();
        const took = runSpawnLadder(this.room, this.spawn);
        this.time++;
        return took;
    }

    run(ticks: number): void { for (let i = 0; i < ticks; i++) this.step(); }
    roles(): string[] { return this.spawned.map(s => s.memory.role); }
}

function fresh(o: SimOpts): Sim { resetLadderForTest(); resetCensusForTest(); return new Sim(o); }

describe("phoenix: a room climbs back from zero on its own", () => {
    afterEach(() => { resetCensusForTest(); });

    it("RCL1, 300 cap, zero creeps, zero energy: miner, carry, miner — and then it stops", () => {
        const s = fresh({ rcl: 1, cap: 300 });
        s.run(700);
        const r = s.roles();
        assert.isAtLeast(r.length, 3, "three floor creeps: " + r.join(","));
        assert.equal(r[0], "EnergyMiner", "first creep is a miner — a dead room spends the first 150 immediately");
        assert.deepEqual(s.spawned[0].body, [WORK, MOVE]);
        assert.isAtMost(s.spawned[0].tick - 5000, 160, "first miner within 160 ticks of a dead spawn regenerating from 0");
        // With one miner dropping energy at its source the room HAS income; the
        // second miner may wait (bounded) for a fuller body, and meanwhile the
        // hauler rung fires — energy that flows beats a second pile on the floor.
        assert.equal(r[1], "carry", "then something to move the energy");
        assert.equal(r[2], "EnergyMiner", "then the second source is staffed");
        assert.deepEqual(s.spawned[2].body, [WORK, WORK, MOVE], "and by then it can afford the best body the cap allows");
        assert.lengthOf(r, 3, "once the floor is met the ladder never spawns again: " + r.join(","));
        const bySource: any = {};
        for (const sp of s.spawned) if (sp.memory.role === "EnergyMiner") bySource[sp.memory.sourceId] = (bySource[sp.memory.sourceId] || 0) + 1;
        for (const k in bySource) assert.equal(bySource[k], 1, "one ladder miner per source");
    });

    it("dead room spends the first 150 immediately rather than saving for the 250 body", () => {
        const s = fresh({ rcl: 1, cap: 300, startEnergy: 149 });
        s.step(); // 150 -> spawn
        assert.lengthOf(s.spawned, 1);
        assert.deepEqual(s.spawned[0].body, [WORK, MOVE]);
        assert.isTrue(s.spawned[0].memory.stopgap);
    });

    it("HOL-blocked queue: a 1300e upgrader at the head and an affordable miner deep behind it — the ladder pulls the miner", () => {
        const q = [
            new Array(26).fill(WORK).slice(0, 12).concat([CARRY, MOVE]), "Upgrader-big", { memory: { role: "upgrader" } },
            [WORK, WORK, MOVE], "EnergyMiner-queued", { memory: { role: "EnergyMiner", sourceId: "W5N5:src0", targetRoom: "W5N5", homeRoom: "W5N5" } },
        ];
        assert.isAbove(bodyCost(q[0] as string[]), 1000);
        const s = fresh({ rcl: 4, cap: 1300, queue: q, startEnergy: 260 });
        s.run(400);
        assert.equal(s.spawned[0].name, "EnergyMiner-queued", "the queued miner is used, not a duplicate");
        assert.equal(s.room.memory.spawn_list[1], "Upgrader-big", "the head is left alone; only the miner triple was spliced");
        assert.lengthOf(s.room.memory.spawn_list, 3);
        assert.isTrue(s.spawned.some(x => x.memory.role === "carry"), "and a hauler follows");
    });

    it("bucket 500: the floor does not care about the bucket", () => {
        const s = fresh({ rcl: 1, cap: 300, bucket: 500 });
        s.run(600);
        assert.isAtLeast(s.spawned.length, 3);
    });

    it("danger with an UNAFFORDABLE RampartDefender at the head still recovers", () => {
        const q = [new Array(20).fill(ATTACK).concat(new Array(10).fill(MOVE)), "RampartDefender-x", { memory: { role: "RampartDefender" } }];
        const s = fresh({ rcl: 3, cap: 800, danger: true, queue: q });
        s.run(700);
        assert.isAtLeast(s.spawned.length, 2, s.roles().join(","));
        assert.equal(s.spawned[0].memory.role, "EnergyMiner");
    });

    it("danger with an AFFORDABLE defender at the head: the ladder yields to it (the queue would spawn it)", () => {
        const q = [[ATTACK, MOVE], "RampartDefender-x", { memory: { role: "RampartDefender" } }];
        const s = fresh({ rcl: 3, cap: 800, danger: true, queue: q, startEnergy: 300 });
        s.run(50);
        assert.lengthOf(s.spawned, 0, "the affordable defender is the queue's to hatch; the ladder waits");
    });

    it("RCL5, empty storage, zero creeps: miner (stopgap), miner, a >=3-CARRY carry, then a filler; never a tiny carrier", () => {
        const s = fresh({ rcl: 5, cap: 1800, storage: 0, income: 8 });
        s.run(900);
        const r = s.roles();
        assert.equal(r[0], "EnergyMiner", r.join(","));
        assert.isTrue(s.spawned[0].memory.stopgap, "first miner is a stopgap in an 1800 room");
        assert.include(r, "carry");
        assert.include(r, "filler");
        assert.isBelow(r.indexOf("carry"), r.indexOf("filler"), "storage is empty: the carry that fills it comes before the filler");
        for (const sp of s.spawned) {
            if (sp.memory.role === "carry") assert.isAtLeast(sp.body.filter(p => p === CARRY).length, 3, "no <3-CARRY carry in a cap>=550 room");
        }
        assert.lengthOf(r.filter(x => x === "carry"), 1, "one floor carry, not a stream of them");
        assert.lengthOf(r.filter(x => x === "filler"), 1);
        assert.lengthOf(r.filter(x => x === "EnergyMiner"), 2);
    });

    it("RCL5 with a stocked storage: the filler comes before the carry", () => {
        const s = fresh({ rcl: 5, cap: 1800, storage: 20000, income: 8 });
        s.run(900);
        const r = s.roles();
        assert.isBelow(r.indexOf("filler"), r.indexOf("carry"), r.join(","));
    });

    it("one-source room: miner, then hauler, then silence", () => {
        const s = fresh({ rcl: 2, cap: 550, sources: 1 });
        s.run(700);
        assert.deepEqual(s.roles(), ["EnergyMiner", "carry"]);
    });

    it("bounded wait: with income and 250 energy the second miner waits at most LADDER_MAX_WAIT ticks, then hatches", () => {
        const s = fresh({ rcl: 3, cap: 800, startEnergy: 0, income: 0 });
        // seed one miner and one hauler by hand
        s.creeps["m"] = { name: "m", memory: { role: "EnergyMiner", homeRoom: "W5N5", sourceId: "W5N5:src0" }, room: s.room, body: [{ type: WORK }] };
        s.creeps["h"] = { name: "h", memory: { role: "carry", homeRoom: "W5N5" }, room: s.room, body: [{ type: CARRY }] };
        s.energy = 250;
        s.run(60);
        assert.lengthOf(s.spawned, 1, "exactly one spawn");
        assert.equal(s.spawned[0].memory.sourceId, "W5N5:src1");
        const waited = s.spawned[0].tick - 5000;
        assert.isAtLeast(waited, 40, "it waited the bounded window for a fuller body");
        assert.isAtMost(waited, 45, "and no longer");
    });

    it("no room state ever makes the ladder spawn once the floor is met (fuzz over energy/cap/rcl)", () => {
        for (const cap of [300, 550, 800, 1300, 1800, 2300, 5600, 12900]) {
            for (const rcl of [1, 3, 5, 7]) {
                for (const storage of [null, 0, 50000]) {
                    const s = fresh({ rcl, cap, storage: storage as any });
                    s.creeps["m0"] = { name: "m0", memory: { role: "EnergyMiner", homeRoom: "W5N5", sourceId: "W5N5:src0" }, room: s.room, body: [{ type: WORK }] };
                    s.creeps["m1"] = { name: "m1", memory: { role: "EnergyMiner", homeRoom: "W5N5", sourceId: "W5N5:src1" }, room: s.room, body: [{ type: WORK }] };
                    s.creeps["h"] = { name: "h", memory: { role: "carry", homeRoom: "W5N5" }, room: s.room, body: [{ type: CARRY }] };
                    s.creeps["f"] = { name: "f", memory: { role: "filler" }, room: s.room, body: [{ type: CARRY }] };
                    s.energy = cap;
                    s.run(30);
                    assert.lengthOf(s.spawned, 0, `cap ${cap} rcl ${rcl} storage ${storage}: ${s.roles().join(",")}`);
                }
            }
        }
    });
});
