/**
 * Fleet-wide remaining META_DARK presence flips.
 * checkRoom only. Does not write the artifact. Round 43.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { META_DARK } from "../r27-gates.mjs";
import { checkRoomLazy, loadPlans, loadRooms, realFails } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();

const PRESENCE = Object.entries(META_DARK).filter(([, v]) => v.klass === "presence").map(([k]) => k);
const DERIVED = Object.entries(META_DARK).filter(([, v]) => v.klass === "derived").map(([k]) => k);

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
  let declared = 0;
  const firstFails = [];
  for (const p of list) {
    if (!p || !p.room || p.error) continue;
    const d = byRoom.get(p.room);
    if (!d) {
      fail++;
      firstFails.push({ room: p.room, fails: ["no terrain"] });
      continue;
    }
    const res = checkRoom(p, d.terrain, d.objects, null);
    const fails = realFails(res);
    declared += res.declared || 0;
    if (fails.length) {
      fail++;
      if (firstFails.length < 16) firstFails.push({ room: p.room, fails: fails.slice(0, 2) });
    } else pass++;
  }
  return { label, pass, fail, declared, firstFails };
}

const t0 = Date.now();
const checkRoom = await checkRoomLazy();
void checkRoom;

const baseline = await summarize("baseline", plans);

const mutated = JSON.parse(JSON.stringify(plans));
const flipped = {};
for (const p of mutated) if (p && p.meta) walkFlip(p.meta, flipped);
const fleet = await summarize("presence-zero", mutated);

const mutated2 = JSON.parse(JSON.stringify(plans));
const flipped2 = {};
for (const p of mutated2) if (p && p.meta) walkFlip(p.meta, flipped2, new Set(["baseCut", "shallowNow"]));
const fleetSkip = await summarize("presence-zero-except-baseCut-shallowNow", mutated2);

const P12 = ["stitched", "stitchTiles", "roadsEaten", "towerOnly", "stubRoads"];
function walkZeroNames(obj, names, flipped) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) walkZeroNames(el, names, flipped);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (names.includes(k)) {
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
      walkZeroNames(v, names, flipped);
    }
  }
}
const mutatedP12 = JSON.parse(JSON.stringify(plans));
const flippedP12 = {};
for (const p of mutatedP12) if (p && p.meta) walkZeroNames(p.meta, P12, flippedP12);
const fleetP12 = await summarize("p12-five-zeroed", mutatedP12);

const P13 = ["mineralContainer", "minDmgPicked", "servedFree"];
const mutatedP13 = JSON.parse(JSON.stringify(plans));
const flippedP13 = {};
for (const p of mutatedP13) if (p && p.meta) walkZeroNames(p.meta, P13, flippedP13);
const fleetP13 = await summarize("p13-three-zeroed", mutatedP13);

function walkSetStitched2(obj, flipped) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) walkSetStitched2(el, flipped);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "stitched" && typeof v === "number" && v !== 2) {
      obj[k] = 2;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (v && typeof v === "object") {
      walkSetStitched2(v, flipped);
    }
  }
}
const mutatedSt2 = JSON.parse(JSON.stringify(plans));
const flippedSt2 = {};
for (const p of mutatedSt2) if (p && p.meta) walkSetStitched2(p.meta, flippedSt2);
const fleetSt2 = await summarize("p13-stitched-set-2", mutatedSt2);

const P14 = [
  "arrayPartner",
  "picked",
  "minDmgArray",
  "battlementGap",
  "battlementGapTiles",
  "boundHeld",
  "boundLap",
  "fillerTiles",
  "shallowCost",
  "shallowRefused",
];
function walkP14(obj, flipped) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) walkP14(el, flipped);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "arrayPartner" && v && typeof v === "object" && Number.isInteger(v.x)) {
      obj[k] = { x: 1, y: 1 };
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "picked" && v && typeof v === "object" && Number.isInteger(v.x) && obj.minDmgPicked != null) {
      obj[k] = { x: 1, y: 1 };
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "minDmgArray" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "battlementGap" && typeof v === "number" && v === 0) {
      obj[k] = 1;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "battlementGapTiles" && Array.isArray(v)) {
      obj[k] = [{ x: 1, y: 1 }];
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "boundHeld" && v === true) {
      obj[k] = false;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "boundLap" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "fillerTiles" && typeof v === "number" && v !== 1) {
      obj[k] = 1;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "shallowCost" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "shallowRefused" && Array.isArray(v) && v.length) {
      obj[k] = [];
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (v && typeof v === "object") {
      walkP14(v, flipped);
    }
  }
}
const mutatedP14 = JSON.parse(JSON.stringify(plans));
const flippedP14 = {};
for (const p of mutatedP14) if (p && p.meta) walkP14(p.meta, flippedP14);
const fleetP14 = await summarize("p14-named-forged", mutatedP14);

const P15 = [
  "floorGated",
  "floorOver",
  "floorOverGated",
  "freeDin",
  "massAdds",
  "maxDist",
  "deepReach",
  "stubCap",
  "mineralSeatAtReservation",
  "mineralApproachAtReservation",
];
function walkP15(obj, flipped) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) walkP15(el, flipped);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "floorGated" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "floorOver" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "floorOverGated" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "freeDin" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "massAdds" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "maxDist" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "deepReach" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "stubCap" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "mineralSeatAtReservation" && v && typeof v === "object" && Number.isInteger(v.x)) {
      obj[k] = { x: 1, y: 1 };
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (k === "mineralApproachAtReservation" && v && typeof v === "object" && Number.isInteger(v.x)) {
      obj[k] = { x: 1, y: 1 };
      flipped[k] = (flipped[k] || 0) + 1;
    } else if (v && typeof v === "object") {
      walkP15(v, flipped);
    }
  }
}
const mutatedP15 = JSON.parse(JSON.stringify(plans));
const flippedP15 = {};
for (const p of mutatedP15) if (p && p.meta) walkP15(p.meta, flippedP15);
const fleetP15 = await summarize("p15-named-forged", mutatedP15);

const mutatedSeed = JSON.parse(JSON.stringify(plans));
let seedZeroed = 0;
for (const p of mutatedSeed) {
  if (p && typeof p.meta?.seedScore === "number" && p.meta.seedScore !== 0) {
    p.meta.seedScore = 0;
    seedZeroed++;
  }
}
const fleetSeed = await summarize("seedScore-zeroed", mutatedSeed);

const mutatedCap = JSON.parse(JSON.stringify(plans));
let capOff = 0;
for (const p of mutatedCap) {
  if (typeof p.meta?.extensions?.hubDistCap === "number") {
    p.meta.extensions.hubDistCap = 17;
    capOff++;
  }
}
const fleetCapOff = await summarize("p16-hubDistCap-17", mutatedCap);

const mutatedCapEnum = JSON.parse(JSON.stringify(plans));
let capEnum = 0;
for (const p of mutatedCapEnum) {
  if (p.meta?.extensions?.hubDistCap === 16) {
    p.meta.extensions.hubDistCap = 19;
    capEnum++;
  }
}
const fleetCapEnum = await summarize("p16-hubDistCap-16-to-19", mutatedCapEnum);

const mutatedLap = JSON.parse(JSON.stringify(plans));
let lapZeroed = 0;
function walkLapZero(obj) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) walkLapZero(el);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "lapCeilingFloor" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      lapZeroed++;
    } else if (v && typeof v === "object") walkLapZero(v);
  }
}
for (const p of mutatedLap) if (p && p.meta) walkLapZero(p.meta);
const fleetLap = await summarize("p16-lapCeilingFloor-zeroed", mutatedLap);

const mutatedCorr = JSON.parse(JSON.stringify(plans));
let corrZeroed = 0;
for (const p of mutatedCorr) {
  if ((p.meta?.extensions?.corridorPlaced || 0) === 60 && (p.meta?.extensions?.corridorFallback || 0) === 0) {
    p.meta.extensions.corridorPlaced = 0;
    corrZeroed++;
  }
}
const fleetCorr = await summarize("p16-corridorPlaced-zeroed", mutatedCorr);

const mutated3 = JSON.parse(JSON.stringify(plans));
const flipped3 = {};
for (const p of mutated3) if (p && p.meta) walkFlip(p.meta, flipped3, new Set(["baseCut", "shallowNow", "hubDistCap"]));
const fleetSkipHub = await summarize("presence-zero-except-baseCut-shallowNow-hubDistCap", mutated3);

const mutatedStub43 = JSON.parse(JSON.stringify(plans));
let stub43n = 0;
for (const p of mutatedStub43) {
  if (p.meta?.extensions?.stubCap === 43) {
    p.meta.extensions.stubCap = 51;
    stub43n++;
  }
}
const fleetStub43 = await summarize("p17-stubCap-43-to-51", mutatedStub43);

const mutatedStub51 = JSON.parse(JSON.stringify(plans));
let stub51n = 0;
for (const p of mutatedStub51) {
  if (p.meta?.extensions?.stubCap === 51) {
    p.meta.extensions.stubCap = 43;
    stub51n++;
  }
}
const fleetStub51 = await summarize("p17-stubCap-51-to-43", mutatedStub51);

const mutatedFu = JSON.parse(JSON.stringify(plans));
let fuZeroed = 0;
function walkFuZero(obj) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) walkFuZero(el);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "floorUngated" && typeof v === "number" && v !== 0) {
      obj[k] = 0;
      fuZeroed++;
    } else if (v && typeof v === "object") walkFuZero(v);
  }
}
for (const p of mutatedFu) if (p && p.meta) walkFuZero(p.meta);
const fleetFu = await summarize("p17-floorUngated-zeroed", mutatedFu);

const mutatedRad = JSON.parse(JSON.stringify(plans));
let radN = 0;
for (const p of mutatedRad) {
  if (Array.isArray(p.meta?.composeOpts?.radii) && p.meta.composeOpts.radii.length) {
    p.meta.composeOpts.radii = [1, 2, 3];
    radN++;
  } else if (p.meta?.composeOpts && !p.meta.composeOpts.radii && typeof p.meta.composeOpts.needDeepBonus === "number") {
    p.meta.composeOpts.radii = [1, 2, 3];
    radN++;
  }
}
const fleetRad = await summarize("p17-radii-rewritten", mutatedRad);

const mutatedPark = JSON.parse(JSON.stringify(plans));
let parkN = 0;
for (const p of mutatedPark) {
  if (typeof p.meta?.composeOpts?.parkCap === "number" && p.meta.composeOpts.parkCap !== 0) {
    p.meta.composeOpts.parkCap = 0;
    parkN++;
  }
}
const fleetPark = await summarize("p17-parkCap-zeroed", mutatedPark);

const mutatedSwap = JSON.parse(JSON.stringify(plans));
let swapN = 0;
for (const p of mutatedSwap) {
  if (p.meta?.composeOpts?.takeTowerSwap?.to && Number.isInteger(p.meta.composeOpts.takeTowerSwap.to.x)) {
    p.meta.composeOpts.takeTowerSwap.to = { x: 1, y: 1 };
    swapN++;
  }
}
const fleetSwap = await summarize("p17-takeTowerSwap-to-moved", mutatedSwap);

const mutatedMaxHub = JSON.parse(JSON.stringify(plans));
let maxHubN = 0;
for (const p of mutatedMaxHub) {
  if (typeof p.meta?.extensions?.maxHubDist === "number" && p.meta.extensions.maxHubDist !== 0) {
    p.meta.extensions.maxHubDist = 0;
    maxHubN++;
  }
}
const fleetMaxHub = await summarize("p18-maxHubDist-zeroed", mutatedMaxHub);

const mutatedFrom = JSON.parse(JSON.stringify(plans));
let fromN = 0;
for (const p of mutatedFrom) {
  if (p.meta?.composeOpts?.takeTowerSwap?.from && Number.isInteger(p.meta.composeOpts.takeTowerSwap.from.x)) {
    p.meta.composeOpts.takeTowerSwap.from = { x: 1, y: 1 };
    fromN++;
  }
}
const fleetFrom = await summarize("p18-takeTowerSwap-from-moved", mutatedFrom);

const mutatedFromD8 = JSON.parse(JSON.stringify(plans));
let fromD8n = 0;
for (const p of mutatedFromD8) {
  const sw = p.meta?.composeOpts?.takeTowerSwap;
  if (!sw?.from || !sw?.to || !Number.isInteger(sw.from.x)) continue;
  const towers = new Set((p.structures?.tower || []).map((t) => `${t.x},${t.y}`));
  const alt = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    .map(([dx, dy]) => ({ x: sw.to.x + dx, y: sw.to.y + dy }))
    .find((t) => (t.x !== sw.from.x || t.y !== sw.from.y) && !towers.has(`${t.x},${t.y}`));
  if (alt) {
    sw.from = alt;
    fromD8n++;
  }
}
const fleetFromD8 = await summarize("p19-takeTowerSwap-from-other-D8", mutatedFromD8);

const mutatedUc = JSON.parse(JSON.stringify(plans));
let ucN = 0;
for (const p of mutatedUc) {
  if (typeof p.meta?.walls?.unreachedClusters === "number") {
    p.meta.walls.unreachedClusters += 1;
    ucN++;
  }
}
const fleetUc = await summarize("p19-unreachedClusters-plus-1", mutatedUc);

const mutatedUe = JSON.parse(JSON.stringify(plans));
let ueN = 0;
for (const p of mutatedUe) {
  if (typeof p.meta?.walls?.unreachableExts === "number") {
    p.meta.walls.unreachableExts += 1;
    ueN++;
  }
}
const fleetUe = await summarize("p19-unreachableExts-plus-1", mutatedUe);

const mutatedSe = JSON.parse(JSON.stringify(plans));
let seN = 0;
for (const p of mutatedSe) {
  if (typeof p.meta?.walls?.servedExts === "number") {
    p.meta.walls.servedExts += 1;
    seN++;
  }
}
const fleetSe = await summarize("p19-servedExts-plus-1", mutatedSe);

const mutatedSeFill = JSON.parse(JSON.stringify(plans));
let seFillN = 0;
for (const p of mutatedSeFill) {
  if (typeof p.meta?.walls?.servedExts === "number") {
    p.meta.walls.servedExts += 1;
    if (typeof p.meta.walls.fillerTiles === "number") p.meta.walls.fillerTiles += 1;
    else p.meta.walls.fillerTiles = 1;
    seFillN++;
  }
}
const fleetSeFill = await summarize("p19-servedExts-and-filler-plus-1", mutatedSeFill);

const mutatedBog = JSON.parse(JSON.stringify(plans));
let bogN = 0;
for (const p of mutatedBog) {
  if (typeof p.meta?.misc?.mobilityVeto?.baseOverGated === "number" && p.meta.misc.mobilityVeto.baseOverGated !== 0) {
    p.meta.misc.mobilityVeto.baseOverGated = 0;
    bogN++;
  }
}
const fleetBog = await summarize("p20-baseOverGated-zeroed", mutatedBog);

const mutatedWas = JSON.parse(JSON.stringify(plans));
let wasN = 0;
for (const p of mutatedWas) {
  let hit = false;
  for (const r of p.meta?.misc?.mobilityVeto?.refused || []) {
    if (r && typeof r.wasLap === "number" && r.wasLap !== 0) {
      r.wasLap = 0;
      hit = true;
    }
  }
  if (hit) wasN++;
}
const fleetWas = await summarize("p20-wasLap-zeroed", mutatedWas);

const mutatedLapP21 = JSON.parse(JSON.stringify(plans));
let lapN = 0;
for (const p of mutatedLapP21) {
  if (typeof p.meta?.misc?.mobilityVeto?.baseLap === "number" && p.meta.misc.mobilityVeto.baseLap !== 0) {
    p.meta.misc.mobilityVeto.baseLap = 0;
    lapN++;
  }
}
const fleetLapP21 = await summarize("p21-baseLap-zeroed", mutatedLapP21);

const mutatedLapPlus = JSON.parse(JSON.stringify(plans));
let lapPlusN = 0;
for (const p of mutatedLapPlus) {
  if (typeof p.meta?.misc?.mobilityVeto?.baseLap === "number") {
    p.meta.misc.mobilityVeto.baseLap += 1;
    lapPlusN++;
  }
}
const fleetLapPlus = await summarize("p21-baseLap-plus-1", mutatedLapPlus);

const mutatedLabsLap = JSON.parse(JSON.stringify(plans));
let labsLapN = 0;
for (const p of mutatedLabsLap) {
  if (typeof p.meta?.labs?.lapVeto?.baseLap === "number" && p.meta.labs.lapVeto.baseLap !== 0) {
    p.meta.labs.lapVeto.baseLap = 0;
    labsLapN++;
  }
}
const fleetLabsLap = await summarize("p21-labs-baseLap-zeroed", mutatedLabsLap);

const mutatedNkLap = JSON.parse(JSON.stringify(plans));
let nkLapN = 0;
for (const p of mutatedNkLap) {
  if (typeof p.meta?.misc?.mobilityVeto?.nuker?.baseLap === "number" && p.meta.misc.mobilityVeto.nuker.baseLap !== 0) {
    p.meta.misc.mobilityVeto.nuker.baseLap = 0;
    nkLapN++;
  }
}
const fleetNkLap = await summarize("p21-nuker-baseLap-zeroed", mutatedNkLap);

const mutatedTwLap = JSON.parse(JSON.stringify(plans));
let twLapN = 0;
for (const p of mutatedTwLap) {
  if (typeof p.meta?.towers?.mobilityVeto?.baseLap === "number" && p.meta.towers.mobilityVeto.baseLap !== 0) {
    p.meta.towers.mobilityVeto.baseLap = 0;
    twLapN++;
  }
}
const fleetTwLap = await summarize("p21-towers-baseLap-zeroed", mutatedTwLap);

const mutatedSkipDerived = JSON.parse(JSON.stringify(plans));
const flippedSkipDerived = {};
const skipDerived = new Set(["baseCut", "shallowNow", ...DERIVED]);
for (const p of mutatedSkipDerived) if (p && p.meta) walkFlip(p.meta, flippedSkipDerived, skipDerived);
const fleetSkipDerived = await summarize("presence-zero-except-baseCut-shallowNow-and-all-derived", mutatedSkipDerived);

const out = {
  presenceNames: PRESENCE,
  derivedNames: DERIVED,
  flipped,
  flippedKinds: Object.keys(flipped).length,
  flippedEvents: Object.values(flipped).reduce((a, b) => a + b, 0),
  flipped2,
  flipped2Kinds: Object.keys(flipped2).length,
  flipped2Events: Object.values(flipped2).reduce((a, b) => a + b, 0),
  baseline,
  fleet,
  fleetSkip,
  flippedP12,
  fleetP12,
  flippedP13,
  fleetP13,
  flippedSt2,
  fleetSt2,
  flippedP14,
  fleetP14,
  p14Names: P14,
  flippedP15,
  fleetP15,
  p15Names: P15,
  seedZeroed,
  fleetSeed,
  capOff,
  fleetCapOff,
  capEnum,
  fleetCapEnum,
  lapZeroed,
  fleetLap,
  corrZeroed,
  fleetCorr,
  flipped3,
  flipped3Kinds: Object.keys(flipped3).length,
  flipped3Events: Object.values(flipped3).reduce((a, b) => a + b, 0),
  fleetSkipHub,
  stub43n,
  fleetStub43,
  stub51n,
  fleetStub51,
  fuZeroed,
  fleetFu,
  radN,
  fleetRad,
  parkN,
  fleetPark,
  swapN,
  fleetSwap,
  maxHubN,
  fleetMaxHub,
  fromN,
  fleetFrom,
  fromD8n,
  fleetFromD8,
  ucN,
  fleetUc,
  ueN,
  fleetUe,
  seN,
  fleetSe,
  seFillN,
  fleetSeFill,
  bogN,
  fleetBog,
  wasN,
  fleetWas,
  lapN,
  fleetLapP21,
  lapPlusN,
  fleetLapPlus,
  labsLapN,
  fleetLabsLap,
  nkLapN,
  fleetNkLap,
  twLapN,
  fleetTwLap,
  flippedSkipDerived,
  flippedSkipDerivedKinds: Object.keys(flippedSkipDerived).length,
  flippedSkipDerivedEvents: Object.values(flippedSkipDerived).reduce((a, b) => a + b, 0),
  fleetSkipDerived,
  ms: Date.now() - t0,
};
fs.writeFileSync(path.join(DIR, "presence.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  presenceN: PRESENCE.length,
  derivedN: DERIVED.length,
  derived: DERIVED,
  flippedKinds: out.flippedKinds,
  flippedEvents: out.flippedEvents,
  flipped,
  flipped2Kinds: out.flipped2Kinds,
  flipped2Events: out.flipped2Events,
  flipped2,
  baseline: { pass: baseline.pass, fail: baseline.fail, declared: baseline.declared, first: baseline.firstFails.slice(0, 4) },
  fleet: { pass: fleet.pass, fail: fleet.fail, first: fleet.firstFails.slice(0, 8) },
  fleetSkip: { pass: fleetSkip.pass, fail: fleetSkip.fail, first: fleetSkip.firstFails.slice(0, 8) },
  flippedP12,
  fleetP12: { pass: fleetP12.pass, fail: fleetP12.fail, first: fleetP12.firstFails.slice(0, 8) },
  flippedP13,
  fleetP13: { pass: fleetP13.pass, fail: fleetP13.fail, first: fleetP13.firstFails.slice(0, 8) },
  flippedSt2,
  fleetSt2: { pass: fleetSt2.pass, fail: fleetSt2.fail, first: fleetSt2.firstFails.slice(0, 8) },
  flippedP14,
  fleetP14: { pass: fleetP14.pass, fail: fleetP14.fail, first: fleetP14.firstFails.slice(0, 8) },
  flippedP15,
  fleetP15: { pass: fleetP15.pass, fail: fleetP15.fail, first: fleetP15.firstFails.slice(0, 8) },
  seedZeroed,
  fleetSeed: { pass: fleetSeed.pass, fail: fleetSeed.fail, first: fleetSeed.firstFails.slice(0, 8) },
  capOff,
  fleetCapOff: { pass: fleetCapOff.pass, fail: fleetCapOff.fail, first: fleetCapOff.firstFails.slice(0, 4) },
  capEnum,
  fleetCapEnum: { pass: fleetCapEnum.pass, fail: fleetCapEnum.fail, first: fleetCapEnum.firstFails.slice(0, 4) },
  lapZeroed,
  fleetLap: { pass: fleetLap.pass, fail: fleetLap.fail, first: fleetLap.firstFails.slice(0, 4) },
  corrZeroed,
  fleetCorr: { pass: fleetCorr.pass, fail: fleetCorr.fail, first: fleetCorr.firstFails.slice(0, 4) },
  flipped3Kinds: out.flipped3Kinds,
  flipped3Events: out.flipped3Events,
  fleetSkipHub: { pass: fleetSkipHub.pass, fail: fleetSkipHub.fail, first: fleetSkipHub.firstFails.slice(0, 4) },
  stub43n,
  fleetStub43: { pass: fleetStub43.pass, fail: fleetStub43.fail, first: fleetStub43.firstFails.slice(0, 4) },
  stub51n,
  fleetStub51: { pass: fleetStub51.pass, fail: fleetStub51.fail, first: fleetStub51.firstFails.slice(0, 4) },
  fuZeroed,
  fleetFu: { pass: fleetFu.pass, fail: fleetFu.fail, first: fleetFu.firstFails.slice(0, 4) },
  radN,
  fleetRad: { pass: fleetRad.pass, fail: fleetRad.fail, first: fleetRad.firstFails.slice(0, 4) },
  parkN,
  fleetPark: { pass: fleetPark.pass, fail: fleetPark.fail, first: fleetPark.firstFails.slice(0, 4) },
  swapN,
  fleetSwap: { pass: fleetSwap.pass, fail: fleetSwap.fail, first: fleetSwap.firstFails.slice(0, 4) },
  maxHubN,
  fleetMaxHub: { pass: fleetMaxHub.pass, fail: fleetMaxHub.fail, first: fleetMaxHub.firstFails.slice(0, 4) },
  fromN,
  fleetFrom: { pass: fleetFrom.pass, fail: fleetFrom.fail, first: fleetFrom.firstFails.slice(0, 4) },
  fromD8n,
  fleetFromD8: { pass: fleetFromD8.pass, fail: fleetFromD8.fail, first: fleetFromD8.firstFails.slice(0, 4) },
  ucN,
  fleetUc: { pass: fleetUc.pass, fail: fleetUc.fail, first: fleetUc.firstFails.slice(0, 4) },
  ueN,
  fleetUe: { pass: fleetUe.pass, fail: fleetUe.fail, first: fleetUe.firstFails.slice(0, 4) },
  seN,
  fleetSe: { pass: fleetSe.pass, fail: fleetSe.fail, first: fleetSe.firstFails.slice(0, 4) },
  seFillN,
  fleetSeFill: { pass: fleetSeFill.pass, fail: fleetSeFill.fail, first: fleetSeFill.firstFails.slice(0, 4) },
  bogN,
  fleetBog: { pass: fleetBog.pass, fail: fleetBog.fail, first: fleetBog.firstFails.slice(0, 4) },
  wasN,
  fleetWas: { pass: fleetWas.pass, fail: fleetWas.fail, first: fleetWas.firstFails.slice(0, 4) },
  lapN,
  fleetLapP21: { pass: fleetLapP21.pass, fail: fleetLapP21.fail, first: fleetLapP21.firstFails.slice(0, 4) },
  lapPlusN,
  fleetLapPlus: { pass: fleetLapPlus.pass, fail: fleetLapPlus.fail, first: fleetLapPlus.firstFails.slice(0, 4) },
  labsLapN,
  fleetLabsLap: { pass: fleetLabsLap.pass, fail: fleetLabsLap.fail, first: fleetLabsLap.firstFails.slice(0, 4) },
  nkLapN,
  fleetNkLap: { pass: fleetNkLap.pass, fail: fleetNkLap.fail, first: fleetNkLap.firstFails.slice(0, 4) },
  twLapN,
  fleetTwLap: { pass: fleetTwLap.pass, fail: fleetTwLap.fail, first: fleetTwLap.firstFails.slice(0, 4) },
  flippedSkipDerivedKinds: out.flippedSkipDerivedKinds,
  flippedSkipDerivedEvents: out.flippedSkipDerivedEvents,
  fleetSkipDerived: { pass: fleetSkipDerived.pass, fail: fleetSkipDerived.fail, first: fleetSkipDerived.firstFails.slice(0, 4) },
  ms: out.ms,
}, null, 2));
