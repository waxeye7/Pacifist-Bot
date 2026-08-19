/**
 * Hash sample + residue-room inventory. No validate import. Round 36.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { EXPECTED_MD5, hashedRooms, loadPlans, loadRooms, K } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { md5, plans } = loadPlans();
const { rooms } = loadRooms();
const hashed = hashedRooms(plans);
const sample = hashed.slice(0, 5);
const churn = ["E11S1", "E2S7", "E1S4"];

const fullRun = { n: 0, ran: 0, shrunk: 0, dropped: 0, plain: 0, reservedMissing: 0, byRoundMissing: 0, laneResMissing: 0 };
const shrunkRooms = [];
const droppedRooms = [];
const taken = [];
const ladders = [];
const seed = { has: 0, missing: [], seedNeHub: [], score0: 0, skipN: 0 };
const cutAdoptedNonempty = [];

for (const p of plans) {
  const L = p.meta?.extensions?.laneMeta;
  if (L?.fullRun) {
    fullRun.n++;
    if (L.fullRun.ran) fullRun.ran++;
    if (L.shrunk) {
      fullRun.shrunk++;
      shrunkRooms.push({
        room: p.room,
        tiles: L.fullRun.tiles,
        rounds: L.fullRun.rounds,
        ext: L.fullRun.ext,
        shallow: L.fullRun.shallow,
        to: L.fullRun.to,
        used: L.fullRun.used,
        reserved: Array.isArray(L.fullRun.reserved) ? L.fullRun.reserved : null,
        byRound: Array.isArray(L.fullRun.byRound) ? L.fullRun.byRound.map((r) => r.slice()) : null,
        laneRes: Array.isArray(L.reserved) ? L.reserved : null,
        shrunk: L.shrunk,
        shippedExt: (p.structures?.extension || []).length,
        shippedShallow: p.meta?.extensions?.shallow || 0,
      });
    }
    if (L.dropped) {
      fullRun.dropped++;
      droppedRooms.push(p.room);
    }
    if (!L.fullRun.ran && !L.shrunk && !L.dropped) fullRun.plain++;
    if (!Array.isArray(L.fullRun.reserved)) fullRun.reservedMissing++;
    if (!Array.isArray(L.fullRun.byRound)) fullRun.byRoundMissing++;
    if (!Array.isArray(L.reserved)) fullRun.laneResMissing++;
  }
  const R = p.meta?.sealedRecovery;
  if (R && (R.taken || R.outcome === "taken" || (R.fixedHolders || []).length)) {
    taken.push({
      room: p.room,
      taken: R.taken,
      outcome: R.outcome,
      nHold: (R.fixedHolders || []).length,
      holders: (R.fixedHolders || []).slice(0, 8).map((h) => ({
        t: h.type,
        k: K(h),
        keys: Object.keys(h),
        r: h.recovers,
        d: h.recoversDeep,
      })),
      cap: (R.pockets || []).reduce((n, pk) => n + (pk.tiles || 0), 0),
    });
  }
  const sf = (p.meta?.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
  if (sf) {
    const shipped = (p.structures?.rampart || []).length;
    const freezeN = (p.meta?.shell?.cutAtFreeze || []).length;
    ladders.push({
      room: p.room,
      shipped,
      freezeN,
      cutN: (p.meta?.shell?.cut || []).length,
      picked: p.meta?.shellEscalation?.pickedNeedDeepBonus,
      rungs: sf.ladder.rungs.map((r) => ({
        b: r.needDeepBonus,
        mob: r.mobility,
        ramp: r.ramparts,
        cut: (r.cutTiles || []).length,
      })),
    });
  }
  if (p.seed && Number.isInteger(p.seed.x)) {
    seed.has++;
    const hub = p.hub || p.sitter;
    if (hub && (p.seed.x !== hub.x || p.seed.y !== hub.y)) {
      seed.seedNeHub.push(`${p.room}:${p.seed.x},${p.seed.y}->${hub.x},${hub.y}`);
    }
  } else seed.missing.push(p.room);
  if (p.meta?.seedScore === 0) seed.score0++;
  if (typeof p.meta?.seedSkip === "number" && p.meta.seedSkip > 0) seed.skipN++;
  if ((p.meta?.shell?.cutAdopted || []).length) cutAdoptedNonempty.push(p.room);
}

const e11 = plans.find((p) => p.room === "E11S1");
const e11Lane = e11?.meta?.extensions?.laneMeta;
const e11s2 = plans.find((p) => p.room === "E11S2");

const p13 = {
  mineralContainer: [],
  minDmgPicked: [],
  servedFree: [],
  stitched: [],
};
for (const p of plans) {
  const mc = p.meta?.misc?.mineralContainer;
  if (typeof mc === "number") p13.mineralContainer.push({ room: p.room, n: mc });
  const md = p.meta?.towers?.rcl5Pair?.minDmgPicked;
  if (typeof md === "number") p13.minDmgPicked.push({ room: p.room, n: md });
  const sf = p.meta?.walls?.servedFree;
  if (typeof sf === "number") p13.servedFree.push({ room: p.room, n: sf });
  const st = p.meta?.walls?.stitched;
  const laid = p.meta?.walls?.laidByKind?.stitch || 0;
  if (typeof st === "number") p13.stitched.push({ room: p.room, stitched: st, laid });
}
const p13sum = {
  mineralContainerN: p13.mineralContainer.length,
  mineralContainerNz: p13.mineralContainer.filter((r) => r.n !== 0).length,
  mineralContainerVals: [...new Set(p13.mineralContainer.map((r) => r.n))].sort((a, b) => a - b),
  minDmgPickedN: p13.minDmgPicked.length,
  minDmgPickedNz: p13.minDmgPicked.filter((r) => r.n !== 0).length,
  minDmgPickedSample: p13.minDmgPicked.filter((r) => r.n !== 0).slice(0, 8),
  servedFreeN: p13.servedFree.length,
  servedFreeNz: p13.servedFree.filter((r) => r.n !== 0).length,
  servedFreeVals: [...new Set(p13.servedFree.map((r) => r.n))].sort((a, b) => a - b),
  stitchedN: p13.stitched.length,
  stitchedNz: p13.stitched.filter((r) => r.stitched !== 0).length,
  laidGt1: p13.stitched.filter((r) => r.laid > 1),
  mismatchFlag: p13.stitched.filter((r) => r.stitched !== (r.laid > 0 ? 1 : 0)),
  mismatchCount: p13.stitched.filter((r) => r.stitched !== r.laid),
};

const p14 = {
  arrayPartner: [],
  picked: [],
  minDmgArray: [],
  battlementGap: [],
  battlementGapTiles: [],
  boundHeld: [],
  boundLap: [],
  fillerTiles: [],
  shallowCost: [],
  shallowRefused: [],
};
for (const p of plans) {
  const pair = p.meta?.towers?.rcl5Pair;
  if (pair?.arrayPartner && Number.isInteger(pair.arrayPartner.x)) {
    p14.arrayPartner.push({ room: p.room, k: `${pair.arrayPartner.x},${pair.arrayPartner.y}`, swapped: pair.swapped });
  }
  if (pair?.picked && Number.isInteger(pair.picked.x)) {
    p14.picked.push({ room: p.room, k: `${pair.picked.x},${pair.picked.y}` });
  }
  if (typeof pair?.minDmgArray === "number") p14.minDmgArray.push({ room: p.room, n: pair.minDmgArray });
  if (typeof p.meta?.shell?.battlementGap === "number") {
    p14.battlementGap.push({ room: p.room, n: p.meta.shell.battlementGap });
  }
  if (Array.isArray(p.meta?.shell?.battlementGapTiles)) {
    p14.battlementGapTiles.push({ room: p.room, n: p.meta.shell.battlementGapTiles.length });
  }
  const bh = p.meta?.walls?.mobility?.boundHeld;
  const bl = p.meta?.walls?.mobility?.boundLap;
  if (typeof bh === "boolean") p14.boundHeld.push({ room: p.room, v: bh, lap: bl });
  if (typeof bl === "number") p14.boundLap.push({ room: p.room, n: bl, held: bh });
  if (typeof p.meta?.walls?.fillerTiles === "number") {
    p14.fillerTiles.push({
      room: p.room,
      n: p.meta.walls.fillerTiles,
      extFace: p.meta.walls.laidByKind?.extFace,
    });
  }
  if (typeof p.meta?.labs?.shallowCost === "number") {
    p14.shallowCost.push({ room: p.room, n: p.meta.labs.shallowCost });
  }
  if (Array.isArray(p.meta?.walls?.reflow?.shallowRefused)) {
    p14.shallowRefused.push({ room: p.room, n: p.meta.walls.reflow.shallowRefused.length });
  }
}
const p14sum = {
  arrayPartnerN: p14.arrayPartner.length,
  pickedN: p14.picked.length,
  minDmgArrayN: p14.minDmgArray.length,
  minDmgArrayNz: p14.minDmgArray.filter((r) => r.n !== 0).length,
  minDmgArraySample: p14.minDmgArray.filter((r) => r.n !== 0).slice(0, 6),
  battlementGapN: p14.battlementGap.length,
  battlementGapNz: p14.battlementGap.filter((r) => r.n !== 0).length,
  battlementGapVals: [...new Set(p14.battlementGap.map((r) => r.n))].sort((a, b) => a - b),
  battlementGapTilesN: p14.battlementGapTiles.length,
  battlementGapTilesNz: p14.battlementGapTiles.filter((r) => r.n !== 0).length,
  boundHeldN: p14.boundHeld.length,
  boundHeldTrue: p14.boundHeld.filter((r) => r.v === true).length,
  boundLapN: p14.boundLap.length,
  boundLapNz: p14.boundLap.filter((r) => r.n !== 0).length,
  fillerTilesN: p14.fillerTiles.length,
  fillerTilesNz: p14.fillerTiles.filter((r) => r.n !== 0).length,
  fillerMismatch: p14.fillerTiles.filter((r) => r.n !== (r.extFace || 0)).slice(0, 8),
  shallowCostN: p14.shallowCost.length,
  shallowCostNz: p14.shallowCost.filter((r) => r.n !== 0).length,
  shallowCostSample: p14.shallowCost.filter((r) => r.n !== 0).slice(0, 6),
  shallowRefusedN: p14.shallowRefused.length,
  shallowRefusedNz: p14.shallowRefused.filter((r) => r.n !== 0).length,
  shallowRefusedSample: p14.shallowRefused.filter((r) => r.n !== 0).slice(0, 6),
};

const out = {
  md5,
  md5Ok: md5 === EXPECTED_MD5,
  plans: plans.length,
  roomsDump: rooms.length,
  hashedAll: hashed,
  sample,
  churn,
  fullRun,
  shrunkRooms,
  droppedRooms,
  taken,
  laddersN: ladders.length,
  fatRungs: ladders.filter((l) => l.rungs.some((r) => r.ramp > l.shipped)),
  e11s1: e11Lane && {
    shrunk: e11Lane.shrunk,
    reserved: e11Lane.fullRun?.reserved,
    byRound: e11Lane.fullRun?.byRound,
    laneRes: e11Lane.reserved,
    tiles: e11Lane.fullRun?.tiles,
    rounds: e11Lane.fullRun?.rounds,
    to: e11Lane.fullRun?.to,
    used: e11Lane.fullRun?.used,
    ext: e11Lane.fullRun?.ext,
    shallow: e11Lane.fullRun?.shallow,
    ran: e11Lane.fullRun?.ran,
  },
  e11s2: e11s2 && {
    shipped: (e11s2.structures?.rampart || []).length,
    cut: (e11s2.meta?.shell?.cut || []).length,
    freeze: (e11s2.meta?.shell?.cutAtFreeze || []).length,
    picked: e11s2.meta?.shellEscalation?.pickedNeedDeepBonus,
    rungs: (e11s2.meta?.shellEscalation?.rungs || []).map((r) => ({
      b: r.needDeepBonus,
      mob: r.mobility,
      ramp: r.ramparts,
      cut: (r.cutTiles || []).length,
    })),
  },
  seed: {
    has: seed.has,
    missing: seed.missing,
    seedNeHubN: seed.seedNeHub.length,
    seedNeHub: seed.seedNeHub,
    score0: seed.score0,
    skipN: seed.skipN,
  },
  cutAdoptedNonempty,
  p13: p13sum,
  p14: p14sum,
  sampleProtect: sample.map((s) => {
    const p = plans.find((x) => x.room === s.room);
    return {
      room: s.room,
      protectRadius: p.meta?.shell?.protectRadius,
      baseCut: p.meta?.shell?.baseCut,
      cut: (p.meta?.shell?.cut || []).length,
      freeze: (p.meta?.shell?.cutAtFreeze || []).length,
      seedScore: p.meta?.seedScore,
      seed: p.seed,
      hub: p.hub,
    };
  }),
};

fs.writeFileSync(path.join(DIR, "inspect.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  md5: out.md5,
  md5Ok: out.md5Ok,
  plans: out.plans,
  roomsDump: out.roomsDump,
  sample: out.sample,
  fullRun: out.fullRun,
  shrunkN: out.shrunkRooms.length,
  shrunk: out.shrunkRooms.map((r) => r.room),
  dropped: out.droppedRooms,
  takenN: out.taken.length,
  taken: out.taken.map((t) => `${t.room}:${t.outcome || t.taken}:${t.nHold}/${t.cap}`),
  laddersN: out.laddersN,
  fatRungs: out.fatRungs.map((l) => l.room),
  e11s1: out.e11s1,
  e11s2: out.e11s2,
  seed: { has: out.seed.has, missing: out.seed.missing.length, neHub: out.seed.seedNeHubN, skipN: out.seed.skipN },
  cutAdoptedNonempty: out.cutAdoptedNonempty,
  p13: out.p13,
  p14: out.p14,
}, null, 2));
