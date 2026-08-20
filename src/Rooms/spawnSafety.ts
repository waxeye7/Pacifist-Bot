/**
 * Spawn-side safety predicates extracted so they can be unit-tested without
 * loading the 6k-line spawning loop.
 *
 * These are the gates that have already killed live rooms: they close remotes,
 * drop the queue, or suicide the builder crew. Wrong-closed is worse than
 * wrong-open — see docs/STARVATION-TRAPS.md.
 */

import { invalidateCensus } from "Empire/census";

/**
 * Storage + terminal energy the room can actually spend. Either store
 * alone used to miss ALIGN leftover (storage 0 + terminal 10k) and
 * split banks (3k+3k).
 */
export function bankEnergy(room: any): number {
    const storageE = room.storage && room.storage.my ? room.storage.store[RESOURCE_ENERGY] || 0 : 0;
    const termE = room.terminal && room.terminal.my ? room.terminal.store[RESOURCE_ENERGY] || 0 : 0;
    return storageE + termE;
}

/** Spawn-clamp budget: hatchery plus the bank, including the terminal. */
export function spawnPayable(room: any): number {
    return (room.energyAvailable || 0) + bankEnergy(room);
}

/**
 * Home sources/spawn come first. Remotes wait until the bank and miners exist.
 *
 * "Miners exist" means ONE PER LOCAL SOURCE, not a flat two. A room with a
 * single source can never reach two home miners, so a flat `< 2` marked it
 * starved forever — and the caller force-closes every remote when this is true.
 */
export function homeEconomyStarved(room: any): boolean {
    if (bankEnergy(room) >= 5000) return false;
    let homeMiners = 0;
    const creeps = Game.creeps || {};
    for (const cn in creeps) {
        const c = creeps[cn];
        if (!c.memory || c.memory.role !== "EnergyMiner") continue;
        if (c.memory.homeRoom === room.name && (!c.memory.targetRoom || c.memory.targetRoom === room.name)) {
            homeMiners++;
        }
    }
    const localSources = room.find ? room.find(FIND_SOURCES).length : 0;
    if (homeMiners < Math.min(2, localSources)) return true;

    // Last hatchery funding a spawn rescue: remotes unshift 550–1500e
    // miners/haulers in front of the CB. Bank is already < 5k (above).
    // ANY spawnRescue used to fire here — spare hatcheries then
    // persist-closed remotes that RCL3 slam-5 could never reopen.
    const mem: any = typeof Memory !== "undefined" ? Memory : null;
    if (mem && (mem.spawnRescue || mem._spawnEmergency) && isLastHatchery(room)) return true;

    // energyAvailable < 300 is a BOOTSTRAP test — only meaningful when the
    // room's cap is itself ~300. After a hub wipe the storage is gone but
    // capacity is still 400-2300; a mid-spawn dip then force-closes remotes
    // (the only income left). Same trap as docs/STARVATION-TRAPS.md.
    if (room.storage && room.storage.my) return false;
    if ((room.energyCapacityAvailable || 0) > 300) return false;
    return room.energyAvailable < 300;
}

/**
 * Only the last standing spawn should drop remotes for a rescue.
 * spawnRescue/_spawnEmergency is empire-wide; a spare hatchery is not starved.
 */
export function isLastHatchery(room: any): boolean {
    if (!room || !room.find) return false;
    if (!(room.find(FIND_MY_SPAWNS) || []).length) return false;
    const rooms = (typeof Game !== "undefined" && Game.rooms) || {};
    let n = 0;
    for (const rn in rooms) {
        const r = rooms[rn];
        if (!r || !r.controller || !r.controller.my || !r.find) continue;
        if ((r.find(FIND_MY_SPAWNS) || []).length) {
            n++;
            if (n > 1) return false;
        }
    }
    return true;
}

/**
 * Broke = no bank to fall back on AND the extension network is on fumes.
 * A room mid-spawn-cycle dips on energyAvailable every purchase; a room with
 * a full bank is never broke however empty its extensions read this tick.
 */
export function roomIsBroke(room: any): boolean {
    if (room.memory && room.memory.danger) return false;
    if (bankEnergy(room) >= 5000) return false;
    return room.energyAvailable < room.energyCapacityAvailable * 0.5;
}

/**
 * Where a builder is assigned — not the tile it is walking through.
 *
 * Grouping the cull by c.room.name converted (or suicided) borrowed builders
 * the moment they stepped into a hallway or a neighbor with no sites / a full
 * local crew. Live: we retasked a neighbor builder onto E36N57's storage site
 * and the cull ate it in transit.
 */
export function builderStationRoom(c: any): string {
    const mem = c.memory || {};
    if (mem.targetRoom) return mem.targetRoom;
    if (mem.homeRoom) return mem.homeRoom;
    return (c.room && c.room.name) || "";
}

/**
 * Interleaving spends the energy a stalled HOL is waiting for.
 *
 * A leftover 1W/2W used to make the 0-miner lifeline false, so RCL<=3
 * hatched 300e builders every 10 ticks around a clamp-exempt 550e [5W,M]
 * (or parked 500e [4W,C,M] forced to budget=hardCap) and energy never
 * reached 550. Same closed loop as the documented 0-miner interleave trap.
 */
export function headBlocksInterleave(
    rcl: number,
    headName: string,
    headCost: number,
    energyCapacity: number,
    homeMinerBestWork: number,
    holTargetRoom?: string,
    homeName?: string,
): boolean {
    const isMiner = !!(headName && String(headName).indexOf("EnergyMiner") === 0);
    const isHome = !holTargetRoom || !homeName || holTargetRoom === homeName;
    if (isMiner && isHome && homeMinerBestWork < 5) {
        return true;
    }
    // Rescue CB is not a lifeline except by accident (RCL<=3 && cost>=500).
    // Last-hatchery CBs are RCL4+ 800e or leftover-5 getBody ~400e; cheap
    // builders/fillers then interleave around it and spend the parked energy.
    if (headName && String(headName).indexOf("ContainerBuilder") === 0) {
        return true;
    }
    const isCarrier = !!(headName && String(headName).indexOf("Carrier") === 0);
    const isRemote = !!(holTargetRoom && homeName && holTargetRoom !== homeName);
    // Leftover 1W/2W cannot refill a 500–1500e haul or remote miner.
    // destCheapRewritesHead refuses remotes; leftoverUpgrade is often latched
    // by fiveWQueued; shrink is not else-if'd with interleave. Stall 41 then
    // shrinks the remote head and hatches a 300e builder the same tick.
    if ((isCarrier || isMiner) && isRemote && (homeMinerBestWork < 5 || rcl <= 3)) {
        return true;
    }
    if (rcl <= 3 && headCost >= Math.min(energyCapacity || 0, 500)) {
        return true;
    }
    return false;
}

/** Remotes first so a later home leftoverUpgrade unshift stays HOL. */
export function resourceNamesHomeLast(names: string[], homeName: string): string[] {
    const remotes: string[] = [];
    const home: string[] = [];
    for (let i = 0; i < names.length; i++) {
        if (names[i] === homeName) home.push(names[i]);
        else remotes.push(names[i]);
    }
    return remotes.concat(home);
}

/**
 * leftover-5 [5W,M] (550e / 6) and leftoverUpgrade / RCL4-5 [2M,6W,M]
 * (750e / 9). Clamp and HOL shrink used to match only the 550 body, so
 * same-pass 85% of 800 dropped a WORK and stall>40 walked 6W→2W.
 */
export function isHomeSlamMinerBody(body: any): boolean {
    if (!body || !body.length) return false;
    let w = 0;
    let m = 0;
    for (let i = 0; i < body.length; i++) {
        if (body[i] === WORK) w++;
        else if (body[i] === MOVE) m++;
        else return false;
    }
    if (body.length === 6 && w === 5 && m === 1) return true;
    if (body.length === 9 && w === 6 && m === 3) return true;
    return false;
}

/**
 * Remote EnergyMiner unshift lands HOL on a leftoverUpgrade [5W,M].
 * destCheapRewritesHead refuses remotes; headBlocksInterleave then waits
 * for the remote body while the slam-5 sits second.
 */
export function promoteHomeSlamFiveHol(queue: any[], homeName: string): boolean {
    if (!queue || queue.length < 6) return false;
    const holName = queue[1];
    const holMem = queue[2] && queue[2].memory;
    if (!holName || String(holName).indexOf("EnergyMiner") !== 0) return false;
    if (!holMem || !holMem.targetRoom || holMem.targetRoom === homeName) return false;
    for (let i = 3; i + 2 < queue.length; i += 3) {
        const name = queue[i + 1];
        const mem = queue[i + 2] && queue[i + 2].memory;
        if (!name || String(name).indexOf("EnergyMiner") !== 0) continue;
        if (mem && mem.targetRoom && mem.targetRoom !== homeName) continue;
        if (!isHomeSlamMinerBody(queue[i])) continue;
        const triple = queue.splice(i, 3);
        queue.unshift(triple[0], triple[1], triple[2]);
        return true;
    }
    return false;
}

/**
 * Dest-cheap may rewrite a HOL EnergyMiner to [2W,M]/[W,M] only when the
 * head is a HOME miner. Remotes unshift after home, so a remote is often
 * HOL when home is 0 WORK. Rewriting that body walks the cheap miner to
 * the remote and home stays at 0 WORK (interleave stays blocked).
 */
export function destCheapRewritesHead(
    headName: string,
    holTargetRoom: string | undefined,
    homeName: string,
    homeMinerBestWork: number,
): boolean {
    if (!headName || String(headName).indexOf("EnergyMiner") !== 0) return false;
    if (holTargetRoom && holTargetRoom !== homeName) return false;
    return homeMinerBestWork === 0;
}

/**
 * dest-cheap leftover 1W/2W (2–4e/t) cannot refill a 500e HOL in 60 ticks.
 * lastSpawn was stamped when the [5W,M] was queued, then dest-cheap rewrote
 * the body — the leftover is "on the way" so the stale stamp is not healed
 * and a new [5W,M] is suppressed for CREEP_LIFE_TIME.
 */
export function destCheapLeftoverNeedsFiveW(
    energyCapacity: number,
    liveWorkOnSource: number,
): boolean {
    return energyCapacity >= 550 && liveWorkOnSource > 0 && liveWorkOnSource < 5;
}

/**
 * Queue at most ONE 5W upgrade per source. dest-cheap rewrites the 5W
 * body to 1W, it hatches, leftoverUpgrade stayed true, and the producer
 * unshifted another miner every cadence. Live E37N59: 23 EnergyMiners.
 */
export function leftoverUpgradeShouldQueue(
    energyCapacity: number,
    liveWorkOnSource: number,
    alreadyQueued: boolean,
    fiveWAlreadyQueued: boolean,
): boolean {
    if (alreadyQueued || fiveWAlreadyQueued) return false;
    return destCheapLeftoverNeedsFiveW(energyCapacity, liveWorkOnSource);
}

/**
 * Replacement miner. `lastSpawn || 0` plus `time - 0 > LIFE` is true every
 * tick after 1500, so a live miner whose stamp was cleared (heal / reset)
 * used to unshift another body every pass. Leftover 5W is the only case
 * that may stack on a live miner.
 */
export function minerReplacementShouldQueue(
    onTheWay: boolean,
    leftoverUpgrade: boolean,
    lastSpawn: number,
    time: number,
    life = 1500,
): boolean {
    if (leftoverUpgrade) return true;
    if (onTheWay) return false;
    return time - (lastSpawn || 0) > life;
}

/** CREEP_LIFE_TIME*3 backup. Same lastSpawn=0 + live miner flood. */
export function minerBackupShouldQueue(
    onTheWay: boolean,
    lastSpawn: number,
    time: number,
    life = 1500,
): boolean {
    if (onTheWay) return false;
    return time - (lastSpawn || 0) > life * 3;
}

/**
 * Head-of-line block queueRemoteHaul walks past before splicing.
 * Rescue CB used to be omitted, so a haul landed at 0 in front of it.
 */
export function remoteQueueIsPriority(role: string, remote: boolean): boolean {
    if (role === "filler" || role === "EnergyManager" || role === "buildcontainer") {
        return true;
    }
    // Home EnergyMiner too: leftoverUpgrade / slam-5 unshift then
    // promoteHomeSlamFiveHol, and spawn_carrier used to splice the haul at 0
    // on top of that miner (and, at RCL>=4, the fillers sitting under it).
    if (role === "EnergyMiner") return true;
    return remote && (role === "carry" || role === "reserve");
}

/** Where queueRemoteHaul splices. 0 used to bury a home miner HOL. */
export function remoteHaulInsertIndex(queue: any[], homeName: string): number {
    let at = 0;
    if (!queue) return 0;
    while (at + 2 < queue.length) {
        const mem = queue[at + 2] && queue[at + 2].memory;
        if (!mem) break;
        const remote = !!mem.targetRoom && mem.targetRoom !== homeName;
        if (!remoteQueueIsPriority(mem.role, remote)) break;
        at += 3;
    }
    return at;
}

/** Already-queued rescue CB must stay HOL — producers unshift miners to 0. */
export function rescueCbShouldLead(queuedIndex: number): boolean {
    return queuedIndex > 0;
}

/**
 * pinSpawnRescue writes target_colonise.room=need so CBs know the tile.
 * The no-vision look used that write as "not spawnless" and dropped the
 * pin. Still veto leftover-foreign parks (E35N59) that are not the pin.
 */
export function coloniseVetoesNoVisionSpawnless(
    name: string,
    coloniseRoom: string | undefined,
    spawnRescue: string | undefined,
): boolean {
    return !!(coloniseRoom && coloniseRoom === name && spawnRescue !== name);
}

/**
 * A finishable spawnless `need` is a rescue even with no vision.
 * Requiring Game.rooms[need] made a 0-creep / 0-vision colony (W3N3,
 * CBs still walking) fall through to the optional 10k colony gates.
 */
export function colonyNeedIsRescue(need: string | null | undefined, visible: any): boolean {
    if (!need) return false;
    if (!visible) return true;
    const spawns = visible.find ? visible.find(FIND_MY_SPAWNS) : [];
    return !spawns || spawns.length === 0;
}

/**
 * A doomed pin (DG cannot pay the remaining site) must not stick.
 * pickSpawnRescue used to honor any spawnless pin and never re-rank.
 */
export function spawnRescuePinHolds(looksSpawnless: boolean, unfinishable: boolean): boolean {
    return looksSpawnless && !unfinishable;
}

/**
 * Snapshot RCL + capacity while the room is visible. After the last creep
 * dies Game.rooms[name] is gone and spawnRescueValue would otherwise be 0.
 */
export function rememberOwnedRoomStats(room: any): void {
    if (!room || !room.memory || !room.controller || !room.controller.my) return;
    room.memory.lastRcl = room.controller.level;
    room.memory.lastEnergyCapacity = room.energyCapacityAvailable || 0;
}

/**
 * Idle-queue wipe. lastTimeSpawnUsed is a busy/success stamp; a single-spawn
 * HOL wait never refreshes it. Wiping a live queue drops the rescue CB
 * (re-queued only when energyAvailable >= full body cost) while miner
 * lastSpawn self-heal re-queues a 5W into the parked energy.
 */
export function idleQueueShouldWipe(
    now: number,
    lastTimeSpawnUsed: number,
    queueLength: number,
): boolean {
    if (queueLength > 0) return false;
    return now % 100 === 0 && now - (lastTimeSpawnUsed || 0) > 1200;
}

/**
 * Worth of a rebuilt spawn: RCL*1000 + energyCapacity. Live room first;
 * last-seen Memory when the hatchery that can rebuild the others is dark.
 */
export function spawnRescueValue(name: string): number {
    const rooms = Game.rooms || {};
    const r = rooms[name];
    if (r && r.controller && r.controller.my) {
        return (r.controller.level * 1000) + (r.energyCapacityAvailable || 0);
    }
    const mem = (Memory as any).rooms && (Memory as any).rooms[name];
    if (!mem) return 0;
    const lvl = mem.lastRcl || (mem.speedrun && (mem.speedrun.lastRcl || mem.speedrun.rcl)) || 0;
    const cap = mem.lastEnergyCapacity || 0;
    return (lvl * 1000) + cap;
}

/**
 * Last-hatchery crew the rescue strip keeps queued. Retask used to convert
 * every newly hatched upgrader/builder until RESCUE_BUILDER_CAP, so the
 * strip-keep never stuck (E39N58 DG 7404). EnergyManager is the RCL5+ bank:
 * without it, link/terminal income never reaches storage.
 */
export function retaskKeepsHatcheryRole(role: string, homeHasSpawn: boolean): boolean {
    if (!homeHasSpawn) return false;
    // FakeFiller is a home carrier mid-dropoff (carry.ts). Omitting it
    // converts the hatchery haul crew to buildcontainer while they fill.
    return role === "filler" || role === "carry" || role === "FakeFiller" ||
        role === "builder" || role === "upgrader" || role === "EnergyManager";
}

/**
 * Hours-long rescue strip: keep the last hatchery alive, plus CBs/miners
 * that actually finish the spawn. Producer re-queues EnergyManager every
 * tick; dropping it here means the bank never fills.
 */
export function stripKeepsRescueRole(role: string, danger: boolean): boolean {
    if (role === "buildcontainer" || role === "EnergyMiner" ||
        role === "EnergyManager" ||
        role === "filler" || role === "carry" || role === "builder" ||
        role === "upgrader") return true;
    if (!danger) return false;
    return role === "RampartDefender" || role === "RRD" || role === "Guard" ||
        role === "defender" || role === "RangedAttacker";
}

/**
 * Hard cap on live builders assigned to one room. Rescue retask + revert
 * converted ContainerBuilders into regular builders and piled 41 of them on
 * one site against a 20 CPU limit.
 */
export const LIVE_BUILDER_CAP = 4;

/**
 * The ONE formula for "how many builders may this station keep". The cull
 * demotes down to it, and every builder spawn rung must clamp its own want to
 * it — a rung that wants more than the cull will keep is a pump: spawn,
 * demote to carry, roster count drops, spawn again. Live E39N58 (RCL4 rung
 * wanted 3, one open site kept 1) minted a 900e builder every 47 ticks for
 * ~750 ticks and ended up with 16 surplus haulers on a 2-source room.
 */
export function liveBuilderKeep(siteCount: number): number {
    return siteCount > 0 ? Math.min(LIVE_BUILDER_CAP, Math.max(1, siteCount)) : 0;
}

let lastBuilderCullTick = 0;

/** Test hook — the live cull is once-per-tick. */
export function resetBuilderCullForTest(): void {
    lastBuilderCullTick = 0;
}

/**
 * An ex-builder the cull demoted to carry and may promote back: real build
 * power, not bound to a source or an emergency-feed run, not draining. Real
 * haulers are 0-WORK bodies, so >=2 WORK cannot steal one.
 */
function promotableExBuilder(c: any): boolean {
    const m = c.memory || {};
    if (m.role !== "carry" && m.role !== "FakeFiller") return false;
    if (m.sourceId || m.emergencyFeed || m.suicide) return false;
    return c.getActiveBodyparts(WORK) >= 2;
}

export function cullSurplusBuildersOnce(): void {
    if (lastBuilderCullTick === Game.time) return;
    lastBuilderCullTick = Game.time;
    let converted = 0;
    const byStation: { [rn: string]: any[] } = {};
    const creeps = Game.creeps || {};
    for (const name in creeps) {
        const c = creeps[name];
        if (!c.memory) continue;
        const role = c.memory.role;
        // Rescue CBs are already capped by RESCUE_BUILDER_CAP. Walking AND
        // arrived stay exempt: converting an arrived crew to builder/carry
        // (spawnFirstLockdown leaves one site, so cap=1) makes
        // colonyBuildersOn see 0, mothers hatch another wave, and retask
        // then cull oscillates every tick — nobody stays on the 15k site.
        if (role === "buildcontainer") continue;
        // Demoted ex-builders stay in the pool: when the planner drips the
        // next site batch, promoting a 3W hauler already standing there is
        // free — hatching a fresh 900e builder while it idles is the other
        // half of how E39N58 stacked 16 haulers.
        if (role !== "builder" && !promotableExBuilder(c)) continue;
        const station = builderStationRoom(c);
        if (!station) continue;
        (byStation[station] = byStation[station] || []).push(c);
    }
    for (const rn in byStation) {
        const room = Game.rooms && Game.rooms[rn];
        // Invisible or unowned station: leave them. A traveler in a hallway
        // is assigned to an owned room; if that room is not visible this tick
        // we must not treat the hallway as "no sites" and wipe the crew.
        if (!room || !room.controller || !room.controller.my) continue;
        const sites = room.find ? room.find(FIND_MY_CONSTRUCTION_SITES).length : 0;
        const list = byStation[rn];
        // WORK first; on ties a standing builder outranks an ex-builder, so
        // the same creeps keep the job tick over tick instead of flip-flopping
        // roles (and repathing) every pass.
        list.sort((a, b) =>
            b.getActiveBodyparts(WORK) - a.getActiveBodyparts(WORK)
            || (b.memory.role === "builder" ? 1 : 0) - (a.memory.role === "builder" ? 1 : 0));
        const cap = liveBuilderKeep(sites);
        for (let i = 0; i < list.length; i++) {
            const c = list[i];
            if (i < cap) {
                if (c.memory.role !== "builder") {
                    c.memory.role = "builder";
                    converted++;
                    delete c.memory.full;
                    delete c.memory.fill;
                    delete c.memory.locked;
                    delete c.memory.building;
                }
                if (!c.memory.homeRoom) c.memory.homeRoom = rn;
                continue;
            }
            // Surplus ex-builders just keep hauling — leave their memory be.
            if (c.memory.role !== "builder") continue;
            // Surplus become carriers for the STATION room. Convert all of
            // them — the old `converted < LIVE_BUILDER_CAP` then suicide
            // leftover paid the last rescue in corpses.
            if (c.getActiveBodyparts(CARRY) > 0) {
                converted++;
                c.memory.role = "carry";
                c.memory.homeRoom = rn;
                delete c.memory.fill;
                delete c.memory.building;
                delete c.memory.locked;
                delete c.memory.targetRoom;
            } else if (c.ticksToLive && c.ticksToLive < 200) {
                c.suicide();
                converted++;
            }
        }
    }
    // Roles were rewritten mid-tick: the shared census must not keep serving
    // the old ones to the ladder / empire readers this tick (review O9).
    if (converted) invalidateCensus();
}
