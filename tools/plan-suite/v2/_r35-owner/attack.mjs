/**
 * Round-35 owner mutation attacks. Mutate clones, run checkRoom.
 * Does not write the artifact. Does not import validate for board facts.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { enclosureMobility } from "../layer-shell.mjs";
import { renderNote } from "../declprose-notes.mjs";
import { renderDecl } from "../declprose.mjs";
import { bothLanes, loadPlans, loadRooms, makeChecker, K, KT, walkable, D8 } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);
const attacks = [];

async function rec(p) {
  const r = await p;
  attacks.push(r);
  console.log(String(r.status).padEnd(8), r.name, r.room, String(r.first || "").slice(0, 200));
  return r;
}

function applyBonus(p, bonus, fn) {
  const esc = p.meta.shellEscalation;
  const sf = (p.meta.shortfalls || []).find((s) => s && s.ladder);
  if (esc && Array.isArray(esc.rungs)) {
    for (const row of esc.rungs) if (row && row.needDeepBonus === bonus) fn(row);
  }
  if (sf) {
    for (const row of sf.ladder.rungs) if (row && row.needDeepBonus === bonus) fn(row);
    try { sf.detail = renderDecl(sf); } catch { /* leave */ }
  }
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
const realShrink = plans.find((p) => p.room === "E11S1")
  || plans.find((p) => p.meta?.extensions?.laneMeta?.shrunk && Array.isArray(p.meta.extensions.laneMeta.fullRun?.byRound));
const droppedRoom = plans.find((p) => p.meta?.extensions?.laneMeta?.dropped === true);
const fatRung = plans.find((p) => p.room === "E11S2")
  || plans.find((p) => {
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
const coveredRoom = plans.find((p) => p.meta?.walls?.mobility?.coveredDetourDeclared === true);
const nukerWinRoom = plans.find((p) => typeof p.meta?.towers?.nukeWindow?.nukerInWindow === "boolean");

// ---------- closed-since-r30: 93 recovers ----------
await rec(run("93 invent holder on taken room", takenName, (p) => {
  const R = p.meta.sealedRecovery;
  R.fixedHolders = [...(R.fixedHolders || []), { type: "lab", x: 1, y: 1, recovers: 99, recoversDeep: 99 }];
}));
await rec(run("93 plant recovers=2 / recoversDeep=2 on taken + note twin", takenName, (p) => {
  const rec0 = p.meta.sealedRecovery;
  for (const h of rec0.fixedHolders || []) {
    h.recovers = 2;
    h.recoversDeep = 2;
  }
  for (const nr of p.meta.noteRecords || []) {
    if (nr.cls !== "sealedRecovery" || !nr.rec) continue;
    nr.rec.fixedHolders = JSON.parse(JSON.stringify(rec0.fixedHolders));
    const i = p.meta.noteRecords.indexOf(nr);
    if (i >= 0 && Array.isArray(p.meta.notes)) p.meta.notes[i] = renderNote(nr);
  }
}));

// ---------- 98 named forges (should BITES) + r29p10 residue ----------
if (shrinkable) {
  await rec(run("98 invent shrink leave fullRun honest", shrinkable.room, (p) => {
    bothLanes(p, (L) => {
      L.shrunk = { from: 10, to: L.rounds, wanted: (L.tiles || 0) + 9, premium: 0 };
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
  await rec(run("98 named forge extra reserved 99,99 + fake-round", shrinkable.room, (p) => {
    bothLanes(p, (L) => {
      const extra = "99,99";
      const reserved = [...(L.fullRun.reserved || []).map(String), extra];
      const byRound = [...(L.fullRun.byRound || []).map((r) => r.slice()), [extra]];
      L.fullRun = {
        ...L.fullRun,
        tiles: reserved.length,
        rounds: byRound.length,
        shallow: 2,
        ext: 58,
        ran: true,
        used: byRound.length,
        to: L.rounds,
        reserved,
        byRound,
      };
      L.shrunk = { from: 10, to: L.rounds, wanted: reserved.length, premium: 0 };
      L.roundCap = L.rounds;
    });
  }));
}
if (realShrink) {
  await rec(run("98 named extra reserved 99,99 on real shrink", realShrink.room, (p) => {
    bothLanes(p, (L) => {
      const extra = "99,99";
      L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
      L.fullRun.tiles = L.fullRun.reserved.length;
      L.fullRun.byRound = L.fullRun.byRound.map((r) => r.slice());
      L.fullRun.byRound.push([extra]);
      L.fullRun.rounds = L.fullRun.byRound.length;
      L.fullRun.used = L.fullRun.rounds;
      if (L.shrunk) L.shrunk.wanted = L.fullRun.tiles;
    });
  }));
  await rec(run("98 named extra reserved 1,1 on real shrink", realShrink.room, (p) => {
    bothLanes(p, (L) => {
      const extra = "1,1";
      L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
      L.fullRun.tiles = L.fullRun.reserved.length;
      L.fullRun.byRound = L.fullRun.byRound.map((r) => r.slice());
      L.fullRun.byRound.push([extra]);
      L.fullRun.rounds = L.fullRun.byRound.length;
      L.fullRun.used = L.fullRun.rounds;
      if (L.shrunk) L.shrunk.wanted = L.fullRun.tiles;
    });
  }));
  await rec(run("98 named extra reserved 0,0 on real shrink", realShrink.room, (p) => {
    bothLanes(p, (L) => {
      const extra = "0,0";
      L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
      L.fullRun.tiles = L.fullRun.reserved.length;
      L.fullRun.byRound = L.fullRun.byRound.map((r) => r.slice());
      L.fullRun.byRound.push([extra]);
      L.fullRun.rounds = L.fullRun.byRound.length;
      L.fullRun.used = L.fullRun.rounds;
      if (L.shrunk) L.shrunk.wanted = L.fullRun.tiles;
    });
  }));
  await rec(run("98 delete reserved board on real shrink", realShrink.room, (p) => {
    bothLanes(p, (L) => {
      delete L.fullRun.reserved;
      delete L.fullRun.byRound;
    });
  }));

  // r29p10 named close: append 19,27 (D8 of kept prefix). Expect BITES.
  await rec(run("98 r29p10 append 19,27 to kept prefix", realShrink.room, (p) => {
    bothLanes(p, (L) => {
      const extra = "19,27";
      L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
      L.fullRun.tiles = L.fullRun.reserved.length;
      L.fullRun.byRound = L.fullRun.byRound.map((r) => r.slice());
      const last = L.fullRun.byRound[L.fullRun.byRound.length - 1] || [];
      L.fullRun.byRound[L.fullRun.byRound.length - 1] = [...last.map(String), extra];
      if (L.shrunk) L.shrunk.wanted = L.fullRun.tiles;
    });
  }));
  await rec(run("98 r29p10 append 19,27 also to lane.reserved", realShrink.room, (p) => {
    bothLanes(p, (L) => {
      const extra = "19,27";
      L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
      L.reserved = [...(L.reserved || []).map(String), extra];
      L.tiles = L.reserved.length;
      L.fullRun.tiles = L.fullRun.reserved.length;
      L.fullRun.byRound = L.fullRun.byRound.map((r) => r.slice());
      const last = L.fullRun.byRound[L.fullRun.byRound.length - 1] || [];
      L.fullRun.byRound[L.fullRun.byRound.length - 1] = [...last.map(String), extra];
      if (L.shrunk) L.shrunk.wanted = Math.max(L.shrunk.wanted || 0, L.fullRun.tiles + 1);
    });
  }));

  // r29p10 named residue: wanted is a free count as long as wanted > tiles.
  await rec(run("98 wanted += 1", realShrink.room, (p) => {
    bothLanes(p, (L) => {
      if (L.shrunk) L.shrunk.wanted = (L.shrunk.wanted || L.fullRun.tiles) + 1;
    });
  }));
  await rec(run("98 wanted += 999", realShrink.room, (p) => {
    bothLanes(p, (L) => {
      if (L.shrunk) L.shrunk.wanted = (L.shrunk.wanted || L.fullRun.tiles) + 999;
    });
  }));
  await rec(run("98 wanted := tiles (erase refused extra)", realShrink.room, (p) => {
    bothLanes(p, (L) => {
      if (L.shrunk) L.shrunk.wanted = L.fullRun.tiles;
    });
  }));
  await rec(run("98 premium += 1", realShrink.room, (p) => {
    bothLanes(p, (L) => {
      if (L.shrunk && typeof L.shrunk.premium === "number") L.shrunk.premium += 1;
    });
  }));
  await rec(run("98 fullRun.ext += 1 on shrink", realShrink.room, (p) => {
    bothLanes(p, (L) => {
      if (typeof L.fullRun.ext === "number") L.fullRun.ext += 1;
    });
  }));
  await rec(run("98 fullRun.shallow += 1 on shrink", realShrink.room, (p) => {
    bothLanes(p, (L) => {
      L.fullRun.shallow = (L.fullRun.shallow || 0) + 1;
    });
  }));
  await rec(run("98 fullRun.used += 1 on shrink", realShrink.room, (p) => {
    bothLanes(p, (L) => {
      L.fullRun.used = (L.fullRun.used || 0) + 1;
    });
  }));

  // Hunt: kept-prefix identity-swap. reserved === lane.reserved still holds.
  {
    const src = byPlan.get(realShrink.room);
    const d = byRoom.get(realShrink.room);
    const reserved = (src.meta.extensions.laneMeta.fullRun.reserved || []).map(String);
    const used = new Set(reserved);
    const objects = new Set();
    if (src.sitter) objects.add(K(src.sitter));
    for (const s of src.sources || []) objects.add(K(s));
    if (src.controller) objects.add(K(src.controller));
    if (src.mineral) objects.add(K(src.mineral));
    let swap = null;
    outer: for (const k of reserved) {
      const [x, y] = k.split(",").map(Number);
      for (const [dx, dy] of D8) {
        const nk = KT(x + dx, y + dy);
        if (used.has(nk) || objects.has(nk)) continue;
        if (!walkable(d.terrain, x + dx, y + dy)) continue;
        swap = { from: k, to: nk };
        break outer;
      }
    }
    attacks.push({ name: "98 prefix identity-swap search", room: realShrink.room, status: "INFO", first: swap ? `${swap.from}→${swap.to}` : "none" });
    console.log("INFO    ", "98 prefix identity-swap search", realShrink.room, swap ? `${swap.from}→${swap.to}` : "none");
    if (swap) {
      await rec(run(`98 prefix identity-swap ${swap.from}→${swap.to}`, realShrink.room, (p) => {
        bothLanes(p, (L) => {
          L.fullRun.reserved = L.fullRun.reserved.map((t) => (String(t) === swap.from ? swap.to : String(t)));
          L.reserved = (L.reserved || []).map((t) => (String(t) === swap.from ? swap.to : String(t)));
          L.fullRun.byRound = L.fullRun.byRound.map((r) => r.map((t) => (String(t) === swap.from ? swap.to : String(t))));
        });
      }));
    }
  }
}
if (droppedRoom) {
  await rec(run("98 invent extra reserved 99,99 on dropped room", droppedRoom.room, (p) => {
    bothLanes(p, (L) => {
      const extra = ["99,99"];
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
  const srcFat = byPlan.get(fatRung.room);
  const shipped0 = (srcFat.structures.rampart || []).length;
  const lastFat = (srcFat.meta.shellEscalation?.rungs || []).filter((r) => r && r.ramparts > shipped0).slice(-1)[0]
    || (srcFat.meta.shortfalls || []).find((s) => s.ladder)?.ladder?.rungs?.filter((r) => r.ramparts > shipped0).slice(-1)[0];
  const lastBonus = lastFat?.needDeepBonus;

  await rec(run("88 fatter discarded mobility 0.5 + regen", fatRung.room, (p) => {
    const shipped = (p.structures.rampart || []).length;
    for (const sf of p.meta.shortfalls || []) {
      if (!sf.ladder?.rungs) continue;
      for (const r of sf.ladder.rungs) {
        if (r && r.ramparts > shipped && typeof r.mobility === "number") r.mobility = 0.5;
      }
      try { sf.detail = renderDecl(sf); } catch { /* leave */ }
    }
  }));
  await rec(run("88 last-fat shipped-cut + ramparts:=cutlen (r29p7)", fatRung.room, (p) => {
    const shippedCut = (p.meta.shell.cut || []).map((t) => ({ x: t.x, y: t.y }));
    const pretty = enclosureMobility(dFat.terrain, p, shippedCut);
    applyBonus(p, lastBonus, (r) => {
      r.cutTiles = shippedCut.map((t) => ({ x: t.x, y: t.y }));
      r.mobility = pretty;
      r.ramparts = shippedCut.length;
    });
  }));
  await rec(run("88 8-tile box keep-ramparts (r29p8)", fatRung.room, (p) => {
    const sitter = p.sitter;
    const fake = [];
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]]) {
      fake.push({ x: sitter.x + dx, y: sitter.y + dy });
    }
    const lap = enclosureMobility(dFat.terrain, p, fake);
    applyBonus(p, lastBonus, (r) => {
      r.cutTiles = fake;
      r.mobility = lap;
    });
  }));

  // r29p10 named close: leaky nudge 20,9→19,9. Expect BITES.
  {
    const named = lastFat && lastFat.cutTiles.find((t) => t.x === 20 && t.y === 9);
    if (named) {
      const leaky = lastFat.cutTiles.map((t) => (t.x === 20 && t.y === 9 ? { x: 19, y: 9 } : { x: t.x, y: t.y }));
      const leakLap = enclosureMobility(dFat.terrain, srcFat, leaky);
      await rec(run("88 r29p10 leaky nudge 20,9→19,9", fatRung.room, (p) => {
        applyBonus(p, lastBonus, (r) => {
          r.cutTiles = leaky.map((t) => ({ x: t.x, y: t.y }));
          r.mobility = leakLap;
        });
      }));
      await rec(run("88 leaky nudge + complete=false", fatRung.room, (p) => {
        applyBonus(p, lastBonus, (r) => {
          r.cutTiles = leaky.map((t) => ({ x: t.x, y: t.y }));
          r.mobility = leakLap;
          r.complete = false;
        });
      }));
    }
  }

  // r29p10 named residue: sealing same-lap nudge 29,33→28,34. Expect ESCAPE.
  {
    const named = lastFat && lastFat.cutTiles.find((t) => t.x === 29 && t.y === 33);
    if (named) {
      const sealed = lastFat.cutTiles.map((t) => (t.x === 29 && t.y === 33 ? { x: 28, y: 34 } : { x: t.x, y: t.y }));
      const sealLap = enclosureMobility(dFat.terrain, srcFat, sealed);
      await rec(run("88 sealing same-lap nudge 29,33→28,34", fatRung.room, (p) => {
        applyBonus(p, lastBonus, (r) => {
          r.cutTiles = sealed.map((t) => ({ x: t.x, y: t.y }));
          r.mobility = sealLap;
        });
      }));
    }
  }

  await rec(run("88 last-fat complete=false alone", fatRung.room, (p) => {
    applyBonus(p, lastBonus, (r) => {
      r.complete = false;
    });
  }));

  // Hunt: drop one tile from last fat if the remainder still seals.
  if (lastFat && Array.isArray(lastFat.cutTiles)) {
    const si = srcFat.sitter.x + srcFat.sitter.y * 50;
    let dropped = null;
    for (let i = 0; i < lastFat.cutTiles.length && !dropped; i++) {
      const cand = lastFat.cutTiles.filter((_, j) => j !== i).map((t) => ({ x: t.x, y: t.y }));
      const { exteriorFlood } = await import("../shared.mjs");
      const ext = exteriorFlood(dFat.terrain, new Set(cand.map(K)));
      if (!ext[si]) {
        const lap = enclosureMobility(dFat.terrain, srcFat, cand);
        if (typeof lap === "number") dropped = { i, k: K(lastFat.cutTiles[i]), cand, lap };
      }
    }
    attacks.push({ name: "88 drop-one-tile search", room: fatRung.room, status: "INFO", first: dropped ? `${dropped.k} lap=${dropped.lap} n=${dropped.cand.length}` : "none" });
    console.log("INFO    ", "88 drop-one-tile search", fatRung.room, dropped ? `${dropped.k} lap=${dropped.lap}` : "none");
    if (dropped) {
      await rec(run(`88 drop one last-fat tile ${dropped.k} keep-seal`, fatRung.room, (p) => {
        applyBonus(p, lastBonus, (r) => {
          r.cutTiles = dropped.cand.map((t) => ({ x: t.x, y: t.y }));
          r.mobility = dropped.lap;
        });
      }));
    }
  }
}

// ---------- cutPasses ----------
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

// ---------- exact pick / seedScore ----------
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
}
await rec(run("141e seed moved off hub line", any, (p) => {
  if (p.seed && Number.isInteger(p.seed.x)) p.seed = { x: (p.seed.x + 3) % 48, y: (p.seed.y + 5) % 48 };
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

// ---------- r29p9 derived names should BITES ----------
await rec(run("r29p9 nukerInWindow flipped", nukerWinRoom?.room || any, (p) => {
  if (p.meta?.towers?.nukeWindow && typeof p.meta.towers.nukeWindow.nukerInWindow === "boolean") {
    p.meta.towers.nukeWindow.nukerInWindow = !p.meta.towers.nukeWindow.nukerInWindow;
  }
}));
await rec(run("r29p9 nukeWindow.center moved", nukerWinRoom?.room || any, (p) => {
  if (p.meta?.towers?.nukeWindow?.center) p.meta.towers.nukeWindow.center = { x: 1, y: 1 };
}));
await rec(run("r29p9 mineralSeatNetTiles forged", mineralNetRoom?.room || any, (p) => {
  if (p.meta?.misc) p.meta.misc.mineralSeatNetTiles = ["1,1"];
}));
await rec(run("r29p9 coveredDetourDeclared flipped", coveredRoom?.room || any, (p) => {
  if (p.meta?.walls?.mobility) p.meta.walls.mobility.coveredDetourDeclared = !p.meta.walls.mobility.coveredDetourDeclared;
}));

// ---------- remaining presence flattering (single-room) ----------
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
await rec(run("p12 roadsEaten := 0", plans.find((p) => (p.meta?.labs?.roadsEaten || 0) > 0)?.room || any, (p) => {
  if (p.meta?.labs && typeof p.meta.labs.roadsEaten === "number") p.meta.labs.roadsEaten = 0;
}));
await rec(run("p12 stitched := 0", plans.find((p) => (p.meta?.walls?.stitched || 0) > 0)?.room || any, (p) => {
  if (p.meta?.walls && typeof p.meta.walls.stitched === "number") p.meta.walls.stitched = 0;
}));
await rec(run("p12 stitchTiles := 0", plans.find((p) => (p.meta?.walls?.stitchTiles || 0) > 0)?.room || any, (p) => {
  if (p.meta?.walls && typeof p.meta.walls.stitchTiles === "number") p.meta.walls.stitchTiles = 0;
}));
await rec(run("p12 stubRoads := 0", plans.find((p) => (p.meta?.extensions?.stubRoads || 0) > 0)?.room || any, (p) => {
  if (p.meta?.extensions && typeof p.meta.extensions.stubRoads === "number") p.meta.extensions.stubRoads = 0;
}));
await rec(run("deepBudget := 0", plans.find((p) => (p.meta?.extensions?.deepBudget || 0) > 0)?.room || any, (p) => {
  if (p.meta?.extensions && typeof p.meta.extensions.deepBudget === "number") p.meta.extensions.deepBudget = 0;
}));
await rec(run("boundHeld := 0", plans.find((p) => (p.meta?.walls?.boundHeld || p.meta?.extensions?.boundHeld || 0) > 0)?.room || any, (p) => {
  if (p.meta?.walls && typeof p.meta.walls.boundHeld === "number") p.meta.walls.boundHeld = 0;
  if (p.meta?.extensions && typeof p.meta.extensions.boundHeld === "number") p.meta.extensions.boundHeld = 0;
}));
await rec(run("p12 towerOnly := 0", plans.find((p) => (p.meta?.towers?.nukeWindow?.towerOnly || 0) > 0)?.room || any, (p) => {
  if (p.meta?.towers?.nukeWindow && typeof p.meta.towers.nukeWindow.towerOnly === "number") {
    p.meta.towers.nukeWindow.towerOnly = 0;
  }
}));
await rec(run("p13 mineralContainer := 0", plans.find((p) => (p.meta?.misc?.mineralContainer || 0) > 0)?.room || any, (p) => {
  if (p.meta?.misc && typeof p.meta.misc.mineralContainer === "number") p.meta.misc.mineralContainer = 0;
}));
await rec(run("p13 minDmgPicked := 0", plans.find((p) => typeof p.meta?.towers?.rcl5Pair?.minDmgPicked === "number" && p.meta.towers.rcl5Pair.minDmgPicked !== 0)?.room || any, (p) => {
  if (p.meta?.towers?.rcl5Pair && typeof p.meta.towers.rcl5Pair.minDmgPicked === "number") {
    p.meta.towers.rcl5Pair.minDmgPicked = 0;
  }
}));
await rec(run("p13 servedFree := 0", plans.find((p) => (p.meta?.walls?.servedFree || 0) > 0)?.room || any, (p) => {
  if (p.meta?.walls && typeof p.meta.walls.servedFree === "number") p.meta.walls.servedFree = 0;
}));
await rec(run("p13 stitched := 2", plans.find((p) => (p.meta?.walls?.laidByKind?.stitch || 0) > 0 && typeof p.meta?.walls?.stitched === "number")?.room || any, (p) => {
  if (p.meta?.walls && typeof p.meta.walls.stitched === "number") p.meta.walls.stitched = 2;
}));
await rec(run("p13 stitched := 2 on laid>=2", plans.find((p) => (p.meta?.walls?.laidByKind?.stitch || 0) >= 2)?.room || any, (p) => {
  if (p.meta?.walls && typeof p.meta.walls.stitched === "number") p.meta.walls.stitched = 2;
}));
await rec(run("spurred decrement keep nonzero", plans.find((p) => (p.meta?.walls?.spurred || 0) > 1)?.room || any, (p) => {
  if (p.meta?.walls?.spurred > 1) p.meta.walls.spurred -= 1;
}));
await rec(run("extractorOffNetwork flipped alone", any, (p) => {
  if (typeof p.meta?.misc?.extractorOffNetwork === "boolean") {
    p.meta.misc.extractorOffNetwork = !p.meta.misc.extractorOffNetwork;
  }
}));
await rec(run("nukerHubDist := 1", any, (p) => {
  if (p.meta?.misc) p.meta.misc.nukerHubDist = 1;
}));
await rec(run("E5S1 mineralWhy append THE WALL IS FREE", "E5S1", (p) => {
  p.meta.misc.mineralOffNetworkWhy += " THE WALL IS FREE.";
}));

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
    coveredRoom: coveredRoom?.room,
    nukerWinRoom: nukerWinRoom?.room,
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
  targets: out.targets,
}, null, 2));
