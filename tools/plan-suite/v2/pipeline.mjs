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
import { planShell, RADII_WIDE } from "./layer-shell.mjs";
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
  return plan;
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
const SHELL_ESCALATION = [
  {},
  { radii: RADII_WIDE, needDeep: 110 },
  { radii: RADII_WIDE, needDeep: 140 },
  { radii: [10, 11, 12, 13, 14], needDeep: 170 },
];
const MAX_SEED_SKIP = 8;

/**
 * M6 — the escalation also has to pay for itself in UPKEEP, not just in
 * checkboxes.
 *
 * The ladder above was written to answer one question: "can this room fit
 * the program at all?" A room that fits 60 extensions at the tightest shell
 * therefore stopped on the first try — and looked finished. It wasn't. The
 * default shell only guarantees NEED_DEEP=85 deep tiles, while the real
 * program wants ~129 (74 structures plus the road net that feeds them), so
 * around 35 rooms enclosed literally zero spare deep space and paid for the
 * shortfall in PERSONAL RAMPARTS: every extension, lab or tower forced onto
 * a depth<=3 tile buys its own rampart and repairs it forever.
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
 * The ladder itself is UNCHANGED, and that was measured rather than assumed.
 * Demand is ~129 deep tiles, so an intermediate { needDeep: 130 } rung looked
 * obvious — it isn't. Inserted, it wins 7 rooms off the 140 rung and buys the
 * fleet 2 ramparts (7523 -> 7521) and 7 shallow extensions, while adding 4 cut
 * tiles and pushing one more room's defender-mobility ratio over 1.0. That is
 * noise bought with a compose per escalating room. The reason 110 already
 * suffices: needDeep is a FLOOR on the negotiation, not a target — the shell
 * picks the smallest cut clearing it, and the cut that clears 110 in a real
 * room usually encloses 120-160 anyway. The rungs only have to be far enough
 * apart to change which cut wins.
 */
const ESCALATE_MIN = 3;

const rampartsOf = (p) => p?.meta?.counts?.rampart ?? 1e9;
const roadsOf = (p) => p?.meta?.counts?.road ?? 1e9;
const cutOf = (p) => p?.shell?.cut?.length ?? 1e9;

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
  return roadsOf(a) < roadsOf(b);
}

/**
 * Given the plan the pipeline would have shipped today, walk what is left of
 * the ladder and keep the cheapest. The hub is untouched (planHub reads only
 * seedSkip), so every candidate here has the exact same economy — this trades
 * wall for personal ramparts and nothing else.
 */
function minUpkeepShell(d, first, firstIdx, ecoCap) {
  let win = first;
  let winIdx = firstIdx;
  let steps = firstIdx + 1;
  if ((first.meta?.extensions?.shallow ?? 0) >= ESCALATE_MIN) {
    for (let si = firstIdx + 1; si < SHELL_ESCALATION.length; si++) {
      const p = composePlan(d, { ...SHELL_ESCALATION[si], seedSkip: 0 });
      steps++;
      if (p.error || !p.shell) break; // nothing wider will conjure a shell here
      if (!grade(p).complete) break; // a wider bubble that loses pieces is not a bargain
      if (ecoCap !== null && ecoCost(p) > ecoCap) break;
      const noGain = rampartsOf(p) >= rampartsOf(win);
      if (cheaperUpkeep(p, win)) {
        win = p;
        winIdx = si;
      }
      if (noGain) break; // convex: the bill has started climbing again
    }
  }
  win.meta.shellEscalation = {
    steps,
    pickedNeedDeep: SHELL_ESCALATION[winIdx].needDeep ?? null,
    saved: rampartsOf(first) - rampartsOf(win),
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
  let best = null;
  let lastError = null;
  let ecoCap = null; // set from the skip-0 hub, if it produced one at all
  for (let seedSkip = 0; seedSkip <= MAX_SEED_SKIP; seedSkip++) {
    for (let si = 0; si < SHELL_ESCALATION.length; si++) {
      const p = composePlan(d, { ...SHELL_ESCALATION[si], seedSkip });
      if (p.error) {
        lastError = p;
        break; // this seed is unusable — try the next one
      }
      if (ecoCap === null && seedSkip === 0) ecoCap = ecoCost(p) * ECO_TOLERANCE;
      if (better(p, best, ecoCap)) best = p;
      // a complete plan only short-circuits if it is affordable; an
      // over-budget complete plan is not allowed to end the search either
      if (grade(p).complete && (ecoCap === null || ecoCost(p) <= ecoCap)) {
        // seedSkip > 0 runs exist to rescue 60/60 from a hub that already
        // cost us economy — take the first plan that clears and stop paying.
        // Only the top seed, which every room reaches, is worth optimising.
        return seedSkip === 0 ? minUpkeepShell(d, p, si, ecoCap) : p;
      }
      if (!p.shell) break; // no shell here — wider radii won't conjure one
    }
  }
  if (best) best.meta.ecoBudget = { cost: ecoCost(best), cap: ecoCap === null ? null : Math.round(ecoCap) };
  return best || lastError;
}
