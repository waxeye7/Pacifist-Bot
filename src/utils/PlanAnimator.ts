/**
 * PlanAnimator — replay the offline base planner's thinking as RoomVisuals.
 *
 * The offline exporter (tools/plan-suite/v2/export-anim.mjs) flattens the
 * planner stages into ordered STEPS; tools/server/push-anim.mjs writes them
 * into RawMemory segments (index in 89, data in 90..99). This plays them back
 * one step per tick, folding each step into a per-tile picture so earlier
 * stages stay painted underneath and the two stages that DELETE tiles actually
 * delete them (see FOLD_OPS).
 *
 * Console:
 *   animPlan("E2S7")             start (after push-anim.mjs) — 1 step/tick, LOOPS
 *   animPlan("E2S7", 3)          3 steps per tick
 *   animPlan("E2S7", 0.2)        1 step every 5 ticks (private servers run fast)
 *   animPlan("E2S7", 1, false)   play once, then stop
 *   animStop()
 *
 * Looping is the DEFAULT: a private server replays 135 steps in a few seconds,
 * so a one-shot run is over long before anyone opens the room. After the final
 * frame is held for HOLD_TICKS the cursor resets to step 0 and the loop counter
 * shown in the progress line ticks up.
 *
 * Memory holds only the tiny cursor. The parsed frames live on the heap —
 * putting ~40KB of cells in Memory would cost more CPU per tick than the
 * whole bot.
 */
import { logAlways } from "utils/Logger";

const INDEX_SEGMENT = 89;
/** Steps stay on screen this long after the last one lands. */
const HOLD_TICKS = 100;
/** A room is 50x50, and the fold below holds at most one entry per tile. */
const ROOM_TILES = 2500;
/** Never paint more than this many rects in one tick. */
const MAX_CELLS = ROOM_TILES;

/**
 * ---------------------------------------------------------------------------
 * THE FILM IS NOT APPEND-ONLY, SO THE PLAYER CANNOT BE EITHER.
 *
 * Two stages take something BACK: layer 7's dead-end road prune (`roadsPrune`)
 * and layer 6's relocation pass vacating the shallow extension slots it took
 * (`extMove`). The browser player gives them the kinds '#unroad' and '#unghost'
 * and clearRect()s the tile (tools/plan-suite/v2/plan.mjs STAGE_KIND), which is
 * what keeps its last frame equal to the shipped plan.
 *
 * This file used to repaint steps [from..upTo] with one identical `vis.rect`
 * per cell and no stage dispatch at all, so a prune step painted RED SQUARES ON
 * TOP of the roads it was supposed to delete. The in-game "final frame" was the
 * shipped plan PLUS every pruned ghost road PLUS a prune marker over each one:
 * E16S1 kept 6 ghost roads, E11S7 kept 18 (counted off the roadsPrune cells in
 * out-v2/anim/*.json — 1914 pruned tiles across the 203 shipped films). Same
 * payload, same fidelity claim, two different pictures.
 *
 * The payload gives us no way to ASK which stages erase: meta ships
 * stageOrder / stageRates / stageScaffold and no kind map at all (verified over
 * out-v2/anim/*.json). So the two names are repeated here, deliberately as data
 * rather than as an `if (stage === "roadsPrune")`, and the road stages are
 * recognised by their "roads" prefix the same way the browser recognises them
 * by kind — of the 19 stage names the shipped films use, only the seven road
 * stages start with "roads".
 *
 * SCOPE MATTERS, and this is why the erase is not a plain delete. '#unroad'
 * clears the ROADS canvas; a rampart on the same tile lives on another canvas
 * and survives. 9 pruned tiles across the 203 films carry a planned rampart
 * (E12S7 23,24 · E15S1 15,19 · E16S2 22,30 · E19S4 31,39 · E19S8 35,35 ·
 * E21S7 8,28 among them), and `ramparts` paints AFTER `roads`, so an unscoped
 * delete would rub out a rampart the plan keeps. The fold therefore remembers
 * whether the colour now on a tile came from a road stage, and only a road
 * gets pruned.
 *
 * The extension ghosts get their own tiny layer for exactly the reason the
 * browser gives them their own canvas: three ghost origins are ROADS in the
 * shipped plan (E12S6 24,3 · E18S5 5,35 · E2S3 36,21), so erasing a ghost out
 * of the main fold would lift a road the plan keeps. No film in out-v2/anim
 * carries extGhost/extMove yet — the exporter emits them, the 203 films on disk
 * predate it — so this half is written to the exporter, not to the data.
 * ---------------------------------------------------------------------------
 */
type FoldOp = { ghost?: boolean; erase?: boolean };
const FOLD_OPS: { [stage: string]: FoldOp } = {
  roadsPrune: { erase: true },
  extGhost: { ghost: true },
  extMove: { ghost: true, erase: true },
};

export interface PlanAnimStep {
  stage: string;
  label: string;
  /** flat triplets: x, y, colorIndex, x, y, colorIndex, ... */
  cells: number[];
}

export interface PlanAnimData {
  room: string;
  format: string;
  palette: { [index: string]: string };
  /** additive since the exporter shipped it; older films have none */
  meta?: {
    stageOrder?: string[];
    stageRates?: { [stage: string]: number };
    /** "thinking" output, not part of the base — dimmed, never hidden */
    stageScaffold?: { [stage: string]: boolean };
  };
  steps: PlanAnimStep[];
}

/**
 * The painted state of the room after steps 0..upTo, one entry per TILE.
 *
 * `tiles[packed]` is the palette index PLUS ONE (0 = nothing painted), `road`
 * marks the tiles whose current colour came from a road stage, `scaff` marks
 * the ones that came from a scaffold stage, and `ghost` is the handful of
 * extension ghosts. Typed arrays rather than an object: the render loop walks
 * all 2500 slots every tick and this keeps it free of string keys and garbage.
 */
interface PlanAnimFold {
  /** last step folded in — the cache key */
  upTo: number;
  tiles: Int16Array;
  road: Uint8Array;
  scaff: Uint8Array;
  ghost: { [packed: number]: number };
}

interface PlanAnimIndex {
  room: string;
  segments: number[];
  totalLen: number;
}

export interface PlanAnimState {
  room: string;
  step: number;
  /** steps per tick; may be fractional (0.2 = one step every 5 ticks) */
  speed: number;
  active: boolean;
  /** "index" -> read segment 89 · "data" -> read 90.. · "play" -> draw */
  phase: "index" | "data" | "play";
  segments?: number[];
  /** ticks the final frame has been held */
  held?: number;
  /** fractional-speed carry */
  acc?: number;
  /** restart from step 0 after the final-frame hold instead of stopping */
  loop?: boolean;
  /** completed passes, shown as "LOOP n" */
  loops?: number;
}

const g = global as any;

/** Heap cache — survives ticks, dies with the isolate, never touches Memory. */
function heap(): { room?: string; data?: PlanAnimData; fold?: PlanAnimFold } {
  if (!g.__planAnim) g.__planAnim = {};
  return g.__planAnim;
}

function state(): PlanAnimState | undefined {
  return Memory.planAnim as PlanAnimState | undefined;
}

function stop(reason?: string): void {
  const s = state();
  if (s) s.active = false;
  if (reason) logAlways(`animPlan: ${reason}`);
}

/** Segments requested this tick only become readable next tick. */
function request(segments: number[]): void {
  RawMemory.setActiveSegments(segments.slice(0, 10));
}

function readIndex(s: PlanAnimState): boolean {
  const raw = RawMemory.segments[INDEX_SEGMENT];
  if (!raw) {
    request([INDEX_SEGMENT]);
    return false;
  }
  let index: PlanAnimIndex;
  try {
    index = JSON.parse(raw) as PlanAnimIndex;
  } catch (e) {
    stop(`segment ${INDEX_SEGMENT} is not valid JSON — run push-anim.mjs`);
    return false;
  }
  if (!index || !index.segments || !index.segments.length) {
    stop(`segment ${INDEX_SEGMENT} has no data segments`);
    return false;
  }
  if (index.room !== s.room) {
    stop(`segment ${INDEX_SEGMENT} holds ${index.room}, not ${s.room} — re-push`);
    return false;
  }
  s.segments = index.segments;
  s.phase = "data";
  request(index.segments);
  return false; // data lands next tick
}

function readData(s: PlanAnimState): boolean {
  const segments = s.segments || [];
  let raw = "";
  for (const seg of segments) {
    const part = RawMemory.segments[seg];
    if (part === undefined) {
      request(segments);
      return false;
    }
    raw += part;
  }
  let data: PlanAnimData;
  try {
    data = JSON.parse(raw) as PlanAnimData;
  } catch (e) {
    stop(`data segments ${segments.join(",")} did not parse — re-push`);
    return false;
  }
  if (!data.steps || !data.steps.length) {
    stop("animation has no steps");
    return false;
  }
  // Segment 89 said one room but 90.. hold another: a push was clobbered by the
  // runtime writing its stale active segments back. Say so instead of spinning
  // forever on the heap-mismatch reload path below.
  if (data.room !== s.room) {
    stop(`data segments hold ${data.room}, not ${s.room} — re-run push-anim.mjs (it verifies now)`);
    return false;
  }
  const h = heap();
  h.room = data.room;
  h.data = data;
  h.fold = undefined; // a fold of the PREVIOUS film means nothing for this one
  s.phase = "play";
  logAlways(`animPlan ${data.room}: ${data.steps.length} steps loaded (speed ${s.speed})`);
  return true;
}

/**
 * Fold steps 0..upTo into the per-tile state, INCREMENTALLY.
 *
 * The old draw() replayed a window of steps every tick; this walks each step
 * exactly once and keeps the result on the heap keyed by the cursor, so a
 * normal tick folds the ONE step the cursor advanced by (a few cells) instead
 * of re-walking hundreds. Only a rewind — the loop restarting at step 0, or a
 * heap that was never built — pays for a full rebuild, and even that is bounded
 * by the film's total cell count.
 *
 * Fold, not replay, is also the only way the erase stages can work at all: a
 * step that deletes a tile cannot be expressed by painting over it.
 */
function foldTo(data: PlanAnimData, upTo: number): PlanAnimFold {
  const h = heap();
  let f = h.fold;
  if (!f || f.upTo > upTo) {
    f = {
      upTo: -1,
      tiles: new Int16Array(ROOM_TILES),
      road: new Uint8Array(ROOM_TILES),
      scaff: new Uint8Array(ROOM_TILES),
      ghost: {},
    };
    h.fold = f;
  }
  if (f.upTo >= upTo) return f;

  const scaffold = (data.meta && data.meta.stageScaffold) || {};
  for (let i = f.upTo + 1; i <= upTo; i++) {
    const step = data.steps[i];
    const op = FOLD_OPS[step.stage];
    const isRoad = step.stage.indexOf("roads") === 0 && !(op && op.erase);
    const isScaff = scaffold[step.stage] ? 1 : 0;
    const cells = step.cells;
    for (let c = 0; c < cells.length; c += 3) {
      const packed = cells[c] + cells[c + 1] * 50;
      if (packed < 0 || packed >= ROOM_TILES) continue;
      if (op && op.erase) {
        if (op.ghost) delete f.ghost[packed];
        // '#unroad' clears the ROADS canvas only — see FOLD_OPS
        else if (f.road[packed]) {
          f.tiles[packed] = 0;
          f.road[packed] = 0;
          f.scaff[packed] = 0;
        }
        continue;
      }
      if (op && op.ghost) {
        f.ghost[packed] = cells[c + 2] + 1;
        continue;
      }
      f.tiles[packed] = cells[c + 2] + 1;
      f.road[packed] = isRoad ? 1 : 0;
      f.scaff[packed] = isScaff;
    }
  }
  f.upTo = upTo;
  return f;
}

function draw(s: PlanAnimState, data: PlanAnimData): void {
  const steps = data.steps;
  const upTo = Math.min(s.step, steps.length - 1);
  const vis = new RoomVisual(s.room);
  const f = foldTo(data, upTo);

  // MAX_CELLS is now a cap on the RENDER, not on how far back the replay
  // reaches: a fold cannot hold more than one entry per tile, so the walk is
  // 2500 slots whatever the film does. Scaffold tiles are painted fainter
  // rather than dropped, which is the same trade the browser makes (it dims
  // the thinking canvases once the plan appears) and matters here for the
  // first time: with a fold, `dt` and `fields` survive to the final frame
  // instead of scrolling out of the old backwards budget.
  let painted = 0;
  for (let packed = 0; packed < ROOM_TILES && painted < MAX_CELLS; packed++) {
    const v = f.tiles[packed];
    if (!v) continue;
    vis.rect((packed % 50) - 0.4, Math.floor(packed / 50) - 0.4, 0.8, 0.8, {
      fill: data.palette[v - 1],
      opacity: f.scaff[packed] ? 0.15 : 0.35,
    });
    painted++;
  }
  for (const key in f.ghost) {
    const packed = +key;
    vis.rect((packed % 50) - 0.4, Math.floor(packed / 50) - 0.4, 0.8, 0.8, {
      fill: data.palette[f.ghost[packed] - 1],
      opacity: 0.35,
    });
  }

  const cur = steps[upTo];
  vis.text(`${cur.stage.toUpperCase()} · ${cur.label}`, 0.5, 1.2, {
    align: "left",
    color: "#ffffff",
    font: 0.7,
    backgroundColor: "#000000",
    backgroundPadding: 0.15,
  });
  const done = s.step >= steps.length - 1;
  const tail = s.loop ? ` · LOOP ${(s.loops || 0) + 1}${done ? " · replaying" : ""}` : done ? " · done" : "";
  vis.text(`step ${upTo + 1}/${steps.length}${tail}`, 0.5, 2.1, {
    align: "left",
    color: "#aaccff",
    font: 0.6,
    backgroundColor: "#000000",
    backgroundPadding: 0.15,
  });
}

/** Per-tick entry point. Cheap no-op unless an animation is active. */
export function runPlanAnimator(): void {
  const s = state();
  if (!s || !s.active) return;

  if (s.phase === "index" && !readIndex(s)) return;
  if (s.phase === "data" && !readData(s)) return;

  const h = heap();
  if (!h.data || h.room !== s.room) {
    // heap was wiped (global reset) — reload from segments
    s.phase = "index";
    request([INDEX_SEGMENT]);
    return;
  }

  // visuals are cheap, but never let a toy push the tick over budget
  if (Game.cpu.getUsed() > Game.cpu.limit * 0.5) return;

  draw(s, h.data);

  if (s.step < h.data.steps.length - 1) {
    // fractional speed accumulates so slow playback is possible on fast servers
    const acc = (s.acc || 0) + s.speed;
    const whole = Math.floor(acc);
    s.acc = acc - whole;
    if (whole > 0) s.step = Math.min(s.step + whole, h.data.steps.length - 1);
    return;
  }
  s.held = (s.held || 0) + 1;
  if (s.held < HOLD_TICKS) return;

  if (s.loop) {
    // rewind rather than stop — the viewer may only just have opened the room
    s.loops = (s.loops || 0) + 1;
    s.step = 0;
    s.held = 0;
    s.acc = 0;
    return;
  }
  s.active = false;
  logAlways(`animPlan ${s.room}: finished`);
}

export function animPlan(roomName: string, speed: number = 1, loop: boolean = true): string {
  if (!roomName) return "animPlan(roomName, speed?, loop?) — e.g. animPlan(\"E2S7\")";
  Memory.planAnim = {
    room: roomName,
    step: 0,
    speed: Math.min(20, Math.max(0.02, speed || 1)),
    active: true,
    phase: "index",
    held: 0,
    acc: 0,
    loop: loop !== false,
    loops: 0,
  } as PlanAnimState;
  // drop a stale heap cache so a re-push is picked up
  const h = heap();
  h.fold = undefined; // the cursor is back at 0; so is the picture
  if (h.room !== roomName) {
    h.room = undefined;
    h.data = undefined;
  }
  RawMemory.setActiveSegments([INDEX_SEGMENT]);
  const msg = `animPlan ${roomName} armed (speed ${Memory.planAnim.speed}, loop ${
    Memory.planAnim.loop ? "on" : "off"
  }) — loading segments`;
  logAlways(msg);
  return msg;
}

export function animStop(): string {
  const s = state();
  if (!s) return "animPlan: nothing running";
  s.active = false;
  const msg = `animPlan ${s.room}: stopped at step ${s.step}`;
  logAlways(msg);
  return msg;
}
