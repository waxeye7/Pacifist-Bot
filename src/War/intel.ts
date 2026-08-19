/**
 * WAR / INTEL — the persistent room database.
 *
 * The bot previously threw away essentially all of its vision. rooms.observe
 * looks at a room, reacts to it that tick, and remembers nothing; every creep
 * that walks through a foreign room sees it and forgets it. Doctrine
 * (docs/AGGRESSION-DOCTRINE.md §4.1) needs the opposite: a record that survives,
 * ages, and can be scored without vision.
 *
 * TWO INGEST PATHS, deliberately:
 *   1. FREE  — anything in Game.rooms this tick. We already have the vision;
 *      recording it costs a couple of find() calls. This is the primary source
 *      and it is why the doctrine is affordable on shard 3.
 *   2. PAID  — the observer, aimed by score at rooms we care about and have not
 *      seen recently. Wired in a later step; this module just accepts the data.
 *
 * STORAGE — RawMemory segment 30, not Memory.
 *   Memory is serialised by the engine every tick, so a few hundred room
 *   records in Memory is a permanent per-tick tax. A segment costs nothing
 *   until touched. The heap cache is authoritative while a global lives; the
 *   segment exists to survive global resets.
 *
 *   The segment can still be STARVED: the engine allows only 10 active
 *   segments, and PlanAnimator's animPlan() console command hard-replaces the
 *   whole active set. (Until this module landed, AutoExpand and MapViz also
 *   carried private setActiveSegments copies that clobbered same-tick requests;
 *   both now use utils/Segments' shared accumulator.) Every read path here
 *   therefore tolerates "not loaded" and the bot degrades to rebuilding intel
 *   from live vision rather than breaking.
 */

import { requestSegments } from "utils/Segments";
import { roomKind, RoomKind } from "./geo";

/** Free segment (see the ID audit: 0-9, 11-79 and 87 are unclaimed). */
export const INTEL_SEGMENT = 30;

/** Bump when the record shape changes incompatibly — old payloads are dropped. */
const INTEL_VERSION = 1;

/** Hard ceiling on stored rooms. 100KB/segment is the engine limit. */
const MAX_ROOMS = 400;
/** Refuse to write a payload bigger than this; prune harder instead. */
const MAX_PAYLOAD = 90000;

/** A room is worth re-looking-at once its record is this old. */
export const STALE_TICKS = 500;
/** Records older than this are evicted entirely (unless we own the room). */
const FORGET_TICKS = 20000;

/**
 * Max rooms recorded per tick, ACROSS ALL CALLERS. This is the hard CPU
 * ceiling on the whole intel system.
 *
 * It has to be global rather than per-caller because the observer path is not
 * self-spreading: rooms.observe gates its act tick on `Game.time % interval`,
 * an absolute clock, so EVERY RCL8 room runs its observation on the same tick.
 * With a per-caller limit, an 8-room empire would fire 8 recordRoom calls —
 * each a fresh room.find(FIND_STRUCTURES) over up to ~1800 objects — into one
 * tick, for a 2-8 CPU spike on a 20 CPU budget.
 */
const RECORD_PER_TICK = 4;
/** Do not re-record a room we already looked at this recently. */
const REINGEST_TICKS = 50;

/**
 * One room's record. Keys are short on purpose: this is serialised into a
 * 100KB budget and every character is storage.
 */
export interface RoomIntel {
  /** Game.time this record was last written from real vision. */
  t: number;
  /** roomKind() — cached so scoring never re-parses the name. */
  k: RoomKind;

  /** Controller owner username, absent if unowned. */
  o?: string;
  /** Controller reserver username, absent if unreserved. */
  rv?: string;
  /** Controller level. */
  l?: number;
  /** Controller downgrade ticks remaining, when seen. */
  dg?: number;
  /** 1 = safe mode ACTIVE right now. */
  sa?: number;
  /** Safe mode charges available. */
  sm?: number;
  /** Tick their safe-mode cooldown expires. */
  sc?: number;
  /** Tick until which their controller is upgradeBlocked (our tier-3 pressure). */
  ub?: number;

  /** Tower count. */
  tw?: number;
  /** Total energy across their towers when last seen. */
  te?: number;
  /** Spawn count. */
  sp?: number;
  /** Energy in storage. */
  st?: number;
  /** Energy in terminal. */
  tm?: number;
  /** Lowest wall/rampart hits — the cheapest point in the shell. */
  wl?: number;
  /** Count of walls + ramparts. */
  wn?: number;

  /** Source count (terrain fact — never goes stale). */
  src?: number;
  /** Mineral type (terrain fact). */
  mn?: string;
  /** Invader core level, if one is present. */
  inv?: number;

  /** Hostile creeps seen. */
  hc?: number;
  /** Of those, how many had ATTACK/RANGED_ATTACK/HEAL — i.e. real defenders. */
  hb?: number;
  /** Hostile non-military creeps: miners/haulers/reservers — tier-1 prey. */
  he?: number;

  /** Tick we last ran an operation against this room. */
  atk?: number;
  /** Tick we last launched a nuke at this room. */
  nk?: number;
  /** How many nukes we have landed here. */
  nkn?: number;
}

interface IntelStore {
  v: number;
  r: { [roomName: string]: RoomIntel };
}

/* ------------------------------------------------------------------ */
/* Heap state                                                          */
/* ------------------------------------------------------------------ */

let store: IntelStore | null = null;
let dirty = false;
let lastSave = 0;
/** Round-robin cursor so ingest does not always favour the same rooms. */
let ingestCursor = 0;

/** True once the segment has been read (or proven empty) since this global started. */
let loaded = false;
/** Last tick we asked for the segment slot — see ensureIntel. */
let requestedTick = -1;

/**
 * Ensure the store exists. Returns true when the store reflects persisted data,
 * false when we are running on an empty store because the segment has not
 * arrived yet. Callers must work either way — never block on intel.
 */
export function ensureIntel(): boolean {
  // Re-request ONCE PER TICK, even once loaded. RawMemory.segments is only
  // WRITABLE for segments in the active set, and setActiveSegments only takes
  // effect on the following tick — so a module that requests once, goes quiet,
  // and later assigns to RawMemory.segments[id] has its write silently
  // discarded. Holding the slot permanently costs ~0.02 CPU/tick.
  //
  // The tick guard is load-bearing, not cosmetic: ensureIntel() is called from
  // getIntel(), so an unguarded request would run a full RawMemory.segments
  // walk + setActiveSegments once PER ROOM during a ~275-room scoring pass.
  if (requestedTick !== Game.time) {
    requestedTick = Game.time;
    requestSegments([INTEL_SEGMENT]);
  }

  if (store && loaded) return true;

  const raw = RawMemory.segments[INTEL_SEGMENT];
  if (raw === undefined) {
    // Not available this tick. Run on an empty store rather than not at all.
    if (!store) store = { v: INTEL_VERSION, r: {} };
    return false;
  }

  // Anything recorded while we were waiting for the segment. These are from
  // THIS global and are strictly newer than whatever was persisted, so they
  // win the merge below. Without this, records written during the pre-load
  // window are silently dropped — tolerable for passive ingest (it re-ingests
  // within REINGEST_TICKS) but NOT for patchIntel writes like "we landed a
  // nuke here", which have no other source.
  const pending = store && store.r;

  if (!raw) {
    // Segment exists and is empty — first run. Nothing to load.
    store = { v: INTEL_VERSION, r: {} };
  } else {
    try {
      const parsed = JSON.parse(raw) as IntelStore;
      if (!parsed || parsed.v !== INTEL_VERSION || !parsed.r) {
        store = { v: INTEL_VERSION, r: {} };
      } else {
        store = parsed;
      }
    } catch (e) {
      store = { v: INTEL_VERSION, r: {} };
    }
  }

  if (pending) {
    for (const name in pending) {
      store.r[name] = pending[name];
      dirty = true;
    }
  }

  loaded = true;
  return true;
}

/** The whole table. Callers must not mutate it — use recordRoom/patchIntel. */
export function allIntel(): { [roomName: string]: RoomIntel } {
  ensureIntel();
  return store!.r;
}

export function getIntel(roomName: string): RoomIntel | undefined {
  ensureIntel();
  return store!.r[roomName];
}

/** Age of a record in ticks, Infinity when we have never seen the room. */
export function intelAge(roomName: string): number {
  const rec = getIntel(roomName);
  return rec ? Game.time - rec.t : Infinity;
}

export function isStale(roomName: string): boolean {
  return intelAge(roomName) > STALE_TICKS;
}

/**
 * Merge fields into a record without requiring vision — used to note our own
 * actions (we nuked this, we are holding upgradeBlocked here). Does NOT touch
 * `t`, because that means "last seen with real vision".
 */
export function patchIntel(roomName: string, patch: Partial<RoomIntel>): void {
  ensureIntel();
  let rec = store!.r[roomName];
  if (!rec) {
    rec = { t: 0, k: roomKind(roomName) };
    store!.r[roomName] = rec;
  }
  for (const key in patch) {
    (rec as any)[key] = (patch as any)[key];
  }
  dirty = true;
}

/* ------------------------------------------------------------------ */
/* Ingest                                                              */
/* ------------------------------------------------------------------ */

/**
 * Write everything we can see about a room into the DB. Safe to call on any
 * visible room, ours or not.
 *
 * Cost is a handful of find() calls, so callers must rate-limit — see
 * runIntelIngest, which is the thing that should normally be used.
 */
export function recordRoom(room: Room): void {
  if (!room) return;
  ensureIntel();

  const name = room.name;
  const prev = store!.r[name];
  const rec: RoomIntel = prev || ({ t: 0, k: roomKind(name) } as RoomIntel);

  rec.t = Game.time;
  rec.k = roomKind(name);

  // --- controller ------------------------------------------------------
  const ctrl = room.controller;
  if (ctrl) {
    if (ctrl.owner && ctrl.owner.username) rec.o = ctrl.owner.username;
    else delete rec.o;

    if (ctrl.reservation && ctrl.reservation.username) rec.rv = ctrl.reservation.username;
    else delete rec.rv;

    rec.l = ctrl.level || 0;
    if (ctrl.ticksToDowngrade) rec.dg = ctrl.ticksToDowngrade;

    if (ctrl.safeMode) rec.sa = 1;
    else delete rec.sa;
    if (ctrl.safeModeAvailable) rec.sm = ctrl.safeModeAvailable;
    else delete rec.sm;
    if (ctrl.safeModeCooldown) rec.sc = Game.time + ctrl.safeModeCooldown;
    else delete rec.sc;

    // upgradeBlocked is the tier-3 payload: while it holds they cannot
    // activate safe mode. Store the absolute tick it expires.
    if (ctrl.upgradeBlocked) rec.ub = Game.time + ctrl.upgradeBlocked;
    else delete rec.ub;
  } else {
    delete rec.o;
    delete rec.rv;
    delete rec.l;
  }

  // --- terrain facts (cheap, and they never change) --------------------
  if (rec.src === undefined) {
    rec.src = room.find(FIND_SOURCES).length;
    const minerals = room.find(FIND_MINERALS);
    if (minerals.length) rec.mn = minerals[0].mineralType as string;
  }

  // --- structures ------------------------------------------------------
  // One find, classified in a single pass: FIND_STRUCTURES is the expensive
  // call here, so it must not be made more than once.
  let towers = 0;
  let towerEnergy = 0;
  let spawns = 0;
  let storageEnergy = 0;
  let terminalEnergy = 0;
  let minWall = Infinity;
  let wallCount = 0;
  let invaderCore = 0;

  const structs = room.find(FIND_STRUCTURES);
  for (let i = 0; i < structs.length; i++) {
    const s = structs[i] as any;
    switch (s.structureType) {
      case STRUCTURE_TOWER:
        // Count every tower in the room. Ownership is not ambiguous — towers
        // belong to whoever owns the room, and rec.o already records that.
        // Trying to be clever here previously double-counted our own towers.
        towers++;
        towerEnergy += (s.store && s.store[RESOURCE_ENERGY]) || 0;
        break;
      case STRUCTURE_SPAWN:
        spawns++;
        break;
      case STRUCTURE_STORAGE:
        storageEnergy = (s.store && s.store[RESOURCE_ENERGY]) || 0;
        break;
      case STRUCTURE_TERMINAL:
        terminalEnergy = (s.store && s.store[RESOURCE_ENERGY]) || 0;
        break;
      case STRUCTURE_WALL:
      case STRUCTURE_RAMPART:
        wallCount++;
        if (s.hits < minWall) minWall = s.hits;
        break;
      case STRUCTURE_INVADER_CORE:
        invaderCore = s.level || 1;
        break;
      default:
        break;
    }
  }

  rec.tw = towers;
  rec.te = towerEnergy;
  rec.sp = spawns;
  rec.st = storageEnergy;
  rec.tm = terminalEnergy;
  rec.wn = wallCount;
  if (wallCount) rec.wl = minWall === Infinity ? 0 : minWall;
  else delete rec.wl;
  if (invaderCore) rec.inv = invaderCore;
  else delete rec.inv;

  // --- hostiles --------------------------------------------------------
  // "Hostile" here is doctrine-hostile: everyone is an enemy, so anything not
  // ours counts, including creeps belonging to players we have never met.
  let hostile = 0;
  let military = 0;
  let economic = 0;
  const creeps = room.find(FIND_HOSTILE_CREEPS);
  for (let i = 0; i < creeps.length; i++) {
    const c = creeps[i];
    hostile++;
    // ONE pass over the body. getActiveBodyparts is itself an O(body) walk, so
    // the obvious six-predicate version costs up to 6x this for no more info.
    let mil = false;
    let eco = false;
    const body = c.body;
    for (let b = 0; b < body.length; b++) {
      const part = body[b];
      if (part.hits <= 0) continue; // destroyed parts do nothing
      const type = part.type;
      if (type === ATTACK || type === RANGED_ATTACK || type === HEAL) {
        mil = true;
        break; // military beats economic; nothing left to learn
      }
      if (type === WORK || type === CARRY || type === CLAIM) eco = true;
    }
    if (mil) military++;
    // miners, haulers, reservers, claimers — tier-1 prey
    else if (eco) economic++;
  }
  rec.hc = hostile;
  rec.hb = military;
  rec.he = economic;

  store!.r[name] = rec;
  dirty = true;
}

/* --- shared per-tick record budget -------------------------------- */

let budgetTick = -1;
let budgetLeft = 0;

function takeRecordBudget(): boolean {
  if (budgetTick !== Game.time) {
    budgetTick = Game.time;
    budgetLeft = RECORD_PER_TICK;
  }
  if (budgetLeft <= 0) return false;
  budgetLeft--;
  return true;
}

/**
 * Record a room only if our record of it is stale AND there is budget left this
 * tick. This is what external callers should use — bare recordRoom() is
 * unbudgeted and will happily spike the tick.
 *
 * Returns true if the room was actually recorded.
 *
 * Callers earlier in the tick win the budget. That ordering is deliberate and
 * correct: rooms.observe runs in phase("rooms"), well before phase("war"), so
 * the PAID observer vision — which exists for exactly one tick and which we
 * specifically asked for — gets first claim, and the free round-robin ingest
 * takes whatever is left.
 */
export function recordRoomIfStale(room: Room, maxAge?: number): boolean {
  if (!room) return false;
  ensureIntel();
  const rec = store!.r[room.name];
  const limit = maxAge === undefined ? REINGEST_TICKS : maxAge;
  if (rec && Game.time - rec.t < limit) return false;
  if (!takeRecordBudget()) return false;
  recordRoom(room);
  return true;
}

/**
 * The free ingest path: record rooms we already have vision of. Shares the
 * global per-tick budget with every other caller.
 */
export function runIntelIngest(): void {
  ensureIntel();

  const names: string[] = [];
  for (const name in Game.rooms) names.push(name);
  if (!names.length) return;
  names.sort();

  const n = names.length;
  for (let i = 0; i < n; i++) {
    const name = names[(ingestCursor + i) % n];
    const room = Game.rooms[name];
    if (!room) continue;
    // Stops as soon as the shared budget is exhausted.
    if (!recordRoomIfStale(room) && budgetLeft <= 0 && budgetTick === Game.time) break;
  }
  ingestCursor = (ingestCursor + 1) % n;
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

/**
 * Does this record carry information WE wrote, rather than something we saw?
 * Such records have no other source and must survive age-eviction.
 */
function hasHistory(rec: RoomIntel): boolean {
  return !!(rec.atk || rec.nk || rec.nkn || rec.ub);
}

/**
 * Drop records that are too old to be worth anything, oldest first, until we
 * are under MAX_ROOMS. Never drops a room we currently own, and never drops a
 * record carrying our own operational history.
 */
function prune(limit: number): void {
  if (!store) return;
  const owned: { [name: string]: boolean } = {};
  for (const name in Game.rooms) {
    const r = Game.rooms[name];
    if (r && r.controller && r.controller.my) owned[name] = true;
  }

  const names: string[] = [];
  for (const name in store.r) {
    if (owned[name]) continue;
    // Records carrying OUR OWN operational history are never evicted on age.
    // patchIntel deliberately does not touch `t` (which means "last seen with
    // real vision"), so a note like "we landed a nuke here" on a room we have
    // no vision of sits at t=0 and would otherwise be deleted by the very
    // first prune — destroying the only copy of information that has no other
    // source. Age-eviction is for stale observations, not for our own memory.
    if (hasHistory(store.r[name])) continue;
    if (Game.time - store.r[name].t > FORGET_TICKS) {
      delete store.r[name];
      dirty = true;
      continue;
    }
    names.push(name);
  }

  if (names.length <= limit) return;
  // oldest-seen first
  names.sort((a, b) => store!.r[a].t - store!.r[b].t);
  const drop = names.length - limit;
  for (let i = 0; i < drop; i++) {
    delete store.r[names[i]];
  }
  dirty = true;
}

/**
 * Flush to the segment. Deliberately infrequent: JSON.stringify of a full table
 * is a multi-CPU spike, which on a 20 CPU budget must not happen every tick.
 * Amortised this is ~0.05 CPU/tick.
 */
export function saveIntel(force?: boolean): boolean {
  if (!store || !loaded) return false;
  if (!dirty && !force) return false;
  if (!force) {
    if (Game.time - lastSave < 100) return false;
    // Never take the spike while the bucket is already hurting.
    if (Game.cpu.bucket < 5000) return false;
  }

  // A segment is only WRITABLE while it is in the active set. If something
  // evicted us (AutoExpand, MapViz and PlanAnimator each bypass utils/Segments
  // with a private setActiveSegments), assigning here would be silently
  // discarded and we would believe we had saved. Bail and retry next interval —
  // ensureIntel re-requests the slot every tick.
  if (RawMemory.segments[INTEL_SEGMENT] === undefined) return false;

  prune(MAX_ROOMS);

  let payload = JSON.stringify(store);
  if (payload.length > MAX_PAYLOAD) {
    // Halve the table and try once more rather than silently failing the write.
    prune(Math.floor(MAX_ROOMS / 2));
    payload = JSON.stringify(store);
    if (payload.length > MAX_PAYLOAD) return false;
  }

  RawMemory.segments[INTEL_SEGMENT] = payload;
  lastSave = Game.time;
  dirty = false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Introspection                                                       */
/* ------------------------------------------------------------------ */

export function intelCount(): number {
  ensureIntel();
  let n = 0;
  for (const _k in store!.r) n++;
  return n;
}

export function intelSummary(): string {
  ensureIntel();
  let total = 0;
  let owned = 0;
  let reserved = 0;
  let fresh = 0;
  for (const name in store!.r) {
    const rec = store!.r[name];
    total++;
    if (rec.o) owned++;
    if (rec.rv) reserved++;
    if (Game.time - rec.t < STALE_TICKS) fresh++;
  }
  return [
    `loaded=${loaded}`,
    `rooms=${total}`,
    `ownedByAnyone=${owned}`,
    `reserved=${reserved}`,
    `fresh=${fresh}`,
    `dirty=${dirty}`,
    `lastSave=${lastSave}`,
    `seg=${INTEL_SEGMENT}`,
  ].join(" | ");
}

/** Human-readable dump of one record. */
export function intelLine(roomName: string): string {
  const rec = getIntel(roomName);
  if (!rec) return `${roomName}: (never seen)`;
  const bits: string[] = [`${roomName}`, `age=${Game.time - rec.t}`];
  if (rec.o) bits.push(`owner=${rec.o}`);
  if (rec.rv) bits.push(`res=${rec.rv}`);
  if (rec.l) bits.push(`RCL${rec.l}`);
  if (rec.tw) bits.push(`towers=${rec.tw}(${rec.te}e)`);
  if (rec.sp) bits.push(`spawns=${rec.sp}`);
  if (rec.st || rec.tm) bits.push(`store=${(rec.st || 0) + (rec.tm || 0)}`);
  if (rec.wl !== undefined) bits.push(`minWall=${rec.wl}`);
  if (rec.sa) bits.push(`SAFEMODE`);
  else if (rec.sm) bits.push(`smAvail=${rec.sm}`);
  if (rec.ub && rec.ub > Game.time) bits.push(`upgradeBlocked=${rec.ub - Game.time}`);
  if (rec.hb) bits.push(`mil=${rec.hb}`);
  if (rec.he) bits.push(`eco=${rec.he}`);
  if (rec.inv) bits.push(`invaderCore=${rec.inv}`);
  if (rec.nkn) bits.push(`nuked=${rec.nkn}`);
  return bits.join(" ");
}
