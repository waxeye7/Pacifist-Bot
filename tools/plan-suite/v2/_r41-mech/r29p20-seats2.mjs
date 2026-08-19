/**
 * r29p20 searchedSeats reserved-set variants. Throwaway.
 */
import { loadPlans, loadRooms, K, D8, D4, idx } from "./common.mjs";
import { walkable, buildable, exteriorFlood, mineralGuard } from "../shared.mjs";
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

function parksOf(p, mode) {
  if (mode === "meta8") return p.meta?.ctrlParkReserve || [];
  if (mode === "winning") return p.meta?.ctrlParks?.held || p.meta?.ctrlParks?.tiles || [];
  if (mode === "floor") {
    const all = p.meta?.ctrlParkReserve || [];
    const cap = p.meta?.ctrlParkFloorCap;
    return typeof cap === "number" ? all.slice(0, cap) : all;
  }
  if (mode === "none") return [];
  return p.meta?.ctrlParkReserve || [];
}

function reservedOf(p, parkMode) {
  const s = new Set();
  const seat = p.claimSeat || p.meta?.claimSeat;
  const appr = p.claimApproach || p.meta?.claimApproach;
  if (seat && Number.isInteger(seat.x)) s.add(K(seat));
  if (appr && Number.isInteger(appr.x)) s.add(K(appr));
  for (const q of parksOf(p, parkMode)) {
    if (q && Number.isInteger(q.x)) s.add(K(q));
    else if (typeof q === "string") s.add(q);
  }
  return s;
}

function countSeats(terrain, p, parkMode, guard, roadLt = 3) {
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
    for (const t2 of p.structures?.[t] || []) occupied.add(K(t2));
  }
  if (p.sitter) occupied.add(K(p.sitter));
  for (const k of objectTiles(p)) occupied.add(k);
  const reserved = reservedOf(p, parkMode);
  const roadSet = roadsBefore(p, roadLt);
  const blockers = new Set();
  for (const t of ["storage", "terminal", "link", "spawn"]) {
    for (const t2 of p.structures?.[t] || []) blockers.add(K(t2));
  }
  for (const k of objectTiles(p)) blockers.add(k);
  const refill = fieldFrom(terrain, p.sitter, blockers);
  const roadDist = roadField(terrain, roadSet, blockers);
  const mGuard = guard ? mineralGuard(terrain, p) : { ok: () => true };
  const standBlocked = new Set(objectTiles(p));
  for (const ty of ["storage", "terminal", "link", "spawn"]) {
    for (const t2 of p.structures?.[ty] || []) standBlocked.add(K(t2));
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
  return { unthinned, searched: cands.length, reservedN: reserved.size };
}

const variants = [];
for (const park of ["meta8", "winning", "floor", "none"]) {
  for (const guard of [true, false]) {
    variants.push({ park, guard });
  }
}

const out = {};
for (const v of variants) {
  let matchS = 0;
  let matchU = 0;
  let have = 0;
  const miss = [];
  for (const p of plans) {
    const d = byRoom.get(p.room);
    if (!d || !p.sitter) continue;
    const gotS = p.meta?.towers?.towerSwapOffer?.searchedSeats;
    const gotU = p.meta?.towers?.towerSwapOffer?.seats;
    if (typeof gotS !== "number") continue;
    have++;
    const w = countSeats(d.terrain, p, v.park, v.guard);
    if (w.searched === gotS) matchS++;
    if (w.unthinned === gotU) matchU++;
    else if (miss.length < 3) miss.push({ room: p.room, gotS, gotU, wantS: w.searched, wantU: w.unthinned, reservedN: w.reservedN });
  }
  out[`${v.park}-g${v.guard}`] = { have, matchS, matchU, missN: have - matchS, miss };
}

const parkKeys = {};
for (const p of plans.slice(0, 4)) {
  const cp = p.meta?.ctrlParks;
  parkKeys[p.room] = {
    ctrlParkReserve: (p.meta?.ctrlParkReserve || []).length,
    floor: p.meta?.ctrlParkFloorCap,
    parksKeys: cp ? Object.keys(cp) : [],
    parks: cp,
  };
}

console.log(JSON.stringify({ out, parkKeys }, null, 2));
