/**
 * r29p15 follow: stubCap / maxHubDist / dig / park / haul. Throwaway.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fieldFrom } from "../layer-hub.mjs";
import { exteriorFlood, walkable, buildable } from "../shared.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.resolve(DIR, "../../out-v2/plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);
const rooms = JSON.parse(fs.readFileSync(process.env.ROOMS_FILE || path.resolve(DIR, "../_r28-mech/rooms.json"), "utf8"));
const byRoom = new Map(rooms.map((r) => [r.room, r]));
const idx = (x, y) => x + y * 50;
const K = (t) => `${t.x},${t.y}`;
const TARGET = 60;
const RICH_RATIO = 1.5;

function ter(d) {
  return d.terrain;
}

const T = (name) => ({ name, n: 0, match: 0, miss: 0, samples: [] });
function hit(t, ok, sample) {
  t.n++;
  if (ok) t.match++;
  else {
    t.miss++;
    if (t.samples.length < 6) t.samples.push(sample);
  }
}

const preOccTypes = ["spawn", "storage", "terminal", "tower", "lab", "nuker", "observer", "link", "container"];

const stub = {
  deepCut: T("stubCap===51 iff deepInsideCut/60>=1.5"),
  deepNoExt: T("stubCap===51 iff deepEmpty/60>=1.5"),
  deepBuild: T("stubCap===51 iff deepBuildableInterior/60>=1.5"),
};
const maxHub = {
  eqNoExt: T("maxHubDist === max fieldFrom without ext blocked"),
};
const park = T("parkCap values");
const hubCap = T("hubDistCap values");
const radii = T("radii values");
const haul = T("haulCost vs labs.haul");
const dig = {
  wallRoad: T("digRoads === roads on terrain wall"),
  rl6wall: T("digRoads === rl6 on wall"),
};
const parkHist = {};
const hubHist = {};
const poor = [];

for (const p of plans) {
  const d = byRoom.get(p.room);
  if (!d) continue;
  const terrain = ter(d);
  const e = p.meta?.extensions || {};
  const cut = p.meta?.shell?.cut || [];
  const cutSet = new Set(cut.map(K));
  const extFlood = exteriorFlood(terrain, cutSet);
  const depth = new Int16Array(2500).fill(999);
  const q = [];
  for (let i = 0; i < 2500; i++) if (extFlood[i]) { depth[i] = 0; q.push(i); }
  for (let qi = 0; qi < q.length; ) {
    const i = q[qi++];
    const x = i % 50, y = (i / 50) | 0;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = idx(nx, ny);
      if (depth[ni] <= depth[i] + 1) continue;
      if (extFlood[ni]) continue;
      depth[ni] = depth[i] + 1;
      q.push(ni);
    }
  }

  const occ = new Set();
  for (const t of preOccTypes) for (const s of p.structures?.[t] || []) occ.add(K(s));
  for (const src of p.sources || []) occ.add(K(src));
  if (p.controller) occ.add(K(p.controller));
  if (p.mineral) occ.add(K(p.mineral));

  let deepCut = 0, deepEmpty = 0, deepBuild = 0;
  for (let x = 2; x <= 47; x++) {
    for (let y = 2; y <= 47; y++) {
      if (depth[idx(x, y)] < 4) continue;
      if (extFlood[idx(x, y)]) continue;
      deepCut++;
      const k = `${x},${y}`;
      if (!occ.has(k)) deepEmpty++;
      if (buildable(terrain, x, y) && !occ.has(k)) deepBuild++;
    }
  }
  const want51a = deepCut / TARGET >= RICH_RATIO;
  const want51b = deepEmpty / TARGET >= RICH_RATIO;
  const want51c = deepBuild / TARGET >= RICH_RATIO;
  const is51 = e.stubCap === 51;
  hit(stub.deepCut, is51 === want51a, { room: p.room, stubCap: e.stubCap, deepCut, ratio: +(deepCut / 60).toFixed(2) });
  hit(stub.deepNoExt, is51 === want51b, { room: p.room, stubCap: e.stubCap, deepEmpty, ratio: +(deepEmpty / 60).toFixed(2) });
  hit(stub.deepBuild, is51 === want51c, { room: p.room, stubCap: e.stubCap, deepBuild, ratio: +(deepBuild / 60).toFixed(2) });
  if (e.stubCap === 43) poor.push({ room: p.room, deepCut, deepEmpty, deepBuild, stub: e.stubRoads });

  if (p.sitter) {
    const hf = fieldFrom(terrain, p.sitter, occ);
    let mxh = 0;
    for (const ex of p.structures?.extension || []) {
      const v = hf[idx(ex.x, ex.y)];
      if (Number.isFinite(v) && v < 900 && v > mxh) mxh = v;
    }
    hit(maxHub.eqNoExt, e.maxHubDist === mxh, { room: p.room, got: e.maxHubDist, mxh });
  }

  const pc = p.meta?.composeOpts?.parkCap ?? p.meta?.ctrlParkFloorCap;
  parkHist[String(pc)] = (parkHist[String(pc)] || 0) + 1;
  hubHist[String(e.hubDistCap)] = (hubHist[String(e.hubDistCap)] || 0) + 1;

  const rl = p.meta?.roadLayer || {};
  let wallRoad = 0, rl6wall = 0;
  for (const r of p.structures?.road || []) {
    const t = typeof terrain === "string" ? terrain.charCodeAt(r.y * 50 + r.x) & 0xff : terrain[r.y * 50 + r.x];
    if (t & 1) wallRoad++;
  }
  for (const [k, v] of Object.entries(rl)) {
    const [x, y] = k.split(",").map(Number);
    const t = typeof terrain === "string" ? terrain.charCodeAt(y * 50 + x) & 0xff : terrain[y * 50 + x];
    if (v === 6 && (t & 1)) rl6wall++;
  }
  hit(dig.wallRoad, e.digRoads === wallRoad, { room: p.room, dig: e.digRoads, wallRoad });
  hit(dig.rl6wall, e.digRoads === rl6wall, { room: p.room, dig: e.digRoads, rl6wall });
}

function line(t) {
  const flag = t.miss === 0 && t.n ? "MATCH" : t.n ? `MISS ${t.match}/${t.n}` : "SKIP";
  return `  ${flag.padEnd(18)} ${t.name}`;
}
console.log("stubCap");
for (const t of Object.values(stub)) console.log(line(t), JSON.stringify(t.samples[0] || ""));
console.log("poor", JSON.stringify(poor));
console.log("maxHub");
for (const t of Object.values(maxHub)) console.log(line(t), JSON.stringify(t.samples[0] || ""));
console.log("parkHist", parkHist, "hubHist", hubHist);
console.log("dig");
for (const t of Object.values(dig)) console.log(line(t), JSON.stringify(t.samples[0] || ""));
