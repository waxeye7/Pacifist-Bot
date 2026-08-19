import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const rooms = JSON.parse(fs.readFileSync(path.join(DIR, "rooms-brief.json"), "utf8"));
for (const [name, r] of Object.entries(rooms)) {
  console.log("\n======== " + name + " ========");
  console.log("counts", JSON.stringify(r.counts), "cut/freeze/ramp", r.cut, r.freeze, r.ramp);
  console.log("leaks", r.leaks, "coreLive", r.coreLive, "coreFreeze", r.coreFreeze);
  console.log("shallow", r.shallow, "pub", r.pubShallow, "red", r.redundant, "lb", r.loadBearing);
  console.log("ctrl enclosed", r.enclosedCtrl, r.ctrlExt);
  console.log("vis noD4", r.vis.noD4, "brick2", r.vis.bricks2, "brick3", r.vis.bricks3, "rr", r.vis.roadOnRamp, "clump", r.vis.clump);
  console.log("labs", r.vis.labs, "hub", r.vis.hub.ok, "spawns", r.vis.hub.spawnCheb, "pairs", r.vis.hub.spawnPairs, "sitter", r.vis.hub.sitter);
  console.log("mineral", r.mineral);
  console.log("film disagrees", r.film.disagrees, "unpainted", r.film.unpainted, "extra", r.film.extra);
  console.log("film census", JSON.stringify(r.film.census.map((c) => ({ f: c.facet, n: c.count }))));
  console.log("page counts", r.page.counts);
  console.log("mobSub", r.page.mobSub);
  console.log("topics", r.page.topics, "gates", r.page.gates);
  console.log("notes", r.notes);
  console.log("sf", r.sf);
  console.log("prune", r.prune);
  console.log("protect", r.protectRadius, "baseCut", r.baseCut, "adopted", r.cutAdopted, "mob", r.mobility);
  console.log("map", r.map.x0 + "," + r.map.y0 + "-" + r.map.x1 + "," + r.map.y1);
  for (const line of r.map.lines) console.log(line);
}
