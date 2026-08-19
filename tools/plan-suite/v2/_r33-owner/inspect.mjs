/**
 * Hash sample + residue-room inventory. No validate import. Round 33.
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
const churn = ["E12S1", "E15S4", "E11S1", "E2S7", "E1S4"];

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
}, null, 2));
