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
import { OUT_V2, fetchRoomsFromMongo, walkable } from "./shared.mjs";
import { distanceTransform } from "./dt.mjs";
import { distField, growBasin } from "./layer-hub.mjs";
import { planRoom } from "./pipeline.mjs";

const MAX_FIELD_RING = 25;
const BASIN_RADIUS = 12;
const ROAD_CHUNK = 3;
const RAMPART_CHUNK = 3; // small chunks so the min-cut sweep reads as a sweep
const EXT_CHUNK = 2; // steady build rhythm
const FIELD_MERGE = 2; // rings per step — the flood is the least interesting part

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
  extensions: 1.2,
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
  extensions: false,
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
  7: ["roadsLate", "rampart spurs and the ext-face net"],
};

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
function emitRoads(sb, rp, layer) {
  const tiles = rp.byLayer.get(layer) || [];
  if (!tiles.length) return;
  const [stage, what] = ROAD_STAGE[layer];
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

  emitRoads(sb, rp, 1);

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
  emitRoads(sb, rp, 3);

  if (plan.structures.lab?.length) {
    chunked(sb, "labs", plan.structures.lab, 2, "#cc66ff", (a, b, n) => `lab diamond ${b}/${n}`);
  }
  // AFTER the labs, and this one is load-bearing: layer 4 rejects a lab anchor
  // whose diamond touches the road network, so the frame in which the labs
  // land must show the road set MINUS layer 4's own access road. That frame is
  // the evidence for a "0 dry anchors" declaration.
  emitRoads(sb, rp, 4);

  for (const n of plan.structures.nuker || []) {
    sb.push("nuker", "nuker — deep, hugging the hub (300k energy to haul)", sb.flat([n], "#ff5566"));
  }
  for (const o of plan.structures.observer || []) {
    sb.push("observer", "observer — needs no access, takes the far leftover tile", sb.flat([o], "#66ddff"));
  }
  for (const e of plan.structures.extractor || []) {
    sb.push("extractor", "extractor — built ON the mineral, the one object tile we may use", sb.flat([e], "#e0a6ff"));
  }
  emitRoads(sb, rp, 5);

  // BEFORE the extensions, unlike every other layer's roads. Layer 6 digs a
  // corridor and then hangs extensions off its faces — "every one of them D4
  // on a road" is the layer's own guarantee — so a corridor that appeared
  // after its extensions would invert cause and effect. Within layer 6 the two
  // passes actually interleave; splitting them into corridor-then-mass is an
  // approximation, and it is contained inside one layer rather than spanning
  // six, which is the difference between rounding and lying.
  emitRoads(sb, rp, 6);

  if (plan.structures.extension?.length) {
    chunked(
      sb,
      "extensions",
      plan.structures.extension,
      EXT_CHUNK,
      "#ffd24d",
      (a, b, n) => `extensions ${b}/${n} — fill the protected space`,
    );
  }

  // LAYER 7, in pipeline order: the prune deletes first, then the late roads
  // are pushed. The prune is drawn as an erase (the player clears the tile) so
  // the last frame still equals the shipped plan exactly.
  if (rp.pruned.length) {
    chunked(
      sb,
      "roadsPrune",
      rp.pruned,
      ROAD_CHUNK,
      "#ff4444",
      (a, b, n) => `dead-end prune ${b}/${n} — road that led nowhere once every layer was in`,
    );
  }
  emitRoads(sb, rp, 7);

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
  const stageRates = {};
  const stageScaffold = {};
  for (const s of present) {
    stageRates[s] = STAGE_RATES[s] ?? 1;
    stageScaffold[s] = STAGE_SCAFFOLD[s] ?? false;
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

async function main() {
  const args = process.argv.slice(2);
  let rooms = args.filter((a) => !a.startsWith("--"));
  if (args.includes("--all") || args.includes("--all-claimable")) rooms = roomsFromGallery();
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
  if (failed.length) console.log("skipped:", failed.join(" | "));
}

main();
