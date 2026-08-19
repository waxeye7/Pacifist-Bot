/**
 * r29p18 leftover-presence measure. Throwaway. Never writes the artifact.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fieldFrom } from "../layer-hub.mjs";
import { D8, D4, buildable, chebyshev, walkable, exteriorFlood } from "../shared.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.resolve(DIR, "../../out-v2/plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);
const rooms = JSON.parse(fs.readFileSync(process.env.ROOMS_FILE || path.resolve(DIR, "../_r28-mech/rooms.json"), "utf8"));
const byRoom = new Map(rooms.map((r) => [r.room, r]));

const K = (t) => `${t.x},${t.y}`;
const idx = (x, y) => x + y * 50;
const HUB_CAP_LADDER = [16, 19, 23, 999];
const L6 = ["storage", "terminal", "link", "spawn", "container", "tower", "lab", "nuker", "observer"];
const MIN_CLUSTER = 2;

function T(name) {
  return { name, n: 0, ok: 0, bad: 0, samples: [] };
}
function hit(t, ok, sample) {
  t.n++;
  if (ok) t.ok++;
  else {
    t.bad++;
    if (t.samples.length < 6) t.samples.push(sample);
  }
}

function l6Occ(p, withSitter) {
  const occ = new Set();
  for (const t of L6) for (const q of p.structures?.[t] || []) occ.add(K(q));
  for (const src of p.sources || []) occ.add(K(src));
  if (p.controller) occ.add(K(p.controller));
  if (p.mineral) occ.add(K(p.mineral));
  if (withSitter && p.sitter) occ.add(K(p.sitter));
  return occ;
}

function objectOcc(p) {
  const occ = new Set();
  for (const t of L6) for (const q of p.structures?.[t] || []) occ.add(K(q));
  for (const k of p.objectTiles || []) occ.add(k);
  return occ;
}

function maxExtField(hf, exts) {
  let mx = 0;
  for (const e of exts) {
    const v = hf[idx(e.x, e.y)];
    if (v < 9999 && v > mx) mx = v;
  }
  return mx;
}

function cutClusters(cut) {
  const cutSet = new Set();
  const tiles = [];
  for (const c of cut || []) {
    if (!c || !Number.isInteger(c.x)) continue;
    cutSet.add(K(c));
    tiles.push(c);
  }
  const seen = new Set();
  const clusters = [];
  for (const c of tiles) {
    const k0 = K(c);
    if (seen.has(k0)) continue;
    seen.add(k0);
    const cl = [c];
    for (let i = 0; i < cl.length; i++) {
      for (const [dx, dy] of D8) {
        const k = `${cl[i].x + dx},${cl[i].y + dy}`;
        if (seen.has(k) || !cutSet.has(k)) continue;
        seen.add(k);
        cl.push({ x: cl[i].x + dx, y: cl[i].y + dy });
      }
    }
    clusters.push(cl);
  }
  return clusters;
}

function hasD8Road(cl, roads) {
  for (const t of cl) {
    for (const [dx, dy] of D8) {
      if (roads.has(`${t.x + dx},${t.y + dy}`)) return true;
    }
  }
  return false;
}

const scores = {
  maxHubL6: T("maxHubDist === L6 field max (no sitter in occ)"),
  maxHubL6sit: T("maxHubDist === L6 field max (sitter in occ)"),
  maxHubObj: T("maxHubDist === objectTiles+L6 field max"),
  maxHubL6ex: T("maxHubDist === L6+ext field max"),
  hubFirstRungMax: T("hubDistCap === first ladder rung >= maxHubDist"),
  hubFirstRungWalk: T("hubDistCap === first ladder rung >= L6-field max"),
  servedNoPreL7: T("servedExts === exts with no D4 roadLayer<7"),
  servedNoPreL7or0: T("servedExts === 0 or equals no-pre-L7"),
  unreachNoD4: T("unreachableExts === exts with no D4 road"),
  unreach0: T("unreachableExts === 0"),
  unreachedNoRoad: T("unreachedClusters === large cut clusters with no D8 road"),
  unreachedNoRoadMin1: T("unreachedClusters === large clusters no D8 road (min 1)"),
  stubExhRoads: T("stubExhausted === stubRoads >= stubCap"),
  stubExhUsed: T("stubExhausted === stubRoads - laneTiles >= stubCap"),
  digWallL6: T("digRoads === layer-6 wall roads"),
  digAllWall: T("digRoads === all wall roads"),
  digL6notRoad: T("digRoads === layer-6 roads not on pre-existing?"),
  deepExhShallow: T("deepExhausted === shallow>0"),
  deepExhFallback: T("deepExhausted === corridorFallback>0"),
  rescue0: T("rescueSpent === 0"),
  served0: T("servedExts === 0"),
  unreached0: T("unreachedClusters === 0"),
  takeFromEmptyTower: T("take.from has no shipped tower"),
  takeFromEmptyAll: T("take.from has no blocking structure"),
  takeFromOffer: T("take.from matches offer.best.from or satAcrossPrior.leaves"),
  takeToExact: T("take.to is a shipped tower (already)"),
  takeFromBuildable: T("take.from is buildable interior"),
  takeFromNearTo: T("take.from cheb to to <= 8"),
  takeFromNearAnyTower: T("take.from cheb to some tower <= 5"),
  takeFromHasRampart: T("take.from has a rampart"),
  takeFromHasRoad: T("take.from has a road"),
  inertPromLen: T("inertPromoted length === cutDrift adds?"),
  shallowRampOnShallow: T("shallowRamparts === ramparts on shallow exts"),
};

const leftoverHist = {};
const swapRows = [];
const hubRows = [];
const maxHubMismatch = [];

for (const p of plans) {
  const d = byRoom.get(p.room);
  if (!d || !p.sitter) continue;
  const terrain = d.terrain;
  const e = p.meta?.extensions || {};
  const w = p.meta?.walls || {};
  const exts = p.structures?.extension || [];
  const roads = new Set((p.structures?.road || []).map(K));
  const roadLayer = p.meta?.roadLayer || {};
  const cut = p.meta?.shell?.cut || [];

  const occ = l6Occ(p, false);
  const occS = l6Occ(p, true);
  const occO = objectOcc(p);
  const hf = fieldFrom(terrain, p.sitter, occ);
  const hfS = fieldFrom(terrain, p.sitter, occS);
  const hfO = fieldFrom(terrain, p.sitter, occO);
  const occX = new Set(occ);
  for (const ex of exts) occX.add(K(ex));
  const hfX = fieldFrom(terrain, p.sitter, occX);

  const mx = maxExtField(hf, exts);
  const mxS = maxExtField(hfS, exts);
  const mxO = maxExtField(hfO, exts);
  const mxX = maxExtField(hfX, exts);

  if (typeof e.maxHubDist === "number") {
    hit(scores.maxHubL6, e.maxHubDist === mx, { room: p.room, got: e.maxHubDist, mx });
    hit(scores.maxHubL6sit, e.maxHubDist === mxS, { room: p.room, got: e.maxHubDist, mxS });
    hit(scores.maxHubObj, e.maxHubDist === mxO, { room: p.room, got: e.maxHubDist, mxO });
    hit(scores.maxHubL6ex, e.maxHubDist === mxX, { room: p.room, got: e.maxHubDist, mxX });
    if (e.maxHubDist !== mx && maxHubMismatch.length < 8) {
      maxHubMismatch.push({ room: p.room, got: e.maxHubDist, mx, mxS, mxO, mxX });
    }
  }

  if (typeof e.hubDistCap === "number" && typeof e.maxHubDist === "number") {
    const want = HUB_CAP_LADDER.find((c) => c >= e.maxHubDist);
    hit(scores.hubFirstRungMax, e.hubDistCap === want, {
      room: p.room,
      cap: e.hubDistCap,
      maxHub: e.maxHubDist,
      want,
    });
    const wantW = HUB_CAP_LADDER.find((c) => c >= mx);
    hit(scores.hubFirstRungWalk, e.hubDistCap === wantW, {
      room: p.room,
      cap: e.hubDistCap,
      mx,
      wantW,
    });
    if (e.hubDistCap !== 16 || e.maxHubDist > 16) {
      hubRows.push({ room: p.room, cap: e.hubDistCap, maxHub: e.maxHubDist, mx, want });
    }
  }

  const preL7 = (k) => typeof roadLayer[k] === "number" && roadLayer[k] < 7;
  let noPre = 0;
  let noD4 = 0;
  for (const ex of exts) {
    const faces = D4.map(([dx, dy]) => `${ex.x + dx},${ex.y + dy}`);
    if (!faces.some((k) => roads.has(k))) noD4++;
    if (!faces.some((k) => roads.has(k) && preL7(k))) noPre++;
  }
  hit(scores.servedNoPreL7, (w.servedExts || 0) === noPre, { room: p.room, got: w.servedExts, noPre });
  hit(scores.unreachNoD4, (w.unreachableExts || 0) === noD4, { room: p.room, got: w.unreachableExts, noD4 });
  hit(scores.unreach0, (w.unreachableExts || 0) === 0, { room: p.room, v: w.unreachableExts });
  hit(scores.served0, (w.servedExts || 0) === 0, { room: p.room, v: w.servedExts });

  const clusters = cutClusters(cut);
  let unreached = 0;
  let unreachedMin1 = 0;
  for (const cl of clusters) {
    if (cl.length < MIN_CLUSTER) continue;
    if (!hasD8Road(cl, roads)) {
      unreached++;
      if (cl.length >= 1) unreachedMin1++;
    }
  }
  hit(scores.unreachedNoRoad, (w.unreachedClusters || 0) === unreached, {
    room: p.room,
    got: w.unreachedClusters,
    unreached,
    clusters: clusters.length,
  });
  hit(scores.unreached0, (w.unreachedClusters || 0) === 0, { room: p.room, v: w.unreachedClusters });

  const stubUsed = e.stubRoads || 0;
  const laneTiles = e.laneMeta?.tiles || 0;
  hit(scores.stubExhRoads, !!e.stubExhausted === stubUsed >= (e.stubCap || 0), {
    room: p.room,
    flag: e.stubExhausted,
    stubUsed,
    cap: e.stubCap,
  });
  hit(scores.stubExhUsed, !!e.stubExhausted === stubUsed - laneTiles >= (e.stubCap || 0), {
    room: p.room,
    flag: e.stubExhausted,
    used: stubUsed - laneTiles,
    cap: e.stubCap,
  });

  let rl6wall = 0;
  let allWall = 0;
  for (const [k, v] of Object.entries(roadLayer)) {
    const [x, y] = k.split(",").map(Number);
    const code = parseInt(terrain.charAt(y * 50 + x), 10);
    const wall = !!(code & 1);
    if (wall) allWall++;
    if (v === 6 && wall) rl6wall++;
  }
  hit(scores.digWallL6, e.digRoads === rl6wall, { room: p.room, dig: e.digRoads, rl6wall });
  hit(scores.digAllWall, e.digRoads === allWall, { room: p.room, dig: e.digRoads, allWall });
  hit(scores.deepExhShallow, !!e.deepExhausted === (e.shallow || 0) > 0, {
    room: p.room,
    flag: e.deepExhausted,
    shallow: e.shallow,
  });
  hit(scores.deepExhFallback, !!e.deepExhausted === (e.corridorFallback || 0) > 0, {
    room: p.room,
    flag: e.deepExhausted,
    fb: e.corridorFallback,
  });
  hit(scores.rescue0, (e.rescueSpent || 0) === 0, { room: p.room, v: e.rescueSpent });

  const sw = p.meta?.composeOpts?.takeTowerSwap;
  if (sw && Number.isInteger(sw.from?.x)) {
    const towers = p.structures?.tower || [];
    const tset = new Set(towers.map(K));
    const blocking = new Set();
    for (const t of L6) for (const q of p.structures?.[t] || []) blocking.add(K(q));
    for (const q of exts) blocking.add(K(q));
    const offer = p.meta?.towers?.towerSwapOffer;
    const ap = p.meta?.towers?.adjacency?.satAcrossPrior;
    const fromK = K(sw.from);
    const matchOffer =
      (offer?.best?.from && K(offer.best.from) === fromK) ||
      (ap?.leaves && K(ap.leaves) === fromK);
    const nearTo = sw.to ? chebyshev(sw.from, sw.to) : 99;
    const nearT = Math.min(...towers.map((t) => chebyshev(sw.from, t)));
    const ramps = new Set((p.structures?.rampart || []).map(K));
    hit(scores.takeFromEmptyTower, !tset.has(fromK), { room: p.room, from: fromK });
    hit(scores.takeFromEmptyAll, !blocking.has(fromK), { room: p.room, from: fromK });
    hit(scores.takeFromOffer, matchOffer, {
      room: p.room,
      from: fromK,
      offerFrom: offer?.best?.from,
      leaves: ap?.leaves,
      why: offer?.best,
    });
    hit(scores.takeFromBuildable, buildable(terrain, sw.from.x, sw.from.y), { room: p.room, from: fromK });
    hit(scores.takeFromNearTo, nearTo <= 8, { room: p.room, from: fromK, nearTo });
    hit(scores.takeFromNearAnyTower, nearT <= 5, { room: p.room, from: fromK, nearT });
    hit(scores.takeFromHasRampart, ramps.has(fromK), { room: p.room, from: fromK });
    hit(scores.takeFromHasRoad, roads.has(fromK), { room: p.room, from: fromK });
    swapRows.push({
      room: p.room,
      from: sw.from,
      to: sw.to,
      towers: towers.map(K),
      offerFrom: offer?.best?.from,
      offerTo: offer?.best?.to,
      leaves: ap?.leaves,
      seat: ap?.seat,
      nearTo,
      nearT,
      emptyAll: !blocking.has(fromK),
      ramp: ramps.has(fromK),
      road: roads.has(fromK),
    });
  }

  leftoverHist.maxHubDist = leftoverHist.maxHubDist || {};
  leftoverHist.maxHubDist[e.maxHubDist] = (leftoverHist.maxHubDist[e.maxHubDist] || 0) + 1;
  leftoverHist.hubDistCap = leftoverHist.hubDistCap || {};
  leftoverHist.hubDistCap[e.hubDistCap] = (leftoverHist.hubDistCap[e.hubDistCap] || 0) + 1;
  leftoverHist.servedExts = leftoverHist.servedExts || {};
  leftoverHist.servedExts[w.servedExts ?? "abs"] = (leftoverHist.servedExts[w.servedExts ?? "abs"] || 0) + 1;
  leftoverHist.unreached = leftoverHist.unreached || {};
  leftoverHist.unreached[w.unreachedClusters ?? "abs"] = (leftoverHist.unreached[w.unreachedClusters ?? "abs"] || 0) + 1;
  leftoverHist.stubExh = leftoverHist.stubExh || { t: 0, f: 0, abs: 0 };
  if (e.stubExhausted === true) leftoverHist.stubExh.t++;
  else if (e.stubExhausted === false) leftoverHist.stubExh.f++;
  else leftoverHist.stubExh.abs++;
  leftoverHist.dig = leftoverHist.dig || {};
  leftoverHist.dig[e.digRoads ?? "abs"] = (leftoverHist.dig[e.digRoads ?? "abs"] || 0) + 1;
  leftoverHist.deepExh = leftoverHist.deepExh || { t: 0, f: 0, abs: 0 };
  if (e.deepExhausted === true) leftoverHist.deepExh.t++;
  else if (e.deepExhausted === false) leftoverHist.deepExh.f++;
  else leftoverHist.deepExh.abs++;
  leftoverHist.rescue = leftoverHist.rescue || {};
  leftoverHist.rescue[e.rescueSpent ?? "abs"] = (leftoverHist.rescue[e.rescueSpent ?? "abs"] || 0) + 1;
}

function line(t) {
  const flag = t.bad === 0 && t.ok ? "OK  " : t.n === 0 ? "SKIP" : `NO  ${t.ok}/${t.n}`;
  return `${String(flag).padEnd(18)} ${t.name}`;
}

console.log("plans", plans.length, "rooms", rooms.length);
console.log("=== leftover hist ===");
console.log(JSON.stringify(leftoverHist, null, 2));
console.log("=== hub non-16 or maxHub>16 ===");
console.log(JSON.stringify(hubRows, null, 2));
console.log("=== swap rows ===");
console.log(JSON.stringify(swapRows, null, 2));
console.log("=== maxHub mismatch ===");
console.log(JSON.stringify(maxHubMismatch, null, 2));
console.log("\n--- scores ---");
for (const t of Object.values(scores)) {
  console.log(line(t), t.samples[0] ? JSON.stringify(t.samples[0]) : "");
}
