/**
 * Named r29p11 close + leftover. checkRoom on clones only. Regen decls.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom } from "../validate.mjs";
import { enclosureMobility } from "../layer-shell.mjs";
import { renderDecl } from "../declprose.mjs";
import { exteriorFlood, key } from "../shared.mjs";
import { loadPlans, loadRooms, realFails, bothLanes } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byName = new Map(plans.map((p) => [p.room, p]));
const clone = (r) => JSON.parse(JSON.stringify(byName.get(r)));

function judge(label, p, d) {
  const res = checkRoom(p, d.terrain, d.objects, null);
  const real = realFails(res);
  const hit = real.find((f) => /leaks the sitter/i.test(f)) || real[0] || "";
  const status = real.length ? "BITES" : "ESCAPE";
  console.log(status.padEnd(8), label, hit.slice(0, 180));
  return { status, n: real.length, first: hit.slice(0, 320), rawFails: res.fails.length };
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

const out = {};

const e11 = clone("E11S1");
const d11 = byRoom.get("E11S1");
const clean = judge("E11S1 unmodified", e11, d11);
out.E11S1_unmodified = clean.status;
const L0 = e11.meta.extensions.laneMeta;
out.E11S1_shrink = {
  wanted: L0.shrunk?.wanted,
  tiles: L0.fullRun?.tiles,
  reserved: L0.fullRun?.reserved,
  lane: L0.reserved,
  byRound: L0.fullRun?.byRound,
  to: L0.fullRun?.to,
  used: L0.fullRun?.used,
  ext: L0.fullRun?.ext,
  shallow: L0.fullRun?.shallow,
};

const p98one = clone("E11S1");
bothLanes(p98one, (L) => {
  const extra = "19,27";
  L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
  const last = L.fullRun.byRound[L.fullRun.byRound.length - 1];
  L.fullRun.byRound = [...L.fullRun.byRound.slice(0, -1).map((r) => r.slice()), [...last.map(String), extra]];
  L.fullRun.tiles = L.fullRun.reserved.length;
  L.shrunk.wanted = L.fullRun.tiles;
});
out.E11S1_append_19_27_fullRun_only_wanted_eq_tiles = judge("98 19,27 fullRun only wanted:=tiles", p98one, d11).status;

const p98both = clone("E11S1");
bothLanes(p98both, (L) => {
  const extra = "19,27";
  L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
  L.reserved = [...(L.reserved || []).map(String), extra];
  L.tiles = L.reserved.length;
  L.fullRun.tiles = L.fullRun.reserved.length;
  const last = L.fullRun.byRound[L.fullRun.byRound.length - 1];
  L.fullRun.byRound = [...L.fullRun.byRound.slice(0, -1).map((r) => r.slice()), [...last.map(String), extra]];
  L.shrunk.wanted = L.fullRun.tiles + 1;
});
out.E11S1_append_19_27_both_lists_wanted_plus_1 = judge("98 19,27 both lists wanted+1", p98both, d11).status;

const pWant = clone("E11S1");
bothLanes(pWant, (L) => { L.shrunk.wanted += 1; });
out.E11S1_wanted_plus_1 = judge("98 wanted += 1", pWant, d11).status;

const pSwap = clone("E11S1");
bothLanes(pSwap, (L) => {
  const from = "18,27", to = "19,27";
  L.fullRun.reserved = L.fullRun.reserved.map((t) => (String(t) === from ? to : String(t)));
  L.reserved = (L.reserved || []).map((t) => (String(t) === from ? to : String(t)));
  L.fullRun.byRound = L.fullRun.byRound.map((r) => r.map((t) => (String(t) === from ? to : String(t))));
});
out.E11S1_prefix_swap_18_27_to_19_27 = judge("98 prefix swap 18,27→19,27", pSwap, d11).status;

const src12 = byName.get("E11S2");
const d12 = byRoom.get("E11S2");
const last = src12.meta.shortfalls.find((s) => s.ladder).ladder.rungs.at(-1);
const bonus = last.needDeepBonus;
const leaky = last.cutTiles.map((t) => (t.x === 20 && t.y === 9 ? { x: 19, y: 9 } : { x: t.x, y: t.y }));
const leakLap = enclosureMobility(d12.terrain, src12, leaky);
const leakExt = exteriorFlood(d12.terrain, new Set(leaky.map((t) => key(t.x, t.y))));
const leakSit = !!leakExt[src12.sitter.x + src12.sitter.y * 50];
const sealed = last.cutTiles.map((t) => (t.x === 29 && t.y === 33 ? { x: 28, y: 34 } : { x: t.x, y: t.y }));
const sealLap = enclosureMobility(d12.terrain, src12, sealed);
const sealExt = exteriorFlood(d12.terrain, new Set(sealed.map((t) => key(t.x, t.y))));
const sealSit = !!sealExt[src12.sitter.x + src12.sitter.y * 50];
out.E11S2_facts = {
  bonus,
  has209: last.cutTiles.some((t) => t.x === 20 && t.y === 9),
  has2933: last.cutTiles.some((t) => t.x === 29 && t.y === 33),
  origLap: last.mobility,
  origComplete: last.complete,
  leakSit,
  leakLap,
  sealSit,
  sealLap,
};

const pLeak = clone("E11S2");
applyBonus(pLeak, bonus, (r) => {
  r.cutTiles = leaky.map((t) => ({ x: t.x, y: t.y }));
  r.mobility = leakLap;
});
out.E11S2_leaky_20_9_to_19_9_complete_true = judge("88 leaky 20,9→19,9 complete stays true + regen", pLeak, d12).status;

const pLeakInc = clone("E11S2");
applyBonus(pLeakInc, bonus, (r) => {
  r.cutTiles = leaky.map((t) => ({ x: t.x, y: t.y }));
  r.mobility = leakLap;
  r.complete = false;
});
out.E11S2_leaky_plus_complete_false_regen = judge("88 leaky 20,9→19,9 complete=false + regen", pLeakInc, d12).status;

const pSeal = clone("E11S2");
applyBonus(pSeal, bonus, (r) => {
  r.cutTiles = sealed.map((t) => ({ x: t.x, y: t.y }));
  r.mobility = sealLap;
});
out.E11S2_sealing_29_33_to_28_34 = judge("88 sealing 29,33→28,34 + regen", pSeal, d12).status;

const pPick = clone("E11S1");
pPick.meta.shell.protectRadius = 6;
out.E11S1_protectRadius_12_to_6 = judge("pick protectRadius 12→6", pPick, d11).status;
const pBase = clone("E11S1");
pBase.meta.shell.baseCut += 1;
pBase.meta.shell.priceyWall = pBase.meta.shell.baseCut > 45 ? 1 : 0;
out.E11S1_baseCut_plus_1 = judge("pick baseCut += 1 keep priceyWall", pBase, d11).status;
const pScore = clone("E11S1");
pScore.meta.seedScore = 0;
out.E11S1_seedScore_0 = judge("seedScore := 0", pScore, d11).status;
const pScore2 = clone("E11S1");
pScore2.meta.seedScore = (pScore2.meta.seedScore || 0) + 999;
out.E11S1_seedScore_plus_999 = judge("seedScore += 999", pScore2, d11).status;

fs.writeFileSync(path.join(DIR, "probe-out.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
