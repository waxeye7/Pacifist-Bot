/**
 * r29p16 measure-first: hubDistCap, stubCap, leftover presence.
 * Throwaway. Never writes the artifact.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fieldFrom } from "../layer-hub.mjs";
import {
  arriveAt,
  bfsField,
  BUILT_OBSTACLES,
  interiorWalk,
  maskFromKeys,
  mobilityStats,
  MOBILITY_TARGET,
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
const HUB_CAP_LADDER = [16, 19, 23, 999];
const FLANK_RELAX = 2;
const FLANK_HARD = 18;
const TARGET = 60;
const RICH = 1.5;
const L1_TYPES = ["storage", "terminal", "link", "spawn", "container", "tower", "lab", "nuker", "observer"];

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
function depthFrom(ext) {
  const depth = new Int16Array(2500).fill(999);
  const q = [];
  for (let i = 0; i < 2500; i++) {
    if (ext[i]) {
      depth[i] = 0;
      q.push(i);
    }
  }
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

function objectTilesOf(p) {
  const s = new Set();
  for (const src of p.sources || []) s.add(K(src));
  if (p.controller) s.add(K(p.controller));
  if (p.mineral) s.add(K(p.mineral));
  if (p.objectTiles) {
    for (const k of p.objectTiles) s.add(typeof k === "string" ? k : K(k));
  }
  return s;
}

function l6Occupied(p) {
  const occ = new Set(objectTilesOf(p));
  for (const t of L1_TYPES) {
    for (const q of p.structures?.[t] || []) occ.add(K(q));
  }
  return occ;
}

function preL6Paved(p) {
  const s = new Set();
  for (const [k, v] of Object.entries(p.meta?.roadLayer || {})) {
    if (typeof v === "number" && v < 6) s.add(k);
  }
  return s;
}

function firstRung(needFn) {
  for (const c of HUB_CAP_LADDER) if (needFn(c)) return c;
  return null;
}

const scores = {
  capInLadder: T("hubDistCap in ladder"),
  reachFormula: T("deepReach === min(cap+2,18)"),
  impliedLiveFit: T("hubDistCap === first rung covering shipped exts (live hf + freeze depth)"),
  impliedLiveFitRam: T("hubDistCap === first rung covering shipped exts (live hf + rampart depth)"),
  impliedPubMax: T("hubDistCap === first rung >= published maxHubDist"),
  impliedLiveMax: T("hubDistCap === first rung >= live maxHubDist"),
  impliedLiveMaxFlank: T("hubDistCap === first rung with min(c+2,18) >= live maxHubDist"),
  impliedPubMaxFlank: T("hubDistCap === first rung with min(c+2,18) >= published maxHubDist"),
  maxHubLive: T("maxHubDist === live hf max of shipped exts"),
  maxHubLiveSkipInf: T("maxHubDist === live hf max skipping INF"),
  capGeLiveMax: T("hubDistCap >= live maxHubDist"),
  capGePubMax: T("hubDistCap >= published maxHubDist"),
  capEq16: T("hubDistCap === 16"),
  stubEnum: T("stubCap in {43,51}"),
  stubDeepPoolL6: T("stubCap === 51 iff l6-deepPool/60 >= 1.5"),
  stubDeepPoolNoGuard: T("stubCap === 51 iff deepPool-no-mGuard/60 >= 1.5"),
  stubDeepPoolNoCap: T("stubCap === 51 iff deep-no-cohesion/60 >= 1.5"),
  stubDeepFreeze: T("stubCap === 51 iff deep-inside-freeze/60 >= 1.5"),
  stubDeepBuild: T("stubCap === 51 iff deep-buildable-empty/60 >= 1.5"),
  corSumExt: T("corridorPlaced+corridorFallback === shipped ext count"),
  corPlacedExt: T("corridorPlaced === shipped ext count"),
  corFb0: T("corridorFallback === 0"),
  floorUngatedEqMax: T("floorUngated === wallsMFree.max"),
  floorUngatedEqFloor: T("floorUngated === mobility.floor"),
  parkCapEqCtrl: T("parkCap === ctrlParks"),
  parkCapEqFloor: T("parkCap === ctrlParkFloorCap"),
  radiiEqWide: T("radii === RADII_WIDE"),
  lapCeilFloorEqT: T("lapCeilingFloor === MOBILITY_TARGET"),
  shallowRamEq: T("shallowRamparts tiles === shallow shipped ext with rampart"),
  stubExhUsed: T("stubExhausted === stubRoads >= stubCap"),
  haulEqLabs: T("haulCost === labs.haul"),
};

const hubHist = {};
const stubHist = {};
const parkHist = {};
const radiiHist = {};
const composeKeys = {};
const leftover = {};
const oddCaps = [];
const stubMiss = [];
const impliedMiss = [];

const PRESENCE_SAMPLE = [
  "baseOverGated",
  "corridorFallback",
  "corridorPlaced",
  "deepExhausted",
  "digRoads",
  "freeLeft",
  "haulCost",
  "inertPromoted",
  "lapCeilingFloor",
  "maxHubDist",
  "parkCap",
  "radii",
  "rescuedLap",
  "rescuedTo",
  "rolledBackFrom",
  "shallowRamparts",
  "stubExhausted",
  "wasLap",
  "floorUngated",
  "deepBudget",
  "strandedFirst",
  "unsealed",
  "worstCase",
  "worstCaseUngated",
  "rescueSpent",
  "servedExts",
  "unreachableExts",
];

function pathsOf(obj, name, trail = "meta") {
  const out = [];
  const walk = (o, t) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) {
      o.forEach((e, i) => walk(e, `${t}[${i}]`));
      return;
    }
    for (const [k, v] of Object.entries(o)) {
      if (k === name) out.push({ path: `${t}.${k}`, v });
      if (v && typeof v === "object") walk(v, `${t}.${k}`);
    }
  };
  walk(obj, trail);
  return out;
}

for (const p of plans) {
  const d = byRoom.get(p.room);
  if (!d || !p.sitter) continue;
  const terrain = d.terrain;
  const e = p.meta?.extensions || {};
  const co = p.meta?.composeOpts || {};
  hubHist[String(e.hubDistCap)] = (hubHist[String(e.hubDistCap)] || 0) + 1;
  stubHist[String(e.stubCap)] = (stubHist[String(e.stubCap)] || 0) + 1;
  parkHist[String(co.parkCap)] = (parkHist[String(co.parkCap)] || 0) + 1;
  radiiHist[JSON.stringify(co.radii)] = (radiiHist[JSON.stringify(co.radii)] || 0) + 1;
  for (const k of Object.keys(co)) composeKeys[k] = (composeKeys[k] || 0) + 1;

  const freeze = p.meta?.shell?.cutAtFreeze?.length ? p.meta.shell.cutAtFreeze : p.meta?.shell?.cut || [];
  const freezeSet = new Set(freeze.map(K));
  const extFreeze = exteriorFlood(terrain, freezeSet);
  const depthFreeze = depthFrom(extFreeze);
  const ramSet = new Set((p.structures?.rampart || []).map(K));
  const extRam = exteriorFlood(terrain, ramSet);
  const depthRam = depthFrom(extRam);

  const occ = l6Occupied(p);
  const hf = fieldFrom(terrain, p.sitter, occ);
  const exts = p.structures?.extension || [];
  let liveMax = 0;
  let liveMaxSkip = 0;
  let infN = 0;
  for (const ex of exts) {
    const v = hf[idx(ex.x, ex.y)];
    if (v >= 9999) {
      infN++;
      continue;
    }
    if (v > liveMaxSkip) liveMaxSkip = v;
    if (v > liveMax) liveMax = v;
  }
  if (infN) liveMax = 9999;

  const fitRung = (depth) =>
    firstRung((c) => {
      const deepR = Math.min(c + FLANK_RELAX, FLANK_HARD);
      for (const ex of exts) {
        const v = hf[idx(ex.x, ex.y)];
        if (v >= 9999) continue;
        const cap = depth[idx(ex.x, ex.y)] >= 4 ? deepR : c;
        if (v > cap) return false;
      }
      return true;
    });

  const rungFreeze = fitRung(depthFreeze);
  const rungRam = fitRung(depthRam);
  const rungPub = firstRung((c) => c >= (e.maxHubDist || 0));
  const rungLive = firstRung((c) => c >= liveMaxSkip);
  const rungLiveFlank = firstRung((c) => Math.min(c + FLANK_RELAX, FLANK_HARD) >= liveMaxSkip);
  const rungPubFlank = firstRung((c) => Math.min(c + FLANK_RELAX, FLANK_HARD) >= (e.maxHubDist || 0));

  hit(scores.capInLadder, HUB_CAP_LADDER.includes(e.hubDistCap), { room: p.room, cap: e.hubDistCap });
  hit(scores.reachFormula, e.deepReach === Math.min((e.hubDistCap || 0) + FLANK_RELAX, FLANK_HARD), {
    room: p.room,
    deepReach: e.deepReach,
    cap: e.hubDistCap,
  });
  hit(scores.impliedLiveFit, e.hubDistCap === rungFreeze, {
    room: p.room,
    got: e.hubDistCap,
    want: rungFreeze,
    liveMaxSkip,
    pubMax: e.maxHubDist,
    infN,
  });
  hit(scores.impliedLiveFitRam, e.hubDistCap === rungRam, { room: p.room, got: e.hubDistCap, want: rungRam });
  hit(scores.impliedPubMax, e.hubDistCap === rungPub, { room: p.room, got: e.hubDistCap, want: rungPub, pubMax: e.maxHubDist });
  hit(scores.impliedLiveMax, e.hubDistCap === rungLive, { room: p.room, got: e.hubDistCap, want: rungLive, liveMaxSkip });
  hit(scores.impliedLiveMaxFlank, e.hubDistCap === rungLiveFlank, {
    room: p.room,
    got: e.hubDistCap,
    want: rungLiveFlank,
    liveMaxSkip,
  });
  hit(scores.impliedPubMaxFlank, e.hubDistCap === rungPubFlank, {
    room: p.room,
    got: e.hubDistCap,
    want: rungPubFlank,
    pubMax: e.maxHubDist,
  });
  hit(scores.maxHubLive, e.maxHubDist === liveMax, { room: p.room, got: e.maxHubDist, liveMax, infN });
  hit(scores.maxHubLiveSkipInf, e.maxHubDist === liveMaxSkip, { room: p.room, got: e.maxHubDist, liveMaxSkip, infN });
  hit(scores.capGeLiveMax, e.hubDistCap >= liveMaxSkip, { room: p.room, cap: e.hubDistCap, liveMaxSkip });
  hit(scores.capGePubMax, e.hubDistCap >= (e.maxHubDist || 0), { room: p.room, cap: e.hubDistCap, pubMax: e.maxHubDist });
  hit(scores.capEq16, e.hubDistCap === 16, { room: p.room, cap: e.hubDistCap });

  if (e.hubDistCap !== 16 || e.hubDistCap !== rungFreeze) {
    if (e.hubDistCap !== 16 || e.hubDistCap !== rungFreeze) {
      if (e.hubDistCap !== 16) {
        oddCaps.push({
          room: p.room,
          cap: e.hubDistCap,
          deepReach: e.deepReach,
          pubMax: e.maxHubDist,
          liveMaxSkip,
          infN,
          rungFreeze,
          rungRam,
          rungLiveFlank,
          rungPubFlank,
        });
      }
    }
  }
  if (e.hubDistCap !== rungFreeze && impliedMiss.length < 12) {
    impliedMiss.push({ room: p.room, got: e.hubDistCap, rungFreeze, liveMaxSkip, pubMax: e.maxHubDist, infN });
  }

  // stubCap deepPool reconstruction
  const reserved = reservedTiles(p);
  const paved = preL6Paved(p);
  const forbid = new Set();
  for (const s of Array.isArray(co.forbidExtSeat) ? co.forbidExtSeat : []) {
    if (s && Number.isInteger(s.x)) forbid.add(K(s));
  }
  const mGuard = mineralGuard(terrain, p);
  const hubCap = e.hubDistCap || 16;
  const deepReach = Math.min(hubCap + FLANK_RELAX, FLANK_HARD);
  const blockedNow = new Set(occ);
  let poolGuard = 0;
  let poolNoGuard = 0;
  let poolNoCap = 0;
  let deepFreeze = 0;
  let deepBuild = 0;
  for (let x = 2; x <= 47; x++) {
    for (let y = 2; y <= 47; y++) {
      const i = idx(x, y);
      if (depthFreeze[i] < 4) continue;
      if (extFreeze[i]) continue;
      deepFreeze++;
      if (!buildable(terrain, x, y)) continue;
      const k = `${x},${y}`;
      if (occ.has(k) || reserved.has(k) || forbid.has(k) || paved.has(k)) continue;
      if (hf[i] >= 9999) continue;
      deepBuild++;
      poolNoCap++;
      if (hf[i] > deepReach) continue;
      poolNoGuard++;
      if (!mGuard.ok({ x, y }, blockedNow)) continue;
      poolGuard++;
    }
  }
  const is51 = e.stubCap === 51;
  hit(scores.stubEnum, e.stubCap === 43 || e.stubCap === 51, { room: p.room, stubCap: e.stubCap });
  hit(scores.stubDeepPoolL6, is51 === poolGuard / TARGET >= RICH, {
    room: p.room,
    stubCap: e.stubCap,
    poolGuard,
    ratio: +(poolGuard / TARGET).toFixed(3),
  });
  hit(scores.stubDeepPoolNoGuard, is51 === poolNoGuard / TARGET >= RICH, {
    room: p.room,
    stubCap: e.stubCap,
    poolNoGuard,
    ratio: +(poolNoGuard / TARGET).toFixed(3),
  });
  hit(scores.stubDeepPoolNoCap, is51 === poolNoCap / TARGET >= RICH, {
    room: p.room,
    stubCap: e.stubCap,
    poolNoCap,
  });
  hit(scores.stubDeepFreeze, is51 === deepFreeze / TARGET >= RICH, {
    room: p.room,
    stubCap: e.stubCap,
    deepFreeze,
  });
  hit(scores.stubDeepBuild, is51 === deepBuild / TARGET >= RICH, {
    room: p.room,
    stubCap: e.stubCap,
    deepBuild,
  });
  if (is51 !== poolGuard / TARGET >= RICH && stubMiss.length < 16) {
    stubMiss.push({
      room: p.room,
      stubCap: e.stubCap,
      poolGuard,
      poolNoGuard,
      poolNoCap,
      deepFreeze,
      deepBuild,
      cap: e.hubDistCap,
    });
  }

  const nExt = exts.length;
  hit(scores.corSumExt, (e.corridorPlaced || 0) + (e.corridorFallback || 0) === nExt, {
    room: p.room,
    placed: e.corridorPlaced,
    fb: e.corridorFallback,
    nExt,
  });
  hit(scores.corPlacedExt, e.corridorPlaced === nExt, { room: p.room, placed: e.corridorPlaced, nExt });
  hit(scores.corFb0, e.corridorFallback === 0, { room: p.room, fb: e.corridorFallback });

  const blockedFree = new Set();
  for (const src of p.sources || []) blockedFree.add(K(src));
  if (p.controller) blockedFree.add(K(p.controller));
  if (p.mineral) blockedFree.add(K(p.mineral));
  if (p.sitter) blockedFree.add(K(p.sitter));
  for (const t of BUILT_OBSTACLES) {
    if (t === "extension") continue;
    for (const q of p.structures?.[t] || []) blockedFree.add(K(q));
  }
  const cut = p.meta?.shell?.cut || [];
  const walk = interiorWalk(terrain, ramSet, extRam, blockedFree, p.sitter);
  const mfw = cut.length ? mobilityStats(cut, extRam, maskFromKeys(walk)) : { max: 0, maxGated: 0 };
  const fuHits = pathsOf(p.meta, "floorUngated");
  for (const h of fuHits) {
    if (typeof h.v === "number") {
      hit(scores.floorUngatedEqMax, Math.abs(h.v - mfw.max) < 1e-6, { room: p.room, v: h.v, max: mfw.max, path: h.path });
      hit(scores.floorUngatedEqFloor, Math.abs(h.v - (p.meta?.walls?.mobility?.floor ?? NaN)) < 1e-6, {
        room: p.room,
        v: h.v,
        floor: p.meta?.walls?.mobility?.floor,
        path: h.path,
      });
    }
  }

  const pc = co.parkCap;
  const parks = p.meta?.ctrlParks;
  hit(scores.parkCapEqCtrl, pc === parks, { room: p.room, pc, parks });
  hit(scores.parkCapEqFloor, pc === p.meta?.ctrlParkFloorCap, { room: p.room, pc, floor: p.meta?.ctrlParkFloorCap });
  const radii = co.radii;
  hit(
    scores.radiiEqWide,
    Array.isArray(radii) && radii.length === RADII_WIDE.length && radii.every((x, i) => x === RADII_WIDE[i]),
    { room: p.room, radii },
  );

  const lcfHits = pathsOf(p.meta, "lapCeilingFloor");
  for (const h of lcfHits) {
    if (typeof h.v === "number") {
      hit(scores.lapCeilFloorEqT, Math.abs(h.v - MOBILITY_TARGET) < 1e-9, { room: p.room, v: h.v });
    }
  }

  const ram = ramSet;
  const shallowWant = exts
    .filter((ex) => depthRam[idx(ex.x, ex.y)] < 4 && ram.has(K(ex)))
    .map(K)
    .sort();
  const srHits = pathsOf(p.meta, "shallowRamparts");
  for (const h of srHits) {
    if (Array.isArray(h.v)) {
      const got = h.v.filter((t) => t && Number.isInteger(t.x)).map(K).sort();
      hit(scores.shallowRamEq, got.join("|") === shallowWant.join("|"), {
        room: p.room,
        got: got.length,
        want: shallowWant.length,
        path: h.path,
      });
    }
  }

  hit(scores.stubExhUsed, !!e.stubExhausted === (e.stubRoads || 0) >= e.stubCap, {
    room: p.room,
    flag: e.stubExhausted,
    used: e.stubRoads,
    cap: e.stubCap,
  });

  const haulHits = pathsOf(p.meta, "haulCost");
  for (const h of haulHits) {
    if (typeof h.v === "number") {
      hit(scores.haulEqLabs, h.v === p.meta?.labs?.haul, { room: p.room, v: h.v, haul: p.meta?.labs?.haul, path: h.path });
    }
  }

  for (const name of PRESENCE_SAMPLE) {
    const hits = pathsOf(p.meta, name);
    if (!leftover[name]) leftover[name] = { rooms: 0, paths: {}, values: {} };
    if (!hits.length) continue;
    leftover[name].rooms++;
    for (const h of hits) {
      leftover[name].paths[h.path] = (leftover[name].paths[h.path] || 0) + 1;
      const key =
        typeof h.v === "number" || typeof h.v === "boolean"
          ? String(h.v)
          : Array.isArray(h.v)
            ? `arr${h.v.length}`
            : h.v && typeof h.v === "object" && Number.isInteger(h.v.x)
              ? `${h.v.x},${h.v.y}`
              : typeof h.v;
      leftover[name].values[key] = (leftover[name].values[key] || 0) + 1;
    }
  }
}

function line(t) {
  const flag = t.bad === 0 && t.ok ? "OK  " : t.n === 0 ? "SKIP" : `NO  ${t.ok}/${t.n}`;
  return `${flag.padEnd(16)} ${t.name}`;
}

console.log("=== hubDistCap / stubCap / leftover ===");
console.log("hubHist", hubHist);
console.log("stubHist", stubHist);
console.log("parkHist", parkHist);
console.log("radiiHist", radiiHist);
console.log("composeKeys", composeKeys);
console.log("oddCaps", JSON.stringify(oddCaps, null, 2));
console.log("impliedMiss", JSON.stringify(impliedMiss, null, 2));
console.log("stubMiss", JSON.stringify(stubMiss, null, 2));
console.log("\n--- scores ---");
for (const t of Object.values(scores)) console.log(line(t), t.samples[0] ? JSON.stringify(t.samples[0]) : "");
console.log("\n--- leftover loc ---");
for (const [k, v] of Object.entries(leftover)) {
  const vals = Object.entries(v.values)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([a, b]) => `${a}:${b}`)
    .join(" ");
  console.log(`${k} rooms=${v.rooms} paths=${JSON.stringify(v.paths)} vals=${vals}`);
}
