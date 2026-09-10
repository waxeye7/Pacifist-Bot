/**
 * WHERE THE ROOMS PHASE GOES.
 *
 * main.ts records phase totals and Empire/empire.ts already breaks its own
 * phase down into {rescue, census, postures}; this is the same idea for the
 * rooms pass, which is the second-largest line in the bot and the only large
 * one that is pure JS rather than intents.
 *
 * It matters because of what the two costs can and cannot be argued with.
 * Live shard3 2026-09-11, settled: creeps 11.91, rooms 5.23, everything else
 * 0.48, against a 100-tick average of 17.91 and a billed cost of 19.24 on a
 * 20 limit. The creeps line is almost entirely INTENTS — 47 creeps at 0.2 per
 * intent — so it cannot be optimised, only spent differently. The rooms line
 * is 0.75 per owned room of ordinary JavaScript, and nobody has ever seen
 * inside it.
 *
 * The bucket needs 4,000 for remotes and the remote gate also wants the
 * in-loop average under 18. Both are within a CPU of where the bot sits, so
 * knowing which call inside rooms() costs what is the difference between
 * guessing and fixing.
 *
 * ── PER TICK, NOT PER CALL ────────────────────────────────────────────────
 *
 * The first cut of this folded each measurement straight into the EMA. Every
 * key here is called ONCE PER OWNED ROOM, so with seven rooms the average saw
 * seven samples a tick and converged on the cost of a single room's call — a
 * number that looks like 0.53 next to a rooms phase of 5.23 and means nothing
 * beside it, because one is a per-call mean and the other a per-tick total.
 *
 * So the samples accumulate into a per-tick bucket and the EMA takes ONE
 * sample per tick, of the total. That is directly comparable with the phase
 * number it is meant to explain, and the two can be subtracted to find what
 * inside rooms() is still unaccounted for.
 *
 * Every known key is flushed on every tick, including the ones that did not
 * run. A call on a %100 cadence must decay toward its true time-average
 * rather than hold the value of the one tick in a hundred where it fires;
 * otherwise a rare expensive pass reads as a constant expensive pass.
 *
 * Cost of the instrument: two getUsed() calls per wrapped call, ~0.003 CPU
 * for the whole set, and ~300 bytes of Memory. Serialisation is billed after
 * the loop at ~0.011 CPU per KB (CpuPolicy.sampleBilledFromBucket), so the
 * table pays for itself many times over if it finds anything at all.
 */
const PART_ALPHA = 0.05;

/** Accumulates this tick's samples; flushed into the EMA on the next tick. */
let accTick = -1;
let acc: { [key: string]: number } = {};

/*
 * Ticks this global has been alive. A global reset costs 50-90 CPU on the tick
 * that compiles the code, and every cache this bot keeps is cold underneath
 * it, so the first pass of any wrapped call is wildly unrepresentative.
 *
 * This is the SECOND time that has bitten. CpuPolicy.sampleBilledFromBucket
 * seeded its average on a reset tick and read trueAvg 74.51 while trueLast had
 * already settled at 20. Here a freshly added key seeded at its first sample:
 * `spawn.producer` read 4.381 against a whole `spawning` call of 1.951 — a
 * slice larger than the thing it is a slice of, which is impossible and cost
 * another round of squinting at numbers that meant nothing.
 *
 * So: no samples at all for the first two ticks of a global, and a new key
 * starts at ZERO rather than at whatever it happened to cost first. An EMA
 * climbing from zero reaches the truth in about sixty ticks and never
 * overshoots it; one seeded from a spike takes hundreds of ticks to come back
 * down and reads as a finding the whole time.
 */
let globalAge = 0;

function flush(): void {
  const M: any = Memory as any;
  if (!M.CPU) return;
  const p = M.CPU.roomParts || (M.CPU.roomParts = {});
  // Iterate the STORED keys, not this tick's: a key that did not run must
  // still be fed a zero so it decays.
  for (const key in p) {
    const used = acc[key] || 0;
    p[key] = Math.round((p[key] + PART_ALPHA * (used - p[key])) * 1000) / 1000;
  }
  for (const key in acc) {
    if (p[key] === undefined) p[key] = 0;
  }
  acc = {};
}

/**
 * Time one call and add it to this tick's total for `key`.
 *
 * Deliberately does NOT catch. rooms.ts wraps its per-room body in guarded(),
 * which is the error boundary that already exists; a second one here would
 * swallow exceptions that guarded() is meant to see and report.
 */
export function roomPart<T>(key: string, fn: () => T): T {
  if (Game.time !== accTick) {
    globalAge++;
    if (globalAge > 2) flush();
    accTick = Game.time;
    acc = {};
  }
  const before = Game.cpu.getUsed();
  try {
    return fn();
  } finally {
    acc[key] = (acc[key] || 0) + (Game.cpu.getUsed() - before);
  }
}
