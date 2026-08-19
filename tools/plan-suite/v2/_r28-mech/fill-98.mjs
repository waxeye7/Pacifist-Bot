/**
 * Stamp laneMeta.fullRun on every room.
 * Kept rooms (no shrink, no drop): copy the shipped reservation (it IS the cap-10 walk).
 * Shrink/drop rooms: re-compose and copy fullRun if the board hash is unchanged.
 *
 *   fnm exec --using 22 node tools/plan-suite/v2/_r28-mech/fill-98.mjs
 *   fnm exec --using 22 node tools/plan-suite/v2/_r28-mech/fill-98.mjs --write
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { planRoom } from "../pipeline.mjs";
import { planStructureHash } from "../shared.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const HUB = path.join(DIR, "../../out-v2/plans-hub.json");
const rooms = JSON.parse(fs.readFileSync(path.join(DIR, "rooms.json"), "utf8"));
const byRoom = new Map(rooms.map((r) => [r.room, r]));
const plans = JSON.parse(fs.readFileSync(HUB, "utf8"));
const write = process.argv.includes("--write");

const stampBoth = (p, fr) => {
  if (p.meta.extensions?.laneMeta) p.meta.extensions.laneMeta.fullRun = fr;
  if (p.meta.walls?.mobility?.lanes) p.meta.walls.mobility.lanes.fullRun = fr;
};

const synth = (p) => {
  const L = p.meta.extensions.laneMeta;
  const shallow = p.meta.extensions.shallow ?? 0;
  const ext = (p.structures.extension || []).length;
  const tiles = L.tiles || 0;
  const rounds = L.rounds || 0;
  return {
    tiles,
    rounds,
    shallow,
    ext,
    builtLap: L.builtLap ?? null,
    stranded: L.stranded || 0,
    ran: !!(tiles && (ext < 60 || shallow > 0)),
    used: rounds,
    to: rounds,
  };
};

let patched = 0;
let composed = 0;
const errs = [];
for (const p of plans) {
  if (!p || !p.room || p.error || !p.meta?.extensions?.laneMeta) continue;
  const L = p.meta.extensions.laneMeta;
  const needCompose = L.dropped === true || (L.shrunk && typeof L.shrunk === "object");
  if (!needCompose) {
    stampBoth(p, synth(p));
    patched++;
    continue;
  }
  const d = byRoom.get(p.room);
  if (!d) {
    errs.push({ room: p.room, err: "no terrain" });
    continue;
  }
  const t0 = Date.now();
  const fresh = planRoom(d);
  const ms = Date.now() - t0;
  if (fresh.error) {
    errs.push({ room: p.room, err: fresh.error, ms });
    continue;
  }
  const h0 = planStructureHash(p);
  const h1 = planStructureHash(fresh);
  const fr = fresh.meta?.extensions?.laneMeta?.fullRun;
  if (h0 !== h1) {
    errs.push({ room: p.room, err: "board moved", ms });
    continue;
  }
  if (!fr) {
    errs.push({ room: p.room, err: "compose produced no fullRun", ms });
    continue;
  }
  stampBoth(p, fr);
  composed++;
  console.log(p.room, "composed", ms + "ms", "fullRun", JSON.stringify(fr), "shrunk", !!L.shrunk, "dropped", !!L.dropped);
}

console.log(JSON.stringify({ patched, composed, errs }, null, 2));
if (write) {
  if (errs.length) {
    console.error("REFUSING TO WRITE");
    process.exit(1);
  }
  fs.writeFileSync(HUB, JSON.stringify(plans, null, 2));
  console.log("wrote", HUB);
}
