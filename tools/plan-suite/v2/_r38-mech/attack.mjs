/**
 * Round-38 hostile mutations. In-memory checkRoom only. Never writes the artifact.
 * Named BITES re-probes: p16 hubDistCap/lapCeilingFloor/corridorPlaced; seedScore;
 * p15–p12; 88 leaky+complete=false; 98 one-copy.
 * ESCAPE class: 98 both-lists, wanted+=1, 88 same-lap, hubDistCap 16→19,
 * presence minus derived+baseCut+shallowNow, protectRadius enum.
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
  stitched: any((p) => (p.meta?.walls?.stitched || 0) > 0 && (p.meta?.walls?.laidByKind?.stitch || 0) > 0) || "E11S1",
  stitchTiles: any((p) => (p.meta?.walls?.stitchTiles || 0) > 0) || "E11S1",
  roadsEaten: any((p) => (p.meta?.labs?.roadsEaten || 0) > 0) || "E11S1",
  towerOnly: any((p) => typeof p.meta?.towers?.nukeWindow?.towerOnly === "number" && p.meta.towers.nukeWindow.towerOnly !== 1) || "E11S1",
  stubRoads: any((p) => (p.meta?.extensions?.stubRoads || 0) > 0) || "E11S1",
  mineralContainer: any((p) => (p.meta?.misc?.mineralContainer || 0) > 0) || "E11S1",
  minDmgPicked: any((p) => typeof p.meta?.towers?.rcl5Pair?.minDmgPicked === "number" && p.meta.towers.rcl5Pair.minDmgPicked !== 0) || "E11S1",
  servedFree: any((p) => (p.meta?.walls?.servedFree || 0) > 0) || "E11S1",
  stitchedFlag2: any((p) => (p.meta?.walls?.laidByKind?.stitch || 0) >= 2 && p.meta?.walls?.stitched === 1) || "E8S4",
  stitchedOff: any((p) => (p.meta?.walls?.laidByKind?.stitch || 0) === 0 && (p.meta?.walls?.stitched || 0) === 0) || "E11S3",
  arrayPartner: any((p) => p.meta?.towers?.rcl5Pair?.arrayPartner && Number.isInteger(p.meta.towers.rcl5Pair.arrayPartner.x)) || "E11S1",
  minDmgArray: any((p) => typeof p.meta?.towers?.rcl5Pair?.minDmgArray === "number" && p.meta.towers.rcl5Pair.minDmgArray !== 0) || "E11S1",
  rcl5Picked: any((p) => p.meta?.towers?.rcl5Pair?.picked && Number.isInteger(p.meta.towers.rcl5Pair.picked.x) && (p.structures?.tower || []).length >= 2) || "E11S1",
  battlementGap0: any((p) => typeof p.meta?.shell?.battlementGap === "number" && p.meta.shell.battlementGap === 0) || "E11S1",
  battlementGapTiles: any((p) => Array.isArray(p.meta?.shell?.battlementGapTiles)) || "E11S1",
  boundHeld: any((p) => p.meta?.walls?.mobility?.boundHeld === true) || "E11S1",
  boundLap: any((p) => typeof p.meta?.walls?.mobility?.boundLap === "number" && p.meta.walls.mobility.boundLap !== 0 && p.meta.walls.mobility.boundHeld === true) || "E11S1",
  fillerTiles: any((p) => typeof p.meta?.walls?.fillerTiles === "number" && p.meta.walls.fillerTiles !== 1) || "E11S1",
  shallowCost: any((p) => (p.meta?.labs?.shallowCost || 0) > 0) || "E11S1",
  shallowRefused: any((p) => Array.isArray(p.meta?.walls?.reflow?.shallowRefused) && p.meta.walls.reflow.shallowRefused.length > 0) || "E11S1",
  floorGated: any((p) => typeof p.meta?.walls?.mobility?.floorGated === "number" && p.meta.walls.mobility.floorGated !== 0) || "E11S1",
  floorOver: any((p) => (p.meta?.walls?.mobility?.floorOver || 0) > 0) || "E11S1",
  floorOverGated: any((p) => (p.meta?.walls?.mobility?.floorOverGated || 0) > 0) || "E11S1",
  freeDin: any((p) => (p.meta?.walls?.mobility?.worst?.freeDin || 0) > 0) || "E11S1",
  massAdds: any((p) => (p.meta?.walls?.mobility?.massAdds || 0) !== 0) || "E11S1",
  maxDist: any((p) => (p.meta?.roadOrder?.maxDist || 0) > 0) || "E11S1",
  deepReach: any((p) => typeof p.meta?.extensions?.deepReach === "number" && p.meta.extensions.deepReach !== 0) || "E11S1",
  stubCap: any((p) => typeof p.meta?.extensions?.stubCap === "number" && p.meta.extensions.stubCap !== 0) || "E11S1",
  stubCap43: any((p) => p.meta?.extensions?.stubCap === 43) || "E11S1",
  stubCap51: any((p) => p.meta?.extensions?.stubCap === 51) || null,
  seatRes: any((p) => p.meta?.mineralSeatAtReservation && Number.isInteger(p.meta.mineralSeatAtReservation.x)) || "E11S1",
  apprRes: any((p) => p.meta?.mineralApproachAtReservation && Number.isInteger(p.meta.mineralApproachAtReservation.x)) || "E11S1",
  hubDistCap16: any((p) => p.meta?.extensions?.hubDistCap === 16) || "E11S1",
  hubDistCap19: any((p) => p.meta?.extensions?.hubDistCap === 19) || null,
  lapCeil: any((p) => typeof (p.meta?.extensions?.reflow?.lapCeilingFloor ?? p.meta?.walls?.reflow?.lapCeilingFloor) === "number") || "E11S1",
  corridor60: any((p) => p.meta?.extensions?.corridorPlaced === 60 && (p.meta?.extensions?.corridorFallback || 0) === 0) || "E11S1",
  corridorFb: any((p) => (p.meta?.extensions?.corridorFallback || 0) > 0) || null,
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

{
  const p = byPlan.get(rooms.stitchedFlag2);
  rec({
    name: "INFO-p13-stitched-flag",
    room: rooms.stitchedFlag2,
    status: "INFO",
    detail: JSON.stringify({
      stitched: p?.meta?.walls?.stitched,
      stitchTiles: p?.meta?.walls?.stitchTiles,
      laidStitch: p?.meta?.walls?.laidByKind?.stitch,
    }),
  });
}
{
  const p = byPlan.get(rooms.mineralContainer);
  rec({
    name: "INFO-p13-walks",
    room: rooms.mineralContainer,
    status: "INFO",
    detail: JSON.stringify({
      mineralContainer: p?.meta?.misc?.mineralContainer,
      minDmgPicked: p?.meta?.towers?.rcl5Pair?.minDmgPicked,
      servedFree: p?.meta?.walls?.servedFree,
      minDmgRoom: rooms.minDmgPicked,
      servedFreeRoom: rooms.servedFree,
      minDmgPickedThere: byPlan.get(rooms.minDmgPicked)?.meta?.towers?.rcl5Pair?.minDmgPicked,
      servedFreeThere: byPlan.get(rooms.servedFree)?.meta?.walls?.servedFree,
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

// r29p12 named closes — flatten the five leftover walks.
rec(run("PRESENCE-stitched-zeroed", rooms.stitched, (p) => { p.meta.walls.stitched = 0; }));
rec(run("PRESENCE-stitchTiles-zeroed", rooms.stitchTiles, (p) => { p.meta.walls.stitchTiles = 0; }));
rec(run("PRESENCE-roadsEaten-zeroed", rooms.roadsEaten, (p) => { p.meta.labs.roadsEaten = 0; }));
rec(run("PRESENCE-towerOnly-to-1", rooms.towerOnly, (p) => { p.meta.towers.nukeWindow.towerOnly = 1; }));
rec(run("PRESENCE-stubRoads-zeroed", rooms.stubRoads, (p) => { p.meta.extensions.stubRoads = 0; }));

// r29p13 named closes — exact 0/1 flag + three board walks.
rec(run("P13-mineralContainer-zeroed", rooms.mineralContainer, (p) => { p.meta.misc.mineralContainer = 0; }));
rec(run("P13-mineralContainer-plus-1", rooms.mineralContainer, (p) => { p.meta.misc.mineralContainer += 1; }));
rec(run("P13-minDmgPicked-zeroed", rooms.minDmgPicked, (p) => { p.meta.towers.rcl5Pair.minDmgPicked = 0; }));
rec(run("P13-minDmgPicked-plus-1", rooms.minDmgPicked, (p) => { p.meta.towers.rcl5Pair.minDmgPicked += 1; }));
rec(run("P13-servedFree-zeroed", rooms.servedFree, (p) => { p.meta.walls.servedFree = 0; }));
rec(run("P13-servedFree-plus-1", rooms.servedFree, (p) => { p.meta.walls.servedFree += 1; }));
rec(run("P13-stitched-set-to-2-flag", rooms.stitchedFlag2, (p) => { p.meta.walls.stitched = 2; }));
rec(run("P13-stitched-set-to-laid-count", rooms.stitchedFlag2, (p) => {
  p.meta.walls.stitched = p.meta.walls.laidByKind.stitch;
}));
rec(run("P13-stitched-off-room-set-to-1", rooms.stitchedOff, (p) => { p.meta.walls.stitched = 1; }));
// No-op: room already ships 1. Not a door.
rec(run("P13-stitched-already-1-set-to-1", rooms.stitched, (p) => { p.meta.walls.stitched = 1; }));

// r29p14 named closes — nine leftover presence names (plus boundLap, same commit).
{
  const p = byPlan.get(rooms.arrayPartner);
  rec({
    name: "INFO-p14-walks",
    room: rooms.arrayPartner,
    status: "INFO",
    detail: JSON.stringify({
      arrayPartner: p?.meta?.towers?.rcl5Pair?.arrayPartner,
      minDmgArray: p?.meta?.towers?.rcl5Pair?.minDmgArray,
      picked: p?.meta?.towers?.rcl5Pair?.picked,
      swapped: p?.meta?.towers?.rcl5Pair?.swapped,
      battlementGap: byPlan.get(rooms.battlementGap0)?.meta?.shell?.battlementGap,
      battlementGapTiles: byPlan.get(rooms.battlementGapTiles)?.meta?.shell?.battlementGapTiles?.length,
      boundHeld: byPlan.get(rooms.boundHeld)?.meta?.walls?.mobility?.boundHeld,
      boundLap: byPlan.get(rooms.boundLap)?.meta?.walls?.mobility?.boundLap,
      fillerTiles: byPlan.get(rooms.fillerTiles)?.meta?.walls?.fillerTiles,
      extFace: byPlan.get(rooms.fillerTiles)?.meta?.walls?.laidByKind?.extFace,
      shallowCost: byPlan.get(rooms.shallowCost)?.meta?.labs?.shallowCost,
      shallowRefusedN: (byPlan.get(rooms.shallowRefused)?.meta?.walls?.reflow?.shallowRefused || []).length,
      rooms: {
        arrayPartner: rooms.arrayPartner,
        minDmgArray: rooms.minDmgArray,
        rcl5Picked: rooms.rcl5Picked,
        battlementGap0: rooms.battlementGap0,
        battlementGapTiles: rooms.battlementGapTiles,
        boundHeld: rooms.boundHeld,
        boundLap: rooms.boundLap,
        fillerTiles: rooms.fillerTiles,
        shallowCost: rooms.shallowCost,
        shallowRefused: rooms.shallowRefused,
      },
    }),
  });
}
rec(run("P14-arrayPartner-moved", rooms.arrayPartner, (p) => { p.meta.towers.rcl5Pair.arrayPartner = { x: 1, y: 1 }; }));
rec(run("P14-minDmgArray-zeroed", rooms.minDmgArray, (p) => { p.meta.towers.rcl5Pair.minDmgArray = 0; }));
rec(run("P14-minDmgArray-plus-1", rooms.minDmgArray, (p) => { p.meta.towers.rcl5Pair.minDmgArray += 1; }));
rec(run("P14-rcl5Pair-picked-moved", rooms.rcl5Picked, (p) => { p.meta.towers.rcl5Pair.picked = { x: 1, y: 1 }; }));
rec(run("P14-battlementGap-set-to-1", rooms.battlementGap0, (p) => { p.meta.shell.battlementGap = 1; }));
rec(run("P14-battlementGapTiles-planted", rooms.battlementGapTiles, (p) => { p.meta.shell.battlementGapTiles = [{ x: 1, y: 1 }]; }));
rec(run("P14-boundHeld-flipped", rooms.boundHeld, (p) => { p.meta.walls.mobility.boundHeld = false; }));
rec(run("P14-boundLap-zeroed", rooms.boundLap, (p) => { p.meta.walls.mobility.boundLap = 0; }));
rec(run("P14-fillerTiles-set-to-1", rooms.fillerTiles, (p) => { p.meta.walls.fillerTiles = 1; }));
rec(run("P14-shallowCost-zeroed", rooms.shallowCost, (p) => { p.meta.labs.shallowCost = 0; }));
rec(run("P14-shallowCost-plus-1", rooms.shallowCost, (p) => { p.meta.labs.shallowCost += 1; }));
rec(run("P14-shallowRefused-cleared", rooms.shallowRefused, (p) => { p.meta.walls.reflow.shallowRefused = []; }));
// Twin / identity residues on the named closes — expect ESCAPE if the gate is a sibling, not a board walk.
rec(run("P14-fillerTiles-and-extFace-both-1", rooms.fillerTiles, (p) => {
  p.meta.walls.fillerTiles = 1;
  if (p.meta.walls.laidByKind) p.meta.walls.laidByKind.extFace = 1;
}));
rec(run("P14-boundHeld-false-and-bounded-below-lap", rooms.boundHeld, (p) => {
  const mob = p.meta.walls.mobility;
  const built = mob.builtGated ?? p.meta.shell?.mobilityShipped?.maxGated ?? 0;
  mob.boundHeld = false;
  const lane = p.meta.extensions?.laneMeta || mob.lanes;
  if (lane && typeof lane === "object") lane.bounded = Math.max(0, built - 1);
  syncLane(p);
}));

// r29p15 named closes — ten leftover presence names.
{
  const p = byPlan.get(rooms.floorGated);
  rec({
    name: "INFO-p15-walks",
    room: rooms.floorGated,
    status: "INFO",
    detail: JSON.stringify({
      floorGated: p?.meta?.walls?.mobility?.floorGated,
      floorOver: byPlan.get(rooms.floorOver)?.meta?.walls?.mobility?.floorOver,
      floorOverGated: byPlan.get(rooms.floorOverGated)?.meta?.walls?.mobility?.floorOverGated,
      freeDin: byPlan.get(rooms.freeDin)?.meta?.walls?.mobility?.worst?.freeDin,
      massAdds: byPlan.get(rooms.massAdds)?.meta?.walls?.mobility?.massAdds,
      maxDist: byPlan.get(rooms.maxDist)?.meta?.roadOrder?.maxDist,
      deepReach: byPlan.get(rooms.deepReach)?.meta?.extensions?.deepReach,
      hubDistCap: byPlan.get(rooms.deepReach)?.meta?.extensions?.hubDistCap,
      stubCap: byPlan.get(rooms.stubCap)?.meta?.extensions?.stubCap,
      seatRes: byPlan.get(rooms.seatRes)?.meta?.mineralSeatAtReservation,
      apprRes: byPlan.get(rooms.apprRes)?.meta?.mineralApproachAtReservation,
      seedScore: byPlan.get(rooms.seedScore)?.meta?.seedScore,
      rooms: {
        floorGated: rooms.floorGated,
        floorOver: rooms.floorOver,
        floorOverGated: rooms.floorOverGated,
        freeDin: rooms.freeDin,
        massAdds: rooms.massAdds,
        maxDist: rooms.maxDist,
        deepReach: rooms.deepReach,
        stubCap: rooms.stubCap,
        stubCap43: rooms.stubCap43,
        stubCap51: rooms.stubCap51,
        seatRes: rooms.seatRes,
        apprRes: rooms.apprRes,
      },
    }),
  });
}
rec(run("P15-floorGated-zeroed", rooms.floorGated, (p) => { p.meta.walls.mobility.floorGated = 0; }));
rec(run("P15-floorOver-zeroed", rooms.floorOver, (p) => { p.meta.walls.mobility.floorOver = 0; }));
rec(run("P15-floorOverGated-zeroed", rooms.floorOverGated, (p) => { p.meta.walls.mobility.floorOverGated = 0; }));
rec(run("P15-freeDin-zeroed", rooms.freeDin, (p) => { p.meta.walls.mobility.worst.freeDin = 0; }));
rec(run("P15-massAdds-zeroed", rooms.massAdds, (p) => {
  p.meta.walls.mobility.massAdds = 0;
  if (p.meta.walls.mobility.worst) p.meta.walls.mobility.worst.massAdds = 0;
}));
rec(run("P15-maxDist-zeroed", rooms.maxDist, (p) => { p.meta.roadOrder.maxDist = 0; }));
rec(run("P15-deepReach-zeroed", rooms.deepReach, (p) => { p.meta.extensions.deepReach = 0; }));
rec(run("P15-stubCap-zeroed", rooms.stubCap, (p) => { p.meta.extensions.stubCap = 0; }));
rec(run("P15-mineralSeatAtReservation-moved", rooms.seatRes, (p) => { p.meta.mineralSeatAtReservation = { x: 1, y: 1 }; }));
rec(run("P15-mineralApproachAtReservation-moved", rooms.apprRes, (p) => { p.meta.mineralApproachAtReservation = { x: 1, y: 1 }; }));

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

// r29p16 named closes — hubDistCap ladder, lapCeilingFloor === MOBILITY_TARGET,
// corridorPlaced === 60 iff corridorFallback === 0.
{
  const p = byPlan.get(rooms.hubDistCap16);
  rec({
    name: "INFO-p16-walks",
    room: rooms.hubDistCap16,
    status: "INFO",
    detail: JSON.stringify({
      hubDistCap: p?.meta?.extensions?.hubDistCap,
      deepReach: p?.meta?.extensions?.deepReach,
      lapExt: p?.meta?.extensions?.reflow?.lapCeilingFloor,
      lapWall: p?.meta?.walls?.reflow?.lapCeilingFloor,
      placed: p?.meta?.extensions?.corridorPlaced,
      fallback: p?.meta?.extensions?.corridorFallback,
      rooms: {
        hubDistCap16: rooms.hubDistCap16,
        hubDistCap19: rooms.hubDistCap19,
        lapCeil: rooms.lapCeil,
        corridor60: rooms.corridor60,
        corridorFb: rooms.corridorFb,
      },
    }),
  });
}
rec(run("P16-hubDistCap-zeroed", rooms.hubDistCap16, (p) => { p.meta.extensions.hubDistCap = 0; }));
rec(run("P16-hubDistCap-off-ladder-17", rooms.hubDistCap16, (p) => { p.meta.extensions.hubDistCap = 17; }));
rec(run("P16-lapCeilingFloor-zeroed", rooms.lapCeil, (p) => {
  if (p.meta.extensions?.reflow) p.meta.extensions.reflow.lapCeilingFloor = 0;
  if (p.meta.walls?.reflow) p.meta.walls.reflow.lapCeilingFloor = 0;
}));
rec(run("P16-corridorPlaced-zeroed", rooms.corridor60, (p) => { p.meta.extensions.corridorPlaced = 0; }));
rec(run("P16-corridorFallback-set-1-on-60", rooms.corridor60, (p) => { p.meta.extensions.corridorFallback = 1; }));
// Named residue: any in-ladder swap keeps min(cap+2,18)=18.
rec(run("P16-hubDistCap-16-to-19", rooms.hubDistCap16, (p) => { p.meta.extensions.hubDistCap = 19; }));
rec(run("P16-hubDistCap-16-to-23", rooms.hubDistCap16, (p) => { p.meta.extensions.hubDistCap = 23; }));
rec(run("P16-hubDistCap-16-to-999", rooms.hubDistCap16, (p) => { p.meta.extensions.hubDistCap = 999; }));
if (rooms.hubDistCap19) {
  rec(run("P16-hubDistCap-19-to-16", rooms.hubDistCap19, (p) => { p.meta.extensions.hubDistCap = 16; }));
}
if (rooms.corridorFb) {
  rec(run("P16-corridorPlaced-zeroed-on-fallback-room", rooms.corridorFb, (p) => {
    p.meta.extensions.corridorPlaced = 0;
  }));
}

// p15 residue hunts — enum / cheb-1 / formula identities, not the named flatten.
rec(run("P15-stubCap-43-to-51-enum-swap", rooms.stubCap43, (p) => { p.meta.extensions.stubCap = 51; }));
if (rooms.stubCap51) {
  rec(run("P15-stubCap-51-to-43-enum-swap", rooms.stubCap51, (p) => { p.meta.extensions.stubCap = 43; }));
}
rec(run("P15-deepReach-plus-1", rooms.deepReach, (p) => { p.meta.extensions.deepReach += 1; }));
rec(run("P15-deepReach-and-hubDistCap-formula-held", rooms.deepReach, (p) => {
  const ext = p.meta.extensions;
  const next = ext.hubDistCap === 16 ? 19 : 16;
  ext.hubDistCap = next;
  ext.deepReach = Math.min(next + 2, 18);
}));
{
  const src = byPlan.get(rooms.seatRes);
  const mineral = src?.mineral;
  const seat = src?.meta?.mineralSeatAtReservation;
  let otherSeat = null;
  if (mineral && seat) {
    for (const [dx, dy] of D8) {
      const x = mineral.x + dx;
      const y = mineral.y + dy;
      if (x === seat.x && y === seat.y) continue;
      if (x < 1 || y < 1 || x > 48 || y > 48) continue;
      otherSeat = { x, y };
      break;
    }
  }
  rec({
    name: "INFO-p15-other-seat",
    room: rooms.seatRes,
    status: "INFO",
    detail: JSON.stringify({ mineral, seat, otherSeat }),
  });
  if (otherSeat) {
    rec(run("P15-mineralSeat-other-cheb1-of-mineral", rooms.seatRes, (p) => {
      p.meta.mineralSeatAtReservation = { x: otherSeat.x, y: otherSeat.y };
    }));
    rec(run("P15-mineralSeat-and-approach-other-cheb1", rooms.seatRes, (p) => {
      p.meta.mineralSeatAtReservation = { x: otherSeat.x, y: otherSeat.y };
      const ap = p.meta.mineralApproachAtReservation;
      if (ap) {
        for (const [dx, dy] of D8) {
          const x = otherSeat.x + dx;
          const y = otherSeat.y + dy;
          if (x === otherSeat.x && y === otherSeat.y) continue;
          p.meta.mineralApproachAtReservation = { x, y };
          break;
        }
      }
    }));
  }
}
{
  const src = byPlan.get(rooms.apprRes);
  const seat = src?.meta?.mineralSeatAtReservation;
  const ap = src?.meta?.mineralApproachAtReservation;
  let otherAp = null;
  if (seat && ap) {
    for (const [dx, dy] of D8) {
      const x = seat.x + dx;
      const y = seat.y + dy;
      if (x === ap.x && y === ap.y) continue;
      if (x < 1 || y < 1 || x > 48 || y > 48) continue;
      otherAp = { x, y };
      break;
    }
  }
  rec({
    name: "INFO-p15-other-approach",
    room: rooms.apprRes,
    status: "INFO",
    detail: JSON.stringify({ seat, ap, otherAp }),
  });
  if (otherAp) {
    rec(run("P15-mineralApproach-other-d8-of-seat", rooms.apprRes, (p) => {
      p.meta.mineralApproachAtReservation = { x: otherAp.x, y: otherAp.y };
    }));
  }
}

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
