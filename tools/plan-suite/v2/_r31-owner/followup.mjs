/**
 * Follow-up: 88 nudge seal, leaksCut types, E15S4 drift.
 */
import { enclosureMobility } from "../layer-shell.mjs";
import { loadPlans, loadRooms, floodExterior, K, KT } from "./common.mjs";

const { plans } = loadPlans();
const { byRoom } = loadRooms();

const p = plans.find((x) => x.room === "E11S2");
const d = byRoom.get("E11S2");
const shipped = (p.structures.rampart || []).length;
const fat = (p.meta.shellEscalation.rungs || []).find((r) => r.needDeepBonus === 85);
const freeze = new Set((p.meta.shell.cutAtFreeze || []).map(K));
const used = new Set(fat.cutTiles.map(K));
const t = fat.cutTiles[0];
let fake = null;
for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) {
  const nx = t.x + dx, ny = t.y + dy;
  const k = `${nx},${ny}`;
  if (nx < 1 || ny < 1 || nx > 48 || ny > 48 || used.has(k) || freeze.has(k)) continue;
  fake = fat.cutTiles.map((q, j) => (j === 0 ? { x: nx, y: ny } : { x: q.x, y: q.y }));
  break;
}
const sitter = p.sitter;
const fakeSet = new Set(fake.map(K));
const origSet = new Set(fat.cutTiles.map(K));
const extFake = floodExterior(d.terrain, fakeSet);
const extOrig = floodExterior(d.terrain, origSet);
const si = sitter.x + sitter.y * 50;
const lapFake = enclosureMobility(d.terrain, p, fake);
const lapOrig = enclosureMobility(d.terrain, p, fat.cutTiles);
const shippedCut = p.meta.shell.cut;
const lapShip = enclosureMobility(d.terrain, p, shippedCut);
console.log(JSON.stringify({
  firstTile: K(t),
  nudgedTo: fake[0],
  nOrig: fat.cutTiles.length,
  nFake: fake.length,
  nShip: shippedCut.length,
  shippedRamp: shipped,
  lapOrig,
  lapFake,
  lapShip,
  sitterLeaksOrig: !!extOrig[si],
  sitterLeaksFake: !!extFake[si],
}, null, 2));

// more nudges: keep lap near original
let kept = null;
for (let i = 0; i < fat.cutTiles.length && !kept; i++) {
  const ti = fat.cutTiles[i];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1]]) {
    const nx = ti.x + dx, ny = ti.y + dy;
    const k = `${nx},${ny}`;
    if (nx < 1 || ny < 1 || nx > 48 || ny > 48 || used.has(k) || freeze.has(k)) continue;
    const cand = fat.cutTiles.map((q, j) => (j === i ? { x: nx, y: ny } : { x: q.x, y: q.y }));
    const lap = enclosureMobility(d.terrain, p, cand);
    if (typeof lap !== "number") continue;
    const ext = floodExterior(d.terrain, new Set(cand.map(K)));
    const leaks = !!ext[si];
    if (!leaks && Math.abs(lap - fat.mobility) < 0.2) {
      kept = { i, k, lap, leaks };
      break;
    }
    if (!kept && !leaks) kept = { i, k, lap, leaks, firstSeal: true };
  }
}
console.log("nudge-keep-lap", kept);

const leaks = { types: {}, n: 0 };
const CORE = ["storage", "spawn", "terminal", "tower", "lab", "nuker", "observer", "extension", "link"];
for (const plan of plans) {
  const dd = byRoom.get(plan.room);
  const cut = new Set((plan.meta?.shell?.cut || []).map(K));
  const extCut = floodExterior(dd.terrain, cut);
  for (const t of CORE) {
    for (const q of plan.structures?.[t] || []) {
      if (extCut[q.x + q.y * 50]) {
        leaks.n++;
        leaks.types[t] = (leaks.types[t] || 0) + 1;
      }
    }
  }
}
console.log("leaksCut", leaks);

const e15 = plans.find((x) => x.room === "E15S4");
console.log("E15S4", {
  cut: (e15.meta.shell.cut || []).length,
  freeze: (e15.meta.shell.cutAtFreeze || []).length,
  drift: (e15.meta.shell.cutDrift || []).map((e) => `${e.op} ${K(e)} ${e.pass}`),
  baseCut: e15.meta.shell.baseCut,
});
