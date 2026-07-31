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
  plan.meta.shortfalls.push({
    gate: "eco",
    detail:
      `hauler distances in this room are a terrain verdict, not a preference: ${bits.join("; ")}. ` +
      `The hub sits at ${hub.x},${hub.y} on the only basin that holds the program — ${basin} tiles reachable ` +
      `from the seed, core pocket ${plan.meta.coreSize ?? "?"} — and the closer seats were rejected by the ` +
      `space budget or by the enclosure, not by the eco score. Capping this silently is the anti-pattern; ` +
      `the numbers are here so the trade can be argued with.`,
    tiles: [{ x: hub.x, y: hub.y }],
    eco: { pathController: pc, pathSourcesSum: ps, seedSkip: skip, basin },
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

const rampartsOf = (p) => p?.meta?.counts?.rampart ?? 1e9;
const roadsOf = (p) => p?.meta?.counts?.road ?? 1e9;
const cutOf = (p) => p?.shell?.cut?.length ?? 1e9;
const mobOf = (p) => p?.shell?.mobility?.max ?? 0;
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
 * How many extra ramparts a rung may cost when it is the rung that finally
 * brings the room inside the mobility target.
 *
 * Upkeep is still the first objective and a strictly-cheaper rung still wins on
 * its own merits — this is the ONLY way mobility is allowed to spend wall, and
 * it may only be spent to CLEAR the target, never to shave a ratio that stays
 * over it. Two tiles is the same premium layer 2 already pays internally
 * (MOBILITY_TIEBREAK_BUDGET), for the same reason: a garrison that can lap its
 * own wall is worth a couple of ramparts and is not worth twenty.
 */
const MOBILITY_PREMIUM = 2;

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
    const best = (mine.length ? mine : trail).reduce((b, r) => (r.mobility < b.mobility ? r : b));
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
      `. The best lap any of them measured is ${best.mobility} at ${best.ramparts} ramparts; ` +
      (best.mobility > MOBILITY_TARGET
        ? `no rung reaches the ${MOBILITY_TARGET} target at any price this room can pay`
        : `it was refused because clearing the target there costs more than the ` +
          `+${MOBILITY_PREMIUM}-rampart premium mobility is allowed to spend`) +
      `.`;
  }
  return plan;
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
      // ...with one bounded exception: the rung that actually CLEARS the target
      // may cost up to MOBILITY_PREMIUM extra ramparts. A wall the garrison can
      // lap is the difference between a defended perimeter and a decorated one,
      // and two tiles of it is a price the fleet can pay. Note this can only
      // fire while the incumbent is still failing — once a room is inside the
      // target, nothing here will pay a single rampart for a prettier ratio.
      const buysTheTarget =
        mobOf(win) > MOBILITY_TARGET &&
        mobOf(p) <= MOBILITY_TARGET &&
        rampartsOf(p) <= rampartsOf(win) + MOBILITY_PREMIUM;
      // A WALK THAT ONLY EXISTS TO SHORTEN THE LAP MAY NOT LENGTHEN IT. Without
      // this the rampart-first comparator turns a mobility search into a wall
      // sale: E17S9 walked for mobility, found a rung one rampart cheaper and
      // took it at 1.25 -> 2.0. A room walking for shallow structures or for
      // exhausted deep space is a different trade and keeps the old comparator.
      const mobilityRegression = !shallowWalk && !demandWalk && mobOf(p) > mobOf(win);
      if ((buysTheTarget || cheaperUpkeep(p, win) || freeMobilityWin) && !mobilityRegression) {
        win = p;
        winIdx = si;
      }
      // convex: the bill has started climbing again. A room still outside the
      // mobility target keeps walking anyway — the premium above can only be
      // spent by a rung we bothered to compose.
      if (noGain && !(mobilityWalk && mobOf(win) > MOBILITY_TARGET)) break;
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
