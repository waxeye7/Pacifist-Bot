import urgent_buy from "Random_Stuff/urgent_buy";
import { chargeBoostSlot, labKeyForId, storeOf } from "Rooms/rooms.labs";
import { setVerbose, logAlways } from "utils/Logger";
import { cpuStatusString, getCpuPolicy } from "utils/CpuPolicy";
import {
  setProfile,
  toggleOpt,
  setOpt,
  benchAuto,
  reportCpu,
  clearBench,
  getOpts,
} from "utils/Bench";
import { getFeatures } from "utils/Features";
import {
  resetSpeedrun,
  speedrunStatus,
  disableRemotes,
  enableRemotes,
  enableSkipHighRcl,
  disableSkipHighRcl,
} from "utils/Speedrun";
import { replanRoom, getBasePlan, visualizeBasePlan } from "utils/BasePlan";
import { getPerimeterTiles } from "utils/Perimeter";
import { animPlan, animStop } from "utils/PlanAnimator";
import { canFund, KIT_COST } from "War/kit";

const g = global as any;

const KEEP_ROOMS: { [name: string]: boolean } = { E36N57: true };

/** Fixed slot map the EnergyManager fills by lab index (see energyManager.ts). */
const LAB_SLOT_MINERAL: { [key: string]: ResourceConstant } = {
    lab1: RESOURCE_CATALYZED_LEMERGIUM_ACID,      // REPAIR
    lab2: RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,   // MOVE
    lab3: RESOURCE_CATALYZED_UTRIUM_ACID,         // ATTACK
    lab4: RESOURCE_CATALYZED_KEANIUM_ALKALIDE,    // RANGED_ATTACK
    lab5: RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,  // HEAL
    lab6: RESOURCE_CATALYZED_ZYNTHIUM_ACID,       // DISMANTLE
    lab7: RESOURCE_CATALYZED_GHODIUM_ALKALIDE,    // TOUGH
    lab8: RESOURCE_CATALYZED_KEANIUM_ACID,        // CARRY (or UO when lab8reserved)
};

/**
 * Reserve a boost slot, and on refusal (lab8 mineral conflict, bad amount) drop
 * that lab from the creep's boostlabs so it queues unboosted for that slot.
 * An uncharged lab is never filled by the EnergyManager: the creep parks 80
 * ticks next to it and can consume a sibling's reservation on the way out.
 */
function chargeOrDrop(room: any, labKey: string, amount: number, creepName: string, labIds: any[]): boolean {
    if (chargeBoostSlot(room, labKey, amount, creepName)) return true;
    const id = room && room.memory.labs && room.memory.labs["outputLab" + labKey.substring(3)];
    if (id && labIds) {
        for (let i = labIds.length - 1; i >= 0; i--) {
            if (labIds[i] === id) labIds.splice(i, 1);
        }
    }
    console.log("boost slot refused: " + (room && room.name) + " " + labKey + " for " + creepName + " - queueing unboosted for that lab");
    return false;
}

function nearestTwoSourceHome(from: string): string {
    const hits: string[] = [];
    for (const n in Game.rooms) {
        const r = Game.rooms[n];
        if (!r.controller || !r.controller.my) continue;
        if (n === from) continue;
        if (r.find(FIND_SOURCES).length < 2) continue;
        if (!r.find(FIND_MY_SPAWNS).length) continue;
        hits.push(n);
    }
    hits.sort((a, b) =>
        Game.map.getRoomLinearDistance(from, a) - Game.map.getRoomLinearDistance(from, b));
    return hits[0] || "";
}

/** Everything sitting in a room's storage + terminal — destroy() throws it away. */
function storedResources(room: Room): number {
    let total = 0;
    const holders: any[] = [room.storage, room.terminal];
    for (const h of holders) {
        if (!h || !h.store) continue;
        for (const res in h.store) total += h.store[res] || 0;
    }
    return total;
}

/** Storage+terminal contents above this need dropRoom(name, true). */
const DROP_CONTENT_LIMIT = 20000;
/** A room this developed needs dropRoom(name, true) too. */
const DROP_RCL_LIMIT = 5;

/**
 * Unclaim a bad expand. Refuses E36N57. Kills creeps in-room; others go home to
 * recycle. Refuses a room that still holds >20k in storage+terminal or is RCL5+
 * (destroy() deletes the contents) unless force is true: dropRoom(name, true).
 */
export function dropRoomNow(name: string, force: boolean = false): string {
    if (!name || KEEP_ROOMS[name]) return "refused: " + name + " KEEP";
    const room = Game.rooms[name];
    // No vision means no destroy()/unclaim() below either, so nothing to guard.
    if (room && !force) {
        const rcl = room.controller && room.controller.my ? room.controller.level : 0;
        const held = storedResources(room);
        if (held > DROP_CONTENT_LIMIT || rcl >= DROP_RCL_LIMIT) {
            return (
                `refused: ${name} is RCL${rcl} and holds ${held} resources in storage+terminal ` +
                `(limit ${DROP_CONTENT_LIMIT} / RCL${DROP_RCL_LIMIT}); dropping destroys them. ` +
                `Empty it first, or force with dropRoom("${name}", true)`
            );
        }
    }
    const dest = nearestTwoSourceHome(name);
    let creeps = 0;
    for (const id in Game.creeps) {
        const c = Game.creeps[id];
        const hit = c.room.name === name || c.memory.homeRoom === name || c.memory.targetRoom === name;
        if (!hit) continue;
        creeps++;
        if (dest) {
            c.memory.homeRoom = dest;
            c.memory.targetRoom = dest;
            c.memory.suicide = true;
            delete c.memory.sourceId;
        }
        if (c.room.name === name) c.suicide();
    }
    let sites = 0;
    let structs = 0;
    let unclaimed = false;
    if (room) {
        for (const s of room.find(FIND_MY_CONSTRUCTION_SITES)) {
            s.remove();
            sites++;
        }
        for (const s of room.find(FIND_MY_STRUCTURES)) {
            if (s.structureType === STRUCTURE_CONTROLLER) continue;
            if (s.destroy() === OK) structs++;
        }
        if (room.controller && room.controller.my) {
            room.controller.unclaim();
            unclaimed = true;
        }
    }
    const m: any = Memory;
    if (m.target_colonise && m.target_colonise.room === name) m.target_colonise = {};
    if (m.autoExpand && m.autoExpand.room === name) delete m.autoExpand;
    if (m.rooms && m.rooms[name]) delete m.rooms[name];
    return `drop ${name}: creeps ${creeps} home ${dest || "none"} sites ${sites} structs ${structs} unclaim ${unclaimed}`;
}

export function runDropRooms(): void {
    const name = (Memory as any).dropRoom;
    if (!name || typeof name !== "string") return;
    const msg = dropRoomNow(name);
    logAlways(msg);
    // The persisted retry never passes force, so a refusal would repeat forever
    // (and could fire later, once the guard happens to pass). Clear it either way.
    delete (Memory as any).dropRoom;
}

/** Drop a pack that does not match the live spawn. Refuses nothing else. */
g.stripBadPlan = function (name: string): string {
    const room = Game.rooms[name];
    if (!room) return "no vision " + name;
    delete room.memory.planV2;
    (room.memory as any).planPackSkip = true;
    if (room.memory.construction) room.memory.construction.rampartLocations = [];
    logAlways("stripBadPlan " + name);
    return "stripped planV2 on " + name;
};

/** Console: dropRoom("E36N58") — add true to force past the contents guard. */
g.dropRoom = function (name: string, force: boolean = false): string {
    (Memory as any).dropRoom = name;
    const msg = dropRoomNow(name, force);
    if (msg.indexOf("refused") !== -1) delete (Memory as any).dropRoom;
    return msg;
};

/**
 * Replay the offline planner stage by stage: animPlan("E2S7") or
 * animPlan("E2S7", 3) for 3 steps/tick. Loops forever by default; pass
 * animPlan("E2S7", 1, false) for a single pass. Frames must already be in
 * the memory segments — push them with tools/server/push-anim.mjs.
 */
g.animPlan = function (roomName: string, speed: number = 1, loop: boolean = true): string {
  return animPlan(roomName, speed, loop);
};

/** Stop the planner replay: animStop() */
g.animStop = function (): string {
  return animStop();
};

/** Force dynamic base replan: replanBase("E2S7") */
g.replanBase = function (roomName: string): string {
  const msg = replanRoom(roomName);
  logAlways(msg);
  return msg;
};

/** Show cached hub + perimeter: basePlan("E2S7") */
g.basePlan = function (roomName: string) {
  const room = Game.rooms[roomName];
  if (!room) {
    logAlways(`no vision ${roomName}`);
    return null;
  }
  const plan = getBasePlan(room);
  if (!plan) {
    logAlways("no plan");
    return null;
  }
  const summary = {
    hub: plan.hub,
    score: plan.score,
    version: plan.version,
    perimeterMode: plan.perimeterMode,
    perimeter: plan.perimeter.length,
  };
  logAlways(JSON.stringify(summary));
  return plan;
};

/** Draw hub + min-cut for a few ticks: showPlan(true) or showPlan("E2S7") */
g.showPlan = function (arg: boolean | string = true): string {
  if (typeof arg === "string") {
    const room = Game.rooms[arg];
    if (!room) return `no vision ${arg}`;
    visualizeBasePlan(room);
    Memory.showPlan = true;
    return `drawing plan for ${arg} (Memory.showPlan=true)`;
  }
  Memory.showPlan = !!arg;
  const msg = `Memory.showPlan=${Memory.showPlan}`;
  logAlways(msg);
  return msg;
};

g.showPerimeter = function (roomName: string): string {
  const room = Game.rooms[roomName];
  if (!room) return `no vision ${roomName}`;
  const tiles = getPerimeterTiles(room);
  const vis = new RoomVisual(roomName);
  for (const t of tiles) {
    vis.rect(t.x - 0.4, t.y - 0.4, 0.8, 0.8, {
      fill: "transparent",
      stroke: "#ff6666",
      strokeWidth: 0.1,
    });
  }
  const msg = `perimeter tiles=${tiles.length}`;
  logAlways(msg);
  return msg;
};

// enablePlaceFromPlan / disablePlaceFromPlan removed: the `placeFromPlan` flag
// they toggled was read by nothing. Placement is switched on by adopting a plan
// (adoptPlan / the auto-expand pack writing room.memory.planV2) and off by
// dropPlan; demolition is armed separately with migratePlan.

/** Console: setVerbose(true|false) — default silent for shard3 */
global.setVerbose = function (on: boolean = true): string {
  const msg = setVerbose(on);
  logAlways(msg);
  return msg;
};

// --- Feature flags: power OFF + tick speedrun (game ticks, not wall-clock) ---

/** Console: speedrunStatus() — RCL tick times */
g.speedrunStatus = function (): string {
  return speedrunStatus();
};

/** Console: resetSpeedrun("E5S1"?) — zero timers after room reset / respawn */
g.resetSpeedrun = function (roomName?: string): string {
  return resetSpeedrun(roomName);
};

g.enableSpeedrun = function (): string {
  getFeatures().speedrun = true;
  const msg = "speedrun ON (ticks-to-RCL tracking + early remotes off)";
  logAlways(msg);
  return msg;
};

g.disableSpeedrun = function (): string {
  getFeatures().speedrun = false;
  const msg = "speedrun OFF";
  logAlways(msg);
  return msg;
};

/** Console: disableRemotes() — campaign remotes-off A/B (closes every tick) */
g.disableRemotes = function (): string {
  return disableRemotes();
};

g.enableSkipHighRcl = function (): string {
  return enableSkipHighRcl();
};

g.disableSkipHighRcl = function (): string {
  return disableSkipHighRcl();
};

/** Console: enableRemotes() — restore current RCL3+ remotes */
g.enableRemotes = function (): string {
  return enableRemotes();
};

/** Power stays OFF by default — never enable power mode (enemy PC exposure) */
g.disablePower = function (): string {
  getFeatures().disablePower = true;
  const msg = "disablePower ON — no PC managers, processPower, or power-mode enable";
  logAlways(msg);
  return msg;
};

/** Opt-in only if you accept enemy power creep attacks */
g.enablePower = function (): string {
  getFeatures().disablePower = false;
  const msg = "disablePower OFF — power systems may run (exposes rooms to enemy PCs)";
  logAlways(msg);
  return msg;
};

g.features = function () {
  const f = getFeatures();
  logAlways(JSON.stringify(f));
  return f;
};

// --- Hauler pickup target locking (A/B seam) ---

/** Console: enablePickupLock() — lock pickup targets + reserve their energy */
g.enablePickupLock = function (): string {
  getFeatures().pickupLock = true;
  const msg = "pickupLock ON — haulers lock a pile for 25t and reserve what they'll take";
  logAlways(msg);
  return msg;
};

/** Console: disablePickupLock() — legacy per-tick rescan sorted by amount */
g.disablePickupLock = function (): string {
  getFeatures().pickupLock = false;
  const msg = "pickupLock OFF — legacy amount-sorted rescan every tick (baseline)";
  logAlways(msg);
  return msg;
};

/** Console: resetPickupStats() — zero the switch counters before an A/B window */
g.resetPickupStats = function (): string {
  if (!Memory.stats) Memory.stats = {};
  Memory.stats.pickupSwitches = 0;
  Memory.stats.pickupTicks = 0;
  Memory.stats.pickupFallback = 0;
  Memory.stats.pickupIdle = 0;
  Memory.stats.pickupActs = 0;
  Memory.stats.pickupGot = 0;
  Memory.stats.pickupSince = Game.time;
  const msg = `pickup counters reset at tick ${Game.time}`;
  logAlways(msg);
  return msg;
};

/** Console: pickupStats() — target switches per 100 acquire calls + mode */
g.pickupStats = function (): string {
  const s: any = Memory.stats || {};
  const ticks = s.pickupTicks || 0;
  const switches = s.pickupSwitches || 0;
  const rate = ticks > 0 ? (switches / ticks) * 100 : 0;
  const mode = getFeatures().pickupLock !== false ? "ON (lock+reserve)" : "OFF (legacy)";
  const msg =
    `pickupLock=${mode} | calls=${ticks} switches=${switches} ` +
    `| ${rate.toFixed(1)} switches/100 calls` +
    ` | queued=${s.pickupFallback || 0} idle=${s.pickupIdle || 0}` +
    ` | throughput=${ticks ? ((s.pickupGot || 0) / ticks).toFixed(1) : 0} energy/call` +
    ` (collect on ${ticks ? ((100 * (s.pickupActs || 0)) / ticks).toFixed(0) : 0}% of calls)` +
    (s.pickupSince != null ? ` | window=${Game.time - s.pickupSince}t` : "");
  logAlways(msg);
  return msg;
};

/** Console: cpuStatus() — limit, bucket, remotes policy (always prints) */
global.cpuStatus = function (): string {
  const s = cpuStatusString();
  logAlways(s);
  return s;
};

global.cpuPolicy = function () {
  return getCpuPolicy();
};

/** A/B profiles: setProfile("optimized"|"baseline") */
g.setProfile = function (name: "optimized" | "baseline"): string {
  const msg = setProfile(name);
  logAlways(msg);
  return msg;
};

g.toggleOpt = function (name: string): string {
  const msg = toggleOpt(name as any);
  logAlways(msg);
  return msg;
};

g.setOpt = function (name: string, value: boolean): string {
  const msg = setOpt(name as any, value);
  logAlways(msg);
  return msg;
};

/** Flip optimized/baseline every N ticks and accumulate stats */
g.benchAuto = function (on: boolean = true, period: number = 100): string {
  const msg = benchAuto(on, period);
  logAlways(msg);
  return msg;
};

/** Print proof averages */
g.reportCpu = function (): string {
  const msg = reportCpu();
  logAlways(msg);
  return msg;
};

g.clearBench = function (): string {
  const msg = clearBench();
  logAlways(msg);
  return msg;
};

g.opts = function () {
  const o = getOpts();
  logAlways(JSON.stringify(o));
  return o;
};

global.spawn_mosquito = function (homeRoom: string, roomName: string): boolean {
  if (Game.cpu.bucket < 1500) return false;
  if (homeRoom) {
    let room = Game.rooms[homeRoom];
    let spawns = room.find(FIND_MY_SPAWNS);
    let nonSpawningSpawn = _.filter(spawns, (s) => !s.spawning);
    if (nonSpawningSpawn.length === 0) return false;
    if (
      room &&
      room.controller &&
      room.controller.level === 8 &&
      room.controller.my &&
      canFund(room, KIT_COST.mosquito) &&
      Game.market.credits > 5000000
    ) {
      let terminal = room.terminal;
      if (!terminal || terminal.store[RESOURCE_ENERGY] < 1000 || terminal.cooldown) return false;
      let storage = room.storage;
      if (!storage) return false;
        if (
          storage.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] + terminal.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] <
          5000
        ) {
          urgent_buy(terminal, RESOURCE_CATALYZED_GHODIUM_ALKALIDE, 5000);
          return false;
        }
        if (
          storage.store[RESOURCE_CATALYZED_KEANIUM_ALKALIDE] + terminal.store[RESOURCE_CATALYZED_KEANIUM_ALKALIDE] <
          5000
        ) {
          urgent_buy(terminal, RESOURCE_CATALYZED_KEANIUM_ALKALIDE, 5000);
          return false;
        }

        if (
          storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] + terminal.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] <
          5000
        ) {
          urgent_buy(terminal, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, 5000);
          return false;
        }

        if (
          storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] + terminal.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] <
          3600
        ) {
          urgent_buy(terminal, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, 3600);
          return false;
        }

        let body = [
          TOUGH,
          TOUGH,
          TOUGH,
          TOUGH,
          TOUGH,
          TOUGH,
          TOUGH,
          TOUGH,
          TOUGH,
          RANGED_ATTACK,
          RANGED_ATTACK,
          RANGED_ATTACK,
          RANGED_ATTACK,
          RANGED_ATTACK,
          RANGED_ATTACK,
          RANGED_ATTACK,
          RANGED_ATTACK,
          RANGED_ATTACK,
          RANGED_ATTACK,
          RANGED_ATTACK,
          RANGED_ATTACK,
          RANGED_ATTACK,
          RANGED_ATTACK,
          RANGED_ATTACK,
          MOVE,
          MOVE,
          MOVE,
          MOVE,
          MOVE,
          MOVE,
          MOVE,
          MOVE,
          MOVE,
          HEAL,
          HEAL,
          HEAL,
          HEAL,
          HEAL,
          HEAL,
          HEAL,
          HEAL,
          HEAL,
          HEAL,
          HEAL,
          HEAL,
          HEAL,
          HEAL,
          HEAL,
          HEAL,
          MOVE
        ];


        // No labs/status: still spawn, skip boost reservations so a missing
        // labs object cannot throw out of the mosquito manager.
        let newName2 = "mosquito" + Math.floor(Math.random() * Game.time) + "-" + room.name;
        let mosquitoBoostLabs = [];
        if (room.memory.labs && room.memory.labs.status) {
        mosquitoBoostLabs = [
            room.memory.labs.outputLab2,
            room.memory.labs.outputLab4,
            room.memory.labs.outputLab5,
            room.memory.labs.outputLab7
        ].filter(function (id) { return !!id; });
        // Per-owner ledger so janitor/refund can clear a dead mosquito.
        if (room.memory.labs.outputLab4) chargeOrDrop(room, "lab4", 450, newName2, mosquitoBoostLabs);
        if (room.memory.labs.outputLab5) chargeOrDrop(room, "lab5", 480, newName2, mosquitoBoostLabs);
        if (room.memory.labs.outputLab2) chargeOrDrop(room, "lab2", 300, newName2, mosquitoBoostLabs);
        if (room.memory.labs.outputLab7) chargeOrDrop(room, "lab7", 270, newName2, mosquitoBoostLabs);
        }
        room.memory.spawn_list.push(
          body,
          newName2,
          {
            memory: {
              role: "mosquito",
              targetRoom: roomName,
              homeRoom: homeRoom,
              boostlabs: mosquitoBoostLabs
            }
          }
        );
        console.log("Adding mosquito to Spawn List: " + newName2);

        return true
      }
    }
  return false;

};


global.showBoosts = function () {

    let descriptions = {
        'XGH2O': 'UPGRADE',
        'GH2O': 'UPGRADE',
        'GH': 'UPGRADE',

        'XLH2O': 'REPAIR',
        'LH2O': 'REPAIR',
        'LH': 'REPAIR',

        'XUHO2': 'HARVEST',
        'UHO2': 'HARVEST',
        'UO': 'HARVEST',

        'XZH2O': 'DISMANTLE',
        'ZH2O': 'DISMANTLE',
        'ZH': 'DISMANTLE',

        'XUH2O': 'ATTACK',
        'UH2O': 'ATTACK',
        'UH': 'ATTACK',

        'XKHO2': 'R_ATTACK',
        'KHO2': 'R_ATTACK',
        'KO': 'R_ATTACK',

        'XLHO2': 'HEAL',
        'LHO2': 'HEAL',
        'LO': 'HEAL',

        'XKH2O': 'CARRY',
        'KH2O': 'CARRY',
        'KH': 'CARRY',

        'XGHO2': 'TOUGH',
        'GHO2': 'TOUGH',
        'GO': 'TOUGH',

        'XZHO2': 'MOVE',
        'ZHO2': 'MOVE',
        'ZO': 'MOVE',
    }

    let msg = '', sum = 0;
    ['XUH2O', 'XUHO2', 'XKH2O', 'XKHO2', 'XLH2O', 'XLHO2', 'XZH2O', 'XZHO2', 'XGH2O', 'XGHO2'].forEach(res => {
        let resCounter = 0
        _.filter(Game.rooms, r => r.controller && r.controller.my).forEach(mr => {
            if (mr.storage) resCounter += mr.storage.store[res]
            if (mr.terminal) resCounter += mr.terminal.store[res]
        })
        msg += res + ': ' + numberWithSpaces(resCounter) + '\t' + (descriptions[res] ? descriptions[res] : '') + '\n'; sum += resCounter
    })
    console.log('sum: ' + numberWithSpaces(sum) + '\n' + msg)

    function numberWithSpaces(x) {
        if (typeof x !== 'number') { return x }
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    }

}


global.lock_room = function (homeRoom, targetRoom) {
    let room = Game.rooms[homeRoom];
    if(!room) return;
    let storage = room.storage
    // storeOf = storage + terminal: market buys land in the terminal, so a
    // storage-only gate refused the spawn the purchase was made for.
    if(room.controller && room.controller.level === 8 && storage && storeOf(room, RESOURCE_CATALYZED_GHODIUM_ALKALIDE) >= 1000 && storeOf(room, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) >= 2000  && storeOf(room, RESOURCE_CATALYZED_KEANIUM_ALKALIDE) >= 2000 && storeOf(room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) >= 1000) {

        // Guard labs like mosquito/SMDP: missing labs/status used to throw
        // after the Escort was queued, so the claimer/locker never spawned.
        let newName3 = 'Escort' + Math.floor(Math.random() * Game.time) + "-" + room.name;
        let escortBoostLabs = [];
        if(room.memory.labs && room.memory.labs.status) {
            escortBoostLabs = [room.memory.labs.outputLab2, room.memory.labs.outputLab4, room.memory.labs.outputLab5, room.memory.labs.outputLab7].filter(function (id) { return !!id; });
            if (room.memory.labs.outputLab2) chargeOrDrop(room, "lab2", 300, newName3, escortBoostLabs);
            if (room.memory.labs.outputLab4) chargeOrDrop(room, "lab4", 750, newName3, escortBoostLabs);
            if (room.memory.labs.outputLab5) chargeOrDrop(room, "lab5", 300, newName3, escortBoostLabs);
            if (room.memory.labs.outputLab7) chargeOrDrop(room, "lab7", 150, newName3, escortBoostLabs);
        }
        room.memory.spawn_list.push([TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL], newName3, {memory: {role: 'Escort', targetRoom: targetRoom, homeRoom:room.name, line:1, boostlabs:escortBoostLabs }});
        console.log('Adding Escort to Spawn List: ' + newName3);

        let newName4 = 'Claimer' + Math.floor(Math.random() * Game.time) + "-" + room.name;
        room.memory.spawn_list.push([CLAIM, MOVE], newName4, {memory: {role: 'claimer', targetRoom: targetRoom, homeRoom:room.name}});
        console.log('Adding Claimer to Spawn List: ' + newName4);


        let newName2 = 'RoomLocker' + Math.floor(Math.random() * Game.time) + "-" + room.name;
        room.memory.spawn_list.push([MOVE,CARRY,MOVE,CARRY,MOVE,CARRY,MOVE,CARRY,MOVE,CARRY,MOVE,CARRY,MOVE,CARRY,MOVE,WORK,CARRY,MOVE], newName2, {memory: {role: 'RoomLocker', targetRoom: targetRoom, homeRoom:room.name, line:3}});
        console.log('Adding RoomLocker to Spawn List: ' + newName2);


    }
    else if(room && room.controller.level <= 7 && room.controller.level >= 4 && room.energyCapacityAvailable >= 1200) {
        let newName2 = 'RoomLocker' + Math.floor(Math.random() * Game.time) + "-" + room.name;
        room.memory.spawn_list.push([MOVE,CARRY,MOVE,CARRY,MOVE,CARRY,MOVE,CARRY,MOVE,CARRY,MOVE,CARRY,MOVE,CARRY,MOVE,WORK,CARRY,MOVE], newName2, {memory: {role: 'RoomLocker', targetRoom: targetRoom, homeRoom:room.name}});
        console.log('Adding RoomLocker to Spawn List: ' + newName2);

        let newName4 = 'Claimer' + Math.floor(Math.random() * Game.time) + "-" + room.name;
        room.memory.spawn_list.push([CLAIM, MOVE], newName4, {memory: {role: 'claimer', targetRoom: targetRoom, homeRoom:room.name}});
        console.log('Adding Claimer to Spawn List: ' + newName4);
    }
}

global.spawn_hunting_party = function(homeRoomName, targetRoomName, amountToSpawn) {
    if(amountToSpawn > 5) {
        amountToSpawn = 5;
    }
    let room = Game.rooms[homeRoomName];
    if (room && room.controller && room.controller.my && room.controller.level === 8) {
        let amountZYN_ALK = 90*amountToSpawn + 600 + 30;
        if(amountToSpawn >= 2) {
            amountZYN_ALK -= 30;
        }
        let amountGHO_ALK = 30*amountToSpawn + 300;
        // labs.status is unset until the lab manager runs; throwing here
        // leaves the queued CCKparty unspliced and the command loop-crashes.
        let huntingBoostLabs = [];
        let huntingClaimBoostLabs = [];
        if(room.memory.labs && room.memory.labs.status) {
        // CLAIM parts cannot be boosted; Boost() never drops those labs, so
        // the party parks forever on an empty T3 reservation. Refuse to
        // queue unless storage can actually fund the charge amounts.
        // storeOf = storage + terminal (market buys land in the terminal).
        let huntingStore: any = room.storage;
        if (!huntingStore ||
            storeOf(room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) < amountZYN_ALK ||
            storeOf(room, RESOURCE_CATALYZED_GHODIUM_ALKALIDE) < amountGHO_ALK ||
            storeOf(room, RESOURCE_CATALYZED_UTRIUM_ACID) < 300 ||
            storeOf(room, RESOURCE_CATALYZED_KEANIUM_ALKALIDE) < 1200 ||
            storeOf(room, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) < 600) {
            return;
        }
        huntingBoostLabs = [room.memory.labs.outputLab2, room.memory.labs.outputLab3, room.memory.labs.outputLab4, room.memory.labs.outputLab5, room.memory.labs.outputLab7].filter(function (id) { return !!id; });
        huntingClaimBoostLabs = [room.memory.labs.outputLab2, room.memory.labs.outputLab7].filter(function (id) { return !!id; });
        }

        let newNameA = "FreedomFighter-party-1-" + Math.floor(Math.random() * Game.time) + "-" + homeRoomName + "-" + targetRoomName;
        console.log('Adding FreedomFighter to Spawn List: ' + newNameA);
        // Per-body charges (5T/10M/5A/20RA/10H). Only when the store check passed.
        // Own copy per creep: a refused slot must drop off THIS creep's list.
        let huntingLabsA = huntingBoostLabs.slice();
        if (huntingLabsA.length) {
            if (room.memory.labs.outputLab2) chargeOrDrop(room, "lab2", 300, newNameA, huntingLabsA);
            if (room.memory.labs.outputLab3) chargeOrDrop(room, "lab3", 150, newNameA, huntingLabsA);
            if (room.memory.labs.outputLab4) chargeOrDrop(room, "lab4", 600, newNameA, huntingLabsA);
            if (room.memory.labs.outputLab5) chargeOrDrop(room, "lab5", 300, newNameA, huntingLabsA);
            if (room.memory.labs.outputLab7) chargeOrDrop(room, "lab7", 150, newNameA, huntingLabsA);
        }
        room.memory.spawn_list.push([TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL], newNameA, { memory: { role: 'FreedomFighter', targetRoom: targetRoomName, homeRoom: homeRoomName, line:1, lineLength:2+amountToSpawn, boostlabs:huntingLabsA } });

        let newNameB = `FreedomFighter-party-${amountToSpawn+2}-` + Math.floor(Math.random() * Game.time) + "-" + homeRoomName + "-" + targetRoomName;
        console.log('Adding FreedomFighter to Spawn List: ' + newNameB);
        let huntingLabsB = huntingBoostLabs.slice();
        if (huntingLabsB.length) {
            if (room.memory.labs.outputLab2) chargeOrDrop(room, "lab2", 300, newNameB, huntingLabsB);
            if (room.memory.labs.outputLab3) chargeOrDrop(room, "lab3", 150, newNameB, huntingLabsB);
            if (room.memory.labs.outputLab4) chargeOrDrop(room, "lab4", 600, newNameB, huntingLabsB);
            if (room.memory.labs.outputLab5) chargeOrDrop(room, "lab5", 300, newNameB, huntingLabsB);
            if (room.memory.labs.outputLab7) chargeOrDrop(room, "lab7", 150, newNameB, huntingLabsB);
        }
        room.memory.spawn_list.push([TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL], newNameB, { memory: { role: 'FreedomFighter', targetRoom: targetRoomName, homeRoom: homeRoomName, line:amountToSpawn+2, boostlabs:huntingLabsB } });

        let newNameFiller = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
        room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE,CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newNameFiller, { memory: { role: 'filler' } });
        console.log('Adding filler to Spawn List: ' + newNameFiller);



        let newName = 'ContinuousControllerKiller-party-2-' + Math.floor(Math.random() * Game.time) + "-" + homeRoomName + "-" + targetRoomName;
        console.log('Adding ContinuousControllerKiller to Spawn List: ' + newName);
        // CLAIM cannot boost; first CCK is 1T/4M.
        let claimLabs2 = huntingClaimBoostLabs.slice();
        if (claimLabs2.length) {
            if (room.memory.labs.outputLab2) chargeOrDrop(room, "lab2", 120, newName, claimLabs2);
            if (room.memory.labs.outputLab7) chargeOrDrop(room, "lab7", 30, newName, claimLabs2);
        }
        room.memory.spawn_list.push([TOUGH,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,MOVE,MOVE,MOVE,MOVE], newName, { memory: { role: 'CCKparty', targetRoom: targetRoomName, homeRoom: homeRoomName, line:2, boostlabs:claimLabs2 } });

        amountToSpawn--;
        if(amountToSpawn === 0)  return;


        let normalBody = [TOUGH,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,MOVE,MOVE,MOVE];
        let lastBody = [TOUGH,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,MOVE,MOVE];

        let body2 = normalBody;
        if(amountToSpawn === 1) {
            body2 = lastBody
        }
        let newName2 = 'ContinuousControllerKiller-party-3-' + Math.floor(Math.random() * Game.time) + "-" + homeRoomName + "-" + targetRoomName;
        console.log('Adding ContinuousControllerKiller to Spawn List: ' + newName2);
        let claimLabs3 = huntingClaimBoostLabs.slice();
        if (claimLabs3.length) {
            if (room.memory.labs.outputLab2) chargeOrDrop(room, "lab2", body2 === lastBody ? 60 : 90, newName2, claimLabs3);
            if (room.memory.labs.outputLab7) chargeOrDrop(room, "lab7", 30, newName2, claimLabs3);
        }
        room.memory.spawn_list.push(body2, newName2, { memory: { role: 'CCKparty', targetRoom: targetRoomName, homeRoom: homeRoomName, line:3, boostlabs:claimLabs3 } });

        amountToSpawn--;
        if(amountToSpawn === 0)  return;

        let body3 = normalBody;
        if(amountToSpawn === 1) {
            body3 = lastBody
        }
        let newName3 = 'ContinuousControllerKiller-party-4-' + Math.floor(Math.random() * Game.time) + "-" + homeRoomName + "-" + targetRoomName;
        console.log('Adding ContinuousControllerKiller to Spawn List: ' + newName3);
        let claimLabs4 = huntingClaimBoostLabs.slice();
        if (claimLabs4.length) {
            if (room.memory.labs.outputLab2) chargeOrDrop(room, "lab2", body3 === lastBody ? 60 : 90, newName3, claimLabs4);
            if (room.memory.labs.outputLab7) chargeOrDrop(room, "lab7", 30, newName3, claimLabs4);
        }
        room.memory.spawn_list.push(body3, newName3, { memory: { role: 'CCKparty', targetRoom: targetRoomName, homeRoom: homeRoomName, line:4, boostlabs:claimLabs4 } });

        amountToSpawn--;
        if(amountToSpawn === 0)  return;

        let body4 = normalBody;
        if(amountToSpawn === 1) {
            body4 = lastBody
        }
        let newName4 = 'ContinuousControllerKiller-party-5-' + Math.floor(Math.random() * Game.time) + "-" + homeRoomName + "-" + targetRoomName;
        console.log('Adding ContinuousControllerKiller to Spawn List: ' + newName4);
        let claimLabs5 = huntingClaimBoostLabs.slice();
        if (claimLabs5.length) {
            if (room.memory.labs.outputLab2) chargeOrDrop(room, "lab2", body4 === lastBody ? 60 : 90, newName4, claimLabs5);
            if (room.memory.labs.outputLab7) chargeOrDrop(room, "lab7", 30, newName4, claimLabs5);
        }
        room.memory.spawn_list.push(body4, newName4, { memory: { role: 'CCKparty', targetRoom: targetRoomName, homeRoom: homeRoomName, line:5, boostlabs:claimLabs5 } });

        amountToSpawn--;
        if(amountToSpawn === 0)  return;

        let newName5 = 'ContinuousControllerKiller-party-6-' + Math.floor(Math.random() * Game.time) + "-" + homeRoomName + "-" + targetRoomName;
        console.log('Adding ContinuousControllerKiller to Spawn List: ' + newName5);
        let claimLabs6 = huntingClaimBoostLabs.slice();
        if (claimLabs6.length) {
            if (room.memory.labs.outputLab2) chargeOrDrop(room, "lab2", 60, newName5, claimLabs6);
            if (room.memory.labs.outputLab7) chargeOrDrop(room, "lab7", 30, newName5, claimLabs6);
        }
        room.memory.spawn_list.push(lastBody, newName5, { memory: { role: 'CCKparty', targetRoom: targetRoomName, homeRoom: homeRoomName, line:6, boostlabs:claimLabs6 } });


    }
}


global.SMDP = function (roomName, targetRoomName) {
    let room = Game.rooms[roomName];
    if (!room) return "Fail";
    // Guard/RampartDefender call this; missing labs/status used to throw
    // and abort that role. Spawn unboosted (empty boostlabs) instead.
    let labsReady = !!(room.memory.labs && room.memory.labs.status);
    if (Game.rooms[targetRoomName] && Game.rooms[targetRoomName].storage && Game.rooms[targetRoomName].controller && Game.rooms[targetRoomName].controller.level >= 4) {
        let storage: any = Game.getObjectById(room.memory.Structures.storage);
        if (storage && Game.rooms[targetRoomName].controller.my &&
            Game.rooms[targetRoomName].controller.level >= 3 && Game.rooms[targetRoomName].controller.level <= 5 && !Game.rooms[targetRoomName].controller.safeMode &&
            // This body is 40A+10M — no TOUGH — so outputLab7 (XGHO2) is not
            // a boost slot and must not veto the spawn.
            (!labsReady || (storeOf(room, RESOURCE_CATALYZED_UTRIUM_ACID) >= 1200 &&
            storeOf(room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) >= 300 &&
            room.memory.labs.outputLab3 && room.memory.labs.outputLab2))) {

            let body = [
                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,MOVE, MOVE, MOVE, MOVE
            ];

            let newName = 'Guard-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            let smdpBoostLabs = labsReady ? [room.memory.labs.outputLab3, room.memory.labs.outputLab2] : [];
            if (labsReady && room.memory.labs.outputLab2) chargeOrDrop(room, "lab2", 300, newName, smdpBoostLabs);
            if (labsReady && room.memory.labs.outputLab3) chargeOrDrop(room, "lab3", 1200, newName, smdpBoostLabs);
            room.memory.spawn_list.push(body, newName, { memory: { role: 'Guard', homeRoom: roomName, targetRoom: targetRoomName, boostlabs: smdpBoostLabs, again: true } });
            console.log('Adding Guard to Spawn List: ' + newName + roomName, targetRoomName);
            return "Success";

        }
    }
    else {
        let storage: any = Game.getObjectById(room.memory.Structures.storage);
        if (storage && Game.rooms[targetRoomName] && Game.rooms[targetRoomName].controller && Game.rooms[targetRoomName].controller.my &&
            Game.rooms[targetRoomName].controller.level >= 3 && Game.rooms[targetRoomName].controller.level <= 5 && !Game.rooms[targetRoomName].controller.safeMode &&
            (!labsReady || (storeOf(room, RESOURCE_CATALYZED_GHODIUM_ALKALIDE) >= 300 && storeOf(room, RESOURCE_CATALYZED_UTRIUM_ACID) >= 900 &&
            storeOf(room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) >= 300 &&
            room.memory.labs.outputLab3 && room.memory.labs.outputLab2 && room.memory.labs.outputLab7))) {

            let body = [
                TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
                MOVE, MOVE, MOVE, MOVE,
                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                MOVE, MOVE, MOVE, MOVE, MOVE, MOVE
            ];

            let newName = 'Guard-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            let smdpBoostLabs = labsReady ? [room.memory.labs.outputLab3, room.memory.labs.outputLab2, room.memory.labs.outputLab7] : [];
            if (labsReady && room.memory.labs.outputLab2) chargeOrDrop(room, "lab2", 300, newName, smdpBoostLabs);
            if (labsReady && room.memory.labs.outputLab3) chargeOrDrop(room, "lab3", 900, newName, smdpBoostLabs);
            if (labsReady && room.memory.labs.outputLab7) chargeOrDrop(room, "lab7", 300, newName, smdpBoostLabs);
            room.memory.spawn_list.push(body, newName, { memory: { role: 'Guard', homeRoom: roomName, targetRoom: targetRoomName, boostlabs: smdpBoostLabs, again: true } });
            console.log('Adding Guard to Spawn List: ' + newName + roomName, targetRoomName);
            return "Success";

        }
    }
    return "Fail";
}

global.SCCK = function (homeRoom, targetRoomName) {
    if (Game.rooms[homeRoom]) {
        if (Game.rooms[homeRoom].controller && Game.rooms[homeRoom].controller.my && Game.rooms[homeRoom].controller.level === 8) {

            let newName = 'ContinuousControllerKiller-' + Math.floor(Math.random() * Game.time) + "-" + homeRoom + "-" + targetRoomName;
            console.log('Adding ContinuousControllerKiller to Spawn List: ' + newName);

            Game.rooms[homeRoom].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM,ATTACK,MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], newName, { memory: { role: 'CCK', targetRoom: targetRoomName, homeRoom: homeRoom } });
            return "Success!";
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 8). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the ContinuousControllerKiller from...")
    }
    return "Failed to spawn";
}

global.SCCK2 = function (homeRoom, targetRoomName) {
    if (Game.rooms[homeRoom]) {
        if (Game.rooms[homeRoom].controller && Game.rooms[homeRoom].controller.my && Game.rooms[homeRoom].controller.level === 8 && storeOf(Game.rooms[homeRoom], RESOURCE_CATALYZED_GHODIUM_ALKALIDE) >= 50 && storeOf(Game.rooms[homeRoom], RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) >= 100) {

            let cckRoom: any = Game.rooms[homeRoom];
            let newName = 'ContinuousControllerKiller-' + Math.floor(Math.random() * Game.time) + "-" + homeRoom + "-" + targetRoomName;
            console.log('Adding ContinuousControllerKiller to Spawn List: ' + newName);

            // labs may be unset (the push used to dereference it blind), and the
            // charges have to happen BEFORE the list is handed to memory.
            let cckLabs = cckRoom.memory.labs ? [cckRoom.memory.labs.outputLab5, cckRoom.memory.labs.outputLab7].filter(function (id) { return !!id; }) : [];
            if (cckRoom.memory.labs && cckRoom.memory.labs.outputLab5) chargeOrDrop(cckRoom, "lab5", 60, newName, cckLabs);
            if (cckRoom.memory.labs && cckRoom.memory.labs.outputLab7) chargeOrDrop(cckRoom, "lab7", 30, newName, cckLabs);
            cckRoom.memory.spawn_list.push([TOUGH, HEAL, HEAL, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], newName, { memory: { role: 'CCK', targetRoom: targetRoomName, homeRoom: homeRoom, boostlabs: cckLabs } });


            return "Success!";
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 8). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the ContinuousControllerKiller from...")
    }
    return "Failed to spawn";
}

global.spawnConvoy = function (roomName, targetRoomName) {
    let room = Game.rooms[roomName];
    if (room) {
        let newName = 'Convoy-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
        let body = [];
        if(Memory.delayConvoy && Memory.delayConvoy[roomName] &&Memory.delayConvoy[roomName] > 3000) {
            body = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, ATTACK,ATTACK,ATTACK, ATTACK, ATTACK, MOVE];
        }
        else if(Memory.delayConvoy && Memory.delayConvoy[roomName] && Memory.delayConvoy[roomName] > 1000) {
            body = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, ATTACK, ATTACK, MOVE];
        }
        else {
            body = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,CARRY, MOVE]
        }
        room.memory.spawn_list.push(body,
        newName, { memory: { role: 'Convoy', homeRoom: roomName, targetRoom: targetRoomName } });
        console.log('Adding Convoy to Spawn List: ' + newName);

        return "Success!";
    }
    return "Failed to spawn Convoy to room " + targetRoomName;
}


global.spawnSafeModer = function (roomName, targetRoomName) {
    let room = Game.rooms[roomName];
    if (room) {
        let newName = 'SafeModer-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
        let body = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE];
        room.memory.spawn_list.push(body,
            newName, { memory: { role: 'SafeModer', homeRoom: targetRoomName, targetRoom: targetRoomName } });
        console.log('Adding SafeModer to Spawn List: ' + newName);

        return "Success!";
    }
    return "Failed to spawn Convoy to room " + targetRoomName;
}


global.SS = function (roomName, targetRoomName, backupTR = ""): any {
    let room = Game.rooms[roomName];
    if (room) {
        // solomonSlots below reads room.memory.labs.*: no labs memory used to
        // throw straight out of the command.
        if (!room.memory.labs) return "Fail: " + roomName + " has no labs memory";
        let storage: any = Game.getObjectById(room.memory.Structures.storage);
        // 20 HEAL parts charge lab5 600 XLHO2; 270 let a half-boosted Solomon walk in
        if (storage && storeOf(room, RESOURCE_CATALYZED_GHODIUM_ALKALIDE) >= 270 && storeOf(room, RESOURCE_CATALYZED_KEANIUM_ALKALIDE) >= 330 &&
            storeOf(room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) >= 300 && storeOf(room, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) >= 600) {

            let body = [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
                RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
                RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
                MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
                HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
                HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL];

            let newName = 'Solomon-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            // Charge ONLY slots the creep will actually visit. Charging lab4
            // when outputLab4 is missing left use/amount orphaned forever.
            let solomonSlots = [
                {key: "lab2", id: room.memory.labs.outputLab2, amount: 300},  // 10 MOVE * 30 XZHO2
                {key: "lab4", id: room.memory.labs.outputLab4, amount: 330},  // 11 RA * 30 XKHO2
                {key: "lab5", id: room.memory.labs.outputLab5, amount: 600},  // 20 HEAL * 30 XLHO2
                {key: "lab7", id: room.memory.labs.outputLab7, amount: 270},  // 9 TOUGH * 30 XGHO2
            ];
            let solomonBoostLabs = [];
            for(let i = 0; i < solomonSlots.length; i++) {
                if(solomonSlots[i].id) {
                    solomonBoostLabs.push(solomonSlots[i].id);
                    chargeOrDrop(room, solomonSlots[i].key, solomonSlots[i].amount, newName, solomonBoostLabs);
                }
            }
            room.memory.spawn_list.push(body, newName, { memory: { role: 'Solomon', homeRoom: roomName, targetRoom: targetRoomName, backupTR: backupTR, boostlabs: solomonBoostLabs } });
            console.log('Adding Solomon to Spawn List: ' + newName + roomName, targetRoomName);
            return "Success";

        }
    }
    return "Fail";
}


global.SD = function (roomName, targetRoomName, boost = false): any {
    let bodyRam6 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK]
    let bodyRam7 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK];
    let bodyRam8 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK];

    let bodySignifer6 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL];
    let bodySignifer7 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
        HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL];
    let bodySignifer8 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
        HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL];

    let bodyRam8Boosted = [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE];

    let bodySignifer8Boosted = [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE];

    let room = Game.rooms[roomName];

    if (room && room.controller && room.controller.my) {
        let creepsInRoom = room.find(FIND_MY_CREEPS);
        let fillers = creepsInRoom.filter(function (creep) { return creep.memory.role == "filler"; }).length;
        if (fillers < 2) {
            let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName);
        }
        if (fillers < 3) {
            let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName);
        }


        if (room.controller.level == 6) {
            let newNameSignifer = 'Signifer-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
            room.memory.spawn_list.push(bodySignifer6,
                newNameSignifer, { memory: { role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName } });
            console.log('Adding Signifer to Spawn List: ' + newNameSignifer);

            let newNameRam = 'Ram-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
            room.memory.spawn_list.push(bodyRam6,
                newNameRam, { memory: { role: 'ram', targetRoom: targetRoomName, homeRoom: roomName } });
            console.log('Adding Ram to Spawn List: ' + newNameRam);



            return "Success";
        }

        else if (room.controller.level == 7) {
            let newNameSignifer = 'Signifer-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
            room.memory.spawn_list.push(bodySignifer7,
                newNameSignifer, { memory: { role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName } });
            console.log('Adding Signifer to Spawn List: ' + newNameSignifer);

            let newNameRam = 'Ram-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
            room.memory.spawn_list.push(bodyRam7,
                newNameRam, { memory: { role: 'ram', targetRoom: targetRoomName, homeRoom: roomName } });
            console.log('Adding Ram to Spawn List: ' + newNameRam);



            return "Success";
        }

        else if (room.controller.level == 8) {
            let storage: any = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
            if (boost && storeOf(room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) >= 600 && storeOf(room, RESOURCE_CATALYZED_UTRIUM_ACID) >= 1050 &&
                storeOf(room, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) >= 1050 && storeOf(room, RESOURCE_CATALYZED_GHODIUM_ALKALIDE) >= 300 &&
                room.memory.labs && room.memory.labs.outputLab2 && room.memory.labs.outputLab3 && room.memory.labs.outputLab5 && room.memory.labs.outputLab7) {
                let newNameRam = 'Ram-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
                let newNameSignifer = 'Signifer-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
                let ramLabs = [room.memory.labs.outputLab3, room.memory.labs.outputLab2, room.memory.labs.outputLab7];
                let signiferLabs = [room.memory.labs.outputLab5, room.memory.labs.outputLab2, room.memory.labs.outputLab7];
                chargeOrDrop(room, "lab3", 1050, newNameRam, ramLabs);
                chargeOrDrop(room, "lab2", 300, newNameRam, ramLabs);
                chargeOrDrop(room, "lab7", 150, newNameRam, ramLabs);
                chargeOrDrop(room, "lab5", 1050, newNameSignifer, signiferLabs);
                chargeOrDrop(room, "lab2", 300, newNameSignifer, signiferLabs);
                chargeOrDrop(room, "lab7", 150, newNameSignifer, signiferLabs);

                room.memory.spawn_list.push(bodyRam8Boosted,
                    newNameRam, { memory: { role: 'ram', targetRoom: targetRoomName, homeRoom: roomName, boostlabs: ramLabs } });
                console.log('Adding Ram to Spawn List: ' + newNameRam);

                room.memory.spawn_list.push(bodySignifer8Boosted,
                    newNameSignifer, { memory: { role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName, boostlabs: signiferLabs } });
                console.log('Adding Signifer to Spawn List: ' + newNameSignifer);




                return "Success with boost";
            }
            else if (room.controller.level == 8 && !boost) {
                let newNameSignifer = 'Signifer-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
                room.memory.spawn_list.push(bodySignifer8,
                    newNameSignifer, { memory: { role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName } });
                console.log('Adding Signifer to Spawn List: ' + newNameSignifer);


                let newNameRam = 'Ram-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
                room.memory.spawn_list.push(bodyRam8,
                    newNameRam, { memory: { role: 'ram', targetRoom: targetRoomName, homeRoom: roomName } });
                console.log('Adding Ram to Spawn List: ' + newNameRam);

                return "Success without boost";
            }


        }

    }

}

global.SDB = function (roomName, targetRoomName, boost = false, defendController = false): any {
    let bodyRam6 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK]
    let bodyRam7 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK];
    let bodyRam8 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK];

    let bodySignifer6 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL];
    let bodySignifer7 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
        HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL];
    let bodySignifer8 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
        HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL];

    let bodyRam8Boosted = [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        TOUGH, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE];

    let bodySignifer8Boosted = [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        TOUGH, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE];

    let room = Game.rooms[roomName];

    if (room && room.controller && room.controller.my) {
        let creepsInRoom = room.find(FIND_MY_CREEPS);
        let fillers = creepsInRoom.filter(function (creep) { return creep.memory.role == "filler"; }).length;
        if (fillers < 2) {
            let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName);
        }
        if (fillers < 3) {
            let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName);
        }


        if (room.controller.level == 6) {
            let newNameSignifer = 'Signifer-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
            room.memory.spawn_list.push(bodySignifer6,
                newNameSignifer, { memory: { role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName } });
            console.log('Adding Signifer to Spawn List: ' + newNameSignifer);

            let newNameRam = 'Ram-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
            room.memory.spawn_list.push(bodyRam6,
                newNameRam, { memory: { role: 'ram', targetRoom: targetRoomName, homeRoom: roomName } });
            console.log('Adding Ram to Spawn List: ' + newNameRam);



            return "Success";
        }

        else if (room.controller.level == 7) {
            let newNameSignifer = 'Signifer-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
            room.memory.spawn_list.push(bodySignifer7,
                newNameSignifer, { memory: { role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName } });
            console.log('Adding Signifer to Spawn List: ' + newNameSignifer);

            let newNameRam = 'Ram-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
            room.memory.spawn_list.push(bodyRam7,
                newNameRam, { memory: { role: 'ram', targetRoom: targetRoomName, homeRoom: roomName } });
            console.log('Adding Ram to Spawn List: ' + newNameRam);



            return "Success";
        }

        else if (room.controller.level == 8) {
            let storage: any = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
            if (boost && storeOf(room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) >= 600 && storeOf(room, RESOURCE_CATALYZED_UTRIUM_ACID) >= 870 &&
                storeOf(room, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) >= 870 && storeOf(room, RESOURCE_CATALYZED_GHODIUM_ALKALIDE) >= 660 &&
                room.memory.labs && room.memory.labs.outputLab2 && room.memory.labs.outputLab3 && room.memory.labs.outputLab5 && room.memory.labs.outputLab7) {
                // Per-owner charges matching the bodies (11T/29A/10M and 11T/29H/10M).
                // 29*30=870 — this is not SD's 35-attack 1050 body.
                let newNameRam = 'Ram-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
                let newNameSignifer = 'Signifer-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
                let ramLabs = [room.memory.labs.outputLab3, room.memory.labs.outputLab2, room.memory.labs.outputLab7];
                let signiferLabs = [room.memory.labs.outputLab2, room.memory.labs.outputLab5, room.memory.labs.outputLab7];
                chargeOrDrop(room, "lab3", 870, newNameRam, ramLabs);            // 29 ATTACK
                chargeOrDrop(room, "lab2", 300, newNameRam, ramLabs);            // 10 MOVE
                chargeOrDrop(room, "lab7", 330, newNameRam, ramLabs);            // 11 TOUGH
                chargeOrDrop(room, "lab5", 870, newNameSignifer, signiferLabs);  // 29 HEAL
                chargeOrDrop(room, "lab2", 300, newNameSignifer, signiferLabs);  // 10 MOVE
                chargeOrDrop(room, "lab7", 330, newNameSignifer, signiferLabs);  // 11 TOUGH

                room.memory.spawn_list.push(bodyRam8Boosted,
                    newNameRam, { memory: { role: 'ram', targetRoom: targetRoomName, homeRoom: roomName, boostlabs: ramLabs, defendController:true } });
                console.log('Adding Ram to Spawn List: ' + newNameRam);

                room.memory.spawn_list.push(bodySignifer8Boosted,
                    newNameSignifer, { memory: { role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName, boostlabs: signiferLabs } });
                console.log('Adding Signifer to Spawn List: ' + newNameSignifer);




                return "Success with boost";
            }
            else if (room.controller.level == 8 && !boost) {
                let newNameSignifer = 'Signifer-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
                room.memory.spawn_list.push(bodySignifer8,
                    newNameSignifer, { memory: { role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName } });
                console.log('Adding Signifer to Spawn List: ' + newNameSignifer);


                let newNameRam = 'Ram-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
                room.memory.spawn_list.push(bodyRam8,
                    newNameRam, { memory: { role: 'ram', targetRoom: targetRoomName, homeRoom: roomName } });
                console.log('Adding Ram to Spawn List: ' + newNameRam);

                return "Success without boost";
            }


        }

    }

}

global.SQR = function (roomName, targetRoomName, boost = false): any {

    let room = Game.rooms[roomName];
    if (!room) return;
    let creepsInRoom = room.find(FIND_MY_CREEPS);
    let fillers = creepsInRoom.filter(function (creep) { return creep.memory.role == "filler"; }).length;
    let CreepA = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepA"; }).length;
    let CreepB = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepB"; }).length;
    let CreepY = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepY"; }).length;
    let CreepZ = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepZ"; }).length;
    if (room.controller.level >= 6 && CreepA == 0 && CreepB == 0 && CreepY == 0 && CreepZ == 0) {

        if (fillers < 3) {
            let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName);
        }

        if (fillers < 4) {
            let newName2 = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName2, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName2);
        }

        if (fillers < 5) {
            let newName3 = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName3, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName3);
        }


        if (Memory.CanClaimRemote >= 1) {
            let newName = 'WallClearer-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, CLAIM, MOVE], newName, { memory: { role: 'WallClearer', homeRoom: room.name, targetRoom: targetRoomName } });
            console.log('Adding wall-clearer to Spawn List: ' + newName);
        }

        let bodyLevel6Back = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, MOVE];
        let bodyLevel6Front = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            MOVE];

        let bodyLevel7Back = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, MOVE];

        let bodyLevel7Front = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, MOVE];



        let bodyLevel8Back = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            MOVE];

        let bodyLevel8Front = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            MOVE]

        let bodyLevel8BoostedBack = [HEAL, HEAL, HEAL, HEAL, HEAL,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            MOVE];

        let bodyLevel8BoostedFront = [RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            RANGED_ATTACK, RANGED_ATTACK,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            MOVE];


        let RandomWords = Math.floor(Math.random() * Game.time)

        if (room.controller.level == 6) {
            let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Back, newNameA, { memory: { role: 'SquadCreepA', targetPosition: new RoomPosition(25, 25, targetRoomName) } });
            console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

            let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Back, newNameB, { memory: { role: 'SquadCreepB' } });
            console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

            let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Front, newNameY, { memory: { role: 'SquadCreepY' } });
            console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

            let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Front, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name } });
            console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

            return "Success!"
        }
        else if (room.controller.level == 7) {
            let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Back, newNameA, { memory: { role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25, 25, targetRoomName) } });
            console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

            let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Back, newNameB, { memory: { role: 'SquadCreepB', homeRoom: room.name } });
            console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

            let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Front, newNameY, { memory: { role: 'SquadCreepY', homeRoom: room.name } });
            console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

            let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Front, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name } });
            console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

            return "Success!"
        }

        else if (room.controller.level == 8) {



            let storage: any = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
            if (boost && storeOf(room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) >= 1200 && storeOf(room, RESOURCE_CATALYZED_KEANIUM_ALKALIDE) >= 2400 &&
                storeOf(room, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) >= 2400 &&
                room.memory.labs && room.memory.labs.outputLab2 && room.memory.labs.outputLab4 && room.memory.labs.outputLab5) {

                let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
                let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
                let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
                let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
                let labsA = [room.memory.labs.outputLab2, room.memory.labs.outputLab5];
                let labsB = [room.memory.labs.outputLab2, room.memory.labs.outputLab5];
                let labsY = [room.memory.labs.outputLab2, room.memory.labs.outputLab4];
                let labsZ = [room.memory.labs.outputLab2, room.memory.labs.outputLab4];
                chargeOrDrop(room, "lab5", 1200, newNameA, labsA);
                chargeOrDrop(room, "lab2", 300, newNameA, labsA);
                chargeOrDrop(room, "lab5", 1200, newNameB, labsB);
                chargeOrDrop(room, "lab2", 300, newNameB, labsB);
                chargeOrDrop(room, "lab4", 1200, newNameY, labsY);
                chargeOrDrop(room, "lab2", 300, newNameY, labsY);
                chargeOrDrop(room, "lab4", 1200, newNameZ, labsZ);
                chargeOrDrop(room, "lab2", 300, newNameZ, labsZ);

                room.memory.spawn_list.push(bodyLevel8BoostedBack, newNameA, { memory: { role: 'SquadCreepA', homeRoom: room.name, boostlabs: labsA, targetPosition: new RoomPosition(25, 25, targetRoomName) } });
                console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

                room.memory.spawn_list.push(bodyLevel8BoostedBack, newNameB, { memory: { role: 'SquadCreepB', homeRoom: room.name, boostlabs: labsB } });
                console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

                room.memory.spawn_list.push(bodyLevel8BoostedFront, newNameY, { memory: { role: 'SquadCreepY', homeRoom: room.name, boostlabs: labsY } });
                console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

                room.memory.spawn_list.push(bodyLevel8BoostedFront, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name, boostlabs: labsZ } });
                console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

                return "Success with boost";


            }

            else if (room.controller.level == 8 && !boost) {
                let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Back, newNameA, { memory: { role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25, 25, targetRoomName) } });
                console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

                let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Back, newNameB, { memory: { role: 'SquadCreepB', homeRoom: room.name } });
                console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

                let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Front, newNameY, { memory: { role: 'SquadCreepY', homeRoom: room.name } });
                console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

                let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Front, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name } });
                console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

                return "Success!"
            }


        }
    }



}

// tell a traveling quad to split into two duos for the rest of the journey; they
// regroup one room short of the target and reassemble into the quad on arrival
global.QSPLIT = function (roomName): any {
    const room = Game.rooms[roomName];
    if (!room) return "no visibility on " + roomName;
    const leader: any = room.find(FIND_MY_CREEPS, { filter: (c: any) => c.memory.role == "SquadCreepA" })[0];
    if (!leader) return "no quad leader in " + roomName;
    leader.memory.splitTravel = true;
    return "quad in " + roomName + " will split into duos";
}

// 2-creep strike team for RCL 6/7: ranged leader + healer that chases it.
// boostLabIds: optional array of lab ids preloaded with boost minerals — passed
// straight to memory.boostlabs so the pair boosts before leaving (T3 recommended:
// XKHO2 the leader, XLHO2/XGHO2 the healer).
global.DUO = function (roomName, targetRoomName, boostLabIds: any = []): any {

    let room = Game.rooms[roomName];
    if (!room) return "no visibility on " + roomName;
    if (!room.controller || room.controller.level < 6) return "need RCL 6+";

    let bodyLeader;
    let bodyHealer;
    if (room.controller.level >= 7) {
        bodyLeader = [RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
        bodyHealer = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, MOVE];
    }
    else {
        bodyLeader = [RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
        bodyHealer = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL, MOVE];
    }

    let RandomWords = Math.floor(Math.random() * Game.time);

    // The ids used to go straight into memory with NO ledger charge: the
    // EnergyManager only fills a lab with use>0, so the pair waited out the
    // 80-tick Boost() timeout per lab and could consume a sibling's mineral on
    // the way. Charge each requested lab for the parts this body can boost.
    let duoLabIds = Array.isArray(boostLabIds) ? boostLabIds : [];
    const chargeDuo = function (body: any, creepName: string): any[] {
        let kept: any[] = [];
        for (let id of duoLabIds) {
            let key = labKeyForId(room, id);
            let mineral = key ? LAB_SLOT_MINERAL[key] : null;
            if (!mineral) continue;
            let parts = 0;
            for (let part of body) {
                if (BOOSTS[part] && BOOSTS[part][mineral]) parts++;
            }
            if (!parts) continue;   // nothing on this body takes that boost
            if (chargeBoostSlot(room, key, parts * LAB_BOOST_MINERAL, creepName)) kept.push(id);
            else console.log("boost slot refused: " + room.name + " " + key + " for " + creepName + " - queueing unboosted for that lab");
        }
        return kept;
    };

    let newNameA = 'DuoCreepA-' + RandomWords + "-" + room.name;
    let duoLabsA = chargeDuo(bodyLeader, newNameA);
    room.memory.spawn_list.push(bodyLeader, newNameA, { memory: { role: 'DuoCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25, 25, targetRoomName), boostlabs: duoLabsA } });
    console.log('Adding DuoCreepA to Spawn List: ' + newNameA);

    let newNameB = 'DuoCreepB-' + RandomWords + "-" + room.name;
    let duoLabsB = chargeDuo(bodyHealer, newNameB);
    room.memory.spawn_list.push(bodyHealer, newNameB, { memory: { role: 'DuoCreepB', homeRoom: room.name, boostlabs: duoLabsB } });
    console.log('Adding DuoCreepB to Spawn List: ' + newNameB);

    return "Duo queued for " + targetRoomName;
}

global.SQM = function (roomName, targetRoomName, boost = false): any {

    let room = Game.rooms[roomName];
    if (!room) return;
    let creepsInRoom = room.find(FIND_MY_CREEPS);
    let fillers = creepsInRoom.filter(function (creep) { return creep.memory.role == "filler"; }).length;
    let CreepA = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepA"; }).length;
    let CreepB = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepB"; }).length;
    let CreepY = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepY"; }).length;
    let CreepZ = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepZ"; }).length;
    if (room.controller.level >= 6 && CreepA == 0 && CreepB == 0 && CreepY == 0 && CreepZ == 0) {

        if (fillers < 3) {
            let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName);
        }

        if (fillers < 4) {
            let newName2 = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName2, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName2);
        }

        if (fillers < 5) {
            let newName3 = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName3, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName3);
        }

        if (Memory.CanClaimRemote >= 1) {
            let newName = 'WallClearer-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, CLAIM, MOVE], newName, { memory: { role: 'WallClearer', homeRoom: room.name, targetRoom: targetRoomName } });
            console.log('Adding wall-clearer to Spawn List: ' + newName);
        }

        let bodyLevel6Back = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, MOVE];
        let bodyLevel6Front = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            MOVE];

        let bodyLevel7Back = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, MOVE];

        let bodyLevel7Front = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, MOVE];



        let bodyLevel8Back = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            MOVE];

        let bodyLevel8Front = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            MOVE]

        let bodyLevel8BoostedBack = [HEAL, HEAL, HEAL, HEAL, HEAL,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            MOVE];

        let bodyLevel8BoostedFront = [ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK,
            MOVE];


        let RandomWords = Game.time

        if (room.controller.level == 6) {
            let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Back, newNameA, { memory: { role: 'SquadCreepA', targetPosition: new RoomPosition(25, 25, targetRoomName) } });
            console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

            let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Back, newNameB, { memory: { role: 'SquadCreepB' } });
            console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

            let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Front, newNameY, { memory: { role: 'SquadCreepY' } });
            console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

            let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Front, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name } });
            console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

            return "Success!"
        }
        else if (room.controller.level == 7) {
            let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Back, newNameA, { memory: { role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25, 25, targetRoomName) } });
            console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

            let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Back, newNameB, { memory: { role: 'SquadCreepB', homeRoom: room.name } });
            console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

            let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Front, newNameY, { memory: { role: 'SquadCreepY', homeRoom: room.name } });
            console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

            let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Front, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name } });
            console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

            return "Success!"
        }

        else if (room.controller.level == 8) {



            let storage: any = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
            if (boost && storeOf(room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) >= 1200 && storeOf(room, RESOURCE_CATALYZED_UTRIUM_ACID) >= 2400 &&
                storeOf(room, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) >= 2400 &&
                room.memory.labs && room.memory.labs.outputLab2 && room.memory.labs.outputLab3 && room.memory.labs.outputLab5) {

                let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
                let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
                let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
                let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
                let labsA = [room.memory.labs.outputLab2, room.memory.labs.outputLab5];
                let labsB = [room.memory.labs.outputLab2, room.memory.labs.outputLab5];
                let labsY = [room.memory.labs.outputLab2, room.memory.labs.outputLab3];
                let labsZ = [room.memory.labs.outputLab2, room.memory.labs.outputLab3];
                chargeOrDrop(room, "lab5", 1200, newNameA, labsA);
                chargeOrDrop(room, "lab2", 300, newNameA, labsA);
                chargeOrDrop(room, "lab5", 1200, newNameB, labsB);
                chargeOrDrop(room, "lab2", 300, newNameB, labsB);
                chargeOrDrop(room, "lab3", 1200, newNameY, labsY);
                chargeOrDrop(room, "lab2", 300, newNameY, labsY);
                chargeOrDrop(room, "lab3", 1200, newNameZ, labsZ);
                chargeOrDrop(room, "lab2", 300, newNameZ, labsZ);

                room.memory.spawn_list.push(bodyLevel8BoostedBack, newNameA, { memory: { role: 'SquadCreepA', homeRoom: room.name, boostlabs: labsA, targetPosition: new RoomPosition(25, 25, targetRoomName) } });
                console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

                room.memory.spawn_list.push(bodyLevel8BoostedBack, newNameB, { memory: { role: 'SquadCreepB', homeRoom: room.name, boostlabs: labsB } });
                console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

                room.memory.spawn_list.push(bodyLevel8BoostedFront, newNameY, { memory: { role: 'SquadCreepY', homeRoom: room.name, boostlabs: labsY } });
                console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

                room.memory.spawn_list.push(bodyLevel8BoostedFront, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name, boostlabs: labsZ } });
                console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

                return "Success with boost";


            }

            else if (room.controller.level == 8 && !boost) {
                let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Back, newNameA, { memory: { role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25, 25, targetRoomName) } });
                console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

                let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Back, newNameB, { memory: { role: 'SquadCreepB', homeRoom: room.name } });
                console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

                let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Front, newNameY, { memory: { role: 'SquadCreepY', homeRoom: room.name } });
                console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

                let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Front, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name } });
                console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

                return "Success!"
            }


        }
    }



}

global.SQD = function (roomName, targetRoomName, boost = false): any {

    let room = Game.rooms[roomName];
    if (!room) return;
    let creepsInRoom = room.find(FIND_MY_CREEPS);
    let fillers = creepsInRoom.filter(function (creep) { return creep.memory.role == "filler"; }).length;
    let CreepA = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepA"; }).length;
    let CreepB = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepB"; }).length;
    let CreepY = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepY"; }).length;
    let CreepZ = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepZ"; }).length;
    if (room.controller.level >= 6 && CreepA == 0 && CreepB == 0 && CreepY == 0 && CreepZ == 0) {

        if (fillers < 3) {
            let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName);
        }

        if (fillers < 4) {
            let newName2 = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName2, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName2);
        }

        if (fillers < 5) {
            let newName3 = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName3, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName3);
        }

        if (Memory.CanClaimRemote >= 1) {
            let newName = 'WallClearer-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, CLAIM, MOVE], newName, { memory: { role: 'WallClearer', homeRoom: room.name, targetRoom: targetRoomName } });
            console.log('Adding wall-clearer to Spawn List: ' + newName);
        }

        let bodyLevel6Back = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, MOVE];
        let bodyLevel6Front = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            WORK, WORK, WORK, WORK, WORK, WORK, WORK,
            MOVE];

        let bodyLevel7Back = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, MOVE];

        let bodyLevel7Front = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK,
            WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, MOVE];



        let bodyLevel8Back = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            MOVE];

        let bodyLevel8Front = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK,
            WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK,
            WORK, WORK, WORK,
            MOVE]

        let bodyLevel8BoostedBack = [HEAL, HEAL, HEAL, HEAL, HEAL,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            MOVE];

        let bodyLevel8BoostedFront = [WORK, WORK, WORK, WORK, WORK,
            WORK, WORK, WORK, WORK, WORK,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            WORK, WORK,
            WORK, WORK, WORK, WORK, WORK, WORK,
            WORK, WORK, WORK, WORK, WORK, WORK,
            WORK, WORK, WORK, WORK, WORK, WORK,
            WORK, WORK, WORK, WORK, WORK, WORK,
            WORK, WORK, WORK, WORK,
            MOVE];


        let RandomWords = Math.floor(Math.random() * Game.time)

        if (room.controller.level == 6) {
            let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Back, newNameA, { memory: { role: 'SquadCreepA', targetPosition: new RoomPosition(25, 25, targetRoomName) } });
            console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

            let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Back, newNameB, { memory: { role: 'SquadCreepB' } });
            console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

            let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Front, newNameY, { memory: { role: 'SquadCreepY' } });
            console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

            let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Front, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name } });
            console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

            return "Success!"
        }
        else if (room.controller.level == 7) {
            let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Back, newNameA, { memory: { role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25, 25, targetRoomName) } });
            console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

            let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Back, newNameB, { memory: { role: 'SquadCreepB', homeRoom: room.name } });
            console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

            let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Front, newNameY, { memory: { role: 'SquadCreepY', homeRoom: room.name } });
            console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

            let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Front, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name } });
            console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

            return "Success!"
        }

        else if (room.controller.level == 8) {



            let storage: any = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
            if (boost && storeOf(room, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) >= 1200 && storeOf(room, RESOURCE_CATALYZED_ZYNTHIUM_ACID) >= 2400 &&
                storeOf(room, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) >= 2400 &&
                room.memory.labs && room.memory.labs.outputLab2 && room.memory.labs.outputLab5 && room.memory.labs.outputLab6) {

                let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
                let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
                let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
                let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
                let labsA = [room.memory.labs.outputLab2, room.memory.labs.outputLab5];
                let labsB = [room.memory.labs.outputLab2, room.memory.labs.outputLab5];
                let labsY = [room.memory.labs.outputLab2, room.memory.labs.outputLab6];
                let labsZ = [room.memory.labs.outputLab2, room.memory.labs.outputLab6];
                chargeOrDrop(room, "lab5", 1200, newNameA, labsA);
                chargeOrDrop(room, "lab2", 300, newNameA, labsA);
                chargeOrDrop(room, "lab5", 1200, newNameB, labsB);
                chargeOrDrop(room, "lab2", 300, newNameB, labsB);
                chargeOrDrop(room, "lab6", 1200, newNameY, labsY);
                chargeOrDrop(room, "lab2", 300, newNameY, labsY);
                chargeOrDrop(room, "lab6", 1200, newNameZ, labsZ);
                chargeOrDrop(room, "lab2", 300, newNameZ, labsZ);

                room.memory.spawn_list.push(bodyLevel8BoostedBack, newNameA, { memory: { role: 'SquadCreepA', homeRoom: room.name, boostlabs: labsA, targetPosition: new RoomPosition(25, 25, targetRoomName) } });
                console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

                room.memory.spawn_list.push(bodyLevel8BoostedBack, newNameB, { memory: { role: 'SquadCreepB', homeRoom: room.name, boostlabs: labsB } });
                console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

                room.memory.spawn_list.push(bodyLevel8BoostedFront, newNameY, { memory: { role: 'SquadCreepY', homeRoom: room.name, boostlabs: labsY } });
                console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

                room.memory.spawn_list.push(bodyLevel8BoostedFront, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name, boostlabs: labsZ } });
                console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

                return "Success with boost";


            }

            else if (room.controller.level == 8 && !boost) {
                let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Back, newNameA, { memory: { role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25, 25, targetRoomName) } });
                console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

                let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Back, newNameB, { memory: { role: 'SquadCreepB', homeRoom: room.name } });
                console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

                let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Front, newNameY, { memory: { role: 'SquadCreepY', homeRoom: room.name } });
                console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

                let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Front, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name } });
                console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

                return "Success!"
            }


        }
    }



}

global.SRDP = function (roomName, targetRoomName) {
    if (Game.rooms[roomName]) {
        if (Game.rooms[roomName].controller && Game.rooms[roomName].controller.my && Game.rooms[roomName].controller.level > 4) {


            let newName = 'RemoteDismantler-' + roomName + "-" + targetRoomName + Math.floor(Math.random() * 100000);
            console.log('Adding RemoteDismantler to Spawn List: ' + newName);


            if (Game.rooms[roomName].controller.level == 5) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK], newName, { memory: { role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName, persistent: true } });
                return "Success!";
            }

            else if (Game.rooms[roomName].controller.level == 6) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK], newName, { memory: { role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName, persistent: true } });
                return "Success!";
            }

            else if (Game.rooms[roomName].controller.level == 7) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK], newName, { memory: { role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName, persistent: true } });
                return "Success!";
            }

            else if (Game.rooms[roomName].controller.level == 8) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK], newName, { memory: { role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName, persistent: true } });
                return "Success!";
            }

            else {
                console.log("Controller Level too low to spawn Remote Dismantler")
            }
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 5). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the Remote Dismantler from...")
    }
    return "Failed to spawn";
}

global.SRD = function (roomName, targetRoomName) {
    if (Game.rooms[roomName]) {
        if (Game.rooms[roomName].controller && Game.rooms[roomName].controller.my && Game.rooms[roomName].controller.level > 4) {


            let newName = 'RemoteDismantler-' + roomName + "-" + targetRoomName + Math.floor(Math.random() * 100000);
            console.log('Adding RemoteDismantler to Spawn List: ' + newName);


            if (Game.rooms[roomName].controller.level == 5) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK], newName, { memory: { role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName } });
                return "Success!";
            }

            else if (Game.rooms[roomName].controller.level == 6) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK], newName, { memory: { role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName } });
                return "Success!";
            }

            else if (Game.rooms[roomName].controller.level == 7) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK], newName, { memory: { role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName } });
                return "Success!";
            }

            else if (Game.rooms[roomName].controller.level == 8) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK], newName, { memory: { role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName } });
                return "Success!";
            }

            else {
                console.log("Controller Level too low to spawn Remote Dismantler")
            }
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 5). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the Remote Dismantler from...")
    }
    return "Failed to spawn";
}

global.SC = function (targetRoomName, x, y) {
    // Spawn tile must be interior (1..48). Exit-band 0/49 is illegal for a
    // spawn. AutoExpand may still overwrite this entry (R6.126 deferred);
    // this helper only validates the console args.
    if(typeof targetRoomName !== 'string' || typeof x !== 'number' || typeof y !== 'number' ||
       x < 1 || x > 48 || y < 1 || y > 48) {
        return "Invalid parameters: x and y must be numbers between 1-48, targetRoomName must be a string";
    }
    if(!Memory.target_colonise) {
        Memory.target_colonise = {};
    }
    Memory.target_colonise.room = targetRoomName;
    Memory.target_colonise.spawn_pos = new RoomPosition(x, y, targetRoomName);
    Memory.target_colonise.lastSpawnRanger = 1501;
    return "Success!"
}

global.SG = function (homeRoom, targetRoomName) {
    if (Game.rooms[homeRoom]) {
        if (Game.rooms[homeRoom].controller && Game.rooms[homeRoom].controller.my && Game.rooms[homeRoom].controller.level >= 4) {

            let creepsInRoom = Game.rooms[homeRoom].find(FIND_MY_CREEPS);
            let fillers = creepsInRoom.filter(function (creep) { return creep.memory.role == "filler"; }).length;
            if (fillers < 3) {
                let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + Game.rooms[homeRoom].name;
                Game.rooms[homeRoom].memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
                console.log('Adding filler to Spawn List: ' + newName);
            }


            let newName = 'Goblin-' + Math.floor(Math.random() * Game.time) + "-" + homeRoom + "-" + targetRoomName;
            console.log('Adding Goblin to Spawn List: ' + newName);

            if (Game.rooms[homeRoom].controller.level == 4) {
                Game.rooms[homeRoom].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], newName, { memory: { role: 'goblin', targetRoom: targetRoomName, homeRoom: homeRoom } });
                return "Success!";
            }

            else if (Game.rooms[homeRoom].controller.level == 5) {
                Game.rooms[homeRoom].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE], newName, { memory: { role: 'goblin', targetRoom: targetRoomName, homeRoom: homeRoom } });
                return "Success!";
            }

            else if (Game.rooms[homeRoom].controller.level == 6) {
                Game.rooms[homeRoom].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE], newName, { memory: { role: 'goblin', targetRoom: targetRoomName, homeRoom: homeRoom } });
                return "Success!";
            }

            else if (Game.rooms[homeRoom].controller.level == 7 || Game.rooms[homeRoom].controller.level == 8) {
                Game.rooms[homeRoom].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE], newName, { memory: { role: 'goblin', targetRoom: targetRoomName, homeRoom: homeRoom } });
                return "Success!";
            }

            else {
                console.log("Controller Level too low to spawn Goblin")
            }
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 5). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the Goblin from...")
    }
    return "Failed to spawn";

}

global.SGB = function (homeRoom, targetRoomName) {
    if (Game.rooms[homeRoom]) {
        if (Game.rooms[homeRoom].controller && Game.rooms[homeRoom].controller.my && Game.rooms[homeRoom].controller.level > 4) {

            let creepsInRoom = Game.rooms[homeRoom].find(FIND_MY_CREEPS);
            let fillers = creepsInRoom.filter(function (creep) { return creep.memory.role == "filler"; }).length;
            if (fillers < 3) {
                let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + Game.rooms[homeRoom].name;
                Game.rooms[homeRoom].memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
                console.log('Adding filler to Spawn List: ' + newName);
            }


            let newName = 'Goblin-' + Math.floor(Math.random() * Game.time) + "-" + homeRoom + "-" + targetRoomName;
            console.log('Adding Goblin to Spawn List: ' + newName);


            if (Game.rooms[homeRoom].controller.level == 5) {
                Game.rooms[homeRoom].memory.spawn_list.push([MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], newName, { memory: { role: 'goblin', targetRoom: targetRoomName, homeRoom: homeRoom } });
                return "Success!";
            }

            else if (Game.rooms[homeRoom].controller.level == 6) {
                Game.rooms[homeRoom].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE], newName, { memory: { role: 'goblin', targetRoom: targetRoomName, homeRoom: homeRoom } });
                return "Success!";
            }

            else if (Game.rooms[homeRoom].controller.level == 7 || Game.rooms[homeRoom].controller.level == 8) {
                Game.rooms[homeRoom].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE], newName, { memory: { role: 'goblin', targetRoom: targetRoomName, homeRoom: homeRoom } });
                return "Success!";
            }

            else {
                console.log("Controller Level too low to spawn Goblin")
            }
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 5). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the Goblin from...")
    }
    return "Failed to spawn";

}

global.SCK = function (homeRoom, targetRoomName) {
    if (Game.rooms[homeRoom]) {
        if (Game.rooms[homeRoom].controller && Game.rooms[homeRoom].controller.my && Game.rooms[homeRoom].controller.level > 4) {

            let newName = 'CreepKiller-' + Math.floor(Math.random() * Game.time) + "-" + homeRoom + "-" + targetRoomName;
            console.log('Adding CreepKiller to Spawn List: ' + newName);

            Game.rooms[homeRoom].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, MOVE], newName, { memory: { role: 'CreepKiller', targetRoom: targetRoomName, homeRoom: homeRoom } });
            return "Success!";
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 5). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the CreepKiller from...")
    }
    return "Failed to spawn";
}

global.SGD = function (homeRoom, targetRoomName, body) {
    if (Game.rooms[homeRoom]) {
        if (Game.rooms[homeRoom].controller && Game.rooms[homeRoom].controller.my && targetRoomName !== homeRoom) {

            let newName = 'Guard-' + Math.floor(Math.random() * Game.time) + "-" + homeRoom + "-" + targetRoomName;
            console.log('Adding Guard to Spawn List: ' + newName);

            Game.rooms[homeRoom].memory.spawn_list.push(body, newName, { memory: { role: 'Guard', targetRoom: targetRoomName, homeRoom: homeRoom, coma: true } });
            return "Success!";
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 5). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the Guard from...")
    }
    return "Failed to spawn";
}


global.SPK = function (homeRoom, targetRoomName) {

    if (Game.rooms[homeRoom] && !Game.rooms[homeRoom].memory.danger) {
        let meleeBody = [
            TOUGH, MOVE,
            MOVE, MOVE,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE
            , MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK];
        let healBody = [
            MOVE, MOVE, MOVE, MOVE, MOVE,
            MOVE, MOVE, MOVE, MOVE, MOVE,
            MOVE, MOVE, MOVE, MOVE, MOVE,
            MOVE, MOVE, MOVE, MOVE, MOVE,
            MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL];


        let creepsInRoom = Game.rooms[targetRoomName].find(FIND_MY_CREEPS);
        let PowerMelees = creepsInRoom.filter(function (creep) { return creep.memory.role == "PowerMelee"; }).length;
        if (PowerMelees <= 1) {
            if (Game.rooms[homeRoom].energyAvailable < 9750) {
                let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + Game.rooms[homeRoom].name;
                Game.rooms[homeRoom].memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
                console.log('Adding filler to Spawn List: ' + newName);
            }

            let newName = 'PowerMelee-' + Math.floor(Math.random() * Game.time) + "-" + homeRoom + "-" + targetRoomName;
            console.log('Adding PowerMelee to Spawn List: ' + newName);
            Game.rooms[homeRoom].memory.spawn_list.push(meleeBody, newName, { memory: { role: 'PowerMelee', targetRoom: targetRoomName, homeRoom: homeRoom } });

            let newName2 = 'PowerHeal-' + Math.floor(Math.random() * Game.time) + "-" + homeRoom + "-" + targetRoomName;
            console.log('Adding PowerHeal to Spawn List: ' + newName2);
            Game.rooms[homeRoom].memory.spawn_list.push(healBody, newName2, { memory: { role: 'PowerHeal', targetRoom: targetRoomName, homeRoom: homeRoom } });


            return "Success!";
        }
    }

    return "Failed."

}

global.SDM = function (homeRoom, targetRoomName) {
    let room = Game.rooms[homeRoom];
    if (room && !room.memory.danger && Memory.CPU.fiveHundredTickAvg.avg < Game.cpu.limit + 2 && Game.cpu.bucket > 9500) {

        let billtongs = 0;
        _.forEach(Game.creeps, function (creep) {
            switch (creep.memory.role) {
                case "billtong":
                    if (creep.memory.homeRoom == room.name) {
                        billtongs++;
                    }
                    break;
            }
        });

        if (billtongs == 0) {

            let newName = 'Billtong-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.push([MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE,
                MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE]
                , newName, { memory: { role: 'billtong', homeRoom: room.name, targetRoom: targetRoomName } });
            console.log('Adding Billtong to Spawn List: ' + newName);

        }

    }
}

/* ------------------------------------------------------------------------- *
 * help() — the console command index.
 *
 * Hand-maintained: [name, "args", "one line"]. Add a row here when you add a
 * command above. help() marks a row "!" when the name is not actually on
 * global, which is the cheap check that this table has not rotted.
 * ------------------------------------------------------------------------- */

type CommandRow = [string, string, string];

/** Commands defined in this file. */
const COMMAND_INDEX: CommandRow[] = [
  // --- rooms / expansion ---
  ["dropRoom", "room, force?", "unclaim a bad expand: kill creeps, destroy structures. Guarded above 20k stored / RCL5 unless force"],
  ["SC", "room, x, y", "set Memory.target_colonise room + spawn tile (x/y must be 1..48)"],
  // --- base planning ---
  ["replanBase", "room", "force a dynamic base replan"],
  ["basePlan", "room", "print the cached hub, score, version and perimeter size"],
  ["showPlan", "true|false|room", "draw hub + min-cut walls (Memory.showPlan)"],
  ["showPerimeter", "room", "draw the perimeter tiles"],
  ["animPlan", "room, speed?, loop?", "replay the offline planner frames from the memory segments"],
  ["animStop", "", "stop the planner replay"],
  // --- feature flags / logging ---
  ["setVerbose", "on?", "console spam on/off (default silent)"],
  ["features", "", "dump Memory.features"],
  ["disablePower", "", "no PC managers / processPower (default, avoids enemy PC exposure)"],
  ["enablePower", "", "allow power systems (exposes rooms to enemy power creeps)"],
  ["enablePickupLock", "", "haulers lock a pile for 25t and reserve what they take"],
  ["disablePickupLock", "", "legacy per-tick amount-sorted pickup rescan"],
  ["resetPickupStats", "", "zero the pickup counters before an A/B window"],
  ["pickupStats", "", "pickup switches per 100 calls, throughput, mode"],
  // --- speedrun campaign ---
  ["speedrunStatus", "", "ticks-to-RCL table"],
  ["resetSpeedrun", "room?", "zero the speedrun timers after a reset / respawn"],
  ["enableSpeedrun", "", "ticks-to-RCL tracking + early remotes off"],
  ["disableSpeedrun", "", "speedrun mode off"],
  ["disableRemotes", "", "close every remote (remotes-off A/B)"],
  ["enableRemotes", "", "restore the RCL3+ remotes"],
  ["enableSkipHighRcl", "", "skip the high-RCL work during a speedrun"],
  ["disableSkipHighRcl", "", "stop skipping the high-RCL work"],
  // --- CPU / bench ---
  ["cpuStatus", "", "limit, bucket and remotes policy (always prints)"],
  ["cpuPolicy", "", "the raw CPU policy object"],
  ["setProfile", '"optimized"|"baseline"', "switch the A/B optimisation profile"],
  ["toggleOpt", "name", "flip one optimisation flag"],
  ["setOpt", "name, value", "set one optimisation flag"],
  ["opts", "", "dump the current optimisation flags"],
  ["benchAuto", "on?, period?", "flip optimized/baseline every N ticks and accumulate stats"],
  ["reportCpu", "", "print the A/B proof averages"],
  ["clearBench", "", "throw away the bench samples"],
  ["showBoosts", "", "print the boost -> effect table"],
  // --- offence: single creeps ---
  ["SS", "home, target, backupTR?", "boosted Solomon singleton (needs T3 in storage)"],
  ["SD", "home, target, boost?", "ram + signifer duo"],
  ["SDB", "home, target, boost?, defendController?", "tough ram + signifer duo"],
  ["DUO", "home, target, boostLabIds?", "RCL6/7 strike pair: ranged leader + chasing healer"],
  ["SCCK", "home, target", "ContinuousControllerKiller, unboosted (needs RCL8 home)"],
  ["SCCK2", "home, target", "ContinuousControllerKiller, boosted (needs XGHO2 + XLHO2)"],
  ["SCK", "home, target", "CreepKiller — small melee that hunts creeps"],
  ["SGD", "home, target, body", "Guard with an explicit body (coma), used by rooms.observe"],
  ["SG", "home, target", "goblin looter, move-heavy (offroad)"],
  ["SGB", "home, target", "goblin looter, carry-heavy (roads)"],
  ["SMDP", "home, target", "self-renewing boosted Guard defence pair"],
  ["spawn_mosquito", "home, target", "mosquito harasser"],
  ["spawnConvoy", "home, target", "Convoy escort"],
  ["spawnSafeModer", "home, target", "SafeModer — carries ghodium to a safe-mode-able controller"],
  // --- offence: squads ---
  ["SQR", "home, target, boost?", "ranged quad (RCL6/7/8 bodies)"],
  ["SQM", "home, target, boost?", "melee quad"],
  ["SQD", "home, target, boost?", "dismantle quad"],
  ["QSPLIT", "room", "tell the quad travelling through room to split into duos"],
  ["spawn_hunting_party", "home, target, amount", "boosted CCKparty line, max 5"],
  ["lock_room", "home, target", "RCL8 boosted lock pack: escort + claimer + RoomLocker"],
  // --- remotes / economy ---
  ["SRD", "home, target", "one-shot RemoteDismantler"],
  ["SRDP", "home, target", "persistent RemoteDismantler"],
  ["SPK", "home, target", "power bank pair: PowerMelee + PowerHeal"],
  ["SDM", "home, target", "billtong deposit miner (needs bucket 9500)"],
];

/** Console commands that live in other modules — names only. */
const EXTERNAL_COMMAND_INDEX: CommandRow[] = [
  ["mapViz", "on?", "see utils/MapViz"],
  ["autoExpand", "", "see Managers/AutoExpand"],
  ["autoExpandStatus", "", "see Managers/AutoExpand"],
  ["stopExpand", "", "see Managers/AutoExpand"],
  ["rstats", "reset?", "see utils/RemoteStats"],
  ["adoptPlan", "room", "see utils/PlanV2"],
  ["dropPlan", "room", "see utils/PlanV2"],
  ["migratePlan", "room", "see utils/PlanV2"],
  ["migrateAbort", "room", "see utils/PlanV2"],
  ["migratePause", "room", "see utils/PlanV2"],
  ["migrateResume", "room", "see utils/PlanV2"],
  ["migrateStatus", "", "see utils/PlanV2"],
  ["interiorInfo", "room", "see utils/Interior"],
  ["buildRemoteRoads", "room", "see main.ts"],
];

function helpRows(rows: CommandRow[], filter: string): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const name = row[0];
    if (filter && (name + " " + row[2]).toLowerCase().indexOf(filter) === -1) continue;
    const mark = typeof g[name] === "function" ? "  " : "! ";
    out.push(`${mark}${name}(${row[1]}) — ${row[2]}`);
  }
  return out;
}

/** Console: help() — list every command. help("quad") — filter by name/description. */
g.help = function (filter?: string): string {
  const f = typeof filter === "string" ? filter.toLowerCase() : "";
  const here = helpRows(COMMAND_INDEX, f);
  const elsewhere = helpRows(EXTERNAL_COMMAND_INDEX, f);
  const lines: string[] = [];
  lines.push(`=== console commands${f ? ` matching "${filter}"` : ""} — "!" means not defined this tick ===`);
  lines.push(...here);
  if (elsewhere.length) {
    lines.push("--- defined in other modules ---");
    lines.push(...elsewhere);
  }
  console.log(lines.join("\n"));
  return `${here.length + elsewhere.length} commands — help("quad") to filter`;
};
