/**
 * Extra owner-voice dump: shortfalls, notes, ascii, E11S1 reserved, taken recovers.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadPlans, loadRooms, K, hashedRooms } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const hashed = hashedRooms(plans).slice(0, 5).map((r) => r.room);
const names = [...hashed, "E12S1", "E15S4", "E11S1", "E12S7", "E12S6", "E7S5", "E9S2", "E2S7", "E1S4"];

const sampleJson = JSON.parse(fs.readFileSync(path.join(DIR, "sample.json"), "utf8"));
const bySample = new Map(sampleJson.map((r) => [r.room, r]));

for (const name of names) {
  const p = plans.find((x) => x.room === name);
  const sfs = (p.meta?.shortfalls || []).map((s) => ({
    gate: s.gate,
    kind: s.kind,
    detail: String(s.detail || "").slice(0, 280),
  }));
  const notes = (p.meta?.noteRecords || []).map((n) => ({
    cls: n.cls,
    detail: String(n.detail || n.rec?.detail || "").slice(0, 240),
  }));
  const ascii = bySample.get(name)?.ascii;
  console.log("\n====", name, "====");
  console.log("sitter", p.sitter, "hub", p.hub, "seed", p.seed, "score", p.meta?.seedScore);
  console.log("baseCut", p.meta?.shell?.baseCut, "protect", p.meta?.shell?.protectRadius, "cut", (p.meta?.shell?.cut || []).length, "freeze", (p.meta?.shell?.cutAtFreeze || []).length);
  console.log("mobility", p.meta?.walls?.mobility?.builtGated, "enclosedCtrl", p.meta?.shell?.enclosedController);
  console.log("labs.haul", p.meta?.labs?.haul, "variant", p.meta?.labs?.variant);
  console.log("redundantCut", p.meta?.shell?.redundantCut);
  console.log("drift", (p.meta?.shell?.cutDrift || []).map((e) => `${e.op} ${K(e)} ${e.pass}`));
  console.log("SF", JSON.stringify(sfs, null, 2));
  console.log("NOTES", JSON.stringify(notes, null, 2));
  if (ascii) {
    console.log(`ascii ${ascii.x0},${ascii.y0}..${ascii.x1},${ascii.y1}`);
    for (const line of ascii.lines) console.log(line);
  }
}

const e11 = plans.find((p) => p.room === "E11S1");
const reserved = e11.meta.extensions.laneMeta.fullRun.reserved;
console.log("\n==== E11S1 reserved D8 of 19,27 ====");
console.log({ reserved, lane: e11.meta.extensions.laneMeta.reserved });
const [tx, ty] = [19, 27];
const near = reserved.filter((k) => {
  const [x, y] = k.split(",").map(Number);
  return Math.max(Math.abs(x - tx), Math.abs(y - ty)) <= 1 && k !== "19,27";
});
console.log("D8 neighbours of 19,27 already reserved:", near);

const taken = [];
for (const p of plans) {
  const R = p.meta?.sealedRecovery;
  if (!R) continue;
  if (R.outcome === "taken" || R.taken) {
    const recKeys = [];
    for (const h of R.fixedHolders || []) {
      if ("recovers" in h || "recoversDeep" in h) recKeys.push(h);
    }
    taken.push({
      room: p.room,
      outcome: R.outcome,
      n: (R.fixedHolders || []).length,
      recoverKeys: recKeys.length,
      holderKeys: (R.fixedHolders || []).slice(0, 2).map((h) => Object.keys(h)),
    });
  }
}
console.log("\n==== taken recovers leftover ====");
console.log(JSON.stringify(taken, null, 2));
