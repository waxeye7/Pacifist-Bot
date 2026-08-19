/**
 * r43 leftover META_DARK presence: fleet zeros / search witnesses vs still-
 * flippable evidence. No independent 172/172 board walk is claimed unless a
 * walk actually matches. Never writes the artifact.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { META_DARK } from "../r27-gates.mjs";
import { loadPlans, loadRooms, makeChecker, K, D8, D4 } from "./common.mjs";
import { walkable } from "../shared.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);

const PRESENCE = Object.entries(META_DARK)
  .filter(([, v]) => v.klass === "presence")
  .map(([k, v]) => ({ name: k, why: v.why || "" }));

function grabAll(p, name) {
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
      if (k === name) hits.push({ o, k, v, path: `${path}.${k}` });
      if (v && typeof v === "object") stack.push({ o: v, path: `${path}.${k}` });
    }
  }
  return hits;
}

function leafKind(v) {
  if (v == null) return "null";
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "string") return "string";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v.x) && Number.isInteger(v.y)) return "coord";
  return "object";
}

function isTruthy(v) {
  if (typeof v === "number") return v !== 0;
  if (typeof v === "boolean") return v === true;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === "object") {
    if (Number.isInteger(v.x) && Number.isInteger(v.y)) return true;
    return Object.keys(v).length > 0;
  }
  return false;
}

function flattenOne(g) {
  if (typeof g.v === "number") g.o[g.k] = 0;
  else if (typeof g.v === "boolean") g.o[g.k] = false;
  else if (typeof g.v === "string") g.o[g.k] = "";
  else if (Array.isArray(g.v)) g.o[g.k] = [];
  else if (g.v && typeof g.v === "object" && Number.isInteger(g.v.x)) g.o[g.k] = { x: 1, y: 1 };
}

function zeroAll(obj, name, n) {
  if (!obj || typeof obj !== "object") return n;
  if (Array.isArray(obj)) {
    for (const el of obj) n = zeroAll(el, name, n);
    return n;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === name) {
      if (typeof v === "number" && v !== 0) { obj[k] = 0; n++; }
      else if (typeof v === "boolean" && v === true) { obj[k] = false; n++; }
      else if (typeof v === "string" && v.length) { obj[k] = ""; n++; }
      else if (Array.isArray(v) && v.length) { obj[k] = []; n++; }
    } else if (v && typeof v === "object") n = zeroAll(v, name, n);
  }
  return n;
}

function histKey(v) {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return `str:${v.slice(0, 24)}`;
  if (Array.isArray(v)) return `arr${v.length}`;
  if (v && typeof v === "object") {
    if (Number.isInteger(v.x) && Number.isInteger(v.y)) return `xy:${v.x},${v.y}`;
    return `obj:${Object.keys(v).slice(0, 8).join(",")}`;
  }
  return typeof v;
}

const SKIP_FOR_CLASS = new Set(["baseCut", "shallowNow"]);
const rows = [];

for (const { name, why } of PRESENCE) {
  const hist = {};
  const paths = new Set();
  let have = 0;
  let nTruthy = 0;
  let nCopies = 0;
  let firstTruthy = null;
  for (const p of plans) {
    const hits = grabAll(p, name);
    if (!hits.length) continue;
    have++;
    nCopies += hits.length;
    for (const h of hits) paths.add(h.path);
    hist[histKey(hits[0].v)] = (hist[histKey(hits[0].v)] || 0) + 1;
    const truthy = hits.find((h) => isTruthy(h.v));
    if (truthy) {
      nTruthy++;
      if (!firstTruthy) firstTruthy = { room: p.room, path: truthy.path, kind: leafKind(truthy.v), v: histKey(truthy.v) };
    }
  }
  const witness = /witness|search|log|record|own picker|own remaining|exhaustion|refusal|priced-refusal|offer record|offer leaf|tour ceiling/i.test(why);
  let single = null;
  let twin = null;
  if (firstTruthy && !SKIP_FOR_CLASS.has(name)) {
    single = run("LEFT-" + name + "-one-copy", firstTruthy.room, (p) => {
      const hits = grabAll(p, name);
      const g = hits.find((h) => isTruthy(h.v)) || hits[0];
      if (g) flattenOne(g);
    });
    if (single.status === "BITES") {
      twin = run("LEFT-" + name + "-every-copy", firstTruthy.room, (p) => {
        zeroAll(p.meta, name, 0);
      });
    }
  }
  let klass;
  if (SKIP_FOR_CLASS.has(name)) klass = "bounded";
  else if (!firstTruthy) klass = nCopies === 0 ? "absent" : "fleet-zero";
  else if (single && single.status === "ESCAPE") klass = "flippable";
  else if (twin && twin.status === "ESCAPE") klass = "twin-only";
  else if (single && single.status === "BITES") klass = "gated-one-copy";
  else klass = "unknown";
  rows.push({
    name,
    why,
    witness,
    have,
    nCopies,
    nTruthy,
    paths: [...paths],
    hist,
    sample: firstTruthy,
    single: single && { status: single.status, detail: String(single.detail || "").slice(0, 180) },
    twin: twin && { status: twin.status, detail: String(twin.detail || "").slice(0, 180) },
    klass,
  });
}

// Walk identities that previous hunts claimed near 172. Re-score here.
function score(label, pred) {
  let have = 0;
  let match = 0;
  const miss = [];
  for (const p of plans) {
    const hits = grabAll(p, label.split("::")[0]);
    if (!hits.length) continue;
    have++;
    if (pred(p, hits)) match++;
    else if (miss.length < 3) miss.push(p.room);
  }
  return { label, have, match, missN: have - match, miss };
}

const walks = [];
walks.push(score("inertPromoted::eq-inertPruned-len", (p, hits) => {
  const v = hits[0].v;
  const ip = p.meta?.shell?.inertPruned;
  const n = Array.isArray(ip) ? ip.length : 0;
  return typeof v === "number" ? v === n : Array.isArray(v) && v.length === n;
}));
walks.push(score("digRoads::eq-road+rampart-on-wall", (p, hits) => {
  const d = byRoom.get(p.room);
  if (!d || typeof hits[0].v !== "number") return false;
  const ramps = new Set((p.structures?.rampart || []).map(K));
  let n = 0;
  for (const r of p.structures?.road || []) {
    if (!walkable(d.terrain, r.x, r.y) && ramps.has(K(r))) n++;
  }
  return hits[0].v === n;
}));
walks.push(score("digRoads::eq-roads-on-cut", (p, hits) => {
  const cut = new Set((p.meta?.shell?.cut || []).map(K));
  let n = 0;
  for (const r of p.structures?.road || []) if (cut.has(K(r))) n++;
  return typeof hits[0].v === "number" && hits[0].v === n;
}));
walks.push(score("freeLeft::eq-reflow-freeLeft", (p, hits) => {
  const left = p.meta?.extensions?.reflow?.freeLeft ?? p.meta?.walls?.reflow?.freeLeft;
  return typeof hits[0].v === "number" && hits[0].v === left;
}));
walks.push(score("haulCost::eq-labs-haul", (p, hits) => typeof hits[0].v === "number" && hits[0].v === p.meta?.labs?.haul));
walks.push(score("worstCase::eq-floorGated", (p, hits) => {
  const fg = p.meta?.walls?.mobility?.floorGated;
  return typeof hits[0].v === "number" && typeof fg === "number" && Math.abs(hits[0].v - fg) < 1e-9;
}));
walks.push(score("worstCaseUngated::eq-floorUngated", (p, hits) => {
  const fu = p.meta?.extensions?.laneMeta?.floorUngated;
  return typeof hits[0].v === "number" && typeof fu === "number" && Math.abs(hits[0].v - fu) < 1e-9;
}));
walks.push(score("deepBudget::const-8", (p, hits) => hits[0].v === 8));
walks.push(score("deepBudget::eq-lane-deep", (p, hits) => hits[0].v === p.meta?.extensions?.laneMeta?.deep));
walks.push(score("stubExhausted::stubRoads-ge-stubCap", (p, hits) => {
  const roads = p.meta?.extensions?.stubRoads;
  const cap = p.meta?.extensions?.stubCap;
  if (typeof roads !== "number" || typeof cap !== "number") return false;
  return !!hits[0].v === roads >= cap;
}));
walks.push(score("deepExhausted::iff-stub", (p, hits) => !!hits[0].v === !!p.meta?.extensions?.stubExhausted));
walks.push(score("unsealed::eq-lane-unsealed", (p, hits) => {
  const u = p.meta?.extensions?.laneMeta?.unsealed;
  return typeof hits[0].v === "number" && hits[0].v === u;
}));
walks.push(score("searchedSeats::eq-offer-seats", (p, hits) => hits[0].v === p.meta?.towers?.towerSwapOffer?.seats));
walks.push(score("faceAndSatHeld::eq-offer-scanned", (p, hits) => hits[0].v === p.meta?.towers?.towerSwapOffer?.scanned));
walks.push(score("priceProven::eq-offer-price", (p, hits) => hits[0].v === p.meta?.towers?.towerSwapOffer?.price));
walks.push(score("strandedFirst::eq-conduct-stranded-len", (p, hits) => {
  const st = p.meta?.walls?.conductBridge?.stranded;
  const n = Array.isArray(st) ? st.length : 0;
  const v = hits[0].v;
  return typeof v === "number" ? v === n : v && st && st[0] && K(v) === K(st[0]);
}));
walks.push(score("shallowRamparts::len-eq-extensions.shallow", (p, hits) => {
  const arr = hits.find((h) => Array.isArray(h.v))?.v;
  if (!arr) return typeof hits[0].v === "number" && hits[0].v === (p.meta?.extensions?.shallow || 0);
  return arr.length === (p.meta?.extensions?.shallow || 0);
}));
walks.push(score("uselessCut::empty", (p, hits) => {
  const v = hits[0].v;
  return Array.isArray(v) ? v.length === 0 : !v;
}));
walks.push(score("budgetSpent::false", (p, hits) => !hits[0].v));
walks.push(score("rescueSpent::eq-0", (p, hits) => hits[0].v === 0 || hits[0].v === false));
walks.push(score("paveRetired::empty", (p, hits) => {
  const v = hits[0].v;
  return v == null || v === false || v === 0 || (Array.isArray(v) && !v.length);
}));
walks.push(score("boundRederived::false-or-empty", (p, hits) => {
  const v = hits[0].v;
  return v == null || v === false || v === 0 || (Array.isArray(v) && !v.length);
}));

const walk172 = walks.filter((w) => w.have === 172 && w.match === 172);
const walkHaveMatch = walks.filter((w) => w.have > 0 && w.match === w.have);

const out = {
  nPresence: PRESENCE.length,
  byKlass: rows.reduce((a, r) => { a[r.klass] = (a[r.klass] || 0) + 1; return a; }, {}),
  flippable: rows.filter((r) => r.klass === "flippable").map((r) => r.name),
  twinOnly: rows.filter((r) => r.klass === "twin-only").map((r) => r.name),
  fleetZero: rows.filter((r) => r.klass === "fleet-zero").map((r) => r.name),
  bounded: rows.filter((r) => r.klass === "bounded").map((r) => r.name),
  gatedOne: rows.filter((r) => r.klass === "gated-one-copy").map((r) => r.name),
  rows,
  walks,
  walk172,
  walkHaveMatch,
};

fs.writeFileSync(path.join(DIR, "leftover.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  nPresence: out.nPresence,
  byKlass: out.byKlass,
  flippable: out.flippable,
  twinOnly: out.twinOnly,
  fleetZero: out.fleetZero,
  bounded: out.bounded,
  gatedOne: out.gatedOne,
  walk172: out.walk172,
  walkHaveMatch: out.walkHaveMatch,
}, null, 2));
