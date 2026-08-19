import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.resolve(DIR, "../../out-v2/plans-hub.json"), "utf8"));
const p = plans.find((x) => x.room === "E5S1");
const mineral = p.mineral;
const seat = (p.structures.container || []).find(
  (c) => Math.max(Math.abs(c.x - mineral.x), Math.abs(c.y - mineral.y)) <= 1,
);
const around = [];
for (let dy = -2; dy <= 2; dy++) {
  for (let dx = -2; dx <= 2; dx++) {
    const x = seat.x + dx, y = seat.y + dy;
    const holds = [];
    for (const [t, arr] of Object.entries(p.structures || {})) {
      for (const q of arr || []) if (q.x === x && q.y === y) holds.push(t);
    }
    around.push({ x, y, holds, roadKind: p.meta?.walls?.roadKind?.[`${x},${y}`] || p.roadKind?.[`${x},${y}`] });
  }
}
const rk = p.meta?.walls?.roadKind || p.meta?.roadKind || p.roadKind || null;
const rkKeys = rk && typeof rk === "object" ? Object.keys(rk).slice(0, 8) : null;
console.log(JSON.stringify({
  mineral,
  seat,
  mineralSeat: p.meta?.mineralSeat,
  published: p.meta?.misc?.mineralSeatNetTiles,
  extractorSeatNetTiles: p.meta?.misc?.extractorSeatNetTiles,
  mineralOffNetwork: p.meta?.misc?.mineralOffNetwork,
  around,
  roadKindSample: rkKeys,
  roadKindAt2830: rk?.["28,30"],
  laidByKind: p.meta?.walls?.laidByKind,
  roadLayer: p.meta?.towers?.roadLayer || p.meta?.walls?.roadLayer || null,
}, null, 2));
