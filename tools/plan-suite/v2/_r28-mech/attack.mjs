/**
 * Round-28 hostile mutations. In-memory checkRoom plus a few on-disk forgeries
 * (film / NOTES.ramparts) restored in finally.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom, resetOutputCaches } from "../validate.mjs";
import {
  ENCLOSURE_BASIS,
  renderEnclosureBasis,
  renderDeepTilesBasis,
  renderRefillBasis,
  renderPrunedBasis,
  renderCounterfactualBasis,
  renderNoteObligationBasis,
  renderRemeasureReason,
  REFILL_BASIS,
  cutDriftWhy,
} from "../layer-walls.mjs";
import { renderSwapOfferBasis, SWAP_OFFER_BASIS, MIN_SAT } from "../layer-towers.mjs";
import {
  renderMineralOffNetworkWhy,
  mineralSeatCensus,
  MINERAL_OFF_NETWORK_BASIS,
  MINERAL_ON_NETWORK_BASIS,
} from "../layer-misc.mjs";
import { fetchRoomsFromMongo, chebyshev, key } from "../shared.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "../../out-v2");
const CACHE = path.join(DIR, "rooms.json");
const OUT = path.join(DIR, "attack.json");

const plans = JSON.parse(fs.readFileSync(path.join(ROOT, "plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);
const byPlan = new Map(plans.map((p) => [p.room, p]));

function loadRooms() {
  if (fs.existsSync(CACHE)) {
    const cached = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (cached.length === plans.length) return cached;
  }
  const rooms = fetchRoomsFromMongo(plans.map((p) => p.room));
  fs.writeFileSync(CACHE, JSON.stringify(rooms));
  return rooms;
}

const rooms = loadRooms();
const byRoom = new Map(rooms.map((r) => [r.room, r]));

const FLEET_RE = /fleetMediansMeasured|eco\.ctrlMedian|eco\.srcMedian|eco\.ctrlGate|eco\.srcGate/;
function realFails(res) {
  return (res.fails || []).filter((f) => !FLEET_RE.test(f));
}

function clone(room) {
  return JSON.parse(JSON.stringify(byPlan.get(room)));
}

const results = [];
function record(name, room, status, detail) {
  results.push({ name, room, status, detail: String(detail || "").slice(0, 400) });
  console.log(status.padEnd(8), name, room, (detail || "").slice(0, 160));
}

function run(name, room, mutate) {
  const d = byRoom.get(room);
  if (!d || !byPlan.get(room)) {
    record(name, room, "SKIP", "no terrain/plan");
    return;
  }
  const p = clone(room);
  try {
    mutate(p);
  } catch (e) {
    record(name, room, "THREW", "mutate: " + e.message);
    return;
  }
  let res;
  try {
    res = checkRoom(p, d.terrain, d.objects, null);
  } catch (e) {
    record(name, room, "THREW", e.message);
    return;
  }
  const fails = realFails(res);
  record(name, room, fails.length ? "BITES" : "ESCAPE", fails[0] || "pass");
}

function runFile(name, room, file, transform) {
  const d = byRoom.get(room);
  if (!d || !fs.existsSync(file)) {
    record(name, room, "SKIP", "missing file/terrain");
    return;
  }
  const orig = fs.readFileSync(file);
  try {
    const next = transform(orig.toString("utf8"));
    if (next == null || next === orig.toString("utf8")) {
      record(name, room, "SKIP", "forgery changed nothing");
      return;
    }
    fs.writeFileSync(file, next);
    if (typeof resetOutputCaches === "function") resetOutputCaches();
    const res = checkRoom(clone(room), d.terrain, d.objects, null);
    const fails = realFails(res);
    record(name, room, fails.length ? "BITES" : "ESCAPE", fails[0] || "pass");
  } catch (e) {
    record(name, room, "THREW", e.message);
  } finally {
    fs.writeFileSync(file, orig);
    if (typeof resetOutputCaches === "function") resetOutputCaches();
  }
}

const R = plans[0].room;
const find = (pred) => plans.find((p) => { try { return pred(p); } catch { return false; } });

const enclosedFalse = find((p) => p.meta?.shell?.enclosedController === false)?.room || R;
const hasNuker = find((p) => typeof p.meta?.misc?.nukerHubDist === "number")?.room || R;
const hasMob = find((p) => p.meta?.shell?.mobilityShipped)?.room || R;
const hasDmg = find((p) => p.meta?.shell?.shippedShellDmg && typeof p.meta?.towers?.shippedWeakest === "number")?.room || R;
const hasUseless = find((p) => (Array.isArray(p.meta?.shell?.uselessCut) ? p.meta.shell.uselessCut.length : p.meta?.shell?.uselessCut))?.room || R;
const hasAdopt = find((p) => Array.isArray(p.meta?.shell?.cutAdopted) && p.meta.shell.cutAdopted.length)?.room
  || find((p) => Array.isArray(p.meta?.shell?.cutAdopted))?.room || R;
const hasAdd = find((p) => (p.meta?.shell?.cutDrift || []).some((e) => e.op === "add"))?.room || R;
const hasRem = find((p) => (p.meta?.shell?.cutDrift || []).some((e) => e.op === "remove"))?.room || R;
const hasOffer = find((p) => p.meta?.towers?.towerSwapOffer?.basis)?.room || R;
const hasRefill = find((p) => typeof p.meta?.towers?.refillBasis === "string")?.room || R;
const hasEncl = find((p) => typeof p.meta?.shell?.enclosureBasis === "string")?.room || R;
const hasDeep = find((p) => typeof p.meta?.shell?.deepTilesBasis === "string")?.room || R;
const hasPruned = find((p) => typeof p.meta?.walls?.prunedBasis === "string")?.room || R;
const hasCf = find((p) => typeof p.meta?.sealedFloor?.counterfactualBasis === "string")?.room || R;
const hasNoteB = find((p) => typeof p.meta?.noteObligationBasis === "string")?.room || R;
const hasRemeasure = find((p) => typeof p.meta?.shell?.remeasured === "string")?.room || R;
const hasBattlement = find((p) => (p.meta?.shell?.battlementUnreachable || 0) > 0)?.room || R;
const hasMinWhy = find((p) => typeof p.meta?.misc?.mineralOffNetworkWhy === "string")?.room || R;
const residueRooms = ["E2S5", "E5S1", "E5S3"].filter((r) => byPlan.has(r));
const unjudged = find((p) => {
  const lap = p.meta?.walls?.mobility?.builtGated ?? p.meta?.shell?.mobilityBuilt?.maxGated;
  return lap === 0;
})?.room || "E7S5";
const hasLadder = find((p) => (p.meta?.shortfalls || []).some((s) => s.ladder?.rungs?.length > 1))?.room || R;
const hasRecov = find((p) => p.meta?.sealedRecovery?.taken)?.room || R;
const noShrink = find((p) => {
  const lm = p.meta?.extensions?.laneMeta || p.meta?.walls?.mobility?.lanes;
  return lm && !lm.shrunk && !lm.dropped && typeof lm.rounds === "number";
})?.room || R;
const hasFilmEmpty = (() => {
  for (const p of plans) {
    const f = path.join(ROOT, "anim", `${p.room}.json`);
    if (!fs.existsSync(f)) continue;
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    const empties = (j.rampartCensus || []).filter((r) => r && r.count === 0 && r.emptyBecause);
    if (empties.length >= 2) return { room: p.room, facets: empties.map((r) => r.facet) };
  }
  return { room: R, facets: [] };
})();

// ---------------------------------------------------------------------------
// MF5 — agreement tests: forge census + sentence, forge one leaf, append
// ---------------------------------------------------------------------------
run("MF5-refill-blocked-parsed-from-sentence", hasRefill, (p) => {
  const s = p.meta.towers.refillBasis;
  p.meta.towers.refillBasis = s.replace(/with (\d+) tile\(s\) blocked/, "with 999 tile(s) blocked");
});

run("MF5-refill-blocked-and-regen-from-parsed", hasRefill, (p) => {
  const tw = p.meta.towers;
  const towers = p.structures.tower || [];
  const atP = tw.refillDistsAtPlacement || [];
  const now = tw.refillDists;
  tw.refillBasis = renderRefillBasis({
    towers: towers.map((t, i) => ({ at: { x: t.x, y: t.y }, was: atP[i] ?? 9999, now: now[i] })),
    maxWas: atP.length ? Math.max(...atP) : 9999,
    maxNow: tw.maxRefill,
    unreachable: tw.refillUnreachable,
    blocked: 1,
  });
});

run("MF5-swap-offer-face-parsed-from-sentence", hasOffer, (p) => {
  const b = p.meta.towers.towerSwapOffer.basis;
  p.meta.towers.towerSwapOffer.basis = b.replace(
    /face at (\d+) and its saturation at (\d+)/,
    "face at 999 and its saturation at 999",
  );
});

run("MF5-swap-offer-face-coforged-via-parse", hasOffer, (p) => {
  const off = p.meta.towers.towerSwapOffer;
  off.basis = renderSwapOfferBasis({
    seats: off.seats,
    searchedSeats: off.searchedSeats,
    towers: (p.structures.tower || []).length,
    scanned: off.scanned,
    faceAndSatHeld: off.faceAndSatHeld,
    priceProven: off.priceProven,
    face: { min: 1, sat: 1 },
    before: off.before,
    best: off.best,
  });
});

run("MF5-enclosureBasis-invented-prefix-keep-suffix", hasEncl, (p) => {
  const s = p.meta.shell.enclosureBasis;
  const at = s.indexOf(ENCLOSURE_BASIS);
  p.meta.shell.enclosureBasis = "ON THIS ROOM: this room is perfect and every source is inside. " + (at >= 0 ? s.slice(at) : ENCLOSURE_BASIS);
});

run("MF5-enclosure-leaf-only-enclosedSources", enclosedFalse, (p) => {
  p.meta.shell.enclosedSources = (p.sources || []).length;
  p.meta.shell.enclosedSourceWorks = (p.sources || []).length;
});

run("MF5-enclosure-leaf-and-sentence-coforged", enclosedFalse, (p) => {
  p.meta.shell.enclosedSources = (p.sources || []).length;
  p.meta.shell.enclosedController = true;
  p.meta.shell.enclosureBasis = p.meta.shell.enclosureBasis.replace(/NOT enclosed/g, "ENCLOSED").replace(/outside/g, "inside");
});

run("MF5-deepTiles-leaf-only", hasDeep, (p) => {
  p.meta.shell.shippedFreeDeep = 999;
});

run("MF5-deepTiles-leaf-and-sentence", hasDeep, (p) => {
  p.meta.shell.shippedFreeDeep = 999;
  const sh = p.meta.shell;
  const occ = new Set();
  for (const t of Object.keys(p.structures || {})) {
    if (t === "road" || t === "rampart") continue;
    for (const q of p.structures[t] || []) occ.add(`${q.x},${q.y}`);
  }
  for (const s of p.sources || []) occ.add(`${s.x},${s.y}`);
  if (p.controller) occ.add(`${p.controller.x},${p.controller.y}`);
  if (p.mineral) occ.add(`${p.mineral.x},${p.mineral.y}`);
  sh.deepTilesBasis = renderDeepTilesBasis({
    negotiation: sh.negotiationFreeDeep ?? sh.deepTiles,
    shippedFree: 999,
    shippedInterior: sh.shippedDeepInterior,
    cut: (sh.cut || []).length,
    roads: (p.structures.road || []).length,
    occupied: occ.size,
  });
});

run("MF5-prunedBasis-leaf-and-sentence", hasPruned, (p) => {
  const w = p.meta.walls;
  w.prunedGhosts = 0;
  w.prunedTransient = 0;
  w.prunedTiles = [];
  w.prunedBasis = renderPrunedBasis({
    atPass: (w.prunedAtPassTiles || []).length,
    pruned: [],
    relaid: w.prunedRelaid || [],
    ghosts: 0,
    transient: 0,
  });
});

run("MF5-counterfactual-append-clause", hasCf, (p) => {
  p.meta.sealedFloor.counterfactualBasis += " AND THIS ROOM RECOVERS EVERY TILE FOR FREE.";
  if (p.meta.walls?.sealedFloor) {
    p.meta.walls.sealedFloor.counterfactualBasis = p.meta.sealedFloor.counterfactualBasis;
  }
});

run("MF5-counterfactual-leaf-and-sentence", hasCf, (p) => {
  const sf = p.meta.sealedFloor;
  sf.ourFault = 0;
  sf.singleStructureTiles = 0;
  sf.singleStructureDeep = 0;
  sf.counterfactualBasis = renderCounterfactualBasis({
    pockets: sf.pockets || [],
    singleStructureTiles: 0,
    singleStructureDeep: 0,
    ourFault: 0,
    sealed: sf.tiles,
  });
  if (p.meta.walls?.sealedFloor) p.meta.walls.sealedFloor.counterfactualBasis = sf.counterfactualBasis;
});

run("MF5-noteObligation-append", hasNoteB, (p) => {
  p.meta.noteObligationBasis += " NOTHING IS OWED.";
});

run("MF5-remeasured-append", hasRemeasure, (p) => {
  p.meta.shell.remeasured += " THE CUT NEVER MOVED.";
});

run("MF5-mineralWhy-append-normal-room", hasMinWhy, (p) => {
  p.meta.misc.mineralOffNetworkWhy += " THE SEAT IS ON THE NETWORK.";
});

// ---------------------------------------------------------------------------
// MF6 — 105 presence names, flattering direction
// ---------------------------------------------------------------------------
run("MF6-nukerHubDist-1", hasNuker, (p) => {
  p.meta.misc.nukerHubDist = 1;
  p.meta.misc.observerHubDist = 1;
});
run("MF6-protectRadius-0", R, (p) => { p.meta.shell.protectRadius = 0; });
run("MF6-priceyWall-0", R, (p) => { p.meta.shell.priceyWall = 0; });
run("MF6-baseCut-0", R, (p) => { p.meta.shell.baseCut = 0; });
run("MF6-uselessCut-cleared", hasUseless, (p) => {
  if (Array.isArray(p.meta.shell.uselessCut)) p.meta.shell.uselessCut = [];
  else p.meta.shell.uselessCut = 0;
});
run("MF6-cutAdopted-invent-ramparted-tile", hasAdopt, (p) => {
  const r = (p.structures.rampart || [])[0];
  p.meta.shell.cutAdopted = [{ x: r.x, y: r.y }];
});
run("MF6-cutAdopted-cleared", hasAdopt, (p) => { p.meta.shell.cutAdopted = []; });
run("MF6-shippedShellDmg-inflated-with-twins", hasDmg, (p) => {
  const d = p.meta.shell.shippedShellDmg;
  d.min = 9999; d.worst = 9999; d.avg = 9999; d.weak = 0;
  p.meta.towers.shippedWeakest = 9999;
  p.meta.towers.shippedAvgShellDmg = 9999;
  p.meta.towers.shippedWeakTiles = 0;
});
run("MF6-shippedShellDmg-only-no-twins", hasDmg, (p) => {
  const d = p.meta.shell.shippedShellDmg;
  d.min = 9999; d.worst = 9999; d.avg = 9999;
});
run("MF6-mobilityShipped-zero", hasMob, (p) => {
  if (p.meta.shell.mobilityShipped) p.meta.shell.mobilityShipped.maxGated = 0;
  if (p.meta.shell.mobilityShippedFree) p.meta.shell.mobilityShippedFree.maxGated = 0;
});
run("MF6-refillDistsUnblocked-all-1", R, (p) => {
  if (Array.isArray(p.meta.towers?.refillDistsUnblocked)) {
    p.meta.towers.refillDistsUnblocked = p.meta.towers.refillDistsUnblocked.map(() => 1);
  }
});
run("MF6-newRoads-spurred-swampPaved-zero", R, (p) => {
  if (p.meta.towers) p.meta.towers.newRoads = 0;
  if (p.meta.walls) {
    p.meta.walls.spurred = 0;
    p.meta.walls.swampPaved = 0;
    p.meta.walls.newRoads = 0;
  }
});
run("MF6-mineralBubble-false", R, (p) => {
  if (p.meta.misc) p.meta.misc.mineralBubble = false;
  if (p.meta.shell) p.meta.shell.mineralBubble = false;
});
run("MF6-battlementUnreachable-zero-count-only", hasBattlement, (p) => {
  p.meta.shell.battlementUnreachable = 0;
});
run("MF6-battlementUnreachable-zero-count-AND-tiles", hasBattlement, (p) => {
  p.meta.shell.battlementUnreachable = 0;
  p.meta.shell.battlementUnreachableTiles = [];
});

// ---------------------------------------------------------------------------
// cutAtFreeze / cutDrift
// ---------------------------------------------------------------------------
run("CUT-absorb-one-add-into-freeze-rewrite-passes", hasAdd, (p) => {
  const add = p.meta.shell.cutDrift.find((e) => e.op === "add");
  p.meta.shell.cutAtFreeze = [...p.meta.shell.cutAtFreeze, { x: add.x, y: add.y }];
  p.meta.shell.cutDrift = p.meta.shell.cutDrift.filter((e) => !(e.op === "add" && e.x === add.x && e.y === add.y));
  if (Array.isArray(p.meta.shell.cutPasses)) {
    for (const mk of p.meta.shell.cutPasses) {
      if (mk.pass && String(mk.pass).includes("reconcileSeal") && mk.adds > 0) mk.adds -= 1;
    }
  }
  const sh = p.meta.shell;
  const drift = sh.cutDrift || [];
  sh.remeasured = renderRemeasureReason({
    pruned: drift.filter((e) => e.op === "remove").length,
    adopted: drift.filter((e) => e.op === "add").length,
    ramparts: (p.structures.rampart || []).length,
    cut: (sh.cut || []).length,
    cutAtFreeze: (sh.cutAtFreeze || []).length,
  });
});

run("CUT-grow-freeze-by-interior-empty-tile", R, (p) => {
  const used = new Set();
  for (const t of Object.keys(p.structures || {})) for (const q of p.structures[t] || []) used.add(`${q.x},${q.y}`);
  const freeze = p.meta.shell.cutAtFreeze;
  const extra = { x: 25, y: 25 };
  for (let y = 5; y < 45 && extra.x === 25 && extra.y === 25; y++) {
    for (let x = 5; x < 45; x++) {
      if (!used.has(`${x},${y}`)) { extra.x = x; extra.y = y; break; }
    }
  }
  freeze.push(extra);
  p.meta.shell.inertPruned = [...(p.meta.shell.inertPruned || []), extra];
  const pass = "layer7-inertPrune";
  p.meta.shell.cutDrift = [
    ...(p.meta.shell.cutDrift || []),
    { x: extra.x, y: extra.y, op: "remove", pass, why: cutDriftWhy("remove", pass) },
  ];
  if (Array.isArray(p.meta.shell.cutPasses)) {
    for (const mk of p.meta.shell.cutPasses) {
      if (mk.pass === pass) mk.removes = (mk.removes || 0) + 1;
    }
  }
});

run("CUT-erase-adds-only", hasAdd, (p) => {
  p.meta.shell.cutDrift = (p.meta.shell.cutDrift || []).filter((e) => e.op !== "add");
});

run("CUT-delete-cutDrift-and-cutPasses", hasAdd, (p) => {
  p.meta.shell.cutDrift = [];
  p.meta.shell.cutPasses = (p.meta.shell.cutPasses || []).map((mk) => ({ ...mk, adds: 0, removes: 0 }));
});

run("CUT-rewrite-add-why-keep-markers", hasAdd, (p) => {
  for (const e of p.meta.shell.cutDrift) {
    if (e.op === "add") e.why = e.why + " AND IT WAS FREE.";
  }
});

run("CUT-repoint-freeze-at-shipped-empty-drift", hasAdd, (p) => {
  p.meta.shell.cutAtFreeze = JSON.parse(JSON.stringify(p.meta.shell.cut));
  p.meta.shell.cutDrift = [];
  if (Array.isArray(p.meta.shell.cutPasses)) {
    for (const mk of p.meta.shell.cutPasses) { mk.adds = 0; mk.removes = 0; }
  }
});

run("CUT-shrink-first-freeze-tile", hasRem, (p) => {
  const t = p.meta.shell.cutAtFreeze[0];
  p.meta.shell.cutAtFreeze = p.meta.shell.cutAtFreeze.slice(1);
  p.meta.shell.cutDrift = (p.meta.shell.cutDrift || []).filter((e) => !(e.op === "remove" && e.x === t.x && e.y === t.y));
});

// ---------------------------------------------------------------------------
// Film / NOTES
// ---------------------------------------------------------------------------
const filmPath = path.join(ROOT, "anim", `${hasFilmEmpty.room}.json`);
runFile("FILM-emptyBecause-swap-two-absence-reasons", hasFilmEmpty.room, filmPath, (src) => {
  const j = JSON.parse(src);
  const rows = (j.rampartCensus || []).filter((r) => r && r.count === 0 && r.emptyBecause);
  if (rows.length < 2) return null;
  const tmp = rows[0].emptyBecause;
  rows[0].emptyBecause = rows[1].emptyBecause;
  rows[1].emptyBecause = tmp;
  return JSON.stringify(j);
});

runFile("FILM-emptyBecause-use-other-facet-renderer-text", hasFilmEmpty.room, filmPath, (src) => {
  const j = JSON.parse(src);
  const rows = j.rampartCensus || [];
  const a = rows.find((r) => r && r.count === 0 && r.facet === "none");
  const b = rows.find((r) => r && r.count === 0 && r.facet && r.facet !== "none");
  if (!a || !b) return null;
  b.emptyBecause = a.emptyBecause;
  return JSON.stringify(j);
});

const htmlPath = path.join(ROOT, `${unjudged}.html`);
runFile("FILM-NOTES.ramparts-append-after-last-char", unjudged, htmlPath, (src) => {
  const at = src.indexOf("\n  var NOTES = ");
  if (at < 0) return null;
  const end = src.indexOf("\n", at + 15);
  const line = src.slice(at + 15, end);
  const notes = JSON.parse(line.replace(/;\s*$/, ""));
  if (typeof notes.ramparts !== "string") return null;
  notes.ramparts = notes.ramparts + " AND EVERY CUT TILE IS REDUNDANT.";
  return src.slice(0, at + 15) + JSON.stringify(notes) + ";" + src.slice(end);
});

// ---------------------------------------------------------------------------
// mineralSeat / mineralOffNetworkWhy residue
// ---------------------------------------------------------------------------
for (const room of residueRooms) {
  run(`MINERAL-residue-keep-seat-suffix-rewrite-ring-${room}`, room, (p) => {
    const s = p.meta.misc.mineralOffNetworkWhy;
    const seat = /mineral seat at (\d+),(\d+)/.exec(s);
    if (!seat) return;
    const suffix = s.includes("no road by design")
      ? s.slice(s.indexOf("no road by design"))
      : s.includes("no road was grown")
        ? s.slice(s.indexOf("no road was grown"))
        : s.slice(s.lastIndexOf("Measured over"));
    p.meta.misc.mineralOffNetworkWhy =
      `ON THIS ROOM: the mineral seat at ${seat[1]},${seat[2]} has these eight neighbours — all empty — so 0 of them put it on the network, and this room ships no road at all. ` +
      suffix;
  });
}

run("MINERAL-seat-moved-to-source-container", R, (p) => {
  const src = (p.structures.container || []).find((c) =>
    (p.sources || []).some((s) => chebyshev(c, s) <= 1),
  );
  if (src) p.meta.mineralSeat = { x: src.x, y: src.y };
});

// ---------------------------------------------------------------------------
// Circularity + 88 / 93 / 98
// ---------------------------------------------------------------------------
run("CIRC-battlement-twins-zeroed-together", hasBattlement, (p) => {
  p.meta.shell.battlementUnreachable = 0;
  p.meta.shell.battlementUnreachableTiles = [];
});

run("CIRC-shippedShellDmg-twins-moved-together", hasDmg, (p) => {
  p.meta.shell.shippedShellDmg.worst = 1;
  p.meta.shell.shippedShellDmg.avg = 1;
  p.meta.shell.shippedShellDmg.weak = 99;
  p.meta.towers.shippedWeakest = 1;
  p.meta.towers.shippedAvgShellDmg = 1;
  p.meta.towers.shippedWeakTiles = 99;
});

run("88-invent-rung-mobility", hasLadder, (p) => {
  for (const sf of p.meta.shortfalls || []) {
    const rungs = sf.ladder?.rungs;
    if (!rungs) continue;
    for (let i = 1; i < rungs.length; i++) {
      if (rungs[i] && typeof rungs[i].mobility === "number") rungs[i].mobility = 0.01;
    }
  }
});

run("93-inflate-taken-pocket-holders", hasRecov, (p) => {
  const rec = p.meta.sealedRecovery;
  const walk = (n) => {
    if (!n) return;
    if (Array.isArray(n.pockets)) {
      for (const pk of n.pockets) {
        if (Array.isArray(pk.holders)) pk.holders.push({ type: "extension", x: 1, y: 1, recovers: 99, recoversDeep: 99 });
      }
    }
    if (n.next) walk(n.next);
  };
  walk(rec);
});

run("98-invent-shrink-on-plain-room", noShrink, (p) => {
  const lanes = p.meta.walls?.mobility?.lanes || p.meta.extensions?.laneMeta;
  if (!lanes) return;
  const rounds = lanes.rounds ?? 10;
  lanes.shrunk = { from: 10, to: rounds, wanted: 12, premium: 0 };
  lanes.roundCap = rounds;
  if (p.meta.extensions?.laneMeta && p.meta.extensions.laneMeta !== lanes) {
    p.meta.extensions.laneMeta.shrunk = lanes.shrunk;
    p.meta.extensions.laneMeta.roundCap = rounds;
  }
});

const summary = {
  bites: results.filter((r) => r.status === "BITES").length,
  escapes: results.filter((r) => r.status === "ESCAPE").length,
  threw: results.filter((r) => r.status === "THREW").length,
  skip: results.filter((r) => r.status === "SKIP").length,
  results,
};
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log("\nSUMMARY", JSON.stringify({ bites: summary.bites, escapes: summary.escapes, threw: summary.threw, skip: summary.skip }));
for (const r of results.filter((x) => x.status === "ESCAPE")) console.log("  ESCAPE", r.name, r.room);
