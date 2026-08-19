#!/usr/bin/env node
/** One-shot HTTP GET poll of dest `vps`. No Memory write. No push. Never prints token. */
import fs from "fs";
import path from "path";
import { gunzipSync } from "zlib";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8")).vps;
if (!cfg?.token) throw new Error("no vps.token");
const BASE = `${cfg.protocol || "http"}://${cfg.hostname}${cfg.port && cfg.port !== 80 && cfg.port !== 443 ? ":" + cfg.port : ""}`.replace(/\/+$/, "");
const H = { "X-Token": cfg.token, "X-Username": cfg.token };

const ROOMS = ["W1N1", "W3N1", "W2N1", "W1N2", "W3N3"];

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

function storeE(o) {
  if (!o) return 0;
  if (o.store && typeof o.store.energy === "number") return o.store.energy;
  if (typeof o.energy === "number") return o.energy;
  return 0;
}

function summarizeRoom(name, objects, users, meId, time) {
  const objs = objects || [];
  const ctrl = objs.find((o) => o.type === "controller");
  const ownerId = ctrl && ctrl.user;
  const ownerName = ownerId && users && users[ownerId] && users[ownerId].username;
  const mine = ownerId === meId;
  const spawns = objs.filter((o) => o.type === "spawn");
  const mySpawns = spawns.filter((o) => o.user === meId);
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
    energy: storeE(s),
    spawning: s.spawning || null,
  }));
  const dg =
    ctrl && typeof ctrl.downgradeTime === "number" && typeof time === "number"
      ? ctrl.downgradeTime - time
      : null;
  const builders = myCreeps
    .filter((c) => /^Builder/i.test(c.name) || /buildcontainer/i.test(c.name))
    .map((c) => ({
      name: c.name,
      x: c.x,
      y: c.y,
      storeE: storeE(c),
      store: c.store || null,
      body: (c.body || []).map((p) => (typeof p === "string" ? p[0] : (p.type || "?")[0])).join(""),
      fatigue: c.fatigue,
      actionLog: c.actionLog || null,
    }));
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
    spawnCount: spawns.length,
    mySpawnCount: mySpawns.length,
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
    builders,
    storageE: storage ? storeE(storage) : null,
    storageExists: !!storage,
    storagePos: storage ? { x: storage.x, y: storage.y } : null,
    terminalE: terminal ? storeE(terminal) : null,
    ext: ext.length,
    extE: ext.reduce((a, e) => a + storeE(e), 0),
    extCap: ext.reduce((a, e) => a + (e.storeCapacityResource?.energy || e.energyCapacity || 0), 0),
    towers: towers.length,
    towerE: towers.map((t) => storeE(t)),
    roads: roads.length,
    ramparts: ramparts.length,
    containers: containers.length,
    containerE: containers.map((c) => ({ x: c.x, y: c.y, e: storeE(c) })),
    hostiles: foreignCreeps.map((c) => ({ name: c.name, user: c.user, x: c.x, y: c.y })),
    mySiteList: mySites.map((s) => ({
      t: s.structureType,
      x: s.x,
      y: s.y,
      p: s.progress || 0,
      tot: s.progressTotal,
    })),
    foreignSiteList: foreignSites.map((s) => ({
      t: s.structureType,
      x: s.x,
      y: s.y,
      p: s.progress || 0,
      tot: s.progressTotal,
      user: s.user,
    })),
  };
}

function slimRoomMem(rm) {
  if (!rm || typeof rm !== "object") return rm;
  return {
    danger: rm.danger,
    blown_fuse: rm.blown_fuse,
    danger_timer: rm.danger_timer,
    spawn_list: rm.spawn_list,
    c_spawned: rm.c_spawned,
    lastTimeSpawnUsed: rm.lastTimeSpawnUsed,
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
  "isShellNaked",
  "nakedShell",
  "ramparts only",
  "Empty bank + sites",
  "PlanV2 opens those slots",
];

const out = { polled: new Date().toISOString(), dest: "vps", host: BASE };

const time1 = await api("/api/game/time");
out.time1 = time1.json;

const me = await api("/api/auth/me");
out.me = {
  status: me.status,
  ok: me.json.ok,
  _id: me.json._id,
  username: me.json.username,
  gcl: me.json.gcl,
  cpu: me.json.cpu,
  money: me.json.money,
};
const meId = me.json._id;

const roomsRes = await api(`/api/user/rooms?id=${meId}`);
out.userRooms = roomsRes.json;

const branches = await api("/api/user/branches");
out.branches = branches.json;

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

const memFull = await api("/api/user/memory");
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
const builderMem = [];
for (const [name, c] of Object.entries(creepMem)) {
  if (!c) continue;
  const role = c.role || "";
  if (role === "buildcontainer" || /ContainerBuilder/i.test(name) || role === "claimer") {
    cb.push({ name, role, targetRoom: c.targetRoom, homeRoom: c.homeRoom, fill: c.fill });
  }
  if (role === "Builder" || role === "builder" || /^Builder/i.test(name)) {
    builderMem.push({
      name,
      role,
      building: c.building,
      locked: c.locked,
      storage: c.storage,
      suicide: c.suicide,
    });
  }
}
out.cbAndClaimers = cb;
out.builderMem = builderMem;
out.creepCount = Object.keys(creepMem).length;

out.roomMem = {};
for (const name of ROOMS) {
  if (mem?.rooms?.[name]) out.roomMem[name] = slimRoomMem(mem.rooms[name]);
}

const roomObjs = {};
let usersAcc = {};
for (const name of ROOMS) {
  const r = await api(`/api/game/room-objects?room=${name}`);
  roomObjs[name] = r.json;
  if (r.json?.users) Object.assign(usersAcc, r.json.users);
}

const time2 = await api("/api/game/time");
out.time2 = time2.json;
const time = time2.json?.time ?? time1.json?.time;

out.rooms = {};
for (const name of ROOMS) {
  const j = roomObjs[name];
  out.rooms[name] = summarizeRoom(name, j?.objects, { ...usersAcc, ...(j?.users || {}) }, meId, time);
}

const dumpPath = path.join(REPO, "docs/speedrun-ledger/_vps-now.poll.json");
fs.writeFileSync(dumpPath, JSON.stringify(out, null, 2));

const mainBranch = (out.branches.list || out.branches.branches || []).find?.((b) => b.branch === "main")
  || (Array.isArray(out.branches.list) ? out.branches.list.find((b) => b.branch === "main") : null);

console.log(JSON.stringify({
  polled: out.polled,
  host: out.host,
  time1: out.time1,
  time2: out.time2,
  me: out.me,
  userRooms: out.userRooms,
  branchesMain: mainBranch || out.branches,
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
  builderMem: out.builderMem,
  rooms: out.rooms,
  roomMem: out.roomMem,
}, null, 2));
console.error("wrote", dumpPath);
