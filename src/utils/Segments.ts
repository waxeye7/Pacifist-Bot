/**
 * RawMemory.setActiveSegments is a REPLACE, not an add.
 *
 * Every caller that wants a segment therefore has to ask for the UNION of
 * everything already active plus everything anyone else asked for this tick,
 * or whoever runs last silently cancels everyone before it. That bug was live:
 * with Memory.planAnim.active set, AutoExpand sat in `picking` for 400+ ticks
 * because segment 86 was never activated (see Managers/AutoExpand.readSegment,
 * which grew its own copy of this logic first).
 *
 * TWO SOURCES OF TRUTH, AND BOTH ARE NEEDED:
 *   - RawMemory.segments reflects LAST tick's activation. It is what keeps a
 *     long-lived reader (error segment 10, adoption 88) alive across ticks.
 *   - `wanted` is a heap-level, per-tick set. Two requests in the SAME tick are
 *     both invisible in RawMemory.segments, so without it the second request
 *     would drop the first.
 *
 * Heap state dies with the isolate, which is correct: after a global reset the
 * previous tick's activation is still in RawMemory.segments and gets unioned
 * back in on the first request.
 *
 * No imports on purpose — every segment user in the bot must be able to pull
 * this in without creating a cycle.
 */

/** The engine's hard limit on simultaneously active segments. */
const MAX_ACTIVE = 10;

let requestTick = -1;
let wanted: number[] = [];

/**
 * Ask for `ids` to be readable (usually from the NEXT tick), keeping every
 * other segment that is active or was asked for this tick. Returns the set
 * actually handed to the engine — the ids that fell off the 10-segment limit
 * are simply not in it.
 */
export function requestSegments(ids: number[]): number[] {
  if (requestTick !== Game.time) {
    requestTick = Game.time;
    wanted = [];
  }
  for (const id of ids) {
    if (wanted.indexOf(id) < 0) wanted.push(id);
  }
  // already-active segments keep their slot BEHIND this tick's requests: a
  // caller that asked out loud outranks one that is merely still open.
  const active: number[] = [];
  for (const key in RawMemory.segments) {
    const n = Number(key);
    if (wanted.indexOf(n) < 0) active.push(n);
  }
  const set = wanted.concat(active).slice(0, MAX_ACTIVE);
  RawMemory.setActiveSegments(set);
  return set;
}

/** Who owns which id — so segs() is readable and we do not double-book. */
export const SEGMENT_OWNERS: { [id: number]: string } = {
  7: "ally-need",
  10: "errors",
  30: "war-intel",
  86: "expand-pack",
  88: "plan-v2",
  89: "anim-index",
};

export function segmentOwner(id: number): string {
  if (SEGMENT_OWNERS[id]) return SEGMENT_OWNERS[id];
  if (id >= 90 && id <= 99) return "anim-data";
  return "?";
}

/** Snapshot of the 10-slot mount table. Console: segs() */
export function segmentStatus(): string {
  const active: number[] = [];
  for (const key in RawMemory.segments) {
    const n = Number(key);
    if (!isNaN(n)) active.push(n);
  }
  active.sort((a, b) => a - b);
  const rows = [
    `mounted this tick: ${active.length}/${MAX_ACTIVE}  (readable/writable now)`,
    `requested this tick: ${wanted.length ? wanted.join(",") : "(none yet)"}`,
  ];
  for (let i = 0; i < active.length; i++) {
    const id = active[i];
    const raw = RawMemory.segments[id];
    const len = typeof raw === "string" ? raw.length : 0;
    rows.push(`  ${String(id).padStart(2)}  ${segmentOwner(id).padEnd(12)}  ${len} / 100000 bytes`);
  }
  rows.push("7 is public (ally-need). other mounted ids stay private.");
  return rows.join("\n");
}

export function installSegmentCommands(): void {
  const g = global as any;
  if (g.__segCommandsInstalled) return;
  g.__segCommandsInstalled = true;
  g.segs = function (): string {
    return segmentStatus();
  };
}
