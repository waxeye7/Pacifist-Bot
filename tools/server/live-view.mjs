#!/usr/bin/env node
/**
 * LIVE room viewer for the local Screeps server.
 *
 * The private-server web UI has no room renderer, so this reads the world
 * straight out of mongo (richer than the HTTP API, no auth) and re-uses the
 * plan-suite v2 renderer (real Screeps SVG icons) to draw what the bots are
 * actually doing right now: structures, construction sites, creeps (colored by
 * role, 2-letter tag, action lines), dropped resources, plus an info panel.
 *
 * Usage:
 *   node tools/server/live-view.mjs [--rooms E11S2,E11S5] [--user pacifist]
 *                                   [--watch 15] [--cell 15] [--no-dedupe]
 *
 * Output: tools/plan-suite/out-v2/live/<room>.svg + live/index.html
 * Served by the existing static server: http://127.0.0.1:8766/live/index.html
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

import { renderRoomSvg } from "../plan-suite/v2/render.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_LIVE = path.join(__dirname, "..", "plan-suite", "out-v2", "live");
const MONGO = process.env.SCREEPS_MONGO || "local-screeps-server-mongo-1";
const REDIS = process.env.SCREEPS_REDIS || "local-screeps-server-redis-1";

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const a = {
    rooms: null,
    user: "pacifist",
    watch: 0,
    cell: 15,
    dedupe: true,
    port: 8766,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--rooms") (a.rooms = v.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)), i++;
    else if (k === "--user") (a.user = v), i++;
    else if (k === "--watch") (a.watch = Math.max(1, Number(v) || 15)), i++;
    else if (k === "--cell") (a.cell = Math.max(6, Number(v) || 15)), i++;
    else if (k === "--port") (a.port = Number(v) || 8766), i++;
    else if (k === "--no-dedupe") a.dedupe = false;
    else if (k === "--help" || k === "-h") {
      console.log(
        "usage: node tools/server/live-view.mjs [--rooms E11S2,E11S5] [--user pacifist] [--watch 15] [--cell 15] [--no-dedupe]",
      );
      process.exit(0);
    }
  }
  return a;
}

// ---------------------------------------------------------------- mongo

/** Static query script — baked once per process, docker-cp'd once, exec'd per cycle. */
function buildQueryScript(user, rooms) {
  const roomsLit = rooms ? JSON.stringify(rooms) : "null";
  return `db = db.getSiblingDB("screeps");
var username = ${JSON.stringify(user)};
var u = db.users.findOne({username: username});
var uid = u ? String(u._id) : null;
var rooms = ${roomsLit};
if (!rooms || !rooms.length) {
  rooms = uid ? db["rooms.objects"].distinct("room", {type: "controller", user: uid}) : [];
}
rooms = rooms.sort();
var proj = {
  type: 1, x: 1, y: 1, room: 1, user: 1, name: 1, structureType: 1, store: 1,
  storeCapacity: 1, storeCapacityResource: 1, level: 1, progress: 1,
  progressTotal: 1, ticksToDowngrade: 1, hits: 1, hitsMax: 1, amount: 1,
  resourceType: 1, spawning: 1, ageTime: 1, actionLog: 1, mineralType: 1,
  energy: 1, energyCapacity: 1, safeMode: 1, mineralAmount: 1, off: 1,
};
var out = {user: username, uid: uid, rooms: []};
for (var i = 0; i < rooms.length; i++) {
  var room = rooms[i];
  var t = db["rooms.terrain"].findOne({room: room});
  var objects = db["rooms.objects"].find({room: room, type: {$ne: "energy"}}, proj).toArray();
  // dropped piles keep the amount under the resource-type key (see engine
  // _create-energy.js: {type:"energy", resourceType:"H", H: 120}) — no projection.
  var drops = db["rooms.objects"].find({room: room, type: "energy"}).toArray();
  out.rooms.push({room: room, terrain: t ? t.terrain : null, objects: objects.concat(drops)});
}
print(JSON.stringify(out));
`;
}

function dockerCp(localFile, container, remote) {
  execFileSync("docker", ["cp", localFile, `${container}:${remote}`], { stdio: "ignore" });
}

function runMongoScript(remote) {
  const raw = execFileSync("docker", ["exec", MONGO, "mongosh", "--quiet", "--file", remote], {
    encoding: "utf8",
    maxBuffer: 200e6,
  });
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s < 0) throw new Error("mongo query failed: " + raw.slice(0, 300));
  return JSON.parse(raw.slice(s, e + 1));
}

function gameTime() {
  try {
    return Number(
      execFileSync("docker", ["exec", REDIS, "redis-cli", "get", "gameTime"], {
        encoding: "utf8",
      }).trim(),
    );
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------- model

/** Types the renderer draws as structures. */
const STRUCT_TYPES = new Set([
  "spawn",
  "extension",
  "tower",
  "storage",
  "terminal",
  "link",
  "lab",
  "road",
  "rampart",
  "container",
  "nuker",
  "observer",
  "extractor",
  "factory",
  "powerSpawn",
  "constructedWall",
]);

/** Non-resource object types — anything else carrying `amount` is a dropped pile. */
const NON_RESOURCE_TYPES = new Set([
  ...STRUCT_TYPES,
  "creep",
  "powerCreep",
  "controller",
  "source",
  "mineral",
  "deposit",
  "constructionSite",
  "tombstone",
  "ruin",
  "keeperLair",
  "portal",
  "invaderCore",
  "powerBank",
  "flag",
]);

const RCL_TOTAL = {
  1: 200,
  2: 45000,
  3: 135000,
  4: 405000,
  5: 1215000,
  6: 3645000,
  7: 10935000,
  8: 0,
};

const EXT_CAP = { 1: 0, 2: 50, 3: 50, 4: 50, 5: 50, 6: 50, 7: 100, 8: 200 };

function roleOf(name) {
  if (!name) return "unknown";
  const head = String(name).split("-")[0];
  return head || "unknown";
}

function roleTag(role) {
  const caps = role.match(/[A-Z]/g);
  if (caps && caps.length >= 2) return caps[0] + caps[1];
  return role.slice(0, 2).toUpperCase().padEnd(2, "·");
}

function roleColor(role) {
  let h = 2166136261;
  for (let i = 0; i < role.length; i++) {
    h ^= role.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = (h >>> 0) % 360;
  const sat = 62 + ((h >>> 9) % 4) * 8;
  const lig = 52 + ((h >>> 17) % 3) * 6;
  return `hsl(${hue},${sat}%,${lig}%)`;
}

/** rooms.objects -> renderer plan shape + live extras. */
function toModel(roomDoc, uid) {
  const room = roomDoc.room;
  const structures = {};
  const model = {
    room,
    terrain: roomDoc.terrain || "0".repeat(2500),
    structures,
    sources: [],
    controller: null,
    mineral: null,
    hub: null,
    creeps: [],
    hostiles: [],
    sites: [],
    drops: [],
    tombs: [],
    stats: {
      rcl: 0,
      progress: 0,
      progressTotal: 0,
      ticksToDowngrade: 0,
      safeMode: 0,
      storage: 0,
      storageTotal: 0,
      terminal: 0,
      spawnEnergy: 0,
      spawnCapacity: 0,
      towers: 0,
      towerEnergy: 0,
      creeps: 0,
      hostiles: 0,
      sites: 0,
      drops: 0,
      dropEnergy: 0,
      roles: {},
      spawning: null,
      mineralType: null,
    },
  };
  const st = model.stats;
  let extCount = 0;

  for (const o of roomDoc.objects || []) {
    const t = o.type;
    if (STRUCT_TYPES.has(t)) {
      if (!structures[t]) structures[t] = [];
      structures[t].push({ x: o.x, y: o.y });
      if (t === "storage") {
        st.storage = (o.store && o.store.energy) || 0;
        st.storageTotal = Object.values(o.store || {}).reduce((a, b) => a + (b || 0), 0);
        model.hub = { x: o.x, y: o.y };
      } else if (t === "terminal") {
        st.terminal = (o.store && o.store.energy) || 0;
      } else if (t === "spawn") {
        st.spawnEnergy += (o.store && o.store.energy) || 0;
        st.spawnCapacity += (o.storeCapacityResource && o.storeCapacityResource.energy) || 300;
        if (o.spawning && o.spawning.name) st.spawning = o.spawning.name;
      } else if (t === "extension") {
        extCount++;
        st.spawnEnergy += (o.store && o.store.energy) || 0;
        st.spawnCapacity += (o.storeCapacityResource && o.storeCapacityResource.energy) || 0;
      } else if (t === "tower") {
        st.towers++;
        st.towerEnergy += (o.store && o.store.energy) || 0;
      }
      continue;
    }
    switch (t) {
      case "source":
        model.sources.push({ x: o.x, y: o.y, energy: o.energy ?? 0 });
        break;
      case "controller":
        model.controller = { x: o.x, y: o.y };
        st.rcl = o.level || 0;
        st.progress = o.progress || 0;
        st.progressTotal = RCL_TOTAL[o.level] ?? o.progressTotal ?? 0;
        st.ticksToDowngrade = o.ticksToDowngrade || 0;
        st.safeMode = o.safeMode || 0;
        st.owner = o.user || null;
        break;
      case "mineral":
        model.mineral = { x: o.x, y: o.y };
        st.mineralType = o.mineralType || null;
        break;
      case "constructionSite":
        model.sites.push({
          x: o.x,
          y: o.y,
          structureType: o.structureType,
          progress: o.progress || 0,
          progressTotal: o.progressTotal || 1,
        });
        break;
      case "creep": {
        const mine = !uid || String(o.user) === String(uid);
        const role = mine ? roleOf(o.name) : "hostile";
        const c = {
          x: o.x,
          y: o.y,
          name: o.name,
          role,
          mine,
          spawning: !!o.spawning,
          hits: o.hits,
          hitsMax: o.hitsMax,
          store: o.store || {},
          cap: o.storeCapacity || 0,
          action: pickAction(o.actionLog),
          say: pickSay(o.actionLog),
        };
        if (mine) {
          model.creeps.push(c);
          st.roles[role] = (st.roles[role] || 0) + 1;
        } else model.hostiles.push(c);
        break;
      }
      case "energy": {
        // dropped pile: {type:"energy", resourceType:"energy"|"H"|…, <resourceType>: amount}
        const res = o.resourceType || "energy";
        const amount = typeof o[res] === "number" ? o[res] : o.amount || 0;
        if (amount > 0) model.drops.push({ x: o.x, y: o.y, amount, res });
        break;
      }
      case "tombstone":
      case "ruin":
        model.tombs.push({ x: o.x, y: o.y, kind: t });
        break;
      default:
        if (!NON_RESOURCE_TYPES.has(t) && typeof o.amount === "number") {
          model.drops.push({ x: o.x, y: o.y, amount: o.amount, res: o.resourceType || t });
        }
    }
  }

  if (!st.spawnCapacity) st.spawnCapacity = 300;
  else if (extCount && !structures.extension) st.spawnCapacity += extCount * (EXT_CAP[st.rcl] || 50);
  st.creeps = model.creeps.length;
  st.hostiles = model.hostiles.length;
  st.sites = model.sites.length;
  st.drops = model.drops.length;
  st.dropEnergy = model.drops
    .filter((d) => d.res === "energy")
    .reduce((a, d) => a + d.amount, 0);
  return model;
}

const ACTION_KEYS = [
  ["harvest", "#FFD24D"],
  ["build", "#69D2FF"],
  ["repair", "#8CFF9E"],
  ["upgradeController", "#B388FF"],
  ["attack", "#FF5252"],
  ["rangedAttack", "#FF5252"],
  ["heal", "#7CFFB0"],
  ["reserveController", "#B388FF"],
];

function pickAction(log) {
  if (!log) return null;
  for (const [k, color] of ACTION_KEYS) {
    const v = log[k];
    if (v && typeof v.x === "number") return { kind: k, x: v.x, y: v.y, color };
  }
  return null;
}

function pickSay(log) {
  const s = log && log.say;
  if (!s) return null;
  if (typeof s === "string") return s;
  if (typeof s.message === "string") return s.message;
  return null;
}

// ---------------------------------------------------------------- svg bits

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SITE_COLOR = {
  rampart: "#3f6",
  constructedWall: "#9e9e9e",
  road: "#9e9e9e",
  extension: "#FFD24D",
  spawn: "#FF9800",
  tower: "#FF5252",
  container: "#BCAAA4",
  link: "#69D2FF",
  storage: "#69D2FF",
  terminal: "#69D2FF",
  lab: "#CE93D8",
  observer: "#80CBC4",
  extractor: "#A1887F",
  nuker: "#FF8A80",
};

function overlaySvg(model, cell) {
  const p = [];
  const cx = (x) => x * cell + cell / 2;
  const cy = (y) => y * cell + cell / 2;

  // construction sites: dashed outline + first letter (half-transparent build ghost)
  for (const s of model.sites) {
    const col = SITE_COLOR[s.structureType] || "#eee";
    const pct = Math.min(1, s.progress / Math.max(1, s.progressTotal));
    p.push(
      `<rect x="${s.x * cell + 1}" y="${s.y * cell + 1}" width="${cell - 2}" height="${cell - 2}" rx="${cell * 0.15}" fill="${col}" fill-opacity="0.14" stroke="${col}" stroke-opacity="0.75" stroke-width="1.2" stroke-dasharray="${cell * 0.18} ${cell * 0.12}"/>`,
    );
    p.push(
      `<text x="${cx(s.x)}" y="${cy(s.y) + cell * 0.16}" font-family="monospace" font-size="${(cell * 0.5).toFixed(1)}" fill="${col}" fill-opacity="0.95" text-anchor="middle">${esc((s.structureType || "?")[0].toUpperCase())}</text>`,
    );
    if (pct > 0) {
      p.push(
        `<rect x="${s.x * cell + 2}" y="${s.y * cell + cell - 3.5}" width="${(cell - 4) * pct}" height="2" fill="${col}" fill-opacity="0.9"/>`,
      );
    }
  }

  // tombstones / ruins
  for (const t of model.tombs) {
    p.push(
      `<rect x="${t.x * cell + cell * 0.3}" y="${t.y * cell + cell * 0.3}" width="${cell * 0.4}" height="${cell * 0.4}" fill="#888" fill-opacity="0.5"/>`,
    );
  }

  // dropped resources: dot sized by amount
  for (const d of model.drops) {
    const r = Math.max(cell * 0.1, Math.min(cell * 0.42, cell * 0.1 + (cell * 0.32 * Math.sqrt(Math.min(d.amount, 2000))) / 45));
    const col = d.res === "energy" ? "#FFE56D" : "#E1BEE7";
    p.push(
      `<circle cx="${cx(d.x)}" cy="${cy(d.y)}" r="${r.toFixed(2)}" fill="${col}" fill-opacity="0.92" stroke="#000" stroke-opacity="0.5" stroke-width="0.5"/>`,
    );
  }

  // action lines (what each creep is doing right now)
  for (const c of model.creeps) {
    if (!c.action) continue;
    p.push(
      `<line x1="${cx(c.x)}" y1="${cy(c.y)}" x2="${cx(c.action.x)}" y2="${cy(c.action.y)}" stroke="${c.action.color}" stroke-opacity="0.55" stroke-width="${Math.max(1, cell * 0.09)}" stroke-linecap="round"/>`,
    );
  }

  // creeps
  const drawCreep = (c, color) => {
    const r = cell * 0.4;
    const hp = c.hitsMax ? c.hits / c.hitsMax : 1;
    p.push(
      `<circle cx="${cx(c.x)}" cy="${cy(c.y)}" r="${r.toFixed(2)}" fill="${color}" fill-opacity="${c.spawning ? 0.4 : 0.95}" stroke="${hp < 0.99 ? "#FF5252" : "#000"}" stroke-opacity="0.85" stroke-width="${hp < 0.99 ? 1.6 : 0.9}"/>`,
    );
    p.push(
      `<text x="${cx(c.x)}" y="${cy(c.y) + cell * 0.15}" font-family="monospace" font-weight="bold" font-size="${(cell * 0.44).toFixed(1)}" fill="#0b0b0b" text-anchor="middle">${esc(roleTag(c.role))}</text>`,
    );
    if (c.say) {
      p.push(
        `<text x="${cx(c.x)}" y="${c.y * cell - 1}" font-family="monospace" font-size="${(cell * 0.38).toFixed(1)}" fill="#fff" fill-opacity="0.85" text-anchor="middle">${esc(c.say).slice(0, 10)}</text>`,
      );
    }
  };
  for (const c of model.creeps) drawCreep(c, roleColor(c.role));
  for (const c of model.hostiles) drawCreep(c, "#FF3B3B");

  // trim float noise (cell*0.12 -> 1.7999999999999998); no base64 in this pass
  return p.join("").replace(/\d+\.\d{4,}/g, (m) => (+m).toFixed(2));
}

function panelSvg(model, cell, x0, W, H, tick) {
  const st = model.stats;
  const p = [];
  const pad = 12;
  const tx = x0 + pad;
  p.push(`<rect x="${x0}" y="0" width="${W}" height="${H}" fill="#0c0c0e"/>`);
  p.push(`<line x1="${x0}" y1="0" x2="${x0}" y2="${H}" stroke="#222" stroke-width="2"/>`);

  let y = 26;
  const line = (text, color = "#cfd6dd", size = 13, dy = 18, weight = "normal") => {
    p.push(
      `<text x="${tx}" y="${y}" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(text)}</text>`,
    );
    y += dy;
  };
  const bar = (frac, color) => {
    const w = W - pad * 2;
    p.push(`<rect x="${tx}" y="${y - 10}" width="${w}" height="7" rx="3" fill="#1c1c22"/>`);
    p.push(
      `<rect x="${tx}" y="${y - 10}" width="${(w * Math.max(0, Math.min(1, frac))).toFixed(1)}" height="7" rx="3" fill="${color}"/>`,
    );
    y += 14;
  };

  line(model.room, "#8CE0FF", 20, 24, "bold");
  line(`tick ${tick.toLocaleString("en-US")}`, "#67707a", 11, 20);

  const pct = st.progressTotal ? st.progress / st.progressTotal : 1;
  line(`RCL ${st.rcl}`, "#B388FF", 14, 16, "bold");
  line(
    st.progressTotal
      ? `${st.progress.toLocaleString("en-US")} / ${st.progressTotal.toLocaleString("en-US")}  (${(pct * 100).toFixed(1)}%)`
      : `${st.progress.toLocaleString("en-US")} (max)`,
    "#9aa4ae",
    11,
    16,
  );
  bar(pct, "#B388FF");
  line(`downgrade in ${st.ticksToDowngrade.toLocaleString("en-US")}`, "#67707a", 10, 22);

  const efrac = st.spawnCapacity ? st.spawnEnergy / st.spawnCapacity : 0;
  line(`spawn energy ${st.spawnEnergy} / ${st.spawnCapacity}`, "#FFD24D", 12, 16);
  bar(efrac, "#FFD24D");
  line(`storage  ${st.storage.toLocaleString("en-US")} energy`, "#69D2FF", 12, 16);
  if (st.storageTotal > st.storage)
    line(`         ${(st.storageTotal - st.storage).toLocaleString("en-US")} minerals`, "#4d90a8", 10, 14);
  if (st.terminal) line(`terminal ${st.terminal.toLocaleString("en-US")}`, "#69D2FF", 11, 16);
  if (st.towers) line(`towers ${st.towers} · ${st.towerEnergy} energy`, "#FF8A80", 11, 16);
  y += 6;

  line(`creeps ${st.creeps}${st.hostiles ? `  hostiles ${st.hostiles}` : ""}`, "#eaeef2", 13, 18, "bold");
  const roles = Object.entries(st.roles).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [role, n] of roles) {
    const col = roleColor(role);
    p.push(`<circle cx="${tx + 6}" cy="${y - 4}" r="5" fill="${col}"/>`);
    p.push(
      `<text x="${tx + 6}" y="${y - 1}" font-family="monospace" font-weight="bold" font-size="7" fill="#0b0b0b" text-anchor="middle">${esc(roleTag(role))}</text>`,
    );
    p.push(
      `<text x="${tx + 18}" y="${y}" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="11" fill="#aeb6be">${esc(role)} ×${n}</text>`,
    );
    y += 15;
  }
  if (st.spawning) line(`spawning: ${st.spawning}`, "#FFAB40", 10, 18);
  y += 6;

  line(`sites ${st.sites}`, "#69D2FF", 12, 16);
  for (const s of model.sites.slice(0, 6)) {
    line(
      `  ${s.structureType} (${s.x},${s.y}) ${Math.round((s.progress / Math.max(1, s.progressTotal)) * 100)}%`,
      "#7f8891",
      10,
      13,
    );
  }
  if (st.sites > 6) line(`  +${st.sites - 6} more`, "#67707a", 10, 13);
  y += 4;
  line(`drops ${st.drops} · ${st.dropEnergy.toLocaleString("en-US")} energy`, "#FFE56D", 11, 16);

  // footer legend
  p.push(
    `<text x="${tx}" y="${H - 26}" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="9" fill="#4d545b">lines = current action</text>`,
  );
  p.push(
    `<text x="${tx}" y="${H - 14}" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="9" fill="#4d545b">dashed = construction site</text>`,
  );
  return p.join("");
}

/**
 * render.mjs inlines each icon as its own base64 data URI, so a 30-extension
 * room repeats the same ~4KB blob 30 times. Hoist unique blobs into <defs>
 * symbols and swap the <image> tags for <use> — same pixels, ~10x smaller file.
 */
function dedupeIcons(svg) {
  const re =
    /<image href="(data:[^"]+)" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)" preserveAspectRatio="xMidYMid meet"\/>/g;
  const ids = new Map();
  const body = svg.replace(re, (_m, uri, x, y, w, h) => {
    let id = ids.get(uri);
    if (!id) {
      id = `ic${ids.size}`;
      ids.set(uri, id);
    }
    return `<use href="#${id}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  });
  if (!ids.size) return svg;
  let defs = "<defs>";
  for (const [uri, id] of ids) {
    defs += `<symbol id="${id}" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"><image href="${uri}" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet"/></symbol>`;
  }
  defs += "</defs>";
  return body.replace(/(<svg[^>]*>)/, `$1${defs}`);
}

function renderLiveRoom(model, cell, tick, dedupe) {
  const W = 50 * cell;
  const H = 50 * cell;
  const PANEL = 232;
  let svg = renderRoomSvg(model, cell, null);
  const head = `width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"`;
  const newHead = `width="${W + PANEL}" height="${H}" viewBox="0 0 ${W + PANEL} ${H}"`;
  if (!svg.includes(head)) throw new Error("render.mjs header shape changed — cannot widen svg");
  svg = svg.replace(head, newHead);
  const extra = overlaySvg(model, cell) + panelSvg(model, cell, W, PANEL, H, tick);
  svg = svg.replace(/<\/svg>$/, `${extra}</svg>`);
  return dedupe ? dedupeIcons(svg) : svg;
}

// ---------------------------------------------------------------- html

function indexHtml(models, tick, args, ms) {
  const cards = models
    .map((m) => {
      const st = m.stats;
      const pct = st.progressTotal ? ((st.progress / st.progressTotal) * 100).toFixed(1) : "100";
      const roles = Object.entries(st.roles)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([r, n]) =>
            `<span class="role" style="border-color:${roleColor(r)};color:${roleColor(r)}">${esc(r)} ${n}</span>`,
        )
        .join("");
      return `<div class="card">
  <h3>${esc(m.room)} <span class="rcl">RCL ${st.rcl} · ${pct}%</span>${st.hostiles ? `<span class="bad">⚠ ${st.hostiles} hostile</span>` : ""}</h3>
  <a href="${esc(m.room)}.svg?t=${tick}" target="_blank"><img src="${esc(m.room)}.svg?t=${tick}" alt="${esc(m.room)}"/></a>
  <div class="stats">
    <span>creeps <b>${st.creeps}</b></span>
    <span>sites <b>${st.sites}</b></span>
    <span>spawn <b>${st.spawnEnergy}/${st.spawnCapacity}</b></span>
    <span>storage <b>${st.storage.toLocaleString("en-US")}</b></span>
    <span>drops <b>${st.dropEnergy.toLocaleString("en-US")}</b></span>
    <span>downgrade <b>${st.ticksToDowngrade.toLocaleString("en-US")}</b></span>
  </div>
  <div class="roles">${roles}</div>
</div>`;
    })
    .join("\n");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Pacifist LIVE · tick ${tick}</title>
<meta http-equiv="refresh" content="${args.watch || 15}"/>
<style>
body{font-family:system-ui,sans-serif;background:#070708;color:#e8ecf0;margin:20px}
h1{margin:0 0 2px;font-size:22px}
.sub{color:#7d868f;font-size:13px;margin:0 0 14px}
.sub a{color:#6af;text-decoration:none} .sub a:hover{text-decoration:underline}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(560px,1fr));gap:18px}
.card{background:#0f0f12;border:1px solid #1e1e24;border-radius:10px;padding:12px}
.card h3{margin:0 0 8px;font-size:15px;display:flex;align-items:center;gap:10px}
.card img{width:100%;height:auto;display:block;background:#0a0a0a;border-radius:6px}
.rcl{color:#B388FF;font-weight:normal;font-size:12px}
.bad{color:#FF5252;font-size:12px}
.stats{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;font-size:12px;color:#8b949e}
.stats b{color:#e8ecf0;font-weight:600}
.roles{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.role{font-size:11px;border:1px solid;border-radius:999px;padding:1px 8px;opacity:.9}
.live{display:inline-block;width:8px;height:8px;border-radius:50%;background:#3f6;margin-right:6px;animation:b 1.4s infinite}
@keyframes b{50%{opacity:.25}}
</style></head><body>
<h1><span class="live"></span>Pacifist LIVE — tick ${tick.toLocaleString("en-US")}</h1>
<p class="sub">user <b>${esc(args.user)}</b> · ${models.length} room(s) · generated ${new Date().toLocaleTimeString()} in ${ms}ms · auto-refresh ${args.watch || 15}s
&nbsp;·&nbsp; <a href="../index.html">← plan v2 gallery</a></p>
<div class="grid">
${cards}
</div>
</body></html>`;
}

// ---------------------------------------------------------------- main

function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(OUT_LIVE, { recursive: true });

  // unique per process: a second (one-off) run must not hijack the query a
  // long-running --watch process is exec'ing inside the container.
  const stamp = `${process.pid}-${Date.now().toString(36)}`;
  const script = buildQueryScript(args.user, args.rooms);
  const localScript = path.join(os.tmpdir(), `live-view-query-${stamp}.js`);
  const remoteScript = `/tmp/live-view-query-${stamp}.js`;
  fs.writeFileSync(localScript, script);
  process.on("exit", () => {
    try {
      fs.unlinkSync(localScript);
    } catch {}
  });
  dockerCp(localScript, MONGO, remoteScript);

  const cycle = () => {
    const t0 = Date.now();
    const data = runMongoScript(remoteScript);
    const tick = gameTime();
    const models = [];
    for (const rd of data.rooms) {
      if (!rd.terrain) continue;
      const m = toModel(rd, data.uid);
      models.push(m);
      fs.writeFileSync(
        path.join(OUT_LIVE, `${m.room}.svg`),
        renderLiveRoom(m, args.cell, tick, args.dedupe),
      );
    }
    // drop svgs for rooms we no longer render (e.g. left over from a one-off run)
    const keep = new Set(models.map((m) => `${m.room}.svg`));
    for (const f of fs.readdirSync(OUT_LIVE)) {
      if (f.endsWith(".svg") && !keep.has(f)) {
        try {
          fs.unlinkSync(path.join(OUT_LIVE, f));
        } catch {}
      }
    }
    const ms = Date.now() - t0;
    fs.writeFileSync(path.join(OUT_LIVE, "index.html"), indexHtml(models, tick, args, ms));
    console.log(
      `[${new Date().toISOString()}] tick ${tick} · ${models.length} room(s) · ${models
        .map((m) => `${m.room}:${m.stats.creeps}c/${m.stats.sites}s`)
        .join(" ")} · ${ms}ms`,
    );
    return models;
  };

  cycle();
  if (!args.watch) {
    console.log(`http://127.0.0.1:${args.port}/live/index.html`);
    return;
  }
  console.log(
    `watching every ${args.watch}s → http://127.0.0.1:${args.port}/live/index.html (ctrl-c to stop)`,
  );
  setInterval(() => {
    try {
      cycle();
    } catch (e) {
      console.error("cycle failed:", e.message);
    }
  }, args.watch * 1000);
}

main();
