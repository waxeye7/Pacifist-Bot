/**
 * Round-29 owner attacks. Mutate clones in memory, run checkRoom.
 * Does not write the artifact.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom } from "../validate.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.join(DIR, "../../out-v2/plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);
const rooms = JSON.parse(
  fs.readFileSync(process.env.ROOMS_FILE || path.join(DIR, "../_r28-mech/rooms.json"), "utf8"),
);
const by = new Map(rooms.map((r) => [r.room, r]));

function clone(room) {
  return JSON.parse(JSON.stringify(plans.find((p) => p.room === room)));
}

function tryCase(name, room, mutate) {
  const d = by.get(room);
  if (!d) return { name, room, status: "no-terrain" };
  const p = clone(room);
  mutate(p);
  let res;
  try {
    res = checkRoom(p, d.terrain, d.objects, null);
  } catch (e) {
    const row = { name, room, status: "threw", msg: e.message.slice(0, 240) };
    console.log("THREW", name, room, e.message.slice(0, 180));
    return row;
  }
  const real = (res.fails || []).filter(
    (f) => !/fleetMediansMeasured|eco\.ctrlMedian|eco\.srcMedian|eco\.ctrlGate|eco\.srcGate/.test(f),
  );
  const row = {
    name,
    room,
    status: real.length ? "BITES" : "ESCAPE",
    n: real.length,
    first: real[0] && real[0].slice(0, 280),
  };
  console.log(row.status, name, room, row.first || "");
  return row;
}

const addRoom =
  plans.find((p) => (p.meta?.shell?.cutDrift || []).some((e) => e.op === "add"))?.room || "E13S3";
const pruneRoom =
  plans.find((p) =>
    (p.meta?.shell?.cutPasses || []).some((m) => m && m.kind === "inertPrune" && m.rampartsDeleted > 0),
  )?.room || addRoom;
const any = plans[0].room;
const slackSeal = plans.find((p) => {
  const mk = (p.meta?.shell?.cutPasses || []).find((m) => m && m.kind === "reconcileSeal" && Number.isInteger(m.sealCritical));
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
  return [8, 10, 12, 14, 16].find((v) => v !== r) || 10;
})();
const baseCutRoom = plans.find((p) => typeof p.meta?.shell?.baseCut === "number" && p.meta.shell.baseCut > 1)?.room || any;
const takenRoom = plans.find((p) => {
  const rec = (p.meta?.sealedFloor || p.meta?.walls?.sealedFloor);
  return rec && Array.isArray(rec.pockets) && rec.pockets.some((q) => (q.holders || []).length);
})?.room;
const shrinkable = plans.find((p) => {
  const L = p.meta?.extensions?.laneMeta;
  return L && L.fullRun && !L.fullRun.ran && !L.shrunk && !L.dropped && typeof L.rounds === "number";
})?.room;
const fatRung = plans.find((p) => {
  const sf = (p.meta?.shortfalls || []).find((s) => s && s.ladder && Array.isArray(s.ladder.rungs));
  const shipped = (p.structures?.rampart || []).length;
  return !!(sf && sf.ladder.rungs.some((r) => r && r.ramparts > shipped && typeof r.mobility === "number"));
})?.room;
const pruneCaption = plans.find((p) => {
  const w = p.meta?.walls;
  return w && typeof w.pruned === "number" && typeof w.prunedGhosts === "number" && w.pruned !== w.prunedGhosts;
})?.room || "E2S7";

const attacks = [];

attacks.push(
  tryCase("cutPasses.sealCritical += 999 (r28 M1)", addRoom, (p) => {
    for (const mk of p.meta.shell.cutPasses || []) if (typeof mk.sealCritical === "number") mk.sealCritical += 999;
  }),
);
attacks.push(
  tryCase("cutPasses.ramparts := 0 on prune markers (r28 M1)", pruneRoom, (p) => {
    for (const mk of p.meta.shell.cutPasses || []) if (mk.kind === "inertPrune") mk.ramparts = 0;
  }),
);
attacks.push(
  tryCase("cutPasses.kind rewritten to reviewer", addRoom, (p) => {
    for (const mk of p.meta.shell.cutPasses || []) mk.kind = "reviewer";
  }),
);
attacks.push(
  tryCase("swap rampartsDeleted between prune markers (sum preserved)", swapPrune || pruneRoom, (p) => {
    const a = (p.meta.shell.cutPasses || []).find((m) => m.pass === "layer7-inertPrune");
    const b = (p.meta.shell.cutPasses || []).find((m) => m.pass === "layer7b-inertPrune");
    if (a && b) {
      const t = a.rampartsDeleted;
      a.rampartsDeleted = b.rampartsDeleted;
      b.rampartsDeleted = t;
    }
  }),
);
attacks.push(
  tryCase("cutPasses.sealCritical += 1 within [adds, rampN]", slackSeal || addRoom, (p) => {
    for (const mk of p.meta.shell.cutPasses || []) if (Number.isInteger(mk.sealCritical)) mk.sealCritical += 1;
  }),
);
attacks.push(
  tryCase("cutPasses.sealCritical := adds (lower bound)", slackSeal || addRoom, (p) => {
    for (const mk of p.meta.shell.cutPasses || []) if (Number.isInteger(mk.sealCritical)) mk.sealCritical = mk.adds;
  }),
);
attacks.push(
  tryCase("cutPasses.sealCritical := rampN (upper bound)", slackSeal || addRoom, (p) => {
    const n = (p.structures.rampart || []).length;
    for (const mk of p.meta.shell.cutPasses || []) if (Number.isInteger(mk.sealCritical)) mk.sealCritical = n;
  }),
);
attacks.push(
  tryCase("cutPasses.prune ramparts inflated +8 (deleted held)", slackPrune || pruneRoom, (p) => {
    for (const mk of p.meta.shell.cutPasses || []) if (mk.kind === "inertPrune") mk.ramparts += 8;
  }),
);
attacks.push(
  tryCase("cutDrift.why append false clause (control, should bite)", addRoom, (p) => {
    for (const e of p.meta.shell.cutDrift || []) e.why = e.why + " and this tile was never wall.";
  }),
);

attacks.push(
  tryCase("E2S5 mineralWhy 1→99 steps", "E2S5", (p) => {
    p.meta.misc.mineralOffNetworkWhy = p.meta.misc.mineralOffNetworkWhy.replace(
      /\d+ step\(s\) away/,
      "99 step(s) away",
    );
  }),
);
attacks.push(
  tryCase("E5S1 mineralWhy append THE WALL IS FREE", "E5S1", (p) => {
    p.meta.misc.mineralOffNetworkWhy += " THE WALL IS FREE.";
  }),
);
attacks.push(
  tryCase("E5S3 mineralWhy swap with E5S1", "E5S3", (p) => {
    p.meta.misc.mineralOffNetworkWhy = plans.find((x) => x.room === "E5S1").meta.misc.mineralOffNetworkWhy;
  }),
);
attacks.push(
  tryCase("E11S1 mineralWhy invert suffix keep seat", "E11S1", (p) => {
    const s = p.meta.misc.mineralOffNetworkWhy;
    p.meta.misc.mineralOffNetworkWhy = s.replace(
      /no road by design[\s\S]*$/,
      "no road was grown to it, but a corridor another layer laid runs past it, so it is serviced like any other container. Measured over the FINISHED road set, not layer 5's.",
    );
  }),
);

attacks.push(
  tryCase("nukerHubDist := 1", any, (p) => {
    if (p.meta?.misc) p.meta.misc.nukerHubDist = 1;
  }),
);
attacks.push(
  tryCase("protectRadius := 0", radRoom, (p) => {
    p.meta.shell.protectRadius = 0;
  }),
);
attacks.push(
  tryCase("protectRadius flipped to another legal enum", radRoom, (p) => {
    p.meta.shell.protectRadius = otherRadius;
  }),
);
attacks.push(
  tryCase("baseCut += 1 (keep priceyWall consistent)", baseCutRoom, (p) => {
    p.meta.shell.baseCut += 1;
    p.meta.shell.priceyWall = p.meta.shell.baseCut > 50 ? 1 : 0;
  }),
);
attacks.push(
  tryCase("cutAdopted planted first rampart", any, (p) => {
    const r = p.structures.rampart[0];
    p.meta.shell.cutAdopted = [{ x: r.x, y: r.y }];
  }),
);
attacks.push(
  tryCase("battlement count+tiles zeroed together", plans.find((p) => p.meta?.shell?.battlementUnreachable > 0)?.room || "E13S3", (p) => {
    p.meta.shell.battlementUnreachable = 0;
    p.meta.shell.battlementUnreachableTiles = [];
  }),
);
attacks.push(
  tryCase("towerSwapOffer face 999/999", "E11S1", (p) => {
    if (p.meta?.towers?.towerSwapOffer?.basis) {
      p.meta.towers.towerSwapOffer.basis = p.meta.towers.towerSwapOffer.basis.replace(
        /face at \d+ and its saturation at \d+/,
        "face at 999 and its saturation at 999",
      );
    }
  }),
);
attacks.push(
  tryCase("shippedShellDmg.min := 9999 alone", any, (p) => {
    if (p.meta?.shell?.shippedShellDmg) p.meta.shell.shippedShellDmg.min = 9999;
  }),
);

if (fatRung) {
  attacks.push(
    tryCase("88 fatter discarded-rung mobility 0.5 + regen", fatRung, (p) => {
      const shipped = (p.structures.rampart || []).length;
      for (const sf of p.meta.shortfalls || []) {
        if (!sf.ladder?.rungs) continue;
        for (const r of sf.ladder.rungs) {
          if (r && r.ramparts > shipped && typeof r.mobility === "number") r.mobility = 0.5;
        }
      }
    }),
  );
}

if (takenRoom) {
  attacks.push(
    tryCase("93 invent holder on taken room", takenRoom, (p) => {
      const rec = p.meta.sealedFloor || p.meta.walls.sealedFloor;
      const q = rec.pockets.find((x) => Array.isArray(x.holders));
      if (q) q.holders.push({ type: "extension", x: 1, y: 1, recovers: 99, recoversDeep: 99 });
    }),
  );
  attacks.push(
    tryCase("93 inflate recovers on existing holder", takenRoom, (p) => {
      const rec = p.meta.sealedFloor || p.meta.walls.sealedFloor;
      for (const q of rec.pockets || []) {
        for (const h of q.holders || []) {
          if (typeof h.recovers === "number") {
            h.recovers = 99;
            h.recoversDeep = 99;
          }
        }
      }
    }),
  );
}

if (shrinkable) {
  attacks.push(
    tryCase("98 invent shrink on a plain room (stated)", shrinkable, (p) => {
      const L = p.meta.extensions.laneMeta;
      const W = p.meta.walls.mobility.lanes;
      const shrunk = { from: 10, to: L.rounds, wanted: (L.tiles || 0) + 9, premium: 0 };
      L.shrunk = shrunk;
      L.roundCap = L.rounds;
      if (W && W !== L) {
        W.shrunk = { ...shrunk };
        W.roundCap = L.rounds;
      }
    }),
  );
  attacks.push(
    tryCase("98 forge fullRun then invent shrink (residue)", shrinkable, (p) => {
      const L = p.meta.extensions.laneMeta;
      const W = p.meta.walls.mobility.lanes;
      const fr = {
        ...(L.fullRun || {}),
        ran: true,
        tiles: (L.tiles || 0) + 9,
        ext: 51,
        shallow: 3,
        to: L.rounds,
        used: 10,
        rounds: 10,
      };
      L.fullRun = fr;
      L.shrunk = { from: 10, to: L.rounds, wanted: fr.tiles, premium: 0 };
      L.roundCap = L.rounds;
      if (W) {
        W.fullRun = { ...fr };
        W.shrunk = { ...L.shrunk };
        W.roundCap = L.rounds;
      }
    }),
  );
}

const out = {
  addRoom,
  pruneRoom,
  slackSeal,
  slackPrune,
  swapPrune,
  radRoom,
  otherRadius,
  baseCutRoom,
  takenRoom,
  shrinkable,
  fatRung,
  pruneCaption,
  attacks,
};
fs.writeFileSync(path.join(DIR, "attack-out.json"), JSON.stringify(out, null, 2));
const esc = attacks.filter((a) => a.status === "ESCAPE");
const bite = attacks.filter((a) => a.status === "BITES");
console.log(JSON.stringify({ n: attacks.length, escapes: esc.map((a) => a.name), bites: bite.length }, null, 2));
