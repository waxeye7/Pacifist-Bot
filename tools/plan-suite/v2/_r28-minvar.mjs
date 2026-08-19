import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderMineralOffNetworkWhy, mineralSeatCensus } from "./layer-misc.mjs";
import { chebyshev } from "./shared.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const P = JSON.parse(fs.readFileSync(path.join(DIR, "../out-v2/plans-hub.json"), "utf8")).filter((p) => p && p.room && !p.error);
const D8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const K = (x, y) => `${x},${y}`;
const WHEN = "the FINISHED road set, not layer 5's";

function netOf(p, seat) {
  const net = new Set((p.structures.road || []).map((r) => K(r.x, r.y)));
  for (const c of p.structures.container || []) net.add(K(c.x, c.y));
  net.delete(K(seat.x, seat.y));
  return net;
}
function seatOf(p) {
  return (p.structures.container || []).find((c) => chebyshev(c, p.mineral) <= 1);
}
function altCensus(p, seat, net, { skipTypes, skipSeatRoad }) {
  const holdsAt = new Map();
  for (const t of Object.keys(p.structures || {})) {
    if (skipTypes.has(t)) continue;
    for (const q of p.structures[t] || []) {
      const k = K(q.x, q.y);
      holdsAt.set(k, holdsAt.get(k) ? `${holdsAt.get(k)}+${t}` : t);
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
    if (skipSeatRoad && r.x === seat.x && r.y === seat.y) continue;
    const d = Math.max(Math.abs(r.x - seat.x), Math.abs(r.y - seat.y));
    if (!nearestRoad || d < nearestRoad.dist || (d === nearestRoad.dist && (r.y < nearestRoad.y || (r.y === nearestRoad.y && r.x < nearestRoad.x)))) {
      nearestRoad = { x: r.x, y: r.y, dist: d };
    }
  }
  return { seat: { x: seat.x, y: seat.y }, ring, touching, nearestRoad };
}

const variants = [
  ["official", (p, s, n) => mineralSeatCensus(p.structures, s, n)],
  ["skipRoad", (p, s, n) => altCensus(p, s, n, { skipTypes: new Set(["road"]), skipSeatRoad: false })],
  ["skipRoadRampart", (p, s, n) => altCensus(p, s, n, { skipTypes: new Set(["road", "rampart"]), skipSeatRoad: false })],
  ["skipSeatRoad", (p, s, n) => altCensus(p, s, n, { skipTypes: new Set(), skipSeatRoad: true })],
  ["skipRoad+seat", (p, s, n) => altCensus(p, s, n, { skipTypes: new Set(["road"]), skipSeatRoad: true })],
  ["skipRR+seat", (p, s, n) => altCensus(p, s, n, { skipTypes: new Set(["road", "rampart"]), skipSeatRoad: true })],
];

for (const [name, fn] of variants) {
  let ok = 0, n = 0, miss3 = [];
  for (const p of P) {
    if (!p.mineral) continue;
    const s = seatOf(p);
    if (!s) continue;
    n++;
    const net = netOf(p, s);
    const want = renderMineralOffNetworkWhy({ ...fn(p, s, net), when: WHEN });
    if (want === p.meta.misc.mineralOffNetworkWhy) ok++;
    else if (["E2S5", "E5S1", "E5S3"].includes(p.room)) miss3.push(p.room);
  }
  console.log(name, ok + "/" + n, "miss3", miss3.join(",") || "-");
}
