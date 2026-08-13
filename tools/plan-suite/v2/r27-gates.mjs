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
import { D8, chebyshev, walkable } from "./shared.mjs";
import { fieldFrom } from "./layer-hub.mjs";
import { BUILT_OBSTACLES, interiorWalk, MAX_CUT, RADII_WIDE } from "./layer-shell.mjs";
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
  arrayPartner: { klass: "presence", why: "layer-3 adjacency bookkeeping; the crossing census is gated on the shipped tiles" },
  baseCut: { klass: "presence", why: "layer-2's pick size before expand/useless-prune; priceyWall is the derived consequence (baseCut > MAX_CUT); the exact pick is a search witness" },
  baseOverGated: { klass: "presence", why: "layer-3 mobility veto input; the as-built lap is the gated quantity" },
  battlementFloor: { klass: "derived" },
  battlementGap: { klass: "presence", why: "layer-2 battlement spacing; battlementUnreachable is derived" },
  battlementGapTiles: { klass: "presence", why: "the tiles of that gap; the unreachable roster is derived" },
  boundHeld: { klass: "presence", why: "layer-6 corridor-bound instrument; the as-built lap is gated" },
  boundLap: { klass: "presence", why: "same bound, the lap it held" },
  boundRederived: { klass: "presence", why: "the bound re-read after relocation; a layer-6 witness" },
  budgetSpent: { klass: "presence", why: "layer-6 lane reservation spend; the reservation is the note's evidence" },
  causeFirst: { klass: "presence", why: "mobility-cause tie-break witness on a declaration record" },
  center: { klass: "presence", why: "nuke-window centre, already published on nukeWindow.center" },
  cleanAnchor: { klass: "presence", why: "lab-anchor search witness; the shipped diamond is gated" },
  corridorFallback: { klass: "presence", why: "layer-6 corridor bookkeeping" },
  corridorPlaced: { klass: "presence", why: "layer-6 corridor bookkeeping" },
  counterfactualBasis: { klass: "rendered" },
  coveredDetourDeclared: { klass: "presence", why: "whether the covered-detour declaration fired; the declaration channel is gated" },
  cutAdopted: { klass: "derived" },
  deepBudget: { klass: "presence", why: "layer-6 deep-tile budget witness" },
  deepExhausted: { klass: "presence", why: "layer-6 search exhaustion flag" },
  deepReach: { klass: "presence", why: "layer-6 reach witness" },
  digRoads: { klass: "presence", why: "layer-5 road-on-wall tunnel count; the road+rampart taxonomy is gated" },
  enclosureBasis: { klass: "rendered" },
  extractorOffNetwork: { klass: "presence", why: "true iff the extractor's only network neighbour is the mineral seat (or none); the seat itself is the off-network declaration" },
  extractorSeatNetTiles: { klass: "presence", why: "the extractor's D8 network neighbours excluding the mineral seat; sibling of extractorOffNetwork" },
  faceAndSatHeld: { klass: "presence", why: "towerSwapOffer leaf; the offer basis is rendered from it" },
  fillerTiles: { klass: "presence", why: "layer-7 filler-tile census; roads are gated by the network check" },
  floorGated: { klass: "presence", why: "mobility floor on a declaration record" },
  floorOver: { klass: "presence", why: "mobility floor witness" },
  floorOverGated: { klass: "presence", why: "mobility floor witness" },
  floorUngated: { klass: "presence", why: "mobility floor witness" },
  freeDin: { klass: "presence", why: "mass-free interior walk on a mobility record" },
  freeLeft: { klass: "presence", why: "layer-6 remaining free-deep count" },
  haulCost: { klass: "presence", why: "lab haul scoring witness; the shipped haul is declared" },
  hubDistCap: { klass: "presence", why: "layer-1 hub-distance cap" },
  inertPromoted: { klass: "presence", why: "inert-prune promotion roster; cutDrift binds the prune" },
  lapCeilingFloor: { klass: "presence", why: "layer-6 lap-ceiling witness" },
  lapVeto: { klass: "presence", why: "layer-3/4 lap veto record; the as-built lap is gated" },
  massAdds: { klass: "presence", why: "mobility mass-share witness on a declaration" },
  maxDist: { klass: "presence", why: "a search's own max-distance counter" },
  maxHubDist: { klass: "presence", why: "layer-1 seed scoring witness" },
  minDmgArray: { klass: "presence", why: "layer-3 hill-climb witness" },
  minDmgPicked: { klass: "presence", why: "layer-3 hill-climb witness" },
  mineralApproachAtReservation: { klass: "presence", why: "layer-1's approach, kept beside the shipped one (OL5)" },
  mineralBubble: { klass: "derived" },
  mineralContainer: { klass: "presence", why: "layer-5's own seat pick; the shipped container is gated" },
  mineralOffNetworkWhy: { klass: "rendered" },
  mineralSeatAtReservation: { klass: "presence", why: "layer-1's reserved seat, kept beside the shipped one (OL5)" },
  mineralSeatNetTiles: { klass: "presence", why: "D8 neighbours of the mineral seat on the network as finalize measured it; the off-network declaration is gated" },
  mobilityRepair: { klass: "presence", why: "layer-6 repair-attempt record" },
  mobilityShipped: { klass: "derived" },
  mobilityShippedFree: { klass: "presence", why: "the same lap with mass removed; as-built is the gated one" },
  newRoads: { klass: "presence", why: "layer-3 laid-road event count; later prune may delete them; the shipped road list is gated" },
  noAlternative: { klass: "presence", why: "a search-refusal witness" },
  nukerHubDist: { klass: "derived" },
  nukerInWindow: { klass: "presence", why: "nukeWindow.nukerInWindow sibling; the window is re-derived" },
  observerHubDist: { klass: "derived" },
  parkCap: { klass: "presence", why: "composeOpts park cap; ctrlParks are re-derived" },
  paveRetired: { klass: "presence", why: "layer-7b reflow witness" },
  pickedBy: { klass: "presence", why: "a search's own picker label" },
  priceProven: { klass: "presence", why: "towerSwapOffer leaf; the offer basis is rendered from it" },
  priceyWall: { klass: "derived" },
  protectRadius: { klass: "derived" },
  prunedBasis: { klass: "rendered" },
  radii: { klass: "presence", why: "composeOpts seed radii" },
  rcl5Pair: { klass: "presence", why: "which tower RCL5 gets; the shipped six are gated" },
  refillBasis: { klass: "rendered" },
  refillDistsUnblocked: { klass: "derived" },
  remeasured: { klass: "rendered" },
  rescueSpent: { klass: "presence", why: "layer-6 rescue spend" },
  rescuedLap: { klass: "presence", why: "layer-6 rescue witness" },
  rescuedTo: { klass: "presence", why: "layer-6 rescue destination" },
  roadsEaten: { klass: "presence", why: "lab-stamp road-eat count; the network is re-derived" },
  rolledBackFrom: { klass: "presence", why: "layer-7b rollback origin" },
  searchedSeats: { klass: "presence", why: "towerSwapOffer leaf" },
  servedExts: { klass: "presence", why: "layer-7 service census" },
  servedFree: { klass: "presence", why: "layer-7 service census" },
  shallowCost: { klass: "presence", why: "lab-stamp shallow-lab cost" },
  shallowNow: { klass: "presence", why: "reflow's own remaining-shallow count; the board's shallow set is gated" },
  shallowRamparts: { klass: "presence", why: "personal-rampart count at a layer; the board's ramparts are gated" },
  shallowRefused: { klass: "presence", why: "reflow refusal roster; OL6 registers the sentences" },
  shippedAvgShellDmg: { klass: "derived" },
  shippedShellDmg: { klass: "derived" },
  shippedWeakTiles: { klass: "derived" },
  shippedWeakest: { klass: "derived" },
  spurred: { klass: "derived" },
  stitchTiles: { klass: "presence", why: "layer-7 stitch roster" },
  stitched: { klass: "presence", why: "layer-7 stitch count" },
  strandedFirst: { klass: "presence", why: "conduct-bridge witness" },
  stubCap: { klass: "presence", why: "layer-6 stub cap" },
  stubExhausted: { klass: "presence", why: "layer-6 stub exhaustion" },
  stubRoads: { klass: "presence", why: "layer-6 stub roster" },
  swampPaved: { klass: "derived" },
  takeTowerSwap: { klass: "presence", why: "composeOpts input from a re-composition; the shipped battery is gated" },
  tourRule: { klass: "presence", why: "sealed-recovery tour ceiling (OF6)" },
  towerOnly: { klass: "presence", why: "nuke-window's layer-3 sibling" },
  towerSwapOffer: { klass: "presence", why: "the offer record; its basis is rendered" },
  tradeCost: { klass: "presence", why: "a priced-refusal witness" },
  unreachableExts: { klass: "presence", why: "layer-7 unreachable-extension census" },
  unreachedClusters: { klass: "presence", why: "layer-7 cluster census" },
  unsealed: { klass: "presence", why: "a pocket-unseal witness" },
  uselessCut: { klass: "presence", why: "tiles layer-2 kept that the single-removal test does not need; redundantCut is gated" },
  wasLap: { klass: "presence", why: "a before-lap on a relocation record" },
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
    const addK = new Set((sh.cutDrift || []).filter((e) => e && e.op === "add").map((e) => K(e)));
    const stray = sh.cutAdopted.filter((t) => t && Number.isInteger(t.x) && !addK.has(K(t)));
    if (stray.length) {
      fails.push(
        `meta.shell.cutAdopted names ${stray.length} tile(s) (${stray.slice(0, 4).map(K).join(" ")}) that ` +
          `cutDrift does not adopt. The list is empty in this fleet (layer-7b overwrite); a planted rampart ` +
          `tile is not an adoption`,
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
