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

const ROOMS = ["E35N59", "E39N58", "E36N58", "E37N57", "E38N56", "E36N57"];
const DUE = 82280940;

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

function roomSnap(name, objects, users, meId, time) {
  const objs = objects || [];
  const ctrl = objs.find((o) => o.type === "controller");
  const ownerId = ctrl && ctrl.user;
  const ownerName = ownerId && users && users[ownerId] && users[ownerId].username;
  const mine = ownerId === meId;
  const spawns = objs.filter((o) => o.type === "spawn");
  const mySpawns = spawns.filter((o) => o.user === meId);
  const foreignSpawns = spawns.filter((o) => o.user && o.user !== meId);
  const sites = objs.filter((o) => o.type === "constructionSite");
  const mySpawnSites = sites.filter((o) => o.user === meId && o.structureType === "spawn");
  const creeps = objs.filter((o) => o.type === "creep" && o.user === meId);
  return {
    name,
    ownerId: ownerId || null,
    ownerName: ownerName || null,
    mine,
    rcl: ctrl ? ctrl.level : null,
    progress: ctrl ? ctrl.progress : null,
    downgradeTime: ctrl ? ctrl.downgradeTime : null,
    dg: ctrl && typeof ctrl.downgradeTime === "number" && typeof time === "number"
      ? ctrl.downgradeTime - time
      : null,
    mySpawns: mySpawns.map((s) => ({ name: s.name, x: s.x, y: s.y })),
    foreignSpawns: foreignSpawns.map((s) => ({
      name: s.name,
      x: s.x,
      y: s.y,
      user: users?.[s.user]?.username || s.user,
    })),
    mySpawnSites: mySpawnSites.map((s) => ({
      name: s.name,
      x: s.x,
      y: s.y,
      p: s.progress || 0,
      tot: s.progressTotal,
    })),
    myCreeps: creeps.length,
    creepNames: creeps.map((c) => c.name),
    spawnlessMine: mine && mySpawns.length === 0,
  };
}

const time1 = await api(`/api/game/time?shard=${SHARD}`);
const me = await api("/api/auth/me");
const meId = me.json._id;
const roomsRes = await api(`/api/user/rooms?id=${meId}`);
const memFull = await api(`/api/user/memory?shard=${SHARD}`);
const mem = decodeMem(memFull.json?.data);

const roomObjs = {};
let usersAcc = {};
for (const name of ROOMS) {
  const r = await api(`/api/game/room-objects?room=${name}&shard=${SHARD}`);
  roomObjs[name] = r.json;
  if (r.json?.users) Object.assign(usersAcc, r.json.users);
}

const time2 = await api(`/api/game/time?shard=${SHARD}`);
const time = time2.json?.time ?? time1.json?.time;

const rooms = {};
for (const name of ROOMS) {
  const j = roomObjs[name];
  rooms[name] = roomSnap(name, j?.objects, { ...usersAcc, ...(j?.users || {}) }, meId, time);
}

const owned = (roomsRes.json?.shards && roomsRes.json.shards[SHARD]) || roomsRes.json?.rooms || [];
const ax = mem?.autoExpand;
const tc = mem?.target_colonise;

let fired = "unknown";
let hold = "unknown";
if (typeof time === "number" && time < DUE) {
  fired = "not yet due";
  hold = "n/a — abort not due";
} else if (ax && ax.room === "E35N59" && ax.phase === "claimed") {
  fired = "NO — still claimed E35N59 past 82280940 (8000 not live or since missing)";
  hold = "n/a — abort did not fire";
} else if (ax && ax.room === "E38N56") {
  fired = "YES or PHASE_TIMEOUT — pointer left E35N59";
  hold = "NO — slid to E38N56";
} else if (ax && ax.room && ax.room !== "E35N59") {
  fired = `maybe — pointer now ${ax.room} / ${ax.phase}`;
  hold = `NO — new pick ${ax.room}`;
} else if (!ax) {
  fired = "YES — autoExpand deleted";
  const spawnless = Object.values(rooms).filter((r) => r.spawnlessMine).map((r) => r.name);
  hold = spawnless.length
    ? `YES — idle, spawnless still owned (${spawnless.join(",")}), no new pick`
    : "idle, no spawnless owned in polled set";
} else {
  fired = `partial — autoExpand ${JSON.stringify(ax)}`;
  hold = "see autoExpand";
}

const out = {
  polled: new Date().toISOString(),
  dest: "main",
  shard: SHARD,
  time1: time1.json?.time,
  time2: time2.json?.time,
  due: DUE,
  ticksPastDue: typeof time === "number" ? time - DUE : null,
  me: { username: me.json.username, _id: meId, gcl: me.json.gcl },
  owned,
  autoExpand: ax ?? null,
  target_colonise: tc ?? null,
  featuresAutoExpand: mem?.features?.autoExpand,
  CanClaimRemote: mem?.CanClaimRemote,
  rooms,
  verdict: { fired, hold },
};

process.stdout.write(JSON.stringify(out, null, 2) + "\n");
