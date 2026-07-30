/**
 * Global feature flags (Memory.features).
 * Power is OFF by default — enabling power mode exposes rooms to enemy power creeps.
 */

export interface FeatureFlags {
  /** Never run power creep managers / spawn / processPower / enable power mode */
  disablePower: boolean;
  /**
   * Low-RCL speedrun mode: instrument ticks-to-RCL, tight eco plan, no remotes/combat noise.
   * Console: enableSpeedrun() / disableSpeedrun()
   */
  speedrun: boolean;
}

const DEFAULTS: FeatureFlags = {
  disablePower: true,
  speedrun: true,
};

export function getFeatures(): FeatureFlags {
  if (!Memory.features) {
    Memory.features = { ...DEFAULTS };
  }
  // force power off unless explicitly set false (user must opt in to danger)
  if (Memory.features.disablePower === undefined) {
    Memory.features.disablePower = true;
  }
  if (Memory.features.speedrun === undefined) {
    Memory.features.speedrun = true;
  }
  return Memory.features as FeatureFlags;
}

export function powerDisabled(): boolean {
  return getFeatures().disablePower !== false;
}

export function speedrunEnabled(): boolean {
  return !!getFeatures().speedrun;
}
