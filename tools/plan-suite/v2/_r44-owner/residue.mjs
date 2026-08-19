/**
 * r43 residue hunts on p19/p20/p21 named closes. Clones only.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderNote } from "../declprose-notes.mjs";
import { loadPlans, loadRooms, makeChecker, D8 } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);
const rows = [];
async function rec(p) {
  const r = await p;
  rows.push(r);
  console.log(String(r.status).padEnd(8), r.name, (r.first || "").slice(0, 280));
  return r;
}

const swFrom = plans.find((p) => p.meta?.composeOpts?.takeTowerSwap?.from && Number.isInteger(p.meta.composeOpts.takeTowerSwap.from.x));
const to = swFrom.meta.composeOpts.takeTowerSwap.to;
const from = swFrom.meta.composeOpts.takeTowerSwap.from;
const towers = new Set((swFrom.structures?.tower || []).map((t) => `${t.x},${t.y}`));
const alt = D8
  .map(([dx, dy]) => ({ x: to.x + dx, y: to.y + dy }))
  .find((t) => (t.x !== from.x || t.y !== from.y) && !towers.has(`${t.x},${t.y}`));

function rewriteSwap(p, nextFrom) {
  p.meta.composeOpts.takeTowerSwap.from = { x: nextFrom.x, y: nextFrom.y };
  if (p.meta.towers?.acrossPriorTake?.taken) {
    p.meta.towers.acrossPriorTake.taken.from = { x: nextFrom.x, y: nextFrom.y };
  }
  if (p.meta.towers?.towerSwapTaken) {
    p.meta.towers.towerSwapTaken.from = { x: nextFrom.x, y: nextFrom.y };
  }
  if (p.meta.towers?.towerSwapOffer?.best?.from) {
    p.meta.towers.towerSwapOffer.best.from = { x: nextFrom.x, y: nextFrom.y };
  }
  if (p.meta.towers?.adjacency?.satAcrossPrior?.leaves) {
    p.meta.towers.adjacency.satAcrossPrior.leaves = { x: nextFrom.x, y: nextFrom.y };
  }
}

if (alt) {
  await rec(run(`p19 from other D8 ${alt.x},${alt.y} + all take twins`, swFrom.room, (p) => {
    rewriteSwap(p, alt);
  }));
  await rec(run(`p19 from other D8 ${alt.x},${alt.y} + twins + noteRecords`, swFrom.room, (p) => {
    rewriteSwap(p, alt);
    for (const nr of p.meta.noteRecords || []) {
      if (nr.cls !== "towerSwap" || !nr.rec) continue;
      if (nr.rec.taken?.from) nr.rec.taken.from = { x: alt.x, y: alt.y };
      if (nr.rec.from) nr.rec.from = { x: alt.x, y: alt.y };
      const i = p.meta.noteRecords.indexOf(nr);
      if (i >= 0 && Array.isArray(p.meta.notes)) {
        try { p.meta.notes[i] = renderNote(nr); } catch { /* leave */ }
      }
    }
    if (p.meta.towers?.acrossPriorTake) {
      for (const nr of p.meta.noteRecords || []) {
        if (nr.cls !== "towerSwap") continue;
        nr.rec = nr.rec || {};
        nr.rec.taken = JSON.parse(JSON.stringify(p.meta.towers.acrossPriorTake.taken));
        const i = p.meta.noteRecords.indexOf(nr);
        if (i >= 0 && Array.isArray(p.meta.notes)) {
          try { p.meta.notes[i] = renderNote(nr); } catch { /* leave */ }
        }
      }
    }
  }));
}

const seR = plans.find((p) => typeof p.meta?.walls?.servedExts === "number");
if (seR) {
  await rec(run("p19 servedExts+filler+extFace += 1", seR.room, (p) => {
    p.meta.walls.servedExts = (p.meta.walls.servedExts || 0) + 1;
    p.meta.walls.fillerTiles = (p.meta.walls.fillerTiles || 0) + 1;
    if (!p.meta.walls.laidByKind) p.meta.walls.laidByKind = {};
    p.meta.walls.laidByKind.extFace = (p.meta.walls.laidByKind.extFace || 0) + 1;
  }));
}

await rec(run("p19 unreachedClusters := 0 no-op", "E11S1", (p) => {
  p.meta.walls.unreachedClusters = 0;
}));

const lapR = plans.find((p) => typeof p.meta?.misc?.mobilityVeto?.baseLap === "number" && p.meta.misc.mobilityVeto.baseLap !== 0);
if (lapR) {
  await rec(run("p21 baseLap := 0", lapR.room, (p) => { p.meta.misc.mobilityVeto.baseLap = 0; }));
  await rec(run("p21 baseLap += 1", lapR.room, (p) => { p.meta.misc.mobilityVeto.baseLap += 1; }));
}
const labsR = plans.find((p) => typeof p.meta?.labs?.lapVeto?.baseLap === "number" && p.meta.labs.lapVeto.baseLap !== 0);
if (labsR) {
  await rec(run("p21 labs.baseLap := 0", labsR.room, (p) => { p.meta.labs.lapVeto.baseLap = 0; }));
}
const nkR = plans.find((p) => typeof p.meta?.misc?.mobilityVeto?.nuker?.baseLap === "number" && p.meta.misc.mobilityVeto.nuker.baseLap !== 0);
if (nkR) await rec(run("p21 nuker.baseLap := 0", nkR.room, (p) => { p.meta.misc.mobilityVeto.nuker.baseLap = 0; }));
const obR = plans.find((p) => typeof p.meta?.misc?.mobilityVeto?.observer?.baseLap === "number" && p.meta.misc.mobilityVeto.observer.baseLap !== 0);
if (obR) await rec(run("p21 observer.baseLap := 0", obR.room, (p) => { p.meta.misc.mobilityVeto.observer.baseLap = 0; }));
const twR = plans.find((p) => typeof p.meta?.towers?.mobilityVeto?.baseLap === "number" && p.meta.towers.mobilityVeto.baseLap !== 0);
if (twR) await rec(run("p21 towers.baseLap := 0", twR.room, (p) => { p.meta.towers.mobilityVeto.baseLap = 0; }));
const rpR = plans.find((p) => typeof p.meta?.walls?.mobility?.repair?.tower?.baseLap === "number" && p.meta.walls.mobility.repair.tower.baseLap !== 0);
if (rpR) await rec(run("p21 repair.tower.baseLap := 0", rpR.room, (p) => { p.meta.walls.mobility.repair.tower.baseLap = 0; }));

const out = { room: swFrom?.room, alt, rows };
fs.writeFileSync(path.join(DIR, "residue.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  room: swFrom?.room,
  alt,
  rows: rows.map((r) => ({ name: r.name, status: r.status, first: (r.first || "").slice(0, 200) })),
}, null, 2));
