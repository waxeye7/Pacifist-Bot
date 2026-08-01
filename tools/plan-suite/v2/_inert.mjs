/**
 * SCRATCH AUDIT — not part of the suite. The reviewer's deletion test, run over
 * the FINISHED plan: which rampart tiles can be deleted while every tile the
 * base can walk, every structure it owns and every depth stays exactly what it
 * was (seal + depths + interior), and how many of those additionally cause zero
 * checkRoom failures.
 */
import fs from "fs";
import path from "path";
import { OUT_V2, fetchRoomsFromMongo, key, walkable, D8 } from "./shared.mjs";
import { interiorWalk, BUILT_OBSTACLES } from "./layer-shell.mjs";
import { checkRoom } from "./validate.mjs";

const idx = (x, y) => x + y * 50;

function exteriorFlood(terrain, cutSet) {
  const ext = new Uint8Array(2500);
  const q = [];
  for (let i = 0; i < 50; i++) {
    for (const [x, y] of [[i, 0], [i, 49], [0, i], [49, i]]) {
      if (!walkable(terrain, x, y) || cutSet.has(key(x, y))) continue;
      const ii = idx(x, y);
      if (!ext[ii]) { ext[ii] = 1; q.push(ii); }
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], x = i % 50, y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      if (!walkable(terrain, nx, ny) || cutSet.has(key(nx, ny))) continue;
      const ni = nx + ny * 50;
      if (ext[ni]) continue;
      ext[ni] = 1; q.push(ni);
    }
  }
  return ext;
}
function depthFromExterior(ext) {
  const depth = new Int16Array(2500).fill(999);
  const q = [];
  for (let i = 0; i < 2500; i++) if (ext[i]) { depth[i] = 0; q.push(i); }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], x = i % 50, y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = nx + ny * 50;
      if (depth[ni] <= depth[i] + 1) continue;
      depth[ni] = depth[i] + 1; q.push(ni);
    }
  }
  return depth;
}

const plans = JSON.parse(fs.readFileSync(path.join(OUT_V2, "plans-hub.json"), "utf8")).filter((p) => p && p.room && !p.error);
const only = process.argv[2] ? process.argv[2].split(",") : null;
const list = only ? plans.filter((p) => only.includes(p.room)) : plans;
const data = fetchRoomsFromMongo(list.map((p) => p.room));
const byRoom = new Map(data.map((d) => [d.room, d]));

let strict = 0, soft = 0;
const rows = [];
for (const p of list) {
  const d = byRoom.get(p.room);
  if (!d) continue;
  const terrain = d.terrain;
  const objTiles = new Set(
    (d.objects || []).filter((o) => ["source", "controller", "mineral"].includes(o.type)).map((o) => key(o.x, o.y)),
  );
  const blocked = new Set(objTiles);
  for (const t of BUILT_OBSTACLES) for (const q of p.structures[t] || []) blocked.add(key(q.x, q.y));
  const own = [];
  for (const t of Object.keys(p.structures)) {
    if (t === "rampart" || t === "road") continue;
    for (const q of p.structures[t] || []) own.push(key(q.x, q.y));
  }
  const base = checkRoom(p, terrain, d.objects);
  const baseFails = base.fails.length;

  let cur = (p.structures.rampart || []).slice();
  const inertStrict = [], inertSoft = [];
  let changed = true;
  while (changed) {
    changed = false;
    const set0 = new Set(cur.map((r) => key(r.x, r.y)));
    const ext0 = exteriorFlood(terrain, set0);
    const dep0 = depthFromExterior(ext0);
    const walk0 = interiorWalk(terrain, set0, ext0, blocked, p.sitter);
    const hold = new Set([...walk0, ...own]);
    for (let i = 0; i < cur.length; i++) {
      const k = key(cur[i].x, cur[i].y);
      const set1 = new Set(set0); set1.delete(k);
      const ext1 = exteriorFlood(terrain, set1);
      const dep1 = depthFromExterior(ext1);
      let ok = true;
      for (const h of hold) {
        const [x, y] = h.split(",").map(Number);
        const ii = idx(x, y);
        if (ext1[ii] !== ext0[ii] || dep1[ii] !== dep0[ii]) { ok = false; break; }
      }
      if (ok) {
        const walk1 = interiorWalk(terrain, set1, ext1, blocked, p.sitter);
        if (walk1.size !== walk0.size) ok = false;
      }
      if (!ok) continue;
      const trial = { ...p, structures: { ...p.structures, rampart: cur.filter((_, j) => j !== i) } };
      if (checkRoom(trial, terrain, d.objects).fails.length > baseFails) continue;
      inertStrict.push(cur[i]);
      inertSoft.push(cur[i]);
      cur = trial.structures.rampart;
      changed = true;
      break;
    }
  }
  if (inertStrict.length) {
    strict += inertStrict.length;
    soft += inertSoft.length;
    rows.push(`${p.room}: strict ${inertStrict.length} (${inertStrict.map((t) => `${t.x},${t.y}`).join(" ")})`);
  }
}
console.log(
  `INERT RAMPARTS — strict (seal+depths+interior): ${strict} tiles in ${rows.length} rooms; ` +
    `of those ${soft} also cause 0 new checkRoom fails`,
);
console.log(rows.join("\n"));
