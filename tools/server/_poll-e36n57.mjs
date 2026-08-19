#!/usr/bin/env node
/** One-shot HTTP GET dest `main` shard3. No Memory write. No push. */
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
const ME = "62f89e0d84c31c184db79629";
const ROOMS = ["E36N57", "E39N58"];

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
  const roles = {};
  for (const c of myCreeps) {
    const role = String(c.name).split("-")[0];
    roles[role] = (roles[role] || 0) + 1;
  }
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
      user: s.user,
    });
  }
  const foreignSiteTypes = {};
  for (const s of foreignSites) {
    const t = s.structureType || "?";
    foreignSiteTypes[t] = (foreignSiteTypes[t] || 0) + 1;
  }
  const ext = objs.filter((o) => o.type === "extension");
  const towers = objs.filter((o) => o.type === "tower");
  const containers = objs.filter((o) => o.type === "container");
  const storage = objs.find((o) => o.type === "storage");
  return {
    name,
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
      ? { x: ctrl.x, y: ctrl.y, user: ctrl.user, level: ctrl.level }
      : null,
    mySpawnCount: spawns.filter((s) => s.user === meId).length,
    foreignSpawnCount: spawns.filter((s) => s.user && s.user !== meId).length,
    leftoverSpawnCount: spawns.filter((s) => !s.user).length,
    spawns: spawns.map((s) => ({
      name: s.name,
      x: s.x,
      y: s.y,
      user: s.user,
      mine: s.user === meId,
      energy: s.store?.energy ?? s.energy,
      spawning: s.spawning || null,
      hits: s.hits,
    })),
    mySites: mySites.length,
    foreignSites: foreignSites.length,
    siteTypes,
    foreignSiteTypes,
    mySpawnSites: mySites
      .filter((s) => s.structureType === "spawn")
      .map((s) => ({
        name: s.name,
        x: s.x,
        y: s.y,
        p: s.progress || 0,
        tot: s.progressTotal,
        user: s.user,
      })),
    creeps: myCreeps.length,
    foreignCreeps: creeps.length - myCreeps.length,
    roles,
    ext: ext.length,
    towers: towers.length,
    towerE: towers.map((t) => t.store?.energy || t.energy || 0),
    containers: containers.length,
    storageE: storage ? storage.store?.energy || 0 : null,
    storageExists: !!storage,
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
const memFull = await api(`/api/user/memory?shard=${SHARD}`);
const mem = decodeMem(memFull.json?.data);
out.memory = {
  autoExpand: mem?.autoExpand ?? null,
  target_colonise: mem?.target_colonise ?? null,
};
const cb = [];
for (const [name, c] of Object.entries(mem?.creeps || {})) {
  if (!c) continue;
  const role = c.role || "";
  if (role === "buildcontainer" || /ContainerBuilder/i.test(name) || role === "claimer") {
    cb.push({ name, role, targetRoom: c.targetRoom, homeRoom: c.homeRoom });
  }
}
out.cbAndClaimers = cb;
out.rooms = {};
for (const name of ROOMS) {
  const r = await api(`/api/game/room-objects?room=${name}&shard=${SHARD}`);
  const objs = r.json?.objects || [];
  out.rooms[name] = filmRoom(name, objs, r.json?.users || {}, meId, time1.json?.time);
}
const time2 = await api(`/api/game/time?shard=${SHARD}`);
out.time2 = time2.json;
const owned = (roomsRes.json && roomsRes.json.shards && roomsRes.json.shards[SHARD]) || [];
out.owned = owned;
const outPath = path.join(REPO, "docs/speedrun-ledger/_live-e36n57.poll.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      polled: out.polled,
      time1: out.time1,
      time2: out.time2,
      me: out.me,
      owned,
      memory: out.memory,
      cbAndClaimers: out.cbAndClaimers,
      E36N57: out.rooms.E36N57,
      E39N58: out.rooms.E39N58,
    },
    null,
    2,
  ),
);
console.error("wrote", outPath);
