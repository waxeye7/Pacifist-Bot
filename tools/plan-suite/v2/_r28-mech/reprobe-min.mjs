import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom } from "../validate.mjs";
import { MINERAL_OFF_NETWORK_BASIS, MINERAL_ON_NETWORK_BASIS } from "../layer-misc.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.resolve(DIR, "../../out-v2/plans-hub.json"), "utf8")).filter((p) => p?.room && !p.error);
const rooms = JSON.parse(fs.readFileSync(path.join(DIR, "rooms.json"), "utf8"));
const FLEET_RE = /fleetMediansMeasured|eco\.ctrlMedian|eco\.srcMedian|eco\.ctrlGate|eco\.srcGate/;

function run(name, room, mutate) {
  const p = JSON.parse(JSON.stringify(plans.find((x) => x.room === room)));
  mutate(p);
  const d = rooms.find((r) => r.room === room);
  const res = checkRoom(p, d.terrain, d.objects, null);
  const fails = (res.fails || []).filter((f) => !FLEET_RE.test(f));
  console.log(fails.length ? "BITES" : "ESCAPE", name, fails[0] ? fails[0].slice(0, 180) : "pass");
}

for (const room of ["E2S5", "E5S1", "E5S3"]) {
  run(`keep-nearest-rewrite-ring-${room}`, room, (p) => {
    const s = p.meta.misc.mineralOffNetworkWhy;
    p.meta.misc.mineralOffNetworkWhy = s.replace(
      /has these eight neighbours —.*?— so \d+ of them put it on the network/,
      "has these eight neighbours — ALL EMPTY — so 0 of them put it on the network",
    );
  });
}

run("append-plus-invert-E11S1", "E11S1", (p) => {
  p.meta.misc.mineralOffNetworkWhy =
    p.meta.misc.mineralOffNetworkWhy.replace(MINERAL_OFF_NETWORK_BASIS, MINERAL_ON_NETWORK_BASIS) +
    " THIS SEAT IS ON THE NETWORK AND THE EXEMPTION IS A LIE.";
});
