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
 *   { active:false, energy: {} }    scouted, rejected   -> dead forever
 *
 * Only DIRECT neighbours are ever activated (the seeder also stores the
 * second ring; those are map knowledge, not remote targets).
 * ------------------------------------------------------------------ */

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
    if (room.controller.level < 3) return;
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
            e.active = false;
            continue;
        }

        // With vision we can reject before spending a scout.
        //
        // ONLY an owned controller is a permanent verdict (`energy = {}` is
        // read as "scouted and rejected" forever). A reservation must never
        // be one: the first version of this also rejected reserved rooms, and
        // since OUR OWN reserver puts a reservation on the remote, every
        // remote killed itself a few hundred ticks after it started working.
        // A foreign reservation just parks the room for now.
        const seen = Game.rooms[name];
        if (seen && seen.controller) {
            if (seen.controller.owner) {
                e.active = false;
                e.energy = {}; // owned by a player — permanent no
                continue;
            }
            const rsv = seen.controller.reservation;
            if (rsv && myName && rsv.username !== myName) {
                e.active = false; // someone else's remote, retry later
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
        // Build_Remote_Roads stores pathLength per source; use the closest.
        let best = 90;
        for (const id of sourceIds) {
            const pl = e.energy[id] && e.energy[id].pathLength;
            if (typeof pl === "number" && pl < best) best = pl;
        }
        scored.push({ name, score: sourceIds.length * 100 - best });
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
