/**
 * ---------------------------------------------------------------------------
 * WHERE THE CREEP CPU ACTUALLY GOES
 *
 * Memory.CPU.roles (Managers/RunCreepManager) says WHICH role is expensive.
 * Live shard3 2026-09-10 it said: filler 0.33-0.51 CPU per creep per tick,
 * against ControllerLinkFiller at 0.13 — two roles that do the same physical
 * job (withdraw from the bank, walk a few tiles, transfer) and differ mainly
 * in how often they change target. That is a hypothesis about PathFinder, and
 * it was worth exactly nothing until it was measured.
 *
 * So measure it. PathFinder.search is wrapped ONCE here, at module load, which
 * catches every custom mover in the bot (creepFunctions has eight call sites,
 * plus the flee paths) without touching any of them. Native moveTo() pathing
 * happens inside the engine and is NOT visible here — a gap that is itself
 * informative: a big `creeps` phase with a small `path` total means the cost
 * is in finds and intents, not in our own A*.
 *
 * Cost of the instrument: two getUsed() calls and an object write per search.
 * getUsed() is ~0.0015, and a search that is worth counting is 0.1-0.3, so the
 * measurement is under 2% of the thing it measures.
 *
 * Read it with `Memory.CPU.path`:
 *
 *   { filler: { n: 0.9, cpu: 0.21 }, ... }   n = searches per tick for the
 *                                            whole role, cpu = CPU per tick
 *
 * `n` near the creep count for a role means it repaths EVERY TICK, which for
 * a hub shuttle walking three tiles is the finding, not the noise.
 * ---------------------------------------------------------------------------
 */

/** Role whose run() is currently executing; set by RunCreepManager. */
let currentRole = "?";

const tickCpu: { [role: string]: number } = {};
const tickN: { [role: string]: number } = {};
const ema: { [role: string]: { cpu: number; n: number } } = {};
let statTick = -1;
const ALPHA = 0.05;

export function setPathRole(role: string): void {
  currentRole = role || "?";
}

function fold(): void {
  if (statTick === Game.time) return;
  for (const r in tickCpu) {
    const prev = ema[r];
    const cpu = tickCpu[r];
    const n = tickN[r];
    ema[r] = prev
      ? { cpu: prev.cpu + ALPHA * (cpu - prev.cpu), n: prev.n + ALPHA * (n - prev.n) }
      : { cpu, n };
    tickCpu[r] = 0;
    tickN[r] = 0;
  }
  if (Game.time % 20 === 0 && Memory.CPU) {
    const out: any = {};
    let totalCpu = 0;
    let totalN = 0;
    for (const r in ema) {
      out[r] = { cpu: Math.round(ema[r].cpu * 100) / 100, n: Math.round(ema[r].n * 10) / 10 };
      totalCpu += ema[r].cpu;
      totalN += ema[r].n;
    }
    out._all = { cpu: Math.round(totalCpu * 100) / 100, n: Math.round(totalN * 10) / 10 };
    (Memory.CPU as any).path = out;
  }
  statTick = Game.time;
}

function note(used: number): void {
  fold();
  tickCpu[currentRole] = (tickCpu[currentRole] || 0) + used;
  tickN[currentRole] = (tickN[currentRole] || 0) + 1;
}

/**
 * Install the wrapper. Idempotent, and a no-op if PathFinder is absent (unit
 * tests run without the engine globals).
 */
export function installPathStats(): void {
  const pf: any = typeof PathFinder !== "undefined" ? PathFinder : null;
  if (!pf || typeof pf.search !== "function" || pf.__pacStats) return;
  const inner = pf.search;
  pf.search = function wrappedSearch(this: any, ...args: any[]): any {
    const before = Game.cpu.getUsed();
    const result = inner.apply(this, args);
    note(Game.cpu.getUsed() - before);
    return result;
  };
  pf.__pacStats = true;
}
