#!/usr/bin/env node
/**
 * race.mjs — benchmark harness for the EARLY-GAME SPEEDRUN CAMPAIGN
 * (docs/EARLY-GAME-SPEEDRUN-CAMPAIGN.md).
 *
 * Measures **game ticks from spawn placement to RCLn** for a control build
 * (user `pacifist-race`) against a candidate build (user `pacifist`), on the
 * local private server, over a frozen benchmark room set.
 *
 *   fnm exec --using 22 node tools/server/race.mjs --pick   [options]
 *   fnm exec --using 22 node tools/server/race.mjs --seed   [options]
 *   fnm exec --using 22 node tools/server/race.mjs --watch  [options]
 *   fnm exec --using 22 node tools/server/race.mjs --report [options]
 *
 * ---------------------------------------------------------------------------
 * WHY ROOM *PAIRS*
 * ---------------------------------------------------------------------------
 * The campaign doc asks for "same rooms, simultaneously". Two users cannot own
 * the same room, so the harness picks a *matched pair* of rooms per benchmark
 * slot (terrain metrics as close as the world allows) and runs control in one,
 * candidate in the other, at the same time on the same server. Residual pair
 * bias is cancelled by counterbalancing: run the set with `--swap` on half the
 * runs and `--report` will show the raw AND the swap-balanced delta.
 * `--no-pairs` falls back to one room per slot (control and candidate then have
 * to alternate across runs, which confounds run-to-run world state instead).
 *
 * ---------------------------------------------------------------------------
 * DATA HONESTY
 * ---------------------------------------------------------------------------
 * Nothing in a ledger is computed, interpolated or guessed: a milestone tick is
 * the game tick of the *first poll that observed* controller.level >= n, and
 * the poll before it is stored alongside, so the true crossing is known to lie
 * in (priorTick, tick]. Milestones are never overwritten once recorded, so
 * --watch is resumable and re-running it can only add information.
 *
 * Sources of truth: mongo (world census + terrain, read-only for --pick/--seed
 * preflight) and the server HTTP API (game time + controller levels).
 */

import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync, execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");

const NODE_MAJOR = Number(process.versions.node.split(".")[0]);
if (NODE_MAJOR < 18) {
  console.error(
    `ERROR: node ${process.versions.node} is too old (need >= 18).\n` +
      `  Run: fnm exec --using 22 node tools/server/race.mjs ...`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------- defaults
const D = {
  mongoContainer: process.env.SCREEPS_MONGO_CONTAINER || "local-screeps-server-mongo-1",
  mongoDb: process.env.SCREEPS_MONGO_DB || "screeps",
  api: process.env.SCREEPS_API || "http://127.0.0.1:23456",
  shard: "shard0",
  benchmarks: path.join(REPO, "docs", "BENCHMARK-ROOMS.json"),
  ledgerDir: path.join(REPO, "docs", "speedrun-ledger"),
  plans: path.join(REPO, "tools", "plan-suite", "out-v2", "plans-hub.json"),
  spawnIn: path.join(__dirname, "spawn-in.mjs"),
  controlUser: "pacifist-race",
  candidateUser: "pacifist",
  slots: 8,
  targetRcl: 4,
  milestones: [2, 3, 4, 5, 6],
  tickBudget: 20000,
  intervalSec: 15,
  minSeparation: 2, // benchmark rooms must be >= this many rooms apart
  minOwnerDistance: 2, // ... and this far from any already-owned room
  /** slots per hardness band; harder rooms are where a real win has to show */
  composition: { easy: 2, median: 3, hard: 3 },
};

/** hardness = weighted z-scores of these room metrics (documented into the JSON) */
const HARDNESS_WEIGHTS = {
  srcStepsSum: 0.4, // walking distance anchor -> both sources
  ctrlSteps: 0.3, // walking distance anchor -> controller
  swampPct: 0.1, // swamp tax on every carrier trip
  negOpenPct: 0.1, // cramped rooms are harder to lay out
  negMinSourceFree: 0.1, // a source with 1-2 free tiles throttles mining
};

// ---------------------------------------------------------------- cli
function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, inline] = a.slice(2).split("=");
      if (inline !== undefined) flags[k] = inline;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) flags[k] = argv[++i];
      else flags[k] = true;
    } else positional.push(a);
  }
  return { flags, positional };
}

function die(msg, code = 1) {
  console.error("ERROR: " + msg);
  process.exit(code);
}
function warn(msg) {
  console.error("WARN: " + msg);
}
function num(v, dflt) {
  if (v === undefined || v === true) return dflt;
  const n = Number(v);
  if (!Number.isFinite(n)) die(`expected a number, got "${v}"`);
  return n;
}
function list(v) {
  if (v === undefined || v === true) return [];
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const USAGE = `
race.mjs — early-game speedrun benchmark harness

  MODES (exactly one)
    --pick        choose the frozen benchmark set, write BENCHMARK-ROOMS.json
    --seed        spawn control + candidate into the benchmark rooms, open a ledger
    --watch       poll controllers, record ticks-at-RCL into the ledger
    --report      aggregate ledgers: per-milestone stats + control-vs-candidate delta

  COMMON
    --api <url>              server API (default ${D.api})
    --mongo-container <name> (default ${D.mongoContainer})
    --mongo-db <name>        (default ${D.mongoDb})
    --benchmarks <path>      benchmark set file (default docs/BENCHMARK-ROOMS.json)
    --ledger-dir <path>      ledger directory (default docs/speedrun-ledger)
    --fixture <path>         read the world / poll stream from a JSON fixture
                             instead of the live server (offline testing)
    --json                   machine-readable output where supported
    --help

  --pick
    --slots <n>              benchmark slots (default ${D.slots})
    --composition e:m:h      slots per easy:median:hard band (default ${D.composition.easy}:${D.composition.median}:${D.composition.hard})
    --no-pairs               one room per slot instead of a matched control/candidate pair
    --min-separation <n>     min room-grid distance between any two picked rooms (default ${D.minSeparation})
    --max-pair-distance <n>  twin rooms must match within this feature distance (default 12)
    --pair-warn <n>          flag pairs looser than this in the reasons (default 8)
    --min-owner-distance <n> min distance from any owned room (default ${D.minOwnerDistance})
    --exclude <r1,r2>        rooms to never pick
    --only <r1,r2>           restrict the candidate pool to these rooms
    --out <path>             output file (default --benchmarks)
    --force                  overwrite an existing benchmark file (the set is meant to be FROZEN)
    --provisional            mark the set provisional (world still churning)
    --dump-world <path>      write the raw world snapshot (reusable as a --fixture)
    --dry-run                print the picks, write nothing

  --seed
    --control-user <name>    default ${D.controlUser}
    --candidate-user <name>  default ${D.candidateUser}
    --target-rcl <n>         milestone the run is aiming at (default ${D.targetRcl})
    --tick-budget <n>        give up after this many ticks (default ${D.tickBudget})
    --swap                   control<->candidate room assignment flipped (counterbalancing)
    --slots <ids>            only these slot ids (comma separated)
    --limit <n>              only the first n slots
    --label <text>           what the candidate build is (goes in the ledger)
    --note <text>            free-form ledger note
    --run <runId>            append to / re-seed into an existing ledger
    --wipe --yes             clear the benchmark rooms first (ONLY rooms in the
                             benchmark file, ONLY if unowned or owned by the two
                             benchmark users) so a set can be re-run
    --dry-run                preflight only, no writes

  --watch
    --run <runId>            ledger to watch (default: newest in --ledger-dir)
    --ledger <path>          explicit ledger file
    --interval <sec>         poll interval (default ${D.intervalSec})
    --target-rcl <n>         override the ledger target
    --tick-budget <n>        override the ledger budget
    --max-wall <sec>         also stop after this much wall-clock
    --trace                  append every poll sample to the ledger
    --once                   a single poll, then exit (cron-friendly)

  --report
    --ledger <p1,p2>         explicit ledger files (default: every ledger in --ledger-dir)
    --run <runId,...>        ledgers by run id
    --label <text>           only ledgers with this label
    --target-rcl <n>         only ledgers with this target
    --milestones <2,3,4>     milestones to report (default: the ledgers' own)
    --out <path>             write the aggregate JSON summary here
`;

// ---------------------------------------------------------------- small utils
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function atomicWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp" + process.pid;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function rel(p) {
  return path.relative(REPO, p).split(path.sep).join("/");
}
function nowIso() {
  return new Date().toISOString();
}
function stamp() {
  return nowIso().replace(/[:.]/g, "-").replace(/-\d{3}Z$/, "Z");
}
function round(n, d = 2) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

// --- statistics (sample stddev; empty input never fabricates a value)
function mean(a) {
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
}
function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function stddev(a) {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1));
}
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Game.map.getRoomLinearDistance, offline. */
function roomCoords(name) {
  const m = /^([WE])(\d+)([NS])(\d+)$/.exec(name);
  if (!m) return null;
  return {
    x: m[1] === "W" ? -1 - Number(m[2]) : Number(m[2]),
    y: m[3] === "N" ? -1 - Number(m[4]) : Number(m[4]),
  };
}
function roomDistance(a, b) {
  const p = roomCoords(a);
  const q = roomCoords(b);
  if (!p || !q) return Infinity;
  return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
}

function gitProvenance() {
  const run = (args) => {
    try {
      return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  };
  const status = run(["status", "--porcelain"]);
  return {
    head: run(["rev-parse", "HEAD"]),
    branch: run(["rev-parse", "--abbrev-ref", "HEAD"]),
    dirty: status === null ? null : status.length > 0,
    dirtyFiles: status ? status.split(/\r?\n/).length : 0,
  };
}

// ---------------------------------------------------------------- mongo glue
let mongoSeq = 0;
function makeMongo(opts) {
  return function mongo(script) {
    const marker = "__RACE_RESULT__";
    const body = `db = db.getSiblingDB(${JSON.stringify(opts.mongoDb)});
function emit(v) { print(${JSON.stringify(marker)} + JSON.stringify(v)); }
${script}
`;
    const local = path.join(os.tmpdir(), `race-${process.pid}-${mongoSeq++}.js`);
    const remote = `/tmp/${path.basename(local)}`;
    fs.writeFileSync(local, body);
    try {
      execSync(`docker cp "${local}" ${opts.mongoContainer}:${remote}`, { stdio: "pipe" });
      const raw = execSync(
        `docker exec ${opts.mongoContainer} mongosh --quiet --file ${remote}`,
        { encoding: "utf8", maxBuffer: 512e6 },
      );
      const line = raw.split(/\r?\n/).find((l) => l.startsWith(marker));
      if (!line) throw new Error("mongo script produced no result:\n" + raw.slice(0, 1200));
      return JSON.parse(line.slice(marker.length));
    } finally {
      try {
        fs.unlinkSync(local);
      } catch {}
    }
  };
}

// ---------------------------------------------------------------- api glue
function makeApi(opts) {
  async function get(endpoint) {
    const res = await fetch(opts.api + endpoint, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`GET ${endpoint} -> ${res.status}`);
    return res.json();
  }
  return {
    get,
    async gameTime() {
      const j = await get("/api/game/time");
      if (typeof j.time !== "number") throw new Error("/api/game/time returned no time");
      return j.time;
    },
    /** controller level + owner for one room, straight from the API (no auth needed) */
    async controller(room) {
      const j = await get(`/api/game/room-objects?room=${room}&shard=${opts.shard}`);
      const objs = j.objects || [];
      const c = objs.find((o) => o.type === "controller");
      const spawns = objs.filter((o) => o.type === "spawn");
      const creeps = objs.filter((o) => o.type === "creep");
      return {
        room,
        exists: !!c,
        level: c ? c.level || 0 : 0,
        user: c && c.user ? String(c.user) : null,
        progress: c && typeof c.progress === "number" ? c.progress : null,
        spawns: spawns.length,
        creeps: creeps.length,
      };
    },
  };
}

/** map a screeps user _id -> username, from mongo (ids are strings in objects) */
function userIndex(users) {
  const byId = new Map();
  const byName = new Map();
  for (const u of users) {
    byId.set(String(u.id), u.username);
    byName.set(String(u.username).toLowerCase(), u);
  }
  return { byId, byName };
}

// ---------------------------------------------------------------- world snapshot
/**
 * Snapshot shape (identical whether it came from mongo or a --fixture):
 *   { source, gameTime, users[], rooms[], ownedRooms[], claimedRooms[],
 *     candidates[{room,terrain,objects[]}] }
 * `candidates` = normal, non-SK, no user-owned object, controller + exactly 2 sources.
 *
 * TWO notions of "taken", deliberately kept apart:
 *   ownedRooms   — any room holding *any* user object. That includes a scout
 *                  standing in an empty room for one tick, a remote-road
 *                  construction site and a tombstone, so it churns every tick
 *                  and is only safe as a *pick-time* room filter (it mirrors
 *                  spawn-in.mjs, which refuses a room containing any user
 *                  object).
 *   claimedRooms — rooms whose CONTROLLER has an owner: real bases and invader
 *                  strongholds. This is the durable notion, and the only one
 *                  --min-owner-distance may use: keeping a frozen benchmark
 *                  set 2 rooms clear of a live base is the intent, whereas
 *                  keeping it clear of wherever a creep happened to be walking
 *                  makes the freeze non-reproducible and starves the pool
 *                  (measured on this server: 12 claimed vs 38 "occupied" rooms
 *                  shrank the candidate pool from 134 to 55 and blew matched
 *                  pair distances out from ~5 to ~21).
 */
async function loadWorld(opts) {
  if (opts.fixture) {
    const fx = readJson(opts.fixture);
    if (!fx.world) die(`fixture ${opts.fixture} has no "world" key`);
    const w = { ...fx.world, source: `fixture:${rel(path.resolve(opts.fixture))}` };
    // older fixtures predate claimedRooms — fall back to the conservative set
    if (!Array.isArray(w.claimedRooms)) w.claimedRooms = w.ownedRooms || [];
    return w;
  }
  const mongo = makeMongo(opts);
  const snap = mongo(`
var users = db.users.find({}, {username:1, active:1, rooms:1}).toArray().map(function (u) {
  return {id: String(u._id), username: u.username, active: u.active || 0, rooms: u.rooms || []};
});
var ownedRooms = db["rooms.objects"].distinct("room", {user: {$ne: null}}).sort();
var owned = {}; ownedRooms.forEach(function (r) { owned[r] = true; });
// durable ownership: a controller with an owner (player base or invader stronghold)
var claimedRooms = db["rooms.objects"].distinct("room", {type: "controller", user: {$ne: null}}).sort();

var roomDocs = db.rooms.find({}, {status:1, bus:1, sourceKeepers:1}).toArray().map(function (r) {
  return {room: r._id, status: r.status, bus: !!r.bus, sourceKeepers: !!r.sourceKeepers};
});

var byRoom = {};
db["rooms.objects"].find({type: {$in: ["source","controller","mineral","keeperLair"]}},
                         {room:1,type:1,x:1,y:1,user:1,level:1,mineralType:1,reservation:1})
  .forEach(function (o) {
    (byRoom[o.room] = byRoom[o.room] || []).push({
      type: o.type, x: o.x, y: o.y,
      user: o.user ? String(o.user) : null,
      level: o.level === undefined ? null : o.level,
      mineralType: o.mineralType || null,
      reserved: !!o.reservation
    });
  });

var candidateNames = [];
roomDocs.forEach(function (rd) {
  if (rd.status !== "normal" || rd.sourceKeepers) return;
  if (owned[rd.room]) return;
  var objs = byRoom[rd.room] || [];
  var ctrl = objs.filter(function (o) { return o.type === "controller"; });
  var src = objs.filter(function (o) { return o.type === "source"; });
  if (ctrl.length !== 1 || src.length !== 2) return;
  if (ctrl[0].user || ctrl[0].reserved) return;
  candidateNames.push(rd.room);
});
candidateNames.sort();

var terrain = {};
db["rooms.terrain"].find({room: {$in: candidateNames}}, {room:1, terrain:1}).forEach(function (t) {
  terrain[t.room] = t.terrain;
});

var candidates = [];
candidateNames.forEach(function (r) {
  if (!terrain[r]) return;               // no terrain doc -> unusable
  candidates.push({room: r, terrain: terrain[r], objects: byRoom[r] || []});
});

emit({users: users, ownedRooms: ownedRooms, claimedRooms: claimedRooms, rooms: roomDocs, candidates: candidates});
`);
  let gameTime = null;
  try {
    gameTime = await makeApi(opts).gameTime();
  } catch (e) {
    warn(`could not read ${opts.api}/api/game/time (${e.message}); gameTime unknown`);
  }
  return { ...snap, gameTime, source: "mongo" };
}

// ---------------------------------------------------------------- terrain analysis
const W = 50;
const IDX = (x, y) => y * W + x;

function walkMask(terrain) {
  const walk = new Uint8Array(2500);
  for (let i = 0; i < 2500; i++) walk[i] = (terrain.charCodeAt(i) - 48) & 1 ? 0 : 1;
  return walk;
}
function swampMask(terrain) {
  const sw = new Uint8Array(2500);
  for (let i = 0; i < 2500; i++) {
    const c = terrain.charCodeAt(i) - 48;
    sw[i] = !(c & 1) && c & 2 ? 1 : 0;
  }
  return sw;
}

/** 8-directional BFS (uniform cost) from the given tiles; -1 = unreachable. */
function bfs(walk, starts) {
  const dist = new Int32Array(2500).fill(-1);
  const q = new Int32Array(2500);
  let head = 0;
  let tail = 0;
  for (const s of starts) {
    if (dist[s] < 0) {
      dist[s] = 0;
      q[tail++] = s;
    }
  }
  while (head < tail) {
    const i = q[head++];
    const x = i % W;
    const y = (i - x) / W;
    const d = dist[i] + 1;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny > 49) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        if (nx < 0 || nx > 49) continue;
        const j = IDX(nx, ny);
        if (!walk[j] || dist[j] >= 0) continue;
        dist[j] = d;
        q[tail++] = j;
      }
    }
  }
  return dist;
}

/** Chebyshev distance transform; walls and the room edge are 0. */
function chebyshevDT(walk) {
  const dt = new Int32Array(2500);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = IDX(x, y);
      dt[i] = walk[i] && x > 0 && x < 49 && y > 0 && y < 49 ? 9999 : 0;
    }
  }
  for (let y = 1; y < 49; y++) {
    for (let x = 1; x < 49; x++) {
      const i = IDX(x, y);
      if (!dt[i]) continue;
      dt[i] = 1 + Math.min(dt[IDX(x - 1, y)], dt[IDX(x - 1, y - 1)], dt[IDX(x, y - 1)], dt[IDX(x + 1, y - 1)]);
    }
  }
  for (let y = 48; y >= 1; y--) {
    for (let x = 48; x >= 1; x--) {
      const i = IDX(x, y);
      if (!dt[i]) continue;
      dt[i] = Math.min(
        dt[i],
        1 + Math.min(dt[IDX(x + 1, y)], dt[IDX(x + 1, y + 1)], dt[IDX(x, y + 1)], dt[IDX(x - 1, y + 1)]),
      );
    }
  }
  return dt;
}

function freeNeighbours(walk, x, y) {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
      if (walk[IDX(nx, ny)]) n++;
    }
  }
  return n;
}

/**
 * Room profile used for both the pick criteria and the pair matching.
 * `anchor` is a cheap stand-in for where the base lands: the most central
 * buildable tile (dt >= 2) minimising walking distance to both sources plus
 * the controller. It is NOT the planner's hub — it only has to rank rooms
 * consistently, which it does without pulling the planner into the harness.
 *
 * Sources / controller / mineral are impassable, so they are cut out of the
 * navigation mask and distances are measured from the tiles a creep can
 * actually stand on to work them (0 = the anchor is already in range 1).
 */
function profileRoom(cand) {
  const { room, terrain, objects } = cand;
  const walk = walkMask(terrain);
  const swamp = swampMask(terrain);
  const sources = objects.filter((o) => o.type === "source").sort((a, b) => a.y - b.y || a.x - b.x);
  const controller = objects.find((o) => o.type === "controller");
  const mineral = objects.find((o) => o.type === "mineral");
  if (!controller || sources.length !== 2) return { room, error: "needs 1 controller + 2 sources" };

  const nav = Uint8Array.from(walk);
  for (const o of objects) {
    if (["source", "controller", "mineral", "keeperLair"].includes(o.type)) nav[IDX(o.x, o.y)] = 0;
  }

  let buildable = 0;
  let swampTiles = 0;
  for (let y = 1; y < 49; y++) {
    for (let x = 1; x < 49; x++) {
      const i = IDX(x, y);
      if (walk[i]) buildable++;
      if (swamp[i]) swampTiles++;
    }
  }
  const openPct = buildable / (48 * 48);
  const swampPct = buildable ? swampTiles / buildable : 0;

  const dt = chebyshevDT(nav);
  let dtMax = 0;
  for (let i = 0; i < 2500; i++) if (dt[i] > dtMax) dtMax = dt[i];

  /** BFS from every tile a creep can work `o` from; -1 where unreachable. */
  const workDist = (o) => {
    const starts = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = o.x + dx;
        const ny = o.y + dy;
        if (nx < 1 || nx > 48 || ny < 1 || ny > 48) continue;
        if (nav[IDX(nx, ny)]) starts.push(IDX(nx, ny));
      }
    }
    return starts.length ? bfs(nav, starts) : null;
  };
  const srcMaps = sources.map(workDist);
  const ctrlMap = workDist(controller);
  if (srcMaps.some((m) => !m) || !ctrlMap) return { room, error: "a source or the controller has no free working tile" };

  // A hub needs a clear 5x5 (dt >= 3). Rooms that cannot offer one anywhere fall
  // back to dt >= 2 and are flagged `cramped` — that is a real benchmark trait.
  let anchor = null;
  let cramped = false;
  for (const minDt of [3, 2]) {
    let bestScore = Infinity;
    for (let y = 2; y < 48; y++) {
      for (let x = 2; x < 48; x++) {
        const i = IDX(x, y);
        if (dt[i] < minDt) continue;
        const a = srcMaps[0][i];
        const b = srcMaps[1][i];
        const c = ctrlMap[i];
        if (a < 0 || b < 0 || c < 0) continue;
        const score = a + b + c;
        if (score < bestScore || (score === bestScore && anchor && dt[i] > anchor.dt)) {
          bestScore = score;
          anchor = { x, y, dt: dt[i] };
        }
      }
    }
    if (anchor) {
      cramped = minDt === 2;
      break;
    }
  }
  if (!anchor) return { room, error: "no anchor tile with dt>=2 reachable from sources+controller" };

  // how much room the base has to GROW around the anchor — this, not the single
  // anchor tile, is the "enclosed vs open" axis the campaign asks to span
  let anchorSpace = 0;
  for (let y = Math.max(1, anchor.y - 5); y <= Math.min(48, anchor.y + 5); y++) {
    for (let x = Math.max(1, anchor.x - 5); x <= Math.min(48, anchor.x + 5); x++) {
      const i = IDX(x, y);
      if (dt[i] > anchorSpace) anchorSpace = dt[i];
    }
  }
  anchor.space = anchorSpace;
  anchor.cramped = cramped;

  const ai = IDX(anchor.x, anchor.y);
  const srcSteps = [srcMaps[0][ai], srcMaps[1][ai]].sort((a, b) => a - b);
  const ctrlSteps = ctrlMap[ai];
  const sourceFree = sources.map((s) => freeNeighbours(nav, s.x, s.y));
  const ctrlFree = freeNeighbours(nav, controller.x, controller.y);

  let exits = 0;
  for (let x = 0; x < W; x++) {
    if (walk[IDX(x, 0)]) exits++;
    if (walk[IDX(x, 49)]) exits++;
  }
  for (let y = 0; y < W; y++) {
    if (walk[IDX(0, y)]) exits++;
    if (walk[IDX(49, y)]) exits++;
  }

  return {
    room,
    terrainHash: djb2(terrain),
    sources: sources.map((s, i) => ({ x: s.x, y: s.y, freeTiles: sourceFree[i] })),
    controller: { x: controller.x, y: controller.y, freeTiles: ctrlFree },
    mineral: mineral ? mineral.mineralType : null,
    anchor,
    srcSteps,
    srcStepsSum: srcSteps[0] + srcSteps[1],
    srcStepsSpread: srcSteps[1] - srcSteps[0],
    ctrlSteps,
    minSourceFree: Math.min(...sourceFree),
    openPct: round(openPct, 4),
    swampPct: round(swampPct, 4),
    dtMax,
    exitTiles: exits,
  };
}

/** enclosure of the base site: biggest clear block within 5 tiles of the anchor */
function anchorType(space) {
  if (space >= 6) return "open";
  if (space >= 4) return "semi";
  return "enclosed";
}
function sourceBand(minFree) {
  if (minFree <= 2) return "enclosed";
  if (minFree <= 4) return "tight";
  return "open";
}

// ---------------------------------------------------------------- mode: --pick
async function modePick(opts, flags) {
  const outFile = flags.out ? path.resolve(String(flags.out)) : opts.benchmarks;
  const dryRun = !!flags["dry-run"];
  const force = !!flags.force;
  const usePairs = !flags["no-pairs"];
  const slots = num(flags.slots, D.slots);
  const minSep = num(flags["min-separation"], D.minSeparation);
  const minOwnerDist = num(flags["min-owner-distance"], D.minOwnerDistance);
  const exclude = new Set(list(flags.exclude));
  const only = new Set(list(flags.only));

  let composition = { ...D.composition };
  if (flags.composition && flags.composition !== true) {
    const parts = String(flags.composition).split(":").map(Number);
    if (parts.length !== 3 || parts.some((p) => !Number.isFinite(p) || p < 0))
      die("--composition wants easy:median:hard, e.g. 2:3:3");
    composition = { easy: parts[0], median: parts[1], hard: parts[2] };
  }
  const compTotal = composition.easy + composition.median + composition.hard;
  if (flags.slots === undefined) {
    // slots follows the composition unless explicitly overridden
  } else if (compTotal !== slots) {
    die(`--slots ${slots} does not match --composition total ${compTotal}`);
  }
  const wantSlots = flags.slots === undefined ? compTotal : slots;

  if (!dryRun && fs.existsSync(outFile) && !force)
    die(
      `${rel(outFile)} already exists — the benchmark set is meant to be FROZEN.\n` +
        `  Re-pick deliberately with --force, or inspect it with --dry-run.`,
    );

  const world = await loadWorld(opts);
  if (flags["dump-world"]) {
    const p = path.resolve(String(flags["dump-world"]));
    atomicWrite(p, JSON.stringify({ world }, null, 1));
    console.log(`world snapshot -> ${rel(p)} (${world.candidates.length} candidate rooms)`);
  }

  const normalRooms = world.rooms.filter((r) => r.status === "normal").length;
  const claimedRooms = world.claimedRooms || world.ownedRooms;
  console.log(
    `world       : ${world.source} · tick ${world.gameTime ?? "?"} · ${normalRooms} normal rooms · ` +
      `${claimedRooms.length} claimed (${world.ownedRooms.length} hold some user object) · ` +
      `${world.candidates.length} free 2-source rooms`,
  );

  // ---- profile every candidate
  const rejected = [];
  let pool = [];
  for (const cand of world.candidates) {
    if (only.size && !only.has(cand.room)) continue;
    if (exclude.has(cand.room)) {
      rejected.push({ room: cand.room, why: "excluded" });
      continue;
    }
    // distance is measured against CLAIMED rooms only (owned controllers), never
    // against transient creeps/sites — see loadWorld() for why
    const nearOwner = claimedRooms.reduce(
      (m, r) => Math.min(m, roomDistance(cand.room, r)),
      Infinity,
    );
    if (nearOwner < minOwnerDist) {
      rejected.push({ room: cand.room, why: `only ${nearOwner} rooms from a claimed room` });
      continue;
    }
    const p = profileRoom(cand);
    if (p.error) {
      rejected.push({ room: cand.room, why: p.error });
      continue;
    }
    p.nearestOwnedDistance = nearOwner === Infinity ? null : nearOwner;
    pool.push(p);
  }
  pool.sort((a, b) => (a.room < b.room ? -1 : 1));
  if (pool.length < wantSlots * (usePairs ? 2 : 1))
    die(
      `only ${pool.length} usable candidate rooms for ${wantSlots} ${usePairs ? "pairs" : "slots"} ` +
        `(rejected ${rejected.length}); relax --min-owner-distance or reduce --slots`,
    );

  // ---- hardness: weighted z-scores across the pool
  const metricOf = {
    srcStepsSum: (p) => p.srcStepsSum,
    ctrlSteps: (p) => p.ctrlSteps,
    swampPct: (p) => p.swampPct,
    negOpenPct: (p) => -p.openPct,
    negMinSourceFree: (p) => -p.minSourceFree,
  };
  const zStats = {};
  for (const key of Object.keys(metricOf)) {
    const vals = pool.map(metricOf[key]);
    const mu = mean(vals);
    const sd = stddev(vals) || 1;
    zStats[key] = { mean: round(mu, 4), sd: round(sd, 4) };
  }
  for (const p of pool) {
    let h = 0;
    const z = {};
    for (const [key, w] of Object.entries(HARDNESS_WEIGHTS)) {
      const v = (metricOf[key](p) - zStats[key].mean) / zStats[key].sd;
      z[key] = round(v, 3);
      h += w * v;
    }
    p.z = z;
    p.hardness = round(h, 4);
  }

  const hardSorted = pool.map((p) => p.hardness).sort((a, b) => a - b);
  const cut = { easy: quantile(hardSorted, 1 / 3), hard: quantile(hardSorted, 2 / 3) };
  const ctrlSorted = pool.map((p) => p.ctrlSteps).sort((a, b) => a - b);
  const ctrlCut = { near: quantile(ctrlSorted, 1 / 3), far: quantile(ctrlSorted, 2 / 3) };
  for (const p of pool) {
    p.band = p.hardness <= cut.easy ? "easy" : p.hardness >= cut.hard ? "hard" : "median";
    p.ctrlBand = p.ctrlSteps <= ctrlCut.near ? "near" : p.ctrlSteps >= ctrlCut.far ? "far" : "mid";
    p.anchorType = anchorType(p.anchor.space);
    p.sourceBand = sourceBand(p.minSourceFree);
    p.tuple = `${p.anchorType}/${p.ctrlBand}/${p.sourceBand}`;
  }

  const bandMedian = {};
  for (const band of ["easy", "median", "hard"]) {
    bandMedian[band] = median(pool.filter((p) => p.band === band).map((p) => p.hardness));
  }

  // ---- selection, deterministic and greedy per band:
  //      pairs are chosen JOINTLY (best-matched twin rooms), then ranked by how
  //      much new attribute coverage they add — matching quality is what keeps
  //      the simultaneous control/candidate comparison fair, so it outranks
  //      picking the single "most representative" room.
  const featureDistance = (a, b) =>
    Math.abs(a.srcStepsSum - b.srcStepsSum) +
    Math.abs(a.ctrlSteps - b.ctrlSteps) +
    40 * Math.abs(a.swampPct - b.swampPct) +
    40 * Math.abs(a.openPct - b.openPct) +
    2 * Math.abs(a.anchor.dt - b.anchor.dt) +
    1.5 * Math.abs(a.anchor.space - b.anchor.space) +
    Math.abs(a.minSourceFree - b.minSourceFree);
  const pairWarnAt = num(flags["pair-warn"], 8);
  const maxPairDistance = num(flags["max-pair-distance"], 12);

  const used = new Set();
  const tupleSeen = new Map();
  const picked = [];
  const separationOk = (room) => {
    for (const r of used) if (roomDistance(room, r) < minSep) return false;
    return true;
  };
  const order = ["hard", "median", "easy"]; // hardest first — they are the scarcest
  for (const band of order) {
    for (let k = 0; k < composition[band]; k++) {
      const avail = pool.filter((p) => p.band === band && !used.has(p.room) && separationOk(p.room));
      if (!avail.length) {
        warn(`no room left in band "${band}" for slot ${k + 1}/${composition[band]}`);
        continue;
      }
      let best = null;
      if (usePairs) {
        const all = [];
        for (let i = 0; i < avail.length; i++) {
          for (let j = i + 1; j < avail.length; j++) {
            const a = avail[i];
            const b = avail[j];
            if (roomDistance(a.room, b.room) < minSep) continue;
            all.push({
              a,
              b,
              d: featureDistance(a, b),
              // how well-covered the LESS covered of the two attribute tuples is
              cover: Math.min(tupleSeen.get(a.tuple) || 0, tupleSeen.get(b.tuple) || 0),
              rep: Math.abs((a.hardness + b.hardness) / 2 - bandMedian[band]),
            });
          }
        }
        // attribute coverage must never buy a badly-matched pair: only pairs
        // inside the match budget compete on coverage, the rest are a fallback
        const inBudget = all.filter((c) => c.d <= maxPairDistance);
        for (const cand of inBudget.length ? inBudget : all) {
          if (
            !best ||
            cand.cover < best.cover ||
            (cand.cover === best.cover && cand.d < best.d) ||
            (cand.cover === best.cover && cand.d === best.d && cand.rep < best.rep) ||
            (cand.cover === best.cover && cand.d === best.d && cand.rep === best.rep && cand.a.room < best.a.room)
          )
            best = cand;
        }
        if (!best) die(`no valid room pair left in band "${band}" — relax --min-separation or --slots`);
      } else {
        const sorted = [...avail].sort((a, b) => {
          const ta = tupleSeen.get(a.tuple) || 0;
          const tb = tupleSeen.get(b.tuple) || 0;
          if (ta !== tb) return ta - tb;
          const da = Math.abs(a.hardness - bandMedian[band]);
          const db = Math.abs(b.hardness - bandMedian[band]);
          if (da !== db) return da - db;
          return a.room < b.room ? -1 : 1;
        });
        best = { a: sorted[0], b: null, d: null };
      }
      used.add(best.a.room);
      tupleSeen.set(best.a.tuple, (tupleSeen.get(best.a.tuple) || 0) + 1);
      if (best.b) {
        used.add(best.b.room);
        tupleSeen.set(best.b.tuple, (tupleSeen.get(best.b.tuple) || 0) + 1);
      }
      picked.push({
        band,
        primary: best.a,
        partner: best.b,
        pairDistance: best.d === null ? null : round(best.d, 3),
      });
    }
  }
  if (picked.length !== wantSlots) warn(`picked ${picked.length} slots, wanted ${wantSlots}`);

  // ---- build the output document
  const describe = (p) =>
    [
      `${p.band} band (hardness ${p.hardness >= 0 ? "+" : ""}${p.hardness}σ)`,
      `sources ${p.srcSteps[0]}+${p.srcSteps[1]} steps from the anchor`,
      `controller ${p.ctrlSteps} steps (${p.ctrlBand})`,
      `${p.anchorType} anchor (dt ${p.anchor.dt}, ${p.anchor.space} tiles of headroom${p.anchor.cramped ? ", no clear 5x5 anywhere" : ""})`,
      `tightest source has ${p.minSourceFree} free tiles (${p.sourceBand})`,
      `${Math.round(p.openPct * 100)}% buildable, ${Math.round(p.swampPct * 100)}% swamp`,
    ].join("; ");

  const slotDocs = picked.map((s, i) => {
    const id = `B${i + 1}`;
    const a = s.primary;
    const b = s.partner;
    const rooms = b ? { control: a.room, candidate: b.room } : { control: a.room, candidate: a.room };
    const profiles = {};
    for (const p of b ? [a, b] : [a]) profiles[p.room] = p;
    let reason =
      `${a.room}: ${describe(a)}. ` +
      `Picked to cover ${a.tuple} in the ${s.band} band` +
      (b
        ? `; paired with ${b.room} (${describe(b)}) — feature distance ${s.pairDistance}, ` +
          `so control and candidate race near-equivalent rooms at the same time.`
        : `.`);
    const pairWarning =
      b && s.pairDistance > pairWarnAt
        ? `pair distance ${s.pairDistance} > ${pairWarnAt} — the twin rooms are only loosely matched, counterbalance with --swap`
        : null;
    if (pairWarning) reason += ` WARNING: ${pairWarning}`;
    return {
      id,
      band: s.band,
      attributes: { anchorType: a.anchorType, controller: a.ctrlBand, sources: a.sourceBand },
      rooms,
      paired: !!b,
      pairDistance: s.pairDistance,
      pairWarning,
      reason,
      profiles,
    };
  });

  const setHash = djb2(
    slotDocs
      .map((s) => `${s.id}:${s.rooms.control}:${s.rooms.candidate}:` +
        Object.values(s.profiles).map((p) => p.terrainHash).sort().join("+"))
      .join("|"),
  );

  const doc = {
    schemaVersion: 1,
    generatedAt: nowIso(),
    generatedBy: "tools/server/race.mjs --pick",
    provisional: !!flags.provisional,
    frozen: !flags.provisional,
    setHash,
    world: {
      source: world.source,
      gameTime: world.gameTime ?? null,
      normalRooms,
      claimedRooms: claimedRooms.length,
      occupiedRooms: world.ownedRooms.length,
      candidatePool: pool.length,
      rejectedCandidates: rejected.length,
      claimedRoomsAtPick: claimedRooms,
      ownedRoomsAtPick: world.ownedRooms,
    },
    users: { control: opts.controlUser, candidate: opts.candidateUser },
    criteria: {
      required: [
        "room status normal, not a source-keeper room",
        "exactly 2 sources + an unowned, unreserved controller",
        "no user-owned object in the room at pick time",
        `at least ${minOwnerDist} rooms from any CLAIMED room (a controller with an owner: ` +
          `player base or invader stronghold). Transient occupancy — a creep walking through, ` +
          `a remote-road construction site, a tombstone — is deliberately NOT counted: it ` +
          `changes every tick, so counting it would make this frozen set unreproducible.`,
        `at least ${minSep} rooms from every other benchmark room`,
      ],
      hardnessWeights: HARDNESS_WEIGHTS,
      hardnessNote:
        "weighted sum of z-scores over the candidate pool; higher = harder. " +
        "srcStepsSum/ctrlSteps are 8-directional uniform-cost BFS step counts from the " +
        "anchor tile (most central buildable tile, dt>=2, minimising sources+controller distance).",
      zStats,
      bandCutoffs: { easy: round(cut.easy, 4), hard: round(cut.hard, 4) },
      controllerBandCutoffs: { near: round(ctrlCut.near, 2), far: round(ctrlCut.far, 2) },
      anchorTypes: { open: "anchor headroom >=6", semi: "4-5", enclosed: "<=3", note: "headroom = largest clear block within 5 tiles of the anchor" },
      sourceBands: { enclosed: "min free tiles <=2", tight: "3-4", open: ">=5" },
      composition,
      pairing: usePairs
        ? "each slot is a matched pair: control and candidate race simultaneously in " +
          "near-equivalent rooms (two users cannot own the same room). Counterbalance " +
          "pair bias by running half the runs with --swap."
        : "single room per slot — control and candidate must alternate across runs",
    },
    slots: slotDocs,
  };

  // ---- print
  console.log(
    `pool        : ${pool.length} profiled, ${rejected.length} rejected · ` +
      `hardness cuts easy<=${round(cut.easy, 2)} hard>=${round(cut.hard, 2)}`,
  );
  console.log("");
  console.log("slot band    room     side       src  ctrl  anchor      srcFree  swamp   open  pairD");
  for (const s of slotDocs) {
    for (const [side, room] of Object.entries(s.rooms)) {
      if (side === "candidate" && !s.paired) continue;
      const p = s.profiles[room];
      console.log(
        `${(side === "control" ? s.id : "").padEnd(4)} ${(side === "control" ? s.band : "").padEnd(7)} ` +
          `${room.padEnd(8)} ${side.padEnd(10)} ${String(p.srcStepsSum).padStart(3)} ${String(p.ctrlSteps).padStart(5)}  ` +
          `${(p.anchorType + " " + p.anchor.dt + "/" + p.anchor.space).padEnd(11)} ${String(p.minSourceFree).padStart(7)} ` +
          `${String(Math.round(p.swampPct * 100) + "%").padStart(6)} ${String(Math.round(p.openPct * 100) + "%").padStart(6)} ` +
          `${side === "control" && s.pairDistance !== null ? String(s.pairDistance).padStart(6) : ""}`,
      );
    }
  }
  console.log("");
  for (const s of slotDocs) console.log(`${s.id}  ${s.reason}`);

  if (dryRun) {
    console.log(`\n--dry-run: ${rel(outFile)} not written.`);
    return;
  }
  atomicWrite(outFile, JSON.stringify(doc, null, 2) + "\n");
  console.log(`\nwrote ${rel(outFile)} — setHash ${setHash}${doc.provisional ? " (PROVISIONAL)" : ""}`);
}

// ---------------------------------------------------------------- ledger helpers
function ledgerPath(opts, runId) {
  return path.join(opts.ledgerDir, `${runId}.json`);
}
function listLedgers(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^run-.*\.json$/.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}
function newestLedger(dir) {
  const all = listLedgers(dir);
  return all.length ? all[all.length - 1] : null;
}
function saveLedger(file, ledger) {
  ledger.updatedAt = nowIso();
  atomicWrite(file, JSON.stringify(ledger, null, 2) + "\n");
}

// ---------------------------------------------------------------- mode: --seed
async function modeSeed(opts, flags) {
  const dryRun = !!flags["dry-run"];
  const swap = !!flags.swap;
  const targetRcl = num(flags["target-rcl"], D.targetRcl);
  const tickBudget = num(flags["tick-budget"], D.tickBudget);
  const onlySlots = new Set(list(flags.slots));
  const limit = flags.limit === undefined ? Infinity : num(flags.limit, Infinity);
  const label = flags.label && flags.label !== true ? String(flags.label) : "";
  const note = flags.note && flags.note !== true ? String(flags.note) : "";
  const wipe = !!flags.wipe;

  if (!fs.existsSync(opts.benchmarks))
    die(`no benchmark set at ${rel(opts.benchmarks)} — run: race.mjs --pick`);
  const bench = readJson(opts.benchmarks);
  if (bench.schemaVersion !== 1) die(`benchmark file schemaVersion ${bench.schemaVersion} unsupported`);

  let chosen = bench.slots.filter((s) => !onlySlots.size || onlySlots.has(s.id));
  chosen = chosen.slice(0, limit === Infinity ? undefined : limit);
  if (!chosen.length) die("no slots selected");

  const api = makeApi(opts);
  const world = await loadWorld(opts);
  const uidx = userIndex(world.users);
  const control = uidx.byName.get(opts.controlUser.toLowerCase());
  const candidate = uidx.byName.get(opts.candidateUser.toLowerCase());
  if (!control)
    die(
      `control user "${opts.controlUser}" does not exist on the server.\n` +
        `  Users: ${world.users.map((u) => u.username).join(", ")}`,
    );
  if (!candidate) die(`candidate user "${opts.candidateUser}" does not exist on the server`);
  if (control.id === candidate.id) die("control and candidate resolve to the same user");

  // ---- preflight ------------------------------------------------------
  const plansExist = fs.existsSync(opts.plans);
  const plans = plansExist ? readJson(opts.plans) : [];
  const plannedRooms = new Set(
    (Array.isArray(plans) ? plans : plans.plans || [])
      .filter((p) => p && p.structures && (p.structures.spawn || []).length)
      .map((p) => p.room),
  );
  const freeRooms = new Set(world.candidates.map((c) => c.room));
  const terrainHash = new Map(world.candidates.map((c) => [c.room, djb2(c.terrain)]));

  const jobs = [];
  const problems = [];
  for (const slot of chosen) {
    const sides = [
      { side: "control", user: control, room: swap ? slot.rooms.candidate : slot.rooms.control },
      { side: "candidate", user: candidate, room: swap ? slot.rooms.control : slot.rooms.candidate },
    ];
    if (!slot.paired) {
      // one room per slot: only one side can run at a time
      sides.length = 1;
      sides[0].room = slot.rooms.control;
      warn(`slot ${slot.id} is unpaired — only the control side can be seeded this run`);
    }
    for (const s of sides) {
      const p = (slot.profiles && slot.profiles[s.room]) || null;
      if (!plannedRooms.has(s.room)) problems.push(`${s.room}: no spawn plan in ${rel(opts.plans)}`);
      if (!freeRooms.has(s.room)) problems.push(`${s.room}: not free (owned / reserved / wrong shape) right now`);
      if (p && p.terrainHash && terrainHash.has(s.room) && terrainHash.get(s.room) !== p.terrainHash)
        problems.push(`${s.room}: terrain changed since --pick (${p.terrainHash} -> ${terrainHash.get(s.room)})`);
      jobs.push({ slot: slot.id, band: slot.band, side: s.side, user: s.user, room: s.room, profile: p });
    }
  }
  if (!plansExist)
    problems.push(
      `plans file missing: ${rel(opts.plans)} — run: fnm exec --using 22 node tools/plan-suite/v2/plan.mjs --all-claimable`,
    );

  console.log(`benchmarks  : ${rel(opts.benchmarks)} setHash ${bench.setHash}${bench.provisional ? " (PROVISIONAL)" : ""}`);
  console.log(`users       : control=${control.username} candidate=${candidate.username}${swap ? " (SWAPPED rooms)" : ""}`);
  console.log(`target      : RCL${targetRcl}, tick budget ${tickBudget}`);
  console.log(`slots       : ${chosen.map((s) => s.id).join(", ")} (${jobs.length} seeds)`);
  if (problems.length) {
    console.log("\npreflight problems:");
    for (const p of problems) console.log("  - " + p);
    if (wipe) console.log("  (--wipe may clear some of these; wipe runs before seeding)");
  }

  if (wipe) {
    if (!flags.yes) die("--wipe is destructive: re-run with --wipe --yes");
    const rooms = [...new Set(jobs.map((j) => j.room))].sort();
    const allowedUsers = [String(control.id), String(candidate.id)];
    console.log(`\nwipe        : ${rooms.join(", ")}`);
    if (dryRun) {
      console.log("  --dry-run: nothing wiped.");
    } else {
      const mongo = makeMongo(opts);
      const res = mongo(`
var rooms = ${JSON.stringify(rooms)};
var allowed = ${JSON.stringify(allowedUsers)};
var out = [];
rooms.forEach(function (r) {
  var foreign = db["rooms.objects"].find({room: r, user: {$nin: allowed.concat([null])}}).toArray()
    .filter(function (o) { return o.user; });
  if (foreign.length) { out.push({room: r, skipped: "owned by a non-benchmark user"}); return; }
  var del = db["rooms.objects"].deleteMany({room: r, user: {$in: allowed}});
  var ctrl = db["rooms.objects"].updateOne({room: r, type: "controller"},
    {$set: {level: 0, progress: 0, progressTotal: 0},
     $unset: {user: "", downgradeTime: "", ticksToDowngrade: "", reservation: "", sign: "",
              safeMode: "", safeModeCooldown: "", safeModeAvailable: "", upgradeBlocked: "", isPowerEnabled: ""}});
  db.rooms.updateOne({_id: r}, {$set: {active: false}});
  allowed.forEach(function (u) { db.users.updateOne({_id: u}, {$pull: {rooms: r}}); });
  out.push({room: r, deleted: del.deletedCount, controllerReset: ctrl.modifiedCount});
});
emit(out);
`);
      for (const r of res) console.log(`  ${r.room}: ${r.skipped ? "SKIPPED (" + r.skipped + ")" : `${r.deleted} objects removed, controller reset`}`);
      warn(
        `room memory inside each bot still holds the old room. Clear it in the game console, e.g.\n` +
          `        ${rooms.map((r) => `delete Memory.rooms["${r}"]`).join("; ")}; resetSpeedrun()`,
      );
    }
  }

  if (problems.length && !dryRun && !flags.force)
    die("preflight failed — fix the problems above, or re-run with --force to seed anyway");

  const runId = flags.run && flags.run !== true ? String(flags.run) : `run-${stamp()}`;
  const file = ledgerPath(opts, runId);
  let ledger;
  if (fs.existsSync(file)) {
    ledger = readJson(file);
    console.log(`\nledger      : appending to ${rel(file)} (${ledger.entries.length} existing entries)`);
  } else {
    ledger = {
      schemaVersion: 1,
      runId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      label,
      note,
      targetRcl,
      milestones: D.milestones,
      tickBudget,
      swap,
      api: opts.api,
      benchmarks: {
        path: rel(opts.benchmarks),
        setHash: bench.setHash,
        generatedAt: bench.generatedAt,
        provisional: !!bench.provisional,
      },
      users: { control: control.username, candidate: candidate.username },
      userIds: { control: String(control.id), candidate: String(candidate.id) },
      build: { git: gitProvenance() },
      preflightProblems: problems,
      entries: [],
      events: [],
      watch: { polls: 0, startedAt: null, endedAt: null, exitReason: null, lastTick: null, maxPollLagTicks: 0 },
    };
  }

  console.log("");
  for (const job of jobs) {
    const existing = ledger.entries.find((e) => e.slot === job.slot && e.side === job.side);
    if (existing && existing.seedOk) {
      console.log(`  ${job.slot} ${job.side.padEnd(9)} ${job.room.padEnd(7)} already seeded at tick ${existing.seedTick} — skipping`);
      continue;
    }
    let seedTick = null;
    if (opts.fixture) {
      seedTick = world.gameTime ?? null; // fixtures stay deterministic — no live clock
    } else {
      try {
        seedTick = await api.gameTime();
      } catch (e) {
        warn(`could not read game time before seeding ${job.room}: ${e.message}`);
        seedTick = world.gameTime ?? null;
      }
    }

    let ok = false;
    let output = "";
    if (opts.fixture) {
      ok = true;
      output = "fixture mode: spawn-in.mjs not invoked";
    } else {
      const args = [opts.spawnIn, job.room, "--user", job.user.username];
      if (dryRun) args.push("--dry-run");
      const r = spawnSync(process.execPath, args, { cwd: REPO, encoding: "utf8" });
      output = ((r.stdout || "") + (r.stderr || "")).trim();
      ok = r.status === 0;
    }
    console.log(
      `  ${job.slot} ${job.side.padEnd(9)} ${job.room.padEnd(7)} ${job.user.username.padEnd(14)} ` +
        `tick ${seedTick ?? "?"} ${ok ? "OK" : "FAILED"}`,
    );
    if (!ok) console.log(output.split(/\r?\n/).map((l) => "        " + l).join("\n"));

    if (dryRun) continue;

    const entry = existing || {
      slot: job.slot,
      band: job.band,
      side: job.side,
      user: job.user.username,
      room: job.room,
      profile: job.profile
        ? {
            hardness: job.profile.hardness,
            srcStepsSum: job.profile.srcStepsSum,
            ctrlSteps: job.profile.ctrlSteps,
            anchorDt: job.profile.anchor ? job.profile.anchor.dt : null,
            anchorSpace: job.profile.anchor ? job.profile.anchor.space : null,
            minSourceFree: job.profile.minSourceFree,
            swampPct: job.profile.swampPct,
            openPct: job.profile.openPct,
            terrainHash: job.profile.terrainHash,
          }
        : null,
      seedTick: null,
      seededAt: null,
      seedOk: false,
      milestones: {},
      final: null,
    };
    entry.room = job.room;
    entry.user = job.user.username;
    entry.seedTick = seedTick;
    entry.seededAt = nowIso();
    entry.seedOk = ok;
    if (!ok) entry.seedError = output.slice(0, 500);
    if (!existing) ledger.entries.push(entry);
    ledger.events.push({
      at: nowIso(),
      tick: seedTick,
      type: ok ? "seed" : "seed-failed",
      slot: job.slot,
      side: job.side,
      room: job.room,
      user: job.user.username,
    });
  }

  if (dryRun) {
    console.log(`\n--dry-run: ledger ${rel(file)} not written.`);
    return;
  }
  ledger.entries.sort((a, b) => (a.slot === b.slot ? a.side.localeCompare(b.side) : a.slot.localeCompare(b.slot)));
  saveLedger(file, ledger);
  const seeded = ledger.entries.filter((e) => e.seedOk).length;
  console.log(`\nledger ${rel(file)} — ${seeded}/${ledger.entries.length} entries seeded.`);
  console.log(`next: fnm exec --using 22 node tools/server/race.mjs --watch --run ${runId}`);
}

// ---------------------------------------------------------------- mode: --watch
async function modeWatch(opts, flags) {
  const file = flags.ledger && flags.ledger !== true
    ? path.resolve(String(flags.ledger))
    : flags.run && flags.run !== true
      ? ledgerPath(opts, String(flags.run))
      : newestLedger(opts.ledgerDir);
  if (!file || !fs.existsSync(file)) die(`no ledger to watch (looked in ${rel(opts.ledgerDir)}) — run --seed first`);
  const ledger = readJson(file);
  if (ledger.schemaVersion !== 1) die(`ledger schemaVersion ${ledger.schemaVersion} unsupported`);

  const targetRcl = num(flags["target-rcl"], ledger.targetRcl ?? D.targetRcl);
  const tickBudget = num(flags["tick-budget"], ledger.tickBudget ?? D.tickBudget);
  const intervalMs = Math.max(1, num(flags.interval, D.intervalSec)) * 1000;
  const maxWallMs = flags["max-wall"] === undefined ? Infinity : num(flags["max-wall"], Infinity) * 1000;
  const once = !!flags.once;
  const trace = !!flags.trace;
  const milestones = (ledger.milestones || D.milestones).filter((m) => m >= 2).sort((a, b) => a - b);

  const live = ledger.entries.filter((e) => e.seedOk);
  if (!live.length) die("ledger has no successfully seeded entries");

  // fixture: a scripted stream of polls, consumed one per iteration
  let fixturePolls = null;
  if (opts.fixture) {
    const fx = readJson(opts.fixture);
    if (!fx.polls) die(`fixture ${opts.fixture} has no "polls" array (needed by --watch)`);
    fixturePolls = fx.polls.slice();
  }
  const api = makeApi(opts);

  const seedTicks = live.map((e) => e.seedTick).filter((t) => typeof t === "number");
  const firstSeed = seedTicks.length ? Math.min(...seedTicks) : null;

  ledger.watch = ledger.watch || { polls: 0, maxPollLagTicks: 0 };
  if (!ledger.watch.startedAt) ledger.watch.startedAt = nowIso();
  ledger.watch.endedAt = null;
  ledger.watch.exitReason = null;

  console.log(`ledger      : ${rel(file)} (${ledger.runId})`);
  console.log(`entries     : ${live.length} · target RCL${targetRcl} · budget ${tickBudget} ticks · poll ${intervalMs / 1000}s`);
  console.log(`users       : control=${ledger.users.control} candidate=${ledger.users.candidate}${ledger.swap ? " (swapped)" : ""}`);
  console.log("");

  const startWall = Date.now();
  let prevTick = ledger.watch.lastTick ?? null;
  let exitReason = null;

  const done = (e) => {
    const top = milestones.filter((m) => m <= targetRcl).pop() ?? targetRcl;
    return e.milestones && e.milestones[String(top)] !== undefined;
  };

  while (true) {
    let tick;
    let levels = new Map();
    if (fixturePolls) {
      const poll = fixturePolls.shift();
      if (!poll) {
        exitReason = "fixture-exhausted";
        break;
      }
      tick = poll.time;
      for (const [room, v] of Object.entries(poll.rooms || {})) {
        levels.set(room, { level: v.level || 0, user: v.user ?? null, spawns: v.spawns ?? null, creeps: v.creeps ?? null });
      }
    } else {
      try {
        tick = await api.gameTime();
      } catch (e) {
        warn(`game time poll failed: ${e.message}`);
        if (once) {
          exitReason = "api-error";
          break;
        }
        await sleep(intervalMs);
        continue;
      }
      const rooms = [...new Set(live.map((e) => e.room))];
      const results = await mapLimit(rooms, 6, async (room) => {
        try {
          return await api.controller(room);
        } catch (e) {
          warn(`room-objects poll failed for ${room}: ${e.message}`);
          return null;
        }
      });
      for (const r of results) if (r) levels.set(r.room, r);
    }

    const lag = prevTick === null ? null : tick - prevTick;
    if (lag !== null && lag > (ledger.watch.maxPollLagTicks || 0)) ledger.watch.maxPollLagTicks = lag;
    ledger.watch.polls = (ledger.watch.polls || 0) + 1;
    ledger.watch.lastTick = tick;

    let changed = false;
    for (const e of live) {
      const obs = levels.get(e.room);
      if (!obs) continue;
      e.lastSeen = { tick, level: obs.level, spawns: obs.spawns ?? null, creeps: obs.creeps ?? null };
      if (typeof e.seedTick !== "number") continue;
      for (const m of milestones) {
        if (obs.level < m) continue;
        const key = String(m);
        if (e.milestones[key] !== undefined) continue; // first observation wins — never overwritten
        e.milestones[key] = {
          tick,
          priorTick: prevTick,
          elapsed: tick - e.seedTick,
          // the crossing is somewhere in (priorTick, tick]; this is the width of that window
          uncertaintyTicks: prevTick === null ? null : tick - prevTick,
        };
        ledger.events.push({
          at: nowIso(),
          tick,
          type: "rcl",
          slot: e.slot,
          side: e.side,
          room: e.room,
          level: m,
          elapsed: tick - e.seedTick,
        });
        changed = true;
        console.log(
          `  tick ${String(tick).padStart(9)}  ${e.slot} ${e.side.padEnd(9)} ${e.room.padEnd(7)} ` +
            `RCL${m} @ +${tick - e.seedTick} ticks`,
        );
      }
    }
    if (trace) {
      ledger.events.push({
        at: nowIso(),
        tick,
        type: "poll",
        levels: Object.fromEntries([...levels].map(([r, v]) => [r, v.level])),
      });
      changed = true;
    }
    prevTick = tick;

    const remaining = live.filter((e) => !done(e));
    const elapsedTicks = firstSeed === null ? null : tick - firstSeed;
    if (changed || ledger.watch.polls % 20 === 0) saveLedger(file, ledger);

    if (!remaining.length) {
      exitReason = "all-reached-target";
      break;
    }
    if (elapsedTicks !== null && elapsedTicks >= tickBudget) {
      exitReason = "tick-budget";
      break;
    }
    if (Date.now() - startWall >= maxWallMs) {
      exitReason = "max-wall";
      break;
    }
    if (once) {
      exitReason = "once";
      break;
    }
    if (!fixturePolls) await sleep(intervalMs); // fixtures replay instantly
  }

  // finalise: everything that never reached the target is explicitly censored
  const finalTick = ledger.watch.lastTick;
  for (const e of live) {
    if (done(e)) {
      e.final = e.final || { reason: "reached-target", tick: finalTick, level: e.lastSeen ? e.lastSeen.level : null };
    } else if (exitReason === "tick-budget" || exitReason === "fixture-exhausted") {
      e.final = {
        reason: "censored",
        cause: exitReason,
        tick: finalTick,
        level: e.lastSeen ? e.lastSeen.level : null,
      };
    }
  }
  ledger.watch.endedAt = nowIso();
  ledger.watch.exitReason = exitReason;
  ledger.events.push({ at: nowIso(), tick: finalTick, type: "watch-end", reason: exitReason });
  saveLedger(file, ledger);

  console.log("");
  console.log(`exit        : ${exitReason} at tick ${finalTick} after ${ledger.watch.polls} polls`);
  console.log(`max poll lag: ${ledger.watch.maxPollLagTicks} ticks (milestone ticks are upper bounds within this window)`);
  console.log(`ledger      : ${rel(file)}`);
  const reached = live.filter(done).length;
  console.log(`reached RCL${targetRcl}: ${reached}/${live.length}`);
  console.log(`next: fnm exec --using 22 node tools/server/race.mjs --report --run ${ledger.runId}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------- mode: --report
async function modeReport(opts, flags) {
  let files;
  if (flags.ledger && flags.ledger !== true) files = list(flags.ledger).map((p) => path.resolve(p));
  else if (flags.run && flags.run !== true) files = list(flags.run).map((r) => ledgerPath(opts, r));
  else files = listLedgers(opts.ledgerDir);
  files = files.filter((f) => fs.existsSync(f));
  if (!files.length) die(`no ledgers found (looked in ${rel(opts.ledgerDir)})`);

  let ledgers = files.map((f) => ({ file: f, ...readJson(f) }));
  if (flags.label && flags.label !== true) ledgers = ledgers.filter((l) => l.label === String(flags.label));
  if (flags["target-rcl"] !== undefined) {
    const t = num(flags["target-rcl"], null);
    ledgers = ledgers.filter((l) => l.targetRcl === t);
  }
  if (!ledgers.length) die("no ledgers matched the filters");

  const milestones = flags.milestones && flags.milestones !== true
    ? list(flags.milestones).map(Number)
    : [...new Set(ledgers.flatMap((l) => l.milestones || D.milestones))].sort((a, b) => a - b);

  console.log(`ledgers     : ${ledgers.length}`);
  for (const l of ledgers) {
    console.log(
      `  ${l.runId}  target RCL${l.targetRcl}  ${l.swap ? "swap " : "     "}` +
        `${(l.label || "(no label)").padEnd(24)} git ${(l.build?.git?.head || "?").slice(0, 8)}` +
        `${l.build?.git?.dirty ? "+dirty" : ""}  exit=${l.watch?.exitReason ?? "?"}`,
    );
  }

  // ---- per-side raw samples, per milestone
  const summary = {
    generatedAt: nowIso(),
    ledgers: ledgers.map((l) => ({ runId: l.runId, file: rel(l.file), label: l.label, swap: !!l.swap, targetRcl: l.targetRcl })),
    milestones: {},
  };

  const sideSamples = {}; // milestone -> side -> [{runId, slot, room, elapsed}]
  const censored = {}; // milestone -> side -> count
  for (const m of milestones) {
    sideSamples[m] = { control: [], candidate: [] };
    censored[m] = { control: 0, candidate: 0 };
  }
  for (const l of ledgers) {
    for (const e of l.entries || []) {
      if (!e.seedOk) continue;
      for (const m of milestones) {
        const rec = e.milestones ? e.milestones[String(m)] : undefined;
        if (rec && typeof rec.elapsed === "number") {
          sideSamples[m][e.side]?.push({ runId: l.runId, slot: e.slot, room: e.room, band: e.band, elapsed: rec.elapsed, uncertainty: rec.uncertaintyTicks ?? null });
        } else {
          if (censored[m][e.side] !== undefined) censored[m][e.side]++;
        }
      }
    }
  }

  // ---- paired deltas (same slot, same run, candidate - control)
  const pairDeltas = {}; // milestone -> [{runId, slot, delta, swap}]
  for (const m of milestones) pairDeltas[m] = [];
  for (const l of ledgers) {
    const bySlot = new Map();
    for (const e of l.entries || []) {
      if (!e.seedOk) continue;
      const s = bySlot.get(e.slot) || {};
      s[e.side] = e;
      bySlot.set(e.slot, s);
    }
    for (const [slot, s] of [...bySlot].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (!s.control || !s.candidate) continue;
      for (const m of milestones) {
        const c = s.control.milestones?.[String(m)];
        const k = s.candidate.milestones?.[String(m)];
        if (!c || !k) continue;
        pairDeltas[m].push({
          runId: l.runId,
          slot,
          band: s.control.band,
          swap: !!l.swap,
          control: c.elapsed,
          candidate: k.elapsed,
          delta: k.elapsed - c.elapsed,
        });
      }
    }
  }

  const runsPerSide = new Set(ledgers.map((l) => l.runId)).size;

  for (const m of milestones) {
    const ctrl = sideSamples[m].control.map((s) => s.elapsed);
    const cand = sideSamples[m].candidate.map((s) => s.elapsed);
    if (!ctrl.length && !cand.length) continue;

    const stat = (a) => ({
      n: a.length,
      mean: a.length ? round(mean(a), 1) : null,
      median: a.length ? round(median(a), 1) : null,
      min: a.length ? Math.min(...a) : null,
      max: a.length ? Math.max(...a) : null,
      spread: a.length ? Math.max(...a) - Math.min(...a) : null,
      sd: a.length > 1 ? round(stddev(a), 1) : null,
    });
    const sC = stat(ctrl);
    const sK = stat(cand);

    const deltas = pairDeltas[m].map((d) => d.delta);
    const dMean = deltas.length ? mean(deltas) : null;
    const dSd = deltas.length > 1 ? stddev(deltas) : null;
    const dSe = dSd !== null ? dSd / Math.sqrt(deltas.length) : null;
    const baseline = sC.mean;
    const pct = dMean !== null && baseline ? (dMean / baseline) * 100 : null;

    // swap-balanced delta: mean of the two orientations, cancelling pair bias
    const orient = { normal: deltas.length ? pairDeltas[m].filter((d) => !d.swap).map((d) => d.delta) : [], swapped: pairDeltas[m].filter((d) => d.swap).map((d) => d.delta) };
    const balanced =
      orient.normal.length && orient.swapped.length ? (mean(orient.normal) + mean(orient.swapped)) / 2 : null;

    let verdict;
    if (!deltas.length) verdict = "NO PAIRED DATA";
    else if (censored[m].control !== censored[m].candidate)
      verdict = `UNCOMPARABLE — censoring differs (control ${censored[m].control} vs candidate ${censored[m].candidate} rooms never reached RCL${m}); the completer means are biased`;
    else if (runsPerSide < 3) verdict = `INSUFFICIENT RUNS — ${runsPerSide} run(s), the campaign requires N >= 3 per side`;
    else if (pct !== null && Math.abs(pct) < 1) verdict = "WITHIN THE 1% BAR — not a win";
    else if (dSe !== null && Math.abs(dMean) <= 2 * dSe) verdict = "WITHIN NOISE — |Δ| <= 2·SE";
    else if (dMean < 0) verdict = "CANDIDATE FASTER";
    else verdict = "CANDIDATE SLOWER";
    if (deltas.length && !orient.normal.length !== !orient.swapped.length)
      verdict += " · single orientation only — run half the runs with --swap to cancel pair bias";

    console.log("");
    console.log(`=== RCL${m} (ticks from spawn placement) ===`);
    console.log(
      `  control   n=${String(sC.n).padStart(3)} mean ${String(sC.mean ?? "-").padStart(8)} median ${String(sC.median ?? "-").padStart(8)} ` +
        `min ${String(sC.min ?? "-").padStart(7)} worst ${String(sC.max ?? "-").padStart(7)} spread ${String(sC.spread ?? "-").padStart(7)} sd ${String(sC.sd ?? "-").padStart(7)} censored ${censored[m].control}`,
    );
    console.log(
      `  candidate n=${String(sK.n).padStart(3)} mean ${String(sK.mean ?? "-").padStart(8)} median ${String(sK.median ?? "-").padStart(8)} ` +
        `min ${String(sK.min ?? "-").padStart(7)} worst ${String(sK.max ?? "-").padStart(7)} spread ${String(sK.spread ?? "-").padStart(7)} sd ${String(sK.sd ?? "-").padStart(7)} censored ${censored[m].candidate}`,
    );
    if (deltas.length) {
      console.log(
        `  paired Δ  n=${String(deltas.length).padStart(3)} mean ${round(dMean, 1)} ticks (${pct === null ? "?" : round(pct, 2)}%) ` +
          `median ${round(median(deltas), 1)} sd ${dSd === null ? "-" : round(dSd, 1)} SE ${dSe === null ? "-" : round(dSe, 1)}` +
          (balanced !== null ? ` · swap-balanced ${round(balanced, 1)}` : ""),
      );
    }
    console.log(`  verdict   ${verdict}`);
    // worst room per side — a win that only helps easy rooms is a partial win
    for (const side of ["control", "candidate"]) {
      const s = sideSamples[m][side];
      if (!s.length) continue;
      const worst = s.reduce((a, b) => (b.elapsed > a.elapsed ? b : a));
      const byBand = {};
      for (const x of s) (byBand[x.band || "?"] = byBand[x.band || "?"] || []).push(x.elapsed);
      console.log(
        `  ${side.padEnd(9)} worst ${worst.room} (${worst.slot}) ${worst.elapsed} ticks · by band ` +
          Object.keys(byBand).sort().map((b) => `${b} ${round(mean(byBand[b]), 0)}`).join(" / "),
      );
    }
    if (pairDeltas[m].length) {
      console.log("  per-slot:");
      for (const d of pairDeltas[m]) {
        console.log(
          `    ${d.runId} ${d.slot} ${(d.band || "?").padEnd(7)}${d.swap ? " swap" : "     "} ` +
            `control ${String(d.control).padStart(6)}  candidate ${String(d.candidate).padStart(6)}  Δ ${String(d.delta).padStart(6)}`,
        );
      }
    }

    summary.milestones[m] = {
      control: sC,
      candidate: sK,
      censored: censored[m],
      pairedDelta: {
        n: deltas.length,
        mean: dMean === null ? null : round(dMean, 2),
        median: deltas.length ? round(median(deltas), 2) : null,
        sd: dSd === null ? null : round(dSd, 2),
        se: dSe === null ? null : round(dSe, 2),
        pctOfControl: pct === null ? null : round(pct, 3),
        swapBalanced: balanced === null ? null : round(balanced, 2),
        orientations: { normal: orient.normal.length, swapped: orient.swapped.length },
      },
      runs: runsPerSide,
      verdict,
      samples: { control: sideSamples[m].control, candidate: sideSamples[m].candidate },
      pairs: pairDeltas[m],
    };
  }

  console.log("");
  console.log(
    `noise honesty: milestone ticks are the first POLL that saw the level, so each is an upper ` +
      `bound within its poll window (max lag ${Math.max(0, ...ledgers.map((l) => l.watch?.maxPollLagTicks || 0))} ticks).`,
  );

  if (flags.out && flags.out !== true) {
    const p = path.resolve(String(flags.out));
    atomicWrite(p, JSON.stringify(summary, null, 2) + "\n");
    console.log(`summary -> ${rel(p)}`);
  } else if (flags.json) {
    console.log(JSON.stringify(summary, null, 2));
  }
}

// ---------------------------------------------------------------- main
async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help || Object.keys(flags).length === 0) {
    console.log(USAGE);
    process.exit(Object.keys(flags).length === 0 ? 1 : 0);
  }
  const modes = ["pick", "seed", "watch", "report"].filter((m) => flags[m]);
  if (modes.length !== 1) die(`pass exactly one mode: --pick | --seed | --watch | --report (got ${modes.length})`);

  const opts = {
    mongoContainer: flags["mongo-container"] && flags["mongo-container"] !== true ? String(flags["mongo-container"]) : D.mongoContainer,
    mongoDb: flags["mongo-db"] && flags["mongo-db"] !== true ? String(flags["mongo-db"]) : D.mongoDb,
    api: (flags.api && flags.api !== true ? String(flags.api) : D.api).replace(/\/+$/, ""),
    shard: flags.shard && flags.shard !== true ? String(flags.shard) : D.shard,
    benchmarks: flags.benchmarks && flags.benchmarks !== true ? path.resolve(String(flags.benchmarks)) : D.benchmarks,
    ledgerDir: flags["ledger-dir"] && flags["ledger-dir"] !== true ? path.resolve(String(flags["ledger-dir"])) : D.ledgerDir,
    plans: flags.plans && flags.plans !== true ? path.resolve(String(flags.plans)) : D.plans,
    spawnIn: D.spawnIn,
    controlUser: flags["control-user"] && flags["control-user"] !== true ? String(flags["control-user"]) : D.controlUser,
    candidateUser: flags["candidate-user"] && flags["candidate-user"] !== true ? String(flags["candidate-user"]) : D.candidateUser,
    fixture: flags.fixture && flags.fixture !== true ? path.resolve(String(flags.fixture)) : null,
  };
  if (opts.fixture && !fs.existsSync(opts.fixture)) die(`fixture not found: ${opts.fixture}`);

  const mode = modes[0];
  if (mode === "pick") await modePick(opts, flags);
  else if (mode === "seed") await modeSeed(opts, flags);
  else if (mode === "watch") await modeWatch(opts, flags);
  else await modeReport(opts, flags);
}

main().catch((e) => {
  console.error("ERROR: " + (e && e.stack ? e.stack : e));
  process.exit(1);
});
