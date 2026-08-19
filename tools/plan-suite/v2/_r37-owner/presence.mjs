/**
 * Fleet-wide remaining META_DARK presence flips.
 * checkRoom only. Does not write the artifact. Round 37.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { META_DARK } from "../r27-gates.mjs";
import { checkRoomLazy, loadPlans, loadRooms, realFails } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();

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

async function summarize(label, list) {
  const checkRoom = await checkRoomLazy();
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

const t0 = Date.now();
const checkRoom = await checkRoomLazy();
void checkRoom;

const baseline = await summarize("baseline", plans);

const mutated = JSON.parse(JSON.stringify(plans));
const flipped = {};
for (const p of mutated) if (p && p.meta) walkFlip(p.meta, flipped);
const fleet = await summarize("presence-zero", mutated);

const mutated2 = JSON.parse(JSON.stringify(plans));
const flipped2 = {};
for (const p of mutated2) if (p && p.meta) walkFlip(p.meta, flipped2, new Set(["baseCut", "shallowNow"]));
const fleetSkip = await summarize("presence-zero-except-baseCut-shallowNow", mutated2);

const P12 = ["stitched", "stitchTiles", "roadsEaten", "towerOnly", "stubRoads"];
function walkZeroNames(obj, names, flipped) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) walkZeroNames(el, names, flipped);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (names.includes(k)) {
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
      walkZeroNames(v, names, flipped);
    }
  }
}
const mutatedP12 = JSON.parse(JSON.stringify(plans));
const flippedP12 = {};
for (const p of mutatedP12) if (p && p.meta) walkZeroNames(p.meta, P12, flippedP12);
const fleetP12 = await summarize("p12-five-zeroed", mutatedP12);

const P13 = ["mineralContainer", "minDmgPicked", "servedFree"];
const mutatedP13 = JSON.parse(JSON.stringify(plans));
const flippedP13 = {};
for (const p of mutatedP13) if (p && p.meta) walkZeroNames(p.meta, P13, flippedP13);
const fleetP13 = await summarize("p13-three-zeroed", mutatedP13);

function walkSetStitched2(obj, flipped) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) walkSetStitched2(el, flipped);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "stitched" && typeof v === "number" && v !== 2) {
      obj[k] = 2;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (v && typeof v === "object") {
      walkSetStitched2(v, flipped);
    }
  }
}
const mutatedSt2 = JSON.parse(JSON.stringify(plans));
const flippedSt2 = {};
for (const p of mutatedSt2) if (p && p.meta) walkSetStitched2(p.meta, flippedSt2);
const fleetSt2 = await summarize("p13-stitched-set-2", mutatedSt2);

const P14 = [
  "arrayPartner",
  "picked",
  "minDmgArray",
  "battlementGap",
  "battlementGapTiles",
  "boundHeld",
  "boundLap",
  "fillerTiles",
  "shallowCost",
  "shallowRefused",
];
function walkP14(obj, flipped) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) walkP14(el, flipped);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "arrayPartner" && v && typeof v === "object" && Number.isInteger(v.x)) {
      obj[k] = { x: 1, y: 1 };
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "picked" && v && typeof v === "object" && Number.isInteger(v.x) && obj.minDmgPicked != null) {
      obj[k] = { x: 1, y: 1 };
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "minDmgArray" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "battlementGap" && typeof v === "number" && v === 0) {
      obj[k] = 1;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "battlementGapTiles" && Array.isArray(v)) {
      obj[k] = [{ x: 1, y: 1 }];
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "boundHeld" && v === true) {
      obj[k] = false;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "boundLap" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "fillerTiles" && typeof v === "number" && v !== 1) {
      obj[k] = 1;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "shallowCost" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "shallowRefused" && Array.isArray(v) && v.length) {
      obj[k] = [];
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (v && typeof v === "object") {
      walkP14(v, flipped);
    }
  }
}
const mutatedP14 = JSON.parse(JSON.stringify(plans));
const flippedP14 = {};
for (const p of mutatedP14) if (p && p.meta) walkP14(p.meta, flippedP14);
const fleetP14 = await summarize("p14-named-forged", mutatedP14);

const P15 = [
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
function walkP15(obj, flipped) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) walkP15(el, flipped);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "floorGated" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "floorOver" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "floorOverGated" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "freeDin" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "massAdds" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "maxDist" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "deepReach" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "stubCap" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "mineralSeatAtReservation" && v && typeof v === "object" && Number.isInteger(v.x)) {
      obj[k] = { x: 1, y: 1 };
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "mineralApproachAtReservation" && v && typeof v === "object" && Number.isInteger(v.x)) {
      obj[k] = { x: 1, y: 1 };
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (v && typeof v === "object") {
      walkP15(v, flipped);
    }
  }
}
const mutatedP15 = JSON.parse(JSON.stringify(plans));
const flippedP15 = {};
for (const p of mutatedP15) if (p && p.meta) walkP15(p.meta, flippedP15);
const fleetP15 = await summarize("p15-named-forged", mutatedP15);

const mutatedSeed = JSON.parse(JSON.stringify(plans));
let seedZeroed = 0;
for (const p of mutatedSeed) {
  if (p && typeof p.meta?.seedScore === "number" && p.meta.seedScore !== 0) {
    p.meta.seedScore = 0;
    seedZeroed++;
  }
}
const fleetSeed = await summarize("seedScore-zeroed", mutatedSeed);

const out = {
  presenceNames: PRESENCE,
  derivedNames: DERIVED,
  flipped,
  flippedKinds: Object.keys(flipped).length,
  flippedEvents: Object.values(flipped).reduce((a, b) => a + b, 0),
  flipped2,
  flipped2Kinds: Object.keys(flipped2).length,
  flipped2Events: Object.values(flipped2).reduce((a, b) => a + b, 0),
  baseline,
  fleet,
  fleetSkip,
  flippedP12,
  fleetP12,
  flippedP13,
  fleetP13,
  flippedSt2,
  fleetSt2,
  flippedP14,
  fleetP14,
  p14Names: P14,
  flippedP15,
  fleetP15,
  p15Names: P15,
  seedZeroed,
  fleetSeed,
  ms: Date.now() - t0,
};
fs.writeFileSync(path.join(DIR, "presence.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  presenceN: PRESENCE.length,
  derivedN: DERIVED.length,
  derived: DERIVED,
  flippedKinds: out.flippedKinds,
  flippedEvents: out.flippedEvents,
  flipped,
  flipped2Kinds: out.flipped2Kinds,
  flipped2Events: out.flipped2Events,
  flipped2,
  baseline: { pass: baseline.pass, fail: baseline.fail, declared: baseline.declared, first: baseline.firstFails.slice(0, 4) },
  fleet: { pass: fleet.pass, fail: fleet.fail, first: fleet.firstFails.slice(0, 8) },
  fleetSkip: { pass: fleetSkip.pass, fail: fleetSkip.fail, first: fleetSkip.firstFails.slice(0, 8) },
  flippedP12,
  fleetP12: { pass: fleetP12.pass, fail: fleetP12.fail, first: fleetP12.firstFails.slice(0, 8) },
  flippedP13,
  fleetP13: { pass: fleetP13.pass, fail: fleetP13.fail, first: fleetP13.firstFails.slice(0, 8) },
  flippedSt2,
  fleetSt2: { pass: fleetSt2.pass, fail: fleetSt2.fail, first: fleetSt2.firstFails.slice(0, 8) },
  flippedP14,
  fleetP14: { pass: fleetP14.pass, fail: fleetP14.fail, first: fleetP14.firstFails.slice(0, 8) },
  flippedP15,
  fleetP15: { pass: fleetP15.pass, fail: fleetP15.fail, first: fleetP15.firstFails.slice(0, 8) },
  seedZeroed,
  fleetSeed: { pass: fleetSeed.pass, fail: fleetSeed.fail, first: fleetSeed.firstFails.slice(0, 8) },
  ms: out.ms,
}, null, 2));
