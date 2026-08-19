/**
 * Stamp fullRun.reserved / byRound and lane.reserved / byRound on every room.
 * Re-composes; refuses to write if any board moves.
 *
 *   fnm exec --using 22 node tools/plan-suite/v2/_r29-mech/stamp-98-board.mjs
 *   fnm exec --using 22 node tools/plan-suite/v2/_r29-mech/stamp-98-board.mjs --write
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { planRoom } from "../pipeline.mjs";
import { planStructureHash } from "../shared.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const HUB = path.join(DIR, "../../out-v2/plans-hub.json");
const rooms = JSON.parse(fs.readFileSync(path.join(DIR, "../_r28-mech/rooms.json"), "utf8"));
const byRoom = new Map(rooms.map((r) => [r.room, r]));
const plans = JSON.parse(fs.readFileSync(HUB, "utf8"));
const write = process.argv.includes("--write");

const stampOne = (dst, freshL, replaceFull) => {
  if (!dst) return;
  dst.reserved = [...(freshL.reserved || [])];
  dst.byRound = (freshL.byRound || []).map((r) => [...r]);
  const fr = freshL.fullRun || {};
  const reserved = [...(fr.reserved || [])];
  const byRound = (fr.byRound || []).map((r) => [...r]);
  if (replaceFull || !dst.fullRun) {
    dst.fullRun = { ...fr, reserved, byRound };
  } else {
    dst.fullRun = { ...dst.fullRun, reserved, byRound };
  }
};

const stamp = (p, fresh) => {
  const L = fresh.meta?.extensions?.laneMeta;
  if (!L || !L.fullRun) return "no fullRun";
  const replaceFull = !!(L.shrunk || L.dropped);
  stampOne(p.meta.extensions?.laneMeta, L, replaceFull);
  stampOne(p.meta.walls?.mobility?.lanes, L, replaceFull);
  return null;
};

let ok = 0;
const errs = [];
const t0 = Date.now();
for (const p of plans) {
  if (!p || !p.room || p.error || !p.meta?.extensions?.laneMeta) continue;
  const d = byRoom.get(p.room);
  if (!d) {
    errs.push({ room: p.room, err: "no terrain" });
    continue;
  }
  const t1 = Date.now();
  const fresh = planRoom(d);
  const ms = Date.now() - t1;
  if (fresh.error) {
    errs.push({ room: p.room, err: fresh.error, ms });
    continue;
  }
  if (planStructureHash(p) !== planStructureHash(fresh)) {
    errs.push({ room: p.room, err: "board moved", ms });
    continue;
  }
  const e = stamp(p, fresh);
  if (e) {
    errs.push({ room: p.room, err: e, ms });
    continue;
  }
  ok++;
  if (ok % 20 === 0) console.log("...", ok, p.room, ms + "ms");
}
console.log(JSON.stringify({ ok, errs: errs.length, ms: Date.now() - t0, errs }, null, 2));
if (write) {
  if (errs.length) {
    console.error("REFUSING TO WRITE");
    process.exit(1);
  }
  fs.writeFileSync(HUB, JSON.stringify(plans, null, 2));
  console.log("wrote", HUB);
}
