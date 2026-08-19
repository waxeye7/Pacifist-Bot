/**
 * Targeted residue: 93 recovers within pocket cap; E9S9 shallow note vs board.
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
  const snap = JSON.stringify(p);
  mutate(p);
  const changed = JSON.stringify(p) !== snap;
  let res;
  try {
    res = checkRoom(p, d.terrain, d.objects, null);
  } catch (e) {
    console.log("THREW", name, e.message.slice(0, 160));
    return { name, status: "threw", changed };
  }
  const real = (res.fails || []).filter(
    (f) => !/fleetMediansMeasured|eco\.ctrlMedian|eco\.srcMedian|eco\.ctrlGate|eco\.srcGate/.test(f),
  );
  console.log(real.length ? "BITES" : "ESCAPE", name, "changed=" + changed, real[0] ? real[0].slice(0, 240) : "");
  return { name, status: real.length ? "BITES" : "ESCAPE", changed, first: real[0] && real[0].slice(0, 260) };
}

const e11 = plans.find((p) => p.room === "E11S1");
const R = e11.meta.sealedRecovery;
const taken = R && R.taken;
const holders = (R && R.fixedHolders) || [];
const cap = (R.pockets || []).reduce((n, pk) => n + (pk.tiles || 0), 0);
console.log(JSON.stringify({ taken, cap, holders: holders.map((h) => ({ t: h.type, k: `${h.x},${h.y}`, r: h.recovers, d: h.recoversDeep })) }, null, 2));

const attacks = [];
if (holders.length && cap > 0) {
  attacks.push(
    tryCase("93 recovers := cap on taken fixedHolders only", "E11S1", (p) => {
      const rec = p.meta.sealedRecovery;
      const c = (rec.pockets || []).reduce((n, pk) => n + (pk.tiles || 0), 0);
      for (const h of rec.fixedHolders || []) {
        h.recovers = c;
        if (typeof h.recoversDeep === "number") h.recoversDeep = Math.min(h.recoversDeep, c);
      }
    }),
  );
  attacks.push(
    tryCase("93 recoversDeep := recovers on taken fixedHolders only", "E11S1", (p) => {
      for (const h of p.meta.sealedRecovery.fixedHolders || []) {
        if (typeof h.recovers === "number") h.recoversDeep = h.recovers;
      }
    }),
  );
}

const e9 = plans.find((p) => p.room === "E9S9");
const n9 = (e9.meta.noteRecords || []).filter((n) => /shallow/i.test(n.cls || "") || /shallow/i.test(String(n.detail || "")));
const sf9 = (e9.meta.shortfalls || []).filter((s) => /shallow/i.test(s.kind || "") || /shallow/i.test(s.gate || "") || /SHALLOW/i.test(String(s.detail || "")));
console.log("E9S9 notes", (e9.meta.noteRecords || []).map((n) => n.cls));
console.log("E9S9 shallow notes", n9.map((n) => ({ cls: n.cls, detail: String(n.detail || n.rec?.detail || "").slice(0, 280) })));
console.log("E9S9 shallow sf", sf9.map((s) => ({ gate: s.gate, kind: s.kind, detail: String(s.detail || "").slice(0, 220) })));
console.log("E9S9 ext.shallow", e9.meta?.extensions?.shallow, "relocated", e9.meta?.extensions?.relocatedCount);

fs.writeFileSync(path.join(DIR, "residue-out.json"), JSON.stringify({ attacks, taken, cap, holders, e9cls: (e9.meta.noteRecords || []).map((n) => n.cls) }, null, 2));
