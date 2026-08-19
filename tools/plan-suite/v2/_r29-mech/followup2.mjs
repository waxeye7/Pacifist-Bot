import { renderDecl } from "../declprose.mjs";
import { enclosureMobility } from "../layer-shell.mjs";
import { loadPlans, loadRooms, makeChecker } from "./common.mjs";

const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);

const p0 = byPlan.get("E11S2");
console.log("E11S2 rungs", JSON.stringify({
  esc: (p0.meta.shellEscalation?.rungs || []).map((r) => ({
    bonus: r.needDeepBonus, ramparts: r.ramparts, mobility: r.mobility, cut: (r.cutTiles || []).length,
    picked: r.needDeepBonus === p0.meta.shellEscalation?.pickedNeedDeepBonus,
  })),
  decl: ((p0.meta.shortfalls || []).find((s) => s?.ladder)?.ladder?.rungs || []).map((r) => ({
    bonus: r.needDeepBonus, ramparts: r.ramparts, mobility: r.mobility, cut: (r.cutTiles || []).length,
  })),
  shippedRamp: (p0.structures.rampart || []).length,
  cut: (p0.meta.shell.cut || []).length,
  freeze: (p0.meta.shell.cutAtFreeze || []).length,
}, null, 2));

const a = run("88-box-cut-AND-regen-detail", "E11S2", (p) => {
  const d = byRoom.get("E11S2");
  const sitter = p.sitter;
  const fake = [];
  for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]]) {
    fake.push({ x: sitter.x + dx, y: sitter.y + dy });
  }
  const lap = enclosureMobility(d.terrain, p, fake);
  const esc = p.meta.shellEscalation;
  const target = (esc?.rungs || []).find((r) => r && r.needDeepBonus !== esc.pickedNeedDeepBonus);
  if (target && typeof lap === "number") {
    target.cutTiles = fake;
    target.mobility = lap;
    const sf = (p.meta.shortfalls || []).find((s) => s && s.ladder);
    if (sf) {
      const twin = sf.ladder.rungs.find((r) => r.needDeepBonus === target.needDeepBonus);
      if (twin) {
        twin.cutTiles = fake.map((t) => ({ ...t }));
        twin.mobility = lap;
      }
      sf.detail = renderDecl(sf);
    }
  }
});
console.log(a.status, a.name, a.detail?.slice(0, 280));

const b = run("88-keep-cut-zero-mobility-no-regen", "E11S2", (p) => {
  const esc = p.meta.shellEscalation;
  const target = (esc?.rungs || []).find((r) => r && r.needDeepBonus !== esc.pickedNeedDeepBonus);
  if (target) target.mobility = 0.01;
});
console.log(b.status, b.name, b.detail?.slice(0, 200));

// 134(d): swap a film/census class by rewriting emptyBecause on a film? skip.
// 141(e) field inventory
let seedCoord = 0, seedSkipN = 0, seedScoreN = 0, seedPoolN = 0;
const skipHist = {};
for (const p of plans) {
  if (p.meta?.seed && Number.isInteger(p.meta.seed.x)) seedCoord++;
  if (typeof p.meta?.seedSkip === "number") {
    seedSkipN++;
    skipHist[p.meta.seedSkip] = (skipHist[p.meta.seedSkip] || 0) + 1;
  }
  if (typeof p.meta?.seedScore === "number") seedScoreN++;
  if (typeof p.meta?.seedPool === "number") seedPoolN++;
}
console.log(JSON.stringify({ seedCoord, seedSkipN, seedScoreN, seedPoolN, skipHist }, null, 2));
