/**
 * r29p18 strandedFirst / deepBudget / worstCase walks. Throwaway.
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
    if (t.samples.length < 6) t.samples.push(sample);
  }
}

const scores = {
  strandEqBridge: T("strandedFirst === conductBridge.stranded.length"),
  strandEqAdded: T("strandedFirst === conductBridge.added.length"),
  strandEqLane: T("strandedFirst === laneMeta.stranded"),
  strandEqTiles: T("strandedFirst === laneMeta.tiles"),
  deepEqLanes: T("deepBudget === laneMeta.tiles or rounds"),
  deepEqRescue: T("deepBudget === EXT_RESCUE or 4/8"),
  worstNull: T("worstCase is null"),
  worstEqBound: T("worstCase === laneMeta.bound or boundLap"),
  worstEqBuilt: T("worstCase === laneMeta.builtLap"),
  freeLeftNonneg: T("freeLeft >= 0"),
};

const samples = [];

for (const p of plans) {
  const e = p.meta?.extensions || {};
  const w = p.meta?.walls || {};
  const lane = e.laneMeta || {};
  const cb = w.conductBridge || {};
  const sf = lane.strandedFirst;
  const db = lane.deepBudget;
  const wc = lane.worstCase;
  const wcu = lane.worstCaseUngated;

  hit(scores.strandEqBridge, sf === (cb.stranded || []).length, {
    room: p.room,
    sf,
    stranded: (cb.stranded || []).length,
  });
  hit(scores.strandEqAdded, sf === (cb.added || []).length, { room: p.room, sf, added: (cb.added || []).length });
  hit(scores.strandEqLane, sf === lane.stranded, { room: p.room, sf, stranded: lane.stranded });
  hit(scores.strandEqTiles, sf === lane.tiles, { room: p.room, sf, tiles: lane.tiles });

  hit(scores.deepEqLanes, db === lane.tiles || db === lane.rounds || db === (lane.tiles || 0) + 8, {
    room: p.room,
    db,
    tiles: lane.tiles,
    rounds: lane.rounds,
  });
  hit(scores.deepEqRescue, db === 4 || db === 8 || db === 0, { room: p.room, db });

  hit(scores.worstNull, wc == null, { room: p.room, wc });
  hit(scores.worstEqBound, wc === lane.bound || wc === lane.boundLap || wc === e.boundLap, {
    room: p.room,
    wc,
    bound: lane.bound,
    boundLap: lane.boundLap,
  });
  hit(scores.worstEqBuilt, wc === lane.builtLap, { room: p.room, wc, built: lane.builtLap });

  if (typeof e.reflow?.freeLeft === "number") {
    hit(scores.freeLeftNonneg, e.reflow.freeLeft >= 0, { room: p.room, v: e.reflow.freeLeft });
  }

  if (samples.length < 4) {
    samples.push({
      room: p.room,
      strandedFirst: sf,
      stranded: lane.stranded,
      tiles: lane.tiles,
      rounds: lane.rounds,
      deepBudget: db,
      worstCase: wc,
      worstCaseUngated: wcu,
      builtLap: lane.builtLap,
      boundLap: lane.boundLap,
      bound: lane.bound,
      cbStranded: (cb.stranded || []).length,
      cbAdded: (cb.added || []).length,
      laneKeys: Object.keys(lane),
    });
  }
}

function line(t) {
  const flag = t.bad === 0 && t.ok ? "OK  " : t.n === 0 ? "SKIP" : `NO  ${t.ok}/${t.n}`;
  return `${String(flag).padEnd(18)} ${t.name}`;
}

console.log("=== samples ===");
console.log(JSON.stringify(samples, null, 2));
console.log("\n--- scores ---");
for (const t of Object.values(scores)) {
  console.log(line(t), t.samples[0] ? JSON.stringify(t.samples[0]) : "");
}

const dbH = {};
const sfH = {};
const wcH = { null: 0, num: 0 };
for (const p of plans) {
  const lane = p.meta?.extensions?.laneMeta || {};
  dbH[lane.deepBudget] = (dbH[lane.deepBudget] || 0) + 1;
  sfH[lane.strandedFirst] = (sfH[lane.strandedFirst] || 0) + 1;
  if (lane.worstCase == null) wcH.null++;
  else wcH.num++;
}
console.log("deepBudget hist", dbH);
console.log("strandedFirst hist", sfH);
console.log("worstCase", wcH);
