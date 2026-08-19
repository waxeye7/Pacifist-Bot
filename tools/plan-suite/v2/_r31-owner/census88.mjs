/**
 * r29p10 census: shrink/drop fullRun shape + complete discarded-rung sitter leaks.
 * Throwaway. Does not write the artifact.
 */
import { enclosureMobility } from "../layer-shell.mjs";
import { exteriorFlood } from "../shared.mjs";
import { loadPlans, loadRooms, K } from "./common.mjs";

const { md5, plans } = loadPlans();
const { byRoom } = loadRooms();
const uniqSort = (a) => [...new Set(a.map(String))].sort();

const shrinks = [];
const drops = [];
const kept = [];
for (const p of plans) {
  const L = p.meta?.extensions?.laneMeta;
  if (!L?.fullRun) continue;
  const fr = L.fullRun;
  const W = p.meta?.walls?.mobility?.lanes;
  const row = {
    room: p.room,
    wanted: L.shrunk?.wanted ?? L.wanted ?? null,
    to: L.shrunk?.to ?? null,
    laneTiles: L.tiles,
    laneRounds: L.rounds,
    laneRes: (L.reserved || []).length,
    frTiles: fr.tiles,
    frRounds: fr.rounds,
    frUsed: fr.used,
    frTo: fr.to,
    frRes: (fr.reserved || []).length,
    byRound: (fr.byRound || []).map((r) => r.length),
    ran: fr.ran,
    ext: fr.ext,
    shallow: fr.shallow,
    prefixEq: uniqSort((fr.byRound || []).slice(0, L.shrunk?.to || 0).flat()).join("|") ===
      uniqSort(L.reserved || []).join("|"),
    reservedEqLane: uniqSort(fr.reserved || []).join("|") === uniqSort(L.reserved || []).join("|"),
    twinResEq: JSON.stringify(fr.reserved) === JSON.stringify(W?.fullRun?.reserved),
    twinByEq: JSON.stringify(fr.byRound) === JSON.stringify(W?.fullRun?.byRound),
    suffix: (fr.reserved || []).map(String).filter((k) => !(L.reserved || []).map(String).includes(k)),
  };
  if (L.shrunk) shrinks.push(row);
  else if (L.dropped) drops.push(row);
  else kept.push(row);
}

const isDiscarded = (row, esc, shippedRamp) => {
  if (!row) return false;
  const picked = esc && typeof esc.pickedNeedDeepBonus === "number" ? esc.pickedNeedDeepBonus : null;
  if (esc && picked !== null) return row.needDeepBonus !== picked;
  return typeof row.ramparts === "number" && row.ramparts !== shippedRamp;
};

const leaks = [];
const completeDisc = [];
const betterLap = [];
let incompleteDisc = 0;
let noTerrain = 0;
let roomsWithDisc = 0;

for (const p of plans) {
  const d = byRoom.get(p.room);
  const esc = p.meta?.shellEscalation;
  const ladder = (p.meta?.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
  const shippedRamp = (p.structures?.rampart || []).length;
  const shippedCut = p.meta?.shell?.cutAtFreeze?.length ? p.meta.shell.cutAtFreeze : p.meta?.shell?.cut;
  if (!d?.terrain || !p.sitter) {
    if (ladder || (esc && esc.rungs)) noTerrain++;
    continue;
  }
  const shippedLap =
    shippedCut && shippedCut.length ? enclosureMobility(d.terrain, p, shippedCut) : null;
  const seen = new Set();
  const consider = (row, where) => {
    if (!row || !isDiscarded(row, esc, shippedRamp)) return;
    if (row.complete !== true) {
      incompleteDisc++;
      return;
    }
    const cuts = Array.isArray(row.cutTiles) && row.cutTiles.length ? row.cutTiles : null;
    if (!cuts) return;
    const id = `${p.room}|${row.needDeepBonus}|${where}`;
    if (seen.has(id)) return;
    seen.add(id);
    const ext = exteriorFlood(d.terrain, new Set(cuts.map(K)));
    const leak = !!ext[p.sitter.x + p.sitter.y * 50];
    const lap = enclosureMobility(d.terrain, p, cuts);
    const rec = {
      room: p.room,
      where,
      bonus: row.needDeepBonus,
      complete: row.complete,
      ramp: row.ramparts,
      cutN: cuts.length,
      shippedRamp,
      shippedCutN: shippedCut?.length ?? null,
      lap,
      shippedLap,
      leak,
      last: false,
    };
    completeDisc.push(rec);
    if (typeof lap === "number" && typeof shippedLap === "number" && lap < shippedLap - 1e-6) {
      betterLap.push(rec);
    }
    if (leak) leaks.push(rec);
  };
  let any = false;
  if (ladder) {
    const rungs = ladder.ladder.rungs;
    rungs.forEach((row, i) => {
      if (row && isDiscarded(row, esc, shippedRamp) && row.complete === true) any = true;
      consider(row, "ladder");
      if (completeDisc.length && completeDisc[completeDisc.length - 1]?.room === p.room &&
          completeDisc[completeDisc.length - 1]?.where === "ladder" &&
          completeDisc[completeDisc.length - 1]?.bonus === row?.needDeepBonus) {
        completeDisc[completeDisc.length - 1].last = i === rungs.length - 1;
      }
    });
  }
  if (esc && Array.isArray(esc.rungs)) {
    esc.rungs.forEach((row, i) => {
      if (row && isDiscarded(row, esc, shippedRamp) && row.complete === true) any = true;
      consider(row, "esc");
      if (completeDisc.length && completeDisc[completeDisc.length - 1]?.room === p.room &&
          completeDisc[completeDisc.length - 1]?.where === "esc" &&
          completeDisc[completeDisc.length - 1]?.bonus === row?.needDeepBonus) {
        completeDisc[completeDisc.length - 1].last = i === esc.rungs.length - 1;
      }
    });
  }
  if (any) roomsWithDisc++;
}

const lastBetter = betterLap.filter((r) => r.last);
console.log(JSON.stringify({
  md5,
  shrinks: shrinks.length,
  drops: drops.length,
  kept: kept.length,
  shrinksDetail: shrinks,
  dropRooms: drops.map((d) => d.room),
  completeDiscarded: completeDisc.length,
  roomsWithCompleteDisc: roomsWithDisc,
  incompleteDisc,
  noTerrain,
  honestLeaks: leaks.length,
  leaks,
  betterLap: betterLap.length,
  lastBetter: lastBetter.length,
  betterWhere: {
    ladder: betterLap.filter((r) => r.where === "ladder").length,
    esc: betterLap.filter((r) => r.where === "esc").length,
  },
}, null, 2));
