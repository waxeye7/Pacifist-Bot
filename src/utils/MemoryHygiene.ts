/**
 * ORPHANED MEMORY KEYS — WRITTEN BY NOBODY, PAID FOR BY EVERY TICK.
 *
 * Memory is serialised after main() returns. That write is billed to us and
 * no in-loop profiler can see it; the only meter that can is the bucket, and
 * it put the real cost of a tick at 19.2-19.9 against a reported 18.23 on a
 * 20 limit (see CpuPolicy.sampleBilledFromBucket).
 *
 * A survey of live shard3 Memory on 2026-09-11 found 141,164 bytes, and seven
 * top-level keys among them that no line of src/ reads or writes:
 *
 *     __wsrc      3,223    __roles     1,088    _mktProbe   1,319
 *     _mh           569    _mh2          300    __watch       226
 *     _cbReroute    156
 *
 * 6,881 bytes — ~5% of all Memory — left behind by builds that no longer
 * exist, re-serialised on every tick since. They are scratch from an old
 * memhack, an old profiler and an old market probe.
 *
 * WHY A NAMED LIST AND NOT A SWEEP OF UNKNOWN KEYS. A sweep that deleted
 * anything it did not recognise would also delete whatever a console command
 * had just parked there, and this bot's own tooling writes to Memory from the
 * outside. Naming the dead is slower to maintain and impossible to get
 * catastrophically wrong.
 *
 * WHY IT RUNS ON EVERY GLOBAL RESET AND NOT ONCE. The same code is pushed to
 * eight destinations, and each server holds its own Memory with its own
 * accumulated orphans. A one-off deletion through the API would clean exactly
 * one of them.
 */
const DEAD_MEMORY_KEYS = [
  "__wsrc",
  "__roles",
  "__watch",
  "_mktProbe",
  "_mh",
  "_mh2",
  "_cbReroute",
];

let swept = false;

/** Drop known-dead top-level Memory keys. Once per global reset. */
export function sweepDeadMemory(): void {
  if (swept) return;
  swept = true;
  const M: any = Memory as any;
  for (let i = 0; i < DEAD_MEMORY_KEYS.length; i++) {
    const key = DEAD_MEMORY_KEYS[i];
    if (M[key] !== undefined) delete M[key];
  }
}
