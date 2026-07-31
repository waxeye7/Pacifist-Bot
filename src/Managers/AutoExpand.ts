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
 * Console: autoExpand() · autoExpandStatus() · stopExpand()
 */
import { logAlways } from "utils/Logger";
import { packPlanPayload } from "utils/PlanV2";

const SEG_INDEX = 86;
const CHECK_EVERY = 50;
/** phases advance on world state; this is only the giving-up bound */
const PHASE_TIMEOUT = 20000;
const MIN_BUCKET = 5000;
const MIN_RCL = 3;

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

/** null = clear to expand, otherwise the reason we are not. */
function blockedReason(): string | null {
  const owned = ownedRooms();
  if (!owned.length) return "no owned rooms";
  if (Game.gcl.level <= owned.length)
    return `GCL ${Game.gcl.level} <= ${owned.length} owned rooms (no free claim)`;
  if (Game.cpu.bucket <= MIN_BUCKET) return `bucket ${Game.cpu.bucket} <= ${MIN_BUCKET}`;
  if (!owned.some((r) => (r.controller as StructureController).level >= MIN_RCL))
    return `no owned room at RCL${MIN_RCL}+`;
  const st = M().autoExpand as ExpandState | undefined;
  if (st) return `already expanding to ${st.room} (${st.phase})`;
  return null;
}

/**
 * Request a segment; undefined until it is active (usually the next tick).
 *
 * setActiveSegments REPLACES the whole active set, and adoptPlan (88) plus the
 * plan animator (89-99) call it every tick too. AutoExpand runs last in the
 * tick, so it asks for the union of what is already active and what it needs —
 * otherwise whoever runs last starves everyone else. Live proof: with
 * Memory.planAnim.active set, the first cut of this function sat in `picking`
 * for 400+ ticks because segment 86 was never activated.
 */
function readSegment(seg: number): any | undefined {
  const active: number[] = [];
  for (const key in RawMemory.segments) {
    const n = Number(key);
    if (n !== seg) active.push(n);
  }
  RawMemory.setActiveSegments([seg].concat(active).slice(0, 10));
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
  const res = pos.createConstructionSite(STRUCTURE_SPAWN);
  if (res === OK) logAlways(`autoExpand: ${st.room} spawn site placed at ${pos.x},${pos.y}`);
  else if (res !== ERR_FULL && res !== ERR_INVALID_TARGET)
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

/** Final phase: hand the layout to placeFromPlanV2 and stand down. */
function adoptPlanForNewRoom(st: ExpandState): void {
  const room = Game.rooms[st.room];
  if (!room) return; // vision is guaranteed once we own a spawn there; wait
  if (st.seg === undefined) {
    finish(st, "spawn up — no packed plan for this room, legacy construction takes over");
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
  room.memory.planV2 = packPlanPayload(payload);
  const t = (room.memory.planV2 as any).t;
  logAlways(
    `autoExpand: ${st.room} planV2 written (${payload.planHash}) — ` +
      Object.keys(t)
        .map((k) => `${k}:${t[k].length}`)
        .join(" "),
  );
  finish(st, "EXPANSION COMPLETE — room claimed, spawn built, plan adopted");
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
      if (hasSpawn) {
        setPhase(st, "spawned");
        return;
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
  const head =
    `GCL ${Game.gcl.level} · rooms ${owned.length} (${owned.map((r) => `${r.name}:${(r.controller as StructureController).level}`).join(",")}) ` +
    `· bucket ${Game.cpu.bucket} · feature ${m.features && m.features.autoExpand === false ? "OFF" : "on"}`;
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
