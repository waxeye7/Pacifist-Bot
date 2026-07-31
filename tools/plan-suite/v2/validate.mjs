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
 *   DEPTH  every eco structure is either at depth ≥ 4 (out of a ranged
 *          attacker's reach from the wall) or has a rampart on its tile.
 *          Depth is re-derived from the re-derived exterior.
 *   D4     every extension has a D4 face on the interior walk component
 *          that contains the sitter — no diagonal-only, un-roadable exts.
 *   EXTROAD every extension has a ROAD on a D4 face. Reachable is not the
 *          bar; the owner's bar is "easily accessible, not a maze" — the
 *          filler services the whole mass without leaving the network.
 *   ROAD   the whole road network is ONE D8 component containing the
 *          sitter, and every structure D8-touches it. The network is the
 *          REAL walkable one: a road tile buried under a blocking structure
 *          conducts nothing and is excluded.
 *
 * Exits nonzero on any failure.
 */
import fs from "fs";
import path from "path";
import { OUT_V2, D4, D8, fetchRoomsFromMongo, isWall, key, walkable } from "./shared.mjs";

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
// eco structures that must be out of ranged reach or personally ramparted
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

/** exterior = flood from the exits; ramparts are walls. */
function exteriorFlood(terrain, rampartSet) {
  const ext = new Uint8Array(2500);
  const q = [];
  const seed = (x, y) => {
    if (!walkable(terrain, x, y) || rampartSet.has(key(x, y))) return;
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
function interiorComponent(terrain, ext, blocked, sitter) {
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

export function checkRoom(plan, terrain, objects) {
  const s = plan.structures || {};
  const fails = [];
  const sitter = plan.sitter || plan.hub;
  const room = plan.room;

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
    fails.push(`${type} ${got}!=${want}`);
  }
  if (mineral) {
    const ex = s.extractor || [];
    if (ex.length !== 1) fails.push(`extractor ${ex.length}!=1`);
    else if (ex[0].x !== mineral.x || ex[0].y !== mineral.y) {
      fails.push(`extractor@${ex[0].x},${ex[0].y} not on mineral ${mineral.x},${mineral.y}`);
    }
  } else if ((s.extractor || []).length) {
    fails.push(`extractor without a mineral`);
  }
  for (const [type, arr] of Object.entries(s)) {
    if (!Array.isArray(arr)) continue;
    const cap = RCL8_CAP[type];
    if (cap === undefined) {
      if (arr.length) fails.push(`unknown type ${type} x${arr.length}`);
      continue;
    }
    if (arr.length > cap) fails.push(`${type} ${arr.length}>cap${cap}`);
  }
  for (const type of FORBIDDEN) {
    const n = (s[type] || []).length;
    if (n) fails.push(`${type} present x${n} (must be absent)`);
  }

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
  }
  if (stack.length) fails.push(`stack x${stack.length} (${stack.slice(0, 3).join(" ")})`);
  if (onObject.length) fails.push(`on-object x${onObject.length} (${onObject.slice(0, 3).join(" ")})`);
  if (outOfBounds.length) fails.push(`edge x${outOfBounds.length} (${outOfBounds.slice(0, 3).join(" ")})`);
  if (onWall.length) fails.push(`on-wall x${onWall.length} (${onWall.slice(0, 3).join(" ")})`);

  // ------------------------------------------------------------------
  // LEAK + DEPTH
  // ------------------------------------------------------------------
  const rampartSet = new Set((s.rampart || []).map((r) => key(r.x, r.y)));
  const ext = exteriorFlood(terrain, rampartSet);
  const depth = depthFromExterior(ext);
  const leaks = [];
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
  if (leaks.length) fails.push(`leak x${leaks.length} (${leaks.slice(0, 3).join(" ")})`);

  const shallow = [];
  for (const t of NEEDS_DEPTH) {
    for (const p of s[t] || []) {
      const k = key(p.x, p.y);
      if (rampartSet.has(k)) continue; // personally covered
      if (depth[idx(p.x, p.y)] >= DEPTH_SAFE) continue;
      shallow.push(`${t}@${p.x},${p.y}d${depth[idx(p.x, p.y)]}`);
    }
  }
  if (shallow.length) fails.push(`shallow x${shallow.length} (${shallow.slice(0, 3).join(" ")})`);

  // ------------------------------------------------------------------
  // D4 (extensions)
  // ------------------------------------------------------------------
  const blocked = new Set(objectTiles);
  for (const t of BLOCKING) for (const p of s[t] || []) blocked.add(key(p.x, p.y));
  const interior = interiorComponent(terrain, ext, blocked, sitter);
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
  if (diagOnly) fails.push(`ext diag-only x${diagOnly}`);
  if (noFace) fails.push(`ext unreachable x${noFace}`);

  // ------------------------------------------------------------------
  // EXT-ROAD — owner: extensions must be EASILY accessible, not merely
  // reachable. A filler that has to leave the road to service an extension
  // pays 2 ticks/tile on plain, every refill, forever. Hard fail.
  // ------------------------------------------------------------------
  const roadTiles = new Set((s.road || []).map((r) => key(r.x, r.y)));
  let extNoRoad = 0;
  for (const e of s.extension || []) {
    if (D4.some(([dx, dy]) => roadTiles.has(key(e.x + dx, e.y + dy)))) continue;
    extNoRoad++;
  }
  if (extNoRoad) fails.push(`ext off-road x${extNoRoad}`);

  // ------------------------------------------------------------------
  // ROAD — one live component, everything on it
  // ------------------------------------------------------------------
  const comp = roadComponent(s, sitter, blocked);
  const orphanRoads = (s.road || []).filter((r) => !comp.has(key(r.x, r.y)));
  if (orphanRoads.length) {
    fails.push(
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
  if (stranded.length) fails.push(`no-road x${stranded.length} (${stranded.slice(0, 3).join(" ")})`);

  return {
    fails,
    diagOnly,
    extNoRoad,
    roads: (s.road || []).length,
    leaks: leaks.length,
    stranded: stranded.length,
    stack: stack.length,
    onObject: onObject.length,
    shallow: shallow.length,
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
  let pass = 0;
  const agg = { diagOnly: 0, extNoRoad: 0, leaks: 0, stranded: 0, stack: 0, onObject: 0, shallow: 0, orphanRoads: 0 };
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
  console.log(
    `pass ${pass}/${list.length} · fail ${rows.length} · totals: ` +
      `leaks ${agg.leaks}, stacked ${agg.stack}, on-object ${agg.onObject}, ` +
      `shallow ${agg.shallow}, diag-only exts ${agg.diagOnly}, off-road exts ${agg.extNoRoad}, ` +
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
