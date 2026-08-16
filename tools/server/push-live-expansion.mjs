#!/usr/bin/env node
/**
 * push-live-expansion.mjs — feed AutoExpand on the OFFICIAL MMO (shard3).
 *
 * The normal pack pipeline (plan.mjs -> plans-hub.json -> push-expansion-pack.mjs)
 * is hardwired to the local docker mongo, so segment 86 has never been written on
 * screeps.com and AutoExpand starves in `picking`. This tool builds the minimal
 * pack the state machine accepts — ranked targets with a spawn tile and NO plan
 * segment (`seg` omitted) — so a claimed room runs on in-game basePlan/legacy
 * construction exactly like the mother room does.
 *
 *   node tools/server/push-live-expansion.mjs            # rank + write segment 86
 *   node tools/server/push-live-expansion.mjs --dry-run  # rank only
 *
 * Candidates: every non-highway, non-SK room within Chebyshev distance 3 of each
 * owned room; must have a controller, 2 sources, and an unowned/unreserved
 * controller. Score = openness + mineral diversity - distance - swamp.
 */
import https from "https";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cfg = JSON.parse(readFileSync(join(ROOT, "screeps.json"), "utf8")).main;
const SHARD = "shard3";
const DRY = process.argv.includes("--dry-run");
const RANGE = 3;
const SEG_INDEX = 86;

const req = (method, path, body) =>
  new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const r = https.request(
      {
        host: "screeps.com",
        path,
        method,
        headers: {
          "X-Token": cfg.token,
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(d));
          } catch {
            reject(new Error(`${path} -> ${res.statusCode} ${d.slice(0, 200)}`));
          }
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const parseRoom = (name) => {
  const m = name.match(/^([EW])(\d+)([NS])(\d+)$/);
  return { h: m[1], x: Number(m[2]), v: m[3], y: Number(m[4]) };
};
const roomName = (p) => `${p.h}${p.x}${p.v}${p.y}`;
const isHighway = (p) => p.x % 10 === 0 || p.y % 10 === 0;
const isSK = (p) => p.x % 10 >= 4 && p.x % 10 <= 6 && p.y % 10 >= 4 && p.y % 10 <= 6;

// largest-open-square spawn tile: distance transform on the terrain string,
// then pick the most open tile nearest the sources/controller centroid
function pickSpawnTile(terrain, anchors) {
  const wall = (x, y) => x < 0 || x > 49 || y < 0 || y > 49 || (Number(terrain[y * 50 + x]) & 1) === 1;
  const dt = new Array(2500).fill(0);
  for (let y = 1; y < 49; y++)
    for (let x = 1; x < 49; x++)
      if (!wall(x, y)) dt[y * 50 + x] = Math.min(dt[y * 50 + x - 1], dt[(y - 1) * 50 + x], dt[(y - 1) * 50 + x - 1]) + 1;
  for (let y = 48; y >= 1; y--)
    for (let x = 48; x >= 1; x--)
      if (!wall(x, y))
        dt[y * 50 + x] = Math.min(dt[y * 50 + x], Math.min(dt[y * 50 + x + 1], dt[(y + 1) * 50 + x], dt[(y + 1) * 50 + x + 1]) + 1);
  const cx = anchors.reduce((s, a) => s + a.x, 0) / anchors.length;
  const cy = anchors.reduce((s, a) => s + a.y, 0) / anchors.length;
  let best = null;
  for (let y = 6; y < 44; y++)
    for (let x = 6; x < 44; x++) {
      const open = dt[y * 50 + x];
      if (open < 3) continue;
      const d = Math.hypot(x - cx, y - cy);
      const value = Math.min(open, 6) * 10 - d;
      if (!best || value > best.value) best = { x, y, value, open };
    }
  return best;
}

(async () => {
  const me = await req("GET", "/api/auth/me");
  const rooms = await req("GET", `/api/user/rooms?id=${me._id}`);
  const owned = (rooms.shards && rooms.shards[SHARD]) || [];
  if (!owned.length) throw new Error("no owned rooms on " + SHARD);
  console.log("owned:", owned.join(","));

  const candidates = new Map();
  for (const o of owned) {
    const op = parseRoom(o);
    for (let dx = -RANGE; dx <= RANGE; dx++)
      for (let dy = -RANGE; dy <= RANGE; dy++) {
        if (!dx && !dy) continue;
        const p = { ...op, x: op.x + dx, y: op.y + dy };
        if (p.x < 0 || p.y < 0 || isHighway(p) || isSK(p)) continue;
        const name = roomName(p);
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (!candidates.has(name) || candidates.get(name) > dist) candidates.set(name, dist);
      }
  }
  console.log(candidates.size, "candidate rooms in range", RANGE);

  const targets = [];
  for (const [name, dist] of candidates) {
    await sleep(350); // stay well under the API rate limit
    let objs;
    try {
      objs = await req("GET", `/api/game/room-objects?room=${name}&shard=${SHARD}`);
    } catch (e) {
      console.log(name, "objects fetch failed:", e.message);
      continue;
    }
    const o = objs.objects || [];
    const ctrl = o.find((s) => s.type === "controller");
    const sources = o.filter((s) => s.type === "source");
    const mineral = o.find((s) => s.type === "mineral");
    if (!ctrl || sources.length < 2) continue;
    if (ctrl.user || (ctrl.reservation && ctrl.reservation.user !== me._id)) {
      console.log(name, "taken/reserved");
      continue;
    }
    const towers = o.filter((s) => s.type === "tower");
    if (towers.length) continue; // stronghold / leftover hostile structures

    const terr = await req("GET", `/api/game/room-terrain?room=${name}&shard=${SHARD}&encoded=1`);
    const terrain = terr.terrain && terr.terrain[0] && terr.terrain[0].terrain;
    if (!terrain) continue;
    let swamp = 0,
      plain = 0;
    for (let i = 0; i < 2500; i++) {
      const t = Number(terrain[i]);
      if (t & 2) swamp++;
      else if (!(t & 1)) plain++;
    }
    const swampFrac = swamp / Math.max(1, swamp + plain);
    const anchors = sources.map((s) => ({ x: s.x, y: s.y })).concat([{ x: ctrl.x, y: ctrl.y }]);
    const spawn = pickSpawnTile(terrain, anchors);
    if (!spawn) continue;

    const mineralBonus = mineral && mineral.mineralType !== "H" ? 15 : 0;
    const score = Math.round(100 - dist * 20 - swampFrac * 40 + Math.min(spawn.open, 6) * 5 + mineralBonus);
    targets.push({ room: name, score, spawnPos: { x: spawn.x, y: spawn.y }, nSources: sources.length });
    console.log(
      name,
      `score ${score} (dist ${dist}, swamp ${(swampFrac * 100).toFixed(0)}%, open ${spawn.open}, mineral ${mineral ? mineral.mineralType : "?"}) spawn ${spawn.x},${spawn.y}`,
    );
  }

  targets.sort((a, b) => b.score - a.score);
  console.log("\nRANKING:", targets.map((t) => `${t.room}:${t.score}`).join("  "));
  if (DRY) return console.log("dry run — segment not written");
  if (!targets.length) throw new Error("no viable targets — nothing written");

  const data = JSON.stringify({ targets, builtAt: Date.now(), source: "push-live-expansion.mjs" });
  const w = await req("POST", "/api/user/memory-segment", { segment: SEG_INDEX, data, shard: SHARD });
  console.log("segment", SEG_INDEX, "write:", JSON.stringify(w));
  const back = await req("GET", `/api/user/memory-segment?segment=${SEG_INDEX}&shard=${SHARD}`);
  console.log("readback ok:", !!(back.data && back.data.includes("targets")), `${(back.data || "").length} chars`);
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
