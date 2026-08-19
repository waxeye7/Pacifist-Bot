/**
 * Slim r41 fleet: leftover presence counts + p19 named + leftover doors.
 * checkRoom on clones only. Does not write the artifact.
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
      if (firstFails.length < 8) firstFails.push({ room: p.room, fails: fails.slice(0, 2) });
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

const mutatedMaxHub = JSON.parse(JSON.stringify(plans));
let maxHubN = 0;
for (const p of mutatedMaxHub) {
  if (typeof p.meta?.extensions?.maxHubDist === "number" && p.meta.extensions.maxHubDist !== 0) {
    p.meta.extensions.maxHubDist = 0;
    maxHubN++;
  }
}
const fleetMaxHub = await summarize("p18-maxHubDist-zeroed", mutatedMaxHub);

const mutatedFrom = JSON.parse(JSON.stringify(plans));
let fromN = 0;
for (const p of mutatedFrom) {
  if (p.meta?.composeOpts?.takeTowerSwap?.from && Number.isInteger(p.meta.composeOpts.takeTowerSwap.from.x)) {
    p.meta.composeOpts.takeTowerSwap.from = { x: 1, y: 1 };
    fromN++;
  }
}
const fleetFrom = await summarize("p18-takeTowerSwap-from-moved", mutatedFrom);

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

const mutatedUc = JSON.parse(JSON.stringify(plans));
let ucN = 0;
for (const p of mutatedUc) {
  if (typeof p.meta?.walls?.unreachedClusters === "number") {
    p.meta.walls.unreachedClusters += 1;
    ucN++;
  }
}
const fleetUc = await summarize("p19-unreachedClusters-plus-1", mutatedUc);

const mutatedUe = JSON.parse(JSON.stringify(plans));
let ueN = 0;
for (const p of mutatedUe) {
  if (typeof p.meta?.walls?.unreachableExts === "number") {
    p.meta.walls.unreachableExts += 1;
    ueN++;
  }
}
const fleetUe = await summarize("p19-unreachableExts-plus-1", mutatedUe);

const mutatedSe = JSON.parse(JSON.stringify(plans));
let seN = 0;
for (const p of mutatedSe) {
  if (typeof p.meta?.walls?.servedExts === "number") {
    p.meta.walls.servedExts += 1;
    seN++;
  }
}
const fleetSe = await summarize("p19-servedExts-plus-1", mutatedSe);

const mutatedSeFill = JSON.parse(JSON.stringify(plans));
let seFillN = 0;
for (const p of mutatedSeFill) {
  if (typeof p.meta?.walls?.servedExts === "number") {
    p.meta.walls.servedExts += 1;
    if (typeof p.meta.walls.fillerTiles === "number") p.meta.walls.fillerTiles += 1;
    else p.meta.walls.fillerTiles = 1;
    seFillN++;
  }
}
const fleetSeFill = await summarize("p19-servedExts-and-filler-plus-1", mutatedSeFill);

const mutatedCapEnum = JSON.parse(JSON.stringify(plans));
let capEnum = 0;
for (const p of mutatedCapEnum) {
  if (p.meta?.extensions?.hubDistCap === 16) {
    p.meta.extensions.hubDistCap = 19;
    capEnum++;
  }
}
const fleetCapEnum = await summarize("p16-hubDistCap-16-to-19", mutatedCapEnum);

const mutatedCapOff = JSON.parse(JSON.stringify(plans));
let capOff = 0;
for (const p of mutatedCapOff) {
  if (typeof p.meta?.extensions?.hubDistCap === "number") {
    p.meta.extensions.hubDistCap = 17;
    capOff++;
  }
}
const fleetCapOff = await summarize("p16-hubDistCap-17", mutatedCapOff);

const mutatedSeed = JSON.parse(JSON.stringify(plans));
let seedZeroed = 0;
for (const p of mutatedSeed) {
  if (typeof p.meta?.seedScore === "number" && p.meta.seedScore !== 0) {
    p.meta.seedScore = 0;
    seedZeroed++;
  }
}
const fleetSeed = await summarize("seedScore-zeroed", mutatedSeed);

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
  maxHubN,
  fleetMaxHub,
  fromN,
  fleetFrom,
  fromD8n,
  fleetFromD8,
  ucN,
  fleetUc,
  ueN,
  fleetUe,
  seN,
  fleetSe,
  seFillN,
  fleetSeFill,
  capEnum,
  fleetCapEnum,
  capOff,
  fleetCapOff,
  seedZeroed,
  fleetSeed,
  ms: Date.now() - t0,
};
fs.writeFileSync(path.join(DIR, "fleet.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  presenceN: out.presenceN,
  derivedN: out.derivedN,
  derived: DERIVED,
  flippedKinds: out.flippedKinds,
  flippedEvents: out.flippedEvents,
  flipped,
  flipped2Kinds: out.flipped2Kinds,
  flipped2Events: out.flipped2Events,
  flipped2,
  baseline: { pass: baseline.pass, fail: baseline.fail, declared: baseline.declared, first: baseline.firstFails.slice(0, 3) },
  fleet: { pass: fleet.pass, fail: fleet.fail, first: fleet.firstFails.slice(0, 6) },
  fleetSkip: { pass: fleetSkip.pass, fail: fleetSkip.fail, first: fleetSkip.firstFails.slice(0, 6) },
  maxHubN,
  fleetMaxHub: { pass: fleetMaxHub.pass, fail: fleetMaxHub.fail, first: fleetMaxHub.firstFails.slice(0, 3) },
  fromN,
  fleetFrom: { pass: fleetFrom.pass, fail: fleetFrom.fail, first: fleetFrom.firstFails.slice(0, 3) },
  fromD8n,
  fleetFromD8: { pass: fleetFromD8.pass, fail: fleetFromD8.fail, first: fleetFromD8.firstFails.slice(0, 3) },
  ucN,
  fleetUc: { pass: fleetUc.pass, fail: fleetUc.fail, first: fleetUc.firstFails.slice(0, 3) },
  ueN,
  fleetUe: { pass: fleetUe.pass, fail: fleetUe.fail, first: fleetUe.firstFails.slice(0, 3) },
  seN,
  fleetSe: { pass: fleetSe.pass, fail: fleetSe.fail, first: fleetSe.firstFails.slice(0, 3) },
  seFillN,
  fleetSeFill: { pass: fleetSeFill.pass, fail: fleetSeFill.fail, first: fleetSeFill.firstFails.slice(0, 3) },
  capEnum,
  fleetCapEnum: { pass: fleetCapEnum.pass, fail: fleetCapEnum.fail, first: fleetCapEnum.firstFails.slice(0, 3) },
  capOff,
  fleetCapOff: { pass: fleetCapOff.pass, fail: fleetCapOff.fail, first: fleetCapOff.firstFails.slice(0, 3) },
  seedZeroed,
  fleetSeed: { pass: fleetSeed.pass, fail: fleetSeed.fail, first: fleetSeed.firstFails.slice(0, 3) },
  ms: out.ms,
}, null, 2));
