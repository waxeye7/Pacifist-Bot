import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.join(DIR, "../../out-v2/plans-hub.json"), "utf8"));
const rooms = JSON.parse(fs.readFileSync(path.join(DIR, "../_r28-mech/rooms.json"), "utf8"));
const p = plans.find((x) => x.room === "E15S4");
const d = rooms.find((x) => x.room === "E15S4");
const D8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const K = (x, y) => `${x},${y}`;
const terrain = d.terrain;
const walkable = (x, y) => x >= 0 && x <= 49 && y >= 0 && y <= 49 && (parseInt(terrain.charAt(y * 50 + x), 10) & 1) === 0;
function flood(block) {
  const e = new Uint8Array(2500);
  const q = [];
  const push = (x, y) => {
    if (!walkable(x, y) || block.has(K(x, y))) return;
    const i = x + y * 50;
    if (e[i]) return;
    e[i] = 1;
    q.push(i);
  };
  for (let i = 0; i < 50; i++) {
    push(i, 0); push(i, 49); push(0, i); push(49, i);
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % 50, y = (i / 50) | 0;
    for (const [dx, dy] of D8) push(x + dx, y + dy);
  }
  return e;
}
function depth(ext) {
  const dpt = new Int16Array(2500).fill(999);
  const q = [];
  for (let i = 0; i < 2500; i++) if (ext[i]) { dpt[i] = 0; q.push(i); }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % 50, y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = nx + ny * 50;
      if (dpt[ni] <= dpt[i] + 1) continue;
      dpt[ni] = dpt[i] + 1;
      q.push(ni);
    }
  }
  return dpt;
}
const ramp = new Set((p.structures.rampart || []).map((t) => K(t.x, t.y)));
const freeze = new Set((p.meta.shell.cutAtFreeze || []).map((t) => K(t.x, t.y)));
const live = flood(ramp);
const fr = flood(freeze);
const dl = depth(live);
const df = depth(fr);
const seat = { x: 23, y: 6 };
const i = seat.x + seat.y * 50;
const onSeat = {};
for (const t of Object.keys(p.structures)) {
  for (const q of p.structures[t]) if (q.x === 23 && q.y === 6) onSeat[t] = true;
}
console.log({
  onSeat,
  rampOnSeat: ramp.has("23,6"),
  liveExt: !!live[i],
  freezeExt: !!fr[i],
  depthLive: dl[i],
  depthFreeze: df[i],
  mineralBubble: p.meta.misc.mineralBubble,
});
