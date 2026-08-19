#!/usr/bin/env node
/**
 * Read-only empire audit. Works against any dest in screeps.json.
 *
 *   fnm exec --using 22 node tools/server/audit.mjs --dest main --shard shard3
 *   fnm exec --using 22 node tools/server/audit.mjs --dest vps
 *   fnm exec --using 22 node tools/server/audit.mjs --dest pacifist
 *
 * Prints, per owned room: RCL/progress, energy, spawns, structures, creeps by
 * role, storage/terminal, sites, hostiles, controller timers. Then a global
 * section: memory size, CPU/bucket, stale/blocked signals, and anything that
 * looks like a stall.
 *
 * Never writes. Never issues console expressions.
 */
import fs from "fs";
import path from "path";
import { gunzipSync } from "zlib";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const DEST = arg("dest", "main");
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8"))[DEST];
if (!cfg) {
  console.error("no dest " + DEST);
  process.exit(2);
}
const BASE = `${cfg.protocol || "https"}://${cfg.hostname}${cfg.port && cfg.port !== 80 && cfg.port !== 443 ? ":" + cfg.port : ""}`;
const SHARD = arg("shard", cfg.hostname === "screeps.com" ? "shard3" : "");
const Q = SHARD ? `&shard=${SHARD}` : "";
const H = { "X-Token": cfg.token, "X-Username": cfg.token };

async function api(p) {
  const res = await fetch(BASE + p, { headers: H });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: { raw: text.slice(0, 200) } };
  }
}
function decode(data) {
  if (data == null || typeof data === "object") return data;
  if (typeof data !== "string") return data;
  if (data.startsWith("gz:")) {
    try {
      return JSON.parse(gunzipSync(Buffer.from(data.slice(3), "base64")).toString());
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}
const num = (n) => (n == null ? "-" : typeof n === "number" ? n.toLocaleString("en-US") : String(n));
const pad = (s, n) => String(s).padEnd(n);

const me = (await api("/api/auth/me")).json;
const MYID = me._id;
console.log(`=== ${DEST}${SHARD ? " " + SHARD : ""} @ ${BASE} ===`);
console.log(`user=${me.username} id=${MYID} gcl=${num(me.gcl)} cpu=${me.cpu} credits=${num(me.credits)}`);

const time = (await api(`/api/game/time?${Q.slice(1)}`)).json.time;
console.log(`tick=${num(time)}  polled=${new Date().toISOString()}`);

// ---- owned rooms -----------------------------------------------------------
let rooms = [];
const ov = (await api(`/api/user/overview?interval=8&statName=energyControl`)).json;
if (ov.shards) {
  if (SHARD) rooms = (ov.shards[SHARD] && ov.shards[SHARD].rooms) || [];
  else for (const s of Object.keys(ov.shards)) rooms.push(...((ov.shards[s] || {}).rooms || []));
}
if (!rooms.length) {
  // private servers often have no /overview — fall back to memory.rooms
  const m = decode((await api(`/api/user/memory?path=rooms${Q}`)).json.data);
  if (m) rooms = Object.keys(m);
}
console.log(`ownedRooms(${rooms.length}): ${rooms.join(", ") || "(none)"}`);

// ---- memory ----------------------------------------------------------------
const memRaw = (await api(`/api/user/memory?${Q.slice(1)}`)).json;
const mem = decode(memRaw.data) || {};
const memBytes = typeof memRaw.data === "string" ? memRaw.data.length : JSON.stringify(mem).length;
console.log(`memory≈${num(memBytes)}B (raw wire)  topKeys=${Object.keys(mem).join(",")}`);

// ---- per-room --------------------------------------------------------------
const creepsByRoom = {};
const creepRoles = {};
for (const [name, c] of Object.entries(mem.creeps || {})) {
  const home = c && (c.homeRoom || c.home || c.room || c.targetRoom);
  const role = (c && c.role) || "?";
  creepRoles[role] = (creepRoles[role] || 0) + 1;
  (creepsByRoom[home] = creepsByRoom[home] || []).push(role);
}

const findings = [];
for (const name of rooms) {
  const r = (await api(`/api/game/room-objects?room=${name}${Q}`)).json;
  const objs = r.objects || [];
  const users = r.users || {};
  const mine = (t) => objs.filter((o) => o.type === t && o.user === MYID);
  const all = (t) => objs.filter((o) => o.type === t);
  const ctrl = all("controller")[0] || {};
  const spawns = mine("spawn");
  const ext = mine("extension");
  const towers = mine("tower");
  const sites = objs.filter((o) => o.type === "constructionSite" && o.user === MYID);
  const stor = mine("storage")[0];
  const term = mine("terminal")[0];
  const links = mine("link");
  const labs = mine("lab");
  const containers = all("container");
  const roads = all("road");
  const ramps = all("rampart").filter((o) => o.user === MYID);
  const walls = all("constructedWall");
  const hostileCreeps = objs.filter((o) => (o.type === "creep" || o.type === "powerCreep") && o.user && o.user !== MYID);
  const myCreeps = objs.filter((o) => o.type === "creep" && o.user === MYID);
  const invaderCore = all("invaderCore")[0];

  let eAvail = 0,
    eCap = 0;
  for (const s of spawns) {
    eAvail += (s.store && s.store.energy) || s.energy || 0;
    eCap += (s.storeCapacityResource && s.storeCapacityResource.energy) || s.energyCapacity || 300;
  }
  for (const e of ext) {
    eAvail += (e.store && e.store.energy) || e.energy || 0;
    eCap += (e.storeCapacityResource && e.storeCapacityResource.energy) || e.energyCapacity || 50;
  }
  const storE = stor ? (stor.store && stor.store.energy) || 0 : null;
  const termE = term ? (term.store && term.store.energy) || 0 : null;
  const towE = towers.reduce((a, t) => a + ((t.store && t.store.energy) || t.energy || 0), 0);
  const towCap = towers.length * 1000;
  const spawning = spawns.filter((s) => s.spawning).length;
  const rm = (mem.rooms && mem.rooms[name]) || {};

  console.log("");
  console.log(`--- ${name}  RCL${ctrl.level || 0} ${num(ctrl.progress)}/${num(ctrl.progressTotal)} ` + `${ctrl.progressTotal ? "(" + ((ctrl.progress / ctrl.progressTotal) * 100).toFixed(1) + "%)" : ""}`);
  console.log(
    `    energy ${num(eAvail)}/${num(eCap)}  spawns ${spawns.length}(busy ${spawning})  ` +
      `storage ${storE === null ? "-" : num(storE)}  terminal ${termE === null ? "-" : num(termE)}  ` +
      `towers ${towers.length} ${num(towE)}/${num(towCap)}`,
  );
  console.log(
    `    ext ${ext.length}  link ${links.length}  lab ${labs.length}  cont ${containers.length}  ` +
      `road ${roads.length}  ramp ${ramps.length}  wall ${walls.length}  sites ${sites.length}`,
  );
  console.log(`    myCreeps ${myCreeps.length}  memCreeps ${(creepsByRoom[name] || []).length}  hostiles ${hostileCreeps.length}${invaderCore ? "  INVADER-CORE" : ""}`);
  if (ctrl.downgradeTime) {
    const left = ctrl.downgradeTime - time;
    console.log(`    downgradeIn ${num(left)}${ctrl.safeMode ? "  safeMode " + num(ctrl.safeMode - time) : ""}  safeModeAvailable ${ctrl.safeModeAvailable || 0}`);
    if (left < 5000) findings.push(`${name}: controller downgrade in ${left} ticks`);
  }
  const roleCount = {};
  for (const role of creepsByRoom[name] || []) roleCount[role] = (roleCount[role] || 0) + 1;
  const roleStr = Object.entries(roleCount)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(" ");
  console.log(`    roles ${roleStr || "(none)"}`);
  if (rm.spawn_list && rm.spawn_list.length) {
    console.log(`    spawn_list(${rm.spawn_list.length}) ${rm.spawn_list.map((s) => (typeof s === "string" ? s : s.role || JSON.stringify(s).slice(0, 40))).join(",")}`);
  }
  const memFlags = Object.entries(rm)
    .filter(([k, v]) => (typeof v === "boolean" && v) || (typeof v === "number" && /stall|danger|block|fail|err/i.test(k)))
    .map(([k, v]) => `${k}=${v}`);
  if (memFlags.length) console.log(`    flags ${memFlags.join(" ")}`);

  // --- findings
  if (spawns.length === 0) findings.push(`${name}: NO SPAWN`);
  if (hostileCreeps.length) {
    const owners = [...new Set(hostileCreeps.map((c) => (users[c.user] || {}).username || c.user))];
    findings.push(`${name}: ${hostileCreeps.length} hostile creeps (${owners.join(",")})`);
  }
  if (invaderCore) findings.push(`${name}: invader core present`);
  if (eCap > 0 && eAvail / eCap < 0.15 && myCreeps.length < 4) findings.push(`${name}: energy ${eAvail}/${eCap} with only ${myCreeps.length} creeps — possible spawn deadlock`);
  if (towers.length && towE / towCap < 0.25) findings.push(`${name}: towers at ${((towE / towCap) * 100) | 0}%`);
  if (ctrl.level >= 4 && !stor) findings.push(`${name}: RCL${ctrl.level} but no storage`);
  if (sites.length > 25) findings.push(`${name}: ${sites.length} construction sites open`);
  if (myCreeps.length === 0) findings.push(`${name}: ZERO creeps in room`);
}

// ---- global creep census ---------------------------------------------------
console.log("");
console.log("=== creep census (Memory.creeps) ===");
const total = Object.keys(mem.creeps || {}).length;
console.log(
  `total ${total}: ` +
    Object.entries(creepRoles)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join(" "),
);
const homeless = Object.entries(mem.creeps || {}).filter(([, c]) => !c || !(c.homeRoom || c.home || c.room));
if (homeless.length) findings.push(`${homeless.length} creeps in Memory.creeps with no home room`);

// ---- stats / cpu -----------------------------------------------------------
if (mem.stats) {
  const s = mem.stats;
  const short = JSON.stringify(s).slice(0, 400);
  console.log("");
  console.log("=== Memory.stats ===");
  console.log(short);
}
for (const key of ["war", "cpuPolicy", "CpuPolicy", "empire", "expand", "AutoExpand"]) {
  if (mem[key]) {
    console.log("");
    console.log(`=== Memory.${key} ===`);
    console.log(JSON.stringify(mem[key]).slice(0, 600));
  }
}

console.log("");
console.log("=== FINDINGS ===");
if (!findings.length) console.log("(none)");
for (const f of findings) console.log(" * " + f);
