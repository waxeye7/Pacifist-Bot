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
import { OUT_V2, fetchRoomsFromMongo, planStructureHash, walkable } from "./shared.mjs";
import { distanceTransform } from "./dt.mjs";
import { distField, growBasin } from "./layer-hub.mjs";
import { planRoom } from "./pipeline.mjs";
import { LATE_KINDS, lateRoadDecomp } from "./layer-walls.mjs";

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
  towers: 0.4,
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
  towers: false,
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
 * E20S3's "0 dry anchors at any orientation" declaration needs the road set as
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
 * pass allowed to delete an earlier layer's road, and it deletes 1,659 tiles
 * across the fleet (12 in E20S3, matching that room's `meta.walls.pruned`).
 * Those tiles DID exist mid-pipeline, so the film draws them in the layer that
 * laid them and then a layer-7 prune stage erases them. That is what makes the
 * mid-pipeline road set recoverable from the film at every layer, which is the
 * whole complaint; dropping the ghosts would have left layer 4's road set 12
 * tiles short of what layer 4 actually saw. It is also the only reason a room
 * like E20S3 — spurTiles 0, fillerTiles 0 — gets a LAYER 7 banner at all: the
 * prune is the only layer-7 work it does, and it is real work.
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
 * "rampart spurs and the ext-face net" for all of them. 20 rooms / 39 tiles ship
 * that beat with `spurTiles` at 0 — E1S6's four tiles are swamp pre-pave,
 * E12S6's three are 7b reflow, E14S5's are along-cut swaps — so in those rooms
 * the frame banner named two passes that laid nothing while the STAGE_TEXT panel
 * beside it, composed from the same tally this now reads, named the right ones.
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

  const ramparts = plan.structures.rampart;
  if (ramparts && ramparts.length) {
    const sweep = sweepOrder(ramparts, plan.hub || plan.seed);
    chunked(sb, "ramparts", sweep, RAMPART_CHUNK, "#4dff9e", (a, b, n) => `min-cut wall ${b}/${n}`);
  }
  for (let i = 0; i < (plan.structures.tower || []).length; i++) {
    const t = plan.structures.tower[i];
    sb.push("towers", `tower ${i + 1}/${plan.structures.tower.length} — shell set-cover`, sb.flat([t], "#ff8844"));
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
   * and then vacated for a deep, road-faced tile: 78 moves across 25 rooms.
   * The film painted every one of those extensions at its FINAL tile, first
   * time, as if the pass had never run — E11S7 declares five moves (23,4->20,8
   * · 17,21->19,21 · 11,5->17,9 · 11,10->16,9 · 12,14->13,12) and its own
   * shortfall names that pass as the reason its lap went 11.5 -> 13.5, while
   * the film showed no extension at any of the five origins at any frame. The
   * one pass the room blames for its worst number was invisible in the record
   * of what the room did.
   *
   * Same shape as the layer-7 road prune: the tile is PAINTED where the pass
   * first put it (a ghost), and a later beat ERASES it. That keeps the last
   * frame equal to the shipped plan while making the move legible, and it is
   * the only rendering in which the origin tile is ever on screen.
   *
   * WHY THE GHOSTS GET THEIR OWN CANVAS (plan.mjs `animGhost`). The erase is a
   * clearRect, and a clearRect takes whatever else is on that canvas with it —
   * the same trap that gave the roads their own layer. Three origins are ROADS
   * in the shipped plan (E12S6 24,3 · E18S5 5,35 · E2S3 36,21), and putting
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
   * is now the bigger of the two — 48 moves in 16 rooms against layer 6's 80 in
   * 25. Drawing one and not the other would put the same lie back, one layer
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
  for (const r of relocated) {
    sb.push(
      "extGhost",
      `shallow slot (${r.from.x},${r.from.y}) — the fill took this tile before the ` +
        (r.pass === 7 ? "post-prune reflow" : "relocation pass") +
        ` ran`,
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
  // stood an extension on ended the film rendered as ERASED — 38 tiles across 17
  // rooms (E11S7 6, E13S2 3, E11S1 2, E12S5 2, E1S8 2, E11S2/E12S6/E17S8 1). The
  // caption on those very moves says "lifting the stub road that was there",
  // which is the film narrating the thing it then drew backwards.
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
  // E12S6 moves three slots and exactly ONE of the three (28,13) stands on a
  // tile the prune deleted — meta.roadLayer tags 28,13 as a layer-4 road and
  // the shipped plan has no road there, which is what "the prune handed it
  // back" means. The other two reached their tiles by PAVING their own road
  // face (26,11 paved 27,11 · 27,20 paved 26,20) onto floor that was simply
  // free; the move record's own `paved` field says so, and the room's own note
  // agrees with it — `reflow.freeDeepRoadFaced: 1`.
  //
  // rp.pruned is the same set the roadsPrune stage erases on screen, so this
  // tag is checkable against the film frame by frame rather than asserted.
  // Fleet-wide over the 48 pass-7 moves: 39 land on prune-freed floor, 6 paved
  // their own face, and 3 (E13S2 16,38 · 14,36 · 15,36) did neither — deep
  // floor that was already free AND already road-faced. No move is in two of
  // those buckets: the three tests are applied in that order and are disjoint
  // on the shipped fleet (0 moves are both prune-freed and paving). The `paved`
  // clause below still prints the paved tile in every case, so precedence here
  // loses no fact.
  //
  // NOT USED, deliberately: `reflow.spentOnMoves`. It is the reflow's own
  // budget counter, not a count of prune-freed destinations — E13S2 spends 6
  // against 3 prune-freed tiles — so tagging a tile from it would be exactly
  // the unchecked assertion this block replaces.
  // ------------------------------------------------------------------
  const prunedKeys = new Set(rp.pruned.map((t) => `${t.x},${t.y}`));

  // ...and now the origins are vacated, one labelled move at a time. A room
  // with relocatedCount 0 emits nothing here and never gets the stage (push
  // ignores an empty cell list, and meta.stageOrder is built from the steps).
  for (const r of relocated) {
    const d = r.closer;
    // layer 7b publishes the two depths instead of a hub-walk delta, because the
    // whole point of its move is the depth: a slot at depth < 4 rents a personal
    // rampart forever and a slot at depth >= 4 does not.
    const trade =
      r.pass === 7
        ? `depth ${r.fromDepth} → ${r.toDepth}, retiring the personal rampart`
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
    // Measured over the shipped fleet, not guessed: 98 of the 99 layer-6
    // relocations carry tookStub, and for ALL 98 the destination has no
    // meta.roadLayer entry, is not a shipped road, and is not painted by any
    // roads* step of any film (E12S6's 29,7 · 29,6 · 30,5 are three of them).
    // So the old caption narrated a road being lifted off a tile on which no
    // frame of any film has ever drawn a road, and it did it on the one
    // artifact whose entire selling point is "this is what actually happened".
    //
    // The lift is real; it is just not visible, and it is not free. The tile
    // was reserved corridor the worst-case lane model counted as WALKABLE, so
    // layer 6 re-derives its own bound with the lifted stubs blocked
    // (`laneMeta.boundBeforeStubs` -> `laneMeta.bounded`; E11S7 lifts five and
    // goes 12 -> 14). That is what the viewer can check, so that is what the
    // caption says.
    // ----------------------------------------------------------------
    const where =
      r.pass !== 7
        ? ""
        : prunedKeys.has(`${r.to.x},${r.to.y}`)
          ? " [layer 7b, on floor the dead-end prune handed back — this tile was road until the prune deleted it]"
          : r.paved
            ? " [layer 7b, on deep floor that was already free; the move had to pave its own road face, so the prune freed nothing here]"
            : " [layer 7b, on deep floor that was already free and already road-faced — neither prune nor paving involved]";
    sb.push(
      "extMove",
      `relocate (${r.from.x},${r.from.y}) → (${r.to.x},${r.to.y}) — onto deep floor, ${trade}` +
        (r.tookStub
          ? ", taking back a corridor stub layer 6 paved earlier in this same pass — it is in no shipped plan " +
            "and no frame of this film, and what it costs is the lane bound, re-measured with it blocked"
          : "") +
        (r.paved ? `, paving ${r.paved.x},${r.paved.y} to give it a road face` : "") +
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
  for (const a of reflowAdds) {
    const deep = typeof a.depth !== "number" || a.depth >= 4;
    sb.push(
      "extAdd",
      `layer 7b adds an extension at (${a.x},${a.y})` +
        (typeof a.depth === "number" ? ` — depth ${a.depth}` : "") +
        (deep
          ? `, on deep road-faced floor the dead-end prune handed back`
          : `, and it is SHALLOW: the priced ladder had no deep tile left, so this one rents a ` +
            `personal rampart forever to close the count`) +
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
   * THROWS rather than warning: a fleet run is 172 rooms and a warning on room 1
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

  return {
    room,
    format: "xyc-flat",
    palette: palette.toObject(),
    meta: { stageOrder: present, stageRates, stageScaffold },
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
 * the gallery root, which is exactly how a reviewer ends up reading anim/E20S3
 * as evidence about a plan this suite no longer produces.
 *
 * ONLY ON A FULL-FLEET RUN. Re-rendering one room with
 * `export-anim.mjs E11S7` would otherwise delete the other 171 rooms' films,
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
    // the two commands leaves 172 films describing a base that no longer exists,
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
