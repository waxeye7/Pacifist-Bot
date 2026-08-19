/**
 * WAR / SCORE — turn the intel table into a ranked target list.
 *
 * Doctrine (docs/AGGRESSION-DOCTRINE.md §4.2): value x vulnerability / risk,
 * ordered closest-first.
 *
 * ON "CLOSEST FIRST": taken literally as a lexicographic key, a worthless
 * adjacent room would outrank an RCL8 storage 2 rooms away forever. That is
 * plainly not the intent, so distance is a strong DECAY MULTIPLIER instead:
 * at the default tuning a room at range 5 must be worth ~2.5x a room at range 1
 * to outrank it. In practice that behaves closest-first while refusing to be
 * stupid about it. Every constant is live-tunable via Memory.war.tune — no
 * deploy needed to change the empire's temperament.
 *
 * Everything here reads the heap-cached intel table. No find(), no pathfinding,
 * no map API. A full 300-room scoring pass is well under 1 CPU, and it is
 * cached between passes anyway.
 */

import { allIntel, RoomIntel, getIntel } from "./intel";
import { getReach, myUsername } from "./reach";
import { roomKind, ROOM_NORMAL, isEnterable } from "./geo";

/** Which rung of the ladder this target wants. Mirrors doctrine §2. */
export const TIER_NONE = 0;
export const TIER_ZONE = 1;
export const TIER_HARASS = 2;
export const TIER_CONTROLLER = 3;
export const TIER_BREACH = 4;
export const TIER_NUKE = 5;
export const TIER_OCCUPY = 6;

export interface WarTuning {
  /** Distance decay: factor = 1 / (1 + decay * d). Higher = more local. */
  decay: number;
  /** Value per controller level of an enemy room. */
  perRcl: number;
  /** Value per enemy spawn (spawns are the real prize in a breach). */
  perSpawn: number;
  /** Value per 1000 energy sitting in storage+terminal. */
  perKEnergy: number;
  /** Cap on how much stored energy can contribute, so one fat room is not everything. */
  storeCap: number;
  /** Value per source in an enemy-reserved remote (income denied). */
  perRemoteSource: number;
  /** Value per hostile economic creep standing in reach (tier-1 prey). */
  perPrey: number;
  /** How hard each tower suppresses vulnerability. */
  towerWeight: number;
  /** Multiplier when we are holding upgradeBlocked — the tier-3 payoff. */
  blockedBonus: number;
  /** Multiplier when they still hold safe-mode charges. */
  safeModePenalty: number;
  /** Rampart HP at which vulnerability is halved. */
  wallHalfLife: number;
  /** Minimum score to appear on the target list at all. */
  floor: number;
}

export const DEFAULT_TUNING: WarTuning = {
  decay: 0.6,
  perRcl: 100,
  perSpawn: 200,
  perKEnergy: 1,
  storeCap: 600,
  perRemoteSource: 60,
  perPrey: 30,
  towerWeight: 0.8,
  blockedBonus: 2.5,
  safeModePenalty: 0.4,
  wallHalfLife: 3000000,
  floor: 1,
};

/**
 * Resolved tuning, cached per tick. scoreRoom() calls this, and scoreRoom() is
 * called once per candidate room — rebuilding the object ~275 times per scoring
 * pass is pure waste on a 20 CPU budget.
 */
let tuneTick = -1;
let tuneCache: WarTuning = DEFAULT_TUNING;

export function tuning(): WarTuning {
  if (tuneTick === Game.time) return tuneCache;
  tuneTick = Game.time;

  const mem = (Memory as any).war;
  if (!mem || !mem.tune) {
    tuneCache = DEFAULT_TUNING;
    return tuneCache;
  }
  const out: any = {};
  for (const k in DEFAULT_TUNING) {
    const v = mem.tune[k];
    // isFinite, not just typeof number: NaN and Infinity are both "number".
    // A non-finite constant propagates straight into the score and then into
    // the sort comparator, and a NaN comparator makes Array.sort return an
    // arbitrary permutation — the whole target list silently scrambles.
    out[k] = typeof v === "number" && isFinite(v) ? sanitiseTune(k, v) : (DEFAULT_TUNING as any)[k];
  }
  tuneCache = out as WarTuning;
  return tuneCache;
}

/**
 * Clamp a tuning value into the range where the formulas stay finite.
 *   decay        <  0 makes 1/(1+decay*d) blow up or go negative at some d
 *   wallHalfLife == 0 makes wl/halfLife a 0/0 NaN when wl is also 0
 *   towerWeight  <  0 can drive 1+towers*w to zero
 */
function sanitiseTune(key: string, v: number): number {
  if (key === "decay") return v < 0 ? 0 : v;
  if (key === "wallHalfLife") return v <= 0 ? 1 : v;
  if (key === "towerWeight") return v < 0 ? 0 : v;
  return v;
}

/**
 * Drop the per-tick tuning cache. Needed by warTune(), which changes Memory and
 * then rescores in the SAME tick — without this it would score against the
 * values it just replaced and look like the setting had no effect.
 */
export function invalidateTuning(): void {
  tuneTick = -1;
}

/**
 * Players we do NOT attack.
 *
 * Doctrine §1 says everyone is an enemy, and the intent is real. But
 * rooms.observe used to hardcode three usernames. That list now lives here
 * and observe calls isAlly(), so warAllies([]) is the one switch. Empty the
 * list and the doctrine is literal (Guard/CCK included).
 */
export const LEGACY_ALLIES = ["An1via", "nanachi", "nekey975"];

export function allies(): string[] {
  const mem = (Memory as any).war;
  if (!mem || !mem.allies) return LEGACY_ALLIES;
  return mem.allies;
}

export function isAlly(username: string): boolean {
  if (!username) return false;
  const list = allies();
  for (let i = 0; i < list.length; i++) if (list[i] === username) return true;
  return false;
}

export interface TargetScore {
  room: string;
  /** Distance to the closest owned room. */
  d: number;
  score: number;
  value: number;
  vuln: number;
  /** Distance decay applied. */
  df: number;
  /** Highest tier this target justifies right now. */
  tier: number;
  /** Short human explanation — this is what makes the ladder debuggable. */
  why: string;
  /** Ticks since the record was written; Infinity when never seen. */
  age: number;
}

/* ------------------------------------------------------------------ */

function storedEnergy(rec: RoomIntel): number {
  return (rec.st || 0) + (rec.tm || 0);
}

/** Raw worth of hurting this room, before any defence is considered. */
function valueOf(rec: RoomIntel, t: WarTuning): number {
  let v = 0;

  if (rec.o) {
    // An owned enemy room.
    v += (rec.l || 1) * t.perRcl;
    v += (rec.sp || 0) * t.perSpawn;
    const store = Math.min((storedEnergy(rec) / 1000) * t.perKEnergy, t.storeCap);
    v += store;
  } else if (rec.rv) {
    // Somebody's remote — value is the income we deny.
    v += (rec.src || 2) * t.perRemoteSource;
  }

  // Economic creeps standing in the open are worth killing wherever they are.
  v += (rec.he || 0) * t.perPrey;

  // Invader cores are chores, not prizes. They sit still. A player room
  // we already walked into can recover. Keep this small so cores lose to
  // any real raid.
  if (rec.inv) v += 12;

  return v;
}

/**
 * How easy is this to actually hurt. 1.0 is "undefended". Can exceed 1 when we
 * already hold advantages (upgradeBlocked, drained towers).
 */
function vulnerabilityOf(rec: RoomIntel, t: WarTuning): { v: number; notes: string[] } {
  const notes: string[] = [];
  let v = 1;

  // Safe mode running: effectively untouchable. Do not waste a creep.
  if (rec.sa) {
    notes.push("SAFEMODE-ACTIVE");
    return { v: 0.02, notes };
  }

  const towers = rec.tw || 0;
  if (towers > 0) {
    v /= 1 + towers * t.towerWeight;
    notes.push(`towers=${towers}`);
    // Drained towers are the entire point of tier 4's first phase.
    if ((rec.te || 0) === 0) {
      v *= 2;
      notes.push("towers-DRY");
    }
  }

  // Barriers.
  if (rec.wn) {
    const wl = rec.wl || 0;
    v *= 1 / (1 + wl / t.wallHalfLife);
    notes.push(`minWall=${Math.round(wl / 1000)}k`);
  } else if (rec.o) {
    // An owned room with no barriers at all is wide open.
    v *= 1.5;
    notes.push("no-walls");
  }

  // Safe mode in the bank is a get-out-of-jail card; it makes a siege a coin flip.
  if (rec.sm && rec.sm > 0) {
    v *= t.safeModePenalty;
    notes.push(`smAvail=${rec.sm}`);
  }

  // OUR tier-3 pressure. While upgradeBlocked holds they cannot safe-mode,
  // which is exactly what makes a breach worth committing boosts to.
  if (rec.ub && rec.ub > Game.time) {
    v *= t.blockedBonus;
    notes.push(`BLOCKED=${rec.ub - Game.time}`);
  }

  // Nobody home.
  if (!rec.hc) {
    v *= 1.6;
    notes.push("no-creeps-seen");
  } else if (rec.hb) {
    // Real defenders raise the cost of everything.
    v /= 1 + (rec.hb || 0) * 0.3;
    notes.push(`defenders=${rec.hb}`);
  }

  return { v, notes };
}

/** Highest rung of the ladder this room currently justifies. */
function tierFor(rec: RoomIntel): number {
  if (rec.sa) return TIER_NONE; // safe mode — wait it out

  if (rec.o) {
    const towers = rec.tw || 0;
    const walled = (rec.wn || 0) > 0;
    if (towers === 0 && !walled) return TIER_ZONE; // just walk in
    if (rec.ub && rec.ub > Game.time) return TIER_BREACH; // pressure held: commit
    return TIER_CONTROLLER; // establish pressure first
  }

  if (rec.rv) return TIER_HARASS; // somebody's remote
  if (rec.he) return TIER_ZONE; // loose economic creeps
  if (rec.inv) return TIER_ZONE; // invader core
  return TIER_NONE;
}

/* ------------------------------------------------------------------ */

let cacheTick = -1;
let cached: TargetScore[] = [];
/** How often the full ranking is recomputed. Cheap, but not free. */
const RESCORE_EVERY = 50;

/**
 * Score one room. Exposed so console commands can explain a single decision —
 * an unexplainable target list is an untunable one.
 */
export function scoreRoom(roomName: string): TargetScore | null {
  const reach = getReach();
  const d = reach.dist[roomName];
  if (d === undefined || d === 0) return null;
  if (roomKind(roomName) !== ROOM_NORMAL) return null;

  const t = tuning();
  const rec = getIntel(roomName);

  if (!rec) {
    // Never seen. Worth a look, but it is not a target until it is.
    return {
      room: roomName,
      d,
      score: 0,
      value: 0,
      vuln: 0,
      df: 1 / (1 + t.decay * d),
      tier: TIER_NONE,
      why: "unscouted",
      age: Infinity,
    };
  }

  // Ours, or a room we used to own whose record still says so. Never a target.
  const me = myUsername();
  if (rec.o && me && rec.o === me) {
    return {
      room: roomName,
      d,
      score: 0,
      value: 0,
      vuln: 0,
      df: 0,
      tier: TIER_NONE,
      why: "self",
      age: Game.time - rec.t,
    };
  }

  if (rec.o && isAlly(rec.o)) {
    return {
      room: roomName,
      d,
      score: 0,
      value: 0,
      vuln: 0,
      df: 0,
      tier: TIER_NONE,
      why: `ally:${rec.o}`,
      age: Game.time - rec.t,
    };
  }

  // Remotes. rec.o is unset here — reservation is in rec.rv. Without this,
  // every room our miners can see (i.e. all of our remotes) ranks as
  // TIER_HARASS of ourselves. Ally remotes are the same hole.
  //
  // Hostiles in OUR remotes are still tier-1 prey. Hostiles in an ally's
  // remote are their problem.
  const staffed = Memory.remoteOwner && Memory.remoteOwner[roomName];
  const selfRemote = !!(rec.rv && me && rec.rv === me) || !!(staffed && staffed.home);
  if (rec.rv && isAlly(rec.rv)) {
    return {
      room: roomName,
      d,
      score: 0,
      value: 0,
      vuln: 0,
      df: 0,
      tier: TIER_NONE,
      why: `ally-remote:${rec.rv}`,
      age: Game.time - rec.t,
    };
  }
  if (selfRemote && !rec.he && !rec.inv) {
    return {
      room: roomName,
      d,
      score: 0,
      value: 0,
      vuln: 0,
      df: 0,
      tier: TIER_NONE,
      why: "self-remote",
      age: Game.time - rec.t,
    };
  }

  const value = selfRemote
    ? (rec.he || 0) * t.perPrey + (rec.inv ? 12 : 0)
    : valueOf(rec, t);
  const vres = vulnerabilityOf(rec, t);
  const df = 1 / (1 + t.decay * d);
  let score = value * vres.v * df;

  // Core-only rooms (no owner, no prey) look "free" because nobody is home.
  // That 1.6x no-creeps bonus is exactly why they steal the next Guard.
  if (rec.inv && !rec.o && !rec.he) score *= 0.35;

  // A room under safe mode is not actionable at any price — do not let a fat
  // storage keep it near the top of the list as noise.
  if (rec.sa) score = 0;

  // Last line of defence. Everything upstream is clamped, but a single
  // non-finite score would scramble the entire sorted list, so it is worth one
  // comparison to guarantee it can never reach the comparator.
  if (!isFinite(score) || score < 0) score = 0;

  const why: string[] = [];
  if (selfRemote) why.push("self-remote");
  if (rec.o) why.push(`owner=${rec.o}(RCL${rec.l || "?"})`);
  else if (rec.rv && !selfRemote) why.push(`res=${rec.rv}`);
  if (rec.inv) why.push(`invaderCore=${rec.inv}`);
  if (rec.he) why.push(`prey=${rec.he}`);
  for (let i = 0; i < vres.notes.length; i++) why.push(vres.notes[i]);

  return {
    room: roomName,
    d,
    score,
    value,
    vuln: vres.v,
    df,
    // self-remote with prey is zone-of-control, not a harass of ourselves
    tier: rec.sa ? TIER_NONE : selfRemote ? TIER_ZONE : tierFor(rec),
    why: why.join(" "),
    age: Game.time - rec.t,
  };
}

/**
 * The ranked target list, best first. Cached for RESCORE_EVERY ticks.
 * Rooms below the score floor are dropped; unscouted rooms are not targets.
 */
export function targets(force?: boolean): TargetScore[] {
  if (!force && cacheTick > 0 && Game.time - cacheTick < RESCORE_EVERY) return cached;

  const t = tuning();
  const reach = getReach();
  const out: TargetScore[] = [];

  for (const name in reach.dist) {
    const d = reach.dist[name];
    if (d === 0) continue;
    // Same filter groundTargets() applies. Without it, novice/respawn-walled
    // rooms and names generated past the shard edge can reach the target list,
    // which would then disagree with the list of rooms we can actually enter.
    if (!isEnterable(name)) continue;
    const s = scoreRoom(name);
    if (!s) continue;
    if (s.score < t.floor) continue;
    out.push(s);
  }

  // Scores are guaranteed finite by scoreRoom, so this comparator is total.
  // Name is the final tiebreak so the ordering is stable tick to tick.
  out.sort((a, b) => b.score - a.score || a.d - b.d || (a.room < b.room ? -1 : a.room > b.room ? 1 : 0));
  cached = out;
  cacheTick = Game.time;
  return out;
}

/**
 * Rooms inside reach that we have never seen or have not seen in a long time,
 * closest first. This is what should aim the observer — doctrine §4.1's "paid"
 * ingest path — instead of the current fixed round-robin box.
 */
let scoutTick = -1;
let scoutAge = -1;
let scoutCached: string[] = [];

export function scoutQueue(maxAge: number): string[] {
  // Every RCL8 observer asks on the same tick. Rebuilding a 300-room list
  // per caller is the kind of "cheap so we do it N times" that adds up.
  if (scoutTick === Game.time && scoutAge === maxAge) return scoutCached;

  const reach = getReach();
  const table = allIntel();
  const out: { n: string; d: number; age: number }[] = [];

  for (const name in reach.dist) {
    const d = reach.dist[name];
    if (d === 0) continue;
    if (roomKind(name) !== ROOM_NORMAL) continue;
    // No point aiming an observer at a room we could never act on.
    if (!isEnterable(name)) continue;
    const rec = table[name];
    const age = rec ? Game.time - rec.t : Infinity;
    if (age <= maxAge) continue;
    out.push({ n: name, d, age });
  }

  // Closest first, then oldest first, then name for a total order.
  //
  // The obvious `b.age === Infinity ? 1 : ...` form is NOT a valid comparator:
  // when BOTH ages are Infinity — the normal case on a fresh deploy, where
  // every room is unscouted — it returns 1 for cmp(a,b) AND cmp(b,a). V8 will
  // not throw, it just produces an arbitrary order, silently breaking the
  // closest-first contract for exactly the set this exists to prioritise.
  // Mapping Infinity to a large finite sentinel keeps it consistent.
  const AGE_CAP = Number.MAX_SAFE_INTEGER;
  out.sort((a, b) => {
    if (a.d !== b.d) return a.d - b.d;
    const aa = a.age === Infinity ? AGE_CAP : a.age;
    const ba = b.age === Infinity ? AGE_CAP : b.age;
    if (aa !== ba) return ba - aa;
    return a.n < b.n ? -1 : a.n > b.n ? 1 : 0;
  });
  const names: string[] = [];
  for (let i = 0; i < out.length; i++) names.push(out[i].n);
  scoutTick = Game.time;
  scoutAge = maxAge;
  scoutCached = names;
  return names;
}

export function targetTable(limit: number): string {
  const list = targets();
  const rows: string[] = [
    `war targets (${list.length} scored, showing ${Math.min(limit, list.length)})`,
    `  ${"room".padEnd(8)} ${"d".padEnd(2)} ${"score".padEnd(8)} ${"tier".padEnd(4)} ${"age".padEnd(6)} why`,
  ];
  for (let i = 0; i < list.length && i < limit; i++) {
    const s = list[i];
    rows.push(
      `  ${s.room.padEnd(8)} ${String(s.d).padEnd(2)} ${s.score.toFixed(1).padEnd(8)} ${String(s.tier).padEnd(4)} ${(s.age === Infinity ? "never" : String(s.age)).padEnd(6)} ${s.why}`
    );
  }
  return rows.join("\n");
}
