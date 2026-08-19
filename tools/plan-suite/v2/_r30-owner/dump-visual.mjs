import { loadPlans, K } from "./common.mjs";
const { plans } = loadPlans();
const names = ["E13S5", "E15S2", "E11S9", "E3S4", "E6S5", "E12S7", "E9S2", "E12S6"];
for (const name of names) {
  const p = plans.find((x) => x.room === name);
  const sfs = (p.meta?.shortfalls || []).map((s) => ({
    gate: s.gate,
    kind: s.kind,
    detail: String(s.detail || "").slice(0, 220),
  }));
  const notes = (p.meta?.noteRecords || []).map((n) => ({
    cls: n.cls,
    detail: String(n.detail || n.rec?.detail || "").slice(0, 220),
  }));
  const labs = p.meta?.labs || {};
  console.log("\n====", name, "====");
  console.log("labs.haul", labs.haul, "variant", labs.variant, "anchor", labs.anchor);
  console.log("redundantCut", p.meta?.shell?.redundantCut);
  console.log("SF", JSON.stringify(sfs, null, 2));
  console.log("NOTES", JSON.stringify(notes, null, 2));
}
