import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MINERAL_OFF_NETWORK_BASIS, MINERAL_ON_NETWORK_BASIS } from "../layer-misc.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(
  fs.readFileSync(path.resolve(DIR, "../../out-v2/plans-hub.json"), "utf8"),
).filter((p) => p && p.room && !p.error);

const e11 = plans.find((p) => p.room === "E11S1");
const why = e11.meta.misc.mineralOffNetworkWhy;
console.log("E11S1 why includes OFF", why.includes(MINERAL_OFF_NETWORK_BASIS));
console.log("E11S1 why includes ON", why.includes(MINERAL_ON_NETWORK_BASIS));
console.log("E11S1 why ends OFF", why.endsWith(MINERAL_OFF_NETWORK_BASIS));
console.log("E11S1 why tail", JSON.stringify(why.slice(-80)));
console.log("OFF basis tail", JSON.stringify(MINERAL_OFF_NETWORK_BASIS.slice(-80)));

const refill = e11.meta.towers.refillBasis;
console.log("refill blocked match", /with (\d+) tile\(s\) blocked/.exec(refill));
console.log("refill head", refill.slice(0, 160));

const offer = e11.meta.towers.towerSwapOffer.basis;
console.log("offer face match", /face at (\d+) and its saturation at (\d+)/.exec(offer));
console.log("offer head", offer.slice(0, 220));
console.log("minShellDmg", e11.meta.towers.minShellDmg, "MIN_SAT would be 3600");

const e11s2 = plans.find((p) => p.room === "E11S2");
const sf = (e11s2.meta.shortfalls || []).find((s) => s.ladder?.rungs);
console.log("E11S2 shipped ramparts", (e11s2.structures.rampart || []).length);
console.log(
  "E11S2 rungs",
  (sf?.ladder?.rungs || []).map((r, i) => ({ i, ...r })),
);

// how many rooms would the mineral fallback cover?
let n = 0, off = 0, on = 0;
for (const p of plans) {
  const s = p.meta?.misc?.mineralOffNetworkWhy;
  if (typeof s !== "string") continue;
  const seat = (p.structures.container || []).find((c) => {
    const m = p.mineral;
    return m && Math.max(Math.abs(c.x - m.x), Math.abs(c.y - m.y)) <= 1;
  });
  if (!seat) continue;
  const suffixOk =
    s.includes(MINERAL_OFF_NETWORK_BASIS) || s.includes(MINERAL_ON_NETWORK_BASIS);
  const seatOk = s.includes(`the mineral seat at ${seat.x},${seat.y}`);
  if (suffixOk && seatOk) n++;
  if (s.includes(MINERAL_OFF_NETWORK_BASIS)) off++;
  if (s.includes(MINERAL_ON_NETWORK_BASIS)) on++;
}
console.log("fallback would cover", n, "of", plans.length, "offSuffix", off, "onSuffix", on);
