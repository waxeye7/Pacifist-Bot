/**
 * Round-30 owner-voice helpers. Throwaway. Never writes the artifact.
 * Does not import validate.mjs except via check() for mutation tests.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(DIR, "../../out-v2");
export const PLANS_PATH = path.join(ROOT, "plans-hub.json");
export const ROOMS_PATH =
  process.env.ROOMS_FILE || path.resolve(DIR, "../_r28-mech/rooms.json");
export const ANIM = path.join(ROOT, "anim");
export const PAGES = ROOT;
export const EXPECTED_MD5 = "7eed9e2c02f0641ec4fc80b4c8a0b496";

export const D8 = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];
export const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const K = (t) => `${t.x},${t.y}`;
export const KT = (x, y) => `${x},${y}`;
export const idx = (x, y) => x + y * 50;
export const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const WALL = 1;
export const SWAMP = 2;

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
  return fmix32(fnv1a32("round30-owner|" + room));
}

export function loadPlans() {
  const raw = fs.readFileSync(PLANS_PATH);
  const md5 = crypto.createHash("md5").update(raw).digest("hex");
  const all = JSON.parse(raw.toString("utf8"));
  const plans = all.filter((p) => p && p.room && !p.error);
  return { raw, md5, all, plans };
}

export function loadRooms() {
  if (!fs.existsSync(ROOMS_PATH)) throw new Error("missing rooms dump: " + ROOMS_PATH);
  const rooms = JSON.parse(fs.readFileSync(ROOMS_PATH, "utf8"));
  return { rooms, byRoom: new Map(rooms.map((r) => [r.room, r])) };
}

export function hashedRooms(plans) {
  const rows = plans.map((p) => ({ room: p.room, h: roomHash(p.room) }));
  rows.sort((a, b) => a.h - b.h || a.room.localeCompare(b.room));
  return rows;
}

export function tileAt(terrain, x, y) {
  if (x < 0 || y < 0 || x > 49 || y > 49) return WALL;
  return parseInt(terrain.charAt(y * 50 + x), 10);
}
export function isWall(terrain, x, y) {
  return (tileAt(terrain, x, y) & WALL) > 0;
}
export function walkable(terrain, x, y) {
  return x >= 0 && x <= 49 && y >= 0 && y <= 49 && !isWall(terrain, x, y);
}

export function floodExterior(terrain, blockSet) {
  const e = new Uint8Array(2500);
  const q = [];
  for (let i = 0; i < 50; i++) {
    for (const [x, y] of [[i, 0], [i, 49], [0, i], [49, i]]) {
      if (!walkable(terrain, x, y) || blockSet.has(KT(x, y))) continue;
      const ii = x + y * 50;
      if (!e[ii]) {
        e[ii] = 1;
        q.push(ii);
      }
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % 50;
    const y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!walkable(terrain, nx, ny) || blockSet.has(KT(nx, ny))) continue;
      const ni = nx + ny * 50;
      if (e[ni]) continue;
      e[ni] = 1;
      q.push(ni);
    }
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
      const ni = nx + ny * 50;
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
      m.set(k, m.has(k) ? `${m.get(k)}+${t}` : t);
    }
  }
  return m;
}

export function structMap(plan) {
  const m = new Map();
  for (const t of Object.keys(plan.structures || {})) {
    for (const p of plan.structures[t] || []) {
      const k = K(p);
      const was = m.get(k);
      m.set(k, was ? was.concat(t) : [t]);
    }
  }
  return m;
}

export function officialMineralWhy(plan, seat) {
  const holds = structHolds(plan);
  const net = new Set((plan.structures?.road || []).map(K));
  for (const c of plan.structures?.container || []) net.add(K(c));
  net.delete(K(seat));
  const ring = [];
  const touching = [];
  for (const [dx, dy] of D8) {
    const x = seat.x + dx;
    const y = seat.y + dy;
    if (x < 0 || y < 0 || x > 49 || y > 49) continue;
    const k = KT(x, y);
    ring.push(`${k} (${holds.get(k) || "nothing of ours"})`);
    if (net.has(k)) touching.push(k);
  }
  let nearestRoad = null;
  for (const r of plan.structures?.road || []) {
    const d = cheb(r, seat);
    if (
      !nearestRoad ||
      d < nearestRoad.dist ||
      (d === nearestRoad.dist && (r.y < nearestRoad.y || (r.y === nearestRoad.y && r.x < nearestRoad.x)))
    ) {
      nearestRoad = { x: r.x, y: r.y, dist: d };
    }
  }
  const near = !nearestRoad
    ? "this room ships no road at all"
    : nearestRoad.dist === 0
      ? "the seat tile itself carries a road (a container and a road legally share a square)"
      : `the nearest road tile this room ships is ${nearestRoad.x},${nearestRoad.y}, ${nearestRoad.dist} step(s) away`;
  const off =
    "no road by design — mineral hauling is one trickle deposit on a long cooldown, and permanent road decay to reach it costs more than the walk it saves.";
  const on =
    "no road was grown to it, but a corridor another layer laid runs past it, so it is serviced like any other container.";
  return (
    `ON THIS ROOM: the mineral seat at ${seat.x},${seat.y} has these eight neighbours — ${ring.join(" · ")} — ` +
    `so ${touching.length} of them put it on the network, and ${near}. ` +
    (touching.length ? `The seat DOES touch the network (${touching.join(" ")}): ${on}` : off) +
    ` Measured over the FINISHED road set, not layer 5's.`
  );
}

export const CUT_DRIFT_WHY = {
  "remove|layer7-inertPrune":
    `This tile LEFT the declared cut: the rampart standing on it bought nothing this room can point at ` +
    `— it was not holding the seal, it carried no structure of ours, and no creep this room does not own ` +
    `can ever stand there — so the rampart was deleted, and a tile with no rampart on it is not wall. ` +
    `The pass that did it is the inert-rampart prune inside planWallRoads (layer 7, the first of this ` +
    `file's two prune calls), and its whole roster ships as meta.shell.inertPruned — this tile is in it.`,
  "remove|layer7b-inertPrune":
    `This tile LEFT the declared cut: the rampart standing on it bought nothing this room can point at ` +
    `— it was not holding the seal, it carried no structure of ours, and no creep this room does not own ` +
    `can ever stand there — so the rampart was deleted, and a tile with no rampart on it is not wall. ` +
    `The pass that did it is the inert-rampart prune inside finalizeRoom (layer 7b, the second of this ` +
    `file's two prune calls), and its whole roster ships as meta.shell.inertPruned — this tile is in it.`,
  "add|layer7-reconcileSeal":
    `This tile JOINED the declared cut: the single-removal seal test proves the rampart standing on it is ` +
    `holding the enclosure shut on its own, so it is a wall tile the cut layer 2 froze did not name. ` +
    `The pass that did it is the seal reconciliation inside planWallRoads (layer 7, the first of this ` +
    `file's two reconcile calls), and the evidence is the tile itself rather than a roster: re-flood the ` +
    `exterior over this room's ramparts with this one deleted and the flood reaches the sitter.`,
  "add|layer7b-reconcileSeal":
    `This tile JOINED the declared cut: the single-removal seal test proves the rampart standing on it is ` +
    `holding the enclosure shut on its own, so it is a wall tile the cut layer 2 froze did not name. ` +
    `The pass that did it is the seal reconciliation inside finalizeRoom (layer 7b, the second of this ` +
    `file's two reconcile calls), and the evidence is the tile itself rather than a roster: re-flood the ` +
    `exterior over this room's ramparts with this one deleted and the flood reaches the sitter.`,
};

const FLEET_RE = /fleetMediansMeasured|eco\.ctrlMedian|eco\.srcMedian|eco\.ctrlGate|eco\.srcGate/;

let _checkRoom;
export async function checkRoomLazy() {
  if (!_checkRoom) {
    const mod = await import("../validate.mjs");
    _checkRoom = mod.checkRoom;
  }
  return _checkRoom;
}

export function realFails(res) {
  return (res.fails || []).filter((f) => !FLEET_RE.test(f));
}

export function makeChecker(byPlan, byRoom) {
  return async function run(name, room, mutate) {
    const checkRoom = await checkRoomLazy();
    const d = byRoom.get(room);
    if (!d) return { name, room, status: "no-terrain" };
    const src = byPlan.get(room);
    if (!src) return { name, room, status: "no-plan" };
    const p = JSON.parse(JSON.stringify(src));
    const snap = JSON.stringify(p);
    mutate(p);
    const changed = JSON.stringify(p) !== snap;
    let res;
    try {
      res = checkRoom(p, d.terrain, d.objects, null);
    } catch (e) {
      return { name, room, status: "threw", changed, first: String(e.message || e).slice(0, 280) };
    }
    const real = realFails(res);
    return {
      name,
      room,
      status: real.length ? "BITES" : "ESCAPE",
      changed,
      n: real.length,
      first: real[0] && real[0].slice(0, 320),
    };
  };
}
