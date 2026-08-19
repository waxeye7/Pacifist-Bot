/**
 * Round-31 hostile mutations. In-memory checkRoom only. Never writes the artifact.
 * Does not import validate internals for the facts claimed — only checkRoom on clones.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderDecl } from "../declprose.mjs";
import { renderNote } from "../declprose-notes.mjs";
import { enclosureMobility } from "../layer-shell.mjs";
import { buildable } from "../shared.mjs";
import {
  D8,
  K,
  KT,
  loadPlans,
  loadRooms,
  makeChecker,
  syncLane,
  walkable,
} from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);
const find = (pred) => plans.find((p) => { try { return pred(p); } catch { return false; } });
const any = (pred) => find(pred)?.room || null;

const results = [];
function rec(r) {
  results.push(r);
  console.log(String(r.status).padEnd(8), r.name, r.room, String(r.detail || "").slice(0, 240));
}

function applyBonus(p, bonus, fn) {
  const esc = p.meta.shellEscalation;
  const sf = (p.meta.shortfalls || []).find((s) => s && s.ladder);
  if (esc && Array.isArray(esc.rungs)) {
    for (const row of esc.rungs) if (row && row.needDeepBonus === bonus) fn(row);
  }
  if (sf) {
    for (const row of sf.ladder.rungs) if (row && row.needDeepBonus === bonus) fn(row);
    try { sf.detail = renderDecl(sf); } catch { /* leave */ }
  }
}

function objectKeys(plan) {
  const s = new Set();
  if (plan.sitter) s.add(K(plan.sitter));
  for (const src of plan.sources || []) s.add(K(src));
  if (plan.controller) s.add(K(plan.controller));
  if (plan.mineral) s.add(K(plan.mineral));
  return s;
}

function findD8NeighborExtra(plan, terrain) {
  const L = plan.meta?.extensions?.laneMeta;
  const reserved = (L?.fullRun?.reserved || []).map(String);
  const used = new Set(reserved);
  const obj = objectKeys(plan);
  for (const k of reserved) {
    const [x, y] = k.split(",").map(Number);
    for (const [dx, dy] of D8) {
      const nx = x + dx;
      const ny = y + dy;
      const kk = KT(nx, ny);
      if (used.has(kk) || obj.has(kk)) continue;
      if (!buildable(terrain, nx, ny)) continue;
      return { extra: kk, of: k, x: nx, y: ny };
    }
  }
  return null;
}

function findLastFatNudge(plan, terrain) {
  const esc = plan.meta?.shellEscalation;
  const fat = (esc?.rungs || []).find((r) => r && r.needDeepBonus === 85 && Array.isArray(r.cutTiles) && r.cutTiles.length);
  if (!fat) return null;
  const used = new Set(fat.cutTiles.map(K));
  const freeze = new Set((plan.meta?.shell?.cutAtFreeze || []).map(K));
  for (let i = 0; i < fat.cutTiles.length; i++) {
    const t = fat.cutTiles[i];
    for (const [dx, dy] of D8) {
      const nx = t.x + dx;
      const ny = t.y + dy;
      const k = KT(nx, ny);
      if (nx < 1 || ny < 1 || nx > 48 || ny > 48) continue;
      if (used.has(k) || freeze.has(k)) continue;
      if (!walkable(terrain, nx, ny)) continue;
      const fake = fat.cutTiles.map((q, j) => (j === i ? { x: nx, y: ny } : { x: q.x, y: q.y }));
      const lap = enclosureMobility(terrain, plan, fake);
      if (typeof lap !== "number") continue;
      return {
        fake,
        lap,
        from: K(t),
        to: k,
        n: fake.length,
        origLap: fat.mobility,
        origN: fat.cutTiles.length,
      };
    }
  }
  return null;
}

const rooms = {
  plain: any((p) => {
    const L = p.meta?.extensions?.laneMeta;
    return !!(L && L.fullRun && !L.fullRun.ran && !L.shrunk && !L.dropped && Array.isArray(L.fullRun.reserved));
  }) || "E11S3",
  shrunk: any((p) => p.meta?.extensions?.laneMeta?.shrunk && Array.isArray(p.meta.extensions.laneMeta.fullRun?.reserved)) || "E11S1",
  takenFixed: any((p) => p.meta?.sealedRecovery?.outcome === "taken" && (p.meta.sealedRecovery.fixedHolders || []).length) || "E15S6",
  taken: any((p) => p.meta?.sealedRecovery?.outcome === "taken") || "E11S7",
  seedScore: any((p) => typeof p.meta?.seedScore === "number") || "E11S1",
  seedCoord: any((p) => p.seed && Number.isInteger(p.seed.x)) || "E11S1",
  protect: any((p) => typeof p.meta?.shell?.protectRadius === "number" && p.meta.shell.protectRadius !== 12) || "E11S2",
  baseCutLow: any((p) => typeof p.meta?.shell?.baseCut === "number" && p.meta.shell.baseCut > 1 && p.meta.shell.baseCut < 45) || "E11S1",
  baseCutHigh: any((p) => typeof p.meta?.shell?.baseCut === "number" && p.meta.shell.baseCut > 45) || "E9S5",
  swapPrune: any((p) => {
    const a = (p.meta?.shell?.cutPasses || []).find((m) => m && m.pass === "layer7-inertPrune");
    const b = (p.meta?.shell?.cutPasses || []).find((m) => m && m.pass === "layer7b-inertPrune");
    return !!(a && b && a.rampartsDeleted !== b.rampartsDeleted && a.rampartsDeleted >= (b.removes || 0) && b.rampartsDeleted >= (a.removes || 0));
  }) || "E11S6",
  splitAdj: any((p) => {
    const a = (p.meta?.shell?.cutPasses || []).find((m) => m && m.pass === "layer7-inertPrune");
    const b = (p.meta?.shell?.cutPasses || []).find((m) => m && m.pass === "layer7b-inertPrune");
    return !!(a && b && a.rampartsDeleted + 1 <= a.ramparts && b.rampartsDeleted - 1 >= (b.removes || 0));
  }) || "E11S6",
  prunePass: any((p) => (p.meta?.shell?.cutPasses || []).some((m) => m && m.kind === "inertPrune" && m.rampartsDeleted > 0)) || "E11S6",
  cutPasses: any((p) => (p.meta?.shell?.cutPasses || []).some((m) => m && m.kind === "reconcileSeal" && Number.isInteger(m.sealCritical))) || "E11S1",
  nukerWin: any((p) => typeof p.meta?.towers?.nukeWindow?.nukerInWindow === "boolean") || "E11S1",
  nukeCenter: any((p) => p.meta?.towers?.nukeWindow?.center && Number.isInteger(p.meta.towers.nukeWindow.center.x)) || "E11S1",
  mineralNet: any((p) => Array.isArray(p.meta?.misc?.mineralSeatNetTiles) && p.meta.misc.mineralSeatNetTiles.length) || "E11S2",
  detour: any((p) => p.meta?.walls?.mobility?.coveredDetourDeclared === true) || "E7S5",
  mineral: any((p) => typeof p.meta?.misc?.mineralOffNetworkWhy === "string") || "E11S1",
};

// =====================================================================
// Closed since r30 — expect BITES
// =====================================================================
rec(run("93-plant-recovers-back-on-taken-fixed", rooms.takenFixed, (p) => {
  for (const f of p.meta.sealedRecovery.fixedHolders || []) {
    f.recovers = 2;
    f.recoversDeep = 2;
  }
  for (const nr of p.meta.noteRecords || []) {
    if (nr.cls !== "sealedRecovery" || !nr.rec) continue;
    nr.rec.fixedHolders = JSON.parse(JSON.stringify(p.meta.sealedRecovery.fixedHolders));
    const i = p.meta.noteRecords.indexOf(nr);
    if (i >= 0 && Array.isArray(p.meta.notes)) p.meta.notes[i] = renderNote(nr);
  }
}));

rec(run("98-extra-reserved-99-99", "E11S1", (p) => {
  const L = p.meta.extensions.laneMeta;
  const fr = L.fullRun;
  fr.reserved = [...fr.reserved.map(String), "99,99"];
  fr.byRound[fr.byRound.length - 1].push("99,99");
  fr.tiles = fr.reserved.length;
  L.shrunk.wanted = fr.tiles;
  syncLane(p);
}));

rec(run("98-extra-reserved-1-1", "E11S1", (p) => {
  const L = p.meta.extensions.laneMeta;
  const fr = L.fullRun;
  fr.reserved = [...fr.reserved.map(String), "1,1"];
  fr.byRound[fr.byRound.length - 1].push("1,1");
  fr.tiles = fr.reserved.length;
  L.shrunk.wanted = fr.tiles;
  syncLane(p);
}));

rec(run("98-invent-shrink-fake-round-on-plain", rooms.plain, (p) => {
  const L = p.meta.extensions.laneMeta;
  const fr = L.fullRun;
  const extra = "1,1";
  const reserved = [...(fr.reserved || []).map(String), extra];
  const byRound = [...(fr.byRound || []).map((r) => r.slice()), [extra]];
  const to = L.rounds;
  L.fullRun = {
    ...fr,
    reserved,
    byRound,
    tiles: reserved.length,
    rounds: byRound.length,
    shallow: 2,
    ext: 58,
    ran: true,
    used: byRound.length,
    to,
  };
  L.shrunk = { from: 10, to, wanted: reserved.length, premium: 0 };
  L.roundCap = to;
  L.dropped = false;
  syncLane(p);
}));

rec(run("88-last-fat-shipped-cut-ramparts-to-cutlen", "E11S2", (p) => {
  const d = byRoom.get(p.room);
  const shippedCut = (p.meta.shell.cut || []).map((t) => ({ x: t.x, y: t.y }));
  const pretty = enclosureMobility(d.terrain, p, shippedCut);
  applyBonus(p, 85, (r) => {
    r.cutTiles = shippedCut.map((t) => ({ x: t.x, y: t.y }));
    r.mobility = pretty;
    r.ramparts = shippedCut.length;
  });
}));

rec(run("88-8tile-box-keep-ramparts", "E11S2", (p) => {
  const d = byRoom.get(p.room);
  const sitter = p.sitter;
  const fake = [];
  for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]]) {
    fake.push({ x: sitter.x + dx, y: sitter.y + dy });
  }
  const lap = enclosureMobility(d.terrain, p, fake);
  applyBonus(p, 85, (r) => {
    r.cutTiles = fake.map((t) => ({ ...t }));
    r.mobility = lap;
  });
}));

rec(run("PRESENCE-nukerInWindow-zeroed", rooms.nukerWin, (p) => {
  const nw = p.meta.towers.nukeWindow;
  nw.nukerInWindow = !nw.nukerInWindow;
}));

rec(run("PRESENCE-center-moved", rooms.nukeCenter, (p) => {
  p.meta.towers.nukeWindow.center = { x: 1, y: 1 };
}));

rec(run("PRESENCE-mineralSeatNetTiles-zeroed", rooms.mineralNet, (p) => {
  p.meta.misc.mineralSeatNetTiles = [];
}));

rec(run("PRESENCE-coveredDetourDeclared-zeroed", rooms.detour, (p) => {
  p.meta.walls.mobility.coveredDetourDeclared = false;
}));

// =====================================================================
// 98 — D8-neighbor extra on E11S1 (prefix held)
// =====================================================================
{
  const src = byPlan.get("E11S1");
  const d = byRoom.get("E11S1");
  const hit = src && d ? findD8NeighborExtra(src, d.terrain) : null;
  rec({
    name: "98-d8-neighbor-search",
    room: "E11S1",
    status: "INFO",
    detail: JSON.stringify({
      hit,
      reserved: src?.meta?.extensions?.laneMeta?.fullRun?.reserved,
      lane: src?.meta?.extensions?.laneMeta?.reserved,
      to: src?.meta?.extensions?.laneMeta?.shrunk?.to,
      byRound: (src?.meta?.extensions?.laneMeta?.fullRun?.byRound || []).map((r) => r.length),
    }),
  });
  if (hit) {
    rec(run("98-d8-neighbor-extra-last-round", "E11S1", (p) => {
      const L = p.meta.extensions.laneMeta;
      const fr = L.fullRun;
      fr.reserved = [...fr.reserved.map(String), hit.extra];
      const last = fr.byRound[fr.byRound.length - 1];
      last.push(hit.extra);
      fr.tiles = fr.reserved.length;
      L.shrunk.wanted = fr.tiles;
      syncLane(p);
    }));
    rec(run("98-d8-neighbor-extra-new-trailing-round", "E11S1", (p) => {
      const L = p.meta.extensions.laneMeta;
      const fr = L.fullRun;
      fr.reserved = [...fr.reserved.map(String), hit.extra];
      fr.byRound = [...fr.byRound.map((r) => r.slice()), [hit.extra]];
      fr.rounds = fr.byRound.length;
      fr.used = fr.rounds;
      fr.tiles = fr.reserved.length;
      L.shrunk.wanted = fr.tiles;
      syncLane(p);
    }));
  } else {
    rec({ name: "98-d8-neighbor-extra-last-round", room: "E11S1", status: "SKIP", detail: "no buildable D8 neighbor of reserved" });
    rec({ name: "98-d8-neighbor-extra-new-trailing-round", room: "E11S1", status: "SKIP", detail: "no buildable D8 neighbor of reserved" });
  }
}

// =====================================================================
// 88 — one-tile nudge of E11S2 last fat cut, mobility = own walk
// =====================================================================
{
  const src = byPlan.get("E11S2");
  const d = byRoom.get("E11S2");
  const hit = src && d ? findLastFatNudge(src, d.terrain) : null;
  rec({
    name: "88-last-fat-nudge-search",
    room: "E11S2",
    status: "INFO",
    detail: JSON.stringify(hit && {
      from: hit.from,
      to: hit.to,
      lap: hit.lap,
      origLap: hit.origLap,
      n: hit.n,
      origN: hit.origN,
    }),
  });
  if (hit) {
    rec(run("88-one-tile-nudge-last-fat-own-walk", "E11S2", (p) => {
      applyBonus(p, 85, (r) => {
        r.cutTiles = hit.fake.map((t) => ({ x: t.x, y: t.y }));
        r.mobility = hit.lap;
      });
    }));
  } else {
    rec({ name: "88-one-tile-nudge-last-fat-own-walk", room: "E11S2", status: "SKIP", detail: "no walkable one-tile nudge" });
  }
}

// =====================================================================
// Exact pick / seedScore / cutPasses split
// =====================================================================
rec(run("pick-protectRadius-swapped-inside-enum", rooms.protect, (p) => {
  const r = p.meta.shell.protectRadius;
  p.meta.shell.protectRadius = r === 12 ? 6 : 12;
}));
rec(run("pick-protectRadius-zeroed", rooms.protect, (p) => { p.meta.shell.protectRadius = 0; }));
rec(run("pick-baseCut-zeroed", rooms.baseCutLow, (p) => { p.meta.shell.baseCut = 0; }));
rec(run("pick-baseCut-minus-1-same-side-of-45", rooms.baseCutLow, (p) => { p.meta.shell.baseCut -= 1; }));
rec(run("pick-baseCut-plus-1-same-side-of-45", rooms.baseCutLow, (p) => { p.meta.shell.baseCut += 1; }));
if (rooms.baseCutHigh) {
  rec(run("pick-baseCut-minus-1-pricey-side", rooms.baseCutHigh, (p) => { p.meta.shell.baseCut -= 1; }));
}

rec(run("141e-seedScore-to-0", rooms.seedScore, (p) => { p.meta.seedScore = 0; }));
rec(run("141e-seedScore-plus-999", rooms.seedScore, (p) => { p.meta.seedScore += 999; }));
rec(run("141e-plan-seed-rewritten", rooms.seedCoord, (p) => { p.seed = { x: 1, y: 1 }; }));

rec(run("cutPasses-swap-rampartsDeleted-sum-held", rooms.swapPrune, (p) => {
  const a = p.meta.shell.cutPasses.find((m) => m.pass === "layer7-inertPrune");
  const b = p.meta.shell.cutPasses.find((m) => m.pass === "layer7b-inertPrune");
  const t = a.rampartsDeleted;
  a.rampartsDeleted = b.rampartsDeleted;
  b.rampartsDeleted = t;
}));
rec(run("cutPasses-swap-deleted-and-fix-last-prune-ramparts", rooms.swapPrune, (p) => {
  const a = p.meta.shell.cutPasses.find((m) => m.pass === "layer7-inertPrune");
  const b = p.meta.shell.cutPasses.find((m) => m.pass === "layer7b-inertPrune");
  const t = a.rampartsDeleted;
  a.rampartsDeleted = b.rampartsDeleted;
  b.rampartsDeleted = t;
  b.ramparts = (p.structures.rampart || []).length + b.rampartsDeleted;
}));
rec(run("cutPasses-first-plus-1-last-minus-1-fix-last-ramparts", rooms.splitAdj, (p) => {
  const a = p.meta.shell.cutPasses.find((m) => m.pass === "layer7-inertPrune");
  const b = p.meta.shell.cutPasses.find((m) => m.pass === "layer7b-inertPrune");
  a.rampartsDeleted += 1;
  b.rampartsDeleted -= 1;
  b.ramparts = (p.structures.rampart || []).length + b.rampartsDeleted;
}));
rec(run("cutPasses-last-prune-ramparts-plus-8", rooms.prunePass, (p) => {
  for (const mk of p.meta.shell.cutPasses) if (mk.pass === "layer7b-inertPrune") mk.ramparts += 8;
}));
rec(run("cutPasses-sealCritical-plus-1", rooms.cutPasses, (p) => {
  for (const mk of p.meta.shell.cutPasses) if (Number.isInteger(mk.sealCritical)) mk.sealCritical += 1;
}));

// held-door control
rec(run("MF5-mineral-append", rooms.mineral, (p) => {
  p.meta.misc.mineralOffNetworkWhy += " THE WALL IS FREE.";
}));

fs.writeFileSync(path.join(DIR, "attack.json"), JSON.stringify({ rooms, results }, null, 2));
const bites = results.filter((r) => r.status === "BITES").length;
const escapes = results.filter((r) => r.status === "ESCAPE").length;
const skips = results.filter((r) => r.status === "SKIP" || r.status === "THREW").length;
const infos = results.filter((r) => r.status === "INFO").length;
console.log(JSON.stringify({
  n: results.length,
  bites,
  escapes,
  skips,
  infos,
  escapeNames: results.filter((r) => r.status === "ESCAPE").map((r) => r.name),
  biteNames: results.filter((r) => r.status === "BITES").map((r) => r.name),
  rooms,
}, null, 2));
