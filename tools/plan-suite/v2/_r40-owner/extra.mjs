/**
 * Extra r40 hunts: remaining-presence skip after p18; p18 named; hubDistCap in-enum.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { META_DARK } from "../r27-gates.mjs";
import { checkRoomLazy, hashedRooms, loadPlans, loadRooms, realFails, makeChecker } from "./common.mjs";

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

const skipA = new Set(["baseCut", "shallowNow"]);
const mutA = JSON.parse(JSON.stringify(plans));
const flipA = {};
for (const p of mutA) if (p.meta) walkFlip(p.meta, flipA, skipA);
const fleetA = await summarize("skip-baseCut-shallowNow", mutA);

const skipB = new Set(["baseCut", "shallowNow", "hubDistCap"]);
const mutB = JSON.parse(JSON.stringify(plans));
const flipB = {};
for (const p of mutB) if (p.meta) walkFlip(p.meta, flipB, skipB);
const fleetB = await summarize("skip-baseCut-shallowNow-hubDistCap", mutB);

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
extra.push(await run("p16 hubDistCap := 17 off-ladder", "E11S1", (p) => { p.meta.extensions.hubDistCap = 17; }));
extra.push(await run("p16 hubDistCap 16→19 in-enum", "E11S1", (p) => { p.meta.extensions.hubDistCap = 19; }));
extra.push(await run("p16 lapCeilingFloor := 0", "E11S1", (p) => {
  if (p.meta.walls?.reflow) p.meta.walls.reflow.lapCeilingFloor = 0;
  if (p.meta.extensions?.reflow) p.meta.extensions.reflow.lapCeilingFloor = 0;
}));
extra.push(await run("p16 corridorPlaced := 0 keep fallback 0", "E11S1", (p) => {
  p.meta.extensions.corridorPlaced = 0;
}));
extra.push(await run("p16 corridorPlaced 0 + fallback 1", "E11S1", (p) => {
  p.meta.extensions.corridorPlaced = 0;
  p.meta.extensions.corridorFallback = 1;
}));
{
  const stc43 = plans.find((p) => p.meta?.extensions?.stubCap === 43);
  const stc51 = plans.find((p) => p.meta?.extensions?.stubCap === 51);
  const fuR = plans.find((p) => typeof p.meta?.extensions?.laneMeta?.floorUngated === "number" && p.meta.extensions.laneMeta.floorUngated !== 0);
  const radR = plans.find((p) => Array.isArray(p.meta?.composeOpts?.radii) && p.meta.composeOpts.radii.length > 0);
  const radAbs = plans.find((p) => p.meta?.composeOpts && !p.meta.composeOpts.radii);
  const pkR = plans.find((p) => typeof p.meta?.composeOpts?.parkCap === "number" && p.meta.composeOpts.parkCap !== 0);
  const swR = plans.find((p) => p.meta?.composeOpts?.takeTowerSwap?.to && Number.isInteger(p.meta.composeOpts.takeTowerSwap.to.x));
  if (stc43) extra.push(await run("p17 stubCap 43→51", stc43.room, (p) => { p.meta.extensions.stubCap = 51; }));
  if (stc51) extra.push(await run("p17 stubCap 51→43", stc51.room, (p) => { p.meta.extensions.stubCap = 43; }));
  if (fuR) {
    extra.push(await run("p17 floorUngated := 0 both copies", fuR.room, (p) => {
      if (p.meta.extensions?.laneMeta) p.meta.extensions.laneMeta.floorUngated = 0;
      if (p.meta.walls?.mobility?.lanes) p.meta.walls.mobility.lanes.floorUngated = 0;
    }));
  }
  if (radR) extra.push(await run("p17 radii rewritten [1,2,3]", radR.room, (p) => { p.meta.composeOpts.radii = [1, 2, 3]; }));
  if (radAbs) extra.push(await run("p17 radii planted on absent", radAbs.room, (p) => { p.meta.composeOpts.radii = [6, 7, 8, 9, 10, 11, 12, 13, 14]; }));
  if (pkR) extra.push(await run("p17 parkCap := 0", pkR.room, (p) => { p.meta.composeOpts.parkCap = 0; }));
  if (swR) extra.push(await run("p17 takeTowerSwap.to → 1,1", swR.room, (p) => { p.meta.composeOpts.takeTowerSwap.to = { x: 1, y: 1 }; }));
}
{
  const mhR = plans.find((p) => typeof p.meta?.extensions?.maxHubDist === "number" && p.meta.extensions.maxHubDist !== 0);
  const swFrom = plans.find((p) => p.meta?.composeOpts?.takeTowerSwap?.from && Number.isInteger(p.meta.composeOpts.takeTowerSwap.from.x));
  if (mhR) extra.push(await run("p18 maxHubDist := 0", mhR.room, (p) => { p.meta.extensions.maxHubDist = 0; }));
  if (mhR) extra.push(await run("p18 maxHubDist += 1", mhR.room, (p) => { p.meta.extensions.maxHubDist += 1; }));
  if (swFrom) extra.push(await run("p18 takeTowerSwap.from → 1,1", swFrom.room, (p) => { p.meta.composeOpts.takeTowerSwap.from = { x: 1, y: 1 }; }));
  if (swFrom) {
    const to = swFrom.meta.composeOpts.takeTowerSwap.to;
    const from = swFrom.meta.composeOpts.takeTowerSwap.from;
    const towers = new Set((swFrom.structures?.tower || []).map((t) => `${t.x},${t.y}`));
    const alt = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      .map(([dx, dy]) => ({ x: to.x + dx, y: to.y + dy }))
      .find((t) => (t.x !== from.x || t.y !== from.y) && !towers.has(`${t.x},${t.y}`));
    if (alt) extra.push(await run(`p18 takeTowerSwap.from other D8 ${alt.x},${alt.y}`, swFrom.room, (p) => { p.meta.composeOpts.takeTowerSwap.from = { x: alt.x, y: alt.y }; }));
  }
}

const hashed = hashedRooms(plans).slice(0, 5).map((r) => r.room);
const names = [...new Set([...hashed, "E11S1", "E2S7", "E1S4"])];
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
