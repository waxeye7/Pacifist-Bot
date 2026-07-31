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
}

const DEFAULTS: FeatureFlags = {
  disablePower: true,
  speedrun: true,
  dynamicLayout: true,
  placeFromPlan: false,
  minCutWalls: true,
  squareWalls: false,
  pickupLock: true,
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
