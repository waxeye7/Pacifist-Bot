/**
 * Round-28 owner attacks: ruling-leaf mutations + fleet mineral-why vs board
 * + note-sentence probes. Does not write the artifact.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom } from "../validate.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.join(DIR, "../../out-v2/plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);
const roomsFile =
  process.env.ROOMS_FILE ||
  "C:/Users/stemm/AppData/Local/Temp/claude/C--Users-stemm-Documents-GitHub-screeps-Pacifist-Bot/925cd69a-24ce-4beb-9c86-6af0641f273a/scratchpad/rooms.json";
const rooms = JSON.parse(fs.readFileSync(roomsFile, "utf8"));
const by = new Map(rooms.map((r) => [r.room, r]));

function clone(room) {
  return JSON.parse(JSON.stringify(plans.find((p) => p.room === room)));
}
function tryCase(name, room, mutate) {
  const d = by.get(room);
  if (!d) {
    console.log("NO_TERRAIN", name, room);
    return { name, room, status: "no-terrain" };
  }
  const p = clone(room);
  mutate(p);
  let res;
  try {
    res = checkRoom(p, d.terrain, d.objects, null);
  } catch (e) {
    console.log("THREW", name, room, e.message.slice(0, 180));
    return { name, room, status: "threw", msg: e.message.slice(0, 200) };
  }
  const real = (res.fails || []).filter(
    (f) => !/fleetMediansMeasured|eco\.ctrlMedian|eco\.srcMedian|eco\.ctrlGate|eco\.srcGate/.test(f),
  );
  console.log(real.length ? "BITES" : "ESCAPE", name, room, real.length ? real[0].slice(0, 160) : "");
  return { name, room, status: real.length ? "BITES" : "ESCAPE", n: real.length, first: real[0] && real[0].slice(0, 220) };
}

const addRoom = plans.find((p) => (p.meta?.shell?.cutDrift || []).some((e) => e.op === "add"))?.room;
const any = plans[0].room;
const e5s1 = "E5S1";
const e2s5 = "E2S5";
const e5s3 = "E5S3";
const e3s4 = "E3S4";
const e11s1 = "E11S1";

const attacks = [];
attacks.push(
  tryCase("cutPasses.sealCritical += 999 on add room", addRoom, (p) => {
    for (const mk of p.meta.shell.cutPasses || []) if (typeof mk.sealCritical === "number") mk.sealCritical += 999;
  }),
);
attacks.push(
  tryCase("cutPasses.ramparts := 0 on prune markers", addRoom, (p) => {
    for (const mk of p.meta.shell.cutPasses || []) if (mk.kind === "inertPrune") mk.ramparts = 0;
  }),
);
attacks.push(
  tryCase("cutPasses.kind rewritten to reviewer", addRoom, (p) => {
    for (const mk of p.meta.shell.cutPasses || []) mk.kind = "reviewer";
  }),
);
attacks.push(
  tryCase("swap rampartsDeleted between prune markers (sum preserved)", addRoom, (p) => {
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
  tryCase("cutDrift.why append false clause (should bite)", addRoom, (p) => {
    for (const e of p.meta.shell.cutDrift || []) e.why = e.why + " and this tile was never wall.";
  }),
);
attacks.push(
  tryCase("E5S1 mineralWhy keep seat+suffix rewrite ring (official residue door)", e5s1, (p) => {
    const s = p.meta.misc.mineralOffNetworkWhy;
    const seat = /mineral seat at (\d+),(\d+)/.exec(s);
    const suffix = s.includes("no road by design")
      ? s.slice(s.indexOf("no road by design"))
      : s.slice(s.lastIndexOf("Measured over"));
    p.meta.misc.mineralOffNetworkWhy =
      `ON THIS ROOM: the mineral seat at ${seat[1]},${seat[2]} has these eight neighbours — all empty — so 0 of them put it on the network, and this room ships no road at all. ` +
      (s.includes("no road by design")
        ? "no road by design — mineral hauling is one trickle deposit on a long cooldown, and permanent road decay to reach it costs more than the walk it saves."
        : suffix);
  }),
);
attacks.push(
  tryCase("E2S5 mineralWhy keep seat+suffix rewrite nearest", e2s5, (p) => {
    const s = p.meta.misc.mineralOffNetworkWhy;
    p.meta.misc.mineralOffNetworkWhy = s.replace(/\d+ step\(s\) away/, "99 step(s) away");
  }),
);
attacks.push(
  tryCase("E5S3 mineralWhy whole-value swap to E5S1's (different seat)", e5s3, (p) => {
    p.meta.misc.mineralOffNetworkWhy = plans.find((x) => x.room === "E5S1").meta.misc.mineralOffNetworkWhy;
  }),
);
attacks.push(
  tryCase("nukerHubDist := 1", any, (p) => {
    if (p.meta?.misc) p.meta.misc.nukerHubDist = 1;
  }),
);
attacks.push(
  tryCase("protectRadius := 0", any, (p) => {
    p.meta.shell.protectRadius = 0;
  }),
);

// fleet mineral-why vs board
const D8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
function cheb(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
function KT(t) {
  return `${t.x},${t.y}`;
}
const mineralLies = [];
for (const p of plans) {
  const why = p.meta?.misc?.mineralOffNetworkWhy;
  if (!why) continue;
  const seat = (p.structures?.container || []).find((c) => p.mineral && cheb(c, p.mineral) <= 1);
  if (!seat) continue;
  const roadOnSeat = (p.structures?.road || []).some((r) => r.x === seat.x && r.y === seat.y);
  const nearestHit = /nearest road tile this room ships is (\d+),(\d+), (\d+) step/.exec(why);
  const seatRoadPhrase = why.includes("the seat tile itself carries a road");
  const noRoadPhrase = why.includes("this room ships no road at all");
  if (roadOnSeat && !seatRoadPhrase) {
    mineralLies.push({
      room: p.room,
      kind: "seat-road-not-named",
      seat: KT(seat),
      nearest: nearestHit && `${nearestHit[1]},${nearestHit[2]}@${nearestHit[3]}`,
    });
  }
  // ring vs structures
  const holds = new Map();
  for (const t of Object.keys(p.structures || {})) {
    for (const q of p.structures[t] || []) {
      const k = KT(q);
      holds.set(k, holds.has(k) ? holds.get(k) + "+" + t : t);
    }
  }
  const ringHit = /has these eight neighbours — (.+?) — so (\d+) of them/.exec(why);
  if (ringHit) {
    const parts = ringHit[1].split(" · ");
    for (const s of parts) {
      const m = /^(\d+,\d+)\s+\((.+)\)/.exec(s.trim());
      if (!m) continue;
      const board = holds.get(m[1]) || "nothing of ours";
      // published drops 'rampart' sometimes? compare loosely
      if (board !== m[2] && m[2] !== board.replace(/^rampart\+/, "") && board !== "nothing of ours" && m[2] === "nothing of ours") {
        mineralLies.push({ room: p.room, kind: "ring-missed-structure", tile: m[1], pub: m[2], board });
      } else if (m[2] !== board && !(m[2] === "nothing of ours" && !board)) {
        if (m[2] !== board) mineralLies.push({ room: p.room, kind: "ring-mismatch", tile: m[1], pub: m[2], board });
      }
    }
  }
}

// E3S4 38,40
const p3 = plans.find((p) => p.room === "E3S4");
const at3840 = {};
if (p3) {
  for (const t of Object.keys(p3.structures || {})) {
    for (const q of p3.structures[t] || []) if (q.x === 38 && q.y === 40) at3840[t] = true;
  }
}
const cutHas = (p3.meta?.shell?.cut || []).some((t) => t.x === 38 && t.y === 40);
const freezeHas = (p3.meta?.shell?.cutAtFreeze || []).some((t) => t.x === 38 && t.y === 40);

// E11S1 shallow note
const p11 = plans.find((p) => p.room === "E11S1");
const n11 = (p11?.meta?.noteRecords || []).filter((n) => n.cls === "shallowExt");

const out = {
  attacks,
  mineralLies,
  mineralLieKinds: mineralLies.reduce((a, x) => ((a[x.kind] = (a[x.kind] || 0) + 1), a), {}),
  e3s4_38_40: { at3840, cutHas, freezeHas },
  e11s1_shallowNotes: n11.map((n) => ({
    cls: n.cls,
    recKeys: n.rec && Object.keys(n.rec),
    detail: String(n.detail || "").slice(0, 500),
    shallow: n.rec?.shallow,
    relocated: n.rec?.relocatedCount,
    reflow: n.rec?.reflow,
  })),
};
fs.writeFileSync(path.join(DIR, "attack-out.json"), JSON.stringify(out, null, 2));
console.log("lies", out.mineralLieKinds, "n", mineralLies.length);
console.log("E3S4 38,40", at3840, "cut", cutHas, "freeze", freezeHas);
console.log("E11S1 shallow notes", n11.length, n11[0] && String(n11[0].detail || "").slice(0, 240));
