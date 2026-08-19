/**
 * RemoteStats — live measurement of remote-mining throughput.
 *
 * Purpose: answer "is a remote actually paying for itself" with numbers instead
 * of vibes. Everything is accumulated into Memory.rstats as plain counters so it
 * survives a global reset and can be read straight off the memory API.
 *
 * Cost: one pass over Game.creeps per tick plus a small per-active-remote pass.
 * Measured at ~0.15ms for ~130 creeps. Gate with Memory.rstatsOff = true to
 * disable entirely.
 *
 * Shape:
 *   Memory.rstats = {
 *     start: <tick sampling began>,
 *     t: <last sampled tick>,
 *     r: {
 *       "<home>|<remote>": {
 *         del,      energy delivered into the home room by this remote's carriers
 *         trips,    completed full->empty carrier cycles
 *         cT,       carrier creep-ticks alive
 *         cCap,     sum of carrier carry capacity over those ticks (=> avg body)
 *         cIdleR,   carrier ticks spent in the remote while not full (waiting/filling)
 *         cIdleH,   carrier ticks spent at home while empty (nothing to do)
 *         mT,       miner creep-ticks alive
 *         mSeat,    miner ticks actually harvesting (store or source drained)
 *         mWork,    sum of miner WORK parts over those ticks
 *         rT,       reserver creep-ticks alive
 *         rvT,      sum of controller.reservation.ticksToEnd samples
 *         rvN,      number of reservation samples (=> avg reservation held)
 *         rvGap,    ticks the remote was visible with NO reservation at all
 *         sp,       creeps spawned for this remote (by first sighting)
 *         spE,      energy spent spawning them
 *         dead,     creeps that vanished (died / recycled)
 *         drop,     sum of dropped-energy-on-ground samples in the remote
 *         dropN,    number of those samples (=> avg energy rotting)
 *         cFull,    sum of remote container fill samples
 *         cFullN,   number of those samples
 *         road,     roads seen on the remote's tiles (last sample)
 *         roadHp,   avg road hits/hitsMax * 100 (last sample)
 *         danger,   ticks the remote had hostiles visible
 *       }
 *     }
 *   }
 */

interface RStatEntry {
  del: number;
  trips: number;
  cT: number;
  cCap: number;
  cIdleR: number;
  cIdleH: number;
  mT: number;
  mSeat: number;
  mWork: number;
  rT: number;
  rvT: number;
  rvN: number;
  rvGap: number;
  sp: number;
  spE: number;
  dead: number;
  drop: number;
  dropN: number;
  cFull: number;
  cFullN: number;
  road: number;
  roadHp: number;
  danger: number;
}

/** heap-only: last tick's energy per creep name, and the roster for spawn/death detection */
let lastEnergy: { [name: string]: number } = {};
let lastRoster: { [name: string]: string } = {}; // name -> "home|remote"
/**
 * False until the first pass of this global has filled `lastRoster`.
 *
 * The roster is heap-only and a global reset happens several times a day, so
 * on the pass right after one EVERY live remote creep is "a name we have never
 * seen before" and used to be charged its full body cost to spE a second (and
 * third, and fourth) time. `dead` is computed from the same empty roster and
 * so was NOT inflated to match, which is where readings like
 * `sp 34 / dead 5 / spE 15100` came from — spend that never happened, against a
 * delivery figure that did. The first pass now only seeds; it charges nothing.
 */
let seeded = false;

const BODY_COST: { [p: string]: number } = {
  move: 50,
  work: 100,
  carry: 50,
  attack: 80,
  ranged_attack: 150,
  heal: 250,
  claim: 600,
  tough: 10,
};

function blank(): RStatEntry {
  return {
    del: 0, trips: 0,
    cT: 0, cCap: 0, cIdleR: 0, cIdleH: 0,
    mT: 0, mSeat: 0, mWork: 0,
    rT: 0, rvT: 0, rvN: 0, rvGap: 0,
    sp: 0, spE: 0, dead: 0,
    drop: 0, dropN: 0, cFull: 0, cFullN: 0,
    road: 0, roadHp: 0, danger: 0,
  };
}

function entry(key: string): RStatEntry {
  const m: any = Memory as any;
  if (!m.rstats) m.rstats = { start: Game.time, t: Game.time, r: {} };
  if (!m.rstats.r[key]) m.rstats.r[key] = blank();
  const e = m.rstats.r[key];
  // heal entries written by an older build
  const proto = blank();
  for (const k in proto) if (typeof e[k] !== "number") e[k] = 0;
  return e;
}

function bodyCost(creep: Creep): number {
  let c = 0;
  for (const p of creep.body) c += BODY_COST[p.type] || 0;
  return c;
}

/**
 * Is this creep demonstrably newly born, rather than merely newly SEEN?
 *
 * Belt to the `seeded` brace: the roster can also be lost mid-life by an
 * rstats reset, and a creep that walks into a remote key later in its life
 * (targetRoom reassigned) is not a spawn either. Full TTL is the one signal
 * that does not depend on heap state surviving.
 */
function isNewborn(creep: Creep): boolean {
  if (creep.spawning) return true;
  const ttl = creep.ticksToLive;
  if (ttl === undefined) return true; // still in the spawn
  let max: number = CREEP_LIFE_TIME;
  for (const p of creep.body) {
    if (p.type === CLAIM) { max = CREEP_CLAIM_LIFE_TIME; break; }
  }
  return ttl >= max - 3;
}

/** roles that are part of a remote operation */
function remoteKeyFor(creep: Creep): string | null {
  const m: any = creep.memory;
  const home = m.homeRoom;
  const target = m.targetRoom;
  if (!home || !target) return null;
  if (target === home) return null; // local, not a remote
  const role = m.role;
  if (role !== "carry" && role !== "FakeFiller" && role !== "EnergyMiner" &&
      role !== "reserve" && role !== "RemoteRepair" && role !== "scout") return null;
  return home + "|" + target;
}

export function sampleRemoteStats(): void {
  const m: any = Memory as any;
  if (m.rstatsOff) return;
  if (!m.rstats) m.rstats = { start: Game.time, t: Game.time, r: {} };
  m.rstats.t = Game.time;

  const seen: { [name: string]: string } = {};
  const nextEnergy: { [name: string]: number } = {};
  /** "home|remote" keys some creep is working THIS tick — see the room pass below */
  const targeted: { [key: string]: boolean } = {};

  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    const key = remoteKeyFor(creep);
    if (!key) continue;
    seen[name] = key;
    targeted[key] = true;

    const e = entry(key);
    const mem: any = creep.memory;
    const energy = creep.store[RESOURCE_ENERGY] || 0;
    nextEnergy[name] = energy;

    // Spawn detection. "A name we have never seen before" is not enough on its
    // own — see `seeded` and isNewborn(): the roster is heap-only, so without
    // both guards every global reset re-charged the full body cost of every
    // live remote creep.
    if (seeded && lastRoster[name] === undefined && isNewborn(creep)) {
      e.sp++;
      e.spE += bodyCost(creep);
    }

    const role = mem.role;

    if (role === "carry" || role === "FakeFiller") {
      e.cT++;
      e.cCap += creep.store.getCapacity(RESOURCE_ENERGY) || 0;
      const prev = lastEnergy[name];
      if (prev !== undefined && energy < prev && creep.room.name === mem.homeRoom) {
        // dropped/transferred energy while at home == delivered
        e.del += prev - energy;
        if (energy === 0) e.trips++;
      }
      if (creep.room.name === mem.targetRoom && creep.store.getFreeCapacity() > 0) e.cIdleR++;
      if (creep.room.name === mem.homeRoom && energy === 0) e.cIdleH++;
    } else if (role === "EnergyMiner") {
      e.mT++;
      const w = creep.getActiveBodyparts(WORK);
      e.mWork += w;
      const prev = lastEnergy[name];
      // harvesting shows up either as store growth or (CARRY-less / full) as a
      // drop next to the creep; the reliable common signal is "adjacent source
      // lost energy this tick", but that needs the source object. Store growth
      // plus "standing next to a non-empty source" is close enough and cheap.
      let seat = false;
      if (prev !== undefined && energy > prev) seat = true;
      else if (mem.sourceId) {
        const src: any = Game.getObjectById(mem.sourceId);
        if (src && src.energy > 0 && creep.pos.isNearTo(src)) seat = true;
      }
      if (seat) e.mSeat++;
    } else if (role === "reserve") {
      e.rT++;
    }
  }

  // deaths: in last tick's roster, gone now
  for (const name in lastRoster) {
    if (seen[name] === undefined && Game.creeps[name] === undefined) {
      const e = entry(lastRoster[name]);
      e.dead++;
    }
  }

  lastEnergy = nextEnergy;
  lastRoster = seen;
  seeded = true;

  // Per-remote room sampling — only for rooms we can see, every 5 ticks to keep
  // the find() calls cheap.
  if (Game.time % 5 !== 0) return;
  for (const home in Game.rooms) {
    const hr = Game.rooms[home];
    if (!hr.controller || !hr.controller.my) continue;
    const res = hr.memory.resources;
    if (!res) continue;
    for (const remote in res) {
      if (remote === home) continue;
      if (!res[remote]) continue;
      // Sample a remote that is active OR that some creep is still working.
      // Gating on `active` alone made the drop/container/reservation columns go
      // silent the instant manageRemotes closed a remote — which is exactly the
      // window worth measuring, because the miners keep mining there for up to
      // a full life after the close and the energy they pile up is the loss.
      if (!res[remote].active && !targeted[home + "|" + remote]) continue;
      const rr = Game.rooms[remote];
      if (!rr) continue;
      const e = entry(home + "|" + remote);

      const ctrl = rr.controller;
      if (ctrl) {
        if (ctrl.reservation) {
          e.rvT += ctrl.reservation.ticksToEnd;
          e.rvN++;
        } else {
          e.rvGap += 5;
        }
      }

      let drops = 0;
      for (const d of rr.find(FIND_DROPPED_RESOURCES)) {
        if (d.resourceType === RESOURCE_ENERGY) drops += d.amount;
      }
      e.drop += drops;
      e.dropN++;

      let contFill = 0;
      let roads = 0;
      let hp = 0;
      let hpMax = 0;
      for (const s of rr.find(FIND_STRUCTURES)) {
        if (s.structureType === STRUCTURE_CONTAINER) {
          contFill += (s as StructureContainer).store[RESOURCE_ENERGY] || 0;
        } else if (s.structureType === STRUCTURE_ROAD) {
          roads++;
          hp += s.hits;
          hpMax += s.hitsMax;
        }
      }
      e.cFull += contFill;
      e.cFullN++;
      e.road = roads;
      e.roadHp = hpMax > 0 ? Math.round((hp / hpMax) * 100) : 0;

      // An invader core is danger too — markRemoteHot() abandons a remote for
      // one just as it does for a creep wave, and a core outlives the wave, so
      // counting only FIND_HOSTILE_CREEPS reported `danger 0` for remotes that
      // were closed for threat all window.
      if (rr.find(FIND_HOSTILE_CREEPS).length > 0 ||
          rr.find(FIND_HOSTILE_STRUCTURES, {
            filter: (s: any) => s.structureType === STRUCTURE_INVADER_CORE,
          }).length > 0) {
        e.danger += 5;
      }
    }
  }
}

/** global.rstats() — print the table. global.rstats(true) — reset the window. */
export function installRemoteStatsCommand(): void {
  (global as any).rstats = function (reset?: boolean) {
    const m: any = Memory as any;
    if (reset) {
      m.rstats = { start: Game.time, t: Game.time, r: {} };
      lastEnergy = {};
      lastRoster = {};
      seeded = false; // the next pass re-seeds; it must not bill the fleet again
      return "rstats reset at " + Game.time;
    }
    if (!m.rstats) return "no rstats yet";
    const span = Math.max(1, m.rstats.t - m.rstats.start);
    const lines: string[] = [];
    lines.push("=== remote stats over " + span + " ticks (from " + m.rstats.start + ") ===");
    lines.push(
      ["home|remote", "e/tick", "deliv", "trips", "carrTicks", "avgCarry", "idleR%", "idleH%",
       "minerUp%", "avgWORK", "resvUp%", "avgResv", "spawns", "spawnE", "e/spawnE", "dead",
       "avgDrop", "avgCont", "roads", "roadHP", "dangerT"].join("\t"));
    const keys = Object.keys(m.rstats.r).sort();
    for (const k of keys) {
      const e = m.rstats.r[k];
      const carrN = Math.max(1, e.cT);
      const rvTot = e.rvN * 5 + e.rvGap;
      lines.push([
        k,
        (e.del / span).toFixed(2),
        e.del,
        e.trips,
        e.cT,
        Math.round(e.cCap / carrN),
        Math.round((e.cIdleR / carrN) * 100),
        Math.round((e.cIdleH / carrN) * 100),
        e.mT ? Math.round((e.mSeat / e.mT) * 100) : 0,
        e.mT ? (e.mWork / e.mT).toFixed(1) : "0",
        rvTot ? Math.round(((e.rvN * 5) / rvTot) * 100) : 0,
        e.rvN ? Math.round(e.rvT / e.rvN) : 0,
        e.sp,
        e.spE,
        e.spE ? (e.del / e.spE).toFixed(2) : "-",
        e.dead,
        e.dropN ? Math.round(e.drop / e.dropN) : 0,
        e.cFullN ? Math.round(e.cFull / e.cFullN) : 0,
        e.road,
        e.roadHp,
        e.danger,
      ].join("\t"));
    }
    return lines.join("\n");
  };
}
