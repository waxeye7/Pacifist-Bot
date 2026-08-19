import { loadPlans, K } from "./common.mjs";
const { plans } = loadPlans();
const p = plans.find((x) => x.room === "E15S6");
const R = p.meta.sealedRecovery;
const F = p.meta.sealedFloor;
console.log("fixedHolders keys", (R.fixedHolders || []).map((h) => Object.keys(h)));
console.log("fixedHolders raw", JSON.stringify(R.fixedHolders, null, 2));
console.log("R.pockets", JSON.stringify((R.pockets || []).map((pk) => ({ tiles: pk.tiles, holders: (pk.holders || []).map((h) => ({ t: h.type, k: K(h), r: h.recovers, d: h.recoversDeep, keys: Object.keys(h) })) })), null, 2));
console.log("sealedFloor pockets holders", JSON.stringify((F?.pockets || []).map((pk) => ({ tiles: pk.tiles, holders: (pk.holders || []).map((h) => ({ t: h.type, k: K(h), r: h.recovers, d: h.recoversDeep })) })), null, 2).slice(0, 2000));
const notes = (p.meta.noteRecords || []).filter((n) => n.cls === "sealedRecovery" || n.cls === "sealedFloor");
for (const n of notes) {
  console.log("note", n.cls, "fixedHolders", JSON.stringify(n.rec?.fixedHolders, null, 2)?.slice(0, 800));
  console.log("note pockets holders", JSON.stringify((n.rec?.pockets || []).map((pk) => (pk.holders || []).map((h) => ({ t: h.type, r: h.recovers, d: h.recoversDeep }))), null, 2)?.slice(0, 800));
}
