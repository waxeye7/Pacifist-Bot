#!/usr/bin/env node
/** Read-only: find StorageLink===controllerLink and overlap links on live/vps/local. */
import fs from "fs";
import { gunzipSync } from "zlib";

const cfgAll = JSON.parse(fs.readFileSync("screeps.json", "utf8"));

function dec(data) {
  if (data == null || typeof data === "object") return data;
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

function baseOf(cfg) {
  const port = cfg.port && cfg.port !== 80 && cfg.port !== 443 ? `:${cfg.port}` : "";
  return `${cfg.protocol || "http"}://${cfg.hostname}${port}`.replace(/\/+$/, "");
}

function unpack(p) {
  if (typeof p !== "number") return p;
  return { x: p % 50, y: Math.floor(p / 50) };
}

function cheb(a, b) {
  if (!a || !b) return null;
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

async function scanDest(name, opts) {
  const cfg = cfgAll[name];
  if (!cfg?.token) return { dest: name, error: "no token" };
  const BASE = baseOf(cfg);
  const H = { "X-Token": cfg.token, "X-Username": cfg.token };
  const shard = opts.shard;
  const qs = shard ? `?shard=${shard}` : "";
  const api = async (p) => {
    const r = await fetch(`${BASE}${p}`, { headers: H, signal: AbortSignal.timeout(12000) });
    const t = await r.text();
    try {
      return JSON.parse(t);
    } catch {
      return { _raw: t.slice(0, 160), status: r.status };
    }
  };

  let me;
  try {
    me = await api("/api/auth/me");
  } catch (e) {
    return { dest: name, error: "auth " + e.message };
  }
  if (!me || !me._id) return { dest: name, error: "auth failed " + JSON.stringify(me).slice(0, 120) };

  let rooms = [];
  try {
    const ur = await api(`/api/user/rooms?id=${me._id}`);
    if (shard) rooms = (ur.shards && ur.shards[shard]) || [];
    else rooms = ur.rooms || (ur.shards && Object.values(ur.shards).flat()) || [];
  } catch (e) {
    return { dest: name, error: "rooms " + e.message };
  }

  let mem = {};
  try {
    mem = dec((await api(`/api/user/memory${qs}`)).data) || {};
  } catch (e) {
    return { dest: name, error: "memory " + e.message, rooms };
  }

  const out = [];
  for (const room of rooms) {
    let objs = [];
    try {
      const j = await api(`/api/game/room-objects?room=${room}${shard ? `&shard=${shard}` : ""}`);
      objs = j.objects || [];
    } catch {
      out.push({ room, error: "objects fetch failed" });
      continue;
    }
    const ctrl = objs.find((o) => o.type === "controller");
    const stor = objs.find((o) => o.type === "storage");
    const links = objs.filter((o) => o.type === "link");
    const src = objs.filter((o) => o.type === "source");
    const S = (mem.rooms && mem.rooms[room] && mem.rooms[room].Structures) || {};
    const plan = mem.rooms && mem.rooms[room] && mem.rooms[room].planV2;
    const planLinks = plan && plan.t && plan.t.link ? plan.t.link.map(unpack) : [];
    const issues = [];
    if (S.controllerLink && S.StorageLink && S.controllerLink === S.StorageLink) {
      issues.push("SAME_ID");
    }
    const overlap = [];
    for (const l of links) {
      const toC = cheb(l, ctrl);
      const toS = cheb(l, stor);
      const toSrc = src.map((s) => cheb(l, s));
      const nearSrc = toSrc.some((d) => d != null && d <= 1);
      if (toC != null && toS != null && toC <= 3 && toS <= 2 && !nearSrc) overlap.push({ x: l.x, y: l.y, id: l._id, toC, toS });
    }
    if (overlap.length) issues.push("OVERLAP_TILE");
    const storObj = S.StorageLink && links.find((l) => l._id === S.StorageLink);
    const ctrlObj = S.controllerLink && (links.find((l) => l._id === S.controllerLink) || objs.find((o) => o._id === S.controllerLink));
    if (storObj && ctrl && cheb(storObj, ctrl) <= 3 && src.every((s) => cheb(storObj, s) > 1)) {
      issues.push("STORAGE_IS_CTRL_DEPOT");
    }
    if (ctrlObj && ctrlObj.type === "container" && links.some((l) => cheb(l, ctrl) <= 3)) {
      issues.push("CTRL_KEY_IS_CONTAINER");
    }
    if (planLinks[0] && storObj && (storObj.x !== planLinks[0].x || storObj.y !== planLinks[0].y)) {
      issues.push(`HUB_OFF_PLAN want ${planLinks[0].x},${planLinks[0].y} got ${storObj.x},${storObj.y}`);
    }
    if (planLinks[2] && ctrlObj && ctrlObj.type === "link" && (ctrlObj.x !== planLinks[2].x || ctrlObj.y !== planLinks[2].y)) {
      issues.push(`CTRL_OFF_PLAN want ${planLinks[2].x},${planLinks[2].y} got ${ctrlObj.x},${ctrlObj.y}`);
    }
    out.push({
      room,
      rcl: ctrl ? ctrl.level : null,
      issues,
      ctrl: ctrl && { x: ctrl.x, y: ctrl.y },
      storage: stor && { x: stor.x, y: stor.y },
      links: links.map((l) => ({
        x: l.x,
        y: l.y,
        id: l._id,
        e: l.store && l.store.energy,
        toC: cheb(l, ctrl),
        toS: cheb(l, stor),
        toSrc: src.map((s) => cheb(l, s)),
      })),
      mem: { controllerLink: S.controllerLink || null, StorageLink: S.StorageLink || null },
      planLinks,
      overlap,
    });
  }
  return { dest: name, host: BASE, user: me.username, rooms: out };
}

const dests = [
  ["main", { shard: "shard3" }],
  ["vps", {}],
  ["pserver", {}],
];

const reports = [];
for (const [name, opts] of dests) {
  try {
    reports.push(await scanDest(name, opts));
  } catch (e) {
    reports.push({ dest: name, error: e.message });
  }
}

for (const r of reports) {
  console.log(`\n=== ${r.dest} ${r.host || ""} ${r.user || ""} ===`);
  if (r.error) {
    console.log("  ERROR", r.error);
    continue;
  }
  if (!r.rooms.length) {
    console.log("  no owned rooms");
    continue;
  }
  for (const room of r.rooms) {
    if (room.error) {
      console.log(`  ${room.room} ERROR ${room.error}`);
      continue;
    }
    const flag = room.issues.length ? " !! " + room.issues.join(" | ") : " ok";
    const n = room.links.length;
    console.log(
      `  ${room.room} RCL${room.rcl} links=${n}${flag}` +
        (n
          ? `  mem ctrl=${(room.mem.controllerLink || "").slice(0, 8)} stor=${(room.mem.StorageLink || "").slice(0, 8)}` +
            `  tiles ${room.links.map((l) => `${l.x},${l.y} c${l.toC}/s${l.toS}`).join(" ; ")}`
          : ""),
    );
    if (room.overlap.length) {
      console.log(`      overlap ${room.overlap.map((l) => `${l.x},${l.y}`).join(" ")}`);
    }
    if (room.planLinks.length) {
      console.log(`      planLinks ${room.planLinks.map((l) => l.x + "," + l.y).join(" ")}`);
    }
  }
}
