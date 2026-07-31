/**
 * Shared terrain + mongo helpers for plan-suite v2.
 * Intentionally tiny — no layout logic here.
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const V2_ROOT = __dirname;
export const OUT_V2 = path.join(__dirname, "..", "out-v2");

export const WALL = 1;
export const SWAMP = 2;

export const D4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
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

export function tileAt(terrain, x, y) {
  if (x < 0 || x > 49 || y < 0 || y > 49) return WALL;
  return parseInt(terrain.charAt(y * 50 + x), 10);
}
export function isWall(terrain, x, y) {
  return tileAt(terrain, x, y) === WALL;
}
export function walkable(terrain, x, y) {
  return x >= 0 && x <= 49 && y >= 0 && y <= 49 && !isWall(terrain, x, y);
}
export function buildable(terrain, x, y) {
  return x >= 2 && x <= 47 && y >= 2 && y <= 47 && !isWall(terrain, x, y);
}
export function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
export function key(x, y) {
  return `${x},${y}`;
}

export function approachTile(terrain, pos) {
  if (walkable(terrain, pos.x, pos.y)) return { x: pos.x, y: pos.y };
  let best = null;
  let bestD = 99;
  for (const [dx, dy] of D8) {
    const x = pos.x + dx,
      y = pos.y + dy;
    if (!walkable(terrain, x, y)) continue;
    const d = Math.abs(dx) + Math.abs(dy);
    if (d < bestD) {
      bestD = d;
      best = { x, y };
    }
  }
  return best;
}

/** Simple BFS path length (D8). null if unreachable. */
export function pathLen(terrain, from, to, blocked = null) {
  const start = approachTile(terrain, from);
  const goal = approachTile(terrain, to);
  if (!start || !goal) return null;
  const goalK = key(goal.x, goal.y);
  const seen = new Set([key(start.x, start.y)]);
  const q = [{ x: start.x, y: start.y, d: 0 }];
  let qi = 0;
  while (qi < q.length) {
    const { x, y, d } = q[qi++];
    if (key(x, y) === goalK) return d;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      if (!walkable(terrain, nx, ny)) continue;
      if (blocked && blocked.has(k) && k !== goalK) continue;
      seen.add(k);
      q.push({ x: nx, y: ny, d: d + 1 });
    }
  }
  return null;
}

export function fetchRoomsFromMongo(rooms) {
  const list = rooms.map((r) => JSON.stringify(r)).join(",");
  const script = `db = db.getSiblingDB("screeps");
var rooms = [${list}];
var out = [];
for (var i = 0; i < rooms.length; i++) {
  var room = rooms[i];
  var t = db["rooms.terrain"].findOne({room: room});
  if (!t) continue;
  var objects = db["rooms.objects"].find({room: room, type: {$in: ["source","controller","mineral"]}}).toArray();
  out.push({ room: room, terrain: t.terrain, objects: objects });
}
print(JSON.stringify(out));
`;
  const p = path.join(__dirname, "_dump-rooms.js");
  fs.writeFileSync(p, script);
  execSync(`docker cp "${p}" local-screeps-server-mongo-1:/tmp/dump-rooms-v2.js`);
  const raw = execSync(
    `docker exec local-screeps-server-mongo-1 mongosh --quiet --file /tmp/dump-rooms-v2.js`,
    { encoding: "utf8", maxBuffer: 80e6 },
  );
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0) throw new Error("mongo dump failed: " + raw.slice(0, 200));
  return JSON.parse(raw.slice(start, end + 1));
}

export function fetchAllClaimableRooms() {
  const script = `db = db.getSiblingDB("screeps");
var src = db["rooms.objects"].aggregate([
  {$match:{type:"source"}},
  {$group:{_id:"$room", n:{$sum:1}}},
  {$match:{n:{$gte:2}}}
]).toArray().map(x=>x._id);
var ctrl = db["rooms.objects"].distinct("room", {type:"controller"});
var claim = src.filter(r => ctrl.indexOf(r) >= 0).sort();
print(JSON.stringify(claim));
`;
  const p = path.join(__dirname, "_claimable.js");
  fs.writeFileSync(p, script);
  execSync(`docker cp "${p}" local-screeps-server-mongo-1:/tmp/_claimable-v2.js`);
  const raw = execSync(
    `docker exec local-screeps-server-mongo-1 mongosh --quiet --file /tmp/_claimable-v2.js`,
    { encoding: "utf8" },
  );
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0) throw new Error("claimable dump failed: " + raw.slice(0, 200));
  return JSON.parse(raw.slice(start, end + 1));
}

export const GOLDEN = ["E2S7", "E5S1", "E5S7", "E1S4", "E9S8"];
