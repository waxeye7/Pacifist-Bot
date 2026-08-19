#!/usr/bin/env node
/** One-shot HTTP GET dest `main` shard3. Film E39N58 spawn+CBs and E36N57 KEEP.
 *  No Memory write. No push. Never prints token. */
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
const ME = "62f89e0d84c31c184db79629";
const ROOMS = [
  "E39N58",
  "E35N59",
  "E37N57",
  "E37N59",
  "E36N57",
  "E37N58",
  "E38N56",
  "E36N58",
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

function storeE(o) {
  if (!o) return 0;
  if (o.store && typeof o.store.energy === "number") return o.store.energy;
  if (typeof o.energy === "number") return o.energy;
  return 0;
}

function bodyLetters(body) {
  return (body || [])
    .map((p) => (typeof p === "string" ? p[0] : (p.type || "?")[0]))
    .join("");
}

function bodyPretty(body) {
  const counts = { w: 0, c: 0, m: 0, a: 0, r: 0, h: 0, t: 0, cl: 0 };
  for (const p of body || []) {
    const t = typeof p === "string" ? p : p.type || "";
    const k = t[0] === "c" && t === "claim" ? "cl" : (t[0] || "?").toLowerCase();
    if (counts[k] == null) counts[k] = 0;
    counts[k]++;
  }
  const parts = [];
  if (counts.w) parts.push(`${counts.w}W`);
  if (counts.c) parts.push(`${counts.c}C`);
  if (counts.m) parts.push(`${counts.m}M`);
  if (counts.a) parts.push(`${counts.a}A`);
  if (counts.r) parts.push(`${counts.r}R`);
  if (counts.h) parts.push(`${counts.h}H`);
  if (counts.t) parts.push(`${counts.t}T`);
  if (counts.cl) parts.push(`${counts.cl}CL`);
  return parts.length ? `[${parts.join("")}]` : "";
}

function filmCreep(c, time) {
  const acts = c.actionLog
    ? Object.fromEntries(Object.entries(c.actionLog).filter(([, v]) => v))
    : {};
  return {
    name: c.name,
    x: c.x,
    y: c.y,
    user: c.user,
    e: storeE(c),
    cap: c.storeCapacity ?? null,
    fat: c.fatigue ?? 0,
    age: c.ageTime ?? null,
    ttl: typeof c.ageTime === "number" && typeof time === "number" ? c.ageTime - time : null,
    hits: c.hits,
    body: bodyLetters(c.body),
    bodyPretty: bodyPretty(c.body),
    acts,
    spawning: !!c.spawning,
  };
}

function filmSite(s) {
  return {
    name: s.name,
    st: s.structureType,
    x: s.x,
    y: s.y,
    p: s.progress || 0,
    pt: s.progressTotal,
    user: s.user,
    id: s._id,
  };
}

function filmRoom(name, objs, users, meId, time) {
  const ctrl = objs.find((o) => o.type === "controller");
  const ownerId = ctrl?.user || null;
  const ownerName = ownerId && users?.[ownerId]?.username;
  const spawns = objs.filter((o) => o.type === "spawn");
  const sites = objs.filter((o) => o.type === "constructionSite");
  const mySites = sites.filter((o) => o.user === meId);
  const foreignSites = sites.filter((o) => o.user && o.user !== meId);
  const creeps = objs.filter((o) => o.type === "creep");
  const myCreeps = creeps.filter((o) => o.user === meId);
  const foreignCreeps = creeps.filter((o) => o.user && o.user !== meId);
  const ext = objs.filter((o) => o.type === "extension");
  const towers = objs.filter((o) => o.type === "tower");
  const containers = objs.filter((o) => o.type === "container");
  const storage = objs.find((o) => o.type === "storage");
  const walls = objs.filter((o) => o.type === "constructedWall");
  const sources = objs.filter((o) => o.type === "source");
  const roles = {};
  for (const c of myCreeps) {
    const role = String(c.name).split("-")[0];
    roles[role] = (roles[role] || 0) + 1;
  }
  const siteTypes = {};
  for (const s of mySites) {
    const t = s.structureType || "?";
    if (!siteTypes[t]) siteTypes[t] = [];
    siteTypes[t].push(filmSite(s));
  }
  const foreignSiteTypes = {};
  for (const s of foreignSites) {
    const t = s.structureType || "?";
    foreignSiteTypes[t] = (foreignSiteTypes[t] || 0) + 1;
  }
  const mySpawnSites = mySites.filter((s) => s.structureType === "spawn").map(filmSite);
  const extSites = mySites.filter((s) => s.structureType === "extension").map(filmSite);
  return {
    name,
    n: objs.length,
    ownerId,
    ownerName: ownerName || null,
    mine: ownerId === meId,
    rcl: ctrl ? ctrl.level : null,
    progress: ctrl ? ctrl.progress : null,
    progressTotal: ctrl ? ctrl.progressTotal : null,
    downgradeTime: ctrl ? ctrl.downgradeTime : null,
    dg:
      ctrl && typeof ctrl.downgradeTime === "number" && typeof time === "number"
        ? ctrl.downgradeTime - time
        : null,
    safeMode: ctrl ? ctrl.safeMode : null,
    sma: ctrl ? ctrl.safeModeAvailable : null,
    ctrl: ctrl
      ? {
          x: ctrl.x,
          y: ctrl.y,
          user: ctrl.user,
          level: ctrl.level,
          p: ctrl.progress,
          pt: ctrl.progressTotal,
          dg: ctrl.downgradeTime,
          sma: ctrl.safeModeAvailable,
          sm: ctrl.safeMode ?? null,
          ticks:
            typeof ctrl.downgradeTime === "number" && typeof time === "number"
              ? ctrl.downgradeTime - time
              : null,
        }
      : null,
    mySpawnCount: spawns.filter((s) => s.user === meId).length,
    foreignSpawnCount: spawns.filter((s) => s.user && s.user !== meId).length,
    leftoverSpawnCount: spawns.filter((s) => !s.user).length,
    spawns: spawns.map((s) => ({
      name: s.name,
      x: s.x,
      y: s.y,
      user: s.user,
      who: (s.user && users?.[s.user]?.username) || null,
      mine: s.user === meId,
      e: storeE(s),
      spawning: s.spawning || null,
      hits: s.hits,
    })),
    mySites: mySites.length,
    mySitesList: mySites.map(filmSite),
    foreignSites: foreignSites.length,
    siteTypes,
    foreignSiteTypes,
    mySpawnSites,
    extSites,
    extSiteCount: extSites.length,
    creeps: myCreeps.length,
    creepsLive: myCreeps.map((c) => filmCreep(c, time)),
    foreignCreeps: foreignCreeps.length,
    foreignCreepsLive: foreignCreeps.map((c) => filmCreep(c, time)),
    roles,
    ext: ext.length,
    towers: towers.length,
    towerE: towers.map((t) => storeE(t)),
    containers: containers.length,
    boxes: containers.map((c) => ({
      x: c.x,
      y: c.y,
      e: storeE(c),
      hits: c.hits,
      user: c.user,
    })),
    storageE: storage ? storeE(storage) : null,
    storageExists: !!storage,
    storageMy: !!(storage && storage.user === meId),
    storage: storage
      ? {
          x: storage.x,
          y: storage.y,
          user: storage.user,
          e: storeE(storage),
          hits: storage.hits,
        }
      : null,
    sources: sources.map((s) => ({
      id: s._id,
      x: s.x,
      y: s.y,
      e: s.energy,
      ec: s.energyCapacity,
      regen: s.ticksToRegeneration,
    })),
    walls: walls.length,
  };
}

function slimForSpawnBlock(film) {
  return {
    n: film.n,
    ctrl: film.ctrl,
    spawns: film.spawns,
    mySpawnSites: film.mySpawnSites,
    mySites: film.mySitesList,
    foreignSites: film.foreignSites,
    foreignSiteTypes: film.foreignSiteTypes,
    creeps: film.creepsLive,
    sources: film.sources,
    walls: film.walls || undefined,
    ext: film.ext,
    extSiteCount: film.extSiteCount,
    storageMy: film.storageMy,
    storage: film.storage,
    roles: film.roles,
  };
}

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
};
const meId = me.json._id || ME;

const roomsRes = await api(`/api/user/rooms?id=${meId}`);
out.userRooms = roomsRes.json;

const code = await api("/api/user/code?branch=main");
const mainMod = code.json?.modules?.main || "";
out.code = {
  status: code.status,
  ok: code.json?.ok,
  timestamp: code.json?.timestamp,
  moduleBytes: typeof mainMod === "string" ? mainMod.length : 0,
  sha256:
    typeof mainMod === "string" ? createHash("sha256").update(mainMod).digest("hex") : null,
};

const memFull = await api(`/api/user/memory?shard=${SHARD}`);
const mem = decodeMem(memFull.json?.data);
out.memoryStatus = memFull.status;
out.memoryOk = memFull.json?.ok;
out.memory = {
  autoExpand: mem?.autoExpand ?? null,
  target_colonise: mem?.target_colonise ?? null,
  features: mem?.features ?? null,
  CanClaimRemote: mem?.CanClaimRemote ?? null,
  CPU: mem?.CPU
    ? {
        last: mem.CPU.last,
        bucket: mem.CPU.bucket,
        hundred: (mem.CPU.hundredTickAvg?.data || []).slice(-3),
        five: mem.CPU.fiveHundredTickAvg,
      }
    : null,
};

const creepMem = mem?.creeps || {};
const cb = [];
for (const [name, c] of Object.entries(creepMem)) {
  if (!c) continue;
  const role = c.role || "";
  if (role === "buildcontainer" || /ContainerBuilder/i.test(name) || role === "claimer") {
    cb.push({
      name,
      role,
      targetRoom: c.targetRoom,
      homeRoom: c.homeRoom,
      fill: c.fill,
      building: c.building,
    });
  }
}
out.cbAndClaimers = cb;

out.roomMem = {};
const owned = (roomsRes.json && roomsRes.json.shards && roomsRes.json.shards[SHARD]) || [];
for (const name of new Set([...ROOMS, ...owned])) {
  const rm = mem?.rooms?.[name];
  if (!rm) {
    if (ROOMS.includes(name)) out.roomMem[name] = {};
    continue;
  }
  out.roomMem[name] = {
    danger: rm.danger,
    blown_fuse: rm.blown_fuse,
    spawn_list: rm.spawn_list,
    c_spawned: rm.c_spawned,
    foreignSpawn: rm.foreignSpawn,
  };
}

out.rooms = {};
const rawObjs = {};
let usersAcc = {};
for (const name of ROOMS) {
  const r = await api(`/api/game/room-objects?room=${name}&shard=${SHARD}`);
  const objs = r.json?.objects || [];
  rawObjs[name] = objs;
  if (r.json?.users) Object.assign(usersAcc, r.json.users);
}

const time2 = await api(`/api/game/time?shard=${SHARD}`);
out.time2 = time2.json;
const time = time2.json?.time ?? time1.json?.time;

for (const name of ROOMS) {
  out.rooms[name] = filmRoom(name, rawObjs[name], usersAcc, meId, time);
}

const cbLive = [];
for (const name of ROOMS) {
  for (const c of rawObjs[name].filter((o) => o.type === "creep" && /ContainerBuilder/i.test(o.name))) {
    cbLive.push({ room: name, ...filmCreep(c, time) });
  }
}
for (const name of owned) {
  const rm = out.roomMem[name];
  const q = rm?.spawn_list;
  if (!Array.isArray(q)) continue;
  for (let i = 0; i < q.length; i += 3) {
    const nm = q[i + 1];
    const opts = q[i + 2];
    if (typeof nm === "string" && /ContainerBuilder/i.test(nm)) {
      cbLive.push({
        room: name,
        name: nm,
        hatching: true,
        spawnTime: null,
        mem: opts?.memory || null,
      });
    }
  }
}
out.cbLive = cbLive;
out.owned = owned;

// follow-up ~12s later for site progress
await new Promise((r) => setTimeout(r, 12000));
const followRooms = ["E39N58", "E36N57", "E37N59"];
out.follow = { rooms: {} };
for (const name of followRooms) {
  const r = await api(`/api/game/room-objects?room=${name}&shard=${SHARD}`);
  const objs = r.json?.objects || [];
  const users = { ...usersAcc, ...(r.json?.users || {}) };
  const t3 = await api(`/api/game/time?shard=${SHARD}`);
  out.follow.time = t3.json?.time;
  out.follow.rooms[name] = filmRoom(name, objs, users, meId, t3.json?.time);
}

const spawnBlock = {
  polled: out.polled,
  t1: out.time1?.time,
  t2: out.time2?.time,
  t3: out.follow.time,
  gcl: out.me.gcl,
  cpu: out.me.cpu,
  owned,
  autoExpand: out.memory.autoExpand,
  colonise: out.memory.target_colonise,
  features: out.memory.features,
  CanClaimRemote: out.memory.CanClaimRemote,
  CPU: out.memory.CPU,
  codeSha: out.code.sha256,
  cbs: out.cbAndClaimers,
  cbLive: out.cbLive,
  rooms: {
    E39N58: slimForSpawnBlock(out.rooms.E39N58),
    E35N59: slimForSpawnBlock(out.rooms.E35N59),
    E37N57: slimForSpawnBlock(out.rooms.E37N57),
    E37N59: slimForSpawnBlock(out.rooms.E37N59),
    E36N57: slimForSpawnBlock(out.rooms.E36N57),
  },
  follow: {
    time: out.follow.time,
    E39N58: slimForSpawnBlock(out.follow.rooms.E39N58),
    E36N57: slimForSpawnBlock(out.follow.rooms.E36N57),
    E37N59: slimForSpawnBlock(out.follow.rooms.E37N59),
  },
  roomMem: out.roomMem,
};

const e36 = {
  polled: out.polled,
  dest: "main",
  host: BASE,
  shard: SHARD,
  time1: out.time1,
  me: out.me,
  userRooms: out.userRooms,
  memory: {
    autoExpand: out.memory.autoExpand,
    target_colonise: out.memory.target_colonise,
  },
  cbAndClaimers: out.cbAndClaimers,
  rooms: {
    E36N57: out.rooms.E36N57,
    E39N58: out.rooms.E39N58,
  },
  follow: out.follow,
  time2: out.time2,
  owned,
};

const sbPath = path.join(REPO, "docs/speedrun-ledger/_live-spawn-block.poll.json");
const e36Path = path.join(REPO, "docs/speedrun-ledger/_live-e36n57.poll.json");
fs.writeFileSync(sbPath, JSON.stringify(spawnBlock, null, 2));
fs.writeFileSync(e36Path, JSON.stringify(e36, null, 2));

const e39 = out.rooms.E39N58;
const e39f = out.follow.rooms.E39N58;
const e36r = out.rooms.E36N57;
const e36f = out.follow.rooms.E36N57;
const site = e39.mySpawnSites[0] || null;
const siteF = e39f.mySpawnSites[0] || null;
const cbOnSite = (e39.creepsLive || []).filter((c) => /ContainerBuilder/i.test(c.name));
const cbOnSiteF = (e39f.creepsLive || []).filter((c) => /ContainerBuilder/i.test(c.name));

console.log(
  JSON.stringify(
    {
      polled: out.polled,
      t1: out.time1?.time,
      t2: out.time2?.time,
      t3: out.follow.time,
      me: out.me,
      owned,
      codeSha: out.code.sha256,
      memory: out.memory,
      cbs: out.cbAndClaimers,
      cbLive: out.cbLive,
      E39N58: {
        mine: e39.mine,
        rcl: e39.rcl,
        p: e39.progress,
        dg: e39.dg,
        sma: e39.sma,
        n: e39.n,
        mySpawnCount: e39.mySpawnCount,
        foreignSpawnCount: e39.foreignSpawnCount,
        site,
        siteFollow: siteF,
        cbs: cbOnSite,
        cbsFollow: cbOnSiteF,
        foreignSites: e39.foreignSites,
        foreignSiteTypes: e39.foreignSiteTypes,
        sources: e39.sources,
        danger: out.roomMem.E39N58,
      },
      E36N57: {
        mine: e36r.mine,
        rcl: e36r.rcl,
        p: e36r.progress,
        pFollow: e36f.progress,
        dg: e36r.dg,
        sma: e36r.sma,
        sm: e36r.safeMode,
        spawn: e36r.spawns,
        ext: e36r.ext,
        extSites: e36r.extSites,
        storageMy: e36r.storageMy,
        storage: e36r.storage,
        sites: e36r.siteTypes,
        sitesFollow: e36f.siteTypes,
        boxes: e36r.boxes,
        towerE: e36r.towerE,
        roles: e36r.roles,
        creeps: e36r.creeps,
        creepsLive: e36r.creepsLive,
        spawn_list: out.roomMem.E36N57?.spawn_list,
      },
      E35N59: {
        mine: out.rooms.E35N59.mine,
        rcl: out.rooms.E35N59.rcl,
        p: out.rooms.E35N59.progress,
        dg: out.rooms.E35N59.dg,
        sma: out.rooms.E35N59.sma,
        spawns: out.rooms.E35N59.spawns,
        mySites: out.rooms.E35N59.mySites,
        creeps: out.rooms.E35N59.creeps,
        walls: out.rooms.E35N59.walls,
      },
      E37N57: {
        mine: out.rooms.E37N57.mine,
        rcl: out.rooms.E37N57.rcl,
        p: out.rooms.E37N57.progress,
        dg: out.rooms.E37N57.dg,
        spawn: out.rooms.E37N57.spawns,
        roles: out.rooms.E37N57.roles,
        sites: out.rooms.E37N57.siteTypes,
        creeps: out.rooms.E37N57.creeps,
      },
      E37N59: {
        rcl: out.rooms.E37N59.rcl,
        p: out.rooms.E37N59.progress,
        storageE: out.rooms.E37N59.storageE,
        spawn: out.rooms.E37N59.spawns,
        spawn_list: out.roomMem.E37N59?.spawn_list,
      },
      E38N56: {
        mine: out.rooms.E38N56.mine,
        owner: out.rooms.E38N56.ownerName,
        rcl: out.rooms.E38N56.rcl,
      },
    },
    null,
    2,
  ),
);
console.error("wrote", sbPath);
console.error("wrote", e36Path);
