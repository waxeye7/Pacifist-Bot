/**
 * Pacifist base planner v2 — layer runner
 *
 * Currently: hub only (layer 1). RCL8 final positions.
 * Gallery uses real Screeps structure SVGs.
 *
 *   node tools/plan-suite/v2/plan.mjs
 *   node tools/plan-suite/v2/plan.mjs --rooms E2S7,E5S1
 *   node tools/plan-suite/v2/plan.mjs --all-claimable
 */
import fs from "fs";
import path from "path";
import {
  OUT_V2,
  GOLDEN,
  fetchRoomsFromMongo,
  fetchAllClaimableRooms,
  planStructureHash,
} from "./shared.mjs";
import {
  renderRoomSvg,
  renderThumbSvg,
  thumbLegendHtml,
  hubCrop,
  legendHtml,
  iconLayers,
  iconDataUri,
  ROAD_PAINT,
  RAMPART_PAINT,
} from "./render.mjs";
import { EXT_TARGET, planRoom, redeclareEcoTax, setFleetMedians } from "./pipeline.mjs";
import { LATE_KINDS, LATE_ORDER, lateRoadDecomp, renderRoadsPruneNote } from "./layer-walls.mjs";
// the unjudged-lap sentence, written once — see mobilityUnjudgedWhy below
import { unjudgedReason } from "./declprose-mobility.mjs";

/**
 * Sprite kinds the animation player rasterises. Same names render.mjs uses, so
 * `iconLayers` hands back the SAME file stack the gallery SVG draws.
 */
const ANIM_SPRITE_TYPES = [
  "extension",
  "storage",
  "terminal",
  "tower",
  "lab",
  "link",
  "nuker",
  "observer",
  "extractor",
  "spawn",
  "container",
  "source",
  "mineral",
  "controller",
];

/**
 * The gallery's own base64 embedder, once per page, keyed by structure type.
 * The player rasterises each stack into a tile-sized offscreen canvas — it does
 * not own an icon table of its own, because a second table is a table that
 * drifts.
 */
function animSprites() {
  const out = {};
  for (const t of ANIM_SPRITE_TYPES) {
    const layers = iconLayers(t)
      .map((l) => ({ u: iconDataUri(l.file), s: l.scale }))
      .filter((l) => l.u);
    if (layers.length) out[t] = layers;
  }
  return out;
}

/**
 * The claims stage is the one stage whose tiles are HETEROGENEOUS — storage,
 * terminal, links, spawns and containers all land in it — and the frame file
 * only carries a colour. Rather than reverse-engineering the type back out of
 * the palette (which would break the moment a colour changed), the type is read
 * straight off the shipped plan and matched by coordinate. Every other stage is
 * one type by construction, so a stage->type map covers it.
 */
function animClaimKinds(plan) {
  const out = {};
  for (const t of ["container", "link", "spawn", "terminal", "storage"]) {
    for (const p of plan.structures[t] || []) out[`${p.x},${p.y}`] = t;
  }
  return out;
}

// THE LAYER-7 ROAD KINDS AND THE PER-ROOM TALLY NOW LIVE IN layer-walls.mjs,
// beside the pass that records `roadKind` in the first place — because the FILM
// needs them too. export-anim.mjs hardcoded its layer-7 frame banner ("rampart
// spurs and the ext-face net") while this file was already composing a correct
// per-room name/why/chip from the tally, so 20 rooms shipped a film whose banner
// contradicted the STAGE_TEXT panel three inches to its right. Two copies of a
// caption in two files is how that happens; there is one copy and three readers.

/**
 * PER-ROOM STAGE TEXT — the banner name, the banner why and the chip, for the
 * stages whose static STAGE_INFO row cannot be true of every room. Shipped into
 * the page next to NOTES and applied in the player's `info()`; a stage absent
 * from this map keeps its static row, which is every stage but one.
 */
function animStageText(plan) {
  const out = {};
  const d = lateRoadDecomp(plan);
  if (!d.laid) return out;
  const unnamed = d.laid - d.named;
  if (!d.kinds.length) {
    const u = LATE_KINDS.unclassified;
    out.roadsLate = { name: u.name, why: u.why, chip: u.chip };
  } else if (d.kinds.length === 1 && !unnamed) {
    const k = LATE_KINDS[d.kinds[0]];
    out.roadsLate = { name: k.name, why: k.why, chip: k.chip };
  } else {
    const whys = d.kinds.map((k) => LATE_KINDS[k].why);
    if (unnamed) whys.push(LATE_KINDS.unclassified.why);
    // no count in front of the list: the unattributed bucket is a finding, not
    // a job, so "N of layer 7's jobs" would be counting it as one
    out.roadsLate = {
      name: "the late road pass",
      why: `what layer 7 laid in this room — ${whys.join(" · ")}`,
      chip: "7 · late roads",
    };
  }
  return out;
}

/**
 * PER-LAYER CAPTIONS, READ OFF THE PLAN — NEVER INVENTED.
 *
 * Each string below is assembled from a number the planner already published
 * (meta.counts, meta.towers, meta.extensions, meta.shellEscalation, shell.*).
 * If the plan does not carry the number, the layer gets no caption; a made-up
 * caption on a film whose whole selling point is "this is what actually
 * happened" would be the worst possible bug.
 */
function animNotes(plan) {
  const m = plan.meta || {};
  const c = m.counts || {};
  const n = {};

  if (plan.seed && plan.hub) {
    n.seed = `seed (${plan.seed.x},${plan.seed.y}) → hub (${plan.hub.x},${plan.hub.y})`;
  }
  if (m.coreSize != null) n.core = `${m.coreSize} tiles in the pocket`;
  n.claims =
    `${c.spawn ?? 0} spawns · ${c.container ?? 0} containers · ${c.link ?? 0} links` +
    (m.storageAccessD4 != null ? ` · storage reachable from ${m.storageAccessD4} sides` : "");
  // ------------------------------------------------------------------
  // ROAD CAPTIONS ARE PER LAYER NOW, AND EACH ONE COUNTS ONLY ITS OWN TILES.
  //
  // There used to be exactly one road caption, and it read: "<total> road
  // tiles — hub, spawns, sources, controller, plus the layer-7 rampart spurs
  // (drawn here so the web reads as one net)". The parenthesis was an honest
  // admission that the film was showing a frame that never existed, and it
  // was attached to the frame a reviewer needs in order to check layer 4's lab
  // declaration. The film now emits each layer's roads at that layer (see
  // roadProvenance in export-anim.mjs), so each caption states what THAT layer
  // laid, read off meta.roadLayer rather than asserted.
  // ------------------------------------------------------------------
  const rl = m.roadLayer || {};
  const aliveRoads = new Set((plan.structures.road || []).map((r) => `${r.x},${r.y}`));
  const perLayer = {};
  let ghosts = 0;
  for (const k of Object.keys(rl)) {
    perLayer[rl[k]] = (perLayer[rl[k]] || 0) + 1;
    if (!aliveRoads.has(k)) ghosts++;
  }
  const laid = (l) => perLayer[l] || 0;
  const total = c.road ?? aliveRoads.size;
  if (laid(1)) {
    n.roads = `${laid(1)} tiles laid with the hub kit, before the wall exists — the finished room ships ${total} across every layer`;
  } else if (c.road != null) {
    n.roads = `${total} road tiles`;
  }
  if (laid(3)) n.roadsTwr = `${laid(3)} tiles — refill spurs to the towers layer 3 has just placed`;
  if (laid(4)) {
    n.roadsLab =
      `${laid(4)} tiles — access to the lab diamond, laid AFTER it: the anchor scan rejects a diamond ` +
      `that touches the road network, so this road cannot exist while the labs are being chosen`;
  }
  if (laid(5)) n.roadsMisc = `${laid(5)} tiles — the run out to the mineral seat`;
  if (laid(6)) {
    n.roadsExt =
      `${laid(6)} corridor tiles — the extension mass grows off these faces` +
      (m.extensions ? ` (${m.extensions.stubRoads} stub roads by layer 6's own count)` : "");
  }
  // The layer-7 note is composed from LATE_KINDS / lateRoadDecomp above — the
  // same tally animStageText uses for this stage's name, why and chip, so the
  // four channels the player renders side by side cannot disagree about which
  // of layer 7's jobs this room actually ran. `unclassified` is deliberately
  // printable rather than swept into a neighbouring label: a tile this layer
  // laid and cannot name is a finding.
  if (laid(7)) {
    const d = lateRoadDecomp(plan);
    const parts = d.kinds.map((kk) => {
      const L = LATE_KINDS[kk];
      return `${d.tally[kk]} ${d.tally[kk] === 1 ? L.one : L.many}`;
    });
    if (d.named < d.laid) parts.push(`${d.laid - d.named} with no recorded sub-kind`);
    n.roadsLate =
      `${d.laid} tile${d.laid === 1 ? "" : "s"} — ${parts.length ? parts.join(" · ") : "no recorded sub-kind"}` +
      (d.tally.spur && m.walls ? ` · ${m.walls.spurred}/${m.walls.clusters} wall clusters served` : "");
  }
  if (ghosts) {
    // The film erases GHOSTS (roadLayer tags with no shipped road). pruned
    // also counts transients the film never drew. Name both; do not jam them.
    n.roadsPrune = renderRoadsPruneNote({
      ghosts,
      pruned: m.walls && typeof m.walls.pruned === "number" ? m.walls.pruned : ghosts,
      transient: m.walls && typeof m.walls.prunedTransient === "number" ? m.walls.prunedTransient : 0,
    });
  }

  const bits = [];
  const esc = m.shellEscalation;
  if (esc && esc.walked) {
    const why = [];
    if (esc.why?.demand) why.push("the tight wall left no deep floor for the program");
    if (esc.why?.shallow) why.push("extensions were being forced onto shallow, exposed tiles");
    if (esc.why?.mobility) why.push("defenders could not out-walk an attacker around the wall");
    const tried = `${esc.steps} composition${esc.steps === 1 ? "" : "s"} tried`;
    // A WALK IS NOT A PURCHASE. Most rooms that walk the ladder walk it and
    // come home: pickedNeedDeepBonus 0 means the wider bubbles were composed,
    // priced and REJECTED. Reporting that as "bought a wider wall" would put a
    // purchase on the caption of a room that bought nothing.
    bits.push(
      (esc.pickedNeedDeepBonus > 0
        ? `ESCALATED — bought a wider wall (+${esc.pickedNeedDeepBonus} deep-tile demand, ${tried})`
        : `WALKED THE LADDER — ${tried}, and the cheapest cut still won`) +
        (why.length ? ` because ${why.join(" and ")}` : ""),
    );
  }
  // ------------------------------------------------------------------
  // THE WALL CAPTION HAS TO STATE THE NUMBER THE WALL IS JUDGED ON.
  //
  // The escalation clause above can say "defenders could not out-walk an
  // attacker around the wall" and then stop, which is what it did. In E16S1 and
  // E9S2 — the two rooms an audit walked end to end — mobility is the only gate
  // either room misses, and the film put no number on it anywhere: nothing in
  // either film distinguished a badly failing lap from a marginal one. The
  // number is published, so the caption states it. (Round 19: this comment
  // quoted a lap for E16S1 that belongs to a different room. A figure typed
  // into a comment beside the code that prints the real one has no owner and no
  // re-derivation — same disposal as the index badge's count below, and see
  // criticism 69/80.)
  //
  // WHICH READING, AND WHY NOT THE OTHER ONE. meta.walls.mobility.builtGated
  // is the AS-BUILT GATED lap: measured with the extension mass standing in
  // the room, over the pairs whose absolute detour clears the floor. It is the
  // reading the target is applied to and the one the room page headlines.
  // meta.shell.mobility is layer 2's negotiation reading, taken on the bare cut
  // before any mass exists — a different quantity that disagrees, by a lot, in
  // the rooms that miss (both readings are on every room page, side by side and
  // each named; neither is copied into a comment here, because a copy of a
  // measurement is a measurement that goes stale — round 19, criticism 80) — and
  // putting it on a caption about the wall this room
  // ships is how two numbers about one room end up looking like one number
  // arguing with itself. Only the target and the detour floor are read out of
  // meta.shell.mobility, because that is where the layer publishes them.
  // ------------------------------------------------------------------
  const wmob = m.walls?.mobility;
  const smob = m.shell?.mobility;
  const lap =
    typeof wmob?.builtGated === "number"
      ? wmob.builtGated
      : typeof m.shell?.mobilityBuilt?.maxGated === "number"
        ? m.shell.mobilityBuilt.maxGated
        : null;
  if (lap !== null) {
    const tgt = typeof smob?.target === "number" ? smob.target : null;
    const over = typeof wmob?.overGated === "number" ? wmob.overGated : null;
    if (lap > 0) {
      bits.push(
        `as-built gated lap ${lap}` +
          (tgt !== null ? ` vs target ${tgt} — ${lap > tgt ? "OVER" : "within target"}` : "") +
          (over ? ` · ${over} judged pair${over === 1 ? "" : "s"} lap worse than target` : "") +
          " (interior ÷ exterior walk between wall tiles, extension mass in place)",
      );
    } else {
      // ------------------------------------------------------------------
      // A ZERO IS NOT A PERFECT WALL. It means the gate judged nothing — and
      // the FILM MAY NOT INVENT ITS OWN REASON FOR THAT ZERO.
      //
      // This branch used to compose the reason here, out of `detourFloor`
      // alone: "no pair of wall tiles detours more than 4 tiles, so no pair was
      // judged". There are TWO ways a room reaches an unjudged zero and that
      // sentence names only one of them. E7S5 holds the worst absolute detour
      // in the fleet — 33 tiles, with `over` at 3 — and E6S3 has one at 5; both
      // clear the floor comfortably and the gate judged neither, because
      // coverage excuses them (a defender on one wall tile already covers
      // everything an attacker can stand on to grind the other). The film told
      // a reader the opposite of the room's own record, on the two rooms where
      // the distinction is the entire point.
      //
      // `mobilityUnjudgedWhy` is the helper that branches on `maxDetour` and it
      // already existed — the room page and the index chip have both used it
      // since the round that wrote it. The film was the third channel and it was
      // printing a second answer to the same question about the same room.
      //
      // The declaration is the fourth, and round 24 gave it the same branch for
      // the same reason (see the HEADLINE block in declprose-mobility), so the
      // wording now lives in ONE function — `unjudgedReason`, in the prose module
      // — that all four reach: this film note and the two HTML channels through
      // `mobilityUnjudgedWhy` below, and the declaration off its own record. If
      // the reason is ever wrong now it is wrong in all four at once, which is a
      // bug a reader can find rather than one he has to collate.
      // ------------------------------------------------------------------
      bits.push(
        `as-built gated lap 0 — ${mobilityUnjudgedWhy(plan)}` +
          (tgt !== null ? ` (target ${tgt})` : ""),
      );
    }
  }
  if (plan.shell) {
    bits.push(
      // O4 (round 17): this said "N deep tiles sealed in" and N was layer 2's
      // NEGOTIATION free-deep count — the supply the enclosure was bought for,
      // measured before the towers, labs, nuker, observer and sixty extensions
      // existed. On a finished plan it is neither "sealed in" nor current.
      // Both figures print now, each named for its own board; see
      // meta.shell.deepTilesBasis.
      `${plan.shell.cut.length} cut tiles · ${plan.shell.upkeepPerTick} e/tick upkeep · ` +
        `${plan.shell.shippedFreeDeep ?? "?"} free deep tiles left on the board this room SHIPS ` +
        `(layer 2 bought the enclosure on ${plan.shell.negotiationFreeDeep ?? plan.shell.deepTiles} — ` +
        `the same count on the negotiation board, before the program was placed in it)` +
        ` · controller ${plan.shell.enclosedController ? "inside" : "outside"}, sources ${plan.shell.enclosedSources}/${(plan.sources || []).length} inside`,
    );
  }
  if (bits.length) n.ramparts = bits.join(" — ");

  if (m.towers) {
    n.towers = `the weakest wall tile still takes ${m.towers.minShellDmg} damage a tick (${m.towers.avgShellDmg} average) · every tower refills within ${m.towers.maxRefill} steps`;
  }
  // OM2 (round 22) — the swap's two beats get the room's own numbers under them,
  // like every other stage. Read off `acrossPriorTake`, which is also what the
  // room's `towerSwap` note is rendered from, so the film and the prose cannot
  // disagree about what the pass bought.
  {
    const apt = m.towers?.acrossPriorTake;
    const tk = apt?.taken;
    if (tk && tk.from && tk.to) {
      n.towerGhost =
        `layer 3's set-cover chose (${tk.from.x},${tk.from.y}) and a later pass moved it — the tile is a ` +
        `ghost here and this film erases it a beat from now, so the last frame is still the shipped plan`;
      n.towerMove =
        `(${tk.from.x},${tk.from.y}) → (${tk.to.x},${tk.to.y}) — ` +
        (tk.why === "clump"
          ? `towers within chebyshev 2 of the sitter ${apt.before.clump} → ${apt.after.clump}, retiring this room's clump declaration`
          : `the weakest cut face ${apt.before.face} → ${apt.after.face} damage a tick`) +
        ` · the filler's per-tower walks ${(apt.before.refillWalks || []).join("/")} → ${(apt.after.refillWalks || []).join("/")}` +
        ` · ${apt.offered.length} offer(s) composed, ${apt.accepted} cleared the panel`;
    }
  }
  if (c.lab) n.labs = `${c.lab} labs — both inputs within range 2 of every output`;
  if (c.nuker) n.nuker = "300k energy and 5k ghodium have to be hauled here, so it hugs the hub";
  // THE ONE PLACEMENT STAGE THAT HAD NO NUMBER UNDER IT. Every other stage
  // carried a caption assembled from something the planner published; observer
  // carried only the hardcoded WHY in STAGE_INFO, so the note line rendered
  // empty on the one structure whose entire justification is a distance. Layer
  // misc publishes both singletons' hub-field walk (meta.misc.nukerHubDist /
  // observerHubDist) — the nuker takes the nearest deep leftover tile and the
  // observer the furthest, and those two numbers ARE the decision. Nothing
  // else about the choice is published: the preference for a road-adjacent,
  // non-sealing candidate is a sort key inside layer-misc and leaves no field
  // behind, so the caption does not claim it.
  if (m.misc && typeof m.misc.observerHubDist === "number") {
    const o = (plan.structures.observer || [])[0];
    n.observer =
      (o ? `(${o.x},${o.y}) · ` : "") +
      `${m.misc.observerHubDist} steps from the hub — the furthest deep tile left over` +
      (typeof m.misc.nukerHubDist === "number"
        ? `, where the nuker took the nearest at ${m.misc.nukerHubDist}`
        : "");
  }
  if (plan.mineral) n.extractor = `mineral at (${plan.mineral.x},${plan.mineral.y}) — the extractor is built on top of it`;
  if (m.extensions) {
    n.extensions =
      `${m.extensions.placed}/${m.extensions.target} placed · ${m.extensions.stubRoads} stub roads` +
      (m.extensions.corridorFallback
        ? ` · ${m.extensions.corridorFallback} placed road-blind (fallback)`
        : " · every one of them D4 on a road");
  }
  // ------------------------------------------------------------------
  // THE RELOCATION CAPTIONS COUNT THE MOVES THE FILM ACTUALLY PLAYS.
  //
  // TWO PASSES RELOCATE AND THE FILM DRAWS BOTH. export-anim.mjs builds its
  // `extGhost`/`extMove` steps from the UNION of `meta.extensions.relocated`
  // (layer 6's own end-of-pass rescue) and `meta.extensions.reflow.moved`
  // (layer 7b, once the dead-end prune has handed the corridor back as floor).
  // These two captions were built from `relocated` alone, so E12S6's banner
  // read "3 slots ... layer 6 came back for" and "3 moves onto deep floor"
  // over a film that plays SIX extGhost tiles and SIX extMove tiles — 3 + 3.
  // The undercount was fleet-wide, and its size is not typed here: the two
  // records are published per room (meta.extensions.relocated and
  // meta.extensions.reflow.moved) and the fleet summary totals them, so the
  // figure has an owner that re-derives it every run. (A "48 moves in 18 rooms"
  // stood here and had gone stale by round 20. Criticism 80.) A caption that counts
  // fewer beats than the film plays is exactly the bug this file exists to
  // avoid, so the totals are the union and each pass is named for its share.
  //
  // THE TWO RECORDS ARE NOT THE SAME SHAPE, AND ARE NOT AVERAGED TOGETHER.
  // Layer 6 publishes `closer` (a hub-walk delta) and `tookStub`; layer 7b
  // publishes `fromDepth`/`toDepth`/`paved` and no hub walk at all. So the
  // "nearer the hub" arithmetic is stated over layer 6's subset ONLY and says
  // so, and layer 7b's share is stated in the depths it publishes. Mixing them
  // would put a mean over two different quantities.
  // ------------------------------------------------------------------
  const rel = m.extensions?.relocated || [];
  const rfw = m.extensions?.reflow || {};
  const mv7 = (rfw.moved || []).filter((r) => r && r.from && r.to);
  const moves = rel.length + mv7.length;
  if (moves) {
    const nearer = rel.filter((r) => r.closer > 0);
    const farther = rel.filter((r) => r.closer < 0);
    const stubs = rel.filter((r) => r.tookStub).length;
    const best = nearer.length ? Math.max(...nearer.map((r) => r.closer)) : 0;
    const level = rel.length - nearer.length - farther.length;
    // meta.extensions.shallow is counted AFTER BOTH passes have spliced out
    // every slot they moved, so it is what is still shallow in the shipped
    // room — not the size of either pass's input list.
    const who = [];
    if (rel.length) who.push(`${rel.length} layer 6 came back for at the end of its own pass`);
    if (mv7.length) {
      who.push(
        `${mv7.length} the layer 7b reflow could only reach once the dead-end prune had handed the corridor back as floor`,
      );
    }
    n.extGhost =
      `${moves} slot${moves === 1 ? "" : "s"} the fill took too close to the wall, and a later pass came back for` +
      ` — ${who.join(" · ")}` +
      (typeof m.extensions.shallow === "number"
        ? m.extensions.shallow
          ? ` · ${m.extensions.shallow} more stay shallow in the shipped room`
          : " · every shallow slot in the room was rescued"
        : "");

    const parts = [];
    if (rel.length) {
      parts.push(
        `layer 6 moved ${rel.length} — ` +
          (nearer.length
            ? `${nearer.length} landed nearer the hub (up to ${best} step${best === 1 ? "" : "s"})`
            : "none landed nearer the hub") +
          (farther.length ? `, ${farther.length} farther out` : "") +
          (level ? `, ${level} at the same walk` : "") +
          // WHAT `tookStub` IS, SAID STRAIGHT. It means the DESTINATION tile
          // carried a corridor stub in layer 6's own working road set, which
          // the same pass then deleted before the layer published anything.
          // Measured over the shipped fleet: very nearly every layer-6
          // relocation takes a stub, and NOT ONE of those destinations has a
          // meta.roadLayer entry or is drawn as a road in any frame of any
          // film. (The two counts are printed by the fleet summary at the end
          // of a run; round 19 deleted the copies that were typed here, which
          // had gone stale.) The old caption said
          // "N lifted a stub road" over a road no viewer has ever seen. The
          // lift is real, it is just not a thing the film can show — what it
          // costs is the lane bound, re-derived below with those tiles
          // blocked, because the worst-case model had counted them walkable.
          (stubs
            ? `, and ${stubs} of them landed on corridor layer 6 had paved and took back inside the same pass (never a road in the shipped plan, so no frame draws one)`
            : ""),
      );
    }
    if (mv7.length) {
      const dF = mv7.map((r) => r.fromDepth).filter((v) => typeof v === "number");
      const dT = mv7.map((r) => r.toDepth).filter((v) => typeof v === "number");
      const span = (a) => (a.length ? (Math.min(...a) === Math.max(...a) ? `${a[0]}` : `${Math.min(...a)}-${Math.max(...a)}`) : "?");
      const retired = (rfw.rampartsRetired || []).length;
      parts.push(
        `layer 7b moved ${mv7.length} — depth ${span(dF)} → ${span(dT)}` +
          (retired ? `, retiring ${retired} personal rampart${retired === 1 ? "" : "s"}` : "") +
          // layer 7b never publishes a hub walk, so this half of the total
          // carries no "nearer the hub" claim at all rather than a guessed one
          ` (7b records depths, not a hub walk, so these are not counted with layer 6's steps)`,
      );
    }
    n.extMove =
      `${moves} move${moves === 1 ? "" : "s"} onto deep floor · ` +
      parts.join(" · ") +
      // The lap the relocation is blamed for, when layer 6 published both ends
      // of it: a room that lifts stubs re-derives its lane bound over the
      // corridor it ships, and both ends of that re-derivation are on the
      // record (`boundBeforeStubs` -> `bounded`). They are NOT the room's
      // detour floor and NOT its as-built lap, which are two other numbers.
      // Printed only when the two exist and differ; a room that paid nothing
      // says nothing. (Round 19: nine figures were typed into this comment and
      // eight of them were wrong — a stale roster of which rooms print the
      // clause, and stale values for all of them. The clause itself prints the
      // room's own two numbers every run, so the roster is gone rather than
      // corrected; see criticism 69/80.)
      (typeof m.extensions.laneMeta?.boundBeforeStubs === "number" &&
      typeof m.extensions.laneMeta?.bounded === "number" &&
      m.extensions.laneMeta.bounded !== m.extensions.laneMeta.boundBeforeStubs
        ? ` · re-measuring the lane bound with the lifted stubs blocked took it ${m.extensions.laneMeta.boundBeforeStubs} → ${m.extensions.laneMeta.bounded}`
        : "");
  }
  return n;
}

/**
 * Clip one ticker line — a shortfall `detail` or a planner note — down to a
 * banner line, without paraphrasing it.
 *
 * The layers write long — the longest shortfall detail in the fleet runs to
 * thousands of characters and the notes are no shorter — and a ticker that
 * carries them whole is a wall of text nobody reads at the end
 * of a 40-second film. So: whitespace collapsed, then the FIRST SENTENCE if it
 * fits inside the budget, otherwise a hard clip at the budget on a word
 * boundary with an ellipsis. Nothing is rewritten and nothing is summarised —
 * the words are the layer's own, in the layer's own order, and the full text is
 * two inches down the same page in the Declared shortfalls or Planner notes
 * card, which the ticker's own headers point at.
 *
 * The sentence split requires a period followed by whitespace or end of string,
 * so "max 1.71 over pairs" and "depth >= 4" do not split mid-number.
 */
const SHORTFALL_CLIP = 160;
function clipTickerLine(detail) {
  const s = String(detail ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "(this shortfall carries no detail text)";
  const stop = s.search(/\.(\s|$)/);
  if (stop >= 0 && stop + 1 <= SHORTFALL_CLIP) return s.slice(0, stop + 1);
  if (s.length <= SHORTFALL_CLIP) return s;
  let cut = s.slice(0, SHORTFALL_CLIP);
  const sp = cut.lastIndexOf(" ");
  if (sp > SHORTFALL_CLIP / 2) cut = cut.slice(0, sp);
  return cut + "…";
}

/**
 * THE FILM CARRIED NONE OF THE HONEST-SHORTFALL TEXT.
 *
 * `animNotes` above builds a caption set out of counts and never touches
 * `meta.shortfalls` or `meta.notes`. The room PAGE prints every declared
 * shortfall verbatim (shortfallsHtml) and every planner note (notesHtml), and
 * the index badges both — but the overwhelming majority of the fleet carries at
 * least one shortfall and a viewer who watched the film and nothing else saw
 * zero of them. (The count was typed here and is a fleet measurement that moves
 * with the fleet, so the numeral is gone rather than re-typed: the index's
 * shortfall badge publishes it per room from the room's own record and the fleet
 * summary totals it at the end of a run. Round 20, criticism 80.) E12S6
 * declares a weak battery and a missed mobility gate; its film ended on "plan
 * complete — this last frame IS the shipped plan, tile for tile" and said
 * nothing about either. "Every shortfall must be loud" is not a claim the suite
 * can make while its most watchable artifact is silent about all of them.
 *
 * ONE LINE PER DECLARED SHORTFALL — and, since this was extended, one line per
 * PLANNER NOTE — AT THE END OF THE FILM, and only there: the ticker is hidden
 * until the last placement has landed, so it reads as the coda to the
 * completion card rather than as a warning that hangs over the whole replay.
 * The worst-case room runs to a handful of rows of each, which is still a coda
 * and not a document; the counts themselves are printed per room by the fleet
 * summary at the end of a run and are not typed here. (Round 16 corrected the
 * figure in this sentence and round 19 deleted it: it went stale twice, and a
 * fleet high-water mark hard-typed into a comment beside the loop that could
 * count it is a number with no owner. Criticism 69/80.)
 *
 * IT IS A POINTER, NOT A REPLACEMENT. Each row is gate tag + a clipped first
 * sentence (see clipTickerLine) and the header says where the full text is. The
 * ticker MUST NOT become the canonical rendering of a declaration — that is the
 * shortfall card's job, and a summary that quietly replaces the declaration is
 * the same laundering the declaration channel exists to prevent.
 *
 * NOTES USED TO GET A COUNT AND NOT A ROW, AND A COUNT IS NOT A CHANNEL. The
 * argument for it was that a note must never read as a shortfall — which is
 * right, and is not an argument for silence. What it actually produced: E7S9's
 * film ended on "…and 3 planner notes on this page", a bare integer, while the
 * material those notes carry is the reason its wall is the shape it is. One of
 * them is the kept ring rampart — a cut tile that is NOT singly load-bearing and
 * is kept anyway, because deleting it promotes another rampart into the seal and
 * every cut-shaped metric in the room would be re-derived over a different wall,
 * at 0.03 e/tick of forever-upkeep. That is a deliberate, priced, published
 * decision about the shipped plan, it lives in meta.notes and
 * shell.redundantCut.reasons and NOT in meta.shortfalls, and a viewer who
 * watched the film saw the digit 3.
 *
 * So notes get rows now, in their OWN row set, under their own header, in the
 * notes card's blue rather than the shortfall card's amber, with every tag
 * prefixed by the word "note". The two channels are adjacent because that is
 * where a viewer will read them; they are never interleaved, never counted
 * together, and the notes header repeats in words that a note excuses nothing.
 * Same one-line clip as a shortfall, same pointer discipline, same "the full
 * text is on this page" — the identical treatment is the point: the film stops
 * deciding which of the planner's two output channels is worth quoting.
 *
 * A ROOM WITH NEITHER emits no ticker at all — not an empty box. The page says
 * "no declared shortfalls" in words because an empty section there is
 * indistinguishable from a missing one; the film has the completion card
 * carrying that weight already. A room with notes and no shortfalls now DOES get
 * a ticker, which it did not before, and it gets the blue rule instead of the
 * amber one plus a header that opens by saying this room declares no shortfalls
 * — an amber box appearing at the end of a clean room's film would read as an
 * accusation, which is the same confusion in the other direction.
 */
function animShortfallTicker(plan) {
  const list = (plan.meta?.shortfalls || []).filter((s) => s && typeof s === "object");
  const notes = (plan.meta?.notes || []).filter((n) => typeof n === "string" && n.length);
  if (!list.length && !notes.length) return "";
  const rows = list
    .map((s) => {
      const tag = [s.gate, s.kind, s.source].filter(Boolean).map(esc).join(" · ") || "(untagged gate)";
      return `<div class="asf-row"><span class="asf-gate">${tag}</span><span class="asf-txt">${esc(clipTickerLine(s.detail))}</span></div>`;
    })
    .join("\n");
  // layers write notes as "TOPIC: sentence." — the shouted topic becomes the tag
  // column so a note row scans like a shortfall row, and the word "note" is
  // welded to the front of it so it can never be read as a gate name.
  const nrows = notes
    .map((n) => {
      const m = /^([A-Z][A-Z0-9 \-/]{3,60}):\s*([\s\S]+)$/.exec(n);
      const tag = m ? `note · ${esc(m[1])}` : "note";
      return `<div class="asf-row asf-nrow"><span class="asf-gate asf-ngate">${tag}</span><span class="asf-txt">${esc(clipTickerLine(m ? m[2] : n))}</span></div>`;
    })
    .join("\n");
  const head = list.length
    ? `<div class="asf-head">Declared shortfalls &middot; ${list.length} &mdash; gates this plan knowingly failed. Clipped to one line each; every word of every one is on this page under &ldquo;Declared shortfalls&rdquo;.</div>
${rows}`
    : "";
  const nhead = notes.length
    ? `<div class="asf-head asf-nhead">${list.length ? "" : "This room declares no shortfalls. "}Planner notes &middot; ${notes.length} &mdash; observations the layers recorded. <b>A note is not a shortfall</b>: it is attached to no gate and it excuses nothing. Clipped to one line each; every word of every one is on this page under &ldquo;Planner notes&rdquo;.</div>
${nrows}`
    : "";
  return `<div class="anim-sf${list.length ? "" : " asf-notesonly"}" id="animSf" hidden>
${head}${list.length && notes.length ? "\n" : ""}${nhead}</div>`;
}

/**
 * Browser replay of the planner stages — dependency-free vanilla JS.
 *
 * EIGHT stacked canvases, bottom to top:
 *   terrain    drawn once
 *   scaffoldA  dt + distance fields  — dimmed once the plan starts landing
 *   scaffoldB  basin + core          — dimmed once the wall goes up
 *   under      ramparts
 *   roads      roads                 — ABOVE the ramparts and BELOW the
 *                                      structures, which is the order
 *                                      renderRoomSvg stacks them in
 *   ghost      extensions layer 6 placed and then moved — erased at the
 *                                      relocation beat, empty in the last frame
 *   cells      the structures themselves, as real Screeps sprites
 *   marks      sources / controller / mineral + transient FX
 *
 * WHY ROADS GOT THEIR OWN CANVAS. They used to share `under` with the
 * ramparts, which cost two things. First the stacking was backwards: the film
 * drew every road before the wall, so the wall painted over the roads, while
 * the gallery SVG draws ramparts first and roads on top. Second, and the
 * reason it had to change, layer 7's dead-end prune now ERASES road tiles in
 * the film (see roadProvenance in export-anim.mjs) — clearing a tile on a
 * shared canvas would take the rampart underneath it with it, and 4 pruned
 * tiles across the fleet do carry a rampart.
 *
 * THE RELOCATION GHOSTS GOT THEIR OWN CANVAS FOR THE SAME REASON, AFTER THE
 * SAME NEAR MISS. Layer 6's relocation pass is drawn ghost-and-erase like the
 * prune (see export-anim.mjs), and three of the 78 origin tiles are ROADS in
 * the shipped plan (E12S6 24,3 · E18S5 5,35 · E2S3 36,21) — a clearRect on the
 * roads or the structures canvas would have taken them, or a later extension,
 * with the ghost.
 *
 * THE FRAMES ARE NOT TOUCHED HERE. Steps come from anim/<room>.json exactly as
 * export-anim.mjs wrote them; this file only decides how a tile is DRAWN, how
 * fast, and what the banner says about it. The last frame is therefore the
 * shipped plan tile for tile, painted with the sprite stack render.mjs gives
 * the gallery.
 *
 * PACING IS PER TILE, NOT PER STEP. export-anim emits roads, ramparts and
 * extensions in chunks of 2-3 tiles because the payload has to fit inside a
 * 100KB memory segment — a packaging decision, not a storytelling one. The
 * player expands those chunks back into single placements, so the eye gets one
 * thing at a time and "step forward" means one structure rather than three.
 * Scaffolding steps (whole distance-transform bands, whole flood rings) stay
 * atomic: they are one idea each, and one of them is 300 tiles wide.
 */
/**
 * ===========================================================================
 * THE PLAYER'S THREE STAGE TABLES, CHECKED AT EXPORT TIME (OF9, round 16).
 * ===========================================================================
 * export-anim owns two stage tables and THROWS on an orphan
 * (`STAGE_RATES` / `STAGE_SCAFFOLD`, see the orphan check there). The player
 * owns three — `STAGE_INFO`, `STAGE_KIND`, `EXPAND` — and until now two of them
 * failed SILENTLY: a stage missing from `STAGE_INFO` got a de-underscored name,
 * and a stage missing from `STAGE_KIND` got `null` from `kindFor` and fell
 * through `paintTile` to `paintRect`. That second one is not hypothetical: it is
 * exactly how `extAdd` shipped 21 flat yellow squares in three rooms' LAST
 * FRAME, under a HUD line reading "this last frame IS the shipped plan, tile for
 * tile". The `EXPAND` table was given a check in round 14 (the drift block in
 * the fetch handler, against the exporter's own `stageScaffold`) and the goal
 * document said of the other two: "it does not have one yet, and that is stated
 * here rather than filed as done."
 *
 * The obstacle was that all three live in a template string, so no runtime in
 * this process can read them as objects. They can be read as TEXT, which is what
 * this does: the emitted player script is parsed for the three tables and the
 * three key sets are checked against each other and against the invariants they
 * have always silently had —
 *
 *   · every `EXPAND` key and every `STAGE_KIND` key is a `STAGE_INFO` key;
 *   · `STAGE_INFO` minus `EXPAND` is exactly the four SCAFFOLD stages, which is
 *     the same partition `STAGE_SCAFFOLD` makes in export-anim;
 *   · `STAGE_KIND` is exactly `EXPAND` minus `claims`, whose tiles are
 *     heterogeneous and are keyed per tile through `CLAIMK` instead.
 *
 * It THROWS, for the reason the orphan check throws: a fleet run is the whole
 * claimable list (the room count was typed here and moves with the list; the
 * fleet summary at the end of a run prints it. Criticism 80) and a warning on
 * room 1 scrolls off long before the run ends, while the fix is
 * one line in a table twenty lines up. Add a stage to the film and forget one of
 * the five tables and the suite stops, names the table and names the stage.
 */
const STAGE_SCAFFOLD_KEYS = ["dt", "fields", "basin", "core"];
/** stages whose tiles are heterogeneous and keyed per tile (CLAIMK), not per stage */
const STAGE_KIND_EXEMPT = ["claims"];
function playerTableKeys(src, name) {
  const at = src.indexOf(`var ${name} = {`);
  if (at < 0) {
    throw new Error(`plan.mjs: the emitted player has no \`var ${name} = {\` table to check.`);
  }
  const open = src.indexOf("{", at);
  let depth = 0;
  let end = -1;
  for (let j = open; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) {
      end = j;
      break;
    }
  }
  if (end < 0) throw new Error(`plan.mjs: \`${name}\` in the emitted player is unterminated.`);
  // strip line comments and string literals first — a stage NAMED in prose
  // inside a row is not a key, and the whole point of this check is that it
  // cannot be fooled by the text it is reading
  // ORDER MATTERS: comments come out BEFORE strings. The rows are documented in
  // line comments and one of those comments contains an apostrophe ("The room's
  // actual jobs arrive per-room in STAGE_TEXT.roadsLate"), so a string-first
  // pass pairs that apostrophe with the next one and swallows the two keys in
  // between — which is exactly the drift this check exists to catch, faked by
  // the checker. Escapes first, then comments, then strings.
  const body = src
    .slice(open + 1, end)
    .replace(/\\'/g, " ")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""');
  const keys = [];
  const re = /(?:^|[,{\n])\s*([A-Za-z_$][\w$]*)\s*:/g;
  let m;
  while ((m = re.exec(body))) keys.push(m[1]);
  return new Set(keys);
}
let stageTablesChecked = false;
function assertStageTables(playerSrc) {
  if (stageTablesChecked) return;
  stageTablesChecked = true;
  const info = playerTableKeys(playerSrc, "STAGE_INFO");
  const kind = playerTableKeys(playerSrc, "STAGE_KIND");
  const expand = playerTableKeys(playerSrc, "EXPAND");
  const bad = [];
  const missing = (set, from, label, other) =>
    [...set].filter((k) => !from.has(k)).map((k) => `${label} has \`${k}\`, ${other} does not`);
  bad.push(...missing(expand, info, "EXPAND", "STAGE_INFO"));
  bad.push(...missing(kind, info, "STAGE_KIND", "STAGE_INFO"));
  const scaff = [...info].filter((k) => !expand.has(k)).sort();
  if (scaff.join(",") !== STAGE_SCAFFOLD_KEYS.slice().sort().join(",")) {
    bad.push(
      `STAGE_INFO minus EXPAND is [${scaff.join(", ")}] and the scaffold stages are ` +
        `[${STAGE_SCAFFOLD_KEYS.join(", ")}] — EXPAND must be the exact negation of the scaffold ` +
        `set (see STAGE_SCAFFOLD in export-anim.mjs)`,
    );
  }
  const wantKind = [...expand].filter((k) => !STAGE_KIND_EXEMPT.includes(k)).sort();
  const haveKind = [...kind].sort();
  if (wantKind.join(",") !== haveKind.join(",")) {
    bad.push(
      `STAGE_KIND is [${haveKind.join(", ")}] and should be EXPAND minus ` +
        `[${STAGE_KIND_EXEMPT.join(", ")}], i.e. [${wantKind.join(", ")}]`,
    );
  }
  if (bad.length) {
    throw new Error(
      `plan.mjs: the player's stage tables have drifted —\n  ` +
        bad.join("\n  ") +
        `\nEvery stage needs a row in STAGE_INFO, STAGE_KIND and EXPAND here and in ` +
        `STAGE_RATES and STAGE_SCAFFOLD in export-anim.mjs. A defaulted stage gets a ` +
        `de-underscored name, flat rectangles instead of sprites and the wrong noun on the ` +
        `HUD, and says nothing about any of it.`,
    );
  }
}

function animPlayerHtml(plan) {
  const marks = JSON.stringify({
    sources: plan.sources || [],
    controller: plan.controller || null,
    mineral: plan.mineral || null,
    hub: plan.hub || null,
  });
  const sprites = JSON.stringify(animSprites());
  const claimKinds = JSON.stringify(animClaimKinds(plan));
  const battlements = JSON.stringify(
    (plan.shell?.battlements || []).map((b) => `${b.x},${b.y}`),
  );
  const notes = JSON.stringify(animNotes(plan));
  const stageText = JSON.stringify(animStageText(plan));
  // ------------------------------------------------------------------
  // THE PAGE AND THE FILM ARE TWO HALVES OF ONE CLAIM, BOUND BY A FILENAME.
  //
  // Everything on this page that is NOT the film — the terrain string, the
  // claims palette, the sitter tile, every caption, this whole notes map — is
  // rendered from the plan this run just wrote. The film is fetched at runtime
  // from anim/<room>.json, written by a DIFFERENT tool (export-anim.mjs) at a
  // different time, and the only thing that binds it to this page is that the
  // two files agree on a room name. The suite already knows this: it re-derives
  // planStructureHash per room and prints "ANIMATIONS DO NOT MATCH THIS PLAN"
  // (see warnStaleAnimations) — but that is a line in a terminal nobody has
  // open, while the page itself states on screen that its last frame IS the
  // shipped plan, tile for tile, and had no way to know whether that was true.
  //
  // So the digest is stamped INTO the page: a data attribute on the card, a
  // line under the player, and PLAN_HASH in the script — and the player refuses
  // to draw a film whose planHash is not it. Not a warning: a refusal, because a
  // film of a different plan drawn under a "this is the shipped plan" label is
  // worse than no film.
  // ------------------------------------------------------------------
  const planHash = planStructureHash(plan);
  // NOTE: the player script uses string concat, never template literals —
  // this whole file is one big JS template literal already.
  const html = `<div class="card anim-card" id="anim" data-plan-hash="${esc(planHash)}"><h3>Animated plan — watch the planner build ${plan.room}</h3>
<div class="anim-wrap" id="animWrap">
  <canvas class="anim-layer" id="animTerrain"></canvas>
  <canvas class="anim-layer" id="animScaffA"></canvas>
  <canvas class="anim-layer" id="animScaffB"></canvas>
  <canvas class="anim-layer" id="animUnder"></canvas>
  <canvas class="anim-layer" id="animRoads"></canvas>
  <canvas class="anim-layer" id="animGhost"></canvas>
  <canvas class="anim-layer" id="animCells"></canvas>
  <canvas class="anim-layer" id="animMarks"></canvas>
  <div class="anim-title" id="animTitle"><div class="tt" id="animTitleName"></div><div class="te" id="animTitleWhy"></div></div>
</div>
<div class="anim-banner">
  <div class="ab-head">
    <span class="ab-badge" id="animBadge">Layer 1</span>
    <span class="ab-name" id="animName">&mdash;</span>
    <span class="ab-count" id="animCount">&mdash;</span>
  </div>
  <div class="ab-why" id="animWhy"></div>
  <div class="ab-note" id="animNote"></div>
</div>
<div class="anim-bar"><div class="anim-bar-fill" id="animBar"></div></div>
<div class="anim-ctl">
  <button id="animPrevStage" class="btn" title="back to the start of this layer (or the one before it)">&#8676;</button>
  <button id="animBack" class="btn" title="one placement back">&#9664;</button>
  <button id="animPlay" class="btn btn-wide">&#10074;&#10074; pause</button>
  <button id="animFwd" class="btn" title="one placement forward">&#9654;</button>
  <button id="animNextStage" class="btn" title="skip to the next layer">&#8677;</button>
  <button id="animRestart" class="btn" title="back to the first frame">&#8635;</button>
  <label class="trail"><input type="checkbox" id="animTrails" checked/>trails</label>
</div>
<div class="anim-ctl">
  <span class="spd-lab">speed</span>
  <input type="range" id="animSpeed" min="-2" max="3" step="0.25" value="0"/>
  <span class="spd-val" id="animSpeedVal">1&times;</span>
  <span class="rate" id="animRate"></span>
</div>
<div class="stages" id="animStages"></div>
<div class="anim-label" id="animLabel">loading anim/${plan.room}.json &hellip;</div>
<div class="anim-meta" id="animMeta">plan digest <code>${esc(planHash)}</code> &middot; this page was rendered from that plan, and the player will not draw a film stamped with any other</div>
${animShortfallTicker(plan)}
</div>
<script>
(function () {
  var ROOM = ${JSON.stringify(plan.room)};
  // structures-and-tiles digest of the plan THIS PAGE was rendered from — see
  // the block above animPlayerHtml, and planStructureHash in shared.mjs
  var PLAN_HASH = ${JSON.stringify(planHash)};
  var TERRAIN = ${JSON.stringify(plan.terrain)};
  var MARKS = ${marks};
  var SPR = ${sprites};
  var CLAIMK = ${claimKinds};
  // THE SITTER IS A TILE THE PLAN RESERVES, NOT A STRUCTURE IT BUILDS. It is
  // passed by coordinate rather than inferred from the claims palette, because
  // a colour is not an identity — see paintSitter for what goes wrong when the
  // player treats it as one.
  var SITTER = ${JSON.stringify(plan.sitter || null)};
  var BATTL = ${battlements};
  var NOTES = ${notes};
  // per-room {name, why, chip} overrides for the stages whose static STAGE_INFO
  // row cannot be true of every room — applied in info(), see STAGE_INFO
  var STAGE_TEXT = ${stageText};
  var RP = ${JSON.stringify(ROAD_PAINT)};
  var MP = ${JSON.stringify(RAMPART_PAINT)};

  var CELL = 15, N = 50, W = CELL * N;
  // TILES PER SECOND at 1x, before the per-stage multiplier in meta.stageRates.
  // The building stages sit on rates 0.4-1.5, so the structures land at roughly
  // 1.3-4.8 tiles/sec — slow enough to follow a single extension with your eye.
  var TILE_RATE = 3.2;
  var HOLD_MS = 3600;          // dwell on the finished plan before looping
  var LAYER_PAUSE_MS = 1100;   // beat between layers, so the cut is legible
  var TITLE_HOLD = 900, TITLE_FADE = 900;

  var BATT = {};
  for (var bi = 0; bi < BATTL.length; bi++) BATT[BATTL[bi]] = 1;

  // stage -> [layer number, plain name, one-line WHY, counted noun, chip]
  //
  // THESE ROWS ARE STATIC AND SO MUST BE TRUE OF EVERY ROOM THAT PLAYS THE
  // STAGE. Where a stage's subject genuinely varies room to room, the row here
  // is the neutral statement of the whole beat and the room's own name/why/chip
  // arrive in STAGE_TEXT (composed server-side by animStageText from the same
  // published fields the note line uses) — see info() below, which is the one
  // door all four text channels go through: the title card, the banner name,
  // the banner why and the chip + its tooltip. roadsLate is the only stage
  // that needs it today: layer 7 runs seven different road jobs and a whole
  // cohort of rooms ship the beat having run no spur at all. (The room count
  // was typed here and had gone stale by round 20 — the same figure export-anim
  // deleted from its layer-7 banner note. meta.walls.spurTiles answers it per
  // room and the fleet summary's rampart-spur line totals the spur work at the
  // end of a run. Criticism 80.)
  //
  // roadsMisc AND roadsResid ARE RESERVED, NOT DEAD — and they are kept rather
  // than deleted deliberately. roadsMisc is layer 5's haul road to the mineral
  // seat and roadsResid is the catch-all for road tiles carrying no
  // meta.roadLayer entry. Neither is emitted by any film in the current fleet:
  // every room has a mineral, but layer 5 deliberately grows no haul road to
  // the mineral seat (see the extractor row on the room page, and
  // meta.misc.mineralOffNetwork, which measures per room whether the seat
  // nevertheless ended up D8 of a road laid for something else) — so no tile
  // carries a layer-5 provenance, and road provenance is otherwise total, so
  // nothing is unattributed either. (A room count stood in this sentence and a
  // fleet-wide "the seat is off the network" was read off it; both were typed
  // rather than measured. The per-room flag is the channel, meta.roadLayer is
  // the provenance record, and neither is copied here. Round 20, criticism 80.)
  // Both are one planner decision away from emitting again, and the invariant
  // export-anim enforces is one-directional: every EMITTED stage must be in
  // STAGE_INFO / STAGE_RATES / STAGE_SCAFFOLD, and EXPAND[s] must be the
  // negation of the exporter's scaffold flag for every stage in the film. A row
  // for a stage no film emits violates nothing; a MISSING row the day the stage
  // comes back is the exact failure mode the tables above are scarred by
  // (sitter, seed, extAdd). So they stay, and they stay labelled.
  var STAGE_INFO = {
    dt:         [1, 'reading the room', 'how far every tile sits from the nearest wall — the wide-open ground is where a base can fit', 'tiles', '1 · dt'],
    fields:     [1, 'walking distances', 'flood out from every source and the controller: how many steps does a hauler pay from here?', 'tiles', '1 · fields'],
    seed:       [1, 'the seed', 'the single tile with the cheapest total walk to everything the room earns from', 'tile', '1 · seed'],
    basin:      [1, 'the basin', 'grow out from the seed, cheapest walk first — is there actually room here?', 'tiles', '1 · basin'],
    core:       [1, 'the core pocket', 'the open pocket the hub trio has to fit inside', 'tiles', '1 · core'],
    claims:     [1, 'the hub', 'storage, terminal, link, spawns and miner seats — one deliberate tile at a time', 'tiles', '1 · hub'],
    roads:      [1, 'the eco roads', 'one connected web: hub to spawns to sources to controller — this is the ONLY road set that exists before the wall', 'tiles', '1 · roads'],
    ramparts:   [2, 'the wall', 'the cheapest rampart line that seals the base (distance-weighted min-cut)', 'ramparts', '2 · wall'],
    // OM2 (round 22) — the across-prior tower swap, in the three channels it was
    // missing from. towerGhost is layer 3's OWN pick for the tower a later pass
    // moved, painted on the ghost canvas so it can be erased; towerMove is that
    // erase. Without them this film drew the swap's output under layer 3's
    // caption and the tile layer 3 actually chose was in no frame at all.
    towerGhost: [3, 'layer 3\\'s own pick', 'where the set-cover put this tower, before the across-prior swap moved it after layer 3 had finished', 'towers', '3 · pre-swap'],
    towers:     [3, 'towers', 'set-cover the wall so no rampart tile is out of tower range', 'towers', '3 · towers'],
    towerMove:  [3, 'the across-prior swap', 'a tower moved after layer 3 was done — the room re-composed from layer 1 with the swap held, kept only because every instrument held and it lifted the weakest face or retired the clump declaration', 'moves', '3 · swap'],
    roadsTwr:   [3, 'tower spurs', 'the refill road to each tower, laid by the same pass that placed it', 'tiles', '3 · spurs'],
    labs:       [4, 'labs', 'the one stamp worth keeping — a diamond where every reagent pair is in reach', 'labs', '4 · labs'],
    roadsLab:   [4, 'lab access', 'paved AFTER the diamond: the anchor scan rejects a lab site that touches an existing road, so this road cannot be on screen while the labs are chosen', 'tiles', '4 · lab road'],
    nuker:      [5, 'the nuker', 'one deep tile hugging the hub, because everything it eats has to be carried', 'nuker', '5 · nuker'],
    observer:   [5, 'the observer', 'needs no access at all, so it takes the far leftover tile', 'observer', '5 · observer'],
    extractor:  [5, 'the extractor', 'the one structure built ON a room object — it sits on the mineral', 'extractor', '5 · extractor'],
    // RESERVED — no film in the fleet emits this stage (the mineral seat is off-network)
    roadsMisc:  [5, 'the mineral run', 'the haul road out to the mineral seat', 'tiles', '5 · mineral road'],
    roadsExt:   [6, 'extension corridors', 'dig the corridor first — every extension has to land with a D4 face on a road', 'tiles', '6 · corridors'],
    extGhost:   [6, 'shallow slots', 'tiles the fill took while it still had to, too close to the wall to be safe — layer 6 comes back for them', 'slots', '6 · shallow'],
    extensions: [6, 'extensions', 'growing corridors into deep, safe floor — 60 of them, every one on a road face', 'extensions', '6 · extensions'],
    extMove:    [6, 'the relocation', 'layer 6 finishing its own job inside its own pass: a shallow slot vacated for a deep, road-faced tile — where that tile was a paved stub, the stub is lifted', 'moves', '6 · relocate'],
    extAdd:     [7, 'layer 7b backfill', 'extensions the post-prune reflow ADDS on deep, road-faced floor the dead-end prune handed back — the pass that takes a short room to 60/60', 'extensions', '7b · backfill'],
    roadsPrune: [7, 'the dead-end prune', 'the one pass allowed to DELETE an earlier layer\\'s road — these led somewhere before the later layers filled it in', 'tiles', '7 · prune'],
    // NEUTRAL BY CONSTRUCTION — this row names the LAYER, not a job, because the
    // job varies: plenty of rooms play this beat without laying one spur at all,
    // and how many is a thing meta.walls.roadKind answers per room rather than
    // something this line should be holding a copy of. (A hand-typed count stood
    // here and had gone stale; round 20 deleted it. Criticism 80.)
    // The room's actual jobs arrive per-room in STAGE_TEXT.roadsLate.
    roadsLate:  [7, 'the late road pass', 'layer 7\\'s last road work — spurs to the wall, swamp pre-pave, stitches, swaps off the cut, the reflow\\'s faces: which of them ran here is on the line below', 'tiles', '7 · late roads'],
    // RESERVED — no film in the fleet emits this stage (road provenance is total)
    roadsResid: [0, 'unattributed roads', 'these tiles carry no meta.roadLayer entry — the film will not guess which layer laid them', 'tiles', '? · unattributed']
  };
  // THE ONE DOOR ALL FOUR TEXT CHANNELS GO THROUGH. The title card reads [1]+[2],
  // the banner reads [1] and [2], the chip reads [4] and its tooltip [1]+[2] —
  // so a per-room override applied here reaches every channel at once, which is
  // precisely what the round-13 fix to the note line alone did not do.
  function info(stage) {
    var b = STAGE_INFO[stage] ||
      [0, String(stage).replace(/_/g, ' '), '', 'steps', String(stage)];
    var o = STAGE_TEXT[stage];
    if (!o) return b;
    return [b[0], o.name || b[1], o.why || b[2], b[3], o.chip || b[4]];
  }

  // stage -> what a tile of it IS. '#road' / '#rampart' / '#unroad' /
  // '#sitter' / '#seed' / '#extghost' / '#unghost' are hand-painted (no sprite
  // exists for any of them); claims is heterogeneous and uses CLAIMK instead.
  // SIX road stages, one per pipeline layer that lays road, plus the layer-7
  // prune which UNPAINTS — and layer 6's relocation, which does the same thing
  // to an extension ghost.
  //
  // extAdd IS AN EXTENSION AND HAS TO PAINT LIKE ONE. It got a STAGE_INFO entry
  // and a step emitter (export-anim, layer 7b's backfill) and was never added
  // here, so kindFor returned null for it and paintTile fell all the way
  // through to paintRect: 21 tiles across the three rooms that use the pass —
  // E5S3 9, E9S2 6, E9S7 6 — ended the film as flat yellow squares instead of
  // extension sprites, and they are STILL flat in the LAST frame, under a HUD
  // line that reads "this last frame IS the shipped plan, tile for tile". Same
  // class of bug as the sitter and the seed above, and the same standard: a
  // stage that survives to the final frame must paint the thing it is.
  var STAGE_KIND = {
    roads: '#road', roadsTwr: '#road', roadsLab: '#road', roadsMisc: '#road',
    roadsExt: '#road', roadsLate: '#road', roadsResid: '#road',
    roadsPrune: '#unroad',
    seed: '#seed',
    ramparts: '#rampart', towers: 'tower', labs: 'lab',
    nuker: 'nuker', observer: 'observer', extractor: 'extractor',
    extensions: 'extension', extAdd: 'extension',
    extGhost: '#extghost', extMove: '#unghost',
    // OM2 (round 22) — the tower swap's pre-tile and its erase. They are the
    // same paint-then-erase pair as layer 6's relocation and they route onto the
    // ghost canvas by exactly the same test (isGhostStage reads THIS table), so
    // the erase cannot reach a structure that later stands on the vacated tile.
    towerGhost: '#extghost', towerMove: '#unghost'
  };
  // stages whose steps are expanded back into ONE PLACEMENT PER TILE.
  // extAdd is listed for the same reason it is in STAGE_KIND: it is the same
  // kind of beat as the extensions stage, one structure at a time. export-anim
  // happens to push its adds one cell per step today, so the expansion is a
  // no-op on the current films — but the rate readout under the bar reads
  // EXPAND to decide between "tiles/sec here" and "bands/sec here", and it was
  // calling layer 7b's backfill a band.
  //
  // AND THE seed STAGE WAS LEFT BEHIND BY THAT EXACT FIX. It is one tile — the
  // stage is a single sb.push of a single cell — and it is not scaffolding: it
  // survives into the last frame as the dashed yellow ring paintSeed draws. It
  // has a STAGE_INFO entry, a STAGE_KIND entry, a STAGE_RATES entry and a
  // STAGE_SCAFFOLD entry saying false, and it was in none of the EXPAND table,
  // so for its entire beat the HUD read "≈ 1.1 bands/sec here" underneath a
  // caption about ONE tile. The tiles painted correctly — this was never the
  // extAdd bug — the film simply lied about its own units, which in a film whose
  // last frame claims to be the shipped plan "tile for tile" is not a rounding
  // error, it is the one thing the reader is being asked to trust.
  //
  // A TABLE KEPT IN SYNC BY HAND IS A TABLE THAT DRIFTS. This is the third stage
  // to be added to some of these six tables and not the others (sitter, seed,
  // extAdd, and seed again here), and the reason it keeps happening is that
  // every omission FALLS BACK to something plausible instead of failing: a
  // missing STAGE_INFO gives a de-underscored name, a missing STAGE_KIND gave
  // extAdd flat yellow rectangles, a missing STAGE_RATES gives 1x, a missing
  // EXPAND gives the wrong noun. So the omission is now made impossible to keep:
  // export-anim THROWS if an emitted stage is missing from either table it owns
  // (see the orphan check there), and the player checks EXPAND against the
  // exporter's own stageScaffold map at load — see the drift check in the fetch
  // handler below. The rule that check enforces is the invariant this table has
  // always silently had: scaffolding is paced a band at a time and everything
  // that is NOT scaffolding is placed one tile at a time, so EXPAND[s] and
  // stageScaffold[s] must be exact opposites for every stage in the film.
  // Comments do not survive the next stage; a check does.
  var EXPAND = {
    claims: 1, roads: 1, roadsTwr: 1, roadsLab: 1, roadsMisc: 1, roadsExt: 1,
    roadsPrune: 1, roadsLate: 1, roadsResid: 1,
    seed: 1,
    ramparts: 1, towers: 1, labs: 1,
    nuker: 1, observer: 1, extractor: 1, extensions: 1, extAdd: 1,
    extGhost: 1, extMove: 1,
    towerGhost: 1, towerMove: 1
  };
  // scaffold stages that live on the LATE scaffold canvas (dimmed at the wall)
  var SCAFF_LATE = { basin: 1, core: 1 };
  var TOWER_RANGE = 5;

  var now = (window.performance && performance.now)
    ? function () { return performance.now(); }
    : function () { return Date.now(); };

  var dpr = Math.min(2, window.devicePixelRatio || 1);
  function ctx2d(id) {
    var c = document.getElementById(id);
    c.width = W * dpr; c.height = W * dpr;
    c.style.width = W + 'px'; c.style.height = W + 'px';
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return g;
  }
  var elScaffA = document.getElementById('animScaffA');
  var elScaffB = document.getElementById('animScaffB');
  var gT = ctx2d('animTerrain'), gA = ctx2d('animScaffA'), gB = ctx2d('animScaffB'),
      gU = ctx2d('animUnder'), gR = ctx2d('animRoads'), gG = ctx2d('animGhost'),
      gC = ctx2d('animCells'), gM = ctx2d('animMarks');
  var rr = typeof gC.roundRect === 'function';

  // --- terrain (once) ---
  for (var y = 0; y < N; y++) {
    for (var x = 0; x < N; x++) {
      var t = TERRAIN.charCodeAt(y * N + x) - 48;
      gT.fillStyle = (t & 1) ? '#0e0e0e' : (t & 2) ? '#16301a' : '#2c2c24';
      gT.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }
  gT.strokeStyle = 'rgba(0,0,0,0.28)'; gT.lineWidth = 0.5;
  for (var i = 0; i <= N; i++) {
    gT.beginPath(); gT.moveTo(i * CELL, 0); gT.lineTo(i * CELL, W); gT.stroke();
    gT.beginPath(); gT.moveTo(0, i * CELL); gT.lineTo(W, i * CELL); gT.stroke();
  }

  // --- sprites: rasterise each gallery icon stack into one tile-sized canvas --
  // Composing once up front means a 300-placement rewind is 300 blits instead
  // of 600 SVG rasterisations, and it keeps the layer ORDER (border under body)
  // even though the images resolve out of order.
  var SPRITE = {};
  function loadSprites(cb) {
    var jobs = [], k, j;
    for (k in SPR) for (j = 0; j < SPR[k].length; j++) jobs.push([k, j, SPR[k][j].u]);
    if (!jobs.length) return cb();
    var left = jobs.length, imgs = {};
    function done() { if (--left === 0) { compose(imgs); cb(); } }
    for (var i = 0; i < jobs.length; i++) {
      (function (job) {
        var im = new Image();
        im.onload = function () { imgs[job[0] + '#' + job[1]] = im; done(); };
        im.onerror = done;
        im.src = job[2];
      })(jobs[i]);
    }
  }
  function compose(imgs) {
    var R = Math.max(24, Math.round(CELL * dpr * 2)); // 2x supersample, then blit down
    for (var k in SPR) {
      var off = document.createElement('canvas');
      off.width = R; off.height = R;
      var g = off.getContext('2d'), drew = 0;
      for (var j = 0; j < SPR[k].length; j++) {
        var im = imgs[k + '#' + j];
        if (!im) continue;
        var sc = SPR[k][j].s, pad = R * (1 - sc) / 2, sz = R * sc;
        try { g.drawImage(im, pad, pad, sz, sz); drew++; } catch (e) { /* unusable asset */ }
      }
      if (drew) SPRITE[k] = off;
    }
  }

  // --- tile painters (the gallery's own paint, shared via render.mjs) --------
  function paintRect(g, x, y, hex) {
    g.fillStyle = hex;
    var px = x * CELL + 1, py = y * CELL + 1, w = CELL - 2;
    if (rr) { g.beginPath(); g.roundRect(px, py, w, w, 2.5); g.fill(); }
    else g.fillRect(px, py, w, w);
  }
  function paintRoad(g, x, y) {
    g.fillStyle = RP.base;
    g.fillRect(x * CELL, y * CELL, CELL, CELL);
    g.fillStyle = RP.top;
    g.fillRect(x * CELL + CELL * RP.inset, y * CELL + CELL * RP.inset,
               CELL * RP.size, CELL * RP.size);
  }
  function paintRampart(g, x, y) {
    var hot = BATT[x + ',' + y] === 1;
    var px = x * CELL + MP.inset, py = y * CELL + MP.inset, w = CELL - 2 * MP.inset;
    g.save();
    g.beginPath();
    if (rr) g.roundRect(px, py, w, w, CELL * MP.radius); else g.rect(px, py, w, w);
    g.globalAlpha = hot ? MP.hotFillOpacity : MP.fillOpacity;
    g.fillStyle = MP.fill; g.fill();
    g.globalAlpha = MP.strokeOpacity;
    g.strokeStyle = MP.stroke;
    g.lineWidth = hot ? MP.hotStrokeWidth : MP.strokeWidth;
    g.stroke();
    g.restore();
  }
  /**
   * THE SITTER IS NOT A STRUCTURE, SO IT MAY NOT PAINT LIKE ONE.
   *
   * The claims stage emits the sitter tile as a white cell. It has no entry in
   * CLAIMK (there is no structure there — that is the entire point of the
   * tile), so it fell through paintTile to paintRect, which fills opaquely
   * with no globalAlpha. Nothing about that is visible until you notice WHERE
   * the sitter goes: it is the tile the hub trio all touch, and in most rooms
   * the hub roads run straight through it. E17S4 40,34 and E2S7 22,26 are
   * roads in the shipped plan and were solid white squares in the last frame
   * of the film — while the HUD underneath asserted "this last frame IS the
   * shipped plan, tile for tile". One tile per room, forever, on the one
   * claim the film makes about its own fidelity.
   *
   * Rejected: dropping the sitter beat entirely. It is a real decision the hub
   * layer makes and it deserves its second on screen. Rejected: painting it on
   * the marks canvas, which is cleared and redrawn every frame — the sitter
   * would then be the one placement that a rewind could not take back.
   *
   * So it is drawn as a MARK rather than a fill: a dashed white ring inset
   * into the tile over a 12%-alpha wash. The road underneath reads through it,
   * the tile still reads as claimed, and the last frame matches the plan.
   */
  function paintSitter(g, x, y) {
    var px = x * CELL + 2.5, py = y * CELL + 2.5, w = CELL - 5;
    g.save();
    g.globalAlpha = 0.12;
    g.fillStyle = '#ffffff';
    g.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    g.globalAlpha = 0.95;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.2;
    if (g.setLineDash) g.setLineDash([2.5, 2]);
    g.strokeRect(px, py, w, w);
    g.restore();
  }
  /**
   * THE SEED IS THE SITTER'S BUG, AND THE FIX WAS NOT APPLIED TO IT.
   *
   * Everything written above paintSitter is true of the seed as well, and it
   * was left behind when the sitter was fixed. The seed is the confluence
   * winner — a tile the planner REASONS from, never a tile it builds on: it
   * has no entry in STAGE_KIND, so it fell through paintTile to paintRect and
   * filled opaquely, and ctxFor put it on the structures canvas where no fade
   * dims it and no stage erases it.
   *
   * WHAT WAS COUNTED, AND WHEN. This census is a HISTORICAL SNAPSHOT of the
   * artifact the bug was found on — 203 films, including rooms (E11S10, E12S0)
   * that no longer exist in the claimable world — and it is not re-derivable
   * against today's fleet, because the bug it counts is fixed and the fleet has
   * been re-planned several times since. It used to end "24 of the 203 films
   * end with it still visible, 20 of them in the current 172-room fleet", and
   * that second number was wrong twice over: its own tile lists add up to 22
   * current, and an independent scan of a later artifact found 19. A number
   * that cannot be printed by anything should not be stated as if it were
   * current, so the fleet-relative claim is withdrawn and the snapshot is
   * labelled as one.
   *
   * On that snapshot: 24 of the 203 films ended with the seed still visible —
   * 14 of them on top of a road the room does ship (E17S4 21,18 · E12S6 28,10 ·
   * E9S7 11,14 · E15S2 17,23 · E6S3 12,18 among them) and 10 on bare floor
   * (E12S3 30,22 · E13S9 17,35 · E17S8 17,40 · E19S7 32,38 · E1S9 19,30 ·
   * E2S1 27,16 · E2S2 30,31 · E4S3 24,25, plus E11S10 and E12S0 from the
   * retired world). The other 179 were not correct, only lucky: a structure
   * happens to land on the seed tile later and paints over the square on the
   * same canvas. All 24 sat under a HUD that reads "plan complete — this last
   * frame IS the shipped plan, tile for tile".
   *
   * The two rejections recorded for the sitter hold here word for word.
   * Rejected: dropping the seed beat. It is the decision layer 1 is built
   * around and the whole basin grows out of it; a film of the planner thinking
   * that does not show the tile it thought from is worse than one with a wrong
   * square in it. Rejected: painting it on the marks canvas, which drawMarks
   * clears and redraws every frame — the seed would become the one placement a
   * rewind could not take back.
   *
   * So, like the sitter, it is a MARK: a dashed yellow ring inset into the
   * tile over a low-alpha wash, same geometry, in the seed's own #ffff33. The
   * road underneath reads through it, the tile still reads as chosen, and the
   * seed never claims to be a plan tile.
   */
  function paintSeed(g, x, y) {
    var px = x * CELL + 2.5, py = y * CELL + 2.5, w = CELL - 5;
    g.save();
    g.globalAlpha = 0.12;
    g.fillStyle = '#ffff33';
    g.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    g.globalAlpha = 0.95;
    g.strokeStyle = '#ffff33';
    g.lineWidth = 1.2;
    if (g.setLineDash) g.setLineDash([2.5, 2]);
    g.strokeRect(px, py, w, w);
    g.restore();
  }
  /**
   * Layer 6's relocation ghost: an extension the fill really did put here, and
   * really did take away again. Drawn as the extension sprite at a third alpha
   * under a dashed red ring — the dash says "provisional" in the same visual
   * language as the sitter and seed rings, and the red is the prune's colour,
   * because this tile is about to be taken back exactly like a pruned road.
   * It lives on its own canvas (see ctxFor) so unpaintGhost cannot reach the
   * road or the extension underneath it.
   */
  function paintExtGhost(g, x, y) {
    g.save();
    g.globalAlpha = 0.34;
    if (SPRITE.extension) g.drawImage(SPRITE.extension, x * CELL, y * CELL, CELL, CELL);
    else { g.fillStyle = '#ffd24d'; g.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4); }
    g.globalAlpha = 0.9;
    g.strokeStyle = '#ff4444';
    g.lineWidth = 1.2;
    if (g.setLineDash) g.setLineDash([2.5, 2]);
    g.strokeRect(x * CELL + 2.5, y * CELL + 2.5, CELL - 5, CELL - 5);
    g.restore();
  }
  /** the relocation completes: the slot the extension came from is vacated */
  function unpaintGhost(g, x, y) {
    g.clearRect(x * CELL, y * CELL, CELL, CELL);
  }
  /** layer 7's prune: the tile had a road, and now it does not */
  function unpaintRoad(g, x, y) {
    g.clearRect(x * CELL, y * CELL, CELL, CELL);
  }
  function kindFor(stage, x, y) {
    if (stage === 'claims') {
      var ck = CLAIMK[x + ',' + y];
      if (ck) return ck;
      if (SITTER && x === SITTER.x && y === SITTER.y) return '#sitter';
      return null;
    }
    return STAGE_KIND[stage] || null;
  }
  function paintTile(g, stage, x, y, hex) {
    var k = kindFor(stage, x, y);
    if (k === '#road') { paintRoad(g, x, y); return; }
    if (k === '#unroad') { unpaintRoad(g, x, y); return; }
    if (k === '#rampart') { paintRampart(g, x, y); return; }
    if (k === '#sitter') { paintSitter(g, x, y); return; }
    if (k === '#seed') { paintSeed(g, x, y); return; }
    if (k === '#extghost') { paintExtGhost(g, x, y); return; }
    if (k === '#unghost') { unpaintGhost(g, x, y); return; }
    if (k && SPRITE[k]) { g.drawImage(SPRITE[k], x * CELL, y * CELL, CELL, CELL); return; }
    paintRect(g, x, y, hex);   // scaffolding, and anything unmapped
  }

  // --- markers + transient FX ----------------------------------------------
  var cursor = null;
  function disc(p, fill) {
    gM.beginPath();
    gM.arc(p.x * CELL + CELL / 2, p.y * CELL + CELL / 2, CELL * 0.42, 0, 6.2832);
    gM.fillStyle = fill; gM.fill();
  }
  function mark(p, kind, fill) {
    if (!p) return;
    disc(p, fill);
    if (SPRITE[kind]) gM.drawImage(SPRITE[kind], p.x * CELL, p.y * CELL, CELL, CELL);
  }
  function drawMarks() {
    gM.clearRect(0, 0, W, W);
    for (var s = 0; s < MARKS.sources.length; s++) mark(MARKS.sources[s], 'source', 'rgba(255,225,77,0.30)');
    mark(MARKS.controller, 'controller', 'rgba(102,204,255,0.30)');
    mark(MARKS.mineral, 'mineral', 'rgba(224,166,255,0.30)');
    if (MARKS.hub) {
      gM.beginPath();
      gM.arc(MARKS.hub.x * CELL + CELL / 2, MARKS.hub.y * CELL + CELL / 2, CELL * 0.5, 0, 6.2832);
      gM.lineWidth = 1.6; gM.strokeStyle = '#00E676'; gM.stroke();
    }
    // the eye needs somewhere to be between placements — this is where the
    // planner's hand is resting right now
    if (cursor) {
      gM.save();
      gM.strokeStyle = '#fff'; gM.globalAlpha = 0.9; gM.lineWidth = 1.6;
      if (gM.setLineDash) gM.setLineDash([3, 3]);
      gM.strokeRect(cursor.x * CELL - 1.5, cursor.y * CELL - 1.5, CELL + 3, CELL + 3);
      gM.restore();
    }
  }

  var fx = [], fxDirty = false;
  function addPulse(x, y, hex) { fx.push({ k: 0, x: x, y: y, c: hex, t0: now(), life: 620 }); }
  function addRange(x, y, r) { fx.push({ k: 1, x: x, y: y, r: r, c: '#ff8844', t0: now(), life: 1200 }); }
  function addTrail(x, y, hex) { fx.push({ k: 2, x: x, y: y, c: hex, t0: now(), life: 2600 }); }
  function drawFx(t) {
    if (!fx.length) {
      if (fxDirty) { drawMarks(); fxDirty = false; }
      return;
    }
    drawMarks();
    for (var i = fx.length - 1; i >= 0; i--) {
      var f = fx[i], a = (t - f.t0) / f.life;
      if (a >= 1) { fx.splice(i, 1); continue; }
      if (a < 0) a = 0;
      var cx = f.x * CELL + CELL / 2, cy = f.y * CELL + CELL / 2;
      gM.save();
      if (f.k === 0) {
        var e = 1 - Math.pow(1 - a, 3);          // ease-out expansion
        gM.strokeStyle = f.c;
        gM.globalAlpha = 1 - a;
        gM.lineWidth = 3.2 * (1 - a) + 0.5;
        gM.beginPath(); gM.arc(cx, cy, CELL * (0.45 + 3.0 * e), 0, 6.2832); gM.stroke();
        gM.globalAlpha = (1 - a) * 0.55;
        gM.beginPath(); gM.arc(cx, cy, CELL * (0.45 + 1.5 * e), 0, 6.2832); gM.stroke();
      } else if (f.k === 1) {
        var sx = (f.x - f.r) * CELL, sy = (f.y - f.r) * CELL, sw = (2 * f.r + 1) * CELL;
        gM.strokeStyle = f.c; gM.lineWidth = 1.6;
        if (gM.setLineDash) gM.setLineDash([5, 4]);
        gM.globalAlpha = (1 - a) * 0.9;
        gM.strokeRect(sx, sy, sw, sw);
        gM.globalAlpha = (1 - a) * 0.10;
        gM.fillStyle = f.c; gM.fillRect(sx, sy, sw, sw);
      } else {
        gM.globalAlpha = (1 - a) * 0.5;
        gM.fillStyle = f.c;
        gM.fillRect(f.x * CELL + 2, f.y * CELL + 2, CELL - 4, CELL - 4);
      }
      gM.restore();
    }
    fxDirty = true;
  }

  // --- title cards ----------------------------------------------------------
  var elTitle = document.getElementById('animTitle');
  var elTName = document.getElementById('animTitleName');
  var elTWhy = document.getElementById('animTitleWhy');
  var titleT0 = 0, titleOn = false;
  function showTitle(stage) {
    var txt;
    if (stage === '__done') txt = ['PLAN COMPLETE', ROOM + ' · ' + plc.length + ' placements'];
    else {
      var inf = info(stage);
      txt = [(inf[0] ? 'LAYER ' + inf[0] + ' — ' : '') + inf[1].toUpperCase(), inf[2] || ''];
    }
    elTName.textContent = txt[0];
    elTWhy.textContent = txt[1];
    titleT0 = now(); titleOn = true;
    tickTitle(titleT0);
  }
  function tickTitle(t) {
    if (!titleOn) return;
    var age = t - titleT0;
    var o = age < TITLE_HOLD ? Math.min(1, 0.12 + age / 150) : 1 - (age - TITLE_HOLD) / TITLE_FADE;
    if (age >= TITLE_HOLD + TITLE_FADE) { titleOn = false; o = 0; }
    else if (o < 0) o = 0;
    elTitle.style.opacity = o;
    elTitle.style.transform = 'scale(' + (1.05 - 0.05 * Math.min(1, age / 420)) + ')';
  }

  // --- playback -------------------------------------------------------------
  var steps = null, palette = [], plc = [], idx = 0, acc = 0, last = 0;
  var holdUntil = 0, pauseUntil = 0, playing = true, speed = 1, trails = true;
  var stageStart = {}, stageTiles = {}, tileRun = [], stageOrder = [], curStage = null;
  var rates = {}, scaff = {}, fadeAAt = Infinity, fadeBAt = Infinity;
  // stages where EXPAND disagrees with the exporter's scaffold flag — see the
  // drift check in the fetch handler. Empty on a healthy film; when it is not
  // empty the HUD says so out loud rather than printing a confident wrong unit.
  var expandDrift = {};
  var elPlay = document.getElementById('animPlay');
  var elCount = document.getElementById('animCount');
  var elLabel = document.getElementById('animLabel');
  var elStages = document.getElementById('animStages');
  var elBar = document.getElementById('animBar');
  var elBadge = document.getElementById('animBadge');
  var elName = document.getElementById('animName');
  var elWhy = document.getElementById('animWhy');
  var elNote = document.getElementById('animNote');
  var elSpeed = document.getElementById('animSpeed');
  var elSpeedVal = document.getElementById('animSpeedVal');
  var elRate = document.getElementById('animRate');
  var elTrails = document.getElementById('animTrails');
  // the shortfall/notes ticker is emitted server-side (animShortfallTicker) and
  // is ABSENT — not empty — in a room that has neither a declared shortfall nor
  // a planner note to carry, so every use of it is guarded
  var elSf = document.getElementById('animSf');

  /**
   * Roads and ramparts go UNDER the structures, exactly as the gallery stacks
   * them — ramparts on gU, roads on gR above it, structures on gC above that.
   * The road stages are recognised by STAGE_KIND rather than by a name list,
   * so adding a seventh road stage cannot silently put it on the wrong canvas
   * (which, for the erase stage, would clear the ramparts).
   */
  function isRoadStage(stage) {
    var k = STAGE_KIND[stage];
    return k === '#road' || k === '#unroad';
  }
  /** the paint-then-erase pair for layer 6's relocation — same rule as roads */
  function isGhostStage(stage) {
    var k = STAGE_KIND[stage];
    return k === '#extghost' || k === '#unghost';
  }
  function ctxFor(stage) {
    if (isRoadStage(stage)) return gR;
    if (isGhostStage(stage)) return gG;
    if (stage === 'ramparts') return gU;
    if (!scaff[stage]) return gC;
    return SCAFF_LATE[stage] ? gB : gA;
  }
  function rateOf(stage) {
    var r = rates[stage];
    return (r > 0) ? r : 1;
  }
  function drawPlacement(p) {
    var st = steps[p.s], g = ctxFor(st.stage), c = st.cells, i;
    if (p.o < 0) {
      for (i = 0; i < c.length; i += 3) paintTile(g, st.stage, c[i], c[i + 1], palette[c[i + 2]]);
    } else {
      paintTile(g, st.stage, c[p.o], c[p.o + 1], palette[c[p.o + 2]]);
    }
  }
  function clearCells() {
    gA.clearRect(0, 0, W, W); gB.clearRect(0, 0, W, W);
    gU.clearRect(0, 0, W, W); gR.clearRect(0, 0, W, W);
    gG.clearRect(0, 0, W, W); gC.clearRect(0, 0, W, W);
  }
  /** the thinking layers recede as the real base lands on top of them */
  function applyFades(i) {
    elScaffA.style.opacity = i >= fadeBAt ? 0.14 : (i >= fadeAAt ? 0.25 : 1);
    elScaffB.style.opacity = i >= fadeBAt ? 0.25 : 1;
  }

  function seek(to) {
    if (to < 0) to = 0;
    if (to > plc.length) to = plc.length;
    clearCells();
    fx.length = 0; fxDirty = true;
    for (var i = 0; i < to; i++) drawPlacement(plc[i]);
    idx = to; acc = 0; holdUntil = 0; pauseUntil = 0;
    cursor = to > 0 ? tileOf(plc[to - 1]) : null;
    applyFades(idx);
    if (!plc.length) return;   // no steps: nothing to title, nothing to count
    curStage = steps[plc[Math.min(idx, plc.length - 1)].s].stage;
    // THE END OF THE FILM IS A PLACE YOU CAN ARRIVE AT TWO WAYS.
    //
    // showTitle('__done') used to fire only from the play loop, at the moment
    // idx crossed plc.length. Drag the scrubber to the end, or press
    // "next stage" on the last stage, and you landed on the identical final
    // frame with "LAYER 6 — EXTENSIONS" over it — the card claiming the film
    // was still mid-extension while the finished plan sat underneath. The
    // completion card belongs to the STATE, not to the route taken to it.
    showTitle(idx >= plc.length ? '__done' : curStage);
    drawMarks();
    hud();
  }
  function tileOf(p) {
    var c = steps[p.s].cells, o = p.o < 0 ? 0 : p.o;
    return { x: c[o], y: c[o + 1] };
  }

  function advance() {
    var p = plc[idx], st = steps[p.s];
    drawPlacement(p);
    if (p.o >= 0) {
      var x = st.cells[p.o], yy = st.cells[p.o + 1], hex = palette[st.cells[p.o + 2]] || '#ffffff';
      cursor = { x: x, y: yy };
      addPulse(x, yy, hex);
      if (trails) addTrail(x, yy, hex);
      if (st.stage === 'towers') addRange(x, yy, TOWER_RANGE);
    } else {
      cursor = null;
    }
    idx++;
    applyFades(idx);
    drawMarks();
  }

  function hud() {
    var done = idx >= plc.length;
    var i = Math.min(idx, plc.length);
    var cur = plc[Math.min(idx, plc.length - 1)];
    var active = done ? stageOrder[stageOrder.length - 1] : steps[cur.s].stage;
    var inf = info(active);
    var tiles = done ? stageTiles[active] : (i > stageStart[active] ? tileRun[i - 1] : 0);
    elBadge.textContent = inf[0] ? 'Layer ' + inf[0] : 'stage';
    elName.textContent = inf[1];
    elWhy.textContent = inf[2] || '';
    elNote.textContent = NOTES[active] || '';
    elCount.textContent = tiles + ' / ' + stageTiles[active] + ' ' + inf[3];
    elLabel.textContent = done
      ? 'plan complete — this last frame IS the shipped plan, tile for tile'
      : steps[cur.s].label;
    // ...and the shipped plan is a plan with declared misses in it. The ticker
    // rides the completion state, not the route taken to it (same rule the
    // '__done' title card follows in seek): scrub to the end, press next-stage
    // off the last layer, or let it play out, and the declarations are there.
    if (elSf) elSf.hidden = !done;
    elBar.style.width = (100 * i / plc.length) + '%';
    // the scaffolding stages are paced a WHOLE BAND at a time, so "tiles/sec"
    // would be a lie there by two orders of magnitude
    elRate.textContent = '≈ ' + (TILE_RATE * rateOf(active) * speed).toFixed(1) +
      (EXPAND[active] ? ' tiles/sec here' : ' bands/sec here') +
      // never silently. The unit follows EXPAND because the PACING follows
      // EXPAND — printing the exporter's scaffold flag instead would just move
      // the lie — so when the two disagree the readout says the number under it
      // is not to be trusted rather than picking a side.
      (expandDrift[active] ? ' — UNIT UNVERIFIED: this stage is on the wrong side of EXPAND (see console)' : '');
    var kids = elStages.children;
    for (var k = 0; k < kids.length; k++) {
      var sg = kids[k].getAttribute('data-stage');
      kids[k].className = 'stage' + (sg === active ? ' on'
        : (stageOrder.indexOf(sg) < stageOrder.indexOf(active) ? ' past' : ''));
    }
  }

  function frame(t) {
    requestAnimationFrame(frame);
    drawFx(t);
    tickTitle(t);
    if (!steps) return;
    if (!last) last = t;
    var dt = (t - last) / 1000; last = t;
    if (dt > 0.5) dt = 0.5;
    if (!playing) return;
    if (idx >= plc.length) {
      if (!holdUntil) holdUntil = t + HOLD_MS;
      else if (t >= holdUntil) { holdUntil = 0; seek(0); }
      return;
    }
    if (pauseUntil) {
      if (t < pauseUntil) return;
      pauseUntil = 0;
    }
    // budget in SECONDS: a placement costs 1/(TILE_RATE * stageRate), so a
    // stage rate of 5 skims and a rate of 0.4 dwells on every single tile.
    acc += dt * speed;
    var moved = false, guard = 0;
    while (idx < plc.length) {
      var sg = steps[plc[idx].s].stage;
      if (sg !== curStage) {
        // BEAT BETWEEN LAYERS. The cut used to happen mid-stride and the eye
        // never registered that the subject had changed.
        curStage = sg; showTitle(sg); hud();
        pauseUntil = t + LAYER_PAUSE_MS / Math.max(0.5, speed);
        acc = 0;
        return;
      }
      var cost = 1 / (TILE_RATE * rateOf(sg));
      if (acc < cost) break;
      acc -= cost; advance(); moved = true;
      if (++guard > 400) { acc = 0; break; }
    }
    if (moved) {
      hud();
      if (idx >= plc.length) showTitle('__done');
    }
  }

  function setPlaying(v) {
    playing = v;
    elPlay.innerHTML = playing ? '&#10074;&#10074; pause' : '&#9654; play';
  }
  function stageOf(i) { return steps[plc[Math.min(i, plc.length - 1)].s].stage; }

  elPlay.onclick = function () { setPlaying(!playing); };
  document.getElementById('animRestart').onclick = function () { seek(0); };
  document.getElementById('animFwd').onclick = function () {
    setPlaying(false);
    if (idx < plc.length) { curStage = stageOf(idx); advance(); hud(); }
  };
  document.getElementById('animBack').onclick = function () {
    setPlaying(false); seek(idx - 1);
  };
  document.getElementById('animNextStage').onclick = function () {
    var here = stageOrder.indexOf(stageOf(idx >= plc.length ? plc.length - 1 : idx));
    var nxt = here + 1;
    while (nxt < stageOrder.length && stageStart[stageOrder[nxt]] <= idx) nxt++;
    seek(nxt < stageOrder.length ? stageStart[stageOrder[nxt]] : plc.length);
  };
  document.getElementById('animPrevStage').onclick = function () {
    var here = stageOrder.indexOf(stageOf(Math.min(idx, plc.length - 1)));
    var top = stageStart[stageOrder[here]];
    // rewind to the top of THIS layer first; a second press goes back one more
    seek(idx > top + 1 ? top : (here > 0 ? stageStart[stageOrder[here - 1]] : 0));
  };
  elSpeed.oninput = function () {
    speed = Math.pow(2, parseFloat(elSpeed.value));
    elSpeedVal.innerHTML = (speed < 1 ? speed.toFixed(2).replace(/0+$/, '') : speed.toFixed(2).replace(/\\.?0+$/, '')) + '&times;';
    if (steps) hud();
  };
  elTrails.onchange = function () { trails = elTrails.checked; };

  loadSprites(function () {
    drawMarks();
    fetch('anim/' + ROOM + '.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (a) {
        // THE FILM HAS TO BE OF THIS PLAN, AND NOW IT HAS TO PROVE IT.
        // Nothing below this point is drawn unless the film's own digest is the
        // digest this page carries. Loud in three places at once — the console,
        // the label under the player and the banner itself — because the failure
        // it catches (a film of the PREVIOUS plan, silently painting structures
        // this room does not have, under "this last frame IS the shipped plan,
        // tile for tile") looks exactly like success from across the desk.
        if (a.planHash !== PLAN_HASH) {
          var got = a.planHash
            ? String(a.planHash)
            : '(none — written before films carried a plan digest)';
          var msg = 'FILM / PAGE MISMATCH — anim/' + ROOM + '.json is a film of plan ' + got +
            ', and this page was rendered from plan ' + PLAN_HASH + '. Every caption, the terrain, ' +
            'the hub kinds and the sitter on this page come from THIS plan; the film does not. ' +
            'Nothing has been drawn. Run: node tools/plan-suite/v2/export-anim.mjs --all';
          console.error('anim ' + ROOM + ': ' + msg);
          elLabel.textContent = msg;
          elLabel.style.color = '#ff8b8b';
          var em = document.getElementById('animMeta');
          if (em) { em.style.color = '#ff8b8b'; }
          elBadge.textContent = 'MISMATCH';
          elName.textContent = 'this film is not of this plan';
          elWhy.textContent = 'the player will not draw a film the page cannot vouch for';
          elNote.textContent = '';
          elCount.textContent = '';
          if (elSf) elSf.hidden = true;
          steps = null;
          return;
        }
        steps = a.steps;
        palette = [];
        for (var k in a.palette) palette[+k] = a.palette[k];
        // meta is optional — without it every stage runs at 1x on one cell layer
        var meta = a.meta || {};
        rates = meta.stageRates || {};
        scaff = meta.stageScaffold || {};

        // THE HARD CHECK THAT MAKES THE EXPAND OMISSION IMPOSSIBLE TO KEEP.
        // stageScaffold is written by export-anim for exactly the stages this
        // film contains, so it is the one list of stages that cannot go stale —
        // it is derived from the steps, not typed out. EXPAND is typed out. Any
        // stage where the two disagree is a table that drifted: a non-scaffold
        // stage missing from EXPAND films a whole chunk as one placement and
        // reports "bands/sec" for tiles (this is what the seed stage did), and a
        // scaffold stage listed in EXPAND would crawl a 400-tile flood one cell
        // at a time. Both are loud in the console AND on the HUD, because a
        // console message nobody opens devtools for is a comment with extra
        // steps. Nothing is auto-corrected: guessing which of the two tables was
        // right is how a film ends up confidently wrong again.
        if (meta.stageScaffold) {
          var drift = [];
          for (var ds in scaff) if (!scaff[ds] !== !!EXPAND[ds]) { drift.push(ds); expandDrift[ds] = 1; }
          if (drift.length) {
            console.error('anim ' + ROOM + ': EXPAND disagrees with meta.stageScaffold for [' +
              drift.join(', ') + ']. Every non-scaffold stage must be in EXPAND and no scaffold ' +
              'stage may be — fix the EXPAND table in plan.mjs. Until then the pacing and the ' +
              'rate readout for those stages are wrong.');
          }
        }

        // EXPAND THE CHUNKS. export-anim packs 2-3 tiles per step to fit a
        // memory segment; that is packaging, and the film should not inherit it.
        for (var i = 0; i < steps.length; i++) {
          var st = steps[i];
          if (EXPAND[st.stage]) {
            for (var o = 0; o < st.cells.length; o += 3) plc.push({ s: i, o: o, n: 1 });
          } else {
            plc.push({ s: i, o: -1, n: st.cells.length / 3 });
          }
        }
        for (var j = 0; j < plc.length; j++) {
          var sg = steps[plc[j].s].stage;
          if (!(sg in stageStart)) { stageStart[sg] = j; stageOrder.push(sg); stageTiles[sg] = 0; }
          stageTiles[sg] += plc[j].n;
          tileRun[j] = stageTiles[sg];
        }
        // dt+fields recede once real tiles get claimed; basin+core at the wall
        fadeAAt = stageStart.claims !== undefined ? stageStart.claims
          : (stageStart.roads !== undefined ? stageStart.roads : Infinity);
        fadeBAt = stageStart.ramparts !== undefined ? stageStart.ramparts
          : (stageStart.towers !== undefined ? stageStart.towers : Infinity);
        for (var q = 0; q < stageOrder.length; q++) {
          var b = document.createElement('button');
          var inf = info(stageOrder[q]);
          b.className = 'stage'; b.textContent = inf[4];
          b.setAttribute('data-stage', stageOrder[q]);
          b.setAttribute('title', inf[1] + ' — ' + inf[2]);
          b.onclick = (function (name) {
            return function () { seek(stageStart[name]); };
          })(stageOrder[q]);
          elStages.appendChild(b);
        }
        seek(0);
        requestAnimationFrame(frame);
      })
      .catch(function (e) {
        elLabel.textContent = 'no animation for ' + ROOM + ' (' + e.message +
          ') — run: node tools/plan-suite/v2/export-anim.mjs --all';
      });
  });
})();
</script>`;
  // OF9: the player's three stage tables are text in this string, so they are
  // checked as text, once per run, before the first page is written.
  assertStageTables(html);
  return html;
}

/** the only escape in this file — details are prose written by the layers */
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** the target the as-built gated lap is judged against (layer-shell MOBILITY_TARGET) */
const MOBILITY_TARGET = 1.2;
/** pairs whose absolute detour is at or below this many tiles are not judged */
const MOBILITY_DETOUR_FLOOR = 4;

/** the as-built gated lap — the number that decides, not the shell's mass-free one */
function builtGated(plan) {
  const v = plan?.meta?.walls?.mobility?.builtGated;
  return typeof v === "number" ? v : null;
}
function mobilityOver(plan) {
  const v = builtGated(plan);
  return v !== null && v > MOBILITY_TARGET;
}
/**
 * O5 (round 19) — A LAP OF 0 IS NOT A PASS, AND BOTH HUMAN CHANNELS PAINTED IT
 * AS ONE.
 *
 * `builtGated` is the MAXIMUM over the pairs the gate judged, so 0 means the set
 * was EMPTY: either no pair of wall tiles has an absolute detour over the
 * 4-tile floor, or the ones that do are excused by coverage. The index chip
 * rendered that in the pass colour ("as-built gated lap 0") and the room page
 * added the words "within target" to it. Most of the fleet is in that state and
 * the minimum POSITIVE lap in the fleet is well over the target, so on today's
 * artifact "within target" was printed exactly as often as the measurement was
 * not taken, and never once about a room that took it and passed.
 *
 * The console line one screen down has said "A ZERO IS NOT A GOOD ROOM, IT IS AN
 * UNJUDGED ONE" for three rounds and separates the two populations before
 * averaging. These two do it now as well: a neutral colour, the word UNJUDGED,
 * and which of the two reasons it was — derived from `maxDetour`, the record's
 * own worst absolute detour, so the sentence cannot drift from the board.
 * The measured-and-within-target branch stays exactly where it was; it is
 * simply no longer the branch an unmeasured room falls into.
 */
function mobilityUnjudged(plan) {
  return builtGated(plan) === 0;
}
/**
 * ...and the short form the chip itself wears. TWO ROOMS make the obvious label
 * false: E6S3 and E7S5 have pairs whose absolute detour clears the floor (5 and
 * 33 tiles) and the gate judged neither, because coverage excuses them. A chip
 * reading "no pair over the detour floor" on the room holding the worst detour
 * in the fleet would be the same false-of-the-board sentence this round is
 * spent removing, so the branch is taken from `maxDetour` too.
 */
function mobilityUnjudgedShort(plan) {
  const md = plan?.meta?.walls?.mobility?.maxDetour;
  return typeof md === "number" && md > MOBILITY_DETOUR_FLOOR
    ? `every pair over the detour floor is covered`
    : `no pair over the detour floor`;
}
/**
 * ...and the long form, which is NOT written here. See `unjudgedReason` in
 * declprose-mobility: the declaration's headline has to give this same answer
 * off its own record, and a second copy of the sentence in this file is how the
 * film came to state a different reason from the page it sits beside. This
 * function is the plan-shaped ADAPTER — it knows where the two fields live on
 * `meta.walls.mobility` — and the wording is the prose module's.
 */
function mobilityUnjudgedWhy(plan) {
  const mob = plan?.meta?.walls?.mobility;
  return `the gate judged no pair: ${unjudgedReason(mob?.maxDetour, MOBILITY_DETOUR_FLOOR)}`;
}

/**
 * DECLARED SHORTFALLS, rendered in full. A room that met every gate says so
 * out loud — omitting the section for the clean rooms is the same hiding bug
 * one level up, because then an empty page is indistinguishable from a page
 * that never had the section at all.
 */
function shortfallsHtml(plan) {
  const list = plan.meta?.shortfalls || [];
  if (!list.length) {
    return `<div class="card sf-card"><h3>Declared shortfalls</h3>
<p class="sf-none">No declared shortfalls — this room met every gate it was measured against.</p></div>`;
  }
  const items = list
    .map((s) => {
      const tag = [s.gate, s.kind, s.source].filter(Boolean).map(esc).join(" · ");
      const tiles = (s.tiles || []).length
        ? `<div class="sf-tiles">tiles: ${s.tiles.map((t) => `${t.x},${t.y}`).join(" · ")}</div>`
        : "";
      return `<div class="sf-item"><div class="sf-gate">${tag || "(untagged gate)"}</div>
<div class="sf-detail">${esc(s.detail)}</div>${tiles}</div>`;
    })
    .join("\n");
  return `<div class="card sf-card"><h3>Declared shortfalls · ${list.length}</h3>
<p class="sf-lead">Every gate this plan knowingly failed, in the layer's own words. Nothing here is a crash — it is a
measured miss the planner chose to publish rather than paper over.</p>
${items}</div>`;
}

/**
 * PLANNER NOTES — THE CHANNEL THE GALLERY WAS THROWING AWAY.
 *
 * `meta.notes` is the planner's observation channel: layers write into it when
 * they have measured something about the room that a reader needs in order to
 * judge the plan, but which excuses nothing. In the 159-room world this defect
 * was found in, 79 of those rooms carried at least one — and not one of them
 * was rendered anywhere. (The share moves with the fleet and is not re-typed
 * here; the index's note badge prints each room's count from its own record.
 * Round 20, criticism 80.) E8S5's page printed "Declared
 * shortfalls · 3" and said nothing at all about its own
 * "SEALED INTERIOR FLOOR: 2 tile(s) ... (24,35 24,36)" note — the strings
 * SEALED, 24,35 and 24,36 appeared zero times in E8S5.html, and neither SEALED
 * nor SHALLOW EXTENSIONS appeared anywhere in the index. validate.mjs read
 * meta.notes and printed them; the gallery, which is the artifact anyone
 * actually opens, did not. "Every shortfall must be loud and explained" is not
 * a claim a page can make while dropping half of what the planner said.
 *
 * WHY THIS IS A SEPARATE CARD AND NOT MORE ROWS IN THE SHORTFALL CARD. The two
 * channels mean opposite things to a reviewer, and the validator treats them as
 * opposites: a SHORTFALL is a declaration that turns a would-be FAIL into a
 * pass, and a NOTE excuses nothing and is printed regardless. Merging them
 * would let a note read as an excuse, which is precisely the laundering the
 * declaration channel exists to make visible. Different card, different colour,
 * different lead paragraph, and each says in words which of the two it is.
 *
 * Notes are pre-composed prose from the layers, so they are escaped and printed
 * verbatim; the gallery does not get to summarise a measurement it did not make.
 */
function notesHtml(plan) {
  const list = (plan.meta?.notes || []).filter((n) => typeof n === "string" && n.length);
  if (!list.length) {
    return `<div class="card nt-card"><h3>Planner notes</h3>
<p class="nt-none">No notes — no layer had an observation to record about this room.</p></div>`;
  }
  const items = list
    .map((n) => {
      // layers write "TOPIC: sentence." — split the shouted topic into its own
      // line when there is one, and leave the note alone when there is not
      const m = /^([A-Z][A-Z0-9 \-/]{3,60}):\s*([\s\S]+)$/.exec(n);
      const topic = m ? `<div class="nt-topic">${esc(m[1])}</div>` : "";
      return `<div class="nt-item">${topic}<div class="nt-detail">${esc(m ? m[2] : n)}</div></div>`;
    })
    .join("\n");
  return `<div class="card nt-card"><h3>Planner notes · ${list.length}</h3>
<p class="nt-lead">Observations the layers recorded about this room. <b>A note is not a shortfall.</b> It excuses
nothing and it is not attached to a gate — nothing above passes because of anything below. These are measurements the
planner thought a reader would need in order to judge the plan, printed whether or not the room met every gate.</p>
${items}</div>`;
}

/** the defender-mobility row: as-built gated lap first, shell reading demoted */
/**
 * "ROADS TO THE RAMPARTS, NEVER ON THEM" — AND THE TWO PLACES IT IS NOT TRUE.
 *
 * The doctrine line was printed flat, next to a plan that stacks a road on a
 * rampart in almost every room. Both cases are deliberate and neither is a spur:
 *
 *   CROSSINGS  an eco road to a source or controller the cut could not afford to
 *              enclose has to pass THROUGH the wall line. There is no route
 *              around a closed loop; the alternative is not paving to the source.
 *   BUBBLE SEATS  a miner's container outside the shell carries its own personal
 *              rampart, and the seat is on the hauling road because it IS the
 *              hauling road's destination. (A fleet-wide tile count stood here
 *              and was false by round 20. meta.walls.roadRampart.seat carries
 *              each room's, and the note below prints it on the room page.
 *              Criticism 80.)
 *
 * Printed from the plan rather than asserted, so the exception cannot drift away
 * from the thing it is excusing.
 */
function roadOnRampartNote(plan) {
  // ONE CLASSIFIER, IN THE PLANNER. This used to be a private two-class count
  // ending in `else cross++`, and that catch-all mislabelled 17 fleet tiles that
  // are neither crossings nor seats. See classifyRoadRamparts in layer-walls:
  // the class it could not see is the controller's stand-denial ring, and the
  // fifth bucket (`unclassified`) is now printed rather than absorbed.
  const rr = plan.meta?.walls?.roadRampart;
  if (!rr || !rr.total) return "";
  const bits = [];
  if (rr.crossing)
    bits.push(
      `${rr.crossing} wall CROSSING${rr.crossing === 1 ? "" : "s"} (an eco road to an unenclosed source or controller has to pass through the loop)`,
    );
  if (rr.seat)
    bits.push(
      `${rr.seat} bubble SEAT${rr.seat === 1 ? "" : "S"} (a miner's container outside the shell wears its own rampart and sits on the hauling road by design)`,
    );
  if (rr.ring)
    bits.push(
      `${rr.ring} controller STAND-DENIAL RING tile${rr.ring === 1 ? "" : "s"} (the ring is ramparted so no claim creep can stand by the controller, and the lane to the controller crosses it)`,
    );
  if (rr.cover)
    bits.push(
      `${rr.cover} personal-COVER tile${rr.cover === 1 ? "" : "s"} (a shallow structure of ours wearing its own rampart on a paved tile)`,
    );
  if (rr.unclassified)
    bits.push(
      `<b>${rr.unclassified} UNCLASSIFIED</b> — a paved rampart that is not on the cut, carries nothing and is not on the ring; this bucket is supposed to be empty`,
    );
  if (!bits.length) return "";
  return ` — except ${bits.join(", ")}`;
}

function mobilityCell(plan) {
  const mob = plan.meta?.walls?.mobility;
  const bg = builtGated(plan);
  if (!mob || bg === null) return "—";
  const over = bg > MOBILITY_TARGET;
  const shell = plan.shell
    ? `shell ungated record ${plan.shell.mobility.max} max · ${plan.shell.mobility.mean} mean`
    : "shell ungated record —";
  const floorGated = typeof mob.floorGated === "number" ? mob.floorGated : "—";
  const unjudged = mobilityUnjudged(plan);
  // ------------------------------------------------------------------
  // OL7 (round 23) — THE ONE READING THAT DESCRIBES THE SHIPPED ROOM.
  //
  // Three ratios exist for every room and only two reached a reader. The gated
  // as-built lap is the one the 1.2 target applies to, and in 117 rooms it is
  // UNJUDGED — the detour floor excuses every pair — so the only number those
  // pages painted was the SHELL's, measured on the bare cut with no extension
  // mass at all. `meta.walls.mobility.built` is the third: the same ungated
  // ratio with the mass IN PLACE, i.e. the worst pair in the room the plan
  // actually ships. It is higher than the painted shell figure in ten of the
  // 117 (E9S2 1 -> 1.43 is the widest), and it was in no reader channel.
  //
  // It is not a verdict and it is not labelled as one: it has no gate, no target
  // and no floor, and the label says so. It is here because a room page that
  // prints two readings of a quantity and withholds the third — the one taken on
  // the finished board — is choosing which number the reader gets to see.
  // ------------------------------------------------------------------
  const bu = typeof mob.built === "number" ? mob.built : null;
  return `<span class="mob-main${over ? " mob-over" : unjudged ? " mob-unj" : ""}">${bg}</span> ` +
    `<span class="mob-lab">as-built gated lap</span>` +
    (unjudged
      ? ` <span class="mob-none">UNJUDGED — ${esc(mobilityUnjudgedShort(plan))}</span>`
      : over
        ? ` <span class="mob-badge">over target ${MOBILITY_TARGET}</span>`
        : ` <span class="mob-ok">measured, within target</span>`) +
    (unjudged ? `<div class="mob-sub">${esc(mobilityUnjudgedWhy(plan))}</div>` : ``) +
    (bu === null
      ? ``
      : `<div class="mob-sub">as-built UNGATED lap ${bu} — the same ratio with the extension mass in ` +
        `place and no detour floor: every connected pair judged, nothing excused, no target applied. ` +
        `This is the worst pair in the room as shipped${
          plan.shell && bu > plan.shell.mobility.max
            ? `, and it is above the mass-free shell reading below (${plan.shell.mobility.max}) — our own mass owns the difference`
            : plan.shell && bu < plan.shell.mobility.max
              ? `, and the mass-free shell reading below (${plan.shell.mobility.max}) is the higher of the two`
              : ``
        }.</div>`) +
    `<div class="mob-sub">mass-free: ${floorGated} bare-terrain gated · ${shell}</div>`;
}

/**
 * O4 (round 19) — the room page's own header said "Layer 1 Hub" and "1 storage ·
 * 1 terminal · 1 hub link · 3 spawns" over a board carrying the whole program.
 * Both are read off the plan below rather than typed: a page that names the
 * structures on the picture beside it has no excuse for naming them from memory.
 */
const ROOM_PROGRAM = [
  ["extension", "extension", "extensions"],
  ["tower", "tower", "towers"],
  ["lab", "lab", "labs"],
  ["link", "link", "links"],
  ["spawn", "spawn", "spawns"],
  ["storage", "storage", "storages"],
  ["terminal", "terminal", "terminals"],
  ["nuker", "nuker", "nukers"],
  ["observer", "observer", "observers"],
  ["extractor", "extractor", "extractors"],
  ["container", "container", "containers"],
  ["rampart", "rampart", "ramparts"],
  ["road", "road", "roads"],
];
function roomInv(plan) {
  const inv = {};
  for (const [type] of ROOM_PROGRAM) {
    const n = (plan.structures?.[type] || []).length;
    if (n) inv[type] = n;
  }
  return inv;
}
function roomProgramLine(plan) {
  const bits = [];
  for (const [type, one, many] of ROOM_PROGRAM) {
    const n = (plan.structures?.[type] || []).length;
    if (n) bits.push(`${n} ${n === 1 ? one : many}`);
  }
  return bits.length ? bits.join(" · ") : "this room composed nothing";
}

function roomPage(plan) {
  const m = plan.meta?.counts || {};
  const full = renderRoomSvg(plan, 20);
  const zoom = renderRoomSvg(plan, 36, hubCrop(plan, 5));
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${plan.room} hub v2</title>
<style>
body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#e8e8e8;margin:18px}
h1{margin:0 0 6px} .sub{color:#9ab;line-height:1.5;max-width:1100px}
.ok{color:#6f6} a{color:#6af}
.row{display:flex;flex-wrap:wrap;gap:20px;margin-top:14px;align-items:flex-start}
.card{background:#121212;padding:14px;border-radius:10px;border:1px solid #2a2a2a}
.card h3{margin:0 0 10px;color:#8cf;font-size:14px}
.card svg{display:block;image-rendering:auto;max-width:100%;height:auto}
table{border-collapse:collapse;margin-top:12px;font-size:13px}
td,th{border:1px solid #333;padding:6px 10px}
.anim-card{width:778px}
.anim-wrap{position:relative;width:750px;height:750px;border-radius:6px;overflow:hidden;background:#000}
.anim-layer{position:absolute;left:0;top:0;width:750px;height:750px;transition:opacity .6s cubic-bezier(.4,0,.2,1)}
.anim-title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  pointer-events:none;opacity:0;text-align:center;padding:0 30px;
  background:radial-gradient(ellipse at center,rgba(0,0,0,.62) 0%,rgba(0,0,0,.28) 45%,rgba(0,0,0,0) 72%)}
.anim-title .tt{font-size:34px;font-weight:800;letter-spacing:3px;color:#eaf6ff;
  text-shadow:0 0 18px rgba(0,190,255,.55),0 2px 6px #000}
.anim-title .te{margin-top:8px;font-size:14px;letter-spacing:.6px;color:#9fd6f2;
  max-width:460px;line-height:1.45;text-shadow:0 1px 5px #000}
.anim-banner{margin-top:10px;background:#101820;border:1px solid #23323d;border-left:3px solid #2b6a86;
  border-radius:0 8px 8px 0;padding:9px 12px;min-height:62px}
.ab-head{display:flex;align-items:baseline;gap:10px}
.ab-badge{background:#12303f;color:#8cf;border:1px solid #2b6a86;border-radius:999px;padding:2px 10px;
  font-size:11px;letter-spacing:1.2px;text-transform:uppercase;white-space:nowrap}
.ab-name{font-size:17px;font-weight:700;color:#eaf6ff;letter-spacing:.3px}
.ab-count{margin-left:auto;font-variant-numeric:tabular-nums;color:#9fd6f2;font-size:12.5px;
  letter-spacing:.4px;white-space:nowrap}
.ab-why{margin-top:4px;color:#b9cdd8;font-size:13px;line-height:1.45}
.ab-note{margin-top:4px;color:#7f96a3;font-size:11.5px;line-height:1.4;font-variant-numeric:tabular-nums}
.anim-bar{height:4px;background:#222;border-radius:2px;margin-top:10px;overflow:hidden}
.anim-bar-fill{height:100%;width:0;background:#8cf;transition:width .08s linear}
.anim-ctl{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;color:#9ab}
.btn{background:#1d1d1d;color:#dfe;border:1px solid #3a3a3a;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:13px}
.btn:hover{background:#282828}
.btn-wide{min-width:96px}
.trail{margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#9ab;cursor:pointer}
.spd-lab{font-size:12px;letter-spacing:.5px;color:#9ab}
.anim-ctl input[type=range]{flex:1 1 auto;accent-color:#8cf;background:transparent;cursor:pointer}
.spd-val{min-width:44px;text-align:right;color:#cde;font-variant-numeric:tabular-nums;font-size:12.5px}
.rate{color:#7f96a3;font-size:11.5px;font-variant-numeric:tabular-nums;white-space:nowrap;min-width:132px;text-align:right}
.stages{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}
.stage{background:#171717;color:#667;border:1px solid #2a2a2a;border-radius:999px;padding:3px 10px;font-size:11px;letter-spacing:.4px;cursor:pointer}
.stage.past{color:#9ab;border-color:#333}
.stage.on{background:#12303f;color:#8cf;border-color:#2b6a86;box-shadow:0 0 0 1px #2b6a8666}
.anim-label{margin-top:8px;font-size:13px;color:#cde;min-height:18px}
/* the plan digest this page was rendered from — the binding the player checks
   the fetched film against before it draws anything (see animPlayerHtml) */
.anim-meta{margin-top:5px;font-size:11px;color:#778;line-height:1.5}
.anim-meta code{color:#9ab;font-size:11px;background:#0c0c0c;border:1px solid #222;border-radius:4px;padding:1px 5px}
/* the end-of-film shortfall ticker (animShortfallTicker). Built out of the
   anim banner's own geometry — same left rule, same radius, same 11.5px note
   type — in the shortfall card's amber rather than the banner's blue, so it
   reads as "this is the declaration channel" at a glance and not as one more
   layer caption. The [hidden] rule is written out rather than left to the UA
   sheet: the ticker being invisible until the last placement lands is the
   whole design, and it must not be one stylesheet-specificity accident away
   from hanging over the entire replay.
   THE NOTE ROWS BORROW THE GEOMETRY AND NOTHING ELSE. Same row, same tag
   column, same clip — and the notes card's #79c0ff throughout, because on this
   page amber has meant "declared shortfall" everywhere else and the one thing
   these rows must never do is read as gates. When a room has notes and no
   shortfalls the whole box turns blue too (.asf-notesonly): the left rule is
   the biggest colour in the component and leaving it amber would put a
   shortfall-coloured bar at the end of a film with no shortfalls in it. */
.anim-sf{margin-top:10px;background:#171310;border:1px solid #3a2a1c;border-left:3px solid #a4642a;
         border-radius:0 6px 6px 0;padding:8px 12px}
.anim-sf[hidden]{display:none}
.anim-sf.asf-notesonly{background:#101820;border-color:#23323d;border-left-color:#2b6a86}
.asf-head{color:#ffb454;font-size:11.5px;letter-spacing:.4px;line-height:1.45;margin-bottom:6px}
.asf-nhead{color:#79c0ff;margin-top:10px}
.anim-sf.asf-notesonly .asf-nhead{margin-top:0}
.asf-row{display:flex;gap:8px;align-items:baseline;padding:3px 0;border-top:1px solid #241b13}
.asf-nrow{border-top-color:#1c2630}
.asf-gate{flex:0 0 auto;color:#ffb454;font-size:10.5px;letter-spacing:.6px;text-transform:uppercase;
          white-space:nowrap;min-width:132px}
.asf-ngate{color:#79c0ff;white-space:normal;max-width:210px}
.asf-txt{color:#dcdcdc;font-size:11.5px;line-height:1.45;font-variant-numeric:tabular-nums}
.sf-card{margin-top:16px;max-width:1100px}
.sf-card h3{color:#ffb454}
.sf-lead{margin:0 0 12px;color:#9ab;font-size:12.5px;line-height:1.5}
.sf-none{margin:0;color:#6f6;font-size:13px}
.sf-item{border-left:3px solid #a4642a;background:#171310;border-radius:0 6px 6px 0;padding:9px 12px;margin-top:10px}
.sf-gate{color:#ffb454;font-size:12px;letter-spacing:.6px;text-transform:uppercase;margin-bottom:5px}
.sf-detail{color:#dcdcdc;font-size:13px;line-height:1.55}
.sf-tiles{margin-top:6px;color:#9ab;font-size:12px;font-variant-numeric:tabular-nums}
/* NOTES ARE NOT SHORTFALLS — the palette says so before the words do. Orange
   left rail and orange headings are the declaration channel; notes get a cool
   blue rail so the eye never reads one as the other from across the page. */
.nt-card{margin-top:16px;max-width:1100px}
.nt-card h3{color:#79c0ff}
.nt-lead{margin:0 0 12px;color:#9ab;font-size:12.5px;line-height:1.5}
.nt-lead b{color:#cfe6ff}
.nt-none{margin:0;color:#7f96a3;font-size:13px}
.nt-item{border-left:3px solid #2b6a86;background:#101820;border-radius:0 6px 6px 0;padding:9px 12px;margin-top:10px}
.nt-topic{color:#79c0ff;font-size:12px;letter-spacing:.6px;text-transform:uppercase;margin-bottom:5px}
.nt-detail{color:#dcdcdc;font-size:13px;line-height:1.55}
.mob-main{font-size:16px;font-weight:700;color:#6f6;font-variant-numeric:tabular-nums}
.mob-main.mob-over{color:#ff6b6b}
/* O5: an unjudged lap is neither pass nor fail — it is the measurement not
   taken, and it gets the colour of neither */
.mob-main.mob-unj{color:#98a2ad}
.mob-none{color:#98a2ad;font-size:11px;border:1px solid #3a4048;border-radius:999px;padding:1px 7px;margin-left:4px;
  letter-spacing:.4px}
.mob-lab{color:#9ab;font-size:12px}
.mob-ok{color:#6f6;font-size:11px;border:1px solid #2f5c33;border-radius:999px;padding:1px 7px;margin-left:4px}
.mob-badge{background:#3a1414;color:#ff8b8b;border:1px solid #7d2626;border-radius:999px;
  padding:1px 8px;font-size:11px;letter-spacing:.5px;margin-left:4px;white-space:nowrap}
.mob-sub{color:#889;font-size:11.5px;margin-top:3px}
</style></head><body>
<h1>${plan.room} · the whole RCL8 program</h1>
<p class="sub">
<b>Grown from the room</b> — anchors (sources/controller) → distance fields → confluence seed → flood core → claim
tiles → min-cut shell → towers → lab diamond → the sixty extensions → the late road and reflow passes. No stamp, no
kit order.<br/>
<b class="ok">${roomProgramLine(plan)}</b>
</p>
${legendHtml(roomInv(plan))}
<div class="row">
  ${animPlayerHtml(plan)}
  <div class="card"><h3>Full room — shell, towers, labs, roads</h3>${full}</div>
  <div class="card"><h3>Hub zoom (±5)</h3>${zoom}</div>
</div>
<table>
<tr><th>piece</th><th>count</th><th>intent</th></tr>
<tr><td>storage</td><td>${m.storage ?? 0}</td><td>hub center</td></tr>
<tr><td>terminal</td><td>${m.terminal ?? 0}</td><td>hub trio — all touch the sitter tile</td></tr>
<tr><td>links</td><td>${m.link ?? 0}</td><td>hub + per-source + controller</td></tr>
<tr><td>containers</td><td>${m.container ?? 0}</td><td>one miner seat per source, plus the controller upgrader bin (the pre-RCL7 energy drop), plus the mineral miner seat when the room has a mineral</td></tr>
<tr><td>spawn</td><td>${m.spawn ?? 0}</td><td>RCL8 = 3, fanned into sectors</td></tr>
<tr><td>road</td><td>${m.road ?? 0}</td><td>one connected network: hub ↔ spawns ↔ sources ↔ controller</td></tr>
<tr><td>rampart</td><td>${m.rampart ?? 0}</td><td>weighted min-cut shell (no openings) + eco bubbles · ${plan.shell ? plan.shell.upkeepPerTick + " e/tick upkeep, " + (plan.shell.shippedDeepInterior ?? "?") + " deep tiles inside the wall of which " + (plan.shell.shippedFreeDeep ?? "?") + " are still free on the shipped board (layer 2 negotiated the enclosure on " + (plan.shell.negotiationFreeDeep ?? plan.shell.deepTiles) + " free deep tiles)" : "—"}</td></tr>
<tr><td>extension</td><td>${m.extension ?? 0}</td><td>60/60 required — every one has a D4 face on the interior</td></tr>
<tr><td>lab</td><td>${m.lab ?? 0}</td><td>4×4 diamond, both inputs in range 2 of all outputs</td></tr>
<tr><td>tower</td><td>${m.tower ?? 0}</td><td>weighted set-cover of the cut, refill-ease weighted in</td></tr>
<tr><td>nuker / observer</td><td>${m.nuker ?? 0} / ${m.observer ?? 0}</td><td>nuker hugs the hub (300k energy to haul) · no factory, no power spawn</td></tr>
<tr><td>extractor</td><td>${m.extractor ?? 0}</td><td>sits ON the mineral (the one structure allowed on an object tile) + a miner container on the mineral ring · no road by design</td></tr>
<tr><td>upgrader parks</td><td>${plan.meta?.ctrlParks ?? 0}</td><td>walkable seats the controller link feeds — 4 is the floor, below that the upgrader fleet throttles</td></tr>
<tr><td>enclosure</td><td>${plan.shell ? (plan.shell.enclosedController ? "ctrl ✓" : "ctrl ✗") + " · src " + plan.shell.enclosedSources + "/" + plan.sources.length : "—"}</td><td>eco pulled inside the wall when it cost ≤4 (controller) / ≤3 (source) extra cut tiles</td></tr>
<tr><td>defender mobility</td><td>${mobilityCell(plan)}</td><td>target <b>${MOBILITY_TARGET}</b> — interior walk ÷ exterior walk between wall tiles, judged only over pairs whose absolute detour exceeds a ${MOBILITY_DETOUR_FLOOR}-tile detour floor. The headline is the AS-BUILT lap (extension mass in the room, the walk the garrison actually gets); the mass-free readings below it are the same measure with the mass removed. &lt;1 means we out-manoeuvre the attacker.</td></tr>
<tr><td>rampart spurs</td><td>${plan.meta?.walls ? plan.meta.walls.spurred + "/" + plan.meta.walls.clusters + " clusters · " + plan.meta.walls.spurTiles + " tiles" : "—"}</td><td>roads TO the ramparts, never ON them${roadOnRampartNote(plan)} · ${plan.meta?.walls ? plan.meta.walls.pruned + " dead-end tiles pruned, " + plan.meta.walls.fillerTiles + " ext-face tiles" : "—"}${plan.meta?.walls?.inertPruned ? " · " + plan.meta.walls.inertPruned + " inert rampart(s) deleted (wall that defended nothing once every layer's ramparts were in)" : ""}</td></tr>
<tr><td>ext corridors</td><td>${plan.meta?.extensions ? plan.meta.extensions.stubRoads + " stub roads" : "—"}</td><td>extensions grow flanking the road network — ${plan.meta?.extensions?.corridorFallback ? plan.meta.extensions.corridorFallback + " placed road-blind (fallback)" : "every one of them D4 on a road"}</td></tr>
</table>
${shortfallsHtml(plan)}
${notesHtml(plan)}
<p>seed (${plan.seed?.x},${plan.seed?.y}) → hub (${plan.hub.x},${plan.hub.y}) · core ${plan.meta?.coreSize} · storage D4 <b>${plan.meta?.storageAccessD4}</b> · pCtrl ${plan.meta?.pathController} · pSrc ${plan.meta?.pathSourcesSum}</p>
<p><a href="index.html">← gallery</a></p>
</body></html>`;
}

/**
 * ARTIFACTS FROM A WORLD THAT IS NOT THERE ANY MORE.
 *
 * out-v2/thumbs and out-v2/anim each held 203 files for a 172-room fleet: 31
 * rooms (E11S0, E11S10, E12S0, E20S1..E20S9, E21S0, E21S10 and the rest) came
 * from an earlier claimable list, and nothing has ever removed a file this
 * suite stopped writing. index.html links only the current fleet, so the
 * orphans are unreachable from the gallery — and they sit in the gallery root,
 * which is precisely how a reviewer ends up opening thumbs/E19S6.svg and
 * reading it as a plan this planner produces. A stale artifact that nobody
 * links is still an artifact anybody can open.
 *
 * ONLY ON A FULL-FLEET RUN, AND THAT GUARD IS THE POINT. `plan.mjs --rooms
 * E11S7` plans one room; letting that run delete every other room's thumbs
 * and films would be a far worse bug than the one being fixed here. Nothing is
 * unlinked unless the caller asked for the whole claimable list.
 *
 * THE KEEP-SET IS WHAT THE RUN WAS ASKED FOR, NOT WHAT IT MANAGED TO WRITE.
 * A room whose plan errored this run is still a room in the world, and a mongo
 * hiccup must not be able to delete its artifacts.
 *
 * AND THE LIST STILL HAS TO LOOK LIKE A FLEET. `fetchAllClaimableRooms` is the
 * world and is authoritative — but a mongo call that comes back half empty is
 * not a world that shrank, and it would take the gallery with it. So a run that
 * would orphan more than half of a directory deletes nothing and says why; the
 * 31 files this exists for are 15% of 203 and clear that bar without noticing
 * it. export-anim.mjs guards its own prune the same way and needs it harder,
 * because its room list comes out of plans-hub.json rather than out of mongo.
 *
 * Only <room>.svg / <room>.json are ever considered — anything else in those
 * directories is not this function's business.
 */
function pruneOrphanArtifacts(rooms) {
  const keep = new Set(rooms);
  const gone = [];
  for (const [dir, ext] of [
    [path.join(OUT_V2, "thumbs"), ".svg"],
    [path.join(OUT_V2, "anim"), ".json"],
  ]) {
    if (!fs.existsSync(dir)) continue;
    const re = new RegExp(`^([EW]\\d+[NS]\\d+)\\${ext}$`);
    const onDisk = fs.readdirSync(dir).filter((f) => re.test(f));
    const orphans = onDisk.filter((f) => !keep.has(re.exec(f)[1]));
    if (orphans.length * 2 > onDisk.length) {
      console.log(
        `stale artifacts: REFUSING TO PRUNE ${path.basename(dir)}/ — this run's ${rooms.length} rooms would ` +
          `orphan ${orphans.length} of its ${onDisk.length} files. That is a short room list, not a shrunken ` +
          `world. Nothing deleted.`,
      );
      continue;
    }
    for (const f of orphans) {
      fs.unlinkSync(path.join(dir, f));
      gone.push(`${path.basename(dir)}/${f}`);
    }
  }
  console.log(
    gone.length
      ? `stale artifacts pruned: ${gone.length} file(s) for rooms outside this ${rooms.length}-room run — ${gone.join(" ")}`
      : `stale artifacts: none pruned — thumbs/ and anim/ hold nothing outside this ${rooms.length}-room run`,
  );

}

/**
 * ------------------------------------------------------------------
 * ...AND "NOT ORPHANED" IS NOT THE SAME AS "NOT STALE".
 * ------------------------------------------------------------------
 * The prune above only asks whether a file belongs to a room in this run. It
 * never asked whether the file DESCRIBES this run — and this suite does not
 * write the animations at all (`export-anim.mjs --all` does), so a normal
 * planner run leaves every anim/<room>.json describing the PREVIOUS plan while
 * the gallery player states, on screen, that "this last frame IS the shipped
 * plan, tile for tile".
 *
 * Round 10 walked into exactly that: after a planner change, an independent
 * final-frame check read 152 of the round-10 fleet's 172 rooms — 20 rooms whose
 * film painted an observer,
 * five roads and a handful of extensions the shipped plan does not have, with
 * no warning anywhere. The films were not wrong about anything; they were
 * answers to a question nobody had re-asked.
 *
 * MTIME WAS TRIED FIRST AND IS USELESS HERE. plans-hub.json is rewritten on
 * every suite run, so every film reads "older" the moment you re-plan — even
 * when two runs are byte-identical, which is the normal case and the one the
 * determinism gate is about. A check that fires on every clean run is a check
 * the reader learns to skip.
 *
 * So it is CONTENT: `planStructureHash` (shared.mjs) over type-and-tile only,
 * sorted, written into each film by export-anim.mjs and re-derived here from the
 * plan just written. A film with no `planHash` is a film from before this
 * existed and is reported as unstamped rather than silently trusted. It stays a
 * loud line rather than a failure because a partial-room run legitimately leaves
 * the other 171 films describing plans that are still perfectly current, and
 * because the suite does not write films — it cannot fix what it is reporting.
 */
function warnStaleAnimations(plans) {
  const animDir = path.join(OUT_V2, "anim");
  if (!fs.existsSync(animDir)) return;
  const stale = [];
  const missing = [];
  const unstamped = [];
  for (const p of plans) {
    const f = path.join(animDir, `${p.room}.json`);
    if (!fs.existsSync(f)) {
      missing.push(p.room);
      continue;
    }
    let film;
    try {
      film = JSON.parse(fs.readFileSync(f, "utf8"));
    } catch {
      stale.push(p.room);
      continue;
    }
    if (!film.planHash) unstamped.push(p.room);
    else if (film.planHash !== planStructureHash(p)) stale.push(p.room);
  }
  const show = (a) => `${a.slice(0, 12).join(" ")}${a.length > 12 ? " …" : ""}`;
  if (stale.length || missing.length || unstamped.length) {
    console.log(
      `ANIMATIONS DO NOT MATCH THIS PLAN — ${stale.length} stale, ${missing.length} missing, ` +
        `${unstamped.length} unstamped, of ${plans.length}. The gallery player states on screen that its ` +
        `last frame IS the shipped plan tile for tile; for those rooms it is not. ` +
        `Run: node tools/plan-suite/v2/export-anim.mjs --all` +
        (stale.length ? `\n  stale: ${show(stale)}` : "") +
        (missing.length ? `\n  missing: ${show(missing)}` : "") +
        (unstamped.length ? `\n  unstamped (written before films carried a plan digest): ${show(unstamped)}` : ""),
    );
  } else {
    console.log(
      `animations: ${plans.length}/${plans.length} carry this plan's structure digest — the last frame of ` +
        `every film is the plan this run just wrote`,
    );
  }
}

// async only for the numeral-rot gate at the bottom, which is imported lazily so
// a --rooms run never pays for it and a broken audit tool cannot stop a build
async function main() {
  // TRUE PROCESS WALL CLOCK. The line at the bottom of this report used to say
  // "total Ns" and that number was sum(meta.planMs) — in-planner time only. It
  // excluded the mongo fetch, the validation pass, the SVG render and 159 file
  // writes of >1MB each, and the goal doc then quoted it as "the full 159-room
  // suite". A reviewer timed the process at 98s against a committed claim of
  // under 90 and was right to; the two numbers were measuring different things
  // and only one of them was labelled. Both are printed now, and labelled.
  const suiteT0 = performance.now();
  const args = process.argv.slice(2);
  let rooms = GOLDEN;
  const ri = args.indexOf("--rooms");
  if (ri >= 0 && args[ri + 1]) rooms = args[ri + 1].split(",").map((s) => s.trim());
  // "did the caller ask for the WHOLE world?" — the only run allowed to delete
  // another room's artifacts. See pruneOrphanArtifacts.
  const fullFleet = args.includes("--all-claimable") || args.includes("--all");
  if (fullFleet) {
    rooms = fetchAllClaimableRooms();
  }

  console.log("Plan v2 — layer 1 HUB grow-from-room · Screeps SVGs");
  console.log("Rooms:", rooms.length);
  const data = fetchRoomsFromMongo(rooms);
  fs.mkdirSync(OUT_V2, { recursive: true });

  const plans = [];
  for (const d of data) {
    const plan = planRoom(d);
    if (plan.error) {
      console.log(d.room, "ERROR", plan.error);
      plans.push({ room: d.room, error: plan.error });
      continue;
    }
    for (const [tag, e] of [
      ["SHELL", plan.shellError],
      ["TOWER", plan.towerError],
      ["LAB", plan.labError],
      ["MISC", plan.miscError],
      ["EXT", plan.extError],
      ["WALLROAD", plan.wallRoadError],
    ]) {
      if (e) console.log(d.room, `${tag} ERROR`, e);
    }

    plans.push(plan);
    const c = plan.meta.counts;
    const sh = plan.shell;
    console.log(
      d.room,
      `hub(${plan.hub.x},${plan.hub.y})`,
      `spawn=${c.spawn}`,
      `roads=${c.road}`,
      sh
        ? `cut=${sh.cut.length} freedeep[negotiated=${sh.negotiationFreeDeep ?? sh.deepTiles} shipped=${sh.shippedFreeDeep ?? "?"}] upkeep=${sh.upkeepPerTick}e/t${sh.budgetPass ? "" : " SPACE-SHORT"}${sh.priceyWall ? " pricey-wall" : ""}`
        : "no-shell",
      sh ? `encl[ctrl=${sh.enclosedController ? "Y" : "n"} src=${sh.enclosedSources}/${plan.sources.length}]` : "",
      // the as-built GATED lap is the verdict; the shell's mass-free max is the raw record
      builtGated(plan) !== null
        ? `mob[built-gated=${builtGated(plan)}${mobilityOver(plan) ? " OVER-TARGET" : ""}` +
          ` floor-gated=${plan.meta.walls.mobility.floorGated}` +
          (sh ? ` shell-ungated=${sh.mobility.max}` : "") +
          `]`
        : sh
          ? `mob[shell-ungated=${sh.mobility.max} mean=${sh.mobility.mean}]`
          : "",
      plan.meta.towers
        ? `twr[min=${plan.meta.towers.minShellDmg} avg=${plan.meta.towers.avgShellDmg} rf<=${plan.meta.towers.maxRefill}]`
        : "",
      plan.meta.extensions
        ? `ext=${plan.meta.extensions.placed}/${plan.meta.extensions.target}${plan.meta.extensions.placed < EXT_TARGET ? " SHORT" : ""}`
        : "",
    );
  }

  const ok = plans.filter((p) => !p.error);

  // ------------------------------------------------------------------
  // THE FLEET MEDIANS ARE MEASURED HERE, AND THE ECO GATES MOVE WITH THEM.
  //
  // pipeline.mjs's eco block promised "the medians below are measured, not
  // assumed; the suite re-prints them every run, and if they drift the gates
  // drift with them", and then hard-coded two literals that no line of this
  // suite ever computed or printed. One of them had drifted: the median of
  // pathSourcesSum measured over the shipped fleet was a tile below the literal
  // every eco declaration quoted, which set the gate two tiles too high and left
  // rooms silently above the rule as written. Both medians are measured here
  // now and printed by the eco line at the end of the run.
  //
  // This is why the room pages are written BELOW rather than inside the
  // planning loop: a room's eco declaration quotes the fleet, so no room page
  // may be rendered until the whole fleet has been planned. (The count of eco
  // declarations that quoted the drifted median is not typed here: it is
  // whatever `redeclareEcoTax` rewrites this run, and the eco medians line
  // below prints the measurement itself.) The declaration is
  // then re-derived per plan (redeclareEcoTax strips only the `gate:"eco"`
  // entry) and printed, so a reviewer can argue with the multiple instead of
  // reverse-engineering a cliff.
  // ------------------------------------------------------------------
  const fm = setFleetMedians(ok);
  if (fm) {
    for (const p of ok) redeclareEcoTax(p);
  }

  for (const p of ok) fs.writeFileSync(path.join(OUT_V2, `${p.room}.html`), roomPage(p));
  // ------------------------------------------------------------------
  // THE FRONT PAGE DESCRIBES THE ARTIFACT IT LINKS TO (O4, round 19).
  //
  // The index shipped `<h1>Plan v2 · Layer 1 — Hub</h1>` and, under it, "Only
  // hub layer: storage + terminal + 1 link + 3 spawns + need-based roads",
  // with a legend whose only structure rows were the hub trio and a "Hub link
  // (×1)". That was true of the planner several rounds ago. The artifact
  // behind those cards ships the whole RCL8 program — four links a room, sixty
  // extensions, six towers, the lab diamond, nuker, observer, extractor, the
  // min-cut shell and both road passes — so the first sentence a reader met
  // named one structure class in ten and undercounted the one it did name by
  // four. A gallery whose front page describes a different plan than the one
  // on its cards is the drift this suite fails rooms for.
  //
  // So the header, the sentence and the legend are all rendered from `ok` —
  // the fleet just planned. `span` prints one number when the fleet is uniform
  // in a class and a range when it is not, because "60 extensions" and
  // "1-4 containers" are both facts about the same census and neither may be
  // rounded into the other.
  // ------------------------------------------------------------------
  const fleetSpan = (type) => {
    const v = ok.map((p) => (p.structures?.[type] || []).length).filter((n) => n > 0);
    if (!v.length) return null;
    const mn = Math.min(...v);
    const mx = Math.max(...v);
    return { mn, mx, all: v.length === ok.length, txt: mn === mx ? `${mn}` : `${mn}-${mx}` };
  };
  const PROGRAM = [
    ["extension", "extensions"],
    ["tower", "towers"],
    ["lab", "labs"],
    ["link", "links"],
    ["spawn", "spawns"],
    ["storage", "storage"],
    ["terminal", "terminal"],
    ["nuker", "nuker"],
    ["observer", "observer"],
    ["extractor", "extractor"],
    ["container", "containers"],
    ["rampart", "ramparts"],
    ["road", "roads"],
  ];
  const fleetInv = {};
  const programBits = [];
  for (const [type, label] of PROGRAM) {
    const s = fleetSpan(type);
    if (!s) continue;
    fleetInv[type] = s.txt;
    programBits.push(`${s.txt} ${label}` + (s.all ? "" : ` (in ${ok.map((p) => (p.structures?.[type] || []).length).filter((n) => n > 0).length} of them)`));
  }
  const takenRooms = ok.filter((p) => p.meta?.sealedRecovery?.outcome === "taken").length;
  let index = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Pacifist Plan v2 — ${ok.length} rooms, full RCL8 program</title>
<style>
body{font-family:system-ui,sans-serif;background:#080808;color:#eee;margin:20px}
h1{margin-bottom:4px} .sub{color:#889;max-width:1100px;line-height:1.55}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:18px;margin-top:18px}
.card{background:#101010;border:1px solid #222;border-radius:10px;padding:12px}
.card h3{margin:0 0 8px;font-size:14px}
.card img.thumb{display:block;width:100%;height:auto;image-rendering:auto;background:#0a0a0a;border-radius:6px}
a{color:#6af} .tag{color:#6f6;font-size:12px;margin-left:8px}
.mob{font-size:11px;margin-left:8px;border-radius:999px;padding:2px 8px;white-space:nowrap;
  background:#12220f;color:#8fd48f;border:1px solid #2f5c33}
.mob.over{background:#3a1414;color:#ff8b8b;border-color:#7d2626}
/* O5 (round 19): the gate judged nothing in this room. Neither the pass colour
   nor the fail colour — a chip that says so, in the colour of neither, because
   an unmeasured room painted green is a green chip that means nothing was
   measured. */
.mob.unjudged{background:#15181b;color:#98a2ad;border-color:#3a4048}
.mob i{font-style:normal;opacity:.72;font-weight:400}
.mob b{font-variant-numeric:tabular-nums}
/* the shell's ungated record is a DIFFERENT measure, so it is a different chip
   in a different colour — see the badge comment below */
.mobs{font-size:11px;margin-left:6px;border-radius:999px;padding:2px 8px;white-space:nowrap;
  background:#141a22;color:#8fb4d4;border:1px solid #2b4a5c}
/* the as-built UNGATED lap: a third measure, so a third chip (OL7). Neither a
   verdict colour nor the shell's — it has no gate and no target. */
.mobu{font-size:11px;margin-left:6px;border-radius:999px;padding:2px 8px;white-space:nowrap;
  background:#1c1a26;color:#b9a8e0;border:1px solid #4a3f6b}
.sfc{font-size:11px;margin-left:6px;color:#ffb454}
.ntc{font-size:11px;margin-left:6px;color:#79c0ff}
/* OL8: the note CLASSES, not just how many. See the block at ncls. */
.ntk{font-size:11px;margin-left:6px;color:#5d8fbf;font-style:italic}
.watch{margin-left:8px;font-size:11px;color:#8cf;text-decoration:none;background:#12303f;border:1px solid #2b6a86;border-radius:999px;padding:2px 8px}
.watch:hover{background:#17415a;color:#bfe6ff}
</style></head><body>
<h1>Plan v2 · the whole RCL8 program · ${ok.length} rooms</h1>
<p class="sub">
<b>Grown from the room, layer by layer</b>: eco anchors flood distance fields → confluence seed → grown core → hub
claim → weighted min-cut shell → towers → the lab diamond → the sixty extensions and their corridor → the late road,
rampart and reflow passes.<br/>
<b>Per room, off these boards</b>: ${programBits.join(" · ")}.<br/>
Every room page carries its own film of the plan being built layer by layer, every gate this room knowingly missed
(declared, in full) and every planner note; ${ok.filter((p) => (p.meta.shortfalls || []).length).length} of the
${ok.length} rooms declare at least one shortfall and ${ok.filter((p) => (p.meta.notes || []).length).length} carry at
least one note. ${takenRooms} room${takenRooms === 1 ? "" : "s"} had ${takenRooms === 1 ? "its" : "their"} plan
REPLACED by the sealed-floor recovery pass — a seat withdrawn and the room re-composed from layer 1 to hand back deep
floor — and say so on their own page.<br/>
Cards below are lazy-loaded flat-colour thumbnails (key underneath); the real Screeps sprites, the animation and the
declared shortfalls and notes are on each room's own page — click the thumbnail or the room name.
</p>
${legendHtml(fleetInv)}
${thumbLegendHtml()}
<div class="grid">`;
  // THUMBNAILS ON DISK, LAZY-LOADED. The index used to inline
  // renderRoomSvg(p, 10) — a ~1MB sprite-heavy SVG — once per room, and came
  // to 159,056,753 bytes: 13.8s of transfer and 17.2s to domComplete on
  // localhost, with 24 of the cards still missing at the 10-second mark — all
  // of that measured on the 159-room world the experiment was run in, and kept
  // as the record of a rejected approach rather than as a live figure.
  // renderThumbSvg writes a ~30KB resource-free SVG per room (the WHY, and the
  // three approaches rejected on the way there, are in render.mjs); the index
  // references it with loading=lazy, so the browser fetches only the cards the
  // reader has scrolled to. Every room still has a card and every card still
  // links to its full-sprite room page.
  const thumbDir = path.join(OUT_V2, "thumbs");
  fs.mkdirSync(thumbDir, { recursive: true });
  for (const p of ok) {
    fs.writeFileSync(path.join(thumbDir, `${p.room}.svg`), renderThumbSvg(p, 8));
    // O4: the card's `deep` was layer 2's negotiation free-deep count printed
    // beside the SHIPPED cut — two boards, one label. The card reads the
    // shipped figure now and says which board it is from.
    const sh = p.shell ? `cut ${p.shell.cut.length} · free deep (shipped) ${p.shell.shippedFreeDeep ?? "?"}` : "no shell";
    const lb = p.structures.lab?.length ? `${p.structures.lab.length} labs` : "NO LABS";
    // ------------------------------------------------------------------
    // TWO NUMBERS, TWO CHIPS, EACH SAYING WHICH ONE IT IS.
    //
    // The badge read a bare "mob 0" for E12S7 while that room's own page
    // printed the shell's ungated record beside it. Both are true and they are
    // not the same quantity: 0 is the AS-BUILT GATED lap (extension mass in the
    // room, and only pairs whose absolute detour clears the 4-tile floor are
    // judged — E12S7's candidate pair is below the floor, so nothing is judged
    // and the lap is 0), while the other is measured on the bare cut with no
    // mass and no floor. Printed as one word they looked like one number
    // disagreeing with itself. (Round 19: the two values this comment quoted
    // for E12S7 were both stale — the room's own chips print them.) No two published numbers about the same room
    // may look like the same quantity while disagreeing — so both are here,
    // both are named, and the verdict chip is the one the target applies to.
    // ------------------------------------------------------------------
    const bg = builtGated(p);
    const mob =
      bg === null
        ? ""
        : mobilityUnjudged(p)
          ? `<span class="mob unjudged" title="${esc(mobilityUnjudgedWhy(p))} — so this room has no as-built gated lap. A zero here is the measurement not taken, not a room that passed.">as-built gated lap <b>UNJUDGED</b> <i>${esc(mobilityUnjudgedShort(p))}</i></span>`
          : `<span class="mob${mobilityOver(p) ? " over" : ""}" title="as-built gated defender lap — interior walk ÷ exterior walk with the extension mass in place, judged only over pairs whose absolute detour exceeds ${MOBILITY_DETOUR_FLOOR} tiles (target ${MOBILITY_TARGET}). This is the reading the gate is applied to.">as-built gated lap <b>${bg}</b>${mobilityOver(p) ? ` <i>over ${MOBILITY_TARGET}</i>` : ` <i>within ${MOBILITY_TARGET}</i>`}</span>`;
    const shellMob = p.shell
      ? `<span class="mobs" title="the shell's own ungated record: same ratio measured on the bare cut, no extension mass and no detour floor. Not gated, not compared to the target — it is the raw worst pair.">shell ungated <b>${p.shell.mobility.max}</b></span>`
      : "";
    // ...AND THE THIRD READING, WHERE IT IS A THIRD NUMBER (OL7, round 23).
    // `meta.walls.mobility.built` is the ungated lap with the extension mass in
    // place — the worst pair in the room as SHIPPED. In 117 rooms the gated chip
    // reads UNJUDGED, so the only figure the card painted was the shell's
    // mass-free one, and in ten of those the as-built reading is HIGHER than it
    // (E9S2 1 -> 1.43). The chip is printed when it is a number the card is not
    // already showing; where it equals one of the other two, a third chip
    // repeating it would be noise rather than disclosure. Derived per room, so
    // no roster of "the ten" can rot.
    const bu = typeof p.meta?.walls?.mobility?.built === "number" ? p.meta.walls.mobility.built : null;
    const shown = new Set([p.shell ? p.shell.mobility.max : null, mobilityUnjudged(p) ? null : bg]);
    const builtMob =
      bu === null || shown.has(bu)
        ? ""
        : `<span class="mobu" title="as-built UNGATED lap — the same ratio as the shell record but with the extension mass in place, every connected pair judged and no detour floor. Not gated and not compared to the target: it is the worst pair in the room this plan ships.">as-built ungated <b>${bu}</b></span>`;
    const nsf = (p.meta.shortfalls || []).length;
    const sfc = nsf ? `<span class="sfc" title="declared shortfalls — gates this plan knowingly failed">${nsf} shortfall${nsf > 1 ? "s" : ""}</span>` : "";
    // A NOTE IS DISCOVERABLE FROM THE INDEX OR IT MIGHT AS WELL NOT EXIST.
    // Most rooms carry one and nothing on this page said so, so a reviewer
    // scanning the index had no way to find the room that had something to
    // say. Deliberately a different colour and a different word from the
    // shortfall count: they are different channels (see notesHtml).
    //
    // The count that used to be written here ("118 rooms carry one") was wrong
    // by one for two rounds and is gone rather than corrected: a fleet-wide
    // figure hard-typed into a per-room renderer is a number with no owner and
    // no re-derivation, and this badge already prints the true count from the
    // room's own record every run. See criticism 69.
    const nnt = (p.meta.notes || []).length;
    // ------------------------------------------------------------------
    // ...AND WHICH NOTES (OL8, round 23). The count alone made every class
    // invisible: the three rooms whose TOWER MOVED after layer 3 and the two
    // whose declared cut is not a sealing curve on its own — the two note
    // classes round 22 added, and the only two that describe something the
    // planner DID rather than something it measured — appeared on this page as
    // "1 note", indistinguishable from a room reporting that it ships no shallow
    // extensions. A reviewer scanning 172 cards for the rooms with something to
    // say had nothing to scan for.
    //
    // The classes are listed from the room's own `noteRecords`, so this is not a
    // roster of "the round-22 ones" that goes stale the next time a class is
    // added — every class the fleet has gets a badge the run it appears in.
    // ------------------------------------------------------------------
    const ncls = [...new Set((p.meta.noteRecords || []).map((r) => r && r.cls).filter(Boolean))].sort();
    const ntc = nnt
      ? `<span class="ntc" title="planner notes — observations, not declarations; they excuse nothing">${nnt} note${nnt > 1 ? "s" : ""}</span>` +
        (ncls.length
          ? `<span class="ntk" title="the note classes this room files, from its own meta.noteRecords — each one is written out in full on the room page">${ncls.map(esc).join(" · ")}</span>`
          : ``)
      : "";
    index += `<div class="card"><h3><a href="${p.room}.html">${p.room}</a>
<a class="watch" href="${p.room}.html#anim" title="watch the planner build ${p.room} step by step">&#9654; watch</a>
<span class="tag">${sh} · ${p.meta.counts.tower ?? 0} towers · ${lb}</span>${mob}${shellMob}${builtMob}${sfc}${ntc}</h3>
<a href="${p.room}.html"><img class="thumb" loading="lazy" decoding="async" width="400" height="400" src="thumbs/${p.room}.svg" alt="${p.room} plan thumbnail"/></a></div>`;
  }
  index += `</div></body></html>`;
  fs.writeFileSync(path.join(OUT_V2, "index.html"), index);
  if (fullFleet) pruneOrphanArtifacts(rooms);

  // THE SERIALISED PLAN CARRIES NO STOPWATCH. `meta.planMs` is wall-clock: it is
  // different on every run, it was the only thing in the artifact that was, and
  // while it was in here "the planner is deterministic" was an unfalsifiable
  // claim — plans-hub.json never hashed the same twice, so nobody could tell a
  // real non-determinism from the clock. It is dropped from the written plan and
  // kept in memory for the wall-time report below, which is console output that
  // nothing hashes. `meta.shellEscalation.steps` is the deterministic record of
  // what the room actually paid for.
  const slim = ok.map((p) => {
    const { planMs, ...meta } = p.meta;
    return {
      room: p.room,
      hub: p.hub,
      sitter: p.sitter, // push-plan.mjs ships this to the live segment
      labInputs: p.labInputs,
      structures: p.structures,
      meta,
      sources: p.sources,
      controller: p.controller,
      mineral: p.mineral,
    };
  });
  fs.writeFileSync(path.join(OUT_V2, "plans-hub.json"), JSON.stringify(slim, null, 2));
  // ...and now, with the plan on disk, is the only honest moment to ask whether
  // the films still describe it. See warnStaleAnimations.
  warnStaleAnimations(slim);

  console.log("Wrote", path.join(OUT_V2, "index.html"));
  console.log("OK", ok.length, "/", plans.length);

  // --- suite-level summary (the numbers the owner actually reads) ---
  const withShell = ok.filter((p) => p.shell);
  const short = ok.filter((p) => (p.structures.extension || []).length < EXT_TARGET);
  const cuts = withShell.map((p) => p.shell.cut.length).sort((a, b) => a - b);
  const med = (a) => (a.length ? a[a.length >> 1] : 0);
  const mobMax = withShell.map((p) => p.shell.mobility.max).filter((v) => v > 0);
  const mobMean = withShell.map((p) => p.shell.mobility.mean).filter((v) => v > 0);
  const avg = (a) => (a.length ? Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 100) / 100 : 0);
  console.log(
    `extensions 60/60: ${ok.length - short.length}/${ok.length}` +
      (short.length ? ` — SHORT: ${short.map((p) => `${p.room}:${p.structures.extension.length}`).join(" ")}` : ""),
  );
  console.log(`cut size: median ${med(cuts)} · min ${cuts[0]} · max ${cuts[cuts.length - 1]}`);
  // roads are a running cost (decay + build CPU + creep-tick opportunity), so
  // the distribution is a first-class number, not a footnote
  const roads = ok.map((p) => p.structures.road.length).sort((a, b) => a - b);
  const qr = (f) => roads[Math.min(roads.length - 1, Math.floor(roads.length * f))];
  console.log(
    `roads: median ${med(roads)} · mean ${(roads.reduce((s, v) => s + v, 0) / roads.length).toFixed(1)} · ` +
      `min ${roads[0]} · p75 ${qr(0.75)} · p90 ${qr(0.9)} · max ${roads[roads.length - 1]}`,
  );
  const stubs = ok.map((p) => p.meta.extensions?.stubRoads ?? 0).sort((a, b) => a - b);
  const fallback = ok.filter((p) => (p.meta.extensions?.corridorFallback ?? 0) > 0);
  console.log(
    `ext corridors: stub roads median ${med(stubs)} · max ${stubs[stubs.length - 1]}` +
      (fallback.length
        ? ` — road-blind fallback in ${fallback.length} rooms (${fallback
            .map((p) => `${p.room}:${p.meta.extensions.corridorFallback}`)
            .join(" ")})`
        : " · no road-blind fallback anywhere"),
  );
  // ------------------------------------------------------------------
  // THE TWO RELOCATION PASSES, COUNTED (O3, round 19).
  //
  // Layer 6's end-of-pass rescue and layer 7b's post-prune reflow both move
  // shallow extension slots onto deep floor, both are drawn in the film, and
  // neither had a fleet line. So the totals lived in comments — in
  // [r22-waived: this paragraph QUOTES the stale comments this fleet line
  // replaced — the numerals are the evidence that they were wrong, and
  // correcting them would delete the finding.]
  // export-anim.mjs ("78 moves across 25 rooms", "48 in 16 against layer 6's 80
  // in 25") and in animNotes ("98 of the 99 layer-6 relocations took a stub") —
  // every one of them typed, and every one of them wrong by round 19. They are
  // counted here instead, off the same two records the film reads.
  // ------------------------------------------------------------------
  {
    const l6 = ok.map((p) => (p.meta.extensions?.relocated || []).filter((r) => r && r.from && r.to));
    const l7 = ok.map((p) => (p.meta.extensions?.reflow?.moved || []).filter((r) => r && r.from && r.to));
    const n6 = l6.reduce((s, a) => s + a.length, 0);
    const n7 = l7.reduce((s, a) => s + a.length, 0);
    const stubs = l6.reduce((s, a) => s + a.filter((r) => r.tookStub).length, 0);
    const paved = l7.reduce((s, a) => s + a.filter((r) => r.paved).length, 0);
    const second = l7.reduce((s, a) => s + a.filter((r) => r.reason === "second-target").length, 0);
    console.log(
      `ext relocations onto deep floor: layer 6 moved ${n6} slot(s) in ${l6.filter((a) => a.length).length} room(s) ` +
        `(${stubs} onto a tile its own corridor stub had held) · layer 7b's post-prune reflow moved ${n7} in ` +
        `${l7.filter((a) => a.length).length} room(s) (${paved} bought a road face with one plain pave, ` +
        `${second} are second targets for a slot the lap ceiling had refused) · ` +
        `${ok.reduce((s, p) => s + (p.meta.extensions?.shallow ?? 0), 0)} slot(s) still ship shallow`,
    );
  }
  const wm = ok.filter((p) => p.meta.walls);
  console.log(
    `rampart spurs: ${wm.reduce((s, p) => s + p.meta.walls.spurred, 0)} spurs / ` +
      `${wm.reduce((s, p) => s + p.meta.walls.clusters, 0)} clusters · ` +
      // LAID AND SHIPPED, BOTH. This line quoted the laid counter alone, and the
      // dead-end prune deletes spur tiles after the spur pass has counted them,
      // so the two differ and the gap rooms are named — by the closure below,
      // from the artifact, every run. One number for two quantities is how an
      // inflated count goes unnoticed for thirteen rounds — see the
      // laid-vs-shipped block in layer-walls.mjs, which is where both figures
      // come from. (Round 19: the pair of totals and the three-room roster this
      // comment used to quote had both drifted. They are printed on the next
      // line; a comment does not get to hold a second copy of them.)
      `${wm.reduce((s, p) => s + p.meta.walls.spurTiles, 0)} tiles laid / ` +
      `${wm.reduce((s, p) => s + (p.meta.walls.spurTilesShipped || 0), 0)} shipped` +
      (() => {
        const gaps = wm.filter((p) => (p.meta.walls.spurTiles || 0) !== (p.meta.walls.spurTilesShipped || 0));
        return gaps.length
          ? ` (the prune took ${gaps.reduce((s, p) => s + p.meta.walls.spurTiles - (p.meta.walls.spurTilesShipped || 0), 0)} back in ${gaps.length} room(s): ` +
            gaps.map((p) => `${p.room}:${p.meta.walls.spurTiles}/${p.meta.walls.spurTilesShipped || 0}`).join(" ") + `)`
          : ` (the prune took none of them back)`;
      })() +
      // ...AND THE PRUNE COUNTER GETS THE SAME DISCIPLINE (OF7, round 16). This
      // line used to print the sum of `meta.walls.pruned`, which was the prune
      // pass's EVENT count taken before layer 7b's reflow and the conduct bridge
      // had finished paving — one label over four different quantities: prune
      // events, tiles that ship no road, tiles the film's roadsPrune stage
      // erases, and tiles laid and deleted inside layer 7 and never tagged. All
      // four are published per room and all four are printed here, ten tokens
      // after the comment above that says why. (Round 19: the four values this
      // comment quoted were the round-16 fleet's. Deleted rather than
      // corrected — they are on the next line, from the artifact.)
      (() => {
        const ev = wm.reduce((s, p) => s + (p.meta.walls.prunedAtPass || 0), 0);
        const ti = wm.reduce((s, p) => s + p.meta.walls.pruned, 0);
        const gh = wm.reduce((s, p) => s + (p.meta.walls.prunedGhosts || 0), 0);
        const tr = wm.reduce((s, p) => s + (p.meta.walls.prunedTransient || 0), 0);
        const relaid = wm.filter((p) => (p.meta.walls.prunedRelaid || []).length);
        return (
          ` · pruned ${ti} dead-end road TILES (${gh} the film erases + ${tr} laid and deleted inside ` +
          `layer 7, never tagged) from ${ev} prune events` +
          (relaid.length
            ? `; ${ev - ti} deleted tile(s) were re-laid and ship as roads: ` +
              relaid
                .map((p) => `${p.room}:${(p.meta.walls.prunedRelaid || []).map((t) => `${t.x},${t.y}`).join("/")}`)
                .join(" ")
            : `; no deleted tile was re-laid`) +
          ` · `
        );
      })() +
      `ext-face net ${wm.reduce((s, p) => s + p.meta.walls.fillerTiles, 0)} tiles`,
  );
  // ROAD + RAMPART, FLEET-WIDE, IN FIVE CLASSES. The published taxonomy had two
  // classes and a catch-all `else` that folded 17 tiles into "wall crossing";
  // the accounting closed because the residue was hidden, not because it was
  // zero. See classifyRoadRamparts in layer-walls. `unclassified` is printed
  // whether or not it is 0 — a residue bucket you only hear about when it is
  // empty is not a check.
  {
    const rrs = wm.map((p) => p.meta.walls.roadRampart).filter(Boolean);
    if (rrs.length) {
      const sum = (f) => rrs.reduce((s, r) => s + r[f], 0);
      const per = rrs.map((r) => r.total).sort((a, b) => a - b);
      const med = per.length ? per[Math.floor(per.length / 2)] : 0;
      console.log(
        `road+rampart: ${sum("total")} tile(s) — ${sum("crossing")} wall crossings on the cut · ` +
          // "bubble seat" until round 26, when the word was measured: bubble
          // membership is not the same fact as standing outside the shell, and
          // the film captioned roughly half its seat-class ramparts on the wrong
          // one of the two. This class is CONTAINER-ON-A-RAMPART; whether the
          // container is outside is the film's `seat.outside`/`seat.inside`
          // split, derived from the frozen flood. See OB1, round 26.
          `${sum("seat")} container seats · ${sum("ring")} controller stand-denial ring · ` +
          `${sum("cover")} personal cover · ${sum("unclassified")} UNCLASSIFIED · ` +
          `median ${med} max ${per.length ? per[per.length - 1] : 0} per room` +
          (sum("crossing") + sum("seat") + sum("ring") + sum("cover") + sum("unclassified") === sum("total")
            ? " — the accounting closes"
            : " — THE ACCOUNTING DOES NOT CLOSE"),
      );
    }
  }
  // sources: STRICT is the headline (works inside AND the whole walkable ring
  // inside — the same bar the controller is held to); the looser works-only
  // reading is printed beside it rather than replaced. See layer-shell.
  console.log(
    `enclosed: controller ${withShell.filter((p) => p.shell.enclosedController).length}/${withShell.length} · ` +
      `sources ${withShell.reduce((s, p) => s + p.shell.enclosedSources, 0)}/${withShell.reduce((s, p) => s + p.sources.length, 0)} strict` +
      ` (works-only ${withShell.reduce((s, p) => s + (p.shell.enclosedSourceWorks ?? 0), 0)})`,
  );
  // ------------------------------------------------------------------
  // THE FLEET LINE HAS TO QUOTE THE READING THE GATE APPLIES TO.
  //
  // This printed a "mobility ratio" headline off `p.shell.mobility.max` —
  // layer 2's MASS-FREE negotiation reading, taken on the bare cut before a
  // single extension exists. The comment over the per-room caption in animNotes
  // (search "WHICH READING, AND WHY NOT THE OTHER ONE") forbids exactly this
  // substitution by name: the two readings disagree, and the gate applies to
  // one of them. The caption obeyed the rule and the fleet summary broke it one
  // screen later, so the suite's own headline quoted a lap the gate does not
  // apply to. Both readings are printed below, on their own lines, each named.
  // (Round 16 corrected the figures in this comment; round 19 deleted them —
  // they had gone stale again, which is what a hand-typed copy of a published
  // measurement does. Criticism 80.)
  //
  // Same precedence animNotes uses: meta.walls.mobility.builtGated, falling
  // back to meta.shell.mobilityBuilt.maxGated. (Every room in the current fleet
  // carries the first, so the fallback is insurance against an older plan, not
  // a live path. The room count was typed here; it is a fleet measurement and
  // the fallback branch is the thing that would notice, not a comment.
  // Criticism 80.)
  //
  // A ZERO IS NOT A GOOD ROOM, IT IS AN UNJUDGED ONE — most of the fleet has no
  // pair of wall tiles the gate will judge (either no pair's absolute detour
  // clears the 4-tile floor, or the ones that do are covered), so the gate
  // judged nothing and the lap is 0. The count is printed at the end of the
  // line below, from the artifact, and is not typed here. Averaging those in would
  // divide a real number by a fleet that mostly did not take the measurement,
  // so the mean is over the rooms that were judged and the count of the rest
  // is printed beside it. Layer 2's number is kept on its own line, labelled
  // as the pre-mass negotiation reading, because it is what the wall was
  // BOUGHT on — it is just not what the wall is JUDGED on.
  // ------------------------------------------------------------------
  const builtLap = (p) => {
    const w = p.meta?.walls?.mobility?.builtGated;
    if (typeof w === "number") return w;
    const s = p.meta?.shell?.mobilityBuilt?.maxGated;
    return typeof s === "number" ? s : null;
  };
  const laps = ok.map(builtLap).filter((v) => v !== null);
  const judgedRooms = ok
    .filter((p) => (builtLap(p) ?? 0) > 0)
    // worst first, ties broken by room name so the pick is deterministic
    .sort((a, b) => builtLap(b) - builtLap(a) || (a.room < b.room ? -1 : 1));
  const judged = judgedRooms.map(builtLap);
  const overTgt = judged.filter((v) => v > MOBILITY_TARGET).length;
  console.log(
    `defender mobility AS BUILT (gated lap — extension mass in place, only pairs whose detour clears the ` +
      `${MOBILITY_DETOUR_FLOOR}-tile floor judged; this is the reading the ${MOBILITY_TARGET} target applies to): ` +
      (judged.length
        ? `worst ${judged[0]} (${judgedRooms[0].room}) · mean ${avg(judged)} over the ${judged.length} room(s) ` +
          `any pair was judged in · ${overTgt} of them over target`
        : "no room in this run had a single pair to judge") +
      ` · ${laps.length - judged.length} room(s) judged nothing (lap 0)`,
  );
  console.log(
    `  layer 2's pre-mass negotiation reading, for contrast only — bare cut, no extension mass, ungated: ` +
      `mean-of-means ${avg(mobMean)} · worst room max ${Math.max(0, ...mobMax)}`,
  );
  // ------------------------------------------------------------------
  // THE LIFT TEST, FLEET-WIDE — PRINTED BECAUSE IT WAS BEING TYPED (O3, round 19)
  //
  // declprose-mobility's lift paragraph publishes, per room, how much of the
  // room's own gated lap comes off when every structure this planner CHOSE the
  // position of is lifted out (`lift.ownPct`, recomputed in the paragraph from
  // the two laps it is made of). Nothing aggregated it, so the only fleet-level
  // statement about the share lived in a comment above that paragraph — a
  // six-room roster and an "18% to 35%" band, three pairs of which had gone
  // stale, one of whose rooms had no lift record at all, and whose band was
  // false at both ends. The measurement is one pass over the artifact; it is
  // cheaper to print it than to keep re-typing it.
  // ------------------------------------------------------------------
  {
    const lifts = [];
    for (const p of ok) {
      for (const s of p.meta?.shortfalls || []) {
        if (s && s.gate === "mobility" && s.lift && typeof s.lift.ownPct === "number") {
          lifts.push({ room: p.room, pct: s.lift.ownPct, from: s.metric?.maxGated, to: s.lift.liftedLap, clears: !!s.lift.clears });
        }
      }
    }
    if (lifts.length) {
      const miss = lifts.filter((l) => !l.clears).sort((a, b) => b.pct - a.pct || (a.room < b.room ? -1 : 1));
      const clears = lifts.filter((l) => l.clears);
      console.log(
        `  the LIFT TEST (every structure whose tile this planner chose lifted out, same metric re-run): ` +
          `${lifts.length} room(s) publish one · ${clears.length} CLEAR the ${MOBILITY_TARGET} target once ` +
          `our own mass is out (the miss is ours, not the terrain's)` +
          (clears.length ? ` — ${clears.map((l) => l.room).join(" ")}` : "") +
          (miss.length
            ? ` · the other ${miss.length} still miss, and our own mass owns ${miss[miss.length - 1].pct}% to ` +
              `${miss[0].pct}% of their laps (worst-owned ${miss[0].room} ${miss[0].from} -> ${miss[0].to})`
            : ""),
      );
    }
  }
  // ------------------------------------------------------------------
  // ...AND THE COMPLETE RECORD, WHICH IS NOT THE VERDICT.
  //
  // `coversStands` excuses a pair of wall tiles from the GATE when a defender on
  // either one already covers everything an attacker can stand on to grind the
  // other. Until round 10 it excused the pair from the RECORD as well — the
  // statistic was never accumulated — and E7S5 shipped `max 1.5 · maxDetour 1 ·
  // cause "none"` and no shortfall at all over the worst pair in the fleet
  // (35 in / 2 out, a 33-tile detour at 17.5). The record now carries every pair
  // and the fleet headline carries both numbers, because the difference between
  // them is exactly the thing that was hidden.
  // ------------------------------------------------------------------
  {
    const rec = ok
      .map((p) => ({ room: p.room, m: p.meta?.walls?.mobility }))
      .filter((r) => r.m && typeof r.m.built === "number");
    const byMax = rec.slice().sort((a, b) => b.m.built - a.m.built || (a.room < b.room ? -1 : 1));
    const byDet = rec.slice().sort((a, b) => b.m.maxDetour - a.m.maxDetour || (a.room < b.room ? -1 : 1));
    const declared = ok.filter((p) =>
      (p.meta?.shortfalls || []).some((d) => d && d.gate === "mobility" && d.kind === "covered-detour"),
    );
    console.log(
      `  the COMPLETE record (every connected pair, including the ones coverage excuses from the gate): ` +
        `worst ratio ${byMax.length ? `${byMax[0].m.built} (${byMax[0].room})` : "—"} · worst absolute ` +
        `detour ${byDet.length ? `${byDet[0].m.maxDetour} tiles (${byDet[0].room})` : "—"} · ` +
        `${declared.length} room(s) declare mobility/covered-detour` +
        (declared.length ? ` (${declared.map((p) => p.room).join(" ")})` : ""),
    );
  }
  // ------------------------------------------------------------------
  // THE TOWER-CLUMP CENSUS, PRINTED. The goal document's anti-pattern section
  // quotes this histogram, and round 10 caught it quoting "93 of 172 rooms hold
  // 3 of 6 towers inside chebyshev 2" against a measured 91 — a number that
  // matched neither the cumulative nor the exact reading of the planner's own
  // published `towerClump.withinCheb2OfSitter`. Anything a document states about
  // the fleet has to be printable, so it is printed.
  // ------------------------------------------------------------------
  {
    const hist = [0, 0, 0, 0, 0, 0, 0];
    for (const p of ok) {
      const n = p.meta?.towers?.towerClump?.withinCheb2OfSitter;
      if (typeof n === "number") hist[n]++;
    }
    const cum = (k) => hist.slice(k).reduce((a, b) => a + b, 0);
    console.log(
      `tower clump within chebyshev 2 of the sitter — exact {${hist
        .map((v, i) => `${i}:${v}`)
        .join(" ")}} · cumulative >=3 ${cum(3)} · >=4 ${cum(4)} · >=5 ${cum(5)}`,
    );
  }

  // ------------------------------------------------------------------
  // THE LANE BOUND IS ASSERTED, NOT ADVERTISED.
  //
  // Layer 6 claims a number no arrangement of the 60 extensions can lap worse
  // than; layer 7 measures what the finished room actually laps. For one review
  // cycle the two lived in the same paragraph of the same declaration and
  // disagreed in 7 rooms (E4S7 claimed 1.5 and shipped 14) because nothing ever
  // compared them. This is the comparison, fleet-wide, and it is loud: a bound
  // that does not hold is a defect in the model, not a property of the room.
  // ------------------------------------------------------------------
  const bounded = ok.filter((p) => p.meta.walls?.mobility?.boundHeld !== null && p.meta.walls?.mobility?.boundHeld !== undefined);
  const broke = bounded.filter((p) => !p.meta.walls.mobility.boundHeld);
  const unbounded = ok.filter(
    (p) => p.meta.walls && (p.meta.walls.mobility.boundHeld === null || p.meta.walls.mobility.boundHeld === undefined),
  );
  console.log(
    `lane bound holds: ${bounded.length - broke.length}/${bounded.length}` +
      (unbounded.length
        ? ` · ${unbounded.length} room(s) claim no bound (${unbounded.map((p) => p.room).join(" ")})`
        : " · every room claims one") +
      (broke.length
        ? ` — BOUND BROKEN in ${broke.length}: ${broke
            .map((p) => `${p.room}(bound ${p.meta.walls.mobility.bound} shipped ${p.meta.shell.mobilityBuilt.maxGated})`)
            .join(" ")}`
        : ""),
  );
  if (broke.length) process.exitCode = 1;

  // the quality numbers the adversarial review added to the contract
  const withTowers = ok.filter((p) => p.meta.towers);
  // WHICH ARRAY THE ORDER INVARIANT IS ABOUT. `refillDists` is now the AS-BUILT
  // walk, re-derived at finalizeRoom over the RCL8 board (see recomputeRefill in
  // layer-walls). The build order is a claim about RCL3-5, when the room owns one
  // tower, ten extensions and nothing else — so the invariant is checked against
  // `refillDistsAtPlacement`, which is that board, and the as-built maximum is
  // reported beside it because that is the walk the finished room pays.
  // Three arrays, three boards, and the order invariant belongs to the first:
  //   refillDistsUnblocked   the RCL3-era board — hub kit only, no towers yet.
  //                          This is what the build order is chosen on.
  //   refillDistsAtPlacement layer 3's own reading with all six towers standing
  //                          in each other's way.
  //   refillDists            AS BUILT at RCL8, the number of record.
  const placementOf = (p) =>
    p.meta.towers.refillDistsUnblocked ||
    p.meta.towers.refillDistsAtPlacement ||
    p.meta.towers.refillDists;
  const t0 = withTowers.map((p) => placementOf(p)[0]).sort((a, b) => a - b);
  const t8 = withTowers.map((p) => Math.max(...p.meta.towers.refillDists)).sort((a, b) => a - b);
  // THE INVARIANT IS ABOUT tower[0], AND FROM ROUND 9 ABOUT tower[1] TOO.
  //
  // This used to demand the WHOLE array be sorted by refill walk, which was a
  // proxy for the thing that matters (the room owns exactly one tower from RCL3
  // to RCL5, and the filler has to reach it) and has since become wrong: layer 3
  // now picks tower[1] as the best PARTNER for tower[0] over the wall, because
  // RCL5 owns a PAIR and the second-easiest tower to refill is not the same
  // question as the second tower to build. So the check is what it always meant:
  // tower[0] is the minimum-refill tower, and the tail from index 1 is sorted.
  const unsorted = withTowers.filter((p) => {
    const r = placementOf(p);
    if (r.some((v) => v < r[0])) return true;
    const tail = r.slice(2);
    return tail.some((v, i) => i && v < tail[i - 1]);
  });
  const farBuilt = withTowers.filter((p) => p.meta.towers.maxRefill > 8);
  console.log(
    `tower[0] refill (the only tower at RCL3-5, on the RCL3-era board): median ${med(t0)} · max ` +
      `${t0[t0.length - 1]}` +
      (unsorted.length
        ? ` — tower[0] is NOT the easiest to refill in ${unsorted.length} rooms`
        : " · tower[0] easiest to refill everywhere, tower[1] the best partner for it"),
  );
  console.log(
    `furthest-tower refill AS BUILT (RCL8 board, every obstacle standing): median ${med(t8)} · max ` +
      `${t8[t8.length - 1]} · ${farBuilt.length} room(s) over the 8-step note` +
      (farBuilt.length
        ? ` — all declared: ${farBuilt
            .map((p) => `${p.room}:${p.meta.towers.maxRefill}`)
            .join(" ")}`
        : ""),
  );
  {
    const silent = farBuilt.filter(
      (p) =>
        !(p.meta.shortfalls || []).some((d) => d && d.gate === "towers" && d.kind === "weak-battery"),
    );
    if (silent.length) {
      console.log(
        `  REFILL SHORTFALL UNDECLARED in ${silent.length} room(s): ${silent.map((p) => p.room).join(" ")}`,
      );
      process.exitCode = 1;
    }
  }
  // ------------------------------------------------------------------
  // THE THREE FLEET TOTALS THE GOAL DOCUMENT QUOTES AND NOTHING PRINTED.
  //
  // The doc's baseline block opens "every number in this block is printed by
  // plan.mjs --all-claimable, validate.mjs or push-plan.mjs --census". It was
  // false for exactly three of them — the fleet rampart total, the fleet
  // shallow-extension total and the count of declared shortfalls — which had to
  // be re-derived by hand from the artifact every round, and a number
  // re-transcribed by hand every round is a number that is wrong every other
  // round. (`validate.mjs` prints `declared-shortfall N`, but that counts ROOMS
  // carrying a note row, which is a different quantity and was being read as if
  // it were this one.) The rule this planner holds itself to is that if a number
  // appears in prose, something has to be able to print it. So:
  // ------------------------------------------------------------------
  {
    const ramparts = ok.reduce((s, p) => s + (p.structures.rampart || []).length, 0);
    const shallowByRoom = ok
      .map((p) => {
        const d = (p.meta.shortfalls || []).find(
          (x) => x && x.gate === "extensions" && x.kind === "shallow",
        );
        return d ? `${p.room}:${d.shallowExt?.count ?? "?"}` : null;
      })
      .filter(Boolean);
    const shallow = ok.reduce((s, p) => {
      const d = (p.meta.shortfalls || []).find(
        (x) => x && x.gate === "extensions" && x.kind === "shallow",
      );
      return s + (d?.shallowExt?.count ?? 0);
    }, 0);
    const decls = ok.reduce((s, p) => s + (p.meta.shortfalls || []).length, 0);
    const notes = ok.reduce((s, p) => s + (p.meta.notes || []).length, 0);
    console.log(
      `FLEET TOTALS: ramparts ${ramparts} · shallow extensions ${shallow}` +
        (shallowByRoom.length ? ` (${shallowByRoom.join(" ")})` : "") +
        ` · declared shortfalls ${decls} · planner notes ${notes} · roads ` +
        `${ok.reduce((s, p) => s + (p.structures.road || []).length, 0)}`,
    );
  }
  const parks = ok.map((p) => p.meta.ctrlParks ?? 0).sort((a, b) => a - b);
  const thin = ok.filter((p) => (p.meta.ctrlParks ?? 0) < 4);
  // ...AND WHICH ROOMS ACTUALLY RELEASE SEATS, PRINTED. The goal document, this
  // file's own PARK_PROTECT comment and criticism 4 all named THREE rooms and
  // all three named E13S6, which holds 8 of the 8 its seat search counted, eats
  // 0 and ships 0 shallow extensions — it never enters the release pass. The
  // doc's own two figures for it disagreed with each other, which is the tell.
  // Nothing printed the list, so nothing could contradict it; now something does.
  const released = ok
    .filter((p) => (p.meta.shortfalls || []).some((d) => d && d.gate === "ctrlParks" && d.kind === "released"))
    .map((p) => {
      const d = (p.meta.shortfalls || []).find((x) => x && x.gate === "ctrlParks" && x.kind === "released");
      return `${p.room}:${d.ctrlParks?.held ?? "?"}of${d.ctrlParks?.held + d.ctrlParks?.released || "?"}->ships${d.ctrlParks?.parksShipped ?? p.meta.ctrlParks}`;
    });
  console.log(
    `upgrader parks: min ${parks[0]} · median ${med(parks)}` +
      (thin.length ? ` — THIN: ${thin.map((p) => `${p.room}:${p.meta.ctrlParks}`).join(" ")}` : "") +
      ` · released in ${released.length} room(s)${released.length ? `: ${released.join(" ")}` : ""}`,
  );
  // the eco gates, and the fleet they were measured off — the line pipeline.mjs
  // has always claimed the suite prints and never did.
  console.log(
    fm
      ? `eco medians (measured this run, ${fm.rooms} rooms): controller walk ${fm.ctrlWalk} -> gate ` +
        `${fm.ctrlGate} · source sum ${fm.srcSum} -> gate ${fm.srcGate} ` +
        `(each gate is the lower of its absolute line and 2x the median)`
      : `eco medians: NOT measured — this run planned too few rooms to median a fleet, so the seeded ` +
        `values stand and every eco declaration says which case it is in`,
  );
  const noExtractor = ok.filter((p) => !(p.structures.extractor || []).length);
  console.log(
    `extractor + mineral seat: ${ok.length - noExtractor.length}/${ok.length}` +
      (noExtractor.length ? ` — missing: ${noExtractor.map((p) => p.room).join(" ")}` : ""),
  );
  // RUNTIME IS MEASURED, NOT GUESSED. planRoom stamps its own wall time into
  // meta.planMs; a room that walks the whole escalation ladder composes the
  // full layer stack four times, so this is the number that says whether a
  // search got greedy — and it is a fleet distribution, because the mean of a
  // fleet with one 2-second room in it says nothing useful.
  const msAll = ok.map((p) => p.meta.planMs ?? 0).sort((a, b) => a - b);
  const qm = (f) => msAll[Math.min(msAll.length - 1, Math.floor(msAll.length * f))];
  const slowest = ok
    .slice()
    .sort((a, b) => (b.meta.planMs ?? 0) - (a.meta.planMs ?? 0))
    .slice(0, 3);
  console.log(
    `planRoom wall time: p50 ${qm(0.5)}ms · p90 ${qm(0.9)}ms · max ${msAll[msAll.length - 1]}ms · ` +
      `in-planner total ${(msAll.reduce((s, v) => s + v, 0) / 1000).toFixed(1)}s — slowest ` +
      slowest
        .map((p) => `${p.room}:${p.meta.planMs}ms(${p.meta.shellEscalation?.steps ?? 1} composes)`)
        .join(" "),
  );
  const escalated = ok.filter((p) => p.meta.seedSkip > 0);
  console.log(
    `seed escalation: ${escalated.length}/${ok.length} rooms left the top seed` +
      (escalated.length
        ? ` (${escalated.map((p) => `${p.room}:skip${p.meta.seedSkip} eco${p.meta.pathSourcesSum + p.meta.pathController}`).join(" ")})`
        : ""),
  );
  // ...and the number a reviewer with a stopwatch will actually see. It is
  // larger than the in-planner total by the mongo fetch, the render and the
  // writes, and the gap is not noise — it is roughly a tenth of the run.
  const suiteS = (performance.now() - suiteT0) / 1000;
  const inPlanner = msAll.reduce((s, v) => s + v, 0) / 1000;
  console.log(
    `SUITE WALL CLOCK: ${suiteS.toFixed(1)}s end to end (in-planner ${inPlanner.toFixed(1)}s + ` +
      `${(suiteS - inPlanner).toFixed(1)}s of mongo fetch, SVG render and ${ok.length} file writes). ` +
      `Quote this one when you mean "the suite".`,
  );
  // ------------------------------------------------------------------
  // Mm5 (round 22) — THE NUMERAL-ROT GATE, RUN ON THE ARTIFACT THIS BUILD JUST
  // WROTE.
  //
  // Six review rounds running, the same defect: a current-tense fleet numeral
  // typed into a comment, true on the build it was typed against and false on
  // the one that ships. Every previous fix was a re-typed number and every one
  // of them rotted again. Prose was the last channel in this project with no
  // re-derivation behind it; `numeral-audit.mjs` is that re-derivation, and it
  // belongs HERE because a gate that only runs when somebody remembers to run
  // it is the honour system with a filename.
  //
  // FLEET RUNS ONLY. A `--rooms E9S2` build overwrites plans-hub.json with one
  // room, and auditing prose about the fleet against a one-room artifact would
  // fail on every correct sentence in the repository. The gate reads the fleet
  // and it runs when the fleet was planned.
  //
  // It PRINTS rather than throws: the artifact is already on disk and correct,
  // and refusing to finish a 20-minute build over a comment would teach the
  // next person to skip the build. The exit code carries it instead —
  // `node numeral-audit.mjs` is the standalone gate and it exits 1, which is
  // what CI and the round's final check read.
  // ------------------------------------------------------------------
  if (fullFleet) {
    try {
      const { runAudit } = await import("./numeral-audit.mjs");
      const code = runAudit({ log: (s) => console.log(s) });
      if (code) {
        console.log(
          `NUMERAL AUDIT FAILED — the prose above disagrees with the artifact this run just wrote. ` +
            `Fix the figure, give the quantity an extractor in numeral-audit.mjs, or tag the line ` +
            `[r22-waived: why]. Standalone: node tools/plan-suite/v2/numeral-audit.mjs --list`,
        );
      }
    } catch (e) {
      console.log(`numeral audit: could not run (${e && e.message})`);
    }
  }
}

// main() became async for the numeral gate; an async main whose rejection is
// unhandled exits 0 with a warning, which is exactly the kind of silent pass
// this suite spends its rounds closing.
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
