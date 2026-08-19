/**
 * r44: p22 towers.baseLap empty-room walk vs p21 walk / declaration twin.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadPlans, loadRooms, makeChecker } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);

function grab(obj, name, path0 = "meta") {
  const hits = [];
  const stack = [{ o: obj, path: path0 }];
  while (stack.length) {
    const { o, path: pth } = stack.pop();
    if (!o || typeof o !== "object") continue;
    if (Array.isArray(o)) {
      o.forEach((e, i) => stack.push({ o: e, path: `${pth}[${i}]` }));
      continue;
    }
    for (const [k, v] of Object.entries(o)) {
      if (k === name) hits.push({ path: `${pth}.${k}`, v });
      if (v && typeof v === "object") stack.push({ o: v, path: `${pth}.${k}` });
    }
  }
  return hits;
}

const e11s7 = byPlan.get("E11S7");
const e11s2 = byPlan.get("E11S2");
const hits7 = grab(e11s7.meta, "baseLap");
const hits2 = grab(e11s2.meta, "baseLap");
const rows = [];
async function rec(p) {
  const r = await p;
  rows.push(r);
  console.log(String(r.status).padEnd(8), r.name, String(r.first || "").slice(0, 220));
  return r;
}

function setAt(p, path, val) {
  const parts = path.replace(/^meta\./, "").split(".");
  let o = p.meta;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const m = k.match(/^(.+)\[(\d+)\]$/);
    if (m) o = o[m[1]][Number(m[2])];
    else o = o[k];
    if (!o) return false;
  }
  const last = parts[parts.length - 1];
  const m = last.match(/^(.+)\[(\d+)\]$/);
  if (m) o[m[1]][Number(m[2])] = val;
  else o[last] = val;
  return true;
}

function walkSetBaseLap(obj, pred, val, n = { n: 0 }) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) walkSetBaseLap(el, pred, val, n);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "baseLap" && typeof v === "number" && pred(obj, k, v)) {
      obj[k] = val;
      n.n++;
    } else if (v && typeof v === "object") walkSetBaseLap(v, pred, val, n);
  }
}

await rec(run("E11S7 towers.baseLap := 0", "E11S7", (p) => { p.meta.towers.mobilityVeto.baseLap = 0; }));
await rec(run("E11S7 towers.baseLap += 1", "E11S7", (p) => { p.meta.towers.mobilityVeto.baseLap += 1; }));
await rec(run("E11S7 towers.baseLap := veto 7.67", "E11S7", (p) => {
  p.meta.towers.mobilityVeto.baseLap = p.meta.misc.mobilityVeto.baseLap;
}));
await rec(run("E11S7 towers+repair.baseLap := 0", "E11S7", (p) => {
  p.meta.towers.mobilityVeto.baseLap = 0;
  walkRepair(p, 0);
}));
await rec(run("E11S7 every baseLap := 0 except veto+labs", "E11S7", (p) => {
  walkSetBaseLap(p.meta, (parent) => parent !== p.meta.misc?.mobilityVeto && parent !== p.meta.labs?.lapVeto, 0);
}));
await rec(run("E11S2 every baseLap := 0 except veto+labs", "E11S2", (p) => {
  walkSetBaseLap(p.meta, (parent) => parent !== p.meta.misc?.mobilityVeto && parent !== p.meta.labs?.lapVeto, 0);
}));
await rec(run("E11S2 every baseLap := 0 including veto+labs", "E11S2", (p) => {
  walkSetBaseLap(p.meta, () => true, 0);
}));
await rec(run("E11S2 towers+all other baseLap := 0 keep veto+labs", "E11S2", (p) => {
  const keepV = p.meta.misc.mobilityVeto.baseLap;
  const keepL = p.meta.labs?.lapVeto?.baseLap;
  walkSetBaseLap(p.meta, () => true, 0);
  p.meta.misc.mobilityVeto.baseLap = keepV;
  if (p.meta.labs?.lapVeto) p.meta.labs.lapVeto.baseLap = keepL;
}));

function walkRepair(obj, val, n = { n: 0 }) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) walkRepair(el, val, n);
    return;
  }
  if (obj.tower && typeof obj.tower === "object" && typeof obj.tower.baseLap === "number") {
    obj.tower.baseLap = val;
    n.n++;
  }
  for (const v of Object.values(obj)) if (v && typeof v === "object") walkRepair(v, val, n);
}
await rec(run("E11S2 towers.baseLap=0 + rewrite every repair.tower.baseLap=0", "E11S2", (p) => {
  p.meta.towers.mobilityVeto.baseLap = 0;
  walkRepair(p, 0);
}));

const out = {
  e11s7: {
    veto: e11s7.meta?.misc?.mobilityVeto?.baseLap,
    labs: e11s7.meta?.labs?.lapVeto?.baseLap,
    towers: e11s7.meta?.towers?.mobilityVeto?.baseLap,
    hits: hits7,
  },
  e11s2: {
    veto: e11s2.meta?.misc?.mobilityVeto?.baseLap,
    labs: e11s2.meta?.labs?.lapVeto?.baseLap,
    towers: e11s2.meta?.towers?.mobilityVeto?.baseLap,
    hits: hits2,
  },
  rows,
};
fs.writeFileSync(path.join(DIR, "twin.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  e11s7: out.e11s7,
  e11s2: out.e11s2,
  rows: rows.map((r) => ({ name: r.name, status: r.status, first: (r.first || "").slice(0, 200) })),
}, null, 2));
