/**
 * 88 keep-lap sealing nudge through checkRoom. 98 extra D8 on dropped room.
 */
import { enclosureMobility } from "../layer-shell.mjs";
import { renderDecl } from "../declprose.mjs";
import { bothLanes, loadPlans, loadRooms, makeChecker, K } from "./common.mjs";

const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);

function applyBonus(p, bonus, fn) {
  const esc = p.meta.shellEscalation;
  const sf = (p.meta.shortfalls || []).find((s) => s && s.ladder);
  if (esc && Array.isArray(esc.rungs)) {
    for (const row of esc.rungs) if (row && row.needDeepBonus === bonus) fn(row);
  }
  if (sf) {
    for (const row of sf.ladder.rungs) if (row && row.needDeepBonus === bonus) fn(row);
    try { sf.detail = renderDecl(sf); } catch { /* leave */ }
  }
}

const p0 = byPlan.get("E11S2");
const fat = (p0.meta.shellEscalation.rungs || []).find((r) => r.needDeepBonus === 85);
const fake = fat.cutTiles.map((q, j) => (j === 19 ? { x: 28, y: 34 } : { x: q.x, y: q.y }));
const lap = enclosureMobility(byRoom.get("E11S2").terrain, p0, fake);
console.log("keep-lap fake", { from: K(fat.cutTiles[19]), to: "28,34", lap, orig: fat.mobility, n: fake.length });

const r1 = await run("88 sealing same-lap one-tile nudge keep-ramparts", "E11S2", (p) => {
  applyBonus(p, 85, (r) => {
    r.cutTiles = fake.map((t) => ({ x: t.x, y: t.y }));
    r.mobility = lap;
  });
});
console.log(r1.status, r1.name, r1.first);

const r2 = await run("98 D8 extra reserved on dropped E12S5", "E12S5", (p) => {
  const d = byRoom.get("E12S5");
  const reserved = (p.meta.extensions.laneMeta.fullRun.reserved || []).map(String);
  const used = new Set(reserved);
  let extra = null;
  for (const k of reserved) {
    const [x, y] = k.split(",").map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) {
      const nk = `${x + dx},${y + dy}`;
      if (used.has(nk)) continue;
      extra = nk;
      break;
    }
    if (extra) break;
  }
  bothLanes(p, (L) => {
    L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
    L.fullRun.tiles = L.fullRun.reserved.length;
    L.fullRun.byRound = L.fullRun.byRound.map((r) => r.slice());
    L.fullRun.byRound.push([extra]);
    L.fullRun.rounds = L.fullRun.byRound.length;
  });
});
console.log(r2.status, r2.name, r2.first);

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const DIR = path.dirname(fileURLToPath(import.meta.url));
fs.writeFileSync(path.join(DIR, "followup2-out.json"), JSON.stringify({ r1, r2 }, null, 2));
