/**
 * Empire creep census: ONE pass over Game.creeps per tick, shared by the empire
 * layer and every room.
 *
 * Before this, spawning walked Game.creeps once per room per producer run and
 * again inside emergencyFillerRescue / homeEconomyStarved / retask; each walk
 * used a slightly different notion of "belongs to this room". The ladder and
 * the empire pass need the same numbers, so they come from one place.
 *
 * Attribution:
 *   home[room][role]     creeps whose HOME is this room (memory.homeRoom, else
 *                        the room they stand in) and whose targetRoom is home
 *                        or unset — the room's own crew, remote crews excluded.
 *   present[room][role]  creeps physically in this room — the producer's
 *                        isInRoom() counting, kept so the two agree.
 *   minersBySource[id]   EnergyMiners (live + hatching) keyed by memory.sourceId,
 *                        with their WORK count.
 *
 * Hatching creeps are in Game.creeps from the tick after spawnCreep(), so a
 * floor creep spawned last tick already counts this tick.
 */

export interface RoleCounts { [role: string]: number }
/** live+hatching miners on a source: total, WORK parts, how many are REAL (not ladder stopgaps), and the stopgaps by name */
export interface SourceStaff { count: number; work: number; real: number; stopgaps: string[]; reals: string[] }

export interface EmpireCensus {
    tick: number;
    total: number;
    home: { [room: string]: RoleCounts };
    /** like home, but only creeps that are NOT ladder stopgaps (memory.stopgap) */
    homeReal: { [room: string]: RoleCounts };
    /** ladder stopgaps by home room and role, by name — so they can yield when the real creep arrives */
    stopgaps: { [room: string]: { [role: string]: string[] } };
    /** REAL (non-stopgap) home crew by room and role, by name — what a stopgap yields to */
    reals: { [room: string]: { [role: string]: string[] } };
    present: { [room: string]: RoleCounts };
    /** creeps whose memory.targetRoom is this room (remote crews, rescue builders, feeders) */
    target: { [room: string]: RoleCounts };
    minersBySource: { [sourceId: string]: SourceStaff };
}

let cache: EmpireCensus | null = null;

function bump(map: { [room: string]: RoleCounts }, room: string, role: string): void {
    const rc = map[room] || (map[room] = {});
    rc[role] = (rc[role] || 0) + 1;
}

export function getCensus(): EmpireCensus {
    if (cache && cache.tick === Game.time) return cache;
    const c: EmpireCensus = { tick: Game.time, total: 0, home: {}, homeReal: {}, stopgaps: {}, reals: {}, present: {}, target: {}, minersBySource: {} };
    const creeps = Game.creeps || {};
    for (const name in creeps) {
        const creep: any = creeps[name];
        if (!creep) continue;
        const mem: any = creep.memory || {};
        const role: string = mem.role || "?";
        const here: string = creep.room ? creep.room.name : (mem.homeRoom || "?");
        const home: string = mem.homeRoom || here;
        c.total++;
        const stopgap = !!mem.stopgap;
        bump(c.present, here, role);
        if (!mem.targetRoom || mem.targetRoom === home) {
            bump(c.home, home, role);
            const bag = stopgap ? c.stopgaps : c.reals;
            const byRole = bag[home] || (bag[home] = {});
            (byRole[role] || (byRole[role] = [])).push(name);
            if (!stopgap) bump(c.homeReal, home, role);
        }
        if (mem.targetRoom) bump(c.target, mem.targetRoom, role);
        if (role === "EnergyMiner" && mem.sourceId) {
            const s = c.minersBySource[mem.sourceId] || (c.minersBySource[mem.sourceId] = { count: 0, work: 0, real: 0, stopgaps: [], reals: [] });
            s.count++;
            if (stopgap) s.stopgaps.push(name); else { s.real++; s.reals.push(name); }
            const body: any[] = creep.body || [];
            for (let i = 0; i < body.length; i++) if (body[i] && body[i].type === WORK) s.work++;
        }
    }
    cache = c;
    return c;
}

/** Own-crew count for a role in a room (0 when unknown). */
export function homeCount(census: EmpireCensus, room: string, role: string): number {
    const rc = census.home[room];
    return rc ? (rc[role] || 0) : 0;
}

/** Physically-present count for a role in a room (0 when unknown). */
export function presentCount(census: EmpireCensus, room: string, role: string): number {
    const rc = census.present[room];
    return rc ? (rc[role] || 0) : 0;
}

/**
 * Drop this tick's cached census so the next getCensus() recounts. The empire
 * pass calls this after it has retasked creeps (roles changed mid-tick);
 * tests call it between fake Game states that share a tick number.
 */
export function invalidateCensus(): void {
    cache = null;
}

export function resetCensusForTest(): void {
    invalidateCensus();
}
