/**
 * r29p19 leftover presence / takeTowerSwap.from exact. Throwaway. Never writes the artifact.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { META_DARK } from "../r27-gates.mjs";
import { loadPlans, loadRooms, K, D8, cheb } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans, md5 } = loadPlans();
const { byRoom } = loadRooms();

const PRESENCE = Object.entries(META_DARK)
  .filter(([, v]) => v.klass === "presence")
  .map(([k]) => k);
const DERIVED = Object.entries(META_DARK)
  .filter(([, v]) => v.klass === "derived")
  .map(([k]) => k);

function grabAll(p, name) {
  const hits = [];
  const stack = [{ o: p.meta, path: "meta" }];
  while (stack.length) {
    const { o, path: pth } = stack.pop();
    if (!o || typeof o !== "object") continue;
    if (Array.isArray(o)) {
      o.forEach((e, i) => stack.push({ o: e, path: `${pth}[${i}]` }));
      continue;
    }
    for (const [k, v] of Object.entries(o)) {
      if (k === name) hits.push({ path: `${pth}.${k}`, v });
      if (v && typeof v === "object") stack.push({ o: v, path: `${pth}.${k}` });
    }
  }
  return hits;
}

const swaps = [];
for (const p of plans) {
  const sw = p.meta?.composeOpts?.takeTowerSwap;
  if (!sw) continue;
  const tw = p.meta?.towers || {};
  const offer = tw.towerSwapOffer;
  const sap = tw.adjacency?.satAcrossPrior;
  const take = tw.acrossPriorTake;
  const towers = (p.structures?.tower || []).map(K);
  const towerSet = new Set(towers);
  const d8to = [];
  if (sw.to && Number.isInteger(sw.to.x)) {
    for (const [dx, dy] of D8) {
      const t = { x: sw.to.x + dx, y: sw.to.y + dy };
      d8to.push({
        k: K(t),
        liveTower: towerSet.has(K(t)),
        isFrom: sw.from && K(t) === K(sw.from),
      });
    }
  }
  const occ = {};
  for (const [kind, list] of Object.entries(p.structures || {})) {
    for (const t of list || []) {
      if (t && Number.isInteger(t.x)) {
        const k = K(t);
        occ[k] = occ[k] || [];
        occ[k].push(kind);
      }
    }
  }
  const fromOcc = sw.from ? occ[K(sw.from)] || [] : [];
  const emptyD8ofTo = d8to.filter((x) => !x.liveTower);
  const emptyUnoccD8 = emptyD8ofTo.filter((x) => !(occ[x.k] && occ[x.k].length));
  swaps.push({
    room: p.room,
    from: sw.from,
    to: sw.to,
    towers,
    fromIsTower: sw.from && towerSet.has(K(sw.from)),
    toIsTower: sw.to && towerSet.has(K(sw.to)),
    fromOcc,
    d8ofTo: d8to,
    emptyD8ofTo: emptyD8ofTo.map((x) => x.k),
    emptyUnoccD8: emptyUnoccD8.map((x) => x.k),
    uniqueEmptyD8: emptyD8ofTo.length === 1,
    uniqueUnoccD8: emptyUnoccD8.length === 1,
    offerBest: offer?.best || null,
    offerFromEq: !!(offer?.best?.from && sw.from && K(offer.best.from) === K(sw.from)),
    offerToEq: !!(offer?.best?.to && sw.to && K(offer.best.to) === K(sw.to)),
    sapSeat: sap?.seat || null,
    sapLeaves: sap?.leaves || null,
    sapLeavesEq: !!(sap?.leaves && sw.from && K(sap.leaves) === K(sw.from)),
    sapSeatEq: !!(sap?.seat && sw.to && K(sap.seat) === K(sw.to)),
    takeTaken: take?.taken || null,
    takeFromEq: !!(take?.taken?.from && sw.from && K(take.taken.from) === K(sw.from)),
    takeToEq: !!(take?.taken?.to && sw.to && K(take.taken.to) === K(sw.to)),
    takeWhy: take?.taken?.why || take?.why || null,
    takeOutcome: sap?.takeOutcome || null,
    chebFromTo: sw.from && sw.to ? cheb(sw.from, sw.to) : null,
  });
}

const presenceHist = {};
for (const name of PRESENCE) {
  const rooms = [];
  const types = {};
  for (const p of plans) {
    const hits = grabAll(p, name);
    if (!hits.length) continue;
    types[hits.length] = (types[hits.length] || 0) + 1;
    if (rooms.length < 4) {
      rooms.push({
        room: p.room,
        hits: hits.map((h) => ({
          path: h.path,
          t: Array.isArray(h.v) ? `arr${h.v.length}` : typeof h.v,
          v: Array.isArray(h.v)
            ? h.v.slice(0, 3)
            : h.v && typeof h.v === "object"
              ? Object.keys(h.v).slice(0, 12)
              : h.v,
        })),
      });
    }
  }
  presenceHist[name] = { roomsWith: types, sample: rooms };
}

// leftover derived that may still be weak
const weakDerived = ["spurred", "protectRadius", "hubDistCap", "priceyWall", "takeTowerSwap"];
const derivedHits = {};
for (const name of weakDerived) {
  derivedHits[name] = [];
  for (const p of plans) {
    const hits = grabAll(p, name);
    if (!hits.length) continue;
    if (derivedHits[name].length < 5) derivedHits[name].push({ room: p.room, hits: hits.map((h) => ({ path: h.path, v: h.v })) });
  }
}

// spurred vs laid.spur
const spurRows = [];
for (const p of plans) {
  const spurred = p.meta?.walls?.spurred;
  const laid = p.meta?.walls?.laidByKind?.spur;
  if (typeof spurred === "number" || typeof laid === "number") {
    if (spurRows.length < 12 || spurred !== laid) {
      spurRows.push({ room: p.room, spurred, laid });
    }
  }
}
const spurEq = plans.filter((p) => p.meta?.walls?.spurred === p.meta?.walls?.laidByKind?.spur).length;
const spurN = plans.filter((p) => typeof p.meta?.walls?.spurred === "number").length;

// servedExts / unreachable / unreached vs board-ish
const svc = [];
for (const p of plans) {
  const w = p.meta?.walls || {};
  if (
    typeof w.servedExts === "number" ||
    typeof w.unreachableExts === "number" ||
    typeof w.unreachedClusters === "number"
  ) {
    svc.push({
      room: p.room,
      servedExts: w.servedExts,
      unreachableExts: w.unreachableExts,
      unreachedClusters: w.unreachedClusters,
      servedFree: w.servedFree,
      spurred: w.spurred,
      fillerTiles: w.fillerTiles,
      laidExtFace: w.laidByKind?.extFace,
      laidSpur: w.laidByKind?.spur,
      extN: (p.structures?.extension || []).length,
    });
  }
}
const servedHist = {};
const unreachHist = {};
const unreachedClHist = {};
for (const r of svc) {
  servedHist[r.servedExts] = (servedHist[r.servedExts] || 0) + 1;
  unreachHist[r.unreachableExts] = (unreachHist[r.unreachableExts] || 0) + 1;
  unreachedClHist[r.unreachedClusters] = (unreachedClHist[r.unreachedClusters] || 0) + 1;
}

// digRoads / shallowRamparts
const dig = [];
const shallowR = [];
for (const p of plans) {
  const dHits = grabAll(p, "digRoads");
  const sHits = grabAll(p, "shallowRamparts");
  if (dHits.length && dig.length < 8) dig.push({ room: p.room, hits: dHits });
  if (sHits.length && shallowR.length < 8) shallowR.push({ room: p.room, hits: sHits });
}

const out = {
  md5,
  n: plans.length,
  presenceN: PRESENCE.length,
  derivedN: DERIVED.length,
  presence: PRESENCE,
  swaps,
  swapN: swaps.length,
  spurEq,
  spurN,
  spurMismatch: spurRows.filter((r) => r.spurred !== r.laid).slice(0, 20),
  spurSample: spurRows.slice(0, 8),
  servedHist,
  unreachHist,
  unreachedClHist,
  svcSample: svc.slice(0, 8),
  svcNonzeroUnreach: svc.filter((r) => r.unreachableExts).slice(0, 8),
  svcNonzeroUnreachedCl: svc.filter((r) => r.unreachedClusters).slice(0, 8),
  dig,
  shallowR,
  presenceSample: Object.fromEntries(
    ["servedExts", "digRoads", "shallowRamparts", "inertPromoted", "strandedFirst", "haulCost", "cleanAnchor", "freeLeft", "deepBudget", "baseOverGated", "rolledBackFrom", "rescuedTo", "paveRetired"].map((n) => [n, presenceHist[n]]),
  ),
};

const dest = path.join(DIR, "r29p19-probe.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  md5,
  n: plans.length,
  presenceN: PRESENCE.length,
  derivedN: DERIVED.length,
  swapN: swaps.length,
  swapRooms: swaps.map((s) => s.room),
  offerFromEq: swaps.filter((s) => s.offerFromEq).length,
  offerToEq: swaps.filter((s) => s.offerToEq).length,
  sapLeavesEq: swaps.filter((s) => s.sapLeavesEq).length,
  sapSeatEq: swaps.filter((s) => s.sapSeatEq).length,
  takeFromEq: swaps.filter((s) => s.takeFromEq).length,
  takeToEq: swaps.filter((s) => s.takeToEq).length,
  uniqueEmptyD8: swaps.filter((s) => s.uniqueEmptyD8).length,
  uniqueUnoccD8: swaps.filter((s) => s.uniqueUnoccD8).length,
  emptyD8counts: swaps.map((s) => [s.room, s.emptyD8ofTo.length, s.emptyUnoccD8.length, s.from && `${s.from.x},${s.from.y}`, s.to && `${s.to.x},${s.to.y}`]),
  spurEq,
  spurN,
  servedHist,
  unreachHist,
  unreachedClHist,
  dest,
}, null, 2));
