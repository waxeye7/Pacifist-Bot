/**
 * Compose the 98 rooms and print reserved-tile vs shipped-board facts.
 * Does not write the artifact.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { planRoom } from "../pipeline.mjs";
import { planStructureHash } from "../shared.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const rooms = JSON.parse(fs.readFileSync(path.join(DIR, "../_r28-mech/rooms.json"), "utf8"));
const byRoom = new Map(rooms.map((r) => [r.room, r]));
const plans = JSON.parse(fs.readFileSync(path.join(DIR, "../../out-v2/plans-hub.json"), "utf8"));
const names = [
  "E11S1", "E11S2", "E13S3", "E17S6", "E1S6", "E9S3", "E9S4",
  "E12S5", "E13S2", "E19S6", "E2S3", "E2S5", "E3S7", "E7S7", "E8S7", "E9S9",
  "E12S6", "E11S3", "E2S7",
];

const occTypes = [
  "extension", "spawn", "storage", "terminal", "tower", "lab", "link",
  "nuker", "observer", "extractor", "container",
];

const rows = [];
for (const name of names) {
  const d = byRoom.get(name);
  const old = plans.find((p) => p.room === name);
  const t0 = Date.now();
  const fresh = planRoom(d);
  const ms = Date.now() - t0;
  const L = fresh.meta?.extensions?.laneMeta || {};
  const fr = L.fullRun || {};
  const extSet = new Set((fresh.structures?.extension || []).map((t) => `${t.x},${t.y}`));
  const roadSet = new Set((fresh.structures?.road || []).map((t) => `${t.x},${t.y}`));
  const occ = new Set();
  for (const t of occTypes) {
    for (const q of fresh.structures?.[t] || []) occ.add(`${q.x},${q.y}`);
  }
  const prefix = (fr.byRound || []).slice(0, L.shrunk?.to || 0).flat();
  const extras = (fr.reserved || []).filter((k) => !(L.reserved || []).includes(k));
  const classOf = (k) => {
    if (extSet.has(k)) return "ext";
    if (roadSet.has(k)) return "road";
    if (occ.has(k)) return "occ";
    return "empty";
  };
  rows.push({
    room: name,
    ms,
    boardMoved: planStructureHash(old) !== planStructureHash(fresh),
    shrunk: !!L.shrunk,
    dropped: !!L.dropped,
    ran: fr.ran,
    fr: { tiles: fr.tiles, rounds: fr.rounds, ext: fr.ext, shallow: fr.shallow, reserved: (fr.reserved || []).length, byRound: (fr.byRound || []).map((r) => r.length) },
    lane: { tiles: L.tiles, rounds: L.rounds, reserved: (L.reserved || []).length, byRound: (L.byRound || []).map((r) => r.length) },
    prefixEqLane: prefix.slice().sort().join("|") === (L.reserved || []).slice().sort().join("|"),
    extrasN: extras.length,
    extrasClass: extras.reduce((m, k) => ((m[classOf(k)] = (m[classOf(k)] || 0) + 1), m), {}),
    laneClass: (L.reserved || []).reduce((m, k) => ((m[classOf(k)] = (m[classOf(k)] || 0) + 1), m), {}),
    extras: extras,
    laneReserved: L.reserved,
  });
  console.log(name, ms + "ms", "moved=" + (planStructureHash(old) !== planStructureHash(fresh)), JSON.stringify(rows[rows.length - 1].fr), "extras", rows[rows.length - 1].extrasClass);
}
fs.writeFileSync(path.join(DIR, "measure-98-board.json"), JSON.stringify(rows, null, 2));
console.log("wrote", rows.length);
