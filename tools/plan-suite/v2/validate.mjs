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
// ...and the two OTHER prose channels, now that they are generated too. Round
// 13 closed declaration paragraphs by making the producer and this file run ONE
// template; round 16 does the same for the planner NOTES (the channel the
// gallery and the film ticker read) and for `satAcrossPrior.basis` (the
// sentence that says which of two boards each reading is on). A renderer this
// file imports is a renderer this file can re-run: the gate is string equality,
// not a regex over prose somebody typed.
import { NOTE_CLASSES, renderNote } from "./declprose-notes.mjs";
import { renderSatBasis } from "./declprose-towers.mjs";

const idx = (x, y) => x + y * 50;

// structures that must never be reachable by an enemy creep, and must be
// serviceable by a hauler (i.e. touch the road network)
/**
 * ...AND THE EXTRACTOR IS IN THIS LIST NOW.
 *
 * It was not, and its absence was the whole exemption: the road gate iterates
 * OWNED, so a structure the enumeration omits is never asked whether a hauler
 * can reach it. Re-derived over the shipped road+container network, 133 of the
 * fleet's 172 extractors are OFF that network and not one of them was named by
 * any declaration. That is criticism 11 verbatim — AN EXEMPTION THAT LIVES ONLY
 * IN THE CHECKER IS NOT AN EXEMPTION — one structure over from the mineral
 * container it was written about, and quieter, because an omission from a list
 * reads as an oversight where a hardcoded `continue` reads as a decision.
 *
 * The decision is still right: the extractor is a fixed structure on the mineral
 * that nothing hauls to (the miner stands on the seat beside it), so paving to
 * it buys nothing and pays decay forever. It is right, and it is the PLAN's to
 * make — so it is declared, on the same `misc/off-network` channel and by the
 * same rule as the seat: name the tile, and the exemption reads the declaration.
 */
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
  "extractor",
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
 * ...and the second transcription block, added in round 14 for the same reason
 * as the first: every one of these appears VERBATIM in a declaration record, so
 * a record leaf carrying it is re-derivable by comparison with the producer's
 * own constant, and the constant belongs where a reader can check the two
 * against each other rather than at the call site.
 *   CLUMP_NOTE          layer-towers.mjs — towers inside chebyshev 2 that declare
 *   TOWER_TARGET_MIN    layer-towers.mjs — the hard damage floor a wall face owes
 *   MOB_MASS_*_PCT      layer-walls.mjs — the two mass-share bands the paragraph
 *                       selects its "primary cause" clause with
 *   LAB_FLEET_*         layer-labs.mjs — the fleet lines the lab haul is read against
 *   SHALLOW_LAB_COST /  layer-labs.mjs — the per-unit weights in the anchor score
 *   ROAD_EAT_COST       (NOT the totals `meta.labs` publishes under the same names)
 *   PARK_PROTECT        shared.mjs — the cap on seats layer 1 may reserve
 *   SPAWN_*             layer-hub.mjs — the spawn fan's sector geometry
 */
const CLUMP_NOTE = 5;
const TOWER_TARGET_MIN = 1200;
const MOB_MASS_SHARE_PCT = 30;
const MOB_MASS_MINOR_PCT = 10;
const LAB_FLEET_MEDIAN = 2;
const LAB_FLEET_P90 = 4;
const SHALLOW_LAB_COST = 3;
const ROAD_EAT_COST = 2;
const PARK_PROTECT = 8;
const SPAWN_SECTOR_WEIGHT = 0.4;
const SPAWN_SECTOR_BINS = 12;
const SPAWN_WALK_CAP = 5;
/**
 * ...and the third, added in round 17 for the census anchor. `MAX_CANDS` is
 * layer 3's own 2x2 thinning cap on the tower seat list, and `N_TOWERS` is the
 * RCL8 battery. Both appear in the arithmetic of every tower search census this
 * file now bounds against the board (see `towers/census-anchor`), so both are
 * transcribed where a reader can check them against `layer-towers.mjs`.
 */
const MAX_CANDS = 260;
const N_TOWERS = 6;
/**
 * Every structure kind that can stand on a tile — the inventory a seat is
 * called FREE against (round 17, F4). It is the producer's own `counted` list,
 * transcribed, and the record's copy of it is checked against this one: "free"
 * has to mean free, not free of the kinds someone remembered to look for.
 * Roads and ramparts are absent on purpose — both share a tile with anything.
 */
const SAT_SEAT_KINDS = [
  "spawn",
  "extension",
  "link",
  "storage",
  "terminal",
  "tower",
  "observer",
  "lab",
  "nuker",
  "factory",
  "powerSpawn",
  "container",
  "extractor",
];
/** layer-hub.mjs — the core is the first CORE_SIZE tiles of the chosen basin */
const CORE_SIZE = 30;
/**
 * layer-shell.mjs — the deep-tile floor the RCL8 program needs, and the two
 * numbers it is made of. `budgetPass` is `deepTiles >= NEED_DEEP` and was read
 * by nothing until round 17 (O4).
 */
const PROGRAM_TILES = 78;
const CORRIDOR_OVERHEAD = 45;
const NEED_DEEP = PROGRAM_TILES + CORRIDOR_OVERHEAD;
/** the engine's rampart upkeep, energy per tick per rampart */
const RAMPART_UPKEEP = 0.03;

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
// ---- layer 2's escalation-ladder constants, published on every mobility
// record and identical in all 57 of them. They are the ladder's own prices, so
// this file owns them the way it owns MOB_TARGET: a record that quotes a
// different ladder is quoting a ladder that did not run.
// ...and layer 3's and layer 7b's, on the same footing. Every one of them is a
// number this file's own gates already reason with, published on a record and
// identical in every room that publishes it; a record quoting a different knob
// is a record of a pass that did not run here.
const TOWER_TIEBREAK_BUDGET = 30;
const TOWER_ESC_ROUNDS = 6;
const TOWER_ESC_PAIR_K = 6;
/**
 * ...and the escalation loop's OWN two, which are different numbers from the
 * two above and were held to nothing (round 17, F3: a coordinated edit of the
 * record and its mirror moved `towers.search.pairK` and `.restarts` freely in
 * all 15 rooms that ship the census). `layer-towers.mjs` names them
 * `ESC_PAIR_K` and `ESC_RESTARTS`; both are constants of the producer, so the
 * record's copy of them is re-derivable by comparison rather than witnessed.
 */
const TOWER_ESC_SEARCH_PAIR_K = 12;
const TOWER_ESC_RESTARTS = 12;
/** the buildable band a room's interior scans run over: 48 x 48, never anything else */
const BUILDABLE_BAND_TILES = 48 * 48;
/** layer 2 keeps every enclosure within this many ramparts of the cheapest cut it admits */
const SHELL_TIEBREAK_RAMPARTS = 2;
const MOB_LADDER_BUY_FLOOR = 2;
const MOB_LADDER_CAP = 12;
const MOB_LADDER_PER_RATIO = 3;
const MOB_MATERIAL_LAP = 0.25;
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
  // ...AND THE TWO ANCHORS EACH SPREAD IS BETWEEN, NAMED. The declaration
  // prints them ("the widest separation is 27 tiles: controller 9,34 and source
  // 1 36,29"), and a pair of tile names is a claim about the room like any
  // other — it was the one part of the eco record nothing re-derived, and it is
  // the half a reader uses to check the number beside it.
  const anchorName = (i) => (controller && i === 0 ? "controller" : `source ${i + (controller ? 0 : 1)}`);
  const pairLabel = (i, j) =>
    `${anchorName(i)} ${anchors[i].x},${anchors[i].y} and ${anchorName(j)} ${anchors[j].x},${anchors[j].y}`;
  let sepWalk = null;
  let walkPair = "";
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      let best = null;
      for (let t = 0; t < 2500; t++) {
        const a = fields[i][t],
          b = fields[j][t];
        if (a >= 30000 || b >= 30000) continue;
        if (best === null || a + b < best) best = a + b;
      }
      if (best !== null && (sepWalk === null || best > sepWalk)) {
        sepWalk = best;
        walkPair = pairLabel(i, j);
      }
    }
  }
  let sepCheb = 0;
  let spreadPair = "";
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      const d = chebyshev(anchors[i], anchors[j]);
      if (d > sepCheb) {
        sepCheb = d;
        spreadPair = pairLabel(i, j);
      }
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
    spreadPair,
    walkPair,
    chebFloor,
    walkFloor,
    floor: useWalk ? walkFloor : chebFloor,
    basis: useWalk ? "walk" : "chebyshev",
  };
}

/**
 * ==========================================================================
 * `negotiated.detail` — LAYER 2's OWN PARAGRAPH, PARSED AND COMPARED.
 * ==========================================================================
 * Round 13 made every declaration's paragraph GENERATED from its record, and
 * round 14 made the record's leaves re-derived or bounded. This one field
 * survived both: a paragraph layer 2 wrote by hand, stored INSIDE the record,
 * and quoted verbatim into the generated declaration ("… it is the evidence the
 * enclosure was bought on. Verbatim: \"…\""). All 57 mobility declarations
 * carry one. The inventory classed it W with no bound at all, so replacing
 * E11S2's with the opposite claim —
 *
 *   "defender mobility max 0.42 … this room is COMFORTABLY INSIDE the target on
 *    every pair, the garrison out-walks the attacker everywhere on the wall"
 *
 * — passed 172/172, four words before the generated sentence "the negotiated
 * lap of 1.56 reads 1.5 … which agrees with it to within 0.25 of a lap".
 *
 * IT IS NOT RE-DERIVED AND IT SHOULD NOT BE. The enclosure really was bought on
 * layer 2's board, that board is gone, and a record rewritten to agree with the
 * outcome is not a record. What IS checkable is that the paragraph agrees with
 * THE LEAVES PUBLISHED BESIDE IT and with ITSELF. Layer 2's template is fixed —
 * the whole fleet renders five skeletons — so every clause is anchored, pulled
 * out, and compared:
 *
 *   · the lap, the detour floor, the target, the ungated maximum, the
 *     exact/sampled flag, the reachable endpoint count and the stand-to-stand
 *     maximum are compared against `lap`, `metric.detourFloor`, MOB_TARGET,
 *     `metric.maxUngated`, `metric.exact`, `metric.reachable`,
 *     `metric.maxStrict`;
 *   · the worst pair named at the top is compared against `negotiated.tiles`
 *     AND against the pair named again in the closing clause;
 *   · the cause word is compared against `negotiated.cause`;
 *   · and the paragraph's own arithmetic has to close: the detour is the two
 *     walks subtracted, the ratio is them divided, the "longest extra walk" is
 *     the same subtraction, and the two over-target fractions are fractions.
 *
 * AND THE RESIDUE IS THE POINT. After every clause has consumed its numerals,
 * ANY numeral left over fails the room. That is what makes this a parse rather
 * than a spot-check: a paragraph may quote its own record and the arithmetic of
 * its own sentences, and a number from anywhere else has no way in.
 */
/**
 * ==========================================================================
 * M2. THE NEGOTIATION PARAGRAPH IS REGENERATED, NOT PARSED.
 * ==========================================================================
 * The residue parser below is a good parser and it was the wrong instrument.
 * Its numeral scanner is `/(?<![A-Za-z0-9.])\d+(?:\.\d+)?/g` — ASCII, no `/u`
 * — so seven of nine mutations walked past it in one sitting:
 *
 *   - a NUMERAL-FREE reversal ("COMFORTABLY INSIDE the target on every pair"),
 *     which is round 15's landed exploit with its digits removed
 *   - the same claim in number-WORDS ("nine inside against fourteen")
 *   - FULLWIDTH (０.４２) and ARABIC-INDIC (٠.٤٢) digits, which `\d` without
 *     the unicode flag does not see
 *   - roman numerals
 *   - numerals GLUED to a letter (`readsx1`) and numerals preceded by a DOT
 *     (`.42`), both eaten by the lookbehind
 *
 * Every one of those is the same defect: a residue rule can only refuse
 * numbers it can SEE, and prose is not made of numbers. The parse also cannot
 * refuse a sentence that quotes the record correctly and MEANS the opposite.
 *
 * And it was never necessary. Layer 2's paragraph is a template over leaves the
 * record already publishes — the round-15 pass put all thirty-three of them
 * there for exactly this reason — so it is BYTE-EXACTLY reconstructible, and
 * all 57 of the fleet's records rebuild character for character. So the gate is
 * the gate every other prose channel in this artifact now has: render it from
 * the record and require equality. Unicode, number-words, glued digits and
 * reversed meaning all die together, because none of them can be GENERATED.
 *
 * The residue parser is KEPT below and still runs. It is a second opinion now,
 * and it is the one that survives if the renderer is ever changed to agree with
 * a corrupted record.
 */
function renderNegotiated(neg) {
  const m = neg.metric || {};
  const w = neg.walk || {};
  const cw = neg.causeWalks || {};
  const wd = neg.worstDetour;
  const t2 = neg.tiles;
  const need = [
    ["metric.maxGated", m.maxGated],
    ["metric.detourFloor", m.detourFloor],
    ["metric.target", m.target],
    ["metric.maxUngated", m.maxUngated],
    ["metric.exact", m.exact],
    ["metric.endpoints", m.endpoints],
    ["metric.maxStrict", m.maxStrict],
    ["walk.din", w.din],
    ["walk.dout", w.dout],
    ["cause", neg.cause],
    ["floor", neg.floor],
    ["candidates", neg.candidates],
    ["tiebreakBudget", neg.tiebreakBudget],
    ["metric.overGated", m.overGated],
    ["metric.gatedPairs", m.gatedPairs],
    ["metric.over", m.over],
    ["metric.pairs", m.pairs],
    ["metric.p90", m.p90],
    ["metric.maxDetour", m.maxDetour],
  ];
  for (const [n2, v] of need) {
    if (v === undefined || v === null) throw new Error(`negotiated.${n2} is ${JSON.stringify(v)}`);
  }
  if (!Array.isArray(t2) || t2.length !== 2 || !Number.isInteger(t2[0]?.x) || !Number.isInteger(t2[1]?.x)) {
    throw new Error("negotiated.tiles is not a pair of tiles");
  }
  const dout = w.dout;
  /** layer 2's own `verdictOf`, from the leaves that record what it printed */
  const verdictOf = (leaf) => {
    if (!leaf || leaf.d === null || leaf.d === undefined) return "does not connect at all";
    const d = leaf.d;
    const detour = d - dout;
    const ratio = leaf.ratio;
    return detour <= 0
      ? `${d} against the attacker's ${dout} — SHORTER than the attacker's own lap, so it CLEARS ` +
          `the gate outright`
      : detour <= m.detourFloor
        ? `${d} against the attacker's ${dout} — a ${detour}-tile detour, inside the ` +
            `${m.detourFloor}-tile floor, so it CLEARS the gate`
        : ratio <= m.target
          ? `${d} against the attacker's ${dout} — ratio ${ratio}, inside the ${m.target} ` +
              `target, so it CLEARS the gate`
          : `${d} against the attacker's ${dout} — a ${detour}-tile detour at ratio ${ratio}, ` +
              `which is STILL OVER the ${m.target} target`;
  };
  const why = {
    terrain:
      `a natural wall inside the enclosure forces the detour — with interior walls ignored the same ` +
      `walk is ${verdictOf(cw.noWalls)}. The length is therefore the basin's shape and not the mass ` +
      `inside it (with structures removed alone it is ${verdictOf(cw.noStructures)}); the room is a ` +
      `ring around a mountain`,
    shape:
      `the enclosure is concave here and the attacker is cutting across a bay the defender must walk ` +
      `around — with structures removed the walk is ${verdictOf(cw.noStructures)} and with interior ` +
      `walls removed as well it is ${verdictOf(cw.noWalls)}, so it is the outline of this cut, not ` +
      `its contents`,
    structures:
      `the planner's own mass is in the way — with structures removed the same walk is ` +
      `${verdictOf(cw.noStructures)}. The shell does not own the extension/road layers, so this one ` +
      `is a lead for them, not a shell miss`,
  }[String(neg.cause)];
  if (why === undefined) throw new Error(`negotiated.cause is ${JSON.stringify(neg.cause)}, not one of terrain/shape/structures`);
  const eco = neg.eco;
  return (
    `defender mobility max ${m.maxGated} over pairs that cost more than ` +
    `${m.detourFloor} tiles of detour (target ${m.target}; the ungated maximum over ` +
    `every pair including two-tile ones is ${m.maxUngated}, ` +
    `${m.exact ? `exact all-pairs over ${m.endpoints}` : `SAMPLED over ${m.endpoints}/${m.reachable}`} ` +
    `reachable wall tiles; stand-to-stand it is ${m.maxStrict}): between wall tiles ${t2[0].x},${t2[0].y} ` +
    `and ${t2[1].x},${t2[1].y} the defender walks ${w.din} inside while the attacker walks ${dout} outside. ` +
    `Cause: ${neg.cause} — ${why}. Measured floor ${neg.floor} over ${neg.candidates} ` +
    `enclosure(s) within +${neg.tiebreakBudget} ramparts of the cheapest cut this room admits` +
    (eco
      ? `; the negotiation reached ${neg.floor} before the eco enclosures were bid in, but the ` +
        `bare enclosure held only ${eco.bareDeep} deep tiles against a floor of ${eco.needDeep} — too little ` +
        `to refuse a lobe that brings interior with it (the room ends up with ${eco.deepTiles}), so it was ` +
        `bought and the lap grew by ${eco.ecoCost}`
      : "") +
    `. ${m.overGated}/${m.gatedPairs} wall pairs with a real detour exceed the target ` +
    `(${m.over}/${m.pairs} on the ungated reading, p90 ${m.p90}); ` +
    `the longest extra walk anywhere on this wall is ${m.maxDetour} tile(s)` +
    (wd
      ? ` (${wd.a.x},${wd.a.y} to ${wd.b.x},` +
        `${wd.b.y}: ${wd.din} in / ${wd.dout} out, ` +
        `ratio ${wd.ratio})`
      : "") +
    `.`
  );
}

function negotiatedDetailFaults(neg) {
  const out = [];
  if (!neg || typeof neg !== "object") return out;
  const t = neg.detail;
  if (typeof t !== "string" || !t.trim()) return out;
  // ---- M2: THE PARAGRAPH IS THE RECORD, character for character ----------
  // See the renderNegotiated header. This runs FIRST because it is the check
  // that subsumes the parse below: a paragraph that is not the one these leaves
  // generate cannot be repaired by quoting them correctly somewhere else.
  {
    let want = null;
    let err2 = null;
    try {
      want = renderNegotiated(neg);
    } catch (e2) {
      err2 = e2 && e2.message ? e2.message : String(e2);
    }
    if (err2) {
      out.push(
        `\`negotiated\` cannot be re-rendered into its own paragraph (${err2}) — layer 2's sentence is a ` +
          `template over the leaves beside it and a record that will not render is missing one of them`,
      );
    } else if (normText(want) !== normText(t)) {
      const a2 = normText(t);
      const b2 = normText(want);
      let ci = 0;
      while (ci < a2.length && ci < b2.length && a2[ci] === b2[ci]) ci++;
      out.push(
        `\`negotiated.detail\` is not the paragraph its own leaves generate. They agree for ${ci} ` +
          `character(s) and then diverge — shipped: "…${a2.slice(Math.max(0, ci - 40), ci + 90)}…" vs ` +
          `generated: "…${b2.slice(Math.max(0, ci - 40), ci + 90)}…". This paragraph is quoted VERBATIM ` +
          `into the room's declaration; the residue parser below could only refuse numerals it could see, ` +
          `so a numeral-free reversal, number-words, fullwidth and Arabic-Indic digits, roman numerals, ` +
          `glued numerals and leading-dot numerals all walked through it. A generated sentence cannot say ` +
          `something its record does not`,
      );
    }
  }
  const m = neg.metric || {};
  const w = neg.walk || {};
  const cw = neg.causeWalks || {};
  const wd = neg.worstDetour || {};
  const N = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

  // EVERY NUMERAL IN THE PARAGRAPH, WITH ITS OFFSET. Consumption is by offset,
  // not by value, so a number that appears twice has to be accounted for twice.
  // The lookbehind matters: the paragraph contains the LABEL `p90`, and an
  // engine blocked at the `9` will happily start again at the `0`.
  const spans = [];
  for (const mm of t.matchAll(/(?<![A-Za-z0-9.])\d+(?:\.\d+)?/g)) spans.push({ i: mm.index, s: mm[0], used: false });
  const consume = (start, end) => {
    for (const sp of spans) if (sp.i >= start && sp.i < end) sp.used = true;
  };

  /** run one anchored clause: consume its numerals and compare its captures */
  const clause = (re, cmp, required) => {
    const mm = t.match(re);
    if (!mm) {
      if (required) {
        out.push(
          `\`negotiated.detail\` does not contain layer 2's own "${required}" clause. The paragraph is ` +
            `quoted VERBATIM into this room's declaration, so a paragraph that is not layer 2's is a ` +
            `sentence a reader reads and nothing checks`,
        );
      }
      return false;
    }
    consume(mm.index, mm.index + mm[0].length);
    const why = cmp(mm.slice(1).map((x) => (x === undefined ? null : x)));
    if (why) out.push(`\`negotiated.detail\` ${why}`);
    return true;
  };

  /** the paragraph quotes a number; the record publishes it; they are one number */
  const eq = (label, got, want) => {
    const a = Number(got);
    const b = N(want);
    if (b === null || !Number.isFinite(a)) return null;
    return Math.abs(a - b) < 0.011 ? null : `says ${label} ${got} and the leaf \`${label}\` says ${b}`;
  };
  const first = (...xs) => xs.find((x) => x) || null;
  const pairEq = (label, [ax, ay, bx, by], pa, pb) => {
    if (!pa || !pb || !Number.isInteger(pa.x) || !Number.isInteger(pb.x)) return null;
    const got = `${ax},${ay}~${bx},${by}`;
    const want = `${pa.x},${pa.y}~${pb.x},${pb.y}`;
    return got === want ? null : `names ${label} ${got} and the record's own ${label} is ${want}`;
  };

  // ---- the opening clause: the whole verdict, in one sentence -------------
  clause(
    /defender mobility max (-?[\d.]+) over pairs that cost more than (\d+) tiles? of detour \(target ([\d.]+); the ungated maximum over every pair including two-tile ones is (-?[\d.]+), (?:(exact) all-pairs over (\d+) reachable wall tiles|SAMPLED over (\d+)\/(\d+))(?:; stand-to-stand it is (-?[\d.]+))?\)/,
    ([lap, floor, target, ung, exact, reach, sampReach, sampEnd, strict]) =>
      first(
        eq("negotiated.metric.maxGated", lap, m.maxGated),
        eq("negotiated.lap", lap, neg.lap),
        eq("negotiated.metric.detourFloor", floor, m.detourFloor),
        eq("negotiated.metric.target", target, m.target),
        Math.abs(Number(target) - MOB_TARGET) < 1e-9
          ? null
          : `quotes a mobility target of ${target} and this file's target is ${MOB_TARGET}`,
        eq("negotiated.metric.maxUngated", ung, m.maxUngated),
        typeof m.exact !== "boolean" || (exact === "exact") === m.exact
          ? null
          : `calls layer 2's metric "${exact ? "exact" : "SAMPLED"}" and \`metric.exact\` is ${m.exact}`,
        eq("negotiated.metric.reachable", reach ?? sampReach, m.reachable),
        sampEnd === null ? null : eq("negotiated.metric.endpoints", sampEnd, m.endpoints),
        strict === null ? null : eq("negotiated.metric.maxStrict", strict, m.maxStrict),
      ),
    "defender mobility max",
  );

  // ---- the worst GATED pair, named in the middle ---------------------------
  const tiles = Array.isArray(neg.tiles) ? neg.tiles : null;
  clause(
    /between wall tiles (\d+),(\d+) and (\d+),(\d+) the defender walks (\d+) inside while the attacker walks (\d+) outside/,
    ([ax, ay, bx, by, din, dout]) =>
      first(
        tiles && tiles.length === 2 ? pairEq("`negotiated.tiles`", [ax, ay, bx, by], tiles[0], tiles[1]) : null,
        eq("negotiated.walk.din", din, w.din),
        eq("negotiated.walk.dout", dout, w.dout),
        N(neg.lap) === null || !Number(dout) || Math.abs(R2(Number(din) / Number(dout)) - neg.lap) < 0.011
          ? null
          : `walks its worst pair ${din} in against ${dout} out, which is a ratio of ` +
            `${R2(Number(din) / Number(dout))}, and \`negotiated.lap\` says ${neg.lap} — the lap IS that pair`,
      ),
    "between wall tiles",
  );

  // ---- the cause word, and the two counterfactual re-walks under it -------
  clause(
    /Cause: ([a-z]+)/,
    ([cause]) =>
      typeof neg.cause !== "string" || cause === neg.cause
        ? null
        : `diagnoses "${cause}" and \`negotiated.cause\` says "${neg.cause}"`,
    "Cause:",
  );
  // the noWalls re-walk ("with interior walls ignored…") and the noStructures
  // one ("with structures removed…") each print d and dout, and then one of two
  // verdict tails that print the detour and the ratio.
  const reWalk = (re, rec, label) =>
    clause(re, ([d, dout]) =>
      first(eq(`negotiated.causeWalks.${label}.d`, d, rec?.d), eq(`negotiated.causeWalks.${label}.dout`, dout, rec?.dout)),
    );
  reWalk(/with interior walls ignored,? (?:the same walk|it) is (\d+) against the attacker's (\d+)/, cw.noWalls, "noWalls");
  reWalk(/with the interior's natural walls lifted out as well it walks (\d+) against the attacker's (\d+)/, cw.noWalls, "noWalls");
  reWalk(/with structures removed(?: alone)?,? (?:the same walk|it) is (\d+) against the attacker's (\d+)/, cw.noStructures, "noStructures");
  // ...and the verdict tails. Both re-walks render the same two shapes, so each
  // occurrence is matched globally and checked against WHICHEVER re-walk owns
  // its numbers — the detour and the ratio have to belong to one of the two.
  for (const mm of t.matchAll(/a (\d+)-tile detour(?: at ratio ([\d.]+), which is STILL OVER the ([\d.]+) target| , inside the (\d+)-tile floor| , so it CLEARS)/g)) {
    consume(mm.index, mm.index + mm[0].length);
  }
  for (const mm of t.matchAll(/a (\d+)-tile detour at ratio ([\d.]+), which is STILL OVER the ([\d.]+) target/g)) {
    consume(mm.index, mm.index + mm[0].length);
    const det = Number(mm[1]);
    const rat = Number(mm[2]);
    const tgt = Number(mm[3]);
    const owner = [cw.noStructures, cw.noWalls].find((c) => c && c.detour === det);
    if (!owner) {
      out.push(
        `\`negotiated.detail\` calls a ${det}-tile detour "STILL OVER the ${tgt} target" and neither ` +
          `counterfactual re-walk the record publishes measured ${det} tiles ` +
          `(noStructures ${JSON.stringify(cw.noStructures?.detour)}, noWalls ${JSON.stringify(cw.noWalls?.detour)})`,
      );
    } else if (Math.abs(owner.ratio - rat) > 0.011) {
      out.push(`\`negotiated.detail\` prices a ${det}-tile detour at ratio ${rat} and the record's own re-walk says ${owner.ratio}`);
    } else if (Math.abs(tgt - MOB_TARGET) > 1e-9 || rat <= MOB_TARGET) {
      out.push(`\`negotiated.detail\` calls a ratio of ${rat} "STILL OVER the ${tgt} target"`);
    }
  }
  for (const mm of t.matchAll(/a (\d+)-tile detour, inside the (\d+)-tile floor/g)) {
    consume(mm.index, mm.index + mm[0].length);
    const det = Number(mm[1]);
    const floor = Number(mm[2]);
    if (N(m.detourFloor) !== null && floor !== m.detourFloor) {
      out.push(`\`negotiated.detail\` calls ${floor} the detour floor and \`metric.detourFloor\` says ${m.detourFloor}`);
    } else if (det > floor) {
      out.push(`\`negotiated.detail\` calls a ${det}-tile detour "inside the ${floor}-tile floor"`);
    } else if (![cw.noStructures, cw.noWalls].some((c) => c && c.detour === det)) {
      out.push(
        `\`negotiated.detail\` clears the gate on a ${det}-tile detour and neither counterfactual re-walk ` +
          `the record publishes measured it`,
      );
    }
  }
  // "SHORTER than the attacker's own lap, so it CLEARS the gate outright" — a
  // verdict with no number of its own, and one the record has to agree with.
  if (/SHORTER than the attacker's own lap/.test(t)) {
    const owner = [cw.noWalls, cw.noStructures].find((c) => c && N(c.d) !== null && c.d <= c.dout);
    if (!owner) {
      out.push(
        `\`negotiated.detail\` says the counterfactual walk is "SHORTER than the attacker's own lap, so ` +
          `it CLEARS the gate outright", and neither re-walk the record publishes is ` +
          `(noStructures ${JSON.stringify(cw.noStructures?.d)}/${JSON.stringify(cw.noStructures?.dout)}, ` +
          `noWalls ${JSON.stringify(cw.noWalls?.d)}/${JSON.stringify(cw.noWalls?.dout)})`,
      );
    }
  }

  // ---- the measured floor, the candidate set, and the eco lobe ------------
  clause(
    /Measured floor ([\d.]+) over (\d+) enclosure\(s\) within \+(\d+) ramparts of the cheapest cut/,
    ([floor, cands, budget]) =>
      first(
        eq("negotiated.floor", floor, neg.floor),
        eq("negotiated.candidates", cands, neg.candidates),
        eq("negotiated.tiebreakBudget", budget, neg.tiebreakBudget),
      ),
    "Measured floor",
  );
  const sawEco = clause(
    /the negotiation reached ([\d.]+) before the eco enclosures were bid in, but the bare enclosure held only (\d+) deep tiles against a floor of (\d+)[^.]*?\(the room ends up with (\d+)\), so it was bought and the lap grew by ([\d.]+)/,
    ([reached, bare, floor, ends, grew]) =>
      first(
        eq("negotiated.floor", reached, neg.floor),
        eq("negotiated.eco.bareDeep", bare, neg.eco?.bareDeep),
        eq("negotiated.eco.needDeep", floor, neg.eco?.needDeep),
        eq("negotiated.eco.deepTiles", ends, neg.eco?.deepTiles),
        eq("negotiated.eco.ecoCost", grew, neg.eco?.ecoCost),
        N(neg.lap) !== null && Math.abs(Number(reached) + Number(grew) - neg.lap) > 0.011
          ? `says the negotiation reached ${reached} and the lap "grew by" ${grew}, which is ` +
            `${R2(Number(reached) + Number(grew))}, against a recorded lap of ${neg.lap}`
          : null,
      ),
  );
  // ...AND THE OTHER DIRECTION. A record carrying an eco lobe whose paragraph
  // does not mention it, or a paragraph claiming one the record does not carry,
  // is the clause and the leaf disagreeing about whether the room bought a lobe.
  if (sawEco !== !!neg.eco) {
    out.push(
      `\`negotiated.detail\` ${sawEco ? "tells the eco-lobe story and" : "does not mention an eco lobe and"} ` +
        `\`negotiated.eco\` is ${neg.eco ? "an object" : "null"}`,
    );
  }

  // ---- the two over-target fractions -------------------------------------
  clause(
    /(\d+)\/(\d+) wall pairs with a real detour exceed the target \((\d+)\/(\d+) on the ungated reading, p(\d+) ([\d.]+)\)/,
    ([a, b, c, d, pct, p90]) =>
      first(
        eq("negotiated.metric.overGated", a, m.overGated),
        eq("negotiated.metric.gatedPairs", b, m.gatedPairs),
        eq("negotiated.metric.over", c, m.over),
        eq("negotiated.metric.pairs", d, m.pairs),
        Number(pct) === 90 ? null : `quotes a p${pct} and layer 2's metric publishes a p90`,
        eq("negotiated.metric.p90", p90, m.p90),
      ),
    "wall pairs with a real detour",
  );

  // ---- the closing clause: the longest-DETOUR pair, which is not always the
  // worst-ratio pair the paragraph opened on (eight of the fleet's rooms) ----
  clause(
    /the longest extra walk anywhere on this wall is (\d+) tile\(s\) \((\d+),(\d+) to (\d+),(\d+): (\d+) in \/ (\d+) out, ratio ([\d.]+)\)/,
    ([extra, ax, ay, bx, by, din, dout, ratio]) =>
      first(
        eq("negotiated.metric.maxDetour", extra, m.maxDetour),
        pairEq("`negotiated.worstDetour`", [ax, ay, bx, by], wd.a, wd.b),
        eq("negotiated.worstDetour.din", din, wd.din),
        eq("negotiated.worstDetour.dout", dout, wd.dout),
        eq("negotiated.worstDetour.ratio", ratio, wd.ratio),
        Number(extra) === Number(din) - Number(dout)
          ? null
          : `calls the longest extra walk ${extra} tile(s) over a walk of ${din} in against ${dout} out, ` +
            `which is ${Number(din) - Number(dout)}`,
        !Number(dout) || Math.abs(Number(ratio) - R2(Number(din) / Number(dout))) < 0.011
          ? null
          : `quotes a ratio of ${ratio} for ${din} in against ${dout} out, which is ${R2(Number(din) / Number(dout))}`,
      ),
    "the longest extra walk",
  );

  // ---- THE RESIDUE ------------------------------------------------------
  const left = spans.filter((sp) => !sp.used);
  if (left.length) {
    const ctx = left
      .slice(0, 5)
      .map((sp) => `"…${t.slice(Math.max(0, sp.i - 40), sp.i + sp.s.length + 16).replace(/\s+/g, " ")}…"`)
      .join(" · ");
    out.push(
      `\`negotiated.detail\` quotes ${left.length} number(s) that no clause of layer 2's own template ` +
        `accounts for — ${ctx}. This paragraph is copied WORD FOR WORD into the declaration a reader ` +
        `reads, and it is the one field in the whole record a human types. It may quote the leaves ` +
        `published beside it and the arithmetic of its own sentences; a number that is neither has no ` +
        `way in`,
    );
  }
  return out;
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
 * THE FOURTH DIRECTION, AND THE ONE THE OTHER THREE WERE STANDING ON: EVERY
 * LEAF OF EVERY DECLARATION RECORD IS CLASSIFIED, AND THE CLASSES ARE CLOSED.
 * ==========================================================================
 * declprose.mjs's header makes three promises. Two of them held. The third —
 *
 *     "A record that is corrupted to match a false paragraph still fails,
 *      because the validator re-derives the record's fields from terrain and
 *      the shipped structure lists"
 *
 * — was true of 64 of the 536 record leaves the fleet ships and false of the
 * other 472, and a reviewer walked through the gap the obvious way: falsify a
 * field in the structured record, then set `detail = renderDecl(sf)` using the
 * SHARED template both sides run. The paragraph gate is satisfied by
 * construction, and nothing else looked. Nine landed, every one of them a
 * sentence an owner reads:
 *
 *   E13S2  labs.haulDist 12 -> 2          "the lab diamond is 2 hauler tile(s)
 *                                          from the hub … the fleet median is 2"
 *   E11S9  spawnFan.census.fannedTriples  a priced trade laundered into a
 *          28 -> 0, fannedAvailable null  terrain impossibility
 *   E17S5  ctrlParks.census.maxParks 6->5 "5 seats is the room's ceiling, not a
 *                                          preference" — and that pair EXCUSES A
 *                                          HARD GATE
 *   E12S5  ctrlParks.held 7 -> 99         "HOLDS 2 of the 99 parking tile(s)"
 *   E13S9  spawnFan.census.pool/viable    the census's own arithmetic broken
 *          -> 999                         and unread
 *   E13S3  battlements.strandedByMass 1->0 self-contradicting and passing
 *   E9S2   labs.eatAnchors 2 -> 99
 *   E11S1  misc offNetwork.roads 78 -> 1,  the kind that excuses the HARD road
 *          seats 1 -> 99                   gate in 133 of 172 rooms
 *   E2S3   labs.fallbackAnchors 6 -> 0
 *
 * "The paragraph cannot say anything the record does not" is true and worthless
 * while the record is unchecked: generation replaced a hand-typed lie with a
 * generated one.
 *
 * SO EVERY LEAF IS NAMED HERE, AND EVERY LEAF IS ONE OF THREE THINGS.
 *
 *   D          RE-DERIVED. checkRoom computes the value from terrain, the room
 *              objects, the shipped structure lists and this file's own module
 *              constants, and compares. A leaf classed D that the derivation
 *              does not produce is a HARD FAIL on the room — the inventory
 *              cannot promise a check that is not there.
 *   W(why)     PRODUCER-WITNESSED, WITH THE BOUND STATED. A fact about a search
 *              that has finished and left no trace on the board: how many swaps
 *              were examined, what the ladder measured on a board six layers
 *              ago. `why` says what it is and what still holds it — a bound this
 *              file DOES check (an optional predicate), the arithmetic of the
 *              census it sits in, or a cross-copy of a number published
 *              elsewhere. It is not "unchecked"; it is checked to a stated,
 *              weaker standard, and the standard is written down.
 *   X(why)     NON-RE-DERIVABLE BY NAME, like `labs|lab-road-eat` in
 *              OBLIGATION_EXEMPT. The reason must say what was destroyed and by
 *              what. An exemption that is an omission is the defect; an
 *              exemption that is a named entry with a reason is a decision.
 *
 * AND THE SET IS CLOSED. A record leaf this table does not name fails the room
 * that ships it. That is what makes the table an inventory rather than a
 * to-do list: a producer cannot add a field to a record and have it be
 * unchecked-by-default, which is exactly how ten kinds came to ship 100%
 * unaudited records in the first place.
 *
 * THE ENVELOPE IS NOT THE RECORD. `gate`, `kind`, `detail`, `tiles`, `count`
 * and `rungs` are the declaration envelope — admissibility, arbitration and
 * evidence — and they have their own gates (admitDeclaration, sanitiseTiles,
 * sanitiseRungs, MAX_DECL_TILES, MAX_DECL_BUDGET, the prose identity check).
 * Everything else on a declaration is RECORD and is walked here.
 */
/** re-derived from board + terrain + this file's constants */
const D = { klass: "derived" };
/**
 * producer-witnessed; `why` states what still holds it, `bound` is an optional
 * TYPE predicate, `closures` are the ARITHMETIC relations this file evaluates.
 *
 * ==========================================================================
 * ROUND 15: THE WITNESSED HALF WAS TYPE-ONLY, AND SAID OTHERWISE.
 * ==========================================================================
 * Round 14 closed the derived half — every leaf classed D is compared against
 * a value this file computes, and a D the derivation does not produce is a hard
 * fail. The witnessed half was left with a sentence instead. `SEARCH_COUNTER`
 * told 94 leaves' worth of readers that the bound was "a non-negative number
 * AND that the census it belongs to closes arithmetically around it", and the
 * closure existed for exactly ONE declaration kind (`spawnFan|sector`). Seven
 * generic closures covered 173 leaves; the other 172 were held to `typeof v ===
 * "number" && v >= 0` and nothing else. E11S6 could ship 900 score-tied swaps
 * out of 755 tried, and 500 score-tied out of ZERO pair swaps, and render
 * "over 755 candidate swap(s), of which 900 were score-tied and therefore legal
 * to take" — clean, 172/172.
 *
 * That is the eighth-of-eighteen shape one level in: a rule implemented for the
 * kind someone got to, described in the inventory as applying to all of them.
 *
 * SO THE BOUND AND THE SENTENCE ARE NOW ONE OBJECT. A closure is a named
 * relation over the record the leaf sits in — `moved <= tried`, `deep <= tiles`,
 * `improvedBy === windowBefore - windowAfter`, `composedTo === last(composedCaps)`
 * — and it carries BOTH the predicate this file runs AND the clause the `why`
 * text is built from. `SEARCH_COUNTER(what, LE("towers.refillSearch.tried"))`
 * generates the sentence "…and that it may not exceed `towers.refillSearch.tried`"
 * BECAUSE the relation is there to generate it from. A counter with no closure
 * generates the OTHER sentence — "the ONLY bound this file holds it to is that
 * it is a non-negative number; no arithmetic closes around it here" — so a
 * reader is told the truth without anyone having to remember to write it down.
 *
 * AND THE PROMISE IS CHECKED AT LOAD. `assertRecordInventory` runs
 * `PROMISE_RE` over every hand-written `why` in the table: a sentence that
 * states a bound ("may not exceed", "the two must agree", "is the last entry
 * of", "equals", "at most", "strictly descending", …) with no closure and no
 * bespoke block registered for it THROWS AT LOAD. The file cannot start while
 * it promises arithmetic it does not perform — the same rule the pair, prose,
 * obligation and cut-reason inventories already live under, applied to the one
 * inventory that was still a list of intentions.
 */
const W = (why, bound = null, closures = []) => ({ klass: "witnessed", why, bound, closures });
/** named non-re-derivable, with the reason it cannot be */
const X = (why) => ({ klass: "exempt", why });

// ---------------------------------------------------------------------------
// THE CLOSURE VOCABULARY.
//
// Every entry is `{ op, ... }` plus the two things a closure is for: `say`
// builds the clause that goes into the leaf's `why`, and `run` evaluates it
// against the declaration record and returns null or the sentence that says
// how it broke. `get(path)` reads a dotted path off the record.
//
// ===========================================================================
// ROUND 17, F3 (CRITICAL): "A PATH THAT IS ABSENT MAKES THE CLOSURE SKIP."
// ===========================================================================
// That sentence used to be the paragraph above, and it was wrong in the one
// way that matters: it described the SELF side (a record legitimately omits a
// field) and it was implemented on the REFERENT side too. `le`/`ge`/`eq`/
// `sumeq`/`diffeq`/`quot`/`len`/`maxof`/`lenis`/`iff` all `return null` — i.e.
// PASS — when the thing they compare against is missing. Since the referent is
// very often `@meta.towers.…`, and the `@meta` mirror was in no presence list,
// the exploit was two edits long: falsify the record leaf, delete the mirror.
// Round 17's mechanical reviewer swept exactly that: **1109 tried, 436 ESCAPE
// across 29 leaves**, every one of them a falsified reader-facing number
// re-rendered into the paragraph. The worst was E11S6's clump paragraph
// reading "it ran 1 single-swap round(s) over 3 candidate swap(s)" against a
// truth of 755 — criticism 51's exact defect, on a room this doc calls EARNED.
//
// So: A MISSING REFERENT IS A FAILURE, EVERYWHERE. The closure's whole job is
// to be a relation between two published numbers; with one of them gone there
// is no relation, and "no relation" must not read like "relation holds". The
// SELF side keeps its skip — a leaf published as `null` is a leaf the absence
// engine (RECORD_ABSENCE) owns, and a leaf that is simply not there never
// reaches here — but a self that is PRESENT and not a number fails too, since
// `cnum` returning null on the string "3" was the same silent pass one type
// further out.
//
// The presence half of the fix is `REQUIRED_META` + `META_MIRRORS`: every
// `@meta.*` path any closure in this file names is required to exist, in every
// room or under a measured condition, so "delete the referent" is not a way to
// turn this failure into a legal absence either.
// ---------------------------------------------------------------------------
const cnum = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const carr = (v) => (Array.isArray(v) ? v : null);
const R2 = (v) => Math.round(v * 100) / 100;

/** the tail every missing-referent message ends with, written once */
const NOREF_TAIL =
  `A closure whose referent is missing compares nothing and used to return null — which this file reads as ` +
  `"the relation holds". Round 17 swept it: 436 of 1109 falsify-the-leaf-and-delete-its-referent pairs ` +
  `escaped across 29 leaves, every one a false number re-rendered into the paragraph a human reads`;
/** the referent named by a closure is absent, or present and not the type the relation needs */
const noref = (self, path, v, want = "a finite number") =>
  `is ${JSON.stringify(self)} and its referent \`${path}\` is ` +
  `${v === undefined ? "ABSENT from this room" : `published as ${JSON.stringify(v).slice(0, 60)}`}, not ${want}. ${NOREF_TAIL}`;
/** the leaf ITSELF is present and not the type its own relation needs */
const noself = (self, want = "a finite number") =>
  `is ${JSON.stringify(self)}, which is not ${want}, so the arithmetic the inventory states for it could ` +
  `not be evaluated at all. ${NOREF_TAIL}`;
/**
 * Reads the self side. `null`/`undefined` SKIPS (the absence engine owns it);
 * anything else that is not a finite number FAILS.
 */
const selfNum = (self) => (self === null || self === undefined ? { skip: true } : cnum(self) === null ? { err: noself(self) } : { v: cnum(self) });
/**
 * ==========================================================================
 * ...AND THE ONE PLACE A REFERENT IS LEGITIMATELY ABSENT IS A MEASURED,
 * TWO-SIDED CONDITION, NOT A SHRUG.
 * ==========================================================================
 * Making a missing referent fail found exactly one honest instance in the
 * fleet: `mobility`'s `repair.mass.lapAfter` is `null` in all 57 rooms that
 * ship the record, because the bounded mass-relocation attempt KEPT NOTHING
 * (`moved === 0`) and a lap "after" a relocation that did not happen is not a
 * number. `NULLREF` says that in the form this file requires of every other
 * excuse: the referent may be null EXACTLY WHEN the stated relation holds —
 * null while the condition is false fails, and PRESENT while the condition is
 * true fails too. So "delete the referent" cannot be turned into "the referent
 * was legitimately absent" without also faking the condition, which is a leaf
 * with its own class.
 */
const NULLREF = (c, when, text) => ({ ...c, nullRef: { when, text } });
/** Reads a referent. Absent or non-numeric is a failure unless `NULLREF` licenses it. */
const refNum = (c, self, get, path) => {
  const v = get(path);
  const licensed = c.nullRef ? c.nullRef.when(get) : false;
  if (v === null || v === undefined) {
    if (licensed === true) return { skip: true };
    if (licensed === null) {
      return {
        err:
          `is ${JSON.stringify(self)}, its referent \`${path}\` is absent, and the condition that would ` +
          `license the absence (${c.nullRef.text}) could not itself be evaluated. ${NOREF_TAIL}`,
      };
    }
    return {
      err: c.nullRef
        ? `is ${JSON.stringify(self)} and its referent \`${path}\` is absent while ${c.nullRef.text} is ` +
          `FALSE — that condition is the only thing that licenses the absence. ${NOREF_TAIL}`
        : noref(self, path, v),
    };
  }
  if (c.nullRef && licensed === true) {
    return {
      err:
        `is ${JSON.stringify(self)} and its referent \`${path}\` is published as ${JSON.stringify(v).slice(0, 40)} ` +
        `while ${c.nullRef.text} — the condition under which that referent carries NOTHING. An excuse that ` +
        `holds in both directions is a measurement; one that holds in one is an escape hatch`,
    };
  }
  const n = cnum(v);
  return n === null ? { err: noref(self, path, v) } : { v: n };
};
/** ...the same, for a referent that has to be an array */
const refArr = (c, self, get, path) => {
  const v = get(path);
  const a = carr(v);
  return a === null ? { err: noref(self, path, v, "a list") } : { v: a };
};

const CLOSURE_OPS = {
  /** this leaf <= the value at `other` */
  le: {
    say: (c) => `it may not exceed \`${c.other}\``,
    run: (c, self, get) => {
      const a = selfNum(self);
      if (a.skip) return null;
      if (a.err) return a.err;
      const b = refNum(c, self, get, c.other);
      if (b.err) return b.err;
      if (b.skip) return null;
      return a.v <= b.v ? null : `is ${a.v}, which exceeds \`${c.other}\` (${b.v})`;
    },
  },
  /** this leaf >= the value at `other` */
  ge: {
    say: (c) => `it may not fall below \`${c.other}\``,
    run: (c, self, get) => {
      const a = selfNum(self);
      if (a.skip) return null;
      if (a.err) return a.err;
      const b = refNum(c, self, get, c.other);
      if (b.err) return b.err;
      if (b.skip) return null;
      return a.v >= b.v ? null : `is ${a.v}, below \`${c.other}\` (${b.v})`;
    },
  },
  /**
   * this leaf === the value at `other` — a cross-copy of one number.
   *
   * `eq` is the op the `@meta.*` mirrors are built out of, so it is the op the
   * round-17 exploit lived in: 20 of the 22 mirrored paths deleted clean, and
   * with the mirror gone the record leaf was held to its type and nothing else.
   * The referent side is now REQUIRED (`META_MIRRORS` puts every one of those
   * 22 paths into `REQUIRED_META` under a measured presence condition), and a
   * referent that is nevertheless absent fails HERE as well, so the two halves
   * cannot both be argued away.
   */
  eq: {
    say: (c) => `it is the same number as \`${c.other}\`, published twice`,
    run: (c, self, get) => {
      if (self === undefined || self === null) return null;
      const b = get(c.other);
      if (b === undefined || b === null) return noref(self, c.other, b, "a published value");
      return near2(self, b) ? null : `is ${JSON.stringify(self)} and \`${c.other}\` says ${JSON.stringify(b)}`;
    },
  },
  /** this leaf === a constant this file owns */
  konst: {
    say: (c) => `it equals ${JSON.stringify(c.value)}, which is ${c.name} — this file's own constant`,
    run: (c, self) => (self === null || self === undefined || near2(self, c.value) ? null : `is ${JSON.stringify(self)} and ${c.name} is ${JSON.stringify(c.value)}`),
  },
  /** this leaf >= a floor this file owns */
  atleast: {
    say: (c) => `it is at least ${c.value}${c.note ? ` (${c.note})` : ""}`,
    run: (c, self) => {
      const a = cnum(self);
      return a === null || a >= c.value ? null : `is ${a}, under the floor of ${c.value}${c.note ? ` — ${c.note}` : ""}`;
    },
  },
  /** this leaf <= a ceiling this file owns */
  atmost: {
    say: (c) => `it is at most ${c.value}${c.note ? ` (${c.note})` : ""}`,
    run: (c, self) => {
      const a = cnum(self);
      return a === null || a <= c.value ? null : `is ${a}, over the ceiling of ${c.value}${c.note ? ` — ${c.note}` : ""}`;
    },
  },
  /** this leaf === the sum of the leaves named in `parts` */
  sumeq: {
    say: (c) => `it is exactly ${c.parts.map((p) => `\`${p}\``).join(" + ")}`,
    run: (c, self, get) => {
      const a = selfNum(self);
      if (a.skip) return null;
      if (a.err) return a.err;
      const vs = [];
      for (const p of c.parts) {
        const r = refNum(c, self, get, p);
        if (r.err) return r.err;
        if (r.skip) return null;
        vs.push(r.v);
      }
      const s = vs.reduce((x, y) => x + y, 0);
      return near2(a.v, s) ? null : `is ${a.v} and ${c.parts.map((p, i) => `${p} ${vs[i]}`).join(" + ")} is ${s}`;
    },
  },
  /** this leaf === the difference `minus[0] - minus[1]` */
  diffeq: {
    say: (c) => `it is exactly \`${c.minus[0]}\` minus \`${c.minus[1]}\``,
    run: (c, self, get) => {
      const a = selfNum(self);
      if (a.skip) return null;
      if (a.err) return a.err;
      const x = refNum(c, self, get, c.minus[0]);
      if (x.err) return x.err;
      if (x.skip) return null;
      const y = refNum(c, self, get, c.minus[1]);
      if (y.err) return y.err;
      if (y.skip) return null;
      return near2(a.v, x.v - y.v)
        ? null
        : `is ${a.v} and \`${c.minus[0]}\` ${x.v} minus \`${c.minus[1]}\` ${y.v} is ${x.v - y.v}`;
    },
  },
  /** this leaf === `over[0]` divided by `over[1]`, at the producer's rounding */
  quot: {
    say: (c) => `it is exactly \`${c.over[0]}\` divided by \`${c.over[1]}\``,
    run: (c, self, get) => {
      const a = selfNum(self);
      if (a.skip) return null;
      if (a.err) return a.err;
      const x = refNum(c, self, get, c.over[0]);
      if (x.err) return x.err;
      if (x.skip) return null;
      const y = refNum(c, self, get, c.over[1]);
      if (y.err) return y.err;
      if (y.skip) return null;
      if (y.v === 0) {
        return (
          `is ${a.v} and its divisor \`${c.over[1]}\` is ZERO, so the quotient the inventory says it equals ` +
          `does not exist. ${NOREF_TAIL}`
        );
      }
      const want = R2(x.v / y.v);
      return Math.abs(a.v - want) < 0.011
        ? null
        : `is ${a.v} and \`${c.over[0]}\` ${x.v} over \`${c.over[1]}\` ${y.v} is ${want}`;
    },
  },
  /** this leaf === the LENGTH of the array at `other` */
  len: {
    say: (c) => `it is the number of entries in \`${c.other}\``,
    run: (c, self, get) => {
      const a = selfNum(self);
      if (a.skip) return null;
      if (a.err) return a.err;
      const arr = refArr(c, self, get, c.other);
      if (arr.err) return arr.err;
      if (arr.skip) return null;
      return a.v === arr.v.length ? null : `is ${a.v} and \`${c.other}\` has ${arr.v.length} entr(y/ies)`;
    },
  },
  /** this leaf === the MAXIMUM of the numeric array at `other` */
  maxof: {
    say: (c) => `it is the largest entry of \`${c.other}\``,
    run: (c, self, get) => {
      const a = selfNum(self);
      if (a.skip) return null;
      if (a.err) return a.err;
      const arr = refArr(c, self, get, c.other);
      if (arr.err) return arr.err;
      if (arr.skip) return null;
      const ns = arr.v.map(cnum).filter((v) => v !== null);
      if (ns.length !== arr.v.length) {
        return (
          `is ${a.v} and \`${c.other}\`, the list it is supposed to be the largest entry of, has ` +
          `${arr.v.length - ns.length} entr(y/ies) that are not numbers at all. ${NOREF_TAIL}`
        );
      }
      if (!ns.length) {
        return `is ${a.v} and \`${c.other}\` is EMPTY, so it has no largest entry. ${NOREF_TAIL}`;
      }
      const mx = Math.max(...ns);
      return a.v === mx ? null : `is ${a.v} and the largest entry of \`${c.other}\` is ${mx}`;
    },
  },
  /** THIS array's length === the value at `other` */
  lenis: {
    say: (c) => `it has exactly \`${c.other}\` entries`,
    run: (c, self, get) => {
      if (self === null || self === undefined) return null;
      const arr = carr(self);
      if (!arr) return noself(self, "a list");
      const n = refNum(c, self, get, c.other);
      if (n.err) return n.err;
      if (n.skip) return null;
      return arr.length === n.v ? null : `has ${arr.length} entr(y/ies) and \`${c.other}\` says ${n.v}`;
    },
  },
  /** THIS array's length === a constant */
  lenk: {
    say: (c) => `it has exactly ${c.value} entries${c.note ? ` (${c.note})` : ""}`,
    run: (c, self) => {
      const arr = carr(self);
      if (!arr) return null;
      return arr.length === c.value ? null : `has ${arr.length} entr(y/ies); ${c.note || `it is a list of ${c.value}`}`;
    },
  },
  /** this leaf is positive EXACTLY when the relation at `iff` holds */
  iff: {
    say: (c) => `it is positive exactly when ${c.text}`,
    run: (c, self, get) => {
      const a = selfNum(self);
      if (a.skip) return null;
      if (a.err) return a.err;
      const w = c.when(get);
      if (w === null) {
        return (
          `is ${a.v} and the condition it is supposed to track — ${c.text} — could not be evaluated, ` +
          `because one of the leaves it reads is absent or is not a number. ${NOREF_TAIL}`
        );
      }
      return a.v > 0 === w ? null : `is ${a.v} and ${c.text} is ${w}`;
    },
  },
  /**
   * THIS leaf is published as `null` exactly when the named relation holds.
   *
   * The mirror image of `NULLREF`. A leaf whose value is `null` skips every
   * arithmetic closure it carries — that is correct, because there is no
   * arithmetic to do — so the fact that it is null has to be a checked fact of
   * its own, or "publish null" is a way to switch a leaf's whole audit off.
   * (`repair.mass.lapBefore` / `.lapAfter` / `.liftedLap` are the fleet's three
   * instances, and all three nulls are a measurement: the attempt kept nothing,
   * or the room's built lap is zero and there was nothing to relocate FOR.)
   */
  nulliff: {
    say: (c) => `it is published as null exactly when ${c.text}`,
    run: (c, self, get) => {
      if (self === undefined) return null; // absence is the presence engine's job
      const w = c.when(get);
      if (w === null) {
        return (
          `is ${JSON.stringify(self)} and the condition that decides whether it may be null — ${c.text} — ` +
          `could not be evaluated, because a leaf it reads is absent or is not a number. ${NOREF_TAIL}`
        );
      }
      const isNull = self === null;
      if (isNull === w) return null;
      return isNull
        ? `is null while ${c.text} is FALSE. A null leaf skips every arithmetic closure it carries, so ` +
          `nulling it is how a census turns itself off; the null has to be a measured fact`
        : `is ${JSON.stringify(self)} while ${c.text} is TRUE — that is the condition under which this ` +
          `leaf has nothing to report, so a number here is a number about a pass that did not happen`;
    },
  },
  /** a hand-written predicate over the whole record, named so it can be listed */
  pred: {
    say: (c) => c.text,
    run: (c, self, get) => c.check(self, get),
  },
  /**
   * THE BOUND IS A BLOCK OF BESPOKE CODE FURTHER DOWN THIS FILE, AND THE BLOCK
   * HAS TO SAY IT RAN. A closure that names a bespoke id is only honest while
   * the block exists AND executes on the declarations that claim it: the
   * engine collects the ids the blocks marked, and a leaf claiming an id no
   * block marked is a hard fail on the room — the same shape as a D leaf whose
   * derivation produced nothing.
   */
  bespoke: {
    say: (c) => c.text,
    run: () => null,
  },
};

const near2 = (a, b) =>
  typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-6 : JSON.stringify(a) === JSON.stringify(b);

/**
 * ==========================================================================
 * A CEILING TAKEN OFF THE BOARD, NOT OFF THE RECORD.
 * ==========================================================================
 * Round 16's owner-voice reviewer (F11, cause 3): "every closure is scale- and
 * provenance-blind. `GE`/`LE`/`EQ`/`DIFFEQ`/`QUOT` are ratio- or
 * difference-based, so a whole measurement family can be rescaled" — E11S6's
 * worst detour rendered as 1 tile instead of 5 in a paragraph that still says
 * 6/6 pairs cost more than 4 — "and S1 swapped E11S6's and E3S5's ENTIRE
 * dispersion censuses: both internally legal, both mirrors consistent. Every
 * per-room search census in the fleet can be permuted arbitrarily."
 *
 * The cause is that a closure could only name a sibling leaf (`path`) or the
 * plan's own meta (`@path`) — and the meta copy is written by the same producer
 * in the same pass, so it moves with the census. Nothing in the vocabulary
 * could say "and this room's BOARD does not admit that number".
 *
 * `#path` is that: a small set of facts re-derived from THIS room's terrain and
 * THIS room's shipped structures, built fresh per room, that a census cannot be
 * carried across a room boundary without contradicting. Binding one leaf of a
 * census to a `#` fact is what makes the census this room's.
 */
const BOARD_FACTS = [
  "interiorWalkable", // walkable tiles inside the wall
  "interiorTiles", // walkable tiles anywhere in the room
  "walkRegion", // tiles the garrison's own walk region reaches
  "shippedCut", // |meta.shell.cut|
  "shippedRamparts",
  "shippedRoads",
  "shippedTowers",
  "shippedExtensions",
  "gatedPairs", // as-built gated cut-tile pairs
  "builtGated", // as-built worst gated lap
  "freeDeepInterior", // empty walkable interior tiles at or past the depth floor
  "deepSeats", // ...of those, the ones that are legal TOWER seats on the shipped board
  "deepSeatsWithTowers", // ...plus the six seats the towers are standing on
  "deepSeatBlocks", // ...counted by 2x2 block, which survives layer 3's thinning
  "lapCeiling", // this file's own exact-metric ceiling
];
const BOARD = (f) => {
  if (!BOARD_FACTS.includes(f)) throw new Error(`validate.mjs: #${f} is not a board fact`);
  return `#${f}`;
};
const LE = (other) => ({ op: "le", other });
const GE = (other) => ({ op: "ge", other });
const EQ = (other) => ({ op: "eq", other });
const KONST = (name, value) => ({ op: "konst", name, value });
const ATLEAST = (value, note) => ({ op: "atleast", value, note });
const ATMOST = (value, note) => ({ op: "atmost", value, note });
const SUMEQ = (...parts) => ({ op: "sumeq", parts });
const DIFFEQ = (a, b) => ({ op: "diffeq", minus: [a, b] });
const QUOT = (a, b) => ({ op: "quot", over: [a, b] });
const LEN = (other) => ({ op: "len", other });
const MAXOF = (other) => ({ op: "maxof", other });
const LENIS = (other) => ({ op: "lenis", other });
const LENK = (value, note) => ({ op: "lenk", value, note });
const IFFPOS = (text, when) => ({ op: "iff", text, when });
const NULLIFF = (text, when) => ({ op: "nulliff", text, when });
const PRED = (text, check) => ({ op: "pred", text, check });
const BESPOKE = (id, text) => ({ op: "bespoke", id, text });

/**
 * The registry of bespoke closure ids. A `BESPOKE(id, …)` naming an id that is
 * not in this set is a load-time failure, and an id in this set that no leaf
 * claims is a dead check — both are asserted, so the two lists cannot drift.
 */
const BESPOKE_CLOSURES = new Set([
  "spawnFan.census.lattice",
  "ctrlParks.seats.ceiling",
  "shallowExt.sharedTarget.crosscopy",
  "mobility.negotiated.pair",
  "mobility.ladder.rungs",
  "battlements.substitute.branch",
  "labs.refused.network.dormant",
  "ctrlParks.composedCaps.descent",
  "mobility.negotiated.detail.parse",
  "labs.eatAnchors.ceiling",
]);

/**
 * ==========================================================================
 * THE STRONGEST BOUND A WITNESSED LEAF CAN HAVE: THE SAME NUMBER, PUBLISHED
 * TWICE, BY A PASS THAT DOES NOT KNOW WHETHER THE ROOM WILL DECLARE.
 * ==========================================================================
 * Layer 3 writes `meta.towers` for EVERY room — the placement search, the
 * refill-directed swap pass, the dispersion pass and the mobility veto, all of
 * them, whether the room ends up filing a `towers/weak-battery` declaration or
 * not. The declaration's record is a COPY of that object. So the leaf that says
 * "755 swaps examined" is checkable after all: not against the board, which
 * forgot, but against the unconditional publication of the same measurement,
 * which a producer would have to edit in two places to keep consistent — and
 * the second place is one no declaration-shaped exploit is looking at.
 *
 * This is the `meta.spawnFan` trick round 14 used for ONE census, applied to
 * every layer-3 counter the fleet witnesses. It turns 30-odd type-only leaves
 * into cross-copies, and it costs nothing: the copies are already there.
 */
const MIRROR_L3 = (field) => EQ(`@meta.towers.${field}`);
const MIRROR_VETO = (field) => EQ(`@meta.towers.mobilityVeto.${field}`);
const MIRROR_DISP = (field) => EQ(`@meta.towers.towerDispersion.${field}`);
/**
 * ROUND 17 / F6 — the lane reservation's own unconditional publication.
 * `meta.walls.mobility.lanes` is written by layer 6 for every room, declared or
 * not, and the `mobility` record's `lane` block is a copy of it. Until this
 * round the lane family was held to sibling inequalities and to ceilings taken
 * off the room's interior FLOOR — 200-400 tiles, against numbers whose real
 * values are 6 to 20 — so a x5 inflation with the paragraph regenerated walked
 * past every one of them: 216 of the 290 escapes in round 17's x5 band sweep
 * were lane leaves.
 */
const MIRROR_LANE = (field) => EQ(`@meta.walls.mobility.lanes.${field}`);

/**
 * The one census that WAS closed before this round, named once so the leaves
 * that live inside it point at the block that closes them.
 */
/**
 * A COORDINATE ON A BOARD THAT IS GONE. Half a tile key, on a wall an earlier
 * layer drew; the bound is that it is a coordinate of a real room and, where the
 * pair as a whole matters, the bespoke block that walks it.
 */
const COORD = (what) =>
  W(
    `${what} — a tile on a board a later layer moved, so it is not re-derived; what is held is that it ` +
      `is a whole number inside the room's own 50x50 grid, and the pair it belongs to is walked by the ` +
      `worst-pair block below`,
    (v) => (Number.isInteger(v) && v >= 0 && v <= 49 ? null : `is ${JSON.stringify(v)}, not a room coordinate`),
    [BESPOKE("mobility.negotiated.pair", "the tile it is half of is a real walkable tile of this room")],
  );

const SPAWNFAN_LATTICE = BESPOKE(
  "spawnFan.census.lattice",
  "the census it sits in is an arithmetic lattice this file evaluates in full — the pool splits exactly " +
    "into its five rejection classes plus the viable seats, the core and ring halves sum to the pool, the " +
    "legal and adjacent triples sum to C(shortlist,3), the shortlist's sector count equals the viable " +
    "set's, and every containment (viable, shortlist, viableCore, viableShallow, fannedTriples) is checked",
);

/** the clause list a `why` is built from, in the order the closures are given */
function closureSentence(closures) {
  const parts = closures.map((c) => CLOSURE_OPS[c.op].say(c));
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join("; ")}; and ${parts[parts.length - 1]}`;
}

/**
 * PROMISE LANGUAGE. A `why` that says one of these things is claiming an
 * arithmetic bound, and a claim with no closure behind it is exactly the defect
 * this round is about. Matched against the HAND-WRITTEN part of a `why` only —
 * the generated tail is generated FROM the closures, so it cannot lie.
 */
const PROMISE_RE =
  /closes arithmetically|must agree|the two agree|may not exceed|cannot exceed|at most|no more than|at least|is the last entry|strictly descending|starts at |ends at |contains the cap|equals? \`|EQUALS|equivalent to|exactly when|it is the difference|it is the sector weight|matches \`|sum to|0 <= |<= |>= |same counter as/;

/**
 * ...and the sentence a leaf held to NOTHING BUT ITS TYPE has to contain. The
 * generated constructors write one of these for themselves; a hand-written
 * `why` on a closure-less leaf has to say it out loud or the file will not
 * start. "Unchecked" and "checked to a weaker standard" are different facts and
 * a reader is entitled to know which one they are reading.
 */
const TYPE_ONLY_RE =
  /THAT IS THE WHOLE BOUND|and that is the whole bound|nothing else on this record|no arithmetic closes|is all this file holds it to|the only bound|held to its shape and nothing more/;

/** a leaf path with dynamic segments, normalised to the form this table uses */
const normLeaf = (p) => p.replace(/^lift\.perClass\.[A-Za-z]+\./, "lift.perClass.*.");

/** the declaration ENVELOPE — gated elsewhere, see the header */
const RECORD_ENVELOPE = new Set(["gate", "kind", "detail", "tiles", "count", "rungs"]);

const WITNESS_NONNEG = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? null : `is ${JSON.stringify(v)}, not a non-negative number`;
const WITNESS_BOOL = (v) => (typeof v === "boolean" ? null : `is ${JSON.stringify(v)}, not a boolean`);
const WITNESS_NUM_OR_NULL = (v) =>
  v === null || (typeof v === "number" && Number.isFinite(v))
    ? null
    : `is ${JSON.stringify(v)}, not a finite number or null`;
/**
 * ==========================================================================
 * ROUND 16: A ONE-SIDED BOUND ADMITS A SIGN-IMPOSSIBLE VALUE.
 * ==========================================================================
 * `LAYER_EARLIER` held its leaves to `WITNESS_NUM_OR_NULL` and, where a sibling
 * existed, ONE `le`/`ge` closure. So the negotiated lap could be **-2.5** and
 * render "the negotiated lap of 1.56 reads -2.5 on the wall this room ships";
 * `repair.mass.liftedLap` -2.5; `towers.maxRefillUnblocked` -10;
 * `dispersion.withinAtLayer3` -6. Fourteen hand-built arithmetic
 * impossibilities passed in one batch, and an independent value sweep found 41
 * of 200 witnessed leaf instances accepting a falsification.
 *
 * A lap, a distance, a tile count and a damage figure are all NON-NEGATIVE by
 * construction, and "the board it was taken on is gone" is a reason this file
 * cannot re-derive the number — it is not a reason the number can be negative.
 * So non-negative is the DEFAULT, and the exceptions are named, one at a time,
 * with the reason the quantity really can go below zero. There are exactly two
 * in the fleet and they are both DELTAS.
 */
const WITNESS_NONNEG_OR_NULL = (v) =>
  v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0)
    ? null
    : `is ${JSON.stringify(v)}, not a non-negative finite number or null`;

/**
 * A SEARCH COUNTER. The tail of the sentence is BUILT FROM THE CLOSURES, so a
 * counter with none says it has none. That difference is the entire round-15
 * fix: 94 leaves used to say "and the census it belongs to closes
 * arithmetically around it" while one declaration kind's census actually did.
 */
const SEARCH_COUNTER = (what, ...closures) =>
  W(
    `${what} — a counter over a search that has finished. Nothing in the shipped board records how many ` +
      `candidates a pass examined, so it is bounded rather than re-derived: it is a non-negative number` +
      (closures.length
        ? `, and, within the census it sits in, ${closureSentence(closures)}`
        : `, and THAT IS THE WHOLE BOUND — no other number on this record closes around it, so this file ` +
          `cannot tell an honest count from a fabricated one, only a count from a non-count`),
    WITNESS_NONNEG,
    closures,
  );
/**
 * A MEASUREMENT ON AN EARLIER LAYER'S BOARD. Same rule: the closures are the
 * sentence. `null` is admissible — a pass that did not run records nothing —
 * so the type bound is number-or-null and every closure skips on null.
 */
const LAYER_EARLIER = (what, ...closures) =>
  W(
    `${what} — a measurement taken on an earlier layer's board, which the layers after it moved. It is ` +
      `kept because the decision was really made on it and a record edited to agree with the outcome is ` +
      `not a record; it is bounded rather than re-derived, and the AS-SHIPPED reading of the same quantity ` +
      `is a separate, re-derived field beside it. It is a NON-NEGATIVE finite number or null — the board ` +
      `it was read on is gone, which is why this file cannot re-derive it and is not a reason a lap, a ` +
      `distance, a tile count or a damage figure can be below zero` +
      (closures.length
        ? `, and where the record carries the other side of the comparison, ${closureSentence(closures)}`
        : `, and THAT IS THE WHOLE BOUND — the board it was taken on is gone and no surviving number on ` +
          `this record closes around it`),
    WITNESS_NONNEG_OR_NULL,
    closures,
  );
/**
 * ...and the named exceptions. A DELTA between two boards is the one shape of
 * layer-earlier measurement that is legitimately signed, and the fleet ships
 * exactly two of them (`lane.cost` -2, `lane.gain` -0.06). `bothWays` is the
 * two-sided bound that replaces the sign rule, so the leaf is still held from
 * BOTH directions rather than dropping out of the bounds regime entirely.
 */
const LAYER_EARLIER_SIGNED = (what, whyNegative, lo, hi, ...closures) =>
  W(
    `${what} — a measurement taken on an earlier layer's board, which the layers after it moved. It is a ` +
      `finite number or null, and it is one of this table's two NAMED SIGNED exceptions to the ` +
      `non-negative rule: ${whyNegative}. It is bounded on BOTH sides, in [${lo}, ${hi}]` +
      (closures.length
        ? `, and ${closureSentence(closures)}`
        : `, and THAT IS THE WHOLE BOUND — no other number on this record closes around it`),
    (v) =>
      v === null || (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi)
        ? null
        : `is ${JSON.stringify(v)}, not null and not a finite number in [${lo}, ${hi}]`,
    closures,
  );

const RECORD_LEAVES = new Map(([
  // ---------------------------------------------------------------- towerRefill
  [
    "towerRefill|",
    {
      "towerRefill.maxRefill": D,
      "towerRefill.cap": D,
    },
  ],
  // ---------------------------------------------------------------- shell (link on cut)
  [
    "shell|",
    {
      "linkOnCut.onCut": D,
      "linkOnCut.cutTiles": D,
      "linkOnCut.forced": D,
      "linkOnCut.negotiatedCutTiles": LAYER_EARLIER(
        `the size of the cut layer 2 negotiated, before the bubbles, the adopted seal tiles and the inert ` +
          `prune moved the wall. It is deliberately NOT ordered against the shipped count: the fleet's ` +
          `twelve records run from three tiles under to two tiles over, because the bubbles ADD and the ` +
          `prune SUBTRACTS, so an inequality here would be a coincidence of this artifact rather than a ` +
          `property of the pass`,
        ATLEAST(1, "a cut that enclosed a room had tiles in it"),
        LE(BOARD("interiorWalkable")),
        // ROUND 17 / F6: "deliberately not ordered against the shipped count"
        // was right and left the leaf with a ceiling 10x its own scale, which a
        // x5 inflation walked past in all 12 rooms. An ORDER would be a
        // coincidence; a BAND is the property — the passes between layer 2 and
        // the shipped wall add and subtract a tile or two (0.96x to 1.05x on
        // this fleet), so half to twice is generous by a factor of 20.
        PRED("and it is between half and twice the cut this room ships — the passes between move that wall, they do not redraw it", (self, get) => {
          const a = cnum(self);
          const shipped = cnum(get(BOARD("shippedCut")));
          if (a === null || shipped === null) return null;
          return a >= shipped / 2 && a <= 2 * shipped
            ? null
            : `is ${a} against a shipped cut of ${shipped} tile(s) — the bubbles ADD and the prune ` +
                `SUBTRACTS, and across this fleet the two together move the count between 0.96x and 1.05x`;
        }),
      ),
    },
  ],
  // ---------------------------------------------------------------- battlements
  [
    "battlements|",
    {
      "battlements.unreachable": D,
      "battlements.cutTiles": D,
      "battlements.substitute.kind": W(
        `which of three answers layer 2's ALTERNATIVE-enclosure search gave: "swap" (a fully reachable cut ` +
          `exists within the swap budget), "small" (every reachable enclosure is too small for the program) ` +
          `or "none" (no protect radius produces a reachable cut at all). The search ran over enclosures ` +
          `this room did not build, so the board carries no trace of it. The label is one of the three`,
        (v) => (["swap", "small", "none"].includes(String(v)) ? null : `is ${JSON.stringify(v)}, not one of swap/small/none`),
        [
          BESPOKE(
            "battlements.substitute.branch",
            "the numbers under it are present exactly for the branch that names them, and absent for the branches that do not",
          ),
        ],
      ),
      "battlements.substitute.altCut": SEARCH_COUNTER(
        `the alternative cut's size, on the "swap" branch — a cut within the swap budget of the one this ` +
          `room built`,
        PRED("and it is within `budget` tiles of `thisCut`, which is what made it a swap candidate", (self, get) => {
          const a = cnum(self);
          const t = cnum(get("battlements.substitute.thisCut"));
          const b = cnum(get("battlements.substitute.budget"));
          if (a === null || t === null || b === null) return null;
          return a <= t + b
            ? null
            : `is ${a} against a shipped cut of ${t} and a swap budget of ${b} — an "alternative within ` +
                `the budget" that is ${a - t} tiles bigger was never within it`;
        }),
      ),
      "battlements.substitute.thisCut": D,
      "battlements.substitute.budget": SEARCH_COUNTER(`the swap budget the alternative was priced against`),
      "battlements.substitute.radius": SEARCH_COUNTER(`the protect radius of the best reachable enclosure`),
      "battlements.substitute.cut": SEARCH_COUNTER(`that enclosure's cut size`),
      "battlements.substitute.deep": SEARCH_COUNTER(
        `the deep tiles it encloses`,
        PRED('and on the "small" branch it is UNDER the floor beside it, which is what "too small" means', (self, get) => {
          const d = cnum(self);
          const n = cnum(get("battlements.substitute.needDeep"));
          if (d === null || n === null) return null;
          return String(get("battlements.substitute.kind")) !== "small" || d < n
            ? null
            : `is ${d} against a program floor of ${n} on the "small" branch — an enclosure that MEETS the ` +
                `floor is not one the program refused for being too small`;
        }),
      ),
      "battlements.substitute.needDeep": SEARCH_COUNTER(`the deep-tile floor the program needs`),
    },
  ],
  [
    "battlements|unreachable",
    {
      "battlements.unreachable": D,
      "battlements.strandedByMass": D,
      "battlements.unreachableAtLayer2": LAYER_EARLIER(
        `how many of these tiles the interior walk region could not reach when layer 2 finished — the ` +
          `subtrahend that makes "our own mass stranded it" a claim rather than a copy of layer 2's count. ` +
          `The layer-2 walk region is gone, and \`strandedByMass\` is re-derived here as the difference`,
        ATLEAST(0, "a count of tiles"),
        LE("battlements.unreachable"),
      ),
    },
  ],
  // ---------------------------------------------------------------- misc/off-network
  [
    "misc|off-network",
    {
      "offNetwork.mineral.x": D,
      "offNetwork.mineral.y": D,
      "offNetwork.extractor": D,
      "offNetwork.extractor.x": D,
      "offNetwork.extractor.y": D,
      "offNetwork.extractorNetTiles": D,
      "offNetwork.extractorStands": D,
      "offNetwork.extractorObstacle": D,
      "offNetwork.seats": D,
      "offNetwork.netTiles": D,
      "offNetwork.roads": D,
      "offNetwork.regenTicks": D,
      "offNetwork.extractorCooldown": D,
    },
  ],
  // ---------------------------------------------------------------- runtime
  [
    "runtime|heavy-search",
    {
      "runtime.compositions": D,
      "runtime.seeds": D,
      "runtime.complete": D,
      "runtime.ladder": D,
      "runtime.seedSkip": D,
    },
  ],
  // ---------------------------------------------------------------- towers/clump
  [
    "towers|clump",
    {
      "clump.within": D,
      "clump.total": D,
      "clump.cheb": D,
      "clump.note": D,
      "clump.sitter.x": D,
      "clump.sitter.y": D,
      source: D,
      "dispersion.counted": D,
      "dispersion.windowBefore": LAYER_EARLIER(
        `layer 3's 5x5 window reading BEFORE its dispersion pass`,
        GE("dispersion.windowAfter"),
        MIRROR_DISP("before"),
      ),
      "dispersion.windowAfter": D,
      "dispersion.totalAtLayer3": LAYER_EARLIER(
        `how many towers layer 3 had placed when it measured`,
        GE("dispersion.withinAtLayer3"),
        ATMOST(6, "the RCL8 tower program is six"),
      ),
      "dispersion.withinAtLayer3": LAYER_EARLIER(
        `how many of them were inside chebyshev 2 of the sitter then`,
        LE("dispersion.totalAtLayer3"),
      ),
      "dispersion.tiebreakBudget": SEARCH_COUNTER(`the swap budget the dispersion pass was allowed to spend on ties`, KONST("TOWER_TIEBREAK_BUDGET", TOWER_TIEBREAK_BUDGET)),
      // ==================================================================
      // ROUND 16, OF6/F11-cause-3: THE THREE STATISTICS THE PASS RANKS ON,
      // AND THE TWO OF THEM THAT ARE ON THE BOARD.
      //
      // The dispersion pass used to rank swaps on the whole-mass 5x5 window
      // alone while its declaration is about the CLUMP; the objective is a
      // tuple now and the record publishes all three. Two of the three
      // "after" readings are the SHIPPED board, so they are re-derived here
      // rather than mirrored — which is what stops this census from being
      // carried across a room boundary. S1 swapped E11S6's and E3S5's whole
      // dispersion censuses and both stayed internally legal; against
      // `clumpAfter` and `towerWindowAfter` re-derived from the room's own
      // towers, a permuted census names the wrong room's battery.
      // ==================================================================
      "dispersion.search.instruments": D,
      "dispersion.search.clumpAfter": D,
      "dispersion.search.towerWindowAfter": D,
      "dispersion.search.clumpBefore": LAYER_EARLIER(
        `the clump reading before the dispersion pass ran`,
        GE("dispersion.search.clumpAfter"),
        ATMOST(6, "the RCL8 tower program is six"),
      ),
      "dispersion.search.towerWindowBefore": LAYER_EARLIER(
        `the tower-only 5x5 window before it ran`,
        GE("dispersion.search.towerWindowAfter"),
        ATMOST(6, "the RCL8 tower program is six"),
      ),
      "dispersion.search.rounds": SEARCH_COUNTER(
        `dispersion pass rounds`,
        MIRROR_DISP("search.rounds"),
        // A4: a dispersion pass that examined ZERO swaps printed the unchanged
        // claim "every legal swap either left the window where it was or cost
        // the wall damage" above it, and every intra-record relation still
        // closed — because a census of nothing closes trivially. A round of a
        // swap pass is a pass over the candidate swaps; a round that examined
        // none did not run. Same rule `repair.mass.rounds` already carries.
        PRED(
          "and a round that examined no swap at all did not run — a pass over the candidates that " +
            "looked at none of them is not a round",
          (self, get) => {
            const r2 = cnum(self);
            if (r2 === null || r2 === 0) return null;
            const tried = cnum(get("dispersion.search.singleSwapsTried"));
            const pairs = cnum(get("dispersion.search.pairSwapsTried"));
            if (tried === null && pairs === null) return null;
            return (tried || 0) + (pairs || 0) > 0
              ? null
              : `is ${r2} and the pass is recorded as having examined 0 single-slot and 0 pair swaps. ` +
                  `The declaration this census sits under says every legal swap either left the window ` +
                  `where it was or cost the wall damage — a claim about a set the record says was empty`;
          },
        ),
      ),
      "dispersion.search.singleSwapsTried": SEARCH_COUNTER(
        `single-slot swaps examined`,
        GE("dispersion.search.singleSwapsScoreTied"),
        MIRROR_DISP("search.singleSwapsTried"),
        // ...and a single-slot swap is (one of the six towers) x (one seat of
        // this room's interior floor), so the enumeration has a room-derived
        // ceiling. It is generous — layer 3 looks at a board with fewer things
        // on it than the shipped one — and that is the point: it is a bound
        // taken off the ROOM, which is the thing a permuted census cannot carry
        // with it. E2S8's hill-climb was laundered to 24300 seats and 284400
        // swaps and every intra-record relation still closed.
        PRED(
          "and it is at most six towers' worth of this room's own interior floor, which is every " +
            "single-slot swap the room can offer",
          (self, get) => {
            const a = cnum(self);
            const w = cnum(get(BOARD("interiorWalkable")));
            if (a === null || w === null) return null;
            const cap = 6 * w;
            return a <= cap
              ? null
              : `is ${a} and this room has ${w} walkable interior tile(s), so six towers cannot be offered ` +
                  `more than ${cap} single-slot swaps between them`;
          },
        ),
      ),
      // E11S6 SHIPPED 900 SCORE-TIED OUT OF 755 TRIED, AND 500 OUT OF ZERO PAIR
      // SWAPS, AND RENDERED IT. "Of those" is a subset word; this is the
      // subsetting.
      "dispersion.search.singleSwapsScoreTied": SEARCH_COUNTER(
        `of those, the ones that scored equal`,
        LE("dispersion.search.singleSwapsTried"),
        MIRROR_DISP("search.singleSwapsScoreTied"),
      ),
      "dispersion.search.pairSwapsTried": SEARCH_COUNTER(
        `two-slot swaps examined`,
        GE("dispersion.search.pairSwapsScoreTied"),
        GE("dispersion.search.pairImproved"),
        MIRROR_DISP("search.pairSwapsTried"),
      ),
      "dispersion.search.pairSwapsScoreTied": SEARCH_COUNTER(
        `of those, the ones that scored equal`,
        LE("dispersion.search.pairSwapsTried"),
        MIRROR_DISP("search.pairSwapsScoreTied"),
      ),
      "dispersion.search.improvedBy": SEARCH_COUNTER(
        `how much the window improved`,
        DIFFEQ("dispersion.windowBefore", "dispersion.windowAfter"),
        MIRROR_DISP("search.improvedBy"),
      ),
      "dispersion.search.pairImproved": SEARCH_COUNTER(
        `how many pair swaps improved it`,
        LE("dispersion.search.pairSwapsTried"),
        // an improving swap is chosen from the SCORE-TIED ones, so this is the
        // last link of that chain and not merely a subset of the first
        LE("dispersion.search.pairSwapsScoreTied"),
        MIRROR_DISP("search.pairImproved"),
      ),
    },
  ],
  // keys are normalised the way buildArbitration keys a declaration, so a gate
  // written `spawnFan` and a gate written `spawnfan` reach the same table
].map(([k, v]) => [normPair(k), v])));

/**
 * The rest of the table, split out only because one object literal of 375 leaves
 * is unreadable. Same three classes, same closure rule.
 */
for (const [k, v] of [
  // ---------------------------------------------------------------- eco
  [
    "eco|",
    {
      "eco.pathController": D,
      "eco.pathSourcesSum": D,
      "eco.anchorSpread": D,
      "eco.anchorWalkSpread": D,
      "eco.anchorWalkFloor": D,
      "eco.anchorFloorBasis": D,
      "eco.chebFloor": D,
      "eco.walkFloor": D,
      "eco.spreadPair": D,
      "eco.walkPair": D,
      "eco.ctrlBearing": D,
      "eco.srcBearings": D,
      "eco.ctrlAbs": D,
      "eco.srcAbs": D,
      "eco.relMult": D,
      "eco.ctrlGate": D,
      "eco.srcGate": D,
      "eco.ctrlMedian": D,
      "eco.srcMedian": D,
      "eco.fleetMediansMeasured.ctrlWalk": D,
      "eco.fleetMediansMeasured.srcSum": D,
      "eco.fleetMediansMeasured.rooms": D,
      "eco.seedSkip": D,
      // L9. This leaf's generated `why` used to end "and THAT IS THE WHOLE
      // BOUND — no other number on this record closes around it", and that was
      // FALSE IN THE SAFE DIRECTION: `eco.coreSize` carries `LE("eco.basin")`,
      // so the basin was already bounded from below by the core it contains.
      // The generator only enumerated a leaf's OUTBOUND closures, so an inbound
      // one — the whole point of which is that it constrains the leaf it names —
      // read as absent. The generator is fixed (see the inbound-closure check in
      // `assertRecordInventory`, which now REFUSES a leaf that claims to be
      // unbounded while a sibling is held to it) and the missing upper bound is
      // supplied: a basin is a set of walkable interior tiles and cannot hold
      // more of them than this room has.
      "eco.basin": SEARCH_COUNTER(
        `how many tiles layer 1's hub basin held when it ranked the seeds. The basin is a scoring ` +
          `intermediate; no structure records it`,
        GE("eco.coreSize"),
        // ...against the room's WALKABLE FLOOR, not its interior: layer 1 ranks
        // seeds before any wall exists, so the basin is not confined by one.
        LE(BOARD("interiorTiles")),
      ),
      // ROUND 17 / F3: both of these were witnessed numbers whose only real
      // bound was a mirror written in the same pass, and a coordinated edit of
      // record and mirror moved either one anywhere (38 declarations each).
      // Neither is actually unknowable.
      "eco.coreSize": SEARCH_COUNTER(
        `the size of the core layer 1 grew around the chosen seed`,
        // the core is grown INSIDE the basin, so it cannot be larger than it
        LE("eco.basin"),
        EQ("@meta.coreSize"),
        // ...and it is a SLICE of the basin, of a length this file owns. The
        // core is `basin.filter(not an object tile).slice(0, CORE_SIZE)`, so it
        // is CORE_SIZE unless the basin could not supply that many — and the
        // smallest basin the fleet ships is 142, against at most four object
        // tiles a basin can contain (two sources, the controller, the mineral).
        ATMOST(CORE_SIZE, "layer 1's CORE_SIZE — the core IS the first CORE_SIZE tiles of the basin"),
        PRED(
          "a core shorter than CORE_SIZE is a basin that could not supply CORE_SIZE non-object tiles",
          (self, get) => {
            const a = cnum(self);
            const b = cnum(get("eco.basin"));
            if (a === null || b === null || a >= CORE_SIZE) return null;
            return b - 4 >= CORE_SIZE
              ? `is ${a}, short of the ${CORE_SIZE} tiles layer 1 slices off the basin, in a room whose ` +
                  `basin holds ${b} tiles — at most four of which (the sources, the controller, the ` +
                  `mineral) are object tiles the core skips`
              : null;
          },
        ),
      ),
      "eco.seedPool": SEARCH_COUNTER(
        `how many seeds layer 1 ranked before it took this one`,
        ATLEAST(1, "the seed it took was one of them"),
        EQ("@meta.seedPool"),
        // ...and the mirror is no longer the whole of it: `eco/seed-pool`
        // re-derives the pool from this room's TERRAIN in all 172 rooms (the
        // admissibility half of layer 1's seed score — pocket depth, edge
        // margin, every anchor reachable, not glued to one of them — capped at
        // the 25 layer 1 ranks), and it reproduces the published number in 172
        // of 172. This closure names the leaf that check stands behind.
        GE("eco.seedSkip"),
      ),
    },
  ],
  // ---------------------------------------------------------------- extensions/shallow
  [
    "extensions|shallow",
    {
      "shallowExt.count": D,
      "shallowExt.total": D,
      "shallowExt.depthSafe": D,
      "shallowExt.sharedTarget": W(
        `the one deep tile several shallow slots were all competing for, named by layer 7b's re-run. It is ` +
          `a fact about which slot won a contest, and the losers are not on the board. It is a tile key or ` +
          `null`,
        (v) => (v === null || /^-?\d+,-?\d+$/.test(String(v)) ? null : `is ${JSON.stringify(v)}, not a tile key or null`),
        [BESPOKE("shallowExt.sharedTarget.crosscopy", "it is the same tile key the re-run's own copy names")],
      ),
      // THE THREE OUTCOMES SPLIT THE SLOTS. Every shallow extension that
      // shipped went down exactly one of these branches, so the three counts
      // are the count. A record where they do not close has a slot nobody
      // wrote down — which is where "no deep tile existed at all" gets to
      // absorb a slot a guard actually refused.
      "shallowExt.impossible": SEARCH_COUNTER(
        `slots for which no deep tile existed at all`,
        LE("shallowExt.count"),
        PRED(
          "and it is the number of SLOT ROWS that were offered nothing — the headline counter and the rows " +
            "underneath it are one census",
          (self, get) => {
            const a = cnum(self);
            const rows = carr(get("shallowExt.slots"));
            if (a === null || !rows) return null;
            const n = rows.filter((r) => r && cnum(r.targets) === 0).length;
            return a === n
              ? null
              : `is ${a} and ${n} of the ${rows.length} slot row(s) were offered no deep target at all. ` +
                  `This is where "no deep tile existed" absorbs a slot that WAS priced and refused — E12S6's ` +
                  `six priced legal trades were laundered into exactly this counter`;
          },
        ),
      ),
      "shallowExt.priced": SEARCH_COUNTER(
        `slots whose relocation was priced`,
        LE("shallowExt.count"),
        PRED(
          "and it is the number of SLOT ROWS that WERE offered a deep target",
          (self, get) => {
            const a = cnum(self);
            const rows = carr(get("shallowExt.slots"));
            if (a === null || !rows) return null;
            const n = rows.filter((r) => r && cnum(r.targets) !== null && r.targets > 0).length;
            return a === n
              ? null
              : `is ${a} and ${n} of the ${rows.length} slot row(s) were offered at least one deep target`;
          },
        ),
      ),
      "shallowExt.refusedByTest": SEARCH_COUNTER(
        `slots a guard refused`,
        LE("shallowExt.count"),
        PRED(
          "and the three outcomes — impossible, priced, refused-by-test — account for every shallow slot the room ships",
          (self, get) => {
            const parts = ["shallowExt.impossible", "shallowExt.priced", "shallowExt.refusedByTest"];
            const vs = parts.map((p) => cnum(get(p)));
            const n = cnum(get("shallowExt.count"));
            if (n === null || vs.some((v) => v === null)) return null;
            const s = vs.reduce((a, b) => a + b, 0);
            return s === n
              ? null
              : `: ${parts.map((p, i) => `${p.replace("shallowExt.", "")} ${vs[i]}`).join(" + ")} is ${s} ` +
                  `against ${n} shallow extension(s) shipped — every slot takes exactly one of those three ` +
                  `branches, so a census that does not close has a slot nobody wrote down`;
          },
        ),
      ),
      "shallowExt.slots": W(
        `the per-slot search record — for each shallow extension, how many deep targets it had, how many ` +
          `were road-faced, how many were one pave away, and how many were examined. Every number in it is ` +
          `about candidate tiles the room did NOT take, which the shipped board cannot show. It is an array ` +
          `of objects, one per shallow slot`,
        null,
        [LENIS("shallowExt.count")],
      ),
      "shallowExt.search.interiorTiles": SEARCH_COUNTER(
        `interior tiles the re-run scanned — the whole buildable band, which is the same 48x48 in every ` +
          `room in the game, so this one is a constant wearing a counter's name`,
        KONST("BUILDABLE_BAND_TILES", BUILDABLE_BAND_TILES),
        GE("shallowExt.search.freeDeepOnePave"),
        GE("shallowExt.search.freeDeepRoadFaced"),
      ),
      // OF10. The scan sweeps the 48x48 BAND and the sentence used to call the
      // 2304 positions "interior tiles" in both channels, in rooms that have
      // 178, 221 and 255 of them. The producer now publishes the band's side
      // and the room's own interior floor separately, and THIS one is not a
      // counter at all — it is a property of the room's shipped wall, so it is
      // re-derived here rather than witnessed. It is also the anchor that makes
      // this census un-swappable between rooms.
      "shallowExt.search.bandSide": D,
      "shallowExt.search.interiorWalkable": D,
      // ==============================================================
      // ROUND 17 / F6 — THE CEILING WAS THE BAND, NOT THE ROOM.
      // ==============================================================
      // Both of these were bounded by `interiorTiles`, which is the 48x48
      // BAND — the constant 2304, in every room in the game — while
      // `interiorWalkable` (this room's own floor: 178 in E9S2, 221 in E2S3,
      // 255 in E12S6) sat two lines above, already class D. `freeDeepOnePave`
      // accepted **2303** in all three rooms. Criticism 54(d) said the 2304
      // figure had been "published and fixed in all three channels that quoted
      // it"; the closure was a fourth channel still quoting it.
      //
      // The room's own floor is the honest ceiling, and `#freeDeepInterior` —
      // empty walkable interior tiles at or past the depth floor, re-derived
      // off the shipped board — is tighter still. It is a CEILING and not an
      // equality because the scan ran on the post-prune board, which is not
      // quite the board the room ships.
      "shallowExt.search.freeDeepOnePave": SEARCH_COUNTER(
        `free deep tiles one pave from the network`,
        LE("shallowExt.search.interiorWalkable"),
        LE(BOARD("freeDeepInterior")),
      ),
      "shallowExt.search.freeDeepRoadFaced": SEARCH_COUNTER(
        `free deep tiles that already had a road face`,
        LE("shallowExt.search.interiorWalkable"),
        LE(BOARD("freeDeepInterior")),
      ),
      "shallowExt.search.left": SEARCH_COUNTER(
        `free deep road-faced tiles still on the table when the re-run finished`,
        LE("shallowExt.search.freeDeepRoadFaced"),
        PRED(
          "and it is exactly `freeDeepRoadFaced` minus what the backfill and the relocations spent — the " +
            "scan counted those tiles once and every one of them went to an add, to a move, or nowhere",
          (self, get) => {
            const a = cnum(self);
            const f = cnum(get("shallowExt.search.freeDeepRoadFaced"));
            const adds = cnum(get("shallowExt.search.spentOnAdds"));
            const moves = cnum(get("shallowExt.search.spentOnMoves"));
            if (a === null || f === null || adds === null || moves === null) return null;
            return a === f - adds - moves
              ? null
              : `is ${a} and the scan found ${f} free deep road-faced tile(s), of which ${adds} went to ` +
                  `adds and ${moves} to moves — ${f - adds - moves} left. A tile that was counted, not ` +
                  `spent and not left is a tile the census lost`;
          },
        ),
      ),
      "shallowExt.search.paveLeft": SEARCH_COUNTER(
        `pave budget left`,
        // the one-pave class is counted once, and what was TAKEN plus what is
        // LEFT cannot exceed it (a member can also be refused, which is why
        // this is an inequality and not the identity `left` carries for the
        // road-faced class — E12S6 ships 4 found, 3 taken and 0 left). It had
        // no closure at all, so a x5 inflation with the prose regenerated
        // walked past it.
        LE("shallowExt.search.freeDeepOnePave"),
        PRED("and what the pave budget took plus what it has left cannot exceed the class it was counted from", (self, get) => {
          const a = cnum(self);
          const t = cnum(get("shallowExt.search.paveTaken"));
          const f = cnum(get("shallowExt.search.freeDeepOnePave"));
          if (a === null || t === null || f === null) return null;
          return a + t <= f
            ? null
            : `is ${a} with ${t} taken, against a one-pave class of ${f} tile(s) — the scan counted those ` +
                `tiles once`;
        }),
      ),
      "shallowExt.search.paveTaken": SEARCH_COUNTER(
        `pave budget spent — one plain pave per free deep tile that needed one, so it cannot outrun the ` +
          `tiles that were one pave away`,
        LE("shallowExt.search.freeDeepOnePave"),
      ),
      "shallowExt.search.refused": W(
        `the per-tile refusal list of the re-run: which candidate deep tiles were rejected and why. The ` +
          `candidates are tiles the room does not build on, so the refusal is about a board that was never ` +
          `shipped. Each entry names a tile key and carries a reason, and the list is as long as the count ` +
          `beside it`,
        null,
        [LENIS("shallowExt.search.refusedCount")],
      ),
      "shallowExt.search.refusedCount": SEARCH_COUNTER(
        `how many candidates were refused`,
        LEN("shallowExt.search.refused"),
        // one refusal costs one examination at minimum
        LE("shallowExt.search.refusedExaminations"),
      ),
      "shallowExt.search.refusedExaminations": SEARCH_COUNTER(
        `how many examinations those refusals cost`,
        GE("shallowExt.search.refusedCount"),
        LE(BOARD("interiorWalkable")),
      ),
      "shallowExt.search.sharedTarget": W(
        `the re-run's own copy of \`sharedTarget\`. It is a tile key or null`,
        (v) => (v === null || /^-?\d+,-?\d+$/.test(String(v)) ? null : `is ${JSON.stringify(v)}, not a tile key or null`),
        [EQ("shallowExt.sharedTarget")],
      ),
      "shallowExt.search.sharedTargetSlots": SEARCH_COUNTER(
        `how many slots wanted that one tile`,
        LE("shallowExt.count"),
        PRED(
          "and it is the number of SLOT ROWS whose cheapest legal target IS that tile, and it is zero " +
            "exactly when there is no shared target to want",
          (self, get) => {
            const a = cnum(self);
            const rows = carr(get("shallowExt.slots"));
            const st = get("shallowExt.sharedTarget");
            if (a === null || !rows) return null;
            if (st === null || st === undefined) {
              return a === 0
                ? null
                : `is ${a} and \`sharedTarget\` is null — ${a} slot(s) are recorded as competing for a tile ` +
                    `the record says does not exist`;
            }
            const n = rows.filter((r) => r && r.bestLegal && `${r.bestLegal.x},${r.bestLegal.y}` === String(st)).length;
            return a === n
              ? null
              : `is ${a} and ${n} of the ${rows.length} slot row(s) name ${st} as their cheapest legal ` +
                  `target. The contest and the rows that entered it are one fact`;
          },
        ),
      ),
      "shallowExt.search.spentOnAdds": SEARCH_COUNTER(
        `relocations that added a tile`,
        LE("shallowExt.count"),
      ),
      "shallowExt.search.spentOnMoves": SEARCH_COUNTER(
        `relocations that moved one`,
        LE("shallowExt.count"),
      ),
    },
  ],
]) {
  RECORD_LEAVES.set(normPair(k), v);
}

for (const [k, v] of [
  // ---------------------------------------------------------------- labs
  [
    "labs|lab-haul",
    {
      source: D,
      "labs.anchor.x": D,
      "labs.anchor.y": D,
      "labs.orientation": D,
      "labs.haulDist": D,
      "labs.depthSafe": D,
      "labs.fleetMedian": D,
      "labs.fleetP90": D,
      "labs.roadEatCost": D,
      "labs.shallowLabCost": D,
      "labs.deepAnchors": D,
      "labs.fallbackAnchors": D,
      // THE REFUSAL CENSUS COUNTS ANCHORS, AND THE ANCHOR POOL IS PUBLISHED.
      // Every refusal is a candidate anchor of this room that scored above the
      // winner, so no single class — and not the four together — can exceed
      // the anchors the enumeration had to walk.
      "labs.refused.wall": SEARCH_COUNTER(
        `anchors refused ahead of the winner because the lab stamp would strand a wall segment the ` +
          `garrison can walk today. The census counts candidates in strict SCORE order up to the winner and ` +
          `never resets, so it is a fact about the order the search walked and not about the room`,
        PRED(
          "and the four refusal classes together cannot outnumber the anchor pool `labs.deepAnchors` + `labs.fallbackAnchors` they are drawn from",
          (self, get) => {
            const parts = ["labs.refused.wall", "labs.refused.mineral", "labs.refused.network", "labs.refused.lap"];
            const vs = parts.map((p) => cnum(get(p)));
            const deep = cnum(get("labs.deepAnchors"));
            const fb = cnum(get("labs.fallbackAnchors"));
            if (deep === null || fb === null || vs.some((v) => v === null)) return null;
            const s = vs.reduce((a, b) => a + b, 0);
            return s <= deep + fb
              ? null
              : `: ${parts.map((p, i) => `${p.split(".").pop()} ${vs[i]}`).join(" + ")} is ${s} refusal(s) ` +
                  `against an anchor pool of ${deep} deep + ${fb} fallback = ${deep + fb}. Every refusal is ` +
                  `one of those anchors`;
          },
        ),
      ),
      "labs.refused.mineral": SEARCH_COUNTER(
        `anchors refused because the stamp left the mineral no reachable seat`,
        // ...and an anchor is a tile of this room, so the count cannot outrun
        // the room's own anchor pool. It is generous, and it is a bound taken
        // off the BOARD rather than off the record beside it
        LE(BOARD("interiorWalkable")),
      ),
      "labs.refused.network": SEARCH_COUNTER(
        `anchors refused because eating their roads would split the network. It is nominally the same ` +
          `counter as \`eatBlockedByNet\` on a lab-road-eat record — but that identity is CROSS-KIND and ` +
          `this fleet has no room carrying both declarations, so it is declared inert below rather than ` +
          `left as a bound a reader would assume runs`,
        BESPOKE("labs.refused.network.dormant", "the cross-kind identity it names is asserted, with its reason, wherever it can run"),
      ),
      "labs.refused.lap": SEARCH_COUNTER(
        `anchors refused for creating or worsening a gated-over-target defender pair. Budget-dependent: ` +
          `once the 16-anchor veto budget is spent every undecided anchor counts as breaching`,
        LE(BOARD("interiorWalkable")),
      ),
    },
  ],
  [
    "labs|shallow-lab",
    {
      source: D,
      "labs.total": D,
      "labs.shallow": D,
      "labs.depthSafe": D,
      "labs.shallowLabCost": D,
      "labs.deepAnchors": D,
      "labs.fallbackAnchors": D,
      "labs.dryAnchors": D,
    },
  ],
  [
    "labs|lab-road-eat",
    {
      source: D,
      "labs.eaten": D,
      "labs.depthSafe": D,
      "labs.roadEatCost": D,
      "labs.deepAnchors": D,
      "labs.fallbackAnchors": D,
      "labs.eatAnchors": W(
        `how many anchors the road-eating passes enumerated. The passes run in order and the counter is the ` +
          `MAX over the ones that ran, so which pass produced it is not on the record`,
        WITNESS_NONNEG,
        [
          ATLEAST(1, "a winner came out of one of the passes"),
          GE("labs.eatBlockedByNet"),
          BESPOKE(
            "labs.eatAnchors.ceiling",
            "it is at most the depth >= 3 lab-stamp enumeration over this room's own terrain, re-derived here",
          ),
        ],
      ),
      "labs.eatBlockedByNet": SEARCH_COUNTER(
        `anchors whose road-eat would have split the network, counted up to the winner in score order`,
        // every blocked anchor is one of the anchors the eating pass enumerated
        LE("labs.eatAnchors"),
      ),
    },
  ],
  // ---------------------------------------------------------------- ctrlParks
  [
    "ctrlParks|seats",
    {
      "ctrlParks.parks": D,
      "ctrlParks.built": D,
      "ctrlParks.eaten": D,
      "ctrlParks.eaters": D,
      "ctrlParks.floor": D,
      "ctrlParks.thinAt": D,
      "ctrlParks.link.x": D,
      "ctrlParks.link.y": D,
      "ctrlParks.controller.x": D,
      "ctrlParks.controller.y": D,
      "ctrlParks.census.considered": D,
      "ctrlParks.census.minParksFloor": D,
      "ctrlParks.census.tookFirstAboveFloor": D,
      "ctrlParks.census.chosen.x": D,
      "ctrlParks.census.chosen.y": D,
      "ctrlParks.census.chosen.parks": D,
      "ctrlParks.census.chosen.hubWalk": D,
      "ctrlParks.census.chosen.score": D,
      "ctrlParks.census.runnerUp.x": W(
        `WHICH candidate came second. The ladder's runner-up is picked over the SEAL-FILTERED pool, and the ` +
          `seal test is a re-flood of layer 1's board per candidate that this file does not replay; what IS ` +
          `re-derived is that the named tile is a real candidate of this room's own controller ring and that ` +
          `every number attached to it — parks, hubWalk, score — is that tile's, each of which is a ` +
          `SEPARATE derived leaf below. On the coordinate itself, its type is the only bound this file ` +
          `holds it to`,
      ),
      "ctrlParks.census.runnerUp.y": W(
        `the other half of the same tile key — its type is the only bound this file holds it to; see ` +
          `\`runnerUp.x\` for what IS re-derived about the tile the two of them name`,
      ),
      "ctrlParks.census.runnerUp.parks": D,
      "ctrlParks.census.runnerUp.hubWalk": D,
      "ctrlParks.census.runnerUp.score": D,
      "ctrlParks.census.maxParks": W(
        `the roomiest seat count anywhere in the candidate pool — the number the paragraph turns into "N ` +
          `seats is therefore the room's CEILING, not a preference". The pool is the candidate list minus ` +
          `the tiles whose link would seal a pocket, and the seal test is not replayed here. It is a ` +
          `non-negative number`,
        WITNESS_NONNEG,
        [
          BESPOKE(
            "ctrlParks.seats.ceiling",
            "it is held two-sidedly against this room's own controller ring: it may not exceed the maximum " +
              "over the whole candidate list, and the candidates roomier than it may not outnumber the " +
              "room's published `sealing` count, so a deflated ceiling has to be paid for in sealing tiles",
          ),
        ],
      ),
      "ctrlParks.census.sealing": W(
        `how many candidates were dropped because the link there would seal a pocket. chokeTest re-floods ` +
          `layer 1's board once per candidate. It is a non-negative number`,
        WITNESS_NONNEG,
        [LE("ctrlParks.census.considered"), BESPOKE("ctrlParks.seats.ceiling", "it is the currency the seat ceiling is paid for in")],
      ),
      "ctrlParks.census.forcedOntoSealingPool": W(
        `whether EVERY candidate sealed, so the ladder had to run over the sealing pool anyway`,
        WITNESS_BOOL,
        [
          PRED("it is true exactly when `sealing` equals `considered`", (self, get) => {
            const s = cnum(get("ctrlParks.census.sealing"));
            const c = cnum(get("ctrlParks.census.considered"));
            if (typeof self !== "boolean" || s === null || c === null) return null;
            return self === (s === c)
              ? null
              : `is ${self} with ${s} of ${c} candidates sealing — the ladder falls back to the sealing ` +
                  `pool exactly when there is nothing else`;
          }),
        ],
      ),
    },
  ],
  [
    "ctrlParks|released",
    {
      "ctrlParks.held": D,
      "ctrlParks.kept": D,
      "ctrlParks.released": D,
      "ctrlParks.floor": D,
      "ctrlParks.parksShipped": D,
      "ctrlParks.deepTiles": D,
      "ctrlParks.shallowReleasing": D,
      "ctrlParks.rampartsReleasing": D,
      "ctrlParks.composedFrom": D,
      "ctrlParks.winningCap": D,
      // ==================================================================
      // CRITICISM 4, RE-LANDED THROUGH THE RECORD, AND CLOSED HERE.
      //
      // The paragraph says "every cap from N down to M was composed IN FULL
      // and measured — every rung, no early exit", and round 14 made it derive
      // that sentence from `composedCaps` instead of asserting it. The guard
      // it got tested PRESENCE. So `composedCaps=[6]` with `composedTo=6`
      // rendered "1 cap was composed in full — 6 down to 6, every rung, no
      // early exit" beside "Cap 2 is the best of them", with cap 2 never
      // composed; `[99,1,7,7,-3]` rendered "99 down to -3, every rung"; and
      // `[]` rendered "0 caps were composed" while still naming a winner.
      // The descent is now CONTENT-CHECKED: contiguous, descending by one,
      // anchored at both ends, and containing the cap that won.
      // ==================================================================
      "ctrlParks.composedTo": W(
        `the lowest park cap the release loop actually composed. The loop walks down from held-1 and stops ` +
          `early when a rung reaches zero shallow extensions; where it stopped is a fact about the walk and ` +
          `not about the board. It is a non-negative number`,
        WITNESS_NONNEG,
        [LE("ctrlParks.composedFrom"), BESPOKE("ctrlParks.composedCaps.descent", "it is the last rung of `composedCaps`")],
      ),
      "ctrlParks.composedCaps": W(
        `the caps this room composed IN FULL, in the order it composed them — the trail the paragraph's ` +
          `"every cap from N down to M was composed and measured" sentence is derived from instead of ` +
          `asserted. Each entry is a whole room this pass built and threw away, so nothing on the shipped ` +
          `board records them`,
        null,
        [BESPOKE("ctrlParks.composedCaps.descent", "it is a contiguous descent from `composedFrom` to `composedTo` with the winning cap on it")],
      ),
      "ctrlParks.rejectedError": SEARCH_COUNTER(
        `caps whose composition errored out`,
        LE("ctrlParks.composedFrom"),
      ),
      "ctrlParks.rejectedIncomplete": SEARCH_COUNTER(
        `caps that composed but did not complete the program`,
        LE("ctrlParks.composedFrom"),
      ),
      "ctrlParks.rejectedUnderFloor": SEARCH_COUNTER(
        `caps that completed but fed fewer seats than the hard floor`,
        LE("ctrlParks.composedFrom"),
      ),
      "ctrlParks.shallowHolding": W(
        `how many shallow extensions the HOLDING composition shipped — a whole room this pass composed and ` +
          `then threw away, so no board carries it. It is a non-negative number`,
        WITNESS_NONNEG,
        // the release loop accepts a rung only for STRICTLY fewer shallow
        // extensions, so this ordering is what the trade means
        [GE("ctrlParks.shallowReleasing"), LE(BOARD("shippedExtensions"))],
      ),
      "ctrlParks.rampartsHolding": SEARCH_COUNTER(
        `the discarded holding composition's rampart count — the other half of the trade, and on the same ` +
          `board nobody shipped. It is the number the paragraph prices the release AGAINST ("at N total ` +
          `ramparts against M"), so an inverted one turns a saving into a cost and reads clean; the ` +
          `direction of the trade is what is held here`,
        GE("ctrlParks.rampartsReleasing"),
        // ...against the room's own walkable floor rather than its shipped
        // rampart count: the HOLDING composition is the one that was thrown
        // away, and it was thrown away partly FOR costing more ramparts — two
        // of the fleet's two records are above the shipped count by design.
        LE(BOARD("interiorWalkable")),
      ),
    },
  ],
]) {
  RECORD_LEAVES.set(normPair(k), v);
}

for (const [k, v] of [
  // ---------------------------------------------------------------- towers/weak-battery
  [
    "towers|weak-battery",
    {
      source: D,
      // ---- the AS-SHIPPED half: every one of these is the board this room ships
      "battery.maxRefill": D,
      "battery.refillDists": D,
      "battery.minShellDmg": D,
      "battery.avgShellDmg": D,
      "battery.cutTiles": D,
      "battery.weakTiles": D,
      "battery.worst.x": D,
      "battery.worst.y": D,
      "battery.worstOnLink": D,
      "battery.maxRefillHard": D,
      "battery.refillNote": D,
      "battery.weakShellDmg": D,
      "battery.targetMin": D,
      "battery.refillUnreachable": D,
      "battery.inertPruned": SEARCH_COUNTER(
        `how many ramparts layer 7's inert prune took off the wall this battery was scored against`,
        // THE PRUNE PUBLISHES ITSELF. `meta.walls.inertPruned` is written for
        // every room whether it declares or not, so this is one number in two
        // places and a difference is an edit to one copy.
        EQ("@meta.walls.inertPruned"),
      ),
      // ROUND 17 / F2: these two were the LAST unaudited inputs to the
      // `source` derivation — layer-3 witnesses about a board nobody could
      // reconstruct, so clamping them under the soft note and writing
      // `source: "walls"` took the wall arm in 10 of the 15 layer-3 rooms.
      // The board IS reconstructible: the walk is a BFS around obstacles and
      // roads are not obstacles, so it is this room's terrain with the hub and
      // the six towers standing and nothing later on it. Re-derived that way
      // the walks reproduce tower for tower in 172 of 172 rooms.
      "battery.maxRefillAtPlacement": D,
      "battery.refillDistsAtPlacement": D,
      // ---- layer 3's search half: a different board, honestly named
      "towers.maxRefill": LAYER_EARLIER(`layer 3's furthest refill walk`, MAXOF("towers.refillDists"), GE("towers.maxRefillUnblocked"), MIRROR_L3("maxRefill")),
      "towers.maxRefillUnblocked": LAYER_EARLIER(
        `the same walk with our own mass ignored`,
        // taking obstacles away cannot lengthen a shortest walk
        LE("towers.maxRefill"),
      ),
      "towers.refillDists": W(
        `layer 3's per-tower refill walks; see \`refillDistsAtPlacement\`. One walk per tower of the ` +
          `six-tower program, with \`towers.maxRefill\` as its own largest entry`,
        null,
        [LENK(6, "one walk per tower of the RCL8 program"), LENIS(BOARD("shippedTowers"))],
      ),
      "towers.minShellDmg": LAYER_EARLIER(
        `the weakest face of the cut LAYER 3 was given, which the prune and the seal reconciliation then moved`,
        LE("towers.avgShellDmg"),
        MIRROR_L3("minShellDmg"),
      ),
      "towers.avgShellDmg": LAYER_EARLIER(`the mean face damage over that same cut`, GE("towers.minShellDmg"), MIRROR_L3("avgShellDmg")),
      // m8: this `why` shipped through `.replace(/s+/g, " ")` — a missing
      // backslash — so the sentence a reader got was "how many tile that cut
      // had — layer 3' cut ... o it i never maller than the cut the room hip".
      // Every `s` in the string was deleted. The whole file was grepped for
      // siblings of the same shape (`/s+/`, `/S+/`, `/d+/`, `/w+/`, `/b/`) and
      // this was the only one.
      "towers.declaredCutTiles": LAYER_EARLIER(
        `how many tiles that cut had — layer 3's cut, before the inert prune and the seal reconciliation ` +
          `moved it, so it is never smaller than the cut the room ships`,
        GE("towers.weakTiles"),
        GE("battery.cutTiles"),
        LE(BOARD("interiorWalkable")),
        // ROUND 17 / F6: `interiorWalkable` is 200-400 tiles and a cut is 9 to
        // 59, so the only ceiling this leaf had was two orders of magnitude
        // out and a x5 inflation walked past it in all 15 rooms. The prune and
        // the seal reconciliation MOVE this cut; they do not rebuild it, and
        // measured over the fleet layer 3's cut runs 1.00x to 1.13x the cut
        // the room ships. The band is taken at twice, so no honest room can
        // grow into it and no x5 can stay inside it.
        PRED("and it is at most twice the cut this room actually ships — the later passes move that wall, they do not replace it", (self, get) => {
          const a = cnum(self);
          const shipped = cnum(get(BOARD("shippedCut")));
          if (a === null || shipped === null) return null;
          return a <= 2 * shipped
            ? null
            : `is ${a} against a shipped cut of ${shipped} tile(s); the inert prune and the seal ` +
                `reconciliation move that wall by a tile or two (1.00x to 1.13x across this fleet), they do ` +
                `not double it`;
        }),
      ),
      "towers.weakTiles": LAYER_EARLIER(
        `how many of them were under the weak line`,
        LE("towers.declaredCutTiles"),
        MIRROR_L3("weakTiles"),
        // ROUND 17 / F3: it is counted in the SAME loop that produces
        // `minShellDmg` — one pass over layer 3's cut, incrementing on
        // `faceDamage < TARGET_MIN` and tracking the minimum — so the two are
        // one measurement, and the weak count is positive exactly when the
        // weakest face is under that floor. Held to `declaredCutTiles` and a
        // mirror alone, a coordinated edit charged a room 7 weak tiles beside
        // a published weakest face of 2010.
        IFFPOS("the weakest face layer 3 measured is under TOWER_TARGET_MIN", (get) => {
          const mn = cnum(get("towers.minShellDmg"));
          return mn === null ? null : mn < TOWER_TARGET_MIN;
        }),
      ),
      "towers.depthSafe": D,
      "towers.refillCap": D,
      "towers.refillNote": D,
      "towers.weakShellDmg": D,
      "towers.maxRefillHard": D,
      "towers.targetMin": D,
      // ...and this one turned out not to be a layer-3 witness at all: it is
      // computed from the battery the producer FINISHES with, so it is the
      // spread of the six towers this room ships, and it is re-derived here.
      "towers.spreadRadius": D,
      // OF11 cause 1/3: the mirror is not a second witness — both copies are
      // written by the same producer in the same pass, so a mirrored-pair edit
      // is one extra assignment. What a permuted or rescaled census CANNOT
      // survive is a bound taken off the room's own board: a candidate tower
      // tile is a walkable tile of THIS room.
      "towers.candidates": SEARCH_COUNTER(
        `tower tiles layer 3 considered`,
        ATLEAST(6, "the six tiles it ended up taking were among them"),
        MIRROR_L3("candidates"),
        LE(BOARD("interiorTiles")),
      ),
      "towers.starts": SEARCH_COUNTER(
        `distinct starting placements the search actually took`,
        LE("towers.search.restarts"),
        EQ("towers.search.starts"),
        MIRROR_L3("starts"),
      ),
      "towers.escRounds": SEARCH_COUNTER(`escalation rounds`, KONST("TOWER_ESC_ROUNDS", TOWER_ESC_ROUNDS)),
      "towers.pairK": SEARCH_COUNTER(
        `the pair-swap breadth of the ESCALATION loop — a different number from \`towers.search.pairK\`, ` +
          `which is the breadth inside the placement search (6 against 12 in every room that declares)`,
        KONST("TOWER_ESC_PAIR_K", TOWER_ESC_PAIR_K),
      ),
      "towers.refillSearch.before": LAYER_EARLIER(
        `the refill walk before the refill-directed swap pass`,
        GE("towers.refillSearch.after"),
        EQ("@meta.towers.refillSearch.before"),
      ),
      "towers.refillSearch.after": LAYER_EARLIER(
        `...and after it. The pass only takes a swap that shortens the walk, so it never ends longer than ` +
          `it started, and it ends STRICTLY shorter exactly when it moved something`,
        LE("towers.refillSearch.before"),
        EQ("@meta.towers.refillSearch.after"),
      ),
      "towers.refillSearch.moved": SEARCH_COUNTER(
        `towers the pass moved`,
        LE("towers.refillSearch.tried"),
        IFFPOS("the refill walk actually got shorter (`before` > `after`)", (get) => {
          const b = cnum(get("towers.refillSearch.before"));
          const a = cnum(get("towers.refillSearch.after"));
          return b === null || a === null ? null : a < b;
        }),
        EQ("@meta.towers.refillSearch.moved"),
      ),
      "towers.refillSearch.tried": SEARCH_COUNTER(
        `swaps it examined`,
        GE("towers.refillSearch.moved"),
        GE("towers.refillSearch.scoreTied"),
        GE("towers.refillSearch.dispersionOk"),
        GE("towers.refillSearch.crossOffered"),
        EQ("@meta.towers.refillSearch.tried"),
      ),
      "towers.refillSearch.rounds": SEARCH_COUNTER(
        `rounds it ran`,
        EQ("@meta.towers.refillSearch.rounds"),
        // the pass is `for (pass = 0; pass < 4 && still over the note; pass++)`
        // and it takes at most one tower per round
        ATMOST(4, "the refill-repair pass's own round budget in layer-towers.mjs"),
        GE("towers.refillSearch.moved"),
      ),
      "towers.refillSearch.scoreTied": SEARCH_COUNTER(`swaps that scored equal`, LE("towers.refillSearch.tried"), EQ("@meta.towers.refillSearch.scoreTied")),
      "towers.refillSearch.dispersionOk": SEARCH_COUNTER(
        `swaps the dispersion guard allowed`,
        LE("towers.refillSearch.tried"),
        // ...and the guard runs INSIDE the score-tie test, so the swaps it let
        // through are a subset of the swaps that got that far. The chain was
        // three counters each held to `tried` and to each other not at all,
        // which is what let a coordinated edit inflate the middle of it.
        LE("towers.refillSearch.scoreTied"),
        EQ("@meta.towers.refillSearch.dispersionOk"),
      ),
      "towers.refillSearch.crossOffered": SEARCH_COUNTER(
        `swaps the refill-repair pass was offered ACROSS the tower-adjacency prior — the crossings round 14 ` +
          `let it make once a room is over the hard refill ceiling`,
        LE("towers.refillSearch.tried"),
        // ...offered only to a swap that already cleared the score tie AND the
        // dispersion guard, so it is the last link of that same chain
        LE("towers.refillSearch.dispersionOk"),
        EQ("@meta.towers.refillSearch.crossOffered"),
      ),
      "towers.search.ran": W(
        `whether layer 3's placement search ran at all on this room, rather than taking the first legal ` +
          `placement it found. A fact about a code path, not about a tile`,
        WITNESS_BOOL,
        [
          EQ("@meta.towers.search.ran"),
          PRED("a search that did not run took no rounds and no improvements", (self, get) => {
            if (self !== false) return null;
            const r = cnum(get("towers.search.rounds"));
            const i = cnum(get("towers.search.improvements"));
            return (r === null || r === 0) && (i === null || i === 0)
              ? null
              : `says the placement search did not run and the record charges it ${r} round(s) and ${i} improvement(s)`;
          }),
        ],
      ),
      "towers.search.converged": W(`whether it converged rather than exhausting its budget`, WITNESS_BOOL, [EQ("@meta.towers.search.converged")]),
      "towers.search.improvedFrom": LAYER_EARLIER(
        `the weakest face it started from`,
        LE("towers.search.improvedTo"),
        EQ("@meta.towers.search.improvedFrom"),
      ),
      "towers.search.improvedTo": LAYER_EARLIER(
        `...and ended at. The search only accepts a placement that does not weaken the wall, so the end is ` +
          `never below the start; where it took no improvement at all the two are equal — and it is the ` +
          `weakest face of the placement layer 3 SETTLED on, so it never exceeds the weakest face this ` +
          `record publishes for that placement (a later pass may improve it, as round 16's across-prior ` +
          `take did in E3S1, 1200 -> 1230; nothing after layer 3 makes it worse)`,
        GE("towers.search.improvedFrom"),
        LE("towers.minShellDmg"),
        PRED("with zero accepted improvements it is the number the search started from", (self, get) => {
          const imp = cnum(get("towers.search.improvements"));
          const from = cnum(get("towers.search.improvedFrom"));
          const to = cnum(self);
          if (imp === null || from === null || to === null) return null;
          return imp === 0 && to !== from
            ? `is ${to} against a start of ${from} with ZERO accepted improvements — a search that took ` +
                `nothing cannot have moved the number it was improving`
            : null;
        }),
        EQ("@meta.towers.search.improvedTo"),
      ),
      // ROUND 17 / F3: the escalation census was five counters bounded by each
      // other and by a mirror written in the same pass. Its two loops are a
      // descent per settled START and a descent per RESTART, each running at
      // most ESC_ROUNDS pair-ejection rounds and accepting at most one
      // improvement — so the budget the record itself declares bounds the work
      // the record itself claims.
      "towers.search.improvements": SEARCH_COUNTER(
        `accepted improvements`,
        LE("towers.search.rounds"),
        PRED(
          "and it is at most one per descent — one descent per settled start and one per restart",
          (self, get) => {
            const a = cnum(self);
            const st = cnum(get("towers.search.starts"));
            const re = cnum(get("towers.search.restarts"));
            if (a === null || st === null || re === null) return null;
            return a <= st + re
              ? null
              : `is ${a} against ${st} settled start(s) plus ${re} restart(s); each descent accepts at ` +
                  `most one improvement, so there were at most ${st + re} of them`;
          },
        ),
        EQ("@meta.towers.search.improvements"),
      ),
      "towers.search.rounds": SEARCH_COUNTER(
        `rounds`,
        GE("towers.search.improvements"),
        PRED(
          "and it is at most ESC_ROUNDS per descent, over the settled starts plus the restarts",
          (self, get) => {
            const a = cnum(self);
            const st = cnum(get("towers.search.starts"));
            const re = cnum(get("towers.search.restarts"));
            if (a === null || st === null || re === null) return null;
            const cap = TOWER_ESC_ROUNDS * (st + re);
            return a <= cap
              ? null
              : `is ${a} and the escalation runs at most ${TOWER_ESC_ROUNDS} pair-ejection round(s) on ` +
                  `each of ${st} settled start(s) and ${re} restart(s), which is ${cap}`;
          },
        ),
        EQ("@meta.towers.search.rounds"),
      ),
      "towers.search.restarts": SEARCH_COUNTER(
        `the restart BUDGET the search was given`,
        GE("towers.search.starts"),
        KONST("ESC_RESTARTS", TOWER_ESC_RESTARTS),
        EQ("@meta.towers.search.restarts"),
      ),
      "towers.search.starts": SEARCH_COUNTER(
        `distinct starting placements it actually took, out of that budget`,
        LE("towers.search.restarts"),
        EQ("@meta.towers.search.starts"),
      ),
      "towers.search.pairK": SEARCH_COUNTER(
        `the pair-swap breadth inside the placement search`,
        KONST("ESC_PAIR_K", TOWER_ESC_SEARCH_PAIR_K),
        EQ("@meta.towers.search.pairK"),
      ),
    },
  ],
  // ---------------------------------------------------------------- mobility/covered-detour
  [
    "mobility|covered-detour",
    {
      cause: D,
      "record.din": D,
      "record.dout": D,
      "record.detour": D,
      "record.ratio": D,
      "record.gatedLap": D,
      "record.liftedLap": D,
      "record.gatedPairs": D,
      "record.coveredPairs": D,
      "record.pairs": D,
      "record.target": D,
      "record.detourFloor": D,
      "record.present": D,
      "record.noStructures": D,
      "record.noWalls": D,
    },
  ],
  // ---------------------------------------------------------------- spawnFan
  //
  // THE CENSUS IS A LATTICE, AND THAT IS THE BOUND. Every counter under
  // `census` describes layer 1's seat search over a BASIN — a mid-search pocket
  // grown from a seed ranking that the shipped plan does not carry (`core`,
  // `basin` and `seed` are dropped from the slim plan plan.mjs writes). So the
  // pool, the five rejection classes, the shortlist and the triple enumeration
  // are witnessed rather than re-derived — and they are witnessed against an
  // arithmetic lattice that a fabricated census does not survive: the pool
  // splits exactly into its five rejections plus the viable seats, the triple
  // count and the adjacency count sum to C(shortlist,3) exactly, the shortlist's
  // sector count equals the viable set's by construction, the fallback flag is
  // equivalent to "every triple was jointly rejected", and `fannedAvailable` is
  // present exactly when the room did not fall back and some triple reached the
  // target. E13S9's planted `pool`/`viable` of 999 breaks the first of those.
  // Every number that is a fact about the THREE SHIPPED SPAWNS — the worst-pair
  // angle, the sector count, the storage the angles are taken around — is
  // re-derived outright, and the whole block is cross-copied against
  // `meta.spawnFan`, which layer 1 publishes unconditionally.
  [
    "spawnFan|sector",
    {
      "spawnFan.hub.x": D,
      "spawnFan.hub.y": D,
      "spawnFan.minAngle": D,
      "spawnFan.target": D,
      "spawnFan.sectorWeight": D,
      "spawnFan.walkMax": W(
        `the longest walk from storage to any of the three spawns, measured on layer 1's PRE-MASS board — ` +
          `object tiles, storage, terminal and the hub link were the only obstacles when it was taken, and ` +
          `sixty extensions have landed since. Bound: it may not exceed the published walk cap, which every ` +
          `viable seat had to clear`,
        WITNESS_NONNEG,
        [SPAWNFAN_LATTICE],
      ),
      "spawnFan.proxyDepthMin": W(
        `the shallowest of the three spawns on the terrain-only proxy depth field. Bound: non-negative, and ` +
          `under the depth-safe line it implies at least one shallow viable seat`,
        WITNESS_NONNEG,
        [SPAWNFAN_LATTICE],
      ),
      "spawnFan.census.target": D,
      "spawnFan.census.depthSafe": D,
      "spawnFan.census.walkCap": D,
      "spawnFan.census.sectorDeg": D,
      "spawnFan.census.sectorBins": D,
      "spawnFan.census.winnerSectors": D,
      "spawnFan.census.triplesAdjacent": D,
      "spawnFan.census.pool": SEARCH_COUNTER(`seat candidates layer 1 enumerated over the basin core and its ring`, SPAWNFAN_LATTICE),
      "spawnFan.census.poolCore": SEARCH_COUNTER(`of those, the ones inside the core`, SPAWNFAN_LATTICE),
      "spawnFan.census.poolRing": SEARCH_COUNTER(`...and the ones in its one-tile dilation`, SPAWNFAN_LATTICE),
      "spawnFan.census.rejClaimed": SEARCH_COUNTER(`pool tiles already claimed by an object or the hub trio`, SPAWNFAN_LATTICE),
      "spawnFan.census.rejHubRing": SEARCH_COUNTER(`pool tiles inside the storage's own ring`, SPAWNFAN_LATTICE),
      "spawnFan.census.rejWalk": SEARCH_COUNTER(`pool tiles past the walk cap from storage`, SPAWNFAN_LATTICE),
      "spawnFan.census.rejStorageFace": SEARCH_COUNTER(`pool tiles that would leave storage under two free faces`, SPAWNFAN_LATTICE),
      "spawnFan.census.rejExits": SEARCH_COUNTER(`pool tiles with fewer than three free exits of their own`, SPAWNFAN_LATTICE),
      "spawnFan.census.viable": SEARCH_COUNTER(`seats that survived all five rejections`, SPAWNFAN_LATTICE),
      "spawnFan.census.viableCore": SEARCH_COUNTER(`of those, the ones in the core`, SPAWNFAN_LATTICE),
      "spawnFan.census.viableShallow": SEARCH_COUNTER(`of those, the ones under the depth-safe line`, SPAWNFAN_LATTICE),
      "spawnFan.census.viableSectors": SEARCH_COUNTER(`distinct 30-degree sectors the viable seats occupy`, SPAWNFAN_LATTICE),
      "spawnFan.census.shortlist": SEARCH_COUNTER(`the seats the triple enumeration actually ran over`, SPAWNFAN_LATTICE),
      "spawnFan.census.shortlistSectors": W(
        `distinct sectors the shortlist occupies. Bound: it EQUALS viableSectors, always — the per-sector ` +
          `pass takes at least one seat from every non-empty bin — so a record where the two differ is ` +
          `fabricated`,
        WITNESS_NONNEG,
        [SPAWNFAN_LATTICE],
      ),
      "spawnFan.census.triples": SEARCH_COUNTER(`legal (pairwise non-adjacent) spawn triples enumerated`, SPAWNFAN_LATTICE),
      "spawnFan.census.triplesJointRejected": W(
        `triples rejected by the joint storage-face / exits test before the winner, in score order. Bound: ` +
          `it equals \`triples\` exactly when the search fell back, and is at most triples - 1 when it did not`,
        WITNESS_NONNEG,
        [SPAWNFAN_LATTICE],
      ),
      "spawnFan.census.fannedTriples": W(
        `enumerated triples whose worst pair reached the 60-degree target. It is the number the paragraph ` +
          `turns into "not one of the N triples reached 60 degrees … this is the terrain's answer, not a ` +
          `scoring preference", so deflating it launders a priced trade into an impossibility. The triples ` +
          `are combinations of a SHORTLIST drawn from a basin the plan does not publish, so the bounds are: ` +
          `0 <= fannedTriples <= triples; \`fannedAvailable\` is non-null exactly when it is positive and ` +
          `the search did not fall back; and the whole census is cross-copied against \`meta.spawnFan\`, ` +
          `which layer 1 publishes for every room whether it declares or not`,
        WITNESS_NONNEG,
        [SPAWNFAN_LATTICE],
      ),
      "spawnFan.census.fallback": W(
        `whether the triple loop fell through and the fallback placement ran. Bound: equivalent to ` +
          `triplesJointRejected === triples`,
        WITNESS_BOOL,
        [SPAWNFAN_LATTICE],
      ),
      "spawnFan.census.fannedAvailable": W(
        `null when no enumerated triple reached the target, or when the search fell back before it could ` +
          `look. It is null exactly in those two cases`,
        null,
        [SPAWNFAN_LATTICE],
      ),
      "spawnFan.census.fannedAvailable.minAngle": D,
      "spawnFan.census.fannedAvailable.tiles": D,
      "spawnFan.census.fannedAvailable.jointlyFeasible": W(
        `whether the target-reaching rival triple would have been buildable together — two free faces left ` +
          `on storage, three exits each — measured on layer 1's pre-mass board. Bound: a rival that sorted ` +
          `ABOVE the winner must have failed this test, so a negative \`scoreGap\` requires it to be false`,
        WITNESS_BOOL,
        [SPAWNFAN_LATTICE],
      ),
      "spawnFan.census.fannedAvailable.scoreGap": W(
        `how much score the winner had over the target-reaching rival. Bound: it is the difference of the ` +
          `other two published gaps, tileQualityGap - sectorGain, to within the rounding the producer applies`,
        WITNESS_NUM_OR_NULL,
        [SPAWNFAN_LATTICE],
      ),
      "spawnFan.census.fannedAvailable.sectorGain": W(
        `the score the rival gained purely from reaching the target. Bound: it is the sector weight times ` +
          `the degrees the winner is short, re-derived here from the record's own angle`,
        WITNESS_NUM_OR_NULL,
        [SPAWNFAN_LATTICE],
      ),
      "spawnFan.census.fannedAvailable.tileQualityGap": W(
        `the winner's tile-quality advantage, i.e. the same comparison with the sector term removed. Bound: ` +
          `scoreGap + sectorGain`,
        WITNESS_NUM_OR_NULL,
        [SPAWNFAN_LATTICE],
      ),
    },
  ],
  // ---------------------------------------------------------------- mobility (as built)
  [
    "mobility|",
    {
      source: D,
      cause: D,
      pairCause: D,
      worstCaused: D,
      "causeWalks.noStructures": D,
      "causeWalks.noWalls": D,
      "worst.a.x": D,
      "worst.a.y": D,
      "worst.b.x": D,
      "worst.b.y": D,
      "worst.din": D,
      "worst.dout": D,
      "mass.din": D,
      "mass.dout": D,
      "mass.bareDin": D,
      "mass.builtLap": D,
      "mass.bareLap": D,
      "mass.adds": D,
      "metric.max": D,
      "metric.maxGated": D,
      "metric.over": D,
      "metric.overGated": D,
      "metric.pairs": D,
      "metric.gatedPairs": D,
      "metric.bareOver": D,
      "metric.bareOverGated": D,
      "metric.target": D,
      "metric.detourFloor": D,
      "metric.massSharePct": D,
      "metric.massMinorPct": D,
      lift: D,
      "lift.cause": D,
      "lift.clears": D,
      "lift.classes": D,
      "lift.solo": D,
      "lift.present": D,
      "lift.ownPct": D,
      "lift.liftedLap": D,
      "lift.liftedOverGated": D,
      "lift.liftedGatedPairs": D,
      "lift.perClass.*.pairDin": D,
      "lift.perClass.*.lap": D,
      "lift.residual": D,
      "lift.residual.dStruct": D,
      "lift.residual.dFree": D,
      "lift.residual.pair.a.x": D,
      "lift.residual.pair.a.y": D,
      "lift.residual.pair.b.x": D,
      "lift.residual.pair.b.y": D,
      "ladder.target": D,
      "ladder.rungs": W(
        `the escalation ladder this room walked: per rung, the deep-tile bonus it asked for, the mobility it ` +
          `measured and how many ramparts it cost. Every rung but the last is an enclosure the room did not ` +
          `build, so the board carries none of them. The list is non-empty and one entry long per rung the ` +
          `trail counts. (It does NOT end at the shipped numbers — the ladder's winning rung is not always ` +
          `its LAST rung, and 40 of the fleet's 57 records prove it; a bound that said otherwise would have ` +
          `been a sentence, not a check.)`,
        null,
        [
          LENIS("ladder.trailLength"),
          PRED(
            "and the rung the room SHIPPED is ON it — some row carries exactly (`shippedLap`, " +
              "`shippedRamparts`), which is true of all 57 of the fleet's records and is the ladder's " +
              "version of the rule that `winningCap` has to be one of the caps that were composed",
            (self, get) => {
              const rows = carr(self);
              const lap = cnum(get("ladder.shippedLap"));
              const ram = cnum(get("ladder.shippedRamparts"));
              if (!rows || lap === null || ram === null) return null;
              return rows.some((r) => r && near2(r.mobility, lap) && near2(r.ramparts, ram))
                ? null
                : `does not contain the rung this room SHIPPED (lap ${lap} at ${ram} rampart(s)); the rows ` +
                    `are ${JSON.stringify(rows.map((r) => [r && r.mobility, r && r.ramparts]))}. Every rung ` +
                    `but one is an enclosure nobody built — the one that IS on the board is the only anchor ` +
                    `the trail has, and a trail that does not contain it is describing a different room`;
            },
          ),
          BESPOKE("mobility.ladder.rungs", "every rung carries the four fields a rung is made of, and the trail is non-empty"),
        ],
      ),
      "ladder.trailLength": SEARCH_COUNTER(
        `how many rungs of this seed the room composed`,
        LEN("ladder.rungs"),
        ATLEAST(1, "the room composed the rung it shipped"),
      ),
      "ladder.shippedLap": LAYER_EARLIER(
        `the lap the winning rung measured on layer 2's mass-free interior — the same measurement ` +
          `\`negotiated.lap\` publishes and the same one the tower veto took its baseline from`,
        EQ("negotiated.lap"),
        EQ("repair.tower.baseLap"),
      ),
      "ladder.shippedRamparts": LAYER_EARLIER(
        `the rampart count that rung cost — and the room built exactly that many`,
        ATLEAST(0, "a count of ramparts"),
        EQ(BOARD("shippedRamparts")),
      ),
      "ladder.buyFloor": SEARCH_COUNTER(`the ladder's own purchase floor`, KONST("MOB_LADDER_BUY_FLOOR", MOB_LADDER_BUY_FLOOR)),
      "ladder.cap": SEARCH_COUNTER(
        `the rampart cap the ladder was allowed to spend to per rung. NOT a cap on the ramparts the room ` +
          `ships — every one of the fleet's 57 records is over it, because the cap prices ONE step of the ` +
          `ladder and the wall is the sum of many`,
        KONST("MOB_LADDER_CAP", MOB_LADDER_CAP),
      ),
      "ladder.perRatio": SEARCH_COUNTER(`ramparts the ladder would pay per unit of lap`, KONST("MOB_LADDER_PER_RATIO", MOB_LADDER_PER_RATIO)),
      "ladder.materialLap": W(
        `the lap difference the ladder treats as material`,
        WITNESS_NUM_OR_NULL,
        [KONST("MOB_MATERIAL_LAP", MOB_MATERIAL_LAP), EQ("negotiated.materialLap")],
      ),
      "ladder.fallbackBest": LAYER_EARLIER(
        `the best rung of the fallback seed, when one was walked — a lap measured on a seed this room did ` +
          `not take. All 57 of the fleet's records are null here, and a NON-null value is a claim that a ` +
          `second seed was walked, so it has to be a lap and it has to be a lap this trail contains`,
        ATMOST(MOB_EXACT_MAX, "this file's own exact-metric ceiling — a lap above it is not a lap"),
        PRED(
          "and, when it is not null, it is one of the laps on `ladder.rungs` — a fallback BEST is the " +
            "best of something that was walked, and the trail is the record of what was",
          (self, get) => {
            const a = cnum(self);
            const rows = carr(get("ladder.rungs"));
            if (a === null || !rows) return null;
            return rows.some((r) => r && near2(r.mobility, a))
              ? null
              : `is ${a} and the trail's rungs measure ` +
                  `${JSON.stringify(rows.map((r) => r && r.mobility))} — a "best rung" that is not a rung`;
          },
        ),
      ),
      "lane.tiles": SEARCH_COUNTER(
        `tiles layer 6's defender-lane reservation wanted`,
        GE("lane.deep"),
        LE(BOARD("interiorWalkable")),
        MIRROR_LANE("tiles"),
      ),
      "lane.deep": SEARCH_COUNTER(`of those, the deep ones`, LE("lane.tiles"), LE(BOARD("interiorWalkable")), MIRROR_LANE("deep")),
      "lane.rounds": SEARCH_COUNTER(`rounds the reservation ran`, GE("lane.strandRounds"), LE(BOARD("interiorWalkable")), MIRROR_LANE("rounds")),
      "lane.strandRounds": SEARCH_COUNTER(`rounds spent on stranded stubs`, LE("lane.rounds"), LE(BOARD("interiorWalkable")), MIRROR_LANE("strandRounds")),
      "lane.stubsLifted": LAYER_EARLIER(
        `how many stranded road stubs the lane reservation lifted before it took its bound. The stubs were ` +
          `lifted from a mid-layer-6 board and the reservation itself is not on the shipped one`,
        LE(BOARD("shippedRoads")),
        MIRROR_LANE("stubsLifted"),
      ),
      "lane.dropped": W(
        `whether the reservation was dropped rather than taken. \`lane.droppedFor\` beside it is held to ` +
          `agree with it; on this flag alone, its type is the only bound this file holds it to`,
        WITNESS_BOOL,
      ),
      "lane.droppedFor": W(
        `what it was dropped for, in the producer's own words. A refusal about a board layer 6 was looking ` +
          `at. It is a string or null`,
        (v) => (v === null || typeof v === "string" ? null : `is ${JSON.stringify(v)}, not a string or null`),
        [
          PRED("it is present exactly when `lane.dropped` is true", (self, get) => {
            const d = get("lane.dropped");
            if (typeof d !== "boolean") return null;
            return (self !== null && self !== undefined) === d
              ? null
              : `is ${JSON.stringify(self)} with \`lane.dropped\` ${d} — a reservation is dropped exactly ` +
                  `when there is something it was dropped for`;
          }),
        ],
      ),
      "lane.bounded": LAYER_EARLIER(
        `the lap bound the reservation established — the number the paragraph turns into "which bounds ` +
          `the worst mass this room could grow at N — and the room shipped at M, inside it". A room ` +
          `shipping OUTSIDE its own published bound is the one reading that sentence cannot survive`,
        GE("mass.builtLap"),
        ATMOST(MOB_EXACT_MAX, "this file's own exact-metric ceiling — a lap above it is not a lap"),
        MIRROR_LANE("bounded"),
      ),
      "lane.boundBeforeStubs": LAYER_EARLIER(`the same bound before the stub lift`, ATMOST(MOB_EXACT_MAX, "this file's own exact-metric ceiling — a lap above it is not a lap"), MIRROR_LANE("boundBeforeStubs")),
      "lane.wanted": LAYER_EARLIER(
        `the size of the reservation layer 6 would have taken, against the smaller one it did`,
        GE("lane.tiles"),
        LE(BOARD("interiorWalkable")),
        MIRROR_LANE("wanted"),
      ),
      "lane.wantedBound": LAYER_EARLIER(`...and the bound that would have come with it`, ATMOST(MOB_EXACT_MAX, "this file's own exact-metric ceiling — a lap above it is not a lap")),
      "lane.cost": LAYER_EARLIER_SIGNED(
        `what the reservation would have cost in personal ramparts`,
        `it is a PRICE DELTA for a reservation this room did NOT take, on layer 6's board, and the fleet's ` +
          `four records include a negative one — a reservation that FREES ramparts costs less than nothing`,
        -2500,
        2500,
        LE(BOARD("shippedRamparts")),
      ),
      "lane.gain": LAYER_EARLIER_SIGNED(
        `the lap the reservation would have gained, measured on layer 6's board before the mass finished growing`,
        `it is a LAP DELTA and the fleet ships one at -0.06 — a reservation that made the lap slightly ` +
          `worse gained a negative amount, which is the honest reading of the counterfactual`,
        -MOB_EXACT_MAX,
        MOB_EXACT_MAX,
      ),
      "lane.premium": LAYER_EARLIER(
        `the premium the room was willing to pay for it — a budget, not a measurement`,
        LE(BOARD("shippedRamparts")),
      ),
      "lane.shrunk": W(
        `the reservation the room shrank to, or null. Its three fields below carry their own bounds; the ` +
          `presence of the block is the only bound this file holds THIS leaf to`,
        null,
      ),
      "lane.shrunk.wanted": SEARCH_COUNTER(
        `the reservation size layer 6 wanted before it shrank`,
        GE("lane.shrunk.to"),
        GE("lane.tiles"),
        LE(BOARD("interiorWalkable")),
        MIRROR_LANE("shrunk.wanted"),
      ),
      "lane.shrunk.to": SEARCH_COUNTER(
        `the size it settled on — which is the reservation the room actually ran`,
        LE("lane.shrunk.wanted"),
        EQ("lane.rounds"),
        MIRROR_LANE("shrunk.to"),
      ),
      "lane.shrunk.premium": SEARCH_COUNTER(`the premium that shrink bought`, LE(BOARD("shippedRamparts")), MIRROR_LANE("shrunk.premium")),
      "repair.mass.rounds": SEARCH_COUNTER(
        `rounds of the bounded mass-relocation attempt`,
        PRED("an attempt that ran no rounds tried nothing, moved nothing and saw no blockers — and one that ran a round tried at least one relocation", (self, get) => {
          const r = cnum(self);
          if (r === null) return null;
          if (r === 0) {
            const dirty = ["trials", "moved", "blockersSeen"].filter((f) => (cnum(get("repair.mass." + f)) || 0) > 0);
            return dirty.length
              ? "is 0 and the record still charges it " + dirty.map((f) => f + " " + get("repair.mass." + f)).join(", ")
              : null;
          }
          const tr = cnum(get("repair.mass.trials"));
          return tr === null || tr > 0
            ? null
            : "is " + r + " and the attempt is recorded as having tried 0 relocations. A round of a " +
                "relocation attempt is a pass over the candidates; a round that examined none did not run";
        }),
      ),
      "repair.mass.trials": SEARCH_COUNTER(`relocations it tried`, GE("repair.mass.moved")),
      "repair.mass.moved": SEARCH_COUNTER(`relocations it took`, LE("repair.mass.trials")),
      "repair.mass.blockersSeen": SEARCH_COUNTER(`blocking tiles it examined`, LE(BOARD("interiorWalkable"))),
      // ROUND 17 / F3: all three of these laps are `null` in the fleet's 57
      // records, and until this round that null was worth more than a number:
      // a null SELF skips every closure it carries, and a null REFERENT made
      // the closure pointing at it pass. Both halves are measured facts now —
      // `NULLIFF` on the leaf, `NULLREF` on the closure that reads it — and
      // both are two-sided, so neither direction is a free move.
      "repair.mass.lapBefore": LAYER_EARLIER(
        `the lap before the attempt — which is the lap the room SHIPS, because the attempt is the last ` +
          `thing in the pipeline that could have moved it. It is null exactly when the room's own built ` +
          `lap is zero, i.e. there was no walk for the attempt to be about`,
        NULLREF(GE("repair.mass.lapAfter"), (get) => cnum(get("repair.mass.moved")) === 0, "`repair.mass.moved` is 0 — the attempt kept no relocation, so there is no lap after one"),
        EQ("mass.builtLap"),
        NULLREF(GE("repair.mass.liftedLap"), (get) => cnum(get("mass.builtLap")) === 0, "`mass.builtLap` is 0"),
        NULLIFF("`mass.builtLap` is 0", (get) => {
          const b = cnum(get("mass.builtLap"));
          return b === null ? null : b === 0;
        }),
      ),
      "repair.mass.lapAfter": LAYER_EARLIER(
        `...and after it. The attempt keeps a relocation only when the lap did not get worse. It is null ` +
          `exactly when the attempt kept nothing`,
        NULLREF(LE("repair.mass.lapBefore"), (get) => cnum(get("mass.builtLap")) === 0, "`mass.builtLap` is 0"),
        NULLIFF("`repair.mass.moved` is 0 — a lap after a relocation that did not happen is not a number", (get) => {
          const m = cnum(get("repair.mass.moved"));
          return m === null ? null : m === 0;
        }),
      ),
      "repair.mass.liftedLap": LAYER_EARLIER(
        `the lifted lap that decided whether the attempt was worth paying for — lifting mass out cannot ` +
          `lengthen a walk, so it never exceeds the lap the attempt started from. It is null exactly when ` +
          `the room's built lap is zero`,
        NULLREF(LE("repair.mass.lapBefore"), (get) => cnum(get("mass.builtLap")) === 0, "`mass.builtLap` is 0"),
        NULLIFF("`mass.builtLap` is 0", (get) => {
          const b = cnum(get("mass.builtLap"));
          return b === null ? null : b === 0;
        }),
      ),
      "repair.mass.lastRefusal": W(
        `the last refusal the attempt recorded, in the producer's own words — free text about a ` +
          `relocation that did not happen, on a board that no longer exists. Its type is the only bound ` +
          `this file holds it to`,
        (v) => (v === null || typeof v === "string" ? null : `is ${JSON.stringify(v)}, not a string or null`),
      ),
      // THE WHOLE BLOCK IS A COPY OF `meta.towers.mobilityVeto`, which layer 3
      // writes for every room whether it declares or not. Nine leaves, nine
      // cross-copies: the veto's own unconditional publication is what stands
      // behind numbers describing a search over a board nothing since has kept.
      "repair.tower.tried": SEARCH_COUNTER(
        `single-slot battery swaps layer 3 examined for this metric`,
        GE("repair.tower.affordable"),
        GE("repair.tower.scoreTied"),
        MIRROR_VETO("tried"),
        PRED(
          "and it is at most six towers' worth of this room's own interior floor, which is every " +
            "single-slot swap the room can offer — the one bound in this census that a producer would " +
            "have to move the ROOM to change",
          (self, get) => {
            const a = cnum(self);
            const w2 = cnum(get(BOARD("interiorWalkable")));
            if (a === null || w2 === null) return null;
            return a <= 6 * w2
              ? null
              : `is ${a} and this room has ${w2} walkable interior tile(s), so six towers cannot be ` +
                  `offered more than ${6 * w2} single-slot swaps between them`;
          },
        ),
        PRED("a pass that examined nothing found nothing, took nothing and proved nothing", (self, get) => {
          if (cnum(self) !== 0) return null;
          const dirty = ["affordable", "scoreTied", "moved"].filter((f) => (cnum(get("repair.tower." + f)) || 0) > 0);
          if (get("repair.tower.provedFree") === true) dirty.push("provedFree");
          return dirty.length ? "is 0 and the record still carries " + dirty.join(", ") : null;
        }),
      ),
      "repair.tower.affordable": SEARCH_COUNTER(
        `of those, the ones the weakest wall face could afford`,
        LE("repair.tower.tried"),
        GE("repair.tower.moved"),
        // the affordability test runs INSIDE the score-tie test, so this is a
        // subset of `scoreTied` and not just of `tried` — the chain was three
        // counters each held to the first one only
        LE("repair.tower.scoreTied"),
        MIRROR_VETO("affordable"),
      ),
      "repair.tower.scoreTied": SEARCH_COUNTER(
        `of those, the ones that scored equal`,
        LE("repair.tower.tried"),
        MIRROR_VETO("scoreTied"),
      ),
      "repair.tower.moved": SEARCH_COUNTER(
        `towers it moved — a subset of the swaps it could afford`,
        LE("repair.tower.affordable"),
        MIRROR_VETO("moved"),
      ),
      "repair.tower.provedFree": W(`whether a free improving swap was proved to exist`, WITNESS_BOOL, [
        MIRROR_VETO("provedFree"),
        PRED("a swap proved to exist is one the wall could afford", (self, get) => {
          if (self !== true) return null;
          const aff = cnum(get("repair.tower.affordable"));
          return aff === null || aff >= 1
            ? null
            : "says a free improving swap was PROVED to exist and " + aff + " of the " +
                cnum(get("repair.tower.tried")) + " swaps examined were affordable";
        }),
      ]),
      "repair.tower.baseLap": LAYER_EARLIER(
        `the lap of layer 2's empty room`,
        ATMOST(MOB_EXACT_MAX, "this file's own exact-metric ceiling — a lap above it is not a lap"),
        MIRROR_VETO("baseLap"),
        EQ("ladder.shippedLap"),
        LE("repair.tower.lapWithBattery"),
      ),
      // ROUND 17 / F3: the veto's four lap readings were held to each other, to
      // a mirror written in the same pass and to the room's interior floor — a
      // ceiling of 400-odd on a number whose real value is 6. A coordinated
      // edit of record and mirror moved `baseOver` in 45 of the 57 records and
      // `lapWithBattery` in 43. The fix is that the veto's BASE reading is not
      // a private measurement at all: it is taken on layer 2's mass-free
      // interior at the shipped rampart set, which is the same board
      // `negotiated.*` publishes in the same record — `baseLap` already had
      // that cross-copy (`ladder.shippedLap`), `baseOver` did not, and the two
      // agree in 57 of 57.
      "repair.tower.baseOver": LAYER_EARLIER(
        `how many pairs were over target on it`,
        MIRROR_VETO("baseOver"),
        LE("repair.tower.overWithBattery"),
        LE(BOARD("interiorWalkable")),
        EQ("negotiated.metric.overGated"),
        LE("negotiated.metric.gatedPairs"),
      ),
      "repair.tower.lapWithBattery": LAYER_EARLIER(
        `the lap once the battery landed. Six towers are six more obstacles on the interior, so the walk ` +
          `this measures never gets shorter for having them — and it is still a lap over the SAME pair ` +
          `set layer 2 negotiated, so the strict worst walk on that board bounds it from above`,
        ATMOST(MOB_EXACT_MAX, "this file's own exact-metric ceiling — a lap above it is not a lap"),
        MIRROR_VETO("lapWithBattery"),
        GE("repair.tower.baseLap"),
        LE("negotiated.metric.maxStrict"),
      ),
      "repair.tower.overWithBattery": LAYER_EARLIER(
        `...and the pairs over target then. Six towers can change which pairs are GATED, so it is not ` +
          `bounded by layer 2's gated count; what it cannot exceed is the number of pairs there are`,
        MIRROR_VETO("overWithBattery"),
        LE(BOARD("interiorWalkable")),
        GE("repair.tower.baseOver"),
        LE("negotiated.metric.pairs"),
      ),
      "negotiated.cause": W(
        `layer 2's cause label — about layer 2's worst pair, on layer 2's mass-free interior, taken before ` +
          `one extension existed. The AS-BUILT label beside it is re-derived; this one is the record of what ` +
          `the enclosure was bought on. Its type — one of the four labels the diagnosis can produce — is the ` +
          `only bound this file holds it to, and the paragraph beside it is required to quote this same ` +
          `word`,
        (v) =>
          ["structures", "terrain", "shape", "none"].includes(String(v))
            ? null
            : `is ${JSON.stringify(v)}, not one of structures/terrain/shape/none`,
      ),
      // ==================================================================
      // ROUND 15, THE OTHER HEADLINE: A HAND-TYPED PARAGRAPH INSIDE A
      // GENERATED RECORD, QUOTED VERBATIM INTO THE DECLARATION.
      //
      // All 57 mobility declarations carry `negotiated.detail` and all 57
      // quote it word for word ("…it is the evidence the enclosure was bought
      // on. Verbatim: \"…\""). The inventory classed it W with NO bound at all,
      // so E11S2's could be replaced with the OPPOSITE claim — "defender
      // mobility max 0.42 … this room is COMFORTABLY INSIDE the target on
      // every pair, the garrison out-walks the attacker everywhere on the
      // wall" — and the room shipped that four words before the generated
      // sentence "the negotiated lap of 1.56 reads 1.5 … which agrees with it
      // to within 0.25 of a lap". 172/172 clean. Round 12's M3/M4 and round
      // 13's criticism 25 verbatim, one indirection deeper.
      //
      // The stated reason ("a record edited to agree with the outcome is not a
      // record") is true of the paragraph's PROVENANCE and says nothing about
      // its SELF-CONSISTENCY. `lap`, `metric.maxUngated`, `metric.maxStrict`,
      // `metric.endpoints`, `metric.reachable`, `metric.detourFloor`,
      // `metric.exact`, `cause` and `tiles` are all published leaves BESIDE
      // it, and the paragraph quotes exactly those numbers. So it is now
      // PARSED: every clause of layer 2's own template is pulled out by
      // anchor, compared against the leaf that carries it, and the numbers the
      // paragraph states about itself have to close (the detour is the
      // difference of the two walks, the ratio is their quotient, the worst
      // pair named at the top is the worst pair named at the bottom). A
      // numeral no anchor consumes fails the room: a paragraph is allowed to
      // quote its own record and nothing else.
      // ==================================================================
      "negotiated.detail": W(
        `layer 2's declaration VERBATIM, demoted to evidence. It is quoted rather than re-derived on ` +
          `purpose: the enclosure was really bought on these numbers and a record edited to agree with the ` +
          `outcome is not a record. The reconciliation that IS re-derived is the as-built reading beside it`,
        (v) => (typeof v === "string" && v.length >= MIN_DETAIL_CHARS ? null : `is ${JSON.stringify(v).slice(0, 60)}, not a paragraph`),
        [
          BESPOKE(
            "mobility.negotiated.detail.parse",
            "it is parsed clause by clause against the leaves published beside it — every number it quotes " +
              "either equals the leaf that carries it or closes against the other numbers in its own " +
              "sentence, and a numeral no clause of layer 2's template accounts for fails the room",
          ),
        ],
      ),
      "negotiated.lap": LAYER_EARLIER(
        `the lap layer 2 negotiated against`,
        LE("negotiated.metric.maxUngated"),
      ),
      "negotiated.materialLap": W(
        `the material-lap line in force when layer 2 wrote its paragraph`,
        WITNESS_NUM_OR_NULL,
        [KONST("MOB_MATERIAL_LAP", MOB_MATERIAL_LAP), EQ("ladder.materialLap")],
      ),
      "negotiated.metric.maxStrict": LAYER_EARLIER(
        `layer 2's strict-detour maximum`,
        // the strict reading gates out the short pairs, so it is never the
        // lower of the two
        GE("negotiated.metric.maxUngated"),
      ),
      "negotiated.metric.maxUngated": LAYER_EARLIER(
        `layer 2's ungated maximum`,
        LE("negotiated.metric.maxStrict"),
        GE("negotiated.lap"),
      ),
      "negotiated.metric.detourFloor": D,
      // ---- ROUND 15: the rest of layer 2's own measurement, published so the
      // paragraph that quotes it can be checked against it leaf by leaf.
      "negotiated.metric.maxGated": LAYER_EARLIER(
        `layer 2's gated maximum — the number the paragraph opens with, and the same one \`negotiated.lap\`
        publishes`,
        EQ("negotiated.lap"),
        LE("negotiated.metric.maxStrict"),
      ),
      "negotiated.metric.target": W(
        `the mobility target layer 2 measured against`,
        WITNESS_NONNEG,
        [KONST("MOB_TARGET", MOB_TARGET), EQ("metric.target")],
      ),
      "negotiated.metric.pairs": SEARCH_COUNTER(
        `every wall pair layer 2's metric enumerated. NOT the as-built pair count beside it: it is a
        property of the CUT, and six rooms in the fleet moved enough wall between layer 2 and layer 7 to
        change it (1035 against 903 in the worst of them), so an equality here would be a coincidence of
        the artifact rather than a fact about the pass`,
        GE("negotiated.metric.gatedPairs"),
        GE("negotiated.metric.over"),
      ),
      "negotiated.metric.gatedPairs": SEARCH_COUNTER(
        `of those, the ones whose detour cleared the floor and were therefore judged`,
        LE("negotiated.metric.pairs"),
        GE("negotiated.metric.overGated"),
      ),
      "negotiated.metric.overGated": SEARCH_COUNTER(
        `...and of THOSE, the ones over target — the numerator of the paragraph's "N/M wall pairs with a
        real detour exceed the target"`,
        LE("negotiated.metric.gatedPairs"),
      ),
      "negotiated.metric.over": SEARCH_COUNTER(
        `pairs over target on the UNGATED reading, which judges every pair including the two-tile ones`,
        LE("negotiated.metric.pairs"),
      ),
      "negotiated.metric.p90": LAYER_EARLIER(
        `the 90th-percentile ratio over that ungated population — a percentile of a distribution whose
        maximum is published beside it`,
        LE("negotiated.metric.maxUngated"),
      ),
      "negotiated.metric.maxDetour": LAYER_EARLIER(
        `the longest ABSOLUTE extra walk anywhere on layer 2's wall — a different superlative from the
        lap, which is the worst RATIO, and in eight of the fleet's rooms a different pair`,
        DIFFEQ("negotiated.worstDetour.din", "negotiated.worstDetour.dout"),
      ),
      "negotiated.walk.din": LAYER_EARLIER(
        `how far the defender walked on the worst gated pair, inside the wall`,
        GE("negotiated.walk.dout"),
      ),
      "negotiated.walk.dout": LAYER_EARLIER(
        `...and how far the attacker walked outside it`,
        LE(BOARD("interiorTiles")),
      ),
      // THE TWO COUNTERFACTUAL RE-WALKS THE CAUSE CLAUSE IS BUILT OUT OF. Each
      // carries its own subtraction and its own quotient, so the sentence
      // "…it walks D against the attacker's O — a K-tile detour at ratio R" is
      // three numbers that have to agree with each other and with the pair.
      "negotiated.causeWalks.noStructures.d": LAYER_EARLIER(
        `the same pair re-walked with OUR structures lifted out — never longer than the walk with them in`,
        LE("negotiated.walk.din"),
        GE("negotiated.causeWalks.noWalls.d"),
      ),
      "negotiated.causeWalks.noStructures.dout": LAYER_EARLIER(
        `the attacker's side of it, which no interior change can move`,
        EQ("negotiated.walk.dout"),
      ),
      "negotiated.causeWalks.noStructures.detour": LAYER_EARLIER_SIGNED(
        `the extra walk that leaves`,
        `it is a DETOUR, i.e. a difference between two walks, and with our own structures lifted the ` +
          `defender's route can be shorter than the attacker's. No record in this fleet is negative here ` +
          `today, but it is the SAME quantity as its noWalls twin, which is negative in 16 of 57, and two ` +
          `readings of one measurement do not get two sign rules`,
        -MOB_EXACT_MAX,
        MOB_EXACT_MAX,
        DIFFEQ("negotiated.causeWalks.noStructures.d", "negotiated.causeWalks.noStructures.dout"),
      ),
      "negotiated.causeWalks.noStructures.ratio": LAYER_EARLIER(
        `...and the ratio of the two`,
        QUOT("negotiated.causeWalks.noStructures.d", "negotiated.causeWalks.noStructures.dout"),
      ),
      "negotiated.causeWalks.noWalls.d": LAYER_EARLIER(
        `the same pair re-walked with the interior's NATURAL walls lifted as well — the shortest of the
        three readings, because it removes the most`,
        LE("negotiated.causeWalks.noStructures.d"),
      ),
      "negotiated.causeWalks.noWalls.dout": LAYER_EARLIER(
        `the attacker's side of that one`,
        EQ("negotiated.walk.dout"),
      ),
      "negotiated.causeWalks.noWalls.detour": LAYER_EARLIER_SIGNED(
        `the extra walk that leaves`,
        `it is a DETOUR, i.e. a difference between two walks, and lifting the interior's natural walls as ` +
          `well as our structures can make the defender's route SHORTER than the attacker's — 16 of the ` +
          `fleet's 57 records are negative here, down to -3, and that is the counterfactual's whole point`,
        -MOB_EXACT_MAX,
        MOB_EXACT_MAX,
        DIFFEQ("negotiated.causeWalks.noWalls.d", "negotiated.causeWalks.noWalls.dout"),
      ),
      "negotiated.causeWalks.noWalls.ratio": LAYER_EARLIER(
        `...and the ratio of the two`,
        QUOT("negotiated.causeWalks.noWalls.d", "negotiated.causeWalks.noWalls.dout"),
      ),
      "negotiated.floor": LAYER_EARLIER(
        `the lap layer 2 measured over the enclosures it admitted, BEFORE any eco lobe was bid in. The
        lobe's price is published beside it and the two add up to the lap`,
        LE("negotiated.lap"),
      ),
      "negotiated.candidates": SEARCH_COUNTER(
        `how many enclosures were within the rampart tiebreak of the cheapest cut this room admits`,
        ATLEAST(1, "the cut the room built was one of them"),
      ),
      "negotiated.tiebreakBudget": SEARCH_COUNTER(
        `the rampart tiebreak that defined that candidate set`,
        KONST("SHELL_TIEBREAK_RAMPARTS", SHELL_TIEBREAK_RAMPARTS),
      ),
      "negotiated.worstDetour.a.x": COORD("the longest-detour pair's first endpoint, on layer 2's wall"),
      "negotiated.worstDetour.a.y": COORD("the other half of that tile key"),
      "negotiated.worstDetour.b.x": COORD("its second endpoint"),
      "negotiated.worstDetour.b.y": COORD("the other half of that tile key"),
      "negotiated.worstDetour.din": LAYER_EARLIER(
        `the defender's walk on the longest-detour pair`,
        GE("negotiated.worstDetour.dout"),
      ),
      "negotiated.worstDetour.dout": LAYER_EARLIER(
        `...and the attacker's`,
        LE(BOARD("interiorTiles")),
      ),
      "negotiated.worstDetour.ratio": LAYER_EARLIER(
        `...and their quotient, which is a ratio over one of the pairs the ungated maximum ranges over`,
        QUOT("negotiated.worstDetour.din", "negotiated.worstDetour.dout"),
        LE("negotiated.metric.maxUngated"),
      ),
      "negotiated.eco": W(
        `the eco lobe layer 2 bought into the enclosure, or null where it bought none — three rooms in ` +
          `the fleet print the clause. Its four fields below carry their own bounds and the paragraph is ` +
          `required to tell the same story about whether there was a lobe at all; on the block itself, ` +
          `presence is the only bound this file holds it to`,
        (v) => (v === null || (v && typeof v === "object") ? null : `is ${JSON.stringify(v)}, not an object or null`),
      ),
      "negotiated.eco.ecoCost": LAYER_EARLIER(
        `what the lobe cost in lap — the difference between the floor layer 2 measured and the lap it
        settled on`,
        DIFFEQ("negotiated.lap", "negotiated.floor"),
      ),
      "negotiated.eco.bareDeep": SEARCH_COUNTER(`the deep tiles the bare enclosure held before the lobe`),
      "negotiated.eco.needDeep": SEARCH_COUNTER(
        `the program's deep-tile floor`,
        LE(BOARD("interiorWalkable")),
      ),
      "negotiated.eco.deepTiles": SEARCH_COUNTER(
        `...and what the room ends up with, which is what the lobe was bought to reach`,
        GE("negotiated.eco.needDeep"),
      ),
      "negotiated.metric.endpoints": SEARCH_COUNTER(
        `wall tiles layer 2's metric ran over`,
        GE("negotiated.metric.reachable"),
        LE(BOARD("interiorWalkable")),
      ),
      "negotiated.metric.reachable": SEARCH_COUNTER(
        `of those, the ones its walk region reached`,
        LE("negotiated.metric.endpoints"),
      ),
      "negotiated.metric.exact": W(
        `whether layer 2's metric was exact rather than sampled. The paragraph beside it renders one of ` +
          `two different clauses depending on this flag and is required to render the one it names; on ` +
          `the flag itself, its type is the only bound this file holds it to`,
        WITNESS_BOOL,
      ),
      "negotiated.shippedWallLap": LAYER_EARLIER(
        `layer 2's lap re-measured on the shipped wall, mass-free — the same board \`mass.bareLap\` is ` +
          `re-derived on, minus the tiles layer 7 took off the wall, so it is never the longer of the two`,
        LE("mass.bareLap"),
      ),
      "negotiated.shippedGatedPairs": SEARCH_COUNTER(
        `the gated pair count of that re-measurement`,
        GE("negotiated.shippedOverGated"),
        LE("metric.gatedPairs"),
      ),
      "negotiated.shippedOverGated": SEARCH_COUNTER(
        `...and how many of them were over target`,
        LE("negotiated.shippedGatedPairs"),
      ),
      "negotiated.tiles": W(
        `the endpoints of layer 2's worst pair, on layer 2's wall. They may not be on the SHIPPED wall — ` +
          `the bubbles, the adopted seal tiles and the inert prune all move it, and E13S4's pair names a ` +
          `tile layer 7 took off — so what is held is the part that cannot move`,
        null,
        [
          LENK(2, "a pair is two tiles"),
          BESPOKE("mobility.negotiated.pair", "both endpoints are real walkable tiles of this room, and they are the pair the paragraph names"),
        ],
      ),
    },
  ],
]) {
  RECORD_LEAVES.set(normPair(k), v);
}

/**
 * ==========================================================================
 * PRESENCE. THE TABLE IS ITERATED, NOT THE RECORD.
 * ==========================================================================
 * Round 16's mechanical reviewer deleted every classified leaf of every shipped
 * declaration, one at a time: **347 of 420 leaf instances escaped**, and whole
 * sub-records went with them — `mobility.negotiated` in all 57 rooms that ship
 * it (paragraph included), `mobility.lift`, `shallowExt.search`. All five of the
 * numbers round 14's reviewers PLANTED re-landed BY DELETION instead of by
 * falsification, and two of them left reader-facing prose standing that still
 * passed: "? deep tiles inside the widest enclosure it admits" and "undefined
 * cut tile(s) — 14,35 — carry a rampart".
 *
 * The cause was one line. The engine walked `recordLeaves(sf)` — the RECORD —
 * so a leaf this table named and the record omitted was never looked for. An
 * inventory that a producer satisfies by DELETING the thing being inventoried
 * is not an inventory; it is a catalogue of what happened to be there. It is the
 * same shape as criticisms 14/27/40 (delete-escape) one level in, and it is the
 * shape that survives longest, because every positive check still passes.
 *
 * So the loop is over the TABLE now, and a classed leaf the record does not
 * carry FAILS THE ROOM — unless this table says otherwise, BY NAME, with the
 * condition it is legitimately absent under and the reason that condition makes
 * it legitimate.
 *
 * AND THE OPTIONALITY BELOW WAS MEASURED, NOT ASSUMED. Blanket-requiring every
 * leaf would have failed 18 rooms on records that are honestly shaped two
 * different ways, and blanket-allowing absence would have been the bug again
 * with a comment on it. So every (gate,kind) in the fleet was grouped by its
 * leaf SIGNATURE: fourteen of the eighteen kinds have exactly one signature —
 * every leaf in every instance — and the four that do not differ structurally,
 * not accidentally:
 *
 *   mobility|            four independent NULLABLE sub-records (`lane.shrunk`
 *                        null in 51 of 57, `negotiated.eco` null in 54, `lift`
 *                        null in 2, `lift.residual` null in 1) plus a per-class
 *                        table that exists only where the lift CLEARS
 *   spawnfan|sector      `spawnFan.census.fannedAvailable` null in 1 of 7
 *   ctrlparks|seats      two branches: the parks the extension mass ATE
 *                        (`built`/`eaten`/`eaters`) or the seat search that came
 *                        up thin (`thinAt` + the whole `census`)
 *   towers|weak-battery  two branches: filed by layer 3 (carries layer 3's
 *                        placement census) or filed by the wall layer (`source`)
 *   battlements|         three branches, one per answer the substitute search
 *                        can give — already gated by a bespoke block, now the
 *                        presence half is gated by the same discriminator
 *   misc|off-network     two branches: the room has an extractor or it does not
 *
 * A NULLABLE SUB-RECORD IS GENERIC AND COSTS NOTHING. If an ancestor of the leaf
 * is ITSELF a classed leaf of this table and the record publishes it as exactly
 * `null`, the children are excused — because the record has SAID the sub-record
 * does not exist, and that `null` is checked like any other leaf (all four of
 * the fleet's are class D and re-derived). Deleting the parent instead of
 * nulling it is a missing classed leaf and fails.
 *
 * A BRANCH IS NOT MUTUAL EXCUSING. The obvious way to write a two-armed record
 * is "arm A's leaves are absent when arm B's are present, and vice versa" — and
 * that lets a producer delete BOTH arms, which is the deletion hole again in
 * two pieces. So a branch names a DISCRIMINATOR that must return one of the
 * arms: a record that takes none of them fails.
 */
/** the record carries this leaf path (as a value or as a sub-object); `*` matches any key */
function recordHasLeaf(sf, leaf) {
  const segs = leaf.split(".");
  const walk = (cur, i) => {
    if (cur === undefined) return false;
    if (i === segs.length) return true;
    if (cur === null || typeof cur !== "object" || Array.isArray(cur)) return false;
    if (segs[i] === "*") return Object.values(cur).some((v) => walk(v, i + 1));
    if (!(segs[i] in cur)) return false;
    return walk(cur[segs[i]], i + 1);
  };
  return walk(sf, 0);
}
/** the value at a dotted path, or `undefined` (no wildcards — ancestors are concrete) */
function recordAt(sf, path) {
  let cur = sf;
  for (const seg of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = cur[seg];
  }
  return cur;
}
/**
 * A leaf whose absence is admissible when `when(sf)` holds. `why` is the reason
 * the condition makes it legitimate and is printed with the census.
 */
const ABSENT_WHEN = (why, when, ...leaves) => ({ form: "when", why, when, leaves });
/**
 * A leaf NO record in the fleet carries. The class is kept so that a producer
 * which starts shipping it is CHECKED rather than rejected as unclassified; the
 * absence is admitted here rather than left to the reader to notice.
 */
const NEVER_SHIPPED = (why, ...leaves) => ({ form: "when", why, when: () => true, leaves, never: true });
/**
 * A record with N shapes, one per answer a search can give. `pick(sf)` returns
 * the arm this record took or `null`; a record that takes NO arm fails, which is
 * what stops "each arm excuses the other" from excusing both.
 */
const BRANCH = (why, pick, arms) => ({ form: "branch", why, pick, arms });

const RECORD_ABSENCE = new Map(
  [
    [
      "mobility|",
      [
        ABSENT_WHEN(
          `the per-class lift table is the OUTPUT of the lift experiment, and layer 2 only tabulates it in ` +
            `a room where lifting the mass actually clears the target. 56 of the fleet's 57 records ship ` +
            `\`lift.clears: false\` and have nothing to tabulate. The condition is \`lift.clears\`, which is ` +
            `class D and re-derived from this room's own board, so the excuse cannot be manufactured`,
          (sf) => !(sf.lift && sf.lift.clears === true),
          "lift.perClass.*.pairDin",
          "lift.perClass.*.lap",
        ),
        NEVER_SHIPPED(
          `no record in the fleet carries a per-class \`lap\`: the one lift record that exists (E11S6) ` +
            `tabulates \`pairDin\` per class and reports the lap once, for the whole lift. The class is kept ` +
            `so a producer that starts publishing it is re-derived rather than rejected`,
          "lift.perClass.*.lap",
        ),
      ],
    ],
    [
      "spawnfan|sector",
      [
        NEVER_SHIPPED(
          `the sector target is published once, on \`spawnFan.target\`, and the census does not repeat it. ` +
            `The class is kept because the derivation for it exists (it is this file's own SECTOR_TARGET) ` +
            `and would run the moment a producer wrote the field`,
          "spawnFan.census.target",
        ),
      ],
    ],
    [
      "ctrlparks|seats",
      [
        BRANCH(
          `a thin-parks declaration is filed for one of two reasons and the record is shaped by which: the ` +
            `extension mass ATE seats the layer-1 search had counted (the room reports what it built, what ` +
            `was eaten and which structures ate it), or the seat search never found more than the floor in ` +
            `the first place (the room reports the whole search census and the layer the count went thin at). ` +
            `Neither record is a subset of the other and neither is optional: a record carrying NEITHER ` +
            `discriminator has filed a thin-parks declaration without saying which thing happened`,
          (sf) =>
            sf.ctrlParks?.eaten !== undefined ? "eaten" : sf.ctrlParks?.thinAt !== undefined ? "search" : null,
          {
            eaten: ["ctrlParks.built", "ctrlParks.eaten", "ctrlParks.eaters"],
            search: [
              "ctrlParks.thinAt",
              "ctrlParks.census.considered",
              "ctrlParks.census.sealing",
              "ctrlParks.census.forcedOntoSealingPool",
              "ctrlParks.census.maxParks",
              "ctrlParks.census.minParksFloor",
              "ctrlParks.census.tookFirstAboveFloor",
              "ctrlParks.census.chosen.x",
              "ctrlParks.census.chosen.y",
              "ctrlParks.census.chosen.parks",
              "ctrlParks.census.chosen.hubWalk",
              "ctrlParks.census.chosen.score",
              "ctrlParks.census.runnerUp.x",
              "ctrlParks.census.runnerUp.y",
              "ctrlParks.census.runnerUp.parks",
              "ctrlParks.census.runnerUp.hubWalk",
              "ctrlParks.census.runnerUp.score",
            ],
          },
        ),
      ],
    ],
    [
      "towers|weak-battery",
      [
        BRANCH(
          `a weak-battery declaration is filed either by layer 3, which carries its own placement census ` +
            `into the record, or by the wall layer after the inert prune moved the wall, which names itself ` +
            `in \`source\` and has no placement search to report. The AS-BUILT half (\`battery.*\`, 17 leaves, ` +
            `every one re-derived from the shipped board) is required on BOTH arms and is what the ` +
            `declaration is actually about; the arms differ only in whether layer 3's search is quoted. ` +
            `KNOWN GAP, stated rather than hidden: 15 of the 16 records take the layer-3 arm and one (E18S3) ` +
            `takes the wall arm, and nothing on the board distinguishes them, so a producer that deleted the ` +
            `placement census AND wrote \`source: "walls"\` would take the wall arm legitimately. The fix is ` +
            `on the producer side — publish \`source\` unconditionally — not here`,
          (sf) => (sf.source === "towers" ? "layer3" : sf.source === "walls" ? "walls" : null),
          {
            layer3: [
              "towers.maxRefill",
              "towers.refillDists",
              "towers.minShellDmg",
              "towers.avgShellDmg",
              "towers.weakShellDmg",
              "towers.weakTiles",
              "towers.declaredCutTiles",
              "towers.maxRefillHard",
              "towers.maxRefillUnblocked",
              "towers.refillNote",
              "towers.refillCap",
              "towers.targetMin",
              "towers.depthSafe",
              "towers.spreadRadius",
              "towers.starts",
              "towers.candidates",
              "towers.escRounds",
              "towers.pairK",
              "towers.search.ran",
              "towers.search.rounds",
              "towers.search.restarts",
              "towers.search.starts",
              "towers.search.pairK",
              "towers.search.improvements",
              "towers.search.improvedFrom",
              "towers.search.improvedTo",
              "towers.search.converged",
              "towers.refillSearch.rounds",
              "towers.refillSearch.tried",
              "towers.refillSearch.moved",
              "towers.refillSearch.scoreTied",
              "towers.refillSearch.crossOffered",
              "towers.refillSearch.dispersionOk",
              "towers.refillSearch.before",
              "towers.refillSearch.after",
            ],
            walls: ["source"],
          },
        ),
      ],
    ],
    [
      "battlements|",
      [
        BRANCH(
          `layer 2's alternative-enclosure search gives one of three answers and each answer owns a ` +
            `different set of numbers: "swap" prices an alternative cut against a budget, "small" measures ` +
            `the best reachable enclosure against the program's deep-tile floor, and "none" has nothing to ` +
            `report because no protect radius produced a reachable cut at all. The bespoke block ` +
            `\`battlements.substitute.branch\` already refuses a record carrying another branch's numbers; ` +
            `this is the other half of the same rule — the branch's OWN numbers cannot be deleted either`,
          (sf) => {
            const kk = String(sf.battlements?.substitute?.kind);
            return ["swap", "small", "none"].includes(kk) ? kk : null;
          },
          {
            swap: ["battlements.substitute.altCut", "battlements.substitute.thisCut", "battlements.substitute.budget"],
            small: [
              "battlements.substitute.radius",
              "battlements.substitute.cut",
              "battlements.substitute.deep",
              "battlements.substitute.needDeep",
            ],
            none: [],
          },
        ),
      ],
    ],
    [
      "misc|off-network",
      [
        BRANCH(
          `the mineral seat's record names the extractor that stands on the mineral. A room whose plan has ` +
            `no extractor publishes \`offNetwork.extractor: null\` and none of the five extractor readings; ` +
            `a room that has one publishes the five and not the null. All 133 records in this fleet take the ` +
            `second arm. A record taking NEITHER has not said whether the extractor exists`,
          (sf) =>
            sf.offNetwork?.extractor === null
              ? "absent"
              : sf.offNetwork?.extractor !== undefined
                ? "present"
                : null,
          {
            absent: ["offNetwork.extractor"],
            present: [
              "offNetwork.extractor.x",
              "offNetwork.extractor.y",
              "offNetwork.extractorNetTiles",
              "offNetwork.extractorStands",
              "offNetwork.extractorObstacle",
            ],
          },
        ),
      ],
    ],
  ].map(([k, v]) => [normPair(k), v]),
);

/**
 * ==========================================================================
 * ARRAYS ARE NOT LEAVES. THEIR ELEMENTS ARE.
 * ==========================================================================
 * `recordLeaves()` does not descend into an array, and the comment above it
 * says why: an array's CONTENT is checked by the per-kind derivation that knows
 * what it is a list of. Round 16's owner-voice reviewer (F11, cause 2) checked
 * whether that was true. It was not.
 *
 *   - `shallowExt.slots[].why` is PRODUCER FREE TEXT rendered verbatim into the
 *     paragraph `declprose.mjs` exists to abolish. E12S6's six PRICED legal
 *     trades — each one a real deep target refused on a defender-lap ceiling —
 *     were laundered into "6 slots had NO deep target of any kind" and passed
 *     172/172. That is criticism 12 and criticism 1's whole argument, inverted,
 *     shipping.
 *   - `ladder.rungs[].mobility` is not checked by the bespoke block whose own
 *     `say` text claims "every rung carries the four fields a rung is made of":
 *     the block checked `rung` and `ramparts`. Moving three mobilities flips the
 *     renderer's verdict from "A WIDER CUT DOES SHORTEN IT … refused on
 *     upkeep-first policy" to "No rung this room composed measured a materially
 *     shorter lap". 13 fleet rooms were exposed.
 *
 * So an array of records gets the same treatment the record got: a CLOSED field
 * inventory per element, a class per field, and — for the two free-text fields —
 * RENDER-OR-DIE. The `why` on a slot is generated here from the slot's own
 * numbers and compared string-for-string, exactly as `detail` is generated from
 * the record. A sentence that is generated cannot be a sentence that lies about
 * the numbers it was generated from.
 */
/** a per-element field this file RE-DERIVES; `derive(el,i,ctx)` returns the value or undefined to skip */
const AD = (why, derive) => ({ klass: "derived", why, derive });
/** a per-element field held to a type bound and to closures over its own element and record */
const AW = (why, bound, closures = []) => ({ klass: "witnessed", why, bound, closures });
/**
 * A per-element field that is PROSE. `classes` is a closed list of
 * `{ id, when(el, sf), render(el, sf, ctx) }`: exactly one class must claim the
 * element, and the field must equal that class's rendering character for
 * character. A `why` matching no class fails; a `why` matching the wrong class
 * fails; a `why` whose numerals disagree with the element fails, because the
 * numerals are not READ out of the text, they are PUT into it.
 */
const APROSE = (why, classes) => ({ klass: "prose", why, classes });
/** the element inventory of one array leaf */
const ELEMENTS = (why, fields, closures = []) => ({ why, fields, closures });
/** a closure path that reads the ELEMENT rather than the record */
const SELF = (f) => `~${f}`;

const R2N = (v) => Math.round(v * 100) / 100;
const INT_COORD = (v) => (Number.isInteger(v) && v >= 0 && v <= 49 ? null : `is ${JSON.stringify(v)}, not a room coordinate`);
const NUM_NONNEG = WITNESS_NONNEG;

const RECORD_ARRAY_LEAVES = new Map(
  [
    [
      "extensions|shallow",
      {
        "shallowExt.slots": ELEMENTS(
          `one row per shallow extension the room ships, and the row is what the paragraph's per-slot ` +
            `lines are printed from`,
          {
            x: AD(`the slot's own tile — it must BE one of the shallow extensions this room ships`, (el, i, ctx) => ctx.shallowExts[i]?.x),
            y: AD(`...and its y, taken from the same shipped shallow-extension list in the same order`, (el, i, ctx) => ctx.shallowExts[i]?.y),
            depth: AD(`the tile's depth, re-derived from this room's own exterior flood`, (el, i, ctx) =>
              Number.isInteger(el.x) && Number.isInteger(el.y) ? ctx.depthAt(el.x, el.y) : undefined,
            ),
            targets: AW(
              `how many deep targets were still on the table when this slot was priced. It is the sum of ` +
                `the two surviving classes the search census publishes, which is what makes the "there was ` +
                `nowhere to go" sentence checkable rather than assertable`,
              NUM_NONNEG,
              [SUMEQ("shallowExt.search.left", "shallowExt.search.paveLeft")],
            ),
            targetsFaced: AW(
              `of those, the ones already carrying a D4 road face; it may not exceed the whole offer and ` +
                `may not exceed the road-faced tiles the census counted`,
              NUM_NONNEG,
              [LE(SELF("targets")), LE("shallowExt.search.freeDeepRoadFaced")],
            ),
            targetsOnePave: AW(
              `...and the ones one plain pave from the network; the two classes are the whole offer`,
              NUM_NONNEG,
              [LE(SELF("targets")), LE("shallowExt.search.freeDeepOnePave"), DIFFEQ(SELF("targets"), SELF("targetsFaced"))],
            ),
            examined: AW(
              `how many of the offered targets this slot actually priced. A slot cannot examine a target it ` +
                `was not offered`,
              NUM_NONNEG,
              [LE(SELF("targets"))],
            ),
            bestLegal: AW(
              `the cheapest target that passed the engine's own legality test, with the defender lap ` +
                `standing the extension there produced. It is null exactly when the offer was empty, and ` +
                `when it is not null the tile is a real, empty, deep tile of this room and the lap is over ` +
                `the ceiling — a target UNDER the ceiling would have been taken, not reported`,
              null,
            ),
            ceiling: AW(
              `the defender-lap ceiling the trade was priced against. A trade may not make the room WORSE ` +
                `than it already is, so the honest ceiling is the larger of this file's own MOB_TARGET and ` +
                `the room's as-built lap — both of which are re-derived from this room's own board. It is ` +
                `null where no trade was priced`,
              null,
              [
                PRED(
                  "it is exactly the larger of MOB_TARGET and this room's as-built gated lap, or null",
                  (self, get) => {
                    const lap = cnum(get(SELF("lapNow")));
                    if (self === null || self === undefined || lap === null) return null;
                    const want = R2N(Math.max(MOB_TARGET, lap));
                    return near2(self, want)
                      ? null
                      : `is ${self} and the larger of the ${MOB_TARGET} target and this room's own ` +
                          `as-built lap of ${lap} is ${want}`;
                  },
                ),
              ],
            ),
            lapNow: AD(
              `the as-built gated defender lap before the trade — the number the ceiling is measured ` +
                `against. It is this room's own shipped mobility, re-derived here from the board, which is ` +
                `what stops a slot from pricing its refusal against a lap the room does not have`,
              (el, i, ctx) => ctx.builtGated,
            ),
            why: APROSE(
              `the per-slot sentence the declaration prints. GENERATED from the row, not written beside it`,
              [
                {
                  id: "priced",
                  when: (el) => cnum(el.targets) !== null && el.targets > 0,
                  render: (el) =>
                    `of the ${el.targets} deep target(s) offered (${el.targetsFaced} already road-faced and ` +
                    `${el.targetsOnePave} one plain pave away) the cheapest legal one is ` +
                    `${el.bestLegal?.x},${el.bestLegal?.y} and standing this extension there takes the ` +
                    `as-built gated defender lap to ${el.bestLegal?.lap}, past this room's ceiling of ${el.ceiling}`,
                },
                // ==================================================
                // ROUND 17 / F7 — TWO DISTINCT FACTS, TWO SENTENCES.
                // ==================================================
                // There was ONE class here and it fired on `targets === 0`,
                // where `targets` is what REMAINED after the backfill, the
                // relocations and the paves had spent the opening census —
                // while the sentence asserted the scan RETURNED an empty
                // candidate list. On the round-17 baseline 19 of the fleet's
                // 25 shallow slots rendered it against records that say
                // otherwise: E9S2's fifteen slots all read "NO free deep
                // tile … in BOTH classes" beside `freeDeepRoadFaced 3`,
                // `freeDeepOnePave 1`, `spentOnAdds 3`, `paveTaken 1`. The
                // room HAD four and spent them elsewhere. A reader was told
                // the room has no such tile; that is criticism 19's defect
                // class inside the channel criticism 19 created.
                //
                // The discriminator is the OPENING census, not the re-scan.
                // Today's board: 0 slots take `impossible-empty`, 19 take
                // `impossible-spent`. The empty class stays so the two facts
                // remain separable — a room that genuinely never had one
                // must be able to say so, and a mutation proves it would.
                {
                  id: "impossible-empty",
                  when: (el, sf) =>
                    cnum(el.targets) === 0 &&
                    cnum(sf.shallowExt?.search?.freeDeepRoadFaced) === 0 &&
                    cnum(sf.shallowExt?.search?.freeDeepOnePave) === 0,
                  render: (el, sf) =>
                    `this room has NO free deep tile that is road-faced or one pave away and never had one — ` +
                    `the post-prune scan over all ${sf.shallowExt?.search?.interiorTiles} positions of the 48x48 ` +
                    `buildable band (of which ${sf.shallowExt?.search?.interiorWalkable} are walkable floor ` +
                    `inside this room's own wall) returned an empty candidate list in BOTH classes at the census ` +
                    `AND on the re-scan after every placement, so there is nowhere for this slot to go`,
                },
                {
                  id: "impossible-spent",
                  when: (el, sf) =>
                    cnum(el.targets) === 0 &&
                    (cnum(sf.shallowExt?.search?.freeDeepRoadFaced) > 0 ||
                      cnum(sf.shallowExt?.search?.freeDeepOnePave) > 0),
                  render: (el, sf) => {
                    const se = sf.shallowExt?.search || {};
                    return (
                      `this room HAD free deep tiles and SPENT them: the post-prune scan over all ` +
                      `${se.interiorTiles} positions of the 48x48 buildable band (of which ${se.interiorWalkable} ` +
                      `are walkable floor inside this room's own wall) found ${se.freeDeepRoadFaced} already ` +
                      `road-faced and ${se.freeDeepOnePave} one plain pave away, and by the time this slot was ` +
                      `offered them ${se.spentOnAdds} of the road-faced class had gone to the backfill ` +
                      `(extensions this room did not have at all), ${se.spentOnMoves} had taken a relocated ` +
                      `shallow slot and ${se.paveTaken} of the one-pave class had been TAKEN — leaving ${se.left} ` +
                      `road-faced and ${se.paveLeft} one-pave candidate(s) by that arithmetic, and 0 of either ` +
                      `class on the re-scan against the board this room ships. Nothing was refused for this slot; ` +
                      `there was nothing left to refuse`
                    );
                  },
                },
              ],
            ),
          },
          [
            PRED(
              "the offer is empty exactly when there is no cheapest legal target and no ceiling was priced",
              (el) => {
                const t = cnum(el.targets);
                if (t === null) return null;
                if (t > 0 && !el.bestLegal) {
                  return `is offered ${t} deep target(s) and names no cheapest legal one — a priced trade ` +
                    `with nothing priced`;
                }
                if (t === 0 && el.bestLegal) {
                  return `is offered NO deep target and still names ${JSON.stringify(el.bestLegal)} as the ` +
                    `cheapest legal one`;
                }
                return null;
              },
            ),
            PRED(
              "a target reported as refused priced OVER the ceiling — one under it would have been taken",
              (el) => {
                if (!el.bestLegal || cnum(el.bestLegal.lap) === null || cnum(el.ceiling) === null) return null;
                return el.bestLegal.lap > el.ceiling
                  ? null
                  : `names ${el.bestLegal.x},${el.bestLegal.y} at a lap of ${el.bestLegal.lap} against a ` +
                      `ceiling of ${el.ceiling}. A trade that passes the ceiling is a trade the pass TAKES; ` +
                      `reporting it as the reason the slot stayed shallow inverts the test`;
              },
            ),
          ],
        ),
        "shallowExt.search.refused": ELEMENTS(
          `one row per candidate tile the backfill/relocation acceptance test threw away`,
          {
            k: AW(
              `the tile key the test refused, as "x,y". It is a real tile of this room's own 50x50 grid`,
              (v) => {
                const m = /^(\d+),(\d+)$/.exec(String(v));
                if (!m) return `is ${JSON.stringify(v)}, not an "x,y" tile key`;
                const x = +m[1];
                const y = +m[2];
                return x >= 0 && x <= 49 && y >= 0 && y <= 49 ? null : `is ${v}, outside the room`;
              },
            ),
            why: APROSE(`the refusal's own sentence, GENERATED from the class it belongs to`, [
              {
                id: "no-face",
                when: () => true,
                render: () =>
                  `no D4 road face, and the free-floor backfill never paves (the priced ladder below may ` +
                  `buy one, but only while the room is still short of 60)`,
              },
            ]),
          },
        ),
      },
    ],
    [
      "mobility|",
      {
        "ladder.rungs": ELEMENTS(
          `layer 2's escalation ladder, one row per rung it composed. Every rung but the one that shipped ` +
            `is an enclosure this room did not build, so the board carries no trace of them — which is ` +
            `exactly why the rows have to close on each other and on the rung that DID ship`,
          {
            rung: AD(`the rung's own index on the trail; the list is the walk, in order`, (el, i) => i),
            needDeepBonus: AD(
              `the deep-tile bonus this rung asked for. The ladder's schedule is fixed — 0, 25, 55, 85 — ` +
                `and all 57 of the fleet's records walk exactly it, so the value is a function of the index`,
              (el, i) => [0, 25, 55, 85][i],
            ),
            mobility: AW(
              `the defender lap this rung's enclosure measured. LAYER-EARLIER and genuinely not ` +
                `re-derivable — the enclosure was never built — so what holds it is that it is a ` +
                `non-negative number under this file's own exact-metric ceiling, and that the pair ` +
                `(mobility, ramparts) of the rung the room SHIPPED appears on this list`,
              (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MOB_EXACT_MAX ? null : `is ${JSON.stringify(v)}, not a lap in [0, ${MOB_EXACT_MAX}]`),
            ),
            ramparts: AW(
              `what that enclosure would have cost in ramparts. A whole number, and no enclosure of a ` +
                `50x50 room costs more ramparts than the room has tiles`,
              (v) => (Number.isInteger(v) && v >= 0 && v <= 2500 ? null : `is ${JSON.stringify(v)}, not a rampart count`),
            ),
            complete: AW(
              `whether the composition at this rung finished. Its type is the only bound this file holds ` +
                `it to and that is the whole bound`,
              WITNESS_BOOL,
            ),
          },
        ),
        "negotiated.tiles": ELEMENTS(
          `the two endpoints of layer 2's worst pair. Walked by the \`mobility.negotiated.pair\` block`,
          {
            x: AW(`a whole number inside this rooms own 50x50 grid; the PAIR it belongs to is walked by the worst-pair bespoke block, which requires both endpoints to be walkable tiles of this room`, INT_COORD),
            y: AW(`...and the other half of the same coordinate, held to the same grid and walked by the same block`, INT_COORD),
          },
        ),
      },
    ],
    [
      "labs|shallow-lab",
      {
        "labs.shallow": ELEMENTS(
          `one row per lab this room ships under the depth floor; the row is where the declaration gets the tile it names`,
          {
            x: AD(`the lab's own tile — it must BE one of the shallow labs this room ships`, (el, i, ctx) => ctx.shallowLabs[i]?.x),
            y: AD(`...and its y, taken from the same shipped shallow-lab list in the same order`, (el, i, ctx) => ctx.shallowLabs[i]?.y),
            depth: AD(`the tile's depth, re-derived from this room's own exterior flood`, (el, i, ctx) =>
              Number.isInteger(el.x) && Number.isInteger(el.y) ? ctx.depthAt(el.x, el.y) : undefined,
            ),
          },
        ),
      },
    ],
    [
      "spawnFan|sector",
      {
        "spawnFan.census.fannedAvailable.tiles": ELEMENTS(
          `the three seats of the rival triple, walked by the census lattice block`,
          {
            x: AW(`a whole number inside this rooms own 50x50 grid; the three seats together are walked by the census lattice block, which requires them pairwise non-adjacent and target-reaching`, INT_COORD),
            y: AW(`...and the other half of the same coordinate, held to the same grid and walked by the same block`, INT_COORD),
          },
        ),
      },
    ],
  ].map(([k, v]) => [normPair(k), v]),
);

/**
 * The load-time consistency check on the table above, in the same spirit as the
 * pair, obligation and prose inventories: every declaration kind this file knows
 * about has a leaf table, every leaf carries exactly one of the three classes,
 * and every WITNESSED or EXEMPT leaf carries a reason long enough to be a
 * reason. The last of those is the whole point — a leaf that is not re-derived
 * has to say what holds it instead, and "nothing" is an answer a reader can act
 * on where silence is not.
 */
function assertRecordInventory() {
  const known = new Set([...OBLIGATION_KINDS_N, ...OBLIGATION_EXEMPT_N.keys()]);
  const problems = [];
  for (const k of known) {
    if (!RECORD_LEAVES.has(k)) problems.push(`${k} has no record-leaf table`);
  }
  for (const k of RECORD_LEAVES.keys()) {
    if (!known.has(k)) problems.push(`${k} has a record-leaf table and is not a declaration kind`);
  }
  let derived = 0;
  let witnessed = 0;
  let exempt = 0;
  let closured = 0;
  const bespokeClaimed = new Set();
  for (const [k, table] of RECORD_LEAVES) {
    for (const [leaf, cls] of Object.entries(table)) {
      if (!cls || typeof cls !== "object") {
        problems.push(`${k} ${leaf} carries no class at all`);
        continue;
      }
      if (cls.klass === "derived") derived++;
      else if (cls.klass === "witnessed") witnessed++;
      else if (cls.klass === "exempt") exempt++;
      else {
        problems.push(`${k} ${leaf} is class ${JSON.stringify(cls.klass)}, not derived/witnessed/exempt`);
        continue;
      }
      if (cls.klass !== "derived" && (typeof cls.why !== "string" || cls.why.trim().length < 40)) {
        problems.push(
          `${k} ${leaf} is ${cls.klass} with no stated reason — a leaf nothing re-derives has to say what ` +
            `holds it instead`,
        );
      }
      if (leaf !== normLeaf(leaf)) {
        problems.push(`${k} ${leaf} is not in normalised leaf form (${normLeaf(leaf)})`);
      }
      // ==============================================================
      // A BOUND THIS FILE PROMISES AND DOES NOT PERFORM FAILS AT LOAD.
      //
      // This is the derived half's rule ("a leaf classed D that the
      // derivation does not produce is a hard fail") applied to the
      // witnessed half. Round 14 gave the witnessed leaves a SENTENCE
      // saying what held them; the sentence was true for one declaration
      // kind and decorative for the other seventeen. Now: a `why` that
      // states an arithmetic bound must carry the closure that evaluates
      // it, or the file will not start.
      // ==============================================================
      if (cls.klass === "witnessed") {
        const closures = cls.closures || [];
        if (!Array.isArray(closures)) {
          problems.push(`${k} ${leaf} carries a \`closures\` that is not a list`);
          continue;
        }
        const generated = closures.length ? closureSentence(closures) : "";
        const handWritten = generated && cls.why.includes(generated) ? cls.why.replace(generated, "") : cls.why;
        if (!closures.length && PROMISE_RE.test(handWritten)) {
          problems.push(
            `${k} ${leaf} PROMISES AN ARITHMETIC BOUND IN ITS \`why\` AND CARRIES NO CLOSURE — ` +
              `"${(handWritten.match(PROMISE_RE) || [""])[0]}" appears in a sentence nothing in this file ` +
              `evaluates. Attach the closure or say only what is true: a witnessed leaf is allowed to be ` +
              `type-only, it is not allowed to say it is more than that`,
          );
        }
        // ...AND SILENCE IS NOT HONESTY EITHER. A leaf held to nothing but its
        // type has to SAY it is held to nothing but its type. Without this, the
        // difference between "checked to a weaker standard" and "not checked"
        // is a reader's guess, which is the state the whole witnessed half was
        // in: it never claimed a bound it did not have, it simply did not
        // mention that the sentence was all there was. The generated
        // constructors write the clause for themselves; a hand-written `why`
        // has to write it out.
        if (!closures.length && !TYPE_ONLY_RE.test(cls.why)) {
          problems.push(
            `${k} ${leaf} is witnessed, carries NO closure, and its \`why\` does not say so. A leaf held ` +
              `to nothing but its type is admissible; a leaf held to nothing but its type that reads like ` +
              `a leaf held to something is the defect. Say it: "and that is the whole bound"`,
          );
        }
        for (const c of closures) {
          if (!c || !CLOSURE_OPS[c.op]) {
            problems.push(`${k} ${leaf} carries a closure with no operator (${JSON.stringify(c)})`);
            continue;
          }
          if (c.op === "bespoke") {
            if (!BESPOKE_CLOSURES.has(c.id)) {
              problems.push(
                `${k} ${leaf} names bespoke closure "${c.id}", which is not in BESPOKE_CLOSURES — a leaf ` +
                  `cannot point at a block that does not exist`,
              );
            } else {
              bespokeClaimed.add(c.id);
            }
            continue;
          }
          // a closure that names a sibling leaf must name a leaf THIS KIND
          // has — a typo would otherwise read as a silently-skipped bound
          const other = c.other || (c.parts && c.parts[0]) || (c.minus && c.minus[0]);
          for (const path of [c.other, ...(c.parts || []), ...(c.minus || [])].filter(Boolean)) {
            if (path.startsWith("@")) continue;
            if (path.startsWith("#")) {
              if (!BOARD_FACTS.includes(path.slice(1))) {
                problems.push(`${k} ${leaf} has a closure against \`${path}\`, which is not a board fact`);
              }
              continue;
            }
            if (path.startsWith("~")) continue;
            if (!(path in table) && !(normLeaf(path) in table)) {
              problems.push(
                `${k} ${leaf} has a closure against \`${path}\`, which is not a leaf of this declaration ` +
                  `kind's own record — a bound against a field that cannot exist never runs`,
              );
            }
          }
          void other;
        }
        if (closures.length) closured++;
      }
    }
  }
  // ==================================================================
  // ...AND THE `why` GENERATOR ONLY EVER LOOKED ONE WAY.
  //
  // Round 16, L9: `eco.basin`'s generated sentence ended "and THAT IS THE
  // WHOLE BOUND — no other number on this record closes around it" while
  // `eco.coreSize`, three lines below it, carried `LE("eco.basin")`. The
  // core is grown INSIDE the basin, so the basin was bounded from below by
  // the core all along — the generator enumerated a leaf's OUTBOUND
  // closures and an inbound one, whose entire purpose is to constrain the
  // leaf it names, read as absent.
  //
  // False in the safe direction is still false, and a reader deciding
  // where to attack reads that sentence as an invitation. So a leaf that
  // SAYS it is held to nothing while a sibling is held to IT does not
  // load.
  // ==================================================================
  for (const [k, table] of RECORD_LEAVES) {
    const inbound = new Map();
    for (const [leaf, cls] of Object.entries(table)) {
      for (const c of (cls && cls.closures) || []) {
        for (const path of [c.other, ...(c.parts || []), ...(c.minus || []), ...(c.over || [])].filter(Boolean)) {
          if (typeof path !== "string" || path.startsWith("@") || path.startsWith("#") || path.startsWith("~")) continue;
          const t = normLeaf(path) in table ? normLeaf(path) : path;
          if (!inbound.has(t)) inbound.set(t, []);
          inbound.get(t).push(leaf);
        }
      }
    }
    for (const [leaf, cls] of Object.entries(table)) {
      if (!cls || cls.klass !== "witnessed") continue;
      if ((cls.closures || []).length) continue;
      if (!TYPE_ONLY_RE.test(cls.why)) continue;
      const held = inbound.get(leaf);
      if (held && held.length) {
        problems.push(
          `${k} ${leaf} says it is held to nothing but its type, and ${held.join(", ")} ` +
            `${held.length > 1 ? "are" : "is"} held to IT. A closure constrains BOTH of the leaves it ` +
            `names; the \`why\` generator enumerated only the outbound ones, so a leaf with an inbound ` +
            `bound advertised itself as unbounded. False in the safe direction is still false`,
        );
      }
    }
  }
  // ...and the other direction: a bespoke block nobody claims is a check with
  // no reader, which is how a rule quietly stops applying to anything.
  for (const id of BESPOKE_CLOSURES) {
    if (!bespokeClaimed.has(id)) {
      problems.push(`BESPOKE_CLOSURES names "${id}" and no record leaf claims it — a dead check`);
    }
  }
  // ==================================================================
  // ...AND THE ABSENCE TABLE, WHICH IS THE ONLY WAY A CLASSED LEAF IS
  // ALLOWED TO BE MISSING. A rule against a leaf that does not exist is a
  // typo that reads as coverage, and a rule with no reason is the blanket
  // this round exists to refuse.
  // ==================================================================
  let excusable = 0;
  for (const [k, rules] of RECORD_ABSENCE) {
    const table = RECORD_LEAVES.get(k);
    if (!table) {
      problems.push(`RECORD_ABSENCE names ${k}, which has no record-leaf table`);
      continue;
    }
    if (!Array.isArray(rules) || !rules.length) {
      problems.push(`${k} has an empty absence rule list — delete the entry rather than ship an empty one`);
      continue;
    }
    for (const r of rules) {
      if (typeof r.why !== "string" || r.why.trim().length < 60) {
        problems.push(
          `${k} carries an absence rule with no stated reason. A leaf allowed to be missing is a leaf ` +
            `nothing checks; the reason the ABSENCE is legitimate is the whole of what a reader gets`,
        );
      }
      const named = r.form === "branch" ? Object.values(r.arms).flat() : r.leaves;
      if (!named.length) problems.push(`${k} carries an absence rule naming no leaf`);
      for (const leaf of named) {
        if (!(leaf in table)) {
          problems.push(
            `${k} has an absence rule for \`${leaf}\`, which is not a leaf of this kind's record table — ` +
              `a rule against a field that cannot exist is a rule that never runs`,
          );
        }
      }
      excusable += named.length;
      if (r.form === "branch") {
        if (typeof r.pick !== "function") problems.push(`${k} has a branch rule with no discriminator`);
        if (Object.keys(r.arms).length < 2) problems.push(`${k} has a branch rule with fewer than two arms`);
        const seen = new Set();
        for (const leaf of named) {
          if (seen.has(leaf)) {
            problems.push(
              `${k} branch rule names \`${leaf}\` in two arms — a leaf owned by both arms is owned by ` +
                `neither, and both arms would excuse it`,
            );
          }
          seen.add(leaf);
        }
      } else if (typeof r.when !== "function") {
        problems.push(`${k} has a conditional absence rule with no condition`);
      }
    }
  }
  // ==================================================================
  // ...AND THE ARRAY-ELEMENT TABLE. An array leaf whose elements are
  // records must name the array in the leaf table too (or the element
  // inventory is describing a field that is not part of the record), and
  // every element field must carry exactly one class with a reason.
  // ==================================================================
  let elemFields = 0;
  for (const [k, arrays] of RECORD_ARRAY_LEAVES) {
    const table = RECORD_LEAVES.get(k);
    if (!table) {
      problems.push(`RECORD_ARRAY_LEAVES names ${k}, which has no record-leaf table`);
      continue;
    }
    for (const [arrPath, spec] of Object.entries(arrays)) {
      if (!(arrPath in table)) {
        problems.push(
          `${k} has an element inventory for \`${arrPath}\`, which is not a leaf of this kind's record ` +
            `table — an element inventory for an array that is not part of the record never runs`,
        );
      }
      if (typeof spec.why !== "string" || spec.why.trim().length < 40) {
        problems.push(`${k} ${arrPath} element inventory carries no stated reason`);
      }
      const fields = Object.entries(spec.fields || {});
      if (!fields.length) problems.push(`${k} ${arrPath} element inventory classes no field`);
      for (const [f, cls] of fields) {
        elemFields++;
        if (!cls || !["derived", "witnessed", "prose"].includes(cls.klass)) {
          problems.push(`${k} ${arrPath}[].${f} is class ${JSON.stringify(cls && cls.klass)}`);
          continue;
        }
        if (typeof cls.why !== "string" || cls.why.trim().length < 40) {
          problems.push(`${k} ${arrPath}[].${f} carries no stated reason`);
        }
        if (cls.klass === "prose") {
          if (!Array.isArray(cls.classes) || !cls.classes.length) {
            problems.push(`${k} ${arrPath}[].${f} is prose with no closed class list — that is free text again`);
          } else {
            for (const c of cls.classes) {
              if (!c || typeof c.id !== "string" || typeof c.when !== "function" || typeof c.render !== "function") {
                problems.push(`${k} ${arrPath}[].${f} has a prose class that is not {id, when, render}`);
              }
            }
          }
        }
        if (cls.klass === "derived" && typeof cls.derive !== "function") {
          problems.push(`${k} ${arrPath}[].${f} is class DERIVED and carries no derivation`);
        }
        for (const c of cls.closures || []) {
          if (!c || !CLOSURE_OPS[c.op]) problems.push(`${k} ${arrPath}[].${f} carries a closure with no operator`);
        }
      }
    }
  }
  if (problems.length) {
    throw new Error(
      `validate.mjs record-leaf inventory is inconsistent — ${problems.join("; ")}. Every leaf of every ` +
        `declaration record is either re-derived, witnessed with a stated bound, or exempt by name; a leaf ` +
        `with no class is the 472-of-536 gap nine planted lies walked through in one round, and a leaf ` +
        `whose stated bound this file does not evaluate is the same gap wearing the inventory's own words.`,
    );
  }
  return { derived, witnessed, exempt, closured, bespoke: bespokeClaimed.size, excusable, elemFields };
}
const RECORD_LEAF_CENSUS = assertRecordInventory();

/**
 * Exported for mutate.mjs. The load-time rule "a `why` that states an
 * arithmetic bound must carry the closure that evaluates it" cannot be tested
 * by breaking a PLAN — it is a property of this file — so the gate suite tests
 * it the only way it can: by handing this function a leaf of exactly the
 * description the rule refuses, and one of the description it allows.
 */
export function witnessPromiseUnbacked(cls) {
  if (!cls || cls.klass !== "witnessed") return false;
  const closures = cls.closures || [];
  const generated = closures.length ? closureSentence(closures) : "";
  const handWritten = generated && cls.why.includes(generated) ? cls.why.replace(generated, "") : cls.why;
  return !closures.length && PROMISE_RE.test(handWritten);
}
/** ...and the other half of the same rule: a closure-less leaf that does not say so */
export function witnessSilentlyTypeOnly(cls) {
  if (!cls || cls.klass !== "witnessed") return false;
  return !(cls.closures || []).length && !TYPE_ONLY_RE.test(cls.why);
}
/** ...and the inventory's own shape, so the suite can assert it is not empty */
export const RECORD_LEAF_STATS = RECORD_LEAF_CENSUS;
/**
 * The table itself, exported so the gate suite can assert the C1 presence rule
 * from the outside (every classed leaf of a shipped record is either present or
 * excused BY NAME) without re-typing 420 leaf paths.
 */
export const RECORD_LEAF_TABLE = RECORD_LEAVES;

/**
 * Walk a declaration's RECORD leaves — everything that is not the envelope.
 * Arrays are leaves: an array's CONTENT is checked by the per-kind derivation
 * that knows what it is a list of, and descending into one would make the leaf
 * set a function of the data rather than of the schema.
 */
/**
 * ==========================================================================
 * ROUND 17 / O1 (BLOCKING) — THE NOTE RECORD'S LISTS WERE BOUND TO NOTHING.
 * ==========================================================================
 * Round 16 closed the note channel by making the paragraph a function of the
 * record (`renderNote(rec) === notes[i]`) and the record's EXISTENCE a function
 * of the room (`meta.noteObligations`). What it did not do is bind the record's
 * CONTENTS to anything. The owner-voice reviewer walked straight through the
 * gap with the attack a producer actually makes — edit the record AND let the
 * note regenerate from it:
 *
 *   `roadRampart.ringTiles` -> `[{x:49,y:49}]` (the exact round-16-closed
 *      exploit, re-landed one channel over) and -> the sitter's own tile
 *   `sealedFloor.named` -> invented tiles that are reachable and occupied
 *   `shallowExt.search.freeDeepRoadFaced` 5 -> 60
 *   `shallowExt.l7.tiles` -> relocations that never happened
 *   `redundantCut.named[].reason.tile` -> "1,1"
 *   `pavedRun.runs[].free` / `.refused` -> a refusal the room never made
 *
 * Every SCALAR in the same records bit, and so did every META-side copy of the
 * same lists — because the meta copies are class-D re-derived elsewhere in this
 * file. The record is a SECOND, UNBOUND copy of a checked object. So the fix is
 * not a new derivation: it is an IDENTITY. Each note record's lists and
 * sub-records are bound, field for field, to the class-D twin the plan already
 * publishes and this file already re-derives — and the two that have no twin
 * (`containerRoad.sharing`, `containerRoad.containersOnRoads`) are re-derived
 * from the shipped board directly.
 *
 * The binding is SUBSET-SHAPED on purpose: a note record legitimately carries
 * fewer fields than its twin (the `roadRampart` note omits `unclassifiedTiles`;
 * the `shallowExt` note's `search` omits three of the reflow search's fields).
 * What it may not do is carry a field the twin has and DISAGREE with it, or
 * carry a list entry the twin does not have.
 */
function noteRecordBindingProblems(entry, plan, s) {
  const out = [];
  const rec = entry && entry.rec;
  if (!rec || typeof rec !== "object") return out;
  const J = (v) => String(JSON.stringify(v)).slice(0, 90);
  const at = (root, p) =>
    p === "" ? root : p.split(".").reduce((a, k) => (a === null || a === undefined ? undefined : a[k]), root);
  /** every field the record carries under `here` must equal the twin's */
  const sub = (here, twinPath, what) => {
    const mine = at(rec, here);
    const theirs = at(plan, twinPath);
    if (mine === undefined || mine === null) return;
    if (theirs === undefined || theirs === null) {
      out.push(
        `carries \`${here}\` and the plan does not publish \`${twinPath}\`, which is ${what} and the only ` +
          `thing this record's copy is held to`,
      );
      return;
    }
    if (typeof mine !== "object" || Array.isArray(mine)) {
      if (JSON.stringify(mine) !== JSON.stringify(theirs)) {
        out.push(`says \`${here}\` is ${J(mine)} and \`${twinPath}\` — ${what} — says ${J(theirs)}`);
      }
      return;
    }
    for (const [k, v] of Object.entries(mine)) {
      if (JSON.stringify(v) !== JSON.stringify(theirs[k])) {
        out.push(`says \`${here}.${k}\` is ${J(v)} and \`${twinPath}.${k}\` — ${what} — says ${J(theirs[k])}`);
      }
    }
  };
  switch (entry.cls) {
    case "sealedFloor":
      // the whole record, including `named`, is the object this file floods
      // for tile by tile (`meta.sealedFloor`, re-derived under the own-creep
      // whole-board flood in all 62 sealing rooms)
      sub("", "meta.sealedFloor", "the sealed-floor record this file re-derives tile by tile");
      break;
    case "roadRampart":
      sub("", "meta.walls.roadRampart", "the five-class road-on-rampart taxonomy this file re-derives");
      break;
    case "redundantCut": {
      sub("cut", "meta.shell.cut.length", "the cut this room ships");
      sub("redundant", "meta.shell.redundantCut.tiles", "how many cut tiles are not singly load-bearing");
      sub("inertPruned", "meta.walls.inertPruned", "what layer 7's inert prune took");
      const reasons = at(plan, "meta.shell.redundantCut.reasons") || {};
      for (const n2 of rec.named || []) {
        if (!n2 || typeof n2 !== "object") {
          out.push(`carries a \`named\` entry that is not a record (${J(n2)})`);
          continue;
        }
        const twin = reasons[n2.k];
        if (twin === undefined) {
          out.push(
            `names cut tile \`${n2.k}\` and \`meta.shell.redundantCut.reasons\` — the per-tile ` +
              `justification this file re-derives by DELETING the rampart — has no entry for it`,
          );
          continue;
        }
        if (JSON.stringify(n2.reason) !== JSON.stringify(twin)) {
          out.push(
            `gives cut tile \`${n2.k}\` the reason ${J(n2.reason)} and \`meta.shell.redundantCut.reasons\` ` +
              `says ${J(twin)}`,
          );
        }
      }
      break;
    }
    case "shallowExt": {
      sub("total", "meta.extensions.placed", "the extensions this room placed");
      sub("extTarget", "meta.extensions.target", "the extension target");
      sub("search", "meta.walls.reflow.search", "layer 7b's own reflow search census");
      if (rec.l6) {
        const rel = at(plan, "meta.extensions.relocated") || [];
        if (rec.l6.moved !== rel.length) {
          out.push(`says layer 6 moved ${J(rec.l6.moved)} extension(s) and \`meta.extensions.relocated\` lists ${rel.length}`);
        }
        const mine = (rec.l6.tiles || []).map((t) => [t.from, t.to]);
        const theirs = rel.map((t) => [t.from, t.to]);
        if (JSON.stringify(mine) !== JSON.stringify(theirs)) {
          out.push(`lists layer-6 relocations ${J(mine)} and \`meta.extensions.relocated\` lists ${J(theirs)}`);
        }
      }
      if (rec.l7) {
        const mv = at(plan, "meta.walls.reflow.moved") || [];
        if (rec.l7.moved !== mv.length) {
          out.push(`says layer 7b moved ${J(rec.l7.moved)} extension(s) and \`meta.walls.reflow.moved\` lists ${mv.length}`);
        }
        const mine = (rec.l7.tiles || []).map((t) => [t.from, t.to, t.fromDepth, t.toDepth]);
        const theirs = mv.map((t) => [t.from, t.to, t.fromDepth, t.toDepth]);
        if (JSON.stringify(mine) !== JSON.stringify(theirs)) {
          out.push(`lists layer-7b relocations ${J(mine)} and \`meta.walls.reflow.moved\` lists ${J(theirs)}`);
        }
        const ret = at(plan, "meta.walls.reflow.rampartsRetired") || [];
        if (rec.l7.rampartsRetired !== ret.length) {
          out.push(`says ${J(rec.l7.rampartsRetired)} rampart(s) were retired and \`meta.walls.reflow.rampartsRetired\` lists ${ret.length}`);
        }
      }
      if (rec.lap) {
        sub("lap.ceiling", "meta.walls.reflow.lapCeiling", "layer 7b's own lap ceiling");
        sub("lap.ceilingSlack", "meta.walls.reflow.lapCeilingSlack", "the slack it was given");
        sub("lap.ceilingSlackPct", "meta.walls.reflow.lapCeilingSlackPct", "the slack percentage");
        sub("lap.ceilingStrictBand", "meta.walls.reflow.lapCeilingStrictBand", "the strict band");
        sub("lap.ceilingBound", "meta.walls.reflow.lapCeilingBound", "the bound it held");
        sub("lap.before", "meta.walls.reflow.lapBeforeMoves", "the lap before the moves");
        sub("lap.after", "meta.walls.reflow.lapAfterMoves", "the lap after them");
        sub("lap.bound", "meta.extensions.laneMeta.bounded", "layer 6's published lane bound, which is a proof and is never relaxed");
        // `slackSpent` and `rollback` are FUNCTIONS of the reflow record rather
        // than copies of a field, so they are re-derived from it here
        {
          const mv = at(plan, "meta.walls.reflow.moved") || [];
          if (typeof rec.lap.slackSpent === "boolean" && rec.lap.slackSpent !== mv.length > 0) {
            out.push(
              `says the lap slack was ${rec.lap.slackSpent ? "" : "not "}spent and \`meta.walls.reflow.moved\` ` +
                `lists ${mv.length} relocation(s) — spending the slack IS moving an extension`,
            );
          }
          const rb = at(plan, "meta.walls.reflow.boundRollback") || [];
          const mine = (rec.lap.rollback || []).map((m) => [m.from, m.to, m.wouldLap]);
          const theirs = rb.map((m) => [
            { x: m.from && m.from.x, y: m.from && m.from.y },
            { x: m.to && m.to.x, y: m.to && m.to.y },
            m.wouldLap,
          ]);
          if (JSON.stringify(mine) !== JSON.stringify(theirs)) {
            out.push(`lists bound-rollback moves ${J(mine)} and \`meta.walls.reflow.boundRollback\` lists ${J(theirs)}`);
          }
        }
      }
      break;
    }
    case "pavedRun": {
      sub("moved", "meta.walls.alongCutMoved", "the along-cut roads layer 7 actually moved");
      const runs = at(plan, "meta.walls.alongCutRuns") || [];
      const refused = at(plan, "meta.walls.alongCutRefused") || [];
      const mine = (rec.runs || []).map((r) => {
        const { refused: _r, ...rest } = r || {};
        return rest;
      });
      if (JSON.stringify(mine) !== JSON.stringify(runs)) {
        out.push(
          `lists along-cut runs the plan's own \`meta.walls.alongCutRuns\` does not: ${J(mine)} against ` +
            `${J(runs)}. The run list is where the note's free/held tile sets come from, and a free tile ` +
            `the room never had is a refusal the room never made`,
        );
      }
      for (const r of rec.runs || []) {
        if (!r || typeof r !== "object") continue;
        const tw = refused.find((z) => z && z.x === r.x && z.y === r.y);
        if (r.refused === undefined || r.refused === null) {
          if (tw) out.push(`gives run ${r.x},${r.y} no refusal and \`meta.walls.alongCutRefused\` carries one for it`);
        } else if (!tw) {
          out.push(`gives run ${r.x},${r.y} a refusal and \`meta.walls.alongCutRefused\` carries none for that tile`);
        } else if (tw.why !== r.refused) {
          out.push(`gives run ${r.x},${r.y} the refusal ${J(r.refused)} and \`meta.walls.alongCutRefused\` says ${J(tw.why)}`);
        }
      }
      break;
    }
    case "containerRoad": {
      // `added` IS the conductBridge road list; `sharing` and the count have
      // no twin at all and are re-derived off the shipped board here
      sub("added", "meta.walls.laidTilesByKind.conductBridge", "the conduct-bridge roads layer 7 laid");
      const roadK = new Set((s.road || []).map((r) => key(r.x, r.y)));
      const share = (s.container || []).filter((c) => roadK.has(key(c.x, c.y)));
      const mineK = (rec.sharing || []).map((t) => key(t.x, t.y)).sort();
      const wantK = share.map((c) => key(c.x, c.y)).sort();
      if (JSON.stringify(mineK) !== JSON.stringify(wantK)) {
        out.push(`says the containers sharing a road tile are ${J(mineK)} and this room's board carries ${J(wantK)}`);
      }
      if (rec.containersOnRoads !== share.length) {
        out.push(`says ${J(rec.containersOnRoads)} container(s) share a road tile and the board carries ${share.length}`);
      }
      break;
    }
    case "pavingGap":
      // the fleet ships none; the class is registered and its record has no
      // list-valued field to bind. Left named so the switch is an inventory
      // rather than a default.
      break;
    default:
      out.push(
        `is class "${entry.cls}", which \`noteRecordBindingProblems\` does not bind. Every note class's ` +
          `lists and sub-records are bound to the class-D twin the plan publishes; a class with no binding ` +
          `is a second unbound copy of a checked object, which is what let seven falsified lists ship`,
      );
  }
  return out;
}

function recordLeaves(sf) {
  const out = [];
  const walk = (o, pre) => {
    for (const [k, v] of Object.entries(o)) {
      if (!pre && RECORD_ENVELOPE.has(k)) continue;
      const path = pre ? `${pre}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) walk(v, path);
      else out.push([normLeaf(path), v, path]);
    }
  };
  if (sf && typeof sf === "object") walk(sf, "");
  return out;
}

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
  // ==================================================================
  // m7 / OF1. THE SEALED INTERIOR FLOOR, WHICH WAS NEVER RE-DERIVED AND
  // WAS NOT REQUIRED TO EXIST.
  //
  // Criticism 39 says all six note classes are "derive-or-die on both
  // halves". `meta.sealedFloor` was not in this list and its three numbers
  // were never computed here: the gate cross-checked the NOTE TEXT against
  // the producer's own record and applied three weak per-tile predicates.
  // Nine live escapes on two rooms, all passing 172/172 against a clean
  // control: delete the record (the note is then checked by nothing);
  // delete the record AND the note (the board seals 12 tiles and the room
  // says nothing); ship `tiles` as the STRING "12" (the whole block is
  // skipped); deflate 12 -> 1 with the note rewritten; `deep` 7 -> 0;
  // `ourFault` 11 -> 0 ("blames the enclosure, absolves our own mass");
  // and a coordinated INFLATE 12 -> 20 naming eight invented tiles that
  // are interior, empty AND fully reachable.
  //
  // The reviewer's own twenty-line derivation reproduced the shipped
  // numbers exactly in both rooms, so "not derivable" was never the
  // reason. It is derived below, tile for tile, under the flood the WORD
  // means (OF2): the whole board from the sitter, blocked only by what
  // blocks a creep — our own ramparts and roads do not, because a hauler
  // may walk out through the wall and back in somewhere else.
  // ==================================================================
  {
    // PRESENCE is owned by the re-derivation, which is strictly stronger than a
    // list: 110 of the 172 rooms seal nothing and correctly publish nothing, and
    // in the 62 that do, an absent record fails on the board rather than on the
    // schema. What this entry owns is the SHAPE — which is how `tiles: "12"`
    // (the string) used to skip the entire note block and pass.
    path: "meta.sealedFloor",
    is: (v) =>
      v === undefined ||
      v === null ||
      (v &&
        typeof v === "object" &&
        ["tiles", "deep", "ourFault", "shallowStructs", "depthSafe"].every((k) => typeof v[k] === "number") &&
        Array.isArray(v.named) &&
        typeof v.basis === "string"),
    why: "floor the program could have used and did not, and one of the six note classes criticism 39 calls derive-or-die on both halves. It was in neither this list nor any re-derivation: nine mutations escaped on it in one sweep, including deleting the whole record and leaving the note standing, and shipping `tiles` as a STRING, which skipped every check under it",
  },
  {
    path: "meta.noteObligations",
    is: (v) => Array.isArray(v),
    why: "the list of note classes this room owes, derived at the end of finalizeRoom from records that exist for their own reasons and never from meta.notes. It is what makes a note undeletable: 10 of the fleet's 177 were deletable for free because the obligation for their class was scoped to layer 7b's reflow and blind to layer 6's. All 172 rooms publish it, empty in the 54 that owe nothing",
  },
  {
    path: "meta.walls.inertPruned",
    is: (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
    why: "how many ramparts layer 7's inert prune took off this run. It is quoted in both redundant-cut notes and is the other half of the trigger for them; deleting it plus the note took 37 rooms' prune out of the record with nothing failing",
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
    path: "meta.towers.spreadRadius",
    is: (v) => typeof v === "number" && Number.isFinite(v),
    why: "the spread of the battery — the largest chebyshev distance from a tower to the six towers' own centroid. It reads as a layer-3 witness and is not one: the producer computes it from the placement it FINISHES with, so it is re-derived tile for tile in `towers/spread-radius` for all 172 rooms, declared or not",
  },
  {
    path: "meta.towers.shippedCutTiles",
    is: (v) => typeof v === "number",
    why: "the size of the wall the battery was scored against AS SHIPPED, as opposed to the wall layer 3 optimised over",
  },
  {
    path: "meta.towers.shippedMinShellDmg",
    is: (v) => typeof v === "number",
    why: "the damage the weakest tile of the wall this room ACTUALLY SHIPS takes. It is re-derived tile by tile in the battery block, and the whole comparison was written `typeof pubShip === \"number\"` — so falsifying it failed the room and DELETING it passed. One of the three numbers the goal document names as re-derived-and-compared; a number a producer can withdraw is not one of them",
  },
  {
    path: "meta.towers.towerDispersion",
    is: (v) => v && typeof v === "object" && typeof v.after === "number",
    why: "layer 3's own before/after reading of the high-value 5x5 window. It is the field the nuke-window block cross-checks against (a strictly smaller set may never hold more than the full one), and that cross-check read `if (td && typeof td.after === \"number\")` — an inflated `after` failed and an absent `towerDispersion` passed, which is the C2 shape one key over",
  },
  {
    path: "meta.walls.roadKind",
    is: (v) => v && typeof v === "object" && !Array.isArray(v),
    why: "the per-tile provenance of every late (layer-7) road tile — the map the film's captions, the road taxonomy and the spur census are all composed from. The whole roadKind audit was written `if (rkMap && typeof rkMap === \"object\")`, so deleting the key, or shipping `[]`, switched off enum-completeness, coverage and every per-kind re-derivation at once",
  },
  {
    path: "meta.ctrlParks",
    is: (v) => typeof v === "number",
    why: "the upgrader seat count, held to a hard floor and re-derived below. An absent count is a room that never claimed anything and therefore never lied",
  },
  {
    path: "meta.ctrlParksAtSeatSearch",
    is: (v) => typeof v === "number",
    why: "the seat count layer 1 measured when it CHOSE the controller link, before six layers of structures landed on the tiles it counted. Together with `meta.ctrlParkFloor` it is the trigger for the `ctrlParks/released` obligation — the declaration that says seats were handed back to the extension mass — and the trigger's own comment claimed the schema gate kept these two from simply being absent while neither was in this list. E12S5 releases 5 of 7 seats; deleting either key released them in silence",
  },
  {
    path: "meta.ctrlParkFloor",
    is: (v) => typeof v === "number",
    why: "the floor the released-parks trade was measured against — the other half of that trigger, and the number the declaration's own arithmetic (held - kept = released, kept >= floor) closes on",
  },
  {
    path: "meta.counts",
    is: (v) => v && typeof v === "object",
    why: "the structure census the gallery and the pusher both read",
  },
  {
    path: "meta.walls.spurTiles",
    is: (v) => typeof v === "number",
    why: "how many rampart-spur tiles stage 5 LAID — the figure the suite prints as \"rampart spurs … 375 tiles\" beside a provenance map that says 370. Round 14 built the whole reconciliation of those two numbers, and wrote it `if (typeof laid === \"number\" && rkMap2 …)`: falsifying `spurTiles` failed the room and DELETING it passed, which switched off the laid-vs-shipped identity, the shipped-list comparison and the tile-by-tile account of the difference at once. The same shape as `shippedMinShellDmg`, one key over",
  },
  {
    path: "meta.walls.spurTilesShipped",
    is: (v) => typeof v === "number",
    why: "...and how many of them survive on the board. It is a count of `roadKind`, re-derived here; the reconciliation is between two numbers, so withdrawing either one ends it",
  },
  {
    path: "meta.towers.adjacency",
    is: (v) => v && typeof v === "object" && v.satAcrossPrior && typeof v.satAcrossPrior === "object",
    why: "the tower-adjacency prior: the pairs the room ships, the crossings of the prior the refill-repair pass was allowed, and the wall damage keeping the prior cost. Layer 3 writes it for all 172 rooms and nothing read any of it — nine mutations escaped in one sweep, and the goal document quotes its `forgone` sum as a fleet figure",
  },
  {
    path: "meta.walls.laidByKind",
    is: (v) => v && typeof v === "object" && !Array.isArray(v),
    why: "the per-kind account of what each of the seven late-road passes LAID. Two of the seven were wrong on the shipped artifact (reflow laid 0 against 20 shipped; E18S8 swampPave laid 3 against 2 shipped) and conductBridge was in no book at all, because nothing read any of them",
  },
  {
    path: "meta.walls.shippedByKind",
    is: (v) => v && typeof v === "object" && !Array.isArray(v),
    why: "...and what survives of it, which is a count of `roadKind` rather than a second opinion about it",
  },
  {
    path: "meta.walls.lostByKind",
    is: (v) => v && typeof v === "object" && !Array.isArray(v),
    why: "...and the tiles a later pass took, NAMED. The identity laid === shipped + lost is the whole reader-facing truth channel for the late-road layer, and it needs all three books to close",
  },
  // ==================================================================
  // ROUND 17 / F1 — THE FIELDS THE NOTE OBLIGATIONS ARE DERIVED FROM.
  //
  // A derived obligation is only undeletable while the thing it is derived
  // FROM is undeletable. Every field `noteObligations` is re-derived from is
  // required here, and every one of them is published by all 172 rooms (the
  // two that are not — `meta.walls.conductBridge` in 3 rooms and
  // `meta.walls.alongCutRuns` in 12 — are deliberately NOT what the
  // corresponding obligation hangs on; `containerRoad` hangs on
  // `meta.walls.laidTilesByKind.conductBridge`, which every room publishes).
  // ==================================================================
  {
    path: "meta.extensions",
    is: (v) =>
      v &&
      typeof v === "object" &&
      typeof v.shallow === "number" &&
      typeof v.relocatedCount === "number" &&
      Array.isArray(v.relocated) &&
      typeof v.placed === "number" &&
      typeof v.target === "number",
    why: "layer 6's extension census — how many landed shallow, how many it RELOCATED, and the roster of those relocations. It is the trigger for the `shallowExt` note and the twin its record's `l6` list is bound to. 14 of the fleet's 177 notes deleted for free (note + record + obligation, all three self-consistent) because nothing re-derived that the obligation had to exist, and every one of the 14 was a room whose only surviving record of a layer-6 relocation was the note itself",
  },
  {
    path: "meta.walls.reflow",
    is: (v) => v && typeof v === "object" && Array.isArray(v.moved) && Array.isArray(v.added) && v.search && typeof v.search === "object",
    why: "layer 7b's reflow: the extensions it moved, the ones it added, and the post-prune search census. It is the other half of the `shallowExt` trigger and the class-D twin the note record's `l7` and `search` blocks are bound to — without it those two lists are a second unbound copy of a checked object",
  },
  {
    path: "meta.walls.alongCutRefused",
    is: (v) => Array.isArray(v),
    why: "the along-cut paving refusals, per tile with the sentence the note quotes. The `pavedRun` note's `runs[].refused` is bound to it; a refusal the room never made used to render into the channel a human reads",
  },
  {
    path: "meta.compositions",
    is: (v) => v && typeof v === "object" && typeof v.total === "number",
    why: "how many complete plans this room composed, across every seed. It is the trigger for the `runtime/heavy-search` obligation, and until it existed that trigger read the declaration's own copy of the number — so deleting the declaration deleted the evidence that it was owed",
  },
];

/**
 * ==========================================================================
 * ROUND 17 / F3 — EVERY MIRROR A CLOSURE POINTS AT IS REQUIRED TO EXIST, AND
 * THE LIST IS DERIVED FROM THE CLOSURES RATHER THAN REMEMBERED.
 * ==========================================================================
 * The record-leaf inventory's strongest witnessed bound is the cross-copy: the
 * declaration says 755 swaps, `meta.towers.towerDispersion.search` says 755
 * too, and the two were written by passes that do not know whether the room
 * will declare. That argument has one premise: THE MIRROR IS THERE. It was in
 * no presence list. Round 17's sweep deleted the referent of 22 named `@meta.*`
 * paths and 20 of them deleted clean in every room — combined with the
 * null-passing closures above, that is 436 escapes over 29 leaves.
 *
 * Two things stop it now, and they are two because either one alone is an
 * argument rather than a check:
 *   1. the closure FAILS on a missing referent (see `CLOSURE_OPS` above), so
 *      deletion cannot be silent, and
 *   2. the mirror is REQUIRED to exist, so deletion is not even a legal shape.
 *
 * And the list of what to require is not typed out from a reviewer's grep: it
 * is COLLECTED from the inventory at load. `assertMirrorsRequired` walks every
 * closure of every leaf (and every array-element field), takes every referent
 * that starts with `@`, and demands that this table cover it — and that this
 * table carry nothing the inventory does not point at. A new
 * `EQ("@meta.towers.somethingNew")` in the table above is a LOAD-TIME FAILURE
 * until its presence is declared here. Which is the point: the reason the 22
 * were unguarded is that nobody had to say anything when they were added.
 *
 * `when` is the measured presence condition, and it is two-sided at load: a
 * path declared always-present that is absent anywhere fails the room, and the
 * one conditional group (`meta.towers.search.*`, published exactly in the 15
 * rooms whose placement search RAN) fails a room that publishes the fields
 * without the flag as well as one that publishes the flag without the fields.
 */
const META_MIRROR_GROUPS = [
  {
    paths: ["meta.coreSize", "meta.seedPool"],
    is: (v) => typeof v === "number" && Number.isFinite(v),
    why:
      "layer 1's eco basin census, mirrored by every `eco` declaration's `coreSize`/`seedPool`. Both are " +
      "published for all 172 rooms whether the room declares or not, which is the whole reason the " +
      "declaration's copy is checkable at all; delete the mirror and the declaration's number is held to " +
      "`typeof === number` (38 declarations each)",
  },
  {
    paths: [
      "meta.towers.avgShellDmg",
      "meta.towers.candidates",
      "meta.towers.minShellDmg",
      "meta.towers.starts",
      "meta.towers.weakTiles",
    ],
    is: (v) => typeof v === "number" && Number.isFinite(v),
    why:
      "layer 3's unconditional publication of the board it placed the battery against. These are the " +
      "referents of the `towers/weak-battery` record's cross-copies (`meta.walls.inertPruned`, the other " +
      "one, was already required in its own right — it is the only one of the 22 the round-17 sweep could " +
      "not delete)",
  },
  {
    paths: [
      "meta.towers.refillSearch.after",
      "meta.towers.refillSearch.before",
      "meta.towers.refillSearch.crossOffered",
      "meta.towers.refillSearch.dispersionOk",
      "meta.towers.refillSearch.moved",
      "meta.towers.refillSearch.rounds",
      "meta.towers.refillSearch.scoreTied",
      "meta.towers.refillSearch.tried",
    ],
    is: (v) => typeof v === "number" && Number.isFinite(v),
    why:
      "the refill-directed swap pass's own census. The record's copy is what the paragraph quotes " +
      "(`tried` reads 1440 across the 15 declaring rooms), and deleting this mirror let it read 533",
  },
  {
    paths: [
      "meta.walls.mobility.lanes.tiles",
      "meta.walls.mobility.lanes.deep",
      "meta.walls.mobility.lanes.rounds",
      "meta.walls.mobility.lanes.strandRounds",
      "meta.walls.mobility.lanes.bounded",
      "meta.walls.mobility.lanes.boundBeforeStubs",
      "meta.walls.mobility.lanes.stubsLifted",
      "meta.walls.mobility.lanes.wanted",
      "meta.walls.mobility.lanes.shrunk.wanted",
      "meta.walls.mobility.lanes.shrunk.to",
      "meta.walls.mobility.lanes.shrunk.premium",
    ],
    // the four fields layer 6 leaves undefined in a room whose reservation
    // never shrank or never lifted a stub are `null` on the record's side too,
    // and a null SELF skips its own closure — so presence here is required only
    // where the census carries a number
    when: (plan) => plan?.meta?.walls?.mobility?.lanes && typeof plan.meta.walls.mobility.lanes === "object",
    is: (v) => v === undefined || v === null || typeof v === "number",
    why:
      "layer 6's defender-lane reservation census, published for every room whether it declares or not. " +
      "The `mobility` record's whole `lane` block is a copy of it, and until round 17 that block was held " +
      "to sibling inequalities and to ceilings taken off the room's interior FLOOR (200-400 tiles, against " +
      "numbers whose real values are 6 to 20) — so a x5 inflation with the paragraph regenerated walked " +
      "past every one of them, 216 escapes in one sweep",
  },
  {
    paths: ["meta.towers.search.ran"],
    is: (v) => typeof v === "boolean",
    why: "whether layer 3's placement search ran on this room at all — published for all 172 and the condition the rest of `meta.towers.search` is present under",
  },
  {
    paths: [
      "meta.towers.search.converged",
      "meta.towers.search.improvedFrom",
      "meta.towers.search.improvedTo",
      "meta.towers.search.improvements",
      "meta.towers.search.pairK",
      "meta.towers.search.restarts",
      "meta.towers.search.rounds",
      "meta.towers.search.starts",
    ],
    when: (plan) => plan?.meta?.towers?.search?.ran === true,
    is: (v) => typeof v === "number" || typeof v === "boolean",
    why:
      "the placement search's own census, published in exactly the 15 rooms where it RAN (measured: 15 " +
      "of 172, zero mismatches against `search.ran`). The condition is two-sided — a room that publishes " +
      "`ran: true` and no census fails here, and a room that publishes the census while claiming the " +
      "search did not run fails the leaf's own predicate",
  },
  {
    paths: [
      "meta.towers.mobilityVeto.affordable",
      "meta.towers.mobilityVeto.baseLap",
      "meta.towers.mobilityVeto.baseOver",
      "meta.towers.mobilityVeto.lapWithBattery",
      "meta.towers.mobilityVeto.moved",
      "meta.towers.mobilityVeto.overWithBattery",
      "meta.towers.mobilityVeto.provedFree",
      "meta.towers.mobilityVeto.scoreTied",
      "meta.towers.mobilityVeto.tried",
    ],
    is: (v) => typeof v === "number" || typeof v === "boolean",
    why: "the mobility veto's nine-leaf census, mirrored by `mobility`'s `repair.tower` block in 57 rooms — the single largest mirrored family in the fleet",
  },
  {
    paths: [
      "meta.towers.towerDispersion.before",
      "meta.towers.towerDispersion.search.improvedBy",
      "meta.towers.towerDispersion.search.pairImproved",
      "meta.towers.towerDispersion.search.pairSwapsScoreTied",
      "meta.towers.towerDispersion.search.pairSwapsTried",
      "meta.towers.towerDispersion.search.rounds",
      "meta.towers.towerDispersion.search.singleSwapsScoreTied",
      "meta.towers.towerDispersion.search.singleSwapsTried",
    ],
    is: (v) => typeof v === "number" && Number.isFinite(v),
    why:
      "the dispersion pass's census — the referent of the clump declaration's search block. This is where " +
      "the round-17 sweep did its worst: with `singleSwapsTried` deleted, E11S6's paragraph read \"it ran " +
      "1 single-swap round(s) over 3 candidate swap(s)\" against a truth of 755, and passed, on one of the " +
      "three rooms this planner's own document calls EARNED",
  },
];
for (const grp of META_MIRROR_GROUPS) {
  for (const p of grp.paths) {
    REQUIRED_META.push({
      path: p,
      is: grp.is,
      when: grp.when,
      mirror: true,
      why: `${grp.why}. It is a MIRROR: the record-leaf inventory holds a declaration's copy of this number to it, so an absent mirror is a leaf held to its type and nothing else`,
    });
  }
}

/**
 * The two-way inventory rule, applied to the mirrors. Collect every `@` path
 * any closure in the record-leaf inventory or the array-element inventory
 * names, and require that the table above cover it — and that the table above
 * name nothing the inventory does not point at. Neither list can drift from
 * the other without the file refusing to start.
 */
function assertMirrorsRequired() {
  const wanted = new Set();
  const eat = (closures) => {
    for (const c of closures || []) {
      if (!c || typeof c !== "object") continue;
      for (const path of [c.other, ...(c.parts || []), ...(c.minus || []), ...(c.over || [])].filter(Boolean)) {
        if (typeof path === "string" && path.startsWith("@")) wanted.add(path.slice(1).replace(/\.length$/, ""));
      }
    }
  };
  for (const table of RECORD_LEAVES.values()) for (const cls of Object.values(table)) eat(cls && cls.closures);
  for (const arrays of RECORD_ARRAY_LEAVES.values()) {
    for (const spec of Object.values(arrays)) {
      eat(spec.closures);
      for (const cls of Object.values(spec.fields || {})) eat(cls && cls.closures);
    }
  }
  // a path already required for another reason (`meta.towers.maxRefill` is the
  // trigger for half the battery obligation) is required, and that is what the
  // rule asks for — it does not have to be required TWICE
  const covered = new Set(REQUIRED_META.map((r) => r.path));
  const mirrorOnly = new Set(REQUIRED_META.filter((r) => r.mirror).map((r) => r.path));
  const problems = [];
  for (const p of wanted) {
    if (!covered.has(p)) {
      problems.push(
        `a closure names \`@${p}\` as its referent and REQUIRED_META does not require it to exist. A ` +
          `cross-copy is only a check while both copies are there: round 17 deleted 20 of 22 such referents ` +
          `clean in every room, which turned 436 falsified leaves into passing ones`,
      );
    }
  }
  for (const p of mirrorOnly) {
    if (!wanted.has(p)) {
      problems.push(`META_MIRROR_GROUPS requires \`${p}\` and no closure in this file points at it — a presence rule with no reader`);
    }
  }
  if (problems.length) {
    throw new Error(`validate.mjs mirror inventory is inconsistent — ${problems.join("; ")}.`);
  }
  return wanted.size;
}
const META_MIRROR_COUNT = assertMirrorsRequired();

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
      // ...and the extractor, by the same rule and on the same channel. It sits
      // on the mineral by construction and nothing hauls to it, so paving to it
      // buys nothing — but that sentence is the plan's to say, and it says it by
      // naming the tile. 133 rooms ship one off the network; the exemption used
      // to be this structure's absence from OWNED.
      if (t === "extractor" && mineralOffNetworkDeclared.has(k)) continue;
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
      if (req.when && !req.when(plan)) {
        // ...AND THE OTHER DIRECTION, FOR THE MIRRORS. A conditional presence
        // rule that only fires one way is a rule a producer satisfies by
        // falsifying the condition: publish `meta.towers.search.ran: false`
        // and the eight-leaf census under it becomes optional, so the
        // declaration's copy of it is held to its type again. The condition is
        // a measurement of this room (15 of 172 rooms ran the placement
        // search, zero mismatches), so a room that publishes the census while
        // denying the pass fails here.
        if (req.mirror && read(req.path) !== undefined) {
          schemaFails.push(
            `SCHEMA — \`${req.path}\` is PUBLISHED and the condition it is published under does not hold ` +
              `for this room. It is a mirror: ${req.why}. A presence rule that fires in one direction only ` +
              `is an off switch — falsify the condition and the whole family becomes optional`,
          );
        }
        continue;
      }
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
      // ------------------------------------------------------------------
      // ROUND 14: THE CLAUSE IS NOT KEPT. IT REFUSES EVERY GAP, AND HERE IS WHY
      // THE "HONEST CASE" ABOVE WAS NEVER A CASE AT ALL.
      //
      // The paragraph above ends "a join whose only tile carries a spawn, a lab
      // or a source really is unpaveable, and a room in that position must be
      // able to say so", and the code that followed it did exactly that: the
      // terrain-wall case failed, the bare-floor case failed, the container case
      // failed, and the `else` branch — the OBSTACLE case — added the tile to
      // `conduct`. It GRANTED a spawn tile, a lab tile, a storage tile, a source
      // tile as a CONDUCTOR.
      //
      // The refutation is forty lines down, in this block's own failure message:
      // "A gap tile is a claim that a creep walks it without a road; a tile a
      // creep cannot stand on closes nothing." A creep cannot stand on a spawn.
      // The two halves of one gate said opposite things, and the half that ran
      // was the wrong one — a published gap over E11S1's spawn 26,41, storage
      // 24,41 and lab 24,32 validated clean and, worse, push-plan.mjs's
      // `verifiedGapTiles()` granted all three, so the RCL orphan graph and the
      // unreachable-terminal check walked THROUGH the spawn. That is criticism
      // 6/15's defect ("the graph let a creep walk through the spawn") recreated
      // through the door round 13 built to stop it.
      //
      // AND THE SET IS EMPTY, WHICH IS THE REAL POINT. A gap tile must be
      // simultaneously WALKABLE (or it conducts nothing) and UNPAVEABLE (or it
      // is a road the room declined to lay). In Screeps those two sets do not
      // intersect: `createConstructionSite` refuses a road only on natural wall
      // — and natural wall is not walkable — while every OBSTACLE structure that
      // makes a tile unpaveable also makes it unstandable. Container and road
      // share a tile legally. So "walkable but unpaveable" is the empty set, a
      // published gap can never legitimately conduct anything, and the correct
      // gate is not a better test of the tile: it is a refusal of the claim.
      //
      // The room's real options are unchanged and both are honest: pave the
      // join, or declare the stranded conductors on the shortfall channel where
      // an owner reads them. What is gone is the third one, which was to name a
      // tile a creep cannot stand on and be handed a network.
      // ------------------------------------------------------------------
      const gapBad = [];
      for (const t of gapPub) {
        const tk = key(t.x, t.y);
        const carried = Object.keys(s).filter(
          (ty) => (s[ty] || []).some((p) => p.x === t.x && p.y === t.y),
        );
        const why = !passable(t.x, t.y)
          ? `it is natural wall, which no creep walks`
          : roadSet.has(tk)
            ? `it already carries a road, so it is not a gap in anything`
            : obstacles.has(tk)
              ? `it carries ${carried.join("+") || "an obstacle"}, and a creep cannot stand on an ` +
                `OBSTACLE structure — this is the case the old \`else\` branch GRANTED as a conductor`
              : `it carries ${carried.join("+") || "nothing"} and no obstacle, so a road can simply be ` +
                `built there (road and container legally share a tile) — a join the room declined to pave`;
        gapBad.push(`${t.x},${t.y}: ${why}`);
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
          `PAVING GAP REFUSED — meta.walls.conductBridge.gapTiles names ${gapBad.length} tile(s): ` +
            `${gapBad.join("; ")}. A gap tile is a claim that a creep walks it WITHOUT a road, and it has ` +
            `to be both walkable and unpaveable to be one. In Screeps that intersection is EMPTY: the ` +
            `engine refuses a road only on natural wall, which is not walkable, and every obstacle that ` +
            `makes a tile unpaveable also makes it unstandable. So no gap tile can ever legitimately ` +
            `conduct, this gate grants none of them, and a room whose join does not close either paves it ` +
            `or declares the stranded conductors where an owner reads them.`,
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
  // THE ENCLOSED SOURCES, RE-DERIVED — the field that had no reader at all.
  //
  // `meta.shell.srcEnclosed` is a per-source boolean and it is the operational
  // claim about a source: my miner's works are behind the wall AND no attacker
  // can stand on any walkable tile of the source's own ring. It is the fleet
  // headline (215 of 344), it is quoted in the goal document, and round 10 found
  // E13S4 publishing `true` next to a bare, unramparted, exterior-flood tile
  // directly adjacent to the source — the exact lie this boolean can tell.
  //
  // Round 10's fix was to make the PRODUCER re-derive it over the shipped
  // rampart union instead of over layer 2's min-cut ring. That fixed the number
  // and left the field with no reader: `srcEnclosed` appeared ZERO times in this
  // file, so flipping E11S1's source 0 from false to true — a source whose ring
  // genuinely opens onto the exterior — validated `pass 172/172 · fail 0`. A
  // producer-side re-derivation is a producer's opinion of itself.
  //
  // So it is re-derived here, over this file's own exterior flood and the
  // shipped structure lists, on the producer's stated definition:
  //   WORKS  the source's containers (chebyshev 1) and its link (chebyshev 2,
  //          taken from the link program's [hub, ...perSource, controller]
  //          convention) — at least one of them, and none of them in the flood;
  //   RING   every walkable tile D8-adjacent to the source, none in the flood.
  // The two exteriors this file and the producer flood differ on one point —
  // whether a road on a natural wall tunnels — and the verdict is identical in
  // all 344 sources either way, so the stricter (tunnelling) reading is used
  // here, because a road on the wall IS a tile an attacker walks.
  // ------------------------------------------------------------------
  {
    const pubEnc = plan.meta?.shell?.srcEnclosed;
    const sources = (plan.sources || []).filter((p) => p && Number.isInteger(p.x));
    if (sources.length) {
      if (!Array.isArray(pubEnc) || pubEnc.length !== sources.length) {
        fails.push(
          `ENCLOSED SOURCES UNPUBLISHED — this room has ${sources.length} source(s) and ` +
            `meta.shell.srcEnclosed is ${JSON.stringify(pubEnc)}. It is the per-source claim "no attacker ` +
            `stands next to my miner", it is 215 of the fleet's 344 sources, and a list that is absent or ` +
            `the wrong length is a claim withdrawn rather than measured.`,
        );
      } else {
        const links = plan.structures?.link || [];
        const srcLinks = links.slice(1, Math.max(1, links.length - 1));
        const containers = plan.structures?.container || [];
        const outside = (p) => !!ext[idx(p.x, p.y)];
        const wrong = [];
        for (let i = 0; i < sources.length; i++) {
          const src = sources[i];
          const works = [
            ...containers.filter((c) => chebyshev(c, src) <= 1),
            ...srcLinks.filter((l) => chebyshev(l, src) <= 2),
          ];
          const openWorks = works.filter(outside);
          const ring = [];
          for (const [dx, dy] of D8) {
            const x = src.x + dx,
              y = src.y + dy;
            if (x < 0 || y < 0 || x > 49 || y > 49) continue;
            if (passable(x, y)) ring.push({ x, y });
          }
          const openRing = ring.filter(outside);
          const der = works.length > 0 && openWorks.length === 0 && openRing.length === 0;
          if (der === !!pubEnc[i]) continue;
          wrong.push(
            `source ${i} at ${src.x},${src.y}: published ${JSON.stringify(pubEnc[i])}, re-derived ${der}` +
              (der
                ? ` (works ${works.length}, ring ${ring.length}, all inside)`
                : works.length === 0
                  ? ` (it has NO works — no container within 1 and no source link within 2 — so there is ` +
                    `nothing enclosed to claim)`
                  : ` (${openWorks.length} of ${works.length} works and ${openRing.length} of ` +
                    `${ring.length} walkable ring tile(s) are in the exterior flood` +
                    (openRing.length
                      ? `: ${openRing
                          .slice(0, 4)
                          .map((p) => `${p.x},${p.y}`)
                          .join(" ")}`
                      : "") +
                    `)`),
          );
        }
        if (wrong.length) {
          fails.push(
            `ENCLOSED SOURCES STALE — meta.shell.srcEnclosed disagrees with the board this room ships on ` +
              `${wrong.length} source(s): ${wrong.join("; ")}. An over-claim here is a tile an attacker ` +
              `stands on next to our miner, published as safety; an under-claim understates the wall the ` +
              `room paid for. The field had no reader in this file at all until round 14, so the ` +
              `producer's own re-derivation was the only thing checking it.`,
          );
        }
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
    const causeWalksOf = (pair) => {
      if (!pair) return null;
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
      const dStruct = mobArrive(mobBfs(noStruct, pair.a), pair.b);
      const dFree = mobArrive(mobBfs(noWall, pair.a), pair.b);
      const cause =
        dStruct <= MOB_TARGET * pair.dout || dStruct * 1.15 <= pair.din
          ? "structures"
          : dFree <= MOB_TARGET * pair.dout || dFree * 1.15 <= dStruct
            ? "terrain"
            : "shape";
      return {
        cause,
        noStructures: isFinite(dStruct) ? dStruct : null,
        noWalls: isFinite(dFree) ? dFree : null,
      };
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
      // ==============================================================
      // ...AND `pairCause`, WHICH IS PUBLISHED BY EVERY ROOM AND WAS
      // RE-DERIVED BY NOTHING.
      //
      // The goal document says of it, in criticism 2: "The pair-level label
      // still exists … honestly named as `pairCause`. THE VALIDATOR RE-DERIVES
      // BOTH and fails a room that publishes a cause … it has not earned." It
      // re-derived one. Editing E13S3's `meta.shell.mobilityBuilt.pairCause` and
      // its declaration's copy from "structures" to "terrain" and regenerating
      // the paragraph validated `pass 172/172 · fail 0`; the identical edit to
      // `cause` failed the room. The asymmetry is the finding.
      //
      // It is not a cosmetic label. `renderMobility` prints the disclosure
      // sentence `(That PAIR reads "structures"; the room's verdict is the
      // whole-metric lift test above …)` only when `pairCause !== cause`, so
      // relabelling it to match the room verdict DELETES the sentence in which
      // the room tells its owner that the worst pair is our own mass — the
      // disclosure criticism 2 spent two rounds building.
      //
      // The derivation is the producer's own (`mobilityCauseDetail`,
      // layer-shell.mjs:1187-1213) on the AS-BUILT worst pair — `worstGated ||
      // worst`, layer-walls.mjs:394 — and it is the same two BFS walks the
      // `cause` block below takes on the LIFTED board. `causeWalks` is those two
      // walks, so it is audited in the same breath: it is the evidence the CAUSE
      // clause of the paragraph quotes.
      // ==============================================================
      // THE TWO `pairCause` FIELDS ARE ABOUT TWO PAIRS, AND SAYING SO IS HALF
      // THE CHECK. `builtMobility` (layer-shell.mjs:1295) labels `worstGated`
      // and writes "none" when the room is inside the target; the DECLARATION's
      // copy (layer-walls.mjs:394+571) labels `worstGated || worst`, so a room
      // that does not miss still carries a real pair label there — E17S3 ships
      // `mobilityBuilt.pairCause: "none"` beside a declaration reading
      // "structures", and both are correct about their own pair. Deriving one
      // rule for both fields would fail 117 honest rooms, which is how a
      // transcription proves it is a transcription.
      {
        const gatedWorst = mBuilt.worstGated || null;
        const anyWorst = mBuilt.worstGated || mBuilt.worst || null;
        const pcRoom = mBuilt.maxGated > MOB_TARGET ? causeWalksOf(gatedWorst) : null;
        const derRoomPair = pcRoom ? pcRoom.cause : "none";
        const pcDecl = causeWalksOf(anyWorst);
        const derDeclPair = pcDecl ? pcDecl.cause : "none";
        const evid = (pair, pc) =>
          pair
            ? `${pair.a.x},${pair.a.y}~${pair.b.x},${pair.b.y}: ${pair.din} in / ${pair.dout} out; with ` +
              `our structures lifted it walks ${pc.noStructures === null ? "nowhere" : pc.noStructures} ` +
              `and with the interior's natural walls lifted as well ` +
              `${pc.noWalls === null ? "nowhere" : pc.noWalls}`
            : `there is no reachable pair, so the label is "none"`;
        if (mb?.pairCause !== derRoomPair) {
          bad.push(
            `meta.shell.mobilityBuilt: \`pairCause\` says ${JSON.stringify(mb?.pairCause ?? null)}, ` +
              `re-derived over this room's gated worst pair (${evid(pcRoom ? gatedWorst : null, pcRoom)}) ` +
              `it is "${derRoomPair}". The room's paragraph prints the pair-level disclosure ONLY when ` +
              `this label differs from the room verdict, so a relabelling here deletes the sentence that ` +
              `tells an owner the worst pair is our own mass`,
          );
        }
        // ...and the declaration's copies of the same two walks. One room, one
        // label per pair.
        for (const sfm of declared) {
          if (!sfm || normGate(sfm.gate) !== "mobility" || sfm.kind) continue;
          if (sfm.pairCause !== undefined && sfm.pairCause !== derDeclPair) {
            bad.push(
              `mobility (as built): the declaration's \`pairCause\` is ${JSON.stringify(sfm.pairCause)} ` +
                `and its own worst pair (${evid(anyWorst, pcDecl)}) re-derives "${derDeclPair}"`,
            );
          }
          if (pcDecl && sfm.causeWalks) {
            for (const [f, der] of [
              ["noStructures", pcDecl.noStructures],
              ["noWalls", pcDecl.noWalls],
            ]) {
              if (sfm.causeWalks[f] !== undefined && sfm.causeWalks[f] !== der) {
                bad.push(
                  `mobility (as built): the declaration's \`causeWalks.${f}\` is ` +
                    `${JSON.stringify(sfm.causeWalks[f])}, re-derived the same walk over its own worst ` +
                    `pair it is ${JSON.stringify(der)} — these two walks ARE the evidence the CAUSE ` +
                    `clause of the paragraph quotes`,
                );
              }
            }
          }
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
    // else: a RAMPART THAT CARRIES A ROAD and has a D8 neighbour which is also a
    // rampart carrying a road. D8 and not D4 — the game is D8 everywhere else in
    // this file (netOK, the exterior flood, the mobility walk), and a diagonal
    // run of two paved wall tiles is the same prepared surface as an orthogonal
    // one. The roster is therefore the BOARD's answer and not the producer's: a
    // room that stops publishing runs does not stop having them.
    //
    // ...AND THE SCOPE IS THE WHOLE WALL, NOT THE CUT. Round 13's version of this
    // block derived the roster from `meta.shell.cut` alone, and the wall this
    // planner ships is made of ramparts of five classes — crossing (the cut),
    // seat, ring, cover — of which the cut is 235 of 278 tiles. A prepared
    // surface along the wall is a prepared surface whatever class of rampart it
    // sits under: an attacker walking a two-tile paved run does not consult the
    // taxonomy. Re-derived over every road+rampart tile the roster is 26 tiles in
    // 12 rooms against the cut-only 14 in 7, and the twelve extra tiles are
    // exactly the shape the pass exists for — E5S9 22,19 has a free interior
    // parallel at 22,20 that was never offered, E14S3 9,40 / E4S1 17,42 / E5S5
    // 16,20 the same, and E21S3 ships a FOUR-tile run of stand-denial ring. The
    // document's "seven rooms, 14 tiles" was the detector's answer to its own
    // question, which is criticism 26's shape on a different axis.
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
      /** every rampart this room ships that also carries a road — the whole
       *  wall, all five taxonomy classes, not the cut alone */
      const pavedWall = new Set(
        (s.rampart || []).filter((r) => roadSet.has(key(r.x, r.y))).map((r) => key(r.x, r.y)),
      );
      const runs = [...pavedWall]
        .map((k) => {
          const [x, y] = k.split(",").map(Number);
          return { x, y };
        })
        .filter((c) => D8.some(([dx, dy]) => pavedWall.has(key(c.x + dx, c.y + dy))))
        .sort((a, b) => a.y - b.y || a.x - b.x);
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
      /** the rejection reasons stage 5b can give a neighbour, each re-checkable.
       *  The "ramparted tile" pair arrived with round 14's roster: the run is
       *  along the WALL, not along the cut, so the neighbour that is "the same
       *  problem one tile over" is any rampart — and the producer distinguishes
       *  the crossing class from the rest, so both spellings are re-derived
       *  separately and the more specific one is matched first. */
      const rampartK = new Set((s.rampart || []).map((r) => key(r.x, r.y)));
      const claimTrue = (x, y, rest) => {
        const k = key(x, y);
        if (rest.startsWith("is off the buildable board")) return x < 1 || y < 1 || x > 48 || y > 48;
        if (rest.startsWith("is natural wall")) return !walkable(terrain, x, y);
        if (rest.startsWith("is OUTSIDE the wall")) {
          return x >= 0 && y >= 0 && x <= 49 && y <= 49 && !!ext[idx(x, y)];
        }
        if (rest.startsWith("is itself a ramparted tile on the cut")) {
          return rampartK.has(k) && cutKeyed.has(k);
        }
        if (rest.startsWith("is itself a ramparted tile")) return rampartK.has(k);
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
            `meta.walls.alongCutRefused: this room ships a PAVED RUN tile at ${tk} — a rampart carrying a ` +
              `road with a D8 neighbour that is also a rampart carrying a road${
                cutKeyed.has(tk) ? "" : " (off the cut: a seat, ring or cover rampart)"
              } — and files no refusal for it. A run is a prepared surface laid along the exact line an ` +
              `attacker would want to walk, whatever class of rampart it sits under; stage 5b exists to ` +
              `move it one tile inboard, and a run shipped with no record is indistinguishable from a pass ` +
              `that never ran on this room`,
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
        } else if (why.startsWith("this tile carries a CONTAINER")) {
          // SHAPE B, ADDED IN ROUND 14 WITH THE WIDER ROSTER. The roster is the
          // whole wall now, and a seat-class rampart carries its container's
          // road UNDER the container rather than beside it — moving that road
          // one tile inboard would take the container off its own road face,
          // which is a worse room and not a repaired one. It is a claim about
          // the RUN TILE and not about its neighbours, so it makes no
          // enumeration and is not held to one; what it does claim is exactly
          // one re-derivable fact, and that fact is checked here.
          if (!(s.container || []).some((cc) => cc.x === c.x && cc.y === c.y)) {
            bad.push(
              `meta.walls.alongCutRefused ${tk}: the refusal says this tile carries a container and the ` +
                `board this room ships has none on it. That sentence is the entire refusal`,
            );
          }
          continue;
        } else {
          bad.push(
            `meta.walls.alongCutRefused ${tk}: the reason is free text in a form this gate cannot check ` +
              `("${why.slice(0, 70)}${why.length > 70 ? "…" : ""}"). Stage 5b gives exactly three answers — ` +
              `"no interior parallel exists: <every neighbour, with why>", "every interior parallel ` +
              `breaks the network. moving it to X,Y — ... The other neighbours: ...", or "this tile ` +
              `carries a CONTAINER ..." — and a fourth answer is a refusal nobody can falsify`,
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
          `this room publishes a PAVED RUN note and the board has no run on it — no rampart carries a ` +
            `road with a D8 neighbour that is also a rampart carrying a road. A note about a thing that is ` +
            `not there is the same defect as silence about a thing that is`,
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
          if (rest.startsWith("is itself a ramparted tile on the cut")) {
            return rampartK.has(k) && cutKeyed.has(k);
          }
          if (rest.startsWith("is itself a ramparted tile")) return rampartK.has(k);
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
    //
    // ...AND THE MAP IS NOW OWED IN FULL, BOTH WAYS. The paragraph above was
    // true about every key the map CARRIED and said nothing at all about the
    // keys it did not: the whole block was `if (rkMap && typeof rkMap ===
    // "object")`, so deleting `meta.walls.roadKind` (E13S5, 21 tiles), shipping
    // `{}`, shipping `[]`, or simply dropping one entry switched the enum test
    // and all three re-derivations off for that room, and "0 unclassified" was
    // an arithmetic identity over an empty set. Presence is now a schema
    // requirement (REQUIRED_META), and COVERAGE is the identity below: the key
    // set must equal, exactly, the set of ALIVE road tiles this room ships at
    // `meta.roadLayer == 7`. A layer-7 tile with no provenance is the
    // unclassified tile the caption was invented to abolish, and a provenance
    // key on a tile that is not a layer-7 road is a caption counting a tile
    // some other layer laid.
    // ==================================================================
    {
      const rkMap = plan.meta?.walls?.roadKind;
      if (rkMap && typeof rkMap === "object" && !Array.isArray(rkMap)) {
        const cutKeyed = new Set(cutPts.map((c) => key(c.x, c.y)));
        // ---- COVERAGE: the key set IS the layer-7 alive road set -----------
        const layer7 = new Set();
        const rlMap = plan.meta?.roadLayer;
        if (rlMap && typeof rlMap === "object") {
          for (const [k, v] of Object.entries(rlMap)) if (v === 7 && roadSet.has(k)) layer7.add(k);
        }
        const rkKeys = new Set(Object.keys(rkMap));
        const missing = [...layer7].filter((k) => !rkKeys.has(k)).sort();
        const extra = [...rkKeys].filter((k) => !layer7.has(k)).sort();
        if (missing.length) {
          bad.push(
            `meta.walls.roadKind: ${missing.length} layer-7 road tile(s) carry NO provenance ` +
              `(${missing.slice(0, 8).join(" ")}${missing.length > 8 ? " …" : ""}). The film's layer-7 ` +
              `caption is composed from this map, so a tile the map has no word for is a tile the caption ` +
              `either omits or absorbs into the largest class beside it — which is the defect the map was ` +
              `written to end`,
          );
        }
        if (extra.length) {
          bad.push(
            `meta.walls.roadKind: ${extra.length} provenance key(s) name a tile that is not a live layer-7 ` +
              `road (${extra
                .slice(0, 8)
                .map((k) => `${k}=${JSON.stringify(rkMap[k])}@layer ${rlMap?.[k] ?? "none"}`)
                .join(" ")}${extra.length > 8 ? " …" : ""}). Every key in this map is a claim that layer 7 ` +
              `laid that tile; a key on a tile some earlier layer laid inflates the fleet's layer-7 census ` +
              `and captions a road for work it was not part of`,
          );
        }
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
    // `spurTiles`: WHAT THE PASS LAID vs WHAT THE ROOM SHIPS — reconciled.
    //
    // Criticism 27, open since round 12: `meta.walls.spurTiles` sums to 375
    // across the fleet and only 370 tiles carry `roadKind: "spur"`. Both numbers
    // are published, neither is compared to the other, and nothing at all reads
    // `spurTiles` — multiplying it by ten validated clean. The suite prints the
    // laid figure ("rampart spurs … 375 tiles") beside the provenance map that
    // says 370, and a reader has no way to know which one describes the room.
    //
    // The two ARE different facts and both are worth publishing: `spurTiles` is
    // what stage 5 LAID, and the layer-7 passes that run after it — the
    // extension reflow, the dead-end prune, the swamp paving, the along-cut
    // swap — can delete a spur tile or re-attribute it to their own kind. What
    // is not admissible is publishing the larger number with no account of the
    // difference, because then "375 rampart spurs" is a claim about a board that
    // was never shipped.
    //
    // THE CONTRACT, and it is the shape the goal document asks of every
    // producer-witnessed counter: the laid count may EXCEED the shipped count
    // only by tiles the producer NAMES, and every named tile is re-derived here
    // — a lost spur tile must genuinely not be a live spur today, i.e. it either
    // carries no road at all any more or carries a road some later layer-7 pass
    // has claimed. A room whose two counts agree owes nothing extra. A room that
    // inflates `spurTiles` owes one verifiable tile per unit of inflation, which
    // is the bound that closes the criticism.
    // ==================================================================
    {
      const laid = plan.meta?.walls?.spurTiles;
      const rkMap2 = plan.meta?.walls?.roadKind;
      if (typeof laid === "number" && rkMap2 && typeof rkMap2 === "object" && !Array.isArray(rkMap2)) {
        const shippedK = Object.keys(rkMap2).filter((k) => rkMap2[k] === "spur");
        const shipped = shippedK.length;
        const pubShipped = plan.meta?.walls?.spurTilesShipped;
        if (pubShipped !== undefined && pubShipped !== shipped) {
          bad.push(
            `meta.walls.spurTilesShipped says ${JSON.stringify(pubShipped)} and ${shipped} tile(s) on the ` +
              `board this room ships carry the "spur" provenance. The shipped count is not a witness, it ` +
              `is a count of the map beside it`,
          );
        }
        // ...and the shipped LIST, when the producer publishes one: it is the
        // same set as the provenance map's spur entries or it is a different
        // claim about the same tiles.
        const pubShipList = plan.meta?.walls?.spurTilesShippedList;
        if (Array.isArray(pubShipList)) {
          const got = pubShipList
            .filter((t) => t && Number.isInteger(t.x))
            .map((t) => key(t.x, t.y))
            .sort();
          const want = shippedK.slice().sort();
          if (got.join(" ") !== want.join(" ")) {
            bad.push(
              `meta.walls.spurTilesShippedList is [${got.join(" ") || "nothing"}] and the tiles carrying ` +
                `the "spur" provenance are [${want.join(" ") || "nothing"}] — one pass, one list`,
            );
          }
        }
        if (laid < shipped) {
          bad.push(
            `meta.walls.spurTiles says stage 5 laid ${laid} spur tile(s) and ${shipped} tile(s) ship with ` +
              `the "spur" provenance. A later pass can delete a spur or re-label it; it cannot create one, ` +
              `so the laid count can never be the smaller of the two`,
          );
        }
        // ---- THE DIFFERENCE, NAMED TILE BY TILE ---------------------------
        //
        // Two counts are not a reconciliation. "375 rampart spurs" beside a
        // provenance map that says 370 is a claim about a board nobody shipped,
        // and multiplying the laid figure by ten used to validate clean — that
        // is criticism 27, open since round 12. So the tiles behind the two
        // numbers are published and reconciled here, and the reconciliation runs
        // in EVERY room rather than only in the three where the counts differ:
        // an identity that is dormant wherever it happens to hold is an identity
        // nobody is testing.
        //
        // Either channel closes it. `spurTilesLaidList` is the stronger one —
        // lost is then the SUBTRACTION laid minus shipped, and the shipped set
        // has to be a subset of the laid set — and `spurTilesLost` alone is
        // accepted for a producer that only kept the difference. When both are
        // published they must agree, because lost IS laid minus shipped.
        {
          const shipSet = new Set(shippedK);
          const laidPub = plan.meta?.walls?.spurTilesLaidList;
          const lostPub = plan.meta?.walls?.spurTilesLost;
          const asKeys = (arr) => [
            ...new Set(
              (Array.isArray(arr) ? arr : [])
                .filter((t) => t && Number.isInteger(t.x) && Number.isInteger(t.y))
                .map((t) => key(t.x, t.y)),
            ),
          ];
          let lost = null;
          let via = null;
          if (Array.isArray(laidPub)) {
            const laidK = asKeys(laidPub);
            if (laidK.length !== laid) {
              bad.push(
                `meta.walls.spurTilesLaidList names ${laidK.length} distinct tile(s) and ` +
                  `meta.walls.spurTiles says stage 5 laid ${laid}`,
              );
            }
            for (const k of shippedK) {
              if (!laidK.includes(k)) {
                bad.push(
                  `meta.walls.roadKind gives ${k} the "spur" provenance and meta.walls.spurTilesLaidList ` +
                    `does not contain it — a tile that ships as a spur was laid by the spur pass`,
                );
              }
            }
            lost = laidK.filter((k) => !shipSet.has(k));
            via = "spurTilesLaidList";
            if (Array.isArray(lostPub)) {
              const pl = asKeys(lostPub).sort();
              if (pl.join(" ") !== lost.slice().sort().join(" ")) {
                bad.push(
                  `meta.walls.spurTilesLost is [${pl.join(" ") || "nothing"}] and the tiles this room LAID ` +
                    `as spurs but does not ship as spurs are [${lost.slice().sort().join(" ") || "nothing"}]. ` +
                    `Lost IS laid minus shipped; a list that disagrees with its own subtraction is a second ` +
                    `answer to one question`,
                );
              }
              for (const k of pl) {
                if (roadSet.has(k) && rkMap2[k] === "spur") {
                  bad.push(
                    `meta.walls.spurTilesLost names ${k} as a spur tile a later pass took, and the room ` +
                      `ships a road there carrying the "spur" provenance today — a tile cannot be both ` +
                      `lost and live`,
                  );
                }
              }
            }
          } else if (laid > shipped) {
            lost = asKeys(lostPub);
            via = "spurTilesLost";
          }
          if (lost !== null) {
            if (lost.length !== laid - shipped) {
              bad.push(
                `meta.walls.spurTiles says stage 5 laid ${laid} spur tile(s), ${shipped} ship with the ` +
                  `"spur" provenance, and meta.walls.${via} accounts for ${lost.length} of the ` +
                  `${laid - shipped} missing. The laid figure is the one the suite prints as "rampart ` +
                  `spurs"; a difference the room does not name tile by tile makes it a claim about a board ` +
                  `nobody shipped`,
              );
            }
            for (const k of lost) {
              if (roadSet.has(k) && rkMap2[k] === "spur") {
                bad.push(
                  `meta.walls.${via} makes ${k} a spur tile a later pass took, and the room ships a road ` +
                    `there carrying the "spur" provenance today — a tile cannot be both lost and live`,
                );
              }
            }
          }
        }
      }
    }




    // ==================================================================
    // THE PLANNER'S NOTES — DERIVE OR DIE, LIKE EVERY OTHER CHANNEL.
    //
    // 177 notes across the fleet, in seven classes, and until round 14 exactly
    // ZERO of them were checked. Round 14 gated the twelve `A PAVED RUN ALONG
    // THE WALL` notes against the along-cut roster. The other 165 escaped both
    // deletion and arbitrary falsification: `p.meta.notes = []` passed any room
    // in the fleet, and so did rewriting a note to say the opposite of its own
    // record. The `ROAD ON RAMPART, CLASSIFIED` note is the reader-facing copy
    // of the taxonomy the goal document HEADLINES (278 = 235 + 30 + 13) — the
    // RECORD is re-derived and gated, and its rendered sentence was not.
    //
    // A note is prose ABOUT a record, so it is held the way the declarations
    // are: every number it states is compared against the record or the board
    // it is about, and a room whose record demands a note and does not carry
    // one fails. That is the same two-sided rule the declaration channel has —
    // content and obligation — applied to the channel that had neither.
    //
    // The obligations are the DERIVABLE half of each trigger. Where the
    // producer's condition for emitting a note is narrower than anything this
    // file can re-derive, the obligation is the part that is certain (a room
    // that SHIPS shallow extensions owes the shallow note) rather than a guess
    // at the producer's branch — an obligation that fires where the producer
    // reasonably said nothing would be this file inventing a defect.
    // ==================================================================
    {
      const bad2 = [];
      const noteOf = (head) => (plan.meta?.notes || []).find((n) => typeof n === "string" && n.startsWith(head));
      // ==================================================================
      // M4. THE NOTE CHANNEL WAS THE LAST HAND-WRITTEN PROSE IN THE ARTIFACT,
      // AND IT HAD NO CLASS INVENTORY AT ALL.
      //
      // Every other channel got one: `assertPairInventory`,
      // `assertProseInventory`, `assertRecordInventory`,
      // `assertCutReasonInventory`. Notes got a set of anchored regexes over
      // whatever prose happened to be there, so 5 of 10 mutations escaped:
      //   - a FABRICATED class ("PERFECT ROOM: …") — 200 of them passed,
      //     because there was no list saying which classes exist
      //   - an arbitrary lie APPENDED to a checked note, numerals untouched
      //   - the note's PROSE REVERSED while its anchored numerals were kept:
      //     "every one of this room's 27 cut tile(s) is REDUNDANT and could be
      //     deleted for free … This room ships a DOUBLE SHELL." under the
      //     heading "NO CUT TILE IS REDUNDANT" — passing
      //   - a ring tile in the ROAD ON RAMPART note moved from 20,10 to 49,49
      //
      // Round 13 closed declaration paragraphs by making the producer and this
      // file run ONE renderer and comparing the output character for character.
      // This is the same move, one channel over. `declprose-notes.mjs` owns a
      // closed class list and is the ONLY writer of `meta.notes`; it writes
      // `meta.noteRecords` in the same call, so the two arrays are parallel BY
      // CONSTRUCTION. The gate is therefore not a regex over prose: it is
      // `renderNote(noteRecords[i]) === notes[i]`, for every i, plus the
      // obligation table derived from the records rather than from the notes.
      //
      // The anchored-regex checks below are KEPT. They are now a second opinion
      // rather than the only one, and they are the half that survives if a
      // renderer is ever changed to agree with a corrupted record.
      // ==================================================================
      {
        // 54 of the 172 rooms have nothing to say and publish neither array;
        // `meta.noteObligations` is written for ALL 172 (empty in those 54) and
        // is the one that is genuinely required, because it is the list derived
        // from the records rather than from the notes.
        const notesArr = plan.meta?.notes === undefined ? [] : plan.meta.notes;
        const recs = plan.meta?.noteRecords === undefined ? [] : plan.meta.noteRecords;
        if (!Array.isArray(notesArr)) {
          bad2.push(`\`meta.notes\` is not an array (${String(JSON.stringify(notesArr)).slice(0, 40)})`);
        } else if (!Array.isArray(recs)) {
          bad2.push(
            `\`meta.noteRecords\` is ${recs === undefined ? "ABSENT" : "not an array"} and \`meta.notes\` ` +
              `carries ${notesArr.length} paragraph(s). The records are what the paragraphs are GENERATED ` +
              `from; without them every note is free text again`,
          );
        } else if (notesArr.length !== recs.length) {
          bad2.push(
            `\`meta.notes\` has ${notesArr.length} entr(y/ies) and \`meta.noteRecords\` has ${recs.length}. ` +
              `One call writes both, so a difference is an edit to one of them — which is exactly how a ` +
              `fabricated note class gets into the channel a reader reads`,
          );
        } else {
          for (let i = 0; i < recs.length; i++) {
            const e = recs[i];
            if (!e || typeof e !== "object" || typeof e.cls !== "string") {
              bad2.push(`\`meta.noteRecords[${i}]\` is ${String(JSON.stringify(e)).slice(0, 60)}, not a {cls, rec} entry`);
              continue;
            }
            if (!(e.cls in NOTE_CLASSES)) {
              bad2.push(
                `\`meta.noteRecords[${i}].cls\` is ${JSON.stringify(e.cls)} and the note-class inventory ` +
                  `holds ${Object.keys(NOTE_CLASSES).join(", ")}. A class nobody registered is a note ` +
                  `nobody renders and nobody checks — 200 fabricated "PERFECT ROOM" notes passed on the ` +
                  `absence of this list`,
              );
              continue;
            }
            let want = null;
            try {
              want = renderNote(e);
            } catch (err) {
              bad2.push(
                `\`meta.noteRecords[${i}]\` (class ${e.cls}) cannot be rendered (${err && err.message}) — ` +
                  `a record the shared note template throws on is a record missing a field the note is ` +
                  `made of`,
              );
              continue;
            }
            // ==========================================================
            // ROUND 17 / O1 (BLOCKING) — RENDER-OR-DIE.
            // ==========================================================
            // `renderNote` only THROWS on a record missing a field it
            // dereferences; a field it interpolates comes out as the four
            // characters "undefined" and the note ships. The owner-voice
            // reviewer landed exactly that: a `pavedRun` record whose run
            // lost its coordinates rendered "(undefined,undefined)" into
            // the channel the gallery and the film ticker read, and the
            // room passed 172/172. A generated sentence that says
            // `undefined` is a sentence generated from a hole.
            if (/\b(undefined|NaN)\b/.test(want)) {
              bad2.push(
                `\`meta.notes[${i}]\` (class ${e.cls}) renders the token "${(want.match(/\b(undefined|NaN)\b/) || [])[0]}" ` +
                  `into its own prose — the note template read a field the record does not carry and ` +
                  `interpolated the hole. \`renderNote\` throwing is the only failure this file used to ` +
                  `see, so a field that is merely INTERPOLATED (a coordinate, a count) came out as the word ` +
                  `"undefined" in the channel a human reads: "…${want.slice(Math.max(0, want.search(/\b(undefined|NaN)\b/) - 60), want.search(/\b(undefined|NaN)\b/) + 60)}…"`,
              );
            }
            for (const p2 of noteRecordBindingProblems(e, plan, s)) {
              bad2.push(`\`meta.noteRecords[${i}]\` (class ${e.cls}) ${p2}`);
            }
            if (normText(String(notesArr[i])) !== normText(want)) {
              const a = normText(String(notesArr[i]));
              const b3 = normText(want);
              let ci = 0;
              while (ci < a.length && ci < b3.length && a[ci] === b3[ci]) ci++;
              bad2.push(
                `\`meta.notes[${i}]\` is not the note its own record generates (class ${e.cls}). They agree ` +
                  `for ${ci} character(s) and then diverge — shipped: "…${a.slice(Math.max(0, ci - 40), ci + 90)}…" ` +
                  `vs generated: "…${b3.slice(Math.max(0, ci - 40), ci + 90)}…". Notes are the channel the ` +
                  `gallery and the film ticker read; a reversed sentence with its numerals kept used to ` +
                  `pass because only the numerals were checked`,
              );
            }
          }
          // ==========================================================
          // ROUND 17 / F1 — THE OBLIGATION HAS TO BE DERIVED TO EXIST.
          // ==========================================================
          // Round 16 checked the obligation list against the record list BOTH
          // WAYS and each trigger's value against the field it names. Nothing
          // re-derived that the obligation must EXIST — so deleting the note,
          // the record AND the obligation together left a self-consistent
          // plan. Measured: 177 notes tried, 163 bit, **14 escaped**, all
          // `shallowExt`, all in rooms whose `meta.extensions.relocatedCount`
          // is 1 or 2 — i.e. the exact rooms whose note is the only record
          // that layer 6 moved an extension at all.
          //
          // So the owed set is COMPUTED HERE, from the same records the
          // producer derives it from, and compared three ways: against the
          // producer's list, against the records, and (for the classes whose
          // trigger this file re-derives) against the board. The trigger
          // fields are in REQUIRED_META, so "delete the trigger too" is a
          // schema failure rather than one more step of the same move.
          {
            const M = plan.meta || {};
            const W2 = M.walls || {};
            const owedHere = new Map();
            const owe = (cls, why) => {
              if (why.length) owedHere.set(cls, why);
            };
            owe(
              "sealedFloor",
              (M.sealedFloor?.tiles || 0) > 0 ? [`\`meta.sealedFloor.tiles\` is ${M.sealedFloor.tiles}`] : [],
            );
            {
              const rc2 = M.shell?.redundantCut || {};
              owe(
                "redundantCut",
                [
                  (rc2.tiles || 0) > 0 ? `\`meta.shell.redundantCut.tiles\` is ${rc2.tiles}` : null,
                  (rc2.pruned || 0) > 0 ? `\`meta.shell.redundantCut.pruned\` is ${rc2.pruned}` : null,
                ].filter(Boolean),
              );
            }
            // the conduct-bridge roads layer 7 LAID, which is the list the
            // note's own `added` is bound to and is published for all 172
            // rooms — `meta.walls.conductBridge` is published only in the 3
            // that have one, so it is not what the obligation may hang on
            owe(
              "containerRoad",
              (W2.laidTilesByKind?.conductBridge || []).length
                ? [`\`meta.walls.laidTilesByKind.conductBridge\` lists ${W2.laidTilesByKind.conductBridge.length} tile(s)`]
                : [],
            );
            owe(
              "pavingGap",
              (W2.conductBridge?.stranded || []).length
                ? [`\`meta.walls.conductBridge.stranded\` lists ${W2.conductBridge.stranded.length} tile(s)`]
                : [],
            );
            owe(
              "pavedRun",
              (W2.alongCutRuns || []).length ? [`\`meta.walls.alongCutRuns\` lists ${W2.alongCutRuns.length} run(s)`] : [],
            );
            {
              const rr2 = W2.roadRampart || {};
              owe(
                "roadRampart",
                [
                  (rr2.ring || 0) > 0 ? `\`meta.walls.roadRampart.ring\` is ${rr2.ring}` : null,
                  (rr2.unclassified || 0) > 0 ? `\`meta.walls.roadRampart.unclassified\` is ${rr2.unclassified}` : null,
                ].filter(Boolean),
              );
            }
            {
              const ex2 = M.extensions || {};
              owe(
                "shallowExt",
                [
                  (ex2.shallow || 0) > 0 ? `\`meta.extensions.shallow\` is ${ex2.shallow}` : null,
                  (ex2.relocatedCount || 0) > 0 ? `\`meta.extensions.relocatedCount\` is ${ex2.relocatedCount}` : null,
                  (ex2.relocated || []).length ? `\`meta.extensions.relocated\` lists ${ex2.relocated.length}` : null,
                  (W2.reflow?.moved || []).length ? `\`meta.walls.reflow.moved\` lists ${W2.reflow.moved.length}` : null,
                  (W2.reflow?.added || []).length ? `\`meta.walls.reflow.added\` lists ${W2.reflow.added.length}` : null,
                ].filter(Boolean),
              );
            }
            const haveRec = new Set(recs.map((r2) => r2 && r2.cls));
            const pubOwed = new Set((Array.isArray(plan.meta?.noteObligations) ? plan.meta.noteObligations : []).map((o) => o && o.cls));
            for (const [c, why] of owedHere) {
              if (!haveRec.has(c)) {
                bad2.push(
                  `this room OWES a "${c}" note — re-derived here from the records that trigger it ` +
                    `(${why.join("; ")}) — and \`meta.noteRecords\` carries none. Round 16 checked the ` +
                    `obligation list against the record list and never asked whether the obligation had to ` +
                    `exist, so deleting note, record and obligation together was free in 14 rooms`,
                );
              }
              if (!pubOwed.has(c)) {
                bad2.push(
                  `this room owes a "${c}" note (${why.join("; ")}) and \`meta.noteObligations\` — the ` +
                    `producer's own derivation of the same set — does not list it`,
                );
              }
            }
            for (const c of pubOwed) {
              if (c && !owedHere.has(c) && c in NOTE_CLASSES) {
                bad2.push(
                  `\`meta.noteObligations\` says this room owes a "${c}" note and re-deriving the owed set ` +
                    `from the records that trigger it says it does not. The obligation is not a list a ` +
                    `producer keeps; it is a function of the room`,
                );
              }
            }
          }
          // ...AND THE OBLIGATION TABLE, DERIVED FROM RECORDS RATHER THAN FROM
          // NOTES. OF5: ten `SHALLOW EXTENSIONS` notes deleted for free because
          // the obligation was scoped to layer 7b's reflow and blind to layer
          // 6's. The producer now derives one entry per class the room OWES
          // from the records that exist for their own reasons; this checks the
          // two lists against each other in both directions.
          const obl = plan.meta?.noteObligations;
          if (!Array.isArray(obl)) {
            bad2.push(
              `\`meta.noteObligations\` is ${obl === undefined ? "ABSENT" : "not an array"} — it is the ` +
                `list of note classes this room owes, derived from records rather than from the notes ` +
                `themselves, and without it a note is deletable exactly as far as nobody happened to ` +
                `write a trigger for it`,
            );
          } else {
            const owed = new Set(obl.map((o) => o && o.cls));
            const have = new Set(recs.map((r2) => r2 && r2.cls));
            for (const c of owed) {
              if (!c) continue;
              if (!(c in NOTE_CLASSES)) {
                bad2.push(`\`meta.noteObligations\` names class ${JSON.stringify(c)}, which is not in the inventory`);
              } else if (!have.has(c)) {
                bad2.push(
                  `\`meta.noteObligations\` says this room owes a "${c}" note and \`meta.noteRecords\` ` +
                    `carries none. The obligation is derived from the room's own records, so a class owed ` +
                    `and not written is a note that was deleted`,
                );
              }
            }
            for (const c of have) {
              if (c && !owed.has(c)) {
                bad2.push(
                  `this room publishes a "${c}" note and \`meta.noteObligations\` — derived from its own ` +
                    `records — does not say it owes one. A note nothing obliges is a note nothing checks ` +
                    `the absence of`,
                );
              }
            }
            for (const o of obl) {
              if (!o || !Array.isArray(o.why) || !o.why.length) {
                bad2.push(
                  `\`meta.noteObligations\` carries an entry with no triggering field ` +
                    `(${String(JSON.stringify(o)).slice(0, 60)}) — the obligation IS the field that fires it`,
                );
                continue;
              }
              for (const w of o.why) {
                if (!w || typeof w.field !== "string") continue;
                const raw2 = w.field.split(".").reduce((cur, seg) => (cur === null || cur === undefined ? cur : cur[seg]), plan);
                // the producer records the SIZE of a list-valued trigger, which
                // is what "the room owes a note because there are N of these"
                // means; a scalar trigger is quoted as itself
                const v = Array.isArray(raw2) && typeof w.value === "number" ? raw2.length : raw2;
                if (JSON.stringify(v) !== JSON.stringify(w.value)) {
                  bad2.push(
                    `\`meta.noteObligations\` fires the "${o.cls}" note off \`${w.field}\` = ` +
                      `${JSON.stringify(w.value)} and that field on this plan says ${JSON.stringify(v)}. ` +
                      `The obligation is derived from the record; a trigger that quotes a value the record ` +
                      `does not have is an obligation with its own copy of the facts`,
                  );
                }
              }
            }
          }
          // ...AND THE COUNT BOUNDS. A class may appear more than once only
          // where its record can (redundantCut has two headings and a room
          // takes one of them); everything else is one note per class per room.
          const perClass = new Map();
          for (const r2 of recs) if (r2 && r2.cls) perClass.set(r2.cls, (perClass.get(r2.cls) || 0) + 1);
          for (const [c, n] of perClass) {
            if (n > 1) {
              bad2.push(
                `this room publishes ${n} "${c}" notes. Every note class in the inventory is a fact about ` +
                  `the whole room and is written once; a repeated class is the channel being used as a ` +
                  `free list again`,
              );
            }
          }
        }
      }
      const cutN = (plan.meta?.shell?.cut || []).length;
      const rc = plan.meta?.shell?.redundantCut || {};
      const inert = plan.meta?.walls?.inertPruned;
      const shallowExtsNow = (s.extension || []).filter((e) => depth[idx(e.x, e.y)] < DEPTH_SAFE);
      /** pull one number out of a note and compare it with the record's own */
      const noteNum = (head, txt, re, label, want, what) => {
        const m = txt.match(re);
        if (!m) {
          bad2.push(
            `the ${head} note does not state ${what} in the form the producer renders it, so nothing here ` +
              `can compare it with \`${label}\``,
          );
          return;
        }
        if (want === null || want === undefined) return;
        if (Number(m[1]) !== want) {
          bad2.push(
            `the ${head} note says ${what} is ${m[1]} and \`${label}\` — the record it is prose about — ` +
              `says ${want}`,
          );
        }
      };

      // ---- 1/2. THE TWO REDUNDANT-CUT NOTES, WHICH ARE EACH OTHER'S NEGATION.
      //
      // A room's cut is either wholly singly-load-bearing or it is not, and the
      // producer renders whichever of the two sentences is true. Publishing the
      // wrong one is the reader being told the wall is minimal when the record
      // beside it names two tiles that are not.
      {
        const noRedundant = noteOf("NO CUT TILE IS REDUNDANT");
        const someRedundant = noteOf("CUT TILES THAT ARE NOT SINGLY LOAD-BEARING");
        const tiles = typeof rc.tiles === "number" ? rc.tiles : null;
        if (noRedundant && someRedundant) {
          bad2.push(
            `this room publishes BOTH "NO CUT TILE IS REDUNDANT" and "CUT TILES THAT ARE NOT SINGLY ` +
              `LOAD-BEARING". They are the two branches of one test`,
          );
        }
        if (tiles !== null) {
          if (noRedundant && tiles > 0) {
            bad2.push(
              `this room publishes "NO CUT TILE IS REDUNDANT" and \`meta.shell.redundantCut.tiles\` says ` +
                `${tiles} of its cut tiles can each be removed on their own without letting the exterior ` +
                `flood reach the sitter`,
            );
          }
          if (someRedundant && tiles === 0) {
            bad2.push(
              `this room publishes "CUT TILES THAT ARE NOT SINGLY LOAD-BEARING" and ` +
                `\`meta.shell.redundantCut.tiles\` says none are`,
            );
          }
          // THE OBLIGATION. The producer emits one of the two exactly when the
          // room has something to say — either a redundant tile, or an inert
          // prune that took ramparts off this run — and both halves of that are
          // re-derivable from records this file already requires.
          const owes = tiles > 0 || (typeof inert === "number" && inert > 0);
          if (owes && !noRedundant && !someRedundant) {
            bad2.push(
              `\`meta.shell.redundantCut.tiles\` is ${tiles} and \`meta.walls.inertPruned\` is ${inert} — ` +
                `this room's wall has something a reader is owed a sentence about and it publishes ` +
                `neither redundant-cut note. \`meta.notes = []\` used to pass every room in the fleet`,
            );
          }
        }
        if (noRedundant) {
          noteNum("NO CUT TILE IS REDUNDANT", noRedundant, /every one of this room's (\d+) cut tile\(s\)/, "meta.shell.cut", cutN, "the size of the cut");
          noteNum("NO CUT TILE IS REDUNDANT", noRedundant, /and (\d+) further rampart\(s\) that were not already came off/, "meta.walls.inertPruned", typeof inert === "number" ? inert : null, "the inert prune's count");
        }
        if (someRedundant) {
          noteNum("CUT TILES THAT ARE NOT SINGLY LOAD-BEARING", someRedundant, /^CUT TILES THAT ARE NOT SINGLY LOAD-BEARING: (\d+) of this room's/, "meta.shell.redundantCut.tiles", tiles, "how many cut tiles are not singly load-bearing");
          noteNum("CUT TILES THAT ARE NOT SINGLY LOAD-BEARING", someRedundant, /of this room's (\d+) cut tile\(s\)/, "meta.shell.cut", cutN, "the size of the cut");
          noteNum("CUT TILES THAT ARE NOT SINGLY LOAD-BEARING", someRedundant, /and (\d+) more already were/, "meta.walls.inertPruned", typeof inert === "number" ? inert : null, "the inert prune's count");
          // ...AND THE TILES IT NAMES ARE THE TILES THE RECORD NAMES. The note
          // reads the reasons out one by one; a tile in the sentence that is
          // not in the record is a refusal nobody priced.
          // Only the one direction is checkable: the reasons' own text quotes
          // FURTHER tiles ("17,18 — interior floor the base walks on"), so a
          // tile appearing in the sentence is not necessarily a tile the
          // sentence is ABOUT. What is certain is that a priced refusal a
          // reader is never shown might as well not have been made.
          const reasons = rc.reasons && typeof rc.reasons === "object" ? Object.keys(rc.reasons) : null;
          if (reasons) {
            for (const k2 of reasons) {
              if (!someRedundant.includes(k2)) {
                bad2.push(
                  `\`meta.shell.redundantCut.reasons\` prices ${k2} and the note a reader reads never ` +
                    `names it. The note IS those reasons read out; ${reasons.length} refusal(s) are on the record`,
                );
              }
            }
          }
        }
      }

      // ---- 3. SEALED INTERIOR FLOOR ---------------------------------------
      //
      // ==================================================================
      // ...AND IT IS RE-DERIVED NOW, TILE FOR TILE. See the REQUIRED_META
      // entry for the nine escapes this closes. The flood is the OWN-CREEP
      // one (OF2): the WHOLE board from the sitter, blocked by terrain
      // wall, room objects and our own OBSTACLE structures — ramparts,
      // roads and containers do NOT block, and it is not confined to the
      // interior, because our own creeps may leave the wall and re-enter.
      // The old producer used the DEFENDED-region flood, which by
      // construction never steps outside the wall, so E12S7 published
      // seven "unreachable" tiles of which six are 53 steps away with 32
      // of those steps outside the wall.
      // ==================================================================
      {
        const sf2 = plan.meta?.sealedFloor;
        const note = noteOf("SEALED INTERIOR FLOOR");
        {
          const OBSTACLE_BUILT = ["spawn", "extension", "link", "storage", "tower", "observer", "lab", "terminal", "nuker"];
          const creepBlocked = new Set(objectTiles);
          for (const t of OBSTACLE_BUILT) for (const q of s[t] || []) creepBlocked.add(key(q.x, q.y));
          const flood = (blockSet) => {
            const seen = new Set([key(sitter.x, sitter.y)]);
            const q = [sitter];
            for (let qi = 0; qi < q.length; qi++) {
              const cur = q[qi];
              for (const [dx, dy] of D8) {
                const x = cur.x + dx;
                const y = cur.y + dy;
                if (x < 0 || y < 0 || x > 49 || y > 49) continue;
                const k2 = key(x, y);
                if (seen.has(k2) || !walkable(terrain, x, y) || blockSet.has(k2)) continue;
                seen.add(k2);
                q.push({ x, y });
              }
            }
            return seen;
          };
          const ownWalk = flood(creepBlocked);
          const bareWalk = flood(new Set(objectTiles));
          let wantTiles = 0;
          let wantDeep = 0;
          let wantOurFault = 0;
          const wantNamed = [];
          /** every sealed tile, in the same scan order — the pocket derivation needs all of them */
          const wantAll = [];
          for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
              if (!walkable(terrain, x, y)) continue;
              const i2 = idx(x, y);
              if (ext[i2]) continue;
              const k2 = key(x, y);
              if (rampartSet.has(k2) || creepBlocked.has(k2) || ownWalk.has(k2)) continue;
              wantTiles++;
              wantAll.push({ x, y });
              if (wantNamed.length < 24) wantNamed.push({ x, y });
              if (depth[i2] >= DEPTH_SAFE && x >= 2 && x <= 47 && y >= 2 && y <= 47) wantDeep++;
              if (bareWalk.has(k2)) wantOurFault++;
            }
          }
          if (wantTiles === 0) {
            if (sf2 !== null && sf2 !== undefined) {
              bad2.push(
                `\`meta.sealedFloor\` is published and this room's own board seals NO floor: every walkable ` +
                  `interior tile that carries nothing is reachable from the sitter under the own-creep flood`,
              );
            }
            if (note) bad2.push(`this room publishes a SEALED INTERIOR FLOOR note and its board seals no floor`);
          } else if (!sf2 || typeof sf2 !== "object") {
            bad2.push(
              `this room's board seals ${wantTiles} interior tile(s) (${wantNamed.slice(0, 6).map((t) => `${t.x},${t.y}`).join(" ")}${wantNamed.length > 6 ? " …" : ""}) ` +
                `and \`meta.sealedFloor\` is ${sf2 === undefined ? "ABSENT" : JSON.stringify(sf2)}. Sealed ` +
                `floor is floor the program could have used and did not; a record that is not there is not ` +
                `a room with nothing to report`,
            );
          } else {
            const cmpSF = (f, want) => {
              if (sf2[f] !== want) {
                bad2.push(
                  `\`meta.sealedFloor.${f}\` says ${JSON.stringify(sf2[f])} and re-derived from this room's ` +
                    `own board under the own-creep flood it is ${want}`,
                );
              }
            };
            cmpSF("tiles", wantTiles);
            cmpSF("deep", wantDeep);
            cmpSF("ourFault", wantOurFault);
            cmpSF("depthSafe", DEPTH_SAFE);
            // ==========================================================
            // ROUND 17 / O3 — THE PER-POCKET COUNTERFACTUAL, RE-DERIVED.
            // ==========================================================
            // The note published `ourFault` — the WHOLE-mass counterfactual —
            // and called it "the ceiling on what any re-ordering inside the
            // placement layers could recover". Nobody asked whether ONE move
            // reaches that ceiling, and it does: 220 of the round-16 fleet's
            // 257 sealed tiles came back on a single structure. Round 17's
            // producer publishes the pockets, their holders and what each
            // holder returns — and the recovery pass ACTS on it. That record
            // is the evidence for eight board changes, so it is re-derived
            // here: the pockets are the D8 components of the sealed set, the
            // holders are our own structures D8-adjacent to a pocket tile
            // (exact, not a heuristic — removing a structure makes exactly
            // one tile walkable, so a structure touching no tile of the
            // pocket cannot join it to the flood), and each holder's
            // `recovers` is measured by DELETING THAT ONE STRUCTURE and
            // re-running the same own-creep flood.
            {
              const sealedK = new Set(wantAll.map((t) => key(t.x, t.y)));
              /** D8 components of the sealed set, in the producer's scan order */
              const comps = [];
              const seenC = new Set();
              for (const t of wantAll) {
                const k0 = key(t.x, t.y);
                if (seenC.has(k0)) continue;
                const comp = [t];
                seenC.add(k0);
                for (let ci = 0; ci < comp.length; ci++) {
                  const cur = comp[ci];
                  for (const [dx, dy] of D8) {
                    const k2 = key(cur.x + dx, cur.y + dy);
                    if (!sealedK.has(k2) || seenC.has(k2)) continue;
                    seenC.add(k2);
                    comp.push({ x: cur.x + dx, y: cur.y + dy });
                  }
                }
                comps.push(comp);
              }
              const pockets = Array.isArray(sf2.pockets) ? sf2.pockets : null;
              if (!pockets) {
                bad2.push(
                  `\`meta.sealedFloor.pockets\` is ${sf2.pockets === undefined ? "ABSENT" : "not a list"} and ` +
                    `this room's seal falls into ${comps.length} D8 pocket(s). The per-pocket counterfactual ` +
                    `is what the one-move recovery pass decides on, and eight rooms changed on it this round`,
                );
              } else if (pockets.length !== comps.length) {
                bad2.push(
                  `\`meta.sealedFloor.pockets\` lists ${pockets.length} pocket(s) and this room's sealed set ` +
                    `falls into ${comps.length} D8 component(s)`,
                );
              } else {
                if (sf2.pocketCount !== comps.length) {
                  bad2.push(`\`meta.sealedFloor.pocketCount\` says ${JSON.stringify(sf2.pocketCount)} and the seal falls into ${comps.length} pocket(s)`);
                }
                const isDeep = (t) => depth[idx(t.x, t.y)] >= DEPTH_SAFE && t.x >= 2 && t.x <= 47 && t.y >= 2 && t.y <= 47;
                let singleTiles = 0;
                let singleDeep = 0;
                // MATCHED BY THE TILE THEY NAME, not by index: the producer
                // orders its pockets its own way and lists each pocket's tiles
                // row-major where this scan finds them by flood, and neither
                // ordering is the fact being checked.
                const byAt = new Map();
                for (const comp2 of comps) {
                  for (const t of comp2) byAt.set(key(t.x, t.y), comp2);
                }
                const usedComp = new Set();
                for (let pi = 0; pi < pockets.length; pi++) {
                  const p2 = pockets[pi];
                  if (!p2 || typeof p2 !== "object") {
                    bad2.push(`\`meta.sealedFloor.pockets[${pi}]\` is not a record`);
                    continue;
                  }
                  const comp = p2.at && Number.isInteger(p2.at.x) ? byAt.get(key(p2.at.x, p2.at.y)) : null;
                  if (!comp) {
                    bad2.push(
                      `\`pockets[${pi}].at\` is ${String(JSON.stringify(p2.at))} and no sealed pocket of this ` +
                        `room contains that tile`,
                    );
                    continue;
                  }
                  if (usedComp.has(comp)) {
                    bad2.push(`\`pockets[${pi}]\` names a tile of a pocket another entry already claims — one pocket, one record`);
                    continue;
                  }
                  usedComp.add(comp);
                  const compK = new Set(comp.map((t) => key(t.x, t.y)));
                  if (p2.tiles !== comp.length) {
                    bad2.push(`\`pockets[${pi}]\` says ${JSON.stringify(p2.tiles)} tile(s) and the component at ${key(comp[0].x, comp[0].y)} holds ${comp.length}`);
                  }
                  const cDeep = comp.filter(isDeep).length;
                  if (p2.deep !== cDeep) {
                    bad2.push(`\`pockets[${pi}]\` says ${JSON.stringify(p2.deep)} deep tile(s) and the component holds ${cDeep}`);
                  }
                  const gotN = (p2.named || []).map((t) => (t && Number.isInteger(t.x) ? key(t.x, t.y) : String(t)));
                  const strayN = gotN.filter((k2) => !compK.has(k2));
                  if (strayN.length || new Set(gotN).size !== gotN.length) {
                    bad2.push(
                      `\`pockets[${pi}].named\` lists ${JSON.stringify(gotN).slice(0, 90)} and ` +
                        `${strayN.length ? `${strayN.join(" ")} ${strayN.length > 1 ? "are" : "is"} not in this pocket` : `it repeats a tile`}`,
                    );
                  }
                  // the holder roster: OUR structures D8-adjacent to the pocket
                  const holderWant = [];
                  for (const t2 of OBSTACLE_BUILT) {
                    for (const q of s[t2] || []) {
                      const kq = key(q.x, q.y);
                      if (!D8.some(([dx, dy]) => compK.has(key(q.x + dx, q.y + dy)))) continue;
                      holderWant.push({ type: t2, x: q.x, y: q.y, k: kq });
                    }
                  }
                  const gotH = Array.isArray(p2.holders) ? p2.holders : [];
                  const gotHK = new Set(gotH.map((h) => (h && Number.isInteger(h.x) ? key(h.x, h.y) : String(h))));
                  const missH = holderWant.filter((h) => !gotHK.has(h.k));
                  const extraH = [...gotHK].filter((k2) => !holderWant.some((h) => h.k === k2));
                  if (missH.length || extraH.length) {
                    bad2.push(
                      `\`pockets[${pi}].holders\` names ${JSON.stringify([...gotHK]).slice(0, 90)} and the ` +
                        `structures of ours D8-adjacent to this pocket are ` +
                        `${JSON.stringify(holderWant.map((h) => h.k)).slice(0, 90)}` +
                        `${missH.length ? ` — missing ${missH.map((h) => h.k).join(" ")}` : ""}` +
                        `${extraH.length ? ` — invented ${extraH.join(" ")}` : ""}. A holder roster that ` +
                        `omits a candidate is a recovery the pass was never offered`,
                    );
                  }
                  // ...and what each one RETURNS, by deleting it and re-flooding
                  for (const h of gotH) {
                    if (!h || !Number.isInteger(h.x)) continue;
                    const without = new Set(creepBlocked);
                    without.delete(key(h.x, h.y));
                    const w2 = flood(without);
                    let back = 0;
                    let backDeep = 0;
                    for (const t of comp) {
                      if (!w2.has(key(t.x, t.y))) continue;
                      back++;
                      if (isDeep(t)) backDeep++;
                    }
                    if (h.recovers !== back || h.recoversDeep !== backDeep) {
                      bad2.push(
                        `\`pockets[${pi}]\` says removing the ${h.type} at ${h.x},${h.y} returns ` +
                          `${JSON.stringify(h.recovers)} tile(s) (${JSON.stringify(h.recoversDeep)} deep) and ` +
                          `deleting exactly that structure and re-running the own-creep flood returns ` +
                          `${back} (${backDeep} deep)`,
                      );
                    }
                  }
                  const bestWant = gotH.length
                    ? gotH.reduce((a, b) => ((b.recoversDeep || 0) > (a.recoversDeep || 0) ? b : a))
                    : null;
                  if (bestWant && p2.best && (p2.best.x !== bestWant.x || p2.best.y !== bestWant.y)) {
                    bad2.push(
                      `\`pockets[${pi}].best\` names ${p2.best.x},${p2.best.y} (${JSON.stringify(p2.best.recoversDeep)} deep) ` +
                        `and the roster's own best is ${bestWant.x},${bestWant.y} (${bestWant.recoversDeep} deep)`,
                    );
                  }
                  if (bestWant) {
                    singleTiles += bestWant.recovers || 0;
                    singleDeep += bestWant.recoversDeep || 0;
                  }
                }
                if (sf2.singleStructureTiles !== singleTiles || sf2.singleStructureDeep !== singleDeep) {
                  bad2.push(
                    `\`meta.sealedFloor.singleStructureTiles/Deep\` say ` +
                      `${JSON.stringify(sf2.singleStructureTiles)}/${JSON.stringify(sf2.singleStructureDeep)} ` +
                      `and summing each pocket's own best single holder gives ${singleTiles}/${singleDeep}. ` +
                      `This is the figure the recovery pass is aimed at and the one criticism 2's finding is ` +
                      `about — a whole-mass ceiling nobody had asked one move to reach`,
                  );
                }
              }
            }
            const gotNamed = Array.isArray(sf2.named) ? sf2.named : [];
            const wantK2 = new Set(wantNamed.map((t) => key(t.x, t.y)));
            const gotK2 = gotNamed.map((t) => (t && Number.isInteger(t.x) ? key(t.x, t.y) : String(t)));
            if (JSON.stringify(gotK2) !== JSON.stringify([...wantK2])) {
              bad2.push(
                `\`meta.sealedFloor.named\` lists ${JSON.stringify(gotK2).slice(0, 120)} and the tiles this ` +
                  `board actually seals, in the producer's own scan order, are ` +
                  `${JSON.stringify([...wantK2]).slice(0, 120)}. The note reads this list out; a coordinated ` +
                  `inflation naming eight invented tiles that happen to be interior, empty and fully ` +
                  `reachable passed 172/172 for a whole round`,
              );
            }
            // ...AND THE SENTENCE NAMING WHICH FLOOD THE WORD MEANS. This is
            // the field OF2 turned on: the old producer measured "cannot be
            // reached" with the DEFENDED-region flood, which by construction
            // never steps outside the wall, and published seven tiles in E12S7
            // of which six are 53 steps away with 32 of those steps outside it.
            // The numbers above are re-derived under the own-creep flood; a
            // basis that names a different one is a record describing a
            // measurement this file did not make.
            const bs = String(sf2.basis || "");
            if (!/OWN-CREEP/i.test(bs) || !/whole board/i.test(bs) || !/ownCreepWalk/.test(bs)) {
              bad2.push(
                `\`meta.sealedFloor.basis\` does not name the flood these numbers are measured under ` +
                  `("…${bs.slice(0, 90)}…"). They are re-derived here under the OWN-CREEP flood over the ` +
                  `WHOLE board from the sitter (ownCreepWalk) — ramparts, roads and containers do not ` +
                  `block and the flood is not confined to the interior — and a basis naming the ` +
                  `defended-region flood instead is the sentence that made criticism 43 wrong by six ` +
                  `tiles in the room nobody looked at`,
              );
            }
            const shallowWant = shallowExtsNow.length;
            if (typeof sf2.shallowStructs === "number" && sf2.shallowStructs !== shallowWant) {
              bad2.push(
                `\`meta.sealedFloor.shallowStructs\` says ${sf2.shallowStructs} and this room ships ` +
                  `${shallowWant} shallow extension(s)`,
              );
            }
          }
        }
        if (sf2 && typeof sf2 === "object" && typeof sf2.tiles === "number") {
          if (sf2.tiles > 0 && !note) {
            bad2.push(
              `\`meta.sealedFloor\` says ${sf2.tiles} tile(s) sit inside the wall carrying nothing and ` +
                `unreachable from the sitter, and this room publishes no SEALED INTERIOR FLOOR note. ` +
                `Sealed floor is floor the program could have used and did not`,
            );
          }
          if (sf2.tiles === 0 && note) {
            bad2.push(`this room publishes a SEALED INTERIOR FLOOR note and \`meta.sealedFloor.tiles\` is 0`);
          }
          if (note) {
            noteNum("SEALED INTERIOR FLOOR", note, /^SEALED INTERIOR FLOOR: (\d+) tile\(s\) sit inside the wall/, "meta.sealedFloor.tiles", sf2.tiles, "how much floor is sealed");
            noteNum("SEALED INTERIOR FLOOR", note, /(\d+) of them are deep/, "meta.sealedFloor.deep", sf2.deep, "how much of it is deep");
            noteNum("SEALED INTERIOR FLOOR", note, /(\d+) of the \d+ come back if OUR OWN blocking structures are removed/, "meta.sealedFloor.ourFault", sf2.ourFault, "how much of it our own mass sealed");
            noteNum("SEALED INTERIOR FLOOR", note, /this room ships (\d+) shallow extension\(s\)/, "the shipped board", shallowExtsNow.length, "how many shallow extensions the room ships");
            // ...and the tiles it lists are that many tiles.
            const lm = note.match(/(?:unreachable from|cannot be reached from) the sitter \(([^)]*)\)/);
            if (lm) {
              // ...and where the list is long the producer elides the tail with
              // an ellipsis, so the check is exact on the short lists and a
              // containment on the long ones. Either way a listed tile has to
              // be one the board actually seals.
              const listedK = [...new Set([...lm[1].matchAll(/(\d+),(\d+)/g)].map((q) => `${q[1]},${q[2]}`))];
              const elided = lm[1].includes("…") || lm[1].includes("...");
              if (elided ? listedK.length > sf2.tiles : listedK.length !== sf2.tiles) {
                bad2.push(
                  `the SEALED INTERIOR FLOOR note lists ${listedK.length} tile(s)${elided ? " (elided)" : ""} ` +
                    `and says there are ${sf2.tiles}`,
                );
              }
              for (const k2 of listedK) {
                const [lx, ly] = k2.split(",").map(Number);
                // "carries nothing" is about the PROGRAM: a tile with a
                // building on it is floor the room used. A road is not — it is
                // walkable surface, and E5S5 seals a pocket with one stranded
                // inside it — so roads are not counted against the sentence.
                if (blocked.has(k2) && !roadSet.has(k2)) {
                  bad2.push(
                    `the SEALED INTERIOR FLOOR note names ${k2} as floor that "carries nothing" and the ` +
                      `room ships a building there`,
                  );
                } else if (!walkable(terrain, lx, ly) || ext[idx(lx, ly)]) {
                  bad2.push(
                    `the SEALED INTERIOR FLOOR note names ${k2} as floor "inside the wall" and on the board ` +
                      `this room ships it is ${!walkable(terrain, lx, ly) ? "natural wall" : "outside the wall"}`,
                  );
                }
              }
            }
          }
        }
      }

      // ---- 4. ROAD ON RAMPART, CLASSIFIED ----------------------------------
      //
      // The five-class taxonomy is the goal document's own headline figure
      // (278 = 235 crossing + 30 seat + 13 ring + 0 cover + 0 unclassified).
      // The RECORD is in REQUIRED_META and re-derived class by class; the
      // SENTENCE that reads it out to a human was checked by nothing.
      {
        const rr = plan.meta?.walls?.roadRampart;
        const note = noteOf("ROAD ON RAMPART, CLASSIFIED");
        if (rr && typeof rr === "object") {
          if (rr.ring > 0 && !note) {
            bad2.push(
              `\`meta.walls.roadRampart\` counts ${rr.ring} CONTROLLER STAND-DENIAL RING tile(s) carrying ` +
                `both a road and a rampart, and this room publishes no ROAD ON RAMPART, CLASSIFIED note. ` +
                `The ring class is the one the published taxonomy did not have until round 13; it exists ` +
                `precisely because it used to be folded silently into "wall crossing"`,
            );
          }
          if (note) {
            if (!(rr.total > 0)) {
              bad2.push(`this room publishes a ROAD ON RAMPART, CLASSIFIED note and \`meta.walls.roadRampart.total\` is ${rr.total}`);
            }
            noteNum("ROAD ON RAMPART, CLASSIFIED", note, /^ROAD ON RAMPART, CLASSIFIED: (\d+) tile\(s\) in this room carry both a road and a rampart/, "meta.walls.roadRampart.total", rr.total, "the taxonomy total");
            noteNum("ROAD ON RAMPART, CLASSIFIED", note, /(\d+) wall CROSSING\(s\) on the cut line/, "meta.walls.roadRampart.crossing", rr.crossing, "the crossing class");
            noteNum("ROAD ON RAMPART, CLASSIFIED", note, /(\d+) bubble SEAT\(s\)/, "meta.walls.roadRampart.seat", rr.seat, "the seat class");
            noteNum("ROAD ON RAMPART, CLASSIFIED", note, /(\d+) CONTROLLER STAND-DENIAL RING tile\(s\)/, "meta.walls.roadRampart.ring", rr.ring, "the ring class");
            noteNum("ROAD ON RAMPART, CLASSIFIED", note, /(\d+) personal-cover tile\(s\)/, "meta.walls.roadRampart.cover", rr.cover, "the cover class");
            noteNum("ROAD ON RAMPART, CLASSIFIED", note, /(\d+) unclassified/, "meta.walls.roadRampart.unclassified", rr.unclassified, "the unclassified remainder");
          }
        }
      }

      // ---- 5. ROAD LAID FOR A CONTAINER THAT IS NOT BUILT YET ---------------
      {
        const cb = plan.meta?.walls?.conductBridge;
        const note = noteOf("ROAD LAID FOR A CONTAINER");
        if (cb && Array.isArray(cb.added) && cb.added.length) {
          if (!note) {
            bad2.push(
              `\`meta.walls.conductBridge.added\` names ${cb.added.length} road tile(s) laid to join this ` +
                `room's network THROUGH a container that does not exist until RCL 6, and this room ` +
                `publishes no ROAD LAID FOR A CONTAINER note. Those tiles are the difference between a ` +
                `staged network that connects and one that does not`,
            );
          } else {
            noteNum("ROAD LAID FOR A CONTAINER", note, /(\d+) plain road tile\(s\)/, "meta.walls.conductBridge.added", cb.added.length, "how many tiles the bridge laid");
            const lm = note.match(/plain road tile\(s\) \(([^)]*)\)/);
            if (lm) {
              const want = cb.added.filter((t) => t && Number.isInteger(t.x)).map((t) => key(t.x, t.y)).sort();
              const got = [...new Set([...lm[1].matchAll(/(\d+),(\d+)/g)].map((q) => `${q[1]},${q[2]}`))].sort();
              if (got.join(" ") !== want.join(" ")) {
                bad2.push(
                  `the ROAD LAID FOR A CONTAINER note names [${got.join(" ") || "nothing"}] and ` +
                    `\`meta.walls.conductBridge.added\` names [${want.join(" ")}]`,
                );
              }
            }
          }
        } else if (note) {
          bad2.push(`this room publishes a ROAD LAID FOR A CONTAINER note and \`meta.walls.conductBridge\` records no tiles`);
        }
      }

      // ---- 6. SHALLOW EXTENSIONS -------------------------------------------
      {
        const note = noteOf("SHALLOW EXTENSIONS");
        const rf = plan.meta?.extensions?.reflow || {};
        const moved = (rf.moved || []).length + (rf.added || []).length;
        if (!note && (shallowExtsNow.length > 0 || moved > 0)) {
          bad2.push(
            `this room ${shallowExtsNow.length ? `ships ${shallowExtsNow.length} extension(s) at depth < ${DEPTH_SAFE}` : `had ${moved} extension(s) relocated by layer 7b's re-run`} ` +
              `and publishes no SHALLOW EXTENSIONS note. A shallow extension rents a personal rampart ` +
              `forever and a relocated one is a rampart retired; both are things a reader is owed`,
          );
        }
        if (note) {
          noteNum("SHALLOW EXTENSIONS", note, /^SHALLOW EXTENSIONS: (\d+) of \d+ sit at depth </, "the shipped board", shallowExtsNow.length, "how many extensions stand shallow");
          noteNum("SHALLOW EXTENSIONS", note, /^SHALLOW EXTENSIONS: \d+ of (\d+) sit at depth </, "the shipped board", (s.extension || []).length, "the extension program");
          noteNum("SHALLOW EXTENSIONS", note, /sit at depth < (\d+)/, "DEPTH_SAFE", DEPTH_SAFE, "the depth-safe line");
          const mm = note.match(/and moved (\d+) more \(/);
          if (mm && Number(mm[1]) !== (rf.moved || []).length) {
            bad2.push(
              `the SHALLOW EXTENSIONS note says layer 7b moved ${mm[1]} extension(s) and ` +
                `\`meta.extensions.reflow.moved\` records ${(rf.moved || []).length}`,
            );
          }
          const rm = note.match(/retiring (\d+) personal rampart\(s\)/);
          if (rm && Array.isArray(rf.rampartsRetired) && Number(rm[1]) !== rf.rampartsRetired.length) {
            bad2.push(
              `the SHALLOW EXTENSIONS note says the re-run retired ${rm[1]} personal rampart(s) and ` +
                `\`meta.extensions.reflow.rampartsRetired\` names ${rf.rampartsRetired.length}`,
            );
          }
        }
      }

      for (const b of bad2) {
        fails.push(
          `PLANNER NOTE — ${b}. A note is the planner's own prose about its own record, printed for a ` +
            `human; 165 of the fleet's 177 were checked by nothing at all, and \`meta.notes = []\` passed ` +
            `every room. Prose derives or it dies, exactly like a declaration.`,
        );
      }
    }

    // ==================================================================
    // THE ALONG-CUT PASS'S DISPATCH FIELDS, AND THE SCOPE IT RAN OVER.
    //
    // Round 14 read the refusal's `why` sentence to the tile and re-derived
    // every claim in it. It read neither of the two STRUCTURED fields beside
    // it. `kind` is the refusal's own class — the number the doc quotes as
    // "27 = 16 breaks-network + 7 no-parallel + 4 seat" — and `offered` is the
    // candidate set the swap was actually put to. Both were free-form as far as
    // this file was concerned: a `seat` refusal could call itself
    // `breaks-network`, and `offered` could name any tiles at all.
    //
    // The class is DERIVABLE, and derived here: a run tile carrying a container
    // is a seat refusal whatever the sentence says (the road runs UNDER the
    // container and moving it takes the container off its own road face); one
    // whose sentence is the network sentence is a network refusal; the rest are
    // the no-parallel class. And `offered` is the tiles the sentence names, on
    // the network branch, and D8 neighbours a road could stand on in all cases.
    //
    // `alongCutScope` is the pass's own statement of WHAT IT WALKED, and it is
    // load-bearing: round 14 widened the roster from the cut to the whole
    // road+rampart wall (12 rooms / 26 tiles rather than the cut's smaller set),
    // and a producer that quietly narrowed it back to "cut" would ship a smaller
    // roster with every refusal still checking out. It was published and unread.
    // ==================================================================
    {
      const bad2 = [];
      const refusals = plan.meta?.walls?.alongCutRefused;
      const cutK2 = new Set((plan.meta?.shell?.cut || []).filter((c) => c && Number.isInteger(c.x)).map((c) => key(c.x, c.y)));
      if (Array.isArray(refusals)) {
        const containerK = new Set((s.container || []).map((c) => key(c.x, c.y)));
        for (const r of refusals) {
          if (!r || !Number.isInteger(r.x) || !Number.isInteger(r.y)) continue;
          const tk = key(r.x, r.y);
          const why = String(r.why || "");
          const wantKind = containerK.has(tk)
            ? "seat"
            : why.startsWith("every interior parallel breaks the network")
              ? "breaks-network"
              : "no-parallel";
          if (r.kind !== wantKind) {
            bad2.push(
              `meta.walls.alongCutRefused ${tk}: \`kind\` is ${JSON.stringify(r.kind)} and re-derived from ` +
                `this room's own board it is "${wantKind}"${
                  wantKind === "seat"
                    ? ` — the run tile carries a container, and that is what makes the refusal a seat ` +
                      `refusal rather than a search result`
                    : ` — that is the answer its own sentence gives`
                }. The class is the field the fleet census counts ("27 refusals = 16 breaks-network + 7 ` +
                `no-parallel + 4 seat"), so a mislabelled one moves a headline figure without touching a tile`,
            );
          }
          // ---- `offered`: present on the branch that offers, and the tiles the
          // sentence itself names.
          const off = r.offered;
          if (off !== undefined && !Array.isArray(off)) {
            bad2.push(`meta.walls.alongCutRefused ${tk}: \`offered\` is ${String(JSON.stringify(off)).slice(0, 40)}, not a list of tiles`);
          } else if (Array.isArray(off)) {
            if (wantKind === "no-parallel") {
              bad2.push(
                `meta.walls.alongCutRefused ${tk}: the refusal is "no interior parallel exists" and it ` +
                  `publishes an \`offered\` list of ${off.length} tile(s). A refusal that rejected every ` +
                  `neighbour before the swap was tried offered the swap to nothing`,
              );
            }
            for (const t of off) {
              if (!t || !Number.isInteger(t.x) || !Number.isInteger(t.y)) {
                bad2.push(`meta.walls.alongCutRefused ${tk}: \`offered\` carries an entry that names no tile`);
                continue;
              }
              const ok2 = key(t.x, t.y);
              if (Math.max(Math.abs(t.x - r.x), Math.abs(t.y - r.y)) !== 1) {
                bad2.push(
                  `meta.walls.alongCutRefused ${tk}: \`offered\` names ${ok2}, which is not a D8 neighbour ` +
                    `of the run tile — the swap moves a road ONE tile inboard`,
                );
              }
              if (t.x < 1 || t.y < 1 || t.x > 48 || t.y > 48 || !walkable(terrain, t.x, t.y)) {
                bad2.push(
                  `meta.walls.alongCutRefused ${tk}: \`offered\` names ${ok2}, which is not a tile a road ` +
                    `can stand on`,
                );
              }
              if (cutK2.has(ok2)) {
                bad2.push(
                  `meta.walls.alongCutRefused ${tk}: \`offered\` names ${ok2}, which is itself a cut tile — ` +
                    `the same problem one tile over, and never a candidate the swap was put to`,
                );
              }
            }
            // ...AND ON THE NETWORK BRANCH THE TWO CHANNELS ARE ONE LIST. The
            // sentence says "moving it to X,Y — <what it costs the network>" for
            // each candidate; `offered` is that same set, structured.
            if (wantKind === "breaks-network") {
              const inWhy = [...why.matchAll(/moving it to (-?\d+),(-?\d+) —/g)].map((m) => key(Number(m[1]), Number(m[2]))).sort();
              const got = off.filter((t) => t && Number.isInteger(t.x)).map((t) => key(t.x, t.y)).sort();
              if (inWhy.join(" ") !== got.join(" ")) {
                bad2.push(
                  `meta.walls.alongCutRefused ${tk}: \`offered\` is [${got.join(" ") || "nothing"}] and the ` +
                    `refusal's own sentence prices the swap to [${inWhy.join(" ") || "nothing"}]. One pass ` +
                    `made one set of offers`,
                );
              }
            }
          } else if (wantKind === "breaks-network") {
            bad2.push(
              `meta.walls.alongCutRefused ${tk}: the refusal says every interior parallel breaks the ` +
                `network and publishes no \`offered\` list. The whole content of that answer is WHICH ` +
                `tiles were offered the swap`,
            );
          }
        }
      }
      // ---- the scope, which is the roster this whole audit ran over ---------
      const scope = plan.meta?.walls?.alongCutScope;
      if (scope !== undefined || Array.isArray(plan.meta?.walls?.alongCutRuns)) {
        const WANT_SCOPE = "every tile carrying a road and a rampart";
        if (scope !== WANT_SCOPE) {
          bad2.push(
            `meta.walls.alongCutScope is ${JSON.stringify(scope)} and this file audits the along-cut pass ` +
              `over "${WANT_SCOPE}" — the WHOLE wall, which is what round 14 widened it to when the D4 ` +
              `cut-only roster turned out to miss runs under seat, ring and cover ramparts. The scope ` +
              `string is the producer's statement of what it walked; a narrower one is a smaller roster ` +
              `with every refusal in it still checking out`,
          );
        }
      }
      // ---- conductBridge.relaid: a tile the bridge brought BACK -------------
      //
      // The RCL-deferred conduct join runs in finalizeRoom, after the wall-road
      // planner has returned, and it can put a road back on a tile an earlier
      // layer laid and a later pass deleted. `relaid` is where it says so, and
      // it was published and unread. What makes an entry true is three things
      // at once: the tile is one the bridge added, the room ships a road there
      // today, and `wasLayer` names the layer that laid it BEFORE — which is a
      // layer earlier than the bridge's own.
      const cb = plan.meta?.walls?.conductBridge;
      if (cb && typeof cb === "object") {
        const addedK = new Set((cb.added || []).filter((t) => t && Number.isInteger(t.x)).map((t) => key(t.x, t.y)));
        const rl = cb.relaid;
        if (rl !== undefined && !Array.isArray(rl)) {
          bad2.push(`meta.walls.conductBridge.relaid is ${String(JSON.stringify(rl)).slice(0, 40)}, not a list`);
        }
        for (const t of Array.isArray(rl) ? rl : []) {
          if (!t || !Number.isInteger(t.x) || !Number.isInteger(t.y)) {
            bad2.push(`meta.walls.conductBridge.relaid carries an entry that names no tile`);
            continue;
          }
          const tk = key(t.x, t.y);
          if (!addedK.has(tk)) {
            bad2.push(
              `meta.walls.conductBridge.relaid says ${tk} was a road the bridge put BACK and ` +
                `\`conductBridge.added\` does not name it. Re-laying is a subset of laying`,
            );
          }
          if (!roadSet.has(tk)) {
            bad2.push(`meta.walls.conductBridge.relaid says ${tk} was re-laid and the room ships no road there`);
          }
          if (plan.meta?.walls?.roadKind && plan.meta.walls.roadKind[tk] !== "conductBridge") {
            bad2.push(
              `meta.walls.conductBridge.relaid says ${tk} was re-laid by the bridge and its provenance on ` +
                `the shipped board is ${JSON.stringify(plan.meta.walls.roadKind[tk])}`,
            );
          }
          const now = plan.meta?.roadLayer?.[tk];
          if (!Number.isInteger(t.wasLayer)) {
            bad2.push(
              `meta.walls.conductBridge.relaid ${tk}: \`wasLayer\` is ${JSON.stringify(t.wasLayer)}. The ` +
                `whole claim is that an EARLIER layer had this tile, and the layer is the claim`,
            );
          } else if (Number.isInteger(now) && t.wasLayer >= now) {
            bad2.push(
              `meta.walls.conductBridge.relaid ${tk}: \`wasLayer\` says layer ${t.wasLayer} laid it before ` +
                `and \`meta.roadLayer\` says layer ${now} owns it now. A tile re-laid by the bridge was ` +
                `laid by a layer that ran BEFORE the bridge`,
            );
          }
        }
        // ...and the other direction: a tile the bridge added that some earlier
        // layer had, and which `relaid` does not name, is the same omission the
        // other way round. `meta.roadLayer` is written per tile as each layer's
        // roads land and is only ever deleted by the lab layer, so a tile the
        // bridge added and which carries an earlier layer's tag in `roadKind`'s
        // sibling map is exactly the shape `relaid` exists to record.
        for (const t of cb.added || []) {
          if (!t || !Number.isInteger(t.x)) continue;
          const tk = key(t.x, t.y);
          if (Array.isArray(rl) && rl.some((q) => q && key(q.x, q.y) === tk)) continue;
          const lay = plan.meta?.roadLayer?.[tk];
          if (Number.isInteger(lay) && plan.meta?.walls?.roadKind?.[tk] !== "conductBridge") {
            bad2.push(
              `meta.walls.conductBridge.added names ${tk} and its provenance on the shipped board is ` +
                `${JSON.stringify(plan.meta.walls.roadKind?.[tk])} — the bridge is recorded as having laid ` +
                `a tile some other pass owns`,
            );
          }
        }
      }
      for (const b of bad2) {
        fails.push(
          `META — ${b}. The along-cut pass moves a prepared surface off the exact line an attacker wants ` +
            `to walk; its refusals are the record of every run it could not move, and its scope is the ` +
            `roster it looked at.`,
        );
      }
    }

    // ==================================================================
    // `meta.towers.adjacency` — THE TOWER-ADJACENCY PRIOR, READ.
    //
    // Round 14 taught layer 3 that two towers on adjacent tiles are one nuke,
    // and gave the refill-repair pass permission to CROSS that prior once a
    // room is over the hard refill ceiling. The whole record of that decision —
    // how many adjacent pairs the room ships, which tiles they are, which
    // crossings were taken, what each crossing bought, and what the room gave
    // up in wall damage to keep the prior — was published in `meta.towers
    // .adjacency` and read by NOTHING. Nine mutations escaped: falsify
    // `satAcrossPrior.held`, `.reachable` or `.forgone`; delete the whole
    // `satAcrossPrior` subobject; delete `adjacency` outright; flip
    // `priorHeld`; empty `pairs`/`pairTiles`; empty `crossings`; falsify a
    // crossing's `refillTo`. Criticism 34 quotes this record's `forgone` sum
    // as a fleet figure in the goal document.
    //
    // Every one of those is derived from the board here, and the object is
    // REQUIRED — layer 3 writes it for all 172 rooms, so a room without one is
    // a room that dropped the record rather than a room with nothing to say.
    // ==================================================================
    {
      const adj = plan.meta?.towers?.adjacency;
      if (!adj || typeof adj !== "object") {
        fails.push(
          `META — meta.towers.adjacency is ${adj === undefined ? "ABSENT" : "not an object"}. It is the ` +
            `record of the tower-adjacency prior: how many adjacent tower pairs the room ships, which ` +
            `crossings of the prior the refill-repair pass was allowed to make, and how much wall damage ` +
            `keeping the prior cost. Layer 3 writes it for every room, the goal document quotes its ` +
            `\`forgone\` sum as a fleet figure, and a room that ships without one has withdrawn the ` +
            `record rather than had nothing to record.`,
        );
      } else {
        const bad2 = [];
        const towers = (s.tower || []).slice();
        // ---- pairs / pairTiles: adjacency is a fact about six tiles --------
        const wantPairs = [];
        for (let i = 0; i < towers.length; i++) {
          for (let j = i + 1; j < towers.length; j++) {
            if (chebyshev(towers[i], towers[j]) === 1) wantPairs.push([towers[i], towers[j]]);
          }
        }
        const pairKey = (a, b) => [key(a.x, a.y), key(b.x, b.y)].sort().join("~");
        const wantK = wantPairs.map(([a, b]) => pairKey(a, b)).sort();
        if (adj.pairs !== wantK.length) {
          bad2.push(
            `\`pairs\` says ${JSON.stringify(adj.pairs)} and ${wantK.length} pair(s) of this room's six ` +
              `towers stand at chebyshev 1 on the board it ships`,
          );
        }
        const gotK = (Array.isArray(adj.pairTiles) ? adj.pairTiles : [])
          .filter((p) => Array.isArray(p) && p.length === 2 && p[0] && Number.isInteger(p[0].x))
          .map(([a, b]) => pairKey(a, b))
          .sort();
        if (gotK.join(" ") !== wantK.join(" ")) {
          bad2.push(
            `\`pairTiles\` names [${gotK.join(" ") || "nothing"}] and the adjacent tower pairs this room ` +
              `ships are [${wantK.join(" ") || "nothing"}]`,
          );
        }
        // ---- priorHeld: derived, not asserted -----------------------------
        //
        // The prior is HELD when the room ships no adjacent pair. A room with
        // pairs on the board held nothing, whatever the flag says, and E2S8 —
        // the fleet's one crossing — is the room that proves the difference
        // matters: it is the only `priorHeld: false` in 172.
        const wantHeld = wantK.length === 0;
        if (typeof adj.priorHeld !== "boolean") {
          bad2.push(`\`priorHeld\` is ${JSON.stringify(adj.priorHeld)}, not a boolean`);
        } else if (adj.priorHeld !== wantHeld) {
          bad2.push(
            `\`priorHeld\` says ${adj.priorHeld} and the room ships ${wantK.length} adjacent tower ` +
              `pair(s)${wantK.length ? ` (${wantK.join(" ")})` : ""}. The prior is held exactly when no ` +
              `two towers are neighbours`,
          );
        }
        // ---- crossings: a crossing produced an adjacent pair --------------
        if (!Array.isArray(adj.crossings)) {
          bad2.push(`\`crossings\` is ${adj.crossings === undefined ? "ABSENT" : "not an array"}`);
        } else {
          if (adj.crossings.length && wantK.length === 0) {
            bad2.push(
              `\`crossings\` records ${adj.crossings.length} crossing(s) of the adjacency prior and no two ` +
                `of this room's towers are neighbours. A crossing that left no adjacent pair did not cross`,
            );
          }
          // ...AND THE OTHER DIRECTION, WHICH IS THE ONE THAT MATTERS. A room
          // shipping an adjacent tower pair CROSSED the prior, and the crossing
          // is the record of what it bought — which pass took it and how much
          // refill walk it saved. An empty list on such a room is a prior
          // silently abandoned: the whole point of the round-14 rule is that
          // the crossing has to be paid for out loud.
          // ...AND ROUND 16 ADDED A SECOND PASS THAT MAY CROSS THE PRIOR.
          // `maybeTakeTowerSwap` runs after finalizeRoom, re-composes the room
          // with a layer-3 offer and keeps it only if twelve as-built
          // instruments all hold — which is precisely the "pay for the crossing
          // out loud" the rule below demands, in a different record. So a pair
          // created BY THE TAKE is explained by the take, and a pair that is
          // not is still an abandoned prior. The take is not a blanket excuse:
          // every unexplained pair still fails, and the take's own destination
          // has to be a tower this room ships.
          const takeTo =
            plan.meta?.towers?.acrossPriorTake?.taken && Number.isInteger(plan.meta.towers.acrossPriorTake.taken.to?.x)
              ? key(plan.meta.towers.acrossPriorTake.taken.to.x, plan.meta.towers.acrossPriorTake.taken.to.y)
              : null;
          const explainedByTake = (pk) => takeTo !== null && pk.split("~").includes(takeTo);
          const unexplained = wantK.filter((pk) => !explainedByTake(pk));
          if (!adj.crossings.length && unexplained.length > 0) {
            bad2.push(
              `this room ships ${wantK.length} adjacent tower pair(s) (${wantK.join(" ")}) and \`crossings\` ` +
                `is empty${takeTo ? `, and ${unexplained.length} of them (${unexplained.join(" ")}) do not touch the tile the across-prior take moved a tower to (${takeTo})` : ""}. ` +
                `Two towers on neighbouring tiles are one nuke; a pass is only allowed to put them there ` +
                `by CROSSING the adjacency prior, and a crossing with no record is the prior abandoned ` +
                `rather than spent`,
            );
          }
          // ==========================================================
          // ROUND 17 / O6 — COMPLETENESS, NOT "AT LEAST ONE".
          // ==========================================================
          // The rule above fires only when `crossings` is EMPTY, so a room
          // could record one crossing and leave the rest of its adjacent
          // pairs unaccounted for — which is what E3S1 and E4S3 did last
          // round with the take's readings living in `acrossPriorTake` and
          // adjacency's own contract ("every crossing with the readings it
          // proved") unmet. Every pair the BOARD carries must touch the
          // destination of some recorded crossing, or the take's.
          {
            const dests = new Set();
            if (takeTo !== null) dests.add(takeTo);
            for (const c of adj.crossings) {
              if (c && c.to && Number.isInteger(c.to.x)) dests.add(key(c.to.x, c.to.y));
            }
            const orphanPairs = wantK.filter((pk) => !pk.split("~").some((t2) => dests.has(t2)));
            if (orphanPairs.length) {
              bad2.push(
                `this room ships ${orphanPairs.length} adjacent tower pair(s) (${orphanPairs.join(" ")}) ` +
                  `that no recorded crossing reaches — the crossings this room DOES record land on ` +
                  `${dests.size ? [...dests].join(" ") : "nothing"}. "Every crossing with the readings it ` +
                  `proved" is a completeness claim: one recorded crossing used to satisfy it for any number ` +
                  `of pairs, so a second pass could put two towers together and file nothing`,
              );
            }
          }
          if (takeTo !== null && !towers.some((t) => key(t.x, t.y) === takeTo)) {
            bad2.push(
              `\`acrossPriorTake.taken\` says a tower moved to ${takeTo} and this room ships no tower ` +
                `there. The take is the record that explains the adjacency this room's crossings list ` +
                `does not, so a take whose destination is empty explains nothing`,
            );
          }
          const towerK = new Set(towers.map((t) => key(t.x, t.y)));
          for (const c of adj.crossings) {
            if (!c || typeof c !== "object") {
              bad2.push(`\`crossings\` carries an entry that is not an object (${JSON.stringify(c)})`);
              continue;
            }
            const ck = c.to && Number.isInteger(c.to.x) ? key(c.to.x, c.to.y) : null;
            if (!ck) {
              bad2.push(`a crossing names no destination tile (${String(JSON.stringify(c)).slice(0, 70)})`);
              continue;
            }
            // THE DESTINATION IS ON THE BOARD. A crossing is a tower that moved
            // onto a tile adjacent to another tower; if the room does not ship a
            // tower there, the move it records did not happen.
            if (!towerK.has(ck)) {
              bad2.push(
                `a crossing says the refill pass moved a tower to ${ck} and this room ships no tower ` +
                  `there. The crossing is what bought the adjacency; a destination with no tower on it is ` +
                  `a move nothing took`,
              );
            } else if (!wantK.some((k2) => k2.split("~").includes(ck))) {
              bad2.push(
                `a crossing says the pass crossed the adjacency prior to reach ${ck} and the tower there ` +
                  `has no neighbour. Crossing the prior means landing next to another tower`,
              );
            }
            if (c.from && Number.isInteger(c.from.x) && towerK.has(key(c.from.x, c.from.y))) {
              bad2.push(
                `a crossing says a tower LEFT ${key(c.from.x, c.from.y)} and this room ships a tower there`,
              );
            }
            // ...AND WHAT IT BOUGHT. `refillTo` is the furthest refill walk
            // AFTER the crossing, which is the walk the room ships — re-derived
            // tile by tile in the battery block above.
            if (typeof c.refillTo === "number" && batteryDerived) {
              if (c.refillTo !== batteryDerived.maxRefill) {
                bad2.push(
                  `a crossing says it took the furthest refill walk to ${c.refillTo} and the walk this ` +
                    `room actually ships, re-derived tile by tile, is ${batteryDerived.maxRefill}. The ` +
                    `crossing is the LAST thing that moves a tower, so its "after" reading is the board`,
                );
              }
              if (typeof c.refillFrom === "number" && c.refillFrom <= c.refillTo) {
                bad2.push(
                  `a crossing is recorded as taking the refill walk from ${c.refillFrom} to ${c.refillTo}. ` +
                    `The pass is only allowed to cross the adjacency prior to SHORTEN the walk`,
                );
              }
            }
          }
        }
        // ---- satAcrossPrior: the wall damage the prior cost, on the SHIPPED
        // board. Round 15 rebound `held` from layer 3's cut to the one that
        // ships; this is the re-derivation that keeps it there.
        const sap = adj.satAcrossPrior;
        if (!sap || typeof sap !== "object") {
          bad2.push(
            `\`satAcrossPrior\` is ${sap === undefined ? "ABSENT" : "not an object"} — it is the record ` +
              `criticism 34's fleet figure is summed out of`,
          );
        } else {
          const MIN_SAT = 3600;
          const cutPts = (plan.meta?.shell?.cut || []).map((c) => ({ x: c.x, y: c.y }));
          const dmg = (a, b) => {
            const r = chebyshev(a, b);
            return r <= 5 ? 600 : r >= 20 ? 150 : 600 - (r - 5) * 30;
          };
          const faceOver = (set2, c) => set2.reduce((sum, t) => sum + dmg(t, c), 0);
          const minFace = (set2) => (cutPts.length ? Math.min(...cutPts.map((c) => faceOver(set2, c))) : 0);
          const cap = (v) => Math.min(v, MIN_SAT);
          const wantHeldSat = cap(minFace(towers));
          // the offer, re-read on the SHIPPED wall: the layer-3 search's own
          // seat swapped in for the tower it would have displaced
          let wantOffer = null;
          if (sap.seat && Number.isInteger(sap.seat.x) && sap.leaves && Number.isInteger(sap.leaves.x)) {
            const leaveK = key(sap.leaves.x, sap.leaves.y);
            if (towers.some((t) => key(t.x, t.y) === leaveK)) {
              const swapped = towers.map((t) => (key(t.x, t.y) === leaveK ? { x: sap.seat.x, y: sap.seat.y } : t));
              wantOffer = cap(minFace(swapped));
            }
          }
          const wantReach = wantOffer !== null && wantOffer > wantHeldSat ? wantOffer : wantHeldSat;
          const cmp = (f, want) => {
            if (sap[f] === undefined) {
              bad2.push(`\`satAcrossPrior.${f}\` is absent`);
            } else if (sap[f] !== want) {
              bad2.push(
                `\`satAcrossPrior.${f}\` says ${JSON.stringify(sap[f])} and re-derived over this room's ` +
                  `SHIPPED wall (${cutPts.length} cut tile(s)) and SHIPPED battery (${towers.length} ` +
                  `tower(s)) with the engine's own falloff it is ${JSON.stringify(want)}`,
              );
            }
          };
          cmp("held", wantHeldSat);
          cmp("offerOnShipped", wantOffer);
          cmp("reachable", wantReach);
          cmp("forgone", wantReach - wantHeldSat);
          // THE IDENTITY THE FIELD DOC IS BUILT ON. `reachable` is the better of
          // the two readings, so the gap can never be negative — a negative
          // `forgone` is the record saying the room gave up damage by keeping
          // the wall it built.
          if (typeof sap.forgone === "number" && sap.forgone < 0) {
            bad2.push(`\`satAcrossPrior.forgone\` is ${sap.forgone} — it is reachable minus held and reachable is the larger of the two by construction`);
          }
          if (typeof sap.held === "number" && typeof sap.reachable === "number" && typeof sap.forgone === "number") {
            if (sap.reachable - sap.held !== sap.forgone) {
              bad2.push(
                `\`satAcrossPrior\` publishes held ${sap.held}, reachable ${sap.reachable} and forgone ` +
                  `${sap.forgone}; the gap is ${sap.reachable - sap.held}`,
              );
            }
          }
          // ...and `held` is the same measurement `shippedMinShellDmg` is,
          // capped at saturation. Two publications of one number.
          const pubShip = plan.meta?.towers?.shippedMinShellDmg;
          if (typeof pubShip === "number" && typeof sap.held === "number" && sap.held !== cap(pubShip)) {
            bad2.push(
              `\`satAcrossPrior.held\` says ${sap.held} and \`meta.towers.shippedMinShellDmg\` says ` +
                `${pubShip} (${cap(pubShip)} at the saturation ceiling). This is the field round 15 ` +
                `rebound from layer 3's board to the shipped one; they are one measurement`,
            );
          }
          // ---- atLayer3: the reading the refusal was actually made on. It is
          // layer 3's own, and layer 3 publishes it unconditionally.
          const a3 = sap.atLayer3;
          if (!a3 || typeof a3 !== "object") {
            bad2.push(
              `\`satAcrossPrior.atLayer3\` is ${a3 === undefined ? "ABSENT" : "not an object"} — it is the ` +
                `board the search that produced this record could see, and without it the shipped reading ` +
                `is a measurement with no decision attached`,
            );
          } else {
            // THE MIRROR, AND THE ONE PASS THAT MOVES THE BOARD UNDER IT.
            // `atLayer3.held` is layer 3's reading and `meta.towers.
            // minShellDmg` is layer 3's publication of the same number — one
            // measurement, two places, which is the whole point of the mirror.
            // Round 16's across-prior take re-composes the room AFTER layer 3,
            // so in the rooms where a swap was TAKEN `minShellDmg` is the
            // post-take reading and the mirror would be comparing two boards.
            // It is not dropped there: it is re-pointed at the take's own
            // BEFORE panel, and the take's AFTER panel is required to be the
            // post-take publication. Two extra equalities, not one fewer.
            const pubL3 = plan.meta?.towers?.minShellDmg;
            const take = plan.meta?.towers?.acrossPriorTake;
            const tookIt = !!(take && take.taken);
            const l3Face = tookIt && typeof take.before?.face === "number" ? take.before.face : pubL3;
            if (typeof l3Face === "number" && typeof a3.held === "number" && a3.held !== l3Face) {
              bad2.push(
                `\`satAcrossPrior.atLayer3.held\` says ${a3.held} and ` +
                  `${tookIt ? "`acrossPriorTake.before.face` — the reading this room had before the swap it took" : "`meta.towers.minShellDmg` — layer 3's own reading of the same wall"} ` +
                  `— says ${l3Face}`,
              );
            }
            if (tookIt && typeof take.after?.face === "number" && typeof pubL3 === "number" && take.after.face !== pubL3) {
              bad2.push(
                `\`acrossPriorTake.after.face\` says ${take.after.face} and \`meta.towers.minShellDmg\` — ` +
                  `re-read after the swap was applied — says ${pubL3}. The take publishes the panel it ` +
                  `decided on; a panel that does not end where the board ends is a decision about a ` +
                  `different room`,
              );
            }
            if (typeof a3.reachable === "number" && typeof a3.held === "number" && typeof a3.forgone === "number") {
              if (a3.reachable - a3.held !== a3.forgone) {
                bad2.push(
                  `\`satAcrossPrior.atLayer3\` publishes held ${a3.held}, reachable ${a3.reachable} and ` +
                    `forgone ${a3.forgone}; the gap is ${a3.reachable - a3.held}`,
                );
              }
              if (a3.forgone < 0) bad2.push(`\`satAcrossPrior.atLayer3.forgone\` is ${a3.forgone}`);
            }
          }
          // ---- and the search census that produced the offer ----------------
          if (typeof sap.tried === "number" && sap.tried < 0) bad2.push(`\`satAcrossPrior.tried\` is ${sap.tried}`);
          if (typeof sap.crossOffered === "number" && typeof sap.tried === "number" && sap.crossOffered > sap.tried) {
            bad2.push(
              `\`satAcrossPrior.crossOffered\` is ${sap.crossOffered} of ${sap.tried} swap(s) examined — ` +
                `every offer across the prior is one of the swaps that was looked at`,
            );
          }
          // a seat with no tile to leave, or a tile to leave that is not a
          // tower, is an offer that was never on the board
          if ((sap.seat === null) !== (sap.leaves === null)) {
            bad2.push(
              `\`satAcrossPrior\` names seat ${JSON.stringify(sap.seat)} and leaves ` +
                `${JSON.stringify(sap.leaves)} — the offer is a tower moving from one tile to another, so ` +
                `either both are tiles or neither is`,
            );
          }
          if (sap.seat && Number.isInteger(sap.seat.x) && !walkable(terrain, sap.seat.x, sap.seat.y)) {
            bad2.push(`\`satAcrossPrior.seat\` names ${sap.seat.x},${sap.seat.y}, which is not a buildable tile of this room`);
          }
          // ==============================================================
          // ROUND 17 / F4 — THE SEAT'S OCCUPANCY IS A FACT ABOUT THE BOARD,
          // AND IT WAS NEVER READ OFF ONE.
          // ==============================================================
          // `seatOccupancy` decides which of the two `forgone` figures the
          // room's refusal is charged to: a seat standing EMPTY means the
          // adjacency prior is what the room gave the damage up for, and a
          // seat with something on it means the occupant is. Until round 17
          // the only gate on all three fields was `renderSatBasis` string
          // equality — a pure function of the record itself — so the record
          // and its own sentence agreed about anything. All NINE occupied
          // seats in the fleet could declare themselves FREE and pass, which
          // turns the goal document's `forgoneToPrior 0 / forgoneToOccupant
          // 270` into `270 / 0` with the sentence regenerated to say it: the
          // exact inversion of criticism 34's closing claim. The reverse
          // walked too (E21S8's genuinely free seat claiming a nuker).
          //
          // It is `plan.structures`. Read it.
          if (sap.seat && Number.isInteger(sap.seat.x) && Number.isInteger(sap.seat.y)) {
            const occ = sap.seatOccupancy;
            const kinds = Array.isArray(occ && occ.counted) ? occ.counted : SAT_SEAT_KINDS;
            const onHere = SAT_SEAT_KINDS.filter((t) =>
              (s[t] || []).some((q) => q.x === sap.seat.x && q.y === sap.seat.y),
            );
            if (!occ || typeof occ !== "object") {
              bad2.push(
                `\`satAcrossPrior.seatOccupancy\` is ${occ === undefined ? "ABSENT" : String(JSON.stringify(occ)).slice(0, 40)} ` +
                  `and the seat this record names carries ${onHere.length ? onHere.join("+") : "nothing"} on ` +
                  `the board this room ships. Which of the two \`forgone\` figures the refusal is charged to ` +
                  `is decided by this field`,
              );
            } else {
              const missKind = SAT_SEAT_KINDS.filter((t) => !kinds.includes(t));
              if (missKind.length) {
                bad2.push(
                  `\`satAcrossPrior.seatOccupancy.counted\` omits ${missKind.join(", ")} — the inventory a ` +
                    `seat is called FREE against has to be every structure kind that can stand on a tile, ` +
                    `or "free" means "free of the kinds we looked for"`,
                );
              }
              if (occ.x !== sap.seat.x || occ.y !== sap.seat.y) {
                bad2.push(
                  `\`satAcrossPrior.seatOccupancy\` is about ${occ.x},${occ.y} and the seat is ` +
                    `${sap.seat.x},${sap.seat.y} — an occupancy reading of a different tile`,
                );
              }
              if (JSON.stringify((occ.on || []).slice().sort()) !== JSON.stringify(onHere.slice().sort())) {
                bad2.push(
                  `\`satAcrossPrior.seatOccupancy.on\` says ${String(JSON.stringify(occ.on)).slice(0, 60)} and ` +
                    `${sap.seat.x},${sap.seat.y} carries ${onHere.length ? onHere.join("+") : "nothing"} on the ` +
                    `board this room ships`,
                );
              }
              if (occ.free !== (onHere.length === 0)) {
                bad2.push(
                  `\`satAcrossPrior.seatOccupancy.free\` says ${JSON.stringify(occ.free)} and the seat ` +
                    `${sap.seat.x},${sap.seat.y} carries ${onHere.length ? onHere.join("+") : "nothing"}`,
                );
              }
              // ...and the two sums the fleet figure is made of follow from it
              const gap = typeof sap.reachable === "number" && typeof sap.held === "number" ? sap.reachable - sap.held : null;
              if (gap !== null) {
                const wantPrior = onHere.length === 0 ? gap : 0;
                const wantOcc = onHere.length === 0 ? 0 : gap;
                if (sap.forgoneToPrior !== wantPrior || sap.forgoneToOccupant !== wantOcc) {
                  bad2.push(
                    `\`satAcrossPrior\` charges ${JSON.stringify(sap.forgoneToPrior)} of the forgone damage to ` +
                      `the adjacency prior and ${JSON.stringify(sap.forgoneToOccupant)} to the seat's occupant; ` +
                      `the gap between reachable and held is ${gap} and the seat ` +
                      `${onHere.length ? `carries ${onHere.join("+")}, so all of it is the OCCUPANT's` : `stands EMPTY, so all of it is the PRIOR's`}. ` +
                      `The split is the whole of the fleet figure the goal document quotes (0 / 270)`,
                  );
                }
              }
            }
          }
          // ==============================================================
          // M5. `basis` WAS A LENGTH CHECK: `typeof === "string" &&
          // trim().length >= 40`. A 200-character basis asserting the exact
          // OPPOSITE — which board each reading is on — passed, in the one
          // field whose entire job is to stop a reader mixing two boards.
          // A shape gate on the sentence that disambiguates two numbers is
          // the same defect as a shape gate on the numbers.
          //
          // The producer generates it now (`renderSatBasis` in
          // declprose-towers.mjs, a pure function of `atLayer3`, `held`,
          // `offerOnShipped`, `reachable`, `forgone`, `seat`, `leaves` and
          // `seatOccupancy`), so the gate is the declaration-prose gate:
          // re-render from the record this plan publishes and require
          // equality. The sentence cannot say something the record does not.
          // ==============================================================
          {
            let wantBasis = null;
            let renderErr = null;
            try {
              wantBasis = renderSatBasis(sap);
            } catch (err) {
              renderErr = err && err.message ? err.message : String(err);
            }
            if (renderErr) {
              bad2.push(
                `\`satAcrossPrior\` cannot be rendered into its own basis sentence (${renderErr}) — a ` +
                  `record the shared template throws on is a record missing a field the sentence is made of`,
              );
            } else if (normText(String(sap.basis)) !== normText(wantBasis)) {
              const a = normText(String(sap.basis));
              const b3 = normText(wantBasis);
              let ci = 0;
              while (ci < a.length && ci < b3.length && a[ci] === b3[ci]) ci++;
              bad2.push(
                `\`satAcrossPrior.basis\` is not the sentence this record generates. They agree for ${ci} ` +
                  `character(s) and then diverge — shipped: "…${a.slice(Math.max(0, ci - 40), ci + 90)}…" vs ` +
                  `generated: "…${b3.slice(Math.max(0, ci - 40), ci + 90)}…". Until round 16 the only gate ` +
                  `on this field was that it was a string of at least 40 characters, so a 200-character ` +
                  `basis asserting the OPPOSITE of which board each reading is on passed 172/172`,
              );
            }
          }
          if (typeof sap.basis !== "string" || sap.basis.trim().length < 40) {
            bad2.push(
              `\`satAcrossPrior.basis\` is ${String(JSON.stringify(sap.basis)).slice(0, 40)} — the record publishes ` +
                `two readings of the same quantity on two different boards, and the sentence saying WHICH ` +
                `board each one is on is what stops a reader mixing them (which is exactly what produced ` +
                `criticism 34's wrong fleet figure)`,
            );
          }
        }
        for (const b of bad2) {
          fails.push(
            `META — meta.towers.adjacency: ${b}. The adjacency prior is the reason this room's towers ` +
              `stand where they do, and its record was published unread for a whole round.`,
          );
        }
      }
    }

    // ==================================================================
    // THE LATE-ROAD BOOKS, PER KIND, FOR ALL SEVEN KINDS.
    //
    // The spur reconciliation above is one kind of seven, and it was the only
    // one with a reader. `laidByKind` / `shippedByKind` / `lostByKind` /
    // `laidTilesByKind` were published for every room and read by nothing:
    // reflow shipped `laid 0 / shipped 20 / lost 5` across seven rooms (the
    // reflow pass never recorded what it laid), E18S8 shipped `swampPave laid 3
    // / shipped 2 / lost 0` with the missing tile unnamed, and conductBridge's
    // three tiles were in neither map. That is the reader-facing truth channel
    // for the whole late-road pass, and it did not add up.
    //
    // THE IDENTITY, per kind, per room: what the pass LAID is what SHIPS plus
    // what a later pass TOOK, the laid tile list is exactly that long, and the
    // shipped count is a count of the provenance map — not a second opinion
    // about it. Every kind, including the ones with nothing to say: an identity
    // that is only checked where it is interesting is an identity nobody tests.
    // ==================================================================
    {
      const W2 = plan.meta?.walls || {};
      const rk = W2.roadKind;
      const laidByKind = W2.laidByKind;
      const shippedByKind = W2.shippedByKind;
      const lostByKind = W2.lostByKind;
      const laidTilesByKind = W2.laidTilesByKind;
      const missing = [];
      for (const [n, v] of [
        ["laidByKind", laidByKind],
        ["shippedByKind", shippedByKind],
        ["lostByKind", lostByKind],
        ["laidTilesByKind", laidTilesByKind],
      ]) {
        if (!v || typeof v !== "object" || Array.isArray(v)) missing.push(n);
      }
      if (missing.length) {
        fails.push(
          `META — meta.walls.${missing.join(", meta.walls.")} ${missing.length > 1 ? "are" : "is"} absent ` +
            `or not an object. These are the per-kind books for every road the late layer lays: what each ` +
            `pass laid, what survives on the board, and which tiles a later pass took. They are the ` +
            `reader-facing account of the difference between "375 rampart spurs" and the 370 the room ` +
            `ships, and a missing book is a pass with no account at all.`,
        );
      } else if (rk && typeof rk === "object" && !Array.isArray(rk)) {
        const bad2 = [];
        const kinds = [
          ...new Set([
            ...Object.keys(laidByKind),
            ...Object.keys(shippedByKind),
            ...Object.keys(lostByKind),
            ...Object.keys(laidTilesByKind),
            ...Object.values(rk).filter((v) => typeof v === "string"),
          ]),
        ].sort();
        // THE BOOKS COVER THE SAME SET OF PASSES. A kind in one book and not
        // another is the shape reflow and conductBridge shipped in.
        for (const k2 of kinds) {
          for (const [n, v] of [
            ["laidByKind", laidByKind],
            ["shippedByKind", shippedByKind],
            ["lostByKind", lostByKind],
            ["laidTilesByKind", laidTilesByKind],
          ]) {
            if (!(k2 in v)) {
              bad2.push(
                `"${k2}" is a late-road kind this room knows about and \`${n}\` has no entry for it. All ` +
                  `four books are seeded with every pass, so a missing key is a pass that kept no account`,
              );
            }
          }
        }
        for (const k2 of kinds) {
          const laid = laidByKind[k2];
          const shipped = shippedByKind[k2];
          const lost = lostByKind[k2];
          const tiles = laidTilesByKind[k2];
          const onBoard = Object.keys(rk).filter((t) => rk[t] === k2);
          if (typeof shipped === "number" && shipped !== onBoard.length) {
            bad2.push(
              `\`shippedByKind.${k2}\` says ${shipped} and ${onBoard.length} tile(s) on the board this room ` +
                `ships carry the "${k2}" provenance. The shipped count is a count of the map beside it`,
            );
          }
          const lostK = Array.isArray(lost)
            ? [...new Set(lost.filter((t) => t && Number.isInteger(t.x)).map((t) => key(t.x, t.y)))]
            : null;
          if (lost !== undefined && lostK === null) {
            bad2.push(`\`lostByKind.${k2}\` is ${String(JSON.stringify(lost)).slice(0, 40)}, not a list of tiles`);
          }
          if (typeof laid === "number" && typeof shipped === "number" && lostK !== null) {
            if (laid !== shipped + lostK.length) {
              bad2.push(
                `\`${k2}\`: the pass laid ${laid} tile(s), ${shipped} ship with its provenance and ` +
                  `\`lostByKind\` names ${lostK.length}. What a pass laid is what survives plus what a ` +
                  `later pass took, tile by tile — a difference the room does not name makes the laid ` +
                  `figure a claim about a board nobody shipped`,
              );
            }
          }
          // m6 (1). A LAID TILE IS A TILE. The books were free to name
          // anything: a fabricated 40-tile "reflow" (laid 40 = shipped 0 + lost
          // 40) with invented coordinates passed, and so did lost tiles at
          // (-9,-9). A road pass lays roads on walkable floor inside the room,
          // and that is checkable without knowing anything about the pass.
          for (const t of Array.isArray(tiles) ? tiles : []) {
            if (!t || !Number.isInteger(t.x) || !Number.isInteger(t.y)) {
              bad2.push(`\`laidTilesByKind.${k2}\` carries an entry that names no tile (${String(JSON.stringify(t)).slice(0, 40)})`);
              continue;
            }
            if (t.x < 0 || t.x > 49 || t.y < 0 || t.y > 49) {
              bad2.push(`\`laidTilesByKind.${k2}\` names ${t.x},${t.y}, which is not a tile of this room`);
            } else if (!walkable(terrain, t.x, t.y)) {
              bad2.push(
                `\`laidTilesByKind.${k2}\` names ${t.x},${t.y}, which is natural WALL — no pass laid a road ` +
                  `there, on any board`,
              );
            }
          }
          for (const t of Array.isArray(lost) ? lost : []) {
            if (!t || !Number.isInteger(t.x) || !Number.isInteger(t.y)) continue;
            if (t.x < 0 || t.x > 49 || t.y < 0 || t.y > 49) {
              bad2.push(`\`lostByKind.${k2}\` names ${t.x},${t.y}, which is not a tile of this room`);
            } else if (!walkable(terrain, t.x, t.y)) {
              bad2.push(`\`lostByKind.${k2}\` names ${t.x},${t.y}, which is natural WALL`);
            }
          }
          if (typeof laid === "number" && Array.isArray(tiles)) {
            const tk = [...new Set(tiles.filter((t) => t && Number.isInteger(t.x)).map((t) => key(t.x, t.y)))];
            if (tk.length !== laid) {
              bad2.push(`\`laidTilesByKind.${k2}\` names ${tk.length} distinct tile(s) and \`laidByKind.${k2}\` says ${laid}`);
            }
            // m6 (4). THE TILE-LEVEL IDENTITY, STATED AS ONE THING RATHER THAN
            // THREE INEQUALITIES. `laid minus lost` IS the provenance map's key
            // set for this kind — not "the same size as", the same TILES. A
            // shipped road re-attributed between two passes keeps all four
            // counts consistent and fails here.
            if (lostK !== null) {
              const derivedShipped = tk.filter((t) => !lostK.includes(t)).sort();
              const onSorted = onBoard.slice().sort();
              if (derivedShipped.join(" ") !== onSorted.join(" ")) {
                const extraT = derivedShipped.filter((t) => !onSorted.includes(t));
                const missT = onSorted.filter((t) => !derivedShipped.includes(t));
                bad2.push(
                  `\`${k2}\`: the tiles this pass laid MINUS the tiles it lost are ` +
                    `[${derivedShipped.join(" ") || "nothing"}] and the tiles the board actually carries ` +
                    `with the "${k2}" provenance are [${onSorted.join(" ") || "nothing"}]` +
                    `${extraT.length ? ` — ${extraT.join(" ")} survived on paper and not on the board` : ""}` +
                    `${missT.length ? ` — ${missT.join(" ")} is on the board and in neither book` : ""}. ` +
                    `The books close at the COUNT level under a re-attribution and only at the TILE level ` +
                    `against one`,
                );
              }
            }
            for (const t of onBoard) {
              if (!tk.includes(t)) {
                bad2.push(
                  `${t} ships with the "${k2}" provenance and \`laidTilesByKind.${k2}\` does not name it — ` +
                    `a tile that ships as this kind was laid by this pass`,
                );
              }
            }
            if (lostK !== null) {
              const want = tk.filter((t) => !onBoard.includes(t)).sort();
              if (lostK.slice().sort().join(" ") !== want.join(" ")) {
                bad2.push(
                  `\`lostByKind.${k2}\` is [${lostK.slice().sort().join(" ") || "nothing"}] and the tiles ` +
                    `this pass laid but the room does not ship as "${k2}" are [${want.join(" ") || "nothing"}]. ` +
                    `Lost IS laid minus shipped`,
                );
              }
            }
          }
          for (const t of lostK || []) {
            if (rk[t] === k2) {
              bad2.push(`\`lostByKind.${k2}\` names ${t} as taken and the room ships a road there carrying the "${k2}" provenance today`);
            }
            // m6 (2). "A LATER PASS TOOK IT" MEANS THERE IS NO ROAD THERE.
            // Checking only that the tile is not shipped AS THIS KIND lets a
            // shipped road be re-attributed between two passes with all four
            // books kept consistent — which is exactly the coordinated
            // three-way lie the reviewer landed. A tile in `lostByKind` is a
            // tile the board does not pave, full stop.
            if (roadSet.has(t)) {
              bad2.push(
                `\`lostByKind.${k2}\` says a later pass TOOK ${t} and this room ships a road there ` +
                  `(provenance ${JSON.stringify(rk[t] ?? "an earlier layer")}). "Lost" is not "lost to ` +
                  `another book" — a tile that still carries a road was not taken`,
              );
            }
          }
        }
        // ---- restoredByKind: the named difference between a pass's EVENT
        // counter and what it laid. swampPave counts holes closed, and a hole
        // can be closed by un-deleting a road the prune took rather than by
        // laying one; the tiles that happened to are named here.
        const restored = W2.restoredByKind;
        if (restored !== undefined) {
          if (!restored || typeof restored !== "object" || Array.isArray(restored)) {
            bad2.push(`\`restoredByKind\` is ${String(JSON.stringify(restored)).slice(0, 40)}, not an object`);
          } else {
            for (const [k2, arr] of Object.entries(restored)) {
              if (!Array.isArray(arr)) {
                bad2.push(`\`restoredByKind.${k2}\` is not a list of tiles`);
                continue;
              }
              for (const t of arr) {
                if (!t || !Number.isInteger(t.x) || !Number.isInteger(t.y)) {
                  bad2.push(`\`restoredByKind.${k2}\` carries an entry that names no tile`);
                  continue;
                }
                const tk = key(t.x, t.y);
                // A RESTORED TILE IS A ROAD THE ROOM SHIPS. That is the whole
                // content of "restored": the pass did not lay it, it un-deleted
                // it, so it is on the board and it is NOT in the laid list.
                if (!roadSet.has(tk)) {
                  bad2.push(
                    `\`restoredByKind.${k2}\` says ${tk} was a road this pass brought back and the room ` +
                      `ships no road there`,
                  );
                }
                const laidT = laidTilesByKind[k2];
                if (Array.isArray(laidT) && laidT.some((q) => q && key(q.x, q.y) === tk)) {
                  bad2.push(
                    `\`restoredByKind.${k2}\` says ${tk} was RESTORED and \`laidTilesByKind.${k2}\` says it ` +
                      `was LAID. A tile the pass un-deleted is a tile it did not push`,
                  );
                }
                // m6 (3). ...AND THE EVIDENCE THAT IT WAS THERE TO RESTORE.
                // "Restored" means an EARLIER layer laid the tile, the prune
                // took it and this pass un-deleted it — so the room's own
                // `roadLayer` map has to remember an earlier layer at that
                // tile. Without this, `restoredByKind` can claim any twenty
                // shipped roads it likes, which is what it did.
                const lay2 = plan.meta?.roadLayer?.[tk];
                if (!Number.isInteger(lay2)) {
                  bad2.push(
                    `\`restoredByKind.${k2}\` says ${tk} is a road this pass BROUGHT BACK and ` +
                      `\`meta.roadLayer\` remembers no layer laying it. A tile with no earlier provenance ` +
                      `was never there to restore`,
                  );
                } else if (lay2 >= 7) {
                  bad2.push(
                    `\`restoredByKind.${k2}\` says ${tk} is a road this pass brought back and ` +
                      `\`meta.roadLayer\` says layer ${lay2} laid it — layer 7 IS this pass. A tile the ` +
                      `late layer laid is laid, not restored`,
                  );
                }
              }
            }
          }
        }
        for (const b of bad2) {
          fails.push(
            `META — the late-road books: ${b}. This is the channel a reader has to tell what each of the ` +
              `seven laying passes actually put on the board, and it was published unread for two rounds.`,
          );
        }
      }
    }

    // ==================================================================
    // OF7. THE DEAD-END PRUNE COUNTER WAS AN EVENT COUNT UNDER A TILE LABEL.
    //
    // `plan.mjs` printed "pruned 2007 dead-end road tiles" and 1994 tiles
    // actually carry a `meta.roadLayer` entry and no shipped road. Thirteen
    // tiles across eight rooms were counted as "pruned dead-end road tiles" and
    // SHIP AS ROADS — criticism 27 verbatim (`spurTiles` laid 375 vs shipped
    // 370), in the same printed line, about ten tokens later, under a comment
    // reading "One number for two quantities is how an inflated count goes
    // unnoticed for thirteen rounds."
    //
    // The producer now publishes five figures and two tile lists, and the
    // thirteen resolve into two different facts: ONE tile was deleted and
    // re-laid (E5S1 28,30, the conduct bridge) and TWELVE were laid AND deleted
    // inside layer 7, so they never entered `meta.roadLayer` and the film has
    // nothing to erase for them. Both counts are honest; publishing one under
    // the other's name was the defect. These are the identities that keep them
    // apart, and they are checked against the BOARD, not against each other.
    // ==================================================================
    {
      const W3 = plan.meta?.walls || {};
      const bad3 = [];
      const num3 = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
      const asK = (a) =>
        Array.isArray(a) ? [...new Set(a.filter((t) => t && Number.isInteger(t.x)).map((t) => key(t.x, t.y)))] : null;
      const tilesK = asK(W3.prunedTiles);
      const atPassK = asK(W3.prunedAtPassTiles);
      const relaidK = asK(W3.prunedRelaid);
      const pruned = num3(W3.pruned);
      const atPass = num3(W3.prunedAtPass);
      const ghosts = num3(W3.prunedGhosts);
      const transient = num3(W3.prunedTransient);
      for (const [n, v] of [
        ["pruned", pruned],
        ["prunedAtPass", atPass],
        ["prunedGhosts", ghosts],
        ["prunedTransient", transient],
      ]) {
        if (v === null) bad3.push(`\`${n}\` is ${JSON.stringify(W3[n])}, not a number`);
      }
      for (const [n, v] of [
        ["prunedTiles", tilesK],
        ["prunedAtPassTiles", atPassK],
        ["prunedRelaid", relaidK],
      ]) {
        if (v === null) bad3.push(`\`${n}\` is ${String(JSON.stringify(W3[n])).slice(0, 40)}, not a list of tiles`);
      }
      if (!bad3.length) {
        if (tilesK.length !== pruned) {
          bad3.push(`\`pruned\` says ${pruned} and \`prunedTiles\` names ${tilesK.length} distinct tile(s)`);
        }
        if (atPassK.length !== atPass) {
          bad3.push(`\`prunedAtPass\` says ${atPass} and \`prunedAtPassTiles\` names ${atPassK.length} distinct tile(s)`);
        }
        if (atPass !== pruned + relaidK.length) {
          bad3.push(
            `\`prunedAtPass\` is ${atPass}, \`pruned\` is ${pruned} and \`prunedRelaid\` names ` +
              `${relaidK.length} tile(s). The pass's EVENT count is the tile count plus the tiles a later ` +
              `pass put back — that identity is the whole reason both numbers exist`,
          );
        }
        if (pruned !== ghosts + transient) {
          bad3.push(
            `\`pruned\` is ${pruned} and its two halves — ${ghosts} ghost(s) the film erases and ` +
              `${transient} tile(s) laid and deleted inside layer 7 — sum to ${ghosts + transient}`,
          );
        }
        // ...AND THE BOARD. This is what makes the counts tile-true rather than
        // internally consistent: a pruned tile is a tile with no road on it.
        const stillPaved = tilesK.filter((k2) => roadSet.has(k2));
        if (stillPaved.length) {
          bad3.push(
            `\`prunedTiles\` names ${stillPaved.length} tile(s) the room SHIPS A ROAD ON ` +
              `(${stillPaved.slice(0, 8).join(" ")}${stillPaved.length > 8 ? " …" : ""}). "Pruned dead-end ` +
              `road tiles" is a count of tiles that are not there; a tile that ships is not one of them`,
          );
        }
        const relaidGone = relaidK.filter((k2) => !roadSet.has(k2));
        if (relaidGone.length) {
          bad3.push(
            `\`prunedRelaid\` names ${relaidGone.length} tile(s) as deleted and PUT BACK ` +
              `(${relaidGone.join(" ")}) and the room ships no road there`,
          );
        }
        for (const k2 of relaidK) {
          if (tilesK.includes(k2)) {
            bad3.push(`\`prunedRelaid\` and \`prunedTiles\` both name ${k2} — a tile is either back on the board or it is not`);
          }
          if (!atPassK.includes(k2)) {
            bad3.push(`\`prunedRelaid\` names ${k2} and \`prunedAtPassTiles\` — what the pass actually deleted — does not`);
          }
        }
        // the ghost/transient split is a fact about `meta.roadLayer`: a ghost is
        // a pruned tile an earlier layer had tagged (so the film has something
        // to erase), a transient is one it never did
        const rl = plan.meta?.roadLayer;
        if (rl && typeof rl === "object") {
          // ==========================================================
          // ROUND 17 / F5 — THE CENSUS IS RE-DERIVED, NOT RECONCILED.
          // ==========================================================
          // Everything above this line is `prunedTiles` checked against
          // itself and against the board in ONE direction: a tile it names
          // must carry no road. Nothing said which tiles it must NAME — so
          // the whole census DEFLATED. E15S3 ships `pruned 29 / ghosts 29`
          // and passed with `pruned 0`, `prunedGhosts 0`, `prunedTiles []`,
          // every identity above still closing. (Inflation already bit;
          // only the direction a producer would actually use was open.)
          //
          // The ghost half is FULLY derivable and always was: a ghost is a
          // tile an earlier layer tagged in `meta.roadLayer` and the room
          // ships no road on. Re-derived independently it reproduces the
          // fleet's 1994 in 172 of 172 rooms, so `prunedGhosts` is a class-D
          // quantity and `prunedTiles` is required to CONTAIN every one of
          // them. What stays witnessed is the transient half — tiles laid
          // and deleted inside layer 7, which by construction left no trace
          // on any board — and it is bounded by the identity above.
          const ghostK = Object.keys(rl).filter((k2) => Number.isInteger(rl[k2]) && !roadSet.has(k2));
          if (ghostK.length !== ghosts) {
            bad3.push(
              `\`prunedGhosts\` says ${ghosts} and this room's own board carries ${ghostK.length} tile(s) ` +
                `that an earlier layer tagged in \`meta.roadLayer\` and that ship no road. That set IS the ` +
                `ghost census — re-derived here rather than reconciled against the producer's own list, ` +
                `because reconciliation let the whole census deflate to zero and stay self-consistent`,
            );
          }
          const ghostMissing = ghostK.filter((k2) => !tilesK.includes(k2));
          if (ghostMissing.length) {
            bad3.push(
              `\`prunedTiles\` does not name ${ghostMissing.length} tile(s) that carry a \`meta.roadLayer\` ` +
                `entry and no road (${ghostMissing.slice(0, 8).join(" ")}${ghostMissing.length > 8 ? " …" : ""}). ` +
                `Every one of them is a road an earlier layer laid and this room does not ship, which is ` +
                `what "pruned" means`,
            );
          }
          const wantGhosts = tilesK.filter((k2) => Number.isInteger(rl[k2])).length;
          if (wantGhosts !== ghosts) {
            bad3.push(
              `\`prunedGhosts\` says ${ghosts} and ${wantGhosts} of the ${tilesK.length} pruned tile(s) ` +
                `carry a \`meta.roadLayer\` entry. The ghosts are exactly the tiles the film's roadsPrune ` +
                `stage has something to erase for; the rest were laid and deleted inside layer 7 and were ` +
                `never drawn`,
            );
          }
          if (transient !== tilesK.length - wantGhosts) {
            bad3.push(
              `\`prunedTransient\` says ${transient} and ${tilesK.length - wantGhosts} pruned tile(s) carry ` +
                `no \`meta.roadLayer\` entry`,
            );
          }
        }
      }
      for (const b of bad3) {
        fails.push(
          `META — the dead-end prune: ${b}. The fleet summary prints this counter as "pruned N dead-end ` +
            `road tiles", and an EVENT counter under a TILE label is criticism 27 in the same printed line ` +
            `that applies the laid-vs-shipped discipline to spurs.`,
        );
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

    // ==================================================================
    // THE RECORD, LEAF BY LEAF — the derivations RECORD_LEAVES promises.
    //
    // See the RECORD_LEAVES header for the argument. This is the half that has
    // to exist for the table to be worth writing: for every leaf the table
    // classes `derived`, a value computed HERE from terrain, the room objects,
    // the shipped structure lists and this file's own transcribed constants. A
    // leaf the table calls derived and this function does not produce is a HARD
    // FAIL on the room, because a promise of a check is worse than no check.
    //
    // DELETION IS ALREADY COVERED and that is why absence is not failed here:
    // every renderer prints its record's fields, and a missing field renders as
    // "?" — so a deleted leaf fails the PROSE IDENTITY gate above, on the
    // paragraph, which is where a reader would have noticed it.
    // ==================================================================
    /** the interior walk region, for the battlement reachability re-derivation */
    const garrisonWalk = walkFor(mobBlocked);

    // ------------------------------------------------------------------
    // THE LAYER-4 BOARD, REBUILT — what the lab search actually measured on.
    //
    // `haulDist` is the number E13S2's paragraph turns into "the lab diamond is
    // N hauler tile(s) from the hub", and a reviewer moved it from 12 to 2 — the
    // fleet median — and passed. It is re-derivable, but NOT off the shipped
    // board: layer 4 runs before extensions, the nuker, the observer and the
    // mineral container exist, and it measures over a plain D8 field from the
    // sitter in which containers block. So the board is rebuilt to layer 4's
    // own contents (the hub trio, the spawns, the towers, the source/controller
    // containers, the sitter, the object tiles) and the walk is taken there.
    //
    // The anchor enumerations (`deepAnchors`, `fallbackAnchors`, `dryAnchors`)
    // are the same replay one level up: every 4x4 stamp position in both
    // orientations, held to the same six tests layer 4 applies, over the layer-4
    // ROAD set — which `meta.roadLayer` preserves exactly, because the layers
    // after 4 delete from `structures.road` and not from it.
    // ------------------------------------------------------------------
    let _labBoard;
    const labBoard = () => {
      if (_labBoard !== undefined) return _labBoard;
      const labs = s.lab || [];
      if (!labs.length) return (_labBoard = null);
      const occupied = new Set(objectTiles);
      occupied.add(key(sitter.x, sitter.y));
      for (const t of ["storage", "terminal", "link", "spawn", "tower"]) {
        for (const p of s[t] || []) occupied.add(key(p.x, p.y));
      }
      // every container EXCEPT the mineral seat, which layer 5 adds after labs
      for (const c of s.container || []) {
        if (mineralSeat.has(key(c.x, c.y))) continue;
        occupied.add(key(c.x, c.y));
      }
      // the layer-4 road set, off the provenance map that survives the prune
      const road4 = new Set();
      for (const [kk, v] of Object.entries(plan.meta?.roadLayer || {})) {
        if (v === 1 || v === 3) road4.add(kk);
      }
      const reserved = new Set();
      for (const list of [plan.meta?.claimSeat, plan.meta?.claimApproach, plan.meta?.ctrlParkReserve]) {
        for (const p of Array.isArray(list) ? list : list ? [list] : []) {
          if (p && Number.isInteger(p.x)) reserved.add(key(p.x, p.y));
        }
      }
      // the haul field: plain D8 BFS from the sitter, `occupied` blocking,
      // NOT limited to the interior — layer 4's field walks outside the wall
      const INFV = 999;
      const hauls = new Int16Array(2500).fill(INFV);
      {
        const si = idx(sitter.x, sitter.y);
        hauls[si] = 0;
        const q = [si];
        for (let qi = 0; qi < q.length; qi++) {
          const i = q[qi];
          const x = i % 50,
            y = (i / 50) | 0;
          for (const [dx, dy] of D8) {
            const nx = x + dx,
              ny = y + dy;
            if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
            if (!walkable(terrain, nx, ny)) continue;
            const nk = key(nx, ny);
            if (occupied.has(nk)) continue;
            const ni = idx(nx, ny);
            if (hauls[ni] <= hauls[i] + 1) continue;
            hauls[ni] = hauls[i] + 1;
            q.push(ni);
          }
        }
      }
      const ax = Math.min(...labs.map((l) => l.x));
      const ay = Math.min(...labs.map((l) => l.y));
      const anti = labs.some((l) => l.x === ax + 1 && l.y === ay + 1);
      // the internal road runs the main diagonal for MAIN and the anti-diagonal
      // for ANTI; the haul is the SHORTER of its two ends
      const ends = anti
        ? [
            [3, 0],
            [0, 3],
          ]
        : [
            [0, 0],
            [3, 3],
          ];
      const haulDist = Math.min(...ends.map(([dx, dy]) => hauls[idx(ax + dx, ay + dy)]));
      // ...and the anchor enumerations, at the two depth floors
      // layer-labs.mjs:100-129 verbatim — the 4x4 stamp is TEN labs and FOUR
      // road tiles down one diagonal; the two opposite corners are DROPPED, and
      // an enumeration that fills all sixteen counts a stamp nobody builds
      const LAB_MAIN = {
        road: [
          [0, 0],
          [1, 1],
          [2, 2],
          [3, 3],
        ],
        labs: [
          [1, 0],
          [2, 0],
          [3, 1],
          [3, 2],
          [2, 3],
          [1, 3],
          [0, 2],
          [0, 1],
          [2, 1],
          [1, 2],
        ],
      };
      const LAB_ANTI = {
        road: LAB_MAIN.road.map(([x, y]) => [3 - x, y]),
        labs: LAB_MAIN.labs.map(([x, y]) => [3 - x, y]),
      };
      const countAnchors = (minDepth, eatRoads = false) => {
        let n = 0;
        for (const v of [LAB_MAIN, LAB_ANTI]) {
          for (let bx = 2; bx <= 44; bx++) {
            for (let by = 2; by <= 44; by++) {
              let ok = true;
              for (const [dx, dy] of v.labs) {
                const x = bx + dx,
                  y = by + dy;
                const i = idx(x, y);
                const kk = key(x, y);
                if (
                  !engineBuildable(terrain, x, y, "lab") ||
                  ext[i] ||
                  depth[i] < minDepth ||
                  occupied.has(kk) ||
                  reserved.has(kk) ||
                  // the eating passes lift the road veto and count instead
                  (!eatRoads && road4.has(kk))
                ) {
                  ok = false;
                  break;
                }
              }
              if (!ok) continue;
              for (const [dx, dy] of v.road) {
                const x = bx + dx,
                  y = by + dy;
                const i = idx(x, y);
                if (!walkable(terrain, x, y) || ext[i] || occupied.has(key(x, y))) {
                  ok = false;
                  break;
                }
              }
              if (!ok) continue;
              const d = Math.min(
                ...[v.road[0], v.road[v.road.length - 1]].map(([dx, dy]) => hauls[idx(bx + dx, by + dy)]),
              );
              // the producer's own test is `d >= 9999` against a field that
              // fills with 999, so an unreachable anchor enters the pool. The
              // bug is reproduced deliberately: a re-derivation that silently
              // fixes it is a second opinion, not a check
              if (d >= 9999) continue;
              n++;
            }
          }
        }
        return n;
      };
      return (_labBoard = {
        haulDist,
        deepAnchors: countAnchors(DEPTH_SAFE),
        fallbackAnchors: countAnchors(DEPTH_SAFE - 1),
        // the widest enumeration the road-eating passes can possibly walk: the
        // shallower depth floor AND the road veto lifted. Whichever of passes 3
        // and 4 produced `eatAnchors`, it counted a subset of this
        eatCeiling: countAnchors(DEPTH_SAFE - 1, true),
      });
    };

    // ------------------------------------------------------------------
    // THE CONTROLLER-LINK SEAT LADDER, REPLAYED.
    //
    // Two boards again, and the record carries both. AS BUILT: the seats the
    // shipped link actually feeds — D8 of the link, chebyshev <= 3 of the
    // controller, walkable, and not under one of our blocking structures (roads,
    // containers and ramparts do not take a seat). AT THE SEARCH: the same count
    // over layer 1's board, where the only obstacles were the object tiles, the
    // hub trio and the spawn fan — that is `parks`, and `built` is what six
    // layers of extensions left of it.
    //
    // The candidate ladder is replayed too, because `census.maxParks` is what
    // E17S5's paragraph turns into "5 seats is therefore the room's CEILING, not
    // a preference": every tile in the controller's 7x7 ring outside the inner
    // ring, buildable, unclaimed and reachable from the sitter, with its seat
    // count, its walk and its score. What is NOT replayed is the seal test that
    // filters that list down to the pool — see RECORD_LEAVES.
    // ------------------------------------------------------------------
    let _parkBoard;
    const parkBoard = () => {
      if (_parkBoard !== undefined) return _parkBoard;
      const ctrl = (objects || []).find((o) => o.type === "controller") || plan.controller || null;
      const links = s.link || [];
      if (!ctrl || !links.length) return (_parkBoard = null);
      const link = links[links.length - 1];
      const BUILT_OBSTACLES = [
        "spawn",
        "extension",
        "link",
        "storage",
        "tower",
        "observer",
        "lab",
        "terminal",
        "nuker",
      ];
      const builtBlocked = new Set(objectTiles);
      for (const t of BUILT_OBSTACLES) for (const p of s[t] || []) builtBlocked.add(key(p.x, p.y));
      const seats = [];
      const eaters = [];
      for (const [dx, dy] of D8) {
        const x = link.x + dx,
          y = link.y + dy;
        if (x < 0 || y < 0 || x > 49 || y > 49) continue;
        if (isWall(terrain, x, y)) continue;
        if (chebyshev({ x, y }, ctrl) > 3) continue;
        const kk = key(x, y);
        if (objectTiles.has(kk)) continue;
        if (builtBlocked.has(kk)) {
          const ty = BUILT_OBSTACLES.find((t) => (s[t] || []).some((p) => p.x === x && p.y === y));
          if (ty) eaters.push(`${x},${y}=${ty}`);
          continue;
        }
        seats.push({ x, y });
      }
      // layer 1's obstacle set: object tiles, the hub trio and the spawn fan
      const layer1 = new Set(objectTiles);
      for (const p of [(s.storage || [])[0], (s.terminal || [])[0], links[0]]) {
        if (p) layer1.add(key(p.x, p.y));
      }
      for (const p of links.slice(1, Math.max(1, links.length - 1))) layer1.add(key(p.x, p.y));
      for (const p of s.spawn || []) layer1.add(key(p.x, p.y));
      const parksAt = (x, y) => {
        let n = 0;
        for (const [ax2, ay2] of D8) {
          const px = x + ax2,
            py = y + ay2;
          if (px < 0 || py < 0 || px > 49 || py > 49) continue;
          if (!walkable(terrain, px, py)) continue;
          const pk = key(px, py);
          if (layer1.has(pk) || objectTiles.has(pk)) continue;
          if (chebyshev({ x: px, y: py }, ctrl) <= 3) n++;
        }
        return n;
      };
      // the sitter-seeded field layer 1 measured `hubWalk` on
      const INFV = 999;
      const hub = new Int16Array(2500).fill(INFV);
      {
        const si = idx(sitter.x, sitter.y);
        hub[si] = 0;
        const q = [si];
        for (let qi = 0; qi < q.length; qi++) {
          const i = q[qi];
          const x = i % 50,
            y = (i / 50) | 0;
          for (const [dx, dy] of D8) {
            const nx = x + dx,
              ny = y + dy;
            if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
            if (!walkable(terrain, nx, ny)) continue;
            const nk = key(nx, ny);
            if (layer1.has(nk)) continue;
            const ni = idx(nx, ny);
            if (hub[ni] <= hub[i] + 1) continue;
            hub[ni] = hub[i] + 1;
            q.push(ni);
          }
        }
      }
      const byTile = new Map();
      let considered = 0;
      let maxCands = 0;
      for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 2) continue;
          const x = ctrl.x + dx,
            y = ctrl.y + dy;
          const kk = key(x, y);
          if (!engineBuildable(terrain, x, y, "link")) continue;
          if (layer1.has(kk) || objectTiles.has(kk)) continue;
          if (hub[idx(x, y)] >= INFV) continue;
          const park = parksAt(x, y);
          const d = hub[idx(x, y)];
          considered++;
          if (park > maxCands) maxCands = park;
          byTile.set(kk, { x, y, park, d, score: Math.round((park * 2 - d * 0.5) * 10) / 10 });
        }
      }
      return (_parkBoard = {
        link,
        built: seats.length,
        eaters,
        parks: parksAt(link.x, link.y),
        considered,
        maxCands,
        byTile,
      });
    };
    // ==================================================================
    // THE BOARD FACTS — see the `BOARD()` header. Re-derived from THIS
    // room's terrain and THIS room's shipped structures, once, so that a
    // closure can bound a search census against something a producer would
    // have to move the ROOM to change. Without one of these on a census,
    // two rooms' censuses can be swapped whole and both stay internally
    // legal (round 16, F11 cause 3: S1 permuted E11S6's and E3S5's
    // dispersion censuses and both passed, mirrors and all).
    // ==================================================================
    const boardFacts = (() => {
      let interiorWalkable = 0;
      let interiorTiles = 0;
      let freeDeepInterior = 0;
      // ROUND 17 / F3: THE SEAT CENSUS LAYER 3'S SEARCH RAN OVER, BOUNDED FROM
      // THE BOARD THIS ROOM SHIPS.
      //
      // Every tower-search census in this file (`towers.refillSearch`,
      // `mobilityVeto`, `towerDispersion.search`) is a nested loop over SLOTS x
      // CANDIDATE SEATS, and until this round the only thing under them was the
      // mirror — so a coordinated edit of record and mirror moved any of them
      // anywhere (451 of 918 such pairs escaped). `deepSeats` is the floor that
      // cannot move with them: a tile of THIS room that is buildable, interior,
      // at or past the depth floor, carries no structure and no road, and has a
      // walkable D8 face for the filler — which is `layer-towers.gather()`
      // minus the refill test, evaluated on the board the room SHIPS. Layer 3
      // gathered on a board with strictly FEWER blockers on it (no extensions,
      // no labs, no nuker), so every seat legal today was legal then: the
      // shipped count is a genuine LOWER bound on the list layer 3 searched,
      // plus the towers themselves, which are standing on seats it chose from.
      let deepSeats = 0;
      /**
       * ...AND THE FLOOR SURVIVES THE THINNING. Layer 3 caps its candidate list
       * at MAX_CANDS by `spatialPrune`, which keeps the cheapest ONE seat per
       * 2x2 block — so the count of seats is not a floor on the list it
       * searched, but the count of 2x2 BLOCKS holding a seat is: every block
       * that contains a seat contributes exactly one candidate after thinning,
       * and at least one before it. Both branches of the producer's `if` land
       * above this number, which is what makes it a bound rather than an
       * observation about the branch that happened to run.
       */
      const seatBlocks = new Set();
      const occupiedAll = new Set();
      /**
       * ...AND THE FILLER-WALK CAP, WHICH IS MONOTONE THE RIGHT WAY. Layer 3
       * also refused a seat whose filler walk broke `MAX_REFILL`, measured on
       * ITS board. That board carried strictly fewer obstacles than this one,
       * so a walk measured HERE is never shorter than the walk measured THERE:
       * a tile inside the cap today was inside the cap then. Applying the cap
       * on the shipped board therefore keeps the subset claim honest instead of
       * weakening it.
       */
      const seatRefillBlocked = new Set(objectTiles);
      for (const [t2, arr2] of Object.entries(s)) {
        if (t2 === "road" || t2 === "rampart") continue;
        for (const q2 of arr2 || []) seatRefillBlocked.add(key(q2.x, q2.y));
      }
      const seatRefill = walkField(terrain, sitter, seatRefillBlocked);
      for (const [t2, arr2] of Object.entries(s)) {
        if (t2 === "road" || t2 === "rampart") continue;
        for (const q2 of arr2 || []) occupiedAll.add(key(q2.x, q2.y));
      }
      const roadK0 = new Set((s.road || []).map((r) => key(r.x, r.y)));
      for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
          if (!walkable(terrain, x, y)) continue;
          interiorTiles++;
          const i2 = idx(x, y);
          if (ext[i2]) continue;
          interiorWalkable++;
          if (x >= 1 && x <= 48 && y >= 1 && y <= 48 && depth[i2] >= DEPTH_SAFE && !occupiedAll.has(key(x, y))) {
            freeDeepInterior++;
            if (
              x >= 2 &&
              x <= 47 &&
              y >= 2 &&
              y <= 47 &&
              !roadK0.has(key(x, y)) &&
              seatRefill[i2] <= MAX_REFILL &&
              D8.some(([dx, dy]) => walkable(terrain, x + dx, y + dy) && !occupiedAll.has(key(x + dx, y + dy)))
            ) {
              deepSeats++;
              seatBlocks.add(((y >> 1) << 6) | (x >> 1));
            }
          }
        }
      }
      for (const q2 of s.tower || []) seatBlocks.add(((q2.y >> 1) << 6) | (q2.x >> 1));
      return {
        deepSeats,
        /** ...and the towers are standing on seats of the same census */
        deepSeatsWithTowers: deepSeats + (s.tower || []).length,
        deepSeatBlocks: seatBlocks.size,
        interiorWalkable,
        interiorTiles,
        walkRegion: interior ? interior.size : interiorWalkable,
        shippedCut: cutPts.length,
        shippedRamparts: (s.rampart || []).length,
        shippedRoads: (s.road || []).length,
        shippedTowers: (s.tower || []).length,
        shippedExtensions: (s.extension || []).length,
        gatedPairs: mBuilt ? mBuilt.gatedPairs : undefined,
        builtGated: mBuilt ? mround2(mBuilt.maxGated) : undefined,
        freeDeepInterior,
        lapCeiling: MOB_EXACT_MAX,
      };
    })();
    // ==================================================================
    // ROUND 17 / F3 — THE SEED POOL, RE-DERIVED FROM TERRAIN ALONE.
    // ==================================================================
    // `eco.seedPool` ("this hub is seed rank 0 of 25 scored confluences") and
    // its `meta.seedPool` mirror were two copies of one witnessed number, so a
    // coordinated edit moved both and the sentence read "rank 0 of 8". It is
    // not witnessed at all: layer 1's seed list is the tiles that clear a
    // closed set of TERRAIN admissibility tests, ranked, and its pool is the
    // first 25 of them. The tests are reproduced here from this room's terrain
    // and its three object kinds — nothing of the plan is read — and the count
    // reproduces the published pool in 172 of 172 rooms.
    //
    // Only the ADMISSIBILITY half is reproduced, not the score: the pool size
    // is `min(25, |admissible|)` and the ordering inside it changes nothing
    // about how many there were.
    const seedPoolDerived = (() => {
      const MIN_EDGE = 6;
      const MIN_ANCHOR_PATH = 4;
      const SEED_POOL_CAP = 25;
      const srcs = (objects || []).filter((o) => o.type === "source");
      const ctrlO = (objects || []).find((o) => o.type === "controller");
      if (!ctrlO || !srcs.length) return null;
      const minO = (objects || []).find((o) => o.type === "mineral");
      const objK = new Set([
        ...srcs.map((o) => key(o.x, o.y)),
        key(ctrlO.x, ctrlO.y),
        ...(minO ? [key(minO.x, minO.y)] : []),
      ]);
      // dt[i] = chebyshev distance to the nearest wall, out-of-bounds counting
      // as wall — the two-pass transform, written out rather than imported
      const dt = new Uint8Array(2500);
      const BIG = 60;
      for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
          const i = idx(x, y);
          if (isWall(terrain, x, y)) {
            dt[i] = 0;
            continue;
          }
          let d = Math.min(BIG, x + 1, y + 1, 50 - x, 50 - y);
          if (x > 0) d = Math.min(d, dt[i - 1] + 1);
          if (y > 0) d = Math.min(d, dt[i - 50] + 1);
          if (x > 0 && y > 0) d = Math.min(d, dt[i - 51] + 1);
          if (x < 49 && y > 0) d = Math.min(d, dt[i - 49] + 1);
          dt[i] = d;
        }
      }
      for (let y = 49; y >= 0; y--) {
        for (let x = 49; x >= 0; x--) {
          const i = idx(x, y);
          if (dt[i] === 0) continue;
          let d = dt[i];
          if (x < 49) d = Math.min(d, dt[i + 1] + 1);
          if (y < 49) d = Math.min(d, dt[i + 50] + 1);
          if (x < 49 && y < 49) d = Math.min(d, dt[i + 51] + 1);
          if (x > 0 && y < 49) d = Math.min(d, dt[i + 49] + 1);
          dt[i] = d;
        }
      }
      // one D8 walk field per anchor, seeded on the anchor's walkable ring
      // (a source stands ON a wall tile, so it seeds its neighbours)
      const FAR = 30000;
      const fieldOf = (o) => {
        const dist = new Int16Array(2500).fill(FAR);
        const q = [];
        const seed = (x, y) => {
          if (x < 0 || y < 0 || x > 49 || y > 49) return;
          if (!walkable(terrain, x, y)) return;
          const i = idx(x, y);
          if (dist[i] > 0) {
            dist[i] = 0;
            q.push(i);
          }
        };
        seed(o.x, o.y);
        for (const [dx, dy] of D8) seed(o.x + dx, o.y + dy);
        for (let qi = 0; qi < q.length; qi++) {
          const i = q[qi];
          const x = i % 50;
          const y = (i / 50) | 0;
          for (const [dx, dy] of D8) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
            if (!walkable(terrain, nx, ny)) continue;
            const ni = idx(nx, ny);
            if (dist[ni] <= dist[i] + 1) continue;
            dist[ni] = dist[i] + 1;
            q.push(ni);
          }
        }
        return dist;
      };
      const fields = [...srcs, ctrlO].map(fieldOf);
      let admissible = 0;
      for (let x = MIN_EDGE; x <= 49 - MIN_EDGE; x++) {
        for (let y = MIN_EDGE; y <= 49 - MIN_EDGE; y++) {
          if (x < 2 || x > 47 || y < 2 || y > 47 || isWall(terrain, x, y)) continue;
          if (objK.has(key(x, y))) continue;
          if (dt[idx(x, y)] < 3) continue; // "a real pocket, not a crack"
          if (Math.min(x, y, 49 - x, 49 - y) < MIN_EDGE) continue;
          let reach = true;
          let minD = FAR;
          for (const f of fields) {
            const fd = f[idx(x, y)];
            if (fd >= FAR) {
              reach = false;
              break;
            }
            if (fd < minD) minD = fd;
          }
          if (!reach || minD < MIN_ANCHOR_PATH) continue; // not glued to one anchor
          admissible++;
        }
      }
      return { admissible, pool: Math.min(SEED_POOL_CAP, admissible), cap: SEED_POOL_CAP };
    })();
    if (seedPoolDerived) {
      const pub = plan.meta?.seedPool;
      if (pub !== seedPoolDerived.pool) {
        fails.push(
          `eco/seed-pool — the plan says layer 1 ranked ${JSON.stringify(pub)} confluence(s) and this room's ` +
            `terrain admits ${seedPoolDerived.admissible} seed candidate(s), which layer 1 takes the first ` +
            `${seedPoolDerived.cap} of: ${seedPoolDerived.pool}. The pool is quoted to a reader as "seed rank ` +
            `N of M scored confluences" and it was a witnessed number with one mirror; both copies are ` +
            `written in the same pass, so the pair is one edit`,
        );
      }
      const pubCore = plan.meta?.coreSize;
      if (typeof pubCore === "number" && pubCore > CORE_SIZE) {
        fails.push(
          `eco/core-size — the plan says the core pocket holds ${pubCore} tile(s) and layer 1 takes the ` +
            `first ${CORE_SIZE} tiles of the basin (CORE_SIZE). A core cannot be larger than the slice it is`,
        );
      }
    }

    // ==================================================================
    // ROUND 17 / F3 — THE MIRROR IS ANCHORED TO THE BOARD, IN EVERY ROOM,
    // DECLARED OR NOT.
    // ==================================================================
    // The record-leaf inventory's cross-copies (`MIRROR_L3`, `MIRROR_VETO`,
    // `MIRROR_DISP`, `@meta.towers.refillSearch.*`) all rest on the same
    // argument: the mirror was written by a pass that does not know whether
    // the room will declare, so keeping the two copies consistent is an edit a
    // declaration-shaped exploit is not making. Round 17 made it: writing the
    // SAME lie into both copies — which is exactly what a real producer bug
    // does — walked 451 of 918 falsified leaves past this file, including
    // E11S6's clump paragraph reading "1 single-swap round(s) over 3 candidate
    // swap(s)" against a truth of 755 candidate swaps.
    //
    // A second copy of a number is not evidence about the number. So the
    // MIRROR itself is bounded here, against this room's board, for all 172
    // rooms — and the record's copy is `EQ` to the mirror, so the record
    // inherits the anchor. The bounds are the loops' own arithmetic:
    //
    //   * `candidates` is layer 3's seat list. Its floor is `#deepSeatBlocks`
    //     (see the board-fact header: one candidate survives thinning per 2x2
    //     block, and every block holding a seat on the SHIPPED board held one
    //     then), its ceiling is `MAX_CANDS`, this file's copy of the producer's
    //     own thinning cap. Measured slack on the fleet: 19 at the tightest.
    //   * the refill-directed pass is an EXHAUSTIVE double loop — every slot
    //     against every candidate that is not one of the six seats — so
    //     `tried === rounds * towers * (candidates - towers)` EXACTLY, and it
    //     is exact in 172 of 172 rooms.
    //   * the dispersion pass is the same loop with the D8 prior skipping
    //     instead of occupancy, and a tower has at most 8 D8 neighbours, so
    //     `tried` lies between `rounds*T*(C-1-8*(T-1))` and `rounds*T*(C-1)`.
    //     Tightest slack on the fleet: 66 swaps (E17S5).
    //   * the mobility veto stops early (a `MOBILITY_TRIALS` budget and a
    //     satisfied-lap break), so it gets the ceiling and the zero-identity
    //     only — stated, rather than a floor it would not deserve.
    // ==================================================================
    /** layer 3's own filler walks, re-derived — see the F2 block below */
    let placementRefill = null;
    {
      const tw = plan.meta?.towers || {};
      const T = boardFacts.shippedTowers;
      const C = typeof tw.candidates === "number" ? tw.candidates : null;
      const anchor = (msg) => fails.push(`towers/census-anchor — ${msg}`);
      // ==============================================================
      // ROUND 17 / F2 — LAYER 3'S OWN REFILL WALK, RECONSTRUCTED.
      // ==============================================================
      // `towers/weak-battery` derives its `source` — whether the battery is
      // weak because of the WALL or because of the REFILL — from
      // `meta.towers.minShellDmg` and `meta.towers.maxRefillAtPlacement`.
      // The first is mirrored and audited; the second was a layer-3 witness
      // describing a board that no longer exists, so nothing re-derived it.
      // Clamping it under REFILL_NOTE, deleting the placement census and
      // writing `source: "walls"` took the wall arm in 10 of the 15 layer-3
      // rooms and dropped 20 sub-records and 34 audited leaves off the audit
      // with it. A derivation whose inputs are the same producer's unaudited
      // numbers is not a derivation.
      //
      // The board is reconstructible after all, and it does not need the road
      // set: the walk is a BFS over walkable terrain around OBSTACLES, and
      // roads are not obstacles. What stood at layer 3 is the hub (spawn,
      // storage, terminal, link) and the six towers themselves — the
      // extensions, labs, nuker and observer all land later. Reconstructed
      // that way the walk reproduces `meta.towers.refillDistsAtPlacement`
      // TOWER FOR TOWER in 172 of 172 rooms.
      placementRefill = (() => {
        const imp = new Set(objectTiles);
        for (const t2 of ["spawn", "storage", "terminal", "link", "tower"]) {
          for (const q2 of s[t2] || []) imp.add(key(q2.x, q2.y));
        }
        const f = walkField(terrain, sitter, imp);
        const arrive = (t2) => {
          const v = f[idx(t2.x, t2.y)];
          if (v < 9999) return v;
          let best = 9999;
          for (const [dx, dy] of D8) {
            const x = t2.x + dx;
            const y = t2.y + dy;
            if (x < 0 || y < 0 || x > 49 || y > 49) continue;
            const w = f[idx(x, y)];
            if (w < 9999 && w + 1 < best) best = w + 1;
          }
          return best;
        };
        const dists = (s.tower || []).map(arrive);
        return { dists, max: dists.length ? Math.max(...dists) : 0 };
      })();
      if (T > 0) {
        const pubD = tw.refillDistsAtPlacement;
        if (!Array.isArray(pubD) || JSON.stringify(pubD) !== JSON.stringify(placementRefill.dists)) {
          fails.push(
            `towers/placement-refill — the plan says layer 3 measured the filler walks ` +
              `[${Array.isArray(pubD) ? pubD.join(",") : String(JSON.stringify(pubD))}] when it placed the ` +
              `battery, and re-walked on the board layer 3 actually had — this room's terrain with the hub ` +
              `and the six towers standing and nothing later on it — they are ` +
              `[${placementRefill.dists.join(",")}]. This is the number \`towers/weak-battery\` derives its ` +
              `\`source\` from, and it was a witness to a board nobody could check`,
          );
        }
        if (tw.maxRefillAtPlacement !== placementRefill.max) {
          fails.push(
            `towers/placement-refill — the plan says the furthest of those walks was ` +
              `${JSON.stringify(tw.maxRefillAtPlacement)} and the walks re-derived here run to ` +
              `${placementRefill.max}. Clamping this one number under the soft note took the WALL arm of ` +
              `the weak-battery declaration in 10 of the 15 rooms that publish the census`,
          );
        }
      }
      const why =
        `A search census is the whole evidence for "the pass looked and there was nothing to find", and ` +
        `the only thing under it was a second copy of itself written in the same pass. Both copies moving ` +
        `together is what a producer bug looks like, and 451 of 918 such coordinated edits used to pass`;
      if (T > 0) {
        // the spread of the battery, re-derived off the six towers the room
        // ships — see the REQUIRED_META entry
        const tws = s.tower || [];
        const cx = tws.reduce((a, t) => a + t.x, 0) / tws.length;
        const cy = tws.reduce((a, t) => a + t.y, 0) / tws.length;
        const wantSpread =
          Math.round(Math.max(...tws.map((t) => Math.max(Math.abs(t.x - cx), Math.abs(t.y - cy)))) * 10) / 10;
        if (typeof tw.spreadRadius !== "number" || Math.abs(tw.spreadRadius - wantSpread) > 1e-9) {
          fails.push(
            `towers/spread-radius — the plan says the battery's spread is ${JSON.stringify(tw.spreadRadius)} ` +
              `and the six towers it ships sit at most ${wantSpread} from their own centroid. ${why}`,
          );
        }
      }
      if (C === null) {
        anchor(`\`meta.towers.candidates\` is ${JSON.stringify(tw.candidates)}, not a number. ${why}`);
      } else if (T > 0) {
        if (C < boardFacts.deepSeatBlocks) {
          anchor(
            `layer 3 says it searched ${C} candidate seat(s) and this room's own board carries ` +
              `${boardFacts.deepSeats} legal deep tower seat(s) spread over ${boardFacts.deepSeatBlocks} ` +
              `2x2 block(s). Layer 3 gathered on a board with FEWER obstacles than this one and keeps one ` +
              `seat per block when it thins, so its list cannot have been shorter than the block count. ${why}`,
          );
        }
        if (C > MAX_CANDS) {
          anchor(`layer 3 says it searched ${C} candidate seat(s) against its own thinning cap of ${MAX_CANDS}. ${why}`);
        }
        if (C > boardFacts.interiorWalkable) {
          anchor(`layer 3 says it searched ${C} candidate seat(s) and this room has ${boardFacts.interiorWalkable} walkable interior tile(s) in total. ${why}`);
        }
        const rs = tw.refillSearch || {};
        if (typeof rs.tried === "number" && typeof rs.rounds === "number") {
          const want = rs.rounds * T * (C - T);
          if (rs.tried !== want) {
            anchor(
              `the refill-directed swap pass says it examined ${rs.tried} swap(s) over ${rs.rounds} ` +
                `round(s). That pass is an exhaustive loop over ${T} slot(s) x the ${C - T} candidate ` +
                `seat(s) no tower is standing on, so the count is exactly ${want}. ${why}`,
            );
          }
        }
        const ds = tw.towerDispersion?.search || {};
        if (typeof ds.singleSwapsTried === "number" && typeof ds.rounds === "number") {
          const hi = ds.rounds * T * (C - 1);
          const lo = ds.rounds * T * Math.max(0, C - 1 - 8 * (T - 1));
          if (ds.singleSwapsTried > hi || ds.singleSwapsTried < lo) {
            anchor(
              `the dispersion pass says it examined ${ds.singleSwapsTried} single swap(s) over ${ds.rounds} ` +
                `round(s). It offers every one of ${T} slot(s) every one of ${C} candidate seat(s) except ` +
                `its own and those the D8 tower-adjacency prior refuses — at most 8 per standing tower — ` +
                `so the count lies in [${lo}, ${hi}]. ${why}`,
            );
          }
        }
        const mv = tw.mobilityVeto || {};
        if (typeof mv.tried === "number") {
          const rounds = typeof mv.rounds === "number" ? mv.rounds : 0;
          if (mv.tried > rounds * T * (C - 1)) {
            anchor(
              `the mobility veto says it examined ${mv.tried} swap(s) over ${rounds} round(s), and ` +
                `${T} slot(s) against ${C} candidate seat(s) is at most ${rounds * T * (C - 1)} of them. ${why}`,
            );
          }
          if (mv.tried > 0 !== rounds > 0) {
            anchor(
              `the mobility veto says it examined ${mv.tried} swap(s) in ${rounds} round(s). The counter ` +
                `is incremented inside the round loop, so the two are positive together or not at all. ${why}`,
            );
          }
        }
      }
    }
    // ==================================================================
    // ROUND 17 / O4 — THREE BOARDS, THREE NAMES, AND A READER FOR EACH.
    // ==================================================================
    // `meta.shell.deepTiles` was one label over two different boards and NO
    // reader at all: 9999 escaped, 0 escaped, deleting it escaped, and
    // flipping `budgetPass` escaped — while the gallery card printed it as
    // shipped fact ("cut N · deep M") and plan.mjs called it "deep tiles
    // sealed in". Round 17's producer publishes all three figures under names
    // that say which board each is on. All three are re-derived here, and so
    // are the two numbers that were computed FROM the first one and read by
    // nothing: the space-budget verdict and the rampart upkeep.
    {
      const bad4 = [];
      const sh = plan.meta?.shell || {};
      const cutK4 = new Set(cutPts.map((c) => key(c.x, c.y)));
      const roadK4 = new Set((s.road || []).map((r) => key(r.x, r.y)));
      const occ4 = new Set();
      for (const [t2, arr2] of Object.entries(s)) {
        if (t2 === "road" || t2 === "rampart") continue;
        for (const q2 of arr2 || []) occ4.add(key(q2.x, q2.y));
      }
      let shippedFreeDeep = 0;
      let shippedDeepInterior = 0;
      for (let y = 2; y <= 47; y++) {
        for (let x = 2; x <= 47; x++) {
          const i2 = idx(x, y);
          if (isWall(terrain, x, y)) continue;
          if (ext[i2]) continue;
          if (depth[i2] < DEPTH_SAFE) continue;
          shippedDeepInterior++;
          const k4 = key(x, y);
          if (cutK4.has(k4) || roadK4.has(k4) || occ4.has(k4)) continue;
          shippedFreeDeep++;
        }
      }
      if (typeof sh.negotiationFreeDeep === "number" && sh.negotiationFreeDeep !== sh.deepTiles) {
        bad4.push(
          `\`negotiationFreeDeep\` says ${sh.negotiationFreeDeep} and \`deepTiles\` says ` +
            `${JSON.stringify(sh.deepTiles)}. They are the same measurement under two names — the honest ` +
            `one and the one every reader had to guess at`,
        );
      }
      if (sh.shippedFreeDeep !== shippedFreeDeep) {
        bad4.push(
          `\`shippedFreeDeep\` says ${JSON.stringify(sh.shippedFreeDeep)} and the board this room ships ` +
            `carries ${shippedFreeDeep} free deep tile(s) (depth >= ${DEPTH_SAFE}, inside the 2..47 band, ` +
            `not exterior, not cut, not road, nothing standing on it)`,
        );
      }
      if (sh.shippedDeepInterior !== shippedDeepInterior) {
        bad4.push(
          `\`shippedDeepInterior\` says ${JSON.stringify(sh.shippedDeepInterior)} and this room's shipped ` +
            `wall encloses ${shippedDeepInterior} deep interior tile(s), whatever is standing on them`,
        );
      }
      if (typeof sh.deepTilesBasis !== "string" || sh.deepTilesBasis.trim().length < 60) {
        bad4.push(
          `\`deepTilesBasis\` is ${String(JSON.stringify(sh.deepTilesBasis)).slice(0, 40)} — three figures ` +
            `that differ by 100-plus tiles need the sentence that says which board each one is on, which is ` +
            `precisely what one label over two boards cost the gallery card for a whole round`,
        );
      }
      // ...and the two numbers computed FROM the negotiation figure, which
      // nothing read: the space-budget verdict (`deepTiles >= NEED_DEEP`, and
      // NEED_DEEP is PROGRAM_TILES 78 + CORRIDOR_OVERHEAD 45) and the upkeep
      // the wall costs per tick (ramparts x RAMPART_UPKEEP).
      if (typeof sh.deepTiles === "number" && sh.budgetPass !== sh.deepTiles >= NEED_DEEP) {
        bad4.push(
          `\`budgetPass\` says ${JSON.stringify(sh.budgetPass)} and this room negotiated ${sh.deepTiles} ` +
            `free deep tile(s) against the program's floor of ${NEED_DEEP} (${PROGRAM_TILES} program tiles ` +
            `plus ${CORRIDOR_OVERHEAD} of corridor). The verdict is the comparison; publishing it and ` +
            `reading neither side of it is how a false one ships`,
        );
      }
      const wantUpkeep = Math.round((s.rampart || []).length * RAMPART_UPKEEP * 100) / 100;
      if (typeof sh.upkeepPerTick === "number" && Math.abs(sh.upkeepPerTick - wantUpkeep) > 0.005) {
        bad4.push(
          `\`upkeepPerTick\` says ${sh.upkeepPerTick} and ${(s.rampart || []).length} rampart(s) at ` +
            `${RAMPART_UPKEEP} energy/tick each is ${wantUpkeep}`,
        );
      }
      for (const b of bad4) {
        fails.push(
          `META — meta.shell (the deep-tile figures): ${b}. One label over two boards, printed by the ` +
            `gallery as shipped fact and read by nothing — 9999, 0, deletion and a flipped budget verdict ` +
            `all passed 172/172 in round 17.`,
        );
      }
    }

    // ==================================================================
    // ROUND 17 / O2 + O3 — THE TWO RE-COMPOSING PASSES END ON THIS BOARD.
    // ==================================================================
    // Round 16's across-prior take read `refill` as a MAX, so E3S1 bought +30
    // damage for a filler-walk regression its own instrument could not see:
    // the moved tower's walk went 6 -> 10 and the room's total 42 -> 46 in a
    // room that DECLARES `towers/weak-battery` on that very walk. Round 17's
    // producer puts the whole battery on the panel — the per-tower walk
    // vector, its total, how many walks sit at the hard cap and how many over
    // the soft note — plus the two legality readings a re-composition can
    // break without moving any instrument (`stackedOnRoad`, `orphanRoads`).
    // Round 17 also adds a SECOND re-composing pass, the one-move sealed-floor
    // recovery, with panels of the same shape.
    //
    // A panel is only worth the decision made on it if it ENDS WHERE THE BOARD
    // ENDS. The final panel of each pass — `after` when the pass took
    // something, `before` when it did not — is checked here against this
    // room's own shipped readings, field by field.
    {
      const bad5 = [];
      const shippedWalks = batteryDerived ? batteryDerived.refillDists.slice().sort((a, b) => a - b) : null;
      const finalPanel = (rec) =>
        rec && rec.taken ? rec.after : rec ? rec.before : null;
      const checkPanel = (what, panel) => {
        if (!panel || typeof panel !== "object") return;
        if (shippedWalks && Array.isArray(panel.refillWalks)) {
          const mine = panel.refillWalks.slice().sort((a, b) => a - b);
          if (JSON.stringify(mine) !== JSON.stringify(shippedWalks)) {
            bad5.push(
              `${what} publishes the battery's filler walks as [${panel.refillWalks.join(",")}] and the ` +
                `board this room ships walks [${shippedWalks.join(",")}]. The walks are the panel's whole ` +
                `answer to "does this move cost the filler anything" — round 16 read only their MAXIMUM, ` +
                `and E3S1 bought a 42 -> 46 total regression the maximum could not see`,
            );
          }
        } else if (shippedWalks && panel.refillWalks !== undefined) {
          bad5.push(`${what} publishes \`refillWalks\` as ${String(JSON.stringify(panel.refillWalks)).slice(0, 40)}, not a list of walks`);
        }
        if (shippedWalks) {
          const total = shippedWalks.reduce((a, b) => a + b, 0);
          const atCap = shippedWalks.filter((d) => d >= MAX_REFILL).length;
          const overNote = shippedWalks.filter((d) => d > REFILL_NOTE).length;
          if (panel.refillTotal !== undefined && panel.refillTotal !== total) {
            bad5.push(`${what} says the walks total ${JSON.stringify(panel.refillTotal)} and this room's walks total ${total}`);
          }
          if (panel.refillAtCap !== undefined && panel.refillAtCap !== atCap) {
            bad5.push(`${what} says ${JSON.stringify(panel.refillAtCap)} walk(s) sit at the hard cap of ${MAX_REFILL} and this room ships ${atCap}`);
          }
          if (panel.refillOverNote !== undefined && panel.refillOverNote !== overNote) {
            bad5.push(`${what} says ${JSON.stringify(panel.refillOverNote)} walk(s) are over the ${REFILL_NOTE}-step note and this room ships ${overNote}`);
          }
        }
        // the two legality readings the pass added because a re-composition
        // broke them without moving any instrument (P17's own E11S7 finding)
        if (panel.stackedOnRoad !== undefined && panel.stackedOnRoad !== 0) {
          bad5.push(
            `${what} ends with \`stackedOnRoad\` ${JSON.stringify(panel.stackedOnRoad)} — a structure ` +
              `standing on a road tile is a HARD failure of this file, so a panel that ends there is a panel ` +
              `describing a room this room is not`,
          );
        }
        if (panel.orphanRoads !== undefined && panel.orphanRoads !== 0) {
          bad5.push(`${what} ends with \`orphanRoads\` ${JSON.stringify(panel.orphanRoads)} and this file fails a room with a road serving nothing`);
        }
        if (panel.extensions !== undefined && panel.extensions !== (s.extension || []).length) {
          bad5.push(`${what} says the room holds ${JSON.stringify(panel.extensions)} extension(s) and it ships ${(s.extension || []).length}`);
        }
        if (panel.ramparts !== undefined && panel.ramparts !== (s.rampart || []).length) {
          bad5.push(`${what} says the room holds ${JSON.stringify(panel.ramparts)} rampart(s) and it ships ${(s.rampart || []).length}`);
        }
      };
      const takeRec = plan.meta?.towers?.acrossPriorTake;
      const recovRec = plan.meta?.sealedRecovery;
      // the sealed recovery runs BEFORE the take, so the take's final panel is
      // the board and the recovery's is the board the take then read
      if (takeRec) checkPanel("`acrossPriorTake`'s final panel", finalPanel(takeRec));
      else if (recovRec) checkPanel("`sealedRecovery`'s final panel", finalPanel(recovRec));
      // ...and the take's refusal, when it refused, has to say what refused it
      const outcome = plan.meta?.towers?.adjacency?.satAcrossPrior?.takeOutcome;
      if (outcome) {
        if (outcome.taken !== false) {
          bad5.push(`\`satAcrossPrior.takeOutcome\` is written only for a REFUSED lift and says \`taken\` ${JSON.stringify(outcome.taken)}`);
        }
        if (typeof outcome.verdict !== "string" || outcome.verdict.trim().length < 40 || !/\d/.test(outcome.verdict)) {
          bad5.push(
            `\`satAcrossPrior.takeOutcome.verdict\` is ${String(JSON.stringify(outcome.verdict)).slice(0, 50)} — ` +
              `a refusal that does not quote the instrument that refused it is the "a reason exists" rule ` +
              `round 10 retired, in the record that prices the forgone damage`,
          );
        }
        if (takeRec && takeRec.taken) {
          bad5.push(`\`satAcrossPrior.takeOutcome\` records a REFUSED lift and \`acrossPriorTake.taken\` records a taken one`);
        }
      }
      for (const b of bad5) {
        fails.push(
          `META — the re-composing passes: ${b}. A pass that re-composes the room and keeps the result on ` +
            `an instrument panel is only as honest as the panel, and the panel has to end where the board ` +
            `ends.`,
        );
      }
    }

    const derivedRecordFor = (sf, g, k) => {
      const der = {};
      const put = (path, v) => {
        if (v !== undefined) der[path] = v;
      };
      const cut = cutPts;
      const cutK = new Set(cut.map((c) => key(c.x, c.y)));
      const rampK2 = new Set((s.rampart || []).map((r) => key(r.x, r.y)));
      const ctrl = (objects || []).find((o) => o.type === "controller") || plan.controller || null;
      const mineral = (objects || []).find((o) => o.type === "mineral") || plan.mineral || null;

      // ---------------------------------------------------------- towerRefill
      if (g === "towerrefill" && !k) {
        if (batteryDerived) put("towerRefill.maxRefill", batteryDerived.maxRefill);
        put("towerRefill.cap", MAX_REFILL);
      }

      // ---------------------------------------------------------- shell (link on cut)
      if (g === "shell" && !k) {
        put("linkOnCut.cutTiles", cut.length);
        put(
          "linkOnCut.onCut",
          (s.link || []).filter((l) => cutK.has(key(l.x, l.y))).length,
        );
        if (typeof plan.meta?.shell?.linkCutForced === "boolean") {
          put("linkOnCut.forced", plan.meta.shell.linkCutForced);
        }
      }

      // ---------------------------------------------------------- battlements
      if (g === "battlements") {
        // A cut tile is UNREACHABLE when the finished base's own walk region —
        // the same region every mobility metric in this file runs over — cannot
        // reach it. Re-derived tile by tile off the shipped ramparts.
        const unreachable = cut.filter(
          (c) => rampK2.has(key(c.x, c.y)) && !garrisonWalk[idx(c.x, c.y)],
        );
        put("battlements.unreachable", unreachable.length);
        put("battlements.cutTiles", cut.length);
        if (k === "unreachable") {
          const atL2 = sf.battlements?.unreachableAtLayer2;
          if (typeof atL2 === "number") put("battlements.strandedByMass", unreachable.length - atL2);
        } else if (!k) {
          put("battlements.substitute.thisCut", cut.length);
        }
      }

      // ---------------------------------------------------------- misc/off-network
      if (g === "misc" && k === "off-network") {
        if (mineral) {
          put("offNetwork.mineral.x", mineral.x);
          put("offNetwork.mineral.y", mineral.y);
        }
        put("offNetwork.roads", (s.road || []).length);
        // `seats` counts the CONTAINER tiles this declaration names — the
        // extractor is named on the same list and is not a seat
        const named = (sf.tiles || []).filter((t) => t && Number.isInteger(t.x));
        const seatPts = named.filter((t) => (s.container || []).some((c) => c.x === t.x && c.y === t.y));
        put("offNetwork.seats", seatPts.length);
        const exq = (s.extractor || [])[0];
        if (exq) {
          put("offNetwork.extractor.x", exq.x);
          put("offNetwork.extractor.y", exq.y);
          // the same network the seat's own count is taken over: roads and
          // containers, minus the seat itself, which does not put itself on the
          // network
          const seatK = new Set(seatPts.map((t) => key(t.x, t.y)));
          const netK = new Set((s.road || []).map((r) => key(r.x, r.y)));
          for (const c of s.container || []) netK.add(key(c.x, c.y));
          for (const t of seatK) netK.delete(t);
          put(
            "offNetwork.extractorNetTiles",
            D8.filter(([dx, dy]) => netK.has(key(exq.x + dx, exq.y + dy))).length,
          );
          // A MINERAL IS AN OBSTACLE, so nothing ever stands on the extractor's
          // tile. That is the whole argument this declaration makes about it and
          // it is a fact about the engine, so it is re-derived rather than read.
          put("offNetwork.extractorStands", false);
          put("offNetwork.extractorObstacle", "mineral");
        } else {
          put("offNetwork.extractor", null);
        }
        let net = 0;
        for (const p of seatPts) {
          for (const [dx, dy] of D8) {
            const nk = key(p.x + dx, p.y + dy);
            if (roadSet.has(nk) || (s.container || []).some((c) => key(c.x, c.y) === nk)) net++;
          }
        }
        put("offNetwork.netTiles", net);
        put("offNetwork.regenTicks", 50000);
        put("offNetwork.extractorCooldown", 5);
      }

      // ---------------------------------------------------------- runtime
      if (g === "runtime" && k === "heavy-search") {
        const pub = plan.meta?.compositions;
        if (pub) {
          put("runtime.compositions", pub.total);
          put("runtime.seeds", pub.seeds);
          put("runtime.complete", pub.complete);
        }
        put("runtime.ladder", RUNTIME_NOTE_COMPOSES);
        if (typeof plan.meta?.seedSkip === "number") put("runtime.seedSkip", plan.meta.seedSkip);
      }

      // ---------------------------------------------------------- towers/clump
      if (g === "towers" && k === "clump") {
        const within = (s.tower || []).filter((t) => chebyshev(t, sitter) <= 2);
        put("clump.within", within.length);
        put("clump.total", (s.tower || []).length);
        put("clump.cheb", 2);
        put("clump.note", CLUMP_NOTE);
        put("clump.sitter.x", sitter.x);
        put("clump.sitter.y", sitter.y);
        put("source", "towers");
        const td = plan.meta?.towers?.towerDispersion;
        if (td) {
          if (Array.isArray(td.counted)) put("dispersion.counted", td.counted);
          if (typeof td.after === "number") put("dispersion.windowAfter", td.after);
          // ...and the two AFTER readings that are the shipped board, re-derived
          // from this room's own towers rather than copied off the mirror.
          if (Array.isArray(td.search?.instruments)) put("dispersion.search.instruments", td.search.instruments);
          if (td.search && typeof td.search.clumpAfter === "number") {
            put("dispersion.search.clumpAfter", within.length);
          }
          if (td.search && typeof td.search.towerWindowAfter === "number") {
            let best = 0;
            for (let cy = 2; cy <= 47; cy++) {
              for (let cx = 2; cx <= 47; cx++) {
                let n = 0;
                for (const t of s.tower || []) if (Math.abs(t.x - cx) <= 2 && Math.abs(t.y - cy) <= 2) n++;
                if (n > best) best = n;
              }
            }
            put("dispersion.search.towerWindowAfter", best);
          }
        }
      }

      // ---------------------------------------------------------- towers/weak-battery
      if (g === "towers" && k === "weak-battery" && batteryDerived) {
        const faceDmg = (c) => {
          let d = 0;
          for (const t of s.tower || []) {
            const r = chebyshev(t, c);
            d += r <= 5 ? 600 : r >= 20 ? 150 : 600 - (r - 5) * 30;
          }
          return d;
        };
        {
          const tw3 = plan.meta?.towers || {};
          const l3Filed =
            typeof tw3.minShellDmg === "number" &&
            typeof tw3.maxRefillAtPlacement === "number" &&
            tw3.minShellDmg >= TOWER_TARGET_MIN &&
            (tw3.minShellDmg < WEAK_SHELL_DMG || tw3.maxRefillAtPlacement > REFILL_NOTE);
          put("source", l3Filed ? "towers" : "walls");
        }
        put("battery.maxRefill", batteryDerived.maxRefill);
        put("battery.refillDists", batteryDerived.refillDists);
        put("battery.minShellDmg", batteryDerived.minShellDmg);
        put("battery.avgShellDmg", batteryDerived.avgShellDmg);
        put("battery.cutTiles", batteryDerived.cutTiles);
        put("battery.maxRefillHard", MAX_REFILL);
        put("battery.refillNote", REFILL_NOTE);
        put("battery.weakShellDmg", WEAK_SHELL_DMG);
        put("battery.targetMin", TOWER_TARGET_MIN);
        put("battery.refillUnreachable", batteryDerived.refillDists.filter((d) => !isFinite(d)).length);
        // ROUND 17 / F2: layer 3's own walks, re-derived on the board layer 3
        // had (see `towers/placement-refill`). These two were the unaudited
        // inputs the `source` derivation stood on.
        if (placementRefill) {
          put("battery.refillDistsAtPlacement", placementRefill.dists);
          put("battery.maxRefillAtPlacement", placementRefill.max);
        }
        put("towers.depthSafe", DEPTH_SAFE);
        // ROUND 17 / F3: `spreadRadius` was a witnessed layer-3 number with a
        // mirror and a ceiling of "half the room", so a coordinated edit put it
        // anywhere inside [0, 25] in all 15 declaring rooms. It is not layer
        // 3's at all — the producer computes it from the battery it FINISHES
        // with, which is the battery the room ships, and it reproduces here in
        // 172 of 172 rooms: the largest chebyshev distance from a tower to the
        // six towers' own centroid, at the producer's one decimal place.
        {
          const tws = s.tower || [];
          if (tws.length) {
            const cx = tws.reduce((a, t) => a + t.x, 0) / tws.length;
            const cy = tws.reduce((a, t) => a + t.y, 0) / tws.length;
            put(
              "towers.spreadRadius",
              Math.round(Math.max(...tws.map((t) => Math.max(Math.abs(t.x - cx), Math.abs(t.y - cy)))) * 10) / 10,
            );
          }
        }
        put("towers.refillCap", MAX_REFILL);
        put("towers.refillNote", REFILL_NOTE);
        put("towers.weakShellDmg", WEAK_SHELL_DMG);
        put("towers.maxRefillHard", MAX_REFILL);
        put("towers.targetMin", TOWER_TARGET_MIN);
        if (cut.length) {
          let worst = null;
          let wd = null;
          for (const c of cut) {
            const d = faceDmg(c);
            if (wd === null || d < wd) {
              wd = d;
              worst = c;
            }
          }
          // the HARD floor, not the weak line: layer 3 counts a tile weak when
          // it is under `targetMin`, and the 1800 beside it is the fleet band
          // the paragraph's first clause is selected on
          put("battery.weakTiles", cut.filter((c) => faceDmg(c) < TOWER_TARGET_MIN).length);
          if (worst) {
            put("battery.worst.x", worst.x);
            put("battery.worst.y", worst.y);
            put("battery.worstOnLink", (s.link || []).some((l) => l.x === worst.x && l.y === worst.y));
          }
        }
      }

      // ---------------------------------------------------------- eco
      if (g === "eco" && !k) {
        const hubTile = (s.storage || [])[0] || sitter;
        const w = ecoWalks(terrain, objects, hubTile);
        put("eco.pathController", w.pc);
        put("eco.pathSourcesSum", w.ps);
        put("eco.anchorSpread", w.sepCheb);
        put("eco.anchorWalkSpread", w.sepWalk);
        put("eco.anchorWalkFloor", w.floor);
        put("eco.anchorFloorBasis", w.basis);
        put("eco.chebFloor", w.chebFloor);
        put("eco.walkFloor", w.walkFloor);
        put("eco.spreadPair", w.spreadPair);
        put("eco.walkPair", w.walkPair);
        put("eco.ctrlAbs", ECO_CTRL_ABS);
        put("eco.srcAbs", ECO_SRC_ABS);
        put("eco.relMult", ECO_REL_MULT);
        if (fleet) {
          put("eco.ctrlMedian", fleet.ctrlMedian);
          put("eco.srcMedian", fleet.srcMedian);
          put("eco.ctrlGate", fleet.ctrlGate);
          put("eco.srcGate", fleet.srcGate);
          put("eco.fleetMediansMeasured.ctrlWalk", fleet.ctrlMedian);
          put("eco.fleetMediansMeasured.srcSum", fleet.srcMedian);
          if (typeof fleet.rooms === "number") put("eco.fleetMediansMeasured.rooms", fleet.rooms);
        }
        if (typeof plan.meta?.seedSkip === "number") put("eco.seedSkip", plan.meta.seedSkip);
        // the two bearing clauses: the same octant function the producer uses,
        // taken from the same origin (the hub, not the storage)
        const OCT = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
        const bear = (from, to) =>
          OCT[(Math.round((Math.atan2(to.y - from.y, to.x - from.x) * 4) / Math.PI) + 8) % 8];
        const hub = plan.hub || hubTile;
        if (ctrl) put("eco.ctrlBearing", bear(hub, ctrl));
        put(
          "eco.srcBearings",
          (objects || []).filter((o) => o.type === "source").map((o) => bear(hub, o)),
        );
      }

      // ---------------------------------------------------------- extensions/shallow
      if (g === "extensions" && k === "shallow") {
        put("shallowExt.count", (s.extension || []).filter((e) => depth[idx(e.x, e.y)] < DEPTH_SAFE).length);
        put("shallowExt.total", (s.extension || []).length);
        put("shallowExt.depthSafe", DEPTH_SAFE);
        // OF10: the band the scan swept, and the room's OWN interior floor —
        // two different numbers that one sentence used to call by one name.
        put("shallowExt.search.bandSide", Math.round(Math.sqrt(BUILDABLE_BAND_TILES)));
        put("shallowExt.search.interiorWalkable", boardFacts.interiorWalkable);
      }

      // ---------------------------------------------------------- mobility (both kinds)
      if (g === "mobility" && mBuilt) {
        const fr = deriveFree();
        const lf = deriveLift();
        const wpAny = mBuilt.worstGated || mBuilt.worst || null;
        // THE VERDICT AND THE PAIR LABEL, DERIVED FROM SCRATCH. Not copied off
        // `meta.shell.mobilityBuilt` — that record is re-derived a few hundred
        // lines up and copying one onto the other would make each the other's
        // evidence. The lift board decides the room's verdict; the as-built
        // worst pair carries its own label; the two walks are the evidence the
        // paragraph's CAUSE clause quotes.
        const pcDecl = causeWalksOf(wpAny);
        let derCauseV = "none";
        if (mBuilt.maxGated > MOB_TARGET && lf) {
          if (lf.maxGated <= MOB_TARGET) derCauseV = "structures";
          else {
            const lw = lf.worstGated || lf.worst || wpAny;
            const pc = causeWalksOf(lw);
            if (pc) derCauseV = pc.cause === "structures" ? "shape" : pc.cause;
          }
        }
        // ...and the covered-detour entry's `cause` is the SAME lift test with
        // no gating guard in front of it (layer-walls.mjs:812 calls
        // `mobilityLift` unconditionally), so a room inside the target still
        // gets a real verdict there while `mobility|`'s is "none".
        const liftVerdict = () => {
          if (!lf) return null;
          if (lf.maxGated <= MOB_TARGET) return "structures";
          const lw = lf.worstGated || lf.worst || wpAny;
          const pc = causeWalksOf(lw);
          return pc ? (pc.cause === "structures" ? "shape" : pc.cause) : null;
        };
        put("cause", k === "covered-detour" ? liftVerdict() : derCauseV);
        if (pcDecl) {
          put("pairCause", pcDecl.cause);
          put("causeWalks.noStructures", pcDecl.noStructures);
          put("causeWalks.noWalls", pcDecl.noWalls);
        }
        if (!k) {
          put("source", "built");
          put("metric.max", mBuilt.max);
          put("metric.maxGated", mBuilt.maxGated);
          put("metric.over", mBuilt.over);
          put("metric.overGated", mBuilt.overGated);
          put("metric.pairs", mBuilt.pairs);
          put("metric.gatedPairs", mBuilt.gatedPairs);
          put("metric.target", MOB_TARGET);
          put("metric.detourFloor", MOB_DETOUR_FLOOR);
          put("metric.massSharePct", MOB_MASS_SHARE_PCT);
          put("metric.massMinorPct", MOB_MASS_MINOR_PCT);
          put("negotiated.metric.detourFloor", MOB_DETOUR_FLOOR);
          put("ladder.target", MOB_TARGET);
          if (fr) {
            put("metric.bareOver", fr.over);
            put("metric.bareOverGated", fr.overGated);
            put("mass.bareLap", fr.maxGated);
          }
          put("mass.builtLap", mBuilt.maxGated);
          const wp = mBuilt.worstGated || mBuilt.worst || null;
          if (wp) {
            put("worst.a.x", wp.a.x);
            put("worst.a.y", wp.a.y);
            put("worst.b.x", wp.b.x);
            put("worst.b.y", wp.b.y);
            put("worst.din", wp.din);
            put("worst.dout", wp.dout);
            const pw = pairWalk(wp.a, wp.b, mobBlocked);
            put("mass.din", pw.din);
            put("mass.dout", pw.dout);
            const pf = pairWalk(wp.a, wp.b, mobBlockedFree);
            put("mass.bareDin", pf.din);
            if (pw.din !== null && pf.din !== null) put("mass.adds", pw.din - pf.din);
            // `worstCaused` is layer-walls.mjs:279 verbatim: the room misses,
            // the mass-free walk of this pair exists, and that walk is NOT
            // itself over target on the GATED reading — i.e. our own mass is
            // what pushed this one pair over.
            if (pf.din !== null && pw.dout) {
              const freeOverGated = pf.din - pw.dout > MOB_DETOUR_FLOOR && pf.din / pw.dout > MOB_TARGET;
              put("worstCaused", mBuilt.maxGated > MOB_TARGET && !freeOverGated);
            } else {
              put("worstCaused", false);
            }
          }
          // the lift block, copied from the record this file already re-derives
          // field by field a few hundred lines up — one room, one lift test
          if (mBuilt.maxGated <= MOB_TARGET) put("lift", null);
          else if (lf) {
            put("lift.liftedLap", lf.maxGated);
            put("lift.liftedOverGated", lf.overGated);
            put("lift.liftedGatedPairs", lf.gatedPairs);
            put("lift.clears", lf.maxGated <= MOB_TARGET);
            put("lift.cause", derCauseV);
            put(
              "lift.ownPct",
              mBuilt.maxGated > 0
                ? Math.max(0, Math.round(((mBuilt.maxGated - lf.maxGated) / mBuilt.maxGated) * 100))
                : 0,
            );
            put(
              "lift.present",
              LIFTABLE_V.filter((t) => (s[t] || []).length > 0),
            );
            const mbl = plan.meta?.shell?.mobilityBuilt?.lift;
            if (mbl && Array.isArray(mbl.solo)) put("lift.solo", mbl.solo);
            if (mbl && Array.isArray(mbl.classes)) put("lift.classes", mbl.classes);
            const lw = lf.worstGated || lf.worst || wp || null;
            if (lf.maxGated <= MOB_TARGET) {
              put("lift.residual", null);
              // perClass: the SHIPPED worst pair re-walked with one class lifted
              for (const c of LIFTABLE_V) {
                if (!(s[c] || []).length || !wp) continue;
                const din = mobArrive(mobBfs(walkFor(blockedLifting([c])), wp.a), wp.b);
                put(`lift.perClass.${c}.pairDin`, isFinite(din) ? din : null);
              }
            } else if (lw) {
              const cw = causeWalksOf(lw);
              put("lift.residual.dStruct", cw.noStructures);
              put("lift.residual.dFree", cw.noWalls);
              put("lift.residual.pair.a.x", lw.a.x);
              put("lift.residual.pair.a.y", lw.a.y);
              put("lift.residual.pair.b.x", lw.b.x);
              put("lift.residual.pair.b.y", lw.b.y);
            }
          }
        }
        if (k === "covered-detour") {
          const t = (sf.tiles || []).filter((p) => p && Number.isInteger(p.x));
          put("record.target", MOB_TARGET);
          put("record.detourFloor", MOB_DETOUR_FLOOR);
          put("record.gatedLap", mBuilt.maxGated);
          put("record.gatedPairs", mBuilt.gatedPairs);
          put("record.coveredPairs", mBuilt.coveredPairs);
          put("record.pairs", mBuilt.pairs);
          if (lf) put("record.liftedLap", lf.maxGated);
          put(
            "record.present",
            LIFTABLE_V.filter((ty) => (s[ty] || []).length > 0),
          );
          if (t.length === 2) {
            const pw = pairWalk(t[0], t[1], mobBlocked);
            put("record.din", pw.din);
            put("record.dout", pw.dout);
            if (pw.din !== null && pw.dout !== null) put("record.detour", pw.din - pw.dout);
            if (pw.din !== null && pw.dout) put("record.ratio", Math.round((pw.din / pw.dout) * 100) / 100);
            const cw = causeWalksOf({ a: t[0], b: t[1], din: pw.din, dout: pw.dout });
            put("record.noStructures", cw.noStructures);
            put("record.noWalls", cw.noWalls);
          }
        }
      }

      // ---------------------------------------------------------- labs
      if (g === "labs") {
        put("source", "labs");
        put("labs.depthSafe", DEPTH_SAFE);
        if (k === "lab-haul" || k === "lab-road-eat") put("labs.roadEatCost", ROAD_EAT_COST);
        if (k === "lab-haul" || k === "shallow-lab") put("labs.shallowLabCost", SHALLOW_LAB_COST);
        if (k === "lab-haul") {
          put("labs.fleetMedian", LAB_FLEET_MEDIAN);
          put("labs.fleetP90", LAB_FLEET_P90);
        }
        const labs = s.lab || [];
        if (labs.length) {
          const ax = Math.min(...labs.map((l) => l.x));
          const ay = Math.min(...labs.map((l) => l.y));
          if (k === "lab-haul") {
            put("labs.anchor.x", ax);
            put("labs.anchor.y", ay);
          }
          // MAIN puts its two inputs on the anti-diagonal shoulders and runs its
          // internal road down the main diagonal; ANTI is the mirror. The
          // orientation is therefore readable off the shipped stamp: ANTI is the
          // variant that builds the (ax+1, ay+1) corner.
          const hasMainDiagLab = labs.some((l) => l.x === ax + 1 && l.y === ay + 1);
          if (k === "lab-haul") put("labs.orientation", hasMainDiagLab ? "anti" : "main");
          if (k === "shallow-lab") {
            put("labs.total", labs.length);
            put(
              "labs.shallow",
              labs
                .filter((l) => depth[idx(l.x, l.y)] < DEPTH_SAFE)
                .map((l) => ({ x: l.x, y: l.y, depth: depth[idx(l.x, l.y)] })),
            );
          }
          if (k === "lab-road-eat") {
            put("labs.eaten", (sf.tiles || []).filter((t) => t && Number.isInteger(t.x)).length);
          }
        }
        const L = labBoard();
        if (L) {
          if (k === "lab-haul") put("labs.haulDist", L.haulDist);
          put("labs.deepAnchors", L.deepAnchors);
          if (k === "shallow-lab") {
            put("labs.fallbackAnchors", L.fallbackAnchors);
            put("labs.dryAnchors", L.deepAnchors);
          } else if (k === "lab-road-eat") {
            // passes 3 and 4 are only reached when BOTH clean passes came up
            // empty, so a room that ate road had no clean candidate at all
            put("labs.fallbackAnchors", 0);
            put("labs.deepAnchors", 0);
          } else if (k === "lab-haul" && !labs.some((l) => depth[idx(l.x, l.y)] < DEPTH_SAFE)) {
            // the winner is fully deep, so pass 1 produced it and pass 2 — the
            // depth >= 3 fallback enumeration — never ran. `fallbackAnchors` is
            // then 0 because nobody counted, not because the room has none.
            put("labs.fallbackAnchors", 0);
          }
        }
      }

      // ---------------------------------------------------------- ctrlParks
      if (g === "ctrlparks") {
        const P = parkBoard();
        put("ctrlParks.floor", k === "released" ? MIN_PARKS_FLOOR : MIN_PARKS_FLOOR);
        if (k === "seats") {
          put("ctrlParks.thinAt", THIN_PARKS);
          put("ctrlParks.census.minParksFloor", MIN_PARKS_FLOOR);
          if (ctrl) {
            put("ctrlParks.controller.x", ctrl.x);
            put("ctrlParks.controller.y", ctrl.y);
          }
          if (P) {
            put("ctrlParks.link.x", P.link.x);
            put("ctrlParks.link.y", P.link.y);
            put("ctrlParks.built", P.built);
            put("ctrlParks.eaters", P.eaters);
            put("ctrlParks.parks", P.parks);
            put("ctrlParks.eaten", Math.max(0, P.parks - P.built));
            put("ctrlParks.census.chosen.x", P.link.x);
            put("ctrlParks.census.chosen.y", P.link.y);
            put("ctrlParks.census.chosen.parks", P.parks);
            if (P.byTile.has(key(P.link.x, P.link.y))) {
              const c = P.byTile.get(key(P.link.x, P.link.y));
              put("ctrlParks.census.chosen.hubWalk", c.d);
              put("ctrlParks.census.chosen.score", c.score);
            }
            put("ctrlParks.census.considered", P.considered);
            put("ctrlParks.census.tookFirstAboveFloor", P.parks >= MIN_PARKS_FLOOR);
            const ru = sf.ctrlParks?.census?.runnerUp;
            if (ru && Number.isInteger(ru.x) && P.byTile.has(key(ru.x, ru.y))) {
              const c = P.byTile.get(key(ru.x, ru.y));
              put("ctrlParks.census.runnerUp.parks", c.park);
              put("ctrlParks.census.runnerUp.hubWalk", c.d);
              put("ctrlParks.census.runnerUp.score", c.score);
            }
          }
        }
        if (k === "released") {
          if (P) put("ctrlParks.held", Math.min(P.parks, PARK_PROTECT));
          if (typeof plan.meta?.ctrlParkFloor === "number") put("ctrlParks.kept", plan.meta.ctrlParkFloor);
          if (P && typeof plan.meta?.ctrlParkFloor === "number") {
            put("ctrlParks.released", Math.min(P.parks, PARK_PROTECT) - plan.meta.ctrlParkFloor);
          }
          if (P) put("ctrlParks.parksShipped", P.built);
          // the release loop walks DOWN from one below the reservation it held,
          // and the cap it stopped at is the one the shipped plan was composed
          // with — both are facts the plan already publishes
          if (P) put("ctrlParks.composedFrom", Math.min(P.parks, PARK_PROTECT) - 1);
          if (typeof plan.meta?.ctrlParkFloorCap === "number") {
            put("ctrlParks.winningCap", plan.meta.ctrlParkFloorCap);
          }
          put(
            "ctrlParks.shallowReleasing",
            (s.extension || []).filter((e) => depth[idx(e.x, e.y)] < DEPTH_SAFE).length,
          );
          put("ctrlParks.rampartsReleasing", (s.rampart || []).length);
          if (typeof plan.meta?.shell?.deepTiles === "number") {
            put("ctrlParks.deepTiles", plan.meta.shell.deepTiles);
          }
        }
      }

      // ---------------------------------------------------------- spawnFan
      if (g === "spawnfan" && k === "sector") {
        const around = (s.storage || [])[0] || sitter;
        put("spawnFan.hub.x", around.x);
        put("spawnFan.hub.y", around.y);
        put("spawnFan.target", SECTOR_TARGET);
        put("spawnFan.sectorWeight", SPAWN_SECTOR_WEIGHT);
        put("spawnFan.census.target", SECTOR_TARGET);
        put("spawnFan.census.depthSafe", DEPTH_SAFE);
        put("spawnFan.census.walkCap", SPAWN_WALK_CAP);
        put("spawnFan.census.sectorBins", SPAWN_SECTOR_BINS);
        put("spawnFan.census.sectorDeg", Math.round(360 / SPAWN_SECTOR_BINS));
        const bearDeg = (from, to) => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
        const gap = (a, b) => {
          let d = Math.abs(a - b) % 360;
          if (d > 180) d = 360 - d;
          return d;
        };
        const sectorOf = (ang) => Math.floor(((ang + 360) % 360) / (360 / SPAWN_SECTOR_BINS));
        const angleSetOf = (tiles) => {
          if (!tiles || tiles.length !== 3) return null;
          const a = tiles.map((t) => bearDeg(around, t));
          return {
            minAngle: Math.round(Math.min(gap(a[0], a[1]), gap(a[0], a[2]), gap(a[1], a[2]))),
            sectors: new Set(a.map(sectorOf)).size,
          };
        };
        const shipped = angleSetOf((s.spawn || []).map((t) => ({ x: t.x, y: t.y })));
        if (shipped) {
          put("spawnFan.minAngle", shipped.minAngle);
          put("spawnFan.census.winnerSectors", shipped.sectors);
        }
        const cen = sf.spawnFan?.census || {};
        if (typeof cen.shortlist === "number") {
          const Ls = cen.shortlist;
          const total = Ls >= 3 ? (Ls * (Ls - 1) * (Ls - 2)) / 6 : 0;
          if (typeof cen.triples === "number") {
            put("spawnFan.census.triplesAdjacent", Math.max(0, total - cen.triples));
          }
        }
        const fa = cen.fannedAvailable;
        if (fa && Array.isArray(fa.tiles)) {
          const rival = angleSetOf(fa.tiles.filter((t) => t && Number.isInteger(t.x)));
          if (rival) put("spawnFan.census.fannedAvailable.minAngle", rival.minAngle);
          put("spawnFan.census.fannedAvailable.tiles", fa.tiles);
        }
      }

      return der;
    };

    for (const sf of declared) {
      if (!sf || typeof sf !== "object") continue;
      const g = normGate(sf.gate);
      const k = sf.kind ? String(sf.kind) : null;

      // ---- the closure engine's per-declaration state -------------------
      //
      // `closureGet` reads a dotted path off THIS record; a path prefixed `@`
      // reads off the plan instead (the unconditional meta publication a
      // record is cross-copied against), and a trailing `.length` reads an
      // array's length. `bespokeWanted` collects every BESPOKE claim the
      // record's leaves make and `bespokeRan` is stamped by the blocks that
      // honour them — a claim nobody stamps fails the room, so a bespoke
      // bound cannot be deleted from under the sentence that promises it.
      const closureGet = (path) => {
        // `#fact` is a quantity re-derived from THIS room's terrain and THIS
        // room's shipped structures — the one thing in the closure vocabulary
        // that a census cannot be carried across a room boundary against.
        if (path.startsWith("#")) return boardFacts[path.slice(1)];
        const fromPlan = path.startsWith("@");
        let cur = fromPlan ? plan : sf;
        for (const seg of (fromPlan ? path.slice(1) : path).split(".")) {
          if (cur === null || cur === undefined) return undefined;
          if (seg === "length" && Array.isArray(cur)) return cur.length;
          cur = cur[seg];
        }
        return cur;
      };
      const bespokeWanted = [];
      /** id -> how many PREDICATES the block evaluated on this room */
      const bespokeRan = new Map();
      /**
       * ==================================================================
       * A BESPOKE BLOCK SAYS IT RAN BY SAYING HOW MANY PREDICATES IT RAN.
       * ==================================================================
       * Round 16's owner-voice reviewer (F11, cause 4): the stamp fired on
       * BRANCH ENTRY. `if (g === "ctrlparks" && k === "released") {
       * ranBespoke("ctrlParks.composedCaps.descent"); if (Array.isArray(
       * c.composedCaps)) { …every check… } }` — so a record with no
       * `composedCaps` at all entered the branch, stamped the id, evaluated
       * NOTHING, and satisfied the "the block executed" gate that exists
       * precisely to stop a promised check from not executing. Four ids had
       * that shape (`ctrlParks.composedCaps.descent`,
       * `ctrlParks.seats.ceiling`, `labs.eatAnchors.ceiling`,
       * `labs.refused.network.dormant`).
       *
       * So the stamp is a COUNT now, and it is incremented by the assertion
       * helper the block is written with rather than by hand: `bespoke(id,
       * (B) => …)` shadows `B` with one that counts every predicate it
       * evaluates. A block that evaluated zero predicates did not run, and
       * the leaf that named it fails exactly as if the block were deleted.
       */
      const ranBespoke = (id, n = 1) => bespokeRan.set(id, (bespokeRan.get(id) || 0) + Math.max(0, n));
      /**
       * The block whose predicates are being counted. `ranBespoke(id)` OPENS a
       * region and the assertion helper credits every predicate it evaluates to
       * it; a region that closes with zero predicates has not run. Set per
       * declaration so a block cannot inherit a previous record's cursor.
       */
      let bespokeRegion = null;

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

      // ==================================================================
      // ...AND THE RECORD ITSELF, LEAF BY LEAF, AGAINST THE CLOSED INVENTORY.
      //
      // The prose gate above proves the paragraph IS the record. This is the
      // other half of the sentence declprose.mjs's header promised and could not
      // keep: that the record is the ROOM. Every leaf is looked up in
      // RECORD_LEAVES; a leaf the table does not name fails the room, a leaf the
      // table calls derived is compared against the value derived here, and a
      // leaf the table calls witnessed is held to the bound the table states.
      // ==================================================================
      {
        const dk = `${g}|${k || ""}`;
        const table = RECORD_LEAVES.get(dk);
        if (!table) {
          bad.push(
            `${dk}: this declaration kind has no record-leaf inventory, so every field of its record is ` +
              `unclassified and nothing re-derives any of it`,
          );
        } else {
          let der = {};
          try {
            der = derivedRecordFor(sf, g, k) || {};
          } catch (err) {
            bad.push(
              `${dk}: the record re-derivation threw (${err && err.message ? err.message : String(err)}) — ` +
                `a derivation that cannot run is a check this file promised and does not perform`,
            );
          }
          // ============================================================
          // THE TABLE IS ITERATED FIRST. See the RECORD_ABSENCE header:
          // until this loop existed the engine walked the RECORD, so 347
          // of 420 leaf instances could be DELETED, and whole sub-records
          // with them. A classed leaf the record does not carry fails the
          // room unless RECORD_ABSENCE excuses it by name.
          // ============================================================
          {
            const rules = RECORD_ABSENCE.get(dk) || [];
            /** the arm each branch rule resolves to, computed once */
            const armOf = new Map();
            for (const r of rules) {
              if (r.form !== "branch") continue;
              const arm = r.pick(sf);
              armOf.set(r, arm);
              if (arm === null || !(arm in r.arms)) {
                bad.push(
                  `${dk}: this record takes NONE of the ${Object.keys(r.arms).length} shapes this ` +
                    `declaration kind has (${Object.keys(r.arms).join(" / ")}), so every field of every ` +
                    `shape is excused and the record can be empty. ${r.why}`,
                );
              }
            }
            /**
             * THE GENERIC EXCUSE, AND THE ONLY ONE THAT NEEDS NO TABLE ENTRY:
             * an ancestor of this leaf is ITSELF a classed leaf of this
             * inventory and the record publishes it as exactly `null`. The
             * record has SAID the sub-record does not exist, and it said it in
             * a field that is checked like any other — all four of the fleet's
             * (`lane.shrunk`, `negotiated.eco`, `lift`, `lift.residual`, plus
             * `spawnFan.census.fannedAvailable`) are held to a class here.
             * DELETING the parent rather than nulling it is a missing classed
             * leaf and fails on the loop below.
             */
            const nulledAncestor = (leaf) => {
              const segs = leaf.split(".");
              for (let i = 1; i < segs.length; i++) {
                const anc = segs.slice(0, i).join(".");
                if (segs.slice(0, i).includes("*")) return null;
                if (!(anc in table)) continue;
                if (recordAt(sf, anc) === null) return anc;
              }
              return null;
            };
            const excusedBy = (leaf) => {
              if (nulledAncestor(leaf)) return { why: "a classed ancestor is published as null" };
              for (const r of rules) {
                if (r.form === "branch") {
                  const arm = armOf.get(r);
                  if (arm === null || !(arm in r.arms)) continue;
                  for (const [name, ls] of Object.entries(r.arms)) {
                    if (name !== arm && ls.includes(leaf)) return r;
                  }
                } else if (r.leaves.includes(leaf) && r.when(sf)) {
                  return r;
                }
              }
              return null;
            };
            for (const leaf of Object.keys(table)) {
              if (recordHasLeaf(sf, leaf)) continue;
              const excuse = excusedBy(leaf);
              if (excuse) continue;
              bad.push(
                `${dk}: the record-leaf inventory names \`${leaf}\` and this record DOES NOT CARRY IT. A ` +
                  `leaf that can be deleted is a leaf nothing checks: until round 16 this engine walked ` +
                  `the record rather than the table, and 347 of 420 leaf instances — whole sub-records ` +
                  `included — could simply be removed, taking five planted lies off the audit and leaving ` +
                  `the prose that quoted them standing. Absence is admissible only where RECORD_ABSENCE ` +
                  `names the leaf, the condition it is absent under, and the reason`,
              );
            }
            // ============================================================
            // ...AND THE DERIVATION IS A PRESENCE WITNESS OF ITS OWN.
            //
            // A leaf whose path carries a DYNAMIC segment — `lift.perClass.
            // <class>.pairDin` — is classed under one normalised name, so the
            // table loop above is satisfied by ONE surviving row and the other
            // four can be deleted. (Measured: the fleet's single lift record
            // shipped five per-class rows and all five deleted clean under the
            // table rule alone.) But this file DERIVED each of those rows from
            // the board, by name. A row the derivation produced and the record
            // does not publish is a deleted leaf, whatever the table's
            // normalised spelling says.
            // ============================================================
            for (const derPath of Object.keys(der)) {
              if (!derPath.includes(".")) continue;
              const normed = normLeaf(derPath);
              if (normed === derPath) continue; // no dynamic segment; the table loop covers it
              if (!(normed in table)) continue;
              if (recordAt(sf, derPath) !== undefined) continue;
              if (excusedBy(normed)) continue;
              bad.push(
                `${dk}: this file re-derived \`${derPath}\` from this room's own board and the record does ` +
                  `not publish it. The inventory classes this leaf under its normalised name ` +
                  `(\`${normed}\`), so one surviving row satisfies the presence rule and the rest can be ` +
                  `deleted — the derivation names them one at a time and is the witness that they existed`,
              );
            }

            // ...AND THE KEY SET OF A DYNAMIC CONTAINER IS DERIVED TOO.
            // `lift.perClass` is a map whose KEYS are a measurement (which
            // structure classes this room has to lift). The table can only
            // class the rows; the map itself is checked here, both ways —
            // present when the derivation ran, and carrying exactly the keys
            // the derivation named. Without this the whole map deletes clean
            // in the 54 rooms whose map is legitimately empty.
            {
              const dynParents = new Set();
              for (const leaf of Object.keys(table)) {
                const segs = leaf.split(".");
                const i = segs.indexOf("*");
                if (i > 0) dynParents.add(segs.slice(0, i).join("."));
              }
              for (const parent of dynParents) {
                if (nulledAncestor(`${parent}.*`)) continue;
                const want = new Set();
                for (const derPath of Object.keys(der)) {
                  if (!derPath.startsWith(`${parent}.`)) continue;
                  if (normLeaf(derPath) === derPath) continue;
                  want.add(derPath.slice(parent.length + 1).split(".")[0]);
                }
                const got = recordAt(sf, parent);
                if (got === undefined || got === null || typeof got !== "object" || Array.isArray(got)) {
                  bad.push(
                    `${dk}: the record does not carry \`${parent}\`, and it is a MAP whose keys are a ` +
                      `measurement of this room (${want.size} of them re-derived here` +
                      `${want.size ? `: ${[...want].join(", ")}` : `, and an empty map is still the claim ` +
                        `that the pass ran and found nothing`}). A map that can be deleted whole says ` +
                      `nothing and reads as having said it`,
                  );
                  continue;
                }
                const have = new Set(Object.keys(got));
                const missing = [...want].filter((x) => !have.has(x));
                const extra = [...have].filter((x) => !want.has(x));
                if (missing.length || extra.length) {
                  bad.push(
                    `${dk}: \`${parent}\` is keyed ${JSON.stringify([...have])} and this room's board ` +
                      `re-derives ${JSON.stringify([...want])}` +
                      `${missing.length ? ` — missing ${missing.join(", ")}` : ""}` +
                      `${extra.length ? ` — invented ${extra.join(", ")}` : ""}`,
                  );
                }
              }
            }

            // ...and the null that buys a sub-record's children their absence
            // has to be a null the inventory CLASSES, not an untyped hole.
            for (const leaf of Object.keys(table)) {
              const segs = leaf.split(".");
              for (let i = 1; i < segs.length; i++) {
                const anc = segs.slice(0, i).join(".");
                if (segs.slice(0, i).includes("*")) break;
                if (recordAt(sf, anc) !== null) continue;
                if (anc in table) break;
                bad.push(
                  `${dk}: \`${anc}\` is published as null, which removes \`${leaf}\` and every other leaf ` +
                    `under it from this audit, and \`${anc}\` is not itself a classed leaf of the ` +
                    `inventory. A sub-record may be absent only when its own absence is a checked fact`,
                );
                break;
              }
            }
          }

          // ============================================================
          // ...AND THE ELEMENTS OF EVERY ARRAY THE ELEMENT INVENTORY NAMES.
          // See the RECORD_ARRAY_LEAVES header. Until round 16 an array was
          // one opaque leaf, so `shallowExt.slots[].why` was free text
          // rendered verbatim into the paragraph — E12S6's six priced legal
          // trades laundered into "NO deep target of any kind" — and
          // `ladder.rungs[].mobility` was unchecked by the very block whose
          // sentence claims it checks "the four fields a rung is made of".
          // ============================================================
          {
            const arrays = RECORD_ARRAY_LEAVES.get(dk);
            if (arrays) {
              const elemCtx = {
                depthAt: (x, y) => depth[idx(x, y)],
                builtGated: mBuilt ? mround2(mBuilt.maxGated) : undefined,
                shallowExts: (s.extension || []).filter((e) => depth[idx(e.x, e.y)] < DEPTH_SAFE),
                shallowLabs: (s.lab || []).filter((e) => depth[idx(e.x, e.y)] < DEPTH_SAFE),
              };
              for (const [arrPath, spec] of Object.entries(arrays)) {
                const arr = recordAt(sf, arrPath);
                if (arr === undefined || arr === null) continue; // presence is the loop above's job
                if (!Array.isArray(arr)) {
                  bad.push(`${dk}: \`${arrPath}\` is ${JSON.stringify(arr).slice(0, 60)} and the element inventory says it is a list`);
                  continue;
                }
                const classed = Object.keys(spec.fields);
                for (let i = 0; i < arr.length; i++) {
                  const el = arr[i];
                  const at = `${arrPath}[${i}]`;
                  if (!el || typeof el !== "object" || Array.isArray(el)) {
                    bad.push(`${dk}: \`${at}\` is ${JSON.stringify(el)} and every element of this list is a record`);
                    continue;
                  }
                  // the element's field set is CLOSED, both ways
                  for (const f of Object.keys(el)) {
                    if (!classed.includes(f)) {
                      bad.push(
                        `${dk}: \`${at}.${f}\` is ${String(JSON.stringify(el[f])).slice(0, 60)} and the ` +
                          `element inventory does not name it. An unnamed field of an array element is ` +
                          `unchecked by default, which is what made \`slots[].why\` a free-text channel ` +
                          `inside an audited record`,
                      );
                    }
                  }
                  const elemGet = (path) => {
                    if (path.startsWith("~")) return el[path.slice(1)];
                    return closureGet(path);
                  };
                  for (const f of classed) {
                    const fc = spec.fields[f];
                    if (!(f in el)) {
                      bad.push(
                        `${dk}: \`${at}\` does not carry \`${f}\`, which the element inventory classes ` +
                          `${fc.klass}. ${fc.why}`,
                      );
                      continue;
                    }
                    const v = el[f];
                    if (fc.klass === "derived") {
                      let want;
                      try {
                        want = fc.derive(el, i, elemCtx);
                      } catch {
                        want = undefined;
                      }
                      if (want === undefined) {
                        bad.push(
                          `${dk}: \`${at}.${f}\` is classed RE-DERIVED and this room's derivation produced ` +
                            `no value for it — most often because the list is LONGER than the board's own ` +
                            `answer (${arr.length} rows against a board that supports fewer)`,
                        );
                      } else if (JSON.stringify(v) !== JSON.stringify(want)) {
                        bad.push(`${dk}: \`${at}.${f}\` says ${JSON.stringify(v)}, re-derived it is ${JSON.stringify(want)}`);
                      }
                    } else if (fc.klass === "prose") {
                      const hits = fc.classes.filter((c) => {
                        try {
                          return !!c.when(el, sf);
                        } catch {
                          return false;
                        }
                      });
                      if (hits.length !== 1) {
                        bad.push(
                          `${dk}: \`${at}\` claims ${hits.length} of the ${fc.classes.length} sentence ` +
                            `classes this field has (${fc.classes.map((c) => c.id).join(", ")}). Exactly one ` +
                            `class describes a row, and the row's own numbers pick it — a row that picks ` +
                            `none or two is a row whose sentence is not a function of it`,
                        );
                        continue;
                      }
                      let want = null;
                      try {
                        want = hits[0].render(el, sf, elemCtx);
                      } catch (err) {
                        bad.push(`${dk}: \`${at}.${f}\` cannot be generated from the row (${err && err.message})`);
                        continue;
                      }
                      if (normText(String(v)) !== normText(want)) {
                        const a = normText(String(v));
                        const b2 = normText(want);
                        let ci = 0;
                        while (ci < a.length && ci < b2.length && a[ci] === b2[ci]) ci++;
                        bad.push(
                          `${dk}: \`${at}.${f}\` is not the sentence this row generates. They agree for ` +
                            `${ci} character(s) and then diverge — shipped: "…${a.slice(Math.max(0, ci - 30), ci + 80)}…" ` +
                            `vs generated: "…${b2.slice(Math.max(0, ci - 30), ci + 80)}…". This is the ` +
                            `declaration-prose rule applied inside the array: the sentence is GENERATED from ` +
                            `the row, so it cannot say something the row does not`,
                        );
                      }
                    } else {
                      if (fc.bound) {
                        const whyB = fc.bound(v);
                        if (whyB) bad.push(`${dk}: \`${at}.${f}\` ${whyB}. It is producer-witnessed — ${fc.why}`);
                      }
                      for (const c of fc.closures || []) {
                        const whyC = CLOSURE_OPS[c.op].run(c, v, elemGet);
                        if (whyC) {
                          bad.push(
                            `${dk}: \`${at}.${f}\` ${whyC} — and the element inventory holds it to exactly ` +
                              `that ("${CLOSURE_OPS[c.op].say(c)}")`,
                          );
                        }
                      }
                    }
                  }
                  for (const c of spec.closures || []) {
                    const whyC = CLOSURE_OPS[c.op].run(c, el, elemGet);
                    if (whyC) bad.push(`${dk}: \`${at}\` ${whyC}`);
                  }
                }
              }
            }
          }

          for (const [leaf, val, rawPath] of recordLeaves(sf)) {
            const cls = table[leaf];
            if (!cls) {
              bad.push(
                `${dk}: the record carries \`${rawPath}\` (${String(JSON.stringify(val)).slice(0, 60)}) and the ` +
                  `record-leaf inventory in this file does not name it. Every leaf of every declaration ` +
                  `record is re-derived, witnessed with a stated bound, or exempt BY NAME — an unnamed leaf ` +
                  `is unchecked by default, which is exactly how ten declaration kinds came to ship a ` +
                  `100% unaudited record`,
              );
              continue;
            }
            if (cls.klass === "derived") {
              // a leaf with a dynamic segment (`lift.perClass.<class>.pairDin`)
              // is CLASSED under its normalised name and DERIVED under its real
              // one, so both spellings are looked up
              if (rawPath in der) der[leaf] = der[rawPath];
              if (!(leaf in der)) {
                bad.push(
                  `${dk}: the record-leaf inventory says \`${leaf}\` is RE-DERIVED and this room's ` +
                    `derivation produced no value for it. A promised check that does not run is worse than ` +
                    `an admitted gap, because the inventory reads as coverage`,
                );
                continue;
              }
              const want = der[leaf];
              const same =
                typeof want === "number" && typeof val === "number"
                  ? near(val, want)
                  : Array.isArray(want) || Array.isArray(val) || (want && typeof want === "object")
                    ? JSON.stringify(val) === JSON.stringify(want)
                    : String(val) === String(want);
              if (!same) {
                bad.push(
                  `${dk}: \`${rawPath}\` says ${JSON.stringify(val)}, re-derived from this room's own ` +
                    `board it is ${JSON.stringify(want)}`,
                );
              }
            } else if (cls.klass === "witnessed") {
              if (cls.bound) {
                const why = cls.bound(val);
                if (why) {
                  bad.push(
                    `${dk}: \`${rawPath}\` ${why}. It is producer-witnessed — ${cls.why} — and that is the ` +
                      `one thing about it this file can still check`,
                  );
                }
              }
              // ...AND THE ARITHMETIC THE INVENTORY STATES FOR IT. The `why`
              // above was BUILT from these, so this is the sentence being made
              // true rather than a second opinion about it.
              for (const c of cls.closures || []) {
                if (c.op === "bespoke") {
                  bespokeWanted.push([dk, rawPath, c]);
                  continue;
                }
                const why = CLOSURE_OPS[c.op].run(c, val, closureGet);
                if (why) {
                  bad.push(
                    `${dk}: \`${rawPath}\` ${why} — and the record-leaf inventory holds it to exactly that ` +
                      `("${CLOSURE_OPS[c.op].say(c)}"). This is a WITNESSED leaf: nothing on the shipped ` +
                      `board can re-derive it, so the arithmetic of the census it sits in is the whole of ` +
                      `what stands between the number and a reader`,
                  );
                }
              }
            }
          }
        }
      }

      // ==================================================================
      // ...AND THE BOUNDS THE INVENTORY PROMISED FOR THE WITNESSED LEAVES.
      //
      // A leaf classed WITNESSED carries a sentence saying what still holds it.
      // This is where those sentences are made true. They are not decoration:
      // E13S9's planted census (`pool` and `viable` both 999) is arithmetic
      // nonsense the moment the pool is required to split into its own five
      // rejection classes plus the survivors, and E17S5's deflated seat ceiling
      // has to be paid for in sealing tiles that do not exist.
      // ==================================================================
      {
        /**
         * Every predicate this helper evaluates is credited to the bespoke
         * region that is open — see `bespokeRegion`. That is what turns "the
         * block was entered" into "the block ran": a record shaped so that
         * every guarded check is skipped now credits ZERO and fails the leaf
         * that pointed at the block.
         */
        const B = (cond, msg) => {
          if (bespokeRegion) ranBespoke(bespokeRegion);
          if (!cond) bad.push(`${g}${k ? `/${k}` : ""}: ${msg}`);
        };
        const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

        if (g === "spawnfan" && k === "sector") {
          const c = sf.spawnFan?.census || {};
          bespokeRegion = "spawnFan.census.lattice";
          // I14 — the census is published TWICE, once on the declaration and
          // once on `meta.spawnFan`, which layer 1 writes for every room whether
          // it declares or not. They are one object before serialisation, so any
          // difference is an edit to one of the copies.
          const mirror = plan.meta?.spawnFan;
          if (!mirror || typeof mirror !== "object") {
            bad.push(
              `spawnFan/sector: meta.spawnFan is absent, and it is the unconditional publication of this ` +
                `same census. The declaration is the only copy left, which makes the record its own witness`,
            );
          } else {
            for (const f of ["minAngle", "target", "walkMax", "proxyDepthMin", "sectorWeight"]) {
              if (sf.spawnFan?.[f] !== undefined && mirror[f] !== undefined && sf.spawnFan[f] !== mirror[f]) {
                bad.push(
                  `spawnFan/sector: \`spawnFan.${f}\` is ${JSON.stringify(sf.spawnFan[f])} on the ` +
                    `declaration and ${JSON.stringify(mirror[f])} on meta.spawnFan — one search, one census`,
                );
              }
            }
            const mc = mirror.census || {};
            const da = JSON.stringify(c);
            const db = JSON.stringify(mc);
            if (da !== db) {
              let i = 0;
              while (i < da.length && i < db.length && da[i] === db[i]) i++;
              bad.push(
                `spawnFan/sector: the declaration's census and meta.spawnFan's census are not the same ` +
                  `census — they agree for ${i} character(s) and then diverge (declaration ` +
                  `"…${da.slice(Math.max(0, i - 30), i + 60)}…" vs meta "…${db.slice(Math.max(0, i - 30), i + 60)}…"). ` +
                  `Layer 1 writes one object into both, so a difference is an edit`,
              );
            }
          }
          // I1/I2 — the pool splits, exactly, into its five rejections and the
          // seats that survived them.
          const parts = ["rejClaimed", "rejHubRing", "rejWalk", "rejStorageFace", "rejExits", "viable"];
          if (num(c.pool) !== null && parts.every((f) => num(c[f]) !== null)) {
            const sum = parts.reduce((a, f) => a + c[f], 0);
            B(
              sum === c.pool,
              `the census pool is ${c.pool} and its own five rejection classes plus the viable seats sum ` +
                `to ${sum} (${parts.map((f) => `${f} ${c[f]}`).join(", ")}). Every pool tile takes exactly ` +
                `one branch of that loop, so a census that does not close has a bucket nobody wrote down`,
            );
          }
          if (num(c.pool) !== null && num(c.poolCore) !== null && num(c.poolRing) !== null) {
            B(
              c.poolCore + c.poolRing === c.pool,
              `the pool is ${c.pool} and its core (${c.poolCore}) and ring (${c.poolRing}) sum to ` +
                `${c.poolCore + c.poolRing}`,
            );
          }
          // I3 — the triple enumeration is a binomial coefficient.
          if (num(c.shortlist) !== null && num(c.triples) !== null && num(c.triplesAdjacent) !== null) {
            const L3 = c.shortlist;
            const total = L3 >= 3 ? (L3 * (L3 - 1) * (L3 - 2)) / 6 : 0;
            B(
              c.triples + c.triplesAdjacent === total,
              `the shortlist is ${L3} seats, so there are ${total} three-seat combinations, and the census ` +
                `accounts for ${c.triples} legal plus ${c.triplesAdjacent} adjacent = ` +
                `${c.triples + c.triplesAdjacent}`,
            );
          }
          // I4 — the shortlist takes at least one seat from every non-empty bin.
          if (num(c.shortlistSectors) !== null && num(c.viableSectors) !== null) {
            B(
              c.shortlistSectors === c.viableSectors,
              `the shortlist occupies ${c.shortlistSectors} sectors and the viable seats occupy ` +
                `${c.viableSectors}. The per-sector pass takes a seat from EVERY non-empty bin, so these ` +
                `two are the same number by construction`,
            );
          }
          // I5 — the containments.
          if (num(c.viable) !== null && num(c.pool) !== null) B(c.viable <= c.pool, `viable ${c.viable} exceeds the pool ${c.pool}`);
          if (num(c.shortlist) !== null && num(c.viable) !== null) {
            B(c.shortlist <= c.viable, `the shortlist ${c.shortlist} exceeds the viable seats ${c.viable}`);
          }
          if (num(c.viableCore) !== null && num(c.viable) !== null) B(c.viableCore <= c.viable, `viableCore ${c.viableCore} exceeds viable ${c.viable}`);
          if (num(c.viableShallow) !== null && num(c.viable) !== null) {
            B(c.viableShallow <= c.viable, `viableShallow ${c.viableShallow} exceeds viable ${c.viable}`);
          }
          if (num(c.fannedTriples) !== null && num(c.triples) !== null) {
            B(c.fannedTriples <= c.triples, `fannedTriples ${c.fannedTriples} exceeds the ${c.triples} triples enumerated`);
          }
          // I7 — every viable seat cleared the walk cap, so the winner did too.
          if (num(sf.spawnFan?.walkMax) !== null && num(c.walkCap) !== null) {
            B(
              sf.spawnFan.walkMax <= c.walkCap,
              `the furthest spawn is a ${sf.spawnFan.walkMax}-step walk from storage and every viable seat ` +
                `had to be within ${c.walkCap}`,
            );
          }
          // I8 — the fallback is reached only by exhausting the loop.
          if (typeof c.fallback === "boolean" && num(c.triples) !== null && num(c.triplesJointRejected) !== null) {
            B(
              c.fallback ? c.triplesJointRejected === c.triples : c.triplesJointRejected <= Math.max(0, c.triples - 1),
              `\`fallback\` is ${c.fallback} with ${c.triplesJointRejected} of ${c.triples} triples jointly ` +
                `rejected. The fallback runs only when the loop was exhausted, and every exhausted triple ` +
                `was charged to that counter`,
            );
          }
          // I9/I10 — when the rival exists, and what it has to be.
          if (num(c.fannedTriples) !== null && typeof c.fallback === "boolean") {
            const want = c.fallback === false && c.fannedTriples > 0;
            B(
              !!c.fannedAvailable === want,
              `\`fannedAvailable\` is ${c.fannedAvailable ? "present" : "null"} with ${c.fannedTriples} ` +
                `fanned triple(s) and fallback ${c.fallback}. It is recorded exactly when a target-reaching ` +
                `triple existed AND the search did not fall back`,
            );
          }
          if (c.fannedAvailable) {
            const fa = c.fannedAvailable;
            if (num(fa.minAngle) !== null && num(sf.spawnFan?.target) !== null) {
              B(
                fa.minAngle >= sf.spawnFan.target,
                `the rival triple is recorded as target-reaching and its own worst pair is ${fa.minAngle} ` +
                  `degrees against a ${sf.spawnFan.target}-degree target`,
              );
            }
            if (Array.isArray(fa.tiles)) {
              B(fa.tiles.length === 3, `the rival triple names ${fa.tiles.length} tile(s); a spawn fan is three`);
              for (let i = 0; i < fa.tiles.length; i++) {
                for (let j = i + 1; j < fa.tiles.length; j++) {
                  const a = fa.tiles[i];
                  const b2 = fa.tiles[j];
                  if (!a || !b2 || !Number.isInteger(a.x) || !Number.isInteger(b2.x)) continue;
                  B(
                    chebyshev(a, b2) >= 2,
                    `the rival triple puts ${a.x},${a.y} and ${b2.x},${b2.y} at chebyshev ` +
                      `${chebyshev(a, b2)} — the enumeration skips any combination with an adjacent pair, so ` +
                      `this triple was never in it`,
                  );
                }
              }
            }
            // I16/I17 — the three published gaps are one subtraction apart, and
            // the sector half of it is the sector weight times the shortfall.
            if (num(fa.scoreGap) !== null && num(fa.sectorGain) !== null && num(fa.tileQualityGap) !== null) {
              B(
                Math.abs(fa.tileQualityGap - fa.sectorGain - fa.scoreGap) <= 0.16,
                `the rival's gaps do not close: tileQualityGap ${fa.tileQualityGap} minus sectorGain ` +
                  `${fa.sectorGain} is ${Math.round((fa.tileQualityGap - fa.sectorGain) * 100) / 100} and ` +
                  `scoreGap says ${fa.scoreGap}`,
              );
            }
            if (
              num(fa.sectorGain) !== null &&
              num(sf.spawnFan?.minAngle) !== null &&
              num(sf.spawnFan?.target) !== null &&
              num(sf.spawnFan?.sectorWeight) !== null
            ) {
              const want = sf.spawnFan.sectorWeight * (sf.spawnFan.target - sf.spawnFan.minAngle);
              B(
                Math.abs(fa.sectorGain - want) <= 0.26,
                `\`sectorGain\` is ${fa.sectorGain} and the room is ${sf.spawnFan.target - sf.spawnFan.minAngle} ` +
                  `degrees short of the target at a sector weight of ${sf.spawnFan.sectorWeight}, which is ` +
                  `${Math.round(want * 100) / 100}`,
              );
            }
            if (fa.jointlyFeasible === true && num(fa.scoreGap) !== null) {
              B(
                fa.scoreGap >= 0,
                `the rival is recorded as jointly feasible AND as out-scoring the winner (scoreGap ` +
                  `${fa.scoreGap}). A rival that sorted above the winner and was buildable would have BEEN ` +
                  `the winner`,
              );
            }
          }
        }

        if (g === "ctrlparks" && k === "seats") {
          const c = sf.ctrlParks?.census || {};
          const P = parkBoard();
          bespokeRegion = "ctrlParks.seats.ceiling";
          if (num(c.sealing) !== null && num(c.considered) !== null) {
            B(
              c.sealing >= 0 && c.sealing <= c.considered,
              `\`sealing\` is ${c.sealing} of ${c.considered} candidates considered`,
            );
          }
          if (typeof c.forcedOntoSealingPool === "boolean" && num(c.sealing) !== null && num(c.considered) !== null) {
            B(
              c.forcedOntoSealingPool === (c.sealing === c.considered),
              `\`forcedOntoSealingPool\` is ${c.forcedOntoSealingPool} with ${c.sealing} of ` +
                `${c.considered} candidates sealing. The ladder falls back to the sealing pool exactly when ` +
                `there is nothing else`,
            );
          }
          // THE CEILING, BOUNDED FROM BOTH SIDES. `maxParks` is the maximum over
          // the seal-filtered pool, so it can only be lower than the maximum over
          // the whole candidate list by dropping candidates — and every dropped
          // candidate is a sealing tile the room has already counted.
          if (P && num(c.maxParks) !== null) {
            B(
              c.maxParks <= P.maxCands,
              `\`maxParks\` is ${c.maxParks} and no candidate tile in this room's controller ring feeds ` +
                `more than ${P.maxCands}`,
            );
            const roomier = [...P.byTile.values()].filter((t) => t.park > c.maxParks).length;
            if (num(c.sealing) !== null) {
              B(
                roomier <= c.sealing,
                `\`maxParks\` is ${c.maxParks} and ${roomier} candidate tile(s) in this room's controller ` +
                  `ring feed more than that, against ${c.sealing} the census says were dropped for sealing ` +
                  `a pocket. A ceiling below the board's own maximum has to be paid for tile by tile, and ` +
                  `this room does not have the sealing tiles to pay for it — which is the difference ` +
                  `between "the room's ceiling" and "the ladder's preference"`,
              );
            }
          }
        }

        // ==================================================================
        // CRITICISM 4 THROUGH THE RECORD: `composedCaps` IS THE DESCENT, AND
        // THE DESCENT IS NOW CHECKED FOR CONTENT AND NOT FOR PRESENCE.
        //
        // The paragraph reads "N cap(s) were composed IN FULL and measured — X
        // down to Y, every rung, no early exit", and then "Cap Z is the best of
        // them". Round 14 made the renderer refuse that claim when the record
        // LACKS `composedCaps`; the guard tested that the key was there. So
        // E12S5 could ship `composedCaps=[6]` with `composedTo=6` and a winning
        // cap of 2 — "every rung, no early exit" about a walk that composed one
        // rung and named a winner it never composed, which is criticism 4's
        // exact defect re-landed one indirection out. `[99,1,7,7,-3]` rendered
        // "99 down to -3, every rung". `[]` rendered "0 caps composed" beside
        // "Cap 2 is the best of them".
        //
        // A DESCENT IS FOUR THINGS AT ONCE: it starts where the loop started,
        // it steps down by exactly one (the loop walks caps, not a subsequence
        // of them, and "no early exit" is the whole claim), it ends where the
        // record says it ended, and the cap that won is ON it.
        // ==================================================================
        if (g === "ctrlparks" && k === "released") {
          const c = sf.ctrlParks || {};
          if (num(c.shallowHolding) !== null && num(c.shallowReleasing) !== null) {
            B(
              c.shallowReleasing <= c.shallowHolding,
              `the composition that ships has ${c.shallowReleasing} shallow extension(s) and the holding ` +
                `composition it beat is recorded with ${c.shallowHolding}. The release loop accepts a rung ` +
                `only for strictly FEWER shallow extensions, so this ordering is what the trade means`,
            );
          }
          bespokeRegion = "ctrlParks.composedCaps.descent";
          if (Array.isArray(c.composedCaps)) {
            const caps = c.composedCaps;
            B(
              caps.length > 0,
              `\`composedCaps\` is empty and the record still names \`winningCap\` ` +
                `${JSON.stringify(c.winningCap)} and a composition that shipped. A release pass that ` +
                `composed nothing did not produce a winner`,
            );
            B(
              caps.every((v) => Number.isInteger(v) && v >= 0),
              `\`composedCaps\` is ${JSON.stringify(caps)} — a park cap is a non-negative whole number of ` +
                `seats, and the paragraph reads the first and last of this list out as the range it walked`,
            );
            for (let i = 1; i < caps.length; i++) {
              if (!Number.isInteger(caps[i]) || !Number.isInteger(caps[i - 1])) continue;
              B(
                caps[i] === caps[i - 1] - 1,
                `\`composedCaps\` steps ${caps[i - 1]} -> ${caps[i]} at position ${i}. The release loop ` +
                  `walks DOWN one cap at a time and the paragraph says "every rung, no early exit"; a step ` +
                  `of ${caps[i] - caps[i - 1]} is a rung it skipped and still claims`,
              );
            }
            if (caps.length && num(c.composedFrom) !== null) {
              B(
                caps[0] === c.composedFrom,
                `\`composedCaps\` starts at ${caps[0]} and \`composedFrom\` says the walk started at ` +
                  `${c.composedFrom}`,
              );
            }
            if (caps.length && num(c.composedTo) !== null) {
              B(
                caps[caps.length - 1] === c.composedTo,
                `\`composedCaps\` ends at ${caps[caps.length - 1]} and \`composedTo\` says the walk stopped ` +
                  `at ${c.composedTo}`,
              );
            }
            if (num(c.winningCap) !== null) {
              B(
                caps.includes(c.winningCap),
                `\`winningCap\` is ${c.winningCap} and \`composedCaps\` is ${JSON.stringify(caps)} — the ` +
                  `cap the paragraph calls "the best of them" is not one of them. A composition that was ` +
                  `never composed cannot have been measured, and "best" is a comparison over what was`,
              );
            }
            // the three rejection counters are caps this walk tried and threw
            // away, so together they cannot outnumber the rungs it walked
            const rej = ["rejectedError", "rejectedIncomplete", "rejectedUnderFloor"].map((f) => num(c[f]));
            if (rej.every((v) => v !== null)) {
              const s2 = rej.reduce((a, b2) => a + b2, 0);
              B(
                s2 <= caps.length,
                `the release walk composed ${caps.length} cap(s) and charges ${s2} of them to rejections ` +
                  `(error ${rej[0]}, incomplete ${rej[1]}, under-floor ${rej[2]}) — every rejection is a ` +
                  `rung it walked`,
              );
            }
          } else {
            B(
              false,
              `\`composedCaps\` is ${JSON.stringify(c.composedCaps)} and not a list of caps — the paragraph ` +
                `reads a range out of it, and the descent block that this record's leaves name as their ` +
                `bound has nothing to walk`,
            );
          }
        }

        if (g === "labs" && k === "lab-road-eat") {
          const c = sf.labs || {};
          const L2 = labBoard();
          bespokeRegion = "labs.eatAnchors.ceiling";
          if (num(c.eatAnchors) !== null) {
            B(c.eatAnchors >= 1, `\`eatAnchors\` is ${c.eatAnchors} and one of those anchors is the one this room built`);
            if (L2) {
              B(
                c.eatAnchors <= L2.eatCeiling,
                `\`eatAnchors\` is ${c.eatAnchors} and this room's terrain admits at most ` +
                  `${L2.eatCeiling} lab stamp position(s) at depth >= ${DEPTH_SAFE - 1} once the road veto ` +
                  `is lifted — which is the whole enumeration the eating passes walk`,
              );
            }
          }
        }

        if (g === "extensions" && k === "shallow") {
          const sh = sf.shallowExt || {};
          bespokeRegion = "shallowExt.sharedTarget.crosscopy";
          if (sh.sharedTarget !== undefined && sh.search?.sharedTarget !== undefined) {
            B(
              String(sh.sharedTarget) === String(sh.search.sharedTarget),
              `\`sharedTarget\` is ${JSON.stringify(sh.sharedTarget)} and the re-run's own copy says ` +
                `${JSON.stringify(sh.search.sharedTarget)}`,
            );
          }
          // ...AND THE TILE IS A REAL ONE. The cross-copy compares the two
          // copies to EACH OTHER, so `0,0` — the room's own corner, a wall in
          // most rooms and outside the buildable band in all of them — passed
          // in both copies at once (round 16, K4). A shared target is a tile
          // several slots were competing to STAND AN EXTENSION ON: it has to be
          // walkable floor, inside the wall, inside the 48x48 band, at or past
          // the depth floor, and EMPTY on the board the room ships. That is the
          // whole of what makes it a target.
          if (sh.sharedTarget !== undefined && sh.sharedTarget !== null) {
            const m = /^(-?\d+),(-?\d+)$/.exec(String(sh.sharedTarget));
            if (m) {
              const tx = +m[1];
              const ty = +m[2];
              const inBand = tx >= 1 && tx <= 48 && ty >= 1 && ty <= 48;
              const i2 = inBand ? idx(tx, ty) : -1;
              const occupiedHere = new Set();
              for (const [t2, arr2] of Object.entries(s)) {
                if (t2 === "road" || t2 === "rampart") continue;
                for (const q2 of arr2 || []) occupiedHere.add(key(q2.x, q2.y));
              }
              B(
                inBand && walkable(terrain, tx, ty) && !ext[i2] && depth[i2] >= DEPTH_SAFE && !occupiedHere.has(key(tx, ty)),
                `\`sharedTarget\` names ${sh.sharedTarget}, which is not a free deep interior tile of this ` +
                  `room's shipped board (${!inBand ? "outside the 48x48 buildable band" : !walkable(terrain, tx, ty) ? "not walkable floor" : ext[i2] ? "outside the wall" : depth[i2] < DEPTH_SAFE ? `at depth ${depth[i2]}, under the ${DEPTH_SAFE} floor` : "already carries a structure"}). ` +
                  `The two copies of this key are compared to each other and nothing checked the tile was ` +
                  `real, so the room's own corner passed both`,
              );
            }
          }
          if (Array.isArray(sh.slots) && num(sh.count) !== null) {
            B(
              sh.slots.length === sh.count,
              `the per-slot record has ${sh.slots.length} entries and the room ships ${sh.count} shallow ` +
                `extension(s)`,
            );
          }
        }

        // ==================================================================
        // A CROSS-KIND IDENTITY THAT NO ROOM CAN EXERCISE, SAID OUT LOUD.
        //
        // `labs.refused.network` used to state its bound as "it is the same
        // counter as `eatBlockedByNet` on this room's lab-road-eat record and
        // the two must agree". The two declarations live on DIFFERENT rooms:
        // lab-haul is {E13S2, E9S9} and lab-road-eat is {E9S2}, and the
        // intersection is empty, so the identity has never once been evaluated
        // and the sentence read as coverage for a leaf that had none.
        //
        // The bound is kept — it is the right bound, and a fleet that ever puts
        // both declarations on one room WILL exercise it — and the dormancy is
        // now a fact this file asserts rather than an accident of the roster.
        // ==================================================================
        if (g === "labs" && k === "lab-haul") {
          bespokeRegion = "labs.refused.network.dormant";
          const twin = (declared || []).find(
            (d) => d && normGate(d.gate) === "labs" && String(d.kind) === "lab-road-eat",
          );
          const netN = num(sf.labs?.refused?.network);
          if (twin && netN !== null && num(twin.labs?.eatBlockedByNet) !== null) {
            // THE ROOM THAT CARRIES BOTH: the identity runs.
            B(
              netN === twin.labs.eatBlockedByNet,
              `\`labs.refused.network\` is ${netN} on the lab-haul record and \`labs.eatBlockedByNet\` is ` +
                `${twin.labs.eatBlockedByNet} on this same room's lab-road-eat record. One pass counts ` +
                `network-splitting refusals once`,
            );
          } else {
            // ...AND THE ROOM THAT DOES NOT: the counter has no twin to agree
            // with, so a NON-ZERO count is a claim about a pass whose own
            // declaration this room does not file. Zero is the inert reading
            // and is admitted; anything else has to be declared. This arm is
            // written as a PREDICATE rather than as a conditional `bad.push`
            // because the bespoke stamp counts predicates now, and the dormant
            // arm is the one every room in the fleet takes — a block whose only
            // live arm evaluates nothing has not run.
            B(
              netN === null || netN === 0,
              `\`labs.refused.network\` is ${netN} and this room files no ` +
                `\`labs/lab-road-eat\` declaration, so the counter it is defined to equal ` +
                `(\`labs.eatBlockedByNet\`) is not published anywhere on this room. The identity the ` +
                `record-leaf inventory states for this leaf is CROSS-KIND and therefore dormant on every ` +
                `room that carries only one of the two — which is every room in this fleet. A non-zero ` +
                `count here is the one shape that makes the dormancy load-bearing`,
            );
          }
        }

        if (g === "mobility" && !k) {
          const lad = sf.ladder || {};
          bespokeRegion = "mobility.ladder.rungs";
          if (Array.isArray(lad.rungs) && num(lad.trailLength) !== null) {
            B(
              lad.rungs.length === lad.trailLength,
              `the ladder record has ${lad.rungs.length} rung(s) and \`trailLength\` says ${lad.trailLength}`,
            );
          }
          if (Array.isArray(lad.rungs)) {
            B(lad.rungs.length > 0, `the ladder record has no rungs at all and the room shipped one of them`);
            for (let i = 0; i < lad.rungs.length; i++) {
              const r = lad.rungs[i];
              B(
                r && typeof r === "object" && num(r.rung) !== null && num(r.ramparts) !== null,
                `ladder rung ${i} is ${String(JSON.stringify(r)).slice(0, 60)} — a rung is the bonus it asked for, ` +
                  `the mobility it measured and the ramparts it cost`,
              );
            }
          }
          if (typeof sf.lane?.dropped === "boolean") {
            B(
              sf.lane.dropped === (sf.lane.droppedFor !== null && sf.lane.droppedFor !== undefined),
              `\`lane.dropped\` is ${sf.lane.dropped} and \`lane.droppedFor\` is ` +
                `${JSON.stringify(sf.lane.droppedFor)} — a reservation is dropped exactly when there is ` +
                `something it was dropped for`,
            );
          }
          // ...and layer 2's worst pair. NOT held to the shipped cut: the whole
          // point of the record is that it is about the wall layer 2 negotiated,
          // and the bubbles, the adopted seal tiles and the inert prune move it
          // afterwards — E13S4's pair names 19,2, which layer 7 took off the
          // wall. What is immutable is that the pair is two real tiles of this
          // room that a defender could stand on.
          bespokeRegion = "mobility.negotiated.pair";
          const negT = Array.isArray(sf.negotiated?.tiles) ? sf.negotiated.tiles : null;
          B(!!negT, `layer 2's worst pair is not a list of tiles (\`negotiated.tiles\` is ${JSON.stringify(sf.negotiated?.tiles)})`);
          if (negT) {
            B(negT.length === 2, `layer 2's worst pair names ${negT.length} tile(s); a pair is two`);
            for (const t of negT) {
              B(
                t && Number.isInteger(t.x) && Number.isInteger(t.y) && walkable(terrain, t.x, t.y),
                `layer 2's worst pair names ${JSON.stringify(t)}, which is not a walkable tile of this room`,
              );
            }
          }
          // ...AND THE PARAGRAPH INSIDE THE RECORD.
          bespokeRegion = "mobility.negotiated.detail.parse";
          B(
            !!sf.negotiated && typeof sf.negotiated === "object",
            `the negotiated sub-record is ${JSON.stringify(sf.negotiated)} and the paragraph identity below ` +
              `has nothing to render from`,
          );
          for (const m of negotiatedDetailFaults(sf.negotiated)) {
            ranBespoke("mobility.negotiated.detail.parse");
            bad.push(`mobility: ${m}`);
          }
        }

        // ---- battlements/substitute: the branch and its numbers ----------
        //
        // `kind` is one of three answers and each answer owns a different set
        // of fields: "swap" prices an alternative cut against a budget, "small"
        // measures an enclosure against the program's deep-tile floor, "none"
        // has nothing to report because no protect radius produced a reachable
        // cut at all. A record carrying "swap"'s numbers under "none" is a
        // search result attached to the answer that says there was no result.
        if (g === "battlements" && !k && sf.battlements?.substitute) {
          bespokeRegion = "battlements.substitute.branch";
          const sub = sf.battlements.substitute;
          const kindOf = String(sub.kind);
          const present = (f) => sub[f] !== undefined && sub[f] !== null;
          const wants = {
            swap: ["altCut", "thisCut", "budget"],
            small: ["radius", "cut", "deep", "needDeep"],
            none: [],
          }[kindOf];
          if (wants) {
            for (const f of wants) {
              B(
                present(f),
                `the substitute search answered "${kindOf}" and its record carries no \`${f}\` — that is ` +
                  `the number the "${kindOf}" branch is the answer TO`,
              );
            }
            const all = ["altCut", "thisCut", "budget", "radius", "cut", "deep", "needDeep"];
            for (const f of all) {
              if (wants.includes(f)) continue;
              B(
                !present(f),
                `the substitute search answered "${kindOf}" and its record still carries \`${f}\` ` +
                  `(${JSON.stringify(sub[f])}) — a measurement from a branch this search did not take`,
              );
            }
          }
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
          // TWO CLASSES OF TILE, AND ONLY TWO. The miner's container, and — from
          // round 14 — the EXTRACTOR itself, which is the same argument about
          // the same corner of the room and used to be excused by its absence
          // from OWNED rather than by anything the plan said.
          const isExtractor = (s.extractor || []).some((e) => e.x === p.x && e.y === p.y);
          if (isExtractor) {
            const onNetE = comp.has(tk) || D8.some(([dx, dy]) => comp.has(key(p.x + dx, p.y + dy)));
            if (onNetE) {
              bad.push(
                `${what}: names the extractor at ${p.x},${p.y} as off the road network, and it has a road ` +
                  `or a container on its own tile or on one of its eight neighbours — it IS on the network`,
              );
            }
            continue;
          }
          if (!(s.container || []).some((c) => c.x === p.x && c.y === p.y)) {
            bad.push(
              `${what}: names ${p.x},${p.y}, which carries neither a container nor this room's extractor`,
            );
            continue;
          }
          if (!mineralSeat.has(tk)) {
            bad.push(
              `${what}: names ${p.x},${p.y}, which is not the mineral seat — this exemption exists for ` +
                `the miner's container and for the extractor, and for nothing else`,
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

      // ==================================================================
      // ...AND EVERY BESPOKE CLOSURE THIS RECORD'S LEAVES CLAIM HAD TO RUN.
      //
      // A `BESPOKE(id, …)` on a leaf is a sentence in the inventory that says
      // "a block further down this file holds this". `assertRecordInventory`
      // proves the id EXISTS at load; this proves the block EXECUTED on the
      // room in front of it. Without the second half, deleting the block — or
      // guarding it behind a condition that stops being true — leaves the
      // sentence in the inventory and the check nowhere, which is the exact
      // failure this round is about, one turn of the screw further out.
      // ==================================================================
      for (const [dk, rawPath, c] of bespokeWanted) {
        if (!bespokeRan.get(c.id)) {
          bad.push(
            `${dk}: \`${rawPath}\` is witnessed and the record-leaf inventory says its bound is "${c.text}" ` +
              `(bespoke closure "${c.id}") — and that block EVALUATED NO PREDICATE on this room ` +
              `(${bespokeRan.has(c.id) ? "it was entered and every check inside it was skipped" : "it was not entered at all"}). ` +
              `A promised check that does not execute is worse than an admitted gap, because the inventory ` +
              `reads as coverage — and until round 16 the stamp fired on branch ENTRY, so a record shaped ` +
              `to skip every check inside the block satisfied the gate that exists to catch exactly that`,
          );
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
      // ...and the EXTRACTOR, which is the same fact about the same corner of the
      // room and used to be excused by its absence from OWNED.
      for (const exq of s.extractor || []) {
        const ek = key(exq.x, exq.y);
        // the SAME network the road gate uses — `comp`, the sitter-seeded
        // component of roads and containers — and not "any container", because
        // the mineral seat beside the extractor is itself off the network
        const onNet = comp.has(ek) || D8.some(([dx, dy]) => comp.has(key(exq.x + dx, exq.y + dy)));
        if (!onNet && !mineralOffNetworkDeclared.has(ek)) {
          owe.push(
            `the extractor at ${exq.x},${exq.y} has no road and no container on its own tile or on any of ` +
              `its eight neighbours, and the room files no \`misc/off-network\` declaration naming it. 133 ` +
              `of the fleet's 172 extractors are in this position and the exemption used to be this ` +
              `structure's absence from the checker's own OWNED list`,
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
  // ...AND `meta.towers.towerClump`, THE OTHER PUBLISHED 5x5 COUNTER.
  //
  // The clump OBLIGATION above re-derives its own trigger (`within >= 5`), so a
  // room cannot escape the declaration by lying about this field — but the field
  // itself is what `plan.mjs --all-claimable` prints the fleet's clump histogram
  // from (plan.mjs:2486 reads `towerClump.withinCheb2OfSitter`), and it was
  // compared against nothing. That is precisely the position `nukeWindow` was in
  // for two rounds before it turned out to be wrong in 145 rooms, and it is one
  // subtraction away from the same outcome: the document's clump figure would be
  // the producer's opinion of the producer.
  //
  // Both halves are re-derived, because a count without its tiles is a number
  // and the tiles are what a reader checks: `withinCheb2OfSitter` is the count
  // of shipped towers at chebyshev <= 2 of the re-derived sitter, and `tiles` is
  // exactly that set.
  // ------------------------------------------------------------------
  {
    const tc = plan.meta?.towers?.towerClump;
    const towers = s.tower || [];
    const derTiles = towers.filter((t) => chebyshev(t, sitter) <= 2);
    if (!tc || typeof tc !== "object" || typeof tc.withinCheb2OfSitter !== "number") {
      fails.push(
        `TOWER CLUMP UNPUBLISHED — meta.towers.towerClump is ${JSON.stringify(tc ?? null)} and ` +
          `${derTiles.length} of this room's ${towers.length} towers stand within chebyshev 2 of the ` +
          `sitter. It is the field the fleet's clump histogram is printed from; an absent one is a room ` +
          `that never made the claim and therefore never got it wrong.`,
      );
    } else {
      if (tc.withinCheb2OfSitter !== derTiles.length) {
        fails.push(
          `TOWER CLUMP STALE — meta.towers.towerClump.withinCheb2OfSitter is ${tc.withinCheb2OfSitter} ` +
            `and ${derTiles.length} of the ${towers.length} shipped towers are within chebyshev 2 of the ` +
            `sitter (${sitter.x},${sitter.y}). The clump is the shape a single nuke is cheapest against; ` +
            `the number a reader is shown has to be the room's.`,
        );
      }
      const pubTiles = (Array.isArray(tc.tiles) ? tc.tiles : [])
        .filter((t) => t && Number.isInteger(t.x))
        .map((t) => key(t.x, t.y))
        .sort();
      const wantTiles = derTiles.map((t) => key(t.x, t.y)).sort();
      if (pubTiles.join(" ") !== wantTiles.join(" ")) {
        fails.push(
          `TOWER CLUMP STALE — meta.towers.towerClump.tiles is [${pubTiles.join(" ") || "nothing"}] and ` +
            `the towers within chebyshev 2 of the sitter are [${wantTiles.join(" ") || "nothing"}]. The ` +
            `count and the list are one claim, and a list that does not match its own count is the half ` +
            `a reader would have used to check it.`,
        );
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
        // how many rooms the median was taken over — the eco record publishes it
        // as `fleetMediansMeasured.rooms`, and a median over a different fleet
        // is a different median
        rooms: list.length,
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
