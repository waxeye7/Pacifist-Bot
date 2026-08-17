/**
 * AutoExpand v1 — claim the best next room, by itself.
 *
 * Offline half: `node tools/server/push-expansion-pack.mjs --user <name>`
 * ranks every claimable planned room and writes
 *
 *   segment 86      { targets: [{room, score, spawnPos, hash, seg}, ...] }
 *   segments 80-85  { "<room>": <plan payload> }   (top 12, 2 per segment)
 *
 * Segments 80-86 sit below the planner's 88 (adoptPlan) and 89-99 (animator),
 * so nothing here can clash with them — and readSegment() asks for the UNION
 * of the already-active segments so the three readers coexist.
 *
 * Online half (this file): every ~50 ticks, if
 *   - Memory.features.autoExpand !== false
 *   - Game.gcl.level > owned rooms          (a free claim exists)
 *   - Game.cpu.bucket > 5000                (expansion costs CPU for a while)
 *   - at least one owned room at RCL3+      (owner's explicit gate)
 *   - no expansion already running
 * pick the best still-unowned target and drive it through:
 *
 *   picking  -> read segment 86, choose target, arm the legacy colonise flow
 *   claiming -> Memory.target_colonise makes rooms.spawning send a claimer
 *   claimed  -> controller.my; rooms.construction places the spawn site at
 *               target_colonise.spawn_pos and ContainerBuilders build it
 *   spawned  -> a spawn exists: write room.memory.planV2 from the packed plan
 *               so placeFromPlanV2 lays the whole base out, then stand down
 *
 * Every phase is re-derived from world state, so a global reset, a code push
 * or a lost creep cannot wedge it — the worst case is the 20k-tick phase
 * timeout, which logs loudly and resets.
 *
 * SEPARATELY, and independent of all of the above, runPackAdoption() sweeps
 * every 25 ticks for an owned room that has no planV2 and gives it its packed
 * plan if segments 80-86 carry one. That is the path that survives a memory
 * reset, a lost/aborted ExpandState, and a room claimed by anything other than
 * this state machine — see its own comment block below.
 *
 * Console: autoExpand() · autoExpandStatus() · stopExpand()
 */
import { logAlways } from "utils/Logger";
import { packPlanPayload, clearPlanSpawnTile } from "utils/PlanV2";
import { requestSegments } from "utils/Segments";
import { wipeForeignSites } from "utils/ForeignSites";

const SEG_INDEX = 86;
/** segments holding the pack's per-room plans (push-expansion-pack.mjs) */
const SEG_PLANS = [80, 81, 82, 83, 84, 85];
const CHECK_EVERY = 50;
/** how often we ask "is an owned room still running without a plan?" */
const ADOPT_SCAN_EVERY = 25;
/** ticks one room's segment walk may take before we call it a miss */
const ADOPT_TIMEOUT = 200;
/** a room with no pack entry is not re-checked for this long */
const ADOPT_MISS_BACKOFF = 3000;
/** phases advance on world state; this is only the giving-up bound */
const PHASE_TIMEOUT = 20000;
/** claimed + no MY spawn this long → finish(). One tunable. */
const CLAIMED_SPAWNLESS = 8000;
const MIN_BUCKET = 5000;
const MIN_RCL = 3;
/** CPU/tick one more room plausibly costs — the headroom expansion requires. */
const CPU_HEADROOM = 3;

type Phase = "picking" | "claiming" | "claimed" | "spawned";

interface ExpandState {
  room: string;
  spawnPos: { x: number; y: number };
  phase: Phase;
  /** tick the CURRENT phase started (timeout base) */
  since: number;
  /** tick the whole run started */
  started: number;
  /** segment holding this room's plan (undefined = ranked outside the top 12) */
  seg?: number;
  hash?: string;
}

const M = () => Memory as any;

function ownedRooms(): Room[] {
  const out: Room[] = [];
  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    if (room.controller && room.controller.my) out.push(room);
  }
  return out;
}

/** Any owned room with no finished MY spawn (site-only counts). */
function spawnlessOwned(): boolean {
  return ownedRooms().some((r) => r.find(FIND_MY_SPAWNS).length === 0);
}

/** null = clear to expand, otherwise the reason we are not. */
function blockedReason(): string | null {
  const owned = ownedRooms();
  if (!owned.length) return "no owned rooms";
  if (Game.gcl.level <= owned.length)
    return `GCL ${Game.gcl.level} <= ${owned.length} owned rooms (no free claim)`;
  if (Game.cpu.bucket <= MIN_BUCKET) return `bucket ${Game.cpu.bucket} <= ${MIN_BUCKET}`;
  if (!owned.some((r) => (r.controller as StructureController).level >= MIN_RCL))
    return `no owned room at RCL${MIN_RCL}+`;
  /*
   * CPU HEADROOM is the real constraint on how many rooms this bot can hold,
   * and it is now the one that is actually enforced.
   *
   * The old gate was `expandMinRcl` — "reach RCL7 before claiming another" —
   * which is a proxy for readiness, not a measure of it, and on shard3 it
   * blocked expansion indefinitely: GCL 12 with 8 free claims available and
   * every room stuck below RCL7. The owner's rule is simpler and more honest:
   * expand whenever there is CPU to run another room.
   *
   * `expandMinRcl` still works if someone sets it (0 = off, and 0 is now the
   * default); it just is not the thing standing in the way any more.
   *
   * The bar: a room costs real CPU per tick, so we require BOTH a healthy
   * bucket (above) and a 100-tick average with room to spare. `CPU_HEADROOM`
   * is what one more room plausibly costs — measured on this bot at ~2-4 CPU
   * for a small room, so 3 with the bucket test as the safety net.
   */
  const minRcl = M().features && M().features.expandMinRcl !== undefined ? M().features.expandMinRcl : 0;
  if (minRcl > 0 && owned.length >= 3 &&
      !owned.some((r) => (r.controller as StructureController).level >= minRcl))
    return `expandMinRcl ${minRcl}: ${owned.length} owned rooms and none at RCL${minRcl}+`;
  const avg = Number(Memory.CPU && Memory.CPU.hundredTickAvg && Memory.CPU.hundredTickAvg.avg) || 0;
  const limit = Game.cpu.limit || 20;
  if (avg > 0 && avg + CPU_HEADROOM > limit)
    return `CPU ${avg.toFixed(1)}/${limit} — no headroom for another room (need ${CPU_HEADROOM} spare)`;
  // hold the queue: finish() without this just pick()s the next leftover
  if (spawnlessOwned())
    return "spawnless owned room — bootstrap before next claim";
  const st = M().autoExpand as ExpandState | undefined;
  if (st) return `already expanding to ${st.room} (${st.phase})`;
  return null;
}

/**
 * Request a segment; undefined until it is active (usually the next tick).
 *
 * setActiveSegments REPLACES the whole active set, and adoptPlan (88) plus the
 * plan animator (89-99) call it every tick too, so this goes through the shared
 * per-tick accumulator in utils/Segments — otherwise whoever runs last starves
 * everyone else, no matter what order main.ts calls them in. Live proof: with
 * Memory.planAnim.active set, the first cut of this function sat in `picking`
 * for 400+ ticks because segment 86 was never activated.
 */
function readSegment(seg: number): any | undefined {
  // Two readers live in this file (the ExpandState machine and
  // runPackAdoption) and they want DIFFERENT segments in the same tick.
  // requestSegments unions everything asked for THIS tick with what is already
  // active — RawMemory.segments only reflects last tick's request, so without
  // that the second caller would silently cancel the first's and the two would
  // take turns starving each other.
  requestSegments([seg]);
  const raw = RawMemory.segments[seg];
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch (e: any) {
    logAlways(`autoExpand: segment ${seg} parse failed: ${e.message}`);
    return null;
  }
}

/** Someone else's (or our own) — anything we must not target. */
function takenByAnyone(roomName: string): boolean {
  const room = Game.rooms[roomName];
  if (!room || !room.controller) return false; // no vision: trust the pack
  return !!room.controller.owner;
}

/** A home needs two sources. Visible count wins; else the pack must say >= 2. */
function tooFewSources(roomName: string, packN?: number): boolean {
  const room = Game.rooms[roomName];
  if (room) return room.find(FIND_SOURCES).length < 2;
  return !(typeof packN === "number" && packN >= 2);
}

/** Visible leftover spawn we cannot remove. No vision: trust the pack. */
function hasVisibleForeignSpawn(roomName: string): boolean {
  const room = Game.rooms[roomName];
  if (!room) return false;
  // HOSTILE is my===false only — unowned leftovers (user undefined) miss it.
  // Same predicate as PlanV2 occupy: any standing spawn that is not ours.
  return room.find(FIND_STRUCTURES, {filter: (s: Structure) =>
    s.structureType === STRUCTURE_SPAWN && !(s as StructureSpawn).my}).length > 0;
}

function armColonise(st: ExpandState): void {
  const m = M();
  if (!m.target_colonise) m.target_colonise = {};
  if (m.target_colonise.room !== st.room) {
    m.target_colonise.room = st.room;
    m.target_colonise.spawn_pos = new RoomPosition(st.spawnPos.x, st.spawnPos.y, st.room);
    // legacy escort timer: start the clock now so the first ranged escort is
    // not spawned the instant a rich RCL7 room notices the colony
    m.target_colonise.lastSpawnRanger = Game.time;
    logAlways(
      `autoExpand: colonise armed for ${st.room} — spawn tile ${st.spawnPos.x},${st.spawnPos.y}`,
    );
  }
  // rooms.ts only recomputes this every 300 ticks and it gates the claimer
  if (!m.CanClaimRemote || m.CanClaimRemote < 1) m.CanClaimRemote = 1;
}

/**
 * Idempotent: make sure the planned spawn tile has a site on it.
 *
 * The legacy placer (rooms.construction) only fires while the fresh room is
 * still RCL1 — but the ContainerBuilders upgrade the controller while they
 * work, so a colony that reaches RCL2 before the site is placed loses that
 * window for good. buildcontainer.ts re-places it, but only on `Game.time %
 * 25` and only while a builder is standing in the room. This closes both
 * holes from world state alone.
 */
function ensureSpawnSite(st: ExpandState, room: Room): void {
  // the caller (phase `claimed`) is already throttled to every 10th tick
  if (room.find(FIND_MY_SPAWNS).length) return;
  const pos = new RoomPosition(st.spawnPos.x, st.spawnPos.y, st.room);
  for (const s of pos.lookFor(LOOK_CONSTRUCTION_SITES)) {
    if (s.structureType === STRUCTURE_SPAWN) return;
  }
  clearPlanSpawnTile(room, pos.x, pos.y);
  const res = pos.createConstructionSite(STRUCTURE_SPAWN);
  if (res === OK) logAlways(`autoExpand: ${st.room} spawn site placed at ${pos.x},${pos.y}`);
  else if (res !== ERR_FULL)
    logAlways(`autoExpand: ${st.room} spawn site at ${pos.x},${pos.y} failed: ${res}`);
}

function finish(st: ExpandState, why: string): void {
  const m = M();
  if (m.target_colonise && m.target_colonise.room === st.room) m.target_colonise = {};
  delete m.autoExpand;
  logAlways(`autoExpand: ${st.room} — ${why} (${Game.time - st.started} ticks total)`);
}

function setPhase(st: ExpandState, phase: Phase): void {
  st.phase = phase;
  st.since = Game.time;
  logAlways(`autoExpand: ${st.room} -> ${phase} (tick ${Game.time})`);
}

/** Choose a target from segment 86. Returns true once the state is armed. */
function pick(st: ExpandState): void {
  const data = readSegment(SEG_INDEX);
  if (data === undefined) return; // active next tick
  if (data === null || !data.targets || !data.targets.length) {
    logAlways(`autoExpand: segment ${SEG_INDEX} empty — run tools/server/push-expansion-pack.mjs`);
    delete M().autoExpand;
    return;
  }
  const mine: { [name: string]: boolean } = {};
  for (const r of ownedRooms()) mine[r.name] = true;
  for (const t of data.targets) {
    if (mine[t.room] || takenByAnyone(t.room)) continue;
    if (hasVisibleForeignSpawn(t.room)) {
      logAlways(`autoExpand: skip ${t.room} — visible foreign spawn`);
      continue;
    }
    if (tooFewSources(t.room, t.nSources)) {
      logAlways(`autoExpand: skip ${t.room} — fewer than 2 sources`);
      continue;
    }
    st.room = t.room;
    st.spawnPos = t.spawnPos;
    st.seg = t.seg;
    st.hash = t.hash;
    logAlways(
      `autoExpand: target ${t.room} score ${t.score} spawn ${t.spawnPos.x},${t.spawnPos.y} ` +
        `plan segment ${t.seg === undefined ? "none" : t.seg}`,
    );
    setPhase(st, "claiming");
    armColonise(st);
    return;
  }
  logAlways(`autoExpand: every target in segment ${SEG_INDEX} is taken — re-run push-expansion-pack.mjs`);
  delete M().autoExpand;
}

function payloadSpawnPos(payload: any): { x: number; y: number } | null {
  const s = payload && payload.structures && payload.structures.spawn;
  if (s && s[0] && typeof s[0].x === "number") return { x: s[0].x, y: s[0].y };
  const t = payload && payload.t && payload.t.spawn;
  if (t && t.length) {
    const p = t[0];
    if (typeof p === "number") return { x: p % 50, y: Math.floor(p / 50) };
    if (p && typeof p.x === "number") return { x: p.x, y: p.y };
  }
  return null;
}

/** Why this room must not receive this pack. null = ok. */
function refuseAdopt(room: Room, payload: any): string | null {
  if (room.find(FIND_SOURCES).length < 2) return "fewer than 2 sources";
  const live = room.find(FIND_MY_SPAWNS);
  if (!live.length) return null;
  const planned = payloadSpawnPos(payload);
  if (!planned) return null;
  for (const s of live) {
    if (Math.max(Math.abs(s.pos.x - planned.x), Math.abs(s.pos.y - planned.y)) <= 6) return null;
  }
  return `live spawn ${live[0].pos.x},${live[0].pos.y} != pack spawn ${planned.x},${planned.y}`;
}

/** Write a pack payload into room.memory.planV2 and say so. */
function adoptPacked(room: Room, payload: any, from: string): void {
  const why = refuseAdopt(room, payload);
  if (why) {
    (room.memory as any).planPackSkip = true;
    logAlways(`autoExpand: ${room.name} refuse pack from ${from} — ${why}`);
    return;
  }
  room.memory.planV2 = packPlanPayload(payload);
  // fresh colonies auto-arm migration so bootstrap squatters get cleared;
  // established rooms (a pack adopted late) stay placement-only until the
  // operator runs migratePlan() — same rule as console adoption
  const young =
    room.controller != null &&
    room.controller.level < 4 &&
    room.find(FIND_MY_STRUCTURES).length < 15;
  if (!(room.memory as any).planMigration && young) {
    (room.memory as any).planMigration = { mode: "auto", since: Game.time };
    logAlways(`autoExpand: ${room.name} auto-armed migration (young colony)`);
  }
  const t = (room.memory.planV2 as any).t;
  delete (room.memory as any).planPackMiss;
  logAlways(
    `autoExpand: ${room.name} planV2 written from ${from} (${payload.planHash || "no-hash"}) — ` +
      Object.keys(t)
        .map((k) => `${k}:${t[k].length}`)
        .join(" "),
  );
}

/** Final phase: hand the layout to placeFromPlanV2 and stand down. */
function adoptPlanForNewRoom(st: ExpandState): void {
  const room = Game.rooms[st.room];
  if (!room) return; // vision is guaranteed once we own a spawn there; wait
  if (st.seg === undefined) {
    finish(st, "spawn up — no packed plan named for this room; runPackAdoption sweeps for one");
    return;
  }
  if (room.memory.planV2) {
    finish(st, `spawn up — planV2 already present (${(room.memory.planV2 as any).h})`);
    return;
  }
  const data = readSegment(st.seg);
  if (data === undefined) return; // active next tick
  const payload = data && data[st.room];
  if (!payload) {
    logAlways(`autoExpand: segment ${st.seg} has no plan for ${st.room} — re-push the pack`);
    finish(st, "spawn up — plan missing, legacy construction takes over");
    return;
  }
  adoptPacked(room, payload, `segment ${st.seg}`);
  finish(st, "EXPANSION COMPLETE — room claimed, spawn built, plan adopted");
}

/**
 * ---------------------------------------------------------------------------
 * PACK ADOPTION — every owned room finds its packed plan, by itself.
 *
 * THE BUG THIS REPLACES
 * ---------------------
 * Adoption used to exist in exactly ONE place: phase `spawned` of the
 * ExpandState machine above. That made `Memory.autoExpand` — a single,
 * single-room, deletable object — the only thing in the bot that could ever
 * turn a claim into a layout. Every one of these loses the plan permanently:
 *
 *   · the state is deleted at PHASE_TIMEOUT (a colony that takes >20k ticks to
 *     stand its spawn up is abandoned mid-flight, and the room keeps running
 *     forever on legacy construction);
 *   · `finish()` runs at the FIRST failure to read a payload — including the
 *     `st.seg === undefined` case (targets ranked 13-20 carry no segment) —
 *     and never retries;
 *   · Memory is wiped / the state is cleared by hand / stopExpand() is called
 *     while a claimed room is still waiting;
 *   · the room was claimed by something OTHER than this state machine — the
 *     legacy target_colonise flow, spawn-in.mjs, a re-claim after a downgrade.
 *     Live proof on this server RIGHT NOW: waxeye owns E12S8 (RCL1, no
 *     planV2, running on the legacy dynamic layout) while Memory.autoExpand
 *     still points at E15S6 in phase `claiming` — 7900 ticks and counting.
 *     Nothing was ever going to give E12S8 a plan.
 *
 * And because the arming lived in Memory, a memory reset disarmed it silently.
 *
 * THE FIX
 * -------
 * Adoption is now DERIVED, every 25 ticks, from two facts that both survive a
 * memory wipe: "which rooms do I own" (world state) and "which rooms does the
 * expansion pack carry a plan for" (segment state). The Memory object below is
 * a cursor for the multi-tick segment read, not an arming flag — delete it and
 * the next scan re-creates it.
 *
 * Walk, per candidate room:
 *   1. segment 86 (the index) usually NAMES the segment holding its plan;
 *   2. otherwise sweep 80-85 one per tick (the index drops a room from
 *      `targets` as soon as it is owned, so a pack re-pushed between the claim
 *      and the scan leaves the plan reachable only this way);
 *   3. no entry anywhere -> mark the room and back off for 3000 ticks, so a
 *      room the pack simply does not cover costs one segment sweep, not one
 *      per scan, forever.
 *
 * Deliberately gated on ownership only, NOT on a spawn existing: at RCL1
 * placeFromPlanV2 sites the plan's own spawn, which is the same tile
 * ensureSpawnSite would have used. Worst case is ~7 ticks of segment walking
 * after the claim — comfortably inside the 100-tick budget.
 * ---------------------------------------------------------------------------
 */
interface AdoptCursor {
  room: string;
  /** segment named by the index; undefined once we fall back to the sweep */
  seg?: number;
  /** index into SEG_PLANS for the fallback sweep */
  scan?: number;
  since: number;
}

export function runPackAdoption(): void {
  const m = M();
  let cur = m.packAdopt as AdoptCursor | undefined;

  if (!cur) {
    if (Game.time % ADOPT_SCAN_EVERY !== 0) return;
    for (const room of ownedRooms()) {
      if ((room.memory as any).planPackSkip) continue;
      if (room.memory.planV2) {
        // self-heal colonies that adopted BEFORE the arming model existed:
        // they hold a plan but no planMigration, so squatter-reclaim is dead
        // an existing planMigration of ANY mode — including the "disarmed"
        // tombstone migrateAbort writes — blocks the self-heal: only rooms
        // that predate the arming model entirely are armed here
        const armless = !(room.memory as any).planMigration;
        const young =
          room.controller != null &&
          room.controller.level < 4 &&
          room.find(FIND_MY_STRUCTURES).length < 15;
        if (armless && young) {
          (room.memory as any).planMigration = { mode: "auto", since: Game.time };
          logAlways(`autoExpand: ${room.name} auto-armed migration (pre-arming-model colony)`);
        }
        continue;
      }
      const miss = (room.memory as any).planPackMiss;
      if (miss && Game.time - miss < ADOPT_MISS_BACKOFF) continue;
      cur = { room: room.name, since: Game.time };
      m.packAdopt = cur;
      logAlways(
        `autoExpand: ${room.name} is owned (RCL${(room.controller as StructureController).level}) ` +
          `with no planV2 — looking for a pack entry in segment ${SEG_INDEX} / ${SEG_PLANS[0]}-${SEG_PLANS[SEG_PLANS.length - 1]}`,
      );
      break;
    }
    if (!cur) return;
  }

  const room = Game.rooms[cur.room];
  if (!room || !room.controller || !room.controller.my) {
    delete m.packAdopt; // lost it, or lost vision — the next scan re-derives
    return;
  }
  if (room.memory.planV2) {
    delete m.packAdopt; // adopted by the state machine (or by hand) meanwhile
    return;
  }
  if (Game.time - cur.since > ADOPT_TIMEOUT) {
    (room.memory as any).planPackMiss = Game.time;
    logAlways(
      `autoExpand: ${cur.room} — segments never became active within ${ADOPT_TIMEOUT} ticks; ` +
        `retrying in ${ADOPT_MISS_BACKOFF}t`,
    );
    delete m.packAdopt;
    return;
  }

  // 1. the index names the segment holding this room's plan
  if (cur.seg === undefined && cur.scan === undefined) {
    const idx = readSegment(SEG_INDEX);
    if (idx === undefined) return; // active next tick
    let seg: number | undefined;
    if (idx && idx.targets) {
      for (const t of idx.targets) {
        if (t.room === cur.room && t.seg !== undefined) seg = t.seg;
      }
    }
    if (seg === undefined) cur.scan = 0;
    else cur.seg = seg;
    return;
  }

  // 2. read the named segment
  if (cur.seg !== undefined) {
    const data = readSegment(cur.seg);
    if (data === undefined) return; // active next tick
    const payload = data && data[cur.room];
    if (payload) {
      adoptPacked(room, payload, `pack segment ${cur.seg}`);
      delete m.packAdopt;
      return;
    }
    cur.seg = undefined; // index is stale — fall through to the sweep
    cur.scan = 0;
    return;
  }

  // 3. sweep 80-85, one segment per tick
  const seg = SEG_PLANS[cur.scan as number];
  if (seg === undefined) {
    (room.memory as any).planPackMiss = Game.time;
    logAlways(
      `autoExpand: ${cur.room} has no entry in the expansion pack (segments ` +
        `${SEG_PLANS.join(",")}) — legacy construction stays in charge. Owner action: ` +
        `push-plan.mjs ${cur.room} then adoptPlan("${cur.room}"), or re-push the pack before claiming.`,
    );
    delete m.packAdopt;
    return;
  }
  const data = readSegment(seg);
  if (data === undefined) return; // active next tick
  const payload = data && data[cur.room];
  if (payload) {
    adoptPacked(room, payload, `pack segment ${seg} (sweep)`);
    delete m.packAdopt;
    return;
  }
  cur.scan = (cur.scan as number) + 1;
}

function advance(st: ExpandState): void {
  if (Game.time - st.since > PHASE_TIMEOUT) {
    logAlways(
      `autoExpand: ABORT — ${st.room} stuck in ${st.phase} for ${Game.time - st.since} ticks. ` +
        `Resetting; check the claimer / colonise flow, then call autoExpand() again.`,
    );
    const m = M();
    if (m.target_colonise && m.target_colonise.room === st.room) m.target_colonise = {};
    delete m.autoExpand;
    return;
  }

  const room = Game.rooms[st.room];
  const mine = !!(room && room.controller && room.controller.my);
  const hasSpawn = !!(room && room.find(FIND_MY_SPAWNS).length);

  switch (st.phase) {
    case "picking":
      pick(st);
      return;

    case "claiming":
      if (Game.rooms[st.room] && tooFewSources(st.room)) {
        finish(st, "ABORT — fewer than 2 sources");
        return;
      }
      if (hasVisibleForeignSpawn(st.room) && !hasSpawn) {
        finish(st, "ABORT — visible foreign spawn while claiming");
        return;
      }
      if (mine) {
        setPhase(st, hasSpawn ? "spawned" : "claimed");
        return;
      }
      // idempotent: rooms.spawning spawns the claimer off target_colonise
      armColonise(st);
      return;

    case "claimed":
      if (!mine) {
        // lost it again (downgrade / someone else) — go back for it
        setPhase(st, "claiming");
        return;
      }
      if (tooFewSources(st.room)) {
        finish(st, "ABORT — fewer than 2 sources");
        return;
      }
      wipeForeignSites(room as Room);
      if (hasSpawn) {
        setPhase(st, "spawned");
        return;
      }
      if (hasVisibleForeignSpawn(st.room)) {
        finish(st, "ABORT — visible foreign spawn, still spawnless");
        return;
      }
      // missing since → started, else treat as already expired so a hand-written
      // Memory.autoExpand cannot sit in claimed forever (NaN > N is false)
      {
        const claimedSince =
          typeof st.since === "number"
            ? st.since
            : typeof st.started === "number"
              ? st.started
              : Game.time - CLAIMED_SPAWNLESS;
        if (Game.time - claimedSince >= CLAIMED_SPAWNLESS) {
          finish(st, `ABORT — claimed still spawnless after ${CLAIMED_SPAWNLESS}t`);
          return;
        }
      }
      // keep the colonise target set: it is what sends the ContainerBuilders
      // that build and feed the spawn (rooms.spawning)
      armColonise(st);
      ensureSpawnSite(st, room as Room);
      return;

    case "spawned":
      adoptPlanForNewRoom(st);
      return;
  }
}

/** Called once per tick from main. */
export function runAutoExpand(): void {
  const m = M();
  // Runs even with the expansion feature off, and even with no expansion in
  // flight: a room that is ALREADY claimed deserves its plan regardless of
  // whether we currently want another one. This is the safety net described
  // above, and the only adoption path that survives a memory reset.
  runPackAdoption();
  if (m.features && m.features.autoExpand === false) return;
  const st = m.autoExpand as ExpandState | undefined;
  if (!st) {
    if (Game.time % CHECK_EVERY !== 0) return;
    if (blockedReason()) return;
    m.autoExpand = {
      room: "",
      spawnPos: { x: 0, y: 0 },
      phase: "picking",
      since: Game.time,
      started: Game.time,
    } as ExpandState;
    logAlways(`autoExpand: starting — GCL ${Game.gcl.level}, ${ownedRooms().length} rooms, bucket ${Game.cpu.bucket}`);
    return;
  }
  // segment phases need consecutive ticks; the rest is world polling
  if (st.phase !== "picking" && st.phase !== "spawned" && Game.time % 10 !== 0) return;
  advance(st);
}

/** Console: autoExpand() — start now, without waiting for the 50-tick check. */
(global as any).autoExpand = function () {
  const m = M();
  if (m.features && m.features.autoExpand === false) {
    m.features.autoExpand = true;
  }
  const reason = blockedReason();
  if (reason) return `autoExpand blocked: ${reason}`;
  m.autoExpand = {
    room: "",
    spawnPos: { x: 0, y: 0 },
    phase: "picking",
    since: Game.time,
    started: Game.time,
  } as ExpandState;
  return `autoExpand armed — reading segment ${SEG_INDEX} over the next 2 ticks`;
};

(global as any).autoExpandStatus = function () {
  const m = M();
  const st = m.autoExpand as ExpandState | undefined;
  const owned = ownedRooms();
  const noPlan = owned.filter((r) => !r.memory.planV2).map((r) => r.name);
  const cur = m.packAdopt as AdoptCursor | undefined;
  const head =
    `GCL ${Game.gcl.level} · rooms ${owned.length} (${owned.map((r) => `${r.name}:${(r.controller as StructureController).level}${r.memory.planV2 ? "" : "!"}`).join(",")}) ` +
    `· bucket ${Game.cpu.bucket} · feature ${m.features && m.features.autoExpand === false ? "OFF" : "on"}` +
    ` · unplanned [${noPlan.join(",") || "none"}]` +
    ` · packAdopt ${cur ? `${cur.room} seg ${cur.seg} scan ${cur.scan} ${Game.time - cur.since}t` : "idle"}`;
  if (!st) return `${head} · idle · ${blockedReason() || "ready — next check within 50 ticks"}`;
  const room = Game.rooms[st.room];
  return (
    `${head} · ${st.room} phase ${st.phase} for ${Game.time - st.since}t (run ${Game.time - st.started}t) ` +
    `· spawnPos ${st.spawnPos.x},${st.spawnPos.y} · seg ${st.seg} ` +
    `· vision ${room ? "yes" : "no"} · mine ${!!(room && room.controller && room.controller.my)} ` +
    `· spawns ${room ? room.find(FIND_MY_SPAWNS).length : "?"} ` +
    `· target_colonise ${m.target_colonise && m.target_colonise.room}`
  );
};

(global as any).stopExpand = function () {
  const m = M();
  const st = m.autoExpand as ExpandState | undefined;
  if (m.target_colonise && st && m.target_colonise.room === st.room) m.target_colonise = {};
  delete m.autoExpand;
  return st ? `autoExpand stopped (was ${st.room} / ${st.phase})` : "autoExpand was idle";
};
