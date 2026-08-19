import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { key } from "../shared.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PLANS = path.resolve(DIR, "../../out-v2/plans-hub.json");
const plans = JSON.parse(fs.readFileSync(PLANS, "utf8"));

const missRamp = [];
for (const p of plans) {
  const sh = p.meta.shell;
  const shipN = (p.structures.rampart || []).length;
  const inert = (sh.inertPruned || []).filter((t) => t && Number.isInteger(t.x));
  const startN = shipN + inert.filter((t) => !(p.structures.rampart || []).some((r) => r.x === t.x && r.y === t.y)).length;
  // start as set size
  const start = new Set([
    ...(p.structures.rampart || []).map((t) => key(t.x, t.y)),
    ...inert.map((t) => key(t.x, t.y)),
  ]);
  const l7p = (sh.cutPasses || []).find((m) => m && m.pass === "layer7-inertPrune");
  if (!l7p) continue;
  if (l7p.ramparts !== start.size) {
    const ext = p.meta.extensions || {};
    const walls = p.meta.walls || {};
    missRamp.push({
      room: p.room,
      pub: l7p.ramparts,
      start: start.size,
      ship: shipN,
      inert: inert.length,
      d1: l7p.rampartsDeleted,
      rem: l7p.removes,
      delta: l7p.ramparts - start.size,
      shallow: ext.shallow,
      relocated: ext.relocatedCount,
      reflow: walls.reflow ?? ext.reflow,
      paveRetired: walls.paveRetired,
    });
  }
}
console.log("ramp miss", missRamp.length);
console.log(JSON.stringify(missRamp, null, 2));
