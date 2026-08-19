/**
 * Round-30 owner mutation attacks. Mutate clones, run checkRoom.
 * Does not write the artifact. Does not import validate for board facts.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { enclosureMobility } from "../layer-shell.mjs";
import { renderNote } from "../declprose-notes.mjs";
import { loadPlans, loadRooms, makeChecker, K } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);
const attacks = [];

async function rec(p) {
  const r = await p;
  attacks.push(r);
  console.log(String(r.status).padEnd(8), r.name, r.room, String(r.first || "").slice(0, 180));
  return r;
}

function bothLanes(p, fn) {
  fn(p.meta.extensions.laneMeta);
  const W = p.meta.walls?.mobility?.lanes;
  if (W && W !== p.meta.extensions.laneMeta) fn(W);
}

const any = plans[0].room;
const addRoom =
  plans.find((p) => (p.meta?.shell?.cutDrift || []).some((e) => e.op === "add"))?.room || "E13S3";
const pruneRoom =
  plans.find((p) =>
    (p.meta?.shell?.cutPasses || []).some((m) => m && m.kind === "inertPrune" && m.rampartsDeleted > 0),
  )?.room || addRoom;
const slackSeal = plans.find((p) => {
  const mk = (p.meta?.shell?.cutPasses || []).find(
    (m) => m && m.kind === "reconcileSeal" && Number.isInteger(m.sealCritical),
  );
  const rampN = (p.structures?.rampart || []).length;
  return mk && mk.sealCritical + 1 <= rampN && mk.sealCritical > (mk.adds || 0);
})?.room;
const slackPrune = plans.find((p) => {
  const mks = (p.meta?.shell?.cutPasses || []).filter((m) => m && m.kind === "inertPrune");
  return mks.length === 2 && mks.every((m) => m.ramparts > m.rampartsDeleted && m.rampartsDeleted >= m.removes);
})?.room;
const swapPrune = plans.find((p) => {
  const a = (p.meta?.shell?.cutPasses || []).find((m) => m.pass === "layer7-inertPrune");
  const b = (p.meta?.shell?.cutPasses || []).find((m) => m.pass === "layer7b-inertPrune");
  if (!a || !b) return false;
  return a.rampartsDeleted !== b.rampartsDeleted && a.rampartsDeleted >= b.removes && b.rampartsDeleted >= a.removes;
})?.room;
const radRoom = plans.find((p) => typeof p.meta?.shell?.protectRadius === "number")?.room || any;
const otherRadius = (() => {
  const p = plans.find((x) => x.room === radRoom);
  const r = p.meta.shell.protectRadius;
  return [6, 7, 8, 10, 12, 14, 16].find((v) => v !== r) || 10;
})();
const baseCutRoom =
  plans.find((p) => typeof p.meta?.shell?.baseCut === "number" && p.meta.shell.baseCut > 1)?.room || any;
const takenRoom =
  plans.find((p) => p.meta?.sealedRecovery?.outcome === "taken" && (p.meta.sealedRecovery.fixedHolders || []).length) ||
  plans.find((p) => p.meta?.sealedRecovery?.outcome === "taken");
const takenName = takenRoom?.room || "E15S6";
const shrinkable = plans.find((p) => {
  const L = p.meta?.extensions?.laneMeta;
  return L && L.fullRun && !L.fullRun.ran && !L.shrunk && !L.dropped && Array.isArray(L.fullRun.reserved);
});
const realShrink = plans.find((p) => p.meta?.extensions?.laneMeta?.shrunk && Array.isArray(p.meta.extensions.laneMeta.fullRun?.byRound));
const droppedRoom = plans.find((p) => p.meta?.extensions?.laneMeta?.dropped === true);
const fatRung = plans.find((p) => {
  const shipped = (p.structures?.rampart || []).length;
  const sf = (p.meta?.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
  return !!(sf && sf.ladder.rungs.some((r) => r && r.ramparts > shipped && typeof r.mobility === "number"));
});
const seedSkipRoom = plans.find((p) => p.meta?.seedSkip > 0) || plans.find((p) => typeof p.meta?.seedSkip === "number");
const seedScoreRoom = plans.find((p) => typeof p.meta?.seedScore === "number");
const absorbRoom = plans.find((p) => (p.meta?.shell?.cutDrift || []).some((e) => e.op === "add"));
const ecRoom = plans.find((p) => Array.isArray(p.meta?.exteriorContract) && p.meta.exteriorContract.length >= 3);
const mineralNetRoom = plans.find((p) => Array.isArray(p.meta?.misc?.mineralSeatNetTiles) && p.meta.misc.mineralSeatNetTiles.length);
const corridorRoom = plans.find((p) => {
  const v = p.meta?.extensions?.corridorPlaced ?? p.meta?.walls?.corridorPlaced ?? p.meta?.extensions?.laneMeta?.corridorPlaced;
  return typeof v === "number" && v > 0;
});

// ---------- cutPasses exactness ----------
await rec(run("cutPasses.sealCritical += 999", addRoom, (p) => {
  for (const mk of p.meta.shell.cutPasses || []) if (typeof mk.sealCritical === "number") mk.sealCritical += 999;
}));
await rec(run("cutPasses.ramparts := 0 on prune", pruneRoom, (p) => {
  for (const mk of p.meta.shell.cutPasses || []) if (mk.kind === "inertPrune") mk.ramparts = 0;
}));
await rec(run("cutPasses.kind rewritten", addRoom, (p) => {
  for (const mk of p.meta.shell.cutPasses || []) mk.kind = "reviewer";
}));
await rec(run("cutPasses.why-append control", addRoom, (p) => {
  for (const e of p.meta.shell.cutDrift || []) e.why = e.why + " and this tile was never wall.";
}));
await rec(run("cutPasses.sealCritical += 1", slackSeal || addRoom, (p) => {
  for (const mk of p.meta.shell.cutPasses || []) if (Number.isInteger(mk.sealCritical)) mk.sealCritical += 1;
}));
await rec(run("cutPasses.sealCritical := adds", slackSeal || addRoom, (p) => {
  for (const mk of p.meta.shell.cutPasses || []) if (Number.isInteger(mk.sealCritical)) mk.sealCritical = mk.adds;
}));
await rec(run("cutPasses.sealCritical := rampN", slackSeal || addRoom, (p) => {
  const n = (p.structures.rampart || []).length;
  for (const mk of p.meta.shell.cutPasses || []) if (Number.isInteger(mk.sealCritical)) mk.sealCritical = n;
}));
await rec(run("cutPasses.prune ramparts += 8", slackPrune || pruneRoom, (p) => {
  for (const mk of p.meta.shell.cutPasses || []) if (mk.kind === "inertPrune") mk.ramparts += 8;
}));
await rec(run("cutPasses.swap rampartsDeleted (sum preserved)", swapPrune || pruneRoom, (p) => {
  const a = (p.meta.shell.cutPasses || []).find((m) => m.pass === "layer7-inertPrune");
  const b = (p.meta.shell.cutPasses || []).find((m) => m.pass === "layer7b-inertPrune");
  if (a && b) {
    const t = a.rampartsDeleted;
    a.rampartsDeleted = b.rampartsDeleted;
    b.rampartsDeleted = t;
  }
}));
await rec(run("cutPasses.swap deleted AND fix last-prune ramparts", swapPrune || pruneRoom, (p) => {
  const a = (p.meta.shell.cutPasses || []).find((m) => m.pass === "layer7-inertPrune");
  const b = (p.meta.shell.cutPasses || []).find((m) => m.pass === "layer7b-inertPrune");
  if (a && b) {
    const t = a.rampartsDeleted;
    a.rampartsDeleted = b.rampartsDeleted;
    b.rampartsDeleted = t;
    b.ramparts = (p.structures.rampart || []).length + b.rampartsDeleted;
  }
}));

// ---------- 98 ----------
if (shrinkable) {
  await rec(run("98 invent shrink leave fullRun honest", shrinkable.room, (p) => {
    bothLanes(p, (L) => {
      L.shrunk = { from: 10, to: L.rounds, wanted: (L.tiles || 0) + 9, premium: 0 };
      L.roundCap = L.rounds;
    });
  }));
  await rec(run("98 forge fullRun+shrink together (old residue)", shrinkable.room, (p) => {
    bothLanes(p, (L) => {
      const extra = ["1,1", "1,2", "2,1", "2,2", "3,1", "3,2", "4,1", "4,2", "5,1"];
      const reserved = [...(L.fullRun.reserved || []).map(String), ...extra];
      const byRound = [...(L.fullRun.byRound || []).map((r) => r.slice())];
      while (byRound.length < 10) byRound.push([]);
      byRound[byRound.length - 1] = [...(byRound[byRound.length - 1] || []), ...extra];
      const fr = {
        ...L.fullRun,
        tiles: reserved.length,
        rounds: byRound.length,
        shallow: 2,
        ext: 58,
        ran: true,
        used: 10,
        to: L.rounds,
        reserved,
        byRound,
      };
      L.fullRun = fr;
      L.shrunk = { from: 10, to: L.rounds, wanted: reserved.length, premium: 0 };
      L.roundCap = L.rounds;
    });
  }));
  await rec(run("98 delete fullRun", shrinkable.room, (p) => {
    delete p.meta.extensions.laneMeta.fullRun;
    if (p.meta.walls?.mobility?.lanes) delete p.meta.walls.mobility.lanes.fullRun;
  }));
  await rec(run("98 60/0 rewrite fullRun.shallow", shrinkable.room, (p) => {
    bothLanes(p, (L) => {
      L.fullRun = { ...L.fullRun, shallow: 2, ran: true };
    });
  }));
}
if (realShrink) {
  await rec(run("98 invent extra reserved still prefix-match (shrink)", realShrink.room, (p) => {
    bothLanes(p, (L) => {
      const extra = ["0,0", "0,1", "49,49"];
      L.fullRun.reserved = [...L.fullRun.reserved.map(String), ...extra];
      L.fullRun.tiles = L.fullRun.reserved.length;
      L.fullRun.byRound = L.fullRun.byRound.map((r) => r.slice());
      L.fullRun.byRound.push(extra);
      L.fullRun.rounds = L.fullRun.byRound.length;
      L.fullRun.used = L.fullRun.rounds;
      if (L.shrunk) L.shrunk.wanted = L.fullRun.tiles;
    });
  }));
  await rec(run("98 invent extra reserved into existing later round", realShrink.room, (p) => {
    bothLanes(p, (L) => {
      const to = L.shrunk.to;
      const extra = "0,0";
      L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
      L.fullRun.tiles = L.fullRun.reserved.length;
      L.fullRun.byRound = L.fullRun.byRound.map((r) => r.slice());
      const last = Math.max(to, L.fullRun.byRound.length - 1);
      L.fullRun.byRound[last] = [...L.fullRun.byRound[last], extra];
      if (L.shrunk) L.shrunk.wanted = L.fullRun.tiles;
    });
  }));
  await rec(run("98 delete reserved board on real shrink", realShrink.room, (p) => {
    bothLanes(p, (L) => {
      delete L.fullRun.reserved;
      delete L.fullRun.byRound;
    });
  }));
}
if (droppedRoom) {
  await rec(run("98 invent extra reserved on dropped room", droppedRoom.room, (p) => {
    bothLanes(p, (L) => {
      const extra = ["0,0", "0,1"];
      L.fullRun.reserved = [...(L.fullRun.reserved || []).map(String), ...extra];
      L.fullRun.tiles = L.fullRun.reserved.length;
      L.fullRun.byRound = (L.fullRun.byRound || []).map((r) => r.slice());
      L.fullRun.byRound.push(extra);
      L.fullRun.rounds = L.fullRun.byRound.length;
    });
  }));
}

// ---------- 88 ----------
if (fatRung) {
  const dFat = byRoom.get(fatRung.room);
  await rec(run("88 fatter discarded mobility 0.5 + regen", fatRung.room, (p) => {
    const shipped = (p.structures.rampart || []).length;
    for (const sf of p.meta.shortfalls || []) {
      if (!sf.ladder?.rungs) continue;
      for (const r of sf.ladder.rungs) {
        if (r && r.ramparts > shipped && typeof r.mobility === "number") r.mobility = 0.5;
      }
      if (typeof sf.detail === "string") sf.detail = sf.detail.replace(/mobility [\d.]+/g, "mobility 0.5");
    }
  }));
  await rec(run("88 swap fatter cut with freeze keep fatter ramparts", fatRung.room, (p) => {
    const freeze = (p.meta.shell.cutAtFreeze || []).map((t) => ({ x: t.x, y: t.y }));
    const shipped = (p.structures.rampart || []).length;
    const winner = (p.meta.shortfalls || []).find((s) => s.ladder)?.ladder?.rungs?.find((r) => r.ramparts === shipped);
    const lap = winner?.mobility ?? 1.56;
    for (const sf of p.meta.shortfalls || []) {
      if (!sf.ladder?.rungs) continue;
      for (const r of sf.ladder.rungs) {
        if (r && r.ramparts > shipped) {
          r.cutTiles = freeze.map((t) => ({ ...t }));
          r.mobility = lap;
        }
      }
    }
    if (p.meta.shellEscalation?.rungs) {
      for (const r of p.meta.shellEscalation.rungs) {
        if (r && r.ramparts > shipped) {
          r.cutTiles = freeze.map((t) => ({ ...t }));
          r.mobility = lap;
        }
      }
    }
  }));
  await rec(run("88 swap fatter cut with freeze AND drop ramparts to shipped", fatRung.room, (p) => {
    const freeze = (p.meta.shell.cutAtFreeze || []).map((t) => ({ x: t.x, y: t.y }));
    const shipped = (p.structures.rampart || []).length;
    const winner = (p.meta.shortfalls || []).find((s) => s.ladder)?.ladder?.rungs?.find((r) => r.ramparts === shipped);
    const lap = winner?.mobility ?? 1.56;
    for (const sf of p.meta.shortfalls || []) {
      if (!sf.ladder?.rungs) continue;
      for (const r of sf.ladder.rungs) {
        if (r && r.ramparts > shipped) {
          r.cutTiles = freeze.map((t) => ({ ...t }));
          r.mobility = lap;
          r.ramparts = shipped;
        }
      }
    }
    if (p.meta.shellEscalation?.rungs) {
      for (const r of p.meta.shellEscalation.rungs) {
        if (r && r.ramparts > shipped) {
          r.cutTiles = freeze.map((t) => ({ ...t }));
          r.mobility = lap;
          r.ramparts = shipped;
        }
      }
    }
  }));
  await rec(run("88 invent box cut matching its own lap", fatRung.room, (p) => {
    const sitter = p.sitter;
    const fake = [];
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]]) {
      fake.push({ x: sitter.x + dx, y: sitter.y + dy });
    }
    const lap = enclosureMobility(dFat.terrain, p, fake);
    const shipped = (p.structures.rampart || []).length;
    const esc = p.meta.shellEscalation;
    const target = (esc?.rungs || []).find((r) => r && r.needDeepBonus !== esc.pickedNeedDeepBonus && r.ramparts > shipped);
    if (target && typeof lap === "number") {
      target.cutTiles = fake;
      target.mobility = lap;
      const sf = (p.meta.shortfalls || []).find((s) => s && s.ladder);
      if (sf) {
        const twin = sf.ladder.rungs.find((r) => r.needDeepBonus === target.needDeepBonus);
        if (twin) {
          twin.cutTiles = fake.map((t) => ({ ...t }));
          twin.mobility = lap;
        }
      }
    }
  }));
  await rec(run("88 invent prettier cut walking a better lap (keep ramparts)", fatRung.room, (p) => {
    const shipped = (p.structures.rampart || []).length;
    const shippedCut = (p.meta.shell.cut || []).map((t) => ({ x: t.x, y: t.y }));
    const pretty = enclosureMobility(dFat.terrain, p, shippedCut);
    const esc = p.meta.shellEscalation;
    const target = (esc?.rungs || []).find((r) => r && r.needDeepBonus !== esc.pickedNeedDeepBonus && r.ramparts > shipped);
    if (target && typeof pretty === "number") {
      // not freeze: offset a couple of tiles off the freeze set if possible
      const freeze = new Set((p.meta.shell.cutAtFreeze || []).map(K));
      const fake = shippedCut.map((t) => ({ ...t }));
      // if shipped === freeze this is the "prettier lap of the winner" with a non-identical list only if we perturb
      if (fake.length && freeze.has(K(fake[0]))) {
        // keep identity of tiles but this IS freeze — that's the named swap. Use a near-copy with one tile shifted if walkable.
        const t0 = fake[0];
        fake[0] = { x: Math.min(49, t0.x + 1), y: t0.y };
      }
      const lap = enclosureMobility(dFat.terrain, p, fake);
      if (typeof lap === "number") {
        target.cutTiles = fake;
        target.mobility = lap;
        const sf = (p.meta.shortfalls || []).find((s) => s && s.ladder);
        if (sf) {
          const twin = sf.ladder.rungs.find((r) => r.needDeepBonus === target.needDeepBonus);
          if (twin) {
            twin.cutTiles = fake.map((t) => ({ ...t }));
            twin.mobility = lap;
          }
        }
      }
    }
  }));
}

// ---------- 93 ----------
await rec(run("93 invent holder on taken room", takenName, (p) => {
  const R = p.meta.sealedRecovery;
  R.fixedHolders = [...(R.fixedHolders || []), { type: "lab", x: 1, y: 1, recovers: 99, recoversDeep: 99 }];
}));
await rec(run("93 recovers := pocket-cap on taken + note twin", takenName, (p) => {
  const rec0 = p.meta.sealedRecovery;
  const c = (rec0.pockets || []).reduce((n, pk) => n + (pk.tiles || 0), 0);
  for (const h of rec0.fixedHolders || []) {
    h.recovers = c;
    if (typeof h.recoversDeep === "number") h.recoversDeep = Math.min(h.recoversDeep, c);
  }
  for (const nr of p.meta.noteRecords || []) {
    if (nr.cls !== "sealedRecovery" || !nr.rec) continue;
    nr.rec.fixedHolders = JSON.parse(JSON.stringify(rec0.fixedHolders));
    const i = p.meta.noteRecords.indexOf(nr);
    if (i >= 0 && Array.isArray(p.meta.notes)) p.meta.notes[i] = renderNote(nr);
  }
}));
await rec(run("93 recovers += 1 both copies + regen", takenName, (p) => {
  const R0 = p.meta.sealedRecovery;
  const cap = (R0.pockets || []).reduce((n, pk) => n + (pk?.tiles || 0), 0);
  for (const f of R0.fixedHolders || []) {
    if (typeof f.recovers === "number" && f.recovers + 1 <= cap) {
      f.recovers += 1;
      if (typeof f.recoversDeep === "number" && f.recoversDeep > f.recovers) f.recoversDeep = f.recovers;
    }
  }
  for (const nr of p.meta.noteRecords || []) {
    if (nr.cls !== "sealedRecovery" || !nr.rec) continue;
    nr.rec.fixedHolders = JSON.parse(JSON.stringify(R0.fixedHolders));
    const i = p.meta.noteRecords.indexOf(nr);
    if (i >= 0 && Array.isArray(p.meta.notes)) p.meta.notes[i] = renderNote(nr);
  }
}));
await rec(run("93 recoversDeep := recovers on taken", takenName, (p) => {
  for (const h of p.meta.sealedRecovery.fixedHolders || []) {
    if (typeof h.recovers === "number") h.recoversDeep = h.recovers;
  }
  for (const nr of p.meta.noteRecords || []) {
    if (nr.cls === "sealedRecovery" && nr.rec?.fixedHolders) {
      nr.rec.fixedHolders = JSON.parse(JSON.stringify(p.meta.sealedRecovery.fixedHolders));
    }
  }
}));

// ---------- exact pick / 141(e) ----------
await rec(run("protectRadius := 0", radRoom, (p) => {
  p.meta.shell.protectRadius = 0;
}));
await rec(run("protectRadius flipped legal enum", radRoom, (p) => {
  p.meta.shell.protectRadius = otherRadius;
}));
await rec(run("baseCut += 1 keep priceyWall", baseCutRoom, (p) => {
  p.meta.shell.baseCut += 1;
  p.meta.shell.priceyWall = p.meta.shell.baseCut > 45 ? 1 : 0;
}));
await rec(run("baseCut := 0", baseCutRoom, (p) => {
  p.meta.shell.baseCut = 0;
}));
if (seedScoreRoom) {
  await rec(run("141e seedScore := 0", seedScoreRoom.room, (p) => {
    p.meta.seedScore = 0;
  }));
  await rec(run("141e seedScore += 999", seedScoreRoom.room, (p) => {
    p.meta.seedScore = (p.meta.seedScore || 0) + 999;
  }));
}
if (seedSkipRoom) {
  await rec(run("141e seedSkip := 0 meta only", seedSkipRoom.room, (p) => {
    p.meta.seedSkip = 0;
  }));
  await rec(run("141e seedSkip := 0 meta+runtime+eco", seedSkipRoom.room, (p) => {
    p.meta.seedSkip = 0;
    if (p.meta.runtime) p.meta.runtime.seedSkip = 0;
    if (p.meta.eco) p.meta.eco.seedSkip = 0;
    for (const sf of p.meta.shortfalls || []) {
      if (sf && typeof sf.seedSkip === "number") sf.seedSkip = 0;
      if (sf?.rec && typeof sf.rec.seedSkip === "number") sf.rec.seedSkip = 0;
    }
  }));
}
await rec(run("141e seed moved off hub line", any, (p) => {
  if (p.seed && Number.isInteger(p.seed.x)) p.seed = { x: (p.seed.x + 3) % 48, y: (p.seed.y + 5) % 48 };
}));
await rec(run("141e seedPool halved", any, (p) => {
  p.meta.seedPool = Math.max(1, Math.floor((p.meta.seedPool || 2) / 2));
}));

// ---------- 134 / cutAdopted ----------
await rec(run("cutAdopted plant first rampart", any, (p) => {
  const r = p.structures.rampart[0];
  p.meta.shell.cutAdopted = [{ x: r.x, y: r.y }];
}));
await rec(run("cutAdopted plant real cutDrift add", addRoom, (p) => {
  const add = p.meta.shell.cutDrift.find((e) => e && e.op === "add");
  p.meta.shell.cutAdopted = [{ x: add.x, y: add.y }];
}));
if (absorbRoom) {
  await rec(run("134a absorb one add into freeze", absorbRoom.room, (p) => {
    const add = p.meta.shell.cutDrift.find((e) => e.op === "add");
    p.meta.shell.cutAtFreeze = [...(p.meta.shell.cutAtFreeze || []), { x: add.x, y: add.y }];
    p.meta.shell.cutDrift = p.meta.shell.cutDrift.filter((e) => !(e.op === "add" && e.x === add.x && e.y === add.y));
    const mk = (p.meta.shell.cutPasses || []).find((m) => m.pass === add.pass);
    if (mk && mk.adds > 0) mk.adds -= 1;
  }));
}
if (ecRoom) {
  await rec(run("134c ec[1] withheld += 1 + junk tile", ecRoom.room, (p) => {
    const e = p.meta.exteriorContract[1];
    e.withheld = (e.withheld || 0) + 1;
    e.withheldTiles = [...(e.withheldTiles || []), { x: 1, y: 1 }];
  }));
  await rec(run("134c ec[2] withheld zeroed", ecRoom.room, (p) => {
    const e = p.meta.exteriorContract[2];
    e.withheld = 0;
    e.withheldTiles = [];
  }));
}

// ---------- remaining presence (single-room flattering) ----------
await rec(run("nukerHubDist := 1", any, (p) => {
  if (p.meta?.misc) p.meta.misc.nukerHubDist = 1;
}));
await rec(run("extractorOffNetwork flipped alone", any, (p) => {
  if (typeof p.meta?.misc?.extractorOffNetwork === "boolean") {
    p.meta.misc.extractorOffNetwork = !p.meta.misc.extractorOffNetwork;
  }
}));
await rec(run("mobilityShippedFree.maxGated := 0", plans.find((p) => p.meta?.shell?.mobilityShippedFree?.maxGated > 0)?.room || any, (p) => {
  if (p.meta?.shell?.mobilityShippedFree) p.meta.shell.mobilityShippedFree.maxGated = 0;
}));
await rec(run("corridorPlaced := 0", corridorRoom?.room || any, (p) => {
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (typeof o.corridorPlaced === "number") o.corridorPlaced = 0;
    if (typeof o.corridorFallback === "number") o.corridorFallback = 0;
  };
  walk(p.meta.extensions);
  walk(p.meta.walls);
  walk(p.meta.extensions?.laneMeta);
}));
await rec(run("roadsEaten := 0", plans.find((p) => (p.meta?.labs?.roadsEaten || 0) > 0)?.room || any, (p) => {
  if (p.meta?.labs && typeof p.meta.labs.roadsEaten === "number") p.meta.labs.roadsEaten = 0;
}));
await rec(run("mineralSeatNetTiles cleared", mineralNetRoom?.room || any, (p) => {
  if (p.meta?.misc) p.meta.misc.mineralSeatNetTiles = [];
}));
await rec(run("nukerInWindow flipped", plans.find((p) => p.meta?.misc?.nukerInWindow === true || p.meta?.towers?.nukerInWindow === true)?.room || any, (p) => {
  if (p.meta?.misc && typeof p.meta.misc.nukerInWindow === "boolean") p.meta.misc.nukerInWindow = !p.meta.misc.nukerInWindow;
  if (p.meta?.towers && typeof p.meta.towers.nukerInWindow === "boolean") p.meta.towers.nukerInWindow = !p.meta.towers.nukerInWindow;
}));
await rec(run("stitched := 0", plans.find((p) => (p.meta?.walls?.stitched || 0) > 0)?.room || any, (p) => {
  if (p.meta?.walls && typeof p.meta.walls.stitched === "number") p.meta.walls.stitched = 0;
}));
await rec(run("stubRoads cleared", plans.find((p) => Array.isArray(p.meta?.extensions?.stubRoads) && p.meta.extensions.stubRoads.length)?.room || any, (p) => {
  if (Array.isArray(p.meta?.extensions?.stubRoads)) p.meta.extensions.stubRoads = [];
  if (Array.isArray(p.meta?.walls?.stubRoads)) p.meta.walls.stubRoads = [];
}));
await rec(run("deepBudget := 0", plans.find((p) => (p.meta?.extensions?.deepBudget || 0) > 0)?.room || any, (p) => {
  if (p.meta?.extensions && typeof p.meta.extensions.deepBudget === "number") p.meta.extensions.deepBudget = 0;
}));
await rec(run("boundHeld := 0", plans.find((p) => (p.meta?.walls?.boundHeld || p.meta?.extensions?.boundHeld || 0) > 0)?.room || any, (p) => {
  if (p.meta?.walls && typeof p.meta.walls.boundHeld === "number") p.meta.walls.boundHeld = 0;
  if (p.meta?.extensions && typeof p.meta.extensions.boundHeld === "number") p.meta.extensions.boundHeld = 0;
}));
await rec(run("towerOnly flipped", plans.find((p) => p.meta?.misc?.towerOnly === true || p.meta?.towers?.towerOnly === true)?.room || any, (p) => {
  if (p.meta?.misc && typeof p.meta.misc.towerOnly === "boolean") p.meta.misc.towerOnly = false;
  if (p.meta?.towers && typeof p.meta.towers.towerOnly === "boolean") p.meta.towers.towerOnly = false;
}));
await rec(run("battlementUnreachable count+tiles zeroed", plans.find((p) => p.meta?.shell?.battlementUnreachable > 0)?.room || "E13S3", (p) => {
  p.meta.shell.battlementUnreachable = 0;
  p.meta.shell.battlementUnreachableTiles = [];
}));
await rec(run("spurred decrement keep nonzero", plans.find((p) => (p.meta?.walls?.spurred || 0) > 1)?.room || any, (p) => {
  if (p.meta?.walls?.spurred > 1) p.meta.walls.spurred -= 1;
}));

// controls that should still bite
await rec(run("E5S1 mineralWhy append THE WALL IS FREE", "E5S1", (p) => {
  p.meta.misc.mineralOffNetworkWhy += " THE WALL IS FREE.";
}));
await rec(run("nukerHubDist control already above", any, (p) => {}));

const out = {
  targets: {
    addRoom,
    pruneRoom,
    slackSeal,
    slackPrune,
    swapPrune,
    radRoom,
    otherRadius,
    baseCutRoom,
    takenName,
    shrinkable: shrinkable?.room,
    realShrink: realShrink?.room,
    droppedRoom: droppedRoom?.room,
    fatRung: fatRung?.room,
    seedSkipRoom: seedSkipRoom?.room,
    seedScoreRoom: seedScoreRoom?.room,
    absorbRoom: absorbRoom?.room,
    ecRoom: ecRoom?.room,
  },
  attacks,
};
fs.writeFileSync(path.join(DIR, "attack-out.json"), JSON.stringify(out, null, 2));
const esc = attacks.filter((a) => a.status === "ESCAPE");
const bite = attacks.filter((a) => a.status === "BITES");
const threw = attacks.filter((a) => a.status === "threw");
console.log(JSON.stringify({
  n: attacks.length,
  bites: bite.length,
  escapes: esc.map((a) => a.name),
  threw: threw.map((a) => a.name),
}, null, 2));
