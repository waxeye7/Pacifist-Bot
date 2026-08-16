/**
 * Global feature flags (Memory.features).
 */

export interface FeatureFlags {
  /** Never run power systems / enable power mode */
  disablePower: boolean;
  /** Tick-based RCL instrumentation + early remote off */
  speedrun: boolean;
  // NOTE: `dynamicLayout` and `placeFromPlan` used to live here. Nothing read
  // them — the real placement switch is `room.memory.planV2` (see
  // rooms.construction.ts, which short-circuits into placeFromPlanV2 on its
  // presence) and demolition is gated by `room.memory.planMigration` +
  // migrationAllowed. See docs/LAYOUT-MIGRATION.md.
  /** Use min-cut for rampart perimeter (not square shell) */
  minCutWalls: boolean;
  /** Legacy square shell generator (only if minCutWalls false) */
  squareWalls: boolean;
  /**
   * Hauler energy-pickup target locking + reservation ledger.
   * ON  = lock a pickup target for LOCK_TTL ticks, reserve its energy so
   *       other haulers pick a different pile (no amount-sorted thrash).
   * OFF = legacy per-tick rescan sorted by amount (A/B baseline).
   */
  pickupLock: boolean;
  /**
   * Source-map error stack traces (ErrorMapper).
   * Default OFF. Building the SourceMapConsumer means pulling a ~1.5MB
   * main.js.map into the heap mid-tick; on shard3 that spike reliably kills the
   * isolate ("isolate disposed"), so error LOGGING itself was taking the bot
   * down. Off = log the raw stack, which is free. Only turn this on locally /
   * temporarily when you actually need the original symbol names.
   */
  sourceMaps: boolean;
  /**
   * AutoExpand is BLOCKED until an owned room reaches this RCL, once we already
   * hold 3+ rooms. Owner rule: RCL7 then RCL8 before another claim — a fourth
   * RCL4 room costs the main room's spawn time and buys ~nothing.
   * Set to 0 to disable the gate entirely. Separate from `autoExpand`, which is
   * still the on/off switch for the whole system.
   */
  expandMinRcl: number;
}

const DEFAULTS: FeatureFlags = {
  disablePower: true,
  speedrun: true,
  minCutWalls: true,
  squareWalls: false,
  pickupLock: true,
  sourceMaps: false,
  expandMinRcl: 7,
};

export function getFeatures(): FeatureFlags {
  if (!Memory.features) {
    Memory.features = { ...DEFAULTS };
  }
  const f = Memory.features as FeatureFlags;
  if (f.disablePower === undefined) f.disablePower = true;
  if (f.speedrun === undefined) f.speedrun = true;
  if (f.minCutWalls === undefined) f.minCutWalls = true;
  if (f.squareWalls === undefined) f.squareWalls = false;
  if (f.pickupLock === undefined) f.pickupLock = true;
  if (f.sourceMaps === undefined) f.sourceMaps = false;
  if (f.expandMinRcl === undefined) f.expandMinRcl = 7;
  return f;
}

/**
 * Hauler pickup target locking. Default ON.
 * NOTE: creepFunctions.ts is an ambient (non-module) script and cannot import
 * this — it reads Memory.features.pickupLock directly with the same
 * "undefined means ON" semantics. Keep the two in sync.
 */
export function pickupLockEnabled(): boolean {
  return getFeatures().pickupLock !== false;
}

export function powerDisabled(): boolean {
  return getFeatures().disablePower !== false;
}

export function speedrunEnabled(): boolean {
  return !!getFeatures().speedrun;
}

export function minCutWallsEnabled(): boolean {
  return getFeatures().minCutWalls !== false;
}

/**
 * Source-mapped error stacks. Default OFF (opt-in only) - see FeatureFlags.sourceMaps.
 * Also honours the shorthand `Memory.enableSourceMaps = true` so it can be flipped
 * from the console without touching the features object.
 */
export function sourceMapsEnabled(): boolean {
  if ((Memory as any).enableSourceMaps === true) return true;
  return getFeatures().sourceMaps === true;
}
