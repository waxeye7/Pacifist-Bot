/** Rewrite mineralOffNetworkWhy in plans-hub.json from the official census. 0 boards. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderMineralOffNetworkWhy, mineralSeatCensus } from "./layer-misc.mjs";
import { chebyshev } from "./shared.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const f = path.join(DIR, "../out-v2/plans-hub.json");
const P = JSON.parse(fs.readFileSync(f, "utf8"));
const K = (t) => `${t.x},${t.y}`;
let n = 0;
for (const p of P) {
  if (!p || !p.meta || !p.mineral) continue;
  const seat = (p.structures.container || []).find((c) => chebyshev(c, p.mineral) <= 1);
  if (!seat) continue;
  const net = new Set((p.structures.road || []).map(K));
  for (const c of p.structures.container || []) net.add(K(c));
  net.delete(K(seat));
  const want = renderMineralOffNetworkWhy({
    ...mineralSeatCensus(p.structures, seat, net),
    when: "the FINISHED road set, not layer 5's",
  });
  if (p.meta.misc?.mineralOffNetworkWhy !== want) {
    p.meta.misc.mineralOffNetworkWhy = want;
    n++;
    console.log("patched", p.room);
  }
}
fs.writeFileSync(f, JSON.stringify(P, null, 2));
console.log("wrote", n, "rooms");
