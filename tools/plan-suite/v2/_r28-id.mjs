import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { shellDamage } from "./layer-towers.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const P = JSON.parse(fs.readFileSync(path.join(DIR, "../out-v2/plans-hub.json"), "utf8")).filter((p) => p && p.room && !p.error);

let dmgOk = 0,
  dmgN = 0,
  dmgMiss = [];
for (const p of P) {
  const d = p.meta.shell?.shippedShellDmg;
  if (!d) continue;
  dmgN++;
  const want = shellDamage(p.structures.tower || [], p.meta.shell.cut || []);
  const ok =
    want.min === d.min &&
    want.avg === d.avg &&
    want.weak === d.weak &&
    want.tiles === d.tiles &&
    want.worst &&
    d.worst &&
    want.worst.x === d.worst.x &&
    want.worst.y === d.worst.y;
  if (ok) dmgOk++;
  else if (dmgMiss.length < 3) dmgMiss.push({ room: p.room, want, d });
}
console.log("shippedShellDmg", dmgOk, "/", dmgN, JSON.stringify(dmgMiss[0] || {}));

let mob = { n: 0, eqBuilt: 0, eqFree: 0 };
for (const p of P) {
  const ms = p.meta.shell?.mobilityShipped;
  if (!ms || typeof ms.maxGated !== "number") continue;
  mob.n++;
  const built = p.meta.walls?.mobility?.builtGated ?? p.meta.shell?.mobilityBuilt?.maxGated;
  const free = p.meta.shell?.mobilityShippedFree?.maxGated;
  if (ms.maxGated === built) mob.eqBuilt++;
  if (ms.maxGated === free) mob.eqFree++;
}
console.log("mobilityShipped vs built/free", mob);

const rkCount = { n: 0, spur: 0, swamp: 0, stitch: 0 };
for (const p of P) {
  const rk = p.meta.walls?.roadKind || {};
  const kinds = {};
  for (const v of Object.values(rk)) kinds[v] = (kinds[v] || 0) + 1;
  const w = p.meta.walls || {};
  rkCount.n++;
  if ((kinds.spur || 0) === (w.spurred || 0) || (kinds.spur || 0) === (w.spurTiles || 0)) rkCount.spur++;
  if ((kinds.swampPave || 0) === (w.swampPaved || 0)) rkCount.swamp++;
  if ((kinds.stitch || 0) === (w.stitched || 0) || (kinds.stitch || 0) === (w.stitchTiles || []).length) rkCount.stitch++;
}
console.log("roadKind vs counters", rkCount);

// sample values
const s = P[0];
console.log("sample", s.room, {
  spurred: s.meta.walls?.spurred,
  spurTiles: s.meta.walls?.spurTiles,
  swampPaved: s.meta.walls?.swampPaved,
  stitched: s.meta.walls?.stitched,
  stitchTiles: (s.meta.walls?.stitchTiles || []).length,
  rk: Object.entries(
    Object.values(s.meta.walls?.roadKind || {}).reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {}),
  ),
  nukerHub: s.meta.misc?.nukerHubDist,
  obsHub: s.meta.misc?.observerHubDist,
});
