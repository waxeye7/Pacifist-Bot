/**
 * Slim r44 fleet: baseline, leftover presence skip, p22 towers walk, expected ESCAPE.
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
  console.log(label, "pass", pass, "fail", fail);
  return { label, pass, fail, firstFails };
}

const t0 = Date.now();
const baseline = summarize("baseline", plans);

const mutAll = JSON.parse(JSON.stringify(plans));
const flipAll = {};
for (const p of mutAll) if (p.meta) walkFlip(p.meta, flipAll);
const fleetAll = summarize("presence-zero", mutAll);

const mutSkip = JSON.parse(JSON.stringify(plans));
const flipSkip = {};
for (const p of mutSkip) if (p.meta) walkFlip(p.meta, flipSkip, new Set(["baseCut", "shallowNow"]));
const fleetSkip = summarize("presence-zero-except-baseCut-shallowNow", mutSkip);

const mutTw0 = JSON.parse(JSON.stringify(plans));
let tw0N = 0;
for (const p of mutTw0) {
  if (typeof p.meta?.towers?.mobilityVeto?.baseLap === "number" && p.meta.towers.mobilityVeto.baseLap !== 0) {
    p.meta.towers.mobilityVeto.baseLap = 0;
    tw0N++;
  }
}
const fleetTw0 = summarize("p22-towers-baseLap-zeroed", mutTw0);

const mutTw1 = JSON.parse(JSON.stringify(plans));
let tw1N = 0;
for (const p of mutTw1) {
  if (typeof p.meta?.towers?.mobilityVeto?.baseLap === "number") {
    p.meta.towers.mobilityVeto.baseLap += 1;
    tw1N++;
  }
}
const fleetTw1 = summarize("p22-towers-baseLap-plus-1", mutTw1);

const mutLap0 = JSON.parse(JSON.stringify(plans));
let lap0N = 0;
for (const p of mutLap0) {
  if (typeof p.meta?.misc?.mobilityVeto?.baseLap === "number" && p.meta.misc.mobilityVeto.baseLap !== 0) {
    p.meta.misc.mobilityVeto.baseLap = 0;
    lap0N++;
  }
}
const fleetLap0 = summarize("p21-baseLap-zeroed", mutLap0);

const mutLap1 = JSON.parse(JSON.stringify(plans));
let lap1N = 0;
for (const p of mutLap1) {
  if (typeof p.meta?.misc?.mobilityVeto?.baseLap === "number") {
    p.meta.misc.mobilityVeto.baseLap += 1;
    lap1N++;
  }
}
const fleetLap1 = summarize("p21-baseLap-plus-1", mutLap1);

const mutCap = JSON.parse(JSON.stringify(plans));
let capEnum = 0;
for (const p of mutCap) {
  if (p.meta?.extensions?.hubDistCap === 16) {
    p.meta.extensions.hubDistCap = 19;
    capEnum++;
  }
}
const fleetCap = summarize("hubDistCap-16-to-19", mutCap);

const out = {
  presenceN: PRESENCE.length,
  derivedN: DERIVED.length,
  derivedHasBaseLap: DERIVED.includes("baseLap"),
  flipAll,
  flipAllKinds: Object.keys(flipAll).length,
  flipAllEvents: Object.values(flipAll).reduce((a, b) => a + b, 0),
  flipSkip,
  flipSkipKinds: Object.keys(flipSkip).length,
  flipSkipEvents: Object.values(flipSkip).reduce((a, b) => a + b, 0),
  baseline,
  fleetAll,
  fleetSkip,
  tw0N,
  fleetTw0,
  tw1N,
  fleetTw1,
  lap0N,
  fleetLap0,
  lap1N,
  fleetLap1,
  capEnum,
  fleetCap,
  ms: Date.now() - t0,
};
fs.writeFileSync(path.join(DIR, "fleet-core.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  presenceN: out.presenceN,
  derivedN: out.derivedN,
  flipAllKinds: out.flipAllKinds,
  flipAllEvents: out.flipAllEvents,
  flipSkipKinds: out.flipSkipKinds,
  flipSkipEvents: out.flipSkipEvents,
  flipSkip,
  baseline: { pass: baseline.pass, fail: baseline.fail, first: baseline.firstFails.slice(0, 2) },
  fleetAll: { pass: fleetAll.pass, fail: fleetAll.fail, first: fleetAll.firstFails.slice(0, 2) },
  fleetSkip: { pass: fleetSkip.pass, fail: fleetSkip.fail, first: fleetSkip.firstFails.slice(0, 2) },
  tw0N,
  fleetTw0: { pass: fleetTw0.pass, fail: fleetTw0.fail, first: fleetTw0.firstFails.slice(0, 2) },
  tw1N,
  fleetTw1: { pass: fleetTw1.pass, fail: fleetTw1.fail, first: fleetTw1.firstFails.slice(0, 2) },
  lap0N,
  fleetLap0: { pass: fleetLap0.pass, fail: fleetLap0.fail, first: fleetLap0.firstFails.slice(0, 2) },
  lap1N,
  fleetLap1: { pass: fleetLap1.pass, fail: fleetLap1.fail, first: fleetLap1.firstFails.slice(0, 2) },
  capEnum,
  fleetCap: { pass: fleetCap.pass, fail: fleetCap.fail },
  ms: out.ms,
}, null, 2));
