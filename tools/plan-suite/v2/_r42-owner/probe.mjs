/**
 * Named r29p11–p20 closes + leftover. checkRoom on clones only. Regen decls.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom } from "../validate.mjs";
import { enclosureMobility } from "../layer-shell.mjs";
import { renderDecl } from "../declprose.mjs";
import { exteriorFlood, key } from "../shared.mjs";
import { loadPlans, loadRooms, realFails, bothLanes } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byName = new Map(plans.map((p) => [p.room, p]));
const clone = (r) => JSON.parse(JSON.stringify(byName.get(r)));

function judge(label, p, d) {
  const res = checkRoom(p, d.terrain, d.objects, null);
  const real = realFails(res);
  const hit = real.find((f) => /leaks the sitter/i.test(f)) || real[0] || "";
  const status = real.length ? "BITES" : "ESCAPE";
  console.log(status.padEnd(8), label, hit.slice(0, 180));
  return { status, n: real.length, first: hit.slice(0, 320), rawFails: res.fails.length };
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

const out = {};

const e11 = clone("E11S1");
const d11 = byRoom.get("E11S1");
const clean = judge("E11S1 unmodified", e11, d11);
out.E11S1_unmodified = clean.status;
const L0 = e11.meta.extensions.laneMeta;
out.E11S1_shrink = {
  wanted: L0.shrunk?.wanted,
  tiles: L0.fullRun?.tiles,
  reserved: L0.fullRun?.reserved,
  lane: L0.reserved,
  byRound: L0.fullRun?.byRound,
  to: L0.fullRun?.to,
  used: L0.fullRun?.used,
  ext: L0.fullRun?.ext,
  shallow: L0.fullRun?.shallow,
};

const p98one = clone("E11S1");
bothLanes(p98one, (L) => {
  const extra = "19,27";
  L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
  const last = L.fullRun.byRound[L.fullRun.byRound.length - 1];
  L.fullRun.byRound = [...L.fullRun.byRound.slice(0, -1).map((r) => r.slice()), [...last.map(String), extra]];
  L.fullRun.tiles = L.fullRun.reserved.length;
  L.shrunk.wanted = L.fullRun.tiles;
});
out.E11S1_append_19_27_fullRun_only_wanted_eq_tiles = judge("98 19,27 fullRun only wanted:=tiles", p98one, d11).status;

const p98both = clone("E11S1");
bothLanes(p98both, (L) => {
  const extra = "19,27";
  L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
  L.reserved = [...(L.reserved || []).map(String), extra];
  L.tiles = L.reserved.length;
  L.fullRun.tiles = L.fullRun.reserved.length;
  const last = L.fullRun.byRound[L.fullRun.byRound.length - 1];
  L.fullRun.byRound = [...L.fullRun.byRound.slice(0, -1).map((r) => r.slice()), [...last.map(String), extra]];
  L.shrunk.wanted = L.fullRun.tiles + 1;
});
out.E11S1_append_19_27_both_lists_wanted_plus_1 = judge("98 19,27 both lists wanted+1", p98both, d11).status;

const pWant = clone("E11S1");
bothLanes(pWant, (L) => { L.shrunk.wanted += 1; });
out.E11S1_wanted_plus_1 = judge("98 wanted += 1", pWant, d11).status;

const pSwap = clone("E11S1");
bothLanes(pSwap, (L) => {
  const from = "18,27", to = "19,27";
  L.fullRun.reserved = L.fullRun.reserved.map((t) => (String(t) === from ? to : String(t)));
  L.reserved = (L.reserved || []).map((t) => (String(t) === from ? to : String(t)));
  L.fullRun.byRound = L.fullRun.byRound.map((r) => r.map((t) => (String(t) === from ? to : String(t))));
});
out.E11S1_prefix_swap_18_27_to_19_27 = judge("98 prefix swap 18,27→19,27", pSwap, d11).status;

const src12 = byName.get("E11S2");
const d12 = byRoom.get("E11S2");
const last = src12.meta.shortfalls.find((s) => s.ladder).ladder.rungs.at(-1);
const bonus = last.needDeepBonus;
const leaky = last.cutTiles.map((t) => (t.x === 20 && t.y === 9 ? { x: 19, y: 9 } : { x: t.x, y: t.y }));
const leakLap = enclosureMobility(d12.terrain, src12, leaky);
const leakExt = exteriorFlood(d12.terrain, new Set(leaky.map((t) => key(t.x, t.y))));
const leakSit = !!leakExt[src12.sitter.x + src12.sitter.y * 50];
const sealed = last.cutTiles.map((t) => (t.x === 29 && t.y === 33 ? { x: 28, y: 34 } : { x: t.x, y: t.y }));
const sealLap = enclosureMobility(d12.terrain, src12, sealed);
const sealExt = exteriorFlood(d12.terrain, new Set(sealed.map((t) => key(t.x, t.y))));
const sealSit = !!sealExt[src12.sitter.x + src12.sitter.y * 50];
out.E11S2_facts = {
  bonus,
  has209: last.cutTiles.some((t) => t.x === 20 && t.y === 9),
  has2933: last.cutTiles.some((t) => t.x === 29 && t.y === 33),
  origLap: last.mobility,
  origComplete: last.complete,
  leakSit,
  leakLap,
  sealSit,
  sealLap,
};

const pLeak = clone("E11S2");
applyBonus(pLeak, bonus, (r) => {
  r.cutTiles = leaky.map((t) => ({ x: t.x, y: t.y }));
  r.mobility = leakLap;
});
out.E11S2_leaky_20_9_to_19_9_complete_true = judge("88 leaky 20,9→19,9 complete stays true + regen", pLeak, d12).status;

const pLeakInc = clone("E11S2");
applyBonus(pLeakInc, bonus, (r) => {
  r.cutTiles = leaky.map((t) => ({ x: t.x, y: t.y }));
  r.mobility = leakLap;
  r.complete = false;
});
out.E11S2_leaky_plus_complete_false_regen = judge("88 leaky 20,9→19,9 complete=false + regen", pLeakInc, d12).status;

const pSeal = clone("E11S2");
applyBonus(pSeal, bonus, (r) => {
  r.cutTiles = sealed.map((t) => ({ x: t.x, y: t.y }));
  r.mobility = sealLap;
});
out.E11S2_sealing_29_33_to_28_34 = judge("88 sealing 29,33→28,34 + regen", pSeal, d12).status;

const pPick = clone("E11S1");
pPick.meta.shell.protectRadius = 6;
out.E11S1_protectRadius_12_to_6 = judge("pick protectRadius 12→6", pPick, d11).status;
const pBase = clone("E11S1");
pBase.meta.shell.baseCut += 1;
pBase.meta.shell.priceyWall = pBase.meta.shell.baseCut > 45 ? 1 : 0;
out.E11S1_baseCut_plus_1 = judge("pick baseCut += 1 keep priceyWall", pBase, d11).status;
const pScore = clone("E11S1");
pScore.meta.seedScore = 0;
out.E11S1_seedScore_0 = judge("seedScore := 0", pScore, d11).status;
const pScore2 = clone("E11S1");
pScore2.meta.seedScore = (pScore2.meta.seedScore || 0) + 999;
out.E11S1_seedScore_plus_999 = judge("seedScore += 999", pScore2, d11).status;

function findRoom(pred) {
  return plans.find((p) => p && p.room && pred(p));
}
function zeroJudge(label, room, mutate) {
  const p = clone(room);
  const d = byRoom.get(room);
  mutate(p);
  out[label] = judge(label, p, d).status;
}
{
  const stitchedR = findRoom((p) => (p.meta?.walls?.stitched || 0) > 0);
  const stitchTilesR = findRoom((p) => (p.meta?.walls?.stitchTiles || 0) > 0);
  const eatenR = findRoom((p) => (p.meta?.labs?.roadsEaten || 0) > 0);
  const towerR = findRoom((p) => (p.meta?.towers?.nukeWindow?.towerOnly || 0) > 0);
  const stubR = findRoom((p) => (p.meta?.extensions?.stubRoads || 0) > 0);
  out.p12_targets = {
    stitched: stitchedR?.room,
    stitchTiles: stitchTilesR?.room,
    roadsEaten: eatenR?.room,
    towerOnly: towerR?.room,
    stubRoads: stubR?.room,
    stitchedN: stitchedR?.meta?.walls?.stitched,
    stitchTilesN: stitchTilesR?.meta?.walls?.stitchTiles,
    roadsEatenN: eatenR?.meta?.labs?.roadsEaten,
    towerOnlyN: towerR?.meta?.towers?.nukeWindow?.towerOnly,
    stubRoadsN: stubR?.meta?.extensions?.stubRoads,
  };
  if (stitchedR) {
    zeroJudge("p12_stitched_zeroed", stitchedR.room, (p) => { p.meta.walls.stitched = 0; });
  }
  if (stitchTilesR) {
    zeroJudge("p12_stitchTiles_zeroed", stitchTilesR.room, (p) => { p.meta.walls.stitchTiles = 0; });
  }
  if (eatenR) {
    zeroJudge("p12_roadsEaten_zeroed", eatenR.room, (p) => { p.meta.labs.roadsEaten = 0; });
  }
  if (towerR) {
    zeroJudge("p12_towerOnly_zeroed", towerR.room, (p) => { p.meta.towers.nukeWindow.towerOnly = 0; });
  }
  if (stubR) {
    zeroJudge("p12_stubRoads_zeroed", stubR.room, (p) => { p.meta.extensions.stubRoads = 0; });
  }
}

{
  const mcR = findRoom((p) => (p.meta?.misc?.mineralContainer || 0) > 0);
  const mdR = findRoom((p) => typeof p.meta?.towers?.rcl5Pair?.minDmgPicked === "number" && p.meta.towers.rcl5Pair.minDmgPicked !== 0);
  const sfR = findRoom((p) => (p.meta?.walls?.servedFree || 0) > 0);
  const stR = findRoom((p) => (p.meta?.walls?.laidByKind?.stitch || 0) > 0 && typeof p.meta?.walls?.stitched === "number");
  const st2R = plans.find((p) => (p.meta?.walls?.laidByKind?.stitch || 0) >= 2 && typeof p.meta?.walls?.stitched === "number") || stR;
  out.p13_targets = {
    mineralContainer: mcR?.room,
    mineralContainerN: mcR?.meta?.misc?.mineralContainer,
    minDmgPicked: mdR?.room,
    minDmgPickedN: mdR?.meta?.towers?.rcl5Pair?.minDmgPicked,
    servedFree: sfR?.room,
    servedFreeN: sfR?.meta?.walls?.servedFree,
    stitched: stR?.room,
    stitchedN: stR?.meta?.walls?.stitched,
    laidStitch: stR?.meta?.walls?.laidByKind?.stitch,
    stitched2: st2R?.room,
    stitched2N: st2R?.meta?.walls?.stitched,
    laidStitch2: st2R?.meta?.walls?.laidByKind?.stitch,
  };
  if (mcR) {
    zeroJudge("p13_mineralContainer_zeroed", mcR.room, (p) => { p.meta.misc.mineralContainer = 0; });
  }
  if (mdR) {
    zeroJudge("p13_minDmgPicked_zeroed", mdR.room, (p) => { p.meta.towers.rcl5Pair.minDmgPicked = 0; });
  }
  if (sfR) {
    zeroJudge("p13_servedFree_zeroed", sfR.room, (p) => { p.meta.walls.servedFree = 0; });
  }
  if (stR) {
    zeroJudge("p13_stitched_set_to_2", stR.room, (p) => { p.meta.walls.stitched = 2; });
    zeroJudge("p13_stitched_zeroed", stR.room, (p) => { p.meta.walls.stitched = 0; });
  }
  if (st2R && st2R.room !== stR?.room) {
    zeroJudge("p13_stitched_set_to_2_laid2", st2R.room, (p) => { p.meta.walls.stitched = 2; });
  } else if (st2R) {
    zeroJudge("p13_stitched_set_to_2_laid2", st2R.room, (p) => { p.meta.walls.stitched = 2; });
  }
}

{
  const apR = findRoom((p) => p.meta?.towers?.rcl5Pair?.arrayPartner && Number.isInteger(p.meta.towers.rcl5Pair.arrayPartner.x));
  const pkR = findRoom((p) => p.meta?.towers?.rcl5Pair?.picked && Number.isInteger(p.meta.towers.rcl5Pair.picked.x) && (p.structures?.tower || []).length >= 2);
  const mdR = findRoom((p) => typeof p.meta?.towers?.rcl5Pair?.minDmgArray === "number" && p.meta.towers.rcl5Pair.minDmgArray !== 0);
  const bgR = findRoom((p) => typeof p.meta?.shell?.battlementGap === "number" && p.meta.shell.battlementGap === 0);
  const bgtR = findRoom((p) => Array.isArray(p.meta?.shell?.battlementGapTiles));
  const bhR = findRoom((p) => p.meta?.walls?.mobility?.boundHeld === true);
  const ftR = findRoom((p) => typeof p.meta?.walls?.fillerTiles === "number" && p.meta.walls.fillerTiles !== 1);
  const scR = findRoom((p) => (p.meta?.labs?.shallowCost || 0) > 0);
  const srR = findRoom((p) => Array.isArray(p.meta?.walls?.reflow?.shallowRefused) && p.meta.walls.reflow.shallowRefused.length > 0);
  const blR = findRoom((p) => typeof p.meta?.walls?.mobility?.boundLap === "number" && p.meta.walls.mobility.boundLap !== 0 && p.meta.walls.mobility.boundHeld === true);
  out.p14_targets = {
    arrayPartner: apR?.room,
    arrayPartnerK: apR && `${apR.meta.towers.rcl5Pair.arrayPartner.x},${apR.meta.towers.rcl5Pair.arrayPartner.y}`,
    picked: pkR?.room,
    pickedK: pkR && `${pkR.meta.towers.rcl5Pair.picked.x},${pkR.meta.towers.rcl5Pair.picked.y}`,
    minDmgArray: mdR?.room,
    minDmgArrayN: mdR?.meta?.towers?.rcl5Pair?.minDmgArray,
    battlementGap: bgR?.room,
    battlementGapN: bgR?.meta?.shell?.battlementGap,
    battlementGapTiles: bgtR?.room,
    battlementGapTilesN: bgtR?.meta?.shell?.battlementGapTiles?.length,
    boundHeld: bhR?.room,
    boundHeldV: bhR?.meta?.walls?.mobility?.boundHeld,
    boundLap: blR?.room,
    boundLapN: blR?.meta?.walls?.mobility?.boundLap,
    fillerTiles: ftR?.room,
    fillerTilesN: ftR?.meta?.walls?.fillerTiles,
    extFace: ftR?.meta?.walls?.laidByKind?.extFace,
    shallowCost: scR?.room,
    shallowCostN: scR?.meta?.labs?.shallowCost,
    shallowRefused: srR?.room,
    shallowRefusedN: srR?.meta?.walls?.reflow?.shallowRefused?.length,
  };
  if (apR) zeroJudge("p14_arrayPartner_moved", apR.room, (p) => { p.meta.towers.rcl5Pair.arrayPartner = { x: 1, y: 1 }; });
  if (pkR) zeroJudge("p14_rcl5Pair_picked_moved", pkR.room, (p) => { p.meta.towers.rcl5Pair.picked = { x: 1, y: 1 }; });
  if (mdR) zeroJudge("p14_minDmgArray_zeroed", mdR.room, (p) => { p.meta.towers.rcl5Pair.minDmgArray = 0; });
  if (bgR) zeroJudge("p14_battlementGap_set_to_1", bgR.room, (p) => { p.meta.shell.battlementGap = 1; });
  if (bgtR) zeroJudge("p14_battlementGapTiles_planted", bgtR.room, (p) => { p.meta.shell.battlementGapTiles = [{ x: 1, y: 1 }]; });
  if (bhR) zeroJudge("p14_boundHeld_flipped", bhR.room, (p) => { p.meta.walls.mobility.boundHeld = false; });
  if (blR) zeroJudge("p14_boundLap_zeroed", blR.room, (p) => { p.meta.walls.mobility.boundLap = 0; });
  if (ftR) zeroJudge("p14_fillerTiles_set_to_1", ftR.room, (p) => { p.meta.walls.fillerTiles = 1; });
  if (scR) zeroJudge("p14_shallowCost_zeroed", scR.room, (p) => { p.meta.labs.shallowCost = 0; });
  if (srR) zeroJudge("p14_shallowRefused_cleared", srR.room, (p) => { p.meta.walls.reflow.shallowRefused = []; });
}

{
  const fgR = findRoom((p) => typeof p.meta?.walls?.mobility?.floorGated === "number" && p.meta.walls.mobility.floorGated !== 0);
  const foR = findRoom((p) => (p.meta?.walls?.mobility?.floorOver || 0) > 0);
  const fogR = findRoom((p) => (p.meta?.walls?.mobility?.floorOverGated || 0) > 0);
  const fdR = findRoom((p) => (p.meta?.walls?.mobility?.worst?.freeDin || 0) > 0);
  const maR = findRoom((p) => (p.meta?.walls?.mobility?.massAdds || 0) !== 0);
  const mdR = findRoom((p) => (p.meta?.roadOrder?.maxDist || 0) > 0);
  const drR = findRoom((p) => typeof p.meta?.extensions?.deepReach === "number" && p.meta.extensions.deepReach !== 0);
  const scR = findRoom((p) => typeof p.meta?.extensions?.stubCap === "number" && p.meta.extensions.stubCap !== 0);
  const msR = findRoom((p) => p.meta?.mineralSeatAtReservation && Number.isInteger(p.meta.mineralSeatAtReservation.x));
  const ma2R = findRoom((p) => p.meta?.mineralApproachAtReservation && Number.isInteger(p.meta.mineralApproachAtReservation.x));
  const scFlip = findRoom((p) => p.meta?.extensions?.stubCap === 43);
  out.p15_targets = {
    floorGated: fgR?.room,
    floorGatedN: fgR?.meta?.walls?.mobility?.floorGated,
    floorOver: foR?.room,
    floorOverN: foR?.meta?.walls?.mobility?.floorOver,
    floorOverGated: fogR?.room,
    floorOverGatedN: fogR?.meta?.walls?.mobility?.floorOverGated,
    freeDin: fdR?.room,
    freeDinN: fdR?.meta?.walls?.mobility?.worst?.freeDin,
    massAdds: maR?.room,
    massAddsN: maR?.meta?.walls?.mobility?.massAdds,
    maxDist: mdR?.room,
    maxDistN: mdR?.meta?.roadOrder?.maxDist,
    deepReach: drR?.room,
    deepReachN: drR?.meta?.extensions?.deepReach,
    hubDistCap: drR?.meta?.extensions?.hubDistCap,
    stubCap: scR?.room,
    stubCapN: scR?.meta?.extensions?.stubCap,
    mineralSeatAtReservation: msR?.room,
    mineralSeatAtReservationK: msR && `${msR.meta.mineralSeatAtReservation.x},${msR.meta.mineralSeatAtReservation.y}`,
    mineralApproachAtReservation: ma2R?.room,
    mineralApproachAtReservationK: ma2R && `${ma2R.meta.mineralApproachAtReservation.x},${ma2R.meta.mineralApproachAtReservation.y}`,
  };
  if (fgR) zeroJudge("p15_floorGated_zeroed", fgR.room, (p) => { p.meta.walls.mobility.floorGated = 0; });
  if (foR) zeroJudge("p15_floorOver_zeroed", foR.room, (p) => { p.meta.walls.mobility.floorOver = 0; });
  if (fogR) zeroJudge("p15_floorOverGated_zeroed", fogR.room, (p) => { p.meta.walls.mobility.floorOverGated = 0; });
  if (fdR) zeroJudge("p15_freeDin_zeroed", fdR.room, (p) => { p.meta.walls.mobility.worst.freeDin = 0; });
  if (maR) {
    zeroJudge("p15_massAdds_zeroed", maR.room, (p) => {
      p.meta.walls.mobility.massAdds = 0;
      if (p.meta.walls.mobility.worst) p.meta.walls.mobility.worst.massAdds = 0;
    });
  }
  if (mdR) zeroJudge("p15_maxDist_zeroed", mdR.room, (p) => { p.meta.roadOrder.maxDist = 0; });
  if (drR) zeroJudge("p15_deepReach_zeroed", drR.room, (p) => { p.meta.extensions.deepReach = 0; });
  if (scR) zeroJudge("p15_stubCap_zeroed", scR.room, (p) => { p.meta.extensions.stubCap = 0; });
  if (msR) zeroJudge("p15_mineralSeatAtReservation_moved", msR.room, (p) => { p.meta.mineralSeatAtReservation = { x: 1, y: 1 }; });
  if (ma2R) zeroJudge("p15_mineralApproachAtReservation_moved", ma2R.room, (p) => { p.meta.mineralApproachAtReservation = { x: 1, y: 1 }; });
  if (scFlip) zeroJudge("p15_stubCap_43_to_51", scFlip.room, (p) => { p.meta.extensions.stubCap = 51; });
}

{
  const capR = findRoom((p) => typeof p.meta?.extensions?.hubDistCap === "number");
  const cap16 = findRoom((p) => p.meta?.extensions?.hubDistCap === 16);
  const lapR = findRoom((p) => typeof p.meta?.walls?.reflow?.lapCeilingFloor === "number" && p.meta.walls.reflow.lapCeilingFloor !== 0);
  const corrR = findRoom((p) => (p.meta?.extensions?.corridorPlaced || 0) === 60 && (p.meta?.extensions?.corridorFallback || 0) === 0);
  const corrFb = findRoom((p) => (p.meta?.extensions?.corridorFallback || 0) > 0 && typeof p.meta?.extensions?.corridorPlaced === "number");
  out.p16_targets = {
    hubDistCap: capR?.room,
    hubDistCapN: capR?.meta?.extensions?.hubDistCap,
    hubDistCap16: cap16?.room,
    lapCeilingFloor: lapR?.room,
    lapCeilingFloorN: lapR?.meta?.walls?.reflow?.lapCeilingFloor,
    corridorPlaced60: corrR?.room,
    corridorPlacedN: corrR?.meta?.extensions?.corridorPlaced,
    corridorFallbackN: corrR?.meta?.extensions?.corridorFallback,
    corridorFallbackRoom: corrFb?.room,
    corridorFallbackV: corrFb?.meta?.extensions?.corridorFallback,
    corridorPlacedV: corrFb?.meta?.extensions?.corridorPlaced,
  };
  if (capR) zeroJudge("p16_hubDistCap_off_ladder_17", capR.room, (p) => { p.meta.extensions.hubDistCap = 17; });
  if (cap16) zeroJudge("p16_hubDistCap_16_to_19", cap16.room, (p) => { p.meta.extensions.hubDistCap = 19; });
  if (lapR) {
    zeroJudge("p16_lapCeilingFloor_zeroed", lapR.room, (p) => {
      p.meta.walls.reflow.lapCeilingFloor = 0;
      if (p.meta.extensions?.reflow) p.meta.extensions.reflow.lapCeilingFloor = 0;
    });
  }
  if (corrR) zeroJudge("p16_corridorPlaced_zeroed_keep_fallback_0", corrR.room, (p) => { p.meta.extensions.corridorPlaced = 0; });
  if (corrR) {
    zeroJudge("p16_corridorPlaced_0_fallback_1", corrR.room, (p) => {
      p.meta.extensions.corridorPlaced = 0;
      p.meta.extensions.corridorFallback = 1;
    });
  }
}

{
  const stc43 = findRoom((p) => p.meta?.extensions?.stubCap === 43);
  const stc51 = findRoom((p) => p.meta?.extensions?.stubCap === 51);
  const fuR = findRoom((p) => typeof p.meta?.extensions?.laneMeta?.floorUngated === "number" && p.meta.extensions.laneMeta.floorUngated !== 0);
  const radR = findRoom((p) => Array.isArray(p.meta?.composeOpts?.radii) && p.meta.composeOpts.radii.length > 0);
  const radAbs = findRoom((p) => p.meta?.composeOpts && !p.meta.composeOpts.radii);
  const pkR = findRoom((p) => typeof p.meta?.composeOpts?.parkCap === "number" && p.meta.composeOpts.parkCap !== 0);
  const swR = findRoom((p) => p.meta?.composeOpts?.takeTowerSwap?.to && Number.isInteger(p.meta.composeOpts.takeTowerSwap.to.x));
  out.p17_targets = {
    stub43: stc43?.room,
    stub43N: stc43?.meta?.extensions?.stubCap,
    stub51: stc51?.room,
    stub51N: stc51?.meta?.extensions?.stubCap,
    floorUngated: fuR?.room,
    floorUngatedN: fuR?.meta?.extensions?.laneMeta?.floorUngated,
    radii: radR?.room,
    radiiV: radR?.meta?.composeOpts?.radii,
    radiiNeed: radR?.meta?.composeOpts?.needDeepBonus,
    radiiAbsent: radAbs?.room,
    parkCap: pkR?.room,
    parkCapN: pkR?.meta?.composeOpts?.parkCap,
    parkFloorCap: pkR?.meta?.ctrlParkFloorCap,
    takeSwap: swR?.room,
    takeSwapTo: swR && swR.meta.composeOpts.takeTowerSwap.to,
    takeSwapFrom: swR && swR.meta.composeOpts.takeTowerSwap.from,
  };
  if (stc43) zeroJudge("p17_stubCap_43_to_51", stc43.room, (p) => { p.meta.extensions.stubCap = 51; });
  if (stc51) zeroJudge("p17_stubCap_51_to_43", stc51.room, (p) => { p.meta.extensions.stubCap = 43; });
  if (fuR) {
    zeroJudge("p17_floorUngated_zeroed", fuR.room, (p) => {
      if (p.meta.extensions?.laneMeta) p.meta.extensions.laneMeta.floorUngated = 0;
      if (p.meta.walls?.mobility?.lanes) p.meta.walls.mobility.lanes.floorUngated = 0;
    });
  }
  if (radR) zeroJudge("p17_radii_rewritten", radR.room, (p) => { p.meta.composeOpts.radii = [1, 2, 3]; });
  if (radAbs) zeroJudge("p17_radii_planted", radAbs.room, (p) => { p.meta.composeOpts.radii = [6, 7, 8, 9, 10, 11, 12, 13, 14]; });
  if (pkR) zeroJudge("p17_parkCap_zeroed", pkR.room, (p) => { p.meta.composeOpts.parkCap = 0; });
  if (swR) zeroJudge("p17_takeTowerSwap_to_moved", swR.room, (p) => { p.meta.composeOpts.takeTowerSwap.to = { x: 1, y: 1 }; });
}

{
  const mhR = findRoom((p) => typeof p.meta?.extensions?.maxHubDist === "number" && p.meta.extensions.maxHubDist !== 0);
  const swFrom = findRoom((p) => p.meta?.composeOpts?.takeTowerSwap?.from && Number.isInteger(p.meta.composeOpts.takeTowerSwap.from.x));
  out.p18_targets = {
    maxHubDist: mhR?.room,
    maxHubDistN: mhR?.meta?.extensions?.maxHubDist,
    hubDistCap: mhR?.meta?.extensions?.hubDistCap,
    takeFrom: swFrom?.room,
    takeFromK: swFrom && swFrom.meta.composeOpts.takeTowerSwap.from,
    takeToK: swFrom && swFrom.meta.composeOpts.takeTowerSwap.to,
  };
  if (mhR) zeroJudge("p18_maxHubDist_zeroed", mhR.room, (p) => { p.meta.extensions.maxHubDist = 0; });
  if (mhR) zeroJudge("p18_maxHubDist_plus_1", mhR.room, (p) => { p.meta.extensions.maxHubDist += 1; });
  if (swFrom) zeroJudge("p18_takeTowerSwap_from_moved_1_1", swFrom.room, (p) => { p.meta.composeOpts.takeTowerSwap.from = { x: 1, y: 1 }; });
  if (swFrom) {
    const to = swFrom.meta.composeOpts.takeTowerSwap.to;
    const from = swFrom.meta.composeOpts.takeTowerSwap.from;
    const towers = new Set((swFrom.structures?.tower || []).map((t) => `${t.x},${t.y}`));
    const alt = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      .map(([dx, dy]) => ({ x: to.x + dx, y: to.y + dy }))
      .find((t) => (t.x !== from.x || t.y !== from.y) && !towers.has(`${t.x},${t.y}`));
    out.p18_targets.otherD8 = alt || null;
    if (alt) zeroJudge("p18_takeTowerSwap_from_other_D8", swFrom.room, (p) => { p.meta.composeOpts.takeTowerSwap.from = { x: alt.x, y: alt.y }; });
    if (alt) zeroJudge("p19_takeTowerSwap_from_other_D8", swFrom.room, (p) => { p.meta.composeOpts.takeTowerSwap.from = { x: alt.x, y: alt.y }; });
    if (alt) zeroJudge("p19_takeTowerSwap_from_other_D8_rewrite_published", swFrom.room, (p) => {
      p.meta.composeOpts.takeTowerSwap.from = { x: alt.x, y: alt.y };
      if (p.meta.towers?.acrossPriorTake?.taken) p.meta.towers.acrossPriorTake.taken.from = { x: alt.x, y: alt.y };
      if (p.meta.towers?.towerSwapTaken) p.meta.towers.towerSwapTaken.from = { x: alt.x, y: alt.y };
      if (p.meta.towers?.towerSwapOffer?.best) p.meta.towers.towerSwapOffer.best.from = { x: alt.x, y: alt.y };
    });
  }
}
{
  const ucR = findRoom((p) => typeof p.meta?.walls?.unreachedClusters === "number");
  const ueR = findRoom((p) => typeof p.meta?.walls?.unreachableExts === "number");
  const seR = findRoom((p) => typeof p.meta?.walls?.servedExts === "number");
  out.p19_targets = {
    unreachedClusters: ucR?.room,
    unreachedClustersN: ucR?.meta?.walls?.unreachedClusters,
    unreachableExts: ueR?.room,
    unreachableExtsN: ueR?.meta?.walls?.unreachableExts,
    servedExts: seR?.room,
    servedExtsN: seR?.meta?.walls?.servedExts,
    fillerTiles: seR?.meta?.walls?.fillerTiles,
  };
  if (ucR) zeroJudge("p19_unreachedClusters_plus_1", ucR.room, (p) => { p.meta.walls.unreachedClusters += 1; });
  if (ueR) zeroJudge("p19_unreachableExts_plus_1", ueR.room, (p) => { p.meta.walls.unreachableExts += 1; });
  if (seR) zeroJudge("p19_servedExts_plus_1", seR.room, (p) => { p.meta.walls.servedExts += 1; });
  if (seR) zeroJudge("p19_servedExts_plus_1_and_fillerTiles_plus_1", seR.room, (p) => {
    p.meta.walls.servedExts = (p.meta.walls.servedExts || 0) + 1;
    if (typeof p.meta.walls.fillerTiles === "number") p.meta.walls.fillerTiles += 1;
    else p.meta.walls.fillerTiles = 1;
  });
}

{
  const bogR = findRoom((p) => typeof p.meta?.misc?.mobilityVeto?.baseOverGated === "number" && p.meta.misc.mobilityVeto.baseOverGated !== 0);
  const bog0 = findRoom((p) => typeof p.meta?.misc?.mobilityVeto?.baseOverGated === "number");
  const wasR = findRoom((p) => (p.meta?.misc?.mobilityVeto?.refused || []).some((r) => r && typeof r.wasLap === "number" && r.wasLap !== 0));
  out.p20_targets = {
    baseOverGated: bogR?.room,
    baseOverGatedN: bogR?.meta?.misc?.mobilityVeto?.baseOverGated,
    baseOverGatedAny: bog0?.room,
    baseOverGatedAnyN: bog0?.meta?.misc?.mobilityVeto?.baseOverGated,
    wasLap: wasR?.room,
    wasLapN: wasR && (wasR.meta.misc.mobilityVeto.refused.find((r) => r && typeof r.wasLap === "number") || {}).wasLap,
    wasLapCount: wasR && wasR.meta.misc.mobilityVeto.refused.filter((r) => r && typeof r.wasLap === "number").length,
  };
  if (bogR) zeroJudge("p20_baseOverGated_zeroed", bogR.room, (p) => { p.meta.misc.mobilityVeto.baseOverGated = 0; });
  if (bog0 && (!bogR || bog0.room !== bogR.room)) {
    zeroJudge("p20_baseOverGated_plus_1", bog0.room, (p) => { p.meta.misc.mobilityVeto.baseOverGated += 1; });
  } else if (bogR) {
    zeroJudge("p20_baseOverGated_plus_1", bogR.room, (p) => { p.meta.misc.mobilityVeto.baseOverGated += 1; });
  }
  if (wasR) {
    zeroJudge("p20_wasLap_zeroed", wasR.room, (p) => {
      for (const r of p.meta.misc.mobilityVeto.refused || []) {
        if (r && typeof r.wasLap === "number") r.wasLap = 0;
      }
    });
    zeroJudge("p20_wasLap_plus_1", wasR.room, (p) => {
      for (const r of p.meta.misc.mobilityVeto.refused || []) {
        if (r && typeof r.wasLap === "number") r.wasLap += 1;
      }
    });
  }
}

fs.writeFileSync(path.join(DIR, "probe-out.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
