/**
 * Plan v2 suite validator — the gate the planner has to pass, every room.
 *
 *   fnm exec --using 22 node tools/plan-suite/v2/plan.mjs --all-claimable
 *   fnm exec --using 22 node tools/plan-suite/v2/validate.mjs
 *
 * Reads out-v2/plans-hub.json + terrain AND ROOM OBJECTS from mongo and
 * re-derives every safety property from scratch — it never trusts the
 * planner's own meta, and (this is the part the first version got wrong) it
 * is written so that MUTATING a plan makes it fail. A validator that passes
 * a plan with zero spawns and twelve links is decoration.
 *
 *   COUNT  exact program: 3 spawn · 60 extension · 10 lab · 6 tower ·
 *          1 storage · 1 terminal · 1 nuker · 1 observer (+ 1 extractor
 *          when the room has a mineral). CAPS on the rest against
 *          CONTROLLER_STRUCTURES at RCL8 (link ≤6, container ≤5).
 *          factory / power spawn must be ABSENT — a present-but-empty key
 *          is fine, a present non-empty one fails.
 *   STACK  one non-rampart, non-road structure per tile. A rampart may
 *          share a tile with anything; a road may share only with a rampart
 *          or a container (container+road is legal and useful in Screeps).
 *          No duplicate of the same type on one tile.
 *   OBJECT nothing on a source / controller / mineral tile — those are
 *          OBSTACLE objects, so a structure there can never be built and a
 *          road there can never be walked. The ONE exception is the
 *          extractor, which by design sits on the mineral (and is required
 *          to sit exactly there).
 *   BOUNDS nothing on x/y 0 or 49 (the exit band), nothing but a road or
 *          the extractor on natural wall terrain.
 *   LEAK   no owned structure sits in the exterior flood (ramparts block).
 *          A structure outside the shell is fine ONLY if its own tile is
 *          ramparted (a bubble), which the flood accounts for naturally.
 *   DEPTH  every eco structure — CONTAINERS INCLUDED — is either at depth ≥ 4
 *          (out of a ranged attacker's reach from the wall) or has a rampart
 *          on its tile. Depth is re-derived from the re-derived exterior.
 *   D4     every extension has a D4 face on the interior walk component
 *          that contains the sitter — no diagonal-only, un-roadable exts.
 *   EXTROAD every extension has a ROAD on a D4 face. Reachable is not the
 *          bar; the owner's bar is "easily accessible, not a maze" — the
 *          filler services the whole mass without leaving the network.
 *   ROAD   the whole road network is ONE D8 component containing the
 *          sitter, and every structure D8-touches it. The network is the
 *          REAL walkable one: a road tile buried under a blocking structure
 *          conducts nothing and is excluded.
 *   ENGINE every planned tile survives createConstructionSite's TERRAIN-side
 *          test, byte for byte: bitmask wall rule (roads exempt — a road on
 *          a wall is a legal tunnel; extractor exempt on its mineral) AND
 *          the border-adjacency rule for any non-road non-container structure
 *          at x/y 1 or 48. See shared.mjs for the engine lines.
 *   LINKS  >= 4. Hub + one per source + controller is the whole point of a
 *          link network; three links means a source hauls forever.
 *   CONTAINERS >= #sources + 1 (a seat per source, the pre-RCL7 upgrader bin)
 *          + 1 more when the room has a mineral.
 *   TOWERS depth >= 4 against the re-derived exterior with NO rampart
 *          exemption. A ramparted tower still eats ranged fire through the
 *          rampart's hit points; the whole point of a tower is that it is
 *          unreachable. Undeclarable: a shallow tower is a broken tower, not
 *          a shortfall, and no note makes it right.
 *   LABS   exactly 10, plan.labInputs are 2 of them, and every lab is within
 *          range 2 of BOTH inputs (that is the reaction rule, not taste).
 *   CTRLSEAT at least one walkable tile D8-adjacent to the controller carries
 *          none of our blocking structures. claimController and signController
 *          are both RANGE 1, so a room that has built over its controller's
 *          whole ring can never be re-claimed after a downgrade — the claimer
 *          has nowhere to stand and the extension in the way cannot be
 *          demolished without a spawn that needs the controller. Roads,
 *          ramparts and containers do NOT take the seat (a creep walks over
 *          all three) and rock was never a seat. Undeclarable: the seat costs
 *          one extension out of sixty.
 *   CTRLPARKS the controller link's upgrader seats, RE-DERIVED AS BUILT rather
 *          than read from meta.ctrlParks — layer 1 measures that number six
 *          layers before extensions, towers, labs, the nuker and the observer
 *          land on the tiles it counted. Under the floor of 4 is a declarable
 *          shortfall; a meta.ctrlParks that does not match the shipped room is
 *          undeclarable, because a wrong number is not a short one.
 *   SITTER the tile every other check is measured FROM. It must be walkable
 *          terrain, D8-adjacent to the whole hub trio — storage, terminal and
 *          the hub link, all three servable from one tile in one tick — and
 *          itself a road tile. The exterior
 *          flood, the interior walk component and the road network
 *          are all seeded here — a sitter on a natural wall or in a sealed
 *          pocket does not make those checks fail, it makes them MEANINGLESS,
 *          which is worse. Undeclarable, like every other trust gate.
 *
 * DECLARED SHORTFALLS. A plan may carry meta.shortfalls = [{gate, kind,
 * detail, tiles}]. A gate violation that matches a declaration is
 * PASS-WITH-NOTE: printed loudly, counted separately, does not fail the room.
 * The identical violation with no declaration is a hard fail. That is the
 * whole mechanism — the planner is allowed to be beaten by a room, it is not
 * allowed to be quiet about it.
 *
 * Four limits keep that mechanism from becoming a mute button. Some gates and
 * some (gate, kind) pairs are UNDECLARABLE outright (see below) — a shallow
 * tower, a stacked structure, a missing spawn or a planted factory is wrong, not
 * short. Every declaration must carry EVIDENCE that QUANTIFIES: prose with real
 * numbers in it, the ladder it walked, or the tiles it lost — a bare {gate,
 * kind} pair, or forty characters of filler, is inadmissible and hard-fails the
 * room on its own. A tile-less declaration is BOUNDED: it excuses `count`
 * violations of the class it names, or one. And a tile list is capped, because a
 * declaration naming half the room is a wildcard, not an admission.
 *
 * Exits nonzero on any undeclared failure.
 */
import fs from "fs";
import path from "path";
import {
  OUT_V2,
  D4,
  D8,
  chebyshev,
  engineBuildable,
  fetchRoomsFromMongo,
  isSwamp,
  isWall,
  key,
  walkable,
} from "./shared.mjs";
// THE ONE TEMPLATE, SHARED. The producer builds the paragraph with these
// functions and this file regenerates it from the record the plan publishes.
// Importing the producer's own renderer is the point and not a compromise: the
// claim being checked is "the paragraph IS the record", and the only way to
// check that is to render the record and compare. Nothing else is imported from
// the planner — every NUMBER in every record is still re-derived here from
// terrain and the shipped structure lists.
import { AUDITED_KINDS, declKey, normText, renderDecl } from "./declprose.mjs";

const idx = (x, y) => x + y * 50;

// structures that must never be reachable by an enemy creep, and must be
// serviceable by a hauler (i.e. touch the road network)
const OWNED = [
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
];
// blocking structures for creep movement (roads/ramparts/containers are not)
const BLOCKING = [
  "spawn",
  "extension",
  "tower",
  "storage",
  "terminal",
  "link",
  "lab",
  "nuker",
  "observer",
  "extractor",
];
/**
 * Eco structures that must be out of ranged reach or personally ramparted.
 *
 * CONTAINERS ARE IN THIS LIST. A container at depth < 4 with no rampart on its
 * tile is a 250k-hit-point-less box of energy sitting inside a ranged
 * attacker's envelope: it dies to one pass and the source or the upgrader it
 * feeds stalls. "It is only a container" is the argument that ships the leak.
 * The two containers that legitimately live near the wall keep the exact path
 * every other structure has — a rampart on the tile exempts them via the
 * `rampartSet.has(k)` check below, and a room that genuinely cannot rampart
 * the tile (E5S9's mineral seat sits on the border band, where the engine
 * refuses the rampart outright) declares it and passes with a note.
 */
const NEEDS_DEPTH = [
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
];

/** CONTROLLER_STRUCTURES[type][8] — the hard server cap. */
const RCL8_CAP = {
  spawn: 3,
  extension: 60,
  road: 2500,
  constructedWall: 2500,
  rampart: 2500,
  link: 6,
  storage: 1,
  tower: 6,
  observer: 1,
  powerSpawn: 1,
  extractor: 1,
  lab: 10,
  terminal: 1,
  container: 5,
  nuker: 1,
  factory: 1,
};
/** the exact program a finished Pacifist room owes */
const REQUIRED = {
  spawn: 3,
  extension: 60,
  lab: 10,
  tower: 6,
  storage: 1,
  terminal: 1,
  nuker: 1,
  observer: 1,
};
/** never built by this bot — the key must be absent or empty */
const FORBIDDEN = ["factory", "powerSpawn", "constructedWall"];

/**
 * Rooms where 60/60 extensions is honestly impossible and the planner is
 * allowed to ship short (M5: the escalation may not buy the 60th extension
 * at an unbounded hauler-distance cost). Empty means "no room needed it".
 */
const EXT_SHORTFALL_OK = new Set([]);

const DEPTH_SAFE = 4;
/** planRoom wall time past which a room gets a NOTE (never a fail) — see the
 *  runtime block at the bottom of checkRoom. Fleet p50 is roughly 450ms. */
const RUNTIME_NOTE_MS = 1000;
/** ...and the deterministic reading of the same thing: one seed's ladder is 4
 *  compositions, so more than that means the seed list was walked. */
const RUNTIME_NOTE_COMPOSES = 4;
/** the "legal but not good" band a battery has to declare in — see below */
const WEAK_SHELL_DMG = 1800;
const REFILL_NOTE = 8;
/** hub link + one per source + controller link. Below this the link network
 *  is not a network — a source hauls its energy by creep, forever. */
const MIN_LINKS = 4;
/**
 * Upgrader seats the controller link has to feed, AS BUILT.
 *
 * The same 4 layer-hub.mjs calls MIN_PARKS and treats as a hard floor while it
 * picks the link (m9: a link with two or three seats throttles the upgrader
 * fleet forever), and the same 4 every room's census echoes as `minParksFloor`.
 * The floor is not re-argued here — it is layer 1's own number — it is merely
 * applied to the room that actually shipped rather than to the one layer 1 was
 * looking at six layers earlier. See the ctrlParks block near the bottom.
 */
const MIN_PARKS_FLOOR = 4;
/**
 * The obligation thresholds for the declaration kinds that were free narration
 * until round 12. Every one of them is transcribed from the producer that files
 * the declaration, and the transcription is named here rather than buried at the
 * call site so a reader can check the two against each other:
 *   ECO_*        pipeline.mjs — min(absolute, ECO_REL_MULT x the fleet median)
 *   MAX_REFILL   layer-towers.mjs — the hard line the tower placement is built on
 *   LAB_HAUL_NOTE  layer-labs.mjs — the hauler walk a lab diamond declares at
 *   SECTOR_TARGET  layer-hub.mjs — the spawn-fan separation target, degrees
 *   THIN_PARKS   layer-hub.mjs — "legal but thin", above MIN_PARKS_FLOOR
 */
const ECO_CTRL_ABS = 25;
const ECO_SRC_ABS = 60;
const ECO_REL_MULT = 2;
const MAX_REFILL = 10;
const LAB_HAUL_NOTE = 8;
const SECTOR_TARGET = 60;
const THIN_PARKS = 5;

/**
 * Passability the way the ENGINE moves a creep, not the way terrain reads.
 *
 * A road built on a natural wall is a legal construction site (utils.js:149
 * exempts 'road' from the wall test) and creeps walk it. So a road on a wall
 * is a TUNNEL, and a plan whose min-cut leans on that wall has an open core
 * even though every terrain-only flood says it is sealed. That is exactly the
 * failure mode the `=== WALL` bug shipped in seven rooms: the gate rampart on
 * the code-3 tile was rejected in-game, the road on the same tile was not,
 * and the result was a paved corridor from the exit to the sitter.
 */
function passableFn(terrain, roadSet) {
  return (x, y) =>
    x >= 0 && x <= 49 && y >= 0 && y <= 49 && (!isWall(terrain, x, y) || roadSet.has(key(x, y)));
}

/** exterior = flood from the exits; ramparts are walls; roads tunnel. */
function exteriorFlood(passable, rampartSet) {
  const ext = new Uint8Array(2500);
  const q = [];
  const seed = (x, y) => {
    if (!passable(x, y) || rampartSet.has(key(x, y))) return;
    const i = idx(x, y);
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
  let qi = 0;
  while (qi < q.length) {
    const i = q[qi++];
    const x = i % 50,
      y = (i / 50) | 0;
    for (const [dx, dy] of D8) seed(x + dx, y + dy);
  }
  return ext;
}

/**
 * Depth = chebyshev distance to the nearest exterior tile, THROUGH walls —
 * a ranged attacker does not care about line of sight, so neither do we.
 * Re-derived here from the re-derived exterior; the planner's own map is
 * never consulted.
 */
function depthFromExterior(ext) {
  const depth = new Int16Array(2500).fill(999);
  const q = [];
  for (let i = 0; i < 2500; i++) {
    if (ext[i]) {
      depth[i] = 0;
      q.push(i);
    }
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
      const ni = nx + ny * 50;
      if (depth[ni] <= depth[i] + 1) continue;
      depth[ni] = depth[i] + 1;
      q.push(ni);
    }
  }
  return depth;
}

/** interior walk component containing the sitter (D8; roads/ramparts pass) */
function interiorComponent(passable, ext, blocked, sitter) {
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
      if (seen[ni] || !passable(nx, ny) || ext[ni]) continue;
      if (blocked.has(key(nx, ny))) continue;
      seen[ni] = 1;
      q.push(ni);
    }
  }
  return seen;
}

/**
 * Road network component containing the sitter. Containers conduct (creeps
 * walk over them); a road tile buried under a blocking structure does NOT —
 * excluding it is what makes "no road under a tower" observable here.
 */
function roadComponent(structures, sitter, blockedTiles) {
  const net = new Set();
  for (const r of structures.road || []) {
    const k = key(r.x, r.y);
    if (blockedTiles.has(k)) continue; // dead tile, conducts nothing
    net.add(k);
  }
  for (const c of structures.container || []) net.add(key(c.x, c.y));
  net.add(key(sitter.x, sitter.y));
  const comp = new Set([key(sitter.x, sitter.y)]);
  const q = [sitter];
  let qi = 0;
  while (qi < q.length) {
    const cur = q[qi++];
    for (const [dx, dy] of D8) {
      const x = cur.x + dx,
        y = cur.y + dy;
      const k = key(x, y);
      if (comp.has(k) || !net.has(k)) continue;
      comp.add(k);
      q.push({ x, y });
    }
  }
  return comp;
}

/**
 * BFS walk-distance field from one tile, treating `impassable` as walls.
 *
 * A verbatim mirror of layer-hub.mjs's fieldFrom(), which is what the planner
 * measures its tower refill walks with — same D8 steps, same "natural wall or
 * blocked = impassable", same 9999 for unreachable. It is copied rather than
 * imported for the reason every re-derivation in this file exists: importing the
 * producer's own function would make the validator agree with the producer by
 * construction, and the point of re-deriving maxRefill is that meta.towers is a
 * field the producer controls and the validator used to believe.
 *
 * Copying does buy a drift risk, so it is MEASURED rather than asserted: the
 * distances this produces reproduce meta.towers.refillDists in 159/159 rooms,
 * exactly, every tower. That is the check that the mirror is still a mirror, and
 * it is the number to re-run if this ever disagrees.
 */
function walkField(terrain, origin, impassable) {
  const dist = new Int16Array(2500).fill(9999);
  dist[idx(origin.x, origin.y)] = 0;
  const q = [idx(origin.x, origin.y)];
  let qi = 0;
  while (qi < q.length) {
    const i = q[qi++];
    const x = i % 50,
      y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      if (isWall(terrain, nx, ny) || impassable.has(key(nx, ny))) continue;
      const ni = nx + ny * 50;
      if (dist[ni] <= dist[i] + 1) continue;
      dist[ni] = dist[i] + 1;
      q.push(ni);
    }
  }
  return dist;
}

// ====================================================================
// THE DEFENDER-MOBILITY METRIC, RE-DERIVED HERE.
//
// Nothing in this file had ever read a mobility number. That is how a room
// could publish a `mobility/covered-detour` declaration quoting a 33-tile
// detour at ratio 17.5 and have every one of those numbers rewritten to 4/999
// and 0.11 without a single gate noticing — the reviewer's mutation N1, which
// passed `1/1 · fail 0`. It is also how `cause: "structures"` shipped on a room
// whose own lap is 0.
//
// So the metric is transcribed here from the definition the goal document and
// layer-shell state, and NOT imported from layer-shell: importing the
// producer's own function would make the audit agree with the producer by
// construction, which is the one thing an audit may not do. The transcription
// is checked the same way `walkField` is — it reproduces every published
// mobility field in 172/172 rooms, and that agreement is the test that the
// mirror is still a mirror.
//
// THE DEFINITION, in one place:
//   endpoints  the cut tiles the garrison's own walk region can reach;
//   defender   D8 walk over the interior INCLUDING ramparts (we walk our own
//              ramparts) and EXCLUDING our obstacles (nobody walks a spawn);
//   attacker   D8 walk over the exterior only — a rampart has no door;
//   arriveAt   a field read at a tile that may be off-mask costs one extra
//              step; both endpoints are wall tiles so both graphs pay it;
//   coverage   a pair is excused from the VERDICT (never from the record) when
//              a defender on either tile is within ranged range 3 of every
//              exterior tile an attacker could grind the other from;
//   floor      a pair is judged only when its ABSOLUTE detour exceeds 4 tiles.
// ====================================================================
const MOB_TARGET = 1.2;
const MOB_DETOUR_FLOOR = 4;
const MOB_RANGED_RANGE = 3;
/** removed from the verdict in round 10; kept named so the transcription is legible */
const MOB_ARRIVE_BIAS = 0;
/** past this many reachable cut tiles the producer samples, and an audit cannot follow */
const MOB_EXACT_MAX = 90;
const mround2 = (v) => Math.round(v * 100) / 100;

function mobBfs(mask, from) {
  const dist = new Int16Array(2500).fill(-1);
  const fi = idx(from.x, from.y);
  dist[fi] = 0;
  const q = [fi];
  let qi = 0;
  while (qi < q.length) {
    const i = q[qi++];
    const x = i % 50,
      y = (i / 50) | 0;
    const d = dist[i] + 1;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = nx + ny * 50;
      if (dist[ni] >= 0 || !mask[ni]) continue;
      dist[ni] = d;
      q.push(ni);
    }
  }
  return dist;
}

function mobArrive(f, t) {
  const ti = idx(t.x, t.y);
  if (f[ti] >= 0) return f[ti];
  let best = Infinity;
  for (const [dx, dy] of D8) {
    const nx = t.x + dx,
      ny = t.y + dy;
    if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
    const v = f[nx + ny * 50];
    if (v >= 0 && v + 1 < best) best = v + 1;
  }
  return best;
}

const mobCheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** exterior tiles an attacker can stand on to grind the wall tile `t` */
function mobStands(extMask, t) {
  const out = [];
  for (const [dx, dy] of D8) {
    const x = t.x + dx,
      y = t.y + dy;
    if (x < 0 || y < 0 || x > 49 || y > 49) continue;
    if (extMask[x + y * 50]) out.push({ x, y });
  }
  return out;
}
const mobCovers = (from, stands) => stands.every((s) => mobCheb(from, s) <= MOB_RANGED_RANGE);

/**
 * The whole metric. `cut` is the endpoint list, `extMask` the attacker's board,
 * `walkMask` the defender's. Returns `sampled: true` and nothing else when the
 * producer's own endpoint budget would have kicked in — the audit declines
 * rather than compares two different measurements (0 rooms in this fleet).
 */
function mobilityMetric(cut, extMask, walkMask) {
  const reachable = cut.filter((c) => walkMask[idx(c.x, c.y)]);
  if (reachable.length > MOB_EXACT_MAX) return { sampled: true };
  const ends = reachable.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const n = ends.length;
  const out = {
    sampled: false,
    endpoints: n,
    reachable: reachable.length,
    max: 0,
    mean: 0,
    p90: 0,
    pairs: 0,
    over: 0,
    maxStrict: 0,
    maxDetour: 0,
    worstDetour: null,
    maxGated: 0,
    overGated: 0,
    gatedPairs: 0,
    worstGated: null,
    worst: null,
    coveredPairs: 0,
    maxCovered: 0,
    maxCoveredDetour: 0,
    worstCovered: null,
  };
  if (n < 2) return out;
  const stands = ends.map((e) => mobStands(extMask, e));
  const inF = ends.map((e) => mobBfs(walkMask, e));
  const outF = ends.map((e) => mobBfs(extMask, e));
  // THE WHOLE RECORD, NOT THE TWO NUMBERS THE GATE READS. `mobilityBuilt`
  // publishes fourteen fields and this function used to derive six of them, so
  // the other eight were published by their own producer and re-derived by
  // nothing — the position `nukeWindow` was in when it turned out to be wrong in
  // 145 rooms. The definitions here are transcribed from `mobilityStats`
  // (layer-shell.mjs) deliberately and are checked against it by the
  // publish-vs-derive comparison in checkRoom, which is the only way a
  // transcription stays true.
  const ratios = [];
  let max = 0;
  let maxStrict = 0;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const din = mobArrive(inF[a], ends[b]);
      const raw = mobArrive(outF[a], ends[b]);
      if (!isFinite(din) || !isFinite(raw)) continue;
      const dout = raw - MOB_ARRIVE_BIAS;
      if (dout <= 0) continue;
      const r = din / dout;
      ratios.push(r);
      if (r > MOB_TARGET) out.over++;
      if (raw - 2 > 0 && din / (raw - 2) > maxStrict) maxStrict = din / (raw - 2);
      if (din - dout > out.maxDetour) {
        out.maxDetour = din - dout;
        out.worstDetour = { a: ends[a], b: ends[b], din, dout, ratio: mround2(r) };
      }
      if (r > max) {
        max = r;
        out.worst = { a: ends[a], b: ends[b], din, dout };
      }
      if (mobCovers(ends[a], stands[b]) && mobCovers(ends[b], stands[a])) {
        out.coveredPairs++;
        if (r > out.maxCovered) {
          out.maxCovered = r;
          out.worstCovered = {
            a: ends[a],
            b: ends[b],
            din,
            dout,
            detour: din - dout,
            ratio: mround2(r),
          };
        }
        if (din - dout > out.maxCoveredDetour) out.maxCoveredDetour = din - dout;
        continue;
      }
      if (din - dout > MOB_DETOUR_FLOOR) {
        out.gatedPairs++;
        if (r > MOB_TARGET) out.overGated++;
        if (r > out.maxGated) {
          out.maxGated = r;
          out.worstGated = { a: ends[a], b: ends[b], din, dout };
        }
      }
    }
  }
  out.pairs = ratios.length;
  if (!ratios.length) return out;
  ratios.sort((x, y) => x - y);
  out.max = mround2(max);
  out.mean = mround2(ratios.reduce((p, c) => p + c, 0) / ratios.length);
  out.p90 = mround2(ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * 0.9))]);
  out.maxStrict = mround2(maxStrict);
  out.maxGated = mround2(out.maxGated);
  out.maxCovered = mround2(out.maxCovered);
  return out;
}

/**
 * ------------------------------------------------------------------------
 * THE ECO WALKS AND THE FLOOR UNDER THEM — one derivation, two readers.
 * ------------------------------------------------------------------------
 * `pathController` and `pathSourcesSum` are RING-SEEDED distances: the field is
 * seeded at zero on the anchor's whole walkable ring, so "the controller is 27
 * away" means 27 steps from the hub tile to the nearest tile a creep can WORK
 * the controller from. It is read off the STORAGE tile, not the sitter (layer-hub
 * reads both off `idx(storage)`; the sitter is the road tile beside it).
 *
 * ...AND THE CHEBYSHEV FLOOR WAS ONE TOO HIGH, IN EXACTLY THE ROOMS THAT TAKE IT.
 *
 * The floor is `max(walk-spread floor, chebyshev-spread floor)` and 7 rooms took
 * the chebyshev branch. The bound was written as: two anchors chebyshev d apart
 * cannot both sit within ceil(d/2) of any tile. True — of the distance between
 * the ANCHOR TILES. The distances it bounds are ring-seeded, and a ring saves a
 * step at EACH END, so what the bound actually establishes about the published
 * numbers is ceil((d - 2) / 2).
 *
 * The difference is one tile and it is one tile in the flattering direction, in
 * the rooms that most need the number to be honest. E13S4 declared "two anchors
 * 37 apart cannot both sit within 19 of any tile in the room, so a walk of at
 * least 19 to the far one is owed by EVERY hub this room admits" — and 26,21 is
 * plain walkable floor with a ring walk of 18 to the controller and 18 to source
 * 0. The room was told it was sitting on the floor when it was one tile above
 * it. That is the same defect ("a floor measured in a different metric from the
 * distances it bounds") the round-11 correction closed on the WALK branch and
 * left open on this one, which is why the fix is written here, in one place,
 * with both branches derived side by side.
 *
 * Affected, all seven, old -> new: E12S1 14->13 · E13S4 19->18 · E15S9 16->15 ·
 * E16S5 18->17 · E19S5 19->18 · E2S6 17->16 · E7S5 18->17.
 */
export function ecoWalks(terrain, objects, hubTile) {
  const sources = (objects || []).filter((o) => o.type === "source");
  const controller = (objects || []).find((o) => o.type === "controller");
  const anchors = [...(controller ? [controller] : []), ...sources];
  const ringField = (o) => {
    const dist = new Int16Array(2500).fill(30000);
    const q = [];
    const seed = (x, y) => {
      if (x < 0 || y < 0 || x > 49 || y > 49) return;
      if (isWall(terrain, x, y)) return;
      const i = idx(x, y);
      if (dist[i] > 0) {
        dist[i] = 0;
        q.push(i);
      }
    };
    seed(o.x, o.y);
    for (const [dx, dy] of D8) seed(o.x + dx, o.y + dy);
    let qi = 0;
    while (qi < q.length) {
      const i = q[qi++];
      const x = i % 50,
        y = (i / 50) | 0;
      for (const [dx, dy] of D8) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
        if (isWall(terrain, nx, ny)) continue;
        const ni = idx(nx, ny);
        if (dist[ni] <= dist[i] + 1) continue;
        dist[ni] = dist[i] + 1;
        q.push(ni);
      }
    }
    return dist;
  };
  const fields = anchors.map(ringField);
  const hubI = idx(hubTile.x, hubTile.y);
  const pcRaw = controller ? fields[0][hubI] : null;
  const psRaw = sources.length
    ? sources.reduce((sum, _, i) => sum + fields[(controller ? 1 : 0) + i][hubI], 0)
    : null;
  let sepWalk = null;
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      let best = null;
      for (let t = 0; t < 2500; t++) {
        const a = fields[i][t],
          b = fields[j][t];
        if (a >= 30000 || b >= 30000) continue;
        if (best === null || a + b < best) best = a + b;
      }
      if (best !== null && (sepWalk === null || best > sepWalk)) sepWalk = best;
    }
  }
  let sepCheb = 0;
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      const d = chebyshev(anchors[i], anchors[j]);
      if (d > sepCheb) sepCheb = d;
    }
  }
  // ONE STEP OFF EACH END — see the header. The chebyshev separation is between
  // anchor TILES; the distances it bounds start on the anchors' rings.
  const chebFloor = Math.ceil(Math.max(0, sepCheb - 2) / 2);
  const walkFloor = sepWalk === null ? null : Math.ceil(sepWalk / 2);
  const useWalk = walkFloor !== null && walkFloor > chebFloor;
  return {
    pc: pcRaw !== null && pcRaw < 30000 ? pcRaw : null,
    ps: psRaw !== null && psRaw < 30000 ? psRaw : null,
    sepCheb,
    sepWalk,
    chebFloor,
    walkFloor,
    floor: useWalk ? walkFloor : chebFloor,
    basis: useWalk ? "walk" : "chebyshev",
  };
}

/**
 * Gate names are normalised so a declaration written the obvious way still
 * matches: "link"/"links", "container"/"containers", "extension"/"extensions".
 *
 * THIS TABLE IS A SAFETY MECHANISM, NOT A CONVENIENCE. It is applied to the
 * VIOLATION's gate as well as the declaration's — `fail()` runs every gate name
 * through it — so the set of gates that can never be excused (below) is keyed on
 * one spelling and one spelling only. The table used to cover three types, and
 * the two spellings of everything else went their separate ways: the exact-count
 * check raised `fail("tower", "count", ...)` while UNDECLARABLE held "towers",
 * so a plan missing two towers was excused outright by
 * `{gate:"tower", kind:"count"}` — a singular `r` away from the rule that was
 * supposed to make that impossible. Same shape for spawn/spawns and lab/labs.
 *
 * The fix is not "add the missing string to the refusal set" — that just moves
 * the typo one level up and the next gate name added to this file walks around
 * it again. Every structure gate a `fail()` call site can name is collapsed here
 * to a single canonical spelling FIRST, and the refusal rules are then written
 * against canonical names, so no spelling of a declaration or of a call site can
 * miss them. Singular and plural both map, in both directions, deliberately.
 */
const GATE_ALIAS = {
  link: "links",
  links: "links",
  container: "containers",
  containers: "containers",
  extension: "extensions",
  extensions: "extensions",
  rampart: "rampart",
  ramparts: "rampart",
  // exact-program types. The count check names these singular; the shortfall
  // channel and half of this file's prose name them plural. One canonical form.
  spawn: "spawn",
  spawns: "spawn",
  tower: "towers",
  towers: "towers",
  lab: "labs",
  labs: "labs",
  storage: "storage",
  storages: "storage",
  terminal: "terminal",
  terminals: "terminal",
  nuker: "nuker",
  nukers: "nuker",
  observer: "observer",
  observers: "observer",
  extractor: "extractor",
  extractors: "extractor",
  // the trust gates, so their refusal cannot be walked around by a plural either
  count: "count",
  counts: "count",
  engine: "engine",
  engines: "engine",
  stack: "stack",
  stacks: "stack",
  object: "object",
  objects: "object",
  bound: "bounds",
  bounds: "bounds",
  core: "core",
  cores: "core",
  road: "road",
  roads: "road",
  // the controller gates. "ctrlParks" is the spelling the producer already
  // ships (E17S5, E8S2 both file {gate:"ctrlParks", kind:"seats"}) and normGate
  // lowercases it to "ctrlparks", so the canonical form has to BE the lowercase
  // one or those two declarations would stop matching. Singular and hyphenated
  // twins map too, for the same reason every other entry in this table does:
  // the undeclarable rules below are keyed on one spelling, and a gate name a
  // call site or a declaration can spell two ways is a gate name that can be
  // walked around.
  ctrlpark: "ctrlparks",
  ctrlparks: "ctrlparks",
  "ctrl-park": "ctrlparks",
  "ctrl-parks": "ctrlparks",
  ctrlseat: "ctrlseat",
  ctrlseats: "ctrlseat",
  "ctrl-seat": "ctrlseat",
  "ctrl-seats": "ctrlseat",
};
const normGate = (g) => GATE_ALIAS[String(g || "").toLowerCase()] || String(g || "").toLowerCase();

/**
 * Gates NO declaration can ever excuse. A shortfall is an honest "this room
 * beat me" about CAPACITY — one link short, three extensions short. It is not
 * a licence to ship a structure the server will refuse to build, two
 * structures on one tile, or a base with a hole in it. Those are wrong, not
 * short, and there is no note that makes them right.
 *
 * "towers" IS ON THIS LIST. A shallow tower is not a capacity shortfall — it
 * is a tower that does not work. The whole point of a tower is that nothing
 * can stand where it can be shot; a tower inside the ranged envelope is
 * ground down at leisure by an attacker the tower cannot reach past, and the
 * six of them are the room's entire answer to a siege. There is no note that
 * makes that right, so `{gate:"towers", kind:"shallow-tower"}` is not a
 * declaration, it is laundering, and it is refused here.
 *
 * Note what this list does and does not say. It refuses to let a declaration
 * EXCUSE a violation on these gates; it does not forbid the channel. Layer 3
 * files `{gate:"towers", kind:"weak-battery"}` on rooms whose battery is legal
 * but poor (under 1800 damage on the weakest face, or a refill walk over 8) —
 * there is no violation there for it to launder, and a room that ships the
 * fleet's weakest wall face in silence is exactly the failure mode the
 * shortfall channel exists for. It is still held to the evidence rule below.
 */
const UNDECLARABLE = new Set(["engine", "stack", "object", "bounds", "core", "towers"]);

/**
 * ...and the same refusal at (gate, kind) resolution, for the gates that carry
 * BOTH a wrong and a short.
 *
 * The gate-wide set above is blunt on purpose, and it can only be used where
 * every kind on the gate is wrong-not-short. Several gates are mixed. "count"
 * carries the forbidden-structure rule (a factory is not a shortfall, it is a
 * structure this bot does not build) alongside over-cap and unknown-type.
 * "labs" carries the reagent-range geometry alongside the exact 10. "storage",
 * "terminal", "nuker", "observer", "extractor" each carry exactly one count and
 * nothing else today, but naming the pair rather than the gate keeps the rule
 * true when a second kind lands on them.
 *
 * WHAT THIS REFUSES, AND WHY EXACTLY THIS LIST. The program is 3 spawn, 6 tower,
 * 10 lab, 1 storage, 1 terminal, 1 nuker, 1 observer, 1 extractor-on-mineral.
 * Those are not capacities the room can be short of — the room does not "run out
 * of space for the third spawn" in any sense a note could excuse, it either has
 * the eight structures the bot's whole economy assumes or it is a different base
 * than the one every other system in this repo is written against. A room that
 * ships two spawns and says so in prose is still a room that respawns at
 * two-thirds speed after a wipe, and the note does not spawn the creep.
 *
 * WHAT IS DELIBERATELY NOT HERE. extensions/count, links/count and
 * containers/count stay declarable, and that is the point of the whole channel:
 * those ARE capacities, a genuinely cramped room can fit 57 extensions and no
 * more, and the honest declaration of that is the behaviour this mechanism
 * exists to reward. EXT_SHORTFALL_OK above is the same judgement written as a
 * list. Take those out and the planner's only options on a hard room become lie
 * or fail, which is how a shortfall channel dies.
 *
 * The forbidden rule is unconditional. "No factory, no power spawn, never power"
 * is a doctrine decision about what this bot IS, taken once; a room does not get
 * to be beaten by it, so `{gate:"count", kind:"forbidden"}` — which the reviewer
 * demonstrated laundering a planted factory — excuses nothing now.
 *
 * Note that labs/geometry stays declarable and still cannot hide a wrong lab
 * count: `lab N!=10` is raised TWICE, once here as (labs, count) from the exact
 * program and once inside the geometry bundle, and excusing the second does
 * nothing about the first.
 *
 * THE TWO CONTROLLER PAIRS ARE HERE FOR THE SAME REASON THE FORBIDDEN RULE IS.
 *
 * `ctrlseat|no-seat` — a room that has built over every walkable tile next to
 * its own controller cannot be re-claimed. claimController and signController
 * are both RANGE 1 (@screeps/engine Creep.prototype.claimController), so once
 * the room downgrades to unowned there is no tile a claimer can stand on and
 * the only way back in is to demolish an extension we can no longer build a
 * creep to demolish. Nine shipped rooms were in exactly that state when this
 * gate was written (E11S5, E11S7, E13S9, E18S3, E2S2, E3S1, E4S7, E5S6, E9S2 —
 * five of them with the controller's ONE walkable neighbour taken; the producer
 * has since moved them). That is not a capacity the room
 * ran out of: the seat costs one extension out of sixty, and every one of those
 * nine rooms has deep floor elsewhere. "This room could not fit 60 extensions
 * AND a way back into itself" is not an admission a note gets to make, so the
 * pair is refused here and the producer has to move the structure.
 *
 * `ctrlparks|stale-claim` — meta.ctrlParks disagreeing with the shipped room is
 * a false statement about the plan, not a shortfall in it. The count is measured
 * at layer 1 against an obstacle set that predates extensions, towers, labs, the
 * nuker and the observer, all of which then land on counted park tiles: 84 of
 * 172 rooms shipped fewer parks than they claimed on the run that motivated this
 * rule, and the census line that prints "min 4 · median 8" was describing a fleet
 * whose real reading was min 3 / median 7. A declaration cannot make a stale number true — the number is either
 * what the room ships or it is wrong — so the fix is to re-measure it, not to
 * note it. The SHORTFALL half of the same gate (`ctrlparks|count`, a room that
 * genuinely cannot seat four upgraders) stays declarable, which is the same
 * split as labs/count vs labs/geometry one block up.
 *
 * ------------------------------------------------------------------------
 * ...AND THE ROUND-11 AUDIT: EVERY MESSAGE THAT SAYS "INVARIANT" IS ON THIS LIST
 * ------------------------------------------------------------------------
 * `misc|mineral-seat` is the finding that forced the audit. The MINERAL ENTOMBED
 * message ends with the words "a room object's work seat is a placement
 * invariant, not a shortfall"; the block comment above it says UNDECLARABLE; the
 * goal document says "(MINERAL ENTOMBED, undeclarable)". Three assertions and
 * zero enforcement — a reviewer entombed E11S4's mineral, added
 * `{gate:"misc", kind:"mineral-seat", tiles:[the whole ring]}` with plausible
 * prose, and the entombment DISAPPEARED from the fail list; with the collateral
 * gates declared too the room validated `pass 1/1 · fail 0` on the same summary
 * line that printed `minerals entombed 1`. The gate cannot be blanket-
 * undeclarable because 133 rooms legitimately file `misc|off-network`, so the
 * missing item was always the pair, and here it is.
 *
 * Finding one and stopping would be the same mistake in a new place, so every
 * (gate, kind) this file raises was re-read against its own message, and every
 * one that states a WRONG rather than a SHORT is now named:
 *
 *   `shell|stale-cut`, `shell|cut-not-rampart`, `shell|cut-rampart-rejected` —
 *      meta.shell.cut disagreeing with the wall the room ships is a false
 *      statement about the plan, exactly like `ctrlparks|stale-claim`. Every
 *      shell metric in this file is computed over `cut`; a declaration excusing
 *      a stale one would be excusing all of them at once.
 *   `shell|ctrl-ring` — the mandated stand-denial ring. "Controller outside the
 *      wall: rampart ONLY its adjacent ring" is the doctrine the room's whole
 *      answer to a claim-attack rests on, and a gap in it is an attacker's
 *      stand, not a capacity the room ran out of.
 *   `ctrlparks|no-ctrl-link`, `ctrlparks|ctrl-link-disagreement` — the same
 *      broken-pointer class as `ctrlparks|bad-ctrl-link`, which was already here.
 *   `count|over-cap`, `count|unknown-type` — a 61st extension is not a room that
 *      ran out of space, and a structure type this planner does not know about
 *      is not a shortfall in anything.
 *   `extensions|unreachable` — an extension no creep can walk to cannot be
 *      filled. Wrong, not short; the SHORT half of that gate is
 *      `extensions|count`, which stays declarable and is the point of the whole
 *      channel.
 *   `road|off-network` — subtle, and the same laundering shape as the mineral
 *      seat. A stranded structure IS declarable, but through `misc|off-network`,
 *      which is read tile-by-tile at the exemption site and is now content-
 *      audited (the named tile has to BE a mineral seat and to actually have no
 *      road). Declaring the gate the violation is raised on would skip both
 *      checks and excuse the class wholesale. One channel, and it is the audited
 *      one.
 *
 * ------------------------------------------------------------------------
 * ...AND THE ROUND-12 AUDIT: THE SWEEP MISSED THE GATE THE WHOLE FILE IS FOR
 * ------------------------------------------------------------------------
 * Round 11 walked every message that says "invariant" and named it here. It did
 * not walk every message that IS one. The gate it missed is `rampart`, and
 * `rampart` is the hole in the wall:
 *
 *   `rampart|leak` — a structure of ours standing in the EXTERIOR FLOOD. Not
 *      "outside the wall" as a figure of speech: the attacker walks to it
 *      without breaking anything. A reviewer moved E7S5's `link[1]` to 36,15,
 *      added `{gate:"rampart", kind:"leak"}` and `{gate:"rampart",
 *      kind:"shallow"}` naming that tile with plausible prose, and the room
 *      validated `pass 1/1 · fail 0` ON THE SAME SUMMARY LINE that printed
 *      `leaks 1, shallow 1`. The same two declarations launder a container, a
 *      storage or a tower put outside the wall, because the gate is keyed on the
 *      hole and not on what fell through it. This is the round-11 mineral-seat
 *      defect verbatim, one gate over, and it is the most expensive one yet:
 *      "the base is sealed" is the claim every other shell number in this file
 *      is measured on top of.
 *   `rampart|shallow` — a structure inside the ranged band with no personal
 *      rampart over it. An attacker parks outside the wall and grinds it down
 *      for free. There is no capacity reading of that: the room is not SHORT of
 *      a rampart, the rampart is MISSING, and the whole reason `towers` is
 *      blanket-undeclarable one block up applies here word for word.
 *
 * And then the same question was asked of every remaining pair in the file
 * rather than of the two that were demonstrated, because "find one and stop" is
 * how round 11's list came to be missing these:
 *
 *   `extractor|placement` — an extractor not standing on the mineral mines
 *      nothing, ever. A misplaced structure is not a capacity.
 *   `extensions|diag-only` — this file's own comment on it reads "not a
 *      shortfall at all — they are a maze". Enforced now.
 *   `extensions|off-road` — the block that raises it says "Hard fail" in the
 *      header and then routed it through a channel that could excuse it. A
 *      filler that leaves the road on every refill pays 2 ticks/tile forever;
 *      the room is not short of anything, the extension is in the wrong place.
 *   `road|orphan-road` — a road tile no creep can reach from the sitter is
 *      decay paid for nothing. Its sibling `road|off-network` was already here.
 *   `ctrlseat|seat-unreachable` — the twin of `ctrlseat|no-seat`, which is
 *      already here for exactly this reason: a claim seat that exists and cannot
 *      be walked to is a room that cannot be re-claimed, same as one that does
 *      not exist.
 *
 * WHAT STAYS DECLARABLE, DELIBERATELY, AND THIS IS NOW THE WHOLE LIST:
 * `extensions|count`, `links|count`, `containers|count` (real capacities — the
 * point of the channel), `labs|geometry` (see above; the count is raised twice
 * and only one of them is here) and `ctrlparks|count`/`ctrlparks|seats` (a room
 * that genuinely cannot seat four upgraders). Everything else this file can
 * raise is a WRONG, and none of it can be excused by any note.
 */
const UNDECLARABLE_PAIRS = new Set([
  "spawn|count",
  "towers|count", // also covered gate-wide; spelled out so the rule reads whole
  "labs|count",
  "storage|count",
  "terminal|count",
  "nuker|count",
  "observer|count",
  "extractor|count",
  "count|forbidden",
  "ctrlseat|no-seat",
  "ctrlparks|stale-claim",
  // meta.ctrlLink pointing at a tile that carries no link, or at a tile outside
  // the controller's 2..3 seat band, is a broken pointer — the same class of thing
  // as a planted factory, not a room that ran out of space. Same refusal.
  "ctrlparks|bad-ctrl-link",
  // --- the round-11 audit; see the block comment above for each one ---
  "misc|mineral-seat",
  "shell|stale-cut",
  "shell|cut-not-rampart",
  "shell|cut-rampart-rejected",
  "shell|ctrl-ring",
  "ctrlparks|no-ctrl-link",
  "ctrlparks|ctrl-link-disagreement",
  "count|over-cap",
  "count|unknown-type",
  "extensions|unreachable",
  "road|off-network",
  // --- the round-12 audit; see the block comment above for each one ---
  "rampart|leak",
  "rampart|shallow",
  "extractor|placement",
  "extensions|diag-only",
  "extensions|off-road",
  "road|orphan-road",
  "ctrlseat|seat-unreachable",
]);

/**
 * THE PAIRS THAT MAY BE EXCUSED, AS A CLOSED LIST — because a refusal set is
 * only as good as the day somebody last read the file, and both times this
 * mechanism was broken it was broken by a pair NOBODY HAD LOOKED AT.
 *
 * Every `fail()` and `late()` call site in this file is enumerated here, and the
 * arbitration refuses any (gate, kind) that is not on one list or the other. Add
 * a gate and forget to classify it and the room fails LOUDLY with "this pair is
 * not classified" instead of silently becoming excusable — which is the failure
 * direction that costs nothing to be wrong in. The two lists together are the
 * complete inventory; `assertPairInventory()` below checks they do not overlap.
 */
const DECLARABLE_PAIRS = new Set([
  // real capacities: a cramped room genuinely fits 57 extensions and no more
  "extensions|count",
  "links|count",
  "containers|count",
  // the reagent-range geometry; `labs|count` is raised separately and refused
  "labs|geometry",
  // a room that cannot seat four upgraders, and the as-built seat re-count
  "ctrlparks|count",
  "ctrlparks|seats",
]);

/**
 * Every (gate, kind) this file can RAISE. Kept beside the two rules above so the
 * three can be checked against each other once, at load, instead of drifting
 * apart across three hundred lines the way the last two holes did.
 */
const RAISED_PAIRS = [
  "spawn|count",
  "extensions|count",
  "towers|count",
  "labs|count",
  "storage|count",
  "terminal|count",
  "nuker|count",
  "observer|count",
  "extractor|count",
  "extractor|placement",
  "links|count",
  "containers|count",
  "count|unknown-type",
  "count|over-cap",
  "count|forbidden",
  "labs|geometry",
  "stack|stack",
  "object|on-object",
  "bounds|edge",
  "engine|on-wall",
  "engine|engine-reject",
  "core|sitter",
  "core|open-core",
  "rampart|leak",
  "rampart|shallow",
  "towers|shallow-tower",
  "extensions|diag-only",
  "extensions|unreachable",
  "extensions|off-road",
  "road|orphan-road",
  "road|off-network",
  "shell|stale-cut",
  "shell|cut-not-rampart",
  "shell|cut-rampart-rejected",
  "shell|ctrl-ring",
  "misc|mineral-seat",
  "ctrlseat|no-seat",
  "ctrlseat|seat-unreachable",
  "ctrlparks|bad-ctrl-link",
  "ctrlparks|ctrl-link-disagreement",
  "ctrlparks|no-ctrl-link",
  "ctrlparks|seats",
  "ctrlparks|stale-claim",
];

/**
 * Load-time consistency check on the three lists above. A pair may not be on
 * both refusal lists, and every pair this file raises must be on exactly one of
 * them. This is the thing that was missing: the rule "every violation is
 * classified" existed only as a paragraph, and a paragraph does not run.
 */
function assertPairInventory() {
  const problems = [];
  for (const p of DECLARABLE_PAIRS) {
    if (UNDECLARABLE_PAIRS.has(p)) problems.push(`${p} is on BOTH refusal lists`);
  }
  for (const p of RAISED_PAIRS) {
    const gate = p.split("|")[0];
    if (UNDECLARABLE.has(gate)) continue; // refused gate-wide, which is stronger
    if (UNDECLARABLE_PAIRS.has(p) || DECLARABLE_PAIRS.has(p)) continue;
    problems.push(`${p} is raised by this file and classified by neither list`);
  }
  if (problems.length) {
    throw new Error(
      `validate.mjs pair inventory is inconsistent — ${problems.join("; ")}. A violation class nobody ` +
        `classified defaults to EXCUSABLE, which is how the rampart gate came to be launderable for ` +
        `two rounds.`,
    );
  }
}
assertPairInventory();

/**
 * ==========================================================================
 * ...AND THE SAME INVENTORY FOR THE OTHER DIRECTION: WHICH DECLARATION KINDS
 * ARE OBLIGED TO EXIST.
 * ==========================================================================
 * The obligation block at the bottom of checkRoom re-derives, per kind, the
 * state that DEMANDS a declaration, so a room cannot go quiet by deleting one.
 * Round 12 added a trigger for every kind the fleet shipped that day, and the
 * paragraph above it then claimed the set was complete — while the same file,
 * two hundred lines further down, said "three are not fully re-derivable".
 * Neither sentence ran. Nothing checked that a kind APPEARING in a shipped plan
 * has a trigger at all, so the next kind this planner invents ships as free
 * narration exactly the way `ctrlParks/released` and `spawnFan/sector` did, and
 * the completeness claim rots silently in a comment. That is the shape of the
 * defect this whole round is about, one level up.
 *
 * So the claim is an inventory and the inventory is asserted:
 *
 *   OBLIGATION_KINDS   every `gate|kind` pair the obligation block below has a
 *                      trigger for. One entry per `has(...)` call site.
 *   OBLIGATION_EXEMPT  the kinds that are NOT re-derivable from the shipped
 *                      board, NAMED, with the reason. An exemption spelled as
 *                      an absence is indistinguishable from an oversight; this
 *                      is the same argument that put `EXT_SHORTFALL_OK` and
 *                      `DECLARABLE_PAIRS` in explicit lists.
 *
 * checkRoom then takes the kind inventory of the declarations the room actually
 * ships and fails the room for any kind in neither list. A new kind therefore
 * cannot ship until somebody either writes its trigger or writes down why there
 * cannot be one.
 */
const OBLIGATION_KINDS = new Set([
  "mobility|", //                as-built gated lap over MOB_TARGET
  "mobility|covered-detour", //  the RECORD's worst pair, excused by coverage
  "extensions|shallow", //       extensions under DEPTH_SAFE
  "towers|clump", //             >= 5 towers within chebyshev 2 of the sitter
  "towers|weak-battery", //      weak sealing face or refill walk over the note line
  "misc|off-network", //         a mineral seat with no road and no container neighbour
  "eco|", //                     hub walks over the fleet-median gate
  "towerRefill|", //             refill walk over the hard MAX_REFILL
  "battlements|unreachable", //  cut tiles the garrison's walk region cannot reach
  "battlements|", //             ...and the layer-2 flavour of the same fact
  "shell|", //                   a link standing on the wall
  "labs|shallow-lab", //         a lab under DEPTH_SAFE
  "labs|lab-haul", //            the hub-to-diamond hauler walk over LAB_HAUL_NOTE
  "spawnFan|sector", //          the worst spawn pair under SECTOR_TARGET
  "ctrlParks|seats", //          seat count at or under THIN_PARKS
  "ctrlParks|released", //       seats given back to the extension mass
  "runtime|heavy-search", //     more than RUNTIME_NOTE_COMPOSES complete plans
]);

/**
 * Kinds with no trigger, and the reason there cannot be one. The reason is the
 * point: it is checkable prose about a re-derivation that does not exist, and
 * the moment somebody makes it exist the entry moves up one list.
 */
const OBLIGATION_EXEMPT = new Map([
  [
    "labs|lab-road-eat",
    `the lab diamond displaced planned road tiles. The displaced tiles are DELETED from the plan by ` +
      `the time it ships, so the finished board carries no trace of them and no re-derivation exists. ` +
      `The CONTENT is still audited where the declaration names tiles (a named tile must not carry a ` +
      `road today); what cannot be checked is whether a room that files nothing should have`,
  ],
]);

/**
 * Load-time consistency check on the two lists above, in the same spirit as
 * assertPairInventory: a kind may not be both triggered and exempt, an exemption
 * must carry a reason long enough to be a reason, and the pair strings must be
 * well formed (`gate|kind`, kind possibly empty, gate normalised the way
 * `normGate` normalises it — otherwise the runtime lookup silently misses and
 * every kind looks unclassified).
 */
const normPair = (p) => {
  const i = String(p).indexOf("|");
  return `${normGate(String(p).slice(0, i))}|${String(p).slice(i + 1)}`;
};
/** the two lists above, keyed the way `buildArbitration` keys a declaration */
const OBLIGATION_KINDS_N = new Set([...OBLIGATION_KINDS].map(normPair));
const OBLIGATION_EXEMPT_N = new Map([...OBLIGATION_EXEMPT].map(([p, w]) => [normPair(p), w]));

function assertKindObligations() {
  const problems = [];
  for (const p of OBLIGATION_KINDS) {
    if (OBLIGATION_EXEMPT.has(p)) problems.push(`${p} is BOTH triggered and exempt`);
  }
  if (OBLIGATION_KINDS_N.size !== OBLIGATION_KINDS.size) {
    problems.push(`two triggered kinds normalise to the same slot — one of them can never be looked up`);
  }
  for (const p of [...OBLIGATION_KINDS, ...OBLIGATION_EXEMPT.keys()]) {
    if (!/^[A-Za-z]+\|/.test(p)) problems.push(`${p} is not a well-formed gate|kind pair`);
  }
  for (const [p, why] of OBLIGATION_EXEMPT) {
    if (typeof why !== "string" || why.trim().length < 40) {
      problems.push(`${p} is exempt with no stated reason — an exemption without one is an oversight`);
    }
  }
  if (problems.length) {
    throw new Error(
      `validate.mjs obligation inventory is inconsistent — ${problems.join("; ")}. A declaration kind ` +
        `nobody is obliged to file is a planner convention, not a gate, and the completeness of this set ` +
        `used to be asserted only in a comment.`,
    );
  }
}
assertKindObligations();

/**
 * ==========================================================================
 * ...AND THE THIRD DIRECTION: WHICH DECLARATION KINDS HAVE A GENERATED
 * PARAGRAPH. Same argument, third time.
 * ==========================================================================
 * `declprose.mjs` exists because a paragraph that merely QUOTES its record can
 * assert the opposite of it. Round 12 wrote the module and registered eight
 * renderers, and the eight were the kinds a reviewer had happened to attack;
 * ten kinds — 31 declarations — went on shipping prose assembled inside their
 * producers out of the producers' own locals, which looks like generation and is
 * not, because this file has the record and not the producer's scope. Four
 * demonstrable lies passed on that gap in one round:
 *
 *   E2S8   towerRefill        "3 walk from the sitter" over a record saying 11
 *   E13S3  battlements/unreachable  "0 cut tile(s)" over a record saying 1
 *   E12S5  ctrlParks/seats    "AS BUILT this link feeds 7" over a record saying
 *                             5 — and that pair is in DECLARABLE_PAIRS, so the
 *                             paragraph excuses a HARD gate
 *   E13S2  labs/lab-haul      "2 hauler tile(s)" — the fleet median — over 12
 *
 * The completeness claim is therefore an inventory like the other two: the kind
 * set this file knows about (OBLIGATION_KINDS plus the named exemptions) must
 * equal the RENDERERS key set exactly. A kind added to the planner without a
 * renderer cannot pass this assertion, and a renderer for a kind nothing else in
 * this file knows about is a renderer nobody will maintain. checkRoom then fails
 * any SHIPPED declaration whose kind has no renderer, which covers the case a
 * load-time list cannot: a kind invented after this file was written.
 */
function assertProseInventory() {
  const known = new Set([...OBLIGATION_KINDS_N, ...OBLIGATION_EXEMPT_N.keys()]);
  const problems = [];
  for (const k of known) {
    if (!AUDITED_KINDS.has(k)) {
      problems.push(`${k} is a declaration kind with no renderer in declprose.mjs`);
    }
  }
  for (const k of AUDITED_KINDS) {
    if (!known.has(k)) {
      problems.push(`${k} has a renderer and is not a declaration kind this file knows about`);
    }
  }
  if (problems.length) {
    throw new Error(
      `validate.mjs prose inventory is inconsistent — ${problems.join("; ")}. A declaration kind whose ` +
        `paragraph is typed rather than generated is a sentence nothing compares to its record, which is ` +
        `how four false paragraphs shipped and passed in one round.`,
    );
  }
}
assertProseInventory();

/**
 * ==========================================================================
 * THE CLOSED CLASS LIST FOR A REDUNDANT-CUT REFUSAL.
 * ==========================================================================
 * `meta.shell.redundantCut.reasons` is the record that makes "the cut is a
 * SUPERSET of the singly seal-critical tiles" honest: every extra tile carries a
 * named reason. Round 12 audited the reasons that volunteered a `pricedDeltas`
 * block — three of the forty-three the fleet ships — and left the other forty as
 * free text. Free text is not a class: an EMPTY reasons map passed, a reason of
 * `{class:"banana"}` passed, and deleting the priced block off the one showcase
 * refusal passed, because the audit was opt-in by construction (`filter(r =>
 * r.pricedDeltas)`).
 *
 * So the class is an ENUM and each member of it names a re-derivation this file
 * performs by DELETING THE RAMPART and measuring. The two lists are asserted
 * against each other at load, exactly like the pair inventory: a class the
 * producer invents and this file does not re-derive is a hard fail on the room
 * that ships it, not a silent pass.
 *
 * `is` matches the producer's own class string (layer-walls.mjs `refuse(...)`
 * call sites). Two of the six are whole sentences rather than labels; they are
 * matched on their stable prefix and normalised to the id used here.
 */
const CUT_REASON_CLASSES = [
  {
    id: "load-bearing",
    is: (c) => c === "load-bearing on interior floor",
    rederive: `delete the rampart, re-flood the exterior: the named interior tile must go from inside the wall to outside it`,
  },
  {
    id: "depth-promotion",
    is: (c) => c === "depth promotion",
    rederive: `delete the rampart, re-flood, re-measure depth: the named structure's depth must fall by exactly the quoted step and land inside the ranged band`,
  },
  {
    id: "personal-cover",
    is: (c) => c === "personal cover",
    rederive: `the tile must carry a structure, be at the quoted depth today, and be shallower still with the rampart gone`,
  },
  {
    id: "walk-region",
    is: (c) => c === "walk region",
    rederive: `re-walk the garrison's interior region with and without the rampart and compare the two sizes to the quoted pair`,
  },
  {
    id: "stand-denial",
    is: (c) => c.startsWith("keep-class: the controller's stand-denial ring"),
    rederive: `the tile must be D8-adjacent to the controller and D8-adjacent to the exterior flood — the premise "an attacker CAN stand here"`,
  },
  {
    id: "promotes-outsider",
    is: (c) => c.startsWith("the stand-denial keep-class does not apply"),
    rederive: `the pricedDeltas block, re-derived by deleting the rampart and re-measuring the wall, the weakest face and the gated lap`,
  },
];
/** the ids checkRoom actually implements a re-derivation for */
const CUT_REASON_REDERIVED = new Set([
  "load-bearing",
  "depth-promotion",
  "personal-cover",
  "walk-region",
  "stand-denial",
  "promotes-outsider",
]);

function assertCutReasonInventory() {
  const problems = [];
  const seen = new Set();
  for (const c of CUT_REASON_CLASSES) {
    if (seen.has(c.id)) problems.push(`${c.id} is listed twice`);
    seen.add(c.id);
    if (typeof c.is !== "function") problems.push(`${c.id} has no matcher`);
    if (typeof c.rederive !== "string" || c.rederive.length < 40) {
      problems.push(`${c.id} does not state how it is re-derived`);
    }
    if (!CUT_REASON_REDERIVED.has(c.id)) {
      problems.push(`${c.id} is an admissible class with no re-derivation in checkRoom`);
    }
  }
  for (const id of CUT_REASON_REDERIVED) {
    if (!seen.has(id)) problems.push(`${id} is re-derived by checkRoom and is not an admissible class`);
  }
  if (problems.length) {
    throw new Error(
      `validate.mjs redundant-cut class inventory is inconsistent — ${problems.join("; ")}. A refusal ` +
        `class nobody re-derives is a sentence, and "naming a reason is not having one" is this project's ` +
        `own line.`,
    );
  }
}
assertCutReasonInventory();

/**
 * ==========================================================================
 * LAYER 7's PER-TILE ROAD PROVENANCE — the closed kind list.
 * ==========================================================================
 * `meta.walls.roadKind` maps a shipped road tile to the layer-7 pass that laid
 * it. It exists because the film's layer-7 caption used to assert one purpose
 * ("rampart spurs and the extension-face safety net") over a layer that bundles
 * six of them, and 39 tiles in 20 rooms were captioned as something they are
 * not. A provenance map is only worth the caption it feeds if the map itself is
 * checked, so: the kinds are a closed set, every key is a tile this room
 * actually paves, and the three kinds that ARE re-derivable from the shipped
 * board are re-derived (swamp paving is swamp; the conduct bridge is the bridge;
 * the along-cut swaps are the counter). "0 unclassified" then means something,
 * because there is nowhere for an unclassified tile to hide.
 */
const ROAD_KINDS = new Set([
  "stitch", //          (2) joining the road clusters the earlier layers left apart
  "spur", //            (5) the rampart spur — a stub from the network to a wall tile
  "extFace", //         (6) the extension-face safety net
  "swampPave", //       swamp under a road the garrison walks often
  "alongCutMoved", //   (5b) a paved cut tile moved onto its interior parallel
  "reflow", //          (7b) the post-prune extension reflow's new faces
  "conductBridge", //   the RCL-deferred conduct join
]);

/**
 * A tile-less declaration's budget is how many violations of one class it may
 * excuse, and `sf.count` sets it. Left unbounded, `count: 9999` is a gate-wide
 * wildcard spelled as an integer — the exact thing MAX_DECL_TILES refuses in the
 * tile channel and nothing refused in this one. The largest count this planner
 * ships is 15 (E9S2's shallow extensions); the cap is 32, the same five-times
 * headroom the tile cap uses, and it is a HARD FAIL rather than a clamp because
 * a producer asking to excuse a hundred of anything has a bug worth reporting.
 */
const MAX_DECL_BUDGET = 32;

/**
 * EVIDENCE. A declaration is a claim that a room beat the planner, and the
 * mechanism only works if the claim is auditable — the whole point of the
 * shortfall channel is that the planner may lose, loudly, in public. A bare
 * `{gate:"rampart", kind:"leak"}` says nothing a reader can check: it names
 * the violation it wants excused and stops. That is not an admission, it is a
 * suppression flag, and two fields of it would silently excuse a real hole.
 *
 * So a declaration is ADMISSIBLE only if it carries evidence:
 *   - `detail` is a string of >= 40 characters that QUANTIFIES something (real
 *     prose — which tile, why the room cannot do better, what was tried), OR
 *   - the entry carries a well-formed non-empty `rungs` (the ladder that was
 *     walked) or `tiles` (the exact tiles the room lost).
 * Anything else is INADMISSIBLE: it excuses nothing, and its presence is
 * itself a hard fail for the room. A declaration with no evidence is not a
 * declaration.
 *
 * WHY A CHARACTER COUNT WAS NOT ENOUGH. The bar used to be exactly
 * `detail.trim().length >= 40`, and forty `a` characters cleared it. So did
 * `tiles: [null]` and `rungs: [null]` — the old test asked only whether the
 * array had a length. That is not an evidence rule, it is a length rule, and a
 * length rule is trivially satisfiable by a producer that wants to be quiet; the
 * whole channel then costs a suppression flag plus a sentence of filler.
 *
 * The bar now is that the evidence QUANTIFIES. Every honest declaration this
 * planner ships says a number out loud, because every one of them is the result
 * of a measurement that lost: "the weakest wall face sees 1440 damage", "57 of
 * 60 extensions fit", "the lap is 6 over 15 tiles of detour". So prose must
 * carry at least two DISTINCT numeric tokens — one number can be a room name or
 * an RCL, two are an argument — and the structured channels must actually be
 * structured: tiles are objects with integer x/y on the board, rungs are objects
 * with at least one numeric field in them. The fleet's own declarations clear
 * this with nothing to spare in one place (E5S9's rampart note quantifies with
 * exactly two distinct numbers) and comfortably everywhere else, which is the
 * right place for a bar: it is the floor the honest producer already stands on.
 *
 * MALFORMED IS INADMISSIBLE, NOT MERELY UNCOUNTED. The three channels are
 * sanitised independently, and a channel that is PRESENT but malformed fails the
 * whole declaration rather than quietly falling back to another one. Two reasons.
 * A `tiles` list of junk that silently degraded to "no tiles" would not just lose
 * its evidence — it would turn a tiled declaration into a TILE-LESS one, and
 * tile-less declarations speak for a whole class (see the arbitration below), so
 * the malformed entry would come out WIDER than the well-formed one it was
 * written as. And a producer whose tiles come out as junk has a bug that a
 * validator should report, not absorb.
 *
 * THE TILE-LIST CAP. A declaration that names half the room is not a
 * declaration. `tiles` is arbitration input — a tiled declaration excuses
 * violations whose tiles are all inside its list — so a list of all 2500 tiles
 * is a gate-wide wildcard written as evidence, and it would even pass the
 * "structured" test above with flying colours. The largest tile list this
 * planner actually ships across all 159 rooms is 6 (E11S2). The cap is 32:
 * five times the real maximum, so no honest declaration can grow into it by
 * accident, and two orders of magnitude short of "the room".
 */
/**
 * ------------------------------------------------------------------------
 * THE SCHEMA PRESENCE GATE — because "absent" was a way of answering "no".
 * ------------------------------------------------------------------------
 * Every audit in this file that reads a published field is written the same
 * defensive way: `if (plan.meta?.shell?.cut)`, `(plan.meta?.shell?.cut || [])`
 * then `if (len)`. That is the right shape for code that must not throw on a
 * malformed plan, and it is a catastrophic shape for a GATE, because it makes
 * the absence of a key indistinguishable from the check passing.
 *
 * A reviewer proved it end to end on E11S7. Dropping the room's `mobility`
 * declaration failed it with two explicit UNDECLARED messages (gated lap 9.33,
 * `covered-detour` owed). The same edit PLUS `delete plan.meta.shell.cut`
 * validated `pass 1/1 · fail 0`. `cut: []` was caught — an empty array is
 * truthy, and the battery block says UNMEASURABLE about it — but deleting the
 * key switched off the mobility metric, every mobility obligation, every
 * mobility content audit, `shell/stale-cut`, `shell/cut-not-rampart`,
 * `shell/cut-rampart-rejected` and `towers/battery-stale` in one line. A hard
 * gate a room can excuse itself from by omitting a key is not a hard gate; it
 * is an opt-in.
 *
 * So the keys every audit depends on are declared here and their ABSENCE is a
 * hard fail in its own right, checked before anything reads them. The rule is
 * deliberately about PRESENCE AND SHAPE and not about content — content is what
 * the rest of the file is for — and it is deliberately a list rather than a
 * `for (key of Object.keys(meta))` sweep, because the point is that a human
 * decided each of these is load-bearing and wrote down why.
 *
 * `when` narrows a requirement to the rooms it applies to (the redundant-cut
 * record is only owed by a room whose cut is a superset of its seal-critical
 * set). Everything without a `when` is owed by all 172.
 */
const REQUIRED_META = [
  {
    path: "meta.shortfalls",
    is: (v) => Array.isArray(v),
    why: "the declaration channel itself. Absent, every obligation check below has nothing to look in and every room owes nothing",
  },
  {
    path: "meta.shell.cut",
    is: (v) => Array.isArray(v) && v.length > 0,
    why: "THE WALL. Every shell metric in this file — battlements, the weakest face, the mobility endpoints, stale-cut, cut-not-rampart — is computed over it, and all of them skip silently when it is missing. The smallest cut this planner ships is 4 tiles; a room with none is not a base",
  },
  {
    path: "meta.shell.mobilityBuilt",
    is: (v) => v && typeof v === "object" && typeof v.maxGated === "number",
    why: "the as-built defender lap, which is the fleet headline (plan.mjs reads `maxGated` for it) and the trigger for the `mobility` obligation",
  },
  {
    path: "meta.shell.bubble",
    is: (v) => Array.isArray(v),
    why: "the declared personal-cover ramparts. The inert prune's keep-class (c) is defined over it, so an absent list is a keep-class that holds nothing",
  },
  {
    path: "meta.shell.standDenial",
    is: (v) => Array.isArray(v),
    why: "the controller stand-denial ring, which is both a hard gate (`shell/ctrl-ring`) and one of the five classes the road+rampart taxonomy is checked against",
  },
  {
    path: "meta.shell.redundantCut",
    is: (v) => v && typeof v === "object" && typeof v.tiles === "number" && v.reasons && typeof v.reasons === "object",
    why: "the per-tile justification for every cut tile that is not singly load-bearing. The cut is published as a superset-with-per-tile-justification; without the record it is just a superset",
  },
  {
    path: "meta.walls.roadRampart",
    is: (v) =>
      v &&
      typeof v === "object" &&
      ["total", "crossing", "seat", "ring", "cover", "unclassified"].every((k) => typeof v[k] === "number"),
    why: "the five-class road-on-rampart taxonomy. It was summed by its own producer and read by nothing — the exact position `nukeWindow` was in for two rounds before it turned out to be wrong in 145 rooms",
  },
  {
    path: "meta.towers.nukeWindow",
    is: (v) => v && typeof v === "object" && typeof v.value === "number",
    why: "the high-value mass a single nuke can take. Re-derived below; the re-derivation used to be skipped when the key was absent",
  },
  {
    path: "meta.towers.refillDists",
    is: (v) => Array.isArray(v) && v.length > 0,
    why: "the tower refill walk, the trigger for half of the `towers/weak-battery` obligation",
  },
  {
    path: "meta.towers.maxRefill",
    is: (v) => typeof v === "number",
    why: "the furthest of those walks, quoted by the declaration and compared against the note line",
  },
  {
    path: "meta.towers.shippedCutTiles",
    is: (v) => typeof v === "number",
    why: "the size of the wall the battery was scored against AS SHIPPED, as opposed to the wall layer 3 optimised over",
  },
  {
    path: "meta.ctrlParks",
    is: (v) => typeof v === "number",
    why: "the upgrader seat count, held to a hard floor and re-derived below. An absent count is a room that never claimed anything and therefore never lied",
  },
  {
    path: "meta.counts",
    is: (v) => v && typeof v === "object",
    why: "the structure census the gallery and the pusher both read",
  },
  {
    path: "meta.compositions",
    is: (v) => v && typeof v === "object" && typeof v.total === "number",
    why: "how many complete plans this room composed, across every seed. It is the trigger for the `runtime/heavy-search` obligation, and until it existed that trigger read the declaration's own copy of the number — so deleting the declaration deleted the evidence that it was owed",
  },
];

const MIN_DETAIL_CHARS = 40;
/** two distinct numbers, not one: one number is a room name, two are an argument */
const MIN_DETAIL_NUMS = 2;
/** measured shipped maximum is 6 tiles; see the block comment above */
const MAX_DECL_TILES = 32;

const isTile = (t) =>
  t !== null &&
  typeof t === "object" &&
  Number.isInteger(t.x) &&
  Number.isInteger(t.y) &&
  t.x >= 0 &&
  t.x <= 49 &&
  t.y >= 0 &&
  t.y <= 49;

/**
 * Sanitise `sf.tiles`. Returns {present, tiles, bad}: `bad` is a reason string
 * when the channel is present but malformed (which makes the whole declaration
 * inadmissible), `tiles` is the sanitised list, and `present` says whether the
 * channel carries evidence at all. An empty array is the planner's own way of
 * writing "this is a class claim, I have no tiles for it" — 4 shipped
 * declarations omit the key entirely and none ship it empty — so an empty array
 * is NOT malformed, it is simply not evidence.
 */
function sanitiseTiles(sf) {
  if (sf.tiles === undefined || sf.tiles === null) return { present: false, tiles: [], bad: null };
  if (!Array.isArray(sf.tiles)) {
    return { present: true, tiles: [], bad: `tiles is ${typeof sf.tiles}, not an array` };
  }
  if (!sf.tiles.length) return { present: false, tiles: [], bad: null };
  if (sf.tiles.length > MAX_DECL_TILES) {
    return {
      present: true,
      tiles: [],
      bad:
        `tiles names ${sf.tiles.length} tile(s), over the ${MAX_DECL_TILES} cap — a declaration that ` +
        `names a large fraction of the room is not a declaration, it is a gate-wide wildcard wearing ` +
        `evidence (the largest list this planner ships is 6)`,
    };
  }
  const bad = sf.tiles.filter((t) => !isTile(t));
  if (bad.length) {
    return {
      present: true,
      tiles: [],
      bad:
        `${bad.length} of ${sf.tiles.length} tile entr(ies) are not {x,y} integers on the board ` +
        `(first: ${JSON.stringify(bad[0])})`,
    };
  }
  return { present: true, tiles: sf.tiles, bad: null };
}

/**
 * Sanitise `sf.rungs` — the escalation ladder a layer walked before it gave up.
 * Array or object-of-rungs both accepted (layers write both shapes). A rung has
 * to be an object carrying at least one finite number, because a rung IS a
 * measurement: `{rung:0, mobility:3.5, ramparts:54}`. `[null]` is not a ladder.
 */
function sanitiseRungs(sf) {
  if (sf.rungs === undefined || sf.rungs === null) return { present: false, bad: null };
  const arr = Array.isArray(sf.rungs)
    ? sf.rungs
    : typeof sf.rungs === "object"
      ? Object.values(sf.rungs)
      : null;
  if (!arr) return { present: true, bad: `rungs is ${typeof sf.rungs}, not an array or object` };
  if (!arr.length) return { present: false, bad: null };
  const bad = arr.filter(
    (r) =>
      r === null ||
      typeof r !== "object" ||
      !Object.values(r).some((v) => typeof v === "number" && Number.isFinite(v)),
  );
  if (bad.length) {
    return {
      present: true,
      bad:
        `${bad.length} of ${arr.length} rung(s) are not objects carrying a numeric field ` +
        `(first: ${JSON.stringify(bad[0])}) — a rung with no measurement in it is not a ladder`,
    };
  }
  return { present: true, bad: null };
}

/**
 * @returns {{why: string|null, tiles: {x:number,y:number}[]}} `why` non-null =
 * INADMISSIBLE (hard fail, excuses nothing); `tiles` is the sanitised tile list
 * the arbitration below is allowed to use.
 */
function admitDeclaration(sf) {
  const where = `on gate "${normGate(sf.gate)}"` + (sf.kind ? `/kind "${sf.kind}"` : "");
  const t = sanitiseTiles(sf);
  const r = sanitiseRungs(sf);
  const malformed = [t.bad, r.bad].filter(Boolean);
  if (malformed.length) {
    return {
      why:
        `INADMISSIBLE DECLARATION ${where} — malformed evidence: ${malformed.join("; ")}. ` +
        `Evidence that does not parse is not evidence; this declaration excuses nothing.`,
      tiles: [],
    };
  }
  const detail = typeof sf.detail === "string" ? sf.detail.trim() : "";
  const nums = new Set(detail.match(/\d+(?:\.\d+)?/g) || []);
  const detailOk = detail.length >= MIN_DETAIL_CHARS && nums.size >= MIN_DETAIL_NUMS;
  if (detailOk || t.present || r.present) return { why: null, tiles: t.tiles };
  return {
    why:
      `INADMISSIBLE DECLARATION ${where} — no evidence (detail ${detail.length} chars with ` +
      `${nums.size} distinct number(s); the bar is ${MIN_DETAIL_CHARS} chars AND ` +
      `${MIN_DETAIL_NUMS} numbers, or a well-formed non-empty rungs/tiles). ` +
      `A declaration that quantifies nothing is not a declaration; it excuses nothing.`,
    tiles: [],
  };
}

/**
 * Turn a plan's declaration list into an arbiter: the admissible declarations,
 * the hard-fail messages for the inadmissible ones, and `excused(violation)`.
 *
 * WHY THIS IS A FUNCTION AND WHY IT IS EXPORTED. It used to be forty lines
 * inline in checkRoom, closed over nothing but its own two locals, and that made
 * one of its rules untestable in practice. The tile-less BUDGET below bounds how
 * many violations of one (gate, kind) a single tile-less declaration may excuse —
 * and no room in the fleet can exercise it, because every gate in this file
 * raises at most ONE violation per (gate, kind), so end-to-end the budget of 1 is
 * indistinguishable from the unbounded wildcard it replaced. A rule whose failure
 * mode cannot be reproduced is a rule nobody can trust; pulled out here it takes
 * a list of violations and can be handed five of one class directly. The budget
 * is for the gate that gets added next, and this is how that gate's author finds
 * out it works.
 *
 * `excused` is STATEFUL — it spends budget — so one arbiter serves one room and
 * violations must be offered to it in the order they were raised.
 *
 * @param {{gate?:string,kind?:string,detail?:string,tiles?:any,rungs?:any,count?:number}[]} declared
 */
export function buildArbitration(declared) {
  const inadmissible = [];
  const decls = [];
  /** (gate|kind) -> the declarations already filed for it, for the duplicate rule */
  const bySlot = new Map();
  for (const sf of declared || []) {
    if (!sf || typeof sf !== "object") {
      inadmissible.push(`INADMISSIBLE DECLARATION — entry is not an object (${JSON.stringify(sf)})`);
      continue;
    }
    const { why, tiles: okTiles } = admitDeclaration(sf);
    if (why) {
      inadmissible.push(why);
      continue; // dropped: an inadmissible declaration excuses nothing
    }
    const stated = typeof sf.count === "number" && Number.isFinite(sf.count) && sf.count >= 0;
    // ------------------------------------------------------------------
    // THE BUDGET IS BOUNDED. See MAX_DECL_BUDGET: an unbounded `count` is the
    // tile-list wildcard written as an integer, and the tile channel has had a
    // cap on it since the round the wildcard was found there.
    // ------------------------------------------------------------------
    if (stated && Math.floor(sf.count) > MAX_DECL_BUDGET) {
      inadmissible.push(
        `INADMISSIBLE DECLARATION on gate "${normGate(sf.gate)}"` +
          (sf.kind ? `/kind "${sf.kind}"` : "") +
          ` — \`count\` is ${sf.count}, over the ${MAX_DECL_BUDGET} budget cap. A tile-less declaration ` +
          `excuses \`count\` violations of its class, so an unbounded count is a gate-wide wildcard ` +
          `wearing an integer (the largest this planner ships is 15).`,
      );
      continue;
    }
    const slot = `${normGate(sf.gate)}|${sf.kind ? String(sf.kind) : ""}`;
    // ------------------------------------------------------------------
    // ONE DECLARATION PER (GATE, KIND). A SECOND ONE IS A SECOND BUDGET.
    //
    // `excused` walks `decls` in order and spends each entry's budget
    // independently, so two admissible entries naming the same class excuse
    // twice as much as either of them says it does — and N of them excuse N
    // times, which is the budget cap above defeated by copy-and-paste. Nothing
    // legitimate needs it: no room in the fleet files a (gate, kind) twice, the
    // producers that do file per-tile facts (`misc/off-network`,
    // `ctrlParks/seats`) put every tile in ONE entry's `tiles`, and a class that
    // genuinely needs to say two different things about itself has `count` for
    // the quantity and `tiles` for the identity. So the second entry is refused
    // outright rather than merged: merging would let the pair through with the
    // wider of the two evidence sets, which is the wrong direction.
    // ------------------------------------------------------------------
    if (bySlot.has(slot)) {
      inadmissible.push(
        `DUPLICATE DECLARATION on gate "${normGate(sf.gate)}"` +
          (sf.kind ? `/kind "${sf.kind}"` : " (kind-less)") +
          ` — this room files ${bySlot.get(slot) + 1} declarations for one class. Each one is arbitrated ` +
          `with its own budget, so N copies of an honest declaration excuse N times what it claims; a ` +
          `class that has more than one thing to say says it with \`count\` and \`tiles\` inside ONE ` +
          `entry. Both copies are dropped and neither excuses anything.`,
      );
      bySlot.set(slot, bySlot.get(slot) + 1);
      // and the first copy loses its licence too — see the message: an
      // ambiguous class is not arbitrated on the first-writer-wins rule
      for (const d of decls) if (`${d.gate}|${d.kind || ""}` === slot) d.voided = true;
      continue;
    }
    bySlot.set(slot, 1);
    decls.push({
      gate: normGate(sf.gate),
      kind: sf.kind ? String(sf.kind) : null,
      // sanitised, never sf.tiles — a malformed list never reaches arbitration
      tiles: new Set(okTiles.map((t) => key(t.x, t.y))),
      budget: stated ? Math.floor(sf.count) : 1,
      used: 0,
      voided: false,
    });
  }
  const excused = (f) => {
    if (UNDECLARABLE.has(f.gate)) return false;
    if (UNDECLARABLE_PAIRS.has(`${f.gate}|${f.kind}`)) return false;
    // A CLASS NOBODY CLASSIFIED IS NOT EXCUSABLE. See assertPairInventory: the
    // load-time check catches a new pair the author forgot to classify, and this
    // catches one raised through a path the inventory does not list. Refusing is
    // the safe direction — the room fails and somebody reads the list.
    if (!DECLARABLE_PAIRS.has(`${f.gate}|${f.kind}`)) return false;
    for (const d of decls) {
      if (d.voided) continue; // one of a duplicate pair — see the message above
      if (d.gate !== f.gate) continue;
      if (d.kind && d.kind !== f.kind) continue;
      if (d.tiles.size) {
        // a tiled declaration speaks for tiles, and only for the ones it lists
        if (f.tiles.length && f.tiles.every((t) => d.tiles.has(t))) return true;
        continue;
      }
      // tile-less: only a declaration that names the class can own it, and only
      // as many violations of it as the declaration's budget pays for
      if (d.kind === f.kind) {
        if (d.used >= d.budget) continue;
        d.used++;
        return true;
      }
    }
    return false;
  };
  return { decls, inadmissible, excused };
}

export function checkRoom(plan, terrain, objects, fleet = null) {
  const s = plan.structures || {};
  /** @type {{gate:string,kind:string,msg:string,tiles:string[]}[]} */
  const raw = [];
  /**
   * gate  the shortfall channel this violation belongs to.
   * kind  the violation CLASS inside that channel. One gate carries several
   *       unrelated failures — "extensions" is the home of the 60-count, the
   *       diagonal-only face and the off-road face — and a declaration that
   *       honestly owns one of them must not launder the other two. Tile-less
   *       classes are excusable ONLY by a declaration that names the kind.
   * tiles optional tile keys — a declaration that lists tiles excuses exactly
   *       those tiles and nothing else.
   */
  const fail = (gate, kind, msg, tiles = []) => raw.push({ gate: normGate(gate), kind, msg, tiles });
  const sitter = plan.sitter || plan.hub;
  const room = plan.room;
  if (!sitter || typeof sitter.x !== "number" || typeof sitter.y !== "number") {
    // Every flood in this file is seeded from the sitter. Without one there is
    // nothing to validate, and pretending otherwise would report a clean room.
    return {
      fails: ["no sitter/hub tile in plan — nothing to validate from"],
      notes: [],
      declared: 0,
      diagOnly: 0,
      extNoRoad: 0,
      roads: (s.road || []).length,
      leaks: 0,
      stranded: 0,
      stack: 0,
      onObject: 0,
      shallow: 0,
      shallowTowers: 0,
      engineReject: 0,
      orphanRoads: 0,
      ctrlSeatBlocked: 0,
      ctrlSeatUnreachable: 0,
      mineralSeatSealed: 0,
      ctrlParksShort: 0,
      ctrlParksStale: 0,
    };
  }

  const sources = (objects || []).filter((o) => o.type === "source");
  const controller = (objects || []).find((o) => o.type === "controller");
  const mineral = (objects || []).find((o) => o.type === "mineral");
  const objectTiles = new Set([
    ...sources.map((o) => key(o.x, o.y)),
    ...(controller ? [key(controller.x, controller.y)] : []),
    ...(mineral ? [key(mineral.x, mineral.y)] : []),
  ]);

  // ------------------------------------------------------------------
  // COUNT — exact program, RCL8 caps, explicit absences
  // ------------------------------------------------------------------
  for (const [type, want] of Object.entries(REQUIRED)) {
    const got = (s[type] || []).length;
    if (got === want) continue;
    if (type === "extension" && got < want && EXT_SHORTFALL_OK.has(room)) continue;
    fail(type, "count", `${type} ${got}!=${want}`);
  }
  // LINKS — a REQUIRED count, not a cap. hub + one per source + controller.
  const wantLinks = MIN_LINKS;
  const gotLinks = (s.link || []).length;
  if (gotLinks < wantLinks) fail("links", "count", `link ${gotLinks}<${wantLinks}`);
  // CONTAINERS — what the planner promises: one seat per source (layer-hub
  // claimSourceWorks), the pre-RCL7 upgrader bin (claimControllerContainer)
  // and, when the room has a mineral, the miner seat (layer-misc).
  const wantContainers = sources.length + 1 + (mineral ? 1 : 0);
  const gotContainers = (s.container || []).length;
  if (gotContainers < wantContainers) {
    fail("containers", "count", `container ${gotContainers}<${wantContainers}`);
  }
  if (mineral) {
    const ex = s.extractor || [];
    if (ex.length !== 1) fail("extractor", "count", `extractor ${ex.length}!=1`);
    else if (ex[0].x !== mineral.x || ex[0].y !== mineral.y) {
      fail(
        "extractor",
        "placement",
        `extractor@${ex[0].x},${ex[0].y} not on mineral ${mineral.x},${mineral.y}`,
      );
    }
  } else if ((s.extractor || []).length) {
    fail("extractor", "count", `extractor without a mineral`);
  }
  for (const [type, arr] of Object.entries(s)) {
    if (!Array.isArray(arr)) continue;
    const cap = RCL8_CAP[type];
    if (cap === undefined) {
      if (arr.length) fail("count", "unknown-type", `unknown type ${type} x${arr.length}`);
      continue;
    }
    if (arr.length > cap) fail("count", "over-cap", `${type} ${arr.length}>cap${cap}`);
  }
  for (const type of FORBIDDEN) {
    const n = (s[type] || []).length;
    if (n) fail("count", "forbidden", `${type} present x${n} (must be absent)`);
  }

  // ------------------------------------------------------------------
  // LABS — geometry, not just a count. Every lab must be within range 2 of
  // BOTH input labs or it can never run a reaction (LAB_REACTION_RANGE=2).
  // ------------------------------------------------------------------
  const labs = s.lab || [];
  const labInputs = plan.labInputs || [];
  const labFails = [];
  if (labs.length !== 10) labFails.push(`lab ${labs.length}!=10`);
  if (labInputs.length !== 2) labFails.push(`labInputs ${labInputs.length}!=2`);
  else {
    const labSet = new Set(labs.map((l) => key(l.x, l.y)));
    for (const li of labInputs) {
      if (!labSet.has(key(li.x, li.y))) labFails.push(`labInput@${li.x},${li.y} is not a lab`);
    }
    if (key(labInputs[0].x, labInputs[0].y) === key(labInputs[1].x, labInputs[1].y)) {
      labFails.push(`labInputs are the same tile`);
    }
    let outOfReach = 0;
    for (const l of labs) {
      if (labInputs.some((li) => li.x === l.x && li.y === l.y)) continue;
      if (labInputs.every((li) => chebyshev(l, li) <= 2)) continue;
      outOfReach++;
    }
    if (outOfReach) labFails.push(`labs out of reagent range x${outOfReach}`);
  }
  for (const m of labFails) fail("labs", "geometry", m);

  // ------------------------------------------------------------------
  // STACK / BOUNDS / OBJECT — one pass over every planned tile
  // ------------------------------------------------------------------
  const tiles = new Map(); // "x,y" -> [type, ...]
  for (const [type, arr] of Object.entries(s)) {
    if (!Array.isArray(arr)) continue;
    for (const p of arr) {
      const k = key(p.x, p.y);
      if (!tiles.has(k)) tiles.set(k, []);
      tiles.get(k).push(type);
    }
  }
  const stack = [];
  const onObject = [];
  const outOfBounds = [];
  const onWall = [];
  const engineReject = [];
  for (const [k, types] of tiles) {
    const [x, y] = k.split(",").map(Number);
    // duplicates of a type on one tile
    const uniq = new Set(types);
    if (uniq.size !== types.length) stack.push(`dup@${k}`);
    const solids = types.filter((t) => t !== "rampart" && t !== "road");
    if (new Set(solids).size > 1) stack.push(`${solids.join("+")}@${k}`);
    if (types.includes("road")) {
      const bad = solids.filter((t) => t !== "container");
      if (bad.length) stack.push(`road+${bad.join("+")}@${k}`);
    }
    // objects: only the extractor may share a tile with one (the mineral)
    if (objectTiles.has(k)) {
      const illegal = types.filter((t) => t !== "extractor" && t !== "rampart");
      if (illegal.length) onObject.push(`${illegal.join("+")}@${k}`);
    }
    if (x <= 0 || x >= 49 || y <= 0 || y >= 49) outOfBounds.push(`${types.join("+")}@${k}`);
    if (isWall(terrain, x, y)) {
      const bad = types.filter((t) => t !== "road" && t !== "extractor");
      if (bad.length) onWall.push(`${bad.join("+")}@${k}`);
    }
    // ENGINE — the terrain-side createConstructionSite test, per structure
    // type on the tile. The extractor is exempt from the wall rule but NOT
    // from the border rule (utils.js checks borderTiles before the extractor
    // early-return), and it is only legal at all on the mineral.
    for (const t of types) {
      if (!engineBuildable(terrain, x, y, t)) engineReject.push(`${t}@${k}`);
      if (t === "extractor" && !objectTiles.has(k)) engineReject.push(`extractor-off-mineral@${k}`);
    }
  }
  if (stack.length) fail("stack", "stack", `stack x${stack.length} (${stack.slice(0, 3).join(" ")})`);
  if (onObject.length) {
    fail("object", "on-object", `on-object x${onObject.length} (${onObject.slice(0, 3).join(" ")})`);
  }
  if (outOfBounds.length) {
    fail("bounds", "edge", `edge x${outOfBounds.length} (${outOfBounds.slice(0, 3).join(" ")})`);
  }
  if (onWall.length) fail("engine", "on-wall", `on-wall x${onWall.length} (${onWall.slice(0, 3).join(" ")})`);
  if (engineReject.length) {
    fail(
      "engine",
      "engine-reject",
      `engine-reject x${engineReject.length} (${engineReject.slice(0, 3).join(" ")})`,
      engineReject.map((e) => e.split("@")[1]),
    );
  }

  // ------------------------------------------------------------------
  // LEAK + DEPTH
  // ------------------------------------------------------------------
  // Only structures the ENGINE would accept exist in the real room, so only
  // those may block or conduct here. A rampart on a code-3 tile is not a
  // wall — it is a construction site that returns ERR_INVALID_TARGET — and
  // flooding as if it were there is precisely how seven rooms shipped an open
  // core that every terrain-only check called sealed.
  const rampartSet = new Set(
    (s.rampart || []).filter((r) => engineBuildable(terrain, r.x, r.y, "rampart")).map((r) => key(r.x, r.y)),
  );
  const roadSet = new Set(
    (s.road || []).filter((r) => engineBuildable(terrain, r.x, r.y, "road")).map((r) => key(r.x, r.y)),
  );
  const passable = passableFn(terrain, roadSet);
  const ext = exteriorFlood(passable, rampartSet);
  const depth = depthFromExterior(ext);
  const leaks = [];

  // ------------------------------------------------------------------
  // SITTER TRUST — the tile everything else is measured from.
  //
  // The exterior flood is seeded at the exits, but the OPEN CORE test, the
  // interior walk component and the whole road network are seeded HERE. A
  // sitter on a natural wall, or one dropped in a sealed pocket, does not
  // make those tests fail — it makes them measure a different room than the
  // one the plan describes, and every downstream gate then passes for the
  // wrong reason. So the sitter is checked before it is trusted: walkable
  // terrain, D8-adjacent to storage (the filler stands here to serve the hub
  // trio), on a road tile (the network is one component THROUGH it), and with
  // somewhere to step. Gate "core" — undeclarable, like every trust gate.
  // ------------------------------------------------------------------
  const sitterKey = key(sitter.x, sitter.y);
  if (sitter.x < 1 || sitter.x > 48 || sitter.y < 1 || sitter.y > 48) {
    fail("core", "sitter", `SITTER ${sitter.x},${sitter.y} is on the exit band`);
  }
  if (isWall(terrain, sitter.x, sitter.y)) {
    fail("core", "sitter", `SITTER ${sitter.x},${sitter.y} is on natural wall — nothing stands there`);
  }
  const storageTile = (s.storage || [])[0];
  if (!storageTile) {
    fail("core", "sitter", `SITTER ${sitter.x},${sitter.y} has no storage to sit beside`);
  } else if (chebyshev(sitter, storageTile) > 1) {
    fail(
      "core",
      "sitter",
      `SITTER ${sitter.x},${sitter.y} is not D8-adjacent to storage ` +
        `${storageTile.x},${storageTile.y} (range ${chebyshev(sitter, storageTile)})`,
    );
  }
  // ...AND THE OTHER TWO THIRDS OF THE HUB TRIO.
  //
  // The storage check above stood alone, and a reviewer walked straight through
  // the gap twice: move the TERMINAL off the sitter ring, validator exits 0; move
  // the HUB LINK off it, validator exits 0. The comment three lines up already
  // said what the sitter is for — "the filler stands here to serve the hub trio" —
  // and one third of the trio was the only third anything checked.
  //
  // The trio is a trio because ONE creep standing on ONE tile serves all three in
  // a tick: transfer is range 1, so a terminal at range 2 costs the filler a step
  // in and a step back out of the hub on every terminal move, forever, and a hub
  // link at range 2 does the same to every link send. That is not a shortfall the
  // room was beaten into, it is a hub that is not a hub — and every downstream
  // number in this file that is measured FROM the sitter (the road component, the
  // tower refill walk, the interior walk field) is measured from a tile that no
  // longer does the job it was chosen for.
  //
  // Re-derived, not read: the terminal is `structures.terminal[0]` (the count gate
  // above already pins the room to exactly one) and the hub link is
  // `structures.link[0]` by producer convention (layer-hub.mjs:1282,
  // `const hubLink = structures.link[0];`) — there is no meta.hubLink to trust or
  // distrust. Measured across the fleet: sitter-to-terminal and sitter-to-link[0]
  // are BOTH chebyshev 1 in all 172 shipped rooms, so this costs the fleet
  // nothing and bites the moment either one drifts.
  //
  // Gate "core", and "core" is in UNDECLARABLE — so these are permanent hard
  // fails with no declaration path at all. That is deliberate and it is the same
  // rule the storage check has always had: this is a TRUST gate. Every other
  // check in this file measures from the sitter on the assumption that the sitter
  // is the hub's service tile; a room allowed to declare its way out of that
  // assumption would not be shipping a declared shortfall, it would be shipping
  // 40 checks that silently measure a different room.
  const terminalTile = (s.terminal || [])[0];
  if (!terminalTile) {
    fail("core", "sitter", `SITTER ${sitter.x},${sitter.y} has no terminal to sit beside`);
  } else if (chebyshev(sitter, terminalTile) > 1) {
    fail(
      "core",
      "sitter",
      `SITTER ${sitter.x},${sitter.y} is not D8-adjacent to terminal ` +
        `${terminalTile.x},${terminalTile.y} (range ${chebyshev(sitter, terminalTile)}) — the filler ` +
        `cannot serve the hub trio from one tile, so it steps out of the hub on every terminal move`,
    );
  }
  const hubLinkTile = (s.link || [])[0];
  if (!hubLinkTile) {
    fail("core", "sitter", `SITTER ${sitter.x},${sitter.y} has no hub link to sit beside`);
  } else if (chebyshev(sitter, hubLinkTile) > 1) {
    fail(
      "core",
      "sitter",
      `SITTER ${sitter.x},${sitter.y} is not D8-adjacent to the hub link ` +
        `${hubLinkTile.x},${hubLinkTile.y} (range ${chebyshev(sitter, hubLinkTile)}; the hub link is ` +
        `structures.link[0] by producer convention, layer-hub.mjs:1282) — every link send now costs ` +
        `the filler a step out of the hub and a step back`,
    );
  }
  if (!roadSet.has(sitterKey)) {
    fail("core", "sitter", `SITTER ${sitter.x},${sitter.y} is not a road tile`);
  }
  // OPEN CORE — is there a walk path from any exit to the sitter? The
  // exterior flood already answers it (ramparts block, roads tunnel), so a
  // sitter that came out exterior means the enclosure has a hole.
  if (ext[idx(sitter.x, sitter.y)]) {
    fail("core", "open-core", `OPEN CORE — sitter ${sitter.x},${sitter.y} is in the exterior flood`);
  }
  const mineralSeat = new Set(
    mineral
      ? (s.container || [])
          .filter((c) => Math.max(Math.abs(c.x - mineral.x), Math.abs(c.y - mineral.y)) <= 1)
          .map((c) => key(c.x, c.y))
      : [],
  );
  // ...and the tiles a {gate:"misc", kind:"off-network"} declaration names. Read
  // off the RAW list on purpose: this is not an excuse for a violation, it is the
  // plan telling the checker which class of structure it is claiming an
  // enumerated exception for, and the arbitration below polices the excuses.
  const mineralOffNetworkDeclared = new Set();
  for (const sf of (plan.meta && plan.meta.shortfalls) || []) {
    if (!sf || sf.gate !== "misc" || sf.kind !== "off-network") continue;
    for (const t of sf.tiles || []) {
      if (t && Number.isInteger(t.x) && Number.isInteger(t.y)) mineralOffNetworkDeclared.add(key(t.x, t.y));
    }
  }
  for (const t of OWNED) {
    for (const p of s[t] || []) if (ext[idx(p.x, p.y)]) leaks.push(`${t}@${p.x},${p.y}`);
  }
  if (leaks.length) {
    fail(
      "rampart",
      "leak",
      `leak x${leaks.length} (${leaks.slice(0, 3).join(" ")})`,
      leaks.map((l) => l.split("@")[1]),
    );
  }

  const shallow = [];
  for (const t of NEEDS_DEPTH) {
    for (const p of s[t] || []) {
      const k = key(p.x, p.y);
      if (rampartSet.has(k)) continue; // personally covered
      if (depth[idx(p.x, p.y)] >= DEPTH_SAFE) continue;
      shallow.push(`${t}@${p.x},${p.y}d${depth[idx(p.x, p.y)]}`);
    }
  }
  if (shallow.length) {
    fail(
      "rampart",
      "shallow",
      `shallow x${shallow.length} (${shallow.slice(0, 3).join(" ")})`,
      shallow.map((l) => l.split("@")[1].replace(/d\d+$/, "")),
    );
  }

  // TOWERS — depth >= 4, NO rampart exemption. A rampart over a tower does
  // not make the tower unreachable, it makes it a rampart with a tower under
  // it: the ranged attacker still parks at range 3 and grinds. The whole
  // point of a tower is that nothing can stand where it can be shot.
  const shallowTowers = [];
  for (const p of s.tower || []) {
    const d = depth[idx(p.x, p.y)];
    if (d >= DEPTH_SAFE) continue;
    shallowTowers.push(`tower@${p.x},${p.y}d${d}`);
  }
  if (shallowTowers.length) {
    // deliberately TILE-LESS: "some of my towers are shallow" is a class, and
    // the only declaration allowed to own it is one that says so by name
    // (kind "shallow-tower"). A towers declaration carrying tiles — a far lobe
    // no tower can cover, say — excuses nothing here.
    fail(
      "towers",
      "shallow-tower",
      `shallow towers x${shallowTowers.length} (${shallowTowers.slice(0, 3).join(" ")})`,
    );
  }

  // ------------------------------------------------------------------
  // D4 (extensions)
  // ------------------------------------------------------------------
  const blocked = new Set(objectTiles);
  for (const t of BLOCKING) for (const p of s[t] || []) blocked.add(key(p.x, p.y));
  const interior = interiorComponent(passable, ext, blocked, sitter);
  let diagOnly = 0;
  let noFace = 0;
  for (const e of s.extension || []) {
    const d4 = D4.some(([dx, dy]) => {
      const x = e.x + dx,
        y = e.y + dy;
      return x >= 0 && y >= 0 && x <= 49 && y <= 49 && interior[idx(x, y)];
    });
    if (d4) continue;
    const d8 = D8.some(([dx, dy]) => {
      const x = e.x + dx,
        y = e.y + dy;
      return x >= 0 && y >= 0 && x <= 49 && y <= 49 && interior[idx(x, y)];
    });
    if (d8) diagOnly++;
    else noFace++;
  }
  if (diagOnly) fail("extensions", "diag-only", `ext diag-only x${diagOnly}`);
  if (noFace) fail("extensions", "unreachable", `ext unreachable x${noFace}`);

  // ------------------------------------------------------------------
  // EXT-ROAD — owner: extensions must be EASILY accessible, not merely
  // reachable. A filler that has to leave the road to service an extension
  // pays 2 ticks/tile on plain, every refill, forever. Hard fail.
  // ------------------------------------------------------------------
  let extNoRoad = 0;
  for (const e of s.extension || []) {
    if (D4.some(([dx, dy]) => roadSet.has(key(e.x + dx, e.y + dy)))) continue;
    extNoRoad++;
  }
  if (extNoRoad) fail("extensions", "off-road", `ext off-road x${extNoRoad}`);

  // ------------------------------------------------------------------
  // ROAD — one live component, everything on it
  // ------------------------------------------------------------------
  const comp = roadComponent(s, sitter, blocked);
  const orphanRoads = (s.road || []).filter((r) => !comp.has(key(r.x, r.y)));
  if (orphanRoads.length) {
    fail(
      "road",
      "orphan-road",
      `road orphans x${orphanRoads.length} (${orphanRoads
        .slice(0, 3)
        .map((r) => `${r.x},${r.y}`)
        .join(" ")})`,
    );
  }
  const stranded = [];
  for (const t of OWNED) {
    for (const p of s[t] || []) {
      const k = key(p.x, p.y);
      // ------------------------------------------------------------------
      // THE MINERAL SEAT'S EXEMPTION IS THE PLAN'S TO CLAIM, NOT THIS FILE'S
      // TO GRANT.
      //
      // This used to be an unconditional `continue` with a comment ("m11: the
      // mineral seat is deliberately off-network (no road by design)") and no
      // plan in the fleet declared anything of the kind — 133 rooms shipped an
      // undeclared exception to a hard gate, excused by one line of the
      // checker's own source. The decision is right and it is the PLAN's
      // decision, so the plan now files {gate:"misc", kind:"off-network"} naming
      // the seat tile (see remeasureMineralNetwork in pipeline.mjs) and this
      // exemption reads it. A room that ships an off-network mineral seat in
      // silence now fails the road gate like anything else.
      // ------------------------------------------------------------------
      // A declared seat is exempt. An UNDECLARED one is held to the same rule as
      // every other structure below — most mineral seats do end up touching a
      // corridor another layer laid, and those need no declaration at all.
      if (t === "container" && mineralSeat.has(k) && mineralOffNetworkDeclared.has(k)) continue;
      if (comp.has(k)) continue; // containers ARE network nodes
      const touch = D8.some(([dx, dy]) => comp.has(key(p.x + dx, p.y + dy)));
      if (!touch) {
        stranded.push(
          `${t}@${p.x},${p.y}` +
            (t === "container" && mineralSeat.has(k) ? " (mineral seat, UNDECLARED)" : ""),
        );
      }
    }
  }
  if (stranded.length) {
    fail("road", "off-network", `no-road x${stranded.length} (${stranded.slice(0, 3).join(" ")})`);
  }

  // ------------------------------------------------------------------
  // DECLARED-SHORTFALL ARBITRATION
  //
  // THE HOLE THIS REPLACES. The old rule collapsed every declaration on a
  // gate into one bucket and then let a TILED declaration excuse a TILE-LESS
  // violation on the same gate ("e.any || e.tiles.size > 0"). Injecting
  // 59 extensions into a room that already declares an extension TILE for an
  // unrelated reason therefore validated clean: the count violation carries
  // no tiles, the bucket had tiles, and the arbitration called it declared.
  // Same shape one gate over: an honest "only 57 extensions fit" excused
  // diagonal-only and off-road extensions, which are not a shortfall at all —
  // they are a maze.
  //
  // THE RULE NOW. Each declaration is arbitrated on its own, never merged,
  // and it has to match the violation on the axis it actually claims:
  //
  //   gate   always. A declaration for another channel excuses nothing.
  //   kind   when the declaration names one, it must be the violation's
  //          class. A declaration is allowed to be broad (no kind) about
  //          TILES it lists, never about a class it never mentioned.
  //   tiles  a declaration that lists tiles excuses violations whose tiles
  //          are ALL inside that list — and nothing else. In particular it
  //          can never excuse a tile-less violation, because "these two
  //          tiles beat me" is not a statement about a count or a class.
  //   class  a tile-less declaration is a claim about a whole class, so it
  //          must NAME that class: gate + kind. There is no wildcard, and
  //          silence is not a declaration.
  //   budget a tile-less declaration excuses a BOUNDED number of violations of
  //          the class it names — see the block below. It is not a licence for
  //          the class.
  //   evidence the entry must carry some. A declaration with no evidence is
  //          INADMISSIBLE: it is dropped before arbitration (so it excuses
  //          nothing at all) AND its presence is itself a hard fail for the
  //          room, naming the gate it tried to speak for. See
  //          admitDeclaration() above for what counts as evidence.
  //
  // Backwards compatible by construction: every declaration the planner
  // ships today carries tiles and is arbitrated against tiled violations.
  //
  // THE TILE-LESS BUDGET. "gate + kind names the class" bounded WHICH class a
  // tile-less declaration could speak for and said nothing about HOW MUCH of it
  // — one entry owned every violation of that class, forever, no matter how many
  // were raised or where. That is a wildcard with a label on it: a room that
  // honestly lost one extension to terrain would, written tile-lessly, excuse
  // fifty. So a tile-less declaration now carries a BUDGET and spends it.
  //
  // N = the declaration's own `count` when it states one (a finite, non-negative
  // number: the producer saying "I lost three of these" is exactly the quantified
  // claim this whole section is trying to elicit, and it should be believed for
  // three and no more). Otherwise N = 1 — the conservative reading of an
  // unquantified claim, and the reading that matches what the planner actually
  // ships, since every gate in this file raises at most one violation per
  // (gate, kind) today. Spent in the order violations were RAISED, which is the
  // order of `raw` followed by the late() checks: deterministic, so two runs
  // excuse the same violations and the 160th room does not depend on iteration
  // order somewhere else.
  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // SCHEMA PRESENCE — see REQUIRED_META. Absence is a hard fail, and it is
  // raised OUTSIDE the declaration channel on purpose: a room that has not
  // published the field a gate reads has not passed that gate, and there is no
  // note that makes a missing key into a measured one.
  // ------------------------------------------------------------------
  const schemaFails = [];
  {
    const read = (p) => p.split(".").reduce((a, k) => (a === null || a === undefined ? undefined : a[k]), plan);
    // the redundant-cut record is only owed by a room whose cut is a superset of
    // its seal-critical set — which, today, is all of them, and the `when` is
    // here so the rule stays true rather than lucky
    const cutArr = read("meta.shell.cut");
    for (const req of REQUIRED_META) {
      if (req.when && !req.when(plan)) continue;
      if (req.path === "meta.shell.redundantCut" && !(Array.isArray(cutArr) && cutArr.length)) continue;
      const v = read(req.path);
      if (req.is(v)) continue;
      schemaFails.push(
        `SCHEMA — \`${req.path}\` is ${v === undefined ? "ABSENT" : `present but the wrong shape (${JSON.stringify(v).slice(0, 90)})`}. ` +
          `It is required because ${req.why}. Every audit that reads this key is written \`plan.meta?.x?.y || []\` ` +
          `so it cannot throw on a malformed plan, which means an absent key reads exactly like a passing ` +
          `check — deleting one key was demonstrated switching off six gates at once. A field a gate ` +
          `depends on is mandatory, and its absence is a failure, not a bypass.`,
      );
    }
  }

  const declared = (plan.meta && plan.meta.shortfalls) || [];
  const { decls, inadmissible, excused } = buildArbitration(declared);
  // An inadmissible declaration is a HARD FAIL in its own right — it cannot be
  // excused (there is nothing to excuse it with) and it never reaches excused().
  const fails = [...schemaFails, ...inadmissible];
  const notes = [];
  for (const f of raw) (excused(f) ? notes : fails).push(f.msg);
  // meta.notes — the planner's own observations channel. A NOTE is not a
  // shortfall: it is a fact about the room that nothing failed on and that a
  // reviewer should not have to re-derive (how much interior floor the finished
  // base sealed off from itself, for instance). Shortfalls excuse violations;
  // notes excuse nothing and are printed regardless.
  for (const n of plan.meta?.notes || []) if (typeof n === "string") notes.push(n);
  /**
   * A violation raised AFTER `raw` has been drained. Everything above this line
   * is collected into `raw` and sorted into fails/notes in one pass; a check
   * that needs data computed later (the seal cross-check needs the interior
   * component; the ring check needs the controller) still has to go through the
   * same declaration arbitration, or it would either be undeclarable or — worse
   * — be pushed onto `raw` where nothing would ever read it again.
   */
  const late = (gate, kind, msg, tiles = []) => {
    const f = { gate: normGate(gate), kind, msg, tiles };
    (excused(f) ? notes : fails).push(msg);
  };

  // ------------------------------------------------------------------
  // THE NETWORK WITHOUT THE CONTAINER THAT IS NOT BUILT YET.
  //
  // "Containers ARE network nodes" is true at RCL8 and false at RCL3. The bot's
  // own `plannedTilesFor` defers the extractor-adjacent container to RCL6 — no
  // extractor exists before then, so a box beside the mineral is a box nothing
  // fills — and two rooms shipped a road network whose ONLY join ran through
  // that tile. E5S1's controller container (an eco terminal, built at RCL2) and
  // the three roads serving it were orphans from RCL3 to RCL5; E5S3's whole
  // north-east extension pocket was, from RCL4.
  //
  // Nothing caught it because the audit that was supposed to — `stagedOrphans`
  // in push-plan.mjs, and `auditRoadPrefix` in the bot itself — built its
  // conduct set from the SAME unfiltered container array. An audit sharing its
  // graph with the pass it audits reports zero by construction. So the check
  // lives here too, in the file whose whole job is to not believe the producer,
  // and it is re-derived from terrain and the shipped structure lists.
  //
  // The rule: with the deferred container removed, every road and every other
  // container must still be one component from the sitter. A room that cannot
  // pave the join — because the only tile that would close it carries an
  // OBSTACLE structure or is natural wall — may publish it as a PAVING GAP, and
  // the gap tile is then held to being exactly that. A named gap is a fact; an
  // unnamed one is the silence this whole round is about; and a gap named over a
  // tile a road could simply be built on is worse than either, because it is a
  // missing road wearing a terrain verdict. See the clause below for the round-13
  // correction: "one structure per tile" is NOT the engine's rule, container and
  // road share a tile, and both published gaps were paveable floor.
  // ------------------------------------------------------------------
  {
    const containers = s.container || [];
    const exTile = (s.extractor || [])[0] || null;
    const deferred = new Set(
      exTile ? containers.filter((c) => chebyshev(c, exTile) <= 1).map((c) => key(c.x, c.y)) : [],
    );
    if (deferred.size && (s.road || []).length) {
      const conduct = new Set((s.road || []).map((r) => key(r.x, r.y)));
      for (const c of containers) if (!deferred.has(key(c.x, c.y))) conduct.add(key(c.x, c.y));
      const gapPub = (plan.meta?.walls?.conductBridge?.gapTiles || []).filter(
        (t) => t && Number.isInteger(t.x) && Number.isInteger(t.y),
      );
      const obstacles = new Set(objectTiles);
      for (const t of BLOCKING) for (const p of s[t] || []) obstacles.add(key(p.x, p.y));
      // ...AND A GAP HAS TO BE UNPAVEABLE, OR IT IS NOT A GAP, IT IS A CHOICE.
      //
      // THE RULE THIS CLAUSE USED TO STATE WAS FALSE, AND IT WAS FALSE IN THIS
      // FILE'S OWN WORDS. It said "the engine allows one structure per tile
      // (ramparts aside), so a tile is unpaveable exactly when something else is
      // already standing on it" — and forty lines up, at the stack gate, the same
      // file writes `const bad = solids.filter((t) => t !== "container")`,
      // i.e. ROAD AND CONTAINER LEGALLY SHARE A TILE. They share one in 60 tiles
      // across 53 shipped rooms. push-plan.mjs says the same thing. So both
      // published "gaps" — E2S5 27,23 (container + rampart) and E5S3 32,11 (the
      // mineral container) — were ordinary floor a road closes, and the exemption
      // was laundering two roads the producer declined to lay as a terrain
      // verdict. Between them they stranded 16 conductors before RCL 6.
      //
      // THE TRUE RULE, re-derived rather than asserted: a road may not be built
      // on a tile that carries an OBSTACLE structure (OBSTACLE_OBJECT_TYPES —
      // `BLOCKING` here, plus the room objects) or on natural wall. Everything
      // else is paveable, container included. A gap tile that is not one of those
      // two things is a road the room chose not to lay.
      //
      // The clause is KEPT rather than deleted, because the honest case exists:
      // a join whose only tile carries a spawn, a lab or a source really is
      // unpaveable, and a room in that position must be able to say so. What it
      // may no longer do is say so about bare floor or about a container.
      const gapBad = [];
      for (const t of gapPub) {
        const tk = key(t.x, t.y);
        if (!passable(t.x, t.y)) gapBad.push(`${t.x},${t.y} is natural wall`);
        else if (roadSet.has(tk)) {
          gapBad.push(`${t.x},${t.y} already carries a road, so it is not a gap in anything`);
        } else if (!obstacles.has(tk)) {
          // `obstacles` is objectTiles + BLOCKING — the engine's obstacle set.
          // A container is not in it, and that is the whole correction.
          const carried = Object.keys(s).filter(
            (ty) => ty !== "road" && (s[ty] || []).some((p) => p.x === t.x && p.y === t.y),
          );
          gapBad.push(
            `${t.x},${t.y} carries ${carried.length ? carried.join("+") : "nothing"} and NO obstacle — ` +
              `a road can be built there (road and container legally share a tile; this file's own stack ` +
              `gate exempts exactly that pair, and 60 tiles in 53 rooms ship it), so this is a join the ` +
              `room declined to pave, not one it cannot`,
          );
        } else conduct.add(tk);
      }
      const flood = (start) => {
        const seen = new Set([start]);
        const q = [start];
        for (let qi = 0; qi < q.length; qi++) {
          const [x, y] = q[qi].split(",").map(Number);
          for (const [dx, dy] of D8) {
            const nk = key(x + dx, y + dy);
            if (seen.has(nk) || !conduct.has(nk)) continue;
            seen.add(nk);
            q.push(nk);
          }
        }
        return seen;
      };
      const seed = key(sitter.x, sitter.y);
      const seen = conduct.has(seed) ? flood(seed) : new Set();
      const broken = [...conduct].filter((k) => !seen.has(k));
      if (gapBad.length) {
        fails.push(
          `PAVING GAP UNVERIFIABLE — meta.walls.conductBridge.gapTiles names ${gapBad.join("; ")}. A gap ` +
            `tile is a claim that a creep walks it without a road; a tile a creep cannot stand on closes ` +
            `nothing, and the claim is what the whole exemption rests on.`,
        );
      }
      if (broken.length) {
        fails.push(
          `RCL-DEFERRED CONDUCT — with the mineral-seat container removed (it is not built until RCL 6), ` +
            `${broken.length} of this room's conductors are not reachable from the sitter: ` +
            `${broken.slice(0, 8).join(" ")}${broken.length > 8 ? " …" : ""}. Containers are network nodes ` +
            `at RCL 8 and not at RCL 3, so this network is one component only for the last two RCLs of ` +
            `the room's life. Either the join is paved or the gap is published in ` +
            `meta.walls.conductBridge.gapTiles and is a tile a creep can actually walk; neither is true ` +
            `here. This gate exists because the two audits that were supposed to catch it built their ` +
            `conduct set from the same unfiltered container array they were auditing.`,
        );
      }
    }
  }

  // ------------------------------------------------------------------
  // A BATTERY THAT IS MERELY LEGAL HAS TO SAY SO.
  //
  // Everything above this line is re-derived from terrain and geometry, on the
  // principle that the validator never trusts the planner's own meta. This check
  // deliberately does trust it, and the trust runs the SAFE way: it reads the
  // planner's own tower numbers and fails the room when they are poor and the
  // plan said nothing. A planner that lied about its damage would not be caught
  // here — but a planner that measured 1440 on its weakest wall face, the worst
  // in the fleet, and shipped it in silence is exactly what this catches, and
  // that is what actually happened (E8S5).
  //
  // Not routed through `fail()`: gate "towers" is UNDECLARABLE for shallow
  // towers, so a violation raised on that gate could never be excused by
  // anything and the room would fail no matter what it declared. This is the
  // opposite shape — declaring is precisely how a room passes it.
  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // WHAT IS THE WALL? — the cross-check that catches a cut which has gone stale.
  //
  // Every shell metric in the plan is computed over meta.shell.cut: which tiles
  // the battlements cover, which the battery is scored against, which endpoints
  // the mobility lap is measured between, whether a link is on the wall. All of
  // that is worth exactly as much as `cut` being the wall — and in four rooms it
  // was not. Layer 7's inert prune deleted doubled wall whose job a neighbouring
  // BUBBLE then took over, so the shipped seal rested partly on tiles that were
  // never in `cut` and never scored (E11S10 hid a 1380-damage face and a link on
  // the seal behind a declared 2670; E1S8 hid a second link).
  //
  // The test is a mutation and it is re-derived here, from terrain and the
  // rampart list, with nothing read out of meta except the claim being checked:
  // DELETE ONE RAMPART, RE-FLOOD, and if the exterior now reaches the sitter
  // then that rampart is the wall and it must be in meta.shell.cut. The planner
  // now runs the same test in reverse (it adopts whatever it finds), so this is
  // the independent confirmation that the two agree.
  //
  // Cheap form, exact: deleting a single tile changes one tile's passability, so
  // any new sitter-to-exterior path must run through it — which happens exactly
  // when that tile touches the interior component on one side and the exterior
  // on the other. Two floods for the room, not one per rampart.
  const declaredCut = new Set(
    (plan.meta?.shell?.cut || []).map((c) => key(c.x, c.y)),
  );
  //
  // The garrison side has to be flooded WITHOUT the ramparts, which is not the
  // same region as `interior`: interiorComponent deliberately walks ONTO rampart
  // tiles (a defender stands on his own wall), and a rampart that merely touches
  // another rampart would then look like it touches the inside. Getting this
  // wrong is not a rounding error — it flagged 17 rooms whose seal is fine.
  const insideNoRampart = new Uint8Array(2500);
  {
    const si0 = idx(sitter.x, sitter.y);
    if (passable(sitter.x, sitter.y) && !rampartSet.has(sitterKey)) {
      insideNoRampart[si0] = 1;
      const q = [si0];
      for (let qi = 0; qi < q.length; qi++) {
        const i = q[qi],
          x = i % 50,
          y = (i / 50) | 0;
        for (const [dx, dy] of D8) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
          const ni = idx(nx, ny);
          if (insideNoRampart[ni] || !passable(nx, ny) || rampartSet.has(key(nx, ny))) continue;
          insideNoRampart[ni] = 1;
          q.push(ni);
        }
      }
    }
  }
  // THE SEAL IS DERIVED UNCONDITIONALLY, the comparison to meta is not.
  //
  // This loop used to sit inside `if (plan.meta?.shell?.cut)`, which was
  // harmless for the stale-cut check it was written for (with no declared cut
  // there is nothing to call stale) and quietly load-bearing for the battery
  // gate below, which scores the weakest SEALING tile and reads sealTiles to
  // find them. Guarding the derivation on a meta key means deleting that key
  // deletes the measurement: no seal tiles, nothing to score, gate skipped. The
  // derivation itself needs nothing from meta — terrain, the rampart list and
  // two floods — so it runs for every room, always, and only the comparison
  // against the plan's own claim is conditional on the plan making one.
  const sealTiles = [];
  for (const k of rampartSet) {
    const [rx, ry] = k.split(",").map(Number);
    if (!passable(rx, ry)) continue; // a rampart on rock opens nothing
    let touchIn = false;
    let touchOut = false;
    for (const [dx, dy] of D8) {
      const nx = rx + dx,
        ny = ry + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = idx(nx, ny);
      if (insideNoRampart[ni]) touchIn = true;
      else if (ext[ni]) touchOut = true;
      if (touchIn && touchOut) break;
    }
    if (touchIn && touchOut) sealTiles.push({ x: rx, y: ry, k });
  }
  if (plan.meta?.shell?.cut) {
    const stale = sealTiles.filter((t) => !declaredCut.has(t.k));
    if (stale.length) {
      // NOT via fail(): `raw` was drained into fails/notes above, so a late
      // fail() would be silently dropped. Routed through the same excused()
      // the drained ones used, so a declaration can still own it.
      late("shell", "stale-cut",
        `${stale.length} rampart(s) carry the seal but are NOT in meta.shell.cut ` +
          `(${stale.map((t) => t.k).join(" ")}) — removing any one of them alone lets the exterior ` +
          `reach the sitter, so every metric computed over the declared cut (battlements, weakest ` +
          `tower face, links on the wall, mobility endpoints) is measured on a wall this room does ` +
          `not have`,
        stale.map((t) => t.k),
      );
    }
    // ------------------------------------------------------------------
    // ...AND THE OTHER DIRECTION, WHICH NOTHING WAS ENFORCING.
    //
    // The `stale` filter above is cut ⊇ sealCritical: every rampart that carries
    // the seal has to appear in the declared cut. That is one of the two
    // containments the goal document asks for — "meta.shell.cut must BE the wall
    // ... the validator fails any room where the two disagree".
    //
    // WHAT "BE THE WALL" ACTUALLY MEANS HERE, STATED PRECISELY (round-11
    // correction). This comment used to say "BE is an equality, not a superset",
    // and then check only one direction — while the shipped fleet has 21 rooms
    // whose cut is a strict SUPERSET of the tiles that are singly seal-critical
    // (45 tiles; worst E9S2 at 21 declared against 14 sealing). Reading the two
    // together, the file asserted an equality it did not hold and did not test.
    //
    // The equality is the wrong bar and always was. Removal-criticality is a
    // SINGLE-tile test — delete one rampart, does the exterior reach the sitter
    // — and a wall with any doubled corner has tiles that are load-bearing only
    // as a pair, which no single-removal test can see. Demanding cut ==
    // sealCritical would fail exactly the rooms whose wall is thickest where the
    // terrain is thinnest.
    //
    // So the claim is a SUPERSET WITH PER-TILE JUSTIFICATION, and both halves
    // are enforced:
    //   ⊇  every singly seal-critical rampart is in the cut (the `stale` filter
    //      immediately above);
    //   and every EXTRA tile is a planned rampart the engine will build (the two
    //      filters below), and carries a named reason in the plan's own
    //      `redundantCut` record — layer 7 re-runs the single-removal test on
    //      the shipped board and writes, per tile, why the deletion was refused.
    //      A reader who wants to know why the cut is 21 and the seal is 14 gets
    //      fourteen sentences, not an assertion.
    // A reviewer padded E11S8's meta.shell.cut with ten
    // tiles that carry no rampart at all (2,2 through 15,2, every one of them in
    // the exterior flood, i.e. bare floor OUTSIDE the wall) and this validator
    // exited 0, because a phantom cut tile is a tile the `stale` filter never
    // looks at: it iterates the REAL ramparts and asks whether the cut mentions
    // them, so anything the cut mentions that is not a rampart is invisible to it.
    //
    // A padded cut is not cosmetic. Every shell metric in the plan is an average
    // or a minimum computed over these tiles — battlement coverage, the weakest
    // tower face, which endpoints the mobility lap runs between, links-on-the-wall
    // — and the battery gate 80 lines down scores exactly this list when no
    // rampart carries the seal. Ten bare floor tiles in the middle of the room
    // move all of those numbers, in the room's favour, for free.
    //
    // TWO CASES, REPORTED SEPARATELY, because `rampartSet` is ENGINE-FILTERED and
    // collapsing them would blame the producer for the wrong thing:
    //   cut-not-rampart      the cut names a tile with no planned rampart on it.
    //                        Nothing was ever going to stand there. This is a
    //                        fabricated wall tile.
    //   cut-rampart-rejected the cut names a tile that DOES carry a planned
    //                        rampart, but one createConstructionSite refuses
    //                        (code-3 terrain, the exit band, the border-adjacency
    //                        triple). The producer planned a wall; the server will
    //                        not build it. That is the `=== WALL` failure mode
    //                        this file already documents at the rampartSet
    //                        derivation, seen from the cut's side.
    // Both carry their tiles so a tiled declaration can arbitrate them, on gate
    // "shell" like the stale check — a room whose wall genuinely rests on a tile
    // the engine refuses should be able to say so with the tile in hand rather
    // than be failed for terrain.
    //
    // MEASURED ON THE CURRENT FLEET: 7275 cut tiles across 172 rooms (max 80 in
    // one room), and every single one of them is a planned rampart the engine
    // accepts. Both filters come back empty, so this check costs the shipped
    // fleet nothing and exists entirely to make the padding above impossible.
    //
    // REJECTED: re-deriving the cut and comparing set-for-set. It is the same
    // test written less usefully — sealCritical is already derived and already
    // compared one way, and a plain set difference would report "these tiles
    // differ" without separating a fabrication from an engine rejection, which
    // are two different bugs with two different fixes.
    const rampartPlanned = new Set((s.rampart || []).map((r) => key(r.x, r.y)));
    const phantomCut = [];
    const rejectedCut = [];
    for (const k of declaredCut) {
      if (!rampartPlanned.has(k)) phantomCut.push(k);
      else if (!rampartSet.has(k)) rejectedCut.push(k);
    }
    if (phantomCut.length) {
      late("shell", "cut-not-rampart",
        `${phantomCut.length} tile(s) in meta.shell.cut carry NO planned rampart at all ` +
          `(${phantomCut.slice(0, 8).join(" ")}${phantomCut.length > 8 ? " ..." : ""}) — the cut is ` +
          `supposed to BE the wall, and these tiles are not wall, they are not anything. Every shell ` +
          `metric computed over the cut (battlement coverage, weakest tower face, links on the seal, ` +
          `mobility endpoints) is averaged over tiles this room does not defend`,
        phantomCut,
      );
    }
    if (rejectedCut.length) {
      late("shell", "cut-rampart-rejected",
        `${rejectedCut.length} tile(s) in meta.shell.cut carry a planned rampart the ENGINE would ` +
          `refuse to build (${rejectedCut.slice(0, 8).join(" ")}${rejectedCut.length > 8 ? " ..." : ""}) ` +
          `— createConstructionSite returns ERR_INVALID_TARGET on natural wall (code 3 included), on ` +
          `the exit band, and on a non-road structure whose border triple is not solid rock. The plan ` +
          `counts these as wall; the server will never build them, so the shipped room's seal is ` +
          `whatever is left after they are struck out`,
        rejectedCut,
      );
    }
  }

  // ------------------------------------------------------------------
  // THE CONTROLLER'S RING — the check the round-5 regression walked straight
  // through, because nothing was looking.
  //
  // Goal document: "controller outside the wall: rampart ONLY its adjacent ring
  // (denies claim-attack stands) + link + container. Nothing wider." Every tile
  // a hostile creep can stand on to reach the controller is D8-adjacent to it,
  // so an un-ramparted one of those is a free seat for a claim or attack creep
  // and the ring has failed at the one job it has. Layer 7's inert-rampart prune
  // deleted 161 of them across 66 rooms and every gate in this file passed the
  // fleet, because the prune's own test only values a rampart for what it does
  // to a STRUCTURE and this ring defends a room OBJECT.
  //
  // Re-derived, never read out of meta: take the controller from `objects`, take
  // the exterior this validator flooded for itself, and ask whether an attacker
  // can stand next to the controller. A ring tile that is INSIDE the wall is not
  // a stand — nothing hostile can get to it — so the test is "walkable, no
  // rampart, and exterior", which is exactly the set an attacker can occupy.
  // Declarable on gate "shell": a border-band tile whose edge triple is not
  // natural wall can never carry a rampart (engine ERR_INVALID_TARGET), and a
  // room in that position must say so rather than be failed for terrain.
  // ------------------------------------------------------------------
  if (controller) {
    const openStands = [];
    for (const [dx, dy] of D8) {
      const x = controller.x + dx,
        y = controller.y + dy;
      if (x < 0 || y < 0 || x > 49 || y > 49) continue;
      if (isWall(terrain, x, y)) continue;
      const k = key(x, y);
      if (rampartSet.has(k)) continue;
      if (!ext[idx(x, y)]) continue; // inside the wall — no attacker reaches it
      openStands.push(k);
    }
    if (openStands.length) {
      late("shell", "ctrl-ring",
        `${openStands.length} walkable tile(s) D8-adjacent to the controller carry no rampart and are ` +
          `OUTSIDE the wall (${openStands.join(" ")}) — a hostile claim or attack creep can stand there ` +
          `and work the controller unopposed. The goal document's rule for a controller outside the ` +
          `shell is its adjacent ring, and this ring is open`,
        openStands,
      );
    }
  }

  // ------------------------------------------------------------------
  // THE CLAIM SEAT — can this room ever be re-claimed?
  //
  // Nine shipped rooms had built over EVERY walkable tile next to their own
  // controller. Not "over most of them" — over all of them, so there was no tile
  // in the room a creep could stand on and touch the controller (measured on the
  // fleet that motivated this gate; the producer has since moved the structures,
  // and the fleet reads 0 today):
  //
  //   E11S5  ctrl  8,11   one walkable neighbour, 7,12: OBSERVER
  //   E11S7  ctrl 27,6    one walkable neighbour, 26,5: extension
  //   E13S9  ctrl 10,27   9,26 / 9,27 / 9,28 all extensions
  //   E18S3  ctrl 14,44   one walkable neighbour, 15,43: extension
  //   E2S2   ctrl 27,36   26,35 / 27,35 / 28,35 all extensions
  //   E3S1   ctrl 14,37   one walkable neighbour, 15,38: extension
  //   E4S7   ctrl 33,39   34,38 and 32,38 both extensions
  //   E5S6   ctrl 31,36   30,37 / 31,37 / 32,37 all extensions
  //   E9S2   ctrl 25,24   24,23 ext, 24,24 ext, 25,23 OBSERVER
  //
  // WHY THIS IS FATAL AND NOT UNTIDY. claimController and signController are
  // RANGE 1 — the same range as upgradeController is 3. A room that downgrades to
  // unowned (a lost RCL8 room ticks down, and a room whose spawns die stops
  // paying the controller) can then never be re-claimed: the claimer has nowhere
  // to stand, and the only structure standing in the way is one we can no longer
  // build a creep to demolish, because there is no spawn until there is a
  // controller. The room becomes permanently dead ground holding our own base.
  // Five of the nine have exactly ONE walkable neighbour in the whole room, so
  // one extension is the entire difference between recoverable and not.
  //
  // Nothing else in this repo notices. meta has no field for it, the D4 gate asks
  // about EXTENSIONS having a face rather than the controller having one, and the
  // ctrl-ring check directly above is about RAMPARTS and only looks at tiles in
  // the EXTERIOR flood — the tiles that fail here are all interior, so it passes
  // them without a word. No shortfall mentions it either.
  //
  // WHAT COUNTS AS TAKING THE SEAT: the BLOCKING list, and only that list. Roads,
  // ramparts and containers are excluded from it deliberately (see the list at the
  // top of this file) because a creep walks over all three — a road on the
  // controller's face is a seat, not an obstruction, and failing a room for paving
  // its own upgrader stand would be the check misreading the game. Terrain is the
  // other half: a natural-wall neighbour was never a seat, so the test is over
  // WALKABLE neighbours only, and a controller boxed in by rock alone is terrain,
  // not a planning bug — which is why a room with zero walkable neighbours cannot
  // fail this gate. All nine offenders have walkable floor next to the controller
  // and we built on it.
  //
  // Re-derived from terrain + the shipped structure lists, like everything else:
  // the controller comes from `objects` (mongo), the occupancy from `s[type]`.
  //
  // UNDECLARABLE (`ctrlseat|no-seat`, see the pair set at the top). This is a
  // "this is wrong", not a "this is short": the seat costs one extension out of
  // sixty and every one of the nine rooms has deep floor elsewhere to put it.
  // ------------------------------------------------------------------
  let ctrlSeatBlocked = 0;
  let ctrlSeatUnreachable = 0;
  // OUR OWN WALK, flooded once and shared by every work-seat test below: from
  // the sitter over passable tiles minus our blocking structures, with ramparts,
  // roads and containers left conducting because our creeps pass all three. It
  // deliberately runs OUTSIDE the wall as well — the goal document leaves the
  // controller outside the shell on purpose, so a correct claim seat is very
  // often an exterior tile.
  const ourWalk = new Uint8Array(2500);
  {
    const si0 = idx(sitter.x, sitter.y);
    ourWalk[si0] = 1;
    const q = [si0];
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi],
        x = i % 50,
        y = (i / 50) | 0;
      for (const [dx, dy] of D8) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
        const ni = idx(nx, ny);
        if (ourWalk[ni] || !passable(nx, ny) || blocked.has(key(nx, ny))) continue;
        ourWalk[ni] = 1;
        q.push(ni);
      }
    }
  }

  // ------------------------------------------------------------------
  // THE MINERAL'S WORK SEAT — the same test as the controller's, on the other
  // room object a creep has to stand beside.
  //
  // E9S9 shipped an extractor on 41,18 and its container on 40,19 that NO CREEP
  // CAN EVER REACH, and every gate in this file passed it. The mineral's eight
  // neighbours are five natural walls and two of our labs, so 40,19 is the only
  // mining stand the room has; 40,19's own eight neighbours are three natural
  // walls, three labs, a tower and a spawn. The off-network test was the closest
  // thing to a check and it asks the wrong question — it wants D8 adjacency to a
  // road or container NODE, and the container IS a node, so the seat certified
  // itself. The room's SEALED INTERIOR FLOOR note even printed 40,19 as sealed-off
  // floor "carrying nothing"; it was the mineral container.
  //
  // The consequence is permanent: the mineral is unharvestable, the container can
  // never be filled or emptied, both decay forever, and the RCL6 extractor build
  // order stalls on a site no builder can stand beside. UNDECLARABLE, and the
  // producer-side invariant that prevents it is in shared.mjs (mineralSeatHolds),
  // which is local and cheap; this is the global version — a real flood that has
  // to ARRIVE — and the two are checked against each other on every fleet run.
  // ------------------------------------------------------------------
  let mineralSeatSealed = 0;
  if (mineral && (s.extractor || []).length) {
    const occupantOfM = (x, y) =>
      BLOCKING.filter((t) => (s[t] || []).some((p) => p.x === x && p.y === y)).join("+");
    const ring = [];
    for (const [dx, dy] of D8) {
      const x = mineral.x + dx,
        y = mineral.y + dy;
      if (x < 1 || y < 1 || x > 48 || y > 48) continue;
      if (!walkable(terrain, x, y)) continue;
      if (objectTiles.has(key(x, y))) continue;
      ring.push({ x, y, k: key(x, y), on: occupantOfM(x, y) });
    }
    const stands = ring.filter((t) => !t.on && ourWalk[idx(t.x, t.y)]);
    if (ring.length && !stands.length) {
      mineralSeatSealed = 1;
      const why = ring.map((t) => {
        if (t.on) return `${t.k} carries our ${t.on}`;
        let wall = 0,
          mine = 0;
        for (const [dx, dy] of D8) {
          const nx = t.x + dx,
            ny = t.y + dy;
          if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
          if (!passable(nx, ny)) wall++;
          else if (blocked.has(key(nx, ny))) mine++;
        }
        return `${t.k} is free but sealed (${wall} natural wall, ${mine} of ours)`;
      });
      late("misc", "mineral-seat",
        `MINERAL ENTOMBED — the mineral ${mineral.x},${mineral.y} carries an extractor and not one of ` +
          `its ${ring.length} walkable neighbour(s) is both free and reachable by our own creeps from ` +
          `the sitter ${sitter.x},${sitter.y}: ${why.join(" · ")}. The flood runs over our ramparts, ` +
          `roads and containers and is not stopped at the wall, so this is a genuine pocket. Nothing ` +
          `can ever mine here, the mineral container can never be filled or emptied, both structures ` +
          `decay forever, and the RCL6 extractor build order stalls on a site no builder can stand ` +
          `beside. A room object's work seat is a placement invariant, not a shortfall`,
        ring.map((t) => t.k),
      );
    }
    // ...and the seat the plan actually chose has to BE one of them.
    const mc = (s.container || []).find(
      (c) => Math.max(Math.abs(c.x - mineral.x), Math.abs(c.y - mineral.y)) <= 1,
    );
    if (mc && !ourWalk[idx(mc.x, mc.y)]) {
      mineralSeatSealed = 1;
      late("misc", "mineral-seat",
        `MINERAL CONTAINER UNREACHABLE — the miner's container at ${mc.x},${mc.y} is not on our own ` +
          `walk region from the sitter ${sitter.x},${sitter.y}. A container is walkable, so the only ` +
          `way this happens is that everything AROUND it is one of our obstacles or natural wall. ` +
          `Nothing can stand on it, fill it or empty it`,
        [key(mc.x, mc.y)],
      );
    }
  }

  if (controller) {
    /** who, of ours, is standing on this tile — "" when nobody is */
    const occupantOf = (x, y) =>
      BLOCKING.filter((t) => (s[t] || []).some((p) => p.x === x && p.y === y)).join("+");
    const ring = [];
    for (const [dx, dy] of D8) {
      const x = controller.x + dx,
        y = controller.y + dy;
      if (!walkable(terrain, x, y)) continue; // rock was never a seat
      ring.push({ x, y, k: key(x, y), on: occupantOf(x, y) });
    }
    const seats = ring.filter((t) => !t.on);
    if (ring.length && !seats.length) {
      ctrlSeatBlocked = 1;
      late("ctrlseat", "no-seat",
        `CONTROLLER SEALED IN — all ${ring.length} walkable tile(s) D8-adjacent to the controller ` +
          `${controller.x},${controller.y} carry one of our blocking structures ` +
          `(${ring.map((t) => `${t.k}=${t.on}`).join(" ")}). claimController and signController are ` +
          `both range 1, so if this room ever downgrades to unowned it can never be re-claimed: the ` +
          `claimer has nowhere to stand, and the structure in the way cannot be demolished without a ` +
          `spawn that cannot exist without the controller. Roads, ramparts and containers are NOT ` +
          `counted as taking the seat — a creep walks over all three — so every tile listed here is ` +
          `genuinely occupied`,
        ring.map((t) => t.k),
      );
    } else if (seats.length) {
      // ...AND A SEPARATE, WEAKER CONDITION: can OUR OWN creeps get to the seat?
      //
      // A free tile the claimer cannot walk to is worth knowing about even though
      // it is not the same failure — the room is still re-claimable from a fresh
      // creep entering at an exit, which is exactly the situation a re-claim
      // happens in, so this is a NOTE-grade fact and it is raised on its own kind.
      //
      // NOT `interior`. The obvious reading — "the seat must be on the interior
      // walk component at line ~1074" — is WRONG for this fleet and would fail 69
      // of 172 rooms: the goal document deliberately leaves the controller OUTSIDE
      // the shell (rampart its ring, nothing wider), so a correctly-planned
      // controller seat is an EXTERIOR tile and interiorComponent excludes every
      // exterior tile by construction. What is wanted is OUR walk, and our creeps
      // pass our own ramparts — so the field is flooded here from the sitter over
      // passable tiles minus our blocking structures, with ramparts, roads and
      // containers left conducting. On that reading exactly 2 rooms have a free
      // seat they cannot walk to: E6S4 (ctrl 15,21, seat 14,20) and E7S7
      // (ctrl 15,25, seat 16,24). Declarable — a pocket outside the wall that
      // terrain will not let us reach is a real constraint, and it does not stop
      // the room being re-claimed.
      // one flood for every work-seat test in this file — see ourWalk above
      const reach = ourWalk;
      if (!seats.some((t) => reach[idx(t.x, t.y)])) {
        ctrlSeatUnreachable = 1;
        // WHY IS IT A POCKET — terrain, or us? The disposition depends on it, so
        // the message says it rather than making a reader re-derive it. Each
        // seat's own eight neighbours are split into natural wall (nothing anyone
        // can do) and OUR blocking structures (a thing the producer can move).
        // On the shipped fleet all three pockets are mixed — E6S4's seat 14,20
        // has 5 wall neighbours and 3 of ours, E7S7's 16,24 has 5 wall and 3 of
        // ours, E18S1's 10,30 has 3 wall and 5 of ours — so none of them is pure
        // terrain and every one of them is at least partly a placement decision.
        const why = seats.map((t) => {
          let wall = 0,
            mine = 0;
          for (const [dx, dy] of D8) {
            const nx = t.x + dx,
              ny = t.y + dy;
            if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
            if (!passable(nx, ny)) wall++;
            else if (blocked.has(key(nx, ny))) mine++;
          }
          return `${t.k} (${wall} natural wall, ${mine} of ours)`;
        });
        late("ctrlseat", "seat-unreachable",
          `CONTROLLER SEAT UNREACHABLE — the controller ${controller.x},${controller.y} has ` +
            `${seats.length} free walkable neighbour(s) and OUR creeps cannot walk to any of them from ` +
            `the sitter ${sitter.x},${sitter.y}. The flood is NOT stopped at the wall — it runs over our ` +
            `own ramparts, roads and containers, which we pass, and it reaches every exterior tile in ` +
            `this room — so the seat is a genuine pocket and not an artefact of measuring only the ` +
            `inside. What seals each seat: ${why.join(" · ")}. The room is still re-claimable by a creep ` +
            `entering at an exit, so this is a constraint and not a wall — but no upgrader we spawn ` +
            `will ever stand there either`,
          seats.map((t) => t.k),
        );
      }
    }
  }

  // ------------------------------------------------------------------
  // ctrlParks, AS BUILT — the number is measured six layers too early.
  //
  // layer-hub.mjs:1035-1061 counts the controller link's park tiles while it is
  // CHOOSING that link, at layer 1, against an `impassable` set that contains
  // whatever exists at layer 1. Extensions, towers, labs, the nuker and the
  // observer all land afterwards, and they land on counted park tiles. Measured
  // on the fleet that motivated this gate (the run before the producer fix):
  // re-derived as built, 84 of 172 rooms shipped fewer parks than meta.ctrlParks
  // claimed. The real distribution was min 3 / median 7 against a claimed min 4 /
  // median 8, MIN_PARKS = 4 is treated as a hard floor throughout layer 1 and
  // echoed as `minParksFloor: 4` in every room's census, and three rooms shipped
  // BELOW that floor — E14S2 claimed 8 shipped 3, E18S8 claimed 8 shipped 3,
  // E17S5 claimed 5 shipped 3. A parked upgrader is a whole creep's worth of throughput;
  // the difference between 8 seats and 3 is the difference between an RCL8
  // controller that keeps up and one that throttles the fleet forever (m9, the
  // finding that put MIN_PARKS there in the first place).
  //
  // THE RE-DERIVATION, independent of the producer by construction. The
  // definition is layer 1's own: park tiles are the WALKABLE D8 neighbours of the
  // CONTROLLER LINK, restricted to chebyshev <= 3 of the controller, minus our
  // blocking structures and the room objects. `blocked` (built at the D4 gate
  // above) is exactly that obstacle set, measured on the SHIPPED structure lists
  // rather than on layer 1's snapshot of them — which is the entire difference
  // between the two numbers.
  //
  // FINDING THE CONTROLLER LINK IS THE ONLY HARD PART, AND IT IS DONE
  // GEOMETRICALLY. It is NOT link[0] — that is the hub link (layer-hub.mjs:1282,
  // and check "core"/sitter above pins it to the sitter's ring). The producer's
  // own handle is `structures.link[structures.link.length - 1]`, i.e. array
  // order, which is precisely the kind of producer convention this file refuses
  // to measure anything important against. The geometric definition is layer 1's
  // filter: chebyshev 2..3 of the controller (`if (ch < 2) continue` over a
  // -3..3 box). That alone is ambiguous in 10 rooms, where a SOURCE link happens
  // to fall in the controller's band too — so source links are struck out the way
  // they are built: bestLinkFor() places them D8-adjacent to a source SEAT, and a
  // seat is a container D8-adjacent to a source. That resolves 170 of 172 rooms
  // to exactly one candidate and 0 rooms to more than one.
  //
  // AND IT IS MEASURED, NOT ASSERTED, on the same principle as walkField()'s
  // mirror above: the link this derivation picks is the same tile as
  // meta.ctrlParksCensus.chosen in 172/172 rooms, every room, exactly. The census
  // is read for that comparison and for nothing else — no branch below depends on
  // it — but it is the number to re-run if this ever disagrees, and it is what
  // says the residual mismatches this gate reports are the producer's count and
  // not the validator's aim.
  //
  // THE TWO ROOMS IT DOES NOT RESOLVE (E13S9, E1S3) have both band links touching
  // a source container, so both get struck and nothing survives. There the
  // roomiest band link wins, which is the CONSERVATIVE fallback — it can only
  // ever report MORE parks than the alternative, so it cannot invent a shortfall
  // — and it happens to pick the producer's own link in both (E1S3's 40,8 reads
  // 7 parks against 40,7's 5, and meta claims 7; E13S9's 8,25 reads 6 against
  // 9,25's 3).
  //
  // TWO CHECKS, TWO CLASSES, ON PURPOSE:
  //   seats        as built, fewer than MIN_PARKS_FLOOR seats. DECLARABLE through
  //                the channel the producer actually writes — layer-hub files
  //                {gate:"ctrlParks", kind:"seats", tiles:[...]} for a thin seat
  //                search — and it carries the SURVIVING seats as tiles so the
  //                declaration has to have named them. See the block at the raise
  //                site for why the tiles are the survivors and what that buys.
  //   stale-claim  meta.ctrlParks does not equal the re-derivation. UNDECLARABLE
  //                (see the pair set): a wrong number is not a shortfall, and no
  //                note makes 8 into 3.
  //
  // REJECTED: failing on `meta.ctrlParks < 4` instead. That is the check that
  // exists today by implication and it is the one that missed all three floor
  // breaches, because every one of them CLAIMS a passing number. The claim is the
  // thing under test; it cannot also be the instrument.
  // ------------------------------------------------------------------
  let ctrlParksShort = 0;
  let ctrlParksStale = 0;
  /** the AS-BUILT park count, for the thin-seat obligation further down */
  let ctrlParksBuilt = null;
  if (controller) {
    const links = s.link || [];
    const band = links.filter((l) => {
      const c = chebyshev(l, controller);
      return c >= 2 && c <= 3;
    });
    const sourceSeats = (s.container || []).filter((c) => sources.some((src) => chebyshev(c, src) <= 1));
    const notASourceLink = band.filter((l) => !sourceSeats.some((c) => chebyshev(l, c) <= 1));
    const parksOf = (l) => {
      const seats = [];
      for (const [dx, dy] of D8) {
        const px = l.x + dx,
          py = l.y + dy;
        if (!walkable(terrain, px, py)) continue;
        if (blocked.has(key(px, py))) continue;
        if (chebyshev({ x: px, y: py }, controller) > 3) continue;
        seats.push(key(px, py));
      }
      return seats;
    };
    let geoLink = null;
    if (notASourceLink.length === 1) geoLink = notASourceLink[0];
    else {
      // ambiguous or empty — take the roomiest candidate in the band. See above:
      // this can only overstate the park count, never understate it.
      const pool = notASourceLink.length ? notASourceLink : band;
      for (const l of pool) if (!geoLink || parksOf(l).length > parksOf(geoLink).length) geoLink = l;
    }
    // ------------------------------------------------------------------
    // THREE WITNESSES TO THE SAME TILE, AND THE DISAGREEMENT IS THE FINDING.
    //
    // The producer's convention is POSITIONAL: layer-hub builds
    // `link: [hubLink, ...sourceLinks, ctrlLink]`, so the controller link is
    // `structures.link[structures.link.length - 1]`, and layer-shell.mjs:1449
    // reads it that way. That is array order — a producer convention, exactly the
    // kind of thing this file does not measure anything important against — so it
    // is used here as a WITNESS rather than as the answer, alongside the geometric
    // derivation above and `meta.ctrlLink` when the plan publishes one.
    //
    // meta.ctrlLink IS VERIFIED BEFORE IT IS BELIEVED, which is the only way this
    // file is allowed to read a producer field at all: the tile must actually
    // carry a planned link and must actually sit at chebyshev 2..3 of the
    // controller. A pointer that fails either test is not a hint, it is a bug, and
    // it is reported as one — undeclarable, because a meta field pointing at
    // nothing is wrong rather than short — and the geometric derivation is used
    // instead so the park gates below still measure something real.
    //
    // WHAT THIS SETTLED. Five rooms (E13S6, E13S9, E1S3, E18S3, E5S5) shipped a
    // meta.ctrlParks the as-built re-derivation disagreed with, and the first
    // hypothesis was that the two ends were looking at different links, because a
    // SOURCE link can sit at chebyshev 2 of the controller too (E13S6 has links at
    // 17,39 and 15,36 both at range 2; E18S3 has 16,42 and 12,42). It was not
    // that. Measured across the whole fleet, the geometric derivation, the
    // positional link[last] and the producer's OWN layer-1 seat search
    // (meta.ctrlParksCensus.chosen) name the same tile in 172/172 rooms, every
    // room, exactly — including all five. What differs is that
    // `meta.ctrlParksBuiltTiles` in those five rooms are the D8 neighbours of the
    // OTHER band link (E13S6's are around 17,39 while its census chose 15,36;
    // E13S9's around 9,25 against a chosen 8,25; E1S3's around 40,7 against 40,8;
    // E18S3's around 16,42 against 12,42; E5S5's around 21,9 against 20,9) and
    // meta.ctrlParks equals that wrong-link count in every one. So the disagreement
    // is inside the producer, between its as-built re-measure and its own seat
    // search, and the three-witness cross-check below is what makes that visible
    // instead of arguable.
    // ------------------------------------------------------------------
    const positional = links.length ? links[links.length - 1] : null;
    const same = (a, b) => a && b && a.x === b.x && a.y === b.y;
    const declaredLink = plan.meta?.ctrlLink;
    let ctrlLink = geoLink;
    let via = "geometry";
    if (declaredLink && Number.isInteger(declaredLink.x) && Number.isInteger(declaredLink.y)) {
      const carriesLink = links.some((l) => same(l, declaredLink));
      const chDecl = chebyshev(declaredLink, controller);
      if (carriesLink && chDecl >= 2 && chDecl <= 3) {
        ctrlLink = declaredLink;
        via = "meta.ctrlLink, verified";
      } else {
        late("ctrlparks", "bad-ctrl-link",
          `meta.ctrlLink points at ${declaredLink.x},${declaredLink.y}, which ` +
            (carriesLink
              ? `is chebyshev ${chDecl} from the controller ${controller.x},${controller.y} — the ` +
                `controller link is a 2..3 seat by construction (layer-hub's seat search skips the inner ` +
                `ring and never looks past 3)`
              : `carries no planned link at all`) +
            `. The field is not usable, so the park counts below are measured against the geometric ` +
            `derivation instead` +
            (geoLink ? ` (${geoLink.x},${geoLink.y})` : " (which also found nothing)"),
        );
      }
    }
    if (ctrlLink && positional && !same(ctrlLink, positional)) {
      late("ctrlparks", "ctrl-link-disagreement",
        `the controller link is ambiguous: this validator measures ${ctrlLink.x},${ctrlLink.y} ` +
          `(via ${via}) and the producer's positional convention — structures.link[last], which is how ` +
          `layer-hub builds the array and how layer-shell reads it — names ${positional.x},` +
          `${positional.y}. They feed ${parksOf(ctrlLink).length} and ${parksOf(positional).length} park ` +
          `seat(s) respectively, so the two ends of this gate are not scoring the same structure and ` +
          `neither number can be trusted until they are`,
      );
    }
    const claimed = typeof plan.meta?.ctrlParks === "number" ? plan.meta.ctrlParks : null;
    if (!ctrlLink) {
      // No link in the controller's band at all. The links/count gate above owns
      // "too few links"; what is reported here is that the park measurement has
      // no subject, which is not the same statement and must not read as a pass.
      late("ctrlparks", "no-ctrl-link",
        `no link sits at chebyshev 2..3 of the controller ${controller.x},${controller.y} ` +
          `(${links.length} link(s) in the room), so the controller has no link to park against and ` +
          `ctrlParks is unmeasurable` +
          (claimed === null ? "" : ` — the plan's own claim is ${claimed}`),
      );
    } else {
      const built = parksOf(ctrlLink);
      ctrlParksBuilt = built.length;
      if (built.length < MIN_PARKS_FLOOR) {
        ctrlParksShort = 1;
        // KIND "seats", AND IT CARRIES THE SURVIVING SEATS AS TILES. Both halves
        // of that are about matching the channel the producer actually writes.
        //
        // layer-hub files `{gate:"ctrlParks", kind:"seats", tiles:[...]}` whenever
        // the seat search comes back at or under THIN_PARKS, and the as-built
        // re-measure amends that same entry — it is the one honest declaration a
        // genuinely cramped controller has. Raising this violation on kind "count"
        // meant `excused()`'s `d.kind === f.kind` test could never match it, so the
        // three rooms that DO declare (E16S3, E17S5, E8S7 — all three at 3 seats,
        // all three claiming 3, i.e. producer and validator now agreeing on the
        // number) were hard-failing for saying so. That is the shortfall channel
        // punishing the behaviour it exists to reward.
        //
        // The tiles are the SURVIVING seats, not the lost ones, and they are what
        // makes the arbitration honest rather than merely permissive: a tiled
        // declaration excuses a violation only when every tile of the violation is
        // inside its list, and the as-built survivors are a subset of the seats the
        // layer-1 search declared in all three rooms (E16S3 19,11/18,10/19,12
        // inside a declared four; E17S5 27,33/26,34/26,32 inside a declared six;
        // E8S7 12,41/10,42/10,40 inside a declared four). So the declaration only
        // covers a room that lost seats it had already named. A room that ships
        // ZERO seats raises this with an EMPTY tile list, which no tiled
        // declaration can ever excuse — `excused()` requires `f.tiles.length` — and
        // that is the right floor: a controller with nowhere at all to park is not
        // a cramped room, it is an upgrader that never runs.
        late("ctrlparks", "seats",
          `AS BUILT the controller link ${ctrlLink.x},${ctrlLink.y} feeds ${built.length} park seat(s), ` +
            `under the ${MIN_PARKS_FLOOR} floor layer 1 plans to (MIN_PARKS, echoed as minParksFloor in ` +
            `every census)` +
            (claimed === null ? "" : ` — the plan claims ${claimed}`) +
            `. Seats left: ${built.join(" ") || "none"}. Every upgrader past the ${built.length}th ` +
            `queues, forever`,
          built,
        );
      }
      if (claimed !== null && claimed !== built.length) {
        ctrlParksStale = 1;
        // BOTH DIRECTIONS GET PROSE. The overclaim is the common one and the
        // expensive one — layer 1 counted seats that later layers then built on —
        // but the reverse happens too and it is a different bug: it means the
        // number was measured against a DIFFERENT LINK than the one the room
        // ships, which is the failure this check's link derivation exists to
        // expose. Printing "-2 seats were built over" would hide exactly that.
        late("ctrlparks", "stale-claim",
          `meta.ctrlParks says ${claimed}, the shipped room has ${built.length} ` +
            `(controller link ${ctrlLink.x},${ctrlLink.y}; seats ${built.join(" ") || "none"}). ` +
            (claimed > built.length
              ? `The claim is measured at layer 1, before extensions, towers, labs, the nuker and the ` +
                `observer land — ${claimed - built.length} counted seat(s) were built over afterwards.`
              : `The claim is LOWER than the shipped room, so it was not measured against this link at ` +
                `all — ${built.length - claimed} seat(s) exist that the claim never counted, which means ` +
                `the producer and this validator disagree about which link is the controller's.`) +
            ` The number in meta describes a room that was never shipped`,
        );
      }
    }
  }

  // ------------------------------------------------------------------
  // A BATTERY THAT IS MERELY LEGAL HAS TO SAY SO — measured, not taken on trust.
  //
  // This used to read meta.towers.minShellDmg and believe it, with a comment
  // admitting as much ("a planner that lied about its damage would not be caught
  // here"). It did not have to be a lie to be wrong: a cut that goes stale under
  // layer 7 makes that number honest arithmetic over the wrong tiles, which is
  // how E11S10 shipped a declared 2670 over a real 1380. So the weakest face is
  // now RE-DERIVED here from the shipped tower list and the seal tiles this
  // validator found for itself, and the gate is applied to that. The planner's
  // own number is still reported when the two disagree, because the disagreement
  // is the interesting part.
  //
  // AND THE BLOCK RUNS FOR EVERY ROOM, WHATEVER meta.towers CONTAINS. It used to
  // open with `if (tw && typeof tw.minShellDmg === "number")`, which made the
  // re-derivation opt-in on a field the producer controls: deleting
  // meta.towers.minShellDmg — or meta.towers wholesale — skipped the gate along
  // with the measurement that was supposed to police it. That is not a
  // hypothetical. E11S10's genuine weakest sealing tile is 1380, under the 1800
  // floor, and with the field and the declaration both removed the room came out
  // clean: the validator's own arithmetic was gated on the number it existed to
  // disbelieve. A re-derivation that a producer can turn off by omitting a key
  // is a re-derivation in name only. meta is now read for REPORTING and nothing
  // else, and reads "absent" when it is not there.
  //
  // maxRefill is re-derived on the same principle. It was read straight out of
  // meta and never checked, so `maxRefill: 1` on a room whose real furthest tower
  // is a 10-step walk (E11S2) passed in silence. The walk is now measured here
  // with walkField(), mirroring layer-towers.mjs: BFS from the sitter with the
  // room's obstacles blocked — storage, terminal, link, spawn, and the source /
  // controller / mineral tiles — which is exactly the field the planner scores
  // its candidates against. It reproduces meta.towers.refillDists in 159/159
  // rooms, tower for tower, so the gate loses nothing by trusting itself. Towers
  // the filler cannot reach at all come back 9999 and are reported as such rather
  // than as a very large number.
  // ------------------------------------------------------------------
  const tw = plan.meta?.towers;
  /** the battery numbers, hoisted for the declaration content audit below */
  let batteryDerived = null;
  {
    const scored = sealTiles.length
      ? sealTiles
      : (plan.meta?.shell?.cut || []).map((c) => ({ x: c.x, y: c.y }));
    let measured = null;
    let worst = null;
    for (const c of scored) {
      let sum = 0;
      for (const t of s.tower || []) {
        const r = chebyshev(t, c);
        sum += r <= 5 ? 600 : r >= 20 ? 150 : 600 - (r - 5) * 30;
      }
      if (measured === null || sum < measured) {
        measured = sum;
        worst = c;
      }
    }
    // ------------------------------------------------------------------
    // THE FILLER'S WALK, RE-DERIVED ON THE BOARD THE ROOM SHIPS.
    //
    // THE BOARD THIS USED TO USE WAS THE PRODUCER'S. The obstacle set mirrored
    // layer-towers.mjs's `blockers` — storage / terminal / link / spawn and the
    // room objects — with a comment saying the rest were "not in the planner's
    // field either, because they did not exist when it was measured". That is
    // true and it is the wrong reason: a cross-check written to reproduce the
    // producer's board can only ever confirm the producer's arithmetic, never
    // its premise. It reproduced `refillDists` in 159/159 rooms and was blind to
    // the fact that 15 of them walk further than that, because the OTHER FIVE
    // TOWERS, the labs, the nuker, the observer and sixty extensions are all
    // OBSTACLE_OBJECT_TYPES and every one of them stands in the walk. Two rooms
    // shipped a silent shortfall behind it (E12S4, E18S3 — both published a
    // legal walk and both walked 9).
    //
    // So it is taken here on the RCL8 board, with everything standing, and the
    // plan's own reading has to agree with it. `arriveAt` semantics: the filler
    // stands NEXT to the tower, because a tower is an obstacle.
    // ------------------------------------------------------------------
    const refillBlocked = new Set(objectTiles);
    for (const t of [
      "storage",
      "terminal",
      "link",
      "spawn",
      "tower",
      "lab",
      "extension",
      "nuker",
      "observer",
    ]) {
      for (const p of s[t] || []) refillBlocked.add(key(p.x, p.y));
    }
    const refillField = walkField(terrain, sitter, refillBlocked);
    const arriveRefill = (t) => {
      const v = refillField[idx(t.x, t.y)];
      if (v < 9999) return v;
      let best = 9999;
      for (const [dx, dy] of D8) {
        const x = t.x + dx,
          y = t.y + dy;
        if (x < 0 || y < 0 || x > 49 || y > 49) continue;
        const w = refillField[idx(x, y)];
        if (w < 9999 && w + 1 < best) best = w + 1;
      }
      return best;
    };
    const refillDists = (s.tower || []).map((t) => arriveRefill(t));
    const maxRefill = refillDists.length ? Math.max(...refillDists) : 0;
    const unreachable = refillDists.filter((d) => d >= 9999).length;
    // ...and the plan has to publish the number it walks. This is the cross-check
    // the old board could not make: a producer that measures early and never
    // re-derives is exactly the failure this block exists to catch, and it cannot
    // catch it while sharing the producer's premise.
    {
      const pub = plan.meta?.towers?.refillDists;
      const bad =
        !Array.isArray(pub) ||
        pub.length !== refillDists.length ||
        pub.some((v, i) => v !== refillDists[i]);
      // Pushed straight onto `fails`, like every other check in this block: the
      // arbitration loop has already run by the time this code executes, and
      // `towers` is an UNDECLARABLE gate anyway — no declaration may excuse a
      // published number that is not the number the room walks.
      if (bad && (s.tower || []).length) {
        fails.push(
          `towers/refill-stale — refillDists is not the walk this room ships: the plan says ` +
            `[${Array.isArray(pub) ? pub.join(",") : "absent"}], the as-built board gives ` +
            `[${refillDists.join(",")}] (BFS from the sitter with every OBSTACLE_OBJECT_TYPE standing, ` +
            `arrival-at-tile)`,
        );
      }
    }

    const planMin = typeof tw?.minShellDmg === "number" ? tw.minShellDmg : null;
    const planRefill = typeof tw?.maxRefill === "number" ? tw.maxRefill : null;
    const say = (v) => (v === null ? "absent" : String(v));
    // ...and the same scoring over the WHOLE published cut, which is the basis
    // `shippedMinShellDmg` and the shipped-battery declaration are stated on.
    // The two bases are different quantities — the cut is a superset of the
    // tiles that actually carry the seal — so they are kept apart by name
    // rather than compared to each other.
    const cutAllPts = (plan.meta?.shell?.cut || []).map((c) => ({ x: c.x, y: c.y }));
    const faceDmg = (c) => {
      let d = 0;
      for (const t of s.tower || []) {
        const r = chebyshev(t, c);
        d += r <= 5 ? 600 : r >= 20 ? 150 : 600 - (r - 5) * 30;
      }
      return d;
    };
    batteryDerived = {
      refillDists,
      maxRefill,
      /** weakest tile that actually carries the seal — what the gate is judged on */
      sealMinShellDmg: measured,
      /** weakest tile of the published cut — what the plan states about its wall */
      minShellDmg: cutAllPts.length ? Math.min(...cutAllPts.map(faceDmg)) : null,
      avgShellDmg: cutAllPts.length
        ? Math.round(cutAllPts.reduce((sum, c) => sum + faceDmg(c), 0) / cutAllPts.length)
        : null,
      cutTiles: cutAllPts.length,
    };

    // ------------------------------------------------------------------
    // ...AND THE TWO SUMMARY FIELDS THAT WERE READ AND NEVER CHECKED.
    //
    // `refillDists` is cross-checked above, element by element. `maxRefill` is
    // the field the census headline and the goal document actually quote ("max
    // 11"), and until now it was read at exactly one place — inside a message
    // string — so setting E7S5's to 99 against a real 5 validated `1/1 · fail 0`.
    // `minShellDmg` had the identical shape: read into `planMin`, printed, never
    // compared. Both are trivially derivable here and both are now derived. A
    // published summary of a re-derived array must agree with the array, or the
    // summary is the number that rots while the array stays honest.
    //
    // Undeclarable by construction, like every other check in this block: they
    // are pushed straight onto `fails` after arbitration has run, and "towers"
    // is a gate no declaration may excuse.
    // ------------------------------------------------------------------
    if ((s.tower || []).length) {
      if (planRefill !== null && planRefill !== maxRefill) {
        fails.push(
          `towers/refill-stale — meta.towers.maxRefill is ${planRefill}, and the furthest tower on the ` +
            `board this room ships is a ${maxRefill}-step walk from the sitter (walks ` +
            `[${refillDists.join(",")}]). This is the field the census headline and the goal document ` +
            `quote; it is a summary of the array checked above and it must agree with it.`,
        );
      } else if (planRefill === null && Array.isArray(tw?.refillDists)) {
        fails.push(
          `towers/refill-stale — meta.towers publishes refillDists but no maxRefill, and maxRefill is ` +
            `the number every summary of this room quotes. The re-derived value is ${maxRefill}.`,
        );
      }
      // `minShellDmg` is deliberately NOT compared here: it is layer 3's
      // decision-time reading over the cut layer 3 was given, the plan says so
      // in those words, and the declaration prints both. What IS a claim about
      // the room that ships is `shippedMinShellDmg`, and that is re-derived —
      // over the same basis the producer uses for it, the whole published cut.
      const cutAll = cutAllPts;
      if (cutAll.length) {
        let sMin = null;
        let sWorst = null;
        for (const c of cutAll) {
          const d = faceDmg(c);
          if (sMin === null || d < sMin) {
            sMin = d;
            sWorst = c;
          }
        }
        const pubShip = tw?.shippedMinShellDmg;
        if (typeof pubShip === "number" && pubShip !== sMin) {
          fails.push(
            `towers/battery-stale — meta.towers.shippedMinShellDmg is ${pubShip}, and the weakest tile of ` +
              `the ${cutAll.length}-tile cut this room ACTUALLY SHIPS takes ${sMin}` +
              (sWorst ? ` (${sWorst.x},${sWorst.y})` : "") +
              `. That field is the room's claim about its own wall — layer 3's minShellDmg is a different ` +
              `and honestly-labelled number about a different wall — and a claim about the shipped wall ` +
              `has to be the shipped wall's number.`,
          );
        }
        if (typeof tw?.shippedCutTiles === "number" && tw.shippedCutTiles !== cutAll.length) {
          fails.push(
            `towers/battery-stale — meta.towers.shippedCutTiles is ${tw.shippedCutTiles} and the plan ` +
              `ships a ${cutAll.length}-tile cut.`,
          );
        }
      }
    }

    // Nothing to measure the battery against: no rampart carries the seal and the
    // plan declares no cut either. Not a pass — an unmeasurable wall is reported,
    // because the alternative is the silent skip this whole block just removed.
    if (measured === null) {
      fails.push(
        `battery UNMEASURABLE — no rampart carries the seal and meta.shell.cut is empty or absent, ` +
          `so the weakest-face gate has no tiles to score (the plan's own reading is ${say(planMin)})`,
      );
    }
    const weak = measured !== null && measured < WEAK_SHELL_DMG;
    const farRefill = maxRefill > REFILL_NOTE;
    if (weak || farRefill) {
      // The declaration has to be an ADMISSIBLE one. `declared` is the raw list
      // straight off the plan, so reading it here would let an evidence-free
      // {gate:"towers", kind:"weak-battery"} excuse the battery through a door
      // the arbitration above has already closed for every other gate.
      const declaredWeak = decls.some((d) => d.gate === "towers" && d.kind === "weak-battery");
      const why = [
        weak
          ? `weakest SEALING tile ${measured} < ${WEAK_SHELL_DMG}` +
            (worst ? ` (${worst.x},${worst.y}` : "") +
            (worst && measured !== planMin
              ? `; the plan's own cut-wide reading is ${say(planMin)})`
              : worst
                ? ")"
                : "")
          : null,
        farRefill
          ? `furthest tower refill walk ${unreachable ? `UNREACHABLE (${unreachable} tower(s))` : maxRefill}` +
            ` > ${REFILL_NOTE}` +
            (planRefill !== maxRefill ? `; the plan's own reading is ${say(planRefill)}` : "")
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      (declaredWeak ? notes : fails).push(
        `battery legal-not-good (${why})` +
          (declaredWeak ? " — declared" : " and UNDECLARED: a weak battery shipped in silence"),
      );
    }
  }

  // ==================================================================
  // DECLARATION CONTENT — the numbers, re-derived.
  //
  // Until now this file checked that a declaration CARRIES numbers and never
  // that they are true. A reviewer rewrote E2S8's `towers/weak-battery` entry to
  // claim "a 2-step refill walk ... Walks, nearest first: 1/1/1/1/1/2" against a
  // room that ships 7/8/8/9/10/11 and it PASSED; corrupted E7S5's
  // `mobility/covered-detour` numbers from 33/17 to 4/999 and every ratio from
  // 1.94 to 0.11 and it PASSED; corrupted E11S6's clump counters and it PASSED;
  // and added a `misc/off-network` exemption naming a container that is ON the
  // network and it PASSED SILENTLY. The evidence rule was a SHAPE rule — forty
  // characters and two distinct numbers — and a shape rule is satisfied by any
  // numbers at all. That is the mechanism behind every "the declaration says X
  // and the room does Y" finding this planner has ever had.
  //
  // So: for every declaration kind whose numbers this file can re-derive, it
  // re-derives them and FAILS the room on a material mismatch. Two rules, and
  // the second one is the one that makes the first hard to walk around:
  //
  //   THE STRUCTURED CLAIM MUST BE TRUE. Each auditable kind carries a
  //   structured block (`record`, `mass`, `lift`, `battery`, `clump`, `eco`,
  //   `shallowExt`, `tiles`). Every field this file can derive is derived and
  //   compared. Ratios compare to 0.01, integers exactly.
  //
  //   AND THE PROSE MUST QUOTE IT. A declaration is read by a human, and
  //   correcting the structured block while leaving the paragraph saying
  //   something else is the same lie in a quieter place. So every audited value
  //   has to appear as a standalone numeric token in `detail`. This is cheap for
  //   an honest producer — every one of these sentences already prints its own
  //   numbers — and it is what makes a prose-only corruption bite.
  //
  // A declaration this file cannot re-derive is untouched: the rule is "audited
  // where auditable", not "auditable or forbidden".
  // ==================================================================
  {
    /** every distinct numeric token in a string, as a set of trimmed literals */
    const numsIn = (str) => {
      const out = new Set();
      for (const m of String(str || "").matchAll(/\d+(?:\.\d+)?/g)) out.add(m[0]);
      return out;
    };
    /** does the prose quote this value? accepts 2.5 as "2.5" and 3 as "3" */
    const quoted = (toks, v) => {
      if (v === null || v === undefined) return true;
      const n = Number(v);
      if (!Number.isFinite(n)) return true;
      if (toks.has(String(n))) return true;
      if (Number.isInteger(n) && toks.has(n.toFixed(1))) return true;
      if (!Number.isInteger(n) && toks.has(String(Math.round(n)))) return true;
      // a ratio printed to two places where the value rounds to one
      if (toks.has(n.toFixed(2)) || toks.has(n.toFixed(1))) return true;
      return false;
    };
    const bad = [];
    const near = (a, b) => Math.abs(Number(a) - Number(b)) <= 0.011;
    /**
     * @param {string} what   the declaration, for the message
     * @param {object} sf     the declaration itself (for the prose check)
     * @param {[string, any, any][]} pairs  [field, published, derived]
     */
    const audit = (what, sf, pairs) => {
      const toks = numsIn(sf.detail);
      for (const [field, pub, der] of pairs) {
        if (der === null || der === undefined) continue; // not derivable here
        if (pub === undefined) {
          bad.push(`${what}: the structured record has no \`${field}\`; re-derived it is ${der}`);
          continue;
        }
        const same =
          typeof der === "number" && typeof pub === "number" ? near(pub, der) : String(pub) === String(der);
        if (!same) {
          bad.push(`${what}: \`${field}\` says ${JSON.stringify(pub)}, re-derived it is ${JSON.stringify(der)}`);
          continue;
        }
        // NO NUMERAL-PRESENCE TEST HERE ANY MORE. It used to check that `der`
        // appeared somewhere in `detail`, and that is exactly the rule a
        // reviewer walked through by appending "[audit tokens: 35 2 33 17.5 0
        // 20 91]" to a paragraph that said the opposite of all of them. The
        // check that replaced it is prose IDENTITY, above: the paragraph is
        // generated from this record, so a number in the record is in the
        // paragraph by construction and a number in the paragraph that is not
        // in the record cannot exist. `quoted()` survives for the one place
        // that still needs a containment test — the refill walk list, whose
        // rendering is a joined string rather than a field.
      }
    };

    // ---- the boards every mobility audit is taken on --------------------
    const rampK = new Set((s.rampart || []).map((r) => key(r.x, r.y)));
    const mobBlocked = new Set(objectTiles);
    for (const t of BLOCKING) for (const p of s[t] || []) mobBlocked.add(key(p.x, p.y));
    /** the mass-free board: extensions lifted, everything else standing */
    const mobBlockedFree = new Set(objectTiles);
    for (const t of BLOCKING) {
      if (t === "extension") continue;
      for (const p of s[t] || []) mobBlockedFree.add(key(p.x, p.y));
    }
    /** the LIFT board: only the mandated hub trio and the spawn fan remain */
    const mobBlockedLift = new Set(objectTiles);
    for (const t of ["storage", "terminal", "link", "spawn"]) {
      for (const p of s[t] || []) mobBlockedLift.add(key(p.x, p.y));
    }
    const walkFor = (blk) => {
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
          const ni = idx(nx, ny);
          const k = key(nx, ny);
          if (seen[ni] || !passable(nx, ny)) continue;
          // the garrison walks its own ramparts; it never crosses the wall
          if (!rampK.has(k) && ext[ni]) continue;
          if (blk.has(k)) continue;
          seen[ni] = 1;
          q.push(ni);
        }
      }
      return seen;
    };
    const cutPts = (plan.meta?.shell?.cut || []).map((c) => ({ x: c.x, y: c.y }));
    let mBuilt = null;
    let mFree = null;
    let mLift = null;
    if (cutPts.length) {
      mBuilt = mobilityMetric(cutPts, ext, walkFor(mobBlocked));
      if (mBuilt.sampled) mBuilt = null;
    }
    const deriveFree = () => {
      if (mFree === null && cutPts.length) {
        const m = mobilityMetric(cutPts, ext, walkFor(mobBlockedFree));
        mFree = m.sampled ? false : m;
      }
      return mFree || null;
    };
    const deriveLift = () => {
      if (mLift === null && cutPts.length) {
        const m = mobilityMetric(cutPts, ext, walkFor(mobBlockedLift));
        mLift = m.sampled ? false : m;
      }
      return mLift || null;
    };
    // ==================================================================
    // PUBLISHED VS DERIVED — meta.shell.mobilityBuilt, field by field.
    //
    // This file already computed the metric; it compared TWO of its fields to a
    // declaration and never once looked at the record the plan publishes. A
    // reviewer falsified `mobilityBuilt` wholesale on E11S7 — max and maxGated
    // to 1.0, cause to "none" — on the room with the fleet's worst lap (9.33),
    // and the room passed. `plan.mjs` reads `mobilityBuilt.maxGated` for the
    // fleet headline, so the false number would have been the number a reader
    // saw. It also planted an UNEARNED lift record (`clears: true`,
    // `liftedLap: 0`, `solo: ["extension"]`) against a document that says in
    // as many words "the validator re-derives both and fails a room that
    // publishes a cause — or a lift record — it has not earned". It did not.
    //
    // It does now, and the rule is publish-vs-derive on EVERY field rather than
    // on the two the gate happens to read: a published field nothing re-derives
    // is a field that rots, and this record has fourteen of them.
    // ==================================================================
    const LIFTABLE_V = ["extension", "tower", "lab", "nuker", "observer"];
    /** the interior walk mask with `classes` lifted out of the room */
    const blockedLifting = (classes) => {
      const lift = new Set(classes);
      const blk = new Set(objectTiles);
      for (const t of BLOCKING) {
        if (lift.has(t)) continue;
        for (const p of s[t] || []) blk.add(key(p.x, p.y));
      }
      return blk;
    };
    if (mBuilt) {
      const mb = plan.meta?.shell?.mobilityBuilt;
      const sameTile = (p, q) => (!p && !q) || (p && q && p.x === q.x && p.y === q.y);
      const samePair = (pub, der) => {
        if (!der) return pub === null || pub === undefined;
        if (!pub || typeof pub !== "object") return false;
        return (
          sameTile(pub.a, der.a) &&
          sameTile(pub.b, der.b) &&
          pub.din === der.din &&
          pub.dout === der.dout
        );
      };
      const walled = cutPts.length - mBuilt.reachable;
      const scalar = [
        ["max", mb?.max, mBuilt.max],
        ["mean", mb?.mean, mBuilt.mean],
        ["p90", mb?.p90, mBuilt.p90],
        ["over", mb?.over, mBuilt.over],
        ["pairs", mb?.pairs, mBuilt.pairs],
        ["maxStrict", mb?.maxStrict, mBuilt.maxStrict],
        ["maxDetour", mb?.maxDetour, mBuilt.maxDetour],
        ["maxGated", mb?.maxGated, mBuilt.maxGated],
        ["overGated", mb?.overGated, mBuilt.overGated],
        ["coveredPairs", mb?.coveredPairs, mBuilt.coveredPairs],
        ["maxCovered", mb?.maxCovered, mBuilt.maxCovered],
        ["maxCoveredDetour", mb?.maxCoveredDetour, mBuilt.maxCoveredDetour],
        ["walled", mb?.walled, walled],
      ];
      for (const [f, pub, der] of scalar) {
        if (typeof pub !== "number") {
          bad.push(`meta.shell.mobilityBuilt: \`${f}\` is not published; re-derived it is ${der}`);
        } else if (!near(pub, der)) {
          bad.push(`meta.shell.mobilityBuilt: \`${f}\` says ${pub}, re-derived it is ${der}`);
        }
      }
      for (const [f, der] of [
        ["worst", mBuilt.worst],
        ["worstGated", mBuilt.worstGated],
        ["worstDetour", mBuilt.worstDetour],
        ["worstCovered", mBuilt.worstCovered],
      ]) {
        if (!samePair(mb?.[f], der)) {
          bad.push(
            `meta.shell.mobilityBuilt: \`${f}\` says ${JSON.stringify(mb?.[f] ?? null)}, re-derived the ` +
              `pair is ${JSON.stringify(der)}`,
          );
        }
      }
      // ...AND THE CAUSE AND THE LIFT ARE EARNED, NOT LABELLED.
      const over = mBuilt.maxGated > MOB_TARGET;
      if (!over && mb?.cause !== "none") {
        bad.push(
          `meta.shell.mobilityBuilt: \`cause\` is ${JSON.stringify(mb?.cause)} on a room whose gated lap ` +
            `is ${mBuilt.maxGated}, inside the ${MOB_TARGET} target. The lift test that produces a cause ` +
            `is only paid for by rooms that miss; a room that does not miss has no cause`,
        );
      }
      if (over && (!mb?.cause || mb.cause === "none")) {
        bad.push(
          `meta.shell.mobilityBuilt: \`cause\` is ${JSON.stringify(mb?.cause ?? null)} on a room whose ` +
            `gated lap is ${mBuilt.maxGated}, over the ${MOB_TARGET} target — a miss with no attributed ` +
            `cause is the silence the lift test exists to end`,
        );
      }
      if (!over && mb?.lift) {
        bad.push(
          `meta.shell.mobilityBuilt: carries a \`lift\` record on a room whose gated lap is ` +
            `${mBuilt.maxGated} — the lift test only runs on rooms that miss, so this is a test that did ` +
            `not happen`,
        );
      }
      if (over && !mb?.lift) {
        bad.push(
          `meta.shell.mobilityBuilt: no \`lift\` record on a room whose gated lap is ${mBuilt.maxGated}, ` +
            `over the ${MOB_TARGET} target — the attribution is the whole point of publishing a cause`,
        );
      }
      if (mb?.lift && cutPts.length) {
        const L = mb.lift;
        const all = mobilityMetric(cutPts, ext, walkFor(blockedLifting(LIFTABLE_V)));
        if (!all.sampled) {
          const derClears = all.maxGated <= MOB_TARGET;
          const derOwn =
            mBuilt.maxGated > 0
              ? Math.max(0, Math.round(((mBuilt.maxGated - all.maxGated) / mBuilt.maxGated) * 100))
              : 0;
          for (const [f, pub, der] of [
            ["lift.liftedLap", L.liftedLap, all.maxGated],
            ["lift.liftedOverGated", L.liftedOverGated, all.overGated],
            ["lift.liftedGatedPairs", L.liftedGatedPairs, all.gatedPairs],
            ["lift.ownPct", L.ownPct, derOwn],
          ]) {
            if (typeof pub !== "number" || !near(pub, der)) {
              bad.push(
                `meta.shell.mobilityBuilt: \`${f}\` says ${JSON.stringify(pub)}, re-running the lift on ` +
                  `this room's own board it is ${der}`,
              );
            }
          }
          if (L.clears !== derClears) {
            bad.push(
              `meta.shell.mobilityBuilt: \`lift.clears\` says ${L.clears} and the lifted board laps ` +
                `${all.maxGated} against a ${MOB_TARGET} target`,
            );
          }
          // ...and every class the record calls a SOLO cause has to be one.
          // This is the field the planted record lied in: "solo: [extension]"
          // is a claim that lifting the extensions ALONE clears the gate, and
          // it is one metric run to check. The prefilter is the producer's own
          // soundness argument — a class that does not shorten the shipped
          // worst pair cannot have moved the maximum below the target — so the
          // full run is only paid for by classes that could plausibly be solo.
          const present = LIFTABLE_V.filter((t) => (s[t] || []).length > 0);
          const wp = mBuilt.worstGated || mBuilt.worst || null;
          const soloClaim = new Set(Array.isArray(L.solo) ? L.solo : []);
          for (const c of soloClaim) {
            if (!present.includes(c)) {
              bad.push(
                `meta.shell.mobilityBuilt: \`lift.solo\` names "${c}", which this room does not build`,
              );
            }
          }
          if (derClears) {
            for (const c of present) {
              let din = null;
              if (wp) din = mobArrive(mobBfs(walkFor(blockedLifting([c])), wp.a), wp.b);
              const couldBeSolo = !wp || !isFinite(din) || din < wp.din;
              if (!couldBeSolo) {
                if (soloClaim.has(c)) {
                  bad.push(
                    `meta.shell.mobilityBuilt: \`lift.solo\` claims lifting "${c}" alone clears the gate, ` +
                      `and it does not even shorten the worst gated pair (${wp.a.x},${wp.a.y}~${wp.b.x},` +
                      `${wp.b.y}: still ${isFinite(din) ? din : "unreachable"} against ${wp.din})`,
                  );
                }
                continue;
              }
              const st = mobilityMetric(cutPts, ext, walkFor(blockedLifting([c])));
              if (st.sampled) continue;
              const isSolo = st.maxGated <= MOB_TARGET;
              if (isSolo !== soloClaim.has(c)) {
                bad.push(
                  `meta.shell.mobilityBuilt: \`lift.solo\` ${soloClaim.has(c) ? "names" : "omits"} "${c}" ` +
                    `and lifting it alone laps ${st.maxGated} against the ${MOB_TARGET} target — a solo ` +
                    `cause is a measurement, not a label`,
                );
              }
            }
          } else if (soloClaim.size) {
            bad.push(
              `meta.shell.mobilityBuilt: \`lift.solo\` names ${[...soloClaim].join("/")} on a room where ` +
                `lifting ALL of our mass still laps ${all.maxGated} — no class can be a solo cause of a ` +
                `miss the whole mass does not explain`,
            );
          }

          // ============================================================
          // ...AND THE CAUSE'S VALUE, WHICH ONLY ITS POLARITY WAS CHECKED.
          //
          // Everything above tests whether a cause EXISTS when it should and is
          // absent when it should be — `cause !== "none"` on a room that misses,
          // `"none"` on a room that does not. Which of the three labels it is
          // was published by its own producer and re-derived by nothing, so
          // rewriting E11S6's from "structures" to "terrain" passed, E11S7's
          // from "terrain" to "structures" passed, and E19S8's from "shape" to
          // "terrain" passed. That is the position `nukeWindow` was in.
          //
          // The label is fully determined by two things this file has already
          // measured, and the producer's definition (mobilityLift and
          // mobilityCauseDetail, layer-shell.mjs:961-1010 and :1185-1210) is
          // transcribed here:
          //
          //   clears  the lift board is inside the target => "structures", full
          //           stop. The whole point of the lift test is that a miss our
          //           own mass removes is OUR miss, and `derClears` is already
          //           derived four lines up, so the two are BOUND: no room may
          //           publish a clearing lift and a terrain cause.
          //   !clears the producer falls through to the pair-level diagnosis on
          //           the LIFTED board's worst pair and then maps its answer:
          //           "structures" becomes "shape" (our mass is already lifted
          //           out, so a structures verdict about that board means the
          //           enclosure is concave), "terrain" stays "terrain". So the
          //           only two reachable labels are terrain and shape, and which
          //           one is a two-BFS question.
          //
          // dStruct / dFree are the same two walks the producer takes: the pair
          // re-walked with our structures gone (but the wall standing) and with
          // the interior's natural walls gone as well. The thresholds are the
          // producer's, character for character, because a transcription that
          // rounds differently is a second opinion and not a check.
          const wl = all.worstGated || all.worst || mBuilt.worstGated || mBuilt.worst || null;
          let derCause = null;
          if (derClears) derCause = "structures";
          else if (wl) {
            const noStruct = new Uint8Array(2500);
            const noWall = new Uint8Array(2500);
            for (let x = 0; x < 50; x++) {
              for (let y = 0; y < 50; y++) {
                const i = idx(x, y);
                if (ext[i]) continue;
                noWall[i] = 1;
                if (walkable(terrain, x, y)) noStruct[i] = 1;
              }
            }
            for (const c of cutPts) {
              noStruct[idx(c.x, c.y)] = 1;
              noWall[idx(c.x, c.y)] = 1;
            }
            const dStruct = mobArrive(mobBfs(noStruct, wl.a), wl.b);
            const dFree = mobArrive(mobBfs(noWall, wl.a), wl.b);
            const pairCause =
              dStruct <= MOB_TARGET * wl.dout || dStruct * 1.15 <= wl.din
                ? "structures"
                : dFree <= MOB_TARGET * wl.dout || dFree * 1.15 <= dStruct
                  ? "terrain"
                  : "shape";
            derCause = pairCause === "structures" ? "shape" : pairCause;
          }
          if (derCause && mb.cause !== derCause) {
            bad.push(
              `meta.shell.mobilityBuilt: \`cause\` says ${JSON.stringify(mb.cause)}, re-derived on this ` +
                `room's own board it is "${derCause}"` +
                (derClears
                  ? ` — the lift board laps ${all.maxGated} against the ${MOB_TARGET} target, so lifting ` +
                    `our own mass CLEARS this room and the cause is ours by definition`
                  : ` — the lifted board still laps ${all.maxGated}, and re-walking its worst pair ` +
                    `(${wl.a.x},${wl.a.y}~${wl.b.x},${wl.b.y}: ${wl.din} in / ${wl.dout} out) with the ` +
                    `interior's natural walls lifted as well is what separates "terrain" from "shape"`),
            );
          }
          if (derCause && L.cause !== undefined && L.cause !== mb.cause) {
            bad.push(
              `meta.shell.mobilityBuilt: \`lift.cause\` says ${JSON.stringify(L.cause)} and \`cause\` says ` +
                `${JSON.stringify(mb.cause)} — layer 7 copies one onto the other precisely so a room ` +
                `cannot hold two verdicts about one question, and E16S5 shipped exactly that`,
            );
          }
          // ...and the DECLARATION's copy of the same verdict. The paragraph is
          // what a reader reads; correcting the record and leaving the entry
          // saying something else is the same lie in a quieter place, which is
          // the rule the whole declaration-content block is built on.
          for (const sfm of declared) {
            if (!sfm || normGate(sfm.gate) !== "mobility" || sfm.kind) continue;
            if (derCause && sfm.cause !== undefined && sfm.cause !== mb.cause) {
              bad.push(
                `mobility (as built): the declaration's \`cause\` is ${JSON.stringify(sfm.cause)} and ` +
                  `meta.shell.mobilityBuilt says ${JSON.stringify(mb.cause)} — one room, one verdict`,
              );
            }
            if (derCause && sfm.lift && sfm.lift.cause !== undefined && sfm.lift.cause !== mb.cause) {
              bad.push(
                `mobility (as built): the declaration's \`lift.cause\` is ${JSON.stringify(sfm.lift.cause)} ` +
                  `and meta.shell.mobilityBuilt says ${JSON.stringify(mb.cause)}`,
              );
            }
          }
        }
      }
    }

    // ==================================================================
    // PUBLISHED VS DERIVED — meta.walls.roadRampart, the five-class taxonomy.
    //
    // Zeroing it passed. It is summed by its own producer and was read by
    // nothing, which is the same position `nukeWindow` was in before it turned
    // out to have been wrong in 145 rooms for two rounds. The classes are cheap
    // to re-derive from the shipped structure lists and `meta.shell.cut` /
    // `meta.shell.standDenial`, so they are.
    // ==================================================================
    {
      const rr = plan.meta?.walls?.roadRampart;
      if (rr) {
        const denial = new Set(
          (plan.meta?.shell?.standDenial || [])
            .filter((c) => c && Number.isInteger(c.x))
            .map((c) => key(c.x, c.y)),
        );
        const cutK = new Set(cutPts.map((c) => key(c.x, c.y)));
        const own = new Map();
        for (const t of Object.keys(s)) {
          if (t === "rampart" || t === "road") continue;
          for (const p of s[t] || []) own.set(key(p.x, p.y), t);
        }
        const der = { total: 0, crossing: 0, seat: 0, ring: 0, cover: 0, unclassified: 0 };
        const ringTiles = [];
        const unclassifiedTiles = [];
        for (const r of s.rampart || []) {
          const k = key(r.x, r.y);
          if (!roadSet.has(k)) continue;
          der.total++;
          if (cutK.has(k)) der.crossing++;
          else if (own.get(k) === "container") der.seat++;
          else if (denial.has(k)) {
            der.ring++;
            ringTiles.push(`${r.x},${r.y}`);
          } else if (own.has(k)) der.cover++;
          else {
            der.unclassified++;
            unclassifiedTiles.push(`${r.x},${r.y}`);
          }
        }
        for (const f of ["total", "crossing", "seat", "ring", "cover", "unclassified"]) {
          if (rr[f] !== der[f]) {
            bad.push(`meta.walls.roadRampart: \`${f}\` says ${rr[f]}, re-derived it is ${der[f]}`);
          }
        }
        const sum = der.crossing + der.seat + der.ring + der.cover + der.unclassified;
        if (sum !== der.total) {
          bad.push(
            `meta.walls.roadRampart: the classes sum to ${sum} over a total of ${der.total} — a taxonomy ` +
              `that does not close is a taxonomy with a hidden bucket`,
          );
        }
        const pubRing = (rr.ringTiles || []).map((t) => `${t.x},${t.y}`).sort();
        if (pubRing.join(" ") !== ringTiles.slice().sort().join(" ")) {
          bad.push(
            `meta.walls.roadRampart: \`ringTiles\` is [${pubRing.join(" ")}], re-derived it is ` +
              `[${ringTiles.slice().sort().join(" ")}]`,
          );
        }
        const pubUn = (rr.unclassifiedTiles || []).map((t) => `${t.x},${t.y}`).sort();
        if (pubUn.join(" ") !== unclassifiedTiles.slice().sort().join(" ")) {
          bad.push(
            `meta.walls.roadRampart: \`unclassifiedTiles\` is [${pubUn.join(" ")}], re-derived it is ` +
              `[${unclassifiedTiles.slice().sort().join(" ")}]`,
          );
        }
      }
    }

    // ==================================================================
    // THE PAVED RUN ALONG THE WALL — RE-DERIVED FROM THE BOARD, NOT READ.
    //
    // Stage 5b (layer-walls.mjs) offers every run of consecutive paved cut tiles
    // its interior parallel, takes the swap when the network is measurably no
    // worse, and publishes three things: `alongCutMoved`, `alongCutRefused` and a
    // PAVED RUN note. Until this block, layer-walls.mjs was the producer AND the
    // only reader — `grep alongCut` found it in exactly one file — while the goal
    // document claimed the validator "re-derives the runs on the board the room
    // actually ships". It did not. Deleting E15S1's refusals and its note passed;
    // rewriting the refusals to a demonstrably false reason passed; taking
    // `alongCutMoved` from 0 to 7 passed. A named anti-pattern whose whole record
    // is producer-witnessed is a counter, not a gate.
    //
    // WHAT IS RE-DERIVED HERE. The run ROSTER, from the shipped board and nothing
    // else: a cut tile that carries a road and has a D8 neighbour which is also a
    // paved cut tile. D8 and not D4 — the game is D8 everywhere else in this file
    // (netOK, the exterior flood, the mobility walk), and a diagonal run of two
    // paved wall tiles is the same prepared surface as an orthogonal one. The
    // roster is therefore the BOARD's answer and not the producer's: a room that
    // stops publishing runs does not stop having them.
    //
    // WHAT IS CHECKED AGAINST IT.
    //   COVERAGE     every roster tile carries a per-tile refusal. A run tile
    //                with no refusal is the E12S7/E2S1 silence.
    //   THE FACTS    a refusal that says "no interior parallel exists" enumerates
    //                its neighbours, and every named tile AND its stated reason is
    //                re-checked here against terrain, the shipped exterior flood,
    //                the shipped cut, the shipped structures and the shipped road
    //                set. The enumeration must also COVER all eight neighbours —
    //                which is what makes "no interior parallel exists" a claim
    //                with no hiding place, and is exactly the exhaustive scan a
    //                free-but-unmentioned neighbour fails.
    //   THE NOTE     present iff the board has runs, naming every roster tile and
    //                quoting the moved counter.
    //
    // AND WHAT IS HONESTLY NOT. 5b runs in the MIDDLE of layer 7: the extension
    // reflow, the dead-end prune and the swamp paving all move the board after it.
    // So a refusal of the form "the only interior parallel is X,Y and the swap
    // breaks the network" is a fact about a board that no longer exists, and two
    // of the seven the fleet ships name a tile that is in the exterior flood
    // TODAY (E18S9 45,6, E9S8 18,24) because the inert prune later took a rampart
    // off the wall beside it. Failing those would be failing an honest room for
    // the ordering of the pipeline. What IS immutable about the named tile is
    // checked — it is D8-adjacent to the refused tile, on the buildable board, on
    // walkable terrain and not itself a cut tile — and the network half is left
    // as producer-witnessed rather than pretended to be re-derived. `alongCutMoved`
    // is the same shape of fact and gets the same treatment: bounded against the
    // board and cross-checked against the note, not believed.
    // ==================================================================
    {
      const cutKeyed = new Set(cutPts.map((c) => key(c.x, c.y)));
      const pavedCut = (k) => cutKeyed.has(k) && roadSet.has(k);
      const runs = cutPts.filter(
        (c) => pavedCut(key(c.x, c.y)) && D8.some(([dx, dy]) => pavedCut(key(c.x + dx, c.y + dy))),
      );
      const refusedArr = plan.meta?.walls?.alongCutRefused;
      const moved = plan.meta?.walls?.alongCutMoved;
      const noteTxt = (plan.meta?.notes || []).find(
        (n) => typeof n === "string" && n.startsWith("A PAVED RUN ALONG THE WALL"),
      );
      if (!Array.isArray(refusedArr)) {
        bad.push(
          `meta.walls.alongCutRefused is ${refusedArr === undefined ? "ABSENT" : "not an array"} — stage 5b ` +
            `publishes it unconditionally, and an absent list reads exactly like a room with nothing to refuse`,
        );
      }
      if (typeof moved !== "number" || !Number.isInteger(moved) || moved < 0) {
        bad.push(
          `meta.walls.alongCutMoved is ${JSON.stringify(moved)} — it is a count of swaps taken and must be ` +
            `a non-negative integer`,
        );
      }
      const refusedBy = new Map(
        (Array.isArray(refusedArr) ? refusedArr : [])
          .filter((r) => r && Number.isInteger(r.x) && Number.isInteger(r.y))
          .map((r) => [key(r.x, r.y), String(r.why || "")]),
      );
      /** the six rejection reasons stage 5b can give a neighbour, each re-checkable */
      const claimTrue = (x, y, rest) => {
        const k = key(x, y);
        if (rest.startsWith("is off the buildable board")) return x < 1 || y < 1 || x > 48 || y > 48;
        if (rest.startsWith("is natural wall")) return !walkable(terrain, x, y);
        if (rest.startsWith("is OUTSIDE the wall")) {
          return x >= 0 && y >= 0 && x <= 49 && y <= 49 && !!ext[idx(x, y)];
        }
        if (rest.startsWith("is itself a cut tile")) return cutKeyed.has(k);
        if (rest.startsWith("already carries one of our structures")) return blocked.has(k);
        if (rest.startsWith("is already paved")) return roadSet.has(k);
        return null; // an unknown reason class, reported by the caller
      };
      for (const c of runs) {
        const tk = key(c.x, c.y);
        const why = refusedBy.get(tk);
        if (why === undefined) {
          bad.push(
            `meta.walls.alongCutRefused: this room ships a PAVED RUN tile at ${tk} — a cut tile carrying a ` +
              `road with a D8 neighbour that is also a paved cut tile — and files no refusal for it. A run ` +
              `is a prepared surface laid along the exact line an attacker would want to walk; stage 5b ` +
              `exists to move it one tile inboard, and a run shipped with no record is indistinguishable ` +
              `from a pass that never ran on this room`,
          );
          continue;
        }
        // THE TWO ADMISSIBLE SHAPES, and they are the two stage 5b produces.
        //
        //   A  "no interior parallel exists: <neighbour, why> · ..."
        //      every neighbour was rejected before the swap was ever tried.
        //   C  "every interior parallel breaks the network. moving it to X,Y —
        //      <what the swap costs the network> · moving it to ... . The swap
        //      is offered ... The other neighbours: <neighbour, why> · ..."
        //      one or more neighbours WERE offered the swap and the network came
        //      out worse; the rest were rejected before that.
        //
        // Both are checked the same way: the union of the tiles the refusal
        // speaks about must be all eight neighbours, the rejected ones must be
        // rejected for a reason that is TRUE on this board, and the ones the swap
        // was offered to must be tiles a road could stand on. What is NOT checked
        // is the network arithmetic — 5b runs in the middle of layer 7 and the
        // reflow, the prune and the swamp paving all move the board after it, so
        // "these road tiles fall off" is a fact about a board that no longer
        // exists. Two of the fleet's named targets sit in the exterior flood
        // TODAY for exactly that reason.
        const OTHERS = "The other neighbours: ";
        const tried = [];
        let rejectedBody = null;
        if (why.startsWith("no interior parallel exists: ")) {
          rejectedBody = why.slice("no interior parallel exists: ".length);
        } else if (why.startsWith("every interior parallel breaks the network.")) {
          const cutAt = why.indexOf(OTHERS);
          const head = cutAt >= 0 ? why.slice(0, cutAt) : why;
          rejectedBody = cutAt >= 0 ? why.slice(cutAt + OTHERS.length) : "";
          for (const m of head.matchAll(/moving it to (-?\d+),(-?\d+) —/g)) {
            tried.push({ x: Number(m[1]), y: Number(m[2]) });
          }
          if (!tried.length) {
            bad.push(
              `meta.walls.alongCutRefused ${tk}: the refusal says every interior parallel breaks the ` +
                `network and names none of them. The whole content of that sentence is WHICH tiles were ` +
                `offered the swap`,
            );
          }
        } else {
          bad.push(
            `meta.walls.alongCutRefused ${tk}: the reason is free text in a form this gate cannot check ` +
              `("${why.slice(0, 70)}${why.length > 70 ? "…" : ""}"). Stage 5b gives exactly two answers — ` +
              `"no interior parallel exists: <every neighbour, with why>" or "every interior parallel ` +
              `breaks the network. moving it to X,Y — ... The other neighbours: ..." — and a third answer ` +
              `is a refusal nobody can falsify`,
          );
          continue;
        }
        const named = new Set();
        for (const t of tried) {
          named.add(key(t.x, t.y));
          const problems = [];
          if (Math.max(Math.abs(t.x - c.x), Math.abs(t.y - c.y)) !== 1) {
            problems.push(`it is not D8-adjacent to ${tk}, so it is not a parallel of anything`);
          }
          if (t.x < 1 || t.y < 1 || t.x > 48 || t.y > 48) problems.push(`it is off the buildable board`);
          else if (!walkable(terrain, t.x, t.y)) {
            problems.push(`it is natural wall — no road is ever built there`);
          }
          if (cutKeyed.has(key(t.x, t.y))) {
            problems.push(`it is itself a cut tile, which is the same problem one tile over and never a parallel`);
          }
          if (problems.length) {
            bad.push(
              `meta.walls.alongCutRefused ${tk}: the refusal says the swap was offered to ${t.x},${t.y} and ` +
                `${problems.join("; ")}. The network cost of the swap is a fact about the mid-layer-7 board ` +
                `and is taken as witnessed; the tile it names is a fact about terrain and the shipped wall, ` +
                `and it is not true`,
            );
          }
        }
        for (const part of rejectedBody ? rejectedBody.split(" · ") : []) {
          const m = part.match(/^(-?\d+),(-?\d+) (.*)$/);
          if (!m) {
            bad.push(`meta.walls.alongCutRefused ${tk}: "${part.slice(0, 60)}" names no tile`);
            continue;
          }
          const nx = Number(m[1]),
            ny = Number(m[2]);
          named.add(key(nx, ny));
          if (Math.max(Math.abs(nx - c.x), Math.abs(ny - c.y)) !== 1) {
            bad.push(
              `meta.walls.alongCutRefused ${tk}: the refusal rejects ${nx},${ny}, which is not a neighbour ` +
                `of ${tk} at all`,
            );
            continue;
          }
          const ok = claimTrue(nx, ny, m[3]);
          if (ok === null) {
            bad.push(
              `meta.walls.alongCutRefused ${tk}: "${nx},${ny} ${m[3].slice(0, 50)}" is not one of the six ` +
                `rejection classes stage 5b can produce, so nothing here re-checks it`,
            );
          } else if (!ok) {
            bad.push(
              `meta.walls.alongCutRefused ${tk}: the refusal says "${nx},${ny} ${m[3].slice(0, 60)}" and ` +
                `re-derived on the board this room ships that is FALSE. The claim the whole refusal rests ` +
                `on is that no tile one step inboard could take this road; a named blocking tile that is ` +
                `not blocking is the refusal saying nothing`,
            );
          }
        }
        // ...AND THE ENUMERATION HAS TO BE EXHAUSTIVE. Both shapes make a claim
        // about EVERY neighbour — "none of them is a parallel", or "the ones that
        // were are all worse and here are the rest" — so all eight have to be
        // spoken for or the claim was simply never made about the ones left out.
        // That is exactly how a free interior tile one diagonal step away goes
        // unmentioned: the detector and the search were D4 in a D8 game, and five
        // rooms shipped a run whose refusal reasoned about four neighbours.
        const missing = D8.map(([dx, dy]) => key(c.x + dx, c.y + dy)).filter((k) => !named.has(k));
        if (missing.length) {
          const free = missing.filter((k) => {
            const [fx, fy] = k.split(",").map(Number);
            return (
              fx >= 1 &&
              fy >= 1 &&
              fx <= 48 &&
              fy <= 48 &&
              walkable(terrain, fx, fy) &&
              !ext[idx(fx, fy)] &&
              !cutKeyed.has(k) &&
              !blocked.has(k) &&
              !roadSet.has(k)
            );
          });
          bad.push(
            `meta.walls.alongCutRefused ${tk}: "no interior parallel exists" is a claim about every ` +
              `neighbour and the refusal accounts for ${named.size} of the 8 — ${missing.join(" ")} ` +
              `${missing.length === 1 ? "is" : "are"} not mentioned` +
              (free.length
                ? `, and ${free.join(" ")} ${free.length === 1 ? "is" : "are"} free interior floor a road ` +
                  `could be moved onto right now. The swap was never offered there`
                : ``),
          );
        }
      }
      // THE NOTE, PRESENT EXACTLY WHEN THE BOARD HAS RUNS.
      if (runs.length && !noteTxt) {
        bad.push(
          `this room ships ${runs.length} paved-run cut tile(s) (${runs.map((c) => key(c.x, c.y)).join(" ")}) ` +
            `and publishes no PAVED RUN note. The tower-clump pass declares all six of its unfixable ` +
            `instances; this anti-pattern may not be quieter than that one`,
        );
      } else if (!runs.length && noteTxt) {
        bad.push(
          `this room publishes a PAVED RUN note and the board has no run on it — no cut tile carries a ` +
            `road with a D8 neighbour that is also a paved cut tile. A note about a thing that is not there ` +
            `is the same defect as silence about a thing that is`,
        );
      }
      if (noteTxt) {
        const toks = new Set([...noteTxt.matchAll(/\d+,\d+/g)].map((m) => m[0]));
        const unnamed = runs.map((c) => key(c.x, c.y)).filter((k) => !toks.has(k));
        if (unnamed.length) {
          bad.push(
            `the PAVED RUN note does not name ${unnamed.join(" ")} — the note is what a reader reads, and a ` +
              `roster that is short of the board's own is the same silence one indirection further out`,
          );
        }
        const mq = noteTxt.match(/moved (\d+) tile\(s\)/);
        if (!mq) {
          bad.push(`the PAVED RUN note does not quote the swap count stage 5b took on this room`);
        } else if (typeof moved === "number" && Number(mq[1]) !== moved) {
          bad.push(
            `the PAVED RUN note says stage 5b moved ${mq[1]} tile(s) and meta.walls.alongCutMoved says ` +
              `${moved} — the record and the paragraph are one claim`,
          );
        }
      }
      // ==============================================================
      // ...AND THE SHIPPED-BOARD RUN RECORD, WHICH IS THE SAME CLAIM IN A
      // STRUCTURED FORM AND HAS TO AGREE WITH THE BOARD AND WITH ITSELF.
      //
      // `meta.walls.alongCutRuns` is layer 7's own re-derivation of the roster
      // on the board the room ships: per run tile, the interior parallels that
      // are FREE and the neighbours that are HELD, with the reason. Everything
      // in it is a fact about the finished board — which is exactly why it can
      // be checked here tile for tile, unlike the mid-pass network arithmetic in
      // `alongCutRefused`. A producer publishing both gets no benefit of the
      // doubt from either: the roster must be the board's roster, `free` must be
      // free, `held` must be held, the two together must account for all eight
      // neighbours, and the record must agree with the refusal beside it — a
      // tile with a free parallel owes a network-break refusal, a tile with none
      // owes a "no interior parallel exists".
      // ==============================================================
      const runsPub = plan.meta?.walls?.alongCutRuns;
      if (runs.length && !Array.isArray(runsPub)) {
        bad.push(
          `meta.walls.alongCutRuns is ${runsPub === undefined ? "ABSENT" : "not an array"} on a room whose ` +
            `board carries ${runs.length} paved-run cut tile(s)`,
        );
      } else if (Array.isArray(runsPub)) {
        const pubK = runsPub.filter((r) => r && Number.isInteger(r.x)).map((r) => key(r.x, r.y));
        const derK = runs.map((c) => key(c.x, c.y));
        if (pubK.slice().sort().join(" ") !== derK.slice().sort().join(" ")) {
          bad.push(
            `meta.walls.alongCutRuns publishes [${pubK.join(" ") || "nothing"}] and the board's own D8 run ` +
              `roster is [${derK.join(" ") || "nothing"}] — the record is a re-derivation on the shipped ` +
              `board and this one is about a different board`,
          );
        }
        /** the five held classes layer 7 writes, each a fact about the shipped board */
        const heldTrue = (x, y, rest) => {
          const k = key(x, y);
          if (rest.startsWith("off the buildable board")) return x < 1 || y < 1 || x > 48 || y > 48;
          if (rest.startsWith("natural wall")) return !walkable(terrain, x, y);
          if (rest.startsWith("outside the shipped wall")) {
            return x >= 0 && y >= 0 && x <= 49 && y <= 49 && !!ext[idx(x, y)];
          }
          if (rest.startsWith("is itself a cut tile")) return cutKeyed.has(k);
          if (rest.startsWith("carries a structure that blocks")) return blocked.has(k);
          if (rest.startsWith("already paved")) return roadSet.has(k);
          return null;
        };
        for (const r of runsPub) {
          if (!r || !Number.isInteger(r.x) || !Number.isInteger(r.y)) {
            bad.push(`meta.walls.alongCutRuns: an entry names no tile (${JSON.stringify(r)})`);
            continue;
          }
          const rk2 = key(r.x, r.y);
          const named = new Set();
          for (const f of r.free || []) {
            if (!f || !Number.isInteger(f.x) || !Number.isInteger(f.y)) {
              bad.push(`meta.walls.alongCutRuns ${rk2}: a \`free\` entry names no tile`);
              continue;
            }
            named.add(key(f.x, f.y));
            const problems = [];
            if (Math.max(Math.abs(f.x - r.x), Math.abs(f.y - r.y)) !== 1) problems.push(`it is not a neighbour`);
            if (f.x < 1 || f.y < 1 || f.x > 48 || f.y > 48) problems.push(`it is off the buildable board`);
            else if (!walkable(terrain, f.x, f.y)) problems.push(`it is natural wall`);
            if (ext[idx(f.x, f.y)]) problems.push(`it is OUTSIDE the wall, so moving the road there is not inboard`);
            if (cutKeyed.has(key(f.x, f.y))) problems.push(`it is itself a cut tile`);
            if (blocked.has(key(f.x, f.y))) problems.push(`it carries a structure`);
            if (roadSet.has(key(f.x, f.y))) problems.push(`it is already paved`);
            if (problems.length) {
              bad.push(
                `meta.walls.alongCutRuns ${rk2}: \`free\` lists ${f.x},${f.y} as an interior parallel a road ` +
                  `could move onto, and ${problems.join("; ")}`,
              );
            }
          }
          for (const h of r.held || []) {
            const m = /^(-?\d+),(-?\d+) (.*)$/.exec(String(h));
            if (!m) {
              bad.push(`meta.walls.alongCutRuns ${rk2}: \`held\` entry "${String(h).slice(0, 50)}" names no tile`);
              continue;
            }
            const hx = Number(m[1]),
              hy = Number(m[2]);
            named.add(key(hx, hy));
            if (Math.max(Math.abs(hx - r.x), Math.abs(hy - r.y)) !== 1) {
              bad.push(`meta.walls.alongCutRuns ${rk2}: \`held\` names ${hx},${hy}, which is not a neighbour`);
              continue;
            }
            const ok = heldTrue(hx, hy, m[3]);
            if (ok === null) {
              bad.push(
                `meta.walls.alongCutRuns ${rk2}: "${hx},${hy} ${m[3].slice(0, 40)}" is not one of the classes ` +
                  `this file re-derives, so nothing checks it`,
              );
            } else if (!ok) {
              bad.push(
                `meta.walls.alongCutRuns ${rk2}: \`held\` says "${hx},${hy} ${m[3].slice(0, 40)}" and on the ` +
                  `board this room ships that is FALSE`,
              );
            }
          }
          const gap = D8.map(([dx, dy]) => key(r.x + dx, r.y + dy)).filter((k) => !named.has(k));
          if (gap.length) {
            bad.push(
              `meta.walls.alongCutRuns ${rk2}: \`free\` and \`held\` together account for ${named.size} of ` +
                `the 8 neighbours — ${gap.join(" ")} appear in neither, so the record makes no claim about ` +
                `${gap.length === 1 ? "it" : "them"} at all`,
            );
          }
          // ...AND THE TWO RECORDS ABOUT ONE TILE HAVE TO SAY THE SAME THING —
          // ABOUT THE ONE QUESTION THEY BOTH ANSWER.
          //
          // `alongCutRefused` is written at stage 5b, in the middle of layer 7;
          // `alongCutRuns` is re-derived at the end, on the board that ships.
          // The reflow, the prune and the swamp paving all run in between, so a
          // TILE-FOR-TILE reconciliation of the two is not available and asking
          // for one fails honest rooms: E18S9 offered the swap to 45,6, E9S8 to
          // 18,24 and E2S1 to 25,5, and all three of those are in the exterior
          // flood on the finished board because the inert prune later took a
          // rampart off the wall beside them. A gate that demanded the refusal's
          // targets appear in the shipped record would have failed all three for
          // the ordering of the pipeline, which is the failure direction this
          // file is supposed to be careful about.
          //
          // What the two DO both answer, and may not answer differently, is the
          // yes/no: is there anywhere inboard for this road to go. A room whose
          // shipped board offers a free interior parallel and whose refusal says
          // none exists is a room contradicting itself in public, and that is
          // exactly the M2 defect — the D4 search reported "none" over a
          // neighbour set that was missing half the board.
          const w2 = refusedBy.get(rk2);
          if (typeof w2 === "string") {
            const noneClaim = w2.startsWith("no interior parallel exists");
            const freeN = (r.free || []).length;
            if (noneClaim && freeN) {
              bad.push(
                `meta.walls.alongCutRuns ${rk2}: the record lists ${freeN} free interior parallel(s) — ` +
                  `re-derived on the board this room ships — and the refusal beside it says "no interior ` +
                  `parallel exists". One tile, two published answers, and one of them says the swap was ` +
                  `never offered anywhere`,
              );
            }
            if (!noneClaim && !freeN) {
              bad.push(
                `meta.walls.alongCutRuns ${rk2}: the record lists NO free interior parallel and the refusal ` +
                  `beside it claims the swap was offered to one and broke the network`,
              );
            }
          }
        }
      }
      // ...AND THE MOVED COUNTER, BOUNDED. It cannot be re-derived: a swap that
      // happened leaves the same board as a run that was never there, and the
      // roads it touched are moved again by later passes. What CAN be said from
      // the shipped board is that every swap left a cut tile unpaved with an
      // interior, non-cut road tile beside it — the tile the road went to — so
      // the count of such tiles is an upper bound. Measured on the shipped fleet
      // the worst room uses 27% of its own bound, so this costs an honest
      // producer nothing and refuses a counter invented out of the air.
      // (`roadKind` now also witnesses the swaps tile by tile — see the block
      // below, which pins the same counter to a list rather than to a bound.)
      if (typeof moved === "number" && moved > 0) {
        let bound = 0;
        for (const c of cutPts) {
          if (roadSet.has(key(c.x, c.y))) continue;
          if (
            D8.some(([dx, dy]) => {
              const nk = key(c.x + dx, c.y + dy);
              return roadSet.has(nk) && !cutKeyed.has(nk) && !ext[idx(c.x + dx, c.y + dy)];
            })
          ) {
            bound++;
          }
        }
        if (moved > bound) {
          bad.push(
            `meta.walls.alongCutMoved says stage 5b moved ${moved} paved cut tile(s) onto their interior ` +
              `parallel, and this room's shipped board has only ${bound} cut tile(s) that are unpaved and ` +
              `have an interior non-cut road tile beside them — the shape a taken swap leaves behind. The ` +
              `counter cannot be re-derived exactly (later passes move the same roads again) but it cannot ` +
              `exceed this either`,
          );
        }
      }
    }

    // ==================================================================
    // LAYER 7's PER-TILE ROAD PROVENANCE — the map the caption is composed from.
    //
    // See ROAD_KINDS. The film's layer-7 caption asserted ONE purpose over a
    // layer that bundles six, and the fix is to compose the caption from a
    // per-tile provenance map — which only helps if the map is not itself
    // another unread published field. Three of the seven kinds are re-derivable
    // from the shipped board and are re-derived here; the other four are
    // producer-witnessed and are held to the two things that are checkable
    // anyway: the tile is one this room actually paves, and the kind is in the
    // closed set. There is therefore no unclassified bucket to hide a tile in,
    // which is what "0 unclassified" has to mean to be worth printing.
    // ==================================================================
    {
      const rkMap = plan.meta?.walls?.roadKind;
      if (rkMap && typeof rkMap === "object") {
        const cutKeyed = new Set(cutPts.map((c) => key(c.x, c.y)));
        const moved = plan.meta?.walls?.alongCutMoved;
        const byKind = new Map();
        for (const [k, v] of Object.entries(rkMap)) {
          const m = /^(-?\d+),(-?\d+)$/.exec(k);
          if (!m) {
            bad.push(`meta.walls.roadKind: "${k}" is not a tile key`);
            continue;
          }
          const kind = String(v);
          if (!ROAD_KINDS.has(kind)) {
            bad.push(
              `meta.walls.roadKind ${k}: kind ${JSON.stringify(kind)} is not one of the ` +
                `${ROAD_KINDS.size} layer-7 passes (${[...ROAD_KINDS].join(", ")}). The map is what the ` +
                `film's layer-7 caption is composed from, so a kind nobody defined is a caption nobody wrote`,
            );
            continue;
          }
          if (!roadSet.has(k)) {
            bad.push(
              `meta.walls.roadKind ${k}: provenance "${kind}" for a tile this room does not pave. The map is ` +
                `restricted to shipped tiles; a phantom entry moves the caption's counts for free`,
            );
            continue;
          }
          byKind.set(kind, (byKind.get(kind) || []).concat(k));
        }
        // ---- swampPave: swamp is terrain, so this one is simply true or not.
        for (const k of byKind.get("swampPave") || []) {
          const [sx, sy] = k.split(",").map(Number);
          if (!isSwamp(terrain, sx, sy)) {
            bad.push(
              `meta.walls.roadKind ${k}: classified "swampPave" and the tile is not swamp. The pass exists ` +
                `to pay 5x movement down to 1 on ground the garrison walks often; on plain it bought nothing`,
            );
          }
        }
        // ---- conductBridge: the bridge publishes its own tile list, and the
        // two have to be the same list.
        const bridgeAdded = (plan.meta?.walls?.conductBridge?.added || [])
          .filter((t) => t && Number.isInteger(t.x))
          .map((t) => key(t.x, t.y))
          .sort();
        const bridgeKind = (byKind.get("conductBridge") || []).slice().sort();
        if (bridgeAdded.join(" ") !== bridgeKind.join(" ")) {
          bad.push(
            `meta.walls.roadKind: [${bridgeKind.join(" ") || "nothing"}] carries the "conductBridge" ` +
              `provenance and meta.walls.conductBridge.added is [${bridgeAdded.join(" ") || "nothing"}] — ` +
              `one pass, one list`,
          );
        }
        // ---- alongCutMoved: THE COUNTER, PINNED TO A LIST. `alongCutMoved` was
        // a bare integer nothing could re-derive, and the bound above is only a
        // bound. The provenance map names the tiles, so the counter is now the
        // length of a list of tiles that must each be a road this room ships and
        // must NOT be a cut tile — which is the entire content of the swap: the
        // road came OFF the wall.
        const movedKind = byKind.get("alongCutMoved") || [];
        if (typeof moved === "number" && movedKind.length !== moved) {
          bad.push(
            `meta.walls.roadKind carries ${movedKind.length} tile(s) of "alongCutMoved" provenance and ` +
              `meta.walls.alongCutMoved says ${moved}. The counter used to be a bare integer nothing could ` +
              `check; it is a list now, and the list is what it counts`,
          );
        }
        for (const k of movedKind) {
          if (cutKeyed.has(k)) {
            bad.push(
              `meta.walls.roadKind ${k}: classified "alongCutMoved" and the tile is IN the cut — the swap ` +
                `moves a road off the wall onto the interior parallel, so a moved tile that is still wall ` +
                `is the pass having done nothing`,
            );
          }
        }
      }
    }

    // ==================================================================
    // THE REDUNDANT-CUT REFUSALS, PRICED BY ACTUALLY DELETING THE TILE.
    //
    // The cut this planner ships is a SUPERSET of the tiles that are singly
    // seal-critical, and the claim that makes that honest is "every extra tile
    // carries a named reason". Round 10 retired "a reason exists" as a rule for
    // shortfalls; it survived inside `redundantCut` for two more rounds. All
    // four kept-ring waivers shipped a BYTE-IDENTICAL string asserting the
    // deletion would move "every cut-shaped metric in this room", with no
    // room-specific number in any of them. Re-derived: one of the four had a
    // price of ZERO and two more moved the numbers in the direction opposite to
    // what the sentence implied. The document called them "four refusals,
    // PRICED, on the record". One was priced, and only in the document's prose.
    //
    // So a reason is `{class, tile?, why?, pricedDeltas:{cut, weakestFace,
    // lap}}` and the deltas are re-derived HERE by deleting the rampart and
    // measuring the same three quantities the same way — the reconciled wall
    // (declared cut that still carries a rampart, plus every singly
    // seal-critical rampart), the weakest tower damage over that wall, and the
    // gated defender lap over it. A refusal whose deltas are all zero is not a
    // refusal at all and the room is failed for shipping one.
    // ==================================================================
    {
      const rcRec = plan.meta?.shell?.redundantCut || {};
      const reasons = rcRec.reasons && typeof rcRec.reasons === "object" ? rcRec.reasons : {};
      // ================================================================
      // COVERAGE FIRST — the reasons map is the EXTRA-CUT SET, exactly.
      //
      // The audit that stood here was opt-in twice over: it ran only on the
      // reasons that carried a `pricedDeltas` block, and it never asked which
      // tiles were supposed to be in the map at all. An EMPTY map therefore
      // passed every room in the fleet, which is the same hole as "a reason
      // exists" one level down — a record whose completeness nobody checks is a
      // record the producer fills in when it feels like it.
      //
      // The extra-cut set is re-derived here and never read: the declared cut
      // minus the tiles this file's own single-removal test finds seal-critical
      // (`sealTiles`, derived from terrain and the rampart list a thousand lines
      // up). Those are precisely the tiles that LOOK like double shell to a
      // reader, and the superset claim is only honest if every one of them is
      // spoken for. Missing key = a tile with no reason. Surplus key = a reason
      // for a tile that needs none, which is the padding move the cut itself was
      // caught doing in round 11.
      // ================================================================
      const sealK = new Set(sealTiles.map((t) => t.k));
      const extraCut = [...declaredCut].filter((k) => !sealK.has(k)).sort();
      const reasonKeys = Object.keys(reasons).sort();
      if (extraCut.join(" ") !== reasonKeys.join(" ")) {
        const missing = extraCut.filter((k) => !reasons[k]);
        const surplus = reasonKeys.filter((k) => !extraCut.includes(k));
        bad.push(
          `meta.shell.redundantCut.reasons does not cover the extra cut: this room's declared cut has ` +
            `${extraCut.length} tile(s) that are NOT singly seal-critical (${extraCut.join(" ") || "none"}) ` +
            `and the reasons map holds ${reasonKeys.length} (${reasonKeys.join(" ") || "none"})` +
            (missing.length ? ` — ${missing.join(" ")} carr${missing.length === 1 ? "ies" : "y"} no reason at all` : ``) +
            (surplus.length ? ` — ${surplus.join(" ")} ${surplus.length === 1 ? "is" : "are"} explained and did not need to be` : ``) +
            `. The cut is published as a superset WITH per-tile justification; without the coverage it is ` +
            `just a superset, and an empty reasons map used to pass this gate in every room in the fleet`,
        );
      }
      if (rcRec.tiles !== extraCut.length) {
        bad.push(
          `meta.shell.redundantCut: \`tiles\` says ${JSON.stringify(rcRec.tiles)}, re-derived the cut carries ` +
            `${extraCut.length} tile(s) that are not singly seal-critical`,
        );
      }
      if (rcRec.explained !== reasonKeys.length) {
        bad.push(
          `meta.shell.redundantCut: \`explained\` says ${JSON.stringify(rcRec.explained)} against ` +
            `${reasonKeys.length} reason(s) in the map`,
        );
      }
      // ================================================================
      // ...AND EVERY REASON IS RE-DERIVED, BY CLASS, BY DELETING THE TILE.
      //
      // Forty of the forty-three reasons the fleet ships are unpriced free text
      // — and every one of them is re-derivable, because every one of them is a
      // measurement dressed as a sentence. "Deleting it would put 17,18 outside
      // the wall" is one flood. "The structure at 36,41 would drop from depth 4
      // to 3" is one flood and one distance transform. "The rampart is the only
      // thing between this structure and an attacker" is a depth reading. "The
      // walk region goes from 208 to 203" is two walks. So the free text stops
      // being admissible on its own: the class picks the re-derivation and the
      // re-derivation has to agree with the sentence, numbers included.
      // ================================================================
      const rampAll = new Set((s.rampart || []).map((r) => key(r.x, r.y)));
      /** the exterior flood with one rampart deleted — the single-removal board */
      const extWithout = (tk) => {
        const set1 = new Set(rampartSet);
        set1.delete(tk);
        return exteriorFlood(passable, set1);
      };
      /**
       * The garrison's interior walk region, sized. Transcribed from the
       * producer's `interiorWalk(terrain, rset, ext1, blocked, sitter)`: the
       * blocking set is BUILT_OBSTACLES + the room objects, which is this file's
       * `BLOCKING` WITHOUT the extractor — the two lists differ by that one type
       * and it is worth two tiles in E19S8, i.e. exactly the difference between
       * re-deriving the producer's number and re-deriving a different one.
       */
      const walkBlocked = new Set(objectTiles);
      for (const t of BLOCKING) {
        if (t === "extractor") continue;
        for (const p of s[t] || []) walkBlocked.add(key(p.x, p.y));
      }
      const walkRegion = (rset) => {
        const e = exteriorFlood(passable, rset);
        const seen = new Uint8Array(2500);
        const si = idx(sitter.x, sitter.y);
        seen[si] = 1;
        const q = [si];
        let n = 1;
        for (let qi = 0; qi < q.length; qi++) {
          const i = q[qi],
            x = i % 50,
            y = (i / 50) | 0;
          for (const [dx, dy] of D8) {
            const nx = x + dx,
              ny = y + dy;
            if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
            const ni = idx(nx, ny);
            const nk = key(nx, ny);
            if (seen[ni] || !passable(nx, ny)) continue;
            if (!rset.has(nk) && e[ni]) continue;
            if (walkBlocked.has(nk)) continue;
            seen[ni] = 1;
            n++;
            q.push(ni);
          }
        }
        return { size: n, seen };
      };
      const carriesStructure = (x, y) =>
        Object.keys(s).some(
          (t) => t !== "road" && t !== "rampart" && (s[t] || []).some((p) => p.x === x && p.y === y),
        );
      const pt = (v) => {
        const m = /^(-?\d+),(-?\d+)$/.exec(String(v || ""));
        return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
      };
      for (const [tk, r] of Object.entries(reasons)) {
        if (!r || typeof r !== "object") {
          bad.push(`meta.shell.redundantCut.reasons ${tk}: the reason is ${JSON.stringify(r)}, not a record`);
          continue;
        }
        if (!rampAll.has(tk)) {
          bad.push(
            `meta.shell.redundantCut.reasons ${tk}: a refusal to delete a rampart that this room does not ` +
              `plan on that tile`,
          );
          continue;
        }
        const cls = String(r.class || "");
        const known = CUT_REASON_CLASSES.find((c) => c.is(cls));
        if (!known) {
          bad.push(
            `meta.shell.redundantCut.reasons ${tk}: \`class\` is ${JSON.stringify(cls.slice(0, 70))}, which ` +
              `is not one of the ${CUT_REASON_CLASSES.length} classes this file re-derives ` +
              `(${CUT_REASON_CLASSES.map((c) => c.id).join(", ")}). The refusal channel is a closed enum ` +
              `precisely so a new sentence cannot ship as a new excuse`,
          );
          continue;
        }
        const why = String(r.why || "");
        const [rx, ry] = tk.split(",").map(Number);
        if (known.id === "load-bearing") {
          const held = pt(r.tile);
          if (!held) {
            bad.push(
              `meta.shell.redundantCut.reasons ${tk}: the load-bearing refusal names no tile — the whole ` +
                `claim is that a SPECIFIC piece of interior floor leaves the wall`,
            );
            continue;
          }
          const hi = idx(held.x, held.y);
          const e1 = extWithout(tk);
          if (ext[hi]) {
            bad.push(
              `meta.shell.redundantCut.reasons ${tk}: it claims ${r.tile} is interior floor the wall holds ` +
                `in, and ${r.tile} is in the exterior flood on the board this room ships`,
            );
          } else if (!e1[hi]) {
            bad.push(
              `meta.shell.redundantCut.reasons ${tk}: it claims deleting this rampart would put ${r.tile} ` +
                `outside the wall, and re-flooding with the rampart deleted leaves ${r.tile} INSIDE. The ` +
                `tile is named so the claim is falsifiable, and this one is false`,
            );
          } else if (!walkable(terrain, held.x, held.y)) {
            bad.push(
              `meta.shell.redundantCut.reasons ${tk}: it calls ${r.tile} "interior floor the base walks ` +
                `on" and ${r.tile} is natural wall`,
            );
          }
        } else if (known.id === "depth-promotion") {
          const held = pt(r.tile);
          const m = /depth (\d+) to (\d+)/.exec(why);
          if (!held || !m) {
            bad.push(
              `meta.shell.redundantCut.reasons ${tk}: the depth-promotion refusal must name the structure ` +
                `and quote the depth it drops from and to; it says tile=${JSON.stringify(r.tile)} ` +
                `why=${JSON.stringify(why.slice(0, 60))}`,
            );
            continue;
          }
          const hi = idx(held.x, held.y);
          const d1 = depthFromExterior(extWithout(tk));
          if (!carriesStructure(held.x, held.y)) {
            bad.push(
              `meta.shell.redundantCut.reasons ${tk}: it refuses the deletion to protect "the structure at ` +
                `${r.tile}", and this room builds nothing on ${r.tile}`,
            );
          }
          if (depth[hi] !== Number(m[1]) || d1[hi] !== Number(m[2])) {
            bad.push(
              `meta.shell.redundantCut.reasons ${tk}: it says ${r.tile} would drop from depth ${m[1]} to ` +
                `${m[2]}; re-derived on this room's own board it stands at ${depth[hi]} and deleting the ` +
                `rampart takes it to ${d1[hi]}. Round 8 shipped twelve of these quoting 4->3 over a real ` +
                `4->0, measured before layer 7b had finished moving the wall`,
            );
          } else if (d1[hi] >= DEPTH_SAFE) {
            bad.push(
              `meta.shell.redundantCut.reasons ${tk}: ${r.tile} lands at depth ${d1[hi]} with the rampart ` +
                `deleted, which is not "inside a ranged attacker's reach" — the safe depth is ${DEPTH_SAFE}`,
            );
          }
        } else if (known.id === "personal-cover") {
          const m = /stands at depth (\d+)/.exec(why);
          if (r.tile && `${r.tile}` !== tk) {
            bad.push(
              `meta.shell.redundantCut.reasons ${tk}: a personal-cover refusal is about the structure on ` +
                `THIS tile and it names ${r.tile}`,
            );
          }
          if (!carriesStructure(rx, ry)) {
            bad.push(
              `meta.shell.redundantCut.reasons ${tk}: it says "the structure on this tile" is what the ` +
                `rampart covers, and this room builds nothing on ${tk} — a personal rampart over bare ` +
                `floor covers nobody`,
            );
          }
          const d1 = depthFromExterior(extWithout(tk));
          const before = depth[idx(rx, ry)];
          const after = d1[idx(rx, ry)];
          if (m && before !== Number(m[1])) {
            bad.push(
              `meta.shell.redundantCut.reasons ${tk}: it says the structure stands at depth ${m[1]} and ` +
                `re-derived it stands at ${before}`,
            );
          }
          if (before >= DEPTH_SAFE) {
            bad.push(
              `meta.shell.redundantCut.reasons ${tk}: personal cover is claimed for a structure at depth ` +
                `${before}, at or past the ${DEPTH_SAFE} safe depth — nothing can reach it, so the rampart ` +
                `is not what is keeping it alive`,
            );
          }
          if (after >= before) {
            bad.push(
              `meta.shell.redundantCut.reasons ${tk}: deleting the rampart leaves the covered structure at ` +
                `depth ${after} against ${before} today — the rampart is not "the only thing between it ` +
                `and an attacker", it is not between them at all`,
            );
          }
        } else if (known.id === "walk-region") {
          const set1 = new Set(rampartSet);
          set1.delete(tk);
          const w0 = walkRegion(rampartSet);
          const w1 = walkRegion(set1);
          const m = /from (\d+) tile\(s\) to (\d+)/.exec(why);
          if (m) {
            if (w0.size !== Number(m[1]) || w1.size !== Number(m[2])) {
              bad.push(
                `meta.shell.redundantCut.reasons ${tk}: it says the garrison's walk region goes from ` +
                  `${m[1]} tile(s) to ${m[2]}; re-walked on this room's own board it goes from ${w0.size} ` +
                  `to ${w1.size}`,
              );
            } else if (w0.size - w1.size <= 1 && w1.size <= w0.size) {
              bad.push(
                `meta.shell.redundantCut.reasons ${tk}: the region goes ${w0.size} -> ${w1.size}, a change ` +
                  `of ${w0.size - w1.size} tile(s), which is inside the one-tile budget the refusal is ` +
                  `arguing it exceeds`,
              );
            }
          } else {
            // the other walk-region refusal: the region GAINS floor the garrison
            // could not stand on before. Re-derived by set containment.
            let gained = 0;
            for (let i = 0; i < 2500; i++) if (w1.seen[i] && !w0.seen[i]) gained++;
            if (!gained) {
              bad.push(
                `meta.shell.redundantCut.reasons ${tk}: it claims deleting the rampart opens floor the ` +
                  `garrison could not previously stand on, and re-walked the region gains nothing`,
              );
            }
          }
        } else if (known.id === "stand-denial") {
          // the premise, re-derived: this is the controller's ring, and an
          // attacker really can stand here once the rampart is gone. Deleting one
          // rampart makes exactly one tile floodable, so "he can stand here" is
          // "the tile is D8-adjacent to the exterior" — the producer's own
          // `facesExterior` fast reject, re-applied.
          if (!controller || chebyshev(controller, { x: rx, y: ry }) !== 1) {
            bad.push(
              `meta.shell.redundantCut.reasons ${tk}: it claims the controller's stand-denial ring, and ` +
                `${tk} is ${controller ? `${chebyshev(controller, { x: rx, y: ry })} tiles from` : "in a room with no"} ` +
                `controller — the ring is the eight tiles a claim creep can work from`,
            );
          }
          const faces = D8.some(([dx, dy]) => {
            const nx = rx + dx,
              ny = ry + dy;
            return nx >= 0 && ny >= 0 && nx <= 49 && ny <= 49 && ext[idx(nx, ny)];
          });
          if (!faces) {
            bad.push(
              `meta.shell.redundantCut.reasons ${tk}: it claims an attacker CAN stand here — "this tile is ` +
                `D8-adjacent to the exterior flood" — and re-derived it is not. Twelve ramparts across ten ` +
                `rooms shipped on this keep-class with no stand to deny; the premise is checked, not asserted`,
            );
          }
        } else if (known.id === "promotes-outsider" && !r.pricedDeltas) {
          bad.push(
            `meta.shell.redundantCut.reasons ${tk}: this class ships a \`pricedDeltas\` block and this one ` +
              `has none. The class asserts the deletion PROMOTES another rampart into the seal, which is a ` +
              `claim about three measurable numbers, and the three are what the round-12 audit is; a ` +
              `reason that drops the block drops the only part of itself anything checks`,
          );
        }
      }
      const priced = Object.entries(reasons).filter(([, r]) => r && r.pricedDeltas);
      if (priced.length) {
        const towers = s.tower || [];
        const towerDmg = (t, c) => {
          const r = Math.max(Math.abs(t.x - c.x), Math.abs(t.y - c.y));
          return r <= 5 ? 600 : r >= 20 ? 150 : 600 - (r - 5) * 30;
        };
        const declaredCutPts = (plan.meta?.shell?.cut || []).filter((c) => c && Number.isInteger(c.x));
        const board = (rset) => {
          const e = exteriorFlood(passable, rset);
          if (e[idx(sitter.x, sitter.y)]) return null; // no seal left to price
          // the garrison side, flooded WITHOUT walking the ramparts — the same
          // region `sealCriticalSet` is defined against
          const inside = new Uint8Array(2500);
          if (passable(sitter.x, sitter.y) && !rset.has(key(sitter.x, sitter.y))) {
            const si = idx(sitter.x, sitter.y);
            inside[si] = 1;
            const q = [si];
            for (let qi = 0; qi < q.length; qi++) {
              const i = q[qi],
                x = i % 50,
                y = (i / 50) | 0;
              for (const [dx, dy] of D8) {
                const nx = x + dx,
                  ny = y + dy;
                if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
                const ni = idx(nx, ny);
                if (inside[ni] || !passable(nx, ny) || rset.has(key(nx, ny))) continue;
                inside[ni] = 1;
                q.push(ni);
              }
            }
          }
          const wall = new Map();
          for (const c of declaredCutPts) {
            if (rset.has(key(c.x, c.y))) wall.set(key(c.x, c.y), { x: c.x, y: c.y });
          }
          for (const k of rset) {
            const [rx, ry] = k.split(",").map(Number);
            if (!passable(rx, ry)) continue;
            let tIn = false;
            let tOut = false;
            for (const [dx, dy] of D8) {
              const nx = rx + dx,
                ny = ry + dy;
              if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
              const ni = idx(nx, ny);
              if (inside[ni]) tIn = true;
              else if (e[ni]) tOut = true;
              if (tIn && tOut) break;
            }
            if (tIn && tOut) wall.set(k, { x: rx, y: ry });
          }
          const tiles = [...wall.values()];
          let weakest = null;
          for (const c of tiles) {
            let d = 0;
            for (const t of towers) d += towerDmg(t, c);
            if (weakest === null || d < weakest) weakest = d;
          }
          // the garrison's walk region on this board: ramparts walkable, the
          // exterior never crossed, our own obstacles blocking
          const seen = new Uint8Array(2500);
          {
            const si = idx(sitter.x, sitter.y);
            seen[si] = 1;
            const q = [si];
            for (let qi = 0; qi < q.length; qi++) {
              const i = q[qi],
                x = i % 50,
                y = (i / 50) | 0;
              for (const [dx, dy] of D8) {
                const nx = x + dx,
                  ny = y + dy;
                if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
                const ni = idx(nx, ny);
                const nk = key(nx, ny);
                if (seen[ni] || !passable(nx, ny)) continue;
                if (!rset.has(nk) && e[ni]) continue;
                if (mobBlocked.has(nk)) continue;
                seen[ni] = 1;
                q.push(ni);
              }
            }
          }
          const m = mobilityMetric(tiles, e, seen);
          return { cut: tiles.length, weakestFace: weakest === null ? 0 : weakest, lap: m.sampled ? null : m.maxGated };
        };
        const set0 = new Set((s.rampart || []).map((r) => key(r.x, r.y)));
        const before = board(set0);
        for (const [tk, r] of priced) {
          if (!set0.has(tk)) {
            bad.push(
              `meta.shell.redundantCut.reasons: ${tk} carries a priced refusal and no rampart — a price ` +
                `for deleting a rampart that is not there is not a price`,
            );
            continue;
          }
          const set1 = new Set(set0);
          set1.delete(tk);
          const after = board(set1);
          if (before === null || after === null) continue; // unmeasurable, not a lie
          const d = r.pricedDeltas;
          const cmp = [
            ["cut.before", d.cut?.before, before.cut],
            ["cut.after", d.cut?.after, after.cut],
            ["weakestFace.before", d.weakestFace?.before, before.weakestFace],
            ["weakestFace.after", d.weakestFace?.after, after.weakestFace],
            ["lap.before", d.lap?.before, before.lap],
            ["lap.after", d.lap?.after, after.lap],
          ];
          for (const [f, pub, der] of cmp) {
            if (der === null || der === undefined) continue;
            if (typeof pub !== "number" || !near(pub, der)) {
              bad.push(
                `meta.shell.redundantCut.reasons ${tk}: \`pricedDeltas.${f}\` says ${JSON.stringify(pub)}, ` +
                  `re-derived by deleting the rampart it is ${der}`,
              );
            }
          }
          const moves =
            before.cut !== after.cut ||
            before.weakestFace !== after.weakestFace ||
            (before.lap !== null && after.lap !== null && Math.abs(before.lap - after.lap) > 0.005);
          if (!moves) {
            bad.push(
              `meta.shell.redundantCut.reasons ${tk}: the refusal is priced at ZERO — deleting this ` +
                `rampart leaves the wall at ${before.cut} tiles, the weakest sealing tile at ` +
                `${before.weakestFace} damage and the gated lap at ${before.lap}. A rampart that buys ` +
                `nothing is not refused, it is pruned; "naming a reason is not having one" is this ` +
                `document's own sentence`,
            );
          }
        }
      }
    }

    /** the two walks of one named pair, on the built board */
    const pairWalk = (a, b, blk) => {
      const w = walkFor(blk);
      const din = mobArrive(mobBfs(w, a), b);
      const dout = mobArrive(mobBfs(ext, a), b);
      return {
        din: isFinite(din) ? din : null,
        dout: isFinite(dout) ? dout : null,
      };
    };

    for (const sf of declared) {
      if (!sf || typeof sf !== "object") continue;
      const g = normGate(sf.gate);
      const k = sf.kind ? String(sf.kind) : null;

      // ==================================================================
      // THE PARAGRAPH IS THE RECORD — regenerated here and compared.
      //
      // The round-11 rule was "every audited number must be QUOTED in the
      // prose", implemented as a numeral-presence test over `detail`. A
      // reviewer rewrote E7S5's `covered-detour` paragraph to read "the
      // garrison walks 3 tiles inside where the attacker walks 2 outside — an
      // absolute detour of 1 tile at a ratio of 1.05, comfortably inside the
      // 1.2 target … Nothing is owed here. [audit tokens: 35 2 33 17.5 0 20
      // 91]" — against a real 33-tile detour at 17.5 — and the room passed
      // `1/1 · fail 0`. Every audited numeral was present. In a bracket. At the
      // end. The paragraph a reviewer actually reads asserted the exact
      // opposite of the audit.
      //
      // So free-form paragraphs are over for audited kinds. `declprose.mjs`
      // renders one from the structured record, the producer fills `detail`
      // with it, and this regenerates it from the record THE PLAN PUBLISHES and
      // requires equality up to whitespace. Combined with the field-by-field
      // re-derivation below, the two halves are locked together in both
      // directions: a false paragraph fails here, and a record corrupted to
      // match a false paragraph fails there.
      // ==================================================================
      //
      // ...AND "AUDITED WHERE AUDITABLE" IS OVER. Round 12 held eight of
      // eighteen kinds to identity, and which eight was an accident of which
      // kinds a reviewer had attacked; the other ten shipped 31 hand-written
      // paragraphs whose only relationship to their record was that a producer
      // had once typed both. Four demonstrable lies passed on that gap in a
      // single round. So the `if` below is now an ELSE THAT FAILS: a shipped
      // declaration whose kind has no renderer is a narration channel, and it
      // fails the room that introduces it.
      if (!AUDITED_KINDS.has(declKey(g, k))) {
        bad.push(
          `UNRENDERED DECLARATION KIND \`${declKey(g, k)}\` — this declaration's paragraph is not ` +
            `generated from its record by declprose.mjs, so nothing compares the two and the sentence a ` +
            `human reads can assert anything at all. Write the renderer, register it in RENDERERS, and ` +
            `have the producer set \`detail\` from \`renderDecl(sf)\`; a kind that ships a typed paragraph ` +
            `is a kind whose record is decoration`,
        );
      } else {
        let want = null;
        let renderErr = null;
        try {
          want = renderDecl({ ...sf, detail: undefined });
        } catch (err) {
          renderErr = err && err.message ? err.message : String(err);
        }
        if (renderErr) {
          bad.push(
            `${g}${k ? `/${k}` : ""}: the record cannot be rendered at all (${renderErr}) — a record the ` +
              `shared template throws on is a record missing a field the paragraph is made of`,
          );
        } else if (normText(want) !== normText(sf.detail)) {
          const a = normText(sf.detail);
          const b = normText(want);
          let i = 0;
          while (i < a.length && i < b.length && a[i] === b[i]) i++;
          bad.push(
            `${g}${k ? `/${k}` : ""}: the shipped paragraph is not the paragraph this record generates. ` +
              `They agree for ${i} character(s) and then diverge — shipped: "…${a.slice(Math.max(0, i - 40), i + 90)}…" ` +
              `vs generated: "…${b.slice(Math.max(0, i - 40), i + 90)}…". Declaration prose is generated ` +
              `from the structured record by one shared template that the producer and this file both ` +
              `run, precisely so that the sentence a human reads cannot say something the audited record ` +
              `does not`,
          );
        }
      }

      // ---- mobility/covered-detour: the record's own worst pair ----------
      if (g === "mobility" && k === "covered-detour" && mBuilt) {
        const rec = sf.record || {};
        const t = (sf.tiles || []).filter((p) => p && Number.isInteger(p.x) && Number.isInteger(p.y));
        const what = `mobility/covered-detour`;
        if (t.length !== 2) {
          bad.push(`${what}: names ${t.length} tile(s); this declaration is about ONE pair of cut tiles`);
        } else {
          const pw = pairWalk(t[0], t[1], mobBlocked);
          audit(what, sf, [
            ["din", rec.din, pw.din],
            ["dout", rec.dout, pw.dout],
            ["detour", rec.detour, pw.din === null || pw.dout === null ? null : pw.din - pw.dout],
            [
              "ratio",
              rec.ratio,
              pw.din === null || !pw.dout ? null : Math.round((pw.din / pw.dout) * 100) / 100,
            ],
            ["gatedLap", rec.gatedLap, mBuilt.maxGated],
            ["coveredPairs", rec.coveredPairs, mBuilt.coveredPairs],
            ["pairs", rec.pairs, mBuilt.pairs],
          ]);
          const lf = deriveLift();
          if (lf) audit(what, sf, [["liftedLap", rec.liftedLap, lf.maxGated]]);
        }
      }

      // ---- the room's ONE mobility declaration ---------------------------
      if (g === "mobility" && !k && mBuilt) {
        const what = `mobility (as built)`;
        const mass = sf.mass || {};
        const fr = deriveFree();
        audit(what, sf, [
          ["mass.builtLap", mass.builtLap, mBuilt.maxGated],
          ["mass.bareLap", mass.bareLap, fr ? fr.maxGated : null],
        ]);
        const t = (sf.tiles || []).filter((p) => p && Number.isInteger(p.x) && Number.isInteger(p.y));
        if (t.length === 2) {
          const pw = pairWalk(t[0], t[1], mobBlocked);
          audit(what, sf, [
            ["mass.din", mass.din, pw.din],
            ["mass.dout", mass.dout, pw.dout],
          ]);
          if (fr) {
            const pf = pairWalk(t[0], t[1], mobBlockedFree);
            audit(what, sf, [["mass.bareDin", mass.bareDin, pf.din]]);
          }
        }
        if (sf.lift) {
          const lf = deriveLift();
          if (lf) {
            audit(what, sf, [
              ["lift.liftedLap", sf.lift.liftedLap, lf.maxGated],
              ["lift.liftedOverGated", sf.lift.liftedOverGated, lf.overGated],
              ["lift.liftedGatedPairs", sf.lift.liftedGatedPairs, lf.gatedPairs],
            ]);
            const clears = lf.maxGated <= MOB_TARGET;
            if (sf.lift.clears !== clears) {
              bad.push(
                `${what}: \`lift.clears\` says ${sf.lift.clears} and the lifted board laps ` +
                  `${lf.maxGated} against a ${MOB_TARGET} target`,
              );
            }
          }
        }
        // ...AND THE CAUSE FIELD IS A VERDICT, NOT A LABEL. A room inside the
        // target has no cause: the lift test that produces the verdict is only
        // paid for by rooms that miss, so anything other than "none" there is a
        // pre-mass pair label wearing the verdict's name (E17S3, E7S9).
        if (mBuilt.maxGated <= MOB_TARGET && sf.cause && sf.cause !== "none") {
          bad.push(
            `mobility (as built): \`cause\` is "${sf.cause}" on a room whose gated lap is ` +
              `${mBuilt.maxGated}, inside the ${MOB_TARGET} target. A room that does not miss has no ` +
              `cause; the pair-level label belongs in \`pairCause\``,
          );
        }
        if (mBuilt.maxGated <= MOB_TARGET && sf.lift) {
          bad.push(
            `mobility (as built): carries a \`lift\` record on a room whose gated lap is ` +
              `${mBuilt.maxGated} — the lift test only runs on rooms that miss, so this is a test that ` +
              `did not happen`,
          );
        }
      }

      // ---- towers/weak-battery: the refill walk and the wall it quotes ----
      if (g === "towers" && k === "weak-battery" && batteryDerived) {
        const b = sf.battery || {};
        const what = `towers/weak-battery`;
        audit(what, sf, [
          ["maxRefill", b.maxRefill, batteryDerived.maxRefill],
          ["minShellDmg", b.minShellDmg, batteryDerived.minShellDmg],
          ["cutTiles", b.cutTiles, batteryDerived.cutTiles],
        ]);
        if (Array.isArray(b.refillDists)) {
          const want = batteryDerived.refillDists.slice().sort((x, y) => x - y);
          const got = b.refillDists.slice().sort((x, y) => x - y);
          if (want.length !== got.length || want.some((v, i) => v !== got[i])) {
            bad.push(
              `${what}: \`refillDists\` says [${b.refillDists.join("/")}], the board this room ships ` +
                `walks [${batteryDerived.refillDists.join("/")}]`,
            );
          } else {
            const toks = numsIn(sf.detail);
            for (const v of want) {
              if (!quoted(toks, v)) {
                bad.push(`${what}: the refill walk includes ${v} and the prose never says so`);
                break;
              }
            }
          }
        }
      }

      // ---- towers/clump: the counter, and the tiles it names --------------
      if (g === "towers" && k === "clump") {
        const c = sf.clump || {};
        const what = `towers/clump`;
        const within = (s.tower || []).filter((t) => chebyshev(t, sitter) <= 2);
        audit(what, sf, [
          ["within", c.within, within.length],
          ["total", c.total, (s.tower || []).length],
          ["cheb", c.cheb, 2],
        ]);
        const named = (sf.tiles || []).filter((p) => p && Number.isInteger(p.x));
        for (const p of named) {
          if (!(s.tower || []).some((t) => t.x === p.x && t.y === p.y)) {
            bad.push(`${what}: names ${p.x},${p.y}, which carries no tower`);
          } else if (chebyshev(p, sitter) > 2) {
            bad.push(
              `${what}: names ${p.x},${p.y}, which is chebyshev ${chebyshev(p, sitter)} from the sitter ` +
                `— outside the clump it is declaring`,
            );
          }
        }
      }

      // ---- misc/off-network: is the named tile actually off the network? --
      if (g === "misc" && k === "off-network") {
        const what = `misc/off-network`;
        for (const p of sf.tiles || []) {
          if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y)) continue;
          const tk = key(p.x, p.y);
          if (!(s.container || []).some((c) => c.x === p.x && c.y === p.y)) {
            bad.push(`${what}: names ${p.x},${p.y}, which carries no container`);
            continue;
          }
          if (!mineralSeat.has(tk)) {
            bad.push(
              `${what}: names ${p.x},${p.y}, which is not the mineral seat — this exemption exists for ` +
                `the miner's container and for nothing else`,
            );
            continue;
          }
          let onNet = false;
          for (const [dx, dy] of D8) {
            const nk = key(p.x + dx, p.y + dy);
            if (roadSet.has(nk) || (s.container || []).some((c) => key(c.x, c.y) === nk)) {
              onNet = true;
              break;
            }
          }
          if (onNet) {
            bad.push(
              `${what}: names ${p.x},${p.y} as off the road network, and it has a road or a container ` +
                `on one of its eight neighbours — it IS on the network`,
            );
          }
        }
      }

      // ---- runtime/heavy-search: the two published copies of one number ---
      //
      // NOT RE-DERIVABLE FROM THE BOARD, AND SAID SO. How many complete plans a
      // room composed is a fact about a search that has finished; nothing in the
      // finished plan re-derives it, so a producer that falsifies BOTH copies
      // can silence this obligation and this file cannot catch it. What it can
      // catch — and what actually goes wrong in practice — is the two copies
      // drifting apart, which is how the trigger came to be reading the
      // declaration's own copy of the number it was supposed to be demanding.
      if (g === "runtime" && k === "heavy-search") {
        const pub = plan.meta?.compositions;
        const rec = sf.runtime || {};
        if (pub && typeof pub.total === "number") {
          audit(`runtime/heavy-search`, sf, [
            ["compositions", rec.compositions, pub.total],
            ["seeds", rec.seeds, pub.seeds],
            ["complete", rec.complete, pub.complete],
          ]);
        }
      }

      // ---- eco: the anchor walks and the floor derived from them ----------
      if (g === "eco") {
        const e = sf.eco || {};
        const what = `eco`;
        const w = ecoWalks(terrain, objects, (s.storage || [])[0] || sitter);
        audit(what, sf, [
          ["pathController", e.pathController, w.pc],
          ["pathSourcesSum", e.pathSourcesSum, w.ps],
          ["anchorSpread", e.anchorSpread, w.sepCheb],
          ["anchorWalkSpread", e.anchorWalkSpread, w.sepWalk],
          ["anchorWalkFloor", e.anchorWalkFloor, w.floor],
        ]);
        if (e.anchorFloorBasis && e.anchorFloorBasis !== w.basis) {
          bad.push(
            `${what}: \`anchorFloorBasis\` says "${e.anchorFloorBasis}", re-derived the binding bound is ` +
              `"${w.basis}" (walk floor ${w.walkFloor === null ? "n/a" : w.walkFloor} vs chebyshev floor ` +
              `${w.chebFloor})`,
          );
        }
      }

      // ---- extensions/shallow: the count and the tiles --------------------
      if (g === "extensions" && k === "shallow") {
        const what = `extensions/shallow`;
        const sh = sf.shallowExt || {};
        const shallowExts = (s.extension || []).filter(
          (e) => depth[idx(e.x, e.y)] < DEPTH_SAFE,
        );
        audit(what, sf, [
          ["count", sh.count, shallowExts.length],
          ["total", sh.total, (s.extension || []).length],
        ]);
        for (const p of sf.tiles || []) {
          if (!p || !Number.isInteger(p.x)) continue;
          if (!shallowExts.some((e) => e.x === p.x && e.y === p.y)) {
            bad.push(
              `${what}: names ${p.x},${p.y}, which is not an extension at depth < ${DEPTH_SAFE} on the ` +
                `board this room ships`,
            );
          }
        }
      }
    }

    for (const b of bad) {
      fails.push(
        `DECLARATION CONTENT — ${b}. A declaration is a claim that a room beat the planner, and a claim ` +
          `nobody re-derives is a suppression flag with a paragraph attached.`,
      );
    }

    // ==================================================================
    // ...AND THE OBLIGATIONS. A declaration nobody is REQUIRED to file is a
    // planner convention, not a gate.
    //
    // Deleting E7S5's `mobility/covered-detour` entry — the fleet's worst pair,
    // 33 tiles of detour at ratio 17.5 — left the room passing `1/1 · fail 0`,
    // because `raw` never raises anything on gate "mobility" at all and the
    // declaration is pure narration. The same held for the mobility declaration
    // on the fleet's worst over-target room (lap 9.33) and for a `towers/clump`
    // entry. The set was complete on the day it was checked; nothing kept it so.
    //
    // So the state that DEMANDS a declaration is re-derived here, and a room
    // whose re-derived state demands one and does not carry it fails. These are
    // presence checks — the content audit above is what makes the presence
    // worth having.
    //
    // ------------------------------------------------------------------
    // ...AND THE SET WAS FIVE RULES WIDE AGAINST EIGHTEEN DECLARATION KINDS.
    //
    // That is the round-12 finding, and it is the round-11 finding one level up:
    // the obligations were written for the kinds a reviewer had just attacked,
    // and every kind nobody had attacked was still free narration. Dropping
    // E11S1's `eco` declaration passed. So did dropping E12S5's
    // `ctrlParks/released`, `towerRefill`, `ctrlParks/seats`,
    // `battlements/unreachable`, `labs/lab-haul` and `spawnFan/sector`.
    //
    // Every kind this planner files now has a trigger below, and each trigger is
    // re-derived from terrain and the shipped structures wherever that is
    // possible. Two triggers (`ctrlParks/released`, `runtime/heavy-search`) read
    // a published counter because the fact they are about is a fact about a
    // SEARCH rather than about the board, and they say so in place; one kind
    // (`labs/lab-road-eat`) has no trigger at all and is named in
    // OBLIGATION_EXEMPT with the reason. That completeness claim is no longer a
    // paragraph: the kind inventory of the room's own declarations is checked
    // against OBLIGATION_KINDS immediately below.
    // ------------------------------------------------------------------
    // ==================================================================
    const has = (gate, kind) =>
      decls.some((d) => d.gate === normGate(gate) && (kind === null ? !d.kind : d.kind === kind));
    const owe = [];
    // ------------------------------------------------------------------
    // ...AND THE SET OF TRIGGERS IS AN INVENTORY, NOT A PARAGRAPH.
    //
    // See OBLIGATION_KINDS / OBLIGATION_EXEMPT and assertKindObligations. The
    // triggers below are written one per kind, and until now nothing connected
    // the list of triggers to the list of kinds the fleet actually files — so
    // the completeness claim four comments up ("Every kind this planner files
    // now has a trigger below") was a sentence, and the sentence contradicted
    // the one at the bottom of this block. The kind inventory of the room's own
    // shipped declarations is taken HERE and every kind must be either
    // triggered or NAMED as unre-derivable. A kind in neither list is a
    // narration channel nobody is obliged to use, which is precisely the thing
    // this block exists to abolish, and it fails the room that introduces it.
    for (const d of decls) {
      const slot = `${d.gate}|${d.kind ? String(d.kind) : ""}`;
      if (OBLIGATION_KINDS_N.has(slot) || OBLIGATION_EXEMPT_N.has(slot)) continue;
      fails.push(
        `UNTRIGGERED DECLARATION KIND — this room files a \`${slot}\` declaration and validate.mjs has ` +
          `no obligation trigger for that kind and no named exemption for it either. A declaration kind ` +
          `nothing is obliged to file is free narration: deleting it costs the room nothing, so the ` +
          `channel stops being a gate for that class the moment the class is invented. Either add the ` +
          `trigger to OBLIGATION_KINDS and write it in the block below, or add the kind to ` +
          `OBLIGATION_EXEMPT with the reason no re-derivation from the shipped board exists.`,
      );
    }
    if (mBuilt) {
      if (mBuilt.maxGated > MOB_TARGET && !has("mobility", null)) {
        owe.push(
          `the as-built gated defender lap is ${mBuilt.maxGated}, over the ${MOB_TARGET} target, and the ` +
            `room files no \`mobility\` declaration. An over-target lap shipped in silence is the exact ` +
            `failure the shortfall channel exists for`,
        );
      }
      const cov = mBuilt.worstCovered;
      if (
        cov &&
        cov.detour > MOB_DETOUR_FLOOR &&
        cov.ratio > MOB_TARGET &&
        cov.ratio > mBuilt.maxGated + 1e-9 &&
        !has("mobility", "covered-detour")
      ) {
        owe.push(
          `the RECORD's worst pair (${cov.a.x},${cov.a.y}~${cov.b.x},${cov.b.y}: ${cov.din} in / ` +
            `${cov.dout} out, detour ${cov.detour}, ratio ${cov.ratio}) is worse than the verdict this ` +
            `room publishes (${mBuilt.maxGated}) and coverage excuses it from the gate — so the room ` +
            `owes a \`mobility/covered-detour\` declaration and files none`,
        );
      }
    }
    {
      const shallowExts = (s.extension || []).filter((e) => depth[idx(e.x, e.y)] < DEPTH_SAFE);
      if (shallowExts.length && !has("extensions", "shallow")) {
        owe.push(
          `${shallowExts.length} extension(s) stand at depth < ${DEPTH_SAFE} ` +
            `(${shallowExts.slice(0, 6).map((e) => `${e.x},${e.y}`).join(" ")}${shallowExts.length > 6 ? " …" : ""}), ` +
            `each renting a personal rampart forever, and the room files no \`extensions/shallow\` ` +
            `declaration. Silent capping is the anti-pattern by name`,
        );
      }
    }
    {
      const within = (s.tower || []).filter((t) => chebyshev(t, sitter) <= 2).length;
      if (within >= 5 && !has("towers", "clump")) {
        owe.push(
          `${within} of the ${(s.tower || []).length} towers sit within chebyshev 2 of the sitter — the ` +
            `shape a single nuke is cheapest against — and the room files no \`towers/clump\` declaration`,
        );
      }
    }
    if (batteryDerived) {
      const weakNow =
        batteryDerived.sealMinShellDmg !== null && batteryDerived.sealMinShellDmg < WEAK_SHELL_DMG;
      if ((weakNow || batteryDerived.maxRefill > REFILL_NOTE) && !has("towers", "weak-battery")) {
        owe.push(
          `the battery is legal but poor (weakest sealing tile ${batteryDerived.sealMinShellDmg}, furthest ` +
            `refill walk ${batteryDerived.maxRefill}) and the room files no \`towers/weak-battery\` ` +
            `declaration`,
        );
      }
    }
    if (mineral && (s.extractor || []).length) {
      const seatTiles = [...mineralSeat];
      for (const tk of seatTiles) {
        const [mx, my] = tk.split(",").map(Number);
        let onNet = false;
        for (const [dx, dy] of D8) {
          const nk = key(mx + dx, my + dy);
          if (roadSet.has(nk) || (s.container || []).some((c) => key(c.x, c.y) === nk)) {
            onNet = true;
            break;
          }
        }
        if (!onNet && !mineralOffNetworkDeclared.has(tk)) {
          owe.push(
            `the mineral seat ${mx},${my} has no road and no other container on any of its eight ` +
              `neighbours and the room files no \`misc/off-network\` declaration naming it`,
          );
        }
      }
    }
    // ---- eco. The gates are relative to a fleet median, so the median is
    // measured HERE over every room in the run and never read out of the plan
    // (see `fleet` and the pre-pass in main). A single-room run has no fleet to
    // median, so the absolute half of the gate stands alone and says so.
    {
      const w = ecoWalks(terrain, objects, (s.storage || [])[0] || sitter);
      const ctrlGate = fleet?.ctrlGate ?? ECO_CTRL_ABS;
      const srcGate = fleet?.srcGate ?? ECO_SRC_ABS;
      const overCtrl = w.pc !== null && w.pc > ctrlGate;
      const overSrc = w.ps !== null && w.ps > srcGate;
      if ((overCtrl || overSrc) && !has("eco", null)) {
        owe.push(
          `the hub's eco walks are over the gate — controller ${w.pc} against ${ctrlGate}, source path ` +
            `sum ${w.ps} against ${srcGate}` +
            (fleet ? ` (${ECO_REL_MULT}x the measured fleet medians ${fleet.ctrlMedian}/${fleet.srcMedian}, capped at the absolute ${ECO_CTRL_ABS}/${ECO_SRC_ABS})` : ` (absolute gates; this run planned too few rooms to median a fleet)`) +
            ` — and the room files no \`eco\` declaration. Every upgrader trip and every hauler rotation ` +
            `pays this walk forever; a room that is expensive to run and says nothing is capping in silence`,
        );
      }
    }
    // ---- the tower refill walk, over the hard line rather than the note line.
    // `towers/weak-battery` above covers the NOTE (walk > 8). This is the
    // separate `towerRefill` declaration a room files when it is over the hard
    // MAX_REFILL the tower placement is built around.
    if (batteryDerived && batteryDerived.maxRefill > MAX_REFILL && !has("towerRefill", null)) {
      owe.push(
        `the furthest tower refill walk on the shipped board is ${batteryDerived.maxRefill}, over the ` +
          `hard ${MAX_REFILL} the tower placement is built around, and the room files no \`towerRefill\` ` +
          `declaration`,
      );
    }
    // ---- battlements the garrison cannot reach. `mobilityBuilt.walled` is the
    // same quantity and is re-derived above; this is the obligation on it.
    // EITHER kind is accepted: a room whose cut was unreachable at layer 2 files
    // the kind-less `battlements` entry (the enclosure never had a reachable
    // cut), a room the mass stranded files `battlements/unreachable`. They are
    // different facts about the same tiles and both of them are a declaration.
    if (mBuilt && cutPts.length) {
      const walled = cutPts.length - mBuilt.reachable;
      if (walled > 0 && !has("battlements", "unreachable") && !has("battlements", null)) {
        owe.push(
          `${walled} of this room's ${cutPts.length} cut tile(s) carry a rampart the garrison's own walk ` +
            `region cannot reach — decay paid forever for a tile no defender can hold or repair — and ` +
            `the room files no \`battlements\` declaration of either kind`,
        );
      }
    }
    // ---- a link standing ON the wall. A link is an OBSTACLE_OBJECT_TYPE, so
    // the rampart under it can never be occupied: no defender, no repairer, no
    // battlement. That is a permanent hole in the garrison's line and the room
    // has to say so.
    {
      const cutK = new Set(cutPts.map((c) => key(c.x, c.y)));
      const onCut = (s.link || []).filter((l) => cutK.has(key(l.x, l.y)));
      if (onCut.length && !has("shell", null)) {
        owe.push(
          `${onCut.length} of this room's ${cutPts.length} cut tile(s) carry a link ` +
            `(${onCut.map((l) => `${l.x},${l.y}`).join(" ")}) — a link is an obstacle, so no defender or ` +
            `repairer can ever stand on those ramparts — and the room files no \`shell\` declaration`,
        );
      }
    }
    // ---- a lab inside the ranged band. The diamond is a rigid 4x4 stamp, so
    // this is a real "the room beat me"; it is also a permanent personal rampart
    // and a structure an attacker can grind from outside, which is exactly what
    // the channel is for.
    {
      const shallowLabs = (s.lab || []).filter((l) => depth[idx(l.x, l.y)] < DEPTH_SAFE);
      if (shallowLabs.length && !has("labs", "shallow-lab")) {
        owe.push(
          `${shallowLabs.length} of the ${(s.lab || []).length} labs sit at depth < ${DEPTH_SAFE} ` +
            `(${shallowLabs.map((l) => `${l.x},${l.y}`).join(" ")}) and the room files no ` +
            `\`labs/shallow-lab\` declaration`,
        );
      }
    }
    // ---- the lab diamond's hauler walk. Re-derived as the walk from the hub
    // sitter to the nearest lab over the shipped board, which is what every
    // reagent load pays.
    {
      const labs = s.lab || [];
      if (labs.length) {
        const field = mobBfs(walkFor(new Set(objectTiles)), sitter);
        let best = Infinity;
        for (const l of labs) {
          const d = mobArrive(field, l);
          if (isFinite(d) && d < best) best = d;
        }
        if (isFinite(best) && best >= LAB_HAUL_NOTE && !has("labs", "lab-haul")) {
          owe.push(
            `the lab diamond is ${best} hauler tile(s) from the hub, at or over the ${LAB_HAUL_NOTE} ` +
              `note line, and every reagent load pays it forever — and the room files no ` +
              `\`labs/lab-haul\` declaration`,
          );
        }
      }
    }
    // ---- the spawn fan. Re-derived from the shipped spawn positions and the
    // storage they are measured around, exactly as layer-hub measures it.
    {
      const spawns = s.spawn || [];
      const around = (s.storage || [])[0] || sitter;
      if (spawns.length > 1) {
        const bear = (p) => (Math.atan2(p.y - around.y, p.x - around.x) * 180) / Math.PI;
        let minAngle = 180;
        for (let i = 0; i < spawns.length; i++) {
          for (let j = i + 1; j < spawns.length; j++) {
            let g = Math.abs(bear(spawns[i]) - bear(spawns[j])) % 360;
            if (g > 180) g = 360 - g;
            if (g < minAngle) minAngle = g;
          }
        }
        if (Math.round(minAngle) < SECTOR_TARGET && !has("spawnFan", "sector")) {
          owe.push(
            `the spawn fan's worst pair is ${Math.round(minAngle)}° apart around the hub, under the ` +
              `${SECTOR_TARGET}° sector target — their parking and fill routes overlap — and the room ` +
              `files no \`spawnFan/sector\` declaration`,
          );
        }
      }
    }
    // ---- upgrader seats. The violation half (`ctrlparks|seats` under the hard
    // floor) is raised above and is its own gate; this is the obligation on a
    // room whose seat count is merely THIN — legal, and bad enough that silence
    // is not an option.
    if (ctrlParksBuilt !== null && ctrlParksBuilt <= THIN_PARKS && !has("ctrlParks", "seats")) {
      owe.push(
        `the controller link feeds ${ctrlParksBuilt} parking tile(s) on the board this room ships, at or ` +
          `under the ${THIN_PARKS} thin-seat line, and the room files no \`ctrlParks/seats\` declaration`,
      );
    }
    // ---- parks RELEASED back to the extension mass. This one is not derivable
    // from the shipped board alone — "how many seats layer 1 reserved" is a
    // fact about a search that has finished, and nothing in the finished room
    // records it except the plan. So the trigger reads the two published fields
    // and is honest about doing so: it catches a room that reduced its
    // reservation and did not say so, which is the failure that matters, and it
    // cannot catch a producer that also falsified both fields. The schema gate
    // above is what keeps them from simply being absent.
    {
      const atSearch = plan.meta?.ctrlParksAtSeatSearch;
      const floorNow = plan.meta?.ctrlParkFloor;
      if (
        typeof atSearch === "number" &&
        typeof floorNow === "number" &&
        floorNow < atSearch &&
        !has("ctrlParks", "released")
      ) {
        owe.push(
          `this room holds ${floorNow} of the ${atSearch} parking tile(s) its own seat search counted — ` +
            `${atSearch - floorNow} were released back to the extension mass — and it files no ` +
            `\`ctrlParks/released\` declaration. Giving a seat back is a trade, and an untold trade is a ` +
            `silent cap`,
        );
      }
    }
    // ---- the search that would not settle. Same honesty note as the parks
    // release: how many complete plans a room composed is a fact about the run,
    // not about the board, so the trigger reads the plan's own counter. It is
    // still an obligation — the room may not compose seven plans in silence.
    {
      // READ THE PUBLISHED COUNT, NEVER THE DECLARATION'S OWN COPY. This used to
      // fall back to `meta.shellEscalation.steps` when the declaration was
      // absent, and that field counts one seed's rungs while the declaration is
      // about every composition across every seed — so deleting E12S5's
      // declaration took the trigger from 7 to 1 and the obligation went quiet.
      // The only witness to the number was the thing the check was meant to be
      // able to demand. `meta.compositions` is published unconditionally and is
      // in the schema gate, so it can be neither absent nor invented.
      const composes = plan.meta?.compositions?.total ?? plan.meta?.shellEscalation?.steps ?? 0;
      if (composes > RUNTIME_NOTE_COMPOSES && !has("runtime", "heavy-search")) {
        owe.push(
          `this room composed ${composes} complete plans, over the ${RUNTIME_NOTE_COMPOSES} a single ` +
            `seed's ladder is allowed, and files no \`runtime/heavy-search\` declaration`,
        );
      }
    }
    // ---- NOT RE-DERIVABLE, AND SAID SO IN A LIST RATHER THAN IN A COMMENT.
    //
    // `labs/lab-road-eat` is the one kind with no trigger, and it is now named
    // in OBLIGATION_EXEMPT at the top of this file with the reason, so the
    // inventory check above passes it EXPLICITLY instead of by absence. That
    // matters: an exemption spelled as an absence is indistinguishable from an
    // oversight, which is exactly how six kinds came to be free narration in the
    // first place. The reason itself is unchanged — the diamond's displaced road
    // tiles are deleted from the plan by the time it ships, so the finished board
    // carries no trace of them; the declaration's CONTENT is still audited where
    // it names tiles.
    for (const o of owe) {
      fails.push(
        `UNDECLARED — ${o}. The room's own re-derived state demands a declaration and none is filed; a ` +
          `narration channel nothing is obliged to use is a convention, not a gate.`,
      );
    }
  }

  // ------------------------------------------------------------------
  // THE NUKE WINDOW, RE-DERIVED — because nothing here had ever read it.
  //
  // `meta.towers.nukeWindow` was published for two rounds as "the fullest 5x5
  // window over spawn/storage/terminal/nuker/tower". It was produced by layer 3,
  // which runs before the nuker exists, so the array it summed was empty and the
  // number was the window over spawn/storage/terminal/tower — wrong by exactly
  // +1 in 145 of 172 rooms, with the true fleet worst at 11 (E6S1 36,23 and
  // E6S9 27,30) against a published 10. The reason it survived two rounds is in
  // this file: THE VALIDATOR NEVER READ THE KEY. A published metric no gate
  // re-derives is a metric that rots, and the goal document says exactly that
  // about `meta.shell.cut`.
  //
  // So it is re-derived here from `plan.structures`, on the definition the goal
  // document states — the lab diamond is excluded because a mandated 4x4 stamp
  // cannot be dispersed by definition — and a room whose published field
  // disagrees FAILS. This is a trust check on the producer, like the sitter and
  // `stale-cut` checks above, not a quality bar: a room is allowed a fat window,
  // it is not allowed to publish a thin one.
  // ------------------------------------------------------------------
  {
    const NW_TYPES = ["spawn", "storage", "terminal", "nuker", "tower"];
    const pts = [];
    for (const t of NW_TYPES) for (const p of s[t] || []) pts.push({ x: p.x, y: p.y });
    let mx = 0;
    for (const a of pts) {
      for (let ox = -2; ox <= 2; ox++) {
        for (let oy = -2; oy <= 2; oy++) {
          const cx = a.x + ox,
            cy = a.y + oy;
          if (cx < 0 || cy < 0 || cx > 49 || cy > 49) continue;
          let n = 0;
          for (const b of pts) if (Math.abs(b.x - cx) <= 2 && Math.abs(b.y - cy) <= 2) n++;
          if (n > mx) mx = n;
        }
      }
    }
    const nw = plan.meta?.towers?.nukeWindow;
    if (pts.length) {
      if (!nw || typeof nw.value !== "number") {
        fails.push(
          `NUKE WINDOW UNPUBLISHED — the shipped high-value mass (${NW_TYPES.join("/")}) has a worst 5x5 ` +
            `of ${mx} and meta.towers.nukeWindow carries no re-derivable \`value\`. The field this ` +
            `replaced was measured before the nuker was placed; an unmeasured field is how that happened.`,
        );
      } else if (nw.value !== mx) {
        fails.push(
          `NUKE WINDOW STALE — meta.towers.nukeWindow.value is ${nw.value}, re-derived over the shipped ` +
            `${NW_TYPES.join("/")} it is ${mx}` +
            (nw.counted && nw.counted.join("/") !== NW_TYPES.join("/")
              ? ` (the field says it counted ${nw.counted.join("/")})`
              : ""),
        );
      } else {
        // ...and the two fields must not be confusable: layer 3's own
        // before/after is over a strictly smaller set, so it can never exceed
        // the real window. If it does, one of them is measuring the wrong thing.
        const td = plan.meta?.towers?.towerDispersion;
        if (td && typeof td.after === "number" && td.after > mx) {
          fails.push(
            `TOWER DISPERSION INCONSISTENT — meta.towers.towerDispersion.after is ${td.after} over ` +
              `${(td.counted || []).join("/") || "an unstated set"}, which EXCEEDS the ${mx} measured over ` +
              `the strictly larger ${NW_TYPES.join("/")}. A subset cannot hold more.`,
          );
        }
        // NO NOTE ON SUCCESS. `notes` is the DECLARED-SHORTFALL channel — a note
        // pulls the room into that report and prints every shortfall it carries
        // — so an unconditional "agrees" would put all 172 rooms in a list whose
        // whole value is that it is short. Agreement is the silent case.
      }
    }
  }

  // ------------------------------------------------------------------
  // RUNTIME — a NOTE, never a fail.
  //
  // The planner runs offline, so a slow room costs a developer's patience and
  // nothing in-game; failing the fleet over it would be the wrong shape of
  // rule. But it is not nothing either: past a whole second the escalation
  // ladder is not converging, and the old "~200ms per room" claim in the goal
  // doc was quietly false for the entire fleet before anybody measured it.
  // The pipeline declares these rooms on gate "runtime"; this is the
  // independent check that the number in the plan actually is over the line,
  // and it is reported whether or not the plan remembered to declare it.
  //
  // IT COUNTS COMPOSITIONS, NOT MILLISECONDS. `meta.planMs` was the one field in
  // plans-hub.json that changed on every run — it made the determinism claim
  // uncheckable, so the suite stopped writing it (the raw reading survives in the
  // suite's own console timing report). What is left in the plan is what the
  // planner controls and what actually costs the time: how many complete plans
  // the room composed, on `meta.shellEscalation.steps` for a single seed and on
  // the runtime declaration's own `runtime.compositions` when it walked more.
  // A raw `planMs` from some other producer is still honoured.
  // ------------------------------------------------------------------
  const planMs = plan.meta?.planMs;
  const rtDecl = declared.find((sf) => sf && normGate(sf.gate) === "runtime");
  const composes = rtDecl?.runtime?.compositions ?? plan.meta?.shellEscalation?.steps ?? 0;
  if (typeof planMs === "number" && planMs > RUNTIME_NOTE_MS) {
    notes.push(
      `SLOW ROOM — planMs ${planMs} over the ${RUNTIME_NOTE_MS}ms line` +
        (rtDecl ? " (declared)" : " and NOT declared by the planner"),
    );
  } else if (composes > RUNTIME_NOTE_COMPOSES) {
    notes.push(
      `HEAVY SEARCH — ${composes} complete compositions, over the ${RUNTIME_NOTE_COMPOSES} one seed's ladder ` +
        `costs` + (rtDecl ? " (declared)" : " and NOT declared by the planner"),
    );
  }

  return {
    fails,
    notes,
    declared: declared.length,
    diagOnly,
    extNoRoad,
    roads: (s.road || []).length,
    leaks: leaks.length,
    stranded: stranded.length,
    stack: stack.length,
    onObject: onObject.length,
    shallow: shallow.length,
    shallowTowers: shallowTowers.length,
    engineReject: engineReject.length,
    orphanRoads: orphanRoads.length,
    // one per room, not per tile: a room either can re-seat a claimer or it
    // cannot, and "9 rooms" is the number that means something here.
    ctrlSeatBlocked,
    ctrlSeatUnreachable,
    mineralSeatSealed,
    ctrlParksShort,
    ctrlParksStale,
  };
}

function main() {
  // PLANS_FILE — point the validator at a plan file other than the suite's own
  // output. It exists for MUTATION TESTING: the only way to know a gate still
  // bites is to break a plan on purpose and watch it fail, and doing that by
  // editing out-v2/plans-hub.json in place risks leaving the fleet's real output
  // corrupted. Read-only, one line, no other behaviour changes.
  const f = process.env.PLANS_FILE || path.join(OUT_V2, "plans-hub.json");
  if (!fs.existsSync(f)) {
    console.error("missing", f, "\n  run: node tools/plan-suite/v2/plan.mjs --all-claimable");
    process.exit(2);
  }
  const plans = JSON.parse(fs.readFileSync(f, "utf8")).filter((p) => p && p.room && !p.error);
  const args = process.argv.slice(2);
  const only = args.find((a) => !a.startsWith("--"));
  const list = only ? plans.filter((p) => only.split(",").includes(p.room)) : plans;

  const data = fetchRoomsFromMongo(list.map((p) => p.room));
  const byRoom = new Map(data.map((d) => [d.room, d]));

  // ------------------------------------------------------------------
  // THE FLEET MEDIANS, MEASURED HERE AND NEVER READ OUT OF A PLAN.
  //
  // The eco gates are `min(absolute, 2x the fleet median)`, so the eco
  // OBLIGATION needs a median — and taking it from the producer's own published
  // `fleetMediansMeasured` would make the trigger a function of the thing it is
  // auditing. So it is re-derived: one ring-seeded field per anchor per room,
  // over terrain only, which is the same derivation the eco content audit uses
  // on each room individually. A run of fewer than ECO_MEDIAN_MIN_ROOMS rooms
  // has no fleet to median — one room's opinion is not a median — and the
  // absolute half of the gate stands alone, which the message says out loud.
  // ------------------------------------------------------------------
  const ECO_MEDIAN_MIN_ROOMS = 30;
  let fleet = null;
  if (list.length >= ECO_MEDIAN_MIN_ROOMS) {
    const pcs = [];
    const pss = [];
    for (const p of list) {
      const d = byRoom.get(p.room);
      if (!d) continue;
      const hubTile = (p.structures?.storage || [])[0] || p.sitter || p.hub;
      if (!hubTile) continue;
      const w = ecoWalks(d.terrain, d.objects, hubTile);
      if (w.pc !== null) pcs.push(w.pc);
      if (w.ps !== null) pss.push(w.ps);
    }
    const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : null);
    const ctrlMedian = med(pcs);
    const srcMedian = med(pss);
    if (ctrlMedian !== null && srcMedian !== null) {
      fleet = {
        ctrlMedian,
        srcMedian,
        ctrlGate: Math.min(ECO_CTRL_ABS, ECO_REL_MULT * ctrlMedian),
        srcGate: Math.min(ECO_SRC_ABS, ECO_REL_MULT * srcMedian),
      };
    }
  }

  const rows = [];
  const noteRows = [];
  let pass = 0;
  const agg = {
    diagOnly: 0,
    extNoRoad: 0,
    leaks: 0,
    stranded: 0,
    stack: 0,
    onObject: 0,
    shallow: 0,
    shallowTowers: 0,
    engineReject: 0,
    orphanRoads: 0,
    ctrlSeatBlocked: 0,
    ctrlSeatUnreachable: 0,
    mineralSeatSealed: 0,
    ctrlParksShort: 0,
    ctrlParksStale: 0,
  };
  const roadCounts = [];
  for (const p of list) {
    const d = byRoom.get(p.room);
    if (!d) {
      rows.push([p.room, "no terrain in mongo"]);
      continue;
    }
    const r = checkRoom(p, d.terrain, d.objects, fleet);
    for (const k of Object.keys(agg)) agg[k] += r[k];
    roadCounts.push(r.roads);
    if (r.notes.length) {
      noteRows.push([p.room, r.notes.join(" · "), (p.meta?.shortfalls || []).map((s) => s.detail)]);
    }
    if (r.fails.length) rows.push([p.room, r.fails.join(" · ")]);
    else pass++;
  }

  console.log(`plan v2 validator — ${list.length} rooms`);
  if (rows.length) {
    const w = Math.max(6, ...rows.map((r) => r[0].length));
    console.log("");
    console.log(`${"ROOM".padEnd(w)}  FAILURES`);
    console.log(`${"-".repeat(w)}  ${"-".repeat(60)}`);
    for (const [room, why] of rows) console.log(`${room.padEnd(w)}  ${why}`);
    console.log("");
  }
  // DECLARED SHORTFALLS — loud on purpose. These are rooms the planner lost
  // to and said so; they pass, but nobody gets to not see them.
  if (noteRows.length) {
    console.log("");
    console.log(`!! DECLARED SHORTFALLS — ${noteRows.length} room(s) pass with a note`);
    console.log("-".repeat(78));
    for (const [room, why, details] of noteRows) {
      console.log(`${room}  ${why}`);
      for (const d of details) console.log(`        ${d}`);
    }
    console.log("");
  }
  console.log(
    `pass ${pass}/${list.length} · fail ${rows.length} · declared-shortfall ${noteRows.length} · totals: ` +
      `engine-rejects ${agg.engineReject}, leaks ${agg.leaks}, stacked ${agg.stack}, ` +
      `on-object ${agg.onObject}, shallow ${agg.shallow}, shallow towers ${agg.shallowTowers}, ` +
      `diag-only exts ${agg.diagOnly}, off-road exts ${agg.extNoRoad}, ` +
      `orphan roads ${agg.orphanRoads}, structures off-network ${agg.stranded}, ` +
      // rooms, not tiles — see the note on these four in checkRoom's return
      `controllers sealed in ${agg.ctrlSeatBlocked}, seats unreachable ${agg.ctrlSeatUnreachable}, ` +
      `minerals entombed ${agg.mineralSeatSealed}, ` +
      `ctrlParks under floor ${agg.ctrlParksShort}, ctrlParks stale ${agg.ctrlParksStale}`,
  );
  if (roadCounts.length) {
    const rc = roadCounts.slice().sort((a, b) => a - b);
    const q = (f) => rc[Math.min(rc.length - 1, Math.floor(rc.length * f))];
    const total = rc.reduce((s, v) => s + v, 0);
    console.log(
      `roads per room: median ${rc[rc.length >> 1]} · mean ${(total / rc.length).toFixed(1)} · ` +
        `min ${rc[0]} · p25 ${q(0.25)} · p75 ${q(0.75)} · p90 ${q(0.9)} · max ${rc[rc.length - 1]}`,
    );
  }
  process.exit(rows.length ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("validate.mjs")) main();
