import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PLANS = path.resolve(DIR, "../../out-v2/plans-hub.json");
const plans = JSON.parse(fs.readFileSync(PLANS, "utf8"));
const want = new Set(["E12S2", "E1S7", "E4S4"]);

for (const p of plans) {
  if (!want.has(p.room)) continue;
  const w = p.meta.walls || {};
  const e = p.meta.extensions || {};
  const rf = w.reflow || e.reflow || {};
  console.log(JSON.stringify({
    room: p.room,
    shipRamp: (p.structures.rampart || []).length,
    inert: (p.meta.shell.inertPruned || []).length,
    l7: (p.meta.shell.cutPasses || []).find((m) => m.pass === "layer7-inertPrune"),
    l7b: (p.meta.shell.cutPasses || []).find((m) => m.pass === "layer7b-inertPrune"),
    relocatedCount: e.relocatedCount,
    relocated: (e.relocated || []).slice(0, 8),
    reflowMoved: rf.moved,
    reflowRetired: rf.rampartsRetired,
    reflowAdded: rf.added,
    reflowShallowR: rf.shallowRamparts,
    reflowShallow: rf.shallow,
    mobilityRepair: rf.mobilityRepair,
    paveRetired: w.paveRetired,
    noteKeys: Object.keys(p.meta).filter((k) => /reflow|retir|shallow|reloc/i.test(k)),
    wallKeys: Object.keys(w).filter((k) => /reflow|retir|shallow|reloc|inert/i.test(k)),
  }, null, 2));
}
