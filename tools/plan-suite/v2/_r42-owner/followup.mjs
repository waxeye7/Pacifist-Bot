/**
 * Pin first-fail text on the new 98/88 holes. Clones only. Regen decls.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { enclosureMobility } from "../layer-shell.mjs";
import { renderDecl } from "../declprose.mjs";
import { bothLanes, hashedRooms, loadPlans, loadRooms, makeChecker, K } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);

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

const rows = [];
async function rec(p) {
  const r = await p;
  rows.push(r);
  console.log(String(r.status).padEnd(8), r.name, r.changed, (r.first || "").slice(0, 260));
  return r;
}

await rec(run("98 append 19,27 both reserved lists wanted+1", "E11S1", (p) => {
  bothLanes(p, (L) => {
    const extra = "19,27";
    L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
    L.reserved = [...(L.reserved || []).map(String), extra];
    L.tiles = L.reserved.length;
    L.fullRun.tiles = L.fullRun.reserved.length;
    const last = L.fullRun.byRound[L.fullRun.byRound.length - 1];
    L.fullRun.byRound = [
      ...L.fullRun.byRound.slice(0, -1).map((r) => r.slice()),
      [...last.map(String), extra],
    ];
    L.shrunk.wanted = L.fullRun.tiles + 1;
  });
}));

await rec(run("98 prefix swap 18,27→19,27 both lists", "E11S1", (p) => {
  bothLanes(p, (L) => {
    const from = "18,27", to = "19,27";
    L.fullRun.reserved = L.fullRun.reserved.map((t) => (String(t) === from ? to : String(t)));
    L.reserved = (L.reserved || []).map((t) => (String(t) === from ? to : String(t)));
    L.fullRun.byRound = L.fullRun.byRound.map((r) => r.map((t) => (String(t) === from ? to : String(t))));
  });
}));

await rec(run("98 wanted += 1 only", "E11S1", (p) => {
  bothLanes(p, (L) => { L.shrunk.wanted += 1; });
}));

const src = byPlan.get("E11S2");
const d = byRoom.get("E11S2");
const last = src.meta.shortfalls.find((s) => s.ladder).ladder.rungs.at(-1);
const leaky = last.cutTiles.map((t) => (t.x === 20 && t.y === 9 ? { x: 19, y: 9 } : { x: t.x, y: t.y }));
const leakLap = enclosureMobility(d.terrain, src, leaky);
const sealed = last.cutTiles.map((t) => (t.x === 29 && t.y === 33 ? { x: 28, y: 34 } : { x: t.x, y: t.y }));
const sealLap = enclosureMobility(d.terrain, src, sealed);

await rec(run("88 leaky 20,9→19,9 complete stays true + regen", "E11S2", (p) => {
  applyBonus(p, 85, (r) => {
    r.cutTiles = leaky.map((t) => ({ x: t.x, y: t.y }));
    r.mobility = leakLap;
  });
}));
await rec(run("88 leaky 20,9→19,9 AND complete=false + regen", "E11S2", (p) => {
  applyBonus(p, 85, (r) => {
    r.cutTiles = leaky.map((t) => ({ x: t.x, y: t.y }));
    r.mobility = leakLap;
    r.complete = false;
  });
}));
await rec(run("88 sealing 29,33→28,34 + regen", "E11S2", (p) => {
  applyBonus(p, 85, (r) => {
    r.cutTiles = sealed.map((t) => ({ x: t.x, y: t.y }));
    r.mobility = sealLap;
  });
}));
await rec(run("88 last-fat complete=false only + regen", "E11S2", (p) => {
  applyBonus(p, 85, (r) => { r.complete = false; });
}));

const mcR = plans.find((p) => (p.meta?.misc?.mineralContainer || 0) > 0);
const mdR = plans.find((p) => typeof p.meta?.towers?.rcl5Pair?.minDmgPicked === "number" && p.meta.towers.rcl5Pair.minDmgPicked !== 0);
const sfR = plans.find((p) => (p.meta?.walls?.servedFree || 0) > 0);
const stR = plans.find((p) => (p.meta?.walls?.laidByKind?.stitch || 0) > 0 && typeof p.meta?.walls?.stitched === "number");
const st2R = plans.find((p) => (p.meta?.walls?.laidByKind?.stitch || 0) >= 2);
if (mcR) await rec(run("p13 mineralContainer := 0", mcR.room, (p) => { p.meta.misc.mineralContainer = 0; }));
if (mdR) await rec(run("p13 minDmgPicked := 0", mdR.room, (p) => { p.meta.towers.rcl5Pair.minDmgPicked = 0; }));
if (sfR) await rec(run("p13 servedFree := 0", sfR.room, (p) => { p.meta.walls.servedFree = 0; }));
if (stR) await rec(run("p13 stitched := 2", stR.room, (p) => { p.meta.walls.stitched = 2; }));
if (st2R) await rec(run("p13 stitched := 2 on laid>=2", st2R.room, (p) => { p.meta.walls.stitched = 2; }));

const apR = plans.find((p) => p.meta?.towers?.rcl5Pair?.arrayPartner && Number.isInteger(p.meta.towers.rcl5Pair.arrayPartner.x));
const pkR = plans.find((p) => p.meta?.towers?.rcl5Pair?.picked && Number.isInteger(p.meta.towers.rcl5Pair.picked.x) && (p.structures?.tower || []).length >= 2);
const mdA = plans.find((p) => typeof p.meta?.towers?.rcl5Pair?.minDmgArray === "number" && p.meta.towers.rcl5Pair.minDmgArray !== 0);
const bgR = plans.find((p) => typeof p.meta?.shell?.battlementGap === "number" && p.meta.shell.battlementGap === 0);
const bgtR = plans.find((p) => Array.isArray(p.meta?.shell?.battlementGapTiles));
const bhR = plans.find((p) => p.meta?.walls?.mobility?.boundHeld === true);
const blR = plans.find((p) => typeof p.meta?.walls?.mobility?.boundLap === "number" && p.meta.walls.mobility.boundLap !== 0 && p.meta.walls.mobility.boundHeld === true);
const ftR = plans.find((p) => typeof p.meta?.walls?.fillerTiles === "number" && p.meta.walls.fillerTiles !== 1);
const scR = plans.find((p) => (p.meta?.labs?.shallowCost || 0) > 0);
const srR = plans.find((p) => Array.isArray(p.meta?.walls?.reflow?.shallowRefused) && p.meta.walls.reflow.shallowRefused.length > 0);
if (apR) await rec(run("p14 arrayPartner moved 1,1", apR.room, (p) => { p.meta.towers.rcl5Pair.arrayPartner = { x: 1, y: 1 }; }));
if (pkR) await rec(run("p14 rcl5Pair.picked moved 1,1", pkR.room, (p) => { p.meta.towers.rcl5Pair.picked = { x: 1, y: 1 }; }));
if (mdA) await rec(run("p14 minDmgArray := 0", mdA.room, (p) => { p.meta.towers.rcl5Pair.minDmgArray = 0; }));
if (bgR) await rec(run("p14 battlementGap := 1", bgR.room, (p) => { p.meta.shell.battlementGap = 1; }));
if (bgtR) await rec(run("p14 battlementGapTiles plant 1,1", bgtR.room, (p) => { p.meta.shell.battlementGapTiles = [{ x: 1, y: 1 }]; }));
if (bhR) await rec(run("p14 boundHeld flipped false", bhR.room, (p) => { p.meta.walls.mobility.boundHeld = false; }));
if (blR) await rec(run("p14 boundLap := 0", blR.room, (p) => { p.meta.walls.mobility.boundLap = 0; }));
if (ftR) await rec(run("p14 fillerTiles := 1", ftR.room, (p) => { p.meta.walls.fillerTiles = 1; }));
if (scR) await rec(run("p14 shallowCost := 0", scR.room, (p) => { p.meta.labs.shallowCost = 0; }));
if (srR) await rec(run("p14 shallowRefused cleared", srR.room, (p) => { p.meta.walls.reflow.shallowRefused = []; }));

const fgR = plans.find((p) => typeof p.meta?.walls?.mobility?.floorGated === "number" && p.meta.walls.mobility.floorGated !== 0);
const foR = plans.find((p) => (p.meta?.walls?.mobility?.floorOver || 0) > 0);
const fogR = plans.find((p) => (p.meta?.walls?.mobility?.floorOverGated || 0) > 0);
const fdR = plans.find((p) => (p.meta?.walls?.mobility?.worst?.freeDin || 0) > 0);
const maR = plans.find((p) => (p.meta?.walls?.mobility?.massAdds || 0) !== 0);
const mxR = plans.find((p) => (p.meta?.roadOrder?.maxDist || 0) > 0);
const drR = plans.find((p) => typeof p.meta?.extensions?.deepReach === "number" && p.meta.extensions.deepReach !== 0);
const stcR = plans.find((p) => typeof p.meta?.extensions?.stubCap === "number" && p.meta.extensions.stubCap !== 0);
const msrR = plans.find((p) => p.meta?.mineralSeatAtReservation && Number.isInteger(p.meta.mineralSeatAtReservation.x));
const marR = plans.find((p) => p.meta?.mineralApproachAtReservation && Number.isInteger(p.meta.mineralApproachAtReservation.x));
if (fgR) await rec(run("p15 floorGated := 0", fgR.room, (p) => { p.meta.walls.mobility.floorGated = 0; }));
if (foR) await rec(run("p15 floorOver := 0", foR.room, (p) => { p.meta.walls.mobility.floorOver = 0; }));
if (fogR) await rec(run("p15 floorOverGated := 0", fogR.room, (p) => { p.meta.walls.mobility.floorOverGated = 0; }));
if (fdR) await rec(run("p15 worst.freeDin := 0", fdR.room, (p) => { p.meta.walls.mobility.worst.freeDin = 0; }));
if (maR) await rec(run("p15 massAdds := 0 both copies", maR.room, (p) => {
  p.meta.walls.mobility.massAdds = 0;
  if (p.meta.walls.mobility.worst) p.meta.walls.mobility.worst.massAdds = 0;
}));
if (mxR) await rec(run("p15 roadOrder.maxDist := 0", mxR.room, (p) => { p.meta.roadOrder.maxDist = 0; }));
if (drR) await rec(run("p15 deepReach := 0", drR.room, (p) => { p.meta.extensions.deepReach = 0; }));
if (stcR) await rec(run("p15 stubCap := 0", stcR.room, (p) => { p.meta.extensions.stubCap = 0; }));
if (stcR && stcR.meta.extensions.stubCap === 43) {
  await rec(run("p15 stubCap 43→51", stcR.room, (p) => { p.meta.extensions.stubCap = 51; }));
} else {
  const stc43 = plans.find((p) => p.meta?.extensions?.stubCap === 43);
  if (stc43) await rec(run("p15 stubCap 43→51", stc43.room, (p) => { p.meta.extensions.stubCap = 51; }));
}
if (msrR) await rec(run("p15 mineralSeatAtReservation → 1,1", msrR.room, (p) => { p.meta.mineralSeatAtReservation = { x: 1, y: 1 }; }));
if (marR) await rec(run("p15 mineralApproachAtReservation → 1,1", marR.room, (p) => { p.meta.mineralApproachAtReservation = { x: 1, y: 1 }; }));
await rec(run("141e seedScore := 0", "E11S1", (p) => { p.meta.seedScore = 0; }));
await rec(run("141e seedScore += 999", "E11S1", (p) => { p.meta.seedScore = (p.meta.seedScore || 0) + 999; }));
await rec(run("p16 hubDistCap := 17 off-ladder", "E11S1", (p) => { p.meta.extensions.hubDistCap = 17; }));
await rec(run("p16 hubDistCap 16→19 in-enum", "E11S1", (p) => { p.meta.extensions.hubDistCap = 19; }));
await rec(run("p16 lapCeilingFloor := 0", plans.find((p) => typeof p.meta?.walls?.reflow?.lapCeilingFloor === "number")?.room || "E11S1", (p) => {
  if (p.meta?.walls?.reflow) p.meta.walls.reflow.lapCeilingFloor = 0;
  if (p.meta?.extensions?.reflow) p.meta.extensions.reflow.lapCeilingFloor = 0;
}));
await rec(run("p16 corridorPlaced := 0 keep fallback 0", plans.find((p) => (p.meta?.extensions?.corridorPlaced || 0) === 60 && (p.meta?.extensions?.corridorFallback || 0) === 0)?.room || "E11S1", (p) => {
  p.meta.extensions.corridorPlaced = 0;
}));
await rec(run("p16 corridorPlaced := 0 and fallback := 1", plans.find((p) => (p.meta?.extensions?.corridorPlaced || 0) === 60 && (p.meta?.extensions?.corridorFallback || 0) === 0)?.room || "E11S1", (p) => {
  p.meta.extensions.corridorPlaced = 0;
  p.meta.extensions.corridorFallback = 1;
}));
{
  const stc43 = plans.find((p) => p.meta?.extensions?.stubCap === 43);
  const stc51 = plans.find((p) => p.meta?.extensions?.stubCap === 51);
  const fuR = plans.find((p) => typeof p.meta?.extensions?.laneMeta?.floorUngated === "number" && p.meta.extensions.laneMeta.floorUngated !== 0);
  const radR = plans.find((p) => Array.isArray(p.meta?.composeOpts?.radii) && p.meta.composeOpts.radii.length > 0);
  const radAbs = plans.find((p) => p.meta?.composeOpts && !p.meta.composeOpts.radii);
  const pkR = plans.find((p) => typeof p.meta?.composeOpts?.parkCap === "number" && p.meta.composeOpts.parkCap !== 0);
  const swR = plans.find((p) => p.meta?.composeOpts?.takeTowerSwap?.to && Number.isInteger(p.meta.composeOpts.takeTowerSwap.to.x));
  if (stc43) await rec(run("p17 stubCap 43→51", stc43.room, (p) => { p.meta.extensions.stubCap = 51; }));
  if (stc51) await rec(run("p17 stubCap 51→43", stc51.room, (p) => { p.meta.extensions.stubCap = 43; }));
  if (fuR) {
    await rec(run("p17 floorUngated := 0 both copies", fuR.room, (p) => {
      if (p.meta?.extensions?.laneMeta) p.meta.extensions.laneMeta.floorUngated = 0;
      if (p.meta?.walls?.mobility?.lanes) p.meta.walls.mobility.lanes.floorUngated = 0;
    }));
  }
  if (radR) await rec(run("p17 radii rewritten [1,2,3]", radR.room, (p) => { p.meta.composeOpts.radii = [1, 2, 3]; }));
  if (radAbs) await rec(run("p17 radii planted on absent", radAbs.room, (p) => { p.meta.composeOpts.radii = [6, 7, 8, 9, 10, 11, 12, 13, 14]; }));
  if (pkR) await rec(run("p17 parkCap := 0", pkR.room, (p) => { p.meta.composeOpts.parkCap = 0; }));
  if (swR) await rec(run("p17 takeTowerSwap.to → 1,1", swR.room, (p) => { p.meta.composeOpts.takeTowerSwap.to = { x: 1, y: 1 }; }));
}
{
  const mhR = plans.find((p) => typeof p.meta?.extensions?.maxHubDist === "number" && p.meta.extensions.maxHubDist !== 0);
  const swFrom = plans.find((p) => p.meta?.composeOpts?.takeTowerSwap?.from && Number.isInteger(p.meta.composeOpts.takeTowerSwap.from.x));
  if (mhR) await rec(run("p18 maxHubDist := 0", mhR.room, (p) => { p.meta.extensions.maxHubDist = 0; }));
  if (mhR) await rec(run("p18 maxHubDist += 1", mhR.room, (p) => { p.meta.extensions.maxHubDist += 1; }));
  if (swFrom) await rec(run("p18 takeTowerSwap.from → 1,1", swFrom.room, (p) => { p.meta.composeOpts.takeTowerSwap.from = { x: 1, y: 1 }; }));
  if (swFrom) {
    const to = swFrom.meta.composeOpts.takeTowerSwap.to;
    const from = swFrom.meta.composeOpts.takeTowerSwap.from;
    const towers = new Set((swFrom.structures?.tower || []).map((t) => `${t.x},${t.y}`));
    const alt = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      .map(([dx, dy]) => ({ x: to.x + dx, y: to.y + dy }))
      .find((t) => (t.x !== from.x || t.y !== from.y) && !towers.has(`${t.x},${t.y}`));
    if (alt) await rec(run(`p18 takeTowerSwap.from other D8 ${alt.x},${alt.y}`, swFrom.room, (p) => { p.meta.composeOpts.takeTowerSwap.from = { x: alt.x, y: alt.y }; }));
    if (alt) await rec(run(`p19 takeTowerSwap.from other D8 ${alt.x},${alt.y} composeOpts only`, swFrom.room, (p) => { p.meta.composeOpts.takeTowerSwap.from = { x: alt.x, y: alt.y }; }));
    if (alt) await rec(run("p19 takeTowerSwap.from other D8 + rewrite published take", swFrom.room, (p) => {
      p.meta.composeOpts.takeTowerSwap.from = { x: alt.x, y: alt.y };
      if (p.meta.towers?.acrossPriorTake?.taken) p.meta.towers.acrossPriorTake.taken.from = { x: alt.x, y: alt.y };
      if (p.meta.towers?.towerSwapTaken) p.meta.towers.towerSwapTaken.from = { x: alt.x, y: alt.y };
      if (p.meta.towers?.towerSwapOffer?.best) p.meta.towers.towerSwapOffer.best.from = { x: alt.x, y: alt.y };
    }));
  }
}
{
  const ucR = plans.find((p) => typeof p.meta?.walls?.unreachedClusters === "number");
  const ueR = plans.find((p) => typeof p.meta?.walls?.unreachableExts === "number");
  const seR = plans.find((p) => typeof p.meta?.walls?.servedExts === "number");
  if (ucR) await rec(run("p19 unreachedClusters += 1", ucR.room, (p) => { p.meta.walls.unreachedClusters += 1; }));
  if (ueR) await rec(run("p19 unreachableExts += 1", ueR.room, (p) => { p.meta.walls.unreachableExts += 1; }));
  if (seR) await rec(run("p19 servedExts += 1", seR.room, (p) => { p.meta.walls.servedExts += 1; }));
  if (seR) await rec(run("p19 servedExts += 1 and fillerTiles += 1", seR.room, (p) => {
    p.meta.walls.servedExts = (p.meta.walls.servedExts || 0) + 1;
    if (typeof p.meta.walls.fillerTiles === "number") p.meta.walls.fillerTiles += 1;
    else p.meta.walls.fillerTiles = 1;
  }));
}
{
  const bogR = plans.find((p) => typeof p.meta?.misc?.mobilityVeto?.baseOverGated === "number" && p.meta.misc.mobilityVeto.baseOverGated !== 0);
  const wasR = plans.find((p) => (p.meta?.misc?.mobilityVeto?.refused || []).some((r) => r && typeof r.wasLap === "number" && r.wasLap !== 0));
  if (bogR) await rec(run("p20 baseOverGated := 0", bogR.room, (p) => { p.meta.misc.mobilityVeto.baseOverGated = 0; }));
  if (bogR) await rec(run("p20 baseOverGated += 1", bogR.room, (p) => { p.meta.misc.mobilityVeto.baseOverGated += 1; }));
  if (wasR) await rec(run("p20 wasLap := 0", wasR.room, (p) => {
    for (const r of p.meta.misc.mobilityVeto.refused || []) {
      if (r && typeof r.wasLap === "number") r.wasLap = 0;
    }
  }));
  if (wasR) await rec(run("p20 wasLap += 1", wasR.room, (p) => {
    for (const r of p.meta.misc.mobilityVeto.refused || []) {
      if (r && typeof r.wasLap === "number") r.wasLap += 1;
    }
  }));
}

const hashed = hashedRooms(plans).slice(0, 5).map((r) => r.room);
const extra = ["E11S1", "E2S7", "E1S4"];
const names = [...new Set([...hashed, ...extra])];
const brief = {};
for (const name of names) {
  const p = byPlan.get(name);
  if (!p) continue;
  brief[name] = {
    hashed: hashed.includes(name),
    drift: (p.meta.shell?.cutDrift || []).map((e) => `${e.op} ${K(e)} ${e.pass}`),
    baseCut: p.meta.shell?.baseCut,
    protect: p.meta.shell?.protectRadius,
    seedScore: p.meta.seedScore,
    seed: p.seed,
    hub: p.hub,
    sitter: p.sitter,
    mobility: p.meta.walls?.mobility?.builtGated,
    enclosedCtrl: p.meta.shell?.enclosedController,
    notes: (p.meta.noteRecords || []).map((n) => n.cls),
    shortfalls: (p.meta.shortfalls || []).map((s) => s.gate + (s.kind ? "/" + s.kind : "")),
    outcome: p.meta.sealedRecovery?.outcome,
    holders: (p.meta.sealedRecovery?.fixedHolders || []).map((h) => ({ t: h.type, k: K(h), keys: Object.keys(h) })),
    rungs: (p.meta.shellEscalation?.rungs || []).map((r) => ({
      b: r.needDeepBonus, mob: r.mobility, ramp: r.ramparts, cut: (r.cutTiles || []).length, complete: r.complete,
    })),
    reserved: p.meta.extensions?.laneMeta?.fullRun?.reserved,
    laneRes: p.meta.extensions?.laneMeta?.reserved,
    shrunk: p.meta.extensions?.laneMeta?.shrunk,
  };
}
console.log(JSON.stringify({ hashed, briefKeys: Object.keys(brief) }, null, 2));
fs.writeFileSync(path.join(DIR, "followup-out.json"), JSON.stringify({ rows, hashed, brief }, null, 2));
