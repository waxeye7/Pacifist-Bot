/**
 * Round-29 mechanical review helpers. Throwaway. Never writes the artifact.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { checkRoom } from "../validate.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(DIR, "../../out-v2");
export const PLANS_PATH = path.join(ROOT, "plans-hub.json");
export const ROOMS_PATH =
  process.env.ROOMS_FILE || path.resolve(DIR, "../_r28-mech/rooms.json");
export const EXPECTED_MD5 = "c2e6039a7ac5816c1c6c40161685354a";

export const D8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
export const D4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
export const K = (t) => `${t.x},${t.y}`;
export const KT = (x, y) => `${x},${y}`;
export const idx = (x, y) => x + y * 50;
export const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
export function fmix32(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
export function roomHash(room) {
  return fmix32(fnv1a32("round29-mech|" + room));
}

export function loadPlans() {
  const raw = fs.readFileSync(PLANS_PATH);
  const md5 = crypto.createHash("md5").update(raw).digest("hex");
  const all = JSON.parse(raw.toString("utf8"));
  const plans = all.filter((p) => p && p.room && !p.error);
  return { raw, md5, all, plans };
}

export function loadRooms() {
  if (!fs.existsSync(ROOMS_PATH)) {
    throw new Error("missing rooms dump: " + ROOMS_PATH);
  }
  const rooms = JSON.parse(fs.readFileSync(ROOMS_PATH, "utf8"));
  return { rooms, byRoom: new Map(rooms.map((r) => [r.room, r])) };
}

export function hashedRooms(plans) {
  const rows = plans.map((p) => ({ room: p.room, h: roomHash(p.room) }));
  rows.sort((a, b) => a.h - b.h || a.room.localeCompare(b.room));
  return rows;
}

const FLEET_RE = /fleetMediansMeasured|eco\.ctrlMedian|eco\.srcMedian|eco\.ctrlGate|eco\.srcGate/;
export function realFails(res) {
  return (res.fails || []).filter((f) => !FLEET_RE.test(f));
}

export function tileAt(terrain, x, y) {
  if (x < 0 || x > 49 || y < 0 || y > 49) return 1;
  return parseInt(terrain.charAt(y * 50 + x), 10);
}
export function isWall(terrain, x, y) {
  return (tileAt(terrain, x, y) & 1) > 0;
}
export function walkable(terrain, x, y) {
  return x >= 0 && x <= 49 && y >= 0 && y <= 49 && !isWall(terrain, x, y);
}

/** Independent D8 exterior flood. blockSet is keys "x,y". */
export function floodExterior(terrain, blockSet) {
  const e = new Uint8Array(2500);
  const q = [];
  const push = (x, y) => {
    if (!walkable(terrain, x, y) || blockSet.has(KT(x, y))) return;
    const i = idx(x, y);
    if (e[i]) return;
    e[i] = 1;
    q.push(i);
  };
  for (let i = 0; i < 50; i++) {
    push(i, 0);
    push(i, 49);
    push(0, i);
    push(49, i);
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % 50;
    const y = (i / 50) | 0;
    for (const [dx, dy] of D8) push(x + dx, y + dy);
  }
  return e;
}

export function depthFromExterior(ext) {
  const depth = new Int16Array(2500).fill(999);
  const q = [];
  for (let i = 0; i < 2500; i++) {
    if (ext[i]) {
      depth[i] = 0;
      q.push(i);
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % 50;
    const y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = idx(nx, ny);
      if (depth[ni] <= depth[i] + 1) continue;
      depth[ni] = depth[i] + 1;
      q.push(ni);
    }
  }
  return depth;
}

export function mineralSeat(plan) {
  if (!plan.mineral) return null;
  return (plan.structures?.container || []).find((c) => cheb(c, plan.mineral) <= 1) || null;
}

export function structHolds(plan) {
  const m = new Map();
  for (const t of Object.keys(plan.structures || {})) {
    for (const p of plan.structures[t] || []) {
      const k = K(p);
      const was = m.get(k);
      m.set(k, was ? `${was}+${t}` : t);
    }
  }
  return m;
}

export function makeChecker(byPlan, byRoom) {
  return function run(name, room, mutate) {
    const src = byPlan.get(room);
    const d = byRoom.get(room);
    if (!src || !d) return { name, room, status: "SKIP", detail: "no plan/terrain" };
    const p = JSON.parse(JSON.stringify(src));
    try {
      mutate(p);
    } catch (e) {
      return { name, room, status: "THREW", detail: "mutate: " + e.message };
    }
    let res;
    try {
      res = checkRoom(p, d.terrain, d.objects, null);
    } catch (e) {
      return { name, room, status: "THREW", detail: e.message };
    }
    const fails = realFails(res);
    return {
      name,
      room,
      status: fails.length ? "BITES" : "ESCAPE",
      detail: fails[0] || "pass",
      nFails: fails.length,
      fails: fails.slice(0, 4),
    };
  };
}
