/**
 * The spawn-safety gates have already killed live rooms. These tests run the
 * real functions, not a source grep: a one-source room, a mid-spawn dip, and a
 * builder walking through a hallway are the cases that source-pin tests miss.
 */
import { assert } from "chai";
import {
    homeEconomyStarved,
    roomIsBroke,
    builderStationRoom,
    cullSurplusBuildersOnce,
    resetBuilderCullForTest,
    LIVE_BUILDER_CAP,
    headBlocksInterleave,
    destCheapRewritesHead,
    destCheapLeftoverNeedsFiveW,
    leftoverUpgradeShouldQueue,
    spawnPayable,
    bankEnergy,
    minerReplacementShouldQueue,
    minerBackupShouldQueue,
    remoteQueueIsPriority,
    remoteHaulInsertIndex,
    isHomeSlamMinerBody,
    rescueCbShouldLead,
    coloniseVetoesNoVisionSpawnless,
    colonyNeedIsRescue,
    spawnRescuePinHolds,
    spawnRescueValue,
    rememberOwnedRoomStats,
    retaskKeepsHatcheryRole,
    stripKeepsRescueRole,
    isLastHatchery,
    resourceNamesHomeLast,
    promoteHomeSlamFiveHol,
    idleQueueShouldWipe,
} from "../../src/Rooms/spawnSafety";
import * as fs from "fs";
import * as path from "path";

const g: any = global;

function withGame(opts: { time?: number; creeps?: any; rooms?: any; memory?: any }, fn: () => void): void {
    const prevGame = g.Game;
    const prevMemory = g.Memory;
    g.Game = {
        time: opts.time === undefined ? 1 : opts.time,
        creeps: opts.creeps || {},
        rooms: opts.rooms || {},
        cpu: { limit: 20, bucket: 7000 },
    };
    if (opts.memory !== undefined) g.Memory = opts.memory;
    try {
        fn();
    } finally {
        g.Game = prevGame;
        if (opts.memory !== undefined) g.Memory = prevMemory;
        resetBuilderCullForTest();
    }
}

function makeRoom(name: string, opts: {
    sources?: number;
    energy?: number;
    cap?: number;
    storage?: number | null;
    terminal?: number;
    danger?: boolean;
    sites?: number;
    my?: boolean;
    spawns?: number;
}): any {
    const storage = opts.storage === undefined || opts.storage === null
        ? null
        : { my: true, store: { energy: opts.storage } };
    const terminal = opts.terminal === undefined
        ? null
        : { my: true, store: { energy: opts.terminal } };
    const nSources = opts.sources === undefined ? 2 : opts.sources;
    const nSites = opts.sites === undefined ? 0 : opts.sites;
    const nSpawns = opts.spawns === undefined ? 1 : opts.spawns;
    return {
        name,
        energyAvailable: opts.energy === undefined ? 0 : opts.energy,
        energyCapacityAvailable: opts.cap === undefined ? 300 : opts.cap,
        storage,
        terminal,
        controller: { my: opts.my !== false, level: 4 },
        memory: { danger: !!opts.danger },
        find: (constId: number) => {
            if (constId === FIND_SOURCES) return new Array(nSources);
            if (constId === FIND_MY_CONSTRUCTION_SITES) return new Array(nSites);
            if (constId === FIND_MY_SPAWNS) return new Array(nSpawns);
            return [];
        },
    };
}

function makeCreep(name: string, opts: {
    role: string;
    room: string;
    home?: string;
    target?: string;
    work?: number;
    carry?: number;
    ttl?: number;
}): any {
    let suicided = false;
    return {
        name,
        memory: {
            role: opts.role,
            homeRoom: opts.home,
            targetRoom: opts.target,
        },
        room: { name: opts.room },
        ticksToLive: opts.ttl === undefined ? 1000 : opts.ttl,
        getActiveBodyparts: (part: string) => {
            if (part === WORK) return opts.work === undefined ? 1 : opts.work;
            if (part === CARRY) return opts.carry === undefined ? 1 : opts.carry;
            return 0;
        },
        suicide: () => { suicided = true; },
        get suicided() { return suicided; },
    };
}

describe("homeEconomyStarved", () => {
    it("does not starve a one-source room that has its one miner", () => {
        // The VPS W2N1 latch: flat `< 2` made a one-source RCL7 permanently
        // "starved" and force-closed every remote.
        const room = makeRoom("W2N1", { sources: 1, energy: 56, cap: 4300, storage: 0 });
        withGame({
            creeps: {
                m1: makeCreep("m1", { role: "EnergyMiner", room: "W2N1", home: "W2N1" }),
            },
        }, () => {
            assert.isFalse(homeEconomyStarved(room));
        });
    });

    it("does starve a two-source room with only one home miner", () => {
        const room = makeRoom("E36N57", { sources: 2, energy: 200, cap: 400, storage: 0 });
        withGame({
            creeps: {
                m1: makeCreep("m1", { role: "EnergyMiner", room: "E36N57", home: "E36N57" }),
            },
        }, () => {
            assert.isTrue(homeEconomyStarved(room));
        });
    });

    it("ignores a mid-spawn energyAvailable dip once a storage exists", () => {
        const room = makeRoom("W2N1", { sources: 1, energy: 56, cap: 4300, storage: 0 });
        withGame({
            creeps: {
                m1: makeCreep("m1", { role: "EnergyMiner", room: "W2N1", home: "W2N1" }),
            },
        }, () => {
            assert.isFalse(homeEconomyStarved(room), "storage present — bootstrap test must not fire");
        });
    });

    it("does not starve a bankless room whose capacity is above bootstrap", () => {
        // After hub retirement: no storage, cap 400-2300, mid-spawn dip.
        // The 300 test used to close remotes here (E36N57 211/400).
        const room = makeRoom("E36N57", { sources: 2, energy: 211, cap: 400, storage: null });
        withGame({
            creeps: {
                m1: makeCreep("m1", { role: "EnergyMiner", room: "E36N57", home: "E36N57" }),
                m2: makeCreep("m2", { role: "EnergyMiner", room: "E36N57", home: "E36N57" }),
            },
        }, () => {
            assert.isFalse(homeEconomyStarved(room));
        });
    });

    it("uses the 300 bootstrap test only when there is no storage", () => {
        const room = makeRoom("E39N58", { sources: 2, energy: 80, cap: 300, storage: null });
        withGame({
            creeps: {
                m1: makeCreep("m1", { role: "EnergyMiner", room: "E39N58", home: "E39N58" }),
                m2: makeCreep("m2", { role: "EnergyMiner", room: "E39N58", home: "E39N58" }),
            },
        }, () => {
            assert.isTrue(homeEconomyStarved(room));
        });
        room.energyAvailable = 300;
        withGame({
            creeps: {
                m1: makeCreep("m1", { role: "EnergyMiner", room: "E39N58", home: "E39N58" }),
                m2: makeCreep("m2", { role: "EnergyMiner", room: "E39N58", home: "E39N58" }),
            },
        }, () => {
            assert.isFalse(homeEconomyStarved(room));
        });
    });

    it("is never starved once the bank is 5k, even with zero miners", () => {
        const room = makeRoom("E37N59", { sources: 2, energy: 0, cap: 2300, storage: 5000 });
        withGame({ creeps: {} }, () => {
            assert.isFalse(homeEconomyStarved(room));
        });
    });

    it("counts the terminal toward the 5k reserve", () => {
        // ALIGN leaves terminals up; storage 0 + terminal 10k used to
        // stay "starved" forever because only storage.store was read.
        const room = makeRoom("E37N59", { sources: 2, energy: 200, cap: 2300, storage: 0, terminal: 10000 });
        withGame({ creeps: {} }, () => {
            assert.isFalse(homeEconomyStarved(room));
        });
    });

    it("starves the last hatchery during spawn rescue when the bank is empty", () => {
        // cap>300 + miners + empty storage used to skip the bootstrap test,
        // remotes stayed on, and miners/haulers buried the rescue CB.
        const room = makeRoom("E37N58", { sources: 2, energy: 400, cap: 1850, storage: 0 });
        withGame({
            creeps: {
                m1: makeCreep("m1", { role: "EnergyMiner", room: "E37N58", home: "E37N58" }),
                m2: makeCreep("m2", { role: "EnergyMiner", room: "E37N58", home: "E37N58" }),
            },
            memory: { spawnRescue: "W3N3", rooms: {} },
        }, () => {
            assert.isTrue(homeEconomyStarved(room));
        });
        withGame({
            creeps: {
                m1: makeCreep("m1", { role: "EnergyMiner", room: "E37N58", home: "E37N58" }),
                m2: makeCreep("m2", { role: "EnergyMiner", room: "E37N58", home: "E37N58" }),
            },
            memory: { rooms: {} },
        }, () => {
            assert.isFalse(homeEconomyStarved(room));
        });
    });

    it("does not starve a 5k-bank hatchery just because a rescue is pinned", () => {
        const room = makeRoom("E37N58", { sources: 2, energy: 400, cap: 1850, storage: 5000 });
        withGame({
            creeps: {},
            memory: { spawnRescue: "W3N3", rooms: {} },
        }, () => {
            assert.isFalse(homeEconomyStarved(room));
        });
    });

    it("does not starve a spare hatchery during spawn rescue", () => {
        const room = makeRoom("E37N58", { sources: 2, energy: 400, cap: 1850, storage: 0 });
        const other = makeRoom("E36N57", { sources: 2, energy: 400, cap: 800, storage: 0 });
        withGame({
            creeps: {
                m1: makeCreep("m1", { role: "EnergyMiner", room: "E37N58", home: "E37N58" }),
                m2: makeCreep("m2", { role: "EnergyMiner", room: "E37N58", home: "E37N58" }),
            },
            rooms: { E37N58: room, E36N57: other },
            memory: { spawnRescue: "W3N3", rooms: {} },
        }, () => {
            assert.isFalse(isLastHatchery(room));
            assert.isFalse(homeEconomyStarved(room));
        });
    });

    it("spawning persist-closes remotes only on policy, not starve", () => {
        const SPAWNING = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
        assert.include(SPAWNING, "remotesPolicyOk");
        assert.include(SPAWNING, "else if (!remotesPolicyOk)");
        assert.notMatch(
            SPAWNING,
            /if \(remotesAllowed\) \{[\s\S]{0,180}?else \{\s*\n\s*\/\/ force off until RCL4\+/,
            "starve must not persist-close remotes",
        );
    });
});

describe("roomIsBroke", () => {
    it("is false when the bank is 5k even if extensions are empty", () => {
        const room = makeRoom("E37N59", { energy: 0, cap: 2300, storage: 5000 });
        assert.isFalse(roomIsBroke(room));
    });

    it("is false when the terminal holds the reserve", () => {
        const room = makeRoom("E37N59", { energy: 0, cap: 2300, storage: 0, terminal: 5000 });
        assert.isFalse(roomIsBroke(room));
    });

    it("sums storage and terminal toward the 5k reserve", () => {
        // Either-store >=5k used to broke-clamp 3k+3k and dest-cheap miners.
        const room = makeRoom("E37N59", { energy: 0, cap: 2300, storage: 3000, terminal: 3000 });
        assert.isFalse(roomIsBroke(room));
        assert.strictEqual(bankEnergy(room), 6000);
    });

    it("is true when there is no bank and extensions are under half", () => {
        const room = makeRoom("E36N57", { energy: 83, cap: 400, storage: null });
        assert.isTrue(roomIsBroke(room));
    });

    it("never fires under attack", () => {
        const room = makeRoom("E36N57", { energy: 0, cap: 400, storage: null, danger: true });
        assert.isFalse(roomIsBroke(room));
    });
});

describe("spawnPayable", () => {
    it("counts terminal energy so ALIGN leftover is not dest-cheaped to 300", () => {
        const room = makeRoom("E37N59", { energy: 200, cap: 2300, storage: 0, terminal: 10000 });
        assert.strictEqual(spawnPayable(room), 10200);
    });

    it("is energyAvailable alone when there is no bank", () => {
        const room = makeRoom("E36N57", { energy: 211, cap: 400, storage: null });
        assert.strictEqual(spawnPayable(room), 211);
    });

    it("clampSpawnListToCapacity budgets from spawnPayable, not storage alone", () => {
        const SPAWNING = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
        const fn = SPAWNING.slice(
            SPAWNING.indexOf("function clampSpawnListToCapacity"),
            SPAWNING.indexOf("function bodyCost"),
        );
        assert.include(fn, "spawnPayable(room)");
        assert.notMatch(fn, /let payable = room\.energyAvailable\s*\+\s*\(clampStorage/);
    });
});

describe("builderStationRoom", () => {
    it("prefers targetRoom over the tile the creep is standing on", () => {
        const c = makeCreep("b", {
            role: "builder",
            room: "E37N58",
            home: "E37N58",
            target: "E36N57",
        });
        assert.strictEqual(builderStationRoom(c), "E36N57");
    });

    it("falls back to homeRoom, then current room", () => {
        assert.strictEqual(
            builderStationRoom(makeCreep("b", { role: "builder", room: "E37N58", home: "E37N59" })),
            "E37N59",
        );
        assert.strictEqual(
            builderStationRoom(makeCreep("b", { role: "builder", room: "E37N58" })),
            "E37N58",
        );
    });
});

describe("cullSurplusBuildersOnce", () => {
    function runCull(creeps: any, rooms: any, time = 10): any[] {
        const list = Object.keys(creeps).map((k) => creeps[k]);
        withGame({ time, creeps, rooms }, () => {
            cullSurplusBuildersOnce();
        });
        return list;
    }

    it("does not convert a borrowed builder walking through a hallway", () => {
        // The last-session kick: retask a neighbor builder onto E36N57. The
        // old cull grouped by c.room.name, saw 0 sites in the hallway, and
        // converted/suicided the helper before it arrived.
        const walker = makeCreep("borrowed", {
            role: "builder",
            room: "E37N58",
            home: "E36N57",
            target: "E36N57",
            work: 5,
        });
        const dest = makeRoom("E36N57", { sites: 1, my: true });
        const hall = makeRoom("E37N58", { sites: 0, my: true });
        runCull({ borrowed: walker }, { E36N57: dest, E37N58: hall });
        assert.strictEqual(walker.memory.role, "builder");
        assert.isFalse(walker.suicided);
    });

    it("counts travelers against the DESTINATION cap, not the hallway", () => {
        // 3 sites => cap 3. Five builders assigned to E36N57; four still walking.
        const dest = makeRoom("E36N57", { sites: 3, my: true });
        const hall = makeRoom("E37N58", { sites: 0, my: true });
        const creeps: any = {};
        for (let i = 0; i < 5; i++) {
            creeps["b" + i] = makeCreep("b" + i, {
                role: "builder",
                room: i === 0 ? "E36N57" : "E37N58",
                home: "E36N57",
                target: "E36N57",
                work: 5 - i,
            });
        }
        runCull(creeps, { E36N57: dest, E37N58: hall });
        const stillBuilding = Object.keys(creeps).filter((k) => creeps[k].memory.role === "builder");
        const nowCarry = Object.keys(creeps).filter((k) => creeps[k].memory.role === "carry");
        assert.strictEqual(stillBuilding.length, 3, "cap is min(LIVE_BUILDER_CAP, sites)");
        assert.strictEqual(nowCarry.length, 2);
        assert.strictEqual(creeps.b0.memory.role, "builder", "highest WORK stays a builder");
        assert.strictEqual(creeps.b4.memory.role, "carry", "lowest WORK becomes a carrier for the dest");
        assert.strictEqual(creeps.b4.memory.homeRoom, "E36N57");
        assert.isUndefined(creeps.b4.memory.targetRoom);
        // Hallway had 0 sites — if we still grouped by current room, all four
        // walkers would have been converted there instead of 2/5 at dest.
        assert.strictEqual(creeps.b1.memory.role, "builder");
    });

    it("never keeps more than LIVE_BUILDER_CAP even with many sites", () => {
        const dest = makeRoom("E36N57", { sites: 20, my: true });
        const creeps: any = {};
        for (let i = 0; i < 8; i++) {
            creeps["b" + i] = makeCreep("b" + i, {
                role: "builder", room: "E36N57", home: "E36N57", work: 2,
            });
        }
        runCull(creeps, { E36N57: dest });
        const still = Object.keys(creeps).filter((k) => creeps[k].memory.role === "builder");
        assert.strictEqual(still.length, LIVE_BUILDER_CAP);
    });

    it("converts every surplus to carry — it does not suicide paid bodies", () => {
        const dest = makeRoom("E36N57", { sites: 4, my: true });
        const creeps: any = {};
        for (let i = 0; i < 12; i++) {
            creeps["b" + i] = makeCreep("b" + i, {
                role: "builder",
                room: "E36N57",
                home: "E36N57",
                work: 1,
            });
        }
        runCull(creeps, { E36N57: dest });
        const suicided = Object.keys(creeps).filter((k) => creeps[k].suicided);
        const carries = Object.keys(creeps).filter((k) => creeps[k].memory.role === "carry");
        assert.strictEqual(suicided.length, 0);
        assert.strictEqual(carries.length, 12 - LIVE_BUILDER_CAP);
    });

    it("does not convert a rescue ContainerBuilder still walking to the colony", () => {
        const dest = makeRoom("E36N57", { sites: 1, my: true });
        const home = makeRoom("E37N59", { sites: 2, my: true });
        const cb = makeCreep("cb", {
            role: "buildcontainer",
            room: "E37N59",
            home: "E37N59",
            target: "E36N57",
            work: 8,
        });
        runCull({ cb }, { E36N57: dest, E37N59: home });
        assert.strictEqual(cb.memory.role, "buildcontainer");
        assert.strictEqual(cb.memory.targetRoom, "E36N57");
        assert.isFalse(cb.suicided);
    });

    it("does not convert arrived rescue ContainerBuilders on a spawn-first site", () => {
        // spawnFirstLockdown leaves one spawn site so cap=1. Converting the
        // arrived crew to builder/carry made colonyBuildersOn see 0; mothers
        // hatched another wave; retask then cull oscillated every tick.
        const dest = makeRoom("E36N57", { sites: 1, my: true });
        const creeps: any = {};
        for (let i = 0; i < 4; i++) {
            creeps["cb" + i] = makeCreep("cb" + i, {
                role: "buildcontainer",
                room: "E36N57",
                home: "E37N59",
                target: "E36N57",
                work: 8,
            });
        }
        runCull(creeps, { E36N57: dest });
        for (let i = 0; i < 4; i++) {
            assert.strictEqual(creeps["cb" + i].memory.role, "buildcontainer", "arrived CB " + i);
            assert.strictEqual(creeps["cb" + i].memory.targetRoom, "E36N57");
            assert.isFalse(creeps["cb" + i].suicided);
        }
    });

    it("leaves builders alone when their station room is not visible", () => {
        const walker = makeCreep("ghost", {
            role: "builder",
            room: "W1N1",
            home: "E36N57",
            target: "E36N57",
        });
        runCull({ ghost: walker }, { W1N1: makeRoom("W1N1", { sites: 0, my: false }) });
        assert.strictEqual(walker.memory.role, "builder");
        assert.isFalse(walker.suicided);
    });

    it("converts everyone when the station has no sites (finished room)", () => {
        const done = makeRoom("E37N59", { sites: 0, my: true });
        const b = makeCreep("b", { role: "builder", room: "E37N59", home: "E37N59" });
        runCull({ b }, { E37N59: done });
        assert.strictEqual(b.memory.role, "carry");
    });
});

describe("headBlocksInterleave", () => {
    it("treats a leftover 1W/2W as not a lifeline around [5W,M]", () => {
        // Old `homeMiners === 0` was false here; 300e builders then hatched
        // every 10 ticks and energy never reached 550.
        assert.isTrue(headBlocksInterleave(3, "EnergyMiner-1-E18S5", 550, 550, 1));
        assert.isTrue(headBlocksInterleave(3, "EnergyMiner-1-E18S5", 550, 550, 2));
        assert.isTrue(headBlocksInterleave(3, "EnergyMiner-1-E18S5", 550, 550, 0));
    });

    it("blocks a full-cap parked [4W,C,M] at RCL<=3 even with slam-5 income", () => {
        assert.isTrue(headBlocksInterleave(3, "Upgrader-1-E18S5", 500, 550, 5));
        assert.isTrue(headBlocksInterleave(3, "EnergyMiner-1-E18S5", 550, 550, 5));
    });

    it("allows interleave around a cheap head once slam-5 is live", () => {
        assert.isFalse(headBlocksInterleave(3, "Builder-1-E18S5", 300, 550, 5));
        assert.isFalse(headBlocksInterleave(3, "EnergyMiner-1-E18S5", 250, 550, 5));
    });

    it("still blocks the 0-miner EnergyMiner at any RCL", () => {
        assert.isTrue(headBlocksInterleave(6, "EnergyMiner-1-E36N57", 250, 2300, 0));
        assert.isFalse(headBlocksInterleave(6, "EnergyMiner-1-E36N57", 250, 2300, 5));
    });

    it("does not treat a slam-5 remote EnergyMiner HOL as a lifeline", () => {
        assert.isFalse(headBlocksInterleave(6, "EnergyMiner-1-W2N1", 250, 2300, 5, "W3N3", "W2N1"));
        assert.isTrue(headBlocksInterleave(6, "EnergyMiner-1-W2N1", 250, 2300, 0, "W2N1", "W2N1"));
    });

    it("blocks leftover / RCL3 interleave around a remote EnergyMiner HOL", () => {
        // destCheapRewritesHead refuses remotes; fiveWQueued latches leftover
        // upgrade; shrink is not else-if'd with interleave. Same leftover-5
        // closed loop as remote haul: stall 41 shrinks and hatches 300e.
        assert.isTrue(headBlocksInterleave(3, "EnergyMiner-1-W2N1", 550, 550, 5, "W3N3", "W2N1"));
        assert.isTrue(headBlocksInterleave(4, "EnergyMiner-1-W2N1", 550, 800, 2, "W3N3", "W2N1"));
        assert.isTrue(headBlocksInterleave(6, "EnergyMiner-1-W2N1", 250, 2300, 0, "W3N3", "W2N1"));
    });

    it("blocks interleave around a rescue ContainerBuilder at any RCL/cost", () => {
        // Last-hatchery CBs are RCL4+ 800e or leftover-5 getBody ~400e.
        // Old RCL<=3 && cost>=500 only caught them by accident.
        assert.isTrue(headBlocksInterleave(4, "ContainerBuilder-1-E37N58", 800, 800, 5));
        assert.isTrue(headBlocksInterleave(5, "ContainerBuilder-1-E37N58", 400, 800, 5));
        assert.isTrue(headBlocksInterleave(3, "ContainerBuilder-1-E37N58", 400, 550, 5));
        assert.isTrue(headBlocksInterleave(6, "ContainerBuilder-1-E37N58", 1600, 2300, 10));
    });

    it("blocks RCL3 / leftover interleave around a remote haul HOL", () => {
        // Leftover 1W/2W cannot refill 500–1500e. Clamped-under-500 haul
        // used to miss the RCL<=3 cost>=500 bar and hatch 300e every 10t.
        assert.isTrue(headBlocksInterleave(3, "Carrier-1-W2N1", 400, 550, 5, "W3N3", "W2N1"));
        assert.isTrue(headBlocksInterleave(4, "Carrier-1-W2N1", 1500, 1300, 2, "W3N3", "W2N1"));
        assert.isFalse(headBlocksInterleave(6, "Carrier-1-W2N1", 1500, 2300, 5, "W3N3", "W2N1"));
    });

    it("spawnFirstInLine uses headBlocksInterleave, not homeMiners === 0", () => {
        const SPAWNING = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
        assert.include(SPAWNING, "headBlocksInterleave(");
        assert.notInclude(SPAWNING, "headIsLifeline = homeMiners === 0");
    });

    it("passes live homeMinerBestWork, not a HOL-name forced 5", () => {
        // RCL4+ Carrier HOL + leftover 1W/2W used to look like slam-5, so
        // interleave spent the trickle on 300e and leftover never refilled
        // the 500–1500e haul the helper's leftover-5 test locks.
        const SPAWNING = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
        const start = SPAWNING.indexOf("const holTgt = room.memory.spawn_list[2]");
        const end = SPAWNING.indexOf("if((room.memory.spawnStall > SHRED_STALLED_HEAD_AFTER");
        assert.isAbove(start, 0);
        assert.isAbove(end, start);
        const block = SPAWNING.slice(start, end);
        assert.include(block, "homeMinerBestWork(room)");
        assert.notInclude(block, 'startsWith("EnergyMiner")');
        assert.notInclude(block, ": 5");
    });

    it("shredder does not drop a parked 4W / lifeline HOL", () => {
        const SPAWNING = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
        const shred = SPAWNING.slice(
            SPAWNING.indexOf("if((room.memory.spawnStall > SHRED_STALLED_HEAD_AFTER"),
            SPAWNING.indexOf("else if(mayShrinkHead && ("),
        );
        assert.include(shred, "!headIsLifeline");
        assert.include(shred, 'startsWith("Upgrader")');
        assert.isBelow(
            SPAWNING.indexOf("const headIsLifeline = headBlocksInterleave("),
            SPAWNING.indexOf("if((room.memory.spawnStall > SHRED_STALLED_HEAD_AFTER"),
            "lifeline must be computed before the shredder if/else-if",
        );
    });

    it("shredder does not drop a stalled filler head", () => {
        // Fillers are not on the HOL shrink rung. Stall 61 used to throw
        // away the fill-loop cure; the producer re-queued the same body.
        const SPAWNING = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
        const shred = SPAWNING.slice(
            SPAWNING.indexOf("if((room.memory.spawnStall > SHRED_STALLED_HEAD_AFTER"),
            SPAWNING.indexOf("else if(mayShrinkHead && ("),
        );
        assert.include(shred, 'startsWith("Filler")');
        assert.include(shred, 'startsWith("EmergencyFiller")');
        assert.include(shred, 'startsWith("emergencyFILLER")');
        assert.isBelow(
            shred.indexOf('startsWith("Filler")'),
            shred.indexOf("|| _.sum(segment"),
            "filler exemption must sit in the last-resort AND, not after it",
        );
    });
});

describe("destCheapRewritesHead", () => {
    it("rewrites a home EnergyMiner HOL when home has 0 WORK", () => {
        assert.isTrue(destCheapRewritesHead("EnergyMiner-1-W2N1", "W2N1", "W2N1", 0));
        assert.isTrue(destCheapRewritesHead("EnergyMiner-1-W2N1", undefined, "W2N1", 0));
    });

    it("does not rewrite a remote EnergyMiner HOL", () => {
        // Remotes unshift after home so a remote is often HOL. Bank>=5k
        // leaves remotes on the queue. The [2W,M] used to walk to the
        // remote while home stayed at 0 WORK.
        assert.isFalse(destCheapRewritesHead("EnergyMiner-1-W2N1", "W3N3", "W2N1", 0));
    });

    it("does not rewrite when a home miner already has WORK", () => {
        assert.isFalse(destCheapRewritesHead("EnergyMiner-1-W2N1", "W2N1", "W2N1", 1));
        assert.isFalse(destCheapRewritesHead("EnergyMiner-1-W2N1", "W2N1", "W2N1", 5));
    });

    it("spawnFirstInLine gates dest-cheap on destCheapRewritesHead", () => {
        const SPAWNING = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
        assert.include(SPAWNING, "destCheapRewritesHead(");
    });
});

describe("resourceNamesHomeLast / promoteHomeSlamFiveHol", () => {
    it("walks remotes before home so leftoverUpgrade unshift stays HOL", () => {
        assert.deepEqual(
            resourceNamesHomeLast(["W2N1", "W3N3", "W1N1"], "W2N1"),
            ["W3N3", "W1N1", "W2N1"],
        );
    });

    it("promotes a leftoverUpgrade [5W,M] out from under a remote HOL", () => {
        const fiveW = [WORK, WORK, WORK, WORK, WORK, MOVE];
        const remote = [WORK, WORK, MOVE, WORK, WORK, MOVE];
        const q = [
            remote, "EnergyMiner-r-W2N1", { memory: { role: "EnergyMiner", targetRoom: "W3N3" } },
            fiveW, "EnergyMiner-h-W2N1", { memory: { role: "EnergyMiner", targetRoom: "W2N1" } },
        ];
        assert.isTrue(promoteHomeSlamFiveHol(q, "W2N1"));
        assert.strictEqual(q[1], "EnergyMiner-h-W2N1");
        assert.strictEqual(q[4], "EnergyMiner-r-W2N1");
    });

    it("leaves a remote HOL alone when no home [5W,M] is queued", () => {
        const remote = [WORK, WORK, MOVE, WORK, WORK, MOVE];
        const q = [
            remote, "EnergyMiner-r-W2N1", { memory: { role: "EnergyMiner", targetRoom: "W3N3" } },
        ];
        assert.isFalse(promoteHomeSlamFiveHol(q, "W2N1"));
        assert.strictEqual(q[1], "EnergyMiner-r-W2N1");
    });

    it("promotes a leftoverUpgrade [2M,6W,M] out from under a remote HOL", () => {
        const sixW = [MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, MOVE];
        const remote = [WORK, WORK, MOVE, WORK, WORK, MOVE];
        const q = [
            remote, "EnergyMiner-r-W2N1", { memory: { role: "EnergyMiner", targetRoom: "W3N3" } },
            sixW, "EnergyMiner-h-W2N1", { memory: { role: "EnergyMiner", targetRoom: "W2N1" } },
        ];
        assert.isTrue(promoteHomeSlamFiveHol(q, "W2N1"));
        assert.strictEqual(q[1], "EnergyMiner-h-W2N1");
        assert.strictEqual(q[4], "EnergyMiner-r-W2N1");
    });

    it("spawn_energy_miner walks remotes first and promotes home slam-5", () => {
        const SPAWNING = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
        const fn = SPAWNING.slice(
            SPAWNING.indexOf("function spawn_energy_miner"),
            SPAWNING.indexOf("function sourceLinkHaulWorks"),
        );
        assert.include(fn, "resourceNamesHomeLast(");
        assert.include(fn, "promoteHomeSlamFiveHol(");
    });
});

describe("destCheapLeftoverNeedsFiveW", () => {
    it("upgrades a live dest-cheap leftover when cap can buy [5W,M]", () => {
        assert.isTrue(destCheapLeftoverNeedsFiveW(550, 1));
        assert.isTrue(destCheapLeftoverNeedsFiveW(550, 2));
        assert.isTrue(destCheapLeftoverNeedsFiveW(800, 4));
    });

    it("does not fire for a slam-5 miner or a pre-550 room", () => {
        assert.isFalse(destCheapLeftoverNeedsFiveW(550, 5));
        assert.isFalse(destCheapLeftoverNeedsFiveW(550, 0));
        assert.isFalse(destCheapLeftoverNeedsFiveW(300, 1));
    });

    it("spawn_energy_miner queues [5W,M] past lastSpawn on a leftover", () => {
        const SPAWNING = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
        assert.include(SPAWNING, "leftoverUpgradeShouldQueue(");
        assert.include(SPAWNING, "minerReplacementShouldQueue(onTheWay, leftoverUpgrade, values.lastSpawn || 0, Game.time, CREEP_LIFE_TIME)");
        const fn = SPAWNING.slice(
            SPAWNING.indexOf("function spawn_energy_miner"),
            SPAWNING.indexOf("function sourceLinkHaulWorks"),
        );
        const leftoverIf = fn.indexOf("if(leftoverUpgrade)");
        const sixW = fn.indexOf("[MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,MOVE]");
        assert.isAbove(leftoverIf, 0, "leftoverUpgrade must have its own body branch");
        assert.isAbove(sixW, leftoverIf);
        assert.include(fn.slice(leftoverIf, sixW), "[WORK,WORK,WORK,WORK,WORK,MOVE]");
        assert.include(SPAWNING, "isHomeSlamMinerBody(");
    });
});

describe("isHomeSlamMinerBody", () => {
    it("matches leftover-5 [5W,M] and RCL4-5 [2M,6W,M]", () => {
        assert.isTrue(isHomeSlamMinerBody([WORK, WORK, WORK, WORK, WORK, MOVE]));
        assert.isTrue(isHomeSlamMinerBody([MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, MOVE]));
        assert.isFalse(isHomeSlamMinerBody([WORK, WORK, MOVE, WORK, WORK, MOVE]));
        assert.isFalse(isHomeSlamMinerBody([WORK, WORK, WORK, WORK, WORK, CARRY, MOVE]));
        assert.isFalse(isHomeSlamMinerBody([WORK, WORK, MOVE]));
    });
});

describe("minerReplacementShouldQueue", () => {
    it("does not stack a replacement on a live miner when lastSpawn is 0", () => {
        assert.isFalse(minerReplacementShouldQueue(true, false, 0, 80000, 1500));
        assert.isFalse(minerBackupShouldQueue(true, 0, 80000, 1500));
    });

    it("still queues leftover 5W on a live dest-cheap miner", () => {
        assert.isTrue(minerReplacementShouldQueue(true, true, 0, 80000, 1500));
    });

    it("queues a replacement when nobody is on the way and the stamp is old", () => {
        assert.isTrue(minerReplacementShouldQueue(false, false, 100, 2000, 1500));
        assert.isFalse(minerReplacementShouldQueue(false, false, 1900, 2000, 1500));
    });
});

describe("leftoverUpgradeShouldQueue", () => {
    it("queues one upgrade for a live dest-cheap leftover", () => {
        assert.isTrue(leftoverUpgradeShouldQueue(550, 1, false, false));
    });

    it("does not queue again after fiveWQueued (dest-cheap rewrite flood)", () => {
        // Live E37N59: 23 miners. dest-cheap rewrote [5W,M] to 1W, leftover
        // stayed true, producer unshifted another every cadence.
        assert.isFalse(leftoverUpgradeShouldQueue(550, 1, false, true));
        assert.isFalse(leftoverUpgradeShouldQueue(550, 2, true, false));
        assert.isFalse(leftoverUpgradeShouldQueue(550, 5, false, false));
    });
});

describe("remoteQueueIsPriority / rescueCbShouldLead", () => {
    it("treats a rescue CB as a priority block, not a splice-at-0 hole", () => {
        assert.isTrue(remoteQueueIsPriority("buildcontainer", false));
        assert.isTrue(remoteQueueIsPriority("filler", false));
        assert.isTrue(remoteQueueIsPriority("EnergyManager", false));
        assert.isTrue(remoteQueueIsPriority("EnergyMiner", true));
        assert.isTrue(remoteQueueIsPriority("EnergyMiner", false));
        assert.isFalse(remoteQueueIsPriority("builder", false));
    });

    it("does not splice a remote haul in front of a home miner or fillers", () => {
        const fiveW = [WORK, WORK, WORK, WORK, WORK, MOVE];
        const q = [
            fiveW, "EnergyMiner-h-W2N1", { memory: { role: "EnergyMiner", targetRoom: "W2N1" } },
            [CARRY, CARRY, MOVE], "Filler-1-W2N1", { memory: { role: "filler" } },
        ];
        assert.strictEqual(remoteHaulInsertIndex(q, "W2N1"), 6);
        assert.strictEqual(remoteHaulInsertIndex([
            fiveW, "EnergyMiner-h-W2N1", { memory: { role: "EnergyMiner", targetRoom: "W2N1" } },
        ], "W2N1"), 3);
    });

    it("re-unshifts a rescue CB that producers buried past index 0", () => {
        assert.isTrue(rescueCbShouldLead(3));
        assert.isFalse(rescueCbShouldLead(0));
    });

    it("queueRemoteHaul and maybeSpawnColonyBuilder use the helpers", () => {
        const SPAWNING = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
        assert.include(SPAWNING, "remoteHaulInsertIndex(");
        assert.include(SPAWNING, "rescueCbShouldLead(");
        assert.notInclude(
            SPAWNING,
            "mem.role === 'filler' || mem.role === 'EnergyManager' ||",
        );
    });
});

describe("coloniseVetoesNoVisionSpawnless", () => {
    it("does not veto the pinned spawn rescue after pinSpawnRescue writes tc.room", () => {
        assert.isFalse(coloniseVetoesNoVisionSpawnless("W3N3", "W3N3", "W3N3"));
    });

    it("still vetoes a leftover-foreign colonise park that is not the pin", () => {
        assert.isTrue(coloniseVetoesNoVisionSpawnless("E35N59", "E35N59", undefined));
        assert.isTrue(coloniseVetoesNoVisionSpawnless("E35N59", "E35N59", "W3N3"));
    });

    it("roomLooksSpawnlessOwned uses the veto instead of a bare tc.room === name", () => {
        // roomLooksSpawnlessOwned moved to Empire/rescueLib.ts (the empire
        // rescue pass and the legacy per-room path share it) — pin the veto
        // where the live implementation is.
        const LIB = fs.readFileSync(
            path.join(__dirname, "../../src/Empire/rescueLib.ts"), "utf8");
        assert.include(LIB, "coloniseVetoesNoVisionSpawnless(");
        assert.notMatch(
            LIB,
            /if \(Memory\.target_colonise && Memory\.target_colonise\.room === name\) return false;/,
        );
    });
});

describe("colonyNeedIsRescue", () => {
    it("treats an unvisioned finishable need as a rescue", () => {
        assert.isTrue(colonyNeedIsRescue("W3N3", undefined));
    });

    it("treats a visible spawnless room as a rescue", () => {
        assert.isTrue(colonyNeedIsRescue("W3N3", { find: () => [] }));
    });

    it("is not a rescue when the visible room already has a spawn", () => {
        assert.isFalse(colonyNeedIsRescue("W3N3", { find: () => [{ id: "s1" }] }));
    });

    it("is not a rescue when there is no need", () => {
        assert.isFalse(colonyNeedIsRescue(null, undefined));
        assert.isFalse(colonyNeedIsRescue(undefined, undefined));
    });

    it("maybeSpawnColonyBuilder does not require Game.rooms[need] for rescue", () => {
        const SPAWNING = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
        assert.include(SPAWNING, "colonyNeedIsRescue(");
        assert.notInclude(
            SPAWNING,
            "need && Game.rooms[need] && Game.rooms[need].find(FIND_MY_SPAWNS).length === 0",
        );
    });
});

describe("spawnRescuePinHolds", () => {
    it("does not hold a doomed pin", () => {
        assert.isFalse(spawnRescuePinHolds(true, true));
    });

    it("holds a finishable spawnless pin", () => {
        assert.isTrue(spawnRescuePinHolds(true, false));
    });

    it("does not hold a room that is no longer spawnless", () => {
        assert.isFalse(spawnRescuePinHolds(false, false));
        assert.isFalse(spawnRescuePinHolds(false, true));
    });

    it("pickSpawnRescue consults spawnSiteUnfinishable, not spawnless alone", () => {
        // pickSpawnRescue moved to Empire/rescueLib.ts — pin the live copy.
        const LIB = fs.readFileSync(
            path.join(__dirname, "../../src/Empire/rescueLib.ts"), "utf8");
        assert.include(LIB, "spawnRescuePinHolds(");
        assert.include(LIB, "spawnSiteUnfinishable(pinned)");
        assert.notMatch(
            LIB,
            /if \(typeof pinned === "string" && roomLooksSpawnlessOwned\(pinned\)\) return pinned;/,
        );
    });
});

describe("spawnRescueValue", () => {
    it("uses live RCL and capacity when the room is visible", () => {
        const room = makeRoom("E37N59", { cap: 1850, my: true });
        room.controller.level = 6;
        withGame({ rooms: { E37N59: room }, memory: { rooms: {} } }, () => {
            assert.strictEqual(spawnRescueValue("E37N59"), 6000 + 1850);
        });
    });

    it("uses last-seen RCL and capacity when the last creep is gone", () => {
        // Wiped hatchery: Game.rooms empty, Memory still has last snapshot.
        // Old code returned 0, so ranking fell back to distance-from-E37N58.
        withGame({
            rooms: {},
            memory: {
                rooms: {
                    E37N59: { lastRcl: 6, lastEnergyCapacity: 1850 },
                    E36N57: { lastRcl: 3, lastEnergyCapacity: 800 },
                },
            },
        }, () => {
            assert.strictEqual(spawnRescueValue("E37N59"), 6000 + 1850);
            assert.strictEqual(spawnRescueValue("E36N57"), 3000 + 800);
            assert.isAbove(spawnRescueValue("E37N59"), spawnRescueValue("E36N57"));
        });
    });

    it("falls back to speedrun.lastRcl when lastRcl was never written", () => {
        withGame({
            rooms: {},
            memory: { rooms: { E37N59: { speedrun: { lastRcl: 6 } } } },
        }, () => {
            assert.strictEqual(spawnRescueValue("E37N59"), 6000);
        });
    });

    it("is 0 when there is no live room and no memory", () => {
        withGame({ rooms: {}, memory: { rooms: {} } }, () => {
            assert.strictEqual(spawnRescueValue("E1N1"), 0);
        });
    });

    it("rememberOwnedRoomStats writes the snapshot spawning() persists", () => {
        const room = makeRoom("E37N59", { cap: 1850, my: true });
        room.controller.level = 6;
        rememberOwnedRoomStats(room);
        assert.strictEqual(room.memory.lastRcl, 6);
        assert.strictEqual(room.memory.lastEnergyCapacity, 1850);
        const SPAWNING = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
        assert.include(SPAWNING, "rememberOwnedRoomStats(");
        // pickSpawnRescue (the spawnRescueValue consumer) lives in Empire/rescueLib.ts now.
        const LIB = fs.readFileSync(
            path.join(__dirname, "../../src/Empire/rescueLib.ts"), "utf8");
        assert.include(LIB, "spawnRescueValue(");
    });
});

describe("retaskKeepsHatcheryRole", () => {
    it("keeps the last hatchery's builder and upgrader", () => {
        assert.isTrue(retaskKeepsHatcheryRole("builder", true));
        assert.isTrue(retaskKeepsHatcheryRole("upgrader", true));
        assert.isTrue(retaskKeepsHatcheryRole("filler", true));
        assert.isTrue(retaskKeepsHatcheryRole("carry", true));
        assert.isTrue(retaskKeepsHatcheryRole("FakeFiller", true));
        assert.isTrue(retaskKeepsHatcheryRole("EnergyManager", true));
    });

    it("still retasks a builder whose home is the spawnless room", () => {
        assert.isFalse(retaskKeepsHatcheryRole("builder", false));
        assert.isFalse(retaskKeepsHatcheryRole("upgrader", false));
        assert.isFalse(retaskKeepsHatcheryRole("EnergyManager", false));
        assert.isFalse(retaskKeepsHatcheryRole("FakeFiller", false));
    });

    it("does not shield miners or CBs — those have their own skips", () => {
        assert.isFalse(retaskKeepsHatcheryRole("EnergyMiner", true));
        assert.isFalse(retaskKeepsHatcheryRole("buildcontainer", true));
    });

    it("retaskBuildersToSpawnless uses the hatchery-crew skip", () => {
        // retaskBuildersToSpawnless lives in Empire/rescueLib.ts now.
        const LIB = fs.readFileSync(
            path.join(__dirname, "../../src/Empire/rescueLib.ts"), "utf8");
        assert.include(LIB, "retaskKeepsHatcheryRole(");
    });
});

describe("idleQueueShouldWipe", () => {
    it("does not wipe a live HOL queue when lastTimeSpawnUsed is stale", () => {
        // Single-spawn HOL wait never stamps lastTimeSpawnUsed. Live film
        // had ~6.5k; every %100 tick used to drop the rescue CB.
        assert.isFalse(idleQueueShouldWipe(6500, 0, 3));
        assert.isFalse(idleQueueShouldWipe(6500, 100, 6));
        assert.isFalse(idleQueueShouldWipe(6499, 0, 0));
        assert.isFalse(idleQueueShouldWipe(6500, 5400, 0));
    });

    it("still fires the empty-queue idle wipe on the %100 / 1200 bar", () => {
        assert.isTrue(idleQueueShouldWipe(6500, 0, 0));
        assert.isTrue(idleQueueShouldWipe(1300, 0, 0));
    });

    it("spawning() uses idleQueueShouldWipe, not a bare lastTime>1200 wipe", () => {
        const SPAWNING = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
        assert.include(SPAWNING, "idleQueueShouldWipe(");
        assert.notMatch(
            SPAWNING,
            /Game\.time % 100 == 0 && Game\.time - room\.memory\.lastTimeSpawnUsed > 1200/,
        );
    });
});

describe("stripKeepsRescueRole", () => {
    it("keeps EnergyManager so link/terminal income still banks", () => {
        assert.isTrue(stripKeepsRescueRole("EnergyManager", false));
        assert.isTrue(stripKeepsRescueRole("filler", false));
        assert.isTrue(stripKeepsRescueRole("carry", false));
        assert.isTrue(stripKeepsRescueRole("builder", false));
        assert.isTrue(stripKeepsRescueRole("upgrader", false));
        assert.isTrue(stripKeepsRescueRole("EnergyMiner", false));
        assert.isTrue(stripKeepsRescueRole("buildcontainer", false));
    });

    it("drops offence unless the hatchery is under attack", () => {
        assert.isFalse(stripKeepsRescueRole("RampartDefender", false));
        assert.isTrue(stripKeepsRescueRole("RampartDefender", true));
        assert.isFalse(stripKeepsRescueRole("claimer", false));
        assert.isFalse(stripKeepsRescueRole("claimer", true));
    });

    it("stripNonRescueQueue uses stripKeepsRescueRole", () => {
        const SPAWNING = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
        assert.include(SPAWNING, "stripKeepsRescueRole(");
    });
});
