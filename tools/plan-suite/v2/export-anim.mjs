/**
 * Animation frame exporter — "watch the planner think".
 *
 * Re-runs the v2 planner stages for a room and flattens them into an ordered
 * list of animation STEPS that the in-game player (src/utils/PlanAnimator.ts)
 * replays one-per-tick with RoomVisual.
 *
 *   node tools/plan-suite/v2/export-anim.mjs E2S7
 *   node tools/plan-suite/v2/export-anim.mjs E2S7 E5S1 E9S8
 *   node tools/plan-suite/v2/export-anim.mjs --all      # every room in plans-hub.json
 *
 * Output: tools/plan-suite/out-v2/anim/<room>.json
 *   {
 *     room, format: "xyc-flat", palette: { "0": "#rrggbb", ... },
 *     steps: [ { stage, label, cells: [x,y,colorIndex, x,y,colorIndex, ...] } ]
 *   }
 *
 * Cells are FLAT triplets (not [[x,y,c]]) — same information, ~35% smaller,
 * which matters because the payload has to fit in 100KB memory segments.
 */
import fs from "fs";
import path from "path";
import {
  D4,
  OUT_V2,
  exteriorFlood,
  fetchRoomsFromMongo,
  planStructureHash,
  walkable,
} from "./shared.mjs";
import { distanceTransform } from "./dt.mjs";
import { distField, growBasin } from "./layer-hub.mjs";
// the seat caption's "inside the shell" claims a DEPTH, so the depth is measured
// with the pipeline's own function rather than a fifth copy of it (OB1 round 26)
import { depthFromExterior } from "./layer-shell.mjs";
import { planRoom } from "./pipeline.mjs";
// DEPTH_SAFE is imported rather than re-typed: the caption's shallow/deep label
// has to be the same threshold layer 6 and layer 7b place against, and a second
// copy of a constant is the class this suite keeps closing (OM2, round 20).
import { DEPTH_SAFE } from "./layer-ext.mjs";
// the rampart taxonomy is IMPORTED and not re-implemented — see rampartFacet
// below, and the header over `rampartClassifier` in layer-walls.mjs (OB1)
import { LATE_KINDS, lateRoadDecomp, rampartClassifier } from "./layer-walls.mjs";

const MAX_FIELD_RING = 25;
const BASIN_RADIUS = 12;
const ROAD_CHUNK = 3;
const RAMPART_CHUNK = 3; // small chunks so the min-cut sweep reads as a sweep
const EXT_CHUNK = 2; // steady build rhythm
const FIELD_MERGE = 2; // rings per step — the flood is the least interesting part
/** the RCL8 extension programme, restated for the caption (pipeline EXT_TARGET) */
const EXT_TARGET_ANIM = 60;

/**
 * Pacing multipliers on the player's BASE_RATE (steps/sec).
 * >1 = faster (skim), <1 = slower (dwell). The "thinking" stages skim, the
 * stages where a human should actually look at a tile crawl.
 */
const STAGE_RATES = {
  dt: 3,
  fields: 5,
  seed: 0.35,
  basin: 2,
  core: 1,
  claims: 0.5,
  roads: 1.5,
  ramparts: 0.7,
  // OM2 (round 22) — the across-prior swap's ghost and its erase. Slow, like
  // every other beat where the plan takes something back: it is one tile and it
  // is the moment a later pass overrules layer 3's own search.
  towerGhost: 0.4,
  towers: 0.4,
  towerMove: 0.4,
  roadsTwr: 1,
  labs: 0.7,
  roadsLab: 1,
  nuker: 0.4,
  observer: 0.4,
  extractor: 0.4,
  roadsMisc: 1,
  roadsExt: 1.5,
  // the shallow slots the fill takes before the relocation pass moves them —
  // they are on screen for the whole extension mass, so they may skim
  extGhost: 1.2,
  extensions: 1.2,
  // same reason as roadsPrune below: the relocation is the other moment the
  // plan takes something back, and 5 tiles vanishing at speed reads as a glitch
  extMove: 0.5,
  // layer 7b's backfill: a handful of tiles, and the whole reason a room like
  // E9S2 reaches 60/60 — slow enough to read the caption
  extAdd: 0.4,
  // the prune is 12 tiles in a typical room and it is the one moment the plan
  // gets SMALLER — it has to be slow enough that the eye catches the deletion
  roadsPrune: 0.5,
  roadsLate: 1,
  roadsResid: 0.6,
};

/**
 * Scaffolding = "thinking" output, not part of the final base. The player
 * paints these on separate canvases and dims them once the plan appears, so
 * the base pops out of the faded reasoning behind it.
 */
const STAGE_SCAFFOLD = {
  dt: true,
  fields: true,
  seed: false,
  basin: true,
  core: true,
  claims: false,
  roads: false,
  ramparts: false,
  towerGhost: false,
  towers: false,
  towerMove: false,
  roadsTwr: false,
  labs: false,
  roadsLab: false,
  nuker: false,
  observer: false,
  extractor: false,
  roadsMisc: false,
  roadsExt: false,
  extGhost: false,
  extensions: false,
  extMove: false,
  extAdd: false,
  roadsPrune: false,
  roadsLate: false,
  roadsResid: false,
};

// --- palette --------------------------------------------------------------

function makePalette() {
  const list = [];
  const seen = new Map();
  return {
    idx(hex) {
      if (!seen.has(hex)) {
        seen.set(hex, list.length);
        list.push(hex);
      }
      return seen.get(hex);
    },
    toObject() {
      const o = {};
      for (let i = 0; i < list.length; i++) o[i] = list[i];
      return o;
    },
    get size() {
      return list.length;
    },
  };
}

function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const hx = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}

// --- step builder ---------------------------------------------------------

function makeSteps(palette) {
  const steps = [];
  return {
    steps,
    push(stage, label, cells) {
      if (!cells.length) return;
      steps.push({ stage, label, cells });
    },
    /** tiles: [{x,y}], colorHex -> flat triplets */
    flat(tiles, hex) {
      const c = palette.idx(hex);
      const out = new Array(tiles.length * 3);
      for (let i = 0; i < tiles.length; i++) {
        out[i * 3] = tiles[i].x;
        out[i * 3 + 1] = tiles[i].y;
        out[i * 3 + 2] = c;
      }
      return out;
    },
    /** groups: [{tiles:[{x,y}], hex}] -> one flat triplet run, multiple colors */
    flatGroups(groups) {
      let n = 0;
      for (const g of groups) n += g.tiles.length;
      const out = new Array(n * 3);
      let i = 0;
      for (const g of groups) {
        const c = palette.idx(g.hex);
        for (const t of g.tiles) {
          out[i++] = t.x;
          out[i++] = t.y;
          out[i++] = c;
        }
      }
      return out;
    },
  };
}

// --- stages ---------------------------------------------------------------

function stageDt(sb, terrain, dt) {
  let max = 0;
  for (let i = 0; i < 2500; i++) if (dt[i] > max) max = dt[i];
  const byVal = new Map();
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const v = dt[x + y * 50];
      if (v <= 0) continue; // walls
      if (!byVal.has(v)) byVal.set(v, []);
      byVal.get(v).push({ x, y });
    }
  }
  const vals = [...byVal.keys()].sort((a, b) => a - b);
  for (const v of vals) {
    const t = max > 1 ? (v - 1) / (max - 1) : 1;
    const hex = hsl(232 - 44 * t, 78, 20 + 46 * t);
    sb.push("dt", `distance transform · openness ${v}`, sb.flat(byVal.get(v), hex));
  }
  return max;
}

function stageFields(sb, terrain, anchors) {
  for (let a = 0; a < anchors.length; a++) {
    const { pos, name } = anchors[a];
    const hue = (a * 360) / anchors.length + 15;
    const field = distField(terrain, [pos]);
    const rings = [];
    for (let d = 0; d <= MAX_FIELD_RING; d++) rings.push([]);
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (!walkable(terrain, x, y)) continue;
        const d = field[x + y * 50];
        if (d > MAX_FIELD_RING) continue;
        rings[d].push({ x, y });
      }
    }
    // Every ring is still emitted, but FIELD_MERGE of them share one step:
    // the flood is scaffolding, and at ~78 steps it used to eat half the film.
    for (let d = 0; d <= MAX_FIELD_RING; d += FIELD_MERGE) {
      const groups = [];
      let lastD = d;
      for (let k = d; k < d + FIELD_MERGE && k <= MAX_FIELD_RING; k++) {
        if (!rings[k].length) continue;
        const t = k / MAX_FIELD_RING;
        // dim + fading: rings read as a wave, they must not drown the plan
        groups.push({ tiles: rings[k], hex: hsl(hue, 70 - 25 * t, 46 - 24 * t) });
        lastD = k;
      }
      if (!groups.length) continue;
      const span = lastD > d ? `rings ${d}-${lastD}` : `ring ${d}`;
      sb.push("fields", `flood from ${name} · ${span}`, sb.flatGroups(groups));
    }
  }
}

function stageBasin(sb, terrain, seed) {
  const { basin } = growBasin(terrain, seed, BASIN_RADIUS);
  let maxD = 0;
  for (const b of basin) if (b.d > maxD) maxD = b.d;
  const byD = new Map();
  for (const b of basin) {
    if (!byD.has(b.d)) byD.set(b.d, []);
    byD.get(b.d).push(b);
  }
  const ds = [...byD.keys()].sort((a, b) => a - b);
  for (const d of ds) {
    const t = maxD > 0 ? d / maxD : 0;
    const hex = hsl(140 - 20 * t, 70, 22 + 32 * (1 - t));
    sb.push("basin", `grow basin · walk ${d}`, sb.flat(byD.get(d), hex));
  }
}

const CLAIM_COLORS = {
  storage: "#ffaa00",
  terminal: "#ff66dd",
  hubLink: "#00e5ff",
  sitter: "#ffffff",
  spawn: "#44ff44",
  container: "#ffd27f",
  sourceLink: "#7fe0ff",
  ctrlLink: "#9fbfff",
};

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Upgraders work at range 3, and layer-hub only ever seats the bin at 1..3. */
const CTRL_BIN_RANGE = 3;

/**
 * structures.container is one seat per source, then the CONTROLLER bin (the
 * pre-RCL7 upgrader bin), then the MINERAL seat when the room has a mineral —
 * but 1-source and mineral-less rooms exist, so the label is derived from the
 * plan's own anchors rather than from a fixed index. Anything the anchors do
 * not explain keeps a neutral positional label; guessing would be worse than
 * saying nothing.
 *
 * Claim order is source → controller → mineral, each taking from what is left,
 * because that is the order of decreasing geometric certainty: a source seat
 * touches its source and nothing else, while the controller bin and the
 * mineral seat can land on top of each other. E8S3 is the fleet's degenerate
 * case — its mineral is D8-adjacent to the controller link, so BOTH seats sit
 * at range 1 of the mineral, range 1 of the link and range 3 of the
 * controller, and no amount of geometry separates them. There the array order
 * breaks the tie, which layer-hub guarantees ("It joins structures.container
 * AFTER the source containers and BEFORE the mineral container — that order is
 * load-bearing"). That is a tie-break on a documented invariant, not an
 * assumption about which index the controller bin lives at.
 */
function containerRoles(plan) {
  const list = plan.structures.container || [];
  const sources = plan.sources || [];
  const links = plan.structures.link || [];
  // link[0] is the hub link, link[last] is the controller link
  const ctrlLink = links.length > 1 ? links[links.length - 1] : null;
  const labels = new Array(list.length).fill(null);

  list.forEach((c, i) => {
    const si = sources.findIndex((s) => cheb(c, s) <= 1);
    if (si >= 0) labels[i] = `source ${si + 1} miner seat`;
  });

  // layer-hub seats the bin at range 1..3 of the controller AND D8-adjacent to
  // the controller link; nearest-to-controller decides, array order breaks ties
  if (plan.controller) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < list.length; i++) {
      if (labels[i]) continue;
      const d = cheb(list[i], plan.controller);
      if (d > CTRL_BIN_RANGE || d >= bestD) continue;
      if (ctrlLink && cheb(list[i], ctrlLink) > 1) continue;
      best = i;
      bestD = d;
    }
    if (best >= 0) labels[best] = "controller upgrader bin";
  }

  if (plan.mineral) {
    const mi = list.findIndex((c, i) => !labels[i] && cheb(c, plan.mineral) <= 1);
    if (mi >= 0) labels[mi] = "mineral miner seat";
  }

  for (let i = 0; i < list.length; i++) if (!labels[i]) labels[i] = `container ${i + 1}`;
  return labels;
}

function stageClaims(sb, plan) {
  const s = plan.structures;
  const one = (label, tile, hex) => sb.push("claims", label, sb.flat([tile], hex));

  if (s.storage?.[0]) one("claim storage — hub center", s.storage[0], CLAIM_COLORS.storage);
  if (s.terminal?.[0]) one("claim terminal — trio", s.terminal[0], CLAIM_COLORS.terminal);
  if (s.link?.[0]) one("claim hub link — trio", s.link[0], CLAIM_COLORS.hubLink);
  if (plan.sitter) one("sitter tile — one creep serves the trio", plan.sitter, CLAIM_COLORS.sitter);

  (s.spawn || []).forEach((p, i) => one(`claim spawn ${i + 1} — fanned sector`, p, CLAIM_COLORS.spawn));
  const cRoles = containerRoles(plan);
  (s.container || []).forEach((p, i) => one(`claim container — ${cRoles[i]}`, p, CLAIM_COLORS.container));

  // link[0] is the hub link, link[last] is the controller link, rest = sources
  const links = s.link || [];
  for (let i = 1; i < links.length - 1; i++) {
    one(`claim source link ${i}`, links[i], CLAIM_COLORS.sourceLink);
  }
  if (links.length > 1) one("claim controller link", links[links.length - 1], CLAIM_COLORS.ctrlLink);
}

/**
 * Order tiles by angle around a pivot so a ring of them *sweeps* around the
 * base like a radar hand instead of popping in raster-scan order. Ties (same
 * bearing, different radius) resolve inner-first.
 */
function sweepOrder(tiles, pivot) {
  return tiles
    .map((p) => {
      const dx = p.x - pivot.x;
      const dy = p.y - pivot.y;
      return { p, a: Math.atan2(dy, dx), r: dx * dx + dy * dy };
    })
    .sort((u, v) => u.a - v.a || u.r - v.r)
    .map((e) => e.p);
}

function chunked(sb, stage, tiles, size, hex, labelFor) {
  for (let i = 0; i < tiles.length; i += size) {
    const slice = tiles.slice(i, i + size);
    sb.push(stage, labelFor(i, Math.min(i + size, tiles.length), tiles.length), sb.flat(slice, hex));
  }
}

// --- what each rampart is FOR ---------------------------------------------
/**
 * OM4 (round 21) — THE RAMPARTS STAGE CALLED 974 RAMPARTS SOMETHING THEY ARE NOT.
 *
 * The stage painted every rampart in the room under one caption, `min-cut wall
 * b/n`, in 171 of the 172 rooms. Most of a room's ramparts ARE tiles of
 * `meta.shell.cut`, and the rest are not the wall at all: a container outside
 * the shell wearing its own cover, a stand-denial ring tile, a shallow structure
 * renting a rampart for itself. The counter lied twice — it called those tiles
 * wall tiles, and it inflated the wall's own count by the ones that are not in
 * it. (Round 25: the per-class fleet figures that used to be typed into this
 * paragraph are on every film as `rampartCensus`, per room, because the fleet
 * moves and a typed census does not.)
 *
 * E9S2 contradicted itself inside a single film over the same tile: 33,4 was
 * painted "min-cut wall" by this stage and then narrated by the pass-7 caption
 * as a rampart the origin "rents forever" — which is what it is. The classifier
 * that got that second sentence right was ALREADY IN THIS FILE, one function
 * down, as `rampartJob`; the stage simply never asked it. So the classification
 * is read from ONE place by both callers: a fact that is a membership test in
 * the shipped board, not two sentences that can disagree. (Round 25 moved that
 * one place again — out of this file entirely and into the layer that publishes
 * the room's own census, because two channels in two files is the same defect
 * one level up. See below.)
 *
 * The sweep is unchanged — the tiles are painted in the same order around the
 * hub, so the wall still reads as a radar hand. The film emits one chunked RUN
 * per stretch of same-caption tiles instead of one run over everything, and each
 * run's counter counts ITS OWN caption, so "min-cut wall 40/50" now means 40 of
 * the room's 50 cut tiles.
 */
/**
 * OB1 (round 25) — THE FILM'S OWN COPY OF THE TAXONOMY HAD A DEAD CLASS AND A
 * FALSE CAPTION, AND BOTH WERE ARTEFACTS OF THE COPY.
 *
 * The classification above was re-implemented here in a different order from the
 * one the note channel publishes (`classifyRoadRamparts`, layer-walls.mjs), and
 * the difference was not cosmetic:
 *
 *   `denial` took 0 of this fleet's 8208 ramparts. 237 stand-denial tiles ship
 *   and 223 of them are also in `shell.bubble`, which this file tested first, so
 *   the class was unreachable by construction in every room — and unreachable
 *   silently, since a class that never fires prints no caption to be wrong.
 *
 *   `bubble`'s caption said "a container outside the shell" over 807 tiles that
 *   are 295 containers, 299 LINKS and 213 tiles carrying nothing at all. E11S3's
 *   21,12 got the container-seat caption in this film while the room's own note
 *   called it a stand-denial ring tile that "carries no structure".
 *
 * So the ORDER and the membership tests are gone from this file: `rampartClassifier`
 * is imported from layer-walls.mjs, which is where the note's five-class census
 * is derived, and restricted to road+rampart tiles the two agree in 172/172 rooms
 * by construction rather than by coincidence.
 *
 * WHAT STAYS HERE IS THE WORDING, AND IT IS DERIVED PER MEMBER. A class is not a
 * caption: `seat` is a container, and whether that container is OUTSIDE the shell
 * or inside it on shallow floor is a second fact, read off the BOARD per tile
 * (see the OB1 round-26 header below — round 25 read it off `shell.bubble` and
 * was wrong on 210 of 436 seats). `cover` names the structure that is renting the
 * rampart rather than calling every one of them "a shallow structure", and
 * `rampartCensus` on each film is where the splits are read rather than typed.
 * The run key is the FACET, so no chunk
 * can carry two captions and every counter counts its own facet.
 *
 * AND THE DEAD CLASSES ARE DECLARED. `rampartCensus` on the film ships one row
 * per facet including the ones that took no tile, with the reason they are empty
 * — the same discipline the note inventory keeps for `pavingGap`. A class that is
 * only visible when it fires is a class nobody can tell apart from a bug.
 */
/**
 * ------------------------------------------------------------------------
 * OB1 (round 26) — THE SEAT CAPTION'S DISJUNCT NOW COMES OFF THE BOARD, AND SO
 * DOES THE REASON AN EMPTY FACET IS EMPTY.
 * ------------------------------------------------------------------------
 * Round 25 split `seat` into "outside the shell" / "inside the wall on shallow
 * floor" on membership in `meta.shell.bubble`. That list is not an
 * outside-the-shell oracle and never was: its producer (`addBubble`,
 * layer-shell.mjs) bubbles a tile that is OUTSIDE **or** inside-but-shallow, and
 * containers ramparted after layer 2 — every mineral seat in this fleet — are
 * outside the shell and are not in the list at all. Membership is a DISJUNCTION
 * and the caption read it as one disjunct, in both directions at once:
 * 79 seats painted "outside the shell" were inside it, 131 painted "inside the
 * wall" were outside it, 210 of 436 captions false, and E12S1's film contradicted
 * its own artifact over 22,40 and 36,24 in the same reel.
 *
 * THE LESSON, WHICH IS BIGGER THAN THE BUG. Round 25 shipped a gate for exactly
 * this caption and the gate passed, because the gate compared the film's reading
 * of `shell.bubble` against the classifier's reading of `shell.bubble`. Two
 * readers of one list agreeing is an AGREEMENT test; it says nothing about
 * whether the list means what the sentence says. The disjunct is now derived
 * from the thing the sentence is ABOUT — the frozen enclosure itself:
 *
 *     outside(tile) := exteriorFlood(terrain, meta.shell.cutAtFreeze)[tile]
 *
 * which is the same flood layers 3-6 read (`plan.exterior`), published per room
 * since round 25, and re-derivable by any reader holding the artifact and the
 * terrain. This file cross-checks the two floods and refuses to write a film if
 * they differ, because "the flood I derived" and "the flood the plan used" being
 * the same object is the whole premise.
 *
 * `shell.bubble` is not consulted here any more, and `rampartClassifier` no
 * longer exposes it: a fact with no honest consumer is a trap standing open.
 *
 * AND THE EMPTY ROWS (OL2). `emptyBecause` used to be a constant sentence per
 * facet, written as a fact about the world — "every ramparted container this room
 * ships stands outside the shell" — while the facets are a function of TEST
 * ORDER: a container standing on a cut tile is `crossing`, so the seat facets can
 * be empty in a room full of ramparted containers. 13 rows were false, and E15S4
 * printed both "no ramparted container is outside" and "every ramparted container
 * is outside" over a room shipping two. So each empty row is now derived per room
 * from the board, and the two causes are told apart by measuring them: the tiles
 * matching the facet's OWN test are counted, and the row either names the earlier
 * facet that took them (absorption, with the tiles) or states the world-absence
 * that the count of zero actually proves.
 */
const RAMPART_FACETS = {
  crossing: {
    caption: "min-cut wall",
    job: "it is a tile of the published min-cut wall, which this film's own ramparts stage paints and its last frame still carries",
  },
  "seat.outside": {
    caption: "seat outside the shell — a container beyond the wall, covered where it stands",
    job: "it covers a container standing outside the frozen enclosure, where nothing else protects it",
  },
  "seat.inside": {
    caption:
      "container cover — a container inside the shell on shallow floor, renting a rampart of its own",
    job: "it carries a container standing inside the wall on floor too shallow to go bare",
    // the caption asserts SHALLOW, so the depth is measured per tile and a
    // container that is inside the wall and deep enough to stand bare gets its
    // own words rather than the shallow ones
    captionDeep:
      "container cover — a container inside the shell at safe depth, renting a rampart of its own",
    jobDeep:
      "it carries a container standing inside the wall on floor deep enough to go bare, and it is ramparted anyway",
  },
  ring: {
    caption: "controller stand-denial ring",
    job: "it is part of the controller stand-denial ring",
  },
  cover: {
    caption: "personal cover — one structure renting a rampart of its own",
    job: "the shipped board still carries a rampart there and a structure of ours stands on it, renting it",
  },
  unclassified: {
    caption: "rampart this room's own taxonomy has no word for",
    job: "the shipped board carries a rampart there that is not on the cut, carries nothing, and is not part of the stand-denial ring — a tile the enum has no word for",
  },
  none: {
    caption: "rampart",
    job: "the shipped board carries no rampart there at all, so there was none to retire",
  },
};
/** the facet order the census prints in — the classifier's own test order */
const RAMPART_FACET_ORDER = [
  "crossing",
  "seat.outside",
  "seat.inside",
  "ring",
  "cover",
  "unclassified",
  "none",
];
function rampartFacets(plan, terrain) {
  const cls = rampartClassifier(plan);
  // ------------------------------------------------------------------
  // THE BOARD THE DISJUNCT IS READ OFF. `meta.shell.cutAtFreeze` is layer 2's
  // cut, published per room, and the flood over it IS `plan.exterior` — the
  // enclosure every consumer between layers 3 and 6 measured itself against.
  // Deriving it here rather than reading `plan.exterior` is deliberate: the
  // caption has to be re-derivable by a reader who holds the artifact and the
  // terrain and nothing else, which is what makes a gate over it a truth test.
  // ------------------------------------------------------------------
  const freeze = plan.meta?.shell?.cutAtFreeze || plan.shell?.cutAtFreeze;
  if (!freeze || !freeze.length) {
    throw new Error(
      `export-anim: ${plan.room || "room"} publishes no meta.shell.cutAtFreeze, so the seat caption's ` +
        `"outside the shell" cannot be derived from the board. See pipeline.mjs (MM2, round 25).`,
    );
  }
  const frozenExt = exteriorFlood(terrain, new Set(freeze.map((t) => `${t.x},${t.y}`)));
  if (plan.exterior) {
    let disagree = 0;
    for (let i = 0; i < 2500; i++) if (!!frozenExt[i] !== !!plan.exterior[i]) disagree++;
    if (disagree) {
      throw new Error(
        `export-anim: the flood over meta.shell.cutAtFreeze disagrees with the frozen plan.exterior ` +
          `the room's own consumers read, on ${disagree} tile(s). The published snapshot is not the ` +
          `cut the flood was taken against, and every caption derived from it would be a guess.`,
      );
    }
  }
  const frozenDepth = depthFromExterior(frozenExt);
  const idxOfKey = (k) => {
    const c = k.indexOf(",");
    return +k.slice(0, c) + +k.slice(c + 1) * 50;
  };
  const outside = (k) => !!frozenExt[idxOfKey(k)];
  const depthAt = (k) => frozenDepth[idxOfKey(k)];
  const facetOf = (k) => {
    const c = cls.classOf(k);
    if (c === "seat") return outside(k) ? "seat.outside" : "seat.inside";
    return c;
  };
  // `cover` names its occupant and `seat.inside` names the depth claim it makes,
  // so the caption is a function of the TILE and not of the class alone
  const captionOf = (k) => {
    const f = facetOf(k);
    if (f === "cover") {
      const on = cls.occupant.get(k);
      return `personal cover — one ${on || "structure"} renting a rampart of its own`;
    }
    if (f === "seat.inside" && depthAt(k) >= DEPTH_SAFE) return RAMPART_FACETS[f].captionDeep;
    return RAMPART_FACETS[f].caption;
  };
  const jobOf = (k) => {
    const f = facetOf(k);
    if (f === "cover") {
      const on = cls.occupant.get(k);
      return `the shipped board still carries a rampart there and this room's ${on || "structure"} stands on it, renting it`;
    }
    if (f === "seat.inside" && depthAt(k) >= DEPTH_SAFE) return RAMPART_FACETS[f].jobDeep;
    return RAMPART_FACETS[f].job;
  };
  // ------------------------------------------------------------------
  // OL2 — WHY A FACET IS EMPTY, DERIVED, PER ROOM.
  //
  // Each facet's OWN test, with no order in front of it. A facet is empty for
  // exactly one of two reasons and they are told apart by running this over the
  // room's ramparts: if it matches nothing, the room genuinely has none of these
  // and the row says which absence that is; if it matches something, the tiles
  // are sitting in an EARLIER facet and the row names it and lists them.
  // ------------------------------------------------------------------
  const ramparts = (plan.structures?.rampart || []).map((r) => `${r.x},${r.y}`);
  const isContainer = (k) => cls.occupant.get(k) === "container";
  const INTRINSIC = {
    crossing: (k) => cls.onCut(k),
    "seat.outside": (k) => isContainer(k) && outside(k),
    "seat.inside": (k) => isContainer(k) && !outside(k),
    ring: (k) => cls.inDenial(k),
    cover: (k) => cls.occupant.has(k) && !isContainer(k),
    unclassified: (k) => !cls.onCut(k) && !cls.occupant.has(k) && !cls.inDenial(k),
    // the ramparts stage sweeps `structures.rampart`, so it can never paint a
    // tile that carries no rampart — this facet is reachable only through the
    // pass-7 caption, which asks about ORIGIN tiles
    none: () => false,
  };
  const seatCount = ramparts.filter(isContainer).length;
  const denialCount = (plan.shell?.standDenial || plan.meta?.shell?.standDenial || []).length;
  const cutCount = (plan.shell?.cut || plan.meta?.shell?.cut || []).length;
  /** the sentence a zero PROVES when nothing in the room matches the facet's own test */
  const ABSENT = {
    crossing: () =>
      `this room publishes ${cutCount} cut tile(s) and no rampart of its own stands on any of them`,
    "seat.outside": () =>
      seatCount
        ? `all ${seatCount} of this room's ramparted containers stand INSIDE the frozen enclosure, so none is covered out beyond the wall`
        : `this room ships no rampart over a container at all, out beyond the wall or inside it`,
    "seat.inside": () =>
      seatCount
        ? `all ${seatCount} of this room's ramparted containers stand OUTSIDE the frozen enclosure, so none is renting cover inside the wall`
        : `this room ships no rampart over a container at all, inside the wall or out beyond it`,
    ring: () =>
      denialCount
        ? `this room publishes ${denialCount} controller stand-denial tile(s) and no rampart of its own stands on any of them`
        : `this room publishes no controller stand-denial ring, so there is no ring tile to rampart`,
    cover: () =>
      `no structure of this room other than a container stands on a rampart of this room's own`,
    unclassified: () =>
      `every rampart this room ships is on its cut, under a container, on its stand-denial ring or under some other structure of ours — which is what this class exists to demonstrate`,
    none: () =>
      `this facet is never painted: the stage sweeps the rampart list, so every tile it paints carries one`,
  };
  /** why facet `f` took no tile in THIS room — absorption or absence, measured */
  const emptyBecause = (f) => {
    const mine = ramparts.filter((k) => INTRINSIC[f](k));
    if (!mine.length) return ABSENT[f]();
    const by = new Map();
    for (const k of mine) {
      const g = facetOf(k);
      if (!by.has(g)) by.set(g, []);
      by.get(g).push(k);
    }
    const parts = [...by]
      .sort((a, b) => RAMPART_FACET_ORDER.indexOf(a[0]) - RAMPART_FACET_ORDER.indexOf(b[0]))
      .map(([g, ks]) => `${ks.join(" ")} as \`${g}\``);
    return (
      `${mine.length} tile(s) of this room DO match this facet's own test and are counted under an ` +
      `earlier facet instead — the classifier tests in one order and the first test a tile fits wins: ` +
      `${parts.join("; ")}`
    );
  };
  return {
    classOf: cls.classOf,
    facetOf,
    captionOf,
    job: jobOf,
    occupant: cls.occupant,
    emptyBecause,
    outside,
    depthAt,
  };
}

// --- road provenance ------------------------------------------------------
/**
 * ONE LUMP OF ROADS WAS A LIE ABOUT WHEN THEY EXISTED.
 *
 * Every road in the room used to be emitted in a single "LAYER 1 — THE ROADS"
 * stage, before the wall, the towers, the labs and the extensions. The plan
 * does not happen that way: the eco kit is layer 1, the tower spurs are layer
 * 3, the lab access is layer 4, the mineral run is layer 5, the extension
 * corridors are layer 6 and the rampart spurs are layer 7. The cost of the lie
 * was concrete rather than cosmetic — layer 4 picks its lab anchor by
 * requiring the diamond to be OFF the road network, so a reviewer checking
 * E2S3's "0 anchors with all ten labs deep" declaration needs the road set as
 * it stood when the labs were placed, and the film asserted a road set that
 * has never existed at any moment of the pipeline. 28 extension-corridor tiles
 * were on screen before the extension layer had run.
 *
 * `plan.meta.roadLayer` (pipeline.mjs) tags every road tile with the layer
 * that laid it, keyed by tile so it survives the end-of-pipeline BFS re-sort.
 * Nothing here guesses: a tile the map does not carry goes to a residual stage
 * that says so on the banner rather than being folded into whichever layer
 * looks plausible.
 *
 * THE GHOSTS ARE THE POINT, NOT AN ACCIDENT. `roadLayer` also holds tiles that
 * are no longer in `structures.road` — layer 7's dead-end prune is the one
 * pass allowed to delete an earlier layer's road, and every tile it deletes that
 * a layer had tagged is one of these (per room, `meta.walls.prunedGhosts`).
 * Those tiles DID exist mid-pipeline, so the film
 * draws them in the layer that laid them and then a layer-7 prune stage erases
 * them. THE GHOST SET IS `prunedGhosts` AND NOT `pruned`, and round 16 is where
 * the difference got a name: `meta.walls.pruned` counts tiles that ship no road,
 * and some of those were laid AND deleted inside layer 7, so no layer ever
 * tagged them and this film has nothing to erase for them. See prunedBasis in
 * layer-walls.mjs — the two counts answer different questions, each is published
 * under its own name, and the fleet sums of all four are printed by
 * plan.mjs at the end of a run rather than typed here (round 19: the two typed
 * into this paragraph had drifted). That is what makes the
 * mid-pipeline road set recoverable from the film at every layer, which is the
 * whole complaint; dropping the ghosts would have left the earlier layers' road
 * sets short of what those layers actually saw. It is also the only reason a
 * room whose only layer-7 work is the prune — no spur tiles, no filler tiles —
 * gets a LAYER 7 banner at all: the prune is real work.
 */
const ROAD_STAGE = {
  1: ["roads", "the eco kit — hub, spawns, sources, controller"],
  3: ["roadsTwr", "tower spurs"],
  4: ["roadsLab", "lab access"],
  5: ["roadsMisc", "the mineral run"],
  6: ["roadsExt", "extension corridors"],
  // ...and this row is a PLACEHOLDER, never printed. See lateWhat below: layer 7
  // is seven jobs and the banner has to say which of them this room ran.
  7: ["roadsLate", "the late road pass"],
};

/**
 * THE LAYER-7 FRAME BANNER, COMPOSED PER ROOM.
 *
 * Every other row above is true of every room that emits it — layer 4 lays lab
 * access and nothing else. Layer 7 is seven passes (spurs, the extension-face
 * net, network stitches, the swamp pre-pave, the along-the-wall swap, the 7b
 * reflow faces, the deferred mineral-container bridge) and this row read
 * "rampart spurs and the ext-face net" for all of them. A whole cohort of rooms
 * ships that beat with `spurTiles` at 0 — some of their tiles are swamp pre-pave,
 * some are 7b reflow, some are along-cut swaps — so in those rooms
 * the frame banner named two passes that laid nothing while the STAGE_TEXT panel
 * beside it, composed from the same tally this now reads, named the right ones.
 * (The room and tile counts were typed here through round 19 and were wrong by
 * round 20 — the fleet had grown under them. plan.mjs prints the live figures in
 * the rampart-spur line of the fleet summary at the end of a run, which is the
 * one place they are counted rather than remembered. Criticism 80.)
 * A film that disagrees with its own caption panel is worse than one with no
 * caption: the reader has to work out which half to believe.
 *
 * One tally, three readers: this banner, the note, and the per-room stage
 * name/why/chip in plan.mjs. `lateRoadDecomp` and `LATE_KINDS` live in
 * layer-walls.mjs, beside the pass that records the provenance.
 */
function lateWhat(plan) {
  const d = lateRoadDecomp(plan);
  const unnamed = d.laid - d.named;
  if (!d.kinds.length) return LATE_KINDS.unclassified.name;
  const names = d.kinds.map((k) => LATE_KINDS[k].name);
  if (unnamed) names.push(LATE_KINDS.unclassified.name);
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

function roadProvenance(plan) {
  const map = plan.meta?.roadLayer || null;
  const final = plan.structures.road || [];
  const byLayer = new Map();
  const residual = [];
  const pruned = [];
  const put = (layer, tile) => {
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer).push(tile);
  };
  if (!map) {
    // No provenance in the plan (an older pipeline). Everything is residual
    // and the banner says the attribution is missing — silently reverting to
    // "they are all layer 1" is exactly the claim this whole block exists to
    // stop making.
    return { byLayer, residual: final.slice(), pruned, attributed: false };
  }
  // final roads first, in the array's own BFS build order — that order is a
  // build order the live bot honours, and it makes the web grow outward
  const alive = new Set();
  for (const r of final) {
    const k = `${r.x},${r.y}`;
    alive.add(k);
    const layer = map[k];
    if (ROAD_STAGE[layer]) put(layer, r);
    else residual.push(r);
  }
  // then the ghosts: tagged by a layer, absent from the shipped plan
  for (const k of Object.keys(map)) {
    if (alive.has(k)) continue;
    const [x, y] = k.split(",").map(Number);
    const layer = map[k];
    const tile = { x, y };
    pruned.push(tile);
    if (ROAD_STAGE[layer]) put(layer, tile);
    else residual.push(tile);
  }
  return { byLayer, residual, pruned, attributed: true };
}

/** emit one layer's roads, in place, at the moment that layer ran */
function emitRoads(sb, rp, layer, plan) {
  const tiles = rp.byLayer.get(layer) || [];
  if (!tiles.length) return;
  const [stage, staticWhat] = ROAD_STAGE[layer];
  // layer 7's banner is the room's own tally, not a row in a table — see lateWhat
  const what = layer === 7 ? lateWhat(plan) : staticWhat;
  chunked(sb, stage, tiles, ROAD_CHUNK, "#d8d8d8", (a, b, n) => `layer ${layer} roads ${b}/${n} — ${what}`);
}

// --- main -----------------------------------------------------------------

/** Flatten a finished plan into the ordered step list. */
export function buildAnim(room, terrain, plan) {
  const palette = makePalette();
  const sb = makeSteps(palette);

  stageDt(sb, terrain, distanceTransform(terrain));

  stageFields(sb, terrain, [
    ...plan.sources.map((p, i) => ({ pos: p, name: `source ${i + 1}` })),
    { pos: plan.controller, name: "controller" },
  ]);

  sb.push("seed", `seed (${plan.seed.x},${plan.seed.y}) — confluence winner`, sb.flat([plan.seed], "#ffff33"));
  stageBasin(sb, terrain, plan.seed);
  sb.push("core", `core — ${plan.core.length} pocket tiles`, sb.flat(plan.core, "#66ff88"));
  stageClaims(sb, plan);

  // Roads are now emitted BY THE LAYER THAT LAID THEM, interleaved with that
  // layer's structures, rather than as one pre-wall lump. See roadProvenance.
  const rp = roadProvenance(plan);

  emitRoads(sb, rp, 1, plan);

  // OM4 (round 21) — every rampart under its own job, in the same sweep. See
  // rampartClassifier: the counter used to say "min-cut wall b/n" over the
  // WHOLE rampart set, which is false of 974 of this fleet's 8208 ramparts and
  // inflates the wall's own count in 171 rooms.
  const rampartClass = rampartFacets(plan, terrain);
  const ramparts = plan.structures.rampart;
  // the room's own census, keyed on the CAPTION rather than on the class, so a
  // counter says "40 of the 50 tiles this caption is true of" — see rampartFacets
  const rampartTotal = new Map();
  const rampartFacetTotal = new Map();
  /** facet -> (caption -> count): what the census below has to account for */
  const rampartFacetCaptions = new Map();
  if (ramparts && ramparts.length) {
    const sweep = sweepOrder(ramparts, plan.hub || plan.seed);
    const done = new Map();
    for (const t of sweep) {
      const k = `${t.x},${t.y}`;
      const w = rampartClass.captionOf(k);
      const f = rampartClass.facetOf(k);
      rampartTotal.set(w, (rampartTotal.get(w) || 0) + 1);
      rampartFacetTotal.set(f, (rampartFacetTotal.get(f) || 0) + 1);
      if (!rampartFacetCaptions.has(f)) rampartFacetCaptions.set(f, new Map());
      const m = rampartFacetCaptions.get(f);
      m.set(w, (m.get(w) || 0) + 1);
    }
    // consecutive same-caption stretches of the sweep: the paint order is exactly
    // the order it was, and no chunk can mix two jobs under one caption
    let run = [];
    let runWhat = null;
    const flush = () => {
      if (!run.length) return;
      const what = runWhat;
      chunked(sb, "ramparts", run, RAMPART_CHUNK, "#4dff9e", (a, b) => {
        done.set(what, (done.get(what) || 0) + (b - a));
        return `${what} ${done.get(what)}/${rampartTotal.get(what)}`;
      });
      run = [];
    };
    for (const t of sweep) {
      const what = rampartClass.captionOf(`${t.x},${t.y}`);
      if (what !== runWhat) {
        flush();
        runWhat = what;
      }
      run.push(t);
    }
    flush();
  }
  // ------------------------------------------------------------------
  // OM2 (round 22) — THE ACROSS-PRIOR SWAP IS DRAWN, AND THE TILE IT CAME FROM
  // IS ON SCREEN.
  //
  // `maybeTakeTowerSwap` moves a tower AFTER layer 3 has finished — three rooms
  // in this fleet — and this stage painted the tile it moved the tower TO under
  // "tower n/6 — shell set-cover", which is a caption naming a pass that did not
  // choose that tile. Layer 3's own pick was never on screen in any frame, so
  // the one channel a reader watches to see what the planner did showed the
  // swap's OUTPUT attributed to the search it overrode, and the swap itself not
  // at all. (E3S1's priced REFUSAL is silent here too, and always will be: a
  // refusal moves no tile and there is nothing to draw. It has a note now.)
  //
  // Same shape as layer 6's relocation, and for the same reason: the pre-swap
  // tile is PAINTED as a ghost on the ghost canvas and a later beat ERASES it,
  // so the last frame still equals the shipped plan tile for tile while the move
  // is legible. The swapped tower's own caption in the `towers` stage says what
  // moved it and what it bought.
  // ------------------------------------------------------------------
  const towerList = plan.structures.tower || [];
  const swapTake = plan.meta?.towers?.acrossPriorTake?.taken || null;
  const swapIdx =
    swapTake && swapTake.from && swapTake.to
      ? towerList.findIndex((t) => t.x === swapTake.to.x && t.y === swapTake.to.y)
      : -1;
  const swapBought =
    swapTake && swapTake.why === "clump"
      ? "retire this room's tower-clump declaration"
      : "lift the weakest tile of the wall";
  if (swapIdx >= 0) {
    sb.push(
      "towerGhost",
      `tower ${swapIdx + 1}/${towerList.length} — layer 3's own set-cover pick at ` +
        `${swapTake.from.x},${swapTake.from.y}, before the across-prior swap moved it`,
      sb.flat([swapTake.from], "#ff8899"),
    );
  }
  for (let i = 0; i < towerList.length; i++) {
    const t = towerList[i];
    sb.push(
      "towers",
      i === swapIdx
        ? `tower ${i + 1}/${towerList.length} — MOVED HERE after layer 3 finished: the across-prior swap ` +
          `took ${swapTake.from.x},${swapTake.from.y} -> ${swapTake.to.x},${swapTake.to.y} to ${swapBought}`
        : `tower ${i + 1}/${towerList.length} — shell set-cover`,
      sb.flat([t], "#ff8844"),
    );
  }
  if (swapIdx >= 0) {
    sb.push(
      "towerMove",
      `the across-prior swap: ${swapTake.from.x},${swapTake.from.y} -> ${swapTake.to.x},${swapTake.to.y}, ` +
        `taken to ${swapBought} — layer 3's tile is vacated, and the room was re-composed from layer 1 ` +
        `with the swap held before it was kept`,
      sb.flat([swapTake.from], "#ff4444"),
    );
  }
  // AFTER the towers: planTowers returns the tower tiles and their refill
  // spurs from one call, and a spur to a tower that is not there yet is not a
  // thing that ever happened.
  emitRoads(sb, rp, 3, plan);

  if (plan.structures.lab?.length) {
    chunked(sb, "labs", plan.structures.lab, 2, "#cc66ff", (a, b, n) => `lab diamond ${b}/${n}`);
  }
  // AFTER the labs, and this one is load-bearing: layer 4 rejects a lab anchor
  // whose diamond touches the road network, so the frame in which the labs
  // land must show the road set MINUS layer 4's own access road. That frame is
  // the evidence for a "0 dry anchors" declaration.
  emitRoads(sb, rp, 4, plan);

  for (const n of plan.structures.nuker || []) {
    sb.push("nuker", "nuker — deep, hugging the hub (300k energy to haul)", sb.flat([n], "#ff5566"));
  }
  for (const o of plan.structures.observer || []) {
    sb.push("observer", "observer — needs no access, takes the far leftover tile", sb.flat([o], "#66ddff"));
  }
  for (const e of plan.structures.extractor || []) {
    sb.push("extractor", "extractor — built ON the mineral, the one object tile we may use", sb.flat([e], "#e0a6ff"));
  }
  emitRoads(sb, rp, 5, plan);

  // BEFORE the extensions, unlike every other layer's roads. Layer 6 digs a
  // corridor and then hangs extensions off its faces — "every one of them D4
  // on a road" is the layer's own guarantee — so a corridor that appeared
  // after its extensions would invert cause and effect. Within layer 6 the two
  // passes actually interleave; splitting them into corridor-then-mass is an
  // approximation, and it is contained inside one layer rather than spanning
  // six, which is the difference between rounding and lying.
  emitRoads(sb, rp, 6, plan);

  // --- layer 6's relocation pass, drawn as MOVES ---------------------------
  /**
   * A MOVE THAT IS ONLY EVER SHOWN AT ITS DESTINATION IS NOT A MOVE.
   *
   * `meta.extensions.relocated` records every shallow slot layer 6's fill took
   * and then vacated for a deep, road-faced tile — the fleet totals for both
   * relocation passes are printed by plan.mjs at the end of a run and are not
   * typed here (round 19: the pair that was, and the five origin->destination
   * pairs quoted for E11S7, were stale; that room declares seven and four of the
   * five quoted coordinates were wrong).
   * The film painted every one of those extensions at its FINAL tile, first
   * time, as if the pass had never run — while the room's own mobility shortfall
   * names that pass as the reason its lane bound moved, and the film showed no
   * extension at any of the origins at any frame. The
   * one pass a room blames for its worst number was invisible in the record
   * of what the room did.
   *
   * Same shape as the layer-7 road prune: the tile is PAINTED where the pass
   * first put it (a ghost), and a later beat ERASES it. That keeps the last
   * frame equal to the shipped plan while making the move legible, and it is
   * the only rendering in which the origin tile is ever on screen.
   *
   * WHY THE GHOSTS GET THEIR OWN CANVAS (plan.mjs `animGhost`). The erase is a
   * clearRect, and a clearRect takes whatever else is on that canvas with it —
   * the same trap that gave the roads their own layer. Some origins are ROADS in
   * the shipped plan, and putting
   * the ghosts on the structures canvas would also have let the erase reach an
   * extension that later lands on the same tile.
   *
   * APPROXIMATION, DECLARED: the ghosts are emitted at the head of the mass
   * rather than at the exact placement inside it, and the destinations are
   * emitted with the rest of the mass rather than at the move. Both are
   * contained inside layer 6's own pass — the same rounding the corridor split
   * above declares, and the same reason: it does not move work between layers.
   *
   * TWO PASSES RELOCATE, AND BOTH ARE DRAWN. Layer 6 moves what it can see; the
   * post-prune reflow (layer 7b, `meta.extensions.reflow.moved`) moves what only
   * exists once the dead-end prune has handed the corridor back as floor, and it
   * is no smaller than layer 6's own pass — the two fleet totals are printed
   * side by side at the end of a run. Drawing one and not the other would put
   * the same lie back, one layer
   * later. Layer 7b's moves are tagged so the caption can say which pass moved
   * the slot and, when the move bought a road face, that it paved one tile.
   */
  const relocated = [
    ...(plan.meta?.extensions?.relocated || [])
      .filter((r) => r && r.from && r.to)
      .map((r) => ({ ...r, pass: 6 })),
    ...(plan.meta?.extensions?.reflow?.moved || [])
      .filter((r) => r && r.from && r.to)
      .map((r) => ({ ...r, pass: 7 })),
  ];
  // ------------------------------------------------------------------
  // WHICH PASS, AND HOW DEEP — DERIVED, NOT ASSUMED (OM2, round 20).
  //
  // `reflow.moved` is THREE passes' worth of moves, tagged by the producer with
  // `reason`: the post-prune reflow proper (untagged), the second-target rescue
  // for a slot the lap ceiling refused (`second-target`), and the MOBILITY
  // REPAIR the lift test licenses (`mobility`, `reflow.mobilityRepair`). The
  // film called all of them "the post-prune reflow", and it called every origin
  // a "shallow slot". Both are false of E17S8, whose two moves are mobility
  // repairs out of DEEP origins (depth 5 and 4) — the film narrated the wrong
  // pass and the wrong reason on the only room in the fleet where the mobility
  // repair actually moved anything.
  //
  // The pass name comes off `reason`; the depth comes off `fromDepth`/`toDepth`,
  // which layer 7b publishes per move and the validator re-derives. Layer 6's
  // own relocation pass publishes no depth because it is defined by it — its
  // whole loop is "shallow slot -> deep, road-faced tile" — so its ghosts keep
  // the structural word and pass-7 ghosts get the measured one.
  // ------------------------------------------------------------------
  const passName = (r) =>
    r.pass !== 7
      ? "relocation pass"
      : r.reason === "mobility"
        ? "mobility repair (layer 7b, licensed by the lift test)"
        : r.reason === "second-target"
          ? "post-prune reflow, second target"
          : "post-prune reflow";
  const slotWord = (r) => {
    if (r.pass !== 7 || typeof r.fromDepth !== "number") return "shallow slot";
    return r.fromDepth < DEPTH_SAFE ? `shallow slot (depth ${r.fromDepth})` : `deep slot (depth ${r.fromDepth})`;
  };
  for (const r of relocated) {
    sb.push(
      "extGhost",
      `${slotWord(r)} (${r.from.x},${r.from.y}) — the fill took this tile before the ${passName(r)} ran`,
      sb.flat([r.from], "#ff8899"),
    );
  }

  // ------------------------------------------------------------------
  // THE ERASE HAS TO COME BEFORE THE PAINT, ON THE TILES WHERE BOTH HAPPEN.
  //
  // This file asserts, over the layer-7 block below, that "the prune is drawn as
  // an erase ... so the last frame still equals the shipped plan exactly". It did
  // not: the `roadsPrune` erase is a clearRect in #ff4444 and it ran AFTER the
  // `extensions` stage painted, so every pruned stub road that layer 7b then
  // stood an extension on ended the film rendered as ERASED, in rooms right
  // across the fleet. The caption on those very moves says "lifting the stub road
  // that was there", which is the film narrating the thing it then drew
  // backwards. (The tile and room counts, and the per-room roster, were typed
  // here when the bug was found and went stale with the fleet; the set is
  // `pruneUnderStructure` below and it is recomputed per room every run.
  // Round 20, criticism 80.)
  //
  // Splitting the prune is the honest fix rather than moving the whole stage:
  // the tiles a shipped structure ends up on are erased HERE, immediately before
  // the mass paints over them, and the rest — the great majority, road that
  // simply goes away — stays in layer 7 where it belongs. Nothing is drawn out
  // of layer order except the tiles whose whole point is that layer 6 and layer
  // 7 both touched them.
  // ------------------------------------------------------------------
  const shippedOccupied = new Set();
  for (const t of Object.keys(plan.structures || {})) {
    if (t === "road" || t === "rampart") continue;
    for (const p of plan.structures[t] || []) shippedOccupied.add(`${p.x},${p.y}`);
  }
  const pruneUnderStructure = rp.pruned.filter((t) => shippedOccupied.has(`${t.x},${t.y}`));
  const pruneClean = rp.pruned.filter((t) => !shippedOccupied.has(`${t.x},${t.y}`));
  if (pruneUnderStructure.length) {
    chunked(
      sb,
      "roadsPrune",
      pruneUnderStructure,
      ROAD_CHUNK,
      "#ff4444",
      (a, b, n) =>
        `dead-end prune ${b}/${n} — stub road lifted for the structure that is about to stand on it`,
    );
  }

  // ------------------------------------------------------------------
  // LAYER 7b ADDS, CAPTIONED. `extGhost`/`extMove` draw the MOVES of both
  // relocation passes and nothing drew the ADDS — the backfill 7b runs when the
  // prune hands back deep floor and the room is still short of 60. E9S2 is the
  // only room in the fleet that adds without moving, and its four 7b extensions
  // were painted anonymously inside the plain `extensions` chunk: the single
  // room whose 60/60 depends entirely on layer 7b was also the single room in
  // which layer 7b was invisible. They come out of the mass here and get their
  // own beat below, at the moment they actually happen.
  // ------------------------------------------------------------------
  const reflowAdds = (plan.meta?.extensions?.reflow?.added || []).filter((a) => a && typeof a.x === "number");
  const addKeys = new Set(reflowAdds.map((a) => `${a.x},${a.y}`));
  const massExtensions = (plan.structures.extension || []).filter((e) => !addKeys.has(`${e.x},${e.y}`));
  if (massExtensions.length) {
    chunked(
      sb,
      "extensions",
      massExtensions,
      EXT_CHUNK,
      "#ffd24d",
      (a, b, n) => `extensions ${b}/${n} — fill the protected space`,
    );
  }

  // ------------------------------------------------------------------
  // WHERE A LAYER-7b MOVE LANDED, DECIDED PER MOVE FROM THE PLAN.
  //
  // Every pass-7 move used to get "[layer 7b, on floor the dead-end prune
  // handed back]" appended unconditionally, and for most of them it is false.
  // The three ways a 7b slot reaches its tile are genuinely different: the prune
  // deleted a road and handed the floor back (meta.roadLayer tags the tile and
  // the shipped plan has no road there, which is what "the prune handed it back"
  // means); or the move PAVED its own road face onto floor that was simply free,
  // which the move record's own `paved` field says; or the tile was already free
  // AND already road-faced and neither prune nor paving was involved.
  //
  // rp.pruned is the same set the roadsPrune stage erases on screen, so this
  // tag is checkable against the film frame by frame rather than asserted. The
  // three tests are applied in that order and each move lands in exactly one
  // bucket; the `paved` clause below still prints the paved tile in every case,
  // so precedence here loses no fact. (The fleet-wide split across those three
  // buckets, and the worked per-room example that stood here, were hand-typed
  // and both had gone stale by round 20 — the fleet grew and layer 7b's move
  // count grew with it. plan.mjs prints the live split in the ext-relocations
  // line of the fleet summary at the end of a run. Criticism 80.)
  //
  // NOT USED, deliberately: `reflow.spentOnMoves`. It is the reflow's own
  // budget counter and not a count of prune-freed destinations — rooms spend
  // more of it than they have prune-freed tiles — so tagging a tile from it
  // would be exactly the unchecked assertion this block replaces.
  // ------------------------------------------------------------------
  const prunedKeys = new Set(rp.pruned.map((t) => `${t.x},${t.y}`));
  // OM3 (round 20) — the three sets a claim about a road has to be checked
  // against. `shippedRoadKeys` is the last frame; `prunedKeys` is what the film
  // erases; `everPrunedKeys` adds the tiles laid and deleted inside layer 7,
  // which the room publishes but no frame ever draws.
  const shippedRoadKeys = new Set((plan.structures?.road || []).map((t) => `${t.x},${t.y}`));
  const everPrunedKeys = new Set([
    ...prunedKeys,
    ...(plan.meta?.walls?.prunedTiles || []).map((t) => `${t.x},${t.y}`),
  ]);
  const shippedFacesOf = (p) =>
    D4.map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }))
      .filter((q) => shippedRoadKeys.has(`${q.x},${q.y}`))
      .map((q) => `${q.x},${q.y}`);

  // ...and now the origins are vacated, one labelled move at a time. A room
  // with relocatedCount 0 emits nothing here and never gets the stage (push
  // ignores an empty cell list, and meta.stageOrder is built from the steps).
  // ------------------------------------------------------------------
  // THE RETIREMENT IS A MEMBERSHIP TEST, NOT A CONSEQUENCE (OM2, round 20).
  //
  // `depth d1 → d2, retiring the personal rampart` was appended to every pass-7
  // move unconditionally, and layer 7b keeps the actual answer: `rampartsRetired`
  // is the list of ORIGIN tiles whose rampart it took off the board, and it
  // retires one only when the shipped board proves it is doing nothing else —
  // nothing that needs depth stands on it, it is not on the published cut, not a
  // bubble seat, not part of the stand-denial ring, and removing it does not move
  // one tile of the exterior. Three of the fleet's pass-7 captions were false:
  // E17S8's two moves come out of DEEP origins that never rented a rampart at
  // all, and E2S5's 22,42 is a MIN-CUT WALL rampart — painted by this same film's
  // ramparts stage, standing in its own last frame, and precisely the one move
  // layer 7b left OUT of `rampartsRetired`. The producer knew; the caption did
  // not ask.
  // ------------------------------------------------------------------
  const retiredKeys = new Set(
    (plan.meta?.extensions?.reflow?.rampartsRetired || []).map((t) => `${t.x},${t.y}`),
  );
  // ...and WHICH job the surviving rampart is doing, named off the shipped board
  // rather than listed as possibilities. E2S5's 22,42 is the case that made this
  // finding: it is a MIN-CUT WALL tile, painted by this same film's ramparts
  // stage and standing in its own last frame, under a caption that said the move
  // had retired it.
  // ...and it is the SAME classification the ramparts stage paints with (OM4,
  // round 21): one membership test in the shipped board, read by both callers,
  // so the stage and this caption cannot disagree about a tile the way E9S2's
  // 33,4 did — painted "min-cut wall" up there and narrated as a rented
  // personal rampart down here, in one film.
  const rampartJob = rampartClass.job;
  for (const r of relocated) {
    const d = r.closer;
    // layer 7b publishes the two depths instead of a hub-walk delta, because the
    // whole point of its move is the depth: a slot at depth < DEPTH_SAFE rents a
    // personal rampart forever and a slot at depth >= DEPTH_SAFE does not. What
    // the move then does about that rampart is read off `rampartsRetired`.
    const rampartClause = retiredKeys.has(`${r.from.x},${r.from.y}`)
      ? ", retiring the personal rampart the origin was renting"
      : typeof r.fromDepth === "number" && r.fromDepth >= DEPTH_SAFE
        ? ", both slots deep — this move buys no rampart back, and layer 7b did not move it for one"
        : `, and the rampart on the origin STAYS: layer 7b retires one only when the shipped board ` +
          `proves it is doing nothing else, and here ${rampartJob(`${r.from.x},${r.from.y}`)}`;
    const trade =
      r.pass === 7
        ? `depth ${r.fromDepth} → ${r.toDepth}${rampartClause}`
        : d > 0
          ? `${d} step${d === 1 ? "" : "s"} nearer the hub`
          : d < 0
            ? `${-d} step${d === -1 ? "" : "s"} farther out`
            : "no change in hub walk";
    // ----------------------------------------------------------------
    // WHAT `tookStub` IS, AND WHY THE CAPTION MAY NOT SAY "LIFTING THE STUB
    // ROAD THAT WAS THERE".
    //
    // layer-ext.mjs sets `tookStub: !!t.paved` on a layer-6 relocation: the
    // DESTINATION tile carried a corridor stub in layer 6's own working
    // `pavedTiles`/`roadSet`, and the relocation deletes that stub in the same
    // breath as it stands the extension on it. The delete happens INSIDE layer
    // 6's pass, before pipeline.mjs takes the layer's road set, so the stub
    // never reaches `meta.roadLayer` and never reaches `structures.road`.
    //
    // Measured over the shipped fleet rather than guessed, when the defect was
    // found and again every round since: very nearly every layer-6 relocation
    // carries tookStub, and for every one of those the destination has no
    // meta.roadLayer entry, is not a shipped road, and is not painted by any
    // roads* step of any film. So the old caption narrated a road being lifted
    // off a tile on which no frame of any film has ever drawn a road, and it did
    // it on the one artifact whose entire selling point is "this is what
    // actually happened". (The two counts were typed here and had gone stale by
    // round 20; plan.mjs prints them live in the ext-relocations line of the
    // fleet summary. Criticism 80.)
    //
    // The lift is real; it is just not visible, and it is not free. The tile
    // was reserved corridor the worst-case lane model counted as WALKABLE, so
    // layer 6 re-derives its own bound with the lifted stubs blocked
    // (`laneMeta.boundBeforeStubs` -> `laneMeta.bounded`; E11S7 lifts five and
    // goes 12 -> 14). That is what the viewer can check, so that is what the
    // caption says.
    // ----------------------------------------------------------------
    // ...AND THE PAVE IS CHECKED AGAINST THE SHIPPED BOARD (OM3, round 20).
    //
    // "paving X,Y to give it a road face" was printed from the move record's own
    // `paved` field and never asked whether that tile SURVIVED. At round 20 three
    // of the fleet's paved captions named a tile in no shipped plan and on no
    // frame of any film: E2S5 paved 30,23 · 32,23 · 34,23 for three 7b moves and
    // the dead-end prune took all three straight back — they are in the room's
    // own `meta.walls.prunedTiles` — while the extensions ship their faces on
    // entirely different roads. The same caption then asserted "the prune freed
    // nothing here" in the room whose pruned list contains the tile it had just
    // named. `tookStub` above got exactly this fix in round 19 (a road narrated
    // as lifted off a tile no frame ever drew a road on); `paved` did not, and
    // it is the same defect with the sign flipped — a road narrated as laid on a
    // tile no frame ever kept.
    //
    // So the pave is a claim about the shipped board and is read off it: the
    // shipped roads, and the tiles the prune took back (rp.pruned is the set the
    // roadsPrune stage erases on screen; `meta.walls.prunedTiles` also holds the
    // ones laid and deleted INSIDE layer 7, which never reach a frame at all).
    // When the pave did not survive, the caption names the face the slot
    // actually ships instead — which is the fact a viewer of the last frame can
    // check, and the only honest thing to say about a road that is not there.
    // ----------------------------------------------------------------
    const paveKey = r.paved ? `${r.paved.x},${r.paved.y}` : null;
    const paveShipped = paveKey !== null && shippedRoadKeys.has(paveKey);
    const paveClause = !r.paved
      ? ""
      : paveShipped
        ? `, paving ${r.paved.x},${r.paved.y} to give it a road face`
        : `, paving ${r.paved.x},${r.paved.y} for a road face that is NOT on the shipped board — ` +
          (prunedKeys.has(paveKey)
            ? `the dead-end prune took it back on screen`
            : everPrunedKeys.has(paveKey)
              ? `it was laid and deleted inside layer 7, so no frame of this film ever carries it`
              : `no later pass kept it`) +
          `, and the slot ships its road face on ` +
          (shippedFacesOf(r.to).join(" / ") || "no D4 road at all");
    const where =
      r.pass !== 7
        ? ""
        : prunedKeys.has(`${r.to.x},${r.to.y}`)
          ? " [layer 7b, on floor the dead-end prune handed back — this tile was road until the prune deleted it]"
          : r.paved && paveShipped
            ? " [layer 7b, on deep floor that was already free; the move had to pave its own road face, so the prune freed nothing here]"
            : r.paved
              ? " [layer 7b, on deep floor that was already free; the face this move paved for itself did not survive, so what the slot ships is a face it did not have to buy]"
              : " [layer 7b, on deep floor that was already free and already road-faced — neither prune nor paving involved]";
    sb.push(
      "extMove",
      `relocate (${r.from.x},${r.from.y}) → (${r.to.x},${r.to.y}) — onto deep floor, ${trade}` +
        (r.tookStub
          ? ", taking back a corridor stub layer 6 paved earlier in this same pass — it is in no shipped plan " +
            "and no frame of this film, and what it costs is the lane bound, re-measured with it blocked"
          : "") +
        paveClause +
        where,
      sb.flat([r.from], "#ff4444"),
    );
  }

  // LAYER 7, in pipeline order: the prune deletes first, then the late roads
  // are pushed. The prune is drawn as an erase (the player clears the tile) so
  // the last frame still equals the shipped plan exactly — which is now true,
  // because the tiles a structure ends up on were erased before the mass painted
  // over them (see the split above).
  if (pruneClean.length) {
    chunked(
      sb,
      "roadsPrune",
      pruneClean,
      ROAD_CHUNK,
      "#ff4444",
      (a, b, n) => `dead-end prune ${b}/${n} — road that led nowhere once every layer was in`,
    );
  }
  // ...and NOW the backfill layer 7b ran on the floor that prune just freed.
  // ------------------------------------------------------------------
  // OM5 (round 21) — "THE FLOOR THE PRUNE HANDED BACK" WAS AN ASSERTION ABOUT
  // TEN TILES THE PRUNE NEVER TOUCHED.
  //
  // Every deep 7b add carried `on deep road-faced floor the dead-end prune
  // handed back`, unconditionally — the same defect the MOVES above had fixed
  // one block earlier and by the same test. On this fleet 19 deep adds ship and
  // 10 of them sit on floor no road of this plan ever occupied: the tile has no
  // `meta.roadLayer` entry at all, so nothing was ever laid there to prune. The
  // prune-freed nine are real (E5S3 25,27 / 24,28, E9S2 35,11 / 37,13 / 36,14 /
  // 35,15, E9S7 35,4 / 37,9 / 32,4) and they are the ones that can say it.
  //
  // The second half is `paved`. An add carries the same field a move does — the
  // road face it bought itself — and the stage printed neither the field nor its
  // fate. E5S3 paves 33,8 for the add at 32,8 and 35,10 for the add at 35,9, and
  // NEITHER tile is on the shipped board: the room's own extensions ship their
  // faces on other roads, and the film said nothing at all. That is OM3's defect
  // (a road narrated as laid on a tile no frame ever kept) in the one stage OM3
  // did not reach. So the add's pave is read off the shipped board exactly the
  // way the move's is, and "road-faced" stops being an adjective and becomes the
  // D4 road tiles the slot actually ships, named.
  // ------------------------------------------------------------------
  for (const a of reflowAdds) {
    const deep = typeof a.depth !== "number" || a.depth >= 4;
    const addKey = `${a.x},${a.y}`;
    const provenance = prunedKeys.has(addKey)
      ? `floor the dead-end prune handed back — this tile carried a road until the prune deleted it, ` +
        `and this film erases it on screen a beat ago`
      : everPrunedKeys.has(addKey)
        ? `floor a layer-7 road held and gave up before any frame of this film drew it — the room ` +
          `publishes the tile in meta.walls.prunedTiles`
        : `floor NO road of this plan ever occupied: it carries no meta.roadLayer tag, so the prune ` +
          `handed this slot nothing — the tile was simply free`;
    const addPaveKey = a.paved ? `${a.paved.x},${a.paved.y}` : null;
    const addPaveShipped = addPaveKey !== null && shippedRoadKeys.has(addPaveKey);
    const addPaveClause = !a.paved
      ? ``
      : addPaveShipped
        ? `, paving ${addPaveKey} to give it a road face`
        : `, paving ${addPaveKey} for a road face that is NOT on the shipped board — ` +
          (prunedKeys.has(addPaveKey)
            ? `the dead-end prune took it back on screen`
            : everPrunedKeys.has(addPaveKey)
              ? `it was laid and deleted inside layer 7, so no frame of this film ever carries it`
              : `no later pass kept it`);
    const addFaces = shippedFacesOf(a);
    sb.push(
      "extAdd",
      `layer 7b adds an extension at (${a.x},${a.y})` +
        (typeof a.depth === "number" ? ` — depth ${a.depth}` : "") +
        (deep
          ? `, on deep ${provenance}`
          : `, and it is SHALLOW: the priced ladder had no deep tile left, so this one rents a ` +
            `personal rampart forever to close the count — it stands on ${provenance}`) +
        addPaveClause +
        `; the road face it ships is ${addFaces.join(" / ") || "NO D4 road at all"}` +
        `; this room was ${reflowAdds.length} extension(s) short of ${EXT_TARGET_ANIM} before this pass`,
      sb.flat([a], "#ffd24d"),
    );
  }
  emitRoads(sb, rp, 7, plan);

  if (rp.residual.length) {
    chunked(
      sb,
      "roadsResid",
      rp.residual,
      ROAD_CHUNK,
      "#d8d8d8",
      (a, b, n) =>
        `UNATTRIBUTED roads ${b}/${n} — ${rp.attributed ? "no meta.roadLayer entry for these tiles" : "this plan carries no meta.roadLayer at all"}`,
    );
  }

  // meta is additive — old players ignore it and fall back to a flat rate.
  const present = [];
  for (const s of sb.steps) if (!present.includes(s.stage)) present.push(s.stage);
  /**
   * A STAGE THAT EXISTS IN ONE TABLE AND NOT THE OTHERS IS THE STANDING BUG OF
   * THIS FILE, AND THE `??` DEFAULTS BELOW ARE WHAT HID IT EVERY TIME.
   *
   * The stage vocabulary is written out by hand in five places — the emitters
   * here, STAGE_RATES, STAGE_SCAFFOLD, and (over in plan.mjs, inside the player
   * script) STAGE_INFO / STAGE_KIND / EXPAND. Every single time a stage has been
   * added, at least one of the six was missed, and every single time the miss was
   * SILENT: `STAGE_RATES[s] ?? 1` gives the new stage a plausible pace, `?? false`
   * gives it a plausible canvas, a missing STAGE_KIND entry gave extAdd 21 flat
   * yellow squares in the last frame, and a missing EXPAND entry gave `seed` a
   * HUD reading of "≈1.1 bands/sec here" for a stage that paints ONE TILE.
   * Plausible-but-wrong is the worst failure mode a film about honesty can have.
   *
   * So the defaults stop being a quiet fallback and become an assertion. This
   * THROWS rather than warning: a fleet run is the whole claimable world and a warning on room 1
   * scrolls off long before the run ends, whereas the fix is always one line in a
   * table twenty lines up. The three tables the player owns cannot be reached
   * from here (they live in a template string in plan.mjs and are checked in the
   * browser against the stageScaffold map this very block writes — see the
   * EXPAND drift check in plan.mjs), so this covers the two that are ours.
   */
  const orphan = present.filter((s) => !(s in STAGE_RATES) || !(s in STAGE_SCAFFOLD));
  if (orphan.length) {
    throw new Error(
      `export-anim: stage(s) [${orphan.join(", ")}] are emitted but missing from ` +
        `STAGE_RATES and/or STAGE_SCAFFOLD in this file. Add them there (and check ` +
        `STAGE_INFO / STAGE_KIND / EXPAND in plan.mjs, which the player owns) — a ` +
        `defaulted stage films at the wrong pace on the wrong canvas and says nothing about it.`,
    );
  }
  const stageRates = {};
  const stageScaffold = {};
  for (const s of present) {
    stageRates[s] = STAGE_RATES[s];
    stageScaffold[s] = STAGE_SCAFFOLD[s];
  }

  // OB1 (round 25) — THE RAMPART TAXONOMY, DECLARED, INCLUDING THE CLASSES THAT
  // TOOK NOTHING. The ramparts stage paints one run per caption and a caption
  // that never fires leaves no trace, which is exactly how this film shipped a
  // class that could not fire for a whole fleet without anybody reading a wrong
  // word. Every facet is listed with the count it took in THIS room and, when
  // that count is zero, the reason it is zero — the discipline the note
  // inventory keeps for `pavingGap`. `class` is the note channel's own class
  // name (see rampartClassifier in layer-walls.mjs), so a reader — or a gate —
  // can line this census up against `meta.walls.roadRampart` tile for tile.
  const rampartCensus = RAMPART_FACET_ORDER.map((f) => {
    const n = rampartFacetTotal.get(f) || 0;
    const row = {
      facet: f,
      class: f.split(".")[0],
      count: n,
      // every caption this facet was painted under, with its own denominator —
      // `cover` names the structure renting the rampart, so one facet can carry
      // more than one caption and the counters are per caption
      captions: [...(rampartFacetCaptions.get(f) || new Map())].map(([caption, count]) => ({
        caption,
        count,
      })),
    };
    // OL2 (round 26) — the reason is DERIVED from this room's own board, and it
    // distinguishes the two causes rather than asserting one of them: a facet
    // that matched nothing, or a facet whose tiles an earlier test took.
    if (!n) row.emptyBecause = rampartClass.emptyBecause(f);
    return row;
  });
  return {
    room,
    format: "xyc-flat",
    palette: palette.toObject(),
    meta: { stageOrder: present, stageRates, stageScaffold },
    rampartCensus,
    steps: sb.steps,
    colors: palette.size,
  };
}

/** Every room the gallery has a plan for (plan.mjs writes plans-hub.json). */
function roomsFromGallery() {
  const f = path.join(OUT_V2, "plans-hub.json");
  if (!fs.existsSync(f)) {
    console.error("missing", f, "\n  run: node tools/plan-suite/v2/plan.mjs --all-claimable");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(f, "utf8"))
    .filter((p) => p && p.room && !p.error)
    .map((p) => p.room);
}

/**
 * FILMS OF ROOMS THAT ARE NOT IN THE WORLD ANY MORE.
 *
 * out-v2/anim held 203 films for a 172-room fleet: 31 of them (E11S0, E11S10,
 * E12S0, E20S1..E20S9, E21S0, E21S10 and the rest) were left over from an
 * earlier claimable list and nothing ever removed them. index.html links only
 * the current fleet, so they were invisible from the gallery — and served from
 * the gallery root, which is exactly how a reviewer ends up reading anim/E19S6
 * as evidence about a plan this suite no longer produces.
 *
 * ONLY ON A FULL-FLEET RUN. Re-rendering one room with
 * `export-anim.mjs E11S7` would otherwise delete every other room's film,
 * which is a far worse bug than the one being fixed; the caller has to have
 * asked for the whole list (--all / --all-claimable) before anything is
 * unlinked. The keep-set is the room list the run was ASKED for, not the rooms
 * it managed to write, so a room whose terrain fetch failed this run keeps its
 * film instead of being wiped by a mongo hiccup.
 *
 * AND THE FLEET FLAG IS NOT ENOUGH BY ITSELF, because --all does not read the
 * world — it reads plans-hub.json, and any `plan.mjs --rooms E9S2` overwrites
 * that file with a one-room array. That is not hypothetical: plans-hub.json was
 * observed holding exactly one room (E9S2) between two runs of this suite while
 * anim/ held 203 films. A --all run in that state believes the fleet is one
 * room and would delete 202 films on the strength of a file somebody else was
 * halfway through regenerating. So the keep-list also has to look like a fleet:
 * if it does not cover at least half the room files already on disk, this
 * refuses to delete anything and says why. A world that genuinely halves is a
 * thing the owner will want to confirm by hand; the 31 orphans this exists for
 * are 15% of the directory and clear the bar easily.
 *
 * The name pattern is a room name and nothing else — a file in this directory
 * that is not <room>.json is not this function's business.
 */
const ROOM_FILE = /^([EW]\d+[NS]\d+)\.json$/;
function pruneOrphanFilms(dir, rooms) {
  if (!fs.existsSync(dir)) return;
  const keep = new Set(rooms);
  const onDisk = fs.readdirSync(dir).filter((f) => ROOM_FILE.test(f));
  const orphans = onDisk.filter((f) => !keep.has(ROOM_FILE.exec(f)[1]));
  if (!orphans.length) {
    console.log(`anim/ carries no room outside this run's ${rooms.length}-room list — nothing to prune`);
    return;
  }
  if (orphans.length * 2 > onDisk.length) {
    console.log(
      `REFUSING TO PRUNE: this run's room list (${rooms.length}) would orphan ${orphans.length} of the ` +
        `${onDisk.length} films on disk. That is not a shrinking world, it is a stale or partial ` +
        `plans-hub.json — re-run plan.mjs --all-claimable, then this. Nothing deleted.`,
    );
    return;
  }
  for (const f of orphans) fs.unlinkSync(path.join(dir, f));
  console.log(
    `pruned ${orphans.length} stale film(s) from anim/ — not in this run's ${rooms.length}-room list: ` +
      orphans.map((f) => ROOM_FILE.exec(f)[1]).join(" "),
  );
}

async function main() {
  const args = process.argv.slice(2);
  let rooms = args.filter((a) => !a.startsWith("--"));
  const fullFleet = args.includes("--all") || args.includes("--all-claimable");
  if (fullFleet) rooms = roomsFromGallery();
  if (!rooms.length) {
    console.error("usage: node tools/plan-suite/v2/export-anim.mjs <room> [room...] | --all");
    process.exit(1);
  }
  const outDir = path.join(OUT_V2, "anim");
  fs.mkdirSync(outDir, { recursive: true });

  const data = fetchRoomsFromMongo(rooms);
  if (!data.length) {
    console.error("no terrain found in mongo for", rooms.join(","));
    process.exit(1);
  }

  let ok = 0;
  const failed = [];
  for (const d of data) {
    // SAME pipeline the gallery runs — the animation must agree with the plan
    const plan = planRoom(d);
    if (plan.error) {
      console.log(d.room, "ERROR", plan.error);
      failed.push(`${d.room}: ${plan.error}`);
      continue;
    }
    const shellErr = plan.shellError || null;

    const anim = buildAnim(d.room, d.terrain, plan);
    const colors = anim.colors;
    delete anim.colors;

    // ------------------------------------------------------------------
    // WHICH PLAN THIS FILM IS OF — stamped, so staleness is checkable.
    //
    // This file re-plans the room itself, and plan.mjs writes plans-hub.json
    // from its own run; nothing ever compared the two. A planner change between
    // the two commands leaves a whole directory of films describing a base that no longer exists,
    // under a HUD line asserting the last frame IS the shipped plan tile for
    // tile — and round 10 shipped exactly that state for 20 rooms before an
    // independent check caught it.
    //
    // mtime was tried first and is useless: plans-hub.json is rewritten on every
    // suite run, so the films are "older" the moment you re-plan, byte-identical
    // output or not. The honest comparison is CONTENT, and the content that
    // matters to a final frame is the structure lists. plan.mjs re-derives this
    // same digest from the record it wrote and says so when they differ.
    // ------------------------------------------------------------------
    anim.planHash = planStructureHash(plan);

    const file = path.join(outDir, `${d.room}.json`);
    const json = JSON.stringify(anim);
    fs.writeFileSync(file, json);

    const cells = anim.steps.reduce((n, s) => n + s.cells.length / 3, 0);
    const byStage = {};
    for (const s of anim.steps) byStage[s.stage] = (byStage[s.stage] || 0) + 1;
    console.log(
      d.room,
      `steps=${anim.steps.length}`,
      `cells=${cells}`,
      `colors=${colors}`,
      `bytes=${json.length}`,
      `segments=${Math.ceil(json.length / 95000)}`,
    );
    console.log("   stages:", JSON.stringify(byStage), shellErr ? `(no ramparts: ${shellErr})` : "");
    console.log("   ->", file);
    ok++;
  }

  const seen = new Set(data.map((d) => d.room));
  for (const r of rooms) if (!seen.has(r)) failed.push(`${r}: no terrain in mongo`);
  console.log(`\nanim written: ${ok}/${rooms.length} -> ${outDir}`);
  if (fullFleet) pruneOrphanFilms(outDir, rooms);
  if (failed.length) console.log("skipped:", failed.join(" | "));
}

main();
