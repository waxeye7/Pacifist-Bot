/**
 * Round-29 owner-voice probe. Independent of validate.mjs for board facts.
 * Terrain from _r28-mech/rooms.json. Mutates nothing. Never writes the artifact.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PLANS = path.join(DIR, "../../out-v2/plans-hub.json");
const ANIM = path.join(DIR, "../../out-v2/anim");
const PAGES = path.join(DIR, "../../out-v2");
const ROOMS = process.env.ROOMS_FILE || path.join(DIR, "../_r28-mech/rooms.json");

const raw = fs.readFileSync(PLANS);
const md5 = crypto.createHash("md5").update(raw).digest("hex");
const plans = JSON.parse(raw.toString("utf8")).filter((p) => p && p.room && !p.error);
const rooms = JSON.parse(fs.readFileSync(ROOMS, "utf8"));
const byTerrain = new Map(rooms.map((r) => [r.room, r]));

const D8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const D4 = [[1,0],[-1,0],[0,1],[0,-1]];
const K = (x, y) => `${x},${y}`;
const KT = (t) => K(t.x, t.y);
const WALL = 1;

function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function fmix32(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
function roomHash(room) {
  return fmix32(fnv1a32("round29-owner|" + room));
}

function tileAt(terrain, x, y) {
  if (x < 0 || x > 49 || y < 0 || y > 49) return WALL;
  return parseInt(terrain.charAt(y * 50 + x), 10);
}
function isWall(terrain, x, y) {
  return (tileAt(terrain, x, y) & WALL) > 0;
}
function walkable(terrain, x, y) {
  return x >= 0 && x <= 49 && y >= 0 && y <= 49 && !isWall(terrain, x, y);
}

function floodExterior(terrain, blockSet) {
  const e = new Uint8Array(2500);
  const q = [];
  for (let i = 0; i < 50; i++) {
    for (const [x, y] of [[i, 0], [i, 49], [0, i], [49, i]]) {
      if (!walkable(terrain, x, y) || blockSet.has(K(x, y))) continue;
      const ii = x + y * 50;
      if (!e[ii]) {
        e[ii] = 1;
        q.push(ii);
      }
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % 50,
      y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (!walkable(terrain, nx, ny) || blockSet.has(K(nx, ny))) continue;
      const ni = nx + ny * 50;
      if (e[ni]) continue;
      e[ni] = 1;
      q.push(ni);
    }
  }
  return e;
}

function depthFromExterior(ext) {
  const depth = new Int16Array(2500).fill(999);
  const q = [];
  for (let i = 0; i < 2500; i++) {
    if (ext[i]) {
      depth[i] = 0;
      q.push(i);
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % 50,
      y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = nx + ny * 50;
      if (depth[ni] <= depth[i] + 1) continue;
      depth[ni] = depth[i] + 1;
      q.push(ni);
    }
  }
  return depth;
}

function cheb(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function structMap(plan) {
  const m = new Map();
  for (const t of Object.keys(plan.structures || {})) {
    for (const p of plan.structures[t] || []) {
      const k = KT(p);
      const was = m.get(k);
      m.set(k, was ? was.concat(t) : [t]);
    }
  }
  return m;
}

function mineralSeat(plan) {
  if (!plan.mineral) return null;
  return (plan.structures?.container || []).find((c) => cheb(c, plan.mineral) <= 1) || null;
}

function netTiles(plan, excludeSeat) {
  const net = new Set((plan.structures?.road || []).map(KT));
  for (const c of plan.structures?.container || []) net.add(KT(c));
  if (excludeSeat) net.delete(KT(excludeSeat));
  return net;
}

function officialCensus(plan, seat) {
  const holdsAt = new Map();
  for (const t of Object.keys(plan.structures || {})) {
    for (const p of plan.structures[t] || []) {
      const k = KT(p);
      holdsAt.set(k, holdsAt.has(k) ? `${holdsAt.get(k)}+${t}` : t);
    }
  }
  const ring = [];
  const touching = [];
  const net = netTiles(plan, seat);
  for (const [dx, dy] of D8) {
    const x = seat.x + dx,
      y = seat.y + dy;
    if (x < 0 || y < 0 || x > 49 || y > 49) continue;
    const k = K(x, y);
    ring.push({ k, holds: `(${holdsAt.get(k) || "nothing of ours"})` });
    if (net.has(k)) touching.push(k);
  }
  let nearestRoad = null;
  for (const r of plan.structures?.road || []) {
    const d = cheb(r, seat);
    if (
      !nearestRoad ||
      d < nearestRoad.dist ||
      (d === nearestRoad.dist && (r.y < nearestRoad.y || (r.y === nearestRoad.y && r.x < nearestRoad.x)))
    ) {
      nearestRoad = { x: r.x, y: r.y, dist: d };
    }
  }
  return { ring, touching, nearestRoad, roadOnSeat: nearestRoad && nearestRoad.dist === 0 };
}

const CUT_DRIFT_WHY = {
  "remove|layer7-inertPrune":
    `This tile LEFT the declared cut: the rampart standing on it bought nothing this room can point at ` +
    `— it was not holding the seal, it carried no structure of ours, and no creep this room does not own ` +
    `can ever stand there — so the rampart was deleted, and a tile with no rampart on it is not wall. ` +
    `The pass that did it is the inert-rampart prune inside planWallRoads (layer 7, the first of this ` +
    `file's two prune calls), and its whole roster ships as meta.shell.inertPruned — this tile is in it.`,
  "remove|layer7b-inertPrune":
    `This tile LEFT the declared cut: the rampart standing on it bought nothing this room can point at ` +
    `— it was not holding the seal, it carried no structure of ours, and no creep this room does not own ` +
    `can ever stand there — so the rampart was deleted, and a tile with no rampart on it is not wall. ` +
    `The pass that did it is the inert-rampart prune inside finalizeRoom (layer 7b, the second of this ` +
    `file's two prune calls), and its whole roster ships as meta.shell.inertPruned — this tile is in it.`,
  "add|layer7-reconcileSeal":
    `This tile JOINED the declared cut: the single-removal seal test proves the rampart standing on it is ` +
    `holding the enclosure shut on its own, so it is a wall tile the cut layer 2 froze did not name. ` +
    `The pass that did it is the seal reconciliation inside planWallRoads (layer 7, the first of this ` +
    `file's two reconcile calls), and the evidence is the tile itself rather than a roster: re-flood the ` +
    `exterior over this room's ramparts with this one deleted and the flood reaches the sitter.`,
  "add|layer7b-reconcileSeal":
    `This tile JOINED the declared cut: the single-removal seal test proves the rampart standing on it is ` +
    `holding the enclosure shut on its own, so it is a wall tile the cut layer 2 froze did not name. ` +
    `The pass that did it is the seal reconciliation inside finalizeRoom (layer 7b, the second of this ` +
    `file's two reconcile calls), and the evidence is the tile itself rather than a roster: re-flood the ` +
    `exterior over this room's ramparts with this one deleted and the flood reaches the sitter.`,
};

const SEAT_OUT = "seat outside the shell — a container beyond the wall, covered where it stands";
const SEAT_IN_SHALLOW =
  "container cover — a container inside the shell on shallow floor, renting a rampart of its own";
const SEAT_IN_DEEP =
  "container cover — a container inside the shell at safe depth, renting a rampart of its own";

function hashed() {
  const rows = plans.map((p) => ({ room: p.room, h: roomHash(p.room) }));
  rows.sort((a, b) => a.h - b.h || a.room.localeCompare(b.room));
  return rows;
}

function fleetCutDrift() {
  let adds = 0,
    removes = 0;
  const roomsAdd = new Set();
  const roomsRem = new Set();
  const roomsAny = new Set();
  const addPass = {};
  const remPass = {};
  const whyMismatch = [];
  const leafKeys = new Set();
  const passLeafKeys = new Set();
  const passSlack = [];
  for (const p of plans) {
    const drift = p.meta?.shell?.cutDrift || [];
    const passes = p.meta?.shell?.cutPasses || [];
    if (drift.length) roomsAny.add(p.room);
    for (const e of drift) {
      for (const k of Object.keys(e || {})) leafKeys.add(k);
      if (e.op === "add") {
        adds++;
        roomsAdd.add(p.room);
        addPass[e.pass] = (addPass[e.pass] || 0) + 1;
      } else if (e.op === "remove") {
        removes++;
        roomsRem.add(p.room);
        remPass[e.pass] = (remPass[e.pass] || 0) + 1;
      }
      const want = CUT_DRIFT_WHY[`${e.op}|${e.pass}`];
      if (!want || e.why !== want) {
        whyMismatch.push({ room: p.room, tile: KT(e), op: e.op, pass: e.pass, hasWant: !!want });
      }
    }
    const rampN = (p.structures?.rampart || []).length;
    const inertN = (p.meta?.shell?.inertPruned || []).length;
    for (const mk of passes) {
      for (const k of Object.keys(mk || {})) passLeafKeys.add(k);
      if (mk && mk.kind === "reconcileSeal" && Number.isInteger(mk.sealCritical)) {
        passSlack.push({
          room: p.room,
          pass: mk.pass,
          kind: mk.kind,
          sealCritical: mk.sealCritical,
          adds: mk.adds,
          rampN,
          slackUp: rampN - mk.sealCritical,
          slackDown: mk.sealCritical - (mk.adds || 0),
        });
      }
      if (mk && mk.kind === "inertPrune") {
        passSlack.push({
          room: p.room,
          pass: mk.pass,
          kind: mk.kind,
          ramparts: mk.ramparts,
          rampartsDeleted: mk.rampartsDeleted,
          removes: mk.removes,
          slackRamp: mk.ramparts - mk.rampartsDeleted,
          slackDel: mk.rampartsDeleted - mk.removes,
          inertN,
        });
      }
    }
  }
  return {
    adds,
    removes,
    roomsAdd: [...roomsAdd].sort(),
    roomsRem: [...roomsRem].sort(),
    roomsAddN: roomsAdd.size,
    roomsRemN: roomsRem.size,
    roomsDriftN: roomsAny.size,
    addPass,
    remPass,
    whyMismatch,
    leafKeys: [...leafKeys],
    passLeafKeys: [...passLeafKeys],
    passSlack,
    sealSlackRooms: passSlack.filter((s) => s.kind === "reconcileSeal" && (s.slackUp > 0 || s.slackDown > 0)).length,
    pruneSlackRooms: passSlack.filter((s) => s.kind === "inertPrune" && (s.slackRamp > 0 || s.slackDel > 0)).length,
  };
}

function sealTest(terrain, rampSet, sitter, tileK) {
  if (!rampSet.has(tileK)) return false;
  const less = new Set(rampSet);
  less.delete(tileK);
  const ext = floodExterior(terrain, less);
  return !!ext[sitter.x + sitter.y * 50];
}

function rederiveAdds() {
  const roomsFailSeal = [];
  let ok = 0;
  const missingTerrain = [];
  for (const p of plans) {
    const d = byTerrain.get(p.room);
    if (!d) {
      missingTerrain.push(p.room);
      continue;
    }
    const ramp = new Set((p.structures?.rampart || []).map(KT));
    const sitter = p.sitter || p.hub;
    for (const e of (p.meta?.shell?.cutDrift || []).filter((x) => x.op === "add")) {
      if (sealTest(d.terrain, ramp, sitter, KT(e))) ok++;
      else roomsFailSeal.push({ room: p.room, tile: KT(e), pass: e.pass });
    }
  }
  return { ok, fail: roomsFailSeal, missingTerrain };
}

function replayIdentity() {
  const bad = [];
  for (const p of plans) {
    const freeze = new Set((p.meta?.shell?.cutAtFreeze || []).map(KT));
    const ship = new Set((p.meta?.shell?.cut || []).map(KT));
    const replay = new Set(freeze);
    for (const e of p.meta?.shell?.cutDrift || []) {
      if (e.op === "add") replay.add(KT(e));
      else if (e.op === "remove") replay.delete(KT(e));
    }
    const miss = [...ship].filter((k) => !replay.has(k));
    const extra = [...replay].filter((k) => !ship.has(k));
    if (miss.length || extra.length) bad.push({ room: p.room, miss, extra });
  }
  return { bad, n: bad.length };
}

function mineralWhyRooms(names) {
  const out = [];
  for (const name of names) {
    const p = plans.find((x) => x.room === name);
    if (!p) {
      out.push({ room: name, missing: true });
      continue;
    }
    const seat = mineralSeat(p);
    const why = p.meta?.misc?.mineralOffNetworkWhy || "";
    const c = seat ? officialCensus(p, seat) : null;
    const ringHit = /has these eight neighbours — (.+?) — so (\d+) of them put it on the network/.exec(why);
    const pubRing = ringHit
      ? ringHit[1].split(" · ").map((s) => {
          const m = /^(\d+,\d+)\s+(\(.+\))/.exec(s.trim());
          return m ? { k: m[1], holds: m[2] } : { raw: s };
        })
      : [];
    const ringDisagree = [];
    if (c && pubRing.length) {
      const a = new Map(pubRing.filter((r) => r.k).map((r) => [r.k, r.holds]));
      const b = new Map(c.ring.map((r) => [r.k, r.holds]));
      for (const [k, v] of a) if (b.get(k) !== v) ringDisagree.push({ k, pub: v, board: b.get(k) });
      for (const [k, v] of b) if (!a.has(k)) ringDisagree.push({ k, pub: null, board: v });
    }
    const seatHit = /mineral seat at (\d+),(\d+)/.exec(why);
    const nearHit = /nearest road tile this room ships is (\d+),(\d+), (\d+) step/.exec(why);
    const seatRoadPhrase = why.includes("the seat tile itself carries a road");
    out.push({
      room: name,
      mineral: p.mineral,
      seat,
      pubSeat: p.meta?.mineralSeat,
      seatMatchesPub: seat && p.meta?.mineralSeat && seat.x === p.meta.mineralSeat.x && seat.y === p.meta.mineralSeat.y,
      off: p.meta?.misc?.mineralOffNetwork,
      why,
      pubSeatInWhy: seatHit ? { x: +seatHit[1], y: +seatHit[2] } : null,
      pubTouch: ringHit ? +ringHit[2] : -1,
      derivedTouch: c ? c.touching : [],
      derivedNearest: c ? c.nearestRoad : null,
      roadOnSeat: c ? c.roadOnSeat : null,
      seatRoadPhrase,
      nearHit: nearHit && `${nearHit[1]},${nearHit[2]}@${nearHit[3]}`,
      pubRing,
      derivedRing: c ? c.ring : [],
      ringDisagree,
      suffixOff: why.includes("no road by design"),
      suffixOn: why.includes("no road was grown to it"),
      terrainPresent: !!byTerrain.get(name),
    });
  }
  return out;
}

function fleetMineralLies() {
  const lies = [];
  let off = 0,
    on = 0,
    exact = 0;
  for (const p of plans) {
    const why = p.meta?.misc?.mineralOffNetworkWhy;
    if (!why) continue;
    const seat = mineralSeat(p);
    if (!seat) continue;
    if (p.meta?.misc?.mineralOffNetwork) off++;
    else on++;
    const c = officialCensus(p, seat);
    const ringHit = /has these eight neighbours — (.+?) — so (\d+) of them put it on the network/.exec(why);
    const pubRing = ringHit
      ? ringHit[1].split(" · ").map((s) => {
          const m = /^(\d+,\d+)\s+(\(.+\))/.exec(s.trim());
          return m ? { k: m[1], holds: m[2] } : null;
        }).filter(Boolean)
      : [];
    const disagree = [];
    if (pubRing.length) {
      const a = new Map(pubRing.map((r) => [r.k, r.holds]));
      const b = new Map(c.ring.map((r) => [r.k, r.holds]));
      for (const [k, v] of a) if (b.get(k) !== v) disagree.push({ k, pub: v, board: b.get(k) });
      for (const [k, v] of b) if (!a.has(k)) disagree.push({ k, pub: null, board: v });
    }
    const seatRoadPhrase = why.includes("the seat tile itself carries a road");
    if (c.roadOnSeat && !seatRoadPhrase) {
      lies.push({ room: p.room, kind: "seat-road-not-named", seat: KT(seat) });
    }
    if (disagree.length) lies.push({ room: p.room, kind: "ring-mismatch", n: disagree.length, disagree: disagree.slice(0, 4) });
    if (!disagree.length && !(c.roadOnSeat && !seatRoadPhrase)) exact++;
  }
  return { off, on, exact, lies };
}

function labDiamond(plan) {
  const labs = plan.structures?.lab || [];
  if (labs.length !== 10) return { n: labs.length, ok: false };
  const xs = labs.map((l) => l.x);
  const ys = labs.map((l) => l.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const w = maxX - minX + 1,
    h = maxY - minY + 1;
  const set = new Set(labs.map(KT));
  const box16 = w === 4 && h === 4;
  let holes = 0;
  if (box16) {
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (!set.has(K(x, y))) holes++;
  }
  const sitter = plan.sitter || plan.hub;
  const haul = Math.min(...labs.map((l) => cheb(l, sitter)));
  return { n: 10, bbox: [minX, minY, maxX, maxY], w, h, holes, box16, haul };
}

function hubTrio(plan) {
  const sitter = plan.sitter || plan.hub;
  const st = (plan.structures?.storage || [])[0];
  const tm = (plan.structures?.terminal || [])[0];
  const links = plan.structures?.link || [];
  const hubLink = links.find((l) => cheb(l, sitter) <= 1);
  const ok =
    sitter &&
    st &&
    tm &&
    hubLink &&
    cheb(st, sitter) <= 1 &&
    cheb(tm, sitter) <= 1 &&
    cheb(hubLink, sitter) <= 1;
  let spawnMin = 99;
  const spawns = plan.structures?.spawn || [];
  for (let i = 0; i < spawns.length; i++)
    for (let j = i + 1; j < spawns.length; j++) spawnMin = Math.min(spawnMin, cheb(spawns[i], spawns[j]));
  return {
    sitter,
    storage: st,
    terminal: tm,
    hubLink,
    ok,
    spawnCheb: spawns.map((s) => cheb(s, sitter)).sort((a, b) => a - b),
    spawnPairs: spawnMin === 99 ? null : spawnMin,
  };
}

function visual(plan) {
  const extn = plan.structures?.extension || [];
  const roads = new Set((plan.structures?.road || []).map(KT));
  const ramp = new Set((plan.structures?.rampart || []).map(KT));
  const occ = structMap(plan);
  let noD4 = 0;
  const noD4Tiles = [];
  for (const e of extn) {
    if (!D4.some(([dx, dy]) => roads.has(K(e.x + dx, e.y + dy)))) {
      noD4++;
      noD4Tiles.push(KT(e));
    }
  }
  let bricks2 = 0;
  for (const e of extn) {
    const a = occ.get(K(e.x + 1, e.y)) || [];
    const b = occ.get(K(e.x, e.y + 1)) || [];
    const c = occ.get(K(e.x + 1, e.y + 1)) || [];
    if (a.includes("extension") && b.includes("extension") && c.includes("extension")) bricks2++;
  }
  let bricks3 = 0;
  for (const e of extn) {
    let ok = true;
    for (let dy = 0; dy < 3 && ok; dy++)
      for (let dx = 0; dx < 3 && ok; dx++) {
        if (!(occ.get(K(e.x + dx, e.y + dy)) || []).includes("extension")) ok = false;
      }
    if (ok) bricks3++;
  }
  const roadOnRamp = (plan.structures?.road || []).filter((r) => ramp.has(KT(r))).length;
  const towers = plan.structures?.tower || [];
  const sitter = plan.sitter || plan.hub;
  const clump = towers.filter((t) => cheb(t, sitter) <= 2).length;
  return {
    ext: extn.length,
    roads: (plan.structures?.road || []).length,
    ramparts: (plan.structures?.rampart || []).length,
    noD4,
    noD4Tiles,
    bricks2,
    bricks3,
    roadOnRamp,
    clump,
    labs: labDiamond(plan),
    hub: hubTrio(plan),
  };
}

function enclosure(plan, terrain) {
  const cut = plan.meta?.shell?.cut || plan.shell?.cut || [];
  const freeze = plan.meta?.shell?.cutAtFreeze || [];
  const ramp = plan.structures?.rampart || [];
  const cutSet = new Set(cut.map(KT));
  const freezeSet = new Set(freeze.map(KT));
  const rampSet = new Set(ramp.map(KT));
  const sitter = plan.sitter || plan.hub;
  const extCut = floodExterior(terrain, cutSet);
  const extFreeze = floodExterior(terrain, freezeSet);
  const extLive = floodExterior(terrain, rampSet);
  const si = sitter.x + sitter.y * 50;
  const coreTypes = ["spawn", "storage", "terminal", "tower", "nuker", "lab", "link", "extension"];
  const leakedLive = [];
  const leakedFreeze = [];
  for (const t of coreTypes) {
    for (const p of plan.structures?.[t] || []) {
      const i = p.x + p.y * 50;
      if (extLive[i]) leakedLive.push(`${t}@${KT(p)}`);
      if (extFreeze[i]) leakedFreeze.push(`${t}@${KT(p)}`);
    }
  }
  const depthLive = depthFromExterior(extLive);
  const shallowExt = [];
  for (const e of plan.structures?.extension || []) {
    const d = depthLive[e.x + e.y * 50];
    if (d < 4) shallowExt.push({ k: KT(e), d, ramp: rampSet.has(KT(e)) });
  }
  const redundant = [];
  const loadBearing = [];
  for (const t of cut) {
    const less = new Set(rampSet);
    less.delete(KT(t));
    const e = floodExterior(terrain, less);
    if (e[si]) loadBearing.push(KT(t));
    else redundant.push(KT(t));
  }
  return {
    cutN: cut.length,
    freezeN: freeze.length,
    rampN: ramp.length,
    sitterLeaks: {
      throughCut: !!extCut[si],
      throughFreeze: !!extFreeze[si],
      throughLive: !!extLive[si],
    },
    coreLeaksLive: leakedLive,
    coreLeaksFreeze: leakedFreeze,
    shallowExt,
    pubShallow: plan.meta?.extensions?.shallow,
    enclosedCtrl: plan.meta?.shell?.enclosedController,
    ctrl: plan.controller,
    ctrlExteriorLive: plan.controller ? !!extLive[plan.controller.x + plan.controller.y * 50] : null,
    ctrlExteriorFreeze: plan.controller ? !!extFreeze[plan.controller.x + plan.controller.y * 50] : null,
    enclosedSources: plan.meta?.shell?.enclosedSources,
    redundant,
    loadBearingN: loadBearing.length,
  };
}

function classifyRampart(plan, terrain, k, depthFreeze, extFreeze) {
  const [x, y] = k.split(",").map(Number);
  const cut = new Set((plan.meta?.shell?.cut || plan.shell?.cut || []).map(KT));
  const denial = new Set((plan.meta?.shell?.standDenial || plan.shell?.standDenial || []).map(KT));
  const occ = structMap(plan);
  const types = (occ.get(k) || []).filter((t) => t !== "rampart" && t !== "road");
  if (cut.has(k)) return { facet: "crossing", caption: "min-cut wall" };
  if (types.includes("container")) {
    const i = x + y * 50;
    const outside = !!extFreeze[i];
    if (outside) return { facet: "seat.outside", caption: SEAT_OUT };
    const deep = depthFreeze[i] >= 4;
    return { facet: "seat.inside", caption: deep ? SEAT_IN_DEEP : SEAT_IN_SHALLOW, depth: depthFreeze[i] };
  }
  if (denial.has(k)) return { facet: "ring", caption: "controller stand-denial ring" };
  if (types.length) {
    return {
      facet: "cover",
      caption: `personal cover — one ${types[0]} renting a rampart of its own`,
      occupant: types[0],
    };
  }
  return { facet: "unclassified", caption: "rampart this room's own taxonomy has no word for" };
}

function filmVsBoard(plan, terrain) {
  const fp = path.join(ANIM, `${plan.room}.json`);
  if (!fs.existsSync(fp)) return { missing: true };
  const film = JSON.parse(fs.readFileSync(fp, "utf8"));
  const freeze = new Set((plan.meta?.shell?.cutAtFreeze || []).map(KT));
  const extFreeze = floodExterior(terrain, freeze);
  const depthFreeze = depthFromExterior(extFreeze);
  const painted = [];
  for (const st of film.steps || []) {
    if (st.stage !== "ramparts") continue;
    const cells = st.cells || [];
    const cap = (st.label || "").replace(/\s+\d+\/\d+$/, "");
    for (let i = 0; i < cells.length; i += 3) painted.push({ x: cells[i], y: cells[i + 1], caption: cap, raw: st.label });
  }
  const disagrees = [];
  for (const t of painted) {
    const k = K(t.x, t.y);
    const want = classifyRampart(plan, terrain, k, depthFreeze, extFreeze);
    if (t.caption !== want.caption) disagrees.push({ k, film: t.caption, board: want.caption, facet: want.facet });
  }
  const ramp = new Set((plan.structures?.rampart || []).map(KT));
  const paintedSet = new Set(painted.map((t) => K(t.x, t.y)));
  const unpainted = [...ramp].filter((k) => !paintedSet.has(k));
  const extra = [...paintedSet].filter((k) => !ramp.has(k));
  return {
    planHash: film.planHash,
    census: film.rampartCensus,
    painted: painted.length,
    disagrees,
    unpainted,
    extra,
    nStepsRamp: (film.steps || []).filter((s) => s.stage === "ramparts").length,
  };
}

function pageBits(room) {
  const fp = path.join(PAGES, `${room}.html`);
  if (!fs.existsSync(fp)) return { missing: true };
  const html = fs.readFileSync(fp, "utf8");
  const sub = (html.match(/<p class="sub">([\s\S]*?)<\/p>/) || [])[1] || "";
  const counts = (sub.match(/<b class="ok">([^<]+)<\/b>/) || [])[1] || "";
  const mobSub = [...html.matchAll(/class="mob-sub"[^>]*>([\s\S]*?)<\//g)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim(),
  );
  const sf = [...html.matchAll(/class="sf-detail"[^>]*>([\s\S]*?)<\//g)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim(),
  );
  const nt = [...html.matchAll(/class="nt-detail"[^>]*>([\s\S]*?)<\//g)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim(),
  );
  const topics = [...html.matchAll(/class="nt-topic"[^>]*>([\s\S]*?)<\//g)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim(),
  );
  const gates = [...html.matchAll(/class="sf-gate"[^>]*>([\s\S]*?)<\//g)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim(),
  );
  const notesMap = (html.match(/const NOTES\s*=\s*(\{[\s\S]*?\});/) || [])[1];
  let notes = null;
  if (notesMap) {
    try {
      notes = Function(`return (${notesMap})`)();
    } catch {
      notes = { parseFail: true, head: notesMap.slice(0, 200) };
    }
  }
  return { counts, mobSub, sf: sf.slice(0, 8), nt: nt.slice(0, 12), topics, gates, notes };
}

function ascii(plan, terrain, pad = 1) {
  const occ = structMap(plan);
  const glyphs = {
    extension: "E",
    spawn: "S",
    tower: "T",
    lab: "L",
    storage: "O",
    terminal: "M",
    link: "K",
    nuker: "N",
    observer: "V",
    container: "C",
    extractor: "X",
    road: "=",
    rampart: "#",
  };
  const pts = [];
  for (const t of Object.keys(plan.structures || {})) {
    for (const p of plan.structures[t] || []) pts.push(p);
  }
  if (plan.controller) pts.push(plan.controller);
  if (plan.mineral) pts.push(plan.mineral);
  for (const s of plan.sources || []) pts.push(s);
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y);
  const x0 = Math.max(0, Math.min(...xs) - pad),
    x1 = Math.min(49, Math.max(...xs) + pad);
  const y0 = Math.max(0, Math.min(...ys) - pad),
    y1 = Math.min(49, Math.max(...ys) + pad);
  const lines = [];
  for (let y = y0; y <= y1; y++) {
    let row = "";
    for (let x = x0; x <= x1; x++) {
      const k = K(x, y);
      let g = ".";
      if (isWall(terrain, x, y)) g = "W";
      else if ((tileAt(terrain, x, y) & 2) > 0) g = "~";
      const types = occ.get(k) || [];
      const prio = [
        "spawn",
        "storage",
        "terminal",
        "nuker",
        "lab",
        "tower",
        "link",
        "observer",
        "extractor",
        "container",
        "extension",
        "road",
        "rampart",
      ];
      for (const t of prio) {
        if (types.includes(t)) {
          g = glyphs[t];
          break;
        }
      }
      if (plan.controller && plan.controller.x === x && plan.controller.y === y) g = "@";
      if (plan.mineral && plan.mineral.x === x && plan.mineral.y === y) g = "*";
      if ((plan.sources || []).some((s) => s.x === x && s.y === y)) g = "$";
      if (plan.sitter && plan.sitter.x === x && plan.sitter.y === y) g = "+";
      row += g;
    }
    lines.push(row);
  }
  return { x0, y0, x1, y1, lines };
}

function inspectRoom(name) {
  const p = plans.find((x) => x.room === name);
  const d = byTerrain.get(name);
  if (!p) return { room: name, missingPlan: true };
  if (!d) return { room: name, missingTerrain: true };
  const enc = enclosure(p, d.terrain);
  const vis = visual(p);
  const seat = mineralSeat(p);
  const film = filmVsBoard(p, d.terrain);
  const page = pageBits(name);
  const notes = (p.meta?.noteRecords || []).map((n) => ({
    cls: n.cls,
    detail: String(n.detail || n.rec?.detail || "").slice(0, 320),
  }));
  const sf = (p.meta?.shortfalls || []).map((s) => ({
    gate: s.gate,
    kind: s.kind,
    detail: String(s.detail || "").slice(0, 260),
  }));
  const walls = p.meta?.walls || {};
  return {
    room: name,
    enc,
    vis,
    mineral: {
      tile: p.mineral,
      seat,
      pub: p.meta?.mineralSeat,
      off: p.meta?.misc?.mineralOffNetwork,
      why: (p.meta?.misc?.mineralOffNetworkWhy || "").slice(0, 600),
      approach: p.meta?.mineralApproach,
    },
    film: {
      missing: film.missing,
      planHash: film.planHash,
      painted: film.painted,
      disagrees: film.disagrees,
      unpainted: film.unpainted,
      extra: film.extra,
      census: (film.census || []).map((r) => ({
        facet: r.facet,
        count: r.count,
        captions: (r.captions || []).map((c) => c.caption),
        emptyBecause: r.emptyBecause ? String(r.emptyBecause).slice(0, 180) : undefined,
      })),
    },
    page: {
      counts: page.counts,
      mobSub: page.mobSub,
      topics: page.topics,
      gates: page.gates,
      notesKeys: page.notes && !page.notes.parseFail ? Object.keys(page.notes) : page.notes,
      noteSnips:
        page.notes && !page.notes.parseFail
          ? Object.fromEntries(Object.entries(page.notes).map(([k, v]) => [k, String(v).slice(0, 280)]))
          : null,
      sf: page.sf,
      nt: page.nt,
    },
    prune: {
      pruned: walls.pruned,
      prunedGhosts: walls.prunedGhosts,
      prunedTransient: walls.prunedTransient,
      roadsPruneNote: page.notes && page.notes.roadsPrune,
    },
    notes,
    sf,
    map: ascii(p, d.terrain),
    counts: {
      ext: (p.structures?.extension || []).length,
      tower: (p.structures?.tower || []).length,
      lab: (p.structures?.lab || []).length,
      spawn: (p.structures?.spawn || []).length,
      link: (p.structures?.link || []).length,
      container: (p.structures?.container || []).length,
      road: (p.structures?.road || []).length,
      rampart: (p.structures?.rampart || []).length,
    },
    protectRadius: p.meta?.shell?.protectRadius,
    baseCut: p.meta?.shell?.baseCut,
    cutAdopted: p.meta?.shell?.cutAdopted,
    mobility: p.meta?.walls?.mobility && {
      maxGated: p.meta.walls.mobility.maxGated,
      target: p.meta.walls.mobility.target,
      builtGated: p.meta.walls.mobility.builtGated,
    },
  };
}

const ranks = hashed();
const five = ranks.slice(0, 5).map((r) => r.room);
const mandated = ["E12S1", "E15S4", "E11S1", "E12S7", "E12S6", "E7S5", "E9S2", "E2S7", "E1S4"];
const sample = [...new Set([...five, ...mandated])];

const drift = fleetCutDrift();
const addSeal = rederiveAdds();
const replay = replayIdentity();
const mineral3 = mineralWhyRooms(["E2S5", "E5S1", "E5S3"]);
const mineralFleet = fleetMineralLies();

const roomsOut = {};
for (const r of sample) roomsOut[r] = inspectRoom(r);

const fleet = {
  rooms: plans.length,
  ext: plans.reduce((a, p) => a + (p.structures?.extension || []).length, 0),
  roads: plans.reduce((a, p) => a + (p.structures?.road || []).length, 0),
  ramparts: plans.reduce((a, p) => a + (p.structures?.rampart || []).length, 0),
  decls: plans.reduce((a, p) => a + (p.meta?.shortfalls || []).length, 0),
  notes: plans.reduce((a, p) => a + (p.meta?.noteRecords || []).length, 0),
  noteRecords: plans.reduce((a, p) => a + (p.meta?.noteRecords || []).length, 0),
  errors: plans.filter((p) => p.error).length,
};

const pruneJam = [];
for (const p of plans) {
  const w = p.meta?.walls;
  if (!w) continue;
  if (typeof w.pruned === "number" && typeof w.prunedGhosts === "number" && w.pruned !== w.prunedGhosts) {
    pruneJam.push({
      room: p.room,
      pruned: w.pruned,
      ghosts: w.prunedGhosts,
      transient: w.prunedTransient,
    });
  }
}

const out = {
  md5,
  expectMd5: "c2e6039a7ac5816c1c6c40161685354a",
  roomsDump: rooms.length,
  dumpRooms: rooms.map((r) => r.room).sort(),
  planRooms: plans.map((p) => p.room).sort(),
  fleet,
  hash: { five, fiveFull: ranks.slice(0, 5), mandatedHashes: mandated.map((r) => ({ room: r, h: roomHash(r) })) },
  drift: { ...drift, passSlack: undefined, slackSample: drift.passSlack.filter((s) => s.kind === "reconcileSeal" && s.slackUp > 0).slice(0, 8) },
  addSeal,
  replay,
  mineral3,
  mineralFleet,
  pruneJam,
  rooms: roomsOut,
};

fs.writeFileSync(path.join(DIR, "probe-out.json"), JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      md5,
      md5Ok: md5 === "c2e6039a7ac5816c1c6c40161685354a",
      rooms: plans.length,
      terrain: rooms.length,
      five,
      fiveH: ranks.slice(0, 5),
      fleet,
      driftAdds: drift.adds,
      roomsAdd: drift.roomsAddN,
      roomsRem: drift.roomsRemN,
      roomsDrift: drift.roomsDriftN,
      addPass: drift.addPass,
      remPass: drift.remPass,
      whyMismatch: drift.whyMismatch.length,
      addSealOk: addSeal.ok,
      addSealFail: addSeal.fail.length,
      replayBad: replay.n,
      mineralLies: mineralFleet.lies,
      mineralExact: mineralFleet.exact,
      pruneJamN: pruneJam.length,
      filmDisagree: Object.fromEntries(
        sample.map((r) => [r, (roomsOut[r].film && roomsOut[r].film.disagrees && roomsOut[r].film.disagrees.length) || 0]),
      ),
      leaks: Object.fromEntries(sample.map((r) => [r, roomsOut[r].enc && roomsOut[r].enc.sitterLeaks])),
    },
    null,
    2,
  ),
);
