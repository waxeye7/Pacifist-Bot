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

import { bankEnergy } from "Rooms/spawnSafety";

export const FUNNEL_EVERY = 20;
/** Below this a send is fee-dominated noise. */
export const FUNNEL_MIN_SEND = 2000;
/** One send at most this big — spreads the fee and keeps the donor liquid. */
export const FUNNEL_MAX_SEND = 10000;
/** Energy a donor must keep after a send (defence salvo, spawn float, repair). */
export function donorReserve(level: number): number {
  if (level >= 8) return 100000;
  if (level >= 7) return 50000;
  return 30000;
}

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
  }
  const mother = pickMother(cands);
  M.funnel = { mother, t: Game.time, sent: (M.funnel && M.funnel.sent) || 0 };
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
  const rows = [`funnel: mother=${f.mother || "-"} sent=${f.sent || 0} t=${f.t}`];
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
