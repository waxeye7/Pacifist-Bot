/**
 * Presence flip excluding baseCut (the floor that now bites at 0).
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
const SKIP = new Set(["baseCut", "shallowNow"]);

function walkFlip(obj, flipped) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) walkFlip(el, flipped);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (PRESENCE.includes(k) && !SKIP.has(k)) {
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
      walkFlip(v, flipped);
    }
  }
}

const checkRoom = await checkRoomLazy();
const mutated = JSON.parse(JSON.stringify(plans));
const flipped = {};
for (const p of mutated) if (p && p.meta) walkFlip(p.meta, flipped);

let pass = 0, fail = 0;
const firstFails = [];
for (const p of mutated) {
  const d = byRoom.get(p.room);
  const res = checkRoom(p, d.terrain, d.objects, null);
  const fails = realFails(res);
  if (fails.length) {
    fail++;
    if (firstFails.length < 12) firstFails.push({ room: p.room, fails: fails.slice(0, 2) });
  } else pass++;
}

const out = { skip: [...SKIP], flipped, flippedKinds: Object.keys(flipped).length, pass, fail, firstFails };
fs.writeFileSync(path.join(DIR, "presence2.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ skip: out.skip, flippedKinds: out.flippedKinds, flippedEvents: Object.values(flipped).reduce((a, b) => a + b, 0), pass, fail, firstFails }, null, 2));
