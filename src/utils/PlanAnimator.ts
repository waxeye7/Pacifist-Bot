/**
 * PlanAnimator — replay the offline base planner's thinking as RoomVisuals.
 *
 * The offline exporter (tools/plan-suite/v2/export-anim.mjs) flattens the
 * planner stages into ordered STEPS; tools/server/push-anim.mjs writes them
 * into RawMemory segments (index in 89, data in 90..99). This plays them back
 * one step per tick, leaving earlier stages painted underneath.
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
/** Never paint more than this many rects in one tick. */
const MAX_CELLS = 2500;

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
  steps: PlanAnimStep[];
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
function heap(): { room?: string; data?: PlanAnimData } {
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
  s.phase = "play";
  logAlways(`animPlan ${data.room}: ${data.steps.length} steps loaded (speed ${s.speed})`);
  return true;
}

/**
 * Steps [0..upTo] painted at once would blow the rect budget on big rooms, so
 * walk backwards from the newest step and keep whatever fits — plus every step
 * of the current stage, which is the one the viewer is actually watching.
 */
function visibleRange(steps: PlanAnimStep[], upTo: number): number {
  let budget = MAX_CELLS;
  const stage = steps[upTo].stage;
  let first = upTo;
  for (let i = upTo; i >= 0; i--) {
    budget -= steps[i].cells.length / 3;
    if (budget < 0 && steps[i].stage !== stage) break;
    first = i;
  }
  return first;
}

function draw(s: PlanAnimState, data: PlanAnimData): void {
  const steps = data.steps;
  const upTo = Math.min(s.step, steps.length - 1);
  const vis = new RoomVisual(s.room);
  const from = visibleRange(steps, upTo);

  for (let i = from; i <= upTo; i++) {
    const cells = steps[i].cells;
    for (let c = 0; c < cells.length; c += 3) {
      vis.rect(cells[c] - 0.4, cells[c + 1] - 0.4, 0.8, 0.8, {
        fill: data.palette[cells[c + 2]],
        opacity: 0.35,
      });
    }
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
