import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom } from "../validate.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(DIR, "rooms.json");
const clean = JSON.parse(fs.readFileSync(path.resolve(DIR, "../../out-v2/plans-hub.json"), "utf8"));
const dirty = JSON.parse(fs.readFileSync(path.join(DIR, "plans-mf6.json"), "utf8"));
const rooms = JSON.parse(fs.readFileSync(CACHE, "utf8"));
const byR = new Map(rooms.map((r) => [r.room, r]));
const FLEET_RE = /fleetMediansMeasured|eco\.ctrlMedian|eco\.srcMedian|eco\.ctrlGate|eco\.srcGate/;

const fails = [];
for (const p of dirty) {
  if (!p?.room || p.error) continue;
  const d = byR.get(p.room);
  if (!d) continue;
  const res = checkRoom(p, d.terrain, d.objects, null);
  const real = (res.fails || []).filter((f) => !FLEET_RE.test(f));
  if (real.length) fails.push({ room: p.room, n: real.length, first: real[0].slice(0, 220) });
  if (fails.length >= 8) break;
}
console.log(JSON.stringify(fails, null, 2));
console.log("sampled fails", fails.length);
