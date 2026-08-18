#!/usr/bin/env node
/**
 * Empire health watch. Prints ONLY anomalies, one line each, so a quiet empire
 * produces a quiet log and anything that shows up is worth reading.
 *
 *   fnm exec --using 22 node tools/server/watch.mjs --dest main --shard shard3 \
 *       --every 180 --for 3600
 *
 * The checks are the failure modes this bot has actually been caught in, not a
 * generic dashboard — see docs/STARVATION-TRAPS.md. Several of them look
 * absurdly specific because they are: each one is a real outage that took a
 * live investigation to find, and a one-line check to have noticed.
 *
 * Read-only: one console expression per pass, no writes to game state.
 */
import fs from "fs";
import path from "path";
import { gunzipSync } from "zlib";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function arg(n, d) {
  const i = process.argv.indexOf("--" + n);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
}
const DEST = arg("dest", "main");
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8"))[DEST];
if (!cfg) {
  console.error("no dest " + DEST);
  process.exit(2);
}
const SHARD = arg("shard", cfg.hostname === "screeps.com" ? "shard3" : "");
const EVERY = Number(arg("every", 180)) * 1000;
const FOR = Number(arg("for", 3600)) * 1000;
const BASE = `${cfg.protocol || "https"}://${cfg.hostname}${cfg.port && cfg.port !== 80 && cfg.port !== 443 ? ":" + cfg.port : ""}`;
const H = { "Content-Type": "application/json", "X-Token": cfg.token, "X-Username": cfg.token };

/** Runs INSIDE the game. Returns a compact anomaly list plus a state digest. */
const PROBE = `
var bad = [];
var digest = [];
var owned = [];
for (var rn in Game.rooms) { var r = Game.rooms[rn]; if (r.controller && r.controller.my) owned.push(r); }
for (var i = 0; i < owned.length; i++) {
  var r = owned[i];
  var n = r.name, lvl = r.controller.level;
  var sp = r.find(FIND_MY_SPAWNS);
  var creeps = r.find(FIND_MY_CREEPS).length;
  var q = (r.memory.spawn_list || []).length / 3;
  var bank = (r.storage ? r.storage.store[RESOURCE_ENERGY] || 0 : 0) + (r.terminal ? r.terminal.store[RESOURCE_ENERGY] || 0 : 0);
  var site = r.find(FIND_MY_CONSTRUCTION_SITES, { filter: function (s) { return s.structureType === "spawn"; } })[0];
  digest.push(n + " L" + lvl + " sp" + sp.length + " e" + r.energyAvailable + "/" + r.energyCapacityAvailable
    + " c" + creeps + " q" + q + " b" + bank + (site ? " site" + site.progress : ""));

  // IDLE SPAWNER WITH NOTHING QUEUED while the room is near full — the
  // unsatisfiable-floor deadlock (rooms.spawning rescueMotherFloor).
  var idle = sp.length && !sp[0].spawning;
  if (idle && q === 0 && r.energyAvailable > r.energyCapacityAvailable * 0.9 && creeps < 6) {
    bad.push(n + ": spawn IDLE, queue EMPTY, energy " + r.energyAvailable + "/" + r.energyCapacityAvailable + ", only " + creeps + " creeps");
  }
  if (sp.length && creeps === 0) bad.push(n + ": has a spawn but ZERO creeps");
  if (!sp.length && !site) bad.push(n + ": NO SPAWN and no spawn site");
  if ((r.memory.spawnStall || 0) > 60) bad.push(n + ": spawn head stalled " + r.memory.spawnStall + " ticks on " + r.memory.spawnStallName);
  if (r.controller.ticksToDowngrade < 8000) bad.push(n + ": DOWNGRADE in " + r.controller.ticksToDowngrade);
  var hostiles = r.find(FIND_HOSTILE_CREEPS).filter(function (c) {
    return c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK) || c.getActiveBodyparts(WORK);
  });
  if (hostiles.length) bad.push(n + ": " + hostiles.length + " armed hostiles (" + hostiles[0].owner.username + ")");
  var tw = r.find(FIND_MY_STRUCTURES, { filter: function (s) { return s.structureType === "tower"; } });
  for (var t = 0; t < tw.length; t++) {
    if ((tw[t].store[RESOURCE_ENERGY] || 0) < 200) { bad.push(n + ": tower dry at " + tw[t].pos.x + "," + tw[t].pos.y); break; }
  }
  if (lvl >= 4 && r.storage && bank < 1000 && creeps > 3) bad.push(n + ": RCL" + lvl + " bank " + bank + " (storage empty)");
  var miners = r.find(FIND_MY_CREEPS, { filter: function (c) { return c.memory.role === "EnergyMiner"; } }).length;
  if (sp.length && miners === 0 && creeps > 0) bad.push(n + ": no EnergyMiner on " + r.find(FIND_SOURCES).length + " sources");
}
var cpu = Memory.CPU || {};
var avg = cpu.hundredTickAvg ? cpu.hundredTickAvg.avg : 0;
if (Game.cpu.bucket < 3000) bad.push("CPU: bucket " + Game.cpu.bucket);
if (avg > Game.cpu.limit) bad.push("CPU: avg100 " + Math.round(avg * 10) / 10 + " over limit " + Game.cpu.limit);
if (!owned.length) bad.push("NO OWNED ROOMS");
Memory.__watch = { t: Game.time, bad: bad, digest: digest, bucket: Game.cpu.bucket, avg: Math.round(avg * 10) / 10, rescue: Memory.spawnRescue || null };
return "ok";
`;

function decode(d) {
  if (d == null || typeof d === "object") return d;
  if (typeof d === "string" && d.startsWith("gz:")) {
    try { return JSON.parse(gunzipSync(Buffer.from(d.slice(3), "base64")).toString()); } catch { return null; }
  }
  try { return JSON.parse(d); } catch { return d; }
}

const q = SHARD ? `&shard=${SHARD}` : "";
let lastBad = "";
const started = Date.now();

async function pass() {
  await fetch(`${BASE}/api/user/memory`, {
    method: "POST", headers: H,
    body: JSON.stringify(SHARD ? { shard: SHARD, path: "__wsrc", value: PROBE } : { path: "__wsrc", value: PROBE }),
  });
  const shim = `(function(){try{return new Function(Memory.__wsrc)();}catch(e){Memory.__watch={err:String(e&&e.message||e)};return "err";}})()`;
  await fetch(`${BASE}/api/user/console`, {
    method: "POST", headers: H,
    body: JSON.stringify(SHARD ? { shard: SHARD, expression: shim } : { expression: shim }),
  });
  await new Promise((r) => setTimeout(r, 6000));
  const res = await fetch(`${BASE}/api/user/memory?path=__watch${q}`, { headers: H });
  const w = decode((await res.json()).data);
  const stamp = new Date().toISOString().slice(11, 19);
  if (!w || !w.t) { console.log(`${stamp} (no reading)`); return; }
  if (w.err) { console.log(`${stamp} PROBE ERROR: ${w.err}`); return; }
  const bad = (w.bad || []).join(" | ");
  if (bad && bad !== lastBad) {
    console.log(`${stamp} t=${w.t} bucket=${w.bucket} avg=${w.avg}${w.rescue ? " rescue=" + w.rescue : ""}`);
    for (const b of w.bad) console.log(`   !! ${b}`);
    console.log(`   ${(w.digest || []).join("  ")}`);
  } else if (!bad && lastBad) {
    console.log(`${stamp} t=${w.t} ALL CLEAR — ${(w.digest || []).join("  ")}`);
  } else if (!bad) {
    console.log(`${stamp} t=${w.t} ok  bucket=${w.bucket} avg=${w.avg}  ${(w.digest || []).join("  ")}`);
  }
  lastBad = bad;
}

while (Date.now() - started < FOR) {
  try { await pass(); } catch (e) { console.log(new Date().toISOString().slice(11, 19), "poll failed:", (e.cause && e.cause.code) || e.message); }
  await new Promise((r) => setTimeout(r, EVERY));
}
console.log("# watch window ended");
