/**
 * The miner SEAT: the one tile a source's CARRY miner should stand on for its
 * whole life — adjacent to the SOURCE and to the SOURCE LINK at once, so
 * harvest and transfer both work without a step.
 *
 * Without a designated seat the miner parks on whatever range-1 tile
 * harvestEnergy's pathing hands it — usually the ROAD, because roads are the
 * cheapest tiles in the cost matrix. A road seat is the worst one: the miner
 * blocks traffic, and when the link is not adjacent it walks link-ward to
 * transfer and source-ward to harvest, shuffling the same two tiles forever
 * (live VPS W3N1: link at range 2, miner oscillating on the road while the
 * between-tile sat empty).
 *
 * Preference order for the seat, all candidates being tiles adjacent to BOTH
 * source and link: the CONTAINER tile (income lands under the miner's feet
 * and the drop-path stays warm), then a RAMPARTED / plan-ramparted tile
 * (protected seat), then a plain tile, then — only when nothing else exists —
 * the road.
 *
 * The same geometry drives the INCOME RAMPARTS: a source link and the seat in
 * front of it usually stand OUTSIDE the min-cut shell, and the offline planner
 * (parked at r44) does not bubble them. incomeRampartAdds() derives the two
 * tiles per source from an adopted plan so syncPlanV2Memory can append them to
 * `planV2.t.rampart` — from there the normal machinery takes over: placement
 * sites them (RCL4+), alignment counts them as PLAN tiles (never retires
 * them), isSanctionedRampart() approves them, and the miner's own
 * build-a-rampart-under-the-link check stops being vetoed.
 *
 * Everything here is pure over packed tiles so it can be unit-tested and
 * shared by the role (live structures) and the plan sync (plan tiles).
 */

export function packXY(x: number, y: number): number {
    return x + y * 50;
}

export function unpackXY(p: number): { x: number; y: number } {
    return { x: p % 50, y: Math.floor(p / 50) };
}

export interface SeatCand {
    p: number;
    container: boolean;
    rampart: boolean;
    road: boolean;
}

/**
 * Best seat from a candidate list: container > rampart > plain > road,
 * ties broken by lowest packed index so every caller lands on the SAME tile
 * (the rampart the plan sync sanctions must be the tile the miner sits on).
 */
export function chooseSeat(cands: SeatCand[]): number | null {
    let best: SeatCand | null = null;
    let bestScore = -1;
    for (const c of cands) {
        const score = c.container ? 3 : c.rampart ? 2 : c.road ? 0 : 1;
        if (score > bestScore || (score === bestScore && best !== null && c.p < best.p)) {
            best = c;
            bestScore = score;
        }
    }
    return best ? best.p : null;
}

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/**
 * Tiles adjacent to BOTH the source and the link (the seat ring). `isWall`
 * abstracts terrain so the plan sync and the live role share the geometry.
 */
export function seatTiles(
    sx: number, sy: number, lx: number, ly: number,
    isWall: (x: number, y: number) => boolean,
): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (!dx && !dy) continue;
            const x = sx + dx;
            const y = sy + dy;
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            if (chebyshev(x, y, lx, ly) !== 1) continue;
            if (isWall(x, y)) continue;
            out.push({ x, y });
        }
    }
    return out;
}

/**
 * PLAN-side: the packed rampart tiles to append to `t.rampart` — for every
 * source whose plan link stands within 2, the LINK tile and the SEAT tile,
 * skipping anything already ramparted. Returns only the missing ones, so a
 * second call after the append is a no-op (sync runs forever, the list must
 * not grow).
 */
export function incomeRampartAdds(
    t: { link?: number[]; rampart?: number[]; container?: number[]; road?: number[] },
    sources: { x: number; y: number }[],
    isWall: (x: number, y: number) => boolean,
): number[] {
    if (!t || !t.link || !t.link.length || !sources.length) return [];
    const ramparted = new Set(t.rampart || []);
    const containers = new Set(t.container || []);
    const roads = new Set(t.road || []);
    const adds: number[] = [];
    const push = (p: number) => {
        if (!ramparted.has(p)) {
            ramparted.add(p);
            adds.push(p);
        }
    };
    for (const s of sources) {
        for (const lp of t.link) {
            const l = unpackXY(lp);
            if (chebyshev(s.x, s.y, l.x, l.y) > 2) continue;
            push(lp); // the link itself
            const cands: SeatCand[] = seatTiles(s.x, s.y, l.x, l.y, isWall).map(pos => {
                const p = packXY(pos.x, pos.y);
                return { p, container: containers.has(p), rampart: ramparted.has(p), road: roads.has(p) };
            });
            const seat = chooseSeat(cands);
            if (seat !== null) push(seat);
            break; // one link per source
        }
    }
    return adds;
}

/**
 * LIVE-side: the seat for a real source + link in a visible room, judged on
 * what actually stands there. Tiles carrying a blocking structure (anything
 * but road / container / rampart) are out; classification prefers a live
 * container, then a live or plan rampart, then plain ground, then road.
 */
export function findLiveSeat(room: any, sourcePos: any, linkPos: any): number | null {
    const terrain = room.getTerrain ? room.getTerrain() : null;
    const isWall = (x: number, y: number) =>
        !!terrain && terrain.get(x, y) === TERRAIN_MASK_WALL;
    const planRamparts: Set<number> | null = (() => {
        const t = room.memory && room.memory.planV2 && room.memory.planV2.t;
        return t && t.rampart ? new Set<number>(t.rampart) : null;
    })();
    const cands: SeatCand[] = [];
    for (const pos of seatTiles(sourcePos.x, sourcePos.y, linkPos.x, linkPos.y, isWall)) {
        const p = packXY(pos.x, pos.y);
        let container = false;
        let rampart = planRamparts ? planRamparts.has(p) : false;
        let road = false;
        let blocked = false;
        const structs = room.lookForAt ? room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y) : [];
        for (const s of structs) {
            if (s.structureType === STRUCTURE_CONTAINER) container = true;
            else if (s.structureType === STRUCTURE_RAMPART) rampart = true;
            else if (s.structureType === STRUCTURE_ROAD) road = true;
            else blocked = true;
        }
        if (blocked) continue;
        cands.push({ p, container, rampart, road });
    }
    return chooseSeat(cands);
}
