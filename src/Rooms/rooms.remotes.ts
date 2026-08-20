import { getCpuPolicy } from "utils/CpuPolicy";
import { remotesDisabled, remotesRclLocked } from "utils/Speedrun";
import { invalidateStaleStorageLink } from "Functions/roomFunctions";

function remotes(room) {
    if (!room.memory.resources) {
        room.memory.resources = {};
    }
    if (!room.memory.resources[room.name]) {
        room.memory.resources[room.name] = {};
    }

    let neighbors = Object.values(Game.map.describeExits(room.name));
    let newRooms = [];

    // Filter out existing rooms and current room
    neighbors = neighbors.filter(roomName => roomName !== room.name && !room.memory.resources[roomName]);

    for (let roomName of neighbors) {
        if (!Game.rooms[roomName] || (Game.rooms[roomName].controller && !Game.rooms[roomName].controller.my) || Game.map.getRoomStatus(roomName).status !== "normal") {
            room.memory.resources[roomName] = {};
            newRooms.push(roomName);
        }
    }

    // Check each new room's neighbors
    for (let roomName of newRooms) {
        let secondaryNeighbors = Object.values(Game.map.describeExits(roomName));

        // Filter out existing rooms and current room
        secondaryNeighbors = secondaryNeighbors.filter(secondaryRoomName => secondaryRoomName !== room.name && !room.memory.resources[secondaryRoomName]);

        for (let secondaryRoomName of secondaryNeighbors) {
            if (!Game.rooms[secondaryRoomName] || (Game.rooms[secondaryRoomName].controller && !Game.rooms[secondaryRoomName].controller.my) || Game.map.getRoomStatus(secondaryRoomName).status !== "normal") {
                room.memory.resources[secondaryRoomName] = {};
            }
        }
    }
}

/* ------------------------------------------------------------------ *
 * Remote selection
 *
 * remotes() above only SEEDS room.memory.resources with neighbour names.
 * manageRemotes() is what actually decides which of them this commune
 * mines. It replaces the old "every 500 ticks, flip one flag on one
 * randomly chosen room" logic in rooms.ts, which needed thousands of
 * ticks to open a single remote.
 *
 * Entry shapes in room.memory.resources[<neighbour>]:
 *   {}                              never looked at
 *   { active: true }                queued for a scout (scout gate in
 *                                   rooms.spawning keys off exactly this:
 *                                   <=1 key, active, no `energy`)
 *   { active, energy: { id: {} } }  scouted, N sources  -> minable
 *   { active:false, energy: {} }    scouted, rejected
 *   { ..., retryAt: <tick> }        rejected for a reason that can EXPIRE
 *
 * Only DIRECT neighbours are ever activated (the seeder also stores the
 * second ring; those are map knowledge, not remote targets).
 *
 * `energy: {}` used to mean "dead forever", full stop, and nothing in the bot
 * ever cleared it. That is only honest for a verdict about the map itself —
 * a room with no controller, or with a source count outside 1..2, will never
 * become minable. Every OTHER rejection is a snapshot of who happened to hold
 * the room the day a scout walked in: a player owns it, someone else has it
 * reserved, a structure was standing between us and a source. Those change,
 * and a permanent no means the commune is structurally incapable of noticing.
 *
 * Live VPS W2N1 is exactly that shape. Its three exits are W2N2 (held by a
 * rival at RCL4), W2N0 (an ungenerated world-border room), and W3N1 (our own
 * commune) — so its only possible future remote is W2N2, and W2N2 was pinned
 * at `{active:false, hot:552130, energy:{}}` where it would have stayed for
 * the life of the server even if the rival dropped the room tomorrow.
 *
 * So rejections now carry `retryAt` when, and only when, they are revisable,
 * and manageRemotes reopens them for one more scout when it expires.
 * ------------------------------------------------------------------ */

/**
 * How long a revisable rejection stands before it is worth another 50-energy
 * [MOVE] scout. Long enough that a contested neighbour is not re-probed in a
 * loop, short enough that a dropped room is picked up the same day.
 */
export const RESCOUT_AFTER = 20000;
/**
 * ...but a room that has DELIVERED to us is not an unknown quantity, and 20,000
 * ticks is most of a real-time day to sit on a remote we already know pays.
 *
 * Live E37N59 (RCL6): both of its remotes were closed with
 * `retryAt ≈ 82,297,5xx` — 13,000 ticks out — while Memory.rstats recorded
 * E38N59 del=12,650 and E36N59 del=4,600 over the measurement window. The
 * verdict that closed them ("someone lives here", "reserved by X") is about who
 * held the room on ONE tick; the delivery history is about whether it is worth
 * having. A remote with `del > 0` therefore gets the short leash.
 */
export const RESCOUT_PROVEN = 1500;

/**
 * How long THIS home->remote pair should stand rejected before another look.
 * Shared by manageRemotes (vision-side rejects) and Roles/scout (scout-side
 * rejects) so the two cannot disagree.
 */
export function rescoutDelay(homeRoomName: string, remoteName: string): number {
    const st = (Memory as any).rstats;
    const e = st && st.r && st.r[homeRoomName + "|" + remoteName];
    return e && e.del > 0 ? RESCOUT_PROVEN : RESCOUT_AFTER;
}
/**
 * Entries written before `retryAt` existed carry no reason at all, so we
 * cannot tell a world-border room from a rival's commune. Re-evaluate each of
 * them exactly once, shortly after this lands; the scout then writes a verdict
 * that knows whether it is permanent.
 */
const LEGACY_RECHECK = 200;

/* ------------------------------------------------------------------ *
 * Remote threat hysteresis — "leave fast, return slowly".
 *
 * The old behaviour keyed every remote decision off
 * `Game.rooms[remote].memory.roomData.has_hostile_creeps`, which is (a) only
 * true while we have vision and (b) cached, so it flaps: the moment our last
 * creep dies the flag goes stale, the spawner decides the room is fine, and it
 * feeds another creep into the same hostile room. Measured symptom: miners kept
 * being queued into rooms that had just killed the previous miner, because
 * spawn_energy_miner's "no vision OR hostiles" branch spawned a
 * [WORK,WORK,MOVE] in BOTH cases.
 *
 * The fix is an explicit, sticky, memory-backed flag:
 *   res[remote].hot = <tick until which the remote is off-limits>
 * Set the instant a hostile is seen (leave fast). It is never cleared early —
 * it simply expires, and any fresh sighting pushes it back out (return slowly).
 * ------------------------------------------------------------------ */

/** how long a remote stays abandoned after the last hostile sighting */
const HOT_COOLDOWN = 600;

/** Drop vision-only caches so a re-open cannot inherit a stale reserved/roaded verdict. */
function clearRemoteVisionFlags(e: any): void {
    delete e.reserved;
    delete e.roaded;
    delete e.containers;
}

function resFor(homeRoomName: string): any {
    const mem = Memory.rooms && Memory.rooms[homeRoomName];
    return mem && (mem as any).resources;
}

/* ------------------------------------------------------------------ *
 * Remote ownership registry — empire-level arbitration.
 *
 * manageRemotes scores a room's own `Game.map.describeExits` against that
 * room's own `room.memory.resources` and nothing else, so two communes that
 * share an exit both "win" the same neighbour and both staff it. Live:
 * E36N58 was opened by E37N58 (miner seat 90%) AND by E36N57 (seat 30%,
 * 400 energy delivered for its entire lifetime spend) — the same source ids
 * fed to two spawn_energy_miner passes. Nothing in the per-room view can see
 * that, so the claim has to live above the room.
 *
 * Memory.remoteOwner[<remote>] = { home: <commune>, t: <tick claimed> }
 *
 * A claim is only binding while the owner is REALLY still mining it
 * (`Memory.rooms[owner].resources[remote].active === true`); anything else is
 * stale and the next claimer overwrites it. That keeps the registry
 * self-healing across losing a room, a global reset, or a manual edit.
 * ------------------------------------------------------------------ */

/** How long a room stands off a remote another commune holds. */
const OWNED_RETRY = 1500;

function remoteOwners(): { [remote: string]: { home: string; t: number } } {
    const m: any = Memory as any;
    if (!m.remoteOwner) m.remoteOwner = {};
    return m.remoteOwner;
}

/**
 * The commune that holds `remote` and is still actually mining it, if that is
 * anyone other than `home`. Null means "free, or held by a stale claim" — in
 * both cases `home` may take it.
 */
function remoteHeldByOther(remote: string, home: string): string | null {
    const o = remoteOwners()[remote];
    if (!o || o.home === home) return null;
    // A claim held by a room we no longer own is stale by definition — and
    // Memory.rooms outlives the loss of a room, so without this a commune that
    // got wiped would hold its remotes against the rest of the empire forever.
    // Our own rooms are always in Game.rooms, so this needs no vision.
    const hr = Game.rooms[o.home];
    if (!hr || !hr.controller || !hr.controller.my) return null;
    const res = resFor(o.home);
    const e = res && res[remote];
    return e && e.active === true ? o.home : null;
}

/** Record `home` as the owner of `remote`. Rooms run sequentially; first writer wins. */
function claimRemote(remote: string, home: string): void {
    remoteOwners()[remote] = { home, t: Game.time };
}

/**
 * Drop every claim this room holds but is no longer backing with an active
 * remote. One sweep instead of a `delete` at each of the ~10 sites that set
 * `active = false`, so a new close path cannot forget to release — a leaked
 * claim would lock the remote out for every OTHER commune too.
 */
function syncRemoteClaims(room: any, res: any): void {
    const owners = remoteOwners();
    for (const n in owners) {
        if (owners[n].home !== room.name) continue;
        if (!res || !res[n] || res[n].active !== true) delete owners[n];
    }
}

/**
 * Has the remote this creep works been CLOSED by manageRemotes?
 *
 * manageRemotes flips `active = false` in ten places and that is the whole of
 * it — no role ever read the flag, so the crew already in the field kept
 * working a remote the haul fleet had stopped serving. A CARRY-less 4W miner
 * ([W,W,M,W,W,M]) then drops 8 e/t onto the floor of a room nobody visits for
 * up to 1500 more ticks. Live on E37N59: every remote inactive, every miner
 * still out there.
 *
 * STICKY on purpose. The lookup is throttled, so an un-recall on the ticks in
 * between would leave a miner oscillating between walking home and going back
 * to work. The flag stores the ROOM NAME it was raised against rather than a
 * bare true, so a creep later pointed at some other, open remote (global.send)
 * is not recalled off it by a verdict about a different room.
 *
 * `active === false` is required EXPLICITLY. Absent memory (`Memory.rooms` for
 * the home gone, no `resources`, no entry for this remote) means "no opinion",
 * and recalling on absence would strand the entire remote fleet of any room
 * whose memory has not been written yet.
 */
export function remoteRecalled(creep: any): boolean {
    const m = creep.memory;
    const home = m.homeRoom;
    const target = m.targetRoom;
    if (!home || !target || target === home) return false;
    // One memory-chain read per remote creep per 10 ticks. A per-creep phase
    // cannot come from ticksToLive — Game.time + ttl is CONSTANT for a given
    // creep, so that test is either true every tick or never true at all.
    // Between reads the sticky flag decides, so nothing oscillates.
    if (Game.time % 10 !== 0) return m.remoteClosed === target;
    const res = resFor(home);
    const e = res && res[target];
    if (m.remoteClosed === target) {
        // Sticky, but not forever: a remote that flipped closed -> open again
        // (cap juggling, a hot verdict that expired, an ownership claim that
        // was re-won) must get its creep back rather than recycle a healthy
        // miner and pay to hatch a new one. Live E36N57: miner flagged during
        // a one-pass close of E36N58, entry active again 20 ticks later.
        if (e && e.active === true) {
            delete m.remoteClosed;
            return false;
        }
        return true;
    }
    if (!e || e.active !== false) return false;
    // DEBOUNCE. `active === false` is set on a lot of transient conditions — a
    // CpuPolicy bucket dip that drops maxRemotes by one, two remotes swapping
    // rank on a score recompute, an ownership claim changing hands for one pass
    // — and the recall is expensive and asymmetric: it walks the whole crew
    // home (and recycles the miners) in one tick, and re-staffing costs a full
    // spawn cycle plus the walk back out. So a close only counts once it has
    // STOOD for four manage passes; anything shorter is churn and is ignored.
    //
    // `closedAt` is stamped by manageRemotes at every close it owns. An entry
    // closed by some other path (or before this field existed) has none, so the
    // first creep to look at it stamps the clock and lets the remote be — the
    // debounce then runs from first sight instead of recalling on legacy data.
    if (!e.closedAt) {
        e.closedAt = Game.time;
        return false;
    }
    if (Game.time - e.closedAt <= 4 * MANAGE_EVERY) return false;
    m.remoteClosed = target;
    return true;
}

/** Is this remote currently abandoned for threat reasons? */
export function remoteIsHot(homeRoom: any, remoteName: string): boolean {
    const name = typeof homeRoom === "string" ? homeRoom : homeRoom.name;
    const res = resFor(name);
    const e = res && res[remoteName];
    if (!e || !e.hot) return false;
    if (Game.time >= e.hot) {
        // Expired. Re-open OPTIMISTICALLY, even with no vision.
        //
        // The first version of this required seeing the room clear before
        // clearing the flag, which deadlocks: no vision -> stays hot -> we never
        // send a creep -> we never get vision -> hot forever. Observed live on
        // E2S8's E2S9 and E3S8, which sat abandoned while completely empty.
        //
        // "Return slowly" is the cooldown, not a refusal to ever return. If the
        // threat is still there, scanRemoteThreats() sees it on the next pass
        // with vision and re-marks the room immediately ("leave fast"), so the
        // worst case is one probe creep, not a permanent loss of the remote.
        const rr = Game.rooms[remoteName];
        if (rr) {
            // COMBAT hostiles only. The unfiltered find let a MOVE-only scout
            // re-arm the flag every HOT_COOLDOWN forever — a remote lost to a
            // wandering pacifist. Harvest thieves don't kill our creeps; the
            // things that do carry ATTACK/RANGED/HEAL.
            const combat = rr.find(FIND_HOSTILE_CREEPS, {filter: (c: any) =>
                c.body && c.body.some((p: any) =>
                    p.type === ATTACK || p.type === RANGED_ATTACK || p.type === HEAL)});
            if (combat.length > 0) {
                return true; // still hot; scanRemoteThreats will push the timer out
            }
            // Cores outlive the creep wave; ignoring them reopened a cored
            // remote every HOT_COOLDOWN and we fed miners into the core.
            if (remoteHasInvaderCore(rr)) {
                return true;
            }
            if (remoteHasHostileTower(rr)) {
                return true;
            }
            delete e.hot;
            console.log(`[remotes] ${name} ${remoteName} cooled down, re-opening`);
            return false;
        }
        // No vision: the usual state after we pulled. Still expire `hot` so
        // we are not deadlocked, but the first body in must be a probe —
        // cores last longer than HOT_COOLDOWN and a full crew walks into them.
        // Spawn consumes `probeFirst` (spawn_energy_miner).
        delete e.hot;
        e.probeFirst = true;
        console.log(`[remotes] ${name} ${remoteName} cooled down, re-opening (probe)`);
        return false;
    }
    return true;
}

/** Mark a remote hot. Called whenever hostiles are actually seen there. */
export function markRemoteHot(homeRoomName: string, remoteName: string, why: string): void {
    const res = resFor(homeRoomName);
    if (!res || !res[remoteName]) return;
    const was = res[remoteName].hot;
    res[remoteName].hot = Game.time + HOT_COOLDOWN;
    if (!was) {
        console.log(`[remotes] ${homeRoomName} ABANDON ${remoteName} for ${HOT_COOLDOWN}t (${why})`);
    }
}

/**
 * Sweep every visible active remote for hostiles and set/refresh the hot flag.
 * Cheap: one find() per visible active remote, and only for rooms we already
 * decided to mine.
 */
export function scanRemoteThreats(room: any): void {
    if (!room.controller || !room.controller.my) return;
    // Readers never call findStorageLink while the cached id is live;
    // this 5-tick pass is what actually drops a stale RCL5 source-link hub.
    invalidateStaleStorageLink(room);
    const res = room.memory.resources;
    if (!res) return;
    for (const remote in res) {
        if (remote === room.name) continue;
        if (!res[remote] || !res[remote].active) continue;
        const rr = Game.rooms[remote];
        if (!rr) continue;
        const hostiles = rr.find(FIND_HOSTILE_CREEPS, {
            filter: (c: any) =>
                c.getActiveBodyparts(ATTACK) > 0 ||
                c.getActiveBodyparts(RANGED_ATTACK) > 0 ||
                c.getActiveBodyparts(HEAL) > 0 ||
                c.getActiveBodyparts(WORK) > 0,
        });
        if (hostiles.length) {
            markRemoteHot(room.name, remote, hostiles.length + " hostile(s)");
        }
        if (remoteHasInvaderCore(rr)) {
            markRemoteHot(room.name, remote, "invader core");
        }
        if (remoteHasHostileTower(rr)) {
            markRemoteHot(room.name, remote, "hostile tower");
        }
    }
}

/** Leftover player towers — AvoidRooms used to miss controller.level 0 outposts. */
export function remoteHasHostileTower(vis: any): boolean {
    if (!vis || !vis.find) return false;
    const towers = vis.find(FIND_HOSTILE_STRUCTURES, {
        filter: (s: any) => s.structureType === STRUCTURE_TOWER,
    });
    return !!(towers && towers.length);
}

/** Visible invader core — same find scanRemoteThreats / remoteIsHot already use. */
export function remoteHasInvaderCore(vis: any): boolean {
    if (!vis || !vis.find) return false;
    const cores = vis.find(FIND_HOSTILE_STRUCTURES, {
        filter: (s: any) => s.structureType === STRUCTURE_INVADER_CORE,
    });
    return !!(cores && cores.length);
}

/** stagger the per-room pass so 10 communes don't all path on one tick */
export function roomTickOffset(name: string): number {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
    return h;
}

const MANAGE_EVERY = 25;
/** owner's ask: reserve+mine the best 1-2 neighbours, no more */
const HARD_CAP = 2;
/**
 * ...except from RCL6, where the room can afford a reserver (3x CLAIM), has the
 * carrier bodies to run a 10 e/t reserved source, and is bottlenecked on income
 * rather than on spawn time. CpuPolicy.maxRemotes is still the outer bound.
 */
const HARD_CAP_MATURE = 3;

/** Score for an already-active remote that has no surveyed pathLength yet. */
export const UNSCORED_ACTIVE_SCORE = 0;
/** Inactive slam-5 remotes (energy tiles, no pathLength) rank below actives. */
export const UNSCORED_INACTIVE_SCORE = UNSCORED_ACTIVE_SCORE - 1;

/** Closest surveyed pathLength, or null if none of the sources have one. */
export function bestRemotePathLength(energy: any): number | null {
    if (!energy) return null;
    let best = Infinity;
    for (const id of Object.keys(energy)) {
        const pl = energy[id] && energy[id].pathLength;
        if (typeof pl === "number" && pl < best) best = pl;
    }
    return isFinite(best) ? best : null;
}

/**
 * Active remotes with no pathLength used to be omitted from scored/keep, so
 * they did not consume HARD_CAP and the keep loop never closed them. At RCL3
 * Build_Remote_Roads never writes pathLength (RCL<4 + no storage), so every
 * newly scouted neighbour stayed active and slotsLeft stayed full.
 *
 * Hold those actives on `scored` (score 0) so they occupy a slot.
 * Inactive remotes that already have energy tiles (RCL3 slam-5 never writes
 * pathLength) must also sit on scored — a transient starve used to persist-
 * close them, and skip here meant they never reopened.
 */
export function scoreOrHoldUnsurveyed(
    name: string,
    e: any,
    scored: Array<{ name: string; score: number }>,
): "score" | "held" | "skip" {
    const best = bestRemotePathLength(e && e.energy);
    if (best != null) return "score";
    const nSources = e && e.energy ? Object.keys(e.energy).length : 0;
    if (nSources > 0) {
        scored.push({
            name,
            score: e && e.active ? UNSCORED_ACTIVE_SCORE : UNSCORED_INACTIVE_SCORE,
        });
        return "held";
    }
    return "skip";
}

export function manageRemotes(room: any): void {
    if (!room.controller || !room.controller.my) return;

    // Campaign remotes-off A/B. Must close every tick (not just skip opening)
    // and must not wait for MANAGE_EVERY / allowRemotes — those early-returns
    // left already-active remotes running.
    if (remotesDisabled()) {
        const r = room.memory.resources;
        if (r) {
            for (const n in r) {
                if (n !== room.name && r[n] && r[n].active) {
                    r[n].active = false;
                    console.log(`[remotes] ${room.name} close ${n} (disableRemotes)`);
                }
            }
            syncRemoteClaims(room, r);
        }
        return;
    }

    // RCL2 remotes do not pay (E19S7: 0.13 e/t for 0.65 spawn). RCL3 after
    // slam-5: one close unreserved remote if CPU allows. No reserver until
    // 650e (RCL5 / leftover dump). Roads still wait for RCL4.
    // Same predicate as applySpeedrunSpawnHints — do not open here if
    // hints would force-close before spawn on the next tick.
    if (remotesRclLocked(room)) {
        const r = room.memory.resources;
        if (r) {
            for (const n in r) {
                if (n !== room.name && r[n] && r[n].active) {
                    r[n].active = false;
                    console.log(`[remotes] ${room.name} close ${n} (RCL${room.controller.level} < 4)`);
                }
            }
            syncRemoteClaims(room, r);
        }
        return;
    }
    if (room.memory.danger) return;
    if (Game.cpu.bucket < 4000) return;
    if ((Game.time + roomTickOffset(room.name)) % MANAGE_EVERY !== 0) return;

    const policy = getCpuPolicy();
    if (!policy.allowRemotes) return;
    const hardCap = room.controller.level >= 6 ? HARD_CAP_MATURE
        : room.controller.level <= 3 ? 1
        : HARD_CAP;
    const cap = Math.max(1, Math.min(hardCap, policy.maxRemotes));

    const res = room.memory.resources;
    if (!res) return;

    const myName = room.controller.owner && room.controller.owner.username;
    const adjacent: string[] = Object.values(Game.map.describeExits(room.name)) as string[];

    const scored: Array<{ name: string; score: number }> = [];
    const unscouted: string[] = [];

    for (const name of adjacent) {
        if (name === room.name) continue;
        if (!res[name]) res[name] = {};
        const e = res[name];

        if (Game.map.getRoomStatus(name).status !== "normal") {
            e.active = false;
            continue;
        }
        const look = Game.rooms[name];
        const cored = remoteHasInvaderCore(look);
        const towered = remoteHasHostileTower(look);
        if (cored) {
            // Towers abort the candidate here. Cores used to exist only on
            // the hot / scanRemoteThreats path, which needs an already-active
            // remote (and for first open, a prior hot stamp). A just-scouted
            // cored room has neither, so it was OPEN'd and spawn_energy_miner
            // sent a full crew. Stamp hot so a later no-vision pass probeFirsts
            // instead of feeding another full crew.
            if (e.active) {
                e.active = false;
                e.closedAt = Game.time;
                console.log(`[remotes] ${room.name} close ${name} (invader core)`);
            } else {
                e.active = false;
            }
            markRemoteHot(room.name, name, "invader core");
            if (e.energy) {
                e.retryAt = Game.time + rescoutDelay(room.name, name);
            }
            continue;
        }
        if (towered) {
            // Towers used to be consulted ONLY after AvoidRooms already had
            // the name. creepFunctions only pushed level>2 rooms, so a
            // level-0 abandoned outpost with leftover towers was scored OPEN
            // and miners walked into the tower.
            e.active = false;
            if (!Memory.AvoidRooms) Memory.AvoidRooms = [];
            if (Memory.AvoidRooms.indexOf(name) < 0) Memory.AvoidRooms.push(name);
            if ((Memory as any).AvoidRoomsAt) (Memory as any).AvoidRoomsAt[name] = Game.time;
            if (e.energy) {
                e.retryAt = Game.time + rescoutDelay(room.name, name);
            }
            continue;
        }
        if (Memory.AvoidRooms && Memory.AvoidRooms.indexOf(name) >= 0) {
            // AvoidRooms is written by any creep that walks into a non-owned
            // room holding a hostile tower (creepFunctions), and below RCL8 —
            // no observer — nothing ever takes a name back off it. That makes
            // it a second permanent trap sitting behind the rejection expiry
            // added below: re-open a neighbour, send the scout, the scout sees
            // the tower on arrival, and the room is blacklisted for good.
            //
            // Clear it only on positive evidence. If we are standing in the
            // room right now and there is no hostile tower in it, the reason
            // the name was written down is gone.
            if (!look) {
                e.active = false;
                continue;
            }
            Memory.AvoidRooms.splice(Memory.AvoidRooms.indexOf(name), 1);
            console.log(`[remotes] ${room.name} ${name} has no hostile tower any more - off AvoidRooms`);
        }

        // With vision we can reject before spending a scout.
        //
        // A reservation must never be a lasting verdict: the first version of
        // this also rejected reserved rooms, and since OUR OWN reserver puts a
        // reservation on the remote, every remote killed itself a few hundred
        // ticks after it started working. A foreign reservation just parks the
        // room for now.
        const seen = Game.rooms[name];
        if (seen && seen.controller) {
            if (seen.controller.owner) {
                e.active = false;
                e.energy = {};                       // someone lives here...
                e.retryAt = Game.time + rescoutDelay(room.name, name); // ...for now
                clearRemoteVisionFlags(e);
                continue;
            }
            const rsv = seen.controller.reservation;
            if (rsv && myName && rsv.username !== myName) {
                // Someone else's remote. Park it STICKILY: `seen` only exists
                // while we have a creep standing there, so closing on sight and
                // re-opening the moment we lose vision is a spawn-churn loop —
                // send a miner, see the rival reservation, close, lose vision,
                // re-open, send another miner. Measured on E3S3->E3S4: 6 remote
                // creeps born, 2,000 energy spent, ZERO energy delivered.
                // Park for the life of their reservation plus a margin.
                e.foreignUntil = Game.time + Math.max(200, (rsv.ticksToEnd || 0) + 100);
                if (e.active) {
                    e.active = false;
                    console.log(`[remotes] ${room.name} close ${name} (reserved by ${rsv.username} for ${rsv.ticksToEnd}t)`);
                }
                clearRemoteVisionFlags(e);
                continue;
            }
            if (e.foreignUntil) delete e.foreignUntil; // visibly free again
        }
        // No vision: honour the parked verdict instead of re-opening blind.
        if (e.foreignUntil) {
            if (Game.time < e.foreignUntil) {
                e.active = false;
                continue;
            }
            delete e.foreignUntil;
        }

        // Reopen a rejection whose reason has expired. Only entries that were
        // rejected for a revisable reason carry `retryAt`; a world-border room
        // or a three-source room never gets one, so this cannot turn into a
        // scout treadmill against the map itself. `hot` goes with it — an
        // unscouted entry has no miner or carrier to ever call remoteIsHot()
        // on it, so a stale `hot` on a re-opened entry would never expire.
        //
        // `retryAt` is three-valued on purpose. ABSENT means the entry predates
        // this field and we have no idea why it was rejected, so it earns one
        // re-look. ZERO is an explicit "never again" written by a scout that
        // rejected the room on a fact about the map. A POSITIVE tick is a
        // deadline. Reading "permanent" as absence instead of zero is a
        // treadmill, and it ran live on the VPS before this line existed:
        // W1N1 scouted W1N0 (an ungenerated border room), wrote its permanent
        // verdict by deleting `retryAt`, and manageRemotes read the missing
        // field as legacy data and re-queued the same scout 200 ticks later,
        // forever.
        if (e.energy && Object.keys(e.energy).length === 0) {
            // A deadline written under the old flat RESCOUT_AFTER is still
            // sitting in memory from before rescoutDelay existed, so clamp it
            // on read as well as on write — otherwise the fix does nothing for
            // the rooms that already have the problem. E37N59's two remotes are
            // both parked ~13,000 ticks out with a delivery history.
            const maxWait = rescoutDelay(room.name, name);
            if (e.retryAt > 0 && e.retryAt > Game.time + maxWait) {
                e.retryAt = Game.time + maxWait;
            }
            if (e.retryAt === undefined) {
                e.retryAt = Game.time + LEGACY_RECHECK; // pre-`retryAt` data
            } else if (e.retryAt > 0 && Game.time >= e.retryAt) {
                delete e.energy;
                delete e.retryAt;
                delete e.hot;
                clearRemoteVisionFlags(e);
                console.log(`[remotes] ${room.name} re-opening ${name} for another look`);
                // Fall through to remoteHeldByOther. Pushing unscouted and
                // continue here armed a 50e scout on a remote another commune
                // is already mining.
            }
        }

        // Another commune already holds this remote and is still working it.
        // Checked HERE, while the candidate list is being built, rather than
        // after the sort: a remote we cannot have must not consume one of the
        // room's two (three at RCL6) HARD_CAP slots, and it must not consume
        // the scout slot below either.
        const heldBy = remoteHeldByOther(name, room.name);
        if (heldBy) {
            if (e.active) {
                e.active = false;
                e.closedAt = Game.time;   // starts remoteRecalled's debounce
                console.log(`[remotes] ${room.name} close ${name} (owned by ${heldBy})`);
            }
            e.retryAt = Game.time + OWNED_RETRY;
            clearRemoteVisionFlags(e);
            continue;
        }

        if (!e.energy) {
            unscouted.push(name);
            continue;
        }
        const sourceIds = Object.keys(e.energy);
        if (sourceIds.length === 0) {
            e.active = false; // scouted and rejected
            continue;
        }
        // A remote under threat is not a candidate this pass.
        if (remoteIsHot(room, name)) {
            if (e.active) {
                e.active = false;
                e.closedAt = Game.time;   // starts remoteRecalled's debounce
                console.log(`[remotes] ${room.name} close ${name} (hot)`);
            }
            clearRemoteVisionFlags(e);
            continue;
        }

        // Build_Remote_Roads stores pathLength per source; use the closest.
        // Init at Infinity (not 90): a missing pathLength used to score as 90
        // and OPEN, and best<90 skipped the roaded/reserved cache entirely.
        const hold = scoreOrHoldUnsurveyed(name, e, scored);
        if (hold !== "score") {
            // Held actives occupy a HARD_CAP slot (see scoreOrHoldUnsurveyed).
            // Still claim so no other commune opens it before its path lands.
            if (hold === "held") claimRemote(name, room.name);
            continue;
        }
        let best = bestRemotePathLength(e.energy) as number;

        // Refresh the cached road verdict while we have vision. Cached (rather
        // than re-derived per source in the spawner) so this find() happens once
        // per remote per MANAGE_EVERY ticks instead of once per source per
        // producer pass.
        const vis = Game.rooms[name];
        if (vis) {
            let roads = 0;
            let conts = 0;
            for (const s of vis.find(FIND_STRUCTURES)) {
                if (s.structureType === STRUCTURE_ROAD) roads++;
                else if (s.structureType === STRUCTURE_CONTAINER) conts++;
            }
            e.roaded = roads >= best * 0.4;
            // Without a source container the miner drop-mines onto the floor and
            // the carrier has to walk between scattered piles to fill up, which
            // costs real ticks the round-trip model does not otherwise see.
            e.containers = conts;
            // Cached so carrier sizing never needs live vision — see
            // remoteCarrierDemand(). A reserved source yields 10/tick, an
            // unreserved one 5, and getting that wrong halves or doubles the
            // fleet. It has to be OUR reservation: a rival's parks the room
            // (foreignUntil, above) and the sources keep regenerating at 5.
            const rsvHere = vis.controller && vis.controller.reservation;
            e.reserved = !!(rsvHere && (!myName || rsvHere.username === myName));
        }

        /*
         * SCORING. The old score was `sources * 100 - pathLength`, which prices
         * one extra source as worth 100 tiles of haul. That is wildly wrong and
         * it showed: E3S3 (RCL4) had opened E3S4 at pathLength 81-85, i.e. a
         * ~170-tick round trip, which needs ~850 energy of CARRY per source to
         * keep up — more than the room's entire spawn capacity.
         *
         * Score on NET energy per tick instead. A source yields 5/tick
         * unreserved (1500/300). A carrier that has to cover `L` tiles each way
         * ties up roughly `yield * 2L` energy of body, which has to be respawned
         * every CREEP_LIFE_TIME, so haul overhead is proportional to L. Net
         * value per source ~= yield * (1 - L/BREAKEVEN).
         */
        const BREAKEVEN = 110; // tiles one-way at which a remote stops paying for itself

        // Roads roughly halve the body a carrier needs for the same throughput
        // (2:1 CARRY:MOVE instead of 1:1), so a roaded remote is effectively
        // closer. Measured: E3S3->E3S4 is 81 tiles but has 70 roads and returns
        // 1.5x its spawn cost, while the unroaded E2S7->E3S7 at a shorter path
        // returns 0.92x. Distance alone is the wrong discriminator.
        // Roads make a remote cheaper to run, so they RANK it higher — but they
        // deliberately do NOT feed the reject below.
        //
        // `roaded` is only knowable with vision, and closing a remote removes
        // the vision that would revise the verdict. A cached `roaded:false` that
        // gates the reject is therefore self-sealing: E3S4 (82 tiles, 56 roads,
        // 2 containers, returning 1.5x its spawn cost) sat closed forever on a
        // stale false. Any cached NEGATIVE that suppresses its own evidence is a
        // trap; the reject has to run on data that is always available.
        // pathLength is stored in memory and never needs vision, so the reject
        // uses raw distance and only the score uses roads.
        const effective = e.roaded === true ? Math.round(best * 0.6) : best;
        const perSource = 5 * (1 - effective / BREAKEVEN);
        const score = Math.round(sourceIds.length * perSource * 100);

        // Reject only genuinely absurd hauls. The old `sources*100 - path` score
        // had no reject at all; this is a backstop, not the main selector —
        // HARD_CAP already keeps only the best two, and the demand-sized carriers
        // handle the rest. Kept deliberately loose so it can never be the reason
        // a working remote is dropped.
        const maxPath = room.controller.level >= 5 ? 120
            : room.controller.level <= 3 ? 60
            : 90;
        if (best > maxPath) {
            if (e.active) {
                e.active = false;
                console.log(`[remotes] ${room.name} close ${name} (path ${best} > ${maxPath} for RCL${room.controller.level})`);
            }
            clearRemoteVisionFlags(e);
            continue;
        }

        scored.push({ name, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const keep: { [name: string]: boolean } = {};
    for (let i = 0; i < scored.length && i < cap; i++) keep[scored[i].name] = true;

    for (const s of scored) {
        const want = !!keep[s.name];
        if (!!res[s.name].active !== want) {
            res[s.name].active = want;
            // The close clock remoteRecalled debounces against.
            if (!want) res[s.name].closedAt = Game.time;
            console.log(`[remotes] ${room.name} ${want ? "OPEN" : "close"} ${s.name} (score ${s.score})`);
        }
        // Stake the claim every pass, not only on the OPEN transition: `t` then
        // doubles as "when did this room last confirm it is mining here", and a
        // registry wiped by a memory edit repairs itself within MANAGE_EVERY.
        //
        // Same reasoning for clearing the close clock: scout.ts ALSO writes
        // `active = true`, and an entry that came back open that way never sees
        // an OPEN transition here — it would carry a months-old `closedAt` into
        // its next close and skip the debounce entirely.
        if (want) {
            claimRemote(s.name, room.name);
            delete res[s.name].closedAt;
        }
    }

    // Spare capacity -> queue exactly one scout target at a time. An entry
    // that is `active` with no `energy` costs nothing (miner/carrier/reserver
    // spawners all iterate data.energy) but it is what unblocks the scout
    // gate in rooms.spawning.
    const slotsLeft = cap - Object.keys(keep).length;
    if (slotsLeft > 0 && unscouted.length) {
        const pending = unscouted.filter(n => res[n].active);
        for (let i = 1; i < pending.length; i++) res[pending[i]].active = false;
        if (pending.length === 0) {
            res[unscouted[0]].active = true;
            delete res[unscouted[0]].closedAt;
            console.log(`[remotes] ${room.name} scouting ${unscouted[0]}`);
        }
    } else {
        for (const n of unscouted) res[n].active = false;
    }

    // Second-ring / stale entries are never remote targets.
    for (const name of Object.keys(res)) {
        if (name === room.name) continue;
        if (adjacent.indexOf(name) < 0 && res[name] && res[name].active) res[name].active = false;
    }

    // ...and after every close above, hand back what we are no longer mining.
    syncRemoteClaims(room, res);
}

export default remotes;
