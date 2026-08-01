/**
 * Plan v2 — the layer pipeline itself.
 *
 * Lives apart from plan.mjs (gallery) and export-anim.mjs (frames) so both
 * consumers run the EXACT same stack. An animation that disagrees with the
 * gallery is worse than no animation.
 *
 * Layer order and why:
 *   1 hub        grow from the room (anchors → seed → core → claims)
 *   2 shell      min-cut BEFORE contents, so nothing can be placed outside
 *   3 towers     pure optimisation over a finished shell
 *   4 labs       the one justified stamp
 *   5 misc       nuker + observer + extractor/mineral works
 *                (never factory, never power spawn)
 *   6 extensions the flexible mass — flows into whatever space is left
 *   7 late roads  rampart spurs + extension-face net + dead-end prune, last
 *                so they never steal a tile from the 60 extensions
 */
import { planHub } from "./layer-hub.mjs";
import { builtMobility, planShell, RADII_WIDE } from "./layer-shell.mjs";
import { planTowers } from "./layer-towers.mjs";
import { planLabs } from "./layer-labs.mjs";
import { planMisc } from "./layer-misc.mjs";
import { planExtensions } from "./layer-ext.mjs";
import { planWallRoads } from "./layer-walls.mjs";
import { MOBILITY_RAMPART_CAP, RAMPARTS_PER_RATIO } from "./layer-ext.mjs";

export const EXT_TARGET = 60;

/**
 * One full layer stack on a fresh hub plan. Deterministic, so it can be
 * re-run under different shell options — which is how the 60/60 extension
 * guarantee works: if the tight shell cannot hold the program, we buy a
 * bigger bubble rather than ship a room that is short on extensions.
 */
export function composePlan(d, shellOpts = {}) {
  const hub = planHub(d.terrain, d.objects, shellOpts);
  if (hub.error) return { room: d.room, error: hub.error };
  const plan = { room: d.room, terrain: d.terrain, ...hub };
  // meta.shortfalls — the honest-shortfall channel. Layer 1 may already have
  // filled it (boxed-in source links); every later layer appends. The
  // validator PASSES a declared shortfall with a loud note and FAILS the same
  // violation when it is undeclared.
  plan.meta.shortfalls = [...(plan.meta.shortfalls || [])];

  const shell = planShell(d.terrain, plan, shellOpts);
  if (shell.error) {
    plan.shellError = shell.error;
    return plan;
  }
  plan.structures.rampart = shell.rampart;
  plan.shell = shell.shell;
  plan.exterior = shell.exterior;
  plan.depth = shell.depth;
  plan.meta.counts.rampart = shell.rampart.length;
  plan.meta.shell = shell.shell;
  // a wall segment the interior cannot walk to is the room beating the planner,
  // the same way a far lobe no tower can cover is — same channel, same rules
  plan.meta.shortfalls.push(...(shell.shortfalls || []));
  for (const b of shell.bubbleRejected || []) {
    plan.meta.shortfalls.push({
      gate: "rampart",
      detail:
        `${b.x},${b.y} wants a personal rampart but sits on the border band ` +
        `(x/y 1 or 48) with a non-wall edge triple — engine returns ` +
        `ERR_INVALID_TARGET (utils.js:120-143)`,
      tiles: [{ x: b.x, y: b.y }],
    });
  }

  const tw = planTowers(d.terrain, plan, shellOpts);
  if (tw.error) plan.towerError = tw.error;
  else {
    plan.structures.tower = tw.tower;
    plan.structures.road.push(...tw.roads);
    plan.meta.counts.tower = tw.tower.length;
    plan.meta.towers = tw.towersMeta;
    // a shell whose far lobe no legal deep tile can reach is the room beating
    // the planner, not the planner being sloppy — declare it, loudly
    plan.meta.shortfalls.push(...(tw.shortfalls || []));
  }

  const lb = planLabs(d.terrain, plan);
  if (lb.error) plan.labError = lb.error;
  else {
    plan.structures.lab = lb.lab;
    plan.labInputs = lb.labInputs;
    plan.structures.road.push(...lb.roads);
    if (lb.shallowLabs.length) plan.structures.rampart.push(...lb.shallowLabs);
    plan.meta.counts.lab = lb.lab.length;
    plan.meta.labs = lb.labsMeta;
  }

  const ms = planMisc(d.terrain, plan);
  if (ms.error) plan.miscError = ms.error;
  else {
    plan.structures.nuker = ms.nuker;
    plan.structures.observer = ms.observer;
    // m11: the extractor is the one structure allowed on an object tile
    if (ms.extractor.length) plan.structures.extractor = ms.extractor;
    if (ms.mineralContainer.length) plan.structures.container.push(...ms.mineralContainer);
    if (ms.bubbles.length && plan.structures.rampart) plan.structures.rampart.push(...ms.bubbles);
    plan.meta.shortfalls.push(...(ms.shortfalls || []));
    for (const b of ms.bubbleRejected || []) {
      plan.meta.shortfalls.push({
        gate: "rampart",
        detail:
          `mineral seat ${b.x},${b.y} is on the border band with a non-wall ` +
          `edge triple — its rampart bubble can never be built`,
        tiles: [{ x: b.x, y: b.y }],
      });
    }
    plan.structures.road.push(...ms.roads);
    plan.meta.counts.nuker = ms.nuker.length;
    plan.meta.counts.observer = ms.observer.length;
    plan.meta.counts.extractor = ms.extractor.length;
    plan.meta.counts.container = plan.structures.container.length;
    plan.meta.misc = ms.miscMeta;
  }

  const ex = planExtensions(d.terrain, plan);
  if (ex.error) plan.extError = ex.error;
  else {
    plan.structures.extension = ex.extension;
    // corridor stubs: the roads the extension mass grew along
    if (ex.roads?.length) plan.structures.road.push(...ex.roads);
    if (ex.shallowExts.length && plan.structures.rampart) {
      plan.structures.rampart.push(...ex.shallowExts);
    }
    plan.meta.counts.extension = ex.extension.length;
    plan.meta.extensions = ex.extMeta;
    if (ex.extension.length < EXT_TARGET) {
      plan.meta.shortfalls.push({
        gate: "extension",
        detail:
          `only ${ex.extension.length}/${EXT_TARGET} extensions fit — the ` +
          `widest shell the escalation ladder would pay for still encloses ` +
          `${plan.shell?.deepTiles ?? "?"} deep tiles`,
        tiles: [],
      });
    }
  }

  // late roads LAST — rampart spurs, the extension-face safety net and the
  // dead-end prune, which is the only pass allowed to DELETE earlier roads
  const wr = planWallRoads(d.terrain, plan);
  if (wr.error) plan.wallRoadError = wr.error;
  else {
    if (wr.removeRoads?.length) {
      const gone = new Set(wr.removeRoads.map((r) => `${r.x},${r.y}`));
      plan.structures.road = plan.structures.road.filter((r) => !gone.has(`${r.x},${r.y}`));
    }
    plan.structures.road.push(...wr.roads);
    plan.meta.walls = wr.wallMeta;
  }

  // m7 (final pass): every layer that places a shallow structure appends its
  // own personal rampart, and those can land on a tile the shell already
  // walls. One rampart per tile, always — counts and upkeep read off this.
  if (plan.structures.rampart) {
    const seen = new Set();
    plan.structures.rampart = plan.structures.rampart.filter((r) => {
      const k = `${r.x},${r.y}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (plan.shell) {
      plan.shell.upkeepPerTick = Math.round(plan.structures.rampart.length * 3) / 100;
    }
  }

  plan.meta.counts.road = plan.structures.road.length;
  plan.meta.counts.rampart = plan.structures.rampart ? plan.structures.rampart.length : 0;

  // DEFENDER MOBILITY, RE-MEASURED ON THE FINISHED BASE. The shell negotiated
  // against an empty interior because that is all that existed at layer 2; this
  // is the lap the garrison will actually walk at RCL8, with the whole program
  // standing in it. It decides nothing — it is the honest number, and the gap
  // between it and meta.shell.mobility is exactly how much of the room's
  // mobility problem belongs to the layers that place the mass.
  if (plan.shell) plan.meta.shell.mobilityBuilt = builtMobility(d.terrain, plan);
  declareEcoTax(plan);
  return plan;
}

// ------------------------------------------------------------------
// ECO SHORTFALLS ARE SHORTFALLS TOO.
//
// The escalation ladder has always had a price ceiling (ECO_TOLERANCE) and it
// has always been enforced silently: a room whose hub ends up 27 tiles from its
// controller, or 84 tiles of round trip from its sources, or three seeds down
// the ranked list, simply shipped that plan and said nothing. "Silent capping"
// is on the anti-pattern list by name, and this is the last place doing it.
//
// The thresholds are read off the fleet, not invented: pathController runs
// min 4 / median 10 / p90 25 / max 75, and pathSourcesSum min 8 / median 27 /
// p90 46 / max 84. So >25 and >60 each mark roughly the worst decile — the
// rooms where the hauler bill is a terrain verdict rather than a planner
// choice — and any seedSkip at all means the top-ranked confluence was rejected
// outright. The wording below is generated from the room's own numbers.
const FLEET_CTRL_WALK_MEDIAN = 10;
const FLEET_SRC_SUM_MEDIAN = 27;
const ECO_CTRL_WALK_GATE = 25;
const ECO_SRC_SUM_GATE = 60;

const OCTANT = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
function bearing(from, to) {
  const a = Math.atan2(to.y - from.y, to.x - from.x); // screeps y grows south
  return OCTANT[(Math.round((a * 4) / Math.PI) + 8) % 8];
}

function declareEcoTax(plan) {
  const pc = plan.meta?.pathController ?? 0;
  const ps = plan.meta?.pathSourcesSum ?? 0;
  const skip = plan.meta?.seedSkip ?? 0;
  if (pc <= ECO_CTRL_WALK_GATE && ps <= ECO_SRC_SUM_GATE && skip <= 0) return;
  const hub = plan.hub;
  const bits = [];
  if (pc > ECO_CTRL_WALK_GATE) {
    bits.push(
      `the controller is a ${pc}-tile walk ${bearing(hub, plan.controller)} of the hub, ` +
        `${pc - FLEET_CTRL_WALK_MEDIAN} over the fleet median of ${FLEET_CTRL_WALK_MEDIAN} — every upgrader ` +
        `trip and every controller-link haul pays it`,
    );
  }
  if (ps > ECO_SRC_SUM_GATE) {
    bits.push(
      `the source paths sum to ${ps} (${plan.sources
        .map((s) => bearing(hub, s))
        .join(" + ")}), ${ps - FLEET_SRC_SUM_MEDIAN} over the fleet median of ${FLEET_SRC_SUM_MEDIAN} — ` +
        `paid on every miner rotation and every container haul`,
    );
  }
  if (skip > 0) {
    bits.push(
      `the hub sits on seed rank ${skip}: the ${skip} better-scoring confluence(s) in this room could not ` +
        `hold the RCL8 program at any rung of the shell ladder, so the planner walked down the list and ` +
        `bought the distance instead of shipping a room short on extensions`,
    );
  }
  const basin = plan.basin?.length ?? 0;
  // ------------------------------------------------------------------
  // THE CAUSAL CLAUSE IS GENERATED, NOT ASSERTED.
  //
  // This used to end, unconditionally, with "the closer seats were rejected by
  // the space budget or by the enclosure, not by the eco score". In 14 of the
  // 20 rooms that print it, seedSkip is 0 — the hub IS the top-ranked
  // confluence and it composed the full RCL8 program on its first rung. Nothing
  // was rejected. The sentence invented a search that never ran, to explain a
  // distance that has a much simpler and entirely checkable cause: the anchors
  // in these rooms are far apart, and no hub anywhere in the room can be near
  // all of them at once.
  //
  // So the clause now comes off the room's own numbers. When a closer seat
  // really did fail (seedSkip > 0) it says so and counts them. When none did,
  // it says THAT, and backs the "genuinely far apart" claim with a bound
  // anybody can re-derive: two anchors chebyshev d apart cannot both be closer
  // than d/2 to any tile in the room, so ceil(d/2) is a floor on the walk this
  // room owes the far one no matter where the hub goes.
  // ------------------------------------------------------------------
  const anchors = [
    ...(plan.controller ? [{ n: "controller", p: plan.controller }] : []),
    ...(plan.sources || []).map((s, i) => ({ n: `source ${i + 1}`, p: s })),
  ];
  let spread = 0;
  let spreadPair = "";
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      const d = Math.max(
        Math.abs(anchors[i].p.x - anchors[j].p.x),
        Math.abs(anchors[i].p.y - anchors[j].p.y),
      );
      if (d > spread) {
        spread = d;
        spreadPair = `${anchors[i].n} ${anchors[i].p.x},${anchors[i].p.y} and ${anchors[j].n} ${anchors[j].p.x},${anchors[j].p.y}`;
      }
    }
  }
  const anchorFloor = Math.ceil(spread / 2);
  const cause =
    skip > 0
      ? `${skip} closer-scoring seat(s) WERE tried and rejected — none of them held the RCL8 program at ` +
        `any rung of the shell ladder — so this distance was bought, not preferred.`
      : `NO closer seat was rejected: this hub is seed rank 0 of ${plan.meta.seedPool ?? "?"} scored ` +
        `confluences and it composed the whole RCL8 program on its own ladder, so the eco score was ` +
        `never overruled by anything. The anchors are genuinely far apart in this room — the widest ` +
        `separation is ${spread} tiles (${spreadPair}), and two anchors ${spread} apart cannot both sit ` +
        `within ${anchorFloor} of any tile in the room, so a walk of at least ${anchorFloor} to the far ` +
        `one is owed by EVERY hub this room admits, not by this one.`;
  // ------------------------------------------------------------------
  // THE OPENER CLAIMS ONLY WHAT THE CLOSER PROVES.
  //
  // It used to open "hauler distances in this room are a terrain verdict, not a
  // preference" — a claim about the whole distance, in every room that prints
  // it. What the paragraph actually establishes is narrower and is stated at the
  // end of it: two anchors `spread` apart cannot both sit within ceil(spread/2)
  // of any tile, so a walk of at least that much is owed by every hub the room
  // admits. That is a FLOOR under part of the distance, not a verdict on all of
  // it — a hub 27 tiles from its controller in a room whose anchor floor is 12
  // is 12 tiles of terrain and 15 tiles of everything else. The opener now says
  // that, and the seedSkip case (where closer seats really were composed and
  // rejected) keeps its stronger wording because there the search is the proof.
  // ------------------------------------------------------------------
  const opener =
    skip > 0
      ? `hauler distances in this room were BOUGHT, not preferred: ${bits.join("; ")}. `
      : `hauler distances in this room are at least ${anchorFloor} tiles of terrain verdict — that is the ` +
        `floor the anchor spread proves below, and the rest is the shape of this basin: ${bits.join("; ")}. `;
  plan.meta.shortfalls.push({
    gate: "eco",
    detail:
      opener +
      `The hub sits at ${hub.x},${hub.y} on the only basin that holds the program — ${basin} tiles reachable ` +
      `from the seed, core pocket ${plan.meta.coreSize ?? "?"}. ${cause} Capping this silently is the ` +
      `anti-pattern; the numbers are here so the trade can be argued with.`,
    tiles: [{ x: hub.x, y: hub.y }],
    eco: {
      pathController: pc,
      pathSourcesSum: ps,
      seedSkip: skip,
      basin,
      seedPool: plan.meta.seedPool ?? null,
      anchorSpread: spread,
      anchorWalkFloor: anchorFloor,
    },
  });
}

export const extCount = (p) => p?.structures?.extension?.length ?? 0;

/**
 * The RCL8 program a finished room owes: 60 extensions, 10 labs, 6 towers,
 * a nuker and an observer. `rank` is what the escalation maximises — the
 * scarce pieces (labs are a rigid 4x4 stamp, towers need deep tiles) are
 * worth several extensions each, because a room can always shuffle an
 * extension somewhere and can't shuffle a lab diamond.
 */
function grade(p) {
  const s = p?.structures || {};
  const n = (t) => (s[t] || []).length;
  const ext = Math.min(n("extension"), EXT_TARGET);
  const lab = Math.min(n("lab"), 10);
  const tower = Math.min(n("tower"), 6);
  const nuker = Math.min(n("nuker"), 1);
  const obs = Math.min(n("observer"), 1);
  return {
    complete: ext === EXT_TARGET && lab === 10 && tower === 6 && nuker === 1 && obs === 1,
    rank: ext + lab * 4 + tower * 4 + nuker * 4 + obs * 4,
    cut: p?.shell?.cut.length ?? 1e9,
  };
}

/**
 * 60/60 extensions is a hard requirement — a room short on extensions is
 * permanently short on spawn throughput, forever, and no amount of clever
 * hauling buys it back. Two escalation axes, cheapest first:
 *
 *   1. SHELL   wider protect radii + a bigger deep-interior demand. A
 *              bigger bubble is more wall upkeep but more room inside.
 *   2. SEED    if even the widest shell around this hub is too cramped,
 *              the hub itself is in the wrong pocket — walk down the
 *              ranked seed list and re-plan the whole room.
 *
 * Almost every room settles on the first try; the ladder exists for the
 * handful of rooms whose best-scoring confluence sits in a dead end.
 */
/**
 * The rungs are OFFSETS on top of the shell's own demand estimate, never
 * absolutes. layer-shell derives its base floor from the program it still has
 * to place (78 tiles) plus the measured corridor overhead (~45); an absolute
 * rung would silently become a DOWNGRADE the moment that estimate moved, which
 * is exactly what happened when the base floor was the static 85 and the first
 * rung was 110. Offsets keep the ladder monotone by construction.
 *
 * The spacing (+25 / +55 / +85) is the spacing the old absolute ladder had and
 * it was measured, not guessed — see the note below on why an intermediate rung
 * buys nothing.
 */
const SHELL_ESCALATION = [
  {},
  { radii: RADII_WIDE, needDeepBonus: 25 },
  { radii: RADII_WIDE, needDeepBonus: 55 },
  { radii: [10, 11, 12, 13, 14], needDeepBonus: 85 },
];
const MAX_SEED_SKIP = 8;

/**
 * M6 — the escalation also has to pay for itself in UPKEEP, not just in
 * checkboxes.
 *
 * The ladder above was written to answer one question: "can this room fit
 * the program at all?" A room that fits 60 extensions at the tightest shell
 * therefore stopped on the first try — and looked finished. It wasn't. The
 * default shell used to guarantee a static 85 deep tiles while real demand is
 * ~115 (78 structures plus the road net that feeds them), so around 35 rooms
 * enclosed literally zero spare deep space and paid for the shortfall in
 * PERSONAL RAMPARTS: every extension, lab or tower forced onto a depth<=3 tile
 * buys its own rampart and repairs it forever. That floor is now COUNTED from
 * the program (layer-shell PROGRAM_TILES + measured corridor overhead), so the
 * FIRST composition is already the right one in most rooms and this ladder is
 * back to being what it was meant to be: a safety net, not the main mechanism.
 *
 * A personal rampart and a cut tile are the same currency. Ten extra cut
 * tiles that delete twenty personal ramparts is a net win — the wall is
 * longer, the bill is smaller, and the extensions sit in deep space where a
 * ranged attacker cannot reach them at all. So once a room is known to be
 * buildable we keep walking the ladder and buy the shell with the SMALLEST
 * TOTAL rampart count, cut plus personal, rather than the smallest cut.
 *
 * Two guards keep this from becoming a fleet-wide re-plan:
 *   ESCALATE_MIN  a room with almost no shallow structures has nothing to
 *                 win; it returns on the first complete plan as before.
 *                 Most rooms take this exit and never pay a second compose.
 *   the prune     the cut grows monotonically with needDeep while personal
 *                 ramparts fall, so the total is near-convex — the first
 *                 step that does not improve is the last one worth trying.
 *
 * The ladder SPACING is unchanged, and that was measured rather than assumed:
 * back when the rungs were absolute, an intermediate rung between them looked
 * obvious and wasn't — inserted, it won 7 rooms off the next rung and bought
 * the fleet 2 ramparts and 7 shallow extensions while adding 4 cut tiles and
 * pushing one more room's defender-mobility ratio over 1.0. That is noise
 * bought with a compose per escalating room. The reason coarse rungs suffice:
 * needDeep is a FLOOR on the negotiation, not a target — the shell picks the
 * smallest cut clearing it, and the cut that clears the floor in a real room
 * usually encloses far more anyway. The rungs only have to be far enough apart
 * to change which cut wins.
 */
const ESCALATE_MIN = 3;
/** how many flat rungs the ladder walks past before it believes the bill has turned */
const NO_GAIN_PATIENCE = 1;

const rampartsOf = (p) => p?.meta?.counts?.rampart ?? 1e9;
const roadsOf = (p) => p?.meta?.counts?.road ?? 1e9;
const cutOf = (p) => p?.shell?.cut?.length ?? 1e9;
/**
 * THE LADDER READS THE GATED LAP, because that is the reading everything else
 * in the fleet is judged on: layer 2's own tiebreak, layer 2's declaration,
 * layer 7's verdict and the suite's OVER-TARGET flag all take `maxGated` — the
 * maximum over wall pairs whose ABSOLUTE detour clears MOBILITY_DETOUR_FLOOR.
 * This one function read the ungated `max`, so the rung table stapled to a gated
 * declaration quoted a different statistic than the sentence above it, and the
 * ladder spent its premium on pairs the gate does not even look at.
 */
const mobOf = (p) => p?.shell?.mobility?.maxGated ?? 0;
const mobCauseOf = (p) => p?.shell?.mobility?.cause ?? "none";
// layer-shell's own target, restated here so the ladder can read it without
// importing a constant that means something slightly different one day
const MOBILITY_TARGET = 1.2;

/**
 * Ladder-local comparator: total forever-upkeep first. When two shells cost
 * the same number of ramparts the upkeep question is already settled — every
 * cut tile the wider bubble added, it took back off the personal pile — so
 * what is left to decide is build cost and defender mobility, and both track
 * WALL LENGTH. Hence cut before roads here: a swap that buys six cut tiles to
 * shed four road tiles is churn, and it was measurably worse (E15S2 went
 * 33->39 cut and its mobility ratio crossed 1.0 for nothing). Roads still
 * break the remaining tie, and an exact tie keeps the incumbent — the tighter
 * shell, since this walk only ever moves outward.
 *
 * Deliberately NOT better(): that one arbitrates across seeds and must keep
 * maximising the program.
 */
function cheaperUpkeep(a, b) {
  if (!b) return true;
  if (rampartsOf(a) !== rampartsOf(b)) return rampartsOf(a) < rampartsOf(b);
  if (cutOf(a) !== cutOf(b)) return cutOf(a) < cutOf(b);
  // same wall, same length: take the one the garrison can lap faster. Free —
  // by this point the upkeep question is settled and nothing else is at stake.
  if (mobOf(a) !== mobOf(b)) return mobOf(a) < mobOf(b);
  return roadsOf(a) < roadsOf(b);
}

/**
 * Given the plan the pipeline would have shipped today, walk what is left of
 * the ladder and keep the cheapest. The hub is untouched (planHub reads only
 * seedSkip), so every candidate here has the exact same economy — this trades
 * wall for personal ramparts and nothing else.
 */
/**
 * WHAT A SHORTER LAP IS WORTH, IN RAMPARTS.
 *
 * This used to be a single number (2) behind a single condition: a rung could
 * spend it ONLY if that rung landed the room inside the 1.2 target. The
 * condition, not the number, was the defect. It made the premium worthless
 * exactly where a lap is worst — a room at 7.5 whose next rung reaches 1.5 for
 * three ramparts is refused, because 1.5 is not 1.2, while a room at 1.25 whose
 * next rung reaches 1.2 for two ramparts is bought. E14S5 is the standing
 * example: rung 1 measures 1.5 against the shipped 7.5, three ramparts dearer,
 * and the ladder walked past it for a whole review cycle.
 *
 * The rule is now a price, and it is the fleet's ONE price for this trade — the
 * same constants layer 6 pays for a defender lane (layer-ext RAMPARTS_PER_RATIO
 * / MOBILITY_RAMPART_CAP): RAMPARTS_PER_RATIO permanent ramparts per 1.0 of
 * gated lap reclaimed, never more than MOBILITY_RAMPART_CAP in total, and only
 * ever while the incumbent is still failing the target. A room already inside
 * the target still cannot spend a single rampart on a prettier ratio.
 */
const MOBILITY_PREMIUM = MOBILITY_RAMPART_CAP;
/** what this rung may spend, given what it reclaims against the base rung */
const mobilityAllowance = (reclaimed) =>
  reclaimed <= 0 ? 0 : Math.min(MOBILITY_RAMPART_CAP, Math.floor(RAMPARTS_PER_RATIO * reclaimed));
/**
 * How much shorter a rung's lap has to be before the declaration calls it an
 * alternative. Below this the two enclosures are the same wall with a rounding
 * difference, and reporting "a wider cut reaches 3.48 instead of 3.5" is noise.
 */
const MATERIAL_LAP = 0.25;
const round2 = (v) => Math.round(v * 100) / 100;

const rungRecord = (p, seedSkip, si) => ({
  seedSkip,
  rung: si,
  needDeepBonus: SHELL_ESCALATION[si].needDeepBonus ?? 0,
  needDeep: p?.meta?.shell?.needDeep ?? null,
  mobility: mobOf(p),
  ramparts: rampartsOf(p),
  cut: cutOf(p),
  complete: p?.shell ? grade(p).complete : false,
  ecoCost: ecoCost(p),
});

/**
 * PROOF-CARRYING MOBILITY DECLARATIONS.
 *
 * "No enclosure this room admits is faster" is a claim about a search, and a
 * claim about a search that does not show the search is just an assertion. It
 * was also, for 30 rooms, FALSE: the ladder only walked when the room was short
 * on deep space or when the shell layer happened to blame the detour on the
 * enclosure's shape, so rooms like E11S4 shipped a 2.4 lap while rung 1 of the
 * very same seed reached 1.0 with FEWER ramparts and nobody ever composed it.
 *
 * So: layer 2 files the declaration, and the pipeline — which owns the ladder —
 * staples the rung table to it. Every rung this room actually composed, with the
 * mobility and the rampart bill it measured. A shell-mobility declaration that
 * reaches the plan without `rungs` is a bug, not a shortfall.
 */
function attachRungProof(plan, trail) {
  if (!plan?.meta?.shortfalls) return plan;
  for (const s of plan.meta.shortfalls) {
    if (s.gate !== "mobility" || s.source !== "shell" || s.rungs) continue;
    s.rungs = trail.map((r) => ({
      rung: r.rung,
      needDeepBonus: r.needDeepBonus,
      seedSkip: r.seedSkip,
      mobility: r.mobility,
      ramparts: r.ramparts,
      complete: r.complete,
    }));
    // the prose spells out the rungs of the seed we SHIPPED (the ones that were
    // a real alternative); `s.rungs` above carries every composition including
    // the rejected seeds, so nothing is lost by keeping the sentence readable
    const skip = plan.meta.seedSkip ?? 0;
    const mine = trail.filter((r) => r.seedSkip === skip);
    const shipped = mobOf(plan);
    const shippedRamparts = rampartsOf(plan);
    // ------------------------------------------------------------------
    // THE VERDICT IS READ OFF THE TABLE, NOT ASSERTED ABOVE IT.
    //
    // layer 2's cause template used to end "no cut of this basin can shorten
    // it" whenever it diagnosed terrain — a claim about every enclosure the room
    // admits, printed directly above a table of enclosures this room actually
    // composed, 30 of which listed a COMPLETE rung with a materially shorter
    // lap. E14S5 shipped 7.5 at 40 ramparts with rung 1 sitting in its own table
    // at 1.5 for 43. The impossibility claim is gone from layer 2 (see the `why`
    // strings there) and this is what replaces it: whatever the rungs say.
    // ------------------------------------------------------------------
    const better = mine
      .filter((r) => r.complete && r.mobility < shipped - MATERIAL_LAP)
      .sort((a, b) => a.mobility - b.mobility || a.ramparts - b.ramparts)[0];
    const best = (mine.length ? mine : trail).reduce((b, r) => (r.mobility < b.mobility ? r : b));
    const verdict = better
      ? `A WIDER CUT DOES SHORTEN IT, and it is in the table above: rung ${better.rung} ` +
        `(needDeep+${better.needDeepBonus}) composed the whole RCL8 program at a lap of ${better.mobility} for ` +
        `${better.ramparts} ramparts, ${better.ramparts - shippedRamparts} more than the ${shippedRamparts} this ` +
        `room ships. That is over the ${mobilityAllowance(shipped - better.mobility)} rampart(s) the ` +
        `${RAMPARTS_PER_RATIO}-per-1.0 mobility price allows for the ${round2(shipped - better.mobility)} of lap ` +
        `it reclaims (cap ${MOBILITY_RAMPART_CAP}), so it was refused on upkeep-first policy — not on ` +
        `impossibility. The trade is written down here so it can be argued with.`
      : best.mobility > MOBILITY_TARGET
        ? `No rung this room composed measured a materially shorter lap: the best of them is ${best.mobility} at ` +
          `${best.ramparts} ramparts, still over the ${MOBILITY_TARGET} target. Within the enclosures this room ` +
          `admits at a price it can pay, the lap is what it is.`
        : `The best lap any of them measured is ${best.mobility} at ${best.ramparts} ramparts; it was refused ` +
          `because the ${best.ramparts - shippedRamparts} extra rampart(s) exceed the ` +
          `${RAMPARTS_PER_RATIO}-per-1.0 price mobility is allowed to pay (cap ${MOBILITY_RAMPART_CAP}).`;
    s.detail +=
      ` LADDER WALKED: ${mine.length} rung(s) of this seed` +
      (trail.length > mine.length ? ` (plus ${trail.length - mine.length} composition(s) on rejected seeds)` : "") +
      ` — ` +
      mine
        .map(
          (r) =>
            `rung ${r.rung} (needDeep+${r.needDeepBonus}): ` +
            `mobility ${r.mobility}, ${r.ramparts} ramparts${r.complete ? "" : ", INCOMPLETE"}`,
        )
        .join(" · ") +
      `. ${verdict}`;
  }
  return plan;
}

/**
 * A SEARCH THAT WILL NOT CONVERGE IS A SHORTFALL LIKE ANY OTHER.
 *
 * The stated budget was "~200ms per room offline" and the fleet's real p50 is
 * around 450ms, because every room now composes up to four proof-carrying rungs
 * instead of one unexamined plan. That trade is defensible and it is written
 * down (docs/BASE-PLANNER-PERFECTION-GOAL.md). A room that composes MORE THAN
 * ONE SEED'S WORTH of them is a different thing: no enclosure of the
 * best-scoring confluence held the RCL8 program at any rung, so the planner
 * walked down the ranked seed list, and every step of that walk is a complete
 * shell negotiation plus the whole structure program. E4S7 is the standing
 * example at 32 compositions across 8 seeds.
 *
 * WHY THIS IS NOT TRIGGERED ON THE CLOCK ANY MORE. It used to fire above 1000ms
 * of wall time, and a wall clock is the one thing about a plan that is different
 * on every run — so the declaration APPEARED AND DISAPPEARED between runs, the
 * artifact never hashed the same twice, and "the planner is deterministic" was
 * an unfalsifiable claim. Bucketing the prose did not fix that; the TRIGGER was
 * the problem. The declaration is now keyed on the thing it was always actually
 * about, which the planner controls and which is identical on every run: how
 * many full compositions this room paid for. The stopwatch survives where it
 * belongs — in the suite's own timing report and in the validator's note, both
 * of which are console output that nothing hashes.
 *
 * A note, never a failure: the planner runs offline, so a slow room costs a
 * developer's patience and nothing in-game.
 */
const RUNTIME_DECLARE_COMPOSES = SHELL_ESCALATION.length;
function declareRuntime(plan, trail) {
  if (trail.length <= RUNTIME_DECLARE_COMPOSES) return;
  plan.meta.shortfalls = plan.meta.shortfalls || [];
  const seeds = new Set(trail.map((r) => r.seedSkip)).size;
  const complete = trail.filter((r) => r.complete).length;
  plan.meta.shortfalls.push({
    gate: "runtime",
    kind: "heavy-search",
    detail:
      `THIS ROOM COMPOSED ${trail.length} COMPLETE PLANS across ${seeds} seed(s) — more than the ` +
      `${RUNTIME_DECLARE_COMPOSES}-rung ladder a single seed is allowed, which is the line the suite ` +
      `declares at. ${complete} of them held the whole RCL8 program, and it shipped from seed rank ` +
      `${plan.meta.seedSkip ?? 0}. Each composition is a complete shell negotiation plus the whole ` +
      `structure program, kept only if it measurably beat the incumbent — that proof is exactly what the ` +
      `old sub-200ms budget was trading away, and it makes this one of the fleet's slowest rooms to plan. ` +
      `The planner runs offline, so this is a note about developer patience, not about CPU in-game; it is ` +
      `declared rather than hidden because a search that cannot settle on the best-scoring seat is worth ` +
      `seeing. No wall-clock reading is quoted here on purpose: it differs on every run, and a plan that ` +
      `hashes differently on every run cannot be checked for determinism at all. The suite prints the ` +
      `milliseconds.`,
    runtime: { compositions: trail.length, seeds, complete, seedSkip: plan.meta.seedSkip ?? 0 },
  });
}

function minUpkeepShell(d, first, firstIdx, ecoCap, seedSkip, trail, shellCache) {
  let win = first;
  let winIdx = firstIdx;
  let steps = firstIdx + 1;
  // WHY THE LADDER IS WALKED. Three reasons, and the first one used to be
  // wrong.
  //
  //   mobility  the shipped lap is over target. The old rule additionally
  //             demanded mobilityCause === "shape", on the theory that a wider
  //             bubble can only swallow a bay. That theory is false: the cause
  //             is diagnosed on the CURRENT enclosure, and a different rung is
  //             a different enclosure with a different diagnosis. E11S4 was
  //             labelled "terrain — no cut of this basin can shorten it" and
  //             rung 1 of the same seed shortened it to 1.0 with one rampart
  //             LESS. E8S7's own meta recorded the rung-0 mobility, escalated
  //             for ramparts, and still declared "no cut can shorten it".
  //             The cause now colours the declaration; it no longer gates the
  //             search.
  //   shallow   structures pushed into the depth<=3 band, each renting a
  //             personal rampart forever (the original reason this exists).
  //   demand    layer 6 ran out of deep interior (deepExhausted) or had to
  //             place extensions road-blind (corridorFallback) — both mean the
  //             shell's demand estimate under-counted what the mass needed, and
  //             both are invisible to the shallow counter when the mass papers
  //             over it with tail placements. E16S7 ships 29 depth-4
  //             extensions this way and never walked.
  const mobilityWalk = mobOf(first) > MOBILITY_TARGET;
  const shallowWalk = (first.meta?.extensions?.shallow ?? 0) >= ESCALATE_MIN;
  const demandWalk =
    !!first.meta?.extensions?.deepExhausted || (first.meta?.extensions?.corridorFallback ?? 0) > 0;
  let noGainStreak = 0;
  if (shallowWalk || mobilityWalk || demandWalk) {
    for (let si = firstIdx + 1; si < SHELL_ESCALATION.length; si++) {
      const p = composePlan(d, { ...SHELL_ESCALATION[si], seedSkip, shellCache });
      steps++;
      if (p.error || !p.shell) break; // nothing wider will conjure a shell here
      trail.push(rungRecord(p, seedSkip, si));
      if (!grade(p).complete) break; // a wider bubble that loses pieces is not a bargain
      if (ecoCap !== null && ecoCost(p) > ecoCap) break;
      const noGain = rampartsOf(p) >= rampartsOf(win);
      // a rung that shortens the lap without adding a single rampart is bought
      // on mobility grounds alone; anything that costs wall still has to be
      // cheaper upkeep, because upkeep is the first objective and mobility the
      // tiebreak — never the other way round
      const freeMobilityWin = rampartsOf(p) <= rampartsOf(win) && mobOf(p) < mobOf(win);
      // ...with one bounded exception, priced rather than gated: while the
      // incumbent is still failing the target, a rung may cost extra ramparts in
      // proportion to the gated lap it RECLAIMS — see mobilityAllowance. Both
      // sides are measured against `first`, the room's own cheapest composition,
      // so the cap is a total and not a per-step allowance the ladder can spend
      // four times over. A room already inside the target buys nothing here.
      const reclaimed = mobOf(first) - mobOf(p);
      const spend = rampartsOf(p) - rampartsOf(first);
      const buysMobility =
        mobOf(win) > MOBILITY_TARGET && mobOf(p) < mobOf(win) && spend <= mobilityAllowance(reclaimed);
      // A WALK THAT ONLY EXISTS TO SHORTEN THE LAP MAY NOT LENGTHEN IT. Without
      // this the rampart-first comparator turns a mobility search into a wall
      // sale: E17S9 walked for mobility, found a rung one rampart cheaper and
      // took it at 1.25 -> 2.0. A room walking for shallow structures or for
      // exhausted deep space is a different trade and keeps the old comparator.
      const mobilityRegression = !shallowWalk && !demandWalk && mobOf(p) > mobOf(win);
      if ((buysMobility || cheaperUpkeep(p, win) || freeMobilityWin) && !mobilityRegression) {
        win = p;
        winIdx = si;
      }
      // convex: the bill has started climbing again. A room still outside the
      // mobility target keeps walking anyway — the premium above can only be
      // spent by a rung we bothered to compose.
      //
      // ...AND THE CONVEXITY IS NOT EXACT, so the walk has one rung of patience.
      // The near-convexity argument (cut grows monotonically with needDeep while
      // personal ramparts fall, so the total is unimodal) is a tendency, not a
      // theorem: E11S6 and E17S6 both have a FLAT rung 1 and a strictly cheaper
      // rung 2 (28 ramparts against 36, eight personal ramparts deleted). They
      // used to reach it by accident, because the ungated lap read 1.5 and the
      // "still failing the target" escape hatch above kept the walk alive; the
      // moment this file started reading the gated lap the accident stopped and
      // they shipped nine shallow extensions each. The ladder has four rungs
      // total, so one rung of patience costs at most one extra compose in the
      // rooms that walk at all, and it is not an accident.
      if (noGain) noGainStreak++;
      else noGainStreak = 0;
      if (noGainStreak > NO_GAIN_PATIENCE && !(mobilityWalk && mobOf(win) > MOBILITY_TARGET)) break;
    }
  }
  win.meta.shellEscalation = {
    steps,
    walked: shallowWalk || mobilityWalk || demandWalk,
    why: { mobility: mobilityWalk, shallow: shallowWalk, demand: demandWalk },
    // the rung, reported as the offset it is (0 = the demand-aware base floor)
    pickedNeedDeepBonus: SHELL_ESCALATION[winIdx].needDeepBonus ?? 0,
    pickedNeedDeep: win.meta?.shell?.needDeep ?? null,
    saved: rampartsOf(first) - rampartsOf(win),
    mobilityFirst: mobOf(first),
    mobilityPicked: mobOf(win),
    // kept as colour on the report, never as a gate on the search — see above
    causeFirst: mobCauseOf(first),
  };
  return win;
}

/**
 * M5 — the escalation's price ceiling.
 *
 * Walking down the seed list moves the WHOLE hub, and the seeds below the
 * winner are ranked below it for a reason: they sit further from the
 * economy. E4S7 used to escalate to seedSkip 7 and buy its 60th extension
 * with a hub whose source paths summed to 61 (fleet median 27) and whose
 * controller path was 27 (median 11) — a permanent 2.5x hauler tax, paid
 * every trip, forever, to close a one-off checkbox.
 *
 * So a higher-seedSkip plan now has to earn the move twice: it must add
 * program pieces AND keep total hauler distance within ECO_TOLERANCE of
 * what the top-ranked seed managed. When nothing clears the bar we keep the
 * compact plan and report the shortfall honestly — meta.extensions.full is
 * allowed to be false. 60/60 is strongly preferred; it is not preferred at
 * any price.
 */
const ECO_TOLERANCE = 1.6;
const ecoCost = (p) => (p?.meta?.pathSourcesSum ?? 0) + (p?.meta?.pathController ?? 0);
const skipOf = (p) => p?.meta?.seedSkip ?? 0;

/** more of the program wins; on a tie take the cheaper wall */
function better(a, b, ecoCap) {
  if (!b) return true;
  const ga = grade(a),
    gb = grade(b);
  if (skipOf(a) > skipOf(b)) {
    // a moved the hub off the best seed — it must both improve the program
    // and stay inside the hauler-distance budget to be worth it
    if (ga.rank <= gb.rank) return false;
    if (ecoCap !== null && ecoCost(a) > ecoCap) return false;
    return true;
  }
  if (ga.rank !== gb.rank) return ga.rank > gb.rank;
  return ga.cut < gb.cut;
}

export function planRoom(d) {
  const t0 = performance.now();
  let best = null;
  let lastError = null;
  let ecoCap = null; // set from the skip-0 hub, if it produced one at all
  // every composition this room paid for, in order — the evidence a mobility
  // declaration has to carry (see attachRungProof)
  const trail = [];
  // one shell-negotiation memo per SEED. Every rung of the escalation ladder
  // re-asks layer 2 for the same candidates off the same layer-1 plan (see the
  // note on opts.shellCache); the memo is what stops the ladder from paying for
  // the same min-cut four times. Keyed by seed because a different seed is a
  // different hub, protect mask and basin.
  const shellCaches = new Map();
  const cacheFor = (seedSkip) => {
    let c = shellCaches.get(seedSkip);
    if (!c) shellCaches.set(seedSkip, (c = new Map()));
    return c;
  };
  const done = (p) => {
    if (p && p.meta) {
      attachRungProof(p, trail);
      p.meta.planMs = Math.round((performance.now() - t0) * 10) / 10;
      declareRuntime(p, trail);
    }
    return p;
  };
  for (let seedSkip = 0; seedSkip <= MAX_SEED_SKIP; seedSkip++) {
    for (let si = 0; si < SHELL_ESCALATION.length; si++) {
      const p = composePlan(d, { ...SHELL_ESCALATION[si], seedSkip, shellCache: cacheFor(seedSkip) });
      if (p.error) {
        lastError = p;
        break; // this seed is unusable — try the next one
      }
      trail.push(rungRecord(p, seedSkip, si));
      if (ecoCap === null && seedSkip === 0) ecoCap = ecoCost(p) * ECO_TOLERANCE;
      if (better(p, best, ecoCap)) best = p;
      // a complete plan only short-circuits if it is affordable; an
      // over-budget complete plan is not allowed to end the search either
      if (grade(p).complete && (ecoCap === null || ecoCost(p) <= ecoCap)) {
        // seedSkip > 0 runs exist to rescue 60/60 from a hub that already cost
        // us economy, so they do not go shopping for a cheaper wall — but they
        // DO owe the same proof as everybody else when they want to declare a
        // mobility miss, and minUpkeepShell is what walks the rungs. Its own
        // triggers decide whether anything is actually composed.
        return done(minUpkeepShell(d, p, si, ecoCap, seedSkip, trail, cacheFor(seedSkip)));
      }
      if (!p.shell) break; // no shell here — wider radii won't conjure one
    }
  }
  if (best) best.meta.ecoBudget = { cost: ecoCost(best), cap: ecoCap === null ? null : Math.round(ecoCap) };
  return done(best) || lastError;
}
