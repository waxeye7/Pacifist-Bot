#!/usr/bin/env node
/**
 * spawn-in.mjs — drop the bot into an UNOWNED room at its planned spawn position.
 *
 *   fnm exec --using 22 node tools/server/spawn-in.mjs E11S5
 *   fnm exec --using 22 node tools/server/spawn-in.mjs E11S5 --user pacifist --dry-run
 *
 * Reads the room's hub plan from tools/plan-suite/out-v2/plans-hub.json and writes
 * directly into the private server's mongo:
 *   - rooms.objects  : new `spawn` at plan.structures.spawn[<index>]
 *   - rooms.objects  : the room controller becomes level-1, owned by the bot user
 *   - rooms          : active/status/name normalised like an owned room
 *   - users          : room added to user.rooms, user.active bumped so code runs
 *
 * Safety: refuses if the controller is owned/reserved or if ANY object in the room
 * already belongs to a user (idempotent-safe — re-running on a live room bails).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NODE_MAJOR = Number(process.versions.node.split(".")[0]);
if (NODE_MAJOR < 18) {
  console.error(
    `ERROR: node ${process.versions.node} is too old (need >= 18).\n` +
      `  Run: fnm exec --using 22 node tools/server/spawn-in.mjs ...`,
  );
  process.exit(1);
}

const MONGO_CONTAINER = process.env.SCREEPS_MONGO_CONTAINER || "local-screeps-server-mongo-1";
const MONGO_DB = process.env.SCREEPS_MONGO_DB || "screeps";
const API_BASE = process.env.SCREEPS_API || "http://127.0.0.1:23025";
const PLANS_FILE =
  process.env.SCREEPS_PLANS ||
  path.join(__dirname, "..", "plan-suite", "out-v2", "plans-hub.json");

/** NPC accounts — never spawn as these, not even with an explicit --user */
const NPC_USERS = ["invader", "source keeper", "screeps"];
/** never AUTO-DETECTED, but allowed when named explicitly with --user */
const FORBIDDEN_USERS = [...NPC_USERS, "waxeye"];
/** preference order when auto-detecting the pacifist bot account */
const USER_PREFERENCE = [/^pacifist$/i, /^pacifistbot$/i, /pacifist/i];

const SPAWN_ENERGY_START = 300;
const SPAWN_HITS = 5000;
const CONTROLLER_LEVEL1_PROGRESS_TOTAL = 200;
const DEFAULT_DOWNGRADE_TICKS = 200000; // "far future" so an idle room is not lost

// ---------------------------------------------------------------- cli args
const args = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith("--")) {
    const [k, inline] = a.slice(2).split("=");
    if (inline !== undefined) flags[k] = inline;
    else if (args[i + 1] && !args[i + 1].startsWith("--")) flags[k] = args[++i];
    else flags[k] = true;
  } else positional.push(a);
}

const room = positional[0];
const dryRun = !!flags["dry-run"];
const spawnIndex = Number(flags["spawn-index"] ?? 0);
const spawnName = String(flags["spawn-name"] || "Spawn1");
const downgradeTicks = Number(flags["downgrade-ticks"] ?? DEFAULT_DOWNGRADE_TICKS);

function die(msg, code = 1) {
  console.error("ERROR: " + msg);
  process.exit(code);
}

if (!room || flags.help) {
  console.log(
    [
      "Usage: node tools/server/spawn-in.mjs <ROOM> [options]",
      "",
      "  <ROOM>                  target room, e.g. E11S5 (must be claimable + unowned)",
      "",
      "  --user <username>       bot account to use (default: auto-detect 'pacifist')",
      "  --spawn-index <n>       which planned spawn to place (default 0)",
      "  --spawn-name <name>     spawn name (default Spawn1)",
      "  --downgrade-ticks <n>   controller downgradeTime offset (default 200000)",
      "  --dry-run               print what would happen, change nothing",
    ].join("\n"),
  );
  process.exit(room ? 0 : 1);
}
if (!/^[WE]\d+[NS]\d+$/.test(room)) die(`"${room}" is not a valid room name`);
if (!Number.isInteger(spawnIndex) || spawnIndex < 0) die("--spawn-index must be a non-negative integer");

// ---------------------------------------------------------------- mongo glue
let mongoSeq = 0;
function mongo(script) {
  const marker = "__SPAWN_IN_RESULT__";
  const body = `db = db.getSiblingDB(${JSON.stringify(MONGO_DB)});
function emit(v) { print(${JSON.stringify(marker)} + JSON.stringify(v)); }
${script}
`;
  const local = path.join(os.tmpdir(), `spawn-in-${process.pid}-${mongoSeq++}.js`);
  const remote = `/tmp/${path.basename(local)}`;
  fs.writeFileSync(local, body);
  try {
    execSync(`docker cp "${local}" ${MONGO_CONTAINER}:${remote}`, { stdio: "pipe" });
    const raw = execSync(`docker exec ${MONGO_CONTAINER} mongosh --quiet --file ${remote}`, {
      encoding: "utf8",
      maxBuffer: 64e6,
    });
    const line = raw.split(/\r?\n/).find((l) => l.startsWith(marker));
    if (!line) throw new Error("mongo script produced no result:\n" + raw.slice(0, 800));
    return JSON.parse(line.slice(marker.length));
  } finally {
    try {
      fs.unlinkSync(local);
    } catch {}
  }
}

// ---------------------------------------------------------------- plan
if (!fs.existsSync(PLANS_FILE)) {
  die(
    `plan file not found: ${PLANS_FILE}\n` +
      `  Run: fnm exec --using 22 node tools/plan-suite/v2/plan.mjs --rooms ${room}`,
  );
}
const plans = JSON.parse(fs.readFileSync(PLANS_FILE, "utf8"));
const plan = (Array.isArray(plans) ? plans : plans.plans || []).find((p) => p.room === room);
if (!plan) {
  console.error(`ERROR: no plan for ${room} in ${PLANS_FILE}`);
  console.error(`  Run this first:`);
  console.error(`    fnm exec --using 22 node tools/plan-suite/v2/plan.mjs --rooms ${room}`);
  console.error(`  (or --all-claimable to refresh every room; plan.mjs rewrites plans-hub.json`);
  console.error(`   with ONLY the rooms it planned, so prefer --all-claimable)`);
  process.exit(1);
}
const spawnPositions = plan.structures?.spawn || [];
if (!spawnPositions[spawnIndex]) {
  die(`plan for ${room} has no spawn[${spawnIndex}] (found ${spawnPositions.length} planned spawns)`);
}
const pos = spawnPositions[spawnIndex];

// ---------------------------------------------------------------- inspect server
const info = mongo(`
var room = ${JSON.stringify(room)};
var users = db.users.find({}, {username:1, active:1, rooms:1, cpu:1, gcl:1}).toArray()
  .map(function (u) { return { id: String(u._id), username: u.username, active: u.active, rooms: u.rooms || [], cpu: u.cpu, gcl: u.gcl }; });
var roomDoc = db.rooms.findOne({_id: room});
var objects = db["rooms.objects"].find({room: room}).toArray().map(function (o) {
  return { id: String(o._id), type: o.type, x: o.x, y: o.y, user: o.user ? String(o.user) : null,
           level: o.level, reservation: o.reservation || null, name: o.name || null };
});
var terrain = db["rooms.terrain"].findOne({room: room});
emit({
  users: users,
  room: roomDoc ? { id: roomDoc._id, status: roomDoc.status, active: !!roomDoc.active, sourceKeepers: !!roomDoc.sourceKeepers } : null,
  objects: objects,
  hasTerrain: !!terrain,
  terrainTile: terrain ? terrain.terrain.charAt(${pos.y} * 50 + ${pos.x}) : null,
  gameTime: null
});
`);

if (!info.room) die(`room ${room} does not exist in mongo`);
if (!info.hasTerrain) die(`room ${room} has no terrain document`);
if (info.room.status !== "normal") die(`room ${room} status is "${info.room.status}" (need "normal")`);
if (info.room.sourceKeepers) die(`room ${room} is a source keeper room`);

// -- pick the bot user
let user;
if (flags.user) {
  user = info.users.find((u) => u.username.toLowerCase() === String(flags.user).toLowerCase());
  if (!user) die(`no user named "${flags.user}" (have: ${info.users.map((u) => u.username).join(", ")})`);
} else {
  const candidates = info.users.filter((u) => !FORBIDDEN_USERS.includes(u.username.toLowerCase()));
  for (const rx of USER_PREFERENCE) {
    user = candidates.find((u) => rx.test(u.username));
    if (user) break;
  }
  if (!user) {
    die(
      `could not auto-detect a pacifist user; pass --user <name>. ` +
        `Users: ${info.users.map((u) => u.username).join(", ")}`,
    );
  }
}
if (NPC_USERS.includes(user.username.toLowerCase())) die(`refusing to use NPC account "${user.username}"`);

// -- ownership / safety checks
const controller = info.objects.find((o) => o.type === "controller");
if (!controller) die(`room ${room} has no controller — not claimable`);
if (controller.user) {
  const owner = info.users.find((u) => u.id === controller.user);
  die(`${room} controller is already owned by ${owner ? owner.username : controller.user}`);
}
if (controller.reservation) die(`${room} controller is reserved: ${JSON.stringify(controller.reservation)}`);

const ownedObjects = info.objects.filter((o) => o.user);
if (ownedObjects.length) {
  die(
    `${room} already contains ${ownedObjects.length} user-owned object(s): ` +
      ownedObjects.map((o) => `${o.type}@${o.x},${o.y}`).join(", ") +
      ` — refusing (not idempotent-safe)`,
  );
}
const sources = info.objects.filter((o) => o.type === "source");
if (sources.length < 1) die(`${room} has no sources`);
if (info.terrainTile === "1" || info.terrainTile === "3") {
  die(`planned spawn position (${pos.x},${pos.y}) is a wall tile in ${room}`);
}
const blocking = info.objects.find((o) => o.x === pos.x && o.y === pos.y);
if (blocking) die(`something already sits at (${pos.x},${pos.y}) in ${room}: ${blocking.type}`);

// -- game time from the server API (fallback: mongo has none)
let gameTime = 0;
try {
  const res = await fetch(`${API_BASE}/api/game/time`);
  const json = await res.json();
  gameTime = json.time || 0;
} catch (e) {
  console.warn(`WARN: could not read ${API_BASE}/api/game/time (${e.message}); downgradeTime will be relative to 0`);
}

console.log(`room        : ${room} (status ${info.room.status}, ${sources.length} sources)`);
console.log(`user        : ${user.username} (_id ${user.id}, gcl ${user.gcl}, rooms [${user.rooms.join(", ")}])`);
console.log(`plan spawn  : #${spawnIndex} at (${pos.x},${pos.y}) — hub (${plan.hub?.x},${plan.hub?.y})`);
console.log(`controller  : (${controller.x},${controller.y}) level ${controller.level} unowned`);
console.log(`game time   : ${gameTime} → downgradeTime ${gameTime + downgradeTicks}`);

if (dryRun) {
  console.log("\n--dry-run: nothing written.");
  process.exit(0);
}

// ---------------------------------------------------------------- write
const write = mongo(`
var room = ${JSON.stringify(room)};
var userId = ${JSON.stringify(user.id)};
var now = ${gameTime};

// re-check under the same connection (cheap guard against a race)
var ctrl = db["rooms.objects"].findOne({room: room, type: "controller"});
if (!ctrl) { emit({ok: false, error: "controller vanished"}); quit(); }
if (ctrl.user || ctrl.reservation) { emit({ok: false, error: "controller became owned/reserved"}); quit(); }
if (db["rooms.objects"].countDocuments({room: room, user: {$ne: null}}) > 0) {
  emit({ok: false, error: "room gained user-owned objects"}); quit();
}

db["rooms.objects"].updateOne({_id: ctrl._id}, {$set: {
  user: userId,
  level: 1,
  progress: 0,
  progressTotal: ${CONTROLLER_LEVEL1_PROGRESS_TOTAL},
  downgradeTime: now + ${downgradeTicks},
  ticksToDowngrade: ${downgradeTicks},
  isPowerEnabled: false,
  safeMode: null,
  safeModeAvailable: 1,
  safeModeCooldown: null,
  upgradeBlocked: null
}, $unset: {reservation: "", sign: ""}});

var spawnDoc = {
  type: "spawn",
  room: room,
  x: ${pos.x},
  y: ${pos.y},
  name: ${JSON.stringify(spawnName)},
  user: userId,
  store: {energy: ${SPAWN_ENERGY_START}},
  storeCapacityResource: {energy: ${SPAWN_ENERGY_START}},
  hits: ${SPAWN_HITS},
  hitsMax: ${SPAWN_HITS},
  spawning: null,
  notifyWhenAttacked: true,
  off: false
};
var ins = db["rooms.objects"].insertOne(spawnDoc);

db.rooms.updateOne({_id: room}, {$set: {name: room, status: "normal", active: true}});
db.users.updateOne({_id: ${JSON.stringify(user.id)}}, {
  $addToSet: {rooms: room},
  $max: {active: 10000}
});

var check = db["rooms.objects"].find({room: room, user: {$ne: null}}).toArray().map(function (o) {
  return {type: o.type, x: o.x, y: o.y, name: o.name || null, level: o.level, user: String(o.user)};
});
emit({
  ok: true,
  spawnId: String(ins.insertedId),
  objects: check,
  room: db.rooms.findOne({_id: room}),
  user: db.users.findOne({_id: ${JSON.stringify(user.id)}}, {username: 1, rooms: 1, active: 1})
});
`);

if (!write.ok) die(`write aborted: ${write.error}`);

// ---------------------------------------------------------------- verify
console.log("\n--- mongo ---");
for (const o of write.objects) {
  console.log(
    `  ${o.type.padEnd(11)} (${o.x},${o.y})${o.name ? " " + o.name : ""}${o.level !== undefined && o.level !== null ? " level " + o.level : ""} user=${o.user}`,
  );
}
console.log(`  rooms.${room}: active=${write.room.active} status=${write.room.status}`);
console.log(`  users.${write.user.username}: rooms=[${(write.user.rooms || []).join(", ")}] active=${write.user.active}`);

console.log("\n--- server API ---");
try {
  const res = await fetch(`${API_BASE}/api/game/room-objects?room=${room}&shard=shard0`);
  const json = await res.json();
  const objs = json.objects || [];
  const mine = objs.filter((o) => o.user);
  console.log(`  GET /api/game/room-objects?room=${room} → ${objs.length} objects, ${mine.length} owned`);
  for (const o of mine) {
    console.log(`    ${o.type} (${o.x},${o.y}) user=${o.user}${o.level ? " level " + o.level : ""}`);
  }
  if (!mine.length) {
    console.log("  (nothing owned yet — the API caches per tick, re-run the check in a second)");
  }
} catch (e) {
  console.log(`  API check failed: ${e.message}`);
}

console.log(`\nDONE — ${user.username} now owns ${room}, spawn "${spawnName}" at (${pos.x},${pos.y}).`);
