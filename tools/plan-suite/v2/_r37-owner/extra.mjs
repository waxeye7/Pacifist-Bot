/**
 * Extra r37 hunts: remaining-presence skip hubDistCap; seat+approach twin; sample minerals.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { META_DARK } from "../r27-gates.mjs";
import { checkRoomLazy, loadPlans, loadRooms, realFails, makeChecker } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const PRESENCE = Object.entries(META_DARK).filter(([, v]) => v.klass === "presence").map(([k]) => k);

function walkFlip(obj, flipped, skip = new Set()) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) walkFlip(el, flipped, skip);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (PRESENCE.includes(k) && !skip.has(k)) {
      if (typeof v === "number" && v !== 0) {
        obj[k] = 0;
        flipped[k] = (flipped[k] || 0) + 1;
      } else if (typeof v === "boolean" && v === true) {
        obj[k] = false;
        flipped[k] = (flipped[k] || 0) + 1;
      } else if (Array.isArray(v) && v.length) {
        obj[k] = [];
        flipped[k] = (flipped[k] || 0) + 1;
      }
    } else if (v && typeof v === "object") {
      walkFlip(v, flipped, skip);
    }
  }
}

async function summarize(label, list) {
  const checkRoom = await checkRoomLazy();
  let pass = 0;
  let fail = 0;
  const firstFails = [];
  for (const p of list) {
    const d = byRoom.get(p.room);
    const res = checkRoom(p, d.terrain, d.objects, null);
    const fails = realFails(res);
    if (fails.length) {
      fail++;
      if (firstFails.length < 6) firstFails.push({ room: p.room, fails: fails.slice(0, 2) });
    } else pass++;
  }
  return { label, pass, fail, firstFails };
}

const skipA = new Set(["baseCut", "shallowNow", "hubDistCap"]);
const mutA = JSON.parse(JSON.stringify(plans));
const flipA = {};
for (const p of mutA) if (p.meta) walkFlip(p.meta, flipA, skipA);
const fleetA = await summarize("skip-baseCut-shallowNow-hubDistCap", mutA);

const skipB = new Set(["baseCut", "shallowNow", "hubDistCap", "stubCap"]);
const mutB = JSON.parse(JSON.stringify(plans));
const flipB = {};
for (const p of mutB) if (p.meta) walkFlip(p.meta, flipB, skipB);
const fleetB = await summarize("skip-also-stubCap", mutB);

const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);
const extra = [];
const src = byPlan.get("E11S1");
const seat = src.meta.mineralSeatAtReservation;
const mineral = src.mineral;
const altSeat = { x: mineral.x, y: mineral.y + 1 };
const altAp = { x: altSeat.x + 1, y: altSeat.y };
extra.push(await run("p15 seat+approach moved together to other cheb-1/D8", "E11S1", (p) => {
  p.meta.mineralSeatAtReservation = altSeat;
  p.meta.mineralApproachAtReservation = altAp;
}));

const names = ["E2S5", "E2S3", "E16S8", "E2S8", "E6S5", "E11S1", "E2S7", "E1S4"];
const minerals = names.map((room) => {
  const p = byPlan.get(room);
  return {
    room,
    mineral: p.mineral,
    seat: p.meta?.mineralSeat,
    seatRes: p.meta?.mineralSeatAtReservation,
    appr: p.meta?.mineralApproach,
    apprRes: p.meta?.mineralApproachAtReservation,
    off: p.meta?.misc?.mineralOffNetwork,
    seedScore: p.meta?.seedScore,
    baseCut: p.meta?.shell?.baseCut,
    cut: (p.meta?.shell?.cut || []).length,
    freeze: (p.meta?.shell?.cutAtFreeze || []).length,
    protect: p.meta?.shell?.protectRadius,
    redundant: p.meta?.shell?.redundantCut,
    dropped: !!p.meta?.extensions?.laneMeta?.dropped,
    shrunk: p.meta?.extensions?.laneMeta?.shrunk || null,
  };
});

const out = {
  fleetA,
  flipAKinds: Object.keys(flipA).length,
  flipAEvents: Object.values(flipA).reduce((a, b) => a + b, 0),
  flipA,
  fleetB,
  extra,
  minerals,
};
fs.writeFileSync(path.join(DIR, "extra.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  fleetA: { pass: fleetA.pass, fail: fleetA.fail, first: fleetA.firstFails },
  flipA,
  fleetB: { pass: fleetB.pass, fail: fleetB.fail, first: fleetB.firstFails.slice(0, 3) },
  extra: extra.map((e) => ({ name: e.name, status: e.status, first: e.first })),
  minerals,
}, null, 2));
