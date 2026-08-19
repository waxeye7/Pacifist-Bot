/**
 * r29p20 leftover board walks: baseOverGated, deepBudget, freeLeft opening.
 * Throwaway.
 */
import { loadPlans, loadRooms, K, D8, idx } from "./common.mjs";
import { buildable, exteriorFlood } from "../shared.mjs";
import { fieldFrom } from "../layer-hub.mjs";
import {
  interiorWalk,
  maskFromKeys,
  mobilityStats,
  BUILT_OBSTACLES,
} from "../layer-shell.mjs";

const { plans } = loadPlans();
const { byRoom } = loadRooms();
const DEPTH_SAFE = 4;
const LANE_DEEP_MAX = 24;
const LANE_DEEP_KEEP = 60;
const LANE_DEEP_MIN = 8;
const FLANK_HARD_CAP = 18;
const L6_OCC = ["storage", "terminal", "link", "spawn", "container", "tower", "lab", "nuker", "observer"];

function freezeCut(p) {
  const sh = p.meta?.shell || {};
  return Array.isArray(sh.cutAtFreeze) && sh.cutAtFreeze.length ? sh.cutAtFreeze : sh.cut || [];
}
function objectTiles(p) {
  const s = new Set();
  for (const src of p.sources || []) s.add(K(src));
  if (p.controller) s.add(K(p.controller));
  if (p.mineral) s.add(K(p.mineral));
  return s;
}

function overGatedOf(terrain, p, cut, skip) {
  if (!cut.length || !p.sitter) return null;
  const cutSet = new Set(cut.map(K));
  const ext = exteriorFlood(terrain, cutSet);
  const blocked = new Set(objectTiles(p));
  if (p.sitter) blocked.add(K(p.sitter));
  for (const t of BUILT_OBSTACLES) {
    if (skip.has(t)) continue;
    for (const q of p.structures?.[t] || []) blocked.add(K(q));
  }
  const walk = interiorWalk(terrain, cutSet, ext, blocked, p.sitter);
  return mobilityStats(cut, ext, maskFromKeys(walk)).overGated;
}

function T(name, rows) {
  let have = 0;
  let match = 0;
  const miss = [];
  for (const r of rows) {
    if (!r) continue;
    have++;
    if (r.ok) match++;
    else if (miss.length < 5) miss.push(r.miss);
  }
  return { name, have, match, missN: have - match, miss };
}

const skipSets = [
  ["ext+nuker+obs", new Set(["extension", "nuker", "observer"])],
  ["ext", new Set(["extension"])],
  ["ext+nuker+obs+lab", new Set(["extension", "nuker", "observer", "lab"])],
  ["ext+nuker+obs+tower", new Set(["extension", "nuker", "observer", "tower"])],
  ["all-but-hub", new Set(["extension", "nuker", "observer", "lab", "tower"])],
  ["none", new Set()],
];

const bog = {};
for (const [name, skip] of skipSets) {
  const freezeRows = plans.map((p) => {
    const d = byRoom.get(p.room);
    const got = p.meta?.misc?.mobilityVeto?.baseOverGated;
    if (!d || typeof got !== "number") return null;
    const want = overGatedOf(d.terrain, p, freezeCut(p), skip);
    return { ok: want === got, miss: { room: p.room, got, want } };
  });
  const shipRows = plans.map((p) => {
    const d = byRoom.get(p.room);
    const got = p.meta?.misc?.mobilityVeto?.baseOverGated;
    if (!d || typeof got !== "number") return null;
    const want = overGatedOf(d.terrain, p, p.meta?.shell?.cut || [], skip);
    return { ok: want === got, miss: { room: p.room, got, want } };
  });
  bog[`freeze-${name}`] = T(`bog-freeze-${name}`, freezeRows);
  bog[`ship-${name}`] = T(`bog-ship-${name}`, shipRows);
}

// deepBudget vs formula on various deepFree estimates
function deepPool(terrain, p, pavedMode) {
  if (!p.sitter) return null;
  const freeze = freezeCut(p);
  const freezeSet = new Set(freeze.map(K));
  const ext = exteriorFlood(terrain, freezeSet);
  const depth = new Int16Array(2500).fill(999);
  const q = [];
  for (let i = 0; i < 2500; i++) {
    if (ext[i]) {
      depth[i] = 0;
      q.push(i);
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % 50;
    const y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = idx(nx, ny);
      if (depth[ni] <= depth[i] + 1) continue;
      depth[ni] = depth[i] + 1;
      q.push(ni);
    }
  }
  const occ = new Set(objectTiles(p));
  for (const t of L6_OCC) {
    for (const q2 of p.structures?.[t] || []) occ.add(K(q2));
  }
  const paved = new Set();
  for (const [k, v] of Object.entries(p.meta?.roadLayer || {})) {
    if (typeof v !== "number") continue;
    if (pavedMode === "pre6" && v < 6) paved.add(k);
    if (pavedMode === "pre7" && v < 7) paved.add(k);
    if (pavedMode === "l6" && v === 6) paved.add(k);
    if (pavedMode === "pre6+l6" && v <= 6) paved.add(k);
  }
  const reserved = new Set();
  const seat = p.claimSeat || p.meta?.claimSeat;
  const appr = p.claimApproach || p.meta?.claimApproach;
  if (seat && Number.isInteger(seat.x)) reserved.add(K(seat));
  if (appr && Number.isInteger(appr.x)) reserved.add(K(appr));
  for (const q2 of p.meta?.ctrlParkReserve || []) {
    if (q2 && Number.isInteger(q2.x)) reserved.add(K(q2));
  }
  const hf = fieldFrom(terrain, p.sitter, occ);
  let n = 0;
  for (let x = 2; x <= 47; x++) {
    for (let y = 2; y <= 47; y++) {
      const i = idx(x, y);
      if (depth[i] < DEPTH_SAFE || ext[i] || !buildable(terrain, x, y)) continue;
      const k = `${x},${y}`;
      if (occ.has(k) || reserved.has(k) || paved.has(k)) continue;
      if (hf[i] >= 9999 || hf[i] > FLANK_HARD_CAP) continue;
      n++;
    }
  }
  return n;
}
function budgetOf(deepFree) {
  const surplus = Math.max(0, Math.min(LANE_DEEP_MAX, deepFree - LANE_DEEP_KEEP));
  return Math.max(surplus, Math.min(LANE_DEEP_MIN, deepFree));
}

const db = {};
for (const mode of ["pre6", "pre6+l6", "pre7", "l6"]) {
  const rows = plans.map((p) => {
    const d = byRoom.get(p.room);
    const got = p.meta?.extensions?.laneMeta?.deepBudget;
    if (!d || typeof got !== "number") return null;
    const pool = deepPool(d.terrain, p, mode);
    const want = budgetOf(pool);
    return { ok: want === got, miss: { room: p.room, got, want, pool } };
  });
  db[mode] = T(`deepBudget-${mode}`, rows);
}

// stubExhausted vs shallow, corridorFallback, rescue
const stubVs = {};
const stubTrue = [];
for (const p of plans) {
  const se = p.meta?.extensions?.stubExhausted;
  if (typeof se !== "boolean") continue;
  if (se) {
    stubTrue.push({
      room: p.room,
      shallow: p.meta?.extensions?.shallow,
      fallback: p.meta?.extensions?.corridorFallback,
      stubRoads: p.meta?.extensions?.stubRoads,
      stubCap: p.meta?.extensions?.stubCap,
      rescueSpent: p.meta?.extensions?.rescueSpent,
      deepExhausted: p.meta?.extensions?.deepExhausted,
    });
  }
}
for (const [name, pred] of [
  ["iff-shallow", (p) => p.meta.extensions.stubExhausted === ((p.meta.extensions.shallow || 0) > 0)],
  ["iff-fallback", (p) => p.meta.extensions.stubExhausted === ((p.meta.extensions.corridorFallback || 0) > 0)],
  ["iff-deepExh", (p) => p.meta.extensions.stubExhausted === !!p.meta.extensions.deepExhausted],
  ["iff-rescue", (p) => p.meta.extensions.stubExhausted === ((p.meta.extensions.rescueSpent || 0) > 0)],
]) {
  let have = 0;
  let match = 0;
  for (const p of plans) {
    if (typeof p.meta?.extensions?.stubExhausted !== "boolean") continue;
    have++;
    if (pred(p)) match++;
  }
  stubVs[name] = { have, match };
}

// deepExhausted vs leftover
const deVs = {};
for (const [name, pred] of [
  ["iff-shallow", (p) => !!p.meta.extensions.deepExhausted === ((p.meta.extensions.shallow || 0) > 0)],
  ["iff-fallback", (p) => !!p.meta.extensions.deepExhausted === ((p.meta.extensions.corridorFallback || 0) > 0)],
  ["iff-stub", (p) => !!p.meta.extensions.deepExhausted === !!p.meta.extensions.stubExhausted],
  ["iff-freeLeft0", (p) => !!p.meta.extensions.deepExhausted === ((p.meta.extensions.reflow?.freeLeft || 0) === 0)],
]) {
  let have = 0;
  let match = 0;
  for (const p of plans) {
    if (typeof p.meta?.extensions?.deepExhausted !== "boolean") continue;
    have++;
    if (pred(p)) match++;
  }
  deVs[name] = { have, match };
}

console.log(JSON.stringify({
  bog: Object.fromEntries(Object.entries(bog).map(([k, v]) => [k, { have: v.have, match: v.match, missN: v.missN, miss: v.miss }])),
  db: Object.fromEntries(Object.entries(db).map(([k, v]) => [k, { have: v.have, match: v.match, missN: v.missN, miss: v.miss }])),
  stubVs,
  stubTrue,
  deVs,
}, null, 2));
