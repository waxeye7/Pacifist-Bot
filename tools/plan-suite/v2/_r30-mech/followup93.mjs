/**
 * 93 residue on the disk artifact: remaining recovers leaves.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderNote } from "../declprose-notes.mjs";
import { loadPlans, loadRooms, makeChecker, K } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);
const results = [];
function rec(r) {
  results.push(r);
  console.log(String(r.status).padEnd(8), r.name, r.room, String(r.detail || "").slice(0, 240));
}

const withR = [];
const pocketTaken = [];
for (const p of plans) {
  const taken = p.meta?.sealedRecovery?.outcome === "taken";
  const fh = p.meta?.sealedRecovery?.fixedHolders || [];
  if (fh.some((h) => typeof h.recovers === "number")) {
    withR.push({
      room: p.room,
      taken,
      outcome: p.meta?.sealedRecovery?.outcome,
      holders: fh.map((h) => `${h.type}@${K(h)}=${h.recovers}/${h.recoversDeep}`),
    });
  }
  if (taken) {
    for (const pk of p.meta?.sealedFloor?.pockets || []) {
      if ((pk.holders || []).some((h) => typeof h.recovers === "number")) {
        pocketTaken.push(p.room);
        break;
      }
    }
  }
}
rec({ name: "93-census", room: "*", status: "INFO", detail: JSON.stringify({ withR, pocketTaken }) });

if (withR[0]) {
  rec(run("93-inflate-remaining-fixedHolders-recovers", withR[0].room, (p) => {
    const cap = (p.meta.sealedRecovery.pockets || []).reduce((n, pk) => n + (pk?.tiles || 0), 0);
    for (const f of p.meta.sealedRecovery.fixedHolders || []) {
      if (typeof f.recovers === "number") {
        f.recovers += 1;
        if (cap && f.recovers > cap) f.recovers = cap;
        if (typeof f.recoversDeep === "number" && f.recoversDeep > f.recovers) f.recoversDeep = f.recovers;
      }
    }
  }));
}

// plant recovers back onto taken fixedHolders (E15S6)
rec(run("93-plant-recovers-back-on-taken-fixed", "E15S6", (p) => {
  for (const f of p.meta.sealedRecovery.fixedHolders || []) {
    f.recovers = 2;
    f.recoversDeep = 2;
  }
  for (const nr of p.meta.noteRecords || []) {
    if (nr.cls !== "sealedRecovery" || !nr.rec) continue;
    nr.rec.fixedHolders = JSON.parse(JSON.stringify(p.meta.sealedRecovery.fixedHolders));
    const i = p.meta.noteRecords.indexOf(nr);
    if (i >= 0) p.meta.notes[i] = renderNote(nr);
  }
}));

// inflate sealedFloor pocket recovers on taken room, regen note
rec(run("93-taken-inflate-pocket-recovers-only", "E15S6", (p) => {
  for (const pk of p.meta.sealedFloor?.pockets || []) {
    for (const h of pk.holders || []) {
      if (typeof h.recovers === "number") h.recovers += 1;
    }
  }
}));

rec(run("93-taken-inflate-pocket-recovers-and-regen", "E15S6", (p) => {
  for (const pk of p.meta.sealedFloor?.pockets || []) {
    for (const h of pk.holders || []) {
      if (typeof h.recovers === "number") {
        h.recovers += 1;
        if (typeof h.recoversDeep === "number" && h.recoversDeep > h.recovers) h.recoversDeep = h.recovers;
      }
    }
  }
  for (const nr of p.meta.noteRecords || []) {
    if (nr.cls !== "sealedFloor" || !nr.rec?.pockets) continue;
    nr.rec.pockets = JSON.parse(JSON.stringify(p.meta.sealedFloor.pockets));
    const i = p.meta.noteRecords.indexOf(nr);
    if (i >= 0) p.meta.notes[i] = renderNote(nr);
  }
}));

// inflate pocket recoversDeep
rec(run("93-taken-inflate-pocket-recoversDeep-and-regen", "E15S6", (p) => {
  for (const pk of p.meta.sealedFloor?.pockets || []) {
    for (const h of pk.holders || []) {
      if (typeof h.recovers === "number") {
        h.recovers += 1;
        h.recoversDeep = (h.recoversDeep || 0) + 1;
        if (h.recoversDeep > h.recovers) h.recoversDeep = h.recovers;
      }
    }
  }
  for (const nr of p.meta.noteRecords || []) {
    if (nr.cls !== "sealedFloor" || !nr.rec?.pockets) continue;
    nr.rec.pockets = JSON.parse(JSON.stringify(p.meta.sealedFloor.pockets));
    const i = p.meta.noteRecords.indexOf(nr);
    if (i >= 0) p.meta.notes[i] = renderNote(nr);
  }
}));

fs.writeFileSync(path.join(DIR, "followup93.json"), JSON.stringify({ withR, pocketTaken, results }, null, 2));
console.log(JSON.stringify({
  withR: withR.map((r) => r.room + (r.taken ? ":taken" : ":" + r.outcome)),
  pocketTaken,
  bites: results.filter((r) => r.status === "BITES").map((r) => r.name),
  escapes: results.filter((r) => r.status === "ESCAPE").map((r) => r.name),
}, null, 2));
