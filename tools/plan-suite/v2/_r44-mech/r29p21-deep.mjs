/**
 * r29p21 leftover: deepBudget formula on the stubCap pool, worstCase walks,
 * lapVeto constants. Throwaway.
 */
import { loadPlans, loadRooms, K, D8, idx } from "./common.mjs";
import { buildable, exteriorFlood, reservedTiles, mineralGuard } from "../shared.mjs";
import { fieldFrom } from "../layer-hub.mjs";
import { interiorWalk, maskFromKeys, mobilityStats } from "../layer-shell.mjs";

const { plans } = loadPlans();
const { byRoom } = loadRooms();
const DEPTH_SAFE = 4;
const LANE_DEEP_MAX = 24;
const LANE_DEEP_KEEP = 60;
const LANE_DEEP_MIN = 8;
const FLANK_HARD_CAP = 18;
const L6 = ["storage", "terminal", "link", "spawn", "container", "tower", "lab", "nuker", "observer"];

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
function l6Occ(p) {
  const occ = new Set(objectTiles(p));
  for (const t of L6) for (const q of p.structures?.[t] || []) occ.add(K(q));
  return occ;
}
function l6Res(p) {
  const s = reservedTiles(p);
  for (const q of p.parkReserve || p.meta?.ctrlParkReserve || []) {
    if (q && Number.isInteger(q.x)) s.add(K(q));
  }
  const seat = p.claimSeat || p.meta?.claimSeat;
  const appr = p.claimApproach || p.meta?.claimApproach;
  if (seat && Number.isInteger(seat.x)) s.add(K(seat));
  if (appr && Number.isInteger(appr.x)) s.add(K(appr));
  return s;
}
function pavedLt(p, layerLt) {
  const s = new Set();
  for (const [k, v] of Object.entries(p.meta?.roadLayer || {})) {
    if (typeof v === "number" && v < layerLt) s.add(k);
  }
  return s;
}
function depthOf(ext) {
  const depth = new Int16Array(2500).fill(999);
  const q = [];
  for (let i = 0; i < 2500; i++) if (ext[i]) { depth[i] = 0; q.push(i); }
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
  return depth;
}
function budgetOf(deepFree) {
  const surplus = Math.max(0, Math.min(LANE_DEEP_MAX, deepFree - LANE_DEEP_KEEP));
  return Math.max(surplus, Math.min(LANE_DEEP_MIN, deepFree));
}

function pool(terrain, p, paved, cap) {
  const freeze = freezeCut(p);
  const freezeSet = new Set(freeze.map(K));
  const ext = exteriorFlood(terrain, freezeSet);
  const depth = depthOf(ext);
  const occ = l6Occ(p);
  const reserved = l6Res(p);
  const forbid = new Set();
  for (const s of p.meta?.composeOpts?.forbidExtSeat || []) {
    if (s && Number.isInteger(s.x)) forbid.add(K(s));
  }
  const hf = fieldFrom(terrain, p.sitter, occ);
  const mGuard = mineralGuard(terrain, p);
  const blockedNow = new Set(occ);
  const tiles = [];
  for (let x = 2; x <= 47; x++) {
    for (let y = 2; y <= 47; y++) {
      const i = idx(x, y);
      if (depth[i] < DEPTH_SAFE || ext[i] || !buildable(terrain, x, y)) continue;
      const k = `${x},${y}`;
      if (occ.has(k) || reserved.has(k) || paved.has(k) || forbid.has(k)) continue;
      if (hf[i] >= 9999 || hf[i] > cap) continue;
      if (!mGuard.ok({ x, y }, blockedNow)) continue;
      tiles.push({ x, y, k });
    }
  }
  return { tiles, freeze, freezeSet, ext, occ };
}

function T(name, rows) {
  let have = 0, match = 0;
  const miss = [];
  for (const r of rows) {
    if (!r) continue;
    have++;
    if (r.ok) match++;
    else if (miss.length < 4) miss.push(r.miss);
  }
  return { name, have, match, missN: have - match, miss };
}

const db = {};
const modes = [
  ["pre6-18", (p) => [pavedLt(p, 6), 18]],
  ["pre6-999", (p) => [pavedLt(p, 6), 999]],
  ["pre7-18", (p) => [pavedLt(p, 7), 18]],
  ["none-18", (p) => [new Set(), 18]],
  ["shippedRoads-18", (p) => [new Set((p.structures?.road || []).map(K)), 18]],
];

for (const [name, mk] of modes) {
  const rows = plans.map((p) => {
    const d = byRoom.get(p.room);
    const got = p.meta?.extensions?.laneMeta?.deepBudget;
    if (!d || !p.sitter || typeof got !== "number") return null;
    const [paved, cap] = mk(p);
    const { tiles } = pool(d.terrain, p, paved, cap);
    const want = budgetOf(tiles.length);
    return { ok: want === got, miss: { room: p.room, got, want, pool: tiles.length } };
  });
  db[name] = T(name, rows);
}

// worstCase: freeze-cut walk with pool tiles blocked
const wc = {};
for (const [name, mk] of modes) {
  const rows = plans.map((p) => {
    const d = byRoom.get(p.room);
    const got = p.meta?.extensions?.laneMeta?.worstCase;
    if (!d || !p.sitter || got == null) return null;
    const [paved, cap] = mk(p);
    const { tiles, freeze, freezeSet, ext, occ } = pool(d.terrain, p, paved, cap);
    if (!freeze.length) return null;
    const blocked = new Set(occ);
    if (p.sitter) blocked.add(K(p.sitter));
    for (const c of p.structures?.container || []) blocked.delete(K(c));
    for (const t of tiles) blocked.add(t.k);
    const walk = interiorWalk(d.terrain, freezeSet, ext, blocked, p.sitter);
    const st = mobilityStats(freeze, ext, maskFromKeys(walk));
    const want = typeof got === "number" ? st.maxGated : got;
    return { ok: typeof got === "number" && Math.abs(got - st.maxGated) < 1e-9, miss: { room: p.room, got, want: st.maxGated } };
  });
  wc[name] = T("wc-" + name, rows);
}

// lapVeto constants
const lv = { target: { have: 0, match: 0 }, budget: { have: 0, match: 0 }, noAlt: { have: 0, match: 0 } };
const budgetHist = {};
for (const p of plans) {
  const v = p.meta?.labs?.lapVeto;
  if (!v) continue;
  if (typeof v.target === "number") {
    lv.target.have++;
    if (v.target === 1.2) lv.target.match++;
  }
  if (typeof v.budget === "number") {
    lv.budget.have++;
    budgetHist[v.budget] = (budgetHist[v.budget] || 0) + 1;
    if (v.budget === 16) lv.budget.match++;
  }
  if (typeof v.noAlternative === "boolean") {
    lv.noAlt.have++;
    if (v.noAlternative === false) lv.noAlt.match++;
  }
}

// freeLeft vs remaining deep road-faced on shipped board
const fl = T("freeLeft-shipped-deep-roadfaced", plans.map((p) => {
  const d = byRoom.get(p.room);
  const got = p.meta?.extensions?.reflow?.freeLeft;
  if (!d || typeof got !== "number" || !p.sitter) return null;
  const { tiles } = pool(d.terrain, p, new Set((p.structures?.road || []).map(K)), 18);
  const roads = new Set((p.structures?.road || []).map(K));
  const exts = new Set((p.structures?.extension || []).map(K));
  let n = 0;
  for (const t of tiles) {
    if (exts.has(t.k)) continue;
    if ([[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => roads.has(`${t.x + dx},${t.y + dy}`))) n++;
  }
  return { ok: n === got, miss: { room: p.room, got, want: n } };
}));

console.log(JSON.stringify({ db, wc, lv, budgetHist, fl }, null, 2));
