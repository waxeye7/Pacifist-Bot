/**
 * CONTROLLER ROADS STOP AT THE DEPOT (owner rule, 2026-08-20).
 *
 * Upgraders PARK inside upgrade range for their whole life and carriers stop
 * at the controller depot container — nothing shuttles all the way to the
 * controller itself. Road tiles within chebyshev 4 of the controller are
 * therefore walked once per creep LIFETIME (the upgrader's arrival step), but
 * they decay like every other road and the maintainer/keepTheseRoads pipeline
 * repairs them forever: pure rent on tiles with no traffic ("we never
 * traverse those roads and it uses more maintenance energy").
 *
 * The one exception is the DEPOT APPROACH: the depot container usually sits
 * at range 2-3 of the controller, and a loaded carrier visits it every trip —
 * an off-road final approach would cost 2 ticks/tile on plain and 10 on
 * swamp, every delivery. So tiles adjacent to a depot container (any plan
 * container within 4 of the controller) survive the trim.
 *
 * No exception for the controller LINK: the link moves the energy itself; the
 * ControllerLinkFiller walks to it once per life, same as the upgraders.
 *
 * `rs` (the per-index road stage array, see roadsForRcl) is index-locked to
 * the road array, so the trim filters both with the same keep-mask. A
 * mismatched rs (legacy pack) is passed through untouched — roadsForRcl
 * already treats a length mismatch as "no staging".
 *
 * Pure over packed tiles (pack = x + y*50) so it unit-tests without a Room.
 */

export interface TrimResult {
    road: number[];
    rs?: number[];
    dropped: number;
}

export function trimControllerRoads(
    road: number[],
    rs: number[] | undefined,
    ctrl: { x: number; y: number },
    containers: number[],
): TrimResult {
    if (!road || !road.length) return { road: road || [], rs, dropped: 0 };

    // depot approach: every tile adjacent to a plan container within 4 of the controller
    const keepNear = new Set<number>();
    for (const cp of containers || []) {
        const cx = cp % 50;
        const cy = Math.floor(cp / 50);
        if (Math.max(Math.abs(cx - ctrl.x), Math.abs(cy - ctrl.y)) > 4) continue;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                keepNear.add(cx + dx + (cy + dy) * 50);
            }
        }
    }

    const paired = !!(rs && rs.length === road.length);
    const outRoad: number[] = [];
    const outRs: number[] = [];
    let dropped = 0;
    for (let i = 0; i < road.length; i++) {
        const x = road[i] % 50;
        const y = Math.floor(road[i] / 50);
        const d = Math.max(Math.abs(x - ctrl.x), Math.abs(y - ctrl.y));
        if (d < 4 && !keepNear.has(road[i])) {
            dropped++;
            continue;
        }
        outRoad.push(road[i]);
        if (paired) outRs.push((rs as number[])[i]);
    }
    return { road: outRoad, rs: paired ? outRs : rs, dropped };
}
