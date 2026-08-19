/**
 * Throwaway r29p6 probe. Named 98 extras via checkRoom. Do not commit.
 */
import { checkRoom } from "../validate.mjs";
import { loadPlans, loadRooms } from "./common.mjs";

const { plans } = loadPlans();
const { byRoom } = loadRooms();

const clone = (p) => JSON.parse(JSON.stringify(p));
const twin = (p, fn) => {
  fn(p.meta.extensions.laneMeta);
  const W = p.meta.walls?.mobility?.lanes;
  if (W && W !== p.meta.extensions.laneMeta) fn(W);
};

const shrink = plans.find((p) => p.meta?.extensions?.laneMeta?.shrunk && Array.isArray(p.meta.extensions.laneMeta.fullRun?.reserved));
const kept = plans.find((p) => {
  const L = p.meta?.extensions?.laneMeta;
  return L && L.fullRun && !L.fullRun.ran && !L.shrunk && !L.dropped && Array.isArray(L.fullRun.reserved);
});

function run(name, plan, mut) {
  const p = clone(plan);
  mut(p);
  const d = byRoom.get(p.room);
  const res = checkRoom(p, d.terrain, d.objects);
  const fails = res.fails || [];
  const floor = fails.filter((f) => /walk|floor|COORD bag/i.test(f));
  console.log(floor.length ? "BITES" : fails.length ? "OTHER" : "ESCAPE", name, p.room);
  for (const f of (floor.length ? floor : fails).slice(0, 3)) console.log("   ", f.slice(0, 220));
}

run("r30/98-X-extra-reserved-99-99", shrink, (p) => {
  twin(p, (L) => {
    const extra = "99,99";
    L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
    L.fullRun.byRound = [...L.fullRun.byRound.map((r) => r.slice()), [extra]];
    L.fullRun.tiles = L.fullRun.reserved.length;
    L.fullRun.rounds = L.fullRun.byRound.length;
    L.fullRun.used = L.fullRun.rounds;
    L.shrunk.wanted = L.fullRun.tiles;
  });
});

run("r30/98-X-invent-shrink-with-extra-round", kept, (p) => {
  twin(p, (L) => {
    const extra = "1,1";
    const keptTo = L.fullRun.rounds || L.fullRun.byRound.length;
    L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
    L.fullRun.byRound = [...L.fullRun.byRound.map((r) => r.slice()), [extra]];
    L.fullRun.tiles = L.fullRun.reserved.length;
    L.fullRun.rounds = L.fullRun.byRound.length;
    L.fullRun.ext = 58;
    L.fullRun.shallow = 2;
    L.fullRun.ran = true;
    L.fullRun.used = L.fullRun.rounds;
    L.fullRun.to = keptTo;
    L.shrunk = { from: 10, to: keptTo, wanted: L.fullRun.tiles, premium: 0 };
    L.roundCap = keptTo;
  });
});

run("r30/98-X-extra-reserved-border-0-0", shrink, (p) => {
  twin(p, (L) => {
    const extra = "0,0";
    L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
    L.fullRun.byRound = [...L.fullRun.byRound.map((r) => r.slice()), [extra]];
    L.fullRun.tiles = L.fullRun.reserved.length;
    L.fullRun.rounds = L.fullRun.byRound.length;
    L.fullRun.used = L.fullRun.rounds;
    L.shrunk.wanted = L.fullRun.tiles;
  });
});

// remaining residue: D8 neighbour of an existing reserved tile
run("98 D8-neighbour extra (residue?)", shrink, (p) => {
  const L0 = p.meta.extensions.laneMeta;
  const [x, y] = L0.fullRun.reserved[0].split(",").map(Number);
  const extra = `${x + 1},${y}`;
  twin(p, (L) => {
    L.fullRun.reserved = [...L.fullRun.reserved.map(String), extra];
    L.fullRun.byRound = [...L.fullRun.byRound.map((r) => r.slice()), [extra]];
    L.fullRun.tiles = L.fullRun.reserved.length;
    L.fullRun.rounds = L.fullRun.byRound.length;
    L.fullRun.used = L.fullRun.rounds;
    L.shrunk.wanted = L.fullRun.tiles;
  });
});
