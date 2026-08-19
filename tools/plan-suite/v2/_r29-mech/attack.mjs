/**
 * Round-29 hostile mutations. In-memory checkRoom only. Never writes the artifact.
 * Does not treat validate.mjs as ground truth for board facts — only as the gate.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderDecl } from "../declprose.mjs";
import { enclosureMobility } from "../layer-shell.mjs";
import { renderSwapOfferBasis, MIN_SAT } from "../layer-towers.mjs";
import {
  MINERAL_OFF_NETWORK_BASIS,
  MINERAL_ON_NETWORK_BASIS,
} from "../layer-misc.mjs";
import { META_DARK } from "../r27-gates.mjs";
import {
  K,
  loadPlans,
  loadRooms,
  makeChecker,
  mineralSeat,
} from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);
const find = (pred) => plans.find((p) => { try { return pred(p); } catch { return false; } });

const results = [];
function rec(r) {
  results.push(r);
  console.log(String(r.status).padEnd(8), r.name, r.room, String(r.detail || "").slice(0, 180));
}

const R = plans[0].room;
const any = (pred) => find(pred)?.room || null;

// ---- rooms with the required properties --------------------------------
const rooms = {
  mineral: any((p) => typeof p.meta?.misc?.mineralOffNetworkWhy === "string") || R,
  mineralOff: any((p) => typeof p.meta?.misc?.mineralOffNetworkWhy === "string" && p.meta.misc.mineralOffNetworkWhy.includes("no road by design")) || "E11S1",
  residue: ["E2S5", "E5S1", "E5S3"].filter((r) => byPlan.has(r)),
  swap: any((p) => typeof p.meta?.towers?.towerSwapOffer?.basis === "string" && /face at \d+/.test(p.meta.towers.towerSwapOffer.basis)) || R,
  battlement: any((p) => (p.meta?.shell?.battlementUnreachable || 0) > 0) || "E13S3",
  adoptEmpty: any((p) => Array.isArray(p.meta?.shell?.cutAdopted) && p.meta.shell.cutAdopted.length === 0 && (p.structures?.rampart || []).length) || R,
  adoptAdds: any((p) => (p.meta?.shell?.cutDrift || []).some((e) => e && e.op === "add") && Array.isArray(p.meta?.shell?.cutAdopted)) || "E13S3",
  dmg: any((p) => p.meta?.shell?.shippedShellDmg && typeof p.meta.shell.shippedShellDmg.min === "number") || R,
  mob: any((p) => p.meta?.shell?.mobilityShipped && typeof p.meta.shell.mobilityShipped.maxGated === "number" && p.meta.shell.mobilityShipped.maxGated !== 0) || R,
  refill: any((p) => typeof p.meta?.towers?.refillBasis === "string" && /with \d+ tile\(s\) blocked/.test(p.meta.towers.refillBasis)) || R,
  cutPasses: any((p) => (p.meta?.shell?.cutPasses || []).some((m) => m && m.kind === "reconcileSeal" && Number.isInteger(m.sealCritical))) || R,
  prunePass: any((p) => (p.meta?.shell?.cutPasses || []).some((m) => m && m.kind === "inertPrune" && m.rampartsDeleted > 0)) || R,
  twoPrune: any((p) => {
    const a = (p.meta?.shell?.cutPasses || []).find((m) => m && m.pass === "layer7-inertPrune");
    const b = (p.meta?.shell?.cutPasses || []).find((m) => m && m.pass === "layer7b-inertPrune");
    return a && b && a.rampartsDeleted > 0 && b.rampartsDeleted > 0;
  }) || null,
  nuker: any((p) => typeof p.meta?.misc?.nukerHubDist === "number" && p.meta.misc.nukerHubDist !== 1) || R,
  observer: any((p) => typeof p.meta?.misc?.observerHubDist === "number" && p.meta.misc.observerHubDist !== 1) || R,
  refillU: any((p) => Array.isArray(p.meta?.towers?.refillDistsUnblocked) && p.meta.towers.refillDistsUnblocked.some((v) => v !== 1)) || R,
  protect: any((p) => typeof p.meta?.shell?.protectRadius === "number" && p.meta.shell.protectRadius !== 12) || R,
  pricey: any((p) => p.meta?.shell?.priceyWall) || R,
  baseCut: any((p) => typeof p.meta?.shell?.baseCut === "number" && p.meta.shell.baseCut > 1 && p.meta.shell.baseCut <= 45) || R,
  bubble: any((p) => p.meta?.misc?.mineralBubble > 0) || R,
  swamp: any((p) => (p.meta?.walls?.swampPaved || 0) > 0) || R,
  spur: any((p) => (p.meta?.walls?.spurred || 0) > 0 && (p.meta?.walls?.laidByKind?.spur || 0) > 0) || R,
  newRoads: any((p) => (p.meta?.towers?.newRoads || 0) > 0) || R,
  ladderFat: any((p) => {
    const sf = (p.meta?.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
    const shipped = (p.structures?.rampart || []).length;
    const hasCut = (r) => Array.isArray(r?.cutTiles) && r.cutTiles.length;
    return !!(sf && (sf.ladder.rungs.some(hasCut) || (p.meta?.shellEscalation?.rungs || []).some(hasCut)) &&
      sf.ladder.rungs.some((r) => r && r.ramparts > shipped && typeof r.mobility === "number"));
  }) || "E11S2",
  ladderAny: any((p) => {
    const sf = (p.meta?.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
    return !!(sf && (sf.ladder.rungs.some((r) => Array.isArray(r?.cutTiles) && r.cutTiles.length) ||
      (p.meta?.shellEscalation?.rungs || []).some((r) => Array.isArray(r?.cutTiles) && r.cutTiles.length)));
  }) || "E11S2",
  recovLadder: any((p) => {
    if (p.meta?.shellEscalation) return false;
    const sf = (p.meta?.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
    return !!(sf && sf.ladder.rungs.some((r) => r && Array.isArray(r.cutTiles) && r.cutTiles.length));
  }),
  plain: any((p) => {
    const L = p.meta?.extensions?.laneMeta;
    return !!(L && L.fullRun && !L.fullRun.ran && !L.shrunk && !L.dropped && typeof L.rounds === "number");
  }) || "E11S3",
  shrunk: any((p) => p.meta?.extensions?.laneMeta?.shrunk && p.meta.extensions.laneMeta.fullRun),
  taken: any((p) => p.meta?.sealedRecovery?.outcome === "taken") || "E11S7",
  takenFixed: any((p) => p.meta?.sealedRecovery?.outcome === "taken" && (p.meta.sealedRecovery.fixedHolders || []).length) || "E11S7",
  preTakeHold: any((p) => {
    const pks = p.meta?.sealedFloor?.pockets || p.meta?.sealedRecovery?.pockets || [];
    return pks.some((pk) => (pk?.holders || []).length);
  }) || "E11S7",
};

// =====================================================================
// 1. mineralOffNetworkWhy whole-value
// =====================================================================
rec(run("MF5-mineral-append-after-last-char", rooms.mineral, (p) => {
  p.meta.misc.mineralOffNetworkWhy += " THE WALL IS FREE.";
}));
rec(run("MF5-mineral-invented-sentence", rooms.mineral, (p) => {
  p.meta.misc.mineralOffNetworkWhy = "THE REVIEWER WROTE THIS. This room ships no wall.";
}));
rec(run("MF5-mineral-invert-suffix-keep-rest", rooms.mineralOff, (p) => {
  p.meta.misc.mineralOffNetworkWhy = p.meta.misc.mineralOffNetworkWhy
    .replace(MINERAL_OFF_NETWORK_BASIS, MINERAL_ON_NETWORK_BASIS);
}));
for (const room of rooms.residue) {
  rec(run("MF5-mineral-residue-nearest-rewritten-" + room, room, (p) => {
    p.meta.misc.mineralOffNetworkWhy = p.meta.misc.mineralOffNetworkWhy.replace(
      /nearest road tile this room ships is \d+,\d+/,
      "nearest road tile this room ships is 1,1",
    );
  }));
  rec(run("MF5-mineral-residue-ring-rewrite-keep-suffix-seat-" + room, room, (p) => {
    const s = p.meta.misc.mineralOffNetworkWhy;
    const seat = /mineral seat at (\d+),(\d+)/.exec(s);
    const suffix = s.includes("DOES touch") ? MINERAL_ON_NETWORK_BASIS : MINERAL_OFF_NETWORK_BASIS;
    p.meta.misc.mineralOffNetworkWhy =
      `ON THIS ROOM: the mineral seat at ${seat[1]},${seat[2]} has these eight neighbours — ALL EMPTY — so 0 of them put it on the network, and this room ships no road at all. ` +
      suffix +
      ` Measured over the FINISHED road set, not layer 5's.`;
  }));
}

// =====================================================================
// 2. swap-offer face not parsed from sentence
// =====================================================================
rec(run("MF5-swap-face-999-in-sentence", rooms.swap, (p) => {
  p.meta.towers.towerSwapOffer.basis = p.meta.towers.towerSwapOffer.basis.replace(
    /face at \d+ and its saturation at \d+/,
    "face at 999 and its saturation at 999",
  );
}));
rec(run("MF5-swap-regen-from-forged-face-1-1", rooms.swap, (p) => {
  const off = p.meta.towers.towerSwapOffer;
  off.basis = renderSwapOfferBasis({
    seats: off.seats,
    searchedSeats: off.searchedSeats,
    towers: (p.structures?.tower || []).length,
    scanned: off.scanned,
    faceAndSatHeld: off.faceAndSatHeld,
    priceProven: off.priceProven,
    face: { min: 1, sat: 1 },
    before: off.before,
    best: off.best,
  });
}));
rec(run("MF5-swap-regen-from-minShellDmg", rooms.swap, (p) => {
  const off = p.meta.towers.towerSwapOffer;
  const mn = p.meta.towers.minShellDmg;
  const sat = mn < MIN_SAT ? mn : MIN_SAT;
  off.basis = renderSwapOfferBasis({
    seats: off.seats,
    searchedSeats: off.searchedSeats,
    towers: (p.structures?.tower || []).length,
    scanned: off.scanned,
    faceAndSatHeld: off.faceAndSatHeld,
    priceProven: off.priceProven,
    face: { min: mn, sat },
    before: off.before,
    best: off.best,
  });
}));

// =====================================================================
// 3. battlement walk
// =====================================================================
rec(run("MF6-battlement-zero-count-only", rooms.battlement, (p) => {
  p.meta.shell.battlementUnreachable = 0;
}));
rec(run("MF6-battlement-zero-both", rooms.battlement, (p) => {
  p.meta.shell.battlementUnreachable = 0;
  p.meta.shell.battlementUnreachableTiles = [];
}));
rec(run("MF6-battlement-roster-rewritten", rooms.battlement, (p) => {
  p.meta.shell.battlementUnreachableTiles = [{ x: 1, y: 1 }];
  p.meta.shell.battlementUnreachable = 1;
}));

// =====================================================================
// 4. cutAdopted ⊆ cutDrift adds
// =====================================================================
rec(run("MF6-cutAdopted-plant-non-add-rampart", rooms.adoptEmpty, (p) => {
  const addK = new Set((p.meta.shell.cutDrift || []).filter((e) => e && e.op === "add").map(K));
  const r = (p.structures.rampart || []).find((t) => !addK.has(K(t))) || p.structures.rampart[0];
  p.meta.shell.cutAdopted = [{ x: r.x, y: r.y }];
}));
rec(run("MF6-cutAdopted-plant-real-add-subset", rooms.adoptAdds, (p) => {
  const add = (p.meta.shell.cutDrift || []).find((e) => e && e.op === "add");
  p.meta.shell.cutAdopted = [{ x: add.x, y: add.y }];
}));

// =====================================================================
// 5. shippedShellDmg / mobilityShipped
// =====================================================================
rec(run("MF6-shippedShellDmg-inflate-with-twins", rooms.dmg, (p) => {
  p.meta.shell.shippedShellDmg.min = 9999;
  p.meta.shell.shippedShellDmg.worst = { x: 1, y: 1 };
  p.meta.shell.shippedShellDmg.avg = 9999;
  if (p.meta.towers) {
    p.meta.towers.shippedWeakest = { x: 1, y: 1 };
    p.meta.towers.shippedAvgShellDmg = 9999;
  }
}));
rec(run("MF6-mobilityShipped-zeroed-alone", rooms.mob, (p) => {
  p.meta.shell.mobilityShipped.maxGated = 0;
}));

// =====================================================================
// 6. refill blocked count
// =====================================================================
rec(run("MF5-refill-blocked-count-forged-in-sentence", rooms.refill, (p) => {
  p.meta.towers.refillBasis = p.meta.towers.refillBasis.replace(
    /with \d+ tile\(s\) blocked/,
    "with 1 tile(s) blocked",
  );
}));

// =====================================================================
// 7. cutPasses bounds
// =====================================================================
rec(run("M1-cutPasses-sealCritical-plus-999", rooms.cutPasses, (p) => {
  for (const mk of p.meta.shell.cutPasses) if (Number.isInteger(mk.sealCritical)) mk.sealCritical += 999;
}));
rec(run("M1-cutPasses-sealCritical-plus-1-under-ramparts", rooms.cutPasses, (p) => {
  const nRamp = (p.structures.rampart || []).length;
  for (const mk of p.meta.shell.cutPasses) {
    if (Number.isInteger(mk.sealCritical) && mk.sealCritical + 1 <= nRamp) mk.sealCritical += 1;
  }
}));
rec(run("M1-cutPasses-prune-ramparts-zeroed", rooms.prunePass, (p) => {
  for (const mk of p.meta.shell.cutPasses) if (mk.kind === "inertPrune") mk.ramparts = 0;
}));
rec(run("M1-cutPasses-kind-rewritten", rooms.cutPasses, (p) => {
  for (const mk of p.meta.shell.cutPasses) mk.kind = "reviewer";
}));
if (rooms.twoPrune) {
  rec(run("M1-cutPasses-swap-rampartsDeleted-sum-held", rooms.twoPrune, (p) => {
    const a = p.meta.shell.cutPasses.find((m) => m.pass === "layer7-inertPrune");
    const b = p.meta.shell.cutPasses.find((m) => m.pass === "layer7b-inertPrune");
    const t = a.rampartsDeleted;
    a.rampartsDeleted = b.rampartsDeleted;
    b.rampartsDeleted = t;
  }));
}

// =====================================================================
// 8. MF6 derived presence
// =====================================================================
rec(run("MF6-nukerHubDist-to-1", rooms.nuker, (p) => { p.meta.misc.nukerHubDist = 1; }));
rec(run("MF6-observerHubDist-to-1", rooms.observer, (p) => { p.meta.misc.observerHubDist = 1; }));
rec(run("MF6-refillDistsUnblocked-flat-1", rooms.refillU, (p) => {
  p.meta.towers.refillDistsUnblocked = p.meta.towers.refillDistsUnblocked.map(() => 1);
}));
rec(run("MF6-protectRadius-zeroed", rooms.protect, (p) => { p.meta.shell.protectRadius = 0; }));
rec(run("MF6-protectRadius-swapped-inside-enum", rooms.protect, (p) => {
  const cur = p.meta.shell.protectRadius;
  p.meta.shell.protectRadius = cur === 12 ? 6 : 12;
}));
rec(run("MF6-priceyWall-cleared", rooms.pricey, (p) => { p.meta.shell.priceyWall = 0; }));
rec(run("MF6-baseCut-zeroed", rooms.baseCut, (p) => { p.meta.shell.baseCut = 0; }));
rec(run("MF6-baseCut-decrement-keep-pricey", rooms.baseCut, (p) => {
  p.meta.shell.baseCut -= 1;
}));
rec(run("MF6-mineralBubble-zeroed", rooms.bubble, (p) => { p.meta.misc.mineralBubble = 0; }));
rec(run("MF6-swampPaved-zeroed", rooms.swamp, (p) => { p.meta.walls.swampPaved = 0; }));
rec(run("MF6-spurred-zeroed", rooms.spur, (p) => { p.meta.walls.spurred = 0; }));
rec(run("MF6-spurred-decrement-keep-nonzero", rooms.spur, (p) => {
  if (p.meta.walls.spurred > 1) p.meta.walls.spurred -= 1;
}));
rec(run("MF6-newRoads-zeroed", rooms.newRoads, (p) => { p.meta.towers.newRoads = 0; }));

// =====================================================================
// 9. criticism 88 — fatter discarded + invent prettier cut
// =====================================================================
rec(run("88-fatter-discarded-mobility-and-regen", rooms.ladderFat, (p) => {
  const shipped = (p.structures.rampart || []).length;
  for (const sf of p.meta.shortfalls || []) {
    if (!sf.ladder?.rungs) continue;
    for (const r of sf.ladder.rungs) {
      if (r && r.ramparts > shipped && typeof r.mobility === "number") r.mobility = 0.5;
    }
    sf.detail = renderDecl(sf);
  }
}));
rec(run("88-invent-prettier-cut-matching-lap", rooms.ladderAny, (p) => {
  const d = byRoom.get(p.room);
  const shippedCut = (p.meta.shell.cut || []).map((t) => ({ x: t.x, y: t.y }));
  const pretty = enclosureMobility(d.terrain, p, shippedCut);
  const esc = p.meta.shellEscalation;
  const sf = (p.meta.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
  const shippedN = (p.structures.rampart || []).length;
  let touched = 0;
  const apply = (row) => {
    if (!row || typeof row.mobility !== "number") return;
    if (!(row.ramparts > shippedN || (Array.isArray(row.cutTiles) && row.cutTiles.length > shippedCut.length))) return;
    if (typeof pretty !== "number" || pretty >= row.mobility - 1e-9) return;
    row.cutTiles = shippedCut.map((t) => ({ x: t.x, y: t.y }));
    row.mobility = pretty;
    row.ramparts = shippedCut.length;
    touched++;
  };
  if (esc && Array.isArray(esc.rungs)) for (const row of esc.rungs) apply(row);
  if (sf) {
    for (const row of sf.ladder.rungs) apply(row);
    sf.detail = renderDecl(sf);
  }
  if (!touched) {
    // fall back: take the last discarded rung and force the shipped cut + its lap
    const row = (esc?.rungs || sf?.ladder?.rungs || []).slice().reverse().find((r) => r && typeof r.mobility === "number");
    if (row && typeof pretty === "number") {
      row.cutTiles = shippedCut.map((t) => ({ x: t.x, y: t.y }));
      row.mobility = pretty;
      if (sf) sf.detail = renderDecl(sf);
    }
  }
}));
if (rooms.recovLadder) {
  rec(run("88-recovery-discarded-mobility-0.5", rooms.recovLadder, (p) => {
    for (const sf of p.meta.shortfalls || []) {
      if (!sf.ladder?.rungs) continue;
      for (const r of sf.ladder.rungs) if (r && typeof r.mobility === "number") r.mobility = 0.5;
      sf.detail = renderDecl(sf);
    }
  }));
}

// =====================================================================
// 10. criticism 98 — invent shrink / forge fullRun
// =====================================================================
rec(run("98-invent-shrink-on-plain-room", rooms.plain, (p) => {
  const L = p.meta.extensions.laneMeta;
  const W = p.meta.walls?.mobility?.lanes;
  const shrunk = { from: 10, to: L.rounds, wanted: (L.tiles || 0) + 9, premium: 0 };
  L.shrunk = shrunk;
  L.roundCap = L.rounds;
  if (W && W !== L) {
    W.shrunk = { ...shrunk };
    W.roundCap = L.rounds;
  }
}));
rec(run("98-delete-fullRun", rooms.plain, (p) => {
  delete p.meta.extensions.laneMeta.fullRun;
  if (p.meta.walls?.mobility?.lanes) delete p.meta.walls.mobility.lanes.fullRun;
}));
if (rooms.shrunk) {
  rec(run("98-erase-real-shrink", rooms.shrunk, (p) => {
    const L = p.meta.extensions.laneMeta;
    const W = p.meta.walls?.mobility?.lanes;
    delete L.shrunk;
    L.roundCap = 10;
    if (W && W !== L) {
      delete W.shrunk;
      W.roundCap = 10;
    }
  }));
}
rec(run("98-forge-whole-fullRun-then-invent-shrink", rooms.plain, (p) => {
  const L = p.meta.extensions.laneMeta;
  const W = p.meta.walls?.mobility?.lanes;
  const fr = {
    tiles: 24,
    rounds: 10,
    shallow: 2,
    ext: 58,
    builtLap: 1.4,
    stranded: 0,
    ran: true,
    used: 10,
    to: 4,
  };
  const shrunk = { from: 10, to: 4, wanted: 24, premium: 0 };
  L.fullRun = fr;
  L.shrunk = shrunk;
  L.roundCap = 4;
  if (W && W !== L) {
    W.fullRun = { ...fr };
    W.shrunk = { ...shrunk };
    W.roundCap = 4;
  }
}));

// =====================================================================
// 11. criticism 93 — fixedHolders shipped-unmovable / recovers
// =====================================================================
rec(run("93-taken-invent-holder-off-board", rooms.taken, (p) => {
  const R0 = p.meta.sealedRecovery;
  R0.fixedHolders = [...(R0.fixedHolders || []), { type: "lab", x: 1, y: 1, recovers: 99, recoversDeep: 99 }];
}));
rec(run("93-taken-inflate-recovers-within-cap", rooms.takenFixed, (p) => {
  const R0 = p.meta.sealedRecovery;
  const cap = (R0.pockets || []).reduce((n, pk) => n + (pk?.tiles || 0), 0);
  for (const f of R0.fixedHolders || []) {
    if (typeof f.recovers === "number") {
      const next = Math.min(cap || f.recovers + 1, Math.max(f.recovers + 1, 1));
      if (next !== f.recovers && next >= 1 && (cap === 0 || next <= cap)) {
        f.recovers = next;
        if (typeof f.recoversDeep === "number" && f.recoversDeep > f.recovers) f.recoversDeep = f.recovers;
      }
    }
  }
}));
rec(run("93-pre-take-pocket-holder-invent", rooms.preTakeHold, (p) => {
  const walk = (n) => {
    if (!n) return;
    if (Array.isArray(n.pockets)) {
      for (const pk of n.pockets) {
        if (Array.isArray(pk.holders)) pk.holders.push({ type: "extension", x: 1, y: 1, recovers: 99, recoversDeep: 99 });
      }
    }
    if (n.next) walk(n.next);
  };
  walk(p.meta.sealedFloor);
  walk(p.meta.sealedRecovery);
}));

// =====================================================================
// 12. remaining META_DARK presence — single-room flattering flips
// =====================================================================
const presenceNumeric = [
  ["baseOverGated", (p) => p.meta?.shell, "baseOverGated"],
  ["battlementGap", (p) => p.meta?.shell, "battlementGap"],
  ["mobilityShippedFree.maxGated", (p) => p.meta?.shell?.mobilityShippedFree, "maxGated"],
  ["extractorOffNetwork", (p) => p.meta?.misc, "extractorOffNetwork"],
  ["shallowNow", (p) => p.meta?.extensions?.reflow || p.meta?.extensions, "shallowNow"],
  ["unreachableExts", (p) => p.meta?.walls || p.meta?.extensions, "unreachableExts"],
  ["uselessCut-len", (p) => p.meta?.shell, "uselessCut"],
  ["coveredDetourDeclared", (p) => p.meta?.shell || p.meta?.walls, "coveredDetourDeclared"],
  ["digRoads", (p) => p.meta?.walls || p.meta?.shell, "digRoads"],
  ["stitched", (p) => p.meta?.walls, "stitched"],
];
for (const [name, grab, key] of presenceNumeric) {
  const room = any((p) => {
    const o = grab(p);
    const v = o?.[key];
    if (typeof v === "number") return v > 0;
    if (typeof v === "boolean") return v === true;
    if (Array.isArray(v)) return v.length > 0;
    return false;
  });
  if (!room) {
    rec({ name: "PRESENCE-" + name, room: "-", status: "SKIP", detail: "no room with truthy value" });
    continue;
  }
  rec(run("PRESENCE-" + name + "-flattered", room, (p) => {
    const o = grab(p);
    const v = o[key];
    if (typeof v === "number") o[key] = 0;
    else if (typeof v === "boolean") o[key] = false;
    else if (Array.isArray(v)) o[key] = [];
  }));
}

const presenceKlass = Object.entries(META_DARK).filter(([, v]) => v.klass === "presence").map(([k]) => k);

fs.writeFileSync(path.join(DIR, "attack.json"), JSON.stringify({ rooms, presenceKlass, results }, null, 2));
const bites = results.filter((r) => r.status === "BITES").length;
const escapes = results.filter((r) => r.status === "ESCAPE").length;
const skips = results.filter((r) => r.status === "SKIP" || r.status === "THREW").length;
console.log(JSON.stringify({ n: results.length, bites, escapes, skips, rooms }, null, 2));
