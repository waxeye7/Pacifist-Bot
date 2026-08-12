/**
 * Screeps structure SVGs for plan v2 gallery.
 * Assets: tools/plan-suite/assets/ (@screeps/renderer-metadata pack).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WALL, SWAMP, tileAt } from "./shared.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, "..", "assets");

const _ICON_CACHE = new Map();

function loadIconDataUri(name) {
  if (_ICON_CACHE.has(name)) return _ICON_CACHE.get(name);
  const fp = path.join(ASSETS, name);
  if (!fs.existsSync(fp)) {
    _ICON_CACHE.set(name, null);
    return null;
  }
  const buf = fs.readFileSync(fp);
  const ext = path.extname(name).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : "application/octet-stream";
  const uri = `data:${mime};base64,${buf.toString("base64")}`;
  _ICON_CACHE.set(name, uri);
  return uri;
}

function iconSprite(parts, p, cell, file, scale = 0.92) {
  const uri = loadIconDataUri(file);
  if (!uri) return;
  const pad = (cell * (1 - scale)) / 2;
  const size = cell * scale;
  parts.push(
    `<image href="${uri}" x="${p.x * cell + pad}" y="${p.y * cell + pad}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`,
  );
}

/**
 * THE PAINT IS SHARED, NOT COPIED.
 *
 * Roads and ramparts have no sprite in the asset pack — the gallery draws them
 * by hand. The animation player has to draw the same two things on a canvas,
 * and the moment those numbers are typed out twice the film and the plan start
 * to drift (a road that is grey here and blue there is a bug report waiting to
 * happen). Both renderers read these.
 */
export const ROAD_PAINT = { base: "#4a4a4a", top: "#6e6e6e", inset: 0.12, size: 0.76 };
/**
 * The floor every translucent layer is painted ON. Both renderers used to carry
 * this ternary as three inline literals; a legend swatch that has to show what
 * an alpha fill LOOKS like has to composite over the real floor, and it can
 * only do that honestly if the floor is a value and not a repeated literal.
 */
export const TERRAIN_PAINT = { wall: "#0e0e0e", swamp: "#16301a", plain: "#2c2c24" };
const terrainFill = (t) => (t & WALL ? TERRAIN_PAINT.wall : t & SWAMP ? TERRAIN_PAINT.swamp : TERRAIN_PAINT.plain);
export const RAMPART_PAINT = {
  fill: "#3f6",
  stroke: "#5f8",
  inset: 1,
  radius: 0.2,
  fillOpacity: 0.28,
  hotFillOpacity: 0.5,
  strokeOpacity: 0.8,
  strokeWidth: 0.8,
  hotStrokeWidth: 1.5,
};

function iconRoad(parts, p, cell) {
  const ox = p.x * cell,
    oy = p.y * cell;
  parts.push(
    `<rect x="${ox}" y="${oy}" width="${cell}" height="${cell}" fill="${ROAD_PAINT.base}"/>`,
  );
  parts.push(
    `<rect x="${ox + cell * ROAD_PAINT.inset}" y="${oy + cell * ROAD_PAINT.inset}" width="${cell * ROAD_PAINT.size}" height="${cell * ROAD_PAINT.size}" fill="${ROAD_PAINT.top}"/>`,
  );
}

/**
 * The hub ring's green was three literals — here, in renderThumbSvg's circle and
 * in the room-page legend swatch. One value, read by all three.
 */
export const HUB_PAINT = { stroke: "#00E676" };
function iconHub(parts, p, cell) {
  const cx = p.x * cell + cell / 2,
    cy = p.y * cell + cell / 2;
  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="${cell * 0.48}" fill="none" stroke="${HUB_PAINT.stroke}" stroke-width="${Math.max(2, cell * 0.1)}"/>`,
  );
}

/**
 * The stroke that closes the enclosure over load-bearing TERRAIN wall (the tiles
 * the min-cut takes for free). Hoisted for the same reason as the rest: the
 * room-page legend has to swatch it, and the only honest swatch is this stroke
 * at this opacity. `strokeWidth` is a factor of the cell, as the painter uses it.
 */
export const SHELL_SEAL_PAINT = { stroke: "#5f8", strokeOpacity: 0.34, strokeWidth: 0.045 };

/**
 * Faint fill for grown core pocket (debug the grow-from-room step).
 *
 * The colour and the opacity are a named constant rather than two literals in
 * this one template string, because the room-page legend has to swatch this
 * exact wash and has to read it from here to do it (see legendHtml, OL2).
 */
export const CORE_PAINT = { fill: "#00E676", opacity: 0.07 };
function iconCore(parts, core, cell, x0, y0) {
  if (!core?.length) return;
  for (const p of core) {
    const x = (p.x - x0) * cell;
    const y = (p.y - y0) * cell;
    parts.push(
      `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${CORE_PAINT.fill}" opacity="${CORE_PAINT.opacity}"/>`,
    );
  }
}

/**
 * Swatch arithmetic, so a key can show a translucent layer without anybody
 * typing out the answer.
 *
 * `alphaHex` turns a paint opacity into the CSS 8-digit suffix; `overHex`
 * flattens a fill at that opacity onto an opaque background, which is what the
 * renderer's compositor does to the same two numbers. Both take #rgb or
 * #rrggbb. A swatch built through these is wrong only if the paint is wrong.
 */
function hexRgb(h) {
  const s = h.replace("#", "");
  const w =
    s.length === 3
      ? s
          .split("")
          .map((c) => c + c)
          .join("")
      : s;
  return [0, 2, 4].map((i) => parseInt(w.slice(i, i + 2), 16));
}
const hex2 = (v) => Math.round(v).toString(16).padStart(2, "0");
/** #rgb → #rrggbb, so an alpha suffix can be appended without emitting 5-digit CSS */
function hex6(h) {
  return "#" + hexRgb(h).map(hex2).join("");
}
function alphaHex(opacity) {
  return hex2(Math.max(0, Math.min(1, opacity)) * 255);
}
function overHex(fill, opacity, bg) {
  const f = hexRgb(fill);
  const b = hexRgb(bg);
  const a = Math.max(0, Math.min(1, opacity));
  return "#" + f.map((v, i) => hex2(v * a + b[i] * (1 - a))).join("");
}

/** the dashed ring on the confluence seed — swatched by legendHtml, so: a value */
export const SEED_PAINT = { stroke: "#FFD54F" };
function iconSeed(parts, seed, cell, x0, y0) {
  if (!seed) return;
  const cx = (seed.x - x0) * cell + cell / 2;
  const cy = (seed.y - y0) * cell + cell / 2;
  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="${cell * 0.22}" fill="none" stroke="${SEED_PAINT.stroke}" stroke-width="${Math.max(1.5, cell * 0.08)}" stroke-dasharray="${cell * 0.12} ${cell * 0.08}"/>`,
  );
}

/**
 * The three dots a thumbnail draws for the room's fixed features. The thumbnail
 * key swatches source and controller, so these are read, not typed, on both
 * sides — same rule as everything else in this file. (The room pages draw these
 * three as real sprites, not dots; that legend keys the sprite.)
 */
export const MARKER_PAINT = { source: "#ffe14d", controller: "#66ccff", mineral: "#e0a6ff" };

const STRUCT_ICON = {
  extension: ["extension-border200.svg", "extension.svg"],
  storage: ["storage-border.svg", "storage.svg"],
  terminal: ["terminal-border.svg", "terminal.svg"],
  tower: ["tower-base.svg", "tower-rotatable.svg"],
  lab: ["lab.svg"],
  link: ["link-border.svg", "link.svg"],
  factory: ["factory.svg"],
  controller: ["controller.svg"],
  extractor: ["extractor.svg"],
  nuker: ["nuker.svg"],
  spawn: ["rectangle.svg", "operate-spawn.svg"],
  container: ["tombstone.svg"],
  observer: ["cover.svg"],
  source: ["harvest-energy.svg"],
  mineral: ["harvest-mineral.svg"],
};

/**
 * The exact sprite stack (file + scale) the gallery paints for a structure
 * type. Exported so the animation player can rasterise the SAME layers onto a
 * canvas instead of maintaining a second, quietly-diverging icon table.
 */
export function iconLayers(type) {
  const files = STRUCT_ICON[type];
  if (!files) return [];
  return files.map((file) => ({
    file,
    scale: type === "spawn" && file === "operate-spawn.svg" ? 0.55 : 0.94,
  }));
}

/** base64 data URI for one asset file — the gallery's own embedder. */
export function iconDataUri(name) {
  return loadIconDataUri(name);
}

function iconStructure(parts, p, cell, type) {
  for (const l of iconLayers(type)) iconSprite(parts, p, cell, l.file, l.scale);
}

/**
 * Full room map with real Screeps icons.
 * @param {object} plan
 * @param {number} cell tile size in px
 * @param {{ x0?: number, y0?: number, x1?: number, y1?: number }} [crop] inclusive tile bounds
 */
export function renderRoomSvg(plan, cell = 18, crop = null) {
  const x0 = crop?.x0 ?? 0;
  const y0 = crop?.y0 ?? 0;
  const x1 = crop?.x1 ?? 49;
  const y1 = crop?.y1 ?? 49;
  const tw = x1 - x0 + 1;
  const th = y1 - y0 + 1;
  const W = tw * cell;
  const H = th * cell;
  const parts = [];

  // shift so crop draws at origin
  const ox = (x, y) => ({ x: x - x0, y: y - y0 });

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // BITMASK, not enum: code 3 is wall|swamp and draws as WALL (see shared.mjs)
      const t = tileAt(plan.terrain, x, y);
      const fill = terrainFill(t);
      const p = ox(x, y);
      parts.push(
        `<rect x="${p.x * cell}" y="${p.y * cell}" width="${cell}" height="${cell}" fill="${fill}"/>`,
      );
      // subtle grid
      parts.push(
        `<rect x="${p.x * cell}" y="${p.y * cell}" width="${cell}" height="${cell}" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="0.5"/>`,
      );
    }
  }

  // grown core under everything (shows grow-from-room)
  if (plan.core?.length) {
    const coreIn = plan.core.filter((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1);
    iconCore(
      parts,
      coreIn.map((p) => ox(p.x, p.y)),
      cell,
      0,
      0,
    );
  }

  const st = plan.structures || {};

  // The enclosure is closed by ramparts AND by natural terrain walls — the
  // min-cut takes the terrain for free, which used to make a fully sealed
  // room (E11S1: zero leaks) read as "wall with a hole in it". Stroking the
  // load-bearing wall tiles closes the loop visually.
  if (plan.shell?.boundary?.length) {
    for (const p of plan.shell.boundary) {
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      const o = ox(p.x, p.y);
      const S = SHELL_SEAL_PAINT;
      parts.push(
        `<rect x="${o.x * cell + 1.5}" y="${o.y * cell + 1.5}" width="${cell - 3}" height="${cell - 3}" rx="${cell * 0.15}" fill="none" stroke="${S.stroke}" stroke-opacity="${S.strokeOpacity}" stroke-width="${Math.max(0.5, cell * S.strokeWidth)}"/>`,
      );
    }
  }

  // ramparts under everything else — translucent green, battlements brighter
  if (st.rampart?.length) {
    const battle = new Set((plan.shell?.battlements || []).map((b) => `${b.x},${b.y}`));
    for (const p of st.rampart) {
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      const o = ox(p.x, p.y);
      const hot = battle.has(`${p.x},${p.y}`);
      const R = RAMPART_PAINT;
      parts.push(
        `<rect x="${o.x * cell + R.inset}" y="${o.y * cell + R.inset}" width="${cell - 2 * R.inset}" height="${cell - 2 * R.inset}" rx="${cell * R.radius}" fill="${R.fill}" fill-opacity="${hot ? R.hotFillOpacity : R.fillOpacity}" stroke="${R.stroke}" stroke-opacity="${R.strokeOpacity}" stroke-width="${hot ? R.hotStrokeWidth : R.strokeWidth}"/>`,
      );
    }
  }

  for (const p of st.road || []) {
    if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
    iconRoad(parts, ox(p.x, p.y), cell);
  }

  const order = [
    "extension",
    "lab",
    "tower",
    "container",
    "link",
    "factory",
    "observer",
    "nuker",
    "terminal",
    "spawn",
    "storage",
    "extractor",
  ];
  for (const type of order) {
    for (const p of st[type] || []) {
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      iconStructure(parts, ox(p.x, p.y), cell, type);
    }
  }

  for (const s of plan.sources || []) {
    if (s.x < x0 || s.x > x1 || s.y < y0 || s.y > y1) continue;
    iconStructure(parts, ox(s.x, s.y), cell, "source");
  }
  if (plan.controller) {
    const c = plan.controller;
    if (c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1) {
      iconStructure(parts, ox(c.x, c.y), cell, "controller");
    }
  }
  if (plan.mineral) {
    const m = plan.mineral;
    if (m.x >= x0 && m.x <= x1 && m.y >= y0 && m.y <= y1) {
      iconStructure(parts, ox(m.x, m.y), cell, "mineral");
    }
  }
  if (plan.seed) {
    const s = plan.seed;
    if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) {
      iconSeed(parts, ox(s.x, s.y), cell, 0, 0);
    }
  }
  if (plan.hub) {
    const h = plan.hub;
    if (h.x >= x0 && h.x <= x1 && h.y >= y0 && h.y <= y1) {
      iconHub(parts, ox(h.x, h.y), cell);
    }
  }

  parts.push(
    `<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#111" stroke-width="2"/>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
}

/**
 * THE INDEX THUMBNAIL — WHY IT IS NOT `renderRoomSvg` AT A SMALLER CELL.
 *
 * The gallery index inlined `renderRoomSvg(p, 10)` once per room. That call
 * emits one `<image href="data:image/svg+xml;base64,...">` PER STRUCTURE
 * INSTANCE, so a room with 60 extensions carried the 2.4KB extension sprite
 * sixty times over, on top of 2500 terrain rects and 2500 grid strokes. One
 * room came to ~1MB and the 159-room index of the round this was measured in
 * came to 159,056,753 bytes: 13.8s of transfer on localhost and 135 of those
 * 159 cards present at the 10-second mark. That is a browser-load reading from
 * one run on one machine — it is quoted as the reason the thumbnail exists, not
 * as a fleet statistic, and nothing re-measures it. An
 * index nobody can load is not an index.
 *
 * THINGS TRIED AND REJECTED, in order:
 *
 *   1. `<defs>`/`<use>` so each sprite's base64 appears once per file. Real
 *      saving (the sprite bytes collapse ~20x) but the terrain grid alone is
 *      still ~450KB at cell 10, so the index lands near 10MB inline. Better,
 *      still a page that takes seconds before the first card paints.
 *   2. Inline the small SVG but wrap it in a lazy container. `loading=lazy`
 *      does not exist for inline SVG; the bytes are in the document whether
 *      they are on screen or not, so the transfer cost is unchanged.
 *   3. External thumbnail files that reuse the sprite stack via data: URIs.
 *      An SVG loaded through `<img>` is a sandboxed document — data: URIs
 *      happen to resolve in Chrome today, and quietly do not in other
 *      engines. A thumbnail that renders blank in some browsers is worse than
 *      one that never claimed to have sprites.
 *
 * So: a SPRITE-FREE thumbnail, written to its own file and lazy-loaded. Flat
 * colour per structure type, terrain run-length-encoded per row, no grid
 * strokes (invisible at 8px anyway). It carries no external or embedded
 * resource of any kind, so it renders in an `<img>` everywhere. The card still
 * links to the room page, and the room page still draws the real Screeps
 * sprites at full size — the sprites are one click away, not gone.
 *
 * The colours are exported as THUMB_PAINT and the index prints a key built
 * from that same table, so the reader can decode a thumbnail rather than
 * guess: a legend typed out separately is a legend that drifts.
 */
export const THUMB_PAINT = [
  ["extension", "#ffd24d", "Extension"],
  ["spawn", "#44ff44", "Spawn"],
  ["storage", "#ffaa00", "Storage"],
  ["terminal", "#ff66dd", "Terminal"],
  ["link", "#00e5ff", "Link"],
  ["tower", "#ff8844", "Tower"],
  ["lab", "#cc66ff", "Lab"],
  ["container", "#ffd27f", "Container"],
  ["nuker", "#ff5566", "Nuker"],
  ["observer", "#66ddff", "Observer"],
  ["extractor", "#e0a6ff", "Extractor"],
  // O7 (round 17): NO FACTORY ROW. The RCL8 program this planner ships forbids
  // the factory and the power spawn outright (pipeline.mjs's layer-5 header
  // says so, and plan.mjs's own structure table prints "no factory, no power
  // spawn" two lines away), so the thumbnail key was advertising a swatch for a
  // structure no room in the fleet can ever contain. A legend entry is a claim
  // that the reader will find that colour on a thumbnail; this one could not be
  // found anywhere, and a key that names structures the plan refuses to build
  // is the same defect as a paragraph naming a search nobody ran. Nothing else
  // changes: the RCL8 program this planner builds contains no factory at all, so
  // `plan.structures.factory` is undefined in every room it can ever emit, and
  // the draw order this table also feeds paints exactly what it painted before.
  // (Round 20: this counted rooms — "undefined in 172/172" — which is the wrong
  // instrument for a claim about the PROGRAM, and it is a count that would have
  // to be re-typed every time the fleet grew. Criticism 80.)
];
const THUMB_COLOR = Object.fromEntries(THUMB_PAINT.map(([t, c]) => [t, c]));

/** the same draw order renderRoomSvg uses, so a thumb and a room page agree */
const THUMB_ORDER = THUMB_PAINT.map(([t]) => t);

/**
 * 50x50 room at `cell` px, no embedded resources. ~30KB instead of ~1MB.
 */
export function renderThumbSvg(plan, cell = 8) {
  const W = 50 * cell;
  const parts = [];

  // TERRAIN, RUN-LENGTH ENCODED PER ROW. 2500 rects is 2500 rects whether or
  // not 40 of them in a row are the same colour; rooms are mostly long bands
  // of plain and long bands of wall, so the runs collapse the terrain to a few
  // hundred rects. The grid strokes are dropped outright — at 8px a 0.5px
  // stroke is a grey haze, not a grid.
  for (let y = 0; y < 50; y++) {
    let x = 0;
    while (x < 50) {
      const t = tileAt(plan.terrain, x, y);
      const fill = terrainFill(t);
      let n = 1;
      while (x + n < 50) {
        const f2 = terrainFill(tileAt(plan.terrain, x + n, y));
        if (f2 !== fill) break;
        n++;
      }
      parts.push(
        `<rect x="${x * cell}" y="${y * cell}" width="${n * cell}" height="${cell}" fill="${fill}"/>`,
      );
      x += n;
    }
  }

  const st = plan.structures || {};

  // ramparts under everything, same translucent green the full render uses
  for (const p of st.rampart || []) {
    parts.push(
      `<rect x="${p.x * cell}" y="${p.y * cell}" width="${cell}" height="${cell}" fill="${RAMPART_PAINT.fill}" fill-opacity="${RAMPART_PAINT.fillOpacity}"/>`,
    );
  }
  // roads: the same two-tone the full render paints, minus the inset rect —
  // at 8px the inner rect is 6px and the outline reads as noise
  for (const p of st.road || []) {
    parts.push(
      `<rect x="${p.x * cell + cell * 0.2}" y="${p.y * cell + cell * 0.2}" width="${cell * 0.6}" height="${cell * 0.6}" fill="${ROAD_PAINT.top}"/>`,
    );
  }
  for (const type of THUMB_ORDER) {
    const c = THUMB_COLOR[type];
    for (const p of st[type] || []) {
      parts.push(
        `<rect x="${p.x * cell + 0.5}" y="${p.y * cell + 0.5}" width="${cell - 1}" height="${cell - 1}" rx="${cell * 0.25}" fill="${c}"/>`,
      );
    }
  }
  const dot = (p, fill) => {
    if (!p) return;
    parts.push(
      `<circle cx="${p.x * cell + cell / 2}" cy="${p.y * cell + cell / 2}" r="${cell * 0.45}" fill="${fill}"/>`,
    );
  };
  for (const s of plan.sources || []) dot(s, MARKER_PAINT.source);
  dot(plan.controller, MARKER_PAINT.controller);
  dot(plan.mineral, MARKER_PAINT.mineral);
  if (plan.hub) {
    parts.push(
      `<circle cx="${plan.hub.x * cell + cell / 2}" cy="${plan.hub.y * cell + cell / 2}" r="${cell * 0.7}" fill="none" stroke="${HUB_PAINT.stroke}" stroke-width="1.2"/>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}"><rect width="${W}" height="${W}" fill="#0a0a0a"/>${parts.join("")}</svg>`;
}

/**
 * the key that makes a sprite-free thumbnail readable — built from THUMB_PAINT
 *
 * STANDING RULE (round 20, and it holds for legendHtml below too): EVERY swatch
 * in these keys is read from the paint table its painter draws from. Alpha is
 * arithmetic done here (alphaHex / overHex), never a typed-out result. A
 * hand-typed hex beside a painted one is a copy of a published value — correct
 * only until the paint moves, and unfalsifiable while it sits there — which is
 * the defect class round 20 closed in this file. If a swatch needs a colour the
 * paint does not have, the paint is missing a constant; do not invent one.
 */
export function thumbLegendHtml() {
  let html =
    '<div class="legend" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:10px 0;font-size:12px;color:#8b949e">' +
    '<span style="color:#667">thumbnail key —</span>';
  const swatch = (c, label, extra = "") =>
    `<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:12px;height:12px;background:${c};border-radius:3px;display:inline-block;${extra}"></span>${label}</span>`;
  for (const [, color, label] of THUMB_PAINT) html += swatch(color, label);
  html += swatch(ROAD_PAINT.top, "Road");
  // OL1 (round 20): this was the hand-typed "#3f6633" — the only swatch in a key
  // whose whole point is that it is read from the paint table. The thumb paints
  // RAMPART_PAINT.fill at RAMPART_PAINT.fillOpacity over the floor, so the
  // swatch composites those same two values over the same plain-floor colour
  // the terrain pass uses (#2E6736 today; over wall it reads darker). A
  // hand-typed swatch beside a painted one is a copy of a published value —
  // right until the paint moves — and that is the class this project keeps
  // closing.
  html += swatch(overHex(RAMPART_PAINT.fill, RAMPART_PAINT.fillOpacity, TERRAIN_PAINT.plain), "Rampart");
  // OL7 (round 20): these were typed here and typed again in the dot() calls
  // above — the same value in two places is the same defect as two different
  // ones, just not caught yet. MARKER_PAINT is the dot's own colour.
  //
  // L2 (round 21): the key swatched two of the three dots renderThumbSvg draws
  // and stopped, so the mineral had no entry — and because the extractor row of
  // THUMB_PAINT carries the same colour the mineral dot is painted in, a reader
  // decoding a thumbnail met that colour labelled "Extractor" and nothing else.
  // Two markers were being keyed by hand, one at a time, which is why the third
  // could go missing at all; the rows are now generated FROM MARKER_PAINT, so
  // every dot the painter can draw has a labelled swatch and a fourth marker
  // added to the paint cannot arrive on the boards unkeyed. (The collision with
  // the extractor swatch is real and left alone: both are published colours and
  // this fix changes none of them. The extractor keeps its row; the mineral now
  // has one too, and the round shape distinguishes the dots from the structure
  // squares in the key exactly as it does on the thumbnail.)
  const MARKER_LABEL = { source: "Source", controller: "Controller", mineral: "Mineral" };
  for (const [key, color] of Object.entries(MARKER_PAINT))
    html += swatch(color, MARKER_LABEL[key] || key, "border-radius:50%");
  html += "</div>";
  return html;
}

/** Crop around hub ± radius tiles */
export function hubCrop(plan, radius = 6) {
  const h = plan.hub || { x: 25, y: 25 };
  return {
    x0: Math.max(0, h.x - radius),
    y0: Math.max(0, h.y - radius),
    x1: Math.min(49, h.x + radius),
    y1: Math.min(49, h.y + radius),
  };
}

/**
 * O4 (round 19) — THE LEGEND IS AN INVENTORY OF THE BOARD, NOT A MEMORY OF ONE.
 *
 * This list was six hard-typed rows ending in "Hub link (×1)", written when the
 * planner placed a hub and nothing else. The artifact it labels has shipped the
 * whole RCL8 program for many rounds — four links a room, sixty extensions, six
 * towers, the lab diamond, nuker, observer, extractor — and the gallery's key
 * still told a reader there was one link and no towers. A legend that names
 * fewer structure classes than the picture contains is a key that mislabels the
 * picture.
 *
 * `inv` is the census the caller measured (a room's own counts on a room page,
 * the fleet's per-room range on the index). A class is drawn when the census
 * carries it and omitted when it does not, so the key cannot name a structure
 * this board has none of, and the counts beside the icons are read off the
 * boards rather than typed here. Called with nothing, the legend degrades to
 * the terrain/paint swatches alone rather than to a guess.
 *
 * The standing rule stated over thumbLegendHtml applies to every swatch below:
 * read the paint table the painter draws from, do the alpha in code, and never
 * type a hex next to a painted one.
 */
export function legendHtml(inv = null) {
  const has = (t) => inv && inv[t] !== undefined && inv[t] !== null && inv[t] !== "0";
  const cnt = (t) => (has(t) ? ` (×${inv[t]})` : "");
  const items = [
    ["storage.svg", "Storage", "storage"],
    ["terminal.svg", "Terminal", "terminal"],
    ["link.svg", "Link", "link"],
    ["rectangle.svg", "Spawn", "spawn"],
    ["tower-base.svg", "Tower", "tower"],
    ["lab.svg", "Lab", "lab"],
    ["extension.svg", "Extension", "extension"],
    ["nuker.svg", "Nuker", "nuker"],
    ["cover.svg", "Observer", "observer"],
    ["extractor.svg", "Extractor", "extractor"],
    ["tombstone.svg", "Container", "container"],
    ["harvest-energy.svg", "Source", null],
    ["controller.svg", "Controller", null],
  ]
    .filter(([, , t]) => t === null || has(t))
    .map(([file, label, t]) => [file, t === null ? label : label + cnt(t)]);
  let html =
    '<div class="legend" style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin:12px 0;font-size:13px;color:#bcc">';
  for (const [file, label] of items) {
    const uri = loadIconDataUri(file);
    if (!uri) continue;
    html += `<span style="display:inline-flex;align-items:center;gap:6px">
      <img src="${uri}" width="28" height="28" alt="" style="image-rendering:auto;background:#222;border-radius:4px;padding:2px"/>
      ${label}</span>`;
  }
  // OL4 (round 20): was `background:#6e6e6e;border:1px solid #888` — the fill
  // happened to equal ROAD_PAINT.top but was typed rather than read (the
  // thumbnail key one function above already reads it), and the #888 edge had no
  // counterpart in the paint at all. iconRoad really does frame the top square
  // with ROAD_PAINT.base, so the swatch is that frame around that fill: both
  // ends of it now come off the table the road is drawn from.
  html +=
    `<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:22px;height:22px;background:${ROAD_PAINT.top};border:1px solid ${ROAD_PAINT.base};border-radius:2px;display:inline-block"></span> Road</span>`;
  // the rampart is the single largest painted class on these boards (the shell
  // cut plus the eco bubbles plus personal cover) and the key did not have it
  //
  // L1 (round 21): the swatch reached the two rampart opacities through CSS
  // `opacity` on the whole box, which is a different operation from the one the
  // painter performs and got both halves wrong. It faded the BORDER to .28 as
  // well, though iconRampart strokes at strokeOpacity (.8) — the swatch was
  // making a numeric claim about the outline that the board does not support,
  // the same defect OL5 closed on the sealing-wall stroke — and it composited
  // the fill over whatever the PAGE background happens to be rather than over
  // the floor tile a rampart actually sits on. The thumbnail key one function
  // above already does this correctly, so this swatch now does what that one
  // does: overHex flattens fill at fillOpacity onto the same plain-floor colour
  // the terrain pass paints, and the opacity that belongs to the stroke is
  // carried by the border alone, as an alpha suffix off the painter's own
  // constant. No colour moved; the arithmetic did.
  html +=
    `<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:22px;height:22px;background:${overHex(RAMPART_PAINT.fill, RAMPART_PAINT.fillOpacity, TERRAIN_PAINT.plain)};border:1px solid ${hex6(RAMPART_PAINT.stroke)}${alphaHex(RAMPART_PAINT.strokeOpacity)};border-radius:3px;display:inline-block"></span> Rampart${cnt("rampart")}</span>`;
  // OL6 (round 20): the ring green was typed here and painted from two other
  // literals; HUB_PAINT is now the one value iconHub, the thumbnail circle and
  // this swatch all read.
  html +=
    `<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:22px;height:22px;border:2px solid ${HUB_PAINT.stroke};border-radius:50%;display:inline-block"></span> Storage / hub</span>`;
  // OL3 (round 20): the three keys that follow are painted by renderRoomSvg and
  // by nothing else — they are on the room renderings, not on the index's
  // thumbnails. The prose beside this legend already sends sprites to the room
  // pages, but a key printed above a wall of thumbnails and read left to right
  // reads as a key TO those thumbnails; say which board they describe here,
  // where the reader is looking, rather than a paragraph away.
  html += '<span style="color:#667;margin-left:2px">on the room renderings —</span>';
  // OL7 (round 20): dashed ring, read from iconSeed's own stroke colour.
  html +=
    `<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:22px;height:22px;border:2px dashed ${SEED_PAINT.stroke};border-radius:50%;display:inline-block"></span> Confluence seed</span>`;
  // OL2 (round 20): this swatch was the hand-typed "#00E67622" — alpha 0x22, or
  // .13 — against a wash the painter lays down at CORE_PAINT.opacity (.07):
  // roughly twice the paint. Both halves now come off the one constant
  // iconCore draws with, so the key cannot drift from the rect again. Same
  // class as OL1: a hand-typed swatch beside a painted one is a copy of a
  // published value. (The 1px outline is swatch chrome — a 7% wash in a 22px
  // box is otherwise unfindable — so it is the paint's own colour at full
  // strength, not an invented alpha; the painted core carries no stroke.)
  html +=
    `<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:22px;height:22px;background:${CORE_PAINT.fill}${alphaHex(CORE_PAINT.opacity)};border:1px solid ${CORE_PAINT.fill};display:inline-block"></span> Grown core</span>`;
  // OL5 (round 20): the border read "#5f8a" — alpha 0xaa, .67 — for a stroke the
  // painter lays at SHELL_SEAL_PAINT.strokeOpacity (.34): the swatch was twice
  // the paint, a numeric claim about the board that the board did not support.
  // Colour and opacity both come off the painter's constant now, expanded to
  // 6 digits first so the alpha suffix is legal CSS rather than a 5-digit hex.
  html +=
    `<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:22px;height:22px;border:1px solid ${hex6(SHELL_SEAL_PAINT.stroke)}${alphaHex(SHELL_SEAL_PAINT.strokeOpacity)};border-radius:3px;display:inline-block"></span> Sealing terrain wall (free enclosure)</span>`;
  html += "</div>";
  return html;
}
