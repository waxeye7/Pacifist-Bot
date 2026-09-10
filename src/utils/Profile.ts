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
 * Cost of the instrument: two getUsed() calls per wrapped call, ~0.003 CPU
 * for the whole set, and ~300 bytes of Memory. Serialisation is billed after
 * the loop at ~0.011 CPU per KB (CpuPolicy.sampleBilledFromBucket), so the
 * table pays for itself many times over if it finds anything at all.
 */
const PART_ALPHA = 0.05;

/**
 * Time one call and fold it into Memory.CPU.roomParts as a slow EMA.
 *
 * Deliberately does NOT catch. rooms.ts wraps its per-room body in guarded(),
 * which is the error boundary that already exists; a second one here would
 * swallow exceptions that guarded() is meant to see and report.
 */
export function roomPart<T>(key: string, fn: () => T): T {
  const before = Game.cpu.getUsed();
  try {
    return fn();
  } finally {
    const M: any = Memory as any;
    if (M.CPU) {
      const p = M.CPU.roomParts || (M.CPU.roomParts = {});
      const used = Game.cpu.getUsed() - before;
      const prev = typeof p[key] === "number" ? p[key] : 0;
      p[key] = Math.round((prev + PART_ALPHA * (used - prev)) * 1000) / 1000;
    }
  }
}
