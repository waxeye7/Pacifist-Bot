#!/usr/bin/env node
/** Detail poll for the wrecked rooms. Read-only. */
import fs from "fs";
import path from "path";
import { gunzipSync } from "zlib";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8")).main;
const BASE = `${cfg.protocol || "https"}://${cfg.hostname}`;
const SHARD = "shard3";
const H = { "X-Token": cfg.token, "X-Username": cfg.token };
const ME = "62f89e0d84c31c184db79629";
const ROOMS = ["E37N59", "E36N57", "E37N58", "E37N57", "E39N58"];

async function api(p) {
  const res = await fetch(`${BASE}${p}`, { headers: H });
  return { status: res.status, json: await res.json() };
}
function decodeMem(data) {
  if (data == null) return data;
  if (typeof data === "object") return data;
  if (typeof data === "string" && data.startsWith("gz:")) {
    return JSON.parse(gunzipSync(Buffer.from(data.slice(3), "base64")).toString());
  }
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

const time = (await api(`/api/game/time?shard=${SHARD}`)).json.time;
const mem = decodeMem((await api(`/api/user/memory?shard=${SHARD}`)).json.data) || {};
const out = { tick: time, polled: new Date().toISOString(), rooms: {} };

for (const name of ROOMS) {
  const r = (await api(`/api/game/room-objects?room=${name}&shard=${SHARD}`)).json;
  const objs = r.objects || [];
  const users = r.users || {};
  const byType = {};
  for (const o of objs) {
    byType[o.type] = (byType[o.type] || 0) + 1;
  }
  const mine = (t) => objs.filter((o) => o.type === t && o.user === ME);
  const all = (t) => objs.filter((o) => o.type === t);
  const ext = mine("extension");
  let extE = 0,
    extCap = 0;
  for (const e of ext) {
    extE += e.store?.energy || e.energy || 0;
    extCap += 50;
  }
  const stor = all("storage")[0];
  const term = all("terminal")[0];
  const spawn = mine("spawn")[0];
  const towers = mine("tower");
  const ramparts = objs.filter((o) => o.type === "rampart");
  const containers = all("container");
  const links = all("link");
  const hostiles = objs.filter((o) => o.type === "creep" && o.user && o.user !== ME);
  const myCreeps = objs.filter((o) => o.type === "creep" && o.user === ME);
  const drops = objs.filter((o) => o.type === "energy" || o.type === "resource");
  const sites = objs.filter((o) => o.type === "constructionSite");

  function cheb(a, b) {
    if (!a || !b) return null;
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  const rm = mem.rooms?.[name] || {};
  const planV2 = rm.planV2 || null;
  const planKeys = planV2 ? Object.keys(planV2) : [];
  let planSummary = null;
  if (planV2) {
    const t = planV2.t || planV2.structures || planV2.s || null;
    planSummary = {
      keys: planKeys,
      hash: planV2.planHash || planV2.hash || planV2.h,
      tKeys: t ? Object.keys(t) : null,
      towers: t && (t.tower || t.towers) ? (t.tower || t.towers).slice(0, 8) : null,
      spawns: t && (t.spawn || t.spawns) ? (t.spawn || t.spawns).slice(0, 4) : null,
      storage: t && (t.storage || t.storages) ? (t.storage || t.storages).slice(0, 2) : null,
    };
  }

  out.rooms[name] = {
    byType,
    ctrl: all("controller").map((c) => ({
      x: c.x,
      y: c.y,
      level: c.level,
      p: c.progress,
      user: c.user,
      sm: c.safeMode,
      sma: c.safeModeAvailable,
      smc: c.safeModeCooldown,
      dg: c.downgradeTime ? c.downgradeTime - time : null,
    })),
    spawn: spawn
      ? {
          name: spawn.name,
          x: spawn.x,
          y: spawn.y,
          e: spawn.store?.energy ?? spawn.energy,
          hits: spawn.hits,
          spawning: spawn.spawning,
        }
      : null,
    storage: stor
      ? { x: stor.x, y: stor.y, e: stor.store?.energy || 0, store: stor.store, hits: stor.hits, user: stor.user }
      : null,
    terminal: term
      ? { x: term.x, y: term.y, store: term.store, hits: term.hits }
      : null,
    towers: towers.map((t) => {
      const onR = ramparts.find((rp) => rp.x === t.x && rp.y === t.y);
      return {
        x: t.x,
        y: t.y,
        e: t.store?.energy ?? t.energy ?? 0,
        hits: t.hits,
        onRampart: !!onR,
        rampHits: onR ? onR.hits : null,
        toSpawn: cheb(t, spawn),
        toStorage: cheb(t, stor),
        border: t.x <= 2 || t.x >= 47 || t.y <= 2 || t.y >= 47,
      };
    }),
    ext: { n: ext.length, e: extE, cap: extCap },
    containers: containers.map((c) => ({
      x: c.x,
      y: c.y,
      e: c.store?.energy || 0,
      user: c.user,
      hits: c.hits,
    })),
    links: links.map((l) => ({ x: l.x, y: l.y, e: l.store?.energy || 0, user: l.user })),
    sources: all("source").map((s) => ({ x: s.x, y: s.y, e: s.energy })),
    mineral: all("mineral").map((m) => ({ x: m.x, y: m.y, t: m.mineralType })),
    hostiles: hostiles.map((c) => ({
      name: c.name,
      user: users[c.user]?.username || c.user,
      x: c.x,
      y: c.y,
      hits: c.hits,
      hitsMax: c.hitsMax,
      ttl: c.ageTime ? c.ageTime - time : null,
      body: (c.body || []).reduce((a, p) => {
        const t = (p.type || p)[0];
        a[t] = (a[t] || 0) + 1;
        return a;
      }, {}),
    })),
    myCreeps: myCreeps.map((c) => ({
      name: c.name,
      x: c.x,
      y: c.y,
      hits: c.hits,
      hitsMax: c.hitsMax,
      e: c.store?.energy || 0,
      ttl: c.ageTime ? c.ageTime - time : null,
      body: (c.body || []).map((p) => (p.type || p)[0]).join(""),
    })),
    drops: drops.map((d) => ({ x: d.x, y: d.y, t: d.resourceType || "energy", n: d.amount })),
    dropTotal: drops.reduce((s, d) => s + (d.amount || 0), 0),
    sites: sites.map((s) => ({
      x: s.x,
      y: s.y,
      st: s.structureType,
      p: s.progress,
      pt: s.progressTotal,
      user: users[s.user]?.username || s.user,
    })),
    rampartsNearBorder: ramparts
      .filter((rp) => rp.x <= 2 || rp.x >= 47 || rp.y <= 2 || rp.y >= 47)
      .map((rp) => ({ x: rp.x, y: rp.y, hits: rp.hits, user: rp.user })),
    structsOnBorder: objs
      .filter(
        (o) =>
          o.user === ME &&
          (o.x <= 2 || o.x >= 47 || o.y <= 2 || o.y >= 47) &&
          o.type !== "road" &&
          o.type !== "rampart" &&
          o.type !== "constructedWall" &&
          o.type !== "creep" &&
          o.type !== "constructionSite",
      )
      .map((o) => ({ type: o.type, x: o.x, y: o.y, hits: o.hits })),
    mem: {
      danger: rm.danger,
      danger_timer: rm.danger_timer,
      blown_fuse: rm.blown_fuse,
      spawn_list: rm.spawn_list,
      c_spawned: rm.c_spawned,
      structures: rm.Structures,
      construction: rm.construction
        ? {
            keys: Object.keys(rm.construction),
            rampartN: (rm.construction.rampartLocations || []).length,
            sampleRamp: (rm.construction.rampartLocations || []).slice(0, 8),
          }
        : null,
      planSummary,
      planMigration: rm.planMigration || null,
    },
  };
}

const dest = path.join(REPO, "docs/speedrun-ledger/_live-rooms.poll.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
const lines = [`# Live rooms ${out.polled} tick ${out.tick}`, ""];
for (const name of ROOMS) {
  const r = out.rooms[name];
  lines.push(`## ${name}`);
  lines.push(
    `  spawn ${r.spawn ? `${r.spawn.x},${r.spawn.y} e=${r.spawn.e}` : "none"} storage ${r.storage ? `${r.storage.x},${r.storage.y} e=${r.storage.e}` : "none"} term ${r.terminal ? `${r.terminal.x},${r.terminal.y} ${JSON.stringify(r.terminal.store)}` : "none"}`,
  );
  lines.push(`  ext ${r.ext.n} e=${r.ext.e}/${r.ext.cap} containers ${JSON.stringify(r.containers)} links ${JSON.stringify(r.links)}`);
  lines.push(`  towers ${JSON.stringify(r.towers)}`);
  lines.push(`  sources ${JSON.stringify(r.sources)} hostiles ${JSON.stringify(r.hostiles)}`);
  lines.push(`  creeps ${r.myCreeps.map((c) => `${c.name}@${c.x},${c.y} e${c.e} ttl${c.ttl}`).join("; ") || "none"}`);
  lines.push(`  drops ${r.dropTotal} ${JSON.stringify(r.drops.slice(0, 8))}`);
  lines.push(`  sites ${JSON.stringify(r.sites)}`);
  lines.push(`  borderRamp ${JSON.stringify(r.rampartsNearBorder)} borderStructs ${JSON.stringify(r.structsOnBorder)}`);
  lines.push(`  danger=${r.mem.danger} timer=${r.mem.danger_timer} fuse=${r.mem.blown_fuse} spawn_list=${JSON.stringify(r.mem.spawn_list)}`);
  lines.push(`  plan ${JSON.stringify(r.mem.planSummary)}`);
  lines.push(`  structs ${JSON.stringify(r.mem.structures)}`);
  lines.push("");
}
const md = lines.join("\n");
fs.writeFileSync(path.join(REPO, "docs/speedrun-ledger/_live-rooms.md"), md);
process.stdout.write(md);
