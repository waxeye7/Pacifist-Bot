/**
 * r29p22: towers.baseLap is the layer-2 empty-room lap on the freeze cut
 * (hub kit only). Not the p21 walk (mass / nuker / observer lifted).
 * Throwaway. Never writes the artifact.
 */
import { loadPlans, loadRooms, makeChecker, K } from "./common.mjs";
import { enclosureMobility, interiorWalk, maskFromKeys, mobilityStats, BUILT_OBSTACLES } from "../layer-shell.mjs";
import { exteriorFlood } from "../shared.mjs";
import { renderDecl } from "../declprose.mjs";

const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);

function freezeCut(p) {
  const sh = p.meta?.shell || {};
  return Array.isArray(sh.cutAtFreeze) && sh.cutAtFreeze.length ? sh.cutAtFreeze : sh.cut || [];
}

function wantP21(terrain, p) {
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

let haveT = 0, matchT = 0;
let haveP21 = 0, matchP21 = 0;
let haveVeto = 0, matchVeto = 0;
let haveLabs = 0, matchLabs = 0;
const towersVsP21 = { same: 0, differ: 0, differSample: [] };
const miss = [];
const sample = [];
const hist = {};
for (const p of plans) {
  const d = byRoom.get(p.room);
  if (!d || !p.sitter) continue;
  const cut = freezeCut(p);
  const empty = enclosureMobility(d.terrain, p, cut);
  const p21 = wantP21(d.terrain, p);
  const gotT = p.meta?.towers?.mobilityVeto?.baseLap;
  const gotV = p.meta?.misc?.mobilityVeto?.baseLap;
  const gotL = p.meta?.labs?.lapVeto?.baseLap;
  if (typeof gotT === "number" && typeof empty === "number") {
    haveT++;
    hist[gotT] = (hist[gotT] || 0) + 1;
    if (Math.abs(gotT - empty) < 1e-9) matchT++;
    else if (miss.length < 8) miss.push({ room: p.room, kind: "towers-empty", got: gotT, want: empty });
  }
  if (typeof gotT === "number" && p21) {
    haveP21++;
    if (Math.abs(gotT - p21.maxGated) < 1e-9) {
      matchP21++;
      towersVsP21.same++;
    } else {
      towersVsP21.differ++;
      if (towersVsP21.differSample.length < 6) {
        towersVsP21.differSample.push({
          room: p.room,
          towers: gotT,
          p21: p21.maxGated,
          empty,
        });
      }
    }
  }
  if (typeof gotV === "number" && p21) {
    haveVeto++;
    if (Math.abs(gotV - p21.maxGated) < 1e-9) matchVeto++;
    else if (miss.length < 10) miss.push({ room: p.room, kind: "veto-p21", got: gotV, want: p21.maxGated });
  }
  if (typeof gotL === "number" && p21) {
    haveLabs++;
    if (Math.abs(gotL - p21.maxGated) < 1e-9) matchLabs++;
  }
  if (sample.length < 5 && (p.room === "E11S7" || p.room === "E11S2" || typeof gotT === "number")) {
    if (p.room === "E11S7" || p.room === "E11S2" || sample.length < 3) {
      sample.push({
        room: p.room,
        towers: gotT,
        veto: gotV,
        labs: gotL,
        empty,
        p21: p21 && p21.maxGated,
      });
    }
  }
}

function walkRepair(p, val) {
  for (const sf of p.meta.shortfalls || []) {
    if (sf?.repair?.tower && typeof sf.repair.tower.baseLap === "number") {
      sf.repair.tower.baseLap = val;
      try { sf.detail = renderDecl(sf); } catch { /* leave */ }
    }
  }
}

const attacks = [];
function rec(r) {
  attacks.push(r);
  console.error(String(r.status).padEnd(8), r.name, r.room, String(r.detail || "").slice(0, 220));
}
rec(run("P22-towers-baseLap-zeroed-E11S7", "E11S7", (p) => {
  p.meta.towers.mobilityVeto.baseLap = 0;
}));
rec(run("P22-towers-baseLap-plus-1-E11S7", "E11S7", (p) => {
  p.meta.towers.mobilityVeto.baseLap += 1;
}));
rec(run("P22-towers-baseLap-set-to-p21-7.67-E11S7", "E11S7", (p) => {
  p.meta.towers.mobilityVeto.baseLap = p.meta.misc.mobilityVeto.baseLap;
}));
rec(run("P22-towers-baseLap-0-and-twin-regen-E11S7", "E11S7", (p) => {
  p.meta.towers.mobilityVeto.baseLap = 0;
  walkRepair(p, 0);
}));
rec(run("P22-towers-baseLap-0-and-twin-regen-E11S2", "E11S2", (p) => {
  p.meta.towers.mobilityVeto.baseLap = 0;
  walkRepair(p, 0);
}));
rec(run("P21-veto-baseLap-zeroed-E11S2", "E11S2", (p) => {
  p.meta.misc.mobilityVeto.baseLap = 0;
}));
rec(run("P21-labs-baseLap-zeroed-E11S2", "E11S2", (p) => {
  p.meta.labs.lapVeto.baseLap = 0;
}));

const e11s7 = byPlan.get("E11S7");
const d7 = byRoom.get("E11S7");
const empty7 = e11s7 && d7 ? enclosureMobility(d7.terrain, e11s7, freezeCut(e11s7)) : null;
const p217 = e11s7 && d7 ? wantP21(d7.terrain, e11s7) : null;

console.log(JSON.stringify({
  haveT, matchT, haveP21, matchP21, haveVeto, matchVeto, haveLabs, matchLabs,
  towersVsP21, miss, sample, hist,
  e11s7: {
    towers: e11s7?.meta?.towers?.mobilityVeto?.baseLap,
    veto: e11s7?.meta?.misc?.mobilityVeto?.baseLap,
    labs: e11s7?.meta?.labs?.lapVeto?.baseLap,
    empty: empty7,
    p21: p217 && p217.maxGated,
  },
  attacks: attacks.map((r) => ({
    name: r.name,
    room: r.room,
    status: r.status,
    detail: String(r.detail || "").slice(0, 240),
  })),
}, null, 2));
