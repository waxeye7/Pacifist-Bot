/**
 * Scale ambition from Game.cpu.limit (shard3 ~20 vs private 100+).
 * Always available: global.cpuStatus()
 */

export interface CpuPolicyState {
  limit: number;
  bucket: number;
  /** 0..1 how full the bucket is (approx) */
  bucketRatio: number;
  /** Safe to open remotes / scouts */
  allowRemotes: boolean;
  /** Max active remote rooms per commune (soft target) */
  maxRemotes: number;
  /** Run expensive systems this tick (market/mosquito/heavy build) */
  allowExpensive: boolean;
  /** Skip non-critical work when bucket is sick */
  economyOnly: boolean;
}

export function getCpuPolicy(): CpuPolicyState {
  const limit = Game.cpu.limit || 20;
  const bucket = Game.cpu.bucket;
  const bucketRatio = bucket / 10000;

  // Shard3 (20): careful. High limit private servers: open up.
  const lowCpu = limit <= 30;
  const avg = Number(Memory.CPU && Memory.CPU.hundredTickAvg && Memory.CPU.hundredTickAvg.avg) || 0;

  const economyOnly = bucket < (lowCpu ? 2000 : 1000);
  const allowExpensive = !economyOnly && bucket >= (lowCpu ? 4000 : 3000) && avg < limit * 0.85;
  // A PINNED bucket is the ground truth for "we are under budget": the bucket
  // only stays at ~10000 while average usage is below the limit, whatever the
  // 100-tick average says. Live shard3 (limit 20): avg100 sat at 16-18 with
  // the bucket pinned at 10000 the whole time, and the `avg < limit - 4`
  // clause alone flipped allowRemotes off -> the rooms.ts panic valve closed
  // every remote in the empire at Game.time % 500 == 1, manageRemotes bailed
  // so nothing reopened them, CPU dropped, they reopened, CPU rose... a
  // 500-tick oscillation that recalled the whole remote fleet each turn.
  const bucketPinned = bucket >= 9000;
  /*
   * How much headroom the 100-tick average must show BEFORE remotes may open.
   *
   * A flat `avg < limit - 4` double-counts the safety margin: the bucket floor
   * below (5000) already proves there is reserve, and the bucket exists
   * precisely so a bot can run over its limit for a while. On a bot that
   * naturally settles at 16-18 of a 20 limit, the flat rule latches remotes OFF
   * permanently — and closing remotes lowers INCOME, not CPU, so nothing ever
   * brings the average back down. Live shard3 sat at avg 16.7 with the bucket
   * climbing steadily (7063 -> 7391) and every remote in the empire disabled.
   *
   * Scaling the margin with the bucket makes the rule monotone — more reserve
   * is never more restrictive — so it cannot produce the on/off/on oscillation
   * a cliff does. A rising bucket earns permission; a falling one loses it well
   * before economyOnly trips.
   */
  const marginFull = lowCpu ? 4 : 8;
  const headroomMargin = bucket >= 8000 ? 0 : bucket >= 6000 ? Math.floor(marginFull / 2) : marginFull;
  /*
   * HYSTERESIS: entry and exit are different questions.
   *
   * ENTRY (off -> on) demands proven headroom: bucket over the bar AND the
   * avg clause. EXIT (on -> off) ignores the avg entirely and only fires
   * when the BUCKET has actually paid — 1000 under the entry bar, or
   * economyOnly. The bucket is the integral of over-budget spending, so
   * this is the honest signal; the avg is noisy on exactly the tick scale
   * manageRemotes runs at. Without the split, live shard3 closed every
   * remote in one tick each time avg brushed the margin, recalled 15
   * creeps into a border livelock, and the livelock's own CPU kept the
   * average pinned so nothing ever reopened: a self-sustaining collapse.
   */
  const wasOn = !!(Memory as any)._remotesOnHyst;
  const entryBar = lowCpu ? 5000 : 4000;
  const stayBar = entryBar - 1000;
  const allowRemotes =
    !economyOnly &&
    (wasOn
      ? bucket >= stayBar
      : bucket >= entryBar && (bucketPinned || avg === 0 || avg < limit - headroomMargin));
  (Memory as any)._remotesOnHyst = allowRemotes;

  let maxRemotes = 0;
  if (allowRemotes) {
    // shard3-shaped (limit 20): a pinned bucket means the CPU headroom is real.
    // Measured on E37N59 — limit 20, bucket 10000, 100-tick avg 11 — the cap of 2
    // was the binding constraint on remote income, not CPU. 3 at a full bucket.
    // Stepped, not a cliff — and with a 700-bucket DEADBAND on top: the VPS
    // sat exactly on the limit<=50 7000 threshold and closed/reopened its
    // whole remote set every few hundred ticks as the bucket grazed it.
    // A rung change must now clear the threshold by 700 in its direction of
    // travel, so grazing holds the previous answer.
    const rungs = (b: number) =>
      limit <= 20 ? (b > 8000 ? 3 : b > 6000 ? 2 : 1)
      : limit <= 50 ? (b > 7000 ? 4 : 2)
      : (b > 6000 ? 8 : 4);
    const raw = rungs(bucket);
    const prev = Number((Memory as any)._maxRemotesHyst) || 0;
    if (prev > 0 && raw !== prev) {
      if (raw > prev) maxRemotes = rungs(bucket - 700) > prev ? raw : prev;
      else maxRemotes = rungs(bucket + 700) < prev ? raw : prev;
    } else {
      maxRemotes = raw;
    }
  }
  (Memory as any)._maxRemotesHyst = maxRemotes;

  return {
    limit,
    bucket,
    bucketRatio,
    allowRemotes,
    maxRemotes,
    allowExpensive,
    economyOnly,
  };
}

export function cpuStatusString(): string {
  const p = getCpuPolicy();
  const avg = Memory.CPU && Memory.CPU.hundredTickAvg ? Memory.CPU.hundredTickAvg.avg : "?";
  return [
    `limit=${p.limit}`,
    `bucket=${p.bucket}`,
    `avg100=${avg}`,
    `remotes=${p.allowRemotes ? "ON max=" + p.maxRemotes : "OFF"}`,
    `expensive=${p.allowExpensive ? "ON" : "OFF"}`,
    `economyOnly=${p.economyOnly}`,
    `verbose=${!!Memory.verbose}`,
  ].join(" | ");
}
