/**
 * Round-35 independent physicals + 134(a/d) + mineral census + seed inventory.
 * Terrain + shipped structure lists only. Does not import validate.mjs.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  D4,
  K,
  KT,
  cheb,
  depthFromExterior,
  floodExterior,
  hashedRooms,
  idx,
  loadPlans,
  loadRooms,
  mineralSeat,
  structHolds,
  EXPECTED_MD5,
} from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { md5, plans } = loadPlans();
const { byRoom } = loadRooms();
const hashed = hashedRooms(plans);

const totals = {
  md5,
  md5Ok: md5 === EXPECTED_MD5,
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
  extractors: 0,
  storage: 0,
  terminal: 0,
  nuker: 0,
  observer: 0,
  factory: 0,
  powerSpawn: 0,
  leaks: 0,
  leakRooms: [],
  extractorOutsideBare: 0,
  shallowEcoBare: 0,
  extNoD4Road: 0,
  stackIllegal: 0,
  onObject: 0,
  borderIllegal: 0,
  freezeTiles: 0,
  freezeLoose: 0,
  freezeLooseRooms: [],
  freezeSealFail: [],
  freezeVsShipDiffRooms: 0,
  adds: 0,
  removes: 0,
  adoptRooms: 0,
  driftRooms: 0,
  mineralWhy: { n: 0, exactOfficial: 0, lieRooms: [] },
  seed: { hasSeed: 0, noSeed: 0, eqHub: 0, neHub: 0, onStorage: 0, fields: {} },
  fullRun: { n: 0, ran: 0, shrunk: 0, dropped: 0, plain: 0, reserved: 0, byRound: 0, laneReserved: 0, reservedEqLane: 0, reservedGtLane: 0 },
  ladders: { n: 0, withEsc: 0, withCut: 0, noCut: 0 },
  taken: [],
};

const roadKind = {};
const clumpHist = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, other: 0 };
const rr = { cross: 0, seat: 0, ring: 0, cover: 0, unclass: 0, rooms: 0, per: [] };

const CORE = ["storage", "spawn", "terminal", "tower", "lab", "nuker", "observer"];
const ECO = ["container", "link", "storage", "terminal", "spawn", "lab", "nuker", "observer", "extension"];

function officialMineralWhy(plan, seat) {
  const holds = structHolds(plan);
  const net = new Set((plan.structures?.road || []).map(K));
  for (const c of plan.structures?.container || []) net.add(K(c));
  net.delete(K(seat));
  const ring = [];
  const touching = [];
  for (const [dx, dy] of D8_LOCAL) {
    const x = seat.x + dx;
    const y = seat.y + dy;
    if (x < 0 || y < 0 || x > 49 || y > 49) continue;
    const k = KT(x, y);
    ring.push(`${k} (${holds.get(k) || "nothing of ours"})`);
    if (net.has(k)) touching.push(k);
  }
  let nearestRoad = null;
  for (const r of plan.structures?.road || []) {
    const d = cheb(r, seat);
    if (
      !nearestRoad ||
      d < nearestRoad.dist ||
      (d === nearestRoad.dist && (r.y < nearestRoad.y || (r.y === nearestRoad.y && r.x < nearestRoad.x)))
    ) {
      nearestRoad = { x: r.x, y: r.y, dist: d };
    }
  }
  const near = !nearestRoad
    ? "this room ships no road at all"
    : nearestRoad.dist === 0
      ? "the seat tile itself carries a road (a container and a road legally share a square)"
      : `the nearest road tile this room ships is ${nearestRoad.x},${nearestRoad.y}, ${nearestRoad.dist} step(s) away`;
  const off = "no road by design — mineral hauling is one trickle deposit on a long cooldown, and permanent road decay to reach it costs more than the walk it saves.";
  const on = "no road was grown to it, but a corridor another layer laid runs past it, so it is serviced like any other container.";
  return (
    `ON THIS ROOM: the mineral seat at ${seat.x},${seat.y} has these eight neighbours — ${ring.join(" · ")} — ` +
    `so ${touching.length} of them put it on the network, and ${near}. ` +
    (touching.length ? `The seat DOES touch the network (${touching.join(" ")}): ${on}` : off) +
    ` Measured over the FINISHED road set, not layer 5's.`
  );
}

const D8_LOCAL = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

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
  totals.extractors += (s.extractor || []).length;
  totals.storage += (s.storage || []).length;
  totals.terminal += (s.terminal || []).length;
  totals.nuker += (s.nuker || []).length;
  totals.observer += (s.observer || []).length;
  totals.factory += (s.factory || []).length;
  totals.powerSpawn += (s.powerSpawn || []).length;
  totals.decls += (plan.meta?.shortfalls || []).length;
  totals.notes += (plan.meta?.notes || []).length;
  totals.noteRecords += (plan.meta?.noteRecords || []).length;

  const sh = plan.meta?.shell || {};
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
    if (cut.has(k)) rr.cross++;
    else if (occ.get(k) === "container") rr.seat++;
    else if (denial.has(k)) rr.ring++;
    else if (occ.has(k)) rr.cover++;
    else rr.unclass++;
  }
  if (roomRR) {
    rr.rooms++;
    rr.per.push(roomRR);
  }

  for (const kind of Object.values(plan.meta?.walls?.roadKind || {})) {
    roadKind[kind] = (roadKind[kind] || 0) + 1;
  }

  const towers = s.tower || [];
  const sitter = plan.sitter || plan.hub;
  if (sitter && towers.length) {
    let clump = 0;
    for (const t of towers) if (cheb(t, sitter) <= 2) clump++;
    if (clumpHist[clump] !== undefined) clumpHist[clump]++;
    else clumpHist.other++;
  }

  const extFlood = floodExterior(d.terrain, ramps);
  const depth = depthFromExterior(extFlood);

  const leakHere = [];
  for (const t of Object.keys(s)) {
    if (t === "road" || t === "rampart") continue;
    for (const p of s[t] || []) {
      if (!extFlood[idx(p.x, p.y)]) continue;
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

  for (const t of ECO) {
    for (const p of s[t] || []) {
      if (ramps.has(K(p))) continue;
      if (depth[idx(p.x, p.y)] < 4) totals.shallowEcoBare++;
    }
  }
  for (const e of s.extension || []) {
    if (!D4.some(([dx, dy]) => roads.has(KT(e.x + dx, e.y + dy)))) totals.extNoD4Road++;
  }

  const byTile = new Map();
  for (const t of Object.keys(s)) {
    for (const p of s[t] || []) {
      const k = K(p);
      (byTile.get(k) || byTile.set(k, []).get(k)).push(t);
    }
  }
  for (const [k, types] of byTile) {
    const [x, y] = k.split(",").map(Number);
    const nonRR = types.filter((t) => t !== "rampart" && t !== "road");
    if (nonRR.length > 1) totals.stackIllegal++;
    if (types.filter((t) => t !== "rampart").includes("road") && nonRR.some((t) => t !== "container")) {
      totals.stackIllegal++;
    }
    const objects = new Set([
      ...(plan.sources || []).map(K),
      ...(plan.controller ? [K(plan.controller)] : []),
      ...(plan.mineral ? [K(plan.mineral)] : []),
    ]);
    if (objects.has(k) && !(types.length === 1 && types[0] === "extractor" && plan.mineral && K(plan.mineral) === k)) {
      totals.onObject++;
    }
    if ((x === 0 || y === 0 || x === 49 || y === 49) && types.some((t) => t !== "road")) totals.borderIllegal++;
  }

  const freeze = sh.cutAtFreeze || [];
  totals.freezeTiles += freeze.length;
  const freezeK = new Set(freeze.map(K));
  const shipK = new Set((sh.cut || []).map(K));
  if ([...freezeK].some((k) => !shipK.has(k)) || [...shipK].some((k) => !freezeK.has(k))) {
    totals.freezeVsShipDiffRooms++;
  }

  const frozen = floodExterior(d.terrain, freezeK);
  const coreHit = [];
  for (const t of CORE) {
    for (const p of s[t] || []) if (frozen[idx(p.x, p.y)]) coreHit.push(`${t}@${K(p)}`);
  }
  if (coreHit.length) totals.freezeSealFail.push(`${plan.room}:${coreHit.join(",")}`);

  if (sitter && !frozen[idx(sitter.x, sitter.y)]) {
    const loose = [];
    for (const t of freeze) {
      const less = new Set(freezeK);
      less.delete(K(t));
      const f2 = floodExterior(d.terrain, less);
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
  const seat = mineralSeat(plan);
  if (typeof why === "string" && seat) {
    totals.mineralWhy.n++;
    const want = officialMineralWhy(plan, seat);
    if (why === want) totals.mineralWhy.exactOfficial++;
    else totals.mineralWhy.lieRooms.push(plan.room);
  }

  if (plan.seed && Number.isInteger(plan.seed.x)) totals.seed.hasSeed++;
  else totals.seed.noSeed++;
  const hub = plan.hub || plan.sitter;
  if (plan.seed && hub && plan.seed.x === hub.x && plan.seed.y === hub.y) totals.seed.eqHub++;
  else if (plan.seed && hub) totals.seed.neHub++;
  const st = (s.storage || [])[0];
  if (plan.seed && st && plan.seed.x === st.x && plan.seed.y === st.y) totals.seed.onStorage++;
  for (const f of ["seedScore", "seedSkip", "seedPool"]) {
    if (plan.meta?.[f] != null) totals.seed.fields[f] = (totals.seed.fields[f] || 0) + 1;
  }

  const L = plan.meta?.extensions?.laneMeta;
  if (L && typeof L === "object") {
    totals.fullRun.n++;
    if (L.fullRun?.ran) totals.fullRun.ran++;
    if (L.shrunk) totals.fullRun.shrunk++;
    else if (L.dropped) totals.fullRun.dropped++;
    else totals.fullRun.plain++;
    if (Array.isArray(L.fullRun?.reserved)) totals.fullRun.reserved++;
    if (Array.isArray(L.fullRun?.byRound)) totals.fullRun.byRound++;
    if (Array.isArray(L.reserved)) totals.fullRun.laneReserved++;
    if (Array.isArray(L.fullRun?.reserved) && Array.isArray(L.reserved)) {
      const a = L.fullRun.reserved.map(String).sort().join("|");
      const b = L.reserved.map(String).sort().join("|");
      if (a === b) totals.fullRun.reservedEqLane++;
      else if (L.fullRun.reserved.length > L.reserved.length) totals.fullRun.reservedGtLane++;
    }
  }

  const sf = (plan.meta?.shortfalls || []).find((x) => x && x.ladder && Array.isArray(x.ladder.rungs));
  if (sf) {
    totals.ladders.n++;
    if (plan.meta?.shellEscalation) totals.ladders.withEsc++;
    const hasCut =
      sf.ladder.rungs.some((r) => Array.isArray(r?.cutTiles) && r.cutTiles.length) ||
      (plan.meta?.shellEscalation?.rungs || []).some((r) => Array.isArray(r?.cutTiles) && r.cutTiles.length);
    if (hasCut) totals.ladders.withCut++;
    else totals.ladders.noCut++;
  }

  if (plan.meta?.sealedRecovery?.outcome === "taken") {
    totals.taken.push(plan.room);
  }
}

rr.per.sort((a, b) => a - b);
const med = (a) => (a.length ? a[a.length >> 1] : 0);
const roadsPer = plans.map((p) => (p.structures?.road || []).length).sort((a, b) => a - b);

const out = {
  md5: totals.md5,
  md5Ok: totals.md5Ok,
  rooms: totals.rooms,
  missingTerrain: totals.missingTerrain,
  sample: hashed.slice(0, 5),
  physicals: {
    extensions: totals.ext,
    extShort: totals.extShort,
    roads: totals.roads,
    roadsMedian: med(roadsPer),
    roadsMin: roadsPer[0],
    roadsMax: roadsPer[roadsPer.length - 1],
    ramparts: totals.ramparts,
    containers: totals.containers,
    links: totals.links,
    towers: totals.towers,
    labs: totals.labs,
    spawns: totals.spawns,
    extractors: totals.extractors,
    storage: totals.storage,
    terminal: totals.terminal,
    nuker: totals.nuker,
    observer: totals.observer,
    factory: totals.factory,
    powerSpawn: totals.powerSpawn,
    declarations: totals.decls,
    notes: totals.notes,
    noteRecords: totals.noteRecords,
  },
  legality: {
    leaks: totals.leaks,
    leakRooms: totals.leakRooms,
    extractorOutsideBare: totals.extractorOutsideBare,
    shallowEcoBare: totals.shallowEcoBare,
    extNoD4Road: totals.extNoD4Road,
    stackIllegal: totals.stackIllegal,
    onObject: totals.onObject,
    borderIllegal: totals.borderIllegal,
  },
  roadRampart: {
    total: rr.cross + rr.seat + rr.ring + rr.cover + rr.unclass,
    crossing: rr.cross,
    seat: rr.seat,
    ring: rr.ring,
    cover: rr.cover,
    unclassified: rr.unclass,
    rooms: rr.rooms,
    median: med(rr.per),
    max: rr.per.length ? rr.per[rr.per.length - 1] : 0,
  },
  roadKind,
  clumpHist,
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
  mineralWhy: totals.mineralWhy,
  seed: totals.seed,
  fullRun: totals.fullRun,
  ladders: totals.ladders,
  taken: totals.taken,
};

fs.writeFileSync(path.join(DIR, "rederive.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
