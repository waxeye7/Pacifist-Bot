/**
 * r45 / 88 named-nudge mutation + baseline on discarded-rung rooms.
 * Does not write the artifact.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { performance } from "perf_hooks";
import { checkRoom } from "./validate.mjs";
import { enclosureMobility } from "./layer-shell.mjs";
import { renderDecl } from "./declprose.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.join(DIR, "../out-v2/plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);
const rooms = JSON.parse(fs.readFileSync(path.join(DIR, "_r28-mech/rooms.json"), "utf8"));
const byRoom = new Map(rooms.map((r) => [r.room, r]));
const FLEET_RE = /fleetMediansMeasured|eco\.ctrlMedian|eco\.srcMedian|eco\.ctrlGate|eco\.srcGate/;
const real = (res) => (res.fails || []).filter((f) => !FLEET_RE.test(f));

function clone(p) {
  return JSON.parse(JSON.stringify(p));
}
function lastFat(plan) {
  const shipped = (plan.structures?.rampart || []).length;
  const esc = plan.meta?.shellEscalation;
  const fromEsc = (esc?.rungs || []).filter((r) => r && r.ramparts > shipped && Array.isArray(r.cutTiles));
  if (fromEsc.length) return fromEsc[fromEsc.length - 1];
  const sf = (plan.meta?.shortfalls || []).find((s) => s && s.ladder);
  const fromSf = (sf?.ladder?.rungs || []).filter((r) => r && r.ramparts > shipped && Array.isArray(r.cutTiles));
  return fromSf[fromSf.length - 1] || null;
}
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

const src = plans.find((p) => p.room === "E11S2");
const d = byRoom.get("E11S2");
const t0 = performance.now();
const base = real(checkRoom(src, d.terrain, d.objects));
console.log("BASE E11S2", base.length ? "FAIL" : "PASS", `${(performance.now() - t0).toFixed(0)}ms`, base[0] || "");

const fat = lastFat(src);
const pN = clone(src);
const next = fat.cutTiles.map((t) => (t.x === 29 && t.y === 33 ? { x: 28, y: 34 } : { x: t.x, y: t.y }));
const lap = enclosureMobility(d.terrain, pN, next);
applyBonus(pN, fat.needDeepBonus, (r) => {
  r.cutTiles = next.map((t) => ({ x: t.x, y: t.y }));
  r.mobility = lap;
});
const t1 = performance.now();
const nFails = real(checkRoom(pN, d.terrain, d.objects));
console.log(
  "NUDGE 29,33→28,34",
  nFails.length ? "BITES" : "ESCAPE",
  `${(performance.now() - t1).toFixed(0)}ms`,
  nFails[0] || "",
  "| n",
  nFails.length,
);

const pL = clone(src);
applyBonus(pL, fat.needDeepBonus, (r) => {
  r.cutTiles = r.cutTiles.map((t) => (t.x === 20 && t.y === 9 ? { x: 19, y: 9 } : { x: t.x, y: t.y }));
  r.complete = false;
});
const leakFails = real(checkRoom(pL, d.terrain, d.objects));
console.log("LEAKY+complete=false", leakFails.length ? "BITES" : "ESCAPE", leakFails[0] || "");

const pC = clone(src);
applyBonus(pC, fat.needDeepBonus, (r) => { r.complete = false; });
const cFails = real(checkRoom(pC, d.terrain, d.objects));
console.log("complete=false alone", cFails.length ? "BITES" : "ESCAPE", cFails[0] || "");

let pass = 0;
let fail = 0;
const tF = performance.now();
for (const p of plans) {
  const shipped = (p.structures?.rampart || []).length;
  const esc = p.meta?.shellEscalation;
  const picked = esc && typeof esc.pickedNeedDeepBonus === "number" ? esc.pickedNeedDeepBonus : null;
  const rows = [...(esc?.rungs || []), ...((p.meta?.shortfalls || []).find((s) => s && s.ladder)?.ladder?.rungs || [])];
  const hasDisc = rows.some((r) => r && Array.isArray(r.cutTiles) && r.cutTiles.length && (
    picked !== null ? r.needDeepBonus !== picked : typeof r.ramparts === "number" && r.ramparts !== shipped
  ));
  if (!hasDisc) continue;
  const rd = byRoom.get(p.room);
  const fails = real(checkRoom(p, rd.terrain, rd.objects));
  if (fails.length) {
    fail++;
    console.log("FLEET FAIL", p.room, fails[0]);
  } else pass++;
}
console.log("FLEET discarded-rung rooms", `pass ${pass} fail ${fail}`, `${(performance.now() - tF).toFixed(0)}ms`);
