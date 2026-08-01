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
 *   SITTER the tile every other check is measured FROM. It must be walkable
 *          terrain, D8-adjacent to storage and itself a road tile. The
 *          exterior flood, the interior walk component and the road network
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
 * Two limits keep that mechanism from becoming a mute button. Some gates are
 * UNDECLARABLE outright (see below) — a shallow tower or a stacked structure
 * is wrong, not short. And every declaration must carry EVIDENCE: real detail
 * prose, the ladder it walked, or the tiles it lost. A bare {gate, kind} pair
 * is inadmissible and hard-fails the room on its own — a declaration with no
 * evidence is not a declaration, it is a suppression flag.
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
 * Gate names are normalised so a declaration written the obvious way still
 * matches: "link"/"links", "container"/"containers", "extension"/"extensions".
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
 * EVIDENCE. A declaration is a claim that a room beat the planner, and the
 * mechanism only works if the claim is auditable — the whole point of the
 * shortfall channel is that the planner may lose, loudly, in public. A bare
 * `{gate:"rampart", kind:"leak"}` says nothing a reader can check: it names
 * the violation it wants excused and stops. That is not an admission, it is a
 * suppression flag, and two fields of it would silently excuse a real hole.
 *
 * So a declaration is ADMISSIBLE only if it carries evidence:
 *   - `detail` is a string of >= 40 characters (real prose — which tile, why
 *     the room cannot do better, what was tried), OR
 *   - the entry carries a non-empty `rungs` (the ladder that was walked) or
 *     `tiles` (the exact tiles the room lost).
 * Anything else is INADMISSIBLE: it excuses nothing, and its presence is
 * itself a hard fail for the room. A declaration with no evidence is not a
 * declaration.
 */
const MIN_DETAIL_CHARS = 40;
function declarationEvidence(sf) {
  if (typeof sf.detail === "string" && sf.detail.trim().length >= MIN_DETAIL_CHARS) return null;
  if (Array.isArray(sf.rungs) ? sf.rungs.length : sf.rungs && Object.keys(sf.rungs).length) return null;
  if (Array.isArray(sf.tiles) && sf.tiles.length) return null;
  const n = typeof sf.detail === "string" ? sf.detail.trim().length : 0;
  return (
    `INADMISSIBLE DECLARATION on gate "${normGate(sf.gate)}"` +
    (sf.kind ? `/kind "${sf.kind}"` : "") +
    ` — no evidence (detail ${n} chars < ${MIN_DETAIL_CHARS}, no rungs, no tiles). ` +
    `A declaration with no evidence is not a declaration; it excuses nothing.`
  );
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
  //   evidence the entry must carry some. A declaration with no evidence is
  //          INADMISSIBLE: it is dropped before arbitration (so it excuses
  //          nothing at all) AND its presence is itself a hard fail for the
  //          room, naming the gate it tried to speak for. See
  //          declarationEvidence() above for what counts as evidence.
  //
  // Backwards compatible by construction: every declaration the planner
  // ships today carries tiles and is arbitrated against tiled violations.
  // ------------------------------------------------------------------
  const declared = (plan.meta && plan.meta.shortfalls) || [];
  const inadmissible = [];
  const decls = [];
  for (const sf of declared) {
    if (!sf || typeof sf !== "object") {
      inadmissible.push(`INADMISSIBLE DECLARATION — entry is not an object (${JSON.stringify(sf)})`);
      continue;
    }
    const why = declarationEvidence(sf);
    if (why) {
      inadmissible.push(why);
      continue; // dropped: an inadmissible declaration excuses nothing
    }
    decls.push({
      gate: normGate(sf.gate),
      kind: sf.kind ? String(sf.kind) : null,
      tiles: new Set((sf.tiles || []).map((t) => key(t.x, t.y))),
    });
  }
  const excused = (f) => {
    if (UNDECLARABLE.has(f.gate)) return false;
    for (const d of decls) {
      if (d.gate !== f.gate) continue;
      if (d.kind && d.kind !== f.kind) continue;
      if (d.tiles.size) {
        // a tiled declaration speaks for tiles, and only for the ones it lists
        if (f.tiles.length && f.tiles.every((t) => d.tiles.has(t))) return true;
        continue;
      }
      // tile-less: only a declaration that names the class can own it
      if (d.kind === f.kind) return true;
    }
    return false;
  };
  // An inadmissible declaration is a HARD FAIL in its own right — it cannot be
  // excused (there is nothing to excuse it with) and it never reaches excused().
  const fails = [...inadmissible];
  const notes = [];
  for (const f of raw) (excused(f) ? notes : fails).push(f.msg);

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
  const tw = plan.meta?.towers;
  if (tw && typeof tw.minShellDmg === "number") {
    const weak = tw.minShellDmg < WEAK_SHELL_DMG;
    const farRefill = (tw.maxRefill ?? 0) > REFILL_NOTE;
    if (weak || farRefill) {
      const declaredWeak = declared.some(
        (sf) => sf && normGate(sf.gate) === "towers" && sf.kind === "weak-battery",
      );
      const why = [
        weak ? `weakest wall face ${tw.minShellDmg} < ${WEAK_SHELL_DMG}` : null,
        farRefill ? `furthest tower refill walk ${tw.maxRefill} > ${REFILL_NOTE}` : null,
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
  };
}

function main() {
  const f = path.join(OUT_V2, "plans-hub.json");
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
      `orphan roads ${agg.orphanRoads}, structures off-network ${agg.stranded}`,
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
