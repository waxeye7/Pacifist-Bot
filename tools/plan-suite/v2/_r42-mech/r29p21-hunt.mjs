/**
 * r29p21: confirm baseLap 172/172 freeze-cut walk; hunt leftover META_DARK
 * presence for independent board walks. Throwaway. Never writes the artifact.
 */
import { META_DARK } from "../r27-gates.mjs";
import { loadPlans, loadRooms, K, D8, D4, idx } from "./common.mjs";
import { walkable, buildable, exteriorFlood } from "../shared.mjs";
import { interiorWalk, maskFromKeys, mobilityStats, BUILT_OBSTACLES } from "../layer-shell.mjs";

const { plans } = loadPlans();
const { byRoom } = loadRooms();

const PRESENCE = Object.entries(META_DARK)
  .filter(([, v]) => v.klass === "presence")
  .map(([k]) => k);

function freezeCut(p) {
  const sh = p.meta?.shell || {};
  return Array.isArray(sh.cutAtFreeze) && sh.cutAtFreeze.length ? sh.cutAtFreeze : sh.cut || [];
}
function objectTiles(p) {
  const s = new Set();
  for (const src of p.sources || []) s.add(K(src));
  if (p.controller) s.add(K(p.controller));
  if (p.mineral) s.add(K(p.mineral));
  return s;
}
function wantLayer5(terrain, p) {
  const cut = freezeCut(p);
  if (!cut.length || !p.sitter) return null;
  const cutSet = new Set(cut.map(K));
  const ext = exteriorFlood(terrain, cutSet);
  const blocked = new Set(objectTiles(p));
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

function grab(p, name) {
  const hits = [];
  const stack = [{ o: p.meta, path: "meta" }];
  while (stack.length) {
    const { o, path } = stack.pop();
    if (!o || typeof o !== "object") continue;
    if (Array.isArray(o)) {
      o.forEach((e, i) => stack.push({ o: e, path: `${path}[${i}]` }));
      continue;
    }
    for (const [k, v] of Object.entries(o)) {
      if (k === name) hits.push({ path: `${path}.${k}`, v });
      if (v && typeof v === "object") stack.push({ o: v, path: `${path}.${k}` });
    }
  }
  return hits;
}

function score(label, rows) {
  let have = 0;
  let match = 0;
  const miss = [];
  for (const r of rows) {
    if (!r) continue;
    have++;
    if (r.ok) match++;
    else if (miss.length < 4) miss.push(r.miss);
  }
  return { label, have, match, missN: have - match, miss };
}

const results = {};

// --- baseLap / other copies of the freeze-cut lap ---
{
  const rows = { veto: [], nuker: [], observer: [], labs: [], towers: [], repair: [] };
  for (const p of plans) {
    const d = byRoom.get(p.room);
    if (!d) continue;
    const st = wantLayer5(d.terrain, p);
    if (!st) continue;
    const mv = p.meta?.misc?.mobilityVeto || {};
    if (typeof mv.baseLap === "number") {
      rows.veto.push({
        ok: Math.abs(mv.baseLap - st.maxGated) < 1e-9,
        miss: { room: p.room, got: mv.baseLap, want: st.maxGated },
      });
    }
    const nk = mv.nuker;
    if (nk && typeof nk.baseLap === "number") {
      rows.nuker.push({
        ok: Math.abs(nk.baseLap - st.maxGated) < 1e-9,
        miss: { room: p.room, got: nk.baseLap, want: st.maxGated },
      });
    }
    const ob = mv.observer;
    if (ob && typeof ob.baseLap === "number") {
      rows.observer.push({
        ok: Math.abs(ob.baseLap - st.maxGated) < 1e-9,
        miss: { room: p.room, got: ob.baseLap, want: st.maxGated },
      });
    }
    const lv = p.meta?.labs?.lapVeto;
    if (lv && typeof lv.baseLap === "number") {
      rows.labs.push({
        ok: Math.abs(lv.baseLap - st.maxGated) < 1e-9,
        miss: { room: p.room, got: lv.baseLap, want: st.maxGated },
      });
    }
    const tv = p.meta?.towers?.mobilityVeto;
    if (tv && typeof tv.baseLap === "number") {
      rows.towers.push({
        ok: Math.abs(tv.baseLap - st.maxGated) < 1e-9,
        miss: { room: p.room, got: tv.baseLap, want: st.maxGated },
      });
    }
    const rp = p.meta?.walls?.mobility?.repair?.tower;
    if (rp && typeof rp.baseLap === "number") {
      rows.repair.push({
        ok: Math.abs(rp.baseLap - st.maxGated) < 1e-9,
        miss: { room: p.room, got: rp.baseLap, want: st.maxGated },
      });
    }
  }
  results.baseLap = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, score(k, v)]));
}

// --- leftover presence snapshots ---
const snap = {};
for (const name of PRESENCE) {
  const hist = {};
  let have = 0;
  const paths = new Set();
  const sample = [];
  for (const p of plans) {
    const hits = grab(p, name);
    if (!hits.length) continue;
    have++;
    for (const h of hits) paths.add(h.path);
    const v = hits[0].v;
    const key =
      typeof v === "number" || typeof v === "boolean"
        ? String(v)
        : Array.isArray(v)
          ? `arr${v.length}`
          : v && typeof v === "object"
            ? `obj:${Object.keys(v).slice(0, 6).join(",")}`
            : typeof v;
    hist[key] = (hist[key] || 0) + 1;
    if (sample.length < 1) {
      sample.push({
        room: p.room,
        n: hits.length,
        paths: hits.map((h) => h.path),
        v: Array.isArray(v)
          ? { n: v.length, head: v.slice(0, 2) }
          : v && typeof v === "object"
            ? Object.fromEntries(Object.entries(v).slice(0, 8))
            : v,
      });
    }
  }
  snap[name] = { have, hist, paths: [...paths], sample };
}
results.snap = Object.fromEntries(
  Object.entries(snap).map(([k, v]) => [k, { have: v.have, hist: v.hist, paths: v.paths, sample: v.sample[0] }]),
);

// --- leftover identities ---
function T(name, pred) {
  let have = 0;
  let match = 0;
  const miss = [];
  const nm = name.split("::")[0];
  for (const p of plans) {
    const hits = grab(p, nm);
    if (!hits.length) continue;
    have++;
    if (pred(p, hits)) match++;
    else if (miss.length < 3) {
      miss.push({
        room: p.room,
        v: hits.slice(0, 2).map((h) => ({
          path: h.path,
          v: Array.isArray(h.v) ? `arr${h.v.length}` : h.v && typeof h.v === "object" ? Object.keys(h.v) : h.v,
        })),
      });
    }
  }
  return [name, { have, match, missN: have - match, miss }];
}

const ids = [];

ids.push(T("inertPromoted::eq-cutAdopted-len", (p, hits) => {
  const v = hits[0].v;
  const n = (p.meta?.shell?.cutAdopted || []).length;
  return typeof v === "number" ? v === n : Array.isArray(v) && v.length === n;
}));
ids.push(T("inertPromoted::eq-drift-adds", (p, hits) => {
  const v = hits[0].v;
  const n = (p.meta?.shell?.cutDrift || []).filter((r) => r && r.op === "add").length;
  return typeof v === "number" ? v === n : Array.isArray(v) && v.length === n;
}));
ids.push(T("inertPromoted::eq-inertPruned", (p, hits) => {
  const v = hits[0].v;
  const ip = p.meta?.shell?.inertPruned;
  const n = Array.isArray(ip) ? ip.length : typeof p.meta?.walls?.inertPruned === "number" ? p.meta.walls.inertPruned : 0;
  return typeof v === "number" ? v === n : Array.isArray(v) && v.length === n;
}));
ids.push(T("inertPromoted::eq-drift-removes", (p, hits) => {
  const v = hits[0].v;
  const n = (p.meta?.shell?.cutDrift || []).filter((r) => r && r.op === "remove").length;
  return typeof v === "number" ? v === n : Array.isArray(v) && v.length === n;
}));

ids.push(T("stubExhausted::stubRoads-ge-stubCap", (p, hits) => {
  const v = hits[0].v;
  const roads = p.meta?.extensions?.stubRoads;
  const cap = p.meta?.extensions?.stubCap;
  if (typeof roads !== "number" || typeof cap !== "number") return false;
  return !!v === roads >= cap;
}));
ids.push(T("stubExhausted::iff-shallow", (p, hits) => !!hits[0].v === (p.meta?.extensions?.shallow || 0) > 0));
ids.push(T("stubExhausted::iff-fallback", (p, hits) => !!hits[0].v === (p.meta?.extensions?.corridorFallback || 0) > 0));

ids.push(T("deepExhausted::iff-shallow", (p, hits) => !!hits[0].v === (p.meta?.extensions?.shallow || 0) > 0));
ids.push(T("deepExhausted::iff-fallback", (p, hits) => !!hits[0].v === (p.meta?.extensions?.corridorFallback || 0) > 0));
ids.push(T("deepExhausted::iff-stub", (p, hits) => !!hits[0].v === !!p.meta?.extensions?.stubExhausted));
ids.push(T("deepExhausted::iff-freeLeft0", (p, hits) => {
  const left = p.meta?.extensions?.reflow?.freeLeft ?? p.meta?.walls?.reflow?.freeLeft ?? p.meta?.extensions?.freeLeft;
  return !!hits[0].v === (left === 0);
}));

ids.push(T("freeLeft::eq-search-left", (p, hits) => {
  const left = p.meta?.extensions?.reflow?.search?.left ?? p.meta?.walls?.reflow?.search?.left;
  return typeof hits[0].v === "number" && hits[0].v === left;
}));
ids.push(T("freeLeft::eq-reflow-freeLeft", (p, hits) => {
  const left = p.meta?.extensions?.reflow?.freeLeft ?? p.meta?.walls?.reflow?.freeLeft;
  return typeof hits[0].v === "number" && hits[0].v === left;
}));

ids.push(T("digRoads::eq-roads-on-wall", (p, hits) => {
  const d = byRoom.get(p.room);
  if (!d || typeof hits[0].v !== "number") return false;
  let n = 0;
  for (const r of p.structures?.road || []) {
    if (!walkable(d.terrain, r.x, r.y)) n++;
  }
  return hits[0].v === n;
}));
ids.push(T("digRoads::eq-roads-on-cut", (p, hits) => {
  const cut = new Set((p.meta?.shell?.cut || []).map(K));
  let n = 0;
  for (const r of p.structures?.road || []) if (cut.has(K(r))) n++;
  return hits[0].v === n;
}));
ids.push(T("digRoads::eq-roads-on-freeze", (p, hits) => {
  const cut = new Set(freezeCut(p).map(K));
  let n = 0;
  for (const r of p.structures?.road || []) if (cut.has(K(r))) n++;
  return hits[0].v === n;
}));
ids.push(T("digRoads::eq-roadRampart-crossing", (p, hits) => {
  const rr = p.meta?.walls?.roadRampart;
  return typeof hits[0].v === "number" && rr && hits[0].v === (rr.crossing || 0);
}));
ids.push(T("digRoads::eq-layer5-tags", (p, hits) => {
  let n = 0;
  for (const x of Object.values(p.meta?.roadLayer || {})) if (x === 5) n++;
  return hits[0].v === n;
}));
ids.push(T("digRoads::eq-layer6-wall", (p, hits) => {
  const d = byRoom.get(p.room);
  if (!d || typeof hits[0].v !== "number") return false;
  let n = 0;
  for (const [k, v] of Object.entries(p.meta?.roadLayer || {})) {
    if (v !== 6) continue;
    const [x, y] = k.split(",").map(Number);
    if (!walkable(d.terrain, x, y)) n++;
  }
  return hits[0].v === n;
}));
ids.push(T("digRoads::eq-road+rampart-on-wall", (p, hits) => {
  const d = byRoom.get(p.room);
  if (!d || typeof hits[0].v !== "number") return false;
  const ramps = new Set((p.structures?.rampart || []).map(K));
  let n = 0;
  for (const r of p.structures?.road || []) {
    if (!walkable(d.terrain, r.x, r.y) && ramps.has(K(r))) n++;
  }
  return hits[0].v === n;
}));

ids.push(T("shallowRamparts::eq-shallow-ext-ramparts", (p, hits) => {
  const arr = hits.find((h) => Array.isArray(h.v))?.v;
  if (!arr) return false;
  const d = byRoom.get(p.room);
  if (!d) return false;
  const cut = new Set((p.meta?.shell?.cut || []).map(K));
  const ramps = new Set((p.structures?.rampart || []).map(K));
  const depthSafe = 4;
  const freeze = freezeCut(p);
  const ext = exteriorFlood(d.terrain, new Set(freeze.map(K)));
  const depth = new Int16Array(2500).fill(999);
  const q = [];
  for (let i = 0; i < 2500; i++) if (ext[i]) { depth[i] = 0; q.push(i); }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % 50;
    const y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = idx(nx, ny);
      if (depth[ni] <= depth[i] + 1) continue;
      depth[ni] = depth[i] + 1;
      q.push(ni);
    }
  }
  const want = [];
  for (const e of p.structures?.extension || []) {
    if (!e || !Number.isInteger(e.x)) continue;
    const k = K(e);
    if (ramps.has(k) && !cut.has(k) && depth[idx(e.x, e.y)] < depthSafe) want.push(k);
  }
  want.sort();
  const got = arr.filter((t) => t && Number.isInteger(t.x)).map(K).sort();
  return got.join("|") === want.join("|");
}));
ids.push(T("shallowRamparts::len-eq-extensions.shallow", (p, hits) => {
  const arr = hits.find((h) => Array.isArray(h.v))?.v;
  if (!arr) return typeof hits[0].v === "number" && hits[0].v === (p.meta?.extensions?.shallow || 0);
  return arr.length === (p.meta?.extensions?.shallow || 0);
}));

ids.push(T("haulCost::eq-labs-haul", (p, hits) => typeof hits[0].v === "number" && hits[0].v === p.meta?.labs?.haul));
ids.push(T("haulCost::eq-nuker-delta", (p, hits) => {
  const nk = p.meta?.misc?.mobilityVeto?.nuker;
  return typeof hits[0].v === "number" && nk && hits[0].v === nk.haulCost;
}));

ids.push(T("worstCase::eq-floorGated", (p, hits) => {
  const fg = p.meta?.walls?.mobility?.floorGated;
  return typeof hits[0].v === "number" && typeof fg === "number" && Math.abs(hits[0].v - fg) < 1e-9;
}));
ids.push(T("worstCase::eq-maxGated", (p, hits) => {
  const mg = p.meta?.walls?.mobility?.maxGated;
  return typeof hits[0].v === "number" && typeof mg === "number" && Math.abs(hits[0].v - mg) < 1e-9;
}));
ids.push(T("worstCase::eq-boundLap", (p, hits) => {
  const b = p.meta?.walls?.mobility?.boundLap ?? p.meta?.extensions?.laneMeta?.boundLap;
  return typeof hits[0].v === "number" && typeof b === "number" && Math.abs(hits[0].v - b) < 1e-9;
}));
ids.push(T("worstCaseUngated::eq-floorUngated", (p, hits) => {
  const fu = p.meta?.extensions?.laneMeta?.floorUngated ?? p.meta?.walls?.mobility?.lanes?.floorUngated;
  return typeof hits[0].v === "number" && typeof fu === "number" && Math.abs(hits[0].v - fu) < 1e-9;
}));
ids.push(T("worstCaseUngated::eq-boundedUngated", (p, hits) => {
  const b = p.meta?.extensions?.laneMeta?.boundedUngated ?? p.meta?.walls?.mobility?.lanes?.boundedUngated;
  return typeof hits[0].v === "number" && typeof b === "number" && Math.abs(hits[0].v - b) < 1e-9;
}));

ids.push(T("deepBudget::const-8", (p, hits) => hits[0].v === 8));
ids.push(T("deepBudget::eq-lane-deep", (p, hits) => hits[0].v === p.meta?.extensions?.laneMeta?.deep));
ids.push(T("deepBudget::eq-lane-tiles", (p, hits) => hits[0].v === p.meta?.extensions?.laneMeta?.tiles));

ids.push(T("strandedFirst::eq-conduct-stranded-len", (p, hits) => {
  const st = p.meta?.walls?.conductBridge?.stranded;
  const n = Array.isArray(st) ? st.length : 0;
  const v = hits[0].v;
  return typeof v === "number" ? v === n : v && st && st[0] && K(v) === K(st[0]);
}));
ids.push(T("unsealed::eq-lane-unsealed", (p, hits) => {
  const u = p.meta?.extensions?.laneMeta?.unsealed ?? p.meta?.walls?.mobility?.lanes?.unsealed;
  return typeof hits[0].v === "number" && hits[0].v === u;
}));

ids.push(T("rescuedTo::eq-reflow-moved-to", (p, hits) => {
  const v = hits[0].v;
  const moved = p.meta?.extensions?.reflow?.moved || p.meta?.walls?.reflow?.moved || [];
  if (!v || !Number.isInteger(v.x)) return moved.length === 0;
  return moved.some((m) => m?.to && K(m.to) === K(v));
}));
ids.push(T("rolledBackFrom::eq-reflow-boundRollback", (p, hits) => {
  const v = hits[0].v;
  const br = p.meta?.extensions?.reflow?.boundRollback || p.meta?.walls?.reflow?.boundRollback || [];
  if (!v || !Number.isInteger(v.x)) return br.length === 0;
  return br.some((b) => b && (K(b) === K(v) || (b.to && K(b.to) === K(v)) || (b.from && K(b.from) === K(v))));
}));
ids.push(T("rescuedLap::eq-reflow-lap", (p, hits) => {
  const lap = p.meta?.extensions?.reflow?.lap ?? p.meta?.walls?.reflow?.lap ?? p.meta?.walls?.mobility?.maxGated;
  return typeof hits[0].v === "number" && typeof lap === "number" && Math.abs(hits[0].v - lap) < 1e-9;
}));

ids.push(T("budgetSpent::false", (p, hits) => !hits[0].v));
ids.push(T("boundRederived::false-or-empty", (p, hits) => {
  const v = hits[0].v;
  return v == null || v === false || v === 0 || (Array.isArray(v) && !v.length);
}));
ids.push(T("paveRetired::empty", (p, hits) => {
  const v = hits[0].v;
  return v == null || v === false || v === 0 || (Array.isArray(v) && !v.length);
}));
ids.push(T("uselessCut::empty", (p, hits) => {
  const v = hits[0].v;
  return Array.isArray(v) ? v.length === 0 : !v;
}));
ids.push(T("uselessCut::eq-redundant-tiles", (p, hits) => {
  const v = hits[0].v;
  const rc = p.meta?.shell?.redundantCut;
  const n = rc?.tiles ?? (Array.isArray(rc) ? rc.length : 0);
  return Array.isArray(v) ? v.length === n : v === n;
}));

ids.push(T("searchedSeats::eq-offer-seats", (p, hits) => hits[0].v === p.meta?.towers?.towerSwapOffer?.seats));
ids.push(T("faceAndSatHeld::eq-offer-scanned", (p, hits) => hits[0].v === p.meta?.towers?.towerSwapOffer?.scanned));
ids.push(T("priceProven::eq-offer-price", (p, hits) => hits[0].v === p.meta?.towers?.towerSwapOffer?.price));

ids.push(T("rescueSpent::eq-0", (p, hits) => hits[0].v === 0 || hits[0].v === false));
ids.push(T("mobilityRepair::empty-or-false", (p, hits) => {
  const v = hits[0].v;
  return v == null || v === false || v === 0 || (typeof v === "object" && v.ran === false);
}));

results.ids = Object.fromEntries(ids);
results.hits172 = Object.entries(results.ids)
  .filter(([, v]) => v.have >= 10 && v.match === v.have)
  .map(([k, v]) => ({ k, have: v.have, match: v.match }));
results.near = Object.entries(results.ids)
  .filter(([, v]) => v.have >= 10 && v.match / v.have >= 0.85)
  .sort((a, b) => b[1].match / b[1].have - a[1].match / a[1].have)
  .map(([k, v]) => ({ k, have: v.have, match: v.match, missN: v.missN, miss: v.miss }));

console.log(JSON.stringify(results, null, 2));
