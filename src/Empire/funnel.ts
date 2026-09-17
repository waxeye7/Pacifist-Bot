/**
 * EMPIRE / FUNNEL — energy flows to the room closest to RCL8.
 *
 * On a 20-CPU shard every room is pinned to ONE upgrader (rooms.spawning
 * upgraderCpuCap), so a 2-source room banks its surplus and the bank just
 * sits there: live shard3 E36N57 held 46k at RCL5 with a single 12-WORK
 * upgrader. Meanwhile the empire's only RCL6 room (E37N59) hovered on the 10k
 * park floor. RCL8 is the war engine (observer, 6 towers, 10 labs, power), and
 * the owner's direction is "energy to good use until RCL7/8, then war".
 *
 * A terminal send is the one transfer in the game that costs no creep CPU:
 * ~3% fee at range 1-2, one intent. So:
 *
 *   mother  = the owned room with the highest RCL (ties: highest progress)
 *             that has a storage and a spawn. Never an RCL8 room unless every
 *             room is RCL8.
 *   donor   = every OTHER owned room with a terminal and a storage. It keeps
 *             a reserve (defence + spawn float, per RCL) and ships the rest.
 *
 * Donors keep their one upgrader; only the surplus above the reserve moves.
 * The mother is exempt from the CPU clamp up to 3 upgraders (spawning reads
 * funnelMother()), and energyManager keeps a donor's terminal stocked with
 * exactly the surplus it is about to send (funnelDonorTerminalTarget).
 */

import { bankEnergy, canSafeModeNow, emergencyShellActive, siteFreezeBank } from "Rooms/spawnSafety";

export const FUNNEL_EVERY = 20;
/** Below this a send is fee-dominated noise. */
export const FUNNEL_MIN_SEND = 2000;
/** One send at most this big — spreads the fee and keeps the donor liquid. */
export const FUNNEL_MAX_SEND = 10000;
/**
 * Energy a donor must keep after a send (defence salvo, spawn float, repair).
 * The same ladder the room's own broke clamp uses: a room does not ship
 * energy it would itself call broke.
 */
export function donorReserve(level: number): number {
  return siteFreezeBank(level);
}
/** An emergency-shell room stops requesting once it can fund the wall itself. */
export const EMERGENCY_FUNNEL_TARGET = 200000;

export interface MotherCandidate {
  name: string;
  level: number;
  progress: number;
  hasStorage: boolean;
  hasSpawn: boolean;
}

/**
 * Pure: which room receives. null when nobody qualifies — including when
 * every room is already RCL8: GCL credits energy wherever it is upgraded, so
 * moving it then only pays the fee.
 */
export function pickMother(rooms: MotherCandidate[]): string | null {
  let best: MotherCandidate | null = null;
  for (const r of rooms) {
    if (!r.hasStorage || !r.hasSpawn) continue;
    if (r.level < 5 || r.level >= 8) continue;
    if (!best || r.level > best.level || (r.level === best.level && r.progress > best.progress)) best = r;
  }
  return best ? best.name : null;
}

/** Pure: what a donor at `level` holding `bank` may ship. */
export function donorSurplus(bank: number, level: number): number {
  return Math.max(0, bank - donorReserve(level));
}

/**
 * Pure: the size of one send. Fee is paid ON TOP from the terminal, so the
 * terminal must hold amount + fee; `terminalEnergy` bounds it.
 */
export function sendAmount(surplus: number, terminalEnergy: number, feeRate: number, motherFree: number): number {
  let amount = Math.min(surplus, FUNNEL_MAX_SEND, motherFree);
  const affordable = Math.floor(terminalEnergy / (1 + feeRate));
  amount = Math.min(amount, affordable);
  return amount >= FUNNEL_MIN_SEND ? amount : 0;
}

export function funnelMother(): string | null {
  const m: any = (Memory as any).funnel;
  return m && m.mother ? m.mother : null;
}

export interface EmergencyCandidate {
  name: string;
  level: number;
  bank: number;
  canSafeMode: boolean;
  hasTerminal: boolean;
}

/**
 * Pure: which room gets the emergency pass — the thinnest RCL6-7 room that
 * cannot safe-mode and still cannot fund its own shell. The emergency is
 * declared by PlanV2 (shellEmergency) — the funnel only ships to it.
 */
export function pickEmergencyTarget(rooms: EmergencyCandidate[]): string | null {
  let best: EmergencyCandidate | null = null;
  for (const r of rooms) {
    if (!r.hasTerminal) continue;
    if (!emergencyShellActive(r.level, r.canSafeMode)) continue;
    if (r.bank >= EMERGENCY_FUNNEL_TARGET) continue;
    if (!best || r.bank < best.bank) best = r;
  }
  return best ? best.name : null;
}

/** The floor every OTHER subsystem calls "not poor" (rooms.spawning UPGRADE_FLOOR). */
export const PARK_FLOOR_MIN = 10000;

/**
 * Where a live upgrader / CLF parks instead of draining storage.
 *
 * ── SHIPPING AND UPGRADING ARE DIFFERENT QUESTIONS ──────────────────────────
 *
 * This used to return donorReserve() for a donor — the same number
 * donorSurplus() uses — and that conflated two decisions that point opposite
 * ways when a room is thin:
 *
 *   SHIPPING   exports energy. A thin room must not do it, which is exactly
 *              what donorReserve is for, and donorSurplus enforces alone.
 *   UPGRADING  converts energy to GCL in place. It is the entire point of the
 *              empire, and it is the LAST thing a thin room should stop doing.
 *
 * Reusing one number for both meant a thin donor stopped upgrading and kept
 * everything else running. The justification given was that parking is not
 * stopping — a parked upgrader still lives on what the controller link pushes
 * at it, which is income rather than savings. That is true only when a SOURCE
 * link feeds the controller link. Where the depot is fed from the bank, the
 * creep doing the feeding is the ControllerLinkFiller — which parks on this
 * very same band.
 *
 * So the two creeps deadlocked each other. Live shard3, 2026-09-09: E38N56,
 * E36N57, E35N59 and E37N58 each had BOTH their upgrader and their CLF flagged
 * bankParked at once. The CLF is the only thing that stocks the depot the
 * upgrader is waiting at, so the depot stayed empty, the upgrader fell through
 * to the storage branch, and this band switched that off too. E38N56's
 * controller progress did not move at all between two polls 45 ticks apart,
 * with 16,254 banked and a healthy roster of nine creeps.
 *
 * ONE FLOOR FOR EVERY ROOM, and it costs the funnel nothing: donorSurplus()
 * independently refuses to ship below donorReserve, so an upgrader burning
 * down to PARK_FLOOR_MIN can never spend energy the funnel had earmarked. A
 * room above donorReserve is above this floor anyway, so nothing changes for a
 * rich donor — the fix only reaches the rooms that were frozen.
 *
 * PARK_FLOOR_MIN is the number the rest of the bot already means by "not
 * poor": rooms.spawning UPGRADE_FLOOR, the floor its own comment calls "the
 * real floor". Below it the upgraders live on link and container income while
 * the bank rebuilds, which is the behaviour this band was always described as
 * having.
 */
export function upgradeParkBand(
  room: { name?: string; controller?: { level?: number } },
): { floor: number; resume: number } {
  void room;
  return { floor: PARK_FLOOR_MIN, resume: PARK_FLOOR_MIN + 2000 };
}

/** What energyManager should keep in a donor's terminal: its surplus, capped. */
export function funnelDonorTerminalTarget(room: Room): number {
  const mother = funnelMother();
  if (!mother || mother === room.name) return 0;
  if (!room.terminal || !room.terminal.my || !room.storage || !room.storage.my) return 0;
  if (!room.controller || !room.controller.my) return 0;
  const surplus = donorSurplus(bankEnergy(room), room.controller.level);
  if (surplus < FUNNEL_MIN_SEND) return 0;
  return Math.min(surplus, FUNNEL_MAX_SEND * 2);
}

export function runFunnel(): void {
  if (Game.time % FUNNEL_EVERY !== 7) return;
  const M: any = Memory as any;
  const cands: MotherCandidate[] = [];
  const emergencyCands: EmergencyCandidate[] = [];
  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    if (!room.controller || !room.controller.my) continue;
    cands.push({
      name,
      level: room.controller.level,
      progress: room.controller.progress || 0,
      hasStorage: !!(room.storage && room.storage.my),
      hasSpawn: room.find(FIND_MY_SPAWNS).length > 0,
    });
    emergencyCands.push({
      name,
      level: room.controller.level,
      bank: bankEnergy(room),
      canSafeMode: canSafeModeNow(room.controller, Game.time),
      hasTerminal: !!(room.terminal && room.terminal.my),
    });
  }

  /*
   * SHELL EMERGENCY outranks the mother. An RCL6-7 room that cannot safe-mode
   * is one raid from losing its controller, and a shell is ~50k of build the
   * room cannot fund off its own broke bank — so EVERY donor ships its
   * surplus to the thinnest such room this pass (the one-send-per-pass drip
   * is too slow to wall up under fire). Donor rules are unchanged: keep the
   * reserve, keep the fee cover, skip danger rooms — and a room that cannot
   * safe-mode itself never gives its bank away.
   */
  const emergencyTarget = pickEmergencyTarget(emergencyCands);
  if (emergencyTarget) {
    const target = Game.rooms[emergencyTarget];
    let targetFree = target && target.terminal && target.terminal.my
      ? target.terminal.store.getFreeCapacity(RESOURCE_ENERGY) - 5000
      : 0;
    let emergencySent = 0;
    if (targetFree >= FUNNEL_MIN_SEND) {
      for (const name in Game.rooms) {
        if (name === emergencyTarget) continue;
        const room = Game.rooms[name];
        if (!room.controller || !room.controller.my) continue;
        if (!room.terminal || !room.terminal.my || !room.storage || !room.storage.my) continue;
        if (room.terminal.cooldown > 0) continue;
        if (room.memory && room.memory.danger) continue;
        if (emergencyShellActive(room.controller.level, canSafeModeNow(room.controller, Game.time))) continue;
        const surplus = donorSurplus(bankEnergy(room), room.controller.level);
        if (surplus < FUNNEL_MIN_SEND) continue;
        const feeRate = 1 - Math.exp(-Game.map.getRoomLinearDistance(name, emergencyTarget, true) / 30);
        const amount = sendAmount(surplus, room.terminal.store[RESOURCE_ENERGY] || 0, feeRate, targetFree);
        if (!amount) continue;
        if (room.terminal.send(RESOURCE_ENERGY, amount, emergencyTarget, "funnel-emergency") === OK) {
          emergencySent += amount;
          targetFree -= amount;
          console.log("[funnel] EMERGENCY", name, "->", emergencyTarget, amount, "energy (no safe mode, surplus", surplus + ")");
          if (targetFree < FUNNEL_MIN_SEND) break;
        }
      }
    }
    if (emergencySent > 0) {
      // Keep the last-elected mother in memory — rooms.spawning reads
      // funnelMother() for the upgrader CPU-clamp exemption, and a null
      // would flicker that off every emergency pass.
      M.funnel = { mother: (M.funnel && M.funnel.mother) || null, emergency: emergencyTarget, t: Game.time, sent: ((M.funnel && M.funnel.sent) || 0) + emergencySent };
      return;
    }
    // Nobody could send this pass — fall through to the normal mother flow.
    // The emergency flag still publishes so funnelStatus shows it is active.
  }

  const mother = pickMother(cands);
  M.funnel = { mother, emergency: emergencyTarget || undefined, t: Game.time, sent: (M.funnel && M.funnel.sent) || 0 };
  if (!mother) return;
  const target = Game.rooms[mother];
  if (!target || !target.terminal || !target.terminal.my) return;
  const motherFree = target.terminal.store.getFreeCapacity(RESOURCE_ENERGY) - 5000;
  if (motherFree < FUNNEL_MIN_SEND) return;

  for (const name in Game.rooms) {
    if (name === mother) continue;
    const room = Game.rooms[name];
    if (!room.controller || !room.controller.my) continue;
    if (!room.terminal || !room.terminal.my || !room.storage || !room.storage.my) continue;
    if (room.terminal.cooldown > 0) continue;
    if (room.memory && room.memory.danger) continue;
    const surplus = donorSurplus(bankEnergy(room), room.controller.level);
    if (surplus < FUNNEL_MIN_SEND) continue;
    const feeRate = 1 - Math.exp(-Game.map.getRoomLinearDistance(name, mother, true) / 30);
    const amount = sendAmount(surplus, room.terminal.store[RESOURCE_ENERGY] || 0, feeRate, motherFree);
    if (!amount) continue;
    if (room.terminal.send(RESOURCE_ENERGY, amount, mother, "funnel") === OK) {
      M.funnel.sent += amount;
      console.log("[funnel]", name, "->", mother, amount, "energy (surplus", surplus + ")");
      // one send per pass: the mother's free capacity is a shared budget
      return;
    }
  }
}

export function funnelStatus(): string {
  const M: any = Memory as any;
  const f = M.funnel;
  if (!f) return "funnel: not run yet";
  const rows = [`funnel: mother=${f.mother || "-"} emergency=${f.emergency || "-"} sent=${f.sent || 0} t=${f.t}`];
  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    if (!room.controller || !room.controller.my) continue;
    const lvl = room.controller.level;
    const bank = bankEnergy(room);
    const term = room.terminal && room.terminal.my ? room.terminal.store[RESOURCE_ENERGY] || 0 : -1;
    rows.push(`  ${name} RCL${lvl} bank=${bank} terminal=${term} surplus=${donorSurplus(bank, lvl)}${name === f.mother ? "  <- mother" : ""}`);
  }
  return rows.join("\n");
}
