/**
 * Follow-up mutations: 98 consistent forge, 93 recovers+note, mineral seat-road,
 * 88 confirm, 134(c) withheld, remaining presence.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderNote } from "../declprose-notes.mjs";
import { enclosureMobility } from "../layer-shell.mjs";
import { loadPlans, loadRooms, makeChecker, K } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);
const results = [];
function rec(r) {
  results.push(r);
  console.log(String(r.status).padEnd(8), r.name, r.room, String(r.detail || "").slice(0, 200));
}

// --- mineral: rewrite the clause that actually exists --------------------
rec(run("MF5-mineral-E11S1-nearest-19-to-1", "E11S1", (p) => {
  p.meta.misc.mineralOffNetworkWhy = p.meta.misc.mineralOffNetworkWhy.replace(
    /nearest road tile this room ships is \d+,\d+, \d+ step\(s\) away/,
    "nearest road tile this room ships is 1,1, 1 step(s) away",
  );
}));
rec(run("MF5-mineral-E2S5-seat-road-clause-rewritten", "E2S5", (p) => {
  p.meta.misc.mineralOffNetworkWhy = p.meta.misc.mineralOffNetworkWhy.replace(
    "the seat tile itself carries a road (a container and a road legally share a square)",
    "the nearest road tile this room ships is 1,1, 99 step(s) away",
  );
}));
rec(run("MF5-mineral-E5S3-seat-road-clause-rewritten", "E5S3", (p) => {
  p.meta.misc.mineralOffNetworkWhy = p.meta.misc.mineralOffNetworkWhy.replace(
    "the seat tile itself carries a road (a container and a road legally share a square)",
    "the nearest road tile this room ships is 1,1, 99 step(s) away",
  );
}));

// --- 88 confirm: dump before/after mobility and force a non-shipped cut --
{
  const p0 = byPlan.get("E11S2");
  const d = byRoom.get("E11S2");
  const shipped = (p0.meta.shell.cut || []).map((t) => ({ x: t.x, y: t.y }));
  const pretty = enclosureMobility(d.terrain, p0, shipped);
  const rungs = (p0.meta.shellEscalation?.rungs || []).map((r) => ({
    bonus: r.needDeepBonus,
    ramparts: r.ramparts,
    mobility: r.mobility,
    cut: (r.cutTiles || []).length,
  }));
  rec({
    name: "88-E11S2-rung-census",
    room: "E11S2",
    status: "INFO",
    detail: JSON.stringify({ pretty, shipped: shipped.length, rungs }),
  });
  rec(run("88-invent-4tile-box-cut-matching-its-own-lap", "E11S2", (p) => {
    const sitter = p.sitter;
    const fake = [];
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]]) {
      fake.push({ x: sitter.x + dx, y: sitter.y + dy });
    }
    const lap = enclosureMobility(d.terrain, p, fake);
    const esc = p.meta.shellEscalation;
    const target = (esc?.rungs || []).find((r) => r && r.needDeepBonus !== esc.pickedNeedDeepBonus && r.mobility > (lap ?? 0));
    if (target && typeof lap === "number") {
      target.cutTiles = fake;
      target.mobility = lap;
      const sf = (p.meta.shortfalls || []).find((s) => s && s.ladder);
      if (sf) {
        const twin = sf.ladder.rungs.find((r) => r.needDeepBonus === target.needDeepBonus);
        if (twin) {
          twin.cutTiles = fake.map((t) => ({ ...t }));
          twin.mobility = lap;
        }
        sf.detail = sf.detail; // leave prose; mobility leaf is the claim
      }
    }
  }));
}

// --- 98: fully consistent forge -----------------------------------------
rec(run("98-consistent-fullRun-plus-shrink", "E11S3", (p) => {
  const L = p.meta.extensions.laneMeta;
  const W = p.meta.walls.mobility.lanes;
  const shrunk = { from: 10, to: 4, wanted: (L.tiles || 3) + 12, premium: 0 };
  const fr = {
    tiles: shrunk.wanted,
    rounds: 10,
    shallow: 2,
    ext: 58,
    builtLap: L.builtLap ?? 0,
    stranded: L.stranded || 0,
    ran: true,
    used: 10,
    to: 4,
  };
  L.fullRun = fr;
  L.shrunk = shrunk;
  L.rounds = 4;
  L.roundCap = 4;
  L.dropped = false;
  // copy every mutated key onto the twin so the two objects agree
  for (const k of Object.keys(L)) W[k] = JSON.parse(JSON.stringify(L[k]));
}));

// try a cheaper consistent invent: shrink TO the rounds the room already ran
rec(run("98-invent-shrink-to-existing-rounds", "E11S3", (p) => {
  const L = p.meta.extensions.laneMeta;
  const W = p.meta.walls.mobility.lanes;
  const to = L.rounds;
  const shrunk = { from: 10, to, wanted: (L.tiles || 0) + 9, premium: 0 };
  const fr = {
    ...(L.fullRun || {}),
    tiles: shrunk.wanted,
    rounds: 10,
    shallow: 1,
    ext: 59,
    ran: true,
    used: 10,
    to,
  };
  L.fullRun = fr;
  L.shrunk = shrunk;
  L.roundCap = to;
  L.dropped = false;
  for (const k of Object.keys(L)) W[k] = JSON.parse(JSON.stringify(L[k]));
}));

// --- 93: inflate recovers on BOTH copies + regen note --------------------
rec(run("93-taken-inflate-recovers-and-regen-note", "E15S6", (p) => {
  const R0 = p.meta.sealedRecovery;
  const cap = (R0.pockets || []).reduce((n, pk) => n + (pk?.tiles || 0), 0);
  for (const f of R0.fixedHolders || []) {
    if (typeof f.recovers === "number" && f.recovers + 1 <= cap) {
      f.recovers += 1;
      if (typeof f.recoversDeep === "number" && f.recoversDeep > f.recovers) f.recoversDeep = f.recovers;
    }
  }
  for (const nr of p.meta.noteRecords || []) {
    if (nr.cls !== "sealedRecovery" || !nr.rec) continue;
    nr.rec.fixedHolders = JSON.parse(JSON.stringify(R0.fixedHolders));
    const i = p.meta.noteRecords.indexOf(nr);
    if (i >= 0 && Array.isArray(p.meta.notes)) p.meta.notes[i] = renderNote(nr);
  }
}));

// --- 134(c): mutate ec[1]/ec[2] withheld --------------------------------
const ecRoom = plans.find((p) => Array.isArray(p.meta?.exteriorContract) && p.meta.exteriorContract.length >= 3);
if (ecRoom) {
  rec(run("134c-ec1-withheld-plus-1", ecRoom.room, (p) => {
    const e = p.meta.exteriorContract[1];
    e.withheld = (e.withheld || 0) + 1;
    if (Array.isArray(e.withheldTiles) && e.withheldTiles.length) {
      e.withheldTiles = [...e.withheldTiles, { x: 1, y: 1 }];
    }
  }));
  rec(run("134c-ec2-withheld-zeroed", ecRoom.room, (p) => {
    const e = p.meta.exteriorContract[2];
    e.withheld = 0;
    e.withheldTiles = [];
  }));
}

// --- 141(e) seedScore / seedSkip flattering -----------------------------
rec(run("141e-seedSkip-zeroed", "E11S1", (p) => {
  p.meta.seedSkip = 0;
}));
rec(run("141e-seedScore-inflated", "E11S1", (p) => {
  p.meta.seedScore = (p.meta.seedScore || 0) + 999;
}));
rec(run("141e-seedPool-halved", "E11S1", (p) => {
  p.meta.seedPool = Math.max(1, Math.floor((p.meta.seedPool || 2) / 2));
}));

// --- remaining presence: more names -------------------------------------
const more = [
  ["fillerTiles", (p) => p.meta?.walls || p.meta?.shell, "fillerTiles"],
  ["servedExts", (p) => p.meta?.walls || p.meta?.extensions, "servedExts"],
  ["corridorFallback", (p) => p.meta?.extensions || p.meta?.walls, "corridorFallback"],
  ["corridorPlaced", (p) => p.meta?.extensions || p.meta?.walls, "corridorPlaced"],
  ["roadsEaten", (p) => p.meta?.labs || p.meta?.misc, "roadsEaten"],
  ["shallowRamparts", (p) => p.meta?.extensions || p.meta?.shell, "shallowRamparts"],
  ["mineralSeatNetTiles", (p) => p.meta?.misc, "mineralSeatNetTiles"],
  ["extractorSeatNetTiles", (p) => p.meta?.misc, "extractorSeatNetTiles"],
  ["faceAndSatHeld", (p) => p.meta?.towers?.towerSwapOffer || p.meta?.towers, "faceAndSatHeld"],
  ["nukerInWindow", (p) => p.meta?.towers || p.meta?.misc, "nukerInWindow"],
];
const find = (pred) => plans.find((p) => { try { return pred(p); } catch { return false; } });
for (const [name, grab, key] of more) {
  const hit = find((p) => {
    const o = grab(p);
    const v = o?.[key];
    if (typeof v === "number") return v > 0;
    if (typeof v === "boolean") return v === true;
    if (Array.isArray(v)) return v.length > 0;
    return false;
  });
  if (!hit) {
    rec({ name: "PRESENCE-" + name, room: "-", status: "SKIP", detail: "no room" });
    continue;
  }
  rec(run("PRESENCE-" + name + "-flattered", hit.room, (p) => {
    const o = grab(p);
    const v = o[key];
    if (typeof v === "number") o[key] = 0;
    else if (typeof v === "boolean") o[key] = false;
    else if (Array.isArray(v)) o[key] = [];
  }));
}

fs.writeFileSync(path.join(DIR, "followup.json"), JSON.stringify(results, null, 2));
const bites = results.filter((r) => r.status === "BITES").length;
const escapes = results.filter((r) => r.status === "ESCAPE").length;
console.log(JSON.stringify({ n: results.length, bites, escapes }, null, 2));
