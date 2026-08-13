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
import { checkRoom, ecoSidePartition, ecoWalks, resetOutputCaches, witnessPromiseUnbacked, witnessSilentlyTypeOnly, RECORD_LEAF_STATS } from "./validate.mjs";
// the producer's own renderer — the round-14 record cases plant a lie in a
// declaration's structured record and then regenerate `detail` from it, which is
// exactly the attack the reviewers used: the prose-identity gate is satisfied by
// construction and only the record's own content is left standing
import { renderDecl } from "./declprose.mjs";
// ...and the note renderer, for the same reason: round 16 closed the planner-note
// channel by generating it, so a note case that does not REGENERATE is testing
// the prose-identity gate rather than the record underneath it.
import { renderNote } from "./declprose-notes.mjs";
// ...and the basis sentence the across-prior take generates, so a round-17
// occupancy mutation can regenerate it exactly as the producer would (F4)
import { renderSatBasis } from "./declprose-towers.mjs";
// ...and the round-22 numeral-rot gate (Mm5). Prose was the one channel with no
// derive-or-die rule and it has produced a finding in six consecutive rounds, so
// the gate that re-derives fleet numerals out of comments and strings is run
// from here as well as from `plan.mjs`: a mutation suite that proves every
// STRUCTURED claim bites while the PROSE claims rot is a suite testing the
// easier half. Two cases below prove the gate itself bites — the artifact moves
// under a sentence nobody re-typed, which is the exact shape the class takes.
import { audit as numeralAudit, report as numeralReport, PENDING_FILES as NUMERAL_PENDING } from "./numeral-audit.mjs";
import { D4, D8, OUT_V2, exteriorFlood, fetchRoomsFromMongo, isSwamp, isWall, key, walkable } from "./shared.mjs";
import { enclosureMobility } from "./layer-shell.mjs";

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
    // the eco record publishes the size of the fleet its medians were taken
    // over, and validate.mjs re-derives it off this — a harness that omits it
    // tests a check that cannot run
    rooms: plans.length,
    ctrlGate: Math.min(25, 2 * ctrlMedian),
    srcGate: Math.min(60, 2 * srcMedian),
    // ROUND 25 / MM3 — the eco-skip side partition, derived over the UNMUTATED
    // fleet. That is the point of building it here: a mutation that moves one
    // record's `eco` index past a declared key is then held to the artifact the
    // rest of the fleet still publishes, exactly as a reviewer's one-record
    // forgery would be.
    ecoSides: ecoSidePartition(plans),
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
// 1b. THE NUMERAL-ROT GATE — the prose channel, held the same way (Mm5).
// ---------------------------------------------------------------------------
// The artifact under test is the one the audit is run against, so pointing this
// suite at a candidate build with PLANS_FILE checks that build's prose too.
const numeralRes = numeralAudit(plans);
const numeralBad = [];
if (numeralRes.bad.length || numeralRes.open.length) {
  numeralBad.push(
    `numeral audit: ${numeralRes.bad.length} WRONG · ${numeralRes.open.length} unowned fleet numeral(s)`,
  );
}
if (numeralRes.pending.length) {
  numeralBad.push(
    `numeral audit: ${numeralRes.pending.length} hit(s) in files listed as not-yet-swept ` +
      `(${NUMERAL_PENDING.join(", ")}) — the list is a contract, not an exemption`,
  );
}
// ROUND 23 / MF4 — AND THE REGISTRY IS ASKED WHETHER IT BELIEVES ITSELF.
// `cut tiles` read a top-level `shell` key the artifact does not have for a
// whole round: the extractor measured 0, registered "0" as a fleet total, and
// no cut-tile denominator could ever be accepted. A registry entry that returns
// 0 or undefined for a label the audited prose makes positive claims about is a
// CONFIG error, and it makes the audit's own "0 WRONG" a weaker statement than
// it reads as. `numeral-audit.mjs`'s own main() exits 1 on it; this suite runs
// the same gate, so a broken extractor cannot pass here and fail there.
if ((numeralRes.registry || []).length) {
  numeralBad.push(
    `numeral audit: ${numeralRes.registry.length} registry self-test failure(s) — ` +
      `${numeralRes.registry.map((r) => `"${r.label}"`).join(", ")} measure(s) nothing while the prose ` +
      `claims something about it`,
  );
}
console.log(
  `NUMERAL AUDIT: ${numeralRes.hits.length} claim(s) · ${numeralRes.resolved.length} re-derived · ` +
    `${numeralRes.waived.length} waived · ${numeralRes.open.length} unowned · ${numeralRes.bad.length} WRONG · ` +
    `${numeralRes.pending.length} pending`,
);
for (const b of numeralBad) console.log("   FAIL", b);
if (numeralBad.length) console.log(numeralReport(numeralRes));

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
  // THE GAP CASES MOVED, THEY DID NOT GO AWAY. They used to be guarded by
  // `roomWith(gapTiles.length > 0)` — a room that PUBLISHES a gap — and round 13
  // paved the fleet's last two (E2S5 27,23 and E5S3 32,11 were ordinary floor a
  // road closes). On a fixed artifact that guard is false in 172/172, so the
  // three cases silently stopped being registered and the exemption gate went
  // back to being untested by the thing that is supposed to test it. They are
  // re-pointed at a SYNTHESISED gap in the r13 block below: the deferred-conduct
  // gate is live in every room with a mineral seat, so the break and the false
  // exemption are both constructed rather than looked for.
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
// ROUND 13 — the four records that were published and re-derived by nothing,
// plus the two audits that were opt-in.
// ===========================================================================

// ---- F2: the redundant-cut refusals. The audit used to run only on reasons
// that VOLUNTEERED a pricedDeltas block — three of the forty-three the fleet
// ships — so an empty map, a garbage class and a deleted price all passed.
{
  const rcRoom = (pred) => roomWith((p) => {
    const rs = p.meta?.shell?.redundantCut?.reasons;
    return rs && Object.keys(rs).length > 0 && (!pred || Object.values(rs).some(pred));
  });
  const anyRC = rcRoom(null);
  const firstKey = (p, pred) =>
    Object.keys(p.meta.shell.redundantCut.reasons).find((k) => !pred || pred(p.meta.shell.redundantCut.reasons[k]));

  run("r13/F2-reasons-map-emptied", anyRC, (p) => {
    p.meta.shell.redundantCut.reasons = {};
  }, "does not cover the extra cut");

  run("r13/F2-reason-class-is-garbage", anyRC, (p) => {
    const k = firstKey(p);
    p.meta.shell.redundantCut.reasons[k] = { class: "banana", tile: k, why: "because" };
  }, "not one of the .* classes");

  run("r13/F2-reason-on-a-tile-that-needs-none", anyRC, (p) => {
    const k = firstKey(p);
    p.meta.shell.redundantCut.reasons["2,2"] = { ...p.meta.shell.redundantCut.reasons[k] };
  }, "does not cover the extra cut|rampart that this room does not plan");

  run("r13/F2-explained-count-falsified", anyRC, (p) => {
    p.meta.shell.redundantCut.explained += 3;
  }, "`explained` says");

  run("r13/F2-tiles-count-falsified", anyRC, (p) => {
    p.meta.shell.redundantCut.tiles += 5;
  }, "`tiles` says");

  const lbRoom = rcRoom((r) => r && r.class === "load-bearing on interior floor");
  run("r13/F2-load-bearing-tile-falsified", lbRoom, (p) => {
    const k = firstKey(p, (r) => r && r.class === "load-bearing on interior floor");
    const r = p.meta.shell.redundantCut.reasons[k];
    r.tile = `${p.structures.storage[0].x},${p.structures.storage[0].y}`;
    r.why = `deleting it would put ${r.tile} — interior floor the base walks on — outside the wall`;
  }, "outside the wall, and re-flooding|is in the exterior flood");

  // the reason reclassified onto a keep-class whose PREMISE this file re-derives
  run("r13/F2-stand-denial-premise-false", lbRoom, (p) => {
    const k = firstKey(p, (r) => r && r.class === "load-bearing on interior floor");
    p.meta.shell.redundantCut.reasons[k] = {
      class:
        `keep-class: the controller's stand-denial ring, and an attacker CAN stand here — this tile is ` +
        `D8-adjacent to the exterior flood, so deleting the rampart puts a claim-attack stand one step ` +
        `from the controller`,
    };
  }, "stand-denial ring|attacker CAN stand here");

  const dpRoom = rcRoom((r) => r && r.class === "depth promotion");
  run("r13/F2-depth-promotion-numbers-falsified", dpRoom, (p) => {
    const k = firstKey(p, (r) => r && r.class === "depth promotion");
    const r = p.meta.shell.redundantCut.reasons[k];
    r.why = `the structure at ${r.tile} would drop from depth 7 to 6, inside a ranged attacker's reach`;
  }, "would drop from depth");

  run("r13/F2-depth-promotion-protects-nothing", dpRoom, (p) => {
    const k = firstKey(p, (r) => r && r.class === "depth promotion");
    const r = p.meta.shell.redundantCut.reasons[k];
    // a bare interior tile: no structure stands on it, so there is nobody to promote
    const bare = (() => {
      const taken = new Set();
      for (const [ty, arr] of Object.entries(p.structures)) {
        if (ty === "road" || ty === "rampart") continue;
        for (const q of arr || []) taken.add(key(q.x, q.y));
      }
      for (let x = 2; x <= 47; x++) for (let y = 2; y <= 47; y++) if (!taken.has(key(x, y))) return `${x},${y}`;
      return "2,2";
    })();
    r.tile = bare;
    r.why = `the structure at ${bare} would drop from depth 4 to 3, inside a ranged attacker's reach`;
  }, "builds nothing on|would drop from depth");

  const wrRoom = rcRoom((r) => r && r.class === "walk region");
  run("r13/F2-walk-region-numbers-falsified", wrRoom, (p) => {
    const k = firstKey(p, (r) => r && r.class === "walk region");
    p.meta.shell.redundantCut.reasons[k].why =
      `deleting it moves the garrison's walk region from 500 tile(s) to 499 — the budget is one tile, ` +
      `and that one tile has to be this rampart`;
  }, "walk region goes from");

  const pcRoom = rcRoom((r) => r && r.class === "personal cover");
  run("r13/F2-personal-cover-over-bare-floor", pcRoom, (p) => {
    // move the covered structure off the tile: the rampart now covers nobody
    const k = firstKey(p, (r) => r && r.class === "personal cover");
    const [cx, cy] = k.split(",").map(Number);
    for (const [ty, arr] of Object.entries(p.structures)) {
      if (ty === "road" || ty === "rampart" || !Array.isArray(arr)) continue;
      const i = arr.findIndex((q) => q.x === cx && q.y === cy);
      if (i >= 0) arr.splice(i, 1);
    }
  }, "builds nothing on|personal cover");

  // the round-12 showcase: DELETE the price and the refusal used to pass on
  // the strength of its sentence alone.
  const prRoom = rcRoom((r) => r && r.pricedDeltas);
  run("r13/F2-pricedDeltas-deleted", prRoom, (p) => {
    for (const r of Object.values(p.meta.shell.redundantCut.reasons)) {
      if (r && r.pricedDeltas) { delete r.pricedDeltas; break; }
    }
  }, "pricedDeltas");
}

// ---- M1: the alongCut paved-run family, which had no reader at all --------
{
  /** the board-derived D8 run roster, the same way validate.mjs derives it */
  const runRoster = (p) => {
    const roads = new Set((p.structures?.road || []).map((r) => key(r.x, r.y)));
    const cutK = new Set((p.meta?.shell?.cut || []).map((c) => key(c.x, c.y)));
    const paved = (k) => cutK.has(k) && roads.has(k);
    return (p.meta?.shell?.cut || []).filter(
      (c) => paved(key(c.x, c.y)) && D8.some(([dx, dy]) => paved(key(c.x + dx, c.y + dy))),
    );
  };
  const runRoom = roomWith((p) => runRoster(p).length > 0);
  const movedRoom = roomWith((p) => (p.meta?.walls?.alongCutMoved || 0) > 0 && runRoster(p).length === 0);

  run("r13/G1-run-refusals-and-note-deleted", runRoom, (p) => {
    p.meta.walls.alongCutRefused = [];
    p.meta.notes = (p.meta.notes || []).filter((n) => !String(n).startsWith("A PAVED RUN ALONG THE WALL"));
  }, "files no refusal for it");

  run("r13/G1b-note-deleted-only", runRoom, (p) => {
    p.meta.notes = (p.meta.notes || []).filter((n) => !String(n).startsWith("A PAVED RUN ALONG THE WALL"));
  }, "publishes no PAVED RUN note");

  run("r13/G1c-note-drops-a-run-tile", runRoom, (p) => {
    const gone = key(runRoster(p)[0].x, runRoster(p)[0].y);
    p.meta.notes = (p.meta.notes || []).map((n) =>
      String(n).startsWith("A PAVED RUN ALONG THE WALL") ? String(n).split(gone).join("99,99") : n,
    );
  }, "PAVED RUN note does not name");

  run("r13/G2-refusal-reason-is-false", runRoom, (p) => {
    const t = runRoster(p)[0];
    const ref = p.meta.walls.alongCutRefused || (p.meta.walls.alongCutRefused = []);
    const parts = D8.map(([dx, dy]) => `${t.x + dx},${t.y + dy} is natural wall`);
    const why = `no interior parallel exists: ${parts.join(" · ")}`;
    const e = ref.find((r) => r.x === t.x && r.y === t.y);
    if (e) e.why = why;
    else ref.push({ x: t.x, y: t.y, why });
  }, "is natural wall.*that is FALSE|re-derived on the board this room ships that is FALSE");

  // the swap "offered" to a tile on the other side of the room. The network
  // arithmetic is producer-witnessed; the tile it names is not.
  run("r13/G2b-refusal-offers-a-stranger", runRoom, (p) => {
    const t = runRoster(p)[0];
    const ref = p.meta.walls.alongCutRefused || (p.meta.walls.alongCutRefused = []);
    const others = D8.map(([dx, dy]) =>
      `${t.x + dx},${t.y + dy} is itself a cut tile — that is the same problem one tile over`,
    ).join(" · ");
    const why =
      `every interior parallel breaks the network. moving it to 2,2 — 1 road tile(s) fall off the network ` +
      `(2,3) — they are no longer D8-connected to the sitter over roads and containers. The swap is ` +
      `offered at equal road count and taken only when the network is measurably no worse; this one is ` +
      `worse, so the tile stays. The other neighbours: ${others}`;
    const e = ref.find((r) => r.x === t.x && r.y === t.y);
    if (e) e.why = why;
    else ref.push({ x: t.x, y: t.y, why });
  }, "not D8-adjacent");

  // ...and the enumeration truncated. This is the M2 defect in one line: the
  // refusal reasons about SOME of the neighbours and the claim it makes is about
  // all of them, which is how a free interior tile one diagonal step away went
  // unmentioned in five rooms.
  run("r13/G2d-refusal-drops-two-neighbours", runRoom, (p) => {
    const t = runRoster(p)[0];
    const e = (p.meta.walls.alongCutRefused || []).find((r) => r.x === t.x && r.y === t.y);
    if (!e) return;
    const MARK = "The other neighbours: ";
    const i = String(e.why).indexOf(MARK);
    if (i >= 0) {
      const head = e.why.slice(0, i + MARK.length);
      const parts = e.why.slice(i + MARK.length).split(" · ");
      e.why = head + parts.slice(0, Math.max(0, parts.length - 2)).join(" · ");
    } else {
      const PRE = "no interior parallel exists: ";
      const parts = String(e.why).slice(PRE.length).split(" · ");
      e.why = PRE + parts.slice(0, Math.max(1, parts.length - 2)).join(" · ");
    }
  }, "are not mentioned|is not mentioned");

  run("r13/G2c-refusal-is-free-text", runRoom, (p) => {
    const t = runRoster(p)[0];
    const ref = p.meta.walls.alongCutRefused || (p.meta.walls.alongCutRefused = []);
    const why = "this tile is fine as it is and moving the road would be worse for reasons of geometry";
    const e = ref.find((r) => r.x === t.x && r.y === t.y);
    if (e) e.why = why;
    else ref.push({ x: t.x, y: t.y, why });
  }, "free text in a form this gate cannot check");

  run("r13/G3-moved-inflated-against-the-note", runRoom, (p) => {
    p.meta.walls.alongCutMoved = (p.meta.walls.alongCutMoved || 0) + 7;
  }, "alongCutMoved|PAVED RUN note says");

  run("r13/G3b-moved-inflated-past-the-board-bound", movedRoom, (p) => {
    p.meta.walls.alongCutMoved = 999;
  }, "alongCutMoved says");

  run("r13/G3c-moved-is-not-a-count", runRoom, (p) => {
    p.meta.walls.alongCutMoved = -3;
  }, "non-negative integer");

  run("r13/G4-refused-list-deleted", runRoom, (p) => {
    delete p.meta.walls.alongCutRefused;
  }, "alongCutRefused is ABSENT|files no refusal for it");
}

// ---- M1b: the two records round 13 ADDED. A new published field with no
// reader is the position `nukeWindow` was in for two rounds, so both are
// re-derived on the shipped board the day they ship.
{
  const rkRoom = (kind) => roomWith((p) => Object.values(p.meta?.walls?.roadKind || {}).includes(kind));
  const anyRK = roomWith((p) => Object.keys(p.meta?.walls?.roadKind || {}).length > 0);
  const firstRK = (p, kind) => Object.keys(p.meta.walls.roadKind).find((k) => !kind || p.meta.walls.roadKind[k] === kind);

  run("r13/H1-roadKind-unknown-kind", anyRK, (p) => {
    p.meta.walls.roadKind[firstRK(p)] = "vibes";
  }, "is not one of the .* layer-7 passes");

  run("r13/H1b-roadKind-phantom-tile", anyRK, (p) => {
    p.meta.walls.roadKind["2,2"] = "spur";
  }, "a tile this room does not pave");

  // swamp is TERRAIN, so this classification is simply true or it is not: claim
  // the pass paid 5x-down-to-1 on a tile that was already 1.
  run("r13/H1c-roadKind-swamp-that-is-not-swamp",
    roomWith((p) => (p.structures.road || []).some((r) => !isSwamp(T(p.room).terrain, r.x, r.y))),
    (p, t) => {
      const r = (p.structures.road || []).find((q) => !isSwamp(t.terrain, q.x, q.y));
      if (r) p.meta.walls.roadKind[key(r.x, r.y)] = "swampPave";
    }, "the tile is not swamp");

  run("r13/H1d-roadKind-bridge-list-disagrees", roomWith(
    (p) => (p.meta?.walls?.conductBridge?.added || []).length > 0
      && Object.values(p.meta?.walls?.roadKind || {}).includes("conductBridge"),
  ), (p) => {
    const k = firstRK(p, "conductBridge");
    if (k) p.meta.walls.roadKind[k] = "spur";
  }, "one pass, one list");

  // THE COUNTER, PINNED TO A LIST. `alongCutMoved` used to be a bare integer no
  // re-derivation reached; the provenance map names the tiles it counts.
  run("r13/H1e-roadKind-moved-list-disagrees", rkRoom("alongCutMoved"), (p) => {
    const k = firstRK(p, "alongCutMoved");
    if (k) p.meta.walls.roadKind[k] = "spur";
  }, "of \"alongCutMoved\" provenance and");

  run("r13/H1f-roadKind-moved-tile-is-still-wall", rkRoom("alongCutMoved"), (p) => {
    // relabel a cut tile that carries a road: a swap that left the road on the
    // wall is the pass having done nothing
    const roads = new Set((p.structures.road || []).map((r) => key(r.x, r.y)));
    const onCut = (p.meta.shell.cut || []).find((c) => roads.has(key(c.x, c.y)));
    if (!onCut) return;
    const k = firstRK(p, "alongCutMoved");
    if (k) delete p.meta.walls.roadKind[k];
    p.meta.walls.roadKind[key(onCut.x, onCut.y)] = "alongCutMoved";
  }, "the tile is IN the cut|of \"alongCutMoved\" provenance and");

  const acrRoom = roomWith((p) => (p.meta?.walls?.alongCutRuns || []).length > 0);
  run("r13/H2-alongCutRuns-deleted", acrRoom, (p) => {
    delete p.meta.walls.alongCutRuns;
  }, "alongCutRuns is ABSENT");

  run("r13/H2b-alongCutRuns-roster-falsified", acrRoom, (p) => {
    p.meta.walls.alongCutRuns = [{ x: 2, y: 2, free: [], held: [] }];
  }, "the board's own D8 run roster");

  run("r13/H2c-alongCutRuns-free-is-not-free", acrRoom, (p) => {
    const r = p.meta.walls.alongCutRuns[0];
    // the run tile's own paved cut neighbour: a cut tile, already paved, and
    // therefore never a free interior parallel
    const cutK = new Set((p.meta.shell.cut || []).map((c) => key(c.x, c.y)));
    const roads = new Set((p.structures.road || []).map((q) => key(q.x, q.y)));
    for (const [dx, dy] of D8) {
      const k = key(r.x + dx, r.y + dy);
      if (cutK.has(k) && roads.has(k)) { r.free = [{ x: r.x + dx, y: r.y + dy }]; return; }
    }
  }, "as an interior parallel a road could move onto");

  run("r13/H2d-alongCutRuns-held-fact-is-false", acrRoom, (p) => {
    const r = p.meta.walls.alongCutRuns.find((e) => (e.held || []).length) || p.meta.walls.alongCutRuns[0];
    const m = /^(-?\d+),(-?\d+) /.exec(String((r.held || [])[0] || ""));
    if (!m) return;
    r.held[0] = `${m[1]},${m[2]} natural wall`;
  }, "and on the board this room ships that is FALSE|natural wall");

  run("r13/H2e-alongCutRuns-neighbour-unaccounted", acrRoom, (p) => {
    const r = p.meta.walls.alongCutRuns.find((e) => (e.held || []).length >= 2) || p.meta.walls.alongCutRuns[0];
    r.held = (r.held || []).slice(0, Math.max(0, (r.held || []).length - 2));
  }, "appear in neither");

  // ...and the room has to be one where the contradiction can be BUILT: a run
  // tile whose record lists a free parallel AND which has a refusal beside it.
  // Selecting on `acrRoom` alone let the mutation silently do nothing the moment
  // the fleet's first alongCutRuns room stopped listing a free tile, which is a
  // case that reports ESCAPE for the wrong reason.
  const acrFreeRoom = anyRoom((p) =>
    (p.meta?.walls?.alongCutRuns || []).some(
      (e) => (e.free || []).length && (p.meta?.walls?.alongCutRefused || []).some((q) => q.x === e.x && q.y === e.y),
    ),
  );
  run("r13/H2f-alongCutRuns-contradicts-the-refusal", acrFreeRoom, (p) => {
    // the record says a parallel is free; the refusal beside it says none exists
    const r = p.meta.walls.alongCutRuns.find(
      (e) => (e.free || []).length && (p.meta.walls.alongCutRefused || []).some((q) => q.x === e.x && q.y === e.y),
    );
    const e = (p.meta.walls.alongCutRefused || []).find((q) => q.x === r.x && q.y === r.y);
    e.why =
      `no interior parallel exists: ` +
      D8.map(
        ([dx, dy]) => `${r.x + dx},${r.y + dy} is itself a cut tile — that is the same problem one tile over`,
      ).join(" · ");
  }, "two published answers|One tile|that is FALSE");
}

// ---- M3: the as-built mobility CAUSE, whose value nothing re-derived ------
{
  const causeRoom = (v) => roomWith((p) => p.meta?.shell?.mobilityBuilt?.lift && p.meta.shell.mobilityBuilt.cause === v);
  for (const [from, to] of [
    ["structures", "terrain"],
    ["terrain", "structures"],
    ["terrain", "shape"],
    ["shape", "terrain"],
    ["shape", "structures"],
  ]) {
    const room = causeRoom(from);
    if (!room) continue;
    run(`r13/M3-cause-${from}-to-${to}`, room, (p) => {
      p.meta.shell.mobilityBuilt.cause = to;
    }, "`cause` says|re-derived on this room's own board");
  }
  // ...and the DECLARATION's copy, corrupted on its own. The record stays
  // right; the paragraph a reader reads says something else.
  const anyCause = causeRoom("terrain") || causeRoom("shape") || causeRoom("structures");
  run("r13/M3-declaration-cause-disagrees", anyCause, (p) => {
    const d = declOf(p, "mobility", null);
    if (d) d.cause = d.cause === "terrain" ? "shape" : "terrain";
  }, "one room, one verdict");
  run("r13/M3-lift-cause-disagrees", anyCause, (p) => {
    const L = p.meta.shell.mobilityBuilt.lift;
    L.cause = L.cause === "terrain" ? "shape" : "terrain";
  }, "lift.cause` says");
}

// ---- F8: a declaration kind nobody is obliged to file ---------------------
run("r13/F8-untriggered-declaration-kind", R, (p) => {
  p.meta.shortfalls = p.meta.shortfalls || [];
  p.meta.shortfalls.push({ gate: "misc", kind: "brand-new-excuse", ...evidence() });
}, "UNTRIGGERED DECLARATION KIND");
run("r13/F8-untriggered-gate", R, (p) => {
  p.meta.shortfalls = p.meta.shortfalls || [];
  p.meta.shortfalls.push({ gate: "vibes", ...evidence() });
}, "UNTRIGGERED DECLARATION KIND");

// ---- F3: the ten kinds whose paragraph was still hand-written -------------
//
// Round 12 generated and audited EIGHT of eighteen declaration kinds, and which
// eight was an accident of which kinds a reviewer had attacked. The other ten —
// 31 declarations — shipped prose assembled inside their producers, which the
// validator has no way to run, and a round-13 reviewer landed four passing lies
// on that gap in one sitting. All four are reproduced below AS THE REVIEWER
// WROTE THEM (surgical: one number, changed to the most comfortable value
// available, everything else left alone), plus the generic pair of attacks the
// r12/M3 block already runs on the original eight, now extended to all ten.
//
// ROOM SELECTION IS BY PROPERTY, as everywhere else here: each case finds a room
// that ships the kind, and reads the "comfortable" replacement out of that
// room's OWN record, so no case is pinned to a room name or to a number that
// changes when the planner re-plans.
{
  /** rewrite one phrase of a paragraph, and refuse to pass if it was not there */
  const reword = (gate, kind, phrase) => (p) => {
    const d = declOf(p, gate, kind);
    if (!d) return;
    const [from, to] = phrase(d);
    if (from === to || !String(d.detail).includes(from)) return; // no-op: the case will fail loudly
    d.detail = String(d.detail).replace(from, to);
  };

  // E2S8: "furthest tower is 11 walk from the sitter (want <= 10)" became
  // "3 walk" — a reading INSIDE the limit the same sentence quotes.
  const refillRoom = roomWithDecl("towerRefill", null);
  if (refillRoom) {
    run("r13/F3-towerRefill-walk-lied", refillRoom,
      reword("towerRefill", null, (d) => [`is ${d.towerRefill.maxRefill} walk`, `is 3 walk`]),
      "not the paragraph this record generates");
  }

  // E13S3: "1 cut tile(s)" became "0 cut tile(s)" — a declaration asserting
  // that it is about nothing at all, over a record that still said 1.
  const unreachRoom = roomWithDecl("battlements", "unreachable");
  if (unreachRoom) {
    run("r13/F3-unreachable-count-lied", unreachRoom,
      reword("battlements", "unreachable", (d) => [
        `WALL: ${d.battlements.unreachable} cut tile(s)`,
        `WALL: 0 cut tile(s)`,
      ]),
      "not the paragraph this record generates");
  }

  // E12S5: "AS BUILT this link feeds 5 parking tile(s)" became "feeds 7" — the
  // count the layer-1 search WANTED rather than the one the room ships. This
  // pair is in DECLARABLE_PAIRS, so the paragraph excuses a hard gate.
  const builtRoom = roomWith((p) => {
    const d = declOf(p, "ctrlParks", "seats");
    return d && d.ctrlParks && typeof d.ctrlParks.built === "number";
  });
  if (builtRoom) {
    run("r13/F3-ctrlparks-asbuilt-lied", builtRoom,
      reword("ctrlParks", "seats", (d) => [
        `feeds ${d.ctrlParks.built} parking tile(s)`,
        `feeds ${d.ctrlParks.parks} parking tile(s)`,
      ]),
      "not the paragraph this record generates");
  }

  // E13S2: "the lab diamond is 12 hauler tile(s) from the hub" became "2" —
  // the fleet median, quoted two clauses later in the same sentence.
  const haulRoom = roomWithDecl("labs", "lab-haul");
  if (haulRoom) {
    run("r13/F3-lab-haul-distance-lied", haulRoom,
      reword("labs", "lab-haul", (d) => [
        `is ${d.labs.haulDist} hauler tile(s)`,
        `is ${d.labs.fleetMedian} hauler tile(s)`,
      ]),
      "not the paragraph this record generates");
  }

  // ...and the generic pair, on every kind round 13 added a renderer for. The
  // second of the two is the round-11 laundering the numeral-presence rule used
  // to allow: a false paragraph with every audited numeral pasted on the end.
  for (const [gate, kind] of [
    ["spawnFan", "sector"], ["ctrlParks", "seats"], ["ctrlParks", "released"],
    ["runtime", "heavy-search"], ["labs", "shallow-lab"], ["labs", "lab-haul"],
    ["labs", "lab-road-eat"], ["battlements", null], ["battlements", "unreachable"],
    ["towerRefill", null],
  ]) {
    const room = roomWithDecl(gate, kind);
    if (!room) continue;
    const suffix = `${gate}${kind ? "-" + kind : ""}`;
    run(`r13/F3-prose-rewritten-${suffix}`, room, (p) => {
      const d = declOf(p, gate, kind);
      if (d) {
        d.detail =
          "Nothing is owed here: this room measured 2 of the 3 axes it could have missed and cleared " +
          "every one of them, so the declaration is filed for completeness rather than for a cost.";
      }
    }, "not the paragraph this record generates");
    run(`r13/F3-prose-rewritten-with-tokens-${suffix}`, room, (p) => {
      const d = declOf(p, gate, kind);
      if (!d) return;
      const toks = [...String(d.detail).matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]).join(" ");
      d.detail =
        "Nothing is owed here; every measurement in this room is comfortably inside its target. " +
        `[audit tokens: ${toks}]`;
    }, "not the paragraph this record generates");
  }

  // ...AND THE BYPASS. The identity check used to run only on kinds in
  // AUDITED_KINDS, so inventing a kind was enough to opt out of it — which is
  // precisely how the ten kinds above stayed unaudited for a round. A shipped
  // declaration whose kind has no renderer is now a fail on its own.
  run("r13/F3-renderer-bypass", R, (p) => {
    p.meta.shortfalls = p.meta.shortfalls || [];
    p.meta.shortfalls.push({ gate: "eco", kind: "hand-written-flavour", ...evidence() });
  }, "UNRENDERED DECLARATION KIND");
  // ...including on a gate whose kindless slot IS rendered: the key is the pair,
  // not the gate, so `eco|something` may not ride in on `eco|`'s renderer.
  run("r13/F3-renderer-bypass-known-gate", R, (p) => {
    p.meta.shortfalls = p.meta.shortfalls || [];
    p.meta.shortfalls.push({ gate: "mobility", kind: "narrative", ...evidence() });
  }, "UNRENDERED DECLARATION KIND");
}

// ---- F1: "unpaveable" was stated as a rule the engine does not have -------
//
// THESE CASES SYNTHESISE THE CONDITION RATHER THAN LOOKING FOR A ROOM IN IT.
// The r12 gap cases above are guarded by `if (gapRoom)` — a room that PUBLISHES
// a gap — and the round-13 fix removes the last two of those from the fleet, so
// on a fixed artifact those cases quietly stop being registered and the gate
// goes back to being untested. The gate is live in every room with a mineral
// seat (172 of 172), so the break and the false exemption are both constructed
// here instead: drop the roads around the seat container and the deferred
// conduct graph really does come apart, which is the state the exemption is for.
{
  const cheb2 = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  /** the mineral-seat containers — the ones the engine does not build until RCL 6 */
  const seatsOf = (p) => {
    const ex = (p.structures.extractor || [])[0];
    if (!ex) return [];
    return (p.structures.container || []).filter((c) => cheb2(c, ex) <= 1);
  };
  const seatRoom = roomWith((p) => seatsOf(p).length > 0 && (p.structures.road || []).length > 0);
  /** drop every road touching the seat, which is what makes the seat the only join */
  const isolateSeat = (p) => {
    const seats = seatsOf(p);
    const drop = new Set(
      (p.structures.road || []).filter((r) => seats.some((c) => cheb2(c, r) <= 1)).map((r) => key(r.x, r.y)),
    );
    p.structures.road = (p.structures.road || []).filter((r) => !drop.has(key(r.x, r.y)));
    p.meta.walls = p.meta.walls || {};
    p.meta.walls.conductBridge = p.meta.walls.conductBridge || {};
    return drop.size;
  };
  /** ...in a room where that actually severs the graph, re-derived here */
  const breakableRoom = roomWith((p) => {
    const seats = seatsOf(p);
    if (!seats.length || !(p.structures.road || []).length) return false;
    const seatK = new Set(seats.map((c) => key(c.x, c.y)));
    const drop = new Set(
      (p.structures.road || []).filter((r) => seats.some((c) => cheb2(c, r) <= 1)).map((r) => key(r.x, r.y)),
    );
    if (!drop.size) return false;
    const conduct = new Set();
    for (const r of p.structures.road) if (!drop.has(key(r.x, r.y))) conduct.add(key(r.x, r.y));
    for (const c of p.structures.container || []) if (!seatK.has(key(c.x, c.y))) conduct.add(key(c.x, c.y));
    const st = p.sitter || p.hub;
    const seed = key(st.x, st.y);
    if (!conduct.has(seed)) return false;
    const seen = new Set([seed]);
    const q = [seed];
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i].split(",").map(Number);
      for (const [dx, dy] of D8) {
        const nk = key(x + dx, y + dy);
        if (seen.has(nk) || !conduct.has(nk)) continue;
        seen.add(nk);
        q.push(nk);
      }
    }
    return [...conduct].some((k) => !seen.has(k));
  });

  // ROUND 14 RE-POINTED ALL FOUR OF THESE. The round-13 rule was "a gap tile
  // must carry an OBSTACLE", and its `else` branch GRANTED the obstacle case as
  // a conductor — a creep walking through the spawn. Walkable-and-unpaveable is
  // the empty set in Screeps, so the rule is now a refusal of every gap claim
  // and these cases are pointed at `PAVING GAP REFUSED`. The last one is the
  // one that changed meaning: it used to be the honest case.
  //
  // a container tile is NOT unpaveable — road and container legally share a tile
  // — and the round-12 clause called any occupied tile a gap, which is how both
  // shipped "gaps" turned out to be ordinary floor one road closes.
  run("r13/F1-gap-tile-is-a-container", seatRoom, (p) => {
    const roads = new Set((p.structures.road || []).map((r) => key(r.x, r.y)));
    const c = (p.structures.container || []).find((q) => !roads.has(key(q.x, q.y)))
      || (p.structures.container || [])[0];
    p.meta.walls = p.meta.walls || {};
    p.meta.walls.conductBridge = p.meta.walls.conductBridge || {};
    p.meta.walls.conductBridge.gapTiles = [{ x: c.x, y: c.y }];
  }, "PAVING GAP REFUSED");

  // re-pointed from r12/M1-gap-tiles-deleted: the break exists and the room
  // publishes no gap at all.
  run("r13/F1-synthetic-deferred-break", breakableRoom, (p) => {
    isolateSeat(p);
    p.meta.walls.conductBridge.gapTiles = [];
  }, "RCL-DEFERRED CONDUCT");

  // re-pointed from r12/M1-gap-tile-is-bare-floor
  run("r13/F1-synthetic-break-laundered-over-floor", breakableRoom, (p, t) => {
    isolateSeat(p);
    const occ = new Set();
    for (const [ty, arr] of Object.entries(p.structures)) {
      if (ty === "rampart") continue;
      for (const q of arr || []) occ.add(key(q.x, q.y));
    }
    for (let x = 2; x <= 47; x++) {
      for (let y = 2; y <= 47; y++) {
        if (!isWall(t.terrain, x, y) && !occ.has(key(x, y))) {
          p.meta.walls.conductBridge.gapTiles = [{ x, y }];
          return;
        }
      }
    }
  }, "PAVING GAP REFUSED");

  // ...and the case that USED TO BE THE HONEST ONE, which is round 14's whole
  // point: a gap named over a real obstacle was ADMITTED and granted conductor
  // status, so the deferred-conduct flood walked through the storage. It is
  // refused now, and the break behind it is still reported.
  run("r14/A2-gap-on-an-obstacle-is-refused", breakableRoom, (p) => {
    isolateSeat(p);
    const st = p.structures.storage[0];
    p.meta.walls.conductBridge.gapTiles = [{ x: st.x, y: st.y }];
  }, "PAVING GAP REFUSED");
  // ...and the exploit as the reviewer published it: three OBSTACLE tiles named
  // as gaps on a room with no break at all. Under the round-13 rule all three
  // were granted and validate passed; push-plan.mjs granted them too, so the
  // RCL orphan sweep and the unreachable-terminal sweep walked through a spawn.
  run("r14/A2-obstacle-gap-tiles-spawn-storage-lab", R, (p) => {
    const sp = (p.structures.spawn || [])[0];
    const st = (p.structures.storage || [])[0];
    const lb = (p.structures.lab || [])[0];
    p.meta.walls = p.meta.walls || {};
    p.meta.walls.conductBridge = p.meta.walls.conductBridge || {};
    p.meta.walls.conductBridge.gapTiles = [sp, st, lb].filter(Boolean).map((t) => ({ x: t.x, y: t.y }));
  }, "PAVING GAP REFUSED");
  // a gap on natural wall — nothing walks it, and it was refused before too
  run("r14/A2-gap-on-natural-wall", R, (p, t) => {
    p.meta.walls = p.meta.walls || {};
    p.meta.walls.conductBridge = p.meta.walls.conductBridge || {};
    for (let x = 1; x <= 48; x++) {
      for (let y = 1; y <= 48; y++) {
        if (isWall(t.terrain, x, y)) {
          p.meta.walls.conductBridge.gapTiles = [{ x, y }];
          return;
        }
      }
    }
  }, "PAVING GAP REFUSED");
}

// ===========================================================================
// ROUND 14 — THE RECORD, THE SCHEMA AND THE FIELDS WITH NO READER.
//
// Round 13 made every declaration's PARAGRAPH generated from its record. Round
// 14's reviewers made the obvious next move: falsify the RECORD and regenerate
// the paragraph with the shipped renderer, so producer and validator agree
// byte-for-byte and only the record's own content stands between the lie and a
// pass. Nine landed. Every one of them is a case below, planted the same way —
// `record` edited, `detail` regenerated by `renderDecl`.
//
// The rest of the block is the same shape one level out: fields that had no
// reader at all (`srcEnclosed`, `towerClump`, `pairCause`, `spurTiles`),
// obligations that could be switched off by deleting a meta key, and a
// re-derivation whose SCOPE was its own producer's answer.
// ===========================================================================
{
  /** plant a lie in a record and regenerate the paragraph from it */
  const planted = (gate, kind, edit) => (p) => {
    const d = declOf(p, gate, kind);
    if (!d) throw new Error(`no ${gate}/${kind || ""} declaration`);
    edit(d, p);
    d.detail = renderDecl({ ...d, detail: undefined });
  };
  const withDecl = (gate, kind, pred) =>
    anyRoom((p) => {
      const d = declOf(p, gate, kind);
      if (!d) return false;
      return !pred || pred(d, p);
    });

  // ---- A1: the nine landed record lies, verbatim ---------------------------
  run("r14/A1-labs-haulDist-lowered-to-the-fleet-median",
    withDecl("labs", "lab-haul", (d) => typeof d.labs?.haulDist === "number"),
    planted("labs", "lab-haul", (d) => { d.labs.haulDist = d.labs.fleetMedian; }),
    "`labs.haulDist` says");
  run("r14/A1-spawnFan-fanned-trade-laundered-into-impossibility",
    withDecl("spawnFan", "sector", (d) => d.spawnFan?.census?.fannedAvailable),
    planted("spawnFan", "sector", (d) => {
      d.spawnFan.census.fannedTriples = 0;
      d.spawnFan.census.fannedAvailable = null;
    }),
    "same census");
  run("r14/A1-spawnFan-census-arithmetic-broken",
    withDecl("spawnFan", "sector", (d) => typeof d.spawnFan?.census?.pool === "number"),
    planted("spawnFan", "sector", (d) => {
      d.spawnFan.census.pool = 999;
      d.spawnFan.census.viable = 999;
    }),
    "(same census|does not close)");
  run("r14/A1-ctrlParks-seat-ceiling-deflated",
    withDecl("ctrlParks", "seats", (d) => d.ctrlParks?.census?.runnerUp),
    planted("ctrlParks", "seats", (d) => {
      d.ctrlParks.census.maxParks = Math.max(0, d.ctrlParks.census.maxParks - 1);
      d.ctrlParks.census.runnerUp.parks = d.ctrlParks.census.maxParks;
    }),
    "runnerUp.parks");
  run("r14/A1-ctrlParks-held-inflated",
    withDecl("ctrlParks", "released", (d) => typeof d.ctrlParks?.held === "number"),
    planted("ctrlParks", "released", (d) => { d.ctrlParks.held = 99; }),
    "`ctrlParks.held` says");
  run("r14/A1-ctrlParks-deepTiles-falsified",
    withDecl("ctrlParks", "released", (d) => typeof d.ctrlParks?.deepTiles === "number"),
    planted("ctrlParks", "released", (d) => { d.ctrlParks.deepTiles = 1; }),
    "`ctrlParks.deepTiles` says");
  run("r14/A1-battlements-strandedByMass-zeroed",
    withDecl("battlements", "unreachable", (d) => d.battlements?.strandedByMass > 0),
    planted("battlements", "unreachable", (d) => { d.battlements.strandedByMass = 0; }),
    "`battlements.strandedByMass` says");
  run("r14/A1-battlements-unreachable-zeroed",
    withDecl("battlements", "unreachable", (d) => d.battlements?.unreachable > 0),
    planted("battlements", "unreachable", (d) => { d.battlements.unreachable = 0; }),
    "`battlements.unreachable` says");
  run("r14/A1-labs-eatAnchors-inflated",
    withDecl("labs", "lab-road-eat", (d) => typeof d.labs?.eatAnchors === "number"),
    planted("labs", "lab-road-eat", (d) => { d.labs.eatAnchors = 99; }),
    "eatAnchors");
  run("r14/A1-offNetwork-road-count-and-seats-falsified",
    withDecl("misc", "off-network"),
    planted("misc", "off-network", (d) => {
      d.offNetwork.roads = 1;
      d.offNetwork.seats = 99;
    }),
    "`offNetwork\\.(roads|seats)` says");
  run("r14/A1-labs-fallbackAnchors-zeroed",
    withDecl("labs", "shallow-lab", (d) => d.labs?.fallbackAnchors > 0),
    planted("labs", "shallow-lab", (d) => { d.labs.fallbackAnchors = 0; }),
    "`labs.fallbackAnchors` says");
  // ...and these two SYNTHESISE the declaration rather than looking for a room
  // carrying one. `towerRefill` fires only on a room over the hard MAX_REFILL,
  // and round 14's board fix took the fleet's only such room off the list — so a
  // room-seeking case would have quietly stopped testing the gate on exactly the
  // artifact that fixed the board. The kind's record is two numbers; both are
  // re-derived, so a planted declaration is caught on its own content.
  const plantTowerRefill = (edit) => (p) => {
    const d = {
      gate: "towerRefill",
      kind: null,
      detail: "",
      towerRefill: { maxRefill: p.meta?.towers?.maxRefill ?? 0, cap: 10 },
    };
    edit(d, p);
    d.detail = renderDecl({ ...d, detail: undefined });
    p.meta.shortfalls = [...(p.meta.shortfalls || []), d];
  };
  run("r14/A1-towerRefill-maxRefill-inside-its-own-cap",
    roomWith((p) => (p.meta?.towers?.maxRefill ?? 0) !== 3),
    plantTowerRefill((d) => { d.towerRefill.maxRefill = 3; }),
    "`towerRefill.maxRefill` says");
  run("r14/A1-towerRefill-cap-raised", R,
    plantTowerRefill((d) => { d.towerRefill.cap = 99; }),
    "`towerRefill.cap` says");
  run("r14/A1-ctrlParks-built-inflated",
    withDecl("ctrlParks", "seats", (d) => typeof d.ctrlParks?.built === "number"),
    planted("ctrlParks", "seats", (d) => { d.ctrlParks.built = d.ctrlParks.built + 2; }),
    "`ctrlParks.built` says");

  // ---- A1: the closure rule itself ----------------------------------------
  run("r14/A1-unclassified-leaf-invented", withDecl("misc", "off-network"), (p) => {
    declOf(p, "misc", "off-network").offNetwork.freebie = 42;
  }, "record-leaf inventory in this file does not name it");
  run("r14/A1-unclassified-block-invented", withDecl("battlements", "unreachable"), (p) => {
    declOf(p, "battlements", "unreachable").invented = { a: 1, b: 2 };
  }, "record-leaf inventory in this file does not name it");
  run("r14/A1-witnessed-counter-is-not-a-number", withDecl("towers", "clump"), (p) => {
    declOf(p, "towers", "clump").dispersion.search.singleSwapsTried = "lots";
  }, "not a non-negative number");
  run("r14/A1-witnessed-boolean-is-not-a-boolean", withDecl("towers", "weak-battery"), (p) => {
    declOf(p, "towers", "weak-battery").towers.search.converged = "yes";
  }, "not a boolean");

  // ---- A1: the rest of the derived surface, one leaf per kind --------------
  run("r14/A1-battlements-cutTiles-falsified",
    withDecl("battlements", "unreachable"),
    (p) => { declOf(p, "battlements", "unreachable").battlements.cutTiles = 3; },
    "(cutTiles|does not name it)");
  run("r14/A1-shell-linkOnCut-count-falsified", withDecl("shell", null),
    planted("shell", null, (d) => { d.linkOnCut.onCut = 5; }),
    "`linkOnCut.onCut` says");
  run("r14/A1-shell-linkOnCut-cutTiles-falsified", withDecl("shell", null),
    planted("shell", null, (d) => { d.linkOnCut.cutTiles = 7; }),
    "`linkOnCut.cutTiles` says");
  run("r14/A1-offNetwork-mineral-tile-moved", withDecl("misc", "off-network"),
    planted("misc", "off-network", (d) => { d.offNetwork.mineral = { x: 1, y: 1 }; }),
    "`offNetwork.mineral");
  run("r14/A1-offNetwork-cooldown-constants-falsified", withDecl("misc", "off-network"),
    planted("misc", "off-network", (d) => { d.offNetwork.extractorCooldown = 1; d.offNetwork.regenTicks = 10; }),
    "`offNetwork\\.(extractorCooldown|regenTicks)` says");
  run("r14/A1-clump-sitter-moved", withDecl("towers", "clump"),
    planted("towers", "clump", (d) => { d.clump.sitter = { x: 1, y: 1 }; }),
    "`clump.sitter");
  run("r14/A1-clump-note-line-moved", withDecl("towers", "clump"),
    planted("towers", "clump", (d) => { d.clump.note = 99; }),
    "`clump.note` says");
  run("r14/A1-battery-weakTiles-falsified", withDecl("towers", "weak-battery"),
    planted("towers", "weak-battery", (d) => { d.battery.weakTiles = 9; }),
    "`battery.weakTiles` says");
  run("r14/A1-battery-worst-tile-moved", withDecl("towers", "weak-battery"),
    planted("towers", "weak-battery", (d) => { d.battery.worst = { x: 1, y: 1 }; }),
    "`battery.worst");
  run("r14/A1-battery-hard-cap-raised", withDecl("towers", "weak-battery"),
    planted("towers", "weak-battery", (d) => { d.battery.maxRefillHard = 99; }),
    "`battery.maxRefillHard` says");
  run("r14/A1-eco-bearing-falsified", withDecl("eco", null, (d) => d.eco?.ctrlBearing),
    planted("eco", null, (d) => { d.eco.ctrlBearing = d.eco.ctrlBearing === "N" ? "S" : "N"; }),
    "`eco.ctrlBearing` says");
  run("r14/A1-eco-spread-pair-renamed", withDecl("eco", null, (d) => d.eco?.spreadPair),
    planted("eco", null, (d) => { d.eco.spreadPair = "controller 1,1 and source 1 2,2"; }),
    "`eco.spreadPair` says");
  run("r14/A1-eco-fleet-median-room-count-falsified", withDecl("eco", null),
    planted("eco", null, (d) => { d.eco.fleetMediansMeasured.rooms = 3; }),
    "`eco.fleetMediansMeasured.rooms` says");
  run("r14/A1-eco-cheb-floor-falsified", withDecl("eco", null),
    planted("eco", null, (d) => { d.eco.chebFloor = 0; }),
    "`eco.chebFloor` says");
  run("r14/A1-shallowExt-depthSafe-moved", withDecl("extensions", "shallow"),
    planted("extensions", "shallow", (d) => { d.shallowExt.depthSafe = 2; }),
    "`shallowExt.depthSafe` says");
  run("r14/A1-shallowExt-slot-record-truncated", withDecl("extensions", "shallow", (d) => (d.shallowExt?.slots || []).length > 1),
    (p) => { declOf(p, "extensions", "shallow").shallowExt.slots = []; },
    "per-slot record has");
  run("r14/A1-runtime-ladder-length-falsified", withDecl("runtime", "heavy-search"),
    planted("runtime", "heavy-search", (d) => { d.runtime.ladder = 40; }),
    "`runtime.ladder` says");
  run("r14/A1-runtime-seedSkip-falsified", withDecl("runtime", "heavy-search"),
    planted("runtime", "heavy-search", (d) => { d.runtime.seedSkip = 9; }),
    "`runtime.seedSkip` says");
  run("r14/A1-mobility-metric-target-moved", withDecl("mobility", null),
    planted("mobility", null, (d) => { d.metric.target = 9; }),
    "`metric.target` says");
  run("r14/A1-mobility-mass-adds-falsified", withDecl("mobility", null, (d) => typeof d.mass?.adds === "number"),
    planted("mobility", null, (d) => { d.mass.adds = d.mass.adds + 7; }),
    "`mass.adds` says");
  run("r14/A1-mobility-worst-pair-moved", withDecl("mobility", null, (d) => d.worst?.a),
    planted("mobility", null, (d) => { d.worst.a = { x: 1, y: 1 }; }),
    "`worst.a");
  run("r14/A1-mobility-worstCaused-flipped", withDecl("mobility", null, (d) => typeof d.worstCaused === "boolean"),
    planted("mobility", null, (d) => { d.worstCaused = !d.worstCaused; }),
    "`worstCaused` says");
  run("r14/A1-mobility-lift-ownPct-inflated", withDecl("mobility", null, (d) => d.lift && typeof d.lift.ownPct === "number"),
    planted("mobility", null, (d) => { d.lift.ownPct = 100; }),
    "`lift.ownPct` says");
  run("r14/A1-mobility-ladder-rung-count-mismatched",
    withDecl("mobility", null, (d) => Array.isArray(d.ladder?.rungs) && d.ladder.rungs.length > 1),
    (p) => { declOf(p, "mobility", null).ladder.rungs = [declOf(p, "mobility", null).ladder.rungs[0]]; },
    "rung\\(s\\) and `trailLength` says");
  run("r14/A1-mobility-negotiated-pair-off-the-board",
    withDecl("mobility", null, (d) => Array.isArray(d.negotiated?.tiles) && d.negotiated.tiles.length === 2),
    (p) => { declOf(p, "mobility", null).negotiated.tiles = [{ x: 0, y: 0 }, { x: 0, y: 0 }]; },
    "not a walkable tile of this room");
  run("r14/A1-covered-detour-noWalls-falsified", withDecl("mobility", "covered-detour"),
    planted("mobility", "covered-detour", (d) => { d.record.noWalls = 1; }),
    "`record.noWalls` says");
  run("r14/A1-covered-detour-cause-relabelled", withDecl("mobility", "covered-detour"),
    planted("mobility", "covered-detour", (d) => { d.cause = d.cause === "terrain" ? "shape" : "terrain"; }),
    "`cause` says");

  // ---- A2 is above, with the r13/F1 cases it re-points ---------------------

  // ---- A4: roadKind presence, coverage and enum ---------------------------
  const rkRoom = roomWith((p) => Object.keys(p.meta?.walls?.roadKind || {}).length > 0);
  run("r14/A4-roadKind-map-deleted", rkRoom, (p) => { delete p.meta.walls.roadKind; },
    "SCHEMA — `meta.walls.roadKind`");
  run("r14/A4-roadKind-map-emptied", rkRoom, (p) => { p.meta.walls.roadKind = {}; },
    "carry NO provenance");
  run("r14/A4-roadKind-map-is-an-array", rkRoom, (p) => { p.meta.walls.roadKind = []; },
    "SCHEMA — `meta.walls.roadKind`");
  run("r14/A4-roadKind-one-tile-unclassified", rkRoom, (p) => {
    delete p.meta.walls.roadKind[Object.keys(p.meta.walls.roadKind)[0]];
  }, "carry NO provenance");
  run("r14/A4-roadKind-phantom-key-on-an-earlier-layer-road", rkRoom, (p) => {
    const early = Object.keys(p.meta.roadLayer || {}).find((k) => p.meta.roadLayer[k] === 1);
    if (early) p.meta.walls.roadKind[early] = "spur";
  }, "not a live layer-7 road");

  // ---- A5 / A7: the delete-escapes -----------------------------------------
  run("r14/A5-towerDispersion-deleted", R, (p) => { delete p.meta.towers.towerDispersion; },
    "SCHEMA — `meta.towers.towerDispersion`");
  run("r14/A5-towerDispersion-after-deleted", R, (p) => { delete p.meta.towers.towerDispersion.after; },
    "SCHEMA — `meta.towers.towerDispersion`");
  run("r14/A5-shippedMinShellDmg-deleted", R, (p) => { delete p.meta.towers.shippedMinShellDmg; },
    "SCHEMA — `meta.towers.shippedMinShellDmg`");
  run("r14/A5-shippedMinShellDmg-is-prose", R, (p) => { p.meta.towers.shippedMinShellDmg = "lots"; },
    "SCHEMA — `meta.towers.shippedMinShellDmg`");
  {
    const rel = roomWithDecl("ctrlParks", "released");
    run("r14/A7-released-obligation-suppressed-by-deleting-ctrlParkFloor", rel, (p) => {
      p.meta.shortfalls = (p.meta.shortfalls || []).filter(
        (sf) => !(sf.gate === "ctrlParks" && sf.kind === "released"),
      );
      delete p.meta.ctrlParkFloor;
    }, "SCHEMA — `meta.ctrlParkFloor`");
    run("r14/A7-released-obligation-suppressed-by-deleting-ctrlParksAtSeatSearch", rel, (p) => {
      p.meta.shortfalls = (p.meta.shortfalls || []).filter(
        (sf) => !(sf.gate === "ctrlParks" && sf.kind === "released"),
      );
      delete p.meta.ctrlParksAtSeatSearch;
    }, "SCHEMA — `meta.ctrlParksAtSeatSearch`");
  }

  // ---- A6: srcEnclosed, the field with no reader ---------------------------
  {
    const openRoom = roomWith((p) => (p.meta?.shell?.srcEnclosed || []).some((v) => v === false));
    const closedRoom = roomWith((p) => (p.meta?.shell?.srcEnclosed || []).some((v) => v === true));
    run("r14/A6-srcEnclosed-over-claimed", openRoom, (p) => {
      p.meta.shell.srcEnclosed = p.meta.shell.srcEnclosed.map(() => true);
    }, "ENCLOSED SOURCES STALE");
    run("r14/A6-srcEnclosed-under-claimed", closedRoom, (p) => {
      p.meta.shell.srcEnclosed = p.meta.shell.srcEnclosed.map(() => false);
    }, "ENCLOSED SOURCES STALE");
    run("r14/A6-srcEnclosed-deleted", closedRoom, (p) => { delete p.meta.shell.srcEnclosed; },
      "ENCLOSED SOURCES UNPUBLISHED");
    run("r14/A6-srcEnclosed-truncated", closedRoom, (p) => { p.meta.shell.srcEnclosed = [true]; },
      "ENCLOSED SOURCES UNPUBLISHED");
  }

  // ---- A8: pairCause, published by every room and re-derived by nothing ----
  {
    const pcRoom = roomWith((p) => {
      const mb = p.meta?.shell?.mobilityBuilt;
      return mb && mb.pairCause && mb.pairCause !== "none" && declOf(p, "mobility", null);
    });
    run("r14/A8-pairCause-relabelled-on-both-copies", pcRoom, (p) => {
      const mb = p.meta.shell.mobilityBuilt;
      const other = mb.pairCause === "terrain" ? "shape" : "terrain";
      mb.pairCause = other;
      const d = declOf(p, "mobility", null);
      if (d) {
        d.pairCause = other;
        d.detail = renderDecl({ ...d, detail: undefined });
      }
    }, "`pairCause` says");
    run("r14/A8-pairCause-on-a-room-with-no-gated-pair",
      roomWith((p) => p.meta?.shell?.mobilityBuilt?.pairCause === "none"),
      (p) => { p.meta.shell.mobilityBuilt.pairCause = "structures"; },
      "`pairCause` says");
    run("r14/A8-causeWalks-noStructures-falsified",
      withDecl("mobility", null, (d) => typeof d.causeWalks?.noStructures === "number"),
      planted("mobility", null, (d) => { d.causeWalks.noStructures = 1; }),
      "`causeWalks.noStructures`");
    run("r14/A8-causeWalks-noWalls-falsified",
      withDecl("mobility", null, (d) => typeof d.causeWalks?.noWalls === "number"),
      planted("mobility", null, (d) => { d.causeWalks.noWalls = 99; }),
      "`causeWalks.noWalls`");
  }

  // ---- A9: towerClump, the other published 5x5 counter ---------------------
  run("r14/A9-towerClump-count-inflated", R, (p) => {
    p.meta.towers.towerClump.withinCheb2OfSitter += 3;
  }, "TOWER CLUMP STALE");
  run("r14/A9-towerClump-count-zeroed-on-a-clumped-room", roomWithDecl("towers", "clump"), (p) => {
    p.meta.towers.towerClump.withinCheb2OfSitter = 0;
  }, "TOWER CLUMP STALE");
  run("r14/A9-towerClump-deleted", R, (p) => { delete p.meta.towers.towerClump; },
    "TOWER CLUMP UNPUBLISHED");
  run("r14/A9-towerClump-tiles-emptied", roomWithDecl("towers", "clump"), (p) => {
    p.meta.towers.towerClump.tiles = [];
  }, "TOWER CLUMP STALE");
  run("r14/A9-towerClump-tiles-invented", R, (p) => {
    p.meta.towers.towerClump.tiles = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
  }, "TOWER CLUMP STALE");

  // ---- A10: spurTiles laid vs shipped --------------------------------------
  {
    const spurRoom = roomWith((p) => (p.meta?.walls?.spurTiles || 0) > 0);
    run("r14/A10-spurTiles-inflated", spurRoom, (p) => { p.meta.walls.spurTiles *= 10; },
      "meta.walls.spurTiles says stage 5 laid");
    run("r14/A10-spurTiles-below-the-shipped-count", spurRoom, (p) => { p.meta.walls.spurTiles = 0; },
      "can never be the smaller of the two");
    // THE LOST LIST NAMES TILES THE ROOM STILL SHIPS AS SPURS. Two spellings,
    // because the producer publishes both channels: `spurTilesLost` directly,
    // and `spurTilesLaidList` from which lost is the subtraction. Both are held
    // to the same fact — a tile cannot be both lost and live.
    run("r14/A10-spurTilesLost-names-a-live-spur", spurRoom, (p) => {
      const rk = p.meta.walls.roadKind || {};
      const live = Object.keys(rk).filter((k) => rk[k] === "spur");
      if (!live.length) throw new Error("no spur tiles");
      const pts = live.map((k) => {
        const [x, y] = k.split(",").map(Number);
        return { x, y };
      });
      p.meta.walls.spurTiles = p.meta.walls.spurTiles + live.length;
      p.meta.walls.spurTilesLost = pts;
      // keep the laid list consistent with the inflated count so the case tests
      // the lost-vs-live rule and not the arithmetic in front of it
      if (Array.isArray(p.meta.walls.spurTilesLaidList)) {
        p.meta.walls.spurTilesLaidList = [...p.meta.walls.spurTilesLaidList, ...pts];
      }
    }, "cannot be both lost and live");
    run("r14/A10-lost-list-contradicts-its-own-subtraction", spurRoom, (p) => {
      if (!Array.isArray(p.meta.walls.spurTilesLaidList)) throw new Error("no laid list");
      p.meta.walls.spurTilesLost = [{ x: 1, y: 1 }];
    }, "second answer to one question|accounts for");
    run("r14/A10-laid-list-omits-a-tile-the-room-ships-as-a-spur", spurRoom, (p) => {
      const rk = p.meta.walls.roadKind || {};
      const live = Object.keys(rk).filter((k) => rk[k] === "spur");
      if (!Array.isArray(p.meta.walls.spurTilesLaidList) || !live.length) throw new Error("no laid list");
      const [lx, ly] = live[0].split(",").map(Number);
      p.meta.walls.spurTilesLaidList = p.meta.walls.spurTilesLaidList.filter(
        (t) => !(t.x === lx && t.y === ly),
      );
    }, "was laid by the spur pass|names \\d+ distinct tile");
    run("r14/A10-spurTilesShipped-does-not-count-the-map", spurRoom, (p) => {
      p.meta.walls.spurTilesShipped = 999;
    }, "meta.walls.spurTilesShipped says");
  }

  // ---- A11: the run roster is the WALL's, not the cut's --------------------
  {
    const runRoom = roomWith((p) => {
      const road = new Set((p.structures.road || []).map((r) => key(r.x, r.y)));
      const rr = new Set((p.structures.rampart || []).filter((r) => road.has(key(r.x, r.y))).map((r) => key(r.x, r.y)));
      return [...rr].some((k) => {
        const [x, y] = k.split(",").map(Number);
        return D8.some(([dx, dy]) => rr.has(key(x + dx, y + dy)));
      });
    });
    run("r14/A11-run-refusals-deleted", runRoom, (p) => { p.meta.walls.alongCutRefused = []; },
      "files no refusal for it");
    run("r14/A11-run-roster-record-emptied", runRoom, (p) => { p.meta.walls.alongCutRuns = []; },
      "the board's own D8 run roster");
  }

  // ---- A3: the extractor's exemption belongs to the plan -------------------
  {
    const exRoom = anyRoom((p) => {
      const d = declOf(p, "misc", "off-network");
      if (!d) return false;
      const ex = (p.structures.extractor || [])[0];
      return ex && (d.tiles || []).some((t) => t.x === ex.x && t.y === ex.y);
    });
    run("r14/A3-extractor-declaration-dropped", exRoom, (p) => {
      const d = declOf(p, "misc", "off-network");
      const ex = (p.structures.extractor || [])[0];
      d.tiles = (d.tiles || []).filter((t) => !(t.x === ex.x && t.y === ex.y));
    }, "no-road x");
    // ...and the other direction: the exemption may not be claimed for an
    // extractor a hauler CAN already reach. Synthesised by paving one tile that
    // joins the extractor to the network the room already has, and leaving the
    // declaration standing.
    const joinTile = (p, t) => {
      const ex = (p.structures.extractor || [])[0];
      if (!ex || !t) return null;
      const roads = new Set((p.structures.road || []).map((r) => key(r.x, r.y)));
      const occ = new Set();
      for (const [ty, arr] of Object.entries(p.structures)) {
        if (ty === "rampart" || ty === "road") continue;
        for (const q of arr || []) occ.add(key(q.x, q.y));
      }
      for (const [dx, dy] of D8) {
        const x = ex.x + dx;
        const y = ex.y + dy;
        if (x < 1 || y < 1 || x > 48 || y > 48) continue;
        const k = key(x, y);
        if (isWall(t.terrain, x, y) || occ.has(k) || roads.has(k)) continue;
        if (!D8.some(([ax, ay]) => roads.has(key(x + ax, y + ay)))) continue;
        return { x, y };
      }
      return null;
    };
    const exRoomJoinable = anyRoom((p) => {
      const d = declOf(p, "misc", "off-network");
      const ex = (p.structures.extractor || [])[0];
      if (!d || !ex || !(d.tiles || []).some((q) => q.x === ex.x && q.y === ex.y)) return false;
      return !!joinTile(p, T(p.room));
    });
    run("r14/A3-extractor-claimed-off-network-when-it-is-on", exRoomJoinable, (p, t) => {
      const ex = (p.structures.extractor || [])[0];
      const roads = new Set((p.structures.road || []).map((r) => key(r.x, r.y)));
      const occ = new Set();
      for (const [ty, arr] of Object.entries(p.structures)) {
        if (ty === "rampart" || ty === "road") continue;
        for (const q of arr || []) occ.add(key(q.x, q.y));
      }
      for (const [dx, dy] of D8) {
        const x = ex.x + dx;
        const y = ex.y + dy;
        if (x < 1 || y < 1 || x > 48 || y > 48) continue;
        const k = key(x, y);
        if (isWall(t.terrain, x, y) || occ.has(k) || roads.has(k)) continue;
        if (!D8.some(([ax, ay]) => roads.has(key(x + ax, y + ay)))) continue;
        p.structures.road = [...(p.structures.road || []), { x, y }];
        p.meta.roadLayer = p.meta.roadLayer || {};
        p.meta.roadLayer[k] = 1;
        return;
      }
      throw new Error("no tile joins this extractor to the network in one pave");
    }, "it IS on the network");
    run("r14/A3-off-network-names-a-tile-that-is-neither", exRoom, (p) => {
      const d = declOf(p, "misc", "off-network");
      const st = (p.structures.storage || [])[0];
      d.tiles = [...(d.tiles || []), { x: st.x, y: st.y }];
    }, "neither a container nor this room's extractor");
  }
}


// ===========================================================================
// ROUND 15 — THE WITNESSED HALF, THE UN-INVENTORIED META, AND THE PROSE
// CHANNELS NOBODY READ.
//
// Round 14 closed the DERIVED half of every declaration record. Round 15's
// reviewers went one indirection deeper and found the same shape three times
// over:
//
//   · the WITNESSED half was type-only. `SEARCH_COUNTER` told 94 leaves'
//     worth of readers that "the census it belongs to closes arithmetically
//     around it" and the closure existed for ONE declaration kind. E11S6 could
//     ship 900 score-tied swaps out of 755 tried, render the sentence, and pass
//     172/172.
//   · `meta.towers.adjacency` — the whole tower-adjacency prior, whose
//     `forgone` sum the goal document quotes as a fleet figure — had no reader
//     at all. Nine mutations escaped in one sweep.
//   · all but one class of the planner's NOTES were unchecked prose, and
//     `meta.notes = []` passed every room in the fleet.
//
// Every case below is one of those escapes, planted the way its reviewer
// planted it — and where the defect is in a record, the paragraph is
// regenerated from the mutated record with the shipped renderer, so producer
// and validator agree byte for byte and only the content is left standing.
// ===========================================================================
{
  const planted15 = (gate, kind, edit) => (p) => {
    const d = declOf(p, gate, kind);
    if (!d) throw new Error(`no ${gate}/${kind || ""} declaration`);
    edit(d, p);
    d.detail = renderDecl({ ...d, detail: undefined });
  };
  const withDecl15 = (gate, kind, pred) =>
    anyRoom((p) => {
      const d = declOf(p, gate, kind);
      return d ? !pred || pred(d, p) : false;
    });

  // ---- B1: THE 26 IMPOSSIBLE-ARITHMETIC LEAVES ---------------------------
  //
  // Each of these is a number that CANNOT be what it says it is, given another
  // number on the same record. Every one of them passed 172/172 before this
  // round, because the bound the inventory stated for it was implemented for
  // `spawnFan|sector` and described as applying to all eighteen kinds.
  const arith = [
    // [name, gate, kind, predicate, edit, expected]
    ["towers-clump-scoreTied-exceeds-tried", "towers", "clump",
      (d) => typeof d.dispersion?.search?.singleSwapsTried === "number",
      (d) => { d.dispersion.search.singleSwapsScoreTied = d.dispersion.search.singleSwapsTried + 145; },
      "singleSwapsScoreTied"],
    ["towers-clump-pairTied-out-of-zero-pair-swaps", "towers", "clump",
      (d) => d.dispersion?.search?.pairSwapsTried === 0,
      (d) => { d.dispersion.search.pairSwapsScoreTied = 500; },
      "pairSwapsScoreTied"],
    ["towers-clump-pairImproved-exceeds-pairSwaps", "towers", "clump",
      (d) => typeof d.dispersion?.search?.pairSwapsTried === "number",
      (d) => { d.dispersion.search.pairImproved = d.dispersion.search.pairSwapsTried + 9; },
      "pairImproved"],
    ["towers-clump-improvedBy-not-the-subtraction", "towers", "clump",
      (d) => typeof d.dispersion?.search?.improvedBy === "number",
      (d) => { d.dispersion.search.improvedBy = d.dispersion.search.improvedBy + 7; },
      "improvedBy"],
    ["towers-clump-within-exceeds-total-at-layer3", "towers", "clump",
      (d) => typeof d.dispersion?.totalAtLayer3 === "number",
      (d) => { d.dispersion.withinAtLayer3 = d.dispersion.totalAtLayer3 + 3; },
      "withinAtLayer3"],
    ["towers-clump-total-at-layer3-over-the-program", "towers", "clump",
      (d) => typeof d.dispersion?.totalAtLayer3 === "number",
      (d) => { d.dispersion.totalAtLayer3 = 99; },
      "totalAtLayer3"],
    ["towers-clump-windowBefore-under-windowAfter", "towers", "clump",
      (d) => typeof d.dispersion?.windowBefore === "number",
      (d) => { d.dispersion.windowBefore = 0; },
      "windowBefore"],
    ["towers-clump-tiebreak-budget-invented", "towers", "clump",
      (d) => typeof d.dispersion?.tiebreakBudget === "number",
      (d) => { d.dispersion.tiebreakBudget = 999; },
      "tiebreakBudget"],
    ["battery-refill-moved-exceeds-tried", "towers", "weak-battery",
      (d) => typeof d.towers?.refillSearch?.tried === "number",
      (d) => { d.towers.refillSearch.moved = d.towers.refillSearch.tried + 4; },
      "refillSearch.moved"],
    ["battery-refill-scoreTied-exceeds-tried", "towers", "weak-battery",
      (d) => typeof d.towers?.refillSearch?.tried === "number",
      (d) => { d.towers.refillSearch.scoreTied = d.towers.refillSearch.tried + 11; },
      "refillSearch.scoreTied"],
    ["battery-refill-dispersionOk-exceeds-tried", "towers", "weak-battery",
      (d) => typeof d.towers?.refillSearch?.tried === "number",
      (d) => { d.towers.refillSearch.dispersionOk = d.towers.refillSearch.tried + 2; },
      "refillSearch.dispersionOk"],
    ["battery-refill-crossOffered-exceeds-tried", "towers", "weak-battery",
      (d) => typeof d.towers?.refillSearch?.tried === "number",
      (d) => { d.towers.refillSearch.crossOffered = d.towers.refillSearch.tried + 1; },
      "refillSearch.crossOffered"],
    ["battery-refill-pass-got-longer", "towers", "weak-battery",
      (d) => typeof d.towers?.refillSearch?.before === "number",
      (d) => { d.towers.refillSearch.after = d.towers.refillSearch.before + 3; },
      "refillSearch.(before|after)"],
    ["battery-refill-moved-nothing-but-improved", "towers", "weak-battery",
      (d) => d.towers?.refillSearch?.moved === 0 && d.towers.refillSearch.before === d.towers.refillSearch.after,
      (d) => { d.towers.refillSearch.moved = 2; },
      "refillSearch.moved"],
    ["battery-search-improvements-exceed-rounds", "towers", "weak-battery",
      (d) => typeof d.towers?.search?.rounds === "number",
      (d) => { d.towers.search.improvements = d.towers.search.rounds + 5; },
      "search.improvements"],
    ["battery-search-starts-exceed-restart-budget", "towers", "weak-battery",
      (d) => typeof d.towers?.search?.restarts === "number",
      (d) => { d.towers.search.starts = d.towers.search.restarts + 1; d.towers.starts = d.towers.search.starts; },
      "search.starts"],
    ["battery-search-improved-downhill", "towers", "weak-battery",
      (d) => typeof d.towers?.search?.improvedFrom === "number",
      (d) => { d.towers.search.improvedTo = d.towers.search.improvedFrom - 300; },
      "search.improved(From|To)"],
    ["battery-search-zero-improvements-moved-the-number", "towers", "weak-battery",
      (d) => d.towers?.search?.improvements === 0,
      (d) => { d.towers.search.improvedTo = d.towers.search.improvedFrom + 600; },
      "search.improvedTo"],
    ["battery-weakTiles-exceed-the-cut", "towers", "weak-battery",
      (d) => typeof d.towers?.declaredCutTiles === "number",
      (d) => { d.towers.weakTiles = d.towers.declaredCutTiles + 6; },
      "towers.weakTiles"],
    ["battery-min-face-above-the-mean", "towers", "weak-battery",
      (d) => typeof d.towers?.avgShellDmg === "number",
      (d) => { d.towers.minShellDmg = d.towers.avgShellDmg + 300; },
      "towers.(min|avg)ShellDmg"],
    ["battery-layer3-cut-smaller-than-the-shipped-one", "towers", "weak-battery",
      (d) => typeof d.battery?.cutTiles === "number",
      (d) => { d.towers.declaredCutTiles = Math.max(0, d.battery.cutTiles - 5); },
      "towers.declaredCutTiles"],
    ["battery-unblocked-walk-longer-than-the-blocked-one", "towers", "weak-battery",
      (d) => typeof d.towers?.maxRefill === "number",
      (d) => { d.towers.maxRefillUnblocked = d.towers.maxRefill + 4; },
      "maxRefillUnblocked"],
    ["battery-placement-walks-lose-a-tower", "towers", "weak-battery",
      (d) => Array.isArray(d.battery?.refillDistsAtPlacement),
      (d) => { d.battery.refillDistsAtPlacement = d.battery.refillDistsAtPlacement.slice(0, 4); },
      "refillDistsAtPlacement"],
    ["battery-inert-prune-disagrees-with-the-prune", "towers", "weak-battery",
      (d) => typeof d.battery?.inertPruned === "number",
      (d) => { d.battery.inertPruned = d.battery.inertPruned + 9; },
      "battery.inertPruned"],
    ["shallow-outcomes-do-not-account-for-the-slots", "extensions", "shallow",
      (d) => typeof d.shallowExt?.impossible === "number",
      (d) => { d.shallowExt.impossible = d.shallowExt.impossible + 3; },
      "shallowExt"],
    ["shallow-refusal-list-shorter-than-its-count", "extensions", "shallow",
      (d) => Array.isArray(d.shallowExt?.search?.refused) && d.shallowExt.search.refused.length > 1,
      (d) => { d.shallowExt.search.refused = d.shallowExt.search.refused.slice(1); },
      "refused"],
    ["shallow-shared-target-slots-exceed-the-slots", "extensions", "shallow",
      (d) => typeof d.shallowExt?.count === "number",
      (d) => { d.shallowExt.search.sharedTargetSlots = d.shallowExt.count + 4; },
      "sharedTargetSlots"],
    ["shallow-interior-band-is-not-48x48", "extensions", "shallow",
      (d) => typeof d.shallowExt?.search?.interiorTiles === "number",
      (d) => { d.shallowExt.search.interiorTiles = 4000; },
      "interiorTiles"],
    ["eco-core-bigger-than-the-basin", "eco", null,
      (d) => typeof d.eco?.basin === "number",
      (d) => { d.eco.coreSize = d.eco.basin + 40; },
      "eco.coreSize"],
    ["eco-core-disagrees-with-its-own-meta", "eco", null,
      (d) => typeof d.eco?.coreSize === "number",
      (d) => { d.eco.coreSize = d.eco.coreSize - 1; },
      "eco.coreSize"],
    ["labs-blocked-anchors-exceed-the-anchors", "labs", "lab-road-eat",
      (d) => typeof d.labs?.eatAnchors === "number",
      (d) => { d.labs.eatBlockedByNet = d.labs.eatAnchors + 7; },
      "eatBlockedByNet"],
    ["mobility-lane-deep-exceeds-lane-tiles", "mobility", null,
      (d) => typeof d.lane?.tiles === "number",
      (d) => { d.lane.deep = d.lane.tiles + 9; },
      "lane.deep"],
    ["mobility-lane-shrunk-grew", "mobility", null,
      (d) => typeof d.lane?.shrunk?.wanted === "number",
      (d) => { d.lane.shrunk.to = d.lane.shrunk.wanted + 5; },
      "lane.shrunk"],
    ["mobility-lane-strand-rounds-exceed-rounds", "mobility", null,
      (d) => typeof d.lane?.rounds === "number",
      (d) => { d.lane.strandRounds = d.lane.rounds + 3; },
      "lane.strandRounds"],
    ["mobility-room-ships-outside-its-own-lane-bound", "mobility", null,
      (d) => typeof d.lane?.bounded === "number" && typeof d.mass?.builtLap === "number",
      (d) => { d.lane.bounded = 0; },
      "lane.bounded"],
    ["mobility-mass-repair-moved-more-than-it-tried", "mobility", null,
      (d) => typeof d.repair?.mass?.trials === "number",
      (d) => { d.repair.mass.moved = d.repair.mass.trials + 6; },
      "repair.mass.moved"],
    ["mobility-mass-repair-ran-no-round-but-tried", "mobility", null,
      (d) => d.repair?.mass?.rounds === 0,
      (d) => { d.repair.mass.trials = 40; d.repair.mass.blockersSeen = 12; },
      "repair.mass"],
    ["mobility-mass-repair-round-that-tried-nothing", "mobility", null,
      (d) => d.repair?.mass?.rounds === 0 && d.repair.mass.trials === 0,
      (d) => { d.repair.mass.rounds = 9; },
      "repair.mass.rounds"],
    ["mobility-tower-veto-affordable-exceeds-tried", "mobility", null,
      (d) => typeof d.repair?.tower?.tried === "number",
      (d) => { d.repair.tower.affordable = d.repair.tower.tried + 3; },
      "repair.tower.affordable"],
    ["mobility-tower-veto-proved-a-swap-it-could-not-afford", "mobility", null,
      (d) => d.repair?.tower?.provedFree === false && (d.repair.tower.affordable || 0) === 0,
      (d) => { d.repair.tower.provedFree = true; },
      "repair.tower.provedFree"],
    ["mobility-tower-veto-battery-shortened-the-lap", "mobility", null,
      (d) => typeof d.repair?.tower?.baseLap === "number",
      (d) => { d.repair.tower.lapWithBattery = 0; },
      "repair.tower.(baseLap|lapWithBattery)"],
    ["mobility-tower-veto-disagrees-with-its-own-meta", "mobility", null,
      (d) => typeof d.repair?.tower?.tried === "number",
      (d) => { d.repair.tower.tried = d.repair.tower.tried + 1000; },
      "repair.tower.tried"],
    ["mobility-negotiated-reachable-exceeds-endpoints", "mobility", null,
      (d) => typeof d.negotiated?.metric?.endpoints === "number",
      (d) => { d.negotiated.metric.reachable = d.negotiated.metric.endpoints + 12; },
      "negotiated.metric.(endpoints|reachable)"],
    ["mobility-negotiated-strict-below-ungated", "mobility", null,
      (d) => typeof d.negotiated?.metric?.maxUngated === "number",
      (d) => { d.negotiated.metric.maxStrict = 0; },
      "negotiated.metric.max(Strict|Ungated)"],
    ["mobility-negotiated-overGated-exceeds-gatedPairs", "mobility", null,
      (d) => typeof d.negotiated?.metric?.gatedPairs === "number",
      (d) => { d.negotiated.metric.overGated = d.negotiated.metric.gatedPairs + 4; },
      "negotiated.metric.overGated"],
    ["mobility-negotiated-p90-above-the-maximum", "mobility", null,
      (d) => typeof d.negotiated?.metric?.p90 === "number",
      (d) => { d.negotiated.metric.p90 = d.negotiated.metric.maxUngated + 5; },
      "negotiated.metric.p90"],
    ["mobility-negotiated-counterfactual-walk-longer-than-the-real-one", "mobility", null,
      (d) => typeof d.negotiated?.causeWalks?.noStructures?.d === "number",
      (d) => { d.negotiated.causeWalks.noStructures.d = d.negotiated.walk.din + 8; },
      "causeWalks.noStructures.d"],
    ["mobility-negotiated-counterfactual-ratio-is-not-the-quotient", "mobility", null,
      (d) => typeof d.negotiated?.causeWalks?.noWalls?.ratio === "number",
      (d) => { d.negotiated.causeWalks.noWalls.ratio = 9.9; },
      "causeWalks.noWalls.ratio"],
    ["mobility-negotiated-worst-detour-ratio-is-not-the-quotient", "mobility", null,
      (d) => typeof d.negotiated?.worstDetour?.ratio === "number",
      (d) => { d.negotiated.worstDetour.ratio = 42; },
      "worstDetour.ratio"],
    ["mobility-negotiated-maxDetour-is-not-the-subtraction", "mobility", null,
      (d) => typeof d.negotiated?.metric?.maxDetour === "number",
      (d) => { d.negotiated.metric.maxDetour = d.negotiated.metric.maxDetour + 4; },
      "maxDetour"],
    ["mobility-negotiated-floor-and-lap-do-not-reconcile", "mobility", null,
      (d) => typeof d.negotiated?.floor === "number" && !d.negotiated.eco,
      (d) => { d.negotiated.floor = d.negotiated.floor / 2; },
      "negotiated.(floor|lap)"],
    ["mobility-ladder-cap-invented", "mobility", null,
      (d) => typeof d.ladder?.cap === "number",
      (d) => { d.ladder.cap = 99; },
      "ladder.cap"],
    ["mobility-ladder-ramparts-not-the-ones-built", "mobility", null,
      (d) => typeof d.ladder?.shippedRamparts === "number",
      (d) => { d.ladder.shippedRamparts = d.ladder.shippedRamparts + 10; },
      "ladder.shippedRamparts"],
    ["mobility-ladder-trail-shorter-than-the-rungs", "mobility", null,
      (d) => Array.isArray(d.ladder?.rungs) && d.ladder.rungs.length > 1,
      (d) => { d.ladder.trailLength = d.ladder.rungs.length - 1; },
      "trailLength|rung"],
    ["mobility-shipped-wall-lap-longer-than-the-bare-board", "mobility", null,
      (d) => typeof d.negotiated?.shippedWallLap === "number",
      (d) => { d.negotiated.shippedWallLap = (d.mass?.bareLap || 0) + 5; },
      "shippedWallLap"],
    ["ctrlparks-released-holding-cheaper-than-releasing", "ctrlParks", "released",
      (d) => typeof d.ctrlParks?.rampartsHolding === "number",
      (d) => { d.ctrlParks.rampartsHolding = 10; },
      "rampartsHolding"],
    ["ctrlparks-released-rejections-exceed-the-walk", "ctrlParks", "released",
      (d) => Array.isArray(d.ctrlParks?.composedCaps),
      (d) => { d.ctrlParks.rejectedError = d.ctrlParks.composedCaps.length + 4; },
      "rejection"],
    ["ctrlparks-seats-sealing-exceeds-considered", "ctrlParks", "seats",
      (d) => typeof d.ctrlParks?.census?.considered === "number",
      (d) => { d.ctrlParks.census.sealing = d.ctrlParks.census.considered + 3; },
      "sealing"],
  ];
  for (const [name, gate, kind, pred, edit, expect] of arith) {
    run(`r15/B1-${name}`, withDecl15(gate, kind, pred), planted15(gate, kind, edit), expect);
  }

  // ---- B2: THE PROMISE-VS-IMPLEMENTATION SELF-CHECK -----------------------
  //
  // Not a plan mutation: the file's own load-time assertion. A witnessed leaf
  // whose `why` states a bound and which carries no closure must stop the file
  // from starting at all. It is tested the only way an assertion of that shape
  // can be — by feeding the checker a leaf of exactly that description.
  //
  // It cannot be tested by breaking a PLAN, so it is tested directly: the
  // function `assertRecordInventory` runs at load is handed a leaf of exactly
  // the shape the rule refuses (a stated bound with no closure), a leaf of the
  // shape it allows (an honest type-only sentence), and one whose sentence is
  // GENERATED from real closures. Loading validate.mjs at the top of this file
  // already proved the real inventory passes; this proves the rule has teeth.
  {
    const name = "r15/B2-a-promised-or-silent-bound-is-refused-at-load";
    const promised = { klass: "witnessed", why: "a counter over a finished search; the bound is that it may not exceed the pool it was drawn from", closures: [] };
    const honest = { klass: "witnessed", why: "a counter over a finished search, and THAT IS THE WHOLE BOUND — nothing on this record closes around it", closures: [] };
    const backed = { klass: "witnessed", why: "a counter over a finished search, and it may not exceed `pool`", closures: [{ op: "le", other: "pool" }] };
    const silent = { klass: "witnessed", why: "a counter over a finished search that nothing on the shipped board records", closures: [] };
    const fails15 = [];
    if (!witnessPromiseUnbacked(promised)) fails15.push("a `why` stating a bound with NO closure was accepted");
    if (witnessPromiseUnbacked(honest)) fails15.push("an honest type-only `why` was rejected");
    if (witnessPromiseUnbacked(backed)) fails15.push("a `why` whose bound IS implemented was rejected");
    // ...and the second half of the rule: silence is not honesty either.
    if (!witnessSilentlyTypeOnly(silent)) fails15.push("a closure-less `why` that never says it is type-only was accepted");
    if (witnessSilentlyTypeOnly(honest)) fails15.push("a `why` that DOES say it is type-only was rejected");
    if (witnessSilentlyTypeOnly(backed)) fails15.push("a `why` with an implemented closure was asked to declare itself type-only");
    if (!RECORD_LEAF_STATS || !(RECORD_LEAF_STATS.closured > 0)) {
      fails15.push(`the inventory reports ${JSON.stringify(RECORD_LEAF_STATS)} — no leaf carries a closure at all`);
    }
    results.push({
      name,
      room: "-",
      caught: fails15.length === 0,
      matched: fails15.length === 0,
      expect: "(the load-time promise check has teeth)",
      fails: fails15,
      note: `${RECORD_LEAF_STATS.closured} witnessed leaf/leaves carry an implemented closure`,
    });
  }

  // ---- B3: `meta.towers.adjacency` — THE NINE ESCAPES --------------------
  const adjRoom = anyRoom((p) => p.meta?.towers?.adjacency?.satAcrossPrior);
  const pairRoom = anyRoom((p) => (p.meta?.towers?.adjacency?.pairs || 0) > 0);
  run("r15/B3-adjacency-deleted-outright", adjRoom, (p) => {
    delete p.meta.towers.adjacency;
  }, "meta.towers.adjacency");
  run("r15/B3-satAcrossPrior-subobject-deleted", adjRoom, (p) => {
    delete p.meta.towers.adjacency.satAcrossPrior;
  }, "satAcrossPrior");
  run("r15/B3-held-falsified", adjRoom, (p) => {
    p.meta.towers.adjacency.satAcrossPrior.held += 300;
  }, "satAcrossPrior.held");
  run("r15/B3-held-rebound-to-layer-3s-board", anyRoom(
    (p) => p.meta?.towers?.adjacency?.satAcrossPrior && p.meta.towers.minShellDmg !== p.meta.towers.shippedMinShellDmg,
  ), (p) => {
    // THE ROUND-14 DEFECT, RE-PLANTED. `held` used to be layer 3's reading of
    // its own pre-prune cut, published under a field doc reading "what the room
    // ships". Five rooms differ; this is one of them.
    p.meta.towers.adjacency.satAcrossPrior.held = p.meta.towers.minShellDmg;
  }, "satAcrossPrior.(held|forgone|reachable)"),
  run("r15/B3-reachable-falsified", adjRoom, (p) => {
    p.meta.towers.adjacency.satAcrossPrior.reachable += 600;
  }, "satAcrossPrior.(reachable|forgone)");
  run("r15/B3-forgone-inflated", adjRoom, (p) => {
    p.meta.towers.adjacency.satAcrossPrior.forgone = 900;
  }, "satAcrossPrior.forgone");
  run("r15/B3-forgone-goes-negative", adjRoom, (p) => {
    const sap = p.meta.towers.adjacency.satAcrossPrior;
    sap.forgone = -30;
    sap.reachable = sap.held - 30;
  }, "satAcrossPrior");
  run("r15/B3-offerOnShipped-falsified", anyRoom(
    (p) => typeof p.meta?.towers?.adjacency?.satAcrossPrior?.offerOnShipped === "number",
  ), (p) => {
    p.meta.towers.adjacency.satAcrossPrior.offerOnShipped += 240;
  }, "offerOnShipped");
  run("r15/B3-atLayer3-deleted", adjRoom, (p) => {
    delete p.meta.towers.adjacency.satAcrossPrior.atLayer3;
  }, "atLayer3");
  run("r15/B3-atLayer3-rebound-to-the-shipped-board", anyRoom(
    (p) => p.meta?.towers?.adjacency?.satAcrossPrior?.atLayer3 && p.meta.towers.minShellDmg !== p.meta.towers.shippedMinShellDmg,
  ), (p) => {
    p.meta.towers.adjacency.satAcrossPrior.atLayer3.held = p.meta.towers.shippedMinShellDmg;
  }, "atLayer3");
  run("r15/B3-basis-string-dropped", adjRoom, (p) => {
    p.meta.towers.adjacency.satAcrossPrior.basis = "yes";
  }, "basis");
  run("r15/B3-priorHeld-flipped", adjRoom, (p) => {
    p.meta.towers.adjacency.priorHeld = !p.meta.towers.adjacency.priorHeld;
  }, "priorHeld");
  run("r15/B3-pairs-emptied", pairRoom, (p) => {
    p.meta.towers.adjacency.pairs = 0;
    p.meta.towers.adjacency.priorHeld = true;
  }, "pairs");
  run("r15/B3-pairTiles-emptied", pairRoom, (p) => {
    p.meta.towers.adjacency.pairTiles = [];
  }, "pairTiles");
  run("r15/B3-pairs-invented-on-a-room-with-none", anyRoom((p) => p.meta?.towers?.adjacency?.pairs === 0), (p) => {
    const t = p.structures.tower;
    p.meta.towers.adjacency.pairs = 1;
    p.meta.towers.adjacency.pairTiles = [[{ x: t[0].x, y: t[0].y }, { x: t[1].x, y: t[1].y }]];
  }, "pair");
  run("r15/B3-crossings-emptied", anyRoom((p) => (p.meta?.towers?.adjacency?.crossings || []).length), (p) => {
    p.meta.towers.adjacency.crossings = [];
  }, "adjacency");
  run("r15/B3-crossing-refillTo-falsified", anyRoom(
    (p) => (p.meta?.towers?.adjacency?.crossings || []).some((c) => typeof c.refillTo === "number"),
  ), (p) => {
    for (const c of p.meta.towers.adjacency.crossings) if (typeof c.refillTo === "number") c.refillTo -= 3;
  }, "refill");
  run("r15/B3-crossing-lands-on-no-tower", anyRoom((p) => (p.meta?.towers?.adjacency?.crossings || []).length), (p) => {
    p.meta.towers.adjacency.crossings[0].to = { x: 1, y: 1 };
  }, "crossing");
  run("r15/B3-crossOffered-exceeds-tried", adjRoom, (p) => {
    const sap = p.meta.towers.adjacency.satAcrossPrior;
    sap.crossOffered = (sap.tried || 0) + 5;
  }, "crossOffered");

  // ---- B4: THE PER-KIND LATE-ROAD BOOKS ----------------------------------
  const kindRoom = anyRoom((p) => p.meta?.walls?.laidByKind && Object.keys(p.meta.walls.laidByKind).length);
  run("r15/B4-laidByKind-deleted", kindRoom, (p) => {
    delete p.meta.walls.laidByKind;
  }, "laidByKind");
  run("r15/B4-lostByKind-deleted", kindRoom, (p) => {
    delete p.meta.walls.lostByKind;
  }, "lostByKind");
  run("r15/B4-a-kind-drops-out-of-one-book", kindRoom, (p) => {
    // THE REFLOW SHAPE: shipped and lost recorded, laid never was.
    const k = Object.keys(p.meta.walls.shippedByKind)[0];
    delete p.meta.walls.laidByKind[k];
  }, "laidByKind");
  run("r15/B4-laid-does-not-equal-shipped-plus-lost", anyRoom(
    (p) => Object.entries(p.meta?.walls?.laidByKind || {}).some(([, v]) => v > 0),
  ), (p) => {
    const k = Object.entries(p.meta.walls.laidByKind).find(([, v]) => v > 0)[0];
    p.meta.walls.laidByKind[k] += 3;
  }, "laid|survives");
  run("r15/B4-shipped-count-disagrees-with-the-provenance-map", anyRoom(
    (p) => Object.entries(p.meta?.walls?.shippedByKind || {}).some(([, v]) => v > 0),
  ), (p) => {
    const k = Object.entries(p.meta.walls.shippedByKind).find(([, v]) => v > 0)[0];
    p.meta.walls.shippedByKind[k] += 1;
  }, "shippedByKind");
  run("r15/B4-laid-tile-list-shorter-than-its-count", anyRoom(
    (p) => Object.entries(p.meta?.walls?.laidTilesByKind || {}).some(([, v]) => Array.isArray(v) && v.length > 1),
  ), (p) => {
    const k = Object.entries(p.meta.walls.laidTilesByKind).find(([, v]) => Array.isArray(v) && v.length > 1)[0];
    p.meta.walls.laidTilesByKind[k] = p.meta.walls.laidTilesByKind[k].slice(1);
  }, "laidTilesByKind");
  run("r15/B4-a-lost-tile-that-is-live", anyRoom(
    (p) => Object.entries(p.meta?.walls?.shippedByKind || {}).some(([, v]) => v > 0),
  ), (p) => {
    const k = Object.entries(p.meta.walls.shippedByKind).find(([, v]) => v > 0)[0];
    const live = Object.keys(p.meta.walls.roadKind).find((t) => p.meta.walls.roadKind[t] === k);
    const [x, y] = live.split(",").map(Number);
    p.meta.walls.lostByKind[k] = [...(p.meta.walls.lostByKind[k] || []), { x, y }];
    p.meta.walls.laidByKind[k] += 1;
    p.meta.walls.laidTilesByKind[k] = [...(p.meta.walls.laidTilesByKind[k] || [])];
  }, "lostByKind|laidTilesByKind");
  run("r15/B4-restored-tile-that-is-not-on-the-board", anyRoom(
    (p) => p.meta?.walls?.restoredByKind && Object.values(p.meta.walls.restoredByKind).some((v) => (v || []).length),
  ), (p) => {
    const k = Object.entries(p.meta.walls.restoredByKind).find(([, v]) => (v || []).length)[0];
    p.meta.walls.restoredByKind[k] = [{ x: 1, y: 1 }];
  }, "restoredByKind");
  run("r15/B4-spurTiles-deleted", R, (p) => {
    delete p.meta.walls.spurTiles;
  }, "spurTiles");
  run("r15/B4-spurTilesShipped-deleted", R, (p) => {
    delete p.meta.walls.spurTilesShipped;
  }, "spurTilesShipped");

  // ---- B5: THE ALONG-CUT DISPATCH FIELDS AND SCOPE ------------------------
  const refRoom = anyRoom((p) => (p.meta?.walls?.alongCutRefused || []).length);
  run("r15/B5-refusal-kind-relabelled", anyRoom(
    (p) => (p.meta?.walls?.alongCutRefused || []).some((r) => r.kind === "seat"),
  ), (p) => {
    for (const r of p.meta.walls.alongCutRefused) if (r.kind === "seat") r.kind = "breaks-network";
  }, "`kind`");
  run("r15/B5-network-refusal-relabelled-no-parallel", anyRoom(
    (p) => (p.meta?.walls?.alongCutRefused || []).some((r) => r.kind === "breaks-network"),
  ), (p) => {
    for (const r of p.meta.walls.alongCutRefused) if (r.kind === "breaks-network") r.kind = "no-parallel";
  }, "`kind`|`offered`");
  run("r15/B5-offered-tiles-invented", anyRoom(
    (p) => (p.meta?.walls?.alongCutRefused || []).some((r) => Array.isArray(r.offered) && r.offered.length),
  ), (p) => {
    for (const r of p.meta.walls.alongCutRefused) if (Array.isArray(r.offered) && r.offered.length) r.offered = [{ x: 1, y: 1 }];
  }, "`offered`");
  run("r15/B5-offered-list-dropped-off-a-network-refusal", anyRoom(
    (p) => (p.meta?.walls?.alongCutRefused || []).some((r) => r.kind === "breaks-network" && Array.isArray(r.offered)),
  ), (p) => {
    for (const r of p.meta.walls.alongCutRefused) if (r.kind === "breaks-network") delete r.offered;
  }, "`offered`");
  run("r15/B5-alongCutScope-narrowed-to-the-cut", anyRoom((p) => p.meta?.walls?.alongCutScope), (p) => {
    p.meta.walls.alongCutScope = "cut";
  }, "alongCutScope");
  run("r15/B5-alongCutScope-deleted", anyRoom((p) => p.meta?.walls?.alongCutScope), (p) => {
    delete p.meta.walls.alongCutScope;
  }, "alongCutScope");
  run("r15/B5-conductBridge-relaid-invented", anyRoom((p) => p.meta?.walls?.conductBridge?.added?.length), (p) => {
    p.meta.walls.conductBridge.relaid = [{ x: 1, y: 1, wasLayer: 1 }];
  }, "relaid");
  run("r15/B5-conductBridge-relaid-wasLayer-after-the-bridge", anyRoom(
    (p) => (p.meta?.walls?.conductBridge?.relaid || []).length,
  ), (p) => {
    for (const t of p.meta.walls.conductBridge.relaid) t.wasLayer = 9;
  }, "wasLayer");
  void refRoom;

  // ---- B6: THE PLANNER NOTES ---------------------------------------------
  const noteRoom = (head) => anyRoom((p) => (p.meta?.notes || []).some((n) => typeof n === "string" && n.startsWith(head)));
  const editNote = (head, f) => (p) => {
    p.meta.notes = p.meta.notes.map((n) => (typeof n === "string" && n.startsWith(head) ? f(n, p) : n));
  };
  const dropNote = (head) => (p) => {
    p.meta.notes = p.meta.notes.filter((n) => !(typeof n === "string" && n.startsWith(head)));
  };
  run("r15/B6-every-note-deleted", R, (p) => {
    p.meta.notes = [];
  }, "PLANNER NOTE");
  const NOTE_HEADS = [
    ["NO CUT TILE IS REDUNDANT", "redundant"],
    ["CUT TILES THAT ARE NOT SINGLY LOAD-BEARING", "SINGLY LOAD-BEARING|redundantCut"],
    ["SEALED INTERIOR FLOOR", "SEALED INTERIOR FLOOR"],
    ["ROAD ON RAMPART, CLASSIFIED", "ROAD ON RAMPART"],
    ["ROAD LAID FOR A CONTAINER", "CONTAINER|conductBridge"],
    ["SHALLOW EXTENSIONS", "SHALLOW EXTENSIONS"],
  ];
  for (const [head, expect] of NOTE_HEADS) {
    run(`r15/B6-note-deleted-${head.slice(0, 18).replace(/\W+/g, "-")}`, noteRoom(head), dropNote(head), expect);
  }
  run("r15/B6-redundant-cut-note-contradicts-its-record", noteRoom("NO CUT TILE IS REDUNDANT"),
    editNote("NO CUT TILE IS REDUNDANT", (n) => n.replace(/every one of this room's \d+ cut tile\(s\)/, "every one of this room's 4 cut tile(s)")),
    "NO CUT TILE IS REDUNDANT");
  run("r15/B6-not-singly-note-deflates-the-count", noteRoom("CUT TILES THAT ARE NOT SINGLY LOAD-BEARING"),
    editNote("CUT TILES THAT ARE NOT SINGLY LOAD-BEARING", (n) => n.replace(/^CUT TILES THAT ARE NOT SINGLY LOAD-BEARING: \d+ of/, "CUT TILES THAT ARE NOT SINGLY LOAD-BEARING: 1 of")),
    "SINGLY LOAD-BEARING");
  run("r15/B6-sealed-floor-note-halves-itself", noteRoom("SEALED INTERIOR FLOOR"),
    editNote("SEALED INTERIOR FLOOR", (n) => n.replace(/^SEALED INTERIOR FLOOR: \d+ tile\(s\)/, "SEALED INTERIOR FLOOR: 1 tile(s)")),
    "SEALED INTERIOR FLOOR");
  run("r15/B6-road-rampart-note-moves-the-headline-taxonomy", noteRoom("ROAD ON RAMPART, CLASSIFIED"),
    editNote("ROAD ON RAMPART, CLASSIFIED", (n) => n.replace(/(\d+) CONTROLLER STAND-DENIAL RING tile\(s\)/, "0 CONTROLLER STAND-DENIAL RING tile(s)")),
    "ROAD ON RAMPART");
  run("r15/B6-container-road-note-names-the-wrong-tile", noteRoom("ROAD LAID FOR A CONTAINER"),
    editNote("ROAD LAID FOR A CONTAINER", (n) => n.replace(/plain road tile\(s\) \([^)]*\)/, "plain road tile(s) (1,1)")),
    "CONTAINER");
  run("r15/B6-shallow-note-inflates-the-program", noteRoom("SHALLOW EXTENSIONS"),
    editNote("SHALLOW EXTENSIONS", (n) => n.replace(/^SHALLOW EXTENSIONS: (\d+) of \d+/, "SHALLOW EXTENSIONS: $1 of 99")),
    "SHALLOW EXTENSIONS");
  run("r15/B6-a-priced-refusal-a-reader-is-never-shown", anyRoom(
    (p) => (p.meta?.notes || []).some((n) => typeof n === "string" && n.startsWith("CUT TILES THAT ARE NOT SINGLY")) &&
      Object.keys(p.meta?.shell?.redundantCut?.reasons || {}).length > 1,
  ), editNote("CUT TILES THAT ARE NOT SINGLY LOAD-BEARING", (n, p) => {
    const k = Object.keys(p.meta.shell.redundantCut.reasons)[0];
    return n.split(k).join("99,99");
  }), "never\\s+names it|prices");

  // ---- B7: negotiated.detail — THE PARAGRAPH INSIDE THE RECORD -----------
  const negRoom = withDecl15("mobility", null, (d) => typeof d.negotiated?.detail === "string");
  run("r15/B7-negotiated-detail-rewritten-to-the-opposite-claim", negRoom, planted15("mobility", null, (d) => {
    // THE OWNER'S OWN E11S2 REWRITE, verbatim in shape: the paragraph says the
    // room clears the gate everywhere, four words before the generated sentence
    // that reconciles a 1.56 lap against the shipped wall.
    d.negotiated.detail =
      "defender mobility max 0.42 over pairs that cost more than 4 tiles of detour (target 1.2; the " +
      "ungated maximum over every pair including two-tile ones is 0.42, exact all-pairs over 37 " +
      "reachable wall tiles; stand-to-stand it is 0.9): this room is COMFORTABLY INSIDE the target on " +
      "every pair, the garrison out-walks the attacker everywhere on the wall.";
  }), "negotiated.detail");
  run("r15/B7-negotiated-detail-lap-deflated", negRoom, planted15("mobility", null, (d) => {
    d.negotiated.detail = d.negotiated.detail.replace(/^defender mobility max [\d.]+/, "defender mobility max 0.9");
  }), "negotiated.detail");
  run("r15/B7-negotiated-detail-quotes-an-unsourced-number", negRoom, planted15("mobility", null, (d) => {
    d.negotiated.detail += " Priced against 7 alternative walls.";
  }), "no clause of layer 2's own template accounts for");
  run("r15/B7-negotiated-detail-worst-pair-swapped", negRoom, planted15("mobility", null, (d) => {
    d.negotiated.detail = d.negotiated.detail.replace(/between wall tiles \d+,\d+ and \d+,\d+/, "between wall tiles 3,3 and 44,44");
  }), "negotiated.detail");
  run("r15/B7-negotiated-detail-cause-word-changed", negRoom, planted15("mobility", null, (d) => {
    d.negotiated.detail = d.negotiated.detail.replace(/Cause: [a-z]+/, "Cause: shape");
  }), "negotiated.detail");
  run("r15/B7-negotiated-detail-endpoints-inflated", negRoom, planted15("mobility", null, (d) => {
    d.negotiated.detail = d.negotiated.detail.replace(/over (\d+) reachable wall tiles/, "over 999 reachable wall tiles");
  }), "negotiated.detail");
  run("r15/B7-negotiated-detail-fraction-inverted", negRoom, planted15("mobility", null, (d) => {
    d.negotiated.detail = d.negotiated.detail.replace(/\((\d+)\/(\d+) on the ungated reading/, "($2/$1 on the ungated reading");
  }), "negotiated.detail");
  run("r15/B7-negotiated-detail-closing-pair-detached-from-worstDetour", negRoom, planted15("mobility", null, (d) => {
    d.negotiated.detail = d.negotiated.detail.replace(/(the longest extra walk anywhere on this wall is \d+ tile\(s\) \()\d+,\d+ to \d+,\d+/, "$12,2 to 4,4");
  }), "negotiated.detail");
  run("r15/B7-negotiated-detail-ratio-is-not-the-quotient", negRoom, planted15("mobility", null, (d) => {
    d.negotiated.detail = d.negotiated.detail.replace(/, ratio [\d.]+\)\.?$/, ", ratio 1.01).");
  }), "negotiated.detail");
  run("r15/B7-negotiated-detail-emptied", negRoom, planted15("mobility", null, (d) => {
    d.negotiated.detail = "";
  }), "negotiated.detail|MIN_DETAIL|not a paragraph");

  // ---- B8: ctrlParks composedCaps — CRITICISM 4 THROUGH THE RECORD -------
  const capRoom = withDecl15("ctrlParks", "released", (d) => Array.isArray(d.ctrlParks?.composedCaps));
  run("r15/B8-composedCaps-one-rung-claiming-every-rung", capRoom, planted15("ctrlParks", "released", (d) => {
    d.ctrlParks.composedCaps = [d.ctrlParks.composedFrom];
    d.ctrlParks.composedTo = d.ctrlParks.composedFrom;
  }), "composedCaps|composedTo");
  run("r15/B8-composedCaps-emptied", capRoom, planted15("ctrlParks", "released", (d) => {
    d.ctrlParks.composedCaps = [];
  }), "composedCaps");
  run("r15/B8-composedCaps-nonsense-descent", capRoom, planted15("ctrlParks", "released", (d) => {
    d.ctrlParks.composedCaps = [99, 1, 7, 7, -3];
    d.ctrlParks.composedFrom = 99;
    d.ctrlParks.composedTo = -3;
  }), "composedCaps|composedTo|composedFrom");
  run("r15/B8-composedCaps-skips-a-rung", capRoom, planted15("ctrlParks", "released", (d) => {
    const c = d.ctrlParks.composedCaps;
    if (c.length < 3) throw new Error("needs a trail to skip a rung of");
    d.ctrlParks.composedCaps = [c[0], ...c.slice(2)];
  }), "composedCaps");
  run("r15/B8-winning-cap-was-never-composed", capRoom, planted15("ctrlParks", "released", (d) => {
    d.ctrlParks.winningCap = Math.max(...d.ctrlParks.composedCaps) + 5;
  }), "winningCap|composedCaps");
  run("r15/B8-composedTo-detached-from-the-trail", capRoom, planted15("ctrlParks", "released", (d) => {
    d.ctrlParks.composedTo = d.ctrlParks.composedCaps[0];
  }), "composedTo|composedCaps");

  // ---- B9: labs.refused.network — THE DORMANT CROSS-KIND IDENTITY --------
  run("r15/B9-lab-haul-network-refusals-with-no-twin-record", withDecl15("labs", "lab-haul",
    (d) => typeof d.labs?.refused?.network === "number",
  ), planted15("labs", "lab-haul", (d) => {
    d.labs.refused.network = 4;
  }), "refused.network|dormant|cross-kind");
}


// ===========================================================================
// ROUND 16 — THE MECHANICAL AND OWNER-VOICE REVIEWS' OWN EXPLOITS.
//
// Two reviewers, one CRITICAL, two BLOCKING, and a common shape underneath all
// of them: a rule that is checked WHERE THE DATA HAPPENS TO BE rather than
// where the inventory says it is.
//
//   · C1 — the leaf engine walked the RECORD, not the TABLE, so 347 of 420
//     leaf instances DELETE-escaped and whole sub-records with them
//     (`mobility.negotiated` in 57 rooms, `mobility.lift`, `shallowExt.search`).
//     All five of round 14's planted lies re-landed by deletion, two of them
//     leaving broken reader-facing prose ("? deep tiles", "undefined cut
//     tile(s)") standing.
//   · OF11 — the closure DSL is an INTRA-RECORD shape checker: MIRROR leaves
//     are the same producer's second assignment, arrays are opaque single
//     leaves, every closure is scale- and provenance-blind, and `ranBespoke`
//     stamped BRANCH ENTRY rather than predicate execution.
//   · M2/M4/M5 — three prose channels still hand-written: layer 2's
//     negotiation paragraph (whose residue parser is ASCII-numeral-only), the
//     planner NOTES (no class inventory at all — 200 fabricated "PERFECT ROOM"
//     notes passed) and `satAcrossPrior.basis` (a 40-character length check).
//   · M3 — one-sided witnessed bounds admitted sign-impossible values.
//   · m6/m7/OF1/OF7 — the per-kind books, the sealed interior floor and the
//     dead-end prune counter.
//
// Every case is planted the way its reviewer planted it, and where the defect
// is in a record the paragraph is REGENERATED from the mutated record with the
// shipped renderer — which is the whole point of the owner's three-way
// contrast: a leaf edit WITHOUT prose regen trips the prose-identity gate and
// proves nothing about the leaf.
// ===========================================================================
{
  const planted16 = (gate, kind, edit) => (p) => {
    const d = declOf(p, gate, kind);
    if (!d) throw new Error(`no ${gate}/${kind || ""} declaration`);
    edit(d, p);
    d.detail = renderDecl({ ...d, detail: undefined });
  };
  /** ...and the same edit with the paragraph left alone */
  const raw16 = (gate, kind, edit) => (p) => {
    const d = declOf(p, gate, kind);
    if (!d) throw new Error(`no ${gate}/${kind || ""} declaration`);
    edit(d, p);
  };
  const withDecl16 = (gate, kind, pred) =>
    anyRoom((p) => {
      const d = declOf(p, gate, kind);
      return d ? !pred || pred(d, p) : false;
    });
  const at16 = (o, path) => {
    let cur = o;
    for (const sgg of path.split(".")) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[sgg];
    }
    return cur;
  };
  const delPath16 = (o, path) => {
    const segs = path.split(".");
    let cur = o;
    for (let i = 0; i < segs.length - 1; i++) {
      cur = cur?.[segs[i]];
      if (!cur) throw new Error(`no ${path}`);
    }
    if (!(segs[segs.length - 1] in cur)) throw new Error(`no ${path}`);
    delete cur[segs[segs.length - 1]];
  };
  const setPath16 = (o, path, v) => {
    const segs = path.split(".");
    let cur = o;
    for (let i = 0; i < segs.length - 1; i++) cur = cur[segs[i]];
    cur[segs[segs.length - 1]] = v;
  };

  // ---- C1: LEAF DELETION. The five round-14 lies, re-landed BY DELETION ---
  //
  // Deleting a leaf used to be strictly better than falsifying it: the
  // falsification was compared against a derivation and the deletion was not
  // looked for at all. Two of these leave the prose quoting a number that is
  // no longer there — "? deep tiles inside the widest enclosure it admits",
  // "undefined cut tile(s) — 14,35 — carry a rampart" — and passed.
  const c1 = [
    ["labs-haulDist", "labs", "lab-haul", "labs.haulDist"],
    ["ctrlParks-parks", "ctrlParks", "seats", "ctrlParks.parks"],
    ["battlements-unreachable", "battlements", "unreachable", "battlements.unreachable"],
    ["towers-maxRefill", "towers", "weak-battery", "battery.maxRefill"],
    ["spawnFan-viable", "spawnFan", "sector", "spawnFan.census.viable"],
    ["mobility-metric-maxGated", "mobility", null, "metric.maxGated"],
    ["mobility-negotiated-lap", "mobility", null, "negotiated.lap"],
    ["eco-basin", "eco", null, "eco.basin"],
    ["shell-linkOnCut-negotiatedCutTiles", "shell", null, "linkOnCut.negotiatedCutTiles"],
    ["shallowExt-search-left", "extensions", "shallow", "shallowExt.search.left"],
    ["towers-clump-within", "towers", "clump", "clump.within"],
    ["misc-offNetwork-seats", "misc", "off-network", "offNetwork.seats"],
    ["runtime-compositions", "runtime", "heavy-search", "runtime.compositions"],
    ["ctrlParks-released-winningCap", "ctrlParks", "released", "ctrlParks.winningCap"],
    ["mobility-covered-detour-record", "mobility", "covered-detour", "record.din"],
    ["towers-declaredCutTiles", "towers", "weak-battery", "towers.declaredCutTiles"],
  ];
  for (const [name, gate, kind, path] of c1) {
    run(
      `r16/C1-leaf-deleted-${name}`,
      withDecl16(gate, kind, (d) => at16(d, path) !== undefined),
      raw16(gate, kind, (d) => delPath16(d, path)),
      "DOES NOT CARRY IT|re-derived|the record carries",
    );
  }
  // ...and the WHOLE SUB-RECORDS, which is the shape that took the entire
  // round-15 finding-37 subject off the audit in 57 rooms at once.
  for (const [name, gate, kind, path] of [
    ["mobility-negotiated", "mobility", null, "negotiated"],
    ["mobility-lift", "mobility", null, "lift"],
    ["mobility-ladder", "mobility", null, "ladder"],
    ["mobility-lane", "mobility", null, "lane"],
    ["mobility-repair", "mobility", null, "repair"],
    ["shallowExt-search", "extensions", "shallow", "shallowExt.search"],
    ["towers-refillSearch", "towers", "weak-battery", "towers.refillSearch"],
    ["towers-clump-dispersion-search", "towers", "clump", "dispersion.search"],
    ["spawnFan-census", "spawnFan", "sector", "spawnFan.census"],
    ["lift-perClass-map", "mobility", null, "lift.perClass"],
    ["negotiated-causeWalks", "mobility", null, "negotiated.causeWalks"],
    ["negotiated-metric", "mobility", null, "negotiated.metric"],
  ]) {
    run(
      `r16/C1-subrecord-deleted-${name}`,
      withDecl16(gate, kind, (d) => {
        const v = at16(d, path);
        return v !== undefined && v !== null;
      }),
      raw16(gate, kind, (d) => delPath16(d, path)),
      "DOES NOT CARRY IT|MAP|re-derived|does not carry",
    );
  }
  // ...and the branch discriminators, which is how "arm A excuses arm B and
  // arm B excuses arm A" would let a producer delete BOTH.
  run("r16/C1-ctrlParks-seats-takes-neither-branch",
    withDecl16("ctrlParks", "seats", (d) => d.ctrlParks?.eaten !== undefined),
    raw16("ctrlParks", "seats", (d) => { delete d.ctrlParks.eaten; delete d.ctrlParks.built; delete d.ctrlParks.eaters; }),
    "NONE of the|DOES NOT CARRY IT");
  run("r16/C1-weak-battery-takes-neither-branch",
    withDecl16("towers", "weak-battery", (d) => d.towers !== undefined),
    raw16("towers", "weak-battery", (d) => { delete d.towers; }),
    "NONE of the|DOES NOT CARRY IT");
  run("r17/C1-weak-battery-wall-arm-forged",
    withDecl16("towers", "weak-battery", (d) => d.towers !== undefined),
    raw16("towers", "weak-battery", (d) => { delete d.towers; d.source = "walls"; d.detail = renderDecl({ ...d, detail: undefined }); }),
    "`source` says|NONE of the|DOES NOT CARRY IT");
  run("r16/C1-offNetwork-says-nothing-about-its-extractor",
    withDecl16("misc", "off-network", (d) => d.offNetwork?.extractor !== undefined),
    raw16("misc", "off-network", (d) => { delete d.offNetwork.extractor; }),
    "NONE of the|DOES NOT CARRY IT");
  run("r16/C1-nulling-a-subrecord-the-inventory-does-not-class",
    withDecl16("mobility", null, (d) => !!d.negotiated),
    raw16("mobility", null, (d) => { d.negotiated = null; }),
    "published as null|DOES NOT CARRY IT|does not name it");
  run("r16/C1-lift-perClass-loses-one-row",
    withDecl16("mobility", null, (d) => d.lift?.perClass && Object.keys(d.lift.perClass).length > 1),
    raw16("mobility", null, (d) => { delete d.lift.perClass[Object.keys(d.lift.perClass)[0]]; }),
    "re-derived|keyed");
  run("r16/C1-lift-perClass-gains-an-invented-class",
    withDecl16("mobility", null, (d) => !!d.lift?.perClass),
    raw16("mobility", null, (d) => { d.lift.perClass.rampart = { pairDin: 3 }; }),
    "keyed|invented|does not name it");

  // ---- OF11 (1): MIRRORED PAIRS. Editing in two places is one assignment --
  //
  // "THE STRONGEST BOUND A WITNESSED LEAF CAN HAVE… a producer would have to
  // edit in two places." Both copies are written by the same producer in the
  // same pass. Every case below edits BOTH and is caught by a bound taken off
  // the room's own board instead.
  run("r16/OF11-mirror-pair-repair-baseOver-both-copies",
    withDecl16("mobility", null, (d, p) => typeof d.repair?.tower?.baseOver === "number" && p.meta?.towers?.mobilityVeto),
    planted16("mobility", null, (d, p) => {
      const v = 900000;
      d.repair.tower.baseOver = v;
      d.repair.tower.overWithBattery = v;
      p.meta.towers.mobilityVeto.baseOver = v;
      p.meta.towers.mobilityVeto.overWithBattery = v;
    }),
    "baseOver|overWithBattery|interiorWalkable");
  run("r16/OF11-mirror-pair-dispersion-census-rescaled",
    withDecl16("towers", "clump", (d, p) => d.dispersion?.search && p.meta?.towers?.towerDispersion?.search),
    planted16("towers", "clump", (d, p) => {
      const n2 = 900000;
      d.dispersion.search.singleSwapsTried = n2;
      p.meta.towers.towerDispersion.search.singleSwapsTried = n2;
    }),
    "singleSwapsTried|single-slot swap");
  run("r16/OF11-mirror-pair-towers-candidates-both-copies",
    withDecl16("towers", "weak-battery", (d, p) => typeof d.towers?.candidates === "number" && p.meta?.towers),
    planted16("towers", "weak-battery", (d, p) => {
      d.towers.candidates = 99999;
      p.meta.towers.candidates = 99999;
    }),
    "candidates|interiorTiles");
  run("r16/OF11-mirror-pair-veto-tried-both-copies",
    withDecl16("mobility", null, (d, p) => typeof d.repair?.tower?.tried === "number" && p.meta?.towers?.mobilityVeto),
    planted16("mobility", null, (d, p) => {
      d.repair.tower.tried = 284400;
      d.repair.tower.affordable = 0;
      d.repair.tower.scoreTied = 0;
      p.meta.towers.mobilityVeto.tried = 284400;
      p.meta.towers.mobilityVeto.affordable = 0;
      p.meta.towers.mobilityVeto.scoreTied = 0;
    }),
    "tried|single-slot swap");
  run("r16/OF11-dispersion-clumpAfter-detached-from-the-board",
    withDecl16("towers", "clump", (d) => typeof d.dispersion?.search?.clumpAfter === "number"),
    planted16("towers", "clump", (d, p) => {
      d.dispersion.search.clumpAfter += 3;
      d.dispersion.search.clumpBefore = d.dispersion.search.clumpAfter + 1;
      if (p.meta?.towers?.towerDispersion?.search) {
        p.meta.towers.towerDispersion.search.clumpAfter = d.dispersion.search.clumpAfter;
        p.meta.towers.towerDispersion.search.clumpBefore = d.dispersion.search.clumpBefore;
      }
    }),
    "clumpAfter|re-derived");
  // A4 — a dispersion pass that examined ZERO swaps, printed above the
  // unchanged claim "every legal swap either left the window where it was or
  // cost the wall damage". A census of nothing closes arithmetically.
  run("r16/OF11-A4-dispersion-examined-zero-swaps",
    withDecl16("towers", "clump", (d) => d.dispersion?.search?.rounds > 0),
    planted16("towers", "clump", (d, p) => {
      d.dispersion.search.singleSwapsTried = 0;
      d.dispersion.search.singleSwapsScoreTied = 0;
      d.dispersion.search.pairSwapsTried = 0;
      d.dispersion.search.pairSwapsScoreTied = 0;
      d.dispersion.search.pairImproved = 0;
      const ms = p.meta?.towers?.towerDispersion?.search;
      if (ms) {
        ms.singleSwapsTried = 0;
        ms.singleSwapsScoreTied = 0;
        ms.pairSwapsTried = 0;
        ms.pairSwapsScoreTied = 0;
        ms.pairImproved = 0;
      }
    }),
    "examined 0 single-slot|did not run|rounds");
  run("r16/OF11-tower-window-after-detached-from-the-board",
    withDecl16("towers", "clump", (d) => typeof d.dispersion?.search?.towerWindowAfter === "number"),
    planted16("towers", "clump", (d) => { d.dispersion.search.towerWindowAfter = 1; }),
    "towerWindowAfter|re-derived");
  run("r16/OF11-shallow-census-swapped-to-another-rooms-interior",
    withDecl16("extensions", "shallow", (d) => typeof d.shallowExt?.search?.interiorWalkable === "number"),
    planted16("extensions", "shallow", (d) => { d.shallowExt.search.interiorWalkable += 40; }),
    "interiorWalkable|re-derived");

  // ---- OF11 (2): ARRAY ELEMENTS. `slots[].why` was free text -------------
  //
  // C1b, verified by the reviewer on E12S6 against a clean control: six PRICED
  // legal trades — each a real deep target refused on a defender-lap ceiling —
  // laundered into "6 slots had NO deep target of any kind". Criticism 12 and
  // criticism 1's whole argument, inverted, passing 172/172.
  run("r16/OF11-C1b-priced-trades-laundered-into-impossibility",
    withDecl16("extensions", "shallow", (d) => d.shallowExt?.priced > 0),
    planted16("extensions", "shallow", (d) => {
      const n2 = d.shallowExt.slots.length;
      d.shallowExt.priced = 0;
      d.shallowExt.impossible = n2;
      for (const sl of d.shallowExt.slots) {
        sl.targets = 0;
        sl.targetsFaced = 0;
        sl.targetsOnePave = 0;
        sl.examined = 0;
        sl.bestLegal = null;
        sl.why =
          `this room has NO free deep tile that is road-faced or one pave away — the post-prune scan ` +
          `over all ${d.shallowExt.search.interiorTiles} positions of the ${d.shallowExt.search.bandSide}x` +
          `${d.shallowExt.search.bandSide} buildable band (of which ${d.shallowExt.search.interiorWalkable} ` +
          `are walkable floor inside this room's own wall) returned an empty candidate list in BOTH ` +
          `classes, so there is nowhere for this slot to go`;
      }
    }),
    "targets|sharedTarget|left|competing");
  run("r16/OF11-slot-why-rewritten-as-free-text",
    withDecl16("extensions", "shallow", (d) => (d.shallowExt?.slots || []).length),
    planted16("extensions", "shallow", (d) => {
      d.shallowExt.slots[0].why = "this slot had NO deep target of any kind and nothing could be done about it";
    }),
    "not the sentence this row generates");
  run("r16/OF11-slot-why-numerals-kept-prose-reversed",
    withDecl16("extensions", "shallow", (d) => (d.shallowExt?.slots || []).length),
    planted16("extensions", "shallow", (d) => {
      const sl = d.shallowExt.slots[0];
      sl.why = String(sl.why)
        .replace("there is nowhere for this slot to go", "there was somewhere for this slot to go and it was taken")
        .replace("past this room's ceiling of", "comfortably inside this room's ceiling of");
    }),
    "not the sentence this row generates");
  run("r16/OF11-slot-gains-an-unclassed-field",
    withDecl16("extensions", "shallow", (d) => (d.shallowExt?.slots || []).length),
    planted16("extensions", "shallow", (d) => { d.shallowExt.slots[0].verdict = "PERFECT"; }),
    "element inventory does not name it");
  run("r16/OF11-slot-loses-a-classed-field",
    withDecl16("extensions", "shallow", (d) => (d.shallowExt?.slots || []).length),
    planted16("extensions", "shallow", (d) => { delete d.shallowExt.slots[0].targets; }),
    "does not carry");
  run("r16/OF11-slot-tile-is-not-a-shallow-extension",
    withDecl16("extensions", "shallow", (d) => (d.shallowExt?.slots || []).length),
    planted16("extensions", "shallow", (d) => { d.shallowExt.slots[0].x = 1; d.shallowExt.slots[0].y = 1; }),
    "re-derived");
  run("r16/OF11-slot-depth-detached-from-the-board",
    withDecl16("extensions", "shallow", (d) => (d.shallowExt?.slots || []).length),
    planted16("extensions", "shallow", (d) => { d.shallowExt.slots[0].depth = 9; }),
    "re-derived");
  run("r16/OF11-slot-lapNow-detached-from-the-board",
    withDecl16("extensions", "shallow", (d) => (d.shallowExt?.slots || []).length),
    planted16("extensions", "shallow", (d) => { d.shallowExt.slots[0].lapNow = 0.42; }),
    "re-derived");
  run("r16/OF11-slot-priced-under-a-ceiling-it-passes",
    withDecl16("extensions", "shallow", (d) => (d.shallowExt?.slots || []).some((sl) => sl.bestLegal)),
    planted16("extensions", "shallow", (d) => {
      const sl = d.shallowExt.slots.find((q) => q.bestLegal);
      sl.bestLegal.lap = 0.1;
      sl.why = String(sl.why).replace(/lap to [\d.]+/, "lap to 0.1");
    }),
    "ceiling|the pass TAKES|not the sentence");
  run("r16/OF11-refusal-why-rewritten",
    withDecl16("extensions", "shallow", (d) => (d.shallowExt?.search?.refused || []).length),
    planted16("extensions", "shallow", (d) => { d.shallowExt.search.refused[0].why = "the tile was fine, we simply did not want it"; }),
    "not the sentence this row generates|0 of the 5 sentence classes");
  run("r16/OF11-refusal-names-an-off-grid-tile",
    withDecl16("extensions", "shallow", (d) => (d.shallowExt?.search?.refused || []).length),
    planted16("extensions", "shallow", (d) => { d.shallowExt.search.refused[0].k = "-9,-9"; }),
    "outside the room|tile key");
  // H1 — `ladder.rungs[].mobility` was unchecked by the block whose own `say`
  // text claims it checks "the four fields a rung is made of". 13 rooms.
  run("r16/OF11-H1-ladder-rung-mobility-moved",
    withDecl16("mobility", null, (d) => (d.ladder?.rungs || []).length > 1),
    planted16("mobility", null, (d) => { for (const r2 of d.ladder.rungs) r2.mobility = 99; }),
    "shipped|rung|mobility|lap");
  run("r16/OF11-ladder-rung-index-is-not-its-position",
    withDecl16("mobility", null, (d) => (d.ladder?.rungs || []).length > 1),
    planted16("mobility", null, (d) => { d.ladder.rungs[1].rung = 7; }),
    "re-derived");
  run("r16/OF11-ladder-rung-bonus-off-the-schedule",
    withDecl16("mobility", null, (d) => (d.ladder?.rungs || []).length > 1),
    planted16("mobility", null, (d) => { d.ladder.rungs[1].needDeepBonus = 500; }),
    "re-derived");
  run("r16/OF11-ladder-rung-loses-a-field",
    withDecl16("mobility", null, (d) => (d.ladder?.rungs || []).length),
    planted16("mobility", null, (d) => { delete d.ladder.rungs[0].mobility; }),
    "does not carry|rung is");
  run("r16/OF11-ladder-rung-gains-an-unclassed-field",
    withDecl16("mobility", null, (d) => (d.ladder?.rungs || []).length),
    planted16("mobility", null, (d) => { d.ladder.rungs[0].verdict = "the lap is what it is"; }),
    "element inventory does not name it");
  run("r16/OF11-ladder-fallbackBest-is-not-on-the-trail",
    withDecl16("mobility", null, (d) => Array.isArray(d.ladder?.rungs)),
    planted16("mobility", null, (d) => { d.ladder.fallbackBest = 42; }),
    "fallbackBest|best rung");
  // K4 — the cross-copy compares the two copies to each other, so the room's
  // own corner passed in both.
  run("r16/OF11-K4-sharedTarget-is-the-room-corner",
    withDecl16("extensions", "shallow", (d) => d.shallowExt?.sharedTarget),
    planted16("extensions", "shallow", (d) => { d.shallowExt.sharedTarget = "0,0"; d.shallowExt.search.sharedTarget = "0,0"; }),
    "free deep interior tile|sharedTargetSlots|competing");

  // ---- OF11 (4): `ranBespoke` stamped BRANCH ENTRY -----------------------
  run("r16/OF11-bespoke-stamped-with-no-predicate-composedCaps",
    withDecl16("ctrlParks", "released", (d) => Array.isArray(d.ctrlParks?.composedCaps)),
    raw16("ctrlParks", "released", (d) => { d.ctrlParks.composedCaps = 5; }),
    "not a list of caps|EVALUATED NO PREDICATE");
  run("r16/OF11-bespoke-stamped-with-no-predicate-negotiated-pair",
    withDecl16("mobility", null, (d) => Array.isArray(d.negotiated?.tiles)),
    raw16("mobility", null, (d) => { d.negotiated.tiles = "27,10~36,10"; }),
    "not a list of tiles|EVALUATED NO PREDICATE|entr");

  // ---- M2: the negotiation paragraph, in every alphabet ------------------
  //
  // Seven of nine of these walked past the residue parser, which is
  // ASCII-numeral-only and can only refuse numbers it can SEE. The gate is
  // string equality against the paragraph the leaves generate now.
  const negRoom16 = withDecl16("mobility", null, (d) => typeof d.negotiated?.detail === "string");
  const negProse = (name, edit) =>
    run(`r16/M2-${name}`, negRoom16,
      planted16("mobility", null, (d) => { d.negotiated.detail = edit(d.negotiated.detail); }),
      "not the paragraph its own leaves generate");
  negProse("numeral-free-reversal", () =>
    "defender mobility is COMFORTABLY INSIDE the target on every pair this wall admits; nothing is owed here.");
  negProse("claim-in-number-words", (t) =>
    t.replace(/the defender walks \d+ inside while the attacker walks \d+ outside/,
      "the defender walks nine inside while the attacker walks fourteen outside"));
  negProse("fullwidth-numerals", (t) => t.replace(/ratio [\d.]+\)/, "ratio ０.４２)"));
  negProse("arabic-indic-numerals", (t) => t.replace(/ratio [\d.]+\)/, "ratio ٠.٤٢)"));
  negProse("roman-numerals", (t) => t.replace(/ratio [\d.]+\)/, "ratio I.II)"));
  negProse("numerals-glued-to-a-letter", (t) => `${t} The as-built reading readsx1 and clears.`);
  negProse("leading-dot-numerals", (t) => `${t} The as-built ratio is .42 and the detour is .0 tiles.`);
  negProse("appended-lie-with-no-numerals", (t) => `${t} Nothing is owed on this wall.`);
  negProse("cause-clause-verdict-flipped", (t) =>
    t.replace("which is STILL OVER the 1.2 target", "which is comfortably INSIDE the 1.2 target"));
  negProse("counterfactual-walk-verdict-flipped", (t) =>
    t.replace("so it CLEARS the gate outright", "so it does NOT clear the gate"));

  // ---- M3: sign-impossible values, the reviewer's own batch ---------------
  const signs = [
    ["negotiated-shippedWallLap", "mobility", null, "negotiated.shippedWallLap", -2.5],
    ["repair-mass-liftedLap", "mobility", null, "repair.mass.liftedLap", -2.5],
    ["towers-maxRefillUnblocked", "towers", "weak-battery", "towers.maxRefillUnblocked", -10],
    ["dispersion-withinAtLayer3", "towers", "clump", "dispersion.withinAtLayer3", -6],
    ["negotiated-metric-endpoints", "mobility", null, "negotiated.metric.endpoints", -810],
    ["lane-bounded", "mobility", null, "lane.bounded", -3],
    ["ladder-shippedLap", "mobility", null, "ladder.shippedLap", -1.5],
    ["negotiated-floor", "mobility", null, "negotiated.floor", -1],
    ["towers-minShellDmg", "towers", "weak-battery", "towers.minShellDmg", -600],
    ["lane-stubsLifted", "mobility", null, "lane.stubsLifted", -4],
    ["repair-tower-baseLap", "mobility", null, "repair.tower.baseLap", -1.5],
    ["shallowExt-search-refusedExaminations", "extensions", "shallow", "shallowExt.search.refusedExaminations", -17],
  ];
  for (const [name, gate, kind, path, v] of signs) {
    run(`r16/M3-sign-impossible-${name}`,
      withDecl16(gate, kind, (d) => typeof at16(d, path) === "number"),
      planted16(gate, kind, (d) => setPath16(d, path, v)),
      "non-negative|below|exceeds|re-derived|not the paragraph|not a lap");
  }
  // ...and the two HONEST signed exceptions, which must still be bounded from
  // BOTH sides. A negative `lane.cost` is legitimate; a reservation that frees
  // more ramparts than the room has tiles is not.
  run("r16/M3-honest-signed-exception-lane-cost-out-of-range",
    withDecl16("mobility", null, (d) => typeof d.lane?.cost === "number"),
    planted16("mobility", null, (d) => { d.lane.cost = -99999; }),
    "lane.cost|not null and not a finite number");
  run("r16/M3-honest-signed-exception-lane-gain-out-of-range",
    withDecl16("mobility", null, (d) => typeof d.lane?.gain === "number"),
    planted16("mobility", null, (d) => { d.lane.gain = 4242; }),
    "lane.gain|not null and not a finite number");
  run("r16/M3-honest-signed-exception-causeWalks-detour-out-of-range",
    withDecl16("mobility", null, (d) => typeof d.negotiated?.causeWalks?.noWalls?.detour === "number"),
    planted16("mobility", null, (d) => { d.negotiated.causeWalks.noWalls.detour = -99999; }),
    "detour|not null and not a finite number|not the paragraph");
  run("r16/M3-eco-basin-larger-than-the-room",
    withDecl16("eco", null, (d) => typeof d.eco?.basin === "number"),
    planted16("eco", null, (d) => { d.eco.basin = 99999; }),
    "eco.basin|interiorTiles");
  run("r16/M3-declaredCutTiles-larger-than-the-room",
    withDecl16("towers", "weak-battery", (d) => typeof d.towers?.declaredCutTiles === "number"),
    planted16("towers", "weak-battery", (d) => { d.towers.declaredCutTiles = 830; }),
    "declaredCutTiles|interiorWalkable");
  run("r16/M3-lane-tiles-larger-than-the-interior",
    withDecl16("mobility", null, (d) => typeof d.lane?.tiles === "number"),
    planted16("mobility", null, (d) => { d.lane.tiles = 9999; d.lane.deep = 9999; }),
    "lane.tiles|interiorWalkable");
  run("r16/M3-eco-basin-says-it-is-unbounded-while-coreSize-is-held-to-it",
    withDecl16("eco", null, (d) => typeof d.eco?.basin === "number" && typeof d.eco?.coreSize === "number"),
    planted16("eco", null, (d) => { d.eco.basin = d.eco.coreSize - 1; }),
    "eco.basin|coreSize");

  // ---- M4: the note channel, which had no class inventory at all ---------
  const noteRoom = anyRoom((p) => (p.meta?.notes || []).length && (p.meta?.noteRecords || []).length);
  run("r16/M4-fabricated-note-class", noteRoom, (p) => {
    p.meta.notes.push("PERFECT ROOM: this room is perfect and needs no further review.");
    p.meta.noteRecords.push({ cls: "perfectRoom", rec: {} });
  }, "inventory|not in the inventory|noteObligations");
  run("r16/M4-fabricated-note-with-no-record", noteRoom, (p) => {
    p.meta.notes.push("PERFECT ROOM: this room is perfect and needs no further review.");
  }, "noteRecords|entr");
  run("r16/M4-two-hundred-fabricated-notes", noteRoom, (p) => {
    for (let i = 0; i < 200; i++) {
      p.meta.notes.push(`PERFECT ROOM: pass ${i} found nothing to say.`);
      p.meta.noteRecords.push({ cls: "perfectRoom", rec: { i } });
    }
  }, "inventory|not in the inventory|noteObligations");
  run("r16/M4-appended-lie-on-a-checked-note", noteRoom, (p) => {
    p.meta.notes[0] = `${p.meta.notes[0]} Nothing here costs this room anything.`;
  }, "not the note its own record generates");
  run("r16/M4-note-prose-reversed-numerals-kept", noteRoom, (p) => {
    // the round-16 exploit verbatim: keep every anchored numeral, reverse the
    // sentence around them
    const t0 = String(p.meta.notes[0]);
    const head = t0.slice(0, t0.indexOf(":") + 1);
    const nums = (t0.match(/\d+(?:\.\d+)?/g) || []).join(" ");
    p.meta.notes[0] =
      `${head} this room is in the best shape of any in the fleet on this axis and owes a reader ` +
      `nothing at all. [audit tokens: ${nums}]`;
  }, "not the note its own record generates");
  run("r16/M4-note-deleted", noteRoom, (p) => {
    p.meta.notes.pop();
    p.meta.noteRecords.pop();
  }, "owes a|noteObligations|SEALED|redundant|seals");
  run("r16/M4-shallow-note-deleted-the-ten-that-were-free",
    anyRoom((p) => (p.meta?.noteRecords || []).some((r2) => r2.cls === "shallowExt")),
    (p) => {
      const i = p.meta.noteRecords.findIndex((r2) => r2.cls === "shallowExt");
      p.meta.noteRecords.splice(i, 1);
      p.meta.notes.splice(i, 1);
    },
    "owes a|shallowExt");
  run("r16/M4-note-record-swapped-for-another-class", noteRoom, (p) => {
    p.meta.noteRecords[0].cls = "pavingGap";
  }, "cannot be rendered|not the note|noteObligations");
  run("r16/M4-note-record-field-moved-under-a-regenerated-note",
    anyRoom((p) => (p.meta?.noteRecords || []).some((r2) => r2.cls === "sealedFloor")),
    (p) => {
      const i = p.meta.noteRecords.findIndex((r2) => r2.cls === "sealedFloor");
      p.meta.noteRecords[i].rec = { ...p.meta.noteRecords[i].rec, deep: 0 };
      p.meta.notes[i] = renderNote(p.meta.noteRecords[i]);
    },
    "re-derived|deep");
  run("r16/M4-note-obligation-quotes-a-value-the-record-does-not-have",
    anyRoom((p) => (p.meta?.noteObligations || []).some((o) => (o.why || []).length)),
    (p) => { p.meta.noteObligations[0].why[0].value = 424242; },
    "fires the|does not have");
  run("r16/M4-note-obligations-emptied",
    anyRoom((p) => (p.meta?.noteObligations || []).length),
    (p) => { p.meta.noteObligations = []; },
    "does not say it owes");
  run("r16/M4-note-obligations-deleted",
    anyRoom((p) => (p.meta?.noteObligations || []).length),
    (p) => { delete p.meta.noteObligations; },
    "noteObligations");
  run("r16/M4-both-note-arrays-deleted",
    anyRoom((p) => (p.meta?.notes || []).length),
    (p) => { delete p.meta.notes; delete p.meta.noteRecords; },
    "owes a|noteObligations|SEALED|redundant|seals");
  run("r16/M4-notes-and-records-drift-in-length", noteRoom, (p) => {
    p.meta.noteRecords.push({ ...p.meta.noteRecords[0] });
  }, "entr|records");
  run("r16/M4-two-notes-of-one-class", noteRoom, (p) => {
    p.meta.noteRecords.push({ ...p.meta.noteRecords[0] });
    p.meta.notes.push(p.meta.notes[0]);
  }, "publishes 2|entr|notes");

  // ---- M5: satAcrossPrior.basis was a 40-character length check -----------
  const sapRoom = anyRoom((p) => typeof p.meta?.towers?.adjacency?.satAcrossPrior?.basis === "string");
  run("r16/M5-basis-asserts-the-opposite-board", sapRoom, (p) => {
    p.meta.towers.adjacency.satAcrossPrior.basis =
      "held/offerOnShipped/reachable/forgone are stated on LAYER 3's board (meta.towers.minShellDmg) and " +
      "atLayer3 is the SHIPPED re-read, which is the opposite of what every other room in this fleet " +
      "publishes, and this sentence is two hundred characters long so that it clears the length gate.";
  }, "not the sentence this record generates");
  run("r16/M5-basis-emptied", sapRoom, (p) => {
    p.meta.towers.adjacency.satAcrossPrior.basis = "";
  }, "basis");
  run("r16/M5-basis-drops-its-closing-clause", sapRoom, (p) => {
    const sap = p.meta.towers.adjacency.satAcrossPrior;
    sap.basis = String(sap.basis).slice(0, Math.max(60, sap.basis.length - 120));
  }, "not the sentence this record generates|basis");

  // ---- m6: the per-kind books, at TILE level ------------------------------
  const bookRoom = anyRoom((p) => {
    const w2 = p.meta?.walls;
    return w2 && w2.laidTilesByKind && Object.values(w2.laidTilesByKind).some((a) => Array.isArray(a) && a.length);
  });
  const someKind = (p) => Object.keys(p.meta.walls.laidTilesByKind).find((k2) => (p.meta.walls.laidTilesByKind[k2] || []).length);
  run("r16/m6-laid-tile-off-the-grid", bookRoom, (p) => {
    const k2 = someKind(p);
    p.meta.walls.laidTilesByKind[k2].push({ x: -9, y: -9 });
    p.meta.walls.laidByKind[k2] += 1;
    p.meta.walls.lostByKind[k2] = [...(p.meta.walls.lostByKind[k2] || []), { x: -9, y: -9 }];
  }, "not a tile of this room|natural WALL");
  run("r16/m6-lost-tile-is-a-shipped-road", bookRoom, (p) => {
    const k2 = someKind(p);
    const live = p.meta.walls.laidTilesByKind[k2].find((t) => (p.structures.road || []).some((r2) => r2.x === t.x && r2.y === t.y));
    if (!live) throw new Error("no live tile of this kind");
    p.meta.walls.lostByKind[k2] = [...(p.meta.walls.lostByKind[k2] || []), { x: live.x, y: live.y }];
    p.meta.walls.shippedByKind[k2] -= 1;
  }, "lost|Lost|ships a road there|was not taken");
  run("r16/m6-shipped-road-reattributed-between-passes", bookRoom, (p) => {
    const w2 = p.meta.walls;
    const kinds = Object.keys(w2.laidTilesByKind);
    const from = kinds.find((k2) => (w2.shippedByKind[k2] || 0) > 0);
    const to = kinds.find((k2) => k2 !== from);
    if (!from || !to) throw new Error("needs two kinds");
    const tk = Object.keys(w2.roadKind).find((t) => w2.roadKind[t] === from);
    w2.roadKind[tk] = to;
    w2.shippedByKind[from] -= 1;
    w2.shippedByKind[to] = (w2.shippedByKind[to] || 0) + 1;
    const [tx, ty] = tk.split(",").map(Number);
    w2.laidTilesByKind[to] = [...(w2.laidTilesByKind[to] || []), { x: tx, y: ty }];
    w2.laidByKind[to] = (w2.laidByKind[to] || 0) + 1;
    w2.laidTilesByKind[from] = w2.laidTilesByKind[from].filter((t) => `${t.x},${t.y}` !== tk);
    w2.laidByKind[from] -= 1;
  }, "laid MINUS|late-road books|provenance");
  run("r16/m6-restored-tile-claims-a-layer-7-road",
    anyRoom((p) => {
      const w2 = p.meta?.walls;
      if (!w2 || !w2.laidTilesByKind || !w2.roadKind) return false;
      return Object.keys(w2.roadKind).length > 0;
    }),
    (p) => {
      const w2 = p.meta.walls;
      const k2 = Object.keys(w2.laidTilesByKind)[0];
      // a tile layer 7 itself laid: "restored" means an EARLIER layer laid it,
      // the prune took it and this pass un-deleted it
      const tk = Object.keys(w2.roadKind).find((t) => w2.roadKind[t] !== k2) || Object.keys(w2.roadKind)[0];
      const [tx, ty] = tk.split(",").map(Number);
      w2.restoredByKind = { ...(w2.restoredByKind || {}), [k2]: [{ x: tx, y: ty }] };
    },
    "restoredByKind|never there to restore|is this pass");
  run("r16/m6-restored-tile-is-not-a-road-at-all", bookRoom, (p) => {
    const w2 = p.meta.walls;
    const k2 = Object.keys(w2.laidTilesByKind)[0];
    w2.restoredByKind = { ...(w2.restoredByKind || {}), [k2]: [{ x: 0, y: 0 }] };
  }, "restoredByKind|ships no road");
  run("r16/m6-fabricated-reflow-pass",
    anyRoom((p) => p.meta?.walls?.laidByKind && "reflow" in p.meta.walls.laidByKind),
    (p) => {
      const w2 = p.meta.walls;
      const fake = [];
      for (let i = 0; i < 40; i++) fake.push({ x: 5 + (i % 8), y: 40 + Math.floor(i / 8) });
      w2.laidByKind.reflow = (w2.laidByKind.reflow || 0) + 40;
      w2.laidTilesByKind.reflow = [...(w2.laidTilesByKind.reflow || []), ...fake];
      w2.lostByKind.reflow = [...(w2.lostByKind.reflow || []), ...fake];
    },
    "natural WALL|not a tile of this room|laid MINUS|Lost IS laid|ships a road");

  // ---- m7 / OF1: the sealed interior floor, nine live escapes -------------
  const sealRoom = anyRoom((p) => p.meta?.sealedFloor && p.meta.sealedFloor.tiles > 0);
  const reNote = (p) => {
    const i = (p.meta.noteRecords || []).findIndex((r2) => r2.cls === "sealedFloor");
    if (i >= 0) {
      p.meta.noteRecords[i].rec = p.meta.sealedFloor;
      p.meta.notes[i] = renderNote(p.meta.noteRecords[i]);
    }
  };
  run("r16/OF1-sealedFloor-deleted", sealRoom, (p) => { delete p.meta.sealedFloor; },
    "seals|ABSENT|owes");
  run("r16/OF1-sealedFloor-and-its-note-deleted", sealRoom, (p) => {
    delete p.meta.sealedFloor;
    const i = (p.meta.noteRecords || []).findIndex((r2) => r2.cls === "sealedFloor");
    if (i >= 0) { p.meta.noteRecords.splice(i, 1); p.meta.notes.splice(i, 1); }
  }, "seals|ABSENT|owes");
  run("r16/OF1-sealedFloor-tiles-as-a-string", sealRoom, (p) => {
    p.meta.sealedFloor.tiles = String(p.meta.sealedFloor.tiles);
  }, "wrong shape|re-derived");
  run("r16/OF1-sealedFloor-coordinated-deflate", sealRoom, (p) => {
    const sf2 = p.meta.sealedFloor;
    sf2.tiles = 1;
    sf2.deep = 0;
    sf2.ourFault = 0;
    sf2.named = sf2.named.slice(0, 1);
    reNote(p);
  }, "re-derived");
  run("r16/OF1-sealedFloor-deep-zeroed", sealRoom, (p) => {
    p.meta.sealedFloor.deep = 0;
    reNote(p);
  }, "re-derived");
  run("r16/OF1-sealedFloor-ourFault-zeroed", sealRoom, (p) => {
    p.meta.sealedFloor.ourFault = 0;
    reNote(p);
  }, "re-derived");
  run("r16/OF1-sealedFloor-coordinated-inflate-with-invented-tiles", sealRoom, (p) => {
    const sf2 = p.meta.sealedFloor;
    sf2.tiles += 8;
    sf2.deep += 8;
    for (let i = 0; i < 8; i++) sf2.named.push({ x: 23 + (i % 4), y: 17 + Math.floor(i / 4) });
    reNote(p);
  }, "re-derived|named");
  run("r16/OF1-sealedFloor-named-list-emptied", sealRoom, (p) => {
    p.meta.sealedFloor.named = [];
    reNote(p);
  }, "named|re-derived");
  run("r16/OF1-sealedFloor-basis-names-the-wrong-flood", sealRoom, (p) => {
    p.meta.sealedFloor.basis = "unreachable under the DEFENDED-region flood, which never steps outside the wall.";
    reNote(p);
  }, "basis|flood");
  run("r16/OF1-sealedFloor-depthSafe-moved", sealRoom, (p) => {
    p.meta.sealedFloor.depthSafe = 2;
    reNote(p);
  }, "re-derived|depthSafe");
  run("r16/OF1-sealedFloor-published-where-the-board-seals-nothing",
    anyRoom((p) => !p.meta?.sealedFloor),
    (p) => {
      p.meta.sealedFloor = {
        tiles: 4, deep: 4, ourFault: 4, shallowStructs: 0, depthSafe: 4,
        named: [{ x: 23, y: 17 }, { x: 24, y: 17 }, { x: 23, y: 18 }, { x: 24, y: 18 }],
        basis: "unreachable under the OWN-CREEP flood over the whole board from the sitter (ownCreepWalk).",
      };
    },
    "seals NO floor|re-derived");
  run("r16/OF1-inertPruned-deleted",
    anyRoom((p) => typeof p.meta?.walls?.inertPruned === "number"),
    (p) => { delete p.meta.walls.inertPruned; },
    "inertPruned");

  // ---- OF7: the dead-end prune counter -----------------------------------
  const pruneRoom = anyRoom((p) => typeof p.meta?.walls?.pruned === "number" && (p.meta.walls.prunedTiles || []).length);
  run("r16/OF7-pruned-counts-a-tile-that-ships-a-road", pruneRoom, (p) => {
    const r2 = (p.structures.road || [])[0];
    p.meta.walls.prunedTiles = [...p.meta.walls.prunedTiles, { x: r2.x, y: r2.y }];
    p.meta.walls.prunedAtPassTiles = [...p.meta.walls.prunedAtPassTiles, { x: r2.x, y: r2.y }];
    p.meta.walls.pruned += 1;
    p.meta.walls.prunedAtPass += 1;
    p.meta.walls.prunedTransient += 1;
  }, "SHIPS A ROAD ON|dead-end prune");
  run("r16/OF7-event-count-published-as-the-tile-count",
    anyRoom((p) => p.meta?.walls?.prunedAtPass > p.meta?.walls?.pruned),
    (p) => { p.meta.walls.pruned = p.meta.walls.prunedAtPass; },
    "dead-end prune");
  run("r16/OF7-ghost-transient-split-does-not-close", pruneRoom, (p) => {
    p.meta.walls.prunedGhosts += 3;
  }, "dead-end prune|ghost");
  run("r16/OF7-relaid-tile-is-not-on-the-board",
    anyRoom((p) => (p.meta?.walls?.prunedRelaid || []).length),
    (p) => { p.meta.walls.prunedRelaid = [{ x: 0, y: 0 }]; },
    "dead-end prune|prunedRelaid");
  run("r16/OF7-prune-tile-list-deleted", pruneRoom, (p) => { delete p.meta.walls.prunedTiles; },
    "dead-end prune|prunedTiles");
  run("r16/OF7-ghost-count-detached-from-roadLayer",
    anyRoom((p) => (p.meta?.walls?.prunedTransient || 0) > 0),
    (p) => {
      p.meta.walls.prunedGhosts = p.meta.walls.pruned;
      p.meta.walls.prunedTransient = 0;
    },
    "dead-end prune|roadLayer|ghost");

  // ---- OF3 / OF4: the across-prior take ----------------------------------
  const takeRoom = anyRoom((p) => p.meta?.towers?.acrossPriorTake?.taken);
  run("r16/OF4-take-claims-a-destination-with-no-tower", takeRoom, (p) => {
    p.meta.towers.acrossPriorTake.taken.to = { x: 1, y: 1 };
  }, "no tower there|adjacency|crossings");
  run("r16/OF4-take-panel-does-not-end-where-the-board-ends", takeRoom, (p) => {
    p.meta.towers.acrossPriorTake.after.face += 300;
  }, "after.face|minShellDmg");
  run("r16/OF4-take-deleted-leaving-the-adjacency-unexplained",
    anyRoom((p) => {
      if (!p.meta?.towers?.acrossPriorTake?.taken) return false;
      const tw = p.structures?.tower || [];
      return tw.some((a, i) => tw.some((b, j) => j > i && Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1));
    }),
    (p) => { delete p.meta.towers.acrossPriorTake; },
    "crossings|adjacency|abandoned|atLayer3");
  run("r16/OF3-seat-occupancy-dropped",
    anyRoom((p) => p.meta?.towers?.adjacency?.satAcrossPrior?.seatOccupancy),
    (p) => { delete p.meta.towers.adjacency.satAcrossPrior.seatOccupancy; },
    "basis|not the sentence this record generates");
}

// ===========================================================================
// ROUND 17 — the six mechanical findings, the owner's blocking one, and the
// two re-composing passes the producer added this round.
//
// Every case below is a roster a reviewer LANDED on the round-17 artifact, not
// a hypothetical: F3's 436 falsify-and-delete-the-referent escapes and its 451
// coordinated-write escapes, F2's 10-of-15 forged wall arm, F4's nine occupied
// seats declaring themselves free, F1's 14 free note deletions, F5's whole
// prune census deflating to zero, F6's 2304-band ceilings, and O1's seven
// unbound note lists.
// ===========================================================================
{
  const decl17 = (gate, kind, edit) => (p) => {
    const d = declOf(p, gate, kind);
    if (!d) throw new Error(`no ${gate}/${kind || ""} declaration`);
    edit(d, p);
    d.detail = renderDecl({ ...d, detail: undefined });
  };
  const raw17 = (gate, kind, edit) => (p) => {
    const d = declOf(p, gate, kind);
    if (!d) throw new Error(`no ${gate}/${kind || ""} declaration`);
    edit(d, p);
  };
  const withDecl17 = (gate, kind, pred) =>
    anyRoom((p) => {
      const d = declOf(p, gate, kind);
      return d ? !pred || pred(d, p) : false;
    });
  const regenNotes = (p) => {
    for (let i = 0; i < (p.meta.noteRecords || []).length; i++) {
      try {
        p.meta.notes[i] = renderNote(p.meta.noteRecords[i]);
      } catch {
        /* a record the template throws on is its own failure */
      }
    }
  };
  const noteRoom17 = (cls, pred) =>
    anyRoom((p) => (p.meta?.noteRecords || []).some((r2) => r2.cls === cls && (!pred || pred(r2.rec, p))));
  const noteRec = (p, cls) => (p.meta.noteRecords || []).find((r2) => r2.cls === cls).rec;
  const noteIdx = (p, cls) => (p.meta.noteRecords || []).findIndex((r2) => r2.cls === cls);

  // ---- F3: the closure that passed when its referent was missing ---------
  run("r17/F3-refill-census-falsified-and-its-mirror-deleted",
    withDecl17("towers", "weak-battery", (d) => typeof d.towers?.refillSearch?.tried === "number"),
    decl17("towers", "weak-battery", (d, p) => {
      d.towers.refillSearch.tried = 533;
      delete p.meta.towers.refillSearch.tried;
    }),
    "referent|ABSENT|SCHEMA|census-anchor");
  run("r17/F3-clump-search-falsified-and-its-mirror-deleted",
    withDecl17("towers", "clump", (d) => typeof d.dispersion?.search?.singleSwapsTried === "number"),
    decl17("towers", "clump", (d, p) => {
      d.dispersion.search.singleSwapsTried = 3;
      delete p.meta.towers.towerDispersion.search.singleSwapsTried;
    }),
    "referent|ABSENT|SCHEMA|census-anchor");
  run("r17/F3-mirror-deleted-on-its-own",
    anyRoom((p) => typeof p.meta?.towers?.refillSearch?.tried === "number"),
    (p) => { delete p.meta.towers.refillSearch.tried; },
    "SCHEMA|referent|census-anchor");
  run("r17/F3-eco-mirror-deleted",
    anyRoom((p) => typeof p.meta?.seedPool === "number"),
    (p) => { delete p.meta.seedPool; },
    "SCHEMA|seed-pool|referent");
  run("r17/F3-veto-mirror-deleted",
    anyRoom((p) => typeof p.meta?.towers?.mobilityVeto?.tried === "number"),
    (p) => { delete p.meta.towers.mobilityVeto.tried; },
    "SCHEMA|referent");
  run("r17/F3-search-census-published-while-the-search-is-denied",
    anyRoom((p) => p.meta?.towers?.search?.ran === true),
    (p) => { p.meta.towers.search.ran = false; },
    "SCHEMA|PUBLISHED|referent|search.ran|did not run");
  run("r17/F3-a-nulled-lap-that-is-not-a-measured-null",
    withDecl17("mobility", null, (d) => d.repair?.mass && d.repair.mass.lapBefore !== null),
    decl17("mobility", null, (d) => { d.repair.mass.lapBefore = null; }),
    "null while|mass.builtLap|is null");
  run("r17/F3-a-lap-published-where-the-record-says-there-is-none",
    withDecl17("mobility", null, (d) => d.repair?.mass && d.repair.mass.lapAfter === null),
    decl17("mobility", null, (d) => { d.repair.mass.lapAfter = 1; }),
    "TRUE|moved|referent|lapAfter");
  // ...and the coordinated write, which is what a real producer bug does
  run("r17/F3-coordinated-refill-census-in-both-copies",
    withDecl17("towers", "weak-battery", (d) => typeof d.towers?.refillSearch?.tried === "number"),
    decl17("towers", "weak-battery", (d, p) => {
      d.towers.refillSearch.tried = 533;
      p.meta.towers.refillSearch.tried = 533;
    }),
    "census-anchor|exhaustive loop|exactly");
  run("r17/F3-coordinated-clump-search-in-both-copies",
    withDecl17("towers", "clump", (d) => typeof d.dispersion?.search?.singleSwapsTried === "number"),
    decl17("towers", "clump", (d, p) => {
      d.dispersion.search.singleSwapsTried = 3;
      p.meta.towers.towerDispersion.search.singleSwapsTried = 3;
    }),
    "census-anchor|dispersion pass|lies in");
  run("r17/F3-coordinated-candidate-list-shrunk-to-fit",
    anyRoom((p) => typeof p.meta?.towers?.candidates === "number"),
    (p) => {
      const T2 = (p.structures.tower || []).length;
      p.meta.towers.candidates = 12;
      p.meta.towers.refillSearch.tried = p.meta.towers.refillSearch.rounds * T2 * (12 - T2);
    },
    "census-anchor|deep tower seat|block");
  run("r17/F3-candidates-over-the-thinning-cap",
    anyRoom((p) => typeof p.meta?.towers?.candidates === "number"),
    (p) => { p.meta.towers.candidates = 900; },
    "census-anchor|thinning cap|walkable interior");
  run("r17/F3-veto-examined-swaps-in-zero-rounds",
    anyRoom((p) => p.meta?.towers?.mobilityVeto && p.meta.towers.mobilityVeto.rounds === 0),
    (p) => { p.meta.towers.mobilityVeto.tried = 40; },
    "census-anchor|positive together|referent");
  run("r17/F3-spread-radius-moved",
    anyRoom((p) => typeof p.meta?.towers?.spreadRadius === "number"),
    (p) => { p.meta.towers.spreadRadius = 2; },
    "spread-radius|centroid|re-derived");
  run("r17/F3-seed-pool-deflated-in-both-copies",
    withDecl17("eco", null, (d) => typeof d.eco?.seedPool === "number"),
    decl17("eco", null, (d, p) => {
      d.eco.seedPool = 8;
      p.meta.seedPool = 8;
    }),
    "seed-pool|confluence|terrain admits");
  run("r17/F3-core-size-deflated-in-both-copies",
    withDecl17("eco", null, (d) => d.eco?.coreSize === 30),
    decl17("eco", null, (d, p) => {
      d.eco.coreSize = 9;
      p.meta.coreSize = 9;
    }),
    "CORE_SIZE|basin|short of");
  run("r17/F3-escalation-breadth-invented",
    withDecl17("towers", "weak-battery", (d) => typeof d.towers?.search?.pairK === "number"),
    decl17("towers", "weak-battery", (d, p) => {
      d.towers.search.pairK = 40;
      p.meta.towers.search.pairK = 40;
    }),
    "ESC_PAIR_K|constant");
  run("r17/F3-weak-tiles-charged-against-a-strong-wall",
    withDecl17("towers", "weak-battery", (d) => d.towers?.weakTiles === 0 && d.towers?.minShellDmg >= 1200),
    decl17("towers", "weak-battery", (d, p) => {
      d.towers.weakTiles = 7;
      p.meta.towers.weakTiles = 7;
    }),
    "TOWER_TARGET_MIN|weakest face|positive exactly");

  // ---- F2: the forged wall arm ------------------------------------------
  run("r17/F2-placement-refill-clamped-under-the-note",
    anyRoom((p) => Array.isArray(p.meta?.towers?.refillDistsAtPlacement)),
    (p) => {
      p.meta.towers.refillDistsAtPlacement = p.meta.towers.refillDistsAtPlacement.map(() => 3);
      p.meta.towers.maxRefillAtPlacement = 3;
    },
    "placement-refill|re-walked|furthest of those walks");
  run("r17/F2-the-whole-forged-wall-arm",
    withDecl17("towers", "weak-battery", (d) => d.source === "towers" && d.battery && d.towers),
    decl17("towers", "weak-battery", (d, p) => {
      d.source = "walls";
      d.battery.maxRefillAtPlacement = 3;
      d.battery.refillDistsAtPlacement = d.battery.refillDistsAtPlacement.map(() => 3);
      p.meta.towers.maxRefillAtPlacement = 3;
      p.meta.towers.refillDistsAtPlacement = p.meta.towers.refillDistsAtPlacement.map(() => 3);
      delete d.towers;
    }),
    "placement-refill|re-derived|source");

  // ---- F4: the seat that stands empty because it says so -----------------
  const satRoom17 = (pred) =>
    anyRoom((p) => {
      const sp = p.meta?.towers?.adjacency?.satAcrossPrior;
      return sp && sp.seat && (!pred || pred(sp, p));
    });
  run("r17/F4-occupied-seat-declares-itself-free",
    satRoom17((sp) => sp.seatOccupancy && sp.seatOccupancy.free === false),
    (p) => {
      const sp = p.meta.towers.adjacency.satAcrossPrior;
      sp.seatOccupancy.free = true;
      sp.seatOccupancy.on = [];
      sp.forgoneToPrior = sp.forgoneToOccupant;
      sp.forgoneToOccupant = 0;
      sp.basis = renderSatBasis(sp);
    },
    "seatOccupancy|carries|charges");
  run("r17/F4-free-seat-invents-an-occupant",
    satRoom17((sp) => sp.seatOccupancy && sp.seatOccupancy.free === true),
    (p) => {
      const sp = p.meta.towers.adjacency.satAcrossPrior;
      sp.seatOccupancy.free = false;
      sp.seatOccupancy.on = ["nuker"];
      sp.forgoneToOccupant = sp.forgoneToPrior;
      sp.forgoneToPrior = 0;
      sp.basis = renderSatBasis(sp);
    },
    "seatOccupancy|carries nothing|stands EMPTY");
  run("r17/F4-forgone-charged-to-the-prior-instead-of-the-occupant",
    satRoom17((sp) => sp.forgoneToOccupant > 0),
    (p) => {
      const sp = p.meta.towers.adjacency.satAcrossPrior;
      sp.forgoneToPrior = sp.forgoneToOccupant;
      sp.forgoneToOccupant = 0;
      sp.basis = renderSatBasis(sp);
    },
    "charges|OCCUPANT|forgone");
  run("r17/F4-occupancy-inventory-thinned",
    satRoom17((sp) => sp.seatOccupancy),
    (p) => { p.meta.towers.adjacency.satAcrossPrior.seatOccupancy.counted = ["spawn", "tower"]; },
    "counted|omits|inventory");

  // ---- F5: the prune census that deflated to zero ------------------------
  const pruneRoom17 = anyRoom((p) => (p.meta?.walls?.prunedTiles || []).length > 3);
  run("r17/F5-prune-census-deflated-to-zero", pruneRoom17, (p) => {
    const w = p.meta.walls;
    w.pruned = 0;
    w.prunedGhosts = 0;
    w.prunedTransient = 0;
    w.prunedTiles = [];
    w.prunedAtPass = (w.prunedRelaid || []).length;
    w.prunedAtPassTiles = (w.prunedRelaid || []).slice();
  }, "ghost census|roadLayer|does not name");
  run("r17/F5-prune-census-halved", pruneRoom17, (p) => {
    const w = p.meta.walls;
    const keep = w.prunedTiles.slice(0, Math.floor(w.prunedTiles.length / 2));
    w.prunedTiles = keep;
    w.pruned = keep.length;
    w.prunedGhosts = Math.min(w.prunedGhosts, keep.length);
    w.prunedTransient = keep.length - w.prunedGhosts;
    w.prunedAtPass = w.pruned + (w.prunedRelaid || []).length;
    w.prunedAtPassTiles = [...keep, ...(w.prunedRelaid || [])];
  }, "ghost census|roadLayer|does not name");
  run("r17/F5-one-ghost-tile-dropped",
    anyRoom((p) => (p.meta?.walls?.prunedGhosts || 0) > 1),
    (p) => {
      const w = p.meta.walls;
      const rl = p.meta.roadLayer || {};
      const rs = new Set((p.structures.road || []).map((r2) => `${r2.x},${r2.y}`));
      const i = w.prunedTiles.findIndex((t) => Number.isInteger(rl[`${t.x},${t.y}`]) && !rs.has(`${t.x},${t.y}`));
      w.prunedTiles.splice(i, 1);
      w.pruned--;
      w.prunedGhosts--;
      w.prunedAtPass--;
    },
    "ghost census|does not name");

  // ---- F6: the ceiling that was the band, not the room -------------------
  run("r17/F6-free-deep-scan-accepts-the-whole-2304-band",
    withDecl17("extensions", "shallow", (d) => typeof d.shallowExt?.search?.freeDeepOnePave === "number"),
    decl17("extensions", "shallow", (d) => { d.shallowExt.search.freeDeepOnePave = 2303; }),
    "interiorWalkable|freeDeepInterior|exceeds");
  run("r17/F6-lane-census-inflated-fivefold",
    withDecl17("mobility", null, (d) => typeof d.lane?.tiles === "number"),
    decl17("mobility", null, (d) => { d.lane.tiles = d.lane.tiles * 5 + 5; }),
    "lanes.tiles|same number");
  run("r17/F6-lane-bound-inflated-fivefold",
    withDecl17("mobility", null, (d) => typeof d.lane?.bounded === "number"),
    decl17("mobility", null, (d) => { d.lane.bounded = d.lane.bounded * 5 + 5; }),
    "lanes.bounded|same number");
  run("r17/F6-layer-3-cut-inflated-fivefold",
    withDecl17("towers", "weak-battery", (d) => typeof d.towers?.declaredCutTiles === "number"),
    decl17("towers", "weak-battery", (d) => { d.towers.declaredCutTiles *= 5; }),
    "shipped cut|1.13x|twice");
  run("r17/F6-layer-2-cut-inflated-fivefold",
    withDecl17("shell", null, (d) => typeof d.linkOnCut?.negotiatedCutTiles === "number"),
    decl17("shell", null, (d) => { d.linkOnCut.negotiatedCutTiles *= 5; }),
    "shipped cut|0.96x|twice");
  run("r17/F6-pave-budget-left-invented",
    withDecl17("extensions", "shallow", (d) => typeof d.shallowExt?.search?.paveLeft === "number"),
    decl17("extensions", "shallow", (d) => { d.shallowExt.search.paveLeft = 40; }),
    "one-pave class|counted once|exceed");

  // ---- F1: the note that was owed by nothing -----------------------------
  run("r17/F1-shallow-note-record-and-obligation-deleted-together",
    noteRoom17("shallowExt"),
    (p) => {
      const i = noteIdx(p, "shallowExt");
      p.meta.notes.splice(i, 1);
      p.meta.noteRecords.splice(i, 1);
      p.meta.noteObligations = p.meta.noteObligations.filter((o) => o.cls !== "shallowExt");
    },
    "OWES|re-derived here|shallowExt");
  run("r17/F1-sealed-note-record-and-obligation-deleted-together",
    noteRoom17("sealedFloor"),
    (p) => {
      const i = noteIdx(p, "sealedFloor");
      p.meta.notes.splice(i, 1);
      p.meta.noteRecords.splice(i, 1);
      p.meta.noteObligations = p.meta.noteObligations.filter((o) => o.cls !== "sealedFloor");
    },
    "OWES|re-derived here|sealedFloor|seals");
  run("r17/F1-the-trigger-deleted-too",
    noteRoom17("shallowExt"),
    (p) => {
      const i = noteIdx(p, "shallowExt");
      p.meta.notes.splice(i, 1);
      p.meta.noteRecords.splice(i, 1);
      p.meta.noteObligations = p.meta.noteObligations.filter((o) => o.cls !== "shallowExt");
      delete p.meta.extensions;
    },
    "SCHEMA|meta.extensions|OWES");
  run("r17/F1-an-obligation-nothing-triggers",
    anyRoom((p) => Array.isArray(p.meta?.noteObligations) && !p.meta.noteObligations.some((o) => o.cls === "pavingGap")),
    (p) => { p.meta.noteObligations.push({ cls: "pavingGap", why: [{ field: "meta.walls.conductBridge.stranded", value: 3 }] }); },
    "owes|does not|derived");

  // ---- O1: the note record's lists, bound to nothing ---------------------
  run("r17/O1-ring-tiles-moved-to-49-49",
    noteRoom17("roadRampart", (r2) => (r2.ringTiles || []).length),
    (p) => {
      noteRec(p, "roadRampart").ringTiles = noteRec(p, "roadRampart").ringTiles.map(() => ({ x: 49, y: 49 }));
      regenNotes(p);
    },
    "roadRampart|ringTiles|says");
  run("r17/O1-sealed-floor-names-an-invented-tile",
    noteRoom17("sealedFloor", (r2) => (r2.named || []).length),
    (p) => { noteRec(p, "sealedFloor").named[0] = { x: 1, y: 1 }; regenNotes(p); },
    "named|sealed-floor record|re-derives");
  run("r17/O1-sealed-floor-name-list-truncated",
    noteRoom17("sealedFloor", (r2) => (r2.named || []).length > 1),
    (p) => { noteRec(p, "sealedFloor").named.shift(); regenNotes(p); },
    "named|sealed-floor record|re-derives");
  run("r17/O1-cut-refusal-blames-a-different-tile",
    noteRoom17("redundantCut", (r2) => (r2.named || []).length),
    (p) => {
      const r2 = noteRec(p, "redundantCut");
      r2.named[0].reason = { ...r2.named[0].reason, tile: "1,1" };
      regenNotes(p);
    },
    "reason|redundantCut.reasons|says");
  run("r17/O1-shallow-search-census-inflated-in-the-note",
    noteRoom17("shallowExt", (r2) => r2.search),
    (p) => { noteRec(p, "shallowExt").search.freeDeepRoadFaced = 60; regenNotes(p); },
    "reflow search|freeDeepRoadFaced|says");
  run("r17/O1-a-relocation-that-never-happened",
    noteRoom17("shallowExt", (r2) => r2.l7 && (r2.l7.tiles || []).length),
    (p) => {
      noteRec(p, "shallowExt").l7.tiles[0] = { from: { x: 2, y: 2 }, to: { x: 3, y: 3 }, fromDepth: 1, toDepth: 9 };
      regenNotes(p);
    },
    "layer-7b relocations|reflow.moved|lists");
  run("r17/O1-a-layer-6-relocation-that-never-happened",
    noteRoom17("shallowExt", (r2) => r2.l6 && (r2.l6.tiles || []).length),
    (p) => {
      noteRec(p, "shallowExt").l6.tiles[0] = { from: { x: 2, y: 2 }, to: { x: 3, y: 3 } };
      regenNotes(p);
    },
    "layer-6 relocations|extensions.relocated|lists");
  run("r17/O1-a-refusal-the-room-never-made",
    noteRoom17("pavedRun", (r2) => (r2.runs || []).length),
    (p) => {
      noteRec(p, "pavedRun").runs[0].refused = "no interior parallel exists: nothing at all";
      regenNotes(p);
    },
    "refusal|alongCutRefused|says");
  run("r17/O1-a-free-tile-the-run-never-had",
    noteRoom17("pavedRun", (r2) => (r2.runs || []).length),
    (p) => { noteRec(p, "pavedRun").runs[0].free = [{ x: 1, y: 1 }]; regenNotes(p); },
    "alongCutRuns|does not");
  run("r17/O1-a-note-that-renders-the-word-undefined",
    noteRoom17("pavedRun", (r2) => (r2.runs || []).length),
    (p) => {
      const r2 = noteRec(p, "pavedRun");
      delete r2.runs[0].x;
      delete r2.runs[0].y;
      regenNotes(p);
    },
    "undefined|alongCutRuns");
  run("r17/O1-container-sharing-invented",
    noteRoom17("containerRoad"),
    (p) => { noteRec(p, "containerRoad").sharing = [{ x: 1, y: 1 }]; regenNotes(p); },
    "sharing a road tile|board carries");

  // ---- O4: three boards, three names, and a reader for each ---------------
  run("r17/O4-shipped-free-deep-inflated",
    anyRoom((p) => typeof p.meta?.shell?.shippedFreeDeep === "number"),
    (p) => { p.meta.shell.shippedFreeDeep = 9999; },
    "shippedFreeDeep|free deep tile");
  run("r17/O4-shipped-deep-interior-zeroed",
    anyRoom((p) => typeof p.meta?.shell?.shippedDeepInterior === "number"),
    (p) => { p.meta.shell.shippedDeepInterior = 0; },
    "shippedDeepInterior|deep interior");
  run("r17/O4-the-alias-stops-being-an-alias",
    anyRoom((p) => typeof p.meta?.shell?.negotiationFreeDeep === "number"),
    (p) => { p.meta.shell.negotiationFreeDeep = 9999; },
    "negotiationFreeDeep|deepTiles");
  run("r17/O4-budget-verdict-flipped",
    anyRoom((p) => p.meta?.shell?.budgetPass === true),
    (p) => { p.meta.shell.budgetPass = false; },
    "budgetPass|floor of");
  run("r17/O4-upkeep-halved",
    anyRoom((p) => typeof p.meta?.shell?.upkeepPerTick === "number" && p.meta.shell.upkeepPerTick > 0),
    (p) => { p.meta.shell.upkeepPerTick = p.meta.shell.upkeepPerTick / 2; },
    "upkeepPerTick|energy/tick");
  run("r17/O4-the-basis-that-names-no-board",
    anyRoom((p) => typeof p.meta?.shell?.deepTilesBasis === "string"),
    (p) => { p.meta.shell.deepTilesBasis = "deep tiles"; },
    "deepTilesBasis|which board");

  // ---- O2 / O3: the two re-composing passes ------------------------------
  const panelRoom17 = anyRoom((p) => {
    const t2 = p.meta?.towers?.acrossPriorTake;
    return t2 && Array.isArray((t2.taken ? t2.after : t2.before)?.refillWalks);
  });
  const panelOf17 = (p) => {
    const t2 = p.meta.towers.acrossPriorTake;
    return t2.taken ? t2.after : t2.before;
  };
  run("r17/O2-take-panel-hides-a-filler-walk-regression", panelRoom17, (p) => {
    const pan = panelOf17(p);
    pan.refillWalks = pan.refillWalks.map(() => 1);
  }, "filler walks|board this room ships");
  run("r17/O2-take-panel-total-understated", panelRoom17, (p) => {
    panelOf17(p).refillTotal = 1;
  }, "refillTotal|walks total|filler walks");
  run("r17/O2-take-panel-forgets-a-walk-at-the-cap", panelRoom17, (p) => {
    panelOf17(p).refillAtCap = 99;
    panelOf17(p).refillOverNote = 99;
  }, "hard cap|note|walk");
  run("r17/O2-take-panel-ends-on-an-illegal-board", panelRoom17, (p) => {
    panelOf17(p).stackedOnRoad = 1;
  }, "stackedOnRoad|HARD failure");
  run("r17/O2-take-panel-ends-with-a-road-serving-nothing", panelRoom17, (p) => {
    panelOf17(p).orphanRoads = 3;
  }, "orphanRoads|serving nothing");
  run("r17/O2-a-refusal-with-no-instrument-in-it",
    anyRoom((p) => p.meta?.towers?.adjacency?.satAcrossPrior?.takeOutcome),
    (p) => { p.meta.towers.adjacency.satAcrossPrior.takeOutcome.verdict = "refused"; },
    "verdict|refusal that does not quote|not the sentence");
  run("r17/O3-a-pocket-that-is-not-on-the-board",
    anyRoom((p) => (p.meta?.sealedFloor?.pockets || []).length),
    (p) => { p.meta.sealedFloor.pockets[0].at = { x: 1, y: 1 }; },
    "no sealed pocket|contains that tile");
  run("r17/O3-a-holder-that-returns-more-than-it-holds",
    anyRoom((p) => (p.meta?.sealedFloor?.pockets || []).some((q) => (q.holders || []).length)),
    (p) => {
      const q = p.meta.sealedFloor.pockets.find((z) => (z.holders || []).length);
      q.holders[0].recovers = 99;
      q.holders[0].recoversDeep = 99;
    },
    "removing the|own-creep flood");
  run("r17/O3-the-holder-roster-loses-a-candidate",
    anyRoom((p) => (p.meta?.sealedFloor?.pockets || []).some((q) => (q.holders || []).length > 1)),
    (p) => {
      const q = p.meta.sealedFloor.pockets.find((z) => (z.holders || []).length > 1);
      q.holders.shift();
    },
    "holders|D8-adjacent|missing");
  run("r17/O3-the-single-structure-ceiling-understated",
    anyRoom((p) => (p.meta?.sealedFloor?.singleStructureDeep || 0) > 0),
    (p) => {
      p.meta.sealedFloor.singleStructureDeep = 0;
      p.meta.sealedFloor.singleStructureTiles = 0;
    },
    "singleStructure|best single holder");
  run("r17/O3-the-pocket-list-deleted",
    anyRoom((p) => (p.meta?.sealedFloor?.pockets || []).length),
    (p) => { delete p.meta.sealedFloor.pockets; },
    "pockets|D8 pocket");

  // ---- O6: crossings completeness ---------------------------------------
  run("r17/O6-a-crossing-that-reaches-none-of-the-pairs",
    anyRoom((p) => (p.meta?.towers?.adjacency?.crossings || []).length && (p.meta.towers.adjacency.pairTiles || []).length),
    (p) => {
      for (const c of p.meta.towers.adjacency.crossings) c.to = { x: 1, y: 1 };
      if (p.meta.towers.acrossPriorTake) delete p.meta.towers.acrossPriorTake.taken;
    },
    "no recorded crossing reaches|no tower there|crossing");
  run("r17/O6-the-take-crossing-deleted",
    anyRoom((p) => (p.meta?.towers?.adjacency?.crossings || []).some((c) => c.pass === "acrossPriorTake")),
    (p) => {
      p.meta.towers.adjacency.crossings = p.meta.towers.adjacency.crossings.filter((c) => c.pass !== "acrossPriorTake");
      delete p.meta.towers.acrossPriorTake;
    },
    "crossing|abandoned|atLayer3|unexplained|reaches");

  // ---- F7: the shallow slot's two facts ----------------------------------
  run("r17/F7-a-spent-census-claiming-it-was-always-empty",
    withDecl17("extensions", "shallow", (d) => (d.shallowExt?.slots || []).length && d.shallowExt.search?.freeDeepRoadFaced > 0),
    raw17("extensions", "shallow", (d) => {
      d.shallowExt.slots[0].why =
        `this room has NO free deep tile that is road-faced or one pave away and never had one — the ` +
        `post-prune scan over all ${d.shallowExt.search.interiorTiles} positions of the 48x48 buildable ` +
        `band (of which ${d.shallowExt.search.interiorWalkable} are walkable floor inside this room's own ` +
        `wall) returned an empty candidate list in BOTH classes at the census AND on the re-scan after ` +
        `every placement, so there is nowhere for this slot to go`;
    }),
    "not the sentence this row generates");
  run("r17/F7-an-empty-census-with-a-spent-sentence",
    withDecl17("extensions", "shallow", (d) => (d.shallowExt?.slots || []).length),
    decl17("extensions", "shallow", (d) => {
      d.shallowExt.search.freeDeepRoadFaced = 0;
      d.shallowExt.search.freeDeepOnePave = 0;
      d.shallowExt.search.spentOnAdds = 0;
      d.shallowExt.search.spentOnMoves = 0;
      d.shallowExt.search.paveTaken = 0;
      d.shallowExt.search.left = 0;
      d.shallowExt.search.paveLeft = 0;
    }),
    "not the sentence this row generates|re-derived|freeDeep|reflow search");
}

// ===========================================================================
// ROUND 18 — the two reviewers' escape rosters, one case each.
//
// MF1 (CRITICAL): `null` switched a leaf's whole audit off — 1784 of 17963
//   record leaves escaped when nulled with the prose regenerated, 590 of them
//   leaves a WRONG value bites and 402 regenerating byte-identical prose.
// MF2/MF3/MF5/MF7: an unbound copy of a class-D board fact, a census that
//   still crossed a room boundary, a list bound as a set, and the residue
//   criticism 63 left unnamed.
// OF2 (BLOCKING): `meta.sealedRecovery` and the non-final halves of
//   `acrossPriorTake` were bound to nothing — 15 of 27 semantic mutations and
//   35 of 40 x5 inflations escaped, including a take that never happened.
// OF5/OF7: crossings completeness satisfied by the take's destination alone,
//   and an x5 on `satAcrossPrior.tried`.
// ===========================================================================
{
  const decl18 = (gate, kind, edit) => (p) => {
    const d = declOf(p, gate, kind);
    if (!d) throw new Error(`no ${gate}/${kind || ""} declaration`);
    edit(d, p);
    d.detail = renderDecl({ ...d, detail: undefined });
  };
  const raw18 = (gate, kind, edit) => (p) => {
    const d = declOf(p, gate, kind);
    if (!d) throw new Error(`no ${gate}/${kind || ""} declaration`);
    edit(d, p);
  };
  const withDecl18 = (gate, kind, pred) =>
    anyRoom((p) => {
      const d = declOf(p, gate, kind);
      return d ? !pred || pred(d, p) : false;
    });
  const regen18 = (p) => {
    for (let i = 0; i < (p.meta.noteRecords || []).length; i++) {
      try {
        p.meta.notes[i] = renderNote(p.meta.noteRecords[i]);
      } catch {
        /* a record the template throws on is its own failure */
      }
    }
  };
  /** edit a note record of class `cls` and regenerate every note */
  const note18 = (cls, edit) => (p) => {
    const i = (p.meta.noteRecords || []).findIndex((e) => e && e.cls === cls);
    if (i < 0) throw new Error(`no ${cls} note record`);
    edit(p.meta.noteRecords[i].rec, p, i);
    regen18(p);
  };
  const withNote18 = (cls, pred) =>
    anyRoom((p) => {
      const e = (p.meta.noteRecords || []).find((z) => z && z.cls === cls);
      return e ? !pred || pred(e.rec, p) : false;
    });
  /** edit `meta.sealedRecovery` AND its note-record copy, then regenerate */
  const recov18 = (edit) => (p) => {
    const R = p.meta.sealedRecovery;
    if (!R) throw new Error("no sealedRecovery");
    edit(R, p);
    const i = (p.meta.noteRecords || []).findIndex((e) => e && e.cls === "sealedRecovery");
    if (i >= 0) p.meta.noteRecords[i].rec = R;
    regen18(p);
  };
  const withRecov18 = (pred) => anyRoom((p) => (p.meta?.sealedRecovery ? !pred || pred(p.meta.sealedRecovery, p) : false));
  const takenRoom = (pred) => withRecov18((R, p) => R.outcome === "taken" && (!pred || pred(R, p)));

  // ---- MF1: THE NULL POLICY ------------------------------------------------
  run("r18/MF1-ladder-shippedRamparts-nulled-and-the-rung-trail-fabricated",
    withDecl18("mobility", null, (d) => typeof d.ladder?.shippedRamparts === "number" && (d.ladder.rungs || []).length),
    decl18("mobility", null, (d) => {
      d.ladder.shippedRamparts = null;
      d.ladder.rungs = d.ladder.rungs.map((r, i) => ({ ...r, mobility: 9.9 - i * 0.1, ramparts: i + 1 }));
    }),
    "published as `null`|null|shippedRamparts");
  run("r18/MF1-lane-bounded-nulled",
    withDecl18("mobility", null, (d) => typeof d.lane?.bounded === "number"),
    decl18("mobility", null, (d) => { d.lane.bounded = null; }),
    "published as `null`|carries nothing either|null");
  run("r18/MF1-lane-wanted-nulled-in-a-room-that-dropped-one",
    withDecl18("mobility", null, (d) => d.lane?.dropped === true && typeof d.lane.wanted === "number"),
    decl18("mobility", null, (d) => { d.lane.wanted = null; }),
    "null|dropped");
  run("r18/MF1-lane-wanted-published-in-a-room-that-dropped-nothing",
    withDecl18("mobility", null, (d) => d.lane && d.lane.dropped !== true && d.lane.wanted === null),
    decl18("mobility", null, (d) => { d.lane.wanted = 12; }),
    "TRUE|dropped|null");
  run("r18/MF1-lane-stubsLifted-nulled",
    withDecl18("mobility", null, (d) => typeof d.lane?.stubsLifted === "number"),
    decl18("mobility", null, (d) => { d.lane.stubsLifted = null; }),
    "null|carries nothing either");
  run("r18/MF1-linkOnCut-negotiatedCutTiles-nulled",
    withDecl18("shell", null, (d) => typeof d.linkOnCut?.negotiatedCutTiles === "number"),
    decl18("shell", null, (d) => { d.linkOnCut.negotiatedCutTiles = null; }),
    "published as `null`");
  run("r18/MF1-dispersion-clumpBefore-nulled",
    withDecl18("towers", "clump", (d) => typeof d.dispersion?.search?.clumpBefore === "number"),
    decl18("towers", "clump", (d) => { d.dispersion.search.clumpBefore = null; }),
    "published as `null`");
  run("r18/MF1-dispersion-towerWindowBefore-nulled",
    withDecl18("towers", "clump", (d) => typeof d.dispersion?.search?.towerWindowBefore === "number"),
    decl18("towers", "clump", (d) => { d.dispersion.search.towerWindowBefore = null; }),
    "published as `null`");
  run("r18/MF1-negotiated-shippedWallLap-nulled",
    withDecl18("mobility", null, (d) => typeof d.negotiated?.shippedWallLap === "number"),
    decl18("mobility", null, (d) => { d.negotiated.shippedWallLap = null; }),
    "published as `null`");
  run("r18/MF1-causeWalks-noWalls-ratio-nulled",
    withDecl18("mobility", null, (d) => typeof d.negotiated?.causeWalks?.noWalls?.ratio === "number"),
    decl18("mobility", null, (d) => { d.negotiated.causeWalks.noWalls.ratio = null; }),
    "published as `null`");
  run("r18/MF1-fallbackBest-published-on-a-record-with-no-fallback-trail",
    withDecl18("mobility", null, (d) => d.ladder && d.ladder.fallbackBest === null && (d.ladder.rungs || []).length),
    decl18("mobility", null, (d) => { d.ladder.fallbackBest = d.ladder.rungs[0].mobility; }),
    "TRUE|null|fallback");
  run("r18/MF1-negotiated-eco-invented-on-a-lap-that-never-left-its-floor",
    withDecl18("mobility", null, (d) => d.negotiated && d.negotiated.eco === null),
    decl18("mobility", null, (d) => { d.negotiated.eco = { ecoCost: 0, bareDeep: 130, needDeep: 123, deepTiles: 130 }; }),
    "TRUE|eco|floor");
  run("r18/MF1-fannedAvailable-nulled-while-triples-reached-the-target",
    withDecl18("spawnFan", "sector", (d) => (d.spawnFan?.census?.fannedTriples || 0) > 0 && d.spawnFan.census.fannedAvailable),
    decl18("spawnFan", "sector", (d) => { d.spawnFan.census.fannedAvailable = null; }),
    "null|fannedTriples");
  run("r18/MF1-shallow-slot-bestLegal-nulled-on-a-row-that-examined-a-target",
    withDecl18("extensions", "shallow", (d) => (d.shallowExt?.slots || []).some((s2) => s2.examined > 0 && s2.bestLegal)),
    decl18("extensions", "shallow", (d) => {
      const s2 = d.shallowExt.slots.find((z) => z.examined > 0 && z.bestLegal);
      s2.bestLegal = null;
    }),
    "null|examined");
  run("r18/MF1-shallow-slot-ceiling-nulled",
    withDecl18("extensions", "shallow", (d, p) => (d.shallowExt?.slots || []).some((s2) => s2.ceiling !== null && s2.ceiling !== undefined) && p.meta?.walls?.reflow?.lapCeiling !== null),
    decl18("extensions", "shallow", (d) => {
      const s2 = d.shallowExt.slots.find((z) => z.ceiling !== null && z.ceiling !== undefined);
      s2.ceiling = null;
    }),
    "null|lapCeiling|carries nothing");
  run("r18/MF1-note-extTarget-nulled",
    withNote18("shallowExt", (r) => typeof r.extTarget === "number"),
    note18("shallowExt", (r) => { r.extTarget = null; }),
    "null|extTarget|carries nothing");
  run("r18/MF1-note-lap-ceiling-nulled",
    withNote18("shallowExt", (r, p) => typeof r.lap?.ceiling === "number" && p.meta?.walls?.reflow?.lapCeiling !== null),
    note18("shallowExt", (r) => { r.lap.ceiling = null; }),
    "null|lapCeiling|carries nothing");
  run("r18/MF1-note-lap-slackSpent-nulled",
    withNote18("shallowExt", (r) => typeof r.lap?.slackSpent === "boolean"),
    note18("shallowExt", (r) => { r.lap.slackSpent = null; }),
    "slackSpent|boolean");
  run("r18/MF1-note-l7-nulled-while-the-reflow-moved-extensions",
    withNote18("shallowExt", (r, p) => r.l7 && (p.meta?.walls?.reflow?.moved || []).length),
    note18("shallowExt", (r) => { r.l7 = null; }),
    "l7|null|relocation");
  run("r18/MF1-a-mirrored-leaf-nulled-while-its-mirror-carries-a-number",
    withDecl18("towers", "weak-battery", (d, p) => typeof d.towers?.maxRefill === "number" && p.meta?.towers?.maxRefill !== undefined),
    decl18("towers", "weak-battery", (d) => { d.towers.maxRefill = null; }),
    "is null and|published as `null`");

  // ---- MF7: the residue criticism 63 did not name --------------------------
  run("r18/MF7-note-mobilityTarget-inflated",
    withNote18("shallowExt", (r) => typeof r.mobilityTarget === "number"),
    note18("shallowExt", (r) => { r.mobilityTarget = r.mobilityTarget * 3 + 1; }),
    "mobility target|MOB_TARGET");
  run("r18/MF7-ladder-rung-ramparts-inflated",
    withDecl18("mobility", null, (d) => (d.ladder?.rungs || []).length),
    decl18("mobility", null, (d) => { d.ladder.rungs[0].ramparts = d.ladder.rungs[0].ramparts * 3 + 1; }),
    "rampart|rung");
  run("r18/MF7-ctrlParks-rampartsHolding-inflated",
    withDecl18("ctrlParks", "released", (d) => typeof d.ctrlParks?.rampartsHolding === "number"),
    decl18("ctrlParks", "released", (d) => { d.ctrlParks.rampartsHolding = d.ctrlParks.rampartsHolding * 3 + 1; }),
    "rampart|twice");

  // ---- MF4: the duplicate rungs array, re-introduced ------------------------
  run("r18/MF4-the-deleted-second-rungs-array-comes-back",
    withDecl18("mobility", null, (d) => (d.ladder?.rungs || []).length),
    raw18("mobility", null, (d) => {
      d.rungs = d.ladder.rungs.map((r) => ({ ...r, seedSkip: 77 }));
    }),
    "does not name it|rungs");

  // ---- MF2: the placement walk vector, permuted ----------------------------
  run("r18/MF2-refillDists-permuted",
    withDecl18("towers", "weak-battery", (d, p) => Array.isArray(d.towers?.refillDists) && Array.isArray(p.meta?.towers?.refillDistsAtPlacement)),
    decl18("towers", "weak-battery", (d) => { d.towers.refillDists = d.towers.refillDists.slice().reverse(); }),
    "different order|entry for entry|placement-board walk vector");
  run("r18/MF2-refillDists-one-entry-changed",
    withDecl18("towers", "weak-battery", (d) => Array.isArray(d.towers?.refillDists)),
    decl18("towers", "weak-battery", (d) => { d.towers.refillDists[0] = d.towers.refillDists[0] + 3; }),
    "placement-board walk vector|refillDists");
  run("r18/MF2-refillDists-referent-deleted-and-the-copy-falsified",
    withDecl18("towers", "weak-battery", (d, p) => Array.isArray(d.towers?.refillDists) && p.meta?.towers?.refillDistsAtPlacement),
    decl18("towers", "weak-battery", (d, p) => {
      d.towers.refillDists = [9, 9, 9, 9, 9, 9];
      delete p.meta.towers.refillDistsAtPlacement;
    }),
    "refillDistsAtPlacement|ABSENT|absent");

  // ---- MF3: the census that still crossed a room boundary ------------------
  run("r18/MF3-a-whole-lane-census-carried-in-from-another-room",
    withDecl18("mobility", null, (d, p) => p.meta?.walls?.mobility?.lanes && p.meta?.extensions?.laneMeta),
    decl18("mobility", null, (d, p) => {
      const donor = plans.find((z) => z.room !== p.room && z.meta?.walls?.mobility?.lanes && (z.meta.walls.mobility.lanes.tiles || 0) > 30);
      if (!donor) throw new Error("no donor room with a big lane census");
      const L = JSON.parse(JSON.stringify(donor.meta.walls.mobility.lanes));
      p.meta.walls.mobility.lanes = L;
      const dl = declOf(donor, "mobility", null);
      if (dl && dl.lane) d.lane = JSON.parse(JSON.stringify(dl.lane));
    }),
    "lane-anchor|laneMeta|lane");
  run("r18/MF3-laneMeta-deleted-so-the-third-copy-cannot-disagree",
    anyRoom((p) => p.meta?.extensions?.laneMeta && p.meta?.walls?.mobility?.lanes),
    (p) => { delete p.meta.extensions.laneMeta; },
    "lane-anchor|laneMeta");
  run("r18/MF3-one-lane-field-edited-in-only-two-of-its-three-copies",
    withDecl18("mobility", null, (d, p) => typeof p.meta?.walls?.mobility?.lanes?.tiles === "number" && p.meta?.extensions?.laneMeta),
    decl18("mobility", null, (d, p) => {
      const v = (p.meta.walls.mobility.lanes.tiles || 0) + 17;
      p.meta.walls.mobility.lanes.tiles = v;
      d.lane.tiles = v;
    }),
    "lane-anchor|laneMeta|lane");

  // ---- MF5: a list bound as a set ------------------------------------------
  run("r18/MF5-redundantCut-named-lists-a-tile-twice",
    withNote18("redundantCut", (r) => (r.named || []).length),
    note18("redundantCut", (r) => { r.named = [...r.named, r.named[0]]; }),
    "more than once|lists \\d+ named");
  run("r18/MF5-redundantCut-named-read-out-in-the-wrong-order",
    withNote18("redundantCut", (r) => (r.named || []).length > 1),
    note18("redundantCut", (r) => { r.named = r.named.slice().reverse(); }),
    "in the order the refusals were made|reads its named cut tiles");
  run("r18/MF5-redundantCut-named-drops-an-entry",
    withNote18("redundantCut", (r) => (r.named || []).length > 1),
    note18("redundantCut", (r) => { r.named = r.named.slice(1); }),
    "lists \\d+ named|prices");

  // ---- MF-BONUS: the basin's terrain ceiling -------------------------------
  run("r18/MFB-eco-basin-inflated-x5",
    withDecl18("eco", null, (d) => typeof d.eco?.basin === "number"),
    decl18("eco", null, (d) => { d.eco.basin = d.eco.basin * 5; }),
    "basin-ceiling|growBasin|basin");
  run("r18/MFB-eco-basin-inflated-x3-plus-1",
    withDecl18("eco", null, (d) => typeof d.eco?.basin === "number"),
    decl18("eco", null, (d) => { d.eco.basin = d.eco.basin * 3 + 1; }),
    "basin-ceiling|growBasin|basin");

  // ---- OF7: an identity, not a counter -------------------------------------
  run("r18/OF7-satAcrossPrior-tried-inflated-x5",
    anyRoom((p) => typeof p.meta?.towers?.adjacency?.satAcrossPrior?.tried === "number"),
    (p) => { p.meta.towers.adjacency.satAcrossPrior.tried *= 5; },
    "satAcrossPrior.tried|exhaustive loop");
  run("r18/OF7-satAcrossPrior-tried-deflated",
    anyRoom((p) => typeof p.meta?.towers?.adjacency?.satAcrossPrior?.tried === "number"),
    (p) => { p.meta.towers.adjacency.satAcrossPrior.tried = 3; },
    "satAcrossPrior.tried|exhaustive loop");

  // ---- OF5: crossings completeness ----------------------------------------
  run("r18/OF5-crossings-emptied-in-a-room-whose-pairs-all-touch-the-take",
    anyRoom((p) => (p.meta?.towers?.adjacency?.crossings || []).length && p.meta?.towers?.acrossPriorTake?.taken),
    (p) => { p.meta.towers.adjacency.crossings = []; },
    "no recorded crossing|crossings");
  run("r18/OF5-crossing-neighbours-truncated-to-one",
    anyRoom((p) => (p.meta?.towers?.adjacency?.crossings || []).some((c) => (c.neighbours || []).length > 1)),
    (p) => {
      const c = p.meta.towers.adjacency.crossings.find((z) => (z.neighbours || []).length > 1);
      c.neighbours = c.neighbours.slice(0, 1);
    },
    "neighbours|no recorded crossing");
  run("r18/OF5-crossing-neighbour-moved-off-the-board",
    anyRoom((p) => (p.meta?.towers?.adjacency?.crossings || []).some((c) => (c.neighbours || []).length)),
    (p) => {
      const c = p.meta.towers.adjacency.crossings.find((z) => (z.neighbours || []).length);
      c.neighbours[0] = { x: 49, y: 49 };
    },
    "neighbours|no recorded crossing");
  run("r18/OF5-crossing-refillWalksTo-rewritten-non-worsening",
    anyRoom((p) => (p.meta?.towers?.adjacency?.crossings || []).some((c) => Array.isArray(c.refillWalksTo))),
    (p) => {
      const c = p.meta.towers.adjacency.crossings.find((z) => Array.isArray(z.refillWalksTo));
      c.refillWalksTo = c.refillWalksFrom.map((v) => Math.max(1, v - 1));
    },
    "refillWalksTo|one set of numbers");
  run("r18/OF5-crossing-refillTotalTo-rewritten",
    anyRoom((p) => (p.meta?.towers?.adjacency?.crossings || []).some((c) => typeof c.refillTotalTo === "number")),
    (p) => {
      const c = p.meta.towers.adjacency.crossings.find((z) => typeof z.refillTotalTo === "number");
      c.refillTotalTo = c.refillTotalFrom - 5;
    },
    "refillTotalTo|one set of numbers");

  // ---- OF2: the sealed-recovery record ------------------------------------
  run("r18/OF2-the-whole-recovery-record-deleted",
    withRecov18(),
    (p) => { delete p.meta.sealedRecovery; },
    "sealedRecovery|SCHEMA");
  run("r18/OF2-taken-nulled-so-the-room-refused-everything",
    takenRoom(),
    recov18((R) => { R.taken = null; }),
    "outcome|taken|TAKEN");
  run("r18/OF2-outcome-flipped-to-belowThreshold-with-the-take-still-on-it",
    takenRoom(),
    recov18((R) => { R.outcome = "belowThreshold"; }),
    "outcome|taken|belowThreshold");
  run("r18/OF2-withdrawn-seat-forged-onto-a-tile-with-no-structure",
    takenRoom(),
    recov18((R) => { R.taken.withdrawn = { x: 49, y: 49 }; }),
    "withdrawn|TAKEN|offered entry");
  run("r18/OF2-offered-list-truncated-to-one-entry",
    takenRoom((R) => (R.offered || []).length > 1),
    recov18((R) => { R.offered = R.offered.slice(-1); }),
    "priced entr|tried|TAKEN");
  run("r18/OF2-a-candidates-recoversDeep-inflated",
    takenRoom((R) => (R.offered || []).some((o) => typeof o.recoversDeep === "number")),
    recov18((R) => {
      const o = R.offered.find((z) => typeof z.recoversDeep === "number");
      o.recoversDeep = 99;
    }),
    "counterfactual|recoversDeep");
  run("r18/OF2-recoveredDeep-inflated-x10",
    takenRoom((R) => typeof R.recoveredDeep === "number"),
    recov18((R) => { R.recoveredDeep *= 10; }),
    "recoveredDeep|panels");
  run("r18/OF2-recoveredDeep-deflated",
    takenRoom((R) => typeof R.recoveredDeep === "number" && R.recoveredDeep > 4),
    recov18((R) => { R.recoveredDeep = 4; }),
    "recoveredDeep|panels");
  run("r18/OF2-recoveredTiles-inflated",
    takenRoom((R) => typeof R.recoveredTiles === "number"),
    recov18((R) => { R.recoveredTiles *= 10; }),
    "recoveredTiles|panels|interior");
  run("r18/OF2-after-interior-erases-the-gain-the-take-was-justified-by",
    takenRoom((R) => R.after && R.before && typeof R.after.interior === "number"),
    recov18((R) => { R.after.interior = R.before.interior; }),
    "interior|recovers");
  run("r18/OF2-before-sealedDeep-shrinks-the-problem-the-pass-solved",
    takenRoom((R) => R.before && typeof R.before.sealedDeep === "number"),
    recov18((R) => { R.before.sealedDeep = R.after.sealedDeep + 1; }),
    "sealedDeep|panels");
  run("r18/OF2-after-panel-sealedDeep-rewritten-off-the-board",
    takenRoom((R) => R.after && typeof R.after.sealedDeep === "number"),
    recov18((R) => { R.after.sealedDeep += 7; R.before.sealedDeep += 7; }),
    "sealedDeep|re-flooded seal|final panel");
  run("r18/OF2-tried-is-a-prefix-of-candidates-again",
    takenRoom((R) => R.candidates > 1),
    recov18((R) => { R.tried = 1; }),
    "candidates|re-composition|prefix");
  run("r18/OF2-candidates-deflated-to-hide-untried-holders",
    takenRoom((R) => R.candidates > 1),
    recov18((R) => { R.candidates = 1; R.tried = 1; }),
    "candidates|priced entr");
  run("r18/OF2-accepted-count-does-not-match-the-accepting-verdicts",
    takenRoom((R) => typeof R.accepted === "number"),
    recov18((R) => { R.accepted += 3; }),
    "accepted");
  run("r18/OF2-a-refused-candidate-whose-own-panel-clears-every-rule",
    takenRoom((R) => (R.offered || []).some((o) => o.verdict && o.verdict !== "TAKEN" && !/^accepted/.test(o.verdict) && o.after)),
    recov18((R) => {
      const win = R.offered.find((z) => z.verdict === "TAKEN");
      const o = R.offered.find((z) => z.verdict && z.verdict !== "TAKEN" && !/^accepted/.test(z.verdict) && z.after);
      o.after = JSON.parse(JSON.stringify(win.after));
      o.gainedDeep = win.gainedDeep;
      o.gainedTiles = win.gainedTiles;
      o.extTourAfter = win.extTourAfter;
      o.extTourDelta = win.extTourDelta;
    }),
    "REFUSED|clear every rule|accepted");
  run("r18/OF2-an-accepted-candidate-that-gives-back-less-than-the-threshold",
    takenRoom((R) => (R.offered || []).some((o) => /^accepted, not taken/.test(String(o.verdict)))),
    recov18((R) => {
      const o = R.offered.find((z) => /^accepted, not taken/.test(String(z.verdict)));
      o.after.sealedDeep = o.before.sealedDeep;
      o.gainedDeep = 0;
    }),
    "ACCEPTED|threshold|gained");
  run("r18/OF2-a-non-taken-accepted-candidate-recovers-more-than-the-one-taken",
    takenRoom((R) => (R.offered || []).some((o) => /^accepted, not taken/.test(String(o.verdict)))),
    recov18((R) => {
      const o = R.offered.find((z) => /^accepted, not taken/.test(String(z.verdict)));
      o.before.sealedDeep += 9;
      o.gainedDeep = (o.gainedDeep || 0) + 9;
    }),
    "tie-break|largest deep recovery|before\\` panel");
  run("r18/OF2-bestDeepAnywhere-inflated-past-the-rooms-own-pockets",
    withRecov18((R) => typeof R.bestDeepAnywhere === "number"),
    recov18((R) => { R.bestDeepAnywhere += 9; }),
    "bestDeepAnywhere|single-structure");
  run("r18/OF2-nothing-qualified-in-a-room-whose-pockets-qualify",
    withRecov18((R, p) => R.outcome === "belowThreshold" && (p.meta?.sealedFloor?.pockets || []).length),
    recov18((R, p) => {
      const pk = p.meta.sealedFloor.pockets[0];
      if (!pk.best) throw new Error("no best holder");
      pk.best.recoversDeep = 9;
      for (const h of pk.holders || []) if (h.x === pk.best.x && h.y === pk.best.y) h.recoversDeep = 9;
      R.bestDeepAnywhere = 9;
    }),
    "belowThreshold|recovers|returns");
  run("r18/OF2-threshold-lowered-so-a-worse-move-would-have-qualified",
    withRecov18(),
    recov18((R) => { R.threshold = 1; }),
    "threshold|SEALED_RECOVERY_THRESHOLD");
  run("r18/OF2-a-take-kept-over-its-own-stated-tour-ceiling",
    takenRoom((R) => typeof R.extTourDelta === "number" && typeof R.tourSlack === "number"),
    recov18((R) => {
      R.extTourAfter = R.extTourBefore + R.tourSlack + 40;
      R.extTourDelta = R.tourSlack + 40;
      const win = R.offered.find((z) => z.verdict === "TAKEN");
      if (win) { win.extTourAfter = R.extTourAfter; win.extTourDelta = R.extTourDelta; }
    }),
    "tour|ceiling|slack");
  run("r18/OF2-extTourDelta-that-is-not-after-minus-before",
    takenRoom((R) => typeof R.extTourDelta === "number"),
    recov18((R) => { R.extTourDelta = R.extTourDelta - 50; }),
    "extTourDelta|tour");
  run("r18/OF2-a-movable-kind-relabelled-fixed-geometry",
    takenRoom((R) => (R.fixedHolders || []).length),
    recov18((R) => { R.fixedHolders[0].type = R.kindsAttempted[0]; }),
    "fixed geometry|kindsAttempted");
  // ROUND 19: `record.pocket` became `record.pockets[]` (every pocket of the
  // room's seal, on every branch) and `taken.pocket` became `taken.pockets[]`
  // (the ones the take actually opened, measured on the after board). Both
  // cases re-pointed onto the new shape; the defect each one is about — a
  // holder in neither list, a recovery larger than the floor it came out of —
  // is unchanged.
  run("r18/OF2-a-holder-in-neither-the-candidate-nor-the-fixed-list",
    takenRoom((R) => Array.isArray(R.pockets) && R.pockets.length),
    recov18((R) => { for (const pk of R.pockets) pk.movable = Math.max(0, pk.movable - 1); }),
    "holders|movable|candidate");
  run("r18/OF2-a-recovery-larger-than-the-pocket-it-came-out-of",
    takenRoom((R) => Array.isArray(R.pockets) && R.pockets.length && R.recoveredTiles > 1),
    recov18((R) => { for (const pk of R.pockets) { pk.tiles = 1; pk.deep = 1; } }),
    "pocket|recover|seal");
  run("r18/OF2-a-candidate-priced-against-a-board-nobody-else-was-offered",
    takenRoom((R) => (R.offered || []).length > 1 && R.before),
    recov18((R) => { R.offered[0].before = { ...R.offered[0].before, interior: R.offered[0].before.interior + 25 }; }),
    "before\\` panel|composed from the same room|gains");
  run("r18/OF2-a-panel-missing-one-of-the-instruments-it-names",
    takenRoom((R) => R.after && Array.isArray(R.instruments)),
    recov18((R) => { delete R.after.clump; }),
    "does not carry|instrument");
  run("r18/OF2-a-panel-carrying-a-reading-the-instrument-list-does-not-name",
    takenRoom((R) => !!R.after),
    recov18((R) => { R.after.secretScore = 99; }),
    "instruments\\` does not name|unnamed reading");
  run("r18/OF2-the-final-panels-walk-vector-permuted",
    takenRoom((R) => Array.isArray(R.after?.refillWalks) && R.after.refillWalks.length > 2),
    recov18((R) => { R.after.refillWalks = R.after.refillWalks.slice().reverse(); }),
    "ascending|walks");
  run("r18/OF2-a-verdict-of-TAKEN-on-a-record-that-took-nothing",
    withRecov18((R) => R.outcome !== "taken" && (R.offered || []).length),
    recov18((R) => { R.offered[0].verdict = "TAKEN"; }),
    "TAKEN|outcome");
  run("r18/OF2-the-refusal-verdict-replaced-with-there-were-no-candidates",
    takenRoom((R) => (R.offered || []).some((o) => o.verdict && o.verdict !== "TAKEN" && !/^accepted/.test(o.verdict))),
    recov18((R) => {
      const o = R.offered.find((z) => z.verdict && z.verdict !== "TAKEN" && !/^accepted/.test(z.verdict));
      o.verdict = "refused: there were no other candidates at all, so nothing else was examined by this pass";
    }),
    "verdict|refusal|recovers");
  run("r18/OF2-a-refusals-quoted-recovery-does-not-match-its-own-panels",
    takenRoom((R) => (R.offered || []).some((o) => /recovers \d+ deep sealed tile/.test(String(o.verdict)))),
    recov18((R) => {
      const o = R.offered.find((z) => /recovers \d+ deep sealed tile/.test(String(z.verdict)));
      o.verdict = o.verdict.replace(/recovers \d+ deep sealed tile/, "recovers 4 deep sealed tile");
    }),
    "refusal says|recovers");
  run("r18/OF2-a-withdrawn-kind-the-pass-does-not-move",
    takenRoom((R) => (R.offered || []).length),
    recov18((R) => { R.offered[0].kind = "terminal"; }),
    "kindsAttempted|withdraws");

  // ---- OF2: the across-prior take's non-final halves ------------------------
  run("r18/OF2-acrossPriorTake-offered-emptied",
    anyRoom((p) => (p.meta?.towers?.acrossPriorTake?.offered || []).length),
    (p) => { p.meta.towers.acrossPriorTake.offered = []; },
    "offered|EMPTY|priced refusal");
  run("r18/OF2-a-priced-refusal-rewritten-into-a-take",
    anyRoom((p) => {
      const t = p.meta?.towers?.acrossPriorTake;
      return t && !t.taken && (t.offered || []).length;
    }),
    (p) => {
      const t = p.meta.towers.acrossPriorTake;
      t.offered[0].after = JSON.parse(JSON.stringify(t.before));
      t.offered[0].verdict = "TAKEN";
    },
    "TAKEN|criticism 59|identical");
  run("r18/OF2-acrossPriorTake-before-walk-vector-permuted",
    anyRoom((p) => Array.isArray(p.meta?.towers?.acrossPriorTake?.before?.refillWalks) && p.meta.towers.acrossPriorTake.before.refillWalks.length > 2 && !p.meta.towers.acrossPriorTake.taken),
    (p) => { p.meta.towers.acrossPriorTake.before.refillWalks = p.meta.towers.acrossPriorTake.before.refillWalks.slice().reverse(); },
    "ascending|walks");
  run("r18/OF2-a-refused-lift-whose-own-panel-breaks-nothing",
    anyRoom((p) => {
      const t = p.meta?.towers?.acrossPriorTake;
      return t && !t.taken && (t.offered || []).length && t.offered[0].after && t.offered[0].before;
    }),
    (p) => {
      const t = p.meta.towers.acrossPriorTake;
      const o = t.offered[0];
      for (const [f, d] of Object.entries(t.directions || {})) {
        if (typeof o.before[f] !== "number") continue;
        o.after[f] = d === "up" ? o.before[f] + 1 : Math.max(0, o.before[f] - 1);
      }
      if (Array.isArray(o.before.refillWalks)) o.after.refillWalks = o.before.refillWalks.slice();
    },
    "refusal|wrong way|nothing on its own panel");
  run("r18/OF2-a-taken-lift-whose-own-panel-moves-an-instrument-the-wrong-way",
    anyRoom((p) => {
      const t = p.meta?.towers?.acrossPriorTake;
      return t && t.taken && (t.offered || []).some((o) => /^TAKEN/.test(String(o.verdict)) && o.after && o.before);
    }),
    (p) => {
      const t = p.meta.towers.acrossPriorTake;
      const o = t.offered.find((z) => /^TAKEN/.test(String(z.verdict)));
      o.after.nukeWindow = (o.before.nukeWindow || 0) + 5;
    },
    "wrong way|directions");
  run("r18/OF2-the-take-crossing-and-the-take-disagree-about-the-destination",
    anyRoom((p) => {
      const t = p.meta?.towers?.acrossPriorTake;
      return t && t.taken && (t.offered || []).some((o) => /^TAKEN/.test(String(o.verdict)) && o.to);
    }),
    (p) => {
      const o = p.meta.towers.acrossPriorTake.offered.find((z) => /^TAKEN/.test(String(z.verdict)));
      o.to = { x: 1, y: 1 };
    },
    "TAKEN lift|moves a tower to|crossing");

  // ---- OF3: the new reader channel ----------------------------------------
  run("r18/OF3-the-recovery-note-record-deleted",
    withNote18("sealedRecovery"),
    (p) => {
      const i = p.meta.noteRecords.findIndex((e) => e && e.cls === "sealedRecovery");
      p.meta.noteRecords.splice(i, 1);
      p.meta.notes.splice(i, 1);
    },
    "OWES|sealedRecovery|noteObligations");
  run("r18/OF3-the-recovery-note-record-falsified-and-the-note-regenerated",
    withNote18("sealedRecovery", (r) => typeof r.candidates === "number"),
    note18("sealedRecovery", (r) => { r.candidates = 99; r.tried = 99; }),
    "sealedRecovery|candidates");
  run("r18/OF2-a-panels-walk-total-does-not-sum-its-own-vector",
    takenRoom((R) => (R.offered || []).some((o) => Array.isArray(o.after?.refillWalks))),
    recov18((R) => {
      const o = R.offered.find((z) => Array.isArray(z.after?.refillWalks));
      o.after.refillTotal += 11;
    }),
    "sums to|walks total");
  run("r18/OF2-a-panels-furthest-walk-is-not-the-longest-entry-of-its-own-vector",
    takenRoom((R) => (R.offered || []).some((o) => Array.isArray(o.after?.refillWalks))),
    recov18((R) => {
      const o = R.offered.find((z) => Array.isArray(z.after?.refillWalks));
      o.after.refill = 1;
    }),
    "furthest filler walk|longest entry");
  run("r18/OF2-a-counterfactual-panel-with-more-interior-than-the-room-has-floor",
    takenRoom((R) => (R.offered || []).some((o) => typeof o.after?.interior === "number")),
    recov18((R) => {
      const o = R.offered.find((z) => typeof z.after?.interior === "number");
      o.after.interior = 9000;
    }),
    "interior|50x50 room|walkable interior");
  run("r18/OF2-an-accepted-composition-that-stacks-a-structure-on-a-road",
    takenRoom((R) => (R.offered || []).some((o) => o.verdict === "TAKEN" && o.after)),
    recov18((R) => {
      const o = R.offered.find((z) => z.verdict === "TAKEN");
      o.after.stackedOnRoad = 1;
    }),
    "ACCEPTED|hard failure|stackedOnRoad");
  run("r18/OF2-tourSlack-raised-so-the-room-sets-its-own-price",
    withRecov18((R) => typeof R.tourSlack === "number"),
    recov18((R) => { R.tourSlack = 400; }),
    "tourSlack|SEALED_RECOVERY_TOUR_SLACK");
  run("r18/OF2-acrossPriorTake-clumpNote-rewritten",
    anyRoom((p) => typeof p.meta?.towers?.acrossPriorTake?.clumpNote === "number"),
    (p) => { p.meta.towers.acrossPriorTake.clumpNote = 25; },
    "clumpNote|CLUMP_NOTE");
  run("r18/OF2-acrossPriorTake-taken-destination-off-the-buildable-band",
    anyRoom((p) => p.meta?.towers?.acrossPriorTake?.taken?.from),
    (p) => { p.meta.towers.acrossPriorTake.taken.from = { x: 49, y: 49 }; },
    "buildable band|from");
  run("r18/OF2-a-final-panels-nuke-window-rewritten",
    anyRoom((p) => p.meta?.towers?.acrossPriorTake?.taken && typeof p.meta.towers.acrossPriorTake.after?.nukeWindow === "number"),
    (p) => { p.meta.towers.acrossPriorTake.after.nukeWindow = 2; },
    "nukeWindow|final panel");
  run("r18/OF2-a-final-panels-clump-rewritten",
    anyRoom((p) => p.meta?.towers?.acrossPriorTake?.taken && typeof p.meta.towers.acrossPriorTake.after?.clump === "number"),
    (p) => { p.meta.towers.acrossPriorTake.after.clump = 9; },
    "clump|final panel");
  run("r18/OF2-a-fixed-holder-that-is-not-on-the-board",
    takenRoom((R) => (R.fixedHolders || []).length),
    recov18((R) => { R.fixedHolders[0].x = 49; R.fixedHolders[0].y = 49; }),
    "fixedHolders|ships none there|buildable");
  run("r18/OF3-note-record-and-obligation-and-record-all-deleted-together",
    withNote18("sealedRecovery"),
    (p) => {
      const i = p.meta.noteRecords.findIndex((e) => e && e.cls === "sealedRecovery");
      p.meta.noteRecords.splice(i, 1);
      p.meta.notes.splice(i, 1);
      p.meta.noteObligations = (p.meta.noteObligations || []).filter((o) => o && o.cls !== "sealedRecovery");
      delete p.meta.sealedRecovery;
    },
    "SCHEMA|sealedRecovery");
}

// ===========================================================================
// ROUND 19 — the two reviewers' landed exploits, one case each.
// ===========================================================================
// MF1+O6 the tie-break (the winner was checked on one of four keys, and the
// key that decides most of the takes was not it); MF2 `lane.dropped` as an
// unanchored producer boolean licensing six nulls; MF3 the recovery record
// deletable in exactly the two rooms where the pass fully succeeded; MF4 the
// crossing's own content (nine escapes); MF5 four lane leaves published thrice
// and bound to none of them; MF6 two residues; MF7 the alternative-rung claim
// in both directions; O2 `taken.kind`/pocket; O8 the extension tour; O9 the
// `belowThreshold` verdict.
{
  const declOf19 = (p, gate, kind) => (p.meta?.shortfalls || []).find((s) => s.gate === gate && (kind === undefined || (s.kind || null) === kind));
  const anyRoom19 = (pred) => plans.find((p) => { try { return pred(p); } catch { return false; } })?.room || null;
  const regen19 = (p) => {
    for (let i = 0; i < (p.meta.noteRecords || []).length; i++) {
      try { p.meta.notes[i] = renderNote(p.meta.noteRecords[i]); } catch { /* a throwing record is its own failure */ }
    }
  };
  const recov19 = (edit) => (p) => {
    const R = p.meta.sealedRecovery;
    if (!R) throw new Error("no sealedRecovery");
    edit(R, p);
    const i = (p.meta.noteRecords || []).findIndex((e) => e && e.cls === "sealedRecovery");
    if (i >= 0) p.meta.noteRecords[i].rec = R;
    regen19(p);
  };
  const withRecov19 = (pred) => anyRoom19((p) => (p.meta?.sealedRecovery ? pred(p.meta.sealedRecovery, p) : false));
  const taken19 = (pred) => withRecov19((R, p) => R.outcome === "taken" && (!pred || pred(R, p)));
  const accepted19 = (R) => (R.offered || []).filter((o) => o && (o.verdict === "TAKEN" || /^accepted, not taken/.test(String(o.verdict))));
  const winner19 = (R) => (R.offered || []).find((o) => o && o.verdict === "TAKEN");
  const runnerUp19 = (R) => accepted19(R).find((o) => o !== winner19(R));
  const refused19 = (R) => (R.offered || []).find((o) => o && o.withdrawn && !/^(TAKEN|accepted)/.test(String(o.verdict)));
  const laneDecl19 = (p) => declOf19(p, "mobility", null);
  const laneRoom19 = (pred) => anyRoom19((p) => { const d = laneDecl19(p); return !!(d && d.lane && pred(d.lane, p)); });
  const lane19 = (edit) => (p) => {
    const d = laneDecl19(p);
    if (!d || !d.lane) throw new Error("no lane declaration");
    edit(d.lane, p);
    d.detail = renderDecl({ ...d, detail: undefined });
    regen19(p);
  };
  const crossRoom19 = (pred) => anyRoom19((p) => (p.meta?.towers?.adjacency?.crossings || []).some(pred));
  const cross19 = (pick, edit) => (p) => {
    const cs = p.meta?.towers?.adjacency?.crossings || [];
    const c = cs.find(pick);
    if (!c) throw new Error("no matching crossing");
    edit(c, cs, p);
  };
  const ladderRoom19 = (pred) => anyRoom19((p) => { const d = declOf19(p, "mobility", null); return !!(d && d.ladder && Array.isArray(d.ladder.rungs) && pred(d.ladder, p)); });
  const ladder19 = (edit) => (p) => {
    const d = declOf19(p, "mobility", null);
    if (!d || !d.ladder) throw new Error("no ladder");
    edit(d.ladder, p);
    d.detail = renderDecl({ ...d, detail: undefined });
    regen19(p);
  };
  const pickedRung19 = (L, p) => {
    const b = p.meta?.shellEscalation ? p.meta.shellEscalation.pickedNeedDeepBonus : null;
    return b === null || b === undefined ? null : L.rungs.find((r) => r && r.needDeepBonus === b);
  };

  // ---- MF1 + O6: the FULL published tie-break ------------------------------
  run("r19/MF1-forged-extTourDelta-on-an-accepted-candidate",
    taken19((R) => runnerUp19(R) && typeof runnerUp19(R).extTourDelta === "number"),
    recov19((R) => { const o = runnerUp19(R); o.extTourDelta = -400; o.extTourAfter = R.extTourBefore - 400; }),
    "tie-break|extTourDelta|reproducible");
  run("r19/MF1-an-accepted-candidate-tied-on-every-key-and-earlier-in-raster",
    taken19((R) => accepted19(R).some((o) => o !== winner19(R) && (o.withdrawn.y < R.taken.withdrawn.y || (o.withdrawn.y === R.taken.withdrawn.y && o.withdrawn.x < R.taken.withdrawn.x)))),
    recov19((R) => {
      const w = winner19(R);
      const o = accepted19(R).find((z) => z !== w && (z.withdrawn.y < w.withdrawn.y || (z.withdrawn.y === w.withdrawn.y && z.withdrawn.x < w.withdrawn.x)));
      o.extTourDelta = w.extTourDelta;
      o.extTourAfter = w.extTourAfter;
      o.after = JSON.parse(JSON.stringify(w.after));
    }),
    "tie-break|raster order|reproducible");
  run("r19/MF1-the-winner-swapped-to-a-candidate-the-published-order-ranks-after-it",
    taken19((R) => accepted19(R).length > 1 && runnerUp19(R)),
    recov19((R) => {
      const w = winner19(R);
      const o = runnerUp19(R);
      const v = w.verdict;
      w.verdict = o.verdict;
      o.verdict = v;
      R.taken.withdrawn = { x: o.withdrawn.x, y: o.withdrawn.y };
      R.taken.kind = o.kind;
    }),
    "tie-break|composeOpts|withdrawn|extTourDelta");
  /** an accepted candidate that ties the winner on the tour, so the next key decides */
  const tourTwin19 = (R) => accepted19(R).find((o) => o !== winner19(R) && o.extTourDelta === winner19(R).extTourDelta && o.after);
  run("r19/MF1-interior-key-inverted-on-a-candidate-that-ties-the-winner-on-the-tour",
    taken19((R) => !!tourTwin19(R)),
    recov19((R) => { tourTwin19(R).after.interior = R.after.interior + 40; }),
    "tie-break|most interior|panels");
  run("r19/MF1-face-key-inverted-on-a-candidate-that-ties-the-winner-on-the-tour",
    taken19((R) => !!tourTwin19(R) && typeof tourTwin19(R).after.face === "number"),
    recov19((R) => { tourTwin19(R).after.face = R.after.face + 600; }),
    "tie-break|strongest face|panels");

  // ---- O8: the extension tour ---------------------------------------------
  run("r19/O8-extTourAfter-off-the-board-it-is-the-tour-of",
    taken19((R) => typeof R.extTourAfter === "number"),
    recov19((R) => { R.extTourAfter += 37; R.extTourDelta += 37; }),
    "extension tour over the board this room SHIPS|extTourAfter");
  run("r19/O8-the-whole-tour-shifted-with-its-delta-preserved",
    taken19((R) => typeof R.extTourAfter === "number"),
    recov19((R) => {
      R.extTourBefore += 100;
      R.extTourAfter += 100;
      for (const o of R.offered) if (typeof o.extTourAfter === "number") o.extTourAfter += 100;
    }),
    "extension tour over the board this room SHIPS|ends at");
  run("r19/O8-a-refused-candidate-tour-deflated-below-anything-this-room-can-walk",
    taken19((R) => refused19(R) && typeof refused19(R).extTourDelta === "number"),
    recov19((R) => { const o = refused19(R); o.extTourDelta = -350; o.extTourAfter = R.extTourBefore - 350; }),
    "cheapest|bare terrain|extTourAfter|tie-break");
  run("r19/O8-the-TAKEN-candidate-tour-moved-off-the-shipped-board",
    taken19((R) => typeof winner19(R)?.extTourAfter === "number"),
    recov19((R) => { winner19(R).extTourAfter += 55; winner19(R).extTourDelta += 55; }),
    "TAKEN candidate|tour|ships");

  // ---- O2: what was withdrawn, and out of what -----------------------------
  run("r19/O2-taken-kind-swapped-against-the-board-s-own-compose-options",
    taken19((R, p) => p.meta?.composeOpts?.forbidObserverSeat && R.taken.kind === "observer"),
    recov19((R) => { R.taken.kind = "extension"; }),
    "composeOpts|withdrew|criticism 74");
  run("r19/O2-taken-kind-swapped-the-other-way",
    taken19((R, p) => p.meta?.composeOpts?.forbidExtSeat && R.taken.kind === "extension"),
    recov19((R) => { R.taken.kind = "observer"; }),
    "composeOpts|withdrew|kindsAttempted");
  run("r19/O2-a-pocket-with-more-deep-floor-in-it-than-floor",
    taken19((R) => Array.isArray(R.pockets) && R.pockets.length),
    recov19((R) => { R.pockets[0].deep = 50; }),
    "DEEP tiles are some of the tiles|pockets");
  run("r19/O2-a-pocket-inflated-off-the-partition-of-the-seal-the-pass-read",
    taken19((R) => Array.isArray(R.pockets) && R.pockets.length && R.before),
    recov19((R) => { R.pockets[0].tiles = R.pockets[0].tiles + 40; R.pockets[0].deep = R.pockets[0].deep + 40; }),
    "accounts for|components of that seal|pockets");
  run("r19/O2-a-pocket-deflated-under-what-the-take-took-out-of-it",
    taken19((R) => Array.isArray(R.pockets) && R.pockets.length && R.recoveredTiles > 1),
    recov19((R) => { R.pockets[0].tiles = 1; R.pockets[0].deep = 1; }),
    "accounts for|holds|recover");
  run("r19/O2-a-whole-pocket-dropped-from-the-census",
    taken19((R) => Array.isArray(R.pockets) && R.pockets.length > 1),
    recov19((R) => { R.pockets.pop(); }),
    "accounts for|components of that seal|pockets");
  run("r19/O2-the-take-credited-with-a-pocket-the-census-does-not-name",
    taken19((R) => R.taken && Array.isArray(R.taken.pockets) && R.taken.pockets.length),
    recov19((R) => { R.taken.pockets.push({ at: { x: 3, y: 3 }, tiles: 2, deep: 2, recoveredTiles: 2 }); }),
    "census names none there|taken.pockets");
  run("r19/O2-the-gross-recovery-inflated-and-the-net-left-alone",
    taken19((R) => R.taken && Array.isArray(R.taken.pockets) && R.taken.pockets.length && typeof R.sealedNew === "number"),
    recov19((R) => { R.taken.pockets[0].recoveredTiles += 3; }),
    "Gross minus newly sealed|opens|returns");
  run("r19/O2-sealedNew-moved-so-the-net-vs-gross-arithmetic-stops-closing",
    taken19((R) => R.taken && Array.isArray(R.taken.pockets) && typeof R.sealedNew === "number"),
    recov19((R) => { R.sealedNew += 2; }),
    "Gross minus newly sealed|sealedNew");
  run("r19/O2-sealedNew-deleted",
    taken19((R) => typeof R.sealedNew === "number"),
    recov19((R) => { delete R.sealedNew; }),
    "sealedNew|GROSS");
  run("r19/O2-taken-pockets-deleted-so-the-take-names-no-pocket-at-all",
    taken19((R) => R.taken && Array.isArray(R.taken.pockets)),
    recov19((R) => { delete R.taken.pockets; }),
    "taken.pockets|pockets it opened");
  run("r19/O2-a-pocket-listed-as-opened-that-gave-nothing-back",
    taken19((R) => R.taken && Array.isArray(R.taken.pockets) && R.taken.pockets.length),
    recov19((R) => { R.taken.pockets[0].recoveredTiles = 0; }),
    "OPENED|returns 0|Gross");
  run("r19/O1-a-room-that-took-nothing-with-a-pocket-census-that-is-not-the-board-s",
    withRecov19((R) => R.outcome !== "taken" && Array.isArray(R.pockets) && R.pockets.length),
    recov19((R) => { R.pockets[0].tiles += 9; R.pockets[0].deep += 9; }),
    "meta.sealedFloor.pockets|re-derives|standing on the board");
  run("r19/O1-belowThreshold-in-a-room-whose-whole-seal-clears-the-threshold",
    withRecov19((R) => R.outcome === "belowThreshold"),
    recov19((R, p) => { R.sealedDeep = 9; if (p.meta.sealedFloor) p.meta.sealedFloor.deep = 9; }),
    "at or over the threshold|composed|seal");
  run("r19/O1-belowThreshold-publishing-a-seal-the-board-does-not-have",
    withRecov19((R) => R.outcome === "belowThreshold" && typeof R.sealedDeep === "number"),
    recov19((R) => { R.sealedDeep = Math.max(0, R.sealedDeep - 1); }),
    "meta.sealedFloor|re-derived|seals");
  run("r19/O1-belowThreshold-with-its-board-seal-deleted-from-the-record",
    withRecov19((R) => R.outcome === "belowThreshold" && typeof R.sealedTiles === "number"),
    recov19((R) => { delete R.sealedTiles; }),
    "sealedTiles|refuses on the room's whole seal");
  run("r19/O1-allRefused-with-an-accepting-verdict-under-it",
    withRecov19((R) => R.outcome === "allRefused" && (R.offered || []).some((o) => o && o.withdrawn)),
    recov19((R) => { R.offered.find((o) => o && o.withdrawn).verdict = "accepted, not taken: 2 candidate(s) cleared the panel"; }),
    "allRefused|accepting verdict");
  run("r19/O1-allRefused-summary-that-does-not-quote-the-candidates-it-refused",
    withRecov19((R) => R.outcome === "allRefused"),
    recov19((R) => { const e = R.offered.filter((o) => o && !o.withdrawn)[0]; e.verdict = "this room ships the plan it would have shipped without this pass"; }),
    "summary refusal|quote|prefix");

  // ---- O9: the belowThreshold verdict --------------------------------------
  run("r19/O9-belowThreshold-verdict-rewritten-as-a-fixed-geometry-claim",
    withRecov19((R) => R.outcome === "belowThreshold"),
    recov19((R) => { R.offered[0].verdict = "this pocket's holders are all fixed geometry (lab, tower, spawn) and this pass re-seats nothing else"; }),
    "fixed geometry|belowThreshold");
  run("r19/O9-belowThreshold-verdict-stripped-of-the-numbers-it-is-made-of",
    withRecov19((R) => R.outcome === "belowThreshold"),
    recov19((R) => { R.offered[0].verdict = "no single structure in this room holds enough sealed floor shut to be worth moving"; }),
    "threshold|best single-structure|quote");
  run("r19/O9-belowThreshold-verdict-quoting-a-recovery-the-board-does-not-offer",
    withRecov19((R) => R.outcome === "belowThreshold" && R.bestDeepAnywhere >= 1),
    recov19((R) => { R.offered[0].verdict = R.offered[0].verdict.replace(/is \d+ deep tile\(s\)/, "is 0 deep tile(s)"); }),
    "best single-structure|quote|deep");

  // ---- MF3: the record deleted where the pass SUCCEEDED --------------------
  run("r19/MF3-whole-recovery-record-deleted-in-a-room-whose-take-cleared-the-seal",
    taken19((R, p) => !p.meta?.sealedFloor),
    (p) => {
      const i = (p.meta.noteRecords || []).findIndex((e) => e && e.cls === "sealedRecovery");
      if (i >= 0) { p.meta.noteRecords.splice(i, 1); p.meta.notes.splice(i, 1); }
      p.meta.noteObligations = (p.meta.noteObligations || []).filter((o) => o && o.cls !== "sealedRecovery");
      delete p.meta.sealedRecovery;
    },
    "SCHEMA|sealedRecovery|composeOpts");
  run("r19/MF3-composeOpts-withdrawal-deleted-so-the-take-explains-no-board",
    taken19((R, p) => !!p.meta?.composeOpts),
    (p) => { delete p.meta.composeOpts.forbidExtSeat; delete p.meta.composeOpts.forbidObserverSeat; },
    "composeOpts|withdrawal|withdrawn");
  run("r19/MF3-composeOpts-withdrawal-moved-to-a-tile-the-record-does-not-name",
    taken19((R, p) => !!(p.meta?.composeOpts?.forbidExtSeat || p.meta?.composeOpts?.forbidObserverSeat)),
    (p) => {
      const o = p.meta.composeOpts;
      const f = o.forbidExtSeat ? "forbidExtSeat" : "forbidObserverSeat";
      o[f] = { x: o[f].x + 1, y: o[f].y + 1 };
    },
    "composeOpts|composed WITHOUT");
  run("r19/MF3-composeOpts-deleted-whole",
    taken19(),
    (p) => { delete p.meta.composeOpts; },
    "SCHEMA|composeOpts");
  // ROUND 20 / OL5 — both of these are re-pointed onto the LIST shape the
  // fixpoint made of `forbidExtSeat`/`forbidObserverSeat`, and the second one
  // is now the claim it was always making: a withdrawal on the board's build
  // arguments that no run of the pass took.
  run("r19/MF3-a-withdrawal-option-on-a-room-that-records-no-take",
    withRecov19((R) => R.outcome === "belowThreshold"),
    (p) => { p.meta.composeOpts = { ...(p.meta.composeOpts || {}), forbidExtSeat: [{ x: 20, y: 20 }] }; },
    "composeOpts|withdrawal|taking|roster");
  run("r19/MF3-both-withdrawal-options-set-at-once",
    taken19((R, p) => Array.isArray(p.meta?.composeOpts?.forbidExtSeat)),
    (p) => { p.meta.composeOpts.forbidObserverSeat = [{ x: 21, y: 21 }]; },
    "roster|composeOpts|withdrawal");

  // ---- MF2: lane.dropped, anchored ----------------------------------------
  run("r19/MF2-lane-dropped-flipped-false-and-the-six-nulls-taken-in-all-three-copies",
    laneRoom19((L) => L.dropped === true),
    lane19((L, p) => {
      for (const C of [L, p.meta.walls.mobility.lanes, p.meta.extensions.laneMeta]) {
        C.dropped = false;
        C.droppedFor = null;
        C.wanted = null;
        C.wantedBound = null;
        C.cost = null;
        C.premium = null;
        C.gain = null;
      }
    }),
    "roundCap|dropped|null");
  run("r19/MF2-lane-dropped-flipped-in-the-declaration-alone",
    laneRoom19((L) => L.dropped === true),
    lane19((L) => { L.dropped = false; L.droppedFor = null; }),
    "roundCap|dropped|publication");
  run("r19/MF2-lane-dropped-flipped-in-layer-6-s-own-publication-alone",
    laneRoom19((L, p) => L.dropped === true && p.meta?.walls?.mobility?.lanes),
    lane19((L, p) => { p.meta.walls.mobility.lanes.dropped = false; p.meta.extensions.laneMeta.dropped = false; }),
    "roundCap|dropped|declaration");
  run("r19/MF2-roundCap-moved-off-the-drop-it-records",
    laneRoom19((L, p) => L.dropped === true && p.meta?.walls?.mobility?.lanes),
    lane19((L, p) => { p.meta.walls.mobility.lanes.roundCap = 10; p.meta.extensions.laneMeta.roundCap = 10; }),
    "roundCap|dropped|round");
  run("r19/MF2-roundCap-deleted",
    laneRoom19((L, p) => !!p.meta?.walls?.mobility?.lanes),
    lane19((L, p) => { delete p.meta.walls.mobility.lanes.roundCap; delete p.meta.extensions.laneMeta.roundCap; }),
    "roundCap|SCHEMA");
  run("r19/MF2-a-dropped-reservation-that-still-reserves-floor",
    laneRoom19((L) => L.dropped === true),
    lane19((L, p) => {
      for (const C of [L, p.meta.walls.mobility.lanes, p.meta.extensions.laneMeta]) { C.tiles = 12; C.deep = 4; C.rounds = 3; }
    }),
    "DROPPED|reserve|reservation");

  // ---- MF5: the four thrice-published lane leaves --------------------------
  for (const f of ["cost", "premium", "gain", "wantedBound"]) {
    run(`r19/MF5-lane-${f}-moved-in-the-declaration-alone`,
      laneRoom19((L) => typeof L[f] === "number"),
      lane19((L) => { L[f] = L[f] * 3 + 1; }),
      "lanes\\." + f + "|does not agree|mirror|@meta");
    run(`r19/MF5-lane-${f}-moved-in-layer-6-s-publication-alone`,
      laneRoom19((L, p) => typeof L[f] === "number" && p.meta?.walls?.mobility?.lanes),
      lane19((L, p) => { p.meta.walls.mobility.lanes[f] = L[f] * 3 + 1; }),
      "lane-anchor|lanes\\." + f + "|@meta");
  }

  // ---- MF4: the crossing's own content ------------------------------------
  run("r19/MF4-a-crossing-reduced-to-a-bare-destination",
    crossRoom19(() => true),
    (p) => { p.meta.towers.adjacency.crossings = p.meta.towers.adjacency.crossings.map((c) => ({ to: { x: c.to.x, y: c.to.y } })); },
    "pass|readings that proved it|does not carry");
  run("r19/MF4-pass-relabelled-so-the-panel-cross-check-switches-itself-off",
    crossRoom19((c) => c.pass === "acrossPriorTake"),
    cross19((c) => c.pass === "acrossPriorTake", (c) => { c.pass = "refill"; c.refillTotalTo = 1; c.refillWalksTo = [0, 0, 0, 0, 0, 0]; c.faceTo = 9999; }),
    "pass|take put a tower|filed under another pass");
  run("r19/MF4-pass-deleted",
    crossRoom19(() => true),
    cross19(() => true, (c) => { delete c.pass; }),
    "pass|two passes that can cross");
  run("r19/MF4-a-published-reading-deleted",
    crossRoom19((c) => Array.isArray(c.refillWalksTo)),
    cross19((c) => Array.isArray(c.refillWalksTo), (c) => { delete c.refillWalksTo; }),
    "refillWalksTo|does not carry|not a reading that agrees");
  run("r19/MF4-the-neighbour-roster-deleted",
    crossRoom19((c) => Array.isArray(c.neighbours)),
    cross19((c) => Array.isArray(c.neighbours), (c) => { delete c.neighbours; }),
    "neighbours|roster");
  run("r19/MF4-basis-replaced-with-free-text",
    crossRoom19((c) => typeof c.basis === "string"),
    cross19((c) => typeof c.basis === "string", (c) => { c.basis = "nothing here was measured at all."; }),
    "basis|sentence its own pass writes");
  run("r19/MF4-basis-deleted",
    crossRoom19((c) => typeof c.basis === "string"),
    cross19((c) => typeof c.basis === "string", (c) => { delete c.basis; }),
    "basis|does not carry");
  run("r19/MF4-why-deleted",
    crossRoom19((c) => c.why !== undefined),
    cross19((c) => c.why !== undefined, (c) => { delete c.why; }),
    "why|does not carry");
  run("r19/MF4-refillFrom-inflated-into-a-saving-the-pass-did-not-make",
    crossRoom19((c) => typeof c.refillFrom === "number"),
    cross19((c) => typeof c.refillFrom === "number", (c) => { c.refillFrom = 99; }),
    "refillFrom|refill walk|start further out");
  run("r19/MF4-window-inflated-past-a-5x5",
    crossRoom19((c) => typeof c.window === "number"),
    cross19((c) => typeof c.window === "number", (c) => { c.window = 999; }),
    "window|5x5");
  run("r19/MF4-the-entry-duplicated-verbatim",
    crossRoom19(() => true),
    (p) => { const cs = p.meta.towers.adjacency.crossings; cs.push(JSON.parse(JSON.stringify(cs[0]))); },
    "same entry twice|duplicate");
  run("r19/MF4-an-extra-reading-nothing-names",
    crossRoom19(() => true),
    cross19(() => true, (c) => { c.faceSaved = 1200; }),
    "faceSaved|does not write|unnamed reading");
  run("r19/MF4-a-refill-crossing-claiming-the-take-s-destination",
    crossRoom19((c) => c.pass === "acrossPriorTake"),
    cross19((c) => c.pass === "acrossPriorTake", (c, cs) => { cs.push({ pass: "refill", from: { x: c.from.x, y: c.from.y }, to: { x: c.to.x, y: c.to.y }, refillFrom: 5, refillTo: 4, window: 3 }); }),
    "filed under another pass|pass|crossing");

  // ---- MF6: the two residues ----------------------------------------------
  for (const f of ["wall", "mineral", "network", "lap"]) {
    run(`r19/MF6-labs-refused-${f}-inflated-off-its-own-census`,
      anyRoom19((p) => { const d = declOf19(p, "labs", "lab-haul"); return !!(d && d.labs && d.labs.refused && typeof d.labs.refused[f] === "number" && p.meta?.labs?.refusedCheaper); }),
      (p) => {
        const d = declOf19(p, "labs", "lab-haul");
        d.labs.refused[f] = d.labs.refused[f] * 3 + 7;
        d.detail = renderDecl({ ...d, detail: undefined });
      },
      "refusedCheaper|refused\\." + f + "|@meta");
    run(`r19/MF6-labs-refusedCheaper-${f}-moved-instead`,
      anyRoom19((p) => { const d = declOf19(p, "labs", "lab-haul"); return !!(d && d.labs?.refused && p.meta?.labs?.refusedCheaper && typeof p.meta.labs.refusedCheaper[f] === "number"); }),
      (p) => { p.meta.labs.refusedCheaper[f] = p.meta.labs.refusedCheaper[f] * 3 + 7; },
      "refusedCheaper|refused\\." + f + "|@meta");
  }
  run("r19/MF6-ctrlParks-every-composed-cap-rejected-and-a-winner-named-anyway",
    anyRoom19((p) => { const d = declOf19(p, "ctrlParks", "released"); return !!(d && Array.isArray(d.ctrlParks?.composedCaps)); }),
    (p) => {
      const d = declOf19(p, "ctrlParks", "released");
      const n = d.ctrlParks.composedCaps.length;
      d.ctrlParks.rejectedError = n;
      d.detail = renderDecl({ ...d, detail: undefined });
    },
    "threw out|best of them|rejection");
  run("r19/MF6-ctrlParks-three-rejection-classes-that-outnumber-the-descent",
    anyRoom19((p) => { const d = declOf19(p, "ctrlParks", "released"); return !!(d && Array.isArray(d.ctrlParks?.composedCaps)); }),
    (p) => {
      const d = declOf19(p, "ctrlParks", "released");
      d.ctrlParks.rejectedError = 7;
      d.ctrlParks.rejectedIncomplete = 7;
      d.ctrlParks.rejectedUnderFloor = 7;
      d.detail = renderDecl({ ...d, detail: undefined });
    },
    "threw out|best of them|rejection");

  // ---- MF7: the alternative rung, both directions --------------------------
  run("r19/MF7-a-rung-invented-shorter-and-no-dearer-than-the-one-that-shipped",
    ladderRoom19((L, p) => { const pk = pickedRung19(L, p); return !!(pk && L.rungs.some((r) => r.complete && r.needDeepBonus > pk.needDeepBonus && r.ramparts <= L.shippedRamparts)); }),
    ladder19((L, p) => {
      const pk = pickedRung19(L, p);
      const r = L.rungs.find((z) => z.complete && z.needDeepBonus > pk.needDeepBonus && z.ramparts <= L.shippedRamparts);
      r.mobility = 0;
    }),
    "shorter and no dearer|walk's own rule|rung");
  run("r19/MF7-a-rung-invented-inside-the-price-the-record-publishes",
    ladderRoom19((L, p) => { const pk = pickedRung19(L, p); return !!(pk && L.shippedLap > L.buyFloor && L.rungs.some((r) => r.complete && r.needDeepBonus > pk.needDeepBonus)); }),
    ladder19((L, p) => {
      const pk = pickedRung19(L, p);
      const r = L.rungs.find((z) => z.complete && z.needDeepBonus > pk.needDeepBonus);
      r.mobility = 0;
      r.ramparts = L.rungs[0].ramparts;
    }),
    "mobility price allows|walk|rung");
  run("r19/MF7-a-rung-cheaper-in-ramparts-and-no-longer-that-did-not-ship",
    ladderRoom19((L, p) => { const pk = pickedRung19(L, p); return !!(pk && L.rungs.some((r) => r.complete && r.needDeepBonus > pk.needDeepBonus)); }),
    ladder19((L, p) => {
      const pk = pickedRung19(L, p);
      const r = L.rungs.find((z) => z.complete && z.needDeepBonus > pk.needDeepBonus);
      r.ramparts = L.shippedRamparts - 1;
      r.mobility = L.shippedLap;
    }),
    "Upkeep is the walk's first objective|fewer ramparts|rung");
  run("r19/MF7-the-first-rung-s-lap-moved-off-the-escalation-record",
    ladderRoom19((L, p) => !!p.meta?.shellEscalation && typeof p.meta.shellEscalation.mobilityFirst === "number"),
    ladder19((L) => { L.rungs[0].mobility = L.rungs[0].mobility + 3; }),
    "cheapest composition laps|first rung");
  run("r19/MF7-the-first-rung-s-rampart-bill-moved-off-the-escalation-record",
    ladderRoom19((L, p) => !!p.meta?.shellEscalation && typeof p.meta.shellEscalation.saved === "number"),
    ladder19((L) => { L.rungs[0].ramparts = L.rungs[0].ramparts + 5; }),
    "SAVED|first rung|ramparts");
  run("r19/MF7-the-shipped-rung-s-lap-moved-off-the-board",
    ladderRoom19((L, p) => !!pickedRung19(L, p)),
    ladder19((L, p) => { pickedRung19(L, p).mobility = 0; }),
    "rung this room shipped|escalation record|lap");
  run("r19/MF7-the-rung-that-shipped-erased-from-the-table",
    ladderRoom19((L, p) => !!pickedRung19(L, p) && L.rungs.length > 1),
    ladder19((L, p) => { const pk = pickedRung19(L, p); pk.needDeepBonus = 999; }),
    "names no such rung|shipped");
  run("r19/MF7-an-incomplete-rung-with-the-walk-carrying-on-past-it",
    ladderRoom19((L) => L.rungs.length > 1 && L.rungs.every((r) => r.complete)),
    ladder19((L) => { L.rungs[0].complete = false; }),
    "INCOMPLETE|ends the walk|first rung|cheapest composition");
  run("r19/MF7-a-rung-with-no-mobility-in-it-at-all",
    ladderRoom19((L) => L.rungs.length > 0),
    ladder19((L) => { delete L.rungs[L.rungs.length - 1].mobility; }),
    "a rung is the bonus it asked for|rung");
  run("r19/MF7-a-rung-with-no-needDeepBonus-in-it",
    ladderRoom19((L) => L.rungs.length > 0),
    ladder19((L) => { delete L.rungs[L.rungs.length - 1].needDeepBonus; }),
    "a rung is the bonus it asked for|rung");

  // ---- O7: a priced refusal is a trade the room could still make -----------
  const rbRoom19 = (pred) => anyRoom19((p) => {
    const e = (p.meta.noteRecords || []).find((z) => z && z.cls === "shallowExt");
    return !!(e && e.rec && e.rec.lap && Array.isArray(p.meta?.walls?.reflow?.boundRollback) && pred(e.rec.lap, p));
  });
  const rbNote19 = (edit) => (p) => {
    const i = (p.meta.noteRecords || []).findIndex((z) => z && z.cls === "shallowExt");
    if (i < 0) throw new Error("no shallowExt note record");
    edit(p.meta.noteRecords[i].rec, p);
    regen19(p);
  };
  run("r19/O7-the-refusal-clause-re-priced-on-the-pre-7b-board",
    rbRoom19((lap, p) => p.meta.walls.reflow.boundRollback.some((m) => !(p.meta.walls.reflow.shallow || []).some((t) => t.x === m.from.x && t.y === m.from.y))),
    rbNote19((rec, p) => {
      rec.lap.rollback = p.meta.walls.reflow.boundRollback.map((m) => ({ from: { x: m.from.x, y: m.from.y }, to: { x: m.to.x, y: m.to.y }, wouldLap: m.wouldLap }));
    }),
    "STILL SHIPS|ships no shallow extension there|bound-rollback");
  run("r19/O7-a-priced-refused-slot-the-room-does-not-ship-shallow",
    rbRoom19((lap) => (lap.rollback || []).length),
    rbNote19((rec) => { rec.lap.rollback[0].from = { x: 3, y: 3 }; }),
    "ships no shallow extension there|bound-rollback");
  run("r19/O7-a-priced-refusal-dropped-for-a-slot-the-room-still-has",
    rbRoom19((lap) => (lap.rollback || []).length),
    rbNote19((rec) => { rec.lap.rollback = []; }),
    "bound-rollback|STILL SHIPS");
  run("r19/O7-layer-7b-s-shallow-census-widened-off-the-board",
    anyRoom19((p) => Array.isArray(p.meta?.walls?.reflow?.shallow)),
    (p) => { p.meta.walls.reflow.shallow = [...p.meta.walls.reflow.shallow, { x: 25, y: 25 }]; },
    "reflow.shallow|depth-4 floor|shallow");
}

// ===========================================================================
// ROUND 20 — the two reviewers' rosters, one case each (and the harder
// variants the fixes invited).
// ===========================================================================
// MECHANICAL: MF2 the lane round cap, which was held to "is a number" in every
// room with no mobility declaration and described by a hand census that was
// false in seven rooms; MF3 `crossings[].window` on a 0..25 range with its own
// board-derived twin beside it; MF4 the two presence gaps — `meta.shellEscalation`
// [r22-waived: a round-18 finding's own measurement, on the build it was found
// on — the anchor is in REQUIRED_META now and the deletion fails.]
// (the ladder's only anchor, deletable in all 155 rooms that carry it) and the
// lane census itself (deleting `meta.walls.mobility.lanes` falsified the
// condition twenty lane fields were required under).
// OWNER: OM1 the candidate set — "a candidate is a structure standing D8 of a
// pocket" was the holders-only implementation asserted as a necessity, and the
// candidates are every movable seat the room ships now, so the invariant is a
// census of the board; OL5 the pass runs to a FIXPOINT, so the record is a
// chain and the withdrawals are a list.
{
  const any20 = (pred) => plans.find((p) => { try { return pred(p); } catch { return false; } })?.room || null;
  const regen20 = (p) => {
    for (let i = 0; i < (p.meta.noteRecords || []).length; i++) {
      try { p.meta.notes[i] = renderNote(p.meta.noteRecords[i]); } catch { /* a throwing record is its own failure */ }
    }
  };
  const recov20 = (edit) => (p) => {
    const R = p.meta.sealedRecovery;
    if (!R) throw new Error("no sealedRecovery");
    edit(R, p);
    const i = (p.meta.noteRecords || []).findIndex((e) => e && e.cls === "sealedRecovery");
    if (i >= 0) p.meta.noteRecords[i].rec = R;
    regen20(p);
  };
  const recovRoom20 = (pred) => any20((p) => (p.meta?.sealedRecovery ? pred(p.meta.sealedRecovery, p) : false));
  const takenRoom20 = (pred) => recovRoom20((R, p) => R.outcome === "taken" && (!pred || pred(R, p)));
  /** a room whose recovery record took NOTHING — its census is the shipped board's */
  const refusedRoom20 = (pred) => recovRoom20((R, p) => R.outcome === "allRefused" && (!pred || pred(R, p)));
  const lane20 = (p) => p.meta?.walls?.mobility?.lanes;
  const laneRoom20 = (pred) => any20((p) => { const L = lane20(p); return !!(L && pred(L, p)); });
  /** both copies at once — the exploit that survives a single-place edit */
  const bothLanes20 = (edit) => (p) => {
    edit(p.meta.walls.mobility.lanes, p);
    edit(p.meta.extensions.laneMeta, p);
    regen20(p);
  };
  const crossRoom20 = (pred) => any20((p) => (p.meta?.towers?.adjacency?.crossings || []).some(pred));
  const cross20 = (pick, edit) => (p) => {
    const c = (p.meta?.towers?.adjacency?.crossings || []).find(pick);
    if (!c) throw new Error("no matching crossing");
    edit(c, p);
  };
  const ladderRoom20 = (pred) =>
    any20((p) => {
      const d = (p.meta?.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs) && s.ladder.rungs.length);
      return !!(d && p.meta?.shellEscalation && (!pred || pred(d.ladder, p)));
    });

  // ---- MF2: the round cap, which is a three-branch function of its own record
  run("r20/MF2-roundCap-x3+1-in-a-room-with-no-mobility-declaration",
    laneRoom20((L, p) => L.roundCap > 0 && !(p.meta?.shortfalls || []).some((s) => s.gate === "mobility" && !s.kind)),
    bothLanes20((L) => { L.roundCap = L.roundCap * 3 + 1; }),
    "roundCap|lane-anchor");
  run("r20/MF2-roundCap-zeroed-without-the-drop-it-would-be-recording",
    laneRoom20((L) => L.roundCap > 0 && L.dropped !== true),
    bothLanes20((L) => { L.roundCap = 0; }),
    "roundCap|DROPPED|lane-anchor");
  run("r20/MF2-a-shrunk-reservation-whose-cap-is-not-the-shrink-it-published",
    laneRoom20((L) => L.shrunk && typeof L.shrunk.to === "number"),
    bothLanes20((L) => { L.roundCap = L.shrunk.to + 1; }),
    "roundCap|shrunk");
  run("r20/MF2-the-shrink-ladder-started-somewhere-layer-6-does-not",
    laneRoom20((L) => L.shrunk && typeof L.shrunk.from === "number"),
    bothLanes20((L) => { L.shrunk.from = 99; }),
    "shrunk.from|LANE_ROUNDS");
  run("r20/MF2-an-unshrunk-reservation-capped-under-LANE_ROUNDS",
    laneRoom20((L) => !L.shrunk && L.roundCap > 1 && L.dropped !== true),
    bothLanes20((L) => { L.roundCap -= 1; }),
    "roundCap|LANE_ROUNDS");
  run("r20/MF2-more-rounds-run-than-the-cap-allows",
    laneRoom20((L) => typeof L.rounds === "number" && L.roundCap > 0),
    bothLanes20((L) => { L.rounds = L.roundCap + 3; }),
    "round\\(s\\) under a cap|roundCap");

  // ---- MF4: the lane census itself, and the escalation trail ---------------
  run("r20/MF4-the-whole-lane-census-deleted-in-a-non-declaring-room",
    laneRoom20((L, p) => !(p.meta?.shortfalls || []).some((s) => s.gate === "mobility" && !s.kind)),
    (p) => { delete p.meta.walls.mobility.lanes; },
    "meta.walls.mobility.lanes");
  run("r20/MF4-the-second-lane-copy-deleted",
    laneRoom20(() => true),
    (p) => { delete p.meta.extensions.laneMeta; },
    "laneMeta");
  run("r20/MF4-the-lane-census-published-without-its-cap",
    laneRoom20(() => true),
    (p) => { delete p.meta.walls.mobility.lanes.roundCap; delete p.meta.extensions.laneMeta.roundCap; },
    "roundCap|meta.walls.mobility.lanes");
  run("r20/MF4-shellEscalation-deleted-in-a-ladder-room",
    ladderRoom20(),
    (p) => { delete p.meta.shellEscalation; },
    "shellEscalation");
  run("r20/MF4-shellEscalation-published-as-a-string-in-a-ladder-room",
    ladderRoom20(),
    (p) => { p.meta.shellEscalation = "walked"; },
    "shellEscalation");
  run("r20/MF4-shellEscalation-stripped-of-the-two-rungs-it-pins",
    ladderRoom20(),
    (p) => { delete p.meta.shellEscalation.mobilityFirst; delete p.meta.shellEscalation.pickedNeedDeepBonus; },
    "shellEscalation");

  // ---- MF3: the crossing's window -----------------------------------------
  run("r20/MF3-crossing-window-inflated-to-the-top-of-the-old-range",
    crossRoom20((c) => typeof c.window === "number"),
    cross20((c) => typeof c.window === "number", (c) => { c.window = 25; }),
    "window");
  run("r20/MF3-crossing-window-deflated-by-one",
    crossRoom20((c) => typeof c.window === "number"),
    cross20((c) => typeof c.window === "number", (c) => { c.window -= 1; }),
    "window");
  run("r20/MF3-crossing-window-inflated-by-one",
    crossRoom20((c) => typeof c.window === "number"),
    cross20((c) => typeof c.window === "number", (c) => { c.window += 1; }),
    "window");
  run("r20/MF3-crossing-window-and-the-dispersion-twin-moved-together",
    crossRoom20((c) => typeof c.window === "number"),
    (p) => {
      const c = (p.meta.towers.adjacency.crossings || []).find((z) => typeof z.window === "number");
      if (!c) throw new Error("no windowed crossing");
      c.window += 4;
      p.meta.towers.towerDispersion.after += 4;
    },
    "window|DISPERSION");

  // ---- OM1: the candidate set is a census of the board ---------------------
  run("r20/OM1-the-candidate-count-cut-back-to-the-holders-only-shortlist",
    recovRoom20((R) => R.outcome !== "belowThreshold" && typeof R.movableHolders === "number" && R.candidates > R.movableHolders),
    recov20((R) => {
      R.candidates = R.movableHolders;
      R.tried = R.movableHolders;
      R.offered = R.offered.filter((o) => !o.withdrawn || o.holder === true);
    }),
    "seat census|candidate|EVERY movable seat");
  run("r20/OM1-the-seat-census-inflated-past-the-RCL8-program",
    recovRoom20((R) => R.seats && typeof R.seats.extension === "number"),
    recov20((R) => { R.seats.extension += 3; R.candidates += 3; R.tried += 3; }),
    "seats|RCL8 program|priced entr");
  run("r20/OM1-the-seat-census-deleted",
    recovRoom20((R) => !!R.seats),
    recov20((R) => { delete R.seats; }),
    "seats");
  run("r20/OM1-a-seat-census-published-by-the-branch-that-composes-nothing",
    recovRoom20((R) => R.outcome === "belowThreshold"),
    recov20((R) => { R.seats = { extension: 60, observer: 1 }; R.movableHolders = 0; }),
    "belowThreshold");
  run("r20/OM1-one-priced-entry-dropped-off-the-roster",
    refusedRoom20((R) => (R.offered || []).filter((o) => o && o.withdrawn).length > 2),
    recov20((R) => {
      const i = R.offered.findIndex((o) => o && o.withdrawn && o.holder !== true);
      R.offered.splice(i, 1);
      R.candidates -= 1;
      R.tried -= 1;
      R.seats.extension -= 1;
    }),
    "prices no withdrawal|seats|RCL8 program");
  run("r20/OM1-a-priced-entry-moved-onto-a-tile-this-room-seats-nothing-on",
    refusedRoom20((R) => (R.offered || []).some((o) => o && o.withdrawn)),
    recov20((R) => { const o = R.offered.find((z) => z && z.withdrawn && z.holder !== true) || R.offered.find((z) => z && z.withdrawn); o.withdrawn = { x: 3, y: 3 }; }),
    "ships no seat of that class|prices no withdrawal|does not ship");
  run("r20/OM1-a-non-holder-seat-relabelled-as-a-holder",
    refusedRoom20((R) => (R.offered || []).some((o) => o && o.withdrawn && o.holder === false)),
    recov20((R) => { R.offered.find((o) => o && o.holder === false).holder = true; }),
    "holder|re-derives");
  run("r20/OM1-a-holder-seat-relabelled-as-a-non-holder",
    refusedRoom20((R) => (R.offered || []).some((o) => o && o.withdrawn && o.holder === true)),
    recov20((R) => { const o = R.offered.find((z) => z && z.holder === true); o.holder = false; }),
    "holder|recoversDeep|re-derives");
  run("r20/OM1-a-seat-that-holds-nothing-claiming-a-counterfactual",
    refusedRoom20((R) => (R.offered || []).some((o) => o && o.withdrawn && o.holder === false)),
    recov20((R) => { R.offered.find((o) => o && o.holder === false).recoversDeep = 7; }),
    "holder|opens nothing|recoversDeep");
  run("r20/OM1-the-holder-annotation-deleted-off-every-priced-entry",
    recovRoom20((R) => (R.offered || []).some((o) => o && o.withdrawn && typeof o.holder === "boolean")),
    recov20((R) => { for (const o of R.offered) delete o.holder; }),
    "holder");
  run("r20/OM1-the-observer-seat-counted-twice-in-the-census",
    recovRoom20((R) => R.seats && typeof R.seats.observer === "number"),
    recov20((R) => { R.seats.observer += 1; R.candidates += 1; R.tried += 1; }),
    "seats|RCL8 program|priced entr");
  run("r20/OM1-movableHolders-inflated-to-the-whole-candidate-list",
    refusedRoom20((R) => typeof R.movableHolders === "number" && R.movableHolders < R.candidates),
    recov20((R) => { R.movableHolders = R.candidates; }),
    "movableHolders");
  run("r20/OM1-movableHolders-deleted",
    recovRoom20((R) => typeof R.movableHolders === "number"),
    recov20((R) => { delete R.movableHolders; }),
    "movableHolders");
  run("r20/OM1-movableHolders-raised-past-the-pocket-census-in-a-taken-room",
    takenRoom20((R) => typeof R.movableHolders === "number" && Array.isArray(R.pockets)),
    recov20((R) => { R.movableHolders = R.pockets.reduce((a, pk) => a + (pk.movable || 0), 0) + 1; }),
    "movableHolders");

  // ---- OM1: the leaves the widened record left unheld ----------------------
  // Found by this cluster's own x3+1/delete sweep over the whole recovery
  // surface (4062 mutants, notes re-rendered): 380 escapes on the first pass,
  // 55 on the last, and everything below is one of the classes that closed.
  run("r20/OM1-the-tour-anchor-every-delta-is-a-difference-from",
    recovRoom20((R) => typeof R.extTourBefore === "number"),
    recov20((R) => { delete R.extTourBefore; }),
    "extTourBefore");
  run("r20/OM1-the-tour-ceiling-deleted-off-a-record-that-refuses-on-the-board",
    recovRoom20((R) => typeof R.tourSlack === "number"),
    recov20((R) => { delete R.tourSlack; }),
    "tourSlack");
  run("r20/OM1-the-accepted-count-deleted",
    recovRoom20((R) => R.outcome !== "belowThreshold" && typeof R.accepted === "number"),
    recov20((R) => { delete R.accepted; }),
    "accepted");
  run("r20/OM1-a-priced-entry-stripped-of-its-tour-reading",
    recovRoom20((R) => (R.offered || []).some((o) => o && o.before && o.after && typeof o.extTourAfter === "number")),
    recov20((R) => { const o = R.offered.find((z) => z && z.before && z.after); delete o.extTourAfter; }),
    "extTourAfter");
  run("r20/OM1-a-priced-entry-stripped-of-its-counterfactual",
    recovRoom20((R) => (R.offered || []).some((o) => o && o.before && o.after && typeof o.recoversDeep === "number")),
    recov20((R) => { const o = R.offered.find((z) => z && z.before && z.after); delete o.recoversDeep; }),
    "recoversDeep");
  run("r20/OM1-a-panel-stripped-of-the-walk-vector-the-instrument-list-does-not-name",
    recovRoom20((R) => (R.offered || []).some((o) => o && o.after && Array.isArray(o.after.refillWalks))),
    recov20((R) => { const o = R.offered.find((z) => z && z.after && Array.isArray(z.after.refillWalks)); delete o.after.refillWalks; delete o.after.refillTotal; }),
    "refillWalks|refillTotal");
  run("r20/OM1-the-pocket-census-s-movable-count-inflated-in-a-room-that-took-nothing",
    refusedRoom20((R) => (R.pockets || []).some((pk) => typeof pk.movable === "number")),
    recov20((R) => { R.pockets[0].movable = R.pockets[0].movable * 3 + 1; }),
    "pockets|movable|sealedFloor");
  run("r20/OM1-a-fixed-geometry-holder-that-holds-nothing-this-room-seals",
    refusedRoom20((R) => (R.fixedHolders || []).length),
    recov20((R) => { R.fixedHolders[0] = { ...R.fixedHolders[0], x: 3, y: 3 }; }),
    "fixedHolders");
  run("r20/OM1-a-fixed-holder-s-counterfactual-inflated",
    refusedRoom20((R) => (R.fixedHolders || []).some((f) => typeof f.recovers === "number")),
    recov20((R) => { const f = R.fixedHolders.find((z) => typeof z.recovers === "number"); f.recovers = f.recovers * 3 + 1; }),
    "fixedHolders");
  run("r20/OM1-a-fixed-holder-dropped-off-the-list",
    refusedRoom20((R) => (R.fixedHolders || []).length),
    recov20((R) => { R.fixedHolders.shift(); }),
    "fixedHolders");
  run("r20/OM1-every-candidate-priced-against-a-board-that-is-not-this-one",
    refusedRoom20((R) => (R.offered || []).some((o) => o && o.before && typeof o.before.sealedDeep === "number")),
    recov20((R) => { for (const o of R.offered) if (o && o.before) o.before = { ...o.before, sealedDeep: o.before.sealedDeep + 3, sealedTiles: o.before.sealedTiles + 3 }; }),
    "sealed floor|before");

  // ---- OL5: the fixpoint chain --------------------------------------------
  run("r20/OL5-the-second-run-of-the-pass-deleted-off-the-tail",
    recovRoom20((R) => !!R.next),
    recov20((R) => { delete R.next; R.residual.reran = false; }),
    "residual|still seals|fixpoint|roster");
  run("r20/OL5-a-take-that-stops-on-a-seal-the-pass-would-have-admitted",
    recovRoom20((R) => !!R.next),
    recov20((R) => { delete R.next; }),
    "reran|residual|still seals");
  run("r20/OL5-the-residual-deleted-off-a-take",
    recovRoom20((R) => !!R.residual),
    recov20((R) => { delete R.residual; }),
    "residual");
  run("r20/OL5-the-residual-sentence-rewritten-off-the-board-s-own-figures",
    recovRoom20((R) => R.residual && R.residual.reran === false),
    recov20((R) => { R.residual.why = "this take left nothing behind worth another run of the pass, so the pass is at its fixpoint here"; }),
    "residual.why|quote");
  run("r20/OL5-a-refusal-that-hands-the-pass-on-to-another-run",
    recovRoom20((R) => R.outcome === "allRefused"),
    recov20((R) => { R.next = JSON.parse(JSON.stringify(R)); }),
    "did not take|chain ends|residual");
  run("r20/OL5-a-fabricated-run-with-no-build-argument-behind-its-take",
    recovRoom20((R) => R.outcome === "taken" && !R.next),
    recov20((R) => {
      const copy = JSON.parse(JSON.stringify(R));
      copy.next = undefined;
      delete copy.next;
      copy.residual = { reran: false, why: copy.residual ? copy.residual.why : "at the fixpoint" };
      R.next = copy;
      if (R.residual) R.residual.reran = true;
    }),
    "roster|composeOpts|build argument");
  run("r20/OL5-the-withdrawal-list-reverted-to-round-19-s-single-tile",
    any20((p) => Array.isArray(p.meta?.composeOpts?.forbidExtSeat)),
    (p) => { p.meta.composeOpts.forbidExtSeat = p.meta.composeOpts.forbidExtSeat[0]; },
    "composeOpts");
  run("r20/OL5-a-withdrawal-on-the-board-s-arguments-that-no-run-took",
    any20((p) => Array.isArray(p.meta?.composeOpts?.forbidExtSeat)),
    (p) => { p.meta.composeOpts.forbidExtSeat = [...p.meta.composeOpts.forbidExtSeat, { x: 4, y: 4 }]; },
    "roster|composeOpts");
  run("r20/OL5-the-take-moved-off-the-tile-the-board-was-composed-without",
    takenRoom20((R, p) => Array.isArray(p.meta?.composeOpts?.forbidExtSeat) || Array.isArray(p.meta?.composeOpts?.forbidObserverSeat)),
    recov20((R) => { R.taken.withdrawn = { x: R.taken.withdrawn.x + 1, y: R.taken.withdrawn.y }; }),
    "composed WITHOUT|roster|withdrawn");
}

// ===========================================================================
// ROUND 21 — the RULING on criticism 95, and the two reviewers' rosters.
// ===========================================================================
// THE RULING: where a room's plan DECLARES a quantity, that quantity is a KEY
// in every tie-break that room's passes run — after the admission quantities,
// ahead of every priced preference, never a veto. Three obligations ship with
// it and all three are mutated here: (i) the key set is DERIVED from
// `meta.shortfalls` and published beside the ranking; (ii) a tie-break a
// declaration DECIDES says so in the room's note, runner-up named and the
// margin on both axes; (iii) it applies to EVERY pass with a tie-break, which
// is the recovery pass AND the across-prior tower swap.
// OWNER M2: `meta.walls.mobility` is layer walls' copy of a record this file
// re-derives, and `builtGated` — the gallery headline, the worst-room pick and
// the film caption — was compared with nothing.
// MECHANICAL: MF1 `kindsAttempted`, the unpinned third of the pass's rule
// triple; MF2 `sealCritical`, exactly right in 172/172 and bounded by nothing;
// Mm2 the chain's obligations hung on the producer's own `next` pointer; Mm3
// the roundCap branch read off producer keys; Mm4 the third witness to the
// park seat search; Mm5 the cut is not a sealing curve in two rooms; ML1
// `relocatedCount`.
{
  const any21 = (pred) => plans.find((p) => { try { return pred(p); } catch { return false; } })?.room || null;
  const regen21 = (p) => {
    for (let i = 0; i < (p.meta.noteRecords || []).length; i++) {
      try { p.meta.notes[i] = renderNote(p.meta.noteRecords[i]); } catch { /* a throwing record is its own failure */ }
    }
  };
  const recov21 = (edit) => (p) => {
    const R = p.meta.sealedRecovery;
    if (!R) throw new Error("no sealedRecovery");
    edit(R, p);
    const i = (p.meta.noteRecords || []).findIndex((e) => e && e.cls === "sealedRecovery");
    if (i >= 0) p.meta.noteRecords[i].rec = R;
    regen21(p);
  };
  const recovRoom21 = (pred) => any21((p) => (p.meta?.sealedRecovery ? pred(p.meta.sealedRecovery, p) : false));
  const takenRoom21 = (pred) => recovRoom21((R, p) => R.outcome === "taken" && (!pred || pred(R, p)));
  const bothLanes21 = (edit) => (p) => {
    edit(p.meta.walls.mobility.lanes, p);
    edit(p.meta.extensions.laneMeta, p);
    regen21(p);
  };
  const laneRoom21 = (pred) => any21((p) => { const L = p.meta?.walls?.mobility?.lanes; return !!(L && pred(L, p)); });
  const apRoom21 = (pred) => any21((p) => { const t = p.meta?.towers?.acrossPriorTake; return !!(t && pred(t, p)); });

  // ---- M2: the as-built mobility record, written twice and read nowhere
  const mobRoom21 = any21((p) => typeof p.meta?.walls?.mobility?.builtGated === "number" && p.meta.walls.mobility.builtGated > 1);
  run("r21/M2-the-gallery-s-as-built-gated-lap-headline-rewritten",
    mobRoom21, (p) => { p.meta.walls.mobility.builtGated = 0.5; }, "mobility-built|builtGated");
  run("r21/M2-the-headline-lap-and-its-re-derived-twin-moved-together",
    mobRoom21,
    (p) => { p.meta.walls.mobility.builtGated = 0.5; p.meta.shell.mobilityBuilt.maxGated = 0.5; },
    "mobility-built|builtGated");
  run("r21/M2-the-headline-lap-withdrawn-altogether",
    mobRoom21, (p) => { delete p.meta.walls.mobility.builtGated; }, "mobility-built|builtGated");
  run("r21/M2-the-gated-pairs-over-target-inflated-on-the-copy",
    mobRoom21, (p) => { p.meta.walls.mobility.overGated = p.meta.walls.mobility.overGated * 3 + 1; }, "mobility-built|overGated");
  run("r21/M2-the-copy-s-ungated-lap-flattered",
    mobRoom21, (p) => { p.meta.walls.mobility.built = 1; }, "mobility-built|built");
  run("r21/M2-cut-tiles-the-defender-cannot-reach-hidden-on-the-copy",
    mobRoom21, (p) => { p.meta.walls.mobility.walled = 4; }, "mobility-built|walled");

  // ---- MF1: the pass's rule triple, third leg
  const recovAny21 = recovRoom21(() => true);
  run("r21/MF1-the-pass-narrowed-to-one-class-so-the-observer-was-never-considered",
    takenRoom21((R) => Array.isArray(R.kindsAttempted) && R.kindsAttempted.length > 1),
    recov21((R) => {
      R.kindsAttempted = ["extension"];
      R.seats = { extension: 60 };
      R.offered = R.offered.filter((o) => !(o && o.withdrawn && o.kind === "observer"));
      R.candidates = 60;
      R.tried = 60;
      if (typeof R.accepted === "number") R.accepted = R.offered.filter((o) => o && (o.verdict === "TAKEN" || /^accepted, not taken/.test(String(o.verdict)))).length;
    }),
    "kindsAttempted");
  run("r21/MF1-the-pass-narrowed-to-the-observer-seat-alone",
    recovAny21, recov21((R) => { R.kindsAttempted = ["observer"]; }), "kindsAttempted");
  run("r21/MF1-a-class-the-pass-cannot-move-added-to-the-triple",
    recovAny21, recov21((R) => { R.kindsAttempted = ["extension", "observer", "tower"]; }), "kindsAttempted");
  run("r21/MF1-the-attempted-classes-withdrawn",
    recovAny21, recov21((R) => { delete R.kindsAttempted; }), "kindsAttempted");

  // ---- MF2: the seal-critical count
  const sealRoom21 = any21((p) => typeof p.meta?.shell?.sealCritical === "number" && p.meta.shell.sealCritical > 0);
  run("r21/MF2-sealCritical-zeroed-the-exploit-that-landed-in-all-172-rooms",
    sealRoom21, (p) => { p.meta.shell.sealCritical = 0; }, "sealCritical");
  run("r21/MF2-sealCritical-x3-plus-1", sealRoom21, (p) => { p.meta.shell.sealCritical = p.meta.shell.sealCritical * 3 + 1; }, "sealCritical");
  run("r21/MF2-sealCritical-off-by-one", sealRoom21, (p) => { p.meta.shell.sealCritical -= 1; }, "sealCritical");
  run("r21/MF2-sealCritical-withdrawn", sealRoom21, (p) => { delete p.meta.shell.sealCritical; }, "sealCritical");
  run("r21/MF2-sealCritical-raised-to-the-whole-declared-cut",
    any21((p) => typeof p.meta?.shell?.sealCritical === "number" && (p.meta.shell.cut || []).length > p.meta.shell.sealCritical),
    (p) => { p.meta.shell.sealCritical = p.meta.shell.cut.length; }, "sealCritical");

  // ---- Mm2: the chain, off the record's shape
  const fabNext21 = (R, p) => {
    const sf = p.meta.sealedFloor;
    R.next = {
      threshold: R.threshold,
      kindsAttempted: R.kindsAttempted,
      tourSlack: R.tourSlack,
      declaredKeys: R.declaredKeys,
      declaredSkipped: R.declaredSkipped,
      ranking: R.ranking,
      declaredKeyRule: R.declaredKeyRule,
      outcome: "belowThreshold",
      candidates: 0,
      tried: 0,
      taken: null,
      sealedTiles: sf ? sf.tiles : 0,
      sealedDeep: sf ? sf.deep : 0,
      bestDeepAnywhere: 0,
      pockets: JSON.parse(JSON.stringify(R.pockets || [])),
      offered: [{ verdict: `nothing qualified: this room's whole sealed floor is ${sf ? sf.deep : 0} deep tile(s) against a threshold of ${R.threshold}, and a withdrawal cannot give back more than the room seals (best anywhere 0)` }],
      instruments: R.instruments,
      directions: R.directions,
      walkRule: R.walkRule,
      tourRule: R.tourRule,
      basis: R.basis,
    };
    R.residual.reran = true;
  };
  run("r21/Mm2-a-run-of-the-pass-that-never-happened-appended-to-the-chain",
    takenRoom21((R) => R.next === undefined && R.residual), recov21(fabNext21), "residual|handed over|fixpoint");
  run("r21/Mm2-the-fixpoint-sentence-contradicting-its-own-reran-flag",
    takenRoom21((R) => R.next === undefined && R.residual && /fixpoint/i.test(R.residual.why)),
    recov21(fabNext21), "contradicts itself|fixpoint|residual");
  run("r21/Mm2-a-second-run-the-record-owed-cut-off-the-tail",
    takenRoom21((R) => R.next !== undefined),
    recov21((R) => { delete R.next; R.residual.reran = false; }), "residual|handed over|OWES");
  run("r21/Mm2-the-residual-sentence-rewritten-into-the-other-branch",
    takenRoom21((R) => R.residual && /fixpoint/i.test(R.residual.why)),
    recov21((R) => { R.residual.why = R.residual.why.replace(/so the pass is at its fixpoint here/, "so the pass runs again on it with this withdrawal held (see `next`)"); }),
    "residual|contradicts itself");

  // ---- Mm3: which branch the round cap came from
  run("r21/Mm3-a-priced-shrink-refusal-deleted-and-the-cap-raised-back",
    laneRoom21((L) => L.shrunk && L.stranded > 0),
    bothLanes21((L) => { delete L.shrunk; L.roundCap = 10; }), "lane-anchor");
  run("r21/Mm3-a-priced-shrink-refusal-deleted-and-its-leftovers-with-it",
    laneRoom21((L) => L.shrunk && L.stranded > 0),
    bothLanes21((L) => { delete L.shrunk; L.roundCap = 10; L.stranded = 0; }), "lane-anchor");
  run("r21/Mm3-the-shrink-moved-with-the-cap-in-both-copies",
    laneRoom21((L) => L.shrunk && L.rounds > 1),
    bothLanes21((L) => { L.shrunk.to = L.rounds - 1; L.roundCap = L.rounds - 1; }), "lane-anchor");
  run("r21/Mm3-a-shrink-that-refused-no-larger-reservation",
    laneRoom21((L) => L.shrunk), bothLanes21((L) => { L.shrunk.wanted = L.tiles; }), "lane-anchor");
  run("r21/Mm3-a-shrink-to-the-full-round-count",
    laneRoom21((L) => L.shrunk), bothLanes21((L) => { L.shrunk.to = 10; L.roundCap = 10; L.rounds = 10; }), "lane-anchor");
  run("r21/Mm3-a-reservation-dropped-AND-shrunk-at-once",
    laneRoom21((L) => L.dropped === true),
    bothLanes21((L) => { L.shrunk = { from: 10, to: 2, wanted: 5, premium: 0 }; }), "lane-anchor");
  run("r21/Mm3-stranded-stubs-in-a-room-that-records-no-drop-and-no-shrink",
    laneRoom21((L) => !L.dropped && !L.shrunk && L.stranded === 0),
    bothLanes21((L) => { L.stranded = 6; }), "lane-anchor");
  run("r21/Mm3-the-no-bound-licence-taken-by-a-reservation-that-ran-to-exhaustion",
    laneRoom21((L) => !L.dropped && !L.shrunk && L.bounded !== null),
    bothLanes21((L) => { L.bounded = null; L.boundedUngated = null; }), "lane-anchor");
  run("r21/Mm3-the-gated-and-ungated-halves-of-one-bound-disagreeing",
    laneRoom21((L) => L.bounded === null),
    bothLanes21((L) => { L.boundedUngated = 1.5; }), "lane-anchor");

  // ---- Mm4: the third witness to the park seat search
  const parkRoom21 = any21((p) => Array.isArray(p.meta?.ctrlParkSeatSearchTiles) && p.meta.ctrlParkSeatSearchTiles.length > 0);
  const releaseRoom21 = any21(
    (p) => typeof p.meta?.ctrlParkFloor === "number" && Array.isArray(p.meta?.ctrlParkSeatSearchTiles) &&
      p.meta.ctrlParkFloor < p.meta.ctrlParkSeatSearchTiles.length && (p.meta.ctrlParksBuiltTiles || []).length > p.meta.ctrlParkFloor,
  );
  const dropRelease21 = (p) => { p.meta.shortfalls = (p.meta.shortfalls || []).filter((s) => !(s && s.gate === "ctrlParks" && s.kind === "released")); };
  run("r21/Mm4-a-released-seat-hidden-by-falsifying-BOTH-published-scalars",
    releaseRoom21, (p) => { p.meta.ctrlParksAtSeatSearch = p.meta.ctrlParkFloor; dropRelease21(p); }, "ctrlParkSeatSearchTiles|released back to the extension");
  run("r21/Mm4-...-and-the-tile-list-truncated-to-match",
    releaseRoom21,
    (p) => { p.meta.ctrlParksAtSeatSearch = p.meta.ctrlParkFloor; p.meta.ctrlParkSeatSearchTiles = p.meta.ctrlParkSeatSearchTiles.slice(0, p.meta.ctrlParkFloor); dropRelease21(p); },
    "ctrlParkSeatSearchTiles|released back to the extension");
  run("r21/Mm4-the-seat-search-s-own-tile-list-deleted",
    parkRoom21, (p) => { delete p.meta.ctrlParkSeatSearchTiles; }, "ctrlParkSeatSearchTiles");
  run("r21/Mm4-the-tile-list-replaced-with-arbitrary-tiles",
    parkRoom21,
    (p) => { const a = []; for (let i = 0; i < 40; i++) a.push({ x: 2 + (i % 40), y: 2 + ((i * 7) % 40) }); p.meta.ctrlParkSeatSearchTiles = a; p.meta.ctrlParksAtSeatSearch = 40; },
    "ctrlParkSeatSearchTiles");
  run("r21/Mm4-one-search-tile-moved-off-the-controller-s-window",
    parkRoom21, (p) => { p.meta.ctrlParkSeatSearchTiles[0] = { x: 25, y: 25 }; }, "ctrlParkSeatSearchTiles");
  run("r21/Mm4-a-search-tile-counted-twice",
    parkRoom21, (p) => { p.meta.ctrlParkSeatSearchTiles.push({ ...p.meta.ctrlParkSeatSearchTiles[0] }); p.meta.ctrlParksAtSeatSearch += 1; }, "ctrlParkSeatSearchTiles");
  run("r21/Mm4-the-seat-count-x3-plus-1-against-its-own-list",
    parkRoom21, (p) => { p.meta.ctrlParksAtSeatSearch = p.meta.ctrlParksAtSeatSearch * 3 + 1; }, "ctrlParkSeatSearchTiles");
  run("r21/Mm4-a-seat-the-room-still-parks-on-struck-out-of-the-search-list",
    any21((p) => Array.isArray(p.meta?.ctrlParkSeatSearchTiles) && (p.meta.ctrlParksBuiltTiles || []).length > 0),
    (p) => {
      const b = p.meta.ctrlParksBuiltTiles[0];
      p.meta.ctrlParkSeatSearchTiles = p.meta.ctrlParkSeatSearchTiles.filter((t) => !(t.x === b.x && t.y === b.y));
      p.meta.ctrlParksAtSeatSearch = p.meta.ctrlParkSeatSearchTiles.length;
    },
    "ctrlParkSeatSearchTiles");

  // ---- Mm5: the sealing curve
  const closRoom21 = any21((p) => p.meta?.shell?.closures?.needed === true);
  const shutRoom21 = any21((p) => p.meta?.shell?.closures?.needed === false);
  run("r21/Mm5-the-sealing-curve-record-deleted", shutRoom21, (p) => { delete p.meta.shell.closures; }, "closures");
  run("r21/Mm5-an-open-cut-reported-as-a-sealing-curve",
    closRoom21, (p) => { p.meta.shell.closures = { needed: false, leaked: 0, tiles: [], minimal: true, kinds: {}, basis: p.meta.shell.closures.basis }; }, "closures");
  run("r21/Mm5-a-closed-cut-reported-as-open",
    shutRoom21, (p) => { p.meta.shell.closures.needed = true; p.meta.shell.closures.leaked = 3; }, "closures");
  run("r21/Mm5-the-leak-the-open-cut-lets-in-flattered",
    closRoom21, (p) => { p.meta.shell.closures.leaked = 1; }, "closures");
  run("r21/Mm5-the-published-closure-emptied", closRoom21, (p) => { p.meta.shell.closures.tiles = []; }, "closures");
  run("r21/Mm5-the-closure-swapped-for-a-rampart-that-does-not-close-it",
    any21((p) => { const c = p.meta?.shell?.closures; return c?.needed && (c.candidates || []).some((k) => !(c.soloClosers || []).some((s) => s.x === k.x && s.y === k.y)); }),
    (p) => { const c = p.meta.shell.closures; c.tiles = [c.candidates.find((k) => !c.soloClosers.some((s) => s.x === k.x && s.y === k.y))]; },
    "closures");
  run("r21/Mm5-the-closure-padded-and-still-called-minimal",
    any21((p) => { const c = p.meta?.shell?.closures; return c?.needed && (c.candidates || []).length > (c.tiles || []).length; }),
    (p) => { const c = p.meta.shell.closures; c.tiles = c.candidates.slice(); c.minimal = true; }, "closures");
  run("r21/Mm5-a-closure-tile-that-carries-no-rampart",
    closRoom21, (p) => { p.meta.shell.closures.tiles = [{ x: 25, y: 25 }]; }, "closures");
  run("r21/Mm5-the-substitutes-hidden-so-the-closure-reads-unique",
    any21((p) => (p.meta?.shell?.closures?.soloClosers || []).length > 0),
    (p) => { p.meta.shell.closures.soloClosers = []; }, "closures");
  run("r21/Mm5-the-candidate-region-truncated",
    any21((p) => (p.meta?.shell?.closures?.candidates || []).length > 2),
    (p) => { p.meta.shell.closures.candidates = p.meta.shell.closures.candidates.slice(0, 2); }, "closures");

  // ---- ML1: the relocation count
  const relocRoom21 = any21((p) => Array.isArray(p.meta?.extensions?.relocated) && p.meta.extensions.relocated.length > 1);
  run("r21/ML1-the-relocation-count-x3-plus-1",
    relocRoom21, (p) => { p.meta.extensions.relocatedCount = p.meta.extensions.relocatedCount * 3 + 1; }, "relocated");
  run("r21/ML1-the-relocation-count-zeroed",
    relocRoom21, (p) => { p.meta.extensions.relocatedCount = 0; }, "relocated");
  run("r21/ML1-the-relocation-list-deleted-under-its-own-count",
    relocRoom21, (p) => { delete p.meta.extensions.relocated; }, "relocated");
  run("r21/ML1-a-relocation-whose-origin-is-still-occupied",
    relocRoom21, (p) => { p.meta.extensions.relocated[0].from = { ...p.structures.extension[0] }; }, "relocated");

  // ---- THE RULING, obligation (i): the key set
  const keyRoom21 = recovRoom21((R) => Array.isArray(R.declaredKeys) && R.declaredKeys.length > 0);
  const twoKeyRoom21 = recovRoom21((R) => Array.isArray(R.declaredKeys) && R.declaredKeys.length > 1);
  const skipRoom21 = recovRoom21((R) => Array.isArray(R.declaredSkipped) && R.declaredSkipped.length > 0);
  run("r21/RULING-i-the-declared-key-set-withdrawn",
    keyRoom21, recov21((R) => { delete R.declaredKeys; }), "declared|RULING");
  run("r21/RULING-i-the-skipped-declarations-withdrawn",
    skipRoom21, recov21((R) => { delete R.declaredSkipped; }), "declared|RULING");
  run("r21/RULING-i-the-general-rule-withdrawn",
    keyRoom21, recov21((R) => { delete R.declaredKeyRule; }), "declaredKeyRule");
  run("r21/RULING-i-a-declared-key-dropped-out-of-the-tie-break",
    twoKeyRoom21,
    recov21((R) => { const k = R.declaredKeys.pop(); R.ranking = R.ranking.filter((l) => l !== `declared: ${k.instrument}, ${k.direction === "up" ? "more" : "less"} is better (${k.gate}${k.kind ? `/${k.kind}` : ``} declares ${k.source} = ${k.declared})`); }),
    "declared|ranking");
  run("r21/RULING-i-a-declared-key-laundered-into-the-skipped-list",
    twoKeyRoom21,
    recov21((R) => {
      const k = R.declaredKeys.pop();
      R.declaredSkipped.push({ at: k.at, gate: k.gate, kind: k.kind, why: "this declaration publishes no quantity this pass's instrument panel measures on a finished board, so there is nothing here a candidate could be ranked on" });
      R.ranking = R.ranking.filter((l) => !new RegExp(`^declared: ${k.instrument},`).test(l));
    }),
    "declared|ranking");
  run("r21/RULING-i-a-key-invented-from-a-declaration-that-publishes-no-quantity",
    keyRoom21,
    recov21((R) => { R.declaredKeys.push({ at: 99, gate: "eco", kind: null, instrument: "interior", declared: 3, direction: "up", source: "eco.interior" }); }),
    "declared|DECLARED_QUANTITIES|map");
  run("r21/RULING-i-a-declared-key-sorted-the-wrong-way",
    keyRoom21,
    recov21((R) => { const k = R.declaredKeys[0]; k.direction = "up"; R.ranking = R.ranking.map((l) => l.replace(`declared: ${k.instrument}, less is better`, `declared: ${k.instrument}, more is better`)); }),
    "direction|declared");
  run("r21/RULING-i-a-declared-key-relabelled-onto-another-instrument",
    keyRoom21, recov21((R) => { R.declaredKeys[0].instrument = "face"; }), "declared|instrument");
  run("r21/RULING-i-a-declared-key-read-off-a-field-the-room-does-not-declare",
    keyRoom21, recov21((R) => { R.declaredKeys[0].source = "mobility.metric.max"; }), "declared|source|read off");
  run("r21/RULING-i-the-declared-value-x3-plus-1",
    keyRoom21, recov21((R) => { R.declaredKeys[0].declared = R.declaredKeys[0].declared * 3 + 1; }), "declared|ranking");
  run("r21/RULING-i-the-keys-published-out-of-declaration-order",
    twoKeyRoom21, recov21((R) => { R.declaredKeys.reverse(); }), "declaration order|declared");
  run("r21/RULING-i-a-declaration-accounted-for-by-neither-list",
    skipRoom21, recov21((R) => { R.declaredSkipped = []; }), "account|declared");
  run("r21/RULING-i-a-declaration-accounted-for-twice",
    skipRoom21, recov21((R) => { R.declaredSkipped.push({ ...R.declaredSkipped[0] }); }), "account|declared");
  run("r21/RULING-i-a-skip-claiming-a-repeat-of-a-key-that-was-never-made",
    recovRoom21((R) => Array.isArray(R.declaredSkipped) && R.declaredSkipped.length > 0 && !R.declaredKeys.some((k) => k.instrument === "clump")),
    recov21((R) => { R.declaredSkipped[0] = { at: R.declaredSkipped[0].at, gate: "towers", kind: "clump", instrument: "clump", why: "`clump` is already a key from an earlier declaration in this list" }; }),
    "repeat|declared|already a key");
  const dupeSkipRoom21 = recovRoom21((R) => (R.declaredSkipped || []).some((s) => s && s.instrument));
  const plainSkipRoom21 = recovRoom21((R) => (R.declaredSkipped || []).some((s) => s && !s.instrument));
  run("r21/RULING-i-a-repeated-declaration-s-own-reading-withdrawn",
    dupeSkipRoom21, recov21((R) => { delete R.declaredSkipped.find((s) => s.instrument).declared; }), "repeat|declared");
  run("r21/RULING-i-a-repeated-declaration-s-reading-x3-plus-1",
    dupeSkipRoom21, recov21((R) => { const s = R.declaredSkipped.find((x) => x.instrument); s.declared = s.declared * 3 + 1; }), "DECLARES a lap|repeat|declared");
  run("r21/RULING-i-a-no-quantity-skip-handed-a-reading",
    plainSkipRoom21, recov21((R) => { R.declaredSkipped.find((x) => !x.instrument).declared = 4; }), "skip with a reading|declared");
  run("r21/RULING-i-the-whole-key-set-erased-on-a-board-nothing-moved",
    recovRoom21((R, p) => Array.isArray(R.declaredKeys) && R.declaredKeys.length > 0 && R.outcome !== "taken" && !p.meta?.towers?.acrossPriorTake?.taken),
    recov21((R) => {
      R.declaredSkipped = [...R.declaredKeys.map((k) => ({ at: k.at, gate: k.gate, kind: k.kind, why: "this declaration publishes no quantity this pass's instrument panel measures on a finished board, so there is nothing here a candidate could be ranked on" })), ...R.declaredSkipped];
      R.declaredKeys = [];
      R.ranking = R.ranking.filter((l) => !/^declared:/.test(l));
    }),
    "declared|re-derive");

  // ---- THE RULING, obligation (iii): the ranking and the winner
  run("r21/RULING-iii-the-published-ranking-withdrawn",
    keyRoom21, recov21((R) => { delete R.ranking; }), "ranking");
  run("r21/RULING-iii-the-declared-keys-struck-out-of-the-published-ranking",
    keyRoom21, recov21((R) => { R.ranking = R.ranking.filter((l) => !/^declared:/.test(l)); }), "ranking");
  run("r21/RULING-iii-the-declared-keys-demoted-behind-the-price",
    keyRoom21,
    recov21((R) => {
      const d = R.ranking.filter((l) => /^declared:/.test(l));
      const rest = R.ranking.filter((l) => !/^declared:/.test(l));
      R.ranking = [...rest.filter((l) => /^admission:/.test(l)), ...rest.filter((l) => /^priced:/.test(l)), ...d, ...rest.filter((l) => /raster/.test(l))];
    }),
    "ranking");
  run("r21/RULING-iii-the-winner-worsened-past-a-rival-on-the-declared-key",
    takenRoom21((R) => Array.isArray(R.declaredKeys) && R.declaredKeys.some((k) => k.instrument === "lap") && (R.offered || []).filter((o) => /^accepted, not taken/.test(String(o.verdict))).length > 0),
    recov21((R) => { const w = R.offered.find((o) => o.verdict === "TAKEN"); w.after.lap = w.after.lap + 1; }),
    "tie-break|declared|lap");

  // ---- THE RULING, obligation (ii): decidedBy, and the note that owes it
  const decidedRoom21 = takenRoom21((R) => R.decidedBy && typeof R.decidedBy === "object");
  run("r21/RULING-ii-the-declaration-that-decided-the-take-goes-unmentioned",
    decidedRoom21, recov21((R) => { delete R.decidedBy; }), "decidedBy|RULING");
  run("r21/RULING-ii-a-different-seat-named-as-the-one-it-displaced",
    decidedRoom21, recov21((R) => { R.decidedBy.runnerUp.withdrawn = { x: R.decidedBy.runnerUp.withdrawn.x + 1, y: R.decidedBy.runnerUp.withdrawn.y }; }), "runnerUp|decidedBy");
  run("r21/RULING-ii-the-margin-on-the-declared-axis-rewritten",
    decidedRoom21, recov21((R) => { R.decidedBy.margin.declared = -1.5; }), "margin|decidedBy");
  run("r21/RULING-ii-the-margin-on-the-priced-axis-withdrawn",
    decidedRoom21, recov21((R) => { delete R.decidedBy.margin.priced; }), "margin|decidedBy");
  run("r21/RULING-ii-the-price-the-room-paid-flattered",
    decidedRoom21, recov21((R) => { R.decidedBy.margin.priced = 2; }), "margin|decidedBy");
  run("r21/RULING-ii-the-admission-tie-the-whole-claim-rests-on-falsified",
    decidedRoom21, recov21((R) => { R.decidedBy.tiedOn.gainedDeep = R.decidedBy.tiedOn.gainedDeep * 3 + 1; }), "tiedOn|decidedBy");
  run("r21/RULING-ii-decidedBy-claimed-where-the-rule-changed-nothing",
    takenRoom21((R) => R.decidedBy === undefined && (R.offered || []).some((o) => o && o.verdict === "TAKEN")),
    recov21((R) => {
      const w = R.offered.find((o) => o.verdict === "TAKEN");
      R.decidedBy = {
        instrument: "lap", gate: "mobility", kind: null, source: "mobility.metric.maxGated", declared: 1, direction: "down",
        taken: { withdrawn: w.withdrawn, kind: w.kind, value: 1, extTourDelta: w.extTourDelta },
        runnerUp: { withdrawn: { x: 1, y: 1 }, kind: "extension", value: 2, extTourDelta: 0 },
        margin: { declared: -1, priced: 1, pricedKey: "extTourDelta" },
        tiedOn: { gainedDeep: 1, gainedTiles: 1 },
      };
    }),
    "decidedBy|RULING");
  run("r21/RULING-ii-the-note-stops-naming-the-seat-the-declaration-displaced",
    decidedRoom21,
    (p) => {
      const R = p.meta.sealedRecovery;
      const ru = `${R.decidedBy.runnerUp.withdrawn.x},${R.decidedBy.runnerUp.withdrawn.y}`;
      const i = (p.meta.noteRecords || []).findIndex((e) => e && e.cls === "sealedRecovery");
      if (i < 0) throw new Error("no sealedRecovery note");
      p.meta.notes[i] = p.meta.notes[i].split(ru).join("49,49");
    },
    "note does not quote|runner|displaced");

  // ---- THE RULING, obligation (iii): the pass that is EXCLUDED, and the
  // exclusion audited rather than accepted. The seat-release pass ranks on
  // shallow extensions first — which IS a declared quantity in the validator's
  // own map — and runs before finalizeRoom, so it may neither fail its own
  // first key nor claim a key set it could not have read.
  const relRoom21 = any21((p) => (p.meta?.shortfalls || []).some((s) => s && s.gate === "ctrlParks" && s.kind === "released" && s.ctrlParks));
  const relRec21 = (edit) => (p) => {
    const d = (p.meta.shortfalls || []).find((s) => s && s.gate === "ctrlParks" && s.kind === "released");
    if (!d) throw new Error("no released declaration");
    edit(d, p);
    regen21(p);
  };
  run("r21/RULING-iii-the-excluded-pass-kept-a-rung-no-better-on-its-declared-key",
    relRoom21, relRec21((d) => { d.ctrlParks.shallowReleasing = d.ctrlParks.shallowHolding; }), "release-rule");
  run("r21/RULING-iii-the-excluded-pass-s-kept-rung-is-not-the-board-it-ships",
    relRoom21, relRec21((d) => { d.ctrlParks.shallowReleasing = d.ctrlParks.shallowReleasing + 3; }), "release-rule");
  run("r21/RULING-iii-the-excluded-pass-claims-a-key-set-it-could-not-read",
    relRoom21,
    relRec21((d) => { d.declaredKeys = [{ at: 0, gate: "extensions", kind: "shallow", instrument: "shallowExts", declared: 3, direction: "down", source: "extensions/shallow.count" }]; }),
    "release-rule");
  run("r21/RULING-iii-the-excluded-pass-publishes-a-ranking",
    relRoom21, relRec21((d) => { d.ranking = ["admission: shallowExts, less is better"]; }), "release-rule");
  run("r21/RULING-iii-the-excluded-pass-s-priced-readings-withdrawn",
    relRoom21, relRec21((d) => { delete d.ctrlParks.shallowHolding; }), "release-rule");

  // ---- THE RULING, obligation (iii): the OTHER pass with a tie-break
  const apTakeRoom21 = apRoom21((t) => !!t.taken && Array.isArray(t.declaredKeys));
  const apRefuseRoom21 = apRoom21((t) => !t.taken && Array.isArray(t.declaredKeys));
  run("r21/RULING-iii-tower-swap-the-key-set-withdrawn",
    apTakeRoom21, (p) => { delete p.meta.towers.acrossPriorTake.declaredKeys; }, "declared|RULING");
  run("r21/RULING-iii-tower-swap-the-key-set-withdrawn-on-the-refusing-branch",
    apRefuseRoom21, (p) => { delete p.meta.towers.acrossPriorTake.declaredKeys; }, "declared|RULING");
  run("r21/RULING-iii-tower-swap-the-ranking-withdrawn-on-a-take",
    apTakeRoom21, (p) => { delete p.meta.towers.acrossPriorTake.ranking; }, "ranking");
  run("r21/RULING-iii-tower-swap-the-declared-keys-struck-out-of-its-ranking",
    apTakeRoom21, (p) => { const t = p.meta.towers.acrossPriorTake; t.ranking = t.ranking.filter((l) => !/^declared:/.test(l)); }, "ranking");
  run("r21/RULING-iii-tower-swap-a-key-invented",
    apTakeRoom21, (p) => { p.meta.towers.acrossPriorTake.declaredKeys.push({ at: 99, gate: "eco", kind: null, instrument: "interior", declared: 1, direction: "up", source: "eco.interior" }); }, "declared|map|DECLARED_QUANTITIES");
  run("r21/RULING-iii-tower-swap-the-accepted-count-inflated",
    apTakeRoom21, (p) => { p.meta.towers.acrossPriorTake.accepted = 4; }, "accepted");
  run("r21/RULING-iii-tower-swap-a-tie-break-claimed-where-there-was-one-offer",
    apTakeRoom21, (p) => { p.meta.towers.acrossPriorTake.decidedBy = { instrument: "lap" }; }, "decidedBy");
}

// ===========================================================================
// ROUND 22 — the two reviewers' rosters, and the four exploits that landed.
// ===========================================================================
// MECHANICAL. MF1: the ruling's TOTALITY gate was self-referential — it checked
// the `at` indices of `declaredKeys ∪ declaredSkipped` against the union's OWN
// length, so a fabricated key and a deleted one both left a contiguous list
// behind, on exactly the 15 moved rooms where totality is the only thing left.
// MF2: `decidedBy`'s ABSENCE was derived from candidate panels nothing could
// re-derive, so a COHERENT two-leaf edit (`extTourDelta` and `extTourAfter`
// moved together, the identity preserved) erased the fleet's one `decidedBy`.
// MF3: the third witness to the park-seat search was anchored to a RING, not to
// the search — any 6..8 walkable tiles near the controller passed — and its
// board anchor `meta.ctrlParksBuiltTiles` had no presence rule at all. Mm4: 30
// of 46 always-present top-level `meta` keys were deletable, 10 of them read
// behind guards. Mm6: the audited exclusion of the seat-release pass audited a
// FILE CONSTANT rather than the room.
//
// OWNER. OM1: six swap refusals were priced on an ABSOLUTE predicate where the
// published rule is a DELTA — all six free, five rooms shipping a paved run
// because of it. OM2: the tower-swap pass moved a tower on the shipped board in
// three rooms and was invisible in every reader channel, with no note class at
// all. OM3: ...and the record was withdrawable, its `taken.from` forgeable from
// its own twin, its `taken.why` free text. OM4: the `offNetwork` declared key
// read a different quantity than the declaration published, in 14 of 14. OM5:
// the note recited every declared quantity and named the DECIDING key in none
// of the 11 non-E11S7 takes.
{
  const any22 = (pred) => plans.find((p) => { try { return pred(p); } catch { return false; } })?.room || null;
  const regen22 = (p) => {
    for (let i = 0; i < (p.meta.noteRecords || []).length; i++) {
      try { p.meta.notes[i] = renderNote(p.meta.noteRecords[i]); } catch { /* a throwing record is its own failure */ }
    }
  };
  /** edit `meta.sealedRecovery` and keep the note-record copy byte-identical */
  const recov22 = (edit) => (p) => {
    const R = p.meta.sealedRecovery;
    if (!R) throw new Error("no sealedRecovery");
    edit(R, p);
    const i = (p.meta.noteRecords || []).findIndex((e) => e && e.cls === "sealedRecovery");
    if (i >= 0) p.meta.noteRecords[i].rec = R;
    regen22(p);
  };
  const recovRoom22 = (pred) => any22((p) => (p.meta?.sealedRecovery ? pred(p.meta.sealedRecovery, p) : false));
  const keyRoom22 = recovRoom22((R) => Array.isArray(R.declaredKeys) && R.declaredKeys.length > 0);
  const movedRoom22 = recovRoom22((R) => (R.offered || []).some((o) => o && o.moved && typeof o.extTourAfter === "number"));
  const firstMoved = (R) => (R.offered || []).find((o) => o && o.moved && typeof o.extTourAfter === "number");

  // ---- MF1: TOTALITY, against the pre-take channel and against the board ----
  run("r22/MF1-the-pre-take-shortfall-count-withdrawn",
    keyRoom22, recov22((R) => { delete R.preTakeShortfallCount; }), "preTakeShortfallCount");
  run("r22/MF1-the-pre-take-count-inflated-so-a-key-can-be-added",
    keyRoom22, recov22((R) => { R.preTakeShortfallCount += 1; }), "preTakeShortfallCount|preTakeShortfalls");
  run("r22/MF1-the-pre-take-count-deflated-so-a-key-can-be-dropped",
    keyRoom22, recov22((R) => { R.preTakeShortfallCount -= 1; }), "preTakeShortfallCount|preTakeShortfalls");
  run("r22/MF1-the-pre-take-key-list-withdrawn",
    recovRoom22((R) => Array.isArray(R.preTakeShortfalls)),
    recov22((R) => { delete R.preTakeShortfalls; }), "preTakeShortfalls");
  run("r22/MF1-the-pre-take-key-list-truncated-under-its-own-count",
    recovRoom22((R) => Array.isArray(R.preTakeShortfalls) && R.preTakeShortfalls.length > 1),
    recov22((R) => { R.preTakeShortfalls = R.preTakeShortfalls.slice(0, -1); }), "preTakeShortfalls");
  run("r22/MF1-a-pre-take-pair-substituted-under-the-same-index",
    recovRoom22((R) => Array.isArray(R.preTakeShortfalls) && R.preTakeShortfalls.length > 0),
    recov22((R) => { R.preTakeShortfalls[0] = { at: 0, gate: "eco", kind: null }; }),
    "the channel this pass read carries|declaration index");
  run("r22/MF1-the-pre-take-list-published-out-of-declaration-order",
    recovRoom22((R) => Array.isArray(R.preTakeShortfalls) && R.preTakeShortfalls.length > 1),
    recov22((R) => { R.preTakeShortfalls = R.preTakeShortfalls.slice().reverse(); }),
    "preTakeShortfalls|declaration order|channel this pass read");
  // X1c, the exploit: a fabricated declared key at the next free index
  run("r22/MF1-X1c-a-declared-quantity-INVENTED-at-the-next-free-index",
    keyRoom22,
    recov22((R) => {
      const at = Math.max(-1, ...[...R.declaredKeys, ...(R.declaredSkipped || [])].map((k) => (Number.isInteger(k?.at) ? k.at : -1))) + 1;
      R.declaredKeys.push({ at, gate: "extensions", kind: "shallow", instrument: "shallowExts", declared: 7, direction: "down", source: "extensions/shallow.count" });
      if (Array.isArray(R.ranking)) {
        const i = R.ranking.findIndex((l) => /^priced:/.test(String(l)));
        R.ranking.splice(i < 0 ? R.ranking.length : i, 0, "declared: shallowExts, less is better (extensions/shallow declares extensions/shallow.count = 7)");
      }
    }),
    "preTakeShortfallCount|never filed|preTakeShortfalls");
  // ...and the same with the pre-take channel forged to match, which is what
  // the BOARD anchor is for
  run("r22/MF1-X1c-hard-the-invented-key-with-the-pre-take-channel-forged-to-match",
    recovRoom22((R) => Array.isArray(R.preTakeShortfalls) && Array.isArray(R.declaredKeys)),
    recov22((R) => {
      const at = R.preTakeShortfallCount;
      R.declaredKeys.push({ at, gate: "extensions", kind: "shallow", instrument: "shallowExts", declared: 7, direction: "down", source: "extensions/shallow.count" });
      R.preTakeShortfalls.push({ at, gate: "extensions", kind: "shallow" });
      R.preTakeShortfallCount = at + 1;
      if (Array.isArray(R.ranking)) {
        const i = R.ranking.findIndex((l) => /^priced:/.test(String(l)));
        R.ranking.splice(i < 0 ? R.ranking.length : i, 0, "declared: shallowExts, less is better (extensions/shallow declares extensions/shallow.count = 7)");
      }
    }),
    "never filed|RETIRED");
  // X2, the exploit: a real declared key DELETED out of the channel
  run("r22/MF1-X2-a-real-declared-key-DROPPED-from-the-published-channel",
    recovRoom22((R) => Array.isArray(R.declaredKeys) && R.declaredKeys.length > 1),
    recov22((R) => {
      const gone = R.declaredKeys.pop();
      if (Array.isArray(R.ranking)) R.ranking = R.ranking.filter((l) => !String(l).includes(`${gone.gate}${gone.kind ? `/${gone.kind}` : ``}`));
    }),
    "SHIPS the declaration|preTakeShortfallCount|preTakeShortfalls");
  run("r22/MF1-a-declared-key-moved-out-of-both-lists-altogether",
    recovRoom22((R) => Array.isArray(R.declaredKeys) && R.declaredKeys.length >= 1 && Array.isArray(R.declaredSkipped)),
    recov22((R) => { R.declaredKeys = R.declaredKeys.slice(1); }),
    "SHIPS the declaration|preTakeShortfallCount|preTakeShortfalls");

  // ---- MF2: the counterfactual tour, re-derived from the board witness ----
  run("r22/MF2-a-candidate-s-board-witness-withdrawn",
    movedRoom22, recov22((R) => { delete firstMoved(R).moved; }), "no .moved. witness");
  run("r22/MF2-X3-the-coherent-two-leaf-edit-that-erased-the-fleet-s-one-decidedBy",
    movedRoom22,
    recov22((R) => {
      const o = firstMoved(R);
      o.extTourAfter += 23;
      o.extTourDelta += 23;
    }),
    "extension tour over the board");
  run("r22/MF2-a-relocation-moved-onto-the-sitter-under-an-unchanged-tour",
    recovRoom22((R) => (R.offered || []).some((o) => o && o.moved && (o.moved.extIn || []).length && typeof o.extTourAfter === "number")),
    recov22((R, p) => {
      const o = (R.offered || []).find((q) => q && q.moved && (q.moved.extIn || []).length && typeof q.extTourAfter === "number");
      const sit = p.sitter || p.hub;
      o.moved.extIn[0] = { x: sit.x, y: sit.y };
    }),
    "does not describe a board of this room|extension tour over the board|cannot be walked|filler can reach");
  run("r22/MF2-the-witness-emptied-so-the-candidate-board-is-the-shipped-one",
    recovRoom22((R) => (R.offered || []).some((o) => o && o.moved && (o.moved.extOut || []).length && typeof o.extTourAfter === "number")),
    recov22((R) => {
      const o = (R.offered || []).find((q) => q && q.moved && (q.moved.extOut || []).length && typeof q.extTourAfter === "number");
      o.moved.extOut = [];
      o.moved.extIn = [];
    }),
    "does not describe a board of this room|extension tour over the board");
  run("r22/MF2-tourBoardIdentical-asserted-over-a-board-that-moved-something-else",
    recovRoom22((R) => (R.offered || []).some((o) => o && o.moved && (o.moved.otherMoved || []).length)),
    recov22((R) => {
      const o = (R.offered || []).find((q) => q && q.moved && (q.moved.otherMoved || []).length);
      o.moved.tourBoardIdentical = true;
    }),
    "tourBoardIdentical");
  run("r22/MF2-the-exterior-difference-falsified",
    movedRoom22, recov22((R) => { firstMoved(R).moved.exteriorDiff = 7; }), "exterior");
  run("r22/MF2-a-candidate-withdrawing-a-seat-its-own-run-never-carried",
    movedRoom22, recov22((R) => { firstMoved(R).withdrawn = { x: 1, y: 1 }; }),
    "carries no|does not describe a board of this room|buildable");

  // ---- MF3: the third witness, derived rather than anchored to a ring ----
  const parkRoom22 = any22((p) => Array.isArray(p.meta?.ctrlParksBuiltTiles) && p.meta.ctrlParksBuiltTiles.length > 0);
  run("r22/MF3-X5-the-built-park-roster-deleted-so-the-search-list-is-any-ring",
    parkRoom22, (p) => { delete p.meta.ctrlParksBuiltTiles; }, "ctrlParksBuiltTiles");
  run("r22/MF3-a-built-park-seat-swapped-for-another-ring-tile",
    parkRoom22,
    (p) => { p.meta.ctrlParksBuiltTiles[0] = { x: p.meta.ctrlParksBuiltTiles[0].x, y: p.meta.ctrlParksBuiltTiles[0].y + 2 }; },
    "ctrlParksBuiltTiles|built-tiles");
  run("r22/MF3-X4-a-seat-search-tile-swapped-for-a-tile-of-the-controller-ring",
    any22((p) => Array.isArray(p.meta?.ctrlParkSeatSearchTiles) && p.meta.ctrlParkSeatSearchTiles.length > 1),
    (p) => {
      const L = p.meta.ctrlParkSeatSearchTiles;
      const built = new Set((p.meta.ctrlParksBuiltTiles || []).map((t) => `${t.x},${t.y}`));
      const i = L.findIndex((t) => !built.has(`${t.x},${t.y}`));
      const j = i < 0 ? 0 : i;
      L[j] = { x: L[j].x, y: L[j].y + 2 };
    },
    "seat search over the controller link|seat-search-tiles");
  run("r22/MF3-the-seat-search-list-padded-with-a-ring-tile-nobody-counted",
    any22((p) => Array.isArray(p.meta?.ctrlParkSeatSearchTiles) && typeof p.meta?.ctrlParksAtSeatSearch === "number"),
    (p) => {
      const L = p.meta.ctrlParkSeatSearchTiles;
      L.push({ x: L[0].x, y: L[0].y + 3 });
      p.meta.ctrlParksAtSeatSearch = L.length;
    },
    "seat search over the controller link|seat-search-tiles");

  // ---- Mm4: the presence gap, one key per case ----
  for (const k of ["budget", "claimApproach", "claimSeat", "ctrlContainer", "ctrlLink", "ctrlParkFloorCap",
    "ctrlParkFloorWhy", "ctrlParkReserve", "ctrlParksCensus", "ctrlParksEaten", "dtHub", "ecoDir",
    "finalized", "labs", "method", "mineralApproach", "mineralRingFree", "mineralSeat", "misc",
    "noteObligationBasis", "pathController", "pathSourcesSum", "roadConnected", "roadOrder",
    "roadOrphans", "seedScore", "seedSkip", "spawnFan", "storageAccessD4"]) {
    run(`r22/Mm4-presence-meta.${k}-deleted`, R, (p) => { delete p.meta[k]; }, `meta\\.${k}`);
  }
  run("r22/Mm4-meta.finalized-downgraded-to-false",
    R, (p) => { p.meta.finalized = false; }, "meta\\.finalized");
  run("r22/Mm4-meta.roadOrphans-published-as-a-scalar",
    R, (p) => { p.meta.roadOrphans = 0; }, "meta\\.roadOrphans");

  // ---- Mm6: the exclusion's reason 1, room-derived ----
  const relRoom22 = any22((p) => (p.meta?.shortfalls || []).some((s2) => s2 && s2.gate === "ctrlParks" && s2.kind === "released" && s2.ctrlParks));
  run("r22/Mm6-the-room-ranked-on-shallow-extensions-and-declares-none",
    any22((p) => (p.meta?.shortfalls || []).some((s2) => s2 && s2.gate === "ctrlParks" && s2.kind === "released") &&
      (p.meta?.shortfalls || []).some((s2) => s2 && s2.gate === "extensions" && s2.kind === "shallow")),
    (p) => { p.meta.shortfalls = p.meta.shortfalls.filter((s2) => !(s2 && s2.gate === "extensions" && s2.kind === "shallow")); regen22(p); },
    "release-rule");
  run("r22/Mm6-the-exclusion-s-first-key-and-the-room-s-declaration-disagree",
    any22((p) => (p.meta?.shortfalls || []).some((s2) => s2 && s2.gate === "ctrlParks" && s2.kind === "released") &&
      (p.meta?.shortfalls || []).some((s2) => s2 && s2.gate === "extensions" && s2.kind === "shallow" && typeof s2.count === "number")),
    (p) => { const d = p.meta.shortfalls.find((s2) => s2 && s2.gate === "extensions" && s2.kind === "shallow"); d.count += 4; regen22(p); },
    "release-rule|shallow");

  // ---- OM1: the delta refusal ----
  const refRoom22 = any22((p) => (p.meta?.walls?.alongCutRefused || []).some((r2) => r2 && r2.baseline && / more road tile\(s\) fall off the network \(/.test(String(r2.why))));
  const firstRef = (p) => (p.meta.walls.alongCutRefused || []).find((r2) => r2 && r2.baseline && / more road tile\(s\) fall off the network \(/.test(String(r2.why)));
  run("r22/OM1-the-refusal-s-baseline-withdrawn",
    refRoom22, (p) => { delete firstRef(p).baseline; }, "alongCutRefused");
  run("r22/OM1-the-baseline-and-the-sentence-disagree",
    refRoom22, (p) => { firstRef(p).baseline.roads += 5; }, "alongCutRefused");
  run("r22/OM1-a-refused-swap-that-is-not-measurably-worse",
    refRoom22,
    (p) => { const r2 = firstRef(p); r2.why = r2.why.replace(/(\d+) more road tile\(s\) fall off the network \((\d+) -> (\d+);/, "0 more road tile(s) fall off the network ($2 -> $2;"); },
    "alongCutRefused");
  run("r22/OM1-the-newly-off-roster-shortened-under-its-own-difference",
    refRoom22,
    (p) => { const r2 = firstRef(p); r2.why = r2.why.replace(/newly off: ([^)]*)\)/, (m0, l) => `newly off: ${String(l).trim().split(/\s+/)[0]})`); },
    "alongCutRefused");
  run("r22/OM1-the-refusal-reverted-to-the-round-21-ABSOLUTE-predicate",
    refRoom22,
    (p) => {
      const r2 = firstRef(p);
      r2.why = r2.why.replace(/\d+ more road tile\(s\) fall off the network \([^)]*\) — they are no longer D8-connected to the sitter over roads and containers/,
        "the container at 45,36 is left with no road on any of its 8 neighbours");
    },
    "ABSOLUTE predicate|alongCutRefused");
  run("r22/OM1-the-two-terms-of-the-subtraction-taken-on-different-boards",
    refRoom22,
    (p) => { const r2 = firstRef(p); r2.why = r2.why.replace(/\((\d+) -> (\d+);/, (m0, a, b) => `(${Number(a) + 1} -> ${Number(b) + 1};`); },
    "alongCutRefused");

  // ---- OM2 / OM3: the tower swap, its record and its note ----
  const swapRoom22 = any22((p) => p.meta?.towers?.towerSwapTaken && p.meta?.towers?.acrossPriorTake?.taken);
  const apEdit22 = (edit) => (p) => {
    edit(p.meta.towers.acrossPriorTake, p);
    const i = (p.meta.noteRecords || []).findIndex((e) => e && e.cls === "towerSwap");
    if (i >= 0) p.meta.noteRecords[i].rec = p.meta.towers.acrossPriorTake;
    regen22(p);
  };
  run("r22/OM3-the-tower-swap-record-deleted-in-a-room-whose-flag-says-a-tower-moved",
    swapRoom22, (p) => { delete p.meta.towers.acrossPriorTake; }, "acrossPriorTake");
  run("r22/OM3-taken.from-forged-away-from-its-own-twin",
    swapRoom22, apEdit22((t) => { t.taken.from = { x: t.taken.from.x - 1, y: t.taken.from.y }; }), "towerSwapTaken|taken\\.from");
  run("r22/OM3-taken.to-forged-away-from-its-own-twin",
    swapRoom22, apEdit22((t) => { t.taken.to = { x: t.taken.to.x + 1, y: t.taken.to.y }; }), "towerSwapTaken|taken\\.to");
  run("r22/OM3-the-flag-nulled-so-the-swap-is-invisible-in-the-channel-the-film-reads",
    swapRoom22, (p) => { p.meta.towers.towerSwapTaken = null; }, "towerSwapTaken|towerSwap");
  run("r22/OM3-taken.why-claims-the-branch-it-did-not-buy",
    any22((p) => p.meta?.towers?.acrossPriorTake?.taken?.why === "clump"),
    apEdit22((t) => { t.taken.why = "lift"; }), "taken\\.why");
  run("r22/OM3-taken.why-claims-the-clump-branch-on-a-lift",
    any22((p) => p.meta?.towers?.acrossPriorTake?.taken?.why === "lift"),
    apEdit22((t) => { t.taken.why = "clump"; }), "taken\\.why");
  run("r22/OM3-taken.why-as-free-text",
    swapRoom22, apEdit22((t) => { t.taken.why = "it was better"; }), "taken\\.why");
  run("r22/OM2-the-tower-swap-note-and-its-record-deleted-together",
    any22((p) => (p.meta?.noteRecords || []).some((e) => e && e.cls === "towerSwap")),
    (p) => {
      const i = p.meta.noteRecords.findIndex((e) => e && e.cls === "towerSwap");
      p.meta.noteRecords.splice(i, 1);
      p.meta.notes.splice(i, 1);
      p.meta.noteObligations = (p.meta.noteObligations || []).filter((o) => o && o.cls !== "towerSwap");
    },
    "towerSwap");
  run("r22/OM2-the-tower-swap-note-s-record-copy-forged-away-from-the-plan-s",
    any22((p) => (p.meta?.noteRecords || []).some((e) => e && e.cls === "towerSwap" && e.rec && e.rec.taken)),
    (p) => {
      const e = p.meta.noteRecords.find((q) => q && q.cls === "towerSwap");
      e.rec = JSON.parse(JSON.stringify(e.rec));
      e.rec.taken.from = { x: e.rec.taken.from.x - 1, y: e.rec.taken.from.y };
      regen22(p);
    },
    "towerSwap|acrossPriorTake");
  run("r22/OM2-the-tower-swap-obligation-dropped-while-the-note-stays",
    any22((p) => (p.meta?.noteObligations || []).some((o) => o && o.cls === "towerSwap")),
    (p) => { p.meta.noteObligations = p.meta.noteObligations.filter((o) => o && o.cls !== "towerSwap"); },
    "towerSwap");
  run("r22/OL2-the-sealing-curve-note-and-its-record-deleted-together",
    any22((p) => (p.meta?.noteRecords || []).some((e) => e && e.cls === "shellClosure")),
    (p) => {
      const i = p.meta.noteRecords.findIndex((e) => e && e.cls === "shellClosure");
      p.meta.noteRecords.splice(i, 1);
      p.meta.notes.splice(i, 1);
      p.meta.noteObligations = (p.meta.noteObligations || []).filter((o) => o && o.cls !== "shellClosure");
    },
    "shellClosure");
  run("r22/OL2-the-sealing-curve-note-s-record-copy-forged-away-from-the-plan-s",
    any22((p) => (p.meta?.noteRecords || []).some((e) => e && e.cls === "shellClosure" && e.rec && typeof e.rec.leaked === "number")),
    (p) => {
      const e = p.meta.noteRecords.find((q) => q && q.cls === "shellClosure");
      e.rec = JSON.parse(JSON.stringify(e.rec));
      e.rec.leaked += 1;
      regen22(p);
    },
    "shellClosure|closures");

  // ---- OM4: the instrument and the declaration are one measurement ----
  const offRoom22 = recovRoom22((R, p) =>
    [...(R.declaredKeys || []), ...(R.declaredSkipped || [])].some((k) => k && k.instrument === "offNetwork" && typeof k.declared === "number") &&
    R.before && typeof R.before.offNetwork === "number");
  run("r22/OM4-the-declared-off-network-value-and-the-panel-reading-pulled-apart",
    offRoom22,
    recov22((R) => { const k = [...(R.declaredKeys || []), ...(R.declaredSkipped || [])].find((q) => q && q.instrument === "offNetwork"); k.declared += 1; }),
    "off-network count of");
  run("r22/OM4-the-panel-reading-moved-under-an-unchanged-declaration",
    offRoom22, recov22((R) => { R.before.offNetwork += 1; }), "off-network count of|offNetwork");

  // ---- MF1, the swap branch, and the basis sentence ----
  run("r22/MF1-the-pre-take-basis-sentence-withdrawn",
    recovRoom22((R) => typeof R.preTakeShortfallBasis === "string"),
    recov22((R) => { delete R.preTakeShortfallBasis; }), "preTakeShortfallBasis");
  run("r22/MF1-the-tower-swap-s-pre-take-channel-withdrawn",
    any22((p) => Array.isArray(p.meta?.towers?.acrossPriorTake?.preTakeShortfalls)),
    (p) => { delete p.meta.towers.acrossPriorTake.preTakeShortfalls; regen22(p); }, "preTakeShortfalls");
  run("r22/MF1-the-tower-swap-s-pre-take-count-inflated",
    any22((p) => Number.isInteger(p.meta?.towers?.acrossPriorTake?.preTakeShortfallCount)),
    (p) => { p.meta.towers.acrossPriorTake.preTakeShortfallCount += 1; regen22(p); }, "preTakeShortfall");

  // ---- OM5: the structured decider, derived from the ranking ----
  const deciderRoom22 = recovRoom22((R) => R.decider && typeof R.decider === "object");
  run("r22/OM5-the-decider-record-withdrawn",
    deciderRoom22, recov22((R) => { delete R.decider; }), "decider");
  run("r22/OM5-the-decider-rule-withdrawn",
    deciderRoom22, recov22((R) => { delete R.deciderRule; }), "deciderRule");
  run("r22/OM5-the-decider-names-a-key-that-did-not-decide",
    deciderRoom22, recov22((R) => { R.decider.key = R.decider.key === "gainedDeep" ? "gainedTiles" : "gainedDeep"; }), "decider\\.key");
  run("r22/OM5-the-decider-s-candidate-count-inflated",
    deciderRoom22, recov22((R) => { R.decider.candidates = (R.decider.candidates || 0) + 3; }), "decider\\.candidates");
  run("r22/OM5-a-tie-break-claimed-where-one-candidate-cleared-the-panel",
    recovRoom22((R) => R.decider && R.decider.key === "single-candidate"),
    recov22((R) => { R.decider.rank = 2; R.decider.runnerUp = { withdrawn: { x: 10, y: 10 }, kind: "extension" }; }),
    "decider\\.rank|decider\\.runnerUp|decider\\.key");
  run("r22/OM5-the-decider-s-runner-up-is-not-the-seat-the-order-places-second",
    recovRoom22((R) => R.decider && R.decider.runnerUp && R.decider.runnerUp.withdrawn),
    recov22((R) => { R.decider.runnerUp.withdrawn = { x: R.decider.runnerUp.withdrawn.x + 1, y: R.decider.runnerUp.withdrawn.y }; }),
    "decider\\.runnerUp");
  run("r22/OM5-the-decider-s-two-readings-pulled-apart",
    recovRoom22((R) => R.decider && R.decider.values && typeof R.decider.values.taken === "number"),
    recov22((R) => { R.decider.values.taken += 5; }), "decider\\.values");

  // ---- OM5: the note names what decided ----
  const decidedRoom22 = recovRoom22((R, p) =>
    R.outcome === "taken" && (p.meta?.noteRecords || []).some((e) => e && e.cls === "sealedRecovery"));
  run("r22/OM5-the-what-decided-clause-struck-out-of-the-note",
    decidedRoom22,
    (p) => {
      const i = p.meta.noteRecords.findIndex((e) => e && e.cls === "sealedRecovery");
      const t = String(p.meta.notes[i]);
      const h = t.indexOf("WHAT DECIDED IT");
      if (h < 0) throw new Error("no WHAT DECIDED IT clause to strike");
      const end = t.indexOf(". ", h + 200);
      p.meta.notes[i] = t.slice(0, h) + (end > 0 ? t.slice(end + 2) : "");
    },
    "WHAT DECIDED IT|not the note its own record generates");
  run("r22/OM5-the-what-decided-clause-names-a-line-that-did-not-decide",
    decidedRoom22,
    (p) => {
      const i = p.meta.noteRecords.findIndex((e) => e && e.cls === "sealedRecovery");
      const t = String(p.meta.notes[i]);
      const h = t.indexOf("WHAT DECIDED IT");
      if (h < 0) throw new Error("no WHAT DECIDED IT clause to falsify");
      const end = Math.min(t.length, h + 320);
      p.meta.notes[i] =
        t.slice(0, h) + "WHAT DECIDED IT (OM5): the strongest wall the swap could leave standing. " + t.slice(end);
    },
    "owes the name of that line|not the note its own record generates");
}

// ===========================================================================
// ROUND 23 — the demotion, the arithmetic, the wall and the two dead sentences.
// ===========================================================================
// MECHANICAL. MF1 (CRITICAL): the skip-truthfulness check was guarded on
// `!moved`, so on any of the 15 rooms whose board moved after the pass a real
// DECLARED KEY could be demoted into `declaredSkipped` as "publishes no
// quantity this panel measures" — 12 of 12 swept keys passed 172/172 at three
// meta edits and no board tile, which is obligation (i) of the round-21 RULING
// switched off. MF5: the along-cut refusal's magnitude was gated on SIGN only,
// so E5S9's "9 more road tile(s) fall off the network (0 -> 9; newly off:
// 22,15 …)" rewritten to "1 more … (0 -> 1; newly off: 49,49)" passed — while
// the road-axis offers this fleet files re-derive EXACTLY on the shipped board
// (the census is measured by the run and printed by validate.mjs's own summary
// line; round 24 / OM5 took the dated pair of numbers out of this comment,
// because it was already wrong on the artifact it was written against).
// MF6: the one dead note class stated a false reason for its own silence.
//
// OWNER. OB1 (BLOCKING): stage 5b consulted a stale exterior flood and moved
// two roads OUTSIDE the shipped wall (E9S8 18,24, E17S5 44,36), one of them
// onto the room's own cheapest haul lane. OM3: the tower-swap note rendered the
// PRE-TAKE key set in the present tense and contradicted its own retirement
// sentence. OM9: the container-road note ended on a string constant with no
// record leaf behind it, false in 2 of the 3 rooms that shipped it.
{
  const any23 = (pred) => plans.find((p) => { try { return pred(p); } catch { return false; } })?.room || null;
  const regen23 = (p) => {
    for (let i = 0; i < (p.meta.noteRecords || []).length; i++) {
      try { p.meta.notes[i] = renderNote(p.meta.noteRecords[i]); } catch { /* a throwing record is its own failure */ }
    }
  };
  /** the board moved after the recovery pass ran — where the MF1 guard used to give up */
  const movedBoard23 = (p) => {
    let r = p.meta?.sealedRecovery;
    let g = 0;
    let took = false;
    while (r && typeof r === "object" && g++ < 8) {
      if (r.outcome === "taken") took = true;
      r = r.next;
    }
    return took || !!p.meta?.towers?.acrossPriorTake?.taken;
  };
  /** edit `meta.sealedRecovery` and keep the note-record copy byte-identical */
  const recov23 = (edit) => (p) => {
    const R = p.meta.sealedRecovery;
    if (!R) throw new Error("no sealedRecovery");
    edit(R, p);
    const i = (p.meta.noteRecords || []).findIndex((e) => e && e.cls === "sealedRecovery");
    if (i >= 0) p.meta.noteRecords[i].rec = R;
    regen23(p);
  };
  /** edit `meta.towers.acrossPriorTake` and keep the note-record copy byte-identical */
  const swap23 = (edit) => (p) => {
    const T = p.meta?.towers?.acrossPriorTake;
    if (!T) throw new Error("no acrossPriorTake");
    edit(T, p);
    const i = (p.meta.noteRecords || []).findIndex((e) => e && e.cls === "towerSwap");
    if (i >= 0) p.meta.noteRecords[i].rec = T;
    regen23(p);
  };
  /**
   * THE EXPLOIT, AS A FUNCTION. Move a real declared key out of `declaredKeys`
   * and into `declaredSkipped` wearing the "publishes no quantity" reason, with
   * the instrument omitted, and strike its line out of the published ranking.
   * Three edits, no board tile. The (gate, kind) pair stays exactly where the
   * pre-take channel says it is, which is why the pair is what decides it.
   */
  const demote23 = (R, which = 0) => {
    const K = R.declaredKeys || [];
    const k = K[which];
    if (!k) throw new Error("no declared key to demote");
    R.declaredKeys = K.filter((x) => x !== k);
    R.declaredSkipped = [
      ...(R.declaredSkipped || []),
      {
        at: k.at,
        gate: k.gate,
        kind: k.kind,
        why:
          "this declaration publishes no quantity this pass's instrument panel measures on a finished " +
          "board, so there is nothing here a candidate could be ranked on",
      },
    ];
    if (Array.isArray(R.ranking)) {
      R.ranking = R.ranking.filter((l) => !String(l).includes(`${k.gate}${k.kind ? `/${k.kind}` : ``}`));
    }
    return k;
  };
  const MF1_MSG = "rankable quantity is a property of the";

  // ---- MF1: the demotion sweep, on the boards that moved -------------------
  const movedKeyRoom23 = any23((p) => movedBoard23(p) && (p.meta?.sealedRecovery?.declaredKeys || []).length > 0);
  run("r23/MF1-X-a-declared-KEY-demoted-to-a-no-quantity-SKIP-on-a-moved-board",
    movedKeyRoom23, recov23((R) => { demote23(R, 0); }), MF1_MSG);
  run("r23/MF1-X-the-same-demotion-with-the-ranking-line-left-standing",
    movedKeyRoom23,
    recov23((R) => {
      const K = R.declaredKeys || [];
      const k = K[0];
      R.declaredKeys = K.slice(1);
      R.declaredSkipped = [...(R.declaredSkipped || []), { at: k.at, gate: k.gate, kind: k.kind, why: "this declaration publishes no quantity this pass's instrument panel measures on a finished board" }];
    }),
    MF1_MSG);
  run("r23/MF1-X-EVERY-declared-key-demoted-at-once",
    any23((p) => movedBoard23(p) && (p.meta?.sealedRecovery?.declaredKeys || []).length > 1),
    recov23((R) => { while ((R.declaredKeys || []).length) demote23(R, 0); }), MF1_MSG);
  run("r23/MF1-the-demoted-key-with-its-own-pair-relabelled-out-of-the-map",
    movedKeyRoom23,
    recov23((R) => {
      demote23(R, 0);
      const sk = R.declaredSkipped[R.declaredSkipped.length - 1];
      sk.gate = "eco";
      sk.kind = null;
    }),
    `${MF1_MSG}|the channel this pass read carries`);
  run("r23/MF1-the-demotion-with-the-PRE-TAKE-channel-relabelled-to-match",
    movedKeyRoom23,
    recov23((R) => {
      const k = demote23(R, 0);
      const sk = R.declaredSkipped[R.declaredSkipped.length - 1];
      sk.gate = "eco";
      sk.kind = null;
      if (Array.isArray(R.preTakeShortfalls) && R.preTakeShortfalls[k.at]) {
        R.preTakeShortfalls[k.at] = { at: k.at, gate: "eco", kind: null };
      }
    }),
    "SHIPS the declaration"); // the board anchor is what is left, and it holds
  run("r23/MF1-a-no-quantity-skip-for-a-mapped-pair-on-an-UNMOVED-board",
    any23((p) => !movedBoard23(p) && (p.meta?.sealedRecovery?.declaredKeys || []).length > 0),
    recov23((R) => { demote23(R, 0); }), MF1_MSG);
  run("r23/MF1-X-the-tower-swap-s-declared-key-demoted-on-a-taken-board",
    any23((p) => p.meta?.towers?.acrossPriorTake?.taken && (p.meta.towers.acrossPriorTake.declaredKeys || []).length > 0),
    swap23((T) => { demote23(T, 0); }), MF1_MSG);
  run("r23/MF1-the-tower-swap-s-LAST-declared-key-demoted",
    any23((p) => p.meta?.towers?.acrossPriorTake?.taken && (p.meta.towers.acrossPriorTake.declaredKeys || []).length > 1),
    swap23((T) => { demote23(T, T.declaredKeys.length - 1); }), MF1_MSG);
  run("r23/MF1-a-real-skip-kept-and-a-key-demoted-beside-it",
    any23((p) => movedBoard23(p) && (p.meta?.sealedRecovery?.declaredKeys || []).length > 0 && (p.meta.sealedRecovery.declaredSkipped || []).length > 0),
    recov23((R) => { demote23(R, 0); }), MF1_MSG);

  // ---- MF5: the along-cut refusal's arithmetic, re-derived ----------------
  const NETRE23 = /^every interior parallel (?:breaks the network|makes the network measurably worse)\./;
  // ...and the refusal has to be one the validator WALKS, which is the roster it
  // re-derives from the shipped board: a rampart carrying a road with a D8
  // neighbour that is also a rampart carrying a road. A refusal filed for a tile
  // whose run the take BROKE is not walked at all (E15S1, E7S9), so a case
  // pointed at one of those tests nothing about this gate.
  const inRoster23 = (p, r) => {
    const roads = new Set((p.structures.road || []).map((z) => key(z.x, z.y)));
    const paved = new Set((p.structures.rampart || []).filter((z) => roads.has(key(z.x, z.y))).map((z) => key(z.x, z.y)));
    if (!paved.has(key(r.x, r.y))) return false;
    return D8.some(([dx, dy]) => paved.has(key(r.x + dx, r.y + dy)));
  };
  const isNet23 = (p, r) => NETRE23.test(String(r.why || "")) && /fall off the network/.test(String(r.why)) && inRoster23(p, r);
  const netRoom23 = (extra = () => true) =>
    any23((p) => (p.meta?.walls?.alongCutRefused || []).some((r) => isNet23(p, r) && extra(r, p)));
  /** rewrite one refusal in BOTH string sites the artifact carries it in */
  const refusal23 = (fn, pick = (r, p) => isNet23(p, r)) => (p) => {
    const arr = p.meta?.walls?.alongCutRefused || [];
    const r = arr.find((z) => pick(z, p));
    if (!r) throw new Error("no breaks-network refusal");
    const before = String(r.why);
    r.why = fn(before, r, p);
    if (r.why === before) throw new Error("the rewrite changed nothing");
    const i = (p.meta.noteRecords || []).findIndex((e) => e && e.cls === "pavedRun");
    if (i >= 0) {
      for (const run of p.meta.noteRecords[i].rec.runs || []) {
        if (run && run.x === r.x && run.y === r.y) run.refused = r.why;
      }
    }
    regen23(p);
  };
  // ROUND 24 / OB1: the message moved when the witness exemption died — the
// gate now re-derives on the board the OFFER was priced on, which is the
// shipped board except where a take has to be undone first.
const MF5_MSG = "re-derived under the refusal's own definition";
  run("r23/MF5-X-the-49-49-forgery-a-real-magnitude-rewritten-to-one-tile",
    netRoom23(),
    refusal23((w) => w.replace(/\d+ more road tile\(s\) fall off the network \(\d+ -> \d+; newly off: [^)]*\)/,
      "1 more road tile(s) fall off the network (0 -> 1; newly off: 49,49)")),
    MF5_MSG);
  run("r23/MF5-the-magnitude-inflated-with-a-roster-to-match",
    netRoom23(),
    refusal23((w) => w.replace(/\d+ more road tile\(s\) fall off the network \(\d+ -> \d+; newly off: [^)]*\)/,
      "5 more road tile(s) fall off the network (0 -> 5; newly off: 1,1 1,2 1,3 1,4 1,5)")),
    MF5_MSG);
  run("r23/MF5-one-newly-off-tile-substituted-for-another",
    netRoom23(),
    refusal23((w) => w.replace(/newly off: (-?\d+),(-?\d+)/, "newly off: 3,3")),
    MF5_MSG);
  run("r23/MF5-the-whole-refusal-re-priced-against-a-board-with-three-tiles-already-off",
    netRoom23((r) => r.baseline && r.baseline.offNetwork === 0),
    refusal23((w, r) => {
      r.baseline.offNetwork = 3;
      return w
        .replace(/(\d+) off the network/, "3 off the network")
        .replace(/\((\d+) -> (\d+); newly off:/g, (m, a, b) => `(${Number(a) + 3} -> ${Number(b) + 3}; newly off:`);
    }),
    MF5_MSG);
  run("r23/MF5-the-roster-marked-elided-so-the-tiles-need-not-be-named",
    netRoom23(),
    refusal23((w) => w.replace(/newly off: ([^)]*)\)/, (m, list) => `newly off: ${String(list).trim().split(/\s+/)[0]} …)`)),
    MF5_MSG + "|marks its roster elided");
  // ...and the honest exception is a witness class, not a hole: the parallel is
  // occupied by the swap this room's OWN 5b TOOK, and by nothing else
  const takenParallelTile23 = (p) => {
    const rk = p.meta?.walls?.roadKind || {};
    for (const r of p.meta?.walls?.alongCutRefused || []) {
      if (!NETRE23.test(String(r.why || "")) || !inRoster23(p, r)) continue;
      for (const m of String(r.why).matchAll(/moving it to (-?\d+),(-?\d+) —/g)) {
        if (rk[`${m[1]},${m[2]}`] === "alongCutMoved") return `${m[1]},${m[2]}`;
      }
    }
    return null;
  };
  const takenParallel23 = any23((p) => !!takenParallelTile23(p));
  run("r23/MF5-the-occupied-parallel-exception-claimed-by-a-tile-of-another-pass",
    takenParallel23,
    (p) => {
      const k = takenParallelTile23(p);
      if (!k) throw new Error("no taken parallel");
      p.meta.walls.roadKind[k] = "spur";
      regen23(p);
    },
    "the only occupant this file can undo");
  run("r23/MF5-the-occupied-parallel-with-its-provenance-deleted-altogether",
    takenParallel23,
    (p) => {
      const k = takenParallelTile23(p);
      if (!k) throw new Error("no taken parallel");
      delete p.meta.walls.roadKind[k];
      regen23(p);
    },
    "the only occupant this file can undo");
  // ...and the same arithmetic in a refusal whose RUN THE TAKE BROKE, which the
  // roster loop does not walk and which is therefore where an editor would go
  const brokenRunPick23 = (wantOccupied) => (r, p) => {
    if (!NETRE23.test(String(r.why || "")) || inRoster23(p, r)) return false;
    const roads = new Set((p.structures.road || []).map((z) => key(z.x, z.y)));
    const rk = p.meta?.walls?.roadKind || {};
    for (const m of String(r.why).matchAll(/moving it to (-?\d+),(-?\d+) — ([^·]*)/g)) {
      if (!/fall off the network/.test(m[3])) continue;
      const occ = roads.has(`${m[1]},${m[2]}`);
      if (occ === wantOccupied) return wantOccupied ? rk[`${m[1]},${m[2]}`] === "alongCutMoved" : true;
    }
    return false;
  };
  const brokenRunRoom23 = (wantOccupied) =>
    any23((p) => (p.meta?.walls?.alongCutRefused || []).some((r) => brokenRunPick23(wantOccupied)(r, p)));
  run("r23/MF5-a-forged-magnitude-in-a-refusal-whose-run-the-take-BROKE",
    brokenRunRoom23(false),
    refusal23((w) => w.replace(/\d+ more road tile\(s\) fall off the network \(\d+ -> \d+; newly off: [^)]*\)/,
      "4 more road tile(s) fall off the network (0 -> 4; newly off: 2,2 2,3 2,4 2,5)"), brokenRunPick23(false)),
    MF5_MSG);
  run("r23/MF5-the-taken-parallel-exception-claimed-on-a-broken-run-refusal",
    brokenRunRoom23(true),
    (p) => {
      const r = (p.meta.walls.alongCutRefused || []).find((z) => brokenRunPick23(true)(z, p));
      const roads = new Set((p.structures.road || []).map((z) => key(z.x, z.y)));
      const t = [...String(r.why).matchAll(/moving it to (-?\d+),(-?\d+) —/g)].map((m) => `${m[1]},${m[2]}`).find((k) => roads.has(k));
      p.meta.walls.roadKind[t] = "swampPave";
      regen23(p);
    },
    "the only occupant this file can undo");
  run("r23/MF5-a-refusal-priced-for-a-tile-the-board-does-not-pave",
    brokenRunRoom23(false),
    (p, d) => {
      const r = (p.meta.walls.alongCutRefused || []).find((z) => brokenRunPick23(false)(z, p));
      const free = deepTile(p, d);
      r.x = free.x;
      r.y = free.y;
      regen23(p);
    },
    "ships no road on");

  // ---- OB1: a moved road has to be INSIDE the wall the room ships ----------
  /** a live road tile in this room's EXTERIOR flood — outside its own wall */
  const outsideRoad23 = (p, t) => {
    const ramp = new Set((p.structures.rampart || []).map((r) => key(r.x, r.y)));
    const roads = new Set((p.structures.road || []).map((r) => key(r.x, r.y)));
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
    for (const k of roads) {
      const [x, y] = k.split(",").map(Number);
      if (seen[idx(x, y)]) return k;
    }
    return null;
  };
  const outsideRoadRoom23 = any23((p) => {
    const d = byRoom.get(p.room);
    return !!d && !!outsideRoad23(p, d);
  });
  const OB1_MSG = "OUTSIDE the wall this room SHIPS";
  run("r23/OB1-X-a-road-outside-the-wall-classified-as-the-swap-s-interior-parallel",
    outsideRoadRoom23,
    (p, d) => {
      const k = outsideRoad23(p, d);
      if (!k) throw new Error("no road outside the wall");
      p.meta.walls.roadKind[k] = "alongCutMoved";
      p.meta.walls.alongCutMoved = (p.meta.walls.alongCutMoved || 0) + 1;
    },
    OB1_MSG);
  run("r23/OB1-the-swap-s-own-target-moved-onto-a-tile-outside-the-wall",
    any23((p) => {
      const d = byRoom.get(p.room);
      return (p.meta?.walls?.alongCutMoved || 0) > 0 && !!d && !!outsideRoad23(p, d);
    }),
    (p, d) => {
      const k = outsideRoad23(p, d);
      const was = Object.keys(p.meta.walls.roadKind || {}).find((z) => p.meta.walls.roadKind[z] === "alongCutMoved");
      if (!k || !was) throw new Error("no swap to move");
      delete p.meta.walls.roadKind[was];
      p.meta.walls.roadKind[k] = "alongCutMoved";
    },
    OB1_MSG);

  // ---- MF6: the dead class, dead in every direction it could ship in -------
  const gapRoom23 = any23((p) => (p.structures.extractor || []).length && (p.structures.container || []).length && (p.structures.road || []).length);
  run("r23/MF6-a-pavingGap-note-rendered-over-two-empty-lists",
    gapRoom23,
    (p) => {
      const rec = { stranded: [], gapTiles: [], footReachable: true };
      p.meta.noteRecords.push({ cls: "pavingGap", rec });
      p.meta.notes.push(renderNote({ cls: "pavingGap", rec }));
    },
    "over an EMPTY");
  run("r23/MF6-a-pavingGap-stranded-list-bound-to-nothing",
    gapRoom23,
    (p) => {
      const rec = { stranded: [{ x: 10, y: 10 }], gapTiles: [], footReachable: true };
      p.meta.noteRecords.push({ cls: "pavingGap", rec });
      p.meta.notes.push(renderNote({ cls: "pavingGap", rec }));
    },
    "conductBridge\\.stranded");
  run("r23/MF6-a-pavingGap-gapTiles-list-bound-to-nothing",
    gapRoom23,
    (p) => {
      const rec = { stranded: [], gapTiles: [{ x: 10, y: 10, holds: "nothing this pass can name" }], footReachable: true };
      p.meta.noteRecords.push({ cls: "pavingGap", rec });
      p.meta.notes.push(renderNote({ cls: "pavingGap", rec }));
    },
    "conductBridge\\.gapTiles");
  run("r23/MF6-the-class-is-dead-BY-CONSTRUCTION-a-published-gap-tile-is-a-hard-fail",
    gapRoom23,
    (p) => {
      const t = (p.structures.container || [])[0];
      p.meta.walls.conductBridge = { ...(p.meta.walls.conductBridge || { added: [] }), gapTiles: [{ x: t.x, y: t.y, holds: "container" }] };
    },
    "PAVING GAP REFUSED");

  // ---- OM3: the tower-swap note's tense and its completeness ---------------
  const retireRoom23 = any23((p) => p.meta?.towers?.acrossPriorTake?.retiresClumpDeclaration === true);
  run("r23/OM3-the-retirement-withdrawn-so-a-declaration-the-room-does-not-file-stands-unexplained",
    retireRoom23, swap23((T) => { T.retiresClumpDeclaration = false; }),
    "no clause in the paragraph says it was RETIRED|says this room DECLARES");
  run("r23/OM3-a-declared-key-repointed-at-a-declaration-this-room-does-not-ship",
    any23((p) => (p.meta?.towers?.acrossPriorTake?.declaredKeys || []).length > 0),
    swap23((T, p) => {
      const shipped = new Set((p.meta.shortfalls || []).map((z) => `${z.gate}${z.kind ? `/${z.kind}` : ``}`));
      const k = (T.declaredKeys || []).find((z) => shipped.has(`${z.gate}${z.kind ? `/${z.kind}` : ``}`));
      if (!k) throw new Error("no shipped declared key");
      k.gate = "extensions";
      k.kind = "shallow";
      k.instrument = "shallowExts";
      k.source = "extensions/shallow.count";
    }),
    "no clause in the paragraph says it was RETIRED|says this room DECLARES");
  run("r23/OM3-the-skipped-declaration-dropped-out-of-the-note-s-own-record",
    any23((p) => (p.meta?.towers?.acrossPriorTake?.declaredSkipped || []).length > 0),
    (p) => {
      const i = (p.meta.noteRecords || []).findIndex((e) => e && e.cls === "towerSwap");
      if (i < 0) throw new Error("no towerSwap note");
      const rec = JSON.parse(JSON.stringify(p.meta.noteRecords[i].rec));
      rec.declaredSkipped = [];
      p.meta.noteRecords[i].rec = rec;
      regen23(p);
    },
    "declaredSkipped|the tower-swap record this file re-derives");

  // ---- OM9: what the container road actually holds up ----------------------
  const orphRoom23 = any23((p) => (p.meta?.noteRecords || []).some((e) => e && e.cls === "containerRoad" && e.rec && e.rec.orphanedByRemoval));
  const orph23 = (edit) => (p) => {
    const i = (p.meta.noteRecords || []).findIndex((e) => e && e.cls === "containerRoad");
    if (i < 0) throw new Error("no containerRoad note");
    edit(p.meta.noteRecords[i].rec, p);
    regen23(p);
  };
  run("r23/OM9-the-orphan-set-withdrawn-so-the-sentence-is-free-text-again",
    orphRoom23, orph23((rec) => { delete rec.orphanedByRemoval; }),
    "orphanedByRemoval|cannot be rendered");
  run("r23/OM9-an-orphan-tile-invented",
    orphRoom23, orph23((rec) => { rec.orphanedByRemoval.tiles = [...rec.orphanedByRemoval.tiles, { x: 49, y: 49 }]; }),
    "removing these roads orphans");
  run("r23/OM9-an-orphan-tile-dropped",
    any23((p) => (p.meta?.noteRecords || []).some((e) => e && e.cls === "containerRoad" && (e.rec?.orphanedByRemoval?.tiles || []).length > 1)),
    orph23((rec) => { rec.orphanedByRemoval.tiles = rec.orphanedByRemoval.tiles.slice(1); }),
    "removing these roads orphans");
  run("r23/OM9-the-orphan-set-emptied-so-the-road-buys-nothing-and-says-so",
    orphRoom23, orph23((rec) => { rec.orphanedByRemoval.tiles = []; }),
    "removing these roads orphans");
  run("r23/OM9-the-orphan-set-published-out-of-raster-order",
    any23((p) => (p.meta?.noteRecords || []).some((e) => e && e.cls === "containerRoad" && (e.rec?.orphanedByRemoval?.tiles || []).length > 1)),
    orph23((rec) => { rec.orphanedByRemoval.tiles = rec.orphanedByRemoval.tiles.slice().reverse(); }),
    "removing these roads orphans");
  run("r23/OM9-X-the-controller-container-claimed-orphaned-where-it-stays-connected",
    any23((p) => (p.meta?.noteRecords || []).some((e) => e && e.cls === "containerRoad" && e.rec?.orphanedByRemoval && e.rec.orphanedByRemoval.ctrlContainerOrphaned === false)),
    orph23((rec) => { rec.orphanedByRemoval.ctrlContainerOrphaned = true; }),
    "controller container IS orphaned");
  run("r23/OM9-the-controller-container-claimed-connected-where-it-falls-off",
    any23((p) => (p.meta?.noteRecords || []).some((e) => e && e.cls === "containerRoad" && e.rec?.orphanedByRemoval?.ctrlContainerOrphaned === true)),
    orph23((rec) => { rec.orphanedByRemoval.ctrlContainerOrphaned = false; }),
    "controller container is NOT orphaned");
  run("r23/OM9-the-controller-container-repointed-at-another-box",
    orphRoom23,
    orph23((rec, p) => {
      const o = rec.orphanedByRemoval;
      const other = (p.structures.container || []).find((c) => !o.ctrlContainer || c.x !== o.ctrlContainer.x || c.y !== o.ctrlContainer.y);
      if (!other) throw new Error("one container only");
      o.ctrlContainer = { x: other.x, y: other.y };
    }),
    "as this room's controller container");
  run("r23/OM9-the-deferred-mineral-seat-list-falsified",
    orphRoom23, orph23((rec) => { rec.orphanedByRemoval.mineralSeat = [{ x: 1, y: 1 }]; }),
    "deferred mineral seat");
  run("r23/OM9-a-container-seat-claimed-orphaned-that-is-not",
    orphRoom23,
    orph23((rec, p) => {
      const c = (p.structures.container || [])[0];
      rec.orphanedByRemoval.containersOrphaned = [...(rec.orphanedByRemoval.containersOrphaned || []), { x: c.x, y: c.y }];
    }),
    "orphans the container seat");
  run("r23/OM9-the-orphan-set-s-basis-sentence-withdrawn",
    orphRoom23, orph23((rec) => { rec.orphanedByRemoval.basis = "the removal test"; }),
    "basis");
}

// ===========================================================================
// ROUND 24 — the witness exemption, the layer-7 wall, and declaration order.
// ===========================================================================
// OWNER OB1 (BLOCKING) + MECHANICAL MA (MAJOR): the taken-parallel WITNESS
// CLASS bought unlimited freedom on the price. `netPriceCheck9` bare-returned
// on it, and the round-22 well-formedness block lived inside the shipped-run
// roster loop only — so a room with an EMPTY roster (E17S5) filed every refusal
// it had into a loop where nothing ran at all. Six exploits landed in one
// round: an appended refusal offering the room's own take priced "999 more road
// tile(s) fall off the network (5 -> 3; newly off: 99,99)" passed 172/172, as
// did a 49,49 roster, an invented roster, a 40-more inflation, and a 1-more
// DEFLATION that makes a kept anti-pattern look cheap. And the exemption was
// UNNECESSARY: the offer-time board is `shipped ∪ {from2} \ {t}` and `from2` is
// derivable, so every offer this fleet files re-derives exactly.
//
// OWNER OB2 (BLOCKING): the stale-flood class one stage over — nothing gated a
// spur, a stitch or an ext-face road shipping OUTSIDE the wall.
// MECHANICAL ME: declaration ORDER was derived on no board at all.
// ===========================================================================
{
  const any24 = (pred) => plans.find((p) => { try { return pred(p); } catch { return false; } })?.room || null;
  const NETRE24 = /^every interior parallel (?:breaks the network|makes the network measurably worse)\./;
  const regen24 = (p) => {
    for (let i = 0; i < (p.meta.noteRecords || []).length; i++) {
      try { p.meta.notes[i] = renderNote(p.meta.noteRecords[i]); } catch { /* a throwing record is its own failure */ }
    }
  };
  const roadsOf24 = (p) => new Set((p.structures.road || []).map((r) => key(r.x, r.y)));
  const rampOf24 = (p) => new Set((p.structures.rampart || []).map((r) => key(r.x, r.y)));
  const cutOf24 = (p) => new Set((p.meta?.shell?.cut || []).map((c) => key(c.x, c.y)));
  /** the run roster the validator re-derives: a paved rampart with a paved-rampart D8 neighbour */
  const rosterOf24 = (p) => {
    const roads = roadsOf24(p);
    const paved = new Set((p.structures.rampart || []).filter((z) => roads.has(key(z.x, z.y))).map((z) => key(z.x, z.y)));
    return new Set([...paved].filter((k) => {
      const [x, y] = k.split(",").map(Number);
      return D8.some(([dx, dy]) => paved.has(key(x + dx, y + dy)));
    }));
  };
  /** every priced offer this room files, with everything a case needs to pick one */
  const offers24 = (p) => {
    const out = [];
    const roads = roadsOf24(p);
    const rk = p.meta?.walls?.roadKind || {};
    const roster = rosterOf24(p);
    for (const r of p.meta?.walls?.alongCutRefused || []) {
      const why = String(r?.why || "");
      if (!NETRE24.test(why)) continue;
      const cutAt = why.indexOf("The other neighbours: ");
      const head = cutAt >= 0 ? why.slice(0, cutAt) : why;
      for (const seg of head.split(" · ")) {
        const mm = seg.match(/moving it to (-?\d+),(-?\d+) — ([\s\S]*)$/);
        if (!mm) continue;
        const t = key(Number(mm[1]), Number(mm[2]));
        out.push({
          rec: r,
          from: key(r.x, r.y),
          t,
          cost: mm[3],
          axis: /fall off the network/.test(mm[3]) ? "road" : /more container\(s\) are left with no road/.test(mm[3]) ? "container" : "other",
          witness: roads.has(t) && rk[t] === "alongCutMoved",
          inRoster: roster.has(key(r.x, r.y)),
        });
      }
    }
    return out;
  };
  const hasOffer24 = (pred) => (p) => offers24(p).some(pred);
  /** rewrite the price of the FIRST offer matching `pred`, in the record and in the note */
  const reprice24 = (pred, fn) => (p) => {
    const o = offers24(p).find(pred);
    if (!o) throw new Error("no offer of the required class");
    const before = String(o.rec.why);
    const [tx, ty] = o.t.split(",");
    const re = new RegExp(`(moving it to ${tx},${ty} — )([\\s\\S]*?)( —|\\)\\.| The swap is offered| · moving it to)`);
    const after = before.replace(re, (m, head, price, tail) => head + fn(price, o, p) + tail);
    if (after === before) throw new Error("the rewrite changed nothing");
    o.rec.why = after;
    const i = (p.meta.noteRecords || []).findIndex((e) => e && e.cls === "pavedRun");
    if (i >= 0) {
      for (const rr of p.meta.noteRecords[i].rec.runs || []) {
        if (rr && rr.x === o.rec.x && rr.y === o.rec.y) rr.refused = o.rec.why;
      }
    }
    regen24(p);
    return { note: `${o.from} -> ${o.t}` };
  };
  const ROAD_PRICE24 = /^\d+ more road tile\(s\) fall off the network \(\d+ -> \d+; newly off: [^)]*\)/;
  const witnessRoad24 = (o) => o.witness && o.axis === "road";
  const witnessRoom24 = any24(hasOffer24(witnessRoad24));
  const OB1_MAG = "re-derived under the refusal's own definition";
  const OB1_WF = "That it IS a subtraction";

  // ---- the witness class, priced on the reconstructed offer-time board -----
  run("r24/OB1-X-a-witness-offer-s-magnitude-INFLATED-with-a-roster-to-match",
    witnessRoom24,
    reprice24(witnessRoad24, () => "40 more road tile(s) fall off the network (0 -> 40; newly off: 1,1 1,2 1,3 1,4 1,5 1,6 …)"),
    OB1_MAG);
  run("r24/OB1-X-a-witness-offer-DEFLATED-so-the-kept-anti-pattern-looks-cheap",
    witnessRoom24,
    reprice24(witnessRoad24, () => "1 more road tile(s) fall off the network (0 -> 1; newly off: 3,3)"),
    OB1_MAG);
  run("r24/OB1-X-the-49-49-forgery-on-a-witness-offer",
    witnessRoom24,
    reprice24(witnessRoad24, () => "1 more road tile(s) fall off the network (0 -> 1; newly off: 49,49)"),
    OB1_MAG);
  run("r24/OB1-X-a-witness-offer-s-roster-invented-tile-for-tile",
    witnessRoom24,
    reprice24(witnessRoad24, (price) => price.replace(/newly off: [^)]*\)/, "newly off: 2,2 2,3 2,4 2,5 2,6 2,7 …)")),
    OB1_MAG);
  run("r24/OB1-X-a-witness-offer-priced-999-more-on-readings-that-IMPROVE",
    witnessRoom24,
    reprice24(witnessRoad24, () => "999 more road tile(s) fall off the network (5 -> 3; newly off: 99,99)"),
    OB1_WF);
  run("r24/OB1-a-witness-offer-priced-against-a-board-its-own-baseline-does-not-read",
    witnessRoom24,
    reprice24(witnessRoad24, (price) => price.replace(/\((\d+) -> (\d+);/, (m, a, b) => `(${Number(a) + 2} -> ${Number(b) + 2};`)),
    OB1_WF);
  run("r24/OB1-a-witness-offer-with-its-roster-marked-elided-so-the-tiles-need-not-be-named",
    witnessRoom24,
    reprice24(witnessRoad24, (price) => price.replace(/newly off: ([^)]*)\)/, (m, list) => `newly off: ${String(list).trim().split(/\s+/)[0]} …)`)),
    `${OB1_WF}|${OB1_MAG}`);
  run("r24/OB1-a-witness-offer-naming-a-tile-off-the-50x50-board",
    witnessRoom24,
    reprice24(witnessRoad24, (price) => price.replace(/newly off: [^)]*\)/, "newly off: 99,99)")),
    `${OB1_WF}|${OB1_MAG}`);
  run("r24/OB1-the-taken-parallel-s-provenance-repointed-at-another-pass",
    witnessRoom24,
    (p) => {
      const o = offers24(p).find(witnessRoad24);
      p.meta.walls.roadKind[o.t] = "spur";
      regen24(p);
    },
    "provenance is");
  run("r24/OB1-the-taken-parallel-s-provenance-deleted-so-nothing-can-be-undone",
    witnessRoom24,
    (p) => {
      const o = offers24(p).find(witnessRoad24);
      delete p.meta.walls.roadKind[o.t];
      regen24(p);
    },
    "provenance is|carry NO provenance");
  run("r24/OB1-X-the-take-s-ORIGIN-paved-so-the-offer-time-board-cannot-be-recovered",
    witnessRoom24,
    (p) => {
      const o = offers24(p).find(witnessRoad24);
      const roads = roadsOf24(p);
      const ramp = rampOf24(p);
      const [tx, ty] = o.t.split(",").map(Number);
      const from2 = D8.map(([dx, dy]) => key(tx + dx, ty + dy)).find((k) => ramp.has(k) && !roads.has(k));
      if (!from2) throw new Error("no reconstructible origin");
      const [fx, fy] = from2.split(",").map(Number);
      p.structures.road = [...p.structures.road, { x: fx, y: fy }];
      if (p.meta.counts && typeof p.meta.counts.road === "number") p.meta.counts.road++;
      if (p.meta.roadLayer) p.meta.roadLayer[from2] = 1;
      regen24(p);
    },
    "cannot be undone");

  // ---- the out-of-roster loop: the E17S5 class, where NOTHING ran ----------
  //
  // The forgery is the one the owner landed: an appended refusal, sited on a
  // road tile the shipped roster does not carry, offering the room's own taken
  // parallel. Every structural gate is satisfied by construction — the point of
  // the case is that the PRICE is now checked in this loop too.
  const forgeSite24 = (p) => {
    const rk = p.meta?.walls?.roadKind || {};
    const roads = roadsOf24(p);
    const roster = rosterOf24(p);
    const cut = cutOf24(p);
    const filed = new Set((p.meta?.walls?.alongCutRefused || []).map((r) => key(r.x, r.y)));
    for (const [k, kind] of Object.entries(rk)) {
      if (kind !== "alongCutMoved") continue;
      const [tx, ty] = k.split(",").map(Number);
      for (const [dx, dy] of D8) {
        const fx = tx + dx;
        const fy = ty + dy;
        const fk = key(fx, fy);
        if (fx < 1 || fy < 1 || fx > 48 || fy > 48) continue;
        if (!roads.has(fk) || roster.has(fk) || filed.has(fk) || cut.has(fk)) continue;
        return { from: { x: fx, y: fy }, t: { x: tx, y: ty } };
      }
    }
    return null;
  };
  const forgeRoom24 = any24((p) => !!forgeSite24(p));
  /** the four-reading closing sentence, so the forged refusal is internally consistent */
  const forgeWhy24 = (t, price, base) =>
    `every interior parallel makes the network measurably worse. moving it to ${t.x},${t.y} — ${price} — ` +
    `they are no longer D8-connected to the sitter over roads and containers. The swap is offered at equal ` +
    `road count and taken only when the network is measurably no worse — a fact that is already true of the ` +
    `un-swapped board prices nothing, so the comparison is against this room as it stands ` +
    `(${base.roads} live road tiles · ${base.offNetwork} off the network · ${base.containersWithoutFace} ` +
    `container(s) with no road neighbour · ${base.extensionsWithoutFace} extension(s) with no D4 road face); ` +
    `this one is worse on a named axis, so the tile stays.`;
  /** append a forged out-of-roster refusal; `shape` may re-point the offer or bend the record */
  const forge24 = (price, shape = () => {}) => (p) => {
    const site = forgeSite24(p);
    if (!site) throw new Error("no forgery site");
    const base = {
      roads: (p.structures.road || []).length,
      offNetwork: 0,
      containersWithoutFace: 0,
      extensionsWithoutFace: 0,
    };
    const rec = {
      x: site.from.x,
      y: site.from.y,
      kind: "breaks-network",
      offered: [{ x: site.t.x, y: site.t.y }],
      baseline: base,
      why: forgeWhy24(site.t, price, base),
    };
    shape(rec, p, site, base);
    p.meta.walls.alongCutRefused = [...(p.meta.walls.alongCutRefused || []), rec];
    regen24(p);
    return { note: `${site.from.x},${site.from.y} -> ${site.t.x},${site.t.y}` };
  };
  run("r24/OB1-X-THE-FORGERY-an-appended-out-of-roster-refusal-offering-the-room-s-own-take",
    forgeRoom24,
    forge24("9 more road tile(s) fall off the network (0 -> 9; newly off: 1,1 1,2 1,3 1,4 1,5 1,6 …)"),
    // either branch of the reconstruction is a bite: the forged refusal is
    // priced on a board that either re-derives against it or cannot be named
    `${OB1_MAG}|cannot be undone`);
  run("r24/OB1-X-THE-FORGERY-with-self-contradicting-absurd-numbers",
    forgeRoom24,
    forge24("999 more road tile(s) fall off the network (5 -> 3; newly off: 99,99)"),
    OB1_WF);
  run("r24/OB1-an-out-of-roster-price-whose-quoted-difference-is-not-its-own-subtraction",
    forgeRoom24,
    forge24("3 more road tile(s) fall off the network (0 -> 5; newly off: 1,1 1,2 1,3 1,4 1,5)"),
    "its own two readings differ by");
  run("r24/OB1-an-out-of-roster-price-read-off-a-board-its-own-baseline-does-not-describe",
    forgeRoom24,
    forge24("1 more road tile(s) fall off the network (2 -> 3; newly off: 1,1)"),
    "the two terms of a subtraction have to be readings of the same board");
  run("r24/OB1-an-out-of-roster-roster-shorter-than-the-difference-it-claims",
    forgeRoom24,
    forge24("3 more road tile(s) fall off the network (0 -> 3; newly off: 1,1)"),
    "newly-affected tile\\(s\\) against a difference of");
  run("r24/OB1-an-out-of-roster-roster-naming-a-tile-off-the-board",
    forgeRoom24,
    forge24("1 more road tile(s) fall off the network (0 -> 1; newly off: 99,99)"),
    "is not a tile of this room");
  run("r24/OB1-an-out-of-roster-price-that-IMPROVES-the-axis-it-claims-to-worsen",
    forgeRoom24,
    forge24("-2 more road tile(s) fall off the network (5 -> 3; newly off: 1,1)"),
    "which is not WORSE");
  run("r24/OB1-an-out-of-roster-refusal-offering-a-tile-that-is-not-a-neighbour",
    forgeRoom24,
    forge24("1 more road tile(s) fall off the network (0 -> 1; newly off: 1,1)", (rec, p, site) => {
      const far = { x: site.t.x + 4, y: site.t.y + 4 };
      rec.offered = [far];
      rec.why = rec.why.replace(`moving it to ${site.t.x},${site.t.y}`, `moving it to ${far.x},${far.y}`);
    }),
    "not D8-adjacent");
  run("r24/OB1-an-out-of-roster-refusal-offering-a-CUT-tile-as-an-interior-parallel",
    any24((p) => {
      const site = forgeSite24(p);
      if (!site) return false;
      const cut = cutOf24(p);
      return D8.some(([dx, dy]) => cut.has(key(site.from.x + dx, site.from.y + dy)));
    }),
    forge24("1 more road tile(s) fall off the network (0 -> 1; newly off: 1,1)", (rec, p, site) => {
      const cut = cutOf24(p);
      const c = D8.map(([dx, dy]) => ({ x: site.from.x + dx, y: site.from.y + dy })).find((z) => cut.has(key(z.x, z.y)));
      rec.offered = [c];
      rec.why = rec.why.replace(`moving it to ${site.t.x},${site.t.y}`, `moving it to ${c.x},${c.y}`);
    }),
    "itself a cut tile");
  run("r24/OB1-an-out-of-roster-refusal-that-prices-a-swap-and-publishes-no-baseline",
    forgeRoom24,
    forge24("1 more road tile(s) fall off the network (0 -> 1; newly off: 1,1)", (rec) => { delete rec.baseline; }),
    "publishes `baseline`");
  run("r24/OB1-an-out-of-roster-refusal-whose-sentence-and-record-read-two-boards",
    forgeRoom24,
    forge24("1 more road tile(s) fall off the network (0 -> 1; newly off: 1,1)", (rec) => { rec.baseline.containersWithoutFace = 7; }),
    "The paragraph and the record are one measurement of one board");
  run("r24/OB1-an-out-of-roster-refusal-that-names-no-offer-at-all",
    forgeRoom24,
    forge24("1 more road tile(s) fall off the network (0 -> 1; newly off: 1,1)", (rec) => {
      rec.why = rec.why.replace(/moving it to [^—]+— [^—]+— /, "");
      rec.offered = [];
    }),
    "names none of them");

  // ---- the OTHER axes, which the roster loop used to refuse outright ------
  const contOffer24 = (o) => o.axis === "container";
  const contRoom24 = any24(hasOffer24(contOffer24));
  run("r24/OB1-a-container-axis-price-inflated-past-the-board-that-answers-it",
    contRoom24,
    reprice24(contOffer24, () => "2 more container(s) are left with no road on any of their 8 neighbours (1 -> 3; newly stranded: 1,1 1,2)"),
    OB1_MAG);
  run("r24/OB1-a-container-axis-newly-stranded-tile-substituted",
    contRoom24,
    reprice24(contOffer24, (price) => price.replace(/newly stranded: [^)]*\)/, "newly stranded: 4,4)")),
    OB1_MAG);
  run("r24/OB1-a-container-axis-price-re-labelled-as-a-road-axis-one",
    contRoom24,
    reprice24(contOffer24, () => "1 more road tile(s) fall off the network (0 -> 1; newly off: 5,5)"),
    OB1_MAG);
  run("r24/OB1-a-container-axis-roster-marked-elided-where-this-price-prints-it-whole",
    contRoom24,
    reprice24(contOffer24, (price) => price.replace(/newly stranded: ([^)]*)\)/, "newly stranded: …)")),
    "the elision is not one this pass can produce|newly-affected tile");

  // ---- OB2: the whole of layer 7 is inside the wall, or it says why -------
  /** a live road tile in this room's exterior flood, with its provenance re-pointed */
  const outsideRoad24 = (p, t) => {
    const ramp = rampOf24(p);
    const seen = new Uint8Array(2500);
    const q = [];
    const seed = (x, y) => {
      if (x < 0 || y < 0 || x > 49 || y > 49) return;
      if (isWall(t.terrain, x, y) || ramp.has(key(x, y))) return;
      if (seen[idx(x, y)]) return;
      seen[idx(x, y)] = 1;
      q.push([x, y]);
    };
    for (let i = 0; i < 50; i++) { seed(i, 0); seed(i, 49); seed(0, i); seed(49, i); }
    for (let qi = 0; qi < q.length; qi++) {
      const [x, y] = q[qi];
      for (const [dx, dy] of D8) seed(x + dx, y + dy);
    }
    for (const r of p.structures.road || []) if (seen[idx(r.x, r.y)]) return key(r.x, r.y);
    return null;
  };
  const outsideRoom24 = any24((p) => {
    const d = byRoom.get(p.room);
    return !!d && !!outsideRoad24(p, d);
  });
  const OB2_MSG = "sit OUTSIDE the wall this room";
  for (const kind of ["stitch", "reflow", "extFace", "spur"]) {
    run(`r24/OB2-X-a-layer-7-${kind}-road-shipped-OUTSIDE-the-wall`,
      outsideRoom24,
      (p, d) => {
        const k = outsideRoad24(p, d);
        if (!k) throw new Error("no road outside the wall");
        p.meta.walls.roadKind[k] = kind;
        p.meta.roadLayer[k] = 7;
      },
      OB2_MSG);
  }

  // ---- OB2: the enclosure contract the four placement layers run under ----
  const ecRoom24 = any24((p) => Array.isArray(p.meta?.exteriorContract) && p.meta.exteriorContract.length === 4);
  const EC_MSG = "meta.exteriorContract";
  run("r24/OB2-the-enclosure-contract-withdrawn-so-the-frozen-flood-is-read-on-trust",
    ecRoom24, (p) => { delete p.meta.exteriorContract; }, EC_MSG);
  run("r24/OB2-one-consumer-dropped-out-of-the-enclosure-contract",
    ecRoom24, (p) => { p.meta.exteriorContract = p.meta.exteriorContract.slice(1); }, EC_MSG);
  run("r24/OB2-the-contract-published-out-of-the-order-the-layers-run-in",
    ecRoom24, (p) => { p.meta.exteriorContract = p.meta.exteriorContract.slice().reverse(); }, EC_MSG);
  run("r24/OB2-X-a-placement-layer-EXPOSING-tiles-and-declaring-nothing",
    ecRoom24,
    (p) => { p.meta.exteriorContract[0] = { ...p.meta.exteriorContract[0], exposed: 2, exposedTiles: ["1,1", "1,2"] }; },
    "files no `exterior` declaration about it");
  run("r24/OB2-X-an-exterior-declaration-filed-over-a-contract-that-exposed-nothing",
    ecRoom24,
    (p) => {
      p.meta.shortfalls = [
        ...(p.meta.shortfalls || []),
        {
          gate: "exterior",
          kind: null,
          detail: "a placement layer stood a structure outside the wall this room ships.",
          tiles: [{ x: 1, y: 1 }],
        },
      ];
    },
    "reads `exposed` 0 at every one of its|UNRENDERED DECLARATION KIND");
  run("r24/OB2-a-contract-entry-whose-counts-are-not-tile-counts",
    ecRoom24,
    (p) => { p.meta.exteriorContract[1] = { ...p.meta.exteriorContract[1], exposed: null }; },
    "both are tile counts");

  // ---- ME: the order the note claims, derived against the board -----------
  const recWithKeys24 = (p) => {
    const out = [];
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (Array.isArray(node.declaredKeys) && Array.isArray(node.preTakeShortfalls)) out.push(node);
      for (const k of Object.keys(node)) walk(node[k]);
    };
    walk(p.meta);
    return out;
  };
  const moved24 = (p) => {
    let r = p.meta?.sealedRecovery;
    let g = 0;
    let took = false;
    while (r && typeof r === "object" && g++ < 8) { if (r.outcome === "taken") took = true; r = r.next; }
    return took || !!p.meta?.towers?.acrossPriorTake?.taken;
  };
  const twoKeyRoom24 = (wantMoved) =>
    any24((p) => moved24(p) === wantMoved && recWithKeys24(p).some((R) => (R.declaredKeys || []).length > 1));
  /** swap two real keys' declaration indices, and re-order the pre-take channel and the ranking to match */
  const permute24 = (p) => {
    for (const R of recWithKeys24(p)) {
      const K = R.declaredKeys || [];
      if (K.length < 2) continue;
      const a = K[0];
      const b = K[1];
      const ia = a.at;
      const ib = b.at;
      a.at = ib;
      b.at = ia;
      R.declaredKeys = [b, a, ...K.slice(2)];
      const P = R.preTakeShortfalls;
      const pa = P[ia];
      const pb = P[ib];
      P[ia] = { ...pb, at: ia };
      P[ib] = { ...pa, at: ib };
      if (Array.isArray(R.ranking)) {
        const la = R.ranking.findIndex((l) => String(l).includes(`${a.gate}${a.kind ? `/${a.kind}` : ``} declares`));
        const lb = R.ranking.findIndex((l) => String(l).includes(`${b.gate}${b.kind ? `/${b.kind}` : ``} declares`));
        if (la >= 0 && lb >= 0) {
          const tmp = R.ranking[la];
          R.ranking[la] = R.ranking[lb];
          R.ranking[lb] = tmp;
        }
      }
    }
    regen24(p);
  };
  const ME_MSG = "pre-take declaration channel|publishes its declared keys in the order";
  run("r24/ME-X-two-real-declared-keys-permuted-with-the-pre-take-channel-on-a-MOVED-board",
    twoKeyRoom24(true), permute24, ME_MSG);
  run("r24/ME-X-the-same-permutation-on-an-UNMOVED-board",
    twoKeyRoom24(false), permute24, ME_MSG);
  run("r24/ME-the-pre-take-channel-re-ordered-on-its-own",
    any24((p) => recWithKeys24(p).some((R) => (R.preTakeShortfalls || []).length > 1)),
    (p) => {
      for (const R of recWithKeys24(p)) {
        const P = R.preTakeShortfalls;
        if (!P || P.length < 2) continue;
        const a = P[0];
        const b = P[1];
        R.preTakeShortfalls = [{ ...b, at: 0 }, { ...a, at: 1 }, ...P.slice(2)];
      }
      regen24(p);
    },
    ME_MSG + "|a second opinion about it");
  // ...and the SKIP that is swapped may not be the `eco` declaration: `eco` is
  // the one entry this pipeline re-files at the end, so the spine comparison
  // deliberately sets it aside — and it is never a key, so moving it past a key
  // in a record with one key reorders nothing anybody applies. The case picks a
  // skip that IS anchored, which is every other one.
  const nonEcoSkip24 = (R) => (R.declaredSkipped || []).find((s) => s && s.gate !== "eco");
  run("r24/ME-a-KEY-and-a-SKIP-swapped-at-their-declaration-indices",
    any24((p) => recWithKeys24(p).some((R) => (R.declaredKeys || []).length && nonEcoSkip24(R))),
    (p) => {
      for (const R of recWithKeys24(p)) {
        const k = (R.declaredKeys || [])[0];
        const s = nonEcoSkip24(R);
        if (!k || !s) continue;
        const P = R.preTakeShortfalls;
        const pk = P[k.at];
        const ps = P[s.at];
        P[k.at] = { ...ps, at: k.at };
        P[s.at] = { ...pk, at: s.at };
        const t = k.at;
        k.at = s.at;
        s.at = t;
        R.declaredKeys = (R.declaredKeys || []).slice().sort((x, y) => x.at - y.at);
      }
      regen24(p);
    },
    ME_MSG + "|a second opinion about it|the channel this pass read carries");
  run("r24/ME-the-key-list-published-out-of-its-own-declaration-order",
    twoKeyRoom24(false),
    (p) => {
      for (const R of recWithKeys24(p)) {
        if ((R.declaredKeys || []).length > 1) R.declaredKeys = R.declaredKeys.slice().reverse();
      }
      regen24(p);
    },
    "out of declaration order|publishes its declared keys in the order");

  // ---- OM3: a pass verdict on a lap nothing judged ------------------------
  //
  // The record's own second hurdle is `metric.gatedPairs`, so this is checkable
  // on the artifact: put the verdict phrase back into the paragraph of a room
  // whose gate judged nothing and the room fails, whichever way the renderer
  // currently spells the honest version.
  const unjudgedRoom24 = any24((p) => (p.meta?.shortfalls || []).some((sf) => sf && sf.gate === "mobility" && !sf.kind && sf.metric && sf.metric.gatedPairs === 0));
  run("r24/OM3-X-the-verdict-phrase-restored-to-a-declaration-whose-gate-judged-nothing",
    unjudgedRoom24,
    (p) => {
      const sf = (p.meta.shortfalls || []).find((z) => z && z.gate === "mobility" && !z.kind && z.metric && z.metric.gatedPairs === 0);
      // wording-independent on purpose: whatever the honest headline says, this
      // one states the verdict and says nothing about a measurement not taken
      sf.detail =
        `AS BUILT the defender lap is ${sf.metric.maxGated} over pairs costing more than ` +
        `${sf.metric.detourFloor} tiles of detour, INSIDE the ${sf.metric.target} target (ungated over ` +
        `every pair it is ${sf.metric.max})` +
        String(sf.detail).replace(/^[^:]*/, "").replace(/NOT JUDGED AT ALL|NOT JUDGED|UNJUDGED|judged NO PAIR|no verdict/gi, "judged");
    },
    "gate judged `metric.gatedPairs`");
  run("r24/OM3-the-non-verdict-wording-quietly-dropped",
    unjudgedRoom24,
    (p) => {
      const sf = (p.meta.shortfalls || []).find((z) => z && z.gate === "mobility" && !z.kind && z.metric && z.metric.gatedPairs === 0);
      sf.detail = String(sf.detail).replace(/NOT JUDGED AT ALL|NOT JUDGED|UNJUDGED|judged NO PAIR|no verdict/gi, "judged");
    },
    "gate judged `metric.gatedPairs`");
}

// ===========================================================================
// 2a-r25. ROUND 25 — THE CHANNELS THE REVIEWERS GOT THROUGH.
// ===========================================================================
// Seven rosters, each written against a specific escape this round found:
//   MM1  the film caption's reason, checked as OUTPUT (the source guard had
//        three doors: a reword, a template-literal window truncation and a
//        comment that satisfied the call-site count);
//   OB1  the film's rampart taxonomy vs the note channel's, tile by tile;
//   OM1  a pass verdict on a lap nothing judged, on the KINDED declaration the
//        round-24 gate was scoped away from;
//   OM2  a sealedRecovery roster stated in the shipped board's present tense;
//   MM2  `withheld` — zeroed, inflated, DECREASING, and its witness;
//   MM3  the `eco` skip's index, which the spine comparison filters out;
//   ML7  the `exterior` declaration class, which now has a passing state.
{
  const any25 = (pred) => plans.find((p) => { try { return pred(p); } catch { return false; } })?.room || null;
  const regen25 = (p) => {
    for (let i = 0; i < (p.meta.noteRecords || []).length; i++) {
      try { p.meta.notes[i] = renderNote(p.meta.noteRecords[i]); } catch { /* a throwing record is its own failure */ }
    }
  };

  // ---- MM1: the unjudged reason, three channels, compared as output -------
  //
  // The three channels are printed into out-v2 by the build; the RECORD is what
  // this suite can move. Moving `maxDetour` across the detour floor moves the
  // reason the shared helper derives — and the pages still print the other one,
  // which is exactly the state each of the round-24 rewrites shipped.
  const unjudged25 = any25(
    (p) => p.meta?.walls?.mobility?.builtGated === 0 && typeof p.meta.walls.mobility.maxDetour === "number" && p.meta.walls.mobility.maxDetour <= 4,
  );
  const unjudgedCovered25 = any25(
    (p) => p.meta?.walls?.mobility?.builtGated === 0 && typeof p.meta.walls.mobility.maxDetour === "number" && p.meta.walls.mobility.maxDetour > 4,
  );
  const judged25 = any25((p) => typeof p.meta?.walls?.mobility?.builtGated === "number" && p.meta.walls.mobility.builtGated > 0);
  const CAPTION_MSG = "walls/mobility-caption";
  run("r25/MM1-X-the-unjudged-reason-flipped-to-the-COVERAGE-branch-under-pages-printing-the-other",
    unjudged25,
    (p) => { p.meta.walls.mobility.maxDetour = 33; if (p.meta.shell?.mobilityBuilt) p.meta.shell.mobilityBuilt.maxDetour = 33; },
    CAPTION_MSG);
  run("r25/MM1-X-the-unjudged-reason-flipped-to-the-SHORT-DETOUR-branch-the-same-way",
    unjudgedCovered25,
    (p) => { p.meta.walls.mobility.maxDetour = 2; if (p.meta.shell?.mobilityBuilt) p.meta.shell.mobilityBuilt.maxDetour = 2; },
    CAPTION_MSG);
  run("r25/MM1-a-judged-room-re-published-as-unjudged-so-no-channel-prints-a-reason",
    judged25,
    (p) => {
      p.meta.walls.mobility.builtGated = 0;
      p.meta.walls.mobility.maxDetour = 9;
      if (p.meta.shell?.mobilityBuilt) { p.meta.shell.mobilityBuilt.maxGated = 0; p.meta.shell.mobilityBuilt.maxDetour = 9; }
    },
    CAPTION_MSG);

  // ---- OB1: the film's rampart class vs the note channel's ----------------
  const filmRoom25 = any25((p) => (p.structures?.rampart || []).length > 0 && (p.meta?.shell?.cut || []).length > 0);
  const FILM_MSG = "the film captions|the film for this room|never paints";
  const rampNotCut25 = (p) => {
    const cut = new Set((p.meta?.shell?.cut || []).map((c) => key(c.x, c.y)));
    return (p.structures.rampart || []).find((r) => !cut.has(key(r.x, r.y))) || null;
  };
  run("r25/OB1-X-a-cut-tile-dropped-so-a-CROSSING-rampart-re-classes-under-the-film-s-caption",
    filmRoom25,
    (p) => {
      const cutT = (p.meta.shell.cut || []).find((c) => (p.structures.rampart || []).some((r) => r.x === c.x && r.y === c.y));
      if (!cutT) throw new Error("no ramparted cut tile");
      p.meta.shell.cut = p.meta.shell.cut.filter((c) => !(c.x === cutT.x && c.y === cutT.y));
    },
    FILM_MSG);
  run("r25/OB1-X-a-stand-denial-tile-dropped-so-a-RING-rampart-re-classes",
    any25((p) => {
      const ramp = new Set((p.structures?.rampart || []).map((r) => key(r.x, r.y)));
      const cut = new Set((p.meta?.shell?.cut || []).map((c) => key(c.x, c.y)));
      const own = new Set();
      for (const t of Object.keys(p.structures || {})) if (t !== "rampart" && t !== "road") for (const q of p.structures[t] || []) own.add(key(q.x, q.y));
      return (p.meta?.shell?.standDenial || []).some((c) => ramp.has(key(c.x, c.y)) && !cut.has(key(c.x, c.y)) && !own.has(key(c.x, c.y)));
    }),
    (p) => {
      const ramp = new Set((p.structures.rampart || []).map((r) => key(r.x, r.y)));
      const cut = new Set((p.meta.shell.cut || []).map((c) => key(c.x, c.y)));
      const own = new Set();
      for (const t of Object.keys(p.structures)) if (t !== "rampart" && t !== "road") for (const q of p.structures[t] || []) own.add(key(q.x, q.y));
      const ring = (p.meta.shell.standDenial || []).find((c) => ramp.has(key(c.x, c.y)) && !cut.has(key(c.x, c.y)) && !own.has(key(c.x, c.y)));
      p.meta.shell.standDenial = p.meta.shell.standDenial.filter((c) => c !== ring);
    },
    FILM_MSG);
  /** a stand-denial rampart carrying nothing — the film captions it `ring` */
  const bareRing25 = (p) => {
    const ramp = new Set((p.structures?.rampart || []).map((r) => key(r.x, r.y)));
    const cut = new Set((p.meta?.shell?.cut || []).map((c) => key(c.x, c.y)));
    const own = new Set();
    for (const t of Object.keys(p.structures || {})) {
      if (t === "rampart" || t === "road") continue;
      for (const q of p.structures[t] || []) own.add(key(q.x, q.y));
    }
    return (p.meta?.shell?.standDenial || []).find((c) => ramp.has(key(c.x, c.y)) && !cut.has(key(c.x, c.y)) && !own.has(key(c.x, c.y))) || null;
  };
  run("r25/OB1-X-a-container-planted-under-a-rampart-the-film-captions-as-the-stand-denial-ring",
    any25((p) => !!bareRing25(p)),
    (p) => {
      const r = bareRing25(p);
      if (!r) throw new Error("no bare ring rampart");
      p.structures.container = [...(p.structures.container || []), { x: r.x, y: r.y }];
    },
    FILM_MSG);
  run("r25/OB1-a-rampart-the-film-never-paints",
    filmRoom25,
    (p, d) => {
      const t = deepTile(p, d);
      if (!t) throw new Error("no free tile");
      p.structures.rampart = [...(p.structures.rampart || []), t];
    },
    "never paints");
  run("r25/OB1-a-rampart-deleted-under-a-tile-the-film-still-captions",
    filmRoom25,
    (p) => {
      const r = rampNotCut25(p) || (p.structures.rampart || [])[0];
      p.structures.rampart = (p.structures.rampart || []).filter((z) => !(z.x === r.x && z.y === r.y));
    },
    FILM_MSG);

  // ---- OM1: the kinded mobility declaration's verdict ---------------------
  const coveredUnjudged25 = any25((p) =>
    (p.meta?.shortfalls || []).some((sf) => sf && sf.gate === "mobility" && sf.kind === "covered-detour" && sf.record && sf.record.gatedPairs === 0),
  );
  const coveredJudged25 = any25((p) =>
    (p.meta?.shortfalls || []).some((sf) => sf && sf.gate === "mobility" && sf.kind === "covered-detour" && sf.record && sf.record.gatedPairs > 0),
  );
  const OM1_MSG = "gate judged `record.gatedPairs`";
  run("r25/OM1-X-the-pass-verdict-restored-to-a-KINDED-declaration-whose-gate-judged-nothing",
    coveredUnjudged25,
    (p) => {
      const sf = p.meta.shortfalls.find((z) => z && z.gate === "mobility" && z.kind === "covered-detour" && z.record && z.record.gatedPairs === 0);
      sf.detail =
        String(sf.detail).replace(/NOT JUDGED AT ALL|NOT JUDGED|UNJUDGED|judged NO PAIR|no verdict/gi, "judged") +
        ` THE VERDICT, for contrast: over the ${sf.record.gatedPairs} pair(s) this room's gate does judge the lap ` +
        `is ${sf.record.gatedLap}, inside the target.`;
    },
    OM1_MSG);
  run("r25/OM1-the-non-verdict-wording-dropped-from-the-KINDED-declaration",
    coveredUnjudged25,
    (p) => {
      const sf = p.meta.shortfalls.find((z) => z && z.gate === "mobility" && z.kind === "covered-detour" && z.record && z.record.gatedPairs === 0);
      sf.detail = String(sf.detail).replace(/NOT JUDGED AT ALL|NOT JUDGED|UNJUDGED|judged NO PAIR|no verdict/gi, "judged");
    },
    OM1_MSG);
  run("r25/OM1-a-JUDGED-kinded-declaration-re-published-as-having-judged-nothing",
    coveredJudged25,
    (p) => {
      const sf = p.meta.shortfalls.find((z) => z && z.gate === "mobility" && z.kind === "covered-detour" && z.record && z.record.gatedPairs > 0);
      sf.record.gatedPairs = 0;
    },
    OM1_MSG + "|the shipped paragraph is not the paragraph this record generates");

  // ---- OM2: the pre-take roster, told in the present tense ----------------
  const recovTaken25 = any25((p) =>
    (p.meta?.noteRecords || []).some((e) => e && e.cls === "sealedRecovery" && e.rec && e.rec.outcome === "taken"),
  );
  const OM2_MSG = "states its candidate roster in the shipped board's present tense";
  run("r25/OM2-X-the-PRE-TAKE-clause-stripped-off-the-candidate-roster",
    recovTaken25,
    (p) => {
      const i = (p.meta.noteRecords || []).findIndex((e) => e && e.cls === "sealedRecovery" && e.rec && e.rec.outcome === "taken");
      p.meta.notes[i] = String(p.meta.notes[i])
        .replace(/ON THE BOARD THIS PASS JUDGED/g, "this room ships")
        .replace(/THAT IS THE PRE-TAKE BOARD[^.]*\./g, "")
        .replace(/that board's /g, "its ");
    },
    OM2_MSG);
  run("r25/OM2-the-candidate-roster-sentence-deleted-outright",
    recovTaken25,
    (p) => {
      const i = (p.meta.noteRecords || []).findIndex((e) => e && e.cls === "sealedRecovery" && e.rec && e.rec.outcome === "taken");
      p.meta.notes[i] = String(p.meta.notes[i]).replace(/The candidates are[\s\S]*?hold nothing shut at all\./, "");
    },
    OM2_MSG);

  // ---- MM2: the withheld column and its witness ---------------------------
  const ecRoom25 = any25((p) => Array.isArray(p.meta?.exteriorContract) && p.meta.exteriorContract.length === 4 && Array.isArray(p.meta.exteriorContract[0].withheldTiles));
  run("r25/MM2-X-every-withheld-count-in-this-room-zeroed",
    ecRoom25,
    (p) => { for (const e of p.meta.exteriorContract) e.withheld = 0; },
    "`withheld` says 0 and `withheldTiles` names");
  run("r25/MM2-X-a-withheld-count-inflated",
    ecRoom25,
    (p) => { p.meta.exteriorContract[0].withheld = 999999; },
    "`withheld` says 999999 and `withheldTiles` names");
  run("r25/MM2-X-the-withheld-SETS-made-strictly-DECREASING-in-run-order",
    any25((p) => Array.isArray(p.meta?.exteriorContract) && p.meta.exteriorContract.length === 4 && (p.meta.exteriorContract[0].withheldTiles || []).length > 3),
    (p) => {
      const full = p.meta.exteriorContract[0].withheldTiles.slice();
      p.meta.exteriorContract.forEach((e, i) => {
        e.withheldTiles = full.slice(0, Math.max(0, full.length - i));
        e.withheld = e.withheldTiles.length;
      });
    },
    "are NOT withheld from");
  run("r25/MM2-X-the-witness-roster-withdrawn-so-the-count-is-a-number-again",
    ecRoom25,
    (p) => { for (const e of p.meta.exteriorContract) delete e.withheldTiles; },
    "there is no `withheldTiles` roster beside it");
  run("r25/MM2-a-tile-appended-to-the-first-consumer-s-roster",
    ecRoom25,
    (p) => {
      const e = p.meta.exteriorContract[0];
      e.withheldTiles = [...e.withheldTiles, "49,49"];
      e.withheld = e.withheldTiles.length;
    },
    "named tile\\(s\\) the derivation does not reach|are NOT withheld from");
  run("r25/MM2-a-tile-dropped-from-the-first-consumer-s-roster",
    any25((p) => Array.isArray(p.meta?.exteriorContract) && (p.meta.exteriorContract[0].withheldTiles || []).length > 0),
    (p) => {
      const e = p.meta.exteriorContract[0];
      e.withheldTiles = e.withheldTiles.slice(1);
      e.withheld = e.withheldTiles.length;
    },
    "derived tile\\(s\\) the record does not name");
  run("r25/MM2-X-the-frozen-cut-snapshot-withdrawn",
    ecRoom25,
    (p) => { delete p.meta.shell.cutAtFreeze; },
    "meta.shell.cutAtFreeze");
  // ...and the snapshot is LOAD-BEARING, which is a claim about a handful of
  // this fleet's rooms and not about every room whose two cuts merely differ:
  // the case picks a room where re-deriving the first consumer's roster off the
  // SHIPPED cut gives a DIFFERENT roster, which is the whole reason
  // `cutAtFreeze` is published.
  const freezeRoster25 = (p, d, cut) => {
    const cutK = new Set((cut || []).map((t) => key(t.x, t.y)));
    const bub = new Set((p.meta?.shell?.bubble || p.shell?.bubble || []).map((t) => key(t.x, t.y)));
    const frozen = exteriorFlood(d.terrain, cutK);
    const live = exteriorFlood(d.terrain, new Set([...cutK, ...bub]));
    const out = [];
    for (let i = 0; i < 2500; i++) {
      if (!!frozen[i] === !!live[i]) continue;
      if (frozen[i] && !live[i]) out.push(`${i % 50},${(i / 50) | 0}`);
    }
    return out.join(" ");
  };
  run("r25/MM2-X-the-frozen-cut-snapshot-re-pointed-at-the-SHIPPED-cut",
    any25((p) => {
      const d = byRoom.get(p.room);
      if (!d || !Array.isArray(p.meta?.exteriorContract?.[0]?.withheldTiles)) return false;
      return freezeRoster25(p, d, p.meta.shell.cutAtFreeze) !== freezeRoster25(p, d, p.meta.shell.cut);
    }),
    (p) => { p.meta.shell.cutAtFreeze = (p.meta.shell.cut || []).map((t) => ({ x: t.x, y: t.y })); },
    "re-derives");
  run("r25/MM2-the-basis-sentence-that-says-not-to-add-the-four-counts-up-dropped",
    ecRoom25,
    (p) => { delete p.meta.exteriorContractBasis; },
    "exteriorContractBasis");
  run("r25/MM2-a-repeat-tile-padded-into-a-roster-to-make-the-count",
    ecRoom25,
    (p) => {
      const e = p.meta.exteriorContract[3];
      e.withheldTiles = [...e.withheldTiles, e.withheldTiles[0]];
      e.withheld = e.withheldTiles.length;
    },
    "distinct tile\\(s\\)");

  // ---- ML7: the `exterior` class, both outcomes --------------------------
  const EXPOSED_TILES = ["1,1", "1,2"];
  const exteriorDecl25 = (p, tiles) => {
    p.meta.shortfalls = [
      ...(p.meta.shortfalls || []),
      {
        gate: "exterior",
        detail:
          `towers(L3) reads the frozen enclosure (plan.exterior) but 2 tile(s) it calls interior are OUTSIDE ` +
          `the wall the room is standing on (${tiles.join(" ")}) — this consumer now runs after a ` +
          `rampart-removing pass and must read liveExterior() instead`,
        tiles: tiles.map((t) => ({ x: Number(t.split(",")[0]), y: Number(t.split(",")[1]) })),
      },
    ];
  };
  run("r25/ML7-X-an-exposing-consumer-with-no-declaration-at-all",
    ecRoom25,
    (p) => { p.meta.exteriorContract[0] = { ...p.meta.exteriorContract[0], exposed: 2, exposedTiles: EXPOSED_TILES }; },
    "files no `exterior` declaration about it");
  run("r25/ML7-X-an-exposing-consumer-that-publishes-no-tile-roster",
    ecRoom25,
    (p) => {
      p.meta.exteriorContract[0] = { ...p.meta.exteriorContract[0], exposed: 2 };
      exteriorDecl25(p, EXPOSED_TILES);
    },
    "no `exposedTiles` roster at all");
  run("r25/ML7-X-a-declaration-that-names-tiles-other-than-the-exposed-ones",
    ecRoom25,
    (p) => {
      p.meta.exteriorContract[0] = { ...p.meta.exteriorContract[0], exposed: 2, exposedTiles: EXPOSED_TILES };
      exteriorDecl25(p, ["48,48", "48,47"]);
    },
    "do not cover");
  run("r25/ML7-an-exposing-consumer-whose-roster-is-shorter-than-its-count",
    ecRoom25,
    (p) => {
      p.meta.exteriorContract[0] = { ...p.meta.exteriorContract[0], exposed: 2, exposedTiles: ["1,1"] };
      exteriorDecl25(p, ["1,1"]);
    },
    "tile\\(s\\) in `exposedTiles`");

  // ---- MM3: the eco skip's index -----------------------------------------
  const recWith25 = (p) => {
    const out = [];
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (Array.isArray(node.preTakeShortfalls)) out.push(node);
      for (const k of Object.keys(node)) walk(node[k]);
    };
    walk(p.meta);
    return out;
  };
  const ecoIdx25 = (R) => (R.preTakeShortfalls || []).findIndex((e) => e && e.gate === "eco");
  const ecoRoom25 = any25((p) => recWith25(p).some((R) => ecoIdx25(R) > 0));
  const swapEco25 = (R, i) => {
    const P = R.preTakeShortfalls;
    const a = P[i - 1];
    const b = P[i];
    P[i - 1] = { ...b, at: i - 1 };
    P[i] = { ...a, at: i };
    for (const arr of [R.declaredKeys, R.declaredSkipped]) {
      if (!Array.isArray(arr)) continue;
      for (const e of arr) {
        if (e.at === i - 1) e.at = i;
        else if (e.at === i) e.at = i - 1;
      }
      arr.sort((x, y) => x.at - y.at);
    }
  };
  const MM3_MSG = "the `eco` skip|stands `eco` after|disagree about which declarations were filed before it";
  // BOTH PUBLISHED COPIES, because that is what the reviewer's own exploit
  // edited: a record reached through `meta.noteRecords[i].rec` and through
  // `meta.sealedRecovery` is ONE record published twice, and editing one copy
  // fails the twin comparison instead of this gate.
  run("r25/MM3-X-the-eco-skip-swapped-with-the-declared-key-in-front-of-it",
    ecoRoom25,
    (p) => {
      for (const R of recWith25(p)) {
        const i = ecoIdx25(R);
        if (i > 0) swapEco25(R, i);
      }
      regen25(p);
    },
    MM3_MSG);
  run("r25/MM3-X-the-eco-skip-swapped-in-a-record-carrying-TWO-declared-keys",
    any25((p) => recWith25(p).some((R) => ecoIdx25(R) > 0 && (R.declaredKeys || []).length > 1)),
    (p) => {
      for (const R of recWith25(p)) {
        const i = ecoIdx25(R);
        if (i > 0) swapEco25(R, i);
      }
      regen25(p);
    },
    MM3_MSG);
  run("r25/MM3-the-eco-skip-moved-to-the-FRONT-of-the-pre-take-channel",
    ecoRoom25,
    (p) => {
      for (const R of recWith25(p)) {
        const i = ecoIdx25(R);
        if (i <= 0) continue;
        const P = R.preTakeShortfalls;
        const eco = P[i];
        const rest = P.filter((_, j) => j !== i);
        R.preTakeShortfalls = [{ ...eco, at: 0 }, ...rest.map((e, j) => ({ ...e, at: j + 1 }))];
        const shift = (arr) => {
          if (!Array.isArray(arr)) return;
          for (const e of arr) e.at = e.gate === "eco" ? 0 : e.at < i ? e.at + 1 : e.at;
          arr.sort((x, y) => x.at - y.at);
        };
        shift(R.declaredKeys);
        shift(R.declaredSkipped);
      }
      regen25(p);
    },
    MM3_MSG);
  run("r25/MM3-CONTROL-two-real-keys-permuted-the-same-way-still-bites",
    any25((p) => recWith25(p).some((R) => (R.declaredKeys || []).length > 1)),
    (p) => {
      for (const R of recWith25(p)) {
        const K = R.declaredKeys;
        if (!Array.isArray(K) || K.length < 2) continue;
        const ia = K[0].at;
        const ib = K[1].at;
        const P = R.preTakeShortfalls;
        const pa = P[ia];
        const pb = P[ib];
        P[ia] = { ...pb, at: ia };
        P[ib] = { ...pa, at: ib };
        K[0].at = ib;
        K[1].at = ia;
        R.declaredKeys = K.slice().sort((x, y) => x.at - y.at);
      }
      regen25(p);
    },
    "pre-take declaration channel|publishes its declared keys in the order|a second opinion about it|the channel this pass read carries");

  // ---- MM5: the refusal census, derived into the message it prints --------
  run("r25/MM5-a-refusal-kind-mislabelled-so-the-room-s-own-census-moves",
    any25((p) => (p.meta?.walls?.alongCutRefused || []).some((r) => r && r.kind)),
    (p) => {
      const r = p.meta.walls.alongCutRefused.find((z) => z && z.kind);
      r.kind = r.kind === "seat" ? "no-parallel" : "seat";
    },
    "this room's own board re-derives");
}

// ===========================================================================
// 2a-26. ROUND 26 — THE ROSTERS THAT WERE STILL FREE.
// ===========================================================================
// Six channels, one shape: a record whose content nothing re-derived.
//
//   MM1  the enclosure contract — ONE of four consumers was derived and the
//        anchor the derivation runs on was shape-checked only, so appending to
//        the last consumer and co-forging the anchor with all four rosters both
//        passed 172/172 with a byte-identical summary;
//   OB1  the film's seat caption, read off a DISJUNCTION as if it were one
//        disjunct, wrong on 210 of 436 tiles under a gate written for it;
//   MM5  the same gate dropping the cover caption's occupant, so 321 runs could
//        be re-attributed to a structure the board does not carry there;
//   OM1  `rampartCensus` and all 494 `emptyBecause` reasons, with no consumer
//        at all — an invented facet at 99999 passed;
//   MM3  `preTakeShortfallBasis`'s census, gated on `length >= 80`;
//   ML6  the three unjudged channels, gated by CONTAINMENT, so one appended
//        clause could agree with itself in all three at once.
//
// THE FILM AND THE PAGES ARE FORGED ON DISK, because that is where they live —
// `runFile` writes the forgery, runs the gate against the room's UNMUTATED
// plan, restores the bytes in a `finally` and then verifies the restore. A case
// that cannot restore its file reports as a failure rather than passing
// quietly, because a mutation suite that damages the artifact it is testing is
// worse than one that does not run.
{
  const any26 = (pred) => plans.find((p) => { try { return pred(p); } catch { return false; } })?.room || null;
  const K26 = (t) => `${t.x},${t.y}`;

  /**
   * A mutation whose subject is a FILE this suite writes, not a plan field.
   * The plan is the shipped one; the forgery is on disk; the bytes come back.
   */
  const runFile = (name, room, file, transform, expect) => {
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
    if (!fs.existsSync(file)) {
      results.push({ name, room, caught: false, matched: false, fails: [`the file this case forges is not there (${file})`] });
      return;
    }
    const orig = fs.readFileSync(file);
    let res;
    let threw = null;
    try {
      const next = transform(orig.toString("utf8"), byName.get(room));
      if (next === null || next === undefined || next === orig.toString("utf8")) {
        results.push({ name, room, caught: false, matched: false, fails: ["THE FORGERY CHANGED NOTHING — the case is not testing what it names"] });
        return;
      }
      fs.writeFileSync(file, next);
      resetOutputCaches();
      res = checkRoom(clone(room), d.terrain, d.objects, FLEET);
    } catch (e) {
      threw = e;
    } finally {
      fs.writeFileSync(file, orig);
      resetOutputCaches();
    }
    if (fs.readFileSync(file).toString("binary") !== orig.toString("binary")) {
      results.push({ name, room, caught: false, matched: false, fails: ["THE FILE WAS NOT RESTORED — fix this before reading any other result"] });
      return;
    }
    if (threw) {
      results.push({ name, room, caught: false, matched: false, fails: ["THREW: " + threw.message] });
      return;
    }
    const caught = res.fails.length > 0;
    results.push({ name, room, caught, matched: expect ? res.fails.some((f) => new RegExp(expect, "i").test(f)) : caught, expect, fails: res.fails.slice(0, 3) });
  };
  const filmOf = (room) => path.join(OUT_V2, "anim", `${room}.json`);
  const pageOf = (room) => path.join(OUT_V2, `${room}.html`);

  // ---- MM1: all four consumers, and the anchor underneath them ------------
  const ec26 = any26((p) => Array.isArray(p.meta?.exteriorContract) && p.meta.exteriorContract.length === 4 && p.meta.exteriorContract.every((e) => Array.isArray(e.withheldTiles)));
  const ecFull26 = any26((p) => Array.isArray(p.meta?.exteriorContract) && (p.meta.exteriorContract[3]?.withheldTiles || []).length > 0);
  const LADDER_MSG = "this file re-derives|not between the two readings";
  run("r26/MM1-X-a-tile-appended-to-the-LAST-consumer-only-the-round-25-blind-spot",
    ec26,
    (p) => {
      const e = p.meta.exteriorContract[3];
      e.withheldTiles = [...e.withheldTiles, "49,49"];
      e.withheld = e.withheldTiles.length;
    },
    LADDER_MSG);
  run("r26/MM1-X-a-tile-appended-to-EVERY-consumer-so-containment-still-holds",
    ec26,
    (p) => {
      for (const e of p.meta.exteriorContract) {
        e.withheldTiles = [...e.withheldTiles, "49,49"];
        e.withheld = e.withheldTiles.length;
      }
    },
    LADDER_MSG);
  run("r26/MM1-X-the-MIDDLE-consumers-padded-out-of-the-sandwich-with-the-LAST-one-s-tiles",
    any26((p) => {
      const ec = p.meta?.exteriorContract;
      if (!Array.isArray(ec) || ec.length !== 4) return false;
      const a = new Set((ec[1].withheldTiles || []).map(String));
      return (ec[3].withheldTiles || []).some((t) => !a.has(String(t)));
    }),
    (p) => {
      const ec = p.meta.exteriorContract;
      for (const i of [1, 2]) {
        ec[i].withheldTiles = (ec[3].withheldTiles || []).slice();
        ec[i].withheld = ec[i].withheldTiles.length;
      }
    },
    LADDER_MSG);
  run("r26/MM1-a-tile-dropped-from-the-LAST-consumer-s-roster",
    ecFull26,
    (p) => {
      const e = p.meta.exteriorContract[3];
      e.withheldTiles = e.withheldTiles.slice(1);
      e.withheld = e.withheldTiles.length;
    },
    LADDER_MSG);
  // THE FLEET ZEROING, in the only shape that can survive the four
  // derivations: the anchor is moved to the whole shipped rampart set, which
  // makes every consumer's flood the same flood and every roster empty.
  run("r26/MM1-X-the-FLEET-ZEROING-anchor-moved-to-the-whole-rampart-set-and-all-four-rosters-emptied",
    any26((p) => Array.isArray(p.meta?.exteriorContract) && (p.structures?.rampart || []).length > (p.meta?.shell?.cut || []).length),
    (p) => {
      p.meta.shell.cutAtFreeze = (p.structures.rampart || []).map((t) => ({ x: t.x, y: t.y }));
      for (const e of p.meta.exteriorContract) {
        e.withheldTiles = [];
        e.withheld = 0;
      }
    },
    "meta.shell.cutAtFreeze carries|cutDrift|this file re-derives");
  run("r26/MM1-X-a-single-tile-dropped-from-the-anchor-with-every-roster-re-derived-around-it",
    any26((p) => {
      const d = byRoom.get(p.room);
      return d && Array.isArray(p.meta?.shell?.cutAtFreeze) && p.meta.shell.cutAtFreeze.length > 3 && Array.isArray(p.meta?.exteriorContract);
    }),
    (p, d) => {
      const drop = p.meta.shell.cutAtFreeze[0];
      p.meta.shell.cutAtFreeze = p.meta.shell.cutAtFreeze.slice(1);
      // and the rosters re-derived against the moved anchor, which is what
      // makes this the honest test rather than a bare field edit
      const fz = new Set(p.meta.shell.cutAtFreeze.map(K26));
      const bub = new Set((p.meta?.shell?.bubble || []).map(K26));
      const ramp = new Set((p.structures.rampart || []).map(K26));
      const under = (kinds) => {
        const out = [];
        for (const t of kinds) for (const q of p.structures[t] || []) if (ramp.has(K26(q))) out.push(K26(q));
        return out;
      };
      const frozen = exteriorFlood(d.terrain, fz);
      const roster = (extra) => {
        const live = exteriorFlood(d.terrain, new Set([...fz, ...extra]));
        const out = [];
        for (let i = 0; i < 2500; i++) if (frozen[i] && !live[i]) out.push(`${i % 50},${(i / 50) | 0}`);
        return out;
      };
      const walls = [[...bub], [...bub, ...under(["tower"])], [...bub, ...under(["tower", "lab"])], [...ramp]];
      p.meta.exteriorContract.forEach((e, i) => {
        e.withheldTiles = roster(walls[i]);
        e.withheld = e.withheldTiles.length;
      });
      return { note: `dropped ${K26(drop)} from the anchor and re-derived all four rosters against it` };
    },
    "cutDrift|meta.shell.cutAtFreeze does not seal|carries \\d+ tile\\(s\\) the room does not ship");
  run("r26/MM1-X-the-anchor-re-pointed-at-the-SHIPPED-cut-so-the-29-room-difference-disappears",
    any26((p) => {
      const fz = new Set((p.meta?.shell?.cutAtFreeze || []).map(K26));
      const cut = new Set((p.meta?.shell?.cut || []).map(K26));
      return fz.size && cut.size && ([...fz].some((t) => !cut.has(t)) || [...cut].some((t) => !fz.has(t)));
    }),
    (p) => { p.meta.shell.cutAtFreeze = (p.meta.shell.cut || []).map((t) => ({ x: t.x, y: t.y })); },
    "this file re-derives|cutDrift");
  run("r26/MM1-X-a-tile-invented-into-the-anchor-that-no-prune-roster-ever-lost",
    any26((p) => Array.isArray(p.meta?.shell?.cutAtFreeze) && (p.structures?.rampart || []).length > 0),
    (p) => {
      const r = (p.structures.rampart || []).find((t) => !(p.meta.shell.cutAtFreeze || []).some((z) => z.x === t.x && z.y === t.y));
      if (!r) return;
      p.meta.shell.cutAtFreeze = [...p.meta.shell.cutAtFreeze, { x: r.x, y: r.y }];
    },
    "carries \\d+ tile\\(s\\) the room does not ship|this file re-derives|cutDrift");
  const provRoom26 = any26((p) => Array.isArray(p.meta?.shell?.cutDrift) && p.meta.shell.cutDrift.length > 0);
  run("r26/MM1-X-the-freeze-time-provenance-record-withdrawn",
    provRoom26,
    (p) => { delete p.meta.shell.cutDrift; },
    "cutDrift");
  run("r26/MM1-X-a-drift-entry-flipped-from-remove-to-add-so-the-replay-lands-elsewhere",
    provRoom26,
    (p) => {
      const e = p.meta.shell.cutDrift[0];
      e.op = e.op === "add" ? "remove" : "add";
    },
    "cutDrift");
  run("r26/MM1-a-drift-entry-dropped-so-one-tile-of-the-difference-goes-unexplained",
    provRoom26,
    (p) => { p.meta.shell.cutDrift = p.meta.shell.cutDrift.slice(1); },
    "cutDrift");
  run("r26/MM1-a-drift-entry-about-a-tile-no-pass-ever-moved",
    provRoom26,
    (p) => { p.meta.shell.cutDrift = [...p.meta.shell.cutDrift, { x: 49, y: 49, op: "add", pass: "the reviewer", why: "the wall gained this tile because the reviewer said so" }]; },
    "cutDrift");
  run("r26/MM1-a-drift-entry-with-the-tile-and-no-reason-beside-it",
    provRoom26,
    (p) => { p.meta.shell.cutDrift[0].why = ""; },
    "cutDrift");
  run("r26/MM1-X-the-drift-log-emptied-while-the-two-cuts-still-differ",
    provRoom26,
    (p) => { p.meta.shell.cutDrift = []; },
    "cutDrift");
  run("r26/MM1-X-the-enclosure-basis-carried-in-from-another-room",
    any26((p) => {
      const other = plans.find((q) => q.room !== p.room && typeof q.meta?.exteriorContractBasis === "string" && q.meta.exteriorContractBasis !== p.meta?.exteriorContractBasis);
      return typeof p.meta?.exteriorContractBasis === "string" && !!other;
    }),
    (p) => {
      const other = plans.find((q) => q.room !== p.room && typeof q.meta?.exteriorContractBasis === "string" && q.meta.exteriorContractBasis !== p.meta.exteriorContractBasis);
      p.meta.exteriorContractBasis = other.meta.exteriorContractBasis;
    },
    "exteriorContractBasis");

  // ---- OB1 + MM5: the caption's disjunct and the cover's occupant ---------
  const CAP26 = "the film captions|rampartCensus";
  // the film paints "one <link>" and the board is made to carry a <lab> there
  run("r26/MM5-X-the-structure-under-a-personal-cover-swapped-so-the-film-names-the-wrong-occupant",
    any26((p) => {
      const cut = new Set((p.meta?.shell?.cut || []).map(K26));
      const den = new Set((p.meta?.shell?.standDenial || []).map(K26));
      const ramp = new Set((p.structures?.rampart || []).map(K26));
      return (p.structures?.link || []).some((l) => ramp.has(K26(l)) && !cut.has(K26(l)) && !den.has(K26(l)));
    }),
    (p) => {
      const cut = new Set((p.meta.shell.cut || []).map(K26));
      const den = new Set((p.meta.shell.standDenial || []).map(K26));
      const ramp = new Set((p.structures.rampart || []).map(K26));
      const l = p.structures.link.find((z) => ramp.has(K26(z)) && !cut.has(K26(z)) && !den.has(K26(z)));
      p.structures.link = p.structures.link.filter((z) => z !== l);
      p.structures.lab = [...(p.structures.lab || []), { x: l.x, y: l.y }];
    },
    CAP26);
  // the frozen enclosure moved under a seat, so the film's "beyond the wall" /
  // "inside the shell" disjunct is now the wrong one for that tile
  run("r26/OB1-X-the-frozen-enclosure-moved-under-a-seat-so-the-film-s-disjunct-is-the-wrong-one",
    any26((p) => {
      const cut = new Set((p.meta?.shell?.cut || []).map(K26));
      const ramp = new Set((p.structures?.rampart || []).map(K26));
      return (p.structures?.container || []).some((c) => ramp.has(K26(c)) && !cut.has(K26(c))) && (p.meta?.shell?.cutAtFreeze || []).length > 0;
    }),
    (p) => {
      // seal the whole board at the freeze: every tile is then INTERIOR, so
      // every seat the film paints as "beyond the wall" is now inside it
      const box = [];
      for (let i = 0; i < 50; i++) {
        box.push({ x: i, y: 1 }, { x: i, y: 48 }, { x: 1, y: i }, { x: 48, y: i });
      }
      p.meta.shell.cutAtFreeze = box;
    },
    CAP26);

  // ---- OM1 + MM2: the census, re-derived from the board -------------------
  run("r26/OM1-X-a-rampart-deleted-so-the-film-s-census-counts-a-tile-the-board-does-not-carry",
    any26((p) => (p.structures?.rampart || []).length > 3),
    (p) => {
      const cut = new Set((p.meta?.shell?.cut || []).map(K26));
      const r = (p.structures.rampart || []).find((z) => cut.has(K26(z)));
      p.structures.rampart = p.structures.rampart.filter((z) => z !== r);
    },
    "rampartCensus|never paints|the film captions");
  run("r26/OM1-X-a-container-planted-under-a-cut-rampart-so-a-census-facet-moves",
    any26((p) => {
      const cut = new Set((p.meta?.shell?.cut || []).map(K26));
      const own = new Set(Object.keys(p.structures || {}).filter((t) => t !== "rampart" && t !== "road").flatMap((t) => (p.structures[t] || []).map(K26)));
      return (p.structures?.rampart || []).some((z) => cut.has(K26(z)) && !own.has(K26(z)));
    }),
    (p) => {
      const cut = new Set((p.meta.shell.cut || []).map(K26));
      const own = new Set(Object.keys(p.structures).filter((t) => t !== "rampart" && t !== "road").flatMap((t) => (p.structures[t] || []).map(K26)));
      const r = p.structures.rampart.find((z) => cut.has(K26(z)) && !own.has(K26(z)));
      p.meta.shell.cut = p.meta.shell.cut.filter((z) => K26(z) !== K26(r));
      p.structures.container = [...(p.structures.container || []), { x: r.x, y: r.y }];
    },
    "rampartCensus|the film captions");
  // ...and the four FILM-SIDE forgeries, which are the reviewer's own
  const filmRoom26 = any26((p) => (p.structures?.rampart || []).length > 0);
  runFile("r26/OM1-X-an-invented-census-facet-at-99999",
    filmRoom26, filmOf(filmRoom26),
    (src) => {
      const f = JSON.parse(src);
      f.rampartCensus = [...(f.rampartCensus || []), { facet: "wumpus", class: "wumpus", count: 99999, captions: [{ caption: "invented", count: 1 }] }];
      return JSON.stringify(f);
    },
    "rampartCensus");
  runFile("r26/OM1-X-every-emptyBecause-reason-in-this-room-s-census-deleted",
    filmRoom26, filmOf(filmRoom26),
    (src) => {
      const f = JSON.parse(src);
      let hit = 0;
      for (const row of f.rampartCensus || []) if (row.emptyBecause !== undefined) { delete row.emptyBecause; hit++; }
      return hit ? JSON.stringify(f) : null;
    },
    "emptyBecause");
  runFile("r26/OM1-X-a-census-count-inflated-over-the-board-it-is-a-count-of",
    filmRoom26, filmOf(filmRoom26),
    (src) => {
      const f = JSON.parse(src);
      const row = (f.rampartCensus || []).find((r) => r.count > 0);
      if (!row) return null;
      row.count = 99999;
      return JSON.stringify(f);
    },
    "rampartCensus");
  runFile("r26/OM1-a-census-row-deleted-so-a-dead-class-goes-back-into-hiding",
    filmRoom26, filmOf(filmRoom26),
    (src) => {
      const f = JSON.parse(src);
      if (!Array.isArray(f.rampartCensus) || !f.rampartCensus.length) return null;
      f.rampartCensus = f.rampartCensus.filter((r) => r.count > 0);
      return JSON.stringify(f);
    },
    "rampartCensus");
  runFile("r26/OL2-X-an-empty-row-s-reason-rewritten-as-a-world-fact-the-room-refutes",
    any26((p) => {
      const f = filmOf(p.room);
      if (!fs.existsSync(f)) return false;
      try {
        const cens = JSON.parse(fs.readFileSync(f, "utf8")).rampartCensus || [];
        return cens.some((r) => !r.count && /\d{1,2},\d{1,2}/.test(String(r.emptyBecause || "")));
      } catch { return false; }
    }),
    filmOf(any26((p) => {
      const f = filmOf(p.room);
      if (!fs.existsSync(f)) return false;
      try {
        const cens = JSON.parse(fs.readFileSync(f, "utf8")).rampartCensus || [];
        return cens.some((r) => !r.count && /\d{1,2},\d{1,2}/.test(String(r.emptyBecause || "")));
      } catch { return false; }
    }) || "E11S1"),
    (src) => {
      const f = JSON.parse(src);
      const row = (f.rampartCensus || []).find((r) => !r.count && /\d{1,2},\d{1,2}/.test(String(r.emptyBecause || "")));
      if (!row) return null;
      row.emptyBecause = "no tile of this room has ever matched this facet's own test, which is why the row is zero";
      return JSON.stringify(f);
    },
    "emptyBecause|rampartCensus");
  // THE SWAP THAT SHIPPED — the two seat captions exchanged on every tile the
  // film paints, which is what round 25 did on 210 of this fleet's 436 seats
  // and what its own gate could not see. The case needs a room whose film
  // carries BOTH sentences, or the "swap" is a rename and proves nothing.
  const SEAT_A26 = "seat outside the shell — a container beyond the wall, covered where it stands";
  const SEAT_B26 = "container cover — a container inside the shell on shallow floor, renting a rampart of its own";
  const bothSeats26 = any26((p) => {
    const f = filmOf(p.room);
    if (!fs.existsSync(f)) return false;
    const src = fs.readFileSync(f, "utf8");
    return src.includes(SEAT_A26) && src.includes(SEAT_B26);
  });
  runFile("r26/OB1-X-the-two-seat-captions-swapped-on-every-tile-the-film-paints",
    bothSeats26, filmOf(bothSeats26 || "E11S1"),
    (src) => {
      if (!src.includes(SEAT_A26) || !src.includes(SEAT_B26)) return null;
      const SENT = "<<seat-swap>>";
      return src.split(SEAT_A26).join(SENT).split(SEAT_B26).join(SEAT_A26).split(SENT).join(SEAT_B26);
    },
    "the film captions|rampartCensus");
  runFile("r26/MM5-X-every-personal-cover-run-re-attributed-to-one-lab",
    any26((p) => {
      const f = filmOf(p.room);
      try { return fs.readFileSync(f, "utf8").includes("personal cover — one "); } catch { return false; }
    }),
    filmOf(any26((p) => {
      const f = filmOf(p.room);
      try { return fs.readFileSync(f, "utf8").includes("personal cover — one "); } catch { return false; }
    }) || "E11S1"),
    (src) => src.replace(/personal cover — one \w+ renting a rampart of its own/g, "personal cover — one lab renting a rampart of its own"),
    "the film captions|rampartCensus");

  // ---- MM3: the basis census, parsed --------------------------------------
  const basisRec26 = (p) => {
    const out = [];
    const walk = (n) => {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (typeof n.preTakeShortfallBasis === "string" && Array.isArray(n.preTakeShortfalls)) out.push(n);
      for (const k of Object.keys(n)) walk(n[k]);
    };
    walk(p.meta);
    return out;
  };
  const basisRoom26 = any26((p) => basisRec26(p).length > 0);
  const BASIS_MSG = "preTakeShortfallBasis";
  run("r26/MM3-X-the-basis-census-replaced-with-an-invented-one",
    basisRoom26,
    (p) => {
      for (const R of basisRec26(p)) {
        R.preTakeShortfallBasis =
          `ON THIS RECORD: the pre-take board carried 99 declaration(s) — 0:unicorn/rainbow, of which this pass ` +
          `ranks on 7 as key(s) (unicorn/rainbow) and skips 12 (unicorn/rainbow); 7 + 12 = 44 against 99 entries. ` +
          `MF1 (round 22) — the rule sentence that used to be the whole of this field, unchanged and still true.`;
      }
    },
    BASIS_MSG);
  run("r26/MM3-X-the-basis-census-count-alone-moved",
    basisRoom26,
    (p) => {
      for (const R of basisRec26(p)) {
        R.preTakeShortfallBasis = R.preTakeShortfallBasis.replace(/carried (\d+) declaration/, (m0, n0) => `carried ${Number(n0) + 5} declaration`);
      }
    },
    BASIS_MSG);
  run("r26/MM3-X-the-basis-census-arithmetic-broken",
    basisRoom26,
    (p) => {
      for (const R of basisRec26(p)) {
        R.preTakeShortfallBasis = R.preTakeShortfallBasis.replace(/(\d+) \+ (\d+) = (\d+) against/, (m0, a0, b0, c0) => `${a0} + ${b0} = ${Number(c0) + 3} against`);
      }
    },
    BASIS_MSG);
  run("r26/MM3-X-the-basis-census-renames-a-declaration-class-the-record-still-lists",
    any26((p) => basisRec26(p).some((R) => /— \d+:/.test(R.preTakeShortfallBasis))),
    (p) => {
      for (const R of basisRec26(p)) {
        R.preTakeShortfallBasis = R.preTakeShortfallBasis.replace(/— (\d+):[a-zA-Z/-]+/, (m0, i0) => `— ${i0}:unicorn/rainbow`);
      }
    },
    BASIS_MSG);
  // A CROSS-ROOM TRANSPLANT — the no-op that made the round-24 version of this
  // field a decoration. It has to stop being a no-op.
  const foreignBasis26 = (p) => {
    const mine = new Set(basisRec26(p).map((R) => R.preTakeShortfallBasis));
    for (const q of plans) {
      if (q.room === p.room) continue;
      for (const R of basisRec26(q)) if (!mine.has(R.preTakeShortfallBasis)) return R.preTakeShortfallBasis;
    }
    return null;
  };
  run("r26/MM3-X-the-basis-carried-in-from-another-room-s-record",
    any26((p) => basisRec26(p).length > 0 && foreignBasis26(p)),
    (p) => {
      const foreign = foreignBasis26(byName.get(p.room));
      for (const R of basisRec26(p)) R.preTakeShortfallBasis = foreign;
    },
    BASIS_MSG);
  // THE MM3 RESIDUE SWEEP, which is the exploit that ran fleet-wide: the eco
  // skip's index moved ahead of a key, in the record AND in the index fields
  // that follow it — and the basis census, which is the sentence about that
  // list, left where it was.
  run("r26/MM3-X-the-eco-skip-moved-past-a-key-with-the-basis-sentence-left-behind",
    any26((p) => basisRec26(p).some((R) => (R.preTakeShortfalls || []).findIndex((e) => e && e.gate === "eco") > 0)),
    (p) => {
      for (const R of basisRec26(p)) {
        const i = (R.preTakeShortfalls || []).findIndex((e) => e && e.gate === "eco");
        if (i <= 0) continue;
        const P = R.preTakeShortfalls;
        const a = P[i - 1];
        const b = P[i];
        P[i - 1] = { ...b, at: i - 1 };
        P[i] = { ...a, at: i };
        for (const arr of [R.declaredKeys, R.declaredSkipped]) {
          if (!Array.isArray(arr)) continue;
          for (const e of arr) {
            if (e.at === i - 1) e.at = i;
            else if (e.at === i) e.at = i - 1;
          }
          arr.sort((x, y) => x.at - y.at);
        }
      }
    },
    BASIS_MSG + "|the `eco` skip|stands `eco` after");

  // ---- ML6: the three channels, EQUAL to the derived sentence -------------
  const unjudged26 = any26((p) => {
    const lap = typeof p.meta?.walls?.mobility?.builtGated === "number" ? p.meta.walls.mobility.builtGated : p.meta?.shell?.mobilityBuilt?.maxGated;
    return lap === 0 && fs.existsSync(pageOf(p.room));
  });
  const ML6_MSG = "mobility-caption";
  const APPEND26 = ", and every one of this room's cut tiles is redundant so the wall could be deleted for free";
  runFile("r26/ML6-X-one-false-clause-appended-to-ALL-THREE-channels-at-once",
    unjudged26, pageOf(unjudged26),
    (src) => {
      const out = src
        .split(`, which is the floor below which a detour is not a detour`).join(`, which is the floor below which a detour is not a detour${APPEND26}`)
        .split(`is excused by coverage (a defender on one wall tile already covers everything an attacker can stand on to grind the other)`)
        .join(`is excused by coverage (a defender on one wall tile already covers everything an attacker can stand on to grind the other)${APPEND26}`);
      return out === src ? null : out;
    },
    ML6_MSG);
  runFile("r26/ML6-X-the-clause-appended-to-the-room-page-s-line-alone",
    unjudged26, pageOf(unjudged26),
    (src) => {
      let done = false;
      const out = src.replace(/<div class="mob-sub">((?!as-built UNGATED)[^<]*)<\/div>/, (m0, t0) => {
        if (done) return m0;
        done = true;
        return `<div class="mob-sub">${t0}${APPEND26}</div>`;
      });
      return done ? out : null;
    },
    ML6_MSG);
  runFile("r26/ML6-X-the-clause-appended-inside-the-film-caption-s-own-window",
    unjudged26, pageOf(unjudged26),
    (src) => {
      const out = src.replace(/as-built gated lap 0 — ([^"]*?) \(target /, (m0, t0) => `as-built gated lap 0 — ${t0}${APPEND26} (target `);
      return out === src ? null : out;
    },
    ML6_MSG);
  const indexFile26 = path.join(OUT_V2, "index.html");
  runFile("r26/ML6-X-the-clause-appended-to-the-index-chip-s-title-alone",
    unjudged26, indexFile26,
    (src, p) => {
      const at = src.indexOf(`<div class="card"><h3><a href="${p.room}.html">`);
      if (at < 0) return null;
      const end = src.indexOf(`<div class="card">`, at + 10);
      const card = src.slice(at, end < 0 ? src.length : end);
      const next = card.replace(/(<span class="mob unjudged" title=")([^"]*)(")/, (m0, a0, t0, c0) => `${a0}${t0}${APPEND26}${c0}`);
      if (next === card) return null;
      return src.slice(0, at) + next + (end < 0 ? "" : src.slice(end));
    },
    ML6_MSG);
  run("r26/ML6-X-the-published-detour-moved-so-the-derived-sentence-is-the-other-one",
    any26((p) => {
      const lap = typeof p.meta?.walls?.mobility?.builtGated === "number" ? p.meta.walls.mobility.builtGated : p.meta?.shell?.mobilityBuilt?.maxGated;
      return lap === 0 && typeof p.meta?.walls?.mobility?.maxDetour === "number";
    }),
    (p) => { p.meta.walls.mobility.maxDetour = p.meta.walls.mobility.maxDetour > 4 ? 0 : 40; },
    ML6_MSG);
}

// ===========================================================================
// ROUND 27. The class of defect this round closed is UNREAD PROSE and UNCLASSED
// LEAVES: eleven *Basis/*Why fields (1550 strings) replaced with one invented
// sentence; cutDrift pass/why as length-gated free text; the film note's tail;
// the absence branch of emptyBecause; enclosure claims in the flattering
// direction; and 105 identifier names that appeared nowhere in this file.
// ===========================================================================
{
  const any27 = (pred) => plans.find((p) => { try { return pred(p); } catch { return false; } })?.room || null;
  const runFile = (name, room, file, transform, expect) => {
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
    if (!fs.existsSync(file)) {
      results.push({ name, room, caught: false, matched: false, fails: [`the file this case forges is not there (${file})`] });
      return;
    }
    const orig = fs.readFileSync(file);
    let res;
    let threw = null;
    try {
      const next = transform(orig.toString("utf8"), byName.get(room));
      if (next === null || next === undefined || next === orig.toString("utf8")) {
        results.push({ name, room, caught: false, matched: false, fails: ["THE FORGERY CHANGED NOTHING — the case is not testing what it names"] });
        return;
      }
      fs.writeFileSync(file, next);
      resetOutputCaches();
      res = checkRoom(clone(room), d.terrain, d.objects, FLEET);
    } catch (e) {
      threw = e;
    } finally {
      fs.writeFileSync(file, orig);
      resetOutputCaches();
    }
    if (fs.readFileSync(file).toString("binary") !== orig.toString("binary")) {
      results.push({ name, room, caught: false, matched: false, fails: ["THE FILE WAS NOT RESTORED — fix this before reading any other result"] });
      return;
    }
    if (threw) {
      results.push({ name, room, caught: false, matched: false, fails: ["THREW: " + threw.message] });
      return;
    }
    const caught = res.fails.length > 0;
    results.push({ name, room, caught, matched: expect ? res.fails.some((f) => new RegExp(expect, "i").test(f)) : caught, expect, fails: res.fails.slice(0, 3) });
  };
  const LIE27 =
    "THE REVIEWER WROTE THIS BASIS. This room ships no wall, no ramparts and no structures at all.";

  run("r27/MF5-X-enclosureBasis-replaced-with-one-invented-sentence",
    any27((p) => typeof p.meta?.shell?.enclosureBasis === "string"),
    (p) => { p.meta.shell.enclosureBasis = LIE27; },
    "enclosureBasis|WHOLE-VALUE|invented sentence");
  run("r27/MF5-X-refillBasis-replaced-with-one-invented-sentence",
    any27((p) => typeof p.meta?.towers?.refillBasis === "string"),
    (p) => { p.meta.towers.refillBasis = LIE27; },
    "refillBasis|WHOLE-VALUE|invented sentence");
  run("r27/MF5-X-prunedBasis-replaced-with-one-invented-sentence",
    any27((p) => typeof p.meta?.walls?.prunedBasis === "string"),
    (p) => { p.meta.walls.prunedBasis = LIE27; },
    "prunedBasis|WHOLE-VALUE|invented sentence");
  run("r27/MF5-X-counterfactualBasis-replaced-with-one-invented-sentence",
    any27((p) => typeof p.meta?.sealedFloor?.counterfactualBasis === "string"),
    (p) => { p.meta.sealedFloor.counterfactualBasis = LIE27; },
    "counterfactualBasis|WHOLE-VALUE|invented sentence");
  run("r27/MF5-X-mineralOffNetworkWhy-replaced-with-one-invented-sentence",
    any27((p) => typeof p.meta?.misc?.mineralOffNetworkWhy === "string"),
    (p) => { p.meta.misc.mineralOffNetworkWhy = LIE27; },
    "mineralOffNetworkWhy|WHOLE-VALUE|invented sentence");
  run("r27/MF5-X-deepTilesBasis-replaced-with-one-invented-sentence",
    any27((p) => typeof p.meta?.shell?.deepTilesBasis === "string"),
    (p) => { p.meta.shell.deepTilesBasis = LIE27; },
    "deepTilesBasis|WHOLE-VALUE|invented sentence");
  run("r27/MF5-X-noteObligationBasis-replaced-with-one-invented-sentence",
    any27((p) => typeof p.meta?.noteObligationBasis === "string"),
    (p) => { p.meta.noteObligationBasis = LIE27; },
    "noteObligationBasis|WHOLE-VALUE|invented sentence");
  run("r27/MF5-X-towerSwapOffer-basis-replaced-with-one-invented-sentence",
    any27((p) => typeof p.meta?.towers?.towerSwapOffer?.basis === "string"),
    (p) => { p.meta.towers.towerSwapOffer.basis = LIE27; },
    "towerSwapOffer|WHOLE-VALUE|invented sentence");
  run("r27/MF5-X-remeasured-replaced-with-one-invented-sentence",
    any27((p) => typeof p.meta?.shell?.remeasured === "string"),
    (p) => { p.meta.shell.remeasured = LIE27; },
    "remeasured|WHOLE-VALUE|invented sentence");
  run("r27/MF5-X-an-unregistered-Why-field-planted",
    any27((p) => p.meta && p.meta.shell),
    (p) => { p.meta.shell.reviewerWhy = LIE27; },
    "not in the round-27 inventory|reviewerWhy");
  run("r27/MF2-X-cutDrift-why-replaced-with-one-invented-sentence",
    any27((p) => (p.meta?.shell?.cutDrift || []).some((e) => e && e.why)),
    (p) => { for (const e of p.meta.shell.cutDrift) e.why = LIE27; },
    "cutDrift|WHOLE-VALUE|generator|invented");
  run("r27/MF2-X-cutDrift-pass-relabelled-to-an-imaginary-pass",
    any27((p) => (p.meta?.shell?.cutDrift || []).some((e) => e && e.pass)),
    (p) => { for (const e of p.meta.shell.cutDrift) e.pass = "layer9-unicornPrune"; },
    "cutDrift|closed enum|not one of the two");
  run("r27/MF1-X-the-anchor-repointed-at-the-shipped-cut-and-the-drift-emptied",
    any27((p) => Array.isArray(p.meta?.shell?.cutDrift) && p.meta.shell.cutDrift.length > 0 && Array.isArray(p.meta.shell.cutAtFreeze)),
    (p) => {
      p.meta.shell.cutAtFreeze = (p.meta.shell.cut || []).map((t) => ({ x: t.x, y: t.y }));
      p.meta.shell.cutDrift = [];
      if (Array.isArray(p.meta.shell.cutPasses)) {
        for (const mk of p.meta.shell.cutPasses) {
          mk.adds = 0;
          mk.removes = 0;
        }
      }
    },
    "MINIMAL|minimal sealing|cutAtFreeze|cutPasses|cutDrift");
  run("r27/MF6-X-enclosedController-flipped-to-the-flattering-true",
    any27((p) => p.meta?.shell?.enclosedController === false),
    (p) => { p.meta.shell.enclosedController = true; },
    "enclosedController");
  run("r27/MF6-X-battlementFloor-moved-off-ceil-cut-over-3",
    any27((p) => typeof p.meta?.shell?.battlementFloor === "number"),
    (p) => { p.meta.shell.battlementFloor += 3; },
    "battlementFloor");
  run("r27/MF6-X-an-unregistered-leaf-name-planted",
    any27((p) => p.meta && p.meta.misc),
    (p) => { p.meta.misc.reviewerDarkLeaf = 1; },
    "not in the round-27 closed inventory|reviewerDarkLeaf");
  run("r27/OL5-X-mineralSeat-moved-off-the-container",
    any27((p) => p.meta?.mineralSeat && Number.isInteger(p.meta.mineralSeat.x)),
    (p) => { p.meta.mineralSeat = { x: 1, y: 1 }; },
    "mineralSeat|mineral container");
  run("r27/OL4-X-closer-doubled-on-every-relocation",
    any27((p) => (p.meta?.extensions?.relocated || []).some((r) => typeof r.closer === "number" && r.closer !== 0)),
    (p) => { for (const r of p.meta.extensions.relocated) r.closer = r.closer * 2 + 8; },
    "closer|hub walk|relocated");
  run("r27/OM2-X-openingExited-names-a-taken-tile",
    any27((p) => (p.meta?.noteRecords || []).some((nr) => (nr?.rec?.search?.openingTaken || []).length && (nr.rec.search.openingExited || []).length >= 0)),
    (p) => {
      const nr = (p.meta.noteRecords || []).find((n) => n?.rec?.search && Array.isArray(n.rec.search.openingTaken) && n.rec.search.openingTaken.length);
      const t = nr.rec.search.openingTaken[0];
      nr.rec.search.openingExited = [...(nr.rec.search.openingExited || []), { x: t.x, y: t.y, why: "left untaken" }];
    },
    "openingExited|UNTAKEN|extension");
  const film27 = any27((p) => true);
  runFile("r27/MF3-X-every-absence-reason-replaced-with-one-invented-sentence",
    film27,
    path.join(OUT_V2, "anim", `${film27}.json`),
    (src) => {
      const j = JSON.parse(src);
      let n = 0;
      for (const row of j.rampartCensus || []) {
        if (row && row.emptyBecause && !/absorbed|claimed them first/i.test(row.emptyBecause)) {
          row.emptyBecause = LIE27 + " THIS ROOM IS PERFECT AND SHIPS NO WALL OF ANY KIND.";
          n++;
        }
      }
      return n ? JSON.stringify(j) : null;
    },
    "emptyBecause|ABSENCE|renderFacetAbsence|WHOLE-VALUE");
  runFile("r27/MF4-X-a-clause-appended-after-the-film-note-close-marker",
    film27,
    path.join(OUT_V2, `${film27}.html`),
    (src) => {
      const at = src.indexOf("\n  var NOTES = ");
      if (at < 0) return null;
      const end = src.indexOf("\n", at + 15);
      const line = src.slice(at + 15, end);
      let notes;
      try { notes = JSON.parse(line.replace(/;\s*$/, "")); } catch { return null; }
      if (!notes || typeof notes.ramparts !== "string") return null;
      notes.ramparts += ", and every one of this room's 14 cut tiles is redundant so the wall could be deleted for free";
      return src.slice(0, at) + "\n  var NOTES = " + JSON.stringify(notes) + ";" + src.slice(end);
    },
    "film note|NOTES.ramparts|last character|WHOLE");
}

{
  const any28 = (pred) => plans.find((p) => { try { return pred(p); } catch { return false; } })?.room || null;
  run("r28/MF6-X-shippedShellDmg-inflated-with-its-twins",
    any28((p) => p.meta?.shell?.shippedShellDmg && typeof p.meta.shell.shippedShellDmg.min === "number"),
    (p) => {
      p.meta.shell.shippedShellDmg.min = 9999;
      p.meta.shell.shippedShellDmg.worst = { x: 1, y: 1 };
      p.meta.shell.shippedShellDmg.avg = 9999;
      p.meta.towers.shippedWeakest = { x: 1, y: 1 };
      p.meta.towers.shippedAvgShellDmg = 9999;
    },
    "shippedShellDmg|does not re-derive");
  run("r28/MF6-X-mobilityShipped-zeroed-alone",
    any28((p) => p.meta?.shell?.mobilityShipped && typeof p.meta.shell.mobilityShipped.maxGated === "number" && p.meta.shell.mobilityShipped.maxGated !== 0),
    (p) => { p.meta.shell.mobilityShipped.maxGated = 0; },
    "mobilityShipped");
  run("r28/MF5-X-refillBasis-blocked-count-forged-in-the-sentence",
    any28((p) => typeof p.meta?.towers?.refillBasis === "string" && /with \d+ tile\(s\) blocked/.test(p.meta.towers.refillBasis)),
    (p) => {
      p.meta.towers.refillBasis = p.meta.towers.refillBasis.replace(/with \d+ tile\(s\) blocked/, "with 1 tile(s) blocked");
    },
    "refillBasis|WHOLE-VALUE");
  run("r28/M1-X-cutPasses-sealCritical-inflated",
    any28((p) => (p.meta?.shell?.cutPasses || []).some((m) => m && m.kind === "reconcileSeal" && Number.isInteger(m.sealCritical))),
    (p) => { for (const m of p.meta.shell.cutPasses) if (m && Number.isInteger(m.sealCritical)) m.sealCritical += 999; },
    "cutPasses|sealCritical");
  run("r28/M1-X-cutPasses-prune-ramparts-zeroed",
    any28((p) => (p.meta?.shell?.cutPasses || []).some((m) => m && m.kind === "inertPrune" && m.rampartsDeleted > 0)),
    (p) => { for (const m of p.meta.shell.cutPasses) if (m && m.kind === "inertPrune") m.ramparts = 0; },
    "cutPasses|ramparts");
  run("r28/MF5-X-mineralWhy-append-after-last-character",
    any28((p) => typeof p.meta?.misc?.mineralOffNetworkWhy === "string"),
    (p) => { p.meta.misc.mineralOffNetworkWhy += " THE WALL IS FREE."; },
    "mineralOffNetworkWhy|WHOLE-VALUE");
  run("r28/MF5-X-swap-offer-face-parsed-from-its-own-sentence",
    any28((p) => typeof p.meta?.towers?.towerSwapOffer?.basis === "string" && /face at \d+/.test(p.meta.towers.towerSwapOffer.basis)),
    (p) => {
      p.meta.towers.towerSwapOffer.basis = p.meta.towers.towerSwapOffer.basis.replace(
        /face at \d+ and its saturation at \d+/,
        "face at 999 and its saturation at 999",
      );
    },
    "towerSwapOffer|WHOLE-VALUE");
  run("r28/MF6-X-cutAdopted-planted-rampart-tile",
    any28((p) => Array.isArray(p.meta?.shell?.cutAdopted) && (p.structures?.rampart || []).length),
    (p) => {
      const r = p.structures.rampart[0];
      p.meta.shell.cutAdopted = [{ x: r.x, y: r.y }];
    },
    "cutAdopted");
  run("r28/MF6-X-battlement-count-and-tiles-zeroed-together",
    any28((p) => Array.isArray(p.meta?.shell?.battlementUnreachableTiles) && p.meta.shell.battlementUnreachable > 0),
    (p) => {
      p.meta.shell.battlementUnreachable = 0;
      p.meta.shell.battlementUnreachableTiles = [];
    },
    "battlementUnreachable");
  run("r28/MF6-X-nukerHubDist-flattered-to-1",
    any28((p) => typeof p.meta?.misc?.nukerHubDist === "number" && p.meta.misc.nukerHubDist !== 1),
    (p) => { p.meta.misc.nukerHubDist = 1; },
    "nukerHubDist");
  run("r28/MF6-X-observerHubDist-flattered-to-1",
    any28((p) => typeof p.meta?.misc?.observerHubDist === "number" && p.meta.misc.observerHubDist !== 1),
    (p) => { p.meta.misc.observerHubDist = 1; },
    "observerHubDist");
  run("r28/MF6-X-refillDistsUnblocked-flattened-to-1",
    any28((p) => Array.isArray(p.meta?.towers?.refillDistsUnblocked) && p.meta.towers.refillDistsUnblocked.some((v) => v !== 1)),
    (p) => { p.meta.towers.refillDistsUnblocked = p.meta.towers.refillDistsUnblocked.map(() => 1); },
    "refillDistsUnblocked");
  run("r28/MF6-X-protectRadius-zeroed",
    any28((p) => typeof p.meta?.shell?.protectRadius === "number"),
    (p) => { p.meta.shell.protectRadius = 0; },
    "protectRadius");
  run("r28/MF6-X-priceyWall-cleared",
    any28((p) => p.meta?.shell?.priceyWall),
    (p) => { p.meta.shell.priceyWall = 0; },
    "priceyWall");
  run("r28/MF6-X-baseCut-zeroed",
    any28((p) => typeof p.meta?.shell?.baseCut === "number" && p.meta.shell.baseCut > 0),
    (p) => { p.meta.shell.baseCut = 0; },
    "baseCut");
  run("r28/MF6-X-mineralBubble-zeroed",
    any28((p) => p.meta?.misc?.mineralBubble > 0),
    (p) => { p.meta.misc.mineralBubble = 0; },
    "mineralBubble");
  run("r28/MF6-X-swampPaved-zeroed",
    any28((p) => (p.meta?.walls?.swampPaved || 0) > 0),
    (p) => { p.meta.walls.swampPaved = 0; },
    "swampPaved");
  run("r28/MF6-X-spurred-zeroed",
    any28((p) => (p.meta?.walls?.spurred || 0) > 0 && (p.meta?.walls?.laidByKind?.spur || 0) > 0),
    (p) => { p.meta.walls.spurred = 0; },
    "spurred");
  run("r28/MF6-X-newRoads-zeroed",
    any28((p) => (p.meta?.towers?.newRoads || 0) > 0),
    (p) => { p.meta.towers.newRoads = 0; },
    "newRoads");
  run("r28/88-X-fatter-discarded-rung-mobility-and-regen",
    any28((p) => {
      const sf = (p.meta?.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
      const shipped = (p.structures?.rampart || []).length;
      const hasCut = (r) => Array.isArray(r?.cutTiles) && r.cutTiles.length;
      return !!(sf && (sf.ladder.rungs.some(hasCut) || (p.meta?.shellEscalation?.rungs || []).some(hasCut)) &&
        sf.ladder.rungs.some((r) => r && r.ramparts > shipped && typeof r.mobility === "number"));
    }),
    (p) => {
      const shipped = (p.structures.rampart || []).length;
      for (const sf of p.meta.shortfalls || []) {
        if (!sf.ladder?.rungs) continue;
        for (const r of sf.ladder.rungs) {
          if (r && r.ramparts > shipped && typeof r.mobility === "number") r.mobility = 0.5;
        }
        sf.detail = renderDecl(sf);
      }
    },
    "ladder.rungs|enclosureMobility|invented lap");
  run("r28/88-X-recovery-room-discarded-rung-without-shellEscalation",
    any28((p) => {
      if (p.meta?.shellEscalation) return false;
      const sf = (p.meta?.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
      return !!(sf && sf.ladder.rungs.some((r) => r && Array.isArray(r.cutTiles) && r.cutTiles.length && typeof r.mobility === "number"));
    }),
    (p) => {
      for (const sf of p.meta.shortfalls || []) {
        if (!sf.ladder?.rungs) continue;
        for (const r of sf.ladder.rungs) {
          if (r && typeof r.mobility === "number") r.mobility = 0.5;
        }
        sf.detail = renderDecl(sf);
      }
    },
    "ladder.rungs|enclosureMobility|invented lap|recovery");
  run("r28/98-X-invent-shrink-on-a-plain-room",
    any28((p) => {
      const L = p.meta?.extensions?.laneMeta;
      return !!(L && L.fullRun && !L.fullRun.ran && !L.shrunk && !L.dropped && typeof L.rounds === "number");
    }),
    (p) => {
      const L = p.meta.extensions.laneMeta;
      const W = p.meta.walls.mobility.lanes;
      const shrunk = { from: 10, to: L.rounds, wanted: (L.tiles || 0) + 9, premium: 0 };
      L.shrunk = shrunk;
      L.roundCap = L.rounds;
      if (W && W !== L) {
        W.shrunk = { ...shrunk };
        W.roundCap = L.rounds;
      }
    },
    "invent|shrink|fullRun|never entered");
  run("r28/98-X-erase-a-real-shrink",
    any28((p) => p.meta?.extensions?.laneMeta?.shrunk && p.meta.extensions.laneMeta.fullRun),
    (p) => {
      const L = p.meta.extensions.laneMeta;
      const W = p.meta.walls.mobility.lanes;
      delete L.shrunk;
      L.roundCap = 10;
      if (W && W !== L) {
        delete W.shrunk;
        W.roundCap = 10;
      }
    },
    "fullRun.to|used|neither shrink nor drop");
  run("r28/98-X-fullRun-deleted",
    any28((p) => p.meta?.extensions?.laneMeta?.fullRun),
    (p) => {
      delete p.meta.extensions.laneMeta.fullRun;
      if (p.meta.walls?.mobility?.lanes) delete p.meta.walls.mobility.lanes.fullRun;
    },
    "fullRun is missing");
  run("r29/98-X-forge-fullRun-then-invent-shrink",
    any28((p) => {
      const L = p.meta?.extensions?.laneMeta;
      return !!(L && L.fullRun && !L.fullRun.ran && !L.shrunk && !L.dropped && Array.isArray(L.fullRun.reserved));
    }),
    (p) => {
      const L = p.meta.extensions.laneMeta;
      const W = p.meta.walls.mobility.lanes;
      const wanted = (L.tiles || 0) + 12;
      const fullRun = {
        ...L.fullRun,
        tiles: wanted,
        rounds: 10,
        shallow: 2,
        ext: 58,
        ran: true,
        used: 10,
        to: L.rounds || 2,
      };
      const shrunk = { from: 10, to: fullRun.to, wanted, premium: 0 };
      L.fullRun = fullRun;
      L.shrunk = shrunk;
      L.roundCap = fullRun.to;
      if (W && W !== L) {
        W.fullRun = { ...fullRun };
        W.shrunk = { ...shrunk };
        W.roundCap = fullRun.to;
      }
    },
    "invent|shrink|reserved|prefix|60/0");
  run("r29/98-X-fullRun-reserved-deleted-on-a-shrink",
    any28((p) => p.meta?.extensions?.laneMeta?.shrunk && Array.isArray(p.meta.extensions.laneMeta.fullRun?.reserved)),
    (p) => {
      delete p.meta.extensions.laneMeta.fullRun.reserved;
      delete p.meta.extensions.laneMeta.fullRun.byRound;
      if (p.meta.walls?.mobility?.lanes?.fullRun) {
        delete p.meta.walls.mobility.lanes.fullRun.reserved;
        delete p.meta.walls.mobility.lanes.fullRun.byRound;
      }
    },
    "fullRun.reserved is missing");
  run("r29/98-X-kept-60-0-fullRun-shallow-forged",
    any28((p) => {
      const L = p.meta?.extensions?.laneMeta;
      return !!(L && L.fullRun && !L.fullRun.ran && !L.shrunk && !L.dropped &&
        (p.structures?.extension || []).length === 60 && !(p.meta?.extensions?.shallow));
    }),
    (p) => {
      const L = p.meta.extensions.laneMeta;
      const W = p.meta.walls.mobility.lanes;
      L.fullRun = { ...L.fullRun, shallow: 2, ran: true };
      if (W && W !== L && W.fullRun) W.fullRun = { ...W.fullRun, shallow: 2, ran: true };
    },
    "ships 60/0|forging those two integers");
  const twinLane98 = (p, fn) => {
    fn(p.meta.extensions.laneMeta);
    const W = p.meta.walls?.mobility?.lanes;
    if (W && W !== p.meta.extensions.laneMeta) fn(W);
  };
  run("r30/98-X-extra-reserved-99-99",
    any28((p) => {
      const L = p.meta?.extensions?.laneMeta;
      return !!(L && L.shrunk && Array.isArray(L.fullRun?.reserved) && Array.isArray(L.fullRun?.byRound));
    }),
    (p) => {
      twinLane98(p, (L) => {
        const extra = "99,99";
        L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
        L.fullRun.byRound = [...L.fullRun.byRound.map((r) => r.slice()), [extra]];
        L.fullRun.tiles = L.fullRun.reserved.length;
        L.fullRun.rounds = L.fullRun.byRound.length;
        L.fullRun.used = L.fullRun.rounds;
        L.shrunk.wanted = L.fullRun.tiles;
      });
    },
    "walkable interior floor|COORD bag");
  run("r30/98-X-invent-shrink-with-extra-round",
    any28((p) => {
      const L = p.meta?.extensions?.laneMeta;
      return !!(L && L.fullRun && !L.fullRun.ran && !L.shrunk && !L.dropped &&
        Array.isArray(L.fullRun.reserved) && Array.isArray(L.fullRun.byRound));
    }),
    (p) => {
      twinLane98(p, (L) => {
        const extra = "1,1";
        const keptTo = L.fullRun.rounds || L.fullRun.byRound.length;
        L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
        L.fullRun.byRound = [...L.fullRun.byRound.map((r) => r.slice()), [extra]];
        L.fullRun.tiles = L.fullRun.reserved.length;
        L.fullRun.rounds = L.fullRun.byRound.length;
        L.fullRun.ext = 58;
        L.fullRun.shallow = 2;
        L.fullRun.ran = true;
        L.fullRun.used = L.fullRun.rounds;
        L.fullRun.to = keptTo;
        L.shrunk = { from: 10, to: keptTo, wanted: L.fullRun.tiles, premium: 0 };
        L.roundCap = keptTo;
      });
    },
    "walkable interior floor|COORD bag");
  run("r30/98-X-extra-reserved-border-0-0",
    any28((p) => {
      const L = p.meta?.extensions?.laneMeta;
      return !!(L && L.shrunk && Array.isArray(L.fullRun?.reserved) && Array.isArray(L.fullRun?.byRound));
    }),
    (p) => {
      twinLane98(p, (L) => {
        const extra = "0,0";
        L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
        L.fullRun.byRound = [...L.fullRun.byRound.map((r) => r.slice()), [extra]];
        L.fullRun.tiles = L.fullRun.reserved.length;
        L.fullRun.rounds = L.fullRun.byRound.length;
        L.fullRun.used = L.fullRun.rounds;
        L.shrunk.wanted = L.fullRun.tiles;
      });
    },
    "walkable interior floor|COORD bag");
  run("r31/98-X-d8-neighbor-19-27",
    any28((p) => p.room === "E11S1" && p.meta?.extensions?.laneMeta?.shrunk &&
      Array.isArray(p.meta.extensions.laneMeta.fullRun?.reserved)) ||
    any28((p) => p.meta?.extensions?.laneMeta?.shrunk && Array.isArray(p.meta.extensions.laneMeta.fullRun?.reserved)),
    (p) => {
      twinLane98(p, (L) => {
        const extra = "19,27";
        L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
        const last = L.fullRun.byRound[L.fullRun.byRound.length - 1] || [];
        L.fullRun.byRound = [
          ...L.fullRun.byRound.slice(0, -1).map((r) => r.slice()),
          [...last.map(String), extra],
        ];
        L.fullRun.tiles = L.fullRun.reserved.length;
        L.shrunk.wanted = L.fullRun.tiles;
      });
    },
    "suffix|prefix|tile list");
  run("r28/93-X-taken-room-fixedHolder-invented-off-the-board",
    any28((p) => p.meta?.sealedRecovery?.outcome === "taken"),
    (p) => {
      const R = p.meta.sealedRecovery;
      R.fixedHolders = [...(R.fixedHolders || []), { type: "lab", x: 1, y: 1, recovers: 99, recoversDeep: 99 }];
    },
    "fixedHolders|ships nothing|inventing a tile");
  run("r29/93-X-taken-room-recovers-kept-as-a-log",
    any28((p) =>
      p.meta?.sealedRecovery?.outcome === "taken" &&
      (p.meta.sealedRecovery.fixedHolders || []).some((h) => h && !("recovers" in h)),
    ),
    (p) => {
      const rec = p.meta.sealedRecovery;
      const cap = (rec.pockets || []).reduce((n, pk) => n + (pk.tiles || 0), 0) || 1;
      for (const h of rec.fixedHolders || []) {
        h.recovers = cap;
        h.recoversDeep = cap;
      }
      for (const nr of p.meta.noteRecords || []) {
        if (nr.cls !== "sealedRecovery" || !nr.rec?.fixedHolders) continue;
        for (const h of nr.rec.fixedHolders) {
          h.recovers = cap;
          h.recoversDeep = cap;
        }
      }
    },
    "log of a board that left");
  run("r29/M5-X-cutAdopted-planted-a-real-cutDrift-add",
    any28((p) => (p.meta?.shell?.cutDrift || []).some((e) => e && e.op === "add") && Array.isArray(p.meta?.shell?.cutAdopted)),
    (p) => {
      const add = p.meta.shell.cutDrift.find((e) => e && e.op === "add");
      p.meta.shell.cutAdopted = [{ x: add.x, y: add.y }];
    },
    "cutAdopted|layer7b-reconcileSeal|planting a real");
  run("r29/88-X-fatter-discarded-cut-replaced-with-the-shipped-cut",
    any28((p) => {
      const shipped = (p.structures?.rampart || []).length;
      const freeze = p.meta?.shell?.cutAtFreeze || [];
      const sf = (p.meta?.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
      return !!(sf && freeze.length && sf.ladder.rungs.some((r) => r && r.ramparts > shipped && Array.isArray(r.cutTiles) && r.cutTiles.length !== freeze.length));
    }),
    (p) => {
      const freeze = (p.meta.shell.cutAtFreeze || []).map((t) => ({ x: t.x, y: t.y }));
      const shipped = (p.structures.rampart || []).length;
      const winner = (p.meta.shortfalls || []).find((s) => s && s.ladder)?.ladder?.rungs?.find((r) => r && r.ramparts === shipped);
      const lap = winner && typeof winner.mobility === "number" ? winner.mobility : 1.56;
      for (const sf of p.meta.shortfalls || []) {
        if (!sf.ladder?.rungs) continue;
        for (const r of sf.ladder.rungs) {
          if (r && r.ramparts > shipped) {
            r.cutTiles = freeze.map((t) => ({ x: t.x, y: t.y }));
            r.mobility = lap;
          }
        }
        sf.detail = renderDecl(sf);
      }
      if (p.meta.shellEscalation?.rungs) {
        for (const r of p.meta.shellEscalation.rungs) {
          if (r && r.ramparts > shipped) {
            r.cutTiles = freeze.map((t) => ({ x: t.x, y: t.y }));
            r.mobility = lap;
          }
        }
      }
    },
    "fatter discarded|winner's cut|swapping");
  run("r30/88-X-last-fat-rung-shipped-cut-and-ramparts-to-cutlen",
    any28((p) => {
      const shipped = (p.structures?.rampart || []).length;
      const sf = (p.meta?.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
      const rungs = sf?.ladder?.rungs || [];
      const last = rungs[rungs.length - 1];
      return !!(last && last.complete && last.ramparts > shipped && Array.isArray(last.cutTiles) && last.cutTiles.length !== shipped);
    }),
    (p) => {
      const shippedCut = (p.meta.shell.cut || []).map((t) => ({ x: t.x, y: t.y }));
      const shipped = (p.structures.rampart || []).length;
      const sf = (p.meta.shortfalls || []).find((s) => s && s.ladder);
      const winner = sf?.ladder?.rungs?.find((r) => r && r.ramparts === shipped);
      const lap = winner && typeof winner.mobility === "number" ? winner.mobility : 1.56;
      const lastBonus = sf.ladder.rungs[sf.ladder.rungs.length - 1].needDeepBonus;
      for (const row of sf.ladder.rungs) {
        if (row && row.needDeepBonus === lastBonus) {
          row.cutTiles = shippedCut.map((t) => ({ x: t.x, y: t.y }));
          row.mobility = lap;
          row.ramparts = shippedCut.length;
        }
      }
      sf.detail = renderDecl(sf);
      if (p.meta.shellEscalation?.rungs) {
        for (const row of p.meta.shellEscalation.rungs) {
          if (row && row.needDeepBonus === lastBonus) {
            row.cutTiles = shippedCut.map((t) => ({ x: t.x, y: t.y }));
            row.mobility = lap;
            row.ramparts = shippedCut.length;
          }
        }
      }
    },
    "would have|cheaper|upkeep|first objective");
  run("r30/88-X-last-fat-8-tile-box-keep-ramparts",
    any28((p) => {
      const shipped = (p.structures?.rampart || []).length;
      const sf = (p.meta?.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
      const rungs = sf?.ladder?.rungs || [];
      const last = rungs[rungs.length - 1];
      const s = p.sitter;
      return !!(
        last &&
        last.complete &&
        last.ramparts > shipped &&
        Array.isArray(last.cutTiles) &&
        last.cutTiles.length &&
        s &&
        Number.isInteger(s.x) &&
        s.x >= 3 &&
        s.x <= 46 &&
        s.y >= 3 &&
        s.y <= 46
      );
    }),
    (p, d) => {
      const s = p.sitter;
      const box = [];
      for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-3, -3], [-3, 3], [3, -3], [3, 3]]) {
        box.push({ x: s.x + dx, y: s.y + dy });
      }
      const lap = enclosureMobility(d.terrain, p, box);
      if (typeof lap !== "number") throw new Error("8-tile box around the sitter has no enclosureMobility");
      const sf = (p.meta.shortfalls || []).find((s0) => s0 && s0.ladder);
      const lastBonus = sf.ladder.rungs[sf.ladder.rungs.length - 1].needDeepBonus;
      for (const row of sf.ladder.rungs) {
        if (row && row.needDeepBonus === lastBonus) {
          row.cutTiles = box.map((t) => ({ x: t.x, y: t.y }));
          row.mobility = lap;
        }
      }
      sf.detail = renderDecl(sf);
      if (p.meta.shellEscalation?.rungs) {
        for (const row of p.meta.shellEscalation.rungs) {
          if (row && row.needDeepBonus === lastBonus) {
            row.cutTiles = box.map((t) => ({ x: t.x, y: t.y }));
            row.mobility = lap;
          }
        }
      }
    },
    "would have taken|published cut");
  run("r31/88-X-last-fat-nudge-leaks-sitter",
    any28((p) => {
      const shipped = (p.structures?.rampart || []).length;
      const sf = (p.meta?.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
      const rungs = sf?.ladder?.rungs || [];
      const last = rungs[rungs.length - 1];
      return !!(
        last &&
        last.complete &&
        last.ramparts > shipped &&
        Array.isArray(last.cutTiles) &&
        last.cutTiles.length &&
        p.sitter
      );
    }),
    (p, d) => {
      const sf = (p.meta.shortfalls || []).find((s0) => s0 && s0.ladder);
      const last = sf.ladder.rungs[sf.ladder.rungs.length - 1];
      const lastBonus = last.needDeepBonus;
      const cuts = last.cutTiles.map((t) => ({ x: t.x, y: t.y }));
      const occupied = new Set(cuts.map((t) => key(t.x, t.y)));
      const tryMove = (from, to) => {
        if (to.x < 0 || to.x > 49 || to.y < 0 || to.y > 49) return null;
        if (occupied.has(key(to.x, to.y))) return null;
        const next = cuts.map((t) => (t.x === from.x && t.y === from.y ? { x: to.x, y: to.y } : { x: t.x, y: t.y }));
        const ext = exteriorFlood(d.terrain, new Set(next.map((t) => key(t.x, t.y))));
        return p.sitter && ext[p.sitter.x + p.sitter.y * 50] ? next : null;
      };
      const named = cuts.find((t) => t.x === 20 && t.y === 9);
      let next = named ? tryMove(named, { x: 19, y: 9 }) : null;
      if (!next) {
        outer: for (const t of cuts) {
          for (const [dx, dy] of D8) {
            const cand = tryMove(t, { x: t.x + dx, y: t.y + dy });
            if (cand) {
              next = cand;
              break outer;
            }
          }
        }
      }
      if (!next) throw new Error("no one-tile nudge of the last fat cut leaks the sitter");
      const lap = enclosureMobility(d.terrain, p, next);
      if (typeof lap !== "number") throw new Error("nudged cut has no enclosureMobility");
      const apply = (row) => {
        if (row && row.needDeepBonus === lastBonus) {
          row.cutTiles = next.map((t) => ({ x: t.x, y: t.y }));
          row.mobility = lap;
        }
      };
      for (const row of sf.ladder.rungs) apply(row);
      sf.detail = renderDecl(sf);
      if (p.meta.shellEscalation?.rungs) {
        for (const row of p.meta.shellEscalation.rungs) apply(row);
      }
    },
    "leaks the sitter");
  run("r29/MF6-X-extractorOffNetwork-flipped-alone",
    any28((p) => typeof p.meta?.misc?.extractorOffNetwork === "boolean" && typeof p.meta?.misc?.mineralOffNetwork === "boolean"),
    (p) => { p.meta.misc.extractorOffNetwork = !p.meta.misc.extractorOffNetwork; },
    "extractorOffNetwork|mineralOffNetwork|one measurement");
  run("r29/MF6-X-extractorSeatNetTiles-cleared",
    any28((p) => Array.isArray(p.meta?.misc?.extractorSeatNetTiles)),
    (p) => { p.meta.misc.extractorSeatNetTiles = ["1,1"]; },
    "extractorSeatNetTiles|finished network");
  run("r30/MF6-X-nukerInWindow-flattered",
    any28((p) => typeof p.meta?.towers?.nukeWindow?.nukerInWindow === "boolean"),
    (p) => { p.meta.towers.nukeWindow.nukerInWindow = !p.meta.towers.nukeWindow.nukerInWindow; },
    "nukerInWindow|published nuke window|one bbox");
  run("r30/MF6-X-center-flattered",
    any28((p) => p.meta?.towers?.nukeWindow?.center && Number.isInteger(p.meta.towers.nukeWindow.center.x)),
    (p) => { p.meta.towers.nukeWindow.center = { x: 1, y: 1 }; },
    "nukeWindow.center|fullest 5x5");
  run("r30/MF6-X-mineralSeatNetTiles-flattered",
    any28((p) => Array.isArray(p.meta?.misc?.mineralSeatNetTiles)),
    (p) => { p.meta.misc.mineralSeatNetTiles = ["1,1"]; },
    "mineralSeatNetTiles|conduct-bridge|shipped network");
  run("r30/MF6-X-coveredDetourDeclared-flattered",
    any28((p) => p.meta?.walls?.mobility?.coveredDetourDeclared === true),
    (p) => { p.meta.walls.mobility.coveredDetourDeclared = false; },
    "coveredDetourDeclared|covered-detour");
  run("r29/MF6-X-mobilityShippedFree-zeroed",
    any28((p) => typeof p.meta?.shell?.mobilityShippedFree?.maxGated === "number" && p.meta.shell.mobilityShippedFree.maxGated !== 0),
    (p) => { p.meta.shell.mobilityShippedFree.maxGated = 0; },
    "mobilityShippedFree|mass-free");
  run("r29/141e-X-seed-moved-off-the-hub-line",
    any28((p) => p.seed && Number.isInteger(p.seed.x)),
    (p) => { p.seed = { x: (p.seed.x + 3) % 48, y: (p.seed.y + 5) % 48 }; },
    "NOTES.seed|plan.seed|rendered channel");
  run("r29/M1-X-cutPasses-sealCritical-plus-1-inside-the-old-bound",
    any28((p) => (p.meta?.shell?.cutPasses || []).some((m) => m && m.kind === "reconcileSeal" && Number.isInteger(m.sealCritical))),
    (p) => { for (const m of p.meta.shell.cutPasses) if (m && Number.isInteger(m.sealCritical)) m.sealCritical += 1; },
    "seal-critical|single-removal");
  run("r29/M1-X-cutPasses-sealCritical-set-to-adds",
    any28((p) => (p.meta?.shell?.cutPasses || []).some((m) => m && m.kind === "reconcileSeal" && Number.isInteger(m.sealCritical) && m.sealCritical !== (m.adds || 0))),
    (p) => { for (const m of p.meta.shell.cutPasses) if (m && Number.isInteger(m.sealCritical)) m.sealCritical = m.adds || 0; },
    "seal-critical|single-removal");
  run("r29/M1-X-cutPasses-sealCritical-set-to-rampN",
    any28((p) => {
      const n = (p.structures?.rampart || []).length;
      return (p.meta?.shell?.cutPasses || []).some((m) => m && m.kind === "reconcileSeal" && Number.isInteger(m.sealCritical) && m.sealCritical !== n);
    }),
    (p) => {
      const n = (p.structures.rampart || []).length;
      for (const m of p.meta.shell.cutPasses) if (m && Number.isInteger(m.sealCritical)) m.sealCritical = n;
    },
    "seal-critical|single-removal");
  run("r29/M1-X-cutPasses-prune-ramparts-plus-8",
    any28((p) => (p.meta?.shell?.cutPasses || []).some((m) => m && m.kind === "inertPrune" && Number.isInteger(m.ramparts))),
    (p) => { for (const m of p.meta.shell.cutPasses) if (m && m.kind === "inertPrune") m.ramparts += 8; },
    "rampart\\(s\\) before it ran|reconstruct");
  run("r29/M1-X-cutPasses-swap-prune-rampartsDeleted",
    any28((p) => {
      const a = (p.meta?.shell?.cutPasses || []).find((m) => m && m.pass === "layer7-inertPrune");
      const b = (p.meta?.shell?.cutPasses || []).find((m) => m && m.pass === "layer7b-inertPrune");
      return !!(a && b && a.rampartsDeleted !== b.rampartsDeleted && a.rampartsDeleted >= (b.removes || 0) && b.rampartsDeleted >= (a.removes || 0));
    }),
    (p) => {
      const a = p.meta.shell.cutPasses.find((m) => m.pass === "layer7-inertPrune");
      const b = p.meta.shell.cutPasses.find((m) => m.pass === "layer7b-inertPrune");
      const t = a.rampartsDeleted;
      a.rampartsDeleted = b.rampartsDeleted;
      b.rampartsDeleted = t;
    },
    "rampart\\(s\\) before it ran|reconstruct");

  const runFile28 = (name, room, file, transform, expect) => {
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
    if (!fs.existsSync(file)) {
      results.push({ name, room, caught: false, matched: false, fails: [`the file this case forges is not there (${file})`] });
      return;
    }
    const orig = fs.readFileSync(file);
    let res;
    let threw = null;
    try {
      const next = transform(orig.toString("utf8"), byName.get(room));
      if (next === null || next === undefined || next === orig.toString("utf8")) {
        results.push({ name, room, caught: false, matched: false, fails: ["THE FORGERY CHANGED NOTHING — the case is not testing what it names"] });
        return;
      }
      fs.writeFileSync(file, next);
      resetOutputCaches();
      res = checkRoom(clone(room), d.terrain, d.objects, FLEET);
    } catch (e) {
      threw = e;
    } finally {
      fs.writeFileSync(file, orig);
      resetOutputCaches();
    }
    if (fs.readFileSync(file).toString("binary") !== orig.toString("binary")) {
      results.push({ name, room, caught: false, matched: false, fails: ["THE FILE WAS NOT RESTORED — fix this before reading any other result"] });
      return;
    }
    if (threw) {
      results.push({ name, room, caught: false, matched: false, fails: ["THREW: " + threw.message] });
      return;
    }
    const caught = res.fails.length > 0;
    results.push({ name, room, caught, matched: expect ? res.fails.some((f) => new RegExp(expect, "i").test(f)) : caught, expect, fails: res.fails.slice(0, 3) });
  };
  const pruneCaptionRoom = any28((p) => (p.meta?.walls?.prunedTransient || 0) > 0 && (p.meta?.walls?.prunedGhosts || 0) > 0);
  runFile28("r28/L1-X-roadsPrune-jams-ghosts-and-pruned",
    pruneCaptionRoom,
    path.join(OUT_V2, `${pruneCaptionRoom}.html`),
    (src, p) => {
      const at = src.indexOf("\n  var NOTES = ");
      if (at < 0) return null;
      const end = src.indexOf("\n", at + 15);
      let notes;
      try { notes = JSON.parse(src.slice(at + 15, end).replace(/;\s*$/, "")); } catch { return null; }
      if (!notes || typeof notes.roadsPrune !== "string") return null;
      const ghosts = p.meta.walls.prunedGhosts;
      const pruned = p.meta.walls.pruned;
      notes.roadsPrune =
        `${ghosts} tiles deleted — laid by an earlier layer, dead ends once every layer was in` +
        ` · meta.walls.pruned = ${pruned}`;
      return src.slice(0, at) + "\n  var NOTES = " + JSON.stringify(notes) + ";" + src.slice(end);
    },
    "NOTES.roadsPrune|jamming|ghost");
  runFile28("r28/L1-X-roadsPrune-clause-appended",
    pruneCaptionRoom,
    path.join(OUT_V2, `${pruneCaptionRoom}.html`),
    (src) => {
      const at = src.indexOf("\n  var NOTES = ");
      if (at < 0) return null;
      const end = src.indexOf("\n", at + 15);
      let notes;
      try { notes = JSON.parse(src.slice(at + 15, end).replace(/;\s*$/, "")); } catch { return null; }
      if (!notes || typeof notes.roadsPrune !== "string") return null;
      notes.roadsPrune += " AND THE PRUNE DELETED NOTHING THAT MATTERED.";
      return src.slice(0, at) + "\n  var NOTES = " + JSON.stringify(notes) + ";" + src.slice(end);
    },
    "NOTES.roadsPrune|last character|appended|generated");
}

// ===========================================================================
// 2b. THE NUMERAL GATE'S OWN MUTATIONS.
// ===========================================================================
// The rot class is always the same event: the ARTIFACT moves and the sentence
// does not. So the mutation is the artifact moving. A fleet one room smaller
// and a fleet one room larger both invalidate every completeness denominator
// the suite's prose states, and the gate has to say so — if it does not, it is
// a gate that would have passed all six rounds of this finding.
{
  const numeralCase = (name, mutatePlans) => {
    if (ONLY && !new RegExp(ONLY, "i").test(name)) {
      skipped++;
      return;
    }
    let res;
    try {
      res = numeralAudit(mutatePlans(plans.slice()));
    } catch (e) {
      results.push({ name, room: "fleet", caught: false, matched: false, fails: ["numeralAudit THREW: " + e.message] });
      return;
    }
    const caught = res.bad.length > 0;
    results.push({
      name,
      room: "fleet",
      caught,
      matched: caught,
      expect: "numeral audit reports WRONG",
      fails: caught ? [] : ["the audit reported no WRONG numeral against a fleet the prose does not describe"],
      note: caught ? `${res.bad.length} numeral(s) flagged, e.g. ${res.bad[0].file}:${res.bad[0].line} "${res.bad[0].quote}"` : "",
    });
  };
  numeralCase("r22/NUMERAL-the-fleet-shrinks-under-the-prose", (P) => P.slice(0, P.length - 1));
  numeralCase("r22/NUMERAL-the-fleet-grows-under-the-prose", (P) => P.concat([JSON.parse(JSON.stringify(P[0]))]));
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

process.exit(baseFail.length || escapes.length || numeralBad.length ? 1 : 0);
