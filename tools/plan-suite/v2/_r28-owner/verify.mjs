/**
 * Re-derive specific page/film sentences against the board. Independent flood.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.join(DIR, "../../out-v2/plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);
const rooms = JSON.parse(
  fs.readFileSync(
    process.env.ROOMS_FILE ||
      "C:/Users/stemm/AppData/Local/Temp/claude/C--Users-stemm-Documents-GitHub-screeps-Pacifist-Bot/925cd69a-24ce-4beb-9c86-6af0641f273a/scratchpad/rooms.json",
    "utf8",
  ),
);
const by = new Map(rooms.map((r) => [r.room, r]));
const D8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const K = (x, y) => `${x},${y}`;
const KT = (t) => K(t.x, t.y);
const WALL = 1;
const BUILT = new Set(["spawn", "extension", "tower", "lab", "link", "nuker", "observer", "storage", "terminal", "factory", "powerSpawn", "extractor"]);

function tileAt(terrain, x, y) {
  if (x < 0 || x > 49 || y < 0 || y > 49) return WALL;
  return parseInt(terrain.charAt(y * 50 + x), 10);
}
function walkable(terrain, x, y) {
  return x >= 0 && x <= 49 && y >= 0 && y <= 49 && (tileAt(terrain, x, y) & WALL) === 0;
}
function floodExt(terrain, block) {
  const e = new Uint8Array(2500);
  const q = [];
  const push = (x, y) => {
    if (!walkable(terrain, x, y) || block.has(K(x, y))) return;
    const i = x + y * 50;
    if (e[i]) return;
    e[i] = 1;
    q.push(i);
  };
  for (let i = 0; i < 50; i++) {
    push(i, 0);
    push(i, 49);
    push(0, i);
    push(49, i);
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % 50,
      y = (i / 50) | 0;
    for (const [dx, dy] of D8) push(x + dx, y + dy);
  }
  return e;
}
function depthFrom(ext) {
  const d = new Int16Array(2500).fill(999);
  const q = [];
  for (let i = 0; i < 2500; i++)
    if (ext[i]) {
      d[i] = 0;
      q.push(i);
    }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % 50,
      y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = nx + ny * 50;
      if (d[ni] <= d[i] + 1) continue;
      d[ni] = d[i] + 1;
      q.push(ni);
    }
  }
  return d;
}
function ownWalk(terrain, blocked, seed) {
  const seen = new Uint8Array(2500);
  const q = [];
  const i0 = seed.x + seed.y * 50;
  seen[i0] = 1;
  q.push(i0);
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % 50,
      y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (!walkable(terrain, nx, ny)) continue;
      const k = K(nx, ny);
      if (blocked.has(k) && !(nx === seed.x && ny === seed.y)) continue;
      const ni = nx + ny * 50;
      if (seen[ni]) continue;
      seen[ni] = 1;
      q.push(ni);
    }
  }
  return seen;
}

function blockedOf(plan) {
  const b = new Set();
  for (const t of BUILT) for (const p of plan.structures?.[t] || []) b.add(KT(p));
  for (const o of plan.objectTiles || []) {
    if (typeof o === "string") b.add(o);
    else if (o && Number.isInteger(o.x)) b.add(KT(o));
  }
  // room objects
  if (plan.controller) b.add(KT(plan.controller));
  if (plan.mineral) b.add(KT(plan.mineral));
  for (const s of plan.sources || []) b.add(KT(s));
  return b;
}

function checkRoomSentences(name) {
  const plan = plans.find((p) => p.room === name);
  const d = by.get(name);
  const terrain = d.terrain;
  const ramp = new Set((plan.structures?.rampart || []).map(KT));
  const roads = new Set((plan.structures?.road || []).map(KT));
  const cut = plan.meta?.shell?.cut || [];
  const cutSet = new Set(cut.map(KT));
  const sitter = plan.sitter || plan.hub;
  const extLive = floodExt(terrain, ramp);
  const depth = depthFrom(extLive);
  const blocked = blockedOf(plan);
  const walk = ownWalk(terrain, blocked, sitter);
  const occ = new Set();
  for (const t of Object.keys(plan.structures || {})) {
    if (t === "rampart" || t === "road") continue;
    for (const p of plan.structures[t] || []) occ.add(KT(p));
  }
  const sealed = [];
  for (let y = 0; y < 50; y++)
    for (let x = 0; x < 50; x++) {
      if (!walkable(terrain, x, y)) continue;
      const i = x + y * 50;
      if (extLive[i]) continue;
      const k = K(x, y);
      if (occ.has(k) || blocked.has(k)) continue;
      if (walk[i]) continue;
      sealed.push({ k, d: depth[i], deep: depth[i] >= 4 && x >= 2 && x <= 47 && y >= 2 && y <= 47 });
    }
  const redundant = [];
  const loadBearing = [];
  for (const t of cut) {
    const less = new Set(ramp);
    less.delete(KT(t));
    const e = floodExt(terrain, less);
    const leak = !!e[sitter.x + sitter.y * 50];
    if (leak) loadBearing.push(KT(t));
    else redundant.push(KT(t));
  }
  const paved = [];
  for (const r of plan.structures?.rampart || []) {
    const k = KT(r);
    if (!roads.has(k)) continue;
    let partner = false;
    for (const [dx, dy] of D8) {
      const nk = K(r.x + dx, r.y + dy);
      if (roads.has(nk) && ramp.has(nk)) partner = true;
    }
    if (partner) paved.push(k);
  }
  const rr = [];
  for (const r of plan.structures?.road || []) if (ramp.has(KT(r))) rr.push(KT(r));

  // spawn fan
  const hub = plan.sitter || plan.hub;
  const spawns = plan.structures?.spawn || [];
  const angs = spawns.map((s) => (Math.atan2(s.y - hub.y, s.x - hub.x) * 180) / Math.PI);
  const seps = [];
  for (let i = 0; i < angs.length; i++)
    for (let j = i + 1; j < angs.length; j++) {
      let a = Math.abs(angs[i] - angs[j]);
      if (a > 180) a = 360 - a;
      seps.push(Math.round(a));
    }

  // towers refill cheb (not walk) as a cheap check
  const towers = plan.structures?.tower || [];
  const twCheb = towers.map((t) => Math.max(Math.abs(t.x - hub.x), Math.abs(t.y - hub.y)));

  return {
    room: name,
    sealed,
    sealedN: sealed.length,
    sealedDeep: sealed.filter((s) => s.deep).length,
    pubSealed: plan.meta?.sealedFloor,
    redundant,
    loadBearingN: loadBearing.length,
    cutN: cut.length,
    paved,
    roadRamp: rr,
    spawnSeps: seps,
    spawnPos: spawns.map(KT),
    hub: KT(hub),
    twCheb,
    ext: (plan.structures?.extension || []).length,
  };
}

const sample = ["E15S8", "E21S7", "E3S4", "E2S7", "E1S4", "E12S1", "E15S4", "E11S1", "E12S7", "E12S6", "E7S5", "E9S2"];
const out = {};
for (const r of sample) out[r] = checkRoomSentences(r);

// E7S5 pair 27,19 / 29,18 on cut?
const e7 = plans.find((p) => p.room === "E7S5");
const e7cut = new Set((e7.meta?.shell?.cut || []).map(KT));

// extract film NOTES from pages
function filmNotes(room) {
  const html = fs.readFileSync(path.join(DIR, "../../out-v2", `${room}.html`), "utf8");
  const i = html.indexOf("const NOTES");
  if (i < 0) return { missing: true };
  const j = html.indexOf("};", i);
  const slice = html.slice(i, j + 2);
  try {
    return Function(slice + "; return NOTES;")();
  } catch (e) {
    return { parseFail: e.message, head: slice.slice(0, 180) };
  }
}

const notes = {};
for (const r of sample) {
  const n = filmNotes(r);
  notes[r] = n.parseFail || n.missing ? n : Object.fromEntries(Object.entries(n).map(([k, v]) => [k, String(v).slice(0, 280)]));
}

fs.writeFileSync(path.join(DIR, "verify-out.json"), JSON.stringify({ rooms: out, e7pair: { "27,19": e7cut.has("27,19"), "29,18": e7cut.has("29,18") }, notes }, null, 2));
console.log(
  JSON.stringify(
    {
      e7pair: { "27,19": e7cut.has("27,19"), "29,18": e7cut.has("29,18") },
      rooms: Object.fromEntries(
        sample.map((r) => [
          r,
          {
            sealed: out[r].sealed,
            pubTiles: out[r].pubSealed && out[r].pubSealed.tiles,
            pubNamed: out[r].pubSealed && out[r].pubSealed.named,
            red: out[r].redundant,
            cut: out[r].cutN,
            paved: out[r].paved,
            seps: out[r].spawnSeps,
            hub: out[r].hub,
            spawns: out[r].spawnPos,
          },
        ]),
      ),
    },
    null,
    2,
  ),
);
