#!/usr/bin/env node
/** Live dest main shard3 crisis poll. Read-only. */
import fs from "fs";
import path from "path";
import { gunzipSync } from "zlib";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8")).main;
if (!cfg?.token) throw new Error("no main.token");
const BASE = `${cfg.protocol || "https"}://${cfg.hostname}${cfg.port ? ":" + cfg.port : ""}`.replace(/\/+$/, "");
const SHARD = "shard3";
const H = { "X-Token": cfg.token, "X-Username": cfg.token };
const KEEP = "E36N57";

async function api(p, method = "GET", body) {
  const url = p.startsWith("http") ? p : `${BASE}${p}`;
  const res = await fetch(url, {
    method,
    headers: body ? { ...H, "Content-Type": "application/json" } : H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 400) };
  }
  return { status: res.status, json };
}

function decodeMem(data) {
  if (data == null) return data;
  if (typeof data === "object") return data;
  if (typeof data !== "string") return data;
  if (data.startsWith("gz:")) {
    return JSON.parse(gunzipSync(Buffer.from(data.slice(3), "base64")).toString());
  }
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function bodyShort(body) {
  if (!Array.isArray(body)) return "";
  return body.map((p) => (p.type || p)[0] || "?").join("");
}

function isBorder(x, y) {
  return x <= 1 || x >= 48 || y <= 1 || y >= 48;
}
function isNearBorder(x, y, n = 3) {
  return x <= n || x >= 49 - n || y <= n || y >= 49 - n;
}

const time = await api(`/api/game/time?shard=${SHARD}`);
const me = await api("/api/auth/me");
const meId = me.json._id;
const roomsRes = await api(`/api/user/rooms?id=${meId}`);
const owned = (roomsRes.json && roomsRes.json.shards && roomsRes.json.shards[SHARD]) || [];
const memFull = await api(`/api/user/memory?shard=${SHARD}`);
const mem = decodeMem(memFull.json?.data) || {};

const extra = [
  "E36N58",
  "E36N59",
  "E38N59",
  "E38N56",
  ...(mem.autoExpand && mem.autoExpand.room ? [mem.autoExpand.room] : []),
  ...(mem.target_colonise && mem.target_colonise.room ? [mem.target_colonise.room] : []),
];
const names = [...new Set([...owned, ...extra])];

const rooms = {};
for (const name of names) {
  const r = await api(`/api/game/room-objects?room=${name}&shard=${SHARD}`);
  const objs = r.json?.objects || [];
  const users = r.json?.users || {};
  const ctrl = objs.find((o) => o.type === "controller");
  const sources = objs.filter((o) => o.type === "source");
  const myCreeps = objs.filter((o) => o.type === "creep" && o.user === meId);
  const hostiles = objs.filter((o) => o.type === "creep" && o.user && o.user !== meId);
  const myStructs = objs.filter(
    (o) =>
      o.user === meId &&
      o.type !== "creep" &&
      o.type !== "constructionSite" &&
      o.type !== "controller",
  );
  const towers = objs.filter((o) => o.type === "tower");
  const ramparts = objs.filter((o) => o.type === "rampart");
  const walls = objs.filter((o) => o.type === "constructedWall");
  const sites = objs.filter((o) => o.type === "constructionSite" && o.user === meId);
  const spawns = objs.filter((o) => o.type === "spawn");
  const ext = objs.filter((o) => o.type === "extension");
  const storage = objs.find((o) => o.type === "storage");
  const terminal = objs.find((o) => o.type === "terminal");

  const towerHits = [];
  for (const t of towers) {
    const onRampart = ramparts.some((rp) => rp.x === t.x && rp.y === t.y);
    towerHits.push({
      x: t.x,
      y: t.y,
      user: t.user,
      mine: t.user === meId,
      hits: t.hits,
      hitsMax: t.hitsMax,
      e: t.store?.energy ?? t.energy ?? 0,
      border: isBorder(t.x, t.y),
      nearBorder: isNearBorder(t.x, t.y, 3),
      onRampart,
    });
  }

  const weird = [];
  for (const s of myStructs) {
    if (!isNearBorder(s.x, s.y, 2)) continue;
    if (s.type === "road" || s.type === "rampart" || s.type === "constructedWall" || s.type === "container") continue;
    weird.push({ type: s.type, x: s.x, y: s.y, hits: s.hits });
  }
  const weirdSites = sites
    .filter((s) => isNearBorder(s.x, s.y, 2) && s.structureType !== "road" && s.structureType !== "rampart" && s.structureType !== "constructedWall")
    .map((s) => ({ st: s.structureType, x: s.x, y: s.y, p: s.progress, pt: s.progressTotal }));

  const rm = (mem.rooms && mem.rooms[name]) || {};
  const plan = rm.planV2 || rm.basePlan || null;
  let planTowers = [];
  let planSpawns = [];
  if (plan && plan.t) {
    planTowers = (plan.t.tower || []).map((p) => ({ x: p[0] ?? p.x, y: p[1] ?? p.y }));
    planSpawns = (plan.t.spawn || []).map((p) => ({ x: p[0] ?? p.x, y: p[1] ?? p.y }));
  } else if (plan && plan.structures) {
    planTowers = (plan.structures.tower || []).map((p) => ({ x: p.x, y: p.y }));
    planSpawns = (plan.structures.spawn || []).map((p) => ({ x: p.x, y: p.y }));
  }

  rooms[name] = {
    mine: !!(ctrl && ctrl.user === meId),
    owner: ctrl && ctrl.user && users[ctrl.user] ? users[ctrl.user].username : ctrl?.user || null,
    rcl: ctrl ? ctrl.level : null,
    p: ctrl ? ctrl.progress : null,
    pt: ctrl ? ctrl.progressTotal : null,
    dg: ctrl && typeof ctrl.downgradeTime === "number" ? ctrl.downgradeTime - (time.json?.time || 0) : null,
    sm: ctrl ? ctrl.safeMode : null,
    sma: ctrl ? ctrl.safeModeAvailable : null,
    smc: ctrl ? ctrl.safeModeCooldown : null,
    sources: sources.length,
    sourceTiles: sources.map((s) => ({ x: s.x, y: s.y, e: s.energy })),
    mySpawns: spawns.filter((s) => s.user === meId).map((s) => ({
      name: s.name,
      x: s.x,
      y: s.y,
      e: s.store?.energy ?? s.energy,
      hits: s.hits,
      hitsMax: s.hitsMax,
      spawning: s.spawning || null,
    })),
    foreignSpawns: spawns.filter((s) => s.user && s.user !== meId).map((s) => ({
      name: s.name,
      x: s.x,
      y: s.y,
      user: users[s.user]?.username || s.user,
      hits: s.hits,
    })),
    ext: ext.length,
    towers: towerHits,
    ramparts: ramparts.length,
    walls: walls.length,
    storageE: storage ? storage.store?.energy || 0 : null,
    storageHits: storage ? storage.hits : null,
    terminalE: terminal ? terminal.store?.energy || 0 : null,
    sites: sites.length,
    siteTypes: sites.reduce((a, s) => {
      a[s.structureType] = (a[s.structureType] || 0) + 1;
      return a;
    }, {}),
    creeps: myCreeps.length,
    roles: myCreeps.reduce((a, c) => {
      const role = String(c.name).split("-")[0];
      a[role] = (a[role] || 0) + 1;
      return a;
    }, {}),
    hostiles: hostiles.map((c) => ({
      name: c.name,
      user: users[c.user]?.username || c.user,
      x: c.x,
      y: c.y,
      hits: c.hits,
      hitsMax: c.hitsMax,
      body: bodyShort(c.body),
      ttl: c.ageTime ? c.ageTime - (time.json?.time || 0) : null,
    })),
    damaged: myStructs
      .filter((s) => typeof s.hits === "number" && typeof s.hitsMax === "number" && s.hits < s.hitsMax)
      .sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax)
      .slice(0, 12)
      .map((s) => ({
        type: s.type,
        x: s.x,
        y: s.y,
        hits: s.hits,
        hitsMax: s.hitsMax,
        pct: Math.round((100 * s.hits) / s.hitsMax),
      })),
    borderStructs: weird,
    borderSites: weirdSites,
    planTowers,
    planSpawns,
    danger: rm.danger,
    blown_fuse: rm.blown_fuse,
    spawn_list: rm.spawn_list,
    keep: name === KEEP,
  };
}

const creeps = mem.creeps || {};
const roles = {};
const combat = [];
for (const name of Object.keys(creeps)) {
  const c = creeps[name];
  if (!c) continue;
  const role = c.role || "?";
  roles[role] = (roles[role] || 0) + 1;
  if (/guard|defender|ram|squad|cck|mosquito|solomon|signifer/i.test(role) || /guard|defender|ram|squad|cck|mosquito/i.test(name)) {
    combat.push({
      name,
      role,
      home: c.homeRoom,
      target: c.targetRoom,
    });
  }
}

const out = {
  polled: new Date().toISOString(),
  tick: time.json?.time,
  me: { username: me.json.username, gcl: me.json.gcl, cpu: me.json.cpu, id: meId },
  owned,
  autoExpand: mem.autoExpand ?? null,
  target_colonise: mem.target_colonise ?? null,
  dropRoom: mem.dropRoom ?? null,
  features: mem.features ?? null,
  CanClaimRemote: mem.CanClaimRemote ?? null,
  war: mem.war
    ? { off: !!mem.war.off, dispatch: mem.war.dispatch === false ? "OFF" : "ON", stats: mem.war.stats || null }
    : null,
  cpu: mem.CPU
    ? { last: mem.CPU.last, bucket: mem.CPU.bucket, five: mem.CPU.fiveHundredTickAvg }
    : null,
  roles,
  combat,
  rooms,
};

const dest = path.join(REPO, "docs/speedrun-ledger/_live-crisis.poll.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2));

const lines = [];
lines.push(`# Live crisis ${out.polled} tick ${out.tick}`);
lines.push(`user ${out.me.username} GCL ${out.me.gcl} CPU ${out.me.cpu} bucket ${out.cpu?.bucket}`);
lines.push(`owned ${owned.join(", ") || "(none)"}`);
lines.push(`autoExpand ${JSON.stringify(out.autoExpand)}`);
lines.push(`colonise ${JSON.stringify(out.target_colonise)}`);
lines.push(`dropRoom ${JSON.stringify(out.dropRoom)} expandMinRcl ${out.features?.expandMinRcl} autoExpandFeat ${out.features?.autoExpand}`);
lines.push("");
for (const name of names) {
  const r = rooms[name];
  if (!r) continue;
  const flag = r.keep ? " KEEP" : r.sources === 1 && r.mine ? " 1-SRC" : !r.mine ? " not-mine" : "";
  const host = r.hostiles.length
    ? ` HOSTILES ${r.hostiles.map((h) => `${h.user}@${h.x},${h.y} ${h.body} ${h.hits}/${h.hitsMax}`).join(" | ")}`
    : "";
  lines.push(
    `## ${name}${flag} RCL${r.rcl} p=${r.p} src=${r.sources} spawns=${r.mySpawns.length} towers=${r.towers.length} creeps=${r.creeps} sites=${r.sites} dg=${r.dg} sm=${r.sm}/${r.sma}${host}`,
  );
  if (r.mySpawns.length) lines.push(`  spawn ${r.mySpawns.map((s) => `${s.name} ${s.x},${s.y} hits=${s.hits}/${s.hitsMax} e=${s.e}`).join("; ")}`);
  if (r.foreignSpawns.length) lines.push(`  FOREIGN SPAWN ${r.foreignSpawns.map((s) => `${s.name} ${s.x},${s.y} ${s.user}`).join("; ")}`);
  if (r.towers.length) {
    lines.push(
      `  towers ${r.towers.map((t) => `${t.x},${t.y} e=${t.e} border=${t.border} near=${t.nearBorder} ramp=${t.onRampart} hits=${t.hits}`).join(" | ")}`,
    );
  }
  if (r.planTowers.length) lines.push(`  planTowers ${r.planTowers.map((t) => `${t.x},${t.y}`).join(" ")}`);
  if (r.borderStructs.length) lines.push(`  borderStructs ${JSON.stringify(r.borderStructs)}`);
  if (r.borderSites.length) lines.push(`  borderSites ${JSON.stringify(r.borderSites)}`);
  if (r.damaged.length) lines.push(`  damaged ${r.damaged.map((d) => `${d.type}@${d.x},${d.y} ${d.pct}%`).join(", ")}`);
  lines.push(`  roles ${JSON.stringify(r.roles)} danger=${r.danger} fuse=${r.blown_fuse}`);
  if (r.storageE != null) lines.push(`  storage ${r.storageE} hits=${r.storageHits} terminal ${r.terminalE}`);
}
lines.push("");
lines.push(`combat creeps ${combat.length}: ${combat.map((c) => `${c.name} ${c.role} ${c.home}->${c.target}`).join("; ") || "none"}`);
const md = lines.join("\n");
fs.writeFileSync(path.join(REPO, "docs/speedrun-ledger/_live-crisis.md"), md);
process.stdout.write(md + "\n");
process.stdout.write(`\nwrote ${dest}\n`);
