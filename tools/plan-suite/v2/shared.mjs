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

/**
 * TERRAIN CODES ARE BITMASKS, NOT AN ENUM.
 *
 * The room terrain string stores one digit per tile: bit0 = wall, bit1 =
 * swamp. Code 3 (wall|swamp) is a REAL WALL that happens to also carry the
 * swamp flag — 10,863 of them exist across the 164 claimable rooms on this
 * shard, and every one of them used to read as buildable floor here because
 * this module compared with `=== WALL`.
 *
 * Ground truth, @screeps/engine/src/utils.js:333-336
 *     exports.checkTerrain = function(terrain, x, y, mask) {
 *         var code = terrain instanceof Uint8Array ? terrain[y*50+x]
 *                                                  : Number(terrain.charAt(y*50 + x));
 *         return (code & mask) > 0;
 *     };
 * and utils.js:149
 *     if(structureType != 'road' && exports.checkTerrain(objects, x, y, C.TERRAIN_MASK_WALL)) return false;
 *
 * So: wall = (code & 1) > 0, swamp = (code & 2) > 0, and a tile can be both.
 * Wall always wins for walkability and buildability.
 */
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
/** wall = bit 0. Code 3 (wall|swamp) IS a wall. */
export function isWall(terrain, x, y) {
  return (tileAt(terrain, x, y) & WALL) > 0;
}
/** swamp = bit 1. A code-3 tile is a wall first — it is never "swamp" to us. */
export function isSwamp(terrain, x, y) {
  const t = tileAt(terrain, x, y);
  return (t & WALL) === 0 && (t & SWAMP) > 0;
}
export function walkable(terrain, x, y) {
  return x >= 0 && x <= 49 && y >= 0 && y <= 49 && !isWall(terrain, x, y);
}
export function buildable(terrain, x, y) {
  return x >= 2 && x <= 47 && y >= 2 && y <= 47 && !isWall(terrain, x, y);
}

// ---------------------------------------------------------------------------
// ENGINE BORDER-ADJACENCY RULE
// ---------------------------------------------------------------------------
/**
 * @screeps/engine/src/utils.js:120-126 (checkConstructionSite, verbatim):
 *
 *     var borderTiles;
 *     if(structureType != 'road' && structureType != 'container' &&
 *        (x == 1 || x == 48 || y == 1 || y == 48)) {
 *         if(x == 1)  borderTiles = [[0,y-1],[0,y],[0,y+1]];
 *         if(x == 48) borderTiles = [[49,y-1],[49,y],[49,y+1]];
 *         if(y == 1)  borderTiles = [[x-1,0],[x,0],[x+1,0]];
 *         if(y == 48) borderTiles = [[x-1,49],[x,49],[x+1,49]];
 *     }
 *     ... if(borderTiles) for(var i in borderTiles)
 *             if(!exports.checkTerrain(objects, bt[0], bt[1], C.TERRAIN_MASK_WALL)) return false;
 *
 * Three things the model has to copy exactly:
 *   1. road and container are EXEMPT. Everything else is not — including the
 *      extractor, whose exemption (utils.js:145) comes AFTER the border check.
 *   2. The four `if`s are sequential, not else-if, so at a CORNER the later
 *      assignment wins: a structure at (1,1) is checked against the y==1
 *      triple [[0,0],[1,0],[2,0]] and NOT against the x==1 triple. Same for
 *      (48,1), (1,48), (48,48) — the y-side always wins.
 *   3. Every border tile must BE a natural wall (the test is inverted: a
 *      non-wall edge tile rejects the site). No clamping is needed — x and y
 *      of a legal structure are in 1..48, so the triples never leave 0..49.
 */
export function borderTiles(structureType, x, y) {
  if (structureType === "road" || structureType === "container") return null;
  if (!(x === 1 || x === 48 || y === 1 || y === 48)) return null;
  let bt = null;
  if (x === 1) bt = [[0, y - 1], [0, y], [0, y + 1]];
  if (x === 48) bt = [[49, y - 1], [49, y], [49, y + 1]];
  if (y === 1) bt = [[x - 1, 0], [x, 0], [x + 1, 0]];
  if (y === 48) bt = [[x - 1, 49], [x, 49], [x + 1, 49]];
  return bt;
}

/** true when the engine's border-adjacency rule permits `type` at (x,y). */
export function borderLegal(terrain, x, y, type) {
  const bt = borderTiles(type, x, y);
  if (!bt) return true;
  for (const [bx, by] of bt) if (!isWall(terrain, bx, by)) return false;
  return true;
}

/**
 * Full terrain-side createConstructionSite predicate, mirroring the
 * `_.isString(objects)` branch of utils.js:128-162. Object-side collisions
 * (stacking, obstacles) are the validator's STACK/OBJECT checks, not this.
 */
export function engineBuildable(terrain, x, y, type) {
  if (x < 1 || y < 1 || x > 48 || y > 48) return false; // utils.js:191 (objects branch)
  if (!borderLegal(terrain, x, y, type)) return false; // utils.js:139-143
  if (type === "extractor") return true; // utils.js:145-147
  if (type !== "road" && isWall(terrain, x, y)) return false; // utils.js:149
  return true;
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
