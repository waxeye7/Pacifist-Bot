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
/**
 * Hard ceiling on stub paving — corridors are cheap, sprawl is not. The budget
 * came down from 48 once the cohesion ceiling landed: a skeleton that may only
 * reach HUB_CAP_LADDER[0] tiles out does not need the extra tiles it used to
 * spend crossing dead floor toward a distant pocket, and measured on the fleet
 * the last few tiles of budget bought 84 road tiles for 14 deep slots. Layer 7
 * prunes any corridor tile that ends up serving nothing, and the fleet
 * roads-median is the gate that actually bites.
 */
const MAX_STUB_ROADS = 43;
/** consecutive stubs allowed to yield no extension before we give up */
const MAX_STALLS = 6;
/**
 * how far a DIRECTED dig may tunnel toward a deep pocket. A greedy 3-step stub
 * cannot cross a longer stretch of already-unusable floor, so the pocket stays
 * unreachable and its extensions get taken shallow instead — at a personal
 * rampart each, forever. 8 tiles of one-off road is cheaper than 4 ramparts.
 */
const DIG_MAX = 8;
/**
 * A room with this much free floor per extension has floor to spare: its
 * corridors may be paved wherever they read best and its digs are affordable.
 * Below it the room is rationing deep tiles between roads and extensions.
 */
const RICH_RATIO = 1.5;
/** paving budget for a room that still has somewhere worth reaching */
const MAX_STUB_ROADS_RICH = 51;
/**
 * PAVEMENT COSTS, in the same units the stub scorer values an opened slot
 * (one deep flank = 3). That scale is the point: charging 0.8 against a term
 * worth 3 per flank cannot change any decision except an exact tie, which is
 * why the old cost never actually steered anything.
 *
 *   shallow floor (0.35) — cheap: the slot it forfeits was going to cost a
 *     personal rampart anyway, so losing it is nearly free.
 *   dead floor (0.15) — nearly free: too near the wall to hold anything, it
 *     exists to be walked on.
 *   deep floor — priced by SCARCITY, see COST_DEEP below.
 */
const COST_SHALLOW = 0.35;
const COST_DEAD = 0.15;
/**
 * Deep pavement is charged clamp(A - B * deepPerExtension) — from 0.3 in a
 * room swimming in free floor (spend it, the flanks are what matter) up to 13
 * in a cramped one, where a paved deep tile is an extension that now has to
 * be taken shallow and rampart it forever. Measured across the fleet the
 * curve is not monotone: too flat and deep-poor rooms grind their floor into
 * corridor (1793 shallow), too steep and the corridors refuse to enter the
 * deep core at all and never reach the pockets behind it (1818 at max 50).
 */
const COST_DEEP_A = 16;
const COST_DEEP_B = 7;
const COST_DEEP_MIN = 0.3;
const COST_DEEP_MAX = 13;
/** deep slots the skeleton wants standing before the mass lands */
const NEED_DEEP_MUL = 1.1;
/** stubs allowed to add no NET deep capacity before the dig takes over */
const P1_STALL = 2;

/**
 * COHESION — the mass is a NEIGHBOURHOOD, not a catchment area.
 *
 * Everything above prices a corridor tile by what it opens and what the floor
 * was worth. Nothing priced how far away it opened it, beyond a token 0.05/tile
 * tie-break, and a token is not a price: a deep pocket 20 tiles out scored the
 * same per flank as one 6 tiles out, so the skeleton would happily grow a
 * second lobe joined to the base by a single corridor. The plan still passed
 * every structural gate — one road component, every extension on a D4 face,
 * every invariant intact — and was still wrong, because the thing that pays
 * for it is the FILLER, which walks the whole tour every refill cycle and eats
 * the round trip to the lobe on each one.
 *
 * Two mechanisms, deliberately different in kind:
 *
 *   HUB_COMFORT/COHESION_W  a soft, superlinear price on distance. Inside the
 *     comfort radius it is free; beyond it the cost grows as the square, so a
 *     remote pocket has to open several times the capacity of nearby floor
 *     before it wins. This is what makes "only when nearby space is genuinely
 *     exhausted" fall out of the scoring instead of being special-cased.
 *   HUB_CAP_LADDER  a hard ceiling on the walk distance an extension may sit
 *     at, because a soft price can always be outvoted by a big enough pocket.
 *
 * The ceiling has to degrade, not fail: 60/60 outranks cohesion, and the
 * pipeline's shell escalation cannot rescue a room here (it escalates on
 * SHALLOW counts, never on hub distance, so it will not fire for a room whose
 * only problem is reach). So the ladder is walked outward until the room is
 * full and the rung that worked is recorded in extMeta.hubDistCap — a room
 * that needed 23 says so rather than quietly shipping a lobe.
 *
 * What the ceiling costs is real and is paid on purpose: rooms whose deep
 * floor lies past it take shallow tiles instead, at a personal rampart each.
 * Fleet-wide that is +25 shallow extensions against the uncapped layer, and it
 * buys every room a filler lap that stays inside one neighbourhood.
 */
const HUB_COMFORT = 12;
const COHESION_W = 0.06;
/**
 * The rungs are not a smooth ramp on purpose. 14 was measured and rejected:
 * 158 of 159 rooms "fit" inside it, so it looked free, and it cost 120 extra
 * SHALLOW extensions — 120 personal ramparts, forever — because a room that
 * cannot reach the deep pocket at 16 does not go without, it takes a near
 * tile in the shallow band instead and bolts a rampart to it. A ceiling that
 * converts deep floor into upkeep is not a tidier plan, it is a worse one.
 */
const HUB_CAP_LADDER = [16, 19, 23, 999];
/**
 * The ladder climbs for REACH only — never to shave a personal rampart.
 *
 * Letting it widen on upkeep as well was built and measured: it saved 15
 * ramparts across four rooms and pushed those four rooms' extensions out to a
 * walk distance of 19-21, which is the exact shape this ceiling exists to
 * prevent. Fifteen ramparts is not worth reintroducing the far lobe in the
 * rooms most prone to it, so a room that fills at the first rung ships there
 * and its remaining shallow tiles are declared, not hidden.
 */
/**
 * CLUSTERING. An extension with no orthogonal extension neighbour is confetti:
 * the filler pays a stop for it and gets one extension's worth of transfer.
 * The corridor-flank pattern the layer is built around naturally produces runs
 * — a rib of extensions down one side of a road — so when a run is available
 * it should always beat starting a new speck somewhere else at the same depth.
 * Implemented as a frontier walk off each landed tile rather than a score,
 * because the score would have to be recomputed after every single placement.
 */
const D4_OFFS = [
  [0, 0],
  [-1, 0],
  [0, -1],
  [-1, -1],
];

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
  // every paved tile, live or stranded — nothing may be built on one.
  // A FACTORY, not a value: the cohesion ladder below may run the whole
  // placement several times, and each run has to start from the same board.
  const freshPaved = () => new Set(plan.structures.road.map((r) => key(r.x, r.y)));
  // MUTABLE, and deliberately only the LIVE network: the road component that
  // actually contains the sitter. Earlier layers can leave a stranded road
  // fragment behind (a lab face, an observer stub) — flanking THAT with
  // extensions would put them off-network, so it does not count as a road
  // here. Layer 7 stitches those fragments back in afterwards.
  const freshRoadSet = () => {
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
  };

  const hubField = fieldFrom(terrain, sitter, occupied);

  /** depth tier: 0 = free, 1/2 = needs a personal rampart, -1 = unusable */
  const tierOf = (i) => {
    const d = depth[i];
    if (d >= DEPTH_SAFE) return 0;
    if (d === DEPTH_SAFE - 1) return 1;
    if (d === DEPTH_SAFE - 2) return 2;
    return -1;
  };

  // baseline: eco works OUTSIDE the shell (source containers, controller
  // link) are unreachable by the interior BFS by construction — the
  // invariant only preserves faces that are interior-reachable NOW.
  // Derived from the untouched board, so it is the same for every rung of the
  // cohesion ladder and is computed exactly once.
  let faces, wallKeep, roadKeep;
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
        if (occupied.has(key(nx, ny))) continue;
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

  /**
   * ONE full placement run under a hard cohesion ceiling: no extension may sit
   * further than `hubCap` interior walk steps from the sitter, and no corridor
   * may be paved past it either (a road nothing inside the ceiling can flank
   * is a road that serves nothing). Pure — it touches no state outside itself,
   * so the ladder can re-run it.
   */
  function attempt(hubCap) {
  const pavedTiles = freshPaved();
  const roadSet = freshRoadSet();
  const blockedNow = new Set(occupied);
  const extensions = [];
  /** the same tiles as `extensions`, for the O(1) 2x2 test below */
  const extSet = new Set();
  const stubRoads = [];

  /** a tile an extension could legally occupy (ignoring road adjacency) */
  const extCapable = (x, y) => {
    if (!buildable(terrain, x, y)) return false;
    const i = idx(x, y);
    if (ext[i] || hubField[i] >= 9999) return false;
    if (hubField[i] > hubCap) return false; // cohesion ceiling
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

  const shallow = [];
  // A tile the invariant rejected stays rejected: blockedNow only ever grows,
  // so the free region only ever shrinks. Memoising this is what keeps the
  // place/stub/place loop from re-running the BFS over the same losers every
  // round (the loop runs once per corridor stub, not once per room).
  const rejected = new Set();
  /**
   * SOLID BLOCKS ARE NOT DENSITY. Four extensions in a 2x2 square have no
   * interior face between them, so the filler cannot service the block from
   * one lane — it has to run both flanking rows to reach all four, and the two
   * inner tiles are permanently one step further from every road than the
   * corridor pattern would have put them. A rib two tiles wide is a brick.
   *
   * Cheap and local: the candidate can only close a square as one of the four
   * corners of the four squares it belongs to.
   */
  const makesSquare = (x, y) => {
    for (const [ox, oy] of D4_OFFS) {
      let n = 0;
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 2; dy++) {
          const px = x + ox + dx,
            py = y + oy + dy;
          if ((px === x && py === y) || extSet.has(key(px, py))) n++;
        }
      }
      if (n === 4) return true;
    }
    return false;
  };
  /**
   * one candidate, invariant-checked, with the rollback. true = it landed.
   * `allowSquare` is the fallback's escape hatch: 60/60 outranks the shape of
   * the mass, so the one-at-a-time tail may brick if that is all the room has.
   */
  const tryPlace = (c, allowSquare = false) => {
    // TARGET is a CAP, not just a goal: CONTROLLER_STRUCTURES allows 60
    // extensions at RCL8 and the 61st is a site the engine refuses. Enforced
    // here rather than at each caller — the fill walks a frontier, and every
    // loop that would otherwise have to re-check is one that can miss.
    if (extensions.length >= TARGET) return false;
    const ck = key(c.x, c.y);
    if (rejected.has(ck)) return false;
    // a candidate can go stale inside a pass (an earlier placement took its
    // tile or a stub paved it — cheap re-check)
    if (!extCapable(c.x, c.y)) return false;
    if (!allowSquare && makesSquare(c.x, c.y)) return false;
    const trial = new Set(blockedNow);
    trial.add(ck);
    if (!invariantHolds(trial)) {
      rejected.add(ck);
      return false;
    }
    extensions.push({ x: c.x, y: c.y });
    extSet.add(ck);
    blockedNow.add(ck);
    // the pre-check can't see the candidate's OWN face (it isn't in the faces
    // list yet) — re-verify with it included, roll back if sealed. Without
    // this, one face-less extension poisons every later trial.
    if (!invariantHolds(blockedNow)) {
      blockedNow.delete(ck);
      extSet.delete(ck);
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
    extSet.delete(ck);
    rejected.add(ck);
  };
  /** land c, then grow the rib it started */
  const placeRun = (c, allowSquare) => {
    if (!tryPlace(c, allowSquare)) return false;
      // GROW THE RIB, don't scatter specks. A global sort by (tier, distance)
      // is blind to what it just placed, so it fills a whole distance band
      // before it comes back for the tile next door — and a band is a
      // checkerboard once the invariant has refused every other tile in it.
      // The tile that just landed makes its own orthogonal neighbours the
      // obvious next pick, so take them now, breadth-first off the new tile.
      //
      // NEVER at a worse depth tier: a shallow slot is a personal rampart
      // forever, and cohesion is not worth buying one. That keeps the sweep
      // order (deep everywhere, then shallow) exactly as it was.
    const frontier = [c];
    for (let fi = 0; fi < frontier.length && extensions.length < TARGET; fi++) {
      const f = frontier[fi];
      for (const [dx, dy] of D4) {
        const nx = f.x + dx,
          ny = f.y + dy;
        if (!extCapable(nx, ny) || !onRoad(nx, ny)) continue;
        const nt = tierOf(idx(nx, ny));
        if (nt < 0 || nt > c.tier) continue;
        const n = { x: nx, y: ny, tier: nt };
        if (tryPlace(n, allowSquare)) frontier.push(n);
      }
    }
    return true;
  };
  /**
   * A BRICK IS ONLY WORSE THAN A RIB — it is much better than a personal
   * rampart. Forbidding 2x2 blocks outright was measured on the fleet: it
   * deleted all 316 of them and cost 79 extensions their deep tile, which is
   * 79 ramparts to build, decay and repair forever. That is a cosmetic win
   * paid for with permanent upkeep, and the upkeep is the thing the owner
   * actually asked to minimise.
   *
   * So the block is DEFERRED, never forbidden: within each depth tier, take
   * every candidate that does not brick first, and only then come back for the
   * ones that do — before dropping to the next tier down. A square therefore
   * forms only where the room had no other tile at that depth, which is the
   * one case where it is the right answer.
   */
  const place = (cands) => {
    let deferred = [];
    let curTier = -1;
    const flush = () => {
      for (const c of deferred) {
        if (extensions.length >= TARGET) break;
        placeRun(c, true);
      }
      deferred = [];
    };
    for (const c of cands) {
      if (extensions.length >= TARGET) break;
      if (c.tier !== curTier) {
        flush();
        curTier = c.tier;
      }
      if (makesSquare(c.x, c.y)) {
        deferred.push(c);
        continue;
      }
      placeRun(c, false);
    }
    flush();
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
  /**
   * DEEP FLOOR IS DUAL-USE, and that is the whole economics of this layer: a
   * free tile can hold an extension OR carry the corridor that serves four of
   * them, never both. How dear a paved deep tile is therefore depends on how
   * much deep floor the room has, and rooms split cleanly into two kinds:
   *
   *   RICH (E11S6: ~180 deep tiles) — floor is not the constraint, corridor
   *     REACH is. Deep pavement is cheap here and should be spent freely;
   *     every tile of spine hands the mass up to four rampart-free slots.
   *   POOR (E14S6, E18S5: ~110 deep tiles, half of them already under the hub
   *     and the eco roads) — every corridor tile laid on deep floor is one
   *     extension that now has to be taken shallow, at a personal rampart
   *     forever. Here the corridor belongs in the shallow band or on floor too
   *     tight to build on, flanking the deep pocket rather than crossing it.
   *
   * A fixed pavement cost serves one kind and wrecks the other, so the cost is
   * scaled by the room's own deep surplus, measured once before any corridor
   * exists. Same reasoning for the paving ceiling: only a room with floor left
   * to reach has anything to buy with a longer skeleton.
   */
  const deepPool = (() => {
    let n = 0;
    for (let x = 2; x <= 47; x++) {
      for (let y = 2; y <= 47; y++) if (extCapable(x, y) && tierOf(idx(x, y)) === 0) n++;
    }
    return n;
  })();
  const deepRatio = deepPool / TARGET;
  const COST_DEEP = Math.min(COST_DEEP_MAX, Math.max(COST_DEEP_MIN, COST_DEEP_A - COST_DEEP_B * deepRatio));
  const stubCap = deepRatio >= RICH_RATIO ? MAX_STUB_ROADS_RICH : MAX_STUB_ROADS;
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
  // The DEEP pair. A shallow slot is not a cheap deep slot, it is a different
  // good: it comes with a personal rampart bolted to it for the life of the
  // room. So the skeleton phase that hunts free capacity must be blind to
  // shallow flanks entirely — score them at zero, not at a discount, or the
  // corridor happily settles next to a shallow field and calls it a win.
  const opensNowDeep = (x, y) => {
    let v = 0;
    for (const [dx, dy] of D4) {
      const nx = x + dx,
        ny = y + dy;
      if (!extCapable(nx, ny) || onRoad(nx, ny)) continue;
      v += tierOf(idx(nx, ny)) === 0 ? TIER_VALUE[0] : 0;
    }
    return v;
  };
  const potentialDeep = (x, y) => {
    let v = 0;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const nx = x + dx,
          ny = y + dy;
        if (!extCapable(nx, ny) || onRoad(nx, ny)) continue;
        v += tierOf(idx(nx, ny)) === 0 ? TIER_VALUE[0] : 0;
      }
    }
    return v;
  };
  /** a tile a corridor may occupy: free interior floor, not already paved */
  const stubTile = (x, y) => {
    if (x < 2 || y < 2 || x > 47 || y > 47) return false;
    const i = idx(x, y);
    if (!walkable(terrain, x, y) || ext[i] || hubField[i] >= 9999) return false;
    // the ceiling binds the corridor too: past it there is nothing legal left
    // to flank, so any tile out there is pavement that serves nothing
    if (hubField[i] > hubCap) return false;
    const k = key(x, y);
    return !blockedNow.has(k) && !pavedTiles.has(k) && !cutSet.has(k);
  };
  /**
   * What reaching this far costs the filler, every cycle, forever. Free inside
   * the comfort radius and quadratic outside it — so nearby floor is taken
   * first as a matter of arithmetic, and a distant pocket has to be worth
   * several flanks before the walker will stretch for it.
   */
  const reachCost = (i) => {
    const over = hubField[i] - HUB_COMFORT;
    return hubField[i] * 0.05 + (over > 0 ? over * over * COHESION_W : 0);
  };

  /**
   * Grow ONE stub: pick the best tile off the network (or off the tip of the
   * stub so far) until it opens real capacity or we hit MAX_STUB. Returns
   * true when it opened something an extension can use.
   *
   * `opens`/`pot` are injected so the same walker can hunt ANY capacity or
   * DEEP capacity only — the two phases below differ in nothing else.
   */
  const growStubWith = (opens, pot) => {
    let tip = null;
    let opened = 0;
    for (let step = 0; step < MAX_STUB; step++) {
      if (stubRoads.length >= stubCap) break;
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
        const now = opens(s.x, s.y);
        // Pavement is charged what the tile was worth as a BUILD site, not
        // what it costs to walk on: dead floor is nearly free, a shallow slot
        // is worth little (it came with a rampart attached), and deep floor
        // costs whatever the room's own surplus says it costs. In a roomy
        // room that is nothing and the spine runs straight through the deep
        // core; in a cramped one it outweighs a whole opened flank, and the
        // corridor hugs the shallow band and reaches in from the side.
        const st = tierOf(idx(s.x, s.y));
        const cost = st === 0 ? COST_DEEP : st > 0 ? COST_SHALLOW : COST_DEAD;
        const sc = now * 3 + pot(s.x, s.y) - reachCost(idx(s.x, s.y)) - cost;
        if (sc > bestSc) {
          bestSc = sc;
          best = s;
          bestOpen = now;
        }
      }
      if (!best || bestSc <= -Infinity) break;
      // a stub that opens nothing AND has nothing in sight is sprawl
      if (bestOpen <= 0 && pot(best.x, best.y) <= 0) break;
      roadSet.add(key(best.x, best.y));
      pavedTiles.add(key(best.x, best.y));
      stubRoads.push({ x: best.x, y: best.y });
      opened += bestOpen;
      tip = best;
      if (bestOpen > 0) break; // corridor reached open space — go place
    }
    return opened > 0;
  };
  const growStub = () => growStubWith(opensNow, potential);
  const growDeepStub = () => growStubWith(opensNowDeep, potentialDeep);

  /**
   * DIRECTED DIG. The greedy walker above is three steps of local hill
   * climbing; it cannot cross a wider stretch of floor that is itself
   * unusable (too tight, too built-up, already flanked) even when a large
   * deep pocket sits right behind it. That is the exact shape of the rooms
   * that end up with 25 shallow extensions and 50 free deep tiles nobody
   * paved to. So when the frontier stalls, aim once: BFS out of the live
   * network over corridor-legal floor to the NEAREST tile that would open a
   * deep slot, and pave the whole path in one commit.
   *
   * D4 because a corridor is what a filler walks and what layer 7 prunes,
   * and the whole path is charged against the room's paving budget — a dig
   * that does not fit is not taken at all rather than left half-dug.
   *
   * Only a room with deep floor to SPARE may dig, and that gate is not
   * timidity: a dig commits up to DIG_MAX tiles at once, and in a deep-poor
   * room most of them land on the very floor the extensions were competing
   * for — measured fleet-wide, ungated digs cost more slots than they open.
   * Where the pocket is large the tiles are surplus and the dig pays for
   * itself several times over as the greedy walker fans out inside it.
   * Returns the number of tiles paved (0 = no reachable pocket in range).
   */
  const digDeep = () => {
    if (deepRatio < RICH_RATIO) return 0;
    const prev = new Int32Array(2500).fill(-2);
    const dist = new Int32Array(2500);
    const q = [];
    // seed set = exactly the step-0 seeds of a stub: legal floor touching the
    // live road network. dist counts TILES PAVED, so a seed already costs 1.
    for (let x = 2; x <= 47; x++) {
      for (let y = 2; y <= 47; y++) {
        if (!stubTile(x, y) || !onRoad(x, y)) continue;
        const i = idx(x, y);
        prev[i] = -1;
        dist[i] = 1;
        q.push(i);
      }
    }
    let target = -1;
    for (let qi = 0; qi < q.length && target < 0; qi++) {
      const i = q[qi];
      const x = i % 50,
        y = (i / 50) | 0;
      if (opensNowDeep(x, y) > 0) {
        target = i;
        break;
      }
      if (dist[i] >= DIG_MAX) continue;
      for (const [dx, dy] of D4) {
        const nx = x + dx,
          ny = y + dy;
        const ni = nx + ny * 50;
        if (nx < 2 || ny < 2 || nx > 47 || ny > 47 || prev[ni] !== -2) continue;
        if (!stubTile(nx, ny)) continue;
        prev[ni] = i;
        dist[ni] = dist[i] + 1;
        q.push(ni);
      }
    }
    if (target < 0) return 0;
    if (stubRoads.length + dist[target] > stubCap) return 0;
    let paved = 0;
    for (let i = target; i >= 0; ) {
      const x = i % 50,
        y = (i / 50) | 0;
      const k = key(x, y);
      if (!pavedTiles.has(k)) {
        pavedTiles.add(k);
        roadSet.add(k);
        stubRoads.push({ x, y });
        paved++;
      }
      if (prev[i] === -1) break;
      i = prev[i];
    }
    return paved;
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
  /**
   * ...but a plain count is the wrong stop condition on its own, because it
   * is satisfied by 75 slots of ANY tier: the skeleton downs tools the moment
   * the shallow band has been harvested and never learns that a deep pocket
   * was two tiles further out. Every slot that count was short of deep is a
   * personal rampart the room pays forever. So the skeleton runs in two
   * phases, and the FIRST one can only see free capacity.
   */
  const capacityDeep = () => {
    let n = 0;
    for (let x = 2; x <= 47; x++) {
      for (let y = 2; y <= 47; y++) if (extCapable(x, y) && onRoad(x, y) && tierOf(idx(x, y)) === 0) n++;
    }
    return n;
  };
  const NEED = Math.round(TARGET * 1.25);
  // Phase 1 wants only a thin margin over TARGET: free slots the invariant
  // later refuses are backfilled by phase 2 anyway, and every extra deep slot
  // demanded here is paid for in corridor length.
  const NEED_DEEP_SLOTS = Math.round(TARGET * NEED_DEEP_MUL);
  let deepExhausted = false;
  let digRoads = 0;
  let p1stall = 0;
  for (;;) {
    const capd = capacityDeep();
    if (capd >= NEED_DEEP_SLOTS || stubRoads.length >= stubCap) break;
    if (growDeepStub()) {
      // GROSS progress is not progress: a stub that opens two deep slots by
      // paving over two deep tiles has moved nothing and spent floor doing
      // it. Only the net count decides, or a deep-poor room happily grinds
      // its whole paving budget into a capacity number that never rises.
      if (capacityDeep() > capd) {
        p1stall = 0;
        continue;
      }
      if (++p1stall < P1_STALL) continue;
    }
    // greedy frontier is stalled or out of reach of anything deep — aim
    // once, and if even that finds nothing in range, say so honestly
    const dug = digDeep();
    if (!dug) {
      deepExhausted = true;
      break;
    }
    digRoads += dug;
    p1stall = 0;
  }
  // Phase 2, for rooms where deep space is genuinely short (small shells,
  // heavy terrain): top the skeleton up on any tier so 60 still lands.
  while (capacity() < NEED && stubRoads.length < stubCap) {
    if (!growStub()) break;
  }

  let stalls = 0;
  for (let guard = 0; guard < 300 && extensions.length < TARGET; guard++) {
    const before = extensions.length;
    place(roadCandidates());
    if (extensions.length >= TARGET) break;
    if (extensions.length > before) stalls = 0;
    else if (++stalls > MAX_STALLS) break;
    if (stubRoads.length >= stubCap) break;
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
        // the tail may brick: this runs only when the corridors are out of
        // ideas and the alternative is shipping 59
        if (!tryPlace(c, true)) continue;
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
      deepExhausted,
      digRoads,
      corridorPlaced,
      corridorFallback: extensions.length - corridorPlaced,
      maxHubDist: extensions.length ? Math.max(...extensions.map((e) => hubField[idx(e.x, e.y)])) : 0,
      hubDistCap: hubCap,
    },
  };
  } // end attempt

  /**
   * THE COHESION LADDER. Take the tightest ceiling that fills the room.
   *
   * 60/60 is not negotiable and the shell escalation cannot rescue this axis —
   * it re-composes on SHALLOW counts, so a room whose only problem is reach
   * never triggers it and would silently ship 57 extensions. So the ceiling
   * relaxes on its own, and only ever for reach: the first rung that fills the
   * room wins, and `hubDistCap` records which one it was. A room sitting on a
   * wide rung is saying in its own meta that its floor is genuinely strung
   * out, rather than a lobe having appeared without anyone noticing.
   *
   * `betterRun` only decides what to keep if NO rung fills the room — the
   * fullest, then the cheapest in personal ramparts, then the most compact.
   * Shipping short is the one outcome worse than shipping wide.
   */
  const betterRun = (a, b) => {
    if (a.extension.length !== b.extension.length) return a.extension.length > b.extension.length;
    if (a.extMeta.shallow !== b.extMeta.shallow) return a.extMeta.shallow < b.extMeta.shallow;
    return a.extMeta.maxHubDist < b.extMeta.maxHubDist;
  };
  let out = null;
  for (const cap of HUB_CAP_LADDER) {
    const run = attempt(cap);
    if (!out || betterRun(run, out)) out = run;
    if (run.extension.length >= TARGET) break;
  }
  return out;
}
