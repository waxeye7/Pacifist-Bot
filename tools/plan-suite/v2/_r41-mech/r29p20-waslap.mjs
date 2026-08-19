/**
 * r29p20: does the baseOverGated walk's maxGated bind wasLap / baseLap?
 */
import { loadPlans, loadRooms, K } from "./common.mjs";
import { exteriorFlood } from "../shared.mjs";
import { interiorWalk, maskFromKeys, mobilityStats, BUILT_OBSTACLES } from "../layer-shell.mjs";

const { plans } = loadPlans();
const { byRoom } = loadRooms();

function freezeCut(p) {
  const sh = p.meta?.shell || {};
  return Array.isArray(sh.cutAtFreeze) && sh.cutAtFreeze.length ? sh.cutAtFreeze : sh.cut || [];
}
function objectTiles(p) {
  const s = new Set();
  for (const src of p.sources || []) s.add(K(src));
  if (p.controller) s.add(K(p.controller));
  if (p.mineral) s.add(K(p.mineral));
  return s;
}
function walkStats(terrain, p) {
  const cut = freezeCut(p);
  if (!cut.length || !p.sitter) return null;
  const cutSet = new Set(cut.map(K));
  const ext = exteriorFlood(terrain, cutSet);
  const blocked = new Set(objectTiles(p));
  if (p.sitter) blocked.add(K(p.sitter));
  const skip = new Set(["extension", "nuker", "observer"]);
  for (const t of BUILT_OBSTACLES) {
    if (skip.has(t)) continue;
    for (const q of p.structures?.[t] || []) blocked.add(K(q));
  }
  const walk = interiorWalk(terrain, cutSet, ext, blocked, p.sitter);
  return mobilityStats(cut, ext, maskFromKeys(walk));
}

let haveW = 0, matchW = 0, haveB = 0, matchB = 0;
const miss = [];
const sample = [];
for (const p of plans) {
  const d = byRoom.get(p.room);
  if (!d) continue;
  const st = walkStats(d.terrain, p);
  const veto = p.meta?.misc?.mobilityVeto || {};
  if (typeof veto.baseLap === "number" && st) {
    haveB++;
    if (Math.abs(st.maxGated - veto.baseLap) < 1e-9) matchB++;
    else if (miss.length < 5) miss.push({ room: p.room, kind: "baseLap", got: veto.baseLap, want: st.maxGated });
  }
  const refused = veto.refused || [];
  for (const r of refused) {
    if (typeof r.wasLap === "number" && st) {
      haveW++;
      if (Math.abs(st.maxGated - r.wasLap) < 1e-9) matchW++;
      else if (miss.length < 8) miss.push({ room: p.room, kind: "wasLap", got: r.wasLap, want: st.maxGated });
    }
  }
  if (sample.length < 4 && (typeof veto.baseLap === "number" || refused.length)) {
    sample.push({ room: p.room, baseLap: veto.baseLap, wasLaps: refused.map((r) => r.wasLap), maxGated: st?.maxGated, overGated: st?.overGated, bog: veto.baseOverGated });
  }
}
console.log(JSON.stringify({ haveW, matchW, haveB, matchB, miss, sample }, null, 2));
