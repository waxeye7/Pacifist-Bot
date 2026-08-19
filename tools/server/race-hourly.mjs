#!/usr/bin/env node
/** Append one hourly times row. No film. No push. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/speedrun-ledger");
const files = fs.readdirSync(dir).filter((f) => f.startsWith("run-") && f.endsWith(".json")).sort();
const file = path.join(dir, files[files.length - 1]);
const L = JSON.parse(fs.readFileSync(file, "utf8"));
const out = path.join(dir, "TIMES.md");

function elapsed(ms, lvl) {
  const v = ms && (ms[lvl] ?? ms[String(lvl)]);
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v.elapsed === "number") return v.elapsed;
  return null;
}
function mean(side, lvl) {
  const rows = (L.entries || []).filter((e) => e.side === side);
  const vals = rows.map((e) => elapsed(e.milestones, lvl)).filter((n) => typeof n === "number");
  return {
    n: rows.length,
    hit: vals.length,
    mean: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
  };
}
function fmt(x) {
  return x.mean == null ? "—" : `${x.mean} (${x.hit}/${x.n})`;
}
function delta(prev, now) {
  if (prev == null || now == null) return "";
  const d = now - prev;
  return d === 0 ? "0" : (d > 0 ? "+" : "") + d;
}

const tick = L.watch?.lastTick ?? "?";
const cand = { 2: mean("candidate", 2), 3: mean("candidate", 3), 4: mean("candidate", 4) };
const ctrl = { 2: mean("control", 2), 3: mean("control", 3), 4: mean("control", 4) };
const iso = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");

let prev = null;
if (fs.existsSync(out)) {
  const lines = fs.readFileSync(out, "utf8").trim().split(/\r?\n/).filter((l) => l.startsWith("| 20"));
  if (lines.length) {
    const cells = lines[lines.length - 1].split("|").map((s) => s.trim());
    // | time | tick | c2 | c3 | c4 | k2 | k3 | k4 | note |
    const parse = (s) => {
      const m = String(s).match(/^(-?\d+)/);
      return m ? Number(m[1]) : null;
    };
    prev = { c2: parse(cells[3]), c3: parse(cells[4]), c4: parse(cells[5]) };
  }
}

if (!fs.existsSync(out)) {
  fs.writeFileSync(
    out,
    "# Spawn → RCL times (hourly)\n\n" +
      "Candidate vs control. Mean ticks from spawn. `n` = rooms that hit that RCL.\n" +
      "Lower is faster. This baseline was CCK-contaminated — control RCL3/4 is not a fair A/B.\n\n" +
      "| time (UTC) | tick | cand RCL2 | cand RCL3 | cand RCL4 | ctrl RCL2 | ctrl RCL3 | ctrl RCL4 | vs last hour |\n" +
      "|---|---:|---:|---:|---:|---:|---:|---:|---|\n",
  );
}

const vs = [
  "RCL2 " + delta(prev && prev.c2, cand[2].mean),
  "RCL3 " + delta(prev && prev.c3, cand[3].mean),
  "RCL4 " + delta(prev && prev.c4, cand[4].mean),
].join(", ");

const row =
  `| ${iso} | ${tick} | ${fmt(cand[2])} | ${fmt(cand[3])} | ${fmt(cand[4])} | ${fmt(ctrl[2])} | ${fmt(ctrl[3])} | ${fmt(ctrl[4])} | ${prev ? vs : "first row"} |\n`;
fs.appendFileSync(out, row);
process.stdout.write(
  `${L.runId}  cand  RCL2 ${fmt(cand[2])}  RCL3 ${fmt(cand[3])}  RCL4 ${fmt(cand[4])}  |  ctrl  RCL2 ${fmt(ctrl[2])}  RCL3 ${fmt(ctrl[3])}  RCL4 ${fmt(ctrl[4])}  tick=${tick}\n`,
);
