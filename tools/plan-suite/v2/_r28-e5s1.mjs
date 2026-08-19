import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderMineralOffNetworkWhy, mineralSeatCensus } from "./layer-misc.mjs";
import { chebyshev } from "./shared.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const P = JSON.parse(fs.readFileSync(path.join(DIR, "../out-v2/plans-hub.json"), "utf8"));
const p = P.find((x) => x.room === "E5S1");
const seat = (p.structures.container || []).find((c) => chebyshev(c, p.mineral) <= 1);
const K = (x, y) => `${x},${y}`;
const net = new Set((p.structures.road || []).map((r) => K(r.x, r.y)));
for (const c of p.structures.container || []) net.add(K(c.x, c.y));
net.delete(K(seat.x, seat.y));
const off = mineralSeatCensus(p.structures, seat, net);
const D8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const holdsAt = new Map();
for (const t of Object.keys(p.structures)) {
  if (t === "road") continue;
  for (const q of p.structures[t] || []) {
    const k = K(q.x, q.y);
    holdsAt.set(k, holdsAt.get(k) ? holdsAt.get(k) + "+" + t : t);
  }
}
const ring = [];
const touching = [];
for (const [dx, dy] of D8) {
  const x = seat.x + dx, y = seat.y + dy;
  if (x < 0 || y < 0 || x > 49 || y > 49) continue;
  const k = K(x, y);
  ring.push({ k, holds: `(${holdsAt.get(k) || "nothing of ours"})` });
  if (net.has(k)) touching.push(k);
}
let nearestRoad = null;
for (const r of p.structures.road || []) {
  if (r.x === seat.x && r.y === seat.y) continue;
  const d = Math.max(Math.abs(r.x - seat.x), Math.abs(r.y - seat.y));
  if (!nearestRoad || d < nearestRoad.dist || (d === nearestRoad.dist && (r.y < nearestRoad.y || (r.y === nearestRoad.y && r.x < nearestRoad.x)))) {
    nearestRoad = { x: r.x, y: r.y, dist: d };
  }
}
const alt = { seat: { x: seat.x, y: seat.y }, ring, touching, nearestRoad };
const WHEN = "the FINISHED road set, not layer 5's";
const a = p.meta.misc.mineralOffNetworkWhy;
const b = renderMineralOffNetworkWhy({ ...off, when: WHEN });
const c = renderMineralOffNetworkWhy({ ...alt, when: WHEN });
function diff(x, y) {
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return { i, x: x.slice(i - 40, i + 80), y: y.slice(i - 40, i + 80) };
}
console.log("official", diff(a, b));
console.log("skipRoad+seat", diff(a, c));
console.log("OFF touching", off.touching, "ALT touching", touching, "nearest off", off.nearestRoad, "alt", nearestRoad);
