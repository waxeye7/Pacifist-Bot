/**
 * Pin first-fail text on the new 98/88 holes. Clones only.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { enclosureMobility } from "../layer-shell.mjs";
import { bothLanes, loadPlans, loadRooms, makeChecker, K } from "./common.mjs";

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

await rec(run("88 leaky 20,9→19,9 complete stays true", "E11S2", (p) => {
  applyBonus(p, 85, (r) => {
    r.cutTiles = leaky.map((t) => ({ x: t.x, y: t.y }));
    r.mobility = leakLap;
  });
}));
await rec(run("88 leaky 20,9→19,9 AND complete=false", "E11S2", (p) => {
  applyBonus(p, 85, (r) => {
    r.cutTiles = leaky.map((t) => ({ x: t.x, y: t.y }));
    r.mobility = leakLap;
    r.complete = false;
  });
}));
await rec(run("88 sealing 29,33→28,34", "E11S2", (p) => {
  applyBonus(p, 85, (r) => {
    r.cutTiles = sealed.map((t) => ({ x: t.x, y: t.y }));
    r.mobility = sealLap;
  });
}));
await rec(run("88 last-fat complete=false only", "E11S2", (p) => {
  applyBonus(p, 85, (r) => { r.complete = false; });
}));

const e6 = byPlan.get("E6S4");
const e15s3 = byPlan.get("E15S3");
const e5s2 = byPlan.get("E5S2");
const e15s6 = byPlan.get("E15S6");
const brief = {
  E6S4: {
    drift: (e6.meta.shell.cutDrift || []).map((e) => `${e.op} ${K(e)} ${e.pass}`),
    baseCut: e6.meta.shell.baseCut,
    protect: e6.meta.shell.protectRadius,
    seedScore: e6.meta.seedScore,
    notes: (e6.meta.noteRecords || []).map((n) => n.cls),
  },
  E15S3: {
    baseCut: e15s3.meta.shell.baseCut,
    protect: e15s3.meta.shell.protectRadius,
    seedScore: e15s3.meta.seedScore,
    mobility: e15s3.meta.walls?.mobility?.builtGated,
    shortfalls: (e15s3.meta.shortfalls || []).map((s) => s.gate + (s.kind ? "/" + s.kind : "")),
  },
  E5S2: {
    baseCut: e5s2.meta.shell.baseCut,
    protect: e5s2.meta.shell.protectRadius,
    seedScore: e5s2.meta.seedScore,
    mobility: e5s2.meta.walls?.mobility?.builtGated,
    picked: e5s2.meta.shellEscalation?.pickedNeedDeepBonus,
    rungs: (e5s2.meta.shellEscalation?.rungs || []).map((r) => ({
      b: r.needDeepBonus, mob: r.mobility, ramp: r.ramparts, cut: (r.cutTiles || []).length, complete: r.complete,
    })),
    shortfalls: (e5s2.meta.shortfalls || []).map((s) => s.gate + (s.kind ? "/" + s.kind : "")),
  },
  E15S6: {
    outcome: e15s6.meta.sealedRecovery?.outcome,
    holders: (e15s6.meta.sealedRecovery?.fixedHolders || []).map((h) => ({ t: h.type, k: K(h), keys: Object.keys(h) })),
    seedScore: e15s6.meta.seedScore,
  },
};
console.log(JSON.stringify(brief, null, 2));
fs.writeFileSync(path.join(DIR, "followup-out.json"), JSON.stringify({ rows, brief }, null, 2));
