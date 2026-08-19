/**
 * Fleet-wide remaining META_DARK presence flips + baseline checkRoom census.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom } from "../validate.mjs";
import { META_DARK } from "../r27-gates.mjs";
import { loadPlans, loadRooms, realFails } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();

const PRESENCE = Object.entries(META_DARK).filter(([, v]) => v.klass === "presence").map(([k]) => k);
const DERIVED = Object.entries(META_DARK).filter(([, v]) => v.klass === "derived").map(([k]) => k);

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
  const phys = { leaks: 0, stack: 0, onObject: 0, shallow: 0, engineReject: 0, extNoRoad: 0 };
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
    for (const k of Object.keys(phys)) phys[k] += res[k] || 0;
    if (fails.length) {
      fail++;
      if (firstFails.length < 16) firstFails.push({ room: p.room, fails: fails.slice(0, 2) });
    } else pass++;
  }
  return { label, pass, fail, declared, phys, firstFails };
}

const t0 = Date.now();
const baseline = summarize("baseline", plans);

const mutated = JSON.parse(JSON.stringify(plans));
const flipped = {};
for (const p of mutated) if (p && p.meta) walkFlip(p.meta, flipped, new Set());
const fleet = summarize("presence-zero", mutated);

const mutated2 = JSON.parse(JSON.stringify(plans));
const flipped2 = {};
for (const p of mutated2) if (p && p.meta) walkFlip(p.meta, flipped2, new Set(["shallowNow", "baseCut"]));
const fleetExcl = summarize("presence-zero-excl-shallowNow-baseCut", mutated2);

const out = {
  presenceNames: PRESENCE,
  derivedNames: DERIVED,
  flipped,
  flippedKinds: Object.keys(flipped).length,
  flippedEvents: Object.values(flipped).reduce((a, b) => a + b, 0),
  flipped2,
  baseline,
  fleet,
  fleetExcl,
  ms: Date.now() - t0,
};

fs.writeFileSync(path.join(DIR, "presence.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  presenceN: PRESENCE.length,
  derivedN: DERIVED.length,
  flippedKinds: out.flippedKinds,
  flippedEvents: out.flippedEvents,
  flipped,
  baseline,
  fleet,
  fleetExcl,
  ms: out.ms,
}, null, 2));
