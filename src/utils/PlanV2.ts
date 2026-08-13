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
import { isExteriorTile, interiorReady } from "utils/Interior";
import { getPerimeterTiles, SHELL_MIN_RCL } from "utils/Perimeter";

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
  /**
   * Road STAGING: the RCL each `t.road` tile is wanted at, same order, same
   * length (see roadsForRcl). Sits outside `t` on purpose — several loops walk
   * `Object.keys(plan.t)` and read every value as packed tiles, and a stage of
   * 3 would read as the tile 3,0. ~2 bytes per road tile in the Memory blob
   * (median 82 roads, max 123), which is the price of building the arterials
   * four RCLs earlier.
   */
  rs?: number[];
  /**
   * THE SITTER — the one tile the whole hub is built around, packed.
   *
   * `plan.sitter` has been in the pushed payload since the first version and
   * NOTHING in the bot ever read it, which quietly made a large part of the
   * planner unfalsifiable at runtime: layer 1 chooses the hub trio so that ONE
   * tile is range-1 of storage, terminal and the hub link at once, every refill
   * distance the planner optimises and publishes (`fieldFrom(terrain,
   * plan.sitter, ...)`, tower[0]-is-the-easiest-to-refill, the filler tour) is
   * measured from that tile, and the bot parked its fillers at "range 1 of
   * storage" — any of up to eight tiles, only one of which reaches all three.
   * A number nobody can enforce is a number nobody can check.
   *
   * Outside `t` for the same reason `rs` is: several loops walk Object.keys(t)
   * and read every value as a packed tile ARRAY.
   */
  si?: number;
};

const unpack = (p: number) => ({ x: p % 50, y: Math.floor(p / 50) });

/**
 * The plan's sitter as a RoomPosition, or null for a room with no adopted plan
 * (or a payload pushed before `si` existed — the callers all fall back).
 */
export function planSitter(room: Room): RoomPosition | null {
  const plan = room.memory.planV2 as PackedPlan | undefined;
  if (!plan || typeof plan.si !== "number") return null;
  const { x, y } = unpack(plan.si);
  return new RoomPosition(x, y, room.name);
}

/**
 * ---------------------------------------------------------------------------
 * SPAWN FIRST — the rule for a room with no spawn standing.
 *
 * A freshly claimed room is not a base, it is a controller and a promise. Until
 * a spawn is FINISHED the room cannot make a single creep of its own, so every
 * tick of borrowed builder time and every one of the four construction-site
 * slots that goes anywhere else is time the colony spends unable to exist.
 *
 * LIVE PROOF — E15S6 (pacifist2, tick 72220, RCL2, zero spawns):
 *   spawn site   36,24   1135/15000        <- the only thing that mattered
 *   extension    40,23   BUILT             <- plan extension[8], finished first
 *   ext sites    35,22 / 35,24 / 35,26 / 36,27   (none of them on the v2 plan)
 * one ContainerBuilder in the room, picking its target with findClosestByRange.
 *
 * Two independent holes fed that, and both are closed here and in the callers:
 *
 *   1. placeFromPlanV2 skips a type once `existing >= cap`, and `existing`
 *      counts CONSTRUCTION SITES as well as built structures (see the `note()`
 *      loop over `sites`). So on the very tick after the spawn SITE is placed,
 *      spawn reads 1/1 = at cap, the loop falls straight through to
 *      container/extension, and the moment RCL2 unlocks 5 extensions the other
 *      three site slots fill with extensions the room has no spawn to fill and
 *      no reason to own. The spawn site is then just one of four things a
 *      builder might pick.
 *
 *   2. the room reaches RCL2 with no spawn at all, because the colonisation
 *      builder unconditionally upgrades the controller at RCL1
 *      (Roles/buildcontainer) — so hole 1 is not a corner case, it is the
 *      normal path of every new claim.
 *
 * The rule is absolute and cheap: NO SPAWN STANDING -> the only construction
 * site the room may hold is a spawn. Anything else already sited is REMOVED,
 * which costs at most a few hundred ticks of misplaced build progress and buys
 * back both the site budget and every builder's attention.
 *
 * Deliberately keyed on "no spawn STRUCTURE", not on RCL: a room that loses its
 * last spawn at RCL7 is in exactly the same position as a fresh claim.
 * ---------------------------------------------------------------------------
 */
export function spawnFirstLockdown(room: Room): boolean {
  if (!room.controller || !room.controller.my) return false;
  if (room.find(FIND_MY_SPAWNS).length) return false;
  let removed = 0;
  for (const site of room.find(FIND_MY_CONSTRUCTION_SITES)) {
    if (site.structureType === STRUCTURE_SPAWN) continue;
    site.remove();
    removed++;
  }
  if (removed) {
    logAlways(
      `${room.name}: SPAWN FIRST — removed ${removed} non-spawn construction site(s); ` +
        `a room with no spawn standing builds nothing else`,
    );
  }
  return true;
}

/**
 * The tile the plan wants the room's FIRST spawn on, or null if this room has
 * no adopted plan (or a plan with no spawn in it).
 *
 * `unpack` is module-private, so this is the minimum a caller outside this file
 * needs to answer "does the plan already have somewhere to put a spawn?".
 * placeFromPlanV2 sites spawns in array order, so `t.spawn[0]` is the one a
 * spawnless room is waiting on — and the one an off-plan siting would race.
 * See Roles/buildcontainer.
 */
export function plannedSpawnTile(room: Room): { x: number; y: number } | null {
  const plan = room.memory.planV2 as PackedPlan | undefined;
  const spawns = plan && plan.t ? plan.t.spawn : undefined;
  if (!spawns || !spawns.length) return null;
  return unpack(spawns[0]);
}

/**
 * True while a plan for this room has been asked for but not yet read out of
 * the segment (adoptPlan / AutoExpand set Memory.planV2Adopt, and the read
 * takes two ticks — see runPlanV2Adoption). Anything that would place a
 * structure the plan is about to have an opinion on must wait it out.
 */
export function planPending(room: Room): boolean {
  const adopt = Memory.planV2Adopt;
  return !!adopt && adopt.room === room.name;
}

/**
 * ---------------------------------------------------------------------------
 * SANCTIONED RAMPARTS — the only ramparts a repair role may ever nurse.
 *
 * Every repair role used to hunt ramparts with `find(FIND_MY_STRUCTURES,
 * rampart && hits < X)` and nothing else: maintainer (<500k), SpecialRepair
 * (its whole-room fallback and its 3-tile rescan) and builder (<10k on the
 * idle path). In a legacy square-stamp room that was harmless — every rampart
 * in the room WAS the wall.
 *
 * In a plan-v2 / min-cut room it is actively destructive. Those rooms are
 * migrating off an old square stamp, so they carry ramparts the current plan
 * does not want, sitting nowhere near the min-cut shell. Decay is the ONLY
 * mechanism that ever removes them (ramparts are never destroy()ed by
 * migration — they share a tile, so they are not squatters), and the roles
 * were topping them up faster than they decayed. The room paid a permanent
 * energy tax to keep a wall it had already abandoned, and the shell it does
 * want competed for that same energy.
 *
 * The sanctioned set is, in order of authority:
 *   1. the adopted plan — `t.rampart` (every planned rampart, shell + the few
 *      hub/controller bubbles) UNION `t.shellCut` (the min-cut ring). Verified
 *      over the shipped plans: rampart[] is a superset of shell.cut, so the
 *      union is just belt-and-braces against a payload that ever ships a cut
 *      tile with no matching rampart entry.
 *   2. utils/Perimeter getPerimeterTiles — basePlan.perimeter, then legacy
 *      construction.rampartLocations. This is the legacy-room path.
 *
 * null means "this room has no sanctioned set at all" (no plan, no perimeter,
 * nothing) — callers then keep their old repair-anything behaviour, because a
 * room with no notion of a wall must not be left with no wall repair at all.
 *
 * Memoised per tick: three roles ask, once per creep, and the answer cannot
 * change inside a tick.
 * ---------------------------------------------------------------------------
 */
let sancTick = -1;
let sancCache: { [roomName: string]: Set<string> | null } = {};

export function sanctionedRampartKeys(room: Room): Set<string> | null {
  if (sancTick !== Game.time) {
    sancTick = Game.time;
    sancCache = {};
  }
  const cached = sancCache[room.name];
  if (cached !== undefined) return cached;

  const set = new Set<string>();
  const plan = room.memory.planV2 as PackedPlan | undefined;
  if (plan && plan.t) {
    for (const key of ["rampart", "shellCut"]) {
      for (const p of plan.t[key] || []) {
        const u = unpack(p);
        set.add(`${u.x},${u.y}`);
      }
    }
  }
  if (!set.size) {
    for (const t of getPerimeterTiles(room)) set.add(`${t.x},${t.y}`);
  }
  const out = set.size ? set : null;
  sancCache[room.name] = out;
  return out;
}

/** True if this tile is one the room's plan/perimeter actually wants ramparted. */
export function isSanctionedRampart(room: Room, pos: { x: number; y: number }): boolean {
  const set = sanctionedRampartKeys(room);
  if (!set) return true; // no plan and no perimeter — legacy behaviour
  return set.has(`${pos.x},${pos.y}`);
}

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
  // ---------------------------------------------------------------------
  // ASSERT THE CONTAINER CAP, OUT LOUD, ONCE — at adoption, where the room
  // name is in hand and this costs nothing per tick.
  //
  // plannedTilesFor CLAMPS to CONTROLLER_STRUCTURES.container (see
  // containerStageOrder), and clamping is right: the bot cannot build past the
  // cap whatever the plan says. Clamping SILENTLY is not, because the tiles
  // that fall off the end of the staging order are containers the planner
  // emitted, that no build set will ever contain, and that push-plan.mjs will
  // likewise stop promising a road to. It is a PLANNER finding and it should
  // read like one. Dormant on every plan the fleet ships (4 containers against
  // a cap of 5), so this line firing at all means the planner changed.
  // ---------------------------------------------------------------------
  const containerCaps = (CONTROLLER_STRUCTURES as any)[STRUCTURE_CONTAINER];
  const containerCap = containerCaps ? containerCaps[8] || 0 : 0;
  if (containerCap && t.container.length > containerCap) {
    logAlways(
      `planV2: ${data.room} plan carries ${t.container.length} containers but CONTROLLER_STRUCTURES ` +
        `caps a room at ${containerCap} — the last ${t.container.length - containerCap} in staging ` +
        `order (mineral seat last) are dropped from every build and audit set. The bot cannot build ` +
        `them: re-plan the room.`,
    );
  }
  const out: PackedPlan = { v: 1, h: data.planHash, t };
  // Road staging (push-plan.mjs `roadStage`). Length-checked against t.road
  // here as well as at every read: a payload whose stage array does not line up
  // with the road array is not a schedule, it is an off-by-one, and the room is
  // better off on the legacy "first 20 at RCL3" rule than on a scrambled one.
  const rs = data.roadStage;
  if (rs && rs.length === t.road.length) out.rs = rs.slice();
  // the refill anchor — see PackedPlan.si
  const si = data.sitter;
  if (si && typeof si.x === "number" && typeof si.y === "number") out.si = si.x + si.y * 50;
  return out;
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
 * Which of the plan's roads to build at this RCL, in the plan's own order.
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
 * side only documents the contract and, at RCL3 where the selection is the
 * whole point, cheaply NOTICES if it is broken (see auditRoadPrefix).
 *
 * ---------------------------------------------------------------------------
 * "FIRST 20, THEN EVERYTHING" WAS A SECOND, WORSE SCHEDULE.
 *
 * BFS order is a distance order, not an importance order. A prefix of it is
 * "the 20 tiles nearest the hub", which is mostly hub filler — while the
 * arterials, the hub->source and hub->controller lines the haulers walk from
 * the tick the room hits RCL3, sit at indices 40..80 and were not built until
 * RCL4 (and then behind the whole min-cut shell, because rampart sits ahead of
 * road in PLACE_ORDER — see the comment there).
 *
 * The planner has always known which pass laid which road tile
 * (`plan.meta.roadLayer`: 1 = the eco kit, 3 = tower spurs, 4 = lab access,
 * 5 = the mineral run, 6 = extension corridors, 7 = rampart spurs) and the
 * payload threw it away. push-plan.mjs now folds that provenance into an RCL
 * per road tile and ships it as `roadStage`, a parallel int array in the same
 * order as `structures.road`; packPlanPayload keeps it as `plan.rs`. The size of
 * that set, per room and fleet-wide, is printed by `push-plan.mjs --census` on
 * its ARTERIAL SIZE line — quoting it here was tried for two rounds and one of
 * the four numbers was wrong every time, because a figure in a comment has
 * nothing that can re-derive it. The old prefix bought 20 tiles of whatever was
 * nearest.
 *
 * SELECTION, NOT RE-SORT. The staged tiles are taken in the array's existing
 * BFS order, so what the room builds is still a connected network reachable
 * from the sitter and auditRoadPrefix stays quiet. (A layer<=3 filter of the
 * RAW provenance is NOT connected — 65 of 172 rooms break, because layer 1
 * lines run through tiles a later layer laid: E11S1's eco line to its far
 * source is bridged at 33,41 and 36,41 by layer-6 corridor tiles. push-plan
 * repairs that offline by demoting the bridge tiles into the arterial set and
 * verifies the result before it ships.)
 *
 * ---------------------------------------------------------------------------
 * WHAT "ARTERIAL" IS ACTUALLY A PROMISE OF — read this before believing the
 * phrase "the roads a hauler actually walks" anywhere in this file, because
 * that phrase was written as a description of the intent and was for a while
 * measurably false.
 *
 * CONNECTED IS NOT THE SAME AS USEFUL. The provenance split plus the bridge
 * repair gives a network the sitter can walk, which is what auditRoadPrefix
 * checks — and a network can be perfectly connected while stopping two tiles
 * short of the container it was laid for. Re-derived over the 172-room
 * snapshot, the RCL3 set failed to reach an eco terminal in 8 rooms: source
 * containers E14S5 42,39 (3 tiles short), E18S4 27,20 (2), E3S5 16,15 (2),
 * E17S5 44,35 (2), E21S9 5,32 (1), and controller containers E15S4 13,14 (1),
 * E16S6 16,19 (1), E8S6 15,25 (1). Small gaps at the END of a 30-tile line the
 * room paid for in full, on the exact tile a hauler stands on every cycle.
 *
 * Worse for the containers specifically: the only face-road guarantee was for
 * `extension[0..9]`, and containers are built a whole RCL EARLIER than those
 * extensions (RCL2 vs RCL3). 29 RCL2 containers across 27 rooms had a planned
 * road on a D4 face and that road staged RCL4 — E16S6's controller container
 * 16,19 finished at RCL2 with its serving tile 16,20 two whole RCLs away.
 *
 * push-plan.mjs roadStageFor now guarantees, in this order:
 *   · every layer<=3 tile (eco kit + tower spurs);
 *   · one D4 face road per `extension[0..9]`;
 *   · one D4 face road per container built at RCL2 (the two source containers
 *     and the controller container — plannedTilesFor defers the mineral one to
 *     RCL6, so it is neither built at RCL2 nor guaranteed here);
 *   · a connected chain from the hub to each of those same containers;
 *   · bridge repair over all of the above, so the result stays a network.
 *
 * Cost of the last two: 49 road tiles moved into RCL3 across 32 of 172 rooms,
 * max 4 in a room. Two caveats it is worth being straight about. (a) A road
 * cannot be staged with the container it serves, because typeAllowedAtRcl gates
 * road at lvl >= 3 — the guarantee is "at the first RCL a road may exist", so
 * RCL2 is still walked on bare ground. (b) The guarantee only ever RE-STAGES
 * roads the planner already placed; it never invents one. 218 RCL2 containers
 * in 143 rooms have no planned D4 road face at all and get nothing here — that
 * is a planner question, not a staging one. (The figure was published as 220/145
 * for two rounds; re-derived twice against the shipped artifact with this file's
 * own rcl2Containers() definition — the source seats plus the controller
 * container, the mineral one deferred to RCL6 — it is 218 across 143, and no
 * alternative reading of "RCL2 container" yields 220/145.)
 * ---------------------------------------------------------------------------
 *
 * `plan.rs` is indexed off `plan.t.road` itself, so any caller that hands us a
 * REORDERED or SHORTENED road array (plannedTilesFor can drop an element — the
 * mineral-container case) must not be allowed to read the stages off by one:
 * the length check below treats the array as unstaged and lets the RCL3
 * geometry filter pick the haul chains instead of trusting a scrambled
 * parallel array.
 * ---------------------------------------------------------------------------
 * RCL3 IS THE ECO+TOWER SUBSET OF THAT ARTERIAL, NOT THE WHOLE SET.
 *
 * roadStage still marks extension[0..9] faces, later-tower spurs and leftover
 * hub filler as stage 3. Those tiles do not pay during the 135k RCL3 climb, and
 * the builder then closest-sites them. PackedPlan does not ship roadLayer, so
 * this side cannot read "eco" off a tag. It reconstructs the haul from tiles
 * the plan already has: BFS over the stage<=3 road graph (the full array if
 * unstaged) from the sitter to each RCL2 container and to the first tower,
 * plus every arterial D8 of those containers. Every kept tile is already in
 * the RCL4 set. RCL2 stays empty. No slice(0, N).
 * ---------------------------------------------------------------------------
 */
function rcl3EcoAndTowerRoads(plan: PackedPlan, arterial: number[]): number[] {
  if (!arterial.length) return arterial;
  const roadSet: { [p: number]: boolean } = {};
  for (const p of arterial) roadSet[p] = true;

  const keep: { [p: number]: boolean } = {};
  const terminals = plannedTilesFor(plan, STRUCTURE_CONTAINER, 3);

  const markD8 = (packed: number) => {
    const { x, y } = unpack(packed);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
        const np = nx + ny * 50;
        if (roadSet[np]) keep[np] = true;
      }
    }
  };
  for (const c of terminals) markD8(c);

  const seed =
    plan.si !== undefined
      ? plan.si
      : plan.t.storage && plan.t.storage.length
        ? plan.t.storage[0]
        : undefined;
  if (seed === undefined) {
    if (plan.t.tower && plan.t.tower.length) markD8(plan.t.tower[0]);
    const faces: number[] = [];
    for (const p of arterial) if (keep[p]) faces.push(p);
    return faces;
  }

  const conduct: { [p: number]: boolean } = { [seed]: true };
  for (const p of arterial) conduct[p] = true;
  for (const p of terminals) conduct[p] = true;

  const parent: { [p: number]: number } = {};
  const dist: { [p: number]: number } = { [seed]: 0 };
  const seen: { [p: number]: boolean } = { [seed]: true };
  const queue: number[] = [seed];
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    const { x, y } = unpack(cur);
    const cd = dist[cur];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
        const np = nx + ny * 50;
        if (seen[np] || !conduct[np]) continue;
        seen[np] = true;
        parent[np] = cur;
        dist[np] = cd + 1;
        queue.push(np);
      }
    }
  }

  const markChain = (from: number) => {
    let cur: number | undefined = from;
    while (cur !== undefined && cur !== seed) {
      if (roadSet[cur]) keep[cur] = true;
      cur = parent[cur];
    }
    if (roadSet[seed]) keep[seed] = true;
  };

  for (const c of terminals) {
    if (!seen[c]) continue;
    // parent, not the container tile: a road under the seat is not a haul tile
    if (parent[c] !== undefined) markChain(parent[c]);
  }

  const towers = plan.t.tower;
  if (towers && towers.length) {
    const { x, y } = unpack(towers[0]);
    let best: number | undefined;
    let bestD = 1e9;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
        const np = nx + ny * 50;
        if (!seen[np] || !roadSet[np]) continue;
        if (dist[np] < bestD) {
          bestD = dist[np];
          best = np;
        }
      }
    }
    if (best !== undefined) markChain(best);
  }

  const out: number[] = [];
  for (const p of arterial) if (keep[p]) out.push(p);
  return out;
}

function roadsForRcl(plan: PackedPlan, planRoads: number[], lvl: number): number[] {
  if (lvl < 3) return [];
  const stage = plan.rs;
  const arterial: number[] = [];
  if (!stage || stage.length !== planRoads.length) {
    if (lvl > 3) return planRoads;
    for (let i = 0; i < planRoads.length; i++) arterial.push(planRoads[i]);
  } else {
    for (let i = 0; i < planRoads.length; i++) if (stage[i] <= lvl) arterial.push(planRoads[i]);
    if (lvl !== 3) return arterial;
  }
  return rcl3EcoAndTowerRoads(plan, arterial);
}

/**
 * DEFENSIVE, LOG-ONLY. Never places, skips or reorders anything.
 *
 * If a re-pushed plan ever regresses to generation-ordered roads, the symptom
 * is silent and expensive: the room spends its entire RCL3 road allowance on
 * tiles nothing can walk to, and nobody notices until someone re-derives it
 * offline (which is exactly how M4 was found). One log line makes it visible.
 *
 * Only runs at RCL3 and only over the eco+tower selection, because that is
 * the ONLY level where the set is a prioritisation decision — from RCL4 the
 * budget is the whole array, so there is no prefix to get wrong. Bounded at
 * one 8-way BFS over that selection, throttled to roughly one pass per 1000
 * ticks. Deliberately NOT PathFinder: this must never be a per-tick cost on
 * shard3, and an approximate answer is enough for a warning.
 *
 * WHAT CONDUCTS: WHAT A CREEP CAN STAND ON.
 *
 * This used to add `storage` and `spawn` to the conducting set, on the grounds
 * that it was "the generous reading ... so we only ever warn on a real break".
 * Both of those are in the engine's OBSTACLE_OBJECT_TYPES: a creep has never
 * been able to stand on a spawn or a storage, so a prefix that is "connected"
 * only by crossing one is not connected, and the warning this function exists
 * to raise was being suppressed by the very tiles a hauler has to walk around.
 * Off-line re-derivation over walkable conductors found 57 stage-3 road tiles
 * across 18 rooms behind such a gap, one of them an eco terminal (E7S4's source
 * container 37,12, with the spawn at 31,17 in the way). The planner-side pass
 * that stages the arterial has been corrected the same way, in lockstep, so this
 * audit and the thing it audits still agree about what a road network is.
 *
 * Containers still conduct — a container is not an obstacle. The seed is the
 * SITTER, which is the hub tile a creep actually occupies.
 *
 * ...AND ONLY THE CONTAINERS THAT EXIST AT `lvl`. That correction fixed WHICH
 * TYPES conduct and left WHEN alone: the set was still built from the raw
 * `plan.t.container` array while this function is auditing a specific RCL, and
 * plannedTilesFor a few lines down does not let the room build the mineral
 * container until RCL6. So this audit walked over a structure the room has not
 * been allowed to place for another three levels — and it did so in lockstep
 * with push-plan.mjs's roadStageFor, which built its bridge graph the same way.
 *
 * WHICH IS THE REAL LESSON HERE, AND IT IS THE SECOND TIME: AN AUDIT THAT
 * SHARES ITS GRAPH WITH THE THING IT AUDITS REPORTS ZERO BY CONSTRUCTION. It is
 * not checking the pass, it is re-running it and agreeing with itself. Both the
 * spawn/storage bug above and this one shipped behind a green "0 orphans" that
 * was produced by the same wrong graph that caused the orphans. The two sides
 * still have to agree about what a road network IS (they model the same game),
 * but they must agree by both being right, not by sharing a mistake — which is
 * why the RCL rule now lives in exactly one function per side
 * (conductorsForRcl here, containersForRcl there) and nothing else is allowed
 * to touch `plan.t.container` when it means "what a creep can stand on".
 *
 * On the shipped fleet the honest graph finds E5S1: containers 7,9 / 30,13 /
 * 28,33 / 29,30 with the extractor at 30,31, so 29,30 is the deferred mineral
 * one — and at RCL3 the eco terminal 28,33 is only reachable by standing on it,
 * leaving the staged roads 28,31 / 28,32 / 29,34 hanging off nothing.
 */
function auditRoadPrefix(room: Room, plan: PackedPlan, prefix: number[], lvl: number): void {
  if (!prefix.length) return;
  const conduct: { [packed: number]: boolean } = {};
  for (const p of prefix) conduct[p] = true;
  for (const p of conductorsForRcl(plan, lvl)) conduct[p] = true;
  // seed from the tile the creep stands on, not the one it withdraws from
  const seed =
    plan.si !== undefined
      ? plan.si
      : plan.t.storage && plan.t.storage.length
        ? plan.t.storage[0]
        : undefined;
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
      `planV2 ${room.name}: ${orphans}/${prefix.length} RCL${lvl} road tiles are not connected to ` +
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

/**
 * ---------------------------------------------------------------------------
 * THE CONTAINER STAGING ORDER — ONE FIXED ORDER, AND EVERY RCL TAKES A PREFIX
 * OF IT.
 *
 * WHY THE SHAPE MATTERS MORE THAN THE OUTPUT. A build schedule has exactly one
 * invariant that is not negotiable: MONOTONICITY. A structure the room builds
 * at RCL n must still be in the set at RCL n+1, because there is no such thing
 * as un-building — and in this file that is not a figure of speech. A planned
 * tile that falls out of the set stops being a `planTile` in migrateClass, so
 * `rankOffPlan` reads the finished structure standing on it as a squatter, and
 * container is in FREE_REPLACE: a rich room DESTROYS it.
 *
 * The previous form dropped the deferred seat below RCL6 and then let each
 * CALLER take its own `Math.min(cap, planned.length)` prefix — an independent
 * per-level prefix of a list whose CONTENTS change at RCL6. That is monotone on
 * the current fleet by arithmetic accident and nothing else: every room plans 4
 * containers against a cap of 5, so the cap never binds and the two branches
 * differ by exactly the deferred tile. Give it SIX planned containers with the
 * mineral seat at index 3 and it breaks — RCL5 drops index 3 and the caller
 * keeps five of the remaining five, {0,1,2,4,5}; RCL6 defers nothing and the
 * caller keeps the first five, {0,1,2,3,4}. Container 5 was built at RCL5, is
 * off-plan at RCL6, and the next rich migrate pass tears it down to make room
 * for a mineral container the room did not need three levels earlier. The
 * invariant held because of a count in the artifact, not because of anything in
 * the code, and a count in the artifact is exactly what a planner change moves.
 *
 * So the schedule is made monotone STRUCTURALLY instead, in ONE place. Each
 * container is placed exactly once in a single fixed order — everything that
 * exists from RCL2 first, in plan order, and the extractor-deferred mineral
 * seat LAST — and `plannedTilesFor` then hands every level a PREFIX of that one
 * order whose length is non-decreasing: one source seat at RCL2, `early` from
 * RCL3 through RCL5, the whole order from RCL6 (clamped by a CONTROLLER_STRUCTURES
 * cap that is itself non-decreasing). Nested prefixes cannot un-build. That is
 * the whole proof, and it does not depend on how many containers a plan carries.
 *
 * The cap moves INTO plannedTilesFor for the same reason: with the cap applied
 * to the staging order, every caller's own `Math.min(cap, planned.length)` is a
 * provable no-op, so no caller can re-introduce an independent prefix.
 *
 * This is the bot-side twin of push-plan.mjs `containerStageOrder`, down to the
 * tie rule — the LAST extractor-adjacent container is the mineral one, because
 * E8S3's controller at 21,29 sits 3 tiles from its mineral at 23,26 and its
 * genuine CONTROLLER container at 24,26 is therefore also mineral-adjacent.
 * Taking the last match keeps that room's controller container in the early set
 * where it belongs.
 *
 * Order is plan order on every plan the fleet ships (n = 4, mineral last, in
 * 172/172 rooms). The prefix is 1 at RCL2 (first source seat), n-1 from RCL3
 * through RCL5, and all n from RCL6. Plan order is preserved in the result
 * too, because the prefix only decides WHICH tiles are in the set (that is
 * where monotonicity lives) and the array is rebuilt by index.
 * ---------------------------------------------------------------------------
 */
function containerStageOrder(plan: PackedPlan): { order: number[]; early: number } {
  const planned = plan.t[STRUCTURE_CONTAINER] || [];
  const extractors = plan.t.extractor;
  let deferred = -1;
  if (extractors && extractors.length) {
    for (let i = 0; i < planned.length; i++) {
      const c = unpack(planned[i]);
      for (const e of extractors) {
        const u = unpack(e);
        if (Math.abs(c.x - u.x) <= 1 && Math.abs(c.y - u.y) <= 1) {
          deferred = i; // keep scanning: the LAST match is the mineral one (see above)
          break;
        }
      }
    }
  }
  const order: number[] = [];
  for (let i = 0; i < planned.length; i++) if (i !== deferred) order.push(i);
  if (deferred >= 0) order.push(deferred);
  // how many of that order exist BEFORE the extractor does — the prefix length
  // RCL3..RCL5 takes (RCL2 takes one of this prefix; see plannedTilesFor).
  // From EXTRACTOR_RCL the prefix is the whole order.
  return { order: order, early: deferred >= 0 ? order.length - 1 : order.length };
}

function plannedTilesFor(plan: PackedPlan, type: string, lvl: number): number[] {
  const planned = plan.t[type] || [];
  if (type !== STRUCTURE_CONTAINER || !planned.length) return planned;
  const staged = containerStageOrder(plan);
  const caps = (CONTROLLER_STRUCTURES as any)[type];
  const cap = caps ? caps[lvl] || 0 : planned.length;
  // RCL2: first source container only (plan-order prefix of the early set).
  // Second source + controller stay on the same order at RCL3; mineral at RCL6.
  // Nested prefixes: 1 ⊂ early ⊂ all. Never reorder — migrate is FREE_REPLACE.
  const beforeExtractor = lvl < 3 ? Math.min(1, staged.early) : staged.early;
  const take = Math.min(cap, lvl >= EXTRACTOR_RCL ? staged.order.length : beforeExtractor);
  // the whole order — return the plan's own array, unallocated and unchanged
  if (take >= planned.length) return planned;
  if (take <= 0) return [];
  const keep: { [i: number]: boolean } = {};
  for (let i = 0; i < take; i++) keep[staged.order[i]] = true;
  const out: number[] = [];
  for (let i = 0; i < planned.length; i++) if (keep[i]) out.push(planned[i]);
  return out;
}

/**
 * ---------------------------------------------------------------------------
 * WHAT A CREEP CAN STAND ON AT `lvl`, AND THAT THE ROOM HAS ACTUALLY BUILT.
 *
 * The single definition of the conducting set for every connectivity question
 * asked on this side. It exists because there used to be no definition at all —
 * callers wrote `for (const p of plan.t.container || [])` inline and thereby
 * asserted two things they had not checked: that container is the only walkable
 * planned structure (true, and worth stating), and that every planned container
 * exists at every RCL (false — plannedTilesFor above defers all but the first
 * source seat below RCL3 and the mineral one to RCL6, and typeAllowedAtRcl
 * allows none at all below RCL2).
 *
 * The rules are composed rather than restated, so a new deferral in
 * plannedTilesFor or a new gate in typeAllowedAtRcl is picked up here for free.
 * That matters more than it looks: the last two connectivity bugs in this file
 * were both "someone added a rule in one place and a graph somewhere else did
 * not hear about it".
 *
 * CONTAINER IS THE WHOLE LIST, and that is a reading of the engine rather than
 * an omission. Everything else a plan contains is either a road (handled by the
 * caller, which knows its own RCL road set) or a member of
 * OBSTACLE_OBJECT_TYPES: spawn, extension, storage, tower, link, terminal, lab,
 * nuker, observer, constructedWall. Rampart and extractor are technically
 * walkable and are still NOT here — adding a conductor can only ever make these
 * audits quieter, and quiet is exactly the failure mode being fixed. If one is
 * ever added it goes in this array, gets its typeAllowedAtRcl gate for free,
 * and every audit changes together.
 * ---------------------------------------------------------------------------
 */
const CONDUCTOR_TYPES = [STRUCTURE_CONTAINER as string];

function conductorsForRcl(plan: PackedPlan, lvl: number): number[] {
  const out: number[] = [];
  for (const type of CONDUCTOR_TYPES) {
    if (!typeAllowedAtRcl(type, lvl)) continue;
    const planned = plannedTilesFor(plan, type, lvl);
    if (!planned.length) continue;
    // A PROVABLE NO-OP FOR CONTAINER, AND KEPT ANYWAY. plannedTilesFor already
    // applies this exact cap to the staging order, so `limit` is planned.length
    // for the only type in CONDUCTOR_TYPES today. It stays because a type added
    // to that array tomorrow arrives as a RAW plan-order array with no cap on
    // it — and if one ever does, note that a raw prefix is only monotone while
    // the array's CONTENTS do not change with the level. Anything that defers a
    // tile needs its own staging order (see containerStageOrder); taking an
    // independent per-level prefix of a shifting list is precisely the bug that
    // put this comment here.
    const caps = (CONTROLLER_STRUCTURES as any)[type];
    const cap = caps ? caps[lvl] || 0 : planned.length;
    const limit = Math.min(cap, planned.length);
    for (let i = 0; i < limit; i++) out.push(planned[i]);
  }
  return out;
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
// RCL3 builds the eco+tower subset of the arterial — hub→source and
// hub→controller chains, D8 of those containers, and the first tower's spur
// (see roadsForRcl). Extension faces, later-tower spurs and leftover hub
// filler wait with the rest of the road array. From RCL4 the shell goes up
// before those remaining roads. That is the right trade in both directions:
// the haul lines pay per tick during the 135k climb, while the tiles the
// shell delays are extension corridors, lab access, the mineral run and the
// rampart spurs, which buy a few ticks of hauler fatigue against a shell that
// is the difference between being raided and not. Nothing is lost, just
// later, and the 15-tick placement cadence chews through them steadily once
// the shell is sited.
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

/**
 * ---------------------------------------------------------------------------
 * RCL2 BUILDS EXTENSIONS BEFORE IT BUILDS REMOTE CONTAINERS.
 *
 * `container` sits ahead of `extension` in PLACE_ORDER and containers unlock at
 * RCL2, so a fresh room used to spend its ENTIRE four-site budget on the three
 * eco containers (two source, one controller) before siting a single extension.
 * plannedTilesFor now only hands RCL2 the first source seat, but even that one
 * is up to 27 walk from the hub over ground with no road on it (roads are RCL3).
 * The five extensions are +250 capacity on the tick they finish and sit next
 * to the hub where the same builder is already standing. So RCL2 — and only
 * RCL2 — still sites extensions first. From RCL3 leftover containers (second
 * source + controller) go down before leftover extensions and roads.
 *
 * Everything else about PLACE_ORDER is unchanged, including "spawn" opening it.
 * ---------------------------------------------------------------------------
 */
const RCL2_ORDER = PLACE_ORDER.slice();
RCL2_ORDER.splice(RCL2_ORDER.indexOf("extension"), 1);
RCL2_ORDER.splice(RCL2_ORDER.indexOf("container"), 0, "extension");

function placeOrderFor(lvl: number): string[] {
  return lvl === 2 ? RCL2_ORDER : PLACE_ORDER;
}

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
  // A spawn standing on a planned tile is NOT an error and must not be logged
  // as one. Below RCL7 it is the room's only spawn and it stays, full stop;
  // from RCL7 the migration protocol below owns it and speaks for itself.
  // This used to print "needs owner attention" every 100 ticks, forever, in
  // every hybrid room — the exact "error spam" the protocol is meant to end.
  if (squatter.structureType === STRUCTURE_SPAWN) return;
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
 * MIGRATION — how a hybrid room converges on the plan without ever losing the
 * ability to spawn.
 *
 * THE ORIGINAL PROBLEM (off-plan extensions were immortal)
 * -------------------------------------------------------
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
 * no walkable approach at all) which parks the room's whole fill layer on a
 * dead target.
 *
 * THE PROTOCOL
 * ------------
 * Every class converges at its own pace, and every class is gated on the room
 * being able to PAY for the replacement, because the failure mode of getting
 * this wrong is a room that cannot spawn:
 *
 *   extension / container / road   free replacement, 3 per pass, 60 ticks
 *                                  apart, once storage energy > 20k. Below
 *                                  that (or with no storage at all) only the
 *                                  two actively HARMFUL kinds of squatter are
 *                                  touched — unreachable ones and ones sitting
 *                                  on a planned tile — and only under cap
 *                                  pressure. Roads outside the shell are never
 *                                  touched: those are the remote lines.
 *
 *   tower                          ONE at a time, N-1 always live. Below cap
 *                                  nothing is destroyed at all — the placement
 *                                  loop builds the plan's tower first and the
 *                                  room is briefly N+1. At cap exactly one
 *                                  off-plan tower is retired per pass, and
 *                                  never the last one.
 *
 *   storage / terminal             build-new-then-drain from RCL6 "where caps
 *                                  permit" — and they never do:
 *                                  CONTROLLER_STRUCTURES caps both at 1 at
 *                                  every level, so the replacement cannot be
 *                                  built before the original comes down and
 *                                  destroy() would spill the contents. So the
 *                                  room DEFERS and says so, once. The
 *                                  build-drain-retire path below is written
 *                                  out anyway for the day a cap allows two.
 *
 *   spawn                          see migrateSpawns. ABSOLUTE: a room's only
 *                                  spawn is never destroyed.
 *
 * And nothing migrates at all while room.memory.danger is set. Migration is a
 * tidy-up; spawning defenders is not, and every action here temporarily costs
 * the room either energy capacity or a tower.
 *
 * Bounded by construction: on-plan structures are never candidates, so the
 * off-plan count strictly decreases and the process terminates.
 *
 * Ranking, worst squatter first:
 *   1. unreachable — dead weight AND the thing sealing a pocket shut
 *   2. sitting on a tile the plan wants for SOMETHING (any type)
 *   3. everything else, farthest from the hub first, so the base compacts
 * ---------------------------------------------------------------------------
 */

/** storage energy a room must hold before it may demolish something it will
 *  then have to pay to rebuild */
const MIGRATE_ENERGY = 20000;
/** ticks between passes, PER CLASS — build time for what the last pass freed */
const MIGRATE_EVERY = 60;
/** how many off-plan structures one pass of a class may retire */
const MIGRATE_PER_PASS: { [k: string]: number } = {
  [STRUCTURE_EXTENSION]: 3,
  [STRUCTURE_CONTAINER]: 3,
  [STRUCTURE_ROAD]: 3,
  [STRUCTURE_TOWER]: 1,
};
/** cheap + rebuildable: replaced freely once the room can pay for it */
const FREE_REPLACE: { [k: string]: boolean } = {
  [STRUCTURE_EXTENSION]: true,
  [STRUCTURE_CONTAINER]: true,
  [STRUCTURE_ROAD]: true,
};
const MIGRATE_CLASSES: string[] = [
  STRUCTURE_EXTENSION,
  STRUCTURE_CONTAINER,
  STRUCTURE_TOWER,
  STRUCTURE_ROAD,
];
/** storage/terminal migration is a hub rebuild — not before the hub exists */
const HUB_MIGRATE_RCL = 6;

function migrationEnergy(room: Room): number {
  return room.storage ? room.storage.store[RESOURCE_ENERGY] || 0 : 0;
}

/**
 * "Log each migration action once." Destroys log as they happen (that IS once
 * per action). Deferrals are a standing state, so they would otherwise repeat
 * every 60 ticks forever — which is exactly the error spam the spawn rule is
 * meant to end. One line per room per condition, then silence.
 */
function noteOnce(room: Room, key: string, msg: string): void {
  const log = room.memory.planMigrateLog || (room.memory.planMigrateLog = {});
  if (log[key]) return;
  log[key] = Game.time;
  logAlways(msg);
}

function migrateTimerDue(room: Room, cls: string): boolean {
  const t = room.memory.planMigrate || (room.memory.planMigrate = {});
  return Game.time - (t[cls] || 0) >= MIGRATE_EVERY;
}

function migrateTimerStamp(room: Room, cls: string): void {
  const t = room.memory.planMigrate || (room.memory.planMigrate = {});
  t[cls] = Game.time;
}

type Candidate = { s: Structure; rank: number; d: number };

function rankOffPlan(
  room: Room,
  type: string,
  planTile: { [p: number]: boolean },
  plan: PackedPlan,
  structures: Structure[],
): { built: number; onPlan: number; off: Candidate[] } {
  // any tile the plan wants for any type — an off-plan extension standing on
  // the storage tile is a worse squatter than one standing on open ground
  const anyPlanTile: { [packed: number]: boolean } = {};
  for (const k of Object.keys(plan.t)) {
    if (k === "shellCut" || k === "labInput" || k === "road" || k === "rampart") continue;
    for (const p of plan.t[k]) anyPlanTile[p] = true;
  }
  const hubPacked = plan.t.storage && plan.t.storage.length ? plan.t.storage[0] : undefined;
  const hub = hubPacked === undefined ? null : unpack(hubPacked);

  let built = 0;
  let onPlan = 0;
  const off: Candidate[] = [];
  for (const s of structures) {
    if (s.structureType !== type) continue;
    built++;
    const packed = s.pos.x + s.pos.y * 50;
    if (planTile[packed]) {
      onPlan++;
      continue; // on-plan — never touched
    }
    let rank = 2;
    if (isUnreachableTile(room, s.pos.x, s.pos.y)) rank = 0;
    else if (anyPlanTile[packed]) rank = 1;
    const d = hub ? Math.max(Math.abs(s.pos.x - hub.x), Math.abs(s.pos.y - hub.y)) : 0;
    off.push({ s: s, rank: rank, d: d });
  }
  off.sort((a, b) => a.rank - b.rank || b.d - a.d);
  return { built: built, onPlan: onPlan, off: off };
}

function migrateClass(
  room: Room,
  plan: PackedPlan,
  lvl: number,
  type: string,
  structures: Structure[],
  have: { [type: string]: { [packed: number]: boolean } },
): void {
  const perPass = MIGRATE_PER_PASS[type];
  if (!perPass) return;
  if (!typeAllowedAtRcl(type, lvl)) return;
  const planned = plannedTilesFor(plan, type, lvl);
  if (!planned || !planned.length) return;
  if (!migrateTimerDue(room, type)) return;

  const isRoad = type === STRUCTURE_ROAD;
  const cap = isRoad
    ? planned.length
    : (CONTROLLER_STRUCTURES as any)[type]
      ? (CONTROLLER_STRUCTURES as any)[type][lvl] || 0
      : planned.length;
  if (!cap) return;

  // Only the first `cap` planned tiles can ever exist, so only those count as
  // a "want". Roads are the exception: the whole array is planned and the RCL
  // budget only says which prefix gets built FIRST, so a road at index 90 is
  // on-plan and must never be read as a squatter.
  //
  // THIS IS WHERE A NON-MONOTONE SCHEDULE TURNS INTO A DEMOLITION: a planned
  // tile that drops out of `planTile` between two RCLs makes rankOffPlan read
  // the finished structure standing on it as a squatter, and container is in
  // FREE_REPLACE. `cap` is applied here to a list plannedTilesFor has ALREADY
  // staged and capped for containers (see containerStageOrder), so for that
  // type this min() is a no-op and the set can only grow with the level.
  const limit = isRoad ? planned.length : Math.min(cap, planned.length);
  const planTile: { [p: number]: boolean } = {};
  for (let i = 0; i < limit; i++) planTile[planned[i]] = true;

  const placed = have[type] || {};
  const wantLimit = Math.min(cap, planned.length);
  let wanted = 0;
  for (let i = 0; i < wantLimit; i++) if (!placed[planned[i]]) wanted++;

  const ranked = rankOffPlan(room, type, planTile, plan, structures);
  if (!ranked.off.length) return;

  const rich = migrationEnergy(room) > MIGRATE_ENERGY;
  let candidates = ranked.off;
  let reason = "";

  if (type === STRUCTURE_TOWER) {
    if (!rich) return;
    // below cap we destroy NOTHING — the placement loop builds the plan's
    // tower first, which is the "new one up before the old one goes" the
    // owner asked for. At cap the only way forward is to free one slot.
    if (ranked.built < cap) return;
    if (ranked.built < 2) {
      noteOnce(
        room,
        "tower:solo",
        `planV2 ${room.name}: off-plan tower@${ranked.off[0].s.pos.x},${ranked.off[0].s.pos.y} kept — ` +
          `it is the room's only tower, so N-1 would be zero. It migrates once the RCL allows a second.`,
      );
      return;
    }
    if (!wanted) return;
    candidates = ranked.off.slice(0, 1);
    reason = "tower swap, N-1 stays live";
  } else if (FREE_REPLACE[type] && rich) {
    if (isRoad) {
      // Off-plan roads OUTSIDE the shell are the remote/approach lines, not
      // legacy stamp litter. Retiring those would unpave every hauler route
      // the room owns, so the plan only claims responsibility for the roads
      // it actually encloses.
      candidates = interiorReady(room)
        ? ranked.off.filter((c) => !isExteriorTile(room, c.s.pos.x, c.s.pos.y))
        : [];
      if (!candidates.length) return;
    }
    reason = `free replace, storage > ${MIGRATE_ENERGY}`;
  } else {
    // Poor room, or no storage at all. Still clear the two kinds of off-plan
    // structure that are actively HARMFUL rather than merely surplus — an
    // unreachable extension is a permanent dead fill target, and a squatter on
    // a planned tile is what stalls the whole type — but only under cap
    // pressure, never just to tidy up. This is the pre-existing behaviour that
    // unwedged E9S2/E11S2/E14S9 and it must survive the new energy gate.
    if (ranked.built < cap) return;
    if (!wanted) return;
    candidates = ranked.off.filter((c) => c.rank <= 1);
    if (!candidates.length) return;
    reason = "at cap, storage below the gate — harmful squatters only";
  }

  let take = Math.min(perPass, candidates.length);
  if (wanted > 0) take = Math.min(take, wanted);
  if (take <= 0) return;

  migrateTimerStamp(room, type);
  for (let i = 0; i < take; i++) {
    const c = candidates[i];
    const res = c.s.destroy();
    logAlways(
      `planV2 ${room.name}: migrate ${type}@${c.s.pos.x},${c.s.pos.y} ` +
        `(${c.rank === 0 ? "unreachable" : c.rank === 1 ? "on a planned tile" : "surplus"}; ${reason}) ` +
        `destroy() ${res}; built ${ranked.built}/${cap}, on-plan ${ranked.onPlan}, ` +
        `${wanted} planned ${type} tile(s) still unbuilt`,
    );
  }
}

/**
 * THE SPAWN RULE — the one absolute in this file.
 *
 * A room's only spawn is NEVER destroyed. Not to satisfy the plan, not at
 * RCL8, not ever: destroy() on the last spawn ends the room, and no layout
 * improvement is worth that.
 *
 * Below RCL7 CONTROLLER_STRUCTURES caps spawns at 1, so there is physically no
 * way to stand the replacement up first. An off-plan spawn therefore just
 * STAYS. Adoption tolerates it — the placement loop already skips the type at
 * cap, and reclaimTile() no longer logs a spawn squatter as an error, which is
 * where the every-100-tick "needs owner attention" spam came from.
 *
 * From RCL7 the cap is 2, so the protocol is: the placement loop sites the
 * plan's spawn, it finishes, we VERIFY it (mine, active, a real spawn store)
 * and keep verifying for a full migration window rather than trusting one
 * tick's look, and only then does the legacy spawn come down — and only if it
 * is not mid-spawn, because destroying a spawning spawn kills the creep.
 */
function migrateSpawns(
  room: Room,
  plan: PackedPlan,
  lvl: number,
  structures: Structure[],
): void {
  const planned = plan.t.spawn || [];
  if (!planned.length) return;
  const planTile: { [p: number]: boolean } = {};
  for (const p of planned) planTile[p] = true;

  const spawns: StructureSpawn[] = [];
  for (const s of structures) {
    if (s.structureType === STRUCTURE_SPAWN) spawns.push(s as StructureSpawn);
  }
  if (!spawns.length) return;

  const off: StructureSpawn[] = [];
  const onPlan: StructureSpawn[] = [];
  for (const s of spawns) {
    if (planTile[s.pos.x + s.pos.y * 50]) onPlan.push(s);
    else off.push(s);
  }
  if (!off.length) {
    delete room.memory.planSpawnReady;
    return;
  }

  if (spawns.length <= 1) {
    noteOnce(
      room,
      "spawn:solo",
      `planV2 ${room.name}: spawn@${off[0].pos.x},${off[0].pos.y} is off-plan and is the room's ` +
        `ONLY spawn — kept, permanently, by rule. The plan tolerates it; from RCL7 (spawn cap 2) ` +
        `the plan's spawn is built first and this one is retired then.`,
    );
    return;
  }

  if (lvl < 7) {
    // reachable after a downgrade: 2 spawns standing at RCL6
    noteOnce(
      room,
      "spawn:rcl",
      `planV2 ${room.name}: off-plan spawn@${off[0].pos.x},${off[0].pos.y} deferred — RCL${lvl} ` +
        `caps spawns at 1, so the plan's spawn cannot be built before this one comes down.`,
    );
    return;
  }

  let working: StructureSpawn | null = null;
  for (const s of onPlan) {
    if (s.my && s.isActive() && s.store.getCapacity(RESOURCE_ENERGY) > 0) {
      working = s;
      break;
    }
  }
  if (!working) {
    // the replacement is not up (or not functioning) yet — placement builds it
    delete room.memory.planSpawnReady;
    return;
  }

  if (!room.memory.planSpawnReady) {
    room.memory.planSpawnReady = Game.time;
    logAlways(
      `planV2 ${room.name}: plan spawn ${working.name}@${working.pos.x},${working.pos.y} is built ` +
        `and active — verifying for ${MIGRATE_EVERY} ticks before the legacy spawn is retired`,
    );
    return;
  }
  if (Game.time - room.memory.planSpawnReady < MIGRATE_EVERY) return;
  if (migrationEnergy(room) <= MIGRATE_ENERGY) return;

  let legacy: StructureSpawn | null = null;
  for (const s of off) {
    if (!s.spawning) {
      legacy = s;
      break;
    }
  }
  if (!legacy) return; // mid-spawn: destroying it would kill the creep inside
  if (spawns.length - 1 < 1) return; // belt and braces on the absolute rule

  const res = legacy.destroy();
  logAlways(
    `planV2 ${room.name}: migrate spawn — legacy ${legacy.name}@${legacy.pos.x},${legacy.pos.y} ` +
      `destroy() ${res}; ${spawns.length - 1} spawn(s) remain, plan spawn ${working.name} active`,
  );
  delete room.memory.planSpawnReady;
}

/**
 * Storage / terminal. Build-new-then-drain from RCL6 "where caps permit".
 *
 * They do not permit, and that is the finding rather than a limitation of this
 * code: CONTROLLER_STRUCTURES caps storage at 1 from RCL4 and terminal at 1
 * from RCL6, at EVERY level including 8. So a room can never hold the plan's
 * storage and its legacy storage at the same time, the replacement can never
 * be built first, and destroy() on a full storage spills its contents. There
 * is no safe automatic move, so the room defers and says so exactly once.
 *
 * The build-drain-retire path is written out below regardless: it is the
 * correct protocol, it costs three lines, and it is what should run the day a
 * cap allows two (or the day this file is reused on a server that changes it).
 */
function migrateHub(
  room: Room,
  plan: PackedPlan,
  lvl: number,
  structures: Structure[],
): void {
  const classes = [STRUCTURE_STORAGE, STRUCTURE_TERMINAL];
  for (const cls of classes) {
    const planned = plan.t[cls] || [];
    if (!planned.length) continue;
    const cap = (CONTROLLER_STRUCTURES as any)[cls]
      ? (CONTROLLER_STRUCTURES as any)[cls][lvl] || 0
      : 0;
    if (!cap) continue;
    const planTile: { [p: number]: boolean } = {};
    for (const p of planned) planTile[p] = true;

    let onPlan = 0;
    const off: any[] = [];
    for (const s of structures) {
      if (s.structureType !== cls) continue;
      if (planTile[s.pos.x + s.pos.y * 50]) onPlan++;
      else off.push(s);
    }
    if (!off.length) continue;
    const legacy = off[0];
    const used = legacy.store ? legacy.store.getUsedCapacity() || 0 : 0;

    if (lvl < HUB_MIGRATE_RCL) {
      noteOnce(
        room,
        `hub:${cls}:rcl`,
        `planV2 ${room.name}: off-plan ${cls}@${legacy.pos.x},${legacy.pos.y} — migration deferred ` +
          `below RCL${HUB_MIGRATE_RCL}; a room this young cannot afford to rebuild its hub.`,
      );
      continue;
    }

    if (cap < 2) {
      noteOnce(
        room,
        `hub:${cls}`,
        `planV2 ${room.name}: off-plan ${cls}@${legacy.pos.x},${legacy.pos.y} — MIGRATION DEFERRED. ` +
          `CONTROLLER_STRUCTURES caps ${cls} at ${cap} at every RCL, so the plan's tile cannot be ` +
          `built before this one comes down, and destroy() would spill ${used} resources on the ` +
          `floor. Owner action: drain it by hand, destroy it, and the next placement pass sites ` +
          `the plan tile.`,
      );
      continue;
    }

    // caps permit a second one: build new (placement does that), drain, retire
    if (!onPlan) continue;
    if (used > 0) {
      room.memory.planDrain = legacy.id;
      noteOnce(
        room,
        `hub:${cls}:drain`,
        `planV2 ${room.name}: plan ${cls} is up — draining legacy ${cls}@${legacy.pos.x},` +
          `${legacy.pos.y} (${used} held) before retiring it`,
      );
      continue;
    }
    delete room.memory.planDrain;
    const res = legacy.destroy();
    logAlways(
      `planV2 ${room.name}: migrate ${cls} — legacy @${legacy.pos.x},${legacy.pos.y} drained, ` +
        `destroy() ${res}`,
    );
  }
}

/** One migration pass over every class. See the protocol comment above. */
function runMigration(
  room: Room,
  plan: PackedPlan,
  lvl: number,
  structures: Structure[],
  have: { [type: string]: { [packed: number]: boolean } },
): void {
  // NEVER while the room is being attacked. Every action here costs the room
  // either energy capacity or a tower, and a room under siege needs both to
  // spawn and man its defence. Migration is a tidy-up; it can wait.
  if (room.memory.danger) return;
  for (const cls of MIGRATE_CLASSES) migrateClass(room, plan, lvl, cls, structures, have);
  migrateSpawns(room, plan, lvl, structures);
  migrateHub(room, plan, lvl, structures);
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
    // ---------------------------------------------------------------------
    // rampartLocations is GATED AT RCL4, matching the rampart gate in
    // typeAllowedAtRcl / BasePlan.placeFromBasePlan / Perimeter.SHELL_MIN_RCL.
    //
    // This mirror had no gate at all, while every PLACER does. That was
    // survivable while planV2 was only ever adopted by hand into a grown
    // room, and stopped being survivable the moment a freshly claimed RCL1-3
    // room adopts its plan automatically (see Managers/AutoExpand
    // runPackAdoption): rampartLocations is the RampartErector's spawn
    // trigger AND its site list (rooms.spawning keys off
    // "rampartLocations.length > 0"), so an adopted RCL3 room would erect a
    // 50-tile shell it has no storage, no towers and no builder budget to
    // maintain — while the placement layer, correctly, refuses to site a
    // single rampart. Publish the empty list below RCL4 so the trigger reads
    // false; the very next sync after the RCL4 tick fills it in.
    //
    // defence.perimeter is NOT gated: it is geometry, not a build order, and
    // the interior/leash/RampartDefender logic wants to know where the wall
    // WILL be from the start.
    // ---------------------------------------------------------------------
    const lvl = room.controller ? room.controller.level : 0;
    const todo: number[][] = [];
    if (lvl >= SHELL_MIN_RCL) {
      for (const p of shell) {
        if (ramparted[p]) continue;
        const u = unpack(p);
        todo.push([u.x, u.y]);
      }
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

  // SPAWN FIRST (see spawnFirstLockdown). Runs before anything else in this
  // function so the slots the stray sites were holding are handed straight back
  // to the spawn on this same pass.
  const spawnless = spawnFirstLockdown(room);

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
    // still RCL3 ONLY, and deliberately: from RCL4 the road budget is the whole
    // array, so there is no prefix decision left to get wrong, and this runs
    // in-game where a BFS per tick is a real cost. The offline side
    // (push-plan.mjs --census) sweeps 3..8 because it can afford to and because
    // the CONDUCTOR set keeps changing after RCL3 even when the road set stops.
    auditRoadPrefix(room, plan, roadsForRcl(plan, roads, lvl), lvl);
  }

  // ConstructionSite.remove() only lands at the end of the tick, so the sites
  // the lockdown just removed are still in `sites` — do not let them hold the
  // budget hostage for one more pass.
  let liveSites = sites.length;
  if (spawnless) {
    liveSites = 0;
    for (const s of sites) if (s.structureType === STRUCTURE_SPAWN) liveSites++;
  }
  let budget = MAX_SITES - liveSites;
  // existing structures + sites by type (containers/roads are unowned)
  const have: { [type: string]: { [packed: number]: boolean } } = {};
  const count: { [type: string]: number } = {};
  const note = (type: string, x: number, y: number) => {
    (have[type] = have[type] || {})[x + y * 50] = true;
    count[type] = (count[type] || 0) + 1;
  };
  for (const s of structures) note(s.structureType, s.pos.x, s.pos.y);
  for (const s of sites) note(s.structureType, s.pos.x, s.pos.y);

  // Migration runs BEFORE the site budget gate, deliberately. A starved room
  // cannot finish the sites it already has — E11S2 sat on four sites nothing
  // was building for thousands of ticks — so gating it on a free site slot
  // means the rooms that need it most are exactly the rooms that never get it.
  // Demolition does not consume a site slot anyway.
  //
  // NOT while the room is spawnless: migration is a convergence tidy-up, and a
  // room that cannot spawn has nothing to converge on. Every destroy() there
  // only spends the one borrowed builder's time on a rebuild that is not the
  // spawn.
  if (!spawnless) runMigration(room, plan, lvl, structures, have);

  if (budget <= 0) return;

  const state = { destroyed: false };

  // A PERSONAL RAMPART BEFORE ITS STRUCTURE IS DECAY WITH NOTHING UNDER IT.
  //
  // Ramparts unlock at RCL4 and the plan's rampart array is the shell cut PLUS
  // the personal covers earlier layers bolted onto shallow structures. The loop
  // below sited all of them the moment RCL4 arrived: E9S2 built 18 of its 19
  // personal ramparts at RCL4, up to FOUR RCLs before the extension each one
  // covers exists, decaying at 300 hp/100 ticks the whole time and holding site
  // slots the extensions themselves wanted. A shell tile defends the room the
  // day it goes up; a personal cover defends nothing until the thing it covers
  // is standing. The set is the plan's own — a rampart tile that the plan also
  // wants a blocking structure on is a personal cover, everything else is wall.
  const plannedOccupancy: { [packed: number]: boolean } = {};
  for (const k of Object.keys(plan.t)) {
    if (k === "road" || k === "rampart" || k === "shellCut" || k === "labInput") continue;
    for (const p of plan.t[k] || []) plannedOccupancy[p] = true;
  }
  const builtOn: { [packed: number]: boolean } = {};
  for (const s of structures) {
    if (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_RAMPART) continue;
    builtOn[s.pos.x + s.pos.y * 50] = true;
  }

  for (const type of placeOrderFor(lvl)) {
    if (budget <= 0) break;
    // SPAWN FIRST: while no spawn is standing, no other type may take a slot —
    // not the container/extension pair RCL2 unlocks, not anything. PLACE_ORDER
    // opens with "spawn", so in practice this ends the loop after one type;
    // it is written as a `continue` guard so a future reorder cannot reopen the
    // hole silently.
    if (spawnless && type !== "spawn") continue;
    // Roads are the one type whose ARRAY is trimmed rather than capped: the
    // RCL selection is a staged subsequence, not a prefix (see roadsForRcl), so
    // the loop below must iterate the selection itself.
    const planned =
      type === "road"
        ? roadsForRcl(plan, plannedTilesFor(plan, type, lvl), lvl)
        : plannedTilesFor(plan, type, lvl);
    if (!planned || !planned.length) continue;
    if (!typeAllowedAtRcl(type, lvl)) continue;
    const cap =
      type === "road"
        ? planned.length
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
      // No prefix guard here any more: for roads `planned` IS the RCL's staged
      // selection and cap is its length, and every other type scans its WHOLE
      // array — stopping at a prefix meant one permanently-occupied tile
      // stalled the type forever (E11S5 never got a tower because a legacy
      // container squatted tower[0]).
      const packed = planned[i];
      if (placedSet[packed]) continue;
      // see the personal-rampart note above: cover waits for the thing it covers
      if (type === "rampart" && plannedOccupancy[packed] && !builtOn[packed]) continue;
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
