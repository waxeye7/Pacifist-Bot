/**
 * r29p19 leftover-presence identity hunt. Throwaway.
 */
import { META_DARK } from "../r27-gates.mjs";
import { loadPlans, loadRooms, K, D8, D4, cheb } from "./common.mjs";
import { walkable } from "../shared.mjs";

const { plans } = loadPlans();
const { byRoom } = loadRooms();
const PRESENCE = Object.entries(META_DARK)
  .filter(([, v]) => v.klass === "presence")
  .map(([k]) => k);

function grab(p, name) {
  const hits = [];
  const stack = [p.meta];
  while (stack.length) {
    const o = stack.pop();
    if (!o || typeof o !== "object") continue;
    if (Array.isArray(o)) {
      for (const e of o) stack.push(e);
      continue;
    }
    for (const [k, v] of Object.entries(o)) {
      if (k === name) hits.push(v);
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return hits;
}

function clustersOf(tiles) {
  const set = new Set(tiles.map(K));
  const seen = new Set();
  const cls = [];
  for (const t of tiles) {
    const k0 = K(t);
    if (seen.has(k0)) continue;
    seen.add(k0);
    const cl = [t];
    for (let i = 0; i < cl.length; i++) {
      for (const [dx, dy] of D8) {
        const k = `${cl[i].x + dx},${cl[i].y + dy}`;
        if (seen.has(k) || !set.has(k)) continue;
        seen.add(k);
        cl.push({ x: cl[i].x + dx, y: cl[i].y + dy });
      }
    }
    cls.push(cl);
  }
  return cls;
}

function touchesRoad(cl, roads) {
  for (const c of cl) {
    for (const [dx, dy] of D8) {
      if (roads.has(`${c.x + dx},${c.y + dy}`)) return true;
    }
  }
  return false;
}

const MIN_CLUSTER = 3; // guess; probe a few
const results = {};

function score(name, pred) {
  let match = 0;
  let have = 0;
  let miss = [];
  for (const p of plans) {
    const hits = grab(p, name);
    if (!hits.length) continue;
    have++;
    const ok = pred(p, hits);
    if (ok) match++;
    else if (miss.length < 6) miss.push({ room: p.room, hits: hits.slice(0, 2) });
  }
  results[name] = { have, match, missN: have - match, miss };
}

// servedExts == 0
score("servedExts", (p, hits) => hits.every((v) => v === 0));
score("unreachableExts", (p, hits) => hits.every((v) => v === 0));
score("unreachedClusters", (p, hits) => hits.every((v) => v === 0));

// unreachedClusters vs large unserved cut clusters (shipped roads)
for (const minC of [1, 2, 3, 4, 5]) {
  let match = 0;
  let have = 0;
  for (const p of plans) {
    const got = p.meta?.walls?.unreachedClusters;
    if (typeof got !== "number") continue;
    have++;
    const cut = p.meta?.shell?.cut || [];
    const roads = new Set((p.structures?.road || []).map(K));
    const n = clustersOf(cut.filter((t) => t && Number.isInteger(t.x))).filter(
      (cl) => cl.length >= minC && !touchesRoad(cl, roads),
    ).length;
    if (n === got) match++;
  }
  results[`unreachedClusters>=${minC}`] = { have, match };
}

// servedExts vs exts lacking pre-7 D4 road
{
  let match = 0;
  let have = 0;
  let miss = [];
  for (const p of plans) {
    const got = p.meta?.walls?.servedExts;
    if (typeof got !== "number") continue;
    have++;
    const rl = p.meta?.roadLayer || {};
    const pre = new Set();
    for (const [k, v] of Object.entries(rl)) if (v < 7) pre.add(k);
    // also roads with no layer tag?
    const allRoads = new Set((p.structures?.road || []).map(K));
    let n = 0;
    for (const e of p.structures?.extension || []) {
      const has = D4.some(([dx, dy]) => pre.has(`${e.x + dx},${e.y + dy}`));
      if (!has) n++;
    }
    if (n === got) match++;
    else if (miss.length < 4) miss.push({ room: p.room, got, n });
  }
  results.servedExts_pre7 = { have, match, miss };
}

// servedExts iff fillerTiles
{
  let match = 0;
  let have = 0;
  for (const p of plans) {
    const got = p.meta?.walls?.servedExts;
    const fill = p.meta?.walls?.fillerTiles;
    if (typeof got !== "number") continue;
    have++;
    if ((got === 0) === (fill === 0)) match++;
  }
  results.servedExts_iff_filler = { have, match };
}

// digRoads vs roads on wall terrain
{
  let match = 0;
  let have = 0;
  let miss = [];
  for (const p of plans) {
    const got = p.meta?.extensions?.digRoads;
    if (typeof got !== "number") continue;
    have++;
    const d = byRoom.get(p.room);
    if (!d) continue;
    const terrain = d.terrain;
    const cut = new Set((p.meta?.shell?.cut || []).map(K));
    let n = 0;
    for (const r of p.structures?.road || []) {
      if (!walkable(terrain, r.x, r.y) && !cut.has(K(r))) n++;
    }
    if (n === got) match++;
    else if (miss.length < 4) miss.push({ room: p.room, got, n });
  }
  results.digRoads_wallNotCut = { have, match, miss };
}

// digRoads vs roadKind tunnel / layer-5?
{
  const kinds = {};
  for (const p of plans) {
    const rk = p.meta?.walls?.roadKind || {};
    for (const v of Object.values(rk)) kinds[v] = (kinds[v] || 0) + 1;
  }
  results.roadKinds = kinds;
  let match = 0;
  let have = 0;
  let miss = [];
  for (const p of plans) {
    const got = p.meta?.extensions?.digRoads;
    if (typeof got !== "number") continue;
    have++;
    const rl = p.meta?.roadLayer || {};
    let n5 = 0;
    for (const v of Object.values(rl)) if (v === 5) n5++;
    if (n5 === got) match++;
    else if (miss.length < 3) miss.push({ room: p.room, got, n5 });
  }
  results.digRoads_layer5 = { have, match, miss };
}

// shallowRamparts empty?
{
  let empty = 0;
  let have = 0;
  let nonempty = [];
  for (const p of plans) {
    const hits = grab(p, "shallowRamparts");
    if (!hits.length) continue;
    have++;
    const arr = hits.find((v) => Array.isArray(v));
    if (arr && arr.length === 0) empty++;
    else if (nonempty.length < 4) nonempty.push({ room: p.room, n: arr?.length, sample: arr?.slice?.(0, 2) });
  }
  results.shallowRamparts_empty = { have, empty, nonempty };
}

// inertPromoted vs cutDrift removes
{
  let match = 0;
  let have = 0;
  let miss = [];
  for (const p of plans) {
    const hits = grab(p, "inertPromoted");
    if (!hits.length) continue;
    have++;
    const v = hits[0];
    const drift = p.meta?.shell?.cutDrift || [];
    const removes = drift.filter((r) => r && r.op === "remove").length;
    const inert = p.meta?.walls?.inertPruned;
    const eq =
      (typeof v === "number" && (v === removes || v === inert)) ||
      (Array.isArray(v) && v.length === removes);
    if (eq) match++;
    else if (miss.length < 4) miss.push({ room: p.room, v, removes, inert, t: typeof v });
  }
  results.inertPromoted = { have, match, miss };
}

// strandedFirst vs conductBridge.stranded[0]
{
  let match = 0;
  let have = 0;
  let miss = [];
  for (const p of plans) {
    const hits = grab(p, "strandedFirst");
    if (!hits.length) continue;
    have++;
    const v = hits[0];
    const st = p.meta?.walls?.conductBridge?.stranded;
    const first = Array.isArray(st) && st[0] ? st[0] : null;
    const eq = first && v && K(v) === K(first);
    if (eq || (v == null && !first)) match++;
    else if (miss.length < 4) miss.push({ room: p.room, v, first, stN: st?.length });
  }
  results.strandedFirst = { have, match, miss };
}

// haulCost vs labs.haul
{
  let match = 0;
  let have = 0;
  let miss = [];
  const sample = [];
  for (const p of plans) {
    const hits = grab(p, "haulCost");
    if (!hits.length) continue;
    have++;
    if (sample.length < 3) {
      sample.push({
        room: p.room,
        haulCost: hits[0],
        labsKeys: p.meta?.labs ? Object.keys(p.meta.labs) : [],
        haul: p.meta?.labs?.haul,
        score: p.meta?.labs?.score,
      });
    }
  }
  results.haulCost = { have, sample };
}

// cleanAnchor
{
  const sample = [];
  let have = 0;
  for (const p of plans) {
    const hits = grab(p, "cleanAnchor");
    if (!hits.length) continue;
    have++;
    if (sample.length < 3) {
      sample.push({ room: p.room, v: hits[0], labs: (p.structures?.lab || []).slice(0, 2) });
    }
  }
  results.cleanAnchor = { have, sample };
}

// spurred vs clusters touching spur-kind roads
{
  let match = 0;
  let have = 0;
  let miss = [];
  for (const p of plans) {
    const got = p.meta?.walls?.spurred;
    if (typeof got !== "number") continue;
    have++;
    const rk = p.meta?.walls?.roadKind || {};
    const spurR = new Set();
    for (const [k, v] of Object.entries(rk)) if (v === "spur") spurR.add(k);
    const cut = p.meta?.shell?.cut || [];
    const n = clustersOf(cut.filter((t) => t && Number.isInteger(t.x))).filter((cl) =>
      touchesRoad(cl, spurR),
    ).length;
    if (n === got) match++;
    else if (miss.length < 4) miss.push({ room: p.room, got, n, spurTiles: spurR.size });
  }
  results.spurred_kind = { have, match, miss };
}

// worstCase vs mobility
{
  const sample = [];
  for (const p of plans) {
    const hits = grab(p, "worstCase");
    if (!hits.length) continue;
    if (sample.length < 4) {
      sample.push({
        room: p.room,
        worstCase: hits,
        worstCaseUngated: grab(p, "worstCaseUngated"),
        worst: p.meta?.walls?.mobility?.worst,
        lane: p.meta?.extensions?.laneMeta,
      });
    }
  }
  results.worstCase = { sample };
}

// baseOverGated
{
  const sample = [];
  for (const p of plans) {
    const hits = grab(p, "baseOverGated");
    if (!hits.length) continue;
    if (sample.length < 4) {
      sample.push({
        room: p.room,
        v: hits,
        overGated: p.meta?.walls?.mobility?.overGated,
        floorOverGated: p.meta?.walls?.mobility?.floorOverGated,
        maxGated: p.meta?.walls?.mobility?.maxGated,
      });
    }
  }
  results.baseOverGated = { sample };
}

// freeLeft / deepBudget
{
  const sample = [];
  for (const p of plans) {
    const fl = grab(p, "freeLeft");
    const db = grab(p, "deepBudget");
    if (!fl.length && !db.length) continue;
    if (sample.length < 4) {
      sample.push({
        room: p.room,
        freeLeft: fl,
        deepBudget: db,
        deepTiles: p.meta?.shell?.deepTiles,
        shippedFree: p.meta?.shell?.shippedFreeDeep,
        negotiation: p.meta?.shell?.negotiationFreeDeep,
      });
    }
  }
  results.freeLeft = { sample };
}

// rolledBackFrom / rescuedTo / paveRetired
{
  const sample = [];
  for (const p of plans) {
    const a = grab(p, "rolledBackFrom");
    const b = grab(p, "rescuedTo");
    const c = grab(p, "paveRetired");
    if (!a.length && !b.length && !c.length) continue;
    if (sample.length < 5) {
      sample.push({
        room: p.room,
        rolledBackFrom: a,
        rescuedTo: b,
        paveRetired: c,
        reflow: p.meta?.walls?.reflow
          ? {
              added: p.meta.walls.reflow.added?.length,
              moved: p.meta.walls.reflow.moved?.length,
              retired: p.meta.walls.reflow.retired?.length,
              rolledBackFrom: p.meta.walls.reflow.rolledBackFrom,
            }
          : null,
      });
    }
  }
  results.reflowBits = { sample };
}

// digRoads hist
{
  const hist = {};
  for (const p of plans) {
    const v = p.meta?.extensions?.digRoads;
    hist[v] = (hist[v] || 0) + 1;
  }
  results.digRoadsHist = hist;
}

// leftover presence numeric hists for constants
const constish = {};
for (const name of PRESENCE) {
  const hist = {};
  let have = 0;
  for (const p of plans) {
    const hits = grab(p, name);
    if (!hits.length) continue;
    have++;
    const v = hits[0];
    const key =
      typeof v === "number" || typeof v === "boolean"
        ? String(v)
        : Array.isArray(v)
          ? `arr${v.length}`
          : v && typeof v === "object"
            ? `obj:${Object.keys(v).slice(0, 4).join(",")}`
            : typeof v;
    hist[key] = (hist[key] || 0) + 1;
  }
  constish[name] = { have, hist };
}
results.constish = constish;

console.log(JSON.stringify(results, null, 2));
