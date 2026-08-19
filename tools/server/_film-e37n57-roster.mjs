#!/usr/bin/env node
/** One-shot HTTP GET dest `main` shard3 film of E37N57 roster. No Memory write. No push. */
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
const ROOM = "E37N57";

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

function countType(body, type) {
  const letter = type[0].toLowerCase();
  return (body || []).filter((p) => {
    const t = typeof p === "string" ? p : p.type || "";
    return t === type || t[0] === type[0] || t[0].toLowerCase() === letter;
  }).length;
}

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

const time1 = await api(`/api/game/time?shard=${SHARD}`);
const me = await api("/api/auth/me");
const meId = me.json._id;
const roomsRes = await api(`/api/user/rooms?id=${meId}`);
const memFull = await api(`/api/user/memory?shard=${SHARD}`);
const mem = decodeMem(memFull.json?.data);
const roomRes = await api(`/api/game/room-objects?room=${ROOM}&shard=${SHARD}`);
const time2 = await api(`/api/game/time?shard=${SHARD}`);
const time = time2.json?.time ?? time1.json?.time;

const objs = roomRes.json?.objects || [];
const ctrl = objs.find((o) => o.type === "controller");
const spawn = objs.find((o) => o.type === "spawn" && o.name === "Spawn6") || objs.find((o) => o.type === "spawn");
const ext = objs.filter((o) => o.type === "extension");
const sites = objs.filter((o) => o.type === "constructionSite");
const mySites = sites.filter((o) => o.user === meId);
const extSites = mySites.filter((s) => s.structureType === "extension");
const myCreeps = objs.filter((o) => o.type === "creep" && o.user === meId);
const sources = objs.filter((o) => o.type === "source");
const containers = objs.filter((o) => o.type === "container");

function filmCreep(c) {
  const cm = mem?.creeps?.[c.name] || {};
  const body = c.body || [];
  return {
    name: c.name,
    xy: [c.x, c.y],
    e: storeE(c),
    cap: c.storeCapacity || (c.store && Object.values(c.store).reduce((a, n) => a + n, 0)) || null,
    ttl: typeof c.ageTime === "number" ? c.ageTime - time : null,
    body: bodyLetters(body),
    work: countType(body, "work"),
    carry: countType(body, "carry"),
    move: countType(body, "move"),
    role: cm.role || String(c.name).split("-")[0],
    homeRoom: cm.homeRoom || null,
    targetRoom: cm.targetRoom || null,
    source: cm.source || null,
    spawning: !!c.spawning,
  };
}

const creeps = myCreeps.map(filmCreep);
const localMiners = creeps.filter(
  (c) =>
    /EnergyMiner/i.test(c.name) &&
    (c.homeRoom === ROOM || (!c.homeRoom && /-E37N57$/.test(c.name))),
);
const allMinersInRoom = creeps.filter((c) => /EnergyMiner/i.test(c.name));
const localCarriers = creeps.filter(
  (c) =>
    /Carrier|^carry/i.test(c.name) &&
    (c.homeRoom === ROOM || (!c.homeRoom && /-E37N57$/.test(c.name))),
);
const allCarriersInRoom = creeps.filter((c) => /Carrier|^carry/i.test(c.name));

const siteTypes = {};
for (const s of mySites) {
  const t = s.structureType || "?";
  if (!siteTypes[t]) siteTypes[t] = [];
  siteTypes[t].push({ x: s.x, y: s.y, p: s.progress || 0, tot: s.progressTotal, name: s.name });
}

const spawnList = mem?.rooms?.[ROOM]?.spawn_list || [];
const rm = mem?.rooms?.[ROOM] || {};

const out = {
  polled: new Date().toISOString(),
  dest: "main",
  shard: SHARD,
  tick1: time1.json?.time,
  tick2: time2.json?.time,
  me: { _id: meId, username: me.json.username, gcl: me.json.gcl, cpu: me.json.cpu },
  owned: (roomsRes.json?.shards && roomsRes.json.shards[SHARD]) || roomsRes.json?.rooms || [],
  room: ROOM,
  mine: ctrl && ctrl.user === meId,
  rcl: ctrl?.level ?? null,
  p: ctrl?.progress ?? null,
  pt: ctrl?.progressTotal ?? null,
  dg: typeof ctrl?.downgradeTime === "number" ? ctrl.downgradeTime - time : null,
  spawn: spawn
    ? {
        name: spawn.name,
        xy: [spawn.x, spawn.y],
        e: storeE(spawn),
        cap: spawn.storeCapacity || spawn.energyCapacity || 300,
        spawning: spawn.spawning || null,
        hits: spawn.hits,
        mine: spawn.user === meId,
      }
    : null,
  extBuilt: ext.length,
  extE: ext.reduce((a, e) => a + storeE(e), 0),
  extSites: extSites.map((s) => ({ x: s.x, y: s.y, p: s.progress || 0, tot: s.progressTotal })),
  siteTypes,
  mySites: mySites.length,
  localMiners,
  allMinersInRoom,
  localMinerWork: localMiners.reduce((a, c) => a + c.work, 0),
  allMinerWork: allMinersInRoom.reduce((a, c) => a + c.work, 0),
  localCarriers,
  allCarriersInRoom,
  creeps,
  sources: sources.map((s) => ({ id: s.id || s._id, xy: [s.x, s.y], e: s.energy, regen: s.ticksToRegeneration })),
  containers: containers.map((c) => ({ xy: [c.x, c.y], e: storeE(c) })),
  spawn_list: spawnList,
  c_spawned: rm.c_spawned ?? null,
  structures: rm.Structures
    ? { spawn: rm.Structures.spawn, storage: rm.Structures.storage, towers: rm.Structures.towers }
    : null,
  autoExpand: mem?.autoExpand ?? null,
};

const outPath = path.join(REPO, "docs/speedrun-ledger/_live-e37n57-roster.poll.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
console.error("wrote", outPath);
