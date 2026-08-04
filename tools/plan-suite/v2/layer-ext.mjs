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
import {
  D4,
  D8,
  buildable,
  engineBuildable,
  isWall,
  key,
  mineralGuard,
  reservedTiles,
  walkable,
} from "./shared.mjs";
import { fieldFrom } from "./layer-hub.mjs";
import {
  BUILT_OBSTACLES,
  MOBILITY_TARGET,
  arriveAt,
  bfsField,
  interiorWalk,
  maskFromKeys,
  mobilityStats,
} from "./layer-shell.mjs";

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
 * Off-ladder deep-paving allowance for the rescue retry — see the rescue block
 * inside attempt(). Swept at 0/4/8/16: 4 buys the whole improvement (fleet
 * shallow 85 -> 82) and 8 and 16 buy nothing further, so it is the measured
 * knee and not a round number.
 */
const EXT_RESCUE_ROADS = 4;
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

/**
 * DEFENDER LANES — the mass is grown AROUND the garrison's route, not over it.
 *
 * THE DEFECT THIS REPLACES. Layer 7 used to fix defender mobility by RELOCATING
 * extensions this layer had already placed: measure the finished base, find the
 * wall pair the mass had walled off, pull one to four extensions out of the lane
 * and rehouse them. It worked (fleet as-built max mean 3.61 -> 2.92) and it was
 * the "repair-loop architecture" anti-pattern by name — a layer fixing a
 * previous layer's output. The reason given was that the lap is a property of
 * the FINISHED base and cannot be known while the mass is being placed.
 *
 * That reason is false, and this is the proof. The lap cannot be KNOWN in
 * advance, but it can be BOUNDED: whatever the mass does, it can only ever take
 * tiles that an extension is allowed to stand on. So walk the interior with
 * EVERY extension-capable tile blocked at once — the worst base this layer could
 * possibly build — and measure the mobility of that. Any pair that survives THAT
 * walk inside the target survives every real placement too.
 *
 * THAT IS WHAT THIS DOES, AND FOR ONE ROUND OF REVIEW IT DID NOT. The model used
 * to block `roadCandidates().slice(0, 60)` — a PREDICTION of the mass, not a
 * bound on it — because blocking everything severed the band just inside the
 * wall and the severed wall tiles silently DROPPED OUT of the metric (mobilityStats
 * only measures cut tiles the walk can reach). A model that answers "0" because
 * it cut the question out of the sample is worse than no model: 3 rooms reported
 * a bound BELOW their own mass-free floor, which is arithmetically impossible,
 * and 7 shipped above the bound they printed. The prediction is not stable either
 * — the placement loop grows more corridor as it goes, so a tile predicted to be
 * MASS becomes ROAD and its neighbour, never listed, is promoted into the mass.
 *
 * The bound is now the real one, made honest by a single extra rule:
 *
 *   A STRANDED WALL TILE IS A FAILURE, NOT A MISSING DATA POINT. Every cut tile
 *   the EMPTY room can reach must still be reachable under full blocking. One
 *   that is not has an infinite lap, not a zero one, and it is opened first —
 *   before any ratio is looked at.
 *
 * The reservation is then a straightforward greedy on the bound: while a wall
 * tile is stranded, or while the worst-case GATED lap is worse than the gated lap
 * the shell itself measured with no mass at all (the floor — this layer cannot
 * beat the room's own geometry, and pretending to would be score-chasing), take
 * the worst target, walk its SHORTEST mass-free lane, and reserve the capable
 * tiles along it. Reserved tiles behave exactly like cut tiles for placement: no
 * extension may take one, and the bound re-reads them as walkable, so the model
 * tightens as the reservation grows. Corridors may still pave them — a road does
 * not block a creep, so a paved lane is still a lane, and in practice the corridor
 * layer is delighted to run down a reserved lane and flank it on both sides.
 *
 * GATED, THROUGHOUT. The floor, the break test and the pair selection all read
 * `maxGated` — the maximum over pairs whose ABSOLUTE detour clears
 * MOBILITY_DETOUR_FLOOR — because that is the reading the 1.2 target, the
 * escalation ladder and layer 7's verdict are all taken on. Reading the ungated
 * max here was not a harmless conservatism: in a room whose mass-free gated lap
 * is a clean 0 the ungated floor is typically 1.5 (two battlements three apart:
 * defender walks 3, attacker 2), the break test fired on round 0, and the room
 * reserved NOTHING while its as-built gated lap was 100% ours. Six of the seven
 * rooms whose gate is broken by the mass and by nothing else were in exactly
 * that state.
 */
const LANE_ROUNDS = 10;
/**
 * DEEP FLOOR IS THE ONE THING A LANE MAY NOT SPEND FREELY.
 *
 * A deep tile is an extension slot that does not rent a personal rampart; a
 * shallow tile is the same slot with a rampart bolted to it forever. So a lane
 * laid across the deep core in a room that is already rationing deep floor does
 * not cost "a tile", it costs an upkeep bill — measured, an unrationed 20-tile
 * allowance took the fleet from 86 shallow extensions to 124 and pushed the
 * rampart total over its gate. Two rules, both derived from that:
 *
 *   SURPLUS ONLY  the allowance is what the room has left over after the mass
 *                 is fed (LANE_DEEP_KEEP deep slots), clamped to LANE_DEEP_MAX.
 *                 A room with no surplus reserves only dead and shallow floor,
 *                 and if that is not enough to move the lap it says so.
 *   WORTH IT      a reservation must buy back at least LANE_MIN_GAIN tiles of
 *                 detour against the mass-free walk. Most rooms' floor is
 *                 already over the 1.2 target for reasons of terrain, and
 *                 spending permanent upkeep to shave one tick off a lap that
 *                 misses anyway is score-chasing.
 *
 * ...and then the ladder at the bottom of the file CHECKS, per room, that the
 * reservation was actually free: measured across the fleet, roughly nine in ten
 * reserved deep tiles cost nothing at all (the displaced extension simply takes
 * the next deep tile along), and it is only the tenth that turns into a
 * permanent rampart. A budget cannot tell those apart in advance; re-running the
 * room without the reservation can, and does.
 */
const LANE_DEEP_MAX = 24;
const LANE_DEEP_KEEP = 60;
const LANE_MIN_GAIN = 1;
/**
 * ...AND A FLOOR UNDER THE ALLOWANCE, BECAUSE THE BUDGET IS NO LONGER THE ONLY
 * THING STANDING BETWEEN A LANE AND A RAMPART.
 *
 * "Surplus only" was written when the reservation was all-or-nothing: spend the
 * deep floor and hope, or do not spend it. The ladder at the bottom of this file
 * now MEASURES the cost — it re-runs the whole room bare and, if the reservation
 * actually turned into personal ramparts, shrinks it round by round until it is
 * affordable and only then drops it. With a real cost check downstream, a budget
 * of zero upstream is not caution, it is a room shipping with no bound at all:
 * three rooms (E14S6, E17S7, E21S1) could not open a single STRANDED battlement,
 * and E20S5 — whose empty lap is a clean 0 and whose mass adds 15 tiles to the
 * worst walk — could not open its own detour. So the surplus formula now has a
 * floor, clamped by what the room actually has.
 */
const LANE_DEEP_MIN = 8;
/**
 * How many candidate deep tiles a shallow slot may be tried against before the
 * relocation pass gives up on it. The list is sorted by walk distance from the
 * sitter and the move exists to land CLOSER, so the useful candidates are all
 * at the front; the tail is a long list of far tiles that will lose the sort
 * even when they pass. Measured: unbounded trials cost E4S7 11 seconds on its
 * own (6.8s -> 17.9s) and relocated exactly the same slots as a shortlist of
 * 16, because the invariant almost never refuses a near tile that the cheap
 * filters already accepted.
 */
const RELOC_TRIALS = 16;
/**
 * THE FLEET'S EXCHANGE RATE BETWEEN WALL AND LAP, and the only one.
 *
 * Upkeep is the first objective, so mobility may only ever spend ramparts at a
 * published rate and never more than a cap: RAMPARTS_PER_RATIO permanent ramparts
 * for each 1.0 of gated defender ratio the spend reclaims, MOBILITY_RAMPART_CAP
 * total.
 *
 * THIS IS THE LANE PRICE, AND IT IS NOT THE ENCLOSURE PRICE. pipeline.mjs used
 * to import these two constants for the escalation ladder, on the argument that
 * one currency deserves one exchange rate. The argument was half right — a
 * currency does — but it collapsed two different PURCHASES into one price, and
 * the ladder's half of it was badly mis-set: 22 rooms declared a wider cut that
 * composed the whole RCL8 program at a materially shorter lap and refused it,
 * several for single-digit rampart counts against laps of 6, 7, 8 and 11.5.
 *
 * A rung buys a lap MEASURED on the shell it is about to ship, for the whole
 * garrison, permanently, in SHELL ramparts. A lane buys a BOUND on the worst
 * mass this layer could grow, paid in PERSONAL ramparts over shallow structures
 * — see the half-rate note below, which exists precisely because a guarantee is
 * worth less than a measurement. The two are now priced separately and each
 * price is published where it is spent (pipeline.mjs MOBILITY_ENCLOSURE_*).
 *
 * Reattaching a STRANDED battlement has no ratio to multiply (the lap is
 * infinite), so it is quoted a fixed equivalent instead — see STRAND_GAIN.
 */
export const RAMPARTS_PER_RATIO = 2;
export const MOBILITY_RAMPART_CAP = 6;
/**
 * ...AND A GUARANTEE IS WORTH LESS THAN A MEASUREMENT, so a lane pays half.
 *
 * The pipeline's rung buys a lap MEASURED on the shell it is going to ship. A
 * lane buys a BOUND: a promise about the worst arrangement of 60 extensions this
 * room could ever hold, which the mass it actually grows is usually nowhere near.
 * Both are worth real ramparts and they are not worth the same ramparts — priced
 * identically, the lanes alone put 40 extra personal ramparts on the fleet (79
 * shallow extensions to 119) to tighten worst cases that never materialise.
 */
const LANE_RAMPARTS_PER_RATIO = RAMPARTS_PER_RATIO;
/** what unsealing the worst case's severed battlements is worth, in lap */
const STRAND_GAIN = 1.5;
/** what a lane step is charged for the tile it consumes, in path tie-breaks */
const LANE_PEN_DEEP = 4;
const LANE_PEN_SHALLOW = 2;
/**
 * FLANK COMPLETION. A corridor with extensions down only one side is half a
 * corridor: the tiles on its other face are already served by a road we are
 * already paying for, and taking them costs nothing but the ceiling. When the
 * mass would otherwise fall through to the one-at-a-time tail — the pass that
 * grows diagonal staircases of single extensions with private dead-pocket roads
 * — completing an existing corridor's second flank is strictly better, so the
 * cohesion ceiling is relaxed by this much for THAT and nothing else.
 */
const FLANK_RELAX = 2;
/** and never past the fleet's hard reach gate, whatever rung the ladder is on */
const FLANK_HARD_CAP = 18;

function idx(x, y) {
  return x + y * 50;
}
const round2 = (v) => Math.round(v * 100) / 100;

/**
 * Shortest D8 lane from a to b over `mask`, breaking ties toward the tiles the
 * mass would miss least.
 *
 * `b` is either a tile or a PREDICATE on tile indices — the strand rule needs a
 * lane from a severed wall tile back to whatever the worst case can still walk,
 * which is a set, not a point, and running one Dijkstra per candidate endpoint
 * to find the nearest would be the same search done n times.
 *
 * LENGTH IS NOT NEGOTIABLE — a lane one step longer is a lap one step longer,
 * which is the thing being bought — so the primary cost is the step count,
 * scaled far above any tile penalty a path this size can accumulate. Underneath
 * that the walk prefers dead and shallow floor to deep floor, because a deep
 * tile is an extension that would not have rented a personal rampart. Same
 * length, cheaper floor: a lane that runs along the shallow band instead of
 * straight through the deep core, for free.
 *
 * "SCALED FAR ABOVE" IS AN ARITHMETIC CLAIM AND IT USED TO BE FALSE. The step
 * was 10 against a per-tile penalty of up to 4, so any route more than two steps
 * long could buy its way past a shorter one on penalties alone — and did: E19S4
 * kept selecting a longer detour that happened to be entirely non-capable,
 * reserved nothing, and broke the greedy with the bound still at 1.33 on a room
 * whose empty lap is 0. The step is now larger than the largest penalty total a
 * path can accumulate in a 50x50 room (LANE_PEN_DEEP x 128 steps = 512), so
 * length strictly outranks floor cost and the tie-break is a tie-break again.
 */
const LANE_STEP = 512;
function shortestLane(mask, a, b, penalty) {
  const dist = new Int32Array(2500).fill(0x7fffffff);
  const prev = new Int32Array(2500).fill(-2);
  const si = idx(a.x, a.y);
  const isTarget = typeof b === "function" ? b : (i) => i === idx(b.x, b.y);
  if (!mask[si]) return null;
  if (typeof b !== "function" && !mask[idx(b.x, b.y)]) return null;
  // binary heap over (cost, tile) — costs are tiny integers, the room is 2500
  // tiles, and a bucket queue would need one bucket per distinct cost
  const heap = [];
  const push = (c, i) => {
    heap.push([c, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1,
          r = l + 1;
        let s = k;
        if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
        if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
        if (s === k) break;
        [heap[s], heap[k]] = [heap[k], heap[s]];
        k = s;
      }
    }
    return top;
  };
  dist[si] = 0;
  prev[si] = -1;
  push(0, si);
  let ti = -1;
  while (heap.length) {
    const [c, i] = pop();
    if (c > dist[i]) continue;
    if (isTarget(i)) {
      ti = i;
      break;
    }
    const x = i % 50,
      y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = nx + ny * 50;
      if (!mask[ni]) continue;
      const nc = c + LANE_STEP + penalty(nx, ny);
      if (nc >= dist[ni]) continue;
      dist[ni] = nc;
      prev[ni] = i;
      push(nc, ni);
    }
  }
  if (ti < 0 || prev[ti] === -2) return null;
  const out = [];
  for (let i = ti; i >= 0; i = prev[i]) out.push(i);
  return out;
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
  // THE TILES NO BLOCKING STRUCTURE MAY TAKE — the controller claim seat and
  // its approach, the mineral stand and its approach, and the upgrader park
  // seats this room holds to its floor. See reservedTiles in shared.mjs.
  const reserved = reservedTiles(plan);
  const mGuard = mineralGuard(terrain, plan);
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

  // ------------------------------------------------------------------
  // THE MOBILITY FLOOR — the lap this room has with NO mass in it at all.
  //
  // Board-independent (roads never block a creep), so it is derived once and
  // every rung of every ladder measures against the same number. This layer is
  // not allowed to claim credit for beating the room's own geometry, and a
  // reservation that tried would grind the whole interior into lane chasing a
  // target the enclosure cannot reach.
  //
  // READ GATED. See the lane header: the target, the ladder and layer 7's
  // verdict are all taken on `maxGated`, and taking the floor on the ungated
  // `max` handed most rooms a floor of 1.5 they were already "at", which
  // switched the whole reservation off on round 0.
  // ------------------------------------------------------------------
  /** movement obstacles as the ENGINE sees them: containers/roads are not */
  const walkBlocked = new Set(occupied);
  for (const c of plan.structures.container || []) walkBlocked.delete(key(c.x, c.y));
  const shellCut = plan.shell?.cut || [];
  const freeMask = maskFromKeys(interiorWalk(terrain, cutSet, ext, walkBlocked, sitter));
  const mFree = shellCut.length ? mobilityStats(shellCut, ext, freeMask) : { max: 0, maxGated: 0 };
  const laneFloor = Math.max(MOBILITY_TARGET, mFree.maxGated);
  /** wall tiles a defender can stand on when the room is EMPTY of mass */
  const freeReach = shellCut
    .filter((c) => freeMask[idx(c.x, c.y)])
    .sort((u, v) => u.x - v.x || u.y - v.y);

  /**
   * ONE full placement run under a hard cohesion ceiling: no extension may sit
   * further than `hubCap` interior walk steps from the sitter, and no corridor
   * may be paved past it either (a road nothing inside the ceiling can flank
   * is a road that serves nothing). Pure — it touches no state outside itself,
   * so the ladder can re-run it.
   *
   * `laneRounds` is how many greedy reservation rounds this run is allowed —
   * LANE_ROUNDS for the full reservation, a smaller number for the shrink steps
   * the ladder at the bottom walks when the full one turns out to cost personal
   * ramparts, and 0 for the honest escape hatch: a room so tight that ANY
   * reservation costs it its 60th extension gets none, because 60/60 outranks
   * the lap, always. Rounds are spent strand-first, so a shrunk reservation is
   * the one that reattaches severed battlements and skips the ratio shaving.
   */
  /**
   * `rescue` — an off-ladder deep-paving allowance, spent only by the retry at
   * the bottom of this function. See the note there. 0 on the normal path, so
   * every rung the ladder already walked is bit-for-bit what it was.
   */
  function attempt(hubCap, laneRounds, rescue = 0) {
  const pavedTiles = freshPaved();
  const roadSet = freshRoadSet();
  const blockedNow = new Set(occupied);
  /**
   * The defender lanes, filled in below once the corridor SKELETON is grown and
   * before a single extension lands. Empty until then, which is exactly right:
   * the reservation is a statement about where the MASS may go, and the skeleton
   * is not mass.
   */
  const laneSet = new Set();
  const laneInfo = {
    tiles: 0,
    deep: 0,
    rounds: 0,
    // GATED is the verdict everywhere; the ungated reading is kept beside it as
    // the complete record, never as the gate (see the lane header)
    floor: round2(mFree.maxGated),
    floorUngated: round2(mFree.max),
    worstCase: 0,
    worstCaseUngated: 0,
    // wall tiles the EMPTY room can reach that the worst case cannot — an
    // infinite lap, counted as a failure rather than dropped from the sample
    strandedFirst: 0,
    stranded: 0,
    // how many greedy rounds went on reattaching a severed battlement rather
    // than on shaving a ratio — the shrink ladder keeps exactly this prefix
    strandRounds: 0,
    bounded: 0,
    boundedUngated: 0,
    capped: false,
    used: laneRounds > 0,
    roundCap: laneRounds,
  };
  const extensions = [];
  /** the same tiles as `extensions`, for the O(1) 2x2 test below */
  const extSet = new Set();
  const stubRoads = [];
  /**
   * Road tiles that are DEFENCE, not corridor: the paved defender lane. They live
   * in `stubRoads` because they are roads this layer grew, and they are credited
   * back out of the corridor budget because `stubCap` is a statement about how
   * much road the extension mass is allowed to need — see the paving pass below.
   */
  let laneRoadCredit = 0;
  const stubUsed = () => stubRoads.length - laneRoadCredit;

  /**
   * A tile an extension could legally occupy (ignoring road adjacency), under
   * a cohesion ceiling of `cap` — the ceiling is a parameter because the flank
   * completion pass below is allowed to reach FLANK_RELAX further, and nothing
   * else is.
   */
  const extCapableAt = (x, y, cap) => {
    if (!buildable(terrain, x, y)) return false;
    const i = idx(x, y);
    if (ext[i] || hubField[i] >= 9999) return false;
    if (hubField[i] > cap) return false; // cohesion ceiling
    if (tierOf(i) < 0) return false;
    const k = key(x, y);
    // a reserved defender lane is a cut tile as far as the mass is concerned
    if (laneSet.has(k)) return false;
    // ...and so is the controller claim seat and its approach
    if (reserved.has(k)) return false;
    // ...and no extension may seal the mineral off its stand. The guard answers
    // instantly for every tile further than chebyshev 2 from the mineral, which
    // is all but a handful in any room. See mineralGuard in shared.mjs.
    if (!mGuard.ok({ x, y }, blockedNow)) return false;
    return !blockedNow.has(k) && !pavedTiles.has(k);
  };
  /**
   * THE CEILING IS +FLANK_RELAX MORE GENEROUS FOR DEEP FLOOR — and for nothing
   * else.
   *
   * A corridor may only be paved inside `hubCap`, so a tile flanking one is at
   * most hubCap+1 out: this admits precisely the SECOND FLANK of a corridor the
   * room already owns and already walks. What it is bought with is the thing the
   * ceiling's own header warns about — "a room that cannot reach the deep pocket
   * at 16 does not go without, it takes a near tile in the shallow band instead
   * and bolts a rampart to it". One extra step of filler walk against one
   * personal rampart repaired forever is not a close call, and it is only ever
   * offered to depth>=4 tiles, so the relaxation can never buy a rampart itself.
   */
  const deepReach = Math.min(hubCap + FLANK_RELAX, FLANK_HARD_CAP);
  const extCapable = (x, y) =>
    extCapableAt(x, y, tierOf(idx(x, y)) === 0 ? deepReach : hubCap);

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
   * TWO CORRIDORS FOR ONE BAR. A 2-wide slab of extensions with a road down
   * BOTH of its long sides looks dense and is the opposite: the road-to-slot
   * ratio inside it is 1:1, where the corridor pattern this layer is built
   * around is 1:2 (one lane, extensions down each face). E16S7 is the worked
   * example — extensions 37-38 x 34-38 flanked by corridors at x=36 and x=39,
   * ten slots paying for two lanes.
   *
   * BUT THE PATTERN IS ONLY WASTE WHEN THE LANES ARE ONE-SIDED. road | ext |
   * ext | road with the OUTER faces of both roads also filled is the ideal
   * packing, not a slab: two lanes serving four columns. So the test is not
   * "is this two wide", it is "are both flanking lanes serving nothing on
   * their far side, and can they never" — a lane whose outer face is already
   * an extension, or is still buildable and might become one, is doing its
   * job and this candidate is free.
   *
   * Cheap and local, like makesSquare: two axes, two orientations, four
   * lookups each. And, like makesSquare, it DEFERS rather than forbids —
   * 60/60 outranks the shape of the mass, so a room with nothing else left
   * still builds the bar and the deferral only decides the order.
   */
  const makesSlab = (x, y) => {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ]) {
      for (const s of [1, -1]) {
        const px = x + dx * s,
          py = y + dy * s; // the partner column/row of the bar
        if (!extSet.has(key(px, py))) continue;
        const ax = x - dx * s,
          ay = y - dy * s; // lane on our outer side
        const bx = px + dx * s,
          by = py + dy * s; // lane on the partner's outer side
        if (!roadSet.has(key(ax, ay)) || !roadSet.has(key(bx, by))) continue;
        // ...and both lanes must be serving nothing on their far faces
        const fax = ax - dx * s,
          fay = ay - dy * s;
        const fbx = bx + dx * s,
          fby = by + dy * s;
        const dead = (fx, fy) => !extSet.has(key(fx, fy)) && !extCapable(fx, fy);
        // BOTH, never either. Relaxing this to "one lane is one-sided" was
        // measured on the fleet: the same 234 slab tiles survive, extension
        // road-faces drop 13073 -> 13037 and the filler tour lengthens, because
        // deferring a bar whose other lane IS serving a third column moves the
        // extension somewhere worse for nothing. Only the doubly-wasteful
        // configuration is worth an order change.
        if (dead(fax, fay) && dead(fbx, fby)) return true;
      }
    }
    return false;
  };
  /** the two shape deferrals, together — see makesSquare and makesSlab */
  const deferShape = (x, y) => makesSquare(x, y) || makesSlab(x, y);
  /**
   * one candidate, invariant-checked, with the rollback. true = it landed.
   * `allowSquare` is the fallback's escape hatch: 60/60 outranks the shape of
   * the mass, so the one-at-a-time tail may brick if that is all the room has.
   */
  const tryPlace = (c, allowSquare = false, cap = null) => {
    // TARGET is a CAP, not just a goal: CONTROLLER_STRUCTURES allows 60
    // extensions at RCL8 and the 61st is a site the engine refuses. Enforced
    // here rather than at each caller — the fill walks a frontier, and every
    // loop that would otherwise have to re-check is one that can miss.
    if (extensions.length >= TARGET) return false;
    const ck = key(c.x, c.y);
    if (rejected.has(ck)) return false;
    // a candidate can go stale inside a pass (an earlier placement took its
    // tile or a stub paved it — cheap re-check)
    if (cap === null ? !extCapable(c.x, c.y) : !extCapableAt(c.x, c.y, cap)) return false;
    if (!allowSquare && deferShape(c.x, c.y)) return false;
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
      if (deferShape(c.x, c.y)) {
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
      if (stubUsed() >= stubCap) break;
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
    if (stubUsed() + dist[target] > stubCap) return 0;
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
    if (capd >= NEED_DEEP_SLOTS || stubUsed() >= stubCap) break;
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
  while (capacity() < NEED && stubUsed() < stubCap) {
    if (!growStub()) break;
  }

  // ------------------------------------------------------------------
  // DEFENDER LANES — reserved here, between the skeleton and the mass.
  //
  // WHY EXACTLY HERE. The lane reservation is a statement about where the MASS
  // may not go, so it has to be made after the skeleton (which is not mass, and
  // whose corridors are permanently walkable — a road is not an obstacle) and
  // before the first extension (which is the whole point: nothing is ever moved
  // afterwards). Everything the placement loop does from here on only ADDS
  // walkable tiles or takes tiles this pass has already priced.
  //
  // WHAT THE MASS IS MODELLED AS. EVERY TILE AN EXTENSION COULD STAND ON, all
  // blocked at once — the worst base this layer could possibly build, which is
  // the only thing that deserves the word "bound".
  //
  // The obvious objection, and the answer. Blocking every capable tile severs
  // the band just inside the wall (depth 2-3 tiles are capable), so wall tiles
  // fall out of the interior walk region — and mobilityStats only measures cut
  // tiles the walk can REACH, so they used to vanish and the model reported a
  // serene 0 for a room whose real base walked 13. That is why the model was
  // downgraded to a prediction (`roadCandidates().slice(0, 60)`), and the
  // downgrade traded a reporting bug for a soundness bug: a prediction is not a
  // bound, the placement loop pushes corridor into it as it runs, and 7 rooms
  // shipped above the number they printed.
  //
  // The reporting bug has a one-line fix that keeps the bound: a wall tile the
  // EMPTY room can reach and the worst case cannot is a FAILURE — an infinite
  // lap — and it is opened before any ratio is considered. Nothing vanishes,
  // so nothing can read low, so `bounded < floor` is unreachable by construction.
  //
  // The model is re-derived after every reservation, because a reserved tile is
  // no longer capable and therefore no longer blocked: the bound tightens as the
  // lane grows, which is exactly the loop's progress measure.
  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // ...AND THE MODEL HAS TO SURVIVE THE END OF THIS LAYER, NOT JUST THE START
  // OF IT.
  //
  // These three are hoisted out of the block below so the RE-MEASUREMENT after
  // the relocation pass can reach them. The reason there has to be one:
  // `extCapable` returns false for a tile in `pavedTiles`, so the worst-case
  // model treats every corridor stub as permanently walkable floor. The
  // end-of-layer relocation pass then LIFTS STUBS — that is the case its own
  // header calls "the case that makes the whole pass work" — and stands an
  // extension on the tile. Every tile it takes that way is mass the bound never
  // modelled.
  //
  // E11S7 is the worked example and it is not marginal: all FIVE of its
  // relocations took a stub (23,4->20,8 · 17,21->19,21 · 11,5->17,9 ·
  // 11,10->16,9 · 12,14->13,12, every one `tookStub:true`), layer 6 printed a
  // bound of 11.5, and the room shipped at 13.5 — the suite's only broken bound
  // in the fleet, and the reason it exits 1. The bound was not "nearly right":
  // it was a claim about a corridor the room does not ship.
  //
  // The fix is to re-derive the bound over the corridor that SHIPS, with the
  // lifted stubs blocked. That keeps the audit's meaning exactly (shipped lap
  // <= bound, over a blocked set that is a strict superset of the shipped mass)
  // and costs one extra all-pairs pass in the rooms that actually took a stub.
  // Blocking every paved deep tile up front was the other candidate and it is
  // worse: the stubs ARE the corridor, so pre-blocking them severs the interior
  // walk and hands most of the fleet a "no bound claimed" it has not earned.
  // ------------------------------------------------------------------
  let boundBlocked = null;
  let boundWalk = null;
  let strandsIn = null;
  if (shellCut.length) {
    /**
     * The worst base layer 6 could build: every capable tile taken at once.
     *
     * Maintained INCREMENTALLY. `extCapable` reads `laneSet`, `blockedNow` and
     * `pavedTiles`, and of those only `laneSet` moves while the greedy runs — so
     * the blocked set is scanned once and each reservation simply deletes the
     * tiles it took. Rebuilding it per round is 2300 predicate calls times ten
     * rounds times every rung of two ladders, for an answer that changes by a
     * handful of tiles.
     */
    boundBlocked = new Set(walkBlocked);
    for (let x = 1; x <= 48; x++) {
      for (let y = 1; y <= 48; y++) if (extCapable(x, y)) boundBlocked.add(key(x, y));
    }
    boundWalk = () => maskFromKeys(interiorWalk(terrain, cutSet, ext, boundBlocked, sitter));
    /** cut tiles the empty room reaches and this mask does not */
    strandsIn = (mask) => freeReach.filter((c) => !mask[idx(c.x, c.y)]);
    /** what a lane step gives up, in extension slots */
    const lanePenalty = (x, y) => {
      const k = key(x, y);
      if (laneSet.has(k) || !extCapable(x, y)) return 0; // nothing given up
      return tierOf(idx(x, y)) === 0 ? LANE_PEN_DEEP : LANE_PEN_SHALLOW;
    };
    let boundMask = boundWalk();
    let strands = strandsIn(boundMask);
    // ...and the RATIO is only computed when there is no strand to open. While a
    // battlement is severed the greedy does not look at a ratio at all (strands
    // are unconditional), and mobilityStats is the most expensive call in this
    // layer — one all-pairs BFS over every reachable wall tile.
    let m = strands.length ? null : mobilityStats(shellCut, ext, boundMask);
    laneInfo.worstCase = m ? m.maxGated : null;
    laneInfo.worstCaseUngated = m ? m.max : null;
    laneInfo.strandedFirst = strands.length;
    // Surplus deep floor only — see LANE_DEEP_MAX. The pool is counted LIVE
    // (the skeleton has already paved some of it) and over the whole interior,
    // not just what currently flanks a road: a deep tile the corridors have not
    // reached yet is still an extension slot this room owns, and the loop below
    // will go and reach it.
    let deepFree = 0;
    for (let x = 2; x <= 47; x++) {
      for (let y = 2; y <= 47; y++) if (extCapable(x, y) && tierOf(idx(x, y)) === 0) deepFree++;
    }
    // ...with a floor under it (LANE_DEEP_MIN): the cost of this reservation is
    // now measured downstream, so a zero allowance here is not caution.
    const surplus = Math.max(0, Math.min(LANE_DEEP_MAX, deepFree - LANE_DEEP_KEEP));
    const deepBudget = Math.max(surplus, Math.min(LANE_DEEP_MIN, deepFree));
    laneInfo.deepBudget = deepBudget;
    let deepSpent = 0;
    // THE BOUND IS MEASURED IN EVERY RUN, RESERVATION OR NOT. A room that ends up
    // with no lane — because the ladder priced one out — still HAS a bound: the
    // lap its unreserved mass cannot exceed. Skipping the measurement there had
    // 22 rooms reporting "no bound claimed" for no better reason than that the
    // greedy did not run. Only the greedy below is gated on `laneRounds`.
    for (let round = 0; round < laneRounds; round++) {
      let path = null;
      const strandRound = strands.length > 0;
      if (strandRound) {
        // STRANDS FIRST, AND UNCONDITIONALLY. A wall tile the worst case cannot
        // reach has no ratio to price and no gain to compare — it is the room
        // failing outright, and it is also what makes every other number in this
        // model trustworthy, because a stranded tile is a pair the metric never
        // samples. The lane runs from the stranded tile to the NEAREST tile the
        // worst case can still walk (a set, hence the predicate form of
        // shortestLane); reserving it re-attaches the tile to the garrison's
        // component and usually re-attaches its neighbours with it.
        const t = strands[0];
        path = shortestLane(freeMask, t, (i) => !!boundMask[i], lanePenalty);
        if (!path) break; // even the empty room cannot reach it — not ours
      } else {
        if (m.maxGated <= laneFloor || !m.worstGated) break;
        // WHICH PAIR TO OPEN. The max-RATIO pair is the gate, but it is a tail
        // statistic and it is frequently owned by two wall tiles four apart where
        // the garrison walks 3 and the attacker walks 2 — arithmetic that reads
        // 1.5 and that no lane can improve, because the mass is not what is in the
        // way. Aiming only at that pair aborted the whole search on its first
        // round in most rooms. So both candidates the metric reports are priced by
        // what the MASS is actually costing them — the same walk with no mass in
        // the room — and the dearer one is opened. A lap that is long because the
        // room is a ring around a mountain scores zero here and is left alone.
        //
        // The gated pair leads, because the gated reading is the verdict.
        const priced = [m.worstGated, m.worstDetour]
          .filter(Boolean)
          .map((p) => ({ p, gain: p.din - arriveAt(bfsField(freeMask, p.a), p.b) }))
          .sort((u, v) => v.gain - u.gain || u.p.a.x - v.p.a.x || u.p.a.y - v.p.a.y);
        if (!priced.length || !(priced[0].gain >= LANE_MIN_GAIN)) break;
        const { a, b } = priced[0].p;
        path = shortestLane(freeMask, a, b, lanePenalty);
        if (!path) break; // no mass-free lane between them either — not ours
      }
      // RESERVE EVERY TILE OF THE ROUTE THE MASS COULD EVER TAKE — not just the
      // ones today's prediction says it WILL.
      //
      // This used to reserve the INTERSECTION of the route with `massKeys` (the
      // first TARGET road-flanking candidates), on the reasoning that a tile the
      // mass was never going to take is already walkable and reserving it spends
      // an extension slot for nothing. The reasoning is sound and the premise is
      // false: `massKeys` is a snapshot of a skeleton that is still growing. The
      // reservation runs before the placement loop, and that loop grows more
      // corridor stubs as it goes — so a tile predicted to be MASS becomes ROAD,
      // and its neighbour, which the snapshot never listed, is promoted into the
      // mass and lands on the lane. E17S8 is the worked example: the snapshot had
      // 43,34 as an extension and never listed 43,35; the built room paved 43,34
      // and put an extension on 43,35, straight across the only lane between the
      // 46,32 and 46,37 battlements. The model reported a bounded lap of 1.75 and
      // the room shipped at 4 — a bound that is not a bound.
      //
      // A route is stable; a snapshot of the mass is not. So the reservation is
      // the route intersected with what is BUILDABLE AT ALL (`extCapable`), which
      // is the true set of tiles an extension could ever occupy on this lane.
      // Tiles that are not buildable — roads, objects, tight terrain — still cost
      // nothing and are still skipped. The extra tiles this takes are charged to
      // the same deep budget as before, so the upkeep ceiling is unchanged, and
      // the paving pass below turns them into corridor that hands its own
      // neighbours a road face rather than an invisible no-build stripe.
      const add = [];
      let deepAdd = 0;
      for (const i of path) {
        const x = i % 50,
          y = (i / 50) | 0;
        const k = key(x, y);
        if (laneSet.has(k) || !extCapable(x, y)) continue;
        add.push(k);
        if (tierOf(i) === 0) deepAdd++;
      }
      if (!add.length) break; // the route is already clear of the mass
      if (deepSpent + deepAdd > deepBudget) {
        laneInfo.capped = true;
        break;
      }
      for (const k of add) {
        laneSet.add(k);
        boundBlocked.delete(k); // a reserved tile is no longer capable
      }
      deepSpent += deepAdd;
      laneInfo.rounds++;
      if (strandRound) laneInfo.strandRounds++;
      boundMask = boundWalk();
      strands = strandsIn(boundMask);
      m = strands.length ? null : mobilityStats(shellCut, ext, boundMask);
    }
    // A MODEL WITH A HOLE IN ITS SAMPLE HAS NO BOUND TO PRINT. Any wall tile the
    // worst case still cannot reach has an infinite lap, so the maximum over the
    // pairs that survived is not an upper bound on anything — it is reported as
    // no bound at all, and layer 7 says so rather than quoting the number.
    laneInfo.bounded = m ? m.maxGated : null;
    laneInfo.boundedUngated = m ? m.max : null;
    laneInfo.stranded = strands.length;
    laneInfo.tiles = laneSet.size;
    laneInfo.deep = deepSpent;

    // ---- PAVE THE LANE. A reserved tile is floor the mass may not build on;
    //      left bare that is a slot spent on nothing. Paved, it is CORRIDOR —
    //      the tile still carries the garrison (a road is not an obstacle, so
    //      the lane is unchanged) and it now hands its own D4 neighbours a road
    //      face they did not have, which is how a lateral defence lane pays for
    //      itself in extension slots instead of costing them. It is also what
    //      the plan should look like: a corridor across the base with the mass
    //      flanking it, rather than an invisible no-build stripe.
    //
    //      Only tiles that join the LIVE network are paved, and only while the
    //      room's paving budget lasts; the rest stay bare and walkable, which
    //      is all the lane strictly needs. Layer 7's removability fixpoint
    //      deletes any of these that ends up serving nothing.
    for (let guard = 0; guard < 4; guard++) {
      let progress = false;
      for (const k of [...laneSet].sort()) {
        if (pavedTiles.has(k) || stubUsed() >= stubCap) continue;
        const [x, y] = k.split(",").map(Number);
        if (!stubTile(x, y)) continue;
        if (!D8.some(([dx, dy]) => roadSet.has(key(x + dx, y + dy)))) continue;
        pavedTiles.add(k);
        roadSet.add(k);
        stubRoads.push({ x, y });
        // ...and it does NOT come out of the corridor budget. `stubCap` sizes the
        // road net the MASS needs to reach 60 extensions; a paved defender lane is
        // not that net, it is a wall asset that happens to be a road. Charging it
        // to the same account is how a reservation ended up buying itself with the
        // room's last few deep slots: the skeleton hit the cap, the deep-capacity
        // recovery below could not run, and the tail of the mass went into the
        // shallow band with a personal rampart bolted to it (E13S2, E15S3, E18S4).
        laneRoadCredit++;
        laneInfo.paved = (laneInfo.paved || 0) + 1;
        progress = true;
      }
      if (!progress) break;
    }

    // ---- and put the deep capacity back. The reservation takes road-flanking
    //      DEEP slots off the table, and the skeleton stopped growing the
    //      moment it had NEED_DEEP_SLOTS of them — so a two-tile lane can leave
    //      the room one deep slot short of the mass and the 60th extension goes
    //      into the shallow band with a personal rampart bolted to it, which is
    //      the exact upkeep this planner is trying to delete. Same loop phase 1
    //      used, same net-progress rule: only deep-hunting stubs, and only while
    //      they actually raise the count.
    for (;;) {
      const capd = capacityDeep();
      if (capd >= NEED_DEEP_SLOTS || stubUsed() >= stubCap) break;
      if (!growDeepStub() || capacityDeep() <= capd) break;
    }
  }

  // ------------------------------------------------------------------
  // THE CORRIDOR BUDGET IS THE REASON, AND IT DOES NOT SAY SO.
  //
  // `deepExhausted` reads like "this room has no deep floor left", and in the
  // seven rooms that ship the fleet's avoidable shallow extensions it is FALSE
  // — which reads like the placement simply chose badly. It did not. Phase 1
  // has three exits and only ONE of them sets that flag: `digDeep()` coming
  // back empty. The other two are `capacityDeep() >= NEED_DEEP_SLOTS` and
  // `stubUsed() >= stubCap`, and in all seven rooms it is the third — every one
  // of them ends on stubUsed() == 51 == MAX_STUB_ROADS_RICH, with
  // NEED_DEEP_SLOTS = 66 arithmetically out of reach. The mass then starts with
  // the paving budget already spent, so the loop below breaks after its FIRST
  // pass (`if (stubUsed() >= stubCap) break`) and the whole program, deep tiles
  // and shallow tiles alike, is laid from one snapshot with no possibility of
  // growing another corridor to reach the deep floor that is left.
  //
  // Measured, at ship time, in those seven rooms: between 1 and 15 free deep
  // tiles remain — and between 0 and 1 of them have a road face, because roads
  // and extensions compete for the same floor and 41-51 deep tiles went under
  // the corridor. So the honest finding is that the deep floor is NOT sitting
  // there road-faced and ignored. What is missing is the corridor to reach it.
  //
  // Hence a RESCUE and not a re-sort: a small extra paving allowance, spent
  // only when the budget is genuinely exhausted, offering ONLY tier-0
  // candidates so the pass can never buy its way to a shallow tile. It is
  // funded through laneRoadCredit — the same accounting the lane reservation
  // uses — and anything it does not spend is handed straight back, so a room it
  // cannot help pays nothing. Lane reservations, the M4/C3 invariants and the
  // shape deferrals are untouched.
  //
  // Sizing is measured, not chosen: raising MAX_STUB_ROADS_RICH itself (60, 75,
  // 120) takes the seven rooms from 22 shallow to 18 but makes E14S6 WORSE
  // (9 -> 10), because a bigger budget also eats more deep floor. A 4-tile
  // rescue, arbitrated so it cannot regress (see the retry at the bottom),
  // takes the fleet from 85 shallow to 82 with ramparts down 3, roads up 4, the
  // cut unchanged and the filler tour p50/p90/max unchanged.
  // ------------------------------------------------------------------
  let rescueSpent = 0;
  if (rescue > 0 && stubUsed() >= stubCap) {
    laneRoadCredit += rescue;
    for (let g = 0; g < 300 && extensions.length < TARGET; g++) {
      place(roadCandidates().filter((c) => c.tier === 0));
      if (extensions.length >= TARGET || rescueSpent >= rescue) break;
      const n0 = stubRoads.length;
      if (!growDeepStub()) digDeep();
      const spent = stubRoads.length - n0;
      if (spent === 0) break;
      rescueSpent += spent;
    }
    laneRoadCredit -= Math.max(0, rescue - rescueSpent);
  }

  let stalls = 0;
  for (let guard = 0; guard < 300 && extensions.length < TARGET; guard++) {
    const before = extensions.length;
    place(roadCandidates());
    if (extensions.length >= TARGET) break;
    if (extensions.length > before) stalls = 0;
    else if (++stalls > MAX_STALLS) break;
    if (stubUsed() >= stubCap) break;
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

  // ------------------------------------------------------------------
  // SHALLOW RELOCATION — the last thing this layer does, and the only thing
  // it does that moves a tile it already placed.
  // ------------------------------------------------------------------
  // A shallow extension is a personal rampart forever: 0.03 e/tick, a repair
  // target inside a ranged attacker's envelope, and a tile the defenders have
  // to care about. The fleet shipped 82 of them, and the rooms that shipped
  // them said — in a note this planner generates — that "what survives is deep
  // floor with no road face and no budget left to give it one."
  //
  // THAT SENTENCE WAS FALSE, and it was false in six rooms at once. E14S6
  // shipped nine depth-3 extensions (9,29 9,31 9,32 10,24 12,22 12,34 16,38
  // 17,39 21,39) while nine empty, interior, non-wall tiles at depth 4-8 stood
  // there with one to three EXISTING D4 road faces each — 10,26 (roads 9,26
  // 10,27 10,25), 11,29, 13,27, 15,21, 15,25, 16,29, 18,30, 19,31, 23,30. Not
  // floor that needed a corridor built to it. Floor with the corridor already
  // paid for, already next to it. The same wording and the same situation in
  // E18S4 (4), E17S4 (3), E7S1 (2), E14S7 (1) and E9S6 (1), and across the 21
  // shallow rooms 64 of the 82 turned out to be relocatable.
  //
  // The rescue above is aimed at the OTHER cause (deep floor that genuinely
  // has no road face, which needs paving budget). It cannot see this one,
  // because by the time the last extension lands the corridor that would have
  // served the deep tile already exists — it was laid for a different tile.
  // So this pass asks the one question nothing else asks: is there a free
  // DEEP tile, with a road face that already exists, that this shallow
  // extension could simply stand on instead?
  //
  // WHY THIS IS NOT THE REPAIR LOOP THE PLANNER IS NOT ALLOWED TO HAVE. The
  // anti-pattern is a LATER layer reaching back to patch an EARLIER layer's
  // output — layer 7 relocating extensions to flatter its own mobility number
  // was deleted for exactly that reason (see verifyMobility in layer-walls).
  // This is layer 6 finishing its own job, inside its own pass, against its
  // own invariant, before it has published anything. It moves nothing that
  // belongs to another layer, it changes no count, it paves no road and it
  // buys no rampart — a relocation that cannot find a free deep road-faced
  // tile simply does not happen, and the room keeps its shallow slot and its
  // (now accurate) explanation.
  //
  // EVERY MOVE IS INVARIANT-CHECKED on the completed swap — the trial board
  // has the shallow tile already freed and the deep tile already taken, so the
  // one call sees the moved extension's own face (which is why tryPlace needs
  // two calls and this needs one: tryPlace tests a board the candidate is not
  // on yet). The board must keep the sitter's walk region connected to every
  // structure face, every extension's D4 face, every wall tile the defenders
  // stand on and every road. Two further guards are specific to this pass:
  // nobody may lose their last D4 road face, and the road network may not
  // fragment. A move that fails any of them is rolled back completely — the
  // road it lifted included — and the shallow slot stands.
  //
  // Targets are shortlisted nearest-to-the-slot and then tried closest-to-hub
  // first, so a relocation is a local move that still prefers to land inside.
  // Measured on E14S6: 8 of its 9 shallow slots relocate, 7 of them to a tile
  // at or nearer the hub (up to 6 steps nearer) and one to a tile one step
  // farther out. The preference is a sort key, not a constraint — a slot that
  // can only reach a slightly more distant deep tile still takes it, because
  // one extra filler step per trip beats a rampart bill every tick forever.
  // `relocated[].closer` records the delta per move so the trade is auditable
  // rather than assumed.
  const relocated = [];
  if (shallow.length) {
    for (let pass = 0; pass <= shallow.length; pass++) {
      let moved = false;
      // the loosest ceiling any slot in this round could justify — the
      // per-slot test below is the one that actually binds
      const farthestShallow = Math.max(...shallow.map((s) => hubField[idx(s.x, s.y)] || 0));
      // THE TARGET LIST IS BUILT ONCE PER ROUND, NOT ONCE PER SHALLOW SLOT.
      // It is a property of the board, and inside a round the board does not
      // move — rebuilding it per slot re-scanned 2116 tiles for every one of
      // them and bought nothing. Only the nearest RELOC_TRIALS candidates are
      // ever tried: the list is sorted by walk distance from the sitter, the
      // whole point of the move is to land closer, and an unbounded trial list
      // is what took E4S7 from 6.8s to 17.9s on its own.
      const targets = [];
      for (let x = 2; x <= 47; x++) {
        for (let y = 2; y <= 47; y++) {
          const i = idx(x, y);
          if (tierOf(i) !== 0) continue; // deep only — never a lateral shuffle
          const tk = key(x, y);
          if (blockedNow.has(tk)) continue; // carries a structure
          // NOTE: `rejected` is deliberately NOT consulted here. It memoises
          // tiles the invariant refused as fresh ADDITIONS, with the whole
          // mass in place. A relocation is a SWAP: it frees a tile before it
          // takes one, so the free region it is tested against is strictly
          // larger and one face constraint is strictly gone. A refusal
          // measured under the harder condition says nothing about the
          // easier one, and honouring it here was hiding real moves — the
          // invariant below is still run, twice, so nothing unsafe gets
          // through by widening the candidate set.
          if (!buildable(terrain, x, y) || ext[i]) continue;
          // COHESION CEILING, RELAXED TO "NEVER WORSE THAN WHAT WE VACATE".
          // The hard ceiling exists to stop the mass sprawling, and a fresh
          // placement is rightly held to it. A relocation is not a fresh
          // placement: it vacates a tile that is ALREADY in the mass at its
          // own walk distance, so the honest ceiling for the target is the
          // looser of the ceiling and the slot being given up.
          //
          // MEASURED: on the current fleet this relaxation changes nothing —
          // the far deep tiles it admits (E13S0's 35,8 / 36,8 / 37,9 among
          // them) are refused by the walk invariant below for an unrelated
          // reason. It is kept because the strict form was wrong in principle,
          // not because it bought anything here, and that distinction is
          // recorded so the next reader does not go looking for the win.
          if (hubField[i] >= 9999) continue;
          if (hubField[i] > Math.max(deepReach, farthestShallow)) continue;
          if (laneSet.has(tk)) continue; // a reserved defender lane is not ours to take
          // ...and neither is the controller claim seat or its approach. This pass
          // builds its own candidate list rather than going through extCapableAt,
          // so it needs the ban restated: E11S7 and E5S6 relocated an extension
          // straight onto the reserved seat and sealed their own controller in.
          if (reserved.has(tk)) continue;
          if (!mGuard.ok({ x, y }, blockedNow)) continue;
          if (deferShape(x, y)) continue;
          // THE ROAD FACE HAS TO ALREADY EXIST — this pass never paves. A
          // stub road ON the tile does not count as its own face.
          const faced = D4.some(([dx, dy]) => {
            const fx = x + dx,
              fy = y + dy;
            return (fx !== x || fy !== y) && roadSet.has(key(fx, fy));
          });
          if (!faced) continue;
          targets.push({ x, y, d: hubField[i], paved: pavedTiles.has(tk) });
        }
      }
      if (!targets.length) break;
      targets.sort((a, b) => a.d - b.d || a.x - b.x || a.y - b.y);
      for (const s of shallow.slice()) {
        const sk = key(s.x, s.y);
        // ------------------------------------------------------------
        // THE SHORTLIST IS LOCAL TO THE SLOT, AND THAT IS NOT AN
        // OPTIMISATION DETAIL — IT IS THE DIFFERENCE BETWEEN 1 AND 7.
        // ------------------------------------------------------------
        // The obvious shortlist is "the RELOC_TRIALS tiles closest to the
        // hub", since landing closer to the hub is the point. Measured on
        // E14S6 it relocates ONE slot of nine, against seven for an
        // uncapped list. The reason is not subtle once seen: the free deep
        // road-faced tiles nearest the hub are the ones the mass has already
        // grown around, so they fail the placement invariant one after
        // another, and sixteen of them in a row is a shortlist that never
        // reaches the tile that works.
        //
        // A relocation is a LOCAL move, so the candidate set is chosen
        // locally — the RELOC_TRIALS tiles nearest THIS slot — and then
        // tried in hub-distance order inside that set, which keeps the
        // "lands closer to the hub" preference where it belongs. Tiles an
        // earlier slot claimed this round are dropped before the cap
        // applies rather than counted against it.
        const slotDist = hubField[idx(s.x, s.y)] || 0;
        const shortlist = targets
          .filter((t) => !blockedNow.has(key(t.x, t.y)))
          // ...and THIS slot's own ceiling: the move may not push the mass
          // further out than the tile it is giving up (see the ceiling note
          // on the scan above)
          .filter((t) => t.d <= Math.max(deepReach, slotDist))
          .map((t) => ({ t, near: Math.max(Math.abs(t.x - s.x), Math.abs(t.y - s.y)) }))
          .sort((a, b) => a.near - b.near || a.t.d - b.t.d || a.t.x - b.t.x || a.t.y - b.t.y)
          .slice(0, RELOC_TRIALS)
          .sort((a, b) => a.t.d - b.t.d || a.near - b.near || a.t.x - b.t.x || a.t.y - b.t.y)
          .map((e) => e.t);

        for (const t of shortlist) {
          const tk = key(t.x, t.y);
          // --- trial: lift the shallow one, stand it on the deep one -----
          const ei = extensions.findIndex((e) => e.x === s.x && e.y === s.y);
          if (ei < 0) break;
          const roadIdx = t.paved ? stubRoads.findIndex((r) => r.x === t.x && r.y === t.y) : -1;
          const rollback = () => {
            extensions.pop();
            extSet.delete(tk);
            blockedNow.delete(tk);
            extensions.splice(ei, 0, { x: s.x, y: s.y });
            extSet.add(sk);
            blockedNow.add(sk);
            if (t.paved) {
              roadSet.add(tk);
              pavedTiles.add(tk);
              if (roadIdx >= 0) stubRoads.splice(roadIdx, 0, { x: t.x, y: t.y });
            }
          };
          extensions.splice(ei, 1);
          extSet.delete(sk);
          blockedNow.delete(sk);
          extensions.push({ x: t.x, y: t.y });
          extSet.add(tk);
          blockedNow.add(tk);
          // A STUB ON THE TARGET IS LIFTED WITH IT. This is the case that
          // makes the whole pass work and it took a while to see: the deep
          // road-faced floor the fleet leaves empty is floor THIS LAYER
          // PAVED as a corridor stub and then refused to build on, which
          // layer 7 subsequently prunes as a dead end. So the tile reads
          // "paved" here and ships empty. Standing an extension on it is
          // therefore not taking a road away from anybody — it is taking
          // back a stub whose only errand was to reach this tile. The two
          // guards below are what make that safe rather than merely true.
          if (t.paved) {
            roadSet.delete(tk);
            pavedTiles.delete(tk);
            if (roadIdx >= 0) stubRoads.splice(roadIdx, 1);
          }
          // GUARD 1 — nobody loses their road face. The owner's bar is that
          // the filler services the mass without leaving the network, so an
          // extension whose only D4 road was the tile we just took is a
          // regression even though every walk invariant still holds.
          const keepsFaces = extensions.every((e) =>
            D4.some(([dx, dy]) => roadSet.has(key(e.x + dx, e.y + dy))),
          );
          // GUARD 2 — the road network does not fragment. Removing a stub
          // that happened to be a bridge would leave orphan road behind it,
          // which is a gate of its own. Containers conduct, exactly as the
          // road-network definition everywhere else in this suite has it.
          const netWhole = (() => {
            if (!t.paved) return true;
            const net = new Set(roadSet);
            for (const c of plan.structures.container || []) net.add(key(c.x, c.y));
            net.add(key(sitter.x, sitter.y));
            const seen = new Set([key(sitter.x, sitter.y)]);
            const q = [sitter];
            for (let qi = 0; qi < q.length; qi++) {
              const cur = q[qi];
              for (const [dx, dy] of D8) {
                const nx = cur.x + dx,
                  ny = cur.y + dy;
                const nk = key(nx, ny);
                if (seen.has(nk) || !net.has(nk)) continue;
                seen.add(nk);
                q.push({ x: nx, y: ny });
              }
            }
            for (const rk of roadSet) if (!seen.has(rk)) return false;
            return true;
          })();
          if (!keepsFaces || !netWhole || !invariantHolds(blockedNow)) {
            rollback();
            continue;
          }
          shallow.splice(
            shallow.findIndex((e) => e.x === s.x && e.y === s.y),
            1,
          );
          relocated.push({
            from: { x: s.x, y: s.y },
            to: { x: t.x, y: t.y },
            closer: hubField[idx(s.x, s.y)] - t.d,
            tookStub: !!t.paved,
          });
          moved = true;
          break;
        }
        // NO "THIS SLOT IS HOPELESS" MEMO ACROSS ROUNDS, deliberately. A round
        // only happens at all because the previous one MOVED something, and a
        // move changes roadSet, pavedTiles and the free region — which is
        // exactly what a slot's verdict is a function of. Caching the verdict
        // across a move skipped eight of E14S6's nine slots on stale evidence
        // and relocated one where seven were available. The loop's own "no
        // move this round, stop" is the termination condition and it is the
        // honest one.
      }
      if (!moved) break;
    }
  }

  // ------------------------------------------------------------------
  // THE BOUND, RE-DERIVED OVER THE CORRIDOR THE ROOM SHIPS.
  //
  // See the hoist note above `if (shellCut.length)`. Every stub the relocation
  // pass lifted is a tile the worst-case model counted as walkable corridor and
  // the finished room fills with an extension, so the number measured before the
  // pass is a claim about a base this room does not build. Re-measure with those
  // tiles blocked; nothing else moves, and a room that took no stub pays nothing.
  //
  // The strand rule is unchanged and still absolute: if blocking the lifted
  // stubs severs a battlement the empty room could reach, this room has NO
  // finite bound and says so (`bounded = null`), rather than quoting the maximum
  // over the pairs that happened to survive. layer-walls prints "measured no
  // finite bound for this room" for exactly that case.
  // ------------------------------------------------------------------
  const liftedStubs = relocated.filter((r) => r.tookStub).map((r) => key(r.to.x, r.to.y));
  if (boundBlocked && liftedStubs.length) {
    let added = 0;
    for (const k of liftedStubs)
      if (!boundBlocked.has(k)) {
        boundBlocked.add(k);
        added++;
      }
    if (added) {
      const mask = boundWalk();
      const strands = strandsIn(mask);
      const m2 = strands.length ? null : mobilityStats(shellCut, ext, mask);
      laneInfo.boundBeforeStubs = laneInfo.bounded;
      laneInfo.bounded = m2 ? m2.maxGated : null;
      laneInfo.boundedUngated = m2 ? m2.max : null;
      laneInfo.stranded = strands.length;
      laneInfo.stubsLifted = added;
    }
  }

  // BUILD ORDER, ON THE BASE WE ACTUALLY BUILT.
  //
  // The live bot sites the plan array's first N extensions at each RCL cap
  // (5/10/20/30/40/50/60) — the array order IS the growth story of the room.
  // Placement order is depth-first (a safety concern); the young room's concern
  // is the filler tour, so the final array walks outward from the sitter.
  //
  // WHAT WAS WRONG WITH IT. "Outward" was measured on `hubField`, which is the
  // walk field of the board as it stood when this layer STARTED — the hub kit
  // and the eco works, and nothing else. By the time the room is finished there
  // are sixty extensions standing in that field, and the tile that was 8 steps
  // out across open floor is 14 steps out around the mass. Fleet-wide that put
  // 2306 extensions in a cap prefix ahead of a strictly closer one (E16S7 had
  // walk-8 tiles in its first twenty while 35 closer entries waited; E20S7 had
  // four walk-17/18 tiles inside its first twenty). The +3 shallow penalty then
  // reordered a field that was already wrong.
  //
  // So the field is re-derived HERE, after the last placement, over the finished
  // interior: every structure blocks (including every other extension), roads
  // and floor are walkable, and an extension's distance is one step off the
  // nearest walkable D4 face — the tile the filler actually stands on. The +3
  // shallow penalty is kept: early eras have no spare rampart sites to spend.
  const shallowSet = new Set(shallow.map((s) => key(s.x, s.y)));
  const builtField = (() => {
    const blocked = new Set(walkBlocked);
    for (const e of extensions) blocked.add(key(e.x, e.y));
    return bfsField(maskFromKeys(interiorWalk(terrain, cutSet, ext, blocked, sitter)), sitter);
  })();
  const buildCost = (e) => {
    let best = 9999;
    for (const [dx, dy] of D4) {
      const x = e.x + dx,
        y = e.y + dy;
      if (x < 0 || y < 0 || x > 49 || y > 49) continue;
      const d = builtField[idx(x, y)];
      if (d >= 0 && d + 1 < best) best = d + 1;
    }
    // an extension with no walkable D4 face cannot exist (the invariant refuses
    // it), so this is the unreachable-pocket guard, not a real case
    return best + (shallowSet.has(key(e.x, e.y)) ? 3 : 0);
  };
  extensions.sort((a, b) => buildCost(a) - buildCost(b) || a.y - b.y || a.x - b.x);

  // ------------------------------------------------------------------
  // THE LAP THIS RUN ACTUALLY BUILT — measured, not bounded.
  //
  // The bound is what the reservation is FOR; it is not what the reservation is
  // WORTH. Pricing the lane off the bound pays the same ramparts for tightening
  // a worst case nobody will ever build as for shortening the lap the garrison
  // walks, and measured across the fleet that was 40 extra personal ramparts.
  // The mass exists by this line, so the real number is one walk away: block
  // exactly these 60 extensions and take the gated lap. Layer 7 re-measures it
  // on the completely finished base (roads, spurs, the inert-rampart prune) and
  // that stays the number of record — this is the one the LADDER can compare,
  // because it is the only lap that exists while there is still a choice to make.
  // ------------------------------------------------------------------
  let builtLap = 0;
  if (shellCut.length) {
    const b = new Set(walkBlocked);
    for (const e of extensions) b.add(key(e.x, e.y));
    builtLap = mobilityStats(shellCut, ext, maskFromKeys(interiorWalk(terrain, cutSet, ext, b, sitter))).maxGated;
  }
  laneInfo.builtLap = builtLap;

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
      // THE FLAG THAT ACTUALLY EXPLAINS A SHALLOW EXTENSION. deepExhausted is
      // true only when a dig came back empty; a room whose phase 1 ran out of
      // PAVING budget reports false and looks like a placement failure. Both
      // exits are now visible, so a declaration can name the real one.
      stubExhausted: stubUsed() >= stubCap,
      stubCap,
      rescueSpent,
      // shallow slots this pass moved onto free deep floor whose road face
      // ALREADY existed — see the relocation header. Each entry names both
      // tiles and how many steps closer to the hub the move landed.
      relocated,
      relocatedCount: relocated.length,
      digRoads,
      corridorPlaced,
      corridorFallback: extensions.length - corridorPlaced,
      deepReach,
      maxHubDist: extensions.length ? Math.max(...extensions.map((e) => hubField[idx(e.x, e.y)])) : 0,
      hubDistCap: hubCap,
      // the reservation this run honoured (see the lane header). `used: false`
      // means the ladder had to drop it to reach 60 — declared, never silent.
      lanes: laneSet.size,
      laneMeta: laneInfo,
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
  const walkLadder = (laneRounds) => {
    let out = null;
    for (const cap of HUB_CAP_LADDER) {
      const run = attempt(cap, laneRounds);
      if (!out || betterRun(run, out)) out = run;
      if (run.extension.length >= TARGET) break;
    }
    return out;
  };
  let out = walkLadder(LANE_ROUNDS);
  /**
   * THE RESERVATION HAS TO BE FREE, AND THE ONLY WAY TO KNOW IS TO ASK.
   *
   * Two things outrank a short defender lap, and both are checked by re-walking
   * the whole ladder with no reservation at all and comparing the two rooms:
   *
   *   60/60          an extension short is permanent spawn-throughput loss.
   *   PERSONAL RAMPARTS  a lane that pushes an extension out of the deep band
   *                  buys a rampart that decays and is repaired forever. Nine
   *                  in ten reserved deep tiles cost nothing (the displaced
   *                  extension takes the next deep tile along) — this is how
   *                  the tenth is caught.
   *
   * The bare walk is only paid for by the rooms that might fail one of those
   * tests, so most of the fleet never composes it. Whatever is refused is
   * recorded in laneMeta, and layer 7's verification pass then measures the lap
   * the refusal cost — loudly, rather than papering over it.
   *
   * SHRINK BEFORE DROPPING. This used to be all-or-nothing, and all-or-nothing
   * is what turned an honest model into a lap regression: once the model became
   * the true bound the reservations grew (E13S2 wanted 37 tiles where the old
   * prediction wanted 14), so the whole thing crossed the premium and the room
   * shipped with NO reservation and a worse lap than it had before. A reservation
   * is not one decision, it is a sequence of rounds, and rounds are spent
   * strand-first — so the affordable prefix is exactly the part that reattaches
   * severed battlements and stops before the ratio shaving. The ladder therefore
   * walks the round budget down and keeps the LARGEST reservation the room can
   * actually pay for; only a room where even one round is too dear goes bare.
   */
  const lm = out.extMeta.laneMeta;
  // WHEN THE BARE WALK IS OWED. Any reservation at all, plus either a missing
  // extension or a single personal rampart. The trigger used to additionally
  // demand `lm.deep > 0` — on the theory that only a lane through the DEEP core
  // can displace an extension into the shallow band — and that theory is false:
  // a reserved shallow tile is a road-flanking slot like any other, so the mass
  // shuffles outward and the tail lands one band shallower. E11S6 reserved two
  // tiles, neither of them deep, and shipped NINE personal ramparts that were
  // never priced against a room that reserved nothing.
  if (lm.tiles && (out.extension.length < TARGET || out.extMeta.shallow > 0)) {
    const bare = walkLadder(0);
    const shorter = bare.extension.length > out.extension.length;
    // WHAT A LAP IS WORTH IN RAMPARTS. Upkeep is the first objective, so the
    // default answer is "nothing" — but a room whose garrison lap halves is not
    // the same trade as one that shaves a rounding error, and pricing them the
    // same refuses both. The premium is the same shape the pipeline's own
    // mobility rung uses: bounded, spendable only to buy a measured improvement,
    // and never spendable to make an already-fine room prettier.
    //
    // AND A RATIO IS NOT THE ONLY THING A LANE BUYS. When the unreserved model
    // STRANDED wall tiles, its lap is not a number at all — a tile the worst
    // case cannot reach has an infinite lap, and `worstCase` in that room is a
    // maximum taken over the pairs that survived the hole. Subtracting the
    // bounded lap from it is meaningless and in 5 rooms it came out NEGATIVE,
    // which zeroed the premium and dropped lanes that were doing real work
    // (E9S6 shipped 7.67 where the kept reservation shipped 6). Reattaching a
    // stranded battlement is worth the top of the ladder — and no more than the
    // top, because upkeep is still the first objective.
    //
    // THE PRICE IS A RATE, NOT A LADDER. It used to be a three-step staircase
    // (3/2/1/0 ramparts by gain band) invented here, while the pipeline priced
    // the identical trade — wall for lap — with its own unrelated rule. One
    // currency, one exchange rate: RAMPARTS_PER_RATIO ramparts per 1.0 of lap
    // reclaimed, capped at MOBILITY_RAMPART_CAP, the same numbers the escalation
    // ladder spends (see pipeline.mjs MOBILITY_PREMIUM). A room that halves its
    // lap can pay for it; a room shaving a rounding error still cannot.
    //
    // ...AND WHAT IS PRICED IS THE LAP THIS ROOM ACTUALLY GETS, not the bound.
    // Paying the published rate for a tighter WORST CASE bought the fleet 40
    // personal ramparts (79 shallow extensions to 119) in rooms whose real mass
    // was nowhere near the worst case, and in three of them the reservation the
    // premium paid for made the BUILT lap worse (E9S5 3.8 -> 7). Every candidate
    // measures its own lap now (see laneInfo.builtLap), so the trade is the
    // fleet's one trade — ramparts for a lap somebody walks.
    //
    // ...AND A LAP THE ROOM CAN FIX IS WORTH MORE THAN ONE IT CANNOT. Where the
    // EMPTY room's gated lap already misses the target, no reservation makes the
    // garrison quick: it makes a bad lap less bad and the room still ships
    // OVER-TARGET. That is worth real ramparts — a 9.0 lap and a 7.0 lap are not
    // the same siege — and it is not worth the SAME ramparts as clearing the gate
    // outright, because clearing it changes what the room is. Full published rate
    // where the mass is the whole cause; half rate where the terrain already beat
    // the room. (Measured: the difference is 5 personal ramparts across 3 rooms.)
    const rate = lm.floor <= MOBILITY_TARGET ? LANE_RAMPARTS_PER_RATIO : LANE_RAMPARTS_PER_RATIO / 2;
    const gainOf = (run) => bare.extMeta.laneMeta.builtLap - run.extMeta.laneMeta.builtLap;
    const costOf = (run) => run.extMeta.shallow - bare.extMeta.shallow;
    const allowance = (g) => (g <= 0 ? 0 : Math.min(MOBILITY_RAMPART_CAP, Math.floor(rate * g)));
    /** does this run cost more than 60/60 or the lap it buys is worth? */
    const tooDear = (run) =>
      run.extension.length < bare.extension.length || costOf(run) > allowance(gainOf(run));
    const unsealed = (lm.strandedFirst ?? 0) - (lm.stranded ?? 0);
    const gain = gainOf(out);
    const premium = allowance(gain);
    const shorterOrDearer = shorter || tooDear(out);
    const dearer = !shorter && shorterOrDearer;
    // ------------------------------------------------------------------
    // THE SHRINK SEARCH — a straight comparison of every room this reservation
    // could produce, INCLUDING the room with no reservation at all.
    //
    // Every prefix of the greedy is a candidate, and so is r = 0. Rounds are
    // spent strand-first, so a prefix is "reattach the severed battlements, then
    // as much ratio shaving as this room is willing to pay for". The winner is
    // the one with the shortest MEASURED lap, and on a tie the one that rents the
    // fewest personal ramparts — which is why r = 0 sorts first and an ineffective
    // reservation is simply not taken.
    //
    // Two things that were tried and were wrong. Keeping the LONGEST affordable
    // prefix: the last rounds of a reservation often move nothing while still
    // displacing extensions into the shallow band. Keeping the prefix with the
    // best BOUND: E11S7 and E7S9 both took a free one-round prefix that tightened
    // the worst case and LENGTHENED the room's real lap, because a cost of zero
    // passes any price test — a lane that makes the lap worse is not a bargain at
    // any price, and comparing measured laps is what says so.
    //
    // Bounded work: at most LANE_ROUNDS extra ladder walks, paid only by rooms
    // whose reservation cost an extension or a rampart at all.
    const used = lm.rounds || 0;
    const lapOf = (run) => run.extMeta.laneMeta.builtLap;
    const cands = [{ r: 0, run: bare }];
    if (!shorterOrDearer) cands.push({ r: used, run: out });
    for (let r = used - 1; r >= 1; r--) {
      const trial = walkLadder(r);
      if (trial.extMeta.laneMeta.tiles && !tooDear(trial)) cands.push({ r, run: trial });
    }
    {
      const bb = Math.min(...cands.map((c) => lapOf(c.run)));
      const pick = cands
        .filter((c) => lapOf(c.run) <= bb + 1e-9)
        .sort((a, b) => a.run.extMeta.shallow - b.run.extMeta.shallow || a.r - b.r)[0];
      if (pick.r !== 0) {
        if (pick.r !== used) {
          pick.run.extMeta.laneMeta.shrunk = { from: LANE_ROUNDS, to: pick.r, wanted: lm.tiles, premium };
        }
        return pick.run;
      }
    }
    {
      // r = 0 WON. Either the reservation cost more than the lap it buys, or it
      // bought no lap at all — both are the same outcome for the room and both
      // are recorded, because a reservation the planner wanted and did not take
      // is exactly the kind of thing that must not go quiet.
      bare.extMeta.laneMeta = {
        // the reserved run's diagnosis of the room (what it wanted and why)...
        ...lm,
        // ...over THIS run's own measurements. Spreading `lm` wholesale left the
        // unreserved room quoting the reserved room's lap and bound, which is the
        // same class of lie the bound claim itself was.
        builtLap: bare.extMeta.laneMeta.builtLap,
        rounds: 0,
        strandRounds: 0,
        roundCap: 0,
        tiles: 0,
        deep: 0,
        dropped: true,
        droppedFor: shorter ? "extensions" : dearer ? "ramparts" : "no-gain",
        wanted: lm.tiles,
        // NOTHING IS BOUNDED HERE. `bounded` is the lap the RESERVED room could
        // not exceed; this room is the unreserved one, so the claim does not
        // transfer and must not be printed as if it did. It is kept, renamed, as
        // the thing that was given up.
        // ...including the bound: the unreserved run measures its own, so this
        // room still ships a claim it can hold. What is NOT transferable is the
        // reserved run's bound, which is kept beside it as the thing given up.
        bounded: bare.extMeta.laneMeta.bounded,
        boundedUngated: bare.extMeta.laneMeta.boundedUngated,
        worstCase: bare.extMeta.laneMeta.worstCase,
        strandedFirst: bare.extMeta.laneMeta.strandedFirst,
        stranded: bare.extMeta.laneMeta.stranded,
        wantedBound: lm.bounded,
        gain: round2(gain),
        unsealed,
        premium,
        cost: shorter
          ? out.extension.length - bare.extension.length
          : out.extMeta.shallow - bare.extMeta.shallow,
      };
      out = bare;
    }
  }

  // ------------------------------------------------------------------
  // ONE RETRY, AND IT CANNOT MAKE THE ROOM WORSE.
  //
  // Run the rescue only where the diagnosis above says it applies — the room
  // ships a shallow extension AND phase 1 died on the paving budget — and keep
  // the result only if the EXISTING comparator prefers it (fullest, then fewest
  // personal ramparts, then most compact). That arbitration is the whole safety
  // argument: an unarbitrated rescue was measured too, and it does more (fleet
  // 85 -> 79, eight rooms improved) at the price of regressing two rooms into a
  // shallow extension they did not have and stretching E11S7's filler tour from
  // 79 to 105 for nothing. Buying six shallow tiles with two other rooms'
  // ramparts and a tour is not a trade this planner is allowed to make quietly,
  // and making it loudly would still be making it. So: three rooms improve
  // (E11S8 1->0, E13S4 1->0, E18S4 5->4), nothing regresses, and the four rooms
  // the aggressive variant would have "fixed" are declared instead.
  // ------------------------------------------------------------------
  if (out.extMeta.shallow > 0 && out.extMeta.stubExhausted) {
    const alt = attempt(out.extMeta.hubDistCap, out.extMeta.laneMeta?.rounds || 0, EXT_RESCUE_ROADS);
    if (betterRun(alt, out)) out = alt;
  }
  return out;
}

// ===========================================================================
// LAYER 7b — THE POST-PRUNE EXTENSION REFLOW
// ===========================================================================
/**
 * THE CORRIDOR THE MASS GREW ALONG IS NOT THE CORRIDOR THE ROOM SHIPS, AND THE
 * EXTENSION LAYER WAS THE ONLY ONE THAT NEVER FOUND OUT.
 *
 * Layer 6 grows the extension mass along a paved corridor and refuses any tile
 * that already carries a road — correctly, because you cannot stack an
 * extension on a road. Layer 7 then runs the dead-end prune and DELETES part of
 * that corridor: 1,659 road tiles across the fleet, every one of them turning
 * back into free interior floor that is, by construction, deep, already
 * road-faced (the corridor it belonged to is still there) and inside the wall.
 * Nothing looked at it again. Layer 6 had already returned.
 *
 * That single ordering gap is the whole of three separate review findings, and
 * the reviewers found it by construction rather than by reading the code:
 *
 *   - E9S2 shipped 56/60 extensions and declared the missing four IMPOSSIBLE —
 *     "no composition in this search reached more than 56 extensions at any
 *     seed or any rung ... the 4 missing extension(s) are the room, not a
 *     placement that gave up early". Two independent reviewers built 60/60 in
 *     the shipped enclosure. Their tiles were 36,14 / 35,11 / 37,13 / 35,15
 *     (depth 10-11, no rampart needed, two of them two tiles from the storage).
 *     ALL FOUR ARE TILES THIS ROOM PAVED IN LAYER 6 AND PRUNED IN LAYER 7.
 *   - Fleet-wide, every one of the 55 shallow extensions sat in a room that
 *     still held free deep road-faced floor, and the relocation targets the
 *     reviewers proved out are the same story: 12 of the 13 they named
 *     (E11S1 23,42 + 26,37; E9S9 36,19 + 33,26; E12S5 10,21; E17S8 16,42;
 *     E2S3 43,31; E3S7 28,23; E5S6 29,40; E12S6 28,13) are pruned road tiles.
 *   - E3S7's layer-6 note read "6 of 60 sit at depth < 4" when the shipped room
 *     has exactly one shallow extension. The gap of 5 is that room's
 *     `inertPruned: 5` — the note was written before the prune it describes.
 *
 * The cause sentence layer 6 prints for those rooms — "the deep skeleton ran
 * out of diggable deep floor — digDeep() came back empty" — is a true statement
 * about phase 1 of a search that ran against a board the room does not ship. It
 * was converted into a statement about the room, which is the one thing the
 * honest-shortfall channel is not allowed to do.
 *
 * WHY A REFLOW AND NOT A RE-ORDER. Pruning before the mass grows is circular:
 * a road is inert only when nothing claims it, and the extensions are most of
 * the claimants. Re-running the whole of layer 6 after the prune was rejected
 * too — it would re-derive a different corridor, which would prune differently,
 * which is the same circle with a longer radius. So this pass does the one
 * thing that is well-defined on a finished board: it takes the floor the prune
 * freed and asks, tile by tile, whether an extension may stand there.
 *
 * IT IS NOT A REPAIR LOOP. It never moves a finished structure to chase a
 * metric, it never paves, it never touches the wall, and it only ever moves an
 * extension in ONE direction — from a tile that rents a personal rampart
 * forever onto a tile that needs none. Every placement is subject to the same
 * acceptance test the reviewers used against the shipped validator, plus two
 * the reviewers asked for and the planner did not have: the controller claim
 * seat, and the as-built upgrader parks.
 *
 * WHAT IT REFUSES IS RECORDED, TILE BY TILE. The declaration this feeds may say
 * "impossible" only after a search it can cite, so the returned census carries
 * every free deep tile that was considered and the exact reason each one lost.
 */
const REFLOW_REFUSAL_CAP = 400;
const round2v = (v) => (v === null || v === undefined || !isFinite(v) ? v : Math.round(v * 100) / 100);

/**
 * @param terrain  raw room terrain string
 * @param plan     the finished plan; `structures.extension` and
 *                 `structures.rampart` are mutated in place
 * @param liveRoadKeys Set of "x,y" for the roads that SURVIVE layer 7's prune —
 *                 not `plan.structures.road`, which still carries the ghosts at
 *                 the point this runs. Passing it in rather than deriving it is
 *                 deliberate: the freed floor IS the difference between the two,
 *                 and a pass that recomputed it would be guessing at the caller.
 */
export function reflowExtensions(terrain, plan, liveRoadKeys) {
  const idxOf = (x, y) => x + y * 50;
  const objectTiles = new Set(plan.objectTiles || []);
  // the claim seat, the mineral stand, their approaches and the protected
  // upgrader parking — 7b places extensions like any other layer and is held
  // to the same bans. See reservedTiles in shared.mjs.
  const reservedK = reservedTiles(plan);
  const mGuardR = mineralGuard(terrain, plan);
  const extensions = plan.structures.extension || [];
  const ramparts = plan.structures.rampart || [];

  // ---- the shipped board, re-derived here and not read from any cache ------
  // Every metric this pass is allowed to trade against has to be measured on
  // the tiles the room ships. Layer 2's exterior, layer 2's depth field and
  // layer 6's roadSet are all wrong by this point in at least one room, and
  // reading a stale one is the bug class this pass exists to close.
  const rampartSet = new Set(ramparts.map((r) => key(r.x, r.y)));
  const passable = (x, y) =>
    x >= 0 && x <= 49 && y >= 0 && y <= 49 && (!isWall(terrain, x, y) || liveRoadKeys.has(key(x, y)));

  /** exterior = flood from the exits; ramparts block; roads tunnel walls. */
  const floodExterior = (rset) => {
    const ext = new Uint8Array(2500);
    const q = [];
    const seed = (x, y) => {
      if (!passable(x, y) || rset.has(key(x, y))) return;
      const i = idxOf(x, y);
      if (ext[i]) return;
      ext[i] = 1;
      q.push(i);
    };
    for (let i = 0; i < 50; i++) {
      seed(i, 0);
      seed(i, 49);
      seed(0, i);
      seed(49, i);
    }
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi];
      const x = i % 50,
        y = (i / 50) | 0;
      for (const [dx, dy] of D8) seed(x + dx, y + dy);
    }
    return ext;
  };
  /** depth = chebyshev distance to the nearest exterior tile, THROUGH walls */
  const depthFrom = (ext) => {
    const dep = new Int16Array(2500).fill(999);
    const q = [];
    for (let i = 0; i < 2500; i++) {
      if (ext[i]) {
        dep[i] = 0;
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
        if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
        const ni = idxOf(nx, ny);
        if (dep[ni] <= dep[i] + 1) continue;
        dep[ni] = dep[i] + 1;
        q.push(ni);
      }
    }
    return dep;
  };

  const exterior = floodExterior(rampartSet);
  const depth = depthFrom(exterior);

  // ---- occupancy ----------------------------------------------------------
  // A tile is FREE only when nothing at all stands on it. Ramparts count: an
  // extension is legal under a rampart, but a cut tile is the defenders' walk
  // and a battlement, and standing a blocker on it is how the wall stops being
  // walkable. Deep floor almost never carries one, so this costs nothing.
  const occupiedTile = new Set();
  for (const [t, list] of Object.entries(plan.structures)) {
    for (const p of list || []) {
      const k = key(p.x, p.y);
      if (t === "road" && !liveRoadKeys.has(k)) continue; // a pruned ghost is not a structure
      occupiedTile.add(k);
    }
  }

  /** creep-blocking tiles, given extra tiles to block and tiles to free */
  const blockedWith = (extraKeys, dropKeys) => {
    const b = new Set(objectTiles);
    for (const t of BUILT_OBSTACLES) {
      for (const p of plan.structures[t] || []) b.add(key(p.x, p.y));
    }
    for (const k of dropKeys || []) b.delete(k);
    for (const k of extraKeys || []) b.add(k);
    for (const k of reservedK) b.delete(k); // reserved tiles are walkable, never blocked
    return b;
  };

  /** walk region a creep of ours can reach from the sitter, D8 */
  const walkFrom = (blocked, ext) => {
    const seen = new Uint8Array(2500);
    const si = idxOf(plan.sitter.x, plan.sitter.y);
    seen[si] = 1;
    const q = [si];
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi];
      const x = i % 50,
        y = (i / 50) | 0;
      for (const [dx, dy] of D8) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
        const ni = idxOf(nx, ny);
        if (seen[ni] || !passable(nx, ny) || ext[ni]) continue;
        if (blocked.has(key(nx, ny))) continue;
        seen[ni] = 1;
        q.push(ni);
      }
    }
    return seen;
  };

  // ---- the as-built quantities this pass may not make worse ---------------
  // Measured BEFORE anything moves, so every acceptance test below is "no
  // worse than shipped" rather than "meets some absolute bar the shipped room
  // may already miss". A pass that could only run in rooms that were already
  // perfect would never run.
  const ctrl = plan.controller;
  // the LAST link is the controller's, by layer 1's construction order — the
  // same convention layer-shell and the as-built park re-measure use. A
  // "nearest link at chebyshev 2-3" derivation picks a source link instead in
  // five rooms (E13S6, E18S3, E13S9, E1S3, E5S5).
  const ctrlLink = (() => {
    if (!ctrl) return null;
    const links = plan.structures.link || [];
    const last = links[links.length - 1];
    if (!last) return null;
    const d = Math.max(Math.abs(last.x - ctrl.x), Math.abs(last.y - ctrl.y));
    return d >= 2 && d <= 3 ? { x: last.x, y: last.y, d } : null;
  })();
  /** as-built upgrader parks: the producer's own definition, re-measured */
  const parksWith = (blocked) => {
    if (!ctrlLink || !ctrl) return 99;
    let n = 0;
    for (const [dx, dy] of D8) {
      const x = ctrlLink.x + dx,
        y = ctrlLink.y + dy;
      if (!walkable(terrain, x, y)) continue;
      if (Math.max(Math.abs(x - ctrl.x), Math.abs(y - ctrl.y)) > 3) continue;
      if (blocked.has(key(x, y)) || objectTiles.has(key(x, y))) continue;
      n++;
    }
    return n;
  };
  /** free walkable range-1 tiles of the controller — the claim/sign seats */
  const seatsWith = (blocked) => {
    if (!ctrl) return 99;
    let n = 0;
    for (const [dx, dy] of D8) {
      const x = ctrl.x + dx,
        y = ctrl.y + dy;
      if (!walkable(terrain, x, y)) continue;
      if (objectTiles.has(key(x, y))) continue;
      if (blocked.has(key(x, y))) continue;
      n++;
    }
    return n;
  };

  const baseBlocked = blockedWith(null, null);
  const baseWalk = walkFrom(baseBlocked, exterior);
  const baseParks = parksWith(baseBlocked);
  const baseSeats = seatsWith(baseBlocked);
  const cutRaw = plan.shell && plan.shell.cut ? plan.shell.cut : [];
  const cutKeys = cutRaw.map((c) => key(c.x, c.y));
  /** every cut tile the shipped garrison can actually stand on */
  const baseBattlements = cutKeys.filter((k) => {
    const p = k.split(",");
    return baseWalk[idxOf(+p[0], +p[1])] === 1;
  }).length;

  /** structures that owe a serviceable D8 face */
  const facedD8 = [];
  for (const t of [
    "storage",
    "terminal",
    "link",
    "spawn",
    "tower",
    "lab",
    "nuker",
    "observer",
    "container",
    "extractor",
  ]) {
    for (const p of plan.structures[t] || []) facedD8.push(p);
  }

  // ------------------------------------------------------------------
  // THE ACCEPTANCE TEST. This is the reviewers' construction, made into code:
  // block the trial tiles, and require that the finished room is no worse off
  // on every property it is judged on. It is deliberately phrased as a
  // comparison against the SHIPPED numbers, not against a constant.
  // ------------------------------------------------------------------
  // EVERY TEST IS "NO WORSE THAN SHIPPED", NEVER "MEETS AN ABSOLUTE BAR.
  //
  // The first version of this asked, flatly, whether every structure had a
  // walkable face. That is not the same question and it fails everywhere: a
  // room with a source outside its wall — E9S2 has one, at 31,35 — has eco
  // structures the interior walk region never reaches BY DESIGN, so the
  // absolute test refused all three of E9S2's own recoverable tiles and blamed
  // a container thirty tiles away. The only thing this pass may promise is
  // that it takes nothing away, so each property is measured on the shipped
  // board first and every trial is compared against that.
  const hadFaceD8 = new Map();
  for (const p of facedD8) {
    let ok = false;
    for (const [dx, dy] of D8) {
      if (baseWalk[idxOf(p.x + dx, p.y + dy)] === 1) {
        ok = true;
        break;
      }
    }
    hadFaceD8.set(key(p.x, p.y), ok);
  }
  const baseRoadsInWalk = new Set();
  for (const k of liveRoadKeys) {
    const p = k.split(",");
    if (baseWalk[idxOf(+p[0], +p[1])] === 1) baseRoadsInWalk.add(k);
  }

  const accepts = (addKeys, dropKeys, extList) => {
    const blocked = blockedWith(addKeys, dropKeys);
    const walk = walkFrom(blocked, exterior);
    const inWalk = (x, y) => walk[idxOf(x, y)] === 1;
    // (a) every non-extension structure that HAD a walkable D8 face keeps one
    for (const p of facedD8) {
      if (!hadFaceD8.get(key(p.x, p.y))) continue; // never had one; not ours to grant
      let ok = false;
      for (const [dx, dy] of D8) {
        if (inWalk(p.x + dx, p.y + dy)) {
          ok = true;
          break;
        }
      }
      if (!ok) return { ok: false, why: `structure ${p.x},${p.y} loses its last walkable face` };
    }
    // (b) every extension keeps a walkable D4 face (the filler stands there).
    // No base exemption here: an extension with no reachable D4 face is an
    // extension no filler can ever fill, and the validator fails it outright.
    for (const e of extList) {
      let ok = false;
      for (const [dx, dy] of D4) {
        if (inWalk(e.x + dx, e.y + dy)) {
          ok = true;
          break;
        }
      }
      if (!ok) return { ok: false, why: `extension ${e.x},${e.y} loses its last walkable D4 face` };
    }
    // (c) every road the sitter could reach, it still can
    for (const k of baseRoadsInWalk) {
      const p = k.split(",");
      const x = +p[0],
        y = +p[1];
      if (blocked.has(k)) continue; // a road under a blocker conducts nothing anyway
      if (!inWalk(x, y)) return { ok: false, why: `road ${k} is cut off from the sitter` };
    }
    // (d) the garrison keeps every battlement it shipped
    const bat = cutKeys.filter((k) => {
      const p = k.split(",");
      return walk[idxOf(+p[0], +p[1])] === 1;
    }).length;
    if (bat < baseBattlements) {
      return { ok: false, why: `loses ${baseBattlements - bat} battlement(s)` };
    }
    // (e) the controller keeps at least one claim/sign seat, and no fewer
    const seats = seatsWith(blocked);
    if (seats < 1) return { ok: false, why: "takes the controller's last claim seat" };
    if (seats < baseSeats) return { ok: false, why: "costs the controller a claim seat" };
    // (f) upgrader parking does not shrink
    const parks = parksWith(blocked);
    if (parks < baseParks) return { ok: false, why: `costs ${baseParks - parks} upgrader park(s)` };
    return { ok: true };
  };

  // ------------------------------------------------------------------
  // THE CANDIDATE SET — every tile in the room that could hold a free
  // extension, with the reason recorded for the ones that cannot. "Free" means
  // deep: at depth >= DEPTH_SAFE an extension is out of a ranged attacker's
  // envelope and rents no personal rampart, which is the only kind of tile
  // this pass is willing to move a shallow extension onto.
  // ------------------------------------------------------------------
  const refusals = [];
  const scanFree = (skipKeys) => {
    const out = [];
    for (let y = 1; y <= 48; y++) {
      for (let x = 1; x <= 48; x++) {
        const k = key(x, y);
        if (skipKeys && skipKeys.has(k)) continue;
        if (occupiedTile.has(k)) continue;
        if (objectTiles.has(k)) continue;
        const i = idxOf(x, y);
        if (exterior[i]) continue; // outside our own wall
        if (isWall(terrain, x, y)) continue;
        if (depth[i] < DEPTH_SAFE) continue; // shallow floor is not an upgrade
        if (reservedK.has(k)) {
          refusals.push({ k, why: "reserved controller claim seat or upgrader parking" });
          continue;
        }
        if (!mGuardR.ok({ x, y }, baseBlocked)) {
          refusals.push({ k, why: "taking it would leave the mineral no stand a creep can reach" });
          continue;
        }
        if (!engineBuildable(terrain, x, y, "extension")) {
          refusals.push({ k, why: "engine refuses an extension here (border rule)" });
          continue;
        }
        // must already have a D4 road face that conducts — this pass never paves
        let faced = false;
        for (const [dx, dy] of D4) {
          const fk = key(x + dx, y + dy);
          if (liveRoadKeys.has(fk) && !baseBlocked.has(fk)) {
            faced = true;
            break;
          }
        }
        if (!faced) {
          // ...AND "THIS PASS NEVER PAVES" WAS A SENTENCE THIS PASS REFUTES.
          // Five rooms print a refusal saying the pass never paves next to an
          // `added` record that paves: E9S2 refuses 35,15 for having no road
          // face and then lays 34,15 to take it. The free-floor scan really does
          // not pave — the priced ladder underneath it (rung B) does, and only
          // while the room is under 60. The refusal now says which of the two is
          // speaking.
          refusals.push({
            k,
            why:
              "no D4 road face, and the free-floor backfill never paves (the priced ladder below may " +
              "buy one, but only while the room is still short of 60)",
          });
          continue;
        }
        // and the builder has to be able to reach it
        if (!baseWalk[i]) {
          refusals.push({ k, why: "sealed off from the sitter — no builder can reach it" });
          continue;
        }
        out.push({ x, y, k, depth: depth[i] });
      }
    }
    return out;
  };

  const added = [];
  const movedLog = [];
  const rampartsRetired = [];
  const taken = new Set();

  const field = fieldFrom(terrain, plan.sitter, baseBlocked);
  const rank = (c) => {
    let best = 9999;
    for (const [dx, dy] of D4) {
      const f = field[idxOf(c.x + dx, c.y + dy)];
      if (f < best) best = f;
    }
    return best;
  };
  const ordered = (list) =>
    list
      .map((c) => ({ x: c.x, y: c.y, k: c.k, depth: c.depth, r: rank(c) }))
      .sort((a, b) => a.r - b.r || a.y - b.y || a.x - b.x);

  let free = scanFree(taken);
  const freeDeepFaced = free.length;
  // WHAT THE FREE TILES WERE SPENT ON, kept so the shallow note can say it.
  // E9S2 published "the 15 that remain could not take any of them without
  // failing the acceptance test" about three tiles that were never offered to
  // the shallow slots at all: the room was four extensions short of 60 and the
  // backfill below spent them closing that gap first. A good reason, a different
  // reason, and the printed one flattered.
  const freeKeys0 = new Set(free.map((c) => c.k));

  // ---- (1) BACKFILL to the target ----------------------------------------
  // Nearest-to-the-hub first: the filler walks this every refill cycle, and a
  // tile the prune freed is by construction on an existing corridor, so the
  // cheap ones are the ones the corridor already passes.
  if (extensions.length < TARGET) {
    for (const c of ordered(free)) {
      if (extensions.length >= TARGET) break;
      if (taken.has(c.k) || occupiedTile.has(c.k)) continue; // see rung B
      const trial = new Set(taken);
      trial.add(c.k);
      const verdict = accepts(trial, null, extensions.concat([{ x: c.x, y: c.y }]));
      if (!verdict.ok) {
        refusals.push({ k: c.k, why: verdict.why });
        continue;
      }
      taken.add(c.k);
      occupiedTile.add(c.k);
      extensions.push({ x: c.x, y: c.y });
      added.push({ x: c.x, y: c.y, depth: c.depth });
    }
  }

  // ---- (1b) STILL SHORT: BUY A ROAD FACE, THEN BUY A RAMPART -------------
  // The ladder below is priced, cheapest first, and it only runs while the room
  // is under target. Both rungs are things this planner already does elsewhere —
  // layer 6 paves corridor to reach floor, and 15 of E9S2's own extensions rent
  // a personal rampart — so neither is a new kind of cost, only a new place to
  // pay it. Both reviewers who built E9S2 to 60 used one of these two rungs for
  // their last tile: one added a road at 34,15 to reach 35,15, the other took
  // 34,4 at depth 3 with one rampart, "exactly like the room's other 15".
  const newRoads = [];
  const shallowRamparts = [];
  const roadKeysNow = new Set(liveRoadKeys);
  /** a tile a road may be laid on: free floor, inside the wall, net-adjacent */
  const paveableFor = (t) => {
    for (const [dx, dy] of D4) {
      const px = t.x + dx,
        py = t.y + dy;
      const pk = key(px, py);
      if (px < 1 || py < 1 || px > 48 || py > 48) continue;
      if (roadKeysNow.has(pk) || occupiedTile.has(pk) || objectTiles.has(pk)) continue;
      if (reservedK.has(pk)) continue;
      if (isWall(terrain, px, py)) continue; // never tunnel the wall to reach floor
      if (exterior[idxOf(px, py)]) continue;
      if (!baseWalk[idxOf(px, py)]) continue;
      // it has to JOIN the network, or it is a road to nowhere
      let joins = false;
      for (const [ax, ay] of D8) {
        if (roadKeysNow.has(key(px + ax, py + ay))) {
          joins = true;
          break;
        }
      }
      if (joins) return { x: px, y: py, k: pk };
    }
    return null;
  };

  if (extensions.length < TARGET) {
    // rung B — deep floor one paved tile from the net: costs a road, no rampart
    const unfacedDeep = [];
    for (let y = 1; y <= 48; y++) {
      for (let x = 1; x <= 48; x++) {
        const k = key(x, y);
        if (taken.has(k) || occupiedTile.has(k) || objectTiles.has(k) || reservedK.has(k)) continue;
        if (!mGuardR.ok({ x, y }, baseBlocked)) continue;
        const i = idxOf(x, y);
        if (exterior[i] || isWall(terrain, x, y) || depth[i] < DEPTH_SAFE) continue;
        if (!engineBuildable(terrain, x, y, "extension")) continue;
        if (!baseWalk[i]) continue;
        let faced = false;
        for (const [dx, dy] of D4) {
          const fk = key(x + dx, y + dy);
          if (roadKeysNow.has(fk) && !baseBlocked.has(fk)) {
            faced = true;
            break;
          }
        }
        if (faced) continue;
        unfacedDeep.push({ x, y, k, depth: depth[i] });
      }
    }
    for (const c of ordered(unfacedDeep)) {
      if (extensions.length >= TARGET) break;
      // THE CANDIDATE LIST IS A SNAPSHOT AND THIS LOOP CHANGES THE BOARD.
      // Rung B pays for a tile by PAVING one, and the tile it paves is very often
      // another candidate in the same precomputed list — E5S3 took 32,8 by paving
      // 32,9 and then, three candidates later, took 32,9 as well, shipping a road
      // and an extension stacked on one tile with two orphaned road tiles behind
      // it. Re-asking is one lookup; the alternative is a scan per acceptance.
      if (taken.has(c.k) || occupiedTile.has(c.k)) continue;
      const pave = paveableFor(c);
      if (!pave) continue;
      const verdict = accepts(new Set([...taken, c.k]), null, extensions.concat([{ x: c.x, y: c.y }]));
      if (!verdict.ok) {
        refusals.push({ k: c.k, why: verdict.why });
        continue;
      }
      taken.add(c.k);
      occupiedTile.add(c.k);
      occupiedTile.add(pave.k);
      roadKeysNow.add(pave.k);
      liveRoadKeys.add(pave.k);
      baseRoadsInWalk.add(pave.k);
      newRoads.push({ x: pave.x, y: pave.y });
      extensions.push({ x: c.x, y: c.y });
      added.push({ x: c.x, y: c.y, depth: c.depth, paved: { x: pave.x, y: pave.y } });
    }

    // rung C — shallow floor with a road face: costs a personal rampart forever.
    // Last, and only to close a 60/60 gap, because the whole of layer 6's
    // relocation pass exists to get OUT of these.
    if (extensions.length < TARGET) {
      const shallowCands = [];
      for (let y = 1; y <= 48; y++) {
        for (let x = 1; x <= 48; x++) {
          const k = key(x, y);
          if (taken.has(k) || occupiedTile.has(k) || objectTiles.has(k) || reservedK.has(k)) continue;
        if (!mGuardR.ok({ x, y }, baseBlocked)) continue;
          const i = idxOf(x, y);
          if (exterior[i] || isWall(terrain, x, y)) continue;
          if (depth[i] >= DEPTH_SAFE || depth[i] < 2) continue; // deep is rung A/B; depth<2 is indefensible
          if (!engineBuildable(terrain, x, y, "extension")) continue;
          if (!engineBuildable(terrain, x, y, "rampart")) continue; // no cover, no extension
          if (!baseWalk[i]) continue;
          let faced = false;
          for (const [dx, dy] of D4) {
            const fk = key(x + dx, y + dy);
            if (roadKeysNow.has(fk) && !baseBlocked.has(fk)) {
              faced = true;
              break;
            }
          }
          if (!faced) continue;
          shallowCands.push({ x, y, k, depth: depth[i] });
        }
      }
      for (const c of ordered(shallowCands)) {
        if (extensions.length >= TARGET) break;
        // THE CANDIDATE LIST IS A SNAPSHOT AND THIS LOOP CHANGES THE BOARD.
        // Rung B pays for a tile by PAVING one, and the tile it paves is very often
        // another candidate in the same precomputed list — E5S3 took 32,8 by paving
        // 32,9 and then, three candidates later, took 32,9 as well, shipping a road
        // and an extension stacked on one tile with two orphaned road tiles behind
        // it. Re-asking is one lookup; the alternative is a scan per acceptance.
        if (taken.has(c.k) || occupiedTile.has(c.k)) continue;
        const verdict = accepts(new Set([...taken, c.k]), null, extensions.concat([{ x: c.x, y: c.y }]));
        if (!verdict.ok) {
          refusals.push({ k: c.k, why: verdict.why });
          continue;
        }
        taken.add(c.k);
        occupiedTile.add(c.k);
        extensions.push({ x: c.x, y: c.y });
        shallowRamparts.push({ x: c.x, y: c.y });
        rampartSet.add(c.k);
        added.push({ x: c.x, y: c.y, depth: c.depth, rampart: true });
      }
    }
  }

  // the lap this room has once every extension it owes is standing. Relocation
  // below is measured against THIS, not against the pre-backfill room.
  const lapBeforeMoves = (() => {
    const b = new Set(objectTiles);
    for (const t of BUILT_OBSTACLES) {
      for (const p of plan.structures[t] || []) b.add(key(p.x, p.y));
    }
    const w = interiorWalk(terrain, rampartSet, exterior, b, plan.sitter);
    return mobilityStats(cutRaw, exterior, maskFromKeys(w)).maxGated;
  })();

  // ---- (2) RELOCATE shallow extensions onto free deep floor ---------------
  // One direction only, and only onto a tile that needs no rampart. A slot that
  // moves retires a personal rampart forever; a slot that cannot move keeps
  // exactly what it had.
  // A ROAD IS CHEAPER THAN A RAMPART, SO THIS PASS WILL BUY ONE.
  //
  // Restricting relocation to floor whose road face ALREADY exists left 41
  // shallow extensions standing fleet-wide, in seven rooms, most of them next
  // to deep floor that was one tile of pavement away from being usable. That
  // restriction is inherited from layer 6's relocation pass, where it makes
  // sense — layer 6 is still growing corridor and has a paving budget to
  // protect. Here there is no budget left to protect and the arithmetic is
  // one-sided: a personal rampart is 0.03 e/tick of decay forever and blocks
  // nothing useful, a road tile is an order of magnitude cheaper and makes the
  // filler's trip shorter. The pave is still the SECOND choice, tried only
  // when no already-faced deep tile will take the slot.
  const shallowOf = (e) => depth[idxOf(e.x, e.y)] < DEPTH_SAFE;
  /** deep, free, engine-legal targets: faced ones first, then one-pave ones */
  const deepTargets = () => {
    const faced = ordered(scanFree(taken)).map((c) => ({ ...c, pave: null }));
    const unfaced = [];
    for (let y = 1; y <= 48; y++) {
      for (let x = 1; x <= 48; x++) {
        const k = key(x, y);
        if (taken.has(k) || occupiedTile.has(k) || objectTiles.has(k) || reservedK.has(k)) continue;
        if (!mGuardR.ok({ x, y }, baseBlocked)) continue;
        const i = idxOf(x, y);
        if (exterior[i] || isWall(terrain, x, y) || depth[i] < DEPTH_SAFE) continue;
        if (!engineBuildable(terrain, x, y, "extension")) continue;
        if (!baseWalk[i]) continue;
        let isFaced = false;
        for (const [dx, dy] of D4) {
          const fk = key(x + dx, y + dy);
          if (roadKeysNow.has(fk) && !baseBlocked.has(fk)) {
            isFaced = true;
            break;
          }
        }
        if (isFaced) continue; // already in `faced`
        const pave = paveableFor({ x, y });
        if (!pave) continue;
        unfaced.push({ x, y, k, depth: depth[i] });
      }
    }
    return faced.concat(ordered(unfaced).map((c) => ({ ...c, pave: paveableFor(c) })));
  };
  for (let guard = 0; guard < 96; guard++) {
    const slots = extensions.filter(shallowOf);
    if (!slots.length) break;
    const order = deepTargets();
    if (!order.length) break;
    let movedOne = false;
    for (const slot of slots) {
      const from = key(slot.x, slot.y);
      let placed = null;
      for (const c of order) {
        if (taken.has(c.k)) continue;
        const nextList = extensions
          .filter((e) => key(e.x, e.y) !== from)
          .concat([{ x: c.x, y: c.y }]);
        const verdict = accepts(new Set([...taken, c.k]), [from], nextList);
        if (!verdict.ok) continue;
        placed = c;
        break;
      }
      if (!placed) continue;
      const i = extensions.findIndex((e) => key(e.x, e.y) === from);
      extensions.splice(i, 1, { x: placed.x, y: placed.y });
      taken.add(placed.k);
      occupiedTile.add(placed.k);
      occupiedTile.delete(from);
      if (placed.pave) {
        occupiedTile.add(placed.pave.k);
        roadKeysNow.add(placed.pave.k);
        liveRoadKeys.add(placed.pave.k);
        baseRoadsInWalk.add(placed.pave.k);
        newRoads.push({ x: placed.pave.x, y: placed.pave.y });
      }
      movedLog.push({
        from: { x: slot.x, y: slot.y },
        to: { x: placed.x, y: placed.y },
        fromDepth: depth[idxOf(slot.x, slot.y)],
        toDepth: placed.depth,
        paved: placed.pave ? { x: placed.pave.x, y: placed.pave.y } : null,
      });
      movedOne = true;
      break; // re-scan: the board changed
    }
    if (!movedOne) break;
  }

  // ---- (2b) THE LANE BOUND IS A PROMISE, AND THIS PASS IS INSIDE IT -------
  // Layer 6 reserves defender lanes and then proves an upper bound on the lap
  // ANY mass it could grow would leave — and it already knows that its own
  // relocation pass invalidates the model, which is why it re-derives the bound
  // over "the corridor this room SHIPS" once its moves are made (see the
  // stubNote in layer-walls). Layer 7b relocates after that, onto tiles the
  // model had read as permanently walkable corridor, so it inherits exactly the
  // same obligation. Unpoliced it broke the bound in three rooms — E11S7
  // (13.5 -> 14), E13S6 (3.33 -> 6.33), E15S2 (1.67 -> 1.89) — and a bound the
  // mass beats is a defect, not a footnote.
  //
  // ADDITIONS ARE NEVER ROLLED BACK. 60/60 extensions is the one unconditional
  // gate in the goal and it outranks the lap; layer 6 says the same thing when
  // it drops a whole lane reservation `droppedFor: "extensions"`. RELOCATIONS
  // are pure upkeep wins and entirely optional, so they are what gives way —
  // most recent first, so the room keeps the cheapest ones it can afford.
  // TWO CEILINGS, AND THE TIGHTER ONE WINS.
  //   (i) the bound layer 6 published, if it published one; and
   //  (ii) the lap this room already had once the 60th extension was standing.
  // (ii) exists because a bound is not a licence. E15S2 publishes no finite
  // bound at all, so under (i) alone the relocation pass was free to walk its
  // lap from 1.89 to 2.71 in exchange for two ramparts and say nothing — which
  // is the same silent trade the mobility declarations exist to stop. Layer 7b
  // is an UPKEEP pass; it may not spend the garrison's legs to buy upkeep.
  const laneBound = plan.meta?.extensions?.laneMeta?.bounded;
  const lapNow = () => {
    const b = new Set(objectTiles);
    for (const t of BUILT_OBSTACLES) {
      for (const p of plan.structures[t] || []) b.add(key(p.x, p.y));
    }
    const w = interiorWalk(terrain, rampartSet, exterior, b, plan.sitter);
    return mobilityStats(cutRaw, exterior, maskFromKeys(w)).maxGated;
  };
  // ------------------------------------------------------------------
  // ...AND THE CEILING IS CAPPED, BECAUSE OTHERWISE IT IS INVERTED.
  //
  // `lapCeiling = lapBeforeMoves` says "this pass may not make the lap worse".
  // Stated that way it sounds unarguable. Read against a room that is already
  // failing by a factor of eleven it is the opposite: THE WORSE A ROOM'S LAP
  // ALREADY IS, THE MORE POWER IT HAS TO BLOCK REAL UPKEEP SAVINGS.
  //
  // E11S7 is the case. Target 1.2, as-built lap 13.5. Five shallow extensions
  // (12,3 · 13,3 · 14,3 · 15,3 · 16,3 — pressed in a row under the north wall at
  // depth 2) could each move onto free deep floor, retiring FIVE personal
  // ramparts at 0.15 e/tick of forever-upkeep. The pass refused all five,
  // because taking them reads 14 instead of 13.5: a 3.7% change in a number the
  // room misses by 1025%, bought with five ramparts repaired for the life of the
  // base. That is optimising a metric while the layout gets worse, which is the
  // named anti-pattern.
  //
  // THE CAP, AS RULED. A room already MORE THAN TWICE the target may not refuse
  // a rampart-retiring trade that worsens its lap by 10% or less. Inside 2x the
  // target the strict ceiling stands untouched — there the difference between
  // 1.67 and 1.89 is the difference between nearly making the gate and not, and
  // E15S2 (1.67, three ramparts) keeps refusing exactly as it does today.
  //
  // WHAT IS NOT RELAXED: layer 6's published BOUND. That is a proof about the
  // worst mass this enclosure can grow and this pass is inside it, full stop —
  // so the slack is granted against the room's own incumbent lap and then
  // clipped back to the bound. In E11S7 the bound is 14 and the relaxed ceiling
  // is 14.85, so the room takes the five ramparts, ships at 14, and the bound
  // still holds. A slack that broke the bound would be buying upkeep with a
  // claim, which is worse than buying it with a lap.
  // ------------------------------------------------------------------
  /** past this multiple of the target, a lap is failed rather than tight */
  const CEILING_STRICT_BAND = 2 * MOBILITY_TARGET;
  /** ...and this much relative worsening is what a retired rampart is worth */
  const CEILING_SLACK = 0.1;
  const boundRollback = [];
  let lapCeiling = null;
  let lapCeilingSlack = null;
  let lapFinal = null;
  if (movedLog.length) {
    lapCeiling = lapBeforeMoves;
    if (lapBeforeMoves > CEILING_STRICT_BAND) {
      lapCeilingSlack = round2v(lapBeforeMoves * (1 + CEILING_SLACK));
      lapCeiling = lapCeilingSlack;
    }
    if (laneBound !== null && laneBound !== undefined) lapCeiling = Math.min(lapCeiling, laneBound);
    let lap = lapNow();
    while (lap > lapCeiling + 1e-9 && movedLog.length) {
      const mv = movedLog.pop();
      const i = extensions.findIndex((e) => e.x === mv.to.x && e.y === mv.to.y);
      if (i >= 0) extensions.splice(i, 1, { x: mv.from.x, y: mv.from.y });
      taken.delete(key(mv.to.x, mv.to.y));
      occupiedTile.delete(key(mv.to.x, mv.to.y));
      occupiedTile.add(key(mv.from.x, mv.from.y));
      // the trade, priced: one forever-rampart refused, and what it would have cost
      boundRollback.push({ ...mv, wouldLap: round2v(lap), ceiling: round2v(lapCeiling) });
      lap = lapNow();
    }
    lapFinal = round2v(lap);
  }

  // ---- (3) RETIRE the personal ramparts the moves made pointless ----------
  // A rampart is retired only when it is provably doing nothing else. The test
  // is not "layer 6 put it there for this extension" — it is the shipped
  // board's own: nothing that needs depth stands on it, it is not part of the
  // published wall, and removing it does not move one tile of the exterior.
  if (movedLog.length) {
    const cutSet = new Set(cutKeys);
    const bubbleSet = new Set(
      (plan.shell && plan.shell.bubble ? plan.shell.bubble : []).map((b) => key(b.x, b.y)),
    );
    const denialSet = new Set(
      (plan.shell && plan.shell.standDenial ? plan.shell.standDenial : []).map((b) => key(b.x, b.y)),
    );
    const stillThere = new Set();
    for (const t of [
      "spawn",
      "extension",
      "tower",
      "storage",
      "terminal",
      "link",
      "lab",
      "nuker",
      "observer",
      "container",
    ]) {
      for (const p of plan.structures[t] || []) stillThere.add(key(p.x, p.y));
    }
    for (const mv of movedLog) {
      const k = key(mv.from.x, mv.from.y);
      if (!rampartSet.has(k)) continue;
      if (cutSet.has(k) || bubbleSet.has(k) || denialSet.has(k)) continue;
      // something else moved in, or was always there, and it is shallow
      if (stillThere.has(k) && depth[idxOf(mv.from.x, mv.from.y)] < DEPTH_SAFE) continue;
      const trial = new Set(rampartSet);
      trial.delete(k);
      const after = floodExterior(trial);
      let same = true;
      for (let i = 0; i < 2500; i++) {
        if (after[i] !== exterior[i]) {
          same = false;
          break;
        }
      }
      if (!same) continue;
      rampartSet.delete(k);
      rampartsRetired.push({ x: mv.from.x, y: mv.from.y });
    }
    if (rampartsRetired.length) {
      const gone = new Set(rampartsRetired.map((r) => key(r.x, r.y)));
      plan.structures.rampart = ramparts.filter((r) => !gone.has(key(r.x, r.y)));
    }
  }

  // ---- (4) the as-built shallow set, and the build order, re-derived ------
  // m4: layer 6 sorted this array and wrote its note over a board that still
  // carried the corridor layer 7 deletes. Both are re-derived HERE, over the
  // finished interior, which is the contract layer 6's own comment claims.
  const finalBlocked = blockedWith(null, null);
  const finalWalk = walkFrom(finalBlocked, exterior);
  const buildField = fieldFrom(terrain, plan.sitter, finalBlocked);
  const buildCost = (e) => {
    let best = 9999;
    for (const [dx, dy] of D4) {
      const f = buildField[idxOf(e.x + dx, e.y + dy)];
      if (f + 1 < best) best = f + 1;
    }
    if (depth[idxOf(e.x, e.y)] < DEPTH_SAFE) best += 3; // a shallow slot owes a rampart too
    return best;
  };
  extensions.sort((a, b) => buildCost(a) - buildCost(b) || a.y - b.y || a.x - b.x);

  return {
    added,
    boundRollback,
    lapCeiling: round2v(lapCeiling),
    // the relaxed ceiling this room was entitled to (null when it is inside 2x
    // the target and the strict rule applies), and the bound that clipped it
    lapCeilingSlack,
    lapCeilingStrictBand: CEILING_STRICT_BAND,
    lapCeilingSlackPct: Math.round(CEILING_SLACK * 100),
    lapCeilingBound: laneBound === undefined ? null : laneBound,
    lapBeforeMoves: round2v(lapBeforeMoves),
    lapAfterMoves: lapFinal,
    roads: newRoads,
    shallowRamparts,
    moved: movedLog,
    rampartsRetired,
    shallow: extensions.filter(shallowOf).map((e) => ({ x: e.x, y: e.y })),
    placed: extensions.length,
    // the citable search: what was on offer and why each tile lost. An
    // impossibility declaration downstream may quote these numbers and nothing
    // else — a claim about the room has to be a claim about a search.
    search: {
      freeDeepRoadFaced: freeDeepFaced,
      // WHERE THEY WENT. `spentOnAdds` are tiles that became extensions the room
      // did not have at all (the backfill to 60/60); `spentOnMoves` are tiles a
      // shallow slot relocated onto; `left` is what was still on the table when
      // the remaining shallow slots were offered it.
      spentOnAdds: added.filter((a) => freeKeys0.has(key(a.x, a.y))).length,
      spentOnMoves: movedLog.filter((m) => freeKeys0.has(key(m.to.x, m.to.y))).length,
      left: Math.max(
        0,
        freeDeepFaced -
          added.filter((a) => freeKeys0.has(key(a.x, a.y))).length -
          movedLog.filter((m) => freeKeys0.has(key(m.to.x, m.to.y))).length,
      ),
      // DISTINCT TILES, not examinations. This counted `refusals.length`, which
      // is a per-round log — E9S2 published 12 for 7 distinct tiles, E11S1 12 for
      // 4, E12S6 43 for 9 — and the sentence it feeds says "rejecting N more for
      // a stated reason each", which is a claim about tiles.
      refusedCount: new Set(refusals.map((r) => r.k)).size,
      refusedExaminations: refusals.length,
      // one entry per tile, last verdict winning: the board a tile was finally
      // judged against is the board the room ships.
      refused: (() => {
        const byTile = new Map();
        for (const r of refusals) byTile.set(r.k, r);
        return [...byTile.values()].slice(0, REFLOW_REFUSAL_CAP).slice(0, 24);
      })(),
    },
    parks: parksWith(finalBlocked),
    seats: seatsWith(finalBlocked),
    battlements: cutKeys.filter((k) => {
      const p = k.split(",");
      return finalWalk[idxOf(+p[0], +p[1])] === 1;
    }).length,
  };
}
