/**
 * Kept rooms: fullRun.ext/shallow are the SHIPPED board (fill-98 synth).
 * The previous stamp copied the pre-reflow walk and broke that identity.
 * reserved/byRound stay — they are the cap-10 tile board.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HUB = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../out-v2/plans-hub.json");
const plans = JSON.parse(fs.readFileSync(HUB, "utf8"));
let n = 0;
for (const p of plans) {
  if (!p?.meta?.extensions?.laneMeta?.fullRun) continue;
  const L = p.meta.extensions.laneMeta;
  if (L.shrunk || L.dropped) continue;
  const ext = (p.structures.extension || []).length;
  const shallow = p.meta.extensions.shallow || 0;
  const tiles = L.tiles || 0;
  const rounds = L.rounds || 0;
  const ran = !!(tiles && (ext < 60 || shallow > 0));
  const patch = {
    tiles,
    rounds,
    shallow,
    ext,
    ran,
    used: rounds,
    to: rounds,
  };
  const apply = (obj) => {
    if (!obj?.fullRun) return;
    Object.assign(obj.fullRun, patch);
  };
  apply(L);
  apply(p.meta.walls?.mobility?.lanes);
  n++;
}
fs.writeFileSync(HUB, JSON.stringify(plans, null, 2));
console.log("patched kept rooms", n);
