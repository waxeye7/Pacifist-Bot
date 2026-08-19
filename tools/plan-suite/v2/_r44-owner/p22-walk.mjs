/**
 * Isolate p22 walk from the repair.tower twin / generated paragraph.
 * Clones only. Regen mobility decls after rewrite.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderDecl } from "../declprose.mjs";
import { enclosureMobility } from "../layer-shell.mjs";
import { loadPlans, loadRooms, makeChecker, realFails, checkRoomLazy } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);

function freezeCut(p) {
  return p.meta?.shell?.cutAtFreeze?.length ? p.meta.shell.cutAtFreeze : p.meta?.shell?.cut || [];
}

function walkRepair(obj, val) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) walkRepair(el, val);
    return;
  }
  if (obj.tower && typeof obj.tower === "object" && typeof obj.tower.baseLap === "number") {
    obj.tower.baseLap = val;
  }
  for (const v of Object.values(obj)) if (v && typeof v === "object") walkRepair(v, val);
}

function regenMobility(p) {
  for (const sf of p.meta.shortfalls || []) {
    if (!sf) continue;
    if (sf.kind === "mobility" || sf.gate === "mobility" || sf.repair?.tower) {
      try { sf.detail = renderDecl(sf); } catch { /* leave */ }
    }
  }
}

const rows = [];
async function rec(p) {
  const r = await p;
  rows.push(r);
  console.log(String(r.status).padEnd(8), r.name, (r.first || "").slice(0, 260));
  return r;
}

const e7 = byPlan.get("E11S7");
const d7 = byRoom.get("E11S7");
const emptyLap = enclosureMobility(d7.terrain, e7, freezeCut(e7));
const facts = {
  veto: e7.meta.misc.mobilityVeto.baseLap,
  labs: e7.meta.labs.lapVeto.baseLap,
  towers: e7.meta.towers.mobilityVeto.baseLap,
  emptyLap,
};

await rec(run("p22 :=0 raw", "E11S7", (p) => { p.meta.towers.mobilityVeto.baseLap = 0; }));
await rec(run("p22 +=1 raw", "E11S7", (p) => { p.meta.towers.mobilityVeto.baseLap += 1; }));
await rec(run("p22 := veto raw", "E11S7", (p) => { p.meta.towers.mobilityVeto.baseLap = p.meta.misc.mobilityVeto.baseLap; }));
await rec(run("p22 :=0 + repair twin + regen", "E11S7", (p) => {
  p.meta.towers.mobilityVeto.baseLap = 0;
  walkRepair(p, 0);
  regenMobility(p);
}));
await rec(run("p22 +=1 + repair twin + regen", "E11S7", (p) => {
  p.meta.towers.mobilityVeto.baseLap += 1;
  walkRepair(p, p.meta.towers.mobilityVeto.baseLap);
  regenMobility(p);
}));
await rec(run("p22 := veto + repair twin + regen", "E11S7", (p) => {
  p.meta.towers.mobilityVeto.baseLap = p.meta.misc.mobilityVeto.baseLap;
  walkRepair(p, p.meta.towers.mobilityVeto.baseLap);
  regenMobility(p);
}));
await rec(run("p22 := emptyLap identity (no-op)", "E11S7", (p) => {
  p.meta.towers.mobilityVeto.baseLap = emptyLap;
}));

const checkRoom = await checkRoomLazy();
function firstAll(label, mutate) {
  const p = JSON.parse(JSON.stringify(e7));
  mutate(p);
  const res = checkRoom(p, d7.terrain, d7.objects, null);
  const real = realFails(res);
  const walk = real.filter((f) => /hub kit standing|empty-room walk|towers\.mobilityVeto\.baseLap is/i.test(f));
  const twin = real.filter((f) => /repair\.tower\.baseLap/i.test(f));
  console.log("DETAIL", label, "n=" + real.length, "walk=" + walk.length, "twin=" + twin.length);
  return {
    label,
    n: real.length,
    first: (real[0] || "").slice(0, 280),
    walk: walk.map((f) => f.slice(0, 220)),
    twin: twin.map((f) => f.slice(0, 180)),
  };
}

const details = [
  firstAll(":=0 raw", (p) => { p.meta.towers.mobilityVeto.baseLap = 0; }),
  firstAll(":=0 + twin + regen", (p) => {
    p.meta.towers.mobilityVeto.baseLap = 0;
    walkRepair(p, 0);
    regenMobility(p);
  }),
  firstAll("+=1 + twin + regen", (p) => {
    p.meta.towers.mobilityVeto.baseLap += 1;
    walkRepair(p, p.meta.towers.mobilityVeto.baseLap);
    regenMobility(p);
  }),
  firstAll(":=veto + twin + regen", (p) => {
    p.meta.towers.mobilityVeto.baseLap = p.meta.misc.mobilityVeto.baseLap;
    walkRepair(p, p.meta.towers.mobilityVeto.baseLap);
    regenMobility(p);
  }),
];

const out = { facts, rows, details };
fs.writeFileSync(path.join(DIR, "p22-walk.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ facts, rows: rows.map((r) => ({ name: r.name, status: r.status, n: r.n, first: (r.first || "").slice(0, 160) })), details }, null, 2));
