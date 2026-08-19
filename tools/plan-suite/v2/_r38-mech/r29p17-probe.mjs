/**
 * r29p17 measure: stubCap 43 vs 51, hubDistCap exact, leftover board/composeOpts.
 * Throwaway. Never writes the artifact.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fieldFrom } from "../layer-hub.mjs";
import {
  interiorWalk,
  maskFromKeys,
  mobilityStats,
  RADII_WIDE,
} from "../layer-shell.mjs";
import {
  buildable,
  exteriorFlood,
  mineralGuard,
  reservedTiles,
  walkable,
} from "../shared.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.resolve(DIR, "../../out-v2/plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);
const rooms = JSON.parse(fs.readFileSync(process.env.ROOMS_FILE || path.resolve(DIR, "../_r28-mech/rooms.json"), "utf8"));
const byRoom = new Map(rooms.map((r) => [r.room, r]));

const K = (t) => `${t.x},${t.y}`;
const idx = (x, y) => x + y * 50;
const TARGET = 60;
const RICH = 1.5;
const HUB_CAP_LADDER = [16, 19, 23, 999];
const L6 = ["storage", "terminal", "link", "spawn", "container", "tower", "lab", "nuker", "observer"];
const D8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function T(name) {
  return { name, n: 0, ok: 0, bad: 0, samples: [] };
}
function hit(t, ok, sample) {
  t.n++;
  if (ok) t.ok++;
  else {
    t.bad++;
    if (t.samples.length < 8) t.samples.push(sample);
  }
}
function depthFrom(ext) {
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
  return depth;
}

function firstRung(pred) {
  for (const c of HUB_CAP_LADDER) if (pred(c)) return c;
  return null;
}

const scores = {
  stubParkMeta: T("stubCap 51 iff pool(+meta parks reserved)/60>=1.5"),
  stubParkOnly: T("stubCap 51 iff pool(ctrlParkReserve)/60>=1.5"),
  stubAllRoads: T("stubCap 51 iff pool(all shipped roads blocked)/60>=1.5"),
  stubNoPave: T("stubCap 51 iff pool(no paved exclude)/60>=1.5"),
  stubCutBlocked: T("stubCap 51 iff pool(cut tiles blocked)/60>=1.5"),
  stubFreezeCap16: T("stubCap 51 iff pool(cap16 deepReach)/60>=1.5"),
  floorUngFreeze: T("floorUngated === freeze mass-free max (L6 occ, no ext)"),
  floorUngShip: T("floorUngated === shipped-cut mass-free max"),
  served0: T("servedExts === 0"),
  unreach0: T("unreachableExts === 0"),
  unreachedCl0: T("unreachedClusters === 0"),
  rescue0: T("rescueSpent === 0"),
  rescueIff: T("rescueSpent===0 always (identity)"),
  radiiNeed: T("composeOpts.radii matches needDeepBonus ladder"),
  radiiAbsentOrKnown: T("radii absent or in {WIDE, 10-14}"),
  parkCapPresent: T("parkCap present => winningCap or held-walk"),
  takeSwapFromTo: T("takeTowerSwap from/to are shipped towers / empty"),
  d4all: T("every ext has D4 road"),
  unreachedVsSpur: T("unreachedClusters === 0 iff servedFree+spurred covers"),
  maxHubL6: T("maxHubDist === L6 field max of shipped exts"),
  maxHubL5: T("maxHubDist === layer5 field max of shipped exts"),
  stubExhMeta: T("stubExhausted === (stubRoads - laneTiles) >= stubCap"),
  digRl6: T("digRoads === count of layer-6 wall roads"),
  deepExhShallow: T("deepExhausted === shipped shallow>0"),
  deepExhNote: T("deepExhausted === extensions.shallow>0"),
  freeLeftShallow: T("freeLeft === something"),
};

const e5 = [];
const poor = [];
const radiiRows = [];
const parkRows = [];
const swapRows = [];
const leftoverZero = {};

for (const p of plans) {
  const d = byRoom.get(p.room);
  if (!d || !p.sitter) continue;
  const terrain = d.terrain;
  const e = p.meta?.extensions || {};
  const co = p.meta?.composeOpts || {};
  const freeze = p.meta?.shell?.cutAtFreeze?.length ? p.meta.shell.cutAtFreeze : p.meta?.shell?.cut || [];
  const freezeSet = new Set(freeze.map(K));
  const extF = exteriorFlood(terrain, freezeSet);
  const depthF = depthFrom(extF);
  const occ = new Set();
  for (const t of L6) for (const q of p.structures?.[t] || []) occ.add(K(q));
  for (const src of p.sources || []) occ.add(K(src));
  if (p.controller) occ.add(K(p.controller));
  if (p.mineral) occ.add(K(p.mineral));
  if (p.sitter) occ.add(K(p.sitter));
  const hf = fieldFrom(terrain, p.sitter, occ);
  const reserved = reservedTiles(p);
  const parks = new Set();
  for (const s of p.meta?.ctrlParkReserve || p.parkReserve || []) if (s && Number.isInteger(s.x)) parks.add(K(s));
  const claim = new Set();
  if (p.claimSeat) claim.add(K(p.claimSeat));
  if (p.claimApproach) claim.add(K(p.claimApproach));
  if (p.meta?.claimSeat) claim.add(K(p.meta.claimSeat));
  if (p.meta?.claimApproach) claim.add(K(p.meta.claimApproach));
  const paved = new Set();
  for (const [k, v] of Object.entries(p.meta?.roadLayer || {})) {
    if (typeof v === "number" && v < 6) paved.add(k);
  }
  const allRoads = new Set((p.structures?.road || []).map(K));
  const cutSet = new Set((p.meta?.shell?.cut || []).map(K));
  const forbid = new Set();
  for (const s of Array.isArray(co.forbidExtSeat) ? co.forbidExtSeat : []) {
    if (s && Number.isInteger(s.x)) forbid.add(K(s));
  }
  const mGuard = mineralGuard(terrain, p);
  const blockedNow = new Set(occ);

  const pool = (extraBlock, cap) => {
    const deepReach = Math.min((cap ?? 16) + 2, 18);
    let n = 0;
    for (let x = 2; x <= 47; x++) {
      for (let y = 2; y <= 47; y++) {
        const i = idx(x, y);
        if (depthF[i] < 4) continue;
        if (extF[i]) continue;
        if (!buildable(terrain, x, y)) continue;
        const k = `${x},${y}`;
        if (occ.has(k) || extraBlock.has(k) || forbid.has(k)) continue;
        if (hf[i] >= 9999) continue;
        if (hf[i] > deepReach) continue;
        if (!mGuard.ok({ x, y }, blockedNow)) continue;
        n++;
      }
    }
    return n;
  };

  const blockPark = new Set([...reserved, ...parks, ...claim, ...paved]);
  const blockParkOnly = new Set([...parks, ...claim, ...paved, ...reserved]);
  const blockAllRoads = new Set([...reserved, ...parks, ...claim, ...allRoads]);
  const blockNoPave = new Set([...reserved, ...parks, ...claim]);
  const blockCut = new Set([...reserved, ...parks, ...claim, ...paved, ...cutSet, ...freezeSet]);

  const is51 = e.stubCap === 51;
  const pPark = pool(blockPark, e.hubDistCap);
  const pParkOnly = pool(blockParkOnly, e.hubDistCap);
  const pAllR = pool(blockAllRoads, e.hubDistCap);
  const pNoPave = pool(blockNoPave, e.hubDistCap);
  const pCut = pool(blockCut, e.hubDistCap);
  const p16 = pool(blockPark, 16);

  hit(scores.stubParkMeta, is51 === pPark / TARGET >= RICH, { room: p.room, stub: e.stubCap, pPark, r: +(pPark / 60).toFixed(3) });
  hit(scores.stubParkOnly, is51 === pParkOnly / TARGET >= RICH, { room: p.room, stub: e.stubCap, pParkOnly });
  hit(scores.stubAllRoads, is51 === pAllR / TARGET >= RICH, { room: p.room, stub: e.stubCap, pAllR });
  hit(scores.stubNoPave, is51 === pNoPave / TARGET >= RICH, { room: p.room, stub: e.stubCap, pNoPave });
  hit(scores.stubCutBlocked, is51 === pCut / TARGET >= RICH, { room: p.room, stub: e.stubCap, pCut });
  hit(scores.stubFreezeCap16, is51 === p16 / TARGET >= RICH, { room: p.room, stub: e.stubCap, p16 });

  if (e.stubCap === 43) {
    poor.push({
      room: p.room,
      stub: e.stubCap,
      cap: e.hubDistCap,
      pPark,
      pParkOnly,
      pAllR,
      pNoPave,
      pCut,
      p16,
      reserved: reserved.size,
      parks: parks.size,
      claim: claim.size,
      paved: paved.size,
      parkReserveOnPlan: Array.isArray(p.parkReserve) ? p.parkReserve.length : null,
      claimSeat: !!(p.claimSeat || p.meta?.claimSeat),
      hasDepth: Array.isArray(p.depth) || (p.depth && typeof p.depth.length === "number"),
      hasExterior: !!p.exterior,
      compose: { parkCap: co.parkCap, radii: co.radii, need: co.needDeepBonus, seedSkip: co.seedSkip },
    });
  }

  if (p.room === "E5S6") {
    e5.push({
      stub: e.stubCap,
      cap: e.hubDistCap,
      pPark,
      pParkOnly,
      pAllR,
      pNoPave,
      pCut,
      p16,
      reserved: [...reserved].slice(0, 20),
      parks: [...parks],
      claim: [...claim],
      reservedN: reserved.size,
      parksN: parks.size,
      pavedN: paved.size,
      keys: {
        parkReserve: !!p.parkReserve,
        claimSeat: !!p.claimSeat,
        claimApproach: !!p.claimApproach,
        depth: p.depth ? (p.depth.length ?? typeof p.depth) : null,
        exterior: p.exterior ? (p.exterior.length ?? typeof p.exterior) : null,
        objectTiles: Array.isArray(p.objectTiles) ? p.objectTiles.length : null,
        ctrlParkReserve: (p.meta?.ctrlParkReserve || []).length,
        ctrlParkFloor: p.meta?.ctrlParkFloor,
        ctrlParks: p.meta?.ctrlParks,
      },
    });
  }

  // floorUngated: L6 mass-free on freeze cut
  const walkBlocked = new Set(occ);
  for (const c of p.structures?.container || []) walkBlocked.delete(K(c));
  const walk = interiorWalk(terrain, freezeSet, extF, walkBlocked, p.sitter);
  const mfw = freeze.length ? mobilityStats(freeze, extF, maskFromKeys(walk)) : { max: 0, maxGated: 0 };
  const fu = e.laneMeta?.floorUngated;
  const fu2 = p.meta?.walls?.mobility?.lanes?.floorUngated;
  const round2 = (x) => Math.round(x * 100) / 100;
  if (typeof fu === "number") {
    hit(scores.floorUngFreeze, Math.abs(fu - round2(mfw.max)) < 1e-9, {
      room: p.room,
      fu,
      want: round2(mfw.max),
      raw: mfw.max,
    });
  }
  const shipCut = p.meta?.shell?.cut || [];
  const shipSet = new Set(shipCut.map(K));
  const extS = exteriorFlood(terrain, shipSet);
  const walkS = interiorWalk(terrain, shipSet, extS, walkBlocked, p.sitter);
  const mfs = shipCut.length ? mobilityStats(shipCut, extS, maskFromKeys(walkS)) : { max: 0 };
  if (typeof fu === "number") {
    hit(scores.floorUngShip, Math.abs(fu - round2(mfs.max)) < 1e-9, { room: p.room, fu, want: round2(mfs.max) });
  }

  hit(scores.served0, (p.meta?.walls?.servedExts || 0) === 0, { room: p.room, v: p.meta?.walls?.servedExts });
  hit(scores.unreach0, (p.meta?.walls?.unreachableExts || 0) === 0, { room: p.room, v: p.meta?.walls?.unreachableExts });
  hit(scores.unreachedCl0, (p.meta?.walls?.unreachedClusters || 0) === 0, {
    room: p.room,
    v: p.meta?.walls?.unreachedClusters,
  });
  hit(scores.rescue0, (e.rescueSpent || 0) === 0, { room: p.room, v: e.rescueSpent });
  hit(scores.rescueIff, (e.rescueSpent || 0) === 0, { room: p.room, v: e.rescueSpent });

  const roads = new Set((p.structures?.road || []).map(K));
  let d4miss = 0;
  for (const ex of p.structures?.extension || []) {
    if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => roads.has(`${ex.x + dx},${ex.y + dy}`))) d4miss++;
  }
  hit(scores.d4all, d4miss === 0, { room: p.room, d4miss });

  // radii
  const bonus = co.needDeepBonus;
  const radii = co.radii;
  const wide = JSON.stringify(RADII_WIDE);
  const late = JSON.stringify([10, 11, 12, 13, 14]);
  let radiiWant = null;
  if (bonus === 85) radiiWant = [10, 11, 12, 13, 14];
  else if (bonus === 25 || bonus === 55) radiiWant = RADII_WIDE.slice();
  if (radii) {
    const ok = radiiWant && JSON.stringify(radii) === JSON.stringify(radiiWant);
    hit(scores.radiiNeed, ok, { room: p.room, radii, bonus, radiiWant });
    radiiRows.push({ room: p.room, radii, bonus, protect: p.meta?.shell?.protectRadius });
  } else {
    hit(scores.radiiNeed, bonus == null, { room: p.room, bonus });
  }
  hit(
    scores.radiiAbsentOrKnown,
    !radii || JSON.stringify(radii) === wide || JSON.stringify(radii) === late,
    { room: p.room, radii },
  );

  if (co.parkCap != null) {
    parkRows.push({
      room: p.room,
      parkCap: co.parkCap,
      floor: p.meta?.ctrlParkFloor,
      floorCap: p.meta?.ctrlParkFloorCap,
      parks: p.meta?.ctrlParks,
      winning: (p.meta?.shortfalls || []).find((s) => s && s.kind === "released")?.ctrlParks?.winningCap,
    });
  }
  if (co.takeTowerSwap) swapRows.push({ room: p.room, swap: co.takeTowerSwap, towers: (p.structures?.tower || []).map(K) });

  // maxHub
  const l5occ = new Set();
  for (const t of ["storage", "terminal", "link", "spawn", "tower", "lab"]) {
    for (const q of p.structures?.[t] || []) l5occ.add(K(q));
  }
  const seat = (p.structures?.container || []).find((c) => p.mineral && Math.max(Math.abs(c.x - p.mineral.x), Math.abs(c.y - p.mineral.y)) <= 1);
  for (const c of p.structures?.container || []) {
    if (seat && c.x === seat.x && c.y === seat.y) continue;
    l5occ.add(K(c));
  }
  if (p.sitter) l5occ.add(K(p.sitter));
  for (const src of p.sources || []) l5occ.add(K(src));
  if (p.controller) l5occ.add(K(p.controller));
  if (p.mineral) l5occ.add(K(p.mineral));
  const hf5 = fieldFrom(terrain, p.sitter, l5occ);
  let mx6 = 0;
  let mx5 = 0;
  for (const ex of p.structures?.extension || []) {
    const v6 = hf[idx(ex.x, ex.y)];
    const v5 = hf5[idx(ex.x, ex.y)];
    if (v6 < 9999 && v6 > mx6) mx6 = v6;
    if (v5 < 9999 && v5 > mx5) mx5 = v5;
  }
  hit(scores.maxHubL6, e.maxHubDist === mx6, { room: p.room, got: e.maxHubDist, mx6 });
  hit(scores.maxHubL5, e.maxHubDist === mx5, { room: p.room, got: e.maxHubDist, mx5 });

  const laneTiles = e.laneMeta?.tiles || 0;
  hit(scores.stubExhMeta, !!e.stubExhausted === (e.stubRoads || 0) - laneTiles >= e.stubCap, {
    room: p.room,
    flag: e.stubExhausted,
    used: e.stubRoads,
    lane: laneTiles,
    cap: e.stubCap,
  });

  let rl6wall = 0;
  for (const [k, v] of Object.entries(p.meta?.roadLayer || {})) {
    if (v !== 6) continue;
    const [x, y] = k.split(",").map(Number);
    const code = parseInt(terrain.charAt(y * 50 + x), 10);
    if (code & 1) rl6wall++;
  }
  hit(scores.digRl6, e.digRoads === rl6wall, { room: p.room, dig: e.digRoads, rl6wall });
  hit(scores.deepExhShallow, !!e.deepExhausted === (e.shallow || 0) > 0, {
    room: p.room,
    flag: e.deepExhausted,
    shallow: e.shallow,
  });

  leftoverZero.unreachedClusters = leftoverZero.unreachedClusters || { 0: 0, other: 0 };
  const uc = p.meta?.walls?.unreachedClusters;
  if (uc === 0 || uc == null) leftoverZero.unreachedClusters[0]++;
  else leftoverZero.unreachedClusters.other++;
}

function line(t) {
  const flag = t.bad === 0 && t.ok ? "OK  " : t.n === 0 ? "SKIP" : `NO  ${t.ok}/${t.n}`;
  return `${flag.padEnd(16)} ${t.name}`;
}

console.log("=== E5S6 ===");
console.log(JSON.stringify(e5, null, 2));
console.log("=== poor rooms ===");
console.log(JSON.stringify(poor, null, 2));
console.log("=== radii rows ===");
console.log(JSON.stringify(radiiRows, null, 2));
console.log("=== park rows ===");
console.log(JSON.stringify(parkRows, null, 2));
console.log("=== swap rows ===");
console.log(JSON.stringify(swapRows, null, 2));
console.log("=== leftoverZero ===");
console.log(leftoverZero);
console.log("\n--- scores ---");
for (const t of Object.values(scores)) console.log(line(t), t.samples[0] ? JSON.stringify(t.samples[0]) : "");
