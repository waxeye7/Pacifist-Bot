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
import { requestSegments } from "utils/Segments";
import { incomeRampartAdds, shellExposure } from "utils/minerSeat";

const SEGMENT = 88;
const MAX_SITES = 4;

/**
 * A leftover remote/approach road is not a standing shell.
 * migrateInsta refuses exterior roads; counting every road made one
 * stray tile + one rampart hide a missing interior.
 */
export function countedShellRoad(interiorOk: boolean, exterior: boolean): boolean {
  return interiorOk && !exterior;
}

/**
 * Broke-bank site strip. Incomplete-core is 2 untyped slots; leftover
 * lab/nuker/RCL6+ rampart sites at budget===0 used to skip the strip
 * (`budget < 0` only) so the missing extensions/towers never sited.
 */
export function brokeBankStripFires(
  budget: number,
  nakedShell: boolean,
  coreIncomplete: boolean,
): boolean {
  return budget < 0 || !!nakedShell || !!coreIncomplete;
}

/** Off-plan last tower on planned storage/spawn/terminal — a swap, not a floor. */
export function towerOccupiesPlannedHub(
  packed: number,
  plan: { t?: { [k: string]: number[] } } | null | undefined,
): boolean {
  if (!plan || !plan.t) return false;
  const storage = plan.t.storage;
  if (storage && storage.indexOf(packed) >= 0) return true;
  const spawn = plan.t.spawn;
  if (spawn && spawn.indexOf(packed) >= 0) return true;
  const terminal = plan.t.terminal;
  return !!(terminal && terminal.indexOf(packed) >= 0);
}

/**
 * Insta last-tower: surplus may go, but a same-pass hub-swap must not
 * take the last remaining tower. FIND_STRUCTURES order is unspecified;
 * 2+ off-plan with the hub-sitter last used to hit 0 towers in one tick.
 */
export function lastTowerInstaMayDestroy(
  myTowers: number,
  occupiesPlannedHub: boolean,
  alreadyDestroyedThisPass: number,
): boolean {
  if (myTowers > 1) return true;
  if (myTowers <= 0) return false;
  return occupiesPlannedHub && alreadyDestroyedThisPass === 0;
}

/**
 * Placement reclaim after migrateInsta in the same placeFromPlanV2 pass.
 * Insta may already have dropped surplus; FIND_STRUCTURES can still look
 * like 2 towers. Any insta destroy this tick forbids taking the last.
 */
export function lastTowerReclaimMayDestroy(
  myTowers: number,
  occupiesPlannedHub: boolean,
  instaN: number,
): boolean {
  if (instaN > 0) return false;
  return lastTowerInstaMayDestroy(myTowers, occupiesPlannedHub, 0);
}

export function instaDestroyedThisPass(room: { memory?: any }): number {
  const mem = room.memory as any;
  if (!mem || mem._instaPass !== Game.time) return 0;
  return mem._instaN || 0;
}

/** Placement reclaim: a tower sitting on the planned hub tile is destroyable. */
export function hubTypeReclaimsTower(placeType: string): boolean {
  return (
    placeType === STRUCTURE_STORAGE ||
    placeType === STRUCTURE_SPAWN ||
    placeType === STRUCTURE_TERMINAL
  );
}

/** 0 my ramparts or 0 interior roads — a dead bank cannot sit out the freeze. */
function isShellNaked(room: Room, structures: Structure[]): boolean {
  let myRamparts = 0;
  let roads = 0;
  const ready = interiorReady(room);
  for (const s of structures) {
    if (s.structureType === STRUCTURE_ROAD) {
      if (countedShellRoad(ready, isExteriorTile(room, s.pos.x, s.pos.y))) roads++;
    } else if (s.structureType === STRUCTURE_RAMPART && (s as StructureRampart).my) {
      myRamparts++;
    }
    if (myRamparts && roads) return false;
  }
  return true;
}

/** RCL2: five slots so all five extensions site in one 15-tick pass.
 *  RCL4 after storage: dump the next extensions faster (800→1300). */
/**
 * Is the room short of the structures that MAKE energy work — spawns,
 * extensions, towers — relative to what its RCL already allows?
 *
 * This is the difference between a room that is over-building and one that is
 * under-built, and the broke-bank clamp below cannot tell them apart on its
 * own. VPS W2N1 and W1N2 both sat at RCL7 holding 40 of 50 extensions, 2 of 3
 * towers, 1 of 2 spawns, storage at 0 — so the clamp gave them a site budget of
 * ZERO and they stayed that way indefinitely. The ten missing extensions are
 * precisely what would have let them fill a spawn faster and climb out.
 *
 * Counts standing structures only. Sites already open are handled by the
 * caller's `liveSites` subtraction, so a room that is mid-catch-up still
 * reports incomplete and simply has no free slots.
 */
/**
 * RCL5+ income is the source link (energyMiner accepts range 2). A source
 * box at range 1 is the pre-link path. Align used to delete an off-plan
 * source link while this helper only counted spawn/ext/tower — a broke
 * core-complete room then got maxSitesFor=0 and could not rebuild either.
 */
export function isSourceIncomeStructure(s: Structure): boolean {
  if (s.structureType === STRUCTURE_CONTAINER) {
    return s.pos.findInRange(FIND_SOURCES, 1).length > 0;
  }
  if (s.structureType === STRUCTURE_LINK) {
    // Hostile / unowned leftover links cannot transfer. Counting them as
    // income zeroed maxSitesFor while migrateInsta skipped !my links and
    // reclaimTile refused the tile.
    if (!(s as any).my) return false;
    return s.pos.findInRange(FIND_SOURCES, 2).length > 0;
  }
  return false;
}

function coreBuildoutIncomplete(lvl: number, structures: Structure[]): boolean {
  const caps: any = CONTROLLER_STRUCTURES;
  const want: { [type: string]: number } = {};
  want[STRUCTURE_SPAWN] = (caps[STRUCTURE_SPAWN] || {})[lvl] || 0;
  want[STRUCTURE_EXTENSION] = (caps[STRUCTURE_EXTENSION] || {})[lvl] || 0;
  want[STRUCTURE_TOWER] = (caps[STRUCTURE_TOWER] || {})[lvl] || 0;
  const have: { [type: string]: number } = {};
  for (const s of structures) {
    if (!(s as any).my) continue;
    if (want[s.structureType] === undefined) continue;
    have[s.structureType] = (have[s.structureType] || 0) + 1;
  }
  for (const type in want) {
    if ((have[type] || 0) < want[type]) return true;
  }
  if (lvl >= 5) {
    for (const s of structures) {
      if (isSourceIncomeStructure(s)) return false;
    }
    return true;
  }
  return false;
}

function maxSitesFor(lvl: number, room?: Room, structures?: Structure[]): number {
  // Established rooms: do not keep 8 sites open when the bank is thin.
  // RCL4-5 dump (800→1300) is allowed on an empty new storage. RCL6+
  // site-flood is what bled VPS RCL8 rooms dry.
  // Spawnless rooms still get one slot — a dead spawn cannot wait for 150k.
  // Shell-naked (0 my ramparts or 0 interior roads): 2 slots so the wall can restart.
  if (lvl >= 6 && room && room.storage && room.storage.my) {
    const e = room.storage.store[RESOURCE_ENERGY] || 0;
    const floor = lvl >= 8 ? 150000 : lvl >= 7 ? 80000 : 30000;
    if (e < floor) {
      if (!room.find(FIND_MY_SPAWNS).length) return 1;
      const structs = structures || room.find(FIND_STRUCTURES);
      if (isShellNaked(room, structs)) return 2;
      // Behind on spawns/extensions/towers: the clamp is aimed at a room
      // bleeding itself on optional structures, not at one that never finished
      // its own energy network. Two slots — a drip, not the RCL4-5 dump.
      if (coreBuildoutIncomplete(lvl, structs)) return 2;
      // LABS ARE THE INCOME MULTIPLIER, NOT FURNITURE. VPS W1N1 (RCL8) sat at
      // 7/10 labs with the bank oscillating 130-165k around the 150k floor —
      // the clamp was holding back the exact structures whose reactions/boosts
      // refill the bank. One slot for a missing lab once the room holds at
      // least HALF the floor: a lab is 50k, half the RCL8 floor is 75k, the
      // cushion survives the build. Rooms genuinely broke (W3N1 at 16k) stay
      // fully clamped.
      if (e >= floor / 2) {
        const labCap = ((CONTROLLER_STRUCTURES as any)[STRUCTURE_LAB] || {})[lvl] || 0;
        if (labCap > 0) {
          let labs = 0;
          for (const s of structs) {
            if (s.structureType === STRUCTURE_LAB && (s as any).my) labs++;
          }
          if (labs < labCap) return 1;
        }
      }
      return 0;
    }
  }
  if (lvl === 2) return 5;
  if (lvl >= 4 && room && room.storage && room.storage.my) return 8;
  return MAX_SITES;
}
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

/** Packed link order is hub, first source, controller, … */
export function plannedLinkTile(room: Room, index: number): { x: number; y: number } | null {
  const plan = room.memory.planV2 as PackedPlan | undefined;
  const links = plan && plan.t ? plan.t.link : undefined;
  if (!links || index < 0 || index >= links.length) return null;
  return unpack(links[index]);
}

/** Live MY spawn is more than `maxCheb` from plan spawn[0]. Spawnless = false. */
export function planSpawnMismatch(room: Room, maxCheb = 6): boolean {
  const planned = plannedSpawnTile(room);
  if (!planned) return false;
  const spawns = room.find(FIND_MY_SPAWNS);
  if (!spawns.length) return false;
  for (const s of spawns) {
    if (Math.max(Math.abs(s.pos.x - planned.x), Math.abs(s.pos.y - planned.y)) <= maxCheb) {
      return false;
    }
  }
  return true;
}

/**
 * Free the plan's first spawn tile so we can site it.
 *
 * Live E39N58: a leftover/off-plan spawn (or a road/container) sat on the
 * planned tile. createConstructionSite then returned ERR_INVALID_TARGET and
 * AutoExpand.ensureSpawnSite swallowed it. At RCL1-6 the engine cap is 1, so
 * an off-plan MY spawn also blocks the plan spawn forever (migrateSpawns
 * used to keep the only spawn until RCL7).
 *
 * Young rooms (RCL<=3, no storage): destroy our own idle occupier.
 * Foreign occupiers cannot be destroyed — we log and the caller may retry.
 */
export function clearPlanSpawnTile(room: Room, x: number, y: number): boolean {
  const pos = new RoomPosition(x, y, room.name);
  let blocked = false;
  for (const s of pos.lookFor(LOOK_STRUCTURES)) {
    if (s.structureType === STRUCTURE_CONTROLLER) return false;
    if (s.structureType === STRUCTURE_RAMPART && (s as StructureRampart).my) continue;
    if (s.structureType === STRUCTURE_SPAWN && (s as StructureSpawn).my && (s as StructureSpawn).spawning) {
      blocked = true;
      continue;
    }
    const mine = !!(s as any).my;
    const cheap =
      s.structureType === STRUCTURE_ROAD ||
      s.structureType === STRUCTURE_CONTAINER ||
      s.structureType === STRUCTURE_SPAWN;
    if (mine && cheap) {
      const res = s.destroy();
      logAlways(
        `planV2 ${room.name}: spawn tile ${x},${y} occupied by ${s.structureType} — destroy() ${res}`,
      );
      continue;
    }
    blocked = true;
    if (Game.time % 50 < 5) {
      logAlways(
        `planV2 ${room.name}: spawn tile ${x},${y} blocked by ${mine ? "my" : "foreign"} ${s.structureType} — cannot site`,
      );
    }
  }
  return !blocked;
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

/**
 * Owner policy: every adopted room builds AND migrates toward the pack — but
 * `hub` is YOUNG-ONLY. A young colony (RCL<4, <15 structures) has no hub to
 * lose, so it may swap anything. An ESTABLISHED room arms ALIGN (force, no
 * hub): everything off-plan goes, spawn/storage/terminal stay protected by
 * the never-retire guard, and the hub still walks to the plan through the STAGED
 * gradual protocol (migrateSpawns/migrateHub with its guards).
 *
 * `hub: true` on an established room is what `keepCritical = !wantHub` turns
 * into "delete the storage": VPS W3N3 lost its storage + 27 extensions within
 * ~10 minutes of its plan being pushed (2026-08-19 ~11:07), and the 2026-08-17
 * live incident (3 spawns + 3 storages, ~38k spilled) was the same bypass
 * through the old force flag. Hub demolition on a built room is an OPERATOR
 * decision: migratePlan(room, "hub"), nothing else.
 */
export function armNewPlanMigration(room: Room, by = "auto-new-plan"): void {
  const lvl = room.controller ? room.controller.level : 0;
  const young = lvl < 4 && room.find(FIND_MY_STRUCTURES).length < 15;
  (room.memory as any).planMigration = {
    mode: young ? "auto" : "gradual",
    since: Game.time,
    by,
    force: true,
    hub: young,
  };
  delete (room.memory as any).planMigratePaused;
}

/** Console: adoptPlan("E11S2") — requires push-plan.mjs to have run. */
(global as any).adoptPlan = function (roomName: string) {
  Memory.planV2Adopt = { room: roomName, since: Game.time };
  return `adopting plan for ${roomName} — segment ${SEGMENT} read over next 2 ticks`;
};

(global as any).dropPlan = function (roomName: string) {
  // operate on Memory directly: a lost/invisible room's stale plan + arm state
  // must be clearable too, or a re-claim comes back pre-armed against it
  const m: any = Memory.rooms && (Memory.rooms as any)[roomName];
  if (!m) return `no room memory for ${roomName} — nothing to drop`;
  delete m.planV2;
  delete m.planMigration;
  delete m.planMigrate;
  delete m.planMigrateLog;
  delete m.planMigratePaused;
  delete m.planSpawnReady;
  delete m.planDrain;
  return `dropped planV2 + migration state for ${roomName} (legacy construction resumes)`;
};

/**
 * Console: migratePlan(room [, force])  — demolish toward the adopted plan.
 *
 *   migratePlan("W1N1")          gradual. Retires a few structures per class
 *                                per 60 ticks, and ONLY while the room holds
 *                                more than MIGRATE_ENERGY (20k) in storage, so
 *                                it can pay to rebuild what it removes. On a
 *                                room that never reaches 20k this does nothing
 *                                at all, which is exactly what live shard3 saw
 *                                and why the owner reached for force.
 *
 *   migratePlan("W1N1", true)    ALIGN. Ignores the energy gate and the pacing
 *                                and clears every off-plan extension,
 *                                container, road, tower and wall it can reach.
 *                                Spawns, storage and terminals are LEFT ALONE.
 *                                This is what "delete everything that is not in
 *                                the plan" means in practice.
 *
 *   migratePlan("W1N1", "hub")   ALIGN + retire the off-plan spawn / storage /
 *                                terminal too. This takes the room offline while
 *                                it rebuilds a 15k spawn, and destroy() spills a
 *                                storage's contents on the floor. It is the
 *                                right call when relocating a hub deliberately
 *                                and the wrong one almost every other time —
 *                                hence a word rather than a boolean, so it
 *                                cannot be reached by typing `true`.
 */
(global as any).migratePlan = function (roomName: string, force: boolean | string = false) {
  const room = Game.rooms[roomName];
  if (!room) return `no visibility on ${roomName}`;
  if (!room.memory.planV2) return `${roomName} has no adopted planV2 — adoptPlan first`;
  // TRULY young rooms (low level AND few structures) get the colony mode so an
  // operator can unwedge one whose auto-arm never happened; a downgraded BUILT
  // room gets gradual, which the gate deliberately holds until RCL4 — its
  // economy depends on the structures migration would eat
  const lvl = room.controller ? room.controller.level : 0;
  const young = lvl < 4 && room.find(FIND_MY_STRUCTURES).length < 15;
  const mode = young ? "auto" : "gradual";
  // "hub" (any string) opts into retiring spawn/storage/terminal. `true` does
  // NOT — see the header. Anything truthy still bypasses the energy gate.
  const wantHub = typeof force === "string" && force.toLowerCase() === "hub";
  (room.memory as any).planMigration = {
    mode: mode, since: Game.time, by: "operator", force: !!force, hub: wantHub,
  };
  delete (room.memory as any).planMigratePaused;
  // stall bookkeeping from an earlier arm cycle would instantly re-trigger the
  // frozen state AND suppress its note — a fresh arm starts with fresh timers
  const timers: any = room.memory.planMigrate || {};
  const noteLog: any = room.memory.planMigrateLog || {};
  for (const k of Object.keys(timers)) if (k.indexOf("sites:") === 0) delete timers[k];
  for (const k of Object.keys(noteLog)) if (k.indexOf("sites-stalled:") === 0) delete noteLog[k];
  const hold = mode === "gradual" && lvl < 4 ? ` (holds until RCL4 — economy safety)` : "";
  const level = wantHub ? " ALIGN+HUB (will retire spawn/storage/terminal)" : force ? " ALIGN (spawn/storage/terminal kept)" : "";
  // Align runs immediately, including mid spawn-rescue — the owner's call. Say
  // so at arm time so the cost is visible at the moment it is accepted.
  const held = force && spawnEmergencyActive()
    ? ` — NOTE: a spawn rescue is in progress and this will NOT wait; spawns/storage/terminal are kept, extensions are not`
    : "";
  return `${mode} migration ARMED for ${roomName}${level}${hold}${held} — migrateStatus() to watch, migrateAbort("${roomName}") to stand down`;
};

/** Console: migrateAbort("W1N1") — disarm; nothing further is demolished, placement continues. */
(global as any).migrateAbort = function (roomName: string) {
  const room = Game.rooms[roomName];
  if (!room) return `no visibility on ${roomName}`;
  // TOMBSTONE, not deletion: the AutoExpand self-heal re-arms armless young
  // rooms, so a deleted arm resurrected within 25 ticks — an explicit
  // "disarmed" survives every sweep and only dropPlan or migratePlan replace it
  (room.memory as any).planMigration = { mode: "disarmed", since: Game.time, by: "operator" };
  delete (room.memory as any).planMigratePaused;
  return `migration disarmed for ${roomName} — nothing further will be demolished (plan placement continues)`;
};

/** Console: park/unpark the gradual migration of one room (adoption + placement continue). */
(global as any).migratePause = function (roomName: string) {
  const room = Game.rooms[roomName];
  if (!room) return `no visibility on ${roomName}`;
  (room.memory as any).planMigratePaused = true;
  return `migration paused for ${roomName} — migrateResume("${roomName}") to continue`;
};

(global as any).migrateResume = function (roomName: string) {
  const room = Game.rooms[roomName];
  if (!room) return `no visibility on ${roomName}`;
  delete (room.memory as any).planMigratePaused;
  return `migration resumed for ${roomName}`;
};

/**
 * Console: migrateStatus() — one line per planV2 room, using the ENGINE'S OWN
 * view of on/off-plan (staged/RCL-capped tile prefixes, exterior roads
 * excluded), so the census can only report work the engine would actually do.
 */
(global as any).migrateStatus = function () {
  const lines: string[] = [];
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    if (!room.controller || !room.controller.my) continue;
    const plan: any = room.memory.planV2;
    if (!plan || !plan.t) continue;
    const lvl = room.controller.level;
    const parts: string[] = [];
    for (const cls of MIGRATE_CLASSES) {
      const planned = plannedTilesFor(plan, cls, lvl, room) || [];
      if (!planned.length) continue;
      const isRoad = cls === STRUCTURE_ROAD;
      const cap = isRoad
        ? planned.length
        : (CONTROLLER_STRUCTURES as any)[cls]
          ? (CONTROLLER_STRUCTURES as any)[cls][lvl] || 0
          : planned.length;
      const limit = isRoad ? planned.length : Math.min(cap, planned.length);
      const set = new Set<number>();
      for (let i = 0; i < limit; i++) set.add(planned[i]);
      // the engine only ever touches roads when the interior classifier is
      // usable — mirror that, or the census reports work that will never run
      if (isRoad && !interiorReady(room)) {
        parts.push("road:deferred(interior)");
        continue;
      }
      const list: any[] =
        isRoad || cls === STRUCTURE_CONTAINER
          ? room.find(FIND_STRUCTURES, { filter: (x: any) => x.structureType === cls })
          : room.find(FIND_MY_STRUCTURES, { filter: (x: any) => x.structureType === cls });
      let off = 0;
      for (const s of list) {
        if (set.has(s.pos.x + s.pos.y * 50)) continue;
        // exterior roads are the remote lines — the engine never touches them
        if (isRoad && isExteriorTile(room, s.pos.x, s.pos.y)) continue;
        off++;
      }
      if (off) parts.push(`${cls}:${off}`);
    }
    /*
     * EVERY OTHER STRUCTURE TYPE — because the loop above only counts the four
     * in MIGRATE_CLASSES, and anything outside that set was invisible here.
     *
     * That is not a cosmetic gap. Live E36N57 reported
     * "extension:17 container:2 road:9" while standing on 67 ramparts of which
     * 28 were off-plan — a complete old square wall (lines at x=13, y=36, x=30,
     * x=28) left beside the new min-cut shell. The owner could see two rings of
     * rampart in the client while the bot's own status said the room was nearly
     * aligned. Labs, links, walls, the extractor, the observer and the nuker had
     * the same hole.
     *
     * The comparison here is deliberately the one `migrateInsta` itself makes —
     * standing structure against the plan's FULL tile set, `shellCut` counting
     * as rampart — so what the census reports and what the align pass will
     * actually retire cannot drift apart. Types the gradual path does not
     * handle are tagged `(align-only)`, because the reader needs to know the
     * difference between "queued" and "needs migratePlan(room, true)".
     */
    const counted: { [type: string]: boolean } = {};
    for (const cls of MIGRATE_CLASSES) counted[cls] = true;
    const wantedTile: { [packed: number]: { [type: string]: boolean } } = {};
    for (const t of Object.keys(plan.t)) {
      if (t === "labInput") continue;
      const asType = t === "shellCut" ? STRUCTURE_RAMPART : t;
      for (const p of plan.t[t] || []) {
        if (!wantedTile[p]) wantedTile[p] = {};
        wantedTile[p][asType] = true;
      }
    }
    const offOther: { [type: string]: number } = {};
    for (const s of room.find(FIND_STRUCTURES) as any[]) {
      const type = s.structureType;
      if (type === STRUCTURE_CONTROLLER) continue;
      if (counted[type]) continue; // already reported above
      // migrateInsta only touches ours, plus unowned roads/containers
      if (!s.my && type !== STRUCTURE_ROAD && type !== STRUCTURE_CONTAINER) continue;
      const packed = s.pos.x + s.pos.y * 50;
      if (wantedTile[packed] && wantedTile[packed][type]) continue;
      offOther[type] = (offOther[type] || 0) + 1;
    }
    for (const type of Object.keys(offOther).sort()) {
      parts.push(`${type}:${offOther[type]}(align-only)`);
    }

    // types the plan does not manage at all (legacy factory/powerSpawn etc.)
    const unmanaged = room
      .find(FIND_MY_STRUCTURES, {
        filter: (s: any) =>
          s.structureType === STRUCTURE_FACTORY || s.structureType === STRUCTURE_POWER_SPAWN,
      })
      .map((s: any) => s.structureType);
    const arm = (room.memory as any).planMigration;
    /*
     * The verdict has to name EVERY reason nothing is happening, not just the
     * ones migrationAllowed() knows about.
     *
     * It used to print "ACTIVE" whenever migrationAllowed() returned null —
     * but that function does not test MIGRATE_ENERGY, which is the gate that
     * actually stops most rooms: an unforced pass only retires a FREE_REPLACE
     * structure while storage holds more than 20k. So a room that was armed,
     * correct, and deliberately doing nothing reported itself as ACTIVE with a
     * list of off-plan structures next to it, for as long as it stayed poor.
     * That reads as a broken bot, and it is why the owner reached for the force
     * flag that then retired their spawns.
     */
    let verdict: string;
    const gate = migrationAllowed(room);
    const forced = !!(arm && arm.force);
    if (gate !== null) {
      verdict = "BLOCKED: " + gate;
    } else if (!forced && migrationEnergy(room) <= MIGRATE_ENERGY) {
      verdict =
        `IDLE: storage ${migrationEnergy(room)} <= ${MIGRATE_ENERGY} — gradual migration will not ` +
        `demolish what the room cannot pay to rebuild. migratePlan("${roomName}", true) to align anyway ` +
        `(keeps spawn/storage/terminal).`;
    } else {
      verdict = forced ? (arm.hub ? "ACTIVE (align + hub)" : "ACTIVE (align)") : "ACTIVE (gradual)";
    }
    const armInfo = arm ? `arm:${arm.mode}${arm.force ? (arm.hub ? "+force+hub" : "+force") : ""}@${arm.since}` : "arm:none";
    lines.push(
      `${roomName} plan ${plan.h} rcl ${lvl} ${armInfo} off-plan[engine-view]: ${parts.join(" ") || "none"}` +
        (unmanaged.length ? ` unmanaged: ${unmanaged.join(",")}` : "") +
        ` — ${verdict}`,
    );
  }
  return lines.length ? lines.join("\n") : "no planV2 rooms visible";
};

/**
 * The payload schema this build understands, written into PackedPlan.v.
 *
 * It was written and never read, which made it decoration: a payload from a
 * future push-plan.mjs with a different `structures` shape would have been
 * packed into nonsense tiles and adopted silently. The gate below is the whole
 * point of carrying a version at all.
 *
 * A payload with NO `v` is a payload from before push-plan.mjs stamped one —
 * that is schema 1 by definition, so absent means 1 rather than "reject".
 */
export const PLAN_PAYLOAD_VERSION = 1;

/** Payload schema version. Absent (pre-versioning push) counts as 1. */
export function planPayloadVersion(data: any): number {
  const v = data && data.v;
  return typeof v === "number" ? v : PLAN_PAYLOAD_VERSION;
}

/**
 * Turn a planner payload (push-plan.mjs segment 88, or one entry of the
 * auto-expand pack in segments 80-85) into the packed room.memory.planV2
 * value. Shared so a freshly claimed room adopts EXACTLY what adoptPlan()
 * would have given it — see Managers/AutoExpand.ts.
 *
 * THROWS on an unsupported payload version. Throwing is deliberate: this is the
 * one choke point both adoption paths go through, and every caller is inside a
 * phase-level try/catch (main.ts `phase()`), so an unreadable payload costs the
 * adoption and nothing else. Refusing here is what stops a future schema from
 * being packed into garbage tiles and then BUILT.
 */
export function packPlanPayload(data: any): PackedPlan {
  const ver = planPayloadVersion(data);
  if (ver !== PLAN_PAYLOAD_VERSION) {
    const msg =
      `planV2: refusing payload for ${data && data.room} — schema v${ver}, ` +
      `this build understands v${PLAN_PAYLOAD_VERSION}. Update the bot or re-push with a matching push-plan.mjs.`;
    logAlways(msg);
    throw new Error(msg);
  }
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
  const out: PackedPlan = { v: PLAN_PAYLOAD_VERSION, h: data.planHash, t };
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
  // UNION, not replace — a naked setActiveSegments here cancelled the error
  // segment, the animator and AutoExpand's pack read for the whole adoption
  // window. See utils/Segments.
  requestSegments([SEGMENT]);
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
    // Version gate, checked HERE as well as inside packPlanPayload so the
    // console path names the problem and drops the request instead of
    // re-reading the same unusable segment until the 20-tick timeout.
    const ver = planPayloadVersion(data);
    if (ver !== PLAN_PAYLOAD_VERSION) {
      logAlways(
        `planV2: ${adopt.room} NOT adopted — segment ${SEGMENT} carries schema v${ver}, ` +
          `this build understands v${PLAN_PAYLOAD_VERSION}. Re-push with a matching push-plan.mjs.`,
      );
      delete Memory.planV2Adopt;
      return;
    }
    const packed = packPlanPayload(data);
    const t = packed.t;
    const prev = room.memory.planV2 as PackedPlan | undefined;
    if (prev && prev.h && data.planHash && prev.h !== data.planHash) {
      logAlways(`planV2: ${adopt.room} re-adopt — plan hash ${prev.h} -> ${data.planHash} (layout changed)`);
      // the one-shot migration notes (hub deferral, solo spawn/tower) belong
      // to the OLD layout; a new layout must be allowed to say them again
      delete room.memory.planMigrateLog;
    }
    room.memory.planV2 = packed;
    // Owner wants the pack, not a placement-only adopt that sits on the
    // legacy bunker until someone remembers migratePlan. Re-arm on every
    // successful adopt, including a hash change — the new layout is the
    // one we are supposed to walk toward.
    armNewPlanMigration(room, "adopt");
    delete Memory.planV2Adopt;
    const armState = `migration ${(room.memory as any).planMigration.mode}+force+hub`;
    logAlways(
      `planV2: ${adopt.room} adopted (${data.planHash || "no-hash"}) — ` +
        Object.keys(t)
          .map((k) => `${k}:${t[k].length}`)
          .join(" ") +
        ` — ${armState}`,
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

/**
 * Speedrun extension schedule (also used by the legacy placer — race rooms
 * often have no planV2, and used to ignore this and site all 10 at RCL3):
 *   RCL2 — all 5 instantly (300→550; 4W/parked bodies need this).
 *   RCL3 — hold at 5 the whole climb. The next five cost 15k on 135k and
 *           do not unlock a bigger 4W (500e).
 *   RCL4 — still 5 until room.storage.my STANDS (site ≠ standing; hub
 *           container is not storage). Then engine cap. No room arg →
 *           live engine cap (do not skip-forever).
 *   RCL5+ — engine cap (30/…). Storage still sites first in PLACE_ORDER.
 */
export function extensionTake(lvl: number, engineCap: number, room?: Room): number {
  if (engineCap <= 0) return 0;
  if (lvl <= 3) return Math.min(5, engineCap);
  if (lvl === 4 && room && !(room.storage && room.storage.my)) {
    return Math.min(5, engineCap);
  }
  return engineCap;
}

function plannedTilesFor(plan: PackedPlan, type: string, lvl: number, room?: Room): number[] {
  const planned = plan.t[type] || [];
  if (type === STRUCTURE_EXTENSION) {
    const caps = (CONTROLLER_STRUCTURES as any)[type];
    const engineCap = caps ? caps[lvl] || 0 : planned.length;
    const take = Math.min(extensionTake(lvl, engineCap, room), planned.length);
    return take >= planned.length ? planned : planned.slice(0, take);
  }
  if (type !== STRUCTURE_CONTAINER || !planned.length) return planned;
  const staged = containerStageOrder(plan);
  const caps = (CONTROLLER_STRUCTURES as any)[type];
  const cap = caps ? caps[lvl] || 0 : planned.length;
  // RCL2: first source container only (plan-order prefix of the early set).
  // Second source + controller stay on the same order at RCL3; mineral at RCL6.
  // Nested prefixes: 1 ⊂ early ⊂ all. Never reorder — migrate is FREE_REPLACE.
  //
  // SPRAWL EXCEPTION. The one-box rule is tuned for compact bench rooms where
  // the controller sits next to the hub and RCL3 is minutes away. Live E35N58
  // is the other shape: hub→controller 20+, sources in opposite corners — it
  // sat 11,700+ ticks at RCL2 with seven upgraders shuttling 24 tiles to sip
  // a decaying pile, because the controller box (the thing that lets them
  // park) was staged behind an RCL it could not reach without it. When the
  // controller is far from the hub, stage the WHOLE early set at RCL2: two
  // boxes (~10k energy) beat five thousand ticks of commute. The prefix stays
  // nested (early ⊂ all), so migration order is untouched.
  let rcl2Early = Math.min(1, staged.early);
  if (lvl === 2 && room && room.controller) {
    const sp = room.find(FIND_MY_SPAWNS)[0];
    if (sp && sp.pos.getRangeTo(room.controller) > 10) rcl2Early = staged.early;
  }
  const beforeExtractor = lvl < 3 ? rcl2Early : staged.early;
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
// LAB SITS AHEAD OF ROAD, for exactly the reason rampart does (above): the
// road "budget" from RCL4 is the ENTIRE array (median 81 tiles), the loop
// breaks when the site budget is spent, so labs at the old index NEVER saw a
// slot until every planned road existed — live W1N1 (RCL8, 168k bank) sat
// with unfinished labs behind its road backlog, and every RCL6 room showed
// labs 0/10. Labs are 3-10 sites ONCE and they feed the boosts the whole
// defence doctrine runs on; the roads they delay are covered by ROAD_DRIP.
const PLACE_ORDER = [
  "spawn",
  "storage",
  "tower",
  "container",
  "extension",
  "terminal",
  "link",
  "rampart",
  "lab",
  "road",
  "nuker",
  "extractor",
  "observer",
];

/**
 * Roads always trickle: up to this many road SITES may stand regardless of
 * the shared class budget (raised 2->3 once the paver share started consuming
 * sites). Containers + extensions eat the whole budget for
 * thousands of ticks in a rebuilding room (E36N57: 8/8 slots, zero road
 * sites; E37N59 at RCL6 with a 1k bank: budget 2, "roads aren't being built
 * anywhere"), and a road is 300 energy that immediately halves loaded hauler
 * tick-cost on that tile. Two sites is a drip, not a flood — the broke-bank
 * strip keeps exactly this many too, so the two never fight.
 */
const ROAD_DRIP = 3;

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
 * mis-push can never level a base. Spawn/storage/terminal/lab are
 * never touched: those cost real energy and need owner attention.
 * Exception: a last tower on planned storage/spawn/terminal is a swap —
 * at RCL3–4 cap is 1, so leaving it is a hard floor that blocks the hub.
 */
function reclaimTile(
  room: Room,
  type: string,
  x: number,
  y: number,
  state: { destroyed: boolean },
  destructionAllowed: boolean,
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
  // Same income guard as migrateInsta. A source box or MY source link
  // squatting a planned tile after a re-plan must stay. Unowned leftover
  // links are not income — they just block the planned box/link tile.
  if (isSourceIncomeStructure(squatter)) return;
  const cheap =
    RECLAIMABLE.indexOf(squatter.structureType) >= 0 ||
    (hubTypeReclaimsTower(type) && squatter.structureType === STRUCTURE_TOWER) ||
    (squatter.structureType === STRUCTURE_LINK && !(squatter as any).my);
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
  if (!destructionAllowed) {
    // placement-only mode (migration not armed/blocked): keep the diagnosis
    // the old ungated path provided, but leave the squatter standing
    if (Game.time % 100 < 15) {
      logAlways(
        `planV2 ${room.name}: ${type}@${x},${y} blocked by off-plan ${squatter.structureType} — ` +
          `migration not active, left standing (migratePlan to arm)`,
      );
    }
    return;
  }
  if (state.destroyed) return; // one reclaim per room per pass
  // reclaim shares the squatter's OWN class budget with migrateClass — same
  // 60-tick timer, same rebuild-confirmation. It is not a side door: without
  // this, a container pass plus a reclaim could retire both source containers
  // in a single tick, the exact failure the 1/pass rule exists to prevent.
  const sqType = squatter.structureType;
  if (!migrateTimerDue(room, sqType)) return;
  if (sqType !== STRUCTURE_ROAD) {
    const pending = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: (s) => s.structureType === sqType,
    }).length;
    if (pending > 0) return;
  }
  if (squatter.structureType === STRUCTURE_TOWER) {
    // migrateInsta already ran this placeFromPlanV2 pass and does not
    // stamp planMigrate[tower], so migrateTimerDue is still true. Do not
    // take the last tower after surplus teardown (2→0 in one tick).
    let myTowers = 0;
    for (const s of room.find(FIND_STRUCTURES) as Structure[]) {
      if (s.structureType === STRUCTURE_TOWER && (s as any).my) myTowers++;
    }
    if (
      !lastTowerReclaimMayDestroy(
        myTowers,
        hubTypeReclaimsTower(type),
        instaDestroyedThisPass(room),
      )
    ) {
      return;
    }
  }
  const res = squatter.destroy();
  migrateTimerStamp(room, sqType);
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
  // one container per pass: a pass that retired both source containers AND the
  // controller container in a single tick stalled the whole mining economy
  [STRUCTURE_CONTAINER]: 1,
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
 * Is the empire mid spawn-rescue? Read from Memory rather than imported from
 * rooms.spawning, which would be a cycle. The keys are that module's own
 * (`spawnRescue` = the pinned room, `_spawnEmergency` = pile every builder on).
 */
function spawnEmergencyActive(): boolean {
  const M = Memory as any;
  if (M.spawnRescue || M._spawnEmergency) return true;
  // Belt and braces: a room of ours standing with no spawn is the condition
  // those flags describe, whether or not they happen to be set this tick.
  for (const rn in Game.rooms) {
    const r = Game.rooms[rn];
    if (r.controller && r.controller.my && r.find(FIND_MY_SPAWNS).length === 0) return true;
  }
  return false;
}

/**
 * THE single gate every DESTRUCTIVE migration action must pass — both
 * runMigration's classes and the placement loop's reclaimTile. Returns null
 * when clear, otherwise the human-readable block reason (surfaced by
 * migrateStatus).
 *
 * Arming: adoption alone never enables demolition on an established room.
 *  - mode "auto"    set at adoption when the room is young (fresh colonies,
 *                   where clearing a bootstrap squatter is the point and there
 *                   is nothing of value to lose)
 *  - mode "gradual" set by console migratePlan(room) — the operator's explicit
 *                   go for reshaping a built room
 * Absent (or after migrateAbort): placement continues, demolition does not.
 */
let migrationGateTick = -1;
const migrationGateCache: { [room: string]: string | null } = {};
function migrationAllowed(room: Room): string | null {
  if (migrationGateTick !== Game.time) {
    migrationGateTick = Game.time;
    for (const k of Object.keys(migrationGateCache)) delete migrationGateCache[k];
  }
  if (room.name in migrationGateCache) return migrationGateCache[room.name];
  const arm = (room.memory as any).planMigration;
  let why: string | null = null;
  if (!arm || (arm.mode !== "gradual" && arm.mode !== "auto")) {
    why = "not armed — migratePlan(room) to arm";
  } else if (arm.mode === "auto" && room.controller && room.controller.level >= 4) {
    // an infancy-era heuristic arm must not follow a room into maturity: from
    // RCL4 the room has storage and a real economy, and demolition needs an
    // operator decision. This is a STATE TRANSITION, not a per-tick veto — a
    // vetoed-but-live arm resurrected the moment a downgrade dipped the level.
    arm.mode = "disarmed";
    (arm as any).reason = "auto arm expired at RCL4";
    logAlways(
      `planV2 ${room.name}: infancy auto-arm expired at RCL${room.controller.level} — ` +
        `migration disarmed; migratePlan("${room.name}") to arm deliberately`,
    );
    why = "auto arm expired (RCL4+) — migratePlan(room) to arm";
  } else if ((room.memory as any).planMigratePaused) {
    why = "paused";
  } else if (arm.mode === "gradual" && room.controller && room.controller.level < 4) {
    // a built room being reshaped must be able to hold its economy through the
    // shuffle; colonies (mode auto) are exempt — they have nothing to hold
    why = "RCL < 4";
  } else if (room.memory.danger) {
    why = "danger";
  } else if (room.find(FIND_HOSTILE_CREEPS).length > 0) {
    // danger can be cleared while hostiles idle out a safe mode; check directly
    why = "hostiles present";
  } else if (Game.cpu.bucket < 3000) {
    why = "bucket < 3000";
  } else if (room.controller) {
    // downgrade risk, scaled to the level's own maximum — a flat 10k floor
    // permanently blocked RCL2 (max 10k) and half-blocked RCL1/3 (max 20k)
    const max = (CONTROLLER_DOWNGRADE as any)[room.controller.level] || 0;
    const floor = Math.min(10000, Math.floor(max / 2));
    if (room.controller.ticksToDowngrade < floor) why = "downgrade risk";
  }
  migrationGateCache[room.name] = why;
  return why;
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
    // N-1 / cap is OUR structures. Hostile leftovers inflate `built` and
    // sit in `off`; farther-first then destroy()s the only owned tower.
    if (!(s as any).my && type !== STRUCTURE_ROAD && type !== STRUCTURE_CONTAINER) continue;
    built++;
    const packed = s.pos.x + s.pos.y * 50;
    if (planTile[packed]) {
      onPlan++;
      continue; // on-plan — never touched
    }
    // Same income guard as migrateInsta / reclaimTile. Farthest-from-hub
    // ranking would retire off-plan source boxes / source links first.
    if (isSourceIncomeStructure(s)) continue;
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
  const planned = plannedTilesFor(plan, type, lvl, room);
  if (!planned || !planned.length) return;
  if (!migrateTimerDue(room, type)) return;

  const isRoad = type === STRUCTURE_ROAD;
  const cap = isRoad
    ? planned.length
    : (CONTROLLER_STRUCTURES as any)[type]
      ? (CONTROLLER_STRUCTURES as any)[type][lvl] || 0
      : planned.length;
  if (!cap) return;

  // ON-PLAN IS DECIDED AGAINST THE FULL PLAN ARRAY, NOT THE BUILD SCHEDULE.
  //
  // `planned` above is what placement is allowed to SITE at this RCL, and for
  // extensions that is deliberately less than the engine cap: extensionTake
  // holds RCL<=3 at 5 of the 10 CONTROLLER_STRUCTURES allows (speedrun rule).
  // A build schedule is not a demolition whitelist. A room that stood all 10 up
  // at RCL4 and then downgraded to RCL3 still has 10 extensions on plan tiles;
  // reading the 5 that fell out of the schedule as squatters is what let
  // migrateClass prune a legitimately built class 3 per pass down to
  // `effCap - perPass` = 2. rankOffPlan's own `anyPlanTile` has always used the
  // untrimmed arrays, so this also makes the two agree.
  //
  // THIS IS WHERE A NON-MONOTONE SCHEDULE TURNS INTO A DEMOLITION: a planned
  // tile that drops out of `planTile` between two RCLs makes rankOffPlan read
  // the finished structure standing on it as a squatter, and container is in
  // FREE_REPLACE. Capping the FULL array by `cap` removes the whole class of
  // that bug: the on-plan set is now a non-decreasing function of the level for
  // every type, because `cap` is itself non-decreasing.
  //
  // Roads are the exception to the cap, not to the array: their whole list is
  // planned and the RCL budget only says which prefix gets built FIRST, so a
  // road at index 90 is on-plan and must never be read as a squatter.
  const allPlanned = plan.t[type] || planned;
  const limit = isRoad ? allPlanned.length : Math.min(cap, allPlanned.length);
  const planTile: { [p: number]: boolean } = {};
  for (let i = 0; i < limit; i++) planTile[allPlanned[i]] = true;

  // `wanted` stays on the SCHEDULE: it answers "how much of this class will
  // placement actually rebuild if I destroy something now?", and placement only
  // ever sites `planned`.
  const placed = have[type] || {};
  const wantLimit = Math.min(cap, planned.length);
  let wanted = 0;
  for (let i = 0; i < wantLimit; i++) if (!placed[planned[i]]) wanted++;

  // REBUILD-CONFIRMED batching (spec I3): a construction site is a promise,
  // not a rebuild. While any site of this class is pending, the previous
  // batch has not been paid back and no further batch may be destroyed —
  // otherwise a starved builder economy lets capacity ratchet down 3 per
  // minute with nothing coming back. Roads exempt: they are cheap, their
  // sites linger by design, and stalling on them would freeze the class.
  // Runs BEFORE the off-plan ranking so the stall bookkeeping is also
  // CLEANED even on passes with nothing left to destroy (gauntlet r4).
  if (!isRoad) {
    const pendingSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: (site) => site.structureType === type,
    });
    const timers = room.memory.planMigrate || (room.memory.planMigrate = {});
    const stallKey = "sites:" + type;
    if (pendingSites.length > 0) {
      if (!timers[stallKey]) timers[stallKey] = Game.time;
      // A rebuild that has not finished after 3000 ticks is a stalled builder
      // economy or an unreachable planned tile. Removing the site does NOT
      // help — placement re-sites the identical plan tile the next pass, and
      // the remove/re-site cycle just opened a destroy window every 3000
      // ticks (gauntlet r3). So: freeze LOUDLY and stay frozen. The class
      // resumes the moment the sites finish or the operator intervenes.
      if (Game.time - timers[stallKey] > 3000) {
        noteOnce(
          room,
          `sites-stalled:${type}`,
          `planV2 ${room.name}: ${type} migration FROZEN — site(s) at ` +
            pendingSites.map((s) => `${s.pos.x},${s.pos.y}`).join(" ") +
            ` unbuilt for >3000 ticks. Check the builder economy or reachability; ` +
            `remove the site(s) by hand if the tile is unbuildable.`,
        );
      }
      return;
    }
    delete timers[stallKey];
    delete (room.memory.planMigrateLog || {})[`sites-stalled:${type}`];
  }

  const ranked = rankOffPlan(room, type, planTile, plan, structures);
  if (!ranked.off.length) return;

  const force = !!(room.memory as any).planMigration && (room.memory as any).planMigration.force;
  const rich = force || migrationEnergy(room) > MIGRATE_ENERGY;
  let candidates = ranked.off;
  let reason = "";
  let floorHeadroom = Infinity;
  let hubSwap = false;

  if (type === STRUCTURE_TOWER) {
    const hubBlockers = ranked.off.filter((c) =>
      towerOccupiesPlannedHub(c.s.pos.x + c.s.pos.y * 50, plan),
    );
    if (hubBlockers.length) {
      // Last-tower is a swap when it occupies planned storage/spawn.
      // At RCL3–4 cap is 1: N-1 is a hard floor, reclaimTile skipped towers,
      // placement skipped the type at cap — hub never sited until RCL5.
      candidates = hubBlockers.slice(0, 1);
      reason = "last-tower swap — occupies planned hub";
      hubSwap = true;
    } else {
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
    }
  } else if (FREE_REPLACE[type] && rich) {
    if (!isRoad) {
      // plannedBatchFloor (spec I3, the REAL one): the built count may never
      // sink more than one batch below the effective cap, regardless of what
      // starves the rebuild. The pending-sites check alone passed vacuously
      // when the site budget was eaten by rampart sites — live E37N59 went
      // 40 -> 19 extensions with zero sites ever placed.
      // The floor is the RCL's OWN cap, not the current build schedule.
      // `Math.min(cap, planned.length)` read the trimmed schedule and so put
      // the RCL3 extension floor at 5-3 = 2 while the engine allows 10 — the
      // floor is supposed to stop the class sinking, not authorise it. Use the
      // untrimmed plan array: for every type the plan can actually fill, this
      // is CONTROLLER_STRUCTURES[type][lvl].
      const effCap = Math.min(cap, allPlanned.length);
      if (ranked.built <= effCap - perPass) return;
      floorHeadroom = ranked.built - (effCap - perPass);
    }
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

  if (type === STRUCTURE_CONTAINER || type === STRUCTURE_LINK) {
    candidates = candidates.filter((c) => !isSourceIncomeStructure(c.s));
    if (!candidates.length) return;
  }

  let take = Math.min(perPass, candidates.length);
  // wanted === 0 means placement has nothing left to site for this class at
  // this RCL, so anything destroyed now is capacity that does not come back.
  // The tower and poor-room branches already return on it; `wanted > 0` here
  // silently did NOT bind, which is the second half of the RCL3 extension bug
  // (schedule full at 5, wanted 0, take stays at perPass).
  //
  // Roads are exempt on purpose: their whole array is the plan, so wanted === 0
  // is the FINISHED state, and retiring the legacy interior lines is exactly
  // what is left to do at that point.
  if (!wanted && !isRoad && !hubSwap) return;
  if (wanted > 0) take = Math.min(take, wanted);
  if (floorHeadroom !== Infinity) take = Math.min(take, floorHeadroom);
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
    // Fresh claim with a leftover/colonise spawn off the plan: keeping it
    // until RCL7 means the plan spawn can never site (cap 1). E39N58.
    // force: operator said delete the old bunker — same cap-1 hole.
    const young = lvl <= 3 && !room.storage;
    const force = !!(room.memory as any).planMigration && (room.memory as any).planMigration.force;
    let empireSpawns = 0;
    for (const rn in Game.rooms) {
      const rr = Game.rooms[rn];
      if (rr.controller && rr.controller.my) empireSpawns += rr.find(FIND_MY_SPAWNS).length;
    }
    if ((young || force) && off.length && !onPlan.length && empireSpawns > 1) {
      // One last-spawn retire per tick, and never while another owned room
      // is already spawnless. Without this, four hub-armed rooms each saw
      // empireSpawns > 1 and 4 hatcheries became 1 in a single pass.
      const m: any = Memory;
      if (m._hubSpawnRetireTick === Game.time) return;
      let otherSpawnless = false;
      for (const rn in Game.rooms) {
        if (rn === room.name) continue;
        const rr = Game.rooms[rn];
        if (rr.controller && rr.controller.my && rr.find(FIND_MY_SPAWNS).length === 0) {
          otherSpawnless = true;
          break;
        }
      }
      if (otherSpawnless) return;
      const only = off[0];
      if (only.my && !only.spawning) {
        m._hubSpawnRetireTick = Game.time;
        const res = only.destroy();
        logAlways(
          `planV2 ${room.name}: retired off-plan only spawn@${only.pos.x},${only.pos.y} ` +
            `destroy() ${res} — RCL${lvl} cap is 1, plan spawn cannot site beside it`,
        );
        const tile = plannedSpawnTile(room);
        if (tile) {
          const m: any = Memory;
          m.target_colonise = {
            room: room.name,
            spawn_pos: { x: tile.x, y: tile.y, roomName: room.name },
            lastSpawnRanger: Game.time,
          };
        }
        return;
      }
    }
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
    // the replacement is not up (or not functioning) yet — placement builds it.
    // But if EVERY spawn slot is taken by an off-plan spawn, placement can
    // never site the plan's spawn and this would wedge silently: say so once.
    const spawnCap = ((CONTROLLER_STRUCTURES as any)[STRUCTURE_SPAWN] || {})[lvl] || 0;
    if (!onPlan.length && spawns.length >= spawnCap) {
      noteOnce(
        room,
        "spawn:capped",
        `planV2 ${room.name}: all ${spawns.length} spawns are off-plan and the RCL${lvl} cap (${spawnCap}) ` +
          `leaves no slot for the plan's spawn — deferred until RCL8 frees a slot, or retire one off-plan spawn by hand.`,
      );
    }
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

    const forceHub = !!(room.memory as any).planMigration && (room.memory as any).planMigration.force;
    if (lvl < HUB_MIGRATE_RCL && !forceHub) {
      noteOnce(
        room,
        `hub:${cls}:rcl`,
        `planV2 ${room.name}: off-plan ${cls}@${legacy.pos.x},${legacy.pos.y} — migration deferred ` +
          `below RCL${HUB_MIGRATE_RCL}; a room this young cannot afford to rebuild its hub.`,
      );
      continue;
    }

    if (cap < 2) {
      const force = !!(room.memory as any).planMigration && (room.memory as any).planMigration.force;
      if (force && used < 20000) {
        const res = legacy.destroy();
        logAlways(
          `planV2 ${room.name}: FORCE retire off-plan ${cls}@${legacy.pos.x},${legacy.pos.y} ` +
            `destroy() ${res} (spilled ${used})`,
        );
        continue;
      }
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

/**
 * Structures an ALIGN pass must never retire, however off-plan they are.
 *
 * A spawn, a storage and a terminal are not "a structure in the wrong place" —
 * they are the room's ability to function, they cost 15k/30k/100k to replace,
 * and destroy() spills whatever is inside them onto the floor. Everything else
 * in a base is cheap and re-sitable, which is what makes wiping it safe.
 *
 * `migrateInsta`'s only protection used to be "never the LAST spawn in the
 * empire", which is not a safety rule — it let a four-spawn empire go to one,
 * one room at a time, because each room's pass saw more than one still standing.
 * Live shard3 lost three spawns and three storages to exactly that.
 */
const ALIGN_NEVER_RETIRE: { [type: string]: boolean } = {
  [STRUCTURE_SPAWN]: true,
  [STRUCTURE_STORAGE]: true,
  [STRUCTURE_TERMINAL]: true,
};

/**
 * How often a force/align arm re-sweeps once a pass found nothing to remove.
 *
 * migrateInsta is a bulk wipe: it builds a map of every planned tile and walks
 * every structure in the room. That is fine as a one-off, and ruinous as a
 * per-tick habit — which is what it became, because an align arm stays armed
 * after the room is aligned and nothing told it to stop looking. Four armed
 * rooms re-scanning ~200 structures each, every tick, pushed live shard3 from
 * ~14 CPU to 26.5 against a limit of 20 and drained the bucket 7645 -> 6198
 * with every room already reporting zero off-plan.
 *
 * So: sweep every tick while it is still finding work, and back off to this
 * interval once it is not. A newly off-plan structure is noticed within the
 * interval, which is far faster than anything that could create one.
 */
const INSTA_IDLE_EVERY = 25;

/** Operator FORCE: wipe every off-plan structure this tick (capped for CPU).
 *  Roads and unowned containers included. With `keepCritical` (the default for
 *  an align-mode arm) spawns, storage and terminals are left standing —
 *  retiring those is the hub protocol's job, and only when explicitly asked. */
function migrateInsta(room: Room, plan: PackedPlan, structures: Structure[], keepCritical?: boolean): void {
  // Back off once a pass finds nothing. See INSTA_IDLE_EVERY.
  const mem = room.memory as any;
  if (mem._instaIdleSince && Game.time - mem._instaIdleSince < INSTA_IDLE_EVERY) return;
  const wanted: { [packed: number]: { [type: string]: boolean } } = {};
  const mark = (type: string, packed: number) => {
    if (!wanted[packed]) wanted[packed] = {};
    wanted[packed][type] = true;
  };
  for (const type of Object.keys(plan.t)) {
    if (type === "labInput") continue;
    const asType = type === "shellCut" ? STRUCTURE_RAMPART : type;
    for (const p of plan.t[type] || []) mark(asType, p);
  }
  let empireSpawns = 0;
  for (const rn in Game.rooms) {
    const rr = Game.rooms[rn];
    if (rr.controller && rr.controller.my) empireSpawns += rr.find(FIND_MY_SPAWNS).length;
  }
  let myTowers = 0;
  for (const t of structures) {
    if (t.structureType === STRUCTURE_TOWER && (t as any).my) myTowers++;
  }
  const MAX = 20;
  let n = 0;
  for (const s of structures) {
    if (n >= MAX) break;
    if (s.structureType === STRUCTURE_CONTROLLER) continue;
    const mine = !!(s as any).my;
    if (
      !mine &&
      s.structureType !== STRUCTURE_ROAD &&
      s.structureType !== STRUCTURE_CONTAINER &&
      s.structureType !== STRUCTURE_LINK
    ) {
      continue;
    }
    const packed = s.pos.x + s.pos.y * 50;
    if (wanted[packed] && wanted[packed][s.structureType]) continue;
    if (keepCritical && ALIGN_NEVER_RETIRE[s.structureType]) continue;
    // Source boxes AND source links are income. Align used to delete an
    // off-plan source link (energyMiner range 2) as furniture; RCL5+ then
    // had no dump target. An empty storage used to make the container
    // skip miss. Both stay.
    if (isSourceIncomeStructure(s)) continue;
    // Same guard gradual migrateClass uses. isExteriorTile fail-opens to
    // false when interior is unusable, so "skip if exterior" alone would
    // DELETE remotes. Refuse every road unless the classifier is ready.
    if (s.structureType === STRUCTURE_ROAD &&
        (!interiorReady(room) || isExteriorTile(room, s.pos.x, s.pos.y))) continue;
    // Gradual never retires the last tower unless it occupies the planned
    // hub (storage/spawn/terminal). Align used to delete every off-plan
    // tower in one tick (the hub-move incident). After surplus teardown
    // the hub-swap exception must not also take that last tower this pass.
    if (
      s.structureType === STRUCTURE_TOWER &&
      !lastTowerInstaMayDestroy(myTowers, towerOccupiesPlannedHub(packed, plan), n)
    ) {
      continue;
    }
    if (s.structureType === STRUCTURE_SPAWN) {
      if (empireSpawns <= 1) continue;
      if ((s as StructureSpawn).spawning) continue;
      // A room's OWN last spawn is its ability to exist. The empire-wide test
      // above does not protect it — that is what let 4 spawns become 1.
      if (room.find(FIND_MY_SPAWNS).length <= 1) continue;
    }
    if (s.destroy() === OK) {
      n++;
      if (s.structureType === STRUCTURE_SPAWN) empireSpawns--;
      if (s.structureType === STRUCTURE_TOWER) myTowers--;
    }
  }
  mem._instaPass = Game.time;
  mem._instaN = n;
  if (n) {
    delete mem._instaIdleSince;
    logAlways(`planV2 ${room.name}: INSTA removed ${n} off-plan`);
  } else {
    mem._instaIdleSince = Game.time;
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
  const arm = (room.memory as any).planMigration;
  if (arm && arm.force) {
    /*
     * ALIGN vs HUB — one flag used to mean both, and that is what wrecked live
     * shard3. `force` bypassed the 20k-storage gate AND retired spawns, storage
     * and terminals, with no way to ask for the first without the second. An
     * owner who wants "delete everything that is not in the plan" means the
     * cheap, re-sitable furniture; they do not mean "retire the spawn", which
     * costs 15k to rebuild and takes the room offline while it does.
     *
     * So arm.hub is now a SEPARATE opt-in. Without it this is an align pass:
     * aggressive about extensions, containers, roads and towers, and it will
     * not touch the three structures a room cannot function without.
     */
    const wantHub = !!arm.hub;
    // Align with no storage standing: HOLD, do not sweep. Further insta
    // passes on a bankless room only delete leftover income, which is how a
    // forced migrate kept a four-room empire broke after the hubs were
    // already down. This used to write a "disarmed" TOMBSTONE — a gate the
    // room could never escape (nothing re-arms a tombstoned room), which is
    // the docs/STARVATION-TRAPS.md shape exactly: two VPS rooms sat armed-off
    // forever after losing their storages. Now the arm STAYS and the pass
    // simply skips; the moment placement re-sites the storage and it stands,
    // alignment resumes on its own. Hub-mode still means "I know, keep going."
    if (!wantHub && !room.storage && room.find(FIND_MY_SPAWNS).length > 0) {
      // migrateStatus verdict comes from the arm, so leave a visible note
      // instead of lying ACTIVE while holding (the 9f44d7b lesson).
      noteOnce(room, "broke-align", "align HOLDS (by: broke-align guard): no storage — resumes when the bank stands again");
      return;
    }
    /*
     * An ALIGN arm runs immediately, including during a spawn rescue.
     *
     * This deliberately does NOT wait. Holding was the cautious choice — every
     * structure retired here is one the surviving spawn pays to replace out of
     * the same budget the rescue is spending — and the owner overrode it
     * explicitly, twice, having seen the cost. `migrateInsta` still protects
     * spawns, storage and terminals (keepCritical, below), and construction
     * sites are not structures, so an in-flight spawn SITE cannot be destroyed
     * by this path either. What it does cost is extensions: a room mid-rescue
     * will hatch smaller creeps for a while after its off-plan extensions come
     * down and before the on-plan ones are built.
     *
     * `migrateAbort(room)` stands any of this down in one command.
     */
    migrateInsta(room, plan, structures, !wantHub);
    if (wantHub) {
      migrateSpawns(room, plan, lvl, structures);
      migrateHub(room, plan, lvl, structures);
    }
    return;
  }
  // every reason NOT to demolish — arming, danger, hostiles, bucket,
  // downgrade risk, pause — lives in migrationAllowed, shared with the
  // placement loop's reclaimTile so no destruction path can bypass it
  if (migrationAllowed(room) !== null) return;
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

  // INCOME RAMPARTS. The SOURCE LINK and the miner seat in front of it usually
  // stand outside the shell, naked, and older planner builds never bubbled
  // them. The CURRENT offline planner prices and bubbles those works itself,
  // so this derivation is now (a) the FALLBACK for plans baked by an older
  // planner and (b) gated on the planner's own exposure rule — a seat/link
  // owes a rampart only when it is outside the min-cut shell or within
  // chebyshev 4 of the exterior — so a deep-enclosed source is not ramparted
  // twice, and one the planner deliberately left bare (minimum ramparts is the
  // objective) does not get bubbled behind its back.
  //
  // Whatever survives the gate is appended to the plan's own rampart set: from
  // that moment placement sites them (RCL4+), alignment treats them as PLAN
  // tiles, isSanctionedRampart() approves them (the miner's build-a-rampart-
  // under-the-link check was being VETOED by sanctioning on planV2 rooms), and
  // the RCL7 miners keep them repaired. incomeRampartAdds returns only MISSING
  // tiles, so this is idempotent across the endless resync.
  try {
    const terrain = room.getTerrain();
    const isWall = (x: number, y: number) => terrain.get(x, y) === TERRAIN_MASK_WALL;
    const adds = incomeRampartAdds(
      plan.t as any,
      room.find(FIND_SOURCES).map((s: any) => ({ x: s.pos.x, y: s.pos.y })),
      isWall,
      shellExposure(plan.t.shellCut || [], isWall),
    );
    if (adds.length) {
      plan.t.rampart = (plan.t.rampart || []).concat(adds);
      logAlways(`planV2 ${room.name}: +${adds.length} income rampart(s) (source link + miner seat)`);
    }
  } catch (e) {
    logAlways(`planV2 ${room.name}: income-rampart derive threw:`, (e && (e as any).stack) || e);
  }

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
    // CONTRACT: rampartLocations = shell tiles STILL MISSING A RAMPART. Empty
    // means the shell is finished (Guard.ts only promotes Guard ->
    // RampartDefender on an empty list). The legacy writer in utils/Perimeter
    // publishes the whole ring instead and is a no-op on planV2 rooms for
    // exactly that reason.
    //
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
  // Spawn mismatch used to freeze placement (and construction.ts used to
  // strip the pack). Owner rule is the pack wins: keep siting the new
  // layout; migrateSpawns/migrateHub retire the old bunker.
  const lvl = room.controller.level;

  // SPAWN FIRST (see spawnFirstLockdown). Runs before anything else in this
  // function so the slots the stray sites were holding are handed straight back
  // to the spawn on this same pass.
  const spawnless = spawnFirstLockdown(room);
  // Leftover / previous-owner spawns. destroy() only lands if we own them
  // or they are unowned; either way try so the engine cap can free.
  for (const s of room.find(FIND_STRUCTURES, {
    filter: (x: Structure) => x.structureType === STRUCTURE_SPAWN && !(x as StructureSpawn).my,
  })) {
    const res = s.destroy();
    if (res === OK) {
      logAlways(`planV2 ${room.name}: destroyed foreign/unowned spawn@${s.pos.x},${s.pos.y}`);
    }
  }

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
  let liveSites = 0;
  for (const s of sites) {
    if (spawnless) {
      if (s.structureType === STRUCTURE_SPAWN) liveSites++;
    } else if (s.structureType !== STRUCTURE_RAMPART || lvl >= 6) {
      // RCL4-5: rampart sites stay off this budget so a new shell does not
      // starve extensions (E37N59). RCL6+ they count — otherwise 8 roads +
      // N ramparts bleed the bank.
      liveSites++;
    }
  }
  // Live E36N57: 31 rampart sites on an already-standing box. Off-budget
  // is not a blank cheque — keep a handful so builders can walk the wall.
  let rampartSites = 0;
  for (const s of sites) if (s.structureType === STRUCTURE_RAMPART) rampartSites++;
  if (rampartSites > 4) {
    let extra = rampartSites - 4;
    for (const s of sites) {
      if (extra <= 0) break;
      if (s.structureType !== STRUCTURE_RAMPART) continue;
      s.remove();
      extra--;
    }
  }
  const brokeFloor = lvl >= 8 ? 150000 : lvl >= 7 ? 80000 : 30000;
  const brokeBank =
    lvl >= 6 &&
    !!room.storage &&
    room.storage.my &&
    (room.storage.store[RESOURCE_ENERGY] || 0) < brokeFloor;
  // Spawnless stays on the spawn-first slot; do not spend it on shell tiles.
  const nakedShell = !spawnless && brokeBank && isShellNaked(room, structures);
  let budget = maxSitesFor(lvl, room, structures) - liveSites;
  // Broke established room: drop every site except spawn. Labs/nuker/roads
  // kept draining VPS W1N1 after the road/rampart-only strip.
  // Naked shell: keep road/rampart sites so the 2-slot exception can rebuild.
  //
  // `budget < 0`, NOT `<= 0`, for spawnless/naked-shell: a budget of exactly
  // zero is their steady state (1 or 2 typed slots). Incomplete-core's 2
  // slots are untyped — leftover lab/nuker/RCL6+ rampart sites at budget===0
  // must still strip so the missing extensions/towers can site.
  const coreIncomplete =
    !spawnless && !nakedShell && coreBuildoutIncomplete(lvl, structures);
  if (brokeBank && brokeBankStripFires(budget, nakedShell, coreIncomplete)) {
    let dripKept = 0;
    for (const s of sites) {
      if (s.structureType === STRUCTURE_SPAWN) continue;
      if (s.structureType === STRUCTURE_STORAGE) continue;
      if (s.structureType === STRUCTURE_LINK || s.structureType === STRUCTURE_CONTAINER) continue;
      if (s.structureType === STRUCTURE_TOWER || s.structureType === STRUCTURE_EXTENSION) continue;
      if (nakedShell && (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_ROAD)) {
        continue;
      }
      // The road drip survives the strip (see ROAD_DRIP): 2x300e of haul
      // efficiency is not the "site flood" this strip exists to stop, and
      // removing what the drip just placed would churn a site per pass.
      if (s.structureType === STRUCTURE_ROAD && dripKept < ROAD_DRIP) {
        dripKept++;
        continue;
      }
      s.remove();
    }
  }
  // brokeBank already requires a standing my storage. A bankE<1000 strip
  // cannot free a storage slot; it only remove()d the road/rampart sites
  // the naked-shell exception just preserved.
  // existing structures + sites by type (containers/roads are unowned)
  const have: { [type: string]: { [packed: number]: boolean } } = {};
  const count: { [type: string]: number } = {};
  const occupy = (type: string, x: number, y: number) => {
    (have[type] = have[type] || {})[x + y * 50] = true;
  };
  const note = (type: string, x: number, y: number) => {
    occupy(type, x, y);
    count[type] = (count[type] || 0) + 1;
  };
  // Tile occupancy is everyone (do not site on a leftover spawn). Engine
  // cap is OUR structures only — counting a foreign spawn as existing
  // skipped t.spawn[0] forever (E39N58).
  for (const s of structures) {
    occupy(s.structureType, s.pos.x, s.pos.y);
    const mine = !!(s as any).my;
    const shared =
      s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER;
    if (mine || shared) note(s.structureType, s.pos.x, s.pos.y);
  }
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
  //
  // An explicit ALIGN arm is the exception, and it has to be, or the rule reads
  // as "the bot refuses to do what it was told". Live E36N57 was spawnless and
  // carrying TWO rings of rampart — its own old square wall plus the new
  // min-cut shell — and reported ACTIVE while this gate silently skipped it
  // entirely. The owner could see it in the client and the bot would not touch
  // it. Critical structures are still protected inside migrateInsta, and the
  // spawn SITE is a construction site rather than a structure, so the rebuild
  // this gate was written to defend cannot be destroyed by that path.
  const alignArm = (room.memory as any).planMigration;
  if (!spawnless || (alignArm && alignArm.force)) {
    runMigration(room, plan, lvl, structures, have);
  }

  // THE ROAD DRIP — before the budget gate, because the budget is exactly
  // what starves roads: containers+extensions hold all 8 slots at RCL4-5 and
  // the broke clamp leaves 0-2 at RCL6+, so entire rebuild eras passed with
  // zero road sites in any room. Up to ROAD_DRIP road sites stand at all
  // times (staged order, so arterials first); the broke strip above keeps the
  // same number, so place-and-strip cannot churn.
  if (lvl >= 3 && !spawnless && !nakedShell) {
    let roadSitesNow = 0;
    for (const s of sites) if (s.structureType === STRUCTURE_ROAD) roadSitesNow++;
    let drip = ROAD_DRIP - roadSitesNow;
    if (drip > 0) {
      const stagedRoads = roadsForRcl(plan, plannedTilesFor(plan, "road", lvl, room), lvl);
      const placedRoad = have["road"] || {};
      for (const p of stagedRoads) {
        if (drip <= 0) break;
        if (placedRoad[p]) continue;
        if (room.createConstructionSite(p % 50, Math.floor(p / 50), STRUCTURE_ROAD) === OK) {
          placedRoad[p] = true;
          drip--;
        }
      }
    }
  }

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
    // Naked-shell budget is road+rampart only — never labs/nuker/terminal.
    if (nakedShell && type !== "road" && type !== "rampart") continue;
    // Roads are the one type whose ARRAY is trimmed rather than capped: the
    // RCL selection is a staged subsequence, not a prefix (see roadsForRcl), so
    // the loop below must iterate the selection itself.
    const planned =
      type === "road"
        ? roadsForRcl(plan, plannedTilesFor(plan, type, lvl, room), lvl)
        : plannedTilesFor(plan, type, lvl, room);
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
      // Cover waits for the thing it covers. Naked-shell budget prefers the wall.
      if (type === "rampart" && plannedOccupancy[packed] && (nakedShell || !builtOn[packed])) continue;
      const { x, y } = unpack(packed);
      if (type === "spawn") clearPlanSpawnTile(room, x, y);
      const res = room.createConstructionSite(x, y, type as BuildableStructureConstant);
      if (res === OK) {
        existing++;
        budget--;
      } else if (res === ERR_INVALID_TARGET) {
        // reclaim destruction passes the same gate as runMigration (it used to
        // bypass danger/pause/arming entirely); when blocked it still LOGS the
        // squatter so a soft-bricked placement stays visible
        if (!SHARES_TILE[type]) reclaimTile(room, type, x, y, state, migrationAllowed(room) === null);
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
      } else if (res === ERR_FULL) {
        // The 100-site cap is global to the shard, not per type or per room, so
        // every remaining intent this pass is already doomed: a capped room used
        // to fire ~300 of them silently. Say it once and stop the whole pass.
        logAlways(`planV2 ${room.name}: construction sites full, stopping at ${type}@${x},${y}`);
        budget = 0;
        break;
      } else {
        logAlways(`planV2 ${room.name}: site ${type}@${x},${y} err ${res}`);
      }
    }
  }
}
