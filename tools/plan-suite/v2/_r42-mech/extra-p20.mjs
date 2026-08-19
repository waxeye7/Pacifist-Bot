/**
 * r42 extra: p20 residue — is wasLap the per-candidate lap, or the freeze
 * walk copied onto every refusal? Is baseLap the same unread sibling?
 * Does rewriting freeze + the published walk still pass?
 * Never writes the artifact.
 */
import { loadPlans, loadRooms, makeChecker, K } from "./common.mjs";
import { exteriorFlood } from "../shared.mjs";
import { interiorWalk, maskFromKeys, mobilityStats, BUILT_OBSTACLES } from "../layer-shell.mjs";

const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);

function freezeCut(p) {
  const sh = p.meta?.shell || {};
  return Array.isArray(sh.cutAtFreeze) && sh.cutAtFreeze.length ? sh.cutAtFreeze : sh.cut || [];
}
function wantMob(terrain, p) {
  const cut = freezeCut(p);
  if (!cut.length || !p.sitter) return null;
  const cutSet = new Set(cut.map(K));
  const ext = exteriorFlood(terrain, cutSet);
  const blocked = new Set();
  for (const src of p.sources || []) blocked.add(K(src));
  if (p.controller) blocked.add(K(p.controller));
  if (p.mineral) blocked.add(K(p.mineral));
  if (p.sitter) blocked.add(K(p.sitter));
  for (const t of BUILT_OBSTACLES) {
    if (t === "extension") continue;
    for (const q of p.structures?.[t] || []) blocked.add(K(q));
  }
  for (const t of ["nuker", "observer"]) {
    for (const q of p.structures?.[t] || []) blocked.delete(K(q));
  }
  const walk = interiorWalk(terrain, cutSet, ext, blocked, p.sitter);
  return mobilityStats(cut, ext, maskFromKeys(walk));
}

let haveBog = 0, matchBog = 0, haveW = 0, matchW = 0, haveB = 0, matchB = 0;
const miss = [];
const sample = [];
const wasLapVsBaseLap = { same: 0, differ: 0, differSample: [] };
for (const p of plans) {
  const d = byRoom.get(p.room);
  if (!d) continue;
  const st = wantMob(d.terrain, p);
  const veto = p.meta?.misc?.mobilityVeto || {};
  if (typeof veto.baseOverGated === "number" && st) {
    haveBog++;
    if (veto.baseOverGated === st.overGated) matchBog++;
    else if (miss.length < 6) miss.push({ room: p.room, kind: "bog", got: veto.baseOverGated, want: st.overGated });
  }
  if (typeof veto.baseLap === "number" && st) {
    haveB++;
    if (Math.abs(st.maxGated - veto.baseLap) < 1e-9) matchB++;
    else if (miss.length < 8) miss.push({ room: p.room, kind: "baseLap", got: veto.baseLap, want: st.maxGated });
  }
  const refused = veto.refused || [];
  for (const r of refused) {
    if (typeof r.wasLap === "number" && st) {
      haveW++;
      if (Math.abs(st.maxGated - r.wasLap) < 1e-9) matchW++;
      else if (miss.length < 10) miss.push({ room: p.room, kind: "wasLap", got: r.wasLap, want: st.maxGated });
      if (typeof veto.baseLap === "number") {
        if (Math.abs(r.wasLap - veto.baseLap) < 1e-9) wasLapVsBaseLap.same++;
        else {
          wasLapVsBaseLap.differ++;
          if (wasLapVsBaseLap.differSample.length < 4) {
            wasLapVsBaseLap.differSample.push({ room: p.room, wasLap: r.wasLap, baseLap: veto.baseLap });
          }
        }
      }
    }
  }
  if (sample.length < 4 && (typeof veto.baseLap === "number" || refused.length)) {
    sample.push({
      room: p.room,
      baseLap: veto.baseLap,
      bog: veto.baseOverGated,
      wasLaps: refused.map((r) => r.wasLap),
      want: st && { maxGated: st.maxGated, overGated: st.overGated },
    });
  }
}

const room = "E11S2";
const rBog0 = run("P20-baseOverGated-zeroed-E11S2", room, (p) => {
  p.meta.misc.mobilityVeto.baseOverGated = 0;
});
const rWas0 = run("P20-wasLap-zeroed-first-room-with", plans.find((p) => (p.meta?.misc?.mobilityVeto?.refused || []).some((r) => r && typeof r.wasLap === "number" && r.wasLap !== 0))?.room || room, (p) => {
  for (const r of p.meta.misc.mobilityVeto.refused || []) {
    if (r && typeof r.wasLap === "number") r.wasLap = 0;
  }
});
const rBaseLap = run("P20-baseLap-zeroed-E11S2", room, (p) => {
  p.meta.misc.mobilityVeto.baseLap = 0;
});
const rBoth = run("P20-baseLap-and-wasLap-both-zeroed", room, (p) => {
  p.meta.misc.mobilityVeto.baseLap = 0;
  for (const r of p.meta.misc.mobilityVeto.refused || []) {
    if (r && typeof r.wasLap === "number") r.wasLap = 0;
  }
});
const rBogAndBase = run("P20-baseOverGated-and-baseLap-both-zeroed", room, (p) => {
  p.meta.misc.mobilityVeto.baseOverGated = 0;
  p.meta.misc.mobilityVeto.baseLap = 0;
});

console.log(JSON.stringify({
  haveBog, matchBog, haveW, matchW, haveB, matchB, miss, sample, wasLapVsBaseLap,
  rBog0, rWas0, rBaseLap, rBoth, rBogAndBase,
}, null, 2));
