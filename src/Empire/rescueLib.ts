/**
 * Spawn-rescue helpers, moved out of rooms.spawning.ts so the empire pass and
 * the (flag-gated) legacy per-room path share one implementation.
 *
 * "Rescue" = an owned room with no spawn (lost it, or freshly claimed) needs
 * builders from a room that has one. Everything here is a decision or a
 * cross-room retask; nothing here touches a room's own spawn queue — that stays
 * room-side (stripNonRescueQueue / purgeDeadColonyBuilders / the CB enqueue).
 *
 * Behaviour is the pre-move behaviour, with one fix: finishableSpawnSiteRooms
 * used to sort candidates by distance from a HARD-CODED room ("E37N58"); it now
 * sorts by distance to the nearest room of ours that has a spawn.
 *
 * See docs/EMPIRE-LAYER.md.
 */
import { logAlways } from "utils/Logger";
import { getCensus, invalidateCensus } from "./census";
import {
    coloniseVetoesNoVisionSpawnless, spawnRescuePinHolds, spawnRescueValue,
    retaskKeepsHatcheryRole,
} from "Rooms/spawnSafety";
export { spawnRescueValue };

/**
 * Every function here that rewrites creep roles mid-tick reports how many it
 * changed THROUGH this, so the shared census is recounted before anyone reads
 * stale roles — on the empire path AND the legacy per-room path (review O7/O9).
 */
function doneCensus(changed: number): number {
    if (changed) invalidateCensus();
    return changed;
}

export function roomHasPlanSpawn(name: string): boolean {
    const mem: any = Memory.rooms && Memory.rooms[name];
    const t = mem && mem.planV2 && mem.planV2.t && mem.planV2.t.spawn;
    return !!(t && t.length);
}

export function roomLooksSpawnlessOwned(name: string): boolean {
    const r = Game.rooms[name];
    if (r) {
        if (!r.controller || !r.controller.my) return false;
        if (r.find(FIND_MY_SPAWNS).length) return false;
        const foreign = r.find(FIND_STRUCTURES, {filter: (s: Structure) =>
            s.structureType === STRUCTURE_SPAWN && !(s as StructureSpawn).my}).length > 0;
        // Remember the verdict. Vision here is a creep standing in the room, and
        // the moment it dies we fall through to the memory branch below — which
        // had no foreign-spawn test at all, so a room that was just rejected on
        // sight became eligible again as soon as we stopped looking at it. Live
        // E39N58 (RCL1, our controller, a leftover foreign spawn) was exactly
        // that: it kept a 1,600-energy ContainerBuilder at the HEAD of E37N59's
        // spawn queue for a room that can never finish a spawn while that
        // structure stands.
        const mem0: any = Memory.rooms && Memory.rooms[name];
        if (mem0) {
            if (foreign) mem0.foreignSpawn = Game.time;
            else if (mem0.foreignSpawn) delete mem0.foreignSpawn;
        }
        if (foreign) return false;
        // FORCE-migrate can delete the only spawn before the plan site exists
        // (same tick). Still send CBs — they (and placeFromPlanV2) site it.
        if (roomHasPlanSpawn(name)) return true;
        return r.find(FIND_MY_CONSTRUCTION_SITES, {filter: (s: ConstructionSite) =>
            s.structureType === STRUCTURE_SPAWN}).length > 0;
    }
    // No vision: Memory from the last visit. W3N3 sat 0-creep / 0-vision
    // with a spawn site. pinSpawnRescue writes tc.room=need — that is not
    // a disqualification when this room IS the pinned rescue. Still veto
    // leftover-foreign parks (E35N59 Enrique) that are not the pin.
    if (coloniseVetoesNoVisionSpawnless(
        name,
        Memory.target_colonise && Memory.target_colonise.room,
        (Memory as any).spawnRescue,
    )) return false;
    const mem: any = Memory.rooms && Memory.rooms[name];
    if (!mem) return false;
    if (mem.Structures && mem.Structures.spawns && mem.Structures.spawns.length) return false;
    // Last thing we saw was somebody else's spawn standing in it. Only vision
    // clears this (above), so it cannot become a permanent trap.
    if (mem.foreignSpawn) return false;
    const spawnPlan = (mem.basePlan && mem.basePlan.spawn && mem.basePlan.spawn[0])
        || (mem.basePlan && mem.basePlan.structures && mem.basePlan.structures.spawn && mem.basePlan.structures.spawn[0])
        || (mem.planV2 && mem.planV2.t && mem.planV2.t.spawn && mem.planV2.t.spawn[0]);
    const mine = !!(mem.speedrun || mem.planV2 || mem.planPackMiss || mem.basePlan);
    return !!(mine && spawnPlan);
}

export function spawnSiteProgress(name: string): number {
    const r = Game.rooms[name];
    if (!r) return 15000;
    const site = r.find(FIND_MY_CONSTRUCTION_SITES, {filter: (s: ConstructionSite) =>
        s.structureType === STRUCTURE_SPAWN})[0];
    return site ? site.progress : 15000;
}

export function spawnEmergencyOn(): boolean {
    return !!(Memory as any)._spawnEmergency || !!(Memory as any).spawnRescue;
}

/**
 * How many creeps one spawn rescue may hold as ContainerBuilders at once.
 *
 * Spawning new ones is capped at 8 (see colonyBuilderCap) because hatching them
 * empties the last live spawn. RETASKING existing creeps was deliberately left
 * uncapped at 99 on the reasoning that those creeps already exist and are
 * already paid for — which is true of their ENERGY and false of everything
 * else.
 *
 * Live shard3 reached THIRTY-FIVE ContainerBuilders against one 15,000 site.
 * At ~0.33 CPU each that is 11.9 of a 20 CPU budget — 60% of the entire tick —
 * and the bucket fell from 10,000 to 4,590 while the site progressed no faster
 * than a third of them would have managed. It also strips the rooms those
 * creeps came from: every carrier converted is a carrier its own room stops
 * having.
 *
 * Build power saturates. Ten builders at 4 WORK is 200 progress/tick, well past
 * what any of these rooms can feed it; beyond that each extra creep buys
 * nothing and costs CPU, and CPU is the resource the whole empire shares.
 */
export const RESCUE_BUILDER_CAP = 10;

export function colonyBuilderCap(need: string): number {
    // Spawn-new cap. Retask of existing WORK creeps is uncapped separately.
    // Cap-99 hatching is what emptied the last live spawn (E37N58 59/1150).
    if (spawnEmergencyOn()) return 8;
    const r = Game.rooms[need];
    // Last 5k used to hit cap-1 first and skip this. E37N57 10k/15k DG 1207.
    if (r && r.controller && r.controller.my && r.controller.level === 1
        && r.controller.ticksToDowngrade < 3000) return 3;
    if (spawnSiteProgress(need) >= 10000) return 1;
    return 2;
}

export function colonyBuildersOn(need: string): number {
    const t = getCensus().target[need];
    return t ? (t["buildcontainer"] || 0) : 0;
}

export function spawnSiteUnfinishable(name: string): boolean {
    const r = Game.rooms[name];
    if (!r || !r.controller || !r.controller.my) return false;
    const site = r.find(FIND_MY_CONSTRUCTION_SITES, {filter: (s: ConstructionSite) =>
        s.structureType === STRUCTURE_SPAWN})[0];
    if (!site) return false;
    const left = (site.progressTotal || 15000) - (site.progress || 0);
    // 8W on-site ~40 e/t; commute ~20. Skip if DG cannot pay the site.
    return r.controller.ticksToDowngrade < left / 20;
}

/** Rooms of ours that have a spawn — the places a rescue can come FROM. */
export function spawnCapableRooms(): string[] {
    const out: string[] = [];
    for (const rn in Game.rooms) {
        const r = Game.rooms[rn];
        if (r.controller && r.controller.my && r.find(FIND_MY_SPAWNS).length) out.push(rn);
    }
    return out;
}

/** Linear distance from `name` to the nearest spawn-capable room of ours (99 when there is none). */
export function distToNearestSpawnRoom(name: string, spawnRooms?: string[]): number {
    const rooms = spawnRooms || spawnCapableRooms();
    let best = 99;
    for (const rn of rooms) {
        const d = Game.map.getRoomLinearDistance(rn, name);
        if (d < best) best = d;
    }
    return best;
}

export function finishableSpawnSiteRooms(from?: string): string[] {
    const hits: string[] = [];
    const seen: { [name: string]: boolean } = {};
    const consider = (name: string) => {
        if (seen[name] || !roomLooksSpawnlessOwned(name)) return;
        if (spawnSiteUnfinishable(name)) return;
        seen[name] = true;
        hits.push(name);
    };
    for (const name in Game.rooms) consider(name);
    if (Memory.rooms) for (const name in Memory.rooms) consider(name);
    if (from) {
        hits.sort((a, b) =>
            Game.map.getRoomLinearDistance(from, a) - Game.map.getRoomLinearDistance(from, b));
    } else {
        const spawnRooms = spawnCapableRooms();
        hits.sort((a, b) => distToNearestSpawnRoom(a, spawnRooms) - distToNearestSpawnRoom(b, spawnRooms));
    }
    return hits;
}


/** Progress rung, so trivial differences do not decide the order. See below. */
export const RESCUE_PROGRESS_RUNG = 5000;

export function pickSpawnRescue(precomputedHits?: string[]): string | null {
    const pinned = (Memory as any).spawnRescue;
    if (typeof pinned === "string"
        && spawnRescuePinHolds(roomLooksSpawnlessOwned(pinned), spawnSiteUnfinishable(pinned))) {
        return pinned;
    }
    let best: string | null = null;
    let bestRung = -1;
    let bestValue = -1;
    let bestP = -1;
    const hits = precomputedHits || finishableSpawnSiteRooms();
    for (let i = 0; i < hits.length; i++) {
        const p = spawnSiteProgress(hits[i]);
        const score = p >= 15000 ? 0 : p;
        /*
         * Progress still decides when it is MEANINGFUL — a site that is nearly
         * done restores a spawn soonest, and that beats everything.
         *
         * But comparing raw progress alone let 50 units — a third of one
         * percent, i.e. noise — outrank a room worth thousands of energy. Live
         * shard3 after a forced plan migration destroyed three spawns at once:
         * E36N57 sat at 50/15000 and E37N59 at 0/15000, so the rescue would
         * have rebuilt the RCL4 first and left the RCL6 (37 extensions, 3 labs,
         * links, extractor, 1850 capacity) for last — the room whose spawn
         * would have rebuilt the others fastest, queued behind them.
         *
         * So compare by RUNG first and value second: a genuinely closer site
         * still wins, a rounding difference does not.
         */
        const rung = Math.floor(score / RESCUE_PROGRESS_RUNG);
        const value = spawnRescueValue(hits[i]);
        if (rung > bestRung
            || (rung === bestRung && value > bestValue)
            || (rung === bestRung && value === bestValue && score > bestP)) {
            bestRung = rung;
            bestValue = value;
            bestP = score;
            best = hits[i];
        }
    }
    if (best) pinSpawnRescue(best);
    return best;
}

export function rescueSpawnXY(name: string): { x: number; y: number } | null {
    const r = Game.rooms[name];
    if (r) {
        const site = r.find(FIND_MY_CONSTRUCTION_SITES, {filter: (s: ConstructionSite) =>
            s.structureType === STRUCTURE_SPAWN})[0];
        if (site) return { x: site.pos.x, y: site.pos.y };
    }
    const mem: any = Memory.rooms && Memory.rooms[name];
    const packed = mem && mem.planV2 && mem.planV2.t && mem.planV2.t.spawn && mem.planV2.t.spawn[0];
    if (typeof packed === "number") return { x: packed % 50, y: Math.floor(packed / 50) };
    return null;
}

export function pinSpawnRescue(name: string): void {
    (Memory as any).spawnRescue = name;
    (Memory as any)._spawnEmergency = true;
    const xy = rescueSpawnXY(name);
    if (!xy) return;
    const tc: any = (Memory as any).target_colonise || {};
    tc.room = name;
    tc.spawn_pos = { x: xy.x, y: xy.y, roomName: name };
    (Memory as any).target_colonise = tc;
}

export function empireMySpawnCount(): number {
    let n = 0;
    for (const rn in Game.rooms) {
        const rr = Game.rooms[rn];
        if (rr.controller && rr.controller.my) n += rr.find(FIND_MY_SPAWNS).length;
    }
    return n;
}

export function revertSpawnEmergency(precomputedHits?: string[]): number {
    if ((precomputedHits || finishableSpawnSiteRooms()).length) return 0;
    if (!(Memory as any).spawnRescue && !(Memory as any)._spawnEmergency) return 0;
    let changed = 0;
    delete (Memory as any).spawnRescue;
    delete (Memory as any)._spawnEmergency;
    const tc: any = (Memory as any).target_colonise;
    if (tc && tc.room && !roomLooksSpawnlessOwned(tc.room)) (Memory as any).target_colonise = {};
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.memory || c.memory.role !== "buildcontainer") continue;
        const tgt = c.memory.targetRoom && Game.rooms[c.memory.targetRoom];
        if (tgt && tgt.find(FIND_MY_SPAWNS).length) {
            c.memory.role = "builder";
            delete (c.memory as any).fill;
            changed++;
        }
    }
    for (const rn in Game.rooms) {
        const r = Game.rooms[rn];
        if (!r.controller || !r.controller.my) continue;
        if ((r.memory as any).planMigratePaused) delete (r.memory as any).planMigratePaused;
        const arm = (r.memory as any).planMigration;
        // Clearing `force` here exists to stand down a force that the emergency
        // itself provoked. It must NOT quietly cancel an operator's deliberate
        // align arm: PlanV2 holds forced migration for the duration of a spawn
        // rescue, so an owner who arms "align every room" during one would have
        // their arm wiped at the exact moment it was finally allowed to run —
        // and the rooms would sit off-plan forever while reporting armed.
        if (arm && arm.by !== "operator") arm.force = false;
    }
    logAlways("spawn rescue complete — all rooms have a spawn, emergency off");
    return doneCensus(changed);
}

export function finishableSpawnSiteRoom(from?: string, precomputedHits?: string[]): string | null {
    // One spawnless room at a time. Never split the last builders.
    const rescue = pickSpawnRescue(precomputedHits);
    if (rescue) return rescue;
    const hits = precomputedHits || finishableSpawnSiteRooms(from);
    if (!hits.length) return null;
    for (let i = 0; i < hits.length; i++) {
        if (colonyBuildersOn(hits[i]) === 0) return hits[i];
    }
    for (let i = 0; i < hits.length; i++) {
        if (colonyBuildersOn(hits[i]) < colonyBuilderCap(hits[i])) return hits[i];
    }
    return null;
}

/**
 * Re-aim LIVE ContainerBuilders whose target room no longer needs one.
 *
 * retaskBuildersToSpawnless is supposed to cover this, but it is a big function
 * with several early exits and it demonstrably missed: live shard3 finished
 * E39N58's spawn and left FOUR builders still carrying targetRoom=E39N58 —
 * walking to a room that already had a spawn and doing nothing there — while
 * E36N57's 15k site limped along on the remaining five. Nearly half the rescue
 * crew, idle, for hours.
 *
 * This is the same job stated as a single unconditional rule: a builder whose
 * target is no longer spawnless belongs on the room that is. No caps, no
 * distance test, no funding test — the creep already exists and is already
 * paid for, so the only question is which site it should be standing on.
 *
 * `fill` is cleared so the creep re-decides where to load rather than walking
 * the old room's errand; route/exit caches self-heal on a target change.
 */
export function reaimStrandedBuilders(need: string): number {
    let changed = 0;
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.memory || c.memory.role !== "buildcontainer") continue;
        const t = c.memory.targetRoom;
        if (!t || t === need) continue;
        if (roomLooksSpawnlessOwned(t)) continue; // still wanted where it is
        // A room building its OWN containers is not stranded. Those carry
        // targetRoom === homeRoom, and stealing them starves the room that
        // paid for them: live E39N58 kept spawning container builders for its
        // three 0/5000 container sites and kept having them taken, so it burned
        // the energy over and over and the sites never moved. Only re-aim a
        // creep that was sent AWAY to help somewhere else.
        if (t === c.memory.homeRoom) continue;
        c.memory.targetRoom = need;
        delete (c.memory as any).fill;
        changed++;
        logAlways("[colony] re-aim " + name + ": " + t + " has a spawn now -> " + need);
    }
    return doneCensus(changed);
}

export function retaskBuildersToSpawnless(need: string, precomputedHits?: string[]): number {
    let changed = 0;
    let empireSpawns = 0;
    for (const rn in Game.rooms) {
        const rr = Game.rooms[rn];
        if (rr.controller && rr.controller.my) empireSpawns += rr.find(FIND_MY_SPAWNS).length;
    }
    // While any owned room is spawnless, dump the whole work roster on
    // the one rescue target. Cap-2 after the first spawn came back is
    // what left E39N58/E36N57/E37N59 sitting at 0–730/15k.
    const stillRescue = !!pickSpawnRescue(precomputedHits);
    const cap = stillRescue || empireSpawns === 0 ? RESCUE_BUILDER_CAP : 2;
    let onIt = colonyBuildersOn(need);
    if (onIt >= cap) return doneCensus(changed);
    for (const name in Game.creeps) {
        if (onIt >= cap) return doneCensus(changed);
        const c = Game.creeps[name];
        if (!c.memory) continue;
        if (c.memory.role === "buildcontainer" && c.memory.targetRoom === need) continue;
        const role = c.memory.role;
        // Keep source income + the last hatchery crew + combat.
        if (role === "EnergyMiner" || role === "mineralMiner") continue;
        if (c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK)
            || c.getActiveBodyparts(HEAL) || c.getActiveBodyparts(CLAIM)) continue;
        const homeName = c.memory.homeRoom || c.room.name;
        const home = Game.rooms[homeName] || c.room;
        const homeHasSpawn = home.find(FIND_MY_SPAWNS).length > 0;
        if (retaskKeepsHatcheryRole(role, homeHasSpawn)) continue;
        const canBuild = c.getActiveBodyparts(WORK) > 0;
        const canHaul = c.getActiveBodyparts(CARRY) > 0;
        if (!canBuild && !canHaul) continue;
        if (empireSpawns > 0 && !stillRescue) {
            if (homeName === need) continue;
            if (!home || !homeHasSpawn) continue;
        }
        c.memory.role = "buildcontainer";
        c.memory.targetRoom = need;
        const e = c.store[RESOURCE_ENERGY] || 0;
        (c.memory as any).fill = e === 0 && c.store.getFreeCapacity() > 0;
        (c.memory as any).building = e > 0;
        onIt++;
        changed++;
        console.log("[colony] retask " + c.name + " -> " + need);
    }
    return doneCensus(changed);
}

/**
 * How full a bankless room must be before it may spend on a rescue builder.
 *
 * This was a flat 800, and a flat floor is unsatisfiable by any room whose
 * CAPACITY is below it — `energyAvailable` can never exceed
 * `energyCapacityAvailable`, so the test is not "wait until you are richer", it
 * is "never". Live shard3 hit that from two directions at once: a forced plan
 * migration destroyed every storage (bank 0 everywhere) and then alignment
 * retired the off-plan extensions, dropping E37N58 from 1300 capacity to 500
 * and E39N58 to 350. Both rooms then sat with a full spawn, an empty queue and
 * an idle spawner while three rooms waited on a rebuild they were the only
 * possible source of — the owner's "some rooms not spawning, they just pass
 * energy around".
 *
 * Expressed against the room's own capacity it means what it was meant to mean:
 * "be near full before you spend the lot", which any room can eventually reach.
 * The absolute cap keeps the original bar for rooms big enough to clear it.
 */
export function rescueMotherFloor(room: Room): number {
    return Math.min(800, Math.floor(room.energyCapacityAvailable * 0.8));
}

/**
 * Which room of ours should hatch ContainerBuilders for `need`.
 *
 * Moved verbatim from maybeSpawnColonyBuilder, where every mother candidate
 * re-ran it per tick (O(rooms) per room, per tick). The empire pass runs it
 * once. `rescue` = the target has no spawn at all (vs. a fresh colony whose
 * mother must be rich and the bucket healthy — that gate stays with the
 * caller). Nearest wins; ties go to the bigger bank.
 */
export function pickRescueMother(need: string, rescue: boolean): string | null {
    let best: string | null = null;
    let bestDist = 99;
    let bestE = -1;
    for (const name in Game.rooms) {
        const r: any = Game.rooms[name];
        if (!r.controller || !r.controller.my || r.controller.level < 3) continue;
        if (r.memory && r.memory.danger) continue;
        if (!r.find(FIND_MY_SPAWNS).length) continue;
        const st: any = Game.getObjectById(r.memory && r.memory.Structures && r.memory.Structures.storage)
            || (r.storage && r.storage.my ? r.storage : null);
        const e = st && st.store ? (st.store[RESOURCE_ENERGY] || 0) : 0;
        if (rescue) {
            if (e <= 10000 && r.energyAvailable < rescueMotherFloor(r)) continue;
        } else if (e <= 10000) {
            continue;
        }
        const d = Game.map.getRoomLinearDistance(name, need);
        if (d > 7) continue;
        if (d < bestDist || (d === bestDist && e > bestE)) {
            best = name;
            bestDist = d;
            bestE = e;
        }
    }
    return best;
}
