import { enclosureMobility } from "../layer-shell.mjs";
import { loadPlans, loadRooms, K } from "./common.mjs";
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const p = plans.find((x) => x.room === "E11S2");
const d = byRoom.get("E11S2");
const shipped = (p.structures.rampart || []).length;
const shippedCut = p.meta.shell.cut;
const freeze = p.meta.shell.cutAtFreeze;
console.log({
  shipped,
  cut: shippedCut.length,
  freeze: freeze.length,
  picked: p.meta.shellEscalation?.pickedNeedDeepBonus,
  shippedLap: enclosureMobility(d.terrain, p, shippedCut),
  freezeLap: enclosureMobility(d.terrain, p, freeze),
  rungs: (p.meta.shellEscalation?.rungs || []).map((r) => ({
    b: r.needDeepBonus,
    mob: r.mobility,
    ramp: r.ramparts,
    cutN: (r.cutTiles || []).length,
    walk: enclosureMobility(d.terrain, p, r.cutTiles || []),
  })),
});
const sitter = p.sitter;
const fake = [];
for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]]) {
  fake.push({ x: sitter.x + dx, y: sitter.y + dy });
}
console.log("box", { sitter, lap: enclosureMobility(d.terrain, p, fake), tiles: fake.map(K) });
