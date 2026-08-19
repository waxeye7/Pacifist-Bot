/**
 * r29p18 maxHubDist / leftover walk refine. Throwaway.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fieldFrom } from "../layer-hub.mjs";
import { D8, D4 } from "../shared.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.resolve(DIR, "../../out-v2/plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);
const rooms = JSON.parse(fs.readFileSync(process.env.ROOMS_FILE || path.resolve(DIR, "../_r28-mech/rooms.json"), "utf8"));
const byRoom = new Map(rooms.map((r) => [r.room, r]));
const K = (t) => `${t.x},${t.y}`;
const idx = (x, y) => x + y * 50;
const L6 = ["storage", "terminal", "link", "spawn", "container", "tower", "lab", "nuker", "observer"];
const INF = 999;

function T(name) {
  return { name, n: 0, ok: 0, bad: 0, samples: [] };
}
function hit(t, ok, sample) {
  t.n++;
  if (ok) t.ok++;
  else {
    t.bad++;
    if (t.samples.length < 8) t.samples.push(sample);
  }
}

function l6Field(terrain, p) {
  const occ = new Set();
  for (const t of L6) for (const q of p.structures?.[t] || []) occ.add(K(q));
  for (const src of p.sources || []) occ.add(K(src));
  if (p.controller) occ.add(K(p.controller));
  if (p.mineral) occ.add(K(p.mineral));
  return fieldFrom(terrain, p.sitter, occ);
}

function maxOf(hf, pts) {
  let mx = 0;
  for (const e of pts) {
    if (!e || !Number.isInteger(e.x)) continue;
    const v = hf[idx(e.x, e.y)];
    if (v < INF && v > mx) mx = v;
  }
  return mx;
}

function undoMoves(exts, moves, fromKey, toKey) {
  const set = new Map(exts.map((e) => [K(e), { x: e.x, y: e.y }]));
  for (const m of moves || []) {
    const from = fromKey(m);
    const to = toKey(m);
    if (!from || !to) continue;
    const tk = K(to);
    if (set.has(tk)) {
      set.delete(tk);
      set.set(K(from), { x: from.x, y: from.y });
    }
  }
  return [...set.values()];
}

const scores = {
  shippedSkip999: T("maxHub === L6 max shipped (skip 999)"),
  undoReloc: T("maxHub === L6 max undo relocated"),
  undoReflow: T("maxHub === L6 max undo reflow.moved"),
  undoBoth: T("maxHub === L6 max undo relocated+reflow"),
  undoReflowAdded: T("maxHub === L6 max undo reflow + drop added"),
  unionFroms: T("maxHub === L6 max shipped+reloc.from+reflow.from"),
  maxShippedOrFrom: T("maxHub === max(shipped, reloc.from, reflow.from)"),
  hubCapGeMax: T("hubDistCap >= maxHubDist"),
  hubCapGeWalk: T("hubDistCap >= L6 max shipped skip999"),
};

const dumps = [];
const mismatches = [];

for (const p of plans) {
  const d = byRoom.get(p.room);
  if (!d || !p.sitter) continue;
  const e = p.meta?.extensions || {};
  const got = e.maxHubDist;
  if (typeof got !== "number") continue;
  const hf = l6Field(d.terrain, p);
  const shipped = p.structures?.extension || [];
  const reloc = e.relocated || [];
  const moved = e.reflow?.moved || [];
  const added = e.reflow?.added || [];

  const mxShip = maxOf(hf, shipped);
  const undoR = undoMoves(shipped, reloc, (m) => m.from, (m) => m.to);
  const mxReloc = maxOf(hf, undoR);
  const undoF = undoMoves(shipped, moved, (m) => m.from, (m) => m.to);
  const mxReflow = maxOf(hf, undoF);
  const undoB = undoMoves(undoF, reloc, (m) => m.from, (m) => m.to);
  const mxBoth = maxOf(hf, undoB);

  const withoutAdded = shipped.filter((ex) => !added.some((a) => a && a.x === ex.x && a.y === ex.y));
  const undoFA = undoMoves(withoutAdded, moved, (m) => m.from, (m) => m.to);
  const mxFA = maxOf(hf, undoFA);

  const union = [
    ...shipped,
    ...reloc.map((m) => m.from),
    ...moved.map((m) => m.from),
  ];
  const mxUnion = maxOf(hf, union);
  const mxCombo = Math.max(mxShip, maxOf(hf, reloc.map((m) => m.from)), maxOf(hf, moved.map((m) => m.from)));

  hit(scores.shippedSkip999, got === mxShip, { room: p.room, got, mxShip });
  hit(scores.undoReloc, got === mxReloc, { room: p.room, got, mxReloc, n: reloc.length });
  hit(scores.undoReflow, got === mxReflow, { room: p.room, got, mxReflow, n: moved.length });
  hit(scores.undoBoth, got === mxBoth, { room: p.room, got, mxBoth });
  hit(scores.undoReflowAdded, got === mxFA, { room: p.room, got, mxFA, added: added.length });
  hit(scores.unionFroms, got === mxUnion, { room: p.room, got, mxUnion });
  hit(scores.maxShippedOrFrom, got === mxCombo, { room: p.room, got, mxCombo });
  hit(scores.hubCapGeMax, (e.hubDistCap || 0) >= got, { room: p.room, cap: e.hubDistCap, got });
  hit(scores.hubCapGeWalk, (e.hubDistCap || 0) >= mxShip, { room: p.room, cap: e.hubDistCap, mxShip });

  if (got !== mxShip && mismatches.length < 12) {
    mismatches.push({
      room: p.room,
      got,
      mxShip,
      mxReloc,
      mxReflow,
      mxBoth,
      mxFA,
      mxUnion,
      mxCombo,
      relocN: reloc.length,
      movedN: moved.length,
      addedN: added.length,
      relocSample: reloc.slice(0, 3),
      movedSample: moved.slice(0, 3).map((m) => ({
        from: m.from,
        to: m.to,
        reason: m.reason,
      })),
      take: !!p.meta?.composeOpts?.takeTowerSwap,
    });
  }

  if (["E11S7", "E2S5", "E5S3", "E9S7"].includes(p.room)) {
    dumps.push({
      room: p.room,
      got,
      cap: e.hubDistCap,
      shallow: e.shallow,
      relocN: reloc.length,
      movedN: moved.length,
      addedN: added.length,
      reflowKeys: e.reflow ? Object.keys(e.reflow) : [],
      moved0: moved[0],
      reloc0: reloc[0],
    });
  }
}

function line(t) {
  const flag = t.bad === 0 && t.ok ? "OK  " : t.n === 0 ? "SKIP" : `NO  ${t.ok}/${t.n}`;
  return `${String(flag).padEnd(18)} ${t.name}`;
}

console.log("=== dumps ===");
console.log(JSON.stringify(dumps, null, 2));
console.log("=== mismatches ===");
console.log(JSON.stringify(mismatches, null, 2));
console.log("\n--- scores ---");
for (const t of Object.values(scores)) {
  console.log(line(t), t.samples[0] ? JSON.stringify(t.samples[0]) : "");
}
