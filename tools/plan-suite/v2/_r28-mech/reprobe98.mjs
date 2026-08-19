import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom } from "../validate.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.resolve(DIR, "../../out-v2/plans-hub.json"), "utf8")).filter((p) => p?.room && !p.error);
const rooms = JSON.parse(fs.readFileSync(path.join(DIR, "rooms.json"), "utf8"));
const p0 = plans.find((p) => p.room === "E11S3");
const d = rooms.find((r) => r.room === "E11S3");
const p = JSON.parse(JSON.stringify(p0));
const a = p.meta.walls.mobility.lanes;
const b = p.meta.extensions.laneMeta;
const rounds = a.rounds ?? b.rounds ?? 10;
const shrunk = { from: 10, to: rounds, wanted: 12, premium: 0 };
if (a) { a.shrunk = shrunk; a.roundCap = rounds; }
if (b) { b.shrunk = { ...shrunk }; b.roundCap = rounds; }
const FLEET_RE = /fleetMediansMeasured|eco\.ctrlMedian|eco\.srcMedian|eco\.ctrlGate|eco\.srcGate/;
const res = checkRoom(p, d.terrain, d.objects, null);
const fails = (res.fails || []).filter((f) => !FLEET_RE.test(f));
console.log(fails.length ? "BITES" : "ESCAPE", fails[0] ? fails[0].slice(0, 250) : "pass");
console.log("lanes.roundCap", a?.roundCap, "laneMeta.roundCap", b?.roundCap, "sameObj", a === b);
