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

export function legendHtml() {
  const items = [
    ["storage.svg", "Storage"],
    ["terminal.svg", "Terminal"],
    ["link.svg", "Hub link (×1)"],
    ["rectangle.svg", "Spawn"],
    ["harvest-energy.svg", "Source"],
    ["controller.svg", "Controller"],
  ];
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
