/**
 * MUTATION TEST for tools/plan-suite/v2/validate.mjs — the committed gate.
 *
 * A validator that only ever sees plans it passes is decoration. This file
 * breaks a shipped plan on purpose, one defect class at a time, hands the
 * broken plan to `checkRoom`, and requires the validator to BITE with the
 * expected message. A mutation that escapes is a hole in the validator and
 * this file exits nonzero for it.
 *
 * WHAT IT GUARANTEES
 *   1. BASELINE — every room in the shipped artifact passes UNMUTATED. Without
 *      this the mutation results mean nothing: a suite whose baseline already
 *      fails "catches" everything.
 *   2. BITE — every case produces at least one failure whose text matches the
 *      case's expectation (a regex naming the gate/kind that must fire). A
 *      case that fails for an unrelated reason is NOT a pass.
 *
 * THE MUTATION CLASSES
 *   structural      — counts, caps, stacking, on-object, bounds, engine-side
 *                     createConstructionSite legality, depth, road network
 *   meta corruption — a published field falsified or deleted while the board
 *                     stays legal (mobilityBuilt, roadRampart, redundantCut,
 *                     nukeWindow, towerDispersion, refillDists, compositions)
 *   declaration     — a real violation "excused" by a fabricated shortfall
 *   laundering        entry: evidence-free stubs, filler prose, tile lists over
 *                     the cap, duplicate declarations, budget stacking, and
 *                     declarations on pairs that are not declarable at all
 *   key deletion    — a required meta key removed (schema presence gate), and
 *                     obligations: deleting the DECLARATION for a state the
 *                     room is provably in
 *   prose divergence— the paragraph rewritten to say something the structured
 *                     record does not support, including the laundering where
 *                     every audited numeral is pasted onto a false paragraph
 *
 * READ-ONLY. The artifact is never written. Every mutant is a deep clone held
 * in memory; `PLANS_FILE` is honoured (same env var validate.mjs reads) so the
 * gate can be pointed at a candidate artifact without touching the shipped one.
 *
 * RUN
 *   fnm exec --using 22 node tools/plan-suite/v2/mutate.mjs
 *   fnm exec --using 22 node tools/plan-suite/v2/mutate.mjs --only r12/M5
 *   PLANS_FILE=/tmp/candidate.json fnm exec --using 22 node tools/plan-suite/v2/mutate.mjs
 *
 * FLAGS
 *   --only <substr|regex>  run a subset (the baseline still runs in full)
 *   --quiet                summary only, no per-case table
 *   --json <path>          write the per-case results as JSON
 *
 * COST. The baseline is one `checkRoom` per room (172). Each mutant is ONE
 * `checkRoom` on the ONE room it mutates — the fleet is not re-validated per
 * case. Terrain and room objects come from mongo in a single dump, exactly as
 * validate.mjs's own main() fetches them.
 *
 * ROOM SELECTION. Cases that need a room with a particular property find it by
 * PROPERTY, not by name, scanning the artifact in file order (deterministic).
 * A case that names a room is a case that silently stops testing anything the
 * day the planner re-plans that room.
 *
 * Exits 0 only when the baseline is clean AND every case bites.
 */
import fs from "fs";
import path from "path";
import { checkRoom, ecoWalks } from "./validate.mjs";
import { D4, D8, OUT_V2, fetchRoomsFromMongo, isWall, key, walkable } from "./shared.mjs";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : null;
};
const ONLY = opt("--only");
const QUIET = flag("--quiet");
const JSON_OUT = opt("--json");

const idx = (x, y) => x + y * 50;
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// ---------------------------------------------------------------------------
// DATA. The same two inputs validate.mjs reads, read the same way.
// ---------------------------------------------------------------------------
const PLANS_FILE = process.env.PLANS_FILE || path.join(OUT_V2, "plans-hub.json");
if (!fs.existsSync(PLANS_FILE)) {
  console.error("missing", PLANS_FILE, "\n  run: node tools/plan-suite/v2/plan.mjs --all-claimable");
  process.exit(2);
}
const plans = JSON.parse(fs.readFileSync(PLANS_FILE, "utf8")).filter((p) => p && p.room && !p.error);
if (!plans.length) {
  console.error("no plans in", PLANS_FILE);
  process.exit(2);
}

// ROOMS_FILE — an optional cached mongo dump ([{room,terrain,objects}]). It
// exists so the gate can run without docker; unset, the dump is taken live,
// which is what CI and the suite do.
//
// A PARTIAL DUMP IS NOT A RESULT. The mongo dump occasionally comes back with a
// fraction of the rooms it was asked for; left alone, every missing room reads
// as a baseline failure and the run looks like a validator verdict when it is an
// infrastructure fault. So: retry a short dump, and if it stays short, exit 2 —
// distinct from the exit 1 this file uses for a real gate failure.
const t0 = Date.now();
const wanted = plans.map((p) => p.room);
let roomsRaw = [];
let byRoom = new Map();
let attempt = 0;
while (attempt < 3) {
  attempt++;
  roomsRaw = process.env.ROOMS_FILE
    ? JSON.parse(fs.readFileSync(process.env.ROOMS_FILE, "utf8"))
    : fetchRoomsFromMongo(wanted);
  byRoom = new Map(roomsRaw.map((d) => [d.room, d]));
  if (wanted.every((r) => byRoom.has(r))) break;
  if (process.env.ROOMS_FILE) break;
  console.error(`  mongo dump returned ${roomsRaw.length} of ${wanted.length} rooms — retrying (${attempt}/3)`);
}
const fetchMs = Date.now() - t0;
{
  const missing = wanted.filter((r) => !byRoom.has(r));
  if (missing.length) {
    console.error(
      `ROOM DUMP INCOMPLETE — ${roomsRaw.length} of ${wanted.length} rooms came back from mongo after ` +
        `${attempt} attempt(s); ${missing.length} missing ` +
        `(${missing.slice(0, 8).join(" ")}${missing.length > 8 ? " ..." : ""}).`,
    );
    console.error("  This is a dump fault, not a validator verdict. Check the docker mongo container and re-run.");
    process.exit(2);
  }
}

const byName = new Map(plans.map((p) => [p.room, p]));
const clone = (r) => JSON.parse(JSON.stringify(byName.get(r)));
const T = (r) => byRoom.get(r);

// ---------------------------------------------------------------------------
// THE FLEET CONTEXT, built the way validate.mjs's main() builds it.
//
// The eco obligation's gates are `min(absolute, 2x the fleet median)`, so a
// harness that omits the fleet silently tests a WEAKER rule than the one the
// fleet is held to, and an eco mutation escapes for a reason that has nothing
// to do with the gate. Re-derived here from terrain — never read out of a plan.
// ---------------------------------------------------------------------------
const ECO_MEDIAN_MIN_ROOMS = 30;
const FLEET = (() => {
  if (plans.length < ECO_MEDIAN_MIN_ROOMS) return null;
  const pcs = [];
  const pss = [];
  for (const p of plans) {
    const d = byRoom.get(p.room);
    if (!d) continue;
    const hub = (p.structures?.storage || [])[0] || p.sitter || p.hub;
    if (!hub) continue;
    const w = ecoWalks(d.terrain, d.objects, hub);
    if (w.pc !== null) pcs.push(w.pc);
    if (w.ps !== null) pss.push(w.ps);
  }
  const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : null);
  const ctrlMedian = med(pcs);
  const srcMedian = med(pss);
  if (ctrlMedian === null || srcMedian === null) return null;
  return {
    ctrlMedian,
    srcMedian,
    ctrlGate: Math.min(25, 2 * ctrlMedian),
    srcGate: Math.min(60, 2 * srcMedian),
  };
})();

// ---------------------------------------------------------------------------
// 1. BASELINE — the unmutated artifact must be clean.
// ---------------------------------------------------------------------------
const tBase = Date.now();
let basePass = 0;
const baseFail = [];
for (const p of plans) {
  const d = T(p.room);
  if (!d) {
    baseFail.push(`${p.room}: no terrain in mongo`);
    continue;
  }
  const r = checkRoom(p, d.terrain, d.objects, FLEET);
  if (r.fails.length) baseFail.push(`${p.room}: ${r.fails.join(" · ")}`);
  else basePass++;
}
const baseMs = Date.now() - tBase;
console.log(`BASELINE (unmutated): ${basePass}/${plans.length} pass · ${(baseMs / 1000).toFixed(1)}s`);
for (const b of baseFail) console.log("   FAIL", b);
if (baseFail.length) console.log("   ^^ the mutation results below mean nothing until this is 0");

// ---------------------------------------------------------------------------
// 2. THE CASES.
// ---------------------------------------------------------------------------
const results = [];
let skipped = 0;
function run(name, room, mutate, expect) {
  if (ONLY && !new RegExp(ONLY, "i").test(name)) {
    skipped++;
    return;
  }
  if (!room) {
    results.push({ name, room: "-", caught: false, matched: false, fails: ["NO ROOM WITH THE REQUIRED PROPERTY"] });
    return;
  }
  const d = T(room);
  if (!d) {
    results.push({ name, room, caught: false, matched: false, fails: ["no terrain in mongo"] });
    return;
  }
  const p = clone(room);
  let info = {};
  try {
    info = mutate(p, d) || {};
  } catch (e) {
    results.push({ name, room, caught: false, matched: false, fails: ["MUTATION THREW: " + e.message] });
    return;
  }
  let res;
  try {
    res = checkRoom(p, d.terrain, d.objects, FLEET);
  } catch (e) {
    // A validator that throws has NOT proved the gate — it proved a crash.
    results.push({ name, room, caught: false, matched: false, fails: ["checkRoom THREW: " + e.message] });
    return;
  }
  const caught = res.fails.length > 0;
  const matched = expect ? res.fails.some((f) => new RegExp(expect, "i").test(f)) : caught;
  results.push({ name, room, caught, matched, expect, fails: res.fails.slice(0, 3), note: info.note });
}

// -- tile finders -----------------------------------------------------------
const R = plans.some((p) => p.room === "E11S1") ? "E11S1" : plans[0].room; // a plain room to mutate

/** a walkable tile carrying nothing, for relocations */
const deepTile = (p, t) => {
  for (let x = 2; x <= 47; x++)
    for (let y = 2; y <= 47; y++) {
      if (isWall(t.terrain, x, y)) continue;
      const k = key(x, y);
      const taken = Object.values(p.structures).some((a) => Array.isArray(a) && a.some((q) => key(q.x, q.y) === k));
      if (!taken) return { x, y };
    }
  return null;
};

/** a free walkable tile in the EXTERIOR flood — outside the room's own wall */
const outsideTile = (p, t) => {
  const ramp = new Set((p.structures.rampart || []).map((r) => key(r.x, r.y)));
  const seen = new Uint8Array(2500);
  const q = [];
  const seed = (x, y) => {
    if (x < 0 || y < 0 || x > 49 || y > 49) return;
    if (isWall(t.terrain, x, y) || ramp.has(key(x, y))) return;
    if (seen[idx(x, y)]) return;
    seen[idx(x, y)] = 1;
    q.push([x, y]);
  };
  for (let i = 0; i < 50; i++) {
    seed(i, 0);
    seed(i, 49);
    seed(0, i);
    seed(49, i);
  }
  for (let qi = 0; qi < q.length; qi++) {
    const [x, y] = q[qi];
    for (const [dx, dy] of D8) seed(x + dx, y + dy);
  }
  const taken = new Set();
  for (const a of Object.values(p.structures)) if (Array.isArray(a)) for (const s of a) taken.add(key(s.x, s.y));
  for (let x = 2; x <= 47; x++)
    for (let y = 2; y <= 47; y++)
      if (seen[idx(x, y)] && !taken.has(key(x, y)) && !isWall(t.terrain, x, y)) return { x, y };
  return null;
};

/** the shallow band — tiles the attacker reaches in a step or two */
const shallowSlot = (p, t) => {
  for (let x = 2; x <= 47; x++)
    for (let y = 2; y <= 47; y++) {
      if (isWall(t.terrain, x, y)) continue;
      if (x > 3 && x < 46 && y > 3 && y < 46) continue;
      const k = key(x, y);
      const taken = Object.values(p.structures).some((a) => Array.isArray(a) && a.some((q) => key(q.x, q.y) === k));
      if (taken) continue;
      return { x, y };
    }
  return null;
};

/**
 * The exterior flood and the chebyshev depth field, re-derived the way the
 * validator derives them: ROADS TUNNEL (a road on a natural wall is a legal
 * construction site and a creep walks it), the rampart set is the wall, and
 * depth is chebyshev from the exterior THROUGH walls — a ranged attacker does
 * not need line of sight to a tile it is shooting into.
 */
const shellFields = (p, t) => {
  const ramp = new Set((p.structures.rampart || []).map((r) => key(r.x, r.y)));
  const roads = new Set((p.structures.road || []).map((r) => key(r.x, r.y)));
  const pass = (x, y) =>
    x >= 0 && x <= 49 && y >= 0 && y <= 49 && (!isWall(t.terrain, x, y) || roads.has(key(x, y)));
  const ext = new Uint8Array(2500);
  const q = [];
  const seed = (x, y) => {
    if (!pass(x, y) || ramp.has(key(x, y))) return;
    const i = idx(x, y);
    if (ext[i]) return;
    ext[i] = 1;
    q.push(i);
  };
  for (let i = 0; i < 50; i++) { seed(i, 0); seed(i, 49); seed(0, i); seed(49, i); }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    for (const [dx, dy] of D8) seed((i % 50) + dx, ((i / 50) | 0) + dy);
  }
  const depth = new Int16Array(2500).fill(999);
  const dq = [];
  for (let i = 0; i < 2500; i++) if (ext[i]) { depth[i] = 0; dq.push(i); }
  for (let qi = 0; qi < dq.length; qi++) {
    const i = dq[qi], x = i % 50, y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = idx(nx, ny);
      if (depth[ni] <= depth[i] + 1) continue;
      depth[ni] = depth[i] + 1;
      dq.push(ni);
    }
  }
  return { ext, depth, ramp };
};
/** the first owned structure standing at attacker depth under its OWN rampart */
const shallowRamparted = (p, t) => {
  const { depth, ramp } = shellFields(p, t);
  for (const type of ["extension", "lab", "container", "link", "tower", "spawn", "terminal", "storage", "nuker", "observer"]) {
    for (const s of p.structures[type] || []) {
      if (depth[idx(s.x, s.y)] < 4 && ramp.has(key(s.x, s.y))) return { type, tile: s };
    }
  }
  return null;
};

// -- room finders (BY PROPERTY, deterministic over file order) --------------
const anyRoom = (pred) => plans.find(pred)?.room || null;
const roomWith = (pred) => anyRoom(pred);
const roomWithDecl = (gate, kind) =>
  anyRoom((p) => (p.meta?.shortfalls || []).some((d) => d && d.gate === gate && (kind === null ? !d.kind : d.kind === kind)));
const roomWithObject = (type) => anyRoom((p) => (T(p.room)?.objects || []).some((o) => o.type === type));
const objOf = (t, type) => t.objects.find((o) => o.type === type);

// -- declaration helpers ----------------------------------------------------
const declOf = (p, gate, kind) =>
  (p.meta.shortfalls || []).find((d) => d && d.gate === gate && (kind === null ? !d.kind : d.kind === kind));
const dropDecl = (p, gate, kind) => {
  p.meta.shortfalls = (p.meta.shortfalls || []).filter(
    (d) => !(d && d.gate === gate && (kind === null ? !d.kind : d.kind === kind)),
  );
};
/** corrupt every numeric token in a prose string, deterministically */
const mangleProse = (s) => String(s).replace(/\d+(\.\d+)?/g, (m) => String(Math.floor(Number(m) / 7) + 1));
/** a declaration body that satisfies the SHAPE rule — prose plus two numbers */
const evidence = (extra = {}) => ({
  detail:
    "this room's own measurement of the tile named here, with the two distinct numbers the evidence " +
    "rule asks for: 1 tile at depth 3, priced at 0.03 e/tick of forever-upkeep.",
  ...extra,
});

// ===========================================================================
// STRUCTURAL — counts, caps, stacking, objects, bounds, engine legality
// ===========================================================================
run("count/spawn-missing", R, (p) => { p.structures.spawn.pop(); }, "spawn 2!=3");
run("count/ext-59", R, (p) => { p.structures.extension.pop(); }, "extension 59!=60");
run("count/forbidden-factory", R, (p, t) => { p.structures.factory = [deepTile(p, t)]; }, "factory present");
run("count/forbidden-powerspawn", R, (p, t) => { p.structures.powerSpawn = [deepTile(p, t)]; }, "powerSpawn present");
run("count/over-cap-link", R, (p, t) => { while (p.structures.link.length <= 6) p.structures.link.push(deepTile(p, t)); }, "link .*>cap6");
run("count/tower-5", R, (p) => { p.structures.tower.pop(); }, "tower 5!=6");
run("count/lab-9", R, (p) => { p.structures.lab.pop(); }, "lab 9!=10");
run("count/no-storage", R, (p) => { p.structures.storage = []; }, "storage 0!=1");
run("count/no-nuker", R, (p) => { p.structures.nuker = []; }, "nuker 0!=1");
run("count/no-observer", R, (p) => { p.structures.observer = []; }, "observer 0!=1");
run("count/links-3", R, (p) => { p.structures.link = p.structures.link.slice(0, 3); }, "link 3<4");
run("count/unknown-type", R, (p, t) => { p.structures.powerBank = [deepTile(p, t)]; }, "unknown type");

run("stack/ext-on-tower", R, (p) => { p.structures.extension[0] = { ...p.structures.tower[0] }; }, "stack");
run("stack/road-on-tower", R, (p) => { p.structures.road.push({ ...p.structures.tower[0] }); }, "stack");
run("stack/dup-ext", R, (p) => { p.structures.extension[1] = { ...p.structures.extension[0] }; }, "stack");
run("object/ext-on-source", R, (p, t) => { const s = objOf(t, "source"); p.structures.extension[0] = { x: s.x, y: s.y }; }, "on-object");
run("object/road-on-controller", R, (p, t) => { const c = objOf(t, "controller"); p.structures.road.push({ x: c.x, y: c.y }); }, "on-object");
run("bounds/edge", R, (p) => { p.structures.extension[0] = { x: 0, y: 25 }; }, "edge");
run("engine/ext-on-wall", R, (p, t) => {
  for (let x = 2; x <= 47; x++) for (let y = 2; y <= 47; y++) if (isWall(t.terrain, x, y)) { p.structures.extension[0] = { x, y }; return; }
}, "on-wall|engine-reject");
run("engine/border-triple", R, (p, t) => {
  // an extension at y==1 whose border triple is not all natural wall
  for (let x = 2; x <= 47; x++) {
    if (isWall(t.terrain, x, 1)) continue;
    if (isWall(t.terrain, x - 1, 0) && isWall(t.terrain, x, 0) && isWall(t.terrain, x + 1, 0)) continue;
    p.structures.extension[0] = { x, y: 1 };
    return;
  }
}, "engine-reject");

// ---------------- LABS ----------------
run("labs/out-of-range", R, (p, t) => {
  const far = deepTile(p, t);
  const li = p.labInputs;
  const nonInput = p.structures.lab.findIndex((l) => !li.some((q) => q.x === l.x && q.y === l.y));
  p.structures.lab[nonInput] = far;
}, "reagent range");

// ---------------- LEAK / DEPTH ----------------
run("leak/container-outside", R, (p, t) => {
  for (let x = 2; x <= 47; x++) for (let y = 2; y <= 47; y++) {
    if (isWall(t.terrain, x, y)) continue;
    const k = key(x, y);
    if (p.structures.rampart.some((r) => key(r.x, r.y) === k)) continue;
    if (x > 3 && x < 46 && y > 3 && y < 46) continue;
    const taken = Object.values(p.structures).some((a) => Array.isArray(a) && a.some((q) => key(q.x, q.y) === k));
    if (taken) continue;
    p.structures.container.push({ x, y });
    return;
  }
}, "leak|shallow|no-road");
run("depth/tower-shallow", R, (p, t) => { const s = shallowSlot(p, t); if (s) p.structures.tower[0] = s; }, "shallow tower");
run("depth/ext-shallow", R, (p, t) => { const s = shallowSlot(p, t); if (s) p.structures.extension[0] = s; },
  "shallow|leak|off-road|diag-only|unreachable");

// ---------------- ROAD ----------------
run("road/ext-off-road", R, (p) => {
  const e = p.structures.extension[0];
  p.structures.road = p.structures.road.filter((r) => !D4.some(([dx, dy]) => r.x === e.x + dx && r.y === e.y + dy));
}, "off-road");
run("road/orphan", R, (p, t) => { const d = deepTile(p, t); p.structures.road.push(d); }, "orphan");

// ---------------- CORE / SITTER ----------------
run("core/terminal-off-sitter", R, (p, t) => { p.structures.terminal = [deepTile(p, t)]; }, "not D8-adjacent to terminal");
run("core/hublink-off-sitter", R, (p, t) => { const d = deepTile(p, t); p.structures.link[0] = d; }, "not D8-adjacent to the hub link");
run("core/storage-off-sitter", R, (p, t) => { p.structures.storage = [deepTile(p, t)]; }, "not D8-adjacent to storage");
run("core/sitter-not-road", R, (p) => { p.structures.road = p.structures.road.filter((r) => !(r.x === p.sitter.x && r.y === p.sitter.y)); }, "not a road tile");
run("core/open-core", R, (p) => { p.structures.rampart = []; }, "OPEN CORE|leak|shallow");

// ---------------- SHELL: seal both directions ----------------
run("shell/stale-cut", R, (p) => {
  // delete one SEALING tile from meta.shell.cut but leave the rampart standing
  const cut = p.meta.shell.cut;
  p.meta.shell.cut = cut.slice(1);
  return { note: `dropped ${cut[0].x},${cut[0].y} from cut` };
}, "carry the seal but are NOT in meta.shell.cut");
run("shell/cut-not-rampart", R, (p, t) => {
  // phantom padding: a cut tile that is not a rampart, and not anything
  const d = deepTile(p, t);
  p.meta.shell.cut = p.meta.shell.cut.concat([d]);
}, "carry NO planned rampart");
run("shell/cut-rampart-engine-rejected", R, (p, t) => {
  // a rampart on natural wall — the engine refuses it, so the cut is a fiction
  for (let x = 2; x <= 47; x++) for (let y = 2; y <= 47; y++) if (isWall(t.terrain, x, y)) {
    p.structures.rampart.push({ x, y });
    p.meta.shell.cut = p.meta.shell.cut.concat([{ x, y }]);
    return;
  }
}, "ENGINE would refuse");

// ---------------- CTRL RING / CLAIM SEAT ----------------
run(
  "shell/ctrl-ring-open",
  roomWith((p) => (p.meta?.shell?.standDenial || []).length > 0),
  (p) => {
    const sd = p.meta.shell.standDenial;
    const k0 = key(sd[0].x, sd[0].y);
    p.structures.rampart = p.structures.rampart.filter((r) => key(r.x, r.y) !== k0);
    return { note: `removed ring rampart ${k0}` };
  },
  "D8-adjacent to the controller carry no rampart",
);
run("ctrlseat/no-seat", R, (p, t) => {
  const c = objOf(t, "controller");
  let i = 0;
  for (const [dx, dy] of D8) {
    const x = c.x + dx, y = c.y + dy;
    if (!walkable(t.terrain, x, y)) continue;
    p.structures.extension[i++] = { x, y };
  }
}, "CONTROLLER SEALED IN");

// ---------------- CTRLPARKS ----------------
run("ctrlparks/stale-claim", R, (p) => { p.meta.ctrlParks = p.meta.ctrlParks + 3; }, "meta.ctrlParks says");
run("ctrlparks/bad-ctrl-link", R, (p, t) => { p.meta.ctrlLink = deepTile(p, t); }, "meta.ctrlLink points at");
run("ctrlparks/seats-under-floor", R, (p, t) => {
  const c = objOf(t, "controller");
  const l = p.meta.ctrlLink;
  let i = 0;
  for (const [dx, dy] of D8) {
    const x = l.x + dx, y = l.y + dy;
    if (!walkable(t.terrain, x, y)) continue;
    if (cheb({ x, y }, c) > 3) continue;
    if (x === c.x && y === c.y) continue;
    p.structures.extension[i++] = { x, y };
  }
  p.meta.ctrlParks = 0;
}, "park seat|CONTROLLER SEALED");

// ---------------- MINERAL ----------------
run("misc/mineral-entombed", roomWithObject("mineral"), (p, t) => {
  const m = objOf(t, "mineral");
  let i = 0;
  for (const [dx, dy] of D8) {
    const x = m.x + dx, y = m.y + dy;
    if (!walkable(t.terrain, x, y)) continue;
    if (i < p.structures.lab.length) p.structures.lab[i++] = { x, y };
    else p.structures.extension[i++] = { x, y };
  }
}, "MINERAL ENTOMBED|labs out of reagent|stack|on-object");
run("misc/mineral-container-unreachable", roomWithObject("mineral"), (p, t) => {
  const m = objOf(t, "mineral");
  const mc = p.structures.container.find((c) => cheb(c, m) <= 1);
  if (!mc) return;
  let i = 0;
  for (const [dx, dy] of D8) {
    const x = mc.x + dx, y = mc.y + dy;
    if (!walkable(t.terrain, x, y)) continue;
    if (x === m.x && y === m.y) continue;
    p.structures.extension[i++] = { x, y };
  }
}, "MINERAL CONTAINER UNREACHABLE|MINERAL ENTOMBED|stack|on-object|shallow");

// ---------------- BATTERY ----------------
{
  const weak = roomWithDecl("towers", "weak-battery");
  run("towers/weak-battery-undeclared", weak, (p) => {
    p.meta.shortfalls = (p.meta.shortfalls || []).filter((d) => !(d.gate === "towers" && d.kind === "weak-battery"));
  }, "battery legal-not-good.*UNDECLARED");
  run("towers/weak-battery-meta-deleted", weak, (p) => {
    p.meta.shortfalls = (p.meta.shortfalls || []).filter((d) => !(d.gate === "towers" && d.kind === "weak-battery"));
    delete p.meta.towers;
  }, "battery legal-not-good.*UNDECLARED");
}

// ===========================================================================
// ARBITRATION / UNDECLARABLE — a declaration is evidence, not a wildcard
// ===========================================================================
run("arb/evidence-free-declaration", R, (p) => {
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([{ gate: "rampart", kind: "leak" }]);
}, "INADMISSIBLE DECLARATION");
run("arb/filler-detail", R, (p) => {
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([{ gate: "rampart", kind: "leak", detail: "a".repeat(80) }]);
}, "INADMISSIBLE DECLARATION");
run("arb/tiles-over-cap", R, (p) => {
  const tiles = [];
  for (let i = 0; i < 40; i++) tiles.push({ x: 5 + (i % 40), y: 5 });
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([{ gate: "rampart", kind: "leak", tiles }]);
}, "over the 32 cap");
run("arb/malformed-tiles", R, (p) => {
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([{ gate: "rampart", kind: "leak", tiles: [null] }]);
}, "not \\{x,y\\} integers");
run("arb/malformed-rungs", R, (p) => {
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([{ gate: "rampart", kind: "leak", rungs: [null] }]);
}, "not objects carrying a numeric field");
run("arb/tiled-decl-cannot-excuse-tileless", R, (p) => {
  p.structures.extension.pop(); // tile-less count violation
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([
    { gate: "extensions", kind: "count", tiles: [{ x: 10, y: 10 }], detail: "room lost 1 of 60 extensions to 3 tiles of rock" },
  ]);
}, "extension 59!=60");
run("arb/tileless-budget-1", R, (p) => {
  // two violations of one class, one tile-less declaration with no count
  p.structures.link = p.structures.link.slice(0, 3);
  p.structures.container = p.structures.container.slice(0, 1);
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([
    { gate: "links", kind: "count", detail: "only 3 of 4 links fit: the 4th needs 2 deep tiles this room does not have" },
  ]);
}, "container");
run("undeclarable/engine", R, (p, t) => {
  for (let x = 2; x <= 47; x++) for (let y = 2; y <= 47; y++) if (isWall(t.terrain, x, y)) { p.structures.extension[0] = { x, y }; break; }
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([
    { gate: "engine", kind: "engine-reject", detail: "1 of 60 extensions sits on code-3 terrain, 2 tiles from the only alternative", tiles: [{ x: 0, y: 0 }] },
  ]);
}, "on-wall|engine-reject");
run("undeclarable/count-forbidden", R, (p, t) => {
  p.structures.factory = [deepTile(p, t)];
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([
    { gate: "count", kind: "forbidden", detail: "1 factory kept because 2 rooms need boosts and nothing else fits" },
  ]);
}, "factory present");
run("undeclarable/towers-shallow", R, (p, t) => {
  const s = shallowSlot(p, t);
  if (!s) return;
  p.structures.tower[0] = s;
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([
    { gate: "towers", kind: "shallow-tower", detail: "1 of 6 towers sits at depth 2; the room has 0 deep tiles left after 60 extensions" },
  ]);
}, "shallow tower");
run("undeclarable/spawn-count", R, (p) => {
  p.structures.spawn.pop();
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([
    { gate: "spawn", kind: "count", detail: "only 2 of 3 spawns fit; the 3rd wants 1 tile in a 90 degree sector this room lacks" },
  ]);
}, "spawn 2!=3");
run("undeclarable/spawns-plural-alias", R, (p) => {
  p.structures.spawn.pop();
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([
    { gate: "spawns", kind: "count", detail: "only 2 of 3 spawns fit; the 3rd wants 1 tile in a 90 degree sector this room lacks" },
  ]);
}, "spawn 2!=3");
run("undeclarable/ctrlseat", R, (p, t) => {
  const c = objOf(t, "controller");
  let i = 0;
  for (const [dx, dy] of D8) {
    const x = c.x + dx, y = c.y + dy;
    if (!walkable(t.terrain, x, y)) continue;
    p.structures.extension[i++] = { x, y };
  }
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([
    { gate: "ctrlseat", kind: "no-seat", detail: "all 3 walkable neighbours of the controller carry 1 extension each" },
  ]);
}, "CONTROLLER SEALED IN");
run("undeclarable/ctrlparks-stale", R, (p) => {
  p.meta.ctrlParks = p.meta.ctrlParks + 3;
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([
    { gate: "ctrlParks", kind: "stale-claim", detail: "3 of 8 seats were built over by layer 6; the number is 5 short" },
  ]);
}, "meta.ctrlParks says");
run("undeclarable/stack", R, (p) => {
  p.structures.extension[0] = { ...p.structures.tower[0] };
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([
    { gate: "stack", kind: "stack", detail: "1 extension shares 1 tile with a tower; the room has 0 alternatives" },
  ]);
}, "stack");
run("undeclarable/core-sitter", R, (p, t) => {
  p.structures.terminal = [deepTile(p, t)];
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([
    { gate: "core", kind: "sitter", detail: "the terminal sits 4 tiles from the sitter; only 2 hub tiles exist" },
  ]);
}, "not D8-adjacent to the terminal|not D8-adjacent to terminal");
run("undeclarable/mineral-seat", roomWithObject("mineral"), (p, t) => {
  const m = objOf(t, "mineral");
  let i = 0;
  for (const [dx, dy] of D8) {
    const x = m.x + dx, y = m.y + dy;
    if (!walkable(t.terrain, x, y)) continue;
    p.structures.extension[i++] = { x, y };
  }
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([
    { gate: "misc", kind: "mineral-seat", detail: "the mineral's 2 stands are taken by 2 extensions; no alternative in 3 tiles", tiles: [] },
  ]);
}, "MINERAL ENTOMBED|on-object|stack|shallow|off-road");

// ===========================================================================
// STRUCTURAL, PART 2 — classes the earlier harnesses carried that the
// consolidation dropped. Recovered here so the committed gate is the union.
// ===========================================================================
run("count/containers-short", R, (p) => { p.structures.container = p.structures.container.slice(0, 1); }, "container");
run("count/extractor-missing", roomWith((p) => (p.structures.extractor || []).length) || R,
  (p) => { p.structures.extractor = []; }, "extractor");
run("count/tower-7", R, (p, t) => { p.structures.tower.push(deepTile(p, t)); }, "tower 7!=6|tower .*>cap6");
run("labs/labinput-not-a-lab", R, (p) => { p.labInputs[0] = { x: 0, y: 0 }; }, "labInput|lab");
run("bounds/edge-x49", R, (p) => { p.structures.extension[0] = { x: 49, y: 25 }; }, "edge");
run("engine/border-triple-y48", R, (p, t) => {
  // the same engine rule on the OTHER border — a y==48 structure whose y==49
  // triple is not all natural wall
  for (let x = 2; x <= 47; x++) {
    if (isWall(t.terrain, x, 48)) continue;
    if (isWall(t.terrain, x - 1, 49) && isWall(t.terrain, x, 49) && isWall(t.terrain, x + 1, 49)) continue;
    p.structures.extension[0] = { x, y: 48 };
    return;
  }
}, "engine-reject");
run("core/sitter-on-wall", R, (p, t) => {
  for (let x = 2; x <= 47; x++) for (let y = 2; y <= 47; y++) if (isWall(t.terrain, x, y)) { p.sitter = { x, y }; return; }
}, "sitter");
// a real hole: delete the rampart of a tile the cut names (the mirror of
// shell/stale-cut, which deletes the NAME and leaves the rampart)
run("shell/cut-rampart-deleted", R, (p) => {
  const c = p.meta.shell.cut[0];
  p.structures.rampart = p.structures.rampart.filter((r) => !(r.x === c.x && r.y === c.y));
  return { note: `removed the rampart at ${c.x},${c.y}` };
}, "leak|stale-cut|OPEN CORE");
// The personal rampart under a shallow owned structure IS what makes that
// structure legal at that depth. Delete it and the depth rule must fire —
// the room is found by that property, not by name.
run("rampart/personal-rampart-deleted",
  roomWith((p) => T(p.room) && shallowRamparted(p, T(p.room))),
  (p, t) => {
    const hit = shallowRamparted(p, t);
    if (!hit) return;
    p.structures.rampart = p.structures.rampart.filter((r) => !(r.x === hit.tile.x && r.y === hit.tile.y));
    return { note: `${hit.type}@${hit.tile.x},${hit.tile.y} lost its own rampart` };
  }, "shallow|leak");
// a container planted at attacker depth with no rampart and no declaration
run("depth/container-unramparted", roomWith((p) => (p.structures.container || []).length < 5) || R, (p, t) => {
  const sl = shallowSlot(p, t);
  if (sl) p.structures.container.push(sl);
  return sl ? { note: `container planted at ${sl.x},${sl.y}` } : {};
}, "shallow|leak|no-road");
// ...and the laundering of exactly that: a shallow tower given its OWN rampart
// so the rampart gate is clean, plus a towers-gate declaration. The depth rule
// is not declarable, and a personal rampart is not a depth argument.
run("undeclarable/shallow-tower-personally-ramparted", R, (p, t) => {
  const s = shallowSlot(p, t);
  if (!s) return;
  p.structures.tower[0] = s;
  p.structures.rampart.push({ x: s.x, y: s.y });
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([
    {
      gate: "towers",
      kind: "shallow-tower",
      detail:
        "The basin here is narrow enough that the 6th tower cannot reach depth 4 without leaving the " +
        "road network; the min-cut leaves 0 depth-4 pockets adjacent to the hub, so the tower is " +
        "placed at depth 3 under its own rampart instead.",
    },
  ]);
}, "shallow tower");

// ===========================================================================
// ROUND-10 GATES
// ===========================================================================
// r10/M1: refillDists must be the AS-BUILT walk. Publish the pre-mass one.
run("r10/refill-stale", R, (p) => {
  p.meta.towers.refillDists = p.meta.towers.refillDists.map((v) => Math.max(0, v - 1));
  p.meta.towers.maxRefill = Math.max(...p.meta.towers.refillDists);
}, "refill-stale");
// ...and deleting the field entirely must not skip the gate
run("r10/refill-deleted", R, (p) => { delete p.meta.towers.refillDists; }, "refill-stale");
// r10/m1: an off-network mineral seat with no declaration is a road violation
run("r10/mineral-offnet-undeclared", R, (p) => {
  p.meta.shortfalls = (p.meta.shortfalls || []).filter((d) => !(d.gate === "misc" && d.kind === "off-network"));
}, "no-road|mineral seat, UNDECLARED");
// ...and a declaration naming the WRONG tile must not excuse it either
run("r10/mineral-offnet-wrong-tile", R, (p) => {
  for (const d of p.meta.shortfalls || []) {
    if (d.gate === "misc" && d.kind === "off-network") d.tiles = [{ x: 1, y: 1 }];
  }
}, "no-road|mineral seat, UNDECLARED");

// -- the nuke window and the layer-3 dispersion record ----------------------
// Both are published numbers about the SHIPPED board, and both were once taken
// on trust. The window is the fullest 5x5 over the mandated structures; moving
// the nuker without re-deriving it is the exact shape of the stale-record class.
{
  const NW = roomWith((p) => p.meta?.towers?.nukeWindow && typeof p.meta.towers.nukeWindow.value === "number") || R;
  run("r10/nukeWindow-off-by-one", NW, (p) => { p.meta.towers.nukeWindow.value += 1; }, "NUKE WINDOW STALE");
  run("r10/nukeWindow-value-deleted", NW, (p) => { delete p.meta.towers.nukeWindow.value; }, "NUKE WINDOW UNPUBLISHED");
  run("r10/nukeWindow-object-deleted", NW, (p) => { delete p.meta.towers.nukeWindow; }, "NUKE WINDOW UNPUBLISHED");
  run("r10/nukeWindow-nuker-moved", NW, (p) => {
    // SWAP the nuker with a far extension. Both are OWNED structures held to the
    // same depth and road-network rules, so the board stays legal and the ONLY
    // thing that changes is the 5x5 mass the published value describes — which
    // is the whole point: the window has to be re-derived, not carried forward.
    const n = p.structures.nuker[0];
    const e = (p.structures.extension || []).find((q) => cheb(q, n) >= 8);
    if (!e) return;
    const swap = { x: e.x, y: e.y };
    e.x = n.x;
    e.y = n.y;
    p.structures.nuker[0] = swap;
    return { note: `nuker ${n.x},${n.y} <-> extension ${swap.x},${swap.y}` };
  }, "NUKE WINDOW STALE");
  run("r10/towerDispersion-inconsistent",
    roomWith((p) => p.meta?.towers?.towerDispersion && typeof p.meta.towers.towerDispersion.after === "number") || R,
    (p) => { p.meta.towers.towerDispersion.after = 99; }, "TOWER DISPERSION|dispersion");
}

// ===========================================================================
// ROUND-11 MUTATIONS — one per NOT-CAUGHT case the round-11 sweep reported,
// plus the obligation-deletion and content-corruption classes the rulings
// added. Every one of these PASSED the round-10 validator.
// ===========================================================================

// ---- r11/C1 — MINERAL ENTOMBED was launderable --------------------------
// The reviewer entombed a mineral (one walkable neighbour), moved the seat
// container away and stood an extension on the ring, then added
// {gate:"misc", kind:"mineral-seat"} with the WHOLE RING in `tiles`. The
// violation disappeared from the fail list; with the three collateral gates
// declared too the room read `pass 1/1 · fail 0` on the same line that printed
// `minerals entombed 1`.
{
  // BY PROPERTY: a room whose mineral has exactly one walkable neighbour, that
  // neighbour carrying the mineral's container.
  let entombRoom = null;
  let seat = null;
  let mineral = null;
  for (const p of plans) {
    const t = T(p.room);
    if (!t) continue;
    const m = objOf(t, "mineral");
    if (!m) continue;
    const ring = D8.map(([dx, dy]) => ({ x: m.x + dx, y: m.y + dy })).filter((q) => walkable(t.terrain, q.x, q.y));
    if (ring.length !== 1) continue;
    const c = (p.structures.container || []).find((q) => q.x === ring[0].x && q.y === ring[0].y);
    if (!c) continue;
    entombRoom = p.room;
    seat = ring[0];
    mineral = m;
    break;
  }
  const entomb = (p, t) => {
    const c = (p.structures.container || []).find((q) => q.x === seat.x && q.y === seat.y);
    if (c) {
      const away = deepTile(p, t);
      c.x = away.x;
      c.y = away.y;
    }
    p.structures.extension[0] = { x: seat.x, y: seat.y };
  };
  const seatDecl = () => ({
    gate: "misc",
    kind: "mineral-seat",
    detail:
      `the mineral ${mineral.x},${mineral.y} has 1 walkable neighbour and the extension mass took it; no alternative ` +
      "stand exists within 3 tiles and the room ships 60 extensions",
    tiles: [{ x: seat.x, y: seat.y }],
  });
  run("r11/mineral-entombed-tiled-decl", entombRoom, (p, t) => {
    entomb(p, t);
    p.meta.shortfalls = (p.meta.shortfalls || []).concat([seatDecl()]);
  }, "MINERAL ENTOMBED");
  run("r11/mineral-entombed-all-collateral-declared", entombRoom, (p, t) => {
    entomb(p, t);
    p.meta.shortfalls = (p.meta.shortfalls || []).concat([
      seatDecl(),
      { gate: "extensions", kind: "unreachable", detail: "1 extension of 60 has no reachable D4 face here", count: 1 },
      { gate: "extensions", kind: "off-road", detail: "1 extension of 60 has no D4 road face here", count: 1 },
      { gate: "road", kind: "off-network", detail: "1 structure of 60 sits off the road network here", count: 1 },
    ]);
  }, "MINERAL ENTOMBED");
}

// ---- r11/m8 — meta.towers.maxRefill was never re-derived -----------------
{
  const TR = roomWith((p) => typeof p.meta?.towers?.maxRefill === "number") || R;
  run("r11/maxRefill-unchecked", TR, (p) => { p.meta.towers.maxRefill = 99; }, "maxRefill");
  // ...and the same shape on the wall's own published damage
  run("r11/shippedMinShellDmg-stale", roomWith((p) => typeof p.meta?.towers?.shippedMinShellDmg === "number") || R,
    (p) => { p.meta.towers.shippedMinShellDmg = 9990; }, "battery-stale");
  run("r11/shippedCutTiles-stale", roomWith((p) => typeof p.meta?.towers?.shippedCutTiles === "number") || R,
    (p) => { p.meta.towers.shippedCutTiles = 3; }, "battery-stale");
}

// ---- r11/M2 — a bogus off-network exemption naming an ON-network tile ----
run("r11/offnetwork-bogus-tile", roomWith((p) => (p.structures.container || []).length > 0) || R, (p) => {
  const c = (p.structures.container || [])[0];
  p.meta.shortfalls = (p.meta.shortfalls || []).concat([
    {
      gate: "misc",
      kind: "off-network",
      detail:
        "THE MINERAL SEAT IS OFF THE ROAD NETWORK, BY DESIGN. The container at " +
        `${c.x},${c.y} has no road and no other container on any of its 8 neighbours; 1 seat, 0 roads`,
      tiles: [{ x: c.x, y: c.y }],
    },
  ]);
}, "DECLARATION CONTENT");

// ---- r11/M3 — declaration CONTENT was never validated --------------------
// the covered-detour record, structured fields and prose together
run("r11/covered-detour-numbers-corrupted", roomWithDecl("mobility", "covered-detour"), (p) => {
  const d = declOf(p, "mobility", "covered-detour");
  d.record.din = 4;
  d.record.dout = 999;
  d.record.detour = 4;
  d.record.ratio = 0.11;
  d.detail = mangleProse(d.detail);
}, "DECLARATION CONTENT");
// ...and the same corruption in the PROSE ALONE, with the structured block
// left honest — the half a reader actually reads.
run("r11/covered-detour-prose-only", roomWithDecl("mobility", "covered-detour"), (p) => {
  const d = declOf(p, "mobility", "covered-detour");
  d.detail = mangleProse(d.detail);
}, "DECLARATION CONTENT");
// the weak-battery walk
run("r11/weak-battery-numbers-corrupted", roomWithDecl("towers", "weak-battery"), (p) => {
  const d = declOf(p, "towers", "weak-battery");
  d.battery.refillDists = d.battery.refillDists.map((v) => Math.floor(v / 7) + 1);
  d.battery.maxRefill = Math.max(...d.battery.refillDists);
  d.detail = mangleProse(d.detail);
}, "DECLARATION CONTENT");
run("r11/weak-battery-wall-corrupted", roomWithDecl("towers", "weak-battery"), (p) => {
  const d = declOf(p, "towers", "weak-battery");
  d.battery.minShellDmg = 9990;
  d.battery.cutTiles = 2;
}, "DECLARATION CONTENT");
// the clump counters
run("r11/clump-numbers-corrupted", roomWithDecl("towers", "clump"), (p) => {
  const d = declOf(p, "towers", "clump");
  d.clump.within = 1;
  d.clump.total = 2;
  d.detail = mangleProse(d.detail);
}, "DECLARATION CONTENT");
run("r11/clump-names-a-non-tower", roomWithDecl("towers", "clump"), (p) => {
  const d = declOf(p, "towers", "clump");
  d.tiles = [{ x: 1, y: 1 }];
}, "DECLARATION CONTENT");
// the eco walk, the other numeric declaration in the fleet
run("r11/eco-numbers-corrupted", roomWithDecl("eco", null), (p) => {
  const d = declOf(p, "eco", null);
  d.eco.pathController = 3;
  d.eco.pathSourcesSum = 4;
  d.eco.anchorWalkFloor = 1;
}, "DECLARATION CONTENT");
run("r11/eco-floor-inflated", roomWithDecl("eco", null), (p) => {
  const d = declOf(p, "eco", null);
  d.eco.anchorWalkSpread = d.eco.anchorWalkSpread + 6;
  d.eco.anchorWalkFloor = d.eco.anchorWalkFloor + 3;
}, "DECLARATION CONTENT");
// the mobility declaration's own mass/lift record
run("r11/mobility-mass-corrupted", roomWith((p) => declOf(p, "mobility", null)?.mass), (p) => {
  const d = declOf(p, "mobility", null);
  d.mass.builtLap = 0.5;
  d.mass.bareLap = 0.4;
}, "DECLARATION CONTENT");
run("r11/mobility-lift-corrupted", roomWith((p) => declOf(p, "mobility", null)?.lift), (p) => {
  const d = declOf(p, "mobility", null);
  d.lift.liftedLap = 0;
  d.lift.clears = true;
}, "DECLARATION CONTENT");
// the shallow-extension declaration's own count
run("r11/shallow-count-corrupted", roomWithDecl("extensions", "shallow"), (p) => {
  declOf(p, "extensions", "shallow").shallowExt.count = 1;
}, "DECLARATION CONTENT");
run("r11/shallow-names-a-deep-extension", roomWithDecl("extensions", "shallow"), (p) => {
  declOf(p, "extensions", "shallow").tiles = [{ x: p.sitter.x, y: p.sitter.y }];
}, "DECLARATION CONTENT");

// ---- r11/M4 — the narration gates were obligations nobody enforced -------
run("r11/covered-detour-deleted", roomWithDecl("mobility", "covered-detour"),
  (p) => dropDecl(p, "mobility", "covered-detour"), "UNDECLARED");
run("r11/mobility-declaration-deleted", roomWithDecl("mobility", null),
  (p) => dropDecl(p, "mobility", null), "UNDECLARED");
run("r11/clump-declaration-deleted", roomWithDecl("towers", "clump"),
  (p) => dropDecl(p, "towers", "clump"), "UNDECLARED");
run("r11/weak-battery-declaration-deleted", roomWithDecl("towers", "weak-battery"),
  (p) => dropDecl(p, "towers", "weak-battery"), "UNDECLARED|battery legal-not-good");
run("r11/shallow-declaration-deleted", roomWithDecl("extensions", "shallow"),
  (p) => dropDecl(p, "extensions", "shallow"), "UNDECLARED");
// ...and an obligation cannot be met with an evidence-free stub either
run("r11/shallow-declaration-evidence-free", roomWithDecl("extensions", "shallow"), (p) => {
  dropDecl(p, "extensions", "shallow");
  p.meta.shortfalls.push({ gate: "extensions", kind: "shallow", detail: "shallow" });
}, "INADMISSIBLE|UNDECLARED");

// the mobility declaration's threshold and its ladder — the two fields the
// paragraph's own comparison is made against
run("r11/mobility-target-falsified", roomWith((p) => declOf(p, "mobility", null)?.metric?.target),
  (p) => { declOf(p, "mobility", null).metric.target = 99; }, "DECLARATION CONTENT|not the paragraph");
run("r11/mobility-ladder-appended", roomWith((p) => declOf(p, "mobility", null)?.ladder), (p) => {
  // the round-13 shape of the old failure: APPEND to the paragraph instead of
  // re-rendering it, so the prose and the record drift by one sentence
  declOf(p, "mobility", null).detail += " LADDER WALKED: nothing at all, and no rung was ever composed.";
}, "not the paragraph this record generates");

// ---- r11/M2 (cause) — a verdict on a room that does not miss -------------
{
  // a room whose mobility declaration exists and whose cause is "none": the
  // record says nothing is owed, so a verdict pinning it on structures is a
  // claim the board contradicts.
  const clean = roomWith((p) => {
    const d = declOf(p, "mobility", null);
    return d && d.cause === "none";
  }) || roomWithDecl("mobility", null);
  run("r11/cause-on-a-passing-room", clean, (p) => { declOf(p, "mobility", null).cause = "structures"; }, "DECLARATION CONTENT");
  run("r11/lift-record-on-a-passing-room", clean, (p) => {
    declOf(p, "mobility", null).lift = { clears: false, liftedLap: 1.27, liftedOverGated: 1, liftedGatedPairs: 1, classes: [], solo: [] };
  }, "DECLARATION CONTENT");
}

// ===========================================================================
// ROUND-12 MUTATIONS — one per confirmed round-12 finding, plus the classes
// the rulings added. Every one of these PASSED the round-12 validator.
// ===========================================================================

// ---- C1: the rampart gate was declarable ---------------------------------
{
  const RL = roomWith((p) => (p.structures.link || []).length > 1) || R;
  for (const [what, type, i] of [["link", "link", 1], ["container", "container", 0], ["storage", "storage", 0], ["tower", "tower", 0]]) {
    run(`r12/C1-leak-laundered-${what}`, RL, (p, t) => {
      const out = outsideTile(p, t);
      if (!out) return;
      p.structures[type][i] = { x: out.x, y: out.y };
      p.meta.shortfalls.push({ gate: "rampart", kind: "leak", tiles: [out], ...evidence() });
      p.meta.shortfalls.push({ gate: "rampart", kind: "shallow", tiles: [out], ...evidence() });
    }, "leak|shallow");
  }
}
run("r12/C1-extractor-placement-laundered", roomWith((p) => (p.structures.extractor || []).length) || R, (p, t) => {
  const d = deepTile(p, t);
  p.structures.extractor[0] = d;
  p.meta.shortfalls.push({ gate: "extractor", kind: "placement", tiles: [d], ...evidence() });
}, "not on mineral");
run("r12/C1-off-road-laundered", R, (p) => {
  // move an extension onto a tile with no D4 road face by shifting every road away
  const e = p.structures.extension[0];
  p.structures.road = p.structures.road.filter((r) => !D4.some(([dx, dy]) => key(r.x, r.y) === key(e.x + dx, e.y + dy)));
  p.meta.shortfalls.push({ gate: "extensions", kind: "off-road", ...evidence({ count: 4 }) });
  p.meta.shortfalls.push({ gate: "road", kind: "orphan-road", ...evidence({ count: 8 }) });
}, "off-road|orphan");
run("r12/C1-duplicate-declaration", R, (p) => {
  p.structures.extension = p.structures.extension.slice(0, 57);
  const d = { gate: "extensions", kind: "count", count: 3, ...evidence() };
  p.meta.shortfalls.push(d, { ...d });
}, "DUPLICATE DECLARATION");
run("r12/C1-budget-stacking", R, (p) => {
  p.structures.extension = p.structures.extension.slice(0, 57);
  p.meta.shortfalls.push({ gate: "extensions", kind: "count", count: 9999, ...evidence() });
}, "budget cap");

// ---- C2: the schema presence gate ----------------------------------------
{
  const SC = roomWith((p) => p.meta?.shell?.mobilityBuilt && p.meta?.walls?.roadRampart) || R;
  for (const [name, dotted] of [
    ["shell-cut", "meta.shell.cut"],
    ["mobilityBuilt", "meta.shell.mobilityBuilt"],
    ["nukeWindow", "meta.towers.nukeWindow"],
    ["roadRampart", "meta.walls.roadRampart"],
    ["redundantCut", "meta.shell.redundantCut"],
    ["ctrlParks", "meta.ctrlParks"],
    ["shortfalls", "meta.shortfalls"],
    ["standDenial", "meta.shell.standDenial"],
    ["bubble", "meta.shell.bubble"],
    ["counts", "meta.counts"],
    ["refillDists", "meta.towers.refillDists"],
    ["maxRefill", "meta.towers.maxRefill"],
  ]) {
    run(`r12/C2-delete-${name}`, SC, (p) => {
      const parts = dotted.split(".");
      let o = p;
      for (let i = 0; i < parts.length - 1; i++) o = o?.[parts[i]];
      if (o) delete o[parts[parts.length - 1]];
    }, "SCHEMA");
  }
  run("r12/C2-delete-cut-plus-drop-mobility", SC, (p) => {
    dropDecl(p, "mobility", null);
    delete p.meta.shell.cut;
  }, "SCHEMA");
  run("r12/C2-delete-compositions", roomWith((p) => p.meta?.compositions) || R,
    (p) => { delete p.meta.compositions; }, "SCHEMA");
}

// ---- M4: published fields nothing re-derived ------------------------------
{
  // the room whose mobilityBuilt carries a lift record — the fleet's worst lap,
  // which is where the falsification was proved.
  const MB = roomWith((p) => p.meta?.shell?.mobilityBuilt?.lift && p.meta.shell.mobilityBuilt.cause !== "none")
    || roomWith((p) => p.meta?.shell?.mobilityBuilt?.lift)
    || R;
  run("r12/M4-mobilityBuilt-maxGated-falsified", MB, (p) => { p.meta.shell.mobilityBuilt.maxGated = 1.0; }, "mobilityBuilt");
  run("r12/M4-mobilityBuilt-max-falsified", MB, (p) => { p.meta.shell.mobilityBuilt.max = 1.0; }, "mobilityBuilt");
  run("r12/M4-mobilityBuilt-mean-falsified", MB, (p) => { p.meta.shell.mobilityBuilt.mean = 0.5; }, "mobilityBuilt");
  run("r12/M4-mobilityBuilt-p90-falsified", MB, (p) => { p.meta.shell.mobilityBuilt.p90 = 0.5; }, "mobilityBuilt");
  run("r12/M4-mobilityBuilt-maxStrict-falsified", MB, (p) => { p.meta.shell.mobilityBuilt.maxStrict = 1.0; }, "mobilityBuilt");
  run("r12/M4-mobilityBuilt-walled-falsified", MB, (p) => { p.meta.shell.mobilityBuilt.walled = 99; }, "mobilityBuilt");
  run("r12/M4-mobilityBuilt-coveredPairs-falsified", MB, (p) => { p.meta.shell.mobilityBuilt.coveredPairs += 7; }, "mobilityBuilt");
  run("r12/M4-mobilityBuilt-worst-pair-falsified", MB,
    (p) => { p.meta.shell.mobilityBuilt.worst = { a: { x: 2, y: 2 }, b: { x: 3, y: 3 }, din: 1, dout: 1 }; }, "mobilityBuilt");
  run("r12/M4-mobilityBuilt-cause-none-on-a-miss", MB, (p) => { p.meta.shell.mobilityBuilt.cause = "none"; }, "mobilityBuilt");
  run("r12/M4-unearned-lift-record", MB, (p) => {
    p.meta.shell.mobilityBuilt.lift = {
      cause: "structures", clears: true, liftedLap: 0, liftedOverGated: 0, liftedGatedPairs: 0,
      classes: ["extension"], solo: ["extension"], present: ["extension", "tower"], perClass: {}, ownPct: 100,
    };
  }, "mobilityBuilt");
  run("r12/M4-lift-ownPct-falsified", MB, (p) => { p.meta.shell.mobilityBuilt.lift.ownPct = 99; }, "mobilityBuilt");
  run("r12/M4-lift-liftedLap-falsified", MB, (p) => { p.meta.shell.mobilityBuilt.lift.liftedLap = 0.1; }, "mobilityBuilt");
  run("r12/M4-lift-solo-unearned", MB, (p) => { p.meta.shell.mobilityBuilt.lift.solo = ["extension"]; }, "mobilityBuilt");
}
run("r12/M4-roadRampart-zeroed", roomWith((p) => p.meta?.walls?.roadRampart?.total > 0) || R, (p) => {
  const r = p.meta.walls.roadRampart;
  r.total = 0; r.crossing = 0; r.seat = 0; r.ring = 0; r.cover = 0; r.unclassified = 0; r.ringTiles = [];
}, "roadRampart");
run("r12/M4-roadRampart-class-shifted", roomWith((p) => p.meta?.walls?.roadRampart?.crossing > 0) || R,
  (p) => { p.meta.walls.roadRampart.crossing -= 1; p.meta.walls.roadRampart.cover += 1; }, "roadRampart");
run("r12/M4-roadRampart-ringTiles-falsified", roomWith((p) => (p.meta?.walls?.roadRampart?.ringTiles || []).length > 0) || R,
  (p) => { p.meta.walls.roadRampart.ringTiles = [{ x: 2, y: 2 }]; }, "roadRampart");
run("r12/M4-redundantCut-deltas-falsified",
  roomWith((p) => Object.values(p.meta?.shell?.redundantCut?.reasons || {}).some((r) => r && r.pricedDeltas)) || R,
  (p) => {
    for (const r of Object.values(p.meta.shell.redundantCut.reasons)) {
      if (r && r.pricedDeltas) { r.pricedDeltas.cut.after = r.pricedDeltas.cut.before + 40; break; }
    }
  }, "redundantCut");

// ---- M3/F5: the paragraph IS the record -----------------------------------
{
  const proseAttack = (gate, kind, text) => (p) => {
    const d = declOf(p, gate, kind);
    if (d) d.detail = text;
  };
  for (const [gate, kind] of [
    ["eco", null], ["extensions", "shallow"], ["misc", "off-network"],
    ["towers", "weak-battery"], ["towers", "clump"], ["mobility", null],
    ["mobility", "covered-detour"], ["shell", null],
  ]) {
    const room = roomWithDecl(gate, kind);
    if (!room) continue;
    const suffix = `${gate}${kind ? "-" + kind : ""}`;
    run(`r12/M3-prose-rewritten-${suffix}`, room,
      proseAttack(gate, kind,
        "The garrison walks 3 tiles inside where the attacker walks 2 outside — an absolute detour of 1 " +
        "tile at a ratio of 1.05, comfortably inside the 1.2 target. Nothing is owed here."),
      "not the paragraph this record generates");
    // ...and the exact laundering the round-11 numeral-presence rule allowed:
    // the same false paragraph with every audited numeral pasted on the end.
    run(`r12/M3-prose-rewritten-with-tokens-${suffix}`, room, (p) => {
      const d = declOf(p, gate, kind);
      if (!d) return;
      const toks = [...String(d.detail).matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]).join(" ");
      d.detail =
        "Nothing is owed here; every measurement in this room is comfortably inside its target. " +
        `[audit tokens: ${toks}]`;
    }, "not the paragraph this record generates");
  }
}

// ---- M5: every declaration kind owes a trigger ----------------------------
for (const [gate, kind] of [
  ["eco", null], ["ctrlParks", "released"], ["ctrlParks", "seats"], ["towerRefill", null],
  ["battlements", "unreachable"], ["labs", "lab-haul"], ["labs", "shallow-lab"],
  ["spawnFan", "sector"], ["shell", null], ["runtime", "heavy-search"],
  ["misc", "off-network"], ["towers", "clump"], ["towers", "weak-battery"],
  ["extensions", "shallow"], ["mobility", null], ["mobility", "covered-detour"],
]) {
  const room = roomWithDecl(gate, kind);
  if (!room) continue;
  run(`r12/M5-obligation-${gate}${kind ? "-" + kind : ""}`, room, (p) => {
    dropDecl(p, gate, kind);
    // the kind-less `battlements` twin covers the same state, so drop both
    if (gate === "battlements") dropDecl(p, "battlements", null);
  }, "UNDECLARED|battery legal-not-good");
}
// HOW FAR THIS ONE GOES, HONESTLY. `meta.compositions` is a fact about a search
// that has finished; the finished board does not re-derive it, so a producer
// that falsifies the published count AND drops the declaration is not catchable
// by this file, and a mutation that happened to pass would be worse than saying
// so. What IS caught is the two published copies disagreeing — which is the
// actual failure mode here: the obligation's trigger used to read the
// declaration's own copy of the number it was meant to be able to demand.
run("r12/M5-compositions-disagree", roomWith((p) => p.meta?.compositions && declOf(p, "runtime", "heavy-search")) || roomWith((p) => p.meta?.compositions) || R,
  (p) => { p.meta.compositions.total = 1; }, "DECLARATION CONTENT");

// ---- M1/F3: the RCL-deferred conduct graph --------------------------------
{
  const bridgeRoom = roomWith((p) => (p.meta?.walls?.conductBridge?.added || []).length > 0);
  if (bridgeRoom) {
    run("r12/M1-bridge-road-deleted", bridgeRoom, (p) => {
      const gone = new Set((p.meta.walls.conductBridge.added || []).map((t) => key(t.x, t.y)));
      p.structures.road = p.structures.road.filter((r) => !gone.has(key(r.x, r.y)));
    }, "RCL-DEFERRED CONDUCT");
  }
  const gapRoom = roomWith((p) => (p.meta?.walls?.conductBridge?.gapTiles || []).length > 0);
  if (gapRoom) {
    run("r12/M1-gap-tiles-deleted", gapRoom, (p) => { p.meta.walls.conductBridge.gapTiles = []; }, "RCL-DEFERRED CONDUCT");
    run("r12/M1-gap-tile-is-an-obstacle", gapRoom,
      (p) => { p.meta.walls.conductBridge.gapTiles = [{ x: p.structures.storage[0].x, y: p.structures.storage[0].y }]; },
      "PAVING GAP UNVERIFIABLE|RCL-DEFERRED CONDUCT");
    // ...and a gap over BARE FLOOR is a join the room declined to pave, not one
    // it cannot. Without this the exemption launders a missing road as terrain.
    run("r12/M1-gap-tile-is-bare-floor", gapRoom, (p, t) => {
      const occ = new Set();
      for (const [ty, arr] of Object.entries(p.structures)) {
        if (ty === "rampart") continue;
        for (const q of arr || []) occ.add(key(q.x, q.y));
      }
      for (let x = 2; x <= 47; x++) for (let y = 2; y <= 47; y++) {
        if (!isWall(t.terrain, x, y) && !occ.has(key(x, y))) { p.meta.walls.conductBridge.gapTiles = [{ x, y }]; return; }
      }
    }, "bare floor|RCL-DEFERRED CONDUCT");
  }
}

// ---- M2 / F1: the record fields the fixes added ---------------------------
{
  const ecoRoom = roomWithDecl("eco", null);
  if (ecoRoom) {
    run("r12/M2-anchor-floor-falsified", ecoRoom, (p) => { declOf(p, "eco", null).eco.anchorWalkFloor += 1; }, "anchorWalkFloor");
    run("r12/M2-anchor-basis-falsified", ecoRoom, (p) => {
      const d = declOf(p, "eco", null);
      d.eco.anchorFloorBasis = d.eco.anchorFloorBasis === "walk" ? "chebyshev" : "walk";
    }, "anchorFloorBasis|not the paragraph");
    run("r12/M2-pathController-falsified", ecoRoom, (p) => { declOf(p, "eco", null).eco.pathController = 3; },
      "pathController|not the paragraph");
  }
  const shRoom = roomWithDecl("extensions", "shallow");
  if (shRoom) {
    run("r12/F1-onepave-count-falsified", shRoom,
      (p) => { declOf(p, "extensions", "shallow").shallowExt.search.freeDeepOnePave = 99; },
      "not the paragraph this record generates");
    run("r12/F1-shallow-count-falsified", shRoom,
      (p) => { declOf(p, "extensions", "shallow").shallowExt.count += 3; }, "shallowExt|count");
  }
}

// ===========================================================================
// 3. REPORT
// ===========================================================================
const runMs = Date.now() - tBase - baseMs;
let bite = 0;
if (!QUIET) {
  console.log("");
  console.log(`MUTATION TEST — ${results.length} case(s)${ONLY ? ` (--only ${ONLY}, ${skipped} skipped)` : ""}`);
  console.log("");
  const w = Math.max(4, ...results.map((r) => r.name.length));
  console.log(`${"RESULT".padEnd(6)}  ${"CASE".padEnd(w)}  ${"ROOM".padEnd(7)}  DETAIL`);
  console.log(`${"-".repeat(6)}  ${"-".repeat(w)}  ${"-".repeat(7)}  ${"-".repeat(40)}`);
  for (const r of results) {
    const ok = r.caught && r.matched;
    if (ok) bite++;
    console.log(
      `${(ok ? "BITES" : "ESCAPE").padEnd(6)}  ${r.name.padEnd(w)}  ${String(r.room).padEnd(7)}  ` +
        (ok ? (r.note || "") : `expected /${r.expect || "(any failure)"}/ — got ${JSON.stringify(r.fails)}`),
    );
  }
} else {
  for (const r of results) if (r.caught && r.matched) bite++;
}

console.log("");
console.log(
  `BASELINE ${basePass}/${plans.length} clean · MUTATIONS ${bite}/${results.length} bite · ` +
    `mongo ${(fetchMs / 1000).toFixed(1)}s · baseline ${(baseMs / 1000).toFixed(1)}s · mutants ${(runMs / 1000).toFixed(1)}s`,
);
const escapes = results.filter((r) => !(r.caught && r.matched));
if (escapes.length) {
  console.log("");
  console.log(`ESCAPED — ${escapes.length} case(s) the validator did not bite:`);
  for (const r of escapes) console.log(`   ${r.name} [${r.room}] ${JSON.stringify(r.fails)}`);
}
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(results, null, 1));

process.exit(baseFail.length || escapes.length ? 1 : 0);
