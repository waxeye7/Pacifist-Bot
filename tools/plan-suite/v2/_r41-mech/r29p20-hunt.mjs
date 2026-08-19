/**
 * r29p20 leftover-presence identity hunt. Throwaway. Never writes the artifact.
 */
import { META_DARK } from "../r27-gates.mjs";
import { loadPlans, loadRooms, K, D8, D4, cheb } from "./common.mjs";
import { walkable, buildable, exteriorFlood } from "../shared.mjs";

const { plans } = loadPlans();
const { byRoom } = loadRooms();
const PRESENCE = Object.entries(META_DARK)
  .filter(([, v]) => v.klass === "presence")
  .map(([k]) => k);

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

function score(name, pred) {
  let match = 0;
  let have = 0;
  const miss = [];
  for (const p of plans) {
    const hits = grab(p, name);
    if (!hits.length) continue;
    have++;
    const ok = pred(p, hits);
    if (ok) match++;
    else if (miss.length < 5) {
      miss.push({
        room: p.room,
        hits: hits.slice(0, 3).map((h) => ({
          path: h.path,
          t: Array.isArray(h.v) ? `arr${h.v.length}` : typeof h.v,
          v: Array.isArray(h.v)
            ? h.v.slice(0, 2)
            : h.v && typeof h.v === "object"
              ? Object.keys(h.v).slice(0, 8)
              : h.v,
        })),
      });
    }
  }
  return { have, match, missN: have - match, miss };
}

const T = (name, pred) => [name, score(name.split("::")[0], pred)];
const results = {};

// --- value snapshots ---
const snap = {};
for (const name of PRESENCE) {
  const hist = {};
  let have = 0;
  const sample = [];
  for (const p of plans) {
    const hits = grab(p, name);
    if (!hits.length) continue;
    have++;
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
    if (sample.length < 2) {
      sample.push({
        room: p.room,
        n: hits.length,
        paths: hits.map((h) => h.path),
        v: Array.isArray(v)
          ? { n: v.length, head: v.slice(0, 2) }
          : v && typeof v === "object"
            ? v
            : v,
      });
    }
  }
  snap[name] = { have, hist, sample };
}
results.snap = snap;

// --- identities ---
const ids = [];

ids.push(T("inertPromoted::eq-cutAdopted-len", (p, hits) => {
  const v = hits[0].v;
  const n = (p.meta?.shell?.cutAdopted || []).length;
  return typeof v === "number" ? v === n : Array.isArray(v) && v.length === n;
}));
ids.push(T("inertPromoted::iff-adopt", (p, hits) => {
  const v = hits[0].v;
  const n = (p.meta?.shell?.cutAdopted || []).length;
  const truthy = typeof v === "number" ? v > 0 : Array.isArray(v) ? v.length > 0 : !!v;
  return truthy === (n > 0);
}));
ids.push(T("inertPromoted::eq-drift-adds", (p, hits) => {
  const v = hits[0].v;
  const n = (p.meta?.shell?.cutDrift || []).filter((r) => r && r.op === "add").length;
  return typeof v === "number" ? v === n : Array.isArray(v) && v.length === n;
}));
ids.push(T("inertPromoted::eq-inertPruned-len", (p, hits) => {
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
  return !!v === (roads >= cap);
}));
ids.push(T("stubExhausted::layer6-tags-ge-stubCap", (p, hits) => {
  const v = hits[0].v;
  let n = 0;
  for (const x of Object.values(p.meta?.roadLayer || {})) if (x === 6) n++;
  const cap = p.meta?.extensions?.stubCap;
  if (typeof cap !== "number") return false;
  return !!v === (n >= cap);
}));

ids.push(T("freeLeft::formula-faced-spent", (p, hits) => {
  const v = hits[0].v;
  const rf = p.meta?.extensions?.reflow?.search || p.meta?.walls?.reflow?.search;
  if (!rf || typeof v !== "number") return false;
  const want = Math.max(0, (rf.freeDeepRoadFaced || 0) - (rf.spentOnAdds || 0) - (rf.spentOnMoves || 0));
  return v === want || v === rf.left;
}));
ids.push(T("freeLeft::eq-search-left", (p, hits) => {
  const v = hits[0].v;
  const left = p.meta?.extensions?.reflow?.search?.left ?? p.meta?.walls?.reflow?.search?.left;
  return typeof v === "number" && v === left;
}));

ids.push(T("shallowRamparts::empty-iff-no-shallow", (p, hits) => {
  const arr = hits.find((h) => Array.isArray(h.v))?.v;
  if (!arr) return hits.every((h) => h.v == null || h.v === 0 || (Array.isArray(h.v) && !h.v.length));
  const shallow = p.meta?.extensions?.shallow || 0;
  return (arr.length === 0) === (shallow === 0);
}));
ids.push(T("shallowRamparts::eq-shallow-ext-ramparts", (p, hits) => {
  const arr = hits.find((h) => Array.isArray(h.v))?.v;
  if (!arr) return false;
  const d = byRoom.get(p.room);
  if (!d) return false;
  const cut = new Set((p.meta?.shell?.cut || []).map(K));
  const ramps = new Set((p.structures?.rampart || []).map(K));
  const want = [];
  for (const e of p.structures?.extension || []) {
    if (!e || !Number.isInteger(e.x)) continue;
    const k = K(e);
    if (ramps.has(k) && !cut.has(k)) want.push(k);
  }
  want.sort();
  const got = arr.filter((t) => t && Number.isInteger(t.x)).map(K).sort();
  return got.join("|") === want.join("|");
}));

ids.push(T("digRoads::eq-layer5-tags", (p, hits) => {
  const v = hits[0].v;
  let n = 0;
  for (const x of Object.values(p.meta?.roadLayer || {})) if (x === 5) n++;
  return v === n;
}));
ids.push(T("digRoads::eq-roads-on-wall-terrain", (p, hits) => {
  const v = hits[0].v;
  const d = byRoom.get(p.room);
  if (!d || typeof v !== "number") return false;
  let n = 0;
  for (const r of p.structures?.road || []) {
    if (!walkable(d.terrain, r.x, r.y)) n++;
  }
  return v === n;
}));
ids.push(T("digRoads::eq-roads-on-cut", (p, hits) => {
  const v = hits[0].v;
  const cut = new Set((p.meta?.shell?.cut || []).map(K));
  let n = 0;
  for (const r of p.structures?.road || []) if (cut.has(K(r))) n++;
  return v === n;
}));
ids.push(T("digRoads::eq-roadRampart-crossing", (p, hits) => {
  const v = hits[0].v;
  const rr = p.meta?.walls?.roadRampart;
  return typeof v === "number" && rr && v === (rr.crossing || 0);
}));

ids.push(T("deepExhausted::iff-shallow-and-not-stub", (p, hits) => {
  const v = hits[0].v;
  const sh = p.meta?.extensions?.shallow || 0;
  const stub = p.meta?.extensions?.stubExhausted;
  return !!v === (sh > 0 && !stub);
}));
ids.push(T("deepExhausted::iff-corridorFallback", (p, hits) => {
  const v = hits[0].v;
  return !!v === ((p.meta?.extensions?.corridorFallback || 0) > 0);
}));
ids.push(T("deepExhausted::iff-shallow", (p, hits) => {
  return !!hits[0].v === ((p.meta?.extensions?.shallow || 0) > 0);
}));

ids.push(T("baseOverGated::eq-floorOverGated", (p, hits) => {
  const v = hits[0].v;
  const fog = p.meta?.walls?.mobility?.floorOverGated;
  return typeof v === "number" && v === fog;
}));
ids.push(T("baseOverGated::eq-overGated", (p, hits) => {
  const v = hits[0].v;
  const og = p.meta?.walls?.mobility?.overGated;
  return typeof v === "number" && v === og;
}));
ids.push(T("baseOverGated::eq-lift-overGated", (p, hits) => {
  const v = hits[0].v;
  const og = p.meta?.walls?.mobility?.lift?.overGated ?? p.meta?.walls?.mobility?.massFree?.overGated;
  return typeof v === "number" && v === og;
}));

ids.push(T("wasLap::eq-maxGated", (p, hits) => {
  const v = hits[0].v;
  const mg = p.meta?.walls?.mobility?.maxGated;
  return typeof v === "number" && Math.abs(v - mg) < 1e-9;
}));
ids.push(T("wasLap::eq-floorGated", (p, hits) => {
  const v = hits[0].v;
  const fg = p.meta?.walls?.mobility?.floorGated;
  return typeof v === "number" && Math.abs(v - fg) < 1e-9;
}));

ids.push(T("haulCost::eq-labs-haul", (p, hits) => {
  const v = hits[0].v;
  const h = p.meta?.labs?.haul;
  return typeof v === "number" && v === h;
}));
ids.push(T("haulCost::eq-nukerHubDist-delta", (p, hits) => {
  const v = hits[0].v;
  const nd = p.meta?.misc?.nukerHubDist;
  return typeof v === "number" && typeof nd === "number" && v === nd;
}));

ids.push(T("strandedFirst::eq-conduct-stranded-len", (p, hits) => {
  const v = hits[0].v;
  const st = p.meta?.walls?.conductBridge?.stranded;
  const n = Array.isArray(st) ? st.length : 0;
  return typeof v === "number" ? v === n : v && st && st[0] && K(v) === K(st[0]);
}));
ids.push(T("unsealed::eq-strandedFirst-minus-stranded", (p, hits) => {
  const v = hits[0].v;
  const lm = p.meta?.extensions?.laneMeta || {};
  const want = (lm.strandedFirst ?? 0) - (lm.stranded ?? 0);
  return typeof v === "number" && v === want;
}));

ids.push(T("worstCase::eq-bounded", (p, hits) => {
  const v = hits[0].v;
  const b = p.meta?.extensions?.laneMeta?.bounded ?? p.meta?.walls?.mobility?.lanes?.bounded;
  return typeof v === "number" && typeof b === "number" && Math.abs(v - b) < 1e-9;
}));
ids.push(T("worstCase::eq-maxGated", (p, hits) => {
  const v = hits[0].v;
  const mg = p.meta?.walls?.mobility?.maxGated;
  return typeof v === "number" && typeof mg === "number" && Math.abs(v - mg) < 1e-9;
}));
ids.push(T("worstCaseUngated::eq-boundedUngated", (p, hits) => {
  const v = hits[0].v;
  const b = p.meta?.extensions?.laneMeta?.boundedUngated ?? p.meta?.walls?.mobility?.lanes?.boundedUngated;
  return typeof v === "number" && typeof b === "number" && Math.abs(v - b) < 1e-9;
}));

ids.push(T("deepBudget::eq-lane-deep", (p, hits) => {
  const v = hits[0].v;
  const d = p.meta?.extensions?.laneMeta?.deep;
  return typeof v === "number" && v === d;
}));
ids.push(T("deepBudget::const-8", (p, hits) => hits[0].v === 8));
ids.push(T("deepBudget::eq-tiles", (p, hits) => {
  const v = hits[0].v;
  const t = p.meta?.extensions?.laneMeta?.tiles;
  return typeof v === "number" && v === t;
}));

ids.push(T("searchedSeats::eq-offer-seats", (p, hits) => {
  const v = hits[0].v;
  const seats = p.meta?.towers?.towerSwapOffer?.seats;
  return typeof v === "number" && v === seats;
}));
ids.push(T("faceAndSatHeld::eq-offer-scanned-subset", (p, hits) => {
  const v = hits[0].v;
  const sc = p.meta?.towers?.towerSwapOffer?.scanned;
  return typeof v === "number" && typeof sc === "number" && v <= sc;
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

ids.push(T("paveRetired::empty", (p, hits) => {
  const v = hits[0].v;
  return v == null || v === false || v === 0 || (Array.isArray(v) && !v.length);
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

ids.push(T("budgetSpent::false", (p, hits) => !hits[0].v));
ids.push(T("boundRederived::false-or-empty", (p, hits) => {
  const v = hits[0].v;
  return v == null || v === false || v === 0 || (Array.isArray(v) && !v.length);
}));
ids.push(T("causeFirst::empty", (p, hits) => !hits[0].v));
ids.push(T("cleanAnchor::empty", (p, hits) => !hits[0].v));
ids.push(T("lapVeto::empty", (p, hits) => !hits[0].v));
ids.push(T("mobilityRepair::empty-or-false", (p, hits) => {
  const v = hits[0].v;
  return v == null || v === false || v === 0 || (typeof v === "object" && v.ran === false);
}));
ids.push(T("noAlternative::empty", (p, hits) => !hits[0].v));
ids.push(T("pickedBy::empty", (p, hits) => !hits[0].v));
ids.push(T("rescueSpent::empty", (p, hits) => !hits[0].v));
ids.push(T("tourRule::empty", (p, hits) => !hits[0].v));
ids.push(T("tradeCost::empty", (p, hits) => !hits[0].v));

// hubDistCap exact vs first rung covering maxHubDist
{
  const LADDER = [16, 19, 23, 999];
  let have = 0;
  let match = 0;
  const miss = [];
  for (const p of plans) {
    const cap = p.meta?.extensions?.hubDistCap;
    const mx = p.meta?.extensions?.maxHubDist;
    if (typeof cap !== "number" || typeof mx !== "number") continue;
    have++;
    const want = LADDER.find((r) => r >= mx);
    if (cap === want) match++;
    else if (miss.length < 6) miss.push({ room: p.room, cap, mx, want });
  }
  results.hubFirstRungMax = { have, match, missN: have - match, miss };
}

results.ids = Object.fromEntries(ids);

const hits172 = Object.entries(results.ids)
  .filter(([, v]) => v.have === 172 && v.match === 172)
  .map(([k, v]) => ({ k, ...v }));
const near = Object.entries(results.ids)
  .filter(([, v]) => v.have >= 10 && v.match / v.have >= 0.9)
  .sort((a, b) => b[1].match / b[1].have - a[1].match / a[1].have)
  .map(([k, v]) => ({ k, have: v.have, match: v.match, missN: v.missN, miss: v.miss }));

console.log(JSON.stringify({
  n: plans.length,
  presenceN: PRESENCE.length,
  hubFirstRungMax: results.hubFirstRungMax,
  hits172: hits172.map((h) => h.k),
  near,
  interesting: Object.fromEntries(
    Object.entries(results.ids)
      .filter(([k]) =>
        /inertPromoted|stubExhausted|freeLeft|shallowRamparts|digRoads|deepExhausted|baseOverGated|wasLap|haulCost|strandedFirst|unsealed|worstCase|deepBudget|searchedSeats|uselessCut|paveRetired|rescuedTo|rolledBackFrom/.test(k),
      )
      .map(([k, v]) => [k, { have: v.have, match: v.match, missN: v.missN, miss: v.miss }]),
  ),
  snapBrief: Object.fromEntries(
    Object.entries(snap).map(([k, v]) => [k, { have: v.have, hist: v.hist, paths: v.sample[0]?.paths, sampleRoom: v.sample[0]?.room }]),
  ),
}, null, 2));
