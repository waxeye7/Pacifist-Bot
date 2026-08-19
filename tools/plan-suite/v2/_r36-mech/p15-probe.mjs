/**
 * r29p15 leftover-presence probe. Throwaway. Never writes the artifact.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fieldFrom } from "../layer-hub.mjs";
import {
  BUILT_OBSTACLES,
  arriveAt,
  bfsField,
  interiorWalk,
  maskFromKeys,
  mobilityStats,
} from "../layer-shell.mjs";
import { META_DARK } from "../r27-gates.mjs";
import { loadPlans, loadRooms, K, idx } from "./common.mjs";

const { plans } = loadPlans();
const { byRoom } = loadRooms();

const SKIP = new Set([
  "baseCut",
  "shallowNow",
  "protectRadius",
  "seedScore",
  "reserved",
  "cutTiles",
  "corridorPlaced",
  "corridorFallback",
  "digRoads",
]);
const PRESENCE = Object.entries(META_DARK)
  .filter(([, v]) => v.klass === "presence")
  .map(([k]) => k)
  .filter((k) => !SKIP.has(k));

function pathsOf(obj, name, trail = "meta") {
  const out = [];
  const walk = (o, t) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) {
      o.forEach((e, i) => walk(e, `${t}[${i}]`));
      return;
    }
    for (const [k, v] of Object.entries(o)) {
      if (k === name) out.push({ path: `${t}.${k}`, v });
      if (v && typeof v === "object") walk(v, `${t}.${k}`);
    }
  };
  walk(obj, trail);
  return out;
}

function summarizeVal(v) {
  if (v == null) return String(v);
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v.length > 40 ? v.slice(0, 40) + "…" : v;
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    if (Number.isInteger(v[0]?.x)) return `[${v.length} pts ${v.slice(0, 2).map(K).join(" ")}]`;
    if (typeof v[0] === "number") return `[${v.slice(0, 6).join(",")}]`;
    return `[len ${v.length}]`;
  }
  if (Number.isInteger(v.x) && Number.isInteger(v.y)) return `${v.x},${v.y}`;
  return `{${Object.keys(v).slice(0, 6).join(",")}}`;
}

const loc = {};
for (const name of PRESENCE) {
  const rooms = [];
  const pathCounts = {};
  for (const p of plans) {
    const hits = pathsOf(p.meta, name);
    if (!hits.length) continue;
    for (const h of hits) pathCounts[h.path] = (pathCounts[h.path] || 0) + 1;
    if (rooms.length < 3) rooms.push({ room: p.room, hits: hits.map((h) => `${h.path}=${JSON.stringify(summarizeVal(h.v))}`) });
  }
  loc[name] = { roomsWith: Object.values(pathCounts).length ? plans.filter((p) => pathsOf(p.meta, name).length).length : 0, pathCounts, sample: rooms };
}

function hubFieldLayer6(terrain, plan) {
  const occ = new Set();
  for (const t of ["storage", "terminal", "link", "spawn", "container", "tower", "lab", "nuker", "observer"]) {
    for (const q of plan.structures?.[t] || []) occ.add(K(q));
  }
  if (plan.sitter) occ.add(K(plan.sitter));
  for (const src of plan.sources || []) occ.add(K(src));
  if (plan.controller) occ.add(K(plan.controller));
  if (plan.mineral) occ.add(K(plan.mineral));
  return fieldFrom(terrain, plan.sitter, occ);
}

function mFreeWalls(terrain, plan, extShip) {
  const cut = plan.meta?.shell?.cut || [];
  const rset = new Set((plan.structures?.rampart || []).map(K));
  const blockedFree = new Set();
  for (const src of plan.sources || []) blockedFree.add(K(src));
  if (plan.controller) blockedFree.add(K(plan.controller));
  if (plan.mineral) blockedFree.add(K(plan.mineral));
  if (plan.sitter) blockedFree.add(K(plan.sitter));
  for (const t of BUILT_OBSTACLES) {
    if (t === "extension") continue;
    for (const q of plan.structures?.[t] || []) blockedFree.add(K(q));
  }
  const walk = interiorWalk(terrain, rset, extShip, blockedFree, plan.sitter);
  return { stats: mobilityStats(cut, extShip, maskFromKeys(walk)), mask: maskFromKeys(walk), walk };
}

function roadMaxDist(plan) {
  const sitter = plan.sitter;
  if (!sitter) return null;
  const conduct = new Set((plan.structures?.road || []).map(K));
  for (const c of plan.structures?.container || []) conduct.add(K(c));
  conduct.add(K(sitter));
  const dist = new Map([[K(sitter), 0]]);
  const q = [sitter];
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    const d = dist.get(K(cur));
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const k = `${nx},${ny}`;
      if (dist.has(k) || !conduct.has(k)) continue;
      dist.set(k, d + 1);
      q.push({ x: nx, y: ny });
    }
  }
  const INF = 1 << 20;
  let mx = 0;
  for (const r of plan.structures?.road || []) {
    const d = dist.get(K(r));
    if (d != null && d < INF && d > mx) mx = d;
  }
  return mx;
}

function mineralSeatOf(plan) {
  if (!plan.mineral) return null;
  return (plan.structures?.container || []).find((c) => Math.max(Math.abs(c.x - plan.mineral.x), Math.abs(c.y - plan.mineral.y)) <= 1) || null;
}

const scores = {};
function score(name, ok, detail) {
  if (!scores[name]) scores[name] = { ok: 0, bad: 0, skip: 0, samples: [] };
  if (ok === null) scores[name].skip++;
  else if (ok) scores[name].ok++;
  else {
    scores[name].bad++;
    if (scores[name].samples.length < 4) scores[name].samples.push(detail);
  }
}

const { exteriorFlood } = await import("../shared.mjs");

for (const p of plans) {
  const d = byRoom.get(p.room);
  if (!d || !p.sitter) continue;
  const rset = new Set((p.structures?.rampart || []).map(K));
  const extShip = exteriorFlood(d.terrain, rset);
  const mob = p.meta?.walls?.mobility || {};
  const free = p.meta?.shell?.mobilityShippedFree || {};
  const ext = p.meta?.extensions || {};
  const mfw = mFreeWalls(d.terrain, p, extShip);

  // floor* vs mobilityShippedFree
  if (typeof mob.floorGated === "number") {
    score("floorGated==shippedFree.maxGated", Math.abs(mob.floorGated - (free.maxGated ?? NaN)) < 1e-9, `${p.room} ${mob.floorGated} vs ${free.maxGated}`);
    score("floorGated==wallsMFree.maxGated", Math.abs(mob.floorGated - mfw.stats.maxGated) < 1e-9, `${p.room} ${mob.floorGated} vs ${mfw.stats.maxGated}`);
  }
  if (typeof mob.floorOver === "number") {
    score("floorOver==shippedFree.over", mob.floorOver === free.over, `${p.room} ${mob.floorOver} vs ${free.over}`);
    score("floorOver==wallsMFree.over", mob.floorOver === mfw.stats.over, `${p.room} ${mob.floorOver} vs ${mfw.stats.over}`);
  }
  if (typeof mob.floorOverGated === "number") {
    score("floorOverGated==shippedFree.overGated", mob.floorOverGated === free.overGated, `${p.room} ${mob.floorOverGated} vs ${free.overGated}`);
    score("floorOverGated==wallsMFree.overGated", mob.floorOverGated === mfw.stats.overGated, `${p.room} ${mob.floorOverGated} vs ${mfw.stats.overGated}`);
  }
  if (typeof mob.floor === "number") {
    score("floor==shippedFree.max", Math.abs(mob.floor - (free.max ?? NaN)) < 1e-9, `${p.room} ${mob.floor} vs ${free.max}`);
    score("floor==wallsMFree.max", Math.abs(mob.floor - mfw.stats.max) < 1e-9, `${p.room} ${mob.floor} vs ${mfw.stats.max}`);
  }

  // freeDin / massAdds
  const worst = mob.worst;
  if (worst && typeof worst.freeDin === "number") {
    const want = arriveAt(bfsField(mfw.mask, worst.a), worst.b);
    score("worst.freeDin==arriveAt(wallsMFree)", worst.freeDin === want, `${p.room} ${worst.freeDin} vs ${want}`);
    score("freeDin==worst.freeDin (top)", mob.freeDin == null || mob.freeDin === worst.freeDin, `${p.room} top=${mob.freeDin}`);
  }
  if (typeof mob.massAdds === "number" && worst && Number.isFinite(worst.din) && Number.isFinite(worst.freeDin)) {
    score("massAdds==din-freeDin", mob.massAdds === worst.din - worst.freeDin, `${p.room} ${mob.massAdds} vs ${worst.din}-${worst.freeDin}`);
  }

  // maxHubDist
  if (typeof ext.maxHubDist === "number") {
    const hf = hubFieldLayer6(d.terrain, p);
    let mx = 0;
    for (const e of p.structures?.extension || []) {
      const v = hf[idx(e.x, e.y)];
      if (v < 9999 && v > mx) mx = v;
    }
    score("maxHubDist==hub6(shipped ext)", ext.maxHubDist === mx, `${p.room} ${ext.maxHubDist} vs ${mx}`);
  }

  // deepReach vs hubDistCap
  if (typeof ext.deepReach === "number" && typeof ext.hubDistCap === "number") {
    const want = Math.min(ext.hubDistCap + 2, 18);
    score("deepReach==min(hubDistCap+2,18)", ext.deepReach === want, `${p.room} ${ext.deepReach} vs ${want} (cap ${ext.hubDistCap})`);
  }

  // hubDistCap enum
  if (typeof ext.hubDistCap === "number") {
    score("hubDistCap in [16,19,23,999]", [16, 19, 23, 999].includes(ext.hubDistCap), `${p.room} ${ext.hubDistCap}`);
    score("hubDistCap>=maxHubDist", ext.hubDistCap >= (ext.maxHubDist || 0), `${p.room} ${ext.hubDistCap} < ${ext.maxHubDist}`);
  }

  // stubCap / stubExhausted
  if (typeof ext.stubCap === "number") {
    score("stubCap in {43,51}", ext.stubCap === 43 || ext.stubCap === 51, `${p.room} ${ext.stubCap}`);
    const used = ext.stubRoads || 0;
    if (typeof ext.stubExhausted === "boolean") {
      score("stubExhausted==stubRoads>=stubCap", ext.stubExhausted === used >= ext.stubCap, `${p.room} flag=${ext.stubExhausted} used=${used} cap=${ext.stubCap}`);
    }
  }

  // maxDist
  if (typeof p.meta?.roadOrder?.maxDist === "number") {
    const want = roadMaxDist(p);
    score("roadOrder.maxDist==networkBFS", p.meta.roadOrder.maxDist === want, `${p.room} ${p.meta.roadOrder.maxDist} vs ${want}`);
  }

  // mineral reservation
  const seatRes = p.meta?.mineralSeatAtReservation;
  const apprRes = p.meta?.mineralApproachAtReservation;
  const seatNow = p.meta?.mineralSeat;
  const apprNow = p.meta?.mineralApproach;
  const seat = mineralSeatOf(p);
  if (seatRes && Number.isInteger(seatRes.x)) {
    const chebMin = p.mineral ? Math.max(Math.abs(seatRes.x - p.mineral.x), Math.abs(seatRes.y - p.mineral.y)) : 99;
    score("seatAtRes cheb<=1 mineral", chebMin <= 1, `${p.room} ${seatRes.x},${seatRes.y} cheb ${chebMin}`);
    score("seatAtRes==mineralSeat", seatNow && seatRes.x === seatNow.x && seatRes.y === seatNow.y, `${p.room} res=${seatRes.x},${seatRes.y} now=${seatNow && `${seatNow.x},${seatNow.y}`}`);
    score("seatAtRes==containerSeat", seat && seatRes.x === seat.x && seatRes.y === seat.y, `${p.room}`);
  }
  if (apprRes && Number.isInteger(apprRes.x) && seatRes) {
    const cheb = Math.max(Math.abs(apprRes.x - seatRes.x), Math.abs(apprRes.y - seatRes.y));
    score("apprAtRes D8 of seatAtRes", cheb === 1, `${p.room} ${cheb}`);
    score("apprAtRes==mineralApproach", apprNow && apprRes.x === apprNow.x && apprRes.y === apprNow.y, `${p.room}`);
  }

  // inertPromoted
  const promo = p.meta?.shell?.inertPromoted;
  if (typeof promo === "number") {
    const adds = (p.meta?.shell?.cutDrift || []).filter((e) => e && e.op === "add").length;
    const rems = (p.meta?.shell?.cutDrift || []).filter((e) => e && e.op === "remove").length;
    score("inertPromoted==cutDrift.adds", promo === adds, `${p.room} ${promo} vs adds ${adds}`);
    score("inertPromoted==cutDrift.removes", promo === rems, `${p.room} ${promo} vs rems ${rems}`);
    score("inertPromoted>=0", promo >= 0, `${p.room} ${promo}`);
  }

  // shallowRamparts
  const sr = pathsOf(p.meta, "shallowRamparts");
  for (const h of sr) {
    if (typeof h.v === "number") {
      const shallow = (p.meta?.extensions?.shallow || 0);
      score("shallowRamparts==extensions.shallow", h.v === shallow, `${p.room} ${h.v} vs ${shallow}`);
    } else if (Array.isArray(h.v)) {
      score("shallowRamparts array len vs shallow", h.v.length === (p.meta?.extensions?.shallow || 0), `${p.room} ${h.v.length}`);
    }
  }

  // parkCap
  const pc = p.meta?.composeOpts?.parkCap;
  const parks = (p.meta?.ctrlParks || p.structures && null);
  const parkN = Array.isArray(p.meta?.ctrlParks) ? p.meta.ctrlParks.length : (Array.isArray(p.meta?.ctrlParksBuiltTiles) ? p.meta.ctrlParksBuiltTiles.length : null);
  if (typeof pc === "number") {
    score("parkCap==ctrlParks.len", parkN != null && pc === parkN, `${p.room} cap=${pc} parks=${parkN}`);
  }

  // radii
  const radii = p.meta?.composeOpts?.radii;
  if (Array.isArray(radii)) {
    score("radii nonempty", radii.length > 0, `${p.room} ${radii}`);
  }

  // baseOverGated
  const bog = p.meta?.misc?.mobilityVeto?.baseOverGated;
  if (typeof bog === "number") {
    score("baseOverGated==shippedFree.overGated", bog === free.overGated, `${p.room} ${bog} vs ${free.overGated}`);
    score("baseOverGated==wallsMFree.overGated", bog === mfw.stats.overGated, `${p.room} ${bog} vs ${mfw.stats.overGated}`);
  }

  // deepExhausted vs shallow
  if (typeof ext.deepExhausted === "boolean") {
    score("deepExhausted==shallow>0", ext.deepExhausted === (ext.shallow || 0) > 0, `${p.room} flag=${ext.deepExhausted} shallow=${ext.shallow}`);
  }
}

const locOut = {};
for (const [k, v] of Object.entries(loc)) {
  locOut[k] = { roomsWith: v.roomsWith, pathCounts: v.pathCounts, sample: v.sample };
}

const scoreOut = {};
for (const [k, v] of Object.entries(scores)) scoreOut[k] = v;

const out = { loc: locOut, scores: scoreOut };
const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), "p15-probe.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log("wrote", dest);
for (const [k, v] of Object.entries(scores)) {
  const mark = v.bad === 0 && v.ok > 0 ? "OK " : v.bad === 0 ? "SKIP" : "NO ";
  console.log(mark, k, `ok=${v.ok} bad=${v.bad} skip=${v.skip}`, v.samples[0] || "");
}
console.log("\n--- locations ---");
for (const [k, v] of Object.entries(loc)) {
  const paths = Object.entries(v.pathCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([p, n]) => `${p}×${n}`)
    .join(" | ");
  console.log(k.padEnd(32), `rooms=${String(v.roomsWith).padStart(3)}`, paths);
}
