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

/**
 * CPU the shard actually bills this tick.
 *
 * `Game.cpu.getUsed() - startOfLoop` is logic-only. Parse and Memory
 * deserialize happen before that snapshot, still drain the bucket, and are
 * why LIVE can log avg100 ≈ 18 while the bucket falls on a 20 limit.
 * `startUsed` is accepted so a future editor cannot "fix" this by subtracting
 * it without breaking the unit test.
 */
export function billedTickCpu(endUsed: number, startUsed: number): number {
  void startUsed;
  if (typeof endUsed !== "number" || !isFinite(endUsed) || endUsed < 0) return 0;
  return endUsed;
}

/**
 * THE BUCKET IS THE ONLY HONEST CPU METER THIS BOT HAS.
 *
 * billedTickCpu() above returns end-of-loop getUsed(), and its doc is right
 * that this beats the logic-only delta — parse happens before that snapshot.
 * But it still cannot see the other half. Memory is SERIALISED AFTER main()
 * returns, and that write is billed to us; no call made inside the loop can
 * ever observe it.
 *
 * Measured live on shard3 2026-09-11, with remotes closed and the optional
 * roster closed, over three consecutive windows of 40, 24 and 22 ticks:
 *
 *   reported avg100      18.23   18.23   18.23
 *   bucket delta          +32     +11      +3
 *   billed per tick      19.20   19.54   19.86
 *
 * The bot believed it had 1.8 CPU of headroom per tick. It had 0.4. That gap
 * is the entire reason a 3,400 bucket never climbs to the 4,000 remotes need
 * or the 5,000 the optional roster needs, and why a bot that looks healthy in
 * its own logs has had both shut off for days.
 *
 * The arithmetic is exact and free. The bucket moves by `limit - billed` every
 * tick, so one subtraction against last tick's reading recovers the number the
 * server actually charged, INCLUDING everything after the loop.
 *
 * It is only valid when the bucket is free to move, so three guards:
 *   - consecutive ticks only, or the delta spans ticks we never ran;
 *   - not at the 10,000 ceiling, where surplus is discarded rather than banked;
 *   - not at the floor, where the deficit is absorbed by skipping us instead.
 * Whenever a guard trips there is simply no sample this tick, which is the
 * honest answer — a saturated meter reads nothing, it does not read zero.
 *
 * Stored as an EMA rather than a window array on purpose: this file's own
 * finding is that Memory bytes cost CPU, so the diagnostic that proves it must
 * not itself add a hundred-element array to Memory.
 */
const TRUE_CPU_ALPHA = 0.02;

/*
 * Ticks this global has been alive. A global reset costs 50-90 CPU on the
 * tick that compiles the code, and that charge lands in the bucket delta the
 * FOLLOWING tick — which is where this function would read it. Seeding a
 * 0.02 EMA with a 90-CPU sample poisons the average for hundreds of ticks:
 * the first live reading after this shipped was trueAvg 74.51 while trueLast
 * had already settled at 20.
 *
 * A reset is a real cost, but it is not the cost of a tick, and every gate
 * that reads this average is asking what a tick normally costs.
 */
let globalAge = 0;

export function sampleBilledFromBucket(): void {
  const M: any = Memory as any;
  if (!M.CPU) return;
  globalAge++;
  if (globalAge <= 2) {
    // Still record the reading so the NEXT tick has a baseline to subtract.
    M.CPU._btT = Game.time;
    M.CPU._btB = Game.cpu.bucket;
    return;
  }
  const limit = Game.cpu.limit || 20;
  const bucket = Game.cpu.bucket;
  const prevTick = M.CPU._btT;
  const prevBucket = M.CPU._btB;
  M.CPU._btT = Game.time;
  M.CPU._btB = bucket;

  if (prevTick !== Game.time - 1) return;
  if (typeof prevBucket !== "number") return;
  if (prevBucket >= 10000 || bucket >= 10000) return;
  if (bucket <= 0 || prevBucket <= 0) return;

  const billed = limit - (bucket - prevBucket);
  // A global reset or a server hiccup can produce a nonsense delta; a single
  // absurd sample must not poison an average the spawn gates read.
  if (!isFinite(billed) || billed < 0 || billed > limit * 10) return;

  /*
   * An average that claims the bot spends more than twice its limit, while
   * the bucket is merely drifting, is not an average — it is a bad seed that
   * has not decayed yet. Live proof: the very first build of this meter
   * seeded on a global-reset tick and read trueAvg 42.38 against a trueLast
   * of 20 with the bucket moving by single digits. At alpha 0.02 that takes
   * hundreds of ticks to wash out, and every gate reading it is wrong for the
   * whole of that. The globalAge guard above stops it happening again; this
   * one heals a value already stored on a server nobody is watching.
   */
  const stored = M.CPU.trueAvg;
  const prev = typeof stored === "number" && stored <= limit * 2 ? stored : undefined;
  M.CPU.trueAvg = typeof prev === "number"
    ? Math.round((prev + TRUE_CPU_ALPHA * (billed - prev)) * 100) / 100
    : Math.round(billed * 100) / 100;
  M.CPU.trueLast = Math.round(billed * 100) / 100;

  /*
   * POST-LOOP OVERHEAD, MEASURED RATHER THAN INFERRED.
   *
   * The two numbers on either side of this subtraction describe the SAME
   * tick. `billed` is what the server charged for tick N-1, recovered from
   * the bucket at the start of tick N. `CPU.lastTick` is Game.cpu.getUsed()
   * sampled at the end of main() on tick N-1 and written by CPUmanager before
   * that tick ended. What separates them is everything the server does after
   * main() returns, which on this bot is dominated by serialising Memory.
   *
   * Worth keeping because it is the only way to price a Memory diet before
   * committing to one. Deleting seven orphaned keys and pruning the remote
   * stats table took Memory from 141,164 bytes to 127,063; whether that is
   * worth 0.1 CPU or 0.5 decides whether the next 20 KB is worth the risk of
   * touching movement code, and no other reading in the bot can answer it.
   */
  const inLoop = Number(M.CPU.lastTick);
  if (isFinite(inLoop) && inLoop > 0) {
    const overhead = billed - inLoop;
    // Only a plausible reading. A negative one means the two samples drifted
    // apart across a skipped tick, not that serialisation refunded CPU.
    if (overhead >= 0 && overhead < limit) {
      const prevOh = M.CPU.overheadAvg;
      M.CPU.overheadAvg = typeof prevOh === "number" && prevOh >= 0 && prevOh < limit
        ? Math.round((prevOh + TRUE_CPU_ALPHA * (overhead - prevOh)) * 100) / 100
        : Math.round(overhead * 100) / 100;
    }
  }
}

/**
 * HOW MANY REMOTES THE WHOLE EMPIRE MAY MINE AT ONCE.
 *
 * maxRemotes is documented as a soft target PER COMMUNE, and manageRemotes
 * applies it per commune. On a seven-room empire that makes the smallest
 * non-zero step SEVEN remotes, because every room independently decides it may
 * have one on the same tick the bucket crosses the entry bar.
 *
 * A remote is about 1 CPU — the headroom rung above says so in as many words
 * (miner 0.25, carriers 0.5, pathing). Live shard3 2026-09-11 with remotes
 * shut: billed 18.7 against a 20 limit, so 1.3 CPU of real headroom. Seven
 * remotes is 7. The bucket would cross 4,000, every room would open, the
 * average would go to 25, the bucket would drain back through the 3,000 stay
 * bar in a few hundred ticks, and every remote in the empire would be recalled
 * at once — which is the collapse the hysteresis note above already describes
 * from the last time this happened, only reached from the other direction.
 *
 * So the empire gets a budget as well as the per-room cap, and it is priced in
 * the CPU it actually has. One or two permanently-staffed remotes are worth
 * strictly more than seven that cycle on and off, because a recalled remote
 * still cost the energy to build its creeps and buys nothing with them.
 *
 * Uses the BILLED average when it exists. avg100 is the in-loop number and
 * understates the true cost by the post-loop Memory write, measured at 1.32
 * on this bot — budgeting from it would buy a remote the empire cannot pay for.
 */
const REMOTE_CPU_EST = 1.0;

export function empireRemoteBudget(): number {
  const limit = Game.cpu.limit || 20;
  // Only 20-CPU-shaped shards need this. A private server with a high limit
  // has room for the per-room caps as written.
  if (limit > 30) return 99;
  const M: any = Memory as any;
  const billed = M.CPU && typeof M.CPU.trueAvg === "number" && M.CPU.trueAvg > 0
    ? M.CPU.trueAvg
    : Number(M.CPU && M.CPU.hundredTickAvg && M.CPU.hundredTickAvg.avg) || 0;
  // No reading yet: allow exactly one and let the next pass price it properly.
  if (billed <= 0) return 1;
  const headroom = limit - billed;
  if (headroom <= 0) return 0;
  return Math.floor(headroom / REMOTE_CPU_EST);
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
  // shard3 after the billed-CPU fix: avg100 is the honest number (parse
  // included), so 4 CPU of margin on a 20 limit demanded avg < 16 for an
  // empire that idles at 17 — remotes could never open. 2 / 1 / 0.
  const marginFull = lowCpu ? 2 : 8;
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
  const entryBar = 4000;
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
    /*
     * HEADROOM RUNG (20-CPU shards). The bucket says how much reserve there
     * is; it says nothing about the RATE. Live shard3 opened 3 remotes per
     * room at bucket 8000, the average went to 18+, the bucket drained to
     * 1000, remotes closed, income fell, CPU did not — the bot lived at the
     * bottom of that cycle for days. A remote is ~1 CPU (miner 0.25, carriers
     * 0.5, pathing); the rung is what the average can actually pay for.
     */
    const headroom = avg > 0 ? limit - avg : limit;
    const headroomRung = !lowCpu ? 99 : headroom >= 4 ? 3 : headroom >= 2.5 ? 2 : 1;
    const raw = Math.min(rungs(bucket), headroomRung);
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

/**
 * Roles the 20-CPU latch may idle THIS TICK without killing income or
 * defence. Spawn already refuses replacements under CPU_CRISIS_BUCKET;
 * leftover bodies still run until TTL. Skipping their run() is the only
 * immediate CPU cut. Fail-open: unknown / missing roles always run.
 *
 * Owned-room economy only. `room.memory.danger` is set solely in the
 * owned-room defence pass, so skipping RemoteRepair / Priest / Escort /
 * SneakyControllerUpgrader / scout would freeze them in rooms that never
 * get that flag — they would not flee. Scout is both a remote-room
 * economy body and a war-layer lookout (`warScout`); it stays fail-open.
 *
 * LIVE shard3 bucket ~1012, economyOnly: Repair + Maintainer + Sweeper
 * were the remaining discretionary CPU after miners/carries/upgraders.
 */
const OPTIONAL_CREEP_ROLES: { [role: string]: true } = {
  repair: true,
  maintainer: true,
  sweeper: true,
  MineralMiner: true,
};

/**
 * Bucket floor for BOUNDED, PERIODIC INFRASTRUCTURE work — the plan pass and
 * the remote road/pathLength pass.
 *
 * These used to carry their own numbers (3,500 and 5,000) and both were above
 * the bucket this bot actually runs at: live shard3 holds a stable 3,357-3,595
 * on a 20 CPU limit. So the remote road pass had not fired in months and the
 * construction pass was a coin flip once per 1,000 ticks — the growth
 * machinery was switched off while the maintenance machinery kept running.
 *
 * Both callers are self-throttled to at most one pass per room per 1,000 ticks
 * (construction) or one PathFinder search per room per tick with a 500-tick
 * per-remote stamp (Remote_Roads_Tick), so the honest bar is "not an actual
 * emergency" rather than "comfortably rich". 2,500 sits well clear of the
 * CPU_CRISIS_BUCKET of 1,500 that spawn policy uses for that.
 *
 * DO NOT reuse this for anything unbounded or per-creep. It is deliberately
 * low BECAUSE these two passes are cheap and because what they build — roads —
 * is what reduces the creep headcount that costs 10.4 of the bot's 17.3 CPU.
 */
export const REMOTE_INFRA_BUCKET = 2500;

/** A ~20 CPU shard (shard3). Private servers and shard0-2 read false. */
export function lowCpuShard(): boolean {
  return (Game.cpu.limit || 20) <= 30;
}

/**
 * May the spawn buy a NEW body for an optional role right now?
 *
 * skipOptionalCreep idles Repair / Maintainer / Sweeper on a sick
 * tick, but the rungs that QUEUE them read only the bank — so live shard3 paid
 * 1800 energy for 7W7C7M repairers (E39N58: two of them, one upgrader) and
 * then never ran them. The body is paid; the work is not done. This is the
 * spawn-side twin of that latch: closed when the bucket is sick, with a
 * deadband so a roster whose members live 1,500 ticks does not flap.
 *
 * Only a 20-CPU shard ever closes. Builders are not optional: a site left
 * unbuilt is a spawn / extension / tower the room is waiting on, and
 * queueBuilder has its own bank gates.
 */
/**
 * Bucket at which the optional roster CLOSES.
 *
 * Not an emergency bar — a DUTY CYCLE bar. See optionalRosterOpen.
 */
export const OPT_ROSTER_CLOSE_BUCKET = 3000;
/** Bucket at which it REOPENS: a genuine surplus, not merely "not an emergency". */
export const OPT_ROSTER_OPEN_BUCKET = 5000;

export function optionalRosterOpen(): boolean {
  if (!lowCpuShard()) return true;
  const M: any = Memory as any;
  const bucket = Game.cpu.bucket;
  /*
   * ── THE BUCKET IS THE RESOURCE. THE AVERAGE IS NOT. ───────────────────────
   *
   * This closed at avg >= limit * 0.92 and reopened at avg < limit * 0.85 —
   * on shard3 that is close at 18.4, reopen at 17.0. The bot's natural floor
   * is 18.1: measured over 40 consecutive live ticks (2026-09-10, tick
   * 82,861,848+) it ran 17.85-18.80 with this roster ALREADY shut and every
   * remote in the empire ALREADY closed. The reopen bar sat below the
   * cheapest the bot can physically be, so once closed it could never open
   * again. Live memory read `_optRosterOpen: false` against a stable 3,354
   * bucket, and the roles it withholds had not been buyable for as long as
   * that had been true.
   *
   * What it withholds is repair, maintainer and sweeper — the room's ONLY
   * creep-side upkeep for walls and roads. The towers hold a 3,000-hit decay
   * floor on the shell (rooms.defence TOWER_SHELL_FLOOR) and a 10% floor on
   * roads, and NOTHING else touches either. So "closed forever" means every
   * rampart in the empire converges on 3,000 hits and stays there while the
   * bot reports itself healthy — which is exactly what live E38N56 showed
   * (58 ramparts, minRampart 2,981). That is not a CPU saving. It is a
   * structural loss taken on a signal that cannot clear.
   *
   * A 100-tick average of 18.3 against a limit of 20, with a bucket that is
   * NOT falling, is a bot paying its way — it is what "at budget" looks like,
   * not what "over budget" looks like. The bucket is the integral of exactly
   * that question, and it is the only signal here that can move in both
   * directions. Same conclusion getCpuPolicy already reached for remotes; see
   * the hysteresis note there.
   *
   * The per-tick brake is untouched: skipOptionalCreep still idles all three
   * roles the moment a tick crosses 90% of the limit, so a genuinely bad tick
   * still costs them their run(). This gate only decides whether a room may
   * ever BUY one.
   *
   * ── AND IT IS A DUTY CYCLE, NOT A SWITCH ──────────────────────────────────
   *
   * The first cut of this fix opened at 3,000 and closed at 2,000, which on
   * this bot means "open essentially always" — and that is not affordable.
   * Measured after reopening it: avg100 went to 21.2 against a limit of 20 and
   * the bucket fell steadily, 4,687 -> 2,535, because these roles are ~6 extra
   * creeps and creep CPU on this bot is almost entirely INTENTS at ~0.2 each
   * (Memory.CPU.path proved it: the whole fleet's PathFinder cost is 1.88 of
   * an 18.5 creeps phase, so there is no JS left to optimise away — headcount
   * IS the bill). A permanently-open roster parks the bot at a draining
   * equilibrium, and a bucket that reaches zero means the server starts
   * skipping our ticks, which is far worse than a slow wall.
   *
   * But walls do not need CONTINUOUS attention. A rampart decays 300 hits per
   * 100 ticks — 3 a tick — and a repairer buys 100 hits per energy. So the
   * honest shape is a duty cycle: open on a real surplus (5,000), run until
   * the surplus is spent (3,000), close, let the bucket rebuild, repeat. At a
   * base cost near the limit that is roughly a quarter of the time open, which
   * is many times what decay actually demands.
   *
   * It also fails safe in the right direction. If the bot's base cost is truly
   * at or over the limit the bucket never reaches 5,000 and the roster simply
   * stays shut — which is the honest answer for a bot that cannot afford it,
   * and unlike the old average-based rule it is a bar that CAN be cleared as
   * soon as the base cost comes down.
   */
  if (bucket < OPT_ROSTER_CLOSE_BUCKET) {
    M._optRosterOpen = false;
    return false;
  }
  if (bucket >= OPT_ROSTER_OPEN_BUCKET) {
    M._optRosterOpen = true;
    return true;
  }
  return M._optRosterOpen !== false;
}

export function creepRoleIsOptional(role: string | undefined): boolean {
  return !!role && OPTIONAL_CREEP_ROLES[role] === true;
}

export function skipOptionalCreep(opts: {
  role: string | undefined;
  usedCpu: number;
  limit: number;
  bucket: number;
  danger: boolean;
}): boolean {
  if (opts.danger) return false;
  if (!creepRoleIsOptional(opts.role)) return false;
  const limit = opts.limit > 0 ? opts.limit : 20;
  if (opts.usedCpu >= limit * 0.9) return true;
  const lowCpu = limit <= 30;
  if (opts.bucket < (lowCpu ? 2000 : 1000)) return true;
  return false;
}

export function cpuStatusString(): string {
  const p = getCpuPolicy();
  const avg = Memory.CPU && Memory.CPU.hundredTickAvg ? Memory.CPU.hundredTickAvg.avg : "?";
  const trueAvg = (Memory.CPU && (Memory.CPU as any).trueAvg) != null ? (Memory.CPU as any).trueAvg : "?";
  return [
    `limit=${p.limit}`,
    `bucket=${p.bucket}`,
    `avg100=${avg}`,
    `billed=${trueAvg}`,
    `postLoop=${(Memory.CPU && (Memory.CPU as any).overheadAvg) != null ? (Memory.CPU as any).overheadAvg : "?"}`,
    `remotes=${p.allowRemotes ? "ON max=" + p.maxRemotes : "OFF"}`,
    `expensive=${p.allowExpensive ? "ON" : "OFF"}`,
    `economyOnly=${p.economyOnly}`,
    `verbose=${!!Memory.verbose}`,
  ].join(" | ");
}
