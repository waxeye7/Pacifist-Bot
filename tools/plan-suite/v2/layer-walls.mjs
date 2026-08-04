/**
 * Layer 7 — LATE ROADS (runs last, after extensions).
 *
 * OWNER DOCTRINE (supersedes the older "pave the whole wall ring" note that
 * used to live here): roads are MINIMAL AND PURPOSEFUL. "I don't need the
 * roads on ramparts and stuff, that's overkill — roads TO ramparts, that's
 * fine. Only build roads for remotes or to get to key locations."
 *
 * So this layer no longer paves the cut. A road on every rampart tile bought
 * defenders a 1-tick/tile lap at the price of ~50 road tiles per room —
 * tiles that decay, cost CPU to maintain and, at RCL8, are simply not what
 * the owner wants to see. What survives:
 *
 *   (1) SPURS — one road per rampart CLUSTER, running from the existing
 *       network out to a tile adjacent to that cluster. Defenders still ride
 *       roads to the wall; they walk the last tile onto it. Clusters already
 *       touched by an eco road cost nothing. Battlement metadata is untouched
 *       (layer 2 still marks the tiles the defenders hold).
 *
 *   (2) FILLER-FACE SAFETY NET — every extension must have a ROAD on a D4
 *       face (the validator hard-fails otherwise). Layer 6 now grows the
 *       extension mass along corridors, so this pass is expected to add
 *       almost nothing; it exists so a corner case can never ship an
 *       extension a filler has to cross plain terrain to reach.
 *
 *   (3) DEAD-END PRUNE — iteratively drop degree-1 road tiles that serve no
 *       structure, no room object and no rampart spur, until stable. This
 *       runs over the WHOLE network (every layer's roads), so a stitch tail
 *       that used to hang off the ring vanishes with the ring.
 *
 * Ordering: still last. Roads never block movement, so nothing earlier needs
 * to know about them, and the RCL road budget (PlanV2's priority-prefix
 * staging) keeps building eco roads first.
 *
 * DELIBERATE (m12): the eco roads that run OUTSIDE the shell — to source
 * containers and the controller link that the cut could not afford to
 * enclose — stay. An attacker gains one tick per tile on ground they were
 * going to cross anyway; our haulers pay that tick on every single trip for
 * the life of the room.
 *
 *   (0) MOBILITY VERIFICATION — measures the finished base's defender lap and
 *       reports it. It moves NOTHING. See the header on verifyMobility below
 *       for what used to live here and why it is gone.
 */
import { D4, D8, chebyshev, isSwamp, key, walkable } from "./shared.mjs";
import {
  BUILT_OBSTACLES,
  MOBILITY_TARGET,
  arriveAt,
  bfsField,
  builtMobility,
  interiorWalk,
  maskFromKeys,
  mobilityCauseDetail,
  mobilityLift,
  mobilityStats,
  pickBattlements,
} from "./layer-shell.mjs";
import { MAX_REFILL, REFILL_NOTE, TARGET_MIN, WEAK_SHELL_DMG, shellDamage } from "./layer-towers.mjs";
import { reflowExtensions } from "./layer-ext.mjs";

/** a 1-tile rampart in a crack is not a defensive position worth a road */
const MIN_CLUSTER = 2;
/** two shell-mobility readings that differ by less than this are the same claim */
const MATERIAL_SHELL_LAP = 0.25;
/** a spur longer than this is a hike, not an approach — leave it unpaved */
const MAX_SPUR = 14;

function idx(x, y) {
  return x + y * 50;
}
const round2 = (v) => Math.round(v * 100) / 100;

/**
 * ------------------------------------------------------------------------
 * MOBILITY VERIFICATION — "the attacker walks 10, I refuse to walk 20."
 * ------------------------------------------------------------------------
 *
 * WHAT USED TO BE HERE, AND WHY IT IS GONE. This was `breachCorridors`: it
 * measured the finished base's defender lap, found the wall pair the extension
 * mass had walled off, and RELOCATED one to four extensions out of the lane.
 * It worked — fleet as-built worst-pair mean 3.61 -> 2.92, 178 extensions moved
 * across 67 rooms — and it was the "repair-loop architecture" anti-pattern by
 * name: a layer fixing a previous layer's output instead of the previous layer
 * being corrected at the source. Its own header argued the fix was impossible
 * anywhere else, because the lap is a property of the FINISHED base.
 *
 * That argument was wrong. The lap cannot be KNOWN before the mass lands, but
 * it can be BOUNDED: the mass can only ever take tiles an extension is allowed
 * to stand on, so walking the interior with every one of those blocked at once
 * gives the worst base layer 6 could possibly build. Layer 6 now measures that
 * bound BEFORE it grows anything and reserves the defender's shortest lanes
 * until the bound is no worse than the lap the shell itself measured with no
 * mass in the room at all (see the lane header in layer-ext). Reserved tiles
 * are cut tiles as far as the mass is concerned; corridors may still pave them,
 * because a road does not block a creep.
 *
 * So there is nothing left to repair, and this pass does not repair. It
 * MEASURES: the mass-free lap (the floor this room's geometry allows), the
 * as-built lap, and how much of the gap between them our own mass owns. When
 * the as-built lap misses the target it declares — with both numbers, so a
 * reader can tell a shell/terrain verdict apart from a mass we chose to grow.
 * It relocates nothing, deletes nothing and re-sorts nothing.
 *
 * ------------------------------------------------------------------------
 * ...AND IT MEASURES THE WALL THE ROOM SHIPS, NOT THE WALL LAYER 2 BOUGHT.
 * ------------------------------------------------------------------------
 * This function used to flood against `plan.exterior` and walk with `cutSet`
 * as the wall. Both are layer-2 artefacts and both go stale, in the same
 * direction, for the same reason: layers 2-6 keep ADDING ramparts (eco
 * bubbles, lab cover, the mineral seat, personal ramparts under shallow
 * structures) and layer 7 both DELETES cut tiles (the inert prune) and ADOPTS
 * bubbles into the cut (reconcileSeal). Every one of those moves the exterior
 * flood and none of them moved `plan.exterior`.
 *
 * The consequence was not academic. E11S10's layer-7 prune took 7 inert tiles
 * and adopted 44,35 / 45,35, and the room ships a gated lap of 1.71 with a
 * 12-tile detour between 37,17 and 45,35. The planner MEASURED that itself
 * into meta.shell.mobilityShipped — but the declaration below fires off
 * `mBuilt.maxGated`, which was computed on the stale pair and read 0, so the
 * room declared nothing at all. A shortfall the planner has already computed
 * and then suppresses with its own stale metric is the "silent failure" the
 * goal document calls an auto-fail, and it is worse than never measuring.
 * Three more rooms (E1S8, E16S8, E9S5) disagreed with an independent
 * re-derivation for the milder version of the same reason — bubbles alone,
 * with no prune — and two of those declared a WORSE lap on a pair the shipped
 * plan does not exhibit.
 *
 * So the as-built reading is taken against the shipped wall: the exterior
 * flooded with EVERY rampart the room ships blocking it, and the interior
 * walked over that same rampart set (ramparts are walkable by their owner, so
 * a bubble is a tile the garrison may stand on exactly like a cut tile). The
 * endpoints stay the cut — that is what the wall IS, post-reconciliation —
 * and that is precisely the pairing remeasureShell already uses for
 * meta.shell.mobilityShipped. The two now agree by construction instead of by
 * luck, and `plan.shippedExterior` is computed once per room and shared.
 */
function verifyMobility(terrain, plan) {
  const cut = plan.shell.cut || [];
  const meta = {
    floor: 0,
    built: 0,
    over: 0,
    floorOver: 0,
    caused: 0,
    worstCaused: false,
    walled: 0,
    worst: null,
    lanes: plan.meta?.extensions?.laneMeta ?? null,
  };
  if (!cut.length || !plan.depth) return meta;

  // THE SHIPPED WALL, not layer 2's. See the header — `plan.exterior` and the
  // bare `cut` are both stale by the time this runs. shippedFlood() is
  // memoised on the plan, so the mass-free and as-built readings, the
  // remeasure above and layer-shell's builtMobility all share one flood.
  const { ext, rset: wallSet } = shippedFlood(terrain, plan);
  /** obstacles as the engine sees them; roads/containers/ramparts are not */
  const blockedBuilt = new Set(plan.objectTiles || []);
  const blockedFree = new Set(plan.objectTiles || []);
  for (const t of BUILT_OBSTACLES) {
    for (const p of plan.structures[t] || []) {
      blockedBuilt.add(key(p.x, p.y));
      if (t !== "extension") blockedFree.add(key(p.x, p.y));
    }
  }
  const wFree = interiorWalk(terrain, wallSet, ext, blockedFree, plan.sitter);
  const wBuilt = interiorWalk(terrain, wallSet, ext, blockedBuilt, plan.sitter);
  const freeMask = maskFromKeys(wFree);
  const mFree = mobilityStats(cut, ext, freeMask);
  const mBuilt = mobilityStats(cut, ext, maskFromKeys(wBuilt));

  meta.floor = mFree.max;
  meta.built = mBuilt.max;
  meta.over = mBuilt.over;
  meta.floorOver = mFree.over;
  // ...and the same three read against the detour floor (layer-shell's
  // MOBILITY_DETOUR_FLOOR): a pair the garrison loses by two tiles is recorded,
  // not declared. Both readings are kept — the raw one is the measurement, the
  // gated one is the verdict.
  meta.floorGated = mFree.maxGated;
  meta.builtGated = mBuilt.maxGated;
  meta.overGated = mBuilt.overGated;
  meta.floorOverGated = mFree.overGated;
  // ...and the RECORD's own worst, which the verdict is allowed to be quieter
  // than but never allowed to hide. See RANGED_RANGE in layer-shell.
  meta.maxDetour = mBuilt.maxDetour;
  meta.worstDetour = mBuilt.worstDetour;
  meta.maxStrict = mBuilt.maxStrict;
  meta.coveredPairs = mBuilt.coveredPairs;
  meta.maxCovered = mBuilt.maxCovered;
  meta.maxCoveredDetour = mBuilt.maxCoveredDetour;
  meta.worstCovered = mBuilt.worstCovered;
  // wall pairs the MASS pushed over the target — the only ones layers 6/7 own
  meta.caused = Math.max(0, mBuilt.over - mFree.over);
  meta.walled = cut.length - cut.filter((c) => wBuilt.has(key(c.x, c.y))).length;
  // THE BOUND, CHECKED — for every room, not only the ones that declare. Layer 6
  // claims the mass it lets in cannot lap worse than laneMeta.bounded; this is
  // the one place that has both numbers, so this is where the claim is audited.
  // plan.mjs turns `boundHeld === false` into a suite-level failure.
  {
    const lane = plan.meta?.extensions?.laneMeta;
    // a dropped reservation still leaves a bound behind — the unreserved run
    // measures its own, and that is the one this room actually has to hold
    const b = lane ? lane.bounded : null;
    meta.bound = b;
    // ------------------------------------------------------------------
    // THE BOUND IS AUDITED AGAINST THE WALL IT WAS PROMISED ABOUT.
    //
    // Layer 6's bound is a claim about THE MASS: "no arrangement of 60
    // extensions inside this enclosure laps worse than b". It is measured on
    // the enclosure layer 6 could see, which is layer 2's cut and layer 2's
    // exterior — layer 6 runs before the inert prune and before the seal
    // reconciliation, so it cannot be making a claim about a wall that does
    // not exist yet.
    //
    // When the as-built reading moved onto the SHIPPED wall (see the header),
    // this audit started comparing the two different walls and broke in four
    // rooms — E13S2, E15S3, E17S7 and E8S7 — none of which had grown a worse
    // mass. Layer 7 had moved their wall. Reporting that as "layer 6's model
    // of the mass is wrong" would have been a false accusation, and silently
    // widening the bound to make it pass would have been worse.
    //
    // So the audit is taken against the SHIPPED lap first, because that is the
    // number of record and the strict reading. Only when the shipped lap
    // exceeds the bound is the claim re-measured on layer 6's own enclosure,
    // to attribute the miss: if the layer-6 reading holds, layer 6's model of
    // the mass was right and layer 7 moved the wall underneath it, which is a
    // different fact and is already declared by the adopted-seal and
    // shipped-battery shortfalls. That lazy second measurement is also why
    // this is affordable — an unconditional all-pairs re-derivation on every
    // one of the 150 rooms that carry a bound cost the suite 20 seconds.
    if (b === null || b === undefined) {
      meta.boundHeld = null;
    } else if (mBuilt.maxGated <= b + 1e-9) {
      meta.boundHeld = true;
      meta.boundLap = mBuilt.maxGated;
    } else {
      const laneWall = interiorWalk(
        terrain,
        new Set(cut.map((c) => key(c.x, c.y))),
        plan.exterior,
        blockedBuilt,
        plan.sitter,
      );
      const mBuiltLane = mobilityStats(cut, plan.exterior, maskFromKeys(laneWall));
      meta.boundLap = mBuiltLane.maxGated;
      meta.boundHeld = mBuiltLane.maxGated <= b + 1e-9;
      meta.boundWallMoved = meta.boundHeld === true;
      meta.shippedVsBoundWall = round2(mBuilt.maxGated - mBuiltLane.maxGated);
    }
  }
  if (mBuilt.worstGated || mBuilt.worst) {
    const { a, b, din, dout } = mBuilt.worstGated || mBuilt.worst;
    // the same pair, walked with no mass at all: if THAT is inside the target
    // the detour is ours, and the reservation did not hold it.
    //
    // THE TEST IS GATED, and it was not always. It used to read
    //     freeDin / dout <= MOBILITY_TARGET
    // — the UNGATED ratio — while every other verdict in this file is taken
    // against the 4-tile detour floor (MOBILITY_DETOUR_FLOOR). That mismatch is
    // strictly one-directional and it lies in the flattering direction: a pair
    // that walks 7 free against 4 outside reads 1.75 ungated and is therefore
    // "not ours", when under the reading this room is actually judged on it is
    // not a detour at all (3 tiles, under the floor) and the room's mass-free
    // gated lap is a clean 0. Four rooms — E17S8, E21S10, E18S9, E19S4 — printed
    // "no arrangement of 60 extensions shortens it" about a lap that is 100%
    // ours by the only metric the gate uses. The free reading now clears the
    // same two hurdles the built one does before it is allowed to blame terrain.
    const freeDin = arriveAt(bfsField(freeMask, a), b);
    const freeOverGated =
      isFinite(freeDin) && freeDin - dout > mBuilt.detourFloor && freeDin / dout > MOBILITY_TARGET;
    // how many tiles of the worst walk our own structures added — the single
    // number the declaration is about, and the one that decides its wording
    const massAdds = isFinite(freeDin) ? din - freeDin : null;
    meta.worst = { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, din, dout, freeDin, massAdds };
    meta.massAdds = massAdds;
    meta.worstCaused = mBuilt.maxGated > MOBILITY_TARGET && isFinite(freeDin) && !freeOverGated;
  }

  // ------------------------------------------------------------------
  // THE LIFT TEST — see mobilityLift in layer-shell for why the old attribution
  // could not be trusted and what this replaces.
  //
  // In one sentence: `mFree` above lifts the EXTENSIONS and nothing else, so
  // four rooms told a reader "the enclosure and the terrain, not the mass" about
  // a miss caused entirely by our own observer (E16S5, one tile at 24,32) or our
  // own lab diamond (E12S3). Both of those are structures this planner chose the
  // position of; neither is an extension; and the sentence was therefore true
  // about the measurement and false about the room.
  //
  // The lift test asks the question a reader is actually asking — "is this the
  // terrain's fault or ours?" — by lifting everything of ours that is not the
  // mandated hub trio and the spawn fan, and re-running the WHOLE metric. It is
  // paid for only by rooms that miss the target, and it is the sole source of
  // both `meta.cause` and the sentence that reports it, so the two cannot
  // disagree the way they did in three of those four rooms.
  // ------------------------------------------------------------------
  const lift =
    mBuilt.maxGated > MOBILITY_TARGET
      ? mobilityLift(terrain, plan, cut, ext, wallSet, mBuilt.worstGated || mBuilt.worst || null)
      : null;
  if (lift) {
    meta.lift = {
      cause: lift.cause,
      clears: lift.clears,
      liftedLap: lift.liftedLap,
      liftedOverGated: lift.liftedOverGated,
      liftedGatedPairs: lift.liftedGatedPairs,
      classes: lift.classes,
      solo: lift.solo,
      present: lift.present,
      perClass: lift.perClass,
    };
  }

  // ------------------------------------------------------------------
  // ONE DECLARATION PER ROOM, BUILT FIRST.
  //
  // Two entries used to be filed for one question — layer 2's, about a mass-free
  // interior inside the enclosure it was negotiating, and this one, about the
  // room. 72 rooms shipped both, layer 2's first. The consequence is the round-8
  // headline: 33 rooms published the PRE-MASS lap as "the room's mobility", 23 of
  // them understating what the garrison actually walks; 17 published a cause
  // their own as-built metric contradicts; 9 published a tile pair the shipped
  // wall does not exhibit and one (E13S4) published a wall tile the room does not
  // have at all. Every one of those numbers was correct about the thing layer 2
  // measured, which is exactly why two entries was the wrong shape: a reader
  // asking "how far does my defender walk" has to be answered once.
  //
  // So the room declares once, here, on the board it ships, and layer 2's
  // measurement becomes the NEGOTIATION RECORD inside it — kept in full, because
  // the enclosure really was chosen on those numbers and deleting them would
  // hide the decision. The trigger is the union: this fires when the as-built lap
  // misses the target OR when the negotiation missed it, so a room whose mass
  // fixed a lap layer 2 could not still publishes the ladder it walked.
  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // WHAT WAS ATTEMPTED, BEFORE ANY OF THIS IS ALLOWED TO BE A DECLARATION.
  //
  // The old closing sentence was "Nothing is relocated to chase this number ...
  // a pass that moved finished structures to patch the result would be the
  // repair loop this planner is not allowed to have." That is a good rule about
  // an UNCONDITIONAL repair loop, and it was being used to excuse four rooms
  // whose own lift test named ONE sufficient class and a lifted lap of 0
  // (E12S3 1.69 [extension], E15S2 1.67 [extension], E17S8 1.31 [extension],
  // E4S8 1.50 [tower] — one tower, one tile). The rule now binds the other way:
  // when the lift test says the miss is ours, the planner has to try, and the
  // declaration has to say what the attempt cost.
  //
  //   THE BATTERY   layer 3 reads the lap the way layer 5 already read it for
  //                 the observer and the nuker, and swaps seats inside its own
  //                 non-negotiable price (weakest face and saturation exact).
  //                 meta.towers.mobilityVeto is that search.
  //   THE MASS      layer 7b's pass (2c) relocates extensions off the mass-free
  //                 route between the worst gated pair — capped, one-for-one,
  //                 deep and road-faced targets only, and ONLY when lifting the
  //                 whole mass clears the gate.
  //                 meta.extensions.reflow.mobilityRepair is that search.
  // ------------------------------------------------------------------
  const rep = plan.meta?.extensions?.reflow?.mobilityRepair || null;
  const tv = plan.meta?.towers?.mobilityVeto || null;
  const repairNote =
    ` WHAT WAS ATTEMPTED: ` +
    (!rep || !rep.ran
      ? `the extension mass was NOT relocated, and the room's own instrument is why — lifting every ` +
        `extension out of this room leaves the gated lap at ` +
        `${rep && rep.liftedLap !== null && rep.liftedLap !== undefined ? rep.liftedLap : "the same place"}, ` +
        `so the mass is not what is in the way and moving it would be chasing the number. `
      : rep.moved
        ? `layer 7b relocated ${rep.moved} extension(s) to buy this lap back — ${rep.lapBefore} before, ` +
          `${rep.lapAfter} after — over ${rep.rounds} round(s), ${rep.trials} legal one-for-one move(s) ` +
          `measured against the whole metric and not just the worst pair, every target deep and ` +
          `road-faced so not one rampart and not one extension slot was spent. `
        : `layer 7b TRIED and could not: lifting every extension clears this room (${rep.liftedLap}), so ` +
          `the mass owns the lap, and ${rep.rounds} round(s) examined the ${rep.blockersSeen} extension(s) ` +
          `standing on the mass-free route between the worst pair and measured ${rep.trials} legal ` +
          `relocation(s) of them onto deep road-faced floor. None shortened the gated lap. ` +
          `${rep.refused.length ? `The last refusal: ${rep.refused[rep.refused.length - 1].why}. ` : ""}`) +
    (tv && tv.checked
      ? tv.provedFree
        ? `The tower battery is provably free of this: blocking its six tiles cannot lengthen any interior ` +
          `walk — every pair of their walkable neighbours is already connected around them — so no seat of ` +
          `it is in the way. `
        : tv.breached
          ? `The tower battery DOES cost this room gated pairs — on layer 2's board the empty room reads ` +
            `${tv.baseLap} over ${tv.baseOver} over-target pair(s) and the battery takes it to ` +
            `${tv.lapWithBattery} over ${tv.overWithBattery}` +
            `${tv.lapWithBattery === tv.baseLap ? " (the same maximum, on more pairs)" : ""} — and layer 3 ` +
            `could not move it: ${tv.tried} single-slot swap(s) examined, ${tv.scoreTied} of them ` +
            `affordable on the weakest wall face and the saturation, ${tv.affordable} of those also ` +
            `non-worsening for the nuke window and the refill walk, and none cleared the gate. `
          : `The tower battery was measured against the lap and does not breach it (${tv.baseLap} over ` +
            `${tv.baseOver} pair(s) without it, ${tv.lapWithBattery} over ${tv.overWithBattery} with)` +
            `${tv.moved ? `, after ${tv.moved} seat(s) moved to keep it that way` : ""}. `
      : ``) +
    `Nothing else is relocated to chase this number: layer 6 reserves the defender's lanes before it ` +
    `grows, and an UNCONDITIONAL pass that moved finished structures to patch the result would be the ` +
    `repair loop this planner is not allowed to have. What is allowed is the bounded, lift-directed ` +
    `attempt above — bounded because the instrument that triggers it is a whole-room test this room ` +
    `publishes and a reader can re-run.`;
  const neg = plan.shell?.mobility?.negotiation || null;
  const negMissed = !!neg;
  if ((mBuilt.maxGated > MOBILITY_TARGET || negMissed) && plan.meta) {
    const worst = mBuilt.worstGated || mBuilt.worst || null;
    const { a, b, din, dout } = worst || {
      a: { x: 0, y: 0 },
      b: { x: 0, y: 0 },
      din: 0,
      dout: 0,
    };
    // ------------------------------------------------------------------
    // A BOUND IS ONLY A BOUND IF THE SHIPPED ROOM IS INSIDE IT.
    //
    // This sentence used to print "which bounds the worst mass this room could
    // grow at X" unconditionally, straight out of layer 6's meta, next to an
    // as-built lap that in 7 rooms EXCEEDED X — E4S7 claimed 1.5 and shipped 14.
    // A claim that the very next clause of the same paragraph refutes is worse
    // than no claim. The claim now has to hold to be printed, and when it does
    // not the declaration says so in those words. (After the layer-6 rewrite it
    // holds in 159/159; the branch stays because a bound nobody checks is how
    // the last one rotted, and plan.mjs asserts the same thing fleet-wide.)
    // ------------------------------------------------------------------
    const lane = plan.meta?.extensions?.laneMeta;
    const shrunkNote = lane?.shrunk
      ? ` The full reservation wanted ${lane.shrunk.wanted} tile(s); it was SHRUNK to ${lane.shrunk.to} round(s) ` +
        `because the whole of it cost more than the +${lane.shrunk.premium}-rampart premium this room's gain is priced at.`
      : "";
    // WHAT THE BOUND IS A CLAIM ABOUT, when the relocation pass lifted a stub.
    // The worst-case model reads a corridor stub as permanently walkable floor;
    // layer 6's relocation pass ends by standing extensions on some of them, so
    // the bound is re-derived over the corridor that actually SHIPS (see the
    // re-measure block at the end of layer-ext). Saying so here is the
    // difference between a bound and a bound-shaped number: E11S7 measured 11.5
    // before its five lifted stubs and 13.5 after, and shipped 13.5.
    const stubNote =
      lane?.stubsLifted && lane.boundBeforeStubs !== undefined && lane.boundBeforeStubs !== null
        ? ` This bound is measured over the corridor this room SHIPS: layer 6's relocation pass stood ` +
          `${lane.stubsLifted} extension(s) on tiles the worst-case model had read as permanent corridor ` +
          `stub, so the model was re-derived with them blocked — ${lane.boundBeforeStubs} before, ` +
          `${lane.bounded === null || lane.bounded === undefined ? "no finite bound" : lane.bounded} after.`
        : "";
    const laneNote = !lane
      ? ""
      : lane.dropped
        ? ` The lane reservation layer 6 wanted (${lane.wanted ?? lane.tiles} tile(s)) was DROPPED — for ` +
          `${
            lane.droppedFor === "extensions"
              ? "the 60th extension, which outranks the lap"
              : lane.droppedFor === "no-gain"
                ? `buying no measurable lap at all`
                : `${lane.cost} personal rampart(s), over the +${lane.premium} this room's gain of ${lane.gain} is priced at`
          }` +
          ` — the ${lane.wantedBound} it would have bounded this room at is NOT claimed here; what is claimed is ` +
          `${lane.bounded === null || lane.bounded === undefined ? "nothing, because the unreserved worst case still severs a battlement" : `${lane.bounded}, the bound the unreserved mass cannot exceed, against a shipped ${mBuilt.maxGated}`}.`
        : lane.bounded === null || lane.bounded === undefined
          ? ` Layer 6 reserved ${lane.tiles} lane tile(s) but measured no finite bound for this room.`
          : mBuilt.maxGated <= lane.bounded + 1e-9
            ? ` Layer 6 reserved ${lane.tiles} lane tile(s) (${lane.deep} deep) over ${lane.rounds} round(s) ` +
              `(${lane.strandRounds ?? 0} of them reattaching a battlement the worst case severed), which bounds the ` +
              `worst mass this room could grow at ${lane.bounded} — and the room shipped at ${mBuilt.maxGated}, inside it.` +
              stubNote +
              shrunkNote
            : ` THE RESERVATION FAILED TO HOLD: layer 6 reserved ${lane.tiles} lane tile(s) (${lane.deep} deep) over ` +
              `${lane.rounds} round(s) and measured a bound of ${lane.bounded}, and this room SHIPPED AT ` +
              `${mBuilt.maxGated}. The bound is wrong, not the room — a model of the mass that the mass beats is a ` +
              `defect in layer 6, and it is printed here rather than quietly dropped.` +
              shrunkNote;
    // ------------------------------------------------------------------
    // THE MASS SHARE, STATED. The old template offered a reader exactly one
    // bit — "our mass" or "not our mass" — and computed that bit with the
    // ungated ratio (see verifyMobility above), so 27 rooms whose own
    // structures add four tiles or more to the worst walk were told that no
    // arrangement of 60 extensions could shorten it. The declaration now
    // prints the measurement it is made of: the bare-terrain lap and the
    // as-built lap side by side, the same pair's two walks, and the
    // difference between them in tiles.
    //
    // ...AND A TILE COUNT IS NOT A SHARE. The branch below used to select on
    // `share >= 4` — an absolute number of tiles with no denominator — and in
    // six rooms it printed "this room's miss is substantially the structures
    // we chose to grow, not the enclosure and not the terrain" over its own
    // arithmetic. E9S9: the mass adds 4 tiles of a 37-tile walk, 11%. E11S7:
    // 4 of 27, 15%, in a room whose BARE enclosure already laps 11.5 against a
    // 1.2 target with not one extension standing in it. A four-tile add is a
    // large share of a nine-tile walk and a rounding error in a forty-tile
    // one; the same literal cannot mean both. The selector is now the
    // percentage that was already being computed and printed one clause later.
    //
    // ...AND THE ENCLOSURE OUTRANKS THE MASS WHEN THE ENCLOSURE ALREADY MISSED.
    // If the same pair is over target on bare terrain, then removing every
    // extension in the room does not fix it, and no wording that points the
    // next fix at the extension layer is honest — whatever the mass share is.
    // Those rooms now name the enclosure and the terrain as the primary cause
    // FIRST and report the mass as the aggravation it is. This is the same
    // fact `causedNote` states below; it used to be allowed to contradict the
    // sentence immediately preceding it.
    // ------------------------------------------------------------------
    const freeDin = meta.worst ? meta.worst.freeDin : null;
    const share = meta.worst ? meta.worst.massAdds : null;
    const pct = share !== null && din > 0 ? Math.round((share / din) * 100) : 0;
    /** share of the worst walk, in percent, above which the mass is the story */
    const MASS_SHARE_PCT = 30;
    /** ...and below which it is not a share at all */
    const MASS_MINOR_PCT = 10;
    // ------------------------------------------------------------------
    // WHO IS ALLOWED TO SAY "THE TERRAIN DID IT". Not this line any more.
    //
    // `meta.worstCaused` is a statement about the EXTENSION mass and one pair.
    // It was the selector for the sentence below, which is a statement about
    // every structure in the room — so E16S5 printed "THE PRIMARY CAUSE IS THE
    // ENCLOSURE AND THE TERRAIN, not the mass" over a miss that is one observer
    // tile, and E12S3 printed it over its own lab diamond. The selector is now
    // the lift test (see meta.lift above), which lifts every structure whose
    // position this planner chose and re-runs the whole metric: the enclosure
    // only gets the headline when the room misses WITHOUT any of our
    // freely-placed mass in it.
    // ------------------------------------------------------------------
    const liftClears = !!(lift && lift.clears);
    const bareAlreadyOver = share !== null && !liftClears;
    const massShare =
      share === null
        ? `THE MASS SHARE, measured: with the extension mass removed this pair is not connected at all, ` +
          `so every tile of this walk exists because of where we built.`
        : `THE MASS SHARE, measured: bare terrain — this same enclosure with every extension removed — ` +
          `laps ${mFree.maxGated} and that pair walks ${freeDin} inside; as built the room laps ` +
          `${mBuilt.maxGated} and the same pair walks ${din}. The mass adds ${share} tile(s) to the ` +
          `worst walk — ${pct}% of it` +
          (bareAlreadyOver
            ? `. THE PRIMARY CAUSE IS THE ENCLOSURE AND THE TERRAIN, not the mass: this pair is over ` +
              `target at ${round2(freeDin / dout)} with every extension removed, so deleting the whole ` +
              `mass leaves the room failing here. The ${share} tile(s) our structures add are an ` +
              `aggravation on top of a lap the room already owed` +
              (pct >= MASS_SHARE_PCT
                ? `, and at ${pct}% they are a large one — worth the extension layer's attention SECOND, ` +
                  `after the enclosure.`
                : `.`)
            : pct >= MASS_SHARE_PCT
              ? `. This room's miss is substantially the structures we chose to grow, not the enclosure ` +
                `and not the terrain — on bare terrain the same pair clears — and the lane reservation ` +
                `did not hold them.`
              : pct >= MASS_MINOR_PCT
                ? `: a real share, but the other ${freeDin} tiles are the enclosure and the terrain.`
                : `. The lap is the enclosure and the terrain, not the mass — no arrangement of 60 ` +
                  `extensions shortens it.`);
    // ...and WHY the bare-terrain reading clears, in the gate's own terms: a
    // pair is only judged when its absolute detour exceeds the floor, so
    // "clears" means one of two different things and the reader is told which.
    const freeDetour = share === null ? 0 : freeDin - dout;
    const causedWhy =
      freeDetour <= mBuilt.detourFloor
        ? `its detour there is ${freeDetour} tile(s), not over the ${mBuilt.detourFloor}-tile floor, so ` +
          `it is not a real detour at all`
        : `it reads ${round2(freeDin / dout)}, inside the ${MOBILITY_TARGET} target`;
    const causedNote =
      share === null
        ? ""
        : meta.worstCaused
          ? ` With every EXTENSION removed this pair CLEARS the gate — ${causedWhy} — so the room did ` +
            `not fail here until the mass grew into it.`
          : ` With every EXTENSION removed this pair still misses (${round2(freeDin / dout)} over ` +
            `${freeDetour} tile(s) of detour) — but "extensions" is not the same list as "our ` +
            `structures", and the sentence that used to stand here said the room "was over target ` +
            `before the first extension landed", which is a claim about a board that also had no labs, ` +
            `no towers, no nuker and no observer on it. See THE LIFT TEST below for the one that was ` +
            `actually asked.`;
    // ------------------------------------------------------------------
    // THE LIFT TEST, IN THE DECLARATION. Same numbers as meta.lift, and the
    // sole authority for the `cause` field on this entry.
    // ------------------------------------------------------------------
    const NAME = {
      extension: "the extension mass",
      tower: "the tower battery",
      lab: "the lab diamond",
      nuker: "the nuker",
      observer: "the observer",
    };
    const nameOf = (c) => NAME[c] || c;
    const liftNote = !lift
      ? ""
      : ` THE LIFT TEST: lift every structure whose position this planner chose — ` +
        `${lift.present.length ? lift.present.map(nameOf).join(", ") : "nothing, the room has none"} — ` +
        `leaving only the mandated hub trio and the spawn fan, and re-run the whole metric: the room ` +
        `laps ${lift.liftedLap} over ${lift.liftedOverGated}/${lift.liftedGatedPairs} judged pairs. ` +
        (lift.clears
          ? `THAT CLEARS THE ${MOBILITY_TARGET} TARGET, so this miss is OURS, not the terrain's` +
            (lift.solo.length
              ? ` — and ${lift.solo.length === 1 ? "one class does it alone" : "each of these does it alone"}: ` +
                `lifting ${lift.solo.map(nameOf).join(" or ")} and nothing else takes the room to ` +
                `${lift.solo.map((c) => lift.perClass[c]?.lap).join("/")}. That is where the next fix goes.`
              : lift.classes.length
                ? ` — no single class does it alone; the smallest set measured that does is ` +
                  `${lift.classes.map(nameOf).join(" + ")}.`
                : `.`)
          : `THAT STILL MISSES, so the enclosure and the terrain own this lap and no arrangement of the ` +
            `structures we place fixes it` +
            (lift.residual
              ? ` — with the interior's natural walls lifted as well the residual pair walks ` +
                `${lift.residual.dFree === null || !isFinite(lift.residual.dFree) ? "nowhere (it does not connect)" : lift.residual.dFree}, ` +
                `which is what makes the label "${lift.cause}".`
              : `.`));
    // ------------------------------------------------------------------
    // THE CAUSE, RE-DIAGNOSED ON THE ROOM THAT SHIPS.
    //
    // `mobility.cause` is layer 2's: measured on a mass-free interior, over
    // layer 2's exterior, about layer 2's worst pair. 17 rooms published "Cause:
    // terrain" while the same room's as-built metric records `structures`. The
    // arithmetic is identical (mobilityCauseDetail), only the board is not — the
    // shipped wall and the shipped worst pair — so both labels exist and each is
    // attached to the measurement it is true about.
    // ------------------------------------------------------------------
    const builtCause = worst
      ? mobilityCauseDetail(terrain, cut, ext, worst)
      : { cause: "none", dStruct: null, dFree: null };
    // THE LABEL COMES FROM THE LIFT TEST, NOT FROM THE PAIR WALKS. The two walks
    // below stay because they are genuinely informative about the worst pair,
    // and they are the evidence `causeLine` quotes — but the VERDICT is the
    // whole-room test, so the structured field and the prose above are the same
    // computation and can no longer contradict each other (they did, in three of
    // the four rooms that carried the false attribution).
    meta.cause = lift ? lift.cause : builtCause.cause;
    meta.causeWalks = { noStructures: builtCause.dStruct, noWalls: builtCause.dFree };
    meta.pairCause = builtCause.cause;
    const walkVerdict = (d) => {
      if (d === null || !isFinite(d)) return "does not connect at all";
      const detour = d - dout;
      const ratio = dout > 0 ? round2(d / dout) : 0;
      return detour <= 0
        ? `${d} against the attacker's ${dout} — SHORTER than the attacker's own lap, so it CLEARS ` +
            `the gate outright`
        : detour <= mBuilt.detourFloor
        ? `${d} against the attacker's ${dout} — a ${detour}-tile detour, inside the ` +
            `${mBuilt.detourFloor}-tile floor, so it CLEARS the gate`
        : ratio <= MOBILITY_TARGET
          ? `${d} against the attacker's ${dout} — ratio ${ratio}, inside the ${MOBILITY_TARGET} target, ` +
            `so it CLEARS the gate`
          : `${d} against the attacker's ${dout} — a ${detour}-tile detour at ratio ${ratio}, which is ` +
            `STILL OVER the ${MOBILITY_TARGET} target`;
    };
    const causeLine = worst
      ? ` CAUSE, as built: ${lift ? lift.cause : builtCause.cause} — the worst pair alone, for evidence: ` +
        `with every structure of ours lifted out it walks ${walkVerdict(builtCause.dStruct)}, and with ` +
        `the interior's natural walls lifted out as well it walks ${walkVerdict(builtCause.dFree)}.` +
        (lift && builtCause.cause !== lift.cause
          ? ` (That PAIR reads "${builtCause.cause}"; the room's verdict is the whole-metric lift test ` +
            `above, which is what the label states — a single pair can be fixed while the room still ` +
            `misses on another one.)`
          : ``)
      : "";
    // ------------------------------------------------------------------
    // THE NEGOTIATION RECORD — layer 2's declaration, demoted to evidence.
    //
    // It keeps every word it had, because the enclosure was really chosen on
    // these numbers and a record that is edited to agree with the outcome is not
    // a record. What it loses is the right to be the headline, and what it gains
    // is the two reconciliations it always needed: the same mass-free reading
    // taken over the wall the room SHIPS (layers 2-6 add bubble ramparts, layer 7
    // prunes and adopts), and the as-built lap above.
    // ------------------------------------------------------------------
    const ship = plan.shell?.mobilityShippedFree;
    const negLap = neg ? (plan.shell.mobility.maxGated ?? plan.shell.mobility.max) : null;
    const shipLap = ship ? (ship.maxGated ?? ship.max) : null;
    const negBlock = !neg
      ? ""
      : ` — · — THE ENCLOSURE NEGOTIATION, for the record: layer 2 chose this cut against an EMPTY ` +
        `interior (object tiles, the hub trio and the links, nothing else), and what it measured there is ` +
        `not what the garrison walks — it is the evidence the enclosure was bought on. Verbatim: "` +
        neg.detail +
        `"` +
        (shipLap !== null
          ? ` RE-DERIVED ON THE SHIPPED WALL with that same mass-free walk, the negotiated lap of ` +
            `${round2(negLap)} reads ${round2(shipLap)} over ` +
            `${ship.overGated ?? ship.over}/${ship.gatedPairs ?? ship.pairs} real-detour pairs` +
            (Math.abs(round2(negLap) - round2(shipLap)) >= MATERIAL_SHELL_LAP
              ? `. THOSE DISAGREE MATERIALLY: the trade layer 2 priced was priced against an incumbent ` +
                `lap this room does not have. The reasoning stands because it is what was decided; the ` +
                `number is corrected here rather than quietly overwritten.`
              : `, which agrees with it to within ${MATERIAL_SHELL_LAP} of a lap.`)
          : ".") +
        ` The as-built figure at the top of this declaration is the one that describes this room.`;
    plan.meta.shortfalls = plan.meta.shortfalls || [];
    plan.meta.shortfalls.push({
      gate: "mobility",
      // ONE entry. `source: "built"` says which board the headline is taken on;
      // `negotiated` is what attachRungProof looks for when it staples the
      // escalation ladder underneath (a room whose enclosure never missed the
      // target composed no rungs to show).
      source: "built",
      negotiated: negMissed
        ? {
            lap: round2(negLap),
            cause: plan.shell.mobility.cause,
            tiles: neg.tiles,
            metric: neg.metric,
            shippedWallLap: shipLap === null ? null : round2(shipLap),
          }
        : null,
      // ONE COMPUTATION BEHIND BOTH. See meta.lift and `liftNote`: this field
      // and the sentence that reports it are the same test, so the round-8/9
      // failure — `cause: "structures"` sitting inside a declaration whose prose
      // says "not the mass" — cannot recur.
      cause: lift ? lift.cause : builtCause.cause,
      lift: lift
        ? {
            clears: lift.clears,
            liftedLap: lift.liftedLap,
            liftedOverGated: lift.liftedOverGated,
            liftedGatedPairs: lift.liftedGatedPairs,
            classes: lift.classes,
            solo: lift.solo,
          }
        : null,
      detail:
        (mBuilt.maxGated > MOBILITY_TARGET
          ? `AS BUILT the defender lap is ${mBuilt.maxGated} over pairs costing more than ` +
            `${mBuilt.detourFloor} tiles of detour (target ${MOBILITY_TARGET}; ungated over every pair it is ` +
            `${mBuilt.max})`
          : `AS BUILT the defender lap is ${mBuilt.maxGated} over pairs costing more than ` +
            `${mBuilt.detourFloor} tiles of detour, INSIDE the ${MOBILITY_TARGET} target (ungated over ` +
            `every pair it is ${mBuilt.max}) — this room is declared because the enclosure it was ` +
            `negotiated from was not, and the ladder that priced it is stapled below`) +
        (worst
          ? `: between wall tiles ${a.x},${a.y} and ${b.x},${b.y} the garrison walks ${din} inside while ` +
            `the attacker walks ${dout} outside. `
          : `: no pair of wall tiles detours far enough to be judged, so there is no worst pair to name. `) +
        (worst ? `${massShare}${causedNote}${liftNote}${causeLine} ` : `${liftNote} `) +
        `${mBuilt.overGated}/${mBuilt.gatedPairs} real-detour wall pairs are over target against ` +
        `${mFree.overGated} with no mass in the room (ungated: ${mBuilt.over}/${mBuilt.pairs} against ` +
        `${mFree.over}).${laneNote}${repairNote}` +
        negBlock,
      tiles: worst
        ? [
            { x: a.x, y: a.y },
            { x: b.x, y: b.y },
          ]
        : [],
      mass: { adds: share, bareLap: mFree.maxGated, builtLap: mBuilt.maxGated, bareDin: freeDin, din, dout },
    });
  }

  // ------------------------------------------------------------------
  // THE PAIR THE VERDICT EXCUSED — declared when it is worse than the verdict.
  //
  // `coversStands` (layer-shell, RANGED_RANGE) excuses a pair of wall tiles when
  // a defender standing on either one already covers every exterior tile an
  // attacker can stand on to grind the other: he answers the grind without
  // walking, so the lap is not repositioning work. That argument is sound and it
  // is not the whole truth, because the garrison still has to make that walk to
  // CONSOLIDATE — and until round 10 the pair was deleted before a single
  // statistic was accumulated, so E7S5 shipped `max 1.5 · maxDetour 1 · cause
  // "none"` and no shortfall at all over the worst pair in the fleet: 35 tiles
  // inside against 2 outside, an absolute detour of 33 at a ratio of 17.5.
  //
  // The exclusion stays (it is the right rule for the gate) and the silence
  // does not. When the excused pair is over target, over the detour floor, AND
  // worse than anything the verdict judged, the room says so in its own
  // declaration with both walks, the lift test that says whose fault it is, and
  // the coverage argument that says why it is not gated.
  // ------------------------------------------------------------------
  const cov = mBuilt.worstCovered;
  if (
    plan.meta &&
    cov &&
    cov.detour > mBuilt.detourFloor &&
    cov.ratio > MOBILITY_TARGET &&
    cov.ratio > mBuilt.maxGated + 1e-9
  ) {
    const cd = mobilityCauseDetail(terrain, cut, ext, cov);
    const covLift = mobilityLift(terrain, plan, cut, ext, wallSet, cov);
    const say = (d) =>
      d === null || !isFinite(d) ? "does not connect at all" : `${d}`;
    plan.meta.shortfalls = plan.meta.shortfalls || [];
    plan.meta.shortfalls.push({
      gate: "mobility",
      kind: "covered-detour",
      cause: covLift.cause,
      detail:
        `THE WORST PAIR ON THIS WALL IS NOT THE PAIR THE GATE JUDGED, and this is the room saying so. ` +
        `Between cut tiles ${cov.a.x},${cov.a.y} and ${cov.b.x},${cov.b.y} — chebyshev ` +
        `${Math.max(Math.abs(cov.a.x - cov.b.x), Math.abs(cov.a.y - cov.b.y))} apart — the garrison walks ` +
        `${cov.din} inside while the attacker walks ${cov.dout} outside: an absolute detour of ${cov.detour} ` +
        `tiles at a ratio of ${cov.ratio}, against a ${MOBILITY_TARGET} target. ` +
        `WHY IT IS NOT GATED: a RampartDefender's ranged attack reaches 3, and every exterior tile an ` +
        `attacker can stand on to grind either of these two is inside that reach from the other, so nobody ` +
        `has to make this walk to ANSWER a grind — he shoots from where he stands. The walk is real ` +
        `anyway: it is what consolidating the garrison onto one of these two tiles costs. ` +
        `THE VERDICT, for contrast: over the ${mBuilt.gatedPairs} pair(s) this room's gate does judge ` +
        `(absolute detour over the ${mBuilt.detourFloor}-tile floor, not mutually covered) the lap is ` +
        `${mBuilt.maxGated}${mBuilt.maxGated > MOBILITY_TARGET ? ", which is over target and declared above" : ", inside the target"}. ` +
        `${mBuilt.coveredPairs} of this wall's ${mBuilt.pairs} pairs are excused by coverage; this is the ` +
        `worst of them. ` +
        `WHOSE FAULT: lift every structure whose position this planner chose ` +
        `(${covLift.present.length ? covLift.present.join(", ") : "none — the room has none"}) and re-run the ` +
        `whole metric — the room laps ${covLift.liftedLap}, and this same pair walks ` +
        `${say(cd.dStruct)} with our structures out of the way and ${say(cd.dFree)} with the interior's ` +
        `natural walls lifted out as well. ` +
        (cd.dStruct !== null && isFinite(cd.dStruct) && cd.dStruct >= cov.din
          ? `Our mass adds NOTHING to it: the enclosure and the terrain own every tile of this walk, and no ` +
            `arrangement of the structures we place shortens it by one step. ` +
            (cd.dFree !== null && isFinite(cd.dFree) && cd.dFree * 2 <= cov.din
              ? `Letting the garrison walk THROUGH the interior's natural walls takes the same pair to ` +
                `${cd.dFree}, so what is between these two tiles is a mountain: the only thing that could ` +
                `shorten this walk is a different cut, one that goes round it instead of across it.`
              : `Even with the interior's natural walls lifted the pair walks ` +
                `${cd.dFree === null || !isFinite(cd.dFree) ? "nowhere — it does not connect" : cd.dFree}, ` +
                `so this is the shape of the enclosure itself and not one obstacle in it.`) +
            ` Layer 2 negotiated this enclosure on ramparts, and it is not offered the lap of a pair no ` +
            `defender has to walk to answer a grind.`
          : `Our mass adds ${cov.din - cd.dStruct} tile(s) of it; the remaining ${cd.dStruct} are the ` +
            `enclosure and the terrain.`),
      tiles: [
        { x: cov.a.x, y: cov.a.y },
        { x: cov.b.x, y: cov.b.y },
      ],
      record: {
        din: cov.din,
        dout: cov.dout,
        detour: cov.detour,
        ratio: cov.ratio,
        gatedLap: mBuilt.maxGated,
        coveredPairs: mBuilt.coveredPairs,
        pairs: mBuilt.pairs,
        liftedLap: covLift.liftedLap,
        noStructures: cd.dStruct === null || !isFinite(cd.dStruct) ? null : cd.dStruct,
        noWalls: cd.dFree === null || !isFinite(cd.dFree) ? null : cd.dFree,
      },
    });
    meta.coveredDetourDeclared = true;
  }
  return meta;
}

/**
 * ------------------------------------------------------------------------
 * INERT RAMPARTS — layer 2's exact-removal test, re-run on the FINISHED wall.
 * ------------------------------------------------------------------------
 *
 * WHY IT HAS TO RUN AGAIN HERE. Layer 2 already deletes cut tiles whose removal
 * changes nothing measurable, and its fast reject is sound: a reachable cut tile
 * that FACES the exterior turns into exterior the moment it is deleted, so it can
 * never pass. The trouble is that "faces the exterior" is a property of the wall
 * as it stood at layer 2 — and layers 2 through 6 keep ADDING ramparts to it.
 * Every bubble around an eco work and every personal rampart under a shallow
 * structure shrinks the exterior flood, and a cut tile that was load-bearing
 * against the bare cut can end up sitting behind two other ramparts by the time
 * the room is finished. E11S10 shipped SEVEN of its twenty cut tiles that way —
 * a third of its wall, 0.21 e/tick, defending nothing — and every one of them was
 * correctly refused at layer 2.
 *
 * So the test runs once more, last, over the whole rampart list, to a fixpoint:
 *
 *   SEAL + DEPTHS + INTERIOR  delete it, re-flood, and keep the deletion only if
 *      every tile the base can walk and every structure it owns has exactly the
 *      exterior flag and the chebyshev depth it had, and the walk region itself
 *      is unchanged. Safety, tower cover and bubble decisions are all functions
 *      of those two numbers.
 *   PROTECTION  ...and a rampart that is somebody's personal cover is not inert
 *      no matter what the flood says. A shallow extension's rampart is not part
 *      of the seal at all, so deleting it moves nothing — and leaves a structure
 *      inside a ranged attacker's reach. Any rampart sharing a tile with an owned
 *      structure that is not at DEPTH_SAFE is held, unconditionally.
 *
 * "No double shell" is a hard gate, so this is a fixpoint and not one pass: each
 * deletion can expose the next (E11S10's seven come off in seven rounds).
 *
 * ------------------------------------------------------------------------
 * ROUND-5 REGRESSION AND THE KEEP-CLASSES THAT FIX IT
 * ------------------------------------------------------------------------
 * The keep-test above values a rampart ONLY for what it does to our own
 * STRUCTURES, and a whole class of rampart does not defend a structure at all.
 * The controller's adjacent ring defends a room OBJECT: it denies an attacking
 * claim/attack creep the only tiles it can stand on. Delete one and no depth
 * moves, no structure changes flag, the walk region is identical — the test
 * passes cleanly, and it passed 161 times across 66 rooms, deleting 161 of this
 * pass's 173 deletions and reopening every ring the goal document mandates
 * ("controller outside the wall: rampart ONLY its adjacent ring — denies
 * claim-attack stands").
 *
 * The fix is not to weaken the removal test — it is exact and it is what keeps
 * E11S10's seven inner double-wall tiles gone. It is to say out loud which
 * ramparts this pass has no licence over:
 *
 *   (a) THE CONTROLLER'S RING. Every walkable tile D8-adjacent to the
 *       controller. Unconditional: an enemy claim creep standing there is a
 *       threat whether or not the shell happens to enclose the controller,
 *       and the ring is the owner's stated defence against it.
 *   (b) ANY DECLARED STAND-DENIAL TILE (plan.shell.standDenial) — the same
 *       ring, named by the layer that placed it, so the intent survives a
 *       refactor that moves the geometry.
 *   (c) EVERY DECLARED BUBBLE (plan.shell.bubble). This pass's licence is over
 *       the CUT — the doubled min-cut wall layer 2 could not see it had bought.
 *       A bubble is a deliberate purchase with a named beneficiary; if one is
 *       genuinely redundant, layer 2's addBubble already refuses to buy it
 *       (inside AND at DEPTH_SAFE ⇒ not added). Re-litigating that decision
 *       here, with a test that cannot see the beneficiary, is how the ring was
 *       lost. plan.shell.bubble is therefore never scrubbed either: a
 *       declaration this pass may not act on is a declaration it may not edit.
 *
 * ------------------------------------------------------------------------
 * ...AND THE PRUNE MAY NOT MOVE THE WALL, ONLY SHRINK IT
 * ------------------------------------------------------------------------
 * Measured at HEAD: before this pass runs, the layer-2 cut is a complete and
 * correct seal in all 159 rooms and NOT ONE rampart outside it is load-bearing.
 * After it runs, four rooms (E11S10, E1S8, E11S3, E12S4) have a seal that
 * partly rests on tiles that were bought as bubbles. The mechanism is subtle
 * and the removal test is blameless: deleting a genuinely doubled inner wall
 * merges a walled-off lobe into the sitter's region, and the lobe's own eco
 * bubbles — a source container, a controller ring, and in two rooms a LINK —
 * become the wall on that side. Nothing measurable moved, so the test passed.
 *
 * What moved is who is holding the line, and it is a real downgrade, not a
 * bookkeeping one. E11S10 traded 7 ramparts of inner wall (0.21 e/tick) for a
 * seal whose weakest tile is a source link 19 tiles from the battery: 1380
 * damage instead of 2670, on a tile that is an OBSTACLE_OBJECT_TYPE so no
 * defender or repairer can ever stand on it. E1S8 does the same to its
 * controller link. Neither was visible, because every shell metric is computed
 * over `cut` and neither link was in `cut`.
 *
 * REFUSING THE DELETION WAS TRIED FIRST AND IS THE WRONG FIX. Making promotion
 * a veto is one line and it does hold the weakest face at 2670 — by keeping all
 * seven of E11S10's inner double-wall tiles, which are exactly the waste this
 * pass exists to delete and which the goal document names as waste. Fleet-wide
 * the veto resurrected every promoting deletion in all four rooms. Buying back
 * a doubled wall to make a number look better is the anti-pattern, not the fix.
 *
 * So the deletion STANDS, and the fact that it moved the wall is carried
 * forward instead of vanishing: `inertPromoted` counts it, reconcileSeal below
 * adopts whatever is actually holding the line into meta.shell.cut, every
 * cut-shaped metric is re-derived over the union, and the room declares the
 * result — including, in E11S10 and E1S8, a link on the seal and a weakest
 * sealing face well under what layer 3 was told it had. The wall is allowed to
 * move; it is not allowed to move quietly.
 */
const DEPTH_SAFE = 4;
const idxOf = (x, y) => x + y * 50;

/**
 * ------------------------------------------------------------------------
 * THE SHIPPED WALL — one flood, one definition, every consumer.
 * ------------------------------------------------------------------------
 * `plan.exterior` is layer 2's: the flood against the min-cut ring alone,
 * before a single eco bubble, lab cover, mineral seat or personal rampart
 * existed, and before layer 7's prune deleted cut tiles or reconcileSeal
 * adopted bubbles into the cut. Every one of those changes the exterior, and
 * none of them wrote it back. Four rooms shipped an as-built mobility reading
 * taken on a wall they do not have, and one of them (E11S10) used that reading
 * to suppress a shortfall it had already measured — see verifyMobility.
 *
 * This is the wall the room actually ships: EVERY rampart in plan.structures,
 * flooded from the four edges. It is memoised on the plan and invalidated by
 * hand whenever layer 7 changes the rampart list (the prune and the
 * reconciliation are the only two things that can), so nothing downstream has
 * to remember to recompute it and nothing recomputes it 159 times either.
 *
 * plan.exterior is deliberately NOT overwritten. It is what layer 2 decided
 * against, several later measurements are legitimately attributed to it, and
 * silently redefining a field half the pipeline reads is how this bug got
 * here. The stale one keeps its name; the shipped one gets its own.
 */
function shippedFlood(terrain, plan) {
  const ramp = plan.structures.rampart || [];
  if (plan._shipped && plan._shipped.n === ramp.length && plan._shipped.stamp === plan._shippedStamp) {
    return plan._shipped;
  }
  const rset = new Set(ramp.map((r) => key(r.x, r.y)));
  const ext = exteriorFlood(terrain, rset);
  plan._shipped = { rset, ext, n: ramp.length, stamp: plan._shippedStamp };
  plan.shippedExterior = ext;
  return plan._shipped;
}
/** call after anything mutates plan.structures.rampart under layer 7 */
function invalidateShippedFlood(plan) {
  plan._shippedStamp = (plan._shippedStamp || 0) + 1;
  plan._shipped = null;
}

function exteriorFlood(terrain, rampartSet) {
  const e = new Uint8Array(2500);
  const q = [];
  for (let i = 0; i < 50; i++) {
    for (const [x, y] of [
      [i, 0],
      [i, 49],
      [0, i],
      [49, i],
    ]) {
      if (!walkable(terrain, x, y) || rampartSet.has(key(x, y))) continue;
      const ii = idxOf(x, y);
      if (!e[ii]) {
        e[ii] = 1;
        q.push(ii);
      }
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % 50,
      y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      if (!walkable(terrain, nx, ny) || rampartSet.has(key(nx, ny))) continue;
      const ni = nx + ny * 50;
      if (e[ni]) continue;
      e[ni] = 1;
      q.push(ni);
    }
  }
  return e;
}
function depthFromExterior(e) {
  const depth = new Int16Array(2500).fill(999);
  const q = [];
  for (let i = 0; i < 2500; i++) {
    if (e[i]) {
      depth[i] = 0;
      q.push(i);
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % 50,
      y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = nx + ny * 50;
      if (depth[ni] <= depth[i] + 1) continue;
      depth[ni] = depth[i] + 1;
      q.push(ni);
    }
  }
  return depth;
}

/**
 * The garrison side of the seal: every walkable, un-ramparted tile the sitter
 * can reach without crossing a rampart. Mirror image of exteriorFlood — the two
 * are disjoint exactly when the enclosure holds.
 */
function insideFlood(terrain, rampartSet, sitter) {
  const inside = new Uint8Array(2500);
  const s = idxOf(sitter.x, sitter.y);
  if (!walkable(terrain, sitter.x, sitter.y) || rampartSet.has(key(sitter.x, sitter.y))) return inside;
  inside[s] = 1;
  const q = [s];
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi],
      x = i % 50,
      y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      if (!walkable(terrain, nx, ny) || rampartSet.has(key(nx, ny))) continue;
      const ni = nx + ny * 50;
      if (inside[ni]) continue;
      inside[ni] = 1;
      q.push(ni);
    }
  }
  return inside;
}

/**
 * SEAL-CRITICAL, IN TWO FLOODS INSTEAD OF ONE PER TILE.
 *
 * A rampart T is seal-critical exactly when deleting T alone lets the exterior
 * reach the sitter. Deleting T changes ONE tile's passability, so any new path
 * from the sitter to the outside must run through T — entering from a tile of
 * the garrison region and leaving to a tile of the exterior. So:
 *
 *     T is seal-critical  ⟺  T is walkable terrain
 *                         ∧  some D8 neighbour of T is in the inside flood
 *                         ∧  some D8 neighbour of T is in the exterior flood
 *
 * Both directions hold: the forward one because those two neighbours give the
 * path, the reverse because T is the only tile whose state changed. This is
 * exact, not a screen, and it replaces |ramparts| floods per query with two —
 * which is what makes the invariant affordable inside the prune's fixpoint
 * (the brute-force form cost the suite 13 seconds).
 */
function sealCriticalSet(terrain, rampartSet, ext, inside) {
  const out = [];
  for (const k of rampartSet) {
    const [x, y] = k.split(",").map(Number);
    if (!walkable(terrain, x, y)) continue; // a rampart on rock opens nothing
    let touchIn = false;
    let touchOut = false;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = nx + ny * 50;
      if (inside[ni]) touchIn = true;
      else if (ext[ni]) touchOut = true;
      if (touchIn && touchOut) break;
    }
    if (touchIn && touchOut) out.push({ x, y });
  }
  return out;
}

/**
 * True when, with `dropped` deleted, some rampart OUTSIDE the declared cut is
 * single-handedly keeping the exterior off the sitter — i.e. this deletion has
 * turned somebody's bubble into wall. See the invariant in the header.
 */
function promotesOutsider(terrain, set1, dropped, cutKeys, ext1, sitter) {
  const inside = insideFlood(terrain, set1, sitter);
  for (const c of sealCriticalSet(terrain, set1, ext1, inside)) {
    const k = key(c.x, c.y);
    if (k === dropped || cutKeys.has(k)) continue;
    return true;
  }
  return false;
}

function pruneInertRamparts(terrain, plan) {
  const removed = [];
  let ramp = plan.structures.rampart || [];
  if (!ramp.length) return removed;
  // engine obstacles, so the walk region is the one the garrison really has
  const blocked = new Set(plan.objectTiles || []);
  for (const t of BUILT_OBSTACLES) {
    for (const p of plan.structures[t] || []) blocked.add(key(p.x, p.y));
  }
  // every tile that carries something of ours, and whether it needs cover
  const ownTiles = new Set();
  for (const t of Object.keys(plan.structures)) {
    if (t === "rampart" || t === "road") continue;
    for (const p of plan.structures[t] || []) ownTiles.add(key(p.x, p.y));
  }
  // KEEP-CLASSES — ramparts this pass has no licence over. See the header.
  const keep = new Set();
  if (plan.controller) {
    for (const [dx, dy] of D8) {
      const x = plan.controller.x + dx,
        y = plan.controller.y + dy;
      if (walkable(terrain, x, y)) keep.add(key(x, y)); // (a) the ring
    }
  }
  for (const p of plan.shell?.standDenial || []) keep.add(key(p.x, p.y)); // (b)
  for (const p of plan.shell?.bubble || []) keep.add(key(p.x, p.y)); // (c)
  // THE WALL WE BOUGHT, and the sitter the seal is defined against. A rampart
  // outside this set is somebody's bubble; the invariant below says it may not
  // be turned into wall by anything this pass does.
  const cutKeys = new Set((plan.shell?.cut || []).map((c) => key(c.x, c.y)));
  let promoted = 0; // deletions that handed a piece of the seal to a bubble
  // WHY EACH SURVIVOR SURVIVED. The reviewer's standing complaint about this
  // pass was not that it kept the wrong tiles — it is that `uselessCut` was
  // `[]` in all 159 rooms and NOTHING said why, so a reader had to re-derive
  // the whole removal test to find out whether a redundant-looking rampart was
  // load-bearing or just unexamined. Every refusal is recorded with the tile
  // that caused it, the last round's verdict winning (the wall it was judged
  // against is the wall the room ships). noteRedundantCut turns it into prose.
  const refusals = new Map();
  const refuse = (k, why) => refusals.set(k, why);
  for (let guard = 0; guard < 200; guard++) {
    refusals.clear();
    const set0 = new Set(ramp.map((r) => key(r.x, r.y)));
    const ext0 = exteriorFlood(terrain, set0);
    const dep0 = depthFromExterior(ext0);
    const walk0 = interiorWalk(terrain, set0, ext0, blocked, plan.sitter);
    const hold = new Set(walk0);
    for (const k of ownTiles) hold.add(k);
    // the layer-2 fast reject, still exactly right and still what makes this
    // affordable: a reachable rampart facing the exterior becomes exterior
    const facesExterior = (r) =>
      D8.some(([dx, dy]) => {
        const x = r.x + dx,
          y = r.y + dy;
        return x >= 0 && y >= 0 && x <= 49 && y <= 49 && ext0[idxOf(x, y)];
      });
    // ------------------------------------------------------------------
    // OUTER DOMINATED WALL — the class the fast reject above cannot see.
    //
    // The reject "a reachable rampart facing the exterior becomes exterior"
    // is true, and for a whole class of wall it is also HARMLESS. A rampart
    // whose every walkable D8 neighbour is already exterior-or-rampart is
    // wall standing in front of other wall: delete it and the exterior gains
    // exactly one tile — its own — and reaches nothing new, because there is
    // nothing behind it that was not already outside or already walled.
    //
    // 23 such tiles shipped across 11 rooms (E21S8 32,11 32,12 33,12 34,12
    // 34,13 · E8S5 31,4 32,2 32,3 32,4 · E16S4 47,24 47,25 47,26 · E20S5
    // 13,3 14,3 15,3 · E20S0 17,6 18,7 · E16S0 38,31 · E18S8 12,20 · E13S10
    // 32,37 · E17S0 30,47 · E17S1 38,19 · E21S2 34,5), every one of them a
    // rampart of forever-upkeep defending nothing, and 17 of them carrying
    // battlement metadata — defenders told to stand on wall that need not
    // exist. Deleting all 23 at once was verified to hold the seal, hold
    // every structure at depth >= 4 and hold the controller ring, and it
    // DROPS the exposed wall face by 8 tiles / 29 adjacencies.
    //
    // The old test could never reach them for two independent reasons and
    // both are relaxed here, precisely:
    //   1. the fast reject fired first — so the screen below runs instead,
    //      and it is EXACT rather than conservative: if T had a walkable
    //      non-rampart interior neighbour, that neighbour would join the
    //      exterior when T went, which the ext-equality test rejects anyway.
    //      Screening on it costs eight lookups and skips the two floods.
    //   2. the walk region shrank — by exactly one tile, T itself, which is
    //      the definition of deleting a tile the garrison could stand on.
    //      Demanding a byte-identical walk region made that structurally
    //      impossible for every OUTER redundant rampart, which is why this
    //      pass could only ever remove INNER doubled wall.
    //
    // What is NOT relaxed: the exterior may gain T and nothing else, no
    // owned structure may drop below DEPTH_SAFE, and the keep-classes
    // (controller ring, stand-denial, declared bubbles, personal cover)
    // still hold unconditionally. A rampart that shares its tile with an
    // owned structure is held outright in this class — deleting it would
    // put that structure on the exterior at depth 0.
    // ------------------------------------------------------------------
    // The screen is a NECESSARY condition, never a sufficient one — the two
    // floods below still have the final say. It only has to avoid rejecting
    // anything they would accept, and there is exactly one way to know that
    // cheaply: if T has a walkable, un-ramparted D8 neighbour that the base
    // HOLDS (stands on, or owns a structure on) and that is not already
    // exterior, then deleting T floods that tile and the ext-equality test
    // below is guaranteed to refuse. Anything else — and in particular a
    // neighbour that is interior but UNREACHABLE, a dead-end pocket the
    // finished base sealed off from itself — gets the full test.
    //
    // That pocket case is half the finding. E16S4's 47,24/25/26 each sit in
    // front of floor at 46,25; a screen that treated "not exterior" as
    // "load-bearing" would refuse them without looking, which is the same
    // over-strictness in a new place. So the screen asks the sharper question
    // — is the tile behind it one the base actually HOLDS — and lets the
    // floods decide everything else.
    //
    // WHAT THE SCREEN CORRECTLY REFUSES, and this is the other half of the
    // finding. 46,25 turns out to be in the garrison's walk region, so
    // deleting any of E16S4's three would put floor the defenders stand on
    // OUTSIDE the wall. Re-derived independently against the shipped plan,
    // the same is true of E21S8's 32,12/33,12/34,12/34,13 (they expose 33,13)
    // and all four of E8S5's (they expose 30,3 and 31,3). Those 11 of the 23
    // are not inert: the seal survives and no structure is exposed, but the
    // walk region loses a tile that is not T, which is exactly the line the
    // relaxation is drawn at. They are refused here and DECLARED instead —
    // see noteRedundantCut. The other 12 delete cleanly and do.
    const outerDominated = (r) => {
      if (ownTiles.has(key(r.x, r.y))) return false; // would expose our own structure
      for (const [dx, dy] of D8) {
        const x = r.x + dx,
          y = r.y + dy;
        if (x < 0 || y < 0 || x > 49 || y > 49) continue;
        if (!walkable(terrain, x, y)) continue;
        const nk = key(x, y);
        if (set0.has(nk)) continue; // wall — blocks the flood either way
        if (ext0[idxOf(x, y)]) continue; // already outside
        if (hold.has(nk)) {
          refuse(key(r.x, r.y), `deleting it would put ${nk} — interior floor the base ${walk0.has(nk) ? "walks on" : "owns"} — outside the wall`);
          return false;
        }
      }
      return true;
    };
    let gone = null;
    for (const r of ramp) {
      const k = key(r.x, r.y);
      // a declared purpose this pass cannot measure — held whatever the flood says
      if (keep.has(k)) {
        refuse(k, "keep-class: the controller ring, a declared stand-denial tile or a declared bubble");
        continue;
      }
      // somebody's personal cover — held whatever the flood says
      if (ownTiles.has(k) && dep0[idxOf(r.x, r.y)] < DEPTH_SAFE) {
        refuse(k, `personal cover for a structure at depth ${dep0[idxOf(r.x, r.y)]}`);
        continue;
      }
      const faces = facesExterior(r);
      const outer = faces && walk0.has(k) && outerDominated(r);
      if (walk0.has(k) && faces && !outer) continue;
      const set1 = new Set(set0);
      set1.delete(k);
      // THE FLOODS ARE ONLY RUN WHEN THEY CAN MOVE. Deleting a rampart makes its
      // own tile floodable and nothing else; that tile joins the exterior only if
      // one of its D8 neighbours already is. So a rampart that does not FACE the
      // exterior cannot change the exterior flood at all, and therefore cannot
      // change any depth either — the exact test is guaranteed to pass and running
      // two 2500-tile floods to watch it pass is the single most expensive thing
      // this layer used to do (it runs inside every composition of every rung).
      // The test is still exact; it is the arithmetic that is skipped.
      let ext1 = ext0;
      let dep1 = dep0;
      const ik = idxOf(r.x, r.y);
      if (faces) {
        ext1 = exteriorFlood(terrain, set1);
        dep1 = depthFromExterior(ext1);
        let ok = true;
        for (const h of hold) {
          const [x, y] = h.split(",").map(Number);
          const i = idxOf(x, y);
          // T ITSELF IS ALLOWED TO CHANGE, and only T. For the inner class it
          // does not change at all (nothing about it was exterior before or
          // after); for the outer class it goes exterior and its depth goes to
          // 0, which is exactly what "delete this rampart" means. Every OTHER
          // tile the base can stand on or owns must come back byte-identical.
          if (i === ik) continue;
          if (ext1[i] !== ext0[i]) {
            refuse(k, `deleting it would put ${h} — interior floor the base holds — outside the wall`);
            ok = false;
            break;
          }
          // ...and depth may only be re-read where nothing of ours is standing.
          // A structure is held to DEPTH_SAFE, not to an unchanged number: the
          // exterior gaining one tile can legitimately shorten a chebyshev
          // reading several tiles away without putting anything in reach.
          if (dep1[i] === dep0[i]) continue;
          if (ownTiles.has(h) && dep1[i] < DEPTH_SAFE && dep0[i] >= DEPTH_SAFE) {
            refuse(k, `the structure at ${h} would drop from depth ${dep0[i]} to ${dep1[i]}, inside a ranged attacker's reach`);
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }
      // THE WALK REGION MAY LOSE EXACTLY T, AND NOTHING ELSE, EVER.
      //
      // See the outer-dominated header. An outer rampart the garrison could
      // stand on stops being standable when it is deleted — it becomes
      // exterior — so demanding an identical region forbade the whole class on
      // a technicality. An INNER deletion still leaves its tile walkable and
      // therefore still in the region, which is why this is "may lose", not
      // "must lose". The test is set containment plus a one-tile budget spent
      // only on T: a region that gains a tile, loses two, or loses one that is
      // not T is a different room and the deletion is refused.
      const walk1 = interiorWalk(terrain, set1, ext1, blocked, plan.sitter);
      if (walk1.size > walk0.size || walk0.size - walk1.size > 1) {
        refuse(k, `deleting it moves the garrison's walk region from ${walk0.size} tile(s) to ${walk1.size} — the budget is one tile, and that one tile has to be this rampart`);
        continue;
      }
      let sameRegion = true;
      for (const w of walk1) {
        if (!walk0.has(w)) {
          sameRegion = false;
          break;
        }
      }
      if (!sameRegion) {
        refuse(k, "deleting it opens floor the garrison could not previously stand on");
        continue;
      }
      if (walk1.size !== walk0.size && !(walk0.has(k) && !walk1.has(k))) {
        refuse(k, "the tile the walk region loses is not this rampart");
        continue;
      }
      // THE DELETION IS ALLOWED, AND IT IS RECORDED WHEN IT MOVES THE WALL.
      // Refusing here was tried and refused in turn: the only deletions that
      // promote an outsider are E11S10's seven inner double-wall tiles and
      // their kin, and those are precisely the waste this pass exists to
      // delete. So the deletion stands and the fact is carried forward — the
      // reconciliation below adopts whatever ends up holding the line into the
      // cut and declares it, rather than the wall quietly moving in silence.
      if (promotesOutsider(terrain, set1, k, cutKeys, ext1, plan.sitter)) promoted++;
      gone = r;
      break;
    }
    if (!gone) break;
    const gk = key(gone.x, gone.y);
    ramp = ramp.filter((r) => key(r.x, r.y) !== gk);
    removed.push({ x: gone.x, y: gone.y });
  }
  plan.shell.inertRefused = Object.fromEntries(refusals);
  if (!removed.length) return removed;
  const dead = new Set(removed.map((r) => key(r.x, r.y)));
  plan.structures.rampart = ramp;
  // the rampart list just moved, so the shipped exterior every later
  // measurement is taken against is no longer the one we may have cached
  invalidateShippedFlood(plan);
  plan.shell.cut = (plan.shell.cut || []).filter((c) => !dead.has(key(c.x, c.y)));
  // plan.shell.bubble is NOT scrubbed: keep-class (c) means no bubble can be in
  // `dead`, and a declaration this pass may not act on is one it may not edit.
  plan.shell.inertPruned = removed;
  plan.shell.inertPromoted = promoted;
  plan.shell.upkeepPerTick = Math.round(plan.structures.rampart.length * 3) / 100;
  if (plan.meta?.counts) plan.meta.counts.rampart = plan.structures.rampart.length;
  return removed;
}

/**
 * ------------------------------------------------------------------------
 * SEAL RECONCILIATION — one source of truth for "which tiles are the wall".
 * ------------------------------------------------------------------------
 *
 * meta.shell.cut is supposed to BE the wall: the tiles an attacker has to break
 * to get inside, the tiles the battlements cover, the tiles the towers are
 * scored against, the endpoints the mobility lap is measured over. Layer 2
 * produces it from the min-cut and it is true at layer 2. It is not always true
 * at layer 7, for a reason nothing in the pipeline was watching:
 *
 *   layers 2-6 keep ADDING ramparts (eco bubbles, lab cover, the mineral seat),
 *   and the inert prune above is then allowed to DELETE a cut tile whose job a
 *   neighbouring bubble has quietly taken over. The prune's test is exact about
 *   what it deletes and says nothing about what is now holding the line. The
 *   result is a room whose declared cut is smaller than its actual seal.
 *
 * Four rooms shipped that way (E11S10, E1S8, E11S3, E12S4). The consequences
 * were not cosmetic: E11S10's real weakest sealing tile is a source link 19
 * tiles from the battery — 1380 damage, not the declared 2670 — and it is a
 * LINK on the seal, which no defender or repairer can ever stand on, and the
 * link-on-cut declaration was empty because the link was not in `cut`. E1S8
 * hides a second one (its controller link at 36,13).
 *
 * THE DEFINITION, and it is the only one that is testable: a tile is part of
 * the seal when REMOVING IT ALONE lets the exterior flood reach the sitter.
 * That is exactly the mutation the validator now runs, so the plan and its
 * check agree on what a wall is.
 *
 * The cut becomes the UNION of what layer 2 bought and what that test finds,
 * not a replacement: a doubled segment where no single tile is load-bearing is
 * still wall we paid for and still wall the defenders have to hold, and
 * dropping it to make the declaration prettier would be the same class of
 * mistake in the other direction. Then every metric derived from the cut is
 * recomputed against it — battlements, the battlement gap, links on the wall,
 * the mobility lap and the battery's weakest face — because a metric computed
 * on a wall the room does not have is not a measurement.
 */
function reconcileSeal(terrain, plan) {
  const ramp = plan.structures.rampart || [];
  if (!ramp.length) return null;
  const rset = new Set(ramp.map((r) => key(r.x, r.y)));
  const extFinal = exteriorFlood(terrain, rset);
  const si = idxOf(plan.sitter.x, plan.sitter.y);
  // a room whose sitter is already exterior has no seal to reconcile — the
  // shell layer would have failed long before here, but be explicit.
  if (extFinal[si]) return null;

  const sealCritical = sealCriticalSet(
    terrain,
    rset,
    extFinal,
    insideFlood(terrain, rset, plan.sitter),
  );
  const cut = plan.shell.cut || [];
  const inCut = new Set(cut.map((c) => key(c.x, c.y)));
  // deterministic append order: reading order, not rampart-array order, so the
  // adopted tiles do not inherit whatever order earlier layers happened to push
  const adopted = sealCritical
    .filter((c) => !inCut.has(key(c.x, c.y)))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  plan.shell.sealCritical = sealCritical.length;
  plan.shell.cutAdopted = adopted;
  if (!adopted.length) return { adopted, sealCritical };
  plan.shell.cut = cut.concat(adopted.map((c) => ({ x: c.x, y: c.y })));
  return { adopted, sealCritical, extFinal };
}

/**
 * Re-derive every cut-shaped metric on the wall the room is actually shipping.
 * Called only when the cut changed under layer 7 (the prune removed tiles, the
 * reconciliation adopted some, or both) — a room whose cut layer 2 chose is
 * still exactly the cut it ships has nothing to recompute and gets layer 2's
 * numbers untouched.
 */
function remeasureShell(terrain, plan, reason) {
  const cut = plan.shell.cut || [];
  if (!cut.length) return;
  // ONE definition of the shipped wall, shared with verifyMobility and with
  // layer-shell's builtMobility. This function used to flood for itself, which
  // is how meta.shell.mobilityShipped could read 1.71 while the field the
  // declaration actually fires off read 0 — two measurements of the same room
  // that were never made to agree. See shippedFlood().
  const { rset, ext: extFinal } = shippedFlood(terrain, plan);
  const blocked = new Set(plan.objectTiles || []);
  for (const t of BUILT_OBSTACLES) {
    for (const p of plan.structures[t] || []) blocked.add(key(p.x, p.y));
  }
  const walkFinal = interiorWalk(terrain, rset, extFinal, blocked, plan.sitter);

  const b = pickBattlements(terrain, cut, extFinal, walkFinal);
  plan.shell.battlements = b.battlements;
  plan.shell.battlementGapTiles = b.battlementGapTiles;
  plan.shell.battlementGap = b.battlementGap;
  plan.shell.battlementUnreachable = b.battlementUnreachable;
  // ...and WHICH tiles they are. The count alone has been published for a while
  // and 12 rooms carry a non-zero one; without the tiles there is nothing for a
  // declaration to name, which is most of why only one of the 12 declares. See
  // declareUnreachableCut.
  plan.shell.battlementUnreachableTiles = cut
    .filter((c) => !walkFinal.has(key(c.x, c.y)))
    .map((c) => ({ x: c.x, y: c.y }));
  plan.shell.battlementFloor = Math.ceil(cut.length / 3);

  const linkKeys = new Set((plan.structures.link || []).map((l) => key(l.x, l.y)));
  plan.shell.linkOnCut = cut.filter((c) => linkKeys.has(key(c.x, c.y))).map((c) => ({ x: c.x, y: c.y }));

  const m = mobilityStats(cut, extFinal, maskFromKeys(walkFinal));
  m.target = MOBILITY_TARGET;
  // the cause/floor/eco attribution belongs to the negotiation that chose the
  // enclosure and is NOT re-derived here — only the geometry it is attributed to
  const prev = plan.shell.mobility || {};
  for (const f of ["cause", "floor", "candidates", "ecoCost"]) if (f in prev) m[f] = prev[f];
  plan.shell.mobilityShipped = m;

  // ------------------------------------------------------------------
  // ...AND THE SAME QUANTITY LAYER 2 PUBLISHED, ON THE WALL THE ROOM SHIPS.
  //
  // `mobilityShipped` above blocks the finished mass, so it is a BUILT reading:
  // a different quantity from `shell.mobility`, which layer 2 takes over a
  // mass-free interior (object tiles plus the hub trio and links, nothing
  // else). Publishing only the built number left no way to answer the question
  // the stale-metric finding actually asks — "what would layer 2's own
  // measurement have said about the wall this room ships?" — so both readings
  // now exist and the reconciliation below quotes them side by side. Same
  // walk semantics as layer-shell:1163-1166; only the exterior differs, which
  // is the entire point.
  // ------------------------------------------------------------------
  const shellOcc = new Set(plan.objectTiles || []);
  for (const t of ["storage", "terminal", "spawn", "link"]) {
    for (const p of plan.structures[t] || []) shellOcc.add(key(p.x, p.y));
  }
  const walkShellFree = interiorWalk(terrain, rset, extFinal, shellOcc, plan.sitter);
  const mFree = mobilityStats(cut, extFinal, maskFromKeys(walkShellFree));
  mFree.target = MOBILITY_TARGET;
  for (const f of ["cause", "floor", "candidates", "ecoCost"]) if (f in prev) mFree[f] = prev[f];
  plan.shell.mobilityShippedFree = mFree;

  // ------------------------------------------------------------------
  // ENCLOSURE, RE-DERIVED OVER THE SHIPPED RAMPART UNION.
  //
  // `srcEnclosed` / `enclosedSources` / `enclosedController` were computed by
  // layer 2 against layer 2's exterior — i.e. against the min-cut ring, before
  // one eco bubble, one personal rampart or one adopted seal tile existed. The
  // sentence this function writes into `plan.shell.remeasured` says that "the
  // exterior — and every metric taken against it — is re-derived over the union
  // rather than over the min-cut ring layer 2 negotiated". These three were not,
  // and they disagreed with the shipped board in 41 of 344 sources: the fleet
  // headline UNDERSTATED the enclosure by 39 sources, and one room (E13S4,
  // source 19,3) OVER-claimed — `srcEnclosed: true` next to a bare, unramparted,
  // exterior-flood tile at 19,2, directly adjacent to the source, with the other
  // two seats ramparted. An over-claim is the half that matters: the strict
  // reading is what "enclosed source" means to a reader, and 19,2 is a tile an
  // attacker stands on next to our miner.
  //
  // Both readings are kept, exactly as they are for the battery: layer 2's is
  // the record of what the enclosure was NEGOTIATED on, and this one is what the
  // room ships.
  // ------------------------------------------------------------------
  {
    const outside = (p) => !!extFinal[idxOf(p.x, p.y)];
    const walkableRing = (o) => {
      const ring = [];
      for (const [dx, dy] of D8) {
        const x = o.x + dx,
          y = o.y + dy;
        if (x < 0 || y < 0 || x > 49 || y > 49) continue;
        if (walkable(terrain, x, y)) ring.push({ x, y });
      }
      return ring;
    };
    // the link program's own convention, mirrored exactly from layer-shell: the
    // array is [hub, ...perSource, controller], so the source links are the
    // middle slice and the controller's link is the last entry.
    const links = plan.structures.link || [];
    const srcLinks = links.slice(1, Math.max(1, links.length - 1));
    const ctrlLink = links.length > 1 ? links[links.length - 1] : null;
    let enclosedSources = 0;
    let enclosedSourceWorks = 0;
    const srcEnclosed = (plan.sources || []).map((s) => {
      const mine = [
        ...(plan.structures.container || []).filter((c) => chebyshev(c, s) <= 1),
        ...srcLinks.filter((l) => chebyshev(l, s) <= 2),
      ];
      const works = mine.length > 0 && mine.every((p) => !outside(p));
      if (works) enclosedSourceWorks++;
      const strict = works && walkableRing(s).every((p) => !outside(p));
      if (strict) enclosedSources++;
      return strict;
    });
    // ------------------------------------------------------------------
    // ...AND enclosedController IS DELIBERATELY NOT RE-DERIVED HERE.
    //
    // It is the same arithmetic and it is a different QUESTION. "The controller
    // is enclosed" is a claim about the SHELL: the enclosure the escalation
    // ladder priced was wide enough to take the controller in, at a cost the
    // room paid in cut tiles. Taken against the shipped rampart union it becomes
    // a claim about coverage instead, and every controller in the fleet passes
    // it — because the controller's stand-denial ring IS ramparts, so its ring
    // tiles are never in the exterior flood by construction. Re-deriving it here
    // reads 172/172 and means nothing: a controller sitting outside the wall in
    // its own sealed one-tile pocket is not "enclosed" in the sense the number
    // is quoted for, and the fleet headline (91/172) would become a tautology.
    //
    // The source verdict does not have that problem: a source's works and ring
    // being inside the union is exactly the operational claim ("no attacker
    // stands next to my miner"), and it is what round 10 found E13S4 lying about.
    // ------------------------------------------------------------------
    void ctrlLink;
    plan.shell.enclosedAtNegotiation = {
      sources: plan.shell.enclosedSources,
      sourceWorks: plan.shell.enclosedSourceWorks,
      srcEnclosed: plan.shell.srcEnclosed,
    };
    plan.shell.enclosedSources = enclosedSources;
    plan.shell.srcEnclosed = srcEnclosed;
    // ...and the works-only reading stays on layer 2's basis for the same reason
    // the controller does: every source work carries a bubble rampart by the time
    // the room ships, so "the works are not in the exterior flood" is true in
    // 344/344 by construction and answers nothing. Layer 2's number answers the
    // question it was asked — did the ENCLOSURE take the works in.
    void enclosedSourceWorks;
    plan.shell.enclosureBasis =
      `SOURCES re-derived at finalizeRoom over the SHIPPED rampart union (every cut tile, bubble, ` +
      `stand-denial and personal rampart the room ships), not over the min-cut ring layer 2 negotiated — ` +
      `a source counts as enclosed on the strict reading, its works AND every walkable tile of its ring ` +
      `inside the wall. shell.enclosedAtNegotiation keeps layer 2's reading, which is the one the ` +
      `enclosure was BOUGHT on. enclosedController is NOT re-derived on this basis and the comment in ` +
      `layer-walls says why: against the union it is a tautology, because the controller's own ` +
      `stand-denial ring is made of ramparts.`;
  }

  const dmg = shellDamage(plan.structures.tower || [], cut);
  plan.shell.shippedShellDmg = dmg;
  plan.shell.remeasured = reason;
  // meta.towers keeps BOTH readings on purpose. minShellDmg is what layer 3
  // optimised against and is the number that explains the battery it chose;
  // shippedMinShellDmg is what the wall the room actually ships sees. Replacing
  // one with the other would hide either the decision or the outcome — the
  // validator checks the shipped number and the declaration quotes both.
  if (plan.meta?.towers) {
    plan.meta.towers.shippedMinShellDmg = dmg.min;
    plan.meta.towers.shippedAvgShellDmg = dmg.avg;
    plan.meta.towers.shippedWeakTiles = dmg.weak;
    plan.meta.towers.shippedWeakest = dmg.worst;
    plan.meta.towers.shippedCutTiles = dmg.tiles;
  }
  return dmg;
}

/**
 * ------------------------------------------------------------------------
 * WALL THAT IS NOT LOAD-BEARING, AND WHY IT IS STILL THERE.
 * ------------------------------------------------------------------------
 * "No double shell" is a hard gate, and a cut tile whose single removal does
 * NOT let the exterior reach the sitter looks, to anyone reading the plan,
 * exactly like double shell. 65 such tiles shipped across 23 rooms and the
 * plan said nothing about any of them: `meta.shell.uselessCut` was `[]` in
 * every single room — honest under its own narrow definition and useless to a
 * reader, who had to re-derive the entire removal test to learn whether a
 * given rampart was quietly load-bearing or simply never examined.
 *
 * Both classes are real and they are not the same thing:
 *
 *   PRUNED    the prune above deleted it. Nothing measurable moved, so it was
 *             forever-upkeep defending nothing.
 *   REFUSED   it is not singly load-bearing, and it still cannot go, and
 *             there is a specific tile that says so. Overwhelmingly this is
 *             the outer-dominated case failing on its one strict clause:
 *             deleting the rampart would push a named tile of interior floor
 *             — floor the garrison walks on, or floor carrying a structure —
 *             outside the wall. That is not "double shell", it is wall doing
 *             a job the single-removal seal test cannot see, and the tile it
 *             protects is named here so the claim is falsifiable.
 *
 * This is a NOTE, not a shortfall. Nothing here is a violation: the room is
 * sealed, legal and complete, and the ramparts in question are ones the room
 * decided to keep for a reason it can state. The anti-pattern the planner is
 * held to is silence, and silence is what this ends.
 */
function noteRedundantCut(terrain, plan, sealCritical, inertPruned) {
  const cut = plan.shell?.cut || [];
  // the raw refusal map is working state, never shipped — see below
  const refused = plan.shell?.inertRefused || {};
  if (plan.shell) delete plan.shell.inertRefused;
  if (!cut.length) return null;
  const sealSet = new Set((sealCritical || []).map((c) => key(c.x, c.y)));
  const redundant = cut.filter((c) => !sealSet.has(key(c.x, c.y)));
  // THE REASONS ARE KEPT ONLY FOR THE TILES THIS NOTE IS ABOUT. The prune
  // records a refusal for every rampart it examined, which is most of the wall
  // and 639 KB of near-duplicate prose across the fleet artifact. The tiles a
  // reader needs a reason for are the ones that LOOK like double shell — the
  // cut tiles that are not singly load-bearing — so the map is narrowed to
  // those and the rest is dropped rather than shipped.
  const reasons = {};
  for (const c of redundant) {
    const k = key(c.x, c.y);
    if (refused[k]) reasons[k] = refused[k];
  }
  plan.shell.redundantCut = {
    tiles: redundant.length,
    pruned: inertPruned.length,
    explained: Object.keys(reasons).length,
    reasons,
  };
  if (!redundant.length && !inertPruned.length) return plan.shell.redundantCut;

  const lines = redundant
    .slice(0, 12)
    .map((c) => {
      const k = key(c.x, c.y);
      return `${k} — ${refused[k] || "held by an earlier layer's declared purpose"}`;
    });
  plan.meta.notes = plan.meta.notes || [];
  // A NOTE ABOUT NOTHING IS NOISE. When the prune cleared the room out entirely
  // the old text still printed "The 0 that remain are NOT double shell and each
  // one has a named reason: ." — a colon, a full stop and no tiles.
  plan.meta.notes.push(
    redundant.length === 0
      ? `NO CUT TILE IS REDUNDANT: every one of this room's ${cut.length} cut tile(s) is singly ` +
        `load-bearing — remove any one of them alone and the exterior flood reaches the sitter — and ` +
        `${inertPruned.length} further rampart(s) that were not already came off in layer 7's inert ` +
        `prune this run, re-run to a fixpoint on the board the room ships. There is no double shell here.`
      : `CUT TILES THAT ARE NOT SINGLY LOAD-BEARING: ${redundant.length} of this room's ${cut.length} cut ` +
        `tile(s) can each be removed on their own without letting the exterior flood reach the sitter, and ` +
        `${inertPruned.length} more already were — layer 7's inert prune deleted them this run. The ` +
        `${redundant.length} that remain are NOT double shell and each one has a named reason, measured ` +
        `on the post-reflow board this room ships: ` +
        `${lines.join(" · ")}${redundant.length > lines.length ? ` · …and ${redundant.length - lines.length} more` : ""}. ` +
        `At ${round2(redundant.length * 0.03)} e/tick of forever-upkeep this is the price of the wall that ` +
        `holds floor the single-removal test cannot see it holding.`,
  );
  return plan.shell.redundantCut;
}

/**
 * INTERIOR FLOOR THE FINISHED BASE SEALED OFF FROM ITSELF.
 *
 * 137 tiles across 42 rooms are inside the wall, are not wall, carry nothing,
 * and cannot be walked to from the sitter. Some of that is the enclosure: the
 * min-cut is free to wall a lobe the basin could never reach anyway, and no
 * ordering of the program recovers it. Some of it is US: a row of extensions
 * across a one-wide corridor seals the pocket behind it, and that pocket was
 * deep buildable floor the same layer then went shallow for want of.
 *
 * The two are not the same thing and the note separates them, because only one
 * is actionable: `ourFault` re-floods with every blocking structure of ours
 * removed and counts what comes back. That is the honest upper bound on what an
 * ordering fix inside layer 6 could ever recover — quoted as a bound and not as
 * a promise, since recovering it also requires the corridor to stay open, which
 * costs the tile the corridor runs through.
 *
 * It is a NOTE and not a shortfall on purpose. Nothing here is a violation: the
 * room is legal, sealed and complete. It is a fact a reviewer would otherwise
 * have to re-derive, and the anti-pattern this planner is held to is silence,
 * not imperfection.
 */
function noteSealedFloor(terrain, plan, shallowNow) {
  const ramp = plan.structures.rampart || [];
  const rset = new Set(ramp.map((r) => key(r.x, r.y)));
  const ext = exteriorFlood(terrain, rset);
  const depth = depthFromExterior(ext);
  const blocked = new Set(plan.objectTiles || []);
  for (const t of BUILT_OBSTACLES) {
    for (const p of plan.structures[t] || []) blocked.add(key(p.x, p.y));
  }
  const walk = interiorWalk(terrain, rset, ext, blocked, plan.sitter);
  // the same flood with only room OBJECTS blocking — what the interior would be
  // if the program had not been grown into it
  const bare = interiorWalk(terrain, rset, ext, new Set(plan.objectTiles || []), plan.sitter);

  let sealed = 0;
  let deepSealed = 0;
  let ourFault = 0;
  const tiles = [];
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      if (!walkable(terrain, x, y)) continue;
      const i = idxOf(x, y);
      if (ext[i]) continue;
      const k = key(x, y);
      if (rset.has(k) || blocked.has(k) || walk.has(k)) continue;
      sealed++;
      if (tiles.length < 24) tiles.push({ x, y });
      const usable = depth[i] >= DEPTH_SAFE && x >= 2 && x <= 47 && y >= 2 && y <= 47;
      if (usable) deepSealed++;
      if (bare.has(k)) ourFault++;
    }
  }
  if (!sealed) return null;
  // 7b's own census, passed in. Reading `plan.meta.extensions.shallow` here is
  // reading a field the pipeline does not correct until AFTER this layer returns
  // — the pre-7b number, in a sentence about the shipped room.
  const shallowStructs = typeof shallowNow === "number" ? shallowNow : (plan.meta?.extensions?.shallow ?? 0);
  plan.meta.notes = plan.meta.notes || [];
  plan.meta.notes.push(
    `SEALED INTERIOR FLOOR: ${sealed} tile(s) sit inside the wall, carry nothing, and cannot be reached ` +
      `from the sitter (${tiles.map((t) => `${t.x},${t.y}`).join(" ")}${sealed > tiles.length ? " …" : ""}). ` +
      `${deepSealed} of them are deep (>= ${DEPTH_SAFE}) and inside the buildable band, i.e. floor the ` +
      `program could have used; this room ships ${shallowStructs} shallow extension(s). ` +
      `${ourFault} of the ${sealed} come back if OUR OWN blocking structures are removed and the enclosure ` +
      `is left as it is — that is the ceiling on what any re-ordering inside the placement layers could ` +
      `recover, and the remaining ${sealed - ourFault} are the enclosure's shape, which no ordering reaches.`,
  );
  plan.meta.sealedFloor = { tiles: sealed, deep: deepSealed, ourFault, shallowStructs };
  return plan.meta.sealedFloor;
}

/**
 * THE BATTERY IS DECLARED AGAINST THE WALL IT DEFENDS, NOT THE WALL IT WAS SOLD.
 *
 * Layer 3 makes the weak-battery declaration from the cut it was handed, and it
 * is the right layer to do it — it is the layer that can explain the search. But
 * layer 7 can change which tiles are the wall, and when it does, layer 3's
 * verdict is stale in the one direction that matters: E11S10 declared nothing
 * because its cut-wide weakest face was 2670, while the seal it actually ships
 * is weakest at 1380 on a source link the battery cannot cover. So the shipped
 * reading gets its own pass at the same gate. It does not overwrite layer 3's
 * declaration where there is one (the two numbers mean different things and both
 * are printed); it adds one where the shipped wall is weak and layer 3 had no
 * reason to speak.
 */
function declareShippedBattery(plan, dmg) {
  if (!dmg || !dmg.tiles) return;
  plan.meta.shortfalls = plan.meta.shortfalls || [];
  const already = plan.meta.shortfalls.find((sf) => sf && sf.kind === "weak-battery");
  const declared = plan.meta?.towers?.minShellDmg;
  // the amendment below runs whether or not the SHIPPED battery is weak: a
  // layer-3 declaration quoting a wall the room does not have is stale either way
  if (!already && dmg.min >= WEAK_SHELL_DMG) return;
  if (already) {
    // ------------------------------------------------------------------
    // ...BUT LAYER 3's NUMBERS ARE ABOUT THE CUT LAYER 3 WAS GIVEN.
    //
    // Returning here left the room publishing the PRE-ADOPTION battery in its
    // most-quoted sentence. E15S5 ships "1380 damage on 20 cut tile(s) ... 2306
    // average" over a wall that is 19 tiles, weakest at 1410 and averaging 2364;
    // E5S6 quotes 26 cut tiles against 23. Both plans also claim, in the same
    // artifact, that every shell metric was re-derived over the reconciled wall
    // — which this early return made false. The layer-3 text is still the record
    // of the search that chose the battery and is not rewritten; the shipped
    // reading is appended to it, the same way the upgrader seats are.
    // ------------------------------------------------------------------
    const same =
      already.towers &&
      already.towers.shippedMinShellDmg === dmg.min &&
      already.towers.shippedCutTiles === dmg.tiles;
    if (same) return;
    // ------------------------------------------------------------------
    // THE SHIPPED READING LEADS. It used to be APPENDED, which is the whole of
    // round-9 finding #6: E15S5's declaration opens "the weakest wall face sees
    // 1350 damage ... 0/20 cut tiles" over a room that ships 1410 over 19, and
    // the correction sat six sentences later behind a wall of search prose.
    // Every number a reader meets first has to be a number the room has. Layer
    // 3's text is not edited — it is the record of the search that chose the
    // battery, and a record rewritten to agree with the outcome is not one — it
    // is demoted, verbatim, behind the reading of record.
    // ------------------------------------------------------------------
    already.detail =
      `AS SHIPPED, on the wall this room actually has: the weakest sealing tile takes ${dmg.min} ` +
      `damage${dmg.worst ? ` (${dmg.worst.x},${dmg.worst.y})` : ""} over ${dmg.tiles} cut tile(s), ` +
      `averaging ${dmg.avg}, with ${dmg.weak} of them under the ${TARGET_MIN} floor. THAT IS THE ` +
      `NUMBER OF RECORD — re-derived here, after layer 7's inert prune and the single-removal seal ` +
      `reconciliation have both changed which tiles are the wall.` +
      ` — · — THE SEARCH THAT CHOSE THIS BATTERY, verbatim from layer 3 and measured over the ` +
      `${already.towers?.declaredCutTiles ?? "earlier"}-tile cut layer 2 handed it, which is a different ` +
      `wall: "` +
      already.detail +
      `"`;
    already.towers = {
      ...(already.towers || {}),
      shippedMinShellDmg: dmg.min,
      shippedAvgShellDmg: dmg.avg,
      shippedWeakTiles: dmg.weak,
      shippedCutTiles: dmg.tiles,
    };
    return;
  }
  const linkKeys = new Set((plan.structures.link || []).map((l) => key(l.x, l.y)));
  const onLink = dmg.worst && linkKeys.has(key(dmg.worst.x, dmg.worst.y));
  plan.meta.shortfalls.push({
    gate: "towers",
    kind: "weak-battery",
    detail:
      `THIS BATTERY IS LEGAL, NOT GOOD, AND LAYER 3 COULD NOT HAVE KNOWN: the wall this room ships is ` +
      `weakest at ${dmg.min} damage on ${dmg.worst ? `${dmg.worst.x},${dmg.worst.y}` : "an adopted tile"} — ` +
      `under the ${WEAK_SHELL_DMG} the fleet reaches almost everywhere, and under the ${declared} layer 3 ` +
      `measured over the cut it was given. The gap is not an arithmetic error: layer 7's inert prune ` +
      `deleted ${(plan.shell.inertPruned || []).length} tile(s) of doubled inner wall, which merged a ` +
      `walled-off lobe into the garrison's region and handed that side of the seal to the lobe's own eco ` +
      `bubbles — tiles the battery was never scored against because they were not in the cut. ` +
      (onLink
        ? `The weakest of them carries a LINK (an OBSTACLE_OBJECT_TYPE), so no defender or repairer can ` +
          `stand on that rampart to help it. `
        : "") +
      `${dmg.weak}/${dmg.tiles} sealing tiles are under the ${TARGET_MIN} hard floor. The trade the prune ` +
      `made — ${(plan.shell.inertPruned || []).length} ramparts of forever-upkeep against a weaker far ` +
      `face — is written down here rather than split between two layers that each saw half of it.`,
    tiles: dmg.worst ? [{ x: dmg.worst.x, y: dmg.worst.y }] : [],
    towers: { shippedMinShellDmg: dmg.min, declaredMinShellDmg: declared, weakTiles: dmg.weak },
  });
}

/**
 * ------------------------------------------------------------------------
 * A RAMPART NO DEFENDER CAN REACH IS UPKEEP WITH NO GARRISON.
 * ------------------------------------------------------------------------
 * `battlementUnreachable` counts cut tiles that the finished base's own walk
 * region cannot reach: the wall is there, it decays forever, and no creep can
 * ever stand on it to hold or repair it. It is also silently dropped from the
 * mobility endpoint set, so the lap those tiles would have contributed is not
 * in any published number either.
 *
 * Twelve rooms ship one — E13S3 14,35 · E13S5 7,13 · E14S6 33,37 · E15S5 17,24
 * · E17S5 43,35 · E18S2 2,24 · E18S6 32,7 · E18S9 44,5 · E19S8 34,35 ·
 * E1S6 11,17 · E2S6 6,36 · E3S6 15,35 — and exactly one of them, E18S2,
 * declares it. That is not because the other eleven are different: E18S2 is the
 * only room whose cut is unreachable ALREADY AT LAYER 2, where the sole
 * `battlements` declaration lives. The other eleven become unreachable later,
 * when the extension mass seals a cut tile off or the prune moves the wall, and
 * layer 7 had no declaration path at all for that — it re-measured the number
 * at remeasureShell and returned.
 *
 * Declared here against layer 2's own count, so a room only speaks about the
 * tiles IT stranded, and E18S2's existing layer-2 declaration is not duplicated.
 */
function declareUnreachableCut(plan, before) {
  const tiles = plan.shell?.battlementUnreachableTiles || [];
  if (!tiles.length) return;
  const now = tiles.length;
  const added = now - (before || 0);
  if (added <= 0) return; // layer 2 already owns these, and already declared them
  plan.meta.shortfalls = plan.meta.shortfalls || [];
  const where = tiles.map((t) => `${t.x},${t.y}`).join(" ");
  plan.meta.shortfalls.push({
    gate: "battlements",
    kind: "unreachable",
    detail:
      `UNREACHABLE WALL: ${now} cut tile(s) — ${where} — carry a rampart the finished base cannot walk ` +
      `to. ${added} of them became unreachable after layer 2, which is why this is declared here and ` +
      `not with the enclosure: the mass we grew, or the prune that moved the wall, sealed them off from ` +
      `the sitter's own walk region. Each one is a rampart paying decay forever for a tile no garrison ` +
      `can hold or repair, and each is dropped from the mobility endpoint set, so the lap it would have ` +
      `contributed appears in no published number. It is NOT removed: it is load-bearing on the seal ` +
      `(an unreachable tile that was not would have gone in the inert prune), so the room owes the ` +
      `upkeep either way and the honest thing is to say what it is buying.`,
    tiles: tiles.slice(0, 32).map((t) => ({ x: t.x, y: t.y })),
    battlements: { unreachable: now, unreachableAtLayer2: before || 0, strandedByMass: added },
  });
}

/**
 * BELT AND BRACES. The prune's promotion invariant means `adopted` should be
 * empty in every room; if it ever is not, the room ships a seal partly carried
 * by tiles nobody scored, and that is declared rather than silently unioned in.
 * Kept as a live declaration and not an assert because a plan that throws is a
 * plan nobody can look at.
 */
function declareAdoptedSeal(plan, adopted, dmg) {
  const where = adopted.map((t) => `${t.x},${t.y}`).join(" ");
  const linkKeys = new Set((plan.structures.link || []).map((l) => key(l.x, l.y)));
  const links = adopted.filter((t) => linkKeys.has(key(t.x, t.y)));
  plan.meta.shortfalls = plan.meta.shortfalls || [];
  plan.meta.shortfalls.push({
    gate: "shell",
    kind: "adopted-seal",
    detail:
      `${adopted.length} rampart(s) outside the declared cut turn out to carry the seal (${where}) — ` +
      `removing any one of them alone lets the exterior flood reach the sitter. They were bought as ` +
      `bubbles, so no battlement, tower score or mobility endpoint was computed over them until now; ` +
      `they have been adopted into meta.shell.cut and every shell metric re-derived over the union. ` +
      (links.length
        ? `${links.length} of them carry a LINK (${links.map((t) => `${t.x},${t.y}`).join(" ")}), which is an ` +
          `OBSTACLE_OBJECT_TYPE — no defender or repairer can ever stand on that rampart. `
        : "") +
      (dmg
        ? `On the reconciled wall the weakest sealing tile sees ${dmg.min} damage` +
          (dmg.worst ? ` (${dmg.worst.x},${dmg.worst.y})` : "") +
          `, against the ${plan.meta?.towers?.minShellDmg ?? "?"} layer 3 measured on the cut it was given.`
        : ""),
    tiles: adopted.map((t) => ({ x: t.x, y: t.y })),
  });
}

export function planWallRoads(terrain, plan) {
  if (!plan.shell) return { error: "wall roads need a shell (layer 2 missing)" };
  if (!(plan.shell.cut || []).length) return { error: "shell has no cut tiles" };

  // (0a) DELETE the wall that defends nothing, before anything measures or
  //      paves it — see pruneInertRamparts. This is the same license this layer
  //      already has over roads: it is the last pass, so it is the only one that
  //      can see what every earlier layer actually left behind.
  const inertPruned = pruneInertRamparts(terrain, plan);
  // layer 2's own count, kept before the re-measure overwrites it — a room may
  // only declare the battlements ITS OWN mass stranded. See declareUnreachableCut.
  const unreachableAtLayer2 = plan.shell.battlementUnreachable || 0;

  // (0a2) RECONCILE the declared cut with the seal the room actually ships,
  //       then re-derive every metric that is a function of the cut. See
  //       reconcileSeal / remeasureShell — this is the single source of truth
  //       for "which tiles are the wall", and it has to run after the prune
  //       because the prune is the last thing that can change the answer.
  reconcileSeal(terrain, plan);
  // ------------------------------------------------------------------
  // THE RE-MEASURE IS UNCONDITIONAL, BECAUSE THE WALL MOVES WITHOUT THE CUT.
  //
  // This used to run only when `cutChanged`. That reads like a sound
  // optimisation and is not: the cut is the min-cut RING, and layers 2-6 also
  // add BUBBLE ramparts — around containers, source and controller links, the
  // hub trio, the controller stand-denial ring, every shallow structure's
  // personal cover. Those change the exterior flood without changing one byte
  // of `shell.cut`, so a bubble-only room took the `false` branch and shipped
  // layer 2's numbers about a wall it does not have. Seven rooms were stale on
  // mobility alone — E17S3's declaration argued a 3.17 lap and a "41/41 wall
  // pairs" count against a shipped 1.5 and 4; E13S4 said 4.6 against 3.67;
  // E18S9 2.5 against 1.5; E2S6, E11S2, E8S1 and E18S8 the same shape. Four of
  // those rooms declare, in the same plan, that "every shell metric [was]
  // re-derived over the union" — a sentence this guard made false.
  //
  // shippedFlood() is memoised, so the honest version costs one flood per room.
  // ------------------------------------------------------------------
  // ...AND THE MEASUREMENT ITSELF MOVED TO THE END OF THE LAYER. See the TRUTH
  // PASS at stage (6b): the prune and the reconciliation are MUTATIONS and stay
  // here, because everything below builds roads against the cut they leave. The
  // numbers and the sentences derived from them are taken after 7b, which is the
  // last thing in this file that changes what the room contains.

  const cut = plan.shell.cut || [];
  if (!cut.length) return { error: "shell has no cut tiles" };
  const ext = plan.exterior;

  // (0b) THE LAP THE FINISHED MASS LEAVES THE GARRISON IS MEASURED LAST, NOT
  //      HERE. It used to run at this point, which was correct only for as long
  //      as this layer added nothing that blocks a creep. Layer 7b (the
  //      post-prune extension reflow, below) does exactly that, so measuring
  //      the built lap before it would ship a mobility number about a mass the
  //      room does not have — reintroducing, one stage later, the very
  //      stale-metric class the unconditional remeasureShell above closes. See
  //      the verifyMobility call after stage (6).

  // every real structure blocks; roads/ramparts/containers do not
  const occupied = new Set();
  for (const t of [
    "storage",
    "terminal",
    "link",
    "spawn",
    "tower",
    "lab",
    "extension",
    "nuker",
    "observer",
  ]) {
    for (const p of plan.structures[t] || []) occupied.add(key(p.x, p.y));
  }
  for (const k of plan.objectTiles || []) occupied.add(k); // C1 — never pave a source
  const roadSet = new Set(plan.structures.road.map((r) => key(r.x, r.y)));
  const cutSet = new Set(cut.map((c) => key(c.x, c.y)));
  // every rampart down so far — the shell line plus the personal ones earlier
  // layers bolted to their own shallow structures
  const rampartSet = new Set((plan.structures.rampart || []).map((r) => key(r.x, r.y)));

  const newRoads = [];
  const addRoad = (x, y) => {
    const k = key(x, y);
    // NEVER on a cut tile — that is the whole point of this rewrite
    if (roadSet.has(k) || occupied.has(k) || cutSet.has(k)) return false;
    if (!walkable(terrain, x, y) || x < 1 || y < 1 || x > 48 || y > 48) return false;
    roadSet.add(k);
    newRoads.push({ x, y });
    return true;
  };

  const containerSet = new Set((plan.structures.container || []).map((c) => key(c.x, c.y)));
  /** D8 component of roads+containers reachable from the sitter */
  const liveNetwork = () => {
    const comp = new Set([key(plan.sitter.x, plan.sitter.y)]);
    const q = [plan.sitter];
    let qi = 0;
    while (qi < q.length) {
      const cur = q[qi++];
      for (const [dx, dy] of D8) {
        const x = cur.x + dx,
          y = cur.y + dy;
        const k = key(x, y);
        if (comp.has(k) || (!roadSet.has(k) && !containerSet.has(k))) continue;
        comp.add(k);
        q.push({ x, y });
      }
    }
    return comp;
  };

  // interior walking space a new road may occupy: inside the shell, not a
  // structure, not the wall itself. Excluding the cut keeps every spur on
  // this side of the wall — a paved path THROUGH a rampart line would be a
  // ladder for anything that breaches it.
  const paveable = (x, y) => {
    if (x < 1 || y < 1 || x > 48 || y > 48) return false;
    if (!walkable(terrain, x, y) || ext[idx(x, y)]) return false;
    const k = key(x, y);
    return !occupied.has(k) && !cutSet.has(k);
  };

  /** multi-source BFS out of the live network; parent chain = shortest path */
  const fieldFromNetwork = () => {
    const comp = liveNetwork();
    const prev = new Int32Array(2500).fill(-2); // -2 unseen, -1 network root
    const dist = new Int32Array(2500).fill(1 << 20);
    const q = [];
    for (const k of comp) {
      const [x, y] = k.split(",").map(Number);
      const i = idx(x, y);
      prev[i] = -1;
      dist[i] = 0;
      q.push(i);
    }
    let qi = 0;
    while (qi < q.length) {
      const i = q[qi++];
      const x = i % 50,
        y = (i / 50) | 0;
      for (const [dx, dy] of D8) {
        const nx = x + dx,
          ny = y + dy;
        const ni = nx + ny * 50;
        if (nx < 1 || ny < 1 || nx > 48 || ny > 48) continue;
        if (prev[ni] !== -2 || !paveable(nx, ny)) continue;
        prev[ni] = i;
        dist[ni] = dist[i] + 1;
        q.push(ni);
      }
    }
    return { prev, dist };
  };

  /** pave the parent chain from tile i back to the network (inclusive root) */
  const paveChain = (start, prev) => {
    let added = 0;
    for (let i = start; i >= 0; ) {
      if (addRoad(i % 50, (i / 50) | 0)) added++;
      if (prev[i] === -1) break;
      i = prev[i];
    }
    return added;
  };

  // ------------------------------------------------------------------
  // (0) STITCH stranded road fragments. Earlier layers pave faces (a lab
  //     face, an observer stub, a tower face) by walking downhill on the hub
  //     field, and that walk can stop one tile short of the network. The old
  //     wall ring used to swallow those fragments by accident; without it
  //     they have to be joined on purpose, or the validator's
  //     one-road-component rule (rightly) fails the room.
  // ------------------------------------------------------------------
  let stitched = 0;
  let stitchTiles = 0;
  for (let round = 0; round < 8; round++) {
    const comp = liveNetwork();
    const orphans = plan.structures.road
      .concat(newRoads)
      .filter((r) => !comp.has(key(r.x, r.y)));
    if (!orphans.length) break;
    const { prev } = fieldFromNetwork();
    let progress = false;
    for (const o of orphans) {
      const oi = idx(o.x, o.y);
      if (prev[oi] === -2) continue; // buried by structures — pruned below
      const added = paveChain(oi, prev);
      if (added) {
        progress = true;
        stitchTiles += added;
        stitched++;
      }
    }
    if (!progress) break;
  }

  // ------------------------------------------------------------------
  // (1) one spur per rampart cluster
  // ------------------------------------------------------------------
  const clusters = [];
  {
    const seen = new Set();
    for (const c of cut) {
      const k0 = key(c.x, c.y);
      if (seen.has(k0)) continue;
      seen.add(k0);
      const comp = [c];
      for (let qi = 0; qi < comp.length; qi++) {
        const cur = comp[qi];
        for (const [dx, dy] of D8) {
          const k = key(cur.x + dx, cur.y + dy);
          if (seen.has(k) || !cutSet.has(k)) continue;
          seen.add(k);
          comp.push({ x: cur.x + dx, y: cur.y + dy });
        }
      }
      clusters.push(comp);
    }
  }

  // Road tiles that exist BECAUSE a wall cluster needs an approach. The prune
  // below no longer reads this list — it re-derives the same protection from
  // the clusters themselves ("every cluster keeps ONE road touching it"), which
  // is the honest form: a spur that a later eco road made redundant is not a
  // spur any more, and a cluster an eco road happens to serve never needed one.
  // Kept as reporting only.
  const spurEnds = new Set();
  const servingRoad = (cl) => {
    for (const c of cl) {
      for (const [dx, dy] of D8) {
        const k = key(c.x + dx, c.y + dy);
        if (roadSet.has(k)) return k;
      }
    }
    return null;
  };

  let spurred = 0;
  let spurTiles = 0;
  let unreachedClusters = 0;
  let servedFree = 0;
  // biggest clusters first: the long wall segments are where defenders live,
  // and an early spur often lands close enough to serve a small one for free
  for (const cl of clusters.slice().sort((a, b) => b.length - a.length)) {
    const already = servingRoad(cl);
    if (already) {
      spurEnds.add(already);
      servedFree++;
      continue;
    }
    if (cl.length < MIN_CLUSTER) continue;
    const { prev, dist } = fieldFromNetwork();
    let best = -1;
    for (const c of cl) {
      for (const [dx, dy] of D8) {
        const x = c.x + dx,
          y = c.y + dy;
        if (x < 1 || y < 1 || x > 48 || y > 48) continue;
        const i = idx(x, y);
        if (prev[i] === -2) continue; // no interior approach at all
        if (best < 0 || dist[i] < dist[best]) best = i;
      }
    }
    if (best < 0 || dist[best] > MAX_SPUR) {
      unreachedClusters++;
      continue;
    }
    spurTiles += paveChain(best, prev);
    spurEnds.add(key(best % 50, (best / 50) | 0));
    spurred++;
  }

  // ------------------------------------------------------------------
  // (2) filler-face safety net — a ROAD on a D4 face of every extension.
  //     Layer 6 grows the mass along corridors, so this should add ~0.
  // ------------------------------------------------------------------
  const beforeFiller = newRoads.length;
  let unreachableExts = 0;
  let servedExts = 0;
  {
    const { prev, dist } = fieldFromNetwork();
    for (const e of plan.structures.extension || []) {
      if (D4.some(([dx, dy]) => roadSet.has(key(e.x + dx, e.y + dy)))) continue;
      let face = -1;
      for (const [dx, dy] of D4) {
        const x = e.x + dx,
          y = e.y + dy;
        if (x < 1 || y < 1 || x > 48 || y > 48) continue;
        const i = idx(x, y);
        if (prev[i] === -2) continue; // not in the network's interior region
        if (face < 0 || dist[i] < dist[face]) face = i;
      }
      if (face < 0) {
        unreachableExts++;
        continue;
      }
      paveChain(face, prev);
      servedExts++;
    }
  }
  const fillerTiles = newRoads.length - beforeFiller;

  // ------------------------------------------------------------------
  // (3) THE STRICT REMOVABILITY FIXPOINT.
  //
  // THE DEFECT THIS REPLACES. The old rule protected every road within D8 of
  // any structure — extensions included. Since the extension mass is grown
  // FLANKING corridors, that protected essentially every corridor tile in the
  // room by construction, and the "removability" test underneath it never got
  // a chance to fire. Measured with an independent re-derivation, 1774 of the
  // fleet's 14288 road tiles were removable without touching a single promise
  // the plan makes: whole parallel corridors survived (E18S8 ran twin
  // hub-to-controller lanes at y=18 AND y=19, 38 removable tiles in one room),
  // each of them decaying and being repaired forever for nothing.
  //
  // THE HONEST DEFINITION. A road tile may go when, after it goes:
  //   ONE NET    the road+container+sitter graph is still ONE D8 component
  //              containing the sitter, and has lost exactly this tile;
  //   STRUCTURES every structure still has a road in D8 (the validator's
  //              "no structure off the network" rule, verbatim);
  //   FILLERS    every extension still has a road on a D4 FACE (the
  //              validator's EXTROAD rule, verbatim);
  //   HAULERS    the sitter-to-container network distances are UNCHANGED —
  //              the eco lanes may not get one tile longer to save upkeep;
  //   and it is none of the four things that exist to be dead ends:
  //   swamp paving inside a corridor (a toll booth otherwise), the last road
  //   approaching a rampart cluster (the defenders' spur), the roads around
  //   the room objects (the controller ring and the eco lane ends) and the
  //   sitter's own seat.
  //
  // Everything else is upkeep with no claimant. The test repeats to fixpoint,
  // because deleting a redundant strand exposes the strand behind it, and each
  // removal re-baselines the hauler distances so the guarantee composes.
  // Deterministic row-major scan: among equally removable tiles the choice is
  // stable run to run.
  // ------------------------------------------------------------------
  const sitterK = key(plan.sitter.x, plan.sitter.y);
  const pruned = new Set();
  let nodes = new Set();

  /** the four dead-ends-by-design that are not derived from the live net */
  const staticProt = new Set([sitterK]);
  for (const [dx, dy] of D8) staticProt.add(key(plan.sitter.x + dx, plan.sitter.y + dy));
  for (const k of plan.objectTiles || []) {
    const [x, y] = k.split(",").map(Number);
    for (const [dx, dy] of D8) staticProt.add(key(x + dx, y + dy));
  }

  const facedD8 = [];
  for (const t of [
    "storage",
    "terminal",
    "link",
    "spawn",
    "tower",
    "lab",
    "nuker",
    "observer",
    "container",
    "extractor",
  ]) {
    for (const p of plan.structures[t] || []) facedD8.push(p);
  }
  // READ LIVE, NOT SNAPSHOT. Layer 7b adds and moves extensions between the
  // first prune and the last one, and a snapshot taken here would let the final
  // fixpoint delete the very road face a reflowed extension was placed for —
  // and keep protecting the stub a relocated one no longer needs.
  const extListNow = () => plan.structures.extension || [];

  /** is this swamp tile the only way across between its own road neighbours? */
  const isTollBooth = (r, liveRoads) => {
    if (!isSwamp(terrain, r.x, r.y)) return false;
    const nb = [];
    for (const [dx, dy] of D8) {
      const k = key(r.x + dx, r.y + dy);
      if (liveRoads.has(k)) nb.push([r.x + dx, r.y + dy]);
    }
    if (nb.length < 2) return false;
    const seen = new Set([0]);
    const st = [0];
    while (st.length) {
      const c = st.pop();
      for (let j = 0; j < nb.length; j++) {
        if (seen.has(j)) continue;
        if (Math.max(Math.abs(nb[c][0] - nb[j][0]), Math.abs(nb[c][1] - nb[j][1])) === 1) {
          seen.add(j);
          st.push(j);
        }
      }
    }
    return seen.size < nb.length;
  };

  const prunePass = (extraRoads) => {
    const roadList = plan.structures.road
      .concat(newRoads, extraRoads || [])
      .filter((r) => !pruned.has(key(r.x, r.y)));
    const liveRoads = new Set(roadList.map((r) => key(r.x, r.y)));
    nodes = new Set([...liveRoads, ...containerSet, sitterK]);

    // CLAIMS on the network, maintained incrementally: each claim is the set
    // of live road tiles that currently satisfy it, and a tile that is the
    // LAST member of any claim is not removable.
    const claims = [];
    const claimants = new Map(); // roadKey -> claim indices
    const claim = (keys) => {
      const s = new Set(keys.filter((k) => liveRoads.has(k)));
      const i = claims.push(s) - 1;
      for (const k of s) {
        if (!claimants.has(k)) claimants.set(k, []);
        claimants.get(k).push(i);
      }
    };
    for (const p of facedD8) claim(D8.map(([dx, dy]) => key(p.x + dx, p.y + dy)));
    for (const e of extListNow()) claim(D4.map(([dx, dy]) => key(e.x + dx, e.y + dy)));
    // the defenders' approach: every rampart cluster keeps ONE road touching it
    for (const cl of clusters) {
      const t = new Set();
      for (const c of cl) for (const [dx, dy] of D8) t.add(key(c.x + dx, c.y + dy));
      claim([...t]);
    }

    /** hauler distances on the road graph, sitter-rooted */
    const netDist = (skip) => {
      const d = new Map([[sitterK, 0]]);
      const q = [sitterK];
      for (let qi = 0; qi < q.length; qi++) {
        const cur = q[qi];
        const [x, y] = cur.split(",").map(Number);
        for (const [dx, dy] of D8) {
          const k = key(x + dx, y + dy);
          if (k === skip || d.has(k) || !nodes.has(k)) continue;
          d.set(k, d.get(cur) + 1);
          q.push(k);
        }
      }
      return d;
    };
    let base = netDist(null);

    const drop = (k) => {
      pruned.add(k);
      nodes.delete(k);
      liveRoads.delete(k);
      for (const i of claimants.get(k) || []) claims[i].delete(k);
    };

    const scan = roadList.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    for (let pass = 0; pass < 60; pass++) {
      let changed = false;
      for (const r of scan) {
        const k = key(r.x, r.y);
        if (!liveRoads.has(k)) continue;
        // degree 0: walled in by structures. No creep can stand on it, it
        // conducts nothing and it claims nothing — it goes even if it "serves".
        let deg = 0;
        for (const [dx, dy] of D8) if (nodes.has(key(r.x + dx, r.y + dy))) deg++;
        if (deg === 0) {
          drop(k);
          changed = true;
          continue;
        }
        if (staticProt.has(k)) continue;
        if ((claimants.get(k) || []).some((i) => claims[i].size === 1)) continue;
        if (isTollBooth(r, liveRoads)) continue;
        const after = netDist(k);
        if (after.size !== (base.has(k) ? base.size - 1 : base.size)) continue;
        let same = true;
        for (const c of containerSet) {
          if (after.get(c) !== base.get(c)) {
            same = false;
            break;
          }
        }
        if (!same) continue; // a hauler would walk further — not worth the tile
        drop(k);
        base = after;
        changed = true;
      }
      if (!changed) break;
    }
  };
  prunePass(null);

  // ------------------------------------------------------------------
  // (4) SWAMP HOLES IN A CORRIDOR. A swamp tile costs 5 fatigue where a road
  //     costs 1, so an unpaved swamp tile with corridor on either side of it
  //     is not a gap in the plan, it is a toll booth: the filler pays it every
  //     lap for the life of the room, and the tile is already inside the
  //     corridor's footprint so there is nothing to gain by leaving it bare.
  //
  //     The test is deliberately narrow. Plenty of swamp sits NEXT to roads;
  //     that is fine, nobody has to step on it. What matters is whether the
  //     road neighbours are reachable from one another WITHOUT crossing this
  //     tile — locally, inside the 3x3. If they already are, the pathfinder
  //     routes around on roads and the swamp is never walked. If they are not,
  //     this tile is the only way across and it gets paved.
  //
  //     Runs after the prune on purpose: pruning is what opens some of these
  //     holes, and a tile paved here is a genuine connector that the prune,
  //     which judges by adjacency to structures, would have deleted again.
  // ------------------------------------------------------------------
  let swampPaved = 0;
  {
    const live = new Set();
    for (const r of plan.structures.road.concat(newRoads)) {
      if (!pruned.has(key(r.x, r.y))) live.add(key(r.x, r.y));
    }
    /**
     * A hole is judged by the corridor, not by the wall. The eco lanes to the
     * source containers and the controller run OUTSIDE the shell by design
     * (m12), haulers walk them every trip, and a swamp tile in the middle of
     * one costs exactly what a swamp tile inside costs. `paveable` refuses the
     * exterior because it is written for spurs, which must never cross the
     * cut; a hole cannot sprawl anywhere by construction, since it is only a
     * hole if roads already run on both sides of it.
     */
    const holeLegal = (x, y) => {
      if (x < 1 || y < 1 || x > 48 || y > 48) return false;
      if (!walkable(terrain, x, y)) return false;
      const k = key(x, y);
      return !occupied.has(k) && !cutSet.has(k);
    };
    /** are this tile's road neighbours already joined without crossing it? */
    const isHole = (x, y) => {
      const k = key(x, y);
      if (live.has(k) || !isSwamp(terrain, x, y) || !holeLegal(x, y)) return false;
      // never onto a rampart that is not part of the shell: the wall line is a
      // gate we cross on purpose, a personal rampart is not
      if (rampartSet.has(k) && !cutSet.has(k)) return false;
      const nb = [];
      for (const [dx, dy] of D8) if (live.has(key(x + dx, y + dy))) nb.push([x + dx, y + dy]);
      if (nb.length < 2) return false;
      const seen = new Set([0]);
      const st = [0];
      while (st.length) {
        const c = st.pop();
        for (let j = 0; j < nb.length; j++) {
          if (seen.has(j)) continue;
          if (Math.max(Math.abs(nb[c][0] - nb[j][0]), Math.abs(nb[c][1] - nb[j][1])) === 1) {
            seen.add(j);
            st.push(j);
          }
        }
      }
      return seen.size < nb.length; // some neighbour is only reachable through us
    };
    // Deterministic row-major sweep, re-tested at paving time and repeated to
    // fixpoint. Both directions of interference are real: paving one hole can
    // JOIN the stubs either side of the hole next to it (which must then not
    // be paved as well — hence the re-test), and it can equally become a road
    // neighbour that turns a tile which was not a hole INTO one. A single pass
    // catches the first and misses the second.
    for (let round = 0; round < 4; round++) {
    const cands = [];
    for (let x = 1; x <= 48; x++) for (let y = 1; y <= 48; y++) if (isHole(x, y)) cands.push({ x, y });
    if (!cands.length) break;
    // A hole can be a tile the prune just took: pruning is exactly what opens
    // them. addRoad would refuse it (the tile is still in roadSet), so undo
    // the prune instead of laying a second road on the same tile.
    const paveHole = (x, y) => {
      const k = key(x, y);
      if (pruned.has(k)) {
        pruned.delete(k);
        nodes.add(k);
        return true;
      }
      return addRoad(x, y);
    };
    for (const h of cands.sort((a, b) => a.y - b.y || a.x - b.x)) {
      if (!isHole(h.x, h.y)) continue;
      if (paveHole(h.x, h.y)) {
        live.add(key(h.x, h.y));
        swampPaved++;
      }
    }
    }
  }

  // ------------------------------------------------------------------
  // (5) PRUNE AGAIN. A paved swamp hole is a new short way across, and the
  //     road that used to be the long way round it is now redundant — the
  //     first prune could not know that because the shortcut did not exist
  //     yet. The holes protect themselves: `isTollBooth` is evaluated against
  //     the live net on every candidate, and a tile paved because something has
  //     to cross there is a toll booth by that test's own definition.
  // ------------------------------------------------------------------
  if (swampPaved) prunePass(null);

  // ------------------------------------------------------------------
  // (5b) A ROAD THAT RUNS ALONG THE WALL IS A LADDER, NOT A GATE.
  //
  // "Roads TO ramparts, never ON them" is the doctrine, and the pipeline is
  // careful about it in every direction it controls: layer 7 refuses to pave a
  // cut tile at all (`addRoad` checks `cutSet`). The coincidences that ship come
  // from the other direction — layer 1 lays the eco lanes to the sources and the
  // controller BEFORE the shell exists, and layer 2's min-cut is then free to
  // run down one of them. 241 of the fleet's 286 road+rampart tiles are exactly
  // that and they are fine: one paved tile where the lane CROSSES the wall is a
  // gate, and a gate is what a lane needs.
  //
  // What is not fine is a run of them. Where the cut turns and follows the lane,
  // the room ships two or three consecutive paved rampart tiles — a prepared
  // surface for anything that breaks in, laid along the exact line it would want
  // to walk. E14S5 ships 42,36 42,37 42,38 with 41,36 41,37 41,38 sitting bare
  // one tile west, inside the wall, going the same way. 12 tiles in 10 rooms.
  //
  // So a run of two or more is offered the interior parallel, one tile at a
  // time, and the swap is accepted only if the network is measurably no worse:
  // the same road count, one component from the sitter, every container and
  // structure still on it, every extension still holding a D4 road face. Any
  // failure reverts the tile. A single crossing tile is never touched.
  // ------------------------------------------------------------------
  let alongCutMoved = 0;
  {
    const liveNow = () => {
      const s = new Set();
      for (const r of plan.structures.road.concat(newRoads)) {
        const k = key(r.x, r.y);
        if (!pruned.has(k)) s.add(k);
      }
      return s;
    };
    const netOK = (live) => {
      // one component from the sitter, over roads + containers
      const comp = new Set([key(plan.sitter.x, plan.sitter.y)]);
      const q = [plan.sitter];
      for (let qi = 0; qi < q.length; qi++) {
        const c = q[qi];
        for (const [dx, dy] of D8) {
          const x = c.x + dx,
            y = c.y + dy;
          const k = key(x, y);
          if (comp.has(k) || (!live.has(k) && !containerSet.has(k))) continue;
          comp.add(k);
          q.push({ x, y });
        }
      }
      for (const k of live) if (!comp.has(k)) return false;
      for (const c of plan.structures.container || []) {
        const k = key(c.x, c.y);
        if (comp.has(k)) continue;
        if (!D8.some(([dx, dy]) => comp.has(key(c.x + dx, c.y + dy)))) return false;
      }
      for (const e of plan.structures.extension || []) {
        if (!D4.some(([dx, dy]) => live.has(key(e.x + dx, e.y + dy)))) return false;
      }
      return true;
    };
    let live = liveNow();
    const onCut = (k) => cutSet.has(k);
    const runTiles = [];
    for (const c of cut) {
      const k = key(c.x, c.y);
      if (!live.has(k)) continue;
      // "along" = at least one D4 neighbour is ALSO a paved cut tile
      if (!D4.some(([dx, dy]) => onCut(key(c.x + dx, c.y + dy)) && live.has(key(c.x + dx, c.y + dy)))) continue;
      runTiles.push(c);
    }
    runTiles.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const c of runTiles) {
      const k = key(c.x, c.y);
      if (!live.has(k)) continue;
      // the interior parallel: a D4 neighbour that is inside the wall, free
      // floor, not the wall itself and not already paved
      let target = null;
      for (const [dx, dy] of D4) {
        const x = c.x + dx,
          y = c.y + dy;
        const tk = key(x, y);
        if (x < 1 || y < 1 || x > 48 || y > 48) continue;
        if (!walkable(terrain, x, y) || ext[idx(x, y)]) continue;
        if (occupied.has(tk) || cutSet.has(tk) || live.has(tk)) continue;
        target = { x, y, k: tk };
        break;
      }
      if (!target) continue;
      const trial = new Set(live);
      trial.delete(k);
      trial.add(target.k);
      if (!netOK(trial)) continue;
      live = trial;
      pruned.add(k);
      if (!plan.structures.road.some((r) => r.x === target.x && r.y === target.y)) {
        newRoads.push({ x: target.x, y: target.y });
        roadSet.add(target.k);
      } else {
        pruned.delete(target.k);
      }
      alongCutMoved++;
    }
  }

  // ------------------------------------------------------------------
  // (6) THE EXTENSION REFLOW — the floor the prune just freed.
  //
  // Everything above this line has been deleting corridor. Each deleted tile is
  // interior floor again: deep, inside the wall, and still touching the road
  // that used to run through it. Layer 6 could not have used it — it did not
  // exist as floor when layer 6 ran — and until now nothing looked at it again,
  // which is why E9S2 declared four extensions impossible while standing on
  // four pruned road tiles that hold them. See reflowExtensions in layer-ext.
  //
  // It runs BEFORE the last prune deliberately: relocating an extension can
  // orphan the stub that served it, and the fixpoint below is the pass that
  // already knows how to retire a road with no claimant.
  // ------------------------------------------------------------------
  const liveRoadKeys = new Set(
    plan.structures.road
      .concat(newRoads)
      .map((r) => key(r.x, r.y))
      .filter((k) => !pruned.has(k)),
  );
  const reflow = reflowExtensions(terrain, plan, liveRoadKeys);
  // the reflow may buy a road face for a deep tile, and may rent a personal
  // rampart to close a 60/60 gap. Both are its own output; they join this
  // layer's arrays so the prune below arbitrates them like any other road.
  // A tile the reflow paves is very often one THIS PASS just pruned — that is
  // the whole point, the freed corridor is where the free floor is. Two things
  // follow. It must come off the `pruned` set, or the fixpoint below filters
  // out both copies and the new extension ships with no road face at all
  // (E9S2's 35,15 lost its 34,15 face exactly this way). And it must not be
  // pushed twice: if the tile is still sitting in `plan.structures.road` as a
  // ghost, un-pruning it IS the whole edit.
  if (reflow.roads.length) {
    const already = new Set(plan.structures.road.map((r) => key(r.x, r.y)));
    for (const rd of reflow.roads) {
      const k = key(rd.x, rd.y);
      pruned.delete(k);
      if (!already.has(k)) newRoads.push(rd);
    }
  }
  if (reflow.shallowRamparts.length && plan.structures.rampart) {
    plan.structures.rampart.push(...reflow.shallowRamparts);
  }
  if (plan.meta) {
    plan.meta.counts = plan.meta.counts || {};
    plan.meta.counts.extension = plan.structures.extension.length;
  }
  // a relocation can leave the stub that served the vacated slot claiming
  // nothing — re-run the fixpoint so the room does not pay for it forever
  if (reflow.moved.length || reflow.added.length) prunePass(null);

  const keptNew = newRoads.filter((r) => !pruned.has(key(r.x, r.y)));
  const removeRoads = plan.structures.road.filter((r) => pruned.has(key(r.x, r.y)));

  // ------------------------------------------------------------------
  // (6b) THE TRUTH PASS runs in finalizeRoom, not here — see that function.
  //
  // It used to run at (0a2), before the roads and before 7b, and it was
  // wrong in the way an ordering bug is always wrong: quietly, in prose, about a
  // room that had not finished existing. What it published:
  //
  //   · `redundantCut.reasons` — 12 tiles across 6 rooms each claiming "the
  //     structure at X,Y would drop from depth 4 to 3". Measured on the shipped
  //     plan every one of them drops 4 -> 0: the named structure leaves the wall
  //     entirely, because 7b retired the personal rampart that was holding it.
  //     E11S7's five (17,2 18,2 19,2 20,2 21,2) are the standing example, and the
  //     same strings are printed verbatim into meta.notes.
  //   · `mobilityShipped` — stale in 6 rooms (E11S1 0.95 vs 0.96 and maxDetour 1
  //     vs 2, E11S7, E13S2, E8S7, E9S4, E9S9), for the same reason: 7b adds
  //     extensions and retires ramparts after the measurement was taken.
  //   · the shipped-battery, adopted-seal and unreachable-wall declarations, all
  //     of them arguing about a wall 7b could still change.
  //
  // The fix is the ordering, not the strings: layer 7 is allowed exactly one
  // moment at which the room is finished, and this is it. The prune is re-run
  // to a fixpoint against the shipped board — it deletes nothing in 172/172,
  // which is the property that makes the earlier run's DECISIONS safe, and its
  // refusal reasons are now measured on the tiles the room ships rather than on
  // the tiles it had before the reflow.
  // ------------------------------------------------------------------
  // ...and the truth pass itself is NOT run here. See finalizeRoom below: it is
  // about the room that SHIPS, and this function runs once per rung of the
  // escalation ladder (up to four per seed). Running the re-derivation on every
  // composition was measured at 486s of in-planner time against 120s — four
  // times the cost to produce four answers, three of which are thrown away.
  // What this function keeps is the state the pass needs: which ramparts the
  // early prune took, and what layer 2 counted before anything re-measured.
  plan.wallPassState = { inertPruned, unreachableAtLayer2 };

  return {
    layer: "late-roads",
    roads: keptNew,
    removeRoads, // caller drops these from the earlier layers' road list
    wallMeta: {
      ringTiles: 0, // the ring is deliberately unpaved now
      stitched,
      stitchTiles,
      clusters: clusters.length,
      spurred,
      spurTiles,
      servedFree,
      unreachedClusters,
      fillerTiles,
      servedExts,
      pruned: pruned.size,
      swampPaved,
      // paved cut tiles moved onto the interior parallel — see (5b)
      alongCutMoved,
      unreachableExts,
      // filled by finalizeRoom, on the winning composition only
      mobility: null,
      // layer 7b — what the post-prune reflow found and did
      reflow,
      // ramparts deleted because deleting them changed nothing measurable —
      // doubled wall the earlier layers' own additions made redundant
      inertPruned: inertPruned.length,
      // ...also filled by finalizeRoom
      sealedFloor: null,
    },
  };
}

/**
 * ==========================================================================
 * THE TRUTH PASS — every derived number and every published sentence, once,
 * on the room that ships.
 * ==========================================================================
 *
 * The pipeline composes up to four shells per seed and throws all but one away.
 * Every layer up to here is therefore written to be re-runnable and cheap, and
 * the RE-DERIVATION is not: it re-floods, re-walks all-pairs over the wall and
 * re-runs the inert prune to a fixpoint. It belongs to the winner, once.
 *
 * It also has to be LAST, and that is the round-8 finding it exists for. These
 * measurements used to be taken at the top of planWallRoads, before the roads
 * and before layer 7b, and they published prose about a room that had not
 * finished existing:
 *
 *   · `redundantCut.reasons` — 12 tiles across 6 rooms each claiming "the
 *     structure at X,Y would drop from depth 4 to 3". Re-measured on the shipped
 *     plan every one of them drops 4 -> 0: the named structure leaves the wall
 *     entirely, because 7b had retired the personal rampart holding it. E11S7's
 *     five (17,2 18,2 19,2 20,2 21,2) are the standing example, and the strings
 *     are printed verbatim into meta.notes.
 *   · `mobilityShipped` — stale in 6 rooms (E11S1 0.95 vs 0.96 and maxDetour 1
 *     vs 2, plus E11S7, E13S2, E8S7, E9S4, E9S9).
 *   · the SEALED INTERIOR FLOOR note's shallow-extension count — stale in 8
 *     rooms, and in 7 of them contradicted by another note in the same array
 *     (E11S7 said 11 in one and 5 in the other; E9S9 said 10 against a real 0).
 *   · the shipped-battery, adopted-seal and unreachable-wall declarations, all
 *     arguing about a wall 7b could still move.
 *
 * The prune is re-run here to a fixpoint against the shipped board. It deletes
 * nothing in 172/172 — which is exactly the property that makes the earlier
 * run's DECISIONS safe to keep — and what it produces that matters is a refusal
 * reason measured on the tiles the room ships.
 */
/**
 * ------------------------------------------------------------------------
 * THE NUKE WINDOW, MEASURED OVER THE SET IT IS DEFINED AS.
 * ------------------------------------------------------------------------
 * The goal document defines the metric as "the fullest 5x5 window, counted over
 * spawn / storage / terminal / NUKER / tower, excluding the lab diamond (a
 * mandated 4x4 stamp cannot be dispersed)". `meta.towers.nukeWindow` was
 * produced by layer 3, which runs two layers before the nuker is placed, so the
 * array it iterated was empty and the published number was the window over
 * spawn/storage/terminal/tower. Measured on the round-9 fleet: the shipped
 * window exceeds the published `after` by exactly 1 in 145 of 172 rooms; E6S1
 * and E6S9 ship 11 and published 10; and the nuker lands inside its own room's
 * worst 5x5 in 154 of 172. The fleet headline in the goal doc (worst 11, mean
 * 7.97) was the TRUE number and was therefore inconsistent with the per-room
 * field it was summarising (max 10, mean 7.13).
 *
 * So the field is written HERE, from the shipped structure lists, after every
 * layer that places one of them has run. Layer 3's own before/after survives as
 * `meta.towers.towerDispersion` — the freedom that layer had and what it spent
 * — which is a true statement about a different set, published under a name
 * that says so. validate.mjs re-derives this from `plan.structures` and fails
 * the room if the two disagree, so neither field can rot again without the
 * suite noticing.
 */
const NUKE_WINDOW_TYPES = ["spawn", "storage", "terminal", "nuker", "tower"];
function recomputeNukeWindow(plan) {
  if (!plan.meta?.towers) return;
  const pts = [];
  for (const t of NUKE_WINDOW_TYPES) {
    for (const p of plan.structures[t] || []) pts.push({ x: p.x, y: p.y, t });
  }
  let mx = 0;
  let at = null;
  // every maximal window contains some structure, so centring on each of them
  // and sweeping the 5x5 offsets around it covers all of them
  for (const a of pts) {
    for (let ox = -2; ox <= 2; ox++) {
      for (let oy = -2; oy <= 2; oy++) {
        const cx = a.x + ox,
          cy = a.y + oy;
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
  const inWindow = at
    ? pts.filter((p) => Math.abs(p.x - at.x) <= 2 && Math.abs(p.y - at.y) <= 2)
    : [];
  const nuker = (plan.structures.nuker || [])[0] || null;
  plan.meta.towers.nukeWindow = {
    // the number of record: the worst 5x5 over the shipped high-value mass
    value: mx,
    center: at,
    counted: NUKE_WINDOW_TYPES.slice(),
    // ...and what is IN it, so the number can be argued with tile by tile
    holds: inWindow.map((p) => ({ x: p.x, y: p.y, type: p.t })),
    // the one structure layer 3 could not see, and whether it is in the window
    nuker: nuker ? { x: nuker.x, y: nuker.y } : null,
    nukerInWindow: !!(nuker && at && Math.abs(nuker.x - at.x) <= 2 && Math.abs(nuker.y - at.y) <= 2),
    // what layer 3 measured, over the set layer 3 had — kept so the difference
    // between "the freedom this layer spent" and "the room's exposure" is one
    // subtraction rather than an argument
    towerOnly: plan.meta.towers.towerDispersion
      ? plan.meta.towers.towerDispersion.after
      : null,
    note:
      `the fullest 5x5 window over ${NUKE_WINDOW_TYPES.join("/")}, excluding the lab diamond (a ` +
      `mandated 4x4 stamp cannot be dispersed). Measured on the SHIPPED structures after layer 5, ` +
      `which is the first moment the nuker exists; meta.towers.towerDispersion is layer 3's own ` +
      `before/after over spawn/storage/terminal/tower and is a different, smaller set by construction.`,
  };
}

/**
 * ------------------------------------------------------------------------
 * THE REFILL WALK, RE-DERIVED ON THE BASE THE ROOM SHIPS.
 * ------------------------------------------------------------------------
 * `meta.towers.refillDists` is measured by layer 3, which is the only layer
 * that can explain the battery — and layer 3 runs before the labs, the nuker,
 * the observer and sixty extensions exist. Every one of those is an
 * OBSTACLE_OBJECT_TYPE, so the walk layer 3 measures is a walk across an empty
 * room. It is a pre-mass number nobody re-derived, which is the exact defect
 * shape this round closed three times over (the upgrader parks eaten by later
 * layers, the nuke window measured before the nuker, the lap measured before
 * the mass): a published metric, taken early, never checked, with the
 * validator's cross-check written to reproduce the PRODUCER's board rather
 * than the shipped one.
 *
 * Fleet effect when it was measured honestly: 15 of 172 rooms walk further than
 * they published, up to +3, and the count over the 8-step REFILL_NOTE line goes
 * 15 -> 17. Two of the extra rooms shipped no shortfall at all (E12S4 published
 * maxRefill 7 and walked 9; E18S3 published 6 and walked 9) while E8S4, at the
 * same as-built number, did declare — so the threshold was real and two rooms
 * were under it in silence.
 *
 * So the number of record is taken here, last, on the whole as-built board, and
 * layer 3's own reading is kept beside it under a name that says what it is.
 * The walk is `arriveAt` semantics on purpose: the filler stands NEXT to the
 * tower (a tower is an obstacle, it cannot stand on it), which is the same
 * scale layer 3 and the validator both use.
 */
function recomputeRefill(terrain, plan) {
  const tw = plan.meta?.towers;
  const towers = plan.structures?.tower || [];
  if (!tw || !towers.length || !plan.sitter) return;
  const blocked = new Set(plan.objectTiles || []);
  for (const t of BUILT_OBSTACLES) {
    for (const p of plan.structures[t] || []) blocked.add(key(p.x, p.y));
  }
  const field = walkFieldFrom(terrain, plan.sitter, blocked);
  const dists = towers.map((t) => {
    const v = field[idx(t.x, t.y)];
    if (v < REFILL_UNREACHED) return v;
    let best = REFILL_UNREACHED;
    for (const [dx, dy] of D8) {
      const x = t.x + dx,
        y = t.y + dy;
      if (x < 0 || y < 0 || x > 49 || y > 49) continue;
      const w = field[idx(x, y)];
      if (w < REFILL_UNREACHED && w + 1 < best) best = w + 1;
    }
    return best;
  });
  const atPlacement = tw.refillDists;
  tw.refillDistsAtPlacement = atPlacement;
  tw.maxRefillAtPlacement = tw.maxRefill;
  tw.refillDists = dists;
  tw.maxRefill = Math.max(...dists);
  tw.refillUnreachable = dists.filter((d) => d >= REFILL_UNREACHED).length;
  tw.refillBasis =
    `re-derived at finalizeRoom over the WHOLE as-built board — every OBSTACLE_OBJECT_TYPE the room ` +
    `ships blocks (spawn, extension, link, storage, tower, observer, lab, terminal, nuker) plus the ` +
    `source / controller / mineral tiles; roads, containers and our own ramparts are walkable. Layer 3's ` +
    `reading, over the board it could see, is kept as refillDistsAtPlacement.`;
  return { dists, atPlacement };
}

/** BFS walk field from `origin`, D8, `blocked` a Set of "x,y" keys. */
function walkFieldFrom(terrain, origin, blocked) {
  const dist = new Int16Array(2500).fill(REFILL_UNREACHED);
  dist[idx(origin.x, origin.y)] = 0;
  const q = [idx(origin.x, origin.y)];
  let qi = 0;
  while (qi < q.length) {
    const i = q[qi++];
    const x = i % 50,
      y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      if (!walkable(terrain, nx, ny) || blocked.has(key(nx, ny))) continue;
      const ni = nx + ny * 50;
      if (dist[ni] <= dist[i] + 1) continue;
      dist[ni] = dist[i] + 1;
      q.push(ni);
    }
  }
  return dist;
}
const REFILL_UNREACHED = 9999;

/**
 * ...and the declaration that goes with it. REFILL_NOTE is layer 3's own line
 * ("legal, not good"), so a room that crosses it on the SHIPPED board owes the
 * same sentence — whether or not layer 3 had any reason to speak.
 */
function declareShippedRefill(plan, re) {
  const tw = plan.meta?.towers;
  if (!tw || !re) return;
  const max = tw.maxRefill;
  if (max <= REFILL_NOTE) return;
  plan.meta.shortfalls = plan.meta.shortfalls || [];
  const already = plan.meta.shortfalls.find((sf) => sf && sf.kind === "weak-battery");
  const grew = tw.maxRefillAtPlacement !== null && max > tw.maxRefillAtPlacement;
  const line =
    `AS BUILT the furthest tower is a ${max}-step refill walk from the sitter` +
    (tw.refillUnreachable ? ` (${tw.refillUnreachable} tower(s) the filler cannot reach at all)` : "") +
    ` — over the ${REFILL_NOTE}-step line at which a refill trip costs more than the tower's own reload ` +
    `(the hard cap is ${MAX_REFILL}). Walks, nearest first: ${dstr(tw.refillDists)}. ` +
    (grew
      ? `Layer 3 measured ${tw.maxRefillAtPlacement} for the same battery and was not wrong about its own ` +
        `board: it runs before the labs, the nuker, the observer and sixty extensions exist, and all of ` +
        `those are obstacles. The ${max} is what the filler walks around the finished base ` +
        `(${dstr(tw.refillDistsAtPlacement)} at placement).`
      : `Layer 3 measured the same ${tw.maxRefillAtPlacement} with the battery standing in its own way, ` +
        `and the finished mass adds nothing to it.`) +
    ` The tower layer's own repair search is quoted in the layer-3 record below where there is one; ` +
    `nothing is relocated HERE, because moving a tower after the wall, the roads and the nuke window ` +
    `have all been measured against it would invalidate three declarations to fix one.`;
  if (already) {
    already.detail = `${line} — · — ${already.detail}`;
    already.towers = { ...(already.towers || {}), shippedMaxRefill: max, shippedRefillDists: tw.refillDists };
    return;
  }
  plan.meta.shortfalls.push({
    gate: "towers",
    kind: "weak-battery",
    detail: `THIS BATTERY IS LEGAL, NOT GOOD. ${line}`,
    tiles: (plan.structures.tower || []).map((t) => ({ x: t.x, y: t.y })),
    towers: {
      shippedMaxRefill: max,
      shippedRefillDists: tw.refillDists,
      atPlacement: tw.maxRefillAtPlacement,
    },
  });
}
const dstr = (a) => (a || []).slice().sort((x, y) => x - y).join("/");

export function finalizeRoom(terrain, plan) {
  if (!plan || plan.error || !plan.shell || !(plan.shell.cut || []).length) return plan;
  if (plan.meta?.finalized) return plan;
  const st = plan.wallPassState || { inertPruned: [], unreachableAtLayer2: 0 };
  const inertPrunedLate = pruneInertRamparts(terrain, plan);
  const allInertPruned = (st.inertPruned || []).concat(inertPrunedLate);
  if (inertPrunedLate.length) {
    plan.shell.inertPruned = allInertPruned;
    if (plan.meta?.walls) plan.meta.walls.inertPruned = allInertPruned.length;
  }
  const rec = reconcileSeal(terrain, plan);
  const adopted = rec?.adopted || [];
  const cutChanged = allInertPruned.length > 0 || adopted.length > 0;
  const shipDmg = remeasureShell(
    terrain,
    plan,
    cutChanged
      ? `${allInertPruned.length} tile(s) pruned as inert, ${adopted.length} adopted into the cut by ` +
          `the single-removal seal test — re-derived after layer 7b, on the mass the room ships`
      : `cut unchanged by layer 7, but the shipped rampart set includes every bubble laid by layers ` +
          `2-6 and every personal rampart layer 7b retired or rented, so the exterior — and every ` +
          `metric taken against it — is re-derived over the union rather than over the min-cut ring ` +
          `layer 2 negotiated`,
  );
  if (adopted.length) declareAdoptedSeal(plan, adopted, shipDmg);
  if (shipDmg) declareShippedBattery(plan, shipDmg);
  declareUnreachableCut(plan, st.unreachableAtLayer2 || 0);
  noteRedundantCut(terrain, plan, rec?.sealCritical, allInertPruned);

  // the lap, on the mass and the wall the room actually ships — and the room's
  // ONE mobility declaration, filed off it
  const mobility = verifyMobility(terrain, plan);
  if (plan.meta?.walls) plan.meta.walls.mobility = mobility;

  // ...and the same reading in the field the gallery and the census headline.
  // It used to be taken in composePlan, i.e. once per rung and before this pass
  // could move the wall under it.
  if (plan.meta?.shell) {
    plan.meta.shell.mobilityBuilt = builtMobility(terrain, plan);
    // ONE CAUSE PER ROOM. `builtMobility` labels the worst pair with the old
    // pair-level heuristic; verifyMobility above has just run the whole-room
    // lift test on the same board. Two structured fields disagreeing about one
    // room is the exact defect the lift test exists to end (E16S5 shipped
    // `mobilityBuilt.cause: "terrain"` over a miss that is one observer tile),
    // so the verdict is copied here and the pair-level label is kept beside it
    // under a name that says what it is about.
    if (plan.meta.shell.mobilityBuilt && mobility && mobility.cause) {
      plan.meta.shell.mobilityBuilt.pairCause = plan.meta.shell.mobilityBuilt.cause;
      plan.meta.shell.mobilityBuilt.cause = mobility.cause;
      plan.meta.shell.mobilityBuilt.lift = mobility.lift || null;
    }
  }

  // THE NUKE WINDOW, over a set that finally includes the nuker — see
  // recomputeNukeWindow. Layer 3 published a field it could not measure.
  recomputeNukeWindow(plan);

  // ...and the refill walk, over a board that finally includes the mass. See
  // recomputeRefill: the same defect shape, on the one battery number nobody
  // had ever re-measured.
  declareShippedRefill(plan, recomputeRefill(terrain, plan));

  const sealedFloor = noteSealedFloor(terrain, plan, plan.meta?.extensions?.shallow);
  if (plan.meta?.walls) plan.meta.walls.sealedFloor = sealedFloor;
  if (plan.meta) plan.meta.finalized = true;
  delete plan.wallPassState;
  // layer 6's worst-case blocked set, handed to layer 7b so it could re-derive
  // the bound it beat. Nothing downstream reads it and nothing serialises it.
  delete plan.extBoundModel;
  return plan;
}
