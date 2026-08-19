import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.resolve(DIR, "../../out-v2/plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);
const e11 = plans.find((p) => p.room === "E11S1");
const pick = (p) => ({
  room: p.room,
  protectRadius: p.meta?.shell?.protectRadius,
  priceyWall: p.meta?.shell?.priceyWall,
  baseCut: p.meta?.shell?.baseCut,
  uselessCut: Array.isArray(p.meta?.shell?.uselessCut)
    ? p.meta.shell.uselessCut.length
    : p.meta?.shell?.uselessCut,
  cutAdopted: Array.isArray(p.meta?.shell?.cutAdopted) ? p.meta.shell.cutAdopted.length : p.meta?.shell?.cutAdopted,
  mobilityShipped: p.meta?.shell?.mobilityShipped?.maxGated,
  builtGated: p.meta?.walls?.mobility?.builtGated,
  refillDistsUnblocked: p.meta?.towers?.refillDistsUnblocked,
  newRoadsT: p.meta?.towers?.newRoads,
  spurred: p.meta?.walls?.spurred,
  swampPaved: p.meta?.walls?.swampPaved,
  newRoadsW: p.meta?.walls?.newRoads,
  nukerHubDist: p.meta?.misc?.nukerHubDist,
  observerHubDist: p.meta?.misc?.observerHubDist,
  mineralBubble: p.meta?.misc?.mineralBubble ?? p.meta?.shell?.mineralBubble,
});
console.log("E11S1", JSON.stringify(pick(e11), null, 2));

const stats = {
  protectRadiusNon0: 0,
  priceyWallNon0: 0,
  baseCutNon0: 0,
  uselessNonEmpty: 0,
  cutAdoptedNonEmpty: 0,
  mobShipNon0: 0,
  refillNotAll1: 0,
  spurredNon0: 0,
  swampNon0: 0,
  nukerNot1: 0,
  obsNot1: 0,
  mineralBubbleTrue: 0,
};
for (const p of plans) {
  const s = pick(p);
  if (s.protectRadius) stats.protectRadiusNon0++;
  if (s.priceyWall) stats.priceyWallNon0++;
  if (s.baseCut) stats.baseCutNon0++;
  if (s.uselessCut) stats.uselessNonEmpty++;
  if (s.cutAdopted) stats.cutAdoptedNonEmpty++;
  if (s.mobilityShipped) stats.mobShipNon0++;
  if (Array.isArray(s.refillDistsUnblocked) && s.refillDistsUnblocked.some((v) => v !== 1)) stats.refillNotAll1++;
  if (s.spurred) stats.spurredNon0++;
  if (s.swampPaved) stats.swampNon0++;
  if (s.nukerHubDist !== 1 && s.nukerHubDist != null) stats.nukerNot1++;
  if (s.observerHubDist !== 1 && s.observerHubDist != null) stats.obsNot1++;
  if (s.mineralBubble === true) stats.mineralBubbleTrue++;
}
console.log("fleet non-flattering counts", stats);
