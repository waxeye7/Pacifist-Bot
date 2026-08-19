/**
 * r40 extra: takeTowerSwap joint residue (to + from stay D8). Never writes the artifact.
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

const r = run("P18-take-to-other-tower-and-from-d8-of-new-to", room, (p) => {
  const sw = p.meta.composeOpts.takeTowerSwap;
  sw.to = { x: other.x, y: other.y };
  sw.from = { x: otherFrom.x, y: otherFrom.y };
});
console.log(JSON.stringify({
  orig: sw0,
  other,
  otherFrom,
  towers: towers.map((t) => `${t.x},${t.y}`),
  result: r,
}, null, 2));
