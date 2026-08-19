/**
 * 93 re-attack now that taken fixedHolders dropped recovers.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderNote } from "../declprose-notes.mjs";
import { loadPlans, loadRooms, makeChecker } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);
const attacks = [];
async function rec(p) {
  const r = await p;
  attacks.push(r);
  console.log(String(r.status).padEnd(8), r.name, r.room, "changed=" + r.changed, String(r.first || "").slice(0, 220));
  return r;
}

await rec(run("93c plant recovers on taken fixedHolders + note twin", "E15S6", (p) => {
  const R0 = p.meta.sealedRecovery;
  const cap = (R0.pockets || []).reduce((n, pk) => n + (pk?.tiles || 0), 0) || 72;
  for (const h of R0.fixedHolders || []) {
    h.recovers = 2;
    h.recoversDeep = 2;
  }
  for (const nr of p.meta.noteRecords || []) {
    if (nr.cls !== "sealedRecovery" || !nr.rec) continue;
    nr.rec.fixedHolders = JSON.parse(JSON.stringify(R0.fixedHolders));
    const i = p.meta.noteRecords.indexOf(nr);
    if (i >= 0 && Array.isArray(p.meta.notes)) p.meta.notes[i] = renderNote(nr);
  }
  void cap;
}));

await rec(run("93c inflate sealedFloor pocket holder recovers + note", "E15S6", (p) => {
  const F = p.meta.sealedFloor;
  for (const pk of F.pockets || []) {
    for (const h of pk.holders || []) {
      if (typeof h.recovers === "number") {
        h.recovers += 1;
        if (typeof h.recoversDeep === "number") h.recoversDeep = Math.min(h.recoversDeep, h.recovers);
      }
    }
  }
  for (const nr of p.meta.noteRecords || []) {
    if (nr.cls !== "sealedFloor" || !nr.rec) continue;
    nr.rec.pockets = JSON.parse(JSON.stringify(F.pockets));
    const i = p.meta.noteRecords.indexOf(nr);
    if (i >= 0 && Array.isArray(p.meta.notes)) p.meta.notes[i] = renderNote(nr);
  }
}));

await rec(run("93c inflate offered recoversDeep + twins", "E15S6", (p) => {
  const R0 = p.meta.sealedRecovery;
  for (const o of R0.offered || []) {
    if (typeof o.recoversDeep === "number") o.recoversDeep += 1;
    if (typeof o.recovers === "number") o.recovers += 1;
  }
  for (const nr of p.meta.noteRecords || []) {
    if (nr.cls !== "sealedRecovery" || !nr.rec) continue;
    if (Array.isArray(nr.rec.offered)) nr.rec.offered = JSON.parse(JSON.stringify(R0.offered));
    const i = p.meta.noteRecords.indexOf(nr);
    if (i >= 0 && Array.isArray(p.meta.notes)) p.meta.notes[i] = renderNote(nr);
  }
}));

await rec(run("93c invent holder on sealedFloor pocket", "E15S6", (p) => {
  const pk = (p.meta.sealedFloor.pockets || []).find((q) => Array.isArray(q.holders));
  if (pk) pk.holders.push({ type: "lab", x: 1, y: 1, recovers: 99, recoversDeep: 99 });
}));

fs.writeFileSync(path.join(DIR, "attack93-out.json"), JSON.stringify(attacks, null, 2));
console.log(JSON.stringify({
  n: attacks.length,
  escapes: attacks.filter((a) => a.status === "ESCAPE").map((a) => ({ name: a.name, changed: a.changed })),
  bites: attacks.filter((a) => a.status === "BITES").map((a) => a.name),
}, null, 2));
