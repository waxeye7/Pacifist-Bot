/**
 * Follow-up mutations: leftover that the first pass could have mis-fired.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom } from "../validate.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.join(DIR, "../../out-v2/plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);
const rooms = JSON.parse(fs.readFileSync(path.join(DIR, "../_r28-mech/rooms.json"), "utf8"));
const by = new Map(rooms.map((r) => [r.room, r]));

function clone(room) {
  return JSON.parse(JSON.stringify(plans.find((p) => p.room === room)));
}
function tryCase(name, room, mutate) {
  const d = by.get(room);
  const p = clone(room);
  const before = mutate.length > 1 ? null : null;
  const snap = JSON.stringify(p);
  mutate(p);
  const changed = JSON.stringify(p) !== snap;
  let res;
  try {
    res = checkRoom(p, d.terrain, d.objects, null);
  } catch (e) {
    const row = { name, room, status: "threw", changed, msg: e.message.slice(0, 200) };
    console.log("THREW", name, changed, e.message.slice(0, 140));
    return row;
  }
  const real = (res.fails || []).filter(
    (f) => !/fleetMediansMeasured|eco\.ctrlMedian|eco\.srcMedian|eco\.ctrlGate|eco\.srcGate/.test(f),
  );
  const row = {
    name,
    room,
    status: real.length ? "BITES" : "ESCAPE",
    changed,
    n: real.length,
    first: real[0] && real[0].slice(0, 300),
  };
  console.log(row.status, name, "changed=" + changed, row.first || "");
  return row;
}

const attacks = [];

// Real nearest-road rewrite on a room that still prints the clause.
attacks.push(
  tryCase("E5S1 mineralWhy 1→99 steps (clause present)", "E5S1", (p) => {
    p.meta.misc.mineralOffNetworkWhy = p.meta.misc.mineralOffNetworkWhy.replace(
      /\d+ step\(s\) away/,
      "99 step(s) away",
    );
  }),
);

// 93: inflate recovers on ALL copies (sealedFloor + walls + noteRecords)
attacks.push(
  tryCase("93 inflate recovers on every copy", "E11S1", (p) => {
    const bump = (rec) => {
      if (!rec || !Array.isArray(rec.pockets)) return;
      for (const q of rec.pockets) {
        for (const h of q.holders || []) {
          if (typeof h.recovers === "number") {
            h.recovers = 99;
            if (typeof h.recoversDeep === "number") h.recoversDeep = 99;
          }
        }
      }
    };
    bump(p.meta.sealedFloor);
    bump(p.meta.walls?.sealedFloor);
    for (const n of p.meta.noteRecords || []) {
      if (n.cls === "sealedFloor") bump(n.rec);
    }
    // also recovery search records
    const R = p.meta.sealedRecovery;
    if (R) {
      for (const h of R.fixedHolders || []) {
        if (typeof h.recovers === "number") h.recovers = 99;
        if (typeof h.recoversDeep === "number") h.recoversDeep = 99;
      }
      for (const o of R.offered || []) {
        if (typeof o.recovers === "number") o.recovers = 99;
        if (typeof o.recoversDeep === "number") o.recoversDeep = 99;
      }
      for (const q of R.pockets || []) {
        if (!q || !Array.isArray(q.holders)) continue;
        for (const h of q.holders) {
          if (h && typeof h.recovers === "number") h.recovers = 99;
          if (h && typeof h.recoversDeep === "number") h.recoversDeep = 99;
        }
      }
    }
  }),
);

// L1: jam the two prune counts back into one clause on the film page? We can't
// easily mutate HTML through checkRoom unless we rewrite the page. Mutate
// walls.prunedGhosts vs pruned instead.
attacks.push(
  tryCase("L1 walls.prunedGhosts := pruned (jam identities)", "E2S7", (p) => {
    if (p.meta?.walls) p.meta.walls.prunedGhosts = p.meta.walls.pruned;
  }),
);
attacks.push(
  tryCase("L1 walls.prunedTransient := 0", "E2S7", (p) => {
    if (p.meta?.walls) p.meta.walls.prunedTransient = 0;
  }),
);

// seed 141(e)
const seedRoom = plans.find((p) => p.meta?.shell?.seed || p.meta?.seed)?.room;
const nosed = plans.filter((p) => !p.meta?.shell?.seed && !p.meta?.seed).length;
attacks.push(
  tryCase("141e invent a seed on a room that has none", plans.find((p) => !p.meta?.shell?.seed)?.room || "E11S1", (p) => {
    p.meta.shell.seed = { x: p.sitter.x, y: p.sitter.y };
  }),
);

// enclosure claims
attacks.push(
  tryCase("enclosedController flattered", plans.find((p) => p.meta?.shell?.enclosedController === false)?.room || "E11S1", (p) => {
    p.meta.shell.enclosedController = true;
  }),
);

// film emptyBecause plant
const emptyRoom = plans.find((p) => {
  // can't easily mutate film from plan; skip if no handle
  return false;
})?.room;

// cutAdopted emptied vs planted already done
// protectRadius exact: already escaped

// 134(a) shrink one freeze tile + log matching add
attacks.push(
  tryCase("134a absorb one freeze tile + matching add log", "E13S3", (p) => {
    const freeze = p.meta.shell.cutAtFreeze;
    const add = (p.meta.shell.cutDrift || []).find((e) => e.op === "add");
    if (!add || !freeze.length) return;
    // absorb the add into freeze (so replay still holds) and drop the add row
    freeze.push({ x: add.x, y: add.y });
    p.meta.shell.cutDrift = p.meta.shell.cutDrift.filter((e) => !(e.op === "add" && e.x === add.x && e.y === add.y));
    for (const mk of p.meta.shell.cutPasses || []) {
      if (mk.pass === add.pass) mk.adds = Math.max(0, (mk.adds || 1) - 1);
    }
  }),
);

const roomsWithSeed = plans.filter((p) => p.meta?.shell?.seed || p.meta?.seed).length;
const roomsWithSeedField = {
  shellSeed: plans.filter((p) => p.meta?.shell?.seed).length,
  metaSeed: plans.filter((p) => p.meta?.seed).length,
};

const out = { attacks, roomsWithSeed, roomsWithSeedField, nosed };
fs.writeFileSync(path.join(DIR, "followup-out.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  n: attacks.length,
  escapes: attacks.filter((a) => a.status === "ESCAPE").map((a) => ({ name: a.name, changed: a.changed })),
  bites: attacks.filter((a) => a.status === "BITES").map((a) => a.name),
  roomsWithSeed,
  roomsWithSeedField,
}, null, 2));
