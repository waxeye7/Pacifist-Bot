#!/usr/bin/env node
/** Compact dest-vps film. HTTP GET only. Never prints token. */
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

const NEEDLES = [
  "Structures.storage ghost",
  "memory.storage was a live id",
  "boxMin",
  "colonyBuilderCap",
  "ticksToDowngrade < 3000",
  "Math.min(550",
  "s.pos.roomName !== room.name",
  "pinned.pos.roomName !== this.room.name",
];

function storeE(o) {
  if (!o) return 0;
  if (o.store && typeof o.store.energy === "number") return o.store.energy;
  if (typeof o.energy === "number") return o.energy;
  return 0;
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

async function api(p) {
  const url = p.startsWith("http") ? p : `${BASE}${p}`;
  const res = await fetch(url, { headers: H });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 200), statusHint: res.status };
  }
  return { status: res.status, json };
}

const time1 = await api("/api/game/time");
const me = await api("/api/auth/me");
const meId = me.json._id;
const roomsRes = await api(`/api/user/rooms?id=${meId}`);
const code = await api("/api/user/code?branch=main");
const mainMod = code.json?.modules?.main || "";
const memFull = await api("/api/user/memory");
const mem = decodeMem(memFull.json?.data);

const filmRooms = ["W3N3", "W2N1", "W1N1", "W3N1", "W1N2"];
const roomObjs = {};
for (const name of filmRooms) {
  roomObjs[name] = (await api(`/api/game/room-objects?room=${name}`)).json;
}
const time2 = await api("/api/game/time");
const time = time2.json?.time ?? time1.json?.time;

function slimCreepMem(c, name) {
  return {
    name,
    role: c.role,
    building: c.building,
    locked: c.locked,
    storage: c.storage,
    suicide: c.suicide,
    targetRoom: c.targetRoom,
    homeRoom: c.homeRoom,
  };
}

function filmRoom(name) {
  const j = roomObjs[name];
  const objs = j?.objects || [];
  const ctrl = objs.find((o) => o.type === "controller");
  const myCreeps = objs.filter((o) => o.type === "creep" && o.user === meId);
  const sites = objs.filter((o) => o.type === "constructionSite" && o.user === meId);
  const foreignSites = objs.filter((o) => o.type === "constructionSite" && o.user && o.user !== meId);
  const storage = objs.find((o) => o.type === "storage");
  const containers = objs.filter((o) => o.type === "container");
  const ext = objs.filter((o) => o.type === "extension");
  const spawns = objs.filter((o) => o.type === "spawn");
  const roads = objs.filter((o) => o.type === "road");
  const ramparts = objs.filter((o) => o.type === "rampart" && o.user === meId);
  const towers = objs.filter((o) => o.type === "tower");
  const builders = myCreeps
    .filter((c) => /^Builder/i.test(c.name) || /buildcontainer/i.test(c.name))
    .map((c) => {
      const cm = mem?.creeps?.[c.name] || {};
      return {
        name: c.name,
        xy: [c.x, c.y],
        e: storeE(c),
        body: (c.body || []).map((p) => (typeof p === "string" ? p[0] : (p.type || "?")[0])).join(""),
        fatigue: c.fatigue,
        build: c.actionLog?.build || null,
        harvest: c.actionLog?.harvest || null,
        withdraw: c.actionLog?.withdraw || null,
        transfer: c.actionLog?.transfer || null,
        repair: c.actionLog?.repair || null,
        say: c.actionLog?.say || null,
        memStorage: cm.storage ?? null,
        locked: cm.locked ?? null,
        building: cm.building ?? null,
        suicide: cm.suicide ?? null,
        ghostPin: cm.storage === "5ed584b7bfe88a4",
      };
    });
  const rm = mem?.rooms?.[name] || {};
  return {
    name,
    mine: ctrl && ctrl.user === meId,
    rcl: ctrl?.level,
    p: ctrl?.progress,
    dg: typeof ctrl?.downgradeTime === "number" ? ctrl.downgradeTime - time : null,
    sm: ctrl?.safeMode ?? 0,
    sma: ctrl?.safeModeAvailable,
    danger: rm.danger ?? null,
    fuse: rm.blown_fuse ?? null,
    planV2: rm.planV2 ? { v: rm.planV2.v, hash: rm.planV2.hash } : null,
    planPackMiss: rm.planPackMiss ?? null,
    structStorage: rm.Structures?.storage ?? null,
    structSpawn: rm.Structures?.spawn ?? null,
    storageE: storage ? storeE(storage) : null,
    storagePos: storage ? [storage.x, storage.y] : null,
    storageId: storage?.id ?? storage?._id ?? null,
    spawn: spawns.map((s) => ({
      name: s.name,
      xy: [s.x, s.y],
      e: storeE(s),
      spawning: s.spawning || null,
      mine: s.user === meId,
    })),
    ext: ext.length,
    extE: ext.reduce((a, e) => a + storeE(e), 0),
    roads: roads.length,
    ramparts: ramparts.length,
    towers: towers.length,
    containers: containers.map((c) => ({
      xy: [c.x, c.y],
      e: storeE(c),
      id: c.id || c._id || null,
    })),
    sites: sites.map((s) => ({
      t: s.structureType,
      xy: [s.x, s.y],
      p: s.progress || 0,
      tot: s.progressTotal,
    })),
    foreignSites: foreignSites.map((s) => ({
      t: s.structureType,
      xy: [s.x, s.y],
      p: s.progress || 0,
      tot: s.progressTotal,
    })),
    creeps: myCreeps.length,
    roles: myCreeps.reduce((a, c) => {
      const role = String(c.name).split("-")[0];
      a[role] = (a[role] || 0) + 1;
      return a;
    }, {}),
    builders,
    spawn_list: rm.spawn_list || [],
  };
}

const out = {
  polled: new Date().toISOString(),
  dest: "vps",
  host: BASE,
  time1: time1.json?.time,
  time2: time,
  me: { username: me.json.username, _id: meId, gcl: me.json.gcl, cpu: me.json.cpu },
  userRooms: roomsRes.json,
  code: {
    status: code.status,
    ok: code.json?.ok,
    branch: code.json?.branch,
    timestamp: code.json?.timestamp,
    moduleBytes: typeof mainMod === "string" ? mainMod.length : 0,
    sha256: typeof mainMod === "string" ? createHash("sha256").update(mainMod).digest("hex") : null,
    needles: Object.fromEntries(NEEDLES.map((n) => [n, typeof mainMod === "string" && mainMod.includes(n)])),
  },
  cpu: mem?.CPU && {
    last: mem.CPU.lastTick,
    bucket: mem.CPU.bucket,
    hundred: mem.CPU.hundredTickAvg?.avg,
    five: mem.CPU.fiveHundredTickAvg?.avg,
  },
  target_colonise: mem?.target_colonise,
  CanClaimRemote: mem?.CanClaimRemote,
  rooms: Object.fromEntries(filmRooms.map((n) => [n, filmRoom(n)])),
};

const dumpPath = path.join(REPO, "docs/speedrun-ledger/_vps-now.poll.json");
fs.writeFileSync(dumpPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
console.error("wrote", dumpPath);
