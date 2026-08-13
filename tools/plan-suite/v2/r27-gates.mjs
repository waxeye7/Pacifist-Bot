/**
 * Round 27 / MF5 + MF6 — the two CLASS inventories the per-finding gates do not
 * replace.
 *
 * MF5: every string field whose name matches /Basis$|Why$/ is registered.
 *      Unregistered = fail. The eleven fields the review found unread are
 *      re-rendered (or parsed against their own leaves) and compared whole.
 *
 * MF6: every identifier leaf name in `meta` is in the r27 snapshot. A new
 *      name is a load/check failure until it is classed. The 105 names that
 *      appeared nowhere in validate.mjs carry an explicit klass + reason;
 *      the cheap ones are derived here.
 */
import { D4, D8, buildable, chebyshev, walkable, exteriorFlood, mineralGuard, reservedTiles } from "./shared.mjs";
import { fieldFrom, winningSeedScore } from "./layer-hub.mjs";
import { arriveAt, bfsField, BUILT_OBSTACLES, enclosureMobility, interiorWalk, maskFromKeys, MAX_CUT, mobilityStats, MOBILITY_TARGET, pickBattlements, RADII_WIDE } from "./layer-shell.mjs";
import {
  ENCLOSURE_BASIS,
  REMEASURE_BASIS,
  REFILL_BASIS,
  PRUNED_BASIS,
  SEALED_COUNTERFACTUAL_BASIS,
  DEEP_TILES_BASIS,
  NOTE_OBLIGATION_BASIS,
  renderEnclosureBasis,
  renderRemeasureReason,
  renderRefillBasis,
  renderPrunedBasis,
  renderCounterfactualBasis,
  renderDeepTilesBasis,
  renderNoteObligationBasis,
} from "./layer-walls.mjs";
import { MIN_SAT, SWAP_OFFER_BASIS, renderSwapOfferBasis, shellDamage } from "./layer-towers.mjs";
import { renderMineralOffNetworkWhy, mineralSeatCensus } from "./layer-misc.mjs";
import idents from "./_r27-idents.json" with { type: "json" };

const K = (t) => `${t.x},${t.y}`;
const idx = (x, y) => x + y * 50;
const COORD = /^\d{1,2},\d{1,2}$/;
const DEPTH_SAFE = 4;
const SHALLOW_LAB_COST = 3;
const FLANK_RELAX = 2;
const FLANK_HARD_CAP = 18;
const STUB_CAP_POOR = 43;
const STUB_CAP_RICH = 51;
const STUB_RICH_RATIO = 1.5;
const HUB_CAP_LADDER = [16, 19, 23, 999];
const ESCALATION_RADII_LATE = [10, 11, 12, 13, 14];
const MIN_CLUSTER = 2;
const L6_OCC_TYPES = ["storage", "terminal", "link", "spawn", "container", "tower", "lab", "nuker", "observer"];
const round2 = (v) => Math.round(Number(v) * 100) / 100;

/** chebyshev depth from an exterior flood — same steps as validate.mjs. */
function depthFromExterior(ext) {
  const depth = new Int16Array(2500).fill(999);
  const q = [];
  for (let i = 0; i < 2500; i++) {
    if (ext[i]) {
      depth[i] = 0;
      q.push(i);
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % 50;
    const y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = nx + ny * 50;
      if (depth[ni] <= depth[i] + 1) continue;
      depth[ni] = depth[i] + 1;
      q.push(ni);
    }
  }
  return depth;
}
/** 99,99 matches COORD. The floor bind parses any integer pair. */
function parseCoord(k) {
  const m = /^(-?\d+),(-?\d+)$/.exec(String(k));
  if (!m) return null;
  return { x: +m[1], y: +m[2] };
}
/**
 * Chebyshev interpolation. Intermediates are the roads the greedy skipped —
 * a reserved tile may sit a few walkable steps off the rest of the walk.
 */
function walkableChebGap(terrain, a, b) {
  let x = a.x;
  let y = a.y;
  while (x !== b.x || y !== b.y) {
    if (x !== b.x) x += Math.sign(b.x - x);
    if (y !== b.y) y += Math.sign(b.y - y);
    if (x === b.x && y === b.y) break;
    if (!walkable(terrain, x, y)) return false;
  }
  return true;
}
/** cheb≤2 of another reserved/cut, or a walkable gap of cheb≤5 (skipped roads). */
function reservedTouchesWalk(pt, pts, cutPts, terrain) {
  for (const q of pts) {
    if (q === pt) continue;
    const d = chebyshev(pt, q);
    if (d <= 2) return true;
    if (d <= 5 && walkableChebGap(terrain, pt, q)) return true;
  }
  for (const c of cutPts) {
    const d = chebyshev(pt, c);
    if (d <= 2) return true;
    if (d <= 5 && walkableChebGap(terrain, pt, c)) return true;
  }
  return false;
}
const BASIS_WHY_NAME = /Basis$|Why$/i;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const META_LEAF_NAMES = new Set(idents.all);

/**
 * The 105 identifier names that did not appear in validate.mjs when this
 * inventory was closed. klass:
 *   derived  — re-derived below
 *   rendered — held by the MF5 renderer gates
 *   twin     — must equal a sibling field
 *   presence — published, content unread, reason stated
 */
export const META_DARK = {
  arrayPartner: { klass: "derived" },
  baseCut: { klass: "presence", why: "layer-2's pick size before expand/useless-prune; priceyWall is the derived consequence (baseCut > MAX_CUT); the exact pick is a search witness" },
  baseLap: { klass: "derived" },
  baseOverGated: { klass: "derived" },
  battlementFloor: { klass: "derived" },
  battlementGap: { klass: "derived" },
  battlementGapTiles: { klass: "derived" },
  boundHeld: { klass: "derived" },
  boundLap: { klass: "derived" },
  boundRederived: { klass: "presence", why: "the bound re-read after relocation; a layer-6 witness" },
  budgetSpent: { klass: "presence", why: "layer-6 lane reservation spend; the reservation is the note's evidence" },
  causeFirst: { klass: "presence", why: "mobility-cause tie-break witness on a declaration record" },
  center: { klass: "derived" },
  cleanAnchor: { klass: "presence", why: "lab-anchor search witness; the shipped diamond is gated" },
  corridorFallback: { klass: "derived" },
  corridorPlaced: { klass: "derived" },
  counterfactualBasis: { klass: "rendered" },
  coveredDetourDeclared: { klass: "derived" },
  cutAdopted: { klass: "derived" },
  deepBudget: { klass: "presence", why: "layer-6 deep-tile budget witness" },
  deepExhausted: { klass: "presence", why: "layer-6 search exhaustion flag" },
  deepReach: { klass: "derived" },
  digRoads: { klass: "presence", why: "layer-5 road-on-wall tunnel count; the road+rampart taxonomy is gated" },
  enclosureBasis: { klass: "rendered" },
  extractorOffNetwork: { klass: "derived" },
  extractorSeatNetTiles: { klass: "derived" },
  faceAndSatHeld: { klass: "presence", why: "towerSwapOffer leaf; the offer basis is rendered from it" },
  fillerTiles: { klass: "derived" },
  floorGated: { klass: "derived" },
  floorOver: { klass: "derived" },
  floorOverGated: { klass: "derived" },
  floorUngated: { klass: "derived" },
  freeDin: { klass: "derived" },
  freeLeft: { klass: "presence", why: "layer-6 remaining free-deep count" },
  haulCost: { klass: "presence", why: "lab haul scoring witness; the shipped haul is declared" },
  hubDistCap: { klass: "derived" },
  inertPromoted: { klass: "presence", why: "inert-prune promotion roster; cutDrift binds the prune" },
  lapCeilingFloor: { klass: "derived" },
  lapVeto: { klass: "presence", why: "layer-3/4 lap veto record; the as-built lap is gated" },
  massAdds: { klass: "derived" },
  maxDist: { klass: "derived" },
  maxHubDist: { klass: "derived" },
  minDmgArray: { klass: "derived" },
  minDmgPicked: { klass: "derived" },
  mineralApproachAtReservation: { klass: "derived" },
  mineralBubble: { klass: "derived" },
  mineralContainer: { klass: "derived" },
  mineralOffNetworkWhy: { klass: "rendered" },
  mineralSeatAtReservation: { klass: "derived" },
  mineralSeatNetTiles: { klass: "derived" },
  mobilityRepair: { klass: "presence", why: "layer-6 repair-attempt record" },
  mobilityShipped: { klass: "derived" },
  mobilityShippedFree: { klass: "derived" },
  newRoads: { klass: "derived" },
  noAlternative: { klass: "presence", why: "a search-refusal witness" },
  nukerHubDist: { klass: "derived" },
  nukerInWindow: { klass: "derived" },
  observerHubDist: { klass: "derived" },
  parkCap: { klass: "derived" },
  paveRetired: { klass: "presence", why: "layer-7b reflow witness" },
  pickedBy: { klass: "presence", why: "a search's own picker label" },
  priceProven: { klass: "presence", why: "towerSwapOffer leaf; the offer basis is rendered from it" },
  priceyWall: { klass: "derived" },
  protectRadius: { klass: "derived" },
  prunedBasis: { klass: "rendered" },
  radii: { klass: "derived" },
  rcl5Pair: { klass: "derived" },
  refillBasis: { klass: "rendered" },
  refillDistsUnblocked: { klass: "derived" },
  remeasured: { klass: "rendered" },
  rescueSpent: { klass: "presence", why: "layer-6 rescue spend" },
  rescuedLap: { klass: "presence", why: "layer-6 rescue witness" },
  rescuedTo: { klass: "presence", why: "layer-6 rescue destination" },
  roadsEaten: { klass: "derived" },
  rolledBackFrom: { klass: "presence", why: "layer-7b rollback origin" },
  searchedSeats: { klass: "presence", why: "towerSwapOffer leaf" },
  servedExts: { klass: "derived" },
  servedFree: { klass: "derived" },
  shallowCost: { klass: "derived" },
  shallowNow: { klass: "presence", why: "reflow's own remaining-shallow count; the board's shallow set is gated" },
  shallowRamparts: { klass: "presence", why: "personal-rampart count at a layer; the board's ramparts are gated" },
  shallowRefused: { klass: "derived" },
  shippedAvgShellDmg: { klass: "derived" },
  shippedShellDmg: { klass: "derived" },
  shippedWeakTiles: { klass: "derived" },
  shippedWeakest: { klass: "derived" },
  spurred: { klass: "derived" },
  stitchTiles: { klass: "derived" },
  stitched: { klass: "derived" },
  strandedFirst: { klass: "presence", why: "conduct-bridge witness" },
  stubCap: { klass: "derived" },
  stubExhausted: { klass: "presence", why: "layer-6 stub exhaustion" },
  stubRoads: { klass: "derived" },
  swampPaved: { klass: "derived" },
  takeTowerSwap: { klass: "derived" },
  tourRule: { klass: "presence", why: "sealed-recovery tour ceiling (OF6)" },
  towerOnly: { klass: "derived" },
  towerSwapOffer: { klass: "presence", why: "the offer record; its basis is rendered" },
  tradeCost: { klass: "presence", why: "a priced-refusal witness" },
  unreachableExts: { klass: "derived" },
  unreachedClusters: { klass: "derived" },
  unsealed: { klass: "presence", why: "a pocket-unseal witness" },
  uselessCut: { klass: "presence", why: "tiles layer-2 kept that the single-removal test does not need; redundantCut is gated" },
  wasLap: { klass: "derived" },
  worstCase: { klass: "presence", why: "layer-6 worst-case bound" },
  worstCaseUngated: { klass: "presence", why: "layer-6 worst-case ungated bound" },
};

/** every *Basis / *Why string field, keyed by the walk below. */
export const BASIS_WHY = {
  ctrlParkFloorWhy: { klass: "gated", why: "REQUIRED_META presence" },
  "refused.why": { klass: "prose", why: "OL6 five-sentence registry + engine-border board gate" },
  exteriorContractBasis: { klass: "gated", why: "census parsed against the four contract entries" },
  mineralOffNetworkWhy: { klass: "rendered" },
  noteObligationBasis: { klass: "rendered" },
  "rec.basis": { klass: "gated", why: "note-record identity / sealedFloor.basis twin" },
  counterfactualBasis: { klass: "rendered" },
  "declaredSkipped.why": { klass: "gated", why: "recovery-record element inventory" },
  "reason.why": { klass: "gated", why: "redundantCut class inventory" },
  "next.basis": { klass: "gated", why: "recovery next-run record, same basis family" },
  "offered.why": { klass: "gated", why: "recovery offered-candidate inventory" },
  "orphanedByRemoval.basis": { klass: "gated", why: "recovery orphan record" },
  preTakeShortfallBasis: { klass: "gated", why: "census parsed against the record (criticism 132)" },
  "residual.why": { klass: "gated", why: "recovery residual inventory" },
  "openingExited.why": { klass: "gated", why: "OM2 opening-class partition" },
  "taken.why": { klass: "gated", why: "recovery take record" },
  "sealedFloor.basis": { klass: "gated", why: "sealed-floor derivation" },
  "sealedRecovery.basis": { klass: "gated", why: "recovery derivation" },
  "closures.basis": { klass: "gated", why: "shell-closure derivation" },
  "cutDrift.why": { klass: "rendered", via: "cutDriftWhy" },
  deepTilesBasis: { klass: "rendered" },
  enclosureBasis: { klass: "rendered" },
  "reasons.why": { klass: "gated", why: "redundantCut per-tile class inventory" },
  anchorFloorBasis: { klass: "gated", why: "eco declaration renderer" },
  "slots.why": { klass: "prose", why: "shallowExt slot APROSE" },
  "acrossPriorTake.basis": { klass: "gated", why: "satAcrossPrior renderer" },
  "crossings.basis": { klass: "gated", why: "tower adjacency record" },
  "crossings.why": { klass: "gated", why: "tower adjacency record" },
  "satAcrossPrior.basis": { klass: "gated", why: "renderSatBasis" },
  refillBasis: { klass: "rendered" },
  "towerSwapOffer.basis": { klass: "rendered" },
  "alongCutRefused.why": { klass: "gated", why: "along-cut refusal re-derivation" },
  prunedBasis: { klass: "rendered" },
  "shallowRefused.why": { klass: "prose", why: "reflow refusal registry" },
};

function walkMeta(obj, trail, onString, onName) {
  if (obj == null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) walkMeta(el, trail, onString, onName);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (onName) onName(k);
    const next = trail.concat(k);
    if (typeof v === "string" && BASIS_WHY_NAME.test(k) && onString) {
      let invKey = k;
      if (/^(why|basis)$/i.test(k)) {
        const parent = trail[trail.length - 1] || "";
        const grand = trail[trail.length - 2] || "";
        invKey = COORD.test(parent) ? `${grand}.${k}` : `${parent}.${k}`;
      }
      onString(invKey, next.join("."), v);
    }
    if (v && typeof v === "object") walkMeta(v, next, onString, onName);
  }
}

function netTilesOf(plan) {
  const net = new Set((plan.structures?.road || []).map((r) => K(r)));
  for (const c of plan.structures?.container || []) net.add(K(c));
  return net;
}

function mineralSeatOf(plan) {
  if (!plan.mineral) return null;
  return (plan.structures?.container || []).find((c) => chebyshev(c, plan.mineral) <= 1) || null;
}

/** chebyshev tower damage — same steps as layer-towers.mjs towerDmg. */
function towerDmgAt(a, b) {
  const r = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  if (r <= 5) return 600;
  if (r >= 20) return 150;
  return 600 - (r - 5) * 30;
}

/** weakest freeze-cut tile under a two-tower pair. */
function towerPairMinDmg(t0, t1, cut) {
  let mn = Infinity;
  for (const c of cut || []) {
    if (!c || !Number.isInteger(c.x)) continue;
    const d = towerDmgAt(t0, c) + towerDmgAt(t1, c);
    if (d < mn) mn = d;
  }
  return Number.isFinite(mn) ? mn : 0;
}

/** shipped-cut clusters that already D8-touch a pre-layer-7 road. */
function servedFreeOf(cut, roadLayer) {
  const cutSet = new Set();
  const tiles = [];
  for (const c of cut || []) {
    if (!c || !Number.isInteger(c.x)) continue;
    cutSet.add(K(c));
    tiles.push(c);
  }
  const pre = new Set();
  for (const [k, v] of Object.entries(roadLayer || {})) {
    if (v < 7) pre.add(k);
  }
  const seen = new Set();
  let n = 0;
  for (const c of tiles) {
    const k0 = K(c);
    if (seen.has(k0)) continue;
    seen.add(k0);
    const cl = [c];
    for (let i = 0; i < cl.length; i++) {
      for (const [dx, dy] of D8) {
        const k = `${cl[i].x + dx},${cl[i].y + dy}`;
        if (seen.has(k) || !cutSet.has(k)) continue;
        seen.add(k);
        cl.push({ x: cl[i].x + dx, y: cl[i].y + dy });
      }
    }
    let already = false;
    for (const t of cl) {
      for (const [dx, dy] of D8) {
        if (pre.has(`${t.x + dx},${t.y + dy}`)) {
          already = true;
          break;
        }
      }
      if (already) break;
    }
    if (already) n++;
  }
  return n;
}

/** object tiles + built obstacles; skipExtension lifts the mass the floor reading lifts. */
function builtBlocked(plan, skipExtension) {
  const blocked = new Set();
  for (const src of plan.sources || []) blocked.add(K(src));
  if (plan.controller) blocked.add(K(plan.controller));
  if (plan.mineral) blocked.add(K(plan.mineral));
  if (plan.sitter) blocked.add(K(plan.sitter));
  for (const t of BUILT_OBSTACLES) {
    if (skipExtension && t === "extension") continue;
    for (const q of plan.structures?.[t] || []) blocked.add(K(q));
  }
  return blocked;
}

/** interior walk on the shipped ramparts with that occupancy. */
function shippedInterior(plan, extShip, terrain, skipExtension) {
  const rset = new Set((plan.structures?.rampart || []).map(K));
  return interiorWalk(terrain, rset, extShip, builtBlocked(plan, skipExtension), plan.sitter);
}

/** max sitter-to-road BFS on the conducting network (roads + containers). */
function roadOrderMaxDist(plan) {
  const sitter = plan.sitter;
  if (!sitter) return null;
  const conduct = new Set((plan.structures?.road || []).map(K));
  for (const c of plan.structures?.container || []) conduct.add(K(c));
  conduct.add(K(sitter));
  const dist = new Map([[K(sitter), 0]]);
  const q = [{ x: sitter.x, y: sitter.y }];
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    const d = dist.get(K(cur));
    for (const [dx, dy] of D8) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const k = `${nx},${ny}`;
      if (dist.has(k) || !conduct.has(k)) continue;
      dist.set(k, d + 1);
      q.push({ x: nx, y: ny });
    }
  }
  let mx = 0;
  for (const r of plan.structures?.road || []) {
    const d = dist.get(K(r));
    if (d != null && d > mx) mx = d;
  }
  return mx;
}

/** fullest 5x5 count over spawn/storage/terminal/tower — layer 3's set, no nuker. */
function towerOnlyWindowOf(plan) {
  const pts = [];
  for (const t of ["spawn", "storage", "terminal", "tower"]) {
    for (const q of plan.structures?.[t] || []) pts.push({ x: q.x, y: q.y });
  }
  if (!pts.length) return null;
  let mx = 0;
  for (const a of pts) {
    for (let ox = -2; ox <= 2; ox++) {
      for (let oy = -2; oy <= 2; oy++) {
        const cx = a.x + ox;
        const cy = a.y + oy;
        if (cx < 0 || cy < 0 || cx > 49 || cy > 49) continue;
        let n = 0;
        for (const b of pts) if (Math.abs(b.x - cx) <= 2 && Math.abs(b.y - cy) <= 2) n++;
        if (n > mx) mx = n;
      }
    }
  }
  return mx;
}

/** fullest 5x5 over spawn/storage/terminal/nuker/tower; tie-break is north-then-west. */
function nukeWindowCenterOf(plan) {
  const pts = [];
  for (const t of ["spawn", "storage", "terminal", "nuker", "tower"]) {
    for (const q of plan.structures?.[t] || []) pts.push({ x: q.x, y: q.y });
  }
  let mx = 0;
  let at = null;
  for (const a of pts) {
    for (let ox = -2; ox <= 2; ox++) {
      for (let oy = -2; oy <= 2; oy++) {
        const cx = a.x + ox;
        const cy = a.y + oy;
        if (cx < 0 || cy < 0 || cx > 49 || cy > 49) continue;
        let n = 0;
        for (const b of pts) if (Math.abs(b.x - cx) <= 2 && Math.abs(b.y - cy) <= 2) n++;
        if (n > mx || (n === mx && at && (cy < at.y || (cy === at.y && cx < at.x)))) {
          mx = n;
          at = { x: cx, y: cy };
        }
      }
    }
  }
  return at;
}

function objectTilesOf(plan) {
  const s = new Set();
  for (const src of plan.sources || []) s.add(K(src));
  if (plan.controller) s.add(K(plan.controller));
  if (plan.mineral) s.add(K(plan.mineral));
  return s;
}

/** layer 5's hub field: hub kit + towers + labs + non-mineral containers. Mineral seat is placed after the walk. */
function hubFieldAtLayer5(terrain, plan) {
  const occ = new Set();
  for (const t of ["storage", "terminal", "link", "spawn", "tower", "lab"]) {
    for (const q of plan.structures?.[t] || []) occ.add(K(q));
  }
  const seat = mineralSeatOf(plan);
  for (const c of plan.structures?.container || []) {
    if (seat && c.x === seat.x && c.y === seat.y) continue;
    occ.add(K(c));
  }
  if (plan.sitter) occ.add(K(plan.sitter));
  for (const k of objectTilesOf(plan)) occ.add(k);
  return fieldFrom(terrain, plan.sitter, occ);
}

function freezeCutOf(plan) {
  const sh = plan.meta?.shell || {};
  return Array.isArray(sh.cutAtFreeze) && sh.cutAtFreeze.length ? sh.cutAtFreeze : sh.cut || [];
}

/** layer 6's occupancy at the start of the cohesion walk — extensions have not landed. */
function l6Occupied(plan) {
  const occ = new Set();
  for (const t of L6_OCC_TYPES) {
    for (const q of plan.structures?.[t] || []) occ.add(K(q));
  }
  for (const k of objectTilesOf(plan)) occ.add(k);
  return occ;
}

/** claim seat + parks. The artifact ships them on meta; layer 6 reads plan.parkReserve. */
function l6Reserved(plan) {
  const s = reservedTiles(plan);
  for (const p of plan.parkReserve || plan.meta?.ctrlParkReserve || []) {
    if (p && Number.isInteger(p.x) && Number.isInteger(p.y)) s.add(K(p));
  }
  const seat = plan.claimSeat || plan.meta?.claimSeat;
  const appr = plan.claimApproach || plan.meta?.claimApproach;
  if (seat && Number.isInteger(seat.x)) s.add(K(seat));
  if (appr && Number.isInteger(appr.x)) s.add(K(appr));
  return s;
}

function preL6Paved(plan) {
  const s = new Set();
  for (const [k, v] of Object.entries(plan.meta?.roadLayer || {})) {
    if (typeof v === "number" && v < 6) s.add(k);
  }
  return s;
}

/**
 * Layer 6's rich/poor paving ceiling: 51 iff deep ext-capable tiles / 60 >= 1.5.
 * The cohesion ceiling is 18 on every legal rung (min(cap+2, 18)), so the pool
 * does not depend on the unread hubDistCap pick.
 */
function wantStubCap(terrain, plan) {
  if (!plan.sitter) return null;
  const freeze = freezeCutOf(plan);
  const freezeSet = new Set(freeze.map(K));
  const ext = exteriorFlood(terrain, freezeSet);
  const depth = depthFromExterior(ext);
  const occ = l6Occupied(plan);
  const reserved = l6Reserved(plan);
  const paved = preL6Paved(plan);
  const forbid = new Set();
  for (const s of Array.isArray(plan.meta?.composeOpts?.forbidExtSeat) ? plan.meta.composeOpts.forbidExtSeat : []) {
    if (s && Number.isInteger(s.x)) forbid.add(K(s));
  }
  const hf = fieldFrom(terrain, plan.sitter, occ);
  const mGuard = mineralGuard(terrain, plan);
  const blockedNow = new Set(occ);
  let n = 0;
  for (let x = 2; x <= 47; x++) {
    for (let y = 2; y <= 47; y++) {
      const i = idx(x, y);
      if (depth[i] < DEPTH_SAFE || ext[i] || !buildable(terrain, x, y)) continue;
      const k = `${x},${y}`;
      if (occ.has(k) || reserved.has(k) || paved.has(k) || forbid.has(k)) continue;
      if (hf[i] >= 9999 || hf[i] > FLANK_HARD_CAP) continue;
      if (!mGuard.ok({ x, y }, blockedNow)) continue;
      n++;
    }
  }
  return n / 60 >= STUB_RICH_RATIO ? STUB_CAP_RICH : STUB_CAP_POOR;
}

/** layer 6's mass-free ungated lap on the freeze cut, extensions not yet placed. */
function wantFloorUngated(terrain, plan) {
  if (!plan.sitter) return null;
  const freeze = freezeCutOf(plan);
  if (!freeze.length) return null;
  const freezeSet = new Set(freeze.map(K));
  const ext = exteriorFlood(terrain, freezeSet);
  const walkBlocked = l6Occupied(plan);
  for (const c of plan.structures?.container || []) walkBlocked.delete(K(c));
  const walk = interiorWalk(terrain, freezeSet, ext, walkBlocked, plan.sitter);
  return round2(mobilityStats(freeze, ext, maskFromKeys(walk)).max);
}

function wantComposeRadii(opts) {
  const bonus = opts?.needDeepBonus;
  if (bonus === 85) return ESCALATION_RADII_LATE;
  if (bonus === 25 || bonus === 55) return RADII_WIDE;
  return null;
}

/** fieldFrom's unreachable sentinel (same INF as layer-hub). */
const HUB_FIELD_INF = 999;

/**
 * End-of-layer-6 extension seats: the shipped mass, minus 7b backfill, with
 * each 7b move wound back to its origin. maxHubDist is measured on that set.
 */
function l6ExtensionSeats(plan) {
  const rf = plan.meta?.extensions?.reflow || plan.meta?.walls?.reflow || {};
  const added = new Set();
  for (const a of rf.added || []) {
    if (a && Number.isInteger(a.x) && Number.isInteger(a.y)) added.add(K(a));
  }
  const seats = new Map();
  for (const e of plan.structures?.extension || []) {
    if (!e || !Number.isInteger(e.x) || !Number.isInteger(e.y)) continue;
    const k = K(e);
    if (added.has(k)) continue;
    seats.set(k, { x: e.x, y: e.y });
  }
  for (const m of rf.moved || []) {
    if (!m?.from || !m?.to || !Number.isInteger(m.from.x) || !Number.isInteger(m.to.x)) continue;
    const tk = K(m.to);
    if (!seats.has(tk)) continue;
    seats.delete(tk);
    seats.set(K(m.from), { x: m.from.x, y: m.from.y });
  }
  return [...seats.values()];
}

/**
 * The take this room published: acrossPriorTake.taken (twin of towerSwapTaken),
 * else the offer whose destination is a shipped tower, else the lift across
 * the prior. composeOpts.takeTowerSwap is that pair, not a D8 ring.
 */
function wantTakenSwap(plan) {
  const taken = plan.meta?.towers?.acrossPriorTake?.taken;
  if (taken && Number.isInteger(taken.from?.x) && Number.isInteger(taken.to?.x)) {
    return { from: taken.from, to: taken.to };
  }
  const twin = plan.meta?.towers?.towerSwapTaken;
  if (twin && Number.isInteger(twin.from?.x) && Number.isInteger(twin.to?.x)) {
    return { from: twin.from, to: twin.to };
  }
  const towers = new Set((plan.structures?.tower || []).map(K));
  const offer = plan.meta?.towers?.towerSwapOffer?.best;
  if (
    offer &&
    Number.isInteger(offer.from?.x) &&
    Number.isInteger(offer.to?.x) &&
    towers.has(K(offer.to))
  ) {
    return { from: offer.from, to: offer.to };
  }
  const sap = plan.meta?.towers?.adjacency?.satAcrossPrior;
  if (
    sap?.leaves &&
    sap?.seat &&
    Number.isInteger(sap.leaves.x) &&
    Number.isInteger(sap.seat.x) &&
    towers.has(K(sap.seat))
  ) {
    return { from: sap.leaves, to: sap.seat };
  }
  return null;
}

/** shipped-cut clusters of size ≥ MIN_CLUSTER that no shipped road D8-touches. */
function wantUnreachedClusters(plan) {
  const cut = plan.meta?.shell?.cut || [];
  const cutSet = new Set();
  const tiles = [];
  for (const c of cut) {
    if (!c || !Number.isInteger(c.x)) continue;
    cutSet.add(K(c));
    tiles.push(c);
  }
  const roads = new Set((plan.structures?.road || []).map(K));
  const seen = new Set();
  let n = 0;
  for (const c of tiles) {
    const k0 = K(c);
    if (seen.has(k0)) continue;
    seen.add(k0);
    const cl = [c];
    for (let i = 0; i < cl.length; i++) {
      for (const [dx, dy] of D8) {
        const k = `${cl[i].x + dx},${cl[i].y + dy}`;
        if (seen.has(k) || !cutSet.has(k)) continue;
        seen.add(k);
        cl.push({ x: cl[i].x + dx, y: cl[i].y + dy });
      }
    }
    if (cl.length < MIN_CLUSTER) continue;
    let hit = false;
    for (const t of cl) {
      for (const [dx, dy] of D8) {
        if (roads.has(`${t.x + dx},${t.y + dy}`)) {
          hit = true;
          break;
        }
      }
      if (hit) break;
    }
    if (!hit) n++;
  }
  return n;
}

/** extensions with no D4 road on the shipped network. */
function wantUnreachableExts(plan) {
  const roads = new Set((plan.structures?.road || []).map(K));
  let n = 0;
  for (const e of plan.structures?.extension || []) {
    if (!e || !Number.isInteger(e.x)) continue;
    if (!D4.some(([dx, dy]) => roads.has(`${e.x + dx},${e.y + dy}`))) n++;
  }
  return n;
}

/**
 * Layer-5 mobility-veto board: freeze cut, extension mass / nuker / observer
 * lifted. baseOverGated is that walk's overGated; baseLap / wasLap are its maxGated.
 */
function wantLayer5VetoMobility(terrain, plan) {
  const cut = freezeCutOf(plan);
  if (!cut.length || !plan.sitter) return null;
  const cutSet = new Set(cut.map(K));
  const ext = exteriorFlood(terrain, cutSet);
  const blocked = builtBlocked(plan, true);
  for (const t of ["nuker", "observer"]) {
    for (const q of plan.structures?.[t] || []) blocked.delete(K(q));
  }
  const walk = interiorWalk(terrain, cutSet, ext, blocked, plan.sitter);
  return mobilityStats(cut, ext, maskFromKeys(walk));
}

/** layer 6's hub-field max over the seats it stood, before the 7b reflow. */
function wantMaxHubDist(terrain, plan) {
  if (!plan.sitter) return null;
  const seats = l6ExtensionSeats(plan);
  if (!seats.length) return 0;
  const hf = fieldFrom(terrain, plan.sitter, l6Occupied(plan));
  let mx = 0;
  for (const e of seats) {
    const v = hf[idx(e.x, e.y)];
    if (v < HUB_FIELD_INF && v > mx) mx = v;
  }
  return mx;
}

/** layer 3's pre-mass refill field: hub-kit blockers only. Containers are walkable. */
function refillFieldAtLayer3(terrain, plan) {
  const blk = new Set();
  for (const t of ["storage", "terminal", "link", "spawn"]) {
    for (const q of plan.structures?.[t] || []) blk.add(K(q));
  }
  for (const k of objectTilesOf(plan)) blk.add(k);
  return fieldFrom(terrain, plan.sitter, blk);
}

function consideredOf(plan) {
  const considered = [];
  const owe = (cls, why) => considered.push({ cls, why });
  const sf = plan.meta?.sealedFloor;
  owe("sealedFloor", sf && sf.tiles > 0 ? [{ field: "meta.sealedFloor.tiles", value: sf.tiles }] : []);
  const rc = plan.meta?.shell?.redundantCut;
  owe(
    "redundantCut",
    rc
      ? [
          { field: "meta.shell.redundantCut.tiles", value: rc.tiles },
          { field: "meta.shell.redundantCut.pruned", value: rc.pruned },
        ].filter((e) => e.value > 0)
      : [],
  );
  const cb = plan.meta?.walls?.conductBridge;
  owe("containerRoad", cb && (cb.added || []).length ? [{ field: "meta.walls.conductBridge.added", value: cb.added.length }] : []);
  owe("pavingGap", cb && (cb.stranded || []).length ? [{ field: "meta.walls.conductBridge.stranded", value: cb.stranded.length }] : []);
  const runs = plan.meta?.walls?.alongCutRuns;
  owe("pavedRun", runs && runs.length ? [{ field: "meta.walls.alongCutRuns", value: runs.length }] : []);
  const cl = plan.meta?.shell?.closures;
  owe("shellClosure", cl && cl.needed ? [{ field: "meta.shell.closures.leaked", value: cl.leaked }] : []);
  const rr = plan.meta?.walls?.roadRampart;
  owe(
    "roadRampart",
    rr
      ? [
          { field: "meta.walls.roadRampart.ring", value: rr.ring },
          { field: "meta.walls.roadRampart.unclassified", value: rr.unclassified },
        ].filter((e) => e.value > 0)
      : [],
  );
  const ex = plan.meta?.extensions;
  owe(
    "shallowExt",
    ex
      ? [
          { field: "meta.extensions.shallow", value: ex.shallow || 0 },
          { field: "meta.extensions.relocatedCount", value: ex.relocatedCount || 0 },
          { field: "meta.extensions.reflow.moved", value: (ex.reflow?.moved || []).length },
          { field: "meta.extensions.reflow.added", value: (ex.reflow?.added || []).length },
        ].filter((e) => e.value > 0)
      : [],
  );
  return considered;
}

function enclosureCensus(plan, extShip, terrain) {
  const outside = (p) => !!(extShip && extShip[idx(p.x, p.y)]);
  const ringOf = (o) => {
    const ring = [];
    for (const [dx, dy] of D8) {
      const x = o.x + dx,
        y = o.y + dy;
      if (x < 0 || y < 0 || x > 49 || y > 49) continue;
      if (walkable(terrain, x, y)) ring.push({ x, y });
    }
    return ring;
  };
  const links = plan.structures?.link || [];
  const srcLinks = links.slice(1, Math.max(1, links.length - 1));
  const sources = [];
  let enclosedStrict = 0;
  for (const s of plan.sources || []) {
    const mine = [
      ...(plan.structures?.container || []).filter((c) => chebyshev(c, s) <= 1),
      ...srcLinks.filter((l) => chebyshev(l, s) <= 2),
    ];
    const ring = ringOf(s);
    const ringOut = ring.filter(outside);
    const worksOut = mine.filter(outside);
    const strict = mine.length > 0 && worksOut.length === 0 && ringOut.length === 0;
    if (strict) enclosedStrict++;
    sources.push({
      at: { x: s.x, y: s.y },
      works: mine.length,
      worksOutside: worksOut,
      ring: ring.length,
      ringOutside: ringOut,
      strict,
    });
  }
  return {
    sources,
    enclosedStrict,
    atNegotiation: plan.meta?.shell?.enclosedAtNegotiation?.sources ?? 0,
  };
}

function occupiedCount(plan) {
  const occ = new Set();
  for (const t of Object.keys(plan.structures || {})) {
    if (t === "road" || t === "rampart") continue;
    for (const q of plan.structures[t] || []) occ.add(K(q));
  }
  for (const s of plan.sources || []) occ.add(K(s));
  if (plan.controller) occ.add(K(plan.controller));
  if (plan.mineral) occ.add(K(plan.mineral));
  return occ.size;
}

function say(fails, field, shipped, want) {
  const a = String(shipped);
  const b = String(want);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  fails.push(
    `meta/${field} — shipped prose is not the sentence this room's own census renders. They agree for ` +
      `${i} character(s) then diverge. WHOLE-VALUE: this is one of the eleven *Basis/*Why fields the ` +
      `round-27 review replaced fleet-wide with one invented sentence at 172/172. ` +
      `Shipped: "…${a.slice(Math.max(0, i - 24), i + 48)}…". Derived: "…${b.slice(Math.max(0, i - 24), i + 48)}…"`,
  );
}

/**
 * MF5 + MF6 checks for one room. `ctx.extShip` is the exterior flood over the
 * shipped rampart set (same flood the enclosure claims use).
 */
export function checkR27(plan, ctx = {}) {
  const fails = [];
  const meta = plan.meta || {};
  const sh = meta.shell || {};
  const tw = meta.towers || {};
  const w = meta.walls || {};
  const misc = meta.misc || {};

  // ---- MF5 inventory: every *Basis / *Why string is registered ------------
  const seenKeys = new Set();
  walkMeta(meta, ["meta"], (invKey, path, value) => {
    seenKeys.add(invKey);
    if (!BASIS_WHY[invKey]) {
      fails.push(
        `meta/${path} — a \`*Basis\`/\`*Why\` string that is not in the round-27 inventory (key ${JSON.stringify(invKey)}). ` +
          `Unregistered prose is how eleven fields shipped unread next to two fields this suite had just closed`,
      );
    }
  });

  // ---- MF5 renderers ------------------------------------------------------
  if (typeof sh.enclosureBasis === "string" && ctx.terrain && ctx.extShip) {
    const want = renderEnclosureBasis(enclosureCensus(plan, ctx.extShip, ctx.terrain));
    if (sh.enclosureBasis !== want) {
      if (!sh.enclosureBasis.endsWith(ENCLOSURE_BASIS)) {
        say(fails, "shell.enclosureBasis", sh.enclosureBasis, want);
      } else {
        say(fails, "shell.enclosureBasis", sh.enclosureBasis, want);
      }
    }
  }

  if (typeof sh.remeasured === "string") {
    const drift = sh.cutDrift || [];
    const want = renderRemeasureReason({
      pruned: drift.filter((e) => e && e.op === "remove").length,
      adopted: drift.filter((e) => e && e.op === "add").length,
      ramparts: (plan.structures?.rampart || []).length,
      cut: (sh.cut || []).length,
      cutAtFreeze: (sh.cutAtFreeze || []).length,
    });
    if (sh.remeasured !== want) say(fails, "shell.remeasured", sh.remeasured, want);
  } else if (sh.remeasured != null) {
    fails.push(`meta.shell.remeasured is ${JSON.stringify(sh.remeasured).slice(0, 40)} — it is the rendered remeasure sentence`);
  }

  if (typeof tw.refillBasis === "string" && Array.isArray(tw.refillDists)) {
    const towers = plan.structures?.tower || [];
    const atP = tw.refillDistsAtPlacement || [];
    const now = tw.refillDists;
    const blocked = new Set();
    for (const src of plan.sources || []) blocked.add(K(src));
    if (plan.controller) blocked.add(K(plan.controller));
    if (plan.mineral) blocked.add(K(plan.mineral));
    for (const t of BUILT_OBSTACLES) {
      for (const q of plan.structures?.[t] || []) blocked.add(K(q));
    }
    const want = renderRefillBasis({
      towers: towers.map((t, i) => ({ at: { x: t.x, y: t.y }, was: atP[i] ?? 9999, now: now[i] })),
      maxWas: atP.length ? Math.max(...atP) : 9999,
      maxNow: tw.maxRefill,
      unreachable: tw.refillUnreachable,
      blocked: blocked.size,
    });
    if (!tw.refillBasis.endsWith(REFILL_BASIS) || tw.refillBasis !== want) {
      say(fails, "towers.refillBasis", tw.refillBasis, want);
    }
  }

  if (typeof w.prunedBasis === "string") {
    const want = renderPrunedBasis({
      atPass: (w.prunedAtPassTiles || []).length,
      pruned: w.prunedTiles || [],
      relaid: w.prunedRelaid || [],
      ghosts: w.prunedGhosts,
      transient: w.prunedTransient,
    });
    if (w.prunedBasis !== want) say(fails, "walls.prunedBasis", w.prunedBasis, want);
  }

  const sf = meta.sealedFloor;
  if (sf && typeof sf.counterfactualBasis === "string") {
    const want = renderCounterfactualBasis({
      pockets: sf.pockets || [],
      singleStructureTiles: sf.singleStructureTiles,
      singleStructureDeep: sf.singleStructureDeep,
      ourFault: sf.ourFault,
      sealed: sf.tiles,
    });
    if (sf.counterfactualBasis !== want) say(fails, "sealedFloor.counterfactualBasis", sf.counterfactualBasis, want);
    if (w.sealedFloor && w.sealedFloor.counterfactualBasis !== sf.counterfactualBasis) {
      fails.push(
        `meta.walls.sealedFloor.counterfactualBasis is not the same sentence as meta.sealedFloor.counterfactualBasis. ` +
          `They are one record written twice`,
      );
    }
    if (!String(sf.counterfactualBasis).endsWith(SEALED_COUNTERFACTUAL_BASIS)) {
      fails.push(`meta.sealedFloor.counterfactualBasis does not end with the exported constant rule`);
    }
  }
  for (const nr of meta.noteRecords || []) {
    if (nr?.rec?.counterfactualBasis && sf && nr.rec.counterfactualBasis !== sf.counterfactualBasis) {
      fails.push(
        `a sealedFloor note record's counterfactualBasis is not the room's meta.sealedFloor.counterfactualBasis`,
      );
    }
  }

  if (typeof misc.mineralOffNetworkWhy === "string") {
    const seat = mineralSeatOf(plan);
    if (seat) {
      const net = netTilesOf(plan);
      net.delete(K(seat));
      const want = renderMineralOffNetworkWhy({
        ...mineralSeatCensus(plan.structures, seat, net),
        when: "the FINISHED road set, not layer 5's",
      });
      if (misc.mineralOffNetworkWhy !== want) {
        say(fails, "misc.mineralOffNetworkWhy", misc.mineralOffNetworkWhy, want);
      }
    }
  }

  if (typeof sh.deepTilesBasis === "string") {
    const want = renderDeepTilesBasis({
      negotiation: sh.negotiationFreeDeep ?? sh.deepTiles,
      shippedFree: sh.shippedFreeDeep,
      shippedInterior: sh.shippedDeepInterior,
      cut: (sh.cut || []).length,
      roads: (plan.structures?.road || []).length,
      occupied: occupiedCount(plan),
    });
    if (sh.deepTilesBasis !== want) say(fails, "shell.deepTilesBasis", sh.deepTilesBasis, want);
  }

  if (typeof meta.noteObligationBasis === "string") {
    const want = renderNoteObligationBasis({ considered: consideredOf(plan) });
    if (meta.noteObligationBasis !== want) say(fails, "noteObligationBasis", meta.noteObligationBasis, want);
    if (!meta.noteObligationBasis.endsWith(NOTE_OBLIGATION_BASIS) && meta.noteObligationBasis !== want) {
      /* say already pushed */
    }
  }

  const off = tw.towerSwapOffer;
  if (off && typeof off.basis === "string") {
    const faceOf = (mn) => ({ min: mn, sat: mn < MIN_SAT ? mn : MIN_SAT });
    const pack = (face) =>
      renderSwapOfferBasis({
        seats: off.seats,
        searchedSeats: off.searchedSeats,
        towers: (plan.structures?.tower || []).length,
        scanned: off.scanned,
        faceAndSatHeld: off.faceAndSatHeld,
        priceProven: off.priceProven,
        face,
        before: off.before,
        best: off.best,
      });
    const mn = typeof tw.minShellDmg === "number" ? tw.minShellDmg : 0;
    // E4S3's offer face is one 30-point damage step off minShellDmg (the
    // grain tower damage lands in). Forged 999 is not a step.
    const candidates = [mn, mn + 30, mn - 30].filter((v) => typeof v === "number" && v >= 0);
    let want = pack(faceOf(mn));
    if (off.basis !== want) {
      for (const m of candidates) {
        const w = pack(faceOf(m));
        if (off.basis === w) {
          want = w;
          break;
        }
      }
    }
    if (!off.basis.endsWith(SWAP_OFFER_BASIS) || off.basis !== want) {
      say(fails, "towers.towerSwapOffer.basis", off.basis, want);
    }
  }

  // ---- MF6: every identifier name is in the snapshot ----------------------
  const names = new Set();
  walkMeta(meta, ["meta"], null, (n) => names.add(n));
  for (const n of names) {
    if (!IDENT.test(n)) continue;
    if (!META_LEAF_NAMES.has(n)) {
      fails.push(
        `meta carries identifier leaf ${JSON.stringify(n)}, which is not in the round-27 closed inventory ` +
          `(${META_LEAF_NAMES.size} names). A leaf in no class is the 123-name dark region the review walked through`,
      );
    }
  }

  // ---- MF6 cheap derivations ----------------------------------------------
  if (typeof sh.battlementFloor === "number") {
    const want = Math.ceil((sh.cut || []).length / 3);
    if (sh.battlementFloor !== want) {
      fails.push(
        `meta.shell.battlementFloor is ${sh.battlementFloor} and ceil(cut/3) is ${want}. It is the ` +
          `one-rampart-per-three-cut-tiles floor, a function of the shipped cut`,
      );
    }
  }

  if (Array.isArray(sh.cutAdopted)) {
    // The field is the LAST reconciliation's adoptions (layer 7b). That pass
    // adopts nothing in this fleet; the 34 real adoptions live in cutDrift
    // under layer7-reconcileSeal. ⊆ of an empty list is a comment — planting
    // a real add escaped. === the layer-7b add set (empty) is the meaning.
    const want = (sh.cutDrift || [])
      .filter((e) => e && e.op === "add" && e.pass === "layer7b-reconcileSeal")
      .map((e) => K(e))
      .sort();
    const got = sh.cutAdopted.filter((t) => t && Number.isInteger(t.x)).map((t) => K(t)).sort();
    if (got.join("|") !== want.join("|")) {
      fails.push(
        `meta.shell.cutAdopted is [${got.join(" ")}] and layer7b-reconcileSeal adds are [${want.join(" ")}]. ` +
          `The list is that pass's adoptions, not a subset of every add — planting a real layer-7 add ` +
          `into the empty list used to pass`,
      );
    }
  }

  // ROUND 28 — shippedShellDmg is a function of the shipped towers and the
  // shipped cut, not of its own twins. Co-forging min/avg/worst together
  // passed 172/172 under the twin check.
  {
    const wantDmg = shellDamage(plan.structures?.tower || [], sh.cut || []);
    const dmg = sh.shippedShellDmg;
    if (dmg && typeof dmg === "object") {
      const off = [];
      if (dmg.min !== wantDmg.min) off.push(`min ${dmg.min} vs ${wantDmg.min}`);
      if (dmg.avg !== wantDmg.avg) off.push(`avg ${dmg.avg} vs ${wantDmg.avg}`);
      if (dmg.weak !== wantDmg.weak) off.push(`weak ${dmg.weak} vs ${wantDmg.weak}`);
      if (dmg.tiles !== wantDmg.tiles) off.push(`tiles ${dmg.tiles} vs ${wantDmg.tiles}`);
      if (!dmg.worst || !wantDmg.worst || dmg.worst.x !== wantDmg.worst.x || dmg.worst.y !== wantDmg.worst.y) {
        off.push(`worst ${JSON.stringify(dmg.worst)} vs ${JSON.stringify(wantDmg.worst)}`);
      }
      if (off.length) {
        fails.push(
          `meta.shell.shippedShellDmg does not re-derive from this room's towers and cut: ${off.slice(0, 4).join(" · ")}. ` +
            `It is layer 7's own re-measure of the wall the room ships, and the twins beside it are copies of it — ` +
            `holding the copies to each other left the number free`,
        );
      }
    }
    if (tw.shippedWeakest && wantDmg.worst && (tw.shippedWeakest.x !== wantDmg.worst.x || tw.shippedWeakest.y !== wantDmg.worst.y)) {
      fails.push(
        `meta.towers.shippedWeakest is ${tw.shippedWeakest.x},${tw.shippedWeakest.y} and the shipped wall's weakest tile is ${wantDmg.worst.x},${wantDmg.worst.y}`,
      );
    }
    if (typeof tw.shippedAvgShellDmg === "number" && tw.shippedAvgShellDmg !== wantDmg.avg) {
      fails.push(`meta.towers.shippedAvgShellDmg is ${tw.shippedAvgShellDmg} and the shipped wall's mean is ${wantDmg.avg}`);
    }
    if (typeof tw.shippedWeakTiles === "number" && tw.shippedWeakTiles !== wantDmg.weak) {
      fails.push(`meta.towers.shippedWeakTiles is ${tw.shippedWeakTiles} and the shipped wall has ${wantDmg.weak} tile(s) under the floor`);
    }
  }

  // battlementUnreachable tiles are the shipped cut tiles the interior walk
  // never reaches. Comparing the count to the roster length only is a twin:
  // zeroing both escaped.
  if (ctx.terrain && ctx.extShip && plan.sitter && Array.isArray(sh.cut)) {
    const rset = new Set((plan.structures?.rampart || []).map(K));
    const blocked = new Set();
    for (const src of plan.sources || []) blocked.add(K(src));
    if (plan.controller) blocked.add(K(plan.controller));
    if (plan.mineral) blocked.add(K(plan.mineral));
    for (const t of BUILT_OBSTACLES) {
      for (const q of plan.structures?.[t] || []) blocked.add(K(q));
    }
    const walk = interiorWalk(ctx.terrain, rset, ctx.extShip, blocked, plan.sitter);
    const wantTiles = sh.cut.filter((c) => c && Number.isInteger(c.x) && !walk.has(K(c))).map(K).sort();
    const gotTiles = (sh.battlementUnreachableTiles || []).map((t) => (t && Number.isInteger(t.x) ? K(t) : String(t))).sort();
    if (wantTiles.join(" ") !== gotTiles.join(" ") || sh.battlementUnreachable !== wantTiles.length) {
      fails.push(
        `meta.shell.battlementUnreachable is ${sh.battlementUnreachable} / [${gotTiles.join(" ")}] and the ` +
          `interior walk from the sitter misses ${wantTiles.length} cut tile(s) [${wantTiles.join(" ")}]. ` +
          `The count and the roster are one walk, not two leaves that agree`,
      );
    }
    const b = pickBattlements(ctx.terrain, sh.cut, ctx.extShip, walk);
    if (typeof sh.battlementGap === "number" && sh.battlementGap !== b.battlementGap) {
      fails.push(
        `meta.shell.battlementGap is ${sh.battlementGap} and pickBattlements on the shipped cut leaves ` +
          `${b.battlementGap} uncovered. It is that uncovered count, not a comment — flattening it used to pass`,
      );
    }
    if (Array.isArray(sh.battlementGapTiles)) {
      const wantGap = (b.battlementGapTiles || []).map(K).sort();
      const gotGap = sh.battlementGapTiles.map((t) => (t && Number.isInteger(t.x) ? K(t) : String(t))).sort();
      if (gotGap.join(" ") !== wantGap.join(" ")) {
        fails.push(
          `meta.shell.battlementGapTiles is [${gotGap.join(" ")}] and pickBattlements uncovers ` +
            `[${wantGap.join(" ")}]. The roster is that walk, not a free list — planting a tile used to pass`,
        );
      }
    }
  }

  const builtLap = meta.walls?.mobility?.builtGated ?? sh.mobilityBuilt?.maxGated;
  if (sh.mobilityShipped && typeof sh.mobilityShipped.maxGated === "number" && typeof builtLap === "number") {
    if (Math.abs(sh.mobilityShipped.maxGated - builtLap) > 1e-9) {
      fails.push(
        `meta.shell.mobilityShipped.maxGated is ${sh.mobilityShipped.maxGated} and the as-built gated lap ` +
          `(walls.mobility.builtGated) is ${builtLap}. They are the same walk on the same shipped wall — ` +
          `zeroing the shipped copy alone used to pass`,
      );
    }
  }

  {
    const mob = w.mobility || {};
    if ("boundHeld" in mob || typeof mob.boundLap === "number") {
      const lane = meta.extensions?.laneMeta || mob.lanes;
      const b = lane && typeof lane === "object" ? lane.bounded : null;
      if (b == null) {
        if (mob.boundHeld != null) {
          fails.push(
            `meta.walls.mobility.boundHeld is ${mob.boundHeld} and lane.bounded is missing. boundHeld is ` +
              `null when the reservation published no bound — forging a hold used to pass`,
          );
        }
      } else if (typeof builtLap === "number" && builtLap <= b + 1e-9) {
        if (mob.boundHeld !== true) {
          fails.push(
            `meta.walls.mobility.boundHeld is ${JSON.stringify(mob.boundHeld)} and the as-built gated lap ` +
              `${builtLap} is inside lane.bounded ${b}. The bound held — flipping the flag used to pass`,
          );
        }
        if (typeof mob.boundLap !== "number" || Math.abs(mob.boundLap - builtLap) > 1e-9) {
          fails.push(
            `meta.walls.mobility.boundLap is ${mob.boundLap} and the as-built gated lap is ${builtLap}. ` +
              `They are the same walk when the bound held — flattening it used to pass`,
          );
        }
      }
    }
  }

  // ROUND 28 — MF6 presence names the review flipped fleet-wide to flattering
  // values at pass 172/172. Each one below is a function of terrain + the
  // shipped structure lists, or of a leaf this file already re-derives.
  if (ctx.terrain && plan.sitter) {
    const hub5 = hubFieldAtLayer5(ctx.terrain, plan);
    const nuker = (plan.structures?.nuker || [])[0];
    if (nuker && typeof misc.nukerHubDist === "number") {
      const want = hub5[idx(nuker.x, nuker.y)];
      if (misc.nukerHubDist !== want) {
        fails.push(
          `meta.misc.nukerHubDist is ${misc.nukerHubDist} and the layer-5 hub walk to the shipped nuker ` +
            `at ${nuker.x},${nuker.y} is ${want}. It is a walk, not a chebyshev, and it is not a comment`,
        );
      }
    }
    const observer = (plan.structures?.observer || [])[0];
    if (observer && typeof misc.observerHubDist === "number") {
      const want = hub5[idx(observer.x, observer.y)];
      if (misc.observerHubDist !== want) {
        fails.push(
          `meta.misc.observerHubDist is ${misc.observerHubDist} and the layer-5 hub walk to the shipped ` +
            `observer at ${observer.x},${observer.y} is ${want}`,
        );
      }
    }

    if (Array.isArray(tw.refillDistsUnblocked)) {
      const towers = plan.structures?.tower || [];
      const refill3 = refillFieldAtLayer3(ctx.terrain, plan);
      if (tw.refillDistsUnblocked.length !== towers.length) {
        fails.push(
          `meta.towers.refillDistsUnblocked has ${tw.refillDistsUnblocked.length} entries and this room ` +
            `ships ${towers.length} tower(s). They are one vector`,
        );
      } else {
        const off = [];
        for (let i = 0; i < towers.length; i++) {
          const want = refill3[idx(towers[i].x, towers[i].y)];
          if (tw.refillDistsUnblocked[i] !== want) {
            off.push(`${towers[i].x},${towers[i].y}: ${tw.refillDistsUnblocked[i]} vs ${want}`);
          }
        }
        if (off.length) {
          fails.push(
            `meta.towers.refillDistsUnblocked is not the pre-mass hub-kit walk to the shipped towers: ` +
              `${off.slice(0, 4).join(" · ")}. Flattening every entry to 1 used to pass`,
          );
        }
      }
    }
  }

  if (typeof sh.protectRadius === "number" && !RADII_WIDE.includes(sh.protectRadius)) {
    fails.push(
      `meta.shell.protectRadius is ${sh.protectRadius} and the negotiation radii are ${RADII_WIDE.join(",")}. ` +
        `Zero is not a radius this room was allowed to try`,
    );
  }

  if (typeof sh.baseCut === "number") {
    if (!Number.isInteger(sh.baseCut) || sh.baseCut < 1) {
      fails.push(
        `meta.shell.baseCut is ${sh.baseCut}. It is layer 2's pick size and a room with no cut is not a room`,
      );
    }
    const wantPrice = sh.baseCut > MAX_CUT;
    if (!!sh.priceyWall !== wantPrice) {
      fails.push(
        `meta.shell.priceyWall is ${JSON.stringify(sh.priceyWall)} and baseCut ${sh.baseCut} ` +
          `${wantPrice ? "exceeds" : "does not exceed"} MAX_CUT ${MAX_CUT}. priceyWall is that comparison, ` +
          `not a free flag`,
      );
    }
  }

  const seat = mineralSeatOf(plan);
  if (typeof misc.mineralBubble === "number" && seat) {
    const hasRamp = (plan.structures?.rampart || []).some((r) => r.x === seat.x && r.y === seat.y);
    const want = hasRamp ? 1 : 0;
    if (misc.mineralBubble !== want) {
      fails.push(
        `meta.misc.mineralBubble is ${misc.mineralBubble} and the mineral seat at ${seat.x},${seat.y} ` +
          `${hasRamp ? "carries" : "does not carry"} a rampart. The count is 1 iff the seat is ramparted`,
      );
    }
  }
  if (typeof misc.mineralContainer === "number") {
    const want = plan.mineral ? (plan.structures?.container || []).filter((c) => chebyshev(c, plan.mineral) <= 1).length : 0;
    if (misc.mineralContainer !== want) {
      fails.push(
        `meta.misc.mineralContainer is ${misc.mineralContainer} and this room has ${want} container(s) ` +
          `chebyshev-1 of the mineral. It is that seat count, not a comment — zeroing it used to pass`,
      );
    }
  }

  const laid = w.laidByKind || {};
  const restored = w.restoredByKind || {};
  if (typeof w.swampPaved === "number") {
    const want = (laid.swampPave || 0) + (Array.isArray(restored.swampPave) ? restored.swampPave.length : 0);
    if (w.swampPaved !== want) {
      fails.push(
        `meta.walls.swampPaved is ${w.swampPaved} and laid.swampPave + restored.swampPave is ${want}. ` +
          `It counts holes closed, which is laid tiles plus the ones the prune had taken and this pass put back`,
      );
    }
  }
  if (typeof w.spurred === "number") {
    const laidSpur = laid.spur || 0;
    if ((w.spurred === 0) !== (laidSpur === 0)) {
      fails.push(
        `meta.walls.spurred is ${w.spurred} and laidByKind.spur is ${laidSpur}. A cluster was served ` +
          `iff the spur pass laid a tile — zeroing the event while the laid book still names tiles used to pass`,
      );
    }
  }
  if (typeof w.stitched === "number") {
    const laidStitch = laid.stitch || 0;
    // producer increments once per joined fragment, not per tile, so this
    // artifact ships the 0/1 flag. Do not rewrite boards to make it the count.
    const want = laidStitch > 0 ? 1 : 0;
    if (w.stitched !== want) {
      fails.push(
        `meta.walls.stitched is ${w.stitched} and laidByKind.stitch is ${laidStitch}. It is 1 iff the ` +
          `stitch pass laid a tile, 0 otherwise — this artifact ships that flag, not the laid count. ` +
          `Setting it to any other integer used to pass`,
      );
    }
  }
  if (typeof w.stitchTiles === "number") {
    const want = laid.stitch || 0;
    if (w.stitchTiles !== want) {
      fails.push(
        `meta.walls.stitchTiles is ${w.stitchTiles} and laidByKind.stitch is ${want}. It is that laid ` +
          `count, not a comment — zeroing it while the book still names the tiles used to pass`,
      );
    }
  }

  // r29 / META_DARK — cheap presence the review flipped fleet-wide.
  if (typeof misc.extractorOffNetwork === "boolean" && typeof misc.mineralOffNetwork === "boolean") {
    if (misc.extractorOffNetwork !== misc.mineralOffNetwork) {
      fails.push(
        `meta.misc.extractorOffNetwork is ${misc.extractorOffNetwork} and mineralOffNetwork is ` +
          `${misc.mineralOffNetwork}. They are one measurement — the extractor is off iff the seat is`,
      );
    }
  }
  {
    const ext = (plan.structures?.extractor || [])[0];
    const seat = mineralSeatOf(plan);
    if (ext && seat && Array.isArray(misc.extractorSeatNetTiles)) {
      const net = new Set();
      for (const r of plan.structures?.road || []) net.add(K(r));
      for (const c of plan.structures?.container || []) net.add(K(c));
      const want = [];
      for (const [dx, dy] of D8) {
        const k = `${ext.x + dx},${ext.y + dy}`;
        if (net.has(k) && k !== K(seat)) want.push(k);
      }
      want.sort();
      const got = misc.extractorSeatNetTiles.map(String).sort();
      if (got.join("|") !== want.join("|")) {
        fails.push(
          `meta.misc.extractorSeatNetTiles is [${got.join(" ")}] and the finished network's D8 of the ` +
            `extractor excluding the seat is [${want.join(" ")}]. Clearing it used to pass`,
        );
      }
    }
  }
  {
    const seat = mineralSeatOf(plan);
    if (seat && Array.isArray(misc.mineralSeatNetTiles)) {
      const kind = w.roadKind || {};
      const net = new Set();
      for (const r of plan.structures?.road || []) {
        if (kind[K(r)] === "conductBridge") continue;
        net.add(K(r));
      }
      for (const c of plan.structures?.container || []) net.add(K(c));
      net.delete(K(seat));
      const want = [];
      for (const [dx, dy] of D8) {
        const k = `${seat.x + dx},${seat.y + dy}`;
        if (net.has(k)) want.push(k);
      }
      want.sort();
      const got = misc.mineralSeatNetTiles.map(String).sort();
      if (got.join("|") !== want.join("|")) {
        fails.push(
          `meta.misc.mineralSeatNetTiles is [${got.join(" ")}] and the shipped network's D8 of the ` +
            `mineral seat excluding conduct-bridge roads is [${want.join(" ")}]. The deferred bridge ` +
            `is laid after this field is measured. Clearing it used to pass`,
        );
      }
    }
  }
  {
    const nw = tw.nukeWindow;
    if (nw && typeof nw.nukerInWindow === "boolean") {
      const nuker = (plan.structures?.nuker || [])[0];
      const at = nw.center;
      const want = !!(nuker && at && Math.abs(nuker.x - at.x) <= 2 && Math.abs(nuker.y - at.y) <= 2);
      if (nw.nukerInWindow !== want) {
        fails.push(
          `meta.towers.nukeWindow.nukerInWindow is ${nw.nukerInWindow} and the shipped nuker ` +
            `${nuker ? `at ${nuker.x},${nuker.y}` : "is missing and"} ` +
            `${want ? "is" : "is not"} inside the published nuke window bbox` +
            `${at ? ` at ${at.x},${at.y}` : ""}. They are one bbox — flipping the flag used to pass`,
        );
      }
    }
    if (nw && nw.center && Number.isInteger(nw.center.x) && Number.isInteger(nw.center.y)) {
      const want = nukeWindowCenterOf(plan);
      if (!want || nw.center.x !== want.x || nw.center.y !== want.y) {
        fails.push(
          `meta.towers.nukeWindow.center is ${nw.center.x},${nw.center.y} and the fullest 5x5 over ` +
            `spawn/storage/terminal/nuker/tower is ${want ? `${want.x},${want.y}` : "uncomputable"}. ` +
            `It is already published on nukeWindow.center — moving it used to pass`,
        );
      }
    }
    if (nw && typeof nw.towerOnly === "number") {
      const want = towerOnlyWindowOf(plan);
      const after = tw.towerDispersion && typeof tw.towerDispersion.after === "number" ? tw.towerDispersion.after : null;
      if (want !== null && nw.towerOnly !== want) {
        fails.push(
          `meta.towers.nukeWindow.towerOnly is ${nw.towerOnly} and the fullest 5x5 over ` +
            `spawn/storage/terminal/tower is ${want}. It is layer 3's own window on the shipped kit, ` +
            `not a comment — flattening it used to pass`,
        );
      } else if (after !== null && nw.towerOnly !== after) {
        fails.push(
          `meta.towers.nukeWindow.towerOnly is ${nw.towerOnly} and towerDispersion.after is ${after}. ` +
            `They are one reading — the nuke-window field is layer 3's sibling, not a free integer`,
        );
      }
    }
  }
  {
    const pair = tw.rcl5Pair;
    const towers = plan.structures?.tower || [];
    const freeze = Array.isArray(sh.cutAtFreeze) && sh.cutAtFreeze.length ? sh.cutAtFreeze : sh.cut;
    if (pair && towers.length >= 2) {
      if (pair.picked && (!towers[1] || pair.picked.x !== towers[1].x || pair.picked.y !== towers[1].y)) {
        fails.push(
          `meta.towers.rcl5Pair.picked is ${pair.picked.x},${pair.picked.y} and towers[1] is ` +
            `${towers[1] ? `${towers[1].x},${towers[1].y}` : "missing"}. The RCL5 pick is the second ` +
            `shipped tower — moving it used to pass`,
        );
      }
      const partnerWant = pair.swapped ? towers[2] : towers[1];
      if (pair.arrayPartner && partnerWant && (pair.arrayPartner.x !== partnerWant.x || pair.arrayPartner.y !== partnerWant.y)) {
        fails.push(
          `meta.towers.rcl5Pair.arrayPartner is ${pair.arrayPartner.x},${pair.arrayPartner.y} and ` +
            `towers[swapped ? 2 : 1] is ${partnerWant.x},${partnerWant.y}. The partner is that shipped ` +
            `tower — moving it used to pass`,
        );
      }
      if (typeof pair.swapped === "boolean" && pair.arrayPartner && pair.picked) {
        const wantSwap = pair.arrayPartner.x !== pair.picked.x || pair.arrayPartner.y !== pair.picked.y;
        if (pair.swapped !== wantSwap) {
          fails.push(
            `meta.towers.rcl5Pair.swapped is ${pair.swapped} and arrayPartner ` +
              `${wantSwap ? "is not" : "is"} picked. swapped is that comparison — flipping it used to pass`,
          );
        }
      }
      if (typeof pair.minDmgPicked === "number" && freeze && freeze.length) {
        const want = towerPairMinDmg(towers[0], towers[1], freeze);
        if (pair.minDmgPicked !== want) {
          fails.push(
            `meta.towers.rcl5Pair.minDmgPicked is ${pair.minDmgPicked} and towers[0]+towers[1] cover the ` +
              `freeze cut's weakest tile at ${want}. It is that pair's min on the freeze wall, not a ` +
              `comment — flattening it used to pass`,
          );
        }
      }
      if (typeof pair.minDmgArray === "number" && pair.arrayPartner && freeze && freeze.length) {
        const want = towerPairMinDmg(towers[0], pair.arrayPartner, freeze);
        if (pair.minDmgArray !== want) {
          fails.push(
            `meta.towers.rcl5Pair.minDmgArray is ${pair.minDmgArray} and towers[0]+arrayPartner cover the ` +
              `freeze cut's weakest tile at ${want}. It is that pair's min on the freeze wall, not a ` +
              `comment — flattening it used to pass`,
          );
        }
      }
    }
  }
  {
    const declared = (meta.shortfalls || []).some((d) => d && d.gate === "mobility" && d.kind === "covered-detour");
    if (!!w.mobility?.coveredDetourDeclared !== declared) {
      fails.push(
        `meta.walls.mobility.coveredDetourDeclared is ${w.mobility?.coveredDetourDeclared} and this room ` +
          `${declared ? "ships" : "does not ship"} a mobility/covered-detour shortfall. The flag is ` +
          `whether that declaration fired — flipping it used to pass`,
      );
    }
  }
  if (ctx.terrain && ctx.extShip && plan.sitter && Array.isArray(sh.cut) && sh.mobilityShippedFree && typeof sh.mobilityShippedFree.maxGated === "number") {
    const rset = new Set((plan.structures?.rampart || []).map(K));
    const occ = new Set();
    for (const t of ["storage", "terminal", "spawn", "link"]) {
      for (const q of plan.structures?.[t] || []) occ.add(K(q));
    }
    if (plan.sitter) occ.add(K(plan.sitter));
    for (const src of plan.sources || []) occ.add(K(src));
    if (plan.controller) occ.add(K(plan.controller));
    if (plan.mineral) occ.add(K(plan.mineral));
    const walk = interiorWalk(ctx.terrain, rset, ctx.extShip, occ, plan.sitter);
    const want = mobilityStats(sh.cut, ctx.extShip, maskFromKeys(walk)).maxGated;
    if (typeof want === "number" && Math.abs(sh.mobilityShippedFree.maxGated - want) > 1e-6) {
      fails.push(
        `meta.shell.mobilityShippedFree.maxGated is ${sh.mobilityShippedFree.maxGated} and the mass-free ` +
          `walk on the shipped wall is ${want}. It is layer 2's own measurement of this wall, not a comment`,
      );
    }
  }

  // ROUND 28 / criticism 98 — inventing a shrink on a plain room. The
  // shipped board of a real shrink is 60/0 with tiles, same as a kept-free
  // reservation. fullRun is the cap-10 walk that decided whether shrink
  // was considered. ran is a function of that walk, not of `shrunk`.
  //
  // ROUND 29 / the residue: forging the whole fullRun then inventing a
  // consistent shrink. Counts that agree with each other are a log. The
  // reserved tiles are the board. A shrink is a proper prefix of that
  // board; a kept walk's fullRun.ext/shallow on a 60/0 room is the
  // shipped board, not a pair of free integers.
  //
  // ROUND 29 sixth / the COORD bag: 99,99 and 1,1 pass /^\d{1,2},\d{1,2}$/
  // and still invent a priced shrink. Reserved tiles are this room's
  // walkable interior floor — a walk (cheb≤2 of the reserved set or the
  // cut; road gaps the greedy skipped), not a COORD bag.
  //
  // ROUND 29 tenth / the unread suffix: a D8 neighbour of the kept prefix
  // (E11S1 19,27) is this room's floor and still invents a longer walk.
  // Shrink fullRun.reserved / byRound are the kept prefix (=== lane.reserved).
  // The refused tail is wanted − tiles, a count, not a COORD list.
  {
    const lane = meta.extensions?.laneMeta || w.mobility?.lanes;
    if (lane && typeof lane === "object") {
      const fr = lane.fullRun;
      const shrunk = lane.shrunk && typeof lane.shrunk === "object" && !Array.isArray(lane.shrunk);
      const dropped = lane.dropped === true;
      if (!fr || typeof fr !== "object") {
        fails.push(
          `meta.extensions.laneMeta.fullRun is missing. It is the cap-10 walk every room composes ` +
            `before shrink, and without it a plain room can publish a priced shrink that never ran`,
        );
      } else {
        const ran = !!(fr.tiles && (fr.ext < 60 || fr.shallow > 0));
        if (!!fr.ran !== ran) {
          fails.push(
            `meta.extensions.laneMeta.fullRun.ran is ${fr.ran} and the cap-10 walk is tiles=${fr.tiles} ` +
              `ext=${fr.ext} shallow=${fr.shallow}. ran is that predicate, not a flag`,
          );
        }
        if (!ran) {
          if (shrunk || dropped) {
            fails.push(
              `this room publishes a ${shrunk ? "SHRINK" : "DROP"} and its cap-10 walk was free ` +
                `(ext=${fr.ext}, shallow=${fr.shallow}, tiles=${fr.tiles}). That is the invent direction ` +
                `of criticism 98 — a priced refusal of a search that never ran`,
            );
          }
          if (fr.to !== fr.used) {
            fails.push(
              `fullRun.to is ${fr.to} and fullRun.used is ${fr.used}. A room that never entered shrink ` +
                `kept the cap-10 walk; to and used are one number`,
            );
          }
          if ((lane.tiles || 0) !== (fr.tiles || 0) || (lane.rounds || 0) !== (fr.rounds || 0)) {
            fails.push(
              `fullRun tiles/rounds ${fr.tiles}/${fr.rounds} and the shipped reservation is ` +
                `${lane.tiles}/${lane.rounds}. They are the same walk when shrink never ran`,
            );
          }
        } else if (dropped) {
          if (fr.to !== 0) {
            fails.push(`fullRun.to is ${fr.to} and this room DROPPED the reservation. to is 0`);
          }
          if (shrunk) {
            fails.push(`the lane census records a DROP and a SHRINK. They are two outcomes of one search`);
          }
        } else if (shrunk) {
          if (fr.to !== lane.shrunk.to) {
            fails.push(
              `fullRun.to is ${fr.to} and shrunk.to is ${lane.shrunk.to}. The prefix the search kept ` +
                `is one number`,
            );
          }
          if (!(lane.shrunk.wanted > (fr.tiles || 0))) {
            fails.push(
              `shrunk.wanted is ${lane.shrunk.wanted} and fullRun.tiles is ${fr.tiles}. ` +
                `wanted > tiles is the refused extra as a count; reserved is the kept prefix, ` +
                `the suffix is not a tile list`,
            );
          }
          if (fr.to === 0 || fr.to === fr.used) {
            fails.push(
              `fullRun.to is ${fr.to} (used=${fr.used}) and the room publishes a shrink. A shrink is a ` +
                `proper prefix, not the drop and not the full walk`,
            );
          }
        } else {
          if (fr.to !== fr.used) {
            fails.push(
              `fullRun.to is ${fr.to} and used is ${fr.used} and the room publishes neither shrink nor ` +
                `drop. The search kept the cap-10 walk`,
            );
          }
        }

        const reserved = Array.isArray(fr.reserved) ? fr.reserved.map(String) : null;
        const byRound = Array.isArray(fr.byRound) ? fr.byRound : null;
        const laneRes = Array.isArray(lane.reserved) ? lane.reserved.map(String) : null;
        if (!reserved) {
          fails.push(
            `fullRun.reserved is missing. It is the cap-10 reserved-tile board; without it a plain ` +
              `room forges tiles/ext/shallow and publishes a priced shrink of a walk that never ran`,
          );
        } else {
          const seen = new Set();
          let bad = 0;
          for (const k of reserved) {
            if (seen.has(k) || !COORD.test(k)) bad++;
            else seen.add(k);
          }
          if (bad) {
            fails.push(
              `fullRun.reserved has ${bad} duplicate or off-board key(s). It is a set of tiles, not a bag`,
            );
          }
          // COORD matches 99,99. Bind reserved tiles to this room's floor.
          if (ctx.terrain) {
            const objectKeys = new Set();
            if (plan.sitter) objectKeys.add(K(plan.sitter));
            for (const src of plan.sources || []) objectKeys.add(K(src));
            if (plan.controller) objectKeys.add(K(plan.controller));
            if (plan.mineral) objectKeys.add(K(plan.mineral));
            const cutPts = [];
            for (const t of sh.cut || []) {
              if (t && Number.isInteger(t.x) && Number.isInteger(t.y)) cutPts.push({ x: t.x, y: t.y });
            }
            const bindReservedFloor = (keys, label) => {
              const pts = [];
              let off = 0;
              for (const k of keys) {
                const t = parseCoord(k);
                if (!t) continue;
                if (!buildable(ctx.terrain, t.x, t.y) || objectKeys.has(`${t.x},${t.y}`)) {
                  off++;
                  continue;
                }
                pts.push(t);
              }
              if (off) {
                fails.push(
                  `${label} has ${off} key(s) that are not this room's walkable interior floor. ` +
                    `It is a walk on this room, not a COORD bag`,
                );
              }
              let isolated = 0;
              for (const t of pts) {
                if (!reservedTouchesWalk(t, pts, cutPts, ctx.terrain)) isolated++;
              }
              if (isolated) {
                fails.push(
                  `${label} has ${isolated} isolated tile(s) off the reserved walk. ` +
                    `Every reserved tile is walkable interior floor on that walk or the cut, not a COORD bag`,
                );
              }
            };
            bindReservedFloor(reserved, "fullRun.reserved");
            if (laneRes) bindReservedFloor(laneRes, "lane.reserved");
          }
          if (reserved.length !== (fr.tiles || 0)) {
            fails.push(
              `fullRun.reserved has ${reserved.length} tile(s) and fullRun.tiles is ${fr.tiles}. ` +
                `tiles is that board's size`,
            );
          }
          if (!byRound) {
            fails.push(
              `fullRun.byRound is missing. It is the cap-10 walk split by greedy round; a shrink is ` +
                `the prefix of this list, not a free integer`,
            );
          } else {
            if (byRound.length !== (fr.rounds || 0)) {
              fails.push(
                `fullRun.byRound has ${byRound.length} round(s) and fullRun.rounds is ${fr.rounds}. ` +
                  `rounds is that list's length`,
              );
            }
            const empty = byRound.findIndex((r) => !Array.isArray(r) || !r.length);
            if (empty >= 0) {
              fails.push(
                `fullRun.byRound[${empty}] is empty. The greedy does not record a round that reserved nothing`,
              );
            }
            const flat = byRound.flat().map(String).sort();
            const want = reserved.slice().sort();
            if (flat.join("|") !== want.join("|")) {
              fails.push(
                `fullRun.byRound flattens to ${flat.length} tile(s) and reserved is ${want.length}. ` +
                  `They are one set, grouped by the round that took each tile`,
              );
            }
          }
          if (!laneRes) {
            fails.push(
              `lane.reserved is missing. It is the shipped reservation; a shrink is a proper prefix ` +
                `of the cap-10 board, and without the shipped tiles that sentence has no board`,
            );
          } else {
            if (laneRes.length !== (lane.tiles || 0)) {
              fails.push(
                `lane.reserved has ${laneRes.length} tile(s) and lane.tiles is ${lane.tiles}. ` +
                  `tiles is that board's size`,
              );
            }
            const sortJ = (a) => a.slice().sort().join("|");
            if (!shrunk && !dropped) {
              if (sortJ(reserved) !== sortJ(laneRes)) {
                fails.push(
                  `fullRun.reserved and lane.reserved disagree and this room kept the cap-10 walk. ` +
                    `They are the same board when shrink never ran`,
                );
              }
              const shippedExt = (plan.structures?.extension || []).length;
              if (fr.ext !== shippedExt) {
                fails.push(
                  `fullRun.ext is ${fr.ext} and this room ships ${shippedExt} extension(s). A kept ` +
                    `cap-10 walk is the shipped mass`,
                );
              }
              const shippedShallow = meta.extensions?.shallow || 0;
              if (shippedExt === 60 && shippedShallow === 0 && ((fr.ext || 0) !== 60 || (fr.shallow || 0) !== 0)) {
                fails.push(
                  `this room ships 60/0 and kept the cap-10 walk, and fullRun is ext=${fr.ext} ` +
                    `shallow=${fr.shallow}. Forging those two integers is how a free walk publishes ` +
                    `a priced refusal that never ran`,
                );
              }
            } else if (shrunk) {
              const to = lane.shrunk && typeof lane.shrunk.to === "number" ? lane.shrunk.to : -1;
              if (sortJ(reserved) !== sortJ(laneRes)) {
                fails.push(
                  `fullRun.reserved and lane.reserved disagree and this room SHRANK. ` +
                    `reserved is the kept prefix; the refused suffix is not a tile list`,
                );
              }
              if (!byRound || byRound.length !== to) {
                fails.push(
                  `fullRun.byRound has ${byRound ? byRound.length : 0} round(s) and shrunk.to is ${to}. ` +
                    `byRound is the kept prefix, not the refused tail as a tile list`,
                );
              }
            } else if (dropped) {
              if (laneRes.length) {
                fails.push(
                  `this room DROPPED the reservation and lane.reserved still names ${laneRes.length} ` +
                    `tile(s). The shipped reservation is empty`,
                );
              }
              if (!reserved.length) {
                fails.push(
                  `this room DROPPED the reservation and fullRun.reserved is empty. The walk it ` +
                    `refused is a board, not a count`,
                );
              }
            }
          }
        }
      }
    }
  }

  if (typeof tw.newRoads === "number") {
    let want = 0;
    for (const v of Object.values(plan.meta?.roadLayer || {})) {
      if (v === 3) want++;
    }
    if (tw.newRoads !== want) {
      fails.push(
        `meta.towers.newRoads is ${tw.newRoads} and this room's roadLayer has ${want} layer-3 tag(s), ` +
          `including tags whose tiles the prune later deleted. It is that event count, not a comment — ` +
          `zeroing it while the tags still name the roads used to pass`,
      );
    }
  }
  {
    const stub = meta.extensions?.stubRoads;
    if (typeof stub === "number") {
      let want = 0;
      for (const v of Object.values(plan.meta?.roadLayer || {})) {
        if (v === 6) want++;
      }
      if (stub !== want) {
        fails.push(
          `meta.extensions.stubRoads is ${stub} and this room's roadLayer has ${want} layer-6 tag(s), ` +
            `including tags whose tiles the prune later deleted. It is that event count, not a comment — ` +
            `zeroing it while the tags still name the roads used to pass`,
        );
      }
    }
  }
  {
    const eaten = meta.labs?.roadsEaten;
    if (typeof eaten === "number") {
      const eat = (meta.shortfalls || []).find((s) => s && s.kind === "lab-road-eat");
      const labSet = new Set((plan.structures?.lab || []).map(K));
      const want = (eat?.tiles || []).filter((t) => t && Number.isInteger(t.x) && labSet.has(K(t))).length;
      if (eaten !== want) {
        fails.push(
          `meta.labs.roadsEaten is ${eaten} and ${want} lab-road-eat tile(s) sit on a shipped lab. ` +
            `The diamond ate those roads — zeroing the count while the tiles still name labs used to pass`,
        );
      }
    }
  }
  if (typeof w.servedFree === "number") {
    const want = servedFreeOf(sh.cut, meta.roadLayer);
    if (w.servedFree !== want) {
      fails.push(
        `meta.walls.servedFree is ${w.servedFree} and ${want} shipped-cut cluster(s) already D8-touch a ` +
          `pre-layer-7 road. It is that already-served count, not a comment — zeroing it used to pass`,
      );
    }
  }
  if (typeof w.fillerTiles === "number") {
    const want = w.laidByKind?.extFace || 0;
    if (w.fillerTiles !== want) {
      fails.push(
        `meta.walls.fillerTiles is ${w.fillerTiles} and laidByKind.extFace is ${want}. It is that laid ` +
          `count, not a comment — setting it while the book still names the tiles used to pass`,
      );
    }
  }
  if (typeof w.servedExts === "number") {
    const fill = typeof w.fillerTiles === "number" ? w.fillerTiles : w.laidByKind?.extFace || 0;
    if ((w.servedExts === 0) !== (fill === 0)) {
      fails.push(
        `meta.walls.servedExts is ${w.servedExts} and the filler laid ${fill} tile(s). The service ` +
          `census is 0 iff the filler laid nothing — setting it used to pass`,
      );
    }
  }
  if (typeof w.unreachableExts === "number") {
    const want = wantUnreachableExts(plan);
    if (w.unreachableExts !== want) {
      fails.push(
        `meta.walls.unreachableExts is ${w.unreachableExts} and ${want} shipped extension(s) have no ` +
          `D4 road. It is that walk, not a comment — setting it used to pass`,
      );
    }
  }
  if (typeof w.unreachedClusters === "number") {
    const want = wantUnreachedClusters(plan);
    if (w.unreachedClusters !== want) {
      fails.push(
        `meta.walls.unreachedClusters is ${w.unreachedClusters} and ${want} shipped-cut cluster(s) of ` +
          `size ≥ ${MIN_CLUSTER} D8-touch no road. It is that walk, not a comment — setting it used to pass`,
      );
    }
  }
  if (typeof meta.labs?.shallowCost === "number" && ctx.extShip) {
    const depth = depthFromExterior(ctx.extShip);
    const n = (plan.structures?.lab || []).filter((l) => l && Number.isInteger(l.x) && depth[idx(l.x, l.y)] < DEPTH_SAFE).length;
    const want = n * SHALLOW_LAB_COST;
    if (meta.labs.shallowCost !== want) {
      fails.push(
        `meta.labs.shallowCost is ${meta.labs.shallowCost} and this room ships ${n} lab(s) at depth < ` +
          `${DEPTH_SAFE}, which costs ${want}. It is that depth count times ${SHALLOW_LAB_COST}, not a ` +
          `comment — zeroing it used to pass`,
      );
    }
  }
  {
    const sr = w.reflow?.shallowRefused;
    if (Array.isArray(sr) && ctx.extShip) {
      const depth = depthFromExterior(ctx.extShip);
      const want = (plan.structures?.extension || [])
        .filter((e) => e && Number.isInteger(e.x) && depth[idx(e.x, e.y)] < DEPTH_SAFE)
        .map(K)
        .sort();
      const got = sr.filter((t) => t && Number.isInteger(t.x)).map(K).sort();
      if (got.join("|") !== want.join("|")) {
        fails.push(
          `meta.walls.reflow.shallowRefused names [${got.join(" ")}] and this room ships shallow ` +
            `extension(s) [${want.join(" ")}]. The roster is those tiles, not a comment — clearing it used to pass`,
        );
      }
    }
  }

  // r29p15 — leftover presence: mass-free floor, worst-pair walks, road BFS,
  // deep-flank formula, stub-cap enum. Zeroing them used to pass.
  if (ctx.terrain && ctx.extShip && plan.sitter && Array.isArray(sh.cut)) {
    const freeMask = maskFromKeys(shippedInterior(plan, ctx.extShip, ctx.terrain, true));
    const freeStats = mobilityStats(sh.cut, ctx.extShip, freeMask);
    const mob = w.mobility || {};
    if (typeof mob.floorGated === "number" && Math.abs(mob.floorGated - freeStats.maxGated) > 1e-6) {
      fails.push(
        `meta.walls.mobility.floorGated is ${mob.floorGated} and the mass-free walk on the shipped wall ` +
          `(extensions lifted, other structures kept) is ${freeStats.maxGated}. It is that floor, not a ` +
          `comment — flattening it used to pass`,
      );
    }
    if (typeof mob.floorOver === "number" && mob.floorOver !== freeStats.over) {
      fails.push(
        `meta.walls.mobility.floorOver is ${mob.floorOver} and the mass-free walk has ${freeStats.over} ` +
          `ungated over-target pair(s). It is that count, not a comment — flattening it used to pass`,
      );
    }
    if (typeof mob.floorOverGated === "number" && mob.floorOverGated !== freeStats.overGated) {
      fails.push(
        `meta.walls.mobility.floorOverGated is ${mob.floorOverGated} and the mass-free walk has ` +
          `${freeStats.overGated} gated over-target pair(s). It is that count, not a comment — flattening ` +
          `it used to pass`,
      );
    }
    const worst = mob.worst;
    if (worst && Number.isInteger(worst.a?.x) && Number.isInteger(worst.b?.x)) {
      const wantFree = arriveAt(bfsField(freeMask, worst.a), worst.b);
      if (typeof worst.freeDin === "number" && Number.isFinite(wantFree) && worst.freeDin !== wantFree) {
        fails.push(
          `meta.walls.mobility.worst.freeDin is ${worst.freeDin} and the mass-free walk of the published ` +
            `worst pair is ${wantFree}. It is that walk, not a comment — flattening it used to pass`,
        );
      }
      const builtMask = maskFromKeys(shippedInterior(plan, ctx.extShip, ctx.terrain, false));
      const wantDin = arriveAt(bfsField(builtMask, worst.a), worst.b);
      const wantAdds = Number.isFinite(wantDin) && Number.isFinite(wantFree) ? wantDin - wantFree : null;
      if (wantAdds != null) {
        if (typeof worst.massAdds === "number" && worst.massAdds !== wantAdds) {
          fails.push(
            `meta.walls.mobility.worst.massAdds is ${worst.massAdds} and the built walk minus the ` +
              `mass-free walk of that pair is ${wantAdds}. It is that difference — flattening it used to pass`,
          );
        }
        if (typeof mob.massAdds === "number" && mob.massAdds !== wantAdds) {
          fails.push(
            `meta.walls.mobility.massAdds is ${mob.massAdds} and the built walk minus the mass-free walk ` +
              `of the published worst pair is ${wantAdds}. It is that difference — flattening it used to pass`,
          );
        }
      }
    }
  }
  if (typeof meta.roadOrder?.maxDist === "number") {
    const want = roadOrderMaxDist(plan);
    if (want != null && meta.roadOrder.maxDist !== want) {
      fails.push(
        `meta.roadOrder.maxDist is ${meta.roadOrder.maxDist} and the sitter-to-road BFS on the ` +
          `conducting network is ${want}. It is that walk, not a comment — flattening it used to pass`,
      );
    }
  }
  {
    const ext = meta.extensions || {};
    if (typeof ext.deepReach === "number" && typeof ext.hubDistCap === "number") {
      const want = Math.min(ext.hubDistCap + FLANK_RELAX, FLANK_HARD_CAP);
      if (ext.deepReach !== want) {
        fails.push(
          `meta.extensions.deepReach is ${ext.deepReach} and min(hubDistCap+${FLANK_RELAX}, ` +
            `${FLANK_HARD_CAP}) is ${want}. The deep flank ceiling is that formula — flattening it used to pass`,
        );
      }
    }
    if (typeof ext.stubCap === "number") {
      if (ctx.terrain && plan.sitter) {
        const want = wantStubCap(ctx.terrain, plan);
        if (want != null && ext.stubCap !== want) {
          fails.push(
            `meta.extensions.stubCap is ${ext.stubCap} and the rich/poor paving ceiling on this room's ` +
              `deep ext-capable pool is ${want}. It is 51 iff that pool / 60 is at least ${STUB_RICH_RATIO}, ` +
              `not a comment — swapping 43 for 51 used to pass`,
          );
        }
      } else if (ext.stubCap !== STUB_CAP_POOR && ext.stubCap !== STUB_CAP_RICH) {
        fails.push(
          `meta.extensions.stubCap is ${ext.stubCap} and the layer-6 paving ceiling is ${STUB_CAP_POOR} ` +
            `or ${STUB_CAP_RICH}. Flattening it used to pass`,
        );
      }
    }
    if (typeof ext.hubDistCap === "number" && !HUB_CAP_LADDER.includes(ext.hubDistCap)) {
      fails.push(
        `meta.extensions.hubDistCap is ${ext.hubDistCap} and the cohesion ladder is ${HUB_CAP_LADDER.join(",")}. ` +
          `Zero is not a rung this room was allowed to try — flattening it used to pass`,
      );
    }
    if (typeof ext.corridorPlaced === "number" && typeof ext.corridorFallback === "number") {
      if ((ext.corridorFallback === 0) !== (ext.corridorPlaced === 60)) {
        fails.push(
          `meta.extensions.corridorPlaced is ${ext.corridorPlaced} and corridorFallback is ` +
            `${ext.corridorFallback}. Fallback is 0 iff every extension sat on a corridor (60) — ` +
            `flattening the count used to pass`,
        );
      }
    }
  }
  for (const reflow of [meta.extensions?.reflow, w.reflow]) {
    if (reflow && typeof reflow.lapCeilingFloor === "number" && reflow.lapCeilingFloor !== MOBILITY_TARGET) {
      fails.push(
        `reflow.lapCeilingFloor is ${reflow.lapCeilingFloor} and MOBILITY_TARGET is ${MOBILITY_TARGET}. ` +
          `The ceiling floor is that target, not a comment — flattening it used to pass`,
      );
    }
  }
  if (ctx.terrain && plan.sources?.length && plan.controller && typeof meta.seedScore === "number") {
    const want = winningSeedScore(ctx.terrain, plan.sources, plan.controller, plan.mineral || null);
    if (want != null && meta.seedScore !== want) {
      fails.push(
        `meta.seedScore is ${meta.seedScore} and the fullest confluence score in the seed window is ` +
          `${want}. It is that walk, not a comment — flattening it used to pass`,
      );
    }
  }
  {
    const seatRes = meta.mineralSeatAtReservation;
    if (plan.mineral && seatRes && Number.isInteger(seatRes.x) && Number.isInteger(seatRes.y)) {
      if (chebyshev(seatRes, plan.mineral) > 1) {
        fails.push(
          `meta.mineralSeatAtReservation is ${seatRes.x},${seatRes.y} and the mineral is at ` +
            `${plan.mineral.x},${plan.mineral.y}. The reserved seat is a chebyshev-1 neighbour of the ` +
            `mineral — moving it used to pass`,
        );
      }
      const appr = meta.mineralApproachAtReservation;
      if (appr && Number.isInteger(appr.x) && Number.isInteger(appr.y) && chebyshev(appr, seatRes) !== 1) {
        fails.push(
          `meta.mineralApproachAtReservation is ${appr.x},${appr.y} and the reserved seat is ` +
            `${seatRes.x},${seatRes.y}. The reserved approach is a D8 neighbour of that seat — ` +
            `moving it used to pass`,
        );
      }
    }
  }

  // r29p17 — leftover presence: freeze mass-free ungated walk, composeOpts
  // radii/parkCap/takeTowerSwap. hubDistCap in-enum (16 vs 19 vs 23) has no
  // cohesion walk on the shipped board (r16 left it open).
  if (ctx.terrain && plan.sitter) {
    const wantFu = wantFloorUngated(ctx.terrain, plan);
    if (wantFu != null) {
      const copies = [
        ["extensions.laneMeta.floorUngated", meta.extensions?.laneMeta?.floorUngated],
        ["walls.mobility.lanes.floorUngated", w.mobility?.lanes?.floorUngated],
      ];
      for (const [path, got] of copies) {
        if (typeof got === "number" && Math.abs(got - wantFu) > 1e-9) {
          fails.push(
            `meta.${path} is ${got} and the mass-free ungated walk on the freeze cut ` +
              `(extensions not yet placed) is ${wantFu}. It is that floor, not a comment — ` +
              `flattening it used to pass`,
          );
        }
      }
    }
  }
  {
    const opts = meta.composeOpts || {};
    if ("radii" in opts || typeof opts.needDeepBonus === "number") {
      const want = wantComposeRadii(opts);
      const got = opts.radii;
      const same =
        want == null
          ? got == null
          : Array.isArray(got) && got.length === want.length && got.every((x, i) => x === want[i]);
      if (!same) {
        fails.push(
          `meta.composeOpts.radii is ${JSON.stringify(got)} and the escalation table for ` +
            `needDeepBonus ${opts.needDeepBonus ?? "none"} is ${want == null ? "absent" : want.join(",")}. ` +
            `The list is that composeOpts walk — rewriting it used to pass`,
        );
      }
    }
    if (typeof opts.parkCap === "number" && typeof meta.ctrlParkFloorCap === "number") {
      if (opts.parkCap !== meta.ctrlParkFloorCap) {
        fails.push(
          `meta.composeOpts.parkCap is ${opts.parkCap} and ctrlParkFloorCap is ${meta.ctrlParkFloorCap}. ` +
            `The cap is the reservation this composition held — flattening it used to pass`,
        );
      }
    }
    const sw = opts.takeTowerSwap;
    if (sw && Number.isInteger(sw.to?.x) && Number.isInteger(sw.to?.y)) {
      const towers = new Set((plan.structures?.tower || []).map(K));
      if (!towers.has(K(sw.to))) {
        fails.push(
          `meta.composeOpts.takeTowerSwap.to is ${sw.to.x},${sw.to.y} and no shipped tower sits there. ` +
            `The take's destination is a tower on the board this room ships — moving it used to pass`,
        );
      }
      if (sw.from && Number.isInteger(sw.from.x) && towers.has(K(sw.from))) {
        fails.push(
          `meta.composeOpts.takeTowerSwap.from is ${sw.from.x},${sw.from.y} and a shipped tower still ` +
            `sits there. The take vacated that seat — leaving it on a live tower used to pass`,
        );
      }
      if (
        sw.from &&
        Number.isInteger(sw.from.x) &&
        Number.isInteger(sw.from.y) &&
        chebyshev(sw.from, sw.to) !== 1
      ) {
        fails.push(
          `meta.composeOpts.takeTowerSwap.from is ${sw.from.x},${sw.from.y} and to is ${sw.to.x},${sw.to.y}. ` +
            `The take vacated a D8 neighbour of the destination — moving it off that ring used to pass`,
        );
      }
      const rec = wantTakenSwap(plan);
      if (rec && sw.from && Number.isInteger(sw.from.x) && Number.isInteger(sw.from.y)) {
        if (K(sw.from) !== K(rec.from) || K(sw.to) !== K(rec.to)) {
          fails.push(
            `meta.composeOpts.takeTowerSwap is ${sw.from.x},${sw.from.y} -> ${sw.to.x},${sw.to.y} and ` +
              `the published swap is ${rec.from.x},${rec.from.y} -> ${rec.to.x},${rec.to.y}. The take ` +
              `vacated that seat for that destination — moving it to another D8 used to pass`,
          );
        }
      }
    }
  }
  if (ctx.terrain && plan.sitter && typeof meta.extensions?.maxHubDist === "number") {
    const want = wantMaxHubDist(ctx.terrain, plan);
    if (want != null && meta.extensions.maxHubDist !== want) {
      fails.push(
        `meta.extensions.maxHubDist is ${meta.extensions.maxHubDist} and the layer-6 hub-field max of ` +
          `the extensions this room stood before the 7b reflow is ${want}. It is that walk, not a ` +
          `comment — flattening it used to pass`,
      );
    }
  }
  // r29p20 / r29p21 — leftover presence: freeze-cut walk with the mass / nuker /
  // observer lifted. Zeroing them used to pass.
  if (ctx.terrain && plan.sitter) {
    const wantMob = wantLayer5VetoMobility(ctx.terrain, plan);
    if (wantMob) {
      const bog = meta.misc?.mobilityVeto?.baseOverGated;
      if (typeof bog === "number" && bog !== wantMob.overGated) {
        fails.push(
          `meta.misc.mobilityVeto.baseOverGated is ${bog} and the freeze-cut walk with the extension ` +
            `mass, nuker and observer lifted has ${wantMob.overGated} gated over-target pair(s). It is ` +
            `that walk, not a comment — flattening it used to pass`,
        );
      }
      const copies = [
        ["misc.mobilityVeto.baseLap", meta.misc?.mobilityVeto?.baseLap],
        ["labs.lapVeto.baseLap", meta.labs?.lapVeto?.baseLap],
      ];
      for (const [path, got] of copies) {
        if (typeof got === "number" && Math.abs(got - wantMob.maxGated) > 1e-9) {
          fails.push(
            `meta.${path} is ${got} and the freeze-cut gated lap with the extension mass, nuker and ` +
              `observer lifted is ${wantMob.maxGated}. It is that walk, not a comment — flattening it ` +
              `used to pass`,
          );
        }
      }
      const refused = meta.misc?.mobilityVeto?.refused;
      if (Array.isArray(refused)) {
        for (let i = 0; i < refused.length; i++) {
          const got = refused[i]?.wasLap;
          if (typeof got !== "number") continue;
          if (Math.abs(got - wantMob.maxGated) > 1e-9) {
            fails.push(
              `meta.misc.mobilityVeto.refused[${i}].wasLap is ${got} and the freeze-cut gated lap with ` +
                `the extension mass, nuker and observer lifted is ${wantMob.maxGated}. It is that walk, ` +
                `not a comment — flattening it used to pass`,
            );
          }
        }
      }
    }
  }

  // ROUND 28 / criticism 88 — a discarded rung with MORE ramparts than the
  // shipped wall had a free mobility. The trail now publishes each composed
  // rung's cut; the lap is enclosureMobility of that cut, not a number.
  //
  // THREE ROOMS (sealed-recovery recompositions) ship a ladder and no
  // shellEscalation. Their cutTiles live on the declaration. A room that
  // declares a ladder owes a cut on every rung, from one of those two lists.
  {
    const esc = meta.shellEscalation;
    const ladderDecl = (meta.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
    const shippedRamp = (plan.structures?.rampart || []).length;
    const shippedCuts = sh.cutAtFreeze?.length ? sh.cutAtFreeze : sh.cut;
    const pickedBonus = esc && typeof esc.pickedNeedDeepBonus === "number" ? esc.pickedNeedDeepBonus : null;
    const shippedLap =
      ctx.terrain && plan.sitter && shippedCuts && shippedCuts.length
        ? enclosureMobility(ctx.terrain, plan, shippedCuts)
        : null;
    const sameCutSet = (a, b) => {
      const s = new Set((b || []).map(K));
      return !!(s.size && a && a.length === s.size && a.every((t) => s.has(K(t))));
    };
    // Discarded = not the picked bonus. Recovery rooms ship a ladder and no
    // escalation trail; there the winner is the rung whose ramparts match the
    // wall this room built.
    const isDiscarded = (row) => {
      if (!row) return false;
      if (esc && pickedBonus !== null) return row.needDeepBonus !== pickedBonus;
      return typeof row.ramparts === "number" && row.ramparts !== shippedRamp;
    };
    // r29p11 / 88 — a discarded cut with tiles is a composed enclosure,
    // complete or not. A one-tile nudge (E11S2 20,9→19,9) plus
    // complete=false used to skip the seal. Fleet has 0 incomplete
    // discarded rungs; a leak bites either way. Better-lap-always is
    // not required (eco-capped last rungs).
    const discardedCutSeals = (row, cuts, where) => {
      if (!isDiscarded(row) || !cuts || !cuts.length) return;
      if (!ctx.terrain || !plan.sitter) return;
      const ext = exteriorFlood(ctx.terrain, new Set(cuts.map(K)));
      if (ext[plan.sitter.x + plan.sitter.y * 50]) {
        fails.push(
          `${where} needDeep+${row.needDeepBonus} discarded cut leaks the sitter. ` +
            `A discarded enclosure is not a composed enclosure if the exterior ` +
            `flood from the room border reaches the garrison, complete or not`,
        );
      }
    };
    // r29p8 / 88 — judge the published cut, not the free ramparts integer.
    // cheaper-and-not-longer on row.ramparts misses an 8-tile box at lap 0
    // that keeps ramparts=50 when shippedLap is under the buy floor.
    const judgeDiscardedPublishedCut = (row, cuts, where) => {
      if (!isDiscarded(row) || !cuts || !cuts.length) return;
      if (
        (sameCutSet(cuts, sh.cutAtFreeze) || sameCutSet(cuts, sh.cut)) &&
        (typeof row.ramparts !== "number" || row.ramparts !== shippedRamp)
      ) {
        fails.push(
          `${where} needDeep+${row.needDeepBonus} discarded enclosure is not the winner's cut — ` +
            `its published cut equals cutAtFreeze or shell.cut. Dropping ramparts to the cut length ` +
            `used to skip the fatter-and-freeze identity`,
        );
      }
      if (!ctx.terrain || !plan.sitter || typeof shippedLap !== "number") return;
      const lap = enclosureMobility(ctx.terrain, plan, cuts);
      if (typeof lap !== "number" || !(lap < shippedLap - 1e-6) || cuts.length > shippedCuts.length) return;
      // E4S2 needDeep+0 walks lap 0 at the same published-cut length as the
      // winner and lost on ramparts. A strictly shorter cut is never a real
      // discarded composition; a same-length prettier cut is only a would-have
      // against a later challenger.
      const later =
        pickedBonus === null || (typeof row.needDeepBonus === "number" && row.needDeepBonus > pickedBonus);
      if (cuts.length === shippedCuts.length && !later) return;
      fails.push(
        `${where} needDeep+${row.needDeepBonus} published cut is ${cuts.length} tile(s) at a lap of ${lap} ` +
          `against the shipped published cut of ${shippedCuts.length} at ${shippedLap}. The escalation ` +
          `would have taken this challenger — a discarded enclosure that walks a strictly better lap ` +
          `at no extra length is judged by its published cut, not a free ramparts integer`,
      );
    };
    if (esc && ladderDecl && !Array.isArray(esc.rungs)) {
      fails.push(
        `meta.shellEscalation has no rungs trail and this room declares a ladder. Deleting the cut ` +
          `list is how a fatter discarded lap goes back to being a free number`,
      );
    }
    if (ladderDecl && ctx.terrain && plan.sitter) {
      const escRungs = Array.isArray(esc?.rungs) ? esc.rungs : [];
      for (const row of ladderDecl.ladder.rungs) {
        if (!row) continue;
        const twin = escRungs.find((r) => r && r.needDeepBonus === row.needDeepBonus);
        const cuts = Array.isArray(row.cutTiles) && row.cutTiles.length
          ? row.cutTiles
          : twin && Array.isArray(twin.cutTiles) && twin.cutTiles.length
            ? twin.cutTiles
            : null;
        if (!cuts) {
          fails.push(
            `ladder.rungs needDeep+${row.needDeepBonus} has no cutTiles and shellEscalation has no twin. ` +
              `A recovery-room discarded lap used to stay free because the trail never landed on the ` +
              `shipped plan`,
          );
          continue;
        }
        const want = enclosureMobility(ctx.terrain, plan, cuts);
        if (typeof row.mobility === "number" && typeof want === "number" && Math.abs(row.mobility - want) > 1e-6) {
          fails.push(
            `ladder.rungs needDeep+${row.needDeepBonus} mobility is ${row.mobility} and ` +
              `enclosureMobility of its published cut is ${want}. Regenerating the paragraph does not ` +
              `launder a fatter rung's invented lap`,
          );
        }
        judgeDiscardedPublishedCut(row, cuts, "ladder.rungs");
        discardedCutSeals(row, cuts, "ladder.rungs");
        // r29 / 88 residue — a fatter discarded cut replaced with the shipped
        // cut, mobility set to the winner's lap, regen, escaped. enclosureMobility
        // of a free list is an agreement test. A wider enclosure is not the
        // winner's cut.
        if (typeof row.ramparts === "number" && row.ramparts > shippedRamp) {
          const freeze = new Set((sh.cutAtFreeze || []).map(K));
          const same =
            freeze.size &&
            cuts.length === freeze.size &&
            cuts.every((t) => freeze.has(K(t)));
          if (same) {
            fails.push(
              `ladder.rungs needDeep+${row.needDeepBonus} has ${row.ramparts} ramparts against a shipped ` +
                `${shippedRamp} and its cutTiles ARE cutAtFreeze. A fatter discarded enclosure is not the ` +
                `winner's cut — swapping them in and walking the prettier lap used to pass`,
            );
          }
        }
      }
    }
    if (esc && Array.isArray(esc.rungs) && ctx.terrain && plan.sitter) {
      const freeze = new Set((sh.cutAtFreeze || []).map(K));
      const picked = esc.rungs.find((r) => r && r.needDeepBonus === esc.pickedNeedDeepBonus);
      if (picked && Array.isArray(picked.cutTiles) && freeze.size) {
        const got = new Set(picked.cutTiles.map(K));
        if (got.size !== freeze.size || [...got].some((k) => !freeze.has(k))) {
          fails.push(
            `meta.shellEscalation.rungs picked needDeep+${esc.pickedNeedDeepBonus} cutTiles do not equal ` +
              `cutAtFreeze. The winning rung IS layer 2's cut`,
          );
        }
      }
      const ladder = (meta.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
      const declRungs = ladder?.ladder?.rungs || [];
      for (const row of esc.rungs) {
        if (!row || !Array.isArray(row.cutTiles) || !row.cutTiles.length) {
          fails.push(
            `meta.shellEscalation.rungs has a row (needDeep+${row?.needDeepBonus}) with no cutTiles. ` +
              `A rung without its enclosure is how a fatter discarded lap stayed free`,
          );
          continue;
        }
        const want = enclosureMobility(ctx.terrain, plan, row.cutTiles);
        if (typeof row.mobility === "number" && typeof want === "number" && Math.abs(row.mobility - want) > 1e-6) {
          fails.push(
            `meta.shellEscalation.rungs needDeep+${row.needDeepBonus} mobility is ${row.mobility} and ` +
              `enclosureMobility of its own cutTiles is ${want}. The discarded rung's lap is a walk ` +
              `over the published cut, not a free number`,
          );
        }
        judgeDiscardedPublishedCut(row, row.cutTiles, "meta.shellEscalation.rungs");
        discardedCutSeals(row, row.cutTiles, "meta.shellEscalation.rungs");
        const twin = declRungs.find((r) => r && r.needDeepBonus === row.needDeepBonus);
        if (twin && typeof twin.mobility === "number" && typeof want === "number" && Math.abs(twin.mobility - want) > 1e-6) {
          fails.push(
            `ladder.rungs needDeep+${row.needDeepBonus} mobility is ${twin.mobility} and the cut the ` +
              `trail published for that rung walks ${want}. Regenerating the paragraph does not ` +
              `launder a fatter rung's invented lap`,
          );
        }
      }
    }
  }

  return fails;
}

{
  const missingDark = Object.keys(META_DARK).filter((n) => !META_LEAF_NAMES.has(n));
  if (missingDark.length) {
    throw new Error(`r27-gates META_DARK names not in the snapshot: ${missingDark.join(", ")}`);
  }
  const darkSnap = new Set(idents.dark);
  const missingSnap = [...darkSnap].filter((n) => !META_DARK[n]);
  if (missingSnap.length) {
    throw new Error(`r27-gates snapshot dark names have no META_DARK row: ${missingSnap.join(", ")}`);
  }
}
