/**
 * Round-30 hostile mutations. In-memory checkRoom only. Never writes the artifact.
 * Does not import validate internals for the facts claimed — only checkRoom on clones.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderDecl } from "../declprose.mjs";
import { renderNote } from "../declprose-notes.mjs";
import { enclosureMobility } from "../layer-shell.mjs";
import { renderSwapOfferBasis, MIN_SAT } from "../layer-towers.mjs";
import { MINERAL_OFF_NETWORK_BASIS, MINERAL_ON_NETWORK_BASIS } from "../layer-misc.mjs";
import { META_DARK } from "../r27-gates.mjs";
import { K, loadPlans, loadRooms, makeChecker, syncLane } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);
const find = (pred) => plans.find((p) => { try { return pred(p); } catch { return false; } });
const any = (pred) => find(pred)?.room || null;

const results = [];
function rec(r) {
  results.push(r);
  console.log(String(r.status).padEnd(8), r.name, r.room, String(r.detail || "").slice(0, 220));
}

const R = plans[0].room;
const rooms = {
  mineral: any((p) => typeof p.meta?.misc?.mineralOffNetworkWhy === "string") || R,
  mineralOff: any((p) =>
    typeof p.meta?.misc?.mineralOffNetworkWhy === "string" &&
    p.meta.misc.mineralOffNetworkWhy.includes("no road by design")) || "E11S1",
  residue: ["E2S5", "E5S1", "E5S3"].filter((r) => byPlan.has(r)),
  swap: any((p) => typeof p.meta?.towers?.towerSwapOffer?.basis === "string" && /face at \d+/.test(p.meta.towers.towerSwapOffer.basis)) || R,
  battlement: any((p) => (p.meta?.shell?.battlementUnreachable || 0) > 0) || "E13S3",
  adoptEmpty: any((p) => Array.isArray(p.meta?.shell?.cutAdopted) && p.meta.shell.cutAdopted.length === 0 && (p.structures?.rampart || []).length) || R,
  adoptAdds: any((p) => (p.meta?.shell?.cutDrift || []).some((e) => e && e.op === "add") && Array.isArray(p.meta?.shell?.cutAdopted)) || "E13S3",
  dmg: any((p) => p.meta?.shell?.shippedShellDmg && typeof p.meta.shell.shippedShellDmg.min === "number") || R,
  mob: any((p) => p.meta?.shell?.mobilityShipped && typeof p.meta.shell.mobilityShipped.maxGated === "number" && p.meta.shell.mobilityShipped.maxGated !== 0) || R,
  refill: any((p) => typeof p.meta?.towers?.refillBasis === "string" && /with \d+ tile\(s\) blocked/.test(p.meta.towers.refillBasis)) || R,
  cutPasses: any((p) => (p.meta?.shell?.cutPasses || []).some((m) => m && m.kind === "reconcileSeal" && Number.isInteger(m.sealCritical))) || R,
  prunePass: any((p) => (p.meta?.shell?.cutPasses || []).some((m) => m && m.kind === "inertPrune" && m.rampartsDeleted > 0)) || R,
  twoPrune: any((p) => {
    const a = (p.meta?.shell?.cutPasses || []).find((m) => m && m.pass === "layer7-inertPrune");
    const b = (p.meta?.shell?.cutPasses || []).find((m) => m && m.pass === "layer7b-inertPrune");
    return a && b && a.rampartsDeleted > 0 && b.rampartsDeleted > 0;
  }) || null,
  nuker: any((p) => typeof p.meta?.misc?.nukerHubDist === "number" && p.meta.misc.nukerHubDist !== 1) || R,
  observer: any((p) => typeof p.meta?.misc?.observerHubDist === "number" && p.meta.misc.observerHubDist !== 1) || R,
  refillU: any((p) => Array.isArray(p.meta?.towers?.refillDistsUnblocked) && p.meta.towers.refillDistsUnblocked.some((v) => v !== 1)) || R,
  protect: any((p) => typeof p.meta?.shell?.protectRadius === "number" && p.meta.shell.protectRadius !== 12) || R,
  pricey: any((p) => p.meta?.shell?.priceyWall) || R,
  baseCut: any((p) => typeof p.meta?.shell?.baseCut === "number" && p.meta.shell.baseCut > 1 && p.meta.shell.baseCut <= 45) || R,
  bubble: any((p) => p.meta?.misc?.mineralBubble > 0) || R,
  swamp: any((p) => (p.meta?.walls?.swampPaved || 0) > 0) || R,
  spur: any((p) => (p.meta?.walls?.spurred || 0) > 1 && (p.meta?.walls?.laidByKind?.spur || 0) > 0) || R,
  newRoads: any((p) => (p.meta?.towers?.newRoads || 0) > 0) || R,
  ladderFat: any((p) => {
    const shipped = (p.structures?.rampart || []).length;
    const rows = [
      ...((p.meta?.shortfalls || []).find((s) => s?.ladder)?.ladder?.rungs || []),
      ...(p.meta?.shellEscalation?.rungs || []),
    ];
    return rows.some((r) => r && r.ramparts > shipped && Array.isArray(r.cutTiles) && r.cutTiles.length);
  }) || "E11S2",
  ladderAny: "E11S2",
  recovLadder: any((p) => {
    if (p.meta?.shellEscalation) return false;
    const sf = (p.meta?.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
    return !!(sf && sf.ladder.rungs.some((r) => r && Array.isArray(r.cutTiles) && r.cutTiles.length));
  }),
  fatCutNeFreeze: any((p) => {
    const shipped = (p.structures?.rampart || []).length;
    const freeze = new Set((p.meta?.shell?.cutAtFreeze || []).map(K));
    const cut = p.meta?.shell?.cut || [];
    const same = freeze.size && cut.length === freeze.size && cut.every((t) => freeze.has(K(t)));
    if (same) return false;
    const rows = [...((p.meta?.shortfalls || []).find((s) => s?.ladder)?.ladder?.rungs || []), ...(p.meta?.shellEscalation?.rungs || [])];
    return rows.some((r) => r && r.ramparts > shipped && Array.isArray(r.cutTiles) && r.cutTiles.length);
  }),
  plain: any((p) => {
    const L = p.meta?.extensions?.laneMeta;
    return !!(L && L.fullRun && !L.fullRun.ran && !L.shrunk && !L.dropped && Array.isArray(L.fullRun.reserved));
  }) || "E11S3",
  shrunk: any((p) => p.meta?.extensions?.laneMeta?.shrunk && Array.isArray(p.meta.extensions.laneMeta.fullRun?.reserved) && Array.isArray(p.meta.extensions.laneMeta.fullRun?.byRound)),
  droppedRoom: any((p) => p.meta?.extensions?.laneMeta?.dropped === true && Array.isArray(p.meta.extensions.laneMeta.fullRun?.reserved)),
  taken: any((p) => p.meta?.sealedRecovery?.outcome === "taken") || "E11S7",
  takenFixed: any((p) => p.meta?.sealedRecovery?.outcome === "taken" && (p.meta.sealedRecovery.fixedHolders || []).length) || "E15S6",
  preTakeHold: any((p) => {
    const pks = p.meta?.sealedFloor?.pockets || p.meta?.sealedRecovery?.pockets || [];
    return pks.some((pk) => (pk?.holders || []).length);
  }) || "E11S7",
  seedSkip: any((p) => p.meta?.seedSkip > 0) || "E12S5",
  seedScore: any((p) => typeof p.meta?.seedScore === "number") || "E12S5",
  seedCoord: any((p) => p.seed && Number.isInteger(p.seed.x)) || "E11S1",
  ec: any((p) => Array.isArray(p.meta?.exteriorContract) && p.meta.exteriorContract.length >= 3),
};

// =====================================================================
// Criticism 98
// =====================================================================
rec(run("98-named-forge-fullRun-plus-shrink", rooms.plain, (p) => {
  const L = p.meta.extensions.laneMeta;
  const shrunk = { from: 10, to: 4, wanted: (L.tiles || 3) + 12, premium: 0 };
  L.fullRun = {
    ...(L.fullRun || {}),
    tiles: shrunk.wanted,
    rounds: 10,
    shallow: 2,
    ext: 58,
    ran: true,
    used: 10,
    to: 4,
  };
  L.shrunk = shrunk;
  L.rounds = 4;
  L.roundCap = 4;
  L.dropped = false;
  syncLane(p);
}));

rec(run("98-delete-fullRun-reserved", rooms.plain, (p) => {
  delete p.meta.extensions.laneMeta.fullRun.reserved;
  syncLane(p);
}));

rec(run("98-delete-fullRun", rooms.plain, (p) => {
  delete p.meta.extensions.laneMeta.fullRun;
  syncLane(p);
}));

rec(run("98-delete-lane-reserved", rooms.plain, (p) => {
  delete p.meta.extensions.laneMeta.reserved;
  syncLane(p);
}));

rec(run("98-60-0-shallow-rewrite-keep", rooms.plain, (p) => {
  const L = p.meta.extensions.laneMeta;
  L.fullRun.shallow = 2;
  L.fullRun.ext = 58;
  L.fullRun.ran = true;
  syncLane(p);
}));

rec(run("98-60-0-shallow-rewrite-ran-false", rooms.plain, (p) => {
  const L = p.meta.extensions.laneMeta;
  L.fullRun.shallow = 2;
  L.fullRun.ext = 58;
  L.fullRun.ran = false;
  syncLane(p);
}));

rec(run("98-invent-shrink-leave-fullRun-honest", rooms.plain, (p) => {
  const L = p.meta.extensions.laneMeta;
  L.shrunk = { from: 10, to: L.rounds, wanted: (L.tiles || 0) + 9, premium: 0 };
  L.roundCap = L.rounds;
  syncLane(p);
}));

if (rooms.shrunk) {
  rec(run("98-erase-real-shrink", rooms.shrunk, (p) => {
    const L = p.meta.extensions.laneMeta;
    delete L.shrunk;
    L.roundCap = 10;
    syncLane(p);
  }));

  rec(run("98-extra-reserved-prefix-match-on-real-shrink", rooms.shrunk, (p) => {
    const L = p.meta.extensions.laneMeta;
    const fr = L.fullRun;
    const extra = "1,1";
    fr.reserved = [...fr.reserved.map(String), extra];
    const last = fr.byRound[fr.byRound.length - 1];
    if (Array.isArray(last)) last.push(extra);
    else fr.byRound.push([extra]);
    fr.tiles = fr.reserved.length;
    if (L.shrunk) L.shrunk.wanted = fr.tiles;
    syncLane(p);
  }));

  rec(run("98-extra-reserved-as-new-round-prefix-match", rooms.shrunk, (p) => {
    const L = p.meta.extensions.laneMeta;
    const fr = L.fullRun;
    const extra = "2,2";
    fr.reserved = [...fr.reserved.map(String), extra];
    fr.byRound = [...fr.byRound.map((r) => r.slice()), [extra]];
    fr.rounds = fr.byRound.length;
    fr.used = fr.rounds;
    fr.tiles = fr.reserved.length;
    if (L.shrunk) L.shrunk.wanted = fr.tiles;
    syncLane(p);
  }));
}

rec(run("98-invent-shrink-with-extra-reserved-prefix", rooms.plain, (p) => {
  const L = p.meta.extensions.laneMeta;
  const fr = L.fullRun;
  const extra = "1,1";
  const reserved = [...(fr.reserved || []).map(String), extra];
  const byRound = [...(fr.byRound || []).map((r) => r.slice()), [extra]];
  const to = L.rounds;
  L.fullRun = {
    ...fr,
    reserved,
    byRound,
    tiles: reserved.length,
    rounds: byRound.length,
    shallow: 2,
    ext: 58,
    ran: true,
    used: byRound.length,
    to,
  };
  L.shrunk = { from: 10, to, wanted: reserved.length, premium: 0 };
  L.roundCap = to;
  L.dropped = false;
  syncLane(p);
}));

if (rooms.droppedRoom) {
  rec(run("98-delete-reserved-on-drop", rooms.droppedRoom, (p) => {
    delete p.meta.extensions.laneMeta.fullRun.reserved;
    syncLane(p);
  }));
}

// =====================================================================
// Criticism 88
// =====================================================================
function applyRung(p, pred, fn) {
  const esc = p.meta.shellEscalation;
  const sf = (p.meta.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
  let n = 0;
  const hit = (row) => {
    if (!row || !pred(row)) return;
    fn(row);
    n++;
  };
  if (esc && Array.isArray(esc.rungs)) for (const row of esc.rungs) hit(row);
  if (sf) {
    for (const row of sf.ladder.rungs) hit(row);
    try { sf.detail = renderDecl(sf); } catch { /* leave */ }
  }
  return n;
}

rec(run("88-fatter-discarded-mobility-and-regen", rooms.ladderFat, (p) => {
  const shipped = (p.structures.rampart || []).length;
  applyRung(p, (r) => r.ramparts > shipped && typeof r.mobility === "number", (r) => { r.mobility = 0.5; });
}));

rec(run("88-replace-fatter-with-shipped-cut", rooms.ladderFat, (p) => {
  const d = byRoom.get(p.room);
  const shippedCut = (p.meta.shell.cut || []).map((t) => ({ x: t.x, y: t.y }));
  const pretty = enclosureMobility(d.terrain, p, shippedCut);
  const shippedN = (p.structures.rampart || []).length;
  applyRung(p, (r) => r.ramparts > shippedN && Array.isArray(r.cutTiles) && r.cutTiles.length, (r) => {
    r.cutTiles = shippedCut.map((t) => ({ x: t.x, y: t.y }));
    r.mobility = pretty;
    r.ramparts = shippedCut.length;
  });
}));

rec(run("88-replace-fatter-with-shipped-keep-rampart-count", rooms.ladderFat, (p) => {
  const d = byRoom.get(p.room);
  const shippedCut = (p.meta.shell.cut || []).map((t) => ({ x: t.x, y: t.y }));
  const pretty = enclosureMobility(d.terrain, p, shippedCut);
  const shippedN = (p.structures.rampart || []).length;
  applyRung(p, (r) => r.ramparts > shippedN && Array.isArray(r.cutTiles) && r.cutTiles.length, (r) => {
    r.cutTiles = shippedCut.map((t) => ({ x: t.x, y: t.y }));
    r.mobility = pretty;
  });
}));

if (rooms.fatCutNeFreeze) {
  rec(run("88-replace-fatter-with-shipped-on-cut-ne-freeze", rooms.fatCutNeFreeze, (p) => {
    const d = byRoom.get(p.room);
    const shippedCut = (p.meta.shell.cut || []).map((t) => ({ x: t.x, y: t.y }));
    const pretty = enclosureMobility(d.terrain, p, shippedCut);
    const shippedN = (p.structures.rampart || []).length;
    applyRung(p, (r) => r.ramparts > shippedN && Array.isArray(r.cutTiles) && r.cutTiles.length, (r) => {
      r.cutTiles = shippedCut.map((t) => ({ x: t.x, y: t.y }));
      r.mobility = pretty;
    });
  }));
}

{
  const p0 = byPlan.get(rooms.ladderAny);
  const d0 = byRoom.get(rooms.ladderAny);
  const shippedN = (p0.structures?.rampart || []).length;
  const esc = p0.meta?.shellEscalation;
  const target = (esc?.rungs || []).find((r) => r && r.needDeepBonus !== esc.pickedNeedDeepBonus && Array.isArray(r.cutTiles) && r.cutTiles.length) ||
    ((p0.meta?.shortfalls || []).find((s) => s?.ladder)?.ladder?.rungs || []).find((r) => r && r.ramparts > shippedN && Array.isArray(r.cutTiles));
  const picked = (esc?.rungs || []).find((r) => r && r.needDeepBonus === esc?.pickedNeedDeepBonus);
  const shipLap = picked?.mobility ?? 1.56;
  let pretty = null;
  if (target && d0) {
    const freeze = new Set((p0.meta.shell.cutAtFreeze || []).map(K));
    const used = new Set(target.cutTiles.map(K));
    const tries = [];
    for (let i = 0; i < target.cutTiles.length && !pretty; i++) {
      const t = target.cutTiles[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2], [1, 1], [-1, -1]]) {
        const nx = t.x + dx;
        const ny = t.y + dy;
        const k = `${nx},${ny}`;
        if (nx < 1 || ny < 1 || nx > 48 || ny > 48) continue;
        if (used.has(k) || freeze.has(k)) continue;
        const fake = target.cutTiles.map((q, j) => (j === i ? { x: nx, y: ny } : { x: q.x, y: q.y }));
        const lap = enclosureMobility(d0.terrain, p0, fake);
        if (typeof lap !== "number") continue;
        tries.push({ lap, n: fake.length });
        if (lap > shipLap + 1e-6 && lap < target.mobility - 1e-6) {
          pretty = { fake, lap };
          break;
        }
      }
    }
    if (!pretty) {
      // same-lap different tiles still "not a strict improvement"
      for (let i = 0; i < target.cutTiles.length && !pretty; i++) {
        const t = target.cutTiles[i];
        const nx = Math.min(48, t.x + 1);
        const ny = t.y;
        const k = `${nx},${ny}`;
        if (used.has(k)) continue;
        const fake = target.cutTiles.map((q, j) => (j === i ? { x: nx, y: ny } : { x: q.x, y: q.y }));
        const lap = enclosureMobility(d0.terrain, p0, fake);
        if (typeof lap === "number" && lap >= shipLap - 1e-6) pretty = { fake, lap, sameish: true };
      }
    }
    rec({
      name: "88-prettier-search",
      room: rooms.ladderAny,
      status: "INFO",
      detail: JSON.stringify({
        shipLap,
        discarded: { bonus: target.needDeepBonus, mob: target.mobility, n: target.cutTiles.length },
        found: pretty && { lap: pretty.lap, n: pretty.fake.length, sameish: !!pretty.sameish },
        tryN: tries.length,
        tryLaps: [...new Set(tries.map((t) => t.lap))].slice(0, 12),
      }),
    });
    if (pretty) {
      rec(run("88-invent-prettier-non-improvement", rooms.ladderAny, (p) => {
        const bonus = target.needDeepBonus;
        applyRung(p, (r) => r.needDeepBonus === bonus, (r) => {
          r.cutTiles = pretty.fake.map((t) => ({ x: t.x, y: t.y }));
          r.mobility = pretty.lap;
        });
      }));
    }
  }
}

rec(run("88-invent-8tile-box-own-lap", rooms.ladderAny, (p) => {
  const d = byRoom.get(p.room);
  const sitter = p.sitter;
  const fake = [];
  for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]]) {
    fake.push({ x: sitter.x + dx, y: sitter.y + dy });
  }
  const lap = enclosureMobility(d.terrain, p, fake);
  const esc = p.meta.shellEscalation;
  const target = (esc?.rungs || []).find((r) => r && r.needDeepBonus !== esc.pickedNeedDeepBonus);
  if (target && typeof lap === "number") {
    applyRung(p, (r) => r.needDeepBonus === target.needDeepBonus, (r) => {
      r.cutTiles = fake.map((t) => ({ ...t }));
      r.mobility = lap;
    });
  }
}));

if (rooms.recovLadder) {
  rec(run("88-recovery-discarded-mobility-0.5", rooms.recovLadder, (p) => {
    applyRung(p, (r) => typeof r.mobility === "number", (r) => { r.mobility = 0.5; });
  }));
}

// =====================================================================
// Criticism 93
// =====================================================================
rec(run("93-taken-invent-holder-off-board", rooms.taken, (p) => {
  const R0 = p.meta.sealedRecovery;
  R0.fixedHolders = [...(R0.fixedHolders || []), { type: "lab", x: 1, y: 1, recovers: 99, recoversDeep: 99 }];
}));

rec(run("93-taken-inflate-recovers-only", rooms.takenFixed, (p) => {
  const R0 = p.meta.sealedRecovery;
  const cap = (R0.pockets || []).reduce((n, pk) => n + (pk?.tiles || 0), 0);
  for (const f of R0.fixedHolders || []) {
    if (typeof f.recovers === "number" && f.recovers + 1 <= (cap || f.recovers + 1)) {
      f.recovers += 1;
      if (typeof f.recoversDeep === "number" && f.recoversDeep > f.recovers) f.recoversDeep = f.recovers;
    }
  }
}));

function inflateHolders(list, cap) {
  for (const f of list || []) {
    if (typeof f.recovers === "number" && f.recovers + 1 <= (cap || f.recovers + 1)) {
      f.recovers += 1;
      if (typeof f.recoversDeep === "number" && f.recoversDeep > f.recovers) f.recoversDeep = f.recovers;
    }
  }
}

rec(run("93-taken-inflate-recovers-and-regen-note", rooms.takenFixed, (p) => {
  const R0 = p.meta.sealedRecovery;
  const cap = (R0.pockets || []).reduce((n, pk) => n + (pk?.tiles || 0), 0);
  inflateHolders(R0.fixedHolders, cap);
  for (const nr of p.meta.noteRecords || []) {
    if (nr.cls !== "sealedRecovery" || !nr.rec) continue;
    nr.rec.fixedHolders = JSON.parse(JSON.stringify(R0.fixedHolders));
    inflateHolders(nr.rec.fixedHolders, cap);
    const i = p.meta.noteRecords.indexOf(nr);
    if (i >= 0 && Array.isArray(p.meta.notes)) p.meta.notes[i] = renderNote(nr);
  }
}));

rec(run("93-taken-inflate-recoversDeep-and-regen-note", rooms.takenFixed, (p) => {
  const R0 = p.meta.sealedRecovery;
  for (const f of R0.fixedHolders || []) {
    if (typeof f.recoversDeep === "number" && typeof f.recovers === "number" && f.recoversDeep + 1 <= f.recovers) {
      f.recoversDeep += 1;
    } else if (typeof f.recovers === "number" && typeof f.recoversDeep === "number") {
      f.recovers += 1;
      f.recoversDeep += 1;
    }
  }
  for (const nr of p.meta.noteRecords || []) {
    if (nr.cls !== "sealedRecovery" || !nr.rec) continue;
    nr.rec.fixedHolders = JSON.parse(JSON.stringify(R0.fixedHolders));
    const i = p.meta.noteRecords.indexOf(nr);
    if (i >= 0 && Array.isArray(p.meta.notes)) p.meta.notes[i] = renderNote(nr);
  }
}));

rec(run("93-pre-take-pocket-holder-invent", rooms.preTakeHold, (p) => {
  const walk = (n) => {
    if (!n) return;
    if (Array.isArray(n.pockets)) {
      for (const pk of n.pockets) {
        if (Array.isArray(pk.holders)) pk.holders.push({ type: "extension", x: 1, y: 1, recovers: 99, recoversDeep: 99 });
      }
    }
    if (n.next) walk(n.next);
  };
  walk(p.meta.sealedFloor);
  walk(p.meta.sealedRecovery);
}));

// =====================================================================
// cutAdopted / cutPasses
// =====================================================================
rec(run("cutAdopted-plant-non-add-rampart", rooms.adoptEmpty, (p) => {
  const addK = new Set((p.meta.shell.cutDrift || []).filter((e) => e && e.op === "add").map(K));
  const r = (p.structures.rampart || []).find((t) => !addK.has(K(t))) || p.structures.rampart[0];
  p.meta.shell.cutAdopted = [{ x: r.x, y: r.y }];
}));

rec(run("cutAdopted-plant-real-l7-add", rooms.adoptAdds, (p) => {
  const add = (p.meta.shell.cutDrift || []).find((e) => e && e.op === "add");
  p.meta.shell.cutAdopted = [{ x: add.x, y: add.y }];
}));

rec(run("cutPasses-sealCritical-plus-999", rooms.cutPasses, (p) => {
  for (const mk of p.meta.shell.cutPasses) if (Number.isInteger(mk.sealCritical)) mk.sealCritical += 999;
}));

rec(run("cutPasses-sealCritical-plus-1", rooms.cutPasses, (p) => {
  for (const mk of p.meta.shell.cutPasses) {
    if (Number.isInteger(mk.sealCritical)) mk.sealCritical += 1;
  }
}));

rec(run("cutPasses-prune-ramparts-zeroed", rooms.prunePass, (p) => {
  for (const mk of p.meta.shell.cutPasses) if (mk.kind === "inertPrune") mk.ramparts = 0;
}));

rec(run("cutPasses-kind-rewritten", rooms.cutPasses, (p) => {
  for (const mk of p.meta.shell.cutPasses) mk.kind = "reviewer";
}));

if (rooms.twoPrune) {
  rec(run("cutPasses-swap-rampartsDeleted-sum-held", rooms.twoPrune, (p) => {
    const a = p.meta.shell.cutPasses.find((m) => m.pass === "layer7-inertPrune");
    const b = p.meta.shell.cutPasses.find((m) => m.pass === "layer7b-inertPrune");
    const t = a.rampartsDeleted;
    a.rampartsDeleted = b.rampartsDeleted;
    b.rampartsDeleted = t;
  }));
} else {
  rec({ name: "cutPasses-swap-rampartsDeleted-sum-held", room: "-", status: "SKIP", detail: "no room with both prune markers deleting" });
}

rec(run("cutPasses-prune-ramparts-plus-8", rooms.prunePass, (p) => {
  for (const mk of p.meta.shell.cutPasses) if (mk.kind === "inertPrune") mk.ramparts += 8;
}));

// =====================================================================
// 134 / 141 / exact pick
// =====================================================================
rec(run("134a-drop-one-freeze-tile", "E11S1", (p) => {
  if (Array.isArray(p.meta.shell.cutAtFreeze) && p.meta.shell.cutAtFreeze.length) {
    p.meta.shell.cutAtFreeze = p.meta.shell.cutAtFreeze.slice(1);
  }
}));

if (rooms.ec) {
  rec(run("134c-ec1-withheld-plus-1", rooms.ec, (p) => {
    const e = p.meta.exteriorContract[1];
    e.withheld = (e.withheld || 0) + 1;
    if (Array.isArray(e.withheldTiles)) e.withheldTiles = [...e.withheldTiles, { x: 1, y: 1 }];
  }));
  rec(run("134c-ec2-withheld-zeroed", rooms.ec, (p) => {
    const e = p.meta.exteriorContract[2];
    e.withheld = 0;
    e.withheldTiles = [];
  }));
}

rec(run("141e-seedScore-to-0", rooms.seedScore, (p) => { p.meta.seedScore = 0; }));
rec(run("141e-seedScore-plus-999", rooms.seedScore, (p) => { p.meta.seedScore += 999; }));
rec(run("141e-seedSkip-zeroed-alone", rooms.seedSkip, (p) => { p.meta.seedSkip = 0; }));
rec(run("141e-seedSkip-all-twins-zeroed-regen", rooms.seedSkip, (p) => {
  p.meta.seedSkip = 0;
  if (p.meta.composeOpts && typeof p.meta.composeOpts.seedSkip === "number") p.meta.composeOpts.seedSkip = 0;
  for (const sf of p.meta.shortfalls || []) {
    if (sf.runtime && typeof sf.runtime.seedSkip === "number") sf.runtime.seedSkip = 0;
    if (typeof sf.seedSkip === "number") sf.seedSkip = 0;
    if (sf.eco && typeof sf.eco.seedSkip === "number") sf.eco.seedSkip = 0;
    if (sf.gate === "runtime" || sf.gate === "eco") {
      try { sf.detail = renderDecl(sf); } catch { /* leave */ }
    }
  }
}));
rec(run("141e-seedPool-halved", rooms.seedScore, (p) => {
  p.meta.seedPool = Math.max(1, Math.floor((p.meta.seedPool || 2) / 2));
}));
rec(run("141e-plan-seed-rewritten", rooms.seedCoord, (p) => {
  p.seed = { x: 1, y: 1 };
}));
rec(run("141e-plan-seed-deleted", rooms.seedCoord, (p) => {
  delete p.seed;
}));

rec(run("pick-protectRadius-zeroed", rooms.protect, (p) => { p.meta.shell.protectRadius = 0; }));
rec(run("pick-protectRadius-swapped-inside-enum", rooms.protect, (p) => {
  p.meta.shell.protectRadius = p.meta.shell.protectRadius === 12 ? 6 : 12;
}));
rec(run("pick-baseCut-zeroed", rooms.baseCut, (p) => { p.meta.shell.baseCut = 0; }));
rec(run("pick-baseCut-decrement-keep-pricey", rooms.baseCut, (p) => { p.meta.shell.baseCut -= 1; }));
rec(run("pick-priceyWall-cleared", rooms.pricey, (p) => { p.meta.shell.priceyWall = 0; }));

// =====================================================================
// Held doors (spot-check)
// =====================================================================
rec(run("MF5-mineral-append", rooms.mineral, (p) => {
  p.meta.misc.mineralOffNetworkWhy += " THE WALL IS FREE.";
}));
rec(run("MF5-mineral-invert-suffix", rooms.mineralOff, (p) => {
  p.meta.misc.mineralOffNetworkWhy = p.meta.misc.mineralOffNetworkWhy
    .replace(MINERAL_OFF_NETWORK_BASIS, MINERAL_ON_NETWORK_BASIS);
}));
for (const room of rooms.residue) {
  rec(run("MF5-mineral-residue-nearest-" + room, room, (p) => {
    p.meta.misc.mineralOffNetworkWhy = p.meta.misc.mineralOffNetworkWhy.replace(
      /nearest road tile this room ships is \d+,\d+/,
      "nearest road tile this room ships is 1,1",
    );
  }));
}
rec(run("MF5-swap-face-999", rooms.swap, (p) => {
  p.meta.towers.towerSwapOffer.basis = p.meta.towers.towerSwapOffer.basis.replace(
    /face at \d+ and its saturation at \d+/,
    "face at 999 and its saturation at 999",
  );
}));
rec(run("MF5-swap-regen-from-minShellDmg", rooms.swap, (p) => {
  const off = p.meta.towers.towerSwapOffer;
  const mn = p.meta.towers.minShellDmg;
  const sat = mn < MIN_SAT ? mn : MIN_SAT;
  off.basis = renderSwapOfferBasis({
    seats: off.seats,
    searchedSeats: off.searchedSeats,
    towers: (p.structures?.tower || []).length,
    scanned: off.scanned,
    faceAndSatHeld: off.faceAndSatHeld,
    priceProven: off.priceProven,
    face: { min: mn, sat },
    before: off.before,
    best: off.best,
  });
}));
rec(run("MF6-battlement-zero-count", rooms.battlement, (p) => { p.meta.shell.battlementUnreachable = 0; }));
rec(run("MF6-shippedShellDmg-inflate", rooms.dmg, (p) => {
  p.meta.shell.shippedShellDmg.min = 9999;
  p.meta.shell.shippedShellDmg.worst = { x: 1, y: 1 };
  p.meta.shell.shippedShellDmg.avg = 9999;
}));
rec(run("MF6-mobilityShipped-zeroed", rooms.mob, (p) => { p.meta.shell.mobilityShipped.maxGated = 0; }));
rec(run("MF5-refill-blocked-forged", rooms.refill, (p) => {
  p.meta.towers.refillBasis = p.meta.towers.refillBasis.replace(/with \d+ tile\(s\) blocked/, "with 1 tile(s) blocked");
}));
rec(run("MF6-nukerHubDist-to-1", rooms.nuker, (p) => { p.meta.misc.nukerHubDist = 1; }));
rec(run("MF6-observerHubDist-to-1", rooms.observer, (p) => { p.meta.misc.observerHubDist = 1; }));
rec(run("MF6-refillDistsUnblocked-flat-1", rooms.refillU, (p) => {
  p.meta.towers.refillDistsUnblocked = p.meta.towers.refillDistsUnblocked.map(() => 1);
}));
rec(run("MF6-mineralBubble-zeroed", rooms.bubble, (p) => { p.meta.misc.mineralBubble = 0; }));
rec(run("MF6-swampPaved-zeroed", rooms.swamp, (p) => { p.meta.walls.swampPaved = 0; }));
rec(run("MF6-spurred-zeroed", rooms.spur, (p) => { p.meta.walls.spurred = 0; }));
rec(run("MF6-spurred-decrement-keep-nonzero", rooms.spur, (p) => { p.meta.walls.spurred -= 1; }));
rec(run("MF6-newRoads-zeroed", rooms.newRoads, (p) => { p.meta.towers.newRoads = 0; }));

// =====================================================================
// Remaining META_DARK presence — single-room flattering
// =====================================================================
const presenceLeaves = [
  ["extractorOffNetwork", (p) => p.meta?.misc, "extractorOffNetwork"],
  ["mobilityShippedFree.maxGated", (p) => p.meta?.shell?.mobilityShippedFree, "maxGated"],
  ["corridorFallback", (p) => p.meta?.extensions || p.meta?.walls, "corridorFallback"],
  ["corridorPlaced", (p) => p.meta?.extensions || p.meta?.walls, "corridorPlaced"],
  ["roadsEaten", (p) => p.meta?.labs || p.meta?.misc, "roadsEaten"],
  ["stitched", (p) => p.meta?.walls, "stitched"],
  ["mineralSeatNetTiles", (p) => p.meta?.misc, "mineralSeatNetTiles"],
  ["extractorSeatNetTiles", (p) => p.meta?.misc, "extractorSeatNetTiles"],
  ["baseOverGated", (p) => p.meta?.shell, "baseOverGated"],
  ["nukerInWindow", (p) => p.meta?.towers || p.meta?.misc, "nukerInWindow"],
  ["towerOnly", (p) => p.meta?.towers || p.meta?.misc, "towerOnly"],
  ["stubRoads", (p) => p.meta?.extensions || p.meta?.walls, "stubRoads"],
  ["deepBudget", (p) => p.meta?.extensions || p.meta?.walls, "deepBudget"],
  ["boundHeld", (p) => p.meta?.walls || p.meta?.shell, "boundHeld"],
  ["floorGated", (p) => p.meta?.shell || p.meta?.walls, "floorGated"],
  ["shallowNow", (p) => p.meta?.extensions?.reflow || p.meta?.extensions, "shallowNow"],
  ["baseCut-as-presence", (p) => p.meta?.shell, "baseCut"],
];
for (const [name, grab, key] of presenceLeaves) {
  const room = any((p) => {
    const o = grab(p);
    const v = o?.[key];
    if (typeof v === "number") return v !== 0;
    if (typeof v === "boolean") return v === true;
    if (Array.isArray(v)) return v.length > 0;
    return false;
  });
  if (!room) {
    rec({ name: "PRESENCE-" + name, room: "-", status: "SKIP", detail: "no room with truthy value" });
    continue;
  }
  rec(run("PRESENCE-" + name + "-flattered", room, (p) => {
    const o = grab(p);
    const v = o[key];
    if (typeof v === "number") o[key] = 0;
    else if (typeof v === "boolean") o[key] = false;
    else if (Array.isArray(v)) o[key] = [];
  }));
}

const presenceKlass = Object.entries(META_DARK).filter(([, v]) => v.klass === "presence").map(([k]) => k);
const derivedKlass = Object.entries(META_DARK).filter(([, v]) => v.klass === "derived").map(([k]) => k);

fs.writeFileSync(path.join(DIR, "attack.json"), JSON.stringify({ rooms, presenceKlass, derivedKlass, results }, null, 2));
const bites = results.filter((r) => r.status === "BITES").length;
const escapes = results.filter((r) => r.status === "ESCAPE").length;
const skips = results.filter((r) => r.status === "SKIP" || r.status === "THREW").length;
const infos = results.filter((r) => r.status === "INFO").length;
console.log(JSON.stringify({
  n: results.length, bites, escapes, skips, infos,
  escapeNames: results.filter((r) => r.status === "ESCAPE").map((r) => r.name),
  rooms,
}, null, 2));
