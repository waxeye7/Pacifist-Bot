import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { BUILT_OBSTACLES } from "./layer-shell.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const P = JSON.parse(fs.readFileSync(path.join(DIR, "../out-v2/plans-hub.json"), "utf8")).filter((p) => p && p.room && !p.error);
const K = (t) => `${t.x},${t.y}`;

let ok = 0,
  n = 0,
  miss = [];
for (const p of P) {
  const s = p.meta.towers?.refillBasis;
  if (typeof s !== "string") continue;
  const m = /with (\d+) tile\(s\) blocked/.exec(s);
  if (!m) continue;
  n++;
  const blocked = new Set();
  for (const src of p.sources || []) blocked.add(K(src));
  if (p.controller) blocked.add(K(p.controller));
  if (p.mineral) blocked.add(K(p.mineral));
  for (const t of BUILT_OBSTACLES) {
    for (const q of p.structures[t] || []) blocked.add(K(q));
  }
  if (blocked.size === +m[1]) ok++;
  else if (miss.length < 4) miss.push({ room: p.room, want: +m[1], got: blocked.size });
}
console.log("blocked", ok, "/", n, miss);
