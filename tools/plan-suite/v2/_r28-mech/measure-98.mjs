/**
 * Measure criticism 98 invent surface: which rooms can grow a fake shrink,
 * and whether `ran` is board-derivable without reading `shrunk`.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.join(DIR, "../../out-v2/plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);

const rows = { none: 0, dropped: 0, shrunk: 0, keptCostly: 0, keptFree: 0, noLane: 0 };
const shrunkRooms = [];
const keptCostly = [];
const inventable = [];

for (const p of plans) {
  const lm = p.meta?.extensions?.laneMeta || p.meta?.walls?.mobility?.lanes;
  if (!lm) {
    rows.noLane++;
    continue;
  }
  const ext = (p.structures?.extension || []).length;
  const shallow = p.meta?.extensions?.shallow || 0;
  const tiles = lm.tiles || 0;
  const dropped = lm.dropped === true;
  const shrunk = lm.shrunk && typeof lm.shrunk === "object";
  const ranBoard = dropped || (tiles > 0 && (ext < 60 || shallow > 0));
  if (dropped) rows.dropped++;
  else if (shrunk) {
    rows.shrunk++;
    shrunkRooms.push({
      room: p.room,
      to: lm.shrunk.to,
      rounds: lm.rounds,
      tiles,
      wanted: lm.shrunk.wanted,
      stranded: lm.stranded,
      ext,
      shallow,
      ranBoard,
    });
  } else if (tiles > 0 && (ext < 60 || shallow > 0)) {
    rows.keptCostly++;
    keptCostly.push({ room: p.room, tiles, ext, shallow, rounds: lm.rounds, stranded: lm.stranded });
  } else if (tiles > 0) {
    rows.keptFree++;
    inventable.push({ room: p.room, kind: "keptFree", tiles, ext, shallow, rounds: lm.rounds });
  } else {
    rows.none++;
    inventable.push({ room: p.room, kind: "noReserve", tiles, ext, shallow, rounds: lm.rounds });
  }
}

console.log(JSON.stringify({
  rows,
  shrunkN: shrunkRooms.length,
  shrunk: shrunkRooms,
  keptCostlyN: keptCostly.length,
  keptCostly: keptCostly.slice(0, 12),
  inventableN: inventable.length,
  inventableKinds: inventable.reduce((m, r) => ((m[r.kind] = (m[r.kind] || 0) + 1), m), {}),
  e11s3: inventable.find((r) => r.room === "E11S3") || shrunkRooms.find((r) => r.room === "E11S3") || keptCostly.find((r) => r.room === "E11S3"),
}, null, 2));
