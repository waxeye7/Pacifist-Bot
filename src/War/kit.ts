/**
 * WAR / KIT — cheapest sufficient response for one intel record.
 *
 * Replaces the observe if/else + Math.random() tree. Deterministic.
 * Uses existing spawn primitives (SGD / SD / SQR / SCCK / mosquito queue).
 *
 *   prey in the open          → small Guard
 *   spawn, no towers          → fat Guard (or Duo if armed)
 *   towers                    → quad (or nothing). NEVER a naked CCK.
 *   towers + boosts + bucket  → boosted RangedQuad
 *   upgradeBlocked + dry      → boosted MeleeQuad (the breach)
 *   enemy remote              → small Guard, or mosquito if we can afford it
 *   owned, towers gone/dry    → CCK to lock safe mode. Hot towers: no CCK.
 */

import { RoomIntel, STALE_TICKS } from "./intel";
import { TOWER_FLOOR } from "Roles/filler";
import { TargetScore, TIER_NONE } from "./score";
import { ownedRooms, myUsername, withinTravelBudget } from "./reach";
import { roomDistance } from "./geo";
import {
  guardInFlight,
  guardsOn,
  duoInFlight,
  quadInFlight,
  cckInFlight,
  mosquitoInFlight,
  solomonInFlight,
  expensiveInFlight,
} from "./flight";

export type KitKind =
  | "none"
  | "guard-prey"
  | "guard-raid"
  | "duo"
  | "ranged-quad"
  | "ranged-quad-boost"
  | "melee-quad-boost"
  | "cck"
  | "mosquito";

export interface Kit {
  kind: KitKind;
  home: string;
  target: string;
  boosted: boolean;
  followCck: boolean;
  why: string;
}

export const GUARD_PREY: BodyPartConstant[] = [
  MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE,
];
export const GUARD_RAID: BodyPartConstant[] = [
  MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
  ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
  ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
  ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
  MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
];

const RANGE = 5;

function storeOf(room: Room, res: ResourceConstant): number {
  return ((room.storage && room.storage.store[res]) || 0) + ((room.terminal && room.terminal.store[res]) || 0);
}

/**
 * ---------------------------------------------------------------------------
 * WAR SPENDS SURPLUS, NEVER SEED CORN.
 *
 * `pickHome` used to accept any owned room whose `energyAvailable` cleared a
 * threshold — and for quads, duos and CCKs that threshold was literally `1`.
 * `energyAvailable` is the transient extension fill, not what a room can
 * afford: it climbs a few energy per tick whenever the fillers get a moment,
 * so every room reads "rich" eventually, including one that is dying.
 *
 * Live shard3 E37N59, the empire's ONLY RCL6 and therefore the only room that
 * cleared `minRcl` for a quad: storage at 0, both towers dry (4 and 0 of
 * 1000), 24 of 37 extensions empty, refilling at ~7 energy/tick. It was picked
 * as the home for every offensive in range and ended up holding 7000 energy of
 * squad bodies plus 4600 of maintainer/remote-repair at the head of a queue it
 * could not pay. It then could not hatch a 250-energy filler, its miners
 * shrank to 2 WORK, and its income fell further — a closed loop that does not
 * open on its own.
 *
 * So a home is now judged on what it actually holds, and on whether it is
 * visibly failing to run itself.
 * ---------------------------------------------------------------------------
 */

/** Energy in the bank a room must still hold after paying, per unit of kit. */
const WAR_BANK_MULTIPLE = 3;
/** Flat floor on top of that, so a cheap kit still needs a real bank. */
const WAR_BANK_FLOOR = 2000;
/** A head stuck this long means the room cannot hatch what it already owes. */
const WAR_STALL_BLOCK = 40;
/** Below this a kit is funded out of income and a pre-storage room may pay it. */
const CHEAP_KIT = 1000;
/**
 * Duos and quads spawn from RCL7+ only. The one RCL6 room on live shard3
 * was the home for 604 ranged-quad dispatches (Memory.war.stats) — 7000
 * energy a time out of a 12-46k bank, on a 20-CPU shard — and the bucket
 * went to 1000. Owner (2026-08-26): "rcl 6 should be pretty lowkey, just
 * cheap attackers wherever possible". Guards (650 / 3170) stay at RCL1+.
 */
export const WAR_HEAVY_MIN_RCL = 7;
/**
 * A storage room must hold at least this much before it funds ANY offence,
 * whatever the kit costs. Memory.war.minBank overrides. This used to be an
 * EMPIRE-wide gate (every RCL4+ room >= 20k or nobody fights) — one fresh
 * RCL4 room switched the whole doctrine off. Now it is per home.
 */
export const WAR_MIN_BANK_HOME = 10000;
export function warMinBank(): number {
  const m: any = (Memory as any).war;
  return m && typeof m.minBank === "number" ? m.minBank : WAR_MIN_BANK_HOME;
}

function bankEnergy(room: Room): number {
  return storeOf(room, RESOURCE_ENERGY);
}

/**
 * True when the room is visibly failing to run itself. Deliberately reads
 * standing state (towers, bank, stall) rather than `energyAvailable`, which
 * says nothing about whether a room is solvent.
 */
export function economyStressed(room: Room): boolean {
  const mem: any = room.memory || {};
  if ((mem.spawnStall || 0) > WAR_STALL_BLOCK) return true;
  // A room that cannot keep its own towers wet has no business funding an
  // offensive — it cannot defend the base the offensive is launched from.
  //
  // The bar is TOWER_FLOOR, the same number the fill layer tops a tower up to
  // before it goes back to filling extensions, and it is imported rather than
  // repeated on purpose. Half of TOWER_CAPACITY was the obvious-looking choice
  // and it is wrong: towers only climb past the floor once every spawn and
  // extension in the room is full, which in a room that is actively spending
  // is almost never — so a "below half" test reads every busy, healthy room as
  // stressed and quietly switches offence off for good.
  const towers: any[] = room.find(FIND_MY_STRUCTURES, {
    filter: (s: any) => s.structureType === STRUCTURE_TOWER,
  });
  for (let i = 0; i < towers.length; i++) {
    if ((towers[i].store[RESOURCE_ENERGY] || 0) < TOWER_FLOOR) return true;
  }
  return false;
}

/** Can this room pay for a kit of `cost` and still run itself afterwards? */
export function canFund(room: Room, cost: number): boolean {
  if (economyStressed(room)) return false;
  // Pre-storage rooms have no bank and fund out of income. The only thing they
  // are ever asked for is a single guard, and the tower/stall tests above have
  // already ruled out the ones that are struggling.
  if (!room.storage || !room.storage.my) {
    // spawn triage drops Guard from a broke pre-storage room the next tick.
    // energyCapacity >= cost is not enough — the queue never hatches.
    if (room.energyAvailable < room.energyCapacityAvailable * 0.5) return false;
    return cost <= CHEAP_KIT && room.energyCapacityAvailable >= cost;
  }
  return bankEnergy(room) >= Math.max(cost * WAR_BANK_MULTIPLE + WAR_BANK_FLOOR, warMinBank());
}

/**
 * What each kit costs the room that funds it, rounded UP. These only gate
 * affordability, so guessing high just makes the bot wait for a fatter room.
 * Quad totals are the sum of all four bodies (RCL6 SQR: 2100+2100+1400+1400).
 */
export const KIT_COST = {
  guardPrey: 650, // GUARD_PREY exactly (5 ATTACK + 5 MOVE)
  guardRaid: 3300, // GUARD_RAID exactly: 25 ATTACK + 25 MOVE = 3250
  duo: 11000, // ~6960 at RCL7, ~10750 at RCL8
  quad: 25000, // ~18000 at RCL7, ~25000 at RCL8 — 7000 was the unreachable RCL6 sum
  quadBoost: 26000,
  cck: 9900, // ~9880
  mosquito: 9000,
};

/**
 * Closest solvent home by straight-line distance that the creep can actually
 * WALK to. pickHome used to stop at roomDistance and let issue()'s
 * withinTravelBudget reject afterwards — with no second choice, a target
 * whose nearest funder routes around an SK wall (2 rooms straight-line, 14
 * real hops) was re-picked and refused every pass forever. Now the walk is
 * part of the pick: candidates are tried nearest-first and the first one the
 * router can reach inside MAX_TRAVEL_HOPS wins.
 *
 * `walks` is false only for kits with no creep to strand (mosquito — the
 * dispatch row is memory-side; issue() exempts it for the same reason).
 */
function pickHome(target: string, minRcl: number, cost: number, walks: boolean = true): string {
  const owned = ownedRooms();
  const candidates: { name: string; d: number }[] = [];
  for (let i = 0; i < owned.length; i++) {
    const room = Game.rooms[owned[i]];
    if (!room || !room.controller || !room.controller.my) continue;
    if (room.controller.level < minRcl) continue;
    if (room.memory && room.memory.danger) continue;
    if (!room.find(FIND_MY_SPAWNS).length) continue;
    if (!canFund(room, cost)) continue;
    const d = roomDistance(owned[i], target);
    if (d > RANGE) continue;
    candidates.push({ name: owned[i], d });
  }
  candidates.sort((a, b) => a.d - b.d || (a.name < b.name ? -1 : 1));
  for (const c of candidates) {
    if (walks && !withinTravelBudget(c.name, target)) continue;
    return c.name;
  }
  return "";
}

function canBoostQuad(home: string): boolean {
  const room = Game.rooms[home];
  if (!room || !room.controller || room.controller.level < 8 || !room.memory.labs) return false;
  if (!room.memory.labs.outputLab2 || !room.memory.labs.outputLab4 || !room.memory.labs.outputLab5) return false;
  return (
    storeOf(room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) >= 1200 &&
    storeOf(room, RESOURCE_CATALYZED_KEANIUM_ALKALIDE) >= 2400 &&
    storeOf(room, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) >= 2400
  );
}

function canBoostMelee(home: string): boolean {
  const room = Game.rooms[home];
  if (!room || !room.controller || room.controller.level < 8 || !room.memory.labs) return false;
  if (!room.memory.labs.outputLab2 || !room.memory.labs.outputLab3 || !room.memory.labs.outputLab5) return false;
  return (
    storeOf(room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) >= 1200 &&
    storeOf(room, RESOURCE_CATALYZED_UTRIUM_ACID) >= 2400 &&
    storeOf(room, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) >= 2400
  );
}

function kit(kind: KitKind, home: string, target: string, why: string, extra?: Partial<Kit>): Kit {
  return {
    kind,
    home,
    target,
    boosted: !!extra && !!extra.boosted,
    followCck: extra && extra.followCck !== undefined ? extra.followCck : false,
    why,
  };
}

const NONE: Kit = { kind: "none", home: "", target: "", boosted: false, followCck: false, why: "" };

export function pickKit(target: string, rec: RoomIntel, scored: TargetScore | null): Kit {
  if (rec.o && rec.o === myUsername()) return kit("none", "", target, "self");
  if (scored && scored.tier === TIER_NONE && scored.why && scored.why.indexOf("ally") === 0) {
    return kit("none", "", target, scored.why);
  }
  if (rec.sa) return kit("none", "", target, "safe-mode");

  const live = !!Game.rooms[target];
  const age = Game.time - rec.t;
  if (!live && age > STALE_TICKS) return kit("none", "", target, "intel-stale");

  const bucket = Game.cpu.bucket;
  const towers = rec.tw || 0;
  const spawns = rec.sp || 0;
  const armed = rec.hb || 0;
  const prey = rec.he || 0;
  const hostiles = rec.hc || 0;
  const owned = !!rec.o;
  // A remote WE reserved is not a harassment target. scoreRoom already gives
  // self-remotes 0, but a floor-0 tune or a direct pickKit call reached the
  // mosquito branch on our own reservation — exclude it here.
  const remote = !owned && !!rec.rv && rec.rv !== myUsername();
  const blocked = !!(rec.ub && rec.ub > Game.time);
  // Unknown tower energy is HOT. Only te === 0 is dry.
  const towersDry = towers > 0 && rec.te === 0;
  const towersHot = towers > 0 && rec.te !== 0;
  // Unboosted SCCK is 15 CLAIM + 1 ATTACK + 0 HEAL. Towers delete it
  // before it reaches the controller. CCK is a lock, not an assault.
  const wantCck = owned && !cckInFlight(target) && !towersHot;

  // --- remotes / open rooms ------------------------------------------------
  if (!owned) {
    if (mosquitoInFlight(target) || guardInFlight(target)) {
      return kit("none", "", target, "already-on-it");
    }
    if (hostiles || prey || rec.inv) {
      const home = pickHome(target, 1, KIT_COST.guardPrey);
      if (!home) return kit("none", "", target, "no-home-for-guard");
      return kit("guard-prey", home, target, remote ? "remote-prey" : "open-prey");
    }
    if (remote) {
      // Mosquito dispatch is memory-side — issue() exempts it from the travel
      // budget, so the home pick ignores it too.
      const home = pickHome(target, 8, KIT_COST.mosquito, false);
      if (home && bucket >= 3000) {
        return kit("mosquito", home, target, "harass-remote");
      }
    }
    return kit("none", "", target, "nothing-to-kill");
  }

  // --- owned enemy ---------------------------------------------------------
  if (guardInFlight(target) || duoInFlight(target) || quadInFlight(target) || solomonInFlight(target)) {
    // One small Guard vs a spawn/extension pile leaves the job half-done.
    // A second Guard to the SAME room beats opening a new invader-core hunt.
    const unfinished = spawns > 0 || hostiles > 0 || prey > 0 || (rec.wn || 0) > 0;
    if (unfinished && guardsOn(target) < 2 && !towersHot) {
      // Issues GUARD_RAID, so it has to be priced as one — this asked whether
      // the home could afford a 650 GUARD_PREY and then queued a 3170 body.
      const home = pickHome(target, 1, KIT_COST.guardRaid);
      if (home) return kit("guard-raid", home, target, "finish-room", { followCck: wantCck });
    }
    if (wantCck) {
      const cckHome = pickHome(target, 8, KIT_COST.cck);
      if (cckHome) return kit("cck", cckHome, target, "follow-cck");
    }
    return kit("none", "", target, "wave-in-flight");
  }

  // Towers: send something that can take fire. Naked CCK is not that.
  if (towers > 0) {
    const quadHome = pickHome(target, WAR_HEAVY_MIN_RCL, KIT_COST.quad);
    // Boosted quads are RCL8-only (canBoost* both require level 8) and cost
    // materially more than the plain one, so they get their own solvency test.
    const boostHome = pickHome(target, 8, KIT_COST.quadBoost);
    if (blocked && towersDry && boostHome && canBoostMelee(boostHome) && bucket >= 7000 && !expensiveInFlight()) {
      return kit("melee-quad-boost", boostHome, target, "breach-blocked-dry", { boosted: true, followCck: wantCck });
    }
    if (boostHome && canBoostQuad(boostHome) && bucket >= 8000 && !expensiveInFlight()) {
      return kit("ranged-quad-boost", boostHome, target, "towers-boosted", { boosted: true, followCck: false });
    }
    if (quadHome && bucket >= 5000 && !expensiveInFlight()) {
      return kit("ranged-quad", quadHome, target, "towers-unboosted", { followCck: false });
    }
    return kit("none", "", target, "towers-need-quad");
  }

  // Spawn, no towers: walk in. Armed defenders → duo; else fat Guard.
  if (spawns > 0) {
    if (armed) {
      const duoHome = pickHome(target, WAR_HEAVY_MIN_RCL, KIT_COST.duo);
      if (duoHome && !duoInFlight(target)) {
        return kit("duo", duoHome, target, "spawn-armed", { followCck: wantCck });
      }
    }
    const home = pickHome(target, 1, KIT_COST.guardRaid);
    if (home) return kit("guard-raid", home, target, armed ? "spawn-armed-no-duo-home" : "spawn-open", { followCck: wantCck });
    if (wantCck) {
      const cckHome = pickHome(target, 8, KIT_COST.cck);
      if (cckHome) return kit("cck", cckHome, target, "spawn-cck-only");
    }
    return kit("none", "", target, "spawn-no-home");
  }

  // Creeps only.
  if (armed) {
    const duoHome = pickHome(target, WAR_HEAVY_MIN_RCL, KIT_COST.duo);
    if (duoHome) return kit("duo", duoHome, target, "armed-leftovers", { followCck: wantCck });
  }
  if (hostiles || prey) {
    const home = pickHome(target, 1, KIT_COST.guardPrey);
    if (home) return kit("guard-prey", home, target, "leftover-creeps", { followCck: wantCck });
  }
  if (wantCck) {
    const cckHome = pickHome(target, 8, KIT_COST.cck);
    if (cckHome) return kit("cck", cckHome, target, "lock-empty-owned");
  }
  return NONE;
}
