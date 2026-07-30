/**
 * A/B CPU proof for optimizations.
 *
 * Profiles:
 *   optimized — goTo replace + matrix cache + expensive gate + silent logs
 *   baseline  — native moveTo + no matrix cache + always mosquito + (verbose off still)
 *
 * Console:
 *   setProfile("baseline") | setProfile("optimized")
 *   toggleOpt("goTo") / toggleOpt("matrixCache") / ...
 *   reportCpu()
 *   benchAuto(true)  // flip profile every Memory.bench.period ticks (default 100)
 */

export type OptName = "goTo" | "matrixCache" | "expensiveGate" | "roomCache";

export interface OptFlags {
  goTo: boolean;
  matrixCache: boolean;
  expensiveGate: boolean;
  roomCache: boolean;
}

const DEFAULT_OPTIMIZED: OptFlags = {
  goTo: true,
  matrixCache: true,
  expensiveGate: true,
  roomCache: true,
};

const DEFAULT_BASELINE: OptFlags = {
  goTo: false,
  matrixCache: false,
  expensiveGate: false,
  roomCache: false,
};

/** Bump when bench schema / auto-measure defaults change */
const BENCH_VERSION = 3;

function ensureBench() {
  if (!Memory.bench || Memory.bench.v !== BENCH_VERSION) {
    Memory.bench = {
      v: BENCH_VERSION,
      profile: "optimized",
      opts: { ...DEFAULT_OPTIMIZED },
      // first boot of this version: auto A/B so we collect proof without console
      auto: true,
      period: 50,
      samples: {
        optimized: { n: 0, sum: 0, max: 0 },
        baseline: { n: 0, sum: 0, max: 0 },
      },
      lastFlip: Game.time,
      recent: [],
    };
  }
  if (!Memory.bench.opts) Memory.bench.opts = { ...DEFAULT_OPTIMIZED };
  if (!Memory.bench.samples) {
    Memory.bench.samples = {
      optimized: { n: 0, sum: 0, max: 0 },
      baseline: { n: 0, sum: 0, max: 0 },
    };
  }
  if (Memory.bench.v == null) Memory.bench.v = BENCH_VERSION;
  return Memory.bench;
}

export function getOpts(): OptFlags {
  const b = ensureBench();
  return b.opts as OptFlags;
}

export function optEnabled(name: OptName): boolean {
  const o = getOpts();
  return !!o[name];
}

export function setProfile(name: "optimized" | "baseline"): string {
  const b = ensureBench();
  b.profile = name;
  b.opts = { ...(name === "optimized" ? DEFAULT_OPTIMIZED : DEFAULT_BASELINE) };
  // keep silent unless user wants spam
  if (Memory.verbose === undefined) Memory.verbose = false;
  return `profile=${name} opts=${JSON.stringify(b.opts)}`;
}

export function toggleOpt(name: OptName): string {
  const b = ensureBench();
  const o = b.opts as OptFlags;
  if (o[name] === undefined) return `unknown opt ${name}`;
  o[name] = !o[name];
  b.profile = "custom";
  return `${name}=${o[name]} (profile=custom)`;
}

export function setOpt(name: OptName, value: boolean): string {
  const b = ensureBench();
  (b.opts as OptFlags)[name] = !!value;
  b.profile = "custom";
  return `${name}=${!!value}`;
}

export function benchAuto(on: boolean, period?: number): string {
  const b = ensureBench();
  b.auto = !!on;
  if (period && period >= 20) b.period = period;
  // start window NOW so we don't flip every tick when lastFlip was 0
  b.lastFlip = Game.time;
  b.profile = b.profile === "baseline" ? "baseline" : "optimized";
  return `benchAuto=${b.auto} period=${b.period} profile=${b.profile}`;
}

/** Call once per tick after measuring tick CPU */
export function recordTick(cpuUsed: number): void {
  const b = ensureBench();

  // auto flip profiles (sample current window first, flip after period)
  if (b.auto && b.period > 0) {
    if (b.lastFlip == null || b.lastFlip === 0) {
      b.lastFlip = Game.time;
    }
    if (Game.time - b.lastFlip >= b.period) {
      const next = b.profile === "baseline" ? "optimized" : "baseline";
      // apply profile opts without wiping sample counters
      b.profile = next;
      b.opts = {
        ...(next === "optimized"
          ? { goTo: true, matrixCache: true, expensiveGate: true, roomCache: true }
          : { goTo: false, matrixCache: false, expensiveGate: false, roomCache: false }),
      };
      b.lastFlip = Game.time;
      // still record this tick under the NEW profile
    }
  }

  const bucketKey = b.profile === "baseline" ? "baseline" : "optimized";
  const s = b.samples[bucketKey];
  s.n += 1;
  s.sum += cpuUsed;
  if (cpuUsed > s.max) s.max = cpuUsed;

  // ring buffer of last samples
  if (!b.recent) b.recent = [];
  b.recent.push({ t: Game.time, p: b.profile, cpu: Number(cpuUsed.toFixed(3)) });
  if (b.recent.length > 60) b.recent.shift();
}

export function reportCpu(): string {
  const b = ensureBench();
  const lines: string[] = [];
  lines.push(`profile=${b.profile} auto=${!!b.auto} period=${b.period || 100}`);
  lines.push(`opts=${JSON.stringify(b.opts)}`);

  for (const key of ["optimized", "baseline"] as const) {
    const s = b.samples[key];
    if (!s || s.n === 0) {
      lines.push(`${key}: no samples yet`);
    } else {
      const avg = s.sum / s.n;
      lines.push(`${key}: n=${s.n} avg=${avg.toFixed(3)} max=${Number(s.max).toFixed(3)}`);
    }
  }

  const o = b.samples.optimized;
  const base = b.samples.baseline;
  if (o.n >= 10 && base.n >= 10) {
    const avgO = o.sum / o.n;
    const avgB = base.sum / base.n;
    const delta = avgB - avgO;
    const pct = avgB > 0 ? (delta / avgB) * 100 : 0;
    lines.push(
      `PROOF: optimized is ${delta >= 0 ? "FASTER" : "SLOWER"} by ${Math.abs(delta).toFixed(3)} cpu (${pct >= 0 ? pct.toFixed(1) : (-pct).toFixed(1)}% vs baseline)`,
    );
  } else {
    lines.push(`PROOF: need ≥10 samples each (opt n=${o.n}, base n=${base.n}) — run benchAuto(true) or switch profiles`);
  }

  if (b.recent && b.recent.length) {
    const last = b.recent.slice(-5);
    lines.push(`recent: ${last.map((r) => `${r.p[0]}${r.cpu}`).join(" ")}`);
  }

  return lines.join("\n");
}

export function clearBench(): string {
  const b = ensureBench();
  b.samples = {
    optimized: { n: 0, sum: 0, max: 0 },
    baseline: { n: 0, sum: 0, max: 0 },
  };
  b.recent = [];
  return "bench samples cleared";
}
