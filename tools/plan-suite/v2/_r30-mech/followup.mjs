/**
 * Follow-up: 88 last-rung / prettier, 93 both-copy invent, 98 erase both twins,
 * film seed, fat-rung census.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderDecl } from "../declprose.mjs";
import { renderNote } from "../declprose-notes.mjs";
import { enclosureMobility } from "../layer-shell.mjs";
import { ROOT, K, loadPlans, loadRooms, makeChecker, syncLane } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);
const results = [];
function rec(r) {
  results.push(r);
  console.log(String(r.status).padEnd(8), r.name, r.room, String(r.detail || "").slice(0, 240));
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

// --- 88 census: fat rungs, last vs not, eco cap ---
const fatCensus = [];
for (const p of plans) {
  const shipped = (p.structures?.rampart || []).length;
  const esc = p.meta?.shellEscalation;
  const rungs = esc?.rungs || (p.meta?.shortfalls || []).find((s) => s?.ladder)?.ladder?.rungs || [];
  if (!rungs.length) continue;
  const eco = p.meta?.ecoBudget;
  const ecoCapped = eco ? eco.cap !== null : true;
  rungs.forEach((r, i) => {
    if (!r || !(r.ramparts > shipped) || !Array.isArray(r.cutTiles) || !r.cutTiles.length) return;
    fatCensus.push({
      room: p.room,
      i,
      last: i === rungs.length - 1,
      bonus: r.needDeepBonus,
      ramparts: r.ramparts,
      mobility: r.mobility,
      cut: r.cutTiles.length,
      shipped,
      ecoCapped,
      picked: esc?.pickedNeedDeepBonus,
    });
  });
}
const fatNonLast = fatCensus.filter((r) => !r.last);
rec({
  name: "88-fat-rung-census",
  room: "*",
  status: "INFO",
  detail: JSON.stringify({
    fat: fatCensus.length,
    last: fatCensus.filter((r) => r.last).length,
    nonLast: fatNonLast.length,
    nonLastRooms: fatNonLast.map((r) => r.room + "#" + r.bonus),
  }),
});

const p2 = byPlan.get("E11S2");
rec({
  name: "88-E11S2-rungs",
  room: "E11S2",
  status: "INFO",
  detail: JSON.stringify({
    picked: p2.meta.shellEscalation?.pickedNeedDeepBonus,
    eco: p2.meta.ecoBudget,
    rungs: (p2.meta.shellEscalation?.rungs || []).map((r, i) => ({
      i,
      bonus: r.needDeepBonus,
      ramparts: r.ramparts,
      mobility: r.mobility,
      cut: (r.cutTiles || []).length,
    })),
  }),
});

// last fat rung: shipped cut + ramparts := cut length (the r29 named exploit)
rec(run("88-last-fat-shipped-cut-ramparts-to-cutlen", "E11S2", (p) => {
  const d = byRoom.get(p.room);
  const shippedCut = (p.meta.shell.cut || []).map((t) => ({ x: t.x, y: t.y }));
  const pretty = enclosureMobility(d.terrain, p, shippedCut);
  applyBonus(p, 85, (r) => {
    r.cutTiles = shippedCut.map((t) => ({ x: t.x, y: t.y }));
    r.mobility = pretty;
    r.ramparts = shippedCut.length;
  });
}));

// last fat rung: invent a prettier (strictly better) non-freeze cut
rec(run("88-last-fat-invent-strict-better-box", "E11S2", (p) => {
  const d = byRoom.get(p.room);
  const sitter = p.sitter;
  const fake = [];
  for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [3, 3], [3, -3], [-3, 3], [-3, -3]]) {
    fake.push({ x: sitter.x + dx, y: sitter.y + dy });
  }
  const lap = enclosureMobility(d.terrain, p, fake);
  applyBonus(p, 85, (r) => {
    r.cutTiles = fake;
    r.mobility = lap;
    // keep ramparts at 50 so freeze check (ramparts>shipped && cuts===freeze) does not fire
  });
}));

// last fat rung: swap one tile, keep own lap if possible
{
  const d = byRoom.get("E11S2");
  const fat = (p2.meta.shellEscalation.rungs || []).find((r) => r.needDeepBonus === 85);
  const freeze = new Set((p2.meta.shell.cutAtFreeze || []).map(K));
  let found = null;
  if (fat) {
    const used = new Set(fat.cutTiles.map(K));
    for (let i = 0; i < fat.cutTiles.length && !found; i++) {
      const t = fat.cutTiles[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) {
        const nx = t.x + dx, ny = t.y + dy;
        const k = `${nx},${ny}`;
        if (nx < 1 || ny < 1 || nx > 48 || ny > 48 || used.has(k) || freeze.has(k)) continue;
        const fake = fat.cutTiles.map((q, j) => (j === i ? { x: nx, y: ny } : { x: q.x, y: q.y }));
        const lap = enclosureMobility(d.terrain, p2, fake);
        if (typeof lap !== "number") continue;
        if (lap < fat.mobility - 1e-6 && lap > 1.56 + 1e-6) {
          found = { fake, lap, kind: "prettier-not-better" };
          break;
        }
        if (!found && lap >= 1.56 - 1e-6 && Math.abs(lap - fat.mobility) > 1e-6) {
          found = { fake, lap, kind: "different-lap-not-better" };
        }
      }
    }
    if (!found) {
      const t = fat.cutTiles[0];
      const fake = fat.cutTiles.map((q, j) => (j === 0 ? { x: Math.min(48, t.x + 1), y: t.y } : { x: q.x, y: q.y }));
      const lap = enclosureMobility(d.terrain, p2, fake);
      if (typeof lap === "number") found = { fake, lap, kind: "one-tile-nudge" };
    }
  }
  rec({ name: "88-fat85-search", room: "E11S2", status: "INFO", detail: JSON.stringify(found && { lap: found.lap, kind: found.kind, n: found.fake.length }) });
  if (found) {
    rec(run("88-last-fat-invent-non-freeze-own-lap", "E11S2", (p) => {
      applyBonus(p, 85, (r) => {
        r.cutTiles = found.fake.map((t) => ({ x: t.x, y: t.y }));
        r.mobility = found.lap;
      });
    }));
  }
}

if (fatNonLast[0]) {
  const hit = fatNonLast[0];
  rec(run("88-nonlast-fat-shipped-cut-ramparts-to-cutlen", hit.room, (p) => {
    const d = byRoom.get(p.room);
    const shippedCut = (p.meta.shell.cut || []).map((t) => ({ x: t.x, y: t.y }));
    const pretty = enclosureMobility(d.terrain, p, shippedCut);
    applyBonus(p, hit.bonus, (r) => {
      r.cutTiles = shippedCut.map((t) => ({ x: t.x, y: t.y }));
      r.mobility = pretty;
      r.ramparts = shippedCut.length;
    });
  }));
}

// --- 93: invent holder on BOTH copies + regen ---
rec(run("93-taken-invent-holder-both-copies-regen", "E11S7", (p) => {
  const fake = { type: "lab", x: 1, y: 1, recovers: 2, recoversDeep: 2 };
  p.meta.sealedRecovery.fixedHolders = [...(p.meta.sealedRecovery.fixedHolders || []), fake];
  for (const nr of p.meta.noteRecords || []) {
    if (nr.cls !== "sealedRecovery" || !nr.rec) continue;
    nr.rec.fixedHolders = JSON.parse(JSON.stringify(p.meta.sealedRecovery.fixedHolders));
    const i = p.meta.noteRecords.indexOf(nr);
    if (i >= 0 && Array.isArray(p.meta.notes)) p.meta.notes[i] = renderNote(nr);
  }
}));

// dump E15S6 recovers twins
{
  const p = byPlan.get("E15S6");
  const R0 = p.meta.sealedRecovery;
  const notes = (p.meta.noteRecords || []).filter((n) => n.cls === "sealedRecovery");
  rec({
    name: "93-E15S6-twins",
    room: "E15S6",
    status: "INFO",
    detail: JSON.stringify({
      fixed: R0.fixedHolders,
      noteHolders: notes.map((n) => n.rec?.fixedHolders),
      pocketTiles: (R0.pockets || []).reduce((a, pk) => a + (pk?.tiles || 0), 0),
      noteMentionsRecovers: (p.meta.notes || []).some((s) => /recovers/.test(s)),
    }),
  });
}

// inflate recoversDeep only, keep recovers, both copies
rec(run("93-inflate-recoversDeep-only-both-copies", "E15S6", (p) => {
  const R0 = p.meta.sealedRecovery;
  for (const f of R0.fixedHolders || []) {
    if (typeof f.recovers === "number" && f.recoversDeep < f.recovers) f.recoversDeep += 1;
    else {
      f.recovers += 1;
      f.recoversDeep += 1;
    }
  }
  for (const nr of p.meta.noteRecords || []) {
    if (nr.cls !== "sealedRecovery" || !nr.rec) continue;
    nr.rec.fixedHolders = JSON.parse(JSON.stringify(R0.fixedHolders));
    const i = p.meta.noteRecords.indexOf(nr);
    if (i >= 0) p.meta.notes[i] = renderNote(nr);
  }
}));

// --- 98 erase both twins properly ---
rec(run("98-erase-real-shrink-both-twins", "E11S1", (p) => {
  const L = p.meta.extensions.laneMeta;
  const W = p.meta.walls.mobility.lanes;
  delete L.shrunk;
  delete W.shrunk;
  L.roundCap = 10;
  W.roundCap = 10;
}));

rec(run("98-delete-fullRun-both-twins", "E11S3", (p) => {
  delete p.meta.extensions.laneMeta.fullRun;
  delete p.meta.walls.mobility.lanes.fullRun;
}));

rec(run("98-extra-reserved-99-99-prefix", "E11S1", (p) => {
  const L = p.meta.extensions.laneMeta;
  const fr = L.fullRun;
  fr.reserved = [...fr.reserved.map(String), "99,99"];
  fr.byRound[fr.byRound.length - 1].push("99,99");
  fr.tiles = fr.reserved.length;
  L.shrunk.wanted = fr.tiles;
  syncLane(p);
}));

rec(run("98-extra-reserved-duplicate-prefix", "E11S1", (p) => {
  const L = p.meta.extensions.laneMeta;
  const fr = L.fullRun;
  const dup = String(fr.reserved[0]);
  fr.reserved = [...fr.reserved.map(String), dup];
  fr.byRound[fr.byRound.length - 1].push(dup);
  fr.tiles = fr.reserved.length;
  L.shrunk.wanted = fr.tiles;
  syncLane(p);
}));

// --- 141(e) film parse ---
let parseFail = 0, seedEq = 0, seedNe = 0, captionMismatch = 0;
const mismatches = [];
for (const p of plans) {
  const html = path.join(ROOT, `${p.room}.html`);
  if (!fs.existsSync(html)) { parseFail++; continue; }
  const src = fs.readFileSync(html, "utf8");
  const m = /seed \((\d+),(\d+)\) → hub \((\d+),(\d+)\)/.exec(src);
  if (!m) { parseFail++; continue; }
  const seed = { x: +m[1], y: +m[2] };
  const hub = { x: +m[3], y: +m[4] };
  if (seed.x === hub.x && seed.y === hub.y) seedEq++;
  else seedNe++;
  if (!p.seed || p.seed.x !== seed.x || p.seed.y !== seed.y || p.hub.x !== hub.x || p.hub.y !== hub.y) {
    captionMismatch++;
    if (mismatches.length < 6) mismatches.push({ room: p.room, film: { seed, hub }, plan: { seed: p.seed, hub: p.hub } });
  }
}
rec({
  name: "141e-film-census",
  room: "*",
  status: captionMismatch ? "INFO" : "INFO",
  detail: JSON.stringify({ parseFail, seedEq, seedNe, captionMismatch, mismatches }),
});

// seedScore rewrite does not need film twin
rec(run("141e-seedScore-negated", "E12S5", (p) => { p.meta.seedScore = -p.meta.seedScore; }));

// presence extras that the first pass skipped
function grabDeep(p, names) {
  const stack = [p.meta];
  while (stack.length) {
    const o = stack.pop();
    if (!o || typeof o !== "object") continue;
    if (Array.isArray(o)) { for (const e of o) stack.push(e); continue; }
    for (const [k, v] of Object.entries(o)) {
      if (names.has(k)) return { o, k, v };
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return null;
}
for (const name of ["nukerInWindow", "towerOnly", "deepBudget", "boundHeld", "floorGated", "shallowNow", "baseOverGated", "uselessCut", "coveredDetourDeclared", "digRoads", "fillerTiles", "servedExts"]) {
  const hit = plans.find((p) => {
    const g = grabDeep(p, new Set([name]));
    if (!g) return false;
    if (typeof g.v === "number") return g.v !== 0;
    if (typeof g.v === "boolean") return g.v === true;
    if (Array.isArray(g.v)) return g.v.length > 0;
    return false;
  });
  if (!hit) {
    rec({ name: "PRESENCE2-" + name, room: "-", status: "SKIP", detail: "no truthy" });
    continue;
  }
  rec(run("PRESENCE2-" + name + "-flattered", hit.room, (p) => {
    const g = grabDeep(p, new Set([name]));
    if (typeof g.v === "number") g.o[g.k] = 0;
    else if (typeof g.v === "boolean") g.o[g.k] = false;
    else if (Array.isArray(g.v)) g.o[g.k] = [];
  }));
}

fs.writeFileSync(path.join(DIR, "followup.json"), JSON.stringify({ fatCensus, results }, null, 2));
console.log(JSON.stringify({
  n: results.length,
  bites: results.filter((r) => r.status === "BITES").length,
  escapes: results.filter((r) => r.status === "ESCAPE").length,
  escapeNames: results.filter((r) => r.status === "ESCAPE").map((r) => r.name),
}, null, 2));
