/**
 * Round-44 extra 98 prefix-bag probes. The suffix is gone; is the kept prefix a walk?
 * Never writes the artifact.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadPlans, loadRooms, makeChecker, syncLane, walkable, K } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);
const results = [];
function rec(r) {
  results.push(r);
  console.log(String(r.status).padEnd(8), r.name, r.room, String(r.detail || "").slice(0, 240));
}

function bothReserved(p, fn) {
  fn(p.meta.extensions.laneMeta);
  syncLane(p);
}

const src = byPlan.get("E11S1");
const d = byRoom.get("E11S1");
const reserved = (src.meta.extensions.laneMeta.fullRun.reserved || []).map(String);
const used = new Set(reserved);
const objects = new Set();
if (src.sitter) objects.add(K(src.sitter));
for (const s of src.sources || []) objects.add(K(s));
if (src.controller) objects.add(K(src.controller));
if (src.mineral) objects.add(K(src.mineral));

function isFreeFloor(k) {
  if (used.has(k) || objects.has(k)) return false;
  const [x, y] = k.split(",").map(Number);
  return walkable(d.terrain, x, y) && x >= 2 && x <= 47 && y >= 2 && y <= 47;
}

const extras = [];
if (isFreeFloor("19,27")) extras.push("19,27");
for (const k of reserved) {
  const [x, y] = k.split(",").map(Number);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nk = `${x + dx},${y + dy}`;
    if (isFreeFloor(nk) && !extras.includes(nk)) extras.push(nk);
  }
}

rec({
  name: "INFO-prefix-neighbors",
  room: "E11S1",
  status: "INFO",
  detail: JSON.stringify({ reserved, extras: extras.slice(0, 8), n: extras.length }),
});

// identity-swap first reserved tile for 19,27 on BOTH lists
rec(run("98-identity-swap-first-reserved-for-19-27-both", "E11S1", (p) => {
  bothReserved(p, (L) => {
    const extra = "19,27";
    const old = String(L.reserved[0]);
    L.reserved = L.reserved.map((k) => (String(k) === old ? extra : String(k)));
    L.fullRun.reserved = L.fullRun.reserved.map((k) => (String(k) === old ? extra : String(k)));
    L.fullRun.byRound = L.fullRun.byRound.map((r) => r.map((k) => (String(k) === old ? extra : String(k))));
  });
}));

// add a SECOND extra neighbor on both (19,27 already one extra in the named attack)
if (extras[1]) {
  rec(run("98-two-d8-neighbors-both-reserved", "E11S1", (p) => {
    bothReserved(p, (L) => {
      const add = extras.slice(0, 2);
      L.reserved = [...L.reserved.map(String), ...add];
      L.fullRun.reserved = [...L.fullRun.reserved.map(String), ...add];
      L.tiles = L.reserved.length;
      L.fullRun.tiles = L.fullRun.reserved.length;
      L.fullRun.byRound = [
        ...L.fullRun.byRound.slice(0, -1).map((r) => r.slice()),
        [...L.fullRun.byRound[L.fullRun.byRound.length - 1].map(String), ...add],
      ];
      if (L.shrunk) L.shrunk.wanted = Math.max(L.shrunk.wanted || 0, L.tiles + 1);
    });
  }));
}

// wanted += 9 (still just a count)
rec(run("98-wanted-plus-9-on-shrink", "E11S1", (p) => {
  bothReserved(p, (L) => { L.shrunk.wanted += 9; });
}));

// wanted := tiles+1 (minimum legal) after bumping from 7
rec(run("98-wanted-set-tiles-plus-1", "E11S1", (p) => {
  bothReserved(p, (L) => { L.shrunk.wanted = L.tiles + 1; });
}));

// dropped room: add D8 neighbor to fullRun.reserved only (should still floor-bind)
const drop = plans.find((p) => p.meta?.extensions?.laneMeta?.dropped === true);
if (drop) {
  const dd = byRoom.get(drop.room);
  const fr = (drop.meta.extensions.laneMeta.fullRun.reserved || []).map(String);
  const usedD = new Set(fr);
  let extraD = null;
  for (const k of fr) {
    const [x, y] = k.split(",").map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nk = `${x + dx},${y + dy}`;
      if (usedD.has(nk)) continue;
      if (!walkable(dd.terrain, ...nk.split(",").map(Number))) continue;
      extraD = nk;
      break;
    }
    if (extraD) break;
  }
  rec({ name: "INFO-dropped-extra", room: drop.room, status: "INFO", detail: extraD || "none" });
  if (extraD) {
    rec(run("98-dropped-d8-extra-fullRun", drop.room, (p) => {
      bothReserved(p, (L) => {
        L.fullRun.reserved = [...L.fullRun.reserved.map(String), extraD];
        L.fullRun.tiles = L.fullRun.reserved.length;
        L.fullRun.byRound = [...L.fullRun.byRound.map((r) => r.slice()), [extraD]];
        L.fullRun.rounds = L.fullRun.byRound.length;
      });
    }));
  }
}

fs.writeFileSync(path.join(DIR, "followup98.json"), JSON.stringify({ extras, results }, null, 2));
console.log(JSON.stringify({
  extras: extras.slice(0, 8),
  escapeNames: results.filter((r) => r.status === "ESCAPE").map((r) => r.name),
  biteNames: results.filter((r) => r.status === "BITES").map((r) => r.name),
}, null, 2));
