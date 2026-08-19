import { renderDecl } from "../declprose.mjs";
import { loadPlans, loadRooms, makeChecker } from "./common.mjs";

const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);

const a = run("141e-E12S5-seedSkip-both-copies-to-0", "E12S5", (p) => {
  p.meta.seedSkip = 0;
  for (const sf of p.meta.shortfalls || []) {
    if (sf.runtime && typeof sf.runtime.seedSkip === "number") sf.runtime.seedSkip = 0;
    if (typeof sf.seedSkip === "number") sf.seedSkip = 0;
    if (sf.eco && typeof sf.eco.seedSkip === "number") sf.eco.seedSkip = 0;
    if (sf.gate === "runtime" || sf.gate === "eco") {
      try { sf.detail = renderDecl(sf); } catch { /* leave */ }
    }
  }
});
console.log(a.status, a.name, (a.detail || "").slice(0, 300));
console.log("fails", (a.fails || []).map((f) => f.slice(0, 160)));
