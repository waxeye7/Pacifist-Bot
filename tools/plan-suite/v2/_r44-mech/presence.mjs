/**
 * Round-41 fleet-wide remaining META_DARK presence flips + per-name singles.
 * p12 moved stitched/stitchTiles/roadsEaten/towerOnly/stubRoads to derived.
 * p13 moved mineralContainer/minDmgPicked/servedFree to derived; stitched is exact 0/1.
 * p14 moved arrayPartner/rcl5Pair/minDmgArray/battlementGap/battlementGapTiles/
 * boundHeld/fillerTiles/shallowCost/shallowRefused (and boundLap, same commit).
 * p15 moved floorGated/floorOver/floorOverGated/freeDin/massAdds/maxDist/
 * deepReach/stubCap/mineralSeatAtReservation/mineralApproachAtReservation.
 * p16 moved hubDistCap/lapCeilingFloor/corridorPlaced/corridorFallback to derived.
 * p17 moved floorUngated/radii/parkCap/takeTowerSwap to derived (stubCap now
 * the rich/poor pool walk, not the {43,51} enum).
 * p18 moved maxHubDist to derived (layer-6 hub-field max of pre-7b seats)
 * and bound takeTowerSwap.from to a D8 neighbour of to.
 * p19 bound takeTowerSwap.from to the published vacated seat; moved
 * unreachedClusters / unreachableExts / servedExts to derived.
 * p20 moved baseOverGated / wasLap to derived (freeze-cut walk with the
 * extension mass, nuker and observer lifted).
 * p21 bound baseLap to that same freeze-cut gated lap on both
 * misc.mobilityVeto and labs.lapVeto.
 * p22 bound towers.mobilityVeto.baseLap to the layer-2 empty-room lap
 * (same name, different walk — E11S7 7.33 vs freeze-cut 7.67).
 * seedScore is bound separately (not META_DARK). Fleet-zero minus
 * baseCut+shallowNow+all derived. Never writes the artifact.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom } from "../validate.mjs";
import { META_DARK } from "../r27-gates.mjs";
import { loadPlans, loadRooms, makeChecker, realFails } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);

const PRESENCE = Object.entries(META_DARK).filter(([, v]) => v.klass === "presence").map(([k]) => k);
const DERIVED = Object.entries(META_DARK).filter(([, v]) => v.klass === "derived").map(([k]) => k);
const P12_DERIVED = ["stitched", "stitchTiles", "roadsEaten", "towerOnly", "stubRoads"];
const P13_DERIVED = ["mineralContainer", "minDmgPicked", "servedFree"];
const P14_NINE = [
  "arrayPartner",
  "rcl5Pair",
  "minDmgArray",
  "battlementGap",
  "battlementGapTiles",
  "boundHeld",
  "fillerTiles",
  "shallowCost",
  "shallowRefused",
];
const P14_DERIVED = [...P14_NINE, "boundLap"];
const P15_TEN = [
  "floorGated",
  "floorOver",
  "floorOverGated",
  "freeDin",
  "massAdds",
  "maxDist",
  "deepReach",
  "stubCap",
  "mineralSeatAtReservation",
  "mineralApproachAtReservation",
];
const P16_FOUR = ["hubDistCap", "lapCeilingFloor", "corridorPlaced", "corridorFallback"];
const P17_FIVE = ["stubCap", "floorUngated", "radii", "parkCap", "takeTowerSwap"];
const P18_TWO = ["maxHubDist", "takeTowerSwap"];
const P19_FOUR = ["unreachedClusters", "unreachableExts", "servedExts", "takeTowerSwap"];
const P20_TWO = ["baseOverGated", "wasLap"];
const P21_ONE = ["baseLap"];
const NEWLY_DERIVED = [...P12_DERIVED, ...P13_DERIVED, ...P14_DERIVED, ...P15_TEN, ...P16_FOUR, ...P17_FIVE, ...P18_TWO, ...P19_FOUR, ...P20_TWO, ...P21_ONE];

function walkFlip(obj, flipped, skip) {
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

function summarize(label, list) {
  let pass = 0;
  let fail = 0;
  let declared = 0;
  const firstFails = [];
  for (const p of list) {
    if (!p || !p.room || p.error) continue;
    const d = byRoom.get(p.room);
    if (!d) {
      fail++;
      firstFails.push({ room: p.room, fails: ["no terrain"] });
      continue;
    }
    const res = checkRoom(p, d.terrain, d.objects, null);
    const fails = realFails(res);
    declared += res.declared || 0;
    if (fails.length) {
      fail++;
      if (firstFails.length < 16) firstFails.push({ room: p.room, fails: fails.slice(0, 2) });
    } else pass++;
  }
  return { label, pass, fail, declared, firstFails };
}

function grabDeep(p, name) {
  const stack = [p.meta];
  while (stack.length) {
    const o = stack.pop();
    if (!o || typeof o !== "object") continue;
    if (Array.isArray(o)) {
      for (const e of o) stack.push(e);
      continue;
    }
    for (const [k, v] of Object.entries(o)) {
      if (k === name) return { o, k, v };
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return null;
}

function isTruthyLeaf(v) {
  if (typeof v === "number") return v !== 0;
  if (typeof v === "boolean") return v === true;
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === "object") {
    if (Number.isInteger(v.x) && Number.isInteger(v.y)) return true;
    if (v.picked && Number.isInteger(v.picked.x)) return true;
    if (v.to && Number.isInteger(v.to.x)) return true;
  }
  return false;
}

const t0 = Date.now();
const baseline = summarize("baseline", plans);

const mutated = JSON.parse(JSON.stringify(plans));
const flipped = {};
for (const p of mutated) if (p && p.meta) walkFlip(p.meta, flipped, new Set());
const fleet = summarize("presence-zero", mutated);

const mutatedBase = JSON.parse(JSON.stringify(plans));
const flippedBase = {};
for (const p of mutatedBase) if (p && p.meta) walkFlip(p.meta, flippedBase, new Set(["baseCut"]));
const fleetMinusBaseCut = summarize("presence-zero-excl-baseCut", mutatedBase);

const mutated2 = JSON.parse(JSON.stringify(plans));
const flipped2 = {};
for (const p of mutated2) if (p && p.meta) walkFlip(p.meta, flipped2, new Set(["shallowNow", "baseCut"]));
const fleetExcl = summarize("presence-zero-excl-shallowNow-baseCut", mutated2);

const skipP12 = new Set(["shallowNow", "baseCut", ...P12_DERIVED]);
const mutated3 = JSON.parse(JSON.stringify(plans));
const flipped3 = {};
for (const p of mutated3) if (p && p.meta) walkFlip(p.meta, flipped3, skipP12);
const fleetExclP12 = summarize("presence-zero-excl-shallowNow-baseCut-p12", mutated3);

const skipNew = new Set(["shallowNow", "baseCut", ...NEWLY_DERIVED]);
const mutated4 = JSON.parse(JSON.stringify(plans));
const flipped4 = {};
for (const p of mutated4) if (p && p.meta) walkFlip(p.meta, flipped4, skipNew);
const fleetExclNew = summarize("presence-zero-excl-shallowNow-baseCut-newly-derived", mutated4);

const skipAllDerived = new Set(["shallowNow", "baseCut", ...DERIVED]);
const mutated5 = JSON.parse(JSON.stringify(plans));
const flipped5 = {};
for (const p of mutated5) if (p && p.meta) walkFlip(p.meta, flipped5, skipAllDerived);
const fleetExclAllDerived = summarize("presence-zero-excl-shallowNow-baseCut-all-derived", mutated5);

const singles = [];
for (const name of PRESENCE) {
  if (name === "baseCut" || name === "shallowNow") continue;
  const hit = plans.find((p) => {
    const g = grabDeep(p, name);
    return g && isTruthyLeaf(g.v);
  });
  if (!hit) {
    singles.push({ name: "PRESENCE-" + name, room: "-", status: "SKIP", detail: "no truthy leaf" });
    continue;
  }
  const r = run("PRESENCE-" + name + "-flattered", hit.room, (p) => {
    const g = grabDeep(p, name);
    if (!g) return;
    if (typeof g.v === "number") g.o[g.k] = 0;
    else if (typeof g.v === "boolean") g.o[g.k] = false;
    else if (Array.isArray(g.v)) g.o[g.k] = [];
  });
  singles.push(r);
  console.log(String(r.status).padEnd(8), r.name, r.room, String(r.detail || "").slice(0, 180));
}

const derivedSingles = [];
for (const name of NEWLY_DERIVED) {
  const hit = plans.find((p) => {
    if (name === "corridorPlaced") {
      return p.meta?.extensions?.corridorPlaced === 60 && (p.meta?.extensions?.corridorFallback || 0) === 0;
    }
    const g = grabDeep(p, name);
    return g && isTruthyLeaf(g.v);
  });
  if (!hit) {
    derivedSingles.push({ name: "DERIVED-" + name, room: "-", status: "SKIP", detail: "no truthy leaf" });
    continue;
  }
  const r = run("DERIVED-" + name + "-flattered", hit.room, (p) => {
    const g = grabDeep(p, name);
    if (!g) return;
    if (typeof g.v === "number") g.o[g.k] = name === "towerOnly" ? 1 : 0;
    else if (typeof g.v === "boolean") g.o[g.k] = false;
    else if (Array.isArray(g.v)) g.o[g.k] = [];
    else if (g.v && typeof g.v === "object") {
      if (Number.isInteger(g.v.x)) g.o[g.k] = { x: 1, y: 1 };
      else if (g.v.picked && Number.isInteger(g.v.picked.x)) g.v.picked = { x: 1, y: 1 };
      else if (g.v.to && Number.isInteger(g.v.to.x)) g.v.to = { x: 1, y: 1 };
    }
  });
  derivedSingles.push(r);
  console.log(String(r.status).padEnd(8), r.name, r.room, String(r.detail || "").slice(0, 180));
}

const out = {
  presenceNames: PRESENCE,
  derivedNames: DERIVED,
  flipped,
  flippedKinds: Object.keys(flipped).length,
  flippedEvents: Object.values(flipped).reduce((a, b) => a + b, 0),
  flipped2,
  flippedBase,
  baseline,
  fleet,
  fleetMinusBaseCut,
  fleetExcl,
  fleetExclP12,
  fleetExclNew,
  flipped3,
  flipped4,
  p12Derived: P12_DERIVED,
  p13Derived: P13_DERIVED,
  p14Nine: P14_NINE,
  p14Derived: P14_DERIVED,
  p15Ten: P15_TEN,
  p16Four: P16_FOUR,
  p17Five: P17_FIVE,
  p18Two: P18_TWO,
  p19Four: P19_FOUR,
  p20Two: P20_TWO,
  p21One: P21_ONE,
  newlyDerived: NEWLY_DERIVED,
  fleetExclAllDerived,
  flipped5,
  singles,
  derivedSingles,
  singleEscapes: singles.filter((r) => r.status === "ESCAPE").map((r) => r.name),
  singleBites: singles.filter((r) => r.status === "BITES").map((r) => r.name),
  derivedEscapes: derivedSingles.filter((r) => r.status === "ESCAPE").map((r) => r.name),
  derivedBites: derivedSingles.filter((r) => r.status === "BITES").map((r) => r.name),
  ms: Date.now() - t0,
};

fs.writeFileSync(path.join(DIR, "presence.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  presenceN: PRESENCE.length,
  derivedN: DERIVED.length,
  flippedKinds: out.flippedKinds,
  flippedEvents: out.flippedEvents,
  flipped,
  flippedBaseKinds: Object.keys(flippedBase).length,
  flippedBaseEvents: Object.values(flippedBase).reduce((a, b) => a + b, 0),
  baseline,
  fleet,
  fleetMinusBaseCut,
  fleetExcl,
  fleetExclP12,
  fleetExclNew,
  fleetExclAllDerived,
  flipped5Kinds: Object.keys(flipped5).length,
  flipped5Events: Object.values(flipped5).reduce((a, b) => a + b, 0),
  flipped5,
  singleEscapes: out.singleEscapes,
  singleBites: out.singleBites,
  derivedEscapes: out.derivedEscapes,
  derivedBites: out.derivedBites,
  p12StillPresence: P12_DERIVED.filter((n) => PRESENCE.includes(n)),
  p13StillPresence: P13_DERIVED.filter((n) => PRESENCE.includes(n)),
  p14StillPresence: P14_DERIVED.filter((n) => PRESENCE.includes(n)),
  p15StillPresence: P15_TEN.filter((n) => PRESENCE.includes(n)),
  p16StillPresence: P16_FOUR.filter((n) => PRESENCE.includes(n)),
  p17StillPresence: P17_FIVE.filter((n) => PRESENCE.includes(n)),
  p18StillPresence: P18_TWO.filter((n) => PRESENCE.includes(n)),
  p19StillPresence: P19_FOUR.filter((n) => PRESENCE.includes(n)),
  p20StillPresence: P20_TWO.filter((n) => PRESENCE.includes(n)),
  p21StillPresence: P21_ONE.filter((n) => PRESENCE.includes(n)),
  ms: out.ms,
}, null, 2));
