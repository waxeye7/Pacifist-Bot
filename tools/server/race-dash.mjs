#!/usr/bin/env node
/**
 * Speedrun film dashboard.
 *
 * Snapshots race rooms out of local mongo, appends compact frames, rebuilds
 * docs/speedrun-ledger/dashboard/index.html (averages + pair timelapse).
 *
 *   node tools/server/race-dash.mjs --once
 *   node tools/server/race-dash.mjs --watch 45 --serve 8767
 *   node tools/server/race-dash.mjs --no-snap --once
 *
 * Does not touch race.mjs --watch, does not push, does not reset.
 */
import fs from "fs";
import os from "os";
import http from "http";
import path from "path";
import { execFileSync, execSync } from "child_process";
import { fileURLToPath } from "url";
import {
  iconLayers,
  iconDataUri,
  ROAD_PAINT,
  RAMPART_PAINT,
  TERRAIN_PAINT,
} from "../plan-suite/v2/render.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const LEDGER_DIR = path.join(REPO, "docs", "speedrun-ledger");
const OUT = path.join(LEDGER_DIR, "dashboard");
const FRAMES = path.join(OUT, "frames");
const TEMPLATE = path.join(__dirname, "race-dash.html");
const MONGO = process.env.SCREEPS_MONGO || "local-screeps-server-mongo-1";
const REDIS = process.env.SCREEPS_REDIS || "local-screeps-server-redis-1";
const DOCKER_CTX = process.env.SCREEPS_DOCKER_CONTEXT || "";
const MAX_FRAMES = 800;
const RCL_TOTAL = { 1: 200, 2: 45000, 3: 135000, 4: 405000, 5: 1215000, 6: 3645000, 7: 10935000, 8: 0 };

const STRUCT = new Set([
  "spawn", "extension", "tower", "storage", "terminal", "link", "lab", "road",
  "rampart", "container", "nuker", "observer", "extractor", "factory",
  "powerSpawn", "constructedWall",
]);

function parseArgs(argv) {
  const a = { once: false, watch: 0, serve: 0, snap: true, run: null, port: 8767 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--once") a.once = true;
    else if (k === "--watch") {
      a.watch = Math.max(15, Number(v) || 45);
      i++;
    } else if (k === "--serve") {
      a.serve = v && !String(v).startsWith("--") ? Number(v) : 8767;
      if (v && !String(v).startsWith("--")) i++;
    } else if (k === "--port") {
      a.port = Number(v) || 8767;
      i++;
    } else if (k === "--no-snap") a.snap = false;
    else if (k === "--run") {
      a.run = v;
      i++;
    } else if (k === "--help" || k === "-h") {
      console.log("usage: node tools/server/race-dash.mjs [--once] [--watch 45] [--serve 8767] [--no-snap] [--run <id>]");
      process.exit(0);
    }
  }
  if (!a.once && !a.watch && !a.serve) a.once = true;
  if (a.serve && !a.port) a.port = a.serve;
  if (a.serve) a.port = a.serve;
  return a;
}

function dockerArgs(args) {
  return DOCKER_CTX ? ["-c", DOCKER_CTX, ...args] : args;
}
function docker(args, opts = {}) {
  return execFileSync("docker", dockerArgs(args), { encoding: "utf8", maxBuffer: 80e6, ...opts });
}

function newestLedger() {
  const files = fs.readdirSync(LEDGER_DIR).filter((f) => f.startsWith("run-") && f.endsWith(".json")).sort();
  if (!files.length) throw new Error("no run-*.json in speedrun-ledger");
  return path.join(LEDGER_DIR, files[files.length - 1]);
}
function ledgerPath(runId) {
  if (!runId) return newestLedger();
  const name = runId.endsWith(".json") ? runId : `${runId.startsWith("run-") ? runId : "run-" + runId}.json`;
  const p = path.join(LEDGER_DIR, name);
  if (!fs.existsSync(p)) throw new Error("no ledger " + p);
  return p;
}
function allLedgers() {
  return fs.readdirSync(LEDGER_DIR)
    .filter((f) => f.startsWith("run-") && f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(LEDGER_DIR, f), "utf8")));
}

function elapsedOf(ms, lvl) {
  const v = ms && (ms[lvl] ?? ms[String(lvl)]);
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v.elapsed === "number") return v.elapsed;
  return null;
}
function sideMean(entries, side, lvl) {
  const rows = entries.filter((e) => e.side === side);
  const vals = rows.map((e) => elapsedOf(e.milestones, lvl)).filter((n) => typeof n === "number");
  return {
    n: rows.length,
    hit: vals.length,
    mean: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
    min: vals.length ? Math.min(...vals) : null,
    max: vals.length ? Math.max(...vals) : null,
  };
}

function roleTag(name) {
  if (!name) return "??";
  const head = String(name).split("-")[0];
  const caps = head.match(/[A-Z]/g);
  if (caps && caps.length >= 2) return (caps[0] + caps[1]).slice(0, 2);
  return head.slice(0, 2).toUpperCase();
}

function gameTime() {
  try {
    return Number(docker(["exec", REDIS, "redis-cli", "get", "gameTime"]).trim());
  } catch {
    return 0;
  }
}

function queryRooms(rooms) {
  const stamp = `${process.pid}-${Date.now().toString(36)}`;
  const local = path.join(os.tmpdir(), `race-dash-${stamp}.js`);
  const remote = `/tmp/race-dash-${stamp}.js`;
  const body = `db = db.getSiblingDB("screeps");
var rooms = ${JSON.stringify(rooms)};
var proj = {
  type: 1, x: 1, y: 1, room: 1, user: 1, name: 1, structureType: 1, store: 1,
  storeCapacityResource: 1, level: 1, progress: 1, progressTotal: 1,
  energy: 1, energyCapacity: 1, spawning: 1
};
var out = { rooms: [] };
for (var i = 0; i < rooms.length; i++) {
  var room = rooms[i];
  var t = db["rooms.terrain"].findOne({room: room});
  var objects = db["rooms.objects"].find({room: room, type: {$ne: "energy"}}, proj).toArray();
  out.rooms.push({ room: room, terrain: t ? t.terrain : null, objects: objects });
}
print("__DASH__" + JSON.stringify(out));
`;
  fs.writeFileSync(local, body);
  try {
    execSync(`docker ${DOCKER_CTX ? "-c " + DOCKER_CTX + " " : ""}cp "${local}" ${MONGO}:${remote}`, { stdio: "pipe" });
    const raw = docker(["exec", MONGO, "mongosh", "--quiet", "--file", remote]);
    const mark = "__DASH__";
    const line = raw.split(/\r?\n/).find((l) => l.includes(mark));
    if (!line) throw new Error("mongo produced no result:\n" + raw.slice(0, 400));
    return JSON.parse(line.slice(line.indexOf(mark) + mark.length));
  } finally {
    try { fs.unlinkSync(local); } catch {}
  }
}

function packRoom(roomDoc, seedTick, tick) {
  const st = [];
  const sites = [];
  const cr = [];
  let rcl = 0, p = 0, pt = 0, cap = 0, en = 0;
  let ext = 0, twr = 0, con = 0, sto = 0, spawns = 0;
  const sources = [];
  let controller = null;
  let mineral = null;

  for (const o of roomDoc.objects || []) {
    const t = o.type;
    if (STRUCT.has(t)) {
      st.push([t, o.x, o.y]);
      if (t === "spawn") {
        spawns++;
        en += (o.store && o.store.energy) || 0;
        cap += (o.storeCapacityResource && o.storeCapacityResource.energy) || 300;
      } else if (t === "extension") {
        ext++;
        en += (o.store && o.store.energy) || 0;
        cap += (o.storeCapacityResource && o.storeCapacityResource.energy) || 50;
      } else if (t === "tower") twr++;
      else if (t === "container") con++;
      else if (t === "storage") sto++;
      continue;
    }
    if (t === "source") sources.push([o.x, o.y]);
    else if (t === "controller") {
      controller = [o.x, o.y];
      rcl = o.level || 0;
      p = o.progress || 0;
      pt = RCL_TOTAL[rcl] ?? o.progressTotal ?? 0;
    } else if (t === "mineral") mineral = [o.x, o.y];
    else if (t === "constructionSite") {
      sites.push([o.structureType || "?", o.x, o.y, Math.round(((o.progress || 0) / Math.max(1, o.progressTotal || 1)) * 100)]);
    } else if (t === "creep") {
      cr.push([roleTag(o.name), o.x, o.y]);
    }
  }
  if (!cap) cap = 300;
  const frame = {
    t: tick,
    e: typeof seedTick === "number" ? tick - seedTick : null,
    rcl, p, pt, cap, en, ext, twr, con, sto, spawns,
    sites, st, cr,
  };
  return { frame, sources, controller, mineral, terrain: roomDoc.terrain || "0".repeat(2500) };
}

function frameHash(f) {
  return [
    f.rcl, f.p, f.ext, f.twr, f.con, f.sto, f.spawns, f.cr.length, f.sites.length,
    f.st.length, f.cr.map((c) => c.join(",")).join(";"),
  ].join("|");
}

function thinFrames(frames) {
  if (frames.length <= MAX_FRAMES) return frames;
  const keepRecent = Math.floor(MAX_FRAMES * 0.45);
  const old = frames.slice(0, frames.length - keepRecent);
  const recent = frames.slice(frames.length - keepRecent);
  const step = Math.ceil(old.length / (MAX_FRAMES - keepRecent));
  const thinned = [];
  for (let i = 0; i < old.length; i += step) thinned.push(old[i]);
  return thinned.concat(recent);
}

function framePath(runId, room) {
  return path.join(FRAMES, runId, `${room}.json`);
}

function loadStrip(runId, room) {
  const p = framePath(runId, room);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function saveStrip(strip) {
  const p = framePath(strip.runId, strip.room);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + ".tmp" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(strip));
  fs.renameSync(tmp, p);
}

function appendFrame(entry, packed, runId, tick) {
  let strip = loadStrip(runId, entry.room);
  if (!strip) {
    strip = {
      v: 1,
      room: entry.room,
      runId,
      side: entry.side,
      slot: entry.slot,
      band: entry.band,
      seedTick: entry.seedTick,
      terrain: packed.terrain,
      sources: packed.sources,
      controller: packed.controller,
      mineral: packed.mineral,
      frames: [],
    };
  } else {
    strip.terrain = packed.terrain;
    strip.sources = packed.sources;
    strip.controller = packed.controller;
    strip.mineral = packed.mineral;
  }
  const last = strip.frames[strip.frames.length - 1];
  if (last && frameHash(last) === frameHash(packed.frame) && last.t === packed.frame.t) return strip;
  if (last && frameHash(last) === frameHash(packed.frame)) {
    last.t = packed.frame.t;
    last.e = packed.frame.e;
    last.en = packed.frame.en;
    return strip;
  }
  strip.frames.push(packed.frame);
  strip.frames = thinFrames(strip.frames);
  saveStrip(strip);
  return strip;
}

function readWhere() {
  const p = path.join(OUT, "where.md");
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8").trim();
}

function summarize(ledgers, active, tick, strips) {
  const means = (entries) => ({
    2: sideMean(entries, "candidate", 2),
    3: sideMean(entries, "candidate", 3),
    4: sideMean(entries, "candidate", 4),
    c2: sideMean(entries, "control", 2),
    c3: sideMean(entries, "control", 3),
    c4: sideMean(entries, "control", 4),
  });
  const runs = ledgers.map((L) => ({
    runId: L.runId,
    label: L.label || "",
    createdAt: L.createdAt,
    targetRcl: L.targetRcl,
    swap: !!L.swap,
    tick: L.watch?.lastTick ?? null,
    exit: L.watch?.exitReason ?? null,
    means: means(L.entries || []),
    n: (L.entries || []).length,
  }));
  const slots = [];
  const bySlot = new Map();
  for (const e of active.entries || []) {
    if (!bySlot.has(e.slot)) bySlot.set(e.slot, { slot: e.slot, band: e.band });
    const s = bySlot.get(e.slot);
    const strip = strips.get(e.room);
    const last = strip?.frames?.[strip.frames.length - 1] || null;
    s[e.side] = {
      room: e.room,
      user: e.user,
      seedTick: e.seedTick,
      milestones: Object.fromEntries(
        Object.entries(e.milestones || {}).map(([k, v]) => [k, typeof v === "number" ? v : v.elapsed]),
      ),
      lastSeen: e.lastSeen || null,
      last,
      frames: strip?.frames?.length || 0,
      stalled: !!(e.lastSeen && e.lastSeen.spawns === 0 && (e.lastSeen.creeps || 0) <= 1 && (e.lastSeen.level || 0) < (active.targetRcl || 4)),
    };
  }
  for (const s of [...bySlot.values()].sort((a, b) => a.slot.localeCompare(b.slot))) slots.push(s);

  const stills = {};
  for (const [room, strip] of strips) {
    stills[room] = {
      terrain: strip.terrain,
      sources: strip.sources,
      controller: strip.controller,
      mineral: strip.mineral,
      side: strip.side,
      slot: strip.slot,
      last: strip.frames[strip.frames.length - 1] || null,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    tick,
    runId: active.runId,
    label: active.label || "",
    targetRcl: active.targetRcl || 4,
    users: active.users,
    setHash: active.benchmarks?.setHash || null,
    where: readWhere(),
    means: means(active.entries || []),
    runs,
    slots,
    stills,
  };
}

function writeSprites() {
  const types = [
    "extension", "storage", "terminal", "tower", "lab", "link", "factory",
    "controller", "extractor", "nuker", "spawn", "container", "observer",
    "source", "mineral",
  ];
  const SPR = {};
  for (const type of types) {
    SPR[type] = iconLayers(type)
      .map((l) => {
        const u = iconDataUri(l.file);
        return u ? { u, s: l.scale } : null;
      })
      .filter(Boolean);
  }
  const wall = iconDataUri("constructedWall.svg");
  if (wall) SPR.constructedWall = [{ u: wall, s: 0.94 }];
  const js =
    "window.SPR=" + JSON.stringify(SPR) +
    ";window.RP=" + JSON.stringify(ROAD_PAINT) +
    ";window.MP=" + JSON.stringify(RAMPART_PAINT) +
    ";window.TP=" + JSON.stringify(TERRAIN_PAINT) +
    ";\n";
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "sprites.js"), js);
}

function writeHtml(data) {
  if (!fs.existsSync(TEMPLATE)) throw new Error("missing template " + TEMPLATE);
  writeSprites();
  const tpl = fs.readFileSync(TEMPLATE, "utf8");
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  if (!tpl.includes("__DASH_JSON__")) throw new Error("template missing __DASH_JSON__");
  const html = tpl.replace("__DASH_JSON__", json);
  fs.mkdirSync(OUT, { recursive: true });
  const dest = path.join(OUT, "index.html");
  const tmp = dest + ".tmp" + process.pid;
  fs.writeFileSync(tmp, html);
  fs.renameSync(tmp, dest);
  fs.writeFileSync(path.join(OUT, "data.json"), JSON.stringify(data, null, 2));
}

function snapshotActive(args) {
  const file = ledgerPath(args.run);
  const L = JSON.parse(fs.readFileSync(file, "utf8"));
  const rooms = [...new Set((L.entries || []).filter((e) => e.seedOk).map((e) => e.room))];
  const tick = gameTime();
  const strips = new Map();
  if (args.snap && rooms.length) {
    const snap = queryRooms(rooms);
    const byRoom = new Map((snap.rooms || []).map((r) => [r.room, r]));
    const byName = new Map((L.entries || []).map((e) => [e.room, e]));
    for (const room of rooms) {
      const doc = byRoom.get(room);
      const entry = byName.get(room);
      if (!doc || !entry || !doc.terrain) continue;
      const packed = packRoom(doc, entry.seedTick, tick);
      const strip = appendFrame(entry, packed, L.runId, tick);
      saveStrip(strip);
      strips.set(room, strip);
    }
  } else {
    for (const e of L.entries || []) {
      const strip = loadStrip(L.runId, e.room);
      if (strip) strips.set(e.room, strip);
    }
  }
  // also load any leftover strips for this run
  const runDir = path.join(FRAMES, L.runId);
  if (fs.existsSync(runDir)) {
    for (const f of fs.readdirSync(runDir)) {
      if (!f.endsWith(".json")) continue;
      const room = f.slice(0, -5);
      if (!strips.has(room)) {
        try { strips.set(room, JSON.parse(fs.readFileSync(path.join(runDir, f), "utf8"))); } catch {}
      }
    }
  }
  const data = summarize(allLedgers(), L, tick, strips);
  writeHtml(data);
  return { L, tick, strips, data };
}

function serve(port) {
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".json": "application/json",
    ".md": "text/markdown; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") rel = "/index.html";
    const abs = path.normalize(path.join(OUT, rel));
    if (!abs.startsWith(OUT)) {
      res.writeHead(403);
      res.end("no");
      return;
    }
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404);
      res.end("missing " + rel);
      return;
    }
    const ext = path.extname(abs);
    res.writeHead(200, {
      "content-type": mime[ext] || "application/octet-stream",
      "cache-control": ext === ".html" ? "no-store" : "max-age=5",
    });
    fs.createReadStream(abs).pipe(res);
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`dashboard  http://127.0.0.1:${port}/`);
  });
  return server;
}

function cycle(args) {
  const t0 = Date.now();
  try {
    const { tick, strips, L } = snapshotActive(args);
    const n = [...strips.values()].reduce((a, s) => a + (s.frames?.length || 0), 0);
    console.log(
      `[${new Date().toISOString()}] ${L.runId} tick ${tick} · ${strips.size} rooms · ${n} frames · ${Date.now() - t0}ms`,
    );
  } catch (e) {
    console.error("cycle failed:", e.message);
    try {
      const file = ledgerPath(args.run);
      const L = JSON.parse(fs.readFileSync(file, "utf8"));
      const strips = new Map();
      for (const e of L.entries || []) {
        const s = loadStrip(L.runId, e.room);
        if (s) strips.set(e.room, s);
      }
      writeHtml(summarize(allLedgers(), L, L.watch?.lastTick || 0, strips));
      console.log("rebuilt HTML from cached frames");
    } catch (e2) {
      console.error("rebuild-from-cache failed:", e2.message);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(FRAMES, { recursive: true });
  cycle(args);
  if (args.serve) serve(args.port);
  if (args.watch) {
    console.log(`watching every ${args.watch}s → ${path.relative(REPO, path.join(OUT, "index.html"))}`);
    setInterval(() => cycle(args), args.watch * 1000);
  } else if (!args.serve) {
    console.log(path.relative(REPO, path.join(OUT, "index.html")));
  }
}

main();
