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
  // link order: hub link first, controller link second, source links after
  const links = s.link || [];
  const linkOrder =
    links.length > 2 ? [links[0], links[links.length - 1], ...links.slice(1, -1)] : links;
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

/** How many of the plan's roads to build at this RCL (array is priority-ordered). */
function roadBudget(planRoads: number[], lvl: number): number {
  if (lvl < 3) return 0;
  if (lvl === 3) return Math.min(20, planRoads.length);
  return planRoads.length;
}

// Priority order, not build order per se: the first types in this list get
// the 4 site slots whenever they are behind. Storage and the towers sit
// AHEAD of the 60-extension mass — at RCL4 the extensions would otherwise
// eat every site slot for thousands of ticks while the room has no storage
// (the whole logistics layer keys off room.storage). Extensions still fill
// quickly on the 15-tick cadence. Nuker sits after the labs (both RCL8, but
// the labs feed boosts that keep the room alive); the observer is dead last
// — it is the one structure nothing depends on.
// No factory and no power spawn, by design: the planner never emits them.
const PLACE_ORDER = [
  "spawn",
  "storage",
  "tower",
  "container",
  "extension",
  "terminal",
  "link",
  "road",
  "lab",
  "nuker",
  "extractor",
  "rampart",
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

  let budget = MAX_SITES - sites.length;
  if (budget <= 0) return;

  // existing structures + sites by type (containers/roads are unowned)
  const have: { [type: string]: { [packed: number]: boolean } } = {};
  const count: { [type: string]: number } = {};
  const note = (type: string, x: number, y: number) => {
    (have[type] = have[type] || {})[x + y * 50] = true;
    count[type] = (count[type] || 0) + 1;
  };
  for (const s of structures) note(s.structureType, s.pos.x, s.pos.y);
  for (const s of sites) note(s.structureType, s.pos.x, s.pos.y);

  const state = { destroyed: false };

  for (const type of PLACE_ORDER) {
    if (budget <= 0) break;
    const planned = plan.t[type];
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
