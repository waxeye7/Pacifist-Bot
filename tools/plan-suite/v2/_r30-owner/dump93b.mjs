import { loadPlans, K } from "./common.mjs";
const { plans } = loadPlans();
const p = plans.find((x) => x.room === "E15S6");
const R = p.meta.sealedRecovery;
const F = p.meta.sealedFloor;
function hold(h) {
  if (!h || typeof h !== "object") return h;
  return { t: h.type, k: h.x != null ? K(h) : undefined, r: h.recovers, d: h.recoversDeep, keys: Object.keys(h) };
}
console.log("R keys", Object.keys(R || {}));
console.log("R.pockets type", Array.isArray(R.pockets), typeof R.pockets, R.pockets && Object.keys(R.pockets));
console.log("F keys", F && Object.keys(F));
console.log("F.pockets n", F?.pockets?.length);
if (F?.pockets) {
  for (const pk of F.pockets) {
    console.log("F pocket", {
      tiles: pk.tiles,
      holdersIsArray: Array.isArray(pk.holders),
      holders: Array.isArray(pk.holders) ? pk.holders.map(hold) : pk.holders,
      best: pk.best && hold(pk.best),
    });
  }
}
const notes = (p.meta.noteRecords || []).filter((n) => /sealed/i.test(n.cls || ""));
for (const n of notes) {
  console.log("NOTE", n.cls, "rec keys", n.rec && Object.keys(n.rec));
  console.log("  fixedHolders", JSON.stringify((n.rec?.fixedHolders || []).map(hold)));
}
// fleet: which taken rooms still publish recovers on fixedHolders?
const rows = [];
for (const q of plans) {
  const S = q.meta?.sealedRecovery;
  if (!S || S.outcome !== "taken") continue;
  const hs = S.fixedHolders || [];
  rows.push({
    room: q.room,
    n: hs.length,
    withR: hs.filter((h) => typeof h.recovers === "number").length,
    keys: [...new Set(hs.flatMap((h) => Object.keys(h)))],
    sample: hs[0],
  });
}
console.log("taken fleet", JSON.stringify(rows, null, 2));
