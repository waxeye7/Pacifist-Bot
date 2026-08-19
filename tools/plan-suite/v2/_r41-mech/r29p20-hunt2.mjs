/**
 * r29p20 leftover board-walk hunt. Throwaway. Never writes the artifact.
 */
import { loadPlans, loadRooms, K, D8, D4, idx } from "./common.mjs";
import {
  walkable,
  buildable,
  exteriorFlood,
  reservedTiles,
  mineralGuard,
} from "../shared.mjs";
import { fieldFrom } from "../layer-hub.mjs";

const { plans } = loadPlans();
const { byRoom } = loadRooms();

const DEPTH_SAFE = 4;
const MAX_REFILL = 10;
const RELAX_REFILL = [12, 14, 18];
const MAX_CANDS = 260;
const REFILL_W = 40;
const ROAD_W = 60;
const DIAG_FACE_W = 90;

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

function reservedOf(p) {
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

function roadsBefore(p, layerLt) {
  const s = new Set();
  for (const [k, v] of Object.entries(p.meta?.roadLayer || {})) {
    if (typeof v === "number" && v < layerLt) s.add(k);
  }
  return s;
}

function roadField(terrain, roadSet, occupied) {
  const dist = new Int16Array(2500).fill(9999);
  const q = [];
  for (const k of roadSet) {
    const [x, y] = k.split(",").map(Number);
    if (!walkable(terrain, x, y)) continue;
    const i = idx(x, y);
    dist[i] = 0;
    q.push(i);
  }
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
      if (!occupied.has(`${nx},${ny}`)) q.push(ni);
    }
  }
  return dist;
}

function spatialPrune(cands) {
  const byBlock = new Map();
  for (const c of cands) {
    const b = ((c.y >> 1) << 6) | (c.x >> 1);
    const cost = REFILL_W * c.ref + ROAD_W * c.spur + (c.d4 ? 0 : DIAG_FACE_W);
    const prev = byBlock.get(b);
    if (!prev || cost < prev.cost) byBlock.set(b, { c, cost });
  }
  return [...byBlock.values()].map((v) => v.c);
}

function wantSearchedSeats(terrain, p, roadMode) {
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
  const occupied = new Set();
  for (const t of ["storage", "terminal", "link", "spawn", "container"]) {
    for (const q2 of p.structures?.[t] || []) occupied.add(K(q2));
  }
  if (p.sitter) occupied.add(K(p.sitter));
  for (const k of objectTiles(p)) occupied.add(k);
  const reserved = reservedOf(p);
  let roadSet;
  if (roadMode === "all") roadSet = new Set((p.structures?.road || []).map(K));
  else if (roadMode === "pre3") roadSet = roadsBefore(p, 3);
  else if (roadMode === "pre5") roadSet = roadsBefore(p, 5);
  else roadSet = new Set();
  const blockers = new Set();
  for (const t of ["storage", "terminal", "link", "spawn"]) {
    for (const q2 of p.structures?.[t] || []) blockers.add(K(q2));
  }
  for (const k of objectTiles(p)) blockers.add(k);
  const refill = fieldFrom(terrain, p.sitter, blockers);
  const roadDist = roadField(terrain, roadSet, blockers);
  const mGuard = mineralGuard(terrain, p);
  const standBlocked = new Set(objectTiles(p));
  for (const ty of ["storage", "terminal", "link", "spawn", "lab"]) {
    for (const q2 of p.structures?.[ty] || []) standBlocked.add(K(q2));
  }
  const faceOf = (x, y, dirs) =>
    dirs.some(([dx, dy]) => walkable(terrain, x + dx, y + dy) && !blockers.has(`${x + dx},${y + dy}`));
  const gather = (maxRefill) => {
    const out = [];
    for (let y = 2; y <= 47; y++) {
      for (let x = 2; x <= 47; x++) {
        const i = idx(x, y);
        const k = `${x},${y}`;
        if (!buildable(terrain, x, y) || ext[i]) continue;
        if (depth[i] < DEPTH_SAFE) continue;
        if (occupied.has(k) || roadSet.has(k) || reserved.has(k)) continue;
        if (!mGuard.ok({ x, y }, standBlocked)) continue;
        if (refill[i] > maxRefill || refill[i] >= 9999) continue;
        if (!faceOf(x, y, D8)) continue;
        out.push({ x, y, i, ref: refill[i], d4: faceOf(x, y, D4), spur: Math.max(0, roadDist[i] - 1) });
      }
    }
    return out;
  };
  let cands = gather(MAX_REFILL);
  for (const relax of RELAX_REFILL) {
    if (cands.length >= 12) break;
    cands = gather(relax);
  }
  const unthinned = cands.length;
  if (cands.length > MAX_CANDS) cands = spatialPrune(cands);
  return { unthinned, searched: cands.length };
}

function remainingFreeDeepFaced(terrain, p) {
  const cut = p.meta?.shell?.cut || [];
  const cutSet = new Set(cut.map(K));
  const ext = exteriorFlood(terrain, cutSet);
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
  const occ = new Set();
  for (const [kind, list] of Object.entries(p.structures || {})) {
    if (kind === "road" || kind === "rampart") continue;
    for (const t of list || []) if (t && Number.isInteger(t.x)) occ.add(K(t));
  }
  const roads = new Set((p.structures?.road || []).map(K));
  const reserved = reservedOf(p);
  let n = 0;
  for (let y = 1; y <= 48; y++) {
    for (let x = 1; x <= 48; x++) {
      const k = `${x},${y}`;
      if (occ.has(k) || reserved.has(k)) continue;
      if (!walkable(terrain, x, y) || ext[idx(x, y)]) continue;
      if (depth[idx(x, y)] < DEPTH_SAFE) continue;
      if (!buildable(terrain, x, y)) continue;
      const faced = D4.some(([dx, dy]) => roads.has(`${x + dx},${y + dy}`));
      if (faced) n++;
    }
  }
  return n;
}

function T(name, rows) {
  let have = 0;
  let match = 0;
  const miss = [];
  for (const r of rows) {
    if (!r) continue;
    have++;
    if (r.ok) match++;
    else if (miss.length < 6) miss.push(r.miss);
  }
  return { name, have, match, missN: have - match, miss };
}

const seatModes = ["pre3", "pre5", "all"];
const seatScores = {};
for (const mode of seatModes) {
  const rows = plans.map((p) => {
    const d = byRoom.get(p.room);
    if (!d || !p.sitter) return null;
    const got = p.meta?.towers?.towerSwapOffer?.searchedSeats;
    const seats = p.meta?.towers?.towerSwapOffer?.seats;
    if (typeof got !== "number") return null;
    const w = wantSearchedSeats(d.terrain, p, mode);
    return {
      ok: w.searched === got,
      miss: { room: p.room, got, want: w.searched, unthinned: w.unthinned, seats },
    };
  });
  seatScores[mode] = T(`searchedSeats-${mode}`, rows);
  const unthin = plans.map((p) => {
    const d = byRoom.get(p.room);
    if (!d || !p.sitter) return null;
    const seats = p.meta?.towers?.towerSwapOffer?.seats;
    if (typeof seats !== "number") return null;
    const w = wantSearchedSeats(d.terrain, p, mode);
    return { ok: w.unthinned === seats, miss: { room: p.room, got: seats, want: w.unthinned } };
  });
  seatScores[`${mode}-unthinned`] = T(`seats-${mode}`, unthin);
}

const freeRows = plans.map((p) => {
  const d = byRoom.get(p.room);
  if (!d) return null;
  const got = p.meta?.extensions?.reflow?.freeLeft;
  if (typeof got !== "number") return null;
  const want = remainingFreeDeepFaced(d.terrain, p);
  return { ok: want === got, miss: { room: p.room, got, want } };
});
const freeScore = T("freeLeft-remainingFaced", freeRows);

const stubRows = plans.map((p) => {
  const got = p.meta?.extensions?.stubExhausted;
  if (typeof got !== "boolean") return null;
  const roads = p.meta?.extensions?.stubRoads;
  const cap = p.meta?.extensions?.stubCap;
  if (typeof roads !== "number" || typeof cap !== "number") return { ok: false, miss: { room: p.room, got, roads, cap } };
  return { ok: got === (roads >= cap), miss: { room: p.room, got, roads, cap, want: roads >= cap } };
});
const stubScore = T("stubExhausted-stubRoads-ge-cap", stubRows);

const stubTagRows = plans.map((p) => {
  const got = p.meta?.extensions?.stubExhausted;
  if (typeof got !== "boolean") return null;
  let n = 0;
  for (const v of Object.values(p.meta?.roadLayer || {})) if (v === 6) n++;
  const cap = p.meta?.extensions?.stubCap;
  return { ok: got === (n >= cap), miss: { room: p.room, got, n, cap } };
});
const stubTagScore = T("stubExhausted-layer6-ge-cap", stubTagRows);

const wcRows = plans.map((p) => {
  const v = p.meta?.extensions?.laneMeta?.worstCase;
  if (v == null) return null;
  const b = p.meta?.extensions?.laneMeta?.bounded;
  return { ok: typeof v === "number" && typeof b === "number" && Math.abs(v - b) < 1e-9, miss: { room: p.room, v, b } };
});
const wcScore = T("worstCase-eq-bounded", wcRows);

const dbSample = [];
const dbHist = {};
for (const p of plans) {
  const v = p.meta?.extensions?.laneMeta?.deepBudget;
  if (typeof v !== "number") continue;
  dbHist[v] = (dbHist[v] || 0) + 1;
  if (dbSample.length < 8) {
    const lm = p.meta.extensions.laneMeta;
    dbSample.push({
      room: p.room,
      deepBudget: v,
      deep: lm.deep,
      tiles: lm.tiles,
      reserved: (lm.reserved || []).length,
      wanted: lm.wanted,
      rounds: lm.rounds,
      strandedFirst: lm.strandedFirst,
    });
  }
}

const ipRows = [];
for (const p of plans) {
  const v = p.meta?.shell?.inertPromoted;
  if (typeof v !== "number") continue;
  const drift = p.meta?.shell?.cutDrift || [];
  const removes = drift.filter((r) => r && r.op === "remove");
  const adds = drift.filter((r) => r && r.op === "add");
  const cutNow = new Set((p.meta?.shell?.cut || []).map(K));
  const freeze = new Set(freezeCut(p).map(K));
  const remNotOnCut = removes.filter((r) => r.tiles
    ? r.tiles.filter((t) => t && !cutNow.has(K(t))).length
    : (Number.isInteger(r.x) && !cutNow.has(K(r)))).length;
  ipRows.push({
    room: p.room,
    v,
    removes: removes.length,
    adds: adds.length,
    adopted: (p.meta?.shell?.cutAdopted || []).length,
    remNotOnCut,
    freezeN: freeze.size,
    cutN: cutNow.size,
  });
}

const unsealedRows = plans.map((p) => {
  const v = p.meta?.extensions?.laneMeta?.unsealed;
  if (typeof v !== "number") return null;
  const lm = p.meta.extensions.laneMeta;
  const want = (lm.strandedFirst ?? 0) - (lm.stranded ?? 0);
  return { ok: v === want, miss: { room: p.room, v, want, sf: lm.strandedFirst, st: lm.stranded } };
});
const unsealedScore = T("unsealed-sf-minus-st", unsealedRows);

const rescueRows = plans.map((p) => {
  const v = p.meta?.extensions?.rescueSpent;
  return { ok: v === 0, miss: { room: p.room, v } };
});
const rescueScore = T("rescueSpent-eq-0", rescueRows);

console.log(JSON.stringify({
  n: plans.length,
  seatScores,
  freeScore,
  stubScore,
  stubTagScore,
  wcScore,
  unsealedScore,
  rescueScore,
  dbHist,
  dbSample,
  ipSample: ipRows.slice(0, 12),
  ipN: ipRows.length,
  ipVsRemoves: ipRows.filter((r) => r.v === r.removes).length,
  ipVsAdds: ipRows.filter((r) => r.v === r.adds).length,
  ipVsAdopted: ipRows.filter((r) => r.v === r.adopted).length,
  ipIffAdopt: ipRows.filter((r) => (r.v > 0) === (r.adopted > 0)).length,
  ipIffRemoves: ipRows.filter((r) => (r.v > 0) === (r.removes > 0)).length,
}, null, 2));
