import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.resolve(DIR, "../../out-v2/plans-hub.json"), "utf8"))
  .filter((p) => p && p.room && !p.error);
const D8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const K = (t) => `${t.x},${t.y}`;

function seatOf(p) {
  if (!p.mineral) return null;
  return (p.structures?.container || []).find(
    (c) => Math.max(Math.abs(c.x - p.mineral.x), Math.abs(c.y - p.mineral.y)) <= 1,
  ) || null;
}

function d8Net(p, pred) {
  const seat = seatOf(p);
  if (!seat) return { seat: null, want: [] };
  const kind = p.meta?.walls?.roadKind || {};
  const bridgeLaid = new Set((p.meta?.walls?.laidTilesByKind?.conductBridge || []).map(K));
  const net = new Set();
  for (const r of p.structures?.road || []) {
    const k = K(r);
    if (!pred({ k, kind: kind[k], bridgeLaid: bridgeLaid.has(k) })) continue;
    net.add(k);
  }
  for (const c of p.structures?.container || []) {
    const k = K(c);
    if (k === K(seat)) continue;
    net.add(k);
  }
  const want = [];
  for (const [dx, dy] of D8) {
    const k = `${seat.x + dx},${seat.y + dy}`;
    if (net.has(k)) want.push(k);
  }
  want.sort();
  return { seat, want };
}

const variants = {
  finished: (t) => true,
  dropBridgeKind: (t) => t.kind !== "conductBridge",
  dropBridgeLaid: (t) => !t.bridgeLaid,
  dropEither: (t) => t.kind !== "conductBridge" && !t.bridgeLaid,
};

const stats = {};
for (const [name, pred] of Object.entries(variants)) {
  stats[name] = { match: 0, miss: 0, samples: [] };
  for (const p of plans) {
    const pub = (p.meta?.misc?.mineralSeatNetTiles || []).map(String).sort().join("|");
    const { want } = d8Net(p, pred);
    const got = want.join("|");
    if (pub === got) stats[name].match++;
    else {
      stats[name].miss++;
      if (stats[name].samples.length < 8) {
        stats[name].samples.push({ room: p.room, pub, want: got });
      }
    }
  }
}

const bridgeRooms = [];
for (const p of plans) {
  const kind = p.meta?.walls?.roadKind || {};
  const pub = new Set(p.meta?.misc?.mineralSeatNetTiles || []);
  const hits = [];
  for (const k of pub) if (kind[k] === "conductBridge") hits.push(k);
  if (hits.length) bridgeRooms.push({ room: p.room, hits });
}

console.log(JSON.stringify({ rooms: plans.length, stats, pubIncludesConductBridge: bridgeRooms }, null, 2));
