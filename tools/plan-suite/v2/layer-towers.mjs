/**
 * Layer 3 — Towers (set-cover over the finished shell)
 *
 * The shell exists first, so tower placement is a pure optimization:
 *   - candidates: deep interior (depth ≥ 4 — out of ranged reach), refillable
 *     (walk ≤ 12 from storage), not on roads/structures
 *   - objective: greedy weighted set-cover of the CUT tiles — each round
 *     places the tower that adds the most damage where coverage is
 *     currently weakest (battlements count double), then one swap pass
 *   - every tower gets a road face stitched into the layer-1 network
 *
 * Tower damage: 600 at range ≤5, linear falloff to 150 at range ≥20.
 */
import { D4, D8, buildable, key, walkable } from "./shared.mjs";
import { fieldFrom } from "./layer-hub.mjs";

const N_TOWERS = 6;
const DEPTH_SAFE = 4;
const MAX_REFILL = 12;
// Owner call: refill ease is weighted alongside raw coverage. A tower the
// filler can top up in one trip fires every tick of a siege; a perfectly
// placed one two corridors away goes dry. Knob so it can be tuned per room.
const REFILL_WEIGHT = 8;

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
  const refillWeight = opts.refillWeight ?? REFILL_WEIGHT;
  if (!plan.shell) return { error: "towers need a shell (layer 2 missing)" };
  const depth = plan.depth; // Int16Array from layer 2
  const ext = plan.exterior;

  const occupied = new Set();
  for (const t of ["storage", "terminal", "link", "spawn", "container"]) {
    for (const p of plan.structures[t] || []) occupied.add(key(p.x, p.y));
  }
  occupied.add(key(plan.sitter.x, plan.sitter.y));
  for (const k of plan.objectTiles || []) occupied.add(k); // C1
  const roadSet = new Set(plan.structures.road.map((r) => key(r.x, r.y)));

  const storage = plan.structures.storage[0];
  const impassable = new Set(occupied);
  const refill = fieldFrom(terrain, plan.sitter, impassable);

  // shell tiles to cover; battlements are where fights actually happen
  const targets = plan.shell.cut.map((c) => ({ ...c, w: 1 }));
  const battle = new Set(plan.shell.battlements.map((b) => key(b.x, b.y)));
  for (const t of targets) if (battle.has(key(t.x, t.y))) t.w = 2;
  if (!targets.length) return { error: "shell has no cut tiles" };

  // candidates
  const cands = [];
  for (let x = 2; x <= 47; x++) {
    for (let y = 2; y <= 47; y++) {
      const i = idx(x, y);
      const k = key(x, y);
      if (!buildable(terrain, x, y) || ext[i]) continue;
      if (depth[i] < DEPTH_SAFE) continue;
      if (occupied.has(k) || roadSet.has(k)) continue;
      if (refill[i] > MAX_REFILL || refill[i] >= 9999) continue;
      cands.push({ x, y });
    }
  }
  if (cands.length < N_TOWERS) return { error: `only ${cands.length} tower spots (need ${N_TOWERS})` };

  // greedy weighted cover: weakest shell tiles pull the next tower
  const towers = [];
  const cover = new Float64Array(targets.length); // damage-so-far per target
  const marginal = (c) => {
    let s = 0;
    for (let t = 0; t < targets.length; t++) {
      const need = 1 / (1 + cover[t] / 300);
      s += targets[t].w * need * need * towerDmg(c, targets[t]);
    }
    // pull toward the hub (refill convenience) and spread from others
    let sp = 0;
    for (const tw of towers) if (Math.max(Math.abs(tw.x - c.x), Math.abs(tw.y - c.y)) <= 1) sp -= 200;
    return s + sp - refill[idx(c.x, c.y)] * refillWeight;
  };

  /**
   * A tower needs ONE free neighbour tile — that is where its refill road
   * goes and where the filler stands. Six towers packed into a pocket can
   * wall each other in (E20S2 built a solid 2x3 block against a cliff and
   * the middle tower had no reachable tile at all), so the free face is a
   * hard constraint on the set, not a scoring nicety.
   */
  const freeFace = (t, set) =>
    D8.some(([dx, dy]) => {
      const x = t.x + dx,
        y = t.y + dy;
      if (!walkable(terrain, x, y) || occupied.has(key(x, y))) return false;
      return !set.some((o) => o !== t && o.x === x && o.y === y);
    });

  for (let n = 0; n < N_TOWERS; n++) {
    let best = null;
    let bestSc = -Infinity;
    let fallback = null;
    let fbSc = -Infinity;
    for (const c of cands) {
      if (towers.some((t) => t.x === c.x && t.y === c.y)) continue;
      const sc = marginal(c);
      if (sc > fbSc) {
        fbSc = sc;
        fallback = c;
      }
      const trial = towers.concat([c]);
      if (!trial.every((t) => freeFace(t, trial))) continue;
      if (sc > bestSc) {
        bestSc = sc;
        best = c;
      }
    }
    const pick = best || fallback;
    towers.push(pick);
    for (let t = 0; t < targets.length; t++) cover[t] += towerDmg(pick, targets[t]);
  }

  // one swap-improvement pass on the min-coverage objective
  const minCover = (set) => {
    let mn = Infinity;
    for (const t of targets) {
      let s = 0;
      for (const tw of set) s += towerDmg(tw, t);
      if (s < mn) mn = s;
    }
    return mn;
  };
  // objective = weakest-covered shell tile, penalised by the worst refill
  // walk in the set: coverage still dominates, refill breaks the ties.
  const swapScore = (set) =>
    minCover(set) - refillWeight * Math.max(...set.map((t) => refill[idx(t.x, t.y)]));
  let curSc = swapScore(towers);
  for (let i = 0; i < towers.length; i++) {
    for (const c of cands) {
      if (towers.some((t) => t.x === c.x && t.y === c.y)) continue;
      const trial = towers.slice();
      trial[i] = c;
      if (!trial.every((t) => freeFace(t, trial))) continue;
      const m = swapScore(trial);
      if (m > curSc) {
        towers[i] = c;
        curSc = m;
      }
    }
  }

  // C3 (E20S7): a FREE face is not a REACHABLE face. Six towers around a
  // wall-locked pocket each had an empty neighbour — inside the pocket, which
  // nothing could walk into. The room then shipped a tower nobody could
  // refill and a road fragment nothing could stitch. So the finished set is
  // re-checked against the actual walk field and any tower whose access died
  // is swapped for the best-scoring candidate that keeps the whole set
  // serviceable.
  const hardBlock = new Set();
  for (const t of ["storage", "terminal", "link", "spawn"]) {
    for (const p of plan.structures[t] || []) hardBlock.add(key(p.x, p.y));
  }
  for (const k of plan.objectTiles || []) hardBlock.add(k);
  const reachField = (set) => {
    const blocked = new Set(hardBlock);
    for (const t of set) blocked.add(key(t.x, t.y));
    return fieldFrom(terrain, plan.sitter, blocked);
  };
  const strandedIn = (set) => {
    const f = reachField(set);
    return set.filter((t) => !D8.some(([dx, dy]) => f[idx(t.x + dx, t.y + dy)] < 9999));
  };
  for (let repair = 0; repair < 6; repair++) {
    const bad = strandedIn(towers);
    if (!bad.length) break;
    const i = towers.indexOf(bad[0]);
    let pick = null;
    let pickSc = -Infinity;
    for (const c of cands) {
      if (towers.some((t) => t.x === c.x && t.y === c.y)) continue;
      const trial = towers.slice();
      trial[i] = c;
      if (!trial.every((t) => freeFace(t, trial))) continue;
      if (strandedIn(trial).length) continue;
      const sc = swapScore(trial);
      if (sc > pickSc) {
        pickSc = sc;
        pick = c;
      }
    }
    if (!pick) break;
    towers[i] = pick;
  }

  // M6: tower[0] is the ONLY tower the room owns from RCL3 to RCL5 — the
  // stretch where a single unrefilled tower is the difference between
  // holding an invader off and losing the room. Set-cover picks placements,
  // not an order, so the finished set is sorted by refill walk: the first
  // tower built is always the one the filler reaches soonest. Coverage is
  // an unordered property of the set, so nothing else changes.
  towers.sort((a, b) => refill[idx(a.x, a.y)] - refill[idx(b.x, b.y)] || a.x - b.x || a.y - b.y);

  // C2: ALL six towers block before ANY road is stitched. Adding them one
  // at a time inside the loop meant a later tower's descent path could pave
  // straight over an earlier-numbered... no: over a LATER one, which was
  // not yet in `impassable`. 40 roads across 37 rooms sat under a tower.
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
    // D4 first (a filler on a face is the cheapest refill), but fall back to
    // a diagonal: transfer range is chebyshev, so a corner tile serves the
    // tower just as well. Without the fallback, a tower whose four faces are
    // all wall/structure ends up with no road at all — which is what the C2
    // fix exposed, because paving over a neighbouring tower is no longer an
    // accidental "solution".
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

  // coverage stats over cut tiles
  let mn = Infinity;
  let sum = 0;
  for (const t of targets) {
    let s = 0;
    for (const tw of towers) s += towerDmg(tw, t);
    if (s < mn) mn = s;
    sum += s;
  }
  const refills = towers.map((t) => refill[idx(t.x, t.y)]);

  return {
    layer: "towers",
    tower: towers,
    roads: newRoads,
    towersMeta: {
      minShellDmg: mn,
      avgShellDmg: Math.round(sum / targets.length),
      refillDists: refills,
      maxRefill: Math.max(...refills),
    },
  };
}
