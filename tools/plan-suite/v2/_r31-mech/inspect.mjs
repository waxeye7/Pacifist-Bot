/**
 * Fleet inventory for r31 attacks. Terrain + shipped lists. checkRoom only on sample.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom } from "../validate.mjs";
import {
  D4,
  EXPECTED_MD5,
  K,
  KT,
  ROOT,
  cheb,
  depthFromExterior,
  floodExterior,
  hashedRooms,
  idx,
  loadPlans,
  loadRooms,
  mineralSeat,
  realFails,
} from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { md5, plans, raw } = loadPlans();
const { rooms, byRoom } = loadRooms();
const hashed = hashedRooms(plans);
const named = ["E11S1", "E11S2", "E11S3", "E11S7", "E2S7"];
const sampleNames = [...new Set([...hashed.slice(0, 5).map((r) => r.room), ...named])];

const fullRun = { n: 0, ran: 0, shrunk: 0, dropped: 0, plain: 0, reservedMissing: 0 };
const shrunk = [];
const dropped = [];
const plain60 = [];
const ladders = [];
const taken = [];
const seed = { has: 0, missing: 0, neHub: 0, eqHub: 0, onStorage: 0, neHubRooms: [] };
const cutAdopted = { nonempty: 0, empty: 0, l7adds: 0, l7badds: 0 };
const cutPasses = { reconcile: 0, pruneDel: 0, twoPruneDel: 0, twoPruneRooms: [], swapable: [] };
const boardsField = [];

function sameSet(a, b) {
  const A = new Set(a.map(K));
  const B = new Set(b.map(K));
  if (A.size !== B.size) return false;
  for (const k of A) if (!B.has(k)) return false;
  return true;
}

for (const p of plans) {
  const L = p.meta?.extensions?.laneMeta;
  if (L?.fullRun) {
    fullRun.n++;
    if (L.fullRun.ran) fullRun.ran++;
    if (!Array.isArray(L.fullRun.reserved)) fullRun.reservedMissing++;
    const row = {
      room: p.room,
      tiles: L.tiles,
      rounds: L.rounds,
      frTiles: L.fullRun.tiles,
      reserved: Array.isArray(L.fullRun.reserved) ? L.fullRun.reserved.length : null,
      laneRes: Array.isArray(L.reserved) ? L.reserved.length : null,
      shippedExt: (p.structures?.extension || []).length,
      shippedShallow: p.meta?.extensions?.shallow || 0,
      shrunk: L.shrunk || null,
      dropped: L.dropped === true,
    };
    if (L.shrunk) {
      fullRun.shrunk++;
      if (shrunk.length < 12) shrunk.push(row);
    } else if (L.dropped) {
      fullRun.dropped++;
      if (dropped.length < 8) dropped.push(row);
    } else {
      fullRun.plain++;
      if (row.shippedExt === 60 && row.shippedShallow === 0 && plain60.length < 4) plain60.push(row);
    }
  }

  const sh = p.meta?.shell || {};
  const sf = (p.meta?.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
  if (sf) {
    const shippedR = (p.structures?.rampart || []).length;
    const freeze = sh.cutAtFreeze || [];
    const cut = sh.cut || [];
    const rungs = (p.meta?.shellEscalation?.rungs || sf.ladder.rungs || []).map((r) => ({
      bonus: r.needDeepBonus,
      ramparts: r.ramparts,
      mobility: r.mobility,
      cut: (r.cutTiles || []).length,
      fat: typeof r.ramparts === "number" && r.ramparts > shippedR,
    }));
    ladders.push({
      room: p.room,
      shippedR,
      cut: cut.length,
      freeze: freeze.length,
      cutEqFreeze: sameSet(cut, freeze),
      picked: p.meta?.shellEscalation?.pickedNeedDeepBonus,
      hasEsc: !!p.meta?.shellEscalation,
      fat: rungs.some((r) => r.fat),
      rungs,
    });
  }

  if (p.meta?.sealedRecovery?.outcome === "taken") {
    taken.push({
      room: p.room,
      fixed: (p.meta.sealedRecovery.fixedHolders || []).length,
      holders: (p.meta.sealedRecovery.fixedHolders || []).map(
        (h) => `${h.type}@${K(h)}=${h.recovers}/${h.recoversDeep}`,
      ),
    });
  }

  if (p.seed && Number.isInteger(p.seed.x)) {
    seed.has++;
    const hub = p.hub || p.sitter;
    const st = (p.structures?.storage || [])[0];
    if (hub && p.seed.x === hub.x && p.seed.y === hub.y) seed.eqHub++;
    else {
      seed.neHub++;
      if (seed.neHubRooms.length < 8) {
        seed.neHubRooms.push({ room: p.room, seed: p.seed, hub, score: p.meta?.seedScore });
      }
    }
    if (st && p.seed.x === st.x && p.seed.y === st.y) seed.onStorage++;
  } else seed.missing++;

  if (Array.isArray(sh.cutAdopted) && sh.cutAdopted.length) cutAdopted.nonempty++;
  else cutAdopted.empty++;
  const drift = sh.cutDrift || [];
  cutAdopted.l7adds += drift.filter((e) => e && e.op === "add" && e.pass === "layer7-reconcileSeal").length;
  cutAdopted.l7badds += drift.filter((e) => e && e.op === "add" && e.pass === "layer7b-reconcileSeal").length;

  const cp = sh.cutPasses || [];
  if (cp.some((m) => m && m.kind === "reconcileSeal" && Number.isInteger(m.sealCritical))) cutPasses.reconcile++;
  if (cp.some((m) => m && m.kind === "inertPrune" && m.rampartsDeleted > 0)) cutPasses.pruneDel++;
  const a = cp.find((m) => m && m.pass === "layer7-inertPrune");
  const b = cp.find((m) => m && m.pass === "layer7b-inertPrune");
  if (a && b && a.rampartsDeleted > 0 && b.rampartsDeleted > 0) {
    cutPasses.twoPruneDel++;
    cutPasses.twoPruneRooms.push(p.room);
  }
  if (a && b && a.rampartsDeleted !== b.rampartsDeleted && a.rampartsDeleted >= (b.removes || 0) && b.rampartsDeleted >= (a.removes || 0)) {
    cutPasses.swapable.push({
      room: p.room,
      a: a.rampartsDeleted,
      b: b.rampartsDeleted,
      aRem: a.removes,
      bRem: b.removes,
      aR: a.ramparts,
      bR: b.ramparts,
      shipped: (p.structures?.rampart || []).length,
    });
  }

  if (p.boards != null || p.meta?.boards != null) boardsField.push(p.room);
}

function inspectRoom(plan) {
  const d = byRoom.get(plan.room);
  const s = plan.structures || {};
  const sh = plan.meta?.shell || {};
  const ramps = new Set((s.rampart || []).map(K));
  const roads = new Set((s.road || []).map(K));
  const cut = new Set((sh.cut || []).map(K));
  const freeze = new Set((sh.cutAtFreeze || []).map(K));
  const sitter = plan.sitter || plan.hub;
  const extF = floodExterior(d.terrain, ramps);
  const cutF = floodExterior(d.terrain, cut);
  const freezeF = floodExterior(d.terrain, freeze);
  const depth = depthFromExterior(extF);
  const leaks = [];
  for (const t of Object.keys(s)) {
    if (t === "road" || t === "rampart") continue;
    for (const q of s[t] || []) {
      if (extF[idx(q.x, q.y)] && !ramps.has(K(q)) && t !== "extractor") leaks.push(`${t}@${K(q)}`);
    }
  }
  const core = ["storage", "spawn", "terminal", "tower", "lab", "nuker", "observer"];
  const throughCut = [];
  const throughFreeze = [];
  for (const t of core) {
    for (const q of s[t] || []) {
      if (cutF[idx(q.x, q.y)]) throughCut.push(`${t}@${K(q)}`);
      if (freezeF[idx(q.x, q.y)]) throughFreeze.push(`${t}@${K(q)}`);
    }
  }
  let shallowBare = 0;
  let noD4 = 0;
  for (const e of s.extension || []) {
    if (depth[idx(e.x, e.y)] < 4 && !ramps.has(K(e))) shallowBare++;
    if (!D4.some(([dx, dy]) => roads.has(KT(e.x + dx, e.y + dy)))) noD4++;
  }
  const seat = mineralSeat(plan);
  const L = plan.meta?.extensions?.laneMeta;
  const res = checkRoom(plan, d.terrain, d.objects, null);
  const fails = realFails(res);
  return {
    room: plan.room,
    h: hashed.find((r) => r.room === plan.room)?.h,
    ext: (s.extension || []).length,
    road: (s.road || []).length,
    ramp: (s.rampart || []).length,
    cut: (sh.cut || []).length,
    freeze: (sh.cutAtFreeze || []).length,
    lap: plan.meta?.shell?.mobilityShipped?.maxGated ?? plan.meta?.walls?.mobility?.builtGated ?? null,
    baseCut: sh.baseCut,
    protectRadius: sh.protectRadius,
    pricey: !!sh.priceyWall,
    seed: plan.seed,
    hub: plan.hub,
    sitter,
    mineral: seat ? { ...seat, off: !roads.has(K(seat)) } : null,
    leaks,
    throughCut,
    throughFreeze,
    sitterOutCut: sitter ? !!cutF[idx(sitter.x, sitter.y)] : null,
    sitterOutFreeze: sitter ? !!freezeF[idx(sitter.x, sitter.y)] : null,
    shallowBare,
    noD4,
    lane: L && {
      tiles: L.tiles,
      rounds: L.rounds,
      ran: L.fullRun?.ran,
      shrunk: L.shrunk || null,
      reserved: Array.isArray(L.reserved) ? L.reserved.length : null,
      frReserved: Array.isArray(L.fullRun?.reserved) ? L.fullRun.reserved.length : null,
    },
    taken: plan.meta?.sealedRecovery?.outcome === "taken",
    check: { pass: fails.length === 0, nFails: fails.length, fails: fails.slice(0, 2) },
  };
}

const sample = sampleNames.map((r) => inspectRoom(plans.find((p) => p.room === r))).filter(Boolean);

let parseFail = 0, seedEq = 0, seedNe = 0, captionMismatch = 0;
const mismatches = [];
for (const p of plans) {
  const html = path.join(ROOT, `${p.room}.html`);
  if (!fs.existsSync(html)) { parseFail++; continue; }
  const src = fs.readFileSync(html, "utf8");
  const m = /seed \((\d+),(\d+)\) → hub \((\d+),(\d+)\)/.exec(src);
  if (!m) { parseFail++; continue; }
  const filmSeed = { x: +m[1], y: +m[2] };
  const filmHub = { x: +m[3], y: +m[4] };
  if (filmSeed.x === filmHub.x && filmSeed.y === filmHub.y) seedEq++;
  else seedNe++;
  if (!p.seed || p.seed.x !== filmSeed.x || p.seed.y !== filmSeed.y || p.hub.x !== filmHub.x || p.hub.y !== filmHub.y) {
    captionMismatch++;
    if (mismatches.length < 6) mismatches.push({ room: p.room, film: { seed: filmSeed, hub: filmHub }, plan: { seed: p.seed, hub: p.hub } });
  }
}

const out = {
  md5,
  md5Ok: md5 === EXPECTED_MD5,
  bytes: raw.length,
  roomsDump: rooms.length,
  plans: plans.length,
  missingTerrain: plans.filter((p) => !byRoom.has(p.room)).map((p) => p.room),
  hashedFive: hashed.slice(0, 5),
  boardsField,
  fullRun,
  shrunk,
  dropped,
  plain60,
  ladders: {
    n: ladders.length,
    fat: ladders.filter((l) => l.fat).length,
    e11s2: ladders.find((l) => l.room === "E11S2"),
  },
  taken,
  seed,
  film: { parseFail, seedEq, seedNe, captionMismatch, mismatches },
  cutAdopted,
  cutPasses,
  sample,
};

fs.writeFileSync(path.join(DIR, "inspect.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  md5,
  md5Ok: out.md5Ok,
  bytes: out.bytes,
  rooms: out.plans,
  dump: out.roomsDump,
  missing: out.missingTerrain,
  hashedFive: out.hashedFive,
  boardsField,
  fullRun,
  taken: taken.map((t) => t.room + ":" + t.fixed),
  seed,
  film: out.film,
  cutPasses,
  sample: sample.map((s) => ({
    room: s.room,
    ext: s.ext,
    road: s.road,
    ramp: s.ramp,
    cut: s.cut,
    freeze: s.freeze,
    lap: s.lap,
    baseCut: s.baseCut,
    protectRadius: s.protectRadius,
    check: s.check.pass,
    leaks: s.leaks.length,
    throughCut: s.throughCut.length,
    throughFreeze: s.throughFreeze.length,
  })),
}, null, 2));
