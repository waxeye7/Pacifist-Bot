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
 * front of it usually stand OUTSIDE the min-cut shell, and older planner
 * builds did not bubble them. incomeRampartAdds() derives the two tiles per
 * source from an adopted plan so syncPlanV2Memory can append them to
 * `planV2.t.rampart` — from there the normal machinery takes over: placement
 * sites them (RCL4+), alignment counts them as PLAN tiles (never retires
 * them), isSanctionedRampart() approves them, and the miner's own
 * build-a-rampart-under-the-link check stops being vetoed.
 *
 * The current planner prices and bubbles those works itself, and only when
 * they are EXPOSED. shellExposure() replays that same rule over the plan's
 * min-cut ring so the in-game derivation cannot rampart a deep-enclosed source
 * the planner deliberately left bare.
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

/** Chebyshev depth at which a tile inside the shell stops being "exposed". */
const EXPOSED_DEPTH = 4;

/**
 * The offline planner's EXPOSURE rule, replayed in-game over a plan's min-cut
 * ring so the derived income ramparts agree with the ones the planner already
 * priced and bubbled itself.
 *
 * A tile is EXPOSED when it is either
 *   - OUTSIDE the shell (reachable by a walkable D8 flood from the room edges
 *     with the shell tiles and terrain walls as blockers), or
 *   - inside, but within chebyshev 4 of the nearest exterior tile. The depth
 *     BFS runs over ALL 2500 tiles, terrain walls included: an attacker's
 *     ranged damage does not care that the tile between is a cliff.
 * Anything deeper is enclosed — the planner deliberately leaves it unbubbled,
 * because the owner's objective is the MINIMUM number of ramparts.
 *
 * Returns `null` when `shell` is missing or implausibly short (< 8 tiles): the
 * caller cannot trust the answer, so it should fail OPEN and rampart both
 * tiles as before. Note the same fail-open holds implicitly for a shell that
 * does NOT close around the hub: the edge flood then leaks all the way in,
 * every tile comes back exterior, and the predicate says "exposed" for
 * everything — exactly the old unconditional behaviour.
 */
export function shellExposure(
    shell: number[],
    isWall: (x: number, y: number) => boolean,
): ((p: number) => boolean) | null {
    if (!shell || shell.length < 8) return null;

    const blocked = new Uint8Array(2500); // shell ring tiles — the flood stops here
    for (const p of shell) {
        if (p >= 0 && p < 2500) blocked[p] = 1;
    }

    const wall = new Uint8Array(2500);
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            if (isWall(x, y)) wall[x + y * 50] = 1;
        }
    }

    // 1. exterior flood: D8 over walkable, non-shell tiles seeded from the edges
    const ext = new Uint8Array(2500);
    const queue = new Int16Array(2500);
    let head = 0;
    let tail = 0;
    const seed = (x: number, y: number) => {
        const p = x + y * 50;
        if (ext[p] || wall[p] || blocked[p]) return;
        ext[p] = 1;
        queue[tail++] = p;
    };
    for (let i = 0; i < 50; i++) {
        seed(i, 0);
        seed(i, 49);
        seed(0, i);
        seed(49, i);
    }
    while (head < tail) {
        const p = queue[head++];
        const x = p % 50;
        const y = (p - x) / 50;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
                const np = nx + ny * 50;
                if (ext[np] || wall[np] || blocked[np]) continue;
                ext[np] = 1;
                queue[tail++] = np;
            }
        }
    }

    // 2. chebyshev depth from the exterior, THROUGH walls (multi-source BFS)
    const depth = new Int16Array(2500);
    const dq = new Int16Array(2500);
    let dHead = 0;
    let dTail = 0;
    for (let p = 0; p < 2500; p++) {
        if (ext[p]) {
            depth[p] = 0;
            dq[dTail++] = p;
        } else {
            depth[p] = 32000;
        }
    }
    while (dHead < dTail) {
        const p = dq[dHead++];
        const d = depth[p] + 1;
        if (d > EXPOSED_DEPTH) continue; // nothing past the cutoff changes the answer
        const x = p % 50;
        const y = (p - x) / 50;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
                const np = nx + ny * 50;
                if (depth[np] <= d) continue;
                depth[np] = d;
                dq[dTail++] = np;
            }
        }
    }

    return (p: number) => p >= 0 && p < 2500 && (ext[p] === 1 || depth[p] < EXPOSED_DEPTH);
}

/**
 * PLAN-side: the packed rampart tiles to append to `t.rampart` — for every
 * source whose plan link stands within 2, the LINK tile and the SEAT tile,
 * skipping anything already ramparted. Returns only the missing ones, so a
 * second call after the append is a no-op (sync runs forever, the list must
 * not grow).
 *
 * `exposed` is the optional gate from shellExposure(): with it, a tile is only
 * ramparted when it is outside the shell or shallow behind it, matching what
 * the planner itself now bubbles. Pass null/undefined to add both tiles
 * unconditionally (the pre-exposure behaviour).
 */
export function incomeRampartAdds(
    t: { link?: number[]; rampart?: number[]; container?: number[]; road?: number[] },
    sources: { x: number; y: number }[],
    isWall: (x: number, y: number) => boolean,
    exposed?: ((p: number) => boolean) | null,
): number[] {
    if (!t || !t.link || !t.link.length || !sources.length) return [];
    const ramparted = new Set(t.rampart || []);
    const containers = new Set(t.container || []);
    const roads = new Set(t.road || []);
    const adds: number[] = [];
    const push = (p: number) => {
        if (exposed && !exposed(p)) return; // deep inside the shell — the planner leaves it bare
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
