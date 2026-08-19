import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom } from "../validate.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.join(DIR, "../../out-v2/plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);
const rooms = JSON.parse(fs.readFileSync(path.join(DIR, "../_r28-mech/rooms.json"), "utf8"));
const by = new Map(rooms.map((r) => [r.room, r]));

function clone(room) {
  return JSON.parse(JSON.stringify(plans.find((p) => p.room === room)));
}
function tryCase(name, room, mutate) {
  const d = by.get(room);
  const p = clone(room);
  mutate(p);
  const res = checkRoom(p, d.terrain, d.objects, null);
  const real = (res.fails || []).filter(
    (f) => !/fleetMediansMeasured|eco\.ctrlMedian|eco\.srcMedian|eco\.ctrlGate|eco\.srcGate/.test(f),
  );
  console.log(real.length ? "BITES" : "ESCAPE", name, room, real[0] ? real[0].slice(0, 220) : "");
  return { name, room, status: real.length ? "BITES" : "ESCAPE", first: real[0] && real[0].slice(0, 240) };
}

const taken = [];
for (const p of plans) {
  const R = p.meta?.sealedRecovery;
  if (!R) continue;
  const hs = R.fixedHolders || [];
  if (R.taken || hs.length) {
    taken.push({
      room: p.room,
      taken: R.taken,
      nHold: hs.length,
      kinds: [...new Set(hs.map((h) => h.type))],
      recovers: hs.slice(0, 4).map((h) => ({ t: h.type, k: `${h.x},${h.y}`, r: h.recovers, d: h.recoversDeep })),
      cap: (R.pockets || []).reduce((n, pk) => n + (pk.tiles || 0), 0),
    });
  }
}
console.log("takenRooms", taken.length, JSON.stringify(taken.slice(0, 8), null, 2));

const attacks = [];
const t = taken.find((x) => x.nHold && x.cap > 1 && x.recovers.some((h) => h.r !== x.cap));
if (t) {
  attacks.push(
    tryCase("93 recovers := cap on real taken room, fixedHolders only", t.room, (p) => {
      const rec = p.meta.sealedRecovery;
      const c = (rec.pockets || []).reduce((n, pk) => n + (pk.tiles || 0), 0);
      for (const h of rec.fixedHolders || []) {
        h.recovers = c;
        if (typeof h.recoversDeep === "number") h.recoversDeep = Math.min(h.recoversDeep, c);
      }
    }),
  );
}

const e9 = plans.find((p) => p.room === "E9S9");
const n = (e9.meta.noteRecords || []).find((x) => x.cls === "shallowExt");
console.log("E9S9 shallow rec", JSON.stringify(n && n.rec, null, 2)?.slice(0, 800));
console.log("E9S9 shallow detail", String(n && (n.detail || n.rec?.detail || "")).slice(0, 500));

const e11 = plans.find((p) => p.room === "E11S1");
const n11 = (e11.meta.noteRecords || []).find((x) => x.cls === "shallowExt");
console.log("E11S1 shallow rec keys", n11 && n11.rec && Object.keys(n11.rec));
console.log("E11S1 shallow detail", String(n11 && (n11.detail || n11.rec?.detail || "")).slice(0, 400));

const e15 = plans.find((p) => p.room === "E15S4");
const hub = e15.hub || e15.sitter;
const st = (e15.structures.storage || [])[0];
const around = st || hub;
const spawns = e15.structures.spawn || [];
const angs = spawns.map((s) => (Math.atan2(s.y - around.y, s.x - around.x) * 180) / Math.PI);
const seps = [];
for (let i = 0; i < angs.length; i++)
  for (let j = i + 1; j < angs.length; j++) {
    let a = Math.abs(angs[i] - angs[j]);
    if (a > 180) a = 360 - a;
    seps.push(a);
  }
console.log("E15S4 fan", { around, hub: e15.hub, sitter: e15.sitter, spawns: spawns.map((s) => `${s.x},${s.y}`), seps, min: Math.min(...seps) });

const e2s6 = plans.find((p) => p.room === "E2S6");
const drift = e2s6.meta.shell.cutDrift || [];
console.log("E2S6 drift", drift.map((e) => `${e.op} ${e.x},${e.y} ${e.pass}`));
console.log("E2S6 cutN", (e2s6.meta.shell.cut || []).length, "freeze", (e2s6.meta.shell.cutAtFreeze || []).length);

function leak(name) {
  const p = plans.find((x) => x.room === name);
  const d = by.get(name);
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
  const cut = new Set((p.meta.shell.cut || []).map((t) => K(t.x, t.y)));
  const freeze = new Set((p.meta.shell.cutAtFreeze || []).map((t) => K(t.x, t.y)));
  const ramp = new Set((p.structures.rampart || []).map((t) => K(t.x, t.y)));
  const s = p.sitter;
  const si = s.x + s.y * 50;
  console.log(name, {
    sitterCut: !!flood(cut)[si],
    sitterFreeze: !!flood(freeze)[si],
    sitterLive: !!flood(ramp)[si],
    cutN: cut.size,
    freezeN: freeze.size,
    rem: (p.meta.shell.cutDrift || []).filter((e) => e.op === "remove").map((e) => `${e.x},${e.y}`),
    add: (p.meta.shell.cutDrift || []).filter((e) => e.op === "add").map((e) => `${e.x},${e.y}`),
  });
}
leak("E15S1");
leak("E5S6");

fs.writeFileSync(path.join(DIR, "last-out.json"), JSON.stringify({ taken: taken.slice(0, 12), attacks }, null, 2));
