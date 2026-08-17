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

import { RoomIntel } from "./intel";
import { TOWER_FLOOR } from "Roles/filler";
import { TargetScore, TIER_NONE } from "./score";
import { ownedRooms } from "./reach";
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
function canFund(room: Room, cost: number): boolean {
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
  return bankEnergy(room) >= cost * WAR_BANK_MULTIPLE + WAR_BANK_FLOOR;
}

/**
 * What each kit costs the room that funds it, rounded UP. These only gate
 * affordability, so guessing high just makes the bot wait for a fatter room.
 * Quad totals are the sum of all four bodies (RCL6 SQR: 2100+2100+1400+1400).
 */
const KIT_COST = {
  guardPrey: 650, // GUARD_PREY exactly
  guardRaid: 3170, // GUARD_RAID exactly
  duo: 4000,
  quad: 7000,
  quadBoost: 12000,
  cck: 9100,
  mosquito: 9000,
};

function pickHome(target: string, minRcl: number, cost: number): string {
  const owned = ownedRooms();
  let best = "";
  let bestD = Infinity;
  for (let i = 0; i < owned.length; i++) {
    const room = Game.rooms[owned[i]];
    if (!room || !room.controller || !room.controller.my) continue;
    if (room.controller.level < minRcl) continue;
    if (room.memory && room.memory.danger) continue;
    if (!room.find(FIND_MY_SPAWNS).length) continue;
    if (!canFund(room, cost)) continue;
    const d = roomDistance(owned[i], target);
    if (d > RANGE || d >= bestD) continue;
    best = owned[i];
    bestD = d;
  }
  return best;
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
  if (scored && scored.tier === TIER_NONE && scored.why && scored.why.indexOf("ally") === 0) {
    return kit("none", "", target, scored.why);
  }
  if (rec.sa) return kit("none", "", target, "safe-mode");

  const live = !!Game.rooms[target];
  const age = Game.time - rec.t;
  if (!live && age > 500) return kit("none", "", target, "intel-stale");

  const bucket = Game.cpu.bucket;
  const towers = rec.tw || 0;
  const spawns = rec.sp || 0;
  const armed = rec.hb || 0;
  const prey = rec.he || 0;
  const hostiles = rec.hc || 0;
  const owned = !!rec.o;
  const remote = !owned && !!rec.rv;
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
      const home = pickHome(target, 8, KIT_COST.mosquito);
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
    const quadHome = pickHome(target, 6, KIT_COST.quad);
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
      const duoHome = pickHome(target, 6, KIT_COST.duo);
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
    const duoHome = pickHome(target, 6, KIT_COST.duo);
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
