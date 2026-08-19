/**
 * The critical-needs spawn ladder: the FLOOR under a room's spawning.
 *
 * "What is this room missing that it cannot survive without, and what can it
 * afford right now?" — asked every tick the spawn is idle, BEFORE the FIFO
 * queue, whatever the bucket, the producer cadence, the danger flag or the
 * migration state say. Rungs, first actionable wins:
 *
 *   R1  every home source has a miner        (income)
 *   R2b RCL4+ with a storage has a filler    (energy reaches spawn/extensions)
 *   R2  something moves energy at all        (carry: source -> spawn/storage)
 *
 * It ADDS actions; it never adds a gate. The one "wait" it knows is bounded
 * (LADDER_MAX_WAIT) and only applies to a room that already has income and
 * could build a better body by being patient. A room with zero income spawns
 * the moment anything is affordable. See docs/EMPIRE-LAYER.md and
 * docs/STARVATION-TRAPS.md for why the floor has to be separate from the queue.
 *
 * Bodies are the best affordable RIGHT NOW (energyAvailable, not capacity):
 * the -6 shrink dance in spawnFirstInLine takes 40+ ticks to arrive at the
 * same answer, and only after the head has already stalled.
 *
 * STOPGAPS. A floor creep is a "stopgap" unless it is the creep the room would
 * really build: a miner with fewer WORK than the room could field, ANY miner
 * on a link-hauled source (the real one is the producer's CARRY-bearing link
 * miner and only that shape can feed the link), any body smaller than a queued
 * entry for the same job, and every ladder filler and carry (the producer's
 * tiering is the truth there). Stopgaps carry `memory.stopgap = true` and:
 *   - never remove the queued real creep (it hatches behind them),
 *   - are INVISIBLE to the producer's census and index (rooms.spawning
 *     creepIndex / add_creeps_to_spawn_list), so the producer queues the real
 *     replacement exactly as if the source / role were bare,
 *   - YIELD (suicide) the moment the real creep is hatched — a real miner
 *     within 2 tiles of the source, a real filler/carry alive in the room — so
 *     seats are never blocked and nobody limps on a 1-WORK miner for a life.
 * A non-stopgap ladder miner stamps the producer's per-source `lastSpawn` so
 * the producer's timer rung does not queue a duplicate.
 *
 * Interplay with the queue: if the producer already queued the creep this rung
 * needs and it is affordable, the ladder spawns THAT entry (its body, its
 * memory) and removes it from the queue — head-of-line be damned. If it is
 * queued but unaffordable, the ladder spawns what it can now and leaves the
 * queued entry alone: it is bigger by construction, so it is the upgrade path.
 *
 * decideLadder() is pure over a LadderView so tests can drive it for hundreds
 * of ticks against adversarial memory without a game.
 */
import { getCensus, EmpireCensus, homeCount, SourceStaff } from "Empire/census";
import { logAlways } from "utils/Logger";
import { refundBoostOwner, renameBoostOwner } from "./rooms.labs";

/** Ticks a room WITH income may hold out for a better body before taking what it can afford. */
export const LADDER_MAX_WAIT = 40;

/** Rooms at this capacity recycle <=2-CARRY carriers on sight; the floor never builds one there. */
export const TINY_CARRIER_RECYCLE_CAP = 550;

/** From here up (RCL6, cap 750) the producer's home miner carries CARRY to feed the source link. */
export const LINK_MINER_RCL = 6;
export const LINK_MINER_CAP = 750;

/** A banked room with fillers alive is not "dead" even with zero miners: extensions refill from the bank. */
export const BANK_COUNTS_AS_INCOME = 2000;

/** Roles a danger room may not have pre-empted when they sit affordable at the head. */
const DEFENSIVE_ROLES: { [role: string]: boolean } = {
    RampartDefender: true, RRD: true, defender: true, Guard: true,
    RangedAttacker: true, attacker: true, healer: true, Escort: true,
};

/** Roles that move energy inside a room. Sweepers count: they haul at RCL1. */
const HAULER_ROLES = ["carry", "FakeFiller", "sweeper"];

export interface LadderSource {
    id: string;
    range: number;
    hostile: boolean;
    /** the source's energy reaches the storage by link, or the room is in the link era (RCL6+, cap 750+) */
    linked?: boolean;
}
export interface LadderQueued {
    idx: number; role: string; sourceId?: string; targetRoom?: string; cost: number; name: string;
}
export interface LadderView {
    name: string;
    rcl: number;
    energy: number;
    cap: number;
    sources: LadderSource[];
    miners: { [sourceId: string]: { count: number; work: number } };
    /** own-crew haulers (carry/FakeFiller/sweeper whose home is this room) — remote crews passing through do not count */
    haulers: number;
    /** own-crew fillers */
    fillers: number;
    hasStorage: boolean;
    storageEnergy: number;
    danger: boolean;
    queue: LadderQueued[];
    /** ticks the CURRENT need has already been waiting (0 when the need changed) */
    waited: number;
    waitKey: string | null;
}

export type LadderRung = "miner" | "hauler" | "filler";
export type LadderAction =
    | { kind: "spawn"; rung: LadderRung; key: string; body: string[]; memory: any; stopgap: boolean; why: string }
    | { kind: "pull"; rung: LadderRung; key: string; idx: number; why: string }
    | { kind: "wait"; rung: LadderRung; key: string; why: string };

export function bodyCost(body: string[]): number {
    let c = 0;
    for (let i = 0; i < body.length; i++) c += BODYPART_COST[body[i]] || 0;
    return c;
}

function countPart(body: string[], part: string): number {
    let n = 0;
    for (let i = 0; i < body.length; i++) if (body[i] === part) n++;
    return n;
}

/** Plain miners: harvest into a container / onto the floor; carriers move it. */
const PLAIN_MINER_BODIES: string[][] = [
    [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE], // 600
    [WORK, WORK, WORK, WORK, WORK, MOVE],       // 550 — the room's canonical 5W miner
    [WORK, WORK, WORK, WORK, MOVE],             // 450
    [WORK, WORK, WORK, MOVE],                   // 350
    [WORK, WORK, MOVE],                         // 250
    [WORK, MOVE],                               // 150
];

/**
 * Link miners: at least one CARRY, because energyMiner.ts routes a CARRY-less
 * creep down the harvest-and-drop path and a link source has no carriers at
 * RCL6+ — a plain body there mines onto the floor for a whole creep-life.
 */
const LINK_MINER_BODIES: string[][] = [
    [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE], // 650
    [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE],       // 600
    [WORK, WORK, WORK, WORK, CARRY, MOVE],             // 500
    [WORK, WORK, WORK, CARRY, MOVE],                   // 400
    [WORK, WORK, CARRY, MOVE],                         // 300
    [WORK, CARRY, MOVE],                               // 200
];

/** Best miner body affordable at `energy`, or null below the cheapest tier. */
export function bestMinerBody(energy: number, linked: boolean = false): string[] | null {
    const table = linked ? LINK_MINER_BODIES : PLAIN_MINER_BODIES;
    for (const b of table) if (bodyCost(b) <= energy) return b.slice();
    return null;
}

/**
 * Best CARRY/MOVE body affordable at `energy`: 1:1 pairs plus one extra CARRY
 * when 50 is left over, capped at `maxParts`. `minCarry` is the floor under
 * CARRY count (see TINY_CARRIER_RECYCLE_CAP); when the 1:1 build cannot reach
 * it, a slow [CARRY x minCarry, MOVE] is used, and below THAT price the answer
 * is null.
 */
export function bestHaulerBody(energy: number, minCarry: number, maxParts: number = 12): string[] | null {
    const parts = Math.min(maxParts, Math.floor(energy / 50));
    if (parts < 2) return null;
    let carry = Math.ceil(parts / 2);
    let move = Math.floor(parts / 2);
    if (carry < minCarry) {
        if (energy < minCarry * 50 + 50) return null;
        carry = minCarry;
        move = 1;
    }
    const body: string[] = [];
    for (let i = 0; i < carry; i++) body.push(CARRY);
    for (let i = 0; i < move; i++) body.push(MOVE);
    return body;
}

function totalMiners(v: LadderView): number {
    let n = 0;
    for (const s of v.sources) n += (v.miners[s.id] && v.miners[s.id].count) || 0;
    return n;
}

/** First source that has a miner AND no link path to the storage — the one a carry is a floor for. */
function staffedUnlinked(v: LadderView): string | null {
    for (const s of v.sources) {
        if (!(v.miners[s.id] && v.miners[s.id].count > 0)) continue;
        if (s.linked) continue;
        return s.id;
    }
    return null;
}

function queuedFor(v: LadderView, pred: (q: LadderQueued) => boolean): LadderQueued | null {
    for (const q of v.queue) if (pred(q)) return q;
    return null;
}

/**
 * Pure decision. Returns the first actionable rung, or null when the floor
 * is met (or nothing can be done this tick and nothing is worth waiting on).
 */
export function decideLadder(v: LadderView): LadderAction | null {
    if (!v.sources.length) return null;
    // Income = a miner is alive, OR the bank can refill the extensions through
    // live fillers. Either way energy is coming and patience can buy a fuller
    // body; only a truly dead room spends its first 150 on sight.
    const income = totalMiners(v) > 0
        || (v.hasStorage && v.storageEnergy >= BANK_COUNTS_AS_INCOME && v.fillers > 0);

    // Under attack the defence gets the spawn if it can pay for it. The floor
    // is not the thing that turns a raid into a wipe; a mute spawn is.
    if (v.danger && v.queue.length) {
        const head = v.queue[0];
        if (DEFENSIVE_ROLES[head.role] && head.cost <= v.energy) return null;
    }

    // R1: a miner on every home source. A wait here does not block the
    // hauler rungs below — a room with one staffed source and 120 energy is
    // better off moving that source's energy than idling for a second miner.
    const r1 = minerRung(v, income);
    if (r1 && r1.kind !== "wait") return r1;
    if (totalMiners(v) === 0) return r1; // nothing to haul yet; R1's wait (or nothing) is the answer

    // R2b: RCL4+ with a storage — a filler is how energy reaches spawn/extensions.
    // It comes first when the storage already holds something to move; with an
    // EMPTY storage and nothing hauling, a filler would only stand there, so
    // the carry (which fills the storage) is the floor and the filler waits
    // its turn rather than eating the first 100 energy.
    const wantFiller = v.rcl >= 4 && v.hasStorage && v.fillers === 0;
    const wantHauler = v.haulers === 0 && staffedUnlinked(v) !== null;
    const fillerFirst = wantFiller && (v.storageEnergy >= 300 || !wantHauler);

    let pending: LadderAction | null = r1;
    if (fillerFirst) {
        const a = fillerAction(v);
        if (a && a.kind !== "wait") return a;
        pending = pending || a;
    }
    if (wantHauler) {
        const a = haulerAction(v);
        if (a && a.kind !== "wait") return a;
        pending = pending || a;
    }
    return pending;
}

function minerRung(v: LadderView, income: boolean): LadderAction | null {
    for (const s of v.sources) {
        if (v.miners[s.id] && v.miners[s.id].count > 0) continue;
        if (s.hostile) continue;
        const key = "miner:" + s.id;
        const linked = !!s.linked;
        const queued = queuedFor(v, q => q.role === "EnergyMiner" && q.sourceId === s.id);
        if (queued && queued.cost <= v.energy) {
            return { kind: "pull", rung: "miner", key, idx: queued.idx, why: "queued miner is affordable — pulling it past the head" };
        }
        const body = bestMinerBody(Math.min(v.energy, v.cap), linked);
        if (!body) return { kind: "wait", rung: "miner", key, why: "nothing miner-shaped is affordable at " + v.energy };
        const best = bestMinerBody(v.cap, linked) || body;
        const couldDoBetter = bodyCost(body) < bodyCost(best);
        // Stopgap = not the creep the room would really build for this source.
        const stopgap = countPart(body, WORK) < Math.min(5, countPart(best, WORK))
            || linked                                   // the real one is the producer's big CARRY link miner
            || !!(queued && bodyCost(body) < queued.cost); // the queued entry is bigger: it is the upgrade path
        if (income && couldDoBetter && v.waitKey === key && v.waited < LADDER_MAX_WAIT) {
            return { kind: "wait", rung: "miner", key, why: "room has income; waiting up to " + LADDER_MAX_WAIT + "t for a fuller miner" };
        }
        if (income && couldDoBetter && v.waitKey !== key) {
            return { kind: "wait", rung: "miner", key, why: "room has income; starting the bounded wait for a fuller miner" };
        }
        return {
            kind: "spawn", rung: "miner", key, body, stopgap,
            memory: { role: "EnergyMiner", sourceId: s.id, targetRoom: v.name, homeRoom: v.name },
            why: income ? "source unstaffed" : "ZERO income — first miner",
        };
    }
    return null;
}

function haulerAction(v: LadderView): LadderAction | null {
    const key = "hauler";
    const queued = queuedFor(v, q => q.role === "carry" && (!q.targetRoom || q.targetRoom === v.name));
    if (queued && queued.cost <= v.energy) {
        return { kind: "pull", rung: "hauler", key, idx: queued.idx, why: "queued carrier is affordable — pulling it past the head" };
    }
    const minCarry = v.cap >= TINY_CARRIER_RECYCLE_CAP ? 3 : 1;
    const body = bestHaulerBody(Math.min(v.energy, v.cap), minCarry);
    if (!body) return { kind: "wait", rung: "hauler", key, why: "no hauler affordable at " + v.energy + " (min CARRY " + minCarry + ")" };
    const staffed: string = staffedUnlinked(v) || v.sources[0].id;
    // Ladder carriers are always stopgaps: the producer's per-source sizing is
    // the real thing, and it will queue one because stopgaps are invisible to it.
    return {
        kind: "spawn", rung: "hauler", key, body, stopgap: true,
        memory: { role: "carry", sourceId: staffed, targetRoom: v.name, homeRoom: v.name },
        why: "nothing moves energy in this room",
    };
}

function fillerAction(v: LadderView): LadderAction | null {
    const key = "filler";
    const queued = queuedFor(v, q => q.role === "filler");
    if (queued && queued.cost <= v.energy) {
        return { kind: "pull", rung: "filler", key, idx: queued.idx, why: "queued filler is affordable — pulling it past the head" };
    }
    const body = bestHaulerBody(Math.min(v.energy, v.cap), 1, 6);
    if (!body) return { kind: "wait", rung: "filler", key, why: "no filler affordable at " + v.energy };
    // Always a stopgap — same reasoning as the carry.
    return {
        kind: "spawn", rung: "filler", key, body, stopgap: true,
        memory: { role: "filler" },
        why: "RCL" + v.rcl + " storage room with no filler",
    };
}

/* ------------------------------------------------------------------------ */
/* Game-side: build the view, act on the decision, retire stopgaps.          */
/* ------------------------------------------------------------------------ */

export function parseQueue(list: any[]): LadderQueued[] {
    const out: LadderQueued[] = [];
    if (!list || !list.length) return out;
    for (let i = 0; i + 2 < list.length; i += 3) {
        const body = list[i];
        const opts = list[i + 2];
        if (!Array.isArray(body)) continue;
        const mem = opts && opts.memory;
        out.push({
            idx: i,
            role: (mem && mem.role) || "?",
            sourceId: mem && mem.sourceId,
            targetRoom: mem && mem.targetRoom,
            cost: bodyCost(body),
            name: typeof list[i + 1] === "string" ? list[i + 1] : "?",
        });
    }
    return out;
}

/** energyMiner.ts caches "my link reaches the storage" per source for 50t; older than 200t means no miner has refreshed it. */
function linkHauledFromMemory(room: any, sourceId: string): boolean {
    const lh = room.memory && room.memory.linkHaulBySource;
    const rec = lh && lh[sourceId];
    return !!(rec && rec.v && Game.time - (rec.t || 0) < 200);
}

export function buildLadderView(room: any, spawn: any, census?: EmpireCensus): LadderView {
    const c = census || getCensus();
    const name: string = room.name;
    const danger = !!(room.memory && room.memory.danger);
    const rcl = (room.controller && room.controller.level) || 0;
    const cap = room.energyCapacityAvailable || 0;
    const storage = room.storage && room.storage.my ? room.storage : null;
    const rawSources: any[] = room.find(FIND_SOURCES) || [];
    let hostiles: any[] = [];
    if (danger) hostiles = room.find(FIND_HOSTILE_CREEPS) || [];
    const linkEra = rcl >= LINK_MINER_RCL && cap >= LINK_MINER_CAP && !!storage;
    const sources: LadderSource[] = rawSources.map((s: any) => {
        let hostile = false;
        for (const h of hostiles) {
            if (h.pos && s.pos && s.pos.getRangeTo(h) <= 4 && h.getActiveBodyparts && h.getActiveBodyparts(RANGED_ATTACK) > 0) { hostile = true; break; }
        }
        return {
            id: s.id,
            range: spawn && spawn.pos && s.pos ? spawn.pos.getRangeTo(s) : 0,
            hostile,
            linked: linkEra || linkHauledFromMemory(room, s.id),
        };
    });
    sources.sort((a, b) => a.range - b.range);
    const miners: { [id: string]: { count: number; work: number } } = {};
    for (const s of sources) {
        const st = c.minersBySource[s.id];
        miners[s.id] = st ? { count: st.count, work: st.work } : { count: 0, work: 0 };
    }
    let haulers = 0;
    for (const r of HAULER_ROLES) haulers += homeCount(c, name, r);
    const fillers = homeCount(c, name, "filler");
    const mem = room.memory || {};
    const w = mem._ladder;
    return {
        name,
        rcl,
        energy: room.energyAvailable || 0,
        cap,
        sources,
        miners,
        haulers,
        fillers,
        hasStorage: !!storage,
        storageEnergy: storage ? (storage.store[RESOURCE_ENERGY] || 0) : 0,
        danger,
        queue: parseQueue(mem.spawn_list),
        waited: w && typeof w.s === "number" ? Game.time - w.s : 0,
        waitKey: w && typeof w.k === "string" ? w.k : null,
    };
}

function noteWait(room: any, key: string): void {
    const w = room.memory._ladder;
    if (w && w.k === key) return;
    room.memory._ladder = { k: key, s: Game.time };
}

function clearWait(room: any): void {
    if (room.memory._ladder) delete room.memory._ladder;
}

function spliceQueue(room: any, idx: number): void {
    const q = room.memory.spawn_list;
    if (q && idx >= 0 && idx + 2 < q.length) q.splice(idx, 3);
}

function bumpSpawned(room: any): void {
    if (room.memory.data && typeof room.memory.data.c_spawned === "number") room.memory.data.c_spawned++;
}

/**
 * The producer's per-source "a miner was queued at" stamp. A NON-stopgap ladder
 * miner is the real thing, so stamp it or the producer's timer rung queues a
 * second full miner for the same source the next time it runs.
 */
function stampMinerSpawn(room: any, sourceId: string): void {
    const res = room.memory && room.memory.resources && room.memory.resources[room.name];
    const values = res && res.energy && res.energy[sourceId];
    if (values) values.lastSpawn = Game.time;
}

/**
 * Stopgaps yield to the real creep: a stopgap miner suicides once a real miner
 * for its source is hatched and within 2 tiles of the source (so a one-seat
 * source is never blocked); a stopgap filler/carry suicides once a real one of
 * its role is hatched in the room. Cheap: only walks the (few) stopgap names.
 */
export function yieldStopgaps(room: any, census: EmpireCensus, sources: any[]): number {
    let yielded = 0;
    const kill = (name: string, why: string) => {
        const c: any = Game.creeps[name];
        if (!c || c.spawning || typeof c.suicide !== "function") return;
        if (c.suicide() === OK) {
            yielded++;
            logAlways("[ladder] " + room.name + " stopgap " + name + " yields — " + why);
        }
    };
    for (const src of sources) {
        const st: SourceStaff | undefined = census.minersBySource[src.id];
        if (!st || !st.stopgaps.length || !st.reals.length) continue;
        let realNear = false;
        for (const rn of st.reals) {
            const r: any = Game.creeps[rn];
            if (r && !r.spawning && r.pos && src.pos && r.pos.getRangeTo(src) <= 2) { realNear = true; break; }
        }
        if (realNear) for (const n of st.stopgaps) kill(n, "real miner is on the source");
    }
    const stop = census.stopgaps[room.name];
    const real = census.reals[room.name];
    if (stop && real) {
        for (const role of ["filler", "carry"]) {
            const names = stop[role];
            const rs = real[role];
            if (!names || !names.length || !rs || !rs.length) continue;
            let hatched = false;
            for (const rn of rs) { const r: any = Game.creeps[rn]; if (r && !r.spawning) { hatched = true; break; } }
            if (hatched) for (const n of names) kill(n, "real " + role + " is alive");
        }
    }
    return yielded;
}

let lastFailLog: { [room: string]: number } = {};

/**
 * Runs the ladder for one room with an idle spawn. Returns true when it took
 * the spawn this tick (the caller returns; the queue does not also spawn).
 */
export function runSpawnLadder(room: any, spawn: any): boolean {
    if (!room || !room.controller || !room.controller.my || !spawn || spawn.spawning) return false;
    if (!room.memory) return false;
    const census = getCensus();
    yieldStopgaps(room, census, room.find(FIND_SOURCES) || []);
    const v = buildLadderView(room, spawn, census);
    const a = decideLadder(v);
    if (!a) { clearWait(room); return false; }
    if (a.kind === "wait") { noteWait(room, a.key); return false; }

    let body: string[];
    let name: string;
    let opts: any;
    if (a.kind === "pull") {
        const q = room.memory.spawn_list;
        body = q[a.idx]; name = q[a.idx + 1]; opts = q[a.idx + 2];
        if (!Array.isArray(body) || typeof name !== "string") return false;
    } else {
        body = a.body;
        const prefix = a.rung === "miner" ? "EnergyMiner" : a.rung === "hauler" ? "Carrier" : "Filler";
        name = prefix + "-L" + Game.time + "-" + room.name;
        const memory: any = a.memory;
        memory.viaLadder = Game.time;
        if (a.stopgap) memory.stopgap = true;
        opts = { memory };
    }

    let rc = spawn.spawnCreep(body, name, opts);
    if (rc === ERR_NAME_EXISTS) {
        // A queued entry with a taken name would make the ladder pick 'pull' and
        // fail every tick; rename it in place (boost bookkeeping follows) and retry.
        const fresh = name.replace(/-\d+(-|$)/, "-" + Math.floor(Math.random() * 1e9) + "$1");
        const newName = fresh === name ? name + "-" + Math.floor(Math.random() * 1e6) : fresh;
        if (a.kind === "pull") {
            renameBoostOwner(room, name, newName);
            room.memory.spawn_list[a.idx + 1] = newName;
        }
        name = newName;
        rc = spawn.spawnCreep(body, name, opts);
    }
    if (rc === OK) {
        if (a.kind === "pull") spliceQueue(room, a.idx);
        if (a.rung === "miner" && (a.kind === "pull" || !a.stopgap)) {
            const sid = a.kind === "pull" ? (opts && opts.memory && opts.memory.sourceId) : a.memory.sourceId;
            if (sid) stampMinerSpawn(room, sid);
        }
        bumpSpawned(room);
        clearWait(room);
        logAlways("[ladder] " + room.name + " " + a.rung + " " + name + " (" + bodyCost(body) + "e of " + v.energy + "/" + v.cap + ") — " + a.why + (a.kind === "pull" ? " [pulled from queue]" : (a.kind === "spawn" && a.stopgap ? " [stopgap]" : "")));
        return true;
    }
    if (a.kind === "pull" && (rc === ERR_INVALID_ARGS || rc === ERR_RCL_NOT_ENOUGH)) {
        // A queued entry the game will never accept: drop it so the ladder can
        // build its own body next tick instead of pulling this one forever.
        refundBoostOwner(room, name);
        spliceQueue(room, a.idx);
        logAlways("[ladder] " + room.name + " dropped unspawnable queued " + name + " (rc " + rc + ")");
        return false;
    }
    const last = lastFailLog[room.name] || 0;
    if (Game.time - last >= 100) {
        lastFailLog[room.name] = Game.time;
        logAlways("[ladder] " + room.name + " could not spawn " + a.rung + " (rc " + rc + ", cost " + bodyCost(body) + ", energy " + v.energy + ")");
    }
    return false;
}

export function resetLadderForTest(): void {
    lastFailLog = {};
}
