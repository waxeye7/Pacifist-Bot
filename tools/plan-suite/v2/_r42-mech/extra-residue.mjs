/**
 * r42 extra: takeTowerSwap joint residue + servedExts iff identity.
 * Never writes the artifact.
 */
import { loadPlans, loadRooms, makeChecker, D8 } from "./common.mjs";

const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);

const room = "E14S1";
const src = byPlan.get(room);
const sw0 = src?.meta?.composeOpts?.takeTowerSwap;
const towers = src?.structures?.tower || [];
const other = towers.find((t) => t.x !== sw0.to.x || t.y !== sw0.to.y);
let otherFrom = null;
if (other) {
  for (const [dx, dy] of D8) {
    const x = other.x + dx;
    const y = other.y + dy;
    if (x === sw0.from.x && y === sw0.from.y) continue;
    if (x < 1 || y < 1 || x > 48 || y > 48) continue;
    otherFrom = { x, y };
    break;
  }
}

const r1 = run("P19-take-to-other-tower-and-from-d8-of-new-to", room, (p) => {
  const sw = p.meta.composeOpts.takeTowerSwap;
  sw.to = { x: other.x, y: other.y };
  sw.from = { x: otherFrom.x, y: otherFrom.y };
});

const r2 = run("P19-take-to-other-and-from-d8-and-rewrite-twins", room, (p) => {
  const sw = p.meta.composeOpts.takeTowerSwap;
  sw.to = { x: other.x, y: other.y };
  sw.from = { x: otherFrom.x, y: otherFrom.y };
  const rec = { from: sw.from, to: sw.to };
  if (p.meta.towers?.acrossPriorTake?.taken) p.meta.towers.acrossPriorTake.taken = rec;
  if (p.meta.towers?.towerSwapTaken) p.meta.towers.towerSwapTaken = rec;
  if (p.meta.towers?.towerSwapOffer?.best) {
    p.meta.towers.towerSwapOffer.best.from = rec.from;
    p.meta.towers.towerSwapOffer.best.to = rec.to;
  }
  const sap = p.meta.towers?.adjacency?.satAcrossPrior;
  if (sap) {
    sap.leaves = rec.from;
    sap.seat = rec.to;
  }
});

const r3 = run("P19-servedExts-and-filler-both-plus-1-E11S1", "E11S1", (p) => {
  p.meta.walls.servedExts += 1;
  p.meta.walls.fillerTiles = (p.meta.walls.fillerTiles || 0) + 1;
  if (p.meta.walls.laidByKind) p.meta.walls.laidByKind.extFace = (p.meta.walls.laidByKind.extFace || 0) + 1;
});

console.log(JSON.stringify({
  orig: sw0,
  other,
  otherFrom,
  towers: towers.map((t) => `${t.x},${t.y}`),
  r1,
  r2,
  r3,
}, null, 2));
