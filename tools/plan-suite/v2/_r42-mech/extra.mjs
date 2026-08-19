/**
 * r42 extra: parkCap rooms, hubDistCap / maxHubDist hist, takeTowerSwap,
 * servedExts / unreachableExts / unreachedClusters fleet hist.
 * Never writes the artifact.
 */
import { loadPlans } from "./common.mjs";
const { plans } = loadPlans();
const park = [];
const hub = {};
const maxHub = {};
const swaps = [];
const radii = { late: 0, wide: 0, none: 0, other: 0 };
const stub = { 43: 0, 51: 0, other: 0 };
const served = {};
const unreach = {};
const unreachedCl = {};
const filler = {};
const bog = {};
const wasLap = {};
const baseLap = {};
let servedIffFill = 0;
let servedHave = 0;
let wasLapN = 0;
let wasLapRooms = 0;
for (const p of plans) {
  const c = p.meta?.composeOpts || {};
  if (typeof c.parkCap === "number") {
    park.push({
      room: p.room,
      parkCap: c.parkCap,
      floor: p.meta?.ctrlParkFloorCap,
      winning: p.meta?.ctrlParks?.winningCap ?? p.meta?.ctrlParkWinningCap,
      released: (p.meta?.shortfalls || []).some((s) => s && /ctrlparks|released/i.test(String(s.gate) + String(s.kind))),
    });
  }
  const h = p.meta?.extensions?.hubDistCap;
  hub[h] = (hub[h] || 0) + 1;
  const mh = p.meta?.extensions?.maxHubDist;
  maxHub[mh] = (maxHub[mh] || 0) + 1;
  if (c.takeTowerSwap) swaps.push({ room: p.room, sw: c.takeTowerSwap });
  const r = c.radii;
  if (!r) radii.none++;
  else if (r.join(",") === "10,11,12,13,14") radii.late++;
  else if (r.join(",") === "6,7,8,9,10,11,12,13,14") radii.wide++;
  else radii.other++;
  const s = p.meta?.extensions?.stubCap;
  if (s === 43) stub[43]++;
  else if (s === 51) stub[51]++;
  else stub.other++;
  const w = p.meta?.walls || {};
  if (typeof w.servedExts === "number") {
    served[w.servedExts] = (served[w.servedExts] || 0) + 1;
    servedHave++;
    const fill = typeof w.fillerTiles === "number" ? w.fillerTiles : w.laidByKind?.extFace || 0;
    if ((w.servedExts === 0) === (fill === 0)) servedIffFill++;
  }
  if (typeof w.unreachableExts === "number") unreach[w.unreachableExts] = (unreach[w.unreachableExts] || 0) + 1;
  if (typeof w.unreachedClusters === "number") unreachedCl[w.unreachedClusters] = (unreachedCl[w.unreachedClusters] || 0) + 1;
  if (typeof w.fillerTiles === "number") filler[w.fillerTiles] = (filler[w.fillerTiles] || 0) + 1;
  const v = p.meta?.misc?.mobilityVeto;
  if (v && typeof v.baseOverGated === "number") bog[v.baseOverGated] = (bog[v.baseOverGated] || 0) + 1;
  if (v && typeof v.baseLap === "number") baseLap[v.baseLap] = (baseLap[v.baseLap] || 0) + 1;
  const refused = v?.refused || [];
  let roomHas = false;
  for (const r of refused) {
    if (r && typeof r.wasLap === "number") {
      wasLap[r.wasLap] = (wasLap[r.wasLap] || 0) + 1;
      wasLapN++;
      roomHas = true;
    }
  }
  if (roomHas) wasLapRooms++;
}
console.log(JSON.stringify({
  park,
  hub,
  maxHub,
  swaps: swaps.length,
  swapRooms: swaps.map((s) => s.room),
  radii,
  stub,
  served,
  unreach,
  unreachedCl,
  filler,
  servedHave,
  servedIffFill,
  bog,
  baseLap,
  wasLap,
  wasLapN,
  wasLapRooms,
}, null, 2));
