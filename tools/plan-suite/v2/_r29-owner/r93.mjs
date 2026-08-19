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

function tryCase(name, room, mutate) {
  const p = JSON.parse(JSON.stringify(plans.find((x) => x.room === room)));
  mutate(p);
  const res = checkRoom(p, by.get(room).terrain, by.get(room).objects, null);
  const real = (res.fails || []).filter(
    (f) => !/fleetMediansMeasured|eco\.ctrlMedian|eco\.srcMedian|eco\.ctrlGate|eco\.srcGate/.test(f),
  );
  console.log(real.length ? "BITES" : "ESCAPE", name, real[0] ? real[0].slice(0, 260) : "");
}

tryCase("93 taken E15S6 recovers:=cap on recovery+noteRecords only", "E15S6", (p) => {
  const rec = p.meta.sealedRecovery;
  const c = (rec.pockets || []).reduce((n, pk) => n + (pk.tiles || 0), 0);
  const bump = (R) => {
    if (!R || !Array.isArray(R.fixedHolders)) return;
    for (const h of R.fixedHolders) {
      h.recovers = c;
      if (typeof h.recoversDeep === "number") h.recoversDeep = Math.min(h.recoversDeep, c);
    }
  };
  bump(rec);
  for (const n of p.meta.noteRecords || []) if (n.cls === "sealedRecovery") bump(n.rec);
});

tryCase("93 taken E15S6 recovers:=cap also regenerate notes[] if present", "E15S6", (p) => {
  const rec = p.meta.sealedRecovery;
  const c = (rec.pockets || []).reduce((n, pk) => n + (pk.tiles || 0), 0);
  const bump = (R) => {
    if (!R || !Array.isArray(R.fixedHolders)) return;
    for (const h of R.fixedHolders) {
      h.recovers = c;
      if (typeof h.recoversDeep === "number") h.recoversDeep = Math.min(h.recoversDeep, c);
    }
  };
  bump(rec);
  for (const n of p.meta.noteRecords || []) if (n.cls === "sealedRecovery") bump(n.rec);
  if (Array.isArray(p.meta.notes)) {
    p.meta.notes = p.meta.notes.map((s) =>
      typeof s === "string" ? s.replace(/recovers \d+/g, `recovers ${c}`) : s,
    );
  }
});
