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
 * Site-placement freeze by RCL. Builders must not loot containers below this.
 *
 * THE bank floor ladder — PlanV2's broke clamp (site strip + budget) and the
 * funnel's donor reserve both read this, so the placer, the strip, the
 * builder withdraw floor and the donor ship floor cannot disagree. Raised
 * 2026-09-17 (was 150k/80k/30k): the live audit found every room broke-latched
 * at 5-9k with nothing funding recovery, so each rung now holds back more.
 */
export function siteFreezeBank(lvl: number): number {
    if (lvl >= 8) return 250000;
    if (lvl >= 7) return 120000;
    if (lvl >= 6) return 50000;
    return 0;
}

/**
 * Can this controller fire safe mode RIGHT NOW — a charge banked AND the
 * cooldown over. `safeModeCooldown` is an end tick, not a boolean: comparing
 * it to truthy reads "still cooling" for ~50k ticks AFTER expiry, which is how
 * the RampartErector spawn gate stayed URGENT forever once a room safe-moded.
 */
export function canSafeModeNow(controller: any, now: number): boolean {
    if (!controller || !controller.my) return false;
    if (!(controller.safeModeAvailable > 0)) return false;
    return !(controller.safeModeCooldown > now);
}

/**
 * The one exception to "no ramparts below RCL8": an RCL6-7 room that cannot
 * safe-mode has no other defence against the next raid — safe mode is the
 * wall this policy retired. It sites the shell NOW and Empire/funnel feeds
 * it. RCL4-5 stay out: too small to hold a shell, and an enemy that can
 * outwait the cooldown outlasts the room's whole economy anyway.
 */
export function emergencyShellActive(lvl: number, canSafeMode: boolean): boolean {
    return (lvl === 6 || lvl === 7) && !canSafeMode;
}

/**
 * Rampart SITE policy. Below RCL8 the room defends with safe mode + towers,
 * not a 50-tile shell it cannot afford to repair — the live shells already
 * standing are maintained by the repair economy, but nothing NEW is sited.
 * The shell emergency is the exception (see emergencyShellActive).
 */
export function rampartSitesAllowed(lvl: number, shellEmergency: boolean): boolean {
    if (lvl >= 8) return true;
    return shellEmergency && (lvl === 6 || lvl === 7);
}

/** Labs/nuker/terminal/observer — furniture, not the energy network. */
export function isExpensiveFurniture(type: string): boolean {
    return (
        type === STRUCTURE_LAB ||
        type === STRUCTURE_NUKER ||
        type === STRUCTURE_TERMINAL ||
        type === STRUCTURE_OBSERVER ||
        type === STRUCTURE_POWER_SPAWN ||
        type === STRUCTURE_FACTORY
    );
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


/* -------------------------------------------------------------------------
 * THE FILLER LADDER — ONE definition, because there were two.
 *
 * The hatchery filler was sized in two places that had drifted apart:
 *
 *   rooms.spawning spawnrules[lvl].filler_creep.body  — the producer rung
 *   Roles/filler.ts last-filler handoff               — the self-replacement
 *
 * ...and they disagreed on BOTH the body and the NAME. The handoff hardcoded
 * its own four-rung ladder and named the creep `filler-` (lowercase) while
 * every producer rung named it `Filler-`. Live shard3 E37N59 was running both
 * at once: `filler(9p/300c)` from the handoff and `Filler(12p/400c)` from the
 * rung, in the same room, doing the same job at different sizes.
 *
 * The name is not cosmetic. Every head-of-line safety net in rooms.spawning is
 * `spawn_list[1].startsWith("Filler")` — case-sensitive — so a handoff-queued
 * filler was NOT exempt from the stalled-head shredder (SHRED_STALLED_HEAD_-
 * AFTER, 60 ticks) and NOT covered by the head-shrink rung, which is exactly
 * the protection whose comment reads "Fillers are the -6 cure and are not on
 * the HOL shrink rung". The one path that re-queues the room's LAST filler was
 * the one path the shredder could eat.
 *
 * RATIO. 2:1 CARRY:MOVE is road speed loaded (non-MOVE parts pay 1 fatigue per
 * road tile, each MOVE relieves 2), which is what the hub ring is paved for
 * from RCL5. RCL4 keeps 1:1 deliberately — see the note on that rung: its
 * extension ring is not paved yet, so a 2:1 shuttle walks at 2 ticks/tile.
 *
 * PART CAP, not an energy cap. Bigger is strictly better for CPU (intent cost
 * is per creep, not per part) but spawn TIME is 3 ticks/part, and a filler is
 * the one creep whose absence stops the room refilling its own spawn.
 *
 * ── THE CAP WAS THE BINDING CONSTRAINT, AND IT WAS SET TOO LOW ──────────────
 *
 * The rungs ask for `amount: 1` at RCL6, 7 AND 8, and fillersWanted() returns
 * max(1, base) — so with no remotes open a developed room runs ONE filler.
 * At 12 parts that is 8 CARRY, i.e. 400 energy a load, against an extension
 * network of 2,000 at RCL6 and 5,000 at RCL7. Five to twelve round trips to
 * refill, and the room cannot spawn anything big until it has.
 *
 * Measured live shard3 2026-09-10, every room holding plenty of bank:
 *   E38N56  ext   650/2000   storage 12,404
 *   E35N59  ext  1000/2000   storage  ~9,200
 *   E36N57  ext  1100/2000   storage 16,808
 *   E39N58  ext  1350/2000   storage 20,107
 * The owner's words: "rooms arent refilling the extensions fast enough".
 *
 * The wallet was never the limit — at RCL6 the 85% budget is 1,955 and the cap
 * bound at 600. So buy the throughput with BODY, not with a second creep: a
 * filler costs 0.33-0.51 CPU per tick whatever its size, and this bot spends
 * 14 of its 20 CPU inside the creep loop. Doubling the carry of one filler is
 * free in CPU; a second filler is not.
 *
 * New ladder sizes each level to roughly three or four loads of its own
 * network, with hatch time as the ceiling (the last-filler handoff in
 * Roles/filler re-queues before it dies, so the hatch window is covered):
 *
 *   RCL5   15 parts  10C  500 carry    45t hatch   network 1,800
 *   RCL6   18 parts  12C  600 carry    54t hatch   network 2,300
 *   RCL7   30 parts  20C 1000 carry    90t hatch   network 5,300
 *   RCL8   36 parts  24C 1200 carry   108t hatch
 * ------------------------------------------------------------------------- */
/** Max body parts for a hatchery filler at `lvl`. */
export function fillerPartCap(lvl: number): number {
    if (lvl >= 8) return 36;
    if (lvl >= 7) return 30;
    if (lvl >= 6) return 18;
    return 15;
}

/** The one body a hatchery filler is ever built with. */
export function fillerBody(room: any): any[] {
    const lvl = (room && room.controller && room.controller.level) || 0;
    if (lvl <= 3) return [CARRY, MOVE];
    // Unpaved ring: 1:1 so a loaded shuttle is not 2 ticks/tile.
    if (lvl === 4) return [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
    const capacity = (room && room.energyCapacityAvailable) || 0;
    const segment = [CARRY, CARRY, MOVE];
    const segmentCost = 150;
    const maxSegments = Math.floor(fillerPartCap(lvl) / segment.length);
    // 85% of capacity, the same budget getBody() uses, so the queue can still
    // buy this after one fill pass rather than only when the room is brimming.
    const affordable = Math.floor(Math.floor(capacity * 0.85) / segmentCost);
    const segments = Math.max(1, Math.min(maxSegments, affordable));
    const body: any[] = [];
    for (let i = 0; i < segments; i++) for (const part of segment) body.push(part);
    return body;
}

/** The one name a hatchery filler is ever given. See the ladder note above. */
export function fillerName(room: any): string {
    return "Filler-" + Math.floor(Math.random() * Game.time) + "-" + room.name;
}

/* -------------------------------------------------------------------------
 * THE HOME MINER — a source is a 10 energy/tick tap, and no body can open it
 * further.
 *
 * SOURCE_ENERGY_CAPACITY (3,000) / ENERGY_REGEN_TIME (300) = 10 e/t in an
 * owned room, and HARVEST_POWER is 2, so FIVE WORK parts take everything the
 * source has. Every WORK part past the fifth harvests nothing, ever: it is
 * paid for at spawn, carried around for 1,500 ticks, and returns zero.
 *
 * The RCL6+ rungs in rooms.spawning did not know this. They built:
 *
 *   [18W, 5C, 9M]   2,500e, 32 parts, 96 ticks of hatch   (energyAvailable>3000)
 *   [12W, 5C, 8M]   1,750e, 25 parts, 75 ticks            (danger / boosted)
 *   [10W, 5C, 5M]   1,500e, 20 parts, 60 ticks            (the common case)
 *
 * against a body that saturates the source at [5W, 4C, 5M] — 950e, 14 parts,
 * 42 ticks. The 18-WORK body is 3.6x the WORK the tap can supply.
 *
 * This is not a rounding error in a room's budget, it IS the budget. A miner
 * is replaced every CREEP_LIFE_TIME, so its cost is an annuity against the one
 * source it sits on:
 *
 *   [18W,5C,9M]  2,500 / 1,500 = 1.67 e/t  =  17% of everything the source makes
 *   [10W,5C,5M]  1,500 / 1,500 = 1.00 e/t  =  10%
 *   [5W,4C,5M]     950 / 1,500 = 0.63 e/t  =   6%
 *
 * ...plus 96 ticks of hatch per life on the ONE spawn an RCL6/7 room has,
 * which is 6.4% of that spawn's entire uptime spent rebuilding a creep three
 * quarters of which does nothing.
 *
 * Measured, live shard3 2026-09-10: E37N58 (RCL7, storage 388 — the most
 * broke room in the empire) had just paid 2,500 energy for an [18W,5C,9M]
 * miner for source ...a282, a source that ALREADY had a working [5W,1C,2M]
 * ladder stopgap sitting on it and pulling the full 10 e/t.
 *
 * CARRY, not WORK, is what a miner is actually short of: it buffers between
 * deposits into the link or container. 4 CARRY (200) is 20 ticks of output.
 * MOVE is ceil(nonMove / 2) — road speed for the one walk out to the seat,
 * which is where seat discipline then parks it for life (utils/minerSeat).
 * ------------------------------------------------------------------------- */

/** Energy an owned-room source yields per tick: SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME. */
export const HOME_SOURCE_ENERGY_PER_TICK = 10;

/**
 * WORK parts that take 100% of a home source. HARVEST_POWER is 2 per WORK per
 * tick, so this is 5 — a hard property of the game, not a tuning knob.
 */
export const MINER_WORK_SATURATES = Math.ceil(HOME_SOURCE_ENERGY_PER_TICK / 2);

/**
 * The body for a miner on a HOME source, sized to the tap rather than to the
 * room's wallet.
 *
 * `capacity` is energyCapacityAvailable. `danger` buys a 1:1 MOVE ratio so the
 * creep can actually leave when the room is under attack — the only reason to
 * spend past the saturating body.
 */
export function homeMinerBody(capacity: number, danger = false): any[] {
    const cap = typeof capacity === "number" && capacity > 0 ? capacity : 0;
    const partCost = (w: number, c: number, m: number) => w * 100 + c * 50 + m * 50;
    const build = (w: number, c: number, m: number) => {
        const body: any[] = [];
        for (let i = 0; i < w; i++) body.push(WORK);
        for (let i = 0; i < c; i++) body.push(CARRY);
        for (let i = 0; i < m; i++) body.push(MOVE);
        return body;
    };
    // Shrink WORK first, then CARRY, until the room can pay. Never below the
    // [1W,1M] that still mines something.
    for (let work = MINER_WORK_SATURATES; work >= 1; work--) {
        for (let carry = work >= MINER_WORK_SATURATES ? 4 : 1; carry >= 0; carry--) {
            const nonMove = work + carry;
            const move = danger ? nonMove : Math.max(1, Math.ceil(nonMove / 2));
            if (partCost(work, carry, move) <= cap) return build(work, carry, move);
        }
    }
    return [WORK, MOVE];
}

/* -------------------------------------------------------------------------
 * THE THIN-BANK BUILDER — `rich` gated the COUNT and forgot the BODY.
 *
 * queueBuilder already knows when a room cannot afford to build: `rich` is
 * `storage > siteFreezeBank(lvl)` (30k / 80k / 150k), and a room that fails it
 * is cut back to ONE builder instead of the roster's 2-3. But the body it then
 * queues is `rules.build_creep.body`, which is
 * `getBody([W,W,C,C,M], room, 50)` — and getBody sizes off
 * energyCapacityAvailable, never the bank. So a poor room got one builder at
 * the same price a rich room pays.
 *
 * Live shard3 2026-09-10, E37N58: RCL7, energyCapacityAvailable 4,700, storage
 * 388. The 50-part cap binds at ten [W,W,C,C,M] segments = 20W 20C 10M =
 * 3,500 energy — a builder costing NINE TIMES the room's entire bank, queued
 * to finish a spawn site that needs 3,779 more progress. The owner's words:
 * "it's like spawning a builder when I have barely any energy in my storage".
 *
 * A builder is not an investment that pays itself back the way a miner is; it
 * converts bank into structure at a fixed 1 energy per point either way. Twice
 * the WORK finishes the site twice as fast and costs twice as much to put in
 * the field, so on a thin bank the big body buys nothing but a longer hatch
 * (3 ticks/part: 150 ticks for the 50-part body) and a deeper hole.
 *
 * Part cap rather than an energy cap so this composes with getBody's own
 * budget clamp, and so the shape of the body — the 1:1 WORK:CARRY that lets a
 * builder run a full load into a site — is left exactly as the rung wrote it.
 * ------------------------------------------------------------------------- */

/**
 * Body-part ceiling for a builder, given whether the room cleared
 * `siteFreezeBank` (`rich`) and what it actually holds.
 *
 * 10 parts is two [W,W,C,C,M] segments: 4 WORK (20 progress/tick), 4 CARRY,
 * 700 energy, 30 ticks of hatch. That finishes a 3,000-point extension in 150
 * ticks of work, which is the right pace for a room living on income.
 */
export function builderPartCap(rich: boolean, bank: number): number {
    if (rich) return 50;
    const held = typeof bank === "number" && bank > 0 ? bank : 0;
    if (held >= 10000) return 20;
    return 10;
}
