/**
 * Global feature flags (Memory.features).
 */

export interface FeatureFlags {
  /** Never run power systems / enable power mode */
  disablePower: boolean;
  /** Tick-based RCL instrumentation + early remote off */
  speedrun: boolean;
  /**
   * Compute & cache dynamic basePlan (hub + stamps + min-cut perimeter).
   * Does not place sites by itself.
   */
  dynamicLayout: boolean;
  /**
   * Place construction sites from basePlan (dangerous if dual-stamping legacy).
   * Default OFF until suite + migration look good.
   */
  placeFromPlan: boolean;
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
}

const DEFAULTS: FeatureFlags = {
  disablePower: true,
  speedrun: true,
  dynamicLayout: true,
  placeFromPlan: false,
  minCutWalls: true,
  squareWalls: false,
  pickupLock: true,
  sourceMaps: false,
};

export function getFeatures(): FeatureFlags {
  if (!Memory.features) {
    Memory.features = { ...DEFAULTS };
  }
  const f = Memory.features as FeatureFlags;
  if (f.disablePower === undefined) f.disablePower = true;
  if (f.speedrun === undefined) f.speedrun = true;
  if (f.dynamicLayout === undefined) f.dynamicLayout = true;
  if (f.placeFromPlan === undefined) f.placeFromPlan = false;
  if (f.minCutWalls === undefined) f.minCutWalls = true;
  if (f.squareWalls === undefined) f.squareWalls = false;
  if (f.pickupLock === undefined) f.pickupLock = true;
  if (f.sourceMaps === undefined) f.sourceMaps = false;
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

export function dynamicLayoutEnabled(): boolean {
  return !!getFeatures().dynamicLayout;
}

export function placeFromPlanEnabled(): boolean {
  return !!getFeatures().placeFromPlan;
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
