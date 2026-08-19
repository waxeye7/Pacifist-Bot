/**
 * r29p9 measure-first: remaining META_DARK presence twins.
 * Throwaway. Does not write the artifact. Do not commit.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PLANS = path.resolve(DIR, "../../out-v2/plans-hub.json");
const raw = fs.readFileSync(PLANS);
const md5 = crypto.createHash("md5").update(raw).digest("hex");
const plans = JSON.parse(raw.toString("utf8")).filter((p) => p && p.room && !p.error);
const D8 = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];
const K = (t) => `${t.x},${t.y}`;
const NW_TYPES = ["spawn", "storage", "terminal", "nuker", "tower"];

function walkPaths(obj, prefix, name, hits) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((el, i) => walkPaths(el, `${prefix}[${i}]`, name, hits));
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    const pth = prefix ? `${prefix}.${k}` : k;
    if (k === name) hits.push({ path: pth, type: Array.isArray(v) ? "array" : typeof v, v });
    if (v && typeof v === "object") walkPaths(v, pth, name, hits);
  }
}

function deriveCenter(plan) {
  const pts = [];
  for (const t of NW_TYPES) for (const p of plan.structures?.[t] || []) pts.push({ x: p.x, y: p.y, t });
  let mx = 0;
  let at = null;
  for (const a of pts) {
    for (let ox = -2; ox <= 2; ox++) {
      for (let oy = -2; oy <= 2; oy++) {
        const cx = a.x + ox, cy = a.y + oy;
        if (cx < 0 || cy < 0 || cx > 49 || cy > 49) continue;
        let n = 0;
        for (const b of pts) if (Math.abs(b.x - cx) <= 2 && Math.abs(b.y - cy) <= 2) n++;
        if (n > mx || (n === mx && at && (cy < at.y || (cy === at.y && cx < at.x)))) {
          mx = n;
          at = { x: cx, y: cy };
        }
      }
    }
  }
  return { mx, at };
}

function seatOf(plan) {
  if (!plan.mineral) return null;
  return (plan.structures?.container || []).find(
    (c) => Math.max(Math.abs(c.x - plan.mineral.x), Math.abs(c.y - plan.mineral.y)) <= 1,
  ) || null;
}

function finishedNet(plan, dropSeat) {
  const net = new Set((plan.structures?.road || []).map((r) => K(r)));
  for (const c of plan.structures?.container || []) net.add(K(c));
  if (dropSeat) {
    const seat = seatOf(plan);
    if (seat) net.delete(K(seat));
  }
  return net;
}

function seatNetD8(plan, dropSeat) {
  const seat = seatOf(plan);
  if (!seat) return null;
  const net = finishedNet(plan, dropSeat);
  const want = [];
  for (const [dx, dy] of D8) {
    const k = `${seat.x + dx},${seat.y + dy}`;
    if (net.has(k)) want.push(k);
  }
  want.sort();
  return want;
}

function hasCoveredDetour(plan) {
  const sfs = plan.meta?.shortfalls || [];
  const notes = plan.meta?.notes || [];
  const recs = plan.meta?.noteRecords || [];
  const sf = sfs.some((d) => d && (d.kind === "covered-detour" || d.class === "covered-detour" || (d.gate === "mobility" && d.kind === "covered-detour")));
  const note = notes.some((n) => {
    if (typeof n === "string") return /covered-detour|coveredDetour/.test(n);
    return n && (n.class === "covered-detour" || n.kind === "covered-detour" || n.cls === "covered-detour");
  });
  const rec = recs.some((n) => n && (n.class === "covered-detour" || n.kind === "covered-detour" || n.cls === "covered-detour" || n.rec?.kind === "covered-detour"));
  return { sf, note, rec, any: sf || note || rec };
}

const NAMES = ["nukerInWindow", "center", "mineralSeatNetTiles", "coveredDetourDeclared", "spurred"];
const pathCensus = {};
for (const name of NAMES) {
  const byPath = {};
  for (const p of plans) {
    const hits = [];
    walkPaths(p.meta, "meta", name, hits);
    for (const h of hits) {
      byPath[h.path] = (byPath[h.path] || 0) + 1;
    }
  }
  pathCensus[name] = byPath;
}

const T = (name) => ({ name, n: 0, match: 0, miss: 0, absent: 0, samples: [] });
function hit(t, ok, sample) {
  t.n++;
  if (ok) t.match++;
  else {
    t.miss++;
    if (t.samples.length < 6) t.samples.push(sample);
  }
}

const nuker = {
  paths: pathCensus.nukerInWindow,
  vsPublishedNw: T("nukerInWindow === nukeWindow.nukerInWindow"),
  vsPublishedBbox: T("nukerInWindow === nuker cheb<=2 of published center"),
  vsDerivedBbox: T("nukerInWindow === nuker cheb<=2 of derived center"),
  vsDerivedFlag: T("nukerInWindow === recomputeNukeWindow flag"),
  siblingVsNw: T("sibling nukerInWindow === nukeWindow.nukerInWindow"),
  types: {},
  trueCount: 0,
  falseCount: 0,
  otherCount: 0,
};
const centerT = {
  paths: pathCensus.center,
  vsDerived: T("center === derived window center"),
  vsPublishedNw: T("center === nukeWindow.center"),
};
const mineralT = {
  paths: pathCensus.mineralSeatNetTiles,
  vsFinishedInclSeat: T("mineralSeatNetTiles === finished-net D8 (seat stays on net)"),
  vsFinishedDropSeat: T("mineralSeatNetTiles === finished-net D8 (seat dropped from net)"),
  emptyWhenNoSeat: T("no seat => field absent or []"),
  nonempty: 0,
};
const covT = {
  paths: pathCensus.coveredDetourDeclared,
  vsSf: T("flag === shortfall covered-detour"),
  vsAny: T("flag === shortfall|note|noteRecord"),
  flagTrue: 0,
  flagFalse: 0,
  flagAbsent: 0,
  sfTrue: 0,
};
const spurT = {
  paths: pathCensus.spurred,
  eqLaid: T("spurred === laid.spur"),
  zeroIff: T("spurred===0 iff laid.spur===0"),
  eqShipped: T("spurred === shippedByKind.spur"),
  eq1orLaid: T("spurred is 0/1 OR === laid.spur"),
  mixed: [],
};

for (const p of plans) {
  const nw = p.meta?.towers?.nukeWindow;
  const nukerTile = (p.structures?.nuker || [])[0] || null;
  const der = deriveCenter(p);
  const hitsNiW = [];
  walkPaths(p.meta, "meta", "nukerInWindow", hitsNiW);
  for (const h of hitsNiW) {
    nuker.types[h.type] = (nuker.types[h.type] || 0) + 1;
    if (h.v === true) nuker.trueCount++;
    else if (h.v === false) nuker.falseCount++;
    else nuker.otherCount++;
    const pubFlag = nw && typeof nw.nukerInWindow === "boolean" ? nw.nukerInWindow : null;
    if (pubFlag !== null) {
      hit(nuker.vsPublishedNw, h.v === pubFlag, { room: p.room, path: h.path, v: h.v, pubFlag });
    }
    const bboxPub = !!(nukerTile && nw?.center && Math.abs(nukerTile.x - nw.center.x) <= 2 && Math.abs(nukerTile.y - nw.center.y) <= 2);
    hit(nuker.vsPublishedBbox, h.v === bboxPub, { room: p.room, path: h.path, v: h.v, bboxPub, center: nw?.center, nuker: nukerTile });
    const bboxDer = !!(nukerTile && der.at && Math.abs(nukerTile.x - der.at.x) <= 2 && Math.abs(nukerTile.y - der.at.y) <= 2);
    hit(nuker.vsDerivedBbox, h.v === bboxDer, { room: p.room, path: h.path, v: h.v, bboxDer, der: der.at });
    hit(nuker.vsDerivedFlag, h.v === bboxDer, { room: p.room, v: h.v, bboxDer });
    if (h.path !== "meta.towers.nukeWindow.nukerInWindow") {
      hit(nuker.siblingVsNw, h.v === pubFlag, { room: p.room, path: h.path, v: h.v, pubFlag });
    }
  }

  const hitsC = [];
  walkPaths(p.meta, "meta", "center", hitsC);
  for (const h of hitsC) {
    const got = h.v && typeof h.v === "object" ? h.v : null;
    const pub = nw?.center;
    hit(
      centerT.vsPublishedNw,
      !!(got && pub && got.x === pub.x && got.y === pub.y),
      { room: p.room, path: h.path, got, pub },
    );
    hit(
      centerT.vsDerived,
      !!(got && der.at && got.x === der.at.x && got.y === der.at.y),
      { room: p.room, path: h.path, got, der: der.at, mx: der.mx, value: nw?.value },
    );
  }

  const pubMin = p.meta?.misc?.mineralSeatNetTiles;
  const seat = seatOf(p);
  if (!Array.isArray(pubMin)) {
    mineralT.emptyWhenNoSeat.n++;
    if (!seat) mineralT.emptyWhenNoSeat.match++;
    else {
      mineralT.emptyWhenNoSeat.miss++;
      mineralT.emptyWhenNoSeat.samples.push({ room: p.room, seat, pubMin });
    }
  } else {
    if (pubMin.length) mineralT.nonempty++;
    const got = pubMin.map(String).sort().join("|");
    const a = (seatNetD8(p, false) || []).join("|");
    const b = (seatNetD8(p, true) || []).join("|");
    hit(mineralT.vsFinishedInclSeat, got === a, { room: p.room, got: pubMin, want: a });
    hit(mineralT.vsFinishedDropSeat, got === b, { room: p.room, got: pubMin, want: b });
  }

  const hitsCov = [];
  walkPaths(p.meta, "meta", "coveredDetourDeclared", hitsCov);
  const decl = hasCoveredDetour(p);
  if (decl.sf) covT.sfTrue++;
  if (!hitsCov.length) {
    covT.flagAbsent++;
    hit(covT.vsSf, decl.sf === false, { room: p.room, flag: "ABSENT", sf: decl.sf });
    hit(covT.vsAny, decl.any === false, { room: p.room, flag: "ABSENT", decl });
  } else {
    for (const h of hitsCov) {
      if (h.v === true) covT.flagTrue++;
      else if (h.v === false) covT.flagFalse++;
      hit(covT.vsSf, h.v === decl.sf, { room: p.room, path: h.path, v: h.v, sf: decl.sf });
      hit(covT.vsAny, h.v === decl.any, { room: p.room, path: h.path, v: h.v, decl });
    }
  }

  const spurred = p.meta?.walls?.spurred;
  const laid = p.meta?.walls?.laidByKind?.spur || 0;
  const shipped = p.meta?.walls?.shippedByKind?.spur || 0;
  if (typeof spurred === "number") {
    hit(spurT.eqLaid, spurred === laid, { room: p.room, spurred, laid });
    hit(spurT.zeroIff, (spurred === 0) === (laid === 0), { room: p.room, spurred, laid });
    hit(spurT.eqShipped, spurred === shipped, { room: p.room, spurred, shipped });
    const mixedOk = spurred === 0 || spurred === 1 || spurred === laid;
    hit(spurT.eq1orLaid, mixedOk, { room: p.room, spurred, laid });
    if (spurred !== laid && spurT.mixed.length < 8) spurT.mixed.push({ room: p.room, spurred, laid, shipped });
  }
}

const out = {
  md5,
  rooms: plans.length,
  pathCensus,
  nuker: {
    ...nuker,
    vsPublishedNw: nuker.vsPublishedNw,
    vsPublishedBbox: nuker.vsPublishedBbox,
    vsDerivedBbox: nuker.vsDerivedBbox,
    siblingVsNw: nuker.siblingVsNw,
  },
  center: centerT,
  mineral: mineralT,
  covered: covT,
  spurred: spurT,
};
fs.writeFileSync(path.join(DIR, "r29p9-census.json"), JSON.stringify(out, null, 2));
const brief = (t) => `${t.name}: ${t.match}/${t.n} match, ${t.miss} miss, absent=${t.absent || 0}`;
console.log(JSON.stringify({
  md5,
  rooms: plans.length,
  pathCensus,
  nukerTypes: nuker.types,
  nukerTF: { true: nuker.trueCount, false: nuker.falseCount, other: nuker.otherCount },
  nuker: [nuker.vsPublishedNw, nuker.vsPublishedBbox, nuker.vsDerivedBbox, nuker.siblingVsNw].map(brief),
  nukerMiss: {
    bbox: nuker.vsPublishedBbox.samples,
    sibling: nuker.siblingVsNw.samples,
  },
  center: [centerT.vsPublishedNw, centerT.vsDerived].map(brief),
  centerMiss: centerT.vsDerived.samples,
  mineral: [mineralT.vsFinishedInclSeat, mineralT.vsFinishedDropSeat].map(brief),
  mineralMiss: mineralT.vsFinishedDropSeat.samples,
  mineralNonempty: mineralT.nonempty,
  covered: [covT.vsSf, covT.vsAny].map(brief),
  coveredCounts: { flagTrue: covT.flagTrue, flagFalse: covT.flagFalse, flagAbsent: covT.flagAbsent, sfTrue: covT.sfTrue },
  coveredMiss: covT.vsSf.samples,
  spurred: [spurT.eqLaid, spurT.zeroIff, spurT.eqShipped, spurT.eq1orLaid].map(brief),
  spurredMixed: spurT.mixed,
}, null, 2));
