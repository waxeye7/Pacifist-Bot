/**
 * Pin first-fail text on the new 98/88 holes. Clones only. Regen decls.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { enclosureMobility } from "../layer-shell.mjs";
import { renderDecl } from "../declprose.mjs";
import { bothLanes, hashedRooms, loadPlans, loadRooms, makeChecker, K } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);

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

const rows = [];
async function rec(p) {
  const r = await p;
  rows.push(r);
  console.log(String(r.status).padEnd(8), r.name, r.changed, (r.first || "").slice(0, 260));
  return r;
}

await rec(run("98 append 19,27 both reserved lists wanted+1", "E11S1", (p) => {
  bothLanes(p, (L) => {
    const extra = "19,27";
    L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
    L.reserved = [...(L.reserved || []).map(String), extra];
    L.tiles = L.reserved.length;
    L.fullRun.tiles = L.fullRun.reserved.length;
    const last = L.fullRun.byRound[L.fullRun.byRound.length - 1];
    L.fullRun.byRound = [
      ...L.fullRun.byRound.slice(0, -1).map((r) => r.slice()),
      [...last.map(String), extra],
    ];
    L.shrunk.wanted = L.fullRun.tiles + 1;
  });
}));

await rec(run("98 prefix swap 18,27→19,27 both lists", "E11S1", (p) => {
  bothLanes(p, (L) => {
    const from = "18,27", to = "19,27";
    L.fullRun.reserved = L.fullRun.reserved.map((t) => (String(t) === from ? to : String(t)));
    L.reserved = (L.reserved || []).map((t) => (String(t) === from ? to : String(t)));
    L.fullRun.byRound = L.fullRun.byRound.map((r) => r.map((t) => (String(t) === from ? to : String(t))));
  });
}));

await rec(run("98 wanted += 1 only", "E11S1", (p) => {
  bothLanes(p, (L) => { L.shrunk.wanted += 1; });
}));

const src = byPlan.get("E11S2");
const d = byRoom.get("E11S2");
const last = src.meta.shortfalls.find((s) => s.ladder).ladder.rungs.at(-1);
const leaky = last.cutTiles.map((t) => (t.x === 20 && t.y === 9 ? { x: 19, y: 9 } : { x: t.x, y: t.y }));
const leakLap = enclosureMobility(d.terrain, src, leaky);
const sealed = last.cutTiles.map((t) => (t.x === 29 && t.y === 33 ? { x: 28, y: 34 } : { x: t.x, y: t.y }));
const sealLap = enclosureMobility(d.terrain, src, sealed);

await rec(run("88 leaky 20,9→19,9 complete stays true + regen", "E11S2", (p) => {
  applyBonus(p, 85, (r) => {
    r.cutTiles = leaky.map((t) => ({ x: t.x, y: t.y }));
    r.mobility = leakLap;
  });
}));
await rec(run("88 leaky 20,9→19,9 AND complete=false + regen", "E11S2", (p) => {
  applyBonus(p, 85, (r) => {
    r.cutTiles = leaky.map((t) => ({ x: t.x, y: t.y }));
    r.mobility = leakLap;
    r.complete = false;
  });
}));
await rec(run("88 sealing 29,33→28,34 + regen", "E11S2", (p) => {
  applyBonus(p, 85, (r) => {
    r.cutTiles = sealed.map((t) => ({ x: t.x, y: t.y }));
    r.mobility = sealLap;
  });
}));
await rec(run("88 last-fat complete=false only + regen", "E11S2", (p) => {
  applyBonus(p, 85, (r) => { r.complete = false; });
}));

const hashed = hashedRooms(plans).slice(0, 5).map((r) => r.room);
const extra = ["E12S1", "E15S4", "E11S1", "E2S7", "E1S4"];
const names = [...new Set([...hashed, ...extra])];
const brief = {};
for (const name of names) {
  const p = byPlan.get(name);
  if (!p) continue;
  brief[name] = {
    hashed: hashed.includes(name),
    drift: (p.meta.shell?.cutDrift || []).map((e) => `${e.op} ${K(e)} ${e.pass}`),
    baseCut: p.meta.shell?.baseCut,
    protect: p.meta.shell?.protectRadius,
    seedScore: p.meta.seedScore,
    seed: p.seed,
    hub: p.hub,
    sitter: p.sitter,
    mobility: p.meta.walls?.mobility?.builtGated,
    enclosedCtrl: p.meta.shell?.enclosedController,
    notes: (p.meta.noteRecords || []).map((n) => n.cls),
    shortfalls: (p.meta.shortfalls || []).map((s) => s.gate + (s.kind ? "/" + s.kind : "")),
    outcome: p.meta.sealedRecovery?.outcome,
    holders: (p.meta.sealedRecovery?.fixedHolders || []).map((h) => ({ t: h.type, k: K(h), keys: Object.keys(h) })),
    rungs: (p.meta.shellEscalation?.rungs || []).map((r) => ({
      b: r.needDeepBonus, mob: r.mobility, ramp: r.ramparts, cut: (r.cutTiles || []).length, complete: r.complete,
    })),
    reserved: p.meta.extensions?.laneMeta?.fullRun?.reserved,
    laneRes: p.meta.extensions?.laneMeta?.reserved,
    shrunk: p.meta.extensions?.laneMeta?.shrunk,
  };
}
console.log(JSON.stringify({ hashed, briefKeys: Object.keys(brief) }, null, 2));
fs.writeFileSync(path.join(DIR, "followup-out.json"), JSON.stringify({ rows, hashed, brief }, null, 2));
