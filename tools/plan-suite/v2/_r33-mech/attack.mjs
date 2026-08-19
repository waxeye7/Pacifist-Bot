/**
 * Round-33 hostile mutations. In-memory checkRoom only. Never writes the artifact.
 * Named re-probes: 88 leaky+complete=false (r29p11), 98 19,27 one copy;
 * ESCAPE class: 98 both-lists, wanted+=1, 88 29,33→28,34, seedScore, protectRadius enum.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderDecl } from "../declprose.mjs";
import { renderNote } from "../declprose-notes.mjs";
import { enclosureMobility } from "../layer-shell.mjs";
import { exteriorFlood, key } from "../shared.mjs";
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
  console.log(String(r.status).padEnd(8), r.name, r.room, String(r.detail || "").slice(0, 260));
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

function lastFat(plan) {
  const shipped = (plan.structures?.rampart || []).length;
  const esc = plan.meta?.shellEscalation;
  const fromEsc = (esc?.rungs || []).filter((r) => r && r.ramparts > shipped);
  if (fromEsc.length) return fromEsc[fromEsc.length - 1];
  const sf = (plan.meta?.shortfalls || []).find((s) => s && s.ladder);
  const fromSf = (sf?.ladder?.rungs || []).filter((r) => r && r.ramparts > shipped);
  return fromSf[fromSf.length - 1] || null;
}

function nudgeCut(plan, terrain, from, to) {
  const fat = lastFat(plan);
  if (!fat || !Array.isArray(fat.cutTiles)) return null;
  const has = fat.cutTiles.some((t) => t.x === from.x && t.y === from.y);
  if (!has) return null;
  const fake = fat.cutTiles.map((t) =>
    t.x === from.x && t.y === from.y ? { x: to.x, y: to.y } : { x: t.x, y: t.y },
  );
  const lap = enclosureMobility(terrain, plan, fake);
  const ext = exteriorFlood(terrain, new Set(fake.map((t) => key(t.x, t.y))));
  const leakSit = !!(plan.sitter && ext[plan.sitter.x + plan.sitter.y * 50]);
  return { fake, lap, leakSit, bonus: fat.needDeepBonus, n: fake.length, origLap: fat.mobility, origN: fat.cutTiles.length };
}

const rooms = {
  plain: any((p) => {
    const L = p.meta?.extensions?.laneMeta;
    return !!(L && L.fullRun && !L.fullRun.ran && !L.shrunk && !L.dropped && Array.isArray(L.fullRun.reserved));
  }) || "E11S3",
  shrunk: any((p) => p.meta?.extensions?.laneMeta?.shrunk && Array.isArray(p.meta.extensions.laneMeta.fullRun?.reserved)) || "E11S1",
  dropped: any((p) => p.meta?.extensions?.laneMeta?.dropped === true) || "E12S5",
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

// ---- board dump: E11S1 reserved / E11S2 last fat ----
{
  const p = byPlan.get("E11S1");
  const L = p?.meta?.extensions?.laneMeta;
  rec({
    name: "INFO-E11S1-reserved",
    room: "E11S1",
    status: "INFO",
    detail: JSON.stringify({
      reserved: L?.fullRun?.reserved,
      lane: L?.reserved,
      tiles: L?.tiles,
      frTiles: L?.fullRun?.tiles,
      byRound: (L?.fullRun?.byRound || []).map((r) => r.slice()),
      shrunk: L?.shrunk,
      ran: L?.fullRun?.ran,
      ext: L?.fullRun?.ext,
      shallow: L?.fullRun?.shallow,
    }),
  });
}
{
  const p = byPlan.get("E11S2");
  const fat = p ? lastFat(p) : null;
  rec({
    name: "INFO-E11S2-last-fat",
    room: "E11S2",
    status: "INFO",
    detail: JSON.stringify(fat && {
      bonus: fat.needDeepBonus,
      ramparts: fat.ramparts,
      mobility: fat.mobility,
      complete: fat.complete,
      n: (fat.cutTiles || []).length,
      has209: (fat.cutTiles || []).some((t) => t.x === 20 && t.y === 9),
      has2933: (fat.cutTiles || []).some((t) => t.x === 29 && t.y === 33),
      shippedR: (p.structures?.rampart || []).length,
      cut: (p.meta?.shell?.cut || []).length,
    }),
  });
}

// =====================================================================
// Closed named attacks — expect BITES
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
  if (L.shrunk) L.shrunk.wanted = Math.max(L.shrunk.wanted || 0, fr.tiles + 1);
  syncLane(p);
}));

rec(run("98-extra-reserved-1-1", "E11S1", (p) => {
  const L = p.meta.extensions.laneMeta;
  const fr = L.fullRun;
  fr.reserved = [...fr.reserved.map(String), "1,1"];
  fr.byRound[fr.byRound.length - 1].push("1,1");
  fr.tiles = fr.reserved.length;
  if (L.shrunk) L.shrunk.wanted = Math.max(L.shrunk.wanted || 0, fr.tiles + 1);
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

rec(run("98-d8-neighbor-19-27-fullRun-only", "E11S1", (p) => {
  const L = p.meta.extensions.laneMeta;
  const fr = L.fullRun;
  const extra = "19,27";
  fr.reserved = [...fr.reserved.map(String), extra];
  fr.byRound = [...fr.byRound.slice(0, -1).map((r) => r.slice()), [...fr.byRound[fr.byRound.length - 1].map(String), extra]];
  fr.tiles = fr.reserved.length;
  if (L.shrunk) L.shrunk.wanted = Math.max(L.shrunk.wanted || 0, fr.tiles + 1);
  syncLane(p);
}));

rec(run("98-d8-neighbor-19-27-new-trailing-round", "E11S1", (p) => {
  const L = p.meta.extensions.laneMeta;
  const fr = L.fullRun;
  const extra = "19,27";
  fr.reserved = [...fr.reserved.map(String), extra];
  fr.byRound = [...fr.byRound.map((r) => r.slice()), [extra]];
  fr.rounds = fr.byRound.length;
  fr.used = fr.rounds;
  fr.tiles = fr.reserved.length;
  if (L.shrunk) L.shrunk.wanted = Math.max(L.shrunk.wanted || 0, fr.tiles + 1);
  syncLane(p);
}));

// Hostile extra: forge BOTH reserved copies (the kept prefix itself).
rec(run("98-d8-neighbor-19-27-both-reserved-stuff-last-round", "E11S1", (p) => {
  const extra = "19,27";
  const L = p.meta.extensions.laneMeta;
  const fr = L.fullRun;
  fr.reserved = [...fr.reserved.map(String), extra];
  L.reserved = [...(L.reserved || []).map(String), extra];
  L.tiles = L.reserved.length;
  fr.tiles = fr.reserved.length;
  fr.byRound = [...fr.byRound.slice(0, -1).map((r) => r.slice()), [...fr.byRound[fr.byRound.length - 1].map(String), extra]];
  if (L.shrunk) L.shrunk.wanted = Math.max(L.shrunk.wanted || 0, fr.tiles + 1);
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

{
  const src = byPlan.get("E11S2");
  const d = byRoom.get("E11S2");
  const leaky = src && d ? nudgeCut(src, d.terrain, { x: 20, y: 9 }, { x: 19, y: 9 }) : null;
  rec({
    name: "INFO-88-leaky-20-9",
    room: "E11S2",
    status: "INFO",
    detail: JSON.stringify(leaky && { lap: leaky.lap, leakSit: leaky.leakSit, n: leaky.n, origLap: leaky.origLap }),
  });
  if (leaky) {
    rec(run("88-leaky-20-9-to-19-9", "E11S2", (p) => {
      applyBonus(p, leaky.bonus, (r) => {
        r.cutTiles = leaky.fake.map((t) => ({ x: t.x, y: t.y }));
        r.mobility = leaky.lap;
      });
    }));
    // r29p11 named close: same leak plus complete=false (applyBonus regen's the decl).
    rec(run("88-leaky-20-9-to-19-9-complete-false", "E11S2", (p) => {
      applyBonus(p, leaky.bonus, (r) => {
        r.cutTiles = leaky.fake.map((t) => ({ x: t.x, y: t.y }));
        r.mobility = leaky.lap;
        r.complete = false;
      });
    }));
    rec(run("88-leaky-20-9-to-19-9-complete-false-no-regen", "E11S2", (p) => {
      const esc = p.meta.shellEscalation;
      if (esc && Array.isArray(esc.rungs)) {
        for (const row of esc.rungs) {
          if (row && row.needDeepBonus === leaky.bonus) {
            row.cutTiles = leaky.fake.map((t) => ({ x: t.x, y: t.y }));
            row.mobility = leaky.lap;
            row.complete = false;
          }
        }
      }
    }));
  } else {
    rec({ name: "88-leaky-20-9-to-19-9", room: "E11S2", status: "SKIP", detail: "20,9 not on last fat cut" });
    rec({ name: "88-leaky-20-9-to-19-9-complete-false", room: "E11S2", status: "SKIP", detail: "20,9 not on last fat cut" });
    rec({ name: "88-leaky-20-9-to-19-9-complete-false-no-regen", room: "E11S2", status: "SKIP", detail: "20,9 not on last fat cut" });
  }
}

rec(run("88-last-fat-complete-false-alone", "E11S2", (p) => {
  applyBonus(p, 85, (r) => { r.complete = false; });
}));

rec(run("PRESENCE-nukerInWindow-flipped", rooms.nukerWin, (p) => {
  const nw = p.meta.towers.nukeWindow;
  nw.nukerInWindow = !nw.nukerInWindow;
}));
rec(run("PRESENCE-center-moved", rooms.nukeCenter, (p) => {
  p.meta.towers.nukeWindow.center = { x: 1, y: 1 };
}));
rec(run("PRESENCE-mineralSeatNetTiles-cleared", rooms.mineralNet, (p) => {
  p.meta.misc.mineralSeatNetTiles = [];
}));
rec(run("PRESENCE-coveredDetourDeclared-zeroed", rooms.detour, (p) => {
  p.meta.walls.mobility.coveredDetourDeclared = false;
}));

rec(run("pick-protectRadius-zeroed", rooms.protect, (p) => { p.meta.shell.protectRadius = 0; }));
rec(run("pick-baseCut-zeroed", rooms.baseCutLow, (p) => { p.meta.shell.baseCut = 0; }));
rec(run("141e-plan-seed-rewritten", rooms.seedCoord, (p) => { p.seed = { x: 1, y: 1 }; }));
rec(run("cutPasses-swap-rampartsDeleted-sum-held", rooms.swapPrune, (p) => {
  const a = p.meta.shell.cutPasses.find((m) => m.pass === "layer7-inertPrune");
  const b = p.meta.shell.cutPasses.find((m) => m.pass === "layer7b-inertPrune");
  const t = a.rampartsDeleted;
  a.rampartsDeleted = b.rampartsDeleted;
  b.rampartsDeleted = t;
}));
rec(run("cutPasses-last-prune-ramparts-plus-8", rooms.prunePass, (p) => {
  for (const mk of p.meta.shell.cutPasses) if (mk.pass === "layer7b-inertPrune") mk.ramparts += 8;
}));
rec(run("cutPasses-sealCritical-plus-1", rooms.cutPasses, (p) => {
  for (const mk of p.meta.shell.cutPasses) if (Number.isInteger(mk.sealCritical)) mk.sealCritical += 1;
}));
rec(run("MF5-mineral-append", rooms.mineral, (p) => {
  p.meta.misc.mineralOffNetworkWhy += " THE WALL IS FREE.";
}));

// =====================================================================
// Named residues — expect ESCAPE unless this pass closed them
// =====================================================================
{
  const src = byPlan.get("E11S2");
  const d = byRoom.get("E11S2");
  const seal = src && d ? nudgeCut(src, d.terrain, { x: 29, y: 33 }, { x: 28, y: 34 }) : null;
  rec({
    name: "INFO-88-seal-29-33",
    room: "E11S2",
    status: "INFO",
    detail: JSON.stringify(seal && { lap: seal.lap, leakSit: seal.leakSit, n: seal.n, origLap: seal.origLap }),
  });
  if (seal) {
    rec(run("88-same-lap-seal-29-33-to-28-34", "E11S2", (p) => {
      applyBonus(p, seal.bonus, (r) => {
        r.cutTiles = seal.fake.map((t) => ({ x: t.x, y: t.y }));
        r.mobility = seal.lap;
      });
    }));
  } else {
    rec({ name: "88-same-lap-seal-29-33-to-28-34", room: "E11S2", status: "SKIP", detail: "29,33 not on last fat cut" });
  }
}

rec(run("98-wanted-plus-1-on-shrink", rooms.shrunk, (p) => {
  const L = p.meta.extensions.laneMeta;
  L.shrunk.wanted += 1;
  syncLane(p);
}));

rec(run("pick-protectRadius-swapped-inside-enum", rooms.protect, (p) => {
  const r = p.meta.shell.protectRadius;
  p.meta.shell.protectRadius = r === 12 ? 6 : 12;
}));
rec(run("pick-baseCut-minus-1-same-side-of-45", rooms.baseCutLow, (p) => { p.meta.shell.baseCut -= 1; }));
rec(run("pick-baseCut-plus-1-same-side-of-45", rooms.baseCutLow, (p) => { p.meta.shell.baseCut += 1; }));
if (rooms.baseCutHigh) {
  rec(run("pick-baseCut-minus-1-pricey-side", rooms.baseCutHigh, (p) => { p.meta.shell.baseCut -= 1; }));
}

rec(run("141e-seedScore-to-0", rooms.seedScore, (p) => { p.meta.seedScore = 0; }));
rec(run("141e-seedScore-plus-999", rooms.seedScore, (p) => { p.meta.seedScore += 999; }));

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
