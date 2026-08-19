#!/usr/bin/env node
/** One-shot HTTP GET poll of dest `main` shard3. No Memory write. No push. */
import fs from "fs";
import path from "path";
import { gunzipSync } from "zlib";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8")).main;
if (!cfg?.token) throw new Error("no main.token");
const BASE = `${cfg.protocol || "https"}://${cfg.hostname}${cfg.port ? ":" + cfg.port : ""}`.replace(/\/+$/, "");
const SHARD = "shard3";
const H = { "X-Token": cfg.token, "X-Username": cfg.token };

const ROOMS = [
  "E36N58",
  "E37N57",
  "E36N57",
  "E35N59",
  "E39N58",
  "E37N59",
  "E37N58",
  "E36N59",
  "E38N59",
];

async function api(p) {
  const url = p.startsWith("http") ? p : `${BASE}${p}`;
  const res = await fetch(url, { headers: H });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 200) };
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

function summarizeRoom(name, objects, users, meId, time) {
  const objs = objects || [];
  const ctrl = objs.find((o) => o.type === "controller");
  const ownerId = ctrl && ctrl.user;
  const ownerName = ownerId && users && users[ownerId] && users[ownerId].username;
  const mine = ownerId === meId;
  const spawns = objs.filter((o) => o.type === "spawn");
  const mySpawns = spawns.filter((o) => o.user === meId);
  const foreignSpawns = spawns.filter((o) => o.user && o.user !== meId);
  const leftoverSpawns = spawns.filter((o) => !o.user);
  const sites = objs.filter((o) => o.type === "constructionSite");
  const mySites = sites.filter((o) => o.user === meId);
  const foreignSites = sites.filter((o) => o.user && o.user !== meId);
  const creeps = objs.filter((o) => o.type === "creep");
  const myCreeps = creeps.filter((o) => o.user === meId);
  const foreignCreeps = creeps.filter((o) => o.user && o.user !== meId);
  const storage = objs.find((o) => o.type === "storage");
  const terminal = objs.find((o) => o.type === "terminal");
  const ext = objs.filter((o) => o.type === "extension");
  const towers = objs.filter((o) => o.type === "tower");
  const roads = objs.filter((o) => o.type === "road");
  const ramparts = objs.filter((o) => o.type === "rampart" && o.user === meId);
  const walls = objs.filter((o) => o.type === "constructedWall");
  const containers = objs.filter((o) => o.type === "container");
  const siteTypes = {};
  for (const s of mySites) {
    const t = s.structureType || "?";
    if (!siteTypes[t]) siteTypes[t] = [];
    siteTypes[t].push({
      name: s.name,
      x: s.x,
      y: s.y,
      p: s.progress || 0,
      tot: s.progressTotal,
    });
  }
  const foreignSiteTypes = {};
  for (const s of foreignSites) {
    const t = s.structureType || "?";
    foreignSiteTypes[t] = (foreignSiteTypes[t] || 0) + 1;
  }
  const creepNames = myCreeps.map((c) => c.name);
  const roles = {};
  for (const n of creepNames) {
    const role = String(n).split("-")[0];
    roles[role] = (roles[role] || 0) + 1;
  }
  const spawnDetails = spawns.map((s) => ({
    name: s.name,
    x: s.x,
    y: s.y,
    user: s.user,
    mine: s.user === meId,
    energy: s.store?.energy ?? s.energy,
    spawning: s.spawning || null,
  }));
  const dg = ctrl && typeof ctrl.downgradeTime === "number" && typeof time === "number"
    ? ctrl.downgradeTime - time
    : null;
  return {
    name,
    ownerId: ownerId || null,
    ownerName: ownerName || null,
    mine,
    rcl: ctrl ? ctrl.level : null,
    progress: ctrl ? ctrl.progress : null,
    progressTotal: ctrl ? ctrl.progressTotal : null,
    downgradeTime: ctrl ? ctrl.downgradeTime : null,
    dg,
    safeMode: ctrl ? ctrl.safeMode : null,
    safeModeAvailable: ctrl ? ctrl.safeModeAvailable : null,
    safeModeCooldown: ctrl ? ctrl.safeModeCooldown : null,
    reservation: ctrl ? ctrl.reservation : null,
    spawnCount: spawns.length,
    mySpawnCount: mySpawns.length,
    foreignSpawnCount: foreignSpawns.length,
    leftoverSpawnCount: leftoverSpawns.length,
    spawns: spawnDetails,
    mySites: mySites.length,
    foreignSites: foreignSites.length,
    siteTypes,
    foreignSiteTypes,
    creeps: myCreeps.length,
    foreignCreeps: foreignCreeps.length,
    creepNames,
    roles,
    storageE: storage ? (storage.store?.energy || 0) : null,
    storageExists: !!storage,
    storageMine: storage ? storage.user === meId : false,
    terminalE: terminal ? (terminal.store?.energy || 0) : null,
    ext: ext.length,
    extE: ext.reduce((a, e) => a + (e.store?.energy || e.energy || 0), 0),
    towers: towers.length,
    towerE: towers.map((t) => t.store?.energy || t.energy || 0),
    roads: roads.length,
    ramparts: ramparts.length,
    walls: walls.length,
    containers: containers.length,
    hostiles: foreignCreeps.map((c) => ({ name: c.name, user: c.user, x: c.x, y: c.y })),
  };
}

function slimRoomMem(rm) {
  if (!rm || typeof rm !== "object") return rm;
  return {
    danger: rm.danger,
    blown_fuse: rm.blown_fuse,
    spawn_list: rm.spawn_list,
    c_spawned: rm.c_spawned,
    planV2: rm.planV2 ? { v: rm.planV2.v, hash: rm.planV2.hash, hub: rm.planV2.hub } : null,
    planPackMiss: rm.planPackMiss,
    speedrun: rm.speedrun,
    basePlanSpawn: rm.basePlan && rm.basePlan.spawn,
    Structures: rm.Structures
      ? {
          spawn: rm.Structures.spawn,
          spawns: rm.Structures.spawns,
          storage: rm.Structures.storage,
          towers: rm.Structures.towers,
        }
      : null,
    target_colonise: rm.target_colonise,
  };
}

const NEEDLES = [
  "maybeSpawnColonyBuilder",
  "finishableSpawnSiteRoom",
  "roomLooksSpawnlessOwned",
  "CLAIMED_SPAWNLESS",
  "spawnlessOwned",
  "isShellNaked",
  "nakedShell",
  "Do not prefer target_colonise",
  "Never trust target_colonise",
  "E35N59 Enrique",
];

const out = { polled: new Date().toISOString(), dest: "main", host: BASE, shard: SHARD };

const time1 = await api(`/api/game/time?shard=${SHARD}`);
out.time1 = time1.json;

const me = await api("/api/auth/me");
out.me = {
  status: me.status,
  ok: me.json.ok,
  _id: me.json._id,
  username: me.json.username,
  gcl: me.json.gcl,
  cpu: me.json.cpu,
  cpuShard: me.json.cpuShard,
  money: me.json.money,
  credits: me.json.credits,
};
const meId = me.json._id;

const roomsRes = await api(`/api/user/rooms?id=${meId}`);
out.userRooms = roomsRes.json;

const branches = await api("/api/user/branches");
out.branches = (branches.json.list || branches.json.branches || branches.json)
  ? branches.json
  : { status: branches.status, keys: Object.keys(branches.json || {}) };

const code = await api("/api/user/code?branch=main");
const mainMod = code.json?.modules?.main || "";
out.code = {
  status: code.status,
  ok: code.json?.ok,
  branch: code.json?.branch,
  timestamp: code.json?.timestamp,
  moduleBytes: typeof mainMod === "string" ? mainMod.length : 0,
  sha256: typeof mainMod === "string" ? createHash("sha256").update(mainMod).digest("hex") : null,
  needles: Object.fromEntries(NEEDLES.map((n) => [n, typeof mainMod === "string" && mainMod.includes(n)])),
};

const memFull = await api(`/api/user/memory?shard=${SHARD}`);
const mem = decodeMem(memFull.json?.data);
out.memoryStatus = memFull.status;
out.memoryOk = memFull.json?.ok;
out.memory = {
  autoExpand: mem?.autoExpand,
  target_colonise: mem?.target_colonise,
  features: mem?.features,
  CanClaimRemote: mem?.CanClaimRemote,
  packAdopt: mem?.packAdopt,
  CPU: mem?.CPU,
  verbose: mem?.verbose,
};

const creepMem = mem?.creeps || {};
const cb = [];
for (const [name, c] of Object.entries(creepMem)) {
  if (!c) continue;
  const role = c.role || "";
  if (role === "buildcontainer" || /ContainerBuilder/i.test(name) || role === "claimer") {
    cb.push({ name, role, targetRoom: c.targetRoom, homeRoom: c.homeRoom, fill: c.fill });
  }
}
out.cbAndClaimers = cb;
out.creepCount = Object.keys(creepMem).length;

const roomNames = new Set([
  ...ROOMS,
  ...((roomsRes.json && roomsRes.json.shards && roomsRes.json.shards[SHARD]) || roomsRes.json.rooms || []),
]);
out.roomMem = {};
for (const name of roomNames) {
  if (mem?.rooms?.[name]) out.roomMem[name] = slimRoomMem(mem.rooms[name]);
}

out.droppedStillInMem = Object.keys(mem?.rooms || {}).filter(
  (n) => !(((roomsRes.json.shards || {})[SHARD] || roomsRes.json.rooms || []).includes(n)),
);

const roomObjs = {};
let usersAcc = {};
for (const name of ROOMS) {
  const r = await api(`/api/game/room-objects?room=${name}&shard=${SHARD}`);
  roomObjs[name] = r.json;
  if (r.json?.users) Object.assign(usersAcc, r.json.users);
}

const time2 = await api(`/api/game/time?shard=${SHARD}`);
out.time2 = time2.json;
const time = time2.json?.time ?? time1.json?.time;

out.rooms = {};
for (const name of ROOMS) {
  const j = roomObjs[name];
  out.rooms[name] = summarizeRoom(name, j?.objects, { ...usersAcc, ...(j?.users || {}) }, meId, time);
}

const seg86 = await api(`/api/user/memory-segment?segment=86&shard=${SHARD}`);
let segData = decodeMem(seg86.json?.data);
if (typeof segData === "string") {
  try {
    segData = JSON.parse(segData);
  } catch {
    /* keep */
  }
}
out.seg86 = {
  status: seg86.status,
  ok: seg86.json?.ok,
  targets: Array.isArray(segData?.targets)
    ? segData.targets.map((t) => ({ room: t.room, score: t.score, spawnPos: t.spawnPos }))
    : segData,
};

const outPath = path.join(REPO, "docs/speedrun-ledger/_live-after-push.poll.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  polled: out.polled,
  time1: out.time1,
  time2: out.time2,
  me: out.me,
  userRooms: out.userRooms,
  code: out.code,
  memory: {
    autoExpand: out.memory.autoExpand,
    target_colonise: out.memory.target_colonise,
    features: out.memory.features,
    CanClaimRemote: out.memory.CanClaimRemote,
    packAdopt: out.memory.packAdopt,
    verbose: out.memory.verbose,
    CPU: out.memory.CPU && {
      last: out.memory.CPU.last,
      bucket: out.memory.CPU.bucket,
      hundred: (out.memory.CPU.hundredTickAvg?.data || []).slice(-5),
      five: out.memory.CPU.fiveHundredTickAvg,
    },
  },
  cbAndClaimers: out.cbAndClaimers,
  rooms: out.rooms,
  roomMem: out.roomMem,
  droppedStillInMem: out.droppedStillInMem,
  seg86: out.seg86,
  branchesMain: (out.branches.list || []).find?.((b) => b.branch === "main") || out.branches,
}, null, 2));
console.error("wrote", outPath);
