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

function iconHub(parts, p, cell) {
  const cx = p.x * cell + cell / 2,
    cy = p.y * cell + cell / 2;
  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="${cell * 0.48}" fill="none" stroke="#00E676" stroke-width="${Math.max(2, cell * 0.1)}"/>`,
  );
}

/** Faint fill for grown core pocket (debug the grow-from-room step). */
function iconCore(parts, core, cell, x0, y0) {
  if (!core?.length) return;
  for (const p of core) {
    const x = (p.x - x0) * cell;
    const y = (p.y - y0) * cell;
    parts.push(
      `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="#00E676" opacity="0.07"/>`,
    );
  }
}

function iconSeed(parts, seed, cell, x0, y0) {
  if (!seed) return;
  const cx = (seed.x - x0) * cell + cell / 2;
  const cy = (seed.y - y0) * cell + cell / 2;
  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="${cell * 0.22}" fill="none" stroke="#FFD54F" stroke-width="${Math.max(1.5, cell * 0.08)}" stroke-dasharray="${cell * 0.12} ${cell * 0.08}"/>`,
  );
}

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
      const fill = t & WALL ? "#0e0e0e" : t & SWAMP ? "#16301a" : "#2c2c24";
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
      parts.push(
        `<rect x="${o.x * cell + 1.5}" y="${o.y * cell + 1.5}" width="${cell - 3}" height="${cell - 3}" rx="${cell * 0.15}" fill="none" stroke="#5f8" stroke-opacity="0.34" stroke-width="${Math.max(0.5, cell * 0.045)}"/>`,
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
 * room came to ~1MB and the 159-room index came to 159,056,753 bytes: 13.8s of
 * transfer on localhost and 135 of 159 cards present at the 10-second mark. An
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
  // changes: `plan.structures.factory` is undefined in 172/172 rooms, so the
  // draw order this table also feeds paints exactly what it painted before.
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
      const fill = t & WALL ? "#0e0e0e" : t & SWAMP ? "#16301a" : "#2c2c24";
      let n = 1;
      while (x + n < 50) {
        const u = tileAt(plan.terrain, x + n, y);
        const f2 = u & WALL ? "#0e0e0e" : u & SWAMP ? "#16301a" : "#2c2c24";
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
  for (const s of plan.sources || []) dot(s, "#ffe14d");
  dot(plan.controller, "#66ccff");
  dot(plan.mineral, "#e0a6ff");
  if (plan.hub) {
    parts.push(
      `<circle cx="${plan.hub.x * cell + cell / 2}" cy="${plan.hub.y * cell + cell / 2}" r="${cell * 0.7}" fill="none" stroke="#00E676" stroke-width="1.2"/>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}"><rect width="${W}" height="${W}" fill="#0a0a0a"/>${parts.join("")}</svg>`;
}

/** the key that makes a sprite-free thumbnail readable — built from THUMB_PAINT */
export function thumbLegendHtml() {
  let html =
    '<div class="legend" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:10px 0;font-size:12px;color:#8b949e">' +
    '<span style="color:#667">thumbnail key —</span>';
  const swatch = (c, label, extra = "") =>
    `<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:12px;height:12px;background:${c};border-radius:3px;display:inline-block;${extra}"></span>${label}</span>`;
  for (const [, color, label] of THUMB_PAINT) html += swatch(color, label);
  html += swatch(ROAD_PAINT.top, "Road");
  html += swatch("#3f6633", "Rampart");
  html += swatch("#ffe14d", "Source", "border-radius:50%");
  html += swatch("#66ccff", "Controller", "border-radius:50%");
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
  html +=
    '<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:22px;height:22px;background:#6e6e6e;border:1px solid #888;border-radius:2px;display:inline-block"></span> Road</span>';
  // the rampart is the single largest painted class on these boards (the shell
  // cut plus the eco bubbles plus personal cover) and the key did not have it
  html +=
    `<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:22px;height:22px;background:${RAMPART_PAINT.fill};opacity:${RAMPART_PAINT.fillOpacity};border:1px solid ${RAMPART_PAINT.stroke};border-radius:3px;display:inline-block"></span> Rampart${cnt("rampart")}</span>`;
  html +=
    '<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:22px;height:22px;border:2px solid #00E676;border-radius:50%;display:inline-block"></span> Storage / hub</span>';
  html +=
    '<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:22px;height:22px;border:2px dashed #FFD54F;border-radius:50%;display:inline-block"></span> Confluence seed</span>';
  html +=
    '<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:22px;height:22px;background:#00E67622;border:1px solid #00E67655;display:inline-block"></span> Grown core</span>';
  html +=
    '<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:22px;height:22px;border:1px solid #5f8a;border-radius:3px;display:inline-block"></span> Sealing terrain wall (free enclosure)</span>';
  html += "</div>";
  return html;
}
