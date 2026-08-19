/**
 * Round-28 independent re-derivation. Terrain + shipped structure lists only.
 * Does not import validate.mjs / r27-gates.mjs / producer renderers.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { D8, chebyshev, exteriorFlood, fetchRoomsFromMongo, isWall, key, walkable } from "../shared.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "../../out-v2");
const CACHE = path.join(DIR, "rooms.json");
const plans = JSON.parse(fs.readFileSync(path.join(ROOT, "plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);

function loadRooms() {
  if (fs.existsSync(CACHE)) {
    const cached = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (cached.length === plans.length) return cached;
  }
  const rooms = fetchRoomsFromMongo(plans.map((p) => p.room));
  fs.writeFileSync(CACHE, JSON.stringify(rooms));
  return rooms;
}

const idx = (x, y) => x + y * 50;
const K = (t) => `${t.x},${t.y}`;

const rooms = loadRooms();
const byRoom = new Map(rooms.map((r) => [r.room, r]));

const totals = {
  rooms: 0,
  missingTerrain: [],
  ext: 0,
  extShort: [],
  roads: 0,
  ramparts: 0,
  decls: 0,
  notes: 0,
  noteRecords: 0,
  containers: 0,
  links: 0,
  towers: 0,
  labs: 0,
  spawns: 0,
  cross: 0,
  seat: 0,
  ring: 0,
  cover: 0,
  unclass: 0,
  rrRooms: 0,
  rrPer: [],
  leaks: 0,
  leakRooms: [],
  extractorOutsideBare: 0,
  shallowEcoBare: 0,
  extNoD4Road: 0,
  freezeTiles: 0,
  freezeLoose: 0,
  freezeLooseRooms: [],
  freezeSealFail: [],
  freezeVsShipDiffRooms: 0,
  adds: 0,
  removes: 0,
  adoptRooms: 0,
  driftRooms: 0,
  mineralWhy: { exact: 0, fallbackish: 0, rooms: [] },
};

const roadKind = {};
const clumpHist = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, other: 0 };

for (const plan of plans) {
  const d = byRoom.get(plan.room);
  if (!d) {
    totals.missingTerrain.push(plan.room);
    continue;
  }
  totals.rooms++;
  const s = plan.structures || {};
  const extN = (s.extension || []).length;
  totals.ext += extN;
  if (extN !== 60) totals.extShort.push(`${plan.room}:${extN}`);
  totals.roads += (s.road || []).length;
  totals.ramparts += (s.rampart || []).length;
  totals.containers += (s.container || []).length;
  totals.links += (s.link || []).length;
  totals.towers += (s.tower || []).length;
  totals.labs += (s.lab || []).length;
  totals.spawns += (s.spawn || []).length;
  totals.decls += (plan.meta?.shortfalls || []).length;
  totals.notes += (plan.meta?.notes || []).length;
  totals.noteRecords += (plan.meta?.noteRecords || []).length;

  const sh = plan.meta?.shell || plan.shell || {};
  const cut = new Set((sh.cut || []).map(K));
  const denial = new Set((sh.standDenial || []).map(K));
  const roads = new Set((s.road || []).map(K));
  const ramps = new Set((s.rampart || []).map(K));
  const occ = new Map();
  for (const t of Object.keys(s)) {
    if (t === "road" || t === "rampart") continue;
    for (const p of s[t] || []) occ.set(K(p), t);
  }

  let roomRR = 0;
  for (const r of s.rampart || []) {
    const k = K(r);
    if (!roads.has(k)) continue;
    roomRR++;
    if (cut.has(k)) totals.cross++;
    else if (occ.get(k) === "container") totals.seat++;
    else if (denial.has(k)) totals.ring++;
    else if (occ.has(k)) totals.cover++;
    else totals.unclass++;
  }
  if (roomRR) {
    totals.rrRooms++;
    totals.rrPer.push(roomRR);
  }

  for (const [k, kind] of Object.entries(plan.meta?.walls?.roadKind || {})) {
    roadKind[kind] = (roadKind[kind] || 0) + 1;
  }

  const towers = s.tower || [];
  const sitter = plan.sitter || plan.hub;
  if (sitter && towers.length) {
    let clump = 0;
    for (const t of towers) if (chebyshev(t, sitter) <= 2) clump++;
    if (clumpHist[clump] !== undefined) clumpHist[clump]++;
    else clumpHist.other++;
  }

  const ext = exteriorFlood(d.terrain, ramps);
  const depth = new Int16Array(2500).fill(999);
  {
    const q = [];
    for (let i = 0; i < 2500; i++) if (ext[i]) { depth[i] = 0; q.push(i); }
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi];
      const x = i % 50, y = (i / 50) | 0;
      for (const [dx, dy] of D8) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
        const ni = idx(nx, ny);
        if (depth[ni] <= depth[i] + 1) continue;
        depth[ni] = depth[i] + 1;
        q.push(ni);
      }
    }
  }

  const leakHere = [];
  for (const t of Object.keys(s)) {
    if (t === "road" || t === "rampart") continue;
    for (const p of s[t] || []) {
      const i = idx(p.x, p.y);
      if (!ext[i]) continue;
      if (ramps.has(K(p))) continue;
      if (t === "extractor") {
        totals.extractorOutsideBare++;
        continue;
      }
      leakHere.push(`${t}@${K(p)}`);
    }
  }
  if (leakHere.length) {
    totals.leaks += leakHere.length;
    totals.leakRooms.push(`${plan.room}:${leakHere.join(",")}`);
  }

  const ecoTypes = ["container", "link", "storage", "terminal", "spawn", "lab", "nuker", "observer", "extension"];
  for (const t of ecoTypes) {
    for (const p of s[t] || []) {
      if (ramps.has(K(p))) continue;
      if (depth[idx(p.x, p.y)] < 4) totals.shallowEcoBare++;
    }
  }

  for (const e of s.extension || []) {
    const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    if (!faces.some(([dx, dy]) => roads.has(`${e.x + dx},${e.y + dy}`))) totals.extNoD4Road++;
  }

  const freeze = sh.cutAtFreeze || [];
  totals.freezeTiles += freeze.length;
  const freezeK = new Set(freeze.map(K));
  const shipK = new Set((sh.cut || []).map(K));
  const onlyF = [...freezeK].filter((k) => !shipK.has(k));
  const onlyS = [...shipK].filter((k) => !freezeK.has(k));
  if (onlyF.length || onlyS.length) totals.freezeVsShipDiffRooms++;

  const frozen = exteriorFlood(d.terrain, freezeK);
  const coreTypes = ["storage", "spawn", "terminal", "tower", "lab", "nuker", "observer"];
  const coreHit = [];
  for (const t of coreTypes) {
    for (const p of s[t] || []) if (frozen[idx(p.x, p.y)]) coreHit.push(`${t}@${K(p)}`);
  }
  if (coreHit.length) totals.freezeSealFail.push(`${plan.room}:${coreHit.join(",")}`);

  if (sitter && !frozen[idx(sitter.x, sitter.y)]) {
    const loose = [];
    for (const t of freeze) {
      const less = new Set(freezeK);
      less.delete(K(t));
      const f2 = exteriorFlood(d.terrain, less);
      if (!f2[idx(sitter.x, sitter.y)]) loose.push(K(t));
    }
    totals.freezeLoose += loose.length;
    if (loose.length) totals.freezeLooseRooms.push(`${plan.room}:${loose.length}:${loose.slice(0, 6).join(" ")}`);
  }

  const drift = sh.cutDrift || [];
  const nAdd = drift.filter((e) => e && e.op === "add").length;
  const nRem = drift.filter((e) => e && e.op === "remove").length;
  totals.adds += nAdd;
  totals.removes += nRem;
  if (nAdd) totals.adoptRooms++;
  if (drift.length) totals.driftRooms++;

  const why = plan.meta?.misc?.mineralOffNetworkWhy;
  if (typeof why === "string") {
    const seat = (s.container || []).find((c) => plan.mineral && chebyshev(c, plan.mineral) <= 1);
    totals.mineralWhy.rooms.push({
      room: plan.room,
      len: why.length,
      hasSeat: !!(seat && why.includes(`the mineral seat at ${seat.x},${seat.y}`)),
      offSuffix: why.includes("no road by design"),
      onSuffix: why.includes("no road was grown to it"),
    });
  }
}

totals.rrPer.sort((a, b) => a - b);
const med = (a) => (a.length ? a[a.length >> 1] : 0);
const max = (a) => (a.length ? a[a.length - 1] : 0);

const out = {
  rooms: totals.rooms,
  missingTerrain: totals.missingTerrain,
  extensions: totals.ext,
  extShort: totals.extShort,
  roads: totals.roads,
  ramparts: totals.ramparts,
  containers: totals.containers,
  links: totals.links,
  towers: totals.towers,
  labs: totals.labs,
  spawns: totals.spawns,
  declarations: totals.decls,
  notes: totals.notes,
  noteRecords: totals.noteRecords,
  roadRampart: {
    total: totals.cross + totals.seat + totals.ring + totals.cover + totals.unclass,
    crossing: totals.cross,
    seat: totals.seat,
    ring: totals.ring,
    cover: totals.cover,
    unclassified: totals.unclass,
    rooms: totals.rrRooms,
    median: med(totals.rrPer),
    max: max(totals.rrPer),
  },
  roadKind,
  clumpHist,
  leaks: totals.leaks,
  leakRooms: totals.leakRooms,
  extractorOutsideBare: totals.extractorOutsideBare,
  shallowEcoBare: totals.shallowEcoBare,
  extNoD4Road: totals.extNoD4Road,
  cutAtFreeze: {
    tiles: totals.freezeTiles,
    loose: totals.freezeLoose,
    looseRooms: totals.freezeLooseRooms,
    sealFail: totals.freezeSealFail,
    differRooms: totals.freezeVsShipDiffRooms,
    adds: totals.adds,
    removes: totals.removes,
    adoptRooms: totals.adoptRooms,
    driftRooms: totals.driftRooms,
  },
  mineralWhyCount: totals.mineralWhy.rooms.length,
};

fs.writeFileSync(path.join(DIR, "rederive.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
