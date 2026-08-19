#!/usr/bin/env node
/** Live dest main shard3: drop 1-src E37N57, strip E37N59 bad plan, haul energy. Never E36N57. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8")).main;
const BASE = `${cfg.protocol || "https"}://${cfg.hostname}`;
const H = { "Content-Type": "application/json", "X-Token": cfg.token, "X-Username": cfg.token };

const expr = `
(function(){
  var out = [];
  if (typeof dropRoom === "function") out.push(dropRoom("E37N57"));
  else { Memory.dropRoom = "E37N57"; out.push("armed drop E37N57"); }
  var r = Game.rooms.E37N59;
  if (r) {
    delete r.memory.planV2;
    r.memory.planPackSkip = true;
    if (r.memory.construction) r.memory.construction.rampartLocations = [];
    out.push("stripped E37N59 planV2");
  }
  var sent = 0;
  for (var n in Game.creeps) {
    if (sent >= 2) break;
    var c = Game.creeps[n];
    if (!c || !c.memory) continue;
    if (c.memory.homeRoom !== "E37N58") continue;
    if (c.memory.role !== "carry" && c.memory.role !== "filler") continue;
    if ((c.store.energy || 0) < 50 && c.memory.role !== "carry") continue;
    c.memory.role = "carry";
    c.memory.homeRoom = "E37N59";
    c.memory.targetRoom = "E37N59";
    c.memory.emergencyFeed = "E37N59";
    if ((c.store.energy || 0) > 0) c.memory.full = true;
    sent++;
    out.push("retask " + n + " e" + (c.store.energy || 0));
  }
  out.push("sent " + sent);
  return out.join(" | ");
})()
`.trim();

const res = await fetch(`${BASE}/api/user/console`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ shard: "shard3", expression: expr }),
});
const j = await res.json();
console.log("status", res.status, JSON.stringify(j).slice(0, 800));
if (!res.ok || j.ok !== 1) process.exit(1);
