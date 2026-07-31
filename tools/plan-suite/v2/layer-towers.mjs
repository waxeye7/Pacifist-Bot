/**
 * Layer 3 — Towers (max-min damage over the finished shell)
 *
 * The shell exists first, so tower placement is a pure optimization. What it
 * optimizes changed: the old layer ran a weighted set-COVER, which maximizes
 * total damage. Total damage is the wrong number. An attacker does not walk
 * into the sum; he walks into the WEAKEST FACE, and set-cover is perfectly
 * happy to pile 3300 damage on the wall beside the hub and leave the far
 * sector on 900 — six towers all past falloff range, 150 apiece. One boosted
 * healer (HEAL 12 parts x 4 boost = 1200 hp/tick) out-heals 900. That corner
 * of the wall is not defended, it is decorated.
 *
 * So the objective is MAX-MIN, ordered and not blended:
 *     1. clear the 1200 floor (two effective towers) if any legal set can
 *     2. maximise the damage on the WEAKEST cut tile
 *     3. among sets that tie on it — and dozens do, damage lands in 30-point
 *        steps — take the one with the flattest wall and the cheapest upkeep:
 *        mean(min(tileDamage, CAP)) minus refill walk and road spur
 * A scalar blend of (2) and (3) was tried first and is a trap: at equal
 * weight the average term buys back a 90-damage hole in the wall with 90
 * damage of surplus where the room was already winning, and 57 of 159 rooms
 * duly traded their weakest face away for a prettier average.
 *
 * Hard constraints, none of them negotiable:
 *   - depth >= 4 (out of a ranged attacker's reach). Towers get NO personal
 *     rampart escape: a ramparted tower is still shot through the rampart.
 *   - refill walk <= MAX_REFILL from the sitter. A tower 12 tiles from
 *     storage is decorative in a siege — the filler cannot keep it wet.
 *   - no two towers D8-adjacent. Adjacent towers share a blast: one nuke,
 *     two towers, and the pair also blocks each other's refill face.
 *   - a free (and preferably D4) face for the refill road, and the finished
 *     set may not strand any interior tile the room had before.
 *
 * Tower damage: 600 at range <=5, linear falloff to 150 at range >=20
 * (TOWER_POWER_ATTACK 600, TOWER_OPTIMAL_RANGE 5, TOWER_FALLOFF_RANGE 20,
 * TOWER_FALLOFF 0.75).
 */
import { D4, D8, buildable, key, walkable } from "./shared.mjs";
import { fieldFrom } from "./layer-hub.mjs";

const N_TOWERS = 6;
const DEPTH_SAFE = 4;

/**
 * REFILL CEILING. The old layer allowed 12 and shipped rooms whose sixth
 * tower sat a 12-tile round trip from storage. At 800 energy a tower burns
 * its magazine in 8 shots; a filler on a 12-walk cannot make that round trip
 * inside the window, so the tower fires eight times per siege and then stands
 * there. 10 is the hard ceiling, 8 is what the scoring actually aims at.
 */
const MAX_REFILL = 10;
/** Only relaxed when a room genuinely has no six legal tiles inside 10. */
const RELAX_REFILL = [12, 14, 18];

/**
 * MIN_SAT — the physical ceiling on one tile: six towers x 600 at optimal
 * range. Saturating the max-min term here means the weakest face is pursued
 * all the way up and nothing is deliberately left on the table. It is a knob
 * rather than a literal because lowering it is the honest way to say "past
 * this the wall holds, spend the rest on upkeep" — 3000 was measured and
 * costs 6 damage of fleet-mean minimum for 35 tiles of filler walk, which was
 * not a trade worth making while the max-min is the owner's stated criterion.
 */
const MIN_SAT = 3600;
/**
 * Concavity knob for the tie-break's evenness term. Damage past CAP is free
 * extra, so a set cannot win the tie-break by stacking a fourth tower's worth
 * of overkill on the wall beside the hub — the only way to score is to lift
 * the tiles that are still short.
 */
const CAP = 2400;
/** The gate the room is expected to clear; below it we declare a shortfall. */
const TARGET_MIN = 1200;

/**
 * Owner call: refill ease is a real weight, not a tiebreak. One extra tile of
 * filler walk is priced at REFILL_W damage-per-wall-tile, and one extra road
 * tile of spur at ROAD_W — roads are forever-upkeep too, and a tower dragged
 * six tiles into a corner to buy 50 damage on one face is a bad trade.
 */
const REFILL_W = 40;
const ROAD_W = 60;
/** a tower whose only road face is diagonal is legal but off-doctrine */
const DIAG_FACE_W = 90;
/** above this the candidate set is thinned by 2x2 block, geometry preserved */
const MAX_CANDS = 260;

function idx(x, y) {
  return x + y * 50;
}

function towerDmg(a, b) {
  const r = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  if (r <= 5) return 600;
  if (r >= 20) return 150;
  return 600 - (r - 5) * 30;
}

export function planTowers(terrain, plan, opts = {}) {
  const refillWeight = opts.refillWeight ?? REFILL_W;
  if (!plan.shell) return { error: "towers need a shell (layer 2 missing)" };
  const depth = plan.depth; // Int16Array from layer 2
  const ext = plan.exterior;

  // TWO different questions, and the old layer answered both with one set.
  //   occupied — tiles that cannot HOLD a tower (something is already there)
  //   blockers — tiles a creep cannot WALK
  // A container is the difference: it is not an OBSTACLE in Screeps, creeps
  // walk over it, and treating it as a wall inflated every refill distance
  // that routed past the hub containers and quietly deleted tiles from the
  // candidate set for being "unreachable". Sources, the controller and the
  // mineral ARE obstacles; so are storage/terminal/link/spawn.
  const occupied = new Set();
  for (const t of ["storage", "terminal", "link", "spawn", "container"]) {
    for (const p of plan.structures[t] || []) occupied.add(key(p.x, p.y));
  }
  occupied.add(key(plan.sitter.x, plan.sitter.y));
  for (const k of plan.objectTiles || []) occupied.add(k); // C1
  const roadSet = new Set(plan.structures.road.map((r) => key(r.x, r.y)));

  const blockers = new Set();
  for (const t of ["storage", "terminal", "link", "spawn"]) {
    for (const p of plan.structures[t] || []) blockers.add(key(p.x, p.y));
  }
  for (const k of plan.objectTiles || []) blockers.add(k);

  const impassable = new Set(blockers);
  const refill = fieldFrom(terrain, plan.sitter, impassable);

  // Distance to the existing layer-1 road net, so the scoring can price the
  // spur this tower would need. A tile already touching a road costs nothing.
  const roadDist = roadField(terrain, roadSet, blockers);

  // Every cut tile is a wall face and every wall face has to be defended.
  // Battlements (where defenders stand) still weigh more, but only in the
  // evenness term — the max-min floor treats all faces alike, because the
  // attacker picks the face, not us.
  const targets = plan.shell.cut.map((c) => ({ x: c.x, y: c.y, w: 1 }));
  const battle = new Set(plan.shell.battlements.map((b) => key(b.x, b.y)));
  for (const t of targets) if (battle.has(key(t.x, t.y))) t.w = 1.5;
  const T = targets.length;
  if (!T) return { error: "shell has no cut tiles" };
  let wSum = 0;
  for (const t of targets) wSum += t.w;

  // ------------------------------------------------------------------
  // CANDIDATES
  // ------------------------------------------------------------------
  /** a tower needs somewhere for the filler to stand and the road to land */
  const faceOf = (x, y, dirs) =>
    dirs.some(([dx, dy]) => walkable(terrain, x + dx, y + dy) && !blockers.has(key(x + dx, y + dy)));

  const gather = (maxRefill) => {
    const out = [];
    for (let y = 2; y <= 47; y++) {
      for (let x = 2; x <= 47; x++) {
        const i = idx(x, y);
        const k = key(x, y);
        if (!buildable(terrain, x, y) || ext[i]) continue;
        if (depth[i] < DEPTH_SAFE) continue;
        if (occupied.has(k) || roadSet.has(k)) continue;
        if (refill[i] > maxRefill || refill[i] >= 9999) continue;
        if (!faceOf(x, y, D8)) continue;
        out.push({ x, y, i, ref: refill[i], d4: faceOf(x, y, D4), spur: Math.max(0, roadDist[i] - 1) });
      }
    }
    return out;
  };

  let cands = gather(MAX_REFILL);
  let refillCap = MAX_REFILL;
  for (const relax of RELAX_REFILL) {
    if (cands.length >= N_TOWERS * 2) break;
    refillCap = relax;
    cands = gather(relax);
  }
  if (cands.length < N_TOWERS) return { error: `only ${cands.length} tower spots (need ${N_TOWERS})` };

  // The candidate set is deliberately NOT score-pruned. A "keep the best N"
  // filter ranks central tiles highest — they cover more wall on their own —
  // so the far sectors lose their representatives before the search starts,
  // and six towers in a blob beside storage is the guaranteed outcome. Only
  // an absurdly open room gets thinned, and then by 2x2 block so the geometry
  // survives the cut.
  if (cands.length > MAX_CANDS) cands = spatialPrune(cands, refillWeight);
  const C = cands.length;

  // damage matrix, candidate-major, so a slot swap is one contiguous scan
  const dmg = new Float32Array(C * T);
  for (let c = 0; c < C; c++) {
    for (let t = 0; t < T; t++) dmg[c * T + t] = towerDmg(cands[c], targets[t]);
  }
  // Per-candidate forever-cost: filler walk, the road spur this tile would
  // need stitched, and the doctrine penalty for a tower that can only take a
  // diagonal road face. Priced in the same units as wall damage so the search
  // trades them against each other explicitly instead of by lexicographic
  // accident.
  const upkeep = new Float64Array(C);
  for (let c = 0; c < C; c++) {
    upkeep[c] = refillWeight * cands[c].ref + ROAD_W * cands[c].spur + (cands[c].d4 ? 0 : DIAG_FACE_W);
  }

  // ------------------------------------------------------------------
  // SEARCH — greedy seed, then steepest-descent single-slot swaps.
  //
  // Everything runs as a delta on one per-target coverage array: evaluating a
  // slot replacement is O(T), not O(6T), which is what makes a full
  // multi-start search affordable inside the compose budget. Candidates are
  // iterated in (y,x) order and improvements need a strict ">", so the result
  // is a deterministic function of the terrain — two runs, one answer.
  // ------------------------------------------------------------------
  const w = new Float64Array(T);
  for (let t = 0; t < T; t++) w[t] = targets[t].w;
  const scratch = new Float64Array(T);
  const evalCover = (cov, up) => {
    let mn = Infinity;
    let ev = 0;
    for (let t = 0; t < T; t++) {
      const v = cov[t];
      if (v < mn) mn = v;
      ev += w[t] * (v < CAP ? v : CAP);
    }
    return { min: mn, sat: mn < MIN_SAT ? mn : MIN_SAT, val: ev / wSum - up / N_TOWERS };
  };
  const coverOf = (set, out) => {
    out.fill(0);
    for (const c of set) {
      const o = c * T;
      for (let t = 0; t < T; t++) out[t] += dmg[o + t];
    }
    return out;
  };
  const upOf = (set) => {
    let u = 0;
    for (const c of set) u += upkeep[c];
    return u;
  };
  const scoreOf = (set) => evalCover(coverOf(set, scratch), upOf(set));

  /**
   * The objective is LEXICOGRAPHIC on the weakest face, and that ordering is
   * the whole point. A scalar blend of "worst face" and "average face" reads
   * like the careful choice and is not: mixed at equal weight, the average
   * term buys back a 90-damage hole in the wall with 90 damage of surplus
   * somewhere it was already winning, and 57 of 159 rooms duly traded their
   * weakest face away. The attacker picks the face; averages do not defend.
   *
   * So: clear the 1200 floor first, then maximise the weakest face, and only
   * once the weakest face is SATURATED (MIN_SAT) does the search spend its
   * remaining freedom on evenness, refill walk and road spurs. Refill is not
   * demoted to a coin-flip by this — damage lands in 30-point steps, so most
   * rooms have many sets tied on the weakest face and the tie-break is what
   * actually chooses among them (fleet refill walk fell 3255 -> 3016).
   */
  const better = (a, b) => {
    if (!b) return true;
    const ta = a.min >= TARGET_MIN ? 1 : 0;
    const tb = b.min >= TARGET_MIN ? 1 : 0;
    if (ta !== tb) return ta > tb;
    if (a.sat !== b.sat) return a.sat > b.sat;
    return a.val > b.val;
  };

  const adjacent = (i, j) =>
    Math.max(Math.abs(cands[i].x - cands[j].x), Math.abs(cands[i].y - cands[j].y)) <= 1;
  const conflicts = (set, c, skip = -1) =>
    set.some((o, si) => si !== skip && (o === c || adjacent(o, c)));

  const partial = new Float64Array(T);
  const trialCov = new Float64Array(T);

  /** greedy: each round takes the candidate that most improves the objective */
  const greedy = (forced) => {
    const set = [];
    partial.fill(0);
    let up = 0;
    const take = (c) => {
      set.push(c);
      up += upkeep[c];
      const o = c * T;
      for (let t = 0; t < T; t++) partial[t] += dmg[o + t];
    };
    if (forced >= 0) take(forced);
    while (set.length < N_TOWERS) {
      let pick = -1;
      let pickSc = null;
      for (let c = 0; c < C; c++) {
        if (conflicts(set, c)) continue;
        const o = c * T;
        for (let t = 0; t < T; t++) trialCov[t] = partial[t] + dmg[o + t];
        const sc = evalCover(trialCov, up + upkeep[c]);
        if (better(sc, pickSc)) {
          pickSc = sc;
          pick = c;
        }
      }
      if (pick < 0) return null; // greedy painted itself into a corner
      take(pick);
    }
    return set;
  };

  /** steepest-descent: swap one slot at a time until nothing improves */
  const localSearch = (set) => {
    let cur = scoreOf(set);
    for (let pass = 0; pass < 16; pass++) {
      let moved = false;
      for (let i = 0; i < N_TOWERS; i++) {
        const oldC = set[i];
        const oldO = oldC * T;
        coverOf(set, partial);
        for (let t = 0; t < T; t++) partial[t] -= dmg[oldO + t];
        const restUp = upOf(set) - upkeep[oldC];
        let bestC = -1;
        let bestSc = cur;
        for (let c = 0; c < C; c++) {
          if (c === oldC || conflicts(set, c, i)) continue;
          const o = c * T;
          for (let t = 0; t < T; t++) trialCov[t] = partial[t] + dmg[o + t];
          const sc = evalCover(trialCov, restUp + upkeep[c]);
          if (better(sc, bestSc)) {
            bestSc = sc;
            bestC = c;
          }
        }
        if (bestC >= 0) {
          set[i] = bestC;
          cur = bestSc;
          moved = true;
        }
      }
      if (!moved) break;
    }
    return { set, sc: cur };
  };

  /**
   * Single-slot descent gets stuck the moment the weakest face needs TWO
   * towers moved to fix it — the first move alone makes the set worse, so it
   * is never taken. This ejects a pair of slots and re-fills both, which is
   * the cheapest move that can cross that ridge: rank the replacements for
   * the first slot, keep the best few, and complete each with the best legal
   * partner. O(K·C·T) per slot pair, not O(C²·T).
   */
  const PAIR_K = 6;
  const pairMove = (set, cur) => {
    let bestSc = cur;
    let bestPair = null;
    for (let i = 0; i < N_TOWERS - 1; i++) {
      for (let j = i + 1; j < N_TOWERS; j++) {
        const rest = set.filter((_, si) => si !== i && si !== j);
        coverOf(rest, partial);
        const restUp = upOf(rest);
        const ranked = [];
        for (let a = 0; a < C; a++) {
          if (conflicts(rest, a)) continue;
          const o = a * T;
          for (let t = 0; t < T; t++) trialCov[t] = partial[t] + dmg[o + t];
          const sc = evalCover(trialCov, restUp + upkeep[a]);
          ranked.push({ a, sat: sc.sat, val: sc.val });
        }
        ranked.sort((p, q) => q.sat - p.sat || q.val - p.val || p.a - q.a);
        for (const { a } of ranked.slice(0, PAIR_K)) {
          const withA = rest.concat([a]);
          coverOf(withA, partial);
          const upA = restUp + upkeep[a];
          for (let b = 0; b < C; b++) {
            if (conflicts(withA, b)) continue;
            const o = b * T;
            for (let t = 0; t < T; t++) trialCov[t] = partial[t] + dmg[o + t];
            const sc = evalCover(trialCov, upA + upkeep[b]);
            if (better(sc, bestSc)) {
              bestSc = sc;
              bestPair = { i, j, a, b };
            }
          }
        }
      }
    }
    if (!bestPair) return null;
    const out = set.slice();
    out[bestPair.i] = bestPair.a;
    out[bestPair.j] = bestPair.b;
    return { set: out, sc: bestSc };
  };

  // Multi-start. Plain greedy is myopic about its FIRST pick — it takes the
  // tile that covers the most wall on its own, which is always a central one,
  // and single-slot descent cannot always walk six towers back out of that
  // basin. So the search is also seeded from the cheapest-to-refill tile, from
  // the two wall sectors that are hardest for ANY legal tile to reach, and
  // from the deepest tile in each quadrant around the sitter.
  //
  // The cheap descent runs on every start; the expensive pair move runs ONCE,
  // on the winner. Running it per start cost 40% of the layer's runtime and
  // changed no room's answer — the pair move fixes a ridge in the final basin,
  // and which start found that basin does not matter.
  const seeds = [
    -1,
    argMin(cands, (c) => c.ref * 4096 + c.y * 64 + c.x),
    ...farSeeds(cands, targets),
    ...quadSeeds(cands, plan.sitter),
  ];
  let best = null;
  let bestSc = null;
  const tried = new Set();
  const seenSet = new Set();
  for (const s of seeds) {
    if (tried.has(s)) continue;
    tried.add(s);
    const g = greedy(s);
    if (!g) continue;
    // two seeds that greedily agree will descend identically — don't pay twice
    const sig = g.slice().sort((a, b) => a - b).join(",");
    if (seenSet.has(sig)) continue;
    seenSet.add(sig);
    let r = localSearch(g);
    // ONE pair move per start, then the winner gets the rest. Measured: pair
    // moves on every start to convergence cost 269ms/room and bought nothing
    // over this (fleet median minimum 2580 either way); dropping them from the
    // starts entirely cost the median a whole falloff step (2550). One ridge
    // crossing per basin is what the search actually needed.
    const p1 = pairMove(r.set, r.sc);
    if (p1) r = localSearch(p1.set);
    if (better(r.sc, bestSc)) {
      bestSc = r.sc;
      best = r.set;
    }
  }
  if (!best) return { error: "no feasible non-adjacent tower set" };
  for (let round = 0; round < 3; round++) {
    const p = pairMove(best, bestSc);
    if (!p) break;
    const r = localSearch(p.set);
    best = r.set;
    bestSc = r.sc;
  }

  // ------------------------------------------------------------------
  // C3 (E20S7): a FREE face is not a REACHABLE face, and six towers must not
  // cost the room interior floor. The old layer only checked that each tower
  // had SOME reachable neighbour — which a tower plugging a one-wide corridor
  // passes while quietly stranding the pocket behind it (and the extension
  // layer then plans into space nothing can walk to). The invariant here is
  // stronger and exact: blocking all six towers may remove exactly those six
  // tiles from the sitter's walk region and nothing else.
  // ------------------------------------------------------------------
  const reachCount = (set) => {
    const blocked = new Set(blockers);
    for (const c of set) blocked.add(key(cands[c].x, cands[c].y));
    const f = fieldFrom(terrain, plan.sitter, blocked);
    let n = 0;
    for (let i = 0; i < 2500; i++) if (f[i] < 9999) n++;
    return { n, f };
  };
  const baseReach = reachCount([]).n;
  const serviceable = (set) => {
    const { n, f } = reachCount(set);
    if (n < baseReach - set.length) return false; // stranded interior floor
    return set.every((c) =>
      D8.some(([dx, dy]) => f[idx(cands[c].x + dx, cands[c].y + dy)] < 9999),
    );
  };
  for (let repair = 0; repair < N_TOWERS && !serviceable(best); repair++) {
    // Find the slot whose removal restores service, then re-fill it with the
    // best-scoring candidate that keeps the whole set serviceable. Candidates
    // are tried in score order so the connectivity BFS runs once or twice,
    // not once per candidate.
    let fixed = false;
    for (let i = 0; i < N_TOWERS && !fixed; i++) {
      const ranked = [];
      for (let c = 0; c < C; c++) {
        if (conflicts(best, c, i)) continue;
        const trial = best.slice();
        trial[i] = c;
        ranked.push({ c, sc: scoreOf(trial) });
      }
      ranked.sort((a, b) => (better(a.sc, b.sc) ? -1 : better(b.sc, a.sc) ? 1 : 0));
      for (const r of ranked.slice(0, 40)) {
        const trial = best.slice();
        trial[i] = r.c;
        if (!serviceable(trial)) continue;
        best = trial;
        fixed = true;
        break;
      }
    }
    if (!fixed) break; // room is genuinely this tight; the shortfall is declared below
  }

  const towers = best.map((c) => ({ x: cands[c].x, y: cands[c].y }));

  // M6: tower[0] is the ONLY tower the room owns from RCL3 to RCL5 — the
  // stretch where a single unrefilled tower is the difference between holding
  // an invader off and losing the room. Coverage is an unordered property of
  // the SET, so the order costs nothing to fix: sort by refill walk and the
  // first tower built is always the one the filler reaches soonest. Ties go
  // by (y,x) so two runs on the same terrain emit the same array.
  towers.sort(
    (a, b) => refill[idx(a.x, a.y)] - refill[idx(b.x, b.y)] || a.y - b.y || a.x - b.x,
  );

  // ------------------------------------------------------------------
  // ROAD FACES
  // C2: ALL six towers block before ANY road is stitched. Adding them one at
  // a time inside the loop meant a later tower's descent path could pave over
  // a tower that was not yet in `impassable` — 40 roads across 37 rooms sat
  // under a tower. Roads ON towers were a real bug; do not reintroduce them.
  // ------------------------------------------------------------------
  const newRoads = [];
  const addRoad = (x, y) => {
    const k = key(x, y);
    if (roadSet.has(k) || occupied.has(k)) return;
    if (!walkable(terrain, x, y) || x < 1 || y < 1 || x > 48 || y > 48) return;
    roadSet.add(k);
    newRoads.push({ x, y });
  };
  for (const tw of towers) {
    impassable.add(key(tw.x, tw.y));
    occupied.add(key(tw.x, tw.y));
  }
  for (const tw of towers) {
    const hasRoad = D8.some(([dx, dy]) => roadSet.has(key(tw.x + dx, tw.y + dy)));
    if (hasRoad) continue;
    // D4 first (a filler on a face is the cheapest refill), diagonal only as
    // a fallback: transfer range is chebyshev, so a corner tile serves the
    // tower, but a D4 face is what the doctrine asks for and what the
    // candidate filter already preferred.
    let face = null;
    for (const dirs of [D4, D8]) {
      for (const [dx, dy] of dirs) {
        const x = tw.x + dx,
          y = tw.y + dy;
        if (!walkable(terrain, x, y) || impassable.has(key(x, y))) continue;
        if (!face || refill[idx(x, y)] < refill[idx(face.x, face.y)]) face = { x, y };
      }
      if (face) break;
    }
    if (!face) continue;
    addRoad(face.x, face.y);
    let cur = face;
    let guard = 0;
    while (refill[idx(cur.x, cur.y)] > 0 && guard++ < 60) {
      let next = null;
      for (const [dx, dy] of D8) {
        const x = cur.x + dx,
          y = cur.y + dy;
        if (!walkable(terrain, x, y) || impassable.has(key(x, y))) continue;
        if (refill[idx(x, y)] >= refill[idx(cur.x, cur.y)]) continue;
        if (!next || refill[idx(x, y)] < refill[idx(next.x, next.y)]) next = { x, y };
      }
      if (!next) break;
      if (roadSet.has(key(next.x, next.y))) break; // reached the network
      addRoad(next.x, next.y);
      cur = next;
    }
  }

  // ------------------------------------------------------------------
  // STATS + HONEST SHORTFALL
  // ------------------------------------------------------------------
  let mn = Infinity;
  let sum = 0;
  let weak = 0;
  for (const t of targets) {
    let s = 0;
    for (const tw of towers) s += towerDmg(tw, t);
    if (s < mn) mn = s;
    if (s < TARGET_MIN) weak++;
    sum += s;
  }
  const refills = towers.map((t) => refill[idx(t.x, t.y)]);
  const maxRefill = Math.max(...refills);
  const cx = towers.reduce((a, t) => a + t.x, 0) / N_TOWERS;
  const cy = towers.reduce((a, t) => a + t.y, 0) / N_TOWERS;
  const spreadRadius =
    Math.round(
      Math.max(...towers.map((t) => Math.max(Math.abs(t.x - cx), Math.abs(t.y - cy)))) * 10,
    ) / 10;

  // A two-lobed shell can put a wall sector further from every legal deep
  // tile than the falloff range allows. That is the room beating the planner,
  // and it is declared rather than quietly shipped — the validator's
  // declared-shortfall channel turns it into a loud pass-with-note.
  const shortfalls = [];
  if (mn < TARGET_MIN) {
    shortfalls.push({
      gate: "towerCoverage",
      detail:
        `weakest wall face sees ${mn} damage (want >= ${TARGET_MIN}); ${weak}/${T} cut ` +
        `tiles are under target. Every legal tile is depth >= ${DEPTH_SAFE} and within ` +
        `${refillCap} refill walk, and no six of them cover this shell's far lobe ` +
        `inside tower falloff range (150 damage past chebyshev 20).`,
      tiles: [],
    });
  }
  if (maxRefill > MAX_REFILL) {
    shortfalls.push({
      gate: "towerRefill",
      detail:
        `furthest tower is ${maxRefill} walk from the sitter (want <= ${MAX_REFILL}); ` +
        `the room has no six legal deep tiles inside that radius`,
      tiles: [],
    });
  }

  return {
    layer: "towers",
    tower: towers,
    roads: newRoads,
    shortfalls,
    towersMeta: {
      minShellDmg: mn,
      avgShellDmg: Math.round(sum / T),
      weakTiles: weak,
      refillDists: refills,
      maxRefill,
      spreadRadius,
      newRoads: newRoads.length,
      candidates: C,
    },
  };
}

/** walk distance to the nearest existing road tile (structures block) */
function roadField(terrain, roadSet, occupied) {
  const dist = new Int16Array(2500).fill(9999);
  const q = [];
  for (const k of roadSet) {
    const [x, y] = k.split(",").map(Number);
    const i = idx(x, y);
    if (dist[i] === 0) continue;
    dist[i] = 0;
    q.push(i);
  }
  let qi = 0;
  while (qi < q.length) {
    const i = q[qi++];
    const x = i % 50,
      y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      if (!walkable(terrain, nx, ny)) continue;
      const ni = nx + ny * 50;
      if (dist[ni] <= dist[i] + 1) continue;
      dist[ni] = dist[i] + 1;
      // a tile under a hub structure conducts nothing further
      if (!occupied.has(key(nx, ny))) q.push(ni);
    }
  }
  return dist;
}

/**
 * Keep the best tile per 2x2 block. A flat "top N by score" prune is what
 * collapsed the old candidate set onto the hub — the highest-scoring tiles
 * are all central, so the far wall never had a representative to pick. This
 * keeps the geography and only thins the redundancy inside it.
 */
function spatialPrune(cands, refillWeight) {
  const byBlock = new Map();
  for (const c of cands) {
    const b = ((c.y >> 1) << 6) | (c.x >> 1);
    const cost = refillWeight * c.ref + ROAD_W * c.spur + (c.d4 ? 0 : DIAG_FACE_W);
    const prev = byBlock.get(b);
    if (!prev || cost < prev.cost) byBlock.set(b, { c, cost });
  }
  const out = [...byBlock.values()].map((v) => v.c);
  out.sort((a, b) => a.y - b.y || a.x - b.x);
  return out;
}

function argMin(arr, f) {
  let bi = -1;
  let bv = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = f(arr[i]);
    if (v < bv) {
      bv = v;
      bi = i;
    }
  }
  return bi;
}

/**
 * Seeds from the wall's point of view: the two cut tiles that are hardest for
 * ANY legal tile to reach are the ones greedy will abandon first, so a start
 * anchored beside each of them explores the basin greedy never visits.
 */
function farSeeds(cands, targets) {
  const ranked = targets
    .map((t, ti) => {
      let near = Infinity;
      for (const c of cands) {
        const d = Math.max(Math.abs(c.x - t.x), Math.abs(c.y - t.y));
        if (d < near) near = d;
      }
      return { ti, near };
    })
    .sort((a, b) => b.near - a.near || a.ti - b.ti);
  return ranked.slice(0, 2).map((r) => {
    const t = targets[r.ti];
    return argMin(
      cands,
      (c) => Math.max(Math.abs(c.x - t.x), Math.abs(c.y - t.y)) * 4096 + c.y * 64 + c.x,
    );
  });
}

/**
 * One seed per quadrant around the sitter — the cheapest way to make sure the
 * search has at least tried starting in each sector of the room, which is the
 * failure mode the blob came from.
 */
function quadSeeds(cands, sitter) {
  const out = [];
  for (const [sx, sy] of D4) {
    const pool = cands.filter((c) => (sx ? Math.sign(c.x - sitter.x) === sx : Math.sign(c.y - sitter.y) === sy));
    if (!pool.length) continue;
    const pick = pool.reduce((a, b) => {
      const da = Math.max(Math.abs(a.x - sitter.x), Math.abs(a.y - sitter.y));
      const db = Math.max(Math.abs(b.x - sitter.x), Math.abs(b.y - sitter.y));
      if (db !== da) return db > da ? b : a;
      return b.y * 64 + b.x < a.y * 64 + a.x ? b : a;
    });
    out.push(cands.indexOf(pick));
  }
  return out;
}
