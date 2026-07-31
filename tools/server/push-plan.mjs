/**
 * Push a v2 plan into memory segment 88 so the bot can adopt it.
 *
 *   node tools/server/push-plan.mjs E11S2 [--dest pserver] [--user <username>] [--adopt]
 *
 * Reads tools/plan-suite/out-v2/plans-hub.json (run plan.mjs first).
 * With --adopt, also sends `adoptPlan("<room>")` to the user's console.
 * --user resolves/mints a redis API token for that user (plans live in
 * per-user segments, so push as the user whose bot will build).
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..", "..");
const SEGMENT = 88;

function loadConfig(dest) {
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8"))[dest];
  if (!cfg) throw new Error(`no "${dest}" in screeps.json`);
  const port = cfg.port ? `:${cfg.port}` : "";
  const base = `${cfg.protocol || "http"}://${cfg.hostname}${port}${cfg.path || "/"}`.replace(/\/+$/, "");
  return { base, token: cfg.token };
}

function redis(argv) {
  return execFileSync("docker", ["exec", "local-screeps-server-redis-1", "redis-cli", ...argv], {
    encoding: "utf8",
  }).trim();
}
function mongoEval(js) {
  return execFileSync(
    "docker",
    ["exec", "local-screeps-server-mongo-1", "mongosh", "--quiet", "--eval", js],
    { encoding: "utf8" },
  ).trim();
}

function tokenForUser(username) {
  const userId = mongoEval(
    `db = db.getSiblingDB("screeps"); var u = db.users.findOne({username: ${JSON.stringify(username)}}); print(u ? String(u._id) : "")`,
  );
  if (!userId) throw new Error(`user ${username} not found`);
  for (const key of redis(["keys", "auth_*"]).split("\n").filter(Boolean)) {
    if (redis(["get", key]) === userId) return { token: key.slice("auth_".length), userId };
  }
  const token = `local-${username}-token-${Date.now()}`;
  redis(["set", `auth_${token}`, userId]);
  console.log(`minted permanent token for ${username}: auth_${token}`);
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
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok !== 1) throw new Error(`${method} ${endpoint}: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

async function main() {
  const args = process.argv.slice(2);
  const room = args.find((a) => !a.startsWith("--"));
  if (!room) {
    console.error("usage: node tools/server/push-plan.mjs <room> [--dest pserver] [--user <name>] [--adopt]");
    process.exit(1);
  }
  const dest = args.includes("--dest") ? args[args.indexOf("--dest") + 1] : "pserver";
  const cfg = loadConfig(dest);
  if (args.includes("--user")) {
    cfg.token = tokenForUser(args[args.indexOf("--user") + 1]).token;
  }

  const plansPath = path.join(REPO, "tools", "plan-suite", "out-v2", "plans-hub.json");
  const plans = JSON.parse(fs.readFileSync(plansPath, "utf8"));
  const plan = plans.find((p) => p.room === room);
  if (!plan || !plan.structures) {
    console.error(`${room} not in plans-hub.json — run: node tools/plan-suite/v2/plan.mjs --all-claimable`);
    process.exit(1);
  }

  // djb2 over the structure list — a cheap "is the room building the plan I
  // am looking at?" marker. The bot stores it in room.memory.planV2.h and
  // logs old->new on re-adoption, so a stale in-game plan is visible instead
  // of silently diverging from out-v2/plans-hub.json.
  const structuresJson = JSON.stringify(plan.structures);
  let hash = 5381;
  for (let i = 0; i < structuresJson.length; i++) {
    hash = ((hash * 33) ^ structuresJson.charCodeAt(i)) >>> 0;
  }

  const payload = {
    room,
    structures: plan.structures,
    sitter: plan.sitter,
    labInputs: plan.labInputs,
    // the min-cut wall RING only (never the bubbles) — this is the defence
    // perimeter every legacy consumer reads
    shellCut: (plan.meta && plan.meta.shell && plan.meta.shell.cut) || [],
    planHash: hash.toString(36),
    pushedAt: Date.now(),
  };
  const data = JSON.stringify(payload);
  if (data.length > 100 * 1024) throw new Error(`plan too big for one segment: ${data.length}`);
  await api(cfg, "POST", "/api/user/memory-segment", { segment: SEGMENT, data });
  const back = await api(cfg, "GET", `/api/user/memory-segment?segment=${SEGMENT}`);
  if (!back.data || JSON.parse(back.data).room !== room) throw new Error("segment verify failed");
  console.log(
    `plan for ${room} -> segment ${SEGMENT} (${data.length} bytes) hash ${payload.planHash} ` +
      `shellCut ${payload.shellCut.length} labInputs ${(payload.labInputs || []).length} ok`,
  );

  if (args.includes("--adopt")) {
    await api(cfg, "POST", "/api/user/console", { expression: `adoptPlan("${room}")` });
    console.log(`sent: adoptPlan("${room}")`);
  } else {
    console.log(`in the game console run: adoptPlan("${room}")`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
