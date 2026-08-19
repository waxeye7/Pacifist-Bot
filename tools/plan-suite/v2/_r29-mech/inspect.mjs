/**
 * Inspect hash-five + mandated rooms. Board facts from terrain + structures.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom } from "../validate.mjs";
import {
  D4,
  D8,
  K,
  KT,
  cheb,
  depthFromExterior,
  floodExterior,
  hashedRooms,
  idx,
  loadPlans,
  loadRooms,
  mineralSeat,
  realFails,
  structHolds,
} from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const hashed = hashedRooms(plans);
const named = ["E11S1", "E11S2", "E11S3", "E11S7", "E2S7"];
const sample = [...new Set([...hashed.slice(0, 5).map((r) => r.room), ...named])];

function inspect(plan) {
  const d = byRoom.get(plan.room);
  const s = plan.structures || {};
  const sh = plan.meta?.shell || {};
  const ramps = new Set((s.rampart || []).map(K));
  const roads = new Set((s.road || []).map(K));
  const cut = new Set((sh.cut || []).map(K));
  const freeze = new Set((sh.cutAtFreeze || []).map(K));
  const sitter = plan.sitter || plan.hub;
  const ext = floodExterior(d.terrain, ramps);
  const cutFlood = floodExterior(d.terrain, cut);
  const freezeFlood = floodExterior(d.terrain, freeze);
  const depth = depthFromExterior(ext);
  const leaks = [];
  for (const t of Object.keys(s)) {
    if (t === "road" || t === "rampart") continue;
    for (const p of s[t] || []) {
      if (ext[idx(p.x, p.y)] && !ramps.has(K(p)) && t !== "extractor") leaks.push(`${t}@${K(p)}`);
    }
  }
  const core = ["storage", "spawn", "terminal", "tower", "lab", "nuker", "observer"];
  const coreThroughCut = [];
  const coreThroughFreeze = [];
  for (const t of core) {
    for (const p of s[t] || []) {
      if (cutFlood[idx(p.x, p.y)]) coreThroughCut.push(`${t}@${K(p)}`);
      if (freezeFlood[idx(p.x, p.y)]) coreThroughFreeze.push(`${t}@${K(p)}`);
    }
  }
  const sitterCutOut = sitter ? !!cutFlood[idx(sitter.x, sitter.y)] : null;
  const sitterFreezeOut = sitter ? !!freezeFlood[idx(sitter.x, sitter.y)] : null;
  let shallowExt = 0;
  let shallowExtBare = 0;
  for (const e of s.extension || []) {
    if (depth[idx(e.x, e.y)] < 4) {
      shallowExt++;
      if (!ramps.has(K(e))) shallowExtBare++;
    }
  }
  let noD4 = 0;
  for (const e of s.extension || []) {
    if (!D4.some(([dx, dy]) => roads.has(KT(e.x + dx, e.y + dy)))) noD4++;
  }
  const seat = mineralSeat(plan);
  const holds = structHolds(plan);
  let mineral = null;
  if (seat) {
    const net = new Set((s.road || []).map(K));
    for (const c of s.container || []) net.add(K(c));
    net.delete(K(seat));
    const ring = [];
    let touch = 0;
    for (const [dx, dy] of D8) {
      const x = seat.x + dx, y = seat.y + dy;
      if (x < 0 || y < 0 || x > 49 || y > 49) continue;
      const k = KT(x, y);
      const h = holds.get(k) || "nothing of ours";
      ring.push(`${k} (${h})`);
      if (net.has(k)) touch++;
    }
    const why = plan.meta?.misc?.mineralOffNetworkWhy || "";
    mineral = {
      seat: K(seat),
      metaSeat: plan.meta?.mineralSeat ? K(plan.meta.mineralSeat) : null,
      seatHasRoad: roads.has(K(seat)),
      seatHasRamp: ramps.has(K(seat)),
      touch,
      ring,
      publishedOn: why.includes("DOES touch"),
      publishedOff: why.includes("no road by design"),
      whyLen: why.length,
    };
  }
  const L = plan.meta?.extensions?.laneMeta || {};
  const sf = (plan.meta?.shortfalls || []).find((x) => x && x.ladder);
  const recov = plan.meta?.sealedRecovery;
  const res = checkRoom(plan, d.terrain, d.objects, null);
  const fails = realFails(res);
  return {
    room: plan.room,
    hash: hashed.find((h) => h.room === plan.room)?.h ?? null,
    counts: {
      ext: (s.extension || []).length,
      roads: (s.road || []).length,
      ramparts: (s.rampart || []).length,
      cut: (sh.cut || []).length,
      freeze: (sh.cutAtFreeze || []).length,
      towers: (s.tower || []).length,
      labs: (s.lab || []).length,
      decls: (plan.meta?.shortfalls || []).length,
      notes: (plan.meta?.notes || []).length,
    },
    enclosure: {
      leaks,
      sitterCutOut,
      sitterFreezeOut,
      coreThroughCut,
      coreThroughFreeze,
      enclosedController: sh.enclosedController,
      enclosedSources: sh.enclosedSources,
      baseCut: sh.baseCut,
      protectRadius: sh.protectRadius,
      priceyWall: sh.priceyWall,
      battlementUnreachable: sh.battlementUnreachable,
    },
    shallow: {
      derived: shallowExt,
      published: plan.meta?.extensions?.shallow ?? null,
      bare: shallowExtBare,
      noD4,
    },
    mineral,
    lane: {
      tiles: L.tiles,
      rounds: L.rounds,
      shrunk: L.shrunk || null,
      dropped: L.dropped || false,
      fullRun: L.fullRun || null,
    },
    ladder: sf
      ? {
          rungs: sf.ladder.rungs.map((r) => ({
            bonus: r.needDeepBonus,
            ramparts: r.ramparts,
            mobility: r.mobility,
            cut: Array.isArray(r.cutTiles) ? r.cutTiles.length : 0,
          })),
          hasEsc: !!plan.meta?.shellEscalation,
          escRungs: (plan.meta?.shellEscalation?.rungs || []).map((r) => ({
            bonus: r.needDeepBonus,
            ramparts: r.ramparts,
            mobility: r.mobility,
            cut: Array.isArray(r.cutTiles) ? r.cutTiles.length : 0,
          })),
        }
      : null,
    recovery: recov
      ? {
          outcome: recov.outcome,
          fixed: (recov.fixedHolders || []).map((h) => `${h.type}@${K(h)}=${h.recovers}/${h.recoversDeep}`),
        }
      : null,
    seed: {
      seed: plan.meta?.seed ?? null,
      seedScore: plan.meta?.seedScore ?? null,
      seedSkip: plan.meta?.seedSkip ?? null,
      seedPool: plan.meta?.seedPool ?? null,
      hub: plan.hub || null,
      sitter,
    },
    gate: { fails: fails.length, first: fails[0] || null, declared: res.declared },
  };
}

const out = {
  hashFive: hashed.slice(0, 5),
  rooms: sample.map((name) => {
    const p = plans.find((x) => x.room === name);
    if (!p) return { room: name, err: "missing" };
    return inspect(p);
  }),
};

fs.writeFileSync(path.join(DIR, "inspect.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ hashFive: out.hashFive, rooms: out.rooms.map((r) => ({
  room: r.room,
  counts: r.counts,
  leaks: r.enclosure?.leaks,
  sitterCutOut: r.enclosure?.sitterCutOut,
  shallow: r.shallow,
  mineral: r.mineral && { seat: r.mineral.seat, touch: r.mineral.touch, on: r.mineral.publishedOn, off: r.mineral.publishedOff, seatRoad: r.mineral.seatHasRoad },
  lane: r.lane && { tiles: r.lane.tiles, ran: r.lane.fullRun?.ran, shrunk: !!r.lane.shrunk },
  recov: r.recovery,
  seed: r.seed,
  gate: r.gate,
}) ) }, null, 2));
