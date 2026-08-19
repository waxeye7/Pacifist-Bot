/**
 * Slim r43 fleet: baseline + leftover presence skip + p21/p20 named + leftover doors.
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
      if (firstFails.length < 6) firstFails.push({ room: p.room, fails: fails.slice(0, 2) });
    } else pass++;
  }
  return { label, pass, fail, declared, firstFails };
}

const t0 = Date.now();
const baseline = await summarize("baseline", plans);

const mutated = JSON.parse(JSON.stringify(plans));
const flipped = {};
for (const p of mutated) if (p.meta) walkFlip(p.meta, flipped);
const fleet = await summarize("presence-zero", mutated);

const mutated2 = JSON.parse(JSON.stringify(plans));
const flipped2 = {};
for (const p of mutated2) if (p.meta) walkFlip(p.meta, flipped2, new Set(["baseCut", "shallowNow"]));
const fleetSkip = await summarize("presence-zero-except-baseCut-shallowNow", mutated2);

const mutatedBog = JSON.parse(JSON.stringify(plans));
let bogN = 0;
for (const p of mutatedBog) {
  if (typeof p.meta?.misc?.mobilityVeto?.baseOverGated === "number" && p.meta.misc.mobilityVeto.baseOverGated !== 0) {
    p.meta.misc.mobilityVeto.baseOverGated = 0;
    bogN++;
  }
}
const fleetBog = await summarize("p20-baseOverGated-zeroed", mutatedBog);

const mutatedWas = JSON.parse(JSON.stringify(plans));
let wasN = 0;
for (const p of mutatedWas) {
  let hit = false;
  for (const r of p.meta?.misc?.mobilityVeto?.refused || []) {
    if (r && typeof r.wasLap === "number" && r.wasLap !== 0) {
      r.wasLap = 0;
      hit = true;
    }
  }
  if (hit) wasN++;
}
const fleetWas = await summarize("p20-wasLap-zeroed", mutatedWas);

const mutatedLap = JSON.parse(JSON.stringify(plans));
let lapN = 0;
for (const p of mutatedLap) {
  if (typeof p.meta?.misc?.mobilityVeto?.baseLap === "number" && p.meta.misc.mobilityVeto.baseLap !== 0) {
    p.meta.misc.mobilityVeto.baseLap = 0;
    lapN++;
  }
}
const fleetLap = await summarize("p21-baseLap-zeroed", mutatedLap);

const mutatedLapPlus = JSON.parse(JSON.stringify(plans));
let lapPlusN = 0;
for (const p of mutatedLapPlus) {
  if (typeof p.meta?.misc?.mobilityVeto?.baseLap === "number") {
    p.meta.misc.mobilityVeto.baseLap += 1;
    lapPlusN++;
  }
}
const fleetLapPlus = await summarize("p21-baseLap-plus-1", mutatedLapPlus);

const mutatedCapEnum = JSON.parse(JSON.stringify(plans));
let capEnum = 0;
for (const p of mutatedCapEnum) {
  if (p.meta?.extensions?.hubDistCap === 16) {
    p.meta.extensions.hubDistCap = 19;
    capEnum++;
  }
}
const fleetCapEnum = await summarize("p16-hubDistCap-16-to-19", mutatedCapEnum);

const mutatedSeed = JSON.parse(JSON.stringify(plans));
let seedZeroed = 0;
for (const p of mutatedSeed) {
  if (typeof p.meta?.seedScore === "number" && p.meta.seedScore !== 0) {
    p.meta.seedScore = 0;
    seedZeroed++;
  }
}
const fleetSeed = await summarize("seedScore-zeroed", mutatedSeed);

const mutatedFromD8 = JSON.parse(JSON.stringify(plans));
let fromD8n = 0;
for (const p of mutatedFromD8) {
  const sw = p.meta?.composeOpts?.takeTowerSwap;
  if (!sw?.from || !sw?.to || !Number.isInteger(sw.from.x)) continue;
  const towers = new Set((p.structures?.tower || []).map((t) => `${t.x},${t.y}`));
  const alt = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    .map(([dx, dy]) => ({ x: sw.to.x + dx, y: sw.to.y + dy }))
    .find((t) => (t.x !== sw.from.x || t.y !== sw.from.y) && !towers.has(`${t.x},${t.y}`));
  if (alt) {
    sw.from = alt;
    fromD8n++;
  }
}
const fleetFromD8 = await summarize("p19-takeTowerSwap-from-other-D8", mutatedFromD8);

const out = {
  presenceN: PRESENCE.length,
  derivedN: DERIVED.length,
  presence: PRESENCE,
  derived: DERIVED,
  flipped,
  flippedKinds: Object.keys(flipped).length,
  flippedEvents: Object.values(flipped).reduce((a, b) => a + b, 0),
  flipped2,
  flipped2Kinds: Object.keys(flipped2).length,
  flipped2Events: Object.values(flipped2).reduce((a, b) => a + b, 0),
  baseline,
  fleet,
  fleetSkip,
  bogN,
  fleetBog,
  wasN,
  fleetWas,
  lapN,
  fleetLap,
  lapPlusN,
  fleetLapPlus,
  capEnum,
  fleetCapEnum,
  seedZeroed,
  fleetSeed,
  fromD8n,
  fleetFromD8,
  ms: Date.now() - t0,
};
fs.writeFileSync(path.join(DIR, "slim-fleet.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  presenceN: out.presenceN,
  derivedN: out.derivedN,
  flippedKinds: out.flippedKinds,
  flippedEvents: out.flippedEvents,
  flipped,
  flipped2Kinds: out.flipped2Kinds,
  flipped2Events: out.flipped2Events,
  flipped2,
  baseline: { pass: baseline.pass, fail: baseline.fail, declared: baseline.declared, first: baseline.firstFails },
  fleet: { pass: fleet.pass, fail: fleet.fail, first: fleet.firstFails },
  fleetSkip: { pass: fleetSkip.pass, fail: fleetSkip.fail, first: fleetSkip.firstFails },
  bogN,
  fleetBog: { pass: fleetBog.pass, fail: fleetBog.fail, first: fleetBog.firstFails },
  wasN,
  fleetWas: { pass: fleetWas.pass, fail: fleetWas.fail, first: fleetWas.firstFails },
  lapN,
  fleetLap: { pass: fleetLap.pass, fail: fleetLap.fail, first: fleetLap.firstFails },
  lapPlusN,
  fleetLapPlus: { pass: fleetLapPlus.pass, fail: fleetLapPlus.fail, first: fleetLapPlus.firstFails },
  capEnum,
  fleetCapEnum: { pass: fleetCapEnum.pass, fail: fleetCapEnum.fail },
  seedZeroed,
  fleetSeed: { pass: fleetSeed.pass, fail: fleetSeed.fail, first: fleetSeed.firstFails.slice(0, 3) },
  fromD8n,
  fleetFromD8: { pass: fleetFromD8.pass, fail: fleetFromD8.fail, first: fleetFromD8.firstFails },
  ms: out.ms,
}, null, 2));
