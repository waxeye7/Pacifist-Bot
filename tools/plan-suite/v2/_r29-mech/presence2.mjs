/**
 * Remaining META_DARK presence flip, excluding names r28 already bounded.
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

const SKIP = new Set([
  "baseCut", // r28 bounded integer >= 1
  "priceyWall", // derived
]);
const PRESENCE = Object.entries(META_DARK)
  .filter(([k, v]) => v.klass === "presence" && !SKIP.has(k))
  .map(([k]) => k);

function walkFlip(obj, flipped) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) walkFlip(el, flipped);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (PRESENCE.includes(k)) {
      if (typeof v === "number" && v !== 0) {
        obj[k] = 0;
        flipped[k] = (flipped[k] || 0) + 1;
      } else if (typeof v === "boolean" && v === true) {
        obj[k] = false;
        flipped[k] = (flipped[k] || 0) + 1;
      }
      // do not empty arrays — that is a schema attack, not a flattering flip
    } else if (v && typeof v === "object") {
      walkFlip(v, flipped);
    }
  }
}

let pass = 0, fail = 0, declared = 0;
const firstFails = [];
const failKinds = {};
const mutated = JSON.parse(JSON.stringify(plans));
const flipped = {};
for (const p of mutated) if (p && p.meta) walkFlip(p.meta, flipped);

for (const p of mutated) {
  if (!p || !p.room || p.error) continue;
  const d = byRoom.get(p.room);
  const res = checkRoom(p, d.terrain, d.objects, null);
  const fails = realFails(res);
  declared += res.declared || 0;
  if (fails.length) {
    fail++;
    for (const f of fails) {
      const tag = f.slice(0, 80);
      failKinds[tag] = (failKinds[tag] || 0) + 1;
    }
    if (firstFails.length < 8) firstFails.push({ room: p.room, fails: fails.slice(0, 2) });
  } else pass++;
}

const out = { presenceN: PRESENCE.length, flipped, flippedKinds: Object.keys(flipped).length, pass, fail, declared, firstFails, failKinds };
fs.writeFileSync(path.join(DIR, "presence2.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  presenceN: PRESENCE.length,
  flippedKinds: out.flippedKinds,
  flippedEvents: Object.values(flipped).reduce((a, b) => a + b, 0),
  flipped,
  pass,
  fail,
  declared,
  firstFails,
  failKinds,
}, null, 2));
