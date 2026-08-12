import { getCpuPolicy } from "utils/CpuPolicy";

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

function resFor(homeRoomName: string): any {
    const mem = Memory.rooms && Memory.rooms[homeRoomName];
    return mem && (mem as any).resources;
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
        if (rr && rr.find(FIND_HOSTILE_CREEPS).length > 0) {
            return true; // still hot; scanRemoteThreats will push the timer out
        }
        delete e.hot;
        console.log(`[remotes] ${name} ${remoteName} cooled down, re-opening`);
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
        // Invader cores are a longer-lived problem than a passing creep.
        const cores = rr.find(FIND_HOSTILE_STRUCTURES, {
            filter: (s: any) => s.structureType === STRUCTURE_INVADER_CORE,
        });
        if (cores.length) {
            markRemoteHot(room.name, remote, "invader core");
        }
    }
}

/** stagger the per-room pass so 10 communes don't all path on one tick */
function roomTickOffset(name: string): number {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
    return h;
}

const MANAGE_EVERY = 25;
/** owner's ask: reserve+mine the best 1-2 neighbours, no more */
const HARD_CAP = 2;

export function manageRemotes(room: any): void {
    if (!room.controller || !room.controller.my) return;

    // Below RCL3 a commune has no business running remotes at all. scout.ts
    // writes `active = true` the moment it decides a room is minable, with no
    // RCL awareness, so an RCL1-2 room could sit with active remotes and trickle
    // creeps at them. Observed on pacifist2's E19S7 (RCL2): three "active"
    // remotes returning 0.13 e/tick for 0.65 e/tick of spawn. Clear them here
    // rather than only forcing them off inside the spawn loop, so the flag and
    // the behaviour cannot disagree.
    if (room.controller.level < 3) {
        const r = room.memory.resources;
        if (r) {
            for (const n in r) {
                if (n !== room.name && r[n] && r[n].active) {
                    r[n].active = false;
                    console.log(`[remotes] ${room.name} close ${n} (RCL${room.controller.level} < 3)`);
                }
            }
        }
        return;
    }
    if (room.memory.danger) return;
    if (Game.cpu.bucket < 4000) return;
    if ((Game.time + roomTickOffset(room.name)) % MANAGE_EVERY !== 0) return;

    const policy = getCpuPolicy();
    if (!policy.allowRemotes) return;
    const cap = Math.max(1, Math.min(HARD_CAP, policy.maxRemotes));

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
            const look = Game.rooms[name];
            const stillTowered = !look || look.find(FIND_HOSTILE_STRUCTURES, {
                filter: (s: any) => s.structureType === STRUCTURE_TOWER,
            }).length > 0;
            if (stillTowered) {
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
                e.retryAt = Game.time + RESCOUT_AFTER; // ...for now
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
            if (e.retryAt === undefined) {
                e.retryAt = Game.time + LEGACY_RECHECK; // pre-`retryAt` data
            } else if (e.retryAt > 0 && Game.time >= e.retryAt) {
                delete e.energy;
                delete e.retryAt;
                delete e.hot;
                console.log(`[remotes] ${room.name} re-opening ${name} for another look`);
                unscouted.push(name);
                continue;
            }
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
                console.log(`[remotes] ${room.name} close ${name} (hot)`);
            }
            continue;
        }

        // Build_Remote_Roads stores pathLength per source; use the closest.
        let best = 90;
        for (const id of sourceIds) {
            const pl = e.energy[id] && e.energy[id].pathLength;
            if (typeof pl === "number" && pl < best) best = pl;
        }

        // Refresh the cached road verdict while we have vision. Cached (rather
        // than re-derived per source in the spawner) so this find() happens once
        // per remote per MANAGE_EVERY ticks instead of once per source per
        // producer pass.
        const vis = Game.rooms[name];
        if (vis && best < 90) {
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
            // fleet.
            e.reserved = !!(vis.controller && vis.controller.reservation);
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
        const maxPath = room.controller.level >= 5 ? 120 : 90;
        if (best > maxPath) {
            if (e.active) {
                e.active = false;
                console.log(`[remotes] ${room.name} close ${name} (path ${best} > ${maxPath} for RCL${room.controller.level})`);
            }
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
            console.log(`[remotes] ${room.name} ${want ? "OPEN" : "close"} ${s.name} (score ${s.score})`);
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
}

export default remotes;
