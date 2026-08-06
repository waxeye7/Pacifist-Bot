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
import { D4, D8, buildable, key, mineralGuard, reservedTiles, walkable } from "./shared.mjs";
import { fieldFrom } from "./layer-hub.mjs";
// DECLARATION PROSE IS GENERATED, NOT WRITTEN — see the header of declprose.mjs.
// Both of this layer's declarations used to build their paragraph inline out of
// the search's own locals, which is exactly the shape that let a paragraph and
// its record drift: the numbers in the sentence came from variables, the numbers
// in the audit came from fields, and nothing ever compared the two. `renderDecl`
// generates the paragraph FROM the published record, and the validator runs the
// same function on the record the plan ships and requires the result to be equal.
import { renderDecl } from "./declprose.mjs";
import {
  MOBILITY_TARGET,
  boardMobility,
  boardWalkMask,
  breachesGate,
  detourFreeSet,
} from "./layer-shell.mjs";

const N_TOWERS = 6;
const DEPTH_SAFE = 4;

/**
 * REFILL CEILING. The old layer allowed 12 and shipped rooms whose sixth
 * tower sat a 12-tile round trip from storage. At 800 energy a tower burns
 * its magazine in 8 shots; a filler on a 12-walk cannot make that round trip
 * inside the window, so the tower fires eight times per siege and then stands
 * there. 10 is the hard ceiling, 8 is what the scoring actually aims at.
 */
export const MAX_REFILL = 10;
/** `fieldFrom`'s unreachable sentinel (layer-hub's INF) — a walk, not a number */
const REFILL_INF = 999;
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
export const TARGET_MIN = 1200;
/**
 * The line between "legal" and "what the fleet actually gets" — see the
 * weak-battery declaration at the bottom of this file. Both numbers are read
 * off the fleet, not invented: 152/159 rooms clear 1800 on their weakest wall
 * face, and the median furthest-tower refill walk is 1.
 */
export const WEAK_SHELL_DMG = 1800;
export const REFILL_NOTE = 8;

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
/**
 * WHAT THE NUKE-DISPERSION POST-PASS MAY SPEND ON THE TIE-BREAK, and it lives at
 * module scope now because the clump DECLARATION quotes it. It used to be a
 * `const` buried inside the dispersion block and the declaration said "one
 * 30-point damage step" as a hand-typed literal — two copies of one number, in
 * two scopes, with nothing keeping them equal. That is the same defect class as
 * a paragraph that quotes its own record from memory, so the number has exactly
 * one home and both the search and the generated prose read it from here.
 *
 * The value is one damage step, which is the granularity tower damage lands in
 * anyway: a swap that reads as "the same battery" to the objective is allowed to
 * also be the one a nuke reaches less of. Demanding an EXACT tie was tried first
 * and buys nothing — `val` is a float mean and two genuinely equivalent sets
 * almost never produce the same bits.
 */
const NUKE_TIEBREAK_BUDGET = 30;

/**
 * At what clump size a room owes the reader the search it ran.
 *
 * FIVE, not four. 93 of 172 rooms hold 3 of 6 towers inside chebyshev 2 and
 * 34 hold 4 — at those densities the shape is the interior, not a choice, and
 * a channel that fires 34 times about "some towers are near the hub" is noise
 * competing with the eco and mobility declarations for the same reader. The
 * finding is about the six rooms that put FIVE of six in one 5x5-sized huddle
 * and reported `before == after` while doing it; that is the number this
 * declares, and it declares all six.
 *
 * EXPORTED, and at module scope, because layer 7 re-derives the huddle over the
 * board the room actually ships and the generated paragraph re-derives "is this
 * room over the line" from the count and the line together. Two copies of a
 * threshold in two files is how a declaration and its audit end up disagreeing
 * about what triggered it, which is the whole of the defect this planner keeps
 * finding in itself; there is one copy and both readers import it.
 */
export const CLUMP_NOTE = 5;

function idx(x, y) {
  return x + y * 50;
}

function towerDmg(a, b) {
  const r = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  if (r <= 5) return 600;
  if (r >= 20) return 150;
  return 600 - (r - 5) * 30;
}

/**
 * Total battery damage on every tile of a wall, and the weakest of them.
 *
 * Split out of planTowers in round 5 so it can be re-run at layer 7 on the wall
 * the room ACTUALLY ships. Layer 3 measures the wall layer 2 handed it; layer 7's
 * inert prune and seal reconciliation can both change which tiles carry the seal,
 * and a weakest-face number computed on a wall that no longer exists is not a
 * measurement, it is a leftover. Same arithmetic, one definition, two call sites.
 */
export function shellDamage(towers, cut, floor = TARGET_MIN) {
  let mn = Infinity;
  let sum = 0;
  let weak = 0;
  let worst = null;
  for (const c of cut) {
    let s = 0;
    for (const tw of towers) s += towerDmg(tw, c);
    if (s < mn) {
      mn = s;
      worst = { x: c.x, y: c.y };
    }
    if (s < floor) weak++;
    sum += s;
  }
  const n = cut.length || 1;
  return { min: cut.length ? mn : 0, avg: Math.round(sum / n), weak, worst, tiles: cut.length };
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
  // THE TILES NO BLOCKING STRUCTURE MAY TAKE — the controller claim seat and
  // its approach, the mineral stand and its approach, and the upgrader park
  // seats this room holds to its floor. See reservedTiles in shared.mjs.
  const reserved = reservedTiles(plan);
  const roadSet = new Set(plan.structures.road.map((r) => key(r.x, r.y)));
  // ...and the one room object whose work seat this layer can seal. A tower on
  // 39,19 is one third of why E9S9 entombed its mineral. See mineralGuard.
  const mGuard = mineralGuard(terrain, plan);
  const standBlocked = new Set(plan.objectTiles || []);
  for (const ty of ["storage", "terminal", "link", "spawn", "lab"]) {
    for (const q of plan.structures[ty] || []) standBlocked.add(key(q.x, q.y));
  }

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
        if (occupied.has(k) || roadSet.has(k) || reserved.has(k)) continue;
        if (!mGuard.ok({ x, y }, standBlocked)) continue;
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
  const pairMove = (set, cur, K = PAIR_K) => {
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
        for (const { a } of ranked.slice(0, K)) {
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
  const settled = []; // every start's local optimum — the escalation re-enters these
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
    settled.push({ set: r.set.slice(), sc: r.sc });
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
  // ESCALATION — and the reason the declaration needed one.
  //
  // The weak-battery declaration used to end "no other six of those C seats
  // cover this shell better". That was a claim about the SEARCH SPACE made by a
  // search that had not covered it: greedy from a handful of starts, single-slot
  // steepest descent, and three rounds of pairwise ejection with the partner
  // list truncated to the best PAIR_K=6. A reviewer beat 10 of the 16 declaring
  // rooms by hand — E8S5 1440 -> 1530, E13S8 better on BOTH the weakest face and
  // the refill walk. A declaration that is beatable by hand is not a declaration,
  // it is an excuse.
  //
  // Two ways to fix a claim: search harder, or say less. This does both. When
  // the settled battery lands under WEAK_SHELL_DMG on the weakest face or past
  // REFILL_NOTE on the furthest refill — i.e. exactly when the room is about to
  // declare — the search re-enters EVERY start's local optimum and runs pairwise
  // ejection to CONVERGENCE with the partner list widened to ESC_PAIR_K, instead
  // of three truncated rounds on one of them. It is bounded (ESC_ROUNDS is a hard
  // stop), it is deterministic (same iteration order, same strict ">"), and it
  // only runs in the rooms that were going to make the claim, so the fleet's
  // runtime is unchanged everywhere else.
  //
  // And the claim itself now states what was actually searched — starts, rounds,
  // partner width, whether it converged — rather than asserting optimality the
  // search cannot prove. The honest sentence is "greedy + N swap rounds", and it
  // is generated from the counters below.
  // ------------------------------------------------------------------
  // MEASURED OPERATING POINT, not a guess. On the seven rooms that declare, the
  // escalation was swept at (K, rounds, restarts) = (12,6,12), (24,8,16) and
  // (48,10,24): all three return the IDENTICAL six answers, at 8.5s / 15.8s /
  // 38.7s of planner time against 3.9s with the escalation off. The search
  // saturates at the cheapest setting, so paying 4x for the same answer would be
  // theatre. What the cheapest setting buys over no escalation at all is three
  // of the seven rooms: E12S1 1890 -> 1950, E7S8 1890 -> 1920, E5S3 2040 -> 2070.
  // E8S5 (1440) and E13S8 (1710) do not move at ANY of the three settings — see
  // the declaration text, which now says that instead of claiming optimality.
  const ESC_PAIR_K = 12;
  const ESC_ROUNDS = 6;
  const ESC_RESTARTS = 12;
  const weakNow = () => {
    const refills0 = best.map((c) => cands[c].ref);
    return bestSc.min < WEAK_SHELL_DMG || Math.max(...refills0) > REFILL_NOTE;
  };
  const escalation = { ran: false };
  if (weakNow()) {
    const before = { min: bestSc.min, val: bestSc.val };
    let rounds = 0;
    let improved = 0;
    let converged = true;
    for (const st of settled) {
      let cur = { set: st.set.slice(), sc: st.sc };
      let r = 0;
      for (; r < ESC_ROUNDS; r++) {
        const p = pairMove(cur.set, cur.sc, ESC_PAIR_K);
        if (!p) break;
        cur = localSearch(p.set);
      }
      if (r >= ESC_ROUNDS) converged = false;
      rounds += r;
      if (better(cur.sc, bestSc)) {
        bestSc = cur.sc;
        best = cur.set.slice();
        improved++;
      }
    }
    // RANDOM RESTARTS, deterministically seeded. Pairwise ejection crosses a
    // two-tower ridge; a room whose weakest face needs THREE towers moved is
    // still stuck, and the seeded starts all live in the same few basins (they
    // are all derived from the same geometry). A fixed-seed LCG samples legal
    // 6-sets from elsewhere in the space and descends each one. Seeded from a
    // constant and iterated in a fixed order, so it is a pure function of the
    // terrain: two runs, one answer, and the determinism check still holds.
    let rng = 0x9e3779b9;
    const nextRand = () => {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      return rng / 4294967296;
    };
    for (let restart = 0; restart < ESC_RESTARTS; restart++) {
      const set = [];
      for (let tries = 0; tries < 400 && set.length < N_TOWERS; tries++) {
        const c = Math.floor(nextRand() * C);
        if (conflicts(set, c)) continue;
        set.push(c);
      }
      if (set.length < N_TOWERS) continue;
      set.sort((a, b) => a - b);
      let cur = localSearch(set);
      for (let r = 0; r < ESC_ROUNDS; r++) {
        const p = pairMove(cur.set, cur.sc, ESC_PAIR_K);
        if (!p) break;
        cur = localSearch(p.set);
        rounds++;
      }
      if (better(cur.sc, bestSc)) {
        bestSc = cur.sc;
        best = cur.set.slice();
        improved++;
      }
    }
    escalation.ran = true;
    escalation.restarts = ESC_RESTARTS;
    escalation.starts = settled.length;
    escalation.rounds = rounds;
    escalation.pairK = ESC_PAIR_K;
    escalation.converged = converged;
    escalation.improvedFrom = before.min;
    escalation.improvedTo = bestSc.min;
    escalation.improvements = improved;
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

  // ------------------------------------------------------------------
  // NUKE DISPERSION — a soft term, spent only on freedom the objective has left.
  //
  // A nuke does full damage over a 5x5 and half over 11x11, it cannot be shot
  // down, and the only counter is a rampart thick enough to eat it. So the
  // question "how much of the RCL8 program does ONE nuke reach" is a real
  // property of a layout, and nothing in this planner had ever looked at it. On
  // the round-8 fleet the worst 5x5 window holds TWELVE high-value structures
  // (E6S9 at 27,30) with a fleet median of 8, counting spawn / storage /
  // terminal / nuker / tower and excluding the lab diamond, which is a mandated
  // 4x4 stamp and cannot be dispersed by definition.
  //
  // Most of that concentration is mandated too: the hub trio is one tile of
  // storage, terminal and link by construction (the sitter reaches all three),
  // and the spawn fan is grown around it. What is FREE is where the towers go —
  // and the max-min search leaves a great deal of freedom, because damage lands
  // in 30-point steps and dozens of sets tie.
  //
  // So this is a strictly non-worsening post-pass, never a term in the
  // objective: a swap is taken only when the set's whole lexicographic score is
  // UNCHANGED (same floor, same saturation, same tie-break value) and the worst
  // 5x5 window gets smaller. A room whose geometry gives it no such swap keeps
  // the battery it had — the owner's "unavoidable in tight rooms" — and no hard
  // gate, no coverage number and no refill walk can move by construction.
  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // WHAT THIS PASS CAN SEE, SAID OUT LOUD — AND WHAT IT THEREFORE MAY NOT CLAIM.
  //
  // This array used to read ["spawn","storage","terminal","nuker"] and the field
  // it fed was published as `nukeWindow`, documented as "the fullest 5x5 window
  // over spawn/storage/terminal/nuker/tower". The nuker is placed by layer 5,
  // TWO LAYERS LATER, so `plan.structures.nuker` is empty every single time this
  // runs and the published number counted spawn/storage/terminal/tower only.
  // Measured: the shipped window exceeds the published `after` by exactly 1 in
  // 145 of 172 rooms (E6S1 and E6S9 ship 11 and published 10), and the nuker
  // sits inside its own room's worst 5x5 in 154 of 172 — so the freedom layer 5
  // was told to spend on dispersion was being spent blind, and the goal doc's
  // fleet headline (worst 11, mean 7.97, which is the TRUE number) was
  // inconsistent with the per-room meta it summarised (max 10, mean 7.13).
  //
  // The nuker is dropped from this list because it is not a lie waiting to
  // happen — it is an empty array — and the number this pass produces is
  // republished under a name that says what it is: `towerDispersion`, the
  // freedom LAYER 3 had and what it spent. `meta.towers.nukeWindow` is
  // recomputed after layer 5 over the full set (see recomputeNukeWindow in
  // pipeline.mjs) and the validator re-derives it from the shipped structures.
  // ------------------------------------------------------------------
  const HIGH_VALUE = ["spawn", "storage", "terminal"];
  const fixedHV = [];
  for (const t of HIGH_VALUE) for (const p of plan.structures[t] || []) fixedHV.push(p);
  /** the fullest 5x5 window over the fixed high-value mass plus this tower set */
  const windowMax = (set) => {
    const pts = fixedHV.concat(set.map((c) => ({ x: cands[c].x, y: cands[c].y })));
    let mx = 0;
    for (const a of pts) {
      // every maximal window contains some structure, so centring on each of
      // them and sweeping the 5x5 offsets around it covers all of them
      for (let ox = -2; ox <= 2; ox++) {
        for (let oy = -2; oy <= 2; oy++) {
          const cx = a.x + ox,
            cy = a.y + oy;
          let n = 0;
          for (const b of pts) if (Math.abs(b.x - cx) <= 2 && Math.abs(b.y - cy) <= 2) n++;
          if (n > mx) mx = n;
        }
      }
    }
    return mx;
  };
  const nukeBefore = windowMax(best);
  let nukeAfter = nukeBefore;
  /** what the dispersion search actually tried, so a room that fails can say so */
  const nukeSearch = {
    singleSwapsTried: 0,
    singleSwapsScoreTied: 0,
    pairSwapsTried: 0,
    pairSwapsScoreTied: 0,
    rounds: 0,
    improvedBy: 0,
    pairImproved: 0,
  };
  /**
   * ...and the same for the self-blocked refill repair below: what it measured
   * before, what it tried, what the price refused, and where it ended. A room
   * that still walks past REFILL_NOTE quotes these counters in its declaration.
   */
  const refillSearch = {
    before: null,
    after: null,
    rounds: 0,
    tried: 0,
    scoreTied: 0,
    dispersionOk: 0,
    moved: 0,
  };
  /**
   * ...and for the defender-lap veto: whether the battery was even capable of
   * lengthening a walk, what it read if it was, and what the search cost.
   */
  const mobilityVeto = {
    checked: false,
    provedFree: false,
    baseLap: null,
    baseOver: null,
    lapWithBattery: null,
    overWithBattery: null,
    breached: false,
    rounds: 0,
    tried: 0,
    scoreTied: 0,
    affordable: 0,
    moved: 0,
  };
  {
    // WHAT THE DISPERSION PASS IS ALLOWED TO SPEND, stated as a price.
    //
    // The weakest face and its saturation are NOT negotiable and are compared
    // exactly: this pass may not cost the wall one point of the number the whole
    // layer is built around. The tie-break — evenness minus refill walk and road
    // spur — may fall by at most one damage step, which is the granularity
    // tower damage lands in anyway, so a swap that reads as "the same battery"
    // to the objective is allowed to also be the one a nuke reaches less of.
    // Demanding an EXACT tie was tried first and buys nothing: `val` is a float
    // mean and two genuinely equivalent sets almost never produce the same bits.
    // NUKE_TIEBREAK_BUDGET is at module scope because the clump declaration
    // quotes it — see the comment there.
    const same = (a, b) =>
      (a.min >= TARGET_MIN) === (b.min >= TARGET_MIN) &&
      a.min >= b.min &&
      a.sat >= b.sat &&
      a.val >= b.val - NUKE_TIEBREAK_BUDGET;
    // ------------------------------------------------------------------
    // A REAL ATTEMPT, NOT A GESTURE.
    //
    // This was a FIRST-IMPROVEMENT single-slot hill climb: it took the first
    // swap that helped and restarted, and it stopped the moment no single slot
    // could move alone. 93 of 172 rooms still put >= 3 of 6 towers within
    // chebyshev 2 of the sitter and SIX put 5 of 6 — E11S6, E14S1, E1S7, E2S5,
    // E3S5, E6S1 — and in all six this pass reported `before == after`, i.e. it
    // looked and found nothing. Those same six hold the fleet's worst nuke
    // windows (E6S1 11, E11S6 10, E1S7 10). "I tried and there was nothing" is
    // a claim about a search, so the search has to be worth the claim:
    //
    //   BEST-IMPROVEMENT, not first. A first-improvement step can take a swap
    //     that saves one and blocks the swap that would have saved three.
    //   PAIRWISE, when singles stall. A clump is frequently held in place by
    //     two towers that each individually have nowhere to go — moving either
    //     alone breaks the max-min floor — while the pair has somewhere to go
    //     together. Bounded: it runs only after single swaps converge, and only
    //     over the score-tied candidate lists that the single pass already
    //     built, so the cost is a few thousand window evaluations in the worst
    //     room and none at all in a room the singles already solved.
    //
    // The price is unchanged and non-negotiable: the weakest face and the
    // saturation are compared exactly, and the tie-break may fall by at most one
    // damage step. A room that still cannot move DECLARES, with these counters
    // as the evidence (see the clump shortfall below).
    // ------------------------------------------------------------------
    for (let pass = 0; pass < 8; pass++) {
      nukeSearch.rounds++;
      let bestTrial = null;
      let bestW = nukeAfter;
      for (let si = 0; si < best.length; si++) {
        const cur = best[si];
        for (let c = 0; c < C; c++) {
          if (c === cur || conflicts(best, c, si)) continue;
          const trial = best.slice();
          trial[si] = c;
          nukeSearch.singleSwapsTried++;
          if (!same(scoreOf(trial), bestSc)) continue;
          nukeSearch.singleSwapsScoreTied++;
          const w = windowMax(trial);
          if (w < bestW) {
            bestW = w;
            bestTrial = trial;
          }
        }
      }
      if (!bestTrial) break;
      best = bestTrial;
      nukeAfter = bestW;
    }
    // ...and now the pairs, for the clumps a single tower cannot leave alone.
    //
    // BOUNDED ON PURPOSE, TWICE OVER. It runs only in a room that is still
    // holding a window at or above NUKE_PAIR_FLOOR — the fleet median, i.e.
    // exactly the rooms the finding is about — and each slot offers at most
    // NUKE_PAIR_K partners, ranked by the window their own single swap would
    // leave (ties by candidate index, so the ranking is deterministic). Without
    // both caps this is 15 slot-pairs times two candidate lists of ~50, which is
    // tens of thousands of max-min evaluations for a soft objective.
    const NUKE_PAIR_FLOOR = 8;
    const NUKE_PAIR_K = 12;
    for (let pass = 0; pass < 3 && nukeAfter >= NUKE_PAIR_FLOOR; pass++) {
      let bestTrial = null;
      let bestW = nukeAfter;
      // the score-tied replacements available to each slot, ranked and capped
      const tied = [];
      for (let si = 0; si < best.length; si++) {
        const list = [];
        for (let c = 0; c < C; c++) {
          if (c === best[si] || conflicts(best, c, si)) continue;
          const trial = best.slice();
          trial[si] = c;
          if (!same(scoreOf(trial), bestSc)) continue;
          list.push({ c, w: windowMax(trial) });
        }
        list.sort((a, b) => a.w - b.w || a.c - b.c);
        tied.push(list.slice(0, NUKE_PAIR_K).map((e) => e.c));
      }
      for (let si = 0; si < best.length; si++) {
        for (let sj = si + 1; sj < best.length; sj++) {
          for (const ci of tied[si]) {
            for (const cj of tied[sj]) {
              if (ci === cj) continue;
              const trial = best.slice();
              trial[si] = ci;
              trial[sj] = cj;
              // conflicts() is a pairwise test against the CURRENT set, so a
              // two-slot move has to be re-checked against the set it makes
              if (conflicts(trial, ci, si) || conflicts(trial, cj, sj)) continue;
              nukeSearch.pairSwapsTried++;
              if (!same(scoreOf(trial), bestSc)) continue;
              nukeSearch.pairSwapsScoreTied++;
              const w = windowMax(trial);
              if (w < bestW) {
                bestW = w;
                bestTrial = trial;
              }
            }
          }
        }
      }
      if (!bestTrial) break;
      best = bestTrial;
      nukeAfter = bestW;
      nukeSearch.pairImproved++;
    }
    nukeSearch.improvedBy = nukeBefore - nukeAfter;

    // ------------------------------------------------------------------
    // THE REFILL WALK, MEASURED WITH THE BATTERY STANDING IN IT.
    //
    // `refill` above is a field taken from the sitter over a board that blocks
    // storage / terminal / link / spawn and the room objects — and NOT the six
    // towers, because when it is computed there are no towers yet. That is the
    // right field to GATHER candidates on (a tile's reachability is a property
    // of the tile) and it is the wrong one to PUBLISH, because a tower is an
    // OBSTACLE_OBJECT_TYPE and the other five stand between the filler and this
    // one. 91 of 172 rooms hold three or more towers inside chebyshev 2 of the
    // sitter, so this is not an edge case: the battery routinely walls itself in.
    //
    // Two rooms shipped a silent shortfall because of it. E12S4 published
    // refillDists [1,7,2,2,3,4] and walks [1,9,2,2,3,4]; E18S3 published
    // [1,4,2,3,4,6] and walks [1,4,2,3,4,9]. Both are over the 8-step
    // REFILL_NOTE line the fleet declares on, and neither said a word — while
    // E8S4, at the same as-built number, did. Lifting the towers out of the
    // as-built board reproduces the published array exactly in both rooms, so
    // the towers are the whole difference.
    //
    // So the number this layer publishes is the SELF-BLOCKED one, and when it
    // breaks the note the layer does what it already does for nuke dispersion:
    // it searches its own candidate list for a seat that fixes it, under a price
    // it may not exceed — the weakest face and the saturation compared exactly
    // (`same`), and the nuke window not worsened. Layer 7 re-derives the same
    // walk over the FULL as-built board (labs, extensions, the nuker and the
    // observer are obstacles too) and that reading is the number of record.
    // ------------------------------------------------------------------
    const arriveField = (f, t) => {
      const v = f[idx(t.x, t.y)];
      if (v < REFILL_INF) return v;
      let bestD = REFILL_INF;
      for (const [dx, dy] of D8) {
        const x = t.x + dx,
          y = t.y + dy;
        if (x < 0 || y < 0 || x > 49 || y > 49) continue;
        const w = f[idx(x, y)];
        if (w < REFILL_INF && w + 1 < bestD) bestD = w + 1;
      }
      return bestD;
    };
    /** the filler's walk to each seat of `set`, with all of `set` standing */
    const selfBlockedRefills = (set) => {
      const blk = new Set(impassable);
      for (const c of set) blk.add(key(cands[c].x, cands[c].y));
      const f = fieldFrom(terrain, plan.sitter, blk);
      return set.map((c) => arriveField(f, cands[c]));
    };
    refillSearch.before = Math.max(...selfBlockedRefills(best));
    refillSearch.after = refillSearch.before;
    if (refillSearch.before > REFILL_NOTE) {
      for (let pass = 0; pass < 4 && refillSearch.after > REFILL_NOTE; pass++) {
        refillSearch.rounds++;
        let pick = null;
        let pickMax = refillSearch.after;
        // EVERY SLOT, not just the slow one. The walk is long precisely BECAUSE
        // the other five towers are standing in it, so the seat that has to move
        // is frequently not the seat that is far away — E12S4's furthest tower is
        // walled in by the two beside the sitter. Six slots times this room's
        // candidate list is a few hundred score evaluations, and only the handful
        // that clear the price above pay for a distance field.
        for (let si = 0; si < best.length; si++)
        for (let c = 0; c < C; c++) {
          if (c === best[si] || conflicts(best, c, si)) continue;
          const trial = best.slice();
          trial[si] = c;
          refillSearch.tried++;
          // THE PRICE, and it is not quite the dispersion pass's price. The
          // weakest wall face and the saturation are compared EXACTLY, as
          // always — those are what the layer is for. The remaining tie-break
          // `val` is "evenness minus refill walk minus road spur", i.e. a
          // number that already contains the quantity being repaired, so
          // holding it fixed while explicitly buying refill walk would be
          // refusing the trade on the grounds that it is a trade. It is free
          // here and nowhere else.
          const sc = scoreOf(trial);
          if ((sc.min >= TARGET_MIN) !== (bestSc.min >= TARGET_MIN)) continue;
          if (sc.min < bestSc.min || sc.sat < bestSc.sat) continue;
          refillSearch.scoreTied++;
          if (windowMax(trial) > nukeAfter) continue;
          refillSearch.dispersionOk++;
          const mx = Math.max(...selfBlockedRefills(trial));
          if (mx < pickMax) {
            pickMax = mx;
            pick = trial;
          }
        }
        if (!pick) break;
        best = pick;
        refillSearch.after = pickMax;
        refillSearch.moved++;
      }
      nukeAfter = windowMax(best);
    }

    // ------------------------------------------------------------------
    // THE BATTERY READS THE DEFENDER'S LAP — because the lift test says it has to.
    //
    // Layer 7 runs a whole-room LIFT TEST on the finished base: lift every
    // structure whose position this planner chose, re-run the entire mobility
    // metric, and if the gate clears then the miss is ours and the guilty class
    // is named by lifting classes one at a time. It is an honest instrument —
    // round 10 reproduced every one of its per-class numbers independently — and
    // that is exactly what made the old behaviour indefensible: rooms shipped a
    // mobility DECLARATION whose own evidence said "lifting the tower battery
    // alone takes this room to 0", and the planner filed it as an accepted
    // exception. E4S8 was the sharpest: one tower, one tile, 1.5 against a 1.2
    // target — in a layer that already enumerates 600-1400 tower swaps per room
    // for nuke dispersion and had simply never read a lap.
    //
    // A declaration is an accepted exception only when the thing is genuinely
    // impossible. So the attempt happens HERE, where the tower positions are
    // still free, under the same non-negotiable price as everything else in this
    // block: the weakest wall face and the saturation compared exactly.
    //
    // WHY THIS IS AFFORDABLE. `detourFreeSet` proves, in one pass over eight
    // neighbours per tile, that blocking a tile set cannot lengthen any interior
    // walk — so the expensive all-pairs measurement is only paid for by the
    // handful of batteries that sit in a genuine corridor pinch, and the swap
    // search is only paid for by the ones that then actually breach.
    // ------------------------------------------------------------------
    const walkBase = boardWalkMask(terrain, plan, null);
    const towerTilesOf = (set) => set.map((c) => ({ x: cands[c].x, y: cands[c].y }));
    const keysOf = (set) => set.map((c) => key(cands[c].x, cands[c].y));
    if (walkBase && plan.shell?.cut?.length) {
      mobilityVeto.checked = true;
      if (detourFreeSet(walkBase, towerTilesOf(best))) {
        mobilityVeto.provedFree = true;
      } else {
        const base = boardMobility(terrain, plan, null);
        let trial = boardMobility(terrain, plan, keysOf(best));
        mobilityVeto.baseLap = base ? base.maxGated : null;
        mobilityVeto.baseOver = base ? base.overGated : null;
        mobilityVeto.lapWithBattery = trial ? trial.maxGated : null;
        mobilityVeto.overWithBattery = trial ? trial.overGated : null;
        if (base && trial && breachesGate(base, trial)) {
          mobilityVeto.breached = true;
          // Bounded on purpose: only score-tied, dispersion-non-worsening
          // candidates are ever measured, and at most MOBILITY_TRIALS of them.
          const MOBILITY_TRIALS = 48;
          for (let pass = 0; pass < 3 && mobilityVeto.breached; pass++) {
            mobilityVeto.rounds++;
            let pick = null;
            let pickLap = trial.maxGated;
            let measured = 0;
            for (let si = 0; si < best.length && measured < MOBILITY_TRIALS; si++) {
              for (let c = 0; c < C && measured < MOBILITY_TRIALS; c++) {
                if (c === best[si] || conflicts(best, c, si)) continue;
                const t2 = best.slice();
                t2[si] = c;
                mobilityVeto.tried++;
                if (!same(scoreOf(t2), bestSc)) continue;
                mobilityVeto.scoreTied++;
                if (windowMax(t2) > nukeAfter) continue;
                if (Math.max(...selfBlockedRefills(t2)) > Math.max(refillSearch.after, REFILL_NOTE))
                  continue;
                mobilityVeto.affordable++;
                if (detourFreeSet(walkBase, towerTilesOf(t2))) {
                  pick = t2;
                  pickLap = 0;
                  measured++;
                  break;
                }
                measured++;
                const m2 = boardMobility(terrain, plan, keysOf(t2));
                if (m2 && m2.maxGated < pickLap - 1e-9) {
                  pickLap = m2.maxGated;
                  pick = t2;
                }
              }
              if (pick && pickLap <= MOBILITY_TARGET) break;
            }
            if (!pick) break;
            best = pick;
            mobilityVeto.moved++;
            nukeAfter = windowMax(best);
            refillSearch.after = Math.max(...selfBlockedRefills(best));
            trial = boardMobility(terrain, plan, keysOf(best));
            mobilityVeto.lapWithBattery = trial ? trial.maxGated : null;
            mobilityVeto.overWithBattery = trial ? trial.overGated : null;
            mobilityVeto.breached = !!(base && trial && breachesGate(base, trial));
          }
        }
      }
    }
  }

  const towers = best.map((c) => ({ x: cands[c].x, y: cands[c].y }));
  // ...and the walk the filler really makes at this layer, republished over the
  // six seats that ship. See the block above; layer 7 re-derives it again over
  // the whole as-built base and that reading replaces this one.
  const selfBlockedField = (() => {
    const blk = new Set(impassable);
    for (const t of towers) blk.add(key(t.x, t.y));
    return fieldFrom(terrain, plan.sitter, blk);
  })();
  const refillAt = (t) => {
    const v = selfBlockedField[idx(t.x, t.y)];
    if (v < REFILL_INF) return v;
    let bestD = REFILL_INF;
    for (const [dx, dy] of D8) {
      const x = t.x + dx,
        y = t.y + dy;
      if (x < 0 || y < 0 || x > 49 || y > 49) continue;
      const w = selfBlockedField[idx(x, y)];
      if (w < REFILL_INF && w + 1 < bestD) bestD = w + 1;
    }
    return bestD;
  };

  // ------------------------------------------------------------------
  // THE CLUMP, MEASURED AND DECLARED.
  //
  // 93 of 172 rooms put >= 3 of 6 towers within chebyshev 2 of the sitter and
  // six put FIVE of six (E11S6, E14S1, E1S7, E2S5, E3S5, E6S1). Some of that is
  // mandated — the towers cover the wall from inside and the interior is small —
  // and some of it is the max-min objective having no opinion about where a
  // tie goes. The dispersion pass above is the opinion; this is the record of
  // what it managed, and a room that clumped anyway now says so with the search
  // counters rather than leaving the reader to notice.
  // ------------------------------------------------------------------
  const clumped = towers.filter(
    (t) => Math.max(Math.abs(t.x - plan.sitter.x), Math.abs(t.y - plan.sitter.y)) <= 2,
  );
  const towerClump = {
    withinCheb2OfSitter: clumped.length,
    tiles: clumped.map((t) => ({ x: t.x, y: t.y })),
  };
  if (clumped.length >= CLUMP_NOTE && plan.meta) {
    plan.meta.shortfalls = plan.meta.shortfalls || [];
    // ------------------------------------------------------------------
    // THE RECORD FIRST, THE PARAGRAPH SECOND, AND THE PARAGRAPH FROM THE RECORD.
    //
    // The prose this replaces was ~20 lines of template literal interpolating
    // `clumped.length`, `nukeSearch.*`, `nukeBefore` and `nukeAfter` straight out
    // of this function's locals — none of which was published anywhere a reader
    // or the validator could check them against. The counters existed (they went
    // into `towersMeta.towerDispersion`) but the SENTENCE did not read them: it
    // read the variables, and the two were kept equal by nothing but the fact
    // that they happened to be typed on adjacent lines.
    //
    // Two records go on the entry instead. `clump` is the huddle itself, and it
    // is deliberately in the shape finalizeRoom will OVERWRITE it with once the
    // whole base is placed — this layer's reading is honest about the board this
    // layer can see, and the shipped reading is the one of record. `dispersion`
    // is what this layer's non-worsening post-pass actually tried, which is the
    // half of the claim the round-8 finding was about: six rooms put five of six
    // towers in one huddle and every one of them reported `before == after`
    // while the prose asserted the search had run.
    // ------------------------------------------------------------------
    const sf = {
      gate: "towers",
      kind: "clump",
      source: "towers",
      detail: "",
      tiles: clumped.map((t) => ({ x: t.x, y: t.y })),
      clump: {
        within: clumped.length,
        total: towers.length,
        cheb: 2,
        sitter: { x: plan.sitter.x, y: plan.sitter.y },
        // the line this channel speaks at, ON THE RECORD, so the renderer can
        // re-derive "is this room over it" instead of being told
        note: CLUMP_NOTE,
      },
      dispersion: {
        // layer 3's own reading, kept beside the shipped one finalizeRoom writes
        // so a room whose towers moved afterwards can say which number is which
        withinAtLayer3: clumped.length,
        totalAtLayer3: towers.length,
        windowBefore: nukeBefore,
        windowAfter: nukeAfter,
        counted: ["spawn", "storage", "terminal", "tower"],
        tiebreakBudget: NUKE_TIEBREAK_BUDGET,
        search: { ...nukeSearch },
      },
    };
    sf.detail = renderDecl(sf);
    plan.meta.shortfalls.push(sf);
  }

  // M6: tower[0] is the ONLY tower the room owns from RCL3 to RCL5 — the
  // stretch where a single unrefilled tower is the difference between holding
  // an invader off and losing the room. Coverage is an unordered property of
  // the SET, so the order costs nothing to fix: sort by refill walk and the
  // first tower built is always the one the filler reaches soonest. Ties go
  // by (y,x) so two runs on the same terrain emit the same array.
  // WHICH FIELD ORDERS THEM — and it is deliberately NOT the self-blocked one
  // the layer publishes. tower[0] is built at RCL3, in a room that owns ten
  // extensions, no labs, no nuker, no observer and no other tower; the walk that
  // decides which tower the filler should reach first is the walk on THAT board,
  // which is exactly the pre-mass field. Ordering by the RCL8 walk instead put
  // tower[0] behind five towers that do not exist yet in two rooms.
  towers.sort(
    (a, b) => refill[idx(a.x, a.y)] - refill[idx(b.x, b.y)] || a.y - b.y || a.x - b.x,
  );

  // ------------------------------------------------------------------
  // ...AND RCL5 OWNS A PAIR, WHICH IS NOT THE SAME AS OWNING THE FIRST TWO.
  //
  // The sort above is right about tower[0] and says nothing about tower[1] —
  // which is array order, i.e. the second-easiest tower to refill, chosen with
  // no reference at all to what the two of them together cover. RCL5 is a long
  // level and a two-tower battery is the whole defence for it, so the pair is
  // worth picking: E14S5's array pair covers its weakest wall face at 15.8%
  // less damage than the best pair its own six towers can make.
  //
  // tower[0] is NOT re-opened — the RCL3-4 room owns exactly one tower and the
  // filler has to reach it — so this is five candidates and five max-min
  // evaluations over the cut. The partner that maximises the WEAKEST covered
  // wall tile wins, ties on total damage and then on refill walk, so it is a
  // deterministic function of the set. Coverage is unordered, so nothing about
  // the RCL8 battery changes: this only decides which of the six is built
  // second.
  // ------------------------------------------------------------------
  let rcl5Pair = null;
  if (towers.length > 2 && plan.shell?.cut?.length) {
    const cutTiles = plan.shell.cut;
    const pairScore = (t) => {
      let mn = Infinity;
      let sum = 0;
      for (const c of cutTiles) {
        const d = towerDmg(towers[0], c) + towerDmg(t, c);
        if (d < mn) mn = d;
        sum += d;
      }
      return { mn, sum };
    };
    let bestI = 1;
    let bestSc = pairScore(towers[1]);
    for (let i = 2; i < towers.length; i++) {
      // ...and the partner still has to be refillable. A battery is only a
      // battery while the filler keeps it wet, so a tower past this layer's own
      // note threshold is not offered the RCL5 slot however much wall it covers;
      // it will be built at RCL6 with the rest.
      // ...on the same RCL5-era board as the sort above, not the RCL8 one
      if (refill[idx(towers[i].x, towers[i].y)] > REFILL_NOTE) continue;
      const sc = pairScore(towers[i]);
      const better =
        sc.mn > bestSc.mn ||
        (sc.mn === bestSc.mn &&
          (sc.sum > bestSc.sum ||
            (sc.sum === bestSc.sum &&
              refill[idx(towers[i].x, towers[i].y)] < refill[idx(towers[bestI].x, towers[bestI].y)])));
      if (better) {
        bestI = i;
        bestSc = sc;
      }
    }
    rcl5Pair = {
      arrayPartner: { x: towers[1].x, y: towers[1].y },
      picked: { x: towers[bestI].x, y: towers[bestI].y },
      minDmgArray: pairScore(towers[1]).mn,
      minDmgPicked: bestSc.mn,
      swapped: bestI !== 1,
    };
    if (bestI !== 1) {
      const [pick] = towers.splice(bestI, 1);
      towers.splice(1, 0, pick);
    }
  }

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
  const refills = towers.map((t) => refillAt(t));
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
    // The shortest paragraph in the channel, and the last one still typed: two
    // numerals, and a reviewer changed the first of them from 11 to 3 — a value
    // INSIDE the limit the same sentence quotes — and E2S8 passed. Both are
    // fields now and `renderTowerRefill` reads them.
    const sfRefill = {
      gate: "towerRefill",
      detail: "",
      tiles: [],
      towerRefill: { maxRefill, cap: MAX_REFILL },
    };
    sfRefill.detail = renderDecl(sfRefill);
    shortfalls.push(sfRefill);
  }
  // ------------------------------------------------------------------
  // THE BATTERY IS DECLARED WHEN IT IS MERELY LEGAL RATHER THAN GOOD.
  //
  // The two gates above only fire when the room breaks a HARD limit — under
  // TARGET_MIN damage, or past MAX_REFILL walk. Between "hard limit" and "what
  // the fleet actually gets" there is a band nothing spoke about, and E8S5 sat
  // in the middle of it: 1440 damage on its weakest wall face (fleet median is
  // over 2400, and it is the fleet's WEAKEST battery) with a tower a full 10
  // walk from the sitter (fleet median 1). Both numbers are legal. Together
  // they are a room that loses its wall to a boosted dismantler while a hauler
  // is still walking, and nothing in the plan said so.
  //
  // WEAK_SHELL_DMG is the fleet's own 10th-percentile-ish line rather than an
  // invention: 152 of 159 rooms clear 1800 on their weakest face, so a room
  // under it is genuinely unusual and worth a sentence. REFILL_NOTE is likewise
  // the point past which a single refill trip costs more than the tower's own
  // reload — MAX_REFILL is the hard stop, this is where it starts to hurt.
  //
  // The evidence is the search, not the verdict: how many legal seats the room
  // offered at all, how far the battery had to spread to cover the shell, and
  // how many wall tiles are still under target.
  // ------------------------------------------------------------------
  if (mn >= TARGET_MIN && (mn < WEAK_SHELL_DMG || maxRefill > REFILL_NOTE)) {
    // ------------------------------------------------------------------
    // EVERYTHING THE PARAGRAPH SAYS IS NOW A FIELD SOMEBODY CAN CHECK.
    //
    // What stood here was ~60 lines of template literal that read `mn`, `weak`,
    // `T`, `C`, `refillCap`, `spreadRadius`, `sum`, `refills`, `seenSet.size`,
    // `PAIR_K`, `ESC_ROUNDS`, `refillSearch.*` and `escalation.*` directly out of
    // planTowers's scope — and then published a SIX-FIELD `towers` block beside
    // it. The paragraph and the record therefore had almost nothing in common:
    // twenty-odd numerals in the prose, six in the audit, and the only thing
    // holding them together was that one author typed both. That is the exact
    // failure the declprose module exists to close, and this declaration was its
    // worst instance in the planner.
    //
    // So the record comes first and carries EVERY input the paragraph uses,
    // including the four thresholds it is judged against. The thresholds are on
    // the record on purpose: the two conditional clauses (weak face, far refill)
    // are selected by the renderer comparing `minShellDmg` against
    // `weakShellDmg` and `maxRefill` against `refillNote`, not by a boolean this
    // function sets — a record must not be able to claim a clause it has not
    // earned, and a clause selected by the producer is a claim with no evidence
    // behind it.
    //
    // NOTE THE DENOMINATOR. Every number in here is over the cut LAYER 2 handed
    // this layer, before layer 7's inert prune and the single-removal seal
    // reconciliation have moved the wall. E15S5 shipped "1350 damage ... 0/20
    // cut tiles" over a wall that is 19 tiles and weakest at 1410; E5S6 quoted
    // 26 against a shipped 23. `declaredCutTiles` is what makes that denominator
    // explicit, and the as-shipped reading is a SEPARATE record (`sf.battery`,
    // attached at finalizeRoom) rather than a correction glued onto this text.
    // ------------------------------------------------------------------
    const sf = {
      gate: "towers",
      kind: "weak-battery",
      detail: "",
      tiles: towers.map((t) => ({ x: t.x, y: t.y })),
      towers: {
        minShellDmg: mn,
        avgShellDmg: Math.round(sum / T),
        weakTiles: weak,
        declaredCutTiles: T,
        // the walk with the battery standing in its own way, and the pre-mass
        // walk the candidate gather was done on — one subtraction apart, and the
        // paragraph is only allowed to quote the second because it is here
        maxRefill,
        maxRefillUnblocked: Math.max(...towers.map((t) => refill[idx(t.x, t.y)])),
        refillDists: refills.slice(),
        // the seat list and the filters that produced it
        candidates: C,
        depthSafe: DEPTH_SAFE,
        refillCap,
        spreadRadius,
        // what the hill-climb reached, in the shape the honest sentence needs:
        // distinct starts, the partner width of the cheap pair move, and the
        // hard round bound the escalation stops at
        starts: seenSet.size,
        pairK: PAIR_K,
        escRounds: ESC_ROUNDS,
        // THE LINES THIS DECLARATION IS JUDGED AGAINST, on the record so the
        // renderer can re-derive which clauses it has earned
        targetMin: TARGET_MIN,
        weakShellDmg: WEAK_SHELL_DMG,
        refillNote: REFILL_NOTE,
        maxRefillHard: MAX_REFILL,
        // the two searches whose counters the paragraph quotes
        refillSearch: { ...refillSearch },
        search: escalation,
      },
    };
    sf.detail = renderDecl(sf);
    shortfalls.push(sf);
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
      // ------------------------------------------------------------------
      // THE FREEDOM THIS LAYER HAD, AND WHAT IT SPENT IT ON.
      //
      // Named for what it measures: the fullest 5x5 window over the mass LAYER 3
      // CAN SEE — spawn / storage / terminal / tower — before and after its
      // non-worsening dispersion post-pass. The lab diamond is excluded because
      // it is a mandated 4x4 stamp; the NUKER is excluded because layer 5 has not
      // placed it yet, which is precisely the bug that made the old `nukeWindow`
      // field here wrong in 145 of 172 rooms.
      //
      // `meta.towers.nukeWindow` — the real metric, over spawn / storage /
      // terminal / NUKER / tower — is written after layer 5 by
      // recomputeNukeWindow in pipeline.mjs, and validate.mjs re-derives it from
      // the shipped structure lists rather than trusting either field.
      // ------------------------------------------------------------------
      towerDispersion: {
        before: nukeBefore,
        after: nukeAfter,
        counted: ["spawn", "storage", "terminal", "tower"],
        search: nukeSearch,
      },
      towerClump,
      // WHICH TOWER RCL5 GETS AS THE SECOND OF ITS PAIR, and what the array
      // order would have given it instead — see the RCL5 block above
      rcl5Pair,
      maxRefill,
      // the pre-mass field this layer GATHERED candidates on, kept beside the
      // self-blocked walk it now publishes so the difference is one subtraction
      refillDistsUnblocked: towers.map((t) => refill[idx(t.x, t.y)]),
      refillSearch,
      // the defender-lap veto's own record — see the block above planTowers's
      // dispersion search. `provedFree` means the six tiles cannot lengthen one
      // interior walk and nothing had to be measured.
      mobilityVeto,
      spreadRadius,
      newRoads: newRoads.length,
      candidates: C,
      starts: seenSet.size,
      search: escalation,
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
