/**
 * WAR / REINFORCE — DistressSignals.reinforce_me used to SGD a Guard into
 * the distressed OWNED room. 2026-09-01 owner: home defence is towers. A
 * Guard cannot save RCL6 vs RCL8, and one creep is a tower shot. The fringe
 * swarm-outheal case is RampartDefender on the shell, not SGD.
 *
 * Live Guard-…-E35N58-E35N59 was this path (coma, walking into E35N59).
 * This phase is observe-only: console `reinforceStatus()`.
 */

function alreadyHelping(target: string): boolean {
  for (const name in Game.creeps) {
    const c = Game.creeps[name];
    if (!c || !c.memory) continue;
    if ((c.memory.role === "Guard" || c.memory.role === "RampartDefender") &&
        c.memory.targetRoom === target) return true;
  }
  return false;
}

export function runReinforce(): void {
  // Home defence is towers. See file header.
}

export function reinforceStatus(): string {
  const sig = Memory.DistressSignals as any;
  if (!sig || !sig.reinforce_me) return "distress: (none)";
  const age = typeof sig.sent === "number" ? Game.time - sig.sent : -1;
  return `distress: ${sig.reinforce_me}  lastSent=${age < 0 ? "never" : age + "t ago"}  helping=${alreadyHelping(sig.reinforce_me)}`;
}
