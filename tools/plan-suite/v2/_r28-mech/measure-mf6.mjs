/**
 * Measure which MF6 presence names re-derive from terrain + shipped lists.
 * Throwaway. Does not write the artifact.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { key } from "../shared.mjs";
import { fieldFrom } from "../layer-hub.mjs";
import { RADII_WIDE } from "../layer-shell.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.join(DIR, "../../out-v2/plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);
const rooms = JSON.parse(fs.readFileSync(path.join(DIR, "rooms.json"), "utf8"));
const by = new Map(rooms.map((r) => [r.room, r]));

const idx = (x, y) => x + y * 50;
const K = (t) => `${t.x},${t.y}`;
const MAX_CUT = 45;

const tally = (name) => ({ name, n: 0, eq: 0, miss: [] });
function hit(t, ok, extra) {
  t.n++;
  if (ok) t.eq++;
  else if (t.miss.length < 4) t.miss.push(extra);
}

const T = {
  nuker: tally("nukerHub vs L5 field"),
  obs: tally("obsHub vs L5 field"),
  nukerLiftExt: tally("nukerHub vs L5 field (no mineral container)"),
  obsLift: tally("obsHub vs L5 field (no mineral container)"),
  refill: tally("refillUnblocked vs L3 field"),
  baseLe: tally("baseCut <= freeze"),
  baseEq: tally("baseCut === freeze"),
  baseUseless: tally("baseCut === freeze + uselessCut"),
  baseClose: tally("|baseCut - freeze| <= useless + 8"),
  pricey: tally("priceyWall === baseCut > 45"),
  radiusIn: tally("protectRadius in RADII_WIDE"),
  radiusTight: tally("protectRadius in 6..12"),
  radiusVals: {},
  mineral: tally("mineralBubble === seat in bubble or ramparted+outside"),
  mineralSeatRamp: tally("mineralBubble === (seat has rampart ? 1 : 0)"),
  swamp: tally("swampPaved === laid + restored"),
  swampLaid: tally("swampPaved === 0 iff laid.swampPave === 0"),
  spurZero: tally("spurred === 0 iff laid.spur === 0"),
  spurEqShipped: tally("spurred === shippedByKind.spur"),
  spurSum: tally("spurred + servedFree + unreached <= clusters"),
  spurSumEq: tally("spurred + servedFree + unreached === clusters"),
  newRoadsT: tally("towers.newRoads === ?"),
  newRoadsKinds: {},
  baseDiff: {},
};

for (const p of plans) {
  const d = by.get(p.room);
  if (!d) continue;
  const sh = p.meta.shell || {};
  const tw = p.meta.towers || {};
  const w = p.meta.walls || {};
  const misc = p.meta.misc || {};
  const s = p.structures || {};

  const occupiedL5 = new Set();
  for (const t of ["storage", "terminal", "link", "spawn", "container", "tower", "lab"]) {
    for (const q of s[t] || []) occupiedL5.add(key(q.x, q.y));
  }
  occupiedL5.add(key(p.sitter.x, p.sitter.y));
  for (const src of p.sources || []) occupiedL5.add(key(src.x, src.y));
  if (p.controller) occupiedL5.add(key(p.controller.x, p.controller.y));
  if (p.mineral) occupiedL5.add(key(p.mineral.x, p.mineral.y));

  const hubL5 = fieldFrom(d.terrain, p.sitter, occupiedL5);
  const nuker = (s.nuker || [])[0];
  const observer = (s.observer || [])[0];
  if (nuker && typeof misc.nukerHubDist === "number") {
    const want = hubL5[idx(nuker.x, nuker.y)];
    hit(T.nuker, want === misc.nukerHubDist, { room: p.room, want, got: misc.nukerHubDist });
  }
  if (observer && typeof misc.observerHubDist === "number") {
    const want = hubL5[idx(observer.x, observer.y)];
    hit(T.obs, want === misc.observerHubDist, { room: p.room, want, got: misc.observerHubDist });
  }

  // L5 field without mineral container (placed after nuker/obs)
  const occupiedL5b = new Set(occupiedL5);
  const seat = (s.container || []).find((c) => p.mineral && Math.max(Math.abs(c.x - p.mineral.x), Math.abs(c.y - p.mineral.y)) <= 1);
  if (seat) occupiedL5b.delete(key(seat.x, seat.y));
  const hubL5b = fieldFrom(d.terrain, p.sitter, occupiedL5b);
  if (nuker && typeof misc.nukerHubDist === "number") {
    const want = hubL5b[idx(nuker.x, nuker.y)];
    hit(T.nukerLiftExt, want === misc.nukerHubDist, { room: p.room, want, got: misc.nukerHubDist });
  }
  if (observer && typeof misc.observerHubDist === "number") {
    const want = hubL5b[idx(observer.x, observer.y)];
    hit(T.obsLift, want === misc.observerHubDist, { room: p.room, want, got: misc.observerHubDist });
  }

  const blockersL3 = new Set();
  for (const t of ["storage", "terminal", "link", "spawn"]) {
    for (const q of s[t] || []) blockersL3.add(key(q.x, q.y));
  }
  for (const src of p.sources || []) blockersL3.add(key(src.x, src.y));
  if (p.controller) blockersL3.add(key(p.controller.x, p.controller.y));
  if (p.mineral) blockersL3.add(key(p.mineral.x, p.mineral.y));
  const refillF = fieldFrom(d.terrain, p.sitter, blockersL3);
  if (Array.isArray(tw.refillDistsUnblocked)) {
    const towers = s.tower || [];
    let ok = towers.length === tw.refillDistsUnblocked.length;
    const pair = [];
    for (let i = 0; i < towers.length; i++) {
      const want = refillF[idx(towers[i].x, towers[i].y)];
      const got = tw.refillDistsUnblocked[i];
      pair.push([want, got]);
      if (want !== got) ok = false;
    }
    hit(T.refill, ok, { room: p.room, pair: pair.filter(([a, b]) => a !== b).slice(0, 3) });
  }

  const freezeN = (sh.cutAtFreeze || []).length;
  if (typeof sh.baseCut === "number") {
    hit(T.baseLe, sh.baseCut <= freezeN && sh.baseCut > 0, { room: p.room, base: sh.baseCut, freeze: freezeN });
    hit(T.baseEq, sh.baseCut === freezeN, { room: p.room, base: sh.baseCut, freeze: freezeN });
    const uN = Array.isArray(sh.uselessCut) ? sh.uselessCut.length : (sh.uselessCut || 0);
    hit(T.baseUseless, sh.baseCut === freezeN + uN, { room: p.room, base: sh.baseCut, freeze: freezeN, useless: uN });
    hit(T.baseClose, Math.abs(sh.baseCut - freezeN) <= uN + 8, {
      room: p.room,
      base: sh.baseCut,
      freeze: freezeN,
      useless: uN,
      d: sh.baseCut - freezeN,
    });
    const d = sh.baseCut - freezeN;
    T.baseDiff[d] = (T.baseDiff[d] || 0) + 1;
    const wantPrice = sh.baseCut > MAX_CUT;
    hit(T.pricey, !!sh.priceyWall === wantPrice, { room: p.room, base: sh.baseCut, pricey: sh.priceyWall, wantPrice });
  }
  if (typeof sh.protectRadius === "number") {
    hit(T.radiusIn, RADII_WIDE.includes(sh.protectRadius), { room: p.room, r: sh.protectRadius });
    hit(T.radiusTight, sh.protectRadius >= 6 && sh.protectRadius <= 12, { room: p.room, r: sh.protectRadius });
    T.radiusVals[sh.protectRadius] = (T.radiusVals[sh.protectRadius] || 0) + 1;
  }

  const bubbleSet = new Set((sh.bubble || []).map(K));
  const rampSet = new Set((s.rampart || []).map(K));
  if (typeof misc.mineralBubble === "number" && seat) {
    const onSeat = bubbleSet.has(K(seat)) || (rampSet.has(K(seat)) && !new Set((sh.cut || []).map(K)).has(K(seat)));
    hit(T.mineral, (misc.mineralBubble > 0) === onSeat, {
      room: p.room,
      got: misc.mineralBubble,
      inBubble: bubbleSet.has(K(seat)),
      hasRamp: rampSet.has(K(seat)),
    });
    hit(T.mineralSeatRamp, misc.mineralBubble === (rampSet.has(K(seat)) ? 1 : 0), {
      room: p.room,
      got: misc.mineralBubble,
      hasRamp: rampSet.has(K(seat)),
    });
  }

  const laid = w.laidByKind || {};
  const restored = w.restoredByKind || {};
  const swampRest = (restored.swampPave || []).length;
  if (typeof w.swampPaved === "number") {
    hit(T.swamp, w.swampPaved === (laid.swampPave || 0) + swampRest, {
      room: p.room,
      ev: w.swampPaved,
      laid: laid.swampPave,
      rest: swampRest,
    });
    hit(T.swampLaid, (w.swampPaved === 0) === ((laid.swampPave || 0) === 0), {
      room: p.room,
      ev: w.swampPaved,
      laid: laid.swampPave,
    });
  }
  if (typeof w.spurred === "number") {
    hit(T.spurZero, (w.spurred === 0) === ((laid.spur || 0) === 0), {
      room: p.room,
      ev: w.spurred,
      laid: laid.spur,
      shipped: (w.shippedByKind || {}).spur,
    });
    hit(T.spurEqShipped, w.spurred === ((w.shippedByKind || {}).spur || 0), {
      room: p.room,
      ev: w.spurred,
      shipped: (w.shippedByKind || {}).spur,
    });
    const sum = (w.spurred || 0) + (w.servedFree || 0) + (w.unreachedClusters || 0);
    hit(T.spurSum, sum <= (w.clusters || 0), { room: p.room, sum, clusters: w.clusters });
    hit(T.spurSumEq, sum === (w.clusters || 0), {
      room: p.room,
      spurred: w.spurred,
      served: w.servedFree,
      unreached: w.unreachedClusters,
      clusters: w.clusters,
    });
  }
  if (typeof tw.newRoads === "number") {
    T.newRoadsKinds[tw.newRoads] = (T.newRoadsKinds[tw.newRoads] || 0) + 1;
  }
}

const out = {};
for (const [k, v] of Object.entries(T)) {
  if (v && v.name) out[k] = { name: v.name, eq: v.eq, n: v.n, miss: v.miss };
  else out[k] = v;
}
console.log(JSON.stringify(out, null, 2));
