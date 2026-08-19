/**
 * Confirm the escapes: mineralWhy fleet hole, 88-with-regen, invert suffix,
 * dump the forged strings, battlement tiles content.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom } from "../validate.mjs";
import { renderDecl } from "../declprose.mjs";
import {
  MINERAL_OFF_NETWORK_BASIS,
  MINERAL_ON_NETWORK_BASIS,
  renderMineralOffNetworkWhy,
  mineralSeatCensus,
} from "../layer-misc.mjs";
import { chebyshev, fetchRoomsFromMongo } from "../shared.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "../../out-v2");
const CACHE = path.join(DIR, "rooms.json");
const plans = JSON.parse(fs.readFileSync(path.join(ROOT, "plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);
const byPlan = new Map(plans.map((p) => [p.room, p]));
const rooms = JSON.parse(fs.readFileSync(CACHE, "utf8"));
const byRoom = new Map(rooms.map((r) => [r.room, r]));

const FLEET_RE = /fleetMediansMeasured|eco\.ctrlMedian|eco\.srcMedian|eco\.ctrlGate|eco\.srcGate/;
const real = (res) => (res.fails || []).filter((f) => !FLEET_RE.test(f));
const clone = (room) => JSON.parse(JSON.stringify(byPlan.get(room)));

function run(name, room, mutate) {
  const d = byRoom.get(room);
  const p = clone(room);
  mutate(p);
  const res = checkRoom(p, d.terrain, d.objects, null);
  const fails = real(res);
  console.log(fails.length ? "BITES" : "ESCAPE", name, room, fails[0] ? fails[0].slice(0, 180) : "pass");
  return { name, room, status: fails.length ? "BITES" : "ESCAPE", detail: fails[0] || "pass" };
}

const K = (t) => `${t.x},${t.y}`;

// dump mineral why vs official census for residue + a few normals
const dump = [];
for (const room of ["E11S1", "E2S5", "E5S1", "E5S3", "E12S7", "E9S9", "E1S1"]) {
  const p = byPlan.get(room);
  if (!p) continue;
  const seat = (p.structures.container || []).find((c) => p.mineral && chebyshev(c, p.mineral) <= 1);
  const net = new Set((p.structures.road || []).map(K));
  for (const c of p.structures.container || []) net.add(K(c));
  if (seat) net.delete(K(seat));
  const want = seat
    ? renderMineralOffNetworkWhy({
        ...mineralSeatCensus(p.structures, seat, net),
        when: "the FINISHED road set, not layer 5's",
      })
    : null;
  const got = p.meta?.misc?.mineralOffNetworkWhy || "";
  dump.push({
    room,
    exact: got === want,
    seat: seat ? K(seat) : null,
    gotLen: got.length,
    wantLen: want ? want.length : 0,
    gotHead: got.slice(0, 180),
    wantHead: (want || "").slice(0, 180),
    divergeAt: (() => {
      if (!want) return null;
      let i = 0;
      while (i < got.length && i < want.length && got[i] === want[i]) i++;
      return i;
    })(),
  });
}
fs.writeFileSync(path.join(DIR, "mineral-why-dump.json"), JSON.stringify(dump, null, 2));
console.log("mineral why exact?", dump.map((d) => `${d.room}:${d.exact}@${d.divergeAt}`).join(" "));

const out = [];

// mineralWhy: append on several rooms including on-network
for (const room of ["E11S1", "E1S1", "E12S7", "E9S9", "E7S5", "E4S3"]) {
  if (!byPlan.has(room)) continue;
  out.push(run(`mineral-append-${room}`, room, (p) => {
    p.meta.misc.mineralOffNetworkWhy += " THE WALL IS FREE AND THE SEAT IS PAVED.";
  }));
}

// invert suffix on an off-network room
out.push(run("mineral-invert-suffix-E11S1", "E11S1", (p) => {
  p.meta.misc.mineralOffNetworkWhy = p.meta.misc.mineralOffNetworkWhy
    .replace(MINERAL_OFF_NETWORK_BASIS, MINERAL_ON_NETWORK_BASIS);
}));

// rewrite everything except seat + suffix
out.push(run("mineral-rewrite-all-but-seat-suffix-E11S1", "E11S1", (p) => {
  const s = p.meta.misc.mineralOffNetworkWhy;
  const seat = /mineral seat at (\d+),(\d+)/.exec(s);
  p.meta.misc.mineralOffNetworkWhy =
    `ON THIS ROOM: the mineral seat at ${seat[1]},${seat[2]} sits in a paved plaza of eight roads, ` +
    `so the exemption is a lie. ` + MINERAL_OFF_NETWORK_BASIS + ` Measured over a board nobody built.`;
}));

// 88: mutate rung mobility AND regenerate the paragraph
{
  const room = plans.find((p) => (p.meta?.shortfalls || []).some((s) => s.ladder?.rungs?.length > 1))?.room;
  out.push(run("88-rung-mobility-AND-regen", room, (p) => {
    for (const sf of p.meta.shortfalls || []) {
      const rungs = sf.ladder?.rungs;
      if (!rungs || rungs.length < 2) continue;
      for (let i = 1; i < rungs.length; i++) {
        if (rungs[i] && typeof rungs[i].mobility === "number") rungs[i].mobility = 0.01;
      }
      sf.detail = renderDecl(sf);
    }
  }));
}

// 88: only non-shipped rungs that have MORE ramparts than shipped
{
  const hit = plans.find((p) => {
    const sf = (p.meta?.shortfalls || []).find((s) => s.ladder?.rungs?.length > 1);
    if (!sf) return false;
    const shipped = (p.structures?.rampart || []).length;
    return sf.ladder.rungs.some((r, i) => i > 0 && r && r.ramparts > shipped);
  });
  if (hit) {
    out.push(run("88-fatter-rung-mobility-AND-regen", hit.room, (p) => {
      const shipped = (p.structures.rampart || []).length;
      for (const sf of p.meta.shortfalls || []) {
        if (!sf.ladder?.rungs) continue;
        for (let i = 1; i < sf.ladder.rungs.length; i++) {
          const r = sf.ladder.rungs[i];
          if (r && r.ramparts > shipped && typeof r.mobility === "number") r.mobility = 0.5;
        }
        sf.detail = renderDecl(sf);
      }
    }));
  } else {
    console.log("SKIP 88-fatter-rung — no room with a fatter discarded rung");
  }
}

// 93: delete gainedDeep on offered
out.push(run("93-delete-offered-gainedDeep", "E11S7", (p) => {
  const walk = (n) => {
    if (!n) return;
    for (const o of n.offered || []) {
      if (o.after) { delete o.after.gainedDeep; delete o.after.gainedTiles; }
      if (o.gainedDeep != null) delete o.gainedDeep;
      if (o.gainedTiles != null) delete o.gainedTiles;
    }
    if (n.next) walk(n.next);
  };
  walk(p.meta.sealedRecovery);
}));

// dump refill / swap strings
const e11 = byPlan.get("E11S1");
const refill = e11.meta.towers.refillBasis;
const offer = e11.meta.towers.towerSwapOffer?.basis;
fs.writeFileSync(
  path.join(DIR, "mf5-strings.json"),
  JSON.stringify(
    {
      refillBlocked: /with (\d+) tile\(s\) blocked/.exec(refill)?.[1],
      refillHead: refill.slice(0, 220),
      offerFace: /face at (\d+) and its saturation at (\d+)/.exec(offer),
      offerHead: (offer || "").slice(0, 280),
      minShellDmg: e11.meta.towers.minShellDmg,
      shippedMin: e11.meta.towers.shippedMinShellDmg,
    },
    null,
    2,
  ),
);

// battlement tiles vs board — are they even on the cut?
const e13 = byPlan.get("E13S3");
const bu = {
  count: e13.meta.shell.battlementUnreachable,
  tiles: e13.meta.shell.battlementUnreachableTiles,
  cutHas: (e13.meta.shell.battlementUnreachableTiles || []).map((t) =>
    (e13.meta.shell.cut || []).some((c) => c.x === t.x && c.y === t.y),
  ),
};
console.log("battlement E13S3", JSON.stringify(bu));

fs.writeFileSync(path.join(DIR, "followup.json"), JSON.stringify(out, null, 2));
console.log("\nescapes", out.filter((r) => r.status === "ESCAPE").map((r) => r.name).join(" | "));
