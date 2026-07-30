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
  const allowRemotes =
    !economyOnly &&
    bucket >= (lowCpu ? 5000 : 4000) &&
    (avg === 0 || avg < limit - (lowCpu ? 4 : 8));

  let maxRemotes = 0;
  if (allowRemotes) {
    if (limit <= 20) maxRemotes = bucket > 8000 ? 2 : 1;
    else if (limit <= 50) maxRemotes = bucket > 7000 ? 4 : 2;
    else maxRemotes = bucket > 6000 ? 8 : 4;
  }

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
