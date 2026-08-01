/**
 * PlanV2 — live placement from the offline v2 planner.
 *
 * Flow:
 *   1. `node tools/server/push-plan.mjs <room>` writes the plan into
 *      memory segment 88.
 *   2. Console: `adoptPlan("E11S2")` — next ticks read the segment and
 *      store a packed copy in room.memory.planV2.
 *   3. rooms.construction.ts short-circuits into placeFromPlanV2() for
 *      adopted rooms — legacy stamp construction never runs there.
 *   4. rooms.ts also calls placeFromPlanV2 every 15 ticks so the 4 site
 *      slots recycle without waiting for the 100/1000-tick construction pass.
 *
 * Placement is RCL-staged: CONTROLLER_STRUCTURES gates counts, plan-array
 * order gives priority, max 4 open construction sites per room.
 *
 * The plan also feeds the LEGACY consumers that were written against the v1
 * dynamic planner — defence perimeter, hub anchor, road upkeep list. See
 * syncPlanV2Memory below: without it a planV2 room has no rampartLocations,
 * no basePlan.hub and no keepTheseRoads, which silently disables safe-mode
 * triggers, the RampartDefender leash, RampartErectors and maintainers.
 */
import { logAlways } from "utils/Logger";
import { isUnreachableTile } from "utils/Reachability";

const SEGMENT = 88;
const MAX_SITES = 4;
/** how often the legacy-facing memory mirror is refreshed (ticks) */
const SYNC_EVERY = 100;

export type PackedPlan = {
  v: number;
  /** plan hash from push-plan.mjs — staleness marker, see F7 */
  h?: string;
  /** last tick syncPlanV2Memory ran */
  s?: number;
  // packed coords: x + y * 50, in placement priority order
  // (also carries the non-buildable keys `shellCut` and `labInput`)
  t: { [structureType: string]: number[] };
};

const unpack = (p: number) => ({ x: p % 50, y: Math.floor(p / 50) });

/** Console: adoptPlan("E11S2") — requires push-plan.mjs to have run. */
(global as any).adoptPlan = function (roomName: string) {
  Memory.planV2Adopt = { room: roomName, since: Game.time };
  return `adopting plan for ${roomName} — segment ${SEGMENT} read over next 2 ticks`;
};

(global as any).dropPlan = function (roomName: string) {
  const room = Game.rooms[roomName];
  if (room) delete room.memory.planV2;
  return `dropped planV2 for ${roomName} (legacy construction resumes)`;
};

/**
 * Turn a planner payload (push-plan.mjs segment 88, or one entry of the
 * auto-expand pack in segments 80-85) into the packed room.memory.planV2
 * value. Shared so a freshly claimed room adopts EXACTLY what adoptPlan()
 * would have given it — see Managers/AutoExpand.ts.
 */
export function packPlanPayload(data: any): PackedPlan {
  const t: { [k: string]: number[] } = {};
  const pack = (arr: Array<{ x: number; y: number }>) => arr.map((p) => p.x + p.y * 50);
  const s = data.structures || {};
  // ---------------------------------------------------------------------
  // Link order. The planner emits [hub, src1, src2, ctrl] (verified: all 159
  // rooms in out-v2/plans-hub.json ship exactly 4 links in that order).
  // CONTROLLER_STRUCTURES.link is {5:2, 6:3, 7:4, 8:6}, so whatever order we
  // emit here IS the RCL schedule — index 0..1 land at RCL5, index 2 at RCL6,
  // index 3 at RCL7.
  //
  // We re-emit as [hub, src1, ctrl, src2]:
  //   [0] hub link         RCL5  — useless alone, but it is the other end of
  //                               every link transfer, so it must be first
  //   [1] source 1 link    RCL5  — pays for itself immediately: it retires a
  //                               hauler round trip the tick it completes
  //   [2] controller link  RCL6
  //   [3] source 2 link    RCL7
  //
  // REJECTED — the previous order [hub, ctrl, src1, src2]: it spent the RCL5
  // pair on hub+controller and pushed BOTH source links to RCL6/7. That reads
  // as an upgrade-speed play, but at RCL5 the controller link has nothing to
  // fill it — the hub link is fed by the source links, so with neither source
  // linked the controller link is a 5k-energy ornament that a hauler still has
  // to service by hand. Linking a source first feeds the hub, which is what
  // makes the controller link worth building at RCL6.
  //
  // The slice arithmetic below is deliberately shape-agnostic (hub first,
  // controller last, sources in between) so a room that ever ships a different
  // link count still gets hub -> first source -> controller -> the rest,
  // rather than a silently scrambled order.
  // ---------------------------------------------------------------------
  const links = s.link || [];
  const linkOrder =
    links.length > 2
      ? [links[0], links[1], links[links.length - 1], ...links.slice(2, -1)]
      : links;
  t.spawn = pack(s.spawn || []);
  t.extension = pack(s.extension || []);
  t.container = pack(s.container || []);
  t.tower = pack(s.tower || []);
  t.storage = pack(s.storage || []);
  t.terminal = pack(s.terminal || []);
  t.link = pack(linkOrder);
  t.road = pack(s.road || []);
  t.lab = pack(s.lab || []);
  t.nuker = pack(s.nuker || []);
  t.rampart = pack(s.rampart || []);
  t.observer = pack(s.observer || []);
  // extractor sits ON the mineral by design — the only planned structure
  // that shares a tile with a room object
  t.extractor = pack(s.extractor || []);
  // NOT buildable types — data the legacy bot needs off the plan:
  //   shellCut  the min-cut wall ring ONLY (no bubbles) → defence perimeter
  //   labInput  the two reaction input labs → rooms.labs assignment
  t.shellCut = pack(data.shellCut || []);
  t.labInput = pack(data.labInputs || []);
  return { v: 1, h: data.planHash, t };
}

/** Per-tick: handles the segment-read state machine for adoption. */
export function runPlanV2Adoption(): void {
  const adopt = Memory.planV2Adopt;
  if (!adopt) return;
  if (Game.time - adopt.since > 20) {
    logAlways(`planV2: adoption for ${adopt.room} timed out (segment ${SEGMENT} empty? run push-plan.mjs)`);
    delete Memory.planV2Adopt;
    return;
  }
  RawMemory.setActiveSegments([SEGMENT]);
  const raw = RawMemory.segments[SEGMENT];
  if (raw === undefined) return; // active next tick
  try {
    const data = JSON.parse(raw);
    if (data.room !== adopt.room) {
      logAlways(`planV2: segment has ${data.room}, wanted ${adopt.room} — re-run push-plan.mjs`);
      delete Memory.planV2Adopt;
      return;
    }
    const room = Game.rooms[adopt.room];
    if (!room || !room.controller || !room.controller.my) {
      logAlways(`planV2: ${adopt.room} not visible/owned — adopt after spawn-in`);
      delete Memory.planV2Adopt;
      return;
    }
    const packed = packPlanPayload(data);
    const t = packed.t;
    const prev = room.memory.planV2 as PackedPlan | undefined;
    if (prev && prev.h && data.planHash && prev.h !== data.planHash) {
      logAlways(`planV2: ${adopt.room} re-adopt — plan hash ${prev.h} -> ${data.planHash} (layout changed)`);
    }
    room.memory.planV2 = packed;
    delete Memory.planV2Adopt;
    logAlways(
      `planV2: ${adopt.room} adopted (${data.planHash || "no-hash"}) — ` +
        Object.keys(t)
          .map((k) => `${k}:${t[k].length}`)
          .join(" "),
    );
  } catch (e: any) {
    logAlways(`planV2: segment parse failed: ${e.message}`);
    delete Memory.planV2Adopt;
  }
}

/** RCL gates beyond CONTROLLER_STRUCTURES counts. */
function typeAllowedAtRcl(type: string, lvl: number): boolean {
  if (type === "road") return lvl >= 3;
  if (type === "rampart") return lvl >= 4;
  if (type === "container") return lvl >= 2;
  // RCL8 luxuries — CONTROLLER_STRUCTURES caps them at 1 anyway, this is
  // just belt-and-braces so they never queue a site the server rejects.
  if (type === "nuker" || type === "observer") return lvl >= 8;
  if (type === "extractor") return lvl >= 6;
  return true;
}

/**
 * How many of the plan's roads to build at this RCL.
 *
 * THE INVARIANT THIS RELIES ON: the planner emits `structures.road` ordered by
 * a network BFS outward from the sitter, so EVERY PREFIX of the array is a
 * connected network reachable on foot from the sitter. That is what makes a
 * plain `slice(0, N)` a legitimate budget: take the first 20 and you get the
 * 20 tiles of road nearest the base that actually join it up, not 20 tiles
 * scattered across the room.
 *
 * The comment here used to claim the array was "priority-ordered", which was
 * simply false — roads were pushed in generation order (source lines, then
 * controller line, then the mineral spur, then hub filler), so the RCL3 prefix
 * bought disconnected stubs in 148 of 159 rooms: 1272 of the RCL3 road tiles
 * were unreachable from the sitter, E5S1 spending 13 of its 20 on a stub 30+
 * tiles from the hub. The fix belongs in the planner (it has the terrain and
 * the CPU to do a real BFS), NOT here — re-sorting 129 packed coords in the
 * bot every 15 ticks would burn CPU on shard3 to recompute a constant. So this
 * side only documents the contract and, at RCL3 where the prefix is the whole
 * point, cheaply NOTICES if the contract is broken (see auditRoadPrefix).
 */
function roadBudget(planRoads: number[], lvl: number): number {
  if (lvl < 3) return 0;
  if (lvl === 3) return Math.min(20, planRoads.length);
  return planRoads.length;
}

/**
 * DEFENSIVE, LOG-ONLY. Never places, skips or reorders anything.
 *
 * If a re-pushed plan ever regresses to generation-ordered roads, the symptom
 * is silent and expensive: the room spends its entire RCL3 road allowance on
 * tiles nothing can walk to, and nobody notices until someone re-derives it
 * offline (which is exactly how M4 was found). One log line makes it visible.
 *
 * Only runs at RCL3 and only over the <=20-tile prefix, because that is the
 * ONLY level where the prefix is a prioritisation decision — from RCL4 the
 * budget is the whole array, so there is no prefix to get wrong. Bounded at
 * ~26 tiles of 8-way BFS over a plain object, throttled to roughly one pass
 * per 1000 ticks. Deliberately NOT PathFinder: this must never be a per-tick
 * cost on shard3, and an approximate answer is enough for a warning.
 *
 * Containers and the hub structures conduct — the generous reading, matching
 * how the finding was re-derived, so we only ever warn on a real break.
 */
function auditRoadPrefix(room: Room, plan: PackedPlan, prefix: number[]): void {
  if (!prefix.length) return;
  const conduct: { [packed: number]: boolean } = {};
  for (const p of prefix) conduct[p] = true;
  for (const k of ["container", "storage", "spawn"]) {
    for (const p of plan.t[k] || []) conduct[p] = true;
  }
  // seed from the hub (storage tile) — the sitter stands on/next to it
  const seed = plan.t.storage && plan.t.storage.length ? plan.t.storage[0] : undefined;
  if (seed === undefined) return;
  const seen: { [packed: number]: boolean } = { [seed]: true };
  const queue: number[] = [seed];
  while (queue.length) {
    const cur = queue.pop() as number;
    const { x, y } = unpack(cur);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
        const np = nx + ny * 50;
        if (seen[np] || !conduct[np]) continue;
        seen[np] = true;
        queue.push(np);
      }
    }
  }
  let orphans = 0;
  for (const p of prefix) if (!seen[p]) orphans++;
  if (orphans) {
    logAlways(
      `planV2 ${room.name}: ${orphans}/${prefix.length} RCL3 road tiles are not connected to ` +
        `the hub — the plan's road array is not BFS-ordered (re-run the planner and re-push)`,
    );
  }
}

/**
 * ---------------------------------------------------------------------------
 * The mineral container is deferred to RCL6.
 *
 * The planner emits containers as [source, source, controller, mineral] and
 * containers unlock at RCL2, so the mineral container was being sited FOUR
 * RCLs before the extractor that gives it a reason to exist (extractor is
 * RCL6). Median chebyshev 17 from the hub, max 38 (E17S4 plants it at 3,16
 * against a hub at 41,34). It then decays from RCL2 to RCL6 with nothing ever
 * putting a mineral in it — and because `container` sits ahead of `extension`
 * in PLACE_ORDER it was eating one of the four RCL2 site slots ahead of the
 * first extension, with no roads built yet to walk out there on.
 *
 * We cannot change the planner or the payload from here, so we identify it
 * structurally: the extractor sits ON the mineral by design (the one planned
 * structure sharing a tile with a room object), so the mineral container is
 * the planned container adjacent to the extractor tile.
 *
 * Ties: take the LAST such container, not all of them. Audited over all 159
 * shipped rooms — 158 have exactly one adjacent container and it is always
 * container[3], the mineral one. E8S3 is the single room with two candidates,
 * and they are NOT both mineral-side: its controller (21,29) happens to sit 3
 * tiles from its mineral (23,26), so the genuine CONTROLLER container at 24,26
 * is also mineral-adjacent. Deferring "all candidates" would have taken E8S3's
 * controller container away from RCL2 through RCL5 and parked its upgraders on
 * a hand-fed haul for four levels. Taking the last candidate picks
 * container[3] — the mineral container, never a source or controller
 * container — in 159/159 rooms.
 *
 * Removing the tile from the array (rather than skipping it at placement) is
 * deliberate: it must not consume a site slot OR a `count` slot, and it must
 * not make reclaimAtCap demolish a live container to free room for a tile the
 * plan does not actually want yet.
 * ---------------------------------------------------------------------------
 */
const EXTRACTOR_RCL = 6;

function plannedTilesFor(plan: PackedPlan, type: string, lvl: number): number[] {
  const planned = plan.t[type] || [];
  if (type !== "container" || lvl >= EXTRACTOR_RCL || !planned.length) return planned;
  const extractors = plan.t.extractor;
  if (!extractors || !extractors.length) return planned; // no extractor planned — defer nothing
  let drop = -1;
  for (let i = 0; i < planned.length; i++) {
    const c = unpack(planned[i]);
    for (const e of extractors) {
      const u = unpack(e);
      if (Math.abs(c.x - u.x) <= 1 && Math.abs(c.y - u.y) <= 1) {
        drop = i; // keep scanning: the LAST match is the mineral one (see above)
        break;
      }
    }
  }
  if (drop < 0) return planned;
  return planned.slice(0, drop).concat(planned.slice(drop + 1));
}

// Priority order, not build order per se: the first types in this list get
// the 4 site slots whenever they are behind.
// No factory and no power spawn, by design: the planner never emits them.
//
// RAMPART SITS AHEAD OF ROAD. It used to be four places behind it (road at
// index 7, rampart at index 11) over one shared 4-site budget, and from RCL4
// the road "budget" is the ENTIRE array — roads median 81, max 129. The loop
// below `break`s the moment the site budget is spent, so not one shell tile
// was sited until every planned road already existed: E5S1 had 95 roads left
// to build before the first of its 49 shell ramparts. The only other way a
// shell got built was the RampartErector, gated at RCL6 + 12k storage energy.
// Net effect: an RCL4-5 room ran with 129 roads and NO WALL AT ALL, in a bot
// whose entire premise is "it's all about defence".
//
// Ramparts are RCL4+ and roads RCL3+, so the practical schedule is now:
// RCL3 builds its 20-road prefix (connected, see roadBudget), and from RCL4
// the shell goes up before roads 21..N. That is the right trade — road 21 of
// 129 buys a few ticks of hauler fatigue; the shell is the difference between
// being raided and not. The roads are not lost, just later, and the 15-tick
// placement cadence chews through them steadily once the shell is sited.
//
// Storage and the towers still sit AHEAD of the 60-extension mass — at RCL4
// the extensions would otherwise eat every site slot for thousands of ticks
// while the room has no storage (the whole logistics layer keys off
// room.storage). Extensions still fill quickly on the 15-tick cadence. Nuker
// sits after the labs (both RCL8, but the labs feed boosts that keep the room
// alive); the observer is dead last — it is the one structure nothing depends
// on.
const PLACE_ORDER = [
  "spawn",
  "storage",
  "tower",
  "container",
  "extension",
  "terminal",
  "link",
  "rampart",
  "road",
  "lab",
  "nuker",
  "extractor",
  "observer",
];

/** Structures that legally share a tile — ERR_INVALID_TARGET there is
 *  terrain/edge, never a squatter, so the reclaim path must not run. */
const SHARES_TILE: { [k: string]: boolean } = {
  road: true,
  rampart: true,
  extractor: true,
};
/** cheap + rebuildable: the plan may take its tile back by force */
const RECLAIMABLE: string[] = [STRUCTURE_CONTAINER, STRUCTURE_EXTENSION, STRUCTURE_ROAD];

/**
 * A planned tile is occupied by a structure the plan does not want there.
 * Log it always (this is how a soft-bricked room becomes visible), and if
 * the squatter is cheap, destroy it — at most ONE per room per pass, so a
 * mis-push can never level a base. Spawn/storage/terminal/tower/lab are
 * never touched: those cost real energy and need owner attention.
 */
function reclaimTile(
  room: Room,
  type: string,
  x: number,
  y: number,
  state: { destroyed: boolean },
): void {
  const here = room.lookForAt(LOOK_STRUCTURES, x, y) as Structure[];
  let squatter: Structure | undefined;
  for (const s of here) {
    if (s.structureType === type) continue;
    if (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_RAMPART) continue;
    squatter = s;
    break;
  }
  if (!squatter) return; // terrain / exit band / transient — nothing to reclaim
  const cheap = RECLAIMABLE.indexOf(squatter.structureType) >= 0;
  if (!cheap) {
    // throttled: a permanent blocker would otherwise log every 15 ticks
    if (Game.time % 100 < 15) {
      logAlways(
        `planV2 ${room.name}: ${type}@${x},${y} blocked by ${squatter.structureType} — ` +
          `not destroyable, needs owner attention`,
      );
    }
    return;
  }
  if (state.destroyed) return; // one reclaim per room per pass
  const res = squatter.destroy();
  state.destroyed = true;
  logAlways(
    `planV2 ${room.name}: ${type}@${x},${y} squatted by ${squatter.structureType} — destroy() ${res}`,
  );
}

/**
 * ---------------------------------------------------------------------------
 * At-cap reclaim — the reason off-plan extensions were immortal.
 *
 * The placement loop below skips a type entirely once `existing >= cap`, and
 * `existing` counts EVERY built structure of that type, on-plan or not. The
 * plan was re-pushed many times while the rooms were already built, so every
 * owned room sits at exactly CONTROLLER_STRUCTURES[extension][rcl] with a big
 * minority of them on tiles the current plan does not want:
 *
 *   E9S2  RCL7  50/50 extensions, 20 off-plan
 *   E11S2 RCL7  50/50 extensions, 14 off-plan
 *   E17S4 RCL6  40/40 extensions, 16 off-plan
 *   E14S9 RCL4  20/20 extensions, 15 off-plan
 *
 * At cap the loop `continue`s, so createConstructionSite() is never called on
 * a planned tile, so ERR_INVALID_TARGET never comes back, so reclaimTile() is
 * never reached. The plan can never converge, and worse: the off-plan
 * extensions wall other extensions in (E9S2 has a five-extension pocket with
 * no walkable approach at all, E11S2 has extension@18,36, E14S9 has
 * extension@23,22) which parks the room's whole fill layer on a dead target.
 *
 * So when a type is AT cap and the plan still wants tiles it does not have,
 * demolish OFF-PLAN structures of that type to make room. Only extensions and
 * containers — cheap, rebuildable, and the ones the plan actually moves.
 * Bounded by construction: on-plan structures are never touched, so the
 * off-plan count strictly decreases and the process always terminates.
 *
 * Ranking, worst squatter first:
 *   1. unreachable — dead weight AND the thing sealing a pocket shut
 *   2. sitting on a tile the plan wants for SOMETHING (any type)
 *   3. everything else, farthest from the hub first, so the base compacts
 * ---------------------------------------------------------------------------
 */
const CAP_RECLAIM_TYPES: { [k: string]: number } = {
  [STRUCTURE_EXTENSION]: 3,
  [STRUCTURE_CONTAINER]: 1,
};
/** ticks between at-cap passes — build time for what the last pass freed */
const CAP_RECLAIM_EVERY = 60;

function reclaimAtCap(
  room: Room,
  type: string,
  planned: number[],
  cap: number,
  placedSet: { [packed: number]: boolean },
  plan: PackedPlan,
  structures: Structure[],
): void {
  const perPass = CAP_RECLAIM_TYPES[type];
  if (!perPass) return;
  if (Game.time - (room.memory.planCapReclaim || 0) < CAP_RECLAIM_EVERY) return;

  // Does the plan actually still want a tile we do not have? Only the first
  // `cap` planned tiles can ever be built, so only those count as a want.
  const wantLimit = Math.min(cap, planned.length);
  let wanted = 0;
  for (let i = 0; i < wantLimit; i++) if (!placedSet[planned[i]]) wanted++;
  if (!wanted) return;

  const plannedTiles: { [packed: number]: boolean } = {};
  for (let i = 0; i < wantLimit; i++) plannedTiles[planned[i]] = true;
  // any tile the plan wants for any type — an off-plan extension standing on
  // the storage tile is a worse squatter than one standing on open ground
  const anyPlanTile: { [packed: number]: boolean } = {};
  for (const k of Object.keys(plan.t)) {
    if (k === "shellCut" || k === "road" || k === "rampart") continue;
    for (const p of plan.t[k]) anyPlanTile[p] = true;
  }
  const hubPacked = plan.t.storage && plan.t.storage.length ? plan.t.storage[0] : undefined;
  const hub = hubPacked === undefined ? null : unpack(hubPacked);

  const candidates: Array<{ s: Structure; rank: number; d: number }> = [];
  for (const s of structures) {
    if (s.structureType !== type) continue;
    const packed = s.pos.x + s.pos.y * 50;
    if (plannedTiles[packed]) continue; // on-plan — never touched
    let rank = 2;
    if (isUnreachableTile(room, s.pos.x, s.pos.y)) rank = 0;
    else if (anyPlanTile[packed]) rank = 1;
    const d = hub ? Math.max(Math.abs(s.pos.x - hub.x), Math.abs(s.pos.y - hub.y)) : 0;
    candidates.push({ s, rank, d });
  }
  if (!candidates.length) return;
  candidates.sort((a, b) => a.rank - b.rank || b.d - a.d);

  room.memory.planCapReclaim = Game.time;
  const take = Math.min(perPass, candidates.length, wanted);
  for (let i = 0; i < take; i++) {
    const c = candidates[i];
    const res = c.s.destroy();
    logAlways(
      `planV2 ${room.name}: at cap (${cap}) — off-plan ${type}@${c.s.pos.x},${c.s.pos.y} ` +
        `(${c.rank === 0 ? "unreachable" : c.rank === 1 ? "on a planned tile" : "surplus"}) ` +
        `destroy() ${res}; ${wanted} planned ${type} tile(s) still unbuilt`,
    );
  }
}

/**
 * Mirror the plan into the memory shapes the legacy bot reads.
 *
 * - basePlan.hub        RampartDefender leash anchor, defence heuristics
 * - basePlan.perimeter  utils/Perimeter getPerimeterTiles ([{x,y}])
 * - basePlan.leash      max(14, farthest shell tile + 2) — a 14 leash is
 *                       too tight to man a big shell
 * - construction.rampartLocations  [[x,y]] of shell tiles NOT yet ramparted
 *                       (RampartErector pops from it; Guard converts to
 *                       RampartDefender once it is empty, i.e. shell done)
 * - keepTheseRoads      ids of BUILT roads on plan road tiles → maintainers
 */
function syncPlanV2Memory(room: Room, plan: PackedPlan, structures: Structure[]): void {
  if (plan.s && Game.time - plan.s < SYNC_EVERY) return;
  plan.s = Game.time;

  const shell = plan.t.shellCut || [];
  const perimeter = shell.map(unpack);
  const packedStorage = plan.t.storage && plan.t.storage.length ? plan.t.storage[0] : undefined;
  const hub = packedStorage === undefined ? null : unpack(packedStorage);

  const bp = room.memory.basePlan || {};
  bp.v2 = true;
  if (hub) bp.hub = hub;
  if (perimeter.length) {
    bp.perimeter = perimeter;
    if (hub) {
      let maxD = 0;
      for (const t of perimeter) {
        const d = Math.max(Math.abs(t.x - hub.x), Math.abs(t.y - hub.y));
        if (d > maxD) maxD = d;
      }
      bp.leash = Math.max(14, maxD + 2);
    }
  }
  room.memory.basePlan = bp;

  const roadTiles: { [packed: number]: boolean } = {};
  for (const p of plan.t.road || []) roadTiles[p] = true;
  const ramparted: { [packed: number]: boolean } = {};
  const keep: string[] = [];
  for (const s of structures) {
    const packed = s.pos.x + s.pos.y * 50;
    if (s.structureType === STRUCTURE_ROAD) {
      if (roadTiles[packed]) keep.push(s.id);
    } else if (s.structureType === STRUCTURE_RAMPART) {
      ramparted[packed] = true;
    }
  }
  room.memory.keepTheseRoads = keep;

  if (!room.memory.construction) room.memory.construction = {};
  if (perimeter.length) {
    const todo: number[][] = [];
    for (const p of shell) {
      if (ramparted[p]) continue;
      const u = unpack(p);
      todo.push([u.x, u.y]);
    }
    room.memory.construction.rampartLocations = todo;
    room.memory.defence = room.memory.defence || {};
    room.memory.defence.perimeter = perimeter;
    room.memory.defence.perimeterCount = perimeter.length;
  }
}

/** Called from rooms.construction (and rooms.ts every 15t) for adopted rooms. */
export function placeFromPlanV2(room: Room): void {
  const plan = room.memory.planV2 as PackedPlan | undefined;
  if (!plan || !room.controller || !room.controller.my) return;
  const lvl = room.controller.level;

  const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
  const structures = room.find(FIND_STRUCTURES);

  // legacy memory mirror first — it must run even when the site budget is
  // full, otherwise a room that is always building never gets a perimeter
  syncPlanV2Memory(room, plan, structures);

  // Defensive road-prefix warning. Sits here, above the site-budget gate, for
  // the same reason the memory mirror does: a room that is always building
  // would otherwise never reach it — and a room whose roads go nowhere is
  // exactly the room that stays busy building them.
  if (lvl === 3 && Game.time % 1000 < 15) {
    const roads = plan.t.road || [];
    auditRoadPrefix(room, plan, roads.slice(0, roadBudget(roads, lvl)));
  }

  let budget = MAX_SITES - sites.length;
  // existing structures + sites by type (containers/roads are unowned)
  const have: { [type: string]: { [packed: number]: boolean } } = {};
  const count: { [type: string]: number } = {};
  const note = (type: string, x: number, y: number) => {
    (have[type] = have[type] || {})[x + y * 50] = true;
    count[type] = (count[type] || 0) + 1;
  };
  for (const s of structures) note(s.structureType, s.pos.x, s.pos.y);
  for (const s of sites) note(s.structureType, s.pos.x, s.pos.y);

  // At-cap reclaim runs BEFORE the site budget gate, deliberately. A starved
  // room cannot finish the sites it already has — E11S2 sat on four sites
  // nothing was building for thousands of ticks — so gating the reclaim on a
  // free site slot means the rooms that need it most are exactly the rooms
  // that never get it. Demolition does not consume a site slot anyway.
  for (const type of Object.keys(CAP_RECLAIM_TYPES)) {
    const planned = plannedTilesFor(plan, type, lvl);
    if (!planned || !planned.length) continue;
    if (!typeAllowedAtRcl(type, lvl)) continue;
    const cap = (CONTROLLER_STRUCTURES as any)[type]
      ? (CONTROLLER_STRUCTURES as any)[type][lvl] || 0
      : planned.length;
    if ((count[type] || 0) < cap) continue;
    reclaimAtCap(room, type, planned, cap, have[type] || {}, plan, structures);
  }

  if (budget <= 0) return;

  const state = { destroyed: false };

  for (const type of PLACE_ORDER) {
    if (budget <= 0) break;
    const planned = plannedTilesFor(plan, type, lvl);
    if (!planned || !planned.length) continue;
    if (!typeAllowedAtRcl(type, lvl)) continue;
    const cap =
      type === "road"
        ? roadBudget(planned, lvl)
        : (CONTROLLER_STRUCTURES as any)[type]
          ? (CONTROLLER_STRUCTURES as any)[type][lvl] || 0
          : planned.length;
    const placedSet = have[type] || {};
    let existing = count[type] || 0;
    if (type === "road") {
      // The road "cap" is the plan's own budget, not a server limit — so it
      // must be measured against PLANNED road tiles only. Counting the
      // room's off-plan roads (legacy remote lines, old stamps) against it
      // silently retires the plan's remaining roads: E11S2 sat at 175/183
      // with 8 stray roads eating the last 8 slots.
      existing = 0;
      for (const p of planned) if (placedSet[p]) existing++;
    }
    // at cap: nothing to place. The reclaim that makes room for the plan's own
    // tiles already ran above, outside the site budget.
    if (existing >= cap) continue;
    for (let i = 0; i < planned.length && existing < cap && budget > 0; i++) {
      // roads are the one type whose array order IS a budget (RCL3 builds
      // the first N only) — and a road is never blocked by our own
      // structures, so the prefix rule costs nothing there. Every other
      // type scans the WHOLE array: stopping at the prefix meant one
      // permanently-occupied tile stalled the type forever (E11S5 never
      // got a tower because a legacy container squatted tower[0]).
      if (type === "road" && i >= cap) break;
      const packed = planned[i];
      if (placedSet[packed]) continue;
      const { x, y } = unpack(packed);
      const res = room.createConstructionSite(x, y, type as BuildableStructureConstant);
      if (res === OK) {
        existing++;
        budget--;
      } else if (res === ERR_INVALID_TARGET) {
        if (!SHARES_TILE[type]) reclaimTile(room, type, x, y, state);
        // A reclaim only frees the tile at the end of THIS tick, so the site
        // has to wait for the next pass — and the next pass needs a free
        // slot for it. Stop here rather than letting the lower-priority
        // types (60 extensions, 180 roads) spend the whole budget: live
        // E11S5 destroyed the extension squatting its storage tile and then
        // sat behind 4 extension sites that nothing was building, so the
        // storage was never retried. Priority order has to survive a stall.
        if (state.destroyed) {
          budget = 0;
          break;
        }
      } else if (res !== ERR_FULL) {
        logAlways(`planV2 ${room.name}: site ${type}@${x},${y} err ${res}`);
      }
    }
  }
}
