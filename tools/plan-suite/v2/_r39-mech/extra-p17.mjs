/**
 * r39 extra: parkCap rooms, hubDistCap hist, takeTowerSwap count.
 * Never writes the artifact.
 */
import { loadPlans } from "./common.mjs";
const { plans } = loadPlans();
const park = [];
const hub = {};
const swaps = [];
const radii = { late: 0, wide: 0, none: 0, other: 0 };
const stub = { 43: 0, 51: 0, other: 0 };
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
}
console.log(JSON.stringify({ park, hub, swaps: swaps.length, swapRooms: swaps.map((s) => s.room), radii, stub }, null, 2));
