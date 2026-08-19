/**
 * r45 / criticism 98 — mutation-test the two named ESCAPE rows.
 * Throwaway. Does not write the artifact.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom } from "./validate.mjs";
import { composeCap10Lane } from "./layer-ext.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PLANS = path.join(DIR, "../out-v2/plans-hub.json");
const ROOMS = process.env.ROOMS_FILE || path.join(DIR, "_r28-mech/rooms.json");

const plans = JSON.parse(fs.readFileSync(PLANS, "utf8")).filter((p) => p && p.room && !p.error);
const rooms = JSON.parse(fs.readFileSync(ROOMS, "utf8"));
const byRoom = new Map(rooms.map((r) => [r.room, r]));
const e11 = plans.find((p) => p.room === "E11S1");
const d11 = byRoom.get("E11S1");
const clone = () => JSON.parse(JSON.stringify(e11));
const twin = (p, fn) => {
  fn(p.meta.extensions.laneMeta);
  const W = p.meta.walls?.mobility?.lanes;
  if (W && W !== p.meta.extensions.laneMeta) fn(W);
};

const t0 = performance.now();
const walk = composeCap10Lane(d11.terrain, e11);
const composeMs = performance.now() - t0;
const t1 = performance.now();
composeCap10Lane(d11.terrain, e11);
const cacheMs = performance.now() - t1;

const base = checkRoom(clone(), d11.terrain, d11.objects, null);

const both = clone();
twin(both, (L) => {
  const extra = "19,27";
  L.reserved = [...L.reserved.map(String), extra];
  L.tiles = L.reserved.length;
  L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
  const last = L.fullRun.byRound[L.fullRun.byRound.length - 1] || [];
  L.fullRun.byRound = [
    ...L.fullRun.byRound.slice(0, -1).map((r) => r.slice()),
    [...last.map(String), extra],
  ];
  L.fullRun.tiles = L.fullRun.reserved.length;
  L.shrunk.wanted = L.fullRun.tiles + 1;
});
const rBoth = checkRoom(both, d11.terrain, d11.objects, null);

const plus = clone();
twin(plus, (L) => {
  L.shrunk.wanted += 1;
});
const rPlus = checkRoom(plus, d11.terrain, d11.objects, null);

const one = clone();
{
  const L = one.meta.extensions.laneMeta;
  const extra = "19,27";
  L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
  const last = L.fullRun.byRound[L.fullRun.byRound.length - 1] || [];
  L.fullRun.byRound = [
    ...L.fullRun.byRound.slice(0, -1).map((r) => r.slice()),
    [...last.map(String), extra],
  ];
  L.fullRun.tiles = L.fullRun.reserved.length;
  L.shrunk.wanted = L.fullRun.tiles;
}
const rOne = checkRoom(one, d11.terrain, d11.objects, null);

const hit = (res, re) => (res.fails || []).find((f) => re.test(f)) || res.fails?.[0] || "";
console.log(
  JSON.stringify(
    {
      compose: {
        ms: +composeMs.toFixed(1),
        cacheMs: +cacheMs.toFixed(1),
        tiles: walk?.tiles,
        rounds: walk?.rounds,
        reserved: walk?.reserved,
      },
      baseline: base.fails.length ? "FAIL " + base.fails[0] : "PASS",
      bothLists1927: { result: rBoth.fails.length ? "BITES" : "ESCAPE", hit: hit(rBoth, /greedy compose|both lists/i) },
      wantedPlus1: { result: rPlus.fails.length ? "BITES" : "ESCAPE", hit: hit(rPlus, /wanted is that walk/i) },
      oneList1927: { result: rOne.fails.length ? "BITES" : "ESCAPE", hit: hit(rOne, /reserved|prefix|greedy/i) },
    },
    null,
    2,
  ),
);
