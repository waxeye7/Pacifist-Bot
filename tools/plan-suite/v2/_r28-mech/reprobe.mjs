import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom } from "../validate.mjs";
import { renderRefillBasis } from "../layer-walls.mjs";
import { renderSwapOfferBasis } from "../layer-towers.mjs";
import { MINERAL_OFF_NETWORK_BASIS, MINERAL_ON_NETWORK_BASIS } from "../layer-misc.mjs";
import { renderDecl } from "../declprose.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.resolve(DIR, "../../out-v2/plans-hub.json"), "utf8")).filter((p) => p?.room && !p.error);
const rooms = JSON.parse(fs.readFileSync(path.join(DIR, "rooms.json"), "utf8"));
const byP = new Map(plans.map((p) => [p.room, p]));
const byR = new Map(rooms.map((r) => [r.room, r]));
const FLEET_RE = /fleetMediansMeasured|eco\.ctrlMedian|eco\.srcMedian|eco\.ctrlGate|eco\.srcGate/;

function run(name, room, mutate) {
  const p = JSON.parse(JSON.stringify(byP.get(room)));
  mutate(p);
  const res = checkRoom(p, byR.get(room).terrain, byR.get(room).objects, null);
  const fails = (res.fails || []).filter((f) => !FLEET_RE.test(f));
  console.log(fails.length ? "BITES" : "ESCAPE", name, fails[0] ? fails[0].slice(0, 200) : "pass");
}

run("refill-blocked-999", "E11S1", (p) => {
  p.meta.towers.refillBasis = p.meta.towers.refillBasis.replace(/with (\d+) tile\(s\) blocked/, "with 999 tile(s) blocked");
});
run("swap-face-999", "E11S1", (p) => {
  p.meta.towers.towerSwapOffer.basis = p.meta.towers.towerSwapOffer.basis.replace(
    /face at (\d+) and its saturation at (\d+)/,
    "face at 999 and its saturation at 999",
  );
});
run("mineral-append-E11S1", "E11S1", (p) => {
  p.meta.misc.mineralOffNetworkWhy += " THE WALL IS FREE.";
});
run("mineral-invert-suffix", "E11S1", (p) => {
  p.meta.misc.mineralOffNetworkWhy = p.meta.misc.mineralOffNetworkWhy.replace(
    MINERAL_OFF_NETWORK_BASIS,
    MINERAL_ON_NETWORK_BASIS,
  );
});
run("mineral-E2S5-nearest-1-1", "E2S5", (p) => {
  p.meta.misc.mineralOffNetworkWhy = p.meta.misc.mineralOffNetworkWhy.replace(
    /nearest road tile this room ships is \d+,\d+/,
    "nearest road tile this room ships is 1,1",
  );
});
run("mineral-E2S5-ring-rewrite-keep-suffix-seat", "E2S5", (p) => {
  const s = p.meta.misc.mineralOffNetworkWhy;
  const seat = /mineral seat at (\d+),(\d+)/.exec(s);
  p.meta.misc.mineralOffNetworkWhy =
    `ON THIS ROOM: the mineral seat at ${seat[1]},${seat[2]} has these eight neighbours — all empty — so 0 of them put it on the network, and this room ships no road at all. ` +
    MINERAL_OFF_NETWORK_BASIS +
    ` Measured over the FINISHED road set, not layer 5's.`;
});
run("battlement-both-zero", "E13S3", (p) => {
  p.meta.shell.battlementUnreachable = 0;
  p.meta.shell.battlementUnreachableTiles = [];
});
run("88-fatter-regen", "E11S2", (p) => {
  const shipped = (p.structures.rampart || []).length;
  for (const sf of p.meta.shortfalls || []) {
    if (!sf.ladder?.rungs) continue;
    for (let i = 1; i < sf.ladder.rungs.length; i++) {
      const r = sf.ladder.rungs[i];
      if (r && r.ramparts > shipped && typeof r.mobility === "number") r.mobility = 0.5;
    }
    sf.detail = renderDecl(sf);
  }
});
run("93-holders", "E11S7", (p) => {
  const walk = (n) => {
    if (!n) return;
    if (Array.isArray(n.pockets)) {
      for (const pk of n.pockets) {
        if (Array.isArray(pk.holders)) pk.holders.push({ type: "extension", x: 1, y: 1, recovers: 99, recoversDeep: 99 });
      }
    }
    if (n.next) walk(n.next);
  };
  walk(p.meta.sealedRecovery);
});
run("98-invent-shrink", "E11S3", (p) => {
  const lanes = p.meta.walls?.mobility?.lanes || p.meta.extensions?.laneMeta;
  if (!lanes) return;
  const rounds = lanes.rounds ?? 10;
  lanes.shrunk = { from: 10, to: rounds, wanted: 12, premium: 0 };
  lanes.roundCap = rounds;
});
run("cutAdopted-invent", "E11S1", (p) => {
  const r = p.structures.rampart[0];
  p.meta.shell.cutAdopted = [{ x: r.x, y: r.y }];
});
run("nuker-1", "E11S1", (p) => {
  p.meta.misc.nukerHubDist = 1;
  p.meta.misc.observerHubDist = 1;
});
