/**
 * Push a plan animation into the bot's RawMemory segments on a Screeps server.
 *
 *   node tools/server/push-anim.mjs E2S7
 *   node tools/server/push-anim.mjs E2S7 --speed 0.2      (1 step / 5 ticks)
 *   node tools/server/push-anim.mjs E2S7 --dest pserver --no-play
 *   node tools/server/push-anim.mjs E11S5 --user pacifist (push as another user)
 *   node tools/server/push-anim.mjs E2S7 --no-loop        (single pass)
 *
 * Private servers can run 20+ ticks/sec, which replays 135 steps in seconds —
 * use a fractional --speed to make it watchable. Playback LOOPS by default;
 * --no-loop restores the old play-once-then-stop behaviour.
 *
 * --- WHICH USER? (this is why you may "see no animation") -------------------
 * RoomVisuals are per-user: only the account that DREW them can see them. The
 * animation is drawn by the bot code of whichever user owns the API token, so
 * pushing as `pacifist-race` and then watching the world logged in as
 * `pacifist` shows an empty room.
 *
 * `--user <username>` pushes as that user instead of the token in screeps.json:
 *   1. resolves username -> userId in mongo,
 *   2. scans redis `auth_*` keys for one that already maps to that userId,
 *   3. if none exists, CREATES a permanent one:
 *        redis-cli set auth_local-<username>-token-<timestamp> <userId>
 *      (no expiry => ttl -1 => never rotated away, see auth note below),
 *   4. uses it for the segment writes and the console `animPlan(...)` call.
 * Container names default to the local-screeps-server compose project and can
 * be overridden with --redis <name> / --mongo <name> / --db <name>.
 *
 * The target user must also be RUNNING this bot's code (their users.code
 * `main` branch has to contain the PlanAnimator module), otherwise nothing
 * reads the segments. Check with:
 *   docker exec <mongo> mongosh --quiet --eval 'db.getSiblingDB("screeps") \
 *     ["users.code"].find({branch:"main"}).forEach(r=>print(r.user+" "+ \
 *     (JSON.stringify(r.modules).indexOf("PlanAnimator")>=0)))'
 *
 * Reads tools/plan-suite/out-v2/anim/<room>.json (see v2/export-anim.mjs),
 * splits it across data segments 90..99 and writes an index to segment 89:
 *   { room, segments: [90, ...], totalLen, chunks: [len, ...] }
 *
 * Then fires `animPlan("<room>")` on the console so the in-game player
 * (src/utils/PlanAnimator.ts) starts replaying it.
 *
 * --- server auth note -------------------------------------------------------
 * The private server keeps API tokens in redis as `auth_<token> -> userId`.
 * @screeps/backend's authlib.checkToken only refreshes the TTL when it is
 * already > 100, so a key stored with NO expiry (ttl === -1) is permanent.
 * That is what the static token in screeps.json relies on. If auth starts
 * failing with {"error":"unauthorized"} the redis key is simply gone; recreate:
 *   docker exec <redis> redis-cli set auth_<token> <userId>
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..", "..");

const INDEX_SEGMENT = 89;
const FIRST_DATA_SEGMENT = 90;
const LAST_DATA_SEGMENT = 99;
// Screeps segments hold 100KB; leave headroom for multi-byte chars.
const CHUNK = 90000;

function loadConfig(dest) {
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8"))[dest];
  if (!cfg) throw new Error(`no "${dest}" entry in screeps.json`);
  const port = cfg.port ? `:${cfg.port}` : "";
  const base = `${cfg.protocol || "http"}://${cfg.hostname}${port}${cfg.path || "/"}`.replace(/\/+$/, "");
  return { base, token: cfg.token };
}

/* --- redis/mongo helpers, used only by --user ----------------------------- */

function docker(container, argv) {
  return execFileSync("docker", ["exec", container, ...argv], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

const redis = (container, argv) => docker(container, ["redis-cli", ...argv]);
const mongoEval = (container, db, js) =>
  docker(container, ["mongosh", "--quiet", "--eval", `const d=db.getSiblingDB(${JSON.stringify(db)});${js}`]);

/**
 * Resolve a username to a working API token, minting a permanent one in redis
 * if the user has none. Returns { token, userId }.
 */
function tokenForUser(username, opts) {
  const { redisContainer, mongoContainer, db } = opts;
  const userId = mongoEval(
    mongoContainer,
    db,
    `const u=d.users.findOne({username:${JSON.stringify(username)}},{_id:1});print(u?String(u._id):"")`
  );
  if (!userId) throw new Error(`no user named "${username}" in mongo (${db}.users)`);

  const keys = redis(redisContainer, ["--scan", "--pattern", "auth_*"])
    .split("\n")
    .map((k) => k.trim())
    .filter(Boolean);
  const mine = keys
    .filter((key) => redis(redisContainer, ["get", key]) === userId)
    .map((key) => ({ key, ttl: Number(redis(redisContainer, ["ttl", key])) }))
    // ttl -1 == no expiry; an expiring key is just a browser session that will vanish
    .sort((a, b) => (a.ttl === -1 ? -1 : b.ttl === -1 ? 1 : b.ttl - a.ttl));
  if (mine.length) {
    const { key, ttl } = mine[0];
    console.log(`--user ${username} (${userId}): reusing ${key}${ttl > 0 ? ` (expires in ${ttl}s)` : ""}`);
    return { token: key.slice("auth_".length), userId };
  }

  const token = `local-${username}-token-${Date.now()}`;
  redis(redisContainer, ["set", `auth_${token}`, userId]);
  console.log(`--user ${username} (${userId}): created permanent token auth_${token}`);
  return { token, userId };
}

async function api(cfg, method, endpoint, body) {
  const res = await fetch(cfg.base + endpoint, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Token": cfg.token,
      "X-Username": cfg.token,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${endpoint} -> ${res.status} non-JSON: ${text.slice(0, 200)}`);
  }
  if (!res.ok || json.error) {
    throw new Error(`${method} ${endpoint} -> ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json;
}

const setSegment = (cfg, segment, data) =>
  api(cfg, "POST", "/api/user/memory-segment", { segment, data });
const getSegment = (cfg, segment) =>
  api(cfg, "GET", `/api/user/memory-segment?segment=${segment}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Write a segment and make sure it stuck.
 *
 * The runtime saves its own copy of every ACTIVE segment back to the database
 * at the end of each tick. Push while an animation is playing and the bot's
 * stale in-memory copy silently overwrites what we just uploaded — the index
 * (segment 89, not active once loaded) updates but the data (90..) does not,
 * so the player loads the PREVIOUS room's frames forever. Verify and retry.
 */
async function writeSegment(cfg, segment, data, tries = 6) {
  for (let i = 1; i <= tries; i++) {
    await setSegment(cfg, segment, data);
    await sleep(500);
    const cur = await getSegment(cfg, segment);
    if ((cur.data || "") === data) return;
    console.log(
      `  segment ${segment} was clobbered by the running bot (${(cur.data || "").length}/${data.length} bytes) — retry ${i}`
    );
    await sleep(1500);
  }
  throw new Error(`segment ${segment} would not stick — run animStop() in the console and retry`);
}

function splitChunks(json) {
  const chunks = [];
  for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK));
  return chunks;
}

async function main() {
  const argv = process.argv.slice(2);
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) {
      args.push(argv[i]);
    } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
      flags[argv[i]] = argv[++i];
    } else {
      flags[argv[i]] = true;
    }
  }
  const flag = (name, fallback) => (flags[name] === undefined ? fallback : flags[name]);
  const room = args[0];
  if (!room) {
    console.error(
      "usage: node tools/server/push-anim.mjs <room> [--dest pserver] [--user <username>]\n" +
        "                                    [--speed 0.2] [--no-loop] [--no-play]"
    );
    process.exit(1);
  }
  const dest = flag("--dest", "pserver");
  const speed = Number(flag("--speed", "1"));
  const loop = !flags["--no-loop"];
  const cfg = loadConfig(dest);

  if (flags["--user"] && flags["--user"] !== true) {
    const { token } = tokenForUser(String(flags["--user"]), {
      redisContainer: flag("--redis", "local-screeps-server-redis-1"),
      mongoContainer: flag("--mongo", "local-screeps-server-mongo-1"),
      db: flag("--db", "screeps"),
    });
    cfg.token = token;
  }

  const file = path.join(REPO, "tools", "plan-suite", "out-v2", "anim", `${room}.json`);
  if (!fs.existsSync(file)) {
    console.error(`missing ${file}\n  run: node tools/plan-suite/v2/export-anim.mjs ${room}`);
    process.exit(1);
  }
  const json = fs.readFileSync(file, "utf8");
  const chunks = splitChunks(json);
  const capacity = LAST_DATA_SEGMENT - FIRST_DATA_SEGMENT + 1;
  if (chunks.length > capacity) {
    console.error(`animation needs ${chunks.length} segments, only ${capacity} available (90..99)`);
    process.exit(1);
  }

  const who = await api(cfg, "GET", "/api/auth/me");
  console.log(`server ${cfg.base} as ${who.username} (${who._id})`);

  // Park any running playback and drop its active-segment list first, so the
  // runtime is not holding a stale copy it will write back over our upload.
  await api(cfg, "POST", "/api/user/console", {
    expression: "try{animStop()}catch(e){};RawMemory.setActiveSegments([])",
  });
  await sleep(1500);

  const segments = [];
  for (let i = 0; i < chunks.length; i++) {
    const seg = FIRST_DATA_SEGMENT + i;
    await writeSegment(cfg, seg, chunks[i]);
    segments.push(seg);
    console.log(`  segment ${seg} <- ${chunks[i].length} bytes`);
  }
  // clear any stale tail from a previous, longer animation
  for (let seg = FIRST_DATA_SEGMENT + chunks.length; seg <= LAST_DATA_SEGMENT; seg++) {
    const cur = await getSegment(cfg, seg);
    if (cur.data) {
      await writeSegment(cfg, seg, "");
      console.log(`  segment ${seg} cleared (stale)`);
    }
  }

  const index = { room, segments, totalLen: json.length, chunks: chunks.map((c) => c.length) };
  await writeSegment(cfg, INDEX_SEGMENT, JSON.stringify(index));
  console.log(`  segment ${INDEX_SEGMENT} <- index ${JSON.stringify(index)}`);

  const verify = await getSegment(cfg, INDEX_SEGMENT);
  if (verify.data !== JSON.stringify(index)) throw new Error("index verify failed");
  console.log("index verified");

  const command =
    speed === 1 && loop ? `animPlan("${room}")` : `animPlan("${room}", ${speed}, ${loop})`;
  if (flags["--no-play"]) {
    console.log(`\nrun this in the Screeps console:\n  ${command}`);
    return;
  }
  await api(cfg, "POST", "/api/user/console", { expression: command });
  console.log(`\nsent to console: ${command}`);
  console.log(`stop with: animStop()`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
