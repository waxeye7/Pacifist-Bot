/**
 * Named r29p10 close + leftover. checkRoom on clones only.
 */
import { checkRoom } from "../validate.mjs";
import { enclosureMobility } from "../layer-shell.mjs";
import { exteriorFlood, key } from "../shared.mjs";
import { loadPlans, loadRooms, realFails } from "./common.mjs";

const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byName = new Map(plans.map((p) => [p.room, p]));
const clone = (r) => JSON.parse(JSON.stringify(byName.get(r)));

const e11 = clone("E11S1");
const d11 = byRoom.get("E11S1");
const clean = checkRoom(e11, d11.terrain, d11.objects, null);
const cleanReal = realFails(clean);
console.log("E11S1 unmodified", cleanReal.length ? "FAIL " + cleanReal[0] : "PASS", "rawFails", clean.fails.length);
const L0 = e11.meta.extensions.laneMeta;
console.log("E11S1 shrink", {
  wanted: L0.shrunk?.wanted,
  tiles: L0.fullRun?.tiles,
  reserved: L0.fullRun?.reserved,
  lane: L0.reserved,
  byRound: L0.fullRun?.byRound,
  to: L0.fullRun?.to,
  used: L0.fullRun?.used,
  ext: L0.fullRun?.ext,
  shallow: L0.fullRun?.shallow,
});

const p98 = clone("E11S1");
const extra = "19,27";
const stamp = (L) => {
  L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
  const last = L.fullRun.byRound[L.fullRun.byRound.length - 1];
  L.fullRun.byRound = [...L.fullRun.byRound.slice(0, -1).map((r) => r.slice()), [...last.map(String), extra]];
  L.fullRun.tiles = L.fullRun.reserved.length;
  L.shrunk.wanted = L.fullRun.tiles;
};
stamp(p98.meta.extensions.laneMeta);
if (p98.meta.walls?.mobility?.lanes) stamp(p98.meta.walls.mobility.lanes);
const r98 = checkRoom(p98, d11.terrain, d11.objects, null);
const r98r = realFails(r98);
console.log("E11S1 +19,27", r98r.length ? "BITES" : "ESCAPE", r98r[0] || "");

const pWant = clone("E11S1");
pWant.meta.extensions.laneMeta.shrunk.wanted += 1;
if (pWant.meta.walls?.mobility?.lanes?.shrunk) pWant.meta.walls.mobility.lanes.shrunk.wanted += 1;
const rWant = checkRoom(pWant, d11.terrain, d11.objects, null);
const rWantr = realFails(rWant);
console.log("E11S1 wanted += 1", rWantr.length ? "BITES" : "ESCAPE", rWantr[0] || "");

const e12 = clone("E11S2");
const d12 = byRoom.get("E11S2");
const last = e12.meta.shortfalls.find((s) => s.ladder).ladder.rungs.at(-1);
const has209 = last.cutTiles.some((t) => t.x === 20 && t.y === 9);
const leaky = last.cutTiles.map((t) => (t.x === 20 && t.y === 9 ? { x: 19, y: 9 } : { x: t.x, y: t.y }));
const leakLap = enclosureMobility(d12.terrain, e12, leaky);
const leakExt = exteriorFlood(d12.terrain, new Set(leaky.map((t) => key(t.x, t.y))));
const leakSit = !!leakExt[e12.sitter.x + e12.sitter.y * 50];
const apply = (p, cuts, lap, extraFn) => {
  const bonus = p.meta.shortfalls.find((s) => s.ladder).ladder.rungs.at(-1).needDeepBonus;
  for (const row of p.meta.shortfalls.find((s) => s.ladder).ladder.rungs) {
    if (row.needDeepBonus === bonus) {
      row.cutTiles = cuts.map((t) => ({ x: t.x, y: t.y }));
      row.mobility = lap;
      if (extraFn) extraFn(row);
    }
  }
  if (p.meta.shellEscalation?.rungs) {
    for (const row of p.meta.shellEscalation.rungs) {
      if (row.needDeepBonus === bonus) {
        row.cutTiles = cuts.map((t) => ({ x: t.x, y: t.y }));
        row.mobility = lap;
        if (extraFn) extraFn(row);
      }
    }
  }
};
const pLeak = clone("E11S2");
apply(pLeak, leaky, leakLap);
const rLeak = checkRoom(pLeak, d12.terrain, d12.objects, null);
const rLeakR = realFails(rLeak);
console.log("E11S2 20,9→19,9", {
  has209,
  leakSit,
  leakLap,
  result: rLeakR.length ? "BITES" : "ESCAPE",
  hit: rLeakR.find((f) => /leaks the sitter/i.test(f)) || rLeakR[0] || "",
});

const sealFrom = last.cutTiles.find((t) => t.x === 29 && t.y === 33);
const sealed = last.cutTiles.map((t) => (t.x === 29 && t.y === 33 ? { x: 28, y: 34 } : { x: t.x, y: t.y }));
const sealLap = enclosureMobility(d12.terrain, e12, sealed);
const sealExt = exteriorFlood(d12.terrain, new Set(sealed.map((t) => key(t.x, t.y))));
const sealSit = !!sealExt[e12.sitter.x + e12.sitter.y * 50];
const pSeal = clone("E11S2");
apply(pSeal, sealed, sealLap);
const rSeal = checkRoom(pSeal, d12.terrain, d12.objects, null);
const rSealR = realFails(rSeal);
console.log("E11S2 29,33→28,34", {
  has2933: !!sealFrom,
  sealSit,
  sealLap,
  origLap: last.mobility,
  result: rSealR.length ? "BITES" : "ESCAPE",
  first: rSealR[0] || "",
});
