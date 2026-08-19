#!/usr/bin/env node
/** One-shot HTTP GET dest `main` shard3. No Memory write. No push. */
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
  "E37N59",
  "E37N58",
  "E36N57",
  "E36N58",
  "E37N57",
  "E35N59",
  "E39N58",
  "E38N56",
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

function bodyShort(body) {
  if (!Array.isArray(body)) return "";
  return body
    .map((p) => {
      const t = p.type || p;
      return t[0] || "?";
    })
    .join("");
}

function slimObj(o) {
  if (!o) return o;
  const t = o.type;
  if (t === "controller") {
    return {
      x: o.x,
      y: o.y,
      user: o.user,
      level: o.level,
      p: o.progress,
      pt: o.progressTotal,
      dg: o.downgradeTime,
      sm: o.safeMode,
      sma: o.safeModeAvailable,
      ub: o.upgradeBlocked,
      reservation: o.reservation || null,
    };
  }
  if (t === "spawn") {
    return {
      name: o.name,
      x: o.x,
      y: o.y,
      user: o.user,
      store: o.store,
      spawning: o.spawning || null,
      hits: o.hits,
    };
  }
  if (t === "constructionSite") {
    return {
      name: o.name,
      x: o.x,
      y: o.y,
      user: o.user,
      st: o.structureType,
      p: o.progress || 0,
      pt: o.progressTotal,
      id: o._id,
    };
  }
  if (t === "creep") {
    return {
      name: o.name,
      x: o.x,
      y: o.y,
      user: o.user,
      store: o.store,
      cap: o.storeCapacity,
      fat: o.fatigue,
      age: o.ageTime,
      hits: o.hits,
      body: bodyShort(o.body),
      acts: o.actionLog
        ? Object.fromEntries(
            Object.entries(o.actionLog).filter(([, v]) => v),
          )
        : {},
    };
  }
  if (t === "source") {
    return {
      id: o._id,
      x: o.x,
      y: o.y,
      e: o.energy,
      ec: o.energyCapacity,
      regen: o.ticksToRegeneration,
    };
  }
  if (t === "storage" || t === "terminal" || t === "container" || t === "tower" || t === "extension") {
    return {
      type: t,
      name: o.name,
      x: o.x,
      y: o.y,
      user: o.user,
      store: o.store,
      hits: o.hits,
    };
  }
  if (t === "energy" || t === "resource") {
    return { type: t, x: o.x, y: o.y, res: o.resourceType, amt: o.amount };
  }
  return null;
}

function summarize(name, objects, users, meId, time) {
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
  const storage = objs.find((o) => o.type === "storage");
  const ext = objs.filter((o) => o.type === "extension");
  const towers = objs.filter((o) => o.type === "tower");
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
  const roles = {};
  for (const c of myCreeps) {
    const role = String(c.name).split("-")[0];
    roles[role] = (roles[role] || 0) + 1;
  }
  const dg =
    ctrl && typeof ctrl.downgradeTime === "number" && typeof time === "number"
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
    mySpawnCount: mySpawns.length,
    foreignSpawnCount: foreignSpawns.length,
    leftoverSpawnCount: leftoverSpawns.length,
    spawns: spawns.map((s) => ({
      name: s.name,
      x: s.x,
      y: s.y,
      user: s.user,
      mine: s.user === meId,
      energy: s.store?.energy ?? s.energy,
      spawning: s.spawning || null,
    })),
    mySites: mySites.length,
    foreignSites: foreignSites.length,
    siteTypes,
    foreignSiteTypes,
    creeps: myCreeps.length,
    foreignCreeps: creeps.length - myCreeps.length,
    creepNames: myCreeps.map((c) => c.name),
    roles,
    storageE: storage ? storage.store?.energy || 0 : null,
    storageExists: !!storage,
    ext: ext.length,
    towers: towers.length,
    towerE: towers.map((t) => t.store?.energy || t.energy || 0),
    containers: containers.length,
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
    typeof mainMod === "string"
      ? createHash("sha256").update(mainMod).digest("hex")
      : null,
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
  if (!rm) continue;
  out.roomMem[name] = {
    danger: rm.danger,
    blown_fuse: rm.blown_fuse,
    spawn_list: rm.spawn_list,
    c_spawned: rm.c_spawned,
  };
}

out.raw = {};
out.rooms = {};
let usersAcc = {};
for (const name of ROOMS) {
  const r = await api(`/api/game/room-objects?room=${name}&shard=${SHARD}`);
  const objs = r.json?.objects || [];
  if (r.json?.users) Object.assign(usersAcc, r.json.users);
  const slim = {
    n: objs.length,
    users: r.json?.users || {},
    ctrl: objs.filter((o) => o.type === "controller").map(slimObj),
    spawns: objs.filter((o) => o.type === "spawn").map(slimObj),
    sites: objs.filter((o) => o.type === "constructionSite").map(slimObj),
    creeps: objs.filter((o) => o.type === "creep").map(slimObj),
    sources: objs.filter((o) => o.type === "source").map(slimObj),
    storage: objs.filter((o) => o.type === "storage").map(slimObj),
    towers: objs.filter((o) => o.type === "tower").map(slimObj),
    ext: objs.filter((o) => o.type === "extension").length,
    containers: objs.filter((o) => o.type === "container").map(slimObj),
    drops: objs.filter((o) => o.type === "energy" || o.type === "resource").map(slimObj),
  };
  out.raw[name] = slim;
}

const time2 = await api(`/api/game/time?shard=${SHARD}`);
out.time2 = time2.json;
const time = time2.json?.time ?? time1.json?.time;

for (const name of ROOMS) {
  const raw = out.raw[name];
  // reconstruct enough for summarize from original? we didn't keep objects.
  // summarize from slim:
  const fakeObjs = [];
  for (const c of raw.ctrl) {
    fakeObjs.push({
      type: "controller",
      x: c.x,
      y: c.y,
      user: c.user,
      level: c.level,
      progress: c.p,
      progressTotal: c.pt,
      downgradeTime: c.dg,
      safeMode: c.sm,
      safeModeAvailable: c.sma,
    });
  }
  for (const s of raw.spawns) {
    fakeObjs.push({
      type: "spawn",
      name: s.name,
      x: s.x,
      y: s.y,
      user: s.user,
      store: s.store,
      spawning: s.spawning,
    });
  }
  for (const s of raw.sites) {
    fakeObjs.push({
      type: "constructionSite",
      name: s.name,
      x: s.x,
      y: s.y,
      user: s.user,
      structureType: s.st,
      progress: s.p,
      progressTotal: s.pt,
    });
  }
  for (const c of raw.creeps) {
    fakeObjs.push({
      type: "creep",
      name: c.name,
      x: c.x,
      y: c.y,
      user: c.user,
    });
  }
  for (const s of raw.storage) {
    fakeObjs.push({ type: "storage", user: s.user, store: s.store });
  }
  for (const t of raw.towers) {
    fakeObjs.push({ type: "tower", store: t.store });
  }
  for (let i = 0; i < raw.ext; i++) fakeObjs.push({ type: "extension" });
  for (const c of raw.containers) fakeObjs.push({ type: "container", user: c.user, store: c.store });
  out.rooms[name] = summarize(name, fakeObjs, { ...usersAcc, ...raw.users }, meId, time);
}

const outPath = path.join(REPO, "docs/speedrun-ledger/_live-e37n57.poll.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

const e37 = out.rooms.E37N57;
const site = (out.raw.E37N57.sites || [])[0];
const e36 = out.rooms.E36N57;
const e36n58 = out.rooms.E36N58;
const e39 = out.rooms.E39N58;
const e38 = out.rooms.E38N56;

console.log(
  JSON.stringify(
    {
      polled: out.polled,
      time1: out.time1,
      time2: out.time2,
      me: out.me,
      owned: owned,
      codeSha: out.code.sha256,
      memory: out.memory,
      cbAndClaimers: out.cbAndClaimers,
      E37N57: {
        ...e37,
        site,
        creepsLive: out.raw.E37N57.creeps,
        sources: out.raw.E37N57.sources,
        ctrl: out.raw.E37N57.ctrl,
      },
      E36N57: e36,
      E36N58: { ...e36n58, spawns: e36n58.spawns, siteTypes: e36n58.siteTypes },
      E39N58: e39,
      E38N56: e38,
      E35N59: out.rooms.E35N59,
      E37N59: out.rooms.E37N59,
      E37N58: out.rooms.E37N58,
      roomMem: out.roomMem,
    },
    null,
    2,
  ),
);
console.error("wrote", outPath);
