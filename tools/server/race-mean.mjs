#!/usr/bin/env node
/** One-line running mean: spawn→RCL2/3/4 across a race ledger. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/speedrun-ledger");
const arg = process.argv[2];
const files = fs.readdirSync(dir).filter((f) => f.startsWith("run-") && f.endsWith(".json")).sort();
const file = arg
  ? path.join(dir, arg.endsWith(".json") ? arg : `run-${arg}.json`)
  : path.join(dir, files[files.length - 1]);
if (!fs.existsSync(file)) {
  console.error("no ledger", file);
  process.exit(1);
}
const L = JSON.parse(fs.readFileSync(file, "utf8"));
const entries = L.entries || L.rooms || [];
function elapsed(ms, lvl) {
  const v = ms && (ms[lvl] ?? ms[String(lvl)]);
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v.elapsed === "number") return v.elapsed;
  return null;
}
function mean(side, lvl) {
  const rows = entries.filter((e) => e.side === side);
  const vals = rows.map((e) => elapsed(e.milestones, lvl)).filter((n) => typeof n === "number");
  const m = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  return { n: rows.length, hit: vals.length, mean: m };
}
function fmt(s, lvl) {
  const x = mean(s, lvl);
  return `RCL${lvl} ${x.mean == null ? "—" : x.mean} (n=${x.hit}/${x.n})`;
}
const tick = (L.watch && L.watch.lastTick) || L.lastTick || "?";
const id = L.runId || path.basename(file, ".json");
for (const side of ["candidate", "control"]) {
  console.log(
    `${id}  ${side}  ${fmt(side, 2)}  ${fmt(side, 3)}  ${fmt(side, 4)}  tick=${tick}`,
  );
}
