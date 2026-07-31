import { execSync } from "child_process";
import fs from "fs";

const dump = `db=db.getSiblingDB("screeps");
var ter=db["rooms.terrain"].findOne({room:"E2S7"});
var objs=db["rooms.objects"].find({room:"E2S7",type:{$in:["source","controller","mineral"]}},{type:1,x:1,y:1}).toArray();
print(JSON.stringify({terrain:ter.terrain, objects:objs}));
`;
fs.writeFileSync(new URL("./_dbg.js", import.meta.url), dump);
execSync("docker cp tools/plan-suite/_dbg.js local-screeps-server-mongo-1:/tmp/_dbg.js");
const raw = execSync("docker exec local-screeps-server-mongo-1 mongosh --quiet --file /tmp/_dbg.js", {
  encoding: "utf8",
  maxBuffer: 20e6,
});
const j = JSON.parse(raw.slice(raw.indexOf("{")));
const terrain = j.terrain;
console.log("tlen", terrain.length, "objs", j.objects);

// terrain codes are BITMASKS: 1=wall, 2=swamp, 3=wall|swamp (engine
// utils.js:333 checkTerrain -> `(code & mask) > 0`). Equality misreads every
// code-3 tile as open floor.
const WALL = 1;
function tileAt(x, y) {
  return parseInt(terrain.charAt(y * 50 + x), 10);
}
function walkable(x, y) {
  return x >= 0 && x <= 49 && y >= 0 && y <= 49 && (tileAt(x, y) & WALL) === 0;
}

const ctrl = j.objects.find((o) => o.type === "controller");
const sources = j.objects.filter((o) => o.type === "source");
console.log("ctrl", ctrl, "tile", tileAt(ctrl.x, ctrl.y));
console.log(
  "sources",
  sources.map((s) => ({ ...s, tile: tileAt(s.x, s.y) })),
);

// sample hub 25,25
function pathLen(from, to) {
  const key = (x, y) => x + y * 50;
  const q = [[from.x, from.y, 0]];
  const seen = new Uint8Array(2500);
  seen[key(from.x, from.y)] = 1;
  let qi = 0;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  while (qi < q.length) {
    const [x, y, d] = q[qi++];
    for (const [dx, dy] of dirs) {
      const nx = x + dx,
        ny = y + dy;
      if (!walkable(nx, ny)) continue;
      if (seen[key(nx, ny)]) continue;
      if (nx === to.x && ny === to.y) return d + 1;
      seen[key(nx, ny)] = 1;
      q.push([nx, ny, d + 1]);
    }
  }
  return 999;
}

const hub = { x: 25, y: 25 };
console.log("hub tile", tileAt(25, 25), "walk", walkable(25, 25));
console.log("path hub->ctrl", pathLen(hub, ctrl));
console.log("path hub->src0", pathLen(hub, sources[0]));
console.log("char codes sample", [...terrain.slice(0, 10)].map((c) => c.charCodeAt(0)));
