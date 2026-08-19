/**
 * Throwaway: time E11S1 defender-lane reservation replay vs shipped prefix.
 * Does not import validate.mjs. Does not write the artifact.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { D4, PARK_PROTECT, invalidateExterior } from "../shared.mjs";
import { planHub } from "../layer-hub.mjs";
import { planShell, mobilityStats, interiorWalk, maskFromKeys } from "../layer-shell.mjs";
import { planTowers } from "../layer-towers.mjs";
import { planLabs } from "../layer-labs.mjs";
import { planMisc } from "../layer-misc.mjs";
import { loadPlans, loadRooms, floodExterior, depthFromExterior, K } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(DIR, "../layer-ext.mjs");
const TIMED = path.join(DIR, "_layer-ext-timed.mjs");
const ROOM = "E11S1";

function sortJ(a) {
  return [...a].map(String).sort().join("|");
}
function sameSet(a, b) {
  return sortJ(a) === sortJ(b);
}
function prefixOf(byRound, n) {
  return (byRound || []).slice(0, n).flat().map(String);
}

function reserveParkSeats(terrain, plan, cap) {
  const tiles = plan.meta?.ctrlParkSeatSearchTiles || [];
  plan.parkReserve = [];
  plan.meta.ctrlParkReserve = [];
  plan.meta.ctrlParkFloor = 0;
  if (!tiles.length || !plan.depth) return;
  const roadSet = new Set((plan.structures.road || []).map((r) => `${r.x},${r.y}`));
  const hub = plan.hub || plan.sitter;
  const rank = (p) => {
    const i = p.x + p.y * 50;
    const deep = plan.depth[i] >= 4 ? 1 : 0;
    const faced = D4.some(([dx, dy]) => roadSet.has(`${p.x + dx},${p.y + dy}`)) ? 1 : 0;
    const far = hub ? Math.max(Math.abs(p.x - hub.x), Math.abs(p.y - hub.y)) : 0;
    return [deep, faced, -far, p.y, p.x];
  };
  const pool = tiles
    .map((p) => ({ p, r: rank(p) }))
    .sort((a, b) => {
      for (let i = 0; i < a.r.length; i++) if (a.r[i] !== b.r[i]) return a.r[i] - b.r[i];
      return 0;
    });
  const n = Math.min(pool.length, typeof cap === "number" ? cap : PARK_PROTECT);
  plan.parkReserve = pool.slice(0, n).map((e) => ({ x: e.p.x, y: e.p.y }));
  plan.meta.ctrlParkReserve = plan.parkReserve;
  plan.meta.ctrlParkFloor = n;
}

function composeUpToExt(d, shellOpts = {}) {
  const split = {};
  let t = performance.now();
  const hub = planHub(d.terrain, d.objects, shellOpts);
  split.hub = performance.now() - t;
  if (hub.error) return { error: hub.error };
  const plan = { room: d.room, terrain: d.terrain, ...hub };
  plan.meta.shortfalls = [...(plan.meta.shortfalls || [])];
  plan.meta.roadLayer = {};
  const tagRoads = (layer, roads) => {
    for (const r of roads || []) plan.meta.roadLayer[`${r.x},${r.y}`] = layer;
  };
  tagRoads(1, plan.structures.road);
  t = performance.now();
  const shell = planShell(d.terrain, plan, shellOpts);
  split.shell = performance.now() - t;
  if (shell.error) return { error: shell.error, plan };
  plan.structures.rampart = shell.rampart;
  invalidateExterior(plan);
  plan.shell = shell.shell;
  plan.exterior = shell.exterior;
  plan.depth = shell.depth;
  plan.meta.counts.rampart = shell.rampart.length;
  plan.meta.shell = shell.shell;
  plan.meta.shell.cutAtFreeze = (shell.shell.cut || []).map((t) => ({ x: t.x, y: t.y }));
  plan.meta.shell.cutDrift = [];
  plan.meta.shell.cutPasses = [];
  reserveParkSeats(d.terrain, plan, shellOpts.parkCap);
  plan.meta.composeOpts = { ...shellOpts, shellCache: undefined };
  t = performance.now();
  const tw = planTowers(d.terrain, plan, shellOpts);
  split.towers = performance.now() - t;
  if (tw.error) plan.towerError = tw.error;
  else {
    plan.structures.tower = tw.tower;
    plan.structures.road.push(...tw.roads);
    tagRoads(3, tw.roads);
    plan.meta.counts.tower = tw.tower.length;
    plan.meta.towers = tw.towersMeta;
  }
  t = performance.now();
  const lb = planLabs(d.terrain, plan);
  split.labs = performance.now() - t;
  if (lb.error) plan.labError = lb.error;
  else {
    plan.structures.lab = lb.lab;
    plan.labInputs = lb.labInputs;
    if (lb.removeRoads?.length) {
      const gone = new Set(lb.removeRoads.map((r) => `${r.x},${r.y}`));
      plan.structures.road = plan.structures.road.filter((r) => !gone.has(`${r.x},${r.y}`));
      for (const k of gone) delete plan.meta.roadLayer[k];
    }
    plan.structures.road.push(...lb.roads);
    tagRoads(4, lb.roads);
    if (lb.shallowLabs.length) {
      plan.structures.rampart.push(...lb.shallowLabs);
      invalidateExterior(plan);
    }
    plan.meta.counts.lab = lb.lab.length;
    plan.meta.labs = lb.labsMeta;
  }
  t = performance.now();
  const ms = planMisc(d.terrain, plan);
  split.misc = performance.now() - t;
  if (ms.error) plan.miscError = ms.error;
  else {
    plan.structures.nuker = ms.nuker;
    plan.structures.observer = ms.observer;
    if (ms.extractor.length) plan.structures.extractor = ms.extractor;
    if (ms.mineralContainer.length) plan.structures.container.push(...ms.mineralContainer);
    if (ms.bubbles.length && plan.structures.rampart) {
      plan.structures.rampart.push(...ms.bubbles);
      invalidateExterior(plan);
    }
    plan.structures.road.push(...ms.roads);
    tagRoads(5, ms.roads);
    plan.meta.counts.nuker = ms.nuker.length;
    plan.meta.counts.observer = ms.observer.length;
    plan.meta.counts.extractor = ms.extractor.length;
    plan.meta.counts.container = plan.structures.container.length;
    plan.meta.misc = ms.miscMeta;
  }
  plan.__split = split;
  return plan;
}

function objectTilesOf(plan) {
  return new Set([
    ...(plan.sources || []).map((s) => K(s)),
    ...(plan.controller ? [K(plan.controller)] : []),
    ...(plan.mineral ? [K(plan.mineral)] : []),
  ]);
}

function attachFrozenBoard(plan, terrain) {
  const freeze = plan.meta?.shell?.cutAtFreeze || plan.meta?.shell?.cut || [];
  const block = new Set(freeze.map((t) => K(t)));
  plan.exterior = floodExterior(terrain, block);
  plan.depth = depthFromExterior(plan.exterior);
  plan.shell = { ...(plan.meta?.shell || {}), cut: freeze.map((t) => ({ x: t.x, y: t.y })) };
  plan.objectTiles = objectTilesOf(plan);
  return freeze;
}

function stripShippedToL6In(shipped, terrain) {
  const plan = structuredClone(shipped);
  const rl = plan.meta?.roadLayer || {};
  plan.structures.road = (plan.structures.road || []).filter((r) => (rl[`${r.x},${r.y}`] ?? 99) <= 5);
  plan.structures.extension = [];
  attachFrozenBoard(plan, terrain);
  return plan;
}

function writeTimedLayer() {
  let src = fs.readFileSync(SRC, "utf8");
  src = src.replaceAll('from "./shared.mjs"', 'from "../shared.mjs"');
  src = src.replaceAll('from "./layer-hub.mjs"', 'from "../layer-hub.mjs"');
  src = src.replaceAll('from "./layer-shell.mjs"', 'from "../layer-shell.mjs"');
  src = src.replace("  mobilityStats,\n} from \"../layer-shell.mjs\";", "  mobilityStats as mobilityStatsImpl,\n} from \"../layer-shell.mjs\";");
  if (!src.includes("mobilityStats as mobilityStatsImpl")) {
    throw new Error("failed to rewrite mobilityStats import");
  }
  const wrap = `
const __probe = (globalThis.__laneProbe = { events: [], msCalls: 0, msMs: 0, skelMs: 0 });
function mobilityStats(cut, ext, mask) {
  const t = performance.now();
  const r = mobilityStatsImpl(cut, ext, mask);
  __probe.msMs += performance.now() - t;
  __probe.msCalls++;
  return r;
}
`;
  src = src.replace("const TARGET = 60;", wrap + "const TARGET = 60;");
  const skelMark = "  const NEED = Math.round(TARGET * 1.25);";
  if (!src.includes(skelMark)) throw new Error("missing skeleton NEED mark");
  src = src.replace(skelMark, "  const __tSkel = performance.now();\n" + skelMark);
  const boundMark = "  let boundBlocked = null;";
  if (!src.includes(boundMark)) throw new Error("missing boundBlocked mark");
  src = src.replace(
    boundMark,
    `  __probe.skelMs += performance.now() - __tSkel;
  const __tRes = performance.now();
  const __ms0 = __probe.msCalls;
  const __msMs0 = __probe.msMs;
` + boundMark,
  );
  const resMark = "    laneInfo.reserved = [...laneSet].sort();";
  if (!src.includes(resMark)) throw new Error("missing reserved mark");
  src = src.replace(
    resMark,
    resMark +
      `
    const __ev = {
      hubCap, laneRounds, rescue,
      ms: performance.now() - __tRes,
      skelMs: __probe.skelMs,
      mobCalls: __probe.msCalls - __ms0,
      mobMs: __probe.msMs - __msMs0,
      tiles: laneInfo.tiles,
      rounds: laneInfo.rounds,
      reserved: [...laneInfo.reserved],
      byRound: laneInfo.byRound.map((r) => [...r]),
      stranded: laneInfo.stranded,
      strandedFirst: laneInfo.strandedFirst,
      capped: laneInfo.capped,
      deep: laneInfo.deep,
      deepBudget: laneInfo.deepBudget,
    };
    __probe.events.push(__ev);
    if (globalThis.__laneProbeEarly && (globalThis.__laneProbeHubCap == null || hubCap === globalThis.__laneProbeHubCap) && laneRounds === (globalThis.__laneProbeRounds ?? 10)) {
      const err = new Error("LANE_PROBE_EARLY");
      err.code = "LANE_PROBE_EARLY";
      err.event = __ev;
      throw err;
    }`,
  );
  fs.writeFileSync(TIMED, src);
}

function reservedTouches(a, b) {
  const A = new Set(a.map(String));
  const B = new Set(b.map(String));
  const onlyA = [...A].filter((k) => !B.has(k));
  const onlyB = [...B].filter((k) => !A.has(k));
  return { onlyA, onlyB, eq: onlyA.length === 0 && onlyB.length === 0 };
}

async function runExt(plan, terrain, label) {
  const { planExtensions } = await import(pathToFileURL(TIMED).href + "?t=" + Date.now() + label);
  globalThis.__laneProbe = globalThis.__laneProbe || { events: [], msCalls: 0, msMs: 0, skelMs: 0 };
  globalThis.__laneProbe.events = [];
  globalThis.__laneProbe.msCalls = 0;
  globalThis.__laneProbe.msMs = 0;
  globalThis.__laneProbe.skelMs = 0;
  const t0 = performance.now();
  let out = null;
  let early = null;
  try {
    out = planExtensions(terrain, plan);
  } catch (e) {
    if (e && e.code === "LANE_PROBE_EARLY") early = e.event;
    else throw e;
  }
  return {
    label,
    wallMs: performance.now() - t0,
    early,
    events: globalThis.__laneProbe.events.map((e) => ({ ...e })),
    msCalls: globalThis.__laneProbe.msCalls,
    msMs: globalThis.__laneProbe.msMs,
    extN: out?.extension?.length ?? null,
    err: out?.error ?? null,
  };
}

function idx(x, y) {
  return x + y * 50;
}

const { plans } = loadPlans();
const { byRoom } = loadRooms();
const shipped = plans.find((p) => p.room === ROOM);
const d = byRoom.get(ROOM);
if (!shipped || !d) {
  console.log(JSON.stringify({ error: "missing E11S1", hasPlan: !!shipped, hasRoom: !!d }));
  process.exit(1);
}

const L = shipped.meta?.extensions?.laneMeta || {};
const fr = L.fullRun || {};
const shippedLane = (L.reserved || []).map(String);
const shippedFull = (fr.reserved || []).map(String);
const shippedByRound = (fr.byRound || []).map((r) => r.map(String));
const to = typeof L.shrunk?.to === "number" ? L.shrunk.to : fr.to;
const wanted = L.shrunk?.wanted ?? null;
const hubCap = shipped.meta?.extensions?.hubDistCap ?? 16;
const composeOpts = { ...(shipped.meta?.composeOpts || {}) };
delete composeOpts.shellCache;

const dump = {
  room: ROOM,
  hubDistCap: hubCap,
  composeOptsKeys: Object.keys(composeOpts).sort(),
  lane: {
    tiles: L.tiles,
    rounds: L.rounds,
    dropped: L.dropped === true,
    shrunk: L.shrunk || null,
    reserved: shippedLane,
  },
  fullRun: {
    tiles: fr.tiles,
    rounds: fr.rounds,
    ran: fr.ran,
    ext: fr.ext,
    shallow: fr.shallow,
    used: fr.used,
    to: fr.to,
    reserved: shippedFull,
    byRound: shippedByRound,
    wanted,
  },
  artifact: {
    hasShell: !!shipped.shell,
    hasExterior: !!shipped.exterior,
    hasDepth: !!shipped.depth,
    hasTerrain: !!shipped.terrain,
    hasObjectTiles: !!shipped.objectTiles,
    hasComposeOpts: !!shipped.meta?.composeOpts,
    hasCutAtFreeze: Array.isArray(shipped.meta?.shell?.cutAtFreeze),
    hasRoadLayer: !!shipped.meta?.roadLayer,
  },
  cutAtFreeze: (shipped.meta?.shell?.cutAtFreeze || []).length,
  cutShipped: (shipped.meta?.shell?.cut || []).length,
  roads: (shipped.structures?.road || []).length,
  roadLayerLe5: Object.values(shipped.meta?.roadLayer || {}).filter((v) => v <= 5).length,
};

writeTimedLayer();

// cheapest extract: one mobilityStats on mass-free walk of freeze cut
// (artifact strips exterior/depth/shell — re-flood from shipped cutAtFreeze)
const cutFreeze = attachFrozenBoard(shipped, d.terrain);
const ext = shipped.exterior;
const sitter = shipped.sitter;
const occ = new Set();
for (const t of ["storage", "terminal", "link", "spawn", "container", "tower", "lab", "nuker", "observer"]) {
  for (const p of shipped.structures?.[t] || []) occ.add(`${p.x},${p.y}`);
}
for (const k of objectTilesOf(shipped)) occ.add(k);
const walkBlocked = new Set(occ);
for (const c of shipped.structures?.container || []) walkBlocked.delete(`${c.x},${c.y}`);
const cutSet = new Set(cutFreeze.map((c) => `${c.x},${c.y}`));
const freeMask = maskFromKeys(interiorWalk(d.terrain, cutSet, ext, walkBlocked, sitter));
const tFree0 = performance.now();
const mFree = mobilityStats(cutFreeze, ext, freeMask);
const mFreeMs = performance.now() - tFree0;
const tW0 = performance.now();
const mWorst = mobilityStats(cutFreeze, ext, freeMask);
const mWorstMs = performance.now() - tW0;

globalThis.__laneProbeEarly = true;
globalThis.__laneProbeHubCap = hubCap;
globalThis.__laneProbeRounds = 10;

const tMid0 = performance.now();
let mid;
let midComposeMs;
try {
  mid = composeUpToExt(d, composeOpts);
  midComposeMs = performance.now() - tMid0;
} catch (e) {
  console.log(JSON.stringify({ error: "composeUpToExt threw", msg: String(e && e.stack || e), dump }, null, 2));
  process.exit(1);
}
if (mid.error) {
  console.log(JSON.stringify({ error: "composeUpToExt error", midError: mid.error, dump }, null, 2));
  process.exit(1);
}

let midRun;
try {
  midRun = await runExt(mid, d.terrain, "mid");
} catch (e) {
  console.log(JSON.stringify({ error: "mid planExtensions threw", msg: String(e && e.stack || e), dump, midComposeMs }, null, 2));
  process.exit(1);
}

let stripRun;
try {
  const stripped = stripShippedToL6In(shipped, d.terrain);
  stripRun = await runExt(stripped, d.terrain, "strip");
} catch (e) {
  stripRun = { label: "strip", wallMs: 0, early: null, events: [], err: String(e && e.stack || e) };
}

function summarize(run) {
  const ev = run.early || run.events[0] || null;
  if (!ev) return { ...run, ev: null };
  const full = ev.reserved.map(String);
  const prefN = typeof to === "number" ? to : ev.rounds;
  const pref = prefixOf(ev.byRound, prefN);
  const vsLane = reservedTouches(full, shippedLane);
  const vsFull = reservedTouches(full, shippedFull);
  const vsPrefLane = reservedTouches(pref, shippedLane);
  const vsPrefFull = reservedTouches(pref, shippedFull);
  return {
    label: run.label,
    wallMs: +run.wallMs.toFixed(3),
    reservationMs: +ev.ms.toFixed(3),
    skelMs: +ev.skelMs.toFixed(3),
    mobCalls: ev.mobCalls,
    mobMs: +ev.mobMs.toFixed(3),
    hubCap: ev.hubCap,
    laneRounds: ev.laneRounds,
    producedTiles: ev.tiles,
    producedRounds: ev.rounds,
    produced: full,
    byRound: ev.byRound,
    prefixN: prefN,
    prefix: pref,
    matchFullVsLane: vsLane.eq,
    matchFullVsFullRun: vsFull.eq,
    matchPrefixVsLane: vsPrefLane.eq,
    matchPrefixVsFullRun: vsPrefFull.eq,
    onlyProducedVsLane: vsLane.onlyA,
    onlyLaneVsProduced: vsLane.onlyB,
    onlyPrefixVsLane: vsPrefLane.onlyA,
    onlyLaneVsPrefix: vsPrefLane.onlyB,
  };
}

const midS = summarize(midRun);
const stripS = summarize(stripRun);

const repeats = [];
for (let i = 0; i < 9; i++) {
  const r = await runExt(mid, d.terrain, "midrep" + i);
  const s = summarize(r);
  repeats.push({ reservationMs: s.reservationMs, skelMs: s.skelMs, wallMs: s.wallMs, matchPrefix: s.matchPrefixVsLane });
}
const resSamples = [midS.reservationMs, ...repeats.map((r) => r.reservationMs)].sort((a, b) => a - b);
const skelSamples = [midS.skelMs, ...repeats.map((r) => r.skelMs)].sort((a, b) => a - b);
const median = (a) => a[(a.length / 2) | 0];

globalThis.__laneProbeRounds = 2;
const prefRun = summarize(await runExt(mid, d.terrain, "pref2"));
globalThis.__laneProbeRounds = 10;

let checkMs = null;
try {
  const { checkRoom } = await import("../validate.mjs");
  const tC0 = performance.now();
  const cres = checkRoom(structuredClone(shipped), d.terrain, d.objects, null);
  checkMs = {
    ms: +(performance.now() - tC0).toFixed(3),
    fails: (cres.fails || []).length,
  };
  const tC1 = performance.now();
  checkRoom(structuredClone(shipped), d.terrain, d.objects, null);
  checkMs.ms2 = +(performance.now() - tC1).toFixed(3);
} catch (e) {
  checkMs = { error: String(e && e.message || e) };
}

const tRes = median(resSamples);
const tSkel = median(skelSamples);
const tSetup = midComposeMs + tSkel;
const tMatch = tSetup + tRes;
const cases = 1345;
const rooms = 172;
const productRes = rooms * tRes * cases;
const productMatch = rooms * tMatch * cases;
const split = mid.__split || {};

const out = {
  dump,
  mFree: { ms: +mFreeMs.toFixed(3), maxGated: mFree.maxGated, endpoints: mFree.endpoints, reachable: mFree.reachable },
  mWorstDummy: { ms: +mWorstMs.toFixed(3) },
  midComposeMs: +midComposeMs.toFixed(3),
  composeSplit: Object.fromEntries(Object.entries(split).map(([k, v]) => [k, +v.toFixed(3)])),
  mid: midS,
  strip: stripS,
  prefixOnly2: prefRun,
  repeats: {
    n: resSamples.length,
    reservationMs: resSamples,
    reservationMedian: tRes,
    skelMs: skelSamples,
    skelMedian: tSkel,
    allPrefixMatch: repeats.every((r) => r.matchPrefix) && midS.matchPrefixVsLane,
  },
  checkRoom: checkMs,
  estimate: {
    reservationMedianMs: tRes,
    skeletonMedianMs: tSkel,
    l1to5Ms: +midComposeMs.toFixed(3),
    matchingExtractMs: +tMatch.toFixed(3),
    rooms,
    mutateCases: cases,
    product_reservation_only_s: +(productRes / 1000).toFixed(2),
    product_matching_extract_s: +(productMatch / 1000).toFixed(2),
    baselineExtra_matching_s: +((rooms * tMatch) / 1000).toFixed(2),
    mutateSuiteExtra_matching_s: +(((rooms + cases) * tMatch) / 1000).toFixed(2),
    reservationAloneViable: tRes < 50,
    matchingExtractViable: tMatch < 50,
    implementGate: tMatch < 50 && midS.matchPrefixVsLane === true && midS.matchPrefixVsFullRun === true,
  },
};

console.log(JSON.stringify(out, null, 2));
