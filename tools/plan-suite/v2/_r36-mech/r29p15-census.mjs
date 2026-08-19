/**
 * r29p15 measure-first: leftover presence + seedScore. Throwaway. Do not commit.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { distanceTransform } from "../dt.mjs";
import { distField } from "../layer-hub.mjs";
import { fieldFrom } from "../layer-hub.mjs";
import { buildable, chebyshev, walkable } from "../shared.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.resolve(DIR, "../../out-v2/plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);
const rooms = JSON.parse(fs.readFileSync(process.env.ROOMS_FILE || path.resolve(DIR, "../_r28-mech/rooms.json"), "utf8"));
const byRoom = new Map(rooms.map((r) => [r.room, r]));

const INF = 999;
const MIN_EDGE = 6;
const MIN_ANCHOR_PATH = 4;
const CTRL_WEIGHT = 1.15;
const SRC_WEIGHT = 1.0;
const ENCLOSE_BONUS = 3.0;
const ENCLOSE_RANGE = 9;
const TARGET = 60;
const RICH_RATIO = 1.5;
const MAX_STUB_ROADS = 43;
const MAX_STUB_ROADS_RICH = 51;
const idx = (x, y) => x + y * 50;
const K = (t) => `${t.x},${t.y}`;
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const D8 = [...D4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

function seedScore(terrain, dt, x, y, fields, objectTiles) {
  if (!buildable(terrain, x, y)) return -Infinity;
  if (objectTiles.has(`${x},${y}`)) return -Infinity;
  const d = dt[idx(x, y)];
  if (d < 3) return -Infinity;
  const edge = Math.min(x, y, 49 - x, 49 - y);
  if (edge < MIN_EDGE) return -Infinity;
  let sum = 0;
  let maxD = 0;
  let minD = INF;
  let huggable = 0;
  for (let fi = 0; fi < fields.length; fi++) {
    const fd = fields[fi][idx(x, y)];
    if (fd >= INF) return -Infinity;
    const w = fi === fields.length - 1 ? CTRL_WEIGHT : SRC_WEIGHT;
    sum += fd * w;
    if (fd > maxD) maxD = fd;
    if (fd < minD) minD = fd;
    if (fd <= ENCLOSE_RANGE) huggable++;
  }
  if (minD < MIN_ANCHOR_PATH) return -Infinity;
  return dt[idx(x, y)] * 2.0 - sum * 1.0 - maxD * 0.35 + edge * 0.3 + huggable * ENCLOSE_BONUS;
}

function ter(d) {
  const t = d.terrain;
  if (typeof t === "string") return t;
  return t;
}

const T = (name) => ({ name, n: 0, match: 0, miss: 0, samples: [] });
function hit(t, ok, sample) {
  t.n++;
  if (ok) t.match++;
  else {
    t.miss++;
    if (t.samples.length < 5) t.samples.push(sample);
  }
}

const seed = {
  maxCand: T("seedScore === max cand"),
  atSeed: T("seedScore === score(plan.seed)"),
  atHub: T("seedScore === score(hub)"),
};
const stub = {
  enum4351: T("stubCap in {43,51}"),
  rich51: T("stubCap === 51 iff deepInterior/60 >= 1.5"),
  rich51cut: T("stubCap === 51 iff deepInsideCut/60 >= 1.5"),
  stubExh: T("stubExhausted === stubRoads >= stubCap"),
};
const cor = {
  placed60orFb: T("placed===60 || fb>0"),
  placedPlusFb60: T("placed+fb===60"),
  placedPlusFbExt: T("placed+fb===exts"),
  placedD4road: T("placed === exts D4 of a road"),
  fbNotD4: T("fb === exts not D4 of a road"),
};
const maxHub = {
  eqField: T("maxHubDist === max fieldFrom(sitter) over exts"),
};
const seatRes = {
  eqSeat: T("mineralSeatAtReservation === mineralSeat"),
  eqContainer: T("mineralSeatAtReservation === cheb1 container"),
  apprEq: T("mineralApproachAtReservation === mineralApproach"),
};
const shallowR = {
  eqShallowExtRam: T("shallowRamparts === shallow ext with rampart"),
  eqLen: T("shallowRamparts length === note shallow"),
};
const dig = {
  eqRlWall: T("digRoads === roadLayer on terrain wall"),
  eqShipWall: T("digRoads === shipped roads on terrain wall"),
  zeroIff0: T("digRoads===0 always"),
};

let deepHist = {};
let stubHist = {};

for (const p of plans) {
  const d = byRoom.get(p.room);
  if (!d) continue;
  const terrain = ter(d);
  const sources = p.sources || [];
  const controller = p.controller;
  const mineral = p.mineral;
  const objectTiles = new Set([
    ...sources.map((s) => K(s)),
    ...(controller ? [K(controller)] : []),
    ...(mineral ? [K(mineral)] : []),
  ]);
  const anchors = [...sources, controller].filter(Boolean);
  const fields = anchors.map((a) => distField(terrain, [a]));
  const dt = distanceTransform(terrain);

  let mx = -Infinity;
  let at = null;
  for (let x = MIN_EDGE; x <= 49 - MIN_EDGE; x++) {
    for (let y = MIN_EDGE; y <= 49 - MIN_EDGE; y++) {
      const sc = seedScore(terrain, dt, x, y, fields, objectTiles);
      if (sc > mx) {
        mx = sc;
        at = { x, y };
      }
    }
  }
  const wantMax = Number.isFinite(mx) ? Math.round(mx * 10) / 10 : null;
  const got = p.meta?.seedScore;
  hit(seed.maxCand, got === wantMax, { room: p.room, got, wantMax, at, seed: p.seed, skip: p.meta?.seedSkip });
  if (p.seed) {
    const sc = seedScore(terrain, dt, p.seed.x, p.seed.y, fields, objectTiles);
    hit(seed.atSeed, got === Math.round(sc * 10) / 10, { room: p.room, got, atSeed: Math.round(sc * 10) / 10 });
  }
  if (p.hub) {
    const sc = seedScore(terrain, dt, p.hub.x, p.hub.y, fields, objectTiles);
    hit(seed.atHub, got === Math.round(sc * 10) / 10, { room: p.room, got, atHub: Math.round(sc * 10) / 10 });
  }

  const e = p.meta?.extensions || {};
  const stubCap = e.stubCap;
  stubHist[stubCap] = (stubHist[stubCap] || 0) + 1;
  hit(stub.enum4351, stubCap === 43 || stubCap === 51, { room: p.room, stubCap });
  hit(stub.stubExh, !!e.stubExhausted === ((e.stubRoads || 0) >= stubCap), {
    room: p.room,
    stubExhausted: e.stubExhausted,
    stubRoads: e.stubRoads,
    stubCap,
  });

  // cheap deep counts
  const cut = new Set((p.meta?.shell?.cut || []).map(K));
  const ram = new Set((p.structures?.rampart || []).map(K));
  const occ = new Set();
  for (const t of ["spawn", "storage", "terminal", "tower", "lab", "nuker", "observer", "link", "extension"]) {
    for (const q of p.structures?.[t] || []) occ.add(K(q));
  }
  let deepInt = 0;
  let deepCut = 0;
  // exterior from cut
  const ext = new Uint8Array(2500);
  const q = [];
  for (let x = 0; x < 50; x++) {
    for (const y of [0, 49]) {
      const k = `${x},${y}`;
      if (!cut.has(k)) {
        ext[idx(x, y)] = 1;
        q.push(idx(x, y));
      }
    }
  }
  for (let y = 0; y < 50; y++) {
    for (const x of [0, 49]) {
      const i = idx(x, y);
      if (!ext[i] && !cut.has(`${x},${y}`)) {
        ext[i] = 1;
        q.push(i);
      }
    }
  }
  // skip proper flood for speed in first pass — use cheb depth from cut instead
  const placed = e.corridorPlaced;
  const fb = e.corridorFallback;
  const nExt = (p.structures?.extension || []).length;
  hit(cor.placed60orFb, placed === 60 || fb > 0, { room: p.room, placed, fb });
  hit(cor.placedPlusFb60, placed + fb === 60, { room: p.room, placed, fb });
  hit(cor.placedPlusFbExt, placed + fb === nExt, { room: p.room, placed, fb, nExt });
  const roads = new Set((p.structures?.road || []).map(K));
  const d4road = (p.structures?.extension || []).filter((x) =>
    D4.some(([dx, dy]) => roads.has(`${x.x + dx},${x.y + dy}`)),
  ).length;
  hit(cor.placedD4road, placed === d4road, { room: p.room, placed, d4road });
  hit(cor.fbNotD4, fb === nExt - d4road, { room: p.room, fb, not: nExt - d4road });

  if (p.sitter) {
    const hf = fieldFrom(terrain, p.sitter, occ);
    let mxh = 0;
    for (const ex of p.structures?.extension || []) {
      const v = hf[idx(ex.x, ex.y)];
      if (v < 9999 && v > mxh) mxh = v;
    }
    hit(maxHub.eqField, e.maxHubDist === mxh, { room: p.room, got: e.maxHubDist, mxh });
  }

  const res = p.meta?.mineralSeatAtReservation;
  const seat = p.meta?.mineralSeat;
  hit(
    seatRes.eqSeat,
    (!res && !seat) || (res && seat && res.x === seat.x && res.y === seat.y),
    { room: p.room, res, seat },
  );
  const cont = mineral ? (p.structures?.container || []).find((c) => chebyshev(c, mineral) <= 1) : null;
  hit(
    seatRes.eqContainer,
    (!res && !cont) || (res && cont && res.x === cont.x && res.y === cont.y),
    { room: p.room, res, cont },
  );
  const ap0 = p.meta?.mineralApproachAtReservation;
  const ap1 = p.meta?.mineralApproach;
  hit(
    seatRes.apprEq,
    (!ap0 && !ap1) || (ap0 && ap1 && ap0.x === ap1.x && ap0.y === ap1.y),
    { room: p.room, ap0, ap1 },
  );

  const sr = e.shallowRamparts ?? p.meta?.walls?.reflow?.shallowRamparts;
  void sr;
}

function line(t) {
  const flag = t.miss === 0 && t.n ? "MATCH" : t.n ? `MISS ${t.match}/${t.n}` : "SKIP";
  return `  ${flag.padEnd(18)} ${t.name}`;
}
console.log("seed");
for (const t of Object.values(seed)) console.log(line(t), t.samples[0] || "");
console.log("stub", stubHist);
for (const t of Object.values(stub)) console.log(line(t), t.samples[0] || "");
console.log("corridor");
for (const t of Object.values(cor)) console.log(line(t), t.samples[0] || "");
console.log("maxHub");
for (const t of Object.values(maxHub)) console.log(line(t), t.samples[0] || "");
console.log("seatRes");
for (const t of Object.values(seatRes)) console.log(line(t), t.samples[0] || "");
