/**
 * Independent fleet census + 134(a/b/d). Terrain + shipped lists only.
 * Does not import validate.mjs. Round 40.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  CUT_DRIFT_WHY,
  D4,
  EXPECTED_MD5,
  K,
  KT,
  depthFromExterior,
  floodExterior,
  isWall,
  loadPlans,
  loadRooms,
  mineralSeat,
  officialMineralWhy,
} from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { md5, plans } = loadPlans();
const { byRoom } = loadRooms();

const CORE = ["storage", "spawn", "terminal", "tower", "lab", "nuker", "observer", "extension"];
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
  leaksLive: [],
  leaksCut: [],
  shallowEcoBare: [],
  extNoD4Road: [],
  stackIllegal: [],
  onObject: [],
  borderIllegal: [],
  freezeTiles: 0,
  freezeLoose: 0,
  freezeLooseRooms: [],
  freezeSealFail: [],
  freezeVsShipDiffRooms: 0,
  adds: 0,
  removes: 0,
  adoptRooms: [],
  remRooms: [],
  driftRooms: [],
  addPass: {},
  remPass: {},
  whyMismatch: [],
  addSealFail: [],
  addSealOk: 0,
  replayFail: [],
  cutLeakSitter: [],
  freezeLeakSitter: [],
  liveLeakSitter: [],
  mineralExact: 0,
  mineralLie: [],
  rr: { cross: 0, seat: 0, ring: 0, cover: 0, unclass: 0, rooms: 0, per: [] },
};

function sealTest(terrain, rampSet, sitter, tileK) {
  if (!rampSet.has(tileK)) return false;
  const less = new Set(rampSet);
  less.delete(tileK);
  const ext = floodExterior(terrain, less);
  return !!ext[sitter.x + sitter.y * 50];
}

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
  const freeze = new Set((sh.cutAtFreeze || []).map(K));
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
    if (cut.has(k)) totals.rr.cross++;
    else if (occ.get(k) === "container") totals.rr.seat++;
    else if (denial.has(k)) totals.rr.ring++;
    else if (occ.has(k)) totals.rr.cover++;
    else totals.rr.unclass++;
  }
  if (roomRR) {
    totals.rr.rooms++;
    totals.rr.per.push(roomRR);
  }

  const sitter = plan.sitter || plan.hub;
  const extCut = floodExterior(d.terrain, cut);
  const extFreeze = floodExterior(d.terrain, freeze);
  const extLive = floodExterior(d.terrain, ramps);
  const si = sitter.x + sitter.y * 50;
  if (extCut[si]) totals.cutLeakSitter.push(plan.room);
  if (extFreeze[si]) totals.freezeLeakSitter.push(plan.room);
  if (extLive[si]) totals.liveLeakSitter.push(plan.room);

  for (const t of CORE) {
    for (const p of s[t] || []) {
      if (extLive[p.x + p.y * 50]) totals.leaksLive.push(`${plan.room}:${t}@${K(p)}`);
      if (extCut[p.x + p.y * 50]) totals.leaksCut.push(`${plan.room}:${t}@${K(p)}`);
    }
  }

  const depthLive = depthFromExterior(extLive);
  for (const e of s.extension || []) {
    const faces = D4.some(([dx, dy]) => roads.has(KT(e.x + dx, e.y + dy)));
    if (!faces) totals.extNoD4Road.push(`${plan.room}:${K(e)}`);
  }
  const ECO = ["container", "link", "storage", "terminal", "spawn", "lab", "nuker", "observer", "extension", "tower"];
  for (const t of ECO) {
    for (const p of s[t] || []) {
      const dep = depthLive[p.x + p.y * 50];
      if (dep < 4 && !ramps.has(K(p))) {
        if (t === "extractor") continue;
        totals.shallowEcoBare.push(`${plan.room}:${t}@${K(p)} d${dep}`);
      }
    }
  }
  const seat = mineralSeat(plan);
  if (seat) {
    const why = plan.meta?.misc?.mineralOffNetworkWhy || "";
    const want = officialMineralWhy(plan, seat);
    if (why === want) totals.mineralExact++;
    else totals.mineralLie.push(plan.room);
  }

  totals.freezeTiles += freeze.size;
  let roomLoose = 0;
  for (const k of freeze) {
    if (!sealTest(d.terrain, freeze, sitter, k)) {
      roomLoose++;
      totals.freezeLoose++;
    }
  }
  if (roomLoose) totals.freezeLooseRooms.push(`${plan.room}:${roomLoose}`);
  if (extFreeze[si]) totals.freezeSealFail.push(plan.room);

  const drift = sh.cutDrift || [];
  let roomAdds = 0;
  let roomRems = 0;
  for (const e of drift) {
    const want = CUT_DRIFT_WHY[`${e.op}|${e.pass}`];
    if (!want || e.why !== want) {
      totals.whyMismatch.push({ room: plan.room, tile: K(e), op: e.op, pass: e.pass });
    }
    if (e.op === "add") {
      totals.adds++;
      roomAdds++;
      totals.addPass[e.pass] = (totals.addPass[e.pass] || 0) + 1;
      if (sealTest(d.terrain, ramps, sitter, K(e))) totals.addSealOk++;
      else totals.addSealFail.push(`${plan.room}:${K(e)}`);
    } else if (e.op === "remove") {
      totals.removes++;
      roomRems++;
      totals.remPass[e.pass] = (totals.remPass[e.pass] || 0) + 1;
    }
  }
  if (roomAdds) totals.adoptRooms.push(plan.room);
  if (roomRems) totals.remRooms.push(plan.room);
  if (roomAdds || roomRems) totals.driftRooms.push(plan.room);
  if (freeze.size !== cut.size || [...freeze].some((k) => !cut.has(k))) totals.freezeVsShipDiffRooms++;

  const replay = new Set(freeze);
  for (const e of drift) {
    if (e.op === "add") replay.add(K(e));
    else if (e.op === "remove") replay.delete(K(e));
  }
  const miss = [...cut].filter((k) => !replay.has(k));
  const extra = [...replay].filter((k) => !cut.has(k));
  if (miss.length || extra.length) totals.replayFail.push({ room: plan.room, miss, extra });

  const tileTypes = new Map();
  for (const t of Object.keys(s)) {
    for (const p of s[t] || []) {
      const k = K(p);
      const arr = tileTypes.get(k) || [];
      arr.push(t);
      tileTypes.set(k, arr);
      if (p.x <= 0 || p.y <= 0 || p.x >= 49 || p.y >= 49) {
        if (t !== "rampart" && t !== "road") totals.borderIllegal.push(`${plan.room}:${t}@${k}`);
      }
      if (isWall(d.terrain, p.x, p.y) && t !== "extractor") {
        totals.onObject.push(`${plan.room}:${t}@${k}:wall`);
      }
    }
  }
  for (const [k, types] of tileTypes) {
    const solid = types.filter((t) => t !== "road" && t !== "rampart" && t !== "container");
    if (solid.length > 1) totals.stackIllegal.push(`${plan.room}:${k}:${solid.join("+")}`);
  }
}

const adoptSet = new Set(totals.adoptRooms);
const remOnly = totals.remRooms.filter((r) => !adoptSet.has(r));

const out = {
  md5: totals.md5,
  md5Ok: totals.md5Ok,
  rooms: totals.rooms,
  missingTerrain: totals.missingTerrain,
  physicals: {
    ext: totals.ext,
    extShort: totals.extShort,
    roads: totals.roads,
    ramparts: totals.ramparts,
    decls: totals.decls,
    notes: totals.notes,
    noteRecords: totals.noteRecords,
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
  },
  legality: {
    leaksLiveN: totals.leaksLive.length,
    leaksLive: totals.leaksLive.slice(0, 20),
    leaksCutN: totals.leaksCut.length,
    shallowEcoBareN: totals.shallowEcoBare.length,
    shallowEcoBare: totals.shallowEcoBare.slice(0, 20),
    extNoD4RoadN: totals.extNoD4Road.length,
    extNoD4Road: totals.extNoD4Road.slice(0, 20),
    stackIllegal: totals.stackIllegal,
    onObject: totals.onObject.slice(0, 20),
    borderIllegal: totals.borderIllegal.slice(0, 20),
    cutLeakSitter: totals.cutLeakSitter,
    freezeLeakSitter: totals.freezeLeakSitter,
    liveLeakSitter: totals.liveLeakSitter,
  },
  mineral: { exact: totals.mineralExact, lie: totals.mineralLie },
  rr: {
    cross: totals.rr.cross,
    seat: totals.rr.seat,
    ring: totals.rr.ring,
    cover: totals.rr.cover,
    unclass: totals.rr.unclass,
    rooms: totals.rr.rooms,
    sum: totals.rr.cross + totals.rr.seat + totals.rr.ring + totals.rr.cover + totals.rr.unclass,
    median: (() => {
      const a = totals.rr.per.slice().sort((x, y) => x - y);
      return a.length ? a[(a.length / 2) | 0] : 0;
    })(),
    max: totals.rr.per.length ? Math.max(...totals.rr.per) : 0,
  },
  freeze: {
    tiles: totals.freezeTiles,
    loose: totals.freezeLoose,
    looseRooms: totals.freezeLooseRooms,
    sealFail: totals.freezeSealFail,
    vsShipDiffRooms: totals.freezeVsShipDiffRooms,
  },
  drift: {
    adds: totals.adds,
    removes: totals.removes,
    adoptN: totals.adoptRooms.length,
    remN: totals.remRooms.length,
    driftN: totals.driftRooms.length,
    adoptRooms: totals.adoptRooms.slice().sort(),
    remOnly,
    addPass: totals.addPass,
    remPass: totals.remPass,
    whyMismatchN: totals.whyMismatch.length,
    whyMismatch: totals.whyMismatch.slice(0, 8),
    addSealOk: totals.addSealOk,
    addSealFail: totals.addSealFail,
    replayFailN: totals.replayFail.length,
    replayFail: totals.replayFail,
  },
};

fs.writeFileSync(path.join(DIR, "census.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  md5: out.md5,
  md5Ok: out.md5Ok,
  rooms: out.rooms,
  physicals: out.physicals,
  legality: {
    leaksLiveN: out.legality.leaksLiveN,
    leaksCutN: out.legality.leaksCutN,
    shallowEcoBareN: out.legality.shallowEcoBareN,
    extNoD4RoadN: out.legality.extNoD4RoadN,
    stack: out.legality.stackIllegal.length,
    cutLeakSitter: out.legality.cutLeakSitter,
    freezeLeakSitter: out.legality.freezeLeakSitter,
    liveLeakSitter: out.legality.liveLeakSitter,
  },
  mineral: out.mineral,
  rr: out.rr,
  freeze: out.freeze,
  drift: {
    adds: out.drift.adds,
    removes: out.drift.removes,
    adoptN: out.drift.adoptN,
    remN: out.drift.remN,
    driftN: out.drift.driftN,
    remOnly: out.drift.remOnly,
    addPass: out.drift.addPass,
    remPass: out.drift.remPass,
    whyMismatchN: out.drift.whyMismatchN,
    addSealOk: out.drift.addSealOk,
    addSealFail: out.drift.addSealFail,
    replayFailN: out.drift.replayFailN,
    adoptRooms: out.drift.adoptRooms,
  },
}, null, 2));
