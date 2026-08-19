/**
 * r45 / criticism 88 — can a same-lap last-rung nudge be bound without a
 * 119ms×172 mid-layer replay? Throwaway. Does not write the artifact.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { performance } from "perf_hooks";
import { checkRoom } from "./validate.mjs";
import { D4, D8, exteriorFlood, key } from "./shared.mjs";
import { enclosureMobility, planShell, RADII_WIDE } from "./layer-shell.mjs";
import { planHub } from "./layer-hub.mjs";
import { composePlan } from "./pipeline.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PLANS = path.join(DIR, "../out-v2/plans-hub.json");
const ROOMS = path.join(DIR, "_r28-mech/rooms.json");
const K = (t) => `${t.x},${t.y}`;
const idx = (x, y) => x + y * 50;
const ESCALATION_RADII_LATE = [10, 11, 12, 13, 14];
const FLEET_RE = /fleetMediansMeasured|eco\.ctrlMedian|eco\.srcMedian|eco\.ctrlGate|eco\.srcGate/;

const plans = JSON.parse(fs.readFileSync(PLANS, "utf8")).filter((p) => p && p.room && !p.error);
const rooms = JSON.parse(fs.readFileSync(ROOMS, "utf8"));
const byRoom = new Map(rooms.map((r) => [r.room, r]));

function lastFat(plan) {
  const shipped = (plan.structures?.rampart || []).length;
  const esc = plan.meta?.shellEscalation;
  const fromEsc = (esc?.rungs || []).filter((r) => r && r.ramparts > shipped && Array.isArray(r.cutTiles) && r.cutTiles.length);
  if (fromEsc.length) return fromEsc[fromEsc.length - 1];
  const sf = (plan.meta?.shortfalls || []).find((s) => s && s.ladder);
  const fromSf = (sf?.ladder?.rungs || []).filter((r) => r && r.ramparts > shipped && Array.isArray(r.cutTiles) && r.cutTiles.length);
  return fromSf[fromSf.length - 1] || null;
}

function walkable(terrain, x, y) {
  if (x < 0 || x > 49 || y < 0 || y > 49) return false;
  return (parseInt(terrain.charAt(y * 50 + x), 10) & 1) === 0;
}

function flood(terrain, cuts) {
  return exteriorFlood(terrain, new Set(cuts.map(K)));
}

function leaksSitter(terrain, plan, cuts) {
  const ext = flood(terrain, cuts);
  return !!(plan.sitter && ext[plan.sitter.x + plan.sitter.y * 50]);
}

function looseTiles(terrain, plan, cuts) {
  const loose = [];
  for (let i = 0; i < cuts.length; i++) {
    const next = cuts.filter((_, j) => j !== i);
    if (!leaksSitter(terrain, plan, next)) loose.push(K(cuts[i]));
  }
  return loose;
}

function d4Boundary(terrain, cuts) {
  const set = new Set(cuts.map(K));
  const ext = flood(terrain, cuts);
  const bad = [];
  for (const t of cuts) {
    let toExt = false;
    let toInt = false;
    for (const [dx, dy] of D4) {
      const nx = t.x + dx;
      const ny = t.y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) {
        toExt = true;
        continue;
      }
      if (!walkable(terrain, nx, ny)) continue;
      if (set.has(`${nx},${ny}`)) continue;
      if (ext[idx(nx, ny)]) toExt = true;
      else toInt = true;
    }
    if (!toExt || !toInt) bad.push({ k: K(t), toExt, toInt, walk: walkable(terrain, t.x, t.y) });
  }
  return bad;
}

function d8Boundary(terrain, cuts) {
  const set = new Set(cuts.map(K));
  const ext = flood(terrain, cuts);
  const bad = [];
  for (const t of cuts) {
    let toExt = false;
    let toInt = false;
    for (const [dx, dy] of D8) {
      const nx = t.x + dx;
      const ny = t.y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) {
        toExt = true;
        continue;
      }
      if (!walkable(terrain, nx, ny)) continue;
      if (set.has(`${nx},${ny}`)) continue;
      if (ext[idx(nx, ny)]) toExt = true;
      else toInt = true;
    }
    if (!toExt || !toInt) bad.push({ k: K(t), toExt, toInt });
  }
  return bad;
}

function components(cuts, neigh) {
  const set = new Set(cuts.map(K));
  const seen = new Set();
  let n = 0;
  for (const t of cuts) {
    const start = K(t);
    if (seen.has(start)) continue;
    n++;
    const q = [t];
    seen.add(start);
    while (q.length) {
      const c = q.pop();
      for (const [dx, dy] of neigh) {
        const k = `${c.x + dx},${c.y + dy}`;
        if (!set.has(k) || seen.has(k)) continue;
        seen.add(k);
        q.push({ x: c.x + dx, y: c.y + dy });
      }
    }
  }
  return n;
}

function radiiFor(bonus) {
  if (bonus === 85) return ESCALATION_RADII_LATE;
  if (bonus === 25 || bonus === 55) return RADII_WIDE;
  return undefined;
}

function layer1Plan(plan) {
  const layer = plan.meta?.roadLayer || {};
  const roads = (plan.structures?.road || []).filter((r) => layer[`${r.x},${r.y}`] === 1);
  return {
    ...plan,
    structures: {
      ...plan.structures,
      road: roads,
      extension: [],
      tower: [],
      lab: [],
      nuker: [],
      observer: [],
    },
  };
}

function sameSet(a, b) {
  const s = new Set((b || []).map(K));
  return !!(a && a.length === s.size && a.every((t) => s.has(K(t))));
}

const e11 = plans.find((p) => p.room === "E11S2");
const d11 = byRoom.get("E11S2");
const fat = lastFat(e11);
const cuts = fat.cutTiles.map((t) => ({ x: t.x, y: t.y }));
const named = cuts.find((t) => t.x === 29 && t.y === 33);
const nudged = cuts.map((t) => (t.x === 29 && t.y === 33 ? { x: 28, y: 34 } : { x: t.x, y: t.y }));
const origLap = enclosureMobility(d11.terrain, e11, cuts);
const nudgeLap = enclosureMobility(d11.terrain, e11, nudged);

const cheap = {
  room: "E11S2",
  bonus: fat.needDeepBonus,
  n: cuts.length,
  ramparts: fat.ramparts,
  has2933: !!named,
  has2834orig: cuts.some((t) => t.x === 28 && t.y === 34),
  origLap,
  nudgeLap,
  origLeak: leaksSitter(d11.terrain, e11, cuts),
  nudgeLeak: leaksSitter(d11.terrain, e11, nudged),
  origLoose: looseTiles(d11.terrain, e11, cuts),
  nudgeLoose: looseTiles(d11.terrain, e11, nudged),
  origD4b: d4Boundary(d11.terrain, cuts),
  nudgeD4b: d4Boundary(d11.terrain, nudged),
  origD8b: d8Boundary(d11.terrain, cuts),
  nudgeD8b: d8Boundary(d11.terrain, nudged),
  origD4c: components(cuts, D4),
  nudgeD4c: components(nudged, D4),
  origD8c: components(cuts, D8),
  nudgeD8c: components(nudged, D8),
  origWalk2834: walkable(d11.terrain, 28, 34),
  origWalk2933: walkable(d11.terrain, 29, 33),
};

console.log("CHEAP", JSON.stringify(cheap, null, 2));

function replayShell(plan, d, bonus) {
  const hub = planHub(d.terrain, d.objects, { seedSkip: plan.meta?.seedSkip ?? 0 });
  if (hub.error) return { err: hub.error };
  const shellPlan = { room: plan.room, terrain: d.terrain, ...hub };
  const opts = { needDeepBonus: bonus };
  const r = radiiFor(bonus);
  if (r) opts.radii = r;
  const t0 = performance.now();
  const shell = planShell(d.terrain, shellPlan, opts);
  const ms = performance.now() - t0;
  if (shell.error) return { err: shell.error, ms };
  const cut = (shell.shell?.cut || []).map((t) => ({ x: t.x, y: t.y }));
  return { ms, n: cut.length, cut, err: null };
}

function replayShellOnShippedL1(plan, d, bonus) {
  if (!Array.isArray(plan.basin)) return { err: "no basin on shipped plan", ms: 0, n: 0, cut: [] };
  const p = layer1Plan(plan);
  const opts = { needDeepBonus: bonus };
  const r = radiiFor(bonus);
  if (r) opts.radii = r;
  const t0 = performance.now();
  const shell = planShell(d.terrain, p, opts);
  const ms = performance.now() - t0;
  if (shell.error) return { err: shell.error, ms };
  const cut = (shell.shell?.cut || []).map((t) => ({ x: t.x, y: t.y }));
  return { ms, n: cut.length, cut, err: null };
}

const tHub0 = performance.now();
const hub = planHub(d11.terrain, d11.objects, { seedSkip: e11.meta?.seedSkip ?? 0 });
const hubMs = performance.now() - tHub0;
const rHub = replayShell(e11, d11, 85);
const rL1 = replayShellOnShippedL1(e11, d11, 85);
const tC0 = performance.now();
const composed = composePlan(d11, { radii: ESCALATION_RADII_LATE, needDeepBonus: 85, seedSkip: e11.meta?.seedSkip ?? 0 });
const composeMs = performance.now() - tC0;
const composeCut = composed?.meta?.shell?.cutAtFreeze || [];

console.log("REPLAY E11S2", JSON.stringify({
  seedSkip: e11.meta?.seedSkip ?? 0,
  hubMs,
  hubErr: hub.error || null,
  planShellAfterHub: { ms: rHub.ms, n: rHub.n, err: rHub.err, match: sameSet(rHub.cut, cuts) },
  planShellShippedL1: { ms: rL1.ms, n: rL1.n, err: rL1.err, match: sameSet(rL1.cut, cuts) },
  composePlan: { ms: composeMs, n: composeCut.length, match: sameSet(composeCut, cuts), err: composed.error || null },
}, null, 2));

const fats = [];
for (const p of plans) {
  const fat0 = lastFat(p);
  if (!fat0) continue;
  fats.push({ room: p.room, bonus: fat0.needDeepBonus, n: fat0.cutTiles.length, ramparts: fat0.ramparts });
}
console.log("FLEET last-fat rooms", fats.length);

function discardedRows(plan) {
  const shipped = (plan.structures?.rampart || []).length;
  const esc = plan.meta?.shellEscalation;
  const picked = esc && typeof esc.pickedNeedDeepBonus === "number" ? esc.pickedNeedDeepBonus : null;
  const isDisc = (row) => {
    if (!row || !Array.isArray(row.cutTiles) || !row.cutTiles.length) return false;
    if (esc && picked !== null) return row.needDeepBonus !== picked;
    return typeof row.ramparts === "number" && row.ramparts !== shipped;
  };
  const out = [];
  const seen = new Set();
  for (const row of esc?.rungs || []) {
    if (!isDisc(row)) continue;
    const k = `e:${row.needDeepBonus}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ where: "esc", bonus: row.needDeepBonus, cuts: row.cutTiles });
  }
  const sf = (plan.meta?.shortfalls || []).find((s) => s && s.ladder);
  for (const row of sf?.ladder?.rungs || []) {
    if (!isDisc(row)) continue;
    const k = `e:${row.needDeepBonus}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ where: "ladder", bonus: row.needDeepBonus, cuts: row.cutTiles });
  }
  return out;
}

const allDisc = [];
let discRooms = 0;
let recov = 0;
for (const p of plans) {
  const rows = discardedRows(p);
  if (!rows.length) continue;
  discRooms++;
  if (!p.meta?.shellEscalation) recov++;
  for (const r of rows) allDisc.push({ room: p.room, ...r, n: r.cuts.length });
}
console.log("FLEET discarded", JSON.stringify({
  rooms: discRooms,
  recoveryNoEsc: recov,
  rows: allDisc.length,
  hasSources: plans.filter((p) => Array.isArray(p.sources) && p.sources.length).length,
  hasController: plans.filter((p) => p.controller && Number.isInteger(p.controller.x)).length,
}, null, 2));

const fleet = [];
let sumMs = 0;
let match = 0;
let miss = 0;
const tAll0 = performance.now();
for (const p of plans) {
  const rows = discardedRows(p);
  if (!rows.length) continue;
  const d = byRoom.get(p.room);
  if (!d) {
    fleet.push({ room: p.room, err: "no terrain" });
    continue;
  }
  const t0 = performance.now();
  const hub = planHub(d.terrain, d.objects, { seedSkip: p.meta?.seedSkip ?? 0 });
  if (hub.error) {
    fleet.push({ room: p.room, err: hub.error });
    continue;
  }
  const shellPlan = { room: p.room, terrain: d.terrain, ...hub };
  const cache = new Map();
  const rowOut = [];
  for (const row of rows) {
    const opts = { needDeepBonus: row.bonus, shellCache: cache };
    const rad = radiiFor(row.bonus);
    if (rad) opts.radii = rad;
    const shell = planShell(d.terrain, shellPlan, opts);
    const cut = shell.error ? [] : (shell.shell?.cut || []);
    const ok = !shell.error && sameSet(cut, row.cuts);
    rowOut.push({ bonus: row.bonus, nPub: row.n, nGot: cut.length, err: shell.error || null, match: ok });
    if (ok) match++;
    else miss++;
  }
  const ms = performance.now() - t0;
  sumMs += ms;
  fleet.push({ room: p.room, ms: +ms.toFixed(1), rows: rowOut });
}
const allMs = performance.now() - tAll0;
console.log("FLEET replay ALL discarded + cache", JSON.stringify({
  rooms: discRooms,
  rows: allDisc.length,
  match,
  miss,
  sumMs: +sumMs.toFixed(1),
  wallMs: +allMs.toFixed(1),
  meanMsPerRoom: +(sumMs / Math.max(1, discRooms)).toFixed(1),
  maxMs: +Math.max(0, ...fleet.map((r) => r.ms || 0)).toFixed(1),
  misses: fleet.flatMap((r) => (r.rows || []).filter((x) => !x.match).map((x) => ({ room: r.room, ...x }))).slice(0, 16),
}, null, 2));

const fleetLast = [];
let sumLast = 0;
let matchLast = 0;
let missLast = 0;
for (const row of fats) {
  const p = plans.find((x) => x.room === row.room);
  const d = byRoom.get(row.room);
  if (!d) continue;
  const t0 = performance.now();
  const r = replayShell(p, d, row.bonus);
  const ms = performance.now() - t0;
  sumLast += ms;
  const ok = !r.err && sameSet(r.cut, lastFat(p).cutTiles);
  if (ok) matchLast++;
  else missLast++;
  fleetLast.push({ room: row.room, bonus: row.bonus, ms: +ms.toFixed(1), match: ok });
}
console.log("FLEET replay hub+planShell last-fat", JSON.stringify({
  rooms: fats.length,
  match: matchLast,
  miss: missLast,
  sumMs: +sumLast.toFixed(1),
  meanMs: +(sumLast / Math.max(1, fats.length)).toFixed(1),
  maxMs: +Math.max(0, ...fleetLast.map((r) => r.ms || 0)).toFixed(1),
}, null, 2));

// time checkRoom baseline on E11S2 and 5 rooms
const sample = ["E11S2", "E11S1", "E5S2", "E11S7", "E2S7"];
for (const room of sample) {
  const p = plans.find((x) => x.room === room);
  const d = byRoom.get(room);
  const t0 = performance.now();
  const res = checkRoom(p, d.terrain, d.objects);
  const ms = performance.now() - t0;
  const fails = (res.fails || []).filter((f) => !FLEET_RE.test(f));
  console.log("CHECK", room, "ms", +ms.toFixed(1), "fails", fails.length);
}
