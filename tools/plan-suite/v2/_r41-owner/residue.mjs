/**
 * r41 residue hunts on p19 named closes. Clones only.
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

const out = { room: swFrom?.room, alt, rows };
fs.writeFileSync(path.join(DIR, "residue.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  room: swFrom?.room,
  alt,
  rows: rows.map((r) => ({ name: r.name, status: r.status, first: (r.first || "").slice(0, 200) })),
}, null, 2));
