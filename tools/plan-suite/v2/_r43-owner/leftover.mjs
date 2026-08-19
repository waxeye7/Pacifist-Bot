/**
 * r43 leftover: other baseLap copies + wasLap===baseLap + presence skip kinds.
 * Clones only. Does not write the artifact.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { META_DARK } from "../r27-gates.mjs";
import { checkRoomLazy, loadPlans, loadRooms, realFails, makeChecker } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);

function grab(p, pred) {
  const hits = [];
  const stack = [{ o: p.meta, path: "meta" }];
  while (stack.length) {
    const { o, path: pth } = stack.pop();
    if (!o || typeof o !== "object") continue;
    if (Array.isArray(o)) {
      o.forEach((e, i) => stack.push({ o: e, path: `${pth}[${i}]` }));
      continue;
    }
    for (const [k, v] of Object.entries(o)) {
      if (pred(k, v, o, pth)) hits.push({ path: `${pth}.${k}`, v });
      if (v && typeof v === "object") stack.push({ o: v, path: `${pth}.${k}` });
    }
  }
  return hits;
}

const copies = {
  veto: { n: 0, nz: 0, rooms: [], vals: {} },
  labs: { n: 0, nz: 0, rooms: [], vals: {} },
  nuker: { n: 0, nz: 0, rooms: [], vals: {} },
  observer: { n: 0, nz: 0, rooms: [], vals: {} },
  towers: { n: 0, nz: 0, rooms: [], vals: {} },
  repair: { n: 0, nz: 0, rooms: [], vals: {} },
};
const wasEq = { rows: 0, same: 0, differ: 0, miss: [] };
for (const p of plans) {
  const mv = p.meta?.misc?.mobilityVeto;
  if (typeof mv?.baseLap === "number") {
    copies.veto.n++;
    copies.veto.vals[mv.baseLap] = (copies.veto.vals[mv.baseLap] || 0) + 1;
    if (mv.baseLap !== 0) {
      copies.veto.nz++;
      if (copies.veto.rooms.length < 4) copies.veto.rooms.push({ room: p.room, v: mv.baseLap });
    }
  }
  if (typeof p.meta?.labs?.lapVeto?.baseLap === "number") {
    const v = p.meta.labs.lapVeto.baseLap;
    copies.labs.n++;
    copies.labs.vals[v] = (copies.labs.vals[v] || 0) + 1;
    if (v !== 0) {
      copies.labs.nz++;
      if (copies.labs.rooms.length < 4) copies.labs.rooms.push({ room: p.room, v });
    }
  }
  if (typeof mv?.nuker?.baseLap === "number") {
    const v = mv.nuker.baseLap;
    copies.nuker.n++;
    copies.nuker.vals[v] = (copies.nuker.vals[v] || 0) + 1;
    if (v !== 0) {
      copies.nuker.nz++;
      if (copies.nuker.rooms.length < 4) copies.nuker.rooms.push({ room: p.room, v });
    }
  }
  if (typeof mv?.observer?.baseLap === "number") {
    const v = mv.observer.baseLap;
    copies.observer.n++;
    copies.observer.vals[v] = (copies.observer.vals[v] || 0) + 1;
    if (v !== 0) {
      copies.observer.nz++;
      if (copies.observer.rooms.length < 4) copies.observer.rooms.push({ room: p.room, v });
    }
  }
  if (typeof p.meta?.towers?.mobilityVeto?.baseLap === "number") {
    const v = p.meta.towers.mobilityVeto.baseLap;
    copies.towers.n++;
    copies.towers.vals[v] = (copies.towers.vals[v] || 0) + 1;
    if (v !== 0) {
      copies.towers.nz++;
      if (copies.towers.rooms.length < 4) copies.towers.rooms.push({ room: p.room, v });
    }
  }
  if (typeof p.meta?.walls?.mobility?.repair?.tower?.baseLap === "number") {
    const v = p.meta.walls.mobility.repair.tower.baseLap;
    copies.repair.n++;
    copies.repair.vals[v] = (copies.repair.vals[v] || 0) + 1;
    if (v !== 0) {
      copies.repair.nz++;
      if (copies.repair.rooms.length < 4) copies.repair.rooms.push({ room: p.room, v });
    }
  }
  for (const r of mv?.refused || []) {
    if (!r || typeof r.wasLap !== "number") continue;
    wasEq.rows++;
    if (typeof mv.baseLap === "number" && Math.abs(r.wasLap - mv.baseLap) < 1e-9) wasEq.same++;
    else {
      wasEq.differ++;
      if (wasEq.miss.length < 4) wasEq.miss.push({ room: p.room, wasLap: r.wasLap, baseLap: mv?.baseLap });
    }
  }
}

const attacks = [];
async function rec(p) {
  const r = await p;
  attacks.push(r);
  console.log(String(r.status).padEnd(8), r.name, r.room, String(r.first || "").slice(0, 180));
  return r;
}

const nkR = copies.nuker.rooms[0]?.room;
const obR = copies.observer.rooms[0]?.room;
const rpR = copies.repair.rooms[0]?.room;
const twR = copies.towers.rooms[0]?.room;
if (nkR) await rec(run("leftover nuker.baseLap := 0 (nonzero)", nkR, (p) => { p.meta.misc.mobilityVeto.nuker.baseLap = 0; }));
if (obR) await rec(run("leftover observer.baseLap := 0 (nonzero)", obR, (p) => { p.meta.misc.mobilityVeto.observer.baseLap = 0; }));
if (rpR) await rec(run("leftover repair.tower.baseLap := 0 (nonzero)", rpR, (p) => { p.meta.walls.mobility.repair.tower.baseLap = 0; }));
if (twR) await rec(run("leftover towers.baseLap := 0 (nonzero)", twR, (p) => { p.meta.towers.mobilityVeto.baseLap = 0; }));
if (twR && rpR) {
  await rec(run("leftover towers+repair.baseLap := 0 together", twR, (p) => {
    if (p.meta?.towers?.mobilityVeto) p.meta.towers.mobilityVeto.baseLap = 0;
    if (p.meta?.walls?.mobility?.repair?.tower) p.meta.walls.mobility.repair.tower.baseLap = 0;
  }));
}

const PRESENCE = Object.entries(META_DARK).filter(([, v]) => v.klass === "presence").map(([k]) => k);
const DERIVED = Object.entries(META_DARK).filter(([, v]) => v.klass === "derived").map(([k]) => k);
function walkFlip(obj, flipped, skip = new Set()) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) walkFlip(el, flipped, skip);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (PRESENCE.includes(k) && !skip.has(k)) {
      if (typeof v === "number" && v !== 0) {
        obj[k] = 0;
        flipped[k] = (flipped[k] || 0) + 1;
      } else if (typeof v === "boolean" && v === true) {
        obj[k] = false;
        flipped[k] = (flipped[k] || 0) + 1;
      } else if (Array.isArray(v) && v.length) {
        obj[k] = [];
        flipped[k] = (flipped[k] || 0) + 1;
      }
    } else if (v && typeof v === "object") {
      walkFlip(v, flipped, skip);
    }
  }
}

const checkRoom = await checkRoomLazy();
function summarize(label, list) {
  let pass = 0, fail = 0;
  const firstFails = [];
  for (const p of list) {
    const d = byRoom.get(p.room);
    const res = checkRoom(p, d.terrain, d.objects, null);
    const fails = realFails(res);
    if (fails.length) {
      fail++;
      if (firstFails.length < 6) firstFails.push({ room: p.room, fails: fails.slice(0, 2) });
    } else pass++;
  }
  return { label, pass, fail, firstFails };
}

const baseline = summarize("baseline", plans);
const mutA = JSON.parse(JSON.stringify(plans));
const flipA = {};
for (const p of mutA) if (p.meta) walkFlip(p.meta, flipA);
const fleetA = summarize("presence-zero", mutA);
const mutB = JSON.parse(JSON.stringify(plans));
const flipB = {};
for (const p of mutB) if (p.meta) walkFlip(p.meta, flipB, new Set(["baseCut", "shallowNow"]));
const fleetB = summarize("presence-zero-except-baseCut-shallowNow", mutB);

const mutLap = JSON.parse(JSON.stringify(plans));
let lapN = 0, lapPlusN = 0;
for (const p of mutLap) {
  if (typeof p.meta?.misc?.mobilityVeto?.baseLap === "number" && p.meta.misc.mobilityVeto.baseLap !== 0) {
    p.meta.misc.mobilityVeto.baseLap = 0;
    lapN++;
  }
}
const fleetLap = summarize("p21-baseLap-zeroed", mutLap);
const mutPlus = JSON.parse(JSON.stringify(plans));
for (const p of mutPlus) {
  if (typeof p.meta?.misc?.mobilityVeto?.baseLap === "number") {
    p.meta.misc.mobilityVeto.baseLap += 1;
    lapPlusN++;
  }
}
const fleetPlus = summarize("p21-baseLap-plus-1", mutPlus);

const mutCap = JSON.parse(JSON.stringify(plans));
let capEnum = 0;
for (const p of mutCap) {
  if (p.meta?.extensions?.hubDistCap === 16) {
    p.meta.extensions.hubDistCap = 19;
    capEnum++;
  }
}
const fleetCap = summarize("hubDistCap-16-to-19", mutCap);

const mutSeed = JSON.parse(JSON.stringify(plans));
let seedN = 0;
for (const p of mutSeed) {
  if (typeof p.meta?.seedScore === "number" && p.meta.seedScore !== 0) {
    p.meta.seedScore = 0;
    seedN++;
  }
}
const fleetSeed = summarize("seedScore-zeroed", mutSeed);

const mutBog = JSON.parse(JSON.stringify(plans));
let bogN = 0;
for (const p of mutBog) {
  if (typeof p.meta?.misc?.mobilityVeto?.baseOverGated === "number" && p.meta.misc.mobilityVeto.baseOverGated !== 0) {
    p.meta.misc.mobilityVeto.baseOverGated = 0;
    bogN++;
  }
}
const fleetBog = summarize("baseOverGated-zeroed", mutBog);

const mutWas = JSON.parse(JSON.stringify(plans));
let wasN = 0;
for (const p of mutWas) {
  let hit = false;
  for (const r of p.meta?.misc?.mobilityVeto?.refused || []) {
    if (r && typeof r.wasLap === "number" && r.wasLap !== 0) {
      r.wasLap = 0;
      hit = true;
    }
  }
  if (hit) wasN++;
}
const fleetWas = summarize("wasLap-zeroed", mutWas);

const out = {
  presenceN: PRESENCE.length,
  derivedN: DERIVED.length,
  derivedHasBaseLap: DERIVED.includes("baseLap"),
  copies,
  wasEq,
  attacks,
  baseline,
  flipA,
  flipAKinds: Object.keys(flipA).length,
  flipAEvents: Object.values(flipA).reduce((a, b) => a + b, 0),
  fleetA,
  flipB,
  flipBKinds: Object.keys(flipB).length,
  flipBEvents: Object.values(flipB).reduce((a, b) => a + b, 0),
  fleetB,
  lapN,
  fleetLap,
  lapPlusN,
  fleetPlus,
  capEnum,
  fleetCap,
  seedN,
  fleetSeed,
  bogN,
  fleetBog,
  wasN,
  fleetWas,
};
fs.writeFileSync(path.join(DIR, "leftover.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  presenceN: out.presenceN,
  derivedN: out.derivedN,
  derivedHasBaseLap: out.derivedHasBaseLap,
  copies,
  wasEq,
  attacks: attacks.map((a) => ({ name: a.name, status: a.status, first: (a.first || "").slice(0, 160) })),
  baseline: { pass: baseline.pass, fail: baseline.fail, first: baseline.firstFails },
  flipA,
  flipAKinds: out.flipAKinds,
  flipAEvents: out.flipAEvents,
  fleetA: { pass: fleetA.pass, fail: fleetA.fail, first: fleetA.firstFails },
  flipB,
  flipBKinds: out.flipBKinds,
  flipBEvents: out.flipBEvents,
  fleetB: { pass: fleetB.pass, fail: fleetB.fail, first: fleetB.firstFails },
  lapN,
  fleetLap: { pass: fleetLap.pass, fail: fleetLap.fail, first: fleetLap.firstFails },
  lapPlusN,
  fleetPlus: { pass: fleetPlus.pass, fail: fleetPlus.fail, first: fleetPlus.firstFails },
  capEnum,
  fleetCap: { pass: fleetCap.pass, fail: fleetCap.fail },
  seedN,
  fleetSeed: { pass: fleetSeed.pass, fail: fleetSeed.fail, first: fleetSeed.firstFails.slice(0, 2) },
  bogN,
  fleetBog: { pass: fleetBog.pass, fail: fleetBog.fail, first: fleetBog.firstFails },
  wasN,
  fleetWas: { pass: fleetWas.pass, fail: fleetWas.fail, first: fleetWas.firstFails },
}, null, 2));
