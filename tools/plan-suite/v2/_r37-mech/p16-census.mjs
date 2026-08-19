/**
 * r29p16 measure-first. Throwaway. Do not commit.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MOBILITY_TARGET } from "../layer-shell.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.resolve(DIR, "../../out-v2/plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);
const T = (n) => ({ n, ok: 0, bad: 0, samples: [] });
function hit(t, ok, d) {
  t.n++;
  if (ok) t.ok++;
  else {
    t.bad++;
    if (t.samples.length < 4) t.samples.push(d);
  }
}
const s = {
  lapFloor: T(0),
  placedOrFb: T(0),
  placed60iffFb0: T(0),
  capEnum: T(0),
  cap16orFb: T(0),
  capTight: T(0),
};

for (const p of plans) {
  const e = p.meta?.extensions || {};
  const w = p.meta?.walls || {};
  const lap =
    e.reflow?.lapCeilingFloor ??
    w.reflow?.lapCeilingFloor ??
    e.lapCeilingFloor ??
    w.mobility?.lapCeilingFloor;
  hit(s.lapFloor, lap === MOBILITY_TARGET, { room: p.room, lap });
  const placed = e.corridorPlaced;
  const fb = e.corridorFallback;
  hit(s.placedOrFb, placed === 60 || fb > 0, { room: p.room, placed, fb });
  hit(s.placed60iffFb0, (fb === 0) === (placed === 60), { room: p.room, placed, fb });
  const cap = e.hubDistCap;
  hit(s.capEnum, [16, 19, 23, 999].includes(cap), { room: p.room, cap });
  hit(s.cap16orFb, cap === 16 || fb > 0, { room: p.room, cap, fb });
  const mx = e.maxHubDist || 0;
  const want = mx <= 16 ? 16 : mx <= 19 ? 19 : mx <= 23 ? 23 : 999;
  hit(s.capTight, cap === want, { room: p.room, cap, mx, want });
}
function line(name, t) {
  const m = t.bad === 0 ? "MATCH" : `MISS ${t.ok}/${t.n}`;
  console.log(m.padEnd(16), name, t.samples[0] ? JSON.stringify(t.samples[0]) : "");
}
for (const [k, v] of Object.entries(s)) line(k, v);
console.log("MOBILITY_TARGET", MOBILITY_TARGET);
