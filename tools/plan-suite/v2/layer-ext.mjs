/**
 * Layer 6 — Extensions (last, by design)
 *
 * OWNER DOCTRINE: "extensions should be EASILY accessible, not a maze — not
 * just theoretically accessible." The old layer poured extensions into every
 * protected tile closest-to-hub first and left layer 7 to retro-fit road
 * faces; the result was a dense blob that a filler had to thread. This layer
 * now GROWS THE MASS ALONG THE ROADS:
 *
 *   - a candidate must be D4-adjacent to the CURRENT road network,
 *   - when no candidate is left and we still owe extensions, a short
 *     CORRIDOR STUB (1-3 road tiles) is grown from the network into the
 *     nearest deep open space — the stub whose tiles unlock the most future
 *     extension capacity wins — and placement continues.
 *
 * The plan then reads as corridors with extensions flanking them, which is
 * also exactly what the filler does at run time: walk a road, drop into four
 * neighbours, walk on.
 *
 * Everything that already worked is kept:
 *
 * THE invariant (the one whose absence made v1 wall itself in):
 *   after every single placement, the interior walk region (free + road
 *   tiles inside the shell) must stay ONE component that contains the
 *   sitter and touches a face of every structure placed so far —
 *   including every extension already down.
 *
 * Movement inside that region is D8 (Screeps has no corner-blocking, a
 * diagonal gap IS a corridor). But TRANSFER is not movement: a filler
 * standing diagonally from an extension can still reach it (range 1 is
 * chebyshev), yet a diagonal-only extension is boxed in by four other
 * structures and reads as inaccessible to every human looking at the
 * plan — and it is genuinely un-roadable. So extensions additionally
 * require a D4 face on the reachable interior component.
 *
 * THE SECOND invariant (M4): the walk to the WALL survives too. Defenders
 * stand on the cut tiles, so every cut tile that is reachable BEFORE the
 * extension mass lands has to stay reachable after it.
 *
 * Depth ladder unchanged: deep tiles are free, depth-3 and depth-2 tiles are
 * usable but buy a personal rampart. TARGET 60 is still non-negotiable — if
 * corridors genuinely cannot reach 60, the tail is placed one tile at a time
 * with its access road paved in the same step (meta.corridorFallback counts
 * them: 4 rooms fleet-wide, 19 extensions). Handing that job to layer 7 does
 * NOT work — the next fallback extension takes the tile layer 7 meant to pave.
 */
import { D4, D8, buildable, key, walkable } from "./shared.mjs";
import { fieldFrom } from "./layer-hub.mjs";

const TARGET = 60;
const DEPTH_SAFE = 4;
/** how long a corridor stub may reach before it has to justify itself */
const MAX_STUB = 3;
/** hard ceiling on stub paving — corridors are cheap, sprawl is not */
const MAX_STUB_ROADS = 40;
/** consecutive stubs allowed to yield no extension before we give up */
const MAX_STALLS = 6;

function idx(x, y) {
  return x + y * 50;
}

export function planExtensions(terrain, plan) {
  if (!plan.shell) return { error: "extensions need a shell (layer 2 missing)" };
  const depth = plan.depth;
  const ext = plan.exterior;

  // structures whose faces must stay reachable
  const faced = [];
  const occupied = new Set();
  for (const t of ["storage", "terminal", "link", "spawn", "container", "tower", "lab", "nuker", "observer"]) {
    for (const p of plan.structures[t] || []) {
      occupied.add(key(p.x, p.y));
      faced.push({ x: p.x, y: p.y });
    }
  }
  // C1: object tiles are obstacles — never a candidate, never walkable, and
  // never something that needs a face (they are not ours to service).
  for (const k of plan.objectTiles || []) occupied.add(k);
  const sitter = plan.sitter;
  // the wall line: a corridor may never be paved ON a rampart (owner: roads
  // TO ramparts, never on them) and never THROUGH one
  const cutSet = new Set((plan.shell?.cut || []).map((c) => key(c.x, c.y)));
  // every paved tile, live or stranded — nothing may be built on one
  const pavedTiles = new Set(plan.structures.road.map((r) => key(r.x, r.y)));
  // MUTABLE, and deliberately only the LIVE network: the road component that
  // actually contains the sitter. Earlier layers can leave a stranded road
  // fragment behind (a lab face, an observer stub) — flanking THAT with
  // extensions would put them off-network, so it does not count as a road
  // here. Layer 7 stitches those fragments back in afterwards.
  const roadSet = (() => {
    const roads = new Set(plan.structures.road.map((r) => key(r.x, r.y)));
    const conduct = new Set([...roads, ...(plan.structures.container || []).map((c) => key(c.x, c.y))]);
    conduct.add(key(sitter.x, sitter.y));
    const comp = new Set([key(sitter.x, sitter.y)]);
    const q = [sitter];
    for (let qi = 0; qi < q.length; qi++) {
      const cur = q[qi];
      for (const [dx, dy] of D8) {
        const x = cur.x + dx,
          y = cur.y + dy;
        const k = key(x, y);
        if (comp.has(k) || !conduct.has(k)) continue;
        comp.add(k);
        q.push({ x, y });
      }
    }
    return new Set([...comp].filter((k) => roads.has(k)));
  })();

  const hubField = fieldFrom(terrain, sitter, occupied);

  const blockedNow = new Set(occupied);
  const extensions = [];
  const stubRoads = [];
  let faces = faced; // reassigned to the interior-reachable subset below
  let wallKeep = []; // cut tiles that must stay walk-reachable (M4)
  let roadKeep = []; // road tiles that must stay walk-reachable (C3)

  /** depth tier: 0 = free, 1/2 = needs a personal rampart, -1 = unusable */
  const tierOf = (i) => {
    const d = depth[i];
    if (d >= DEPTH_SAFE) return 0;
    if (d === DEPTH_SAFE - 1) return 1;
    if (d === DEPTH_SAFE - 2) return 2;
    return -1;
  };

  /** a tile an extension could legally occupy (ignoring road adjacency) */
  const extCapable = (x, y) => {
    if (!buildable(terrain, x, y)) return false;
    const i = idx(x, y);
    if (ext[i] || hubField[i] >= 9999) return false;
    if (tierOf(i) < 0) return false;
    const k = key(x, y);
    return !blockedNow.has(k) && !pavedTiles.has(k);
  };

  const onRoad = (x, y) => D4.some(([dx, dy]) => roadSet.has(key(x + dx, y + dy)));

  const invariantHolds = (trial) => {
    // BFS from sitter over free tiles. D8 — Screeps creeps move diagonally
    // with no corner-blocking, so a diagonal gap IS a real corridor.
    const seen = new Uint8Array(2500);
    const si = idx(sitter.x, sitter.y);
    if (trial.has(key(sitter.x, sitter.y))) return false;
    seen[si] = 1;
    const q = [si];
    let qi = 0;
    while (qi < q.length) {
      const i = q[qi++];
      const x = i % 50,
        y = (i / 50) | 0;
      for (const [dx, dy] of D8) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
        const ni = nx + ny * 50;
        if (seen[ni] || !walkable(terrain, nx, ny)) continue;
        if (ext[ni]) continue; // stay inside the shell
        if (trial.has(key(nx, ny))) continue;
        seen[ni] = 1;
        q.push(ni);
      }
    }
    // every structure (and every extension so far) needs a reachable face
    const touchIn = (p, dirs) => {
      for (const [dx, dy] of dirs) {
        const x = p.x + dx,
          y = p.y + dy;
        if (x < 0 || y < 0 || x > 49 || y > 49) continue;
        if (seen[idx(x, y)]) return true;
      }
      return false;
    };
    for (const f of faces) if (!touchIn(f, D8)) return false;
    // extensions: D4 FACE, not just D8 contact — see the header note
    for (const e of extensions) if (!touchIn(e, D4)) return false;
    // the wall itself: defenders stand ON these tiles, so they must remain
    // part of the walk region, not merely adjacent to it
    for (const w of wallKeep) if (!seen[idx(w.x, w.y)]) return false;
    // C3 (E20S7): and neither may the mass strand a ROAD. An extension ring
    // closed the last gap into a tower pocket; the tower kept a reachable
    // face somewhere else, so the old invariant was satisfied, but its road
    // face was now inside an unreachable pocket — an orphan road nothing
    // could stitch and a tower nothing could refill.
    for (const r of roadKeep) if (!seen[idx(r.x, r.y)]) return false;
    return true;
  };

  // baseline: eco works OUTSIDE the shell (source containers, controller
  // link) are unreachable by the interior BFS by construction — the
  // invariant only preserves faces that are interior-reachable NOW.
  {
    const seen = new Uint8Array(2500);
    const si = idx(sitter.x, sitter.y);
    seen[si] = 1;
    const q = [si];
    let qi = 0;
    while (qi < q.length) {
      const i = q[qi++];
      const x = i % 50,
        y = (i / 50) | 0;
      for (const [dx, dy] of D8) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
        const ni = nx + ny * 50;
        if (seen[ni] || !walkable(terrain, nx, ny) || ext[ni]) continue;
        if (blockedNow.has(key(nx, ny))) continue;
        seen[ni] = 1;
        q.push(ni);
      }
    }
    faces = faced.filter((f) => {
      for (const [dx, dy] of D8) {
        const x = f.x + dx,
          y = f.y + dy;
        if (x >= 0 && y >= 0 && x <= 49 && y <= 49 && seen[idx(x, y)]) return true;
      }
      return false;
    });
    // baseline wall reachability — segments already cut off by the hub/labs/
    // towers are not the extension layer's fault and are not its problem
    wallKeep = (plan.shell?.cut || []).filter((c) => seen[idx(c.x, c.y)]);
    // same rule for the roads that exist today (stubs grown below are always
    // attached to the live network, so they need no separate guard)
    roadKeep = plan.structures.road.filter((r) => seen[idx(r.x, r.y)]);
  }

  const shallow = [];
  // A tile the invariant rejected stays rejected: blockedNow only ever grows,
  // so the free region only ever shrinks. Memoising this is what keeps the
  // place/stub/place loop from re-running the BFS over the same losers every
  // round (the loop runs once per corridor stub, not once per room).
  const rejected = new Set();
  /** one candidate, invariant-checked, with the rollback. true = it landed */
  const tryPlace = (c) => {
    const ck = key(c.x, c.y);
    if (rejected.has(ck)) return false;
    // a candidate can go stale inside a pass (an earlier placement took its
    // tile or a stub paved it — cheap re-check)
    if (!extCapable(c.x, c.y)) return false;
    const trial = new Set(blockedNow);
    trial.add(ck);
    if (!invariantHolds(trial)) {
      rejected.add(ck);
      return false;
    }
    extensions.push({ x: c.x, y: c.y });
    blockedNow.add(ck);
    // the pre-check can't see the candidate's OWN face (it isn't in the faces
    // list yet) — re-verify with it included, roll back if sealed. Without
    // this, one face-less extension poisons every later trial.
    if (!invariantHolds(blockedNow)) {
      blockedNow.delete(ck);
      extensions.pop();
      rejected.add(ck);
      return false;
    }
    if (c.tier > 0) shallow.push({ x: c.x, y: c.y });
    return true;
  };
  /** undo the last tryPlace of c (fallback only, when its access dies) */
  const unplace = (c) => {
    const ck = key(c.x, c.y);
    const i = extensions.findIndex((e) => e.x === c.x && e.y === c.y);
    if (i >= 0) extensions.splice(i, 1);
    const si = shallow.findIndex((e) => e.x === c.x && e.y === c.y);
    if (si >= 0) shallow.splice(si, 1);
    blockedNow.delete(ck);
    rejected.add(ck);
  };
  const place = (cands) => {
    for (const c of cands) {
      if (extensions.length >= TARGET) break;
      tryPlace(c);
    }
  };

  /**
   * Everything currently flanking a road, deep tiles first and then closest
   * to the hub — the filler walks this order every refill cycle.
   */
  const roadCandidates = () => {
    const out = [];
    for (let x = 2; x <= 47; x++) {
      for (let y = 2; y <= 47; y++) {
        if (!extCapable(x, y) || !onRoad(x, y)) continue;
        out.push({ x, y, tier: tierOf(idx(x, y)), d: hubField[idx(x, y)] });
      }
    }
    out.sort((a, b) => a.tier - b.tier || a.d - b.d);
    return out;
  };

  // --- corridor stubs -------------------------------------------------
  const TIER_VALUE = [1, 0.6, 0.35];
  /** capacity a road on (x,y) would unlock RIGHT NOW */
  const opensNow = (x, y) => {
    let v = 0;
    for (const [dx, dy] of D4) {
      const nx = x + dx,
        ny = y + dy;
      if (!extCapable(nx, ny) || onRoad(nx, ny)) continue;
      v += TIER_VALUE[tierOf(idx(nx, ny))];
    }
    return v;
  };
  /** how much unserved capacity sits just beyond — keeps a stub aimed */
  const potential = (x, y) => {
    let v = 0;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const nx = x + dx,
          ny = y + dy;
        if (!extCapable(nx, ny) || onRoad(nx, ny)) continue;
        v += TIER_VALUE[tierOf(idx(nx, ny))];
      }
    }
    return v;
  };
  /** a tile a corridor may occupy: free interior floor, not already paved */
  const stubTile = (x, y) => {
    if (x < 2 || y < 2 || x > 47 || y > 47) return false;
    const i = idx(x, y);
    if (!walkable(terrain, x, y) || ext[i] || hubField[i] >= 9999) return false;
    const k = key(x, y);
    return !blockedNow.has(k) && !pavedTiles.has(k) && !cutSet.has(k);
  };

  /**
   * Grow ONE stub: pick the best tile off the network (or off the tip of the
   * stub so far) until it opens real capacity or we hit MAX_STUB. Returns
   * true when it opened something an extension can use.
   */
  const growStub = () => {
    let tip = null;
    let opened = 0;
    for (let step = 0; step < MAX_STUB; step++) {
      if (stubRoads.length >= MAX_STUB_ROADS) break;
      const seeds = [];
      if (tip) {
        for (const [dx, dy] of D4) {
          const x = tip.x + dx,
            y = tip.y + dy;
          if (stubTile(x, y)) seeds.push({ x, y });
        }
      } else {
        for (let x = 2; x <= 47; x++) {
          for (let y = 2; y <= 47; y++) {
            if (!stubTile(x, y) || !onRoad(x, y)) continue;
            seeds.push({ x, y });
          }
        }
      }
      if (!seeds.length) break;
      let best = null;
      let bestSc = -Infinity;
      let bestOpen = 0;
      for (const s of seeds) {
        const now = opensNow(s.x, s.y);
        // spending a DEEP tile on pavement is the expensive kind of corridor —
        // deep tiles are the scarce resource the extensions actually need
        const cost = depth[idx(s.x, s.y)] >= DEPTH_SAFE ? 0.8 : 0.3;
        const sc = now * 3 + potential(s.x, s.y) - hubField[idx(s.x, s.y)] * 0.05 - cost;
        if (sc > bestSc) {
          bestSc = sc;
          best = s;
          bestOpen = now;
        }
      }
      if (!best || bestSc <= -Infinity) break;
      // a stub that opens nothing AND has nothing in sight is sprawl
      if (bestOpen <= 0 && potential(best.x, best.y) <= 0) break;
      roadSet.add(key(best.x, best.y));
      pavedTiles.add(key(best.x, best.y));
      stubRoads.push({ x: best.x, y: best.y });
      opened += bestOpen;
      tip = best;
      if (bestOpen > 0) break; // corridor reached open space — go place
    }
    return opened > 0;
  };

  // --- the actual run -------------------------------------------------
  // SKELETON FIRST. Placing greedily and only then growing a corridor does
  // not work: the first pass fills every tile flanking the road, including
  // the tiles the corridor needed to continue through, and the mass walls
  // its own frontier in. So the corridors are grown BEFORE the mass, until
  // there are visibly more flanking slots than extensions to put in them
  // (the margin absorbs the tiles the connectivity invariant will refuse).
  // Over-built corridor tiles are not waste: layer 7 prunes any that end up
  // serving nothing.
  // Raw slot count, deliberately NOT tier-weighted. Weighting it (so the
  // skeleton keeps reaching for deep space) was measured on the whole fleet:
  // it bought 65 fewer personal ramparts and cost +4 road tiles per room.
  // The stub scorer already prefers deep tiles; this stays a plain count.
  const capacity = () => {
    let n = 0;
    for (let x = 2; x <= 47; x++) {
      for (let y = 2; y <= 47; y++) if (extCapable(x, y) && onRoad(x, y)) n++;
    }
    return n;
  };
  const NEED = Math.round(TARGET * 1.25);
  while (capacity() < NEED && stubRoads.length < MAX_STUB_ROADS) {
    if (!growStub()) break;
  }

  let stalls = 0;
  for (let guard = 0; guard < 300 && extensions.length < TARGET; guard++) {
    const before = extensions.length;
    place(roadCandidates());
    if (extensions.length >= TARGET) break;
    if (extensions.length > before) stalls = 0;
    else if (++stalls > MAX_STALLS) break;
    if (stubRoads.length >= MAX_STUB_ROADS) break;
    if (!growStub()) break;
  }

  // --- fallback: corridors could not reach 60 --------------------------
  // 60/60 is non-negotiable (an extension short is permanent spawn-throughput
  // loss). If the room is so tight that no corridor reaches the last tiles,
  // take them one at a time and pave the access RIGHT HERE — leaving it to
  // layer 7 does not work, because the next fallback extension can take the
  // very tile layer 7 was going to pave.
  const corridorPlaced = extensions.length;
  if (extensions.length < TARGET) {
    /** parent field for paving: out of the network over free interior floor */
    const paveField = () => {
      const prev = new Int32Array(2500).fill(-2);
      const dist = new Int32Array(2500).fill(1 << 20);
      const q = [];
      for (const k of roadSet) {
        const [x, y] = k.split(",").map(Number);
        const i = idx(x, y);
        if (prev[i] === -2) {
          prev[i] = -1;
          dist[i] = 0;
          q.push(i);
        }
      }
      for (let qi = 0; qi < q.length; qi++) {
        const i = q[qi];
        const x = i % 50,
          y = (i / 50) | 0;
        for (const [dx, dy] of D8) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 1 || ny < 1 || nx > 48 || ny > 48) continue;
          const ni = nx + ny * 50;
          if (prev[ni] !== -2 || !walkable(terrain, nx, ny) || ext[ni]) continue;
          const k = key(nx, ny);
          if (blockedNow.has(k) || pavedTiles.has(k) || cutSet.has(k)) continue;
          prev[ni] = i;
          dist[ni] = dist[i] + 1;
          q.push(ni);
        }
      }
      return { prev, dist };
    };
    for (let guard = 0; guard < 120 && extensions.length < TARGET; guard++) {
      const { prev, dist } = paveField();
      const rest = [];
      for (let x = 2; x <= 47; x++) {
        for (let y = 2; y <= 47; y++) {
          if (!extCapable(x, y) || rejected.has(key(x, y))) continue;
          let face = -1;
          for (const [dx, dy] of D4) {
            const fx = x + dx,
              fy = y + dy;
            if (fx < 1 || fy < 1 || fx > 48 || fy > 48) continue;
            const i = idx(fx, fy);
            if (prev[i] === -2) continue; // no road can ever reach this face
            if (face < 0 || dist[i] < dist[face]) face = i;
          }
          if (face < 0) continue;
          rest.push({ x, y, tier: tierOf(idx(x, y)), d: hubField[idx(x, y)], face });
        }
      }
      rest.sort((a, b) => a.tier - b.tier || a.d - b.d);
      let landed = false;
      for (const c of rest) {
        if (!tryPlace(c)) continue;
        // The pre-field was derived with c's tile still FREE, so its parent
        // chain is allowed to run straight through the tile we just built on
        // (that is how an extension once ended up with a road stacked on it).
        // Re-derive with c blocked and pave against that.
        const after = paveField();
        let face = -1;
        for (const [dx, dy] of D4) {
          const fx = c.x + dx,
            fy = c.y + dy;
          if (fx < 1 || fy < 1 || fx > 48 || fy > 48) continue;
          const i = idx(fx, fy);
          if (after.prev[i] === -2) continue;
          if (face < 0 || after.dist[i] < after.dist[face]) face = i;
        }
        if (face < 0) {
          unplace(c); // no road can reach it any more — it was never viable
          continue;
        }
        for (let i = face; i >= 0; ) {
          const k = key(i % 50, (i / 50) | 0);
          if (!pavedTiles.has(k)) {
            pavedTiles.add(k);
            roadSet.add(k);
            stubRoads.push({ x: i % 50, y: (i / 50) | 0 });
          }
          if (after.prev[i] === -1) break;
          i = after.prev[i];
        }
        landed = true;
        break; // re-derive the field: the board moved
      }
      if (!landed) break;
    }
  }

  return {
    layer: "extensions",
    extension: extensions,
    shallowExts: shallow, // caller ramparts these
    roads: stubRoads, // caller appends these to structures.road
    extMeta: {
      placed: extensions.length,
      target: TARGET,
      full: extensions.length >= TARGET,
      shallow: shallow.length,
      stubRoads: stubRoads.length,
      corridorPlaced,
      corridorFallback: extensions.length - corridorPlaced,
      maxHubDist: extensions.length ? Math.max(...extensions.map((e) => hubField[idx(e.x, e.y)])) : 0,
    },
  };
}
