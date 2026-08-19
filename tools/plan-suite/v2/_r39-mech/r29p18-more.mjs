/**
 * r29p18 extra leftover walks. Throwaway.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.resolve(DIR, "../../out-v2/plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);

function T(name) {
  return { name, n: 0, ok: 0, bad: 0, samples: [] };
}
function hit(t, ok, sample) {
  t.n++;
  if (ok) t.ok++;
  else {
    t.bad++;
    if (t.samples.length < 5) t.samples.push(sample);
  }
}

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

const scores = {
  freeLeftArith: T("freeLeft === freeDeepRoadFaced - spentOnAdds - spentOnMoves"),
  freeLeftEqLeft: T("extensions.reflow.freeLeft === walls.reflow.freeLeft"),
  freeLeftEqSearch: T("freeLeft === something on search"),
  deepBudgetEq: T("deepBudget copies agree"),
  stubExhCap: T("stubExhausted === stubRoads >= stubCap"),
  promoAdds: T("inertPromoted === cutDrift adds"),
  promoNum: T("inertPromoted is number vs array"),
  rescue0: T("rescueSpent === 0"),
  rescuedToOnBoard: T("rescuedTo is a shipped extension"),
  rolledBackOnBoard: T("rolledBackFrom is not a shipped extension"),
  takeFromOffer: T("take.from matches offer or leaves"),
  takeFromD8: T("take.from is D8 of to"),
};

const loc = {};
const names = [
  "freeLeft",
  "deepBudget",
  "inertPromoted",
  "shallowRamparts",
  "rescuedTo",
  "rescuedLap",
  "rolledBackFrom",
  "worstCase",
  "worstCaseUngated",
  "strandedFirst",
  "maxHubDist",
  "digRoads",
  "servedExts",
  "unreachedClusters",
  "unreachableExts",
];
for (const n of names) loc[n] = { rooms: 0, paths: {}, sample: null };

for (const p of plans) {
  const e = p.meta?.extensions || {};
  const w = p.meta?.walls || {};
  const rf = e.reflow || w.reflow || {};
  const rfE = e.reflow || {};
  const rfW = w.reflow || {};

  if (typeof rf.freeLeft === "number") {
    const want = (rf.freeDeepRoadFaced || 0) - (rf.spentOnAdds || 0) - (rf.spentOnMoves || 0);
    hit(scores.freeLeftArith, rf.freeLeft === want, {
      room: p.room,
      got: rf.freeLeft,
      want,
      faced: rf.freeDeepRoadFaced,
      adds: rf.spentOnAdds,
      moves: rf.spentOnMoves,
    });
  }
  if (typeof rfE.freeLeft === "number" && typeof rfW.freeLeft === "number") {
    hit(scores.freeLeftEqLeft, rfE.freeLeft === rfW.freeLeft, { room: p.room, e: rfE.freeLeft, w: rfW.freeLeft });
  }

  const db = pathsOf(p.meta, "deepBudget");
  if (db.length >= 2) {
    hit(
      scores.deepBudgetEq,
      db.every((h) => JSON.stringify(h.v) === JSON.stringify(db[0].v)),
      { room: p.room, vals: db.map((h) => `${h.path}=${h.v}`) },
    );
  }

  const promo = p.meta?.shell?.inertPromoted;
  if (promo != null) {
    const adds = (p.meta?.shell?.cutDrift || []).filter((x) => x && x.op === "add").length;
    hit(scores.promoAdds, promo === adds || (Array.isArray(promo) && promo.length === adds), {
      room: p.room,
      promo: Array.isArray(promo) ? `arr${promo.length}` : promo,
      adds,
      type: typeof promo,
    });
    hit(scores.promoNum, typeof promo === "number" || Array.isArray(promo), { room: p.room, type: typeof promo });
  }

  hit(scores.rescue0, (e.rescueSpent || 0) === 0, { room: p.room, v: e.rescueSpent });

  const rescued = pathsOf(p.meta, "rescuedTo");
  for (const h of rescued) {
    if (h.v && Number.isInteger(h.v.x)) {
      const on = (p.structures?.extension || []).some((x) => x.x === h.v.x && x.y === h.v.y);
      hit(scores.rescuedToOnBoard, on, { room: p.room, to: `${h.v.x},${h.v.y}`, on });
    }
  }
  const rb = pathsOf(p.meta, "rolledBackFrom");
  for (const h of rb) {
    if (h.v && Number.isInteger(h.v.x)) {
      const on = (p.structures?.extension || []).some((x) => x.x === h.v.x && x.y === h.v.y);
      hit(scores.rolledBackOnBoard, !on, { room: p.room, from: `${h.v.x},${h.v.y}`, on });
    }
  }

  const sw = p.meta?.composeOpts?.takeTowerSwap;
  if (sw && Number.isInteger(sw.from?.x) && Number.isInteger(sw.to?.x)) {
    const cheb = Math.max(Math.abs(sw.from.x - sw.to.x), Math.abs(sw.from.y - sw.to.y));
    hit(scores.takeFromD8, cheb === 1, { room: p.room, cheb, from: sw.from, to: sw.to });
    const offer = p.meta?.towers?.towerSwapOffer?.best;
    const leaves = p.meta?.towers?.adjacency?.satAcrossPrior?.leaves;
    const match =
      (offer?.from && offer.from.x === sw.from.x && offer.from.y === sw.from.y) ||
      (leaves && leaves.x === sw.from.x && leaves.y === sw.from.y);
    hit(scores.takeFromOffer, match, { room: p.room });
  }

  for (const n of names) {
    const hits = pathsOf(p.meta, n);
    if (!hits.length) continue;
    loc[n].rooms++;
    for (const h of hits) loc[n].paths[h.path] = (loc[n].paths[h.path] || 0) + 1;
    if (!loc[n].sample) {
      loc[n].sample = {
        room: p.room,
        hits: hits.map((h) => {
          const v = h.v;
          let s;
          if (v == null || typeof v === "number" || typeof v === "boolean") s = v;
          else if (Array.isArray(v)) s = `arr${v.length}` + (v[0] && Number.isInteger(v[0].x) ? ` ${v.slice(0, 2).map((t) => t.x + "," + t.y).join(" ")}` : "");
          else if (Number.isInteger(v.x)) s = `${v.x},${v.y}`;
          else s = `{${Object.keys(v).slice(0, 6).join(",")}}`;
          return `${h.path}=${JSON.stringify(s)}`;
        }),
      };
    }
  }
}

function line(t) {
  const flag = t.bad === 0 && t.ok ? "OK  " : t.n === 0 ? "SKIP" : `NO  ${t.ok}/${t.n}`;
  return `${String(flag).padEnd(18)} ${t.name}`;
}

console.log("=== locations ===");
console.log(JSON.stringify(loc, null, 2));
console.log("\n--- scores ---");
for (const t of Object.values(scores)) {
  console.log(line(t), t.samples[0] ? JSON.stringify(t.samples[0]) : "");
}
