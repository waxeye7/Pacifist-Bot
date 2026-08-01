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
  isWall,
  key,
  walkable,
} from "./shared.mjs";

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
]);

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
    decls.push({
      gate: normGate(sf.gate),
      kind: sf.kind ? String(sf.kind) : null,
      // sanitised, never sf.tiles — a malformed list never reaches arbitration
      tiles: new Set(okTiles.map((t) => key(t.x, t.y))),
      budget: stated ? Math.floor(sf.count) : 1,
      used: 0,
    });
  }
  const excused = (f) => {
    if (UNDECLARABLE.has(f.gate)) return false;
    if (UNDECLARABLE_PAIRS.has(`${f.gate}|${f.kind}`)) return false;
    for (const d of decls) {
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

export function checkRoom(plan, terrain, objects) {
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
      // m11: the mineral seat is deliberately off-network (no road by design)
      if (t === "container" && mineralSeat.has(k)) continue;
      if (comp.has(k)) continue; // containers ARE network nodes
      const touch = D8.some(([dx, dy]) => comp.has(key(p.x + dx, p.y + dy)));
      if (!touch) stranded.push(`${t}@${p.x},${p.y}`);
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
  const declared = (plan.meta && plan.meta.shortfalls) || [];
  const { decls, inadmissible, excused } = buildArbitration(declared);
  // An inadmissible declaration is a HARD FAIL in its own right — it cannot be
  // excused (there is nothing to excuse it with) and it never reaches excused().
  const fails = [...inadmissible];
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
    // ... the validator fails any room where the two disagree" — and BE is an
    // equality, not a superset. A reviewer padded E11S8's meta.shell.cut with ten
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
    // The filler's walk to each tower, re-derived. Obstacle set mirrors
    // layer-towers.mjs's `blockers`: the structures a creep cannot cross plus the
    // room objects. Towers, labs and the rest are deliberately NOT in it — they
    // are not in the planner's field either, because they did not exist when it
    // was measured, and a tower does not block the walk to itself.
    const refillBlocked = new Set(objectTiles);
    for (const t of ["storage", "terminal", "link", "spawn"]) {
      for (const p of s[t] || []) refillBlocked.add(key(p.x, p.y));
    }
    const refillField = walkField(terrain, sitter, refillBlocked);
    const refillDists = (s.tower || []).map((t) => refillField[idx(t.x, t.y)]);
    const maxRefill = refillDists.length ? Math.max(...refillDists) : 0;
    const unreachable = refillDists.filter((d) => d >= 9999).length;

    const planMin = typeof tw?.minShellDmg === "number" ? tw.minShellDmg : null;
    const planRefill = typeof tw?.maxRefill === "number" ? tw.maxRefill : null;
    const say = (v) => (v === null ? "absent" : String(v));

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
    const r = checkRoom(p, d.terrain, d.objects);
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
