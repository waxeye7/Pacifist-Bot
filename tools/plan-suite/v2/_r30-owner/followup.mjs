/**
 * Follow-up: 88 with renderDecl, proper 93 increment, 98 variants, cutPasses residue.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { enclosureMobility } from "../layer-shell.mjs";
import { renderDecl } from "../declprose.mjs";
import { renderNote } from "../declprose-notes.mjs";
import { loadPlans, loadRooms, makeChecker, K } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);
const attacks = [];
async function rec(p) {
  const r = await p;
  attacks.push(r);
  console.log(String(r.status).padEnd(8), r.name, r.room, "changed=" + r.changed, String(r.first || "").slice(0, 200));
  return r;
}

const e15 = plans.find((p) => p.room === "E15S6");
const R = e15.meta.sealedRecovery;
const dump = {
  outcome: R.outcome,
  taken: R.taken,
  holders: (R.fixedHolders || []).map((h) => ({ ...h })),
  cap: (R.pockets || []).reduce((n, pk) => n + (pk.tiles || 0), 0),
  noteHolders: (e15.meta.noteRecords || [])
    .filter((n) => n.cls === "sealedRecovery")
    .map((n) => (n.rec?.fixedHolders || []).map((h) => ({ t: h.type, k: K(h), r: h.recovers, d: h.recoversDeep }))),
};
console.log("E15S6 dump", JSON.stringify(dump, null, 2));

function bothLanes(p, fn) {
  fn(p.meta.extensions.laneMeta);
  const W = p.meta.walls?.mobility?.lanes;
  if (W && W !== p.meta.extensions.laneMeta) fn(W);
}

const d11s2 = byRoom.get("E11S2");

// 88 with renderDecl
await rec(run("88b fatter mobility 0.5 + renderDecl", "E11S2", (p) => {
  const shipped = (p.structures.rampart || []).length;
  for (const sf of p.meta.shortfalls || []) {
    if (!sf.ladder?.rungs) continue;
    for (const r of sf.ladder.rungs) {
      if (r && r.ramparts > shipped && typeof r.mobility === "number") r.mobility = 0.5;
    }
    sf.detail = renderDecl(sf);
  }
}));

await rec(run("88b swap fatter with freeze keep ramparts + renderDecl", "E11S2", (p) => {
  const freeze = (p.meta.shell.cutAtFreeze || []).map((t) => ({ x: t.x, y: t.y }));
  const shipped = (p.structures.rampart || []).length;
  const winner = (p.meta.shortfalls || []).find((s) => s.ladder)?.ladder?.rungs?.find((r) => r.ramparts === shipped);
  const lap = winner?.mobility ?? 1.56;
  for (const sf of p.meta.shortfalls || []) {
    if (!sf.ladder?.rungs) continue;
    for (const r of sf.ladder.rungs) {
      if (r && r.ramparts > shipped) {
        r.cutTiles = freeze.map((t) => ({ ...t }));
        r.mobility = lap;
      }
    }
    sf.detail = renderDecl(sf);
  }
  if (p.meta.shellEscalation?.rungs) {
    for (const r of p.meta.shellEscalation.rungs) {
      if (r && r.ramparts > shipped) {
        r.cutTiles = freeze.map((t) => ({ ...t }));
        r.mobility = lap;
      }
    }
  }
}));

await rec(run("88b invent box cut + own lap + renderDecl", "E11S2", (p) => {
  const sitter = p.sitter;
  const fake = [];
  for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]]) {
    fake.push({ x: sitter.x + dx, y: sitter.y + dy });
  }
  const lap = enclosureMobility(d11s2.terrain, p, fake);
  const shipped = (p.structures.rampart || []).length;
  const esc = p.meta.shellEscalation;
  const target = (esc?.rungs || []).find((r) => r && r.needDeepBonus !== esc.pickedNeedDeepBonus && r.ramparts > shipped);
  if (target && typeof lap === "number") {
    target.cutTiles = fake;
    target.mobility = lap;
    const sf = (p.meta.shortfalls || []).find((s) => s && s.ladder);
    if (sf) {
      const twin = sf.ladder.rungs.find((r) => r.needDeepBonus === target.needDeepBonus);
      if (twin) {
        twin.cutTiles = fake.map((t) => ({ ...t }));
        twin.mobility = lap;
      }
      sf.detail = renderDecl(sf);
    }
  }
}));

await rec(run("88b invent non-freeze cut walking its lap + renderDecl", "E11S2", (p) => {
  const shipped = (p.structures.rampart || []).length;
  const shippedCut = (p.meta.shell.cut || []).map((t) => ({ x: t.x, y: t.y }));
  const fake = shippedCut.map((t) => ({ ...t }));
  if (fake.length) fake[0] = { x: Math.min(49, fake[0].x + 1), y: fake[0].y };
  const lap = enclosureMobility(d11s2.terrain, p, fake);
  const esc = p.meta.shellEscalation;
  const target = (esc?.rungs || []).find((r) => r && r.needDeepBonus !== esc.pickedNeedDeepBonus && r.ramparts > shipped);
  if (target && typeof lap === "number") {
    target.cutTiles = fake;
    target.mobility = lap;
    const sf = (p.meta.shortfalls || []).find((s) => s && s.ladder);
    if (sf) {
      const twin = sf.ladder.rungs.find((r) => r.needDeepBonus === target.needDeepBonus);
      if (twin) {
        twin.cutTiles = fake.map((t) => ({ ...t }));
        twin.mobility = lap;
      }
      sf.detail = renderDecl(sf);
    }
  }
}));

// 93 proper
await rec(run("93b recovers += 1 keep deep + both copies + renderNote", "E15S6", (p) => {
  const R0 = p.meta.sealedRecovery;
  const cap = (R0.pockets || []).reduce((n, pk) => n + (pk?.tiles || 0), 0);
  for (const f of R0.fixedHolders || []) {
    if (typeof f.recovers === "number" && f.recovers + 1 <= cap) {
      f.recovers += 1;
      if (typeof f.recoversDeep !== "number") f.recoversDeep = f.recovers;
      else if (f.recoversDeep > f.recovers) f.recoversDeep = f.recovers;
    }
  }
  for (const nr of p.meta.noteRecords || []) {
    if (nr.cls !== "sealedRecovery" || !nr.rec) continue;
    nr.rec.fixedHolders = JSON.parse(JSON.stringify(R0.fixedHolders));
    const i = p.meta.noteRecords.indexOf(nr);
    if (i >= 0 && Array.isArray(p.meta.notes)) p.meta.notes[i] = renderNote(nr);
  }
}));

await rec(run("93b recovers := cap keep deep in [1,cap] + twins", "E15S6", (p) => {
  const R0 = p.meta.sealedRecovery;
  const cap = (R0.pockets || []).reduce((n, pk) => n + (pk?.tiles || 0), 0);
  for (const f of R0.fixedHolders || []) {
    if (typeof f.recovers === "number") {
      f.recovers = cap;
      f.recoversDeep = typeof f.recoversDeep === "number" ? Math.min(f.recoversDeep, cap) : cap;
    }
  }
  for (const nr of p.meta.noteRecords || []) {
    if (nr.cls !== "sealedRecovery" || !nr.rec) continue;
    nr.rec.fixedHolders = JSON.parse(JSON.stringify(R0.fixedHolders));
    const i = p.meta.noteRecords.indexOf(nr);
    if (i >= 0 && Array.isArray(p.meta.notes)) p.meta.notes[i] = renderNote(nr);
  }
}));

// 98 more
await rec(run("98b extra reserved on plain kept room", "E11S3", (p) => {
  bothLanes(p, (L) => {
    const extra = ["0,0"];
    L.fullRun.reserved = [...L.fullRun.reserved.map(String), ...extra];
    L.fullRun.tiles = L.fullRun.reserved.length;
    L.fullRun.byRound = L.fullRun.byRound.map((r) => r.slice());
    L.fullRun.byRound.push(extra);
    L.fullRun.rounds = L.fullRun.byRound.length;
    L.fullRun.used = L.fullRun.rounds;
    L.tiles = L.fullRun.tiles;
    L.rounds = L.fullRun.rounds;
    L.reserved = L.fullRun.reserved.slice();
  });
}));

await rec(run("98b replace a later-round tile on shrink (identity swap)", "E11S1", (p) => {
  bothLanes(p, (L) => {
    const to = L.shrunk.to;
    const later = L.fullRun.byRound[to];
    if (later && later.length) {
      const old = String(later[0]);
      const neu = "0,0";
      later[0] = neu;
      L.fullRun.reserved = L.fullRun.reserved.map((k) => (String(k) === old ? neu : String(k)));
    }
  });
}));

await rec(run("98b extra reserved + extra byRound on shrink, no wanted update", "E11S1", (p) => {
  bothLanes(p, (L) => {
    const extra = ["0,0"];
    L.fullRun.reserved = [...L.fullRun.reserved.map(String), ...extra];
    L.fullRun.tiles = L.fullRun.reserved.length;
    L.fullRun.byRound = L.fullRun.byRound.map((r) => r.slice());
    L.fullRun.byRound.push(extra);
    L.fullRun.rounds = L.fullRun.byRound.length;
  });
}));

// cutPasses: first-prune +1 slack rooms
const slack3 = plans.filter((p) => {
  const mk = (p.meta?.shell?.cutPasses || []).find((m) => m.pass === "layer7-inertPrune");
  return mk && Number.isInteger(mk.ramparts);
});
const first = slack3[0];
if (first) {
  await rec(run("cutPasses first-prune ramparts += 1", first.room, (p) => {
    const mk = p.meta.shell.cutPasses.find((m) => m.pass === "layer7-inertPrune");
    if (mk) mk.ramparts += 1;
  }));
}

await rec(run("cutPasses first-prune deleted += 1 last adjusted", "E11S6", (p) => {
  const a = p.meta.shell.cutPasses.find((m) => m.pass === "layer7-inertPrune");
  const b = p.meta.shell.cutPasses.find((m) => m.pass === "layer7b-inertPrune");
  if (a && b && a.rampartsDeleted + 1 <= a.ramparts && b.rampartsDeleted - 1 >= b.removes) {
    a.rampartsDeleted += 1;
    b.rampartsDeleted -= 1;
    b.ramparts = (p.structures.rampart || []).length + b.rampartsDeleted;
  }
}));

fs.writeFileSync(path.join(DIR, "followup-out.json"), JSON.stringify({ dump, attacks }, null, 2));
console.log(JSON.stringify({
  n: attacks.length,
  escapes: attacks.filter((a) => a.status === "ESCAPE").map((a) => ({ name: a.name, changed: a.changed })),
  bites: attacks.filter((a) => a.status === "BITES").map((a) => a.name),
}, null, 2));
