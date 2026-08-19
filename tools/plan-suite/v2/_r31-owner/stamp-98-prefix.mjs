/**
 * r29p10 — stamp shrink fullRun.reserved/byRound to the kept prefix.
 * Does not re-run the greedy. Writes plans-hub.json.
 */
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const HUB = path.join(DIR, "../../out-v2/plans-hub.json");
const plans = JSON.parse(fs.readFileSync(HUB, "utf8"));
const uniqSort = (a) => [...new Set((a || []).map(String))].sort();
const phys = (ps) => {
  let e = 0, r = 0, a = 0;
  for (const p of ps) {
    if (!p || p.error) continue;
    e += (p.structures?.extension || []).length;
    r += (p.structures?.road || []).length;
    a += (p.structures?.rampart || []).length;
  }
  return { e, r, a };
};
const before = phys(plans);
const rows = [];
const stampLane = (L) => {
  if (!L?.shrunk || !L.fullRun) return false;
  const fr = L.fullRun;
  const to = L.shrunk.to;
  const wanted = fr.tiles;
  const prefix = uniqSort(L.reserved);
  const byRound = (fr.byRound || []).slice(0, to).map((r) => r.slice());
  L.fullRun = {
    ...fr,
    reserved: prefix,
    byRound,
    rounds: byRound.length,
    tiles: prefix.length,
  };
  if (L.shrunk.wanted !== wanted) L.shrunk.wanted = wanted;
  return true;
};
let n = 0;
for (const p of plans) {
  if (!p || p.error) continue;
  const L = p.meta?.extensions?.laneMeta;
  const W = p.meta?.walls?.mobility?.lanes;
  if (!L?.shrunk) continue;
  const beforeFr = { tiles: L.fullRun.tiles, rounds: L.fullRun.rounds, res: L.fullRun.reserved.length };
  stampLane(L);
  if (W && W !== L && W.shrunk) stampLane(W);
  n++;
  rows.push({
    room: p.room,
    wanted: L.shrunk.wanted,
    tiles: L.fullRun.tiles,
    rounds: L.fullRun.rounds,
    to: L.fullRun.to,
    used: L.fullRun.used,
    byRound: L.fullRun.byRound.map((r) => r.length),
    reservedEq: uniqSort(L.fullRun.reserved).join("|") === uniqSort(L.reserved).join("|"),
    beforeFr,
  });
}
const after = phys(plans);
if (before.e !== after.e || before.r !== after.r || before.a !== after.a) {
  console.error("PHYSICALS MOVED", before, after);
  process.exit(1);
}
fs.writeFileSync(HUB, JSON.stringify(plans, null, 2));
const md5 = crypto.createHash("md5").update(fs.readFileSync(HUB)).digest("hex");
console.log(JSON.stringify({ n, physicals: after, md5, rows }, null, 2));
