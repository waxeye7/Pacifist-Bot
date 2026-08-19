#!/usr/bin/env node
/**
 * seed-clean.mjs — push-pacifist, bench hygiene, then race.mjs --seed.
 *
 * Cycle-5: race.mjs --wipe left user:null roads (spawn-in tile block) and
 * skipped 5 rooms as "non-benchmark user". Needed _wipe-five + _scrub-three.
 * Cycle-11: border walkers made --wipe skip / spawn-in refuse (14/16);
 * --run after wipe skipped B8 because seedOk was still true on a reset ctrl.
 *
 *   fnm exec --using 22 node tools/server/seed-clean.mjs
 *   fnm exec --using 22 node tools/server/seed-clean.mjs --label cycle-16-5w-clamp --tick-budget 40000
 *   fnm exec --using 22 node tools/server/seed-clean.mjs --skip-push --hygiene-only
 *
 * Own flags: --skip-push  --hygiene-only  --replace-live  --help
 * Everything else is passed to race.mjs. Missing of --wipe/--yes/--swap/--force
 * are filled in. Does not push-race. Does not reset the world.
 * Never calls _wipe-bench.js (that deleteMany includes owned controllers).
 *
 * Windows pwsh equivalent (this script):
 *   npm run push-pacifist
 *   foreach ($f in '_del-walkers.js','_scrub-bench-objects.js','_reset-bench-ctrls.js','_restore-bench-ctrls.js','_del-racer-creeps.js') {
 *     docker cp "tools/server/$f" local-screeps-server-mongo-1:/tmp/$f
 *     docker exec local-screeps-server-mongo-1 mongosh --quiet --file /tmp/$f
 *   }
 *   fnm exec --using 22 node tools/server/_scrub-racer-mem.mjs
 *   fnm exec --using 22 node tools/server/race.mjs --seed --wipe --yes --swap --force
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const LEDGER_DIR = path.join(REPO, "docs", "speedrun-ledger");

const NODE_MAJOR = Number(process.versions.node.split(".")[0]);
if (NODE_MAJOR < 18) {
  console.error(
    `ERROR: node ${process.versions.node} is too old (need >= 18).\n` +
      `  Run: fnm exec --using 22 node tools/server/seed-clean.mjs ...`,
  );
  process.exit(1);
}

const MONGO = process.env.SCREEPS_MONGO_CONTAINER || "local-screeps-server-mongo-1";
const DEFAULT_SEED = ["--wipe", "--yes", "--swap", "--force"];
const RACE = [
  "E5S3", "E9S1", "E12S3", "E13S9", "E18S9", "E8S5", "E11S6", "E8S3",
  "E16S9", "E4S7", "E18S5", "E6S1", "E12S1", "E3S5", "E13S7", "E21S4",
];
// Never _wipe-bench.js — deleteMany({user}) drops owned controllers.
const MONGO_STEPS = [
  "_del-walkers.js",
  "_scrub-bench-objects.js",
  "_reset-bench-ctrls.js",
  "_restore-bench-ctrls.js",
  "_del-racer-creeps.js",
];

const USAGE = `seed-clean.mjs — push-pacifist, walker/bench hygiene, race.mjs --seed

  fnm exec --using 22 node tools/server/seed-clean.mjs [race --seed args...]

  --skip-push / --no-push     skip npm run push-pacifist
  --hygiene-only / --no-seed  stop after hygiene (do not exec race.mjs)
  --replace-live              allow wipe while a ledger is still watching
  --help

  Default race flags if omitted: --wipe --yes --swap --force
  Always: del-walkers (16 + neighbor edges), scrub all Memory.rooms keys
  plus autoExpand + target_colonise (both racers),
  restore missing controllers from BENCHMARK xy, never delete controllers.
  If --run is set, seedOk is cleared when that room's controller.level is 0.
  Never push-race. Never server:local:reset.
`;

function parseArgs(argv) {
  const own = { skipPush: false, hygieneOnly: false, replaceLive: false, help: false };
  const rest = [];
  for (const a of argv) {
    if (a === "--skip-push" || a === "--no-push") own.skipPush = true;
    else if (a === "--hygiene-only" || a === "--no-seed") own.hygieneOnly = true;
    else if (a === "--replace-live") own.replaceLive = true;
    else if (a === "--help" || a === "-h") own.help = true;
    else rest.push(a);
  }
  return { own, rest };
}

function hasFlag(args, name) {
  const exact = `--${name}`;
  const prefix = `--${name}=`;
  return args.some((a) => a === exact || a.startsWith(prefix));
}

function flagValue(args, name) {
  const exact = `--${name}`;
  const prefix = `--${name}=`;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith(prefix)) return a.slice(prefix.length);
    if (a === exact) {
      const n = args[i + 1];
      if (n !== undefined && !n.startsWith("--")) return n;
      return true;
    }
  }
  return undefined;
}

function seedArgv(passthrough) {
  const out = [];
  if (!hasFlag(passthrough, "seed")) out.push("--seed");
  for (const f of DEFAULT_SEED) {
    if (!hasFlag(passthrough, f.slice(2))) out.push(f);
  }
  out.push(...passthrough);
  return out;
}

function run(file, args, opts = {}) {
  const r = spawnSync(file, args, { cwd: REPO, stdio: "inherit", ...opts });
  if (r.error) {
    console.error("ERROR: " + (r.error.message || r.error));
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function docker(args) {
  run("docker", args);
}

function runMongoFile(filename) {
  const local = path.join(__dirname, filename);
  if (!fs.existsSync(local)) {
    console.error("ERROR: missing " + local);
    process.exit(1);
  }
  const remote = "/tmp/" + filename;
  docker(["cp", local, `${MONGO}:${remote}`]);
  docker(["exec", MONGO, "mongosh", "--quiet", "--file", remote]);
}

function mongoCapture(body) {
  const local = path.join(os.tmpdir(), `seed-clean-${process.pid}.js`);
  const remote = "/tmp/seed-clean-eval.js";
  fs.writeFileSync(local, `const d = db.getSiblingDB("screeps");\n${body}`);
  try {
    const cp = spawnSync("docker", ["cp", local, `${MONGO}:${remote}`], {
      cwd: REPO,
      encoding: "utf8",
    });
    if (cp.error || cp.status !== 0) {
      console.error("ERROR: docker cp census: " + (cp.error?.message || cp.stderr || cp.status));
      process.exit(1);
    }
    const r = spawnSync("docker", ["exec", MONGO, "mongosh", "--quiet", "--file", remote], {
      cwd: REPO,
      encoding: "utf8",
    });
    if (r.error) {
      console.error("ERROR: " + (r.error.message || r.error));
      process.exit(1);
    }
    if (r.status !== 0) {
      process.stderr.write(r.stderr || "");
      process.exit(r.status ?? 1);
    }
    return r.stdout || "";
  } finally {
    try {
      fs.unlinkSync(local);
    } catch {
      /* tmp */
    }
  }
}

function loadLedger(runId) {
  if (!runId || runId === true) return null;
  const file = path.join(LEDGER_DIR, `${runId}.json`);
  if (!fs.existsSync(file)) return { file, ledger: null };
  return { file, ledger: JSON.parse(fs.readFileSync(file, "utf8")) };
}

function newestLedgerFile() {
  if (!fs.existsSync(LEDGER_DIR)) return null;
  const files = fs
    .readdirSync(LEDGER_DIR)
    .filter((f) => /^run-.*\.json$/.test(f))
    .sort();
  return files.length ? path.join(LEDGER_DIR, files[files.length - 1]) : null;
}

function ledgerIsLive(ledger) {
  if (!ledger || !Array.isArray(ledger.entries)) return false;
  if (ledger.watch && ledger.watch.exitReason) return false;
  return ledger.entries.some((e) => e.seedOk && e.lastSeen && (e.lastSeen.level || 0) >= 1);
}

function seedOkByRoom(ledger) {
  const m = {};
  if (!ledger || !Array.isArray(ledger.entries)) return m;
  for (const e of ledger.entries) {
    if (e && e.room) m[e.room] = !!e.seedOk;
  }
  return m;
}

function queryRooms() {
  const raw = mongoCapture(`
const rooms = ${JSON.stringify(RACE)};
const users = {};
d.users.find({}, {username:1}).forEach(function (u) { users[String(u._id)] = u.username; });
const out = [];
rooms.forEach(function (r) {
  const c = d["rooms.objects"].findOne({room: r, type: "controller"});
  const owner = c && c.user ? (users[String(c.user)] || String(c.user)) : "-";
  const rcl = c ? (c.level || 0) : null;
  const extras = d["rooms.objects"].countDocuments({room: r, type: {$nin: ["source","mineral","controller"]}});
  const walkers = d["rooms.objects"].countDocuments({room: r, type: "creep"});
  const roads = d["rooms.objects"].countDocuments({room: r, type: "road"});
  out.push({room: r, owner: owner, rcl: rcl, extras: extras, walkers: walkers, roads: roads});
});
print(JSON.stringify(out));
`);
  const line = raw
    .trim()
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
  try {
    return JSON.parse(line);
  } catch (e) {
    console.error("ERROR: census parse failed: " + e.message + "\n" + raw.slice(0, 800));
    process.exit(1);
  }
}

function printCensus(label, rooms, seedOkMap) {
  console.log("\n== census " + label + " ==");
  console.log("room    owner            rcl  seedOk extras walkers roads");
  for (const r of rooms) {
    const ok = seedOkMap && Object.prototype.hasOwnProperty.call(seedOkMap, r.room) ? (seedOkMap[r.room] ? "true" : "false") : "-";
    const rcl = r.rcl === null || r.rcl === undefined ? "NOCTRL" : String(r.rcl);
    console.log(
      `${r.room.padEnd(7)} ${String(r.owner).padEnd(16)} ${rcl.padStart(3)}  ${ok.padEnd(6)} ${String(r.extras).padStart(6)} ${String(r.walkers).padStart(7)} ${String(r.roads).padStart(5)}`,
    );
  }
}

function clearStaleSeedOk(handle, rooms) {
  if (!handle || !handle.ledger) return null;
  const byRoom = {};
  for (const r of rooms) byRoom[r.room] = r;
  let n = 0;
  for (const e of handle.ledger.entries || []) {
    const snap = byRoom[e.room];
    if (!e.seedOk || !snap) continue;
    // Wipe/--reset-bench-ctrls leaves level 0 and no owner. seedOk must not skip.
    if (snap.rcl === 0 || snap.rcl === null || snap.owner === "-") {
      e.seedOk = false;
      e.seedError = (e.seedError ? e.seedError + "\n" : "") + "seed-clean: seedOk cleared (controller reset)";
      n++;
    }
  }
  if (n) {
    handle.ledger.updatedAt = new Date().toISOString();
    fs.writeFileSync(handle.file, JSON.stringify(handle.ledger, null, 2) + "\n");
    console.log(`cleared seedOk on ${n} entries in ${path.relative(REPO, handle.file)} (controller was reset)`);
  } else {
    console.log("no stale seedOk (controller.level still matches)");
  }
  return seedOkByRoom(handle.ledger);
}

const { own, rest } = parseArgs(process.argv.slice(2));
if (own.help) {
  process.stdout.write(USAGE);
  process.exit(0);
}

{
  const runIdEarly = flagValue(rest, "run");
  const checkFile =
    runIdEarly && runIdEarly !== true
      ? path.join(LEDGER_DIR, `${runIdEarly}.json`)
      : newestLedgerFile();
  if (checkFile && fs.existsSync(checkFile)) {
    let liveLedger = null;
    try {
      liveLedger = JSON.parse(fs.readFileSync(checkFile, "utf8"));
    } catch {
      liveLedger = null;
    }
    if (liveLedger && ledgerIsLive(liveLedger) && !own.replaceLive) {
      console.error(
        `ERROR: ${path.relative(REPO, checkFile)} is still watching (${liveLedger.label || liveLedger.runId}).\n` +
          `  Do not seed over a live run. Wait for watch exitReason (RCL4 8/8 or budget).\n` +
          `  New seed = new ledger (do not --run a live id). Override: --replace-live`,
      );
      process.exit(1);
    }
  }
}

if (!own.skipPush) {
  console.log("\n== push-pacifist ==");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  run(npm, ["run", "push-pacifist"], { shell: process.platform === "win32" });
} else {
  console.log("\n== push-pacifist skipped ==");
}

for (const f of MONGO_STEPS) {
  console.log("\n== " + f + " ==");
  runMongoFile(f);
}

console.log("\n== _scrub-racer-mem.mjs ==");
run(process.execPath, [path.join(__dirname, "_scrub-racer-mem.mjs")]);

const runId = flagValue(rest, "run");
const prior = loadLedger(runId);
if (runId && runId !== true && prior && !prior.ledger) {
  console.log("WARN: --run " + runId + " has no ledger yet; race.mjs will create it");
}

let rooms = queryRooms();
let seedOkMap = prior && prior.ledger ? seedOkByRoom(prior.ledger) : {};
printCensus("after-hygiene", rooms, seedOkMap);
if (prior && prior.ledger) {
  seedOkMap = clearStaleSeedOk(prior, rooms) || seedOkMap;
  printCensus("after-seedOk-scrub", rooms, seedOkMap);
}

if (own.hygieneOnly) {
  console.log("\n== hygiene-only: not seeding ==");
  process.exit(0);
}

console.log("\n== _del-walkers.js (again, immediately before seed) ==");
runMongoFile("_del-walkers.js");

const raceArgs = seedArgv(rest);
console.log("\n== race.mjs " + raceArgs.join(" ") + " ==");
run(process.execPath, [path.join(__dirname, "race.mjs"), ...raceArgs]);

rooms = queryRooms();
const afterFile = runId && runId !== true ? path.join(LEDGER_DIR, `${runId}.json`) : newestLedgerFile();
let afterMap = {};
if (afterFile && fs.existsSync(afterFile)) {
  try {
    afterMap = seedOkByRoom(JSON.parse(fs.readFileSync(afterFile, "utf8")));
  } catch {
    afterMap = {};
  }
}
printCensus("after-seed", rooms, afterMap);
const ok = rooms.filter((r) => afterMap[r.room] && r.rcl >= 1 && r.owner !== "-").length;
console.log(`seeded-live ${ok}/16 (seedOk + owner + rcl>=1)`);
